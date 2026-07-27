import {
  assertBookCreditScript,
  type BookCreditScript,
} from "./book-credit-script.js";
import {
  assertProductionCalibrationLock,
  type ProductionCalibrationLock,
} from "./calibration-admission.js";
import {
  FileGenerationCalibrationBindingStore,
  assertGenerationCalibrationBindingRecord,
  createGenerationCalibrationBindingRecord,
  type GenerationCalibrationBindingRecord,
} from "./generation-calibration.js";
import {
  FileGenerationMaterialStore,
  assertGenerationMaterialRecord,
  createGenerationMaterialRecord,
  type GenerationMaterialRecord,
} from "./generation-material.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";
import {
  stableHash,
  type GenerationJob,
  type PerformanceDirection,
} from "./index.js";
import type {
  CanonicalPronunciation,
  ProviderAudioFormat,
} from "./provider-adapter.js";
import type { GenerationWorkerMaterial } from "./generation-worker.js";

export const BOOK_CREDIT_GENERATION_SCHEMA_VERSION =
  "storyteller-book-credit-generation-v1" as const;

export interface BookCreditGenerationScriptSnapshot {
  id: string;
  revision: number;
  fingerprint: string;
  textHash: string;
  wordCount: number;
  approvalFingerprint: string;
}

export interface BookCreditGenerationPlan {
  schemaVersion: typeof BOOK_CREDIT_GENERATION_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  creditKind: BookCreditScript["kind"];
  script: BookCreditGenerationScriptSnapshot;
  job: GenerationJob;
  material: GenerationMaterialRecord;
  calibration: GenerationCalibrationBindingRecord;
  status: "prepared";
  createdAt: string;
  fingerprint: string;
}

export interface BookCreditGenerationPublicView {
  id: string;
  bookId: string;
  creditKind: BookCreditScript["kind"];
  scriptId: string;
  scriptRevision: number;
  scriptTextHash: string;
  wordCount: number;
  jobId: string;
  segmentId: string;
  candidateCount: number;
  voiceRevision: number;
  format: ProviderAudioFormat;
  sampleRateHz: number;
  locked: true;
  status: "prepared";
  createdAt: string;
  fingerprint: string;
}

export interface CreateBookCreditGenerationInput {
  id: string;
  jobId: string;
  script: BookCreditScript;
  calibrationLock: ProductionCalibrationLock;
  candidateCount: number;
  direction: Omit<PerformanceDirection, "segmentId">;
  pronunciations?: readonly CanonicalPronunciation[];
  rights: GenerationWorkerMaterial["rights"];
  costPolicy?: GenerationWorkerMaterial["costPolicy"];
  format?: ProviderAudioFormat;
  sampleRateHz?: number;
  createdAt?: Date;
}

export interface PreparedBookCreditGeneration {
  plan: StoredEnvelope<BookCreditGenerationPlan>;
  material: StoredEnvelope<GenerationMaterialRecord>;
  calibration: StoredEnvelope<GenerationCalibrationBindingRecord>;
}

export class BookCreditGenerationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "BookCreditGenerationError";
    this.code = code;
  }
}

export class BookCreditGenerationStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookCreditGenerationStoreConflictError";
  }
}

const ENTITY_TYPE = "book-credit-generation" as const;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const STORABLE_FORMATS: ReadonlySet<ProviderAudioFormat> = new Set([
  "wav",
  "flac",
  "mp3",
]);

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new BookCreditGenerationError(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new BookCreditGenerationError(code);
  return value;
}

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new BookCreditGenerationError(code);
  }
  return value;
}

function normalisePronunciations(
  pronunciations: readonly CanonicalPronunciation[],
): readonly CanonicalPronunciation[] {
  return Object.freeze([...pronunciations]
    .map((value) => Object.freeze({ ...value }))
    .sort((left, right) =>
      left.writtenForm.localeCompare(right.writtenForm, "en-AU")
      || left.approvedRevision - right.approvedRevision
    ));
}

export function bookCreditSegmentId(script: BookCreditScript): string {
  assertBookCreditScript(script);
  return `credit_${script.kind}_${stableHash({
    scriptId: script.id,
    revision: script.revision,
    textHash: script.textHash,
  }).slice(0, 24)}`;
}

