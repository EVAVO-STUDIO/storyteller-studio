import {
  stableHash,
  type AcousticSignature,
  type ProjectManifest,
} from "./index.js";
import {
  assertAdmittedNarratorCasting,
  type AdmittedNarratorCasting,
} from "./narrator-casting-admission.js";
import {
  assertNarratorProductionJob,
  type NarratorProductionJob,
} from "./narrator-production-job.js";
import {
  assertNarratorChapterMonitoringResult,
  assertNarratorChapterObjectiveObservation,
  assertNarratorMonitoringPolicy,
  assertNarratorQualityReference,
  createNarratorChapterObjectiveObservation,
  createNarratorQualityReference,
  monitorNarratorChapter,
  type NarratorChapterMonitoringResult,
  type NarratorChapterObjectiveObservation,
  type NarratorMonitoringPolicy,
  type NarratorQualityReference,
} from "./narrator-book-monitor.js";
import {
  assertChapterNarratorReview,
  assertExactNarratorVoicePin,
  createChapterNarratorReview,
  type ChapterNarratorReview,
  type ChapterNarratorReviewInput,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";

export const ADMITTED_NARRATOR_QUALITY_REFERENCE_SCHEMA =
  "storyteller-admitted-narrator-quality-reference-v1" as const;
export const ADMITTED_NARRATOR_CHAPTER_MONITOR_SCHEMA =
  "storyteller-admitted-narrator-chapter-monitor-v1" as const;
export const ADMITTED_CHAPTER_NARRATOR_REVIEW_SCHEMA =
  "storyteller-admitted-chapter-narrator-review-v1" as const;

export type AdmittedNarratorObjectiveMetrics = Omit<
  NarratorChapterObjectiveObservation,
  | "projectId"
  | "chapterId"
  | "castingFingerprint"
  | "voice"
  | "renderFingerprint"
  | "sourceFingerprint"
  | "fingerprint"
>;

export type AdmittedChapterReviewMetrics = Omit<
  ChapterNarratorReviewInput,
  | "projectId"
  | "chapterId"
  | "casting"
  | "renderFingerprint"
  | "objectiveMonitoring"
>;

export interface AdmittedNarratorQualityReference {
  schemaVersion: typeof ADMITTED_NARRATOR_QUALITY_REFERENCE_SCHEMA;
  projectId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  reference: NarratorQualityReference;
  humanListeningApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface AdmittedNarratorChapterMonitoring {
  schemaVersion: typeof ADMITTED_NARRATOR_CHAPTER_MONITOR_SCHEMA;
  projectId: string;
  chapterId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  projectSourceHash: string;
  chapterSourceFingerprint: string;
  segmentIds: readonly string[];
  productionJobIds: readonly string[];
  productionCacheKeys: readonly string[];
  productionSetFingerprint: string;
  renderFingerprint: string;
  policyFingerprint: string;
  referenceFingerprint: string;
  objectiveObservation: NarratorChapterObjectiveObservation;
  objectiveMonitoring: NarratorChapterMonitoringResult;
  status: NarratorChapterMonitoringResult["status"];
  humanListeningApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface AdmittedChapterNarratorReview {
  schemaVersion: typeof ADMITTED_CHAPTER_NARRATOR_REVIEW_SCHEMA;
  projectId: string;
  chapterId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  chapterSourceFingerprint: string;
  productionSetFingerprint: string;
  renderFingerprint: string;
  admittedMonitoringFingerprint: string;
  objectiveMonitoringFingerprint: string;
  monitoring: AdmittedNarratorChapterMonitoring;
  review: ChapterNarratorReview;
  chapterApproved: true;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface AdmittedChapterNarratorReviewPublicView {
  projectId: string;
  chapterId: string;
  profileId: string;
  profileRevision: number;
  admissionBound: true;
  productionJobCount: number;
  objectiveMonitoringStatus: NarratorChapterMonitoringResult["status"];
  objectiveFindingCount: number;
  humanReviewBound: true;
  chapterApproved: true;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MINIMUM_PRODUCTION_CANDIDATES = 3;

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) throw new Error(code);
  return value;
}

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) throw new Error(code);
  return value;
}

function equalStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function qualityReferenceBase(
  value: Omit<AdmittedNarratorQualityReference, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function chapterMonitoringBase(
  value: Omit<AdmittedNarratorChapterMonitoring, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function chapterReviewBase(
  value: Omit<AdmittedChapterNarratorReview, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function chapterProductionBinding(input: Readonly<{
  admittedCasting: AdmittedNarratorCasting;
  manifest: ProjectManifest;
  chapterId: string;
  productionJobs: readonly NarratorProductionJob[];
}>): Readonly<{
  projectSourceHash: string;
  chapterSourceFingerprint: string;
  segmentIds: readonly string[];
  productionJobIds: readonly string[];
  productionCacheKeys: readonly string[];
  productionSetFingerprint: string;
}> {
  assertAdmittedNarratorCasting(input.admittedCasting);
  const projectId = input.admittedCasting.projectId;
  const chapterId = requireIdentifier(input.chapterId, "ADMITTED_CHAPTER_ID_INVALID");
  if (input.manifest.schemaVersion !== "storyteller-project-v1") {
    throw new Error("ADMITTED_CHAPTER_PROJECT_SCHEMA_UNSUPPORTED");
  }
  if (input.manifest.id !== projectId) {
    throw new Error("ADMITTED_CHAPTER_PROJECT_MISMATCH");
  }
  const projectSourceHash = requireHash(
    input.manifest.sourceHash,
    "ADMITTED_CHAPTER_PROJECT_SOURCE_HASH_INVALID",
  );
  if (input.manifest.manuscript.sourceHash !== projectSourceHash) {
    throw new Error("ADMITTED_CHAPTER_MANUSCRIPT_SOURCE_MISMATCH");
  }
  if (!input.manifest.manuscript.chapters.some((chapter) => chapter.id === chapterId)) {
    throw new Error("ADMITTED_CHAPTER_DEFINITION_MISSING");
  }
  const segments = input.manifest.manuscript.segments.filter(
    (segment) => segment.chapterId === chapterId,
  );
  if (segments.length === 0) throw new Error("ADMITTED_CHAPTER_SEGMENTS_REQUIRED");
  const segmentIds = segments.map((segment) => requireIdentifier(
    segment.id,
    "ADMITTED_CHAPTER_SEGMENT_ID_INVALID",
  ));
  if (new Set(segmentIds).size !== segmentIds.length) {
    throw new Error("ADMITTED_CHAPTER_SEGMENT_DUPLICATE");
  }
  for (const segment of segments) {
    if (segment.sourceHash !== projectSourceHash) {
      throw new Error("ADMITTED_CHAPTER_SEGMENT_SOURCE_MISMATCH");
    }
  }
  if (!Array.isArray(input.productionJobs) || input.productionJobs.length !== segments.length) {
    throw new Error("ADMITTED_CHAPTER_PRODUCTION_JOB_COUNT_MISMATCH");
  }
  const productionJobIds: string[] = [];
  const productionCacheKeys: string[] = [];
  const productionRows = input.productionJobs.map((job, index) => {
    assertNarratorProductionJob(job, input.admittedCasting);
    const segment = segments[index];
    if (!segment || job.segmentId !== segment.id) {
      throw new Error("ADMITTED_CHAPTER_PRODUCTION_SEGMENT_ORDER_MISMATCH");
    }
    if (job.status !== "ready") throw new Error("ADMITTED_CHAPTER_PRODUCTION_JOB_NOT_READY");
    if (
      !Number.isSafeInteger(job.candidateCount)
      || job.candidateCount < MINIMUM_PRODUCTION_CANDIDATES
    ) throw new Error("ADMITTED_CHAPTER_PRODUCTION_CANDIDATES_INSUFFICIENT");
    productionJobIds.push(requireIdentifier(job.id, "ADMITTED_CHAPTER_PRODUCTION_JOB_ID_INVALID"));
    productionCacheKeys.push(requireHash(job.cacheKey, "ADMITTED_CHAPTER_PRODUCTION_CACHE_KEY_INVALID"));
    return {
      id: job.id,
      segmentId: job.segmentId,
      cacheKey: job.cacheKey,
      candidateCount: job.candidateCount,
      narratorProductionSchema: job.narratorProductionSchema,
      narratorProfileAdmissionHash: job.narratorProfileAdmissionHash,
      narratorAdmittedCastingFingerprint: job.narratorAdmittedCastingFingerprint,
      narratorCastingFingerprint: job.narratorCastingFingerprint,
      narratorVoice: job.narratorVoice,
    };
  });
  if (new Set(productionJobIds).size !== productionJobIds.length) {
    throw new Error("ADMITTED_CHAPTER_PRODUCTION_JOB_DUPLICATE");
  }
  if (new Set(productionCacheKeys).size !== productionCacheKeys.length) {
    throw new Error("ADMITTED_CHAPTER_PRODUCTION_CACHE_KEY_DUPLICATE");
  }
  const chapterSourceFingerprint = stableHash({
    projectSourceHash,
    chapterId,
    segments: segments.map((segment) => ({
      id: segment.id,
      ordinal: segment.ordinal,
      kind: segment.kind,
      sourceStart: segment.sourceStart,
      sourceEnd: segment.sourceEnd,
      textHash: stableHash(segment.text),
    })),
  });
  const productionSetFingerprint = stableHash({
    projectId,
    chapterId,
    profileAdmissionHash: input.admittedCasting.profileAdmission.admissionHash,
    admittedCastingFingerprint: input.admittedCasting.fingerprint,
    castingFingerprint: input.admittedCasting.casting.fingerprint,
    voice: input.admittedCasting.casting.voice,
    chapterSourceFingerprint,
    jobs: productionRows,
  });
  return Object.freeze({
    projectSourceHash,
    chapterSourceFingerprint,
    segmentIds: Object.freeze(segmentIds),
    productionJobIds: Object.freeze(productionJobIds),
    productionCacheKeys: Object.freeze(productionCacheKeys),
    productionSetFingerprint,
  });
}

export function createAdmittedNarratorQualityReference(input: Readonly<{
  admittedCasting: AdmittedNarratorCasting;
  acousticSignature: AcousticSignature;
  expectedChapterDurationSeconds?: number;
  roomToneRmsDb: number;
  evidenceHash: string;
}>): AdmittedNarratorQualityReference {
  assertAdmittedNarratorCasting(input.admittedCasting);
  const casting = input.admittedCasting.casting;
  const reference = createNarratorQualityReference({
    casting,
    acousticSignature: input.acousticSignature,
    ...(input.expectedChapterDurationSeconds !== undefined
      ? { expectedChapterDurationSeconds: input.expectedChapterDurationSeconds }
      : {}),
    roomToneRmsDb: input.roomToneRmsDb,
    evidenceHash: input.evidenceHash,
  });
  const partial: Omit<AdmittedNarratorQualityReference, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_QUALITY_REFERENCE_SCHEMA,
    projectId: input.admittedCasting.projectId,
    profileAdmissionHash: input.admittedCasting.profileAdmission.admissionHash,
    admittedCastingFingerprint: input.admittedCasting.fingerprint,
    castingFingerprint: casting.fingerprint,
    voice: Object.freeze({ ...casting.voice }),
    reference,
    humanListeningApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(qualityReferenceBase(partial)),
  });
}

export function assertAdmittedNarratorQualityReference(
  value: AdmittedNarratorQualityReference,
  admittedCasting: AdmittedNarratorCasting,
): void {
  assertAdmittedNarratorCasting(admittedCasting);
  if (value.schemaVersion !== ADMITTED_NARRATOR_QUALITY_REFERENCE_SCHEMA) {
    throw new Error("ADMITTED_NARRATOR_REFERENCE_SCHEMA_UNSUPPORTED");
  }
  if (
    value.projectId !== admittedCasting.projectId
    || value.profileAdmissionHash !== admittedCasting.profileAdmission.admissionHash
    || value.admittedCastingFingerprint !== admittedCasting.fingerprint
    || value.castingFingerprint !== admittedCasting.casting.fingerprint
  ) throw new Error("ADMITTED_NARRATOR_REFERENCE_CASTING_MISMATCH");
  assertExactNarratorVoicePin(admittedCasting.casting.voice, value.voice);
  assertNarratorQualityReference(value.reference, admittedCasting.casting);
  if (
    value.humanListeningApproval !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) throw new Error("ADMITTED_NARRATOR_REFERENCE_AUTHORITY_INVALID");
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(qualityReferenceBase(partial))) {
    throw new Error("ADMITTED_NARRATOR_REFERENCE_FINGERPRINT_INVALID");
  }
}

export function monitorAdmittedNarratorChapter(input: Readonly<{
  admittedCasting: AdmittedNarratorCasting;
  manifest: ProjectManifest;
  chapterId: string;
  productionJobs: readonly NarratorProductionJob[];
  renderFingerprint: string;
  policy: NarratorMonitoringPolicy;
  reference: AdmittedNarratorQualityReference;
  objective: AdmittedNarratorObjectiveMetrics;
}>): AdmittedNarratorChapterMonitoring {
  assertAdmittedNarratorCasting(input.admittedCasting);
  assertNarratorMonitoringPolicy(input.policy);
  assertAdmittedNarratorQualityReference(input.reference, input.admittedCasting);
  const binding = chapterProductionBinding(input);
  const renderFingerprint = requireHash(
    input.renderFingerprint,
    "ADMITTED_CHAPTER_RENDER_FINGERPRINT_INVALID",
  );
  const casting = input.admittedCasting.casting;
  const objectiveObservation = createNarratorChapterObjectiveObservation({
    projectId: input.admittedCasting.projectId,
    chapterId: input.chapterId,
    castingFingerprint: casting.fingerprint,
    voice: casting.voice,
    renderFingerprint,
    sourceFingerprint: binding.chapterSourceFingerprint,
    ...input.objective,
  });
  const objectiveMonitoring = monitorNarratorChapter({
    casting,
    policy: input.policy,
    reference: input.reference.reference,
    observation: objectiveObservation,
  });
  const partial: Omit<AdmittedNarratorChapterMonitoring, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_CHAPTER_MONITOR_SCHEMA,
    projectId: input.admittedCasting.projectId,
    chapterId: input.chapterId,
    profileAdmissionHash: input.admittedCasting.profileAdmission.admissionHash,
    admittedCastingFingerprint: input.admittedCasting.fingerprint,
    castingFingerprint: casting.fingerprint,
    voice: Object.freeze({ ...casting.voice }),
    projectSourceHash: binding.projectSourceHash,
    chapterSourceFingerprint: binding.chapterSourceFingerprint,
    segmentIds: binding.segmentIds,
    productionJobIds: binding.productionJobIds,
    productionCacheKeys: binding.productionCacheKeys,
    productionSetFingerprint: binding.productionSetFingerprint,
    renderFingerprint,
    policyFingerprint: input.policy.fingerprint,
    referenceFingerprint: input.reference.fingerprint,
    objectiveObservation,
    objectiveMonitoring,
    status: objectiveMonitoring.status,
    humanListeningApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(chapterMonitoringBase(partial)),
  });
}

