import type { ArtifactRightsSnapshot } from "./artifact-registry.js";
import {
  assertAudiobookRetailPackageInspectionEvidence,
  type AudiobookRetailPackageInspectionEvidence,
  type AudiobookRetailPackageInspectionFile,
} from "./audiobook-retail-package-inspection.js";
import {
  assertAudiobookRetailPackageManifest,
  type AudiobookRetailPackageManifest,
  type AudiobookRetailPackageMediaFile,
} from "./audiobook-retail-package-manifest.js";
import { stableHash } from "./index.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";

export const AUDIOBOOK_RETAIL_PACKAGE_REVIEW_SCHEMA_VERSION =
  "storyteller-audiobook-retail-package-review-v1" as const;
export const AUDIOBOOK_RETAIL_PACKAGE_REVIEW_ENTITY_TYPE =
  "audiobook-retail-package-review" as const;

export type AudiobookRetailPackageReviewRole = "editorial" | "engineering";
export type AudiobookRetailPackagePlaybackContext =
  | "studio-headphones"
  | "consumer-headphones"
  | "speakers"
  | "mobile-device";
export type AudiobookRetailPackageReviewDecision =
  | "approve"
  | "changes-requested";
export type AudiobookRetailPackageReviewStatus =
  | "open"
  | "changes-requested"
  | "ready-for-approval"
  | "approved-for-release-decision";

export interface AudiobookRetailPackageReviewScores {
  packageCompleteness: number;
  fileNamingAndOrder: number;
  creditAccuracy: number;
  narrativeContinuity: number;
  transitionAndSilenceIntegrity: number;
  encodingConsistency: number;
  retailSampleQuality: number;
  releaseReadiness: number;
}

export interface AudiobookRetailPackageReviewCoverage {
  completeFileListConfirmed: true;
  manifestConfirmed: true;
  openingCreditPlayed: true;
  firstNarrativePlayed: true;
  midpointNarrativePlayed: true;
  finalNarrativePlayed: true;
  closingCreditPlayed: true;
  retailSamplePlayed: true;
  fileCountReviewed: number;
}

export interface AudiobookRetailPackageReviewEntry {
  id: string;
  role: AudiobookRetailPackageReviewRole;
  reviewerId: string;
  coverage: AudiobookRetailPackageReviewCoverage;
  playbackContexts: readonly AudiobookRetailPackagePlaybackContext[];
  decision: AudiobookRetailPackageReviewDecision;
  scores: AudiobookRetailPackageReviewScores;
  findingCodes: readonly string[];
  notes?: string;
  decidedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailPackageReviewFileSnapshot {
  ordinal: number;
  kind: AudiobookRetailPackageMediaFile["kind"];
  role: AudiobookRetailPackageMediaFile["role"];
  fileName: string;
  expectedDurationMs: number;
  observedDurationMs: number;
  contentHash: string;
  byteCount: number;
  inspectionFileFingerprint: string;
  fingerprint: string;
}

export interface AudiobookRetailPackageReviewApproval {
  finalConfirmationId: string;
  approvedByActorId: string;
  approvedAt: string;
  inspectionFingerprint: string;
  fileSetFingerprint: string;
  reviewerSetFingerprint: string;
  rightsFingerprint: string;
  policyFingerprint: string;
  releaseDecisionEligible: true;
  fingerprint: string;
}

export interface AudiobookRetailPackageReviewSession {
  schemaVersion: typeof AUDIOBOOK_RETAIL_PACKAGE_REVIEW_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  packageId: string;
  distributor: "acx-audible";
  inspection: Readonly<{
    id: string;
    revision: 1;
    fingerprint: string;
    inspectedAt: string;
  }>;
  sourceManifest: Readonly<{
    id: string;
    revision: 1;
    fingerprint: string;
  }>;
  packageManifestFingerprint: string;
  rightsFingerprint: string;
  policy: Readonly<{
    id: string;
    externalVersion: string;
    reviewedAt: string;
    expiresAt: string;
    fingerprint: string;
  }>;
  files: readonly AudiobookRetailPackageReviewFileSnapshot[];
  mediaFileCount: number;
  totalMediaBytes: number;
  totalPackageBytes: number;
  requiredRoles: readonly AudiobookRetailPackageReviewRole[];
  reviews: readonly AudiobookRetailPackageReviewEntry[];
  status: AudiobookRetailPackageReviewStatus;
  approval?: AudiobookRetailPackageReviewApproval;
  revision: number;
  previousFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailPackageReviewPublicFile {
  ordinal: number;
  kind: AudiobookRetailPackageMediaFile["kind"];
  role: AudiobookRetailPackageMediaFile["role"];
  fileName: string;
  expectedDurationMs: number;
  observedDurationMs: number;
  byteCount: number;
}

export interface AudiobookRetailPackageReviewPublicView {
  id: string;
  bookId: string;
  distributor: "acx-audible";
  mediaFileCount: number;
  totalMediaBytes: number;
  totalPackageBytes: number;
  requiredRoles: readonly AudiobookRetailPackageReviewRole[];
  reviewCount: number;
  latestDecisions: Readonly<Record<
    AudiobookRetailPackageReviewRole,
    AudiobookRetailPackageReviewDecision | "pending"
  >>;
  playbackContexts: readonly AudiobookRetailPackagePlaybackContext[];
  scoreAverages: AudiobookRetailPackageReviewScores | null;
  findingCodes: readonly string[];
  files: readonly AudiobookRetailPackageReviewPublicFile[];
  status: AudiobookRetailPackageReviewStatus;
  readyForApproval: boolean;
  releaseDecisionEligible: boolean;
  approvedAt?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export class AudiobookRetailPackageReviewError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailPackageReviewError";
    this.code = code;
  }
}

export class AudiobookRetailPackageReviewStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudiobookRetailPackageReviewStoreConflictError";
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
] as const satisfies readonly AudiobookRetailPackageReviewRole[]);
const REQUIRED_PLAYBACK_CONTEXTS = Object.freeze([
  "consumer-headphones",
  "speakers",
  "studio-headphones",
] as const satisfies readonly AudiobookRetailPackagePlaybackContext[]);
const PLAYBACK_CONTEXTS: ReadonlySet<AudiobookRetailPackagePlaybackContext> =
  new Set([
    "studio-headphones",
    "consumer-headphones",
    "speakers",
    "mobile-device",
  ]);
