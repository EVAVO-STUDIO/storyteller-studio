import { assertArtifactRecord, type ArtifactRecord } from "./artifact-registry.js";
import { assertAudioEngineeringEvidence, type AudioEngineeringEvidence } from "./audio-engineering.js";
import { stableHash } from "./index.js";
import {
  EXPRESSIVE_MINIMUM_REVIEWERS,
  assertExpressivePerformancePlan,
  assertExpressivePerformanceReview,
  assertExpressiveVoiceRoleBinding,
  type ExpressivePerformanceObservation,
  type ExpressivePerformancePlan,
  type ExpressivePerformanceReview,
  type ExpressivePerformanceScores,
  type ExpressiveVoiceRoleBinding,
} from "./narration-expressive-performance.js";

export const NARRATION_CANDIDATE_EVIDENCE_SCHEMA =
  "storyteller-narration-candidate-evidence-v1" as const;
export const NARRATION_SELECTION_MINIMUM_REVIEWERS = EXPRESSIVE_MINIMUM_REVIEWERS;

export interface NarrationCandidateEvidence {
  schemaVersion: typeof NARRATION_CANDIDATE_EVIDENCE_SCHEMA;
  candidateIndex: number;
  projectId: string;
  segmentId: string;
  takeId: string;
  audioArtifactId: string;
  audioArtifactFingerprint: string;
  audioContentHash: string;
  audioByteCount: number;
  sourceContentHash: string;
  generationRequestHash: string;
  engineeringEvidenceFingerprint: string;
  expressiveRoleBindingFingerprint: string;
  expressivePerformancePlanFingerprint: string;
  expressiveObservationFingerprint: string;
  expressiveReviewFingerprint: string;
  providerId: string;
  rightsFingerprint: string;
  createdByActorId: string;
  verifiedByActorId: string;
  durationMs: number;
  scores: ExpressivePerformanceScores;
  reviewerIds: readonly string[];
  blindComparativeReview: true;
  technicalEligible: true;
  expressivePerformanceApproved: true;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export class NarrationCandidateEvidenceError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "NarrationCandidateEvidenceError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SCORE_KEYS = [
  "naturalness",
  "emotionalTruth",
  "cadence",
  "roleFidelity",
  "identityStability",
  "sustainedListenability",
] as const satisfies readonly (keyof ExpressivePerformanceScores)[];

function id(value: string, code: string): string {
  if (!ID.test(value)) throw new NarrationCandidateEvidenceError(code);
  return value;
}
function hash(value: string, code: string): string {
  if (!HASH.test(value)) throw new NarrationCandidateEvidenceError(code);
  return value;
}
function integer(value: number, min: number, max: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new NarrationCandidateEvidenceError(code);
  }
  return value;
}
function scores(value: ExpressivePerformanceScores): ExpressivePerformanceScores {
  for (const key of SCORE_KEYS) {
    if (!Number.isFinite(value[key]) || value[key] < 1 || value[key] > 5) {
      throw new NarrationCandidateEvidenceError("NARRATION_SELECTION_SCORE_INVALID");
    }
  }
  return Object.freeze({ ...value });
}
function reviewers(values: readonly string[]): readonly string[] {
  if (!Array.isArray(values) || values.length < NARRATION_SELECTION_MINIMUM_REVIEWERS) {
    throw new NarrationCandidateEvidenceError("NARRATION_SELECTION_REVIEWER_COUNT_INVALID");
  }
  const output = values.map((value) => id(value, "NARRATION_SELECTION_REVIEWER_ID_INVALID"));
  if (new Set(output).size !== output.length) {
    throw new NarrationCandidateEvidenceError("NARRATION_SELECTION_REVIEWER_DUPLICATE");
  }
  return Object.freeze([...output].sort((a, b) => a.localeCompare(b, "en-AU")));
}
function base(value: Omit<NarrationCandidateEvidence, "fingerprint">) {
  return { ...value, scores: { ...value.scores }, reviewerIds: [...value.reviewerIds] };
}
function rightsAvailable(record: ArtifactRecord, at: Date): void {
  if (!record.rights.allowedUses.includes("audiobook")) {
    throw new NarrationCandidateEvidenceError("NARRATION_SELECTION_AUDIOBOOK_RIGHTS_REQUIRED");
  }
  if (!record.rights.commercialUseApproved) {
    throw new NarrationCandidateEvidenceError("NARRATION_SELECTION_COMMERCIAL_RIGHTS_REQUIRED");
  }
  if (record.rights.expiresAt && Date.parse(record.rights.expiresAt) <= at.getTime()) {
    throw new NarrationCandidateEvidenceError("NARRATION_SELECTION_RIGHTS_EXPIRED");
  }
  if (record.rights.deletionRequiredAt && Date.parse(record.rights.deletionRequiredAt) <= at.getTime()) {
    throw new NarrationCandidateEvidenceError("NARRATION_SELECTION_RETENTION_EXPIRED");
  }
}

