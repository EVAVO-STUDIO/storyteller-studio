import {
  assertAudiobookRetailPublicationVerification,
  assertAudiobookRetailPublicationVerificationMatchesSources,
  assertAudiobookRetailPublicListingObservation,
  audiobookRetailPublicationVerificationPublicView,
  createAudiobookRetailPublicListingObservation,
  verifyAudiobookRetailPublication,
  type AudiobookRetailPublicationVerification,
  type AudiobookRetailPublicationVerificationStatus,
  type AudiobookRetailPublicListingObservation,
} from "./audiobook-retail-publication-verification.js";
import { stableHash } from "./index.js";
import {
  assertAdmittedNarratorRetailListingIdentity,
  type AdmittedNarratorRetailListingIdentity,
} from "./narrator-retail-listing-admission.js";
import {
  assertExactNarratorVoicePin,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";

export const ADMITTED_NARRATOR_RETAIL_PUBLIC_LISTING_OBSERVATION_SCHEMA =
  "storyteller-admitted-narrator-retail-public-listing-observation-v1" as const;
export const ADMITTED_NARRATOR_RETAIL_PUBLICATION_VERIFICATION_SCHEMA =
  "storyteller-admitted-narrator-retail-publication-verification-v1" as const;

export interface AdmittedNarratorRetailPublicListingObservation {
  schemaVersion:
    typeof ADMITTED_NARRATOR_RETAIL_PUBLIC_LISTING_OBSERVATION_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  listing: AdmittedNarratorRetailListingIdentity;
  observation: AudiobookRetailPublicListingObservation;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailerAcceptanceConfirmed: true;
  listingIdentityApproved: true;
  publicationVerificationEligible: true;
  admittedListingIdentityBound: true;
  publicObservationRecorded: true;
  publicationVerificationComplete: false;
  publicationConfirmed: false;
  liveConfirmed: false;
  automaticPublicationAuthority: false;
  publicationAuthority: false;
  observedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailPublicationVerification {
  schemaVersion:
    typeof ADMITTED_NARRATOR_RETAIL_PUBLICATION_VERIFICATION_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  observation: AdmittedNarratorRetailPublicListingObservation;
  verification: AudiobookRetailPublicationVerification;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailerAcceptanceConfirmed: true;
  listingIdentityApproved: true;
  admittedListingIdentityBound: true;
  publicObservationRecorded: true;
  publicationVerificationComplete: true;
  publicationConfirmed: boolean;
  liveConfirmed: boolean;
  purchaseConfirmed: boolean;
  samplePlaybackConfirmed: boolean;
  automaticPublicationAuthority: false;
  publicationAuthority: false;
  status: AudiobookRetailPublicationVerificationStatus;
  verifiedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailPublicListingObservationPublicView {
  bookId: string;
  distributor: "acx-audible";
  marketplace: "audible";
  audiobookAsin: string;
  displayTitle: string;
  authorCredit: string;
  narratorCredit: string;
  publisherName: string;
  languageTag: string;
  regions: readonly Readonly<{
    regionCode: string;
    productPageAccessible: boolean;
    purchaseAvailable: boolean;
    sampleAvailable: boolean;
    samplePlaybackSuccessful: boolean;
  }>[];
  narratorAdmissionComplete: true;
  retailerAcceptanceConfirmed: true;
  listingIdentityApproved: true;
  admittedListingIdentityBound: true;
  publicObservationRecorded: true;
  publicationVerificationComplete: false;
  publicationConfirmed: false;
  liveConfirmed: false;
  automaticPublicationAuthority: false;
  publicationAuthority: false;
  observedAt: string;
  expiresAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailPublicationVerificationPublicView {
  bookId: string;
  distributor: "acx-audible";
  marketplace: "audible";
  audiobookAsin: string;
  displayTitle: string;
  authorCredit: string;
  narratorCredit: string;
  publisherName: string;
  languageTag: string;
  description: string;
  requiredRegions: readonly string[];
  regions: readonly Readonly<{
    regionCode: string;
    productPageAccessible: boolean;
    purchaseAvailable: boolean;
    sampleAvailable: boolean;
    samplePlaybackSuccessful: boolean;
  }>[];
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailerAcceptanceConfirmed: true;
  listingIdentityApproved: true;
  admittedListingIdentityBound: true;
  publicObservationRecorded: true;
  publicationVerificationComplete: true;
  publicationConfirmed: boolean;
  liveConfirmed: boolean;
  purchaseConfirmed: boolean;
  samplePlaybackConfirmed: boolean;
  automaticPublicationAuthority: false;
  publicationAuthority: false;
  findingCodes: readonly string[];
  observedAt: string;
  verifiedAt: string;
  status: AudiobookRetailPublicationVerificationStatus;
  fingerprint: string;
}

export interface CreateAdmittedNarratorRetailPublicListingObservationInput {
  listing: AdmittedNarratorRetailListingIdentity;
  id: string;
  audiobookAsin: string;
  publicProductReferenceHash: string;
  sampleReferenceHash: string;
  coverReferenceHash: string;
  displayTitle: string;
  authorCredit: string;
  narratorCredit: string;
  publisherName: string;
  languageTag: string;
  description: string;
  coverIdentityMatched: boolean;
  ebookAsin: string;
  ebookAssociationMatched: boolean;
  regions: readonly Readonly<{
    regionCode: string;
    productPageAccessible: boolean;
    purchaseAvailable: boolean;
    sampleAvailable: boolean;
    samplePlaybackSuccessful: boolean;
  }>[];
  observedByActorId: string;
  humanObservationConfirmed: true;
  observedAt: string;
  expiresAt: string;
  now?: Date;
}

export class AdmittedNarratorRetailPublicationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AdmittedNarratorRetailPublicationError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new AdmittedNarratorRetailPublicationError(code);
  }
  return value;
}

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new AdmittedNarratorRetailPublicationError(code);
  }
  return value;
}

function requirePositiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AdmittedNarratorRetailPublicationError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new AdmittedNarratorRetailPublicationError(code);
  }
  return value;
}

function observationBase(
  value: Omit<AdmittedNarratorRetailPublicListingObservation, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function verificationBase(
  value: Omit<AdmittedNarratorRetailPublicationVerification, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function assertApprovedListing(
  listing: AdmittedNarratorRetailListingIdentity,
): void {
  assertAdmittedNarratorRetailListingIdentity(listing);
  if (
    listing.listingIdentityApproved !== true
    || listing.publicationVerificationEligible !== true
    || listing.retailerAcceptanceConfirmed !== true
    || listing.identity.status !== "approved-for-publication-verification"
    || listing.identity.approval?.publicationVerificationEligible !== true
    || listing.publicationConfirmed !== false
    || listing.liveConfirmed !== false
  ) {
    throw new AdmittedNarratorRetailPublicationError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_APPROVED_LISTING_REQUIRED",
    );
  }
}

function assertObservationLineage(
  value: AdmittedNarratorRetailPublicListingObservation,
): void {
  assertApprovedListing(value.listing);
  assertAudiobookRetailPublicListingObservation(
    value.observation,
    new Date(value.observedAt),
  );
  assertExactNarratorVoicePin(value.listing.voice, value.voice);
  const listing = value.listing;
  const observation = value.observation;
  if (
    value.projectId !== listing.projectId
    || value.bookId !== listing.bookId
    || value.profileAdmissionHash !== listing.profileAdmissionHash
    || value.admittedCastingFingerprint !== listing.admittedCastingFingerprint
    || value.castingFingerprint !== listing.castingFingerprint
    || observation.projectId !== listing.projectId
    || observation.bookId !== listing.bookId
    || observation.distributor !== listing.identity.distributor
    || value.totalProductionJobCount !== listing.totalProductionJobCount
    || value.observedAt !== observation.observedAt
    || Date.parse(observation.observedAt) < Date.parse(listing.updatedAt)
  ) {
    throw new AdmittedNarratorRetailPublicationError(
      "ADMITTED_NARRATOR_RETAIL_PUBLIC_OBSERVATION_LINEAGE_MISMATCH",
    );
  }
  if (
    value.narratorAdmissionComplete !== true
    || value.syntheticNarrationDeclared !== true
    || value.platformAuthorisationBound !== true
    || value.retailerAcceptanceConfirmed !== true
    || value.listingIdentityApproved !== true
    || value.publicationVerificationEligible !== true
    || value.admittedListingIdentityBound !== true
    || value.publicObservationRecorded !== true
    || value.publicationVerificationComplete !== false
    || value.publicationConfirmed !== false
    || value.liveConfirmed !== false
    || value.automaticPublicationAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorRetailPublicationError(
      "ADMITTED_NARRATOR_RETAIL_PUBLIC_OBSERVATION_AUTHORITY_INVALID",
    );
  }
}

export function createAdmittedNarratorRetailPublicListingObservation(
  input: CreateAdmittedNarratorRetailPublicListingObservationInput,
): AdmittedNarratorRetailPublicListingObservation {
  assertApprovedListing(input.listing);
  const observation = createAudiobookRetailPublicListingObservation({
    id: input.id,
    projectId: input.listing.projectId,
    bookId: input.listing.bookId,
    audiobookAsin: input.audiobookAsin,
    publicProductReferenceHash: input.publicProductReferenceHash,
    sampleReferenceHash: input.sampleReferenceHash,
    coverReferenceHash: input.coverReferenceHash,
    displayTitle: input.displayTitle,
    authorCredit: input.authorCredit,
    narratorCredit: input.narratorCredit,
    publisherName: input.publisherName,
    languageTag: input.languageTag,
    description: input.description,
    coverIdentityMatched: input.coverIdentityMatched,
    ebookAsin: input.ebookAsin,
    ebookAssociationMatched: input.ebookAssociationMatched,
    regions: input.regions,
    observedByActorId: input.observedByActorId,
    humanObservationConfirmed: input.humanObservationConfirmed,
    observedAt: input.observedAt,
    expiresAt: input.expiresAt,
    ...(input.now ? { now: input.now } : {}),
  });
  if (Date.parse(observation.observedAt) < Date.parse(input.listing.updatedAt)) {
    throw new AdmittedNarratorRetailPublicationError(
      "ADMITTED_NARRATOR_RETAIL_PUBLIC_OBSERVATION_BEFORE_LISTING_APPROVAL",
    );
  }
  const partial: Omit<
    AdmittedNarratorRetailPublicListingObservation,
    "fingerprint"
  > = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_PUBLIC_LISTING_OBSERVATION_SCHEMA,
    projectId: input.listing.projectId,
    bookId: input.listing.bookId,
    profileAdmissionHash: input.listing.profileAdmissionHash,
    admittedCastingFingerprint: input.listing.admittedCastingFingerprint,
    castingFingerprint: input.listing.castingFingerprint,
    voice: Object.freeze({ ...input.listing.voice }),
    listing: input.listing,
    observation,
    totalProductionJobCount: input.listing.totalProductionJobCount,
    narratorAdmissionComplete: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailerAcceptanceConfirmed: true,
    listingIdentityApproved: true,
    publicationVerificationEligible: true,
    admittedListingIdentityBound: true,
    publicObservationRecorded: true,
    publicationVerificationComplete: false,
    publicationConfirmed: false,
    liveConfirmed: false,
    automaticPublicationAuthority: false,
    publicationAuthority: false,
    observedAt: observation.observedAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(observationBase(partial)),
  });
  assertAdmittedNarratorRetailPublicListingObservation(value);
  return value;
}

