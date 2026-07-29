import { timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_ENTITY_TYPE,
  AudiobookRetailPublicationEvidenceInboxError,
  FileAudiobookRetailPublicationEvidenceInboxStore,
  acknowledgeAudiobookRetailPublicationEvidence,
  createAudiobookRetailPublicationEvidenceRequest,
  type AudiobookRetailPublicationEvidenceInboxItem,
} from "@evavo/storyteller-engine/audiobook-retail-publication-evidence-inbox";
import { FileAudiobookRetailPublicationMonitorStore } from "@evavo/storyteller-engine/audiobook-retail-publication-monitor";
import { stableHash } from "@evavo/storyteller-engine";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";
import type { WorkerEnvironment } from "./configuration.js";
import type {
  WorkerProcessSignal,
  WorkerShutdownScheduler,
  WorkerShutdownTimer,
  WorkerSignalSource,
} from "./lifecycle.js";
import {
  publicationEvidenceGatewayConfigurationSummary,
  type PublicationEvidenceGatewayConfiguration,
  type PublicationEvidenceGatewayConfigurationSummary,
} from "./publication-evidence-gateway-configuration.js";

export interface PublicationEvidenceGatewayRequest {
  method: string;
  path: string;
  authorization?: string;
  contentType?: string;
  body: string;
}

export interface PublicationEvidenceGatewayResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  body?: string;
  disposition:
    | "evidence"
    | "no-content"
    | "rejected"
    | "error";
  reconciledItems: number;
}

export interface PublicationEvidenceGatewayHandlerDependencies {
  token: string;
  gatewayId: string;
  state: FileProjectStore;
  monitors: FileAudiobookRetailPublicationMonitorStore;
  inbox: FileAudiobookRetailPublicationEvidenceInboxStore;
  maximumBodyBytes: number;
  now?: () => Date;
}

export interface PublicationEvidenceGatewayServiceSnapshot {
  state: "idle" | "running" | "draining" | "stopped" | "failed";
  activeRequests: number;
  totalRequests: number;
  evidenceResponses: number;
  noContentResponses: number;
  rejectedRequests: number;
  errorResponses: number;
  reconciledItems: number;
  failureCode?: string;
}

export interface PublicationEvidenceGatewayServiceControl {
  start(): Promise<void>;
  requestDrain(): void;
  abortActive(reason?: Error): void;
  snapshot(): PublicationEvidenceGatewayServiceSnapshot;
}

export interface PublicationEvidenceGatewayRuntimeDependencies {
  environment?: WorkerEnvironment;
  signals?: WorkerSignalSource;
  shutdownScheduler?: WorkerShutdownScheduler;
  now?: () => Date;
  serverFactory?: (
    listener: (
      request: IncomingMessage,
      response: ServerResponse,
    ) => void,
  ) => Server;
  serviceFactory?: (
    configuration: Extract<PublicationEvidenceGatewayConfiguration, { enabled: true }>,
    dependencies: Readonly<{
      state: FileProjectStore;
      monitors: FileAudiobookRetailPublicationMonitorStore;
      inbox: FileAudiobookRetailPublicationEvidenceInboxStore;
      token: string;
      now: () => Date;
    }>,
  ) => PublicationEvidenceGatewayServiceControl;
}

export type PublicationEvidenceGatewayRuntimeResult =
  | Readonly<{
      status: "disabled";
      configuration: PublicationEvidenceGatewayConfigurationSummary;
    }>
  | Readonly<{
      status: "stopped" | "failed";
      configuration: PublicationEvidenceGatewayConfigurationSummary;
      shutdownSignal?: WorkerProcessSignal;
      forcedAbort: boolean;
      service: PublicationEvidenceGatewayServiceSnapshot;
    }>;

export class PublicationEvidenceGatewayRuntimeError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PublicationEvidenceGatewayRuntimeError";
    this.code = code;
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const REGION_PATTERN = /^[A-Z]{2}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const GATEWAY_PATH = "/v1/publication-evidence";

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return message.match(/^[A-Z][A-Z0-9_]{2,95}/u)?.[0]
    ?? "PUBLICATION_EVIDENCE_GATEWAY_FAILED";
}

function requireSecret(value: string | undefined, code: string): string {
  const candidate = value?.trim() ?? "";
  if (!candidate || candidate.length > 8_192 || CONTROL_CHARACTERS.test(candidate)) {
    throw new PublicationEvidenceGatewayRuntimeError(code);
  }
  return candidate;
}

