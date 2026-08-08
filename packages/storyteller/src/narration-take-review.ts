import { createHash } from "node:crypto";
import {
  assertAudioEngineeringEvidence,
  type AudioEngineeringEvidence,
} from "./audio-engineering.js";
import {
  assertArtifactRecord,
  recordArtifactReview,
  type ArtifactRecord,
} from "./artifact-registry.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";
import { stableHash } from "./index.js";

export const NARRATION_TAKE_REVIEW_SCHEMA_VERSION =
  "storyteller-narration-take-review-v1" as const;

export type NarrationTakeReviewPerspective = "editorial" | "engineering";
export type NarrationTakeReviewDecision =
  | "approve"
  | "changes-requested"
  | "reject";
export type NarrationTakePlaybackContext =
  | "studio-headphones"
  | "consumer-headphones"
  | "speakers";
export type NarrationTakeReviewStatus =
  | "open"
  | "ready-for-selection"
  | "ready-for-approval"
  | "approved";

export interface NarrationTakeReviewScores {
  textualTruth: number;
  pronunciation: number;
  pacing: number;
  rhythm: number;
  emotionalTruth: number;
  restraint: number;
  sustainedListenability: number;
  continuity: number;
  technicalComfort: number;
}

export interface NarrationTakeReviewPolicy {
  id: string;
  version: string;
  minimumCandidateCount: number;
  maximumCandidateCount: number;
  minimumDimensionScore: number;
  requireBlindReview: true;
  requireFullListen: true;
  requiredPerspectives: readonly NarrationTakeReviewPerspective[];
  fingerprint: string;
}

export interface NarrationTakeReviewCandidate {
  audioCandidate: ArtifactRecord;
  transcriptArtifact: ArtifactRecord;
  engineeringArtifact: ArtifactRecord;
  engineeringEvidence: AudioEngineeringEvidence;
  durationMs: number;
  fingerprint: string;
}

export interface NarrationTakeReviewEntry {
  id: string;
  candidateTakeId: string;
  perspective: NarrationTakeReviewPerspective;
  reviewerId: string;
  blind: boolean;
  listenedDurationMs: number;
  playbackContexts: readonly NarrationTakePlaybackContext[];
  decision: NarrationTakeReviewDecision;
  scores: NarrationTakeReviewScores;
  notes?: string;
  decidedAt: string;
  fingerprint: string;
}

export interface NarrationTakeSelection {
  candidateTakeId: string;
  selectedByActorId: string;
  selectedAt: string;
  comparativeScore: number;
  reviewSetFingerprint: string;
  fingerprint: string;
}

export interface NarrationTakeApproval {
  finalConfirmationId: string;
  approvedByActorId: string;
  approvedAt: string;
  selectionFingerprint: string;
  approvedArtifactFingerprint: string;
  approvedArtifactRevision: number;
  fingerprint: string;
}

export interface NarrationTakeReviewSession {
  schemaVersion: typeof NARRATION_TAKE_REVIEW_SCHEMA_VERSION;
  id: string;
  projectId: string;
  segmentId: string;
  manuscriptSourceHash: string;
  performanceContextFingerprint: string;
  rightsFingerprint: string;
  policy: NarrationTakeReviewPolicy;
  candidates: readonly NarrationTakeReviewCandidate[];
  reviews: readonly NarrationTakeReviewEntry[];
  selection?: NarrationTakeSelection;
  approval?: NarrationTakeApproval;
  status: NarrationTakeReviewStatus;
  revision: number;
  previousFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface NarrationTakeReviewPublicView {
  id: string;
  candidateCount: number;
  reviewedCandidateCount: number;
  completePanel: boolean;
  selected: boolean;
  selectedComparativeScore?: number;
  status: NarrationTakeReviewStatus;
  policyId: string;
  policyVersion: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface ApprovedNarrationTakeSelection {
  session: NarrationTakeReviewSession;
  audioCandidate: ArtifactRecord;
}

export class NarrationTakeReviewError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NarrationTakeReviewError";
    this.code = code;
  }
}

export class NarrationTakeReviewStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NarrationTakeReviewStoreConflictError";
  }
}

const ENTITY_TYPE = "narration-take-review" as const;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const HUMAN_BLOCKLIST = /^(?:system|worker|automation|automated|bot)(?:[_-]|$)/iu;
const MAX_NOTES_LENGTH = 4_000;
const FULL_LISTEN_TOLERANCE_MS = 250;
const MAX_CANDIDATES = 8;
const MAX_DURATION_MS = 2 * 60 * 60_000;
const REQUIRED_PERSPECTIVES = Object.freeze([
  "editorial",
  "engineering",
] as const satisfies readonly NarrationTakeReviewPerspective[]);
const PLAYBACK_CONTEXTS: ReadonlySet<NarrationTakePlaybackContext> = new Set([
  "studio-headphones",
  "consumer-headphones",
  "speakers",
]);
const SCORE_KEYS = Object.freeze([
  "textualTruth",
  "pronunciation",
  "pacing",
  "rhythm",
  "emotionalTruth",
  "restraint",
  "sustainedListenability",
  "continuity",
  "technicalComfort",
] as const satisfies readonly (keyof NarrationTakeReviewScores)[]);

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new NarrationTakeReviewError(code);
  return value;
}

function requireHuman(value: string, code: string): string {
  requireIdentifier(value, code);
  if (HUMAN_BLOCKLIST.test(value)) throw new NarrationTakeReviewError(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new NarrationTakeReviewError(code);
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) throw new NarrationTakeReviewError(code);
  return value;
}

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new NarrationTakeReviewError(code);
  }
  return value;
}

function requireFinite(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new NarrationTakeReviewError(code);
  }
  return value;
}

function requireNotes(value: string | undefined, required: boolean): string | undefined {
  if (value === undefined) {
    if (required) throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_NOTES_REQUIRED");
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_NOTES_LENGTH || CONTROL_CHARACTERS.test(trimmed)) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_NOTES_INVALID");
  }
  return trimmed;
}

function assertScores(scores: NarrationTakeReviewScores): void {
  for (const key of SCORE_KEYS) {
    const value = scores[key];
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_SCORE_INVALID");
    }
  }
}

function freezeScores(scores: NarrationTakeReviewScores): NarrationTakeReviewScores {
  assertScores(scores);
  return Object.freeze({ ...scores });
}

function normalisePerspectives(
  values: readonly NarrationTakeReviewPerspective[],
): readonly NarrationTakeReviewPerspective[] {
  if (!Array.isArray(values) || values.length !== REQUIRED_PERSPECTIVES.length) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_PERSPECTIVES_INVALID");
  }
  const unique = new Set(values);
  if (
    unique.size !== REQUIRED_PERSPECTIVES.length
    || REQUIRED_PERSPECTIVES.some((value) => !unique.has(value))
  ) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_PERSPECTIVES_INVALID");
  }
  return REQUIRED_PERSPECTIVES;
}

