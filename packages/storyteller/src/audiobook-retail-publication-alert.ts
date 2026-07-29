import {
  assertAudiobookRetailPublicationMonitor,
  type AudiobookRetailPublicationHealth,
  type AudiobookRetailPublicationMonitor,
  type AudiobookRetailPublicationMonitorTransition,
} from "./audiobook-retail-publication-monitor.js";
import { stableHash } from "./index.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";

export const AUDIOBOOK_RETAIL_PUBLICATION_ALERT_SCHEMA_VERSION =
  "storyteller-audiobook-retail-publication-alert-v1" as const;
export const AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE =
  "audiobook-retail-publication-alert" as const;

export type AudiobookRetailPublicationAlertCategory =
  | "identity-mismatch"
  | "publication-unavailable"
  | "regional-degradation"
  | "evidence-stale";
export type AudiobookRetailPublicationAlertSeverity =
  | "warning"
  | "high"
  | "critical";
export type AudiobookRetailPublicationAlertStatus =
  | "open"
  | "acknowledged"
  | "resolved";
export type AudiobookRetailPublicationAlertDeliveryStatus =
  | "pending"
  | "sent"
  | "exhausted";
export type AudiobookRetailPublicationAlertDeliveryOutcome =
  | "sent"
  | "failed";

export interface AudiobookRetailPublicationAlertDeliveryAttempt {
  attemptNumber: number;
  outcome: AudiobookRetailPublicationAlertDeliveryOutcome;
  attemptedAt: string;
  providerReceiptHash?: string;
  failureCode?: string;
  fingerprint: string;
}

export interface AudiobookRetailPublicationAlertNotification {
  id: string;
  channel: "email";
  recipientReferenceHash: string;
  idempotencyKey: string;
  templateCode:
    | "publication-identity-mismatch"
    | "publication-unavailable"
    | "publication-regional-degradation"
    | "publication-evidence-stale";
  deliveryStatus: AudiobookRetailPublicationAlertDeliveryStatus;
  maximumAttempts: 3;
  attempts: readonly AudiobookRetailPublicationAlertDeliveryAttempt[];
  createdAt: string;
  fingerprint: string;
}

export interface AudiobookRetailPublicationAlertAcknowledgement {
  acknowledgedByActorId: string;
  acknowledgedAt: string;
  notes?: string;
  fingerprint: string;
}

export interface AudiobookRetailPublicationAlertResolution {
  kind: "verified-recovery";
  recoveryMonitorRevision: number;
  recoveryMonitorFingerprint: string;
  recoveryTransitionSequence: number;
  recoveryTransitionFingerprint: string;
  resolvedByActorId: string;
  resolvedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailPublicationAlert {
  schemaVersion: typeof AUDIOBOOK_RETAIL_PUBLICATION_ALERT_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  distributor: "acx-audible";
  monitor: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
    listingIdentityId: string;
    listingIdentityFingerprint: string;
  }>;
  trigger: Readonly<{
    transitionSequence: number;
    transitionFingerprint: string;
    transitionKind: AudiobookRetailPublicationMonitorTransition["kind"];
    fromHealth?: AudiobookRetailPublicationHealth;
    toHealth: Exclude<AudiobookRetailPublicationHealth, "healthy-live">;
    occurredAt: string;
  }>;
  category: AudiobookRetailPublicationAlertCategory;
  severity: AudiobookRetailPublicationAlertSeverity;
  findingCodes: readonly string[];
  notification: AudiobookRetailPublicationAlertNotification;
  acknowledgement?: AudiobookRetailPublicationAlertAcknowledgement;
  resolution?: AudiobookRetailPublicationAlertResolution;
  status: AudiobookRetailPublicationAlertStatus;
  revision: number;
  previousFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailPublicationAlertPublicView {
  id: string;
  bookId: string;
  distributor: "acx-audible";
  category: AudiobookRetailPublicationAlertCategory;
  severity: AudiobookRetailPublicationAlertSeverity;
  trigger: Readonly<{
    transitionKind: AudiobookRetailPublicationMonitorTransition["kind"];
    fromHealth?: AudiobookRetailPublicationHealth;
    toHealth: Exclude<AudiobookRetailPublicationHealth, "healthy-live">;
    occurredAt: string;
  }>;
  findingCodes: readonly string[];
  notification: Readonly<{
    channel: "email";
    deliveryStatus: AudiobookRetailPublicationAlertDeliveryStatus;
    attemptCount: number;
    maximumAttempts: 3;
    lastAttemptAt?: string;
  }>;
  status: AudiobookRetailPublicationAlertStatus;
  acknowledgedAt?: string;
  resolvedAt?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export class AudiobookRetailPublicationAlertError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailPublicationAlertError";
    this.code = code;
  }
}

export class AudiobookRetailPublicationAlertStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudiobookRetailPublicationAlertStoreConflictError";
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;
const SAFE_FAILURE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const HUMAN_BLOCKLIST = /^(?:system|worker|automation|automated|bot)(?:[_-]|$)/iu;
const MAXIMUM_FINDINGS = 200;
const MAXIMUM_NOTES_LENGTH = 4_000;
const MAXIMUM_DELIVERY_ATTEMPTS = 3;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailPublicationAlertError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailPublicationAlertError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailPublicationAlertError(code);
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
    throw new AudiobookRetailPublicationAlertError(code);
  }
  return value;
}

function requireHumanActor(value: string, code: string): string {
  requireIdentifier(value, code);
  if (HUMAN_BLOCKLIST.test(value)) {
    throw new AudiobookRetailPublicationAlertError(code);
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
    throw new AudiobookRetailPublicationAlertError(code);
  }
  return trimmed;
}

function normaliseFindings(values: readonly string[]): readonly string[] {
  if (!Array.isArray(values) || values.length > MAXIMUM_FINDINGS) {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_FINDINGS_INVALID",
    );
  }
  const findings = new Set<string>();
  for (const value of values) {
    if (!SAFE_CODE.test(value) || findings.has(value)) {
      throw new AudiobookRetailPublicationAlertError(
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_FINDINGS_INVALID",
      );
    }
    findings.add(value);
  }
  return Object.freeze(
    [...findings].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function deliveryAttemptFingerprint(
  value: Omit<AudiobookRetailPublicationAlertDeliveryAttempt, "fingerprint">,
): string {
  return stableHash(value);
}

function notificationFingerprint(
  value: Omit<AudiobookRetailPublicationAlertNotification, "fingerprint">,
): string {
  return stableHash(value);
}

function acknowledgementFingerprint(
  value: Omit<AudiobookRetailPublicationAlertAcknowledgement, "fingerprint">,
): string {
  return stableHash(value);
}

function resolutionFingerprint(
  value: Omit<AudiobookRetailPublicationAlertResolution, "fingerprint">,
): string {
  return stableHash(value);
}

function alertFingerprint(
  value: Omit<AudiobookRetailPublicationAlert, "fingerprint">,
): string {
  return stableHash(value);
}

function categoryForHealth(
  health: Exclude<AudiobookRetailPublicationHealth, "healthy-live">,
): Readonly<{
  category: AudiobookRetailPublicationAlertCategory;
  severity: AudiobookRetailPublicationAlertSeverity;
  templateCode: AudiobookRetailPublicationAlertNotification["templateCode"];
}> {
  switch (health) {
    case "mismatch":
      return Object.freeze({
        category: "identity-mismatch",
        severity: "critical",
        templateCode: "publication-identity-mismatch",
      });
    case "unavailable":
      return Object.freeze({
        category: "publication-unavailable",
        severity: "critical",
        templateCode: "publication-unavailable",
      });
    case "degraded":
      return Object.freeze({
        category: "regional-degradation",
        severity: "high",
        templateCode: "publication-regional-degradation",
      });
    case "stale":
      return Object.freeze({
        category: "evidence-stale",
        severity: "warning",
        templateCode: "publication-evidence-stale",
      });
  }
}

function alertableTransition(
  monitor: AudiobookRetailPublicationMonitor,
): AudiobookRetailPublicationMonitorTransition {
  assertAudiobookRetailPublicationMonitor(monitor);
  const transition = monitor.transitions.at(-1)!;
  if (
    monitor.currentHealth === "healthy-live"
    || transition.toHealth === "healthy-live"
    || transition.kind === "refresh"
    || transition.kind === "recovery"
  ) {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_TRIGGER_NOT_ACTIONABLE",
    );
  }
  if (
    transition.kind !== "initialized"
    && transition.kind !== "regression"
    && transition.kind !== "state-change"
    && transition.kind !== "stale"
  ) {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_TRIGGER_NOT_ACTIONABLE",
    );
  }
  return transition;
}

