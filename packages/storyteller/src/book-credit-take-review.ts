import {
  assertAudioEngineeringEvidence,
  type AudioEngineeringEvidence,
} from "./audio-engineering.js";
import {
  assertBookCreditTakeRecord,
  type BookCreditTakeRecord,
} from "./book-credit-take.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";
import { stableHash } from "./index.js";

export const BOOK_CREDIT_TAKE_REVIEW_SCHEMA_VERSION =
  "storyteller-book-credit-take-review-v1" as const;

export type BookCreditTakeReviewRole = "editorial" | "engineering";
export type BookCreditTakeReviewDecision = "approve" | "changes-requested";
export type BookCreditTakePlaybackContext =
  | "studio-headphones"
  | "consumer-headphones"
  | "speakers";
export type BookCreditTakeReviewStatus =
  | "open"
  | "changes-requested"
  | "ready-for-approval"
  | "approved";

export interface BookCreditTakeReviewScores {
  wordingFidelity: number;
  pronunciation: number;
  diction: number;
  pacing: number;
  tone: number;
  boundaryCleanliness: number;
  technicalComfort: number;
  narratorConsistency: number;
}

export interface BookCreditTakeReviewCandidate {
  take: BookCreditTakeRecord;
  engineeringEvidence: AudioEngineeringEvidence;
  durationMs: number;
  fingerprint: string;
}

export interface BookCreditTakeReviewEntry {
  id: string;
  candidateTakeId: string;
  role: BookCreditTakeReviewRole;
  reviewerId: string;
  listenedDurationMs: number;
  playbackContexts: readonly BookCreditTakePlaybackContext[];
  decision: BookCreditTakeReviewDecision;
  scores: BookCreditTakeReviewScores;
  notes?: string;
  decidedAt: string;
  fingerprint: string;
}

export interface BookCreditTakeSelection {
  candidateTakeId: string;
  selectedByActorId: string;
  selectedAt: string;
  reviewSetFingerprint: string;
  fingerprint: string;
}

export interface BookCreditTakeReviewApproval {
  finalConfirmationId: string;
  approvedByActorId: string;
  approvedAt: string;
  selectionFingerprint: string;
  fingerprint: string;
}

export interface BookCreditTakeReviewSession {
  schemaVersion: typeof BOOK_CREDIT_TAKE_REVIEW_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  creditKind: BookCreditTakeRecord["creditKind"];
  planId: string;
  planFingerprint: string;
  scriptId: string;
  scriptRevision: number;
  scriptTextHash: string;
  voiceRevision: number;
  calibrationLockFingerprint: string;
  engineeringProfileId: string;
  engineeringProfileVersion: string;
  candidates: readonly BookCreditTakeReviewCandidate[];
  reviews: readonly BookCreditTakeReviewEntry[];
  selection?: BookCreditTakeSelection;
  status: BookCreditTakeReviewStatus;
  approval?: BookCreditTakeReviewApproval;
  revision: number;
  previousFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface BookCreditTakeReviewPublicView {
  id: string;
  bookId: string;
  creditKind: BookCreditTakeRecord["creditKind"];
  candidateCount: number;
  reviewedCandidateCount: number;
  selectedTakeId?: string;
  latestSelectedDecisions: Readonly<
    Record<BookCreditTakeReviewRole, BookCreditTakeReviewDecision | "pending">
  >;
  playbackContexts: readonly BookCreditTakePlaybackContext[];
  selectedScoreAverages: BookCreditTakeReviewScores | null;
  status: BookCreditTakeReviewStatus;
  readyForApproval: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export class BookCreditTakeReviewError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "BookCreditTakeReviewError";
    this.code = code;
  }
}

export class BookCreditTakeReviewStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookCreditTakeReviewStoreConflictError";
  }
}

const ENTITY_TYPE = "book-credit-take-review" as const;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const HUMAN_BLOCKLIST = /^(?:system|worker|automation|automated|bot)(?:[_-]|$)/iu;
const REQUIRED_ROLES = Object.freeze([
  "editorial",
  "engineering",
] as const satisfies readonly BookCreditTakeReviewRole[]);
const PLAYBACK_CONTEXTS: ReadonlySet<BookCreditTakePlaybackContext> = new Set([
  "studio-headphones",
  "consumer-headphones",
  "speakers",
]);
const SCORE_KEYS = Object.freeze([
  "wordingFidelity",
  "pronunciation",
  "diction",
  "pacing",
  "tone",
  "boundaryCleanliness",
  "technicalComfort",
  "narratorConsistency",
] as const satisfies readonly (keyof BookCreditTakeReviewScores)[]);
const FULL_LISTEN_TOLERANCE_MS = 250;
const MAX_NOTES_LENGTH = 4_000;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new BookCreditTakeReviewError(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new BookCreditTakeReviewError(code);
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) throw new BookCreditTakeReviewError(code);
  return value;
}

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new BookCreditTakeReviewError(code);
  }
  return value;
}