function normaliseContexts(
  perspective: NarrationTakeReviewPerspective,
  contexts: readonly NarrationTakePlaybackContext[],
): readonly NarrationTakePlaybackContext[] {
  if (!Array.isArray(contexts) || contexts.length === 0 || contexts.length > 3) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_CONTEXTS_INVALID");
  }
  const unique = new Set<NarrationTakePlaybackContext>();
  for (const context of contexts) {
    if (!PLAYBACK_CONTEXTS.has(context) || unique.has(context)) {
      throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_CONTEXTS_INVALID");
    }
    unique.add(context);
  }
  if (perspective === "engineering" && !unique.has("studio-headphones")) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_STUDIO_CONTEXT_REQUIRED");
  }
  if (
    perspective === "editorial"
    && !unique.has("consumer-headphones")
    && !unique.has("speakers")
  ) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_CONSUMER_CONTEXT_REQUIRED");
  }
  return Object.freeze(
    [...unique].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function policyFingerprint(
  policy: Omit<NarrationTakeReviewPolicy, "fingerprint">,
): string {
  return stableHash(policy);
}

function candidateFingerprint(
  candidate: Omit<NarrationTakeReviewCandidate, "fingerprint">,
): string {
  return stableHash(candidate);
}

function reviewFingerprint(
  review: Omit<NarrationTakeReviewEntry, "fingerprint">,
): string {
  return stableHash(review);
}

function selectionFingerprint(
  selection: Omit<NarrationTakeSelection, "fingerprint">,
): string {
  return stableHash(selection);
}

function approvalFingerprint(
  approval: Omit<NarrationTakeApproval, "fingerprint">,
): string {
  return stableHash(approval);
}

function sessionFingerprint(
  session: Omit<NarrationTakeReviewSession, "fingerprint">,
): string {
  return stableHash(session);
}

export function createNarrationTakeReviewPolicy(
  input: Readonly<Omit<NarrationTakeReviewPolicy, "fingerprint">>,
): NarrationTakeReviewPolicy {
  requireIdentifier(input.id, "NARRATION_TAKE_REVIEW_POLICY_ID_INVALID");
  if (!SAFE_VERSION.test(input.version)) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_POLICY_VERSION_INVALID");
  }
  requireInteger(
    input.minimumCandidateCount,
    2,
    MAX_CANDIDATES,
    "NARRATION_TAKE_REVIEW_POLICY_MINIMUM_CANDIDATES_INVALID",
  );
  requireInteger(
    input.maximumCandidateCount,
    input.minimumCandidateCount,
    MAX_CANDIDATES,
    "NARRATION_TAKE_REVIEW_POLICY_MAXIMUM_CANDIDATES_INVALID",
  );
  requireFinite(
    input.minimumDimensionScore,
    1,
    5,
    "NARRATION_TAKE_REVIEW_POLICY_SCORE_INVALID",
  );
  if (input.requireBlindReview !== true || input.requireFullListen !== true) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_POLICY_GATES_REQUIRED");
  }
  const partial: Omit<NarrationTakeReviewPolicy, "fingerprint"> = {
    id: input.id,
    version: input.version,
    minimumCandidateCount: input.minimumCandidateCount,
    maximumCandidateCount: input.maximumCandidateCount,
    minimumDimensionScore: input.minimumDimensionScore,
    requireBlindReview: true,
    requireFullListen: true,
    requiredPerspectives: normalisePerspectives(input.requiredPerspectives),
  };
  return Object.freeze({ ...partial, fingerprint: policyFingerprint(partial) });
}

function requireVerified(record: ArtifactRecord, code: string): void {
  assertArtifactRecord(record);
  if (
    record.verification.status !== "verified"
    || record.verification.findings.some((finding) => finding.severity === "error")
    || record.quarantine
  ) {
    throw new NarrationTakeReviewError(code);
  }
}

function requireRightsAvailable(record: ArtifactRecord, now: Date): void {
  if (!record.rights.allowedUses.includes("audiobook")) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_AUDIOBOOK_RIGHTS_REQUIRED");
  }
  if (!record.rights.commercialUseApproved) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_COMMERCIAL_RIGHTS_REQUIRED");
  }
  if (record.rights.expiresAt && Date.parse(record.rights.expiresAt) <= now.getTime()) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_RIGHTS_EXPIRED");
  }
  if (
    record.rights.deletionRequiredAt
    && Date.parse(record.rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_RETENTION_EXPIRED");
  }
}

function requireSameScope(
  audio: ArtifactRecord,
  related: ArtifactRecord,
  code: string,
): void {
  if (
    related.projectId !== audio.projectId
    || related.jobId !== audio.jobId
    || related.segmentId !== audio.segmentId
    || related.takeId !== audio.takeId
  ) {
    throw new NarrationTakeReviewError(code);
  }
}

