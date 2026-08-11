import {
  assertAudiobookRetailDeliveryAttempt,
  assertAudiobookRetailDeliveryAttemptMatchesSources,
  cancelAudiobookRetailDeliveryAttempt as cancelTechnicalDeliveryAttempt,
  recordAudiobookRetailDeliveryFailure as recordTechnicalDeliveryFailure,
  recordAudiobookRetailDeliveryTransfer as recordTechnicalDeliveryTransfer,
  startAudiobookRetailDeliveryAttempt as startTechnicalDeliveryAttempt,
  type AudiobookRetailDeliveryAttempt,
  type StartAudiobookRetailDeliveryAttemptInput,
} from "./audiobook-retail-delivery-attempt.js";
import {
  assertAudiobookRetailDistributorAccountEvidence,
  assertAudiobookRetailReleaseDecision,
  assertAudiobookRetailReleaseDecisionMatchesSources,
  createAudiobookRetailReleaseDecision,
  type AudiobookRetailDistributorAccountEvidence,
  type AudiobookRetailReleaseDecision,
  type CreateAudiobookRetailReleaseDecisionInput,
} from "./audiobook-retail-release-decision.js";
import { stableHash } from "./index.js";
import {
  assertAdmittedNarratorRetailPackageApproval,
  type AdmittedNarratorRetailPackageApproval,
} from "./narrator-retail-package-admission.js";
import {
  assertExactNarratorVoicePin,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";

export const ADMITTED_NARRATOR_RETAIL_RELEASE_DECISION_SCHEMA =
  "storyteller-admitted-narrator-retail-release-decision-v1" as const;
export const ADMITTED_NARRATOR_RETAIL_DELIVERY_ATTEMPT_SCHEMA =
  "storyteller-admitted-narrator-retail-delivery-attempt-v1" as const;

export interface AdmittedNarratorRetailReleaseDecision {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAIL_RELEASE_DECISION_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  packageApproval: AdmittedNarratorRetailPackageApproval;
  distributorAccount: AudiobookRetailDistributorAccountEvidence;
  decision: AudiobookRetailReleaseDecision;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  completeBookListeningApproval: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailPackageReviewApproval: true;
  releaseDecisionRecorded: true;
  controlledDeliveryAuthorised: true;
  maximumDeliveryAttempts: 1;
  releaseDecisionAuthority: false;
  submissionAuthority: false;
  retailerAcceptanceAuthority: false;
  publicationAuthority: false;
  decidedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailReleaseDecisionPublicView {
  bookId: string;
  distributor: "acx-audible";
  policyVersion: string;
  narrationSourceKind: "synthetic-voice";
  platformAuthorisationBound: true;
  mediaFileCount: number;
  totalPackageBytes: number;
  totalProductionJobCount: number;
  releaseDecisionRecorded: true;
  controlledDeliveryAuthorised: true;
  maximumDeliveryAttempts: 1;
  releaseDecisionAuthority: false;
  submissionAuthority: false;
  retailerAcceptanceAuthority: false;
  publicationAuthority: false;
  decidedAt: string;
  validUntil: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailDeliveryAttempt {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAIL_DELIVERY_ATTEMPT_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  release: AdmittedNarratorRetailReleaseDecision;
  attempt: AudiobookRetailDeliveryAttempt;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailPackageReviewApproval: true;
  controlledDeliveryAuthorised: true;
  deliveryAttemptStarted: true;
  deliveryTransferComplete: boolean;
  submissionReviewEligible: boolean;
  submissionInitiated: false;
  retailerAcceptanceClaimed: false;
  releaseDecisionAuthority: false;
  submissionAuthority: false;
  retailerAcceptanceAuthority: false;
  publicationAuthority: false;
  status: AudiobookRetailDeliveryAttempt["status"];
  updatedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailDeliveryAttemptPublicView {
  bookId: string;
  distributor: "acx-audible";
  mediaFileCount: number;
  totalPackageBytes: number;
  totalProductionJobCount: number;
  controlledDeliveryAuthorised: true;
  deliveryAttemptStarted: true;
  deliveryTransferComplete: boolean;
  submissionReviewEligible: boolean;
  submissionInitiated: false;
  retailerAcceptanceClaimed: false;
  releaseDecisionAuthority: false;
  submissionAuthority: false;
  retailerAcceptanceAuthority: false;
  publicationAuthority: false;
  status: AudiobookRetailDeliveryAttempt["status"];
  receiptRecorded: boolean;
  failureCode?: string;
  cancellationReasonCode?: string;
  startedAt: string;
  updatedAt: string;
  fingerprint: string;
}

export class AdmittedNarratorRetailReleaseDeliveryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AdmittedNarratorRetailReleaseDeliveryError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new AdmittedNarratorRetailReleaseDeliveryError(code);
  }
  return value;
}

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new AdmittedNarratorRetailReleaseDeliveryError(code);
  }
  return value;
}

function requirePositiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AdmittedNarratorRetailReleaseDeliveryError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new AdmittedNarratorRetailReleaseDeliveryError(code);
  }
  return value;
}

function releaseBase(
  value: Omit<AdmittedNarratorRetailReleaseDecision, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function deliveryBase(
  value: Omit<AdmittedNarratorRetailDeliveryAttempt, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function technicalReleaseInput(
  packageApproval: AdmittedNarratorRetailPackageApproval,
  distributorAccount: AudiobookRetailDistributorAccountEvidence,
  decision: AudiobookRetailReleaseDecision,
): CreateAudiobookRetailReleaseDecisionInput {
  const admittedPlan = packageApproval.sample.tracks.admittedPlan;
  return {
    id: decision.id,
    packageReview: packageApproval.reviewSession,
    inspection: packageApproval.inspection,
    packageManifest: packageApproval.manifest,
    trackPlan: admittedPlan.plan,
    policy: admittedPlan.policy,
    narration: admittedPlan.narrationEligibility,
    rights: packageApproval.sample.approvedSampleArtifact.rights,
    distributorAccount,
    finalConfirmationId: decision.finalConfirmationId,
    decidedByActorId: decision.decidedByActorId,
    humanConfirmation: true,
    deliveryMethod: "manual-acx-upload",
    validUntil: decision.validUntil,
    decidedAt: new Date(decision.decidedAt),
  };
}

function assertReleaseLineage(
  value: AdmittedNarratorRetailReleaseDecision,
): void {
  assertAdmittedNarratorRetailPackageApproval(value.packageApproval);
  assertAudiobookRetailReleaseDecision(value.decision);
  const decidedAt = new Date(requireDate(
    value.decidedAt,
    "ADMITTED_NARRATOR_RETAIL_RELEASE_DATE_INVALID",
  ));
  assertAudiobookRetailDistributorAccountEvidence(
    value.distributorAccount,
    decidedAt,
  );
  assertExactNarratorVoicePin(value.packageApproval.voice, value.voice);
  assertAudiobookRetailReleaseDecisionMatchesSources(
    value.decision,
    technicalReleaseInput(
      value.packageApproval,
      value.distributorAccount,
      value.decision,
    ),
  );
  const packageApproval = value.packageApproval;
  const admittedPlan = packageApproval.sample.tracks.admittedPlan;
  const decision = value.decision;
  if (
    value.projectId !== packageApproval.projectId
    || value.bookId !== packageApproval.bookId
    || value.profileAdmissionHash !== packageApproval.profileAdmissionHash
    || value.admittedCastingFingerprint
      !== packageApproval.admittedCastingFingerprint
    || value.castingFingerprint !== packageApproval.castingFingerprint
    || decision.projectId !== packageApproval.projectId
    || decision.bookId !== packageApproval.bookId
    || decision.packageReview.id !== packageApproval.reviewSession.id
    || decision.packageReview.revision !== packageApproval.reviewSession.revision
    || decision.packageReview.fingerprint
      !== packageApproval.reviewSession.fingerprint
    || decision.packageReview.approvalFingerprint
      !== packageApproval.reviewSession.approval?.fingerprint
    || decision.inspection.id !== packageApproval.inspection.id
    || decision.inspection.fingerprint !== packageApproval.inspection.fingerprint
    || decision.packageManifest.id !== packageApproval.manifest.id
    || decision.packageManifest.fingerprint !== packageApproval.manifest.fingerprint
    || decision.trackPlan.id !== admittedPlan.plan.id
    || decision.trackPlan.fingerprint !== admittedPlan.plan.fingerprint
    || decision.policy.fingerprint !== admittedPlan.policy.fingerprint
    || decision.narration.evidenceFingerprint
      !== admittedPlan.narrationEligibility.fingerprint
    || decision.narration.sourceKind !== "synthetic-voice"
    || decision.narration.platformAuthorisationPresent !== true
    || decision.narration.platformAuthorisationFingerprint
      !== admittedPlan.narrationEligibility.platformAuthorisation?.fingerprint
    || decision.rightsFingerprint
      !== packageApproval.sample.approvedSampleArtifact.rights.rightsFingerprint
    || decision.distributorAccount.evidenceId !== value.distributorAccount.id
    || decision.distributorAccount.evidenceFingerprint
      !== value.distributorAccount.fingerprint
    || value.totalProductionJobCount
      !== packageApproval.totalProductionJobCount
    || value.decidedAt !== decision.decidedAt
  ) {
    throw new AdmittedNarratorRetailReleaseDeliveryError(
      "ADMITTED_NARRATOR_RETAIL_RELEASE_LINEAGE_MISMATCH",
    );
  }
  if (
    packageApproval.releaseDecisionEligible !== true
    || decision.status !== "authorized-for-controlled-delivery"
    || decision.maximumDeliveryAttempts !== 1
    || value.narratorAdmissionComplete !== true
    || value.completeBookListeningApproval !== true
    || value.syntheticNarrationDeclared !== true
    || value.platformAuthorisationBound !== true
    || value.retailPackageReviewApproval !== true
    || value.releaseDecisionRecorded !== true
    || value.controlledDeliveryAuthorised !== true
    || value.maximumDeliveryAttempts !== 1
    || value.releaseDecisionAuthority !== false
    || value.submissionAuthority !== false
    || value.retailerAcceptanceAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorRetailReleaseDeliveryError(
      "ADMITTED_NARRATOR_RETAIL_RELEASE_AUTHORITY_INVALID",
    );
  }
}

export function createAdmittedNarratorRetailReleaseDecision(input: Readonly<{
  packageApproval: AdmittedNarratorRetailPackageApproval;
  distributorAccount: AudiobookRetailDistributorAccountEvidence;
  finalConfirmationId: string;
  decidedByActorId: string;
  humanConfirmation: true;
  validUntil: string;
  decidedAt?: Date;
}>): AdmittedNarratorRetailReleaseDecision {
  assertAdmittedNarratorRetailPackageApproval(input.packageApproval);
  const admittedPlan = input.packageApproval.sample.tracks.admittedPlan;
  const decision = createAudiobookRetailReleaseDecision({
    packageReview: input.packageApproval.reviewSession,
    inspection: input.packageApproval.inspection,
    packageManifest: input.packageApproval.manifest,
    trackPlan: admittedPlan.plan,
    policy: admittedPlan.policy,
    narration: admittedPlan.narrationEligibility,
    rights: input.packageApproval.sample.approvedSampleArtifact.rights,
    distributorAccount: input.distributorAccount,
    finalConfirmationId: input.finalConfirmationId,
    decidedByActorId: input.decidedByActorId,
    humanConfirmation: input.humanConfirmation,
    deliveryMethod: "manual-acx-upload",
    validUntil: input.validUntil,
    ...(input.decidedAt ? { decidedAt: input.decidedAt } : {}),
  });
  const partial: Omit<AdmittedNarratorRetailReleaseDecision, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_RELEASE_DECISION_SCHEMA,
    projectId: input.packageApproval.projectId,
    bookId: input.packageApproval.bookId,
    profileAdmissionHash: input.packageApproval.profileAdmissionHash,
    admittedCastingFingerprint:
      input.packageApproval.admittedCastingFingerprint,
    castingFingerprint: input.packageApproval.castingFingerprint,
    voice: Object.freeze({ ...input.packageApproval.voice }),
    packageApproval: input.packageApproval,
    distributorAccount: input.distributorAccount,
    decision,
    totalProductionJobCount: input.packageApproval.totalProductionJobCount,
    narratorAdmissionComplete: true,
    completeBookListeningApproval: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailPackageReviewApproval: true,
    releaseDecisionRecorded: true,
    controlledDeliveryAuthorised: true,
    maximumDeliveryAttempts: 1,
    releaseDecisionAuthority: false,
    submissionAuthority: false,
    retailerAcceptanceAuthority: false,
    publicationAuthority: false,
    decidedAt: decision.decidedAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(releaseBase(partial)),
  });
  assertAdmittedNarratorRetailReleaseDecision(value);
  return value;
}