function requireHuman(value: string, code: string): string {
  requireIdentifier(value, code);
  if (HUMAN_BLOCKLIST.test(value)) throw new BookCreditTakeReviewError(code);
  return value;
}

function requireNotes(value: string | undefined, required: boolean): string | undefined {
  if (value === undefined) {
    if (required) throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_NOTES_REQUIRED");
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_NOTES_LENGTH || CONTROL_CHARACTERS.test(trimmed)) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_NOTES_INVALID");
  }
  return trimmed;
}

function assertScores(scores: BookCreditTakeReviewScores): void {
  for (const key of SCORE_KEYS) {
    const value = scores[key];
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_SCORE_INVALID");
    }
  }
}

function freezeScores(scores: BookCreditTakeReviewScores): BookCreditTakeReviewScores {
  assertScores(scores);
  return Object.freeze({ ...scores });
}

function normaliseContexts(
  role: BookCreditTakeReviewRole,
  contexts: readonly BookCreditTakePlaybackContext[],
): readonly BookCreditTakePlaybackContext[] {
  if (!Array.isArray(contexts) || contexts.length === 0 || contexts.length > 3) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_CONTEXTS_INVALID");
  }
  const unique = new Set<BookCreditTakePlaybackContext>();
  for (const context of contexts) {
    if (!PLAYBACK_CONTEXTS.has(context) || unique.has(context)) {
      throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_CONTEXTS_INVALID");
    }
    unique.add(context);
  }
  if (role === "engineering" && !unique.has("studio-headphones")) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_STUDIO_CONTEXT_REQUIRED");
  }
  if (
    role === "editorial"
    && !unique.has("consumer-headphones")
    && !unique.has("speakers")
  ) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_CONSUMER_CONTEXT_REQUIRED");
  }
  return Object.freeze(
    [...unique].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function candidateFingerprint(
  candidate: Omit<BookCreditTakeReviewCandidate, "fingerprint">,
): string {
  return stableHash(candidate);
}

function reviewFingerprint(
  review: Omit<BookCreditTakeReviewEntry, "fingerprint">,
): string {
  return stableHash(review);
}

function selectionFingerprint(
  selection: Omit<BookCreditTakeSelection, "fingerprint">,
): string {
  return stableHash(selection);
}

function approvalFingerprint(
  approval: Omit<BookCreditTakeReviewApproval, "fingerprint">,
): string {
  return stableHash(approval);
}

function sessionFingerprint(
  session: Omit<BookCreditTakeReviewSession, "fingerprint">,
): string {
  return stableHash(session);
}

function assertCandidate(candidate: BookCreditTakeReviewCandidate): void {
  assertBookCreditTakeRecord(candidate.take);
  assertAudioEngineeringEvidence(candidate.engineeringEvidence);
  if (!candidate.take.eligibleForReview || candidate.take.status !== "eligible-for-review") {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_ELIGIBLE_TAKE_REQUIRED");
  }
  if (
    candidate.engineeringEvidence.fingerprint
      !== candidate.take.engineeringEvidenceFingerprint
    || candidate.engineeringEvidence.inputContentHash !== candidate.take.audio.contentHash
    || candidate.engineeringEvidence.inputByteCount !== candidate.take.audio.byteCount
    || candidate.engineeringEvidence.profile.profile.id !== candidate.take.engineeringProfileId
    || candidate.engineeringEvidence.profile.externalVersion
      !== candidate.take.engineeringProfileVersion
    || !candidate.engineeringEvidence.eligible
    || candidate.engineeringEvidence.findings.some((finding) => finding.severity === "error")
  ) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_ENGINEERING_MISMATCH");
  }
  const expectedDuration = Math.round(
    candidate.engineeringEvidence.probe.durationSeconds * 1_000,
  );
  requireInteger(
    candidate.durationMs,
    1,
    60 * 60_000,
    "BOOK_CREDIT_TAKE_REVIEW_DURATION_INVALID",
  );
  if (candidate.durationMs !== expectedDuration) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_DURATION_MISMATCH");
  }
  const { fingerprint, ...partial } = candidate;
  if (!HASH_PATTERN.test(fingerprint) || candidateFingerprint(partial) !== fingerprint) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_CANDIDATE_FINGERPRINT_INVALID");
  }
}

