import {
  recordArtifactReview,
  type ArtifactRecord,
} from "./artifact-registry.js";
import {
  assertMasteredChapterArtifactChain,
  type MasteredChapterArtifactChain,
} from "./mastered-chapter.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";
import { stableHash } from "./index.js";

export const MASTERED_CHAPTER_REVIEW_SCHEMA_VERSION =
  "storyteller-mastered-chapter-review-v1" as const;

export type MasteredChapterReviewRole = "editorial" | "engineering";
export type MasteredChapterPlaybackContext =
  | "studio-headphones"
  | "consumer-headphones"
  | "speakers";
export type MasteredChapterReviewDecision = "approve" | "changes-requested";
export type MasteredChapterReviewStatus =
  | "open"
  | "changes-requested"
  | "ready-for-approval"
  | "approved";

export interface MasteredChapterReviewScores {
  listenerComfort: number;
  intelligibility: number;
  tonalBalance: number;
  dynamicNaturalness: number;
  noiseConsistency: number;
  breathAndConsonantIntegrity: number;
  silenceAndTransitionIntegrity: number;
  continuityWithNeighbours: number;
}

export interface MasteredChapterReviewEntry {
  id: string;
  role: MasteredChapterReviewRole;
  reviewerId: string;
  listenedDurationMs: number;
  playbackContexts: readonly MasteredChapterPlaybackContext[];
  decision: MasteredChapterReviewDecision;
  scores: MasteredChapterReviewScores;
  notes?: string;
  decidedAt: string;
  fingerprint: string;
}

export interface MasteredChapterReviewApproval {
  finalConfirmationId: string;
  approvedByActorId: string;
  approvedAt: string;
  artifactReviewFingerprint: string;
  fingerprint: string;
}

export interface MasteredChapterReviewSession {
  schemaVersion: typeof MASTERED_CHAPTER_REVIEW_SCHEMA_VERSION;
  id: string;
  projectId: string;
  chapterId: string;
  chainFingerprint: string;
  masteredArtifact: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
    contentHash: string;
    byteCount: number;
  }>;
  durationMs: number;
  requiredRoles: readonly MasteredChapterReviewRole[];
  reviews: readonly MasteredChapterReviewEntry[];
  status: MasteredChapterReviewStatus;
  approval?: MasteredChapterReviewApproval;
  revision: number;
  previousFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface MasteredChapterReviewPublicView {
  id: string;
  chapterId: string;
  masteredArtifactId: string;
  masteredArtifactRevision: number;
  durationMs: number;
  requiredRoles: readonly MasteredChapterReviewRole[];
  reviewCount: number;
  latestDecisions: Readonly<Record<MasteredChapterReviewRole, MasteredChapterReviewDecision | "pending">>;
  playbackContexts: readonly MasteredChapterPlaybackContext[];
  scoreAverages: MasteredChapterReviewScores | null;
  status: MasteredChapterReviewStatus;
  readyForApproval: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface MasteredChapterReviewApprovalResult {
  session: MasteredChapterReviewSession;
  artifact: ArtifactRecord;
}

export class MasteredChapterReviewError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "MasteredChapterReviewError";
    this.code = code;
  }
}

export class MasteredChapterReviewStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MasteredChapterReviewStoreConflictError";
  }
}

const ENTITY_TYPE = "mastered-chapter-review" as const;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const HUMAN_BLOCKLIST = /^(?:system|worker|automation|automated|bot)(?:[_-]|$)/iu;
const REQUIRED_ROLES = Object.freeze([
  "editorial",
  "engineering",
] as const satisfies readonly MasteredChapterReviewRole[]);
const PLAYBACK_CONTEXTS: ReadonlySet<MasteredChapterPlaybackContext> = new Set([
  "studio-headphones",
  "consumer-headphones",
  "speakers",
]);
const SCORE_KEYS = Object.freeze([
  "listenerComfort",
  "intelligibility",
  "tonalBalance",
  "dynamicNaturalness",
  "noiseConsistency",
  "breathAndConsonantIntegrity",
  "silenceAndTransitionIntegrity",
  "continuityWithNeighbours",
] as const satisfies readonly (keyof MasteredChapterReviewScores)[]);
const MAX_NOTES_LENGTH = 4_000;
const FULL_LISTEN_TOLERANCE_MS = 1_000;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new MasteredChapterReviewError(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new MasteredChapterReviewError(code);
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) throw new MasteredChapterReviewError(code);
  return value;
}

