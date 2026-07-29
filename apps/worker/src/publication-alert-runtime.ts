import {
  AudiobookRetailPublicationAlertDeliveryWorker,
  type AudiobookRetailPublicationAlertDeliveryWorkerSnapshot,
  type AudiobookRetailPublicationAlertEmailMessage,
  type AudiobookRetailPublicationAlertEmailProvider,
  type AudiobookRetailPublicationAlertRecipientResolver,
  type AudiobookRetailPublicationAlertRecipientRoute,
} from "@evavo/storyteller-engine/audiobook-retail-publication-alert-delivery";
import { FileAudiobookRetailPublicationAlertStore } from "@evavo/storyteller-engine/audiobook-retail-publication-alert";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";
import type {
  WorkerProcessSignal,
  WorkerShutdownScheduler,
  WorkerShutdownTimer,
  WorkerSignalSource,
} from "./lifecycle.js";
import {
  publicationAlertRuntimeConfigurationSummary,
  type PublicationAlertRuntimeConfiguration,
  type PublicationAlertRuntimeConfigurationSummary,
} from "./publication-alert-configuration.js";
import type { WorkerEnvironment } from "./configuration.js";

export interface PublicationAlertRuntimeWaiter {
  wait(milliseconds: number, signal: AbortSignal): Promise<void>;
}

export interface PublicationAlertRuntimeServiceSnapshot {
  state: "idle" | "running" | "draining" | "stopped" | "failed";
  passes: number;
  discoveredAlerts: number;
  processedAlerts: number;
  sentAlerts: number;
  failedAlerts: number;
  skippedAlerts: number;
  conflictAlerts: number;
  remainingPendingAlerts: number;
  lastPassAt?: string;
  failureCode?: string;
}

export interface PublicationAlertRuntimeServiceControl {
  start(): Promise<void>;
  runUntilIdle(): Promise<void>;
  requestDrain(): void;
  abortActive(reason?: Error): void;
  snapshot(): PublicationAlertRuntimeServiceSnapshot;
}

export interface PublicationAlertRuntimeDependencies {
  environment?: WorkerEnvironment;
  fetch?: typeof globalThis.fetch;
  signals?: WorkerSignalSource;
  shutdownScheduler?: WorkerShutdownScheduler;
  waiter?: PublicationAlertRuntimeWaiter;
  now?: () => Date;
  serviceFactory?: (
    configuration: Extract<PublicationAlertRuntimeConfiguration, { enabled: true }>,
    dependencies: Readonly<{
      state: FileProjectStore;
      alerts: FileAudiobookRetailPublicationAlertStore;
      recipients: AudiobookRetailPublicationAlertRecipientResolver;
      provider: AudiobookRetailPublicationAlertEmailProvider;
      waiter: PublicationAlertRuntimeWaiter;
      now: () => Date;
    }>,
  ) => PublicationAlertRuntimeServiceControl;
}

export type PublicationAlertRuntimeResult =
  | Readonly<{
      status: "disabled";
      configuration: PublicationAlertRuntimeConfigurationSummary;
    }>
  | Readonly<{
      status: "stopped" | "failed";
      configuration: PublicationAlertRuntimeConfigurationSummary;
      shutdownSignal?: WorkerProcessSignal;
      forcedAbort: boolean;
      service: PublicationAlertRuntimeServiceSnapshot;
    }>;

export class PublicationAlertRuntimeError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PublicationAlertRuntimeError";
    this.code = code;
  }
}

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const RECEIPT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{1,999}$/u;
const MAXIMUM_RESPONSE_BYTES = 64 * 1024;

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return message.match(/^[A-Z][A-Z0-9_]{2,95}/u)?.[0]
    ?? "PUBLICATION_ALERT_RUNTIME_FAILED";
}

function requireEmail(value: string, code: string): string {
  const candidate = value.trim().toLocaleLowerCase("en-AU");
  if (
    !candidate
    || candidate.length > 320
    || !EMAIL_PATTERN.test(candidate)
    || CONTROL_CHARACTERS.test(candidate)
  ) {
    throw new PublicationAlertRuntimeError(code);
  }
  return candidate;
}