function assertReview(
  review: BookCreditTakeReviewEntry,
  candidate: BookCreditTakeReviewCandidate,
): void {
  requireIdentifier(review.id, "BOOK_CREDIT_TAKE_REVIEW_ID_INVALID");
  requireIdentifier(review.candidateTakeId, "BOOK_CREDIT_TAKE_REVIEW_CANDIDATE_ID_INVALID");
  if (review.candidateTakeId !== candidate.take.id) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_CANDIDATE_SCOPE_MISMATCH");
  }
  if (!REQUIRED_ROLES.includes(review.role)) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_ROLE_INVALID");
  }
  requireHuman(review.reviewerId, "BOOK_CREDIT_TAKE_REVIEW_REVIEWER_INVALID");
  requireInteger(
    review.listenedDurationMs,
    Math.max(1, candidate.durationMs - FULL_LISTEN_TOLERANCE_MS),
    candidate.durationMs * 3 + 60_000,
    "BOOK_CREDIT_TAKE_REVIEW_LISTEN_DURATION_INVALID",
  );
  normaliseContexts(review.role, review.playbackContexts);
  if (review.decision !== "approve" && review.decision !== "changes-requested") {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_DECISION_INVALID");
  }
  assertScores(review.scores);
  requireNotes(review.notes, review.decision === "changes-requested");
  requireDate(review.decidedAt, "BOOK_CREDIT_TAKE_REVIEW_DATE_INVALID");
  const { fingerprint, ...partial } = review;
  if (!HASH_PATTERN.test(fingerprint) || reviewFingerprint(partial) !== fingerprint) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_FINGERPRINT_INVALID");
  }
}

function latestReviewsForCandidate(
  session: BookCreditTakeReviewSession,
  candidateTakeId: string,
): ReadonlyMap<BookCreditTakeReviewRole, BookCreditTakeReviewEntry> {
  const result = new Map<BookCreditTakeReviewRole, BookCreditTakeReviewEntry>();
  for (const review of session.reviews) {
    if (review.candidateTakeId === candidateTakeId) result.set(review.role, review);
  }
  return result;
}

function minimumScore(review: BookCreditTakeReviewEntry): number {
  return Math.min(...SCORE_KEYS.map((key) => review.scores[key]));
}

function candidateReady(
  session: BookCreditTakeReviewSession,
  candidateTakeId: string,
): boolean {
  const latest = latestReviewsForCandidate(session, candidateTakeId);
  return REQUIRED_ROLES.every((role) => latest.get(role)?.decision === "approve")
    && REQUIRED_ROLES.every((role) => minimumScore(latest.get(role)!) >= 4)
    && new Set(REQUIRED_ROLES.map((role) => latest.get(role)!.reviewerId)).size
      === REQUIRED_ROLES.length;
}

function statusFromState(
  reviews: readonly BookCreditTakeReviewEntry[],
  selection?: BookCreditTakeSelection,
): Exclude<BookCreditTakeReviewStatus, "approved"> {
  if (!selection) return "open";
  const latest = new Map<BookCreditTakeReviewRole, BookCreditTakeReviewEntry>();
  for (const review of reviews) {
    if (review.candidateTakeId === selection.candidateTakeId) latest.set(review.role, review);
  }
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
  session: BookCreditTakeReviewSession,
  updates: Partial<Pick<
    BookCreditTakeReviewSession,
    "reviews" | "selection" | "status" | "approval"
  >>,
  at: Date,
): BookCreditTakeReviewSession {
  assertBookCreditTakeReviewSession(session);
  if (at.getTime() < Date.parse(session.updatedAt)) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_TRANSITION_TIME_REVERSED");
  }
  const { fingerprint: _fingerprint, previousFingerprint: _previous, ...base } = session;
  const partial: Omit<BookCreditTakeReviewSession, "fingerprint"> = {
    ...base,
    ...updates,
    revision: session.revision + 1,
    previousFingerprint: session.fingerprint,
    createdAt: session.createdAt,
    updatedAt: at.toISOString(),
  };
  const next = Object.freeze({ ...partial, fingerprint: sessionFingerprint(partial) });
  assertBookCreditTakeReviewSession(next);
  return next;
}