function requireHumanActor(value: string, code: string): string {
  requireIdentifier(value, code);
  if (HUMAN_BLOCKLIST.test(value)) throw new MasteredChapterReviewError(code);
  return value;
}

function requireNotes(value: string | undefined, required: boolean): string | undefined {
  if (value === undefined) {
    if (required) throw new MasteredChapterReviewError("MASTERED_REVIEW_NOTES_REQUIRED");
    return undefined;
  }
  const trimmed = value.trim();
  if (
    !trimmed
    || trimmed.length > MAX_NOTES_LENGTH
    || CONTROL_CHARACTERS.test(trimmed)
  ) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_NOTES_INVALID");
  }
  return trimmed;
}

function requirePositiveInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new MasteredChapterReviewError(code);
  }
  return value;
}

function assertScores(scores: MasteredChapterReviewScores): void {
  for (const key of SCORE_KEYS) {
    const value = scores[key];
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new MasteredChapterReviewError("MASTERED_REVIEW_SCORE_INVALID");
    }
  }
}

function freezeScores(scores: MasteredChapterReviewScores): MasteredChapterReviewScores {
  assertScores(scores);
  return Object.freeze({ ...scores });
}

function normaliseContexts(
  role: MasteredChapterReviewRole,
  contexts: readonly MasteredChapterPlaybackContext[],
): readonly MasteredChapterPlaybackContext[] {
  if (!Array.isArray(contexts) || contexts.length === 0 || contexts.length > 3) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_PLAYBACK_CONTEXTS_INVALID");
  }
  const unique = new Set<MasteredChapterPlaybackContext>();
  for (const context of contexts) {
    if (!PLAYBACK_CONTEXTS.has(context) || unique.has(context)) {
      throw new MasteredChapterReviewError("MASTERED_REVIEW_PLAYBACK_CONTEXTS_INVALID");
    }
    unique.add(context);
  }
  if (role === "engineering" && !unique.has("studio-headphones")) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_ENGINEERING_HEADPHONES_REQUIRED");
  }
  if (
    role === "editorial"
    && !unique.has("consumer-headphones")
    && !unique.has("speakers")
  ) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_EDITORIAL_CONSUMER_CONTEXT_REQUIRED");
  }
  return Object.freeze(
    [...unique].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function reviewFingerprint(
  review: Omit<MasteredChapterReviewEntry, "fingerprint">,
): string {
  return stableHash(review);
}

function approvalFingerprint(
  approval: Omit<MasteredChapterReviewApproval, "fingerprint">,
): string {
  return stableHash(approval);
}

function sessionFingerprint(
  session: Omit<MasteredChapterReviewSession, "fingerprint">,
): string {
  return stableHash(session);
}

function assertReview(review: MasteredChapterReviewEntry, durationMs: number): void {
  requireIdentifier(review.id, "MASTERED_REVIEW_ID_INVALID");
  if (!REQUIRED_ROLES.includes(review.role)) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_ROLE_INVALID");
  }
  requireHumanActor(review.reviewerId, "MASTERED_REVIEW_REVIEWER_INVALID");
  requirePositiveInteger(
    review.listenedDurationMs,
    Math.max(1, durationMs - FULL_LISTEN_TOLERANCE_MS),
    durationMs * 2 + 5 * 60_000,
    "MASTERED_REVIEW_LISTEN_DURATION_INVALID",
  );
  normaliseContexts(review.role, review.playbackContexts);
  if (review.decision !== "approve" && review.decision !== "changes-requested") {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_DECISION_INVALID");
  }
  assertScores(review.scores);
  requireNotes(review.notes, review.decision === "changes-requested");
  requireDate(review.decidedAt, "MASTERED_REVIEW_DATE_INVALID");
  const { fingerprint, ...partial } = review;
  if (reviewFingerprint(partial) !== fingerprint) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_FINGERPRINT_INVALID");
  }
}

