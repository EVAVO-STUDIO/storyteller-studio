import {
  recordArtifactReview,
  type ArtifactRecord,
} from "./artifact-registry.js";
import {
  assertAudiobookRetailTrackEncodeChain,
  type AudiobookRetailEncodedTrack,
  type AudiobookRetailTrackEncodeChain,
} from "./audiobook-retail-track-encode.js";
import { stableHash } from "./index.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";

export const AUDIOBOOK_RETAIL_TRACK_REVIEW_SCHEMA_VERSION =
  "storyteller-audiobook-retail-track-review-v1" as const;
export const AUDIOBOOK_RETAIL_TRACK_REVIEW_ENTITY_TYPE =
  "audiobook-retail-track-review" as const;

export type AudiobookRetailTrackReviewRole = "editorial" | "engineering";
export type AudiobookRetailTrackPlaybackContext =
  | "studio-headphones"
  | "consumer-headphones"
  | "speakers"
  | "mobile-device";
export type AudiobookRetailTrackReviewDecision =
  | "approve"
  | "changes-requested";
export type AudiobookRetailTrackReviewStatus =
  | "open"
  | "changes-requested"
  | "ready-for-approval"
  | "approved";

export interface AudiobookRetailTrackReviewScores {
  spokenHeaderAccuracy: number;
  contentCompleteness: number;
  transitionIntegrity: number;
  silenceIntegrity: number;
  tonalConsistency: number;
  encodingTransparency: number;
  sustainedListenability: number;
  freedomFromDefects: number;
}

export interface AudiobookRetailTrackReviewEntry {
  id: string;
  trackOrdinal: number;
  role: AudiobookRetailTrackReviewRole;
  reviewerId: string;
  completeListenConfirmed: true;
  listenedDurationMs: number;
  headerConfirmed: true;
  openingBoundaryConfirmed: true;
  closingBoundaryConfirmed: true;
  playbackContexts: readonly AudiobookRetailTrackPlaybackContext[];
  decision: AudiobookRetailTrackReviewDecision;
  scores: AudiobookRetailTrackReviewScores;
  findingCodes: readonly string[];
  notes?: string;
  decidedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailTrackReviewTrackSnapshot {
  ordinal: number;
  role: AudiobookRetailEncodedTrack["role"];
  fileName: string;
  expectedDurationMs: number;
  observedDurationMs: number;
  artifact: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
    contentHash: string;
    byteCount: number;
  }>;
  engineeringEvidenceFingerprint: string;
  fingerprint: string;
}

export interface AudiobookRetailTrackReviewApprovedArtifact {
  ordinal: number;
  id: string;
  revision: number;
  fingerprint: string;
  reviewFingerprint: string;
}

export interface AudiobookRetailTrackReviewApproval {
  finalConfirmationId: string;
  approvedByActorId: string;
  approvedAt: string;
  reviewerSetFingerprint: string;
  approvedArtifacts: readonly AudiobookRetailTrackReviewApprovedArtifact[];
  fingerprint: string;
}

export interface AudiobookRetailTrackReviewSession {
  schemaVersion: typeof AUDIOBOOK_RETAIL_TRACK_REVIEW_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  encodeChainFingerprint: string;
  planFingerprint: string;
  engineeringProfileFingerprint: string;
  rightsFingerprint: string;
  tracks: readonly AudiobookRetailTrackReviewTrackSnapshot[];
  requiredRoles: readonly AudiobookRetailTrackReviewRole[];
  reviews: readonly AudiobookRetailTrackReviewEntry[];
  status: AudiobookRetailTrackReviewStatus;
  approval?: AudiobookRetailTrackReviewApproval;
  revision: number;
  previousFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailTrackReviewPublicTrack {
  ordinal: number;
  role: AudiobookRetailEncodedTrack["role"];
  fileName: string;
  expectedDurationMs: number;
  editorialDecision: AudiobookRetailTrackReviewDecision | "pending";
  engineeringDecision: AudiobookRetailTrackReviewDecision | "pending";
  findingCodes: readonly string[];
  ready: boolean;
}

export interface AudiobookRetailTrackReviewPublicView {
  id: string;
  bookId: string;
  trackCount: number;
  requiredRoles: readonly AudiobookRetailTrackReviewRole[];
  reviewCount: number;
  reviewerCount: number;
  playbackContexts: readonly AudiobookRetailTrackPlaybackContext[];
  scoreAverages: AudiobookRetailTrackReviewScores | null;
  findingCodes: readonly string[];
  tracks: readonly AudiobookRetailTrackReviewPublicTrack[];
  status: AudiobookRetailTrackReviewStatus;
  readyForApproval: boolean;
  approvedAt?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailTrackReviewApprovalResult {
  session: AudiobookRetailTrackReviewSession;
  artifacts: readonly ArtifactRecord[];
}

export class AudiobookRetailTrackReviewError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailTrackReviewError";
    this.code = code;
  }
}

export class AudiobookRetailTrackReviewStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudiobookRetailTrackReviewStoreConflictError";
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const FILE_NAME_PATTERN = /^[A-Za-z0-9]+\.mp3$/u;
const FINDING_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,95}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const HUMAN_BLOCKLIST = /^(?:system|worker|automation|automated|bot)(?:[_-]|$)/iu;
const REQUIRED_ROLES = Object.freeze([
  "editorial",
  "engineering",
] as const satisfies readonly AudiobookRetailTrackReviewRole[]);
const REQUIRED_PLAYBACK_CONTEXTS = Object.freeze([
  "consumer-headphones",
  "speakers",
  "studio-headphones",
] as const satisfies readonly AudiobookRetailTrackPlaybackContext[]);
const PLAYBACK_CONTEXTS: ReadonlySet<AudiobookRetailTrackPlaybackContext> =
  new Set([
    "studio-headphones",
    "consumer-headphones",
    "speakers",
    "mobile-device",
  ]);