export function createBookCreditTakeReviewSession(input: Readonly<{
  id: string;
  candidates: readonly Readonly<{
    take: BookCreditTakeRecord;
    engineeringEvidence: AudioEngineeringEvidence;
  }>[];
  createdAt?: Date;
}>): BookCreditTakeReviewSession {
  requireIdentifier(input.id, "BOOK_CREDIT_TAKE_REVIEW_SESSION_ID_INVALID");
  if (!Array.isArray(input.candidates) || input.candidates.length < 2 || input.candidates.length > 8) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_CANDIDATE_COUNT_INVALID");
  }
  const createdAt = input.createdAt ?? new Date();
  if (Number.isNaN(createdAt.getTime())) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_DATE_INVALID");
  }
  const candidates = input.candidates.map((inputCandidate) => {
    const durationMs = Math.round(inputCandidate.engineeringEvidence.probe.durationSeconds * 1_000);
    const partial: Omit<BookCreditTakeReviewCandidate, "fingerprint"> = {
      take: inputCandidate.take,
      engineeringEvidence: inputCandidate.engineeringEvidence,
      durationMs,
    };
    const candidate = Object.freeze({
      ...partial,
      fingerprint: candidateFingerprint(partial),
    });
    assertCandidate(candidate);
    return candidate;
  });
  const first = candidates[0]!;
  const takeIds = new Set<string>();
  const artifactIds = new Set<string>();
  for (const candidate of candidates) {
    const take = candidate.take;
    if (takeIds.has(take.id) || artifactIds.has(take.audio.id)) {
      throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_CANDIDATE_DUPLICATE");
    }
    takeIds.add(take.id);
    artifactIds.add(take.audio.id);
    if (
      take.projectId !== first.take.projectId
      || take.bookId !== first.take.bookId
      || take.creditKind !== first.take.creditKind
      || take.planId !== first.take.planId
      || take.planFingerprint !== first.take.planFingerprint
      || take.scriptId !== first.take.scriptId
      || take.scriptRevision !== first.take.scriptRevision
      || take.scriptTextHash !== first.take.scriptTextHash
      || take.voiceRevision !== first.take.voiceRevision
      || take.calibrationLockFingerprint !== first.take.calibrationLockFingerprint
      || take.engineeringProfileId !== first.take.engineeringProfileId
      || take.engineeringProfileVersion !== first.take.engineeringProfileVersion
    ) {
      throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_CANDIDATE_SCOPE_MISMATCH");
    }
  }
  const partial: Omit<BookCreditTakeReviewSession, "fingerprint"> = {
    schemaVersion: BOOK_CREDIT_TAKE_REVIEW_SCHEMA_VERSION,
    id: input.id,
    projectId: first.take.projectId,
    bookId: first.take.bookId,
    creditKind: first.take.creditKind,
    planId: first.take.planId,
    planFingerprint: first.take.planFingerprint,
    scriptId: first.take.scriptId,
    scriptRevision: first.take.scriptRevision,
    scriptTextHash: first.take.scriptTextHash,
    voiceRevision: first.take.voiceRevision,
    calibrationLockFingerprint: first.take.calibrationLockFingerprint,
    engineeringProfileId: first.take.engineeringProfileId,
    engineeringProfileVersion: first.take.engineeringProfileVersion,
    candidates: Object.freeze(candidates),
    reviews: Object.freeze([]),
    status: "open",
    revision: 1,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
  };
  const session = Object.freeze({ ...partial, fingerprint: sessionFingerprint(partial) });
  assertBookCreditTakeReviewSession(session);
  return session;
}

export function recordBookCreditTakeReview(
  session: BookCreditTakeReviewSession,
  input: Readonly<{
    id: string;
    candidateTakeId: string;
    role: BookCreditTakeReviewRole;
    reviewerId: string;
    listenedDurationMs: number;
    playbackContexts: readonly BookCreditTakePlaybackContext[];
    decision: BookCreditTakeReviewDecision;
    scores: BookCreditTakeReviewScores;
    notes?: string;
    decidedAt?: Date;
  }>,
): BookCreditTakeReviewSession {
  assertBookCreditTakeReviewSession(session);
  if (session.status === "approved") {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_APPROVED_IMMUTABLE");
  }
  if (session.reviews.some((review) => review.id === input.id)) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_ID_DUPLICATE");
  }
  const candidate = session.candidates.find((item) => item.take.id === input.candidateTakeId);
  if (!candidate) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_CANDIDATE_NOT_FOUND");
  }
  const reviewerId = requireHuman(
    input.reviewerId,
    "BOOK_CREDIT_TAKE_REVIEW_REVIEWER_INVALID",
  );
  const latest = latestReviewsForCandidate(session, candidate.take.id);
  for (const [role, review] of latest) {
    if (role !== input.role && review.reviewerId === reviewerId) {
      throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_INDEPENDENCE_REQUIRED");
    }
  }
  const decidedAt = input.decidedAt ?? new Date();
  if (Number.isNaN(decidedAt.getTime()) || decidedAt.getTime() < Date.parse(session.updatedAt)) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_DATE_INVALID");
  }
  const notes = requireNotes(input.notes, input.decision === "changes-requested");
  const partial: Omit<BookCreditTakeReviewEntry, "fingerprint"> = {
    id: requireIdentifier(input.id, "BOOK_CREDIT_TAKE_REVIEW_ID_INVALID"),
    candidateTakeId: candidate.take.id,
    role: input.role,
    reviewerId,
    listenedDurationMs: input.listenedDurationMs,
    playbackContexts: normaliseContexts(input.role, input.playbackContexts),
    decision: input.decision,
    scores: freezeScores(input.scores),
    ...(notes ? { notes } : {}),
    decidedAt: decidedAt.toISOString(),
  };
  const review = Object.freeze({ ...partial, fingerprint: reviewFingerprint(partial) });
  assertReview(review, candidate);
  const reviews = Object.freeze([...session.reviews, review]);
  return reviseSession(
    session,
    {
      reviews,
      status: statusFromState(reviews, session.selection),
    },
    decidedAt,
  );
}

