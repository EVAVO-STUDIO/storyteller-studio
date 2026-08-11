import {
  assertArtifactRecord,
  type ArtifactRecord,
} from "./artifact-registry.js";
import {
  assertBookCreditDeliverySnapshot,
  createBookCreditDeliverySnapshot,
  type BookCreditDeliverySnapshot,
} from "./book-credit-delivery.js";
import {
  assertBookCreditGenerationPlan,
  createBookCreditGenerationPlan,
  type BookCreditGenerationPlan,
  type CreateBookCreditGenerationInput,
} from "./book-credit-generation.js";
import {
  assertBookCreditMasterChain,
  type BookCreditMasterChain,
} from "./book-credit-master.js";
import {
  assertBookCreditTakeReviewSession,
  type BookCreditTakeReviewSession,
} from "./book-credit-take-review.js";
import {
  createGenerationCalibrationBindingRecord,
} from "./generation-calibration.js";
import {
  createGenerationMaterialRecord,
} from "./generation-material.js";
import { stableHash } from "./index.js";
import {
  assertAdmittedNarratorCasting,
  type AdmittedNarratorCasting,
} from "./narrator-casting-admission.js";
import {
  assertNarratorProductionJob,
  STORYTELLER_NARRATOR_PRODUCTION_JOB_SCHEMA,
  type NarratorProductionJob,
} from "./narrator-production-job.js";
import {
  assertExactNarratorVoicePin,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";

export const ADMITTED_NARRATOR_CREDIT_GENERATION_SCHEMA =
  "storyteller-admitted-narrator-credit-generation-v1" as const;
export const ADMITTED_NARRATOR_CREDIT_DELIVERY_SCHEMA =
  "storyteller-admitted-narrator-credit-delivery-v1" as const;

export interface AdmittedNarratorBookCreditGeneration {
  schemaVersion: typeof ADMITTED_NARRATOR_CREDIT_GENERATION_SCHEMA;
  projectId: string;
  bookId: string;
  creditKind: "opening" | "closing";
  admittedCasting: AdmittedNarratorCasting;
  plan: BookCreditGenerationPlan;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  productionJobId: string;
  productionCacheKey: string;
  narratorAdmissionBound: true;
  exactVoiceRevisionBound: true;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface AdmittedNarratorBookCreditDelivery {
  schemaVersion: typeof ADMITTED_NARRATOR_CREDIT_DELIVERY_SCHEMA;
  projectId: string;
  bookId: string;
  creditKind: "opening" | "closing";
  generation: AdmittedNarratorBookCreditGeneration;
  reviewSession: BookCreditTakeReviewSession;
  masterChain: BookCreditMasterChain;
  delivery: BookCreditDeliverySnapshot;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  productionJobId: string;
  productionCacheKey: string;
  selectedTakeRecordId: string;
  creditMaster: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
    contentHash: string;
    byteCount: number;
  }>;
  narratorAdmissionBound: true;
  eligibleForAdmittedBookAssembly: true;
  completeBookListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface AdmittedNarratorBookCreditPublicView {
  bookId: string;
  creditKind: "opening" | "closing";
  durationMs: number;
  productionJobCount: 1;
  narratorAdmissionBound: true;
  eligibleForAdmittedBookAssembly: true;
  completeBookListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export class AdmittedNarratorCreditError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AdmittedNarratorCreditError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new AdmittedNarratorCreditError(code);
  }
  return value;
}

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new AdmittedNarratorCreditError(code);
  }
  return value;
}

