import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STORYTELLER_ENGINE_VERSION,
  assessCandidateTake,
  createGenerationJobs,
  createProjectManifest,
  rankProviders,
  type CreateProjectInput,
  type ProjectManifest,
  type ProviderProfile,
  type ProviderRequirements,
  type TakeObservation,
} from "@evavo/storyteller-engine";
import {
  GenerationQueueConflictError,
  type FileGenerationQueue,
  type GenerationQueueStatus,
} from "@evavo/storyteller-engine/generation-queue";
import {
  createGenerationQueueRuntime,
  generationQueuePublicView,
  generationQueueRuntimeSummary,
  resolveGenerationQueueRuntimeConfiguration,
  type GenerationQueueRuntimeConfiguration,
} from "./queue-runtime.js";

const DEFAULT_MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const ABSOLUTE_MAX_REQUEST_BYTES = 20 * 1024 * 1024;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,96}$/u;
const ACTOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const QUEUE_ITEM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const QUEUE_STATUS_VALUES: readonly GenerationQueueStatus[] = [
  "queued",
  "leased",
  "retry-wait",
  "completed",
  "blocked",
  "failed",
  "cancelled",
];

export interface StorytellerApiHandlerOptions {
  environment?: NodeJS.ProcessEnv;
  workingDirectory?: string;
  now?: () => Date;
}

function isProduction(environment: NodeJS.ProcessEnv): boolean {
  return environment.NODE_ENV === "production" || environment.VERCEL_ENV === "production";
}

function configuredMaximumRequestBytes(environment: NodeJS.ProcessEnv): number {
  const parsed = Number.parseInt(environment.STORYTELLER_MAX_REQUEST_BYTES ?? "", 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1_024) return DEFAULT_MAX_REQUEST_BYTES;
  return Math.min(parsed, ABSOLUTE_MAX_REQUEST_BYTES);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestId(request: IncomingMessage): string {
  const supplied = request.headers["x-request-id"];
  return typeof supplied === "string" && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
}

function setSecurityHeaders(response: ServerResponse, id: string): void {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet, noimageindex");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), browsing-topics=()");
  response.setHeader("X-Request-Id", id);
}

function sendJson(response: ServerResponse, id: string, status: number, body: unknown): void {
  setSecurityHeaders(response, id);
  response.statusCode = status;
  response.end(JSON.stringify(body));
}

function safeTokenEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isLoopback(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress ?? "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function configuredActorId(environment: NodeJS.ProcessEnv): string {
  const actorId = environment.STORYTELLER_API_ACTOR_ID?.trim();
  if (!actorId) {
    if (isProduction(environment)) throw new Error("API_ACTOR_CONFIGURATION_MISSING");
    return "local_operator";
  }
  if (!ACTOR_ID_PATTERN.test(actorId)) throw new Error("API_ACTOR_CONFIGURATION_INVALID");
  return actorId;
}

function authorise(
  request: IncomingMessage,
  environment: NodeJS.ProcessEnv,
): { ok: true; actorId: string } | { ok: false; status: number; code: string } {
  const expected = environment.STORYTELLER_API_TOKEN?.trim();
  if (!expected) {
    if (isProduction(environment)) return { ok: false, status: 503, code: "API_AUTH_CONFIGURATION_MISSING" };
    return isLoopback(request)
      ? { ok: true, actorId: configuredActorId(environment) }
      : { ok: false, status: 403, code: "API_DEVELOPMENT_LOOPBACK_ONLY" };
  }
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return { ok: false, status: 401, code: "API_BEARER_TOKEN_REQUIRED" };
  return safeTokenEqual(authorization.slice("Bearer ".length), expected)
    ? { ok: true, actorId: configuredActorId(environment) }
    : { ok: false, status: 401, code: "API_BEARER_TOKEN_INVALID" };
}

async function readJson(request: IncomingMessage, environment: NodeJS.ProcessEnv): Promise<unknown> {
  const maximumBytes = configuredMaximumRequestBytes(environment);
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;
    if (received > maximumBytes) throw new Error("API_REQUEST_BODY_TOO_LARGE");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return null;
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.toLocaleLowerCase("en-AU").includes("application/json")) throw new Error("API_JSON_CONTENT_TYPE_REQUIRED");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("API_JSON_INVALID");
  }
}