function requireParent(record: ArtifactRecord, parentId: string, code: string): void {
  if (!record.provenance.parentArtifactIds.includes(parentId)) {
    throw new NarrationTakeReviewError(code);
  }
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function engineeringEvidenceSerialisations(
  evidence: AudioEngineeringEvidence,
): readonly Uint8Array[] {
  const serialised = JSON.stringify(evidence);
  return Object.freeze([
    new TextEncoder().encode(serialised),
    new TextEncoder().encode(`${serialised}\n`),
  ]);
}

function requireEngineeringEvidenceArtifactBinding(
  artifact: ArtifactRecord,
  evidence: AudioEngineeringEvidence,
): void {
  if (
    artifact.integrity.mimeType !== "application/json"
    || artifact.integrity.format !== "json"
  ) {
    throw new NarrationTakeReviewError(
      "NARRATION_TAKE_REVIEW_ENGINEERING_EVIDENCE_ARTIFACT_MISMATCH",
    );
  }
  const bound = engineeringEvidenceSerialisations(evidence).some((bytes) =>
    artifact.integrity.byteCount === bytes.byteLength
    && artifact.integrity.contentHash === hashBytes(bytes)
  );
  if (!bound) {
    throw new NarrationTakeReviewError(
      "NARRATION_TAKE_REVIEW_ENGINEERING_EVIDENCE_ARTIFACT_MISMATCH",
    );
  }
}

function assertCandidate(
  candidate: NarrationTakeReviewCandidate,
  now: Date,
): void {
  const {
    audioCandidate,
    transcriptArtifact,
    engineeringArtifact,
    engineeringEvidence,
  } = candidate;
  requireVerified(audioCandidate, "NARRATION_TAKE_REVIEW_AUDIO_NOT_VERIFIED");
  requireVerified(transcriptArtifact, "NARRATION_TAKE_REVIEW_TRANSCRIPT_NOT_VERIFIED");
  requireVerified(engineeringArtifact, "NARRATION_TAKE_REVIEW_ENGINEERING_NOT_VERIFIED");
  assertAudioEngineeringEvidence(engineeringEvidence);
  if (audioCandidate.kind !== "audio-candidate") {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_AUDIO_CANDIDATE_REQUIRED");
  }
  if (transcriptArtifact.kind !== "transcript") {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_TRANSCRIPT_REQUIRED");
  }
  if (engineeringArtifact.kind !== "audio-analysis") {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_ENGINEERING_ARTIFACT_REQUIRED");
  }
  if (audioCandidate.review.required !== true || audioCandidate.review.status !== "pending") {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_PENDING_AUDIO_REQUIRED");
  }
  if (!audioCandidate.takeId || !audioCandidate.segmentId || !audioCandidate.jobId) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_AUDIO_SCOPE_REQUIRED");
  }
  requireSameScope(
    audioCandidate,
    transcriptArtifact,
    "NARRATION_TAKE_REVIEW_TRANSCRIPT_SCOPE_MISMATCH",
  );
  requireSameScope(
    audioCandidate,
    engineeringArtifact,
    "NARRATION_TAKE_REVIEW_ENGINEERING_SCOPE_MISMATCH",
  );
  requireParent(
    transcriptArtifact,
    audioCandidate.id,
    "NARRATION_TAKE_REVIEW_TRANSCRIPT_PARENT_MISMATCH",
  );
  requireParent(
    engineeringArtifact,
    audioCandidate.id,
    "NARRATION_TAKE_REVIEW_ENGINEERING_PARENT_MISMATCH",
  );
  const requestHash = audioCandidate.provenance.generationRequestHash;
  if (
    !requestHash
    || transcriptArtifact.provenance.generationRequestHash !== requestHash
    || engineeringArtifact.provenance.generationRequestHash !== requestHash
  ) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_REQUEST_BINDING_MISMATCH");
  }
  if (
    transcriptArtifact.provenance.sourceContentHash
      !== audioCandidate.provenance.sourceContentHash
    || engineeringArtifact.provenance.sourceContentHash
      !== audioCandidate.integrity.contentHash
  ) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_SOURCE_BINDING_MISMATCH");
  }
  requireEngineeringEvidenceArtifactBinding(engineeringArtifact, engineeringEvidence);
  if (
    engineeringEvidence.inputContentHash !== audioCandidate.integrity.contentHash
    || engineeringEvidence.inputByteCount !== audioCandidate.integrity.byteCount
    || !engineeringEvidence.eligible
    || engineeringEvidence.findings.some((finding) => finding.severity === "error")
  ) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_ENGINEERING_INELIGIBLE");
  }
  const expectedDurationMs = Math.round(engineeringEvidence.probe.durationSeconds * 1_000);
  requireInteger(
    candidate.durationMs,
    1,
    MAX_DURATION_MS,
    "NARRATION_TAKE_REVIEW_DURATION_INVALID",
  );
  if (candidate.durationMs !== expectedDurationMs) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_DURATION_MISMATCH");
  }
  const rightsFingerprint = audioCandidate.rights.rightsFingerprint;
  for (const artifact of [audioCandidate, transcriptArtifact, engineeringArtifact]) {
    requireRightsAvailable(artifact, now);
    if (artifact.rights.rightsFingerprint !== rightsFingerprint) {
      throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_RIGHTS_SCOPE_MISMATCH");
    }
  }
  const { fingerprint, ...partial } = candidate;
  if (!HASH_PATTERN.test(fingerprint) || candidateFingerprint(partial) !== fingerprint) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_CANDIDATE_FINGERPRINT_INVALID");
  }
}

function candidateActors(candidate: NarrationTakeReviewCandidate): ReadonlySet<string> {
  const actors = new Set<string>();
  for (const artifact of [
    candidate.audioCandidate,
    candidate.transcriptArtifact,
    candidate.engineeringArtifact,
  ]) {
    actors.add(artifact.provenance.createdByActorId);
    if (artifact.verification.checkedByActorId) actors.add(artifact.verification.checkedByActorId);
  }
  return actors;
}

function decisionActorConflicts(
  session: NarrationTakeReviewSession,
  actorId: string,
): boolean {
  if (session.candidates.some((candidate) => candidateActors(candidate).has(actorId))) {
    return true;
  }
  return [...(matchedPanel(session)?.values() ?? [])].includes(actorId);
}

function assertReview(
  review: NarrationTakeReviewEntry,
  candidate: NarrationTakeReviewCandidate,
  policy: NarrationTakeReviewPolicy,
): void {
  requireIdentifier(review.id, "NARRATION_TAKE_REVIEW_ID_INVALID");
  if (review.candidateTakeId !== candidate.audioCandidate.takeId) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_CANDIDATE_MISMATCH");
  }
  if (!policy.requiredPerspectives.includes(review.perspective)) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_PERSPECTIVE_INVALID");
  }
  requireHuman(review.reviewerId, "NARRATION_TAKE_REVIEW_REVIEWER_INVALID");
  if (candidateActors(candidate).has(review.reviewerId)) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_REVIEWER_INDEPENDENCE_REQUIRED");
  }
  if (policy.requireBlindReview && review.blind !== true) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_BLIND_REVIEW_REQUIRED");
  }
  requireInteger(
    review.listenedDurationMs,
    1,
    MAX_DURATION_MS,
    "NARRATION_TAKE_REVIEW_LISTEN_DURATION_INVALID",
  );
  if (
    policy.requireFullListen
    && review.listenedDurationMs + FULL_LISTEN_TOLERANCE_MS < candidate.durationMs
  ) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_FULL_LISTEN_REQUIRED");
  }
  const normalisedContexts = normaliseContexts(
    review.perspective,
    review.playbackContexts,
  );
  if (
    normalisedContexts.length !== review.playbackContexts.length
    || normalisedContexts.some(
      (context, index) => context !== review.playbackContexts[index],
    )
  ) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_CONTEXTS_NOT_CANONICAL");
  }
  if (
    review.decision !== "approve"
    && review.decision !== "changes-requested"
    && review.decision !== "reject"
  ) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_DECISION_INVALID");
  }
  assertScores(review.scores);
  requireNotes(review.notes, review.decision !== "approve");
  requireDate(review.decidedAt, "NARRATION_TAKE_REVIEW_DATE_INVALID");
  const { fingerprint, ...partial } = review;
  if (!HASH_PATTERN.test(fingerprint) || reviewFingerprint(partial) !== fingerprint) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_ENTRY_FINGERPRINT_INVALID");
  }
}