function createNotification(input: Readonly<{
  incidentSeed: string;
  recipientReferenceHash: string;
  templateCode: AudiobookRetailPublicationAlertNotification["templateCode"];
  createdAt: string;
}>): AudiobookRetailPublicationAlertNotification {
  const partial: Omit<
    AudiobookRetailPublicationAlertNotification,
    "fingerprint"
  > = {
    id: `publication_alert_notification_${input.incidentSeed.slice(0, 24)}`,
    channel: "email",
    recipientReferenceHash: requireHash(
      input.recipientReferenceHash,
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_RECIPIENT_HASH_INVALID",
    ),
    idempotencyKey: stableHash({
      incidentSeed: input.incidentSeed,
      recipientReferenceHash: input.recipientReferenceHash,
    }),
    templateCode: input.templateCode,
    deliveryStatus: "pending",
    maximumAttempts: 3,
    attempts: Object.freeze([]),
    createdAt: input.createdAt,
  };
  return Object.freeze({
    ...partial,
    fingerprint: notificationFingerprint(partial),
  });
}

function deriveDeliveryStatus(
  attempts: readonly AudiobookRetailPublicationAlertDeliveryAttempt[],
): AudiobookRetailPublicationAlertDeliveryStatus {
  if (attempts.some((attempt) => attempt.outcome === "sent")) return "sent";
  if (attempts.length >= MAXIMUM_DELIVERY_ATTEMPTS) return "exhausted";
  return "pending";
}

function assertDeliveryAttempt(
  attempt: AudiobookRetailPublicationAlertDeliveryAttempt,
): void {
  requireInteger(
    attempt.attemptNumber,
    1,
    MAXIMUM_DELIVERY_ATTEMPTS,
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_ATTEMPT_NUMBER_INVALID",
  );
  requireDate(
    attempt.attemptedAt,
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_DATE_INVALID",
  );
  if (attempt.outcome === "sent") {
    requireHash(
      attempt.providerReceiptHash ?? "",
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_RECEIPT_HASH_INVALID",
    );
    if (attempt.failureCode !== undefined) {
      throw new AudiobookRetailPublicationAlertError(
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_STATE_INVALID",
      );
    }
  } else if (attempt.outcome === "failed") {
    if (
      !attempt.failureCode
      || !SAFE_FAILURE_CODE.test(attempt.failureCode)
      || attempt.providerReceiptHash !== undefined
    ) {
      throw new AudiobookRetailPublicationAlertError(
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_STATE_INVALID",
      );
    }
  } else {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_OUTCOME_INVALID",
    );
  }
  const { fingerprint, ...partial } = attempt;
  if (deliveryAttemptFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_FINGERPRINT_INVALID",
    );
  }
}

function assertNotification(
  notification: AudiobookRetailPublicationAlertNotification,
): void {
  requireIdentifier(
    notification.id,
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_NOTIFICATION_ID_INVALID",
  );
  requireHash(
    notification.recipientReferenceHash,
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_RECIPIENT_HASH_INVALID",
  );
  requireHash(
    notification.idempotencyKey,
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_IDEMPOTENCY_HASH_INVALID",
  );
  if (
    notification.channel !== "email"
    || notification.maximumAttempts !== MAXIMUM_DELIVERY_ATTEMPTS
    || ![
      "publication-identity-mismatch",
      "publication-unavailable",
      "publication-regional-degradation",
      "publication-evidence-stale",
    ].includes(notification.templateCode)
    || !Array.isArray(notification.attempts)
    || notification.attempts.length > MAXIMUM_DELIVERY_ATTEMPTS
  ) {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_NOTIFICATION_STATE_INVALID",
    );
  }
  let previousAt = Date.parse(notification.createdAt);
  for (const [index, attempt] of notification.attempts.entries()) {
    assertDeliveryAttempt(attempt);
    if (
      attempt.attemptNumber !== index + 1
      || Date.parse(attempt.attemptedAt) < previousAt
      || (
        index < notification.attempts.length - 1
        && attempt.outcome === "sent"
      )
    ) {
      throw new AudiobookRetailPublicationAlertError(
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_ORDER_INVALID",
      );
    }
    previousAt = Date.parse(attempt.attemptedAt);
  }
  if (notification.deliveryStatus !== deriveDeliveryStatus(notification.attempts)) {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_STATUS_INVALID",
    );
  }
  requireDate(
    notification.createdAt,
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_NOTIFICATION_DATE_INVALID",
  );
  const { fingerprint, ...partial } = notification;
  if (notificationFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_NOTIFICATION_FINGERPRINT_INVALID",
    );
  }
}

