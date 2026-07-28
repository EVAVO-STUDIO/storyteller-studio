import {
  assertArtifactRecord,
  recordArtifactReview,
  type ArtifactRecord,
} from "./artifact-registry.js";
import {
  assertAudiobookRetailSampleChain,
  type AudiobookRetailSampleChain,
} from "./audiobook-retail-sample.js";
import { stableHash } from "./index.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";

export const AUDIOBOOK_RETAIL_SAMPLE_REVIEW_SCHEMA_VERSION =
  "storyteller-audiobook-retail-sample-review-v1" as const;
export const AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ENTITY_TYPE =
  "audiobook-retail-sample-review" as const;

export type AudiobookRetailSampleReviewRole = "editorial" | "engineering";
export type AudiobookRetailSamplePlaybackContext =
  | "studio-headphones"
  | "consumer-headphones"
  | "speakers"
  | "mobile-device";
export type AudiobookRetailSampleReviewDecision =
  | "approve"
  | "changes-requested";
export type AudiobookRetailSampleReviewStatus =
  | "open"
  | "changes-requested"
  | "ready-for-approval"
  | "approved";

export interface AudiobookRetailSampleReviewScores {
  startBoundaryIntegrity: number;
  endBoundaryIntegrity: number;
  contentContinuity: number;
  representativeness: number;
  spokenClarity: number;
  encodingTransparency: number;
  levelAndToneConsistency: number;
  freedomFromDefects: number;
}

export interface AudiobookRetailSampleReviewEntry {
  id: string;
  role: AudiobookRetailSampleReviewRole;
  reviewerId: string;
  completePlaybackConfirmed: true;
  listenedDurationMs: number;
  startBoundaryConfirmed: true;
  endBoundaryConfirmed: true;
  sourceContinuityConfirmed: true;
  retailSuitabilityConfirmed: true;
  contentSafetyConfirmed: true;
  playbackContexts: readonly AudiobookRetailSamplePlaybackContext[];
  decision: AudiobookRetailSampleReviewDecision;
  scores: AudiobookRetailSampleReviewScores;
  findingCodes: readonly string[];
  notes?: string;
  decidedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailSampleReviewApproval {
  finalConfirmationId: string;
  approvedByActorId: string;
  approvedAt: string;
  reviewerSetFingerprint: string;
  artifactReviewFingerprint: string;
  approvedArtifactRevision: number;
  approvedArtifactFingerprint: string;
  fingerprint: string;
}

export interface AudiobookRetailSampleReviewSession {
  schemaVersion: typeof AUDIOBOOK_RETAIL_SAMPLE_REVIEW_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  chainFingerprint: string;
  plan: Readonly<{
    id: string;
    fingerprint: string;
  }>;
  sampleArtifact: Readonly<{
    id: string;
    kind: "audiobook-retail-sample";
    revision: number;
    fingerprint: string;
    contentHash: string;
    byteCount: number;
    reviewFingerprint: string;
  }>;
  engineering: Readonly<{
    evidenceFingerprint: string;
    profileFingerprint: string;
  }>;
  durationMs: number;
  requiredRoles: readonly AudiobookRetailSampleReviewRole[];
  reviews: readonly AudiobookRetailSampleReviewEntry[];
  status: AudiobookRetailSampleReviewStatus;
  approval?: AudiobookRetailSampleReviewApproval;
  revision: number;
  previousFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailSampleReviewPublicView {
  id: string;
  bookId: string;
  durationMs: number;
  requiredRoles: readonly AudiobookRetailSampleReviewRole[];
  reviewCount: number;
  latestDecisions: Readonly<Record<
    AudiobookRetailSampleReviewRole,
    AudiobookRetailSampleReviewDecision | "pending"
  >>;
  playbackContexts: readonly AudiobookRetailSamplePlaybackContext[];
  scoreAverages: AudiobookRetailSampleReviewScores | null;
  findingCodes: readonly string[];
  status: AudiobookRetailSampleReviewStatus;
  readyForApproval: boolean;
  approvedAt?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailSampleReviewApprovalResult {
  session: AudiobookRetailSampleReviewSession;
  artifact: ArtifactRecord;
}

export class AudiobookRetailSampleReviewError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailSampleReviewError";
    this.code = code;
  }
}

export class AudiobookRetailSampleReviewStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudiobookRetailSampleReviewStoreConflictError";
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
] as const satisfies readonly AudiobookRetailSampleReviewRole[]);
const REQUIRED_PLAYBACK_CONTEXTS = Object.freeze([
  "consumer-headphones",
  "speakers",
  "studio-headphones",
] as const satisfies readonly AudiobookRetailSamplePlaybackContext[]);
const PLAYBACK_CONTEXTS: ReadonlySet<AudiobookRetailSamplePlaybackContext> =
  new Set([
    "studio-headphones",
    "consumer-headphones",
    "speakers",
    "mobile-device",
  ]);
