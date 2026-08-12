import {
  assertAudiobookRetailSubmissionAttempt,
  assertAudiobookRetailSubmissionAttemptMatchesSources,
  cancelAudiobookRetailSubmissionAttempt as cancelTechnicalSubmissionAttempt,
  recordAudiobookRetailSubmissionFailure as recordTechnicalSubmissionFailure,
  recordAudiobookRetailSubmissionReceipt as recordTechnicalSubmissionReceipt,
  startAudiobookRetailSubmissionAttempt as startTechnicalSubmissionAttempt,
  type AudiobookRetailSubmissionAttempt,
  type StartAudiobookRetailSubmissionAttemptInput,
} from "./audiobook-retail-submission-attempt.js";
import {
  assertAudiobookRetailSubmissionDecision,
  assertAudiobookRetailSubmissionDecisionMatchesSources,
  createAudiobookRetailSubmissionDecision,
  type AudiobookRetailSubmissionDecision,
  type AudiobookRetailSubmissionDecisionSources,
} from "./audiobook-retail-submission-decision.js";
import {
  assertAudiobookRetailSubmissionReviewMatchesSources,
  assertAudiobookRetailSubmissionReviewSession,
  type AudiobookRetailSubmissionReviewSession,
  type AudiobookRetailSubmissionReviewSources,
} from "./audiobook-retail-submission-review.js";
import { stableHash } from "./index.js";
import {
  assertAdmittedNarratorRetailDeliveryAttempt,
  type AdmittedNarratorRetailDeliveryAttempt,
} from "./narrator-retail-release-delivery.js";
import {
  assertExactNarratorVoicePin,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";

export const ADMITTED_NARRATOR_RETAIL_SUBMISSION_REVIEW_SCHEMA =
  "storyteller-admitted-narrator-retail-submission-review-v1" as const;
export const ADMITTED_NARRATOR_RETAIL_SUBMISSION_DECISION_SCHEMA =
  "storyteller-admitted-narrator-retail-submission-decision-v1" as const;
export const ADMITTED_NARRATOR_RETAIL_SUBMISSION_ATTEMPT_SCHEMA =
  "storyteller-admitted-narrator-retail-submission-attempt-v1" as const;

export interface AdmittedNarratorRetailSubmissionReviewApproval {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAIL_SUBMISSION_REVIEW_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  delivery: AdmittedNarratorRetailDeliveryAttempt;
  session: AudiobookRetailSubmissionReviewSession;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  deliveryTransferComplete: true;
  remoteDraftReviewComplete: true;
  submissionDecisionEligible: true;
  automaticSubmissionAuthority: false;
  retailerAcceptanceAuthority: false;
  publicationAuthority: false;
  approvedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailSubmissionReviewApprovalPublicView {
  bookId: string;
  distributor: "acx-audible";
  mediaFileCount: number;
  totalPackageBytes: number;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  deliveryTransferComplete: true;
  remoteDraftReviewComplete: true;
  submissionDecisionEligible: true;
  automaticSubmissionAuthority: false;
  retailerAcceptanceAuthority: false;
  publicationAuthority: false;
  approvedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailSubmissionDecision {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAIL_SUBMISSION_DECISION_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  review: AdmittedNarratorRetailSubmissionReviewApproval;
  decision: AudiobookRetailSubmissionDecision;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  remoteDraftReviewComplete: true;
  submissionDecisionRecorded: true;
  singleSubmissionAuthorised: true;
  maximumSubmissionAttempts: 1;
  automaticSubmissionAuthority: false;
  retailerAcceptanceAuthority: false;
  publicationAuthority: false;
  decidedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailSubmissionDecisionPublicView {
  bookId: string;
  distributor: "acx-audible";
  policyVersion: string;
  narrationSourceKind: "synthetic-voice";
  platformAuthorisationBound: true;
  mediaFileCount: number;
  totalPackageBytes: number;
  totalProductionJobCount: number;
  submissionDecisionRecorded: true;
  singleSubmissionAuthorised: true;
  maximumSubmissionAttempts: 1;
  automaticSubmissionAuthority: false;
  retailerAcceptanceAuthority: false;
  publicationAuthority: false;
  decidedAt: string;
  validUntil: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailSubmissionAttempt {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAIL_SUBMISSION_ATTEMPT_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  decision: AdmittedNarratorRetailSubmissionDecision;
  attempt: AudiobookRetailSubmissionAttempt;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  remoteDraftReviewComplete: true;
  singleSubmissionAuthorised: true;
  submissionAttemptStarted: true;
  submissionComplete: boolean;
  retailerReviewEligible: boolean;
  submissionInitiated: boolean;
  retailerAcceptanceClaimed: false;
  listingPublished: false;
  automaticSubmissionAuthority: false;
  retailerAcceptanceAuthority: false;
  publicationAuthority: false;
  status: AudiobookRetailSubmissionAttempt["status"];
  updatedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailSubmissionAttemptPublicView {
  bookId: string;
  distributor: "acx-audible";
  mediaFileCount: number;
  totalPackageBytes: number;
  totalProductionJobCount: number;
  singleSubmissionAuthorised: true;
  submissionAttemptStarted: true;
  submissionComplete: boolean;
  retailerReviewEligible: boolean;
  submissionInitiated: boolean;
  retailerAcceptanceClaimed: false;
  listingPublished: false;
  automaticSubmissionAuthority: false;
  retailerAcceptanceAuthority: false;
  publicationAuthority: false;
  status: AudiobookRetailSubmissionAttempt["status"];
  receiptRecorded: boolean;
  failureCode?: string;
  cancellationReasonCode?: string;
  startedAt: string;
  updatedAt: string;
  fingerprint: string;
}

export class AdmittedNarratorRetailSubmissionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AdmittedNarratorRetailSubmissionError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new AdmittedNarratorRetailSubmissionError(code);
  }
  return value;
}

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new AdmittedNarratorRetailSubmissionError(code);
  }
  return value;
}

function requirePositiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AdmittedNarratorRetailSubmissionError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new AdmittedNarratorRetailSubmissionError(code);
  }
  return value;
}