function reviseAlert(
  alert: AudiobookRetailPublicationAlert,
  updates: Partial<Pick<
    AudiobookRetailPublicationAlert,
    "notification" | "acknowledgement" | "resolution" | "status"
  >>,
  now: Date,
): AudiobookRetailPublicationAlert {
  assertAudiobookRetailPublicationAlert(alert);
  if (now.getTime() < Date.parse(alert.updatedAt)) {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_TIME_REVERSED",
    );
  }
  const {
    fingerprint: _fingerprint,
    previousFingerprint: _previous,
    ...base
  } = alert;
  const partial: Omit<AudiobookRetailPublicationAlert, "fingerprint"> = {
    ...base,
    ...updates,
    revision: alert.revision + 1,
    previousFingerprint: alert.fingerprint,
    createdAt: alert.createdAt,
    updatedAt: now.toISOString(),
  };
  const next = Object.freeze({
    ...partial,
    fingerprint: alertFingerprint(partial),
  });
  assertAudiobookRetailPublicationAlert(next);
  return next;
}

export function createAudiobookRetailPublicationAlert(input: Readonly<{
  monitor: AudiobookRetailPublicationMonitor;
  recipientReferenceHash: string;
  createdAt?: Date;
}>): AudiobookRetailPublicationAlert {
  const transition = alertableTransition(input.monitor);
  const createdAt = input.createdAt ?? new Date(transition.occurredAt);
  if (
    Number.isNaN(createdAt.getTime())
    || createdAt.getTime() < Date.parse(transition.occurredAt)
  ) {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DATE_INVALID",
    );
  }
  const toHealth = input.monitor.currentHealth;
  if (toHealth === "healthy-live") {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_TRIGGER_NOT_ACTIONABLE",
    );
  }
  const classification = categoryForHealth(toHealth);
  const incidentSeed = stableHash({
    monitorId: input.monitor.id,
    transitionFingerprint: transition.fingerprint,
    recipientReferenceHash: input.recipientReferenceHash,
  });
  const partial: Omit<AudiobookRetailPublicationAlert, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_PUBLICATION_ALERT_SCHEMA_VERSION,
    id: `publication_alert_${incidentSeed.slice(0, 24)}`,
    projectId: input.monitor.projectId,
    bookId: input.monitor.bookId,
    distributor: "acx-audible",
    monitor: Object.freeze({
      id: input.monitor.id,
      revision: input.monitor.revision,
      fingerprint: input.monitor.fingerprint,
      listingIdentityId: input.monitor.listingIdentity.id,
      listingIdentityFingerprint: input.monitor.listingIdentity.fingerprint,
    }),
    trigger: Object.freeze({
      transitionSequence: transition.sequence,
      transitionFingerprint: transition.fingerprint,
      transitionKind: transition.kind,
      ...(transition.fromHealth
        ? { fromHealth: transition.fromHealth }
        : {}),
      toHealth,
      occurredAt: transition.occurredAt,
    }),
    category: classification.category,
    severity: classification.severity,
    findingCodes: normaliseFindings(input.monitor.latestFindingCodes),
    notification: createNotification({
      incidentSeed,
      recipientReferenceHash: input.recipientReferenceHash,
      templateCode: classification.templateCode,
      createdAt: createdAt.toISOString(),
    }),
    status: "open",
    revision: 1,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
  };
  const alert = Object.freeze({
    ...partial,
    fingerprint: alertFingerprint(partial),
  });
  assertAudiobookRetailPublicationAlert(alert);
  assertAudiobookRetailPublicationAlertMatchesMonitor(alert, input.monitor);
  return alert;
}