function cacheKey(input: Readonly<{
  script: BookCreditScript;
  lock: ProductionCalibrationLock;
  candidateCount: number;
  direction: PerformanceDirection;
  pronunciations: readonly CanonicalPronunciation[];
  rights: GenerationWorkerMaterial["rights"];
  costPolicy?: GenerationWorkerMaterial["costPolicy"];
  format: ProviderAudioFormat;
  sampleRateHz: number;
}>): string {
  return stableHash({
    purpose: "book-credit-production",
    script: {
      id: input.script.id,
      revision: input.script.revision,
      fingerprint: input.script.fingerprint,
      textHash: input.script.textHash,
      approvalFingerprint: input.script.approval?.fingerprint ?? null,
    },
    calibrationLockFingerprint: input.lock.lockFingerprint,
    candidateCount: input.candidateCount,
    direction: input.direction,
    pronunciations: input.pronunciations,
    rights: input.rights,
    costPolicy: input.costPolicy ?? null,
    format: input.format,
    sampleRateHz: input.sampleRateHz,
  });
}

function planFingerprint(
  plan: Omit<BookCreditGenerationPlan, "fingerprint">,
): string {
  return stableHash(plan);
}

export function createBookCreditGenerationPlan(
  input: CreateBookCreditGenerationInput,
): BookCreditGenerationPlan {
  requireIdentifier(input.id, "BOOK_CREDIT_GENERATION_ID_INVALID");
  requireIdentifier(input.jobId, "BOOK_CREDIT_GENERATION_JOB_ID_INVALID");
  assertBookCreditScript(input.script);
  assertProductionCalibrationLock(input.calibrationLock);
  if (input.script.status !== "approved" || !input.script.approval) {
    throw new BookCreditGenerationError("BOOK_CREDIT_GENERATION_APPROVED_SCRIPT_REQUIRED");
  }
  if (input.script.textHash !== stableHash(input.script.text)) {
    throw new BookCreditGenerationError("BOOK_CREDIT_GENERATION_TEXT_HASH_INVALID");
  }
  if (input.calibrationLock.projectId !== input.script.projectId) {
    throw new BookCreditGenerationError("BOOK_CREDIT_GENERATION_CALIBRATION_PROJECT_MISMATCH");
  }
  const candidateCount = requireInteger(
    input.candidateCount,
    1,
    8,
    "BOOK_CREDIT_GENERATION_CANDIDATE_COUNT_INVALID",
  );
  const segmentId = bookCreditSegmentId(input.script);
  const direction: PerformanceDirection = Object.freeze({
    ...input.direction,
    segmentId,
    notes: Object.freeze([...input.direction.notes]),
  });
  const pronunciations = normalisePronunciations(input.pronunciations ?? []);
  const format = input.format ?? "wav";
  if (!STORABLE_FORMATS.has(format)) {
    throw new BookCreditGenerationError("BOOK_CREDIT_GENERATION_FORMAT_INVALID");
  }
  const sampleRateHz = requireInteger(
    input.sampleRateHz ?? 44_100,
    8_000,
    192_000,
    "BOOK_CREDIT_GENERATION_SAMPLE_RATE_INVALID",
  );
  const createdAt = input.createdAt ?? new Date();
  if (Number.isNaN(createdAt.getTime())) {
    throw new BookCreditGenerationError("BOOK_CREDIT_GENERATION_DATE_INVALID");
  }
  const job: GenerationJob = Object.freeze({
    id: input.jobId,
    projectId: input.script.projectId,
    segmentId,
    providerFallbackIds: Object.freeze([input.calibrationLock.providerId]),
    cacheKey: cacheKey({
      script: input.script,
      lock: input.calibrationLock,
      candidateCount,
      direction,
      pronunciations,
      rights: input.rights,
      ...(input.costPolicy ? { costPolicy: input.costPolicy } : {}),
      format,
      sampleRateHz,
    }),
    candidateCount,
    status: "ready",
  });
  const workerMaterial: GenerationWorkerMaterial = {
    text: input.script.text,
    immutableSourceHash: input.script.textHash,
    voiceProfileId: input.calibrationLock.voiceProfileId,
    voiceRevision: input.calibrationLock.voiceRevision,
    direction,
    pronunciations,
    mode: "production",
    format,
    sampleRateHz,
    rights: {
      rightsEvidenceId: input.rights.rightsEvidenceId,
      rightsFingerprint: input.rights.rightsFingerprint,
      allowedUses: Object.freeze([...input.rights.allowedUses]),
      commercialUseApproved: input.rights.commercialUseApproved,
      ...(input.rights.expiresAt !== undefined
        ? { expiresAt: input.rights.expiresAt }
        : {}),
      ...(input.rights.retainUntil !== undefined
        ? { retainUntil: input.rights.retainUntil }
        : {}),
      ...(input.rights.deletionRequiredAt !== undefined
        ? { deletionRequiredAt: input.rights.deletionRequiredAt }
        : {}),
    },
    intendedUse: "audiobook",
    commercial: true,
    parentArtifactIds: Object.freeze([]),
    ...(input.costPolicy
      ? {
          costPolicy: {
            currency: input.costPolicy.currency,
            maximumTotalEstimatedCost:
              input.costPolicy.maximumTotalEstimatedCost,
          },
        }
      : {}),
  };
  const material = createGenerationMaterialRecord(job, workerMaterial, createdAt);
  const calibration = createGenerationCalibrationBindingRecord(
    job,
    input.calibrationLock,
    createdAt,
  );
  const scriptSnapshot: BookCreditGenerationScriptSnapshot = Object.freeze({
    id: input.script.id,
    revision: input.script.revision,
    fingerprint: input.script.fingerprint,
    textHash: input.script.textHash,
    wordCount: input.script.wordCount,
    approvalFingerprint: input.script.approval.fingerprint,
  });
  const partial: Omit<BookCreditGenerationPlan, "fingerprint"> = {
    schemaVersion: BOOK_CREDIT_GENERATION_SCHEMA_VERSION,
    id: input.id,
    projectId: input.script.projectId,
    bookId: input.script.bookId,
    creditKind: input.script.kind,
    script: scriptSnapshot,
    job,
    material,
    calibration,
    status: "prepared",
    createdAt: createdAt.toISOString(),
  };
  const plan = Object.freeze({ ...partial, fingerprint: planFingerprint(partial) });
  assertBookCreditGenerationPlan(plan);
  return plan;
}