export function createNarrationCandidateEvidence(input: Readonly<Omit<
  NarrationCandidateEvidence,
  "schemaVersion" | "blindComparativeReview" | "technicalEligible"
  | "expressivePerformanceApproved" | "titleReleaseAuthority"
  | "publicationAuthority" | "fingerprint"
>>): NarrationCandidateEvidence {
  integer(input.candidateIndex, 0, Number.MAX_SAFE_INTEGER, "NARRATION_SELECTION_CANDIDATE_INDEX_INVALID");
  for (const [value, code] of [
    [input.projectId, "NARRATION_SELECTION_PROJECT_ID_INVALID"],
    [input.segmentId, "NARRATION_SELECTION_SEGMENT_ID_INVALID"],
    [input.takeId, "NARRATION_SELECTION_TAKE_ID_INVALID"],
    [input.audioArtifactId, "NARRATION_SELECTION_ARTIFACT_ID_INVALID"],
    [input.providerId, "NARRATION_SELECTION_PROVIDER_ID_INVALID"],
    [input.createdByActorId, "NARRATION_SELECTION_CREATED_BY_INVALID"],
    [input.verifiedByActorId, "NARRATION_SELECTION_VERIFIED_BY_INVALID"],
  ] as const) id(value, code);
  for (const [value, code] of [
    [input.audioArtifactFingerprint, "NARRATION_SELECTION_ARTIFACT_FINGERPRINT_INVALID"],
    [input.audioContentHash, "NARRATION_SELECTION_AUDIO_CONTENT_HASH_INVALID"],
    [input.sourceContentHash, "NARRATION_SELECTION_SOURCE_HASH_INVALID"],
    [input.generationRequestHash, "NARRATION_SELECTION_REQUEST_HASH_INVALID"],
    [input.engineeringEvidenceFingerprint, "NARRATION_SELECTION_ENGINEERING_HASH_INVALID"],
    [input.expressiveRoleBindingFingerprint, "NARRATION_SELECTION_ROLE_HASH_INVALID"],
    [input.expressivePerformancePlanFingerprint, "NARRATION_SELECTION_PLAN_HASH_INVALID"],
    [input.expressiveObservationFingerprint, "NARRATION_SELECTION_OBSERVATION_HASH_INVALID"],
    [input.expressiveReviewFingerprint, "NARRATION_SELECTION_REVIEW_HASH_INVALID"],
    [input.rightsFingerprint, "NARRATION_SELECTION_RIGHTS_HASH_INVALID"],
  ] as const) hash(value, code);
  integer(input.audioByteCount, 1, Number.MAX_SAFE_INTEGER, "NARRATION_SELECTION_AUDIO_BYTE_COUNT_INVALID");
  integer(input.durationMs, 1, Number.MAX_SAFE_INTEGER, "NARRATION_SELECTION_DURATION_INVALID");
  const partial: Omit<NarrationCandidateEvidence, "fingerprint"> = {
    schemaVersion: NARRATION_CANDIDATE_EVIDENCE_SCHEMA,
    ...input,
    scores: scores(input.scores),
    reviewerIds: reviewers(input.reviewerIds),
    blindComparativeReview: true,
    technicalEligible: true,
    expressivePerformanceApproved: true,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  return Object.freeze({ ...partial, fingerprint: stableHash(base(partial)) });
}

export function assertNarrationCandidateEvidence(value: NarrationCandidateEvidence): void {
  if (value.schemaVersion !== NARRATION_CANDIDATE_EVIDENCE_SCHEMA) {
    throw new NarrationCandidateEvidenceError("NARRATION_SELECTION_EVIDENCE_SCHEMA_UNSUPPORTED");
  }
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || stableHash(base(partial)) !== fingerprint) {
    throw new NarrationCandidateEvidenceError("NARRATION_SELECTION_EVIDENCE_FINGERPRINT_INVALID");
  }
  const {
    schemaVersion: _schema, blindComparativeReview: _blind,
    technicalEligible: _technical, expressivePerformanceApproved: _expressive,
    titleReleaseAuthority: _title, publicationAuthority: _publication,
    ...input
  } = partial;
  if (createNarrationCandidateEvidence(input).fingerprint !== fingerprint) {
    throw new NarrationCandidateEvidenceError("NARRATION_SELECTION_EVIDENCE_CONTRACT_MISMATCH");
  }
}