const SCORE_KEYS = Object.freeze([
  "startBoundaryIntegrity",
  "endBoundaryIntegrity",
  "contentContinuity",
  "representativeness",
  "spokenClarity",
  "encodingTransparency",
  "levelAndToneConsistency",
  "freedomFromDefects",
] as const satisfies readonly (keyof AudiobookRetailSampleReviewScores)[]);
const FULL_LISTEN_TOLERANCE_MS = 1_000;
const MAX_DURATION_MS = 300_000 + 10_000;
const MAX_REVIEW_ENTRIES = 100;
const MAX_NOTES_LENGTH = 8_000;
const MAX_FINDING_CODES = 100;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailSampleReviewError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailSampleReviewError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailSampleReviewError(code);
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
    throw new AudiobookRetailSampleReviewError(code);
  }
  return value;
}

function requireHumanActor(value: string, code: string): string {
  requireIdentifier(value, code);
  if (HUMAN_BLOCKLIST.test(value)) {
    throw new AudiobookRetailSampleReviewError(code);
  }
  return value;
}

function requireNotes(
  value: string | undefined,
  required: boolean,
): string | undefined {
  if (value === undefined) {
    if (required) {
      throw new AudiobookRetailSampleReviewError(
        "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_NOTES_REQUIRED",
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
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_NOTES_INVALID",
    );
  }
  return trimmed;
}

function assertScores(scores: AudiobookRetailSampleReviewScores): void {
  for (const key of SCORE_KEYS) {
    const value = scores[key];
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new AudiobookRetailSampleReviewError(
        "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_SCORE_INVALID",
      );
    }
  }
}

function freezeScores(
  scores: AudiobookRetailSampleReviewScores,
): AudiobookRetailSampleReviewScores {
  assertScores(scores);
  return Object.freeze({ ...scores });
}

function normaliseContexts(
  role: AudiobookRetailSampleReviewRole,
  contexts: readonly AudiobookRetailSamplePlaybackContext[],
): readonly AudiobookRetailSamplePlaybackContext[] {
  if (!REQUIRED_ROLES.includes(role)) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ROLE_INVALID",
    );
  }
  if (!Array.isArray(contexts) || contexts.length === 0 || contexts.length > 4) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_PLAYBACK_CONTEXTS_INVALID",
    );
  }
  const unique = new Set<AudiobookRetailSamplePlaybackContext>();
  for (const context of contexts) {
    if (!PLAYBACK_CONTEXTS.has(context) || unique.has(context)) {
      throw new AudiobookRetailSampleReviewError(
        "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_PLAYBACK_CONTEXTS_INVALID",
      );
    }
    unique.add(context);
  }
  if (role === "engineering" && !unique.has("studio-headphones")) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ENGINEERING_STUDIO_CONTEXT_REQUIRED",
    );
  }
  if (
    role === "editorial"
    && !unique.has("consumer-headphones")
    && !unique.has("speakers")
    && !unique.has("mobile-device")
  ) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_EDITORIAL_CONSUMER_CONTEXT_REQUIRED",
    );
  }
  return Object.freeze(
    [...unique].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function normaliseFindingCodes(
  decision: AudiobookRetailSampleReviewDecision,
  values: readonly string[] | undefined,
): readonly string[] {
  const codes = values ?? [];
  if (!Array.isArray(codes) || codes.length > MAX_FINDING_CODES) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_FINDING_CODES_INVALID",
    );
  }
  const unique = new Set<string>();
  for (const code of codes) {
    if (!FINDING_CODE_PATTERN.test(code) || unique.has(code)) {
      throw new AudiobookRetailSampleReviewError(
        "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_FINDING_CODES_INVALID",
      );
    }
    unique.add(code);
  }
  if (decision === "approve" && unique.size > 0) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_APPROVAL_FINDINGS_FORBIDDEN",
    );
  }
  if (decision === "changes-requested" && unique.size === 0) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_CHANGE_FINDINGS_REQUIRED",
    );
  }
  return Object.freeze(
    [...unique].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function reviewFingerprint(
  value: Omit<AudiobookRetailSampleReviewEntry, "fingerprint">,
): string {
  return stableHash(value);
}

function approvalFingerprint(
  value: Omit<AudiobookRetailSampleReviewApproval, "fingerprint">,
): string {
  return stableHash(value);
}

function sessionFingerprint(
  value: Omit<AudiobookRetailSampleReviewSession, "fingerprint">,
): string {
  return stableHash(value);
}

function latestReviews(
  reviews: readonly AudiobookRetailSampleReviewEntry[],
): ReadonlyMap<
  AudiobookRetailSampleReviewRole,
  AudiobookRetailSampleReviewEntry
> {
  const latest = new Map<
    AudiobookRetailSampleReviewRole,
    AudiobookRetailSampleReviewEntry
  >();
  for (const review of reviews) latest.set(review.role, review);
  return latest;
}

function minimumScore(review: AudiobookRetailSampleReviewEntry): number {
  return Math.min(...SCORE_KEYS.map((key) => review.scores[key]));
}

function aggregatePlaybackContexts(
  reviews: Iterable<AudiobookRetailSampleReviewEntry>,
): ReadonlySet<AudiobookRetailSamplePlaybackContext> {
  const contexts = new Set<AudiobookRetailSamplePlaybackContext>();
  for (const review of reviews) {
    for (const context of review.playbackContexts) contexts.add(context);
  }
  return contexts;
}

function hasRequiredPlaybackCoverage(
  reviews: Iterable<AudiobookRetailSampleReviewEntry>,
): boolean {
  const contexts = aggregatePlaybackContexts(reviews);
  return REQUIRED_PLAYBACK_CONTEXTS.every((context) => contexts.has(context));
}

function reviewerSetFingerprint(
  reviews: ReadonlyMap<
    AudiobookRetailSampleReviewRole,
    AudiobookRetailSampleReviewEntry
  >,
): string {
  const editorial = reviews.get("editorial");
  const engineering = reviews.get("engineering");
  if (!editorial || !engineering) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_REVIEWER_SET_INCOMPLETE",
    );
  }
  return stableHash({
    editorial: {
      reviewerId: editorial.reviewerId,
      reviewFingerprint: editorial.fingerprint,
    },
    engineering: {
      reviewerId: engineering.reviewerId,
      reviewFingerprint: engineering.fingerprint,
    },
  });
}