const SCORE_KEYS = Object.freeze([
  "spokenHeaderAccuracy",
  "contentCompleteness",
  "transitionIntegrity",
  "silenceIntegrity",
  "tonalConsistency",
  "encodingTransparency",
  "sustainedListenability",
  "freedomFromDefects",
] as const satisfies readonly (keyof AudiobookRetailTrackReviewScores)[]);
const FULL_LISTEN_TOLERANCE_MS = 1_000;
const MAX_NOTES_LENGTH = 8_000;
const MAX_FINDING_CODES = 100;
const MAX_REVIEW_ENTRIES = 20_000;
const MAX_TRACKS = 2_002;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailTrackReviewError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailTrackReviewError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailTrackReviewError(code);
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
    throw new AudiobookRetailTrackReviewError(code);
  }
  return value;
}

function requireHumanActor(value: string, code: string): string {
  requireIdentifier(value, code);
  if (HUMAN_BLOCKLIST.test(value)) {
    throw new AudiobookRetailTrackReviewError(code);
  }
  return value;
}

function requireNotes(
  value: string | undefined,
  required: boolean,
): string | undefined {
  if (value === undefined) {
    if (required) {
      throw new AudiobookRetailTrackReviewError(
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_NOTES_REQUIRED",
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
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_NOTES_INVALID",
    );
  }
  return trimmed;
}

function assertScores(scores: AudiobookRetailTrackReviewScores): void {
  for (const key of SCORE_KEYS) {
    const value = scores[key];
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new AudiobookRetailTrackReviewError(
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_SCORE_INVALID",
      );
    }
  }
}

function freezeScores(
  scores: AudiobookRetailTrackReviewScores,
): AudiobookRetailTrackReviewScores {
  assertScores(scores);
  return Object.freeze({ ...scores });
}

function normaliseContexts(
  role: AudiobookRetailTrackReviewRole,
  contexts: readonly AudiobookRetailTrackPlaybackContext[],
): readonly AudiobookRetailTrackPlaybackContext[] {
  if (!REQUIRED_ROLES.includes(role)) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_ROLE_INVALID",
    );
  }
  if (!Array.isArray(contexts) || contexts.length === 0 || contexts.length > 4) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_PLAYBACK_CONTEXTS_INVALID",
    );
  }
  const unique = new Set<AudiobookRetailTrackPlaybackContext>();
  for (const context of contexts) {
    if (!PLAYBACK_CONTEXTS.has(context) || unique.has(context)) {
      throw new AudiobookRetailTrackReviewError(
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_PLAYBACK_CONTEXTS_INVALID",
      );
    }
    unique.add(context);
  }
  if (role === "engineering" && !unique.has("studio-headphones")) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_ENGINEERING_STUDIO_CONTEXT_REQUIRED",
    );
  }
  if (
    role === "editorial"
    && !unique.has("consumer-headphones")
    && !unique.has("speakers")
    && !unique.has("mobile-device")
  ) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_EDITORIAL_CONSUMER_CONTEXT_REQUIRED",
    );
  }
  return Object.freeze(
    [...unique].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function normaliseFindingCodes(
  decision: AudiobookRetailTrackReviewDecision,
  values: readonly string[] | undefined,
): readonly string[] {
  const codes = values ?? [];
  if (!Array.isArray(codes) || codes.length > MAX_FINDING_CODES) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_FINDING_CODES_INVALID",
    );
  }
  const unique = new Set<string>();
  for (const code of codes) {
    if (!FINDING_CODE_PATTERN.test(code) || unique.has(code)) {
      throw new AudiobookRetailTrackReviewError(
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_FINDING_CODES_INVALID",
      );
    }
    unique.add(code);
  }
  if (decision === "approve" && unique.size > 0) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_APPROVAL_FINDINGS_FORBIDDEN",
    );
  }
  if (decision === "changes-requested" && unique.size === 0) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_CHANGE_FINDINGS_REQUIRED",
    );
  }
  return Object.freeze(
    [...unique].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function trackSnapshotFingerprint(
  value: Omit<AudiobookRetailTrackReviewTrackSnapshot, "fingerprint">,
): string {
  return stableHash(value);
}

function reviewFingerprint(
  value: Omit<AudiobookRetailTrackReviewEntry, "fingerprint">,
): string {
  return stableHash(value);
}

function approvalFingerprint(
  value: Omit<AudiobookRetailTrackReviewApproval, "fingerprint">,
): string {
  return stableHash(value);
}

function sessionFingerprint(
  value: Omit<AudiobookRetailTrackReviewSession, "fingerprint">,
): string {
  return stableHash(value);
}

function reviewKey(
  trackOrdinal: number,
  role: AudiobookRetailTrackReviewRole,
): string {
  return `${trackOrdinal}:${role}`;
}

function latestReviews(
  reviews: readonly AudiobookRetailTrackReviewEntry[],
): ReadonlyMap<string, AudiobookRetailTrackReviewEntry> {
  const latest = new Map<string, AudiobookRetailTrackReviewEntry>();
  for (const review of reviews) {
    latest.set(reviewKey(review.trackOrdinal, review.role), review);
  }
  return latest;
}

function minimumScore(review: AudiobookRetailTrackReviewEntry): number {
  return Math.min(...SCORE_KEYS.map((key) => review.scores[key]));
}

function aggregatePlaybackContexts(
  reviews: Iterable<AudiobookRetailTrackReviewEntry>,
): ReadonlySet<AudiobookRetailTrackPlaybackContext> {
  const contexts = new Set<AudiobookRetailTrackPlaybackContext>();
  for (const review of reviews) {
    for (const context of review.playbackContexts) contexts.add(context);
  }
  return contexts;
}

function hasRequiredPlaybackCoverage(
  reviews: Iterable<AudiobookRetailTrackReviewEntry>,
): boolean {
  const contexts = aggregatePlaybackContexts(reviews);
  return REQUIRED_PLAYBACK_CONTEXTS.every((context) => contexts.has(context));
}

function reviewerRolesAreIndependent(
  reviews: Iterable<AudiobookRetailTrackReviewEntry>,
): boolean {
  const roleByReviewer = new Map<string, AudiobookRetailTrackReviewRole>();
  for (const review of reviews) {
    const existing = roleByReviewer.get(review.reviewerId);
    if (existing && existing !== review.role) return false;
    roleByReviewer.set(review.reviewerId, review.role);
  }
  return true;
}

function statusFromReviews(
  tracks: readonly AudiobookRetailTrackReviewTrackSnapshot[],
  reviews: readonly AudiobookRetailTrackReviewEntry[],
): Exclude<AudiobookRetailTrackReviewStatus, "approved"> {
  const latest = latestReviews(reviews);
  if (
    [...latest.values()].some(
      (review) => review.decision === "changes-requested",
    )
  ) {
    return "changes-requested";
  }
  const required = tracks.flatMap((track) =>
    REQUIRED_ROLES.map((role) => latest.get(reviewKey(track.ordinal, role)))
  );
  if (
    required.every((review) => review?.decision === "approve")
    && required.every((review) => minimumScore(review!) >= 4)
    && required.every((review) => review!.findingCodes.length === 0)
    && reviewerRolesAreIndependent(
      required as AudiobookRetailTrackReviewEntry[],
    )
    && hasRequiredPlaybackCoverage(
      required as AudiobookRetailTrackReviewEntry[],
    )
  ) {
    return "ready-for-approval";
  }
  return "open";
}

function currentRights(record: ArtifactRecord, now: Date): void {
  if (!record.rights.allowedUses.includes("audiobook")) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_AUDIOBOOK_RIGHTS_REQUIRED",
    );
  }
  if (!record.rights.commercialUseApproved) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_COMMERCIAL_RIGHTS_REQUIRED",
    );
  }
  if (
    record.rights.expiresAt
    && Date.parse(record.rights.expiresAt) <= now.getTime()
  ) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_RIGHTS_EXPIRED",
    );
  }
  if (
    record.rights.deletionRequiredAt
    && Date.parse(record.rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_RETENTION_EXPIRED",
    );
  }
}

