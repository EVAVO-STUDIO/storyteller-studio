import { lstat, readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import {
  FileAudiobookRetailPublicationAlertStore,
  assertAudiobookRetailPublicationAlert,
  type AudiobookRetailPublicationAlert,
} from "@evavo/storyteller-engine/audiobook-retail-publication-alert";
import {
  FileAudiobookRetailPublicationEvidenceInboxStore,
  assertAudiobookRetailPublicationEvidenceInboxItem,
  type AudiobookRetailPublicationEvidenceInboxItem,
} from "@evavo/storyteller-engine/audiobook-retail-publication-evidence-inbox";
import {
  FileAudiobookRetailPublicationMonitorStore,
  assertAudiobookRetailPublicationMonitor,
  type AudiobookRetailPublicationHealth,
  type AudiobookRetailPublicationMonitor,
} from "@evavo/storyteller-engine/audiobook-retail-publication-monitor";
import {
  FileProjectStore,
  type StoredEntityType,
  type StoredEnvelope,
} from "@evavo/storyteller-engine/project-store";
import { stableHash } from "@evavo/storyteller-engine";

export const PUBLICATION_OPERATIONS_READINESS_SCHEMA_VERSION =
  "storyteller-publication-operations-readiness-v1" as const;

export type PublicationOperationsOperationalStatus =
  | "empty"
  | "healthy"
  | "attention";

export interface PublicationOperationsReadinessResult {
  schemaVersion: typeof PUBLICATION_OPERATIONS_READINESS_SCHEMA_VERSION;
  status: "ready";
  operationalStatus: PublicationOperationsOperationalStatus;
  checkedAt: string;
  store: Readonly<{
    initialised: true;
    regularFileCount: number;
    auditPartitionCount: number;
    auditEventCount: number;
    activeLockFileCount: number;
    temporaryFileCount: number;
  }>;
  monitors: Readonly<{
    total: number;
    due: number;
    health: Readonly<Record<AudiobookRetailPublicationHealth, number>>;
  }>;
  evidenceInbox: Readonly<{
    total: number;
    available: number;
    acknowledged: number;
    expiredAvailable: number;
  }>;
  alerts: Readonly<{
    total: number;
    open: number;
    acknowledged: number;
    resolved: number;
    deliveryPending: number;
    deliverySent: number;
    deliveryExhausted: number;
  }>;
  fingerprint: string;
}

export class PublicationOperationsReadinessError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PublicationOperationsReadinessError";
    this.code = code;
  }
}

const DEFAULT_STALE_TEMPORARY_AFTER_MS = 5 * 60_000;
const MAXIMUM_STALE_TEMPORARY_AFTER_MS = 24 * 60 * 60_000;
const AUDIT_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}\.jsonl$/u;

interface FileScanSummary {
  regularFileCount: number;
  auditPartitionCount: number;
  auditEventCount: number;
  activeLockFileCount: number;
  temporaryFileCount: number;
  staleTemporaryFileCount: number;
}

function integer(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new PublicationOperationsReadinessError(code);
  }
  return value;
}

function assertContained(path: string, root: string): void {
  const normalisedRoot = root.endsWith(sep) ? root : `${root}${sep}`;
  if (path !== root && !path.startsWith(normalisedRoot)) {
    throw new PublicationOperationsReadinessError(
      "PUBLICATION_OPERATIONS_READINESS_PATH_ESCAPE",
    );
  }
}

function assertAuditLine(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PublicationOperationsReadinessError(
      "PUBLICATION_OPERATIONS_READINESS_AUDIT_INVALID",
    );
  }
  const event = value as Record<string, unknown>;
  if (
    event.schemaVersion !== "storyteller-audit-v1"
    || typeof event.id !== "string"
    || typeof event.occurredAt !== "string"
    || Number.isNaN(Date.parse(event.occurredAt))
    || typeof event.actorId !== "string"
    || typeof event.action !== "string"
    || typeof event.entityType !== "string"
    || typeof event.entityId !== "string"
    || typeof event.fingerprint !== "string"
    || !/^[a-f0-9]{64}$/u.test(event.fingerprint)
    || !event.metadata
    || typeof event.metadata !== "object"
    || Array.isArray(event.metadata)
  ) {
    throw new PublicationOperationsReadinessError(
      "PUBLICATION_OPERATIONS_READINESS_AUDIT_INVALID",
    );
  }
}

