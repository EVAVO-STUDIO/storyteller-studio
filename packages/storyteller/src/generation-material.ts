import {
  stableHash,
  type GenerationJob,
  type NarrativeDistance,
  type PerformanceDirection,
  type ProjectUse,
} from "./index.js";
import type { GenerationWorkerMaterial } from "./generation-worker.js";
import type { GenerationQueueClaim } from "./generation-queue.js";
import { validateGenerationJob } from "./generation-queue-contracts.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";
import type {
  CanonicalPronunciation,
  ProviderAudioFormat,
  ProviderExecutionMode,
} from "./provider-adapter.js";

export const GENERATION_MATERIAL_SCHEMA_VERSION = "storyteller-generation-material-v1" as const;
export const GENERATION_MATERIAL_ENTITY_TYPE = "generation-material" as const;

export interface GenerationMaterialRecord {
  schemaVersion: typeof GENERATION_MATERIAL_SCHEMA_VERSION;
  id: string;
  jobId: string;
  projectId: string;
  segmentId: string;
  jobCacheKey: string;
  candidateCount: number;
  textHash: string;
  material: GenerationWorkerMaterial;
  createdAt: string;
  fingerprint: string;
}

export interface GenerationMaterialPublicView {
  id: string;
  jobId: string;
  projectId: string;
  segmentId: string;
  jobCacheKey: string;
  candidateCount: number;
  textHash: string;
  characterCount: number;
  voiceRevision: number;
  directionFingerprint: string;
  pronunciationCount: number;
  mode: ProviderExecutionMode;
  format: ProviderAudioFormat;
  sampleRateHz: number;
  intendedUse: ProjectUse;
  commercial: boolean;
  rightsEvidenceId: string;
  rightsFingerprint: string;
  rightsExpiresAt?: string;
  costPolicy?: Readonly<{
    currency: string;
    maximumTotalEstimatedCost: number;
  }>;
  createdAt: string;
  fingerprint: string;
}

export class GenerationMaterialConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationMaterialConflictError";
  }
}

export class GenerationMaterialIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationMaterialIntegrityError";
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const CURRENCY_PATTERN = /^[A-Z]{3}$/u;
const DISALLOWED_TEXT_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const NARRATIVE_DISTANCES: ReadonlySet<NarrativeDistance> = new Set([
  "intimate",
  "close",
  "balanced",
  "formal",
  "mythic",
]);
const EXECUTION_MODES: ReadonlySet<ProviderExecutionMode> = new Set([
  "preview",
  "calibration",
  "production",
]);
const STORABLE_AUDIO_FORMATS: ReadonlySet<ProviderAudioFormat> = new Set([
  "wav",
  "flac",
  "mp3",
]);
const PROJECT_USES: ReadonlySet<ProjectUse> = new Set([
  "audiobook",
  "trailer",
  "visual-companion",
  "accessibility",
  "internal-calibration",
]);
const MAX_TEXT_CHARACTERS = 100_000;
const MAX_DIRECTION_NOTES = 64;
const MAX_PRONUNCIATIONS = 512;
const MAX_PARENT_ARTIFACTS = 256;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new GenerationMaterialIntegrityError(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new GenerationMaterialIntegrityError(code);
  return value;
}

function requireFinite(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new GenerationMaterialIntegrityError(code);
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
    throw new GenerationMaterialIntegrityError(code);
  }
  return value;
}

function requireText(
  value: string,
  maximum: number,
  code: string,
  allowNewlines = false,
): string {
  if (
    typeof value !== "string"
    || value.trim().length === 0
    || value.length > maximum
    || DISALLOWED_TEXT_CONTROL.test(value)
    || (!allowNewlines && /[\r\n]/u.test(value))
  ) {
    throw new GenerationMaterialIntegrityError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(new Date(value).getTime())) {
    throw new GenerationMaterialIntegrityError(code);
  }
  return value;
}

function uniqueIdentifiers(
  values: readonly string[],
  maximum: number,
  code: string,
): readonly string[] {
  if (!Array.isArray(values) || values.length > maximum) {
    throw new GenerationMaterialIntegrityError(code);
  }
  const result = new Set<string>();
  for (const value of values) {
    const checked = requireIdentifier(value, code);
    if (result.has(checked)) throw new GenerationMaterialIntegrityError(`${code}_DUPLICATE`);
    result.add(checked);
  }
  return Object.freeze([...result]);
}

