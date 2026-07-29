import type { ArtifactRightsSnapshot } from "./artifact-registry.js";
import {
  assertAudiobookRetailDeliveryAttempt,
  type AudiobookRetailDeliveryAttempt,
} from "./audiobook-retail-delivery-attempt.js";
import {
  assertAudiobookRetailPackageInspectionEvidence,
  type AudiobookRetailPackageInspectionEvidence,
} from "./audiobook-retail-package-inspection.js";
import {
  assertAudiobookRetailPackageManifest,
  type AudiobookRetailPackageManifest,
  type AudiobookRetailPackageMediaKind,
  type AudiobookRetailPackageMediaRole,
} from "./audiobook-retail-package-manifest.js";
import {
  assertAudiobookRetailPackageReviewSession,
  type AudiobookRetailPackageReviewSession,
} from "./audiobook-retail-package-review.js";
import {
  assertAudiobookRetailEncodingPolicy,
  assertCurrentAudiobookRetailEncodingPolicy,
  type AudiobookRetailEncodingPolicy,
} from "./audiobook-retail-policy.js";
import {
  assertAudiobookRetailDistributorAccountEvidence,
  assertAudiobookRetailReleaseDecision,
  type AudiobookRetailDistributorAccountEvidence,
  type AudiobookRetailReleaseDecision,
} from "./audiobook-retail-release-decision.js";
import { stableHash } from "./index.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";

export const AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_SCHEMA_VERSION =
  "storyteller-audiobook-retail-submission-review-v1" as const;
export const AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ENTITY_TYPE =
  "audiobook-retail-submission-review" as const;

export type AudiobookRetailSubmissionReviewRole = "editorial" | "engineering";
export type AudiobookRetailSubmissionReviewDecision =
  | "approve"
  | "changes-requested";
export type AudiobookRetailSubmissionReviewStatus =
  | "open"
  | "changes-requested"
  | "ready-for-approval"
  | "approved-for-submission-decision";
export type AudiobookRetailSubmissionPlaybackContext =
  | "studio-headphones"
  | "consumer-headphones"
  | "speakers"
  | "remote-draft-player";

export interface AudiobookRetailSubmissionReviewCoverage {
  remoteDraftOpened: true;
  remoteDraftReferenceMatched: true;
  completeFileListConfirmed: true;
  fileCountReviewed: number;
  openingCreditPlayed: true;
  firstNarrativePlayed: true;
  midpointNarrativePlayed: true;
  finalNarrativePlayed: true;
  closingCreditPlayed: true;
  retailSamplePlayed: true;
  allRemoteProcessingComplete: true;
  noRemoteValidationErrors: true;
  submissionNotInitiated: true;
}

export interface AudiobookRetailSubmissionReviewScores {
  remoteFileCompleteness: number;
  fileNamingAndOrder: number;
  openingAndClosingAccuracy: number;
  narrativeCoverage: number;
  remoteProcessingIntegrity: number;
  playbackIntegrity: number;
  retailSampleIntegrity: number;
  submissionReadiness: number;
}

export interface AudiobookRetailSubmissionReviewEntry {
  id: string;
  role: AudiobookRetailSubmissionReviewRole;
  reviewerId: string;
  coverage: AudiobookRetailSubmissionReviewCoverage;
  playbackContexts: readonly AudiobookRetailSubmissionPlaybackContext[];
  decision: AudiobookRetailSubmissionReviewDecision;
  scores: AudiobookRetailSubmissionReviewScores;
  findingCodes: readonly string[];
  notes?: string;
  decidedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailSubmissionReviewFile {
  ordinal: number;
  kind: AudiobookRetailPackageMediaKind;
  role: AudiobookRetailPackageMediaRole;
  fileName: string;
  contentHash: string;
  byteCount: number;
  sourceReviewFileFingerprint: string;
  fingerprint: string;
}

export interface AudiobookRetailSubmissionReviewApproval {
  finalConfirmationId: string;
  approvedByActorId: string;
  approvedAt: string;
  reviewerSetFingerprint: string;
  deliveryAttemptFingerprint: string;
  releaseDecisionFingerprint: string;
  remoteDraftReferenceHash: string;
  fileSetFingerprint: string;
  submissionDecisionEligible: true;
  fingerprint: string;
}

export interface AudiobookRetailSubmissionReviewSession {
  schemaVersion: typeof AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  packageId: string;
  distributor: "acx-audible";
  deliveryAttempt: Readonly<{
    id: string;
    revision: 2;
    fingerprint: string;
    completedAt: string;
    receiptFingerprint: string;
    remoteDraftReferenceHash: string;
  }>;
  releaseDecision: Readonly<{
    id: string;
    revision: 1;
    fingerprint: string;
  }>;
  packageReview: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
  }>;
  inspection: Readonly<{
    id: string;
    revision: 1;
    fingerprint: string;
  }>;
  sourceManifest: Readonly<{
    id: string;
    revision: 1;
    fingerprint: string;
  }>;
  policy: Readonly<{
    id: string;
    externalVersion: string;
    reviewedAt: string;
    expiresAt: string;
    fingerprint: string;
  }>;
  rightsFingerprint: string;
  distributorAccount: Readonly<{
    evidenceId: string;
    evidenceFingerprint: string;
    accessExpiresAt: string;
  }>;
  files: readonly AudiobookRetailSubmissionReviewFile[];
  mediaFileCount: number;
  totalMediaBytes: number;
  totalPackageBytes: number;
  fileSetFingerprint: string;
  requiredRoles: readonly AudiobookRetailSubmissionReviewRole[];
  reviews: readonly AudiobookRetailSubmissionReviewEntry[];
  reviewDeadline: string;
  status: AudiobookRetailSubmissionReviewStatus;
  approval?: AudiobookRetailSubmissionReviewApproval;
  revision: number;
  previousFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailSubmissionReviewPublicView {
  id: string;
  bookId: string;
  distributor: "acx-audible";
  mediaFileCount: number;
  totalPackageBytes: number;
  reviewCount: number;
  reviewerCount: number;
  playbackContexts: readonly AudiobookRetailSubmissionPlaybackContext[];
  scoreAverages: AudiobookRetailSubmissionReviewScores | null;
  findingCodes: readonly string[];
  status: AudiobookRetailSubmissionReviewStatus;
  readyForApproval: boolean;
  submissionDecisionEligible: boolean;
  reviewDeadline: string;
  approvedAt?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailSubmissionReviewSources {
  deliveryAttempt: AudiobookRetailDeliveryAttempt;
  releaseDecision: AudiobookRetailReleaseDecision;
  packageReview: AudiobookRetailPackageReviewSession;
  inspection: AudiobookRetailPackageInspectionEvidence;
  packageManifest: AudiobookRetailPackageManifest;
  policy: AudiobookRetailEncodingPolicy;
  rights: ArtifactRightsSnapshot;
  distributorAccount: AudiobookRetailDistributorAccountEvidence;
}

export class AudiobookRetailSubmissionReviewError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailSubmissionReviewError";
    this.code = code;
  }
}

export class AudiobookRetailSubmissionReviewStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudiobookRetailSubmissionReviewStoreConflictError";
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
] as const satisfies readonly AudiobookRetailSubmissionReviewRole[]);
const REQUIRED_CONTEXTS = Object.freeze([
  "consumer-headphones",
  "remote-draft-player",
  "speakers",
  "studio-headphones",
] as const satisfies readonly AudiobookRetailSubmissionPlaybackContext[]);
const PLAYBACK_CONTEXTS: ReadonlySet<AudiobookRetailSubmissionPlaybackContext> =
  new Set(REQUIRED_CONTEXTS);
const SCORE_KEYS = Object.freeze([
  "remoteFileCompleteness",
  "fileNamingAndOrder",
  "openingAndClosingAccuracy",
  "narrativeCoverage",
  "remoteProcessingIntegrity",
  "playbackIntegrity",
  "retailSampleIntegrity",
  "submissionReadiness",
] as const satisfies readonly (keyof AudiobookRetailSubmissionReviewScores)[]);
const MAXIMUM_REVIEW_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const MAXIMUM_FILES = 2_003;
const MAXIMUM_MEDIA_BYTES = 16 * 1024 * 1024 * 1024;
const MAXIMUM_PACKAGE_BYTES = MAXIMUM_MEDIA_BYTES + 32 * 1024 * 1024;
const MAXIMUM_REVIEW_ENTRIES = 100;
const MAXIMUM_FINDING_CODES = 100;
const MAXIMUM_NOTES_LENGTH = 8_000;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailSubmissionReviewError(code);
  }
  return value;
}

function requireHumanActor(value: string, code: string): string {
  requireIdentifier(value, code);
  if (HUMAN_BLOCKLIST.test(value)) {
    throw new AudiobookRetailSubmissionReviewError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailSubmissionReviewError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailSubmissionReviewError(code);
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
    throw new AudiobookRetailSubmissionReviewError(code);
  }
  return value;
}

function requireNotes(
  value: string | undefined,
  required: boolean,
): string | undefined {
  if (value === undefined) {
    if (required) {
      throw new AudiobookRetailSubmissionReviewError(
        "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_NOTES_REQUIRED",
      );
    }
    return undefined;
  }
  const trimmed = value.trim();
  if (
    !trimmed
    || trimmed.length > MAXIMUM_NOTES_LENGTH
    || CONTROL_CHARACTERS.test(trimmed)
  ) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_NOTES_INVALID",
    );
  }
  return trimmed;
}

function normaliseFindingCodes(
  decision: AudiobookRetailSubmissionReviewDecision,
  input: readonly string[] | undefined,
): readonly string[] {
  const values = input ?? [];
  if (!Array.isArray(values) || values.length > MAXIMUM_FINDING_CODES) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_FINDINGS_INVALID",
    );
  }
  const unique = new Set<string>();
  for (const code of values) {
    if (!FINDING_CODE_PATTERN.test(code) || unique.has(code)) {
      throw new AudiobookRetailSubmissionReviewError(
        "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_FINDINGS_INVALID",
      );
    }
    unique.add(code);
  }
  if (decision === "approve" && unique.size > 0) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_APPROVAL_FINDINGS_FORBIDDEN",
    );
  }
  if (decision === "changes-requested" && unique.size === 0) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_CHANGE_FINDINGS_REQUIRED",
    );
  }
  return Object.freeze(
    [...unique].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function assertScores(scores: AudiobookRetailSubmissionReviewScores): void {
  for (const key of SCORE_KEYS) {
    const value = scores[key];
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new AudiobookRetailSubmissionReviewError(
        "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_SCORE_INVALID",
      );
    }
  }
}

function freezeScores(
  scores: AudiobookRetailSubmissionReviewScores,
): AudiobookRetailSubmissionReviewScores {
  assertScores(scores);
  return Object.freeze({ ...scores });
}

function assertCoverage(
  coverage: AudiobookRetailSubmissionReviewCoverage,
  fileCount: number,
): void {
  if (
    coverage.remoteDraftOpened !== true
    || coverage.remoteDraftReferenceMatched !== true
    || coverage.completeFileListConfirmed !== true
    || coverage.fileCountReviewed !== fileCount
    || coverage.openingCreditPlayed !== true
    || coverage.firstNarrativePlayed !== true
    || coverage.midpointNarrativePlayed !== true
    || coverage.finalNarrativePlayed !== true
    || coverage.closingCreditPlayed !== true
    || coverage.retailSamplePlayed !== true
    || coverage.allRemoteProcessingComplete !== true
    || coverage.noRemoteValidationErrors !== true
    || coverage.submissionNotInitiated !== true
  ) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_COVERAGE_INCOMPLETE",
    );
  }
}

function freezeCoverage(
  coverage: AudiobookRetailSubmissionReviewCoverage,
  fileCount: number,
): AudiobookRetailSubmissionReviewCoverage {
  assertCoverage(coverage, fileCount);
  return Object.freeze({ ...coverage });
}