export function createNarrationCandidateEvidenceFromContracts(input: Readonly<{
  candidateIndex: number;
  audioCandidate: ArtifactRecord;
  engineeringEvidence: AudioEngineeringEvidence;
  role: ExpressiveVoiceRoleBinding;
  plan: ExpressivePerformancePlan;
  observation: ExpressivePerformanceObservation;
  review: ExpressivePerformanceReview;
  reviewedAudioContentHash: string;
}>): NarrationCandidateEvidence {
  assertArtifactRecord(input.audioCandidate);
  assertAudioEngineeringEvidence(input.engineeringEvidence);
  assertExpressiveVoiceRoleBinding(input.role);
  assertExpressivePerformancePlan(input.plan, input.role);
  assertExpressivePerformanceReview(input.review, {
    plan: input.plan, role: input.role, observation: input.observation,
  });
  const audio = input.audioCandidate;
  if (audio.kind !== "audio-candidate") {
    throw new NarrationCandidateEvidenceError("NARRATION_SELECTION_AUDIO_CANDIDATE_REQUIRED");
  }
  if (audio.verification.status !== "verified" || audio.verification.findings.some((f) => f.severity === "error") || audio.quarantine) {
    throw new NarrationCandidateEvidenceError("NARRATION_SELECTION_AUDIO_VERIFICATION_REQUIRED");
  }
  if (!audio.segmentId || !audio.takeId || !audio.provenance.sourceContentHash
    || !audio.provenance.generationRequestHash || !audio.provenance.providerId
    || !audio.verification.checkedByActorId) {
    throw new NarrationCandidateEvidenceError("NARRATION_SELECTION_AUDIO_PROVENANCE_REQUIRED");
  }
  if (input.reviewedAudioContentHash !== audio.integrity.contentHash) {
    throw new NarrationCandidateEvidenceError("NARRATION_SELECTION_REVIEWED_AUDIO_HASH_MISMATCH");
  }
  if (input.engineeringEvidence.inputContentHash !== audio.integrity.contentHash
    || input.engineeringEvidence.inputByteCount !== audio.integrity.byteCount
    || !input.engineeringEvidence.eligible
    || input.engineeringEvidence.findings.some((f) => f.severity === "error")) {
    throw new NarrationCandidateEvidenceError("NARRATION_SELECTION_ENGINEERING_INELIGIBLE");
  }
  if (input.plan.projectId !== audio.projectId || input.plan.segmentId !== audio.segmentId
    || input.role.projectId !== audio.projectId || input.observation.projectId !== audio.projectId
    || input.observation.segmentId !== audio.segmentId || input.review.projectId !== audio.projectId
    || input.review.segmentId !== audio.segmentId) {
    throw new NarrationCandidateEvidenceError("NARRATION_SELECTION_EXPRESSIVE_SCOPE_MISMATCH");
  }
  if (input.observation.roleBindingFingerprint !== input.role.fingerprint
    || input.observation.performancePlanFingerprint !== input.plan.fingerprint
    || input.review.roleBindingFingerprint !== input.role.fingerprint
    || input.review.performancePlanFingerprint !== input.plan.fingerprint
    || input.review.observationFingerprint !== input.observation.fingerprint) {
    throw new NarrationCandidateEvidenceError("NARRATION_SELECTION_EXPRESSIVE_BINDING_MISMATCH");
  }
  if (!input.review.expressivePerformanceApproved
    || input.review.status !== "approved-for-chapter-monitoring"
    || input.review.titleReleaseAuthority !== false || input.review.publicationAuthority !== false
    || input.observation.blindComparativeReview !== true
    || input.observation.reviewerIds.length < NARRATION_SELECTION_MINIMUM_REVIEWERS) {
    throw new NarrationCandidateEvidenceError("NARRATION_SELECTION_EXPRESSIVE_REVIEW_REQUIRED");
  }
  if (input.observation.providerId !== audio.provenance.providerId) {
    throw new NarrationCandidateEvidenceError("NARRATION_SELECTION_PROVIDER_MISMATCH");
  }
  rightsAvailable(audio, new Date(input.review.reviewedAt));
  return createNarrationCandidateEvidence({
    candidateIndex: input.candidateIndex,
    projectId: audio.projectId,
    segmentId: audio.segmentId,
    takeId: audio.takeId,
    audioArtifactId: audio.id,
    audioArtifactFingerprint: audio.fingerprint,
    audioContentHash: audio.integrity.contentHash,
    audioByteCount: audio.integrity.byteCount,
    sourceContentHash: audio.provenance.sourceContentHash,
    generationRequestHash: audio.provenance.generationRequestHash,
    engineeringEvidenceFingerprint: input.engineeringEvidence.fingerprint,
    expressiveRoleBindingFingerprint: input.role.fingerprint,
    expressivePerformancePlanFingerprint: input.plan.fingerprint,
    expressiveObservationFingerprint: input.observation.fingerprint,
    expressiveReviewFingerprint: input.review.fingerprint,
    providerId: audio.provenance.providerId,
    rightsFingerprint: audio.rights.rightsFingerprint,
    createdByActorId: audio.provenance.createdByActorId,
    verifiedByActorId: audio.verification.checkedByActorId,
    durationMs: Math.round(input.engineeringEvidence.probe.durationSeconds * 1_000),
    scores: input.observation.scores,
    reviewerIds: input.observation.reviewerIds,
  });
}