async function countAuditEvents(path: string): Promise<number> {
  const source = await readFile(path, "utf8");
  let count = 0;
  for (const line of source.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new PublicationOperationsReadinessError(
        "PUBLICATION_OPERATIONS_READINESS_AUDIT_JSON_INVALID",
      );
    }
    assertAuditLine(parsed);
    count += 1;
  }
  return count;
}

async function scanStateRoot(
  stateRoot: string,
  checkedAt: Date,
  staleTemporaryAfterMs: number,
): Promise<FileScanSummary> {
  const summary: FileScanSummary = {
    regularFileCount: 0,
    auditPartitionCount: 0,
    auditEventCount: 0,
    activeLockFileCount: 0,
    temporaryFileCount: 0,
    staleTemporaryFileCount: 0,
  };

  async function visit(directory: string): Promise<void> {
    assertContained(directory, stateRoot);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = resolve(directory, entry.name);
      assertContained(absolute, stateRoot);
      if (entry.isSymbolicLink()) {
        throw new PublicationOperationsReadinessError(
          "PUBLICATION_OPERATIONS_READINESS_SYMBOLIC_LINK_REJECTED",
        );
      }
      if (entry.isDirectory()) {
        await visit(absolute);
        continue;
      }
      if (!entry.isFile()) {
        throw new PublicationOperationsReadinessError(
          "PUBLICATION_OPERATIONS_READINESS_SPECIAL_FILE_REJECTED",
        );
      }
      const information = await lstat(absolute);
      if (!information.isFile()) {
        throw new PublicationOperationsReadinessError(
          "PUBLICATION_OPERATIONS_READINESS_SPECIAL_FILE_REJECTED",
        );
      }
      summary.regularFileCount += 1;
      if (entry.name.endsWith(".lock")) {
        summary.activeLockFileCount += 1;
      }
      if (entry.name.endsWith(".tmp")) {
        summary.temporaryFileCount += 1;
        if (checkedAt.getTime() - information.mtimeMs > staleTemporaryAfterMs) {
          summary.staleTemporaryFileCount += 1;
        }
      }
      const relativePath = relative(stateRoot, absolute).replaceAll("\\", "/");
      if (
        relativePath.startsWith("audit/")
        && AUDIT_FILE_PATTERN.test(entry.name)
      ) {
        summary.auditPartitionCount += 1;
        summary.auditEventCount += await countAuditEvents(absolute);
      }
    }
  }

  await visit(stateRoot);
  return summary;
}

async function readValidatedEntities<T extends { revision: number }>(input: Readonly<{
  store: FileProjectStore;
  entityType: StoredEntityType;
  assertValue(value: T): void;
}>): Promise<readonly T[]> {
  const rows = await input.store.list(input.entityType);
  const values: T[] = [];
  for (const row of rows) {
    const envelope = await input.store.read<Record<string, unknown>>(
      input.entityType,
      row.entityId,
    );
    if (!envelope) {
      throw new PublicationOperationsReadinessError(
        "PUBLICATION_OPERATIONS_READINESS_ENTITY_MISSING",
      );
    }
    const value = envelope.payload as unknown as T;
    input.assertValue(value);
    if (
      envelope.entityType !== input.entityType
      || envelope.entityId !== row.entityId
      || envelope.revision !== row.revision
      || value.revision !== envelope.revision
    ) {
      throw new PublicationOperationsReadinessError(
        "PUBLICATION_OPERATIONS_READINESS_ENTITY_SCOPE_INVALID",
      );
    }
    values.push(value);
  }
  return Object.freeze(values);
}