export function recordAudiobookRetailPublicationAlertDelivery(
  alert: AudiobookRetailPublicationAlert,
  input: Readonly<{
    outcome: AudiobookRetailPublicationAlertDeliveryOutcome;
    attemptedAt?: Date;
    providerReceiptHash?: string;
    failureCode?: string;
  }>,
): AudiobookRetailPublicationAlert {
  assertAudiobookRetailPublicationAlert(alert);
  if (alert.notification.deliveryStatus === "sent") {
    return alert;
  }
  if (alert.notification.deliveryStatus === "exhausted") {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_EXHAUSTED",
    );
  }
  const attemptedAt = input.attemptedAt ?? new Date();
  if (
    Number.isNaN(attemptedAt.getTime())
    || attemptedAt.getTime() < Date.parse(alert.updatedAt)
  ) {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_DATE_INVALID",
    );
  }
  const attemptNumber = alert.notification.attempts.length + 1;
  let attemptBase: Omit<
    AudiobookRetailPublicationAlertDeliveryAttempt,
    "fingerprint"
  >;
  if (input.outcome === "sent") {
    attemptBase = {
      attemptNumber,
      outcome: "sent",
      attemptedAt: attemptedAt.toISOString(),
      providerReceiptHash: requireHash(
        input.providerReceiptHash ?? "",
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_RECEIPT_HASH_INVALID",
      ),
    };
    if (input.failureCode !== undefined) {
      throw new AudiobookRetailPublicationAlertError(
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_STATE_INVALID",
      );
    }
  } else if (input.outcome === "failed") {
    if (
      !input.failureCode
      || !SAFE_FAILURE_CODE.test(input.failureCode)
      || input.providerReceiptHash !== undefined
    ) {
      throw new AudiobookRetailPublicationAlertError(
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_STATE_INVALID",
      );
    }
    attemptBase = {
      attemptNumber,
      outcome: "failed",
      attemptedAt: attemptedAt.toISOString(),
      failureCode: input.failureCode,
    };
  } else {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_OUTCOME_INVALID",
    );
  }
  const attempt = Object.freeze({
    ...attemptBase,
    fingerprint: deliveryAttemptFingerprint(attemptBase),
  });
  const attempts = Object.freeze([
    ...alert.notification.attempts,
    attempt,
  ]);
  const notificationBase: Omit<
    AudiobookRetailPublicationAlertNotification,
    "fingerprint"
  > = {
    ...alert.notification,
    deliveryStatus: deriveDeliveryStatus(attempts),
    attempts,
  };
  const notification = Object.freeze({
    ...notificationBase,
    fingerprint: notificationFingerprint(notificationBase),
  });
  return reviseAlert(alert, { notification }, attemptedAt);
}

export function acknowledgeAudiobookRetailPublicationAlert(
  alert: AudiobookRetailPublicationAlert,
  input: Readonly<{
    acknowledgedByActorId: string;
    notes?: string;
    acknowledgedAt?: Date;
  }>,
): AudiobookRetailPublicationAlert {
  assertAudiobookRetailPublicationAlert(alert);
  if (alert.status === "resolved") {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_RESOLVED_IMMUTABLE",
    );
  }
  if (alert.acknowledgement) return alert;
  const acknowledgedAt = input.acknowledgedAt ?? new Date();
  if (
    Number.isNaN(acknowledgedAt.getTime())
    || acknowledgedAt.getTime() < Date.parse(alert.updatedAt)
  ) {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ACKNOWLEDGEMENT_DATE_INVALID",
    );
  }
  const notes = input.notes === undefined
    ? undefined
    : requireText(
        input.notes,
        MAXIMUM_NOTES_LENGTH,
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ACKNOWLEDGEMENT_NOTES_INVALID",
      );
  const acknowledgementBase: Omit<
    AudiobookRetailPublicationAlertAcknowledgement,
    "fingerprint"
  > = {
    acknowledgedByActorId: requireHumanActor(
      input.acknowledgedByActorId,
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ACKNOWLEDGER_INVALID",
    ),
    acknowledgedAt: acknowledgedAt.toISOString(),
    ...(notes ? { notes } : {}),
  };
  const acknowledgement = Object.freeze({
    ...acknowledgementBase,
    fingerprint: acknowledgementFingerprint(acknowledgementBase),
  });
  return reviseAlert(
    alert,
    { acknowledgement, status: "acknowledged" },
    acknowledgedAt,
  );
}

