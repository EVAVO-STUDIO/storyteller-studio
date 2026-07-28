import {
  recordArtifactReview,
  type ArtifactRecord,
} from "./artifact-registry.js";
import {
  assertAudiobookReferenceMasterChain,
  type AudiobookReferenceMasterChain,
} from "./audiobook-reference-master.js";
import {
  assertAudiobookSequence,
  type AudiobookSequence,
} from "./audiobook-sequence.js";
import { stableHash } from "./index.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";

export const AUDIOBOOK_REFERENCE_MASTER_REVIEW_SCHEMA_VERSION =
  "storyteller-audiobook-reference-master-review-v1" as const;
export const AUDIOBOOK_REFERENCE_MASTER_REVIEW_ENTITY_TYPE =
  "audiobook-reference-master-review" as const;

export type AudiobookReferenceMasterReviewRole = "editorial" | "engineering";
export type AudiobookReferenceMasterPlaybackContext =
  | "studio-headphones"
  | "consumer-headphones"
  | "speakers"
  | "mobile-device";
export type AudiobookReferenceMasterReviewDecision =
  | "approve"
  | "changes-requested";
export type AudiobookReferenceMasterReviewStatus =
  | "open"
  | "changes-requested"
  | "ready-for-approval"
  | "approved";

export interface AudiobookReferenceMasterReviewScores {
  narrativeContinuity: number;
  sustainedListenability: number;
  chapterOrderAndLabelling: number;
  creditAccuracy: number;
  transitionIntegrity: number;
  silenceAndBoundaryIntegrity: number;
  tonalAndLoudnessConsistency: number;
  freedomFromTechnicalDefects: number;
}

export interface AudiobookReferenceMasterReviewEntry {
  id: string;
  role: AudiobookReferenceMasterReviewRole;
  reviewerId: string;
  completeListenConfirmed: true;
  listenedDurationMs: number;
  componentCountReviewed: number;
  boundaryCountReviewed: number;
  playbackContexts: readonly AudiobookReferenceMasterPlaybackContext[];
  decision: AudiobookReferenceMasterReviewDecision;
  scores: AudiobookReferenceMasterReviewScores;
  findingCodes: readonly string[];
  notes?: string;
  decidedAt: string;
  fingerprint: string;
}

export interface AudiobookReferenceMasterReviewApproval {
  finalConfirmationId: string;
  approvedByActorId: string;
  approvedAt: string;
  reviewerSetFingerprint: string;
  artifactReviewFingerprint: string;
  approvedArtifactRevision: number;
  approvedArtifactFingerprint: string;
  fingerprint: string;
}

export interface AudiobookReferenceMasterReviewSession {
  schemaVersion: typeof AUDIOBOOK_REFERENCE_MASTER_REVIEW_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  chainFingerprint: string;
  sequence: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
    componentCount: number;
    chapterCount: number;
    totalDurationMs: number;
  }>;
  referenceArtifact: Readonly<{
    id: string;
    kind: "audiobook-reference-master";
    revision: number;
    fingerprint: string;
    contentHash: string;
    byteCount: number;
  }>;
  durationMs: number;
  boundaryCount: number;
  requiredRoles: readonly AudiobookReferenceMasterReviewRole[];
  reviews: readonly AudiobookReferenceMasterReviewEntry[];
  status: AudiobookReferenceMasterReviewStatus;
  approval?: AudiobookReferenceMasterReviewApproval;
  revision: number;
  previousFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface AudiobookReferenceMasterReviewPublicView {
  id: string;
  bookId: string;
  referenceArtifactId: string;
  referenceArtifactRevision: number;
  durationMs: number;
  componentCount: number;
  chapterCount: number;
  boundaryCount: number;
  requiredRoles: readonly AudiobookReferenceMasterReviewRole[];
  reviewCount: number;
  latestDecisions: Readonly<Record<
    AudiobookReferenceMasterReviewRole,
    AudiobookReferenceMasterReviewDecision | "pending"
  >>;
  playbackContexts: readonly AudiobookReferenceMasterPlaybackContext[];
  scoreAverages: AudiobookReferenceMasterReviewScores | null;
  findingCodes: readonly string[];
  status: AudiobookReferenceMasterReviewStatus;
  readyForApproval: boolean;
  approvedAt?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface AudiobookReferenceMasterReviewApprovalResult {
  session: AudiobookReferenceMasterReviewSession;
  artifact: ArtifactRecord;
}

export class AudiobookReferenceMasterReviewError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookReferenceMasterReviewError";
    this.code = code;
  }
}

export class AudiobookReferenceMasterReviewStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudiobookReferenceMasterReviewStoreConflictError";
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const FINDING_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,95}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const HUMAN_BLOCKLIST = /^(?:system|worker|automation|automated|bot)(?:[_-]|$)/iu;
const REQUIRED_ROLES = Object.freeze([
  "editorial",
  "engineering",
] as const satisfies readonly AudiobookReferenceMasterReviewRole[]);
const REQUIRED_PLAYBACK_CONTEXTS = Object.freeze([
  "consumer-headphones",
  "speakers",
  "studio-headphones",
] as const satisfies readonly AudiobookReferenceMasterPlaybackContext[]);
const PLAYBACK_CONTEXTS: ReadonlySet<AudiobookReferenceMasterPlaybackContext> =
  new Set([
    "studio-headphones",
    "consumer-headphones",
    "speakers",
    "mobile-device",
  ]);
