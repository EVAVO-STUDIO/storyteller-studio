import {
  stableHash,
  type ManuscriptSegment,
  type PerformanceDirection,
  type PerformancePlan,
  type SegmentedManuscript,
} from "./index.js";

export const CALIBRATION_SCHEMA_VERSION = "storyteller-calibration-session-v1" as const;

export type CalibrationPassageCategory =
  | "quiet-intimacy"
  | "dialogue-distinction"
  | "long-syntax"
  | "dramatic-pressure"
  | "exposition-clarity"
  | "chapter-ending"
  | "pronunciation-load"
  | "humour-timing"
  | "manual-critical";

export type CalibrationDimension =
  | "listenerRelationship"
  | "textualTruth"
  | "clarity"
  | "rhythm"
  | "emotionalTruth"
  | "restraint"
  | "sustainedListenability"
  | "differentiation"
  | "pronunciation";

export type CalibrationStatus =
  | "draft"
  | "collecting"
  | "review"
  | "approved"
  | "rejected";

export interface CalibrationFinding {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  passageId?: string;
  candidateId?: string;
  dimension?: CalibrationDimension;
}

export interface CalibrationPassage {
  id: string;
  segmentId: string;
  sourceHash: string;
  textHash: string;
  chapterId: string;
  category: CalibrationPassageCategory;
  required: boolean;
  wordCount: number;
  estimatedSeconds: number;
  rationaleCodes: readonly string[];
  fingerprint: string;
}

export interface CalibrationPassageProposal {
  passages: readonly CalibrationPassage[];
  recommendedRequiredCategories: readonly CalibrationPassageCategory[];
  findings: readonly CalibrationFinding[];
  fingerprint: string;
}

export interface CalibrationPolicy {
  requiredCategories: readonly CalibrationPassageCategory[];
  minimumPassageCount: number;
  minimumDistinctReviewers: number;
  minimumMeanScore: number;
  minimumDimensionScore: number;
  minimumContinuityScore: number;
  requireBlindReview: boolean;
  requireApprovedDecision: boolean;
  fingerprint: string;
}

export interface CalibrationCandidate {
  id: string;
  passageId: string;
  takeArtifactId: string;
  transcriptAssessmentArtifactId: string;
  technicalAssessmentArtifactId: string;
  voiceProfileId: string;
  voiceRevision: number;
  providerId: string;
  modelId: string;
  capabilityFingerprint: string;
  generationRequestHash: string;
  continuityScore: number;
  eligible: boolean;
  findingCodes: readonly string[];
  createdAt: string;
  fingerprint: string;
}

export interface CalibrationScores {
  listenerRelationship: number;
  textualTruth: number;
  clarity: number;
  rhythm: number;
  emotionalTruth: number;
  restraint: number;
  sustainedListenability: number;
  differentiation: number;
  pronunciation: number;
}

export interface CalibrationReview {
  id: string;
  candidateId: string;
  reviewerId: string;
  blind: boolean;
  decision: "approve" | "revise" | "reject";
  scores: CalibrationScores;
  notes?: string;
  createdAt: string;
  fingerprint: string;
}

export interface CalibrationSelection {
  passageId: string;
  candidateId: string;
  selectedBy: string;
  selectedAt: string;
  fingerprint: string;
}

export interface CalibrationApproval {
  id: string;
  approvedBy: string;
  approvedAt: string;
  assessmentFingerprint: string;
  selectedCandidateIds: readonly string[];
  selectedTakeArtifactIds: readonly string[];
  providerId: string;
  modelId: string;
  capabilityFingerprint: string;
  fingerprint: string;
}

export interface CalibrationSession {
  schemaVersion: typeof CALIBRATION_SCHEMA_VERSION;
  id: string;
  projectId: string;
  seriesId?: string;
  voiceProfileId: string;
  voiceRevision: number;
  status: CalibrationStatus;
  policy: CalibrationPolicy;
  passages: readonly CalibrationPassage[];
  candidates: readonly CalibrationCandidate[];
  reviews: readonly CalibrationReview[];
  selections: readonly CalibrationSelection[];
  approval?: CalibrationApproval;
  rejectionCodes?: readonly string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  previousFingerprint?: string;
  fingerprint: string;
}

export interface CalibrationAssessment {
  eligible: boolean;
  requiredCategoryCoverage: Readonly<Record<string, boolean>>;
  selectedPassageCount: number;
  selectedCandidateCount: number;
  distinctReviewerCount: number;
  dimensionAverages: Readonly<Record<CalibrationDimension, number>>;
  overallMeanScore: number;
  findings: readonly CalibrationFinding[];
  fingerprint: string;
}

export interface CalibrationSessionPublicView {
  id: string;
  projectId: string;
  seriesScoped: boolean;
  voiceRevision: number;
  status: CalibrationStatus;
  passageCount: number;
  requiredPassageCount: number;
  candidateCount: number;
  reviewCount: number;
  selectionCount: number;
  distinctReviewerCount: number;
  requiredCategoryCoverage: Readonly<Record<string, boolean>>;
  dimensionAverages: Readonly<Record<CalibrationDimension, number>>;
  overallMeanScore: number;
  eligibleForApproval: boolean;
  findingCodes: readonly string[];
  approvedAt?: string;
  revision: number;
  fingerprint: string;
}

export class CalibrationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationConflictError";
  }
}

export class CalibrationIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationIntegrityError";
  }
}

export class CalibrationApprovalError extends Error {
  readonly findingCodes: readonly string[];

  constructor(findings: readonly CalibrationFinding[]) {
    const codes = findings
      .filter((finding) => finding.severity === "error")
      .map((finding) => finding.code);
    super(`CALIBRATION_APPROVAL_BLOCKED:${codes.join(",") || "UNKNOWN"}`);
    this.name = "CalibrationApprovalError";
    this.findingCodes = Object.freeze(codes);
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;
const SCORE_DIMENSIONS: readonly CalibrationDimension[] = Object.freeze([
  "listenerRelationship",
  "textualTruth",
  "clarity",
  "rhythm",
  "emotionalTruth",
  "restraint",
  "sustainedListenability",
  "differentiation",
  "pronunciation",
]);
const PASSAGE_CATEGORIES: ReadonlySet<CalibrationPassageCategory> = new Set([
  "quiet-intimacy",
  "dialogue-distinction",
  "long-syntax",
  "dramatic-pressure",
  "exposition-clarity",
  "chapter-ending",
  "pronunciation-load",
  "humour-timing",
  "manual-critical",
]);
const MAX_PASSAGES = 64;
const MAX_CANDIDATES = 512;
const MAX_REVIEWS = 4_096;
const MAX_NOTES = 4_000;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new CalibrationIntegrityError(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new CalibrationIntegrityError(code);
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) throw new CalibrationIntegrityError(code);
  return value;
}

function requireInteger(value: number, minimum: number, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new CalibrationIntegrityError(code);
  }
  return value;
}

function requireFinite(value: number, minimum: number, maximum: number, code: string): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new CalibrationIntegrityError(code);
  }
  return value;
}