const SCORE_KEYS = Object.freeze([
  "packageCompleteness",
  "fileNamingAndOrder",
  "creditAccuracy",
  "narrativeContinuity",
  "transitionAndSilenceIntegrity",
  "encodingConsistency",
  "retailSampleQuality",
  "releaseReadiness",
] as const satisfies readonly (keyof AudiobookRetailPackageReviewScores)[]);
const MAX_NOTES_LENGTH = 8_000;
const MAX_FINDING_CODES = 100;
const MAX_REVIEW_ENTRIES = 100;
const MAX_FILES = 2_003;
const MAX_MEDIA_BYTES = 16 * 1024 * 1024 * 1024;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailPackageReviewError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailPackageReviewError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailPackageReviewError(code);
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
    throw new AudiobookRetailPackageReviewError(code);
  }
  return value;
}

function requireHumanActor(value: string, code: string): string {
  requireIdentifier(value, code);
  if (HUMAN_BLOCKLIST.test(value)) {
    throw new AudiobookRetailPackageReviewError(code);
  }
  return value;
}

function requireNotes(
  value: string | undefined,
  required: boolean,
): string | undefined {
  if (value === undefined) {
    if (required) {
      throw new AudiobookRetailPackageReviewError(
        "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_NOTES_REQUIRED",
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
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_NOTES_INVALID",
    );
  }
  return trimmed;
}

function assertScores(scores: AudiobookRetailPackageReviewScores): void {
  for (const key of SCORE_KEYS) {
    const score = scores[key];
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new AudiobookRetailPackageReviewError(
        "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_SCORE_INVALID",
      );
    }
  }
}

function freezeScores(
  scores: AudiobookRetailPackageReviewScores,
): AudiobookRetailPackageReviewScores {
  assertScores(scores);
  return Object.freeze({ ...scores });
}

function assertCoverage(
  coverage: AudiobookRetailPackageReviewCoverage,
  expectedFileCount: number,
): void {
  if (
    coverage.completeFileListConfirmed !== true
    || coverage.manifestConfirmed !== true
    || coverage.openingCreditPlayed !== true
    || coverage.firstNarrativePlayed !== true
    || coverage.midpointNarrativePlayed !== true
    || coverage.finalNarrativePlayed !== true
    || coverage.closingCreditPlayed !== true
    || coverage.retailSamplePlayed !== true
    || coverage.fileCountReviewed !== expectedFileCount
  ) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_COVERAGE_INCOMPLETE",
    );
  }
}

function freezeCoverage(
  coverage: AudiobookRetailPackageReviewCoverage,
  expectedFileCount: number,
): AudiobookRetailPackageReviewCoverage {
  assertCoverage(coverage, expectedFileCount);
  return Object.freeze({ ...coverage });
}

function normaliseContexts(
  role: AudiobookRetailPackageReviewRole,
  values: readonly AudiobookRetailPackagePlaybackContext[],
): readonly AudiobookRetailPackagePlaybackContext[] {
  if (!REQUIRED_ROLES.includes(role)) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_ROLE_INVALID",
    );
  }
  if (!Array.isArray(values) || values.length === 0 || values.length > 4) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_PLAYBACK_CONTEXTS_INVALID",
    );
  }
  const contexts = new Set<AudiobookRetailPackagePlaybackContext>();
  for (const value of values) {
    if (!PLAYBACK_CONTEXTS.has(value) || contexts.has(value)) {
      throw new AudiobookRetailPackageReviewError(
        "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_PLAYBACK_CONTEXTS_INVALID",
      );
    }
    contexts.add(value);
  }
  if (role === "engineering" && !contexts.has("studio-headphones")) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_ENGINEERING_STUDIO_CONTEXT_REQUIRED",
    );
  }
  if (
    role === "editorial"
    && !contexts.has("consumer-headphones")
    && !contexts.has("speakers")
    && !contexts.has("mobile-device")
  ) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_EDITORIAL_CONSUMER_CONTEXT_REQUIRED",
    );
  }
  return Object.freeze(
    [...contexts].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function normaliseFindingCodes(
  decision: AudiobookRetailPackageReviewDecision,
  values: readonly string[] | undefined,
): readonly string[] {
  const codes = values ?? [];
  if (!Array.isArray(codes) || codes.length > MAX_FINDING_CODES) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_FINDING_CODES_INVALID",
    );
  }
  const unique = new Set<string>();
  for (const code of codes) {
    if (!FINDING_CODE_PATTERN.test(code) || unique.has(code)) {
      throw new AudiobookRetailPackageReviewError(
        "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_FINDING_CODES_INVALID",
      );
    }
    unique.add(code);
  }
  if (decision === "approve" && unique.size > 0) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_APPROVAL_FINDINGS_FORBIDDEN",
    );
  }
  if (decision === "changes-requested" && unique.size === 0) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_CHANGE_FINDINGS_REQUIRED",
    );
  }
  return Object.freeze(
    [...unique].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function currentRights(
  rights: ArtifactRightsSnapshot,
  expectedFingerprint: string,
  now: Date,
): void {
  if (
    rights.rightsFingerprint !== expectedFingerprint
    || !rights.allowedUses.includes("audiobook")
  ) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_AUDIOBOOK_RIGHTS_REQUIRED",
    );
  }
  if (!rights.commercialUseApproved) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_COMMERCIAL_RIGHTS_REQUIRED",
    );
  }
  if (
    rights.expiresAt
    && Date.parse(rights.expiresAt) <= now.getTime()
  ) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_RIGHTS_EXPIRED",
    );
  }
  if (
    rights.deletionRequiredAt
    && Date.parse(rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_RETENTION_EXPIRED",
    );
  }
}