function reviewBase(
  value: Omit<AdmittedNarratorRetailSubmissionReviewApproval, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function decisionBase(
  value: Omit<AdmittedNarratorRetailSubmissionDecision, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function attemptBase(
  value: Omit<AdmittedNarratorRetailSubmissionAttempt, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function technicalReviewSources(
  delivery: AdmittedNarratorRetailDeliveryAttempt,
): AudiobookRetailSubmissionReviewSources {
  const packageApproval = delivery.release.packageApproval;
  const admittedPlan = packageApproval.sample.tracks.admittedPlan;
  return {
    deliveryAttempt: delivery.attempt,
    releaseDecision: delivery.release.decision,
    packageReview: packageApproval.reviewSession,
    inspection: packageApproval.inspection,
    packageManifest: packageApproval.manifest,
    policy: admittedPlan.policy,
    rights: packageApproval.sample.approvedSampleArtifact.rights,
    distributorAccount: delivery.release.distributorAccount,
  };
}

function technicalDecisionSources(
  review: AdmittedNarratorRetailSubmissionReviewApproval,
): AudiobookRetailSubmissionDecisionSources {
  const packageApproval = review.delivery.release.packageApproval;
  const admittedPlan = packageApproval.sample.tracks.admittedPlan;
  return {
    submissionReview: review.session,
    deliveryAttempt: review.delivery.attempt,
    releaseDecision: review.delivery.release.decision,
    packageReview: packageApproval.reviewSession,
    inspection: packageApproval.inspection,
    packageManifest: packageApproval.manifest,
    trackPlan: admittedPlan.plan,
    policy: admittedPlan.policy,
    narration: admittedPlan.narrationEligibility,
    rights: packageApproval.sample.approvedSampleArtifact.rights,
    distributorAccount: review.delivery.release.distributorAccount,
  };
}

function technicalAttemptInput(
  value: AdmittedNarratorRetailSubmissionAttempt,
): StartAudiobookRetailSubmissionAttemptInput {
  return {
    submissionDecision: value.decision.decision,
    submissionReview: value.decision.review.session,
    deliveryAttempt: value.decision.review.delivery.attempt,
    distributorAccount: value.decision.review.delivery.release.distributorAccount,
    operatorId: value.attempt.operatorId,
    humanOperationConfirmed: true,
    startedAt: new Date(value.attempt.startedAt),
  };
}

function assertReviewLineage(
  value: AdmittedNarratorRetailSubmissionReviewApproval,
): void {
  assertAdmittedNarratorRetailDeliveryAttempt(value.delivery);
  assertAudiobookRetailSubmissionReviewSession(value.session);
  assertAudiobookRetailSubmissionReviewMatchesSources(
    value.session,
    technicalReviewSources(value.delivery),
  );
  assertExactNarratorVoicePin(value.delivery.voice, value.voice);
  const delivery = value.delivery;
  const session = value.session;
  const approval = session.approval;
  if (
    value.projectId !== delivery.projectId
    || value.bookId !== delivery.bookId
    || value.profileAdmissionHash !== delivery.profileAdmissionHash
    || value.admittedCastingFingerprint !== delivery.admittedCastingFingerprint
    || value.castingFingerprint !== delivery.castingFingerprint
    || session.projectId !== delivery.projectId
    || session.bookId !== delivery.bookId
    || session.deliveryAttempt.id !== delivery.attempt.id
    || session.deliveryAttempt.fingerprint !== delivery.attempt.fingerprint
    || session.releaseDecision.id !== delivery.release.decision.id
    || session.releaseDecision.fingerprint !== delivery.release.decision.fingerprint
    || session.packageReview.fingerprint
      !== delivery.release.packageApproval.reviewSession.fingerprint
    || session.inspection.fingerprint
      !== delivery.release.packageApproval.inspection.fingerprint
    || session.sourceManifest.fingerprint
      !== delivery.release.packageApproval.manifest.fingerprint
    || session.distributorAccount.evidenceFingerprint
      !== delivery.release.distributorAccount.fingerprint
    || value.totalProductionJobCount !== delivery.totalProductionJobCount
    || value.approvedAt !== approval?.approvedAt
  ) {
    throw new AdmittedNarratorRetailSubmissionError(
      "ADMITTED_NARRATOR_RETAIL_SUBMISSION_REVIEW_LINEAGE_MISMATCH",
    );
  }
  if (
    delivery.status !== "files-transferred-awaiting-submission-review"
    || delivery.deliveryTransferComplete !== true
    || delivery.submissionReviewEligible !== true
    || delivery.submissionInitiated !== false
    || session.status !== "approved-for-submission-decision"
    || !approval
    || approval.submissionDecisionEligible !== true
    || value.narratorAdmissionComplete !== true
    || value.syntheticNarrationDeclared !== true
    || value.platformAuthorisationBound !== true
    || value.deliveryTransferComplete !== true
    || value.remoteDraftReviewComplete !== true
    || value.submissionDecisionEligible !== true
    || value.automaticSubmissionAuthority !== false
    || value.retailerAcceptanceAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorRetailSubmissionError(
      "ADMITTED_NARRATOR_RETAIL_SUBMISSION_REVIEW_AUTHORITY_INVALID",
    );
  }
}

export function createAdmittedNarratorRetailSubmissionReviewApproval(
  input: Readonly<{
    delivery: AdmittedNarratorRetailDeliveryAttempt;
    session: AudiobookRetailSubmissionReviewSession;
  }>,
): AdmittedNarratorRetailSubmissionReviewApproval {
  assertAdmittedNarratorRetailDeliveryAttempt(input.delivery);
  assertAudiobookRetailSubmissionReviewSession(input.session);
  const approval = input.session.approval;
  if (
    input.session.status !== "approved-for-submission-decision"
    || !approval
    || approval.submissionDecisionEligible !== true
  ) {
    throw new AdmittedNarratorRetailSubmissionError(
      "ADMITTED_NARRATOR_RETAIL_SUBMISSION_REVIEW_INCOMPLETE",
    );
  }
  const partial: Omit<
    AdmittedNarratorRetailSubmissionReviewApproval,
    "fingerprint"
  > = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_SUBMISSION_REVIEW_SCHEMA,
    projectId: input.delivery.projectId,
    bookId: input.delivery.bookId,
    profileAdmissionHash: input.delivery.profileAdmissionHash,
    admittedCastingFingerprint: input.delivery.admittedCastingFingerprint,
    castingFingerprint: input.delivery.castingFingerprint,
    voice: Object.freeze({ ...input.delivery.voice }),
    delivery: input.delivery,
    session: input.session,
    totalProductionJobCount: input.delivery.totalProductionJobCount,
    narratorAdmissionComplete: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    deliveryTransferComplete: true,
    remoteDraftReviewComplete: true,
    submissionDecisionEligible: true,
    automaticSubmissionAuthority: false,
    retailerAcceptanceAuthority: false,
    publicationAuthority: false,
    approvedAt: approval.approvedAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(reviewBase(partial)),
  });
  assertAdmittedNarratorRetailSubmissionReviewApproval(value);
  return value;
}

export function assertAdmittedNarratorRetailSubmissionReviewApproval(
  value: AdmittedNarratorRetailSubmissionReviewApproval,
): void {
  if (
    value.schemaVersion !== ADMITTED_NARRATOR_RETAIL_SUBMISSION_REVIEW_SCHEMA
  ) {
    throw new AdmittedNarratorRetailSubmissionError(
      "ADMITTED_NARRATOR_RETAIL_SUBMISSION_REVIEW_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    value.projectId,
    "ADMITTED_NARRATOR_RETAIL_SUBMISSION_REVIEW_PROJECT_INVALID",
  );
  requireIdentifier(
    value.bookId,
    "ADMITTED_NARRATOR_RETAIL_SUBMISSION_REVIEW_BOOK_INVALID",
  );
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
  ]) requireHash(hash, "ADMITTED_NARRATOR_RETAIL_SUBMISSION_REVIEW_HASH_INVALID");
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_RETAIL_SUBMISSION_REVIEW_JOB_COUNT_INVALID",
  );
  requireDate(
    value.approvedAt,
    "ADMITTED_NARRATOR_RETAIL_SUBMISSION_REVIEW_DATE_INVALID",
  );
  assertReviewLineage(value);
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(reviewBase(partial))) {
    throw new AdmittedNarratorRetailSubmissionError(
      "ADMITTED_NARRATOR_RETAIL_SUBMISSION_REVIEW_FINGERPRINT_INVALID",
    );
  }
}

