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
} from "./audiobook-retail-package-manifest.js";
import {
  assertAudiobookRetailPackageReviewSession,
  type AudiobookRetailPackageReviewSession,
} from "./audiobook-retail-package-review.js";
import {
  assertAudiobookRetailEncodingPolicy,
  assertAudiobookRetailNarrationEligibilityEvidence,
  assertCurrentAudiobookRetailEncodingPolicy,
  type AudiobookRetailEncodingPolicy,
  type AudiobookRetailNarrationEligibilityEvidence,
  type AudiobookRetailNarrationSourceKind,
} from "./audiobook-retail-policy.js";
import {
  assertAudiobookRetailDistributorAccountEvidence,
  assertAudiobookRetailReleaseDecision,
  type AudiobookRetailDistributorAccountEvidence,
  type AudiobookRetailReleaseDecision,
} from "./audiobook-retail-release-decision.js";
import {
  assertAudiobookRetailSubmissionReviewSession,
  type AudiobookRetailSubmissionReviewEntry,
  type AudiobookRetailSubmissionReviewSession,
} from "./audiobook-retail-submission-review.js";
import {
  assertAudiobookRetailTrackPlan,
  type AudiobookRetailTrackPlan,
} from "./audiobook-retail-track-plan.js";
import { stableHash } from "./index.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";

export const AUDIOBOOK_RETAIL_SUBMISSION_DECISION_SCHEMA_VERSION =
  "storyteller-audiobook-retail-submission-decision-v1" as const;
export const AUDIOBOOK_RETAIL_SUBMISSION_DECISION_ENTITY_TYPE =
  "audiobook-retail-submission-decision" as const;

export interface AudiobookRetailSubmissionDecision {
  schemaVersion: typeof AUDIOBOOK_RETAIL_SUBMISSION_DECISION_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  packageId: string;
  distributor: "acx-audible";
  submissionReview: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
    approvalFingerprint: string;
    approvedAt: string;
    reviewDeadline: string;
  }>;
  deliveryAttempt: Readonly<{
    id: string;
    revision: 2;
    fingerprint: string;
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
  trackPlan: Readonly<{
    id: string;
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
  narration: Readonly<{
    evidenceId: string;
    sourceKind: AudiobookRetailNarrationSourceKind;
    evidenceFingerprint: string;
    platformAuthorisationPresent: boolean;
    platformAuthorisationFingerprint?: string;
  }>;
  distributorAccount: Readonly<{
    evidenceId: string;
    evidenceFingerprint: string;
    accessExpiresAt: string;
  }>;
  package: Readonly<{
    mediaFileCount: number;
    totalPackageBytes: number;
    fileSetFingerprint: string;
  }>;
  finalConfirmationId: string;
  decidedByActorId: string;
  humanConfirmation: true;
  submissionMethod: "manual-acx-submit";
  maximumSubmissionAttempts: 1;
  decidedAt: string;
  validUntil: string;
  status: "authorized-for-single-submission";
  revision: 1;
  fingerprint: string;
}

export interface AudiobookRetailSubmissionDecisionPublicView {
  id: string;
  bookId: string;
  distributor: "acx-audible";
  policyVersion: string;
  narrationSourceKind: AudiobookRetailNarrationSourceKind;
  platformAuthorisationPresent: boolean;
  mediaFileCount: number;
  totalPackageBytes: number;
  submissionMethod: "manual-acx-submit";
  maximumSubmissionAttempts: 1;
  decidedAt: string;
  validUntil: string;
  status: "authorized-for-single-submission";
  revision: 1;
  fingerprint: string;
}

export interface AudiobookRetailSubmissionDecisionSources {
  submissionReview: AudiobookRetailSubmissionReviewSession;
  deliveryAttempt: AudiobookRetailDeliveryAttempt;
  releaseDecision: AudiobookRetailReleaseDecision;
  packageReview: AudiobookRetailPackageReviewSession;
  inspection: AudiobookRetailPackageInspectionEvidence;
  packageManifest: AudiobookRetailPackageManifest;
  trackPlan: AudiobookRetailTrackPlan;
  policy: AudiobookRetailEncodingPolicy;
  narration: AudiobookRetailNarrationEligibilityEvidence;
  rights: ArtifactRightsSnapshot;
  distributorAccount: AudiobookRetailDistributorAccountEvidence;
}

export interface CreateAudiobookRetailSubmissionDecisionInput {
  id?: string;
  sources: AudiobookRetailSubmissionDecisionSources;
  finalConfirmationId: string;
  decidedByActorId: string;
  humanConfirmation: true;
  submissionMethod: "manual-acx-submit";
  validUntil: string;
  decidedAt?: Date;
}

export class AudiobookRetailSubmissionDecisionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailSubmissionDecisionError";
    this.code = code;
  }
}

export class AudiobookRetailSubmissionDecisionStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudiobookRetailSubmissionDecisionStoreConflictError";
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const HUMAN_BLOCKLIST = /^(?:system|worker|automation|automated|bot)(?:[_-]|$)/iu;
const MAXIMUM_DECISION_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const MAXIMUM_FILES = 2_003;
const MAXIMUM_PACKAGE_BYTES = 16 * 1024 * 1024 * 1024 + 32 * 1024 * 1024;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailSubmissionDecisionError(code);
  }
  return value;
}

function requireHumanActor(value: string, code: string): string {
  requireIdentifier(value, code);
  if (HUMAN_BLOCKLIST.test(value)) {
    throw new AudiobookRetailSubmissionDecisionError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailSubmissionDecisionError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailSubmissionDecisionError(code);
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
    throw new AudiobookRetailSubmissionDecisionError(code);
  }
  return value;
}

function decisionFingerprint(
  value: Omit<AudiobookRetailSubmissionDecision, "fingerprint">,
): string {
  return stableHash(value);
}

function currentRights(
  rights: ArtifactRightsSnapshot,
  expectedFingerprint: string,
  now: Date,
): void {
  requireIdentifier(
    rights.rightsEvidenceId,
    "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_RIGHTS_ID_INVALID",
  );
  requireHash(
    rights.rightsFingerprint,
    "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_RIGHTS_HASH_INVALID",
  );
  if (
    rights.rightsFingerprint !== expectedFingerprint
    || !rights.allowedUses.includes("audiobook")
  ) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_RIGHTS_SCOPE_MISMATCH",
    );
  }
  if (!rights.commercialUseApproved) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_COMMERCIAL_RIGHTS_REQUIRED",
    );
  }
  if (rights.expiresAt && Date.parse(rights.expiresAt) <= now.getTime()) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_RIGHTS_EXPIRED",
    );
  }
  if (
    rights.deletionRequiredAt
    && Date.parse(rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_RETENTION_EXPIRED",
    );
  }
}

function latestSubmissionReviewers(
  review: AudiobookRetailSubmissionReviewSession,
): readonly AudiobookRetailSubmissionReviewEntry[] {
  const latest = new Map<
    AudiobookRetailSubmissionReviewEntry["role"],
    AudiobookRetailSubmissionReviewEntry
  >();
  for (const entry of review.reviews) latest.set(entry.role, entry);
  return Object.freeze([...latest.values()]);
}

function decisionExpiryCeiling(
  sources: AudiobookRetailSubmissionDecisionSources,
  decidedAt: Date,
): number {
  const values = [
    decidedAt.getTime() + MAXIMUM_DECISION_LIFETIME_MS,
    Date.parse(sources.submissionReview.reviewDeadline),
    Date.parse(sources.policy.expiresAt),
    Date.parse(sources.distributorAccount.expiresAt),
  ];
  if (sources.rights.expiresAt) {
    values.push(Date.parse(sources.rights.expiresAt));
  }
  if (sources.rights.deletionRequiredAt) {
    values.push(Date.parse(sources.rights.deletionRequiredAt));
  }
  if (sources.narration.platformAuthorisation) {
    values.push(Date.parse(sources.narration.platformAuthorisation.expiresAt));
  }
  return Math.min(...values);
}