function generationBase(
  value: Omit<AdmittedNarratorBookCreditGeneration, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function deliveryBase(
  value: Omit<AdmittedNarratorBookCreditDelivery, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function admittedCreditCacheKey(
  admittedCasting: AdmittedNarratorCasting,
  plan: BookCreditGenerationPlan,
): string {
  return stableHash({
    purpose: "admitted-narrator-book-credit-production-v1",
    profileAdmissionHash: admittedCasting.profileAdmission.admissionHash,
    admittedCastingFingerprint: admittedCasting.fingerprint,
    castingFingerprint: admittedCasting.casting.fingerprint,
    voice: admittedCasting.casting.voice,
    script: {
      id: plan.script.id,
      revision: plan.script.revision,
      fingerprint: plan.script.fingerprint,
      textHash: plan.script.textHash,
      approvalFingerprint: plan.script.approval?.fingerprint ?? null,
    },
    calibrationLockFingerprint:
      plan.calibration.calibrationLock.lockFingerprint,
    candidateCount: plan.job.candidateCount,
    direction: plan.material.material.direction,
    pronunciations: plan.material.material.pronunciations,
    rights: plan.material.material.rights,
    costPolicy: plan.material.material.costPolicy ?? null,
    format: plan.material.material.format ?? "wav",
    sampleRateHz: plan.material.material.sampleRateHz ?? 44_100,
  });
}

function assertGenerationScope(
  value: AdmittedNarratorBookCreditGeneration,
): void {
  assertAdmittedNarratorCasting(value.admittedCasting);
  assertBookCreditGenerationPlan(value.plan);
  assertNarratorProductionJob(value.plan.job, value.admittedCasting);
  const admitted = value.admittedCasting;
  const voice = admitted.casting.voice;
  assertExactNarratorVoicePin(voice, value.voice);
  if (
    value.projectId !== admitted.projectId
    || value.projectId !== value.plan.projectId
    || value.bookId !== value.plan.bookId
    || value.creditKind !== value.plan.creditKind
    || value.profileAdmissionHash !== admitted.profileAdmission.admissionHash
    || value.admittedCastingFingerprint !== admitted.fingerprint
    || value.castingFingerprint !== admitted.casting.fingerprint
    || value.productionJobId !== value.plan.job.id
    || value.productionCacheKey !== value.plan.job.cacheKey
    || value.plan.material.material.voiceProfileId !== voice.profileId
    || value.plan.material.material.voiceRevision !== voice.revision
    || value.plan.material.material.voiceProfileHash !== voice.profileHash
    || value.plan.calibration.calibrationLock.projectId !== admitted.projectId
    || value.plan.calibration.calibrationLock.voiceProfileId !== voice.profileId
    || value.plan.calibration.calibrationLock.voiceRevision !== voice.revision
    || value.plan.job.cacheKey !== admittedCreditCacheKey(admitted, value.plan)
  ) {
    throw new AdmittedNarratorCreditError(
      "ADMITTED_NARRATOR_CREDIT_GENERATION_LINEAGE_MISMATCH",
    );
  }
  if (
    value.narratorAdmissionBound !== true
    || value.exactVoiceRevisionBound !== true
    || value.titleNarratorApproval !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorCreditError(
      "ADMITTED_NARRATOR_CREDIT_GENERATION_AUTHORITY_INVALID",
    );
  }
}

export function createAdmittedNarratorBookCreditGeneration(input: Readonly<{
  admittedCasting: AdmittedNarratorCasting;
  generation: CreateBookCreditGenerationInput;
}>): AdmittedNarratorBookCreditGeneration {
  assertAdmittedNarratorCasting(input.admittedCasting);
  const admitted = input.admittedCasting;
  const voice = admitted.casting.voice;
  if (
    input.generation.script.projectId !== admitted.projectId
    || input.generation.calibrationLock.projectId !== admitted.projectId
    || input.generation.calibrationLock.voiceProfileId !== voice.profileId
    || input.generation.calibrationLock.voiceRevision !== voice.revision
  ) {
    throw new AdmittedNarratorCreditError(
      "ADMITTED_NARRATOR_CREDIT_GENERATION_CASTING_MISMATCH",
    );
  }

  const generic = createBookCreditGenerationPlan(input.generation);
  const createdAt = new Date(generic.createdAt);
  const preliminaryPlan = Object.freeze({
    ...generic,
    material: Object.freeze({
      ...generic.material,
      material: Object.freeze({
        ...generic.material.material,
        voiceProfileHash: voice.profileHash,
      }),
    }),
  }) as BookCreditGenerationPlan;
  const cacheKey = admittedCreditCacheKey(admitted, preliminaryPlan);
  const job: NarratorProductionJob = Object.freeze({
    ...generic.job,
    id: `job_${stableHash({
      baseJobId: generic.job.id,
      cacheKey,
      profileAdmissionHash: admitted.profileAdmission.admissionHash,
      admittedCastingFingerprint: admitted.fingerprint,
      castingFingerprint: admitted.casting.fingerprint,
      creditKind: generic.creditKind,
    }).slice(0, 20)}`,
    cacheKey,
    narratorProductionSchema: STORYTELLER_NARRATOR_PRODUCTION_JOB_SCHEMA,
    narratorProfileAdmissionHash: admitted.profileAdmission.admissionHash,
    narratorAdmittedCastingFingerprint: admitted.fingerprint,
    narratorCastingFingerprint: admitted.casting.fingerprint,
    narratorVoice: Object.freeze({ ...voice }),
  });
  assertNarratorProductionJob(job, admitted);
  const material = createGenerationMaterialRecord(
    job,
    {
      ...generic.material.material,
      voiceProfileHash: voice.profileHash,
    },
    createdAt,
  );
  const calibration = createGenerationCalibrationBindingRecord(
    job,
    generic.calibration.calibrationLock,
    createdAt,
  );
  const {
    fingerprint: _fingerprint,
    job: _job,
    material: _material,
    calibration: _calibration,
    ...base
  } = generic;
  const planPartial: Omit<BookCreditGenerationPlan, "fingerprint"> = {
    ...base,
    job,
    material,
    calibration,
  };
  const plan = Object.freeze({
    ...planPartial,
    fingerprint: stableHash(planPartial),
  });
  assertBookCreditGenerationPlan(plan);

  const partial: Omit<AdmittedNarratorBookCreditGeneration, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_CREDIT_GENERATION_SCHEMA,
    projectId: plan.projectId,
    bookId: plan.bookId,
    creditKind: plan.creditKind,
    admittedCasting: admitted,
    plan,
    profileAdmissionHash: admitted.profileAdmission.admissionHash,
    admittedCastingFingerprint: admitted.fingerprint,
    castingFingerprint: admitted.casting.fingerprint,
    voice: Object.freeze({ ...voice }),
    productionJobId: plan.job.id,
    productionCacheKey: plan.job.cacheKey,
    narratorAdmissionBound: true,
    exactVoiceRevisionBound: true,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const result = Object.freeze({
    ...partial,
    fingerprint: stableHash(generationBase(partial)),
  });
  assertAdmittedNarratorBookCreditGeneration(result);
  return result;
}

export function assertAdmittedNarratorBookCreditGeneration(
  value: AdmittedNarratorBookCreditGeneration,
): void {
  if (value.schemaVersion !== ADMITTED_NARRATOR_CREDIT_GENERATION_SCHEMA) {
    throw new AdmittedNarratorCreditError(
      "ADMITTED_NARRATOR_CREDIT_GENERATION_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    value.projectId,
    "ADMITTED_NARRATOR_CREDIT_GENERATION_PROJECT_INVALID",
  );
  requireIdentifier(
    value.bookId,
    "ADMITTED_NARRATOR_CREDIT_GENERATION_BOOK_INVALID",
  );
  if (value.creditKind !== "opening" && value.creditKind !== "closing") {
    throw new AdmittedNarratorCreditError(
      "ADMITTED_NARRATOR_CREDIT_GENERATION_KIND_INVALID",
    );
  }
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
    value.productionCacheKey,
  ]) requireHash(hash, "ADMITTED_NARRATOR_CREDIT_GENERATION_HASH_INVALID");
  requireIdentifier(
    value.productionJobId,
    "ADMITTED_NARRATOR_CREDIT_GENERATION_JOB_INVALID",
  );
  assertGenerationScope(value);
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(generationBase(partial))) {
    throw new AdmittedNarratorCreditError(
      "ADMITTED_NARRATOR_CREDIT_GENERATION_FINGERPRINT_INVALID",
    );
  }
}