function assertEligibleChain(
  chain: AudiobookRetailTrackEncodeChain,
  now: Date,
): void {
  assertAudiobookRetailTrackEncodeChain(chain);
  if (
    !chain.eligibleForReview
    || chain.findingCodes.length !== 0
    || chain.tracks.length === 0
  ) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_CHAIN_NOT_ELIGIBLE",
    );
  }
  for (const track of chain.tracks) {
    const artifact = track.artifact.payload;
    if (
      !track.eligibleForReview
      || track.findingCodes.length !== 0
      || !track.engineering.candidateEligible
      || track.engineering.evidence.findings.some(
        (finding) => finding.severity === "error",
      )
      || artifact.kind !== "audiobook-retail-track"
      || artifact.projectId !== chain.projectId
      || artifact.jobId !== chain.jobId
      || artifact.verification.status !== "verified"
      || artifact.review.status !== "pending"
      || !artifact.review.required
      || artifact.quarantine !== undefined
      || artifact.rights.rightsFingerprint
        !== chain.referenceMaster.rightsFingerprint
      || track.engineering.evidence.profile.fingerprint
        !== chain.engineeringProfile.fingerprint
    ) {
      throw new AudiobookRetailTrackReviewError(
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_TRACK_NOT_ELIGIBLE",
      );
    }
    currentRights(artifact, now);
  }
}

function snapshotTrack(
  track: AudiobookRetailEncodedTrack,
): AudiobookRetailTrackReviewTrackSnapshot {
  const artifact = track.artifact.payload;
  const partial: Omit<
    AudiobookRetailTrackReviewTrackSnapshot,
    "fingerprint"
  > = {
    ordinal: track.ordinal,
    role: track.role,
    fileName: track.fileName,
    expectedDurationMs: track.expectedDurationMs,
    observedDurationMs: track.observedDurationMs,
    artifact: Object.freeze({
      id: artifact.id,
      revision: artifact.revision,
      fingerprint: artifact.fingerprint,
      contentHash: artifact.integrity.contentHash,
      byteCount: artifact.integrity.byteCount,
    }),
    engineeringEvidenceFingerprint: track.engineering.evidence.fingerprint,
  };
  return Object.freeze({
    ...partial,
    fingerprint: trackSnapshotFingerprint(partial),
  });
}