function statusFromReviews(
  reviews: readonly AudiobookRetailSampleReviewEntry[],
): Exclude<AudiobookRetailSampleReviewStatus, "approved"> {
  const latest = latestReviews(reviews);
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
    && hasRequiredPlaybackCoverage(
      roleReviews as AudiobookRetailSampleReviewEntry[],
    )
  ) {
    return "ready-for-approval";
  }
  return "open";
}

function requireCurrentRights(artifact: ArtifactRecord, now: Date): void {
  if (!artifact.rights.allowedUses.includes("audiobook")) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_AUDIOBOOK_RIGHTS_REQUIRED",
    );
  }
  if (!artifact.rights.commercialUseApproved) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_COMMERCIAL_RIGHTS_REQUIRED",
    );
  }
  if (
    artifact.rights.expiresAt
    && Date.parse(artifact.rights.expiresAt) <= now.getTime()
  ) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_RIGHTS_EXPIRED",
    );
  }
  if (
    artifact.rights.deletionRequiredAt
    && Date.parse(artifact.rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_RETENTION_EXPIRED",
    );
  }
}

function assertReviewableSubject(
  chain: AudiobookRetailSampleChain,
  now: Date,
): ArtifactRecord {
  assertAudiobookRetailSampleChain(chain);
  const artifact = chain.sample.payload;
  if (
    !chain.eligibleForReview
    || chain.findingCodes.length !== 0
    || !chain.engineering.candidateEligible
    || chain.engineering.evidence.findings.some(
      (finding) => finding.severity === "error",
    )
    || artifact.kind !== "audiobook-retail-sample"
    || artifact.projectId !== chain.projectId
    || artifact.jobId !== chain.jobId
    || artifact.segmentId !== chain.bookId
    || artifact.takeId !== chain.takeId
    || artifact.verification.status !== "verified"
    || artifact.review.status !== "pending"
    || artifact.review.required !== true
    || artifact.quarantine !== undefined
    || artifact.integrity.mimeType !== "audio/mpeg"
    || artifact.integrity.format !== "mp3"
    || artifact.rights.rightsFingerprint
      !== chain.approvedSource.rightsFingerprint
    || chain.engineering.evidence.inputContentHash
      !== artifact.integrity.contentHash
    || chain.engineering.evidence.inputByteCount
      !== artifact.integrity.byteCount
    || chain.durationDriftMs > 1_000
  ) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_SUBJECT_MISMATCH",
    );
  }
  requireCurrentRights(artifact, now);
  return artifact;
}

function assertSubjectMatchesSession(
  session: AudiobookRetailSampleReviewSession,
  chain: AudiobookRetailSampleChain,
  now: Date,
): ArtifactRecord {
  const artifact = assertReviewableSubject(chain, now);
  if (
    session.projectId !== chain.projectId
    || session.bookId !== chain.bookId
    || session.chainFingerprint !== chain.fingerprint
    || session.plan.id !== chain.planId
    || session.plan.fingerprint !== chain.planFingerprint
    || session.sampleArtifact.id !== artifact.id
    || session.sampleArtifact.kind !== artifact.kind
    || session.sampleArtifact.revision !== artifact.revision
    || session.sampleArtifact.fingerprint !== artifact.fingerprint
    || session.sampleArtifact.contentHash !== artifact.integrity.contentHash
    || session.sampleArtifact.byteCount !== artifact.integrity.byteCount
    || session.sampleArtifact.reviewFingerprint !== stableHash(artifact.review)
    || session.engineering.evidenceFingerprint
      !== chain.engineering.evidence.fingerprint
    || session.engineering.profileFingerprint
      !== chain.engineeringProfile.fingerprint
    || session.durationMs !== chain.observedDurationMs
  ) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_SESSION_SUBJECT_MISMATCH",
    );
  }
  return artifact;
}