export function resolveAudiobookRetailPublicationAlert(
  alert: AudiobookRetailPublicationAlert,
  input: Readonly<{
    recoveryMonitor: AudiobookRetailPublicationMonitor;
    resolvedByActorId: string;
    resolvedAt?: Date;
  }>,
): AudiobookRetailPublicationAlert {
  assertAudiobookRetailPublicationAlert(alert);
  assertAudiobookRetailPublicationMonitor(input.recoveryMonitor);
  if (alert.status === "resolved") return alert;
  const resolvedAt = input.resolvedAt ?? new Date();
  const latestTransition = input.recoveryMonitor.transitions.at(-1)!;
  if (
    Number.isNaN(resolvedAt.getTime())
    || resolvedAt.getTime() < Date.parse(alert.updatedAt)
    || input.recoveryMonitor.id !== alert.monitor.id
    || input.recoveryMonitor.projectId !== alert.projectId
    || input.recoveryMonitor.bookId !== alert.bookId
    || input.recoveryMonitor.listingIdentity.id
      !== alert.monitor.listingIdentityId
    || input.recoveryMonitor.listingIdentity.fingerprint
      !== alert.monitor.listingIdentityFingerprint
    || input.recoveryMonitor.revision <= alert.monitor.revision
    || input.recoveryMonitor.currentHealth !== "healthy-live"
    || latestTransition.kind !== "recovery"
    || latestTransition.toHealth !== "healthy-live"
    || latestTransition.sequence <= alert.trigger.transitionSequence
    || Date.parse(latestTransition.occurredAt)
      < Date.parse(alert.trigger.occurredAt)
  ) {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_RECOVERY_INVALID",
    );
  }
  const resolutionBase: Omit<
    AudiobookRetailPublicationAlertResolution,
    "fingerprint"
  > = {
    kind: "verified-recovery",
    recoveryMonitorRevision: input.recoveryMonitor.revision,
    recoveryMonitorFingerprint: input.recoveryMonitor.fingerprint,
    recoveryTransitionSequence: latestTransition.sequence,
    recoveryTransitionFingerprint: latestTransition.fingerprint,
    resolvedByActorId: requireIdentifier(
      input.resolvedByActorId,
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_RESOLVER_INVALID",
    ),
    resolvedAt: resolvedAt.toISOString(),
  };
  const resolution = Object.freeze({
    ...resolutionBase,
    fingerprint: resolutionFingerprint(resolutionBase),
  });
  return reviseAlert(
    alert,
    { resolution, status: "resolved" },
    resolvedAt,
  );
}

