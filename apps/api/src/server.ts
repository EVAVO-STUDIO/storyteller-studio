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

const DEFAULT_MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const ABSOLUTE_MAX_REQUEST_BYTES = 20 * 1024 * 1024;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,96}$/;

function configuredMaximumRequestBytes(): number {
  const parsed = Number.parseInt(process.env.STORYTELLER_MAX_REQUEST_BYTES ?? "", 10);
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

function authorise(request: IncomingMessage): { ok: true } | { ok: false; status: number; code: string } {
  const expected = process.env.STORYTELLER_API_TOKEN?.trim();
  const production = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  if (!expected) {
    if (production) return { ok: false, status: 503, code: "API_AUTH_CONFIGURATION_MISSING" };
    return isLoopback(request)
      ? { ok: true }
      : { ok: false, status: 403, code: "API_DEVELOPMENT_LOOPBACK_ONLY" };
  }
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return { ok: false, status: 401, code: "API_BEARER_TOKEN_REQUIRED" };
  return safeTokenEqual(authorization.slice("Bearer ".length), expected)
    ? { ok: true }
    : { ok: false, status: 401, code: "API_BEARER_TOKEN_INVALID" };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const maximumBytes = configuredMaximumRequestBytes();
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

export function createStorytellerApiHandler() {
  return async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const id = requestId(request);
    const startedAt = Date.now();
    const url = new URL(request.url ?? "/", "http://storyteller.local");
    let status = 500;
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        status = 200;
        sendJson(response, id, status, {
          service: "storyteller-studio-api",
          status: "ok",
          engineVersion: STORYTELLER_ENGINE_VERSION,
          providerCredentialsConfigured: false,
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
          visuals: ["scene-level beat grouping", "continuity keys", "restrained motion policies"],
        });
        return;
      }

      const auth = authorise(request);
      if (!auth.ok) {
        status = auth.status;
        sendJson(response, id, status, { error: { code: auth.code, requestId: id } });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/projects/plan") {
        const input = parseProjectInput(await readJson(request));
        const manifest = createProjectManifest(input);
        status = manifest.status === "blocked" ? 422 : 201;
        sendJson(response, id, status, { data: manifest, requestId: id });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/providers/rank") {
        const input = parseProviderRequest(await readJson(request));
        status = 200;
        sendJson(response, id, status, { data: rankProviders(input.requirements, input.profiles), requestId: id });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/takes/evaluate") {
        const observation = parseTakeObservation(await readJson(request));
        const assessment = assessCandidateTake(observation);
        status = assessment.eligible ? 200 : 422;
        sendJson(response, id, status, { data: assessment, requestId: id });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/generation/jobs") {
        const payload = await readJson(request);
        if (!isRecord(payload)) throw new Error("GENERATION_JOB_INPUT_INVALID");
        const manifest = parseManifest(payload.manifest);
        const candidateCount = typeof payload.candidateCount === "number" ? payload.candidateCount : 2;
        const jobs = createGenerationJobs(manifest, candidateCount);
        status = jobs.every((job) => job.status === "ready") ? 201 : 422;
        sendJson(response, id, status, {
          data: jobs,
          execution: "not-started",
          message: "Jobs are deterministic production intents. A configured, rights-aware provider worker must execute them.",
          requestId: id,
        });
        return;
      }

      status = 404;
      sendJson(response, id, status, { error: { code: "API_ROUTE_NOT_FOUND", requestId: id } });
    } catch (error) {
      const code = error instanceof Error ? error.message : "API_INTERNAL_ERROR";
      status = code === "API_REQUEST_BODY_TOO_LARGE" ? 413 : code.startsWith("API_JSON") ? 400 : 422;
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
