import { stableHash } from "./index.js";
import {
  assertAdmittedNarratorRetailPublicationMonitor,
  admittedNarratorRetailPublicationMonitorPublicView,
  type AdmittedNarratorRetailPublicationMonitor,
} from "./narrator-retail-publication-monitor-admission.js";
import {
  assertAdmittedNarratorRetailPublicationOperation,
  type AdmittedNarratorRetailPublicationOperation,
  type AdmittedNarratorRetailPublicationOperationKind,
} from "./narrator-retail-publication-operations-admission.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEntityType,
  type StoredEnvelope,
} from "./project-store.js";

export const ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_ENTITY_TYPE =
  "admitted-narrator-retail-publication-monitor" as const;
export const ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_ENTITY_TYPE =
  "admitted-narrator-retail-publication-operation-intent" as const;
export const ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_SCHEMA =
  "storyteller-admitted-narrator-retail-publication-operation-intent-v1" as const;

export type AdmittedNarratorRetailPublicationOperationIntentStatus =
  | "prepared"
  | "committed";

export interface AdmittedNarratorRetailPublicationOperationIntent {
  schemaVersion:
    typeof ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_SCHEMA;
  id: string;
  monitorId: string;
  operation: AdmittedNarratorRetailPublicationOperation;
  expectedMonitorRevision: number;
  expectedAdmittedMonitorFingerprint: string;
  expectedGenericMonitorFingerprint: string;
  targetMonitorRevision: number;
  targetAdmittedMonitorFingerprint: string;
  targetGenericMonitorFingerprint: string;
  preparedByActorId: string;
  committedByActorId?: string;
  status: AdmittedNarratorRetailPublicationOperationIntentStatus;
  writeAheadReserved: true;
  monitorMutationCommitted: boolean;
  automaticRefreshAuthority: false;
  automaticRemediationAuthority: false;
  automaticRepublishAuthority: false;
  publicationAuthority: false;
  revision: number;
  previousFingerprint?: string;
  preparedAt: string;
  committedAt?: string;
  updatedAt: string;
  fingerprint: string;
}

export type AdmittedNarratorRetailPublicationOperationIntentInspectionState =
  | "ready"
  | "monitor-applied-intent-pending"
  | "committed"
  | "conflict";

export interface AdmittedNarratorRetailPublicationOperationIntentInspection {
  intentId: string;
  monitorId: string;
  operationFingerprint: string;
  intentStatus: AdmittedNarratorRetailPublicationOperationIntentStatus;
  state: AdmittedNarratorRetailPublicationOperationIntentInspectionState;
  expectedMonitorRevision: number;
  targetMonitorRevision: number;
  currentMonitorRevision: number;
  inspectedAt: string;
}

export interface AdmittedNarratorRetailPublicationOperationCommitResult {
  intent: StoredEnvelope<AdmittedNarratorRetailPublicationOperationIntent>;
  monitor: StoredEnvelope<AdmittedNarratorRetailPublicationMonitor>;
  recoveredPreparedIntent: boolean;
}

export interface AdmittedNarratorRetailPublicationOperationIntentPublicView {
  bookId: string;
  distributor: "acx-audible";
  marketplace: "audible";
  audiobookAsin: string;
  displayTitle: string;
  narratorCredit: string;
  operationKind: AdmittedNarratorRetailPublicationOperationKind;
  expectedMonitorRevision: number;
  targetMonitorRevision: number;
  targetHealth: AdmittedNarratorRetailPublicationMonitor["currentHealth"];
  transitionKind:
    AdmittedNarratorRetailPublicationMonitor["monitor"]["transitions"][number]["kind"];
  intentStatus: AdmittedNarratorRetailPublicationOperationIntentStatus;
  writeAheadReserved: true;
  monitorMutationCommitted: boolean;
  evidenceAcknowledged: boolean;
  incidentCreated: boolean;
  narratorAdmissionComplete: true;
  admittedListingIdentityBound: true;
  narratorLineageBound: true;
  publicProductIdentityBound: true;
  automaticRefreshAuthority: false;
  automaticRemediationAuthority: false;
  automaticRepublishAuthority: false;
  publicationAuthority: false;
  preparedAt: string;
  committedAt?: string;
  updatedAt: string;
  fingerprint: string;
}

