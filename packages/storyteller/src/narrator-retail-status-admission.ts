import {
  assertAudiobookRetailerStatusEvidence,
  assertAudiobookRetailerStatusEvidenceMatchesSources,
  createAudiobookRetailerStatusEvidence,
  type AudiobookRetailerNormalisedStatus,
  type AudiobookRetailerStatusEvidence,
  type CreateAudiobookRetailerStatusEvidenceInput,
} from "./audiobook-retailer-status-evidence.js";
import { stableHash } from "./index.js";
import {
  assertAdmittedNarratorRetailSubmissionAttempt,
  type AdmittedNarratorRetailSubmissionAttempt,
} from "./narrator-retail-submission.js";
import {
  assertExactNarratorVoicePin,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";

export const ADMITTED_NARRATOR_RETAILER_STATUS_EVIDENCE_SCHEMA =
  "storyteller-admitted-narrator-retailer-status-evidence-v1" as const;

export interface AdmittedNarratorRetailerStatusEvidence {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAILER_STATUS_EVIDENCE_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  submission: AdmittedNarratorRetailSubmissionAttempt;
  evidence: AudiobookRetailerStatusEvidence;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  submissionComplete: true;
  retailerReviewEligible: true;
  retailerStatusEvidenceComplete: true;
  retailerAcceptanceConfirmed: boolean;
  publicationConfirmed: false;
  liveConfirmed: false;
  resubmissionRequired: boolean;
  automaticResubmissionAuthority: false;
  retailerAcceptanceAuthority: false;
  publicationAuthority: false;
  observedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailerStatusEvidencePublicView {
  bookId: string;
  distributor: "acx-audible";
  normalisedStatus: AudiobookRetailerNormalisedStatus;
  issueCodes: readonly string[];
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  submissionComplete: true;
  retailerReviewEligible: true;
  retailerStatusEvidenceComplete: true;
  retailerAcceptanceConfirmed: boolean;
  publicationConfirmed: false;
  liveConfirmed: false;
  resubmissionRequired: boolean;
  automaticResubmissionAuthority: false;
  retailerAcceptanceAuthority: false;
  publicationAuthority: false;
  observedAt: string;
  fingerprint: string;
}

export interface CreateAdmittedNarratorRetailerStatusEvidenceInput {
  submission: AdmittedNarratorRetailSubmissionAttempt;
  normalisedStatus: AudiobookRetailerNormalisedStatus;
  externalStatusReferenceHash: string;
  externalStatusTextHash: string;
  issueCodes?: readonly string[];
  observedByActorId: string;
  humanObservationConfirmed: true;
  observedAt?: Date;
}

export class AdmittedNarratorRetailerStatusEvidenceError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AdmittedNarratorRetailerStatusEvidenceError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new AdmittedNarratorRetailerStatusEvidenceError(code);
  }
  return value;
}

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new AdmittedNarratorRetailerStatusEvidenceError(code);
  }
  return value;
}

function requirePositiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AdmittedNarratorRetailerStatusEvidenceError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new AdmittedNarratorRetailerStatusEvidenceError(code);
  }
  return value;
}

