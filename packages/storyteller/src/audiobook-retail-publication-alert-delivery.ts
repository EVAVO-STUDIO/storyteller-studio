import {
  AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE,
  FileAudiobookRetailPublicationAlertStore,
  assertAudiobookRetailPublicationAlert,
  recordAudiobookRetailPublicationAlertDelivery,
  type AudiobookRetailPublicationAlert,
  type AudiobookRetailPublicationAlertDeliveryStatus,
  type AudiobookRetailPublicationAlertNotification,
  type AudiobookRetailPublicationAlertSeverity,
} from "./audiobook-retail-publication-alert.js";
import { stableHash } from "./index.js";
import type { FileProjectStore } from "./project-store.js";

export type AudiobookRetailPublicationAlertDeliveryDisposition =
  | "sent"
  | "failed"
  | "already-sent"
  | "exhausted"
  | "resolved"
  | "conflict";

export interface AudiobookRetailPublicationAlertRecipientRoute {
  recipientReferenceHash: string;
  emailAddress: string;
  displayName?: string;
}

export interface AudiobookRetailPublicationAlertRecipientResolver {
  resolve(
    recipientReferenceHash: string,
    signal: AbortSignal,
  ): Promise<AudiobookRetailPublicationAlertRecipientRoute | null>;
}

export interface AudiobookRetailPublicationAlertEmailMessage {
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  templateCode: AudiobookRetailPublicationAlertNotification["templateCode"];
  idempotencyKey: string;
  messageFingerprint: string;
}

export interface AudiobookRetailPublicationAlertEmailProviderReceipt {
  receiptReference: string;
}

export interface AudiobookRetailPublicationAlertEmailProvider {
  readonly providerId: string;
  readonly adapterVersion: string;
  send(
    message: AudiobookRetailPublicationAlertEmailMessage,
    signal: AbortSignal,
  ): Promise<AudiobookRetailPublicationAlertEmailProviderReceipt>;
}

export interface AudiobookRetailPublicationAlertRenderedTemplate {
  subject: string;
  textBody: string;
  htmlBody: string;
  fingerprint: string;
}

export interface AudiobookRetailPublicationAlertTemplateRenderer {
  render(
    alert: AudiobookRetailPublicationAlert,
  ): AudiobookRetailPublicationAlertRenderedTemplate;
}

export interface AudiobookRetailPublicationAlertDeliveryDependencies {
  state: FileProjectStore;
  alerts: FileAudiobookRetailPublicationAlertStore;
  recipients: AudiobookRetailPublicationAlertRecipientResolver;
  provider: AudiobookRetailPublicationAlertEmailProvider;
  renderer?: AudiobookRetailPublicationAlertTemplateRenderer;
}

export interface DeliverAudiobookRetailPublicationAlertInput {
  alertId: string;
  workerId: string;
  providerTimeoutMs?: number;
  attemptedAt?: Date;
  signal?: AbortSignal;
}

export interface AudiobookRetailPublicationAlertDeliveryResult {
  alertId: string;
  disposition: AudiobookRetailPublicationAlertDeliveryDisposition;
  deliveryStatus: AudiobookRetailPublicationAlertDeliveryStatus;
  attemptCount: number;
  occurredAt: string;
  providerId?: string;
  failureCode?: string;
}

export interface AudiobookRetailPublicationAlertDeliveryWorkerOptions {
  workerId: string;
  concurrency?: number;
  providerTimeoutMs?: number;
  maximumBatchSize?: number;
  now?: () => Date;
}

export interface AudiobookRetailPublicationAlertDeliveryWorkerSnapshot {
  state: "idle" | "running" | "stopped" | "failed";
  discoveredAlerts: number;
  processedAlerts: number;
  sentAlerts: number;
  failedAlerts: number;
  skippedAlerts: number;
  conflictAlerts: number;
  remainingPendingAlerts: number;
  failureCode?: string;
  results: readonly AudiobookRetailPublicationAlertDeliveryResult[];
}