export class AdmittedNarratorRetailPublicationOperationsStoreError
  extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AdmittedNarratorRetailPublicationOperationsStoreError";
    this.code = code;
  }
}

export class AdmittedNarratorRetailPublicationOperationsStoreConflictError
  extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AdmittedNarratorRetailPublicationOperationsStoreConflictError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;

function privateEntityType(value: string): StoredEntityType {
  return value as StoredEntityType;
}

const monitorEntityType = privateEntityType(
  ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_ENTITY_TYPE,
);
const intentEntityType = privateEntityType(
  ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_ENTITY_TYPE,
);

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new AdmittedNarratorRetailPublicationOperationsStoreError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new AdmittedNarratorRetailPublicationOperationsStoreError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new AdmittedNarratorRetailPublicationOperationsStoreError(code);
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
    throw new AdmittedNarratorRetailPublicationOperationsStoreError(code);
  }
  return value;
}

function intentBase(
  value: Omit<AdmittedNarratorRetailPublicationOperationIntent, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function intentIdFor(
  operation: AdmittedNarratorRetailPublicationOperation,
): string {
  return `admitted_narrator_publication_operation_${stableHash({
    monitorId: operation.previousMonitor.monitor.id,
    operationFingerprint: operation.fingerprint,
  }).slice(0, 24)}`;
}

function assertAuthorityBoundary(
  value: Pick<
    AdmittedNarratorRetailPublicationOperationIntent,
    | "automaticRefreshAuthority"
    | "automaticRemediationAuthority"
    | "automaticRepublishAuthority"
    | "publicationAuthority"
  >,
): void {
  if (
    value.automaticRefreshAuthority !== false
    || value.automaticRemediationAuthority !== false
    || value.automaticRepublishAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorRetailPublicationOperationsStoreError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_AUTHORITY_INVALID",
    );
  }
}

function createPreparedIntent(input: Readonly<{
  operation: AdmittedNarratorRetailPublicationOperation;
  preparedByActorId: string;
  preparedAt: Date;
}>): AdmittedNarratorRetailPublicationOperationIntent {
  assertAdmittedNarratorRetailPublicationOperation(input.operation);
  if (
    Number.isNaN(input.preparedAt.getTime())
    || input.preparedAt.getTime() < Date.parse(input.operation.occurredAt)
  ) {
    throw new AdmittedNarratorRetailPublicationOperationsStoreError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_PREPARED_DATE_INVALID",
    );
  }
  const preparedAt = input.preparedAt.toISOString();
  const partial: Omit<
    AdmittedNarratorRetailPublicationOperationIntent,
    "fingerprint"
  > = {
    schemaVersion:
      ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_SCHEMA,
    id: intentIdFor(input.operation),
    monitorId: input.operation.previousMonitor.monitor.id,
    operation: input.operation,
    expectedMonitorRevision:
      input.operation.previousMonitor.monitor.revision,
    expectedAdmittedMonitorFingerprint:
      input.operation.previousMonitor.fingerprint,
    expectedGenericMonitorFingerprint:
      input.operation.previousMonitor.monitor.fingerprint,
    targetMonitorRevision: input.operation.monitor.monitor.revision,
    targetAdmittedMonitorFingerprint: input.operation.monitor.fingerprint,
    targetGenericMonitorFingerprint:
      input.operation.monitor.monitor.fingerprint,
    preparedByActorId: requireIdentifier(
      input.preparedByActorId,
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_PREPARER_INVALID",
    ),
    status: "prepared",
    writeAheadReserved: true,
    monitorMutationCommitted: false,
    automaticRefreshAuthority: false,
    automaticRemediationAuthority: false,
    automaticRepublishAuthority: false,
    publicationAuthority: false,
    revision: 1,
    preparedAt,
    updatedAt: preparedAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(intentBase(partial)),
  });
  assertAdmittedNarratorRetailPublicationOperationIntent(value);
  return value;
}