const SCORE_KEYS = Object.freeze([
  "narrativeContinuity",
  "sustainedListenability",
  "chapterOrderAndLabelling",
  "creditAccuracy",
  "transitionIntegrity",
  "silenceAndBoundaryIntegrity",
  "tonalAndLoudnessConsistency",
  "freedomFromTechnicalDefects",
] as const satisfies readonly (keyof AudiobookReferenceMasterReviewScores)[]);
const FULL_LISTEN_TOLERANCE_MS = 2_000;
const MAX_DURATION_MS = 15 * 24 * 60 * 60 * 1_000;
const MAX_REVIEW_ENTRIES = 100;
const MAX_NOTES_LENGTH = 8_000;
const MAX_FINDING_CODES = 100;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookReferenceMasterReviewError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookReferenceMasterReviewError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookReferenceMasterReviewError(code);
  }
  return value;
}

function requireHumanActor(value: string, code: string): string {
  requireIdentifier(value, code);
  if (HUMAN_BLOCKLIST.test(value)) {
    throw new AudiobookReferenceMasterReviewError(code);
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
    throw new AudiobookReferenceMasterReviewError(code);
  }
  return value;
}

function requireNotes(
  value: string | undefined,
  required: boolean,
): string | undefined {
  if (value === undefined) {
    if (required) {
      throw new AudiobookReferenceMasterReviewError(
        "AUDIOBOOK_REFERENCE_REVIEW_NOTES_REQUIRED",
      );
    }
    return undefined;
  }
  const trimmed = value.trim();
  if (
    !trimmed
    || trimmed.length > MAX_NOTES_LENGTH
    || CONTROL_CHARACTERS.test(trimmed)
  ) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_NOTES_INVALID",
    );
  }
  return trimmed;
}

function assertScores(scores: AudiobookReferenceMasterReviewScores): void {
  for (const key of SCORE_KEYS) {
    const value = scores[key];
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new AudiobookReferenceMasterReviewError(
        "AUDIOBOOK_REFERENCE_REVIEW_SCORE_INVALID",
      );
    }
  }
}

function freezeScores(
  scores: AudiobookReferenceMasterReviewScores,
): AudiobookReferenceMasterReviewScores {
  assertScores(scores);
  return Object.freeze({ ...scores });
}

function normaliseContexts(
  role: AudiobookReferenceMasterReviewRole,
  contexts: readonly AudiobookReferenceMasterPlaybackContext[],
): readonly AudiobookReferenceMasterPlaybackContext[] {
  if (!REQUIRED_ROLES.includes(role)) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_ROLE_INVALID",
    );
  }
  if (!Array.isArray(contexts) || contexts.length === 0 || contexts.length > 4) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_PLAYBACK_CONTEXTS_INVALID",
    );
  }
  const unique = new Set<AudiobookReferenceMasterPlaybackContext>();
  for (const context of contexts) {
    if (!PLAYBACK_CONTEXTS.has(context) || unique.has(context)) {
      throw new AudiobookReferenceMasterReviewError(
        "AUDIOBOOK_REFERENCE_REVIEW_PLAYBACK_CONTEXTS_INVALID",
      );
    }
    unique.add(context);
  }
  if (role === "engineering" && !unique.has("studio-headphones")) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_ENGINEERING_STUDIO_CONTEXT_REQUIRED",
    );
  }
  if (
    role === "editorial"
    && !unique.has("consumer-headphones")
    && !unique.has("speakers")
    && !unique.has("mobile-device")
  ) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_EDITORIAL_CONSUMER_CONTEXT_REQUIRED",
    );
  }
  return Object.freeze(
    [...unique].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function normaliseFindingCodes(
  decision: AudiobookReferenceMasterReviewDecision,
  codes: readonly string[] | undefined,
): readonly string[] {
  const values = codes ?? [];
  if (!Array.isArray(values) || values.length > MAX_FINDING_CODES) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_FINDING_CODES_INVALID",
    );
  }
  const unique = new Set<string>();
  for (const code of values) {
    if (!FINDING_CODE_PATTERN.test(code) || unique.has(code)) {
      throw new AudiobookReferenceMasterReviewError(
        "AUDIOBOOK_REFERENCE_REVIEW_FINDING_CODES_INVALID",
      );
    }
    unique.add(code);
  }
  if (decision === "approve" && unique.size > 0) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_APPROVAL_FINDINGS_FORBIDDEN",
    );
  }
  if (decision === "changes-requested" && unique.size === 0) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_CHANGE_FINDINGS_REQUIRED",
    );
  }
  return Object.freeze(
    [...unique].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function reviewFingerprint(
  review: Omit<AudiobookReferenceMasterReviewEntry, "fingerprint">,
): string {
  return stableHash(review);
}

function approvalFingerprint(
  approval: Omit<AudiobookReferenceMasterReviewApproval, "fingerprint">,
): string {
  return stableHash(approval);
}

function sessionFingerprint(
  session: Omit<AudiobookReferenceMasterReviewSession, "fingerprint">,
): string {
  return stableHash(session);
}

function latestReviews(
  session: Pick<AudiobookReferenceMasterReviewSession, "reviews">,
): ReadonlyMap<
  AudiobookReferenceMasterReviewRole,
  AudiobookReferenceMasterReviewEntry
> {
  const result = new Map<
    AudiobookReferenceMasterReviewRole,
    AudiobookReferenceMasterReviewEntry
  >();
  for (const review of session.reviews) result.set(review.role, review);
  return result;
}

function minimumScore(review: AudiobookReferenceMasterReviewEntry): number {
  return Math.min(...SCORE_KEYS.map((key) => review.scores[key]));
}

function aggregatePlaybackContexts(
  reviews: Iterable<AudiobookReferenceMasterReviewEntry>,
): ReadonlySet<AudiobookReferenceMasterPlaybackContext> {
  const contexts = new Set<AudiobookReferenceMasterPlaybackContext>();
  for (const review of reviews) {
    for (const context of review.playbackContexts) contexts.add(context);
  }
  return contexts;
}

function hasRequiredPlaybackCoverage(
  reviews: Iterable<AudiobookReferenceMasterReviewEntry>,
): boolean {
  const contexts = aggregatePlaybackContexts(reviews);
  return REQUIRED_PLAYBACK_CONTEXTS.every((context) => contexts.has(context));
}

function reviewerSetFingerprint(
  reviews: ReadonlyMap<
    AudiobookReferenceMasterReviewRole,
    AudiobookReferenceMasterReviewEntry
  >,
): string {
  const editorial = reviews.get("editorial");
  const engineering = reviews.get("engineering");
  if (!editorial || !engineering) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_REVIEWER_SET_INCOMPLETE",
    );
  }
  return stableHash({
    editorial: editorial.reviewerId,
    engineering: engineering.reviewerId,
  });
}