function normaliseContexts(
  role: AudiobookRetailSubmissionReviewRole,
  contexts: readonly AudiobookRetailSubmissionPlaybackContext[],
): readonly AudiobookRetailSubmissionPlaybackContext[] {
  if (!REQUIRED_ROLES.includes(role)) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ROLE_INVALID",
    );
  }
  if (!Array.isArray(contexts) || contexts.length === 0 || contexts.length > 4) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_CONTEXTS_INVALID",
    );
  }
  const unique = new Set<AudiobookRetailSubmissionPlaybackContext>();
  for (const context of contexts) {
    if (!PLAYBACK_CONTEXTS.has(context) || unique.has(context)) {
      throw new AudiobookRetailSubmissionReviewError(
        "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_CONTEXTS_INVALID",
      );
    }
    unique.add(context);
  }
  if (!unique.has("remote-draft-player")) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_REMOTE_PLAYER_REQUIRED",
    );
  }
  if (role === "engineering" && !unique.has("studio-headphones")) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ENGINEERING_CONTEXT_REQUIRED",
    );
  }
  if (
    role === "editorial"
    && !unique.has("consumer-headphones")
    && !unique.has("speakers")
  ) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_EDITORIAL_CONTEXT_REQUIRED",
    );
  }
  return Object.freeze(
    [...unique].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function reviewFingerprint(
  value: Omit<AudiobookRetailSubmissionReviewEntry, "fingerprint">,
): string {
  return stableHash(value);
}

function fileFingerprint(
  value: Omit<AudiobookRetailSubmissionReviewFile, "fingerprint">,
): string {
  return stableHash(value);
}

function approvalFingerprint(
  value: Omit<AudiobookRetailSubmissionReviewApproval, "fingerprint">,
): string {
  return stableHash(value);
}

function sessionFingerprint(
  value: Omit<AudiobookRetailSubmissionReviewSession, "fingerprint">,
): string {
  return stableHash(value);
}

function fileSetFingerprint(
  review: AudiobookRetailPackageReviewSession,
): string {
  return stableHash(review.files.map((file) => ({
    ordinal: file.ordinal,
    kind: file.kind,
    role: file.role,
    fileName: file.fileName,
    contentHash: file.contentHash,
    byteCount: file.byteCount,
    fingerprint: file.fingerprint,
  })));
}

function currentRights(
  rights: ArtifactRightsSnapshot,
  expectedFingerprint: string,
  now: Date,
): void {
  requireIdentifier(
    rights.rightsEvidenceId,
    "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_RIGHTS_ID_INVALID",
  );
  requireHash(
    rights.rightsFingerprint,
    "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_RIGHTS_HASH_INVALID",
  );
  if (
    rights.rightsFingerprint !== expectedFingerprint
    || !rights.allowedUses.includes("audiobook")
  ) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_RIGHTS_SCOPE_MISMATCH",
    );
  }
  if (!rights.commercialUseApproved) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_COMMERCIAL_RIGHTS_REQUIRED",
    );
  }
  if (rights.expiresAt && Date.parse(rights.expiresAt) <= now.getTime()) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_RIGHTS_EXPIRED",
    );
  }
  if (
    rights.deletionRequiredAt
    && Date.parse(rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_RETENTION_EXPIRED",
    );
  }
}

function reviewDeadline(
  sources: AudiobookRetailSubmissionReviewSources,
): string {
  const completedAt = Date.parse(sources.deliveryAttempt.receipt!.completedAt);
  const candidates = [
    completedAt + MAXIMUM_REVIEW_AGE_MS,
    Date.parse(sources.policy.expiresAt),
    Date.parse(sources.distributorAccount.expiresAt),
  ];
  if (sources.rights.expiresAt) {
    candidates.push(Date.parse(sources.rights.expiresAt));
  }
  if (sources.rights.deletionRequiredAt) {
    candidates.push(Date.parse(sources.rights.deletionRequiredAt));
  }
  return new Date(Math.min(...candidates)).toISOString();
}

function assertSources(
  sources: AudiobookRetailSubmissionReviewSources,
  now: Date,
): void {
  assertAudiobookRetailDeliveryAttempt(sources.deliveryAttempt);
  assertAudiobookRetailReleaseDecision(sources.releaseDecision);
  assertAudiobookRetailPackageReviewSession(sources.packageReview);
  assertAudiobookRetailPackageInspectionEvidence(sources.inspection);
  assertAudiobookRetailPackageManifest(sources.packageManifest);
  assertAudiobookRetailEncodingPolicy(sources.policy);
  assertCurrentAudiobookRetailEncodingPolicy(sources.policy, now);
  assertAudiobookRetailDistributorAccountEvidence(
    sources.distributorAccount,
    now,
  );
  currentRights(
    sources.rights,
    sources.packageReview.rightsFingerprint,
    now,
  );
  const attempt = sources.deliveryAttempt;
  if (
    attempt.status !== "files-transferred-awaiting-submission-review"
    || !attempt.receipt
    || attempt.receipt.submissionInitiated !== false
    || attempt.receipt.retailerAcceptanceClaimed !== false
    || attempt.receipt.fileCountAcknowledged !== attempt.package.mediaFileCount
  ) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_TRANSFER_RECEIPT_REQUIRED",
    );
  }
  if (
    attempt.projectId !== sources.releaseDecision.projectId
    || attempt.projectId !== sources.packageReview.projectId
    || attempt.projectId !== sources.inspection.projectId
    || attempt.projectId !== sources.packageManifest.projectId
    || attempt.projectId !== sources.distributorAccount.projectId
    || attempt.bookId !== sources.releaseDecision.bookId
    || attempt.bookId !== sources.packageReview.bookId
    || attempt.bookId !== sources.inspection.bookId
    || attempt.bookId !== sources.packageManifest.bookId
    || attempt.bookId !== sources.distributorAccount.bookId
    || attempt.packageId !== sources.packageReview.packageId
    || attempt.packageId !== sources.inspection.packageId
    || attempt.releaseDecision.id !== sources.releaseDecision.id
    || attempt.releaseDecision.fingerprint !== sources.releaseDecision.fingerprint
    || attempt.packageReview.id !== sources.packageReview.id
    || attempt.packageReview.revision !== sources.packageReview.revision
    || attempt.packageReview.fingerprint !== sources.packageReview.fingerprint
    || attempt.inspection.id !== sources.inspection.id
    || attempt.inspection.fingerprint !== sources.inspection.fingerprint
    || attempt.packageManifest.id !== sources.packageManifest.id
    || attempt.packageManifest.fingerprint !== sources.packageManifest.fingerprint
    || attempt.distributorAccount.evidenceId !== sources.distributorAccount.id
    || attempt.distributorAccount.evidenceFingerprint
      !== sources.distributorAccount.fingerprint
    || sources.releaseDecision.packageReview.id !== sources.packageReview.id
    || sources.releaseDecision.inspection.id !== sources.inspection.id
    || sources.releaseDecision.packageManifest.id !== sources.packageManifest.id
  ) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_SOURCE_MISMATCH",
    );
  }
  if (
    sources.packageReview.status !== "approved-for-release-decision"
    || !sources.packageReview.approval
    || sources.packageReview.approval.releaseDecisionEligible !== true
    || sources.packageReview.policy.fingerprint !== sources.policy.fingerprint
    || sources.packageManifest.policy.fingerprint !== sources.policy.fingerprint
    || sources.releaseDecision.policy.fingerprint !== sources.policy.fingerprint
    || sources.packageReview.rightsFingerprint
      !== sources.rights.rightsFingerprint
    || sources.packageManifest.rightsFingerprint
      !== sources.rights.rightsFingerprint
    || sources.releaseDecision.rightsFingerprint
      !== sources.rights.rightsFingerprint
  ) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_GOVERNANCE_MISMATCH",
    );
  }
  const expectedFileSet = fileSetFingerprint(sources.packageReview);
  if (
    attempt.package.fileSetFingerprint !== expectedFileSet
    || sources.releaseDecision.package.fileSetFingerprint !== expectedFileSet
    || attempt.package.mediaFileCount !== sources.packageReview.mediaFileCount
    || attempt.package.totalMediaBytes !== sources.packageReview.totalMediaBytes
    || attempt.package.totalPackageBytes !== sources.packageReview.totalPackageBytes
    || sources.packageReview.mediaFileCount !== sources.inspection.mediaFileCount
    || sources.packageReview.totalMediaBytes !== sources.inspection.totalMediaBytes
    || sources.packageReview.totalPackageBytes !== sources.inspection.totalPackageBytes
  ) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_FILE_SET_MISMATCH",
    );
  }
  const deadline = Date.parse(reviewDeadline(sources));
  if (
    now.getTime() < Date.parse(attempt.updatedAt)
    || now.getTime() >= deadline
  ) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_WINDOW_EXPIRED",
    );
  }
}