function latestReviews(
  session: MasteredChapterReviewSession,
): ReadonlyMap<MasteredChapterReviewRole, MasteredChapterReviewEntry> {
  const result = new Map<MasteredChapterReviewRole, MasteredChapterReviewEntry>();
  for (const review of session.reviews) result.set(review.role, review);
  return result;
}

function minimumScore(review: MasteredChapterReviewEntry): number {
  return Math.min(...SCORE_KEYS.map((key) => review.scores[key]));
}

function statusFromReviews(
  reviews: readonly MasteredChapterReviewEntry[],
): Exclude<MasteredChapterReviewStatus, "approved"> {
  const latest = new Map<MasteredChapterReviewRole, MasteredChapterReviewEntry>();
  for (const review of reviews) latest.set(review.role, review);
  if ([...latest.values()].some((review) => review.decision === "changes-requested")) {
    return "changes-requested";
  }
  if (
    REQUIRED_ROLES.every((role) => latest.get(role)?.decision === "approve")
    && REQUIRED_ROLES.every((role) => minimumScore(latest.get(role)!) >= 4)
    && new Set(REQUIRED_ROLES.map((role) => latest.get(role)!.reviewerId)).size
      === REQUIRED_ROLES.length
  ) {
    return "ready-for-approval";
  }
  return "open";
}

function reviseSession(
  session: MasteredChapterReviewSession,
  updates: Partial<Pick<
    MasteredChapterReviewSession,
    "reviews" | "status" | "approval"
  >>,
  now: Date,
): MasteredChapterReviewSession {
  assertMasteredChapterReviewSession(session);
  if (now.getTime() < Date.parse(session.updatedAt)) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_TRANSITION_TIME_REVERSED");
  }
  const { fingerprint: _fingerprint, previousFingerprint: _previous, ...base } = session;
  const partial: Omit<MasteredChapterReviewSession, "fingerprint"> = {
    ...base,
    ...updates,
    revision: session.revision + 1,
    previousFingerprint: session.fingerprint,
    createdAt: session.createdAt,
    updatedAt: now.toISOString(),
  };
  const next = Object.freeze({ ...partial, fingerprint: sessionFingerprint(partial) });
  assertMasteredChapterReviewSession(next);
  return next;
}

function assertChainMatchesSession(
  session: MasteredChapterReviewSession,
  chain: MasteredChapterArtifactChain,
): void {
  assertMasteredChapterArtifactChain(chain);
  const artifact = chain.masteredChapter.payload;
  if (
    !chain.eligibleForReview
    || artifact.verification.status !== "verified"
    || artifact.review.status === "approved"
    || artifact.id !== session.masteredArtifact.id
    || artifact.revision !== session.masteredArtifact.revision
    || artifact.fingerprint !== session.masteredArtifact.fingerprint
    || artifact.integrity.contentHash !== session.masteredArtifact.contentHash
    || artifact.integrity.byteCount !== session.masteredArtifact.byteCount
    || chain.fingerprint !== session.chainFingerprint
    || chain.comparison.observedDurationMs !== session.durationMs
  ) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_CHAIN_MISMATCH");
  }
}

