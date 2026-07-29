import { audiobookRetailPublicationRefreshRequestFingerprint } from "@evavo/storyteller-engine/audiobook-retail-publication-evidence-inbox";
import { FileAudiobookRetailPublicationAlertStore } from "@evavo/storyteller-engine/audiobook-retail-publication-alert";
import { FileAudiobookRetailPublicationMonitorStore } from "@evavo/storyteller-engine/audiobook-retail-publication-monitor";
import {
  AudiobookRetailPublicationRefreshWorker,
  type AudiobookRetailPublicationRefreshWorkerSnapshot,
  type AudiobookRetailPublicationVerificationProvider,
} from "@evavo/storyteller-engine/audiobook-retail-publication-refresh";
import {
  assertAudiobookRetailPublicationVerification,
  type AudiobookRetailPublicationVerification,
} from "@evavo/storyteller-engine/audiobook-retail-publication-verification";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";
import type { WorkerEnvironment } from "./configuration.js";
import type {
  WorkerProcessSignal,
  WorkerShutdownScheduler,
  WorkerShutdownTimer,
  WorkerSignalSource,
} from "./lifecycle.js";
import {
  publicationRefreshRuntimeConfigurationSummary,
  type PublicationRefreshRuntimeConfiguration,
  type PublicationRefreshRuntimeConfigurationSummary,
} from "./publication-refresh-configuration.js";

export interface PublicationRefreshRuntimeWaiter {
  wait(milliseconds: number, signal: AbortSignal): Promise<void>;
}

export interface PublicationRefreshRuntimeServiceSnapshot {
  state: "idle" | "running" | "draining" | "stopped" | "failed";
  passes: number;
  dueMonitors: number;
  processedMonitors: number;
  refreshedMonitors: number;
  staleMonitors: number;
  failedMonitors: number;
  conflictMonitors: number;
  alertsCreated: number;
  alertsResolved: number;
  remainingDueMonitors: number;
  lastPassAt?: string;
  failureCode?: string;
}

export interface PublicationRefreshRuntimeServiceControl {
  start(): Promise<void>;
  runUntilIdle(): Promise<void>;
  requestDrain(): void;
  abortActive(reason?: Error): void;
  snapshot(): PublicationRefreshRuntimeServiceSnapshot;
}

export interface PublicationRefreshRuntimeDependencies {
  environment?: WorkerEnvironment;
  fetch?: typeof globalThis.fetch;
  signals?: WorkerSignalSource;
  shutdownScheduler?: WorkerShutdownScheduler;
  waiter?: PublicationRefreshRuntimeWaiter;
  now?: () => Date;
  serviceFactory?: (
    configuration: Extract<PublicationRefreshRuntimeConfiguration, { enabled: true }>,
    dependencies: Readonly<{
      state: FileProjectStore;
      monitors: FileAudiobookRetailPublicationMonitorStore;
      alerts: FileAudiobookRetailPublicationAlertStore;
      verificationProvider: AudiobookRetailPublicationVerificationProvider;
      waiter: PublicationRefreshRuntimeWaiter;
      now: () => Date;
    }>,
  ) => PublicationRefreshRuntimeServiceControl;
}

export type PublicationRefreshRuntimeResult =
  | Readonly<{
      status: "disabled";
      configuration: PublicationRefreshRuntimeConfigurationSummary;
    }>
  | Readonly<{
      status: "stopped" | "failed";
      configuration: PublicationRefreshRuntimeConfigurationSummary;
      shutdownSignal?: WorkerProcessSignal;
      forcedAbort: boolean;
      service: PublicationRefreshRuntimeServiceSnapshot;
    }>;

export class PublicationRefreshRuntimeError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PublicationRefreshRuntimeError";
    this.code = code;
  }
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const MAXIMUM_RESPONSE_BYTES = 1024 * 1024;
const MAXIMUM_FUTURE_CLOCK_SKEW_MS = 5 * 60_000;

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return message.match(/^[A-Z][A-Z0-9_]{2,95}/u)?.[0]
    ?? "PUBLICATION_REFRESH_RUNTIME_FAILED";
}

function requireSecret(value: string | undefined, code: string): string {
  const candidate = value?.trim() ?? "";
  if (!candidate || candidate.length > 8_192 || CONTROL_CHARACTERS.test(candidate)) {
    throw new PublicationRefreshRuntimeError(code);
  }
  return candidate;
}