function currentPolicy(
  manifest: AudiobookRetailPackageManifest,
  now: Date,
): void {
  if (
    Date.parse(manifest.policy.reviewedAt) > now.getTime()
    || Date.parse(manifest.policy.expiresAt) <= now.getTime()
  ) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_POLICY_EXPIRED",
    );
  }
}

function assertReviewablePackage(
  inspection: AudiobookRetailPackageInspectionEvidence,
  manifest: AudiobookRetailPackageManifest,
  rights: ArtifactRightsSnapshot,
  now: Date,
): void {
  assertAudiobookRetailPackageInspectionEvidence(inspection);
  assertAudiobookRetailPackageManifest(manifest);
  if (
    inspection.status !== "ready-for-final-package-review"
    || inspection.projectId !== manifest.projectId
    || inspection.bookId !== manifest.bookId
    || inspection.distributor !== manifest.distributor
    || inspection.sourceManifest.id !== manifest.id
    || inspection.sourceManifest.fingerprint !== manifest.fingerprint
    || inspection.mediaFileCount !== manifest.mediaFileCount
    || inspection.totalMediaBytes !== manifest.totalMediaBytes
    || inspection.files.length !== manifest.files.length
  ) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_SUBJECT_MISMATCH",
    );
  }
  for (const [index, inspected] of inspection.files.entries()) {
    const source = manifest.files[index];
    if (
      !source
      || inspected.ordinal !== source.ordinal
      || inspected.kind !== source.kind
      || inspected.role !== source.role
      || inspected.fileName !== source.fileName
      || inspected.expectedDurationMs !== source.expectedDurationMs
      || inspected.observedDurationMs !== source.observedDurationMs
      || inspected.contentHash !== source.artifact.contentHash
      || inspected.byteCount !== source.artifact.byteCount
    ) {
      throw new AudiobookRetailPackageReviewError(
        "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_SUBJECT_MISMATCH",
      );
    }
  }
  currentPolicy(manifest, now);
  currentRights(rights, manifest.rightsFingerprint, now);
}

function fileFingerprint(
  value: Omit<AudiobookRetailPackageReviewFileSnapshot, "fingerprint">,
): string {
  return stableHash(value);
}

function snapshotFile(
  file: AudiobookRetailPackageInspectionFile,
): AudiobookRetailPackageReviewFileSnapshot {
  const partial: Omit<AudiobookRetailPackageReviewFileSnapshot, "fingerprint"> = {
    ordinal: file.ordinal,
    kind: file.kind,
    role: file.role,
    fileName: file.fileName,
    expectedDurationMs: file.expectedDurationMs,
    observedDurationMs: file.observedDurationMs,
    contentHash: file.contentHash,
    byteCount: file.byteCount,
    inspectionFileFingerprint: file.fingerprint,
  };
  return Object.freeze({
    ...partial,
    fingerprint: fileFingerprint(partial),
  });
}

function reviewFingerprint(
  value: Omit<AudiobookRetailPackageReviewEntry, "fingerprint">,
): string {
  return stableHash(value);
}

function approvalFingerprint(
  value: Omit<AudiobookRetailPackageReviewApproval, "fingerprint">,
): string {
  return stableHash(value);
}

function sessionFingerprint(
  value: Omit<AudiobookRetailPackageReviewSession, "fingerprint">,
): string {
  return stableHash(value);
}

function latestReviews(
  reviews: readonly AudiobookRetailPackageReviewEntry[],
): ReadonlyMap<AudiobookRetailPackageReviewRole, AudiobookRetailPackageReviewEntry> {
  const latest = new Map<
    AudiobookRetailPackageReviewRole,
    AudiobookRetailPackageReviewEntry
  >();
  for (const review of reviews) latest.set(review.role, review);
  return latest;
}

function minimumScore(review: AudiobookRetailPackageReviewEntry): number {
  return Math.min(...SCORE_KEYS.map((key) => review.scores[key]));
}

function aggregatePlaybackContexts(
  reviews: Iterable<AudiobookRetailPackageReviewEntry>,
): ReadonlySet<AudiobookRetailPackagePlaybackContext> {
  const contexts = new Set<AudiobookRetailPackagePlaybackContext>();
  for (const review of reviews) {
    for (const context of review.playbackContexts) contexts.add(context);
  }
  return contexts;
}