function secureTokenMatch(authorization: string | undefined, token: string): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  const left = Buffer.from(supplied, "utf8");
  const right = Buffer.from(token, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function jsonResponse(
  status: number,
  code: string,
  disposition: "rejected" | "error",
): PublicationEvidenceGatewayResponse {
  return Object.freeze({
    status,
    headers: Object.freeze({
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    }),
    body: JSON.stringify({ code }),
    disposition,
    reconciledItems: 0,
  });
}

function noContentResponse(
  reconciledItems: number,
): PublicationEvidenceGatewayResponse {
  return Object.freeze({
    status: 204,
    headers: Object.freeze({
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    }),
    disposition: "no-content",
    reconciledItems,
  });
}

function evidenceResponse(
  item: AudiobookRetailPublicationEvidenceInboxItem,
  reconciledItems: number,
): PublicationEvidenceGatewayResponse {
  return Object.freeze({
    status: 200,
    headers: Object.freeze({
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    }),
    body: JSON.stringify({ verification: item.verification }),
    disposition: "evidence",
    reconciledItems,
  });
}

function parseRequestBody(value: string): Readonly<{
  requestFingerprint: string;
  monitor: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
    projectId: string;
    bookId: string;
    listingIdentity: Readonly<{ id: string; fingerprint: string }>;
    requiredRegions: readonly string[];
    currentHealth: string;
    latestVerificationStatus: string;
    latestVerificationFingerprint: string;
    lastVerifiedAt: string;
    observationExpiresAt: string;
    nextRefreshDueAt: string;
  }>;
}> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new PublicationEvidenceGatewayRuntimeError(
      "PUBLICATION_EVIDENCE_GATEWAY_REQUEST_JSON_INVALID",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PublicationEvidenceGatewayRuntimeError(
      "PUBLICATION_EVIDENCE_GATEWAY_REQUEST_INVALID",
    );
  }
  const root = parsed as Record<string, unknown>;
  const monitorValue = root.monitor;
  if (
    !HASH_PATTERN.test(String(root.requestFingerprint ?? ""))
    || !monitorValue
    || typeof monitorValue !== "object"
    || Array.isArray(monitorValue)
  ) {
    throw new PublicationEvidenceGatewayRuntimeError(
      "PUBLICATION_EVIDENCE_GATEWAY_REQUEST_INVALID",
    );
  }
  const monitor = monitorValue as Record<string, unknown>;
  const listingValue = monitor.listingIdentity;
  if (!listingValue || typeof listingValue !== "object" || Array.isArray(listingValue)) {
    throw new PublicationEvidenceGatewayRuntimeError(
      "PUBLICATION_EVIDENCE_GATEWAY_REQUEST_INVALID",
    );
  }
  const listing = listingValue as Record<string, unknown>;
  const regions = monitor.requiredRegions;
  if (
    !Array.isArray(regions)
    || regions.length === 0
    || regions.length > 32
    || regions.some((region) =>
      typeof region !== "string" || !REGION_PATTERN.test(region)
    )
  ) {
    throw new PublicationEvidenceGatewayRuntimeError(
      "PUBLICATION_EVIDENCE_GATEWAY_REQUEST_INVALID",
    );
  }
  for (const value of [
    monitor.id,
    monitor.projectId,
    monitor.bookId,
    listing.id,
  ]) {
    if (typeof value !== "string" || !SAFE_IDENTIFIER.test(value)) {
      throw new PublicationEvidenceGatewayRuntimeError(
        "PUBLICATION_EVIDENCE_GATEWAY_REQUEST_INVALID",
      );
    }
  }
  for (const value of [
    monitor.fingerprint,
    listing.fingerprint,
    monitor.latestVerificationFingerprint,
  ]) {
    if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
      throw new PublicationEvidenceGatewayRuntimeError(
        "PUBLICATION_EVIDENCE_GATEWAY_REQUEST_INVALID",
      );
    }
  }
  if (
    !Number.isSafeInteger(monitor.revision)
    || Number(monitor.revision) < 1
  ) {
    throw new PublicationEvidenceGatewayRuntimeError(
      "PUBLICATION_EVIDENCE_GATEWAY_REQUEST_INVALID",
    );
  }
  for (const value of [
    monitor.lastVerifiedAt,
    monitor.observationExpiresAt,
    monitor.nextRefreshDueAt,
  ]) {
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
      throw new PublicationEvidenceGatewayRuntimeError(
        "PUBLICATION_EVIDENCE_GATEWAY_REQUEST_INVALID",
      );
    }
  }
  return Object.freeze({
    requestFingerprint: String(root.requestFingerprint),
    monitor: Object.freeze({
      id: String(monitor.id),
      revision: Number(monitor.revision),
      fingerprint: String(monitor.fingerprint),
      projectId: String(monitor.projectId),
      bookId: String(monitor.bookId),
      listingIdentity: Object.freeze({
        id: String(listing.id),
        fingerprint: String(listing.fingerprint),
      }),
      requiredRegions: Object.freeze([...regions] as string[]),
      currentHealth: String(monitor.currentHealth ?? ""),
      latestVerificationStatus: String(
        monitor.latestVerificationStatus ?? "",
      ),
      latestVerificationFingerprint: String(
        monitor.latestVerificationFingerprint,
      ),
      lastVerifiedAt: String(monitor.lastVerifiedAt),
      observationExpiresAt: String(monitor.observationExpiresAt),
      nextRefreshDueAt: String(monitor.nextRefreshDueAt),
    }),
  });
}