function snapshotFiles(
  review: AudiobookRetailPackageReviewSession,
): readonly AudiobookRetailSubmissionReviewFile[] {
  return Object.freeze(review.files.map((source) => {
    const partial: Omit<AudiobookRetailSubmissionReviewFile, "fingerprint"> = {
      ordinal: source.ordinal,
      kind: source.kind,
      role: source.role,
      fileName: source.fileName,
      contentHash: source.contentHash,
      byteCount: source.byteCount,
      sourceReviewFileFingerprint: source.fingerprint,
    };
    return Object.freeze({
      ...partial,
      fingerprint: fileFingerprint(partial),
    });
  }));
}

function latestReviews(
  reviews: readonly AudiobookRetailSubmissionReviewEntry[],
): ReadonlyMap<AudiobookRetailSubmissionReviewRole, AudiobookRetailSubmissionReviewEntry> {
  const latest = new Map<
    AudiobookRetailSubmissionReviewRole,
    AudiobookRetailSubmissionReviewEntry
  >();
  for (const review of reviews) latest.set(review.role, review);
  return latest;
}

function minimumScore(review: AudiobookRetailSubmissionReviewEntry): number {
  return Math.min(...SCORE_KEYS.map((key) => review.scores[key]));
}

function aggregateContexts(
  reviews: Iterable<AudiobookRetailSubmissionReviewEntry>,
): ReadonlySet<AudiobookRetailSubmissionPlaybackContext> {
  const contexts = new Set<AudiobookRetailSubmissionPlaybackContext>();
  for (const review of reviews) {
    for (const context of review.playbackContexts) contexts.add(context);
  }
  return contexts;
}

function statusFromReviews(
  reviews: readonly AudiobookRetailSubmissionReviewEntry[],
): Exclude<AudiobookRetailSubmissionReviewStatus, "approved-for-submission-decision"> {
  const latest = latestReviews(reviews);
  if (
    [...latest.values()].some(
      (review) => review.decision === "changes-requested",
    )
  ) {
    return "changes-requested";
  }
  const required = REQUIRED_ROLES.map((role) => latest.get(role));
  const contexts = aggregateContexts(
    required.filter(Boolean) as AudiobookRetailSubmissionReviewEntry[],
  );
  if (
    required.every((review) => review?.decision === "approve")
    && required.every((review) => minimumScore(review!) >= 4)
    && required.every((review) => review!.findingCodes.length === 0)
    && new Set(required.map((review) => review!.reviewerId)).size
      === REQUIRED_ROLES.length
    && REQUIRED_CONTEXTS.every((context) => contexts.has(context))
  ) {
    return "ready-for-approval";
  }
  return "open";
}

function reviewerSetFingerprint(
  session: AudiobookRetailSubmissionReviewSession,
): string {
  const latest = latestReviews(session.reviews);
  const editorial = latest.get("editorial");
  const engineering = latest.get("engineering");
  if (!editorial || !engineering) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_REVIEWER_SET_INCOMPLETE",
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

function sourceSnapshot(
  sources: AudiobookRetailSubmissionReviewSources,
): Pick<
  AudiobookRetailSubmissionReviewSession,
  | "projectId"
  | "bookId"
  | "packageId"
  | "distributor"
  | "deliveryAttempt"
  | "releaseDecision"
  | "packageReview"
  | "inspection"
  | "sourceManifest"
  | "policy"
  | "rightsFingerprint"
  | "distributorAccount"
  | "files"
  | "mediaFileCount"
  | "totalMediaBytes"
  | "totalPackageBytes"
  | "fileSetFingerprint"
  | "reviewDeadline"
> {
  const receipt = sources.deliveryAttempt.receipt!;
  return {
    projectId: sources.deliveryAttempt.projectId,
    bookId: sources.deliveryAttempt.bookId,
    packageId: sources.deliveryAttempt.packageId,
    distributor: "acx-audible",
    deliveryAttempt: Object.freeze({
      id: sources.deliveryAttempt.id,
      revision: 2,
      fingerprint: sources.deliveryAttempt.fingerprint,
      completedAt: receipt.completedAt,
      receiptFingerprint: receipt.fingerprint,
      remoteDraftReferenceHash: receipt.remoteDraftReferenceHash,
    }),
    releaseDecision: Object.freeze({
      id: sources.releaseDecision.id,
      revision: 1,
      fingerprint: sources.releaseDecision.fingerprint,
    }),
    packageReview: Object.freeze({
      id: sources.packageReview.id,
      revision: sources.packageReview.revision,
      fingerprint: sources.packageReview.fingerprint,
    }),
    inspection: Object.freeze({
      id: sources.inspection.id,
      revision: 1,
      fingerprint: sources.inspection.fingerprint,
    }),
    sourceManifest: Object.freeze({
      id: sources.packageManifest.id,
      revision: 1,
      fingerprint: sources.packageManifest.fingerprint,
    }),
    policy: Object.freeze({
      id: sources.policy.id,
      externalVersion: sources.policy.externalVersion,
      reviewedAt: sources.policy.reviewedAt,
      expiresAt: sources.policy.expiresAt,
      fingerprint: sources.policy.fingerprint,
    }),
    rightsFingerprint: sources.rights.rightsFingerprint,
    distributorAccount: Object.freeze({
      evidenceId: sources.distributorAccount.id,
      evidenceFingerprint: sources.distributorAccount.fingerprint,
      accessExpiresAt: sources.distributorAccount.expiresAt,
    }),
    files: snapshotFiles(sources.packageReview),
    mediaFileCount: sources.packageReview.mediaFileCount,
    totalMediaBytes: sources.packageReview.totalMediaBytes,
    totalPackageBytes: sources.packageReview.totalPackageBytes,
    fileSetFingerprint: fileSetFingerprint(sources.packageReview),
    reviewDeadline: reviewDeadline(sources),
  };
}

export function createAudiobookRetailSubmissionReviewSession(input: Readonly<{
  id: string;
  sources: AudiobookRetailSubmissionReviewSources;
  createdAt?: Date;
}>): AudiobookRetailSubmissionReviewSession {
  const createdAt = input.createdAt ?? new Date();
  if (Number.isNaN(createdAt.getTime())) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_DATE_INVALID",
    );
  }
  requireIdentifier(
    input.id,
    "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ID_INVALID",
  );
  assertSources(input.sources, createdAt);
  const sources = sourceSnapshot(input.sources);
  const partial: Omit<AudiobookRetailSubmissionReviewSession, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_SCHEMA_VERSION,
    id: input.id,
    ...sources,
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
  assertAudiobookRetailSubmissionReviewSession(session);
  assertAudiobookRetailSubmissionReviewMatchesSources(session, input.sources);
  return session;
}