export function selectBookCreditTake(
  session: BookCreditTakeReviewSession,
  input: Readonly<{
    candidateTakeId: string;
    selectedByActorId: string;
    selectedAt?: Date;
  }>,
): BookCreditTakeReviewSession {
  assertBookCreditTakeReviewSession(session);
  if (session.status === "approved") {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_APPROVED_IMMUTABLE");
  }
  const candidate = session.candidates.find((item) => item.take.id === input.candidateTakeId);
  if (!candidate) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_CANDIDATE_NOT_FOUND");
  }
  if (!candidateReady(session, candidate.take.id)) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_CANDIDATE_NOT_READY");
  }
  const selectedAt = input.selectedAt ?? new Date();
  if (Number.isNaN(selectedAt.getTime()) || selectedAt.getTime() < Date.parse(session.updatedAt)) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_SELECTION_DATE_INVALID");
  }
  const selectedByActorId = requireHuman(
    input.selectedByActorId,
    "BOOK_CREDIT_TAKE_REVIEW_SELECTOR_INVALID",
  );
  const latest = latestReviewsForCandidate(session, candidate.take.id);
  const reviewFingerprints = REQUIRED_ROLES.map((role) => latest.get(role)!.fingerprint)
    .sort((left, right) => left.localeCompare(right, "en-AU"));
  const partial: Omit<BookCreditTakeSelection, "fingerprint"> = {
    candidateTakeId: candidate.take.id,
    selectedByActorId,
    selectedAt: selectedAt.toISOString(),
    reviewSetFingerprint: stableHash(reviewFingerprints),
  };
  const selection = Object.freeze({
    ...partial,
    fingerprint: selectionFingerprint(partial),
  });
  return reviseSession(
    session,
    {
      selection,
      status: "ready-for-approval",
    },
    selectedAt,
  );
}

export function approveBookCreditTakeSelection(
  session: BookCreditTakeReviewSession,
  input: Readonly<{
    finalConfirmationId: string;
    approvedByActorId: string;
    humanConfirmation: true;
    approvedAt?: Date;
  }>,
): BookCreditTakeReviewSession {
  assertBookCreditTakeReviewSession(session);
  if (session.status === "approved") return session;
  if (input.humanConfirmation !== true) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_HUMAN_CONFIRMATION_REQUIRED");
  }
  if (!session.selection || session.status !== "ready-for-approval") {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_NOT_READY_FOR_APPROVAL");
  }
  if (!candidateReady(session, session.selection.candidateTakeId)) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_SELECTION_STALE");
  }
  const approvedAt = input.approvedAt ?? new Date();
  if (Number.isNaN(approvedAt.getTime()) || approvedAt.getTime() < Date.parse(session.updatedAt)) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_APPROVAL_DATE_INVALID");
  }
  const partial: Omit<BookCreditTakeReviewApproval, "fingerprint"> = {
    finalConfirmationId: requireIdentifier(
      input.finalConfirmationId,
      "BOOK_CREDIT_TAKE_REVIEW_CONFIRMATION_ID_INVALID",
    ),
    approvedByActorId: requireHuman(
      input.approvedByActorId,
      "BOOK_CREDIT_TAKE_REVIEW_APPROVER_INVALID",
    ),
    approvedAt: approvedAt.toISOString(),
    selectionFingerprint: session.selection.fingerprint,
  };
  const approval = Object.freeze({ ...partial, fingerprint: approvalFingerprint(partial) });
  return reviseSession(session, { status: "approved", approval }, approvedAt);
}