export class AudiobookRetailPublicationAlertDeliveryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailPublicationAlertDeliveryError";
    this.code = code;
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const MAXIMUM_EMAIL_LENGTH = 320;
const MAXIMUM_TEXT_LENGTH = 16_000;
const MAXIMUM_RECEIPT_LENGTH = 1_000;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailPublicationAlertDeliveryError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailPublicationAlertDeliveryError(code);
  }
  return value;
}

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new AudiobookRetailPublicationAlertDeliveryError(code);
  }
  return value;
}

function requireText(value: string, maximum: number, code: string): string {
  const trimmed = value.trim();
  if (
    !trimmed
    || trimmed.length > maximum
    || CONTROL_CHARACTERS.test(trimmed)
  ) {
    throw new AudiobookRetailPublicationAlertDeliveryError(code);
  }
  return trimmed;
}

function requireEmail(value: string): string {
  const email = value.trim().toLocaleLowerCase("en-AU");
  if (
    !email
    || email.length > MAXIMUM_EMAIL_LENGTH
    || !EMAIL_PATTERN.test(email)
    || CONTROL_CHARACTERS.test(email)
  ) {
    throw new AudiobookRetailPublicationAlertDeliveryError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_EMAIL_INVALID",
    );
  }
  return email;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeFailureCode(error: unknown): string {
  if (error instanceof AudiobookRetailPublicationAlertDeliveryError) {
    return error.code;
  }
  const message = error instanceof Error ? error.message : "";
  const candidate = message.match(/^[A-Z][A-Z0-9_]{2,95}/u)?.[0];
  return candidate && SAFE_CODE.test(candidate)
    ? candidate
    : "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_PROVIDER_FAILED";
}

function validateProvider(
  provider: AudiobookRetailPublicationAlertEmailProvider,
): void {
  requireIdentifier(
    provider.providerId,
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_PROVIDER_ID_INVALID",
  );
  if (!SEMVER_PATTERN.test(provider.adapterVersion)) {
    throw new AudiobookRetailPublicationAlertDeliveryError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_PROVIDER_VERSION_INVALID",
    );
  }
}

function validateRoute(
  route: AudiobookRetailPublicationAlertRecipientRoute,
  expectedReferenceHash: string,
): AudiobookRetailPublicationAlertRecipientRoute {
  if (route.recipientReferenceHash !== expectedReferenceHash) {
    throw new AudiobookRetailPublicationAlertDeliveryError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_ROUTE_MISMATCH",
    );
  }
  requireHash(
    route.recipientReferenceHash,
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_ROUTE_HASH_INVALID",
  );
  const emailAddress = requireEmail(route.emailAddress);
  const displayName = route.displayName === undefined
    ? undefined
    : requireText(
        route.displayName,
        200,
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_DISPLAY_NAME_INVALID",
      );
  return Object.freeze({
    recipientReferenceHash: route.recipientReferenceHash,
    emailAddress,
    ...(displayName ? { displayName } : {}),
  });
}

function subjectForAlert(alert: AudiobookRetailPublicationAlert): string {
  const severity = alert.severity.toLocaleUpperCase("en-AU");
  switch (alert.category) {
    case "identity-mismatch":
      return `[${severity}] Audiobook publication identity mismatch`;
    case "publication-unavailable":
      return `[${severity}] Audiobook publication unavailable`;
    case "regional-degradation":
      return `[${severity}] Audiobook publication degraded by region`;
    case "evidence-stale":
      return `[${severity}] Audiobook publication evidence is stale`;
  }
}