function requireSecret(value: string | undefined, code: string): string {
  const candidate = value?.trim() ?? "";
  if (!candidate || candidate.length > 8_192 || CONTROL_CHARACTERS.test(candidate)) {
    throw new PublicationAlertRuntimeError(code);
  }
  return candidate;
}

function requireReceipt(value: unknown): string {
  if (typeof value !== "string" || !RECEIPT_PATTERN.test(value)) {
    throw new PublicationAlertRuntimeError(
      "PUBLICATION_ALERT_RUNTIME_PROVIDER_RECEIPT_INVALID",
    );
  }
  return value;
}

function sender(fromEmail: string, fromName?: string): string {
  return fromName ? `${fromName} <${fromEmail}>` : fromEmail;
}

export class EnvironmentPublicationAlertRecipientResolver
  implements AudiobookRetailPublicationAlertRecipientResolver {
  readonly #environment: WorkerEnvironment;
  readonly #bindings: Readonly<Record<string, string>>;

  constructor(
    environment: WorkerEnvironment,
    bindings: Readonly<Record<string, string>>,
  ) {
    this.#environment = environment;
    this.#bindings = bindings;
  }

  async resolve(
    recipientReferenceHash: string,
    signal: AbortSignal,
  ): Promise<AudiobookRetailPublicationAlertRecipientRoute | null> {
    if (signal.aborted) throw signal.reason;
    if (!HASH_PATTERN.test(recipientReferenceHash)) {
      throw new PublicationAlertRuntimeError(
        "PUBLICATION_ALERT_RUNTIME_RECIPIENT_HASH_INVALID",
      );
    }
    const environmentVariable = this.#bindings[recipientReferenceHash];
    if (!environmentVariable) return null;
    const emailAddress = this.#environment[environmentVariable]?.trim();
    if (!emailAddress) return null;
    return Object.freeze({
      recipientReferenceHash,
      emailAddress: requireEmail(
        emailAddress,
        "PUBLICATION_ALERT_RUNTIME_RECIPIENT_EMAIL_INVALID",
      ),
    });
  }
}

export class HttpPublicationAlertEmailProvider
  implements AudiobookRetailPublicationAlertEmailProvider {
  readonly providerId: string;
  readonly adapterVersion: string;
  readonly #endpoint: string;
  readonly #token: string;
  readonly #from: string;
  readonly #fetch: typeof globalThis.fetch;

  constructor(input: Readonly<{
    providerId: string;
    adapterVersion: string;
    endpoint: string;
    token: string;
    fromEmail: string;
    fromName?: string;
    fetch?: typeof globalThis.fetch;
  }>) {
    this.providerId = input.providerId;
    this.adapterVersion = input.adapterVersion;
    this.#endpoint = input.endpoint;
    this.#token = requireSecret(
      input.token,
      "PUBLICATION_ALERT_RUNTIME_EMAIL_TOKEN_MISSING",
    );
    this.#from = sender(
      requireEmail(
        input.fromEmail,
        "PUBLICATION_ALERT_RUNTIME_FROM_EMAIL_INVALID",
      ),
      input.fromName,
    );
    this.#fetch = input.fetch ?? globalThis.fetch;
    if (typeof this.#fetch !== "function") {
      throw new PublicationAlertRuntimeError(
        "PUBLICATION_ALERT_RUNTIME_FETCH_REQUIRED",
      );
    }
  }

  async send(
    message: AudiobookRetailPublicationAlertEmailMessage,
    signal: AbortSignal,
  ): Promise<{ receiptReference: string }> {
    if (signal.aborted) throw signal.reason;
    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#token}`,
          "content-type": "application/json",
          "idempotency-key": message.idempotencyKey,
          "user-agent": `storyteller-publication-alert/${this.adapterVersion}`,
        },
        body: JSON.stringify({
          from: this.#from,
          to: [message.to],
          subject: message.subject,
          text: message.textBody,
          html: message.htmlBody,
          templateCode: message.templateCode,
          idempotencyKey: message.idempotencyKey,
          messageFingerprint: message.messageFingerprint,
        }),
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      throw new PublicationAlertRuntimeError(
        "PUBLICATION_ALERT_RUNTIME_PROVIDER_NETWORK_FAILED",
      );
    }
    if (!response.ok) {
      throw new PublicationAlertRuntimeError(
        response.status === 429
          ? "PUBLICATION_ALERT_RUNTIME_PROVIDER_RATE_LIMITED"
          : response.status >= 500
            ? "PUBLICATION_ALERT_RUNTIME_PROVIDER_UNAVAILABLE"
            : "PUBLICATION_ALERT_RUNTIME_PROVIDER_REJECTED",
      );
    }
    const headerReceipt = response.headers.get("x-message-id")
      ?? response.headers.get("x-request-id");
    if (headerReceipt) {
      return Object.freeze({ receiptReference: requireReceipt(headerReceipt) });
    }
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAXIMUM_RESPONSE_BYTES) {
      throw new PublicationAlertRuntimeError(
        "PUBLICATION_ALERT_RUNTIME_PROVIDER_RESPONSE_TOO_LARGE",
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new PublicationAlertRuntimeError(
        "PUBLICATION_ALERT_RUNTIME_PROVIDER_RESPONSE_INVALID",
      );
    }
    const receipt = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).id
        ?? (parsed as Record<string, unknown>).messageId
        ?? (parsed as Record<string, unknown>).requestId
      : undefined;
    return Object.freeze({ receiptReference: requireReceipt(receipt) });
  }
}