export function assertAdmittedNarratorRetailPublicListingObservation(
  value: AdmittedNarratorRetailPublicListingObservation,
): void {
  if (
    value.schemaVersion
      !== ADMITTED_NARRATOR_RETAIL_PUBLIC_LISTING_OBSERVATION_SCHEMA
  ) {
    throw new AdmittedNarratorRetailPublicationError(
      "ADMITTED_NARRATOR_RETAIL_PUBLIC_OBSERVATION_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    value.projectId,
    "ADMITTED_NARRATOR_RETAIL_PUBLIC_OBSERVATION_PROJECT_INVALID",
  );
  requireIdentifier(
    value.bookId,
    "ADMITTED_NARRATOR_RETAIL_PUBLIC_OBSERVATION_BOOK_INVALID",
  );
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
  ]) requireHash(hash, "ADMITTED_NARRATOR_RETAIL_PUBLIC_OBSERVATION_HASH_INVALID");
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_RETAIL_PUBLIC_OBSERVATION_JOB_COUNT_INVALID",
  );
  requireDate(
    value.observedAt,
    "ADMITTED_NARRATOR_RETAIL_PUBLIC_OBSERVATION_DATE_INVALID",
  );
  assertObservationLineage(value);
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(observationBase(partial))) {
    throw new AdmittedNarratorRetailPublicationError(
      "ADMITTED_NARRATOR_RETAIL_PUBLIC_OBSERVATION_FINGERPRINT_INVALID",
    );
  }
}