function latestReviewsForCandidate(
  session: NarrationTakeReviewSession,
  candidateTakeId: string,
): ReadonlyMap<NarrationTakeReviewPerspective, NarrationTakeReviewEntry> {
  const latest = new Map<NarrationTakeReviewPerspective, NarrationTakeReviewEntry>();
  for (const review of session.reviews) {
    if (review.candidateTakeId === candidateTakeId) latest.set(review.perspective, review);
  }
  return latest;
}

function minimumScore(review: NarrationTakeReviewEntry): number {
  return Math.min(...SCORE_KEYS.map((key) => review.scores[key]));
}

function candidateReady(
  session: NarrationTakeReviewSession,
  candidateTakeId: string,
): boolean {
  const latest = latestReviewsForCandidate(session, candidateTakeId);
  return session.policy.requiredPerspectives.every(
    (perspective) => latest.get(perspective)?.decision === "approve",
  )
    && session.policy.requiredPerspectives.every(
      (perspective) => minimumScore(latest.get(perspective)!)
        >= session.policy.minimumDimensionScore,
    )
    && new Set(
      session.policy.requiredPerspectives.map(
        (perspective) => latest.get(perspective)!.reviewerId,
      ),
    ).size === session.policy.requiredPerspectives.length;
}

function reviewCoverageComplete(session: NarrationTakeReviewSession): boolean {
  return session.candidates.every((candidate) => {
    const latest = latestReviewsForCandidate(session, candidate.audioCandidate.takeId!);
    return session.policy.requiredPerspectives.every((perspective) => latest.has(perspective));
  });
}

function matchedPanel(
  session: NarrationTakeReviewSession,
): ReadonlyMap<NarrationTakeReviewPerspective, string> | null {
  if (!reviewCoverageComplete(session)) return null;
  const first = session.candidates[0];
  if (!first) return null;
  const baseline = latestReviewsForCandidate(session, first.audioCandidate.takeId!);
  const panel = new Map<NarrationTakeReviewPerspective, string>();
  for (const perspective of session.policy.requiredPerspectives) {
    const reviewerId = baseline.get(perspective)?.reviewerId;
    if (!reviewerId) return null;
    if (
      session.candidates.some((candidate) =>
        latestReviewsForCandidate(session, candidate.audioCandidate.takeId!)
          .get(perspective)?.reviewerId !== reviewerId
      )
    ) {
      return null;
    }
    panel.set(perspective, reviewerId);
  }
  if (new Set(panel.values()).size !== session.policy.requiredPerspectives.length) {
    return null;
  }
  return panel;
}

function candidateComparativeScore(
  session: NarrationTakeReviewSession,
  candidateTakeId: string,
): number {
  const latest = latestReviewsForCandidate(session, candidateTakeId);
  const reviews = session.policy.requiredPerspectives.map((perspective) => latest.get(perspective));
  if (reviews.some((review) => !review)) return 0;
  const total = reviews.reduce((reviewTotal, review) =>
    reviewTotal + SCORE_KEYS.reduce(
      (scoreTotal, key) => scoreTotal + review!.scores[key],
      0,
    ), 0);
  return Number((total / (reviews.length * SCORE_KEYS.length)).toFixed(4));
}

function latestReviewSetFingerprint(session: NarrationTakeReviewSession): string {
  const fingerprints = session.candidates.flatMap((candidate) => {
    const latest = latestReviewsForCandidate(session, candidate.audioCandidate.takeId!);
    return session.policy.requiredPerspectives.map(
      (perspective) => latest.get(perspective)?.fingerprint ?? "missing",
    );
  });
  return stableHash([...fingerprints].sort((left, right) => left.localeCompare(right, "en-AU")));
}