function assertSources(
  sources: AudiobookRetailSubmissionDecisionSources,
  now: Date,
): void {
  assertAudiobookRetailSubmissionReviewSession(sources.submissionReview);
  assertAudiobookRetailDeliveryAttempt(sources.deliveryAttempt);
  assertAudiobookRetailReleaseDecision(sources.releaseDecision);
  assertAudiobookRetailPackageReviewSession(sources.packageReview);
  assertAudiobookRetailPackageInspectionEvidence(sources.inspection);
  assertAudiobookRetailPackageManifest(sources.packageManifest);
  assertAudiobookRetailTrackPlan(sources.trackPlan);
  assertAudiobookRetailEncodingPolicy(sources.policy);
  assertCurrentAudiobookRetailEncodingPolicy(sources.policy, now);
  assertAudiobookRetailNarrationEligibilityEvidence(
    sources.narration,
    sources.policy,
    now,
  );
  assertAudiobookRetailDistributorAccountEvidence(
    sources.distributorAccount,
    now,
  );
  currentRights(
    sources.rights,
    sources.submissionReview.rightsFingerprint,
    now,
  );
  const review = sources.submissionReview;
  const attempt = sources.deliveryAttempt;
  if (
    review.status !== "approved-for-submission-decision"
    || !review.approval
    || review.approval.submissionDecisionEligible !== true
    || attempt.status !== "files-transferred-awaiting-submission-review"
    || !attempt.receipt
    || attempt.receipt.submissionInitiated !== false
    || attempt.receipt.retailerAcceptanceClaimed !== false
  ) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_APPROVED_REVIEW_REQUIRED",
    );
  }
  if (
    review.projectId !== attempt.projectId
    || review.projectId !== sources.releaseDecision.projectId
    || review.projectId !== sources.packageReview.projectId
    || review.projectId !== sources.inspection.projectId
    || review.projectId !== sources.packageManifest.projectId
    || review.projectId !== sources.trackPlan.projectId
    || review.projectId !== sources.narration.projectId
    || review.projectId !== sources.distributorAccount.projectId
    || review.bookId !== attempt.bookId
    || review.bookId !== sources.releaseDecision.bookId
    || review.bookId !== sources.packageReview.bookId
    || review.bookId !== sources.inspection.bookId
    || review.bookId !== sources.packageManifest.bookId
    || review.bookId !== sources.trackPlan.bookId
    || review.bookId !== sources.narration.bookId
    || review.bookId !== sources.distributorAccount.bookId
    || review.packageId !== attempt.packageId
    || review.packageId !== sources.packageReview.packageId
    || review.packageId !== sources.inspection.packageId
  ) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_SOURCE_SCOPE_MISMATCH",
    );
  }
  if (
    review.deliveryAttempt.id !== attempt.id
    || review.deliveryAttempt.fingerprint !== attempt.fingerprint
    || review.deliveryAttempt.receiptFingerprint !== attempt.receipt.fingerprint
    || review.deliveryAttempt.remoteDraftReferenceHash
      !== attempt.receipt.remoteDraftReferenceHash
    || review.releaseDecision.id !== sources.releaseDecision.id
    || review.releaseDecision.fingerprint !== sources.releaseDecision.fingerprint
    || review.packageReview.id !== sources.packageReview.id
    || review.packageReview.fingerprint !== sources.packageReview.fingerprint
    || review.inspection.id !== sources.inspection.id
    || review.inspection.fingerprint !== sources.inspection.fingerprint
    || review.sourceManifest.id !== sources.packageManifest.id
    || review.sourceManifest.fingerprint !== sources.packageManifest.fingerprint
    || sources.packageManifest.trackPlan.id !== sources.trackPlan.id
    || sources.packageManifest.trackPlan.fingerprint !== sources.trackPlan.fingerprint
  ) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_SOURCE_MISMATCH",
    );
  }
  if (
    review.policy.fingerprint !== sources.policy.fingerprint
    || sources.packageReview.policy.fingerprint !== sources.policy.fingerprint
    || sources.packageManifest.policy.fingerprint !== sources.policy.fingerprint
    || sources.releaseDecision.policy.fingerprint !== sources.policy.fingerprint
    || sources.trackPlan.policy.fingerprint !== sources.policy.fingerprint
    || sources.narration.policyFingerprint !== sources.policy.fingerprint
  ) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_POLICY_MISMATCH",
    );
  }
  if (
    review.rightsFingerprint !== sources.rights.rightsFingerprint
    || sources.packageReview.rightsFingerprint !== sources.rights.rightsFingerprint
    || sources.packageManifest.rightsFingerprint !== sources.rights.rightsFingerprint
    || sources.releaseDecision.rightsFingerprint !== sources.rights.rightsFingerprint
    || sources.narration.rightsFingerprint !== sources.rights.rightsFingerprint
  ) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_RIGHTS_SCOPE_MISMATCH",
    );
  }
  if (
    sources.trackPlan.narration.evidenceId !== sources.narration.id
    || sources.trackPlan.narration.sourceKind !== sources.narration.sourceKind
    || sources.trackPlan.narration.evidenceFingerprint !== sources.narration.fingerprint
    || sources.trackPlan.narration.platformAuthorisationPresent
      !== (sources.narration.platformAuthorisation !== undefined)
  ) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_NARRATION_MISMATCH",
    );
  }
  if (
    review.distributorAccount.evidenceId !== sources.distributorAccount.id
    || review.distributorAccount.evidenceFingerprint
      !== sources.distributorAccount.fingerprint
    || attempt.distributorAccount.evidenceId !== sources.distributorAccount.id
    || sources.releaseDecision.distributorAccount.evidenceId
      !== sources.distributorAccount.id
  ) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_ACCOUNT_MISMATCH",
    );
  }
  if (
    review.fileSetFingerprint !== attempt.package.fileSetFingerprint
    || review.fileSetFingerprint !== sources.releaseDecision.package.fileSetFingerprint
    || review.mediaFileCount !== attempt.package.mediaFileCount
    || review.mediaFileCount !== sources.packageReview.mediaFileCount
    || review.totalPackageBytes !== attempt.package.totalPackageBytes
    || review.totalPackageBytes !== sources.packageReview.totalPackageBytes
  ) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_FILE_SET_MISMATCH",
    );
  }
  if (
    now.getTime() < Date.parse(review.approval.approvedAt)
    || now.getTime() >= Date.parse(review.reviewDeadline)
  ) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_REVIEW_NOT_CURRENT",
    );
  }
}

