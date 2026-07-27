import {
  artifactPublicView,
  assertArtifactRecord,
  type ArtifactKind,
  type ArtifactPublicView,
  type ArtifactRecord,
  type ArtifactReviewStatus,
  type ArtifactVerificationStatus,
} from "./artifact-registry.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";
import { stableHash } from "./index.js";

export interface ArtifactStoreListFilter {
  projectId?: string;
  jobId?: string;
  kind?: ArtifactKind | readonly ArtifactKind[];
  verificationStatus?: ArtifactVerificationStatus | readonly ArtifactVerificationStatus[];
  reviewStatus?: ArtifactReviewStatus | readonly ArtifactReviewStatus[];
  released?: boolean;
}

export interface ArtifactStoreTransitionInput {
  expectedRevision: number;
  actorId: string;
  action: string;
  apply: (current: ArtifactRecord) => ArtifactRecord;
}

export class ArtifactStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactStoreConflictError";
  }
}

export class ArtifactStoreIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactStoreIntegrityError";
  }
}

const ARTIFACT_ENTITY_TYPE = "artifact" as const;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const SAFE_ACTION = /^artifact\.[a-z][a-z0-9._-]{1,80}$/u;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new Error(code);
  return value;
}

function requireAction(value: string): string {
  if (!SAFE_ACTION.test(value)) throw new Error("ARTIFACT_STORE_ACTION_INVALID");
  return value;
}

function asPayload(record: ArtifactRecord): Record<string, unknown> {
  return record as unknown as Record<string, unknown>;
}

function immutableArtifactFingerprint(record: ArtifactRecord): string {
  return stableHash({
    id: record.id,
    kind: record.kind,
    projectId: record.projectId,
    jobId: record.jobId ?? null,
    segmentId: record.segmentId ?? null,
    takeId: record.takeId ?? null,
    storage: record.storage,
    integrity: record.integrity,
    provenance: record.provenance,
    rights: record.rights,
    createdAt: record.createdAt,
  });
}

function arrayFilter<T extends string>(value: T | readonly T[] | undefined): ReadonlySet<T> | null {
  if (value === undefined) return null;
  return new Set(Array.isArray(value) ? value : [value]);
}

function toArtifactEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<ArtifactRecord> {
  const record = envelope.payload as unknown as ArtifactRecord;
  try {
    assertArtifactRecord(record);
  } catch (error) {
    throw new ArtifactStoreIntegrityError(
      `ARTIFACT_STORE_RECORD_INVALID:${error instanceof Error ? error.message : "UNKNOWN"}`,
    );
  }
  if (envelope.entityType !== ARTIFACT_ENTITY_TYPE || envelope.entityId !== record.id) {
    throw new ArtifactStoreIntegrityError("ARTIFACT_STORE_ENVELOPE_SCOPE_MISMATCH");
  }
  if (envelope.revision !== record.revision) {
    throw new ArtifactStoreIntegrityError("ARTIFACT_STORE_REVISION_MISMATCH");
  }
  return envelope as unknown as StoredEnvelope<ArtifactRecord>;
}