function responseEvidence(value: unknown): AudiobookRetailPublicationVerification {
  const candidate = value && typeof value === "object" && !Array.isArray(value)
    && "verification" in value
    ? (value as Record<string, unknown>).verification
    : value;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new PublicationRefreshRuntimeError(
      "PUBLICATION_REFRESH_RUNTIME_EVIDENCE_INVALID",
    );
  }
  const verification = candidate as AudiobookRetailPublicationVerification;
  try {
    assertAudiobookRetailPublicationVerification(verification);
  } catch {
    throw new PublicationRefreshRuntimeError(
      "PUBLICATION_REFRESH_RUNTIME_EVIDENCE_INVALID",
    );
  }
  return verification;
}

export class HttpPublicationVerificationProvider
  implements AudiobookRetailPublicationVerificationProvider {
  readonly providerId: string;
  readonly adapterVersion: string;
  readonly #endpoint: string;
  readonly #token: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #now: () => Date;

  constructor(input: Readonly<{
    providerId: string;
    adapterVersion: string;
    endpoint: string;
    token: string;
    fetch?: typeof globalThis.fetch;
    now?: () => Date;
  }>) {
    this.providerId = input.providerId;
    this.adapterVersion = input.adapterVersion;
    this.#endpoint = input.endpoint;
    this.#token = requireSecret(
      input.token,
      "PUBLICATION_REFRESH_RUNTIME_TOKEN_MISSING",
    );
    this.#fetch = input.fetch ?? globalThis.fetch;
    this.#now = input.now ?? (() => new Date());
    if (typeof this.#fetch !== "function") {
      throw new PublicationRefreshRuntimeError(
        "PUBLICATION_REFRESH_RUNTIME_FETCH_REQUIRED",
      );
    }
  }

  async acquire(
    monitor: Parameters<AudiobookRetailPublicationVerificationProvider["acquire"]>[0],
    signal: AbortSignal,
  ): Promise<AudiobookRetailPublicationVerification | null> {
    if (signal.aborted) throw signal.reason;
    const latestEntry = monitor.entries.at(-1)!;
    const requestFingerprint =
      audiobookRetailPublicationRefreshRequestFingerprint(monitor);
    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#token}`,
          "content-type": "application/json",
          "idempotency-key": requestFingerprint,
          "user-agent": `storyteller-publication-refresh/${this.adapterVersion}`,
        },
        body: JSON.stringify({
          providerId: this.providerId,
          adapterVersion: this.adapterVersion,
          requestFingerprint,
          monitor: {
            id: monitor.id,
            revision: monitor.revision,
            fingerprint: monitor.fingerprint,
            projectId: monitor.projectId,
            bookId: monitor.bookId,
            listingIdentity: monitor.listingIdentity,
            requiredRegions: monitor.requiredRegions,
            currentHealth: monitor.currentHealth,
            latestVerificationStatus: monitor.latestVerificationStatus,
            latestVerificationFingerprint: latestEntry.verificationFingerprint,
            lastVerifiedAt: monitor.lastVerifiedAt,
            observationExpiresAt: monitor.observationExpiresAt,
            nextRefreshDueAt: monitor.nextRefreshDueAt,
          },
        }),
        signal,
      });
    } catch {
      if (signal.aborted) throw signal.reason;
      throw new PublicationRefreshRuntimeError(
        "PUBLICATION_REFRESH_RUNTIME_PROVIDER_NETWORK_FAILED",
      );
    }
    if (response.status === 204) return null;
    if (!response.ok) {
      throw new PublicationRefreshRuntimeError(
        response.status === 429
          ? "PUBLICATION_REFRESH_RUNTIME_PROVIDER_RATE_LIMITED"
          : response.status >= 500
            ? "PUBLICATION_REFRESH_RUNTIME_PROVIDER_UNAVAILABLE"
            : "PUBLICATION_REFRESH_RUNTIME_PROVIDER_REJECTED",
      );
    }
    const text = await response.text();
    if (!text || Buffer.byteLength(text, "utf8") > MAXIMUM_RESPONSE_BYTES) {
      throw new PublicationRefreshRuntimeError(
        text
          ? "PUBLICATION_REFRESH_RUNTIME_PROVIDER_RESPONSE_TOO_LARGE"
          : "PUBLICATION_REFRESH_RUNTIME_PROVIDER_RESPONSE_INVALID",
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new PublicationRefreshRuntimeError(
        "PUBLICATION_REFRESH_RUNTIME_PROVIDER_RESPONSE_INVALID",
      );
    }
    const verification = responseEvidence(parsed);
    const now = this.#now();
    if (
      Number.isNaN(now.getTime())
      || Date.parse(verification.observation.expiresAt) <= now.getTime()
      || Date.parse(verification.verifiedAt)
        > now.getTime() + MAXIMUM_FUTURE_CLOCK_SKEW_MS
    ) {
      throw new PublicationRefreshRuntimeError(
        "PUBLICATION_REFRESH_RUNTIME_EVIDENCE_NOT_CURRENT",
      );
    }
    return verification;
  }
}