export function assertBookCreditTakeReviewSession(
  session: BookCreditTakeReviewSession,
): void {
  if (session.schemaVersion !== BOOK_CREDIT_TAKE_REVIEW_SCHEMA_VERSION) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_SCHEMA_UNSUPPORTED");
  }
  for (const [value, code] of [
    [session.id, "BOOK_CREDIT_TAKE_REVIEW_SESSION_ID_INVALID"],
    [session.projectId, "BOOK_CREDIT_TAKE_REVIEW_PROJECT_ID_INVALID"],
    [session.bookId, "BOOK_CREDIT_TAKE_REVIEW_BOOK_ID_INVALID"],
    [session.planId, "BOOK_CREDIT_TAKE_REVIEW_PLAN_ID_INVALID"],
    [session.scriptId, "BOOK_CREDIT_TAKE_REVIEW_SCRIPT_ID_INVALID"],
    [session.engineeringProfileId, "BOOK_CREDIT_TAKE_REVIEW_ENGINEERING_PROFILE_INVALID"],
  ] as const) requireIdentifier(value, code);
  for (const hash of [
    session.planFingerprint,
    session.scriptTextHash,
    session.calibrationLockFingerprint,
  ]) requireHash(hash, "BOOK_CREDIT_TAKE_REVIEW_HASH_INVALID");
  if (!SAFE_VERSION.test(session.engineeringProfileVersion)) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_ENGINEERING_VERSION_INVALID");
  }
  if (session.creditKind !== "opening" && session.creditKind !== "closing") {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_KIND_INVALID");
  }
  requireInteger(session.scriptRevision, 1, Number.MAX_SAFE_INTEGER, "BOOK_CREDIT_TAKE_REVIEW_SCRIPT_REVISION_INVALID");
  requireInteger(session.voiceRevision, 1, Number.MAX_SAFE_INTEGER, "BOOK_CREDIT_TAKE_REVIEW_VOICE_REVISION_INVALID");
  if (!Array.isArray(session.candidates) || session.candidates.length < 2 || session.candidates.length > 8) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_CANDIDATE_COUNT_INVALID");
  }
  const candidates = new Map<string, BookCreditTakeReviewCandidate>();
  const audioArtifacts = new Set<string>();
  for (const candidate of session.candidates) {
    assertCandidate(candidate);
    const take = candidate.take;
    if (candidates.has(take.id) || audioArtifacts.has(take.audio.id)) {
      throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_CANDIDATE_DUPLICATE");
    }
    candidates.set(take.id, candidate);
    audioArtifacts.add(take.audio.id);
    if (
      take.projectId !== session.projectId
      || take.bookId !== session.bookId
      || take.creditKind !== session.creditKind
      || take.planId !== session.planId
      || take.planFingerprint !== session.planFingerprint
      || take.scriptId !== session.scriptId
      || take.scriptRevision !== session.scriptRevision
      || take.scriptTextHash !== session.scriptTextHash
      || take.voiceRevision !== session.voiceRevision
      || take.calibrationLockFingerprint !== session.calibrationLockFingerprint
      || take.engineeringProfileId !== session.engineeringProfileId
      || take.engineeringProfileVersion !== session.engineeringProfileVersion
    ) {
      throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_CANDIDATE_SCOPE_MISMATCH");
    }
  }
  if (!Array.isArray(session.reviews) || session.reviews.length > 200) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_REVIEWS_INVALID");
  }
  const reviewIds = new Set<string>();
  let previousAt = Date.parse(session.createdAt);
  for (const review of session.reviews) {
    const candidate = candidates.get(review.candidateTakeId);
    if (!candidate) {
      throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_CANDIDATE_NOT_FOUND");
    }
    assertReview(review, candidate);
    if (reviewIds.has(review.id)) {
      throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_ID_DUPLICATE");
    }
    reviewIds.add(review.id);
    const decidedAt = Date.parse(review.decidedAt);
    if (decidedAt < previousAt) {
      throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_TRANSITION_TIME_REVERSED");
    }
    previousAt = decidedAt;
  }
  if (session.selection) {
    const candidate = candidates.get(session.selection.candidateTakeId);
    if (!candidate) throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_SELECTION_INVALID");
    requireHuman(session.selection.selectedByActorId, "BOOK_CREDIT_TAKE_REVIEW_SELECTOR_INVALID");
    requireDate(session.selection.selectedAt, "BOOK_CREDIT_TAKE_REVIEW_SELECTION_DATE_INVALID");
    const latest = latestReviewsForCandidate(session, candidate.take.id);
    const expectedReviewSet = stableHash(
      REQUIRED_ROLES.map((role) => latest.get(role)?.fingerprint ?? "missing")
        .sort((left, right) => left.localeCompare(right, "en-AU")),
    );
    if (
      !candidateReady(session, candidate.take.id)
      || session.selection.reviewSetFingerprint !== expectedReviewSet
    ) {
      throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_SELECTION_STALE");
    }
    const { fingerprint, ...partial } = session.selection;
    if (selectionFingerprint(partial) !== fingerprint) {
      throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_SELECTION_FINGERPRINT_INVALID");
    }
    previousAt = Math.max(previousAt, Date.parse(session.selection.selectedAt));
  }
  const expectedStatus = session.approval
    ? "approved"
    : statusFromState(session.reviews, session.selection);
  if (session.status !== expectedStatus) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_STATUS_MISMATCH");
  }
  if (session.approval) {
    if (!session.selection) {
      throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_SELECTION_REQUIRED");
    }
    requireIdentifier(session.approval.finalConfirmationId, "BOOK_CREDIT_TAKE_REVIEW_CONFIRMATION_ID_INVALID");
    requireHuman(session.approval.approvedByActorId, "BOOK_CREDIT_TAKE_REVIEW_APPROVER_INVALID");
    requireDate(session.approval.approvedAt, "BOOK_CREDIT_TAKE_REVIEW_APPROVAL_DATE_INVALID");
    if (session.approval.selectionFingerprint !== session.selection.fingerprint) {
      throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_APPROVAL_SELECTION_MISMATCH");
    }
    const { fingerprint, ...partial } = session.approval;
    if (approvalFingerprint(partial) !== fingerprint) {
      throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_APPROVAL_FINGERPRINT_INVALID");
    }
    previousAt = Math.max(previousAt, Date.parse(session.approval.approvedAt));
  }
  if (
    Number.isNaN(Date.parse(session.createdAt))
    || Number.isNaN(Date.parse(session.updatedAt))
    || Date.parse(session.updatedAt) < previousAt
  ) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_DATE_INVALID");
  }
  requireInteger(session.revision, 1, Number.MAX_SAFE_INTEGER, "BOOK_CREDIT_TAKE_REVIEW_REVISION_INVALID");
  if (session.revision === 1 && session.previousFingerprint !== undefined) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_REVISION_CHAIN_INVALID");
  }
  if (session.revision > 1) {
    requireHash(session.previousFingerprint ?? "", "BOOK_CREDIT_TAKE_REVIEW_REVISION_CHAIN_INVALID");
  }
  const { fingerprint, ...partial } = session;
  if (!HASH_PATTERN.test(fingerprint) || sessionFingerprint(partial) !== fingerprint) {
    throw new BookCreditTakeReviewError("BOOK_CREDIT_TAKE_REVIEW_SESSION_FINGERPRINT_INVALID");
  }
}