export function admittedNarratorRetailSubmissionReviewApprovalPublicView(
  value: AdmittedNarratorRetailSubmissionReviewApproval,
): AdmittedNarratorRetailSubmissionReviewApprovalPublicView {
  assertAdmittedNarratorRetailSubmissionReviewApproval(value);
  return Object.freeze({
    bookId: value.bookId,
    distributor: value.session.distributor,
    mediaFileCount: value.session.mediaFileCount,
    totalPackageBytes: value.session.totalPackageBytes,
    totalProductionJobCount: value.totalProductionJobCount,
    narratorAdmissionComplete: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    deliveryTransferComplete: true,
    remoteDraftReviewComplete: true,
    submissionDecisionEligible: true,
    automaticSubmissionAuthority: false,
    retailerAcceptanceAuthority: false,
    publicationAuthority: false,
    approvedAt: value.approvedAt,
    fingerprint: value.fingerprint,
  });
}

function assertDecisionLineage(
  value: AdmittedNarratorRetailSubmissionDecision,
): void {
  assertAdmittedNarratorRetailSubmissionReviewApproval(value.review);
  assertAudiobookRetailSubmissionDecision(value.decision);
  assertAudiobookRetailSubmissionDecisionMatchesSources(
    value.decision,
    technicalDecisionSources(value.review),
  );
  assertExactNarratorVoicePin(value.review.voice, value.voice);
  const review = value.review;
  const decision = value.decision;
  const admittedPlan = review.delivery.release.packageApproval.sample.tracks.admittedPlan;
  if (
    value.projectId !== review.projectId
    || value.bookId !== review.bookId
    || value.profileAdmissionHash !== review.profileAdmissionHash
    || value.admittedCastingFingerprint !== review.admittedCastingFingerprint
    || value.castingFingerprint !== review.castingFingerprint
    || decision.projectId !== review.projectId
    || decision.bookId !== review.bookId
    || decision.submissionReview.id !== review.session.id
    || decision.submissionReview.fingerprint !== review.session.fingerprint
    || decision.submissionReview.approvalFingerprint
      !== review.session.approval?.fingerprint
    || decision.deliveryAttempt.id !== review.delivery.attempt.id
    || decision.deliveryAttempt.fingerprint !== review.delivery.attempt.fingerprint
    || decision.releaseDecision.id !== review.delivery.release.decision.id
    || decision.releaseDecision.fingerprint
      !== review.delivery.release.decision.fingerprint
    || decision.packageReview.fingerprint
      !== review.delivery.release.packageApproval.reviewSession.fingerprint
    || decision.inspection.fingerprint
      !== review.delivery.release.packageApproval.inspection.fingerprint
    || decision.sourceManifest.fingerprint
      !== review.delivery.release.packageApproval.manifest.fingerprint
    || decision.trackPlan.fingerprint !== admittedPlan.plan.fingerprint
    || decision.policy.fingerprint !== admittedPlan.policy.fingerprint
    || decision.narration.evidenceFingerprint
      !== admittedPlan.narrationEligibility.fingerprint
    || decision.narration.sourceKind !== "synthetic-voice"
    || decision.narration.platformAuthorisationPresent !== true
    || decision.narration.platformAuthorisationFingerprint
      !== admittedPlan.narrationEligibility.platformAuthorisation?.fingerprint
    || decision.distributorAccount.evidenceFingerprint
      !== review.delivery.release.distributorAccount.fingerprint
    || value.totalProductionJobCount !== review.totalProductionJobCount
    || value.decidedAt !== decision.decidedAt
  ) {
    throw new AdmittedNarratorRetailSubmissionError(
      "ADMITTED_NARRATOR_RETAIL_SUBMISSION_DECISION_LINEAGE_MISMATCH",
    );
  }
  if (
    review.submissionDecisionEligible !== true
    || decision.status !== "authorized-for-single-submission"
    || decision.maximumSubmissionAttempts !== 1
    || value.narratorAdmissionComplete !== true
    || value.syntheticNarrationDeclared !== true
    || value.platformAuthorisationBound !== true
    || value.remoteDraftReviewComplete !== true
    || value.submissionDecisionRecorded !== true
    || value.singleSubmissionAuthorised !== true
    || value.maximumSubmissionAttempts !== 1
    || value.automaticSubmissionAuthority !== false
    || value.retailerAcceptanceAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorRetailSubmissionError(
      "ADMITTED_NARRATOR_RETAIL_SUBMISSION_DECISION_AUTHORITY_INVALID",
    );
  }
}