export function assertAdmittedNarratorChapterMonitoring(
  value: AdmittedNarratorChapterMonitoring,
  context: Readonly<{
    admittedCasting: AdmittedNarratorCasting;
    manifest: ProjectManifest;
    productionJobs: readonly NarratorProductionJob[];
    policy: NarratorMonitoringPolicy;
    reference: AdmittedNarratorQualityReference;
  }>,
): void {
  assertAdmittedNarratorCasting(context.admittedCasting);
  assertNarratorMonitoringPolicy(context.policy);
  assertAdmittedNarratorQualityReference(context.reference, context.admittedCasting);
  if (value.schemaVersion !== ADMITTED_NARRATOR_CHAPTER_MONITOR_SCHEMA) {
    throw new Error("ADMITTED_CHAPTER_MONITOR_SCHEMA_UNSUPPORTED");
  }
  const binding = chapterProductionBinding({
    admittedCasting: context.admittedCasting,
    manifest: context.manifest,
    chapterId: value.chapterId,
    productionJobs: context.productionJobs,
  });
  if (
    value.projectId !== context.admittedCasting.projectId
    || value.profileAdmissionHash !== context.admittedCasting.profileAdmission.admissionHash
    || value.admittedCastingFingerprint !== context.admittedCasting.fingerprint
    || value.castingFingerprint !== context.admittedCasting.casting.fingerprint
  ) throw new Error("ADMITTED_CHAPTER_MONITOR_CASTING_MISMATCH");
  assertExactNarratorVoicePin(context.admittedCasting.casting.voice, value.voice);
  if (
    value.projectSourceHash !== binding.projectSourceHash
    || value.chapterSourceFingerprint !== binding.chapterSourceFingerprint
    || value.productionSetFingerprint !== binding.productionSetFingerprint
    || !equalStrings(value.segmentIds, binding.segmentIds)
    || !equalStrings(value.productionJobIds, binding.productionJobIds)
    || !equalStrings(value.productionCacheKeys, binding.productionCacheKeys)
  ) throw new Error("ADMITTED_CHAPTER_MONITOR_PRODUCTION_BINDING_MISMATCH");
  if (
    value.policyFingerprint !== context.policy.fingerprint
    || value.referenceFingerprint !== context.reference.fingerprint
  ) throw new Error("ADMITTED_CHAPTER_MONITOR_POLICY_REFERENCE_MISMATCH");
  requireHash(value.renderFingerprint, "ADMITTED_CHAPTER_RENDER_FINGERPRINT_INVALID");
  assertNarratorChapterObjectiveObservation(value.objectiveObservation);
  if (
    value.objectiveObservation.projectId !== value.projectId
    || value.objectiveObservation.chapterId !== value.chapterId
    || value.objectiveObservation.castingFingerprint !== value.castingFingerprint
    || value.objectiveObservation.renderFingerprint !== value.renderFingerprint
    || value.objectiveObservation.sourceFingerprint !== value.chapterSourceFingerprint
  ) throw new Error("ADMITTED_CHAPTER_MONITOR_OBSERVATION_BINDING_MISMATCH");
  assertExactNarratorVoicePin(value.voice, value.objectiveObservation.voice);
  assertNarratorChapterMonitoringResult(
    value.objectiveMonitoring,
    context.admittedCasting.casting,
  );
  const recomputed = monitorNarratorChapter({
    casting: context.admittedCasting.casting,
    policy: context.policy,
    reference: context.reference.reference,
    observation: value.objectiveObservation,
  });
  if (recomputed.fingerprint !== value.objectiveMonitoring.fingerprint) {
    throw new Error("ADMITTED_CHAPTER_MONITOR_RECOMPUTATION_MISMATCH");
  }
  if (
    value.objectiveMonitoring.renderFingerprint !== value.renderFingerprint
    || value.objectiveMonitoring.sourceFingerprint !== value.chapterSourceFingerprint
    || value.status !== value.objectiveMonitoring.status
  ) throw new Error("ADMITTED_CHAPTER_MONITOR_RESULT_BINDING_MISMATCH");
  if (
    value.humanListeningApproval !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) throw new Error("ADMITTED_CHAPTER_MONITOR_AUTHORITY_INVALID");
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(chapterMonitoringBase(partial))) {
    throw new Error("ADMITTED_CHAPTER_MONITOR_FINGERPRINT_INVALID");
  }
}