function readyReviews(
  reviews: readonly AudiobookRetailPackageReviewEntry[],
): boolean {
  const latest = latestReviews(reviews);
  const roleReviews = REQUIRED_ROLES.map((role) => latest.get(role));
  const contexts = aggregatePlaybackContexts(
    roleReviews.filter(Boolean) as AudiobookRetailPackageReviewEntry[],
  );
  return roleReviews.every((review) => review?.decision === "approve")
    && roleReviews.every((review) => minimumScore(review!) >= 4)
    && roleReviews.every((review) => review!.findingCodes.length === 0)
    && new Set(roleReviews.map((review) => review!.reviewerId)).size
      === REQUIRED_ROLES.length
    && REQUIRED_PLAYBACK_CONTEXTS.every((context) => contexts.has(context));
}

function statusFromReviews(
  reviews: readonly AudiobookRetailPackageReviewEntry[],
): Exclude<AudiobookRetailPackageReviewStatus, "approved-for-release-decision"> {
  const latest = latestReviews(reviews);
  if (
    [...latest.values()].some(
      (review) => review.decision === "changes-requested",
    )
  ) {
    return "changes-requested";
  }
  return readyReviews(reviews) ? "ready-for-approval" : "open";
}

function reviewerSetFingerprint(
  reviews: readonly AudiobookRetailPackageReviewEntry[],
): string {
  const latest = latestReviews(reviews);
  const editorial = latest.get("editorial");
  const engineering = latest.get("engineering");
  if (!editorial || !engineering) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_REVIEWER_SET_INCOMPLETE",
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

function assertReviewEntry(
  review: AudiobookRetailPackageReviewEntry,
  fileCount: number,
): void {
  requireIdentifier(
    review.id,
    "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_ENTRY_ID_INVALID",
  );
  if (!REQUIRED_ROLES.includes(review.role)) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_ROLE_INVALID",
    );
  }
  requireHumanActor(
    review.reviewerId,
    "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_REVIEWER_INVALID",
  );
  assertCoverage(review.coverage, fileCount);
  normaliseContexts(review.role, review.playbackContexts);
  if (
    review.decision !== "approve"
    && review.decision !== "changes-requested"
  ) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_DECISION_INVALID",
    );
  }
  assertScores(review.scores);
  normaliseFindingCodes(review.decision, review.findingCodes);
  requireNotes(review.notes, review.decision === "changes-requested");
  requireDate(review.decidedAt, "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_DATE_INVALID");
  const { fingerprint, ...partial } = review;
  if (reviewFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_ENTRY_FINGERPRINT_INVALID",
    );
  }
}

function reviseSession(
  session: AudiobookRetailPackageReviewSession,
  updates: Partial<Pick<
    AudiobookRetailPackageReviewSession,
    "reviews" | "status" | "approval"
  >>,
  now: Date,
): AudiobookRetailPackageReviewSession {
  assertAudiobookRetailPackageReviewSession(session);
  if (now.getTime() < Date.parse(session.updatedAt)) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_TRANSITION_TIME_REVERSED",
    );
  }
  const {
    fingerprint: _fingerprint,
    previousFingerprint: _previous,
    ...base
  } = session;
  const partial: Omit<AudiobookRetailPackageReviewSession, "fingerprint"> = {
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
  assertAudiobookRetailPackageReviewSession(next);
  return next;
}

export function createAudiobookRetailPackageReviewSession(input: Readonly<{
  id: string;
  inspection: AudiobookRetailPackageInspectionEvidence;
  manifest: AudiobookRetailPackageManifest;
  rights: ArtifactRightsSnapshot;
  createdAt?: Date;
}>): AudiobookRetailPackageReviewSession {
  requireIdentifier(
    input.id,
    "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_SESSION_ID_INVALID",
  );
  const createdAt = input.createdAt ?? new Date();
  if (
    Number.isNaN(createdAt.getTime())
    || createdAt.getTime() < Date.parse(input.inspection.inspectedAt)
  ) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_DATE_INVALID",
    );
  }
  assertReviewablePackage(
    input.inspection,
    input.manifest,
    input.rights,
    createdAt,
  );
  const files = Object.freeze(input.inspection.files.map(snapshotFile));
  const partial: Omit<AudiobookRetailPackageReviewSession, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_PACKAGE_REVIEW_SCHEMA_VERSION,
    id: input.id,
    projectId: input.inspection.projectId,
    bookId: input.inspection.bookId,
    packageId: input.inspection.packageId,
    distributor: "acx-audible",
    inspection: Object.freeze({
      id: input.inspection.id,
      revision: 1,
      fingerprint: input.inspection.fingerprint,
      inspectedAt: input.inspection.inspectedAt,
    }),
    sourceManifest: Object.freeze({
      id: input.manifest.id,
      revision: 1,
      fingerprint: input.manifest.fingerprint,
    }),
    packageManifestFingerprint:
      input.inspection.packageManifest.fingerprint,
    rightsFingerprint: input.manifest.rightsFingerprint,
    policy: input.manifest.policy,
    files,
    mediaFileCount: input.inspection.mediaFileCount,
    totalMediaBytes: input.inspection.totalMediaBytes,
    totalPackageBytes: input.inspection.totalPackageBytes,
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
  assertAudiobookRetailPackageReviewSession(session);
  return session;
}