function topReadyCandidateIds(session: NarrationTakeReviewSession): readonly string[] {
  const ranked = session.candidates
    .map((candidate) => ({
      takeId: candidate.audioCandidate.takeId!,
      ready: candidateReady(session, candidate.audioCandidate.takeId!),
      score: candidateComparativeScore(session, candidate.audioCandidate.takeId!),
    }))
    .filter((candidate) => candidate.ready);
  if (ranked.length === 0) return Object.freeze([]);
  const topScore = Math.max(...ranked.map((candidate) => candidate.score));
  return Object.freeze(
    ranked
      .filter((candidate) => candidate.score === topScore)
      .map((candidate) => candidate.takeId)
      .sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function statusFromState(
  session: Pick<
    NarrationTakeReviewSession,
    "candidates" | "reviews" | "policy" | "selection" | "approval"
  >,
): NarrationTakeReviewStatus {
  if (session.approval) return "approved";
  if (session.selection) return "ready-for-approval";
  const candidateSession = session as NarrationTakeReviewSession;
  if (
    reviewCoverageComplete(candidateSession)
    && matchedPanel(candidateSession)
    && topReadyCandidateIds(candidateSession).length > 0
  ) {
    return "ready-for-selection";
  }
  return "open";
}

function reviseSession(
  session: NarrationTakeReviewSession,
  updates: Partial<Pick<
    NarrationTakeReviewSession,
    "reviews" | "selection" | "approval" | "status"
  >>,
  at: Date,
): NarrationTakeReviewSession {
  assertNarrationTakeReviewSession(session);
  if (Number.isNaN(at.getTime()) || at.getTime() < Date.parse(session.updatedAt)) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_TRANSITION_TIME_REVERSED");
  }
  const { fingerprint: _fingerprint, previousFingerprint: _previous, ...base } = session;
  const partial: Omit<NarrationTakeReviewSession, "fingerprint"> = {
    ...base,
    ...updates,
    revision: session.revision + 1,
    previousFingerprint: session.fingerprint,
    createdAt: session.createdAt,
    updatedAt: at.toISOString(),
  };
  if (partial.selection === undefined) delete partial.selection;
  if (partial.approval === undefined) delete partial.approval;
  const next = Object.freeze({ ...partial, fingerprint: sessionFingerprint(partial) });
  assertNarrationTakeReviewSession(next);
  return next;
}

export function createNarrationTakeReviewSession(input: Readonly<{
  id: string;
  performanceContextFingerprint: string;
  policy: NarrationTakeReviewPolicy;
  candidates: readonly Readonly<{
    audioCandidate: ArtifactRecord;
    transcriptArtifact: ArtifactRecord;
    engineeringArtifact: ArtifactRecord;
    engineeringEvidence: AudioEngineeringEvidence;
  }>[];
  createdAt?: Date;
}>): NarrationTakeReviewSession {
  requireIdentifier(input.id, "NARRATION_TAKE_REVIEW_SESSION_ID_INVALID");
  requireHash(
    input.performanceContextFingerprint,
    "NARRATION_TAKE_REVIEW_PERFORMANCE_CONTEXT_INVALID",
  );
  const createdAt = input.createdAt ?? new Date();
  if (Number.isNaN(createdAt.getTime())) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_DATE_INVALID");
  }
  const policy = createNarrationTakeReviewPolicy(input.policy);
  if (
    !Array.isArray(input.candidates)
    || input.candidates.length < policy.minimumCandidateCount
    || input.candidates.length > policy.maximumCandidateCount
  ) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_CANDIDATE_COUNT_INVALID");
  }
  const candidates = input.candidates
    .map((value) => {
      const partial: Omit<NarrationTakeReviewCandidate, "fingerprint"> = {
        audioCandidate: value.audioCandidate,
        transcriptArtifact: value.transcriptArtifact,
        engineeringArtifact: value.engineeringArtifact,
        engineeringEvidence: value.engineeringEvidence,
        durationMs: Math.round(value.engineeringEvidence.probe.durationSeconds * 1_000),
      };
      const candidate = Object.freeze({ ...partial, fingerprint: candidateFingerprint(partial) });
      assertCandidate(candidate, createdAt);
      return candidate;
    })
    .sort((left, right) =>
      left.audioCandidate.takeId!.localeCompare(right.audioCandidate.takeId!, "en-AU")
    );
  const first = candidates[0]!;
  const firstAudio = first.audioCandidate;
  const manuscriptSourceHash = firstAudio.provenance.sourceContentHash;
  if (!manuscriptSourceHash) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_MANUSCRIPT_BINDING_REQUIRED");
  }
  const takeIds = new Set<string>();
  const artifactIds = new Set<string>();
  for (const candidate of candidates) {
    const audio = candidate.audioCandidate;
    if (takeIds.has(audio.takeId!) || artifactIds.has(audio.id)) {
      throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_CANDIDATE_DUPLICATE");
    }
    takeIds.add(audio.takeId!);
    artifactIds.add(audio.id);
    if (
      audio.projectId !== firstAudio.projectId
      || audio.segmentId !== firstAudio.segmentId
      || audio.provenance.sourceContentHash !== manuscriptSourceHash
      || audio.rights.rightsFingerprint !== firstAudio.rights.rightsFingerprint
      || candidate.engineeringEvidence.profile.fingerprint
        !== first.engineeringEvidence.profile.fingerprint
    ) {
      throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_CANDIDATE_SCOPE_MISMATCH");
    }
  }
  const partial: Omit<NarrationTakeReviewSession, "fingerprint"> = {
    schemaVersion: NARRATION_TAKE_REVIEW_SCHEMA_VERSION,
    id: input.id,
    projectId: firstAudio.projectId,
    segmentId: firstAudio.segmentId!,
    manuscriptSourceHash,
    performanceContextFingerprint: input.performanceContextFingerprint,
    rightsFingerprint: firstAudio.rights.rightsFingerprint,
    policy,
    candidates: Object.freeze(candidates),
    reviews: Object.freeze([]),
    status: "open",
    revision: 1,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
  };
  const session = Object.freeze({ ...partial, fingerprint: sessionFingerprint(partial) });
  assertNarrationTakeReviewSession(session);
  return session;
}

export function recordNarrationTakeReview(
  session: NarrationTakeReviewSession,
  input: Readonly<{
    id: string;
    candidateTakeId: string;
    perspective: NarrationTakeReviewPerspective;
    reviewerId: string;
    blind: true;
    listenedDurationMs: number;
    playbackContexts: readonly NarrationTakePlaybackContext[];
    decision: NarrationTakeReviewDecision;
    scores: NarrationTakeReviewScores;
    notes?: string;
    decidedAt?: Date;
  }>,
): NarrationTakeReviewSession {
  assertNarrationTakeReviewSession(session);
  if (session.status === "approved") {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_APPROVED_IMMUTABLE");
  }
  if (session.reviews.some((review) => review.id === input.id)) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_ID_DUPLICATE");
  }
  const candidate = session.candidates.find(
    (value) => value.audioCandidate.takeId === input.candidateTakeId,
  );
  if (!candidate) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_CANDIDATE_NOT_FOUND");
  }
  const reviewerId = requireHuman(
    input.reviewerId,
    "NARRATION_TAKE_REVIEW_REVIEWER_INVALID",
  );
  const latest = latestReviewsForCandidate(session, input.candidateTakeId);
  for (const [perspective, review] of latest) {
    if (perspective !== input.perspective && review.reviewerId === reviewerId) {
      throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_PERSPECTIVE_INDEPENDENCE_REQUIRED");
    }
  }
  const decidedAt = input.decidedAt ?? new Date();
  if (Number.isNaN(decidedAt.getTime()) || decidedAt.getTime() < Date.parse(session.updatedAt)) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_DATE_INVALID");
  }
  const notes = requireNotes(input.notes, input.decision !== "approve");
  const partial: Omit<NarrationTakeReviewEntry, "fingerprint"> = {
    id: requireIdentifier(input.id, "NARRATION_TAKE_REVIEW_ID_INVALID"),
    candidateTakeId: input.candidateTakeId,
    perspective: input.perspective,
    reviewerId,
    blind: input.blind,
    listenedDurationMs: input.listenedDurationMs,
    playbackContexts: normaliseContexts(input.perspective, input.playbackContexts),
    decision: input.decision,
    scores: freezeScores(input.scores),
    ...(notes ? { notes } : {}),
    decidedAt: decidedAt.toISOString(),
  };
  const review = Object.freeze({ ...partial, fingerprint: reviewFingerprint(partial) });
  assertReview(review, candidate, session.policy);
  const reviews = Object.freeze([...session.reviews, review]);
  const draft: NarrationTakeReviewSession = {
    ...session,
    reviews,
    selection: undefined,
    approval: undefined,
    status: "open",
  };
  return reviseSession(
    session,
    {
      reviews,
      selection: undefined,
      approval: undefined,
      status: statusFromState(draft),
    },
    decidedAt,
  );
}