export function createMasteredChapterReviewSession(input: Readonly<{
  id: string;
  chain: MasteredChapterArtifactChain;
  createdAt?: Date;
}>): MasteredChapterReviewSession {
  requireIdentifier(input.id, "MASTERED_REVIEW_SESSION_ID_INVALID");
  assertMasteredChapterArtifactChain(input.chain);
  if (!input.chain.eligibleForReview) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_CHAIN_NOT_ELIGIBLE");
  }
  const artifact = input.chain.masteredChapter.payload;
  if (
    artifact.verification.status !== "verified"
    || artifact.review.status !== "pending"
    || !artifact.review.required
  ) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_ARTIFACT_NOT_REVIEWABLE");
  }
  const createdAt = input.createdAt ?? new Date();
  if (Number.isNaN(createdAt.getTime())) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_DATE_INVALID");
  }
  const partial: Omit<MasteredChapterReviewSession, "fingerprint"> = {
    schemaVersion: MASTERED_CHAPTER_REVIEW_SCHEMA_VERSION,
    id: input.id,
    projectId: artifact.projectId,
    chapterId: artifact.segmentId ?? "chapter-unresolved",
    chainFingerprint: input.chain.fingerprint,
    masteredArtifact: Object.freeze({
      id: artifact.id,
      revision: artifact.revision,
      fingerprint: artifact.fingerprint,
      contentHash: artifact.integrity.contentHash,
      byteCount: artifact.integrity.byteCount,
    }),
    durationMs: input.chain.comparison.observedDurationMs,
    requiredRoles: REQUIRED_ROLES,
    reviews: Object.freeze([]),
    status: "open",
    revision: 1,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
  };
  const session = Object.freeze({ ...partial, fingerprint: sessionFingerprint(partial) });
  assertMasteredChapterReviewSession(session);
  return session;
}

export function recordMasteredChapterReview(
  session: MasteredChapterReviewSession,
  input: Readonly<{
    id: string;
    role: MasteredChapterReviewRole;
    reviewerId: string;
    listenedDurationMs: number;
    playbackContexts: readonly MasteredChapterPlaybackContext[];
    decision: MasteredChapterReviewDecision;
    scores: MasteredChapterReviewScores;
    notes?: string;
    decidedAt?: Date;
  }>,
): MasteredChapterReviewSession {
  assertMasteredChapterReviewSession(session);
  if (session.status === "approved") {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_SESSION_APPROVED_IMMUTABLE");
  }
  requireIdentifier(input.id, "MASTERED_REVIEW_ID_INVALID");
  if (session.reviews.some((review) => review.id === input.id)) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_ID_DUPLICATE");
  }
  const reviewerId = requireHumanActor(
    input.reviewerId,
    "MASTERED_REVIEW_REVIEWER_INVALID",
  );
  const contexts = normaliseContexts(input.role, input.playbackContexts);
  const notes = requireNotes(input.notes, input.decision === "changes-requested");
  const decidedAt = input.decidedAt ?? new Date();
  if (
    Number.isNaN(decidedAt.getTime())
    || decidedAt.getTime() < Date.parse(session.updatedAt)
  ) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_DATE_INVALID");
  }
  const latest = latestReviews(session);
  for (const [role, review] of latest) {
    if (role !== input.role && review.reviewerId === reviewerId) {
      throw new MasteredChapterReviewError("MASTERED_REVIEW_INDEPENDENT_REVIEWERS_REQUIRED");
    }
  }
  const reviewBase: Omit<MasteredChapterReviewEntry, "fingerprint"> = {
    id: input.id,
    role: input.role,
    reviewerId,
    listenedDurationMs: requirePositiveInteger(
      input.listenedDurationMs,
      Math.max(1, session.durationMs - FULL_LISTEN_TOLERANCE_MS),
      session.durationMs * 2 + 5 * 60_000,
      "MASTERED_REVIEW_LISTEN_DURATION_INVALID",
    ),
    playbackContexts: contexts,
    decision: input.decision,
    scores: freezeScores(input.scores),
    ...(notes ? { notes } : {}),
    decidedAt: decidedAt.toISOString(),
  };
  const review = Object.freeze({
    ...reviewBase,
    fingerprint: reviewFingerprint(reviewBase),
  });
  assertReview(review, session.durationMs);
  const reviews = Object.freeze([...session.reviews, review]);
  return reviseSession(
    session,
    { reviews, status: statusFromReviews(reviews) },
    decidedAt,
  );
}