function assertDeliveryLineage(
  value: AdmittedNarratorBookCreditDelivery,
): void {
  assertAdmittedNarratorBookCreditGeneration(value.generation);
  assertBookCreditTakeReviewSession(value.reviewSession);
  assertBookCreditMasterChain(value.masterChain);
  assertBookCreditDeliverySnapshot(value.delivery);
  const generation = value.generation;
  const admitted = generation.admittedCasting;
  const voice = admitted.casting.voice;
  const selected = value.reviewSession.candidates.find(
    (candidate) => candidate.take.id === value.delivery.selectedTakeRecordId,
  );
  if (!selected) {
    throw new AdmittedNarratorCreditError(
      "ADMITTED_NARRATOR_CREDIT_SELECTED_TAKE_MISSING",
    );
  }
  const recomputedDelivery = createBookCreditDeliverySnapshot({
    chain: value.masterChain,
    reviewSession: value.reviewSession,
    now: new Date(value.delivery.createdAt),
  });
  const master = value.masterChain.creditMaster.payload;
  assertArtifactRecord(master);
  assertExactNarratorVoicePin(voice, value.voice);
  if (
    value.projectId !== generation.projectId
    || value.bookId !== generation.bookId
    || value.creditKind !== generation.creditKind
    || value.reviewSession.projectId !== generation.projectId
    || value.reviewSession.bookId !== generation.bookId
    || value.reviewSession.creditKind !== generation.creditKind
    || value.reviewSession.planId !== generation.plan.id
    || value.reviewSession.planFingerprint !== generation.plan.fingerprint
    || value.reviewSession.voiceRevision !== voice.revision
    || value.reviewSession.calibrationLockFingerprint
      !== generation.plan.calibration.calibrationLock.lockFingerprint
    || selected.take.planId !== generation.plan.id
    || selected.take.planFingerprint !== generation.plan.fingerprint
    || selected.take.jobId !== generation.plan.job.id
    || selected.take.voiceRevision !== voice.revision
    || value.masterChain.sessionFingerprint !== value.reviewSession.fingerprint
    || value.masterChain.selectedTakeRecordId !== selected.take.id
    || value.delivery.chainFingerprint !== value.masterChain.fingerprint
    || value.delivery.reviewSessionFingerprint !== value.reviewSession.fingerprint
    || value.delivery.reviewApprovalFingerprint
      !== value.reviewSession.approval?.fingerprint
    || value.delivery.fingerprint !== recomputedDelivery.fingerprint
    || value.profileAdmissionHash !== generation.profileAdmissionHash
    || value.admittedCastingFingerprint !== generation.admittedCastingFingerprint
    || value.castingFingerprint !== generation.castingFingerprint
    || value.productionJobId !== generation.productionJobId
    || value.productionCacheKey !== generation.productionCacheKey
    || value.selectedTakeRecordId !== selected.take.id
    || value.creditMaster.id !== master.id
    || value.creditMaster.revision !== value.masterChain.creditMaster.revision
    || value.creditMaster.fingerprint !== master.fingerprint
    || value.creditMaster.contentHash !== master.integrity.contentHash
    || value.creditMaster.byteCount !== master.integrity.byteCount
    || value.delivery.creditMaster.id !== master.id
    || value.delivery.creditMaster.revision !== value.masterChain.creditMaster.revision
    || value.delivery.creditMaster.fingerprint !== master.fingerprint
    || value.delivery.creditMaster.contentHash !== master.integrity.contentHash
    || value.delivery.creditMaster.byteCount !== master.integrity.byteCount
  ) {
    throw new AdmittedNarratorCreditError(
      "ADMITTED_NARRATOR_CREDIT_DELIVERY_LINEAGE_MISMATCH",
    );
  }
  if (
    value.narratorAdmissionBound !== true
    || value.eligibleForAdmittedBookAssembly !== true
    || value.completeBookListeningApproval !== false
    || value.titleNarratorApproval !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorCreditError(
      "ADMITTED_NARRATOR_CREDIT_DELIVERY_AUTHORITY_INVALID",
    );
  }
}