function assertReview(
  review: AudiobookRetailSampleReviewEntry,
  session: Pick<AudiobookRetailSampleReviewSession, "durationMs">,
): void {
  requireIdentifier(
    review.id,
    "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ENTRY_ID_INVALID",
  );
  if (!REQUIRED_ROLES.includes(review.role)) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ROLE_INVALID",
    );
  }
  requireHumanActor(
    review.reviewerId,
    "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_REVIEWER_INVALID",
  );
  if (
    review.completePlaybackConfirmed !== true
    || review.startBoundaryConfirmed !== true
    || review.endBoundaryConfirmed !== true
    || review.sourceContinuityConfirmed !== true
    || review.retailSuitabilityConfirmed !== true
    || review.contentSafetyConfirmed !== true
  ) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_COMPLETE_PLAYBACK_REQUIRED",
    );
  }
  requireInteger(
    review.listenedDurationMs,
    Math.max(1, session.durationMs - FULL_LISTEN_TOLERANCE_MS),
    session.durationMs * 2 + 5 * 60_000,
    "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_LISTEN_DURATION_INVALID",
  );
  normaliseContexts(review.role, review.playbackContexts);
  if (
    review.decision !== "approve"
    && review.decision !== "changes-requested"
  ) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_DECISION_INVALID",
    );
  }
  assertScores(review.scores);
  normaliseFindingCodes(review.decision, review.findingCodes);
  requireNotes(review.notes, review.decision === "changes-requested");
  requireDate(
    review.decidedAt,
    "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_DATE_INVALID",
  );
  const { fingerprint, ...partial } = review;
  if (reviewFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ENTRY_FINGERPRINT_INVALID",
    );
  }
}

function reviseSession(
  session: AudiobookRetailSampleReviewSession,
  updates: Partial<Pick<
    AudiobookRetailSampleReviewSession,
    "reviews" | "status" | "approval"
  >>,
  now: Date,
): AudiobookRetailSampleReviewSession {
  assertAudiobookRetailSampleReviewSession(session);
  if (now.getTime() < Date.parse(session.updatedAt)) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_TRANSITION_TIME_REVERSED",
    );
  }
  const {
    fingerprint: _fingerprint,
    previousFingerprint: _previous,
    ...base
  } = session;
  const partial: Omit<AudiobookRetailSampleReviewSession, "fingerprint"> = {
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
  assertAudiobookRetailSampleReviewSession(next);
  return next;
}

export function createAudiobookRetailSampleReviewSession(input: Readonly<{
  id: string;
  chain: AudiobookRetailSampleChain;
  createdAt?: Date;
}>): AudiobookRetailSampleReviewSession {
  requireIdentifier(
    input.id,
    "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_SESSION_ID_INVALID",
  );
  const createdAt = input.createdAt ?? new Date();
  if (Number.isNaN(createdAt.getTime())) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_DATE_INVALID",
    );
  }
  const artifact = assertReviewableSubject(input.chain, createdAt);
  if (
    createdAt.getTime() < Date.parse(input.chain.createdAt)
    || createdAt.getTime() < Date.parse(input.chain.sample.savedAt)
  ) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_DATE_INVALID",
    );
  }
  const partial: Omit<AudiobookRetailSampleReviewSession, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_SAMPLE_REVIEW_SCHEMA_VERSION,
    id: input.id,
    projectId: input.chain.projectId,
    bookId: input.chain.bookId,
    chainFingerprint: input.chain.fingerprint,
    plan: Object.freeze({
      id: input.chain.planId,
      fingerprint: input.chain.planFingerprint,
    }),
    sampleArtifact: Object.freeze({
      id: artifact.id,
      kind: "audiobook-retail-sample",
      revision: artifact.revision,
      fingerprint: artifact.fingerprint,
      contentHash: artifact.integrity.contentHash,
      byteCount: artifact.integrity.byteCount,
      reviewFingerprint: stableHash(artifact.review),
    }),
    engineering: Object.freeze({
      evidenceFingerprint: input.chain.engineering.evidence.fingerprint,
      profileFingerprint: input.chain.engineeringProfile.fingerprint,
    }),
    durationMs: input.chain.observedDurationMs,
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
  assertAudiobookRetailSampleReviewSession(session);
  return session;
}