export function approveMasteredChapterReview(
  session: MasteredChapterReviewSession,
  chain: MasteredChapterArtifactChain,
  input: Readonly<{
    finalConfirmationId: string;
    approvedByActorId: string;
    humanConfirmation: true;
    approvedAt?: Date;
  }>,
): MasteredChapterReviewApprovalResult {
  assertMasteredChapterReviewSession(session);
  if (session.status === "approved") {
    if (chain.masteredChapter.payload.review.status !== "approved") {
      throw new MasteredChapterReviewError("MASTERED_REVIEW_APPROVAL_ARTIFACT_MISMATCH");
    }
    return Object.freeze({ session, artifact: chain.masteredChapter.payload });
  }
  if (input.humanConfirmation !== true) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_HUMAN_CONFIRMATION_REQUIRED");
  }
  requireIdentifier(
    input.finalConfirmationId,
    "MASTERED_REVIEW_FINAL_CONFIRMATION_ID_INVALID",
  );
  const approvedByActorId = requireHumanActor(
    input.approvedByActorId,
    "MASTERED_REVIEW_APPROVER_INVALID",
  );
  assertChainMatchesSession(session, chain);
  if (session.status !== "ready-for-approval") {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_NOT_READY_FOR_APPROVAL");
  }
  const latest = latestReviews(session);
  if (
    !REQUIRED_ROLES.every((role) => latest.get(role)?.decision === "approve")
    || !REQUIRED_ROLES.every((role) => minimumScore(latest.get(role)!) >= 4)
    || new Set(REQUIRED_ROLES.map((role) => latest.get(role)!.reviewerId)).size
      !== REQUIRED_ROLES.length
  ) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_NOT_READY_FOR_APPROVAL");
  }
  const approvedAt = input.approvedAt ?? new Date();
  if (
    Number.isNaN(approvedAt.getTime())
    || approvedAt.getTime() < Date.parse(session.updatedAt)
  ) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_APPROVAL_DATE_INVALID");
  }
  const artifact = recordArtifactReview(chain.masteredChapter.payload, {
    decision: "approved",
    reviewerId: approvedByActorId,
    notes: `Approved through mastered chapter review session ${session.id}.`,
    decidedAt: approvedAt,
  });
  const approvalBase: Omit<MasteredChapterReviewApproval, "fingerprint"> = {
    finalConfirmationId: input.finalConfirmationId,
    approvedByActorId,
    approvedAt: approvedAt.toISOString(),
    artifactReviewFingerprint: artifact.fingerprint,
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
  return Object.freeze({ session: approvedSession, artifact });
}