export function createAdmittedNarratorRetailSubmissionDecision(input: Readonly<{
  review: AdmittedNarratorRetailSubmissionReviewApproval;
  finalConfirmationId: string;
  decidedByActorId: string;
  humanConfirmation: true;
  validUntil: string;
  decidedAt?: Date;
}>): AdmittedNarratorRetailSubmissionDecision {
  assertAdmittedNarratorRetailSubmissionReviewApproval(input.review);
  const decision = createAudiobookRetailSubmissionDecision({
    sources: technicalDecisionSources(input.review),
    finalConfirmationId: input.finalConfirmationId,
    decidedByActorId: input.decidedByActorId,
    humanConfirmation: input.humanConfirmation,
    submissionMethod: "manual-acx-submit",
    validUntil: input.validUntil,
    ...(input.decidedAt ? { decidedAt: input.decidedAt } : {}),
  });
  const partial: Omit<AdmittedNarratorRetailSubmissionDecision, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_SUBMISSION_DECISION_SCHEMA,
    projectId: input.review.projectId,
    bookId: input.review.bookId,
    profileAdmissionHash: input.review.profileAdmissionHash,
    admittedCastingFingerprint: input.review.admittedCastingFingerprint,
    castingFingerprint: input.review.castingFingerprint,
    voice: Object.freeze({ ...input.review.voice }),
    review: input.review,
    decision,
    totalProductionJobCount: input.review.totalProductionJobCount,
    narratorAdmissionComplete: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    remoteDraftReviewComplete: true,
    submissionDecisionRecorded: true,
    singleSubmissionAuthorised: true,
    maximumSubmissionAttempts: 1,
    automaticSubmissionAuthority: false,
    retailerAcceptanceAuthority: false,
    publicationAuthority: false,
    decidedAt: decision.decidedAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(decisionBase(partial)),
  });
  assertAdmittedNarratorRetailSubmissionDecision(value);
  return value;
}