export function assertAdmittedNarratorRetailReleaseDecision(
  value: AdmittedNarratorRetailReleaseDecision,
): void {
  if (
    value.schemaVersion !== ADMITTED_NARRATOR_RETAIL_RELEASE_DECISION_SCHEMA
  ) {
    throw new AdmittedNarratorRetailReleaseDeliveryError(
      "ADMITTED_NARRATOR_RETAIL_RELEASE_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    value.projectId,
    "ADMITTED_NARRATOR_RETAIL_RELEASE_PROJECT_INVALID",
  );
  requireIdentifier(
    value.bookId,
    "ADMITTED_NARRATOR_RETAIL_RELEASE_BOOK_INVALID",
  );
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
  ]) requireHash(hash, "ADMITTED_NARRATOR_RETAIL_RELEASE_HASH_INVALID");
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_RETAIL_RELEASE_JOB_COUNT_INVALID",
  );
  assertReleaseLineage(value);
  const { fingerprint, ...partial } = value;
  if (
    !HASH.test(fingerprint)
    || fingerprint !== stableHash(releaseBase(partial))
  ) {
    throw new AdmittedNarratorRetailReleaseDeliveryError(
      "ADMITTED_NARRATOR_RETAIL_RELEASE_FINGERPRINT_INVALID",
    );
  }
}