function statusFromReviews(
  reviews: readonly AudiobookReferenceMasterReviewEntry[],
): Exclude<AudiobookReferenceMasterReviewStatus, "approved"> {
  const latest = latestReviews({ reviews });
  if (
    [...latest.values()].some(
      (review) => review.decision === "changes-requested",
    )
  ) {
    return "changes-requested";
  }
  const roleReviews = REQUIRED_ROLES.map((role) => latest.get(role));
  if (
    roleReviews.every((review) => review?.decision === "approve")
    && roleReviews.every((review) => minimumScore(review!) >= 4)
    && roleReviews.every((review) => review!.findingCodes.length === 0)
    && new Set(roleReviews.map((review) => review!.reviewerId)).size
      === REQUIRED_ROLES.length
    && hasRequiredPlaybackCoverage(roleReviews as AudiobookReferenceMasterReviewEntry[])
  ) {
    return "ready-for-approval";
  }
  return "open";
}

function assertReview(
  review: AudiobookReferenceMasterReviewEntry,
  session: Pick<
    AudiobookReferenceMasterReviewSession,
    "durationMs" | "sequence" | "boundaryCount"
  >,
): void {
  requireIdentifier(review.id, "AUDIOBOOK_REFERENCE_REVIEW_ENTRY_ID_INVALID");
  if (!REQUIRED_ROLES.includes(review.role)) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_ROLE_INVALID",
    );
  }
  requireHumanActor(
    review.reviewerId,
    "AUDIOBOOK_REFERENCE_REVIEW_REVIEWER_INVALID",
  );
  if (review.completeListenConfirmed !== true) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_COMPLETE_LISTEN_REQUIRED",
    );
  }
  requireInteger(
    review.listenedDurationMs,
    Math.max(1, session.durationMs - FULL_LISTEN_TOLERANCE_MS),
    session.durationMs * 2 + 30 * 60_000,
    "AUDIOBOOK_REFERENCE_REVIEW_LISTEN_DURATION_INVALID",
  );
  if (review.componentCountReviewed !== session.sequence.componentCount) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_COMPONENT_COVERAGE_MISMATCH",
    );
  }
  if (review.boundaryCountReviewed !== session.boundaryCount) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_BOUNDARY_COVERAGE_MISMATCH",
    );
  }
  normaliseContexts(review.role, review.playbackContexts);
  if (
    review.decision !== "approve"
    && review.decision !== "changes-requested"
  ) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_DECISION_INVALID",
    );
  }
  assertScores(review.scores);
  normaliseFindingCodes(review.decision, review.findingCodes);
  requireNotes(review.notes, review.decision === "changes-requested");
  requireDate(review.decidedAt, "AUDIOBOOK_REFERENCE_REVIEW_DATE_INVALID");
  const { fingerprint, ...partial } = review;
  if (reviewFingerprint(partial) !== fingerprint) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_ENTRY_FINGERPRINT_INVALID",
    );
  }
}

function requireCurrentRights(
  artifact: ArtifactRecord,
  sequence: AudiobookSequence,
  now: Date,
): void {
  if (
    artifact.rights.rightsFingerprint !== sequence.rightsFingerprint
    || !artifact.rights.allowedUses.includes("audiobook")
  ) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_AUDIOBOOK_RIGHTS_REQUIRED",
    );
  }
  if (!artifact.rights.commercialUseApproved) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_COMMERCIAL_RIGHTS_REQUIRED",
    );
  }
  if (
    artifact.rights.expiresAt
    && Date.parse(artifact.rights.expiresAt) <= now.getTime()
  ) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_RIGHTS_EXPIRED",
    );
  }
  if (
    artifact.rights.deletionRequiredAt
    && Date.parse(artifact.rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_RETENTION_EXPIRED",
    );
  }
}

function assertReviewableSubject(
  sequence: AudiobookSequence,
  chain: AudiobookReferenceMasterChain,
): ArtifactRecord {
  assertAudiobookSequence(sequence);
  assertAudiobookReferenceMasterChain(chain);
  const artifact = chain.referenceMaster.payload;
  if (
    !chain.eligibleForReview
    || chain.findingCodes.length !== 0
    || !chain.postRenderEngineering.candidateEligible
    || artifact.kind !== "audiobook-reference-master"
    || artifact.projectId !== sequence.projectId
    || artifact.segmentId !== sequence.bookId
    || artifact.verification.status !== "verified"
    || artifact.review.status !== "pending"
    || !artifact.review.required
    || artifact.quarantine !== undefined
    || artifact.provenance.sourceContentHash !== sequence.fingerprint
    || artifact.rights.rightsFingerprint !== sequence.rightsFingerprint
    || chain.sequenceId !== sequence.id
    || chain.sequenceRevision !== sequence.revision
    || chain.sequenceFingerprint !== sequence.fingerprint
    || chain.expectedDurationMs !== sequence.totalDurationMs
    || chain.sequenceManifest.payload.provenance.sourceContentHash
      !== sequence.fingerprint
  ) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_SUBJECT_MISMATCH",
    );
  }
  return artifact;
}