export function assertAdmittedNarratorRetailSubmissionDecision(
  value: AdmittedNarratorRetailSubmissionDecision,
): void {
  if (
    value.schemaVersion !== ADMITTED_NARRATOR_RETAIL_SUBMISSION_DECISION_SCHEMA
  ) {
    throw new AdmittedNarratorRetailSubmissionError(
      "ADMITTED_NARRATOR_RETAIL_SUBMISSION_DECISION_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    value.projectId,
    "ADMITTED_NARRATOR_RETAIL_SUBMISSION_DECISION_PROJECT_INVALID",
  );
  requireIdentifier(
    value.bookId,
    "ADMITTED_NARRATOR_RETAIL_SUBMISSION_DECISION_BOOK_INVALID",
  );
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
  ]) requireHash(hash, "ADMITTED_NARRATOR_RETAIL_SUBMISSION_DECISION_HASH_INVALID");
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_RETAIL_SUBMISSION_DECISION_JOB_COUNT_INVALID",
  );
  requireDate(
    value.decidedAt,
    "ADMITTED_NARRATOR_RETAIL_SUBMISSION_DECISION_DATE_INVALID",
  );
  assertDecisionLineage(value);
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(decisionBase(partial))) {
    throw new AdmittedNarratorRetailSubmissionError(
      "ADMITTED_NARRATOR_RETAIL_SUBMISSION_DECISION_FINGERPRINT_INVALID",
    );
  }
}