function requestMatchesPersistedMonitor(
  input: ReturnType<typeof parseRequestBody>,
  monitor: Awaited<ReturnType<FileAudiobookRetailPublicationMonitorStore["require"]>>["payload"],
): boolean {
  const latest = monitor.entries.at(-1)!;
  const expected = {
    id: monitor.id,
    revision: monitor.revision,
    fingerprint: monitor.fingerprint,
    projectId: monitor.projectId,
    bookId: monitor.bookId,
    listingIdentity: {
      id: monitor.listingIdentity.id,
      fingerprint: monitor.listingIdentity.fingerprint,
    },
    requiredRegions: monitor.requiredRegions,
    currentHealth: monitor.currentHealth,
    latestVerificationStatus: monitor.latestVerificationStatus,
    latestVerificationFingerprint: latest.verificationFingerprint,
    lastVerifiedAt: monitor.lastVerifiedAt,
    observationExpiresAt: monitor.observationExpiresAt,
    nextRefreshDueAt: monitor.nextRefreshDueAt,
  };
  return stableHash(input.monitor) === stableHash(expected)
    && input.requestFingerprint
      === createAudiobookRetailPublicationEvidenceRequest(
        monitor,
        new Date(Math.max(Date.now(), Date.parse(monitor.updatedAt))),
      ).requestFingerprint;
}

async function reconcileConsumedEvidence(input: Readonly<{
  state: FileProjectStore;
  inbox: FileAudiobookRetailPublicationEvidenceInboxStore;
  monitor: Awaited<ReturnType<FileAudiobookRetailPublicationMonitorStore["require"]>>["payload"];
  gatewayId: string;
  now: Date;
}>): Promise<number> {
  const rows = await input.state.list(
    AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_ENTITY_TYPE,
  );
  let reconciled = 0;
  for (const row of rows) {
    const envelope = await input.inbox.require(row.entityId);
    const item = envelope.payload;
    if (
      item.status !== "available"
      || item.request.monitor.id !== input.monitor.id
    ) continue;
    try {
      const acknowledged = acknowledgeAudiobookRetailPublicationEvidence(item, {
        monitor: input.monitor,
        acknowledgedByActorId: input.gatewayId,
        acknowledgedAt: input.now,
      });
      if (acknowledged === item) continue;
      await input.inbox.save(acknowledged, {
        expectedRevision: envelope.revision,
        actorId: input.gatewayId,
        action: "audiobook_retail_publication_evidence.acknowledged",
      });
      reconciled += 1;
    } catch (error) {
      if (
        error instanceof AudiobookRetailPublicationEvidenceInboxError
        && error.code
          === "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_ACKNOWLEDGEMENT_INVALID"
      ) continue;
      throw error;
    }
  }
  return reconciled;
}

