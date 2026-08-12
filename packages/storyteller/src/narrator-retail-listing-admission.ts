import {
  approveAudiobookRetailListingIdentity,
  assertAudiobookRetailListingIdentity,
  assertAudiobookRetailListingIdentityMatchesSources,
  createAudiobookRetailListingIdentity,
  recordAudiobookRetailListingReview,
  type AudiobookRetailListingIdentity,
  type AudiobookRetailListingIdentitySources,
  type AudiobookRetailListingReviewDecision,
  type AudiobookRetailListingReviewRole,
} from "./audiobook-retail-listing-identity.js";
import { stableHash } from "./index.js";
import {
  assertAdmittedNarratorRetailerStatusEvidence,
  type AdmittedNarratorRetailerStatusEvidence,
} from "./narrator-retail-status-admission.js";
import {
  assertExactNarratorVoicePin,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";

export const ADMITTED_NARRATOR_RETAIL_LISTING_IDENTITY_SCHEMA =
  "storyteller-admitted-narrator-retail-listing-identity-v1" as const;

export interface AdmittedNarratorRetailListingIdentity {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAIL_LISTING_IDENTITY_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  retailerStatus: AdmittedNarratorRetailerStatusEvidence;
  sources: AudiobookRetailListingIdentitySources;
  identity: AudiobookRetailListingIdentity;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailerStatusEvidenceComplete: true;
  retailerAcceptanceConfirmed: true;
  admittedPackageManifestBound: true;
  spokenNarratorCreditBound: true;
  listingIdentityApproved: boolean;
  publicationVerificationEligible: boolean;
  publicationConfirmed: false;
  liveConfirmed: false;
  automaticPublicationAuthority: false;
  publicationAuthority: false;
  status: AudiobookRetailListingIdentity["status"];
  updatedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailListingIdentityPublicView {
  bookId: string;
  distributor: "acx-audible";
  displayTitle: string;
  authorCredit: string;
  narratorCredit: string;
  publisherName: string;
  languageTag: string;
  reviewCount: number;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailerStatusEvidenceComplete: true;
  retailerAcceptanceConfirmed: true;
  admittedPackageManifestBound: true;
  spokenNarratorCreditBound: true;
  listingIdentityApproved: boolean;
  publicationVerificationEligible: boolean;
  publicationConfirmed: false;
  liveConfirmed: false;
  automaticPublicationAuthority: false;
  publicationAuthority: false;
  status: AudiobookRetailListingIdentity["status"];
  updatedAt: string;
  fingerprint: string;
}

export class AdmittedNarratorRetailListingIdentityError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AdmittedNarratorRetailListingIdentityError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new AdmittedNarratorRetailListingIdentityError(code);
  }
  return value;
}

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new AdmittedNarratorRetailListingIdentityError(code);
  }
  return value;
}

function requirePositiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AdmittedNarratorRetailListingIdentityError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new AdmittedNarratorRetailListingIdentityError(code);
  }
  return value;
}