function validateDirection(direction: PerformanceDirection, segmentId: string): void {
  if (direction.segmentId !== segmentId) {
    throw new GenerationMaterialIntegrityError("GENERATION_MATERIAL_DIRECTION_SCOPE_MISMATCH");
  }
  if (!NARRATIVE_DISTANCES.has(direction.narrativeDistance)) {
    throw new GenerationMaterialIntegrityError("GENERATION_MATERIAL_NARRATIVE_DISTANCE_INVALID");
  }
  requireFinite(direction.pace, 0.25, 3, "GENERATION_MATERIAL_DIRECTION_PACE_INVALID");
  requireFinite(direction.intensity, 0, 1, "GENERATION_MATERIAL_DIRECTION_INTENSITY_INVALID");
  requireFinite(direction.warmth, 0, 1, "GENERATION_MATERIAL_DIRECTION_WARMTH_INVALID");
  requireFinite(direction.restraint, 0, 1, "GENERATION_MATERIAL_DIRECTION_RESTRAINT_INVALID");
  requireFinite(direction.clarity, 0, 1, "GENERATION_MATERIAL_DIRECTION_CLARITY_INVALID");
  requireInteger(direction.pauseBeforeMs, 0, 60_000, "GENERATION_MATERIAL_PAUSE_BEFORE_INVALID");
  requireInteger(direction.pauseAfterMs, 0, 60_000, "GENERATION_MATERIAL_PAUSE_AFTER_INVALID");
  requireText(direction.emotionalObjective, 2_000, "GENERATION_MATERIAL_OBJECTIVE_INVALID", true);
  requireText(direction.subtext, 2_000, "GENERATION_MATERIAL_SUBTEXT_INVALID", true);
  if (!Array.isArray(direction.notes) || direction.notes.length > MAX_DIRECTION_NOTES) {
    throw new GenerationMaterialIntegrityError("GENERATION_MATERIAL_DIRECTION_NOTES_INVALID");
  }
  for (const note of direction.notes) {
    requireText(note, 1_000, "GENERATION_MATERIAL_DIRECTION_NOTE_INVALID", true);
  }
}

function pronunciationFingerprint(value: CanonicalPronunciation): string {
  return stableHash({
    writtenForm: value.writtenForm,
    ipa: value.ipa ?? null,
    providerPhoneme: value.providerPhoneme ?? null,
    spokenForm: value.spokenForm ?? null,
    approvedRevision: value.approvedRevision,
  });
}

function validatePronunciations(values: readonly CanonicalPronunciation[]): void {
  if (!Array.isArray(values) || values.length > MAX_PRONUNCIATIONS) {
    throw new GenerationMaterialIntegrityError("GENERATION_MATERIAL_PRONUNCIATIONS_INVALID");
  }
  const seen = new Set<string>();
  for (const value of values) {
    requireText(value.writtenForm, 300, "GENERATION_MATERIAL_PRONUNCIATION_WRITTEN_INVALID", true);
    if (value.ipa !== undefined) requireText(value.ipa, 500, "GENERATION_MATERIAL_PRONUNCIATION_IPA_INVALID", true);
    if (value.providerPhoneme !== undefined) requireText(value.providerPhoneme, 500, "GENERATION_MATERIAL_PRONUNCIATION_PHONEME_INVALID", true);
    if (value.spokenForm !== undefined) requireText(value.spokenForm, 500, "GENERATION_MATERIAL_PRONUNCIATION_SPOKEN_INVALID", true);
    requireInteger(value.approvedRevision, 1, 1_000_000, "GENERATION_MATERIAL_PRONUNCIATION_REVISION_INVALID");
    const fingerprint = pronunciationFingerprint(value);
    if (seen.has(fingerprint)) {
      throw new GenerationMaterialIntegrityError("GENERATION_MATERIAL_PRONUNCIATION_DUPLICATE");
    }
    seen.add(fingerprint);
  }
}