function reviseSession(
  session: AudiobookRetailSubmissionReviewSession,
  updates: Partial<Pick<
    AudiobookRetailSubmissionReviewSession,
    "reviews" | "status" | "approval"
  >>,
  at: Date,
): AudiobookRetailSubmissionReviewSession {
  assertAudiobookRetailSubmissionReviewSession(session);
  if (
    Number.isNaN(at.getTime())
    || at.getTime() < Date.parse(session.updatedAt)
    || at.getTime() >= Date.parse(session.reviewDeadline)
  ) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_DATE_INVALID",
    );
  }
  if (session.status === "approved-for-submission-decision") {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_APPROVED_IMMUTABLE",
    );
  }
  const {
    fingerprint: _fingerprint,
    previousFingerprint: _previous,
    ...base
  } = session;
  const partial: Omit<AudiobookRetailSubmissionReviewSession, "fingerprint"> = {
    ...base,
    ...updates,
    revision: session.revision + 1,
    previousFingerprint: session.fingerprint,
    updatedAt: at.toISOString(),
  };
  const next = Object.freeze({
    ...partial,
    fingerprint: sessionFingerprint(partial),
  });
  assertAudiobookRetailSubmissionReviewSession(next);
  return next;
}

export function recordAudiobookRetailSubmissionReview(
  session: AudiobookRetailSubmissionReviewSession,
  input: Readonly<{
    id: string;
    role: AudiobookRetailSubmissionReviewRole;
    reviewerId: string;
    coverage: AudiobookRetailSubmissionReviewCoverage;
    playbackContexts: readonly AudiobookRetailSubmissionPlaybackContext[];
    decision: AudiobookRetailSubmissionReviewDecision;
    scores: AudiobookRetailSubmissionReviewScores;
    findingCodes?: readonly string[];
    notes?: string;
    decidedAt?: Date;
  }>,
): AudiobookRetailSubmissionReviewSession {
  assertAudiobookRetailSubmissionReviewSession(session);
  if (session.status === "approved-for-submission-decision") {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_APPROVED_IMMUTABLE",
    );
  }
  requireIdentifier(
    input.id,
    "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ENTRY_ID_INVALID",
  );
  if (session.reviews.some((review) => review.id === input.id)) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ENTRY_ID_DUPLICATE",
    );
  }
  const reviewerId = requireHumanActor(
    input.reviewerId,
    "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_REVIEWER_INVALID",
  );
  const latest = latestReviews(session.reviews);
  for (const [role, review] of latest) {
    if (role !== input.role && review.reviewerId === reviewerId) {
      throw new AudiobookRetailSubmissionReviewError(
        "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_INDEPENDENT_REVIEWERS_REQUIRED",
      );
    }
  }
  const decidedAt = input.decidedAt ?? new Date();
  if (
    Number.isNaN(decidedAt.getTime())
    || decidedAt.getTime() < Date.parse(session.updatedAt)
    || decidedAt.getTime() >= Date.parse(session.reviewDeadline)
  ) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_DATE_INVALID",
    );
  }
  const findingCodes = normaliseFindingCodes(
    input.decision,
    input.findingCodes,
  );
  const notes = requireNotes(
    input.notes,
    input.decision === "changes-requested",
  );
  const reviewBase: Omit<AudiobookRetailSubmissionReviewEntry, "fingerprint"> = {
    id: input.id,
    role: input.role,
    reviewerId,
    coverage: freezeCoverage(input.coverage, session.mediaFileCount),
    playbackContexts: normaliseContexts(input.role, input.playbackContexts),
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
  const reviews = Object.freeze([...session.reviews, review]);
  return reviseSession(
    session,
    { reviews, status: statusFromReviews(reviews) },
    decidedAt,
  );
}