export function recordAudiobookRetailSampleReview(
  session: AudiobookRetailSampleReviewSession,
  input: Readonly<{
    id: string;
    role: AudiobookRetailSampleReviewRole;
    reviewerId: string;
    completePlaybackConfirmed: true;
    listenedDurationMs: number;
    startBoundaryConfirmed: true;
    endBoundaryConfirmed: true;
    sourceContinuityConfirmed: true;
    retailSuitabilityConfirmed: true;
    contentSafetyConfirmed: true;
    playbackContexts: readonly AudiobookRetailSamplePlaybackContext[];
    decision: AudiobookRetailSampleReviewDecision;
    scores: AudiobookRetailSampleReviewScores;
    findingCodes?: readonly string[];
    notes?: string;
    decidedAt?: Date;
  }>,
): AudiobookRetailSampleReviewSession {
  assertAudiobookRetailSampleReviewSession(session);
  if (session.status === "approved") {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_SESSION_APPROVED_IMMUTABLE",
    );
  }
  requireIdentifier(
    input.id,
    "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ENTRY_ID_INVALID",
  );
  if (session.reviews.some((review) => review.id === input.id)) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ENTRY_ID_DUPLICATE",
    );
  }
  const reviewerId = requireHumanActor(
    input.reviewerId,
    "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_REVIEWER_INVALID",
  );
  if (
    input.completePlaybackConfirmed !== true
    || input.startBoundaryConfirmed !== true
    || input.endBoundaryConfirmed !== true
    || input.sourceContinuityConfirmed !== true
    || input.retailSuitabilityConfirmed !== true
    || input.contentSafetyConfirmed !== true
  ) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_COMPLETE_PLAYBACK_REQUIRED",
    );
  }
  const listenedDurationMs = requireInteger(
    input.listenedDurationMs,
    Math.max(1, session.durationMs - FULL_LISTEN_TOLERANCE_MS),
    session.durationMs * 2 + 5 * 60_000,
    "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_LISTEN_DURATION_INVALID",
  );
  const contexts = normaliseContexts(input.role, input.playbackContexts);
  const findingCodes = normaliseFindingCodes(
    input.decision,
    input.findingCodes,
  );
  const notes = requireNotes(
    input.notes,
    input.decision === "changes-requested",
  );
  const decidedAt = input.decidedAt ?? new Date();
  if (
    Number.isNaN(decidedAt.getTime())
    || decidedAt.getTime() < Date.parse(session.updatedAt)
  ) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_DATE_INVALID",
    );
  }
  const latest = latestReviews(session.reviews);
  for (const [role, review] of latest) {
    if (role !== input.role && review.reviewerId === reviewerId) {
      throw new AudiobookRetailSampleReviewError(
        "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_INDEPENDENT_REVIEWERS_REQUIRED",
      );
    }
  }
  const reviewBase: Omit<AudiobookRetailSampleReviewEntry, "fingerprint"> = {
    id: input.id,
    role: input.role,
    reviewerId,
    completePlaybackConfirmed: true,
    listenedDurationMs,
    startBoundaryConfirmed: true,
    endBoundaryConfirmed: true,
    sourceContinuityConfirmed: true,
    retailSuitabilityConfirmed: true,
    contentSafetyConfirmed: true,
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

export function approveAudiobookRetailSampleReview(
  session: AudiobookRetailSampleReviewSession,
  chain: AudiobookRetailSampleChain,
  input: Readonly<{
    finalConfirmationId: string;
    approvedByActorId: string;
    humanConfirmation: true;
    approvedAt?: Date;
  }>,
): AudiobookRetailSampleReviewApprovalResult {
  assertAudiobookRetailSampleReviewSession(session);
  if (session.status === "approved") {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_SESSION_APPROVED_IMMUTABLE",
    );
  }
  if (input.humanConfirmation !== true) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_HUMAN_CONFIRMATION_REQUIRED",
    );
  }
  requireIdentifier(
    input.finalConfirmationId,
    "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_FINAL_CONFIRMATION_ID_INVALID",
  );
  const approvedByActorId = requireHumanActor(
    input.approvedByActorId,
    "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_APPROVER_INVALID",
  );
  if (session.status !== "ready-for-approval") {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_NOT_READY_FOR_APPROVAL",
    );
  }
  const approvedAt = input.approvedAt ?? new Date();
  if (
    Number.isNaN(approvedAt.getTime())
    || approvedAt.getTime() < Date.parse(session.updatedAt)
  ) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_APPROVAL_DATE_INVALID",
    );
  }
  const artifact = assertSubjectMatchesSession(session, chain, approvedAt);
  const latest = latestReviews(session.reviews);
  const roleReviews = REQUIRED_ROLES.map((role) => latest.get(role));
  if (
    !roleReviews.every((review) => review?.decision === "approve")
    || !roleReviews.every((review) => minimumScore(review!) >= 4)
    || !roleReviews.every((review) => review!.findingCodes.length === 0)
    || new Set(roleReviews.map((review) => review!.reviewerId)).size
      !== REQUIRED_ROLES.length
    || !hasRequiredPlaybackCoverage(
      roleReviews as AudiobookRetailSampleReviewEntry[],
    )
  ) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_NOT_READY_FOR_APPROVAL",
    );
  }
  if (roleReviews.some((review) => review!.reviewerId === approvedByActorId)) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_INDEPENDENT_APPROVER_REQUIRED",
    );
  }
  requireCurrentRights(artifact, approvedAt);
  const approvedArtifact = recordArtifactReview(artifact, {
    decision: "approved",
    reviewerId: approvedByActorId,
    notes: `Approved through retail sample review session ${session.id}.`,
    decidedAt: approvedAt,
  });
  const approvalBase: Omit<AudiobookRetailSampleReviewApproval, "fingerprint"> = {
    finalConfirmationId: input.finalConfirmationId,
    approvedByActorId,
    approvedAt: approvedAt.toISOString(),
    reviewerSetFingerprint: reviewerSetFingerprint(latest),
    artifactReviewFingerprint: stableHash(approvedArtifact.review),
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

export function assertAudiobookRetailSampleReviewSession(
  session: AudiobookRetailSampleReviewSession,
): void {
  if (
    session.schemaVersion !== AUDIOBOOK_RETAIL_SAMPLE_REVIEW_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [session.id, "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_SESSION_ID_INVALID"],
    [session.projectId, "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_PROJECT_ID_INVALID"],
    [session.bookId, "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_BOOK_ID_INVALID"],
    [session.plan.id, "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_PLAN_ID_INVALID"],
    [session.sampleArtifact.id, "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ARTIFACT_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  for (const [value, code] of [
    [session.chainFingerprint, "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_CHAIN_HASH_INVALID"],
    [session.plan.fingerprint, "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_PLAN_HASH_INVALID"],
    [session.sampleArtifact.fingerprint, "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ARTIFACT_FINGERPRINT_INVALID"],
    [session.sampleArtifact.contentHash, "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ARTIFACT_HASH_INVALID"],
    [session.sampleArtifact.reviewFingerprint, "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ARTIFACT_REVIEW_HASH_INVALID"],
    [session.engineering.evidenceFingerprint, "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ENGINEERING_HASH_INVALID"],
    [session.engineering.profileFingerprint, "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_PROFILE_HASH_INVALID"],
  ] as const) requireHash(value, code);
  if (session.sampleArtifact.kind !== "audiobook-retail-sample") {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ARTIFACT_KIND_INVALID",
    );
  }
  requireInteger(
    session.sampleArtifact.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ARTIFACT_REVISION_INVALID",
  );
  requireInteger(
    session.sampleArtifact.byteCount,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ARTIFACT_SIZE_INVALID",
  );
  requireInteger(
    session.durationMs,
    1,
    MAX_DURATION_MS,
    "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_DURATION_INVALID",
  );
  if (stableHash(session.requiredRoles) !== stableHash(REQUIRED_ROLES)) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_REQUIRED_ROLES_INVALID",
    );
  }
  if (
    !Array.isArray(session.reviews)
    || session.reviews.length > MAX_REVIEW_ENTRIES
  ) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ENTRIES_INVALID",
    );
  }
  const createdAt = requireDate(
    session.createdAt,
    "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_DATE_INVALID",
  );
  const updatedAt = requireDate(
    session.updatedAt,
    "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_DATE_INVALID",
  );
  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_TRANSITION_TIME_REVERSED",
    );
  }
  const ids = new Set<string>();
  let previousAt = Date.parse(createdAt);
  for (const review of session.reviews) {
    assertReview(review, session);
    if (ids.has(review.id)) {
      throw new AudiobookRetailSampleReviewError(
        "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ENTRY_ID_DUPLICATE",
      );
    }
    ids.add(review.id);
    const decidedAt = Date.parse(review.decidedAt);
    if (decidedAt < previousAt) {
      throw new AudiobookRetailSampleReviewError(
        "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_TRANSITION_TIME_REVERSED",
      );
    }
    previousAt = decidedAt;
  }
  if (Date.parse(updatedAt) < previousAt) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_TRANSITION_TIME_REVERSED",
    );
  }
  const latest = latestReviews(session.reviews);
  const latestReviewers = [...latest.values()].map((review) => review.reviewerId);
  if (new Set(latestReviewers).size !== latestReviewers.length) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_INDEPENDENT_REVIEWERS_REQUIRED",
    );
  }
  requireInteger(
    session.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_REVISION_INVALID",
  );
  if (session.revision === 1 && session.previousFingerprint !== undefined) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_REVISION_CHAIN_INVALID",
    );
  }
  if (session.revision > 1) {
    requireHash(
      session.previousFingerprint ?? "",
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_REVISION_CHAIN_INVALID",
    );
  }
  const reviewStatus = statusFromReviews(session.reviews);
  const expectedStatus = session.approval ? "approved" : reviewStatus;
  if (session.status !== expectedStatus) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_STATUS_MISMATCH",
    );
  }
  if (session.approval) {
    if (reviewStatus !== "ready-for-approval") {
      throw new AudiobookRetailSampleReviewError(
        "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_APPROVAL_WITHOUT_READY_REVIEWS",
      );
    }
    requireIdentifier(
      session.approval.finalConfirmationId,
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_FINAL_CONFIRMATION_ID_INVALID",
    );
    requireHumanActor(
      session.approval.approvedByActorId,
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_APPROVER_INVALID",
    );
    requireDate(
      session.approval.approvedAt,
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_APPROVAL_DATE_INVALID",
    );
    if (Date.parse(session.approval.approvedAt) < previousAt) {
      throw new AudiobookRetailSampleReviewError(
        "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_APPROVAL_DATE_INVALID",
      );
    }
    if (latestReviewers.includes(session.approval.approvedByActorId)) {
      throw new AudiobookRetailSampleReviewError(
        "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_INDEPENDENT_APPROVER_REQUIRED",
      );
    }
    if (
      session.approval.reviewerSetFingerprint
        !== reviewerSetFingerprint(latest)
    ) {
      throw new AudiobookRetailSampleReviewError(
        "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_REVIEWER_SET_FINGERPRINT_INVALID",
      );
    }
    requireHash(
      session.approval.artifactReviewFingerprint,
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_APPROVED_REVIEW_HASH_INVALID",
    );
    if (
      session.approval.approvedArtifactRevision
        !== session.sampleArtifact.revision + 1
    ) {
      throw new AudiobookRetailSampleReviewError(
        "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_APPROVED_ARTIFACT_REVISION_INVALID",
      );
    }
    requireHash(
      session.approval.approvedArtifactFingerprint,
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_APPROVED_ARTIFACT_HASH_INVALID",
    );
    const { fingerprint, ...partial } = session.approval;
    if (approvalFingerprint(partial) !== fingerprint) {
      throw new AudiobookRetailSampleReviewError(
        "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_APPROVAL_FINGERPRINT_INVALID",
      );
    }
  }
  const { fingerprint, ...partial } = session;
  if (sessionFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_SESSION_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailSampleReviewMatchesChain(
  session: AudiobookRetailSampleReviewSession,
  chain: AudiobookRetailSampleChain,
  input: Readonly<{
    approvedArtifact?: ArtifactRecord;
    now?: Date;
  }> = {},
): void {
  assertAudiobookRetailSampleReviewSession(session);
  const now = input.now ?? new Date(session.updatedAt);
  if (Number.isNaN(now.getTime())) {
    throw new AudiobookRetailSampleReviewError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_DATE_INVALID",
    );
  }
  assertSubjectMatchesSession(session, chain, now);
  if (session.status === "approved") {
    const approved = input.approvedArtifact;
    if (!approved || !session.approval) {
      throw new AudiobookRetailSampleReviewError(
        "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_APPROVED_ARTIFACT_REQUIRED",
      );
    }
    assertArtifactRecord(approved);
    if (
      approved.id !== session.sampleArtifact.id
      || approved.kind !== "audiobook-retail-sample"
      || approved.projectId !== session.projectId
      || approved.revision !== session.approval.approvedArtifactRevision
      || approved.previousFingerprint !== session.sampleArtifact.fingerprint
      || approved.fingerprint !== session.approval.approvedArtifactFingerprint
      || stableHash(approved.review)
        !== session.approval.artifactReviewFingerprint
      || approved.review.status !== "approved"
      || approved.review.reviewerId !== session.approval.approvedByActorId
      || approved.verification.status !== "verified"
      || approved.quarantine !== undefined
    ) {
      throw new AudiobookRetailSampleReviewError(
        "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_APPROVED_ARTIFACT_MISMATCH",
      );
    }
  }
}