function evidenceBase(
  value: Omit<AdmittedNarratorRetailerStatusEvidence, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function technicalStatusInput(
  value: Readonly<{
    submission: AdmittedNarratorRetailSubmissionAttempt;
    normalisedStatus: AudiobookRetailerNormalisedStatus;
    externalStatusReferenceHash: string;
    externalStatusTextHash: string;
    issueCodes?: readonly string[];
    observedByActorId: string;
    humanObservationConfirmed: true;
    observedAt?: Date;
  }>,
): CreateAudiobookRetailerStatusEvidenceInput {
  const submission = value.submission;
  return {
    submissionAttempt: submission.attempt,
    submissionDecision: submission.decision.decision,
    submissionReview: submission.decision.review.session,
    distributorAccount:
      submission.decision.review.delivery.release.distributorAccount,
    normalisedStatus: value.normalisedStatus,
    externalStatusReferenceHash: value.externalStatusReferenceHash,
    externalStatusTextHash: value.externalStatusTextHash,
    ...(value.issueCodes ? { issueCodes: value.issueCodes } : {}),
    retailerAcceptanceConfirmed:
      value.normalisedStatus === "accepted-awaiting-publication",
    publicationConfirmed: false,
    liveConfirmed: false,
    observedByActorId: value.observedByActorId,
    humanObservationConfirmed: value.humanObservationConfirmed,
    ...(value.observedAt ? { observedAt: value.observedAt } : {}),
  };
}

function technicalStatusInputFromEvidence(
  value: AdmittedNarratorRetailerStatusEvidence,
): CreateAudiobookRetailerStatusEvidenceInput {
  return technicalStatusInput({
    submission: value.submission,
    normalisedStatus: value.evidence.normalisedStatus,
    externalStatusReferenceHash: value.evidence.externalStatusReferenceHash,
    externalStatusTextHash: value.evidence.externalStatusTextHash,
    issueCodes: value.evidence.issueCodes,
    observedByActorId: value.evidence.observedByActorId,
    humanObservationConfirmed: true,
    observedAt: new Date(value.evidence.observedAt),
  });
}

function assertStatusLineage(
  value: AdmittedNarratorRetailerStatusEvidence,
): void {
  assertAdmittedNarratorRetailSubmissionAttempt(value.submission);
  assertAudiobookRetailerStatusEvidence(value.evidence);
  assertAudiobookRetailerStatusEvidenceMatchesSources(
    value.evidence,
    technicalStatusInputFromEvidence(value),
  );
  assertExactNarratorVoicePin(value.submission.voice, value.voice);

  const submission = value.submission;
  const attempt = submission.attempt;
  const receipt = attempt.receipt;
  const evidence = value.evidence;
  const distributorAccount =
    submission.decision.review.delivery.release.distributorAccount;

  if (!receipt) {
    throw new AdmittedNarratorRetailerStatusEvidenceError(
      "ADMITTED_NARRATOR_RETAILER_STATUS_SUBMISSION_RECEIPT_REQUIRED",
    );
  }

  if (
    value.projectId !== submission.projectId
    || value.bookId !== submission.bookId
    || value.profileAdmissionHash !== submission.profileAdmissionHash
    || value.admittedCastingFingerprint !== submission.admittedCastingFingerprint
    || value.castingFingerprint !== submission.castingFingerprint
    || evidence.projectId !== submission.projectId
    || evidence.bookId !== submission.bookId
    || evidence.packageId !== attempt.packageId
    || evidence.submissionAttempt.id !== attempt.id
    || evidence.submissionAttempt.fingerprint !== attempt.fingerprint
    || evidence.submissionAttempt.receiptFingerprint !== receipt.fingerprint
    || evidence.submissionAttempt.retailerSubmissionReferenceHash
      !== receipt.retailerSubmissionReferenceHash
    || evidence.submissionDecision.id !== submission.decision.decision.id
    || evidence.submissionDecision.fingerprint
      !== submission.decision.decision.fingerprint
    || evidence.submissionReview.id !== submission.decision.review.session.id
    || evidence.submissionReview.fingerprint
      !== submission.decision.review.session.fingerprint
    || evidence.distributorAccount.evidenceId !== distributorAccount.id
    || evidence.distributorAccount.evidenceFingerprint
      !== distributorAccount.fingerprint
    || evidence.package.mediaFileCount !== attempt.package.mediaFileCount
    || evidence.package.totalPackageBytes !== attempt.package.totalPackageBytes
    || evidence.package.fileSetFingerprint !== attempt.package.fileSetFingerprint
    || value.totalProductionJobCount !== submission.totalProductionJobCount
    || value.retailerAcceptanceConfirmed
      !== evidence.retailerAcceptanceConfirmed
    || value.resubmissionRequired !== evidence.resubmissionRequired
    || value.observedAt !== evidence.observedAt
  ) {
    throw new AdmittedNarratorRetailerStatusEvidenceError(
      "ADMITTED_NARRATOR_RETAILER_STATUS_LINEAGE_MISMATCH",
    );
  }

  if (
    submission.status !== "submitted-awaiting-retailer-review"
    || submission.submissionComplete !== true
    || submission.retailerReviewEligible !== true
    || submission.submissionInitiated !== true
    || submission.retailerAcceptanceClaimed !== false
    || submission.listingPublished !== false
    || evidence.publicationConfirmed !== false
    || evidence.liveConfirmed !== false
    || value.narratorAdmissionComplete !== true
    || value.syntheticNarrationDeclared !== true
    || value.platformAuthorisationBound !== true
    || value.submissionComplete !== true
    || value.retailerReviewEligible !== true
    || value.retailerStatusEvidenceComplete !== true
    || value.publicationConfirmed !== false
    || value.liveConfirmed !== false
    || value.automaticResubmissionAuthority !== false
    || value.retailerAcceptanceAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorRetailerStatusEvidenceError(
      "ADMITTED_NARRATOR_RETAILER_STATUS_AUTHORITY_INVALID",
    );
  }
}

export function createAdmittedNarratorRetailerStatusEvidence(
  input: CreateAdmittedNarratorRetailerStatusEvidenceInput,
): AdmittedNarratorRetailerStatusEvidence {
  assertAdmittedNarratorRetailSubmissionAttempt(input.submission);
  if (
    input.submission.status !== "submitted-awaiting-retailer-review"
    || input.submission.submissionComplete !== true
    || input.submission.retailerReviewEligible !== true
    || input.submission.submissionInitiated !== true
  ) {
    throw new AdmittedNarratorRetailerStatusEvidenceError(
      "ADMITTED_NARRATOR_RETAILER_STATUS_SUBMISSION_INCOMPLETE",
    );
  }

  const evidence = createAudiobookRetailerStatusEvidence(
    technicalStatusInput(input),
  );
  const partial: Omit<
    AdmittedNarratorRetailerStatusEvidence,
    "fingerprint"
  > = {
    schemaVersion: ADMITTED_NARRATOR_RETAILER_STATUS_EVIDENCE_SCHEMA,
    projectId: input.submission.projectId,
    bookId: input.submission.bookId,
    profileAdmissionHash: input.submission.profileAdmissionHash,
    admittedCastingFingerprint: input.submission.admittedCastingFingerprint,
    castingFingerprint: input.submission.castingFingerprint,
    voice: Object.freeze({ ...input.submission.voice }),
    submission: input.submission,
    evidence,
    totalProductionJobCount: input.submission.totalProductionJobCount,
    narratorAdmissionComplete: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    submissionComplete: true,
    retailerReviewEligible: true,
    retailerStatusEvidenceComplete: true,
    retailerAcceptanceConfirmed: evidence.retailerAcceptanceConfirmed,
    publicationConfirmed: false,
    liveConfirmed: false,
    resubmissionRequired: evidence.resubmissionRequired,
    automaticResubmissionAuthority: false,
    retailerAcceptanceAuthority: false,
    publicationAuthority: false,
    observedAt: evidence.observedAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(evidenceBase(partial)),
  });
  assertAdmittedNarratorRetailerStatusEvidence(value);
  return value;
}

