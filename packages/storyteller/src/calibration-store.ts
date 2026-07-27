import {
  assertCalibrationSession,
  calibrationSessionPublicView,
  type CalibrationSession,
  type CalibrationSessionPublicView,
  type CalibrationStatus,
} from "./calibration-workflow.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";

export const CALIBRATION_SESSION_ENTITY_TYPE = "calibration-session" as const;

export interface CalibrationSessionStoreFilter {
  projectId?: string;
  seriesId?: string;
  status?: CalibrationStatus | readonly CalibrationStatus[];
}

export interface StoredCalibrationSessionPublicView extends CalibrationSessionPublicView {
  savedAt: string;
  contentHash: string;
}

export class CalibrationStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationStoreConflictError";
  }
}

export class CalibrationStoreIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationStoreIntegrityError";
  }
}

function asPayload(session: CalibrationSession): Record<string, unknown> {
  return session as unknown as Record<string, unknown>;
}

function typedEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<CalibrationSession> {
  const session = envelope.payload as unknown as CalibrationSession;
  try {
    assertCalibrationSession(session);
  } catch (error) {
    throw new CalibrationStoreIntegrityError(
      `CALIBRATION_STORE_SESSION_INVALID:${error instanceof Error ? error.message : "UNKNOWN"}`,
    );
  }
  if (
    envelope.entityType !== CALIBRATION_SESSION_ENTITY_TYPE
    || envelope.entityId !== session.id
    || envelope.revision !== session.revision
  ) {
    throw new CalibrationStoreIntegrityError("CALIBRATION_STORE_ENVELOPE_SCOPE_INVALID");
  }
  return envelope as unknown as StoredEnvelope<CalibrationSession>;
}

function requirePersistenceTime(session: CalibrationSession, value: Date): Date {
  if (Number.isNaN(value.getTime())) {
    throw new CalibrationStoreIntegrityError("CALIBRATION_STORE_TIME_INVALID");
  }
  if (value.getTime() < Date.parse(session.updatedAt)) {
    throw new CalibrationStoreConflictError("CALIBRATION_STORE_TIME_PRECEDES_SESSION");
  }
  return value;
}

function assertSameScope(
  current: CalibrationSession,
  next: CalibrationSession,
): void {
  if (
    current.id !== next.id
    || current.projectId !== next.projectId
    || current.seriesId !== next.seriesId
    || current.voiceProfileId !== next.voiceProfileId
    || current.voiceRevision !== next.voiceRevision
    || current.createdAt !== next.createdAt
  ) {
    throw new CalibrationStoreConflictError("CALIBRATION_STORE_SCOPE_IMMUTABLE");
  }
  if (
    next.revision !== current.revision + 1
    || next.previousFingerprint !== current.fingerprint
  ) {
    throw new CalibrationStoreConflictError("CALIBRATION_STORE_DOMAIN_REVISION_CONFLICT");
  }
  if (Date.parse(next.updatedAt) < Date.parse(current.updatedAt)) {
    throw new CalibrationStoreConflictError("CALIBRATION_STORE_TRANSITION_TIME_REVERSED");
  }
}

function safeMetadata(
  session: CalibrationSession,
): Readonly<Record<string, string | number | boolean | null>> {
  const view = calibrationSessionPublicView(session);
  return Object.freeze({
    projectId: session.projectId,
    seriesScoped: Boolean(session.seriesId),
    voiceRevision: session.voiceRevision,
    status: session.status,
    passageCount: view.passageCount,
    candidateCount: view.candidateCount,
    reviewCount: view.reviewCount,
    selectionCount: view.selectionCount,
    distinctReviewerCount: view.distinctReviewerCount,
    eligibleForApproval: view.eligibleForApproval,
    sessionFingerprint: session.fingerprint,
  });
}

function auditAction(
  previous: CalibrationStatus | null,
  current: CalibrationStatus,
): string {
  if (current === "approved" && previous !== "approved") {
    return "calibration.session.approved";
  }
  if (current === "rejected" && previous !== "rejected") {
    return "calibration.session.rejected";
  }
  return previous === null
    ? "calibration.session.created"
    : "calibration.session.updated";
}

export function storedCalibrationSessionPublicView(
  envelope: StoredEnvelope<CalibrationSession>,
): StoredCalibrationSessionPublicView {
  const session = typedEnvelope(
    envelope as unknown as StoredEnvelope<Record<string, unknown>>,
  ).payload;
  return Object.freeze({
    ...calibrationSessionPublicView(session),
    savedAt: envelope.savedAt,
    contentHash: envelope.contentHash,
  });
}