function monitorCounts(
  monitors: readonly AudiobookRetailPublicationMonitor[],
  checkedAt: Date,
): PublicationOperationsReadinessResult["monitors"] {
  const health: Record<AudiobookRetailPublicationHealth, number> = {
    "healthy-live": 0,
    degraded: 0,
    unavailable: 0,
    mismatch: 0,
    stale: 0,
  };
  let due = 0;
  for (const monitor of monitors) {
    health[monitor.currentHealth] += 1;
    if (Date.parse(monitor.nextRefreshDueAt) <= checkedAt.getTime()) due += 1;
  }
  return Object.freeze({
    total: monitors.length,
    due,
    health: Object.freeze(health),
  });
}

function inboxCounts(
  items: readonly AudiobookRetailPublicationEvidenceInboxItem[],
  checkedAt: Date,
): PublicationOperationsReadinessResult["evidenceInbox"] {
  let available = 0;
  let acknowledged = 0;
  let expiredAvailable = 0;
  for (const item of items) {
    if (item.status === "available") {
      available += 1;
      if (Date.parse(item.verification.observation.expiresAt) <= checkedAt.getTime()) {
        expiredAvailable += 1;
      }
    } else {
      acknowledged += 1;
    }
  }
  return Object.freeze({
    total: items.length,
    available,
    acknowledged,
    expiredAvailable,
  });
}

function alertCounts(
  alerts: readonly AudiobookRetailPublicationAlert[],
): PublicationOperationsReadinessResult["alerts"] {
  let open = 0;
  let acknowledged = 0;
  let resolved = 0;
  let deliveryPending = 0;
  let deliverySent = 0;
  let deliveryExhausted = 0;
  for (const alert of alerts) {
    if (alert.status === "open") open += 1;
    else if (alert.status === "acknowledged") acknowledged += 1;
    else resolved += 1;

    if (alert.notification.deliveryStatus === "pending") deliveryPending += 1;
    else if (alert.notification.deliveryStatus === "sent") deliverySent += 1;
    else deliveryExhausted += 1;
  }
  return Object.freeze({
    total: alerts.length,
    open,
    acknowledged,
    resolved,
    deliveryPending,
    deliverySent,
    deliveryExhausted,
  });
}

function operationalStatus(input: Readonly<{
  monitors: PublicationOperationsReadinessResult["monitors"];
  evidenceInbox: PublicationOperationsReadinessResult["evidenceInbox"];
  alerts: PublicationOperationsReadinessResult["alerts"];
}>): PublicationOperationsOperationalStatus {
  if (
    input.monitors.total === 0
    && input.evidenceInbox.total === 0
    && input.alerts.total === 0
  ) {
    return "empty";
  }
  if (
    input.monitors.due > 0
    || input.monitors.health.degraded > 0
    || input.monitors.health.unavailable > 0
    || input.monitors.health.mismatch > 0
    || input.monitors.health.stale > 0
    || input.evidenceInbox.expiredAvailable > 0
    || input.alerts.open > 0
    || input.alerts.acknowledged > 0
    || input.alerts.deliveryPending > 0
    || input.alerts.deliveryExhausted > 0
  ) {
    return "attention";
  }
  return "healthy";
}