export function renderAudiobookRetailPublicationAlertEmail(
  alert: AudiobookRetailPublicationAlert,
): AudiobookRetailPublicationAlertRenderedTemplate {
  assertAudiobookRetailPublicationAlert(alert);
  const subject = subjectForAlert(alert);
  const findings = alert.findingCodes.length === 0
    ? "No safe finding codes were recorded."
    : alert.findingCodes.map((code) => `- ${code}`).join("\n");
  const textBody = [
    `Publication incident: ${alert.id}`,
    `Book: ${alert.bookId}`,
    `Severity: ${alert.severity}`,
    `Category: ${alert.category}`,
    `Transition: ${alert.trigger.transitionKind}`,
    `Health: ${alert.trigger.fromHealth ?? "unknown"} -> ${alert.trigger.toHealth}`,
    `Observed at: ${alert.trigger.occurredAt}`,
    "",
    "Findings:",
    findings,
    "",
    "Review the governed incident in Storyteller Studio. This message does not contain retailer credentials, raw URLs, or private evidence.",
  ].join("\n");
  const findingItems = alert.findingCodes.length === 0
    ? "<li>No safe finding codes were recorded.</li>"
    : alert.findingCodes
      .map((code) => `<li>${escapeHtml(code)}</li>`)
      .join("");
  const htmlBody = [
    `<h1>${escapeHtml(subject)}</h1>`,
    `<p><strong>Publication incident:</strong> ${escapeHtml(alert.id)}</p>`,
    `<p><strong>Book:</strong> ${escapeHtml(alert.bookId)}</p>`,
    `<p><strong>Severity:</strong> ${escapeHtml(alert.severity)}</p>`,
    `<p><strong>Category:</strong> ${escapeHtml(alert.category)}</p>`,
    `<p><strong>Transition:</strong> ${escapeHtml(alert.trigger.transitionKind)}</p>`,
    `<p><strong>Health:</strong> ${escapeHtml(alert.trigger.fromHealth ?? "unknown")} &rarr; ${escapeHtml(alert.trigger.toHealth)}</p>`,
    `<p><strong>Observed at:</strong> ${escapeHtml(alert.trigger.occurredAt)}</p>`,
    `<h2>Findings</h2><ul>${findingItems}</ul>`,
    "<p>Review the governed incident in Storyteller Studio. This message does not contain retailer credentials, raw URLs, or private evidence.</p>",
  ].join("");
  const partial = Object.freeze({ subject, textBody, htmlBody });
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
}

function rendererFrom(
  dependencies: AudiobookRetailPublicationAlertDeliveryDependencies,
): AudiobookRetailPublicationAlertTemplateRenderer {
  return dependencies.renderer ?? Object.freeze({
    render: renderAudiobookRetailPublicationAlertEmail,
  });
}

async function runWithTimeout<T>(
  timeoutMs: number,
  signal: AbortSignal | undefined,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (signal?.aborted) {
    throw new AudiobookRetailPublicationAlertDeliveryError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_ABORTED",
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new AudiobookRetailPublicationAlertDeliveryError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_TIMEOUT",
    ));
  }, timeoutMs);
  timeout.unref?.();
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<T>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(controller.signal.reason instanceof Error
            ? controller.signal.reason
            : new AudiobookRetailPublicationAlertDeliveryError(
                "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_ABORTED",
              ));
        }, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

function result(
  alert: AudiobookRetailPublicationAlert,
  disposition: AudiobookRetailPublicationAlertDeliveryDisposition,
  occurredAt: Date,
  input: Readonly<{ providerId?: string; failureCode?: string }> = {},
): AudiobookRetailPublicationAlertDeliveryResult {
  return Object.freeze({
    alertId: alert.id,
    disposition,
    deliveryStatus: alert.notification.deliveryStatus,
    attemptCount: alert.notification.attempts.length,
    occurredAt: occurredAt.toISOString(),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.failureCode ? { failureCode: input.failureCode } : {}),
  });
}