function assertTrackSnapshot(
  track: AudiobookRetailTrackReviewTrackSnapshot,
): void {
  requireInteger(
    track.ordinal,
    1,
    MAX_TRACKS,
    "AUDIOBOOK_RETAIL_TRACK_REVIEW_TRACK_ORDINAL_INVALID",
  );
  if (!FILE_NAME_PATTERN.test(track.fileName)) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_FILE_NAME_INVALID",
    );
  }
  requireInteger(
    track.expectedDurationMs,
    1,
    7_200_000,
    "AUDIOBOOK_RETAIL_TRACK_REVIEW_DURATION_INVALID",
  );
  requireInteger(
    track.observedDurationMs,
    1,
    7_210_000,
    "AUDIOBOOK_RETAIL_TRACK_REVIEW_DURATION_INVALID",
  );
  requireIdentifier(
    track.artifact.id,
    "AUDIOBOOK_RETAIL_TRACK_REVIEW_ARTIFACT_ID_INVALID",
  );
  requireInteger(
    track.artifact.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_TRACK_REVIEW_ARTIFACT_REVISION_INVALID",
  );
  for (const [value, code] of [
    [
      track.artifact.fingerprint,
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_ARTIFACT_FINGERPRINT_INVALID",
    ],
    [
      track.artifact.contentHash,
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_ARTIFACT_HASH_INVALID",
    ],
    [
      track.engineeringEvidenceFingerprint,
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_ENGINEERING_HASH_INVALID",
    ],
  ] as const) requireHash(value, code);
  requireInteger(
    track.artifact.byteCount,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_TRACK_REVIEW_ARTIFACT_SIZE_INVALID",
  );
  const { fingerprint, ...partial } = track;
  if (trackSnapshotFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_TRACK_FINGERPRINT_INVALID",
    );
  }
}

function assertReviewEntry(
  review: AudiobookRetailTrackReviewEntry,
  tracks: readonly AudiobookRetailTrackReviewTrackSnapshot[],
): void {
  requireIdentifier(
    review.id,
    "AUDIOBOOK_RETAIL_TRACK_REVIEW_ENTRY_ID_INVALID",
  );
  const track = tracks.find((candidate) => candidate.ordinal === review.trackOrdinal);
  if (!track) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_TRACK_NOT_FOUND",
    );
  }
  if (!REQUIRED_ROLES.includes(review.role)) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_ROLE_INVALID",
    );
  }
  requireHumanActor(
    review.reviewerId,
    "AUDIOBOOK_RETAIL_TRACK_REVIEW_REVIEWER_INVALID",
  );
  if (
    review.completeListenConfirmed !== true
    || review.headerConfirmed !== true
    || review.openingBoundaryConfirmed !== true
    || review.closingBoundaryConfirmed !== true
  ) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_COMPLETE_PLAYBACK_REQUIRED",
    );
  }
  requireInteger(
    review.listenedDurationMs,
    Math.max(1, track.observedDurationMs - FULL_LISTEN_TOLERANCE_MS),
    track.observedDurationMs * 2 + 5 * 60_000,
    "AUDIOBOOK_RETAIL_TRACK_REVIEW_LISTEN_DURATION_INVALID",
  );
  normaliseContexts(review.role, review.playbackContexts);
  if (
    review.decision !== "approve"
    && review.decision !== "changes-requested"
  ) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_DECISION_INVALID",
    );
  }
  assertScores(review.scores);
  normaliseFindingCodes(review.decision, review.findingCodes);
  requireNotes(review.notes, review.decision === "changes-requested");
  requireDate(review.decidedAt, "AUDIOBOOK_RETAIL_TRACK_REVIEW_DATE_INVALID");
  const { fingerprint, ...partial } = review;
  if (reviewFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_ENTRY_FINGERPRINT_INVALID",
    );
  }
}

function reviseSession(
  session: AudiobookRetailTrackReviewSession,
  updates: Partial<Pick<
    AudiobookRetailTrackReviewSession,
    "reviews" | "status" | "approval"
  >>,
  now: Date,
): AudiobookRetailTrackReviewSession {
  assertAudiobookRetailTrackReviewSession(session);
  if (now.getTime() < Date.parse(session.updatedAt)) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_TRANSITION_TIME_REVERSED",
    );
  }
  const {
    fingerprint: _fingerprint,
    previousFingerprint: _previous,
    ...base
  } = session;
  const partial: Omit<AudiobookRetailTrackReviewSession, "fingerprint"> = {
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
  assertAudiobookRetailTrackReviewSession(next);
  return next;
}

export function createAudiobookRetailTrackReviewSession(input: Readonly<{
  id: string;
  chain: AudiobookRetailTrackEncodeChain;
  createdAt?: Date;
}>): AudiobookRetailTrackReviewSession {
  requireIdentifier(
    input.id,
    "AUDIOBOOK_RETAIL_TRACK_REVIEW_SESSION_ID_INVALID",
  );
  const createdAt = input.createdAt ?? new Date();
  if (Number.isNaN(createdAt.getTime())) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_DATE_INVALID",
    );
  }
  assertEligibleChain(input.chain, createdAt);
  const tracks = Object.freeze(input.chain.tracks.map(snapshotTrack));
  const partial: Omit<AudiobookRetailTrackReviewSession, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_TRACK_REVIEW_SCHEMA_VERSION,
    id: input.id,
    projectId: input.chain.projectId,
    bookId: input.chain.bookId,
    encodeChainFingerprint: input.chain.fingerprint,
    planFingerprint: input.chain.planFingerprint,
    engineeringProfileFingerprint: input.chain.engineeringProfile.fingerprint,
    rightsFingerprint: input.chain.referenceMaster.rightsFingerprint,
    tracks,
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
  assertAudiobookRetailTrackReviewSession(session);
  return session;
}