export function approveAudiobookRetailSubmissionReview(
  session: AudiobookRetailSubmissionReviewSession,
  input: Readonly<{
    sources: AudiobookRetailSubmissionReviewSources;
    finalConfirmationId: string;
    approvedByActorId: string;
    humanConfirmation: true;
    approvedAt?: Date;
  }>,
): AudiobookRetailSubmissionReviewSession {
  assertAudiobookRetailSubmissionReviewSession(session);
  if (input.humanConfirmation !== true) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_HUMAN_CONFIRMATION_REQUIRED",
    );
  }
  if (session.status !== "ready-for-approval") {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_NOT_READY_FOR_APPROVAL",
    );
  }
  const approvedAt = input.approvedAt ?? new Date();
  assertSources(input.sources, approvedAt);
  assertAudiobookRetailSubmissionReviewMatchesSources(session, input.sources);
  const approvedByActorId = requireHumanActor(
    input.approvedByActorId,
    "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_APPROVER_INVALID",
  );
  const latest = latestReviews(session.reviews);
  const reviewerIds = new Set(
    [...latest.values()].map((review) => review.reviewerId),
  );
  const excluded = new Set([
    ...reviewerIds,
    input.sources.deliveryAttempt.operatorId,
    input.sources.releaseDecision.decidedByActorId,
    input.sources.distributorAccount.verifiedByActorId,
  ]);
  if (excluded.has(approvedByActorId)) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_INDEPENDENT_APPROVER_REQUIRED",
    );
  }
  const approvalBase: Omit<AudiobookRetailSubmissionReviewApproval, "fingerprint"> = {
    finalConfirmationId: requireIdentifier(
      input.finalConfirmationId,
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_CONFIRMATION_ID_INVALID",
    ),
    approvedByActorId,
    approvedAt: approvedAt.toISOString(),
    reviewerSetFingerprint: reviewerSetFingerprint(session),
    deliveryAttemptFingerprint: input.sources.deliveryAttempt.fingerprint,
    releaseDecisionFingerprint: input.sources.releaseDecision.fingerprint,
    remoteDraftReferenceHash:
      input.sources.deliveryAttempt.receipt!.remoteDraftReferenceHash,
    fileSetFingerprint: session.fileSetFingerprint,
    submissionDecisionEligible: true,
  };
  const approval = Object.freeze({
    ...approvalBase,
    fingerprint: approvalFingerprint(approvalBase),
  });
  return reviseSession(
    session,
    { status: "approved-for-submission-decision", approval },
    approvedAt,
  );
}

function assertFile(file: AudiobookRetailSubmissionReviewFile): void {
  requireInteger(
    file.ordinal,
    1,
    MAXIMUM_FILES,
    "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_FILE_ORDINAL_INVALID",
  );
  if (!/^[A-Za-z0-9]+\.mp3$/u.test(file.fileName)) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_FILE_NAME_INVALID",
    );
  }
  requireHash(
    file.contentHash,
    "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_FILE_HASH_INVALID",
  );
  requireHash(
    file.sourceReviewFileFingerprint,
    "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_SOURCE_FILE_HASH_INVALID",
  );
  requireInteger(
    file.byteCount,
    1,
    MAXIMUM_MEDIA_BYTES,
    "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_FILE_SIZE_INVALID",
  );
  const { fingerprint, ...partial } = file;
  if (fileFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_FILE_FINGERPRINT_INVALID",
    );
  }
}