async function saveDeliveryRevision(
  dependencies: AudiobookRetailPublicationAlertDeliveryDependencies,
  previous: AudiobookRetailPublicationAlert,
  next: AudiobookRetailPublicationAlert,
  workerId: string,
  action: string,
): Promise<AudiobookRetailPublicationAlert> {
  try {
    const saved = await dependencies.alerts.save(next, {
      expectedRevision: previous.revision,
      actorId: workerId,
      action,
    });
    return saved.payload;
  } catch (error) {
    const latest = await dependencies.alerts.require(previous.id);
    if (latest.payload.notification.deliveryStatus === "sent") {
      return latest.payload;
    }
    throw new AudiobookRetailPublicationAlertDeliveryError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_SAVE_CONFLICT",
    );
  }
}

async function recordFailure(
  dependencies: AudiobookRetailPublicationAlertDeliveryDependencies,
  alert: AudiobookRetailPublicationAlert,
  workerId: string,
  attemptedAt: Date,
  failureCode: string,
): Promise<AudiobookRetailPublicationAlertDeliveryResult> {
  const failed = recordAudiobookRetailPublicationAlertDelivery(alert, {
    outcome: "failed",
    failureCode: SAFE_CODE.test(failureCode)
      ? failureCode
      : "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_FAILED",
    attemptedAt,
  });
  const saved = await saveDeliveryRevision(
    dependencies,
    alert,
    failed,
    workerId,
    "audiobook_retail_publication_alert.delivery_failed",
  );
  return result(saved, "failed", attemptedAt, {
    providerId: dependencies.provider.providerId,
    failureCode: failed.notification.attempts.at(-1)?.failureCode,
  });
}

export async function deliverAudiobookRetailPublicationAlert(
  dependencies: AudiobookRetailPublicationAlertDeliveryDependencies,
  input: DeliverAudiobookRetailPublicationAlertInput,
): Promise<AudiobookRetailPublicationAlertDeliveryResult> {
  requireIdentifier(
    input.alertId,
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_ALERT_ID_INVALID",
  );
  const workerId = requireIdentifier(
    input.workerId,
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_WORKER_ID_INVALID",
  );
  validateProvider(dependencies.provider);
  const providerTimeoutMs = requireInteger(
    input.providerTimeoutMs ?? 30_000,
    100,
    5 * 60_000,
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_TIMEOUT_INVALID",
  );
  const attemptedAt = input.attemptedAt ?? new Date();
  if (Number.isNaN(attemptedAt.getTime())) {
    throw new AudiobookRetailPublicationAlertDeliveryError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_DATE_INVALID",
    );
  }
  const envelope = await dependencies.alerts.require(input.alertId);
  const alert = envelope.payload;
  assertAudiobookRetailPublicationAlert(alert);
  if (alert.status === "resolved") return result(alert, "resolved", attemptedAt);
  if (alert.notification.deliveryStatus === "sent") {
    return result(alert, "already-sent", attemptedAt, {
      providerId: dependencies.provider.providerId,
    });
  }
  if (alert.notification.deliveryStatus === "exhausted") {
    return result(alert, "exhausted", attemptedAt, {
      providerId: dependencies.provider.providerId,
    });
  }
  if (attemptedAt.getTime() < Date.parse(alert.updatedAt)) {
    throw new AudiobookRetailPublicationAlertDeliveryError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_DATE_INVALID",
    );
  }

  let route: AudiobookRetailPublicationAlertRecipientRoute;
  try {
    const resolved = await runWithTimeout(
      providerTimeoutMs,
      input.signal,
      (signal) => dependencies.recipients.resolve(
        alert.notification.recipientReferenceHash,
        signal,
      ),
    );
    if (!resolved) {
      throw new AudiobookRetailPublicationAlertDeliveryError(
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_ROUTE_NOT_FOUND",
      );
    }
    route = validateRoute(
      resolved,
      alert.notification.recipientReferenceHash,
    );
  } catch (error) {
    if (
      input.signal?.aborted
      || safeFailureCode(error) === "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_ABORTED"
    ) {
      throw new AudiobookRetailPublicationAlertDeliveryError(
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_ABORTED",
      );
    }
    return recordFailure(
      dependencies,
      alert,
      workerId,
      attemptedAt,
      safeFailureCode(error),
    );
  }

  const rendered = rendererFrom(dependencies).render(alert);
  const subject = requireText(
    rendered.subject,
    500,
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_SUBJECT_INVALID",
  );
  const textBody = requireText(
    rendered.textBody,
    MAXIMUM_TEXT_LENGTH,
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_TEXT_INVALID",
  );
  const htmlBody = requireText(
    rendered.htmlBody,
    MAXIMUM_TEXT_LENGTH,
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_HTML_INVALID",
  );
  const messageBase = Object.freeze({
    to: route.emailAddress,
    subject,
    textBody,
    htmlBody,
    templateCode: alert.notification.templateCode,
    idempotencyKey: alert.notification.idempotencyKey,
  });
  const message: AudiobookRetailPublicationAlertEmailMessage = Object.freeze({
    ...messageBase,
    messageFingerprint: stableHash(messageBase),
  });

  try {
    const receipt = await runWithTimeout(
      providerTimeoutMs,
      input.signal,
      (signal) => dependencies.provider.send(message, signal),
    );
    const receiptReference = requireText(
      receipt.receiptReference,
      MAXIMUM_RECEIPT_LENGTH,
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_RECEIPT_INVALID",
    );
    const providerReceiptHash = stableHash({
      providerId: dependencies.provider.providerId,
      adapterVersion: dependencies.provider.adapterVersion,
      receiptReference,
    });
    const sent = recordAudiobookRetailPublicationAlertDelivery(alert, {
      outcome: "sent",
      providerReceiptHash,
      attemptedAt,
    });
    const saved = await saveDeliveryRevision(
      dependencies,
      alert,
      sent,
      workerId,
      "audiobook_retail_publication_alert.delivered",
    );
    return result(
      saved,
      saved.notification.deliveryStatus === "sent" ? "sent" : "conflict",
      attemptedAt,
      { providerId: dependencies.provider.providerId },
    );
  } catch (error) {
    if (
      input.signal?.aborted
      || safeFailureCode(error) === "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_ABORTED"
    ) {
      throw new AudiobookRetailPublicationAlertDeliveryError(
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_ABORTED",
      );
    }
    return recordFailure(
      dependencies,
      alert,
      workerId,
      attemptedAt,
      safeFailureCode(error),
    );
  }
}

