import { createReadStream } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import {
  AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE,
  FileAudiobookRetailPublicationAlertStore,
  type AudiobookRetailPublicationAlert,
} from "@evavo/storyteller-engine/audiobook-retail-publication-alert";
import {
  AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_ENTITY_TYPE,
  FileAudiobookRetailPublicationEvidenceInboxStore,
  type AudiobookRetailPublicationEvidenceInboxItem,
} from "@evavo/storyteller-engine/audiobook-retail-publication-evidence-inbox";
import {
  AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTITY_TYPE,
  FileAudiobookRetailPublicationMonitorStore,
  type AudiobookRetailPublicationHealth,
  type AudiobookRetailPublicationMonitor,
} from "@evavo/storyteller-engine/audiobook-retail-publication-monitor";
import { stableHash } from "@evavo/storyteller-engine";
import {
  FileProjectStore,
  type StoredEntityType,
  type StoredEnvelope,
} from "@evavo/storyteller-engine/project-store";

export type PublicationOperationsIntegrityStatus =
  | "valid"
  | "valid-with-warnings"
  | "invalid";

export interface PublicationOperationsIntegritySummary {
  status: PublicationOperationsIntegrityStatus;
  checkedAt: string;
  monitorCount: number;
  alertCount: number;
  evidenceInboxCount: number;
  totalEntityCount: number;
  auditPartitionCount: number;
  auditEventCount: number;
  monitorHealth: Readonly<Record<AudiobookRetailPublicationHealth, number>>;
  alertStatus: Readonly<Record<"open" | "acknowledged" | "resolved", number>>;
  evidenceStatus: Readonly<Record<"available" | "acknowledged", number>>;
  issueCodes: readonly string[];
  warningCodes: readonly string[];
  fingerprint: string;
}

export class PublicationOperationsIntegrityError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PublicationOperationsIntegrityError";
    this.code = code;
  }
}

interface LayoutInspection {
  entityIds: ReadonlyMap<PublicationEntityType, readonly string[]>;
  auditPartitions: readonly Readonly<{
    date: string;
    path: string;
  }>[];
}

interface AuditEventShape {
  schemaVersion: "storyteller-audit-v1";
  id: string;
  occurredAt: string;
  actorId: string;
  action: string;
  entityType: StoredEntityType;
  entityId: string;
  revision?: number;
  requestId?: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
  fingerprint: string;
}

type PublicationEntityType =
  | typeof AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTITY_TYPE
  | typeof AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE
  | typeof AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_ENTITY_TYPE;

const PUBLICATION_ENTITY_TYPES = Object.freeze([
  AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTITY_TYPE,
  AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE,
  AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_ENTITY_TYPE,
] as const satisfies readonly PublicationEntityType[]);
const PUBLICATION_ENTITY_TYPE_SET = new Set<string>(PUBLICATION_ENTITY_TYPES);
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const SAFE_ACTION = /^[a-z][a-z0-9._-]{1,95}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const AUDIT_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}\.jsonl$/u;
const MAXIMUM_AUDIT_LINE_BYTES = 1024 * 1024;

function addCode(target: Set<string>, code: string): void {
  target.add(code);
}

function safeErrorCode(error: unknown): string {
  if (
    error
    && typeof error === "object"
    && "code" in error
    && typeof error.code === "string"
    && /^[A-Z][A-Z0-9_]{2,95}$/u.test(error.code)
  ) {
    return error.code;
  }
  const message = error instanceof Error ? error.message : "";
  return message.match(/^[A-Z][A-Z0-9_]{2,95}/u)?.[0]
    ?? "PUBLICATION_OPERATIONS_INTEGRITY_READ_FAILED";
}

function isTransientName(name: string): boolean {
  const lower = name.toLocaleLowerCase("en-AU");
  return lower.endsWith(".lock") || lower.endsWith(".tmp");
}