export class FileArtifactRegistry {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    record: ArtifactRecord,
    input: Readonly<{ actorId: string; action?: string }> ,
  ): Promise<StoredEnvelope<ArtifactRecord>> {
    assertArtifactRecord(record);
    requireIdentifier(input.actorId, "ARTIFACT_STORE_ACTOR_ID_INVALID");
    const action = requireAction(input.action ?? "artifact.created");
    if (record.revision !== 1 || record.previousFingerprint !== undefined) {
      throw new ArtifactStoreConflictError("ARTIFACT_STORE_INITIAL_REVISION_INVALID");
    }

    try {
      const envelope = await this.#store.create(
        ARTIFACT_ENTITY_TYPE,
        record.id,
        asPayload(record),
        new Date(record.createdAt),
      );
      const typed = toArtifactEnvelope(envelope);
      await this.#audit(input.actorId, action, typed);
      return typed;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new ArtifactStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(artifactId: string): Promise<StoredEnvelope<ArtifactRecord> | null> {
    requireIdentifier(artifactId, "ARTIFACT_STORE_ID_INVALID");
    const envelope = await this.#store.read<Record<string, unknown>>(
      ARTIFACT_ENTITY_TYPE,
      artifactId,
    );
    return envelope ? toArtifactEnvelope(envelope) : null;
  }

  async require(artifactId: string): Promise<StoredEnvelope<ArtifactRecord>> {
    const envelope = await this.read(artifactId);
    if (!envelope) throw new ArtifactStoreConflictError("ARTIFACT_STORE_RECORD_NOT_FOUND");
    return envelope;
  }

  async list(
    filter: ArtifactStoreListFilter = {},
  ): Promise<readonly StoredEnvelope<ArtifactRecord>[]> {
    const kinds = arrayFilter(filter.kind);
    const verificationStatuses = arrayFilter(filter.verificationStatus);
    const reviewStatuses = arrayFilter(filter.reviewStatus);
    const rows = await this.#store.list(ARTIFACT_ENTITY_TYPE);
    const records: StoredEnvelope<ArtifactRecord>[] = [];
    for (const row of rows) {
      const envelope = await this.read(row.entityId);
      if (!envelope) continue;
      const record = envelope.payload;
      if (filter.projectId && record.projectId !== filter.projectId) continue;
      if (filter.jobId && record.jobId !== filter.jobId) continue;
      if (kinds && !kinds.has(record.kind)) continue;
      if (verificationStatuses && !verificationStatuses.has(record.verification.status)) continue;
      if (reviewStatuses && !reviewStatuses.has(record.review.status)) continue;
      if (filter.released !== undefined && (record.release.status === "released") !== filter.released) continue;
      records.push(envelope);
    }
    return records.sort((left, right) =>
      Date.parse(right.payload.updatedAt) - Date.parse(left.payload.updatedAt)
      || left.payload.id.localeCompare(right.payload.id, "en-AU")
    );
  }

  async publicViews(filter: ArtifactStoreListFilter = {}): Promise<readonly ArtifactPublicView[]> {
    const envelopes = await this.list(filter);
    return Object.freeze(envelopes.map((envelope) => artifactPublicView(envelope.payload)));
  }

  async save(
    record: ArtifactRecord,
    input: Readonly<{
      expectedRevision: number;
      actorId: string;
      action: string;
    }>,
  ): Promise<StoredEnvelope<ArtifactRecord>> {
    assertArtifactRecord(record);
    requireIdentifier(input.actorId, "ARTIFACT_STORE_ACTOR_ID_INVALID");
    const action = requireAction(input.action);
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
      throw new Error("ARTIFACT_STORE_EXPECTED_REVISION_INVALID");
    }

    const current = await this.require(record.id);
    if (current.revision !== input.expectedRevision) {
      throw new ArtifactStoreConflictError(`ARTIFACT_STORE_REVISION_CONFLICT:${current.revision}`);
    }
    if (
      record.revision !== current.payload.revision + 1
      || record.previousFingerprint !== current.payload.fingerprint
    ) {
      throw new ArtifactStoreConflictError("ARTIFACT_STORE_REVISION_CHAIN_INVALID");
    }
    if (immutableArtifactFingerprint(record) !== immutableArtifactFingerprint(current.payload)) {
      throw new ArtifactStoreConflictError("ARTIFACT_STORE_IMMUTABLE_FIELDS_CHANGED");
    }
    if (Date.parse(record.updatedAt) < Date.parse(current.payload.updatedAt)) {
      throw new ArtifactStoreConflictError("ARTIFACT_STORE_TRANSITION_TIME_REVERSED");
    }

    try {
      const envelope = await this.#store.replace(
        ARTIFACT_ENTITY_TYPE,
        record.id,
        input.expectedRevision,
        asPayload(record),
        new Date(record.updatedAt),
      );
      const typed = toArtifactEnvelope(envelope);
      await this.#audit(input.actorId, action, typed);
      return typed;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new ArtifactStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async transition(
    artifactId: string,
    input: ArtifactStoreTransitionInput,
  ): Promise<StoredEnvelope<ArtifactRecord>> {
    const current = await this.require(artifactId);
    if (current.revision !== input.expectedRevision) {
      throw new ArtifactStoreConflictError(`ARTIFACT_STORE_REVISION_CONFLICT:${current.revision}`);
    }
    const next = input.apply(current.payload);
    if (next.id !== artifactId) throw new ArtifactStoreConflictError("ARTIFACT_STORE_ID_CHANGED");
    return this.save(next, {
      expectedRevision: input.expectedRevision,
      actorId: input.actorId,
      action: input.action,
    });
  }

  async #audit(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<ArtifactRecord>,
  ): Promise<void> {
    const record = envelope.payload;
    await this.#store.appendAuditEvent({
      actorId,
      action,
      entityType: ARTIFACT_ENTITY_TYPE,
      entityId: record.id,
      revision: envelope.revision,
      occurredAt: new Date(record.updatedAt),
      metadata: {
        kind: record.kind,
        projectId: record.projectId,
        contentHash: record.integrity.contentHash,
        artifactFingerprint: record.fingerprint,
        verificationStatus: record.verification.status,
        reviewStatus: record.review.status,
        releaseStatus: record.release.status,
      },
    });
  }
}