function assertSubjectMatchesSession(
  session: AudiobookReferenceMasterReviewSession,
  sequence: AudiobookSequence,
  chain: AudiobookReferenceMasterChain,
): ArtifactRecord {
  const artifact = assertReviewableSubject(sequence, chain);
  if (
    session.projectId !== sequence.projectId
    || session.bookId !== sequence.bookId
    || session.chainFingerprint !== chain.fingerprint
    || session.sequence.id !== sequence.id
    || session.sequence.revision !== sequence.revision
    || session.sequence.fingerprint !== sequence.fingerprint
    || session.sequence.componentCount !== sequence.components.length
    || session.sequence.chapterCount !== sequence.chapterCount
    || session.sequence.totalDurationMs !== sequence.totalDurationMs
    || session.referenceArtifact.id !== artifact.id
    || session.referenceArtifact.kind !== artifact.kind
    || session.referenceArtifact.revision !== artifact.revision
    || session.referenceArtifact.fingerprint !== artifact.fingerprint
    || session.referenceArtifact.contentHash !== artifact.integrity.contentHash
    || session.referenceArtifact.byteCount !== artifact.integrity.byteCount
    || session.durationMs !== chain.observedDurationMs
    || session.boundaryCount !== sequence.components.length - 1
  ) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_SESSION_SUBJECT_MISMATCH",
    );
  }
  return artifact;
}

function reviseSession(
  session: AudiobookReferenceMasterReviewSession,
  updates: Partial<Pick<
    AudiobookReferenceMasterReviewSession,
    "reviews" | "status" | "approval"
  >>,
  now: Date,
): AudiobookReferenceMasterReviewSession {
  assertAudiobookReferenceMasterReviewSession(session);
  if (now.getTime() < Date.parse(session.updatedAt)) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_TRANSITION_TIME_REVERSED",
    );
  }
  const {
    fingerprint: _fingerprint,
    previousFingerprint: _previous,
    ...base
  } = session;
  const partial: Omit<AudiobookReferenceMasterReviewSession, "fingerprint"> = {
    ...base,
    ...updates,
    revision: session.revision + 1,
    previousFingerprint: session.fingerprint,
    createdAt: session.createdAt,
    updatedAt: now.toISOString(),
  };
  const next = Object.freeze({
    ...partial,
    fingerprint: sessionFingerprint(partial),
  });
  assertAudiobookReferenceMasterReviewSession(next);
  return next;
}

export function createAudiobookReferenceMasterReviewSession(input: Readonly<{
  id: string;
  sequence: AudiobookSequence;
  chain: AudiobookReferenceMasterChain;
  createdAt?: Date;
}>): AudiobookReferenceMasterReviewSession {
  requireIdentifier(input.id, "AUDIOBOOK_REFERENCE_REVIEW_SESSION_ID_INVALID");
  const artifact = assertReviewableSubject(input.sequence, input.chain);
  const createdAt = input.createdAt ?? new Date();
  if (
    Number.isNaN(createdAt.getTime())
    || createdAt.getTime() < Date.parse(input.chain.referenceMaster.savedAt)
  ) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_DATE_INVALID",
    );
  }
  const partial: Omit<
    AudiobookReferenceMasterReviewSession,
    "fingerprint"
  > = {
    schemaVersion: AUDIOBOOK_REFERENCE_MASTER_REVIEW_SCHEMA_VERSION,
    id: input.id,
    projectId: input.sequence.projectId,
    bookId: input.sequence.bookId,
    chainFingerprint: input.chain.fingerprint,
    sequence: Object.freeze({
      id: input.sequence.id,
      revision: input.sequence.revision,
      fingerprint: input.sequence.fingerprint,
      componentCount: input.sequence.components.length,
      chapterCount: input.sequence.chapterCount,
      totalDurationMs: input.sequence.totalDurationMs,
    }),
    referenceArtifact: Object.freeze({
      id: artifact.id,
      kind: "audiobook-reference-master",
      revision: artifact.revision,
      fingerprint: artifact.fingerprint,
      contentHash: artifact.integrity.contentHash,
      byteCount: artifact.integrity.byteCount,
    }),
    durationMs: input.chain.observedDurationMs,
    boundaryCount: input.sequence.components.length - 1,
    requiredRoles: REQUIRED_ROLES,
    reviews: Object.freeze([]),
    status: "open",
    revision: 1,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
  };
  const session = Object.freeze({
    ...partial,
    fingerprint: sessionFingerprint(partial),
  });
  assertAudiobookReferenceMasterReviewSession(session);
  return session;
}