function selectedReviews(session: BookCreditTakeReviewSession): readonly BookCreditTakeReviewEntry[] {
  if (!session.selection) return Object.freeze([]);
  return Object.freeze(session.reviews.filter(
    (review) => review.candidateTakeId === session.selection!.candidateTakeId,
  ));
}

function averages(
  reviews: readonly BookCreditTakeReviewEntry[],
): BookCreditTakeReviewScores | null {
  if (reviews.length === 0) return null;
  const output = {} as Record<keyof BookCreditTakeReviewScores, number>;
  for (const key of SCORE_KEYS) {
    output[key] = Number(
      (reviews.reduce((total, review) => total + review.scores[key], 0) / reviews.length)
        .toFixed(2),
    );
  }
  return Object.freeze(output as unknown as BookCreditTakeReviewScores);
}

export function bookCreditTakeReviewPublicView(
  session: BookCreditTakeReviewSession,
): BookCreditTakeReviewPublicView {
  assertBookCreditTakeReviewSession(session);
  const selected = selectedReviews(session);
  const latest = session.selection
    ? latestReviewsForCandidate(session, session.selection.candidateTakeId)
    : new Map<BookCreditTakeReviewRole, BookCreditTakeReviewEntry>();
  const contexts = new Set<BookCreditTakePlaybackContext>();
  for (const review of selected) {
    for (const context of review.playbackContexts) contexts.add(context);
  }
  return Object.freeze({
    id: session.id,
    bookId: session.bookId,
    creditKind: session.creditKind,
    candidateCount: session.candidates.length,
    reviewedCandidateCount: new Set(session.reviews.map((review) => review.candidateTakeId)).size,
    ...(session.selection ? { selectedTakeId: session.selection.candidateTakeId } : {}),
    latestSelectedDecisions: Object.freeze({
      editorial: latest.get("editorial")?.decision ?? "pending",
      engineering: latest.get("engineering")?.decision ?? "pending",
    }),
    playbackContexts: Object.freeze(
      [...contexts].sort((left, right) => left.localeCompare(right, "en-AU")),
    ),
    selectedScoreAverages: averages(selected),
    status: session.status,
    readyForApproval: session.status === "ready-for-approval",
    revision: session.revision,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    fingerprint: session.fingerprint,
  });
}