function assertReviewEntry(
  review: AudiobookRetailSubmissionReviewEntry,
  fileCount: number,
): void {
  requireIdentifier(
    review.id,
    "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ENTRY_ID_INVALID",
  );
  if (!REQUIRED_ROLES.includes(review.role)) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ROLE_INVALID",
    );
  }
  requireHumanActor(
    review.reviewerId,
    "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_REVIEWER_INVALID",
  );
  assertCoverage(review.coverage, fileCount);
  normaliseContexts(review.role, review.playbackContexts);
  assertScores(review.scores);
  normaliseFindingCodes(review.decision, review.findingCodes);
  requireNotes(review.notes, review.decision === "changes-requested");
  requireDate(
    review.decidedAt,
    "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_DATE_INVALID",
  );
  const { fingerprint, ...partial } = review;
  if (reviewFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ENTRY_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailSubmissionReviewSession(
  session: AudiobookRetailSubmissionReviewSession,
): void {
  if (
    session.schemaVersion !== AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [session.id, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ID_INVALID"],
    [session.projectId, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_PROJECT_ID_INVALID"],
    [session.bookId, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_BOOK_ID_INVALID"],
    [session.packageId, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_PACKAGE_ID_INVALID"],
    [session.deliveryAttempt.id, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ATTEMPT_ID_INVALID"],
    [session.releaseDecision.id, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_DECISION_ID_INVALID"],
    [session.packageReview.id, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_PACKAGE_REVIEW_ID_INVALID"],
    [session.inspection.id, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_INSPECTION_ID_INVALID"],
    [session.sourceManifest.id, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_MANIFEST_ID_INVALID"],
    [session.policy.id, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_POLICY_ID_INVALID"],
    [session.distributorAccount.evidenceId, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ACCOUNT_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  for (const [value, code] of [
    [session.deliveryAttempt.fingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ATTEMPT_HASH_INVALID"],
    [session.deliveryAttempt.receiptFingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_RECEIPT_HASH_INVALID"],
    [session.deliveryAttempt.remoteDraftReferenceHash, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_REMOTE_DRAFT_HASH_INVALID"],
    [session.releaseDecision.fingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_DECISION_HASH_INVALID"],
    [session.packageReview.fingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_PACKAGE_REVIEW_HASH_INVALID"],
    [session.inspection.fingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_INSPECTION_HASH_INVALID"],
    [session.sourceManifest.fingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_MANIFEST_HASH_INVALID"],
    [session.policy.fingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_POLICY_HASH_INVALID"],
    [session.rightsFingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_RIGHTS_HASH_INVALID"],
    [session.distributorAccount.evidenceFingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ACCOUNT_HASH_INVALID"],
    [session.fileSetFingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_FILE_SET_HASH_INVALID"],
  ] as const) requireHash(value, code);
  if (
    session.distributor !== "acx-audible"
    || session.deliveryAttempt.revision !== 2
    || session.releaseDecision.revision !== 1
    || session.inspection.revision !== 1
    || session.sourceManifest.revision !== 1
  ) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_SOURCE_STATE_INVALID",
    );
  }
  requireInteger(
    session.packageReview.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_PACKAGE_REVIEW_REVISION_INVALID",
  );
  if (
    !Array.isArray(session.files)
    || session.files.length < 4
    || session.files.length > MAXIMUM_FILES
  ) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_FILES_INVALID",
    );
  }
  const names = new Set<string>();
  let totalMediaBytes = 0;
  for (const [index, file] of session.files.entries()) {
    assertFile(file);
    if (file.ordinal !== index + 1 || names.has(file.fileName)) {
      throw new AudiobookRetailSubmissionReviewError(
        "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_FILE_ORDER_INVALID",
      );
    }
    names.add(file.fileName);
    totalMediaBytes += file.byteCount;
  }
  if (
    session.files[0]!.role !== "opening-credit"
    || session.files.at(-2)!.role !== "closing-credit"
    || session.files.at(-1)!.role !== "retail-sample"
    || session.files.at(-1)!.kind !== "retail-sample"
    || session.mediaFileCount !== session.files.length
    || session.totalMediaBytes !== totalMediaBytes
  ) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_FILE_SET_INVALID",
    );
  }
  requireInteger(
    session.totalPackageBytes,
    session.totalMediaBytes + 1,
    MAXIMUM_PACKAGE_BYTES,
    "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_SIZE_INVALID",
  );
  if (stableHash(session.requiredRoles) !== stableHash(REQUIRED_ROLES)) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_REQUIRED_ROLES_INVALID",
    );
  }
  if (
    !Array.isArray(session.reviews)
    || session.reviews.length > MAXIMUM_REVIEW_ENTRIES
  ) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ENTRIES_INVALID",
    );
  }
  const createdAt = Date.parse(requireDate(
    session.createdAt,
    "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_DATE_INVALID",
  ));
  const updatedAt = Date.parse(requireDate(
    session.updatedAt,
    "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_DATE_INVALID",
  ));
  const deadline = Date.parse(requireDate(
    session.reviewDeadline,
    "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_DEADLINE_INVALID",
  ));
  if (
    Date.parse(session.deliveryAttempt.completedAt) > createdAt
    || updatedAt < createdAt
    || updatedAt >= deadline
    || deadline <= createdAt
  ) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_DATE_INVALID",
    );
  }
  const ids = new Set<string>();
  let priorAt = createdAt;
  for (const review of session.reviews) {
    assertReviewEntry(review, session.mediaFileCount);
    if (ids.has(review.id)) {
      throw new AudiobookRetailSubmissionReviewError(
        "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ENTRY_ID_DUPLICATE",
      );
    }
    ids.add(review.id);
    const reviewAt = Date.parse(review.decidedAt);
    if (reviewAt < priorAt || reviewAt >= deadline) {
      throw new AudiobookRetailSubmissionReviewError(
        "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_DATE_INVALID",
      );
    }
    priorAt = reviewAt;
  }
  if (updatedAt < priorAt) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_DATE_INVALID",
    );
  }
  const latest = latestReviews(session.reviews);
  const latestReviewerIds = [...latest.values()].map((review) => review.reviewerId);
  if (new Set(latestReviewerIds).size !== latestReviewerIds.length) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_INDEPENDENT_REVIEWERS_REQUIRED",
    );
  }
  requireInteger(
    session.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_REVISION_INVALID",
  );
  if (session.revision === 1 && session.previousFingerprint !== undefined) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_REVISION_CHAIN_INVALID",
    );
  }
  if (session.revision > 1) {
    requireHash(
      session.previousFingerprint ?? "",
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_REVISION_CHAIN_INVALID",
    );
  }
  const derivedStatus = statusFromReviews(session.reviews);
  const expectedStatus = session.approval
    ? "approved-for-submission-decision"
    : derivedStatus;
  if (session.status !== expectedStatus) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_STATUS_MISMATCH",
    );
  }
  if (session.approval) {
    if (derivedStatus !== "ready-for-approval") {
      throw new AudiobookRetailSubmissionReviewError(
        "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_APPROVAL_WITHOUT_READY_REVIEWS",
      );
    }
    requireIdentifier(
      session.approval.finalConfirmationId,
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_CONFIRMATION_ID_INVALID",
    );
    requireHumanActor(
      session.approval.approvedByActorId,
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_APPROVER_INVALID",
    );
    requireDate(
      session.approval.approvedAt,
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_DATE_INVALID",
    );
    for (const [value, code] of [
      [session.approval.reviewerSetFingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_REVIEWER_SET_HASH_INVALID"],
      [session.approval.deliveryAttemptFingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ATTEMPT_HASH_INVALID"],
      [session.approval.releaseDecisionFingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_DECISION_HASH_INVALID"],
      [session.approval.remoteDraftReferenceHash, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_REMOTE_DRAFT_HASH_INVALID"],
      [session.approval.fileSetFingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_FILE_SET_HASH_INVALID"],
    ] as const) requireHash(value, code);
    if (
      session.approval.reviewerSetFingerprint !== reviewerSetFingerprint(session)
      || session.approval.deliveryAttemptFingerprint
        !== session.deliveryAttempt.fingerprint
      || session.approval.releaseDecisionFingerprint
        !== session.releaseDecision.fingerprint
      || session.approval.remoteDraftReferenceHash
        !== session.deliveryAttempt.remoteDraftReferenceHash
      || session.approval.fileSetFingerprint !== session.fileSetFingerprint
      || session.approval.submissionDecisionEligible !== true
      || session.approval.approvedAt !== session.updatedAt
    ) {
      throw new AudiobookRetailSubmissionReviewError(
        "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_APPROVAL_STATE_INVALID",
      );
    }
    const { fingerprint, ...approvalBase } = session.approval;
    if (approvalFingerprint(approvalBase) !== fingerprint) {
      throw new AudiobookRetailSubmissionReviewError(
        "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_APPROVAL_FINGERPRINT_INVALID",
      );
    }
  }
  const { fingerprint, ...partial } = session;
  if (sessionFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailSubmissionReviewMatchesSources(
  session: AudiobookRetailSubmissionReviewSession,
  sources: AudiobookRetailSubmissionReviewSources,
): void {
  assertAudiobookRetailSubmissionReviewSession(session);
  assertSources(sources, new Date(session.updatedAt));
  const expected = sourceSnapshot(sources);
  if (
    session.projectId !== expected.projectId
    || session.bookId !== expected.bookId
    || session.packageId !== expected.packageId
    || stableHash(session.deliveryAttempt) !== stableHash(expected.deliveryAttempt)
    || stableHash(session.releaseDecision) !== stableHash(expected.releaseDecision)
    || stableHash(session.packageReview) !== stableHash(expected.packageReview)
    || stableHash(session.inspection) !== stableHash(expected.inspection)
    || stableHash(session.sourceManifest) !== stableHash(expected.sourceManifest)
    || stableHash(session.policy) !== stableHash(expected.policy)
    || session.rightsFingerprint !== expected.rightsFingerprint
    || stableHash(session.distributorAccount)
      !== stableHash(expected.distributorAccount)
    || stableHash(session.files) !== stableHash(expected.files)
    || session.mediaFileCount !== expected.mediaFileCount
    || session.totalMediaBytes !== expected.totalMediaBytes
    || session.totalPackageBytes !== expected.totalPackageBytes
    || session.fileSetFingerprint !== expected.fileSetFingerprint
    || session.reviewDeadline !== expected.reviewDeadline
  ) {
    throw new AudiobookRetailSubmissionReviewError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_SOURCE_MISMATCH",
    );
  }
}

function scoreAverages(
  session: AudiobookRetailSubmissionReviewSession,
): AudiobookRetailSubmissionReviewScores | null {
  const values = [...latestReviews(session.reviews).values()];
  if (values.length === 0) return null;
  return Object.freeze(Object.fromEntries(
    SCORE_KEYS.map((key) => [
      key,
      Number((
        values.reduce((total, review) => total + review.scores[key], 0)
        / values.length
      ).toFixed(2)),
    ]),
  )) as unknown as AudiobookRetailSubmissionReviewScores;
}

export function audiobookRetailSubmissionReviewPublicView(
  session: AudiobookRetailSubmissionReviewSession,
): AudiobookRetailSubmissionReviewPublicView {
  assertAudiobookRetailSubmissionReviewSession(session);
  const latest = latestReviews(session.reviews);
  const contexts = aggregateContexts(latest.values());
  const findingCodes = new Set<string>();
  for (const review of latest.values()) {
    for (const code of review.findingCodes) findingCodes.add(code);
  }
  return Object.freeze({
    id: session.id,
    bookId: session.bookId,
    distributor: session.distributor,
    mediaFileCount: session.mediaFileCount,
    totalPackageBytes: session.totalPackageBytes,
    reviewCount: session.reviews.length,
    reviewerCount: new Set(
      [...latest.values()].map((review) => review.reviewerId),
    ).size,
    playbackContexts: Object.freeze(
      [...contexts].sort((left, right) => left.localeCompare(right, "en-AU")),
    ),
    scoreAverages: scoreAverages(session),
    findingCodes: Object.freeze(
      [...findingCodes].sort((left, right) => left.localeCompare(right, "en-AU")),
    ),
    status: session.status,
    readyForApproval: session.status === "ready-for-approval",
    submissionDecisionEligible:
      session.approval?.submissionDecisionEligible === true,
    reviewDeadline: session.reviewDeadline,
    ...(session.approval ? { approvedAt: session.approval.approvedAt } : {}),
    revision: session.revision,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    fingerprint: session.fingerprint,
  });
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<AudiobookRetailSubmissionReviewSession> {
  const session = envelope.payload as unknown as AudiobookRetailSubmissionReviewSession;
  assertAudiobookRetailSubmissionReviewSession(session);
  if (
    envelope.entityType !== AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ENTITY_TYPE
    || envelope.entityId !== session.id
    || envelope.revision !== session.revision
  ) {
    throw new AudiobookRetailSubmissionReviewStoreConflictError(
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<AudiobookRetailSubmissionReviewSession>;
}

function payload(
  session: AudiobookRetailSubmissionReviewSession,
): Record<string, unknown> {
  return session as unknown as Record<string, unknown>;
}

export class FileAudiobookRetailSubmissionReviewStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    session: AudiobookRetailSubmissionReviewSession,
    actorId: string,
  ): Promise<StoredEnvelope<AudiobookRetailSubmissionReviewSession>> {
    assertAudiobookRetailSubmissionReviewSession(session);
    requireIdentifier(
      actorId,
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_STORE_ACTOR_INVALID",
    );
    try {
      const existing = await this.read(session.id);
      if (existing) {
        if (existing.payload.fingerprint === session.fingerprint) return existing;
        throw new AudiobookRetailSubmissionReviewStoreConflictError(
          "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_STORE_IDEMPOTENCY_CONFLICT",
        );
      }
      const envelope = toEnvelope(await this.#store.create(
        AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ENTITY_TYPE,
        session.id,
        payload(session),
        new Date(session.createdAt),
      ));
      await this.#audit(
        actorId,
        "audiobook_retail_submission_review.created",
        envelope,
      );
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailSubmissionReviewStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(
    sessionId: string,
  ): Promise<StoredEnvelope<AudiobookRetailSubmissionReviewSession> | null> {
    requireIdentifier(
      sessionId,
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_STORE_ID_INVALID",
    );
    const envelope = await this.#store.read<Record<string, unknown>>(
      AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ENTITY_TYPE,
      sessionId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(
    sessionId: string,
  ): Promise<StoredEnvelope<AudiobookRetailSubmissionReviewSession>> {
    const envelope = await this.read(sessionId);
    if (!envelope) {
      throw new AudiobookRetailSubmissionReviewStoreConflictError(
        "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }

  async save(
    session: AudiobookRetailSubmissionReviewSession,
    input: Readonly<{
      expectedRevision: number;
      actorId: string;
      action: string;
    }>,
  ): Promise<StoredEnvelope<AudiobookRetailSubmissionReviewSession>> {
    assertAudiobookRetailSubmissionReviewSession(session);
    requireIdentifier(
      input.actorId,
      "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_STORE_ACTOR_INVALID",
    );
    if (
      !/^audiobook_retail_submission_review\.[a-z][a-z0-9._-]{1,80}$/u.test(
        input.action,
      )
    ) {
      throw new AudiobookRetailSubmissionReviewStoreConflictError(
        "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_STORE_ACTION_INVALID",
      );
    }
    const current = await this.require(session.id);
    if (
      current.revision !== input.expectedRevision
      || session.revision !== current.payload.revision + 1
      || session.previousFingerprint !== current.payload.fingerprint
    ) {
      throw new AudiobookRetailSubmissionReviewStoreConflictError(
        "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_STORE_REVISION_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.replace(
        AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ENTITY_TYPE,
        session.id,
        input.expectedRevision,
        payload(session),
        new Date(session.updatedAt),
      ));
      await this.#audit(input.actorId, input.action, envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailSubmissionReviewStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async #audit(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<AudiobookRetailSubmissionReviewSession>,
  ): Promise<void> {
    const session = envelope.payload;
    const latest = latestReviews(session.reviews);
    const findings = new Set<string>();
    for (const review of latest.values()) {
      for (const code of review.findingCodes) findings.add(code);
    }
    await this.#store.appendAuditEvent({
      actorId,
      action,
      entityType: AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ENTITY_TYPE,
      entityId: envelope.entityId,
      revision: envelope.revision,
      occurredAt: new Date(envelope.savedAt),
      metadata: {
        status: session.status,
        mediaFileCount: session.mediaFileCount,
        reviewCount: session.reviews.length,
        reviewerCount: new Set(
          [...latest.values()].map((review) => review.reviewerId),
        ).size,
        findingCount: findings.size,
        remoteProcessingComplete: true,
        submissionInitiated: false,
        submissionDecisionEligible:
          session.approval?.submissionDecisionEligible === true,
      },
    });
  }
}