export function recordAudiobookReferenceMasterReview(
  session: AudiobookReferenceMasterReviewSession,
  input: Readonly<{
    id: string;
    role: AudiobookReferenceMasterReviewRole;
    reviewerId: string;
    completeListenConfirmed: true;
    listenedDurationMs: number;
    componentCountReviewed: number;
    boundaryCountReviewed: number;
    playbackContexts: readonly AudiobookReferenceMasterPlaybackContext[];
    decision: AudiobookReferenceMasterReviewDecision;
    scores: AudiobookReferenceMasterReviewScores;
    findingCodes?: readonly string[];
    notes?: string;
    decidedAt?: Date;
  }>,
): AudiobookReferenceMasterReviewSession {
  assertAudiobookReferenceMasterReviewSession(session);
  if (session.status === "approved") {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_SESSION_APPROVED_IMMUTABLE",
    );
  }
  requireIdentifier(input.id, "AUDIOBOOK_REFERENCE_REVIEW_ENTRY_ID_INVALID");
  if (session.reviews.some((review) => review.id === input.id)) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_ENTRY_ID_DUPLICATE",
    );
  }
  const reviewerId = requireHumanActor(
    input.reviewerId,
    "AUDIOBOOK_REFERENCE_REVIEW_REVIEWER_INVALID",
  );
  if (input.completeListenConfirmed !== true) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_COMPLETE_LISTEN_REQUIRED",
    );
  }
  const listenedDurationMs = requireInteger(
    input.listenedDurationMs,
    Math.max(1, session.durationMs - FULL_LISTEN_TOLERANCE_MS),
    session.durationMs * 2 + 30 * 60_000,
    "AUDIOBOOK_REFERENCE_REVIEW_LISTEN_DURATION_INVALID",
  );
  if (input.componentCountReviewed !== session.sequence.componentCount) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_COMPONENT_COVERAGE_MISMATCH",
    );
  }
  if (input.boundaryCountReviewed !== session.boundaryCount) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_BOUNDARY_COVERAGE_MISMATCH",
    );
  }
  const contexts = normaliseContexts(input.role, input.playbackContexts);
  const findingCodes = normaliseFindingCodes(input.decision, input.findingCodes);
  const notes = requireNotes(
    input.notes,
    input.decision === "changes-requested",
  );
  const decidedAt = input.decidedAt ?? new Date();
  if (
    Number.isNaN(decidedAt.getTime())
    || decidedAt.getTime() < Date.parse(session.updatedAt)
  ) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_DATE_INVALID",
    );
  }
  const latest = latestReviews(session);
  for (const [role, review] of latest) {
    if (role !== input.role && review.reviewerId === reviewerId) {
      throw new AudiobookReferenceMasterReviewError(
        "AUDIOBOOK_REFERENCE_REVIEW_INDEPENDENT_REVIEWERS_REQUIRED",
      );
    }
  }
  const reviewBase: Omit<AudiobookReferenceMasterReviewEntry, "fingerprint"> = {
    id: input.id,
    role: input.role,
    reviewerId,
    completeListenConfirmed: true,
    listenedDurationMs,
    componentCountReviewed: input.componentCountReviewed,
    boundaryCountReviewed: input.boundaryCountReviewed,
    playbackContexts: contexts,
    decision: input.decision,
    scores: freezeScores(input.scores),
    findingCodes,
    ...(notes ? { notes } : {}),
    decidedAt: decidedAt.toISOString(),
  };
  const review = Object.freeze({
    ...reviewBase,
    fingerprint: reviewFingerprint(reviewBase),
  });
  assertReview(review, session);
  const reviews = Object.freeze([...session.reviews, review]);
  return reviseSession(
    session,
    { reviews, status: statusFromReviews(reviews) },
    decidedAt,
  );
}

export function approveAudiobookReferenceMasterReview(
  session: AudiobookReferenceMasterReviewSession,
  sequence: AudiobookSequence,
  chain: AudiobookReferenceMasterChain,
  input: Readonly<{
    finalConfirmationId: string;
    approvedByActorId: string;
    humanConfirmation: true;
    approvedAt?: Date;
  }>,
): AudiobookReferenceMasterReviewApprovalResult {
  assertAudiobookReferenceMasterReviewSession(session);
  if (session.status === "approved") {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_SESSION_APPROVED_IMMUTABLE",
    );
  }
  if (input.humanConfirmation !== true) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_HUMAN_CONFIRMATION_REQUIRED",
    );
  }
  requireIdentifier(
    input.finalConfirmationId,
    "AUDIOBOOK_REFERENCE_REVIEW_FINAL_CONFIRMATION_ID_INVALID",
  );
  const approvedByActorId = requireHumanActor(
    input.approvedByActorId,
    "AUDIOBOOK_REFERENCE_REVIEW_APPROVER_INVALID",
  );
  const artifact = assertSubjectMatchesSession(session, sequence, chain);
  if (session.status !== "ready-for-approval") {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_NOT_READY_FOR_APPROVAL",
    );
  }
  const latest = latestReviews(session);
  const roleReviews = REQUIRED_ROLES.map((role) => latest.get(role));
  if (
    !roleReviews.every((review) => review?.decision === "approve")
    || !roleReviews.every((review) => minimumScore(review!) >= 4)
    || !roleReviews.every((review) => review!.findingCodes.length === 0)
    || new Set(roleReviews.map((review) => review!.reviewerId)).size
      !== REQUIRED_ROLES.length
    || !hasRequiredPlaybackCoverage(
      roleReviews as AudiobookReferenceMasterReviewEntry[],
    )
  ) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_NOT_READY_FOR_APPROVAL",
    );
  }
  if (roleReviews.some((review) => review!.reviewerId === approvedByActorId)) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_INDEPENDENT_APPROVER_REQUIRED",
    );
  }
  const approvedAt = input.approvedAt ?? new Date();
  if (
    Number.isNaN(approvedAt.getTime())
    || approvedAt.getTime() < Date.parse(session.updatedAt)
  ) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_APPROVAL_DATE_INVALID",
    );
  }
  requireCurrentRights(artifact, sequence, approvedAt);
  const approvedArtifact = recordArtifactReview(artifact, {
    decision: "approved",
    reviewerId: approvedByActorId,
    notes: `Approved through audiobook reference-master review session ${session.id}.`,
    decidedAt: approvedAt,
  });
  const approvalBase: Omit<
    AudiobookReferenceMasterReviewApproval,
    "fingerprint"
  > = {
    finalConfirmationId: input.finalConfirmationId,
    approvedByActorId,
    approvedAt: approvedAt.toISOString(),
    reviewerSetFingerprint: reviewerSetFingerprint(latest),
    artifactReviewFingerprint: approvedArtifact.review.events.at(-1)!.fingerprint,
    approvedArtifactRevision: approvedArtifact.revision,
    approvedArtifactFingerprint: approvedArtifact.fingerprint,
  };
  const approval = Object.freeze({
    ...approvalBase,
    fingerprint: approvalFingerprint(approvalBase),
  });
  const approvedSession = reviseSession(
    session,
    { status: "approved", approval },
    approvedAt,
  );
  return Object.freeze({
    session: approvedSession,
    artifact: approvedArtifact,
  });
}