function parseProjectInput(value: unknown): CreateProjectInput {
  if (!isRecord(value)) throw new Error("PROJECT_INPUT_INVALID");
  if (typeof value.title !== "string" || value.title.trim().length === 0 || value.title.length > 300) throw new Error("PROJECT_TITLE_INVALID");
  if (typeof value.manuscriptText !== "string" || value.manuscriptText.trim().length === 0) throw new Error("PROJECT_MANUSCRIPT_INVALID");
  if (!isRecord(value.rightsEvidence)) throw new Error("PROJECT_RIGHTS_EVIDENCE_INVALID");
  if (!isRecord(value.providerRequirements)) throw new Error("PROJECT_PROVIDER_REQUIREMENTS_INVALID");
  if (!Array.isArray(value.providerProfiles)) throw new Error("PROJECT_PROVIDER_PROFILES_INVALID");
  return value as unknown as CreateProjectInput;
}

function parseProviderRequest(value: unknown): { requirements: ProviderRequirements; profiles: ProviderProfile[] } {
  if (!isRecord(value) || !isRecord(value.requirements) || !Array.isArray(value.profiles)) throw new Error("PROVIDER_RANKING_INPUT_INVALID");
  return value as unknown as { requirements: ProviderRequirements; profiles: ProviderProfile[] };
}

function parseTakeObservation(value: unknown): TakeObservation {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.sourceText !== "string" || typeof value.transcript !== "string") {
    throw new Error("TAKE_OBSERVATION_INVALID");
  }
  if (!isRecord(value.audio) || !isRecord(value.deliveryProfile)) throw new Error("TAKE_AUDIO_OBSERVATION_INVALID");
  return value as unknown as TakeObservation;
}

function parseManifest(value: unknown): ProjectManifest {
  if (!isRecord(value) || value.schemaVersion !== "storyteller-project-v1" || typeof value.id !== "string" || !isRecord(value.manuscript)) {
    throw new Error("PROJECT_MANIFEST_INVALID");
  }
  return value as unknown as ProjectManifest;
}

function parseInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new Error(code);
  return value as number;
}

function parseOptionalDate(value: unknown): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error("GENERATION_QUEUE_AVAILABLE_AT_INVALID");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("GENERATION_QUEUE_AVAILABLE_AT_INVALID");
  return date;
}

function parseQueueStatus(value: string): GenerationQueueStatus {
  if (!QUEUE_STATUS_VALUES.includes(value as GenerationQueueStatus)) throw new Error("GENERATION_QUEUE_STATUS_FILTER_INVALID");
  return value as GenerationQueueStatus;
}

function parseQueueStatuses(url: URL): readonly GenerationQueueStatus[] | undefined {
  const values = url.searchParams.getAll("status").flatMap((value) => value.split(",")).filter(Boolean);
  if (values.length === 0) return undefined;
  return [...new Set(values.map(parseQueueStatus))];
}

function parseQueueProjectId(url: URL): string | undefined {
  const value = url.searchParams.get("projectId")?.trim();
  if (!value) return undefined;
  if (!QUEUE_ITEM_ID_PATTERN.test(value)) throw new Error("GENERATION_QUEUE_PROJECT_FILTER_INVALID");
  return value;
}

function parseQueueLimit(url: URL): number {
  const value = url.searchParams.get("limit");
  if (!value) return 100;
  const parsed = Number(value);
  return parseInteger(parsed, 100, 1, 200, "GENERATION_QUEUE_LIMIT_INVALID");
}

function decodeQueueItemId(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new Error("GENERATION_QUEUE_ID_ENCODING_INVALID");
  }
  if (!QUEUE_ITEM_ID_PATTERN.test(decoded)) throw new Error("GENERATION_QUEUE_ID_INVALID");
  return decoded;
}

function queueItemRoute(pathname: string): Readonly<{ itemId: string; action: "read" | "cancel" }> | null {
  const cancel = pathname.match(/^\/v1\/generation\/queue\/([^/]+)\/cancel$/u);
  if (cancel?.[1]) return { itemId: decodeQueueItemId(cancel[1]), action: "cancel" };
  const read = pathname.match(/^\/v1\/generation\/queue\/([^/]+)$/u);
  if (read?.[1]) return { itemId: decodeQueueItemId(read[1]), action: "read" };
  return null;
}