export function recordAudiobookRetailPackageReview(
  session: AudiobookRetailPackageReviewSession,
  input: Readonly<{
    id: string;
    role: AudiobookRetailPackageReviewRole;
    reviewerId: string;
    coverage: AudiobookRetailPackageReviewCoverage;
    playbackContexts: readonly AudiobookRetailPackagePlaybackContext[];
    decision: AudiobookRetailPackageReviewDecision;
    scores: AudiobookRetailPackageReviewScores;
    findingCodes?: readonly string[];
    notes?: string;
    decidedAt?: Date;
  }>,
): AudiobookRetailPackageReviewSession {
  assertAudiobookRetailPackageReviewSession(session);
  if (session.status === "approved-for-release-decision") {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_APPROVED_IMMUTABLE",
    );
  }
  requireIdentifier(
    input.id,
    "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_ENTRY_ID_INVALID",
  );
  if (session.reviews.some((review) => review.id === input.id)) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_ENTRY_ID_DUPLICATE",
    );
  }
  const reviewerId = requireHumanActor(
    input.reviewerId,
    "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_REVIEWER_INVALID",
  );
  const latest = latestReviews(session.reviews);
  for (const [role, review] of latest) {
    if (role !== input.role && review.reviewerId === reviewerId) {
      throw new AudiobookRetailPackageReviewError(
        "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_INDEPENDENT_REVIEWERS_REQUIRED",
      );
    }
  }
  const decidedAt = input.decidedAt ?? new Date();
  if (
    Number.isNaN(decidedAt.getTime())
    || decidedAt.getTime() < Date.parse(session.updatedAt)
  ) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_DATE_INVALID",
    );
  }
  const coverage = freezeCoverage(input.coverage, session.mediaFileCount);
  const contexts = normaliseContexts(input.role, input.playbackContexts);
  const findings = normaliseFindingCodes(input.decision, input.findingCodes);
  const notes = requireNotes(
    input.notes,
    input.decision === "changes-requested",
  );
  const partial: Omit<AudiobookRetailPackageReviewEntry, "fingerprint"> = {
    id: input.id,
    role: input.role,
    reviewerId,
    coverage,
    playbackContexts: contexts,
    decision: input.decision,
    scores: freezeScores(input.scores),
    findingCodes: findings,
    ...(notes ? { notes } : {}),
    decidedAt: decidedAt.toISOString(),
  };
  const review = Object.freeze({
    ...partial,
    fingerprint: reviewFingerprint(partial),
  });
  assertReviewEntry(review, session.mediaFileCount);
  const reviews = Object.freeze([...session.reviews, review]);
  return reviseSession(
    session,
    { reviews, status: statusFromReviews(reviews) },
    decidedAt,
  );
}

function assertSessionMatchesSources(
  session: AudiobookRetailPackageReviewSession,
  inspection: AudiobookRetailPackageInspectionEvidence,
  manifest: AudiobookRetailPackageManifest,
  rights: ArtifactRightsSnapshot,
  now: Date,
): void {
  assertReviewablePackage(inspection, manifest, rights, now);
  if (
    session.projectId !== inspection.projectId
    || session.bookId !== inspection.bookId
    || session.packageId !== inspection.packageId
    || session.distributor !== inspection.distributor
    || session.inspection.id !== inspection.id
    || session.inspection.revision !== inspection.revision
    || session.inspection.fingerprint !== inspection.fingerprint
    || session.inspection.inspectedAt !== inspection.inspectedAt
    || session.sourceManifest.id !== manifest.id
    || session.sourceManifest.revision !== manifest.revision
    || session.sourceManifest.fingerprint !== manifest.fingerprint
    || session.packageManifestFingerprint
      !== inspection.packageManifest.fingerprint
    || session.rightsFingerprint !== manifest.rightsFingerprint
    || stableHash(session.policy) !== stableHash(manifest.policy)
    || session.mediaFileCount !== inspection.mediaFileCount
    || session.totalMediaBytes !== inspection.totalMediaBytes
    || session.totalPackageBytes !== inspection.totalPackageBytes
    || session.files.length !== inspection.files.length
  ) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_SOURCE_MISMATCH",
    );
  }
  for (const [index, snapshot] of session.files.entries()) {
    const file = inspection.files[index];
    if (
      !file
      || snapshot.ordinal !== file.ordinal
      || snapshot.kind !== file.kind
      || snapshot.role !== file.role
      || snapshot.fileName !== file.fileName
      || snapshot.expectedDurationMs !== file.expectedDurationMs
      || snapshot.observedDurationMs !== file.observedDurationMs
      || snapshot.contentHash !== file.contentHash
      || snapshot.byteCount !== file.byteCount
      || snapshot.inspectionFileFingerprint !== file.fingerprint
    ) {
      throw new AudiobookRetailPackageReviewError(
        "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_SOURCE_MISMATCH",
      );
    }
  }
}

export function approveAudiobookRetailPackageReview(
  session: AudiobookRetailPackageReviewSession,
  input: Readonly<{
    inspection: AudiobookRetailPackageInspectionEvidence;
    manifest: AudiobookRetailPackageManifest;
    rights: ArtifactRightsSnapshot;
    finalConfirmationId: string;
    approvedByActorId: string;
    humanConfirmation: true;
    approvedAt?: Date;
  }>,
): AudiobookRetailPackageReviewSession {
  assertAudiobookRetailPackageReviewSession(session);
  if (session.status === "approved-for-release-decision") {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_APPROVED_IMMUTABLE",
    );
  }
  if (input.humanConfirmation !== true) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_HUMAN_CONFIRMATION_REQUIRED",
    );
  }
  requireIdentifier(
    input.finalConfirmationId,
    "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_FINAL_CONFIRMATION_ID_INVALID",
  );
  const approvedByActorId = requireHumanActor(
    input.approvedByActorId,
    "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_APPROVER_INVALID",
  );
  if (session.status !== "ready-for-approval" || !readyReviews(session.reviews)) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_NOT_READY_FOR_APPROVAL",
    );
  }
  const latest = latestReviews(session.reviews);
  if (
    [...latest.values()].some(
      (review) => review.reviewerId === approvedByActorId,
    )
  ) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_INDEPENDENT_APPROVER_REQUIRED",
    );
  }
  const approvedAt = input.approvedAt ?? new Date();
  if (
    Number.isNaN(approvedAt.getTime())
    || approvedAt.getTime() < Date.parse(session.updatedAt)
  ) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_APPROVAL_DATE_INVALID",
    );
  }
  assertSessionMatchesSources(
    session,
    input.inspection,
    input.manifest,
    input.rights,
    approvedAt,
  );
  const approvalBase: Omit<AudiobookRetailPackageReviewApproval, "fingerprint"> = {
    finalConfirmationId: input.finalConfirmationId,
    approvedByActorId,
    approvedAt: approvedAt.toISOString(),
    inspectionFingerprint: input.inspection.fingerprint,
    fileSetFingerprint: stableHash(session.files),
    reviewerSetFingerprint: reviewerSetFingerprint(session.reviews),
    rightsFingerprint: input.rights.rightsFingerprint,
    policyFingerprint: input.manifest.policy.fingerprint,
    releaseDecisionEligible: true,
  };
  const approval = Object.freeze({
    ...approvalBase,
    fingerprint: approvalFingerprint(approvalBase),
  });
  return reviseSession(
    session,
    { status: "approved-for-release-decision", approval },
    approvedAt,
  );
}