function sourceSnapshot(
  sources: AudiobookRetailSubmissionDecisionSources,
): Pick<
  AudiobookRetailSubmissionDecision,
  | "projectId"
  | "bookId"
  | "packageId"
  | "distributor"
  | "submissionReview"
  | "deliveryAttempt"
  | "releaseDecision"
  | "packageReview"
  | "inspection"
  | "sourceManifest"
  | "trackPlan"
  | "policy"
  | "rightsFingerprint"
  | "narration"
  | "distributorAccount"
  | "package"
> {
  const approval = sources.submissionReview.approval!;
  return {
    projectId: sources.submissionReview.projectId,
    bookId: sources.submissionReview.bookId,
    packageId: sources.submissionReview.packageId,
    distributor: "acx-audible",
    submissionReview: Object.freeze({
      id: sources.submissionReview.id,
      revision: sources.submissionReview.revision,
      fingerprint: sources.submissionReview.fingerprint,
      approvalFingerprint: approval.fingerprint,
      approvedAt: approval.approvedAt,
      reviewDeadline: sources.submissionReview.reviewDeadline,
    }),
    deliveryAttempt: Object.freeze({
      id: sources.deliveryAttempt.id,
      revision: 2,
      fingerprint: sources.deliveryAttempt.fingerprint,
      remoteDraftReferenceHash:
        sources.deliveryAttempt.receipt!.remoteDraftReferenceHash,
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
    trackPlan: Object.freeze({
      id: sources.trackPlan.id,
      fingerprint: sources.trackPlan.fingerprint,
    }),
    policy: Object.freeze({
      id: sources.policy.id,
      externalVersion: sources.policy.externalVersion,
      reviewedAt: sources.policy.reviewedAt,
      expiresAt: sources.policy.expiresAt,
      fingerprint: sources.policy.fingerprint,
    }),
    rightsFingerprint: sources.rights.rightsFingerprint,
    narration: Object.freeze({
      evidenceId: sources.narration.id,
      sourceKind: sources.narration.sourceKind,
      evidenceFingerprint: sources.narration.fingerprint,
      platformAuthorisationPresent:
        sources.narration.platformAuthorisation !== undefined,
      ...(sources.narration.platformAuthorisation
        ? {
            platformAuthorisationFingerprint:
              sources.narration.platformAuthorisation.fingerprint,
          }
        : {}),
    }),
    distributorAccount: Object.freeze({
      evidenceId: sources.distributorAccount.id,
      evidenceFingerprint: sources.distributorAccount.fingerprint,
      accessExpiresAt: sources.distributorAccount.expiresAt,
    }),
    package: Object.freeze({
      mediaFileCount: sources.submissionReview.mediaFileCount,
      totalPackageBytes: sources.submissionReview.totalPackageBytes,
      fileSetFingerprint: sources.submissionReview.fileSetFingerprint,
    }),
  };
}

export function createAudiobookRetailSubmissionDecision(
  input: CreateAudiobookRetailSubmissionDecisionInput,
): AudiobookRetailSubmissionDecision {
  const decidedAt = input.decidedAt ?? new Date();
  if (Number.isNaN(decidedAt.getTime())) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_DATE_INVALID",
    );
  }
  if (input.humanConfirmation !== true) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_HUMAN_CONFIRMATION_REQUIRED",
    );
  }
  if (input.submissionMethod !== "manual-acx-submit") {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_METHOD_INVALID",
    );
  }
  assertSources(input.sources, decidedAt);
  const decidedByActorId = requireHumanActor(
    input.decidedByActorId,
    "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_ACTOR_INVALID",
  );
  const reviewApproval = input.sources.submissionReview.approval!;
  const excludedActors = new Set([
    ...latestSubmissionReviewers(input.sources.submissionReview)
      .map((review) => review.reviewerId),
    reviewApproval.approvedByActorId,
    input.sources.deliveryAttempt.operatorId,
    input.sources.releaseDecision.decidedByActorId,
    input.sources.distributorAccount.verifiedByActorId,
    input.sources.narration.attestedByActorId,
  ]);
  if (excludedActors.has(decidedByActorId)) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_INDEPENDENT_AUTHORITY_REQUIRED",
    );
  }
  const validUntil = Date.parse(requireDate(
    input.validUntil,
    "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_VALIDITY_INVALID",
  ));
  if (
    validUntil <= decidedAt.getTime()
    || validUntil > decisionExpiryCeiling(input.sources, decidedAt)
  ) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_VALIDITY_INVALID",
    );
  }
  const finalConfirmationId = requireIdentifier(
    input.finalConfirmationId,
    "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_CONFIRMATION_ID_INVALID",
  );
  const sources = sourceSnapshot(input.sources);
  const derivedId = `retail_submission_decision_${stableHash({
    submissionReview: input.sources.submissionReview.fingerprint,
    deliveryAttempt: input.sources.deliveryAttempt.fingerprint,
    narration: input.sources.narration.fingerprint,
    account: input.sources.distributorAccount.fingerprint,
    finalConfirmationId,
    validUntil: input.validUntil,
  }).slice(0, 24)}`;
  const partial: Omit<AudiobookRetailSubmissionDecision, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_SUBMISSION_DECISION_SCHEMA_VERSION,
    id: requireIdentifier(
      input.id ?? derivedId,
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_ID_INVALID",
    ),
    ...sources,
    finalConfirmationId,
    decidedByActorId,
    humanConfirmation: true,
    submissionMethod: "manual-acx-submit",
    maximumSubmissionAttempts: 1,
    decidedAt: decidedAt.toISOString(),
    validUntil: input.validUntil,
    status: "authorized-for-single-submission",
    revision: 1,
  };
  const decision = Object.freeze({
    ...partial,
    fingerprint: decisionFingerprint(partial),
  });
  assertAudiobookRetailSubmissionDecision(decision);
  assertAudiobookRetailSubmissionDecisionMatchesSources(decision, input.sources);
  return decision;
}