function assertVerificationLineage(
  value: AdmittedNarratorRetailPublicationVerification,
): void {
  assertAdmittedNarratorRetailPublicListingObservation(value.observation);
  assertAudiobookRetailPublicationVerification(value.verification);
  const listing = value.observation.listing;
  const genericSources = {
    listingIdentity: listing.identity,
    retailerStatus: listing.retailerStatus.evidence,
    observation: value.observation.observation,
  };
  assertAudiobookRetailPublicationVerificationMatchesSources(
    value.verification,
    genericSources,
    new Date(value.verifiedAt),
  );
  assertExactNarratorVoicePin(value.observation.voice, value.voice);
  const verification = value.verification;
  if (
    value.projectId !== value.observation.projectId
    || value.bookId !== value.observation.bookId
    || value.profileAdmissionHash !== value.observation.profileAdmissionHash
    || value.admittedCastingFingerprint
      !== value.observation.admittedCastingFingerprint
    || value.castingFingerprint !== value.observation.castingFingerprint
    || verification.projectId !== value.projectId
    || verification.bookId !== value.bookId
    || verification.packageId !== listing.retailerStatus.evidence.packageId
    || verification.listingIdentity.id !== listing.identity.id
    || verification.listingIdentity.revision !== listing.identity.revision
    || verification.listingIdentity.fingerprint !== listing.identity.fingerprint
    || verification.listingIdentity.approvalFingerprint
      !== listing.identity.approval!.fingerprint
    || verification.retailerStatus.id !== listing.retailerStatus.evidence.id
    || verification.retailerStatus.fingerprint
      !== listing.retailerStatus.evidence.fingerprint
    || verification.observation.id !== value.observation.observation.id
    || verification.observation.fingerprint
      !== value.observation.observation.fingerprint
    || value.totalProductionJobCount !== value.observation.totalProductionJobCount
    || value.publicationConfirmed !== verification.publicationConfirmed
    || value.liveConfirmed !== verification.liveConfirmed
    || value.purchaseConfirmed !== verification.purchaseConfirmed
    || value.samplePlaybackConfirmed !== verification.samplePlaybackConfirmed
    || value.status !== verification.status
    || value.verifiedAt !== verification.verifiedAt
    || Date.parse(value.verifiedAt) < Date.parse(value.observation.observedAt)
  ) {
    throw new AdmittedNarratorRetailPublicationError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_LINEAGE_MISMATCH",
    );
  }
  if (
    value.narratorAdmissionComplete !== true
    || value.syntheticNarrationDeclared !== true
    || value.platformAuthorisationBound !== true
    || value.retailerAcceptanceConfirmed !== true
    || value.listingIdentityApproved !== true
    || value.admittedListingIdentityBound !== true
    || value.publicObservationRecorded !== true
    || value.publicationVerificationComplete !== true
    || value.automaticPublicationAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorRetailPublicationError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_AUTHORITY_INVALID",
    );
  }
}

export function verifyAdmittedNarratorRetailPublication(input: Readonly<{
  observation: AdmittedNarratorRetailPublicListingObservation;
  id: string;
  requiredRegions: readonly string[];
  verifiedByActorId: string;
  humanVerificationConfirmed: true;
  verifiedAt?: Date;
}>): AdmittedNarratorRetailPublicationVerification {
  assertAdmittedNarratorRetailPublicListingObservation(input.observation);
  const listing = input.observation.listing;
  const verification = verifyAudiobookRetailPublication({
    id: input.id,
    sources: {
      listingIdentity: listing.identity,
      retailerStatus: listing.retailerStatus.evidence,
      observation: input.observation.observation,
    },
    requiredRegions: input.requiredRegions,
    verifiedByActorId: input.verifiedByActorId,
    humanVerificationConfirmed: input.humanVerificationConfirmed,
    ...(input.verifiedAt ? { verifiedAt: input.verifiedAt } : {}),
  });
  const partial: Omit<
    AdmittedNarratorRetailPublicationVerification,
    "fingerprint"
  > = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_PUBLICATION_VERIFICATION_SCHEMA,
    projectId: input.observation.projectId,
    bookId: input.observation.bookId,
    profileAdmissionHash: input.observation.profileAdmissionHash,
    admittedCastingFingerprint: input.observation.admittedCastingFingerprint,
    castingFingerprint: input.observation.castingFingerprint,
    voice: Object.freeze({ ...input.observation.voice }),
    observation: input.observation,
    verification,
    totalProductionJobCount: input.observation.totalProductionJobCount,
    narratorAdmissionComplete: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailerAcceptanceConfirmed: true,
    listingIdentityApproved: true,
    admittedListingIdentityBound: true,
    publicObservationRecorded: true,
    publicationVerificationComplete: true,
    publicationConfirmed: verification.publicationConfirmed,
    liveConfirmed: verification.liveConfirmed,
    purchaseConfirmed: verification.purchaseConfirmed,
    samplePlaybackConfirmed: verification.samplePlaybackConfirmed,
    automaticPublicationAuthority: false,
    publicationAuthority: false,
    status: verification.status,
    verifiedAt: verification.verifiedAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(verificationBase(partial)),
  });
  assertAdmittedNarratorRetailPublicationVerification(value);
  return value;
}