export function assertMasteredChapterReviewSession(
  session: MasteredChapterReviewSession,
): void {
  if (session.schemaVersion !== MASTERED_CHAPTER_REVIEW_SCHEMA_VERSION) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(session.id, "MASTERED_REVIEW_SESSION_ID_INVALID");
  requireIdentifier(session.projectId, "MASTERED_REVIEW_PROJECT_ID_INVALID");
  requireIdentifier(session.chapterId, "MASTERED_REVIEW_CHAPTER_ID_INVALID");
  requireHash(session.chainFingerprint, "MASTERED_REVIEW_CHAIN_HASH_INVALID");
  requireIdentifier(session.masteredArtifact.id, "MASTERED_REVIEW_ARTIFACT_ID_INVALID");
  requirePositiveInteger(
    session.masteredArtifact.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "MASTERED_REVIEW_ARTIFACT_REVISION_INVALID",
  );
  requireHash(
    session.masteredArtifact.fingerprint,
    "MASTERED_REVIEW_ARTIFACT_FINGERPRINT_INVALID",
  );
  requireHash(
    session.masteredArtifact.contentHash,
    "MASTERED_REVIEW_ARTIFACT_HASH_INVALID",
  );
  requirePositiveInteger(
    session.masteredArtifact.byteCount,
    1,
    Number.MAX_SAFE_INTEGER,
    "MASTERED_REVIEW_ARTIFACT_SIZE_INVALID",
  );
  requirePositiveInteger(
    session.durationMs,
    1,
    7 * 24 * 60 * 60 * 1_000,
    "MASTERED_REVIEW_DURATION_INVALID",
  );
  if (stableHash(session.requiredRoles) !== stableHash(REQUIRED_ROLES)) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_REQUIRED_ROLES_INVALID");
  }
  if (!Array.isArray(session.reviews) || session.reviews.length > 100) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_ENTRIES_INVALID");
  }
  const ids = new Set<string>();
  let previousAt = Date.parse(session.createdAt);
  for (const review of session.reviews) {
    assertReview(review, session.durationMs);
    if (ids.has(review.id)) throw new MasteredChapterReviewError("MASTERED_REVIEW_ID_DUPLICATE");
    ids.add(review.id);
    const decidedAt = Date.parse(review.decidedAt);
    if (decidedAt < previousAt) {
      throw new MasteredChapterReviewError("MASTERED_REVIEW_TRANSITION_TIME_REVERSED");
    }
    previousAt = decidedAt;
  }
  requireDate(session.createdAt, "MASTERED_REVIEW_DATE_INVALID");
  requireDate(session.updatedAt, "MASTERED_REVIEW_DATE_INVALID");
  if (Date.parse(session.updatedAt) < previousAt) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_TRANSITION_TIME_REVERSED");
  }
  requirePositiveInteger(session.revision, 1, Number.MAX_SAFE_INTEGER, "MASTERED_REVIEW_REVISION_INVALID");
  if (session.revision === 1 && session.previousFingerprint !== undefined) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_REVISION_CHAIN_INVALID");
  }
  if (session.revision > 1) requireHash(
    session.previousFingerprint ?? "",
    "MASTERED_REVIEW_REVISION_CHAIN_INVALID",
  );
  const expectedStatus = session.approval
    ? "approved"
    : statusFromReviews(session.reviews);
  if (session.status !== expectedStatus) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_STATUS_MISMATCH");
  }
  if (session.approval) {
    requireIdentifier(
      session.approval.finalConfirmationId,
      "MASTERED_REVIEW_FINAL_CONFIRMATION_ID_INVALID",
    );
    requireHumanActor(session.approval.approvedByActorId, "MASTERED_REVIEW_APPROVER_INVALID");
    requireDate(session.approval.approvedAt, "MASTERED_REVIEW_APPROVAL_DATE_INVALID");
    requireHash(
      session.approval.artifactReviewFingerprint,
      "MASTERED_REVIEW_ARTIFACT_REVIEW_HASH_INVALID",
    );
    const { fingerprint, ...partial } = session.approval;
    if (approvalFingerprint(partial) !== fingerprint) {
      throw new MasteredChapterReviewError("MASTERED_REVIEW_APPROVAL_FINGERPRINT_INVALID");
    }
  }
  const { fingerprint, ...partial } = session;
  if (sessionFingerprint(partial) !== fingerprint) {
    throw new MasteredChapterReviewError("MASTERED_REVIEW_SESSION_FINGERPRINT_INVALID");
  }
}

function averages(
  reviews: readonly MasteredChapterReviewEntry[],
): MasteredChapterReviewScores | null {
  const latest = new Map<MasteredChapterReviewRole, MasteredChapterReviewEntry>();
  for (const review of reviews) latest.set(review.role, review);
  if (latest.size === 0) return null;
  const values = [...latest.values()];
  return Object.freeze(Object.fromEntries(
    SCORE_KEYS.map((key) => [
      key,
      Number((values.reduce((total, review) => total + review.scores[key], 0) / values.length).toFixed(2)),
    ]),
  )) as unknown as MasteredChapterReviewScores;
}