function listingBase(
  value: Omit<AdmittedNarratorRetailListingIdentity, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function admittedPackage(
  status: AdmittedNarratorRetailerStatusEvidence,
) {
  return status.submission.decision.review.delivery.release.packageApproval;
}

function admittedAudiobook(
  status: AdmittedNarratorRetailerStatusEvidence,
) {
  return admittedPackage(status).sample.tracks.admittedPlan.wholeBookApproval
    .binding.reference.audiobook;
}

function assertAcceptedRetailerStatus(
  status: AdmittedNarratorRetailerStatusEvidence,
): void {
  assertAdmittedNarratorRetailerStatusEvidence(status);
  if (
    status.evidence.normalisedStatus !== "accepted-awaiting-publication"
    || status.retailerAcceptanceConfirmed !== true
    || status.resubmissionRequired !== false
    || status.publicationConfirmed !== false
    || status.liveConfirmed !== false
  ) {
    throw new AdmittedNarratorRetailListingIdentityError(
      "ADMITTED_NARRATOR_RETAIL_LISTING_RETAILER_ACCEPTANCE_REQUIRED",
    );
  }
}

function assertListingSourcesMatchNarrator(
  status: AdmittedNarratorRetailerStatusEvidence,
  sources: AudiobookRetailListingIdentitySources,
): void {
  assertAcceptedRetailerStatus(status);
  const packageApproval = admittedPackage(status);
  const audiobook = admittedAudiobook(status);
  const opening = audiobook.opening.generation.plan.script;
  const closing = audiobook.closing.generation.plan.script;
  const manifest = packageApproval.manifest;

  if (
    sources.packageManifest.projectId !== status.projectId
    || sources.packageManifest.bookId !== status.bookId
    || sources.packageManifest.id !== manifest.id
    || sources.packageManifest.fingerprint !== manifest.fingerprint
    || sources.packageManifest.mediaFileCount !== manifest.mediaFileCount
    || sources.packageManifest.totalMediaBytes !== manifest.totalMediaBytes
    || sources.creditMetadata.bookId !== status.bookId
    || sources.openingCredit.metadataFingerprint !== opening.metadataFingerprint
    || sources.openingCredit.textHash !== opening.textHash
    || sources.closingCredit.metadataFingerprint !== closing.metadataFingerprint
    || sources.closingCredit.textHash !== closing.textHash
    || sources.openingCredit.metadataFingerprint
      !== sources.closingCredit.metadataFingerprint
    || sources.audiobookRights.rightsFingerprint !== manifest.rightsFingerprint
  ) {
    throw new AdmittedNarratorRetailListingIdentityError(
      "ADMITTED_NARRATOR_RETAIL_LISTING_SOURCE_MISMATCH",
    );
  }
}

function buildListingValue(
  retailerStatus: AdmittedNarratorRetailerStatusEvidence,
  sources: AudiobookRetailListingIdentitySources,
  identity: AudiobookRetailListingIdentity,
): AdmittedNarratorRetailListingIdentity {
  const approved =
    identity.status === "approved-for-publication-verification"
    && identity.approval?.publicationVerificationEligible === true;
  const partial: Omit<
    AdmittedNarratorRetailListingIdentity,
    "fingerprint"
  > = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_LISTING_IDENTITY_SCHEMA,
    projectId: retailerStatus.projectId,
    bookId: retailerStatus.bookId,
    profileAdmissionHash: retailerStatus.profileAdmissionHash,
    admittedCastingFingerprint: retailerStatus.admittedCastingFingerprint,
    castingFingerprint: retailerStatus.castingFingerprint,
    voice: Object.freeze({ ...retailerStatus.voice }),
    retailerStatus,
    sources,
    identity,
    totalProductionJobCount: retailerStatus.totalProductionJobCount,
    narratorAdmissionComplete: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailerStatusEvidenceComplete: true,
    retailerAcceptanceConfirmed: true,
    admittedPackageManifestBound: true,
    spokenNarratorCreditBound: true,
    listingIdentityApproved: approved,
    publicationVerificationEligible: approved,
    publicationConfirmed: false,
    liveConfirmed: false,
    automaticPublicationAuthority: false,
    publicationAuthority: false,
    status: identity.status,
    updatedAt: identity.updatedAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(listingBase(partial)),
  });
  assertAdmittedNarratorRetailListingIdentity(value);
  return value;
}

function assertListingLineage(
  value: AdmittedNarratorRetailListingIdentity,
): void {
  assertAcceptedRetailerStatus(value.retailerStatus);
  assertListingSourcesMatchNarrator(value.retailerStatus, value.sources);
  assertAudiobookRetailListingIdentity(value.identity);
  assertAudiobookRetailListingIdentityMatchesSources(
    value.identity,
    value.sources,
    new Date(value.updatedAt),
  );
  assertExactNarratorVoicePin(value.retailerStatus.voice, value.voice);

  const packageApproval = admittedPackage(value.retailerStatus);
  const audiobook = admittedAudiobook(value.retailerStatus);
  const opening = audiobook.opening.generation.plan.script;
  const closing = audiobook.closing.generation.plan.script;
  const identity = value.identity;
  const approved =
    identity.status === "approved-for-publication-verification"
    && identity.approval?.publicationVerificationEligible === true;

  if (
    value.projectId !== value.retailerStatus.projectId
    || value.bookId !== value.retailerStatus.bookId
    || value.profileAdmissionHash !== value.retailerStatus.profileAdmissionHash
    || value.admittedCastingFingerprint
      !== value.retailerStatus.admittedCastingFingerprint
    || value.castingFingerprint !== value.retailerStatus.castingFingerprint
    || identity.projectId !== value.projectId
    || identity.bookId !== value.bookId
    || identity.packageManifest.id !== packageApproval.manifest.id
    || identity.packageManifest.fingerprint !== packageApproval.manifest.fingerprint
    || identity.packageManifest.mediaFileCount
      !== packageApproval.manifest.mediaFileCount
    || identity.packageManifest.totalMediaBytes
      !== packageApproval.manifest.totalMediaBytes
    || identity.credits.metadataFingerprint !== opening.metadataFingerprint
    || identity.credits.metadataFingerprint !== closing.metadataFingerprint
    || identity.credits.opening.textHash !== opening.textHash
    || identity.credits.closing.textHash !== closing.textHash
    || identity.audiobookRightsFingerprint
      !== packageApproval.manifest.rightsFingerprint
    || value.totalProductionJobCount
      !== value.retailerStatus.totalProductionJobCount
    || value.listingIdentityApproved !== approved
    || value.publicationVerificationEligible !== approved
    || value.status !== identity.status
    || value.updatedAt !== identity.updatedAt
    || Date.parse(identity.createdAt) < Date.parse(value.retailerStatus.observedAt)
  ) {
    throw new AdmittedNarratorRetailListingIdentityError(
      "ADMITTED_NARRATOR_RETAIL_LISTING_LINEAGE_MISMATCH",
    );
  }

  if (
    value.narratorAdmissionComplete !== true
    || value.syntheticNarrationDeclared !== true
    || value.platformAuthorisationBound !== true
    || value.retailerStatusEvidenceComplete !== true
    || value.retailerAcceptanceConfirmed !== true
    || value.admittedPackageManifestBound !== true
    || value.spokenNarratorCreditBound !== true
    || value.publicationConfirmed !== false
    || value.liveConfirmed !== false
    || value.automaticPublicationAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorRetailListingIdentityError(
      "ADMITTED_NARRATOR_RETAIL_LISTING_AUTHORITY_INVALID",
    );
  }
}