export function assertAudiobookRetailPublicationAlert(
  alert: AudiobookRetailPublicationAlert,
): void {
  if (alert.schemaVersion !== AUDIOBOOK_RETAIL_PUBLICATION_ALERT_SCHEMA_VERSION) {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [alert.id, "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ID_INVALID"],
    [alert.projectId, "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_PROJECT_ID_INVALID"],
    [alert.bookId, "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_BOOK_ID_INVALID"],
    [alert.monitor.id, "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_MONITOR_ID_INVALID"],
    [alert.monitor.listingIdentityId, "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_LISTING_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  for (const [value, code] of [
    [alert.monitor.fingerprint, "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_MONITOR_HASH_INVALID"],
    [alert.monitor.listingIdentityFingerprint, "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_LISTING_HASH_INVALID"],
    [alert.trigger.transitionFingerprint, "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_TRANSITION_HASH_INVALID"],
  ] as const) requireHash(value, code);
  requireInteger(
    alert.monitor.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_MONITOR_REVISION_INVALID",
  );
  requireInteger(
    alert.trigger.transitionSequence,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_TRANSITION_SEQUENCE_INVALID",
  );
  requireDate(
    alert.trigger.occurredAt,
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_TRIGGER_DATE_INVALID",
  );
  if (
    alert.distributor !== "acx-audible"
    || alert.trigger.toHealth === "healthy-live"
  ) {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_STATE_INVALID",
    );
  }
  const classification = categoryForHealth(alert.trigger.toHealth);
  if (
    alert.category !== classification.category
    || alert.severity !== classification.severity
    || alert.notification.templateCode !== classification.templateCode
  ) {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_CLASSIFICATION_INVALID",
    );
  }
  normaliseFindings(alert.findingCodes);
  assertNotification(alert.notification);
  if (alert.acknowledgement) {
    requireHumanActor(
      alert.acknowledgement.acknowledgedByActorId,
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ACKNOWLEDGER_INVALID",
    );
    requireDate(
      alert.acknowledgement.acknowledgedAt,
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ACKNOWLEDGEMENT_DATE_INVALID",
    );
    if (alert.acknowledgement.notes !== undefined) {
      requireText(
        alert.acknowledgement.notes,
        MAXIMUM_NOTES_LENGTH,
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ACKNOWLEDGEMENT_NOTES_INVALID",
      );
    }
    const { fingerprint, ...partial } = alert.acknowledgement;
    if (acknowledgementFingerprint(partial) !== fingerprint) {
      throw new AudiobookRetailPublicationAlertError(
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ACKNOWLEDGEMENT_FINGERPRINT_INVALID",
      );
    }
  }
  if (alert.resolution) {
    if (
      alert.resolution.kind !== "verified-recovery"
      || alert.resolution.recoveryMonitorRevision <= alert.monitor.revision
      || alert.resolution.recoveryTransitionSequence
        <= alert.trigger.transitionSequence
    ) {
      throw new AudiobookRetailPublicationAlertError(
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_RESOLUTION_STATE_INVALID",
      );
    }
    for (const [value, code] of [
      [alert.resolution.recoveryMonitorFingerprint, "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_RECOVERY_MONITOR_HASH_INVALID"],
      [alert.resolution.recoveryTransitionFingerprint, "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_RECOVERY_TRANSITION_HASH_INVALID"],
    ] as const) requireHash(value, code);
    requireIdentifier(
      alert.resolution.resolvedByActorId,
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_RESOLVER_INVALID",
    );
    requireDate(
      alert.resolution.resolvedAt,
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_RESOLUTION_DATE_INVALID",
    );
    const { fingerprint, ...partial } = alert.resolution;
    if (resolutionFingerprint(partial) !== fingerprint) {
      throw new AudiobookRetailPublicationAlertError(
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_RESOLUTION_FINGERPRINT_INVALID",
      );
    }
  }
  const expectedStatus: AudiobookRetailPublicationAlertStatus = alert.resolution
    ? "resolved"
    : alert.acknowledgement
      ? "acknowledged"
      : "open";
  if (alert.status !== expectedStatus) {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_STATUS_INVALID",
    );
  }
  requireInteger(
    alert.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_REVISION_INVALID",
  );
  for (const value of [alert.createdAt, alert.updatedAt]) {
    requireDate(value, "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DATE_INVALID");
  }
  if (
    Date.parse(alert.updatedAt) < Date.parse(alert.createdAt)
    || (alert.revision === 1 && alert.previousFingerprint !== undefined)
    || (
      alert.revision > 1
      && !HASH_PATTERN.test(alert.previousFingerprint ?? "")
    )
  ) {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_REVISION_CHAIN_INVALID",
    );
  }
  const { fingerprint, ...partial } = alert;
  if (alertFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailPublicationAlertMatchesMonitor(
  alert: AudiobookRetailPublicationAlert,
  monitor: AudiobookRetailPublicationMonitor,
): void {
  assertAudiobookRetailPublicationAlert(alert);
  const transition = alertableTransition(monitor);
  if (
    alert.projectId !== monitor.projectId
    || alert.bookId !== monitor.bookId
    || alert.monitor.id !== monitor.id
    || alert.monitor.revision !== monitor.revision
    || alert.monitor.fingerprint !== monitor.fingerprint
    || alert.monitor.listingIdentityId !== monitor.listingIdentity.id
    || alert.monitor.listingIdentityFingerprint
      !== monitor.listingIdentity.fingerprint
    || alert.trigger.transitionSequence !== transition.sequence
    || alert.trigger.transitionFingerprint !== transition.fingerprint
    || alert.trigger.transitionKind !== transition.kind
    || alert.trigger.toHealth !== monitor.currentHealth
    || stableHash(alert.findingCodes)
      !== stableHash(monitor.latestFindingCodes)
  ) {
    throw new AudiobookRetailPublicationAlertError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_SOURCE_MISMATCH",
    );
  }
}