export function createAdmittedNarratorBookCreditDelivery(input: Readonly<{
  generation: AdmittedNarratorBookCreditGeneration;
  reviewSession: BookCreditTakeReviewSession;
  masterChain: BookCreditMasterChain;
  delivery: BookCreditDeliverySnapshot;
}>): AdmittedNarratorBookCreditDelivery {
  assertAdmittedNarratorBookCreditGeneration(input.generation);
  assertBookCreditTakeReviewSession(input.reviewSession);
  assertBookCreditMasterChain(input.masterChain);
  assertBookCreditDeliverySnapshot(input.delivery);
  const master = input.masterChain.creditMaster.payload;
  const partial: Omit<AdmittedNarratorBookCreditDelivery, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_CREDIT_DELIVERY_SCHEMA,
    projectId: input.generation.projectId,
    bookId: input.generation.bookId,
    creditKind: input.generation.creditKind,
    generation: input.generation,
    reviewSession: input.reviewSession,
    masterChain: input.masterChain,
    delivery: input.delivery,
    profileAdmissionHash: input.generation.profileAdmissionHash,
    admittedCastingFingerprint: input.generation.admittedCastingFingerprint,
    castingFingerprint: input.generation.castingFingerprint,
    voice: Object.freeze({ ...input.generation.voice }),
    productionJobId: input.generation.productionJobId,
    productionCacheKey: input.generation.productionCacheKey,
    selectedTakeRecordId: input.delivery.selectedTakeRecordId,
    creditMaster: Object.freeze({
      id: master.id,
      revision: input.masterChain.creditMaster.revision,
      fingerprint: master.fingerprint,
      contentHash: master.integrity.contentHash,
      byteCount: master.integrity.byteCount,
    }),
    narratorAdmissionBound: true,
    eligibleForAdmittedBookAssembly: true,
    completeBookListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const result = Object.freeze({
    ...partial,
    fingerprint: stableHash(deliveryBase(partial)),
  });
  assertAdmittedNarratorBookCreditDelivery(result);
  return result;
}