export function admittedNarratorRetailReleaseDecisionPublicView(
  value: AdmittedNarratorRetailReleaseDecision,
): AdmittedNarratorRetailReleaseDecisionPublicView {
  assertAdmittedNarratorRetailReleaseDecision(value);
  return Object.freeze({
    bookId: value.bookId,
    distributor: value.decision.distributor,
    policyVersion: value.decision.policy.externalVersion,
    narrationSourceKind: "synthetic-voice",
    platformAuthorisationBound: true,
    mediaFileCount: value.decision.package.mediaFileCount,
    totalPackageBytes: value.decision.package.totalPackageBytes,
    totalProductionJobCount: value.totalProductionJobCount,
    releaseDecisionRecorded: true,
    controlledDeliveryAuthorised: true,
    maximumDeliveryAttempts: 1,
    releaseDecisionAuthority: false,
    submissionAuthority: false,
    retailerAcceptanceAuthority: false,
    publicationAuthority: false,
    decidedAt: value.decidedAt,
    validUntil: value.decision.validUntil,
    fingerprint: value.fingerprint,
  });
}

function technicalDeliveryInput(
  value: AdmittedNarratorRetailDeliveryAttempt,
): StartAudiobookRetailDeliveryAttemptInput {
  const packageApproval = value.release.packageApproval;
  return {
    releaseDecision: value.release.decision,
    packageReview: packageApproval.reviewSession,
    inspection: packageApproval.inspection,
    packageManifest: packageApproval.manifest,
    distributorAccount: value.release.distributorAccount,
    operatorId: value.attempt.operatorId,
    humanOperationConfirmed: true,
    startedAt: new Date(value.attempt.startedAt),
  };
}

function buildDeliveryValue(
  release: AdmittedNarratorRetailReleaseDecision,
  attempt: AudiobookRetailDeliveryAttempt,
): AdmittedNarratorRetailDeliveryAttempt {
  const transferred =
    attempt.status === "files-transferred-awaiting-submission-review";
  const partial: Omit<AdmittedNarratorRetailDeliveryAttempt, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_DELIVERY_ATTEMPT_SCHEMA,
    projectId: release.projectId,
    bookId: release.bookId,
    profileAdmissionHash: release.profileAdmissionHash,
    admittedCastingFingerprint: release.admittedCastingFingerprint,
    castingFingerprint: release.castingFingerprint,
    voice: Object.freeze({ ...release.voice }),
    release,
    attempt,
    totalProductionJobCount: release.totalProductionJobCount,
    narratorAdmissionComplete: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailPackageReviewApproval: true,
    controlledDeliveryAuthorised: true,
    deliveryAttemptStarted: true,
    deliveryTransferComplete: transferred,
    submissionReviewEligible: transferred,
    submissionInitiated: false,
    retailerAcceptanceClaimed: false,
    releaseDecisionAuthority: false,
    submissionAuthority: false,
    retailerAcceptanceAuthority: false,
    publicationAuthority: false,
    status: attempt.status,
    updatedAt: attempt.updatedAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(deliveryBase(partial)),
  });
  assertAdmittedNarratorRetailDeliveryAttempt(value);
  return value;
}