export function createAdmittedChapterNarratorReview(input: Readonly<{
  admittedCasting: AdmittedNarratorCasting;
  manifest: ProjectManifest;
  productionJobs: readonly NarratorProductionJob[];
  policy: NarratorMonitoringPolicy;
  reference: AdmittedNarratorQualityReference;
  monitoring: AdmittedNarratorChapterMonitoring;
  review: AdmittedChapterReviewMetrics;
}>): AdmittedChapterNarratorReview {
  assertAdmittedNarratorChapterMonitoring(input.monitoring, {
    admittedCasting: input.admittedCasting,
    manifest: input.manifest,
    productionJobs: input.productionJobs,
    policy: input.policy,
    reference: input.reference,
  });
  const review = createChapterNarratorReview({
    projectId: input.monitoring.projectId,
    chapterId: input.monitoring.chapterId,
    casting: input.admittedCasting.casting,
    renderFingerprint: input.monitoring.renderFingerprint,
    objectiveMonitoring: input.monitoring.objectiveMonitoring,
    ...input.review,
  });
  const partial: Omit<AdmittedChapterNarratorReview, "fingerprint"> = {
    schemaVersion: ADMITTED_CHAPTER_NARRATOR_REVIEW_SCHEMA,
    projectId: input.monitoring.projectId,
    chapterId: input.monitoring.chapterId,
    profileAdmissionHash: input.monitoring.profileAdmissionHash,
    admittedCastingFingerprint: input.monitoring.admittedCastingFingerprint,
    castingFingerprint: input.monitoring.castingFingerprint,
    voice: Object.freeze({ ...input.monitoring.voice }),
    chapterSourceFingerprint: input.monitoring.chapterSourceFingerprint,
    productionSetFingerprint: input.monitoring.productionSetFingerprint,
    renderFingerprint: input.monitoring.renderFingerprint,
    admittedMonitoringFingerprint: input.monitoring.fingerprint,
    objectiveMonitoringFingerprint: input.monitoring.objectiveMonitoring.fingerprint,
    monitoring: input.monitoring,
    review,
    chapterApproved: true,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(chapterReviewBase(partial)),
  });
}