export function assertAdmittedNarratorBookCreditDelivery(
  value: AdmittedNarratorBookCreditDelivery,
): void {
  if (value.schemaVersion !== ADMITTED_NARRATOR_CREDIT_DELIVERY_SCHEMA) {
    throw new AdmittedNarratorCreditError(
      "ADMITTED_NARRATOR_CREDIT_DELIVERY_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    value.projectId,
    "ADMITTED_NARRATOR_CREDIT_DELIVERY_PROJECT_INVALID",
  );
  requireIdentifier(
    value.bookId,
    "ADMITTED_NARRATOR_CREDIT_DELIVERY_BOOK_INVALID",
  );
  if (value.creditKind !== "opening" && value.creditKind !== "closing") {
    throw new AdmittedNarratorCreditError(
      "ADMITTED_NARRATOR_CREDIT_DELIVERY_KIND_INVALID",
    );
  }
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
    value.productionCacheKey,
    value.creditMaster.fingerprint,
    value.creditMaster.contentHash,
  ]) requireHash(hash, "ADMITTED_NARRATOR_CREDIT_DELIVERY_HASH_INVALID");
  requireIdentifier(
    value.productionJobId,
    "ADMITTED_NARRATOR_CREDIT_DELIVERY_JOB_INVALID",
  );
  requireIdentifier(
    value.selectedTakeRecordId,
    "ADMITTED_NARRATOR_CREDIT_DELIVERY_TAKE_INVALID",
  );
  requireIdentifier(
    value.creditMaster.id,
    "ADMITTED_NARRATOR_CREDIT_DELIVERY_MASTER_INVALID",
  );
  if (
    !Number.isSafeInteger(value.creditMaster.revision)
    || value.creditMaster.revision < 1
    || !Number.isSafeInteger(value.creditMaster.byteCount)
    || value.creditMaster.byteCount < 1
  ) {
    throw new AdmittedNarratorCreditError(
      "ADMITTED_NARRATOR_CREDIT_DELIVERY_MASTER_SNAPSHOT_INVALID",
    );
  }
  assertDeliveryLineage(value);
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(deliveryBase(partial))) {
    throw new AdmittedNarratorCreditError(
      "ADMITTED_NARRATOR_CREDIT_DELIVERY_FINGERPRINT_INVALID",
    );
  }
}

export function admittedNarratorBookCreditArtifact(
  value: AdmittedNarratorBookCreditDelivery,
): ArtifactRecord {
  assertAdmittedNarratorBookCreditDelivery(value);
  return value.masterChain.creditMaster.payload;
}

export function admittedNarratorBookCreditPublicView(
  value: AdmittedNarratorBookCreditDelivery,
): AdmittedNarratorBookCreditPublicView {
  assertAdmittedNarratorBookCreditDelivery(value);
  return Object.freeze({
    bookId: value.bookId,
    creditKind: value.creditKind,
    durationMs: value.delivery.durationMs,
    productionJobCount: 1,
    narratorAdmissionBound: true,
    eligibleForAdmittedBookAssembly: true,
    completeBookListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    fingerprint: value.fingerprint,
  });
}