function assertDeliveryLineage(
  value: AdmittedNarratorRetailDeliveryAttempt,
): void {
  assertAdmittedNarratorRetailReleaseDecision(value.release);
  assertAudiobookRetailDeliveryAttempt(value.attempt);
  assertExactNarratorVoicePin(value.release.voice, value.voice);
  assertAudiobookRetailDeliveryAttemptMatchesSources(
    value.attempt,
    technicalDeliveryInput(value),
  );
  const attempt = value.attempt;
  const release = value.release;
  const transferred =
    attempt.status === "files-transferred-awaiting-submission-review";
  if (
    value.projectId !== release.projectId
    || value.bookId !== release.bookId
    || value.profileAdmissionHash !== release.profileAdmissionHash
    || value.admittedCastingFingerprint !== release.admittedCastingFingerprint
    || value.castingFingerprint !== release.castingFingerprint
    || attempt.projectId !== release.projectId
    || attempt.bookId !== release.bookId
    || attempt.releaseDecision.id !== release.decision.id
    || attempt.releaseDecision.fingerprint !== release.decision.fingerprint
    || attempt.packageReview.fingerprint
      !== release.packageApproval.reviewSession.fingerprint
    || attempt.inspection.fingerprint
      !== release.packageApproval.inspection.fingerprint
    || attempt.packageManifest.fingerprint
      !== release.packageApproval.manifest.fingerprint
    || attempt.distributorAccount.evidenceFingerprint
      !== release.distributorAccount.fingerprint
    || value.totalProductionJobCount !== release.totalProductionJobCount
    || value.status !== attempt.status
    || value.updatedAt !== attempt.updatedAt
  ) {
    throw new AdmittedNarratorRetailReleaseDeliveryError(
      "ADMITTED_NARRATOR_RETAIL_DELIVERY_LINEAGE_MISMATCH",
    );
  }
  if (
    value.narratorAdmissionComplete !== true
    || value.syntheticNarrationDeclared !== true
    || value.platformAuthorisationBound !== true
    || value.retailPackageReviewApproval !== true
    || value.controlledDeliveryAuthorised !== true
    || value.deliveryAttemptStarted !== true
    || value.deliveryTransferComplete !== transferred
    || value.submissionReviewEligible !== transferred
    || value.submissionInitiated !== false
    || value.retailerAcceptanceClaimed !== false
    || value.releaseDecisionAuthority !== false
    || value.submissionAuthority !== false
    || value.retailerAcceptanceAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorRetailReleaseDeliveryError(
      "ADMITTED_NARRATOR_RETAIL_DELIVERY_AUTHORITY_INVALID",
    );
  }
}

export function startAdmittedNarratorRetailDeliveryAttempt(input: Readonly<{
  release: AdmittedNarratorRetailReleaseDecision;
  operatorId: string;
  humanOperationConfirmed: true;
  startedAt?: Date;
}>): AdmittedNarratorRetailDeliveryAttempt {
  assertAdmittedNarratorRetailReleaseDecision(input.release);
  const packageApproval = input.release.packageApproval;
  const attempt = startTechnicalDeliveryAttempt({
    releaseDecision: input.release.decision,
    packageReview: packageApproval.reviewSession,
    inspection: packageApproval.inspection,
    packageManifest: packageApproval.manifest,
    distributorAccount: input.release.distributorAccount,
    operatorId: input.operatorId,
    humanOperationConfirmed: input.humanOperationConfirmed,
    ...(input.startedAt ? { startedAt: input.startedAt } : {}),
  });
  return buildDeliveryValue(input.release, attempt);
}