export function recordAudiobookRetailTrackReview(
  session: AudiobookRetailTrackReviewSession,
  input: Readonly<{
    id: string;
    trackOrdinal: number;
    role: AudiobookRetailTrackReviewRole;
    reviewerId: string;
    completeListenConfirmed: true;
    listenedDurationMs: number;
    headerConfirmed: true;
    openingBoundaryConfirmed: true;
    closingBoundaryConfirmed: true;
    playbackContexts: readonly AudiobookRetailTrackPlaybackContext[];
    decision: AudiobookRetailTrackReviewDecision;
    scores: AudiobookRetailTrackReviewScores;
    findingCodes?: readonly string[];
    notes?: string;
    decidedAt?: Date;
  }>,
): AudiobookRetailTrackReviewSession {
  assertAudiobookRetailTrackReviewSession(session);
  if (session.status === "approved") {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_SESSION_APPROVED_IMMUTABLE",
    );
  }
  requireIdentifier(
    input.id,
    "AUDIOBOOK_RETAIL_TRACK_REVIEW_ENTRY_ID_INVALID",
  );
  if (session.reviews.some((review) => review.id === input.id)) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_ENTRY_ID_DUPLICATE",
    );
  }
  const track = session.tracks.find(
    (candidate) => candidate.ordinal === input.trackOrdinal,
  );
  if (!track) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_TRACK_NOT_FOUND",
    );
  }
  const reviewerId = requireHumanActor(
    input.reviewerId,
    "AUDIOBOOK_RETAIL_TRACK_REVIEW_REVIEWER_INVALID",
  );
  if (
    input.completeListenConfirmed !== true
    || input.headerConfirmed !== true
    || input.openingBoundaryConfirmed !== true
    || input.closingBoundaryConfirmed !== true
  ) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_COMPLETE_PLAYBACK_REQUIRED",
    );
  }
  const listenedDurationMs = requireInteger(
    input.listenedDurationMs,
    Math.max(1, track.observedDurationMs - FULL_LISTEN_TOLERANCE_MS),
    track.observedDurationMs * 2 + 5 * 60_000,
    "AUDIOBOOK_RETAIL_TRACK_REVIEW_LISTEN_DURATION_INVALID",
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
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_DATE_INVALID",
    );
  }
  const latest = latestReviews(session.reviews);
  for (const review of latest.values()) {
    if (review.role !== input.role && review.reviewerId === reviewerId) {
      throw new AudiobookRetailTrackReviewError(
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_INDEPENDENT_ROLES_REQUIRED",
      );
    }
  }
  const reviewBase: Omit<AudiobookRetailTrackReviewEntry, "fingerprint"> = {
    id: input.id,
    trackOrdinal: input.trackOrdinal,
    role: input.role,
    reviewerId,
    completeListenConfirmed: true,
    listenedDurationMs,
    headerConfirmed: true,
    openingBoundaryConfirmed: true,
    closingBoundaryConfirmed: true,
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
  assertReviewEntry(review, session.tracks);
  const reviews = Object.freeze([...session.reviews, review]);
  return reviseSession(
    session,
    {
      reviews,
      status: statusFromReviews(session.tracks, reviews),
    },
    decidedAt,
  );
}

function assertChainMatchesSession(
  session: AudiobookRetailTrackReviewSession,
  chain: AudiobookRetailTrackEncodeChain,
  now: Date,
): void {
  assertEligibleChain(chain, now);
  if (
    session.projectId !== chain.projectId
    || session.bookId !== chain.bookId
    || session.encodeChainFingerprint !== chain.fingerprint
    || session.planFingerprint !== chain.planFingerprint
    || session.engineeringProfileFingerprint
      !== chain.engineeringProfile.fingerprint
    || session.rightsFingerprint !== chain.referenceMaster.rightsFingerprint
    || session.tracks.length !== chain.tracks.length
  ) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_CHAIN_MISMATCH",
    );
  }
  for (const [index, snapshot] of session.tracks.entries()) {
    const track = chain.tracks[index];
    const artifact = track?.artifact.payload;
    if (
      !track
      || !artifact
      || snapshot.ordinal !== track.ordinal
      || snapshot.role !== track.role
      || snapshot.fileName !== track.fileName
      || snapshot.expectedDurationMs !== track.expectedDurationMs
      || snapshot.observedDurationMs !== track.observedDurationMs
      || snapshot.artifact.id !== artifact.id
      || snapshot.artifact.revision !== artifact.revision
      || snapshot.artifact.fingerprint !== artifact.fingerprint
      || snapshot.artifact.contentHash !== artifact.integrity.contentHash
      || snapshot.artifact.byteCount !== artifact.integrity.byteCount
      || snapshot.engineeringEvidenceFingerprint
        !== track.engineering.evidence.fingerprint
    ) {
      throw new AudiobookRetailTrackReviewError(
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_CHAIN_MISMATCH",
      );
    }
  }
}

function reviewerSetFingerprint(
  session: AudiobookRetailTrackReviewSession,
): string {
  const latest = latestReviews(session.reviews);
  return stableHash(session.tracks.flatMap((track) =>
    REQUIRED_ROLES.map((role) => {
      const review = latest.get(reviewKey(track.ordinal, role));
      if (!review) {
        throw new AudiobookRetailTrackReviewError(
          "AUDIOBOOK_RETAIL_TRACK_REVIEW_REVIEWER_SET_INCOMPLETE",
        );
      }
      return {
        trackOrdinal: track.ordinal,
        role,
        reviewerId: review.reviewerId,
        reviewFingerprint: review.fingerprint,
      };
    })
  ));
}