export function admittedNarratorRetailSubmissionDecisionPublicView(
  value: AdmittedNarratorRetailSubmissionDecision,
): AdmittedNarratorRetailSubmissionDecisionPublicView {
  assertAdmittedNarratorRetailSubmissionDecision(value);
  return Object.freeze({
    bookId: value.bookId,
    distributor: value.decision.distributor,
    policyVersion: value.decision.policy.externalVersion,
    narrationSourceKind: "synthetic-voice",
    platformAuthorisationBound: true,
    mediaFileCount: value.decision.package.mediaFileCount,
    totalPackageBytes: value.decision.package.totalPackageBytes,
    totalProductionJobCount: value.totalProductionJobCount,
    submissionDecisionRecorded: true,
    singleSubmissionAuthorised: true,
    maximumSubmissionAttempts: 1,
    automaticSubmissionAuthority: false,
    retailerAcceptanceAuthority: false,
    publicationAuthority: false,
    decidedAt: value.decidedAt,
    validUntil: value.decision.validUntil,
    fingerprint: value.fingerprint,
  });
}

function buildAttemptValue(
  decision: AdmittedNarratorRetailSubmissionDecision,
  attempt: AudiobookRetailSubmissionAttempt,
): AdmittedNarratorRetailSubmissionAttempt {
  const submitted = attempt.status === "submitted-awaiting-retailer-review";
  const partial: Omit<AdmittedNarratorRetailSubmissionAttempt, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_SUBMISSION_ATTEMPT_SCHEMA,
    projectId: decision.projectId,
    bookId: decision.bookId,
    profileAdmissionHash: decision.profileAdmissionHash,
    admittedCastingFingerprint: decision.admittedCastingFingerprint,
    castingFingerprint: decision.castingFingerprint,
    voice: Object.freeze({ ...decision.voice }),
    decision,
    attempt,
    totalProductionJobCount: decision.totalProductionJobCount,
    narratorAdmissionComplete: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    remoteDraftReviewComplete: true,
    singleSubmissionAuthorised: true,
    submissionAttemptStarted: true,
    submissionComplete: submitted,
    retailerReviewEligible: submitted,
    submissionInitiated: submitted,
    retailerAcceptanceClaimed: false,
    listingPublished: false,
    automaticSubmissionAuthority: false,
    retailerAcceptanceAuthority: false,
    publicationAuthority: false,
    status: attempt.status,
    updatedAt: attempt.updatedAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(attemptBase(partial)),
  });
  assertAdmittedNarratorRetailSubmissionAttempt(value);
  return value;
}