export async function handlePublicationEvidenceGatewayRequest(
  request: PublicationEvidenceGatewayRequest,
  dependencies: PublicationEvidenceGatewayHandlerDependencies,
): Promise<PublicationEvidenceGatewayResponse> {
  if (!secureTokenMatch(request.authorization, dependencies.token)) {
    return jsonResponse(
      401,
      "PUBLICATION_EVIDENCE_GATEWAY_UNAUTHORIZED",
      "rejected",
    );
  }
  if (request.path !== GATEWAY_PATH) {
    return jsonResponse(
      404,
      "PUBLICATION_EVIDENCE_GATEWAY_ROUTE_NOT_FOUND",
      "rejected",
    );
  }
  if (request.method.toUpperCase() !== "POST") {
    return Object.freeze({
      ...jsonResponse(
        405,
        "PUBLICATION_EVIDENCE_GATEWAY_METHOD_NOT_ALLOWED",
        "rejected",
      ),
      headers: Object.freeze({
        ...jsonResponse(405, "METHOD", "rejected").headers,
        allow: "POST",
      }),
    });
  }
  if (!request.contentType?.toLocaleLowerCase("en-AU").startsWith("application/json")) {
    return jsonResponse(
      415,
      "PUBLICATION_EVIDENCE_GATEWAY_CONTENT_TYPE_REQUIRED",
      "rejected",
    );
  }
  if (
    !request.body
    || Buffer.byteLength(request.body, "utf8") > dependencies.maximumBodyBytes
  ) {
    return jsonResponse(
      request.body ? 413 : 400,
      request.body
        ? "PUBLICATION_EVIDENCE_GATEWAY_BODY_TOO_LARGE"
        : "PUBLICATION_EVIDENCE_GATEWAY_BODY_REQUIRED",
      "rejected",
    );
  }

  let input: ReturnType<typeof parseRequestBody>;
  try {
    input = parseRequestBody(request.body);
  } catch (error) {
    return jsonResponse(400, safeErrorCode(error), "rejected");
  }
  const monitorEnvelope = await dependencies.monitors.read(input.monitor.id);
  if (!monitorEnvelope) {
    return jsonResponse(
      404,
      "PUBLICATION_EVIDENCE_GATEWAY_MONITOR_NOT_FOUND",
      "rejected",
    );
  }
  if (!requestMatchesPersistedMonitor(input, monitorEnvelope.payload)) {
    return jsonResponse(
      409,
      "PUBLICATION_EVIDENCE_GATEWAY_REQUEST_STALE",
      "rejected",
    );
  }
  const now = dependencies.now?.() ?? new Date();
  if (Number.isNaN(now.getTime())) {
    return jsonResponse(
      500,
      "PUBLICATION_EVIDENCE_GATEWAY_CLOCK_INVALID",
      "error",
    );
  }
  let reconciledItems = 0;
  try {
    reconciledItems = await reconcileConsumedEvidence({
      state: dependencies.state,
      inbox: dependencies.inbox,
      monitor: monitorEnvelope.payload,
      gatewayId: dependencies.gatewayId,
      now,
    });
    const evidenceRequest = createAudiobookRetailPublicationEvidenceRequest(
      monitorEnvelope.payload,
      now,
    );
    const current = await dependencies.inbox.findCurrentForRequest(
      evidenceRequest,
      now,
    );
    return current
      ? evidenceResponse(current.payload, reconciledItems)
      : noContentResponse(reconciledItems);
  } catch (error) {
    return Object.freeze({
      ...jsonResponse(500, safeErrorCode(error), "error"),
      reconciledItems,
    });
  }
}