function requireCode(value: string, code: string): string {
  if (!SAFE_CODE.test(value)) throw new CalibrationIntegrityError(code);
  return value;
}

function uniqueValues<T extends string>(values: readonly T[], code: string): readonly T[] {
  if (!Array.isArray(values)) throw new CalibrationIntegrityError(code);
  const output = new Set<T>();
  for (const value of values) {
    if (output.has(value)) throw new CalibrationIntegrityError(`${code}_DUPLICATE`);
    output.add(value);
  }
  return Object.freeze([...output]);
}

function roundScore(value: number): number {
  return Number(value.toFixed(3));
}

function passageBase(passage: Omit<CalibrationPassage, "fingerprint">): Record<string, unknown> {
  return {
    ...passage,
    rationaleCodes: [...passage.rationaleCodes],
  };
}

function candidateBase(candidate: Omit<CalibrationCandidate, "fingerprint">): Record<string, unknown> {
  return {
    ...candidate,
    findingCodes: [...candidate.findingCodes],
  };
}

function reviewBase(review: Omit<CalibrationReview, "fingerprint">): Record<string, unknown> {
  return { ...review, scores: { ...review.scores } };
}

function selectionBase(selection: Omit<CalibrationSelection, "fingerprint">): Record<string, unknown> {
  return { ...selection };
}

function approvalBase(approval: Omit<CalibrationApproval, "fingerprint">): Record<string, unknown> {
  return {
    ...approval,
    selectedCandidateIds: [...approval.selectedCandidateIds],
    selectedTakeArtifactIds: [...approval.selectedTakeArtifactIds],
  };
}

function policyBase(policy: Omit<CalibrationPolicy, "fingerprint">): Record<string, unknown> {
  return { ...policy, requiredCategories: [...policy.requiredCategories] };
}

function sessionBase(session: Omit<CalibrationSession, "fingerprint">): Record<string, unknown> {
  return {
    ...session,
    policy: session.policy,
    passages: [...session.passages],
    candidates: [...session.candidates],
    reviews: [...session.reviews],
    selections: [...session.selections],
    approval: session.approval ?? null,
    rejectionCodes: session.rejectionCodes ? [...session.rejectionCodes] : null,
  };
}

function assertScoreSet(scores: CalibrationScores): void {
  for (const dimension of SCORE_DIMENSIONS) {
    requireFinite(scores[dimension], 1, 5, `CALIBRATION_SCORE_${dimension.toUpperCase()}_INVALID`);
  }
}

function assertPolicy(policy: CalibrationPolicy): void {
  const categories = uniqueValues(policy.requiredCategories, "CALIBRATION_POLICY_CATEGORIES_INVALID");
  if (categories.length === 0 || categories.some((category) => !PASSAGE_CATEGORIES.has(category))) {
    throw new CalibrationIntegrityError("CALIBRATION_POLICY_CATEGORIES_INVALID");
  }
  requireInteger(policy.minimumPassageCount, 1, MAX_PASSAGES, "CALIBRATION_POLICY_PASSAGE_COUNT_INVALID");
  requireInteger(policy.minimumDistinctReviewers, 1, 10, "CALIBRATION_POLICY_REVIEWER_COUNT_INVALID");
  requireFinite(policy.minimumMeanScore, 1, 5, "CALIBRATION_POLICY_MEAN_SCORE_INVALID");
  requireFinite(policy.minimumDimensionScore, 1, 5, "CALIBRATION_POLICY_DIMENSION_SCORE_INVALID");
  requireFinite(policy.minimumContinuityScore, 0, 1, "CALIBRATION_POLICY_CONTINUITY_INVALID");
  if (policy.minimumDimensionScore > policy.minimumMeanScore) {
    throw new CalibrationIntegrityError("CALIBRATION_POLICY_SCORE_ORDER_INVALID");
  }
  if (policy.fingerprint !== stableHash(policyBase({
    requiredCategories: categories,
    minimumPassageCount: policy.minimumPassageCount,
    minimumDistinctReviewers: policy.minimumDistinctReviewers,
    minimumMeanScore: policy.minimumMeanScore,
    minimumDimensionScore: policy.minimumDimensionScore,
    minimumContinuityScore: policy.minimumContinuityScore,
    requireBlindReview: policy.requireBlindReview,
    requireApprovedDecision: policy.requireApprovedDecision,
  }))) {
    throw new CalibrationIntegrityError("CALIBRATION_POLICY_FINGERPRINT_INVALID");
  }
}

function assertPassage(passage: CalibrationPassage): void {
  requireIdentifier(passage.id, "CALIBRATION_PASSAGE_ID_INVALID");
  requireIdentifier(passage.segmentId, "CALIBRATION_SEGMENT_ID_INVALID");
  requireIdentifier(passage.chapterId, "CALIBRATION_CHAPTER_ID_INVALID");
  requireHash(passage.sourceHash, "CALIBRATION_SOURCE_HASH_INVALID");
  requireHash(passage.textHash, "CALIBRATION_TEXT_HASH_INVALID");
  if (!PASSAGE_CATEGORIES.has(passage.category)) {
    throw new CalibrationIntegrityError("CALIBRATION_PASSAGE_CATEGORY_INVALID");
  }
  requireInteger(passage.wordCount, 1, 100_000, "CALIBRATION_PASSAGE_WORD_COUNT_INVALID");
  requireFinite(passage.estimatedSeconds, 0.1, 24 * 60 * 60, "CALIBRATION_PASSAGE_DURATION_INVALID");
  const rationaleCodes = uniqueValues(passage.rationaleCodes, "CALIBRATION_PASSAGE_RATIONALE_INVALID");
  for (const code of rationaleCodes) requireCode(code, "CALIBRATION_PASSAGE_RATIONALE_INVALID");
  if (passage.fingerprint !== stableHash(passageBase({
    id: passage.id,
    segmentId: passage.segmentId,
    sourceHash: passage.sourceHash,
    textHash: passage.textHash,
    chapterId: passage.chapterId,
    category: passage.category,
    required: passage.required,
    wordCount: passage.wordCount,
    estimatedSeconds: passage.estimatedSeconds,
    rationaleCodes,
  }))) {
    throw new CalibrationIntegrityError("CALIBRATION_PASSAGE_FINGERPRINT_INVALID");
  }
}