function assertAttemptLineage(
  value: AdmittedNarratorRetailSubmissionAttempt,
): void {
  assertAdmittedNarratorRetailSubmissionDecision(value.decision);
  assertAudiobookRetailSubmissionAttempt(value.attempt);
  assertAudiobookRetailSubmissionAttemptMatchesSources(
    value.attempt,
    technicalAttemptInput(value),
  );
  assertExactNarratorVoicePin(value.decision.voice, value.voice);
  const decision = value.decision;
  const attempt = value.attempt;
  const submitted = attempt.status === "submitted-awaiting-retailer-review";
  if (
    value.projectId !== decision.projectId
    || value.bookId !== decision.bookId
    || value.profileAdmissionHash !== decision.profileAdmissionHash
    || value.admittedCastingFingerprint !== decision.admittedCastingFingerprint
    || value.castingFingerprint !== decision.castingFingerprint
    || attempt.projectId !== decision.projectId
    || attempt.bookId !== decision.bookId
    || attempt.submissionDecision.id !== decision.decision.id
    || attempt.submissionDecision.fingerprint !== decision.decision.fingerprint
    || attempt.submissionReview.id !== decision.review.session.id
    || attempt.submissionReview.fingerprint !== decision.review.session.fingerprint
    || attempt.deliveryAttempt.id !== decision.review.delivery.attempt.id
    || attempt.deliveryAttempt.fingerprint
      !== decision.review.delivery.attempt.fingerprint
    || attempt.distributorAccount.evidenceFingerprint
      !== decision.review.delivery.release.distributorAccount.fingerprint
    || value.totalProductionJobCount !== decision.totalProductionJobCount
    || value.status !== attempt.status
    || value.updatedAt !== attempt.updatedAt
  ) {
    throw new AdmittedNarratorRetailSubmissionError(
      "ADMITTED_NARRATOR_RETAIL_SUBMISSION_ATTEMPT_LINEAGE_MISMATCH",
    );
  }
  if (
    value.narratorAdmissionComplete !== true
    || value.syntheticNarrationDeclared !== true
    || value.platformAuthorisationBound !== true
    || value.remoteDraftReviewComplete !== true
    || value.singleSubmissionAuthorised !== true
    || value.submissionAttemptStarted !== true
    || value.submissionComplete !== submitted
    || value.retailerReviewEligible !== submitted
    || value.submissionInitiated !== submitted
    || value.retailerAcceptanceClaimed !== false
    || value.listingPublished !== false
    || value.automaticSubmissionAuthority !== false
    || value.retailerAcceptanceAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorRetailSubmissionError(
      "ADMITTED_NARRATOR_RETAIL_SUBMISSION_ATTEMPT_AUTHORITY_INVALID",
    );
  }
}

export function startAdmittedNarratorRetailSubmissionAttempt(input: Readonly<{
  decision: AdmittedNarratorRetailSubmissionDecision;
  operatorId: string;
  humanOperationConfirmed: true;
  startedAt?: Date;
}>): AdmittedNarratorRetailSubmissionAttempt {
  assertAdmittedNarratorRetailSubmissionDecision(input.decision);
  const attempt = startTechnicalSubmissionAttempt({
    submissionDecision: input.decision.decision,
    submissionReview: input.decision.review.session,
    deliveryAttempt: input.decision.review.delivery.attempt,
    distributorAccount: input.decision.review.delivery.release.distributorAccount,
    operatorId: input.operatorId,
    humanOperationConfirmed: input.humanOperationConfirmed,
    ...(input.startedAt ? { startedAt: input.startedAt } : {}),
  });
  return buildAttemptValue(input.decision, attempt);
}

export function recordAdmittedNarratorRetailSubmissionReceipt(
  value: AdmittedNarratorRetailSubmissionAttempt,
  input: Readonly<{
    submissionReceiptHash: string;
    retailerSubmissionReferenceHash: string;
    completedByActorId: string;
    humanConfirmation: true;
    completedAt?: Date;
  }>,
): AdmittedNarratorRetailSubmissionAttempt {
  assertAdmittedNarratorRetailSubmissionAttempt(value);
  const attempt = recordTechnicalSubmissionReceipt(value.attempt, {
    submissionReceiptHash: input.submissionReceiptHash,
    retailerSubmissionReferenceHash: input.retailerSubmissionReferenceHash,
    mediaFileCountAcknowledged: value.attempt.package.mediaFileCount,
    allApprovedFilesIncluded: true,
    submissionAcceptedForProcessing: true,
    submissionInitiated: true,
    retailerAcceptanceClaimed: false,
    listingPublished: false,
    completedByActorId: input.completedByActorId,
    humanConfirmation: input.humanConfirmation,
    ...(input.completedAt ? { completedAt: input.completedAt } : {}),
  });
  return buildAttemptValue(value.decision, attempt);
}