export function selectNarrationTake(
  session: NarrationTakeReviewSession,
  input: Readonly<{
    candidateTakeId: string;
    selectedByActorId: string;
    selectedAt?: Date;
  }>,
): NarrationTakeReviewSession {
  assertNarrationTakeReviewSession(session);
  if (session.status === "approved") {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_APPROVED_IMMUTABLE");
  }
  if (!reviewCoverageComplete(session)) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_COVERAGE_INCOMPLETE");
  }
  if (!matchedPanel(session)) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_PANEL_MISMATCH");
  }
  const candidate = session.candidates.find(
    (value) => value.audioCandidate.takeId === input.candidateTakeId,
  );
  if (!candidate) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_CANDIDATE_NOT_FOUND");
  }
  if (!candidateReady(session, input.candidateTakeId)) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_CANDIDATE_NOT_READY");
  }
  if (!topReadyCandidateIds(session).includes(input.candidateTakeId)) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_CANDIDATE_NOT_TOP_RATED");
  }
  const selectedByActorId = requireHuman(
    input.selectedByActorId,
    "NARRATION_TAKE_REVIEW_SELECTOR_INVALID",
  );
  if (decisionActorConflicts(session, selectedByActorId)) {
    throw new NarrationTakeReviewError(
      "NARRATION_TAKE_REVIEW_SELECTOR_INDEPENDENCE_REQUIRED",
    );
  }
  const selectedAt = input.selectedAt ?? new Date();
  if (Number.isNaN(selectedAt.getTime()) || selectedAt.getTime() < Date.parse(session.updatedAt)) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_SELECTION_DATE_INVALID");
  }
  const partial: Omit<NarrationTakeSelection, "fingerprint"> = {
    candidateTakeId: input.candidateTakeId,
    selectedByActorId,
    selectedAt: selectedAt.toISOString(),
    comparativeScore: candidateComparativeScore(session, input.candidateTakeId),
    reviewSetFingerprint: latestReviewSetFingerprint(session),
  };
  const selection = Object.freeze({ ...partial, fingerprint: selectionFingerprint(partial) });
  return reviseSession(
    session,
    { selection, approval: undefined, status: "ready-for-approval" },
    selectedAt,
  );
}

export function approveNarrationTakeSelection(
  session: NarrationTakeReviewSession,
  input: Readonly<{
    finalConfirmationId: string;
    approvedByActorId: string;
    humanConfirmation: true;
    approvedAt?: Date;
  }>,
): ApprovedNarrationTakeSelection {
  assertNarrationTakeReviewSession(session);
  if (session.status === "approved") {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_APPROVED_IMMUTABLE");
  }
  if (input.humanConfirmation !== true) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_HUMAN_CONFIRMATION_REQUIRED");
  }
  if (!session.selection || session.status !== "ready-for-approval") {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_NOT_READY_FOR_APPROVAL");
  }
  if (
    session.selection.reviewSetFingerprint !== latestReviewSetFingerprint(session)
    || !topReadyCandidateIds(session).includes(session.selection.candidateTakeId)
  ) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_SELECTION_STALE");
  }
  const candidate = session.candidates.find(
    (value) => value.audioCandidate.takeId === session.selection!.candidateTakeId,
  );
  if (!candidate) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_CANDIDATE_NOT_FOUND");
  }
  const approvedAt = input.approvedAt ?? new Date();
  if (Number.isNaN(approvedAt.getTime()) || approvedAt.getTime() < Date.parse(session.updatedAt)) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_APPROVAL_DATE_INVALID");
  }
  const approvedByActorId = requireHuman(
    input.approvedByActorId,
    "NARRATION_TAKE_REVIEW_APPROVER_INVALID",
  );
  if (decisionActorConflicts(session, approvedByActorId)) {
    throw new NarrationTakeReviewError(
      "NARRATION_TAKE_REVIEW_APPROVER_INDEPENDENCE_REQUIRED",
    );
  }
  for (const artifact of [
    candidate.audioCandidate,
    candidate.transcriptArtifact,
    candidate.engineeringArtifact,
  ]) {
    requireRightsAvailable(artifact, approvedAt);
  }
  let approvedAudio: ArtifactRecord;
  try {
    approvedAudio = recordArtifactReview(candidate.audioCandidate, {
      decision: "approved",
      reviewerId: approvedByActorId,
      notes: `Approved by narration take review ${session.id} at selection ${session.selection.fingerprint}.`,
      decidedAt: approvedAt,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "NARRATION_TAKE_REVIEW_ARTIFACT_APPROVAL_FAILED";
    throw new NarrationTakeReviewError(code);
  }
  const partial: Omit<NarrationTakeApproval, "fingerprint"> = {
    finalConfirmationId: requireIdentifier(
      input.finalConfirmationId,
      "NARRATION_TAKE_REVIEW_CONFIRMATION_ID_INVALID",
    ),
    approvedByActorId,
    approvedAt: approvedAt.toISOString(),
    selectionFingerprint: session.selection.fingerprint,
    approvedArtifactFingerprint: approvedAudio.fingerprint,
    approvedArtifactRevision: approvedAudio.revision,
  };
  const approval = Object.freeze({ ...partial, fingerprint: approvalFingerprint(partial) });
  const approvedSession = reviseSession(
    session,
    { approval, status: "approved" },
    approvedAt,
  );
  assertApprovedNarrationTakeSelection(approvedSession, approvedAudio);
  return Object.freeze({ session: approvedSession, audioCandidate: approvedAudio });
}

export function assertApprovedNarrationTakeSelection(
  session: NarrationTakeReviewSession,
  audioCandidate: ArtifactRecord,
): NarrationTakeReviewCandidate {
  assertNarrationTakeReviewSession(session);
  assertArtifactRecord(audioCandidate);
  if (session.status !== "approved" || !session.selection || !session.approval) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_APPROVED_SELECTION_REQUIRED");
  }
  const candidate = session.candidates.find(
    (value) => value.audioCandidate.takeId === session.selection!.candidateTakeId,
  );
  if (!candidate || candidate.audioCandidate.id !== audioCandidate.id) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_APPROVED_ARTIFACT_MISMATCH");
  }
  if (
    audioCandidate.previousFingerprint !== candidate.audioCandidate.fingerprint
    || audioCandidate.fingerprint !== session.approval.approvedArtifactFingerprint
    || audioCandidate.revision !== session.approval.approvedArtifactRevision
    || audioCandidate.review.status !== "approved"
    || audioCandidate.review.reviewerId !== session.approval.approvedByActorId
    || audioCandidate.review.decidedAt !== session.approval.approvedAt
  ) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_APPROVED_ARTIFACT_MISMATCH");
  }
  if (
    audioCandidate.projectId !== session.projectId
    || audioCandidate.segmentId !== session.segmentId
    || audioCandidate.provenance.sourceContentHash !== session.manuscriptSourceHash
    || audioCandidate.rights.rightsFingerprint !== session.rightsFingerprint
  ) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_APPROVED_SCOPE_MISMATCH");
  }
  return candidate;
}