function assertCandidate(candidate: CalibrationCandidate): void {
  requireIdentifier(candidate.id, "CALIBRATION_CANDIDATE_ID_INVALID");
  requireIdentifier(candidate.passageId, "CALIBRATION_CANDIDATE_PASSAGE_INVALID");
  requireIdentifier(candidate.takeArtifactId, "CALIBRATION_TAKE_ARTIFACT_INVALID");
  requireIdentifier(candidate.transcriptAssessmentArtifactId, "CALIBRATION_TRANSCRIPT_ARTIFACT_INVALID");
  requireIdentifier(candidate.technicalAssessmentArtifactId, "CALIBRATION_TECHNICAL_ARTIFACT_INVALID");
  requireIdentifier(candidate.voiceProfileId, "CALIBRATION_CANDIDATE_VOICE_INVALID");
  requireIdentifier(candidate.providerId, "CALIBRATION_CANDIDATE_PROVIDER_INVALID");
  requireIdentifier(candidate.modelId, "CALIBRATION_CANDIDATE_MODEL_INVALID");
  requireInteger(candidate.voiceRevision, 1, 1_000_000, "CALIBRATION_CANDIDATE_VOICE_REVISION_INVALID");
  requireHash(candidate.capabilityFingerprint, "CALIBRATION_CAPABILITY_FINGERPRINT_INVALID");
  requireHash(candidate.generationRequestHash, "CALIBRATION_REQUEST_HASH_INVALID");
  requireFinite(candidate.continuityScore, 0, 1, "CALIBRATION_CONTINUITY_SCORE_INVALID");
  requireDate(candidate.createdAt, "CALIBRATION_CANDIDATE_CREATED_AT_INVALID");
  const findingCodes = uniqueValues(candidate.findingCodes, "CALIBRATION_CANDIDATE_FINDINGS_INVALID");
  for (const code of findingCodes) requireCode(code, "CALIBRATION_CANDIDATE_FINDING_INVALID");
  if (candidate.fingerprint !== stableHash(candidateBase({
    id: candidate.id,
    passageId: candidate.passageId,
    takeArtifactId: candidate.takeArtifactId,
    transcriptAssessmentArtifactId: candidate.transcriptAssessmentArtifactId,
    technicalAssessmentArtifactId: candidate.technicalAssessmentArtifactId,
    voiceProfileId: candidate.voiceProfileId,
    voiceRevision: candidate.voiceRevision,
    providerId: candidate.providerId,
    modelId: candidate.modelId,
    capabilityFingerprint: candidate.capabilityFingerprint,
    generationRequestHash: candidate.generationRequestHash,
    continuityScore: candidate.continuityScore,
    eligible: candidate.eligible,
    findingCodes,
    createdAt: candidate.createdAt,
  }))) {
    throw new CalibrationIntegrityError("CALIBRATION_CANDIDATE_FINGERPRINT_INVALID");
  }
}

function assertReview(review: CalibrationReview): void {
  requireIdentifier(review.id, "CALIBRATION_REVIEW_ID_INVALID");
  requireIdentifier(review.candidateId, "CALIBRATION_REVIEW_CANDIDATE_INVALID");
  requireIdentifier(review.reviewerId, "CALIBRATION_REVIEWER_ID_INVALID");
  requireDate(review.createdAt, "CALIBRATION_REVIEW_CREATED_AT_INVALID");
  assertScoreSet(review.scores);
  if (review.decision !== "approve" && review.decision !== "revise" && review.decision !== "reject") {
    throw new CalibrationIntegrityError("CALIBRATION_REVIEW_DECISION_INVALID");
  }
  if (review.notes !== undefined && (review.notes.length > MAX_NOTES || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(review.notes))) {
    throw new CalibrationIntegrityError("CALIBRATION_REVIEW_NOTES_INVALID");
  }
  if (review.fingerprint !== stableHash(reviewBase({
    id: review.id,
    candidateId: review.candidateId,
    reviewerId: review.reviewerId,
    blind: review.blind,
    decision: review.decision,
    scores: review.scores,
    ...(review.notes !== undefined ? { notes: review.notes } : {}),
    createdAt: review.createdAt,
  }))) {
    throw new CalibrationIntegrityError("CALIBRATION_REVIEW_FINGERPRINT_INVALID");
  }
}

function assertSelection(selection: CalibrationSelection): void {
  requireIdentifier(selection.passageId, "CALIBRATION_SELECTION_PASSAGE_INVALID");
  requireIdentifier(selection.candidateId, "CALIBRATION_SELECTION_CANDIDATE_INVALID");
  requireIdentifier(selection.selectedBy, "CALIBRATION_SELECTOR_ID_INVALID");
  requireDate(selection.selectedAt, "CALIBRATION_SELECTION_DATE_INVALID");
  if (selection.fingerprint !== stableHash(selectionBase({
    passageId: selection.passageId,
    candidateId: selection.candidateId,
    selectedBy: selection.selectedBy,
    selectedAt: selection.selectedAt,
  }))) {
    throw new CalibrationIntegrityError("CALIBRATION_SELECTION_FINGERPRINT_INVALID");
  }
}

function assertApproval(approval: CalibrationApproval): void {
  requireIdentifier(approval.id, "CALIBRATION_APPROVAL_ID_INVALID");
  requireIdentifier(approval.approvedBy, "CALIBRATION_APPROVER_ID_INVALID");
  requireDate(approval.approvedAt, "CALIBRATION_APPROVED_AT_INVALID");
  requireHash(approval.assessmentFingerprint, "CALIBRATION_ASSESSMENT_FINGERPRINT_INVALID");
  requireIdentifier(approval.providerId, "CALIBRATION_APPROVAL_PROVIDER_INVALID");
  requireIdentifier(approval.modelId, "CALIBRATION_APPROVAL_MODEL_INVALID");
  requireHash(approval.capabilityFingerprint, "CALIBRATION_APPROVAL_CAPABILITY_INVALID");
  const candidateIds = uniqueValues(approval.selectedCandidateIds, "CALIBRATION_APPROVAL_CANDIDATES_INVALID");
  const takeIds = uniqueValues(approval.selectedTakeArtifactIds, "CALIBRATION_APPROVAL_TAKES_INVALID");
  if (candidateIds.length === 0 || candidateIds.length !== takeIds.length) {
    throw new CalibrationIntegrityError("CALIBRATION_APPROVAL_SELECTIONS_INVALID");
  }
  for (const id of [...candidateIds, ...takeIds]) requireIdentifier(id, "CALIBRATION_APPROVAL_REFERENCE_INVALID");
  if (approval.fingerprint !== stableHash(approvalBase({
    id: approval.id,
    approvedBy: approval.approvedBy,
    approvedAt: approval.approvedAt,
    assessmentFingerprint: approval.assessmentFingerprint,
    selectedCandidateIds: candidateIds,
    selectedTakeArtifactIds: takeIds,
    providerId: approval.providerId,
    modelId: approval.modelId,
    capabilityFingerprint: approval.capabilityFingerprint,
  }))) {
    throw new CalibrationIntegrityError("CALIBRATION_APPROVAL_FINGERPRINT_INVALID");
  }
}