function validateRights(
  material: GenerationWorkerMaterial,
  createdAt: Date,
): void {
  const rights = material.rights;
  requireIdentifier(rights.rightsEvidenceId, "GENERATION_MATERIAL_RIGHTS_ID_INVALID");
  requireHash(rights.rightsFingerprint, "GENERATION_MATERIAL_RIGHTS_FINGERPRINT_INVALID");
  if (
    !Array.isArray(rights.allowedUses)
    || rights.allowedUses.length === 0
    || rights.allowedUses.some((use) => !PROJECT_USES.has(use))
  ) {
    throw new GenerationMaterialIntegrityError("GENERATION_MATERIAL_RIGHTS_USES_INVALID");
  }
  const intendedUse = material.intendedUse ?? "audiobook";
  if (!PROJECT_USES.has(intendedUse)) {
    throw new GenerationMaterialIntegrityError("GENERATION_MATERIAL_INTENDED_USE_INVALID");
  }
  if (!rights.allowedUses.includes(intendedUse)) {
    throw new GenerationMaterialIntegrityError("GENERATION_MATERIAL_USE_NOT_AUTHORISED");
  }
  if ((material.commercial ?? true) && !rights.commercialUseApproved) {
    throw new GenerationMaterialIntegrityError("GENERATION_MATERIAL_COMMERCIAL_USE_NOT_APPROVED");
  }
  for (const [value, code] of [
    [rights.expiresAt, "GENERATION_MATERIAL_RIGHTS_EXPIRY_INVALID"],
    [rights.retainUntil, "GENERATION_MATERIAL_RETAIN_UNTIL_INVALID"],
    [rights.deletionRequiredAt, "GENERATION_MATERIAL_DELETION_DATE_INVALID"],
  ] as const) {
    if (value !== undefined) requireDate(value, code);
  }
  if (rights.expiresAt && Date.parse(rights.expiresAt) <= createdAt.getTime()) {
    throw new GenerationMaterialIntegrityError("GENERATION_MATERIAL_RIGHTS_EXPIRED");
  }
}

function validateCostPolicy(material: GenerationWorkerMaterial): void {
  if (!material.costPolicy) return;
  if (!CURRENCY_PATTERN.test(material.costPolicy.currency)) {
    throw new GenerationMaterialIntegrityError("GENERATION_MATERIAL_COST_CURRENCY_INVALID");
  }
  requireFinite(
    material.costPolicy.maximumTotalEstimatedCost,
    0,
    1_000_000,
    "GENERATION_MATERIAL_COST_LIMIT_INVALID",
  );
}

export function generationMaterialEntityId(jobId: string): string {
  requireIdentifier(jobId, "GENERATION_MATERIAL_JOB_ID_INVALID");
  return `material_${stableHash(jobId).slice(0, 32)}`;
}

export function validateGenerationWorkerMaterial(
  job: GenerationJob,
  material: GenerationWorkerMaterial,
  createdAt = new Date(),
): void {
  validateGenerationJob(job);
  if (job.status !== "ready") {
    throw new GenerationMaterialIntegrityError("GENERATION_MATERIAL_JOB_NOT_READY");
  }
  requireText(material.text, MAX_TEXT_CHARACTERS, "GENERATION_MATERIAL_TEXT_INVALID", true);
  requireHash(material.immutableSourceHash, "GENERATION_MATERIAL_SOURCE_HASH_INVALID");
  requireIdentifier(material.voiceProfileId, "GENERATION_MATERIAL_VOICE_PROFILE_INVALID");
  requireInteger(material.voiceRevision, 1, 1_000_000, "GENERATION_MATERIAL_VOICE_REVISION_INVALID");
  validateDirection(material.direction, job.segmentId);
  validatePronunciations(material.pronunciations ?? []);
  const mode = material.mode ?? "production";
  if (!EXECUTION_MODES.has(mode)) {
    throw new GenerationMaterialIntegrityError("GENERATION_MATERIAL_MODE_INVALID");
  }
  const format = material.format ?? "wav";
  if (!STORABLE_AUDIO_FORMATS.has(format)) {
    throw new GenerationMaterialIntegrityError("GENERATION_MATERIAL_FORMAT_NOT_STORABLE");
  }
  requireInteger(material.sampleRateHz ?? 48_000, 8_000, 192_000, "GENERATION_MATERIAL_SAMPLE_RATE_INVALID");
  uniqueIdentifiers(
    material.parentArtifactIds ?? [],
    MAX_PARENT_ARTIFACTS,
    "GENERATION_MATERIAL_PARENT_ARTIFACTS_INVALID",
  );
  validateRights(material, createdAt);
  validateCostPolicy(material);
}