export function assertAudiobookReferenceMasterReviewSession(
  session: AudiobookReferenceMasterReviewSession,
): void {
  if (
    session.schemaVersion
      !== AUDIOBOOK_REFERENCE_MASTER_REVIEW_SCHEMA_VERSION
  ) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(session.id, "AUDIOBOOK_REFERENCE_REVIEW_SESSION_ID_INVALID");
  requireIdentifier(
    session.projectId,
    "AUDIOBOOK_REFERENCE_REVIEW_PROJECT_ID_INVALID",
  );
  requireIdentifier(session.bookId, "AUDIOBOOK_REFERENCE_REVIEW_BOOK_ID_INVALID");
  requireHash(
    session.chainFingerprint,
    "AUDIOBOOK_REFERENCE_REVIEW_CHAIN_HASH_INVALID",
  );
  requireIdentifier(
    session.sequence.id,
    "AUDIOBOOK_REFERENCE_REVIEW_SEQUENCE_ID_INVALID",
  );
  requireInteger(
    session.sequence.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_REFERENCE_REVIEW_SEQUENCE_REVISION_INVALID",
  );
  requireHash(
    session.sequence.fingerprint,
    "AUDIOBOOK_REFERENCE_REVIEW_SEQUENCE_HASH_INVALID",
  );
  requireInteger(
    session.sequence.componentCount,
    3,
    2_002,
    "AUDIOBOOK_REFERENCE_REVIEW_COMPONENT_COUNT_INVALID",
  );
  requireInteger(
    session.sequence.chapterCount,
    1,
    2_000,
    "AUDIOBOOK_REFERENCE_REVIEW_CHAPTER_COUNT_INVALID",
  );
  if (
    session.sequence.componentCount !== session.sequence.chapterCount + 2
  ) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_SEQUENCE_COUNTS_MISMATCH",
    );
  }
  requireInteger(
    session.sequence.totalDurationMs,
    1,
    MAX_DURATION_MS,
    "AUDIOBOOK_REFERENCE_REVIEW_SEQUENCE_DURATION_INVALID",
  );
  requireIdentifier(
    session.referenceArtifact.id,
    "AUDIOBOOK_REFERENCE_REVIEW_ARTIFACT_ID_INVALID",
  );
  if (session.referenceArtifact.kind !== "audiobook-reference-master") {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_ARTIFACT_KIND_INVALID",
    );
  }
  requireInteger(
    session.referenceArtifact.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_REFERENCE_REVIEW_ARTIFACT_REVISION_INVALID",
  );
  requireHash(
    session.referenceArtifact.fingerprint,
    "AUDIOBOOK_REFERENCE_REVIEW_ARTIFACT_FINGERPRINT_INVALID",
  );
  requireHash(
    session.referenceArtifact.contentHash,
    "AUDIOBOOK_REFERENCE_REVIEW_ARTIFACT_HASH_INVALID",
  );
  requireInteger(
    session.referenceArtifact.byteCount,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_REFERENCE_REVIEW_ARTIFACT_SIZE_INVALID",
  );
  requireInteger(
    session.durationMs,
    1,
    MAX_DURATION_MS,
    "AUDIOBOOK_REFERENCE_REVIEW_DURATION_INVALID",
  );
  if (
    Math.abs(session.durationMs - session.sequence.totalDurationMs)
      > 10_000
  ) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_DURATION_MISMATCH",
    );
  }
  if (session.boundaryCount !== session.sequence.componentCount - 1) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_BOUNDARY_COUNT_INVALID",
    );
  }
  if (stableHash(session.requiredRoles) !== stableHash(REQUIRED_ROLES)) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_REQUIRED_ROLES_INVALID",
    );
  }
  if (!Array.isArray(session.reviews) || session.reviews.length > MAX_REVIEW_ENTRIES) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_ENTRIES_INVALID",
    );
  }
  const createdAt = requireDate(
    session.createdAt,
    "AUDIOBOOK_REFERENCE_REVIEW_DATE_INVALID",
  );
  const updatedAt = requireDate(
    session.updatedAt,
    "AUDIOBOOK_REFERENCE_REVIEW_DATE_INVALID",
  );
  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_TRANSITION_TIME_REVERSED",
    );
  }
  const ids = new Set<string>();
  let previousAt = Date.parse(createdAt);
  for (const review of session.reviews) {
    assertReview(review, session);
    if (ids.has(review.id)) {
      throw new AudiobookReferenceMasterReviewError(
        "AUDIOBOOK_REFERENCE_REVIEW_ENTRY_ID_DUPLICATE",
      );
    }
    ids.add(review.id);
    const decidedAt = Date.parse(review.decidedAt);
    if (decidedAt < previousAt) {
      throw new AudiobookReferenceMasterReviewError(
        "AUDIOBOOK_REFERENCE_REVIEW_TRANSITION_TIME_REVERSED",
      );
    }
    previousAt = decidedAt;
  }
  if (Date.parse(updatedAt) < previousAt) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_TRANSITION_TIME_REVERSED",
    );
  }
  requireInteger(
    session.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_REFERENCE_REVIEW_REVISION_INVALID",
  );
  if (session.revision === 1 && session.previousFingerprint !== undefined) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_REVISION_CHAIN_INVALID",
    );
  }
  if (session.revision > 1) {
    requireHash(
      session.previousFingerprint ?? "",
      "AUDIOBOOK_REFERENCE_REVIEW_REVISION_CHAIN_INVALID",
    );
  }
  const reviewStatus = statusFromReviews(session.reviews);
  const expectedStatus = session.approval ? "approved" : reviewStatus;
  if (session.status !== expectedStatus) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_STATUS_MISMATCH",
    );
  }
  if (session.approval) {
    if (reviewStatus !== "ready-for-approval") {
      throw new AudiobookReferenceMasterReviewError(
        "AUDIOBOOK_REFERENCE_REVIEW_APPROVAL_WITHOUT_READY_REVIEWS",
      );
    }
    requireIdentifier(
      session.approval.finalConfirmationId,
      "AUDIOBOOK_REFERENCE_REVIEW_FINAL_CONFIRMATION_ID_INVALID",
    );
    requireHumanActor(
      session.approval.approvedByActorId,
      "AUDIOBOOK_REFERENCE_REVIEW_APPROVER_INVALID",
    );
    requireDate(
      session.approval.approvedAt,
      "AUDIOBOOK_REFERENCE_REVIEW_APPROVAL_DATE_INVALID",
    );
    if (Date.parse(session.approval.approvedAt) < previousAt) {
      throw new AudiobookReferenceMasterReviewError(
        "AUDIOBOOK_REFERENCE_REVIEW_APPROVAL_DATE_INVALID",
      );
    }
    const latest = latestReviews(session);
    const reviewerIds = [...latest.values()].map((review) => review.reviewerId);
    if (reviewerIds.includes(session.approval.approvedByActorId)) {
      throw new AudiobookReferenceMasterReviewError(
        "AUDIOBOOK_REFERENCE_REVIEW_INDEPENDENT_APPROVER_REQUIRED",
      );
    }
    if (
      session.approval.reviewerSetFingerprint
        !== reviewerSetFingerprint(latest)
    ) {
      throw new AudiobookReferenceMasterReviewError(
        "AUDIOBOOK_REFERENCE_REVIEW_REVIEWER_SET_FINGERPRINT_INVALID",
      );
    }
    requireHash(
      session.approval.artifactReviewFingerprint,
      "AUDIOBOOK_REFERENCE_REVIEW_ARTIFACT_REVIEW_HASH_INVALID",
    );
    if (
      session.approval.approvedArtifactRevision
        !== session.referenceArtifact.revision + 1
    ) {
      throw new AudiobookReferenceMasterReviewError(
        "AUDIOBOOK_REFERENCE_REVIEW_APPROVED_ARTIFACT_REVISION_INVALID",
      );
    }
    requireHash(
      session.approval.approvedArtifactFingerprint,
      "AUDIOBOOK_REFERENCE_REVIEW_APPROVED_ARTIFACT_HASH_INVALID",
    );
    const { fingerprint, ...partial } = session.approval;
    if (approvalFingerprint(partial) !== fingerprint) {
      throw new AudiobookReferenceMasterReviewError(
        "AUDIOBOOK_REFERENCE_REVIEW_APPROVAL_FINGERPRINT_INVALID",
      );
    }
  }
  const { fingerprint, ...partial } = session;
  if (sessionFingerprint(partial) !== fingerprint) {
    throw new AudiobookReferenceMasterReviewError(
      "AUDIOBOOK_REFERENCE_REVIEW_SESSION_FINGERPRINT_INVALID",
    );
  }
}