export function assertCalibrationSession(session: CalibrationSession): void {
  if (session.schemaVersion !== CALIBRATION_SCHEMA_VERSION) {
    throw new CalibrationIntegrityError("CALIBRATION_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(session.id, "CALIBRATION_SESSION_ID_INVALID");
  requireIdentifier(session.projectId, "CALIBRATION_PROJECT_ID_INVALID");
  if (session.seriesId !== undefined) requireIdentifier(session.seriesId, "CALIBRATION_SERIES_ID_INVALID");
  requireIdentifier(session.voiceProfileId, "CALIBRATION_VOICE_PROFILE_INVALID");
  requireInteger(session.voiceRevision, 1, 1_000_000, "CALIBRATION_VOICE_REVISION_INVALID");
  requireInteger(session.revision, 1, 1_000_000, "CALIBRATION_REVISION_INVALID");
  requireDate(session.createdAt, "CALIBRATION_CREATED_AT_INVALID");
  requireDate(session.updatedAt, "CALIBRATION_UPDATED_AT_INVALID");
  if (Date.parse(session.updatedAt) < Date.parse(session.createdAt)) {
    throw new CalibrationIntegrityError("CALIBRATION_TIMESTAMP_ORDER_INVALID");
  }
  if (session.previousFingerprint !== undefined) requireHash(session.previousFingerprint, "CALIBRATION_PREVIOUS_FINGERPRINT_INVALID");
  if (session.revision === 1 && session.previousFingerprint !== undefined) {
    throw new CalibrationIntegrityError("CALIBRATION_INITIAL_CHAIN_INVALID");
  }
  if (session.revision > 1 && session.previousFingerprint === undefined) {
    throw new CalibrationIntegrityError("CALIBRATION_REVISION_CHAIN_REQUIRED");
  }
  assertPolicy(session.policy);
  if (!Array.isArray(session.passages) || session.passages.length === 0 || session.passages.length > MAX_PASSAGES) {
    throw new CalibrationIntegrityError("CALIBRATION_PASSAGES_INVALID");
  }
  if (!Array.isArray(session.candidates) || session.candidates.length > MAX_CANDIDATES) {
    throw new CalibrationIntegrityError("CALIBRATION_CANDIDATES_INVALID");
  }
  if (!Array.isArray(session.reviews) || session.reviews.length > MAX_REVIEWS) {
    throw new CalibrationIntegrityError("CALIBRATION_REVIEWS_INVALID");
  }
  const passageIds = new Set<string>();
  const passageSegments = new Set<string>();
  for (const passage of session.passages) {
    assertPassage(passage);
    if (passageIds.has(passage.id)) throw new CalibrationIntegrityError("CALIBRATION_PASSAGE_ID_DUPLICATE");
    if (passageSegments.has(passage.segmentId)) throw new CalibrationIntegrityError("CALIBRATION_PASSAGE_SEGMENT_DUPLICATE");
    passageIds.add(passage.id);
    passageSegments.add(passage.segmentId);
  }
  const candidateIds = new Set<string>();
  const takeIds = new Set<string>();
  for (const candidate of session.candidates) {
    assertCandidate(candidate);
    if (!passageIds.has(candidate.passageId)) throw new CalibrationIntegrityError("CALIBRATION_CANDIDATE_PASSAGE_UNKNOWN");
    if (candidate.voiceProfileId !== session.voiceProfileId || candidate.voiceRevision !== session.voiceRevision) {
      throw new CalibrationIntegrityError("CALIBRATION_CANDIDATE_VOICE_SCOPE_MISMATCH");
    }
    if (candidateIds.has(candidate.id)) throw new CalibrationIntegrityError("CALIBRATION_CANDIDATE_ID_DUPLICATE");
    if (takeIds.has(candidate.takeArtifactId)) throw new CalibrationIntegrityError("CALIBRATION_CANDIDATE_TAKE_DUPLICATE");
    candidateIds.add(candidate.id);
    takeIds.add(candidate.takeArtifactId);
  }
  const reviewIds = new Set<string>();
  const reviewerCandidateKeys = new Set<string>();
  for (const review of session.reviews) {
    assertReview(review);
    if (!candidateIds.has(review.candidateId)) throw new CalibrationIntegrityError("CALIBRATION_REVIEW_CANDIDATE_UNKNOWN");
    if (reviewIds.has(review.id)) throw new CalibrationIntegrityError("CALIBRATION_REVIEW_ID_DUPLICATE");
    const key = `${review.reviewerId}:${review.candidateId}`;
    if (reviewerCandidateKeys.has(key)) throw new CalibrationIntegrityError("CALIBRATION_REVIEW_DUPLICATE");
    reviewIds.add(review.id);
    reviewerCandidateKeys.add(key);
  }
  const selectedPassages = new Set<string>();
  for (const selection of session.selections) {
    assertSelection(selection);
    if (!passageIds.has(selection.passageId)) throw new CalibrationIntegrityError("CALIBRATION_SELECTION_PASSAGE_UNKNOWN");
    const candidate = session.candidates.find((item) => item.id === selection.candidateId);
    if (!candidate || candidate.passageId !== selection.passageId) {
      throw new CalibrationIntegrityError("CALIBRATION_SELECTION_CANDIDATE_SCOPE_MISMATCH");
    }
    if (selectedPassages.has(selection.passageId)) throw new CalibrationIntegrityError("CALIBRATION_SELECTION_DUPLICATE");
    selectedPassages.add(selection.passageId);
  }
  if (session.status === "approved") {
    if (!session.approval) throw new CalibrationIntegrityError("CALIBRATION_APPROVAL_REQUIRED");
    assertApproval(session.approval);
  } else if (session.approval) {
    throw new CalibrationIntegrityError("CALIBRATION_APPROVAL_STATE_INVALID");
  }
  if (session.status === "rejected") {
    if (!session.rejectionCodes || session.rejectionCodes.length === 0) {
      throw new CalibrationIntegrityError("CALIBRATION_REJECTION_CODES_REQUIRED");
    }
    for (const code of uniqueValues(session.rejectionCodes, "CALIBRATION_REJECTION_CODES_INVALID")) {
      requireCode(code, "CALIBRATION_REJECTION_CODE_INVALID");
    }
  } else if (session.rejectionCodes) {
    throw new CalibrationIntegrityError("CALIBRATION_REJECTION_STATE_INVALID");
  }
  if (session.fingerprint !== stableHash(sessionBase({
    schemaVersion: session.schemaVersion,
    id: session.id,
    projectId: session.projectId,
    ...(session.seriesId ? { seriesId: session.seriesId } : {}),
    voiceProfileId: session.voiceProfileId,
    voiceRevision: session.voiceRevision,
    status: session.status,
    policy: session.policy,
    passages: session.passages,
    candidates: session.candidates,
    reviews: session.reviews,
    selections: session.selections,
    ...(session.approval ? { approval: session.approval } : {}),
    ...(session.rejectionCodes ? { rejectionCodes: session.rejectionCodes } : {}),
    revision: session.revision,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...(session.previousFingerprint ? { previousFingerprint: session.previousFingerprint } : {}),
  }))) {
    throw new CalibrationIntegrityError("CALIBRATION_SESSION_FINGERPRINT_INVALID");
  }
}

function directionMap(plan: PerformancePlan): Map<string, PerformanceDirection> {
  return new Map(plan.directions.map((direction) => [direction.segmentId, direction]));
}

function punctuationComplexity(text: string): number {
  return (text.match(/[,;:—–()]/gu)?.length ?? 0) * 4
    + (text.match(/[.!?]/gu)?.length ?? 0);
}

function capitalisedTokenCount(text: string): number {
  const tokens = text.match(/\b[\p{Lu}][\p{L}’'-]{2,}\b/gu) ?? [];
  return new Set(tokens.slice(1)).size;
}

function createPassage(
  segment: ManuscriptSegment,
  category: CalibrationPassageCategory,
  required: boolean,
  rationaleCodes: readonly string[],
): CalibrationPassage {
  const base = {
    id: `calpass_${stableHash({ segmentId: segment.id, category }).slice(0, 24)}`,
    segmentId: segment.id,
    sourceHash: segment.sourceHash,
    textHash: stableHash(segment.text),
    chapterId: segment.chapterId,
    category,
    required,
    wordCount: segment.wordCount,
    estimatedSeconds: segment.estimatedSpeechSeconds,
    rationaleCodes: Object.freeze([...rationaleCodes]),
  };
  return Object.freeze({ ...base, fingerprint: stableHash(passageBase(base)) });
}

export function proposeCalibrationPassages(
  manuscript: SegmentedManuscript,
  performance: PerformancePlan,
): CalibrationPassageProposal {
  if (manuscript.sourceHash !== performance.manuscriptHash) {
    throw new CalibrationIntegrityError("CALIBRATION_PROPOSAL_MANUSCRIPT_MISMATCH");
  }
  const directions = directionMap(performance);
  const substantive = manuscript.segments.filter((segment) =>
    segment.kind !== "heading" && segment.kind !== "scene-break" && segment.wordCount > 0
  );
  const used = new Set<string>();
  const passages: CalibrationPassage[] = [];
  const findings: CalibrationFinding[] = [];

  const choose = (
    category: CalibrationPassageCategory,
    required: boolean,
    candidates: readonly ManuscriptSegment[],
    score: (segment: ManuscriptSegment) => number,
    rationaleCodes: readonly string[],
  ): void => {
    const candidate = [...candidates]
      .filter((segment) => !used.has(segment.id))
      .sort((left, right) => score(right) - score(left) || left.ordinal - right.ordinal)[0];
    if (!candidate) {
      findings.push({
        code: `CALIBRATION_${category.toUpperCase().replaceAll("-", "_")}_UNAVAILABLE`,
        severity: required ? "warning" : "info",
        message: `No distinct manuscript segment was available for ${category}.`,
      });
      return;
    }
    used.add(candidate.id);
    passages.push(createPassage(candidate, category, required, rationaleCodes));
  };

  const dialogue = substantive.filter((segment) => segment.kind === "dialogue");
  const narration = substantive.filter((segment) => segment.kind === "narration");
  choose(
    "quiet-intimacy",
    true,
    narration.filter((segment) => segment.wordCount >= 12),
    (segment) => {
      const direction = directions.get(segment.id);
      return (direction?.restraint ?? 0) * 120 - (direction?.intensity ?? 0) * 80 + segment.wordCount;
    },
    ["CALIBRATION_QUIET_RESTRAINT", "CALIBRATION_LISTENER_RELATIONSHIP"],
  );
  if (dialogue.length > 0) {
    choose(
      "dialogue-distinction",
      true,
      dialogue,
      (segment) => segment.wordCount * 2 + punctuationComplexity(segment.text),
      ["CALIBRATION_DIALOGUE_INTENTION", "CALIBRATION_DIFFERENTIATION"],
    );
  }
  choose(
    "long-syntax",
    true,
    substantive,
    (segment) => segment.wordCount * 2 + punctuationComplexity(segment.text) * 3,
    ["CALIBRATION_LONG_SYNTAX", "CALIBRATION_BREATH_ARCHITECTURE"],
  );
  choose(
    "dramatic-pressure",
    true,
    substantive,
    (segment) => {
      const direction = directions.get(segment.id);
      return (direction?.intensity ?? 0) * 200 + punctuationComplexity(segment.text);
    },
    ["CALIBRATION_DRAMATIC_PRESSURE", "CALIBRATION_RESTRAINT_UNDER_LOAD"],
  );
  choose(
    "exposition-clarity",
    true,
    narration,
    (segment) => segment.wordCount * 2 + (directions.get(segment.id)?.clarity ?? 0) * 50,
    ["CALIBRATION_EXPOSITION", "CALIBRATION_CLARITY"],
  );
  const lastByChapter = new Map<string, ManuscriptSegment>();
  for (const segment of substantive) lastByChapter.set(segment.chapterId, segment);
  choose(
    "chapter-ending",
    true,
    [...lastByChapter.values()],
    (segment) => segment.wordCount + (directions.get(segment.id)?.restraint ?? 0) * 50,
    ["CALIBRATION_CHAPTER_ENDING", "CALIBRATION_FINAL_WORD"],
  );
  const pronunciationCandidates = substantive.filter((segment) => capitalisedTokenCount(segment.text) > 0);
  if (pronunciationCandidates.length > 0) {
    choose(
      "pronunciation-load",
      true,
      pronunciationCandidates,
      (segment) => capitalisedTokenCount(segment.text) * 100 + segment.wordCount,
      ["CALIBRATION_PRONUNCIATION_LOAD", "CALIBRATION_PROPER_NAMES"],
    );
  }

  const requiredCategories = Object.freeze(passages
    .filter((passage) => passage.required)
    .map((passage) => passage.category));
  if (passages.length < 5) {
    findings.push({
      code: "CALIBRATION_PASSAGE_DIVERSITY_INSUFFICIENT",
      severity: "error",
      message: "At least five distinct calibration passages are required; add manual critical passages.",
    });
  }
  const fingerprint = stableHash({
    schemaVersion: "storyteller-calibration-proposal-v1",
    manuscriptHash: manuscript.sourceHash,
    passages,
    requiredCategories,
    findings,
  });
  return Object.freeze({
    passages: Object.freeze(passages),
    recommendedRequiredCategories: requiredCategories,
    findings: Object.freeze(findings),
    fingerprint,
  });
}

export function createCalibrationPolicy(
  input: Partial<Omit<CalibrationPolicy, "fingerprint">> & Pick<CalibrationPolicy, "requiredCategories">,
): CalibrationPolicy {
  const base = {
    requiredCategories: uniqueValues(input.requiredCategories, "CALIBRATION_POLICY_CATEGORIES_INVALID"),
    minimumPassageCount: input.minimumPassageCount ?? 5,
    minimumDistinctReviewers: input.minimumDistinctReviewers ?? 2,
    minimumMeanScore: input.minimumMeanScore ?? 4,
    minimumDimensionScore: input.minimumDimensionScore ?? 3.5,
    minimumContinuityScore: input.minimumContinuityScore ?? 0.75,
    requireBlindReview: input.requireBlindReview ?? true,
    requireApprovedDecision: input.requireApprovedDecision ?? true,
  };
  const policy = Object.freeze({ ...base, fingerprint: stableHash(policyBase(base)) });
  assertPolicy(policy);
  return policy;
}

export function createCalibrationSession(input: Readonly<{
  id: string;
  projectId: string;
  seriesId?: string;
  voiceProfileId: string;
  voiceRevision: number;
  policy: CalibrationPolicy;
  passages: readonly CalibrationPassage[];
  now?: Date;
}>): CalibrationSession {
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new CalibrationIntegrityError("CALIBRATION_CREATED_AT_INVALID");
  const instant = now.toISOString();
  const base = {
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    id: input.id,
    projectId: input.projectId,
    ...(input.seriesId ? { seriesId: input.seriesId } : {}),
    voiceProfileId: input.voiceProfileId,
    voiceRevision: input.voiceRevision,
    status: "draft" as const,
    policy: input.policy,
    passages: Object.freeze([...input.passages]),
    candidates: Object.freeze([]) as readonly CalibrationCandidate[],
    reviews: Object.freeze([]) as readonly CalibrationReview[],
    selections: Object.freeze([]) as readonly CalibrationSelection[],
    revision: 1,
    createdAt: instant,
    updatedAt: instant,
  };
  const session = Object.freeze({ ...base, fingerprint: stableHash(sessionBase(base)) });
  assertCalibrationSession(session);
  return session;
}

function reviseSession(
  session: CalibrationSession,
  updates: Partial<Omit<CalibrationSession,
    | "schemaVersion"
    | "id"
    | "projectId"
    | "seriesId"
    | "voiceProfileId"
    | "voiceRevision"
    | "policy"
    | "passages"
    | "revision"
    | "createdAt"
    | "updatedAt"
    | "previousFingerprint"
    | "fingerprint"
  >>,
  now: Date,
): CalibrationSession {
  assertCalibrationSession(session);
  if (session.status === "approved" || session.status === "rejected") {
    throw new CalibrationConflictError("CALIBRATION_SESSION_TERMINAL");
  }
  if (Number.isNaN(now.getTime()) || now.getTime() < Date.parse(session.updatedAt)) {
    throw new CalibrationConflictError("CALIBRATION_TRANSITION_TIME_REVERSED");
  }
  const base = {
    schemaVersion: session.schemaVersion,
    id: session.id,
    projectId: session.projectId,
    ...(session.seriesId ? { seriesId: session.seriesId } : {}),
    voiceProfileId: session.voiceProfileId,
    voiceRevision: session.voiceRevision,
    status: updates.status ?? session.status,
    policy: session.policy,
    passages: session.passages,
    candidates: updates.candidates ?? session.candidates,
    reviews: updates.reviews ?? session.reviews,
    selections: updates.selections ?? session.selections,
    ...(updates.approval ? { approval: updates.approval } : {}),
    ...(updates.rejectionCodes ? { rejectionCodes: updates.rejectionCodes } : {}),
    revision: session.revision + 1,
    createdAt: session.createdAt,
    updatedAt: now.toISOString(),
    previousFingerprint: session.fingerprint,
  };
  const next = Object.freeze({ ...base, fingerprint: stableHash(sessionBase(base)) }) as CalibrationSession;
  assertCalibrationSession(next);
  return next;
}

export function addCalibrationCandidate(
  session: CalibrationSession,
  input: Omit<CalibrationCandidate, "fingerprint">,
  now = new Date(input.createdAt),
): CalibrationSession {
  assertCalibrationSession(session);
  const base = {
    ...input,
    findingCodes: uniqueValues(input.findingCodes, "CALIBRATION_CANDIDATE_FINDINGS_INVALID"),
  };
  const candidate = Object.freeze({ ...base, fingerprint: stableHash(candidateBase(base)) });
  assertCandidate(candidate);
  const existing = session.candidates.find((item) => item.id === candidate.id);
  if (existing) {
    if (existing.fingerprint === candidate.fingerprint) return session;
    throw new CalibrationConflictError("CALIBRATION_CANDIDATE_IDEMPOTENCY_CONFLICT");
  }
  if (session.candidates.some((item) => item.takeArtifactId === candidate.takeArtifactId)) {
    throw new CalibrationConflictError("CALIBRATION_CANDIDATE_TAKE_ALREADY_REGISTERED");
  }
  if (!session.passages.some((passage) => passage.id === candidate.passageId)) {
    throw new CalibrationConflictError("CALIBRATION_CANDIDATE_PASSAGE_UNKNOWN");
  }
  if (candidate.voiceProfileId !== session.voiceProfileId || candidate.voiceRevision !== session.voiceRevision) {
    throw new CalibrationConflictError("CALIBRATION_CANDIDATE_VOICE_SCOPE_MISMATCH");
  }
  return reviseSession(session, {
    status: "collecting",
    candidates: Object.freeze([...session.candidates, candidate]),
  }, now);
}

export function recordCalibrationReview(
  session: CalibrationSession,
  input: Omit<CalibrationReview, "fingerprint">,
  now = new Date(input.createdAt),
): CalibrationSession {
  assertCalibrationSession(session);
  const review = Object.freeze({ ...input, scores: Object.freeze({ ...input.scores }), fingerprint: stableHash(reviewBase(input)) });
  assertReview(review);
  if (!session.candidates.some((candidate) => candidate.id === review.candidateId)) {
    throw new CalibrationConflictError("CALIBRATION_REVIEW_CANDIDATE_UNKNOWN");
  }
  const existing = session.reviews.find((item) => item.id === review.id);
  if (existing) {
    if (existing.fingerprint === review.fingerprint) return session;
    throw new CalibrationConflictError("CALIBRATION_REVIEW_IDEMPOTENCY_CONFLICT");
  }
  if (session.reviews.some((item) => item.reviewerId === review.reviewerId && item.candidateId === review.candidateId)) {
    throw new CalibrationConflictError("CALIBRATION_REVIEW_ALREADY_RECORDED");
  }
  return reviseSession(session, {
    status: "review",
    reviews: Object.freeze([...session.reviews, review]),
  }, now);
}

export function selectCalibrationCandidate(
  session: CalibrationSession,
  input: Omit<CalibrationSelection, "fingerprint">,
  now = new Date(input.selectedAt),
): CalibrationSession {
  assertCalibrationSession(session);
  const selection = Object.freeze({ ...input, fingerprint: stableHash(selectionBase(input)) });
  assertSelection(selection);
  const candidate = session.candidates.find((item) => item.id === selection.candidateId);
  if (!candidate || candidate.passageId !== selection.passageId) {
    throw new CalibrationConflictError("CALIBRATION_SELECTION_CANDIDATE_SCOPE_MISMATCH");
  }
  const existing = session.selections.find((item) => item.passageId === selection.passageId);
  if (existing?.candidateId === selection.candidateId) return session;
  return reviseSession(session, {
    status: "review",
    selections: Object.freeze([
      ...session.selections.filter((item) => item.passageId !== selection.passageId),
      selection,
    ]),
  }, now);
}

function emptyDimensionAverages(): Record<CalibrationDimension, number> {
  return Object.fromEntries(SCORE_DIMENSIONS.map((dimension) => [dimension, 0])) as Record<CalibrationDimension, number>;
}

function objectiveComparisonCandidate(
  candidate: CalibrationCandidate,
  policy: CalibrationPolicy,
): boolean {
  return candidate.eligible
    && candidate.findingCodes.length === 0
    && candidate.continuityScore >= policy.minimumContinuityScore;
}

function comparativeReviewPanel(
  reviews: readonly CalibrationReview[],
  requireBlindReview: boolean,
): ReadonlyMap<string, CalibrationReview> {
  const panel = new Map<string, CalibrationReview>();
  for (const review of reviews) {
    if (!requireBlindReview || review.blind) panel.set(review.reviewerId, review);
  }
  return panel;
}

function comparativeCandidateScore(reviews: readonly CalibrationReview[]): number {
  if (reviews.length === 0) return 0;
  const total = reviews.reduce((reviewTotal, review) =>
    reviewTotal + SCORE_DIMENSIONS.reduce(
      (dimensionTotal, dimension) => dimensionTotal + review.scores[dimension],
      0,
    ), 0);
  return roundScore(total / (reviews.length * SCORE_DIMENSIONS.length));
}

function comparativeDecisionEligible(
  reviews: readonly CalibrationReview[],
  policy: CalibrationPolicy,
): boolean {
  if (reviews.some((review) => review.decision === "reject")) return false;
  return !policy.requireApprovedDecision
    || reviews.every((review) => review.decision === "approve");
}

function assessComparativeTakeSelection(
  session: CalibrationSession,
  passage: CalibrationPassage,
  selectedCandidate: CalibrationCandidate,
  findings: CalibrationFinding[],
): void {
  const contenders = session.candidates.filter((candidate) =>
    candidate.passageId === passage.id
    && objectiveComparisonCandidate(candidate, session.policy)
  );
  if (contenders.length <= 1) return;

  const panels = new Map<string, ReadonlyMap<string, CalibrationReview>>();
  let coverageComplete = true;
  for (const candidate of contenders) {
    const panel = comparativeReviewPanel(
      session.reviews.filter((review) => review.candidateId === candidate.id),
      session.policy.requireBlindReview,
    );
    panels.set(candidate.id, panel);
    if (panel.size < session.policy.minimumDistinctReviewers) {
      coverageComplete = false;
      findings.push({
        code: "CALIBRATION_COMPARATIVE_REVIEW_COVERAGE_INCOMPLETE",
        severity: "error",
        message: "An eligible take lacks the independent review coverage required for comparison.",
        passageId: passage.id,
        candidateId: candidate.id,
      });
    }
  }
  if (!coverageComplete) return;

  const firstPanel = panels.get(contenders[0]!.id)!;
  const commonReviewerIds = [...firstPanel.keys()]
    .filter((reviewerId) => contenders.every((candidate) =>
      panels.get(candidate.id)!.has(reviewerId)
    ))
    .sort((left, right) => left.localeCompare(right, "en-AU"));
  if (commonReviewerIds.length < session.policy.minimumDistinctReviewers) {
    findings.push({
      code: "CALIBRATION_COMPARATIVE_REVIEW_PANEL_MISMATCH",
      severity: "error",
      message: "Eligible takes were not reviewed by a sufficiently large common reviewer panel.",
      passageId: passage.id,
    });
    return;
  }

  const ranked = contenders
    .map((candidate) => {
      const reviews = commonReviewerIds.map((reviewerId) =>
        panels.get(candidate.id)!.get(reviewerId)!
      );
      return {
        candidate,
        score: comparativeCandidateScore(reviews),
      };
    })
    .filter(({ candidate }) => comparativeDecisionEligible(
      [...panels.get(candidate.id)!.values()],
      session.policy,
    ));
  const selected = ranked.find(({ candidate }) => candidate.id === selectedCandidate.id);
  if (!selected || ranked.length === 0) return;
  const topScore = Math.max(...ranked.map(({ score }) => score));
  if (selected.score < topScore) {
    findings.push({
      code: "CALIBRATION_SELECTED_CANDIDATE_NOT_TOP_RATED",
      severity: "error",
      message: "The selected take is not the highest-rated eligible performance under the matched reviewer panel.",
      passageId: passage.id,
      candidateId: selectedCandidate.id,
    });
  }
}

export function assessCalibrationSession(session: CalibrationSession): CalibrationAssessment {
  assertCalibrationSession(session);
  const findings: CalibrationFinding[] = [];
  const coverage: Record<string, boolean> = {};
  for (const category of session.policy.requiredCategories) {
    const present = session.passages.some((passage) => passage.required && passage.category === category);
    coverage[category] = present;
    if (!present) {
      findings.push({
        code: "CALIBRATION_REQUIRED_CATEGORY_MISSING",
        severity: "error",
        message: `Required calibration category ${category} is missing.`,
      });
    }
  }
  if (session.passages.length < session.policy.minimumPassageCount) {
    findings.push({
      code: "CALIBRATION_PASSAGE_COUNT_INSUFFICIENT",
      severity: "error",
      message: `Calibration requires at least ${session.policy.minimumPassageCount} passages.`,
    });
  }

  const selectedCandidates: CalibrationCandidate[] = [];
  for (const passage of session.passages.filter((item) => item.required)) {
    const selection = session.selections.find((item) => item.passageId === passage.id);
    if (!selection) {
      findings.push({
        code: "CALIBRATION_REQUIRED_PASSAGE_UNSELECTED",
        severity: "error",
        message: "A required calibration passage has no selected take.",
        passageId: passage.id,
      });
      continue;
    }
    const candidate = session.candidates.find((item) => item.id === selection.candidateId);
    if (!candidate) continue;
    selectedCandidates.push(candidate);
    if (!candidate.eligible || candidate.findingCodes.length > 0) {
      findings.push({
        code: "CALIBRATION_SELECTED_CANDIDATE_INELIGIBLE",
        severity: "error",
        message: "A selected take has unresolved transcript, technical, rights or continuity findings.",
        passageId: passage.id,
        candidateId: candidate.id,
      });
    }
    if (candidate.continuityScore < session.policy.minimumContinuityScore) {
      findings.push({
        code: "CALIBRATION_CONTINUITY_BELOW_MINIMUM",
        severity: "error",
        message: "A selected take falls below the required continuity score.",
        passageId: passage.id,
        candidateId: candidate.id,
      });
    }
    assessComparativeTakeSelection(session, passage, candidate, findings);
  }

  const providerSignatures = new Set(selectedCandidates.map((candidate) =>
    `${candidate.providerId}:${candidate.modelId}:${candidate.capabilityFingerprint}`
  ));
  if (providerSignatures.size > 1) {
    findings.push({
      code: "CALIBRATION_PROVIDER_CONFIGURATION_DRIFT",
      severity: "error",
      message: "Selected calibration takes do not share one provider, model and capability snapshot.",
    });
  }

  const selectedReviews = session.reviews.filter((review) =>
    selectedCandidates.some((candidate) => candidate.id === review.candidateId)
  );
  const reviewers = new Set(selectedReviews.map((review) => review.reviewerId));
  if (reviewers.size < session.policy.minimumDistinctReviewers) {
    findings.push({
      code: "CALIBRATION_DISTINCT_REVIEWERS_INSUFFICIENT",
      severity: "error",
      message: `Calibration requires ${session.policy.minimumDistinctReviewers} distinct reviewers.`,
    });
  }

  for (const candidate of selectedCandidates) {
    const reviews = selectedReviews.filter((review) => review.candidateId === candidate.id);
    const distinct = new Set(reviews.map((review) => review.reviewerId));
    if (distinct.size < session.policy.minimumDistinctReviewers) {
      findings.push({
        code: "CALIBRATION_CANDIDATE_REVIEWS_INSUFFICIENT",
        severity: "error",
        message: "A selected take lacks the required independent review coverage.",
        candidateId: candidate.id,
      });
    }
    if (session.policy.requireBlindReview && reviews.some((review) => !review.blind)) {
      findings.push({
        code: "CALIBRATION_BLIND_REVIEW_REQUIRED",
        severity: "error",
        message: "A selected take includes a non-blind review.",
        candidateId: candidate.id,
      });
    }
    if (reviews.some((review) => review.decision === "reject")) {
      findings.push({
        code: "CALIBRATION_CANDIDATE_REJECTED",
        severity: "error",
        message: "A reviewer rejected the selected take.",
        candidateId: candidate.id,
      });
    }
    if (
      session.policy.requireApprovedDecision
      && reviews.some((review) => review.decision !== "approve")
    ) {
      findings.push({
        code: "CALIBRATION_APPROVED_DECISIONS_REQUIRED",
        severity: "error",
        message: "Every review of a selected take must explicitly approve it.",
        candidateId: candidate.id,
      });
    }
  }

  const averages = emptyDimensionAverages();
  if (selectedReviews.length > 0) {
    for (const dimension of SCORE_DIMENSIONS) {
      averages[dimension] = roundScore(
        selectedReviews.reduce((sum, review) => sum + review.scores[dimension], 0)
          / selectedReviews.length,
      );
      if (averages[dimension] < session.policy.minimumDimensionScore) {
        findings.push({
          code: "CALIBRATION_DIMENSION_BELOW_MINIMUM",
          severity: "error",
          message: `Calibration dimension ${dimension} is below the required minimum.`,
          dimension,
        });
      }
    }
  }
  const overallMeanScore = roundScore(
    SCORE_DIMENSIONS.reduce((sum, dimension) => sum + averages[dimension], 0)
      / SCORE_DIMENSIONS.length,
  );
  if (overallMeanScore < session.policy.minimumMeanScore) {
    findings.push({
      code: "CALIBRATION_MEAN_SCORE_BELOW_MINIMUM",
      severity: "error",
      message: "The selected calibration set is below the required overall mean score.",
    });
  }

  const selectedCandidateIds = Object.freeze(selectedCandidates.map((candidate) => candidate.id).sort());
  const fingerprint = stableHash({
    schemaVersion: "storyteller-calibration-assessment-v1",
    sessionFingerprint: session.fingerprint,
    selectedCandidateIds,
    requiredCategoryCoverage: coverage,
    distinctReviewerCount: reviewers.size,
    dimensionAverages: averages,
    overallMeanScore,
    findings,
  });
  return Object.freeze({
    eligible: !findings.some((finding) => finding.severity === "error"),
    requiredCategoryCoverage: Object.freeze(coverage),
    selectedPassageCount: session.selections.length,
    selectedCandidateCount: selectedCandidates.length,
    distinctReviewerCount: reviewers.size,
    dimensionAverages: Object.freeze(averages),
    overallMeanScore,
    findings: Object.freeze(findings),
    fingerprint,
  });
}

export function approveCalibrationSession(
  session: CalibrationSession,
  input: Readonly<{
    approvedBy: string;
    humanConfirmation: true;
    now?: Date;
  }>,
): CalibrationSession {
  if (input.humanConfirmation !== true) {
    throw new CalibrationConflictError("CALIBRATION_HUMAN_CONFIRMATION_REQUIRED");
  }
  const approvedBy = requireIdentifier(input.approvedBy, "CALIBRATION_APPROVER_ID_INVALID");
  if (/^(?:system|automation|worker)[._-]/iu.test(approvedBy)) {
    throw new CalibrationConflictError("CALIBRATION_HUMAN_APPROVER_REQUIRED");
  }
  const assessment = assessCalibrationSession(session);
  if (!assessment.eligible) throw new CalibrationApprovalError(assessment.findings);
  const selected = session.selections
    .map((selection) => session.candidates.find((candidate) => candidate.id === selection.candidateId))
    .filter((candidate): candidate is CalibrationCandidate => Boolean(candidate))
    .sort((left, right) => left.passageId.localeCompare(right.passageId, "en-AU"));
  const signature = selected[0];
  if (!signature) throw new CalibrationConflictError("CALIBRATION_SELECTION_REQUIRED");
  const now = input.now ?? new Date();
  const approvedAt = now.toISOString();
  const approvalBaseValue = {
    id: `calapproval_${stableHash({ sessionId: session.id, assessment: assessment.fingerprint }).slice(0, 24)}`,
    approvedBy,
    approvedAt,
    assessmentFingerprint: assessment.fingerprint,
    selectedCandidateIds: Object.freeze(selected.map((candidate) => candidate.id)),
    selectedTakeArtifactIds: Object.freeze(selected.map((candidate) => candidate.takeArtifactId)),
    providerId: signature.providerId,
    modelId: signature.modelId,
    capabilityFingerprint: signature.capabilityFingerprint,
  };
  const approval = Object.freeze({
    ...approvalBaseValue,
    fingerprint: stableHash(approvalBase(approvalBaseValue)),
  });
  return reviseSession(session, { status: "approved", approval }, now);
}

export function rejectCalibrationSession(
  session: CalibrationSession,
  input: Readonly<{ codes: readonly string[]; rejectedBy: string; now?: Date }>,
): CalibrationSession {
  requireIdentifier(input.rejectedBy, "CALIBRATION_REJECTOR_ID_INVALID");
  const codes = uniqueValues(input.codes, "CALIBRATION_REJECTION_CODES_INVALID");
  if (codes.length === 0) throw new CalibrationIntegrityError("CALIBRATION_REJECTION_CODES_REQUIRED");
  for (const code of codes) requireCode(code, "CALIBRATION_REJECTION_CODE_INVALID");
  return reviseSession(session, { status: "rejected", rejectionCodes: codes }, input.now ?? new Date());
}

export function calibrationSessionPublicView(
  session: CalibrationSession,
): CalibrationSessionPublicView {
  const assessment = assessCalibrationSession(session);
  return Object.freeze({
    id: session.id,
    projectId: session.projectId,
    seriesScoped: Boolean(session.seriesId),
    voiceRevision: session.voiceRevision,
    status: session.status,
    passageCount: session.passages.length,
    requiredPassageCount: session.passages.filter((passage) => passage.required).length,
    candidateCount: session.candidates.length,
    reviewCount: session.reviews.length,
    selectionCount: session.selections.length,
    distinctReviewerCount: assessment.distinctReviewerCount,
    requiredCategoryCoverage: assessment.requiredCategoryCoverage,
    dimensionAverages: assessment.dimensionAverages,
    overallMeanScore: assessment.overallMeanScore,
    eligibleForApproval: assessment.eligible,
    findingCodes: Object.freeze(assessment.findings.map((finding) => finding.code)),
    ...(session.approval ? { approvedAt: session.approval.approvedAt } : {}),
    revision: session.revision,
    fingerprint: session.fingerprint,
  });
}