function materialFingerprintBase(input: Readonly<{
  job: GenerationJob;
  material: GenerationWorkerMaterial;
}>): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: GENERATION_MATERIAL_SCHEMA_VERSION,
    jobId: input.job.id,
    projectId: input.job.projectId,
    segmentId: input.job.segmentId,
    jobCacheKey: input.job.cacheKey,
    candidateCount: input.job.candidateCount,
    textHash: stableHash(input.material.text),
    material: input.material,
  };
}

export function createGenerationMaterialRecord(
  job: GenerationJob,
  material: GenerationWorkerMaterial,
  now = new Date(),
): GenerationMaterialRecord {
  validateGenerationWorkerMaterial(job, material, now);
  const base = materialFingerprintBase({ job, material });
  return {
    schemaVersion: GENERATION_MATERIAL_SCHEMA_VERSION,
    id: generationMaterialEntityId(job.id),
    jobId: job.id,
    projectId: job.projectId,
    segmentId: job.segmentId,
    jobCacheKey: job.cacheKey,
    candidateCount: job.candidateCount,
    textHash: stableHash(material.text),
    material,
    createdAt: now.toISOString(),
    fingerprint: stableHash(base),
  };
}

export function assertGenerationMaterialRecord(
  record: GenerationMaterialRecord,
  expectedEntityId = record.id,
): void {
  if (record.schemaVersion !== GENERATION_MATERIAL_SCHEMA_VERSION) {
    throw new GenerationMaterialIntegrityError("GENERATION_MATERIAL_SCHEMA_UNSUPPORTED");
  }
  const createdAt = new Date(requireDate(record.createdAt, "GENERATION_MATERIAL_CREATED_AT_INVALID"));
  const job: GenerationJob = {
    id: record.jobId,
    projectId: record.projectId,
    segmentId: record.segmentId,
    providerFallbackIds: ["material_validation_provider"],
    cacheKey: record.jobCacheKey,
    candidateCount: record.candidateCount,
    status: "ready",
  };
  validateGenerationWorkerMaterial(job, record.material, createdAt);
  if (record.id !== expectedEntityId || record.id !== generationMaterialEntityId(record.jobId)) {
    throw new GenerationMaterialIntegrityError("GENERATION_MATERIAL_ENTITY_MISMATCH");
  }
  if (record.projectId !== record.material.direction.segmentId && false) {
    throw new GenerationMaterialIntegrityError("GENERATION_MATERIAL_UNREACHABLE_SCOPE_GUARD");
  }
  if (record.textHash !== stableHash(record.material.text)) {
    throw new GenerationMaterialIntegrityError("GENERATION_MATERIAL_TEXT_HASH_INVALID");
  }
  const expected = stableHash(materialFingerprintBase({ job, material: record.material }));
  if (!HASH_PATTERN.test(record.fingerprint) || record.fingerprint !== expected) {
    throw new GenerationMaterialIntegrityError("GENERATION_MATERIAL_FINGERPRINT_INVALID");
  }
}

export function generationMaterialPublicView(
  record: GenerationMaterialRecord,
): GenerationMaterialPublicView {
  assertGenerationMaterialRecord(record);
  const material = record.material;
  return Object.freeze({
    id: record.id,
    jobId: record.jobId,
    projectId: record.projectId,
    segmentId: record.segmentId,
    jobCacheKey: record.jobCacheKey,
    candidateCount: record.candidateCount,
    textHash: record.textHash,
    characterCount: material.text.length,
    voiceRevision: material.voiceRevision,
    directionFingerprint: stableHash(material.direction),
    pronunciationCount: material.pronunciations?.length ?? 0,
    mode: material.mode ?? "production",
    format: material.format ?? "wav",
    sampleRateHz: material.sampleRateHz ?? 48_000,
    intendedUse: material.intendedUse ?? "audiobook",
    commercial: material.commercial ?? true,
    rightsEvidenceId: material.rights.rightsEvidenceId,
    rightsFingerprint: material.rights.rightsFingerprint,
    ...(material.rights.expiresAt ? { rightsExpiresAt: material.rights.expiresAt } : {}),
    ...(material.costPolicy ? { costPolicy: material.costPolicy } : {}),
    createdAt: record.createdAt,
    fingerprint: record.fingerprint,
  });
}