export function recordAdmittedNarratorRetailDeliveryTransfer(
  value: AdmittedNarratorRetailDeliveryAttempt,
  input: Readonly<{
    receiptReferenceHash: string;
    remoteDraftReferenceHash: string;
    completedByActorId: string;
    humanConfirmation: true;
    completedAt?: Date;
  }>,
): AdmittedNarratorRetailDeliveryAttempt {
  assertAdmittedNarratorRetailDeliveryAttempt(value);
  const attempt = recordTechnicalDeliveryTransfer(value.attempt, {
    receiptReferenceHash: input.receiptReferenceHash,
    remoteDraftReferenceHash: input.remoteDraftReferenceHash,
    fileCountAcknowledged: value.attempt.package.mediaFileCount,
    allMediaFilesTransferred: true,
    allFileNamesConfirmed: true,
    internalPackageManifestExcluded: true,
    submissionInitiated: false,
    retailerAcceptanceClaimed: false,
    completedByActorId: input.completedByActorId,
    humanConfirmation: input.humanConfirmation,
    ...(input.completedAt ? { completedAt: input.completedAt } : {}),
  });
  return buildDeliveryValue(value.release, attempt);
}

export function recordAdmittedNarratorRetailDeliveryFailure(
  value: AdmittedNarratorRetailDeliveryAttempt,
  input: Readonly<{
    failureCode: string;
    failedByActorId: string;
    humanConfirmation: true;
    failedAt?: Date;
  }>,
): AdmittedNarratorRetailDeliveryAttempt {
  assertAdmittedNarratorRetailDeliveryAttempt(value);
  const attempt = recordTechnicalDeliveryFailure(value.attempt, input);
  return buildDeliveryValue(value.release, attempt);
}

export function cancelAdmittedNarratorRetailDeliveryAttempt(
  value: AdmittedNarratorRetailDeliveryAttempt,
  input: Readonly<{
    reasonCode: string;
    cancelledByActorId: string;
    humanConfirmation: true;
    cancelledAt?: Date;
  }>,
): AdmittedNarratorRetailDeliveryAttempt {
  assertAdmittedNarratorRetailDeliveryAttempt(value);
  const attempt = cancelTechnicalDeliveryAttempt(value.attempt, input);
  return buildDeliveryValue(value.release, attempt);
}

export function assertAdmittedNarratorRetailDeliveryAttempt(
  value: AdmittedNarratorRetailDeliveryAttempt,
): void {
  if (
    value.schemaVersion !== ADMITTED_NARRATOR_RETAIL_DELIVERY_ATTEMPT_SCHEMA
  ) {
    throw new AdmittedNarratorRetailReleaseDeliveryError(
      "ADMITTED_NARRATOR_RETAIL_DELIVERY_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    value.projectId,
    "ADMITTED_NARRATOR_RETAIL_DELIVERY_PROJECT_INVALID",
  );
  requireIdentifier(
    value.bookId,
    "ADMITTED_NARRATOR_RETAIL_DELIVERY_BOOK_INVALID",
  );
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
  ]) requireHash(hash, "ADMITTED_NARRATOR_RETAIL_DELIVERY_HASH_INVALID");
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_RETAIL_DELIVERY_JOB_COUNT_INVALID",
  );
  requireDate(
    value.updatedAt,
    "ADMITTED_NARRATOR_RETAIL_DELIVERY_DATE_INVALID",
  );
  assertDeliveryLineage(value);
  const { fingerprint, ...partial } = value;
  if (
    !HASH.test(fingerprint)
    || fingerprint !== stableHash(deliveryBase(partial))
  ) {
    throw new AdmittedNarratorRetailReleaseDeliveryError(
      "ADMITTED_NARRATOR_RETAIL_DELIVERY_FINGERPRINT_INVALID",
    );
  }
}

export function admittedNarratorRetailDeliveryAttemptPublicView(
  value: AdmittedNarratorRetailDeliveryAttempt,
): AdmittedNarratorRetailDeliveryAttemptPublicView {
  assertAdmittedNarratorRetailDeliveryAttempt(value);
  return Object.freeze({
    bookId: value.bookId,
    distributor: value.attempt.distributor,
    mediaFileCount: value.attempt.package.mediaFileCount,
    totalPackageBytes: value.attempt.package.totalPackageBytes,
    totalProductionJobCount: value.totalProductionJobCount,
    controlledDeliveryAuthorised: true,
    deliveryAttemptStarted: true,
    deliveryTransferComplete: value.deliveryTransferComplete,
    submissionReviewEligible: value.submissionReviewEligible,
    submissionInitiated: false,
    retailerAcceptanceClaimed: false,
    releaseDecisionAuthority: false,
    submissionAuthority: false,
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