function readRequestBody(
  request: IncomingMessage,
  maximumBodyBytes: number,
  signal: AbortSignal,
): Promise<string> {
  return new Promise<string>((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const cleanup = () => {
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const onData = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maximumBodyBytes) {
        cleanup();
        reject(new PublicationEvidenceGatewayRuntimeError(
          "PUBLICATION_EVIDENCE_GATEWAY_BODY_TOO_LARGE",
        ));
        request.destroy();
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = () => {
      cleanup();
      resolvePromise(Buffer.concat(chunks).toString("utf8"));
    };
    const onError = () => {
      cleanup();
      reject(new PublicationEvidenceGatewayRuntimeError(
        "PUBLICATION_EVIDENCE_GATEWAY_REQUEST_STREAM_FAILED",
      ));
    };
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
      request.destroy();
    };
    request.on("data", onData);
    request.once("end", onEnd);
    request.once("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function writeResponse(
  response: ServerResponse,
  result: PublicationEvidenceGatewayResponse,
): void {
  response.statusCode = result.status;
  for (const [name, value] of Object.entries(result.headers)) {
    response.setHeader(name, value);
  }
  response.end(result.body ?? "");
}

export class PublicationEvidenceGatewayService
  implements PublicationEvidenceGatewayServiceControl {
  readonly #configuration: Extract<
    PublicationEvidenceGatewayConfiguration,
    { enabled: true }
  >;
  readonly #handlerDependencies: PublicationEvidenceGatewayHandlerDependencies;
  readonly #serverFactory: NonNullable<
    PublicationEvidenceGatewayRuntimeDependencies["serverFactory"]
  >;
  readonly #activeControllers = new Set<AbortController>();
  #server: Server | undefined;
  #state: PublicationEvidenceGatewayServiceSnapshot["state"] = "idle";
  #activeRequests = 0;
  #totalRequests = 0;
  #evidenceResponses = 0;
  #noContentResponses = 0;
  #rejectedRequests = 0;
  #errorResponses = 0;
  #reconciledItems = 0;
  #failureCode: string | undefined;
  #running: Promise<void> | undefined;

  constructor(input: Readonly<{
    configuration: Extract<PublicationEvidenceGatewayConfiguration, { enabled: true }>;
    handlerDependencies: PublicationEvidenceGatewayHandlerDependencies;
    serverFactory?: PublicationEvidenceGatewayRuntimeDependencies["serverFactory"];
  }>) {
    this.#configuration = input.configuration;
    this.#handlerDependencies = input.handlerDependencies;
    this.#serverFactory = input.serverFactory ?? ((listener) => createServer(listener));
  }

  snapshot(): PublicationEvidenceGatewayServiceSnapshot {
    return Object.freeze({
      state: this.#state,
      activeRequests: this.#activeRequests,
      totalRequests: this.#totalRequests,
      evidenceResponses: this.#evidenceResponses,
      noContentResponses: this.#noContentResponses,
      rejectedRequests: this.#rejectedRequests,
      errorResponses: this.#errorResponses,
      reconciledItems: this.#reconciledItems,
      ...(this.#failureCode ? { failureCode: this.#failureCode } : {}),
    });
  }

  start(): Promise<void> {
    if (this.#running) return this.#running;
    if (this.#state !== "idle") {
      throw new Error("PUBLICATION_EVIDENCE_GATEWAY_START_STATE_INVALID");
    }
    this.#state = "running";
    this.#server = this.#serverFactory((request, response) => {
      void this.#handleHttpRequest(request, response);
    });
    this.#running = new Promise<void>((resolvePromise, reject) => {
      const server = this.#server!;
      const onError = (error: Error) => {
        this.#failureCode = safeErrorCode(error);
        this.#state = "failed";
        reject(error);
      };
      server.once("error", onError);
      server.once("close", () => {
        server.off("error", onError);
        if (this.#state !== "failed") this.#state = "stopped";
        resolvePromise();
      });
      server.listen(
        this.#configuration.port,
        this.#configuration.bindHost,
      );
    });
    return this.#running;
  }

  requestDrain(): void {
    if (this.#state === "idle") {
      this.#state = "stopped";
      return;
    }
    if (this.#state !== "running") return;
    this.#state = "draining";
    this.#server?.close();
  }

  abortActive(
    reason = new Error("PUBLICATION_EVIDENCE_GATEWAY_ABORTED"),
  ): void {
    for (const controller of this.#activeControllers) {
      controller.abort(reason);
    }
    this.#server?.closeAllConnections?.();
    this.requestDrain();
  }

  async #handleHttpRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    this.#activeRequests += 1;
    this.#totalRequests += 1;
    const controller = new AbortController();
    this.#activeControllers.add(controller);
    const timeout = setTimeout(() => {
      controller.abort(new Error(
        "PUBLICATION_EVIDENCE_GATEWAY_REQUEST_TIMEOUT",
      ));
    }, this.#configuration.requestTimeoutMs);
    timeout.unref?.();
    try {
      const body = await readRequestBody(
        request,
        this.#configuration.maximumBodyBytes,
        controller.signal,
      );
      const result = await handlePublicationEvidenceGatewayRequest({
        method: request.method ?? "",
        path: request.url?.split("?", 1)[0] ?? "",
        authorization: request.headers.authorization,
        contentType: request.headers["content-type"],
        body,
      }, this.#handlerDependencies);
      this.#record(result);
      writeResponse(response, result);
    } catch (error) {
      const result = jsonResponse(
        safeErrorCode(error) === "PUBLICATION_EVIDENCE_GATEWAY_BODY_TOO_LARGE"
          ? 413
          : safeErrorCode(error)
              === "PUBLICATION_EVIDENCE_GATEWAY_REQUEST_TIMEOUT"
            ? 408
            : 500,
        safeErrorCode(error),
        "error",
      );
      this.#record(result);
      if (!response.headersSent) writeResponse(response, result);
      else response.destroy();
    } finally {
      clearTimeout(timeout);
      this.#activeControllers.delete(controller);
      this.#activeRequests -= 1;
    }
  }

  #record(result: PublicationEvidenceGatewayResponse): void {
    this.#reconciledItems += result.reconciledItems;
    switch (result.disposition) {
      case "evidence":
        this.#evidenceResponses += 1;
        break;
      case "no-content":
        this.#noContentResponses += 1;
        break;
      case "rejected":
        this.#rejectedRequests += 1;
        break;
      case "error":
        this.#errorResponses += 1;
        break;
    }
  }
}

function defaultSignalSource(): WorkerSignalSource {
  return Object.freeze({
    subscribe(listener: (signal: WorkerProcessSignal) => void) {
      const onInterrupt = () => listener("SIGINT");
      const onTerminate = () => listener("SIGTERM");
      process.on("SIGINT", onInterrupt);
      process.on("SIGTERM", onTerminate);
      return () => {
        process.off("SIGINT", onInterrupt);
        process.off("SIGTERM", onTerminate);
      };
    },
  });
}

function defaultShutdownScheduler(): WorkerShutdownScheduler {
  return Object.freeze({
    schedule(callback: () => void, delayMs: number): WorkerShutdownTimer {
      const handle = setTimeout(callback, delayMs);
      handle.unref?.();
      return Object.freeze({
        cancel() {
          clearTimeout(handle);
        },
      });
    },
  });
}

function createGatewayService(
  configuration: Extract<PublicationEvidenceGatewayConfiguration, { enabled: true }>,
  dependencies: PublicationEvidenceGatewayRuntimeDependencies,
): PublicationEvidenceGatewayServiceControl {
  const environment = dependencies.environment ?? process.env;
  const token = requireSecret(
    environment[configuration.tokenEnvironmentVariable],
    "PUBLICATION_EVIDENCE_GATEWAY_TOKEN_MISSING",
  );
  const now = dependencies.now ?? (() => new Date());
  const state = new FileProjectStore(configuration.stateRootDirectory);
  const monitors = new FileAudiobookRetailPublicationMonitorStore(state);
  const inbox = new FileAudiobookRetailPublicationEvidenceInboxStore(state);
  if (dependencies.serviceFactory) {
    return dependencies.serviceFactory(configuration, {
      state,
      monitors,
      inbox,
      token,
      now,
    });
  }
  return new PublicationEvidenceGatewayService({
    configuration,
    handlerDependencies: {
      token,
      gatewayId: configuration.gatewayId,
      state,
      monitors,
      inbox,
      maximumBodyBytes: configuration.maximumBodyBytes,
      now,
    },
    ...(dependencies.serverFactory
      ? { serverFactory: dependencies.serverFactory }
      : {}),
  });
}

export async function runConfiguredPublicationEvidenceGateway(
  configuration: PublicationEvidenceGatewayConfiguration,
  dependencies: PublicationEvidenceGatewayRuntimeDependencies = {},
): Promise<PublicationEvidenceGatewayRuntimeResult> {
  const summary = publicationEvidenceGatewayConfigurationSummary(configuration);
  if (!configuration.enabled) {
    return Object.freeze({ status: "disabled", configuration: summary });
  }
  const service = createGatewayService(configuration, dependencies);
  const signals = dependencies.signals ?? defaultSignalSource();
  const scheduler = dependencies.shutdownScheduler ?? defaultShutdownScheduler();
  let shutdownSignal: WorkerProcessSignal | undefined;
  let forcedAbort = false;
  let shutdownTimer: WorkerShutdownTimer | undefined;
  const forceAbort = (code: string): void => {
    if (forcedAbort) return;
    forcedAbort = true;
    shutdownTimer?.cancel();
    shutdownTimer = undefined;
    service.abortActive(new Error(code));
  };
  const unsubscribe = signals.subscribe((signal) => {
    if (!shutdownSignal) {
      shutdownSignal = signal;
      service.requestDrain();
      shutdownTimer = scheduler.schedule(() => {
        forceAbort("PUBLICATION_EVIDENCE_GATEWAY_SHUTDOWN_DEADLINE_EXCEEDED");
      }, configuration.shutdownGraceMs);
      return;
    }
    forceAbort("PUBLICATION_EVIDENCE_GATEWAY_SECOND_SIGNAL_ABORT");
  });
  try {
    await service.start();
    const snapshot = service.snapshot();
    return Object.freeze({
      status: snapshot.state === "failed" ? "failed" : "stopped",
      configuration: summary,
      ...(shutdownSignal ? { shutdownSignal } : {}),
      forcedAbort,
      service: snapshot,
    });
  } finally {
    shutdownTimer?.cancel();
    unsubscribe();
  }
}