function assertFileSnapshot(
  file: AudiobookRetailPackageReviewFileSnapshot,
): void {
  requireInteger(
    file.ordinal,
    1,
    MAX_FILES,
    "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_FILE_ORDINAL_INVALID",
  );
  if (!/^[A-Za-z0-9]+\.mp3$/u.test(file.fileName)) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_FILE_NAME_INVALID",
    );
  }
  requireInteger(
    file.expectedDurationMs,
    1,
    7_200_000,
    "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_DURATION_INVALID",
  );
  requireInteger(
    file.observedDurationMs,
    1,
    7_210_000,
    "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_DURATION_INVALID",
  );
  requireHash(
    file.contentHash,
    "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_FILE_HASH_INVALID",
  );
  requireHash(
    file.inspectionFileFingerprint,
    "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_INSPECTION_FILE_HASH_INVALID",
  );
  requireInteger(
    file.byteCount,
    1,
    MAX_MEDIA_BYTES,
    "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_FILE_SIZE_INVALID",
  );
  const { fingerprint, ...partial } = file;
  if (fileFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_FILE_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailPackageReviewSession(
  session: AudiobookRetailPackageReviewSession,
): void {
  if (session.schemaVersion !== AUDIOBOOK_RETAIL_PACKAGE_REVIEW_SCHEMA_VERSION) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [session.id, "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_SESSION_ID_INVALID"],
    [session.projectId, "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_PROJECT_ID_INVALID"],
    [session.bookId, "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_BOOK_ID_INVALID"],
    [session.packageId, "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_PACKAGE_ID_INVALID"],
    [session.inspection.id, "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_INSPECTION_ID_INVALID"],
    [session.sourceManifest.id, "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_MANIFEST_ID_INVALID"],
    [session.policy.id, "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_POLICY_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  if (session.distributor !== "acx-audible") {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_DISTRIBUTOR_INVALID",
    );
  }
  if (session.inspection.revision !== 1 || session.sourceManifest.revision !== 1) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_SOURCE_REVISION_INVALID",
    );
  }
  for (const [value, code] of [
    [session.inspection.fingerprint, "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_INSPECTION_HASH_INVALID"],
    [session.sourceManifest.fingerprint, "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_MANIFEST_HASH_INVALID"],
    [session.packageManifestFingerprint, "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_PACKAGE_MANIFEST_HASH_INVALID"],
    [session.rightsFingerprint, "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_RIGHTS_HASH_INVALID"],
    [session.policy.fingerprint, "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_POLICY_HASH_INVALID"],
  ] as const) requireHash(value, code);
  requireDate(
    session.inspection.inspectedAt,
    "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_DATE_INVALID",
  );
  requireDate(
    session.policy.reviewedAt,
    "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_POLICY_DATE_INVALID",
  );
  requireDate(
    session.policy.expiresAt,
    "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_POLICY_DATE_INVALID",
  );
  if (!session.policy.externalVersion.trim()) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_POLICY_VERSION_INVALID",
    );
  }
  if (
    !Array.isArray(session.files)
    || session.files.length < 4
    || session.files.length > MAX_FILES
  ) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_FILES_INVALID",
    );
  }
  const names = new Set<string>();
  let totalMediaBytes = 0;
  for (const [index, file] of session.files.entries()) {
    assertFileSnapshot(file);
    if (file.ordinal !== index + 1 || names.has(file.fileName)) {
      throw new AudiobookRetailPackageReviewError(
        "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_FILE_ORDER_INVALID",
      );
    }
    names.add(file.fileName);
    totalMediaBytes += file.byteCount;
  }
  if (
    session.mediaFileCount !== session.files.length
    || session.totalMediaBytes !== totalMediaBytes
    || session.totalPackageBytes <= session.totalMediaBytes
  ) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_AGGREGATES_INVALID",
    );
  }
  if (stableHash(session.requiredRoles) !== stableHash(REQUIRED_ROLES)) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_REQUIRED_ROLES_INVALID",
    );
  }
  if (
    !Array.isArray(session.reviews)
    || session.reviews.length > MAX_REVIEW_ENTRIES
  ) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_ENTRIES_INVALID",
    );
  }
  const createdAt = requireDate(
    session.createdAt,
    "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_DATE_INVALID",
  );
  const updatedAt = requireDate(
    session.updatedAt,
    "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_DATE_INVALID",
  );
  if (
    Date.parse(createdAt) < Date.parse(session.inspection.inspectedAt)
    || Date.parse(updatedAt) < Date.parse(createdAt)
  ) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_TRANSITION_TIME_REVERSED",
    );
  }
  const ids = new Set<string>();
  let previousAt = Date.parse(createdAt);
  for (const review of session.reviews) {
    assertReviewEntry(review, session.mediaFileCount);
    if (ids.has(review.id)) {
      throw new AudiobookRetailPackageReviewError(
        "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_ENTRY_ID_DUPLICATE",
      );
    }
    ids.add(review.id);
    const decidedAt = Date.parse(review.decidedAt);
    if (decidedAt < previousAt) {
      throw new AudiobookRetailPackageReviewError(
        "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_TRANSITION_TIME_REVERSED",
      );
    }
    previousAt = decidedAt;
  }
  if (Date.parse(updatedAt) < previousAt) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_TRANSITION_TIME_REVERSED",
    );
  }
  const latest = latestReviews(session.reviews);
  if (
    latest.size === 2
    && new Set([...latest.values()].map((review) => review.reviewerId)).size !== 2
  ) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_INDEPENDENT_REVIEWERS_REQUIRED",
    );
  }
  requireInteger(
    session.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_REVISION_INVALID",
  );
  if (session.revision === 1 && session.previousFingerprint !== undefined) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_REVISION_CHAIN_INVALID",
    );
  }
  if (session.revision > 1) {
    requireHash(
      session.previousFingerprint ?? "",
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_REVISION_CHAIN_INVALID",
    );
  }
  const reviewStatus = statusFromReviews(session.reviews);
  const expectedStatus = session.approval
    ? "approved-for-release-decision"
    : reviewStatus;
  if (session.status !== expectedStatus) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_STATUS_MISMATCH",
    );
  }
  if (session.approval) {
    if (reviewStatus !== "ready-for-approval") {
      throw new AudiobookRetailPackageReviewError(
        "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_APPROVAL_WITHOUT_READY_REVIEWS",
      );
    }
    requireIdentifier(
      session.approval.finalConfirmationId,
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_FINAL_CONFIRMATION_ID_INVALID",
    );
    requireHumanActor(
      session.approval.approvedByActorId,
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_APPROVER_INVALID",
    );
    requireDate(
      session.approval.approvedAt,
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_APPROVAL_DATE_INVALID",
    );
    if (Date.parse(session.approval.approvedAt) < previousAt) {
      throw new AudiobookRetailPackageReviewError(
        "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_APPROVAL_DATE_INVALID",
      );
    }
    if (
      [...latest.values()].some(
        (review) => review.reviewerId === session.approval!.approvedByActorId,
      )
    ) {
      throw new AudiobookRetailPackageReviewError(
        "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_INDEPENDENT_APPROVER_REQUIRED",
      );
    }
    if (
      session.approval.inspectionFingerprint !== session.inspection.fingerprint
      || session.approval.fileSetFingerprint !== stableHash(session.files)
      || session.approval.reviewerSetFingerprint
        !== reviewerSetFingerprint(session.reviews)
      || session.approval.rightsFingerprint !== session.rightsFingerprint
      || session.approval.policyFingerprint !== session.policy.fingerprint
      || session.approval.releaseDecisionEligible !== true
    ) {
      throw new AudiobookRetailPackageReviewError(
        "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_APPROVAL_SCOPE_INVALID",
      );
    }
    const { fingerprint, ...partial } = session.approval;
    if (approvalFingerprint(partial) !== fingerprint) {
      throw new AudiobookRetailPackageReviewError(
        "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_APPROVAL_FINGERPRINT_INVALID",
      );
    }
  }
  const { fingerprint, ...partial } = session;
  if (sessionFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_SESSION_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailPackageReviewMatchesSources(
  session: AudiobookRetailPackageReviewSession,
  input: Readonly<{
    inspection: AudiobookRetailPackageInspectionEvidence;
    manifest: AudiobookRetailPackageManifest;
    rights: ArtifactRightsSnapshot;
    now?: Date;
  }>,
): void {
  assertAudiobookRetailPackageReviewSession(session);
  const now = input.now ?? new Date(session.updatedAt);
  if (Number.isNaN(now.getTime())) {
    throw new AudiobookRetailPackageReviewError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_DATE_INVALID",
    );
  }
  assertSessionMatchesSources(
    session,
    input.inspection,
    input.manifest,
    input.rights,
    now,
  );
}