function scoreAverages(
  reviews: readonly AudiobookReferenceMasterReviewEntry[],
): AudiobookReferenceMasterReviewScores | null {
  const latest = latestReviews({ reviews });
  if (latest.size === 0) return null;
  const values = [...latest.values()];
  return Object.freeze(Object.fromEntries(
    SCORE_KEYS.map((key) => [
      key,
      Number((
        values.reduce((total, review) => total + review.scores[key], 0)
        / values.length
      ).toFixed(2)),
    ]),
  )) as unknown as AudiobookReferenceMasterReviewScores;
}

export function audiobookReferenceMasterReviewPublicView(
  session: AudiobookReferenceMasterReviewSession,
): AudiobookReferenceMasterReviewPublicView {
  assertAudiobookReferenceMasterReviewSession(session);
  const latest = latestReviews(session);
  const contexts = aggregatePlaybackContexts(latest.values());
  const findingCodes = new Set<string>();
  for (const review of latest.values()) {
    for (const code of review.findingCodes) findingCodes.add(code);
  }
  return Object.freeze({
    id: session.id,
    bookId: session.bookId,
    referenceArtifactId: session.referenceArtifact.id,
    referenceArtifactRevision: session.referenceArtifact.revision,
    durationMs: session.durationMs,
    componentCount: session.sequence.componentCount,
    chapterCount: session.sequence.chapterCount,
    boundaryCount: session.boundaryCount,
    requiredRoles: session.requiredRoles,
    reviewCount: session.reviews.length,
    latestDecisions: Object.freeze({
      editorial: latest.get("editorial")?.decision ?? "pending",
      engineering: latest.get("engineering")?.decision ?? "pending",
    }),
    playbackContexts: Object.freeze(
      [...contexts].sort((left, right) => left.localeCompare(right, "en-AU")),
    ),
    scoreAverages: scoreAverages(session.reviews),
    findingCodes: Object.freeze(
      [...findingCodes].sort((left, right) => left.localeCompare(right, "en-AU")),
    ),
    status: session.status,
    readyForApproval: session.status === "ready-for-approval",
    ...(session.approval ? { approvedAt: session.approval.approvedAt } : {}),
    revision: session.revision,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    fingerprint: session.fingerprint,
  });
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<AudiobookReferenceMasterReviewSession> {
  const session = envelope.payload as unknown as AudiobookReferenceMasterReviewSession;
  assertAudiobookReferenceMasterReviewSession(session);
  if (
    envelope.entityType !== AUDIOBOOK_REFERENCE_MASTER_REVIEW_ENTITY_TYPE
    || envelope.entityId !== session.id
    || envelope.revision !== session.revision
  ) {
    throw new AudiobookReferenceMasterReviewStoreConflictError(
      "AUDIOBOOK_REFERENCE_REVIEW_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<AudiobookReferenceMasterReviewSession>;
}

function payload(
  session: AudiobookReferenceMasterReviewSession,
): Record<string, unknown> {
  return session as unknown as Record<string, unknown>;
}

export class FileAudiobookReferenceMasterReviewStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    session: AudiobookReferenceMasterReviewSession,
    actorId: string,
  ): Promise<StoredEnvelope<AudiobookReferenceMasterReviewSession>> {
    assertAudiobookReferenceMasterReviewSession(session);
    requireIdentifier(
      actorId,
      "AUDIOBOOK_REFERENCE_REVIEW_STORE_ACTOR_INVALID",
    );
    try {
      const existing = await this.read(session.id);
      if (existing) {
        if (existing.payload.fingerprint === session.fingerprint) return existing;
        throw new AudiobookReferenceMasterReviewStoreConflictError(
          "AUDIOBOOK_REFERENCE_REVIEW_STORE_IDEMPOTENCY_CONFLICT",
        );
      }
      const envelope = toEnvelope(await this.#store.create(
        AUDIOBOOK_REFERENCE_MASTER_REVIEW_ENTITY_TYPE,
        session.id,
        payload(session),
        new Date(session.createdAt),
      ));
      await this.#audit(
        actorId,
        "audiobook_reference_review.created",
        envelope,
      );
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookReferenceMasterReviewStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(
    sessionId: string,
  ): Promise<StoredEnvelope<AudiobookReferenceMasterReviewSession> | null> {
    requireIdentifier(
      sessionId,
      "AUDIOBOOK_REFERENCE_REVIEW_STORE_ID_INVALID",
    );
    const envelope = await this.#store.read<Record<string, unknown>>(
      AUDIOBOOK_REFERENCE_MASTER_REVIEW_ENTITY_TYPE,
      sessionId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(
    sessionId: string,
  ): Promise<StoredEnvelope<AudiobookReferenceMasterReviewSession>> {
    const envelope = await this.read(sessionId);
    if (!envelope) {
      throw new AudiobookReferenceMasterReviewStoreConflictError(
        "AUDIOBOOK_REFERENCE_REVIEW_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }

  async save(
    session: AudiobookReferenceMasterReviewSession,
    input: Readonly<{
      expectedRevision: number;
      actorId: string;
      action: string;
    }>,
  ): Promise<StoredEnvelope<AudiobookReferenceMasterReviewSession>> {
    assertAudiobookReferenceMasterReviewSession(session);
    requireIdentifier(
      input.actorId,
      "AUDIOBOOK_REFERENCE_REVIEW_STORE_ACTOR_INVALID",
    );
    if (
      !/^audiobook_reference_review\.[a-z][a-z0-9._-]{1,80}$/u.test(
        input.action,
      )
    ) {
      throw new AudiobookReferenceMasterReviewStoreConflictError(
        "AUDIOBOOK_REFERENCE_REVIEW_STORE_ACTION_INVALID",
      );
    }
    const current = await this.require(session.id);
    if (
      current.revision !== input.expectedRevision
      || session.revision !== current.payload.revision + 1
      || session.previousFingerprint !== current.payload.fingerprint
    ) {
      throw new AudiobookReferenceMasterReviewStoreConflictError(
        "AUDIOBOOK_REFERENCE_REVIEW_STORE_REVISION_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.replace(
        AUDIOBOOK_REFERENCE_MASTER_REVIEW_ENTITY_TYPE,
        session.id,
        input.expectedRevision,
        payload(session),
        new Date(session.updatedAt),
      ));
      await this.#audit(input.actorId, input.action, envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookReferenceMasterReviewStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async #audit(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<AudiobookReferenceMasterReviewSession>,
  ): Promise<void> {
    await this.#store.appendAuditEvent({
      actorId,
      action,
      entityType: AUDIOBOOK_REFERENCE_MASTER_REVIEW_ENTITY_TYPE,
      entityId: envelope.entityId,
      revision: envelope.revision,
      occurredAt: new Date(envelope.savedAt),
      metadata: {
        status: envelope.payload.status,
        reviewCount: envelope.payload.reviews.length,
        referenceArtifactRevision:
          envelope.payload.referenceArtifact.revision,
        componentCount: envelope.payload.sequence.componentCount,
        boundaryCount: envelope.payload.boundaryCount,
        readyForApproval:
          envelope.payload.status === "ready-for-approval",
      },
    });
  }
}