function defaultWaiter(): PublicationRefreshRuntimeWaiter {
  return Object.freeze({
    wait(milliseconds: number, signal: AbortSignal) {
      if (signal.aborted) return Promise.reject(signal.reason);
      return new Promise<void>((resolvePromise, reject) => {
        const handle = setTimeout(resolvePromise, milliseconds);
        handle.unref?.();
        signal.addEventListener("abort", () => {
          clearTimeout(handle);
          reject(signal.reason);
        }, { once: true });
      });
    },
  });
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

export class PublicationRefreshRuntimeService
  implements PublicationRefreshRuntimeServiceControl {
  readonly #refresh: AudiobookRetailPublicationRefreshWorker;
  readonly #pollIntervalMs: number;
  readonly #waiter: PublicationRefreshRuntimeWaiter;
  readonly #now: () => Date;
  #state: PublicationRefreshRuntimeServiceSnapshot["state"] = "idle";
  #passes = 0;
  #dueMonitors = 0;
  #processedMonitors = 0;
  #refreshedMonitors = 0;
  #staleMonitors = 0;
  #failedMonitors = 0;
  #conflictMonitors = 0;
  #alertsCreated = 0;
  #alertsResolved = 0;
  #remainingDueMonitors = 0;
  #lastPassAt: string | undefined;
  #failureCode: string | undefined;
  #drainRequested = false;
  #activeController: AbortController | undefined;
  #running = false;

  constructor(input: Readonly<{
    refresh: AudiobookRetailPublicationRefreshWorker;
    pollIntervalMs: number;
    waiter?: PublicationRefreshRuntimeWaiter;
    now?: () => Date;
  }>) {
    this.#refresh = input.refresh;
    this.#pollIntervalMs = input.pollIntervalMs;
    this.#waiter = input.waiter ?? defaultWaiter();
    this.#now = input.now ?? (() => new Date());
  }

  requestDrain(): void {
    this.#drainRequested = true;
    if (this.#state === "running") this.#state = "draining";
  }

  abortActive(reason = new Error("PUBLICATION_REFRESH_RUNTIME_ABORTED")): void {
    this.#drainRequested = true;
    this.#activeController?.abort(reason);
  }

  snapshot(): PublicationRefreshRuntimeServiceSnapshot {
    return Object.freeze({
      state: this.#state,
      passes: this.#passes,
      dueMonitors: this.#dueMonitors,
      processedMonitors: this.#processedMonitors,
      refreshedMonitors: this.#refreshedMonitors,
      staleMonitors: this.#staleMonitors,
      failedMonitors: this.#failedMonitors,
      conflictMonitors: this.#conflictMonitors,
      alertsCreated: this.#alertsCreated,
      alertsResolved: this.#alertsResolved,
      remainingDueMonitors: this.#remainingDueMonitors,
      ...(this.#lastPassAt ? { lastPassAt: this.#lastPassAt } : {}),
      ...(this.#failureCode ? { failureCode: this.#failureCode } : {}),
    });
  }

  async #runPass(): Promise<AudiobookRetailPublicationRefreshWorkerSnapshot> {
    const controller = new AbortController();
    this.#activeController = controller;
    try {
      const snapshot = await this.#refresh.runUntilIdle(controller.signal);
      this.#passes += 1;
      this.#dueMonitors += snapshot.dueMonitors;
      this.#processedMonitors += snapshot.processedMonitors;
      this.#refreshedMonitors += snapshot.refreshedMonitors;
      this.#staleMonitors += snapshot.staleMonitors;
      this.#failedMonitors += snapshot.failedMonitors;
      this.#conflictMonitors += snapshot.conflictMonitors;
      this.#alertsCreated += snapshot.alertsCreated;
      this.#alertsResolved += snapshot.alertsResolved;
      this.#remainingDueMonitors = snapshot.remainingDueMonitors;
      this.#lastPassAt = this.#now().toISOString();
      return snapshot;
    } finally {
      if (this.#activeController === controller) this.#activeController = undefined;
    }
  }

  async runUntilIdle(): Promise<void> {
    if (this.#running) throw new Error("PUBLICATION_REFRESH_RUNTIME_ALREADY_RUNNING");
    this.#running = true;
    this.#state = "running";
    this.#failureCode = undefined;
    try {
      await this.#runPass();
      this.#state = "stopped";
    } catch (error) {
      this.#failureCode = safeErrorCode(error);
      this.#state = "failed";
      throw error;
    } finally {
      this.#running = false;
    }
  }

  async start(): Promise<void> {
    if (this.#running) throw new Error("PUBLICATION_REFRESH_RUNTIME_ALREADY_RUNNING");
    this.#running = true;
    this.#state = "running";
    this.#failureCode = undefined;
    this.#drainRequested = false;
    try {
      while (!this.#drainRequested) {
        await this.#runPass();
        if (this.#drainRequested) break;
        const controller = new AbortController();
        this.#activeController = controller;
        try {
          await this.#waiter.wait(this.#pollIntervalMs, controller.signal);
        } finally {
          if (this.#activeController === controller) this.#activeController = undefined;
        }
      }
      this.#state = "stopped";
    } catch (error) {
      if (this.#drainRequested) {
        this.#state = "stopped";
      } else {
        this.#failureCode = safeErrorCode(error);
        this.#state = "failed";
        throw error;
      }
    } finally {
      this.#running = false;
    }
  }
}

function createRuntimeService(
  configuration: Extract<PublicationRefreshRuntimeConfiguration, { enabled: true }>,
  dependencies: PublicationRefreshRuntimeDependencies,
): PublicationRefreshRuntimeServiceControl {
  const environment = dependencies.environment ?? process.env;
  const token = requireSecret(
    environment[configuration.verificationGateway.tokenEnvironmentVariable],
    "PUBLICATION_REFRESH_RUNTIME_TOKEN_MISSING",
  );
  const now = dependencies.now ?? (() => new Date());
  const state = new FileProjectStore(configuration.stateRootDirectory);
  const monitors = new FileAudiobookRetailPublicationMonitorStore(state);
  const alerts = new FileAudiobookRetailPublicationAlertStore(state);
  const verificationProvider = new HttpPublicationVerificationProvider({
    providerId: configuration.verificationGateway.providerId,
    adapterVersion: configuration.verificationGateway.adapterVersion,
    endpoint: configuration.verificationGateway.endpoint,
    token,
    ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}),
    now,
  });
  const waiter = dependencies.waiter ?? defaultWaiter();
  if (dependencies.serviceFactory) {
    return dependencies.serviceFactory(configuration, {
      state,
      monitors,
      alerts,
      verificationProvider,
      waiter,
      now,
    });
  }
  const refresh = new AudiobookRetailPublicationRefreshWorker(
    { state, monitors, alerts, verificationProvider },
    {
      workerId: configuration.workerId,
      recipientReferenceHash: configuration.recipientReferenceHash,
      concurrency: configuration.concurrency,
      acquisitionTimeoutMs: configuration.acquisitionTimeoutMs,
      maximumBatchSize: configuration.maximumBatchSize,
      now,
    },
  );
  return new PublicationRefreshRuntimeService({
    refresh,
    pollIntervalMs: configuration.pollIntervalMs,
    waiter,
    now,
  });
}

export async function runConfiguredPublicationRefreshRuntime(
  configuration: PublicationRefreshRuntimeConfiguration,
  dependencies: PublicationRefreshRuntimeDependencies = {},
): Promise<PublicationRefreshRuntimeResult> {
  const summary = publicationRefreshRuntimeConfigurationSummary(configuration);
  if (!configuration.enabled) {
    return Object.freeze({ status: "disabled", configuration: summary });
  }
  const service = createRuntimeService(configuration, dependencies);
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
        forceAbort("PUBLICATION_REFRESH_RUNTIME_SHUTDOWN_DEADLINE_EXCEEDED");
      }, configuration.shutdownGraceMs);
      return;
    }
    forceAbort("PUBLICATION_REFRESH_RUNTIME_SECOND_SIGNAL_ABORT");
  });
  try {
    const running = configuration.mode === "once"
      ? service.runUntilIdle()
      : service.start();
    await running;
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
