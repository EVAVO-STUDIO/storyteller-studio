import { stableHash } from "./index.js";
import { EXPRESSIVE_MINIMUM_CANDIDATES, type ExpressivePerformanceScores } from "./narration-expressive-performance.js";
import {
  NARRATION_SELECTION_MINIMUM_REVIEWERS,
  assertNarrationCandidateEvidence,
  type NarrationCandidateEvidence,
} from "./narration-candidate-evidence.js";

export const NARRATION_CANDIDATE_SELECTION_SCHEMA =
  "storyteller-narration-candidate-selection-v1" as const;
export const NARRATION_SELECTION_MINIMUM_CANDIDATES = EXPRESSIVE_MINIMUM_CANDIDATES;
export const NARRATION_SELECTION_MAXIMUM_CANDIDATES = 16;

export interface NarrationCandidateSelection {
  schemaVersion: typeof NARRATION_CANDIDATE_SELECTION_SCHEMA;
  id: string;
  projectId: string;
  segmentId: string;
  sourceContentHash: string;
  rightsFingerprint: string;
  expressiveRoleBindingFingerprint: string;
  expressivePerformancePlanFingerprint: string;
  reviewerIds: readonly string[];
  blindComparativeReview: true;
  candidates: readonly NarrationCandidateEvidence[];
  selectedCandidateIndex: number;
  selectedTakeId: string;
  selectedAudioArtifactId: string;
  selectedAudioArtifactFingerprint: string;
  selectedAudioContentHash: string;
  selectedCompositeScore: number;
  selectedByActorId: string;
  selectedAt: string;
  finalConfirmationId: string;
  approvedByActorId: string;
  approvedAt: string;
  humanListeningApproval: true;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export class NarrationCandidateSelectionError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "NarrationCandidateSelectionError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const HUMAN_BLOCKLIST = /^(?:system|worker|automation|automated|bot)(?:[_-]|$)/iu;
const SCORE_KEYS = [
  "naturalness", "emotionalTruth", "cadence", "roleFidelity",
  "identityStability", "sustainedListenability",
] as const satisfies readonly (keyof ExpressivePerformanceScores)[];

function id(value: string, code: string): string {
  if (!ID.test(value)) throw new NarrationCandidateSelectionError(code);
  return value;
}
function human(value: string, code: string): string {
  id(value, code);
  if (HUMAN_BLOCKLIST.test(value)) throw new NarrationCandidateSelectionError(code);
  return value;
}
function reviewers(values: readonly string[]): readonly string[] {
  if (!Array.isArray(values) || values.length < NARRATION_SELECTION_MINIMUM_REVIEWERS || values.length > 16) {
    throw new NarrationCandidateSelectionError("NARRATION_SELECTION_REVIEWER_COUNT_INVALID");
  }
  const output = values.map((value) => id(value, "NARRATION_SELECTION_REVIEWER_ID_INVALID"));
  if (new Set(output).size !== output.length) {
    throw new NarrationCandidateSelectionError("NARRATION_SELECTION_REVIEWER_DUPLICATE");
  }
  return Object.freeze([...output].sort((a, b) => a.localeCompare(b, "en-AU")));
}
function same(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function composite(candidate: NarrationCandidateEvidence): number {
  const total = SCORE_KEYS.reduce((sum, key) => sum + candidate.scores[key], 0);
  return Number((total / SCORE_KEYS.length).toFixed(4));
}
function base(value: Omit<NarrationCandidateSelection, "fingerprint">) {
  return { ...value, reviewerIds: [...value.reviewerIds], candidates: value.candidates.map((c) => ({ ...c })) };
}

export function createNarrationCandidateSelection(input: Readonly<{
  id: string;
  candidates: readonly NarrationCandidateEvidence[];
  selectedTakeId: string;
  selectedByActorId: string;
  selectedAt: Date;
  finalConfirmationId: string;
  approvedByActorId: string;
  approvedAt: Date;
}>): NarrationCandidateSelection {
  id(input.id, "NARRATION_SELECTION_ID_INVALID");
  id(input.selectedTakeId, "NARRATION_SELECTION_SELECTED_TAKE_INVALID");
  id(input.selectedByActorId, "NARRATION_SELECTION_SELECTOR_INVALID");
  id(input.finalConfirmationId, "NARRATION_SELECTION_CONFIRMATION_ID_INVALID");
  const approvedByActorId = human(input.approvedByActorId, "NARRATION_SELECTION_APPROVER_INVALID");
  if (input.selectedByActorId === approvedByActorId) {
    throw new NarrationCandidateSelectionError("NARRATION_SELECTION_APPROVER_SEPARATION_REQUIRED");
  }
  if (Number.isNaN(input.selectedAt.getTime()) || Number.isNaN(input.approvedAt.getTime())
    || input.approvedAt.getTime() < input.selectedAt.getTime()) {
    throw new NarrationCandidateSelectionError("NARRATION_SELECTION_DATE_INVALID");
  }
  if (!Array.isArray(input.candidates) || input.candidates.length < NARRATION_SELECTION_MINIMUM_CANDIDATES
    || input.candidates.length > NARRATION_SELECTION_MAXIMUM_CANDIDATES) {
    throw new NarrationCandidateSelectionError("NARRATION_SELECTION_CANDIDATE_COUNT_INVALID");
  }
  const candidates = [...input.candidates].map((candidate) => {
    assertNarrationCandidateEvidence(candidate);
    return candidate;
  }).sort((a, b) => a.candidateIndex - b.candidateIndex);
  if (candidates.some((candidate, index) => candidate.candidateIndex !== index)) {
    throw new NarrationCandidateSelectionError("NARRATION_SELECTION_CANDIDATE_INDEX_SEQUENCE_INVALID");
  }
  const first = candidates[0]!;
  const reviewerIds = reviewers(first.reviewerIds);
  const seen = {
    take: new Set<string>(), artifact: new Set<string>(), content: new Set<string>(), request: new Set<string>(),
  };
  for (const candidate of candidates) {
    if (candidate.projectId !== first.projectId || candidate.segmentId !== first.segmentId
      || candidate.sourceContentHash !== first.sourceContentHash || candidate.rightsFingerprint !== first.rightsFingerprint
      || candidate.expressiveRoleBindingFingerprint !== first.expressiveRoleBindingFingerprint
      || candidate.expressivePerformancePlanFingerprint !== first.expressivePerformancePlanFingerprint) {
      throw new NarrationCandidateSelectionError("NARRATION_SELECTION_CANDIDATE_SCOPE_MISMATCH");
    }
    if (!same(candidate.reviewerIds, reviewerIds)) {
      throw new NarrationCandidateSelectionError("NARRATION_SELECTION_REVIEW_PANEL_MISMATCH");
    }
    if (seen.take.has(candidate.takeId) || seen.artifact.has(candidate.audioArtifactId)
      || seen.content.has(candidate.audioContentHash) || seen.request.has(candidate.generationRequestHash)) {
      throw new NarrationCandidateSelectionError("NARRATION_SELECTION_CANDIDATE_DUPLICATE");
    }
    seen.take.add(candidate.takeId);
    seen.artifact.add(candidate.audioArtifactId);
    seen.content.add(candidate.audioContentHash);
    seen.request.add(candidate.generationRequestHash);
  }
  const selected = candidates.find((candidate) => candidate.takeId === input.selectedTakeId);
  if (!selected) throw new NarrationCandidateSelectionError("NARRATION_SELECTION_SELECTED_CANDIDATE_NOT_FOUND");
  const selectedCompositeScore = composite(selected);
  if (selectedCompositeScore !== Math.max(...candidates.map(composite))) {
    throw new NarrationCandidateSelectionError("NARRATION_SELECTION_SELECTED_CANDIDATE_NOT_TOP_RATED");
  }
  const partial: Omit<NarrationCandidateSelection, "fingerprint"> = {
    schemaVersion: NARRATION_CANDIDATE_SELECTION_SCHEMA,
    id: input.id,
    projectId: first.projectId,
    segmentId: first.segmentId,
    sourceContentHash: first.sourceContentHash,
    rightsFingerprint: first.rightsFingerprint,
    expressiveRoleBindingFingerprint: first.expressiveRoleBindingFingerprint,
    expressivePerformancePlanFingerprint: first.expressivePerformancePlanFingerprint,
    reviewerIds,
    blindComparativeReview: true,
    candidates: Object.freeze(candidates),
    selectedCandidateIndex: selected.candidateIndex,
    selectedTakeId: selected.takeId,
    selectedAudioArtifactId: selected.audioArtifactId,
    selectedAudioArtifactFingerprint: selected.audioArtifactFingerprint,
    selectedAudioContentHash: selected.audioContentHash,
    selectedCompositeScore,
    selectedByActorId: input.selectedByActorId,
    selectedAt: input.selectedAt.toISOString(),
    finalConfirmationId: input.finalConfirmationId,
    approvedByActorId,
    approvedAt: input.approvedAt.toISOString(),
    humanListeningApproval: true,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  return Object.freeze({ ...partial, fingerprint: stableHash(base(partial)) });
}

export function assertNarrationCandidateSelection(value: NarrationCandidateSelection): void {
  if (value.schemaVersion !== NARRATION_CANDIDATE_SELECTION_SCHEMA) {
    throw new NarrationCandidateSelectionError("NARRATION_SELECTION_SCHEMA_UNSUPPORTED");
  }
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || stableHash(base(partial)) !== fingerprint) {
    throw new NarrationCandidateSelectionError("NARRATION_SELECTION_FINGERPRINT_INVALID");
  }
  const recreated = createNarrationCandidateSelection({
    id: value.id,
    candidates: value.candidates,
    selectedTakeId: value.selectedTakeId,
    selectedByActorId: value.selectedByActorId,
    selectedAt: new Date(value.selectedAt),
    finalConfirmationId: value.finalConfirmationId,
    approvedByActorId: value.approvedByActorId,
    approvedAt: new Date(value.approvedAt),
  });
  if (recreated.fingerprint !== fingerprint) {
    throw new NarrationCandidateSelectionError("NARRATION_SELECTION_CONTRACT_MISMATCH");
  }
}

export function narrationCandidateSelectionPublicView(value: NarrationCandidateSelection) {
  assertNarrationCandidateSelection(value);
  return Object.freeze({
    id: value.id,
    segmentId: value.segmentId,
    candidateCount: value.candidates.length,
    reviewerCount: value.reviewerIds.length,
    selectedCandidateIndex: value.selectedCandidateIndex,
    selectedCompositeScore: value.selectedCompositeScore,
    approvedAt: value.approvedAt,
    humanListeningApproval: true as const,
    titleReleaseAuthority: false as const,
    publicationAuthority: false as const,
    fingerprint: value.fingerprint,
  });
}