export class FileCalibrationSessionStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    session: CalibrationSession,
    input: Readonly<{
      actorId: string;
      requestId?: string;
      now?: Date;
    }>,
  ): Promise<StoredEnvelope<CalibrationSession>> {
    assertCalibrationSession(session);
    if (session.revision !== 1 || session.previousFingerprint !== undefined) {
      throw new CalibrationStoreConflictError("CALIBRATION_STORE_INITIAL_REVISION_REQUIRED");
    }
    const existing = await this.read(session.id);
    if (existing) {
      if (existing.payload.fingerprint === session.fingerprint) return existing;
      throw new CalibrationStoreConflictError("CALIBRATION_STORE_CREATE_CONFLICT");
    }
    const now = requirePersistenceTime(session, input.now ?? new Date(session.updatedAt));
    try {
      const created = typedEnvelope(await this.#store.create(
        CALIBRATION_SESSION_ENTITY_TYPE,
        session.id,
        asPayload(session),
        now,
      ));
      await this.#audit(input.actorId, null, created, now, input.requestId);
      return created;
    } catch (error) {
      if (!(error instanceof StoreConflictError)) throw error;
      const raced = await this.read(session.id);
      if (raced?.payload.fingerprint === session.fingerprint) return raced;
      throw new CalibrationStoreConflictError("CALIBRATION_STORE_CREATE_CONFLICT");
    }
  }

  async save(
    session: CalibrationSession,
    expectedRevision: number,
    input: Readonly<{
      actorId: string;
      requestId?: string;
      now?: Date;
    }>,
  ): Promise<StoredEnvelope<CalibrationSession>> {
    assertCalibrationSession(session);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new CalibrationStoreConflictError("CALIBRATION_STORE_EXPECTED_REVISION_INVALID");
    }
    const current = await this.require(session.id);
    if (current.revision !== expectedRevision) {
      throw new CalibrationStoreConflictError(
        `CALIBRATION_STORE_REVISION_CONFLICT:${current.revision}`,
      );
    }
    assertSameScope(current.payload, session);
    const now = requirePersistenceTime(session, input.now ?? new Date(session.updatedAt));
    try {
      const saved = typedEnvelope(await this.#store.replace(
        CALIBRATION_SESSION_ENTITY_TYPE,
        session.id,
        expectedRevision,
        asPayload(session),
        now,
      ));
      await this.#audit(
        input.actorId,
        current.payload.status,
        saved,
        now,
        input.requestId,
      );
      return saved;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new CalibrationStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(
    sessionId: string,
  ): Promise<StoredEnvelope<CalibrationSession> | null> {
    const envelope = await this.#store.read<Record<string, unknown>>(
      CALIBRATION_SESSION_ENTITY_TYPE,
      sessionId,
    );
    return envelope ? typedEnvelope(envelope) : null;
  }

  async require(sessionId: string): Promise<StoredEnvelope<CalibrationSession>> {
    const envelope = await this.read(sessionId);
    if (!envelope) {
      throw new CalibrationStoreConflictError("CALIBRATION_STORE_SESSION_NOT_FOUND");
    }
    return envelope;
  }

  async list(
    filter: CalibrationSessionStoreFilter = {},
  ): Promise<readonly StoredEnvelope<CalibrationSession>[]> {
    const statuses = filter.status === undefined
      ? null
      : new Set(Array.isArray(filter.status) ? filter.status : [filter.status]);
    const rows = await this.#store.list(CALIBRATION_SESSION_ENTITY_TYPE);
    const sessions: StoredEnvelope<CalibrationSession>[] = [];
    for (const row of rows) {
      const envelope = await this.read(row.entityId);
      if (!envelope) continue;
      if (filter.projectId && envelope.payload.projectId !== filter.projectId) continue;
      if (filter.seriesId && envelope.payload.seriesId !== filter.seriesId) continue;
      if (statuses && !statuses.has(envelope.payload.status)) continue;
      sessions.push(envelope);
    }
    return Object.freeze(sessions.sort((left, right) =>
      Date.parse(right.payload.updatedAt) - Date.parse(left.payload.updatedAt)
      || left.payload.id.localeCompare(right.payload.id, "en-AU")
    ));
  }

  async listPublic(
    filter: CalibrationSessionStoreFilter = {},
  ): Promise<readonly StoredCalibrationSessionPublicView[]> {
    return Object.freeze((await this.list(filter)).map(storedCalibrationSessionPublicView));
  }

  async #audit(
    actorId: string,
    previousStatus: CalibrationStatus | null,
    envelope: StoredEnvelope<CalibrationSession>,
    occurredAt: Date,
    requestId?: string,
  ): Promise<void> {
    await this.#store.appendAuditEvent({
      actorId,
      action: auditAction(previousStatus, envelope.payload.status),
      entityType: CALIBRATION_SESSION_ENTITY_TYPE,
      entityId: envelope.entityId,
      revision: envelope.revision,
      ...(requestId ? { requestId } : {}),
      metadata: safeMetadata(envelope.payload),
      occurredAt,
    });
  }
}