export function approveAudiobookRetailTrackReview(
  session: AudiobookRetailTrackReviewSession,
  chain: AudiobookRetailTrackEncodeChain,
  input: Readonly<{
    finalConfirmationId: string;
    approvedByActorId: string;
    humanConfirmation: true;
    approvedAt?: Date;
  }>,
): AudiobookRetailTrackReviewApprovalResult {
  assertAudiobookRetailTrackReviewSession(session);
  if (session.status === "approved") {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_SESSION_APPROVED_IMMUTABLE",
    );
  }
  if (input.humanConfirmation !== true) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_HUMAN_CONFIRMATION_REQUIRED",
    );
  }
  requireIdentifier(
    input.finalConfirmationId,
    "AUDIOBOOK_RETAIL_TRACK_REVIEW_FINAL_CONFIRMATION_ID_INVALID",
  );
  const approvedByActorId = requireHumanActor(
    input.approvedByActorId,
    "AUDIOBOOK_RETAIL_TRACK_REVIEW_APPROVER_INVALID",
  );
  if (session.status !== "ready-for-approval") {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_NOT_READY_FOR_APPROVAL",
    );
  }
  const approvedAt = input.approvedAt ?? new Date();
  if (
    Number.isNaN(approvedAt.getTime())
    || approvedAt.getTime() < Date.parse(session.updatedAt)
  ) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_APPROVAL_DATE_INVALID",
    );
  }
  assertChainMatchesSession(session, chain, approvedAt);
  const latest = latestReviews(session.reviews);
  const required = session.tracks.flatMap((track) =>
    REQUIRED_ROLES.map((role) => latest.get(reviewKey(track.ordinal, role)))
  );
  if (
    !required.every((review) => review?.decision === "approve")
    || !required.every((review) => minimumScore(review!) >= 4)
    || !required.every((review) => review!.findingCodes.length === 0)
    || !reviewerRolesAreIndependent(
      required as AudiobookRetailTrackReviewEntry[],
    )
    || !hasRequiredPlaybackCoverage(
      required as AudiobookRetailTrackReviewEntry[],
    )
  ) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_NOT_READY_FOR_APPROVAL",
    );
  }
  const reviewerIds = new Set(
    (required as AudiobookRetailTrackReviewEntry[])
      .map((review) => review.reviewerId),
  );
  if (reviewerIds.has(approvedByActorId)) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_INDEPENDENT_APPROVER_REQUIRED",
    );
  }
  const approvedArtifacts = chain.tracks.map((track) => {
    currentRights(track.artifact.payload, approvedAt);
    return recordArtifactReview(track.artifact.payload, {
      decision: "approved",
      reviewerId: approvedByActorId,
      notes: `Approved through retail track review session ${session.id}.`,
      decidedAt: approvedAt,
    });
  });
  const approvalArtifacts = Object.freeze(approvedArtifacts.map(
    (artifact, index): AudiobookRetailTrackReviewApprovedArtifact => {
      const ordinal = chain.tracks[index]!.ordinal;
      return Object.freeze({
        ordinal,
        id: artifact.id,
        revision: artifact.revision,
        fingerprint: artifact.fingerprint,
        reviewFingerprint: stableHash(artifact.review),
      });
    },
  ));
  const approvalBase: Omit<AudiobookRetailTrackReviewApproval, "fingerprint"> = {
    finalConfirmationId: input.finalConfirmationId,
    approvedByActorId,
    approvedAt: approvedAt.toISOString(),
    reviewerSetFingerprint: reviewerSetFingerprint(session),
    approvedArtifacts: approvalArtifacts,
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
    artifacts: Object.freeze(approvedArtifacts),
  });
}