export function assertAdmittedNarratorRetailPublicationVerification(
  value: AdmittedNarratorRetailPublicationVerification,
): void {
  if (
    value.schemaVersion
      !== ADMITTED_NARRATOR_RETAIL_PUBLICATION_VERIFICATION_SCHEMA
  ) {
    throw new AdmittedNarratorRetailPublicationError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    value.projectId,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_PROJECT_INVALID",
  );
  requireIdentifier(
    value.bookId,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_BOOK_INVALID",
  );
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
  ]) requireHash(hash, "ADMITTED_NARRATOR_RETAIL_PUBLICATION_HASH_INVALID");
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_JOB_COUNT_INVALID",
  );
  requireDate(
    value.verifiedAt,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_DATE_INVALID",
  );
  assertVerificationLineage(value);
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(verificationBase(partial))) {
    throw new AdmittedNarratorRetailPublicationError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_FINGERPRINT_INVALID",
    );
  }
}

export function admittedNarratorRetailPublicListingObservationPublicView(
  value: AdmittedNarratorRetailPublicListingObservation,
): AdmittedNarratorRetailPublicListingObservationPublicView {
  assertAdmittedNarratorRetailPublicListingObservation(value);
  return Object.freeze({
    bookId: value.bookId,
    distributor: value.observation.distributor,
    marketplace: value.observation.marketplace,
    audiobookAsin: value.observation.audiobookAsin,
    displayTitle: value.observation.displayTitle,
    authorCredit: value.observation.authorCredit,
    narratorCredit: value.observation.narratorCredit,
    publisherName: value.observation.publisherName,
    languageTag: value.observation.languageTag,
    regions: Object.freeze(value.observation.regions.map((region) => Object.freeze({
      regionCode: region.regionCode,
      productPageAccessible: region.productPageAccessible,
      purchaseAvailable: region.purchaseAvailable,
      sampleAvailable: region.sampleAvailable,
      samplePlaybackSuccessful: region.samplePlaybackSuccessful,
    }))),
    narratorAdmissionComplete: true,
    retailerAcceptanceConfirmed: true,
    listingIdentityApproved: true,
    admittedListingIdentityBound: true,
    publicObservationRecorded: true,
    publicationVerificationComplete: false,
    publicationConfirmed: false,
    liveConfirmed: false,
    automaticPublicationAuthority: false,
    publicationAuthority: false,
    observedAt: value.observation.observedAt,
    expiresAt: value.observation.expiresAt,
    fingerprint: value.fingerprint,
  });
}

export function admittedNarratorRetailPublicationVerificationPublicView(
  value: AdmittedNarratorRetailPublicationVerification,
): AdmittedNarratorRetailPublicationVerificationPublicView {
  assertAdmittedNarratorRetailPublicationVerification(value);
  const generic = audiobookRetailPublicationVerificationPublicView(
    value.verification,
    value.observation.observation,
  );
  return Object.freeze({
    bookId: value.bookId,
    distributor: generic.distributor,
    marketplace: generic.marketplace,
    audiobookAsin: generic.audiobookAsin,
    displayTitle: generic.displayTitle,
    authorCredit: generic.authorCredit,
    narratorCredit: generic.narratorCredit,
    publisherName: generic.publisherName,
    languageTag: generic.languageTag,
    description: generic.description,
    requiredRegions: generic.requiredRegions,
    regions: generic.regions,
    totalProductionJobCount: value.totalProductionJobCount,
    narratorAdmissionComplete: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailerAcceptanceConfirmed: true,
    listingIdentityApproved: true,
    admittedListingIdentityBound: true,
    publicObservationRecorded: true,
    publicationVerificationComplete: true,
    publicationConfirmed: generic.publicationConfirmed,
    liveConfirmed: generic.liveConfirmed,
    purchaseConfirmed: generic.purchaseConfirmed,
    samplePlaybackConfirmed: generic.samplePlaybackConfirmed,
    automaticPublicationAuthority: false,
    publicationAuthority: false,
    findingCodes: generic.findingCodes,
    observedAt: generic.observedAt,
    verifiedAt: generic.verifiedAt,
    status: generic.status,
    fingerprint: value.fingerprint,
  });
}