export function assertAdmittedChapterNarratorReview(
  value: AdmittedChapterNarratorReview,
  context: Readonly<{
    admittedCasting: AdmittedNarratorCasting;
    manifest: ProjectManifest;
    productionJobs: readonly NarratorProductionJob[];
    policy: NarratorMonitoringPolicy;
    reference: AdmittedNarratorQualityReference;
  }>,
): void {
  if (value.schemaVersion !== ADMITTED_CHAPTER_NARRATOR_REVIEW_SCHEMA) {
    throw new Error("ADMITTED_CHAPTER_REVIEW_SCHEMA_UNSUPPORTED");
  }
  assertAdmittedNarratorChapterMonitoring(value.monitoring, context);
  if (
    value.projectId !== value.monitoring.projectId
    || value.chapterId !== value.monitoring.chapterId
    || value.profileAdmissionHash !== value.monitoring.profileAdmissionHash
    || value.admittedCastingFingerprint !== value.monitoring.admittedCastingFingerprint
    || value.castingFingerprint !== value.monitoring.castingFingerprint
    || value.chapterSourceFingerprint !== value.monitoring.chapterSourceFingerprint
    || value.productionSetFingerprint !== value.monitoring.productionSetFingerprint
    || value.renderFingerprint !== value.monitoring.renderFingerprint
    || value.admittedMonitoringFingerprint !== value.monitoring.fingerprint
    || value.objectiveMonitoringFingerprint !== value.monitoring.objectiveMonitoring.fingerprint
  ) throw new Error("ADMITTED_CHAPTER_REVIEW_MONITORING_BINDING_MISMATCH");
  assertExactNarratorVoicePin(value.monitoring.voice, value.voice);
  assertChapterNarratorReview(value.review, context.admittedCasting.casting);
  if (
    value.review.projectId !== value.projectId
    || value.review.chapterId !== value.chapterId
    || value.review.castingFingerprint !== value.castingFingerprint
    || value.review.renderFingerprint !== value.renderFingerprint
    || value.review.sourceFingerprint !== value.chapterSourceFingerprint
    || value.review.objectiveMonitoringFingerprint !== value.objectiveMonitoringFingerprint
  ) throw new Error("ADMITTED_CHAPTER_REVIEW_INNER_REVIEW_MISMATCH");
  assertExactNarratorVoicePin(value.voice, value.review.voice);
  if (
    value.chapterApproved !== true
    || value.titleNarratorApproval !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) throw new Error("ADMITTED_CHAPTER_REVIEW_AUTHORITY_INVALID");
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(chapterReviewBase(partial))) {
    throw new Error("ADMITTED_CHAPTER_REVIEW_FINGERPRINT_INVALID");
  }
}

export function admittedChapterNarratorReviewPublicView(
  value: AdmittedChapterNarratorReview,
  context: Readonly<{
    admittedCasting: AdmittedNarratorCasting;
    manifest: ProjectManifest;
    productionJobs: readonly NarratorProductionJob[];
    policy: NarratorMonitoringPolicy;
    reference: AdmittedNarratorQualityReference;
  }>,
): AdmittedChapterNarratorReviewPublicView {
  assertAdmittedChapterNarratorReview(value, context);
  return Object.freeze({
    projectId: value.projectId,
    chapterId: value.chapterId,
    profileId: value.voice.profileId,
    profileRevision: value.voice.revision,
    admissionBound: true,
    productionJobCount: value.monitoring.productionJobIds.length,
    objectiveMonitoringStatus: value.monitoring.status,
    objectiveFindingCount: value.monitoring.objectiveMonitoring.findingCodes.length,
    humanReviewBound: true,
    chapterApproved: true,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    fingerprint: value.fingerprint,
  });
}