export function audiobookRetailPublicationAlertPublicView(
  alert: AudiobookRetailPublicationAlert,
): AudiobookRetailPublicationAlertPublicView {
  assertAudiobookRetailPublicationAlert(alert);
  const lastAttempt = alert.notification.attempts.at(-1);
  return Object.freeze({
    id: alert.id,
    bookId: alert.bookId,
    distributor: "acx-audible",
    category: alert.category,
    severity: alert.severity,
    trigger: Object.freeze({
      transitionKind: alert.trigger.transitionKind,
      ...(alert.trigger.fromHealth
        ? { fromHealth: alert.trigger.fromHealth }
        : {}),
      toHealth: alert.trigger.toHealth,
      occurredAt: alert.trigger.occurredAt,
    }),
    findingCodes: alert.findingCodes,
    notification: Object.freeze({
      channel: "email",
      deliveryStatus: alert.notification.deliveryStatus,
      attemptCount: alert.notification.attempts.length,
      maximumAttempts: 3,
      ...(lastAttempt ? { lastAttemptAt: lastAttempt.attemptedAt } : {}),
    }),
    status: alert.status,
    ...(alert.acknowledgement
      ? { acknowledgedAt: alert.acknowledgement.acknowledgedAt }
      : {}),
    ...(alert.resolution ? { resolvedAt: alert.resolution.resolvedAt } : {}),
    revision: alert.revision,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt,
    fingerprint: alert.fingerprint,
  });
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<AudiobookRetailPublicationAlert> {
  const alert = envelope.payload as unknown as AudiobookRetailPublicationAlert;
  assertAudiobookRetailPublicationAlert(alert);
  if (
    envelope.entityType !== AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE
    || envelope.entityId !== alert.id
    || envelope.revision !== alert.revision
  ) {
    throw new AudiobookRetailPublicationAlertStoreConflictError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<AudiobookRetailPublicationAlert>;
}

export class FileAudiobookRetailPublicationAlertStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    alert: AudiobookRetailPublicationAlert,
    actorId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPublicationAlert>> {
    assertAudiobookRetailPublicationAlert(alert);
    requireIdentifier(
      actorId,
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_STORE_ACTOR_INVALID",
    );
    const existing = await this.read(alert.id);
    if (existing) {
      if (existing.payload.fingerprint === alert.fingerprint) return existing;
      throw new AudiobookRetailPublicationAlertStoreConflictError(
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_STORE_IDEMPOTENCY_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.create(
        AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE,
        alert.id,
        alert as unknown as Record<string, unknown>,
        new Date(alert.createdAt),
      ));
      await this.#audit(actorId, "audiobook_retail_publication_alert.created", envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailPublicationAlertStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(
    alertId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPublicationAlert> | null> {
    requireIdentifier(
      alertId,
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_STORE_ID_INVALID",
    );
    const envelope = await this.#store.read<Record<string, unknown>>(
      AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE,
      alertId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(
    alertId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPublicationAlert>> {
    const envelope = await this.read(alertId);
    if (!envelope) {
      throw new AudiobookRetailPublicationAlertStoreConflictError(
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }

  async save(
    alert: AudiobookRetailPublicationAlert,
    input: Readonly<{
      expectedRevision: number;
      actorId: string;
      action: string;
    }>,
  ): Promise<StoredEnvelope<AudiobookRetailPublicationAlert>> {
    assertAudiobookRetailPublicationAlert(alert);
    requireIdentifier(
      input.actorId,
      "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_STORE_ACTOR_INVALID",
    );
    if (
      !/^audiobook_retail_publication_alert\.[a-z][a-z0-9._-]{1,80}$/u.test(
        input.action,
      )
    ) {
      throw new AudiobookRetailPublicationAlertStoreConflictError(
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_STORE_ACTION_INVALID",
      );
    }
    const current = await this.require(alert.id);
    if (
      current.revision !== input.expectedRevision
      || alert.revision !== current.payload.revision + 1
      || alert.previousFingerprint !== current.payload.fingerprint
    ) {
      throw new AudiobookRetailPublicationAlertStoreConflictError(
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_STORE_REVISION_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.replace(
        AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE,
        alert.id,
        input.expectedRevision,
        alert as unknown as Record<string, unknown>,
        new Date(alert.updatedAt),
      ));
      await this.#audit(input.actorId, input.action, envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailPublicationAlertStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async #audit(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<AudiobookRetailPublicationAlert>,
  ): Promise<void> {
    await this.#store.appendAuditEvent({
      actorId,
      action,
      entityType: AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE,
      entityId: envelope.entityId,
      revision: envelope.revision,
      occurredAt: new Date(envelope.savedAt),
      metadata: {
        category: envelope.payload.category,
        severity: envelope.payload.severity,
        status: envelope.payload.status,
        triggerKind: envelope.payload.trigger.transitionKind,
        triggerHealth: envelope.payload.trigger.toHealth,
        findingCount: envelope.payload.findingCodes.length,
        notificationDeliveryStatus:
          envelope.payload.notification.deliveryStatus,
        notificationAttemptCount:
          envelope.payload.notification.attempts.length,
        acknowledged: envelope.payload.acknowledgement !== undefined,
        resolved: envelope.payload.resolution !== undefined,
      },
    });
  }
}