export function recordAdmittedNarratorRetailSubmissionFailure(
  value: AdmittedNarratorRetailSubmissionAttempt,
  input: Readonly<{
    failureCode: string;
    failedByActorId: string;
    humanConfirmation: true;
    failedAt?: Date;
  }>,
): AdmittedNarratorRetailSubmissionAttempt {
  assertAdmittedNarratorRetailSubmissionAttempt(value);
  return buildAttemptValue(
    value.decision,
    recordTechnicalSubmissionFailure(value.attempt, input),
  );
}

export function cancelAdmittedNarratorRetailSubmissionAttempt(
  value: AdmittedNarratorRetailSubmissionAttempt,
  input: Readonly<{
    reasonCode: string;
    cancelledByActorId: string;
    humanConfirmation: true;
    cancelledAt?: Date;
  }>,
): AdmittedNarratorRetailSubmissionAttempt {
  assertAdmittedNarratorRetailSubmissionAttempt(value);
  return buildAttemptValue(
    value.decision,
    cancelTechnicalSubmissionAttempt(value.attempt, input),
  );
}

export function assertAdmittedNarratorRetailSubmissionAttempt(
  value: AdmittedNarratorRetailSubmissionAttempt,
): void {
  if (
    value.schemaVersion !== ADMITTED_NARRATOR_RETAIL_SUBMISSION_ATTEMPT_SCHEMA
  ) {
    throw new AdmittedNarratorRetailSubmissionError(
      "ADMITTED_NARRATOR_RETAIL_SUBMISSION_ATTEMPT_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    value.projectId,
    "ADMITTED_NARRATOR_RETAIL_SUBMISSION_ATTEMPT_PROJECT_INVALID",
  );
  requireIdentifier(
    value.bookId,
    "ADMITTED_NARRATOR_RETAIL_SUBMISSION_ATTEMPT_BOOK_INVALID",
  );
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
  ]) requireHash(hash, "ADMITTED_NARRATOR_RETAIL_SUBMISSION_ATTEMPT_HASH_INVALID");
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_RETAIL_SUBMISSION_ATTEMPT_JOB_COUNT_INVALID",
  );
  requireDate(
    value.updatedAt,
    "ADMITTED_NARRATOR_RETAIL_SUBMISSION_ATTEMPT_DATE_INVALID",
  );
  assertAttemptLineage(value);
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(attemptBase(partial))) {
    throw new AdmittedNarratorRetailSubmissionError(
      "ADMITTED_NARRATOR_RETAIL_SUBMISSION_ATTEMPT_FINGERPRINT_INVALID",
    );
  }
}

export function admittedNarratorRetailSubmissionAttemptPublicView(
  value: AdmittedNarratorRetailSubmissionAttempt,
): AdmittedNarratorRetailSubmissionAttemptPublicView {
  assertAdmittedNarratorRetailSubmissionAttempt(value);
  return Object.freeze({
    bookId: value.bookId,
    distributor: value.attempt.distributor,
    mediaFileCount: value.attempt.package.mediaFileCount,
    totalPackageBytes: value.attempt.package.totalPackageBytes,
    totalProductionJobCount: value.totalProductionJobCount,
    singleSubmissionAuthorised: true,
    submissionAttemptStarted: true,
    submissionComplete: value.submissionComplete,
    retailerReviewEligible: value.retailerReviewEligible,
    submissionInitiated: value.submissionInitiated,
    retailerAcceptanceClaimed: false,
    listingPublished: false,
    automaticSubmissionAuthority: false,
    retailerAcceptanceAuthority: false,
    publicationAuthority: false,
    status: value.status,
    receiptRecorded: value.attempt.receipt !== undefined,
    ...(value.attempt.failure
      ? { failureCode: value.attempt.failure.failureCode }
      : {}),
    ...(value.attempt.cancellation
      ? { cancellationReasonCode: value.attempt.cancellation.reasonCode }
      : {}),
    startedAt: value.attempt.startedAt,
    updatedAt: value.updatedAt,
    fingerprint: value.fingerprint,
  });
}