export function assertAudiobookRetailSubmissionDecision(
  decision: AudiobookRetailSubmissionDecision,
): void {
  if (
    decision.schemaVersion !== AUDIOBOOK_RETAIL_SUBMISSION_DECISION_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [decision.id, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_ID_INVALID"],
    [decision.projectId, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_PROJECT_ID_INVALID"],
    [decision.bookId, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_BOOK_ID_INVALID"],
    [decision.packageId, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_PACKAGE_ID_INVALID"],
    [decision.submissionReview.id, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_REVIEW_ID_INVALID"],
    [decision.deliveryAttempt.id, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_ATTEMPT_ID_INVALID"],
    [decision.releaseDecision.id, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_RELEASE_ID_INVALID"],
    [decision.packageReview.id, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_PACKAGE_REVIEW_ID_INVALID"],
    [decision.inspection.id, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_INSPECTION_ID_INVALID"],
    [decision.sourceManifest.id, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_MANIFEST_ID_INVALID"],
    [decision.trackPlan.id, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_TRACK_PLAN_ID_INVALID"],
    [decision.policy.id, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_POLICY_ID_INVALID"],
    [decision.narration.evidenceId, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_NARRATION_ID_INVALID"],
    [decision.distributorAccount.evidenceId, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_ACCOUNT_ID_INVALID"],
    [decision.finalConfirmationId, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_CONFIRMATION_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  requireHumanActor(
    decision.decidedByActorId,
    "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_ACTOR_INVALID",
  );
  for (const [value, code] of [
    [decision.submissionReview.fingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_REVIEW_HASH_INVALID"],
    [decision.submissionReview.approvalFingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_APPROVAL_HASH_INVALID"],
    [decision.deliveryAttempt.fingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_ATTEMPT_HASH_INVALID"],
    [decision.deliveryAttempt.remoteDraftReferenceHash, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_REMOTE_DRAFT_HASH_INVALID"],
    [decision.releaseDecision.fingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_RELEASE_HASH_INVALID"],
    [decision.packageReview.fingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_PACKAGE_REVIEW_HASH_INVALID"],
    [decision.inspection.fingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_INSPECTION_HASH_INVALID"],
    [decision.sourceManifest.fingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_MANIFEST_HASH_INVALID"],
    [decision.trackPlan.fingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_TRACK_PLAN_HASH_INVALID"],
    [decision.policy.fingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_POLICY_HASH_INVALID"],
    [decision.rightsFingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_RIGHTS_HASH_INVALID"],
    [decision.narration.evidenceFingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_NARRATION_HASH_INVALID"],
    [decision.distributorAccount.evidenceFingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_ACCOUNT_HASH_INVALID"],
    [decision.package.fileSetFingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_FILE_SET_HASH_INVALID"],
  ] as const) requireHash(value, code);
  if (decision.narration.platformAuthorisationPresent) {
    requireHash(
      decision.narration.platformAuthorisationFingerprint ?? "",
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_AUTHORISATION_HASH_INVALID",
    );
  } else if (decision.narration.platformAuthorisationFingerprint !== undefined) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_AUTHORISATION_STATE_INVALID",
    );
  }
  requireInteger(
    decision.submissionReview.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_REVIEW_REVISION_INVALID",
  );
  requireInteger(
    decision.packageReview.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_PACKAGE_REVIEW_REVISION_INVALID",
  );
  if (
    decision.deliveryAttempt.revision !== 2
    || decision.releaseDecision.revision !== 1
    || decision.inspection.revision !== 1
    || decision.sourceManifest.revision !== 1
  ) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_SOURCE_REVISION_INVALID",
    );
  }
  requireInteger(
    decision.package.mediaFileCount,
    4,
    MAXIMUM_FILES,
    "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_FILE_COUNT_INVALID",
  );
  requireInteger(
    decision.package.totalPackageBytes,
    1,
    MAXIMUM_PACKAGE_BYTES,
    "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_SIZE_INVALID",
  );
  for (const value of [
    decision.submissionReview.approvedAt,
    decision.submissionReview.reviewDeadline,
    decision.policy.reviewedAt,
    decision.policy.expiresAt,
    decision.distributorAccount.accessExpiresAt,
    decision.decidedAt,
    decision.validUntil,
  ]) requireDate(value, "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_DATE_INVALID");
  if (
    decision.distributor !== "acx-audible"
    || decision.submissionMethod !== "manual-acx-submit"
    || decision.maximumSubmissionAttempts !== 1
    || decision.humanConfirmation !== true
    || decision.status !== "authorized-for-single-submission"
    || decision.revision !== 1
    || Date.parse(decision.decidedAt) < Date.parse(decision.submissionReview.approvedAt)
    || Date.parse(decision.validUntil) <= Date.parse(decision.decidedAt)
    || Date.parse(decision.validUntil)
      > Date.parse(decision.decidedAt) + MAXIMUM_DECISION_LIFETIME_MS
    || Date.parse(decision.validUntil) > Date.parse(decision.submissionReview.reviewDeadline)
    || Date.parse(decision.validUntil) > Date.parse(decision.policy.expiresAt)
    || Date.parse(decision.validUntil)
      > Date.parse(decision.distributorAccount.accessExpiresAt)
  ) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_STATE_INVALID",
    );
  }
  const { fingerprint, ...partial } = decision;
  if (decisionFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailSubmissionDecisionMatchesSources(
  decision: AudiobookRetailSubmissionDecision,
  sources: AudiobookRetailSubmissionDecisionSources,
): void {
  assertAudiobookRetailSubmissionDecision(decision);
  assertSources(sources, new Date(decision.decidedAt));
  const expected = sourceSnapshot(sources);
  if (
    decision.projectId !== expected.projectId
    || decision.bookId !== expected.bookId
    || decision.packageId !== expected.packageId
    || stableHash(decision.submissionReview)
      !== stableHash(expected.submissionReview)
    || stableHash(decision.deliveryAttempt)
      !== stableHash(expected.deliveryAttempt)
    || stableHash(decision.releaseDecision)
      !== stableHash(expected.releaseDecision)
    || stableHash(decision.packageReview)
      !== stableHash(expected.packageReview)
    || stableHash(decision.inspection) !== stableHash(expected.inspection)
    || stableHash(decision.sourceManifest)
      !== stableHash(expected.sourceManifest)
    || stableHash(decision.trackPlan) !== stableHash(expected.trackPlan)
    || stableHash(decision.policy) !== stableHash(expected.policy)
    || decision.rightsFingerprint !== expected.rightsFingerprint
    || stableHash(decision.narration) !== stableHash(expected.narration)
    || stableHash(decision.distributorAccount)
      !== stableHash(expected.distributorAccount)
    || stableHash(decision.package) !== stableHash(expected.package)
  ) {
    throw new AudiobookRetailSubmissionDecisionError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_SOURCE_MISMATCH",
    );
  }
}

export function audiobookRetailSubmissionDecisionPublicView(
  decision: AudiobookRetailSubmissionDecision,
): AudiobookRetailSubmissionDecisionPublicView {
  assertAudiobookRetailSubmissionDecision(decision);
  return Object.freeze({
    id: decision.id,
    bookId: decision.bookId,
    distributor: decision.distributor,
    policyVersion: decision.policy.externalVersion,
    narrationSourceKind: decision.narration.sourceKind,
    platformAuthorisationPresent:
      decision.narration.platformAuthorisationPresent,
    mediaFileCount: decision.package.mediaFileCount,
    totalPackageBytes: decision.package.totalPackageBytes,
    submissionMethod: decision.submissionMethod,
    maximumSubmissionAttempts: 1,
    decidedAt: decision.decidedAt,
    validUntil: decision.validUntil,
    status: decision.status,
    revision: 1,
    fingerprint: decision.fingerprint,
  });
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<AudiobookRetailSubmissionDecision> {
  const decision = envelope.payload as unknown as AudiobookRetailSubmissionDecision;
  assertAudiobookRetailSubmissionDecision(decision);
  if (
    envelope.entityType !== AUDIOBOOK_RETAIL_SUBMISSION_DECISION_ENTITY_TYPE
    || envelope.entityId !== decision.id
    || envelope.revision !== decision.revision
  ) {
    throw new AudiobookRetailSubmissionDecisionStoreConflictError(
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<AudiobookRetailSubmissionDecision>;
}

function payload(
  decision: AudiobookRetailSubmissionDecision,
): Record<string, unknown> {
  return decision as unknown as Record<string, unknown>;
}

export class FileAudiobookRetailSubmissionDecisionStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    decision: AudiobookRetailSubmissionDecision,
    actorId: string,
  ): Promise<StoredEnvelope<AudiobookRetailSubmissionDecision>> {
    assertAudiobookRetailSubmissionDecision(decision);
    requireIdentifier(
      actorId,
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_STORE_ACTOR_INVALID",
    );
    try {
      const existing = await this.read(decision.id);
      if (existing) {
        if (existing.payload.fingerprint === decision.fingerprint) return existing;
        throw new AudiobookRetailSubmissionDecisionStoreConflictError(
          "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_STORE_IDEMPOTENCY_CONFLICT",
        );
      }
      const envelope = toEnvelope(await this.#store.create(
        AUDIOBOOK_RETAIL_SUBMISSION_DECISION_ENTITY_TYPE,
        decision.id,
        payload(decision),
        new Date(decision.decidedAt),
      ));
      await this.#store.appendAuditEvent({
        actorId,
        action: "audiobook_retail_submission_decision.created",
        entityType: AUDIOBOOK_RETAIL_SUBMISSION_DECISION_ENTITY_TYPE,
        entityId: envelope.entityId,
        revision: envelope.revision,
        occurredAt: new Date(envelope.savedAt),
        metadata: {
          status: decision.status,
          mediaFileCount: decision.package.mediaFileCount,
          totalPackageBytes: decision.package.totalPackageBytes,
          submissionMethod: decision.submissionMethod,
          maximumSubmissionAttempts: decision.maximumSubmissionAttempts,
          platformAuthorisationPresent:
            decision.narration.platformAuthorisationPresent,
        },
      });
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailSubmissionDecisionStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(
    decisionId: string,
  ): Promise<StoredEnvelope<AudiobookRetailSubmissionDecision> | null> {
    requireIdentifier(
      decisionId,
      "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_STORE_ID_INVALID",
    );
    const envelope = await this.#store.read<Record<string, unknown>>(
      AUDIOBOOK_RETAIL_SUBMISSION_DECISION_ENTITY_TYPE,
      decisionId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(
    decisionId: string,
  ): Promise<StoredEnvelope<AudiobookRetailSubmissionDecision>> {
    const envelope = await this.read(decisionId);
    if (!envelope) {
      throw new AudiobookRetailSubmissionDecisionStoreConflictError(
        "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }
}