function scoreAverages(
  reviews: readonly AudiobookRetailSampleReviewEntry[],
): AudiobookRetailSampleReviewScores | null {
  const latest = [...latestReviews(reviews).values()];
  if (latest.length === 0) return null;
  return Object.freeze(Object.fromEntries(
    SCORE_KEYS.map((key) => [
      key,
      Number((
        latest.reduce((total, review) => total + review.scores[key], 0)
        / latest.length
      ).toFixed(2)),
    ]),
  )) as unknown as AudiobookRetailSampleReviewScores;
}

export function audiobookRetailSampleReviewPublicView(
  session: AudiobookRetailSampleReviewSession,
): AudiobookRetailSampleReviewPublicView {
  assertAudiobookRetailSampleReviewSession(session);
  const latest = latestReviews(session.reviews);
  const contexts = aggregatePlaybackContexts(latest.values());
  const findingCodes = new Set<string>();
  for (const review of latest.values()) {
    for (const code of review.findingCodes) findingCodes.add(code);
  }
  return Object.freeze({
    id: session.id,
    bookId: session.bookId,
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
): StoredEnvelope<AudiobookRetailSampleReviewSession> {
  const session = envelope.payload as unknown as AudiobookRetailSampleReviewSession;
  assertAudiobookRetailSampleReviewSession(session);
  if (
    envelope.entityType !== AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ENTITY_TYPE
    || envelope.entityId !== session.id
    || envelope.revision !== session.revision
  ) {
    throw new AudiobookRetailSampleReviewStoreConflictError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<AudiobookRetailSampleReviewSession>;
}

function payload(
  session: AudiobookRetailSampleReviewSession,
): Record<string, unknown> {
  return session as unknown as Record<string, unknown>;
}

export class FileAudiobookRetailSampleReviewStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    session: AudiobookRetailSampleReviewSession,
    actorId: string,
  ): Promise<StoredEnvelope<AudiobookRetailSampleReviewSession>> {
    assertAudiobookRetailSampleReviewSession(session);
    requireIdentifier(
      actorId,
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_STORE_ACTOR_INVALID",
    );
    try {
      const existing = await this.read(session.id);
      if (existing) {
        if (existing.payload.fingerprint === session.fingerprint) return existing;
        throw new AudiobookRetailSampleReviewStoreConflictError(
          "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_STORE_IDEMPOTENCY_CONFLICT",
        );
      }
      const envelope = toEnvelope(await this.#store.create(
        AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ENTITY_TYPE,
        session.id,
        payload(session),
        new Date(session.createdAt),
      ));
      await this.#audit(
        actorId,
        "audiobook_retail_sample_review.created",
        envelope,
      );
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailSampleReviewStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(
    sessionId: string,
  ): Promise<StoredEnvelope<AudiobookRetailSampleReviewSession> | null> {
    requireIdentifier(
      sessionId,
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_STORE_ID_INVALID",
    );
    const envelope = await this.#store.read<Record<string, unknown>>(
      AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ENTITY_TYPE,
      sessionId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(
    sessionId: string,
  ): Promise<StoredEnvelope<AudiobookRetailSampleReviewSession>> {
    const envelope = await this.read(sessionId);
    if (!envelope) {
      throw new AudiobookRetailSampleReviewStoreConflictError(
        "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }

  async save(
    session: AudiobookRetailSampleReviewSession,
    input: Readonly<{
      expectedRevision: number;
      actorId: string;
      action: string;
    }>,
  ): Promise<StoredEnvelope<AudiobookRetailSampleReviewSession>> {
    assertAudiobookRetailSampleReviewSession(session);
    requireIdentifier(
      input.actorId,
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_STORE_ACTOR_INVALID",
    );
    if (
      !/^audiobook_retail_sample_review\.[a-z][a-z0-9._-]{1,80}$/u.test(
        input.action,
      )
    ) {
      throw new AudiobookRetailSampleReviewStoreConflictError(
        "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_STORE_ACTION_INVALID",
      );
    }
    const current = await this.require(session.id);
    if (
      current.revision !== input.expectedRevision
      || session.revision !== current.payload.revision + 1
      || session.previousFingerprint !== current.payload.fingerprint
    ) {
      throw new AudiobookRetailSampleReviewStoreConflictError(
        "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_STORE_REVISION_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.replace(
        AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ENTITY_TYPE,
        session.id,
        input.expectedRevision,
        payload(session),
        new Date(session.updatedAt),
      ));
      await this.#audit(input.actorId, input.action, envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailSampleReviewStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async #audit(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<AudiobookRetailSampleReviewSession>,
  ): Promise<void> {
    const latest = latestReviews(envelope.payload.reviews);
    const contexts = aggregatePlaybackContexts(latest.values());
    const findingCodes = new Set<string>();
    for (const review of latest.values()) {
      for (const code of review.findingCodes) findingCodes.add(code);
    }
    const readyForApproval =
      envelope.payload.status === "ready-for-approval";
    await this.#store.appendAuditEvent({
      actorId,
      action,
      entityType: AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ENTITY_TYPE,
      entityId: envelope.entityId,
      revision: envelope.revision,
      occurredAt: new Date(envelope.savedAt),
      metadata: {
        status: envelope.payload.status,
        reviewCount: envelope.payload.reviews.length,
        reviewerCount: new Set(
          [...latest.values()].map((review) => review.reviewerId),
        ).size,
        playbackContextCount: contexts.size,
        findingCount: findingCodes.size,
        readyForApproval,
      },
    });
  }
}