function payload(session: BookCreditTakeReviewSession): Record<string, unknown> {
  return session as unknown as Record<string, unknown>;
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<BookCreditTakeReviewSession> {
  const session = envelope.payload as unknown as BookCreditTakeReviewSession;
  assertBookCreditTakeReviewSession(session);
  if (
    envelope.entityType !== ENTITY_TYPE
    || envelope.entityId !== session.id
    || envelope.revision !== session.revision
  ) {
    throw new BookCreditTakeReviewStoreConflictError("BOOK_CREDIT_TAKE_REVIEW_STORE_SCOPE_MISMATCH");
  }
  return envelope as unknown as StoredEnvelope<BookCreditTakeReviewSession>;
}

export class FileBookCreditTakeReviewStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    session: BookCreditTakeReviewSession,
    actorId: string,
  ): Promise<StoredEnvelope<BookCreditTakeReviewSession>> {
    assertBookCreditTakeReviewSession(session);
    requireHuman(actorId, "BOOK_CREDIT_TAKE_REVIEW_ACTOR_INVALID");
    const existing = await this.read(session.id);
    if (existing) {
      if (existing.payload.fingerprint === session.fingerprint) return existing;
      throw new BookCreditTakeReviewStoreConflictError("BOOK_CREDIT_TAKE_REVIEW_IDEMPOTENCY_CONFLICT");
    }
    try {
      const envelope = toEnvelope(await this.#store.create(
        ENTITY_TYPE,
        session.id,
        payload(session),
        new Date(session.createdAt),
      ));
      await this.#audit(actorId, "book_credit_take_review.created", envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new BookCreditTakeReviewStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(id: string): Promise<StoredEnvelope<BookCreditTakeReviewSession> | null> {
    requireIdentifier(id, "BOOK_CREDIT_TAKE_REVIEW_SESSION_ID_INVALID");
    const envelope = await this.#store.read<Record<string, unknown>>(ENTITY_TYPE, id);
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(id: string): Promise<StoredEnvelope<BookCreditTakeReviewSession>> {
    const envelope = await this.read(id);
    if (!envelope) {
      throw new BookCreditTakeReviewStoreConflictError("BOOK_CREDIT_TAKE_REVIEW_NOT_FOUND");
    }
    return envelope;
  }

  async save(
    session: BookCreditTakeReviewSession,
    input: Readonly<{ expectedRevision: number; actorId: string; action: string }>,
  ): Promise<StoredEnvelope<BookCreditTakeReviewSession>> {
    assertBookCreditTakeReviewSession(session);
    requireHuman(input.actorId, "BOOK_CREDIT_TAKE_REVIEW_ACTOR_INVALID");
    if (!/^book_credit_take_review\.[a-z][a-z0-9._-]{1,80}$/u.test(input.action)) {
      throw new BookCreditTakeReviewStoreConflictError("BOOK_CREDIT_TAKE_REVIEW_ACTION_INVALID");
    }
    const current = await this.require(session.id);
    if (
      current.revision !== input.expectedRevision
      || session.revision !== current.payload.revision + 1
      || session.previousFingerprint !== current.payload.fingerprint
    ) {
      throw new BookCreditTakeReviewStoreConflictError("BOOK_CREDIT_TAKE_REVIEW_REVISION_CONFLICT");
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
        throw new BookCreditTakeReviewStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async #audit(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<BookCreditTakeReviewSession>,
  ): Promise<void> {
    await this.#store.appendAuditEvent({
      actorId,
      action,
      entityType: ENTITY_TYPE,
      entityId: envelope.entityId,
      revision: envelope.revision,
      occurredAt: new Date(envelope.savedAt),
      metadata: {
        bookId: envelope.payload.bookId,
        creditKind: envelope.payload.creditKind,
        candidateCount: envelope.payload.candidates.length,
        reviewCount: envelope.payload.reviews.length,
        selected: Boolean(envelope.payload.selection),
        status: envelope.payload.status,
      },
    });
  }
}