export function assertBookCreditGenerationPlan(
  plan: BookCreditGenerationPlan,
): void {
  if (plan.schemaVersion !== BOOK_CREDIT_GENERATION_SCHEMA_VERSION) {
    throw new BookCreditGenerationError("BOOK_CREDIT_GENERATION_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(plan.id, "BOOK_CREDIT_GENERATION_ID_INVALID");
  requireIdentifier(plan.projectId, "BOOK_CREDIT_GENERATION_PROJECT_ID_INVALID");
  requireIdentifier(plan.bookId, "BOOK_CREDIT_GENERATION_BOOK_ID_INVALID");
  if (plan.creditKind !== "opening" && plan.creditKind !== "closing") {
    throw new BookCreditGenerationError("BOOK_CREDIT_GENERATION_KIND_INVALID");
  }
  requireIdentifier(plan.script.id, "BOOK_CREDIT_GENERATION_SCRIPT_ID_INVALID");
  requireInteger(
    plan.script.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "BOOK_CREDIT_GENERATION_SCRIPT_REVISION_INVALID",
  );
  requireHash(plan.script.fingerprint, "BOOK_CREDIT_GENERATION_SCRIPT_HASH_INVALID");
  requireHash(plan.script.textHash, "BOOK_CREDIT_GENERATION_TEXT_HASH_INVALID");
  requireInteger(
    plan.script.wordCount,
    1,
    500,
    "BOOK_CREDIT_GENERATION_WORD_COUNT_INVALID",
  );
  requireHash(
    plan.script.approvalFingerprint,
    "BOOK_CREDIT_GENERATION_APPROVAL_HASH_INVALID",
  );
  assertGenerationMaterialRecord(plan.material);
  assertGenerationCalibrationBindingRecord(plan.calibration);
  if (
    plan.job.status !== "ready"
    || plan.job.projectId !== plan.projectId
    || plan.job.segmentId !== plan.material.segmentId
    || plan.job.id !== plan.material.jobId
    || plan.job.cacheKey !== plan.material.jobCacheKey
    || plan.job.candidateCount !== plan.material.candidateCount
    || plan.calibration.jobId !== plan.job.id
    || plan.calibration.projectId !== plan.projectId
    || plan.calibration.segmentId !== plan.job.segmentId
    || plan.calibration.jobCacheKey !== plan.job.cacheKey
    || plan.calibration.candidateCount !== plan.job.candidateCount
    || plan.material.textHash !== plan.script.textHash
    || plan.material.material.immutableSourceHash !== plan.script.textHash
    || plan.material.material.voiceProfileId
      !== plan.calibration.calibrationLock.voiceProfileId
    || plan.material.material.voiceRevision
      !== plan.calibration.calibrationLock.voiceRevision
    || plan.material.material.mode !== "production"
    || plan.job.providerFallbackIds.length !== 1
    || plan.job.providerFallbackIds[0]
      !== plan.calibration.calibrationLock.providerId
  ) {
    throw new BookCreditGenerationError("BOOK_CREDIT_GENERATION_SCOPE_MISMATCH");
  }
  if (plan.status !== "prepared") {
    throw new BookCreditGenerationError("BOOK_CREDIT_GENERATION_STATUS_INVALID");
  }
  if (!plan.createdAt || Number.isNaN(Date.parse(plan.createdAt))) {
    throw new BookCreditGenerationError("BOOK_CREDIT_GENERATION_DATE_INVALID");
  }
  const { fingerprint, ...partial } = plan;
  if (planFingerprint(partial) !== fingerprint) {
    throw new BookCreditGenerationError("BOOK_CREDIT_GENERATION_FINGERPRINT_INVALID");
  }
}

export function bookCreditGenerationPublicView(
  plan: BookCreditGenerationPlan,
): BookCreditGenerationPublicView {
  assertBookCreditGenerationPlan(plan);
  return Object.freeze({
    id: plan.id,
    bookId: plan.bookId,
    creditKind: plan.creditKind,
    scriptId: plan.script.id,
    scriptRevision: plan.script.revision,
    scriptTextHash: plan.script.textHash,
    wordCount: plan.script.wordCount,
    jobId: plan.job.id,
    segmentId: plan.job.segmentId,
    candidateCount: plan.job.candidateCount,
    voiceRevision: plan.material.material.voiceRevision,
    format: plan.material.material.format ?? "wav",
    sampleRateHz: plan.material.material.sampleRateHz ?? 44_100,
    locked: true,
    status: plan.status,
    createdAt: plan.createdAt,
    fingerprint: plan.fingerprint,
  });
}

function payload(plan: BookCreditGenerationPlan): Record<string, unknown> {
  return plan as unknown as Record<string, unknown>;
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<BookCreditGenerationPlan> {
  const plan = envelope.payload as unknown as BookCreditGenerationPlan;
  assertBookCreditGenerationPlan(plan);
  if (
    envelope.entityType !== ENTITY_TYPE
    || envelope.entityId !== plan.id
    || envelope.revision !== 1
  ) {
    throw new BookCreditGenerationStoreConflictError(
      "BOOK_CREDIT_GENERATION_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<BookCreditGenerationPlan>;
}

export class FileBookCreditGenerationStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    plan: BookCreditGenerationPlan,
    actorId: string,
  ): Promise<StoredEnvelope<BookCreditGenerationPlan>> {
    assertBookCreditGenerationPlan(plan);
    requireIdentifier(actorId, "BOOK_CREDIT_GENERATION_ACTOR_ID_INVALID");
    const existing = await this.read(plan.id);
    if (existing) {
      if (existing.payload.fingerprint === plan.fingerprint) return existing;
      throw new BookCreditGenerationStoreConflictError(
        "BOOK_CREDIT_GENERATION_IDEMPOTENCY_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.create(
        ENTITY_TYPE,
        plan.id,
        payload(plan),
        new Date(plan.createdAt),
      ));
      await this.#store.appendAuditEvent({
        actorId,
        action: "book_credit.generation_prepared",
        entityType: ENTITY_TYPE,
        entityId: envelope.entityId,
        revision: envelope.revision,
        occurredAt: new Date(envelope.savedAt),
        metadata: {
          bookId: plan.bookId,
          creditKind: plan.creditKind,
          jobId: plan.job.id,
          segmentId: plan.job.segmentId,
          candidateCount: plan.job.candidateCount,
          scriptTextHash: plan.script.textHash,
          planFingerprint: plan.fingerprint,
        },
      });
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new BookCreditGenerationStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(
    planId: string,
  ): Promise<StoredEnvelope<BookCreditGenerationPlan> | null> {
    requireIdentifier(planId, "BOOK_CREDIT_GENERATION_ID_INVALID");
    const envelope = await this.#store.read<Record<string, unknown>>(
      ENTITY_TYPE,
      planId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }
}

export async function prepareBookCreditGeneration(input: Readonly<{
  plan: BookCreditGenerationPlan;
  planStore: FileBookCreditGenerationStore;
  materialStore: FileGenerationMaterialStore;
  calibrationStore: FileGenerationCalibrationBindingStore;
  actorId: string;
  requestId?: string;
}>): Promise<PreparedBookCreditGeneration> {
  assertBookCreditGenerationPlan(input.plan);
  requireIdentifier(input.actorId, "BOOK_CREDIT_GENERATION_ACTOR_ID_INVALID");
  const now = new Date(input.plan.createdAt);
  const material = await input.materialStore.create(
    input.plan.job,
    input.plan.material.material,
    { actorId: input.actorId, now },
  );
  const calibration = await input.calibrationStore.create(
    input.plan.job,
    input.plan.calibration.calibrationLock,
    {
      actorId: input.actorId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      now,
    },
  );
  if (
    material.payload.fingerprint !== input.plan.material.fingerprint
    || calibration.payload.fingerprint !== input.plan.calibration.fingerprint
  ) {
    throw new BookCreditGenerationStoreConflictError(
      "BOOK_CREDIT_GENERATION_PREPARED_RECORD_MISMATCH",
    );
  }
  const plan = await input.planStore.create(input.plan, input.actorId);
  return Object.freeze({ plan, material, calibration });
}