export function assertNarrationTakeReviewSession(
  session: NarrationTakeReviewSession,
): void {
  if (session.schemaVersion !== NARRATION_TAKE_REVIEW_SCHEMA_VERSION) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_SCHEMA_UNSUPPORTED");
  }
  for (const [value, code] of [
    [session.id, "NARRATION_TAKE_REVIEW_SESSION_ID_INVALID"],
    [session.projectId, "NARRATION_TAKE_REVIEW_PROJECT_ID_INVALID"],
    [session.segmentId, "NARRATION_TAKE_REVIEW_SEGMENT_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  for (const [value, code] of [
    [session.manuscriptSourceHash, "NARRATION_TAKE_REVIEW_MANUSCRIPT_HASH_INVALID"],
    [session.performanceContextFingerprint, "NARRATION_TAKE_REVIEW_PERFORMANCE_CONTEXT_INVALID"],
    [session.rightsFingerprint, "NARRATION_TAKE_REVIEW_RIGHTS_FINGERPRINT_INVALID"],
  ] as const) requireHash(value, code);
  const policy = createNarrationTakeReviewPolicy(session.policy);
  if (policy.fingerprint !== session.policy.fingerprint) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_POLICY_FINGERPRINT_INVALID");
  }
  if (
    !Array.isArray(session.candidates)
    || session.candidates.length < policy.minimumCandidateCount
    || session.candidates.length > policy.maximumCandidateCount
  ) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_CANDIDATE_COUNT_INVALID");
  }
  const validationNow = new Date(session.createdAt);
  const candidateTakeIds = session.candidates.map(
    (candidate) => candidate.audioCandidate.takeId ?? "",
  );
  const canonicalTakeIds = [...candidateTakeIds]
    .sort((left, right) => left.localeCompare(right, "en-AU"));
  if (candidateTakeIds.some((takeId, index) => takeId !== canonicalTakeIds[index])) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_CANDIDATES_NOT_CANONICAL");
  }
  const expectedEngineeringProfileFingerprint =
    session.candidates[0]?.engineeringEvidence.profile.fingerprint;
  const candidates = new Map<string, NarrationTakeReviewCandidate>();
  const artifactIds = new Set<string>();
  for (const candidate of session.candidates) {
    assertCandidate(candidate, validationNow);
    const takeId = candidate.audioCandidate.takeId!;
    if (candidates.has(takeId) || artifactIds.has(candidate.audioCandidate.id)) {
      throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_CANDIDATE_DUPLICATE");
    }
    candidates.set(takeId, candidate);
    artifactIds.add(candidate.audioCandidate.id);
    if (
      candidate.audioCandidate.projectId !== session.projectId
      || candidate.audioCandidate.segmentId !== session.segmentId
      || candidate.audioCandidate.provenance.sourceContentHash !== session.manuscriptSourceHash
      || candidate.audioCandidate.rights.rightsFingerprint !== session.rightsFingerprint
      || candidate.engineeringEvidence.profile.fingerprint
        !== expectedEngineeringProfileFingerprint
    ) {
      throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_CANDIDATE_SCOPE_MISMATCH");
    }
  }
  const reviewIds = new Set<string>();
  let latestTransition = Date.parse(session.createdAt);
  for (const review of session.reviews) {
    const candidate = candidates.get(review.candidateTakeId);
    if (!candidate) {
      throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_CANDIDATE_NOT_FOUND");
    }
    if (reviewIds.has(review.id)) {
      throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_ID_DUPLICATE");
    }
    reviewIds.add(review.id);
    assertReview(review, candidate, session.policy);
    const decidedAt = Date.parse(review.decidedAt);
    if (decidedAt < latestTransition) {
      throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_TRANSITION_TIME_REVERSED");
    }
    latestTransition = decidedAt;
  }
  if (session.selection) {
    const candidate = candidates.get(session.selection.candidateTakeId);
    if (!candidate) {
      throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_SELECTION_INVALID");
    }
    requireHuman(
      session.selection.selectedByActorId,
      "NARRATION_TAKE_REVIEW_SELECTOR_INVALID",
    );
    if (decisionActorConflicts(session, session.selection.selectedByActorId)) {
      throw new NarrationTakeReviewError(
        "NARRATION_TAKE_REVIEW_SELECTOR_INDEPENDENCE_REQUIRED",
      );
    }
    requireDate(session.selection.selectedAt, "NARRATION_TAKE_REVIEW_SELECTION_DATE_INVALID");
    requireFinite(
      session.selection.comparativeScore,
      1,
      5,
      "NARRATION_TAKE_REVIEW_SELECTION_SCORE_INVALID",
    );
    if (
      !reviewCoverageComplete(session)
      || !matchedPanel(session)
      || !candidateReady(session, session.selection.candidateTakeId)
      || !topReadyCandidateIds(session).includes(session.selection.candidateTakeId)
      || session.selection.comparativeScore
        !== candidateComparativeScore(session, session.selection.candidateTakeId)
      || session.selection.reviewSetFingerprint !== latestReviewSetFingerprint(session)
    ) {
      throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_SELECTION_STALE");
    }
    const { fingerprint, ...partial } = session.selection;
    if (!HASH_PATTERN.test(fingerprint) || selectionFingerprint(partial) !== fingerprint) {
      throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_SELECTION_FINGERPRINT_INVALID");
    }
    latestTransition = Math.max(latestTransition, Date.parse(session.selection.selectedAt));
  }
  if (session.approval) {
    if (!session.selection) {
      throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_SELECTION_REQUIRED");
    }
    requireIdentifier(
      session.approval.finalConfirmationId,
      "NARRATION_TAKE_REVIEW_CONFIRMATION_ID_INVALID",
    );
    requireHuman(
      session.approval.approvedByActorId,
      "NARRATION_TAKE_REVIEW_APPROVER_INVALID",
    );
    if (decisionActorConflicts(session, session.approval.approvedByActorId)) {
      throw new NarrationTakeReviewError(
        "NARRATION_TAKE_REVIEW_APPROVER_INDEPENDENCE_REQUIRED",
      );
    }
    requireDate(session.approval.approvedAt, "NARRATION_TAKE_REVIEW_APPROVAL_DATE_INVALID");
    const approvedCandidate = candidates.get(session.selection.candidateTakeId)!;
    for (const artifact of [
      approvedCandidate.audioCandidate,
      approvedCandidate.transcriptArtifact,
      approvedCandidate.engineeringArtifact,
    ]) {
      requireRightsAvailable(artifact, new Date(session.approval.approvedAt));
    }
    requireHash(
      session.approval.approvedArtifactFingerprint,
      "NARRATION_TAKE_REVIEW_APPROVED_ARTIFACT_FINGERPRINT_INVALID",
    );
    requireInteger(
      session.approval.approvedArtifactRevision,
      2,
      Number.MAX_SAFE_INTEGER,
      "NARRATION_TAKE_REVIEW_APPROVED_ARTIFACT_REVISION_INVALID",
    );
    if (session.approval.selectionFingerprint !== session.selection.fingerprint) {
      throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_APPROVAL_SELECTION_MISMATCH");
    }
    const { fingerprint, ...partial } = session.approval;
    if (!HASH_PATTERN.test(fingerprint) || approvalFingerprint(partial) !== fingerprint) {
      throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_APPROVAL_FINGERPRINT_INVALID");
    }
    latestTransition = Math.max(latestTransition, Date.parse(session.approval.approvedAt));
  }
  const expectedStatus = statusFromState(session);
  if (session.status !== expectedStatus) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_STATUS_MISMATCH");
  }
  requireDate(session.createdAt, "NARRATION_TAKE_REVIEW_DATE_INVALID");
  requireDate(session.updatedAt, "NARRATION_TAKE_REVIEW_DATE_INVALID");
  if (Date.parse(session.updatedAt) < latestTransition) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_DATE_INVALID");
  }
  requireInteger(
    session.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "NARRATION_TAKE_REVIEW_REVISION_INVALID",
  );
  if (session.revision === 1 && session.previousFingerprint !== undefined) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_REVISION_CHAIN_INVALID");
  }
  if (session.revision > 1) {
    requireHash(
      session.previousFingerprint ?? "",
      "NARRATION_TAKE_REVIEW_REVISION_CHAIN_INVALID",
    );
  }
  const { fingerprint, ...partial } = session;
  if (!HASH_PATTERN.test(fingerprint) || sessionFingerprint(partial) !== fingerprint) {
    throw new NarrationTakeReviewError("NARRATION_TAKE_REVIEW_SESSION_FINGERPRINT_INVALID");
  }
}