export function assertAdmittedNarratorRetailerStatusEvidence(
  value: AdmittedNarratorRetailerStatusEvidence,
): void {
  if (
    value.schemaVersion !== ADMITTED_NARRATOR_RETAILER_STATUS_EVIDENCE_SCHEMA
  ) {
    throw new AdmittedNarratorRetailerStatusEvidenceError(
      "ADMITTED_NARRATOR_RETAILER_STATUS_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    value.projectId,
    "ADMITTED_NARRATOR_RETAILER_STATUS_PROJECT_INVALID",
  );
  requireIdentifier(
    value.bookId,
    "ADMITTED_NARRATOR_RETAILER_STATUS_BOOK_INVALID",
  );
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
  ]) requireHash(hash, "ADMITTED_NARRATOR_RETAILER_STATUS_HASH_INVALID");
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_RETAILER_STATUS_JOB_COUNT_INVALID",
  );
  requireDate(
    value.observedAt,
    "ADMITTED_NARRATOR_RETAILER_STATUS_DATE_INVALID",
  );
  assertStatusLineage(value);
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(evidenceBase(partial))) {
    throw new AdmittedNarratorRetailerStatusEvidenceError(
      "ADMITTED_NARRATOR_RETAILER_STATUS_FINGERPRINT_INVALID",
    );
  }
}

export function admittedNarratorRetailerStatusEvidencePublicView(
  value: AdmittedNarratorRetailerStatusEvidence,
): AdmittedNarratorRetailerStatusEvidencePublicView {
  assertAdmittedNarratorRetailerStatusEvidence(value);
  return Object.freeze({
    bookId: value.bookId,
    distributor: value.evidence.distributor,
    normalisedStatus: value.evidence.normalisedStatus,
    issueCodes: value.evidence.issueCodes,
    totalProductionJobCount: value.totalProductionJobCount,
    narratorAdmissionComplete: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    submissionComplete: true,
    retailerReviewEligible: true,
    retailerStatusEvidenceComplete: true,
    retailerAcceptanceConfirmed: value.retailerAcceptanceConfirmed,
    publicationConfirmed: false,
    liveConfirmed: false,
    resubmissionRequired: value.resubmissionRequired,
    automaticResubmissionAuthority: false,
    retailerAcceptanceAuthority: false,
    publicationAuthority: false,
    observedAt: value.observedAt,
    fingerprint: value.fingerprint,
  });
}