export function masteredChapterReviewPublicView(
  session: MasteredChapterReviewSession,
): MasteredChapterReviewPublicView {
  assertMasteredChapterReviewSession(session);
  const latest = latestReviews(session);
  const contexts = new Set<MasteredChapterPlaybackContext>();
  for (const review of latest.values()) {
    for (const context of review.playbackContexts) contexts.add(context);
  }
  return Object.freeze({
    id: session.id,
    chapterId: session.chapterId,
    masteredArtifactId: session.masteredArtifact.id,
    masteredArtifactRevision: session.masteredArtifact.revision,
    durationMs: session.durationMs,
    requiredRoles: session.requiredRoles,
    reviewCount: session.reviews.length,
    latestDecisions: Object.freeze({
      editorial: latest.get("editorial")?.decision ?? "pending",
      engineering: latest.get("engineering")?.decision ?? "pending",
    }),
    playbackContexts: Object.freeze(
      [...contexts].sort((left, right) => left.localeCompare(right, "en-AU")),
    ),
    scoreAverages: averages(session.reviews),
    status: session.status,
    readyForApproval: session.status === "ready-for-approval",
    revision: session.revision,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    fingerprint: session.fingerprint,
  });
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<MasteredChapterReviewSession> {
  const session = envelope.payload as unknown as MasteredChapterReviewSession;
  assertMasteredChapterReviewSession(session);
  if (
    envelope.entityType !== ENTITY_TYPE
    || envelope.entityId !== session.id
    || envelope.revision !== session.revision
  ) {
    throw new MasteredChapterReviewStoreConflictError(
      "MASTERED_REVIEW_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<MasteredChapterReviewSession>;
}

function payload(
  session: MasteredChapterReviewSession,
): Record<string, unknown> {
  return session as unknown as Record<string, unknown>;
}

export class FileMasteredChapterReviewStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    session: MasteredChapterReviewSession,
    actorId: string,
  ): Promise<StoredEnvelope<MasteredChapterReviewSession>> {
    assertMasteredChapterReviewSession(session);
    requireIdentifier(actorId, "MASTERED_REVIEW_STORE_ACTOR_INVALID");
    try {
      const existing = await this.read(session.id);
      if (existing) {
        if (existing.payload.fingerprint === session.fingerprint) return existing;
        throw new MasteredChapterReviewStoreConflictError(
          "MASTERED_REVIEW_STORE_IDEMPOTENCY_CONFLICT",
        );
      }
      const envelope = toEnvelope(await this.#store.create(
        ENTITY_TYPE,
        session.id,
        payload(session),
        new Date(session.createdAt),
      ));
      await this.#audit(actorId, "mastered_review.created", envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new MasteredChapterReviewStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(
    sessionId: string,
  ): Promise<StoredEnvelope<MasteredChapterReviewSession> | null> {
    requireIdentifier(sessionId, "MASTERED_REVIEW_STORE_ID_INVALID");
    const envelope = await this.#store.read<Record<string, unknown>>(
      ENTITY_TYPE,
      sessionId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(
    sessionId: string,
  ): Promise<StoredEnvelope<MasteredChapterReviewSession>> {
    const envelope = await this.read(sessionId);
    if (!envelope) {
      throw new MasteredChapterReviewStoreConflictError(
        "MASTERED_REVIEW_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }

  async save(
    session: MasteredChapterReviewSession,
    input: Readonly<{
      expectedRevision: number;
      actorId: string;
      action: string;
    }>,
  ): Promise<StoredEnvelope<MasteredChapterReviewSession>> {
    assertMasteredChapterReviewSession(session);
    requireIdentifier(input.actorId, "MASTERED_REVIEW_STORE_ACTOR_INVALID");
    if (!/^mastered_review\.[a-z][a-z0-9._-]{1,80}$/u.test(input.action)) {
      throw new MasteredChapterReviewStoreConflictError(
        "MASTERED_REVIEW_STORE_ACTION_INVALID",
      );
    }
    const current = await this.require(session.id);
    if (
      current.revision !== input.expectedRevision
      || session.revision !== current.payload.revision + 1
      || session.previousFingerprint !== current.payload.fingerprint
    ) {
      throw new MasteredChapterReviewStoreConflictError(
        "MASTERED_REVIEW_STORE_REVISION_CONFLICT",
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
        throw new MasteredChapterReviewStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async #audit(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<MasteredChapterReviewSession>,
  ): Promise<void> {
    await this.#store.appendAuditEvent({
      actorId,
      action,
      entityType: ENTITY_TYPE,
      entityId: envelope.entityId,
      revision: envelope.revision,
      occurredAt: new Date(envelope.savedAt),
      metadata: {
        status: envelope.payload.status,
        reviewCount: envelope.payload.reviews.length,
        masteredArtifactRevision: envelope.payload.masteredArtifact.revision,
        readyForApproval: envelope.payload.status === "ready-for-approval",
      },
    });
  }
}