async function safeLstat(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

async function inspectLayout(
  root: string,
  issues: Set<string>,
): Promise<LayoutInspection> {
  const entityIds = new Map<PublicationEntityType, readonly string[]>();
  for (const entityType of PUBLICATION_ENTITY_TYPES) {
    entityIds.set(entityType, Object.freeze([]));
  }
  const auditPartitions: Array<{ date: string; path: string }> = [];
  const rootInformation = await safeLstat(root);
  if (
    !rootInformation
    || rootInformation.isSymbolicLink()
    || !rootInformation.isDirectory()
  ) {
    addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_STATE_ROOT_INVALID");
    return Object.freeze({ entityIds, auditPartitions: Object.freeze([]) });
  }

  const rootEntries = await readdir(root, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (isTransientName(entry.name)) {
      addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_TRANSIENT_FILE_PRESENT");
      continue;
    }
    if (!["entities", "audit"].includes(entry.name)) {
      addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_ROOT_LAYOUT_INVALID");
      continue;
    }
    const information = await lstat(join(root, entry.name));
    if (information.isSymbolicLink() || !information.isDirectory()) {
      addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_ROOT_LAYOUT_INVALID");
    }
  }

  const entitiesRoot = join(root, "entities");
  const entitiesInformation = await safeLstat(entitiesRoot);
  if (
    !entitiesInformation
    || entitiesInformation.isSymbolicLink()
    || !entitiesInformation.isDirectory()
  ) {
    addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_ENTITIES_DIRECTORY_INVALID");
  } else {
    const typeEntries = await readdir(entitiesRoot, { withFileTypes: true });
    for (const typeEntry of typeEntries) {
      const typePath = join(entitiesRoot, typeEntry.name);
      const information = await lstat(typePath);
      if (
        information.isSymbolicLink()
        || !information.isDirectory()
        || !PUBLICATION_ENTITY_TYPE_SET.has(typeEntry.name)
      ) {
        addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_ENTITY_TYPE_INVALID");
        continue;
      }
      const entityType = typeEntry.name as PublicationEntityType;
      const ids: string[] = [];
      const fileEntries = await readdir(typePath, { withFileTypes: true });
      fileEntries.sort((left, right) => left.name.localeCompare(right.name, "en-AU"));
      for (const fileEntry of fileEntries) {
        const filePath = join(typePath, fileEntry.name);
        const fileInformation = await lstat(filePath);
        if (isTransientName(fileEntry.name)) {
          addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_TRANSIENT_FILE_PRESENT");
          continue;
        }
        if (
          fileInformation.isSymbolicLink()
          || !fileInformation.isFile()
          || !fileEntry.name.endsWith(".json")
        ) {
          addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_ENTITY_FILE_INVALID");
          continue;
        }
        const id = fileEntry.name.slice(0, -5);
        if (!SAFE_IDENTIFIER.test(id)) {
          addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_ENTITY_ID_INVALID");
          continue;
        }
        ids.push(id);
      }
      entityIds.set(entityType, Object.freeze(ids));
    }
  }

  const auditRoot = join(root, "audit");
  const auditInformation = await safeLstat(auditRoot);
  if (
    !auditInformation
    || auditInformation.isSymbolicLink()
    || !auditInformation.isDirectory()
  ) {
    addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_AUDIT_DIRECTORY_INVALID");
  } else {
    const entries = await readdir(auditRoot, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en-AU"));
    for (const entry of entries) {
      const path = join(auditRoot, entry.name);
      const information = await lstat(path);
      if (isTransientName(entry.name)) {
        addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_TRANSIENT_FILE_PRESENT");
        continue;
      }
      if (
        information.isSymbolicLink()
        || !information.isFile()
        || !AUDIT_FILE_PATTERN.test(entry.name)
      ) {
        addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_AUDIT_FILE_INVALID");
        continue;
      }
      auditPartitions.push(Object.freeze({
        date: entry.name.slice(0, 10),
        path,
      }));
    }
  }

  return Object.freeze({
    entityIds,
    auditPartitions: Object.freeze(auditPartitions),
  });
}

function auditFingerprint(
  event: AuditEventShape,
): string {
  return stableHash({
    schemaVersion: event.schemaVersion,
    occurredAt: event.occurredAt,
    actorId: event.actorId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    ...(event.revision !== undefined ? { revision: event.revision } : {}),
    ...(event.requestId !== undefined ? { requestId: event.requestId } : {}),
    metadata: event.metadata,
  });
}

function assertAuditEvent(
  value: unknown,
  partitionDate: string,
): AuditEventShape {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PublicationOperationsIntegrityError(
      "PUBLICATION_OPERATIONS_INTEGRITY_AUDIT_EVENT_INVALID",
    );
  }
  const event = value as AuditEventShape;
  if (
    event.schemaVersion !== "storyteller-audit-v1"
    || !SAFE_IDENTIFIER.test(event.id)
    || !SAFE_IDENTIFIER.test(event.actorId)
    || !SAFE_ACTION.test(event.action)
    || !PUBLICATION_ENTITY_TYPE_SET.has(event.entityType)
    || !SAFE_IDENTIFIER.test(event.entityId)
    || !HASH_PATTERN.test(event.fingerprint)
    || Number.isNaN(Date.parse(event.occurredAt))
    || event.occurredAt.slice(0, 10) !== partitionDate
    || !event.metadata
    || typeof event.metadata !== "object"
    || Array.isArray(event.metadata)
    || (
      event.revision !== undefined
      && (!Number.isSafeInteger(event.revision) || event.revision < 1)
    )
    || (
      event.requestId !== undefined
      && !SAFE_IDENTIFIER.test(event.requestId)
    )
  ) {
    throw new PublicationOperationsIntegrityError(
      "PUBLICATION_OPERATIONS_INTEGRITY_AUDIT_EVENT_INVALID",
    );
  }
  for (const value of Object.values(event.metadata)) {
    if (
      value !== null
      && typeof value !== "string"
      && typeof value !== "number"
      && typeof value !== "boolean"
    ) {
      throw new PublicationOperationsIntegrityError(
        "PUBLICATION_OPERATIONS_INTEGRITY_AUDIT_EVENT_INVALID",
      );
    }
  }
  const fingerprint = auditFingerprint(event);
  if (
    fingerprint !== event.fingerprint
    || event.id !== `audit_${fingerprint.slice(0, 24)}`
  ) {
    throw new PublicationOperationsIntegrityError(
      "PUBLICATION_OPERATIONS_INTEGRITY_AUDIT_FINGERPRINT_INVALID",
    );
  }
  return event;
}

async function loadDomainEntities(
  state: FileProjectStore,
  layout: LayoutInspection,
  issues: Set<string>,
): Promise<Readonly<{
  monitors: ReadonlyMap<string, StoredEnvelope<AudiobookRetailPublicationMonitor>>;
  alerts: ReadonlyMap<string, StoredEnvelope<AudiobookRetailPublicationAlert>>;
  inbox: ReadonlyMap<string, StoredEnvelope<AudiobookRetailPublicationEvidenceInboxItem>>;
}>> {
  const monitorStore = new FileAudiobookRetailPublicationMonitorStore(state);
  const alertStore = new FileAudiobookRetailPublicationAlertStore(state);
  const inboxStore = new FileAudiobookRetailPublicationEvidenceInboxStore(state);
  const monitors = new Map<string, StoredEnvelope<AudiobookRetailPublicationMonitor>>();
  const alerts = new Map<string, StoredEnvelope<AudiobookRetailPublicationAlert>>();
  const inbox = new Map<string, StoredEnvelope<AudiobookRetailPublicationEvidenceInboxItem>>();

  for (const id of layout.entityIds.get(AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTITY_TYPE) ?? []) {
    try {
      monitors.set(id, await monitorStore.require(id));
    } catch {
      addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_MONITOR_ENVELOPE_INVALID");
    }
  }
  for (const id of layout.entityIds.get(AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE) ?? []) {
    try {
      alerts.set(id, await alertStore.require(id));
    } catch {
      addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_ALERT_ENVELOPE_INVALID");
    }
  }
  for (const id of layout.entityIds.get(AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_ENTITY_TYPE) ?? []) {
    try {
      inbox.set(id, await inboxStore.require(id));
    } catch {
      addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_EVIDENCE_ENVELOPE_INVALID");
    }
  }
  return Object.freeze({ monitors, alerts, inbox });
}

function validateAlertGraph(
  alerts: ReadonlyMap<string, StoredEnvelope<AudiobookRetailPublicationAlert>>,
  monitors: ReadonlyMap<string, StoredEnvelope<AudiobookRetailPublicationMonitor>>,
  issues: Set<string>,
  warnings: Set<string>,
): void {
  for (const envelope of alerts.values()) {
    const alert = envelope.payload;
    const monitorEnvelope = monitors.get(alert.monitor.id);
    if (!monitorEnvelope) {
      addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_ALERT_MONITOR_MISSING");
      continue;
    }
    const monitor = monitorEnvelope.payload;
    if (
      alert.projectId !== monitor.projectId
      || alert.bookId !== monitor.bookId
      || alert.monitor.listingIdentityId !== monitor.listingIdentity.id
      || alert.monitor.listingIdentityFingerprint !== monitor.listingIdentity.fingerprint
      || alert.monitor.revision > monitor.revision
      || (
        alert.monitor.revision === monitor.revision
        && alert.monitor.fingerprint !== monitor.fingerprint
      )
    ) {
      addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_ALERT_MONITOR_SCOPE_MISMATCH");
    }
    const trigger = monitor.transitions.find(
      (transition) => transition.sequence === alert.trigger.transitionSequence,
    );
    if (
      !trigger
      || trigger.fingerprint !== alert.trigger.transitionFingerprint
      || trigger.kind !== alert.trigger.transitionKind
      || trigger.toHealth !== alert.trigger.toHealth
      || trigger.occurredAt !== alert.trigger.occurredAt
    ) {
      addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_ALERT_TRIGGER_MISMATCH");
    }
    if (alert.resolution) {
      const recovery = monitor.transitions.find(
        (transition) =>
          transition.sequence === alert.resolution!.recoveryTransitionSequence,
      );
      if (
        !recovery
        || recovery.fingerprint
          !== alert.resolution.recoveryTransitionFingerprint
        || recovery.kind !== "recovery"
        || recovery.toHealth !== "healthy-live"
        || alert.resolution.recoveryMonitorRevision > monitor.revision
      ) {
        addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_ALERT_RESOLUTION_MISMATCH");
      }
    } else if (
      monitor.currentHealth === "healthy-live"
      && monitor.transitions.at(-1)?.kind === "recovery"
    ) {
      addCode(warnings, "PUBLICATION_OPERATIONS_INTEGRITY_ALERT_RECOVERY_PENDING");
    }
  }
}

function validateInboxGraph(
  inbox: ReadonlyMap<string, StoredEnvelope<AudiobookRetailPublicationEvidenceInboxItem>>,
  monitors: ReadonlyMap<string, StoredEnvelope<AudiobookRetailPublicationMonitor>>,
  checkedAt: Date,
  issues: Set<string>,
  warnings: Set<string>,
): void {
  for (const envelope of inbox.values()) {
    const item = envelope.payload;
    const monitorEnvelope = monitors.get(item.request.monitor.id);
    if (!monitorEnvelope) {
      addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_EVIDENCE_MONITOR_MISSING");
      continue;
    }
    const monitor = monitorEnvelope.payload;
    if (
      item.projectId !== monitor.projectId
      || item.bookId !== monitor.bookId
      || item.request.monitor.listingIdentityId !== monitor.listingIdentity.id
      || item.request.monitor.listingIdentityFingerprint
        !== monitor.listingIdentity.fingerprint
      || item.request.monitor.revision > monitor.revision
      || stableHash(item.request.requiredRegions)
        !== stableHash(monitor.requiredRegions)
      || (
        item.request.monitor.revision === monitor.revision
        && item.request.monitor.fingerprint !== monitor.fingerprint
      )
    ) {
      addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_EVIDENCE_MONITOR_SCOPE_MISMATCH");
    }
    if (
      item.verification.projectId !== monitor.projectId
      || item.verification.bookId !== monitor.bookId
      || item.verification.listingIdentity.id !== monitor.listingIdentity.id
      || item.verification.listingIdentity.fingerprint
        !== monitor.listingIdentity.fingerprint
      || stableHash(item.verification.requiredRegions)
        !== stableHash(monitor.requiredRegions)
    ) {
      addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_EVIDENCE_VERIFICATION_SCOPE_MISMATCH");
    }
    const consumedEntry = monitor.entries.find(
      (entry) =>
        entry.verificationFingerprint === item.verification.fingerprint
        && entry.verifiedAt === item.verification.verifiedAt,
    );
    if (item.acknowledgement) {
      if (
        !consumedEntry
        || item.acknowledgement.verificationFingerprint
          !== item.verification.fingerprint
        || item.acknowledgement.monitorRevision > monitor.revision
        || (
          item.acknowledgement.monitorRevision === monitor.revision
          && item.acknowledgement.monitorFingerprint !== monitor.fingerprint
        )
      ) {
        addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_EVIDENCE_ACKNOWLEDGEMENT_MISMATCH");
      }
    } else {
      if (consumedEntry) {
        addCode(warnings, "PUBLICATION_OPERATIONS_INTEGRITY_EVIDENCE_RECONCILIATION_PENDING");
      } else if (item.request.monitor.revision < monitor.revision) {
        addCode(warnings, "PUBLICATION_OPERATIONS_INTEGRITY_EVIDENCE_REQUEST_SUPERSEDED");
      }
      if (Date.parse(item.verification.observation.expiresAt) <= checkedAt.getTime()) {
        addCode(warnings, "PUBLICATION_OPERATIONS_INTEGRITY_EVIDENCE_AVAILABLE_EXPIRED");
      }
    }
  }
}

async function validateAudit(
  partitions: LayoutInspection["auditPartitions"],
  entityRevisions: ReadonlyMap<string, number>,
  issues: Set<string>,
): Promise<number> {
  const eventIds = new Set<string>();
  let count = 0;
  for (const partition of partitions) {
    const reader = createInterface({
      input: createReadStream(partition.path, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    for await (const line of reader) {
      if (!line) continue;
      count += 1;
      if (Buffer.byteLength(line, "utf8") > MAXIMUM_AUDIT_LINE_BYTES) {
        addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_AUDIT_LINE_TOO_LARGE");
        continue;
      }
      try {
        const event = assertAuditEvent(JSON.parse(line), partition.date);
        if (eventIds.has(event.id)) {
          addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_AUDIT_EVENT_DUPLICATE");
        }
        eventIds.add(event.id);
        const key = `${event.entityType}:${event.entityId}`;
        const revision = entityRevisions.get(key);
        if (revision === undefined) {
          addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_AUDIT_ENTITY_MISSING");
        } else if (
          event.revision !== undefined
          && event.revision > revision
        ) {
          addCode(issues, "PUBLICATION_OPERATIONS_INTEGRITY_AUDIT_REVISION_INVALID");
        }
      } catch (error) {
        addCode(issues, safeErrorCode(error));
      }
    }
  }
  return count;
}

function distribution<T extends string>(values: readonly T[], keys: readonly T[]): Record<T, number> {
  const output = Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
  for (const value of values) output[value] += 1;
  return output;
}

export async function verifyPublicationOperationsStateIntegrity(input: Readonly<{
  dataDirectory: string;
  checkedAt?: Date;
}>): Promise<PublicationOperationsIntegritySummary> {
  const checkedAt = input.checkedAt ?? new Date();
  if (Number.isNaN(checkedAt.getTime())) {
    throw new PublicationOperationsIntegrityError(
      "PUBLICATION_OPERATIONS_INTEGRITY_DATE_INVALID",
    );
  }
  if (!input.dataDirectory.trim()) {
    throw new PublicationOperationsIntegrityError(
      "PUBLICATION_OPERATIONS_INTEGRITY_DATA_DIR_REQUIRED",
    );
  }
  const root = resolve(input.dataDirectory, "publication-operations");
  const issues = new Set<string>();
  const warnings = new Set<string>();
  const layout = await inspectLayout(root, issues);
  const state = new FileProjectStore(root);
  const entities = await loadDomainEntities(state, layout, issues);

  validateAlertGraph(entities.alerts, entities.monitors, issues, warnings);
  validateInboxGraph(
    entities.inbox,
    entities.monitors,
    checkedAt,
    issues,
    warnings,
  );

  const entityRevisions = new Map<string, number>();
  for (const [id, envelope] of entities.monitors) {
    entityRevisions.set(
      `${AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTITY_TYPE}:${id}`,
      envelope.revision,
    );
  }
  for (const [id, envelope] of entities.alerts) {
    entityRevisions.set(
      `${AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE}:${id}`,
      envelope.revision,
    );
  }
  for (const [id, envelope] of entities.inbox) {
    entityRevisions.set(
      `${AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_ENTITY_TYPE}:${id}`,
      envelope.revision,
    );
  }
  const auditEventCount = await validateAudit(
    layout.auditPartitions,
    entityRevisions,
    issues,
  );

  if (entities.monitors.size === 0) {
    addCode(warnings, "PUBLICATION_OPERATIONS_INTEGRITY_NO_MONITORS");
  }

  const issueCodes = Object.freeze(
    [...issues].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
  const warningCodes = Object.freeze(
    [...warnings].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
  const status: PublicationOperationsIntegrityStatus = issueCodes.length > 0
    ? "invalid"
    : warningCodes.length > 0
      ? "valid-with-warnings"
      : "valid";
  const monitorHealth = Object.freeze(distribution(
    [...entities.monitors.values()].map((item) => item.payload.currentHealth),
    ["healthy-live", "degraded", "unavailable", "mismatch", "stale"],
  ));
  const alertStatus = Object.freeze(distribution(
    [...entities.alerts.values()].map((item) => item.payload.status),
    ["open", "acknowledged", "resolved"],
  ));
  const evidenceStatus = Object.freeze(distribution(
    [...entities.inbox.values()].map((item) => item.payload.status),
    ["available", "acknowledged"],
  ));
  const partial = {
    status,
    checkedAt: checkedAt.toISOString(),
    monitorCount: entities.monitors.size,
    alertCount: entities.alerts.size,
    evidenceInboxCount: entities.inbox.size,
    totalEntityCount:
      entities.monitors.size + entities.alerts.size + entities.inbox.size,
    auditPartitionCount: layout.auditPartitions.length,
    auditEventCount,
    monitorHealth,
    alertStatus,
    evidenceStatus,
    issueCodes,
    warningCodes,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
}