export function createAdmittedNarratorRetailListingIdentity(input: Readonly<{
  retailerStatus: AdmittedNarratorRetailerStatusEvidence;
  id: string;
  sources: AudiobookRetailListingIdentitySources;
  createdAt?: Date;
}>): AdmittedNarratorRetailListingIdentity {
  assertAcceptedRetailerStatus(input.retailerStatus);
  assertListingSourcesMatchNarrator(input.retailerStatus, input.sources);
  const identity = createAudiobookRetailListingIdentity({
    id: input.id,
    sources: input.sources,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  });
  return buildListingValue(input.retailerStatus, input.sources, identity);
}

export function recordAdmittedNarratorRetailListingReview(
  value: AdmittedNarratorRetailListingIdentity,
  input: Readonly<{
    id: string;
    role: AudiobookRetailListingReviewRole;
    reviewerId: string;
    decision: AudiobookRetailListingReviewDecision;
    checks: readonly string[];
    findingCodes?: readonly string[];
    notes?: string;
    decidedAt?: Date;
  }>,
): AdmittedNarratorRetailListingIdentity {
  assertAdmittedNarratorRetailListingIdentity(value);
  const identity = recordAudiobookRetailListingReview(value.identity, input);
  return buildListingValue(value.retailerStatus, value.sources, identity);
}

export function approveAdmittedNarratorRetailListingIdentity(
  value: AdmittedNarratorRetailListingIdentity,
  input: Readonly<{
    finalConfirmationId: string;
    approvedByActorId: string;
    humanConfirmation: true;
    approvedAt?: Date;
  }>,
): AdmittedNarratorRetailListingIdentity {
  assertAdmittedNarratorRetailListingIdentity(value);
  assertListingSourcesMatchNarrator(value.retailerStatus, value.sources);
  const identity = approveAudiobookRetailListingIdentity(value.identity, {
    sources: value.sources,
    finalConfirmationId: input.finalConfirmationId,
    approvedByActorId: input.approvedByActorId,
    humanConfirmation: input.humanConfirmation,
    ...(input.approvedAt ? { approvedAt: input.approvedAt } : {}),
  });
  return buildListingValue(value.retailerStatus, value.sources, identity);
}

export function assertAdmittedNarratorRetailListingIdentity(
  value: AdmittedNarratorRetailListingIdentity,
): void {
  if (value.schemaVersion !== ADMITTED_NARRATOR_RETAIL_LISTING_IDENTITY_SCHEMA) {
    throw new AdmittedNarratorRetailListingIdentityError(
      "ADMITTED_NARRATOR_RETAIL_LISTING_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    value.projectId,
    "ADMITTED_NARRATOR_RETAIL_LISTING_PROJECT_INVALID",
  );
  requireIdentifier(
    value.bookId,
    "ADMITTED_NARRATOR_RETAIL_LISTING_BOOK_INVALID",
  );
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
  ]) requireHash(hash, "ADMITTED_NARRATOR_RETAIL_LISTING_HASH_INVALID");
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_RETAIL_LISTING_JOB_COUNT_INVALID",
  );
  requireDate(
    value.updatedAt,
    "ADMITTED_NARRATOR_RETAIL_LISTING_DATE_INVALID",
  );
  assertListingLineage(value);
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(listingBase(partial))) {
    throw new AdmittedNarratorRetailListingIdentityError(
      "ADMITTED_NARRATOR_RETAIL_LISTING_FINGERPRINT_INVALID",
    );
  }
}

export function admittedNarratorRetailListingIdentityPublicView(
  value: AdmittedNarratorRetailListingIdentity,
): AdmittedNarratorRetailListingIdentityPublicView {
  assertAdmittedNarratorRetailListingIdentity(value);
  return Object.freeze({
    bookId: value.bookId,
    distributor: value.identity.distributor,
    displayTitle: value.identity.metadata.displayTitle,
    authorCredit: value.identity.metadata.authorCredit,
    narratorCredit: value.identity.metadata.narratorCredit,
    publisherName: value.identity.metadata.publisherName,
    languageTag: value.identity.metadata.languageTag,
    reviewCount: value.identity.reviews.length,
    totalProductionJobCount: value.totalProductionJobCount,
    narratorAdmissionComplete: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailerStatusEvidenceComplete: true,
    retailerAcceptanceConfirmed: true,
    admittedPackageManifestBound: true,
    spokenNarratorCreditBound: true,
    listingIdentityApproved: value.listingIdentityApproved,
    publicationVerificationEligible: value.publicationVerificationEligible,
    publicationConfirmed: false,
    liveConfirmed: false,
    automaticPublicationAuthority: false,
    publicationAuthority: false,
    status: value.status,
    updatedAt: value.updatedAt,
    fingerprint: value.fingerprint,
  });
}