export async function inspectPublicationOperationsReadiness(input: Readonly<{
  dataDirectory: string;
  checkedAt?: Date;
  staleTemporaryAfterMs?: number;
}>): Promise<PublicationOperationsReadinessResult> {
  const checkedAt = input.checkedAt ?? new Date();
  if (Number.isNaN(checkedAt.getTime())) {
    throw new PublicationOperationsReadinessError(
      "PUBLICATION_OPERATIONS_READINESS_DATE_INVALID",
    );
  }
  const dataDirectory = input.dataDirectory.trim();
  if (!dataDirectory) {
    throw new PublicationOperationsReadinessError(
      "PUBLICATION_OPERATIONS_READINESS_DATA_DIR_REQUIRED",
    );
  }
  const staleTemporaryAfterMs = integer(
    input.staleTemporaryAfterMs ?? DEFAULT_STALE_TEMPORARY_AFTER_MS,
    1_000,
    MAXIMUM_STALE_TEMPORARY_AFTER_MS,
    "PUBLICATION_OPERATIONS_READINESS_STALE_TEMPORARY_LIMIT_INVALID",
  );
  const stateRoot = resolve(dataDirectory, "publication-operations");
  const store = new FileProjectStore(stateRoot);

  try {
    await store.initialise();
    const monitors = await readValidatedEntities<AudiobookRetailPublicationMonitor>({
      store,
      entityType: "audiobook-retail-publication-monitor",
      assertValue: assertAudiobookRetailPublicationMonitor,
    });
    const evidenceItems = await readValidatedEntities<
      AudiobookRetailPublicationEvidenceInboxItem
    >({
      store,
      entityType: "audiobook-retail-publication-evidence-inbox",
      assertValue: assertAudiobookRetailPublicationEvidenceInboxItem,
    });
    const alerts = await readValidatedEntities<AudiobookRetailPublicationAlert>({
      store,
      entityType: "audiobook-retail-publication-alert",
      assertValue: assertAudiobookRetailPublicationAlert,
    });
    const files = await scanStateRoot(
      stateRoot,
      checkedAt,
      staleTemporaryAfterMs,
    );
    if (files.staleTemporaryFileCount > 0) {
      throw new PublicationOperationsReadinessError(
        "PUBLICATION_OPERATIONS_READINESS_STALE_TEMPORARY_FILES",
      );
    }

    const monitorSummary = monitorCounts(monitors, checkedAt);
    const evidenceInbox = inboxCounts(evidenceItems, checkedAt);
    const alertSummary = alertCounts(alerts);
    const partial: Omit<PublicationOperationsReadinessResult, "fingerprint"> = {
      schemaVersion: PUBLICATION_OPERATIONS_READINESS_SCHEMA_VERSION,
      status: "ready",
      operationalStatus: operationalStatus({
        monitors: monitorSummary,
        evidenceInbox,
        alerts: alertSummary,
      }),
      checkedAt: checkedAt.toISOString(),
      store: Object.freeze({
        initialised: true,
        regularFileCount: files.regularFileCount,
        auditPartitionCount: files.auditPartitionCount,
        auditEventCount: files.auditEventCount,
        activeLockFileCount: files.activeLockFileCount,
        temporaryFileCount: files.temporaryFileCount,
      }),
      monitors: monitorSummary,
      evidenceInbox,
      alerts: alertSummary,
    };
    return Object.freeze({
      ...partial,
      fingerprint: stableHash(partial),
    });
  } catch (error) {
    if (error instanceof PublicationOperationsReadinessError) throw error;
    throw new PublicationOperationsReadinessError(
      "PUBLICATION_OPERATIONS_READINESS_STORE_INVALID",
    );
  }
}

export function publicationOperationsReadinessSafeErrorCode(
  error: unknown,
): string {
  if (error instanceof PublicationOperationsReadinessError) return error.code;
  const message = error instanceof Error ? error.message : "";
  return message.match(/^[A-Z][A-Z0-9_]{2,95}/u)?.[0]
    ?? "PUBLICATION_OPERATIONS_READINESS_FAILED";
}

// Referencing the typed stores here makes the readiness dependency explicit while
// all reads remain delegated to the shared project store for one consistent scan.
void FileAudiobookRetailPublicationMonitorStore;
void FileAudiobookRetailPublicationEvidenceInboxStore;
void FileAudiobookRetailPublicationAlertStore;
void (undefined as unknown as StoredEnvelope<Record<string, unknown>>);