function commitPreparedIntent(
  value: AdmittedNarratorRetailPublicationOperationIntent,
  input: Readonly<{
    committedByActorId: string;
    committedAt: Date;
  }>,
): AdmittedNarratorRetailPublicationOperationIntent {
  assertAdmittedNarratorRetailPublicationOperationIntent(value);
  if (value.status === "committed") return value;
  if (
    Number.isNaN(input.committedAt.getTime())
    || input.committedAt.getTime() < Date.parse(value.updatedAt)
  ) {
    throw new AdmittedNarratorRetailPublicationOperationsStoreError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_COMMITTED_DATE_INVALID",
    );
  }
  const {
    fingerprint: _fingerprint,
    previousFingerprint: _previousFingerprint,
    committedByActorId: _committedByActorId,
    committedAt: _committedAt,
    ...base
  } = value;
  const partial: Omit<
    AdmittedNarratorRetailPublicationOperationIntent,
    "fingerprint"
  > = {
    ...base,
    committedByActorId: requireIdentifier(
      input.committedByActorId,
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_COMMITTER_INVALID",
    ),
    status: "committed",
    monitorMutationCommitted: true,
    revision: 2,
    previousFingerprint: value.fingerprint,
    committedAt: input.committedAt.toISOString(),
    updatedAt: input.committedAt.toISOString(),
  };
  const committed = Object.freeze({
    ...partial,
    fingerprint: stableHash(intentBase(partial)),
  });
  assertAdmittedNarratorRetailPublicationOperationIntent(committed);
  return committed;
}

export function assertAdmittedNarratorRetailPublicationOperationIntent(
  value: AdmittedNarratorRetailPublicationOperationIntent,
): void {
  if (
    value.schemaVersion
      !== ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_SCHEMA
  ) {
    throw new AdmittedNarratorRetailPublicationOperationsStoreError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_SCHEMA_UNSUPPORTED",
    );
  }
  assertAdmittedNarratorRetailPublicationOperation(value.operation);
  for (const [identifier, code] of [
    [value.id, "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_ID_INVALID"],
    [value.monitorId, "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_MONITOR_ID_INVALID"],
    [value.preparedByActorId, "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_PREPARER_INVALID"],
  ] as const) requireIdentifier(identifier, code);
  for (const [hash, code] of [
    [value.expectedAdmittedMonitorFingerprint, "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_EXPECTED_ADMITTED_HASH_INVALID"],
    [value.expectedGenericMonitorFingerprint, "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_EXPECTED_GENERIC_HASH_INVALID"],
    [value.targetAdmittedMonitorFingerprint, "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_TARGET_ADMITTED_HASH_INVALID"],
    [value.targetGenericMonitorFingerprint, "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_TARGET_GENERIC_HASH_INVALID"],
  ] as const) requireHash(hash, code);
  requireInteger(
    value.expectedMonitorRevision,
    1,
    Number.MAX_SAFE_INTEGER - 1,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_EXPECTED_REVISION_INVALID",
  );
  requireInteger(
    value.targetMonitorRevision,
    2,
    Number.MAX_SAFE_INTEGER,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_TARGET_REVISION_INVALID",
  );
  const previous = value.operation.previousMonitor;
  const target = value.operation.monitor;
  if (
    value.id !== intentIdFor(value.operation)
    || value.monitorId !== previous.monitor.id
    || value.monitorId !== target.monitor.id
    || value.expectedMonitorRevision !== previous.monitor.revision
    || value.expectedAdmittedMonitorFingerprint !== previous.fingerprint
    || value.expectedGenericMonitorFingerprint !== previous.monitor.fingerprint
    || value.targetMonitorRevision !== target.monitor.revision
    || value.targetMonitorRevision !== value.expectedMonitorRevision + 1
    || value.targetAdmittedMonitorFingerprint !== target.fingerprint
    || value.targetGenericMonitorFingerprint !== target.monitor.fingerprint
    || target.monitor.previousFingerprint !== previous.monitor.fingerprint
  ) {
    throw new AdmittedNarratorRetailPublicationOperationsStoreError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_LINEAGE_INVALID",
    );
  }
  requireDate(
    value.preparedAt,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_PREPARED_DATE_INVALID",
  );
  requireDate(
    value.updatedAt,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_UPDATED_DATE_INVALID",
  );
  if (
    Date.parse(value.preparedAt) < Date.parse(value.operation.occurredAt)
    || Date.parse(value.updatedAt) < Date.parse(value.preparedAt)
    || value.writeAheadReserved !== true
  ) {
    throw new AdmittedNarratorRetailPublicationOperationsStoreError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_STATE_INVALID",
    );
  }
  if (value.status === "prepared") {
    if (
      value.monitorMutationCommitted !== false
      || value.committedByActorId !== undefined
      || value.committedAt !== undefined
      || value.revision !== 1
      || value.previousFingerprint !== undefined
      || value.updatedAt !== value.preparedAt
    ) {
      throw new AdmittedNarratorRetailPublicationOperationsStoreError(
        "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_PREPARED_STATE_INVALID",
      );
    }
  } else if (value.status === "committed") {
    requireIdentifier(
      value.committedByActorId ?? "",
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_COMMITTER_INVALID",
    );
    requireDate(
      value.committedAt ?? "",
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_COMMITTED_DATE_INVALID",
    );
    requireHash(
      value.previousFingerprint ?? "",
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_PREVIOUS_HASH_INVALID",
    );
    if (
      value.monitorMutationCommitted !== true
      || value.revision !== 2
      || value.updatedAt !== value.committedAt
      || Date.parse(value.committedAt ?? "") < Date.parse(value.preparedAt)
    ) {
      throw new AdmittedNarratorRetailPublicationOperationsStoreError(
        "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_COMMITTED_STATE_INVALID",
      );
    }
  } else {
    throw new AdmittedNarratorRetailPublicationOperationsStoreError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_STATUS_INVALID",
    );
  }
  assertAuthorityBoundary(value);
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(intentBase(partial))) {
    throw new AdmittedNarratorRetailPublicationOperationsStoreError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_FINGERPRINT_INVALID",
    );
  }
}

function toMonitorEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<AdmittedNarratorRetailPublicationMonitor> {
  const monitor = envelope.payload as unknown as
    AdmittedNarratorRetailPublicationMonitor;
  assertAdmittedNarratorRetailPublicationMonitor(monitor);
  if (
    envelope.entityType !== monitorEntityType
    || envelope.entityId !== monitor.monitor.id
    || envelope.revision !== monitor.monitor.revision
  ) {
    throw new AdmittedNarratorRetailPublicationOperationsStoreConflictError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<
    AdmittedNarratorRetailPublicationMonitor
  >;
}

function toIntentEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<AdmittedNarratorRetailPublicationOperationIntent> {
  const intent = envelope.payload as unknown as
    AdmittedNarratorRetailPublicationOperationIntent;
  assertAdmittedNarratorRetailPublicationOperationIntent(intent);
  if (
    envelope.entityType !== intentEntityType
    || envelope.entityId !== intent.id
    || envelope.revision !== intent.revision
  ) {
    throw new AdmittedNarratorRetailPublicationOperationsStoreConflictError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<
    AdmittedNarratorRetailPublicationOperationIntent
  >;
}

function samePreviousMonitor(
  envelope: StoredEnvelope<AdmittedNarratorRetailPublicationMonitor>,
  intent: AdmittedNarratorRetailPublicationOperationIntent,
): boolean {
  return (
    envelope.revision === intent.expectedMonitorRevision
    && envelope.payload.fingerprint
      === intent.expectedAdmittedMonitorFingerprint
    && envelope.payload.monitor.fingerprint
      === intent.expectedGenericMonitorFingerprint
  );
}

function sameTargetMonitor(
  envelope: StoredEnvelope<AdmittedNarratorRetailPublicationMonitor>,
  intent: AdmittedNarratorRetailPublicationOperationIntent,
): boolean {
  return (
    envelope.revision === intent.targetMonitorRevision
    && envelope.payload.fingerprint
      === intent.targetAdmittedMonitorFingerprint
    && envelope.payload.monitor.fingerprint
      === intent.targetGenericMonitorFingerprint
  );
}

export function admittedNarratorRetailPublicationOperationIntentPublicView(
  value: AdmittedNarratorRetailPublicationOperationIntent,
): AdmittedNarratorRetailPublicationOperationIntentPublicView {
  assertAdmittedNarratorRetailPublicationOperationIntent(value);
  const monitor = admittedNarratorRetailPublicationMonitorPublicView(
    value.operation.monitor,
    new Date(value.updatedAt),
  );
  const transition = value.operation.monitor.monitor.transitions.at(-1)!;
  return Object.freeze({
    bookId: value.operation.monitor.bookId,
    distributor: "acx-audible",
    marketplace: "audible",
    audiobookAsin: value.operation.monitor.audiobookAsin,
    displayTitle: monitor.displayTitle,
    narratorCredit: monitor.narratorCredit,
    operationKind: value.operation.kind,
    expectedMonitorRevision: value.expectedMonitorRevision,
    targetMonitorRevision: value.targetMonitorRevision,
    targetHealth: value.operation.monitor.currentHealth,
    transitionKind: transition.kind,
    intentStatus: value.status,
    writeAheadReserved: true,
    monitorMutationCommitted: value.monitorMutationCommitted,
    evidenceAcknowledged: value.operation.evidenceAcknowledged,
    incidentCreated: value.operation.incidentCreated,
    narratorAdmissionComplete: true,
    admittedListingIdentityBound: true,
    narratorLineageBound: true,
    publicProductIdentityBound: true,
    automaticRefreshAuthority: false,
    automaticRemediationAuthority: false,
    automaticRepublishAuthority: false,
    publicationAuthority: false,
    preparedAt: value.preparedAt,
    ...(value.committedAt ? { committedAt: value.committedAt } : {}),
    updatedAt: value.updatedAt,
    fingerprint: value.fingerprint,
  });
}

export class FileAdmittedNarratorRetailPublicationOperationsStore {
  readonly #state: FileProjectStore;

  constructor(state: FileProjectStore) {
    this.#state = state;
  }

  async createMonitor(
    monitor: AdmittedNarratorRetailPublicationMonitor,
    actorId: string,
  ): Promise<StoredEnvelope<AdmittedNarratorRetailPublicationMonitor>> {
    assertAdmittedNarratorRetailPublicationMonitor(monitor);
    const validatedActorId = requireIdentifier(
      actorId,
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_STORE_ACTOR_INVALID",
    );
    if (
      monitor.monitor.revision !== 1
      || monitor.monitor.previousFingerprint !== undefined
    ) {
      throw new AdmittedNarratorRetailPublicationOperationsStoreError(
        "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_STORE_GENESIS_REQUIRED",
      );
    }
    const existing = await this.readMonitor(monitor.monitor.id);
    if (existing) {
      if (existing.payload.fingerprint === monitor.fingerprint) return existing;
      throw new AdmittedNarratorRetailPublicationOperationsStoreConflictError(
        "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_STORE_IDEMPOTENCY_CONFLICT",
      );
    }
    try {
      const envelope = toMonitorEnvelope(await this.#state.create(
        monitorEntityType,
        monitor.monitor.id,
        monitor as unknown as Record<string, unknown>,
        new Date(monitor.monitor.createdAt),
      ));
      await this.#auditMonitor(
        validatedActorId,
        "admitted_narrator_retail_publication_monitor.created",
        envelope,
      );
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        const concurrent = await this.readMonitor(monitor.monitor.id);
        if (concurrent?.payload.fingerprint === monitor.fingerprint) {
          return concurrent;
        }
        throw new AdmittedNarratorRetailPublicationOperationsStoreConflictError(
          "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_STORE_CREATE_CONFLICT",
        );
      }
      throw error;
    }
  }

  async readMonitor(
    monitorId: string,
  ): Promise<StoredEnvelope<AdmittedNarratorRetailPublicationMonitor> | null> {
    requireIdentifier(
      monitorId,
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_STORE_ID_INVALID",
    );
    const envelope = await this.#state.read<Record<string, unknown>>(
      monitorEntityType,
      monitorId,
    );
    return envelope ? toMonitorEnvelope(envelope) : null;
  }

  async requireMonitor(
    monitorId: string,
  ): Promise<StoredEnvelope<AdmittedNarratorRetailPublicationMonitor>> {
    const envelope = await this.readMonitor(monitorId);
    if (!envelope) {
      throw new AdmittedNarratorRetailPublicationOperationsStoreConflictError(
        "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }

  async prepareOperation(
    operation: AdmittedNarratorRetailPublicationOperation,
    input: Readonly<{
      actorId: string;
      preparedAt?: Date;
    }>,
  ): Promise<StoredEnvelope<AdmittedNarratorRetailPublicationOperationIntent>> {
    assertAdmittedNarratorRetailPublicationOperation(operation);
    const actorId = requireIdentifier(
      input.actorId,
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_PREPARER_INVALID",
    );
    const existingId = intentIdFor(operation);
    const existing = await this.readIntent(existingId);
    if (existing) {
      if (existing.payload.operation.fingerprint === operation.fingerprint) {
        return existing;
      }
      throw new AdmittedNarratorRetailPublicationOperationsStoreConflictError(
        "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_STORE_IDEMPOTENCY_CONFLICT",
      );
    }
    const current = await this.requireMonitor(operation.previousMonitor.monitor.id);
    if (
      current.payload.fingerprint !== operation.previousMonitor.fingerprint
      || current.payload.monitor.fingerprint
        !== operation.previousMonitor.monitor.fingerprint
      || current.revision !== operation.previousMonitor.monitor.revision
    ) {
      throw new AdmittedNarratorRetailPublicationOperationsStoreConflictError(
        "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_CURRENT_MONITOR_CONFLICT",
      );
    }
    const intent = createPreparedIntent({
      operation,
      preparedByActorId: actorId,
      preparedAt: input.preparedAt ?? new Date(),
    });
    try {
      const envelope = toIntentEnvelope(await this.#state.create(
        intentEntityType,
        intent.id,
        intent as unknown as Record<string, unknown>,
        new Date(intent.preparedAt),
      ));
      await this.#auditIntent(
        actorId,
        "admitted_narrator_retail_publication_operation.prepared",
        envelope,
      );
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        const concurrent = await this.readIntent(intent.id);
        if (
          concurrent?.payload.operation.fingerprint === operation.fingerprint
        ) {
          return concurrent;
        }
        throw new AdmittedNarratorRetailPublicationOperationsStoreConflictError(
          "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_STORE_CREATE_CONFLICT",
        );
      }
      throw error;
    }
  }

  async readIntent(
    intentId: string,
  ): Promise<StoredEnvelope<AdmittedNarratorRetailPublicationOperationIntent> | null> {
    requireIdentifier(
      intentId,
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_STORE_ID_INVALID",
    );
    const envelope = await this.#state.read<Record<string, unknown>>(
      intentEntityType,
      intentId,
    );
    return envelope ? toIntentEnvelope(envelope) : null;
  }

  async requireIntent(
    intentId: string,
  ): Promise<StoredEnvelope<AdmittedNarratorRetailPublicationOperationIntent>> {
    const envelope = await this.readIntent(intentId);
    if (!envelope) {
      throw new AdmittedNarratorRetailPublicationOperationsStoreConflictError(
        "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }

  async inspectIntent(
    intentId: string,
    inspectedAt = new Date(),
  ): Promise<AdmittedNarratorRetailPublicationOperationIntentInspection> {
    if (Number.isNaN(inspectedAt.getTime())) {
      throw new AdmittedNarratorRetailPublicationOperationsStoreError(
        "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_INSPECTION_DATE_INVALID",
      );
    }
    const intentEnvelope = await this.requireIntent(intentId);
    const intent = intentEnvelope.payload;
    const monitor = await this.requireMonitor(intent.monitorId);
    let targetClaimedByAnotherCommittedIntent = false;
    if (intent.status === "prepared" && sameTargetMonitor(monitor, intent)) {
      const rows = await this.#state.list(intentEntityType);
      for (const row of rows) {
        if (row.entityId === intent.id) continue;
        const candidate = (await this.requireIntent(row.entityId)).payload;
        if (
          candidate.monitorId === intent.monitorId
          && candidate.status === "committed"
          && candidate.targetMonitorRevision === intent.targetMonitorRevision
          && candidate.targetAdmittedMonitorFingerprint
            === intent.targetAdmittedMonitorFingerprint
          && candidate.targetGenericMonitorFingerprint
            === intent.targetGenericMonitorFingerprint
          && candidate.operation.fingerprint !== intent.operation.fingerprint
        ) {
          targetClaimedByAnotherCommittedIntent = true;
          break;
        }
      }
    }
    let state: AdmittedNarratorRetailPublicationOperationIntentInspectionState;
    if (intent.status === "prepared" && samePreviousMonitor(monitor, intent)) {
      state = "ready";
    } else if (
      intent.status === "prepared"
      && sameTargetMonitor(monitor, intent)
      && !targetClaimedByAnotherCommittedIntent
    ) {
      state = "monitor-applied-intent-pending";
    } else if (
      intent.status === "committed"
      && sameTargetMonitor(monitor, intent)
    ) {
      state = "committed";
    } else {
      state = "conflict";
    }
    return Object.freeze({
      intentId: intent.id,
      monitorId: intent.monitorId,
      operationFingerprint: intent.operation.fingerprint,
      intentStatus: intent.status,
      state,
      expectedMonitorRevision: intent.expectedMonitorRevision,
      targetMonitorRevision: intent.targetMonitorRevision,
      currentMonitorRevision: monitor.revision,
      inspectedAt: inspectedAt.toISOString(),
    });
  }

  async commitOperation(
    intentId: string,
    input: Readonly<{
      actorId: string;
      committedAt?: Date;
    }>,
  ): Promise<AdmittedNarratorRetailPublicationOperationCommitResult> {
    const actorId = requireIdentifier(
      input.actorId,
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_COMMITTER_INVALID",
    );
    const committedAt = input.committedAt ?? new Date();
    if (Number.isNaN(committedAt.getTime())) {
      throw new AdmittedNarratorRetailPublicationOperationsStoreError(
        "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_COMMITTED_DATE_INVALID",
      );
    }
    let intentEnvelope = await this.requireIntent(intentId);
    let inspection = await this.inspectIntent(intentId, committedAt);
    if (intentEnvelope.payload.status === "committed") {
      if (inspection.state !== "committed") {
        throw new AdmittedNarratorRetailPublicationOperationsStoreConflictError(
          "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_COMMITTED_MONITOR_CONFLICT",
        );
      }
      return Object.freeze({
        intent: intentEnvelope,
        monitor: await this.requireMonitor(intentEnvelope.payload.monitorId),
        recoveredPreparedIntent: false,
      });
    }
    if (
      inspection.state !== "ready"
      && inspection.state !== "monitor-applied-intent-pending"
    ) {
      throw new AdmittedNarratorRetailPublicationOperationsStoreConflictError(
        "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_CURRENT_MONITOR_CONFLICT",
      );
    }

    const recoveredPreparedIntent =
      inspection.state === "monitor-applied-intent-pending";
    let monitorEnvelope: StoredEnvelope<
      AdmittedNarratorRetailPublicationMonitor
    >;
    if (inspection.state === "ready") {
      try {
        monitorEnvelope = toMonitorEnvelope(await this.#state.replace(
          monitorEntityType,
          intentEnvelope.payload.monitorId,
          intentEnvelope.payload.expectedMonitorRevision,
          intentEnvelope.payload.operation.monitor as unknown as
            Record<string, unknown>,
          committedAt,
        ));
        await this.#auditMonitor(
          actorId,
          "admitted_narrator_retail_publication_monitor.advanced",
          monitorEnvelope,
        );
      } catch (error) {
        if (!(error instanceof StoreConflictError)) throw error;
        const concurrent = await this.requireMonitor(
          intentEnvelope.payload.monitorId,
        );
        if (!sameTargetMonitor(concurrent, intentEnvelope.payload)) {
          throw new AdmittedNarratorRetailPublicationOperationsStoreConflictError(
            "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_MONITOR_SAVE_CONFLICT",
          );
        }
        monitorEnvelope = concurrent;
      }
    } else {
      monitorEnvelope = await this.requireMonitor(intentEnvelope.payload.monitorId);
      await this.#auditMonitor(
        actorId,
        "admitted_narrator_retail_publication_monitor.advance_recovered",
        monitorEnvelope,
      );
    }

    const committed = commitPreparedIntent(intentEnvelope.payload, {
      committedByActorId: actorId,
      committedAt,
    });
    try {
      intentEnvelope = toIntentEnvelope(await this.#state.replace(
        intentEntityType,
        committed.id,
        1,
        committed as unknown as Record<string, unknown>,
        committedAt,
      ));
      await this.#auditIntent(
        actorId,
        "admitted_narrator_retail_publication_operation.committed",
        intentEnvelope,
      );
    } catch (error) {
      if (!(error instanceof StoreConflictError)) throw error;
      const concurrent = await this.requireIntent(committed.id);
      if (
        concurrent.payload.status !== "committed"
        || concurrent.payload.operation.fingerprint
          !== committed.operation.fingerprint
        || concurrent.payload.targetAdmittedMonitorFingerprint
          !== committed.targetAdmittedMonitorFingerprint
      ) {
        throw new AdmittedNarratorRetailPublicationOperationsStoreConflictError(
          "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_STORE_COMMIT_CONFLICT",
        );
      }
      intentEnvelope = concurrent;
    }
    inspection = await this.inspectIntent(intentId, committedAt);
    if (inspection.state !== "committed") {
      throw new AdmittedNarratorRetailPublicationOperationsStoreConflictError(
        "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_FINAL_STATE_INVALID",
      );
    }
    return Object.freeze({
      intent: intentEnvelope,
      monitor: monitorEnvelope,
      recoveredPreparedIntent,
    });
  }

  async listPreparedIntentIds(
    maximum = 1_000,
  ): Promise<readonly string[]> {
    requireInteger(
      maximum,
      1,
      10_000,
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_LIST_LIMIT_INVALID",
    );
    const rows = await this.#state.list(intentEntityType);
    const prepared: AdmittedNarratorRetailPublicationOperationIntent[] = [];
    for (const row of rows) {
      const intent = (await this.requireIntent(row.entityId)).payload;
      if (intent.status === "prepared") prepared.push(intent);
    }
    prepared.sort((left, right) =>
      Date.parse(left.preparedAt) - Date.parse(right.preparedAt)
      || left.id.localeCompare(right.id, "en-AU")
    );
    return Object.freeze(
      prepared.slice(0, maximum).map((intent) => intent.id),
    );
  }

  async #auditMonitor(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<AdmittedNarratorRetailPublicationMonitor>,
  ): Promise<void> {
    const transition = envelope.payload.monitor.transitions.at(-1)!;
    await this.#state.appendAuditEvent({
      actorId,
      action,
      entityType: monitorEntityType,
      entityId: envelope.entityId,
      revision: envelope.revision,
      occurredAt: new Date(envelope.savedAt),
      metadata: {
        currentHealth: envelope.payload.currentHealth,
        latestVerificationStatus:
          envelope.payload.latestVerificationStatus,
        monitorRevision: envelope.payload.monitor.revision,
        verificationCount: envelope.payload.verifications.length,
        transitionCount: envelope.payload.monitor.transitions.length,
        latestTransitionKind: transition.kind,
        incidentRequired:
          envelope.payload.currentHealth !== "healthy-live"
          && transition.kind !== "refresh"
          && transition.kind !== "recovery",
        staleEvidence: envelope.payload.staleEvidence,
        automaticRemediationAuthority: false,
        automaticRepublishAuthority: false,
        publicationAuthority: false,
      },
    });
  }

  async #auditIntent(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<AdmittedNarratorRetailPublicationOperationIntent>,
  ): Promise<void> {
    await this.#state.appendAuditEvent({
      actorId,
      action,
      entityType: intentEntityType,
      entityId: envelope.entityId,
      revision: envelope.revision,
      occurredAt: new Date(envelope.savedAt),
      metadata: {
        operationKind: envelope.payload.operation.kind,
        intentStatus: envelope.payload.status,
        expectedMonitorRevision: envelope.payload.expectedMonitorRevision,
        targetMonitorRevision: envelope.payload.targetMonitorRevision,
        targetHealth: envelope.payload.operation.monitor.currentHealth,
        evidenceAcknowledged:
          envelope.payload.operation.evidenceAcknowledged,
        incidentCreated: envelope.payload.operation.incidentCreated,
        monitorMutationCommitted:
          envelope.payload.monitorMutationCommitted,
        automaticRefreshAuthority: false,
        automaticRemediationAuthority: false,
        automaticRepublishAuthority: false,
        publicationAuthority: false,
      },
    });
  }
}