function errorStatus(code: string): number {
  if (code === "API_REQUEST_BODY_TOO_LARGE") return 413;
  if (code.startsWith("API_JSON")) return 400;
  if (code === "GENERATION_QUEUE_ITEM_NOT_FOUND") return 404;
  if (
    code === "GENERATION_QUEUE_NOT_CONFIGURED"
    || code === "GENERATION_QUEUE_DATA_DIR_REQUIRED"
    || code === "GENERATION_QUEUE_DRIVER_INVALID"
    || code === "GENERATION_QUEUE_FILE_DRIVER_SINGLE_HOST_ACK_REQUIRED"
    || code === "API_ACTOR_CONFIGURATION_MISSING"
    || code === "API_ACTOR_CONFIGURATION_INVALID"
  ) return 503;
  if (
    code.includes("CONFLICT")
    || code.includes("ALREADY_CANCELLED")
    || code.startsWith("GENERATION_QUEUE_TERMINAL:")
  ) return 409;
  return 422;
}

export function createStorytellerApiHandler(options: StorytellerApiHandlerOptions = {}) {
  const environment = options.environment ?? process.env;
  const workingDirectory = options.workingDirectory ?? process.cwd();
  const now = options.now ?? (() => new Date());
  let queueConfiguration: GenerationQueueRuntimeConfiguration | undefined;
  let queueRuntime: FileGenerationQueue | null | undefined;

  const resolveQueueConfiguration = (): GenerationQueueRuntimeConfiguration => {
    queueConfiguration ??= resolveGenerationQueueRuntimeConfiguration(environment, workingDirectory);
    return queueConfiguration;
  };

  const requireQueueRuntime = (): FileGenerationQueue => {
    if (queueRuntime === undefined) queueRuntime = createGenerationQueueRuntime(resolveQueueConfiguration());
    if (!queueRuntime) throw new Error("GENERATION_QUEUE_NOT_CONFIGURED");
    return queueRuntime;
  };

  const queueHealth = (): Readonly<Record<string, unknown>> => {
    try {
      const summary = generationQueueRuntimeSummary(resolveQueueConfiguration());
      return { status: summary.enabled ? "ready" : "disabled", ...summary };
    } catch (error) {
      const code = error instanceof Error ? error.message : "GENERATION_QUEUE_CONFIGURATION_INVALID";
      return { status: "misconfigured", enabled: false, workerApiExposed: false, code };
    }
  };

  return async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const id = requestId(request);
    const startedAt = Date.now();
    const url = new URL(request.url ?? "/", "http://storyteller.local");
    let status = 500;
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        const generationQueue = queueHealth();
        status = generationQueue.status === "misconfigured" ? 503 : 200;
        sendJson(response, id, status, {
          service: "storyteller-studio-api",
          status: status === 200 ? "ok" : "degraded",
          engineVersion: STORYTELLER_ENGINE_VERSION,
          providerExecutionEnabled: false,
          generationQueue,
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/capabilities") {
        status = 200;
        sendJson(response, id, status, {
          manuscript: ["exact-source segmentation", "stable source offsets", "chapter detection", "final-word coverage"],
          performance: ["normalised direction", "calibration selection", "series continuity assessment"],
          quality: ["transcript fidelity", "audio delivery profiles", "candidate take selection"],
          governance: ["voice rights and consent", "provider capability negotiation", "fail-closed production status"],
          orchestration: ["idempotent queue admission", "exclusive worker leases", "bounded retry", "operator cancellation"],
          visuals: ["scene-level beat grouping", "continuity keys", "restrained motion policies"],
          workerApiExposed: false,
        });
        return;
      }

      const auth = authorise(request, environment);
      if (!auth.ok) {
        status = auth.status;
        sendJson(response, id, status, { error: { code: auth.code, requestId: id } });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/projects/plan") {
        const input = parseProjectInput(await readJson(request, environment));
        const manifest = createProjectManifest(input);
        status = manifest.status === "blocked" ? 422 : 201;
        sendJson(response, id, status, { data: manifest, requestId: id });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/providers/rank") {
        const input = parseProviderRequest(await readJson(request, environment));
        status = 200;
        sendJson(response, id, status, { data: rankProviders(input.requirements, input.profiles), requestId: id });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/takes/evaluate") {
        const observation = parseTakeObservation(await readJson(request, environment));
        const assessment = assessCandidateTake(observation);
        status = assessment.eligible ? 200 : 422;
        sendJson(response, id, status, { data: assessment, requestId: id });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/generation/jobs") {
        const payload = await readJson(request, environment);
        if (!isRecord(payload)) throw new Error("GENERATION_JOB_INPUT_INVALID");
        const manifest = parseManifest(payload.manifest);
        const candidateCount = parseInteger(payload.candidateCount, 2, 1, 8, "GENERATION_CANDIDATE_COUNT_INVALID");
        const jobs = createGenerationJobs(manifest, candidateCount);
        status = jobs.every((job) => job.status === "ready") ? 201 : 422;
        sendJson(response, id, status, {
          data: jobs,
          execution: "not-started",
          message: "Jobs are deterministic production intents. Queue admission and provider execution remain separate governed operations.",
          requestId: id,
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/generation/queue") {
        const payload = await readJson(request, environment);
        if (!isRecord(payload)) throw new Error("GENERATION_QUEUE_INPUT_INVALID");
        const manifest = parseManifest(payload.manifest);
        const candidateCount = parseInteger(payload.candidateCount, 2, 1, 8, "GENERATION_CANDIDATE_COUNT_INVALID");
        const priority = parseInteger(payload.priority, 50, 0, 100, "GENERATION_QUEUE_PRIORITY_INVALID");
        const maxAttempts = parseInteger(payload.maxAttempts, 4, 1, 20, "GENERATION_QUEUE_MAX_ATTEMPTS_INVALID");
        const availableAt = parseOptionalDate(payload.availableAt);
        const instant = now();
        const queue = requireQueueRuntime();
        const jobs = createGenerationJobs(manifest, candidateCount);
        const envelopes = [];
        for (const job of jobs) {
          envelopes.push(await queue.enqueue(job, {
            priority,
            maxAttempts,
            ...(availableAt ? { availableAt } : {}),
            now: instant,
          }));
        }
        const data = envelopes.map(generationQueuePublicView);
        const hasRunnable = data.some((item) => item.status === "queued" || item.status === "retry-wait" || item.status === "leased");
        status = hasRunnable ? 202 : 422;
        sendJson(response, id, status, {
          data,
          execution: hasRunnable ? "queued" : "blocked",
          workerApiExposed: false,
          message: hasRunnable
            ? "Generation intents are durably queued. Internal workers must re-check rights, capability, budget and artifact storage before provider execution."
            : "Generation intents were recorded as blocked because upstream governance gates remain unresolved.",
          requestId: id,
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/generation/queue") {
        const queue = requireQueueRuntime();
        const projectId = parseQueueProjectId(url);
        const statuses = parseQueueStatuses(url);
        const limit = parseQueueLimit(url);
        const rows = await queue.list({
          ...(projectId ? { projectId } : {}),
          ...(statuses ? { status: statuses } : {}),
        });
        status = 200;
        sendJson(response, id, status, {
          data: rows.slice(0, limit).map(generationQueuePublicView),
          meta: {
            total: rows.length,
            returned: Math.min(rows.length, limit),
            truncated: rows.length > limit,
          },
          requestId: id,
        });
        return;
      }

      const queueRoute = queueItemRoute(url.pathname);
      if (queueRoute?.action === "read" && request.method === "GET") {
        const envelope = await requireQueueRuntime().read(queueRoute.itemId);
        if (!envelope) throw new GenerationQueueConflictError("GENERATION_QUEUE_ITEM_NOT_FOUND");
        status = 200;
        sendJson(response, id, status, { data: generationQueuePublicView(envelope), requestId: id });
        return;
      }

      if (queueRoute?.action === "cancel" && request.method === "POST") {
        const payload = await readJson(request, environment);
        if (!isRecord(payload) || typeof payload.reason !== "string") throw new Error("GENERATION_QUEUE_CANCELLATION_INPUT_INVALID");
        const envelope = await requireQueueRuntime().cancel(queueRoute.itemId, {
          actorId: auth.actorId,
          reason: payload.reason,
          now: now(),
        });
        status = 200;
        sendJson(response, id, status, {
          data: generationQueuePublicView(envelope),
          message: "Cancellation is recorded and any in-flight worker lease is invalidated.",
          requestId: id,
        });
        return;
      }

      status = 404;
      sendJson(response, id, status, { error: { code: "API_ROUTE_NOT_FOUND", requestId: id } });
    } catch (error) {
      const code = error instanceof Error ? error.message : "API_INTERNAL_ERROR";
      status = errorStatus(code);
      sendJson(response, id, status, { error: { code, requestId: id } });
    } finally {
      console.info(JSON.stringify({ requestId: id, method: request.method, path: url.pathname, status, durationMs: Date.now() - startedAt }));
    }
  };
}

export function startStorytellerApi(): void {
  const host = process.env.STORYTELLER_API_HOST ?? "127.0.0.1";
  const port = Number.parseInt(process.env.STORYTELLER_API_PORT ?? "3100", 10);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("API_PORT_INVALID");
  const server = createServer(createStorytellerApiHandler());
  server.listen(port, host, () => {
    console.info(JSON.stringify({ service: "storyteller-studio-api", status: "listening", host, port }));
  });
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) startStorytellerApi();