export function narrationTakeReviewPublicView(
  session: NarrationTakeReviewSession,
): NarrationTakeReviewPublicView {
  assertNarrationTakeReviewSession(session);
  return Object.freeze({
    id: session.id,
    candidateCount: session.candidates.length,
    reviewedCandidateCount: new Set(
      session.reviews.map((review) => review.candidateTakeId),
    ).size,
    completePanel: Boolean(matchedPanel(session)),
    selected: Boolean(session.selection),
    ...(session.selection
      ? { selectedComparativeScore: session.selection.comparativeScore }
      : {}),
    status: session.status,
    policyId: session.policy.id,
    policyVersion: session.policy.version,
    revision: session.revision,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    fingerprint: session.fingerprint,
  });
}

function payload(session: NarrationTakeReviewSession): Record<string, unknown> {
  return session as unknown as Record<string, unknown>;
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<NarrationTakeReviewSession> {
  const session = envelope.payload as unknown as NarrationTakeReviewSession;
  assertNarrationTakeReviewSession(session);
  if (
    envelope.entityType !== ENTITY_TYPE
    || envelope.entityId !== session.id
    || envelope.revision !== session.revision
  ) {
    throw new NarrationTakeReviewStoreConflictError(
      "NARRATION_TAKE_REVIEW_STORE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<NarrationTakeReviewSession>;
}

export class FileNarrationTakeReviewStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    session: NarrationTakeReviewSession,
    actorId: string,
  ): Promise<StoredEnvelope<NarrationTakeReviewSession>> {
    assertNarrationTakeReviewSession(session);
    requireHuman(actorId, "NARRATION_TAKE_REVIEW_ACTOR_INVALID");
    const existing = await this.read(session.id);
    if (existing) {
      if (existing.payload.fingerprint === session.fingerprint) return existing;
      throw new NarrationTakeReviewStoreConflictError(
        "NARRATION_TAKE_REVIEW_IDEMPOTENCY_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.create(
        ENTITY_TYPE,
        session.id,
        payload(session),
        new Date(session.createdAt),
      ));
      await this.#audit(actorId, "narration_take_review.created", envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new NarrationTakeReviewStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(id: string): Promise<StoredEnvelope<NarrationTakeReviewSession> | null> {
    requireIdentifier(id, "NARRATION_TAKE_REVIEW_SESSION_ID_INVALID");
    const envelope = await this.#store.read<Record<string, unknown>>(ENTITY_TYPE, id);
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(id: string): Promise<StoredEnvelope<NarrationTakeReviewSession>> {
    const envelope = await this.read(id);
    if (!envelope) {
      throw new NarrationTakeReviewStoreConflictError("NARRATION_TAKE_REVIEW_NOT_FOUND");
    }
    return envelope;
  }

  async save(
    session: NarrationTakeReviewSession,
    input: Readonly<{ expectedRevision: number; actorId: string; action: string }>,
  ): Promise<StoredEnvelope<NarrationTakeReviewSession>> {
    assertNarrationTakeReviewSession(session);
    requireHuman(input.actorId, "NARRATION_TAKE_REVIEW_ACTOR_INVALID");
    if (!/^narration_take_review\.[a-z][a-z0-9._-]{1,80}$/u.test(input.action)) {
      throw new NarrationTakeReviewStoreConflictError(
        "NARRATION_TAKE_REVIEW_ACTION_INVALID",
      );
    }
    const current = await this.require(session.id);
    if (
      current.revision !== input.expectedRevision
      || session.revision !== current.payload.revision + 1
      || session.previousFingerprint !== current.payload.fingerprint
    ) {
      throw new NarrationTakeReviewStoreConflictError(
        "NARRATION_TAKE_REVIEW_REVISION_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.replace(
        ENTITY_TYPE,
        session.id,
        input.expectedRevision,
        payload(session),
        new Date(session.updatedAt),
      ));
      await this.#audit(input.actorId, input.action, envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new NarrationTakeReviewStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async #audit(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<NarrationTakeReviewSession>,
  ): Promise<void> {
    await this.#store.appendAuditEvent({
      actorId,
      action,
      entityType: ENTITY_TYPE,
      entityId: envelope.entityId,
      revision: envelope.revision,
      occurredAt: new Date(envelope.savedAt),
      metadata: {
        candidateCount: envelope.payload.candidates.length,
        reviewedCandidateCount: new Set(
          envelope.payload.reviews.map((review) => review.candidateTakeId),
        ).size,
        selected: Boolean(envelope.payload.selection),
        approved: envelope.payload.status === "approved",
        status: envelope.payload.status,
      },
    });
  }
}