const SEVERITY_PRIORITY: Readonly<Record<
  AudiobookRetailPublicationAlertSeverity,
  number
>> = Object.freeze({ critical: 0, high: 1, warning: 2 });

export async function listDeliverableAudiobookRetailPublicationAlertIds(
  state: FileProjectStore,
  alerts: FileAudiobookRetailPublicationAlertStore,
  maximum = 1_000,
): Promise<readonly string[]> {
  requireInteger(
    maximum,
    1,
    10_000,
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_LIST_LIMIT_INVALID",
  );
  const rows = await state.list(AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE);
  const deliverable: AudiobookRetailPublicationAlert[] = [];
  for (const row of rows) {
    const envelope = await alerts.require(row.entityId);
    const alert = envelope.payload;
    if (
      alert.status !== "resolved"
      && alert.notification.deliveryStatus === "pending"
    ) {
      deliverable.push(alert);
    }
  }
  deliverable.sort((left, right) =>
    SEVERITY_PRIORITY[left.severity] - SEVERITY_PRIORITY[right.severity]
    || Date.parse(left.trigger.occurredAt) - Date.parse(right.trigger.occurredAt)
    || left.id.localeCompare(right.id, "en-AU")
  );
  return Object.freeze(deliverable.slice(0, maximum).map((alert) => alert.id));
}