export function assertAudiobookRetailTrackReviewSession(
  session: AudiobookRetailTrackReviewSession,
): void {
  if (
    session.schemaVersion !== AUDIOBOOK_RETAIL_TRACK_REVIEW_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [session.id, "AUDIOBOOK_RETAIL_TRACK_REVIEW_SESSION_ID_INVALID"],
    [session.projectId, "AUDIOBOOK_RETAIL_TRACK_REVIEW_PROJECT_ID_INVALID"],
    [session.bookId, "AUDIOBOOK_RETAIL_TRACK_REVIEW_BOOK_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  for (const [value, code] of [
    [
      session.encodeChainFingerprint,
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_CHAIN_HASH_INVALID",
    ],
    [
      session.planFingerprint,
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_PLAN_HASH_INVALID",
    ],
    [
      session.engineeringProfileFingerprint,
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_PROFILE_HASH_INVALID",
    ],
    [
      session.rightsFingerprint,
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_RIGHTS_HASH_INVALID",
    ],
  ] as const) requireHash(value, code);
  if (
    !Array.isArray(session.tracks)
    || session.tracks.length === 0
    || session.tracks.length > MAX_TRACKS
  ) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_TRACKS_INVALID",
    );
  }
  const artifactIds = new Set<string>();
  const fileNames = new Set<string>();
  for (const [index, track] of session.tracks.entries()) {
    assertTrackSnapshot(track);
    if (
      track.ordinal !== index + 1
      || artifactIds.has(track.artifact.id)
      || fileNames.has(track.fileName)
    ) {
      throw new AudiobookRetailTrackReviewError(
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_TRACK_ORDER_INVALID",
      );
    }
    artifactIds.add(track.artifact.id);
    fileNames.add(track.fileName);
  }
  if (stableHash(session.requiredRoles) !== stableHash(REQUIRED_ROLES)) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_REQUIRED_ROLES_INVALID",
    );
  }
  if (
    !Array.isArray(session.reviews)
    || session.reviews.length > MAX_REVIEW_ENTRIES
  ) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_ENTRIES_INVALID",
    );
  }
  const createdAt = requireDate(
    session.createdAt,
    "AUDIOBOOK_RETAIL_TRACK_REVIEW_DATE_INVALID",
  );
  const updatedAt = requireDate(
    session.updatedAt,
    "AUDIOBOOK_RETAIL_TRACK_REVIEW_DATE_INVALID",
  );
  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_TRANSITION_TIME_REVERSED",
    );
  }
  const reviewIds = new Set<string>();
  let previousAt = Date.parse(createdAt);
  for (const review of session.reviews) {
    assertReviewEntry(review, session.tracks);
    if (reviewIds.has(review.id)) {
      throw new AudiobookRetailTrackReviewError(
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_ENTRY_ID_DUPLICATE",
      );
    }
    reviewIds.add(review.id);
    const decidedAt = Date.parse(review.decidedAt);
    if (decidedAt < previousAt) {
      throw new AudiobookRetailTrackReviewError(
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_TRANSITION_TIME_REVERSED",
      );
    }
    previousAt = decidedAt;
  }
  if (Date.parse(updatedAt) < previousAt) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_TRANSITION_TIME_REVERSED",
    );
  }
  const latest = latestReviews(session.reviews);
  if (!reviewerRolesAreIndependent(latest.values())) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_INDEPENDENT_ROLES_REQUIRED",
    );
  }
  requireInteger(
    session.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_TRACK_REVIEW_REVISION_INVALID",
  );
  if (session.revision === 1 && session.previousFingerprint !== undefined) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_REVISION_CHAIN_INVALID",
    );
  }
  if (session.revision > 1) {
    requireHash(
      session.previousFingerprint ?? "",
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_REVISION_CHAIN_INVALID",
    );
  }
  const reviewStatus = statusFromReviews(session.tracks, session.reviews);
  const expectedStatus = session.approval ? "approved" : reviewStatus;
  if (session.status !== expectedStatus) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_STATUS_MISMATCH",
    );
  }
  if (session.approval) {
    if (reviewStatus !== "ready-for-approval") {
      throw new AudiobookRetailTrackReviewError(
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_APPROVAL_WITHOUT_READY_REVIEWS",
      );
    }
    requireIdentifier(
      session.approval.finalConfirmationId,
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_FINAL_CONFIRMATION_ID_INVALID",
    );
    requireHumanActor(
      session.approval.approvedByActorId,
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_APPROVER_INVALID",
    );
    requireDate(
      session.approval.approvedAt,
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_APPROVAL_DATE_INVALID",
    );
    if (Date.parse(session.approval.approvedAt) < previousAt) {
      throw new AudiobookRetailTrackReviewError(
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_APPROVAL_DATE_INVALID",
      );
    }
    const reviewerIds = new Set(
      [...latest.values()].map((review) => review.reviewerId),
    );
    if (reviewerIds.has(session.approval.approvedByActorId)) {
      throw new AudiobookRetailTrackReviewError(
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_INDEPENDENT_APPROVER_REQUIRED",
      );
    }
    if (
      session.approval.reviewerSetFingerprint
        !== reviewerSetFingerprint(session)
    ) {
      throw new AudiobookRetailTrackReviewError(
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_REVIEWER_SET_FINGERPRINT_INVALID",
      );
    }
    if (
      !Array.isArray(session.approval.approvedArtifacts)
      || session.approval.approvedArtifacts.length !== session.tracks.length
    ) {
      throw new AudiobookRetailTrackReviewError(
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_APPROVED_ARTIFACTS_INVALID",
      );
    }
    for (const [index, approved] of session.approval.approvedArtifacts.entries()) {
      const track = session.tracks[index]!;
      if (
        approved.ordinal !== track.ordinal
        || approved.id !== track.artifact.id
        || approved.revision !== track.artifact.revision + 1
      ) {
        throw new AudiobookRetailTrackReviewError(
          "AUDIOBOOK_RETAIL_TRACK_REVIEW_APPROVED_ARTIFACT_SCOPE_INVALID",
        );
      }
      requireHash(
        approved.fingerprint,
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_APPROVED_ARTIFACT_HASH_INVALID",
      );
      requireHash(
        approved.reviewFingerprint,
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_APPROVED_REVIEW_HASH_INVALID",
      );
    }
    const { fingerprint, ...partial } = session.approval;
    if (approvalFingerprint(partial) !== fingerprint) {
      throw new AudiobookRetailTrackReviewError(
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_APPROVAL_FINGERPRINT_INVALID",
      );
    }
  }
  const { fingerprint, ...partial } = session;
  if (sessionFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_SESSION_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailTrackReviewMatchesChain(
  session: AudiobookRetailTrackReviewSession,
  chain: AudiobookRetailTrackEncodeChain,
  now = new Date(session.updatedAt),
): void {
  assertAudiobookRetailTrackReviewSession(session);
  if (Number.isNaN(now.getTime())) {
    throw new AudiobookRetailTrackReviewError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_DATE_INVALID",
    );
  }
  assertChainMatchesSession(session, chain, now);
}

function scoreAverages(
  reviews: readonly AudiobookRetailTrackReviewEntry[],
): AudiobookRetailTrackReviewScores | null {
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
  )) as unknown as AudiobookRetailTrackReviewScores;
}