function scoreAverages(
  reviews: readonly AudiobookRetailPackageReviewEntry[],
): AudiobookRetailPackageReviewScores | null {
  const values = [...latestReviews(reviews).values()];
  if (values.length === 0) return null;
  return Object.freeze(Object.fromEntries(
    SCORE_KEYS.map((key) => [
      key,
      Number((
        values.reduce((total, review) => total + review.scores[key], 0)
        / values.length
      ).toFixed(2)),
    ]),
  )) as unknown as AudiobookRetailPackageReviewScores;
}

export function audiobookRetailPackageReviewPublicView(
  session: AudiobookRetailPackageReviewSession,
): AudiobookRetailPackageReviewPublicView {
  assertAudiobookRetailPackageReviewSession(session);
  const latest = latestReviews(session.reviews);
  const contexts = aggregatePlaybackContexts(latest.values());
  const findings = new Set<string>();
  for (const review of latest.values()) {
    for (const code of review.findingCodes) findings.add(code);
  }
  return Object.freeze({
    id: session.id,
    bookId: session.bookId,
    distributor: session.distributor,
    mediaFileCount: session.mediaFileCount,
    totalMediaBytes: session.totalMediaBytes,
    totalPackageBytes: session.totalPackageBytes,
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
      [...findings].sort((left, right) => left.localeCompare(right, "en-AU")),
    ),
    files: Object.freeze(session.files.map((file) => Object.freeze({
      ordinal: file.ordinal,
      kind: file.kind,
      role: file.role,
      fileName: file.fileName,
      expectedDurationMs: file.expectedDurationMs,
      observedDurationMs: file.observedDurationMs,
      byteCount: file.byteCount,
    }))),
    status: session.status,
    readyForApproval: session.status === "ready-for-approval",
    releaseDecisionEligible:
      session.status === "approved-for-release-decision",
    ...(session.approval ? { approvedAt: session.approval.approvedAt } : {}),
    revision: session.revision,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    fingerprint: session.fingerprint,
  });
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<AudiobookRetailPackageReviewSession> {
  const session = envelope.payload as unknown as AudiobookRetailPackageReviewSession;
  assertAudiobookRetailPackageReviewSession(session);
  if (
    envelope.entityType !== AUDIOBOOK_RETAIL_PACKAGE_REVIEW_ENTITY_TYPE
    || envelope.entityId !== session.id
    || envelope.revision !== session.revision
  ) {
    throw new AudiobookRetailPackageReviewStoreConflictError(
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<AudiobookRetailPackageReviewSession>;
}

function payload(
  session: AudiobookRetailPackageReviewSession,
): Record<string, unknown> {
  return session as unknown as Record<string, unknown>;
}

export class FileAudiobookRetailPackageReviewStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    session: AudiobookRetailPackageReviewSession,
    actorId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPackageReviewSession>> {
    assertAudiobookRetailPackageReviewSession(session);
    requireIdentifier(
      actorId,
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_STORE_ACTOR_INVALID",
    );
    try {
      const existing = await this.read(session.id);
      if (existing) {
        if (existing.payload.fingerprint === session.fingerprint) return existing;
        throw new AudiobookRetailPackageReviewStoreConflictError(
          "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_STORE_IDEMPOTENCY_CONFLICT",
        );
      }
      const envelope = toEnvelope(await this.#store.create(
        AUDIOBOOK_RETAIL_PACKAGE_REVIEW_ENTITY_TYPE,
        session.id,
        payload(session),
        new Date(session.createdAt),
      ));
      await this.#audit(
        actorId,
        "audiobook_retail_package_review.created",
        envelope,
      );
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailPackageReviewStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(
    sessionId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPackageReviewSession> | null> {
    requireIdentifier(
      sessionId,
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_STORE_ID_INVALID",
    );
    const envelope = await this.#store.read<Record<string, unknown>>(
      AUDIOBOOK_RETAIL_PACKAGE_REVIEW_ENTITY_TYPE,
      sessionId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(
    sessionId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPackageReviewSession>> {
    const envelope = await this.read(sessionId);
    if (!envelope) {
      throw new AudiobookRetailPackageReviewStoreConflictError(
        "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }

  async save(
    session: AudiobookRetailPackageReviewSession,
    input: Readonly<{
      expectedRevision: number;
      actorId: string;
      action: string;
    }>,
  ): Promise<StoredEnvelope<AudiobookRetailPackageReviewSession>> {
    assertAudiobookRetailPackageReviewSession(session);
    requireIdentifier(
      input.actorId,
      "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_STORE_ACTOR_INVALID",
    );
    if (
      !/^audiobook_retail_package_review\.[a-z][a-z0-9._-]{1,80}$/u.test(
        input.action,
      )
    ) {
      throw new AudiobookRetailPackageReviewStoreConflictError(
        "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_STORE_ACTION_INVALID",
      );
    }
    const current = await this.require(session.id);
    if (
      current.revision !== input.expectedRevision
      || session.revision !== current.payload.revision + 1
      || session.previousFingerprint !== current.payload.fingerprint
    ) {
      throw new AudiobookRetailPackageReviewStoreConflictError(
        "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_STORE_REVISION_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.replace(
        AUDIOBOOK_RETAIL_PACKAGE_REVIEW_ENTITY_TYPE,
        session.id,
        input.expectedRevision,
        payload(session),
        new Date(session.updatedAt),
      ));
      await this.#audit(input.actorId, input.action, envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailPackageReviewStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async #audit(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<AudiobookRetailPackageReviewSession>,
  ): Promise<void> {
    const latest = latestReviews(envelope.payload.reviews);
    const contexts = aggregatePlaybackContexts(latest.values());
    const findings = new Set<string>();
    for (const review of latest.values()) {
      for (const code of review.findingCodes) findings.add(code);
    }
    await this.#store.appendAuditEvent({
      actorId,
      action,
      entityType: AUDIOBOOK_RETAIL_PACKAGE_REVIEW_ENTITY_TYPE,
      entityId: envelope.entityId,
      revision: envelope.revision,
      occurredAt: new Date(envelope.savedAt),
      metadata: {
        status: envelope.payload.status,
        mediaFileCount: envelope.payload.mediaFileCount,
        reviewCount: envelope.payload.reviews.length,
        reviewerCount: new Set(
          [...latest.values()].map((review) => review.reviewerId),
        ).size,
        playbackContextCount: contexts.size,
        findingCount: findings.size,
        readyForApproval:
          envelope.payload.status === "ready-for-approval",
        releaseDecisionEligible:
          envelope.payload.status === "approved-for-release-decision",
      },
    });
  }
}