export class FileGenerationMaterialStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    job: GenerationJob,
    material: GenerationWorkerMaterial,
    input: Readonly<{ actorId: string; now?: Date }>,
  ): Promise<StoredEnvelope<GenerationMaterialRecord>> {
    const now = input.now ?? new Date();
    const record = createGenerationMaterialRecord(job, material, now);
    const existing = await this.read(job.id);
    if (existing) return this.#assertIdempotent(existing, record);

    try {
      const created = await this.#store.create(
        GENERATION_MATERIAL_ENTITY_TYPE,
        record.id,
        record as unknown as Record<string, unknown>,
        now,
      ) as unknown as StoredEnvelope<GenerationMaterialRecord>;
      await this.#store.appendAuditEvent({
        actorId: input.actorId,
        action: "generation.material.created",
        entityType: GENERATION_MATERIAL_ENTITY_TYPE,
        entityId: created.entityId,
        revision: created.revision,
        metadata: {
          jobId: record.jobId,
          projectId: record.projectId,
          segmentId: record.segmentId,
          candidateCount: record.candidateCount,
          textHash: record.textHash,
          materialFingerprint: record.fingerprint,
        },
        occurredAt: now,
      });
      return created;
    } catch (error) {
      if (!(error instanceof StoreConflictError)) throw error;
      const raced = await this.read(job.id);
      if (!raced) throw error;
      return this.#assertIdempotent(raced, record);
    }
  }

  async read(
    jobId: string,
  ): Promise<StoredEnvelope<GenerationMaterialRecord> | null> {
    const entityId = generationMaterialEntityId(jobId);
    const envelope = await this.#store.read<Record<string, unknown>>(
      GENERATION_MATERIAL_ENTITY_TYPE,
      entityId,
    );
    if (!envelope) return null;
    const typed = envelope as unknown as StoredEnvelope<GenerationMaterialRecord>;
    assertGenerationMaterialRecord(typed.payload, typed.entityId);
    return typed;
  }

  async require(
    jobId: string,
  ): Promise<StoredEnvelope<GenerationMaterialRecord>> {
    const envelope = await this.read(jobId);
    if (!envelope) throw new GenerationMaterialConflictError("GENERATION_MATERIAL_NOT_FOUND");
    return envelope;
  }

  async resolve(
    claim: GenerationQueueClaim,
  ): Promise<GenerationWorkerMaterial> {
    if (claim.item.status !== "leased" || !claim.item.lease) {
      throw new GenerationMaterialConflictError("GENERATION_MATERIAL_ACTIVE_CLAIM_REQUIRED");
    }
    const envelope = await this.require(claim.item.jobId);
    const record = envelope.payload;
    if (
      record.projectId !== claim.item.projectId
      || record.segmentId !== claim.item.segmentId
      || record.jobCacheKey !== claim.item.job.cacheKey
      || record.candidateCount !== claim.item.job.candidateCount
    ) {
      throw new GenerationMaterialConflictError("GENERATION_MATERIAL_CLAIM_SCOPE_MISMATCH");
    }
    return record.material;
  }

  async publicView(jobId: string): Promise<GenerationMaterialPublicView> {
    return generationMaterialPublicView((await this.require(jobId)).payload);
  }

  #assertIdempotent(
    existing: StoredEnvelope<GenerationMaterialRecord>,
    proposed: GenerationMaterialRecord,
  ): StoredEnvelope<GenerationMaterialRecord> {
    assertGenerationMaterialRecord(existing.payload, existing.entityId);
    if (existing.payload.fingerprint !== proposed.fingerprint) {
      throw new GenerationMaterialConflictError("GENERATION_MATERIAL_IDEMPOTENCY_CONFLICT");
    }
    return existing;
  }
}