export function audiobookRetailTrackReviewPublicView(
  session: AudiobookRetailTrackReviewSession,
): AudiobookRetailTrackReviewPublicView {
  assertAudiobookRetailTrackReviewSession(session);
  const latest = latestReviews(session.reviews);
  const contexts = aggregatePlaybackContexts(latest.values());
  const reviewerIds = new Set<string>();
  const findingCodes = new Set<string>();
  for (const review of latest.values()) {
    reviewerIds.add(review.reviewerId);
    for (const code of review.findingCodes) findingCodes.add(code);
  }
  const tracks = Object.freeze(session.tracks.map((track) => {
    const editorial = latest.get(reviewKey(track.ordinal, "editorial"));
    const engineering = latest.get(reviewKey(track.ordinal, "engineering"));
    const trackFindings = new Set<string>([
      ...(editorial?.findingCodes ?? []),
      ...(engineering?.findingCodes ?? []),
    ]);
    return Object.freeze({
      ordinal: track.ordinal,
      role: track.role,
      fileName: track.fileName,
      expectedDurationMs: track.expectedDurationMs,
      editorialDecision: editorial?.decision ?? "pending",
      engineeringDecision: engineering?.decision ?? "pending",
      findingCodes: Object.freeze(
        [...trackFindings].sort((left, right) =>
          left.localeCompare(right, "en-AU")
        ),
      ),
      ready: editorial?.decision === "approve"
        && engineering?.decision === "approve"
        && minimumScore(editorial) >= 4
        && minimumScore(engineering) >= 4
        && trackFindings.size === 0,
    });
  }));
  return Object.freeze({
    id: session.id,
    bookId: session.bookId,
    trackCount: session.tracks.length,
    requiredRoles: session.requiredRoles,
    reviewCount: session.reviews.length,
    reviewerCount: reviewerIds.size,
    playbackContexts: Object.freeze(
      [...contexts].sort((left, right) => left.localeCompare(right, "en-AU")),
    ),
    scoreAverages: scoreAverages(session.reviews),
    findingCodes: Object.freeze(
      [...findingCodes].sort((left, right) => left.localeCompare(right, "en-AU")),
    ),
    tracks,
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
): StoredEnvelope<AudiobookRetailTrackReviewSession> {
  const session = envelope.payload as unknown as AudiobookRetailTrackReviewSession;
  assertAudiobookRetailTrackReviewSession(session);
  if (
    envelope.entityType !== AUDIOBOOK_RETAIL_TRACK_REVIEW_ENTITY_TYPE
    || envelope.entityId !== session.id
    || envelope.revision !== session.revision
  ) {
    throw new AudiobookRetailTrackReviewStoreConflictError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<AudiobookRetailTrackReviewSession>;
}

function payload(
  session: AudiobookRetailTrackReviewSession,
): Record<string, unknown> {
  return session as unknown as Record<string, unknown>;
}

export class FileAudiobookRetailTrackReviewStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    session: AudiobookRetailTrackReviewSession,
    actorId: string,
  ): Promise<StoredEnvelope<AudiobookRetailTrackReviewSession>> {
    assertAudiobookRetailTrackReviewSession(session);
    requireIdentifier(
      actorId,
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_STORE_ACTOR_INVALID",
    );
    try {
      const existing = await this.read(session.id);
      if (existing) {
        if (existing.payload.fingerprint === session.fingerprint) return existing;
        throw new AudiobookRetailTrackReviewStoreConflictError(
          "AUDIOBOOK_RETAIL_TRACK_REVIEW_STORE_IDEMPOTENCY_CONFLICT",
        );
      }
      const envelope = toEnvelope(await this.#store.create(
        AUDIOBOOK_RETAIL_TRACK_REVIEW_ENTITY_TYPE,
        session.id,
        payload(session),
        new Date(session.createdAt),
      ));
      await this.#audit(
        actorId,
        "audiobook_retail_track_review.created",
        envelope,
      );
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailTrackReviewStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(
    sessionId: string,
  ): Promise<StoredEnvelope<AudiobookRetailTrackReviewSession> | null> {
    requireIdentifier(
      sessionId,
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_STORE_ID_INVALID",
    );
    const envelope = await this.#store.read<Record<string, unknown>>(
      AUDIOBOOK_RETAIL_TRACK_REVIEW_ENTITY_TYPE,
      sessionId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(
    sessionId: string,
  ): Promise<StoredEnvelope<AudiobookRetailTrackReviewSession>> {
    const envelope = await this.read(sessionId);
    if (!envelope) {
      throw new AudiobookRetailTrackReviewStoreConflictError(
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }

  async save(
    session: AudiobookRetailTrackReviewSession,
    input: Readonly<{
      expectedRevision: number;
      actorId: string;
      action: string;
    }>,
  ): Promise<StoredEnvelope<AudiobookRetailTrackReviewSession>> {
    assertAudiobookRetailTrackReviewSession(session);
    requireIdentifier(
      input.actorId,
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_STORE_ACTOR_INVALID",
    );
    if (
      !/^audiobook_retail_track_review\.[a-z][a-z0-9._-]{1,80}$/u.test(
        input.action,
      )
    ) {
      throw new AudiobookRetailTrackReviewStoreConflictError(
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_STORE_ACTION_INVALID",
      );
    }
    const current = await this.require(session.id);
    if (
      current.revision !== input.expectedRevision
      || session.revision !== current.payload.revision + 1
      || session.previousFingerprint !== current.payload.fingerprint
    ) {
      throw new AudiobookRetailTrackReviewStoreConflictError(
        "AUDIOBOOK_RETAIL_TRACK_REVIEW_STORE_REVISION_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.replace(
        AUDIOBOOK_RETAIL_TRACK_REVIEW_ENTITY_TYPE,
        session.id,
        input.expectedRevision,
        payload(session),
        new Date(session.updatedAt),
      ));
      await this.#audit(input.actorId, input.action, envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailTrackReviewStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async #audit(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<AudiobookRetailTrackReviewSession>,
  ): Promise<void> {
    const latest = latestReviews(envelope.payload.reviews);
    const findingCodes = new Set<string>();
    for (const review of latest.values()) {
      for (const code of review.findingCodes) findingCodes.add(code);
    }
    await this.#store.appendAuditEvent({
      actorId,
      action,
      entityType: AUDIOBOOK_RETAIL_TRACK_REVIEW_ENTITY_TYPE,
      entityId: envelope.entityId,
      revision: envelope.revision,
      occurredAt: new Date(envelope.savedAt),
      metadata: {
        status: envelope.payload.status,
        trackCount: envelope.payload.tracks.length,
        reviewCount: envelope.payload.reviews.length,
        reviewerCount:
          new Set([...latest.values()].map((review) => review.reviewerId)).size,
        findingCount: findingCodes.size,
        readyForApproval:
          envelope.payload.status === "ready-for-approval",
      },
    });
  }
}