function defaultWaiter(): PublicationAlertRuntimeWaiter {
  return Object.freeze({
    wait(milliseconds, signal) {
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
    subscribe(listener) {
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
    schedule(callback, delayMs): WorkerShutdownTimer {
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

export class PublicationAlertDeliveryRuntimeService
  implements PublicationAlertRuntimeServiceControl {
  readonly #delivery: AudiobookRetailPublicationAlertDeliveryWorker;
  readonly #pollIntervalMs: number;
  readonly #waiter: PublicationAlertRuntimeWaiter;
  readonly #now: () => Date;
  #state: PublicationAlertRuntimeServiceSnapshot["state"] = "idle";
  #passes = 0;
  #discoveredAlerts = 0;
  #processedAlerts = 0;
  #sentAlerts = 0;
  #failedAlerts = 0;
  #skippedAlerts = 0;
  #conflictAlerts = 0;
  #remainingPendingAlerts = 0;
  #lastPassAt: string | undefined;
  #failureCode: string | undefined;
  #drainRequested = false;
  #activeController: AbortController | undefined;
  #running = false;

  constructor(input: Readonly<{
    delivery: AudiobookRetailPublicationAlertDeliveryWorker;
    pollIntervalMs: number;
    waiter?: PublicationAlertRuntimeWaiter;
    now?: () => Date;
  }>) {
    this.#delivery = input.delivery;
    this.#pollIntervalMs = input.pollIntervalMs;
    this.#waiter = input.waiter ?? defaultWaiter();
    this.#now = input.now ?? (() => new Date());
  }

  requestDrain(): void {
    this.#drainRequested = true;
    if (this.#state === "running") this.#state = "draining";
  }

  abortActive(reason = new Error("PUBLICATION_ALERT_RUNTIME_ABORTED")): void {
    this.#drainRequested = true;
    this.#activeController?.abort(reason);
  }

  snapshot(): PublicationAlertRuntimeServiceSnapshot {
    return Object.freeze({
      state: this.#state,
      passes: this.#passes,
      discoveredAlerts: this.#discoveredAlerts,
      processedAlerts: this.#processedAlerts,
      sentAlerts: this.#sentAlerts,
      failedAlerts: this.#failedAlerts,
      skippedAlerts: this.#skippedAlerts,
      conflictAlerts: this.#conflictAlerts,
      remainingPendingAlerts: this.#remainingPendingAlerts,
      ...(this.#lastPassAt ? { lastPassAt: this.#lastPassAt } : {}),
      ...(this.#failureCode ? { failureCode: this.#failureCode } : {}),
    });
  }

  async #runPass(): Promise<AudiobookRetailPublicationAlertDeliveryWorkerSnapshot> {
    const controller = new AbortController();
    this.#activeController = controller;
    try {
      const snapshot = await this.#delivery.runUntilIdle(controller.signal);
      this.#passes += 1;
      this.#discoveredAlerts += snapshot.discoveredAlerts;
      this.#processedAlerts += snapshot.processedAlerts;
      this.#sentAlerts += snapshot.sentAlerts;
      this.#failedAlerts += snapshot.failedAlerts;
      this.#skippedAlerts += snapshot.skippedAlerts;
      this.#conflictAlerts += snapshot.conflictAlerts;
      this.#remainingPendingAlerts = snapshot.remainingPendingAlerts;
      this.#lastPassAt = this.#now().toISOString();
      return snapshot;
    } finally {
      if (this.#activeController === controller) this.#activeController = undefined;
    }
  }

  async runUntilIdle(): Promise<void> {
    if (this.#running) throw new Error("PUBLICATION_ALERT_RUNTIME_ALREADY_RUNNING");
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
    if (this.#running) throw new Error("PUBLICATION_ALERT_RUNTIME_ALREADY_RUNNING");
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
  configuration: Extract<PublicationAlertRuntimeConfiguration, { enabled: true }>,
  dependencies: PublicationAlertRuntimeDependencies,
): PublicationAlertRuntimeServiceControl {
  const environment = dependencies.environment ?? process.env;
  const token = requireSecret(
    environment[configuration.emailGateway.tokenEnvironmentVariable],
    "PUBLICATION_ALERT_RUNTIME_EMAIL_TOKEN_MISSING",
  );
  const fromEmail = requireEmail(
    environment[configuration.emailGateway.fromEmailEnvironmentVariable] ?? "",
    "PUBLICATION_ALERT_RUNTIME_FROM_EMAIL_MISSING",
  );
  const state = new FileProjectStore(configuration.stateRootDirectory);
  const alerts = new FileAudiobookRetailPublicationAlertStore(state);
  const recipients = new EnvironmentPublicationAlertRecipientResolver(
    environment,
    configuration.recipientBindings,
  );
  const provider = new HttpPublicationAlertEmailProvider({
    providerId: configuration.emailGateway.providerId,
    adapterVersion: configuration.emailGateway.adapterVersion,
    endpoint: configuration.emailGateway.endpoint,
    token,
    fromEmail,
    ...(configuration.emailGateway.fromName
      ? { fromName: configuration.emailGateway.fromName }
      : {}),
    ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}),
  });
  const waiter = dependencies.waiter ?? defaultWaiter();
  const now = dependencies.now ?? (() => new Date());
  if (dependencies.serviceFactory) {
    return dependencies.serviceFactory(configuration, {
      state,
      alerts,
      recipients,
      provider,
      waiter,
      now,
    });
  }
  const delivery = new AudiobookRetailPublicationAlertDeliveryWorker(
    { state, alerts, recipients, provider },
    {
      workerId: configuration.workerId,
      concurrency: configuration.concurrency,
      maximumBatchSize: configuration.maximumBatchSize,
      providerTimeoutMs: configuration.providerTimeoutMs,
      now,
    },
  );
  return new PublicationAlertDeliveryRuntimeService({
    delivery,
    pollIntervalMs: configuration.pollIntervalMs,
    waiter,
    now,
  });
}

export async function runConfiguredPublicationAlertRuntime(
  configuration: PublicationAlertRuntimeConfiguration,
  dependencies: PublicationAlertRuntimeDependencies = {},
): Promise<PublicationAlertRuntimeResult> {
  const summary = publicationAlertRuntimeConfigurationSummary(configuration);
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
        forceAbort("PUBLICATION_ALERT_RUNTIME_SHUTDOWN_DEADLINE_EXCEEDED");
      }, configuration.shutdownGraceMs);
      return;
    }
    forceAbort("PUBLICATION_ALERT_RUNTIME_SECOND_SIGNAL_ABORT");
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