export class AudiobookRetailPublicationAlertDeliveryWorker {
  readonly #dependencies: AudiobookRetailPublicationAlertDeliveryDependencies;
  readonly #workerId: string;
  readonly #concurrency: number;
  readonly #providerTimeoutMs: number;
  readonly #maximumBatchSize: number;
  readonly #now: () => Date;
  #state: AudiobookRetailPublicationAlertDeliveryWorkerSnapshot["state"] = "idle";
  #failureCode: string | undefined;
  #running = false;

  constructor(
    dependencies: AudiobookRetailPublicationAlertDeliveryDependencies,
    options: AudiobookRetailPublicationAlertDeliveryWorkerOptions,
  ) {
    this.#dependencies = dependencies;
    this.#workerId = requireIdentifier(
      options.workerId,
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_WORKER_ID_INVALID",
    );
    this.#concurrency = requireInteger(
      options.concurrency ?? 2,
      1,
      16,
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_CONCURRENCY_INVALID",
    );
    this.#providerTimeoutMs = requireInteger(
      options.providerTimeoutMs ?? 30_000,
      100,
      5 * 60_000,
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_TIMEOUT_INVALID",
    );
    this.#maximumBatchSize = requireInteger(
      options.maximumBatchSize ?? 100,
      1,
      1_000,
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_BATCH_INVALID",
    );
    this.#now = options.now ?? (() => new Date());
    validateProvider(dependencies.provider);
  }

  get state(): AudiobookRetailPublicationAlertDeliveryWorkerSnapshot["state"] {
    return this.#state;
  }

  async runUntilIdle(
    signal?: AbortSignal,
  ): Promise<AudiobookRetailPublicationAlertDeliveryWorkerSnapshot> {
    if (this.#running) {
      throw new AudiobookRetailPublicationAlertDeliveryError(
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_WORKER_ALREADY_RUNNING",
      );
    }
    this.#running = true;
    this.#state = "running";
    this.#failureCode = undefined;
    const results: AudiobookRetailPublicationAlertDeliveryResult[] = [];
    let discoveredAlerts = 0;
    try {
      const ids = await listDeliverableAudiobookRetailPublicationAlertIds(
        this.#dependencies.state,
        this.#dependencies.alerts,
        this.#maximumBatchSize,
      );
      discoveredAlerts = ids.length;
      let cursor = 0;
      const workers = Array.from(
        { length: Math.min(this.#concurrency, ids.length) },
        async () => {
          while (cursor < ids.length) {
            if (signal?.aborted) {
              throw new AudiobookRetailPublicationAlertDeliveryError(
                "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_ABORTED",
              );
            }
            const index = cursor++;
            const alertId = ids[index]!;
            results[index] = await deliverAudiobookRetailPublicationAlert(
              this.#dependencies,
              {
                alertId,
                workerId: this.#workerId,
                providerTimeoutMs: this.#providerTimeoutMs,
                attemptedAt: this.#now(),
                ...(signal ? { signal } : {}),
              },
            );
          }
        },
      );
      await Promise.all(workers);
      this.#state = "stopped";
    } catch (error) {
      this.#failureCode = safeFailureCode(error);
      this.#state = "failed";
      throw error;
    } finally {
      this.#running = false;
    }
    const remainingPendingAlerts = (
      await listDeliverableAudiobookRetailPublicationAlertIds(
        this.#dependencies.state,
        this.#dependencies.alerts,
        10_000,
      )
    ).length;
    return Object.freeze({
      state: this.#state,
      discoveredAlerts,
      processedAlerts: results.length,
      sentAlerts: results.filter((item) => item.disposition === "sent").length,
      failedAlerts: results.filter((item) => item.disposition === "failed").length,
      skippedAlerts: results.filter((item) => [
        "already-sent",
        "exhausted",
        "resolved",
      ].includes(item.disposition)).length,
      conflictAlerts: results.filter((item) => item.disposition === "conflict").length,
      remainingPendingAlerts,
      ...(this.#failureCode ? { failureCode: this.#failureCode } : {}),
      results: Object.freeze([...results]),
    });
  }
}
