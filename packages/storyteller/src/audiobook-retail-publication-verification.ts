import {
  assertAudiobookRetailListingIdentity,
  type AudiobookRetailListingIdentity,
} from "./audiobook-retail-listing-identity.js";
import {
  assertAudiobookRetailerStatusEvidence,
  type AudiobookRetailerStatusEvidence,
} from "./audiobook-retailer-status-evidence.js";
import { stableHash } from "./index.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";

export const AUDIOBOOK_RETAIL_PUBLIC_LISTING_OBSERVATION_SCHEMA_VERSION =
  "storyteller-audiobook-retail-public-listing-observation-v1" as const;
export const AUDIOBOOK_RETAIL_PUBLICATION_VERIFICATION_SCHEMA_VERSION =
  "storyteller-audiobook-retail-publication-verification-v1" as const;
export const AUDIOBOOK_RETAIL_PUBLICATION_VERIFICATION_ENTITY_TYPE =
  "audiobook-retail-publication-verification" as const;

export type AudiobookRetailPublicationVerificationStatus =
  | "not-yet-published"
  | "publication-mismatch"
  | "published-but-unavailable"
  | "published-and-live";

export interface AudiobookRetailPublicRegionObservation {
  regionCode: string;
  productPageAccessible: boolean;
  purchaseAvailable: boolean;
  sampleAvailable: boolean;
  samplePlaybackSuccessful: boolean;
  fingerprint: string;
}

export interface AudiobookRetailPublicListingObservation {
  schemaVersion:
    typeof AUDIOBOOK_RETAIL_PUBLIC_LISTING_OBSERVATION_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  distributor: "acx-audible";
  marketplace: "audible";
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
  regions: readonly AudiobookRetailPublicRegionObservation[];
  observedByActorId: string;
  humanObservationConfirmed: true;
  observedAt: string;
  expiresAt: string;
  status: "observed-public-listing";
  fingerprint: string;
}

export interface AudiobookRetailPublicationVerification {
  schemaVersion:
    typeof AUDIOBOOK_RETAIL_PUBLICATION_VERIFICATION_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  packageId: string;
  distributor: "acx-audible";
  marketplace: "audible";
  listingIdentity: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
    approvalFingerprint: string;
  }>;
  retailerStatus: Readonly<{
    id: string;
    revision: 1;
    fingerprint: string;
    normalisedStatus: "accepted-awaiting-publication";
    observedAt: string;
  }>;
  observation: Readonly<{
    id: string;
    fingerprint: string;
    audiobookAsin: string;
    publicProductReferenceHash: string;
    observedAt: string;
    expiresAt: string;
  }>;
  requiredRegions: readonly string[];
  observedRegions: readonly AudiobookRetailPublicRegionObservation[];
  metadataMatches: Readonly<{
    displayTitle: boolean;
    authorCredit: boolean;
    narratorCredit: boolean;
    publisherName: boolean;
    languageTag: boolean;
    description: boolean;
  }>;
  coverIdentityMatched: boolean;
  ebookAssociationMatched: boolean;
  retailerAcceptanceConfirmed: true;
  publicationConfirmed: boolean;
  liveConfirmed: boolean;
  purchaseConfirmed: boolean;
  samplePlaybackConfirmed: boolean;
  findingCodes: readonly string[];
  verifiedByActorId: string;
  humanVerificationConfirmed: true;
  verifiedAt: string;
  status: AudiobookRetailPublicationVerificationStatus;
  revision: 1;
  fingerprint: string;
}

export interface AudiobookRetailPublicationVerificationSources {
  listingIdentity: AudiobookRetailListingIdentity;
  retailerStatus: AudiobookRetailerStatusEvidence;
  observation: AudiobookRetailPublicListingObservation;
}

export interface AudiobookRetailPublicationVerificationPublicView {
  id: string;
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
  retailerAcceptanceConfirmed: true;
  publicationConfirmed: boolean;
  liveConfirmed: boolean;
  purchaseConfirmed: boolean;
  samplePlaybackConfirmed: boolean;
  findingCodes: readonly string[];
  observedAt: string;
  verifiedAt: string;
  status: AudiobookRetailPublicationVerificationStatus;
  revision: 1;
  fingerprint: string;
}

export class AudiobookRetailPublicationVerificationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailPublicationVerificationError";
    this.code = code;
  }
}

export class AudiobookRetailPublicationVerificationStoreConflictError
  extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudiobookRetailPublicationVerificationStoreConflictError";
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const ASIN_PATTERN = /^[A-Z0-9]{10}$/u;
const REGION_PATTERN = /^[A-Z]{2}$/u;
const LANGUAGE_TAG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const HUMAN_BLOCKLIST = /^(?:system|worker|automation|automated|bot)(?:[_-]|$)/iu;
const FINDING_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,95}$/u;
const MAXIMUM_OBSERVATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
const MAXIMUM_TEXT_LENGTH = 2_000;
const MAXIMUM_REGIONS = 32;
const MAXIMUM_FINDING_CODES = 200;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailPublicationVerificationError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailPublicationVerificationError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailPublicationVerificationError(code);
  }
  return value;
}

function requireText(value: string, maximum: number, code: string): string {
  const trimmed = value.trim();
  if (
    !trimmed
    || trimmed.length > maximum
    || CONTROL_CHARACTERS.test(trimmed)
  ) {
    throw new AudiobookRetailPublicationVerificationError(code);
  }
  return trimmed;
}

function requireHumanActor(value: string, code: string): string {
  requireIdentifier(value, code);
  if (HUMAN_BLOCKLIST.test(value)) {
    throw new AudiobookRetailPublicationVerificationError(code);
  }
  return value;
}

function regionFingerprint(
  value: Omit<AudiobookRetailPublicRegionObservation, "fingerprint">,
): string {
  return stableHash(value);
}

function observationFingerprint(
  value: Omit<AudiobookRetailPublicListingObservation, "fingerprint">,
): string {
  return stableHash(value);
}

function verificationFingerprint(
  value: Omit<AudiobookRetailPublicationVerification, "fingerprint">,
): string {
  return stableHash(value);
}

function normaliseRegion(input: Readonly<{
  regionCode: string;
  productPageAccessible: boolean;
  purchaseAvailable: boolean;
  sampleAvailable: boolean;
  samplePlaybackSuccessful: boolean;
}>): AudiobookRetailPublicRegionObservation {
  if (!REGION_PATTERN.test(input.regionCode)) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_REGION_CODE_INVALID",
    );
  }
  if (
    input.samplePlaybackSuccessful
    && (!input.sampleAvailable || !input.productPageAccessible)
  ) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_REGION_PLAYBACK_STATE_INVALID",
    );
  }
  if (
    !input.productPageAccessible
    && (
      input.purchaseAvailable
      || input.sampleAvailable
      || input.samplePlaybackSuccessful
    )
  ) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_REGION_ACCESS_STATE_INVALID",
    );
  }
  const partial: Omit<
    AudiobookRetailPublicRegionObservation,
    "fingerprint"
  > = {
    regionCode: input.regionCode,
    productPageAccessible: input.productPageAccessible,
    purchaseAvailable: input.purchaseAvailable,
    sampleAvailable: input.sampleAvailable,
    samplePlaybackSuccessful: input.samplePlaybackSuccessful,
  };
  return Object.freeze({
    ...partial,
    fingerprint: regionFingerprint(partial),
  });
}

function normaliseRegions(
  regions: readonly Readonly<{
    regionCode: string;
    productPageAccessible: boolean;
    purchaseAvailable: boolean;
    sampleAvailable: boolean;
    samplePlaybackSuccessful: boolean;
  }>[],
): readonly AudiobookRetailPublicRegionObservation[] {
  if (!Array.isArray(regions) || regions.length === 0 || regions.length > MAXIMUM_REGIONS) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_REGIONS_INVALID",
    );
  }
  const byCode = new Map<string, AudiobookRetailPublicRegionObservation>();
  for (const region of regions) {
    const normalised = normaliseRegion(region);
    if (byCode.has(normalised.regionCode)) {
      throw new AudiobookRetailPublicationVerificationError(
        "AUDIOBOOK_RETAIL_PUBLICATION_REGION_DUPLICATE",
      );
    }
    byCode.set(normalised.regionCode, normalised);
  }
  return Object.freeze(
    [...byCode.values()].sort((left, right) =>
      left.regionCode.localeCompare(right.regionCode, "en-AU")
    ),
  );
}

function normaliseRequiredRegions(values: readonly string[]): readonly string[] {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAXIMUM_REGIONS) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_REQUIRED_REGIONS_INVALID",
    );
  }
  const regions = new Set<string>();
  for (const value of values) {
    if (!REGION_PATTERN.test(value) || regions.has(value)) {
      throw new AudiobookRetailPublicationVerificationError(
        "AUDIOBOOK_RETAIL_PUBLICATION_REQUIRED_REGIONS_INVALID",
      );
    }
    regions.add(value);
  }
  return Object.freeze(
    [...regions].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

export function createAudiobookRetailPublicListingObservation(input: Readonly<{
  id: string;
  projectId: string;
  bookId: string;
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
}>): AudiobookRetailPublicListingObservation {
  if (input.humanObservationConfirmed !== true) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_HUMAN_OBSERVATION_REQUIRED",
    );
  }
  const now = input.now ?? new Date();
  const observedAt = Date.parse(requireDate(
    input.observedAt,
    "AUDIOBOOK_RETAIL_PUBLICATION_OBSERVATION_DATE_INVALID",
  ));
  const expiresAt = Date.parse(requireDate(
    input.expiresAt,
    "AUDIOBOOK_RETAIL_PUBLICATION_OBSERVATION_EXPIRY_INVALID",
  ));
  if (
    Number.isNaN(now.getTime())
    || observedAt > now.getTime()
    || expiresAt <= now.getTime()
    || expiresAt <= observedAt
    || expiresAt - observedAt > MAXIMUM_OBSERVATION_LIFETIME_MS
  ) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_OBSERVATION_NOT_CURRENT",
    );
  }
  if (!ASIN_PATTERN.test(input.audiobookAsin) || !ASIN_PATTERN.test(input.ebookAsin)) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ASIN_INVALID",
    );
  }
  if (!LANGUAGE_TAG.test(input.languageTag)) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_LANGUAGE_INVALID",
    );
  }
  const partial: Omit<
    AudiobookRetailPublicListingObservation,
    "fingerprint"
  > = {
    schemaVersion: AUDIOBOOK_RETAIL_PUBLIC_LISTING_OBSERVATION_SCHEMA_VERSION,
    id: requireIdentifier(input.id, "AUDIOBOOK_RETAIL_PUBLICATION_OBSERVATION_ID_INVALID"),
    projectId: requireIdentifier(
      input.projectId,
      "AUDIOBOOK_RETAIL_PUBLICATION_PROJECT_ID_INVALID",
    ),
    bookId: requireIdentifier(
      input.bookId,
      "AUDIOBOOK_RETAIL_PUBLICATION_BOOK_ID_INVALID",
    ),
    distributor: "acx-audible",
    marketplace: "audible",
    audiobookAsin: input.audiobookAsin,
    publicProductReferenceHash: requireHash(
      input.publicProductReferenceHash,
      "AUDIOBOOK_RETAIL_PUBLICATION_PRODUCT_REFERENCE_HASH_INVALID",
    ),
    sampleReferenceHash: requireHash(
      input.sampleReferenceHash,
      "AUDIOBOOK_RETAIL_PUBLICATION_SAMPLE_REFERENCE_HASH_INVALID",
    ),
    coverReferenceHash: requireHash(
      input.coverReferenceHash,
      "AUDIOBOOK_RETAIL_PUBLICATION_COVER_REFERENCE_HASH_INVALID",
    ),
    displayTitle: requireText(
      input.displayTitle,
      MAXIMUM_TEXT_LENGTH,
      "AUDIOBOOK_RETAIL_PUBLICATION_TITLE_INVALID",
    ),
    authorCredit: requireText(
      input.authorCredit,
      MAXIMUM_TEXT_LENGTH,
      "AUDIOBOOK_RETAIL_PUBLICATION_AUTHOR_INVALID",
    ),
    narratorCredit: requireText(
      input.narratorCredit,
      MAXIMUM_TEXT_LENGTH,
      "AUDIOBOOK_RETAIL_PUBLICATION_NARRATOR_INVALID",
    ),
    publisherName: requireText(
      input.publisherName,
      MAXIMUM_TEXT_LENGTH,
      "AUDIOBOOK_RETAIL_PUBLICATION_PUBLISHER_INVALID",
    ),
    languageTag: input.languageTag,
    description: requireText(
      input.description,
      MAXIMUM_TEXT_LENGTH,
      "AUDIOBOOK_RETAIL_PUBLICATION_DESCRIPTION_INVALID",
    ),
    coverIdentityMatched: input.coverIdentityMatched,
    ebookAsin: input.ebookAsin,
    ebookAssociationMatched: input.ebookAssociationMatched,
    regions: normaliseRegions(input.regions),
    observedByActorId: requireHumanActor(
      input.observedByActorId,
      "AUDIOBOOK_RETAIL_PUBLICATION_OBSERVER_INVALID",
    ),
    humanObservationConfirmed: true,
    observedAt: input.observedAt,
    expiresAt: input.expiresAt,
    status: "observed-public-listing",
  };
  const observation = Object.freeze({
    ...partial,
    fingerprint: observationFingerprint(partial),
  });
  assertAudiobookRetailPublicListingObservation(observation, now);
  return observation;
}

export function assertAudiobookRetailPublicListingObservation(
  observation: AudiobookRetailPublicListingObservation,
  now = new Date(),
): void {
  if (
    observation.schemaVersion
      !== AUDIOBOOK_RETAIL_PUBLIC_LISTING_OBSERVATION_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_OBSERVATION_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [observation.id, "AUDIOBOOK_RETAIL_PUBLICATION_OBSERVATION_ID_INVALID"],
    [observation.projectId, "AUDIOBOOK_RETAIL_PUBLICATION_PROJECT_ID_INVALID"],
    [observation.bookId, "AUDIOBOOK_RETAIL_PUBLICATION_BOOK_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  for (const [value, code] of [
    [observation.publicProductReferenceHash, "AUDIOBOOK_RETAIL_PUBLICATION_PRODUCT_REFERENCE_HASH_INVALID"],
    [observation.sampleReferenceHash, "AUDIOBOOK_RETAIL_PUBLICATION_SAMPLE_REFERENCE_HASH_INVALID"],
    [observation.coverReferenceHash, "AUDIOBOOK_RETAIL_PUBLICATION_COVER_REFERENCE_HASH_INVALID"],
  ] as const) requireHash(value, code);
  if (!ASIN_PATTERN.test(observation.audiobookAsin) || !ASIN_PATTERN.test(observation.ebookAsin)) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ASIN_INVALID",
    );
  }
  if (!LANGUAGE_TAG.test(observation.languageTag)) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_LANGUAGE_INVALID",
    );
  }
  for (const [value, code] of [
    [observation.displayTitle, "AUDIOBOOK_RETAIL_PUBLICATION_TITLE_INVALID"],
    [observation.authorCredit, "AUDIOBOOK_RETAIL_PUBLICATION_AUTHOR_INVALID"],
    [observation.narratorCredit, "AUDIOBOOK_RETAIL_PUBLICATION_NARRATOR_INVALID"],
    [observation.publisherName, "AUDIOBOOK_RETAIL_PUBLICATION_PUBLISHER_INVALID"],
    [observation.description, "AUDIOBOOK_RETAIL_PUBLICATION_DESCRIPTION_INVALID"],
  ] as const) requireText(value, MAXIMUM_TEXT_LENGTH, code);
  const normalisedRegions = normaliseRegions(observation.regions);
  if (stableHash(normalisedRegions) !== stableHash(observation.regions)) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_REGIONS_INVALID",
    );
  }
  requireHumanActor(
    observation.observedByActorId,
    "AUDIOBOOK_RETAIL_PUBLICATION_OBSERVER_INVALID",
  );
  const observedAt = Date.parse(requireDate(
    observation.observedAt,
    "AUDIOBOOK_RETAIL_PUBLICATION_OBSERVATION_DATE_INVALID",
  ));
  const expiresAt = Date.parse(requireDate(
    observation.expiresAt,
    "AUDIOBOOK_RETAIL_PUBLICATION_OBSERVATION_EXPIRY_INVALID",
  ));
  if (
    Number.isNaN(now.getTime())
    || observation.distributor !== "acx-audible"
    || observation.marketplace !== "audible"
    || observation.humanObservationConfirmed !== true
    || observation.status !== "observed-public-listing"
    || observedAt > now.getTime()
    || expiresAt <= now.getTime()
    || expiresAt <= observedAt
    || expiresAt - observedAt > MAXIMUM_OBSERVATION_LIFETIME_MS
  ) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_OBSERVATION_NOT_CURRENT",
    );
  }
  const { fingerprint, ...partial } = observation;
  if (observationFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_OBSERVATION_FINGERPRINT_INVALID",
    );
  }
}

function sourceScope(
  sources: AudiobookRetailPublicationVerificationSources,
  now: Date,
): void {
  assertAudiobookRetailListingIdentity(sources.listingIdentity);
  assertAudiobookRetailerStatusEvidence(sources.retailerStatus);
  assertAudiobookRetailPublicListingObservation(sources.observation, now);
  if (
    sources.listingIdentity.status !== "approved-for-publication-verification"
    || !sources.listingIdentity.approval
    || sources.listingIdentity.approval.publicationVerificationEligible !== true
  ) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_APPROVED_LISTING_REQUIRED",
    );
  }
  if (
    sources.retailerStatus.normalisedStatus !== "accepted-awaiting-publication"
    || sources.retailerStatus.retailerAcceptanceConfirmed !== true
    || sources.retailerStatus.publicationConfirmed !== false
    || sources.retailerStatus.liveConfirmed !== false
  ) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ACCEPTED_STATUS_REQUIRED",
    );
  }
  if (
    sources.listingIdentity.projectId !== sources.retailerStatus.projectId
    || sources.listingIdentity.projectId !== sources.observation.projectId
    || sources.listingIdentity.bookId !== sources.retailerStatus.bookId
    || sources.listingIdentity.bookId !== sources.observation.bookId
    || sources.listingIdentity.distributor !== sources.retailerStatus.distributor
    || sources.listingIdentity.distributor !== sources.observation.distributor
    || Date.parse(sources.observation.observedAt)
      < Date.parse(sources.retailerStatus.observedAt)
  ) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_SOURCE_SCOPE_MISMATCH",
    );
  }
}

function findingCodes(input: Readonly<{
  identity: AudiobookRetailListingIdentity;
  observation: AudiobookRetailPublicListingObservation;
  requiredRegions: readonly string[];
}>): readonly string[] {
  const findings = new Set<string>();
  if (input.observation.displayTitle !== input.identity.metadata.displayTitle) {
    findings.add("AUDIOBOOK_RETAIL_PUBLICATION_TITLE_MISMATCH");
  }
  if (input.observation.authorCredit !== input.identity.metadata.authorCredit) {
    findings.add("AUDIOBOOK_RETAIL_PUBLICATION_AUTHOR_MISMATCH");
  }
  if (input.observation.narratorCredit !== input.identity.metadata.narratorCredit) {
    findings.add("AUDIOBOOK_RETAIL_PUBLICATION_NARRATOR_MISMATCH");
  }
  if (input.observation.publisherName !== input.identity.metadata.publisherName) {
    findings.add("AUDIOBOOK_RETAIL_PUBLICATION_PUBLISHER_MISMATCH");
  }
  if (input.observation.languageTag !== input.identity.metadata.languageTag) {
    findings.add("AUDIOBOOK_RETAIL_PUBLICATION_LANGUAGE_MISMATCH");
  }
  if (input.observation.description !== input.identity.metadata.description) {
    findings.add("AUDIOBOOK_RETAIL_PUBLICATION_DESCRIPTION_MISMATCH");
  }
  if (!input.observation.coverIdentityMatched) {
    findings.add("AUDIOBOOK_RETAIL_PUBLICATION_COVER_MISMATCH");
  }
  if (
    !input.observation.ebookAssociationMatched
    || input.observation.ebookAsin !== input.identity.ebook.asin
  ) {
    findings.add("AUDIOBOOK_RETAIL_PUBLICATION_EBOOK_MISMATCH");
  }
  const byRegion = new Map(
    input.observation.regions.map((region) => [region.regionCode, region]),
  );
  for (const regionCode of input.requiredRegions) {
    const region = byRegion.get(regionCode);
    if (!region) {
      findings.add(`AUDIOBOOK_RETAIL_PUBLICATION_REGION_${regionCode}_MISSING`);
      continue;
    }
    if (!region.productPageAccessible) {
      findings.add(`AUDIOBOOK_RETAIL_PUBLICATION_REGION_${regionCode}_PAGE_UNAVAILABLE`);
    }
    if (!region.purchaseAvailable) {
      findings.add(`AUDIOBOOK_RETAIL_PUBLICATION_REGION_${regionCode}_PURCHASE_UNAVAILABLE`);
    }
    if (!region.sampleAvailable) {
      findings.add(`AUDIOBOOK_RETAIL_PUBLICATION_REGION_${regionCode}_SAMPLE_UNAVAILABLE`);
    } else if (!region.samplePlaybackSuccessful) {
      findings.add(`AUDIOBOOK_RETAIL_PUBLICATION_REGION_${regionCode}_SAMPLE_PLAYBACK_FAILED`);
    }
  }
  const sorted = [...findings].sort((left, right) =>
    left.localeCompare(right, "en-AU")
  );
  if (
    sorted.length > MAXIMUM_FINDING_CODES
    || sorted.some((code) => !FINDING_CODE_PATTERN.test(code))
  ) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_FINDINGS_INVALID",
    );
  }
  return Object.freeze(sorted);
}

function metadataMatches(
  identity: AudiobookRetailListingIdentity,
  observation: AudiobookRetailPublicListingObservation,
): AudiobookRetailPublicationVerification["metadataMatches"] {
  return Object.freeze({
    displayTitle: observation.displayTitle === identity.metadata.displayTitle,
    authorCredit: observation.authorCredit === identity.metadata.authorCredit,
    narratorCredit: observation.narratorCredit === identity.metadata.narratorCredit,
    publisherName: observation.publisherName === identity.metadata.publisherName,
    languageTag: observation.languageTag === identity.metadata.languageTag,
    description: observation.description === identity.metadata.description,
  });
}

function deriveState(input: Readonly<{
  metadataMatches: AudiobookRetailPublicationVerification["metadataMatches"];
  observation: AudiobookRetailPublicListingObservation;
  requiredRegions: readonly string[];
}>): Readonly<{
  publicationConfirmed: boolean;
  liveConfirmed: boolean;
  purchaseConfirmed: boolean;
  samplePlaybackConfirmed: boolean;
  status: AudiobookRetailPublicationVerificationStatus;
}> {
  const byRegion = new Map(
    input.observation.regions.map((region) => [region.regionCode, region]),
  );
  const required = input.requiredRegions.map((region) => byRegion.get(region));
  const accessibleCount = required.filter(
    (region) => region?.productPageAccessible === true,
  ).length;
  const metadataAll = Object.values(input.metadataMatches).every(Boolean)
    && input.observation.coverIdentityMatched
    && input.observation.ebookAssociationMatched;
  const purchaseConfirmed = required.every(
    (region) => region?.purchaseAvailable === true,
  );
  const samplePlaybackConfirmed = required.every(
    (region) => region?.sampleAvailable === true
      && region.samplePlaybackSuccessful === true,
  );
  if (accessibleCount === 0) {
    return Object.freeze({
      publicationConfirmed: false,
      liveConfirmed: false,
      purchaseConfirmed: false,
      samplePlaybackConfirmed: false,
      status: "not-yet-published",
    });
  }
  if (!metadataAll) {
    return Object.freeze({
      publicationConfirmed: true,
      liveConfirmed: false,
      purchaseConfirmed,
      samplePlaybackConfirmed,
      status: "publication-mismatch",
    });
  }
  if (
    accessibleCount !== input.requiredRegions.length
    || !purchaseConfirmed
    || !samplePlaybackConfirmed
  ) {
    return Object.freeze({
      publicationConfirmed: true,
      liveConfirmed: false,
      purchaseConfirmed,
      samplePlaybackConfirmed,
      status: "published-but-unavailable",
    });
  }
  return Object.freeze({
    publicationConfirmed: true,
    liveConfirmed: true,
    purchaseConfirmed: true,
    samplePlaybackConfirmed: true,
    status: "published-and-live",
  });
}

export function verifyAudiobookRetailPublication(input: Readonly<{
  id: string;
  sources: AudiobookRetailPublicationVerificationSources;
  requiredRegions: readonly string[];
  verifiedByActorId: string;
  humanVerificationConfirmed: true;
  verifiedAt?: Date;
}>): AudiobookRetailPublicationVerification {
  if (input.humanVerificationConfirmed !== true) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_HUMAN_VERIFICATION_REQUIRED",
    );
  }
  const verifiedAt = input.verifiedAt ?? new Date();
  if (Number.isNaN(verifiedAt.getTime())) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_VERIFICATION_DATE_INVALID",
    );
  }
  sourceScope(input.sources, verifiedAt);
  const requiredRegions = normaliseRequiredRegions(input.requiredRegions);
  const verifiedByActorId = requireHumanActor(
    input.verifiedByActorId,
    "AUDIOBOOK_RETAIL_PUBLICATION_VERIFIER_INVALID",
  );
  const excludedActors = new Set([
    input.sources.observation.observedByActorId,
    input.sources.retailerStatus.observedByActorId,
    input.sources.listingIdentity.approval!.approvedByActorId,
  ]);
  if (excludedActors.has(verifiedByActorId)) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_INDEPENDENT_VERIFIER_REQUIRED",
    );
  }
  if (verifiedAt.getTime() < Date.parse(input.sources.observation.observedAt)) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_VERIFICATION_DATE_INVALID",
    );
  }
  const matches = metadataMatches(
    input.sources.listingIdentity,
    input.sources.observation,
  );
  const state = deriveState({
    metadataMatches: matches,
    observation: input.sources.observation,
    requiredRegions,
  });
  const findings = findingCodes({
    identity: input.sources.listingIdentity,
    observation: input.sources.observation,
    requiredRegions,
  });
  if (state.status === "published-and-live" && findings.length !== 0) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_LIVE_WITH_FINDINGS_INVALID",
    );
  }
  const identity = input.sources.listingIdentity;
  const retailerStatus = input.sources.retailerStatus;
  const observation = input.sources.observation;
  const partial: Omit<
    AudiobookRetailPublicationVerification,
    "fingerprint"
  > = {
    schemaVersion: AUDIOBOOK_RETAIL_PUBLICATION_VERIFICATION_SCHEMA_VERSION,
    id: requireIdentifier(input.id, "AUDIOBOOK_RETAIL_PUBLICATION_ID_INVALID"),
    projectId: identity.projectId,
    bookId: identity.bookId,
    packageId: retailerStatus.packageId,
    distributor: "acx-audible",
    marketplace: "audible",
    listingIdentity: Object.freeze({
      id: identity.id,
      revision: identity.revision,
      fingerprint: identity.fingerprint,
      approvalFingerprint: identity.approval!.fingerprint,
    }),
    retailerStatus: Object.freeze({
      id: retailerStatus.id,
      revision: 1,
      fingerprint: retailerStatus.fingerprint,
      normalisedStatus: "accepted-awaiting-publication",
      observedAt: retailerStatus.observedAt,
    }),
    observation: Object.freeze({
      id: observation.id,
      fingerprint: observation.fingerprint,
      audiobookAsin: observation.audiobookAsin,
      publicProductReferenceHash: observation.publicProductReferenceHash,
      observedAt: observation.observedAt,
      expiresAt: observation.expiresAt,
    }),
    requiredRegions,
    observedRegions: observation.regions,
    metadataMatches: matches,
    coverIdentityMatched: observation.coverIdentityMatched,
    ebookAssociationMatched:
      observation.ebookAssociationMatched
      && observation.ebookAsin === identity.ebook.asin,
    retailerAcceptanceConfirmed: true,
    publicationConfirmed: state.publicationConfirmed,
    liveConfirmed: state.liveConfirmed,
    purchaseConfirmed: state.purchaseConfirmed,
    samplePlaybackConfirmed: state.samplePlaybackConfirmed,
    findingCodes: findings,
    verifiedByActorId,
    humanVerificationConfirmed: true,
    verifiedAt: verifiedAt.toISOString(),
    status: state.status,
    revision: 1,
  };
  const verification = Object.freeze({
    ...partial,
    fingerprint: verificationFingerprint(partial),
  });
  assertAudiobookRetailPublicationVerification(verification);
  assertAudiobookRetailPublicationVerificationMatchesSources(
    verification,
    input.sources,
    verifiedAt,
  );
  return verification;
}

function assertRegion(region: AudiobookRetailPublicRegionObservation): void {
  const normalised = normaliseRegion(region);
  if (normalised.fingerprint !== region.fingerprint) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_REGION_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailPublicationVerification(
  verification: AudiobookRetailPublicationVerification,
): void {
  if (
    verification.schemaVersion
      !== AUDIOBOOK_RETAIL_PUBLICATION_VERIFICATION_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [verification.id, "AUDIOBOOK_RETAIL_PUBLICATION_ID_INVALID"],
    [verification.projectId, "AUDIOBOOK_RETAIL_PUBLICATION_PROJECT_ID_INVALID"],
    [verification.bookId, "AUDIOBOOK_RETAIL_PUBLICATION_BOOK_ID_INVALID"],
    [verification.packageId, "AUDIOBOOK_RETAIL_PUBLICATION_PACKAGE_ID_INVALID"],
    [verification.listingIdentity.id, "AUDIOBOOK_RETAIL_PUBLICATION_LISTING_ID_INVALID"],
    [verification.retailerStatus.id, "AUDIOBOOK_RETAIL_PUBLICATION_RETAILER_STATUS_ID_INVALID"],
    [verification.observation.id, "AUDIOBOOK_RETAIL_PUBLICATION_OBSERVATION_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  for (const [value, code] of [
    [verification.listingIdentity.fingerprint, "AUDIOBOOK_RETAIL_PUBLICATION_LISTING_HASH_INVALID"],
    [verification.listingIdentity.approvalFingerprint, "AUDIOBOOK_RETAIL_PUBLICATION_LISTING_APPROVAL_HASH_INVALID"],
    [verification.retailerStatus.fingerprint, "AUDIOBOOK_RETAIL_PUBLICATION_RETAILER_STATUS_HASH_INVALID"],
    [verification.observation.fingerprint, "AUDIOBOOK_RETAIL_PUBLICATION_OBSERVATION_HASH_INVALID"],
    [verification.observation.publicProductReferenceHash, "AUDIOBOOK_RETAIL_PUBLICATION_PRODUCT_REFERENCE_HASH_INVALID"],
  ] as const) requireHash(value, code);
  if (!ASIN_PATTERN.test(verification.observation.audiobookAsin)) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_ASIN_INVALID",
    );
  }
  if (
    verification.distributor !== "acx-audible"
    || verification.marketplace !== "audible"
    || verification.retailerStatus.normalisedStatus
      !== "accepted-awaiting-publication"
    || verification.retailerAcceptanceConfirmed !== true
    || verification.humanVerificationConfirmed !== true
    || verification.revision !== 1
  ) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_STATE_INVALID",
    );
  }
  requireDate(
    verification.retailerStatus.observedAt,
    "AUDIOBOOK_RETAIL_PUBLICATION_RETAILER_DATE_INVALID",
  );
  requireDate(
    verification.observation.observedAt,
    "AUDIOBOOK_RETAIL_PUBLICATION_OBSERVATION_DATE_INVALID",
  );
  requireDate(
    verification.observation.expiresAt,
    "AUDIOBOOK_RETAIL_PUBLICATION_OBSERVATION_EXPIRY_INVALID",
  );
  const requiredRegions = normaliseRequiredRegions(verification.requiredRegions);
  if (stableHash(requiredRegions) !== stableHash(verification.requiredRegions)) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_REQUIRED_REGIONS_INVALID",
    );
  }
  const normalisedObserved = normaliseRegions(verification.observedRegions);
  if (stableHash(normalisedObserved) !== stableHash(verification.observedRegions)) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_REGIONS_INVALID",
    );
  }
  for (const region of verification.observedRegions) assertRegion(region);
  if (
    Object.values(verification.metadataMatches).some(
      (value) => typeof value !== "boolean",
    )
  ) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_METADATA_MATCH_STATE_INVALID",
    );
  }
  if (
    !Array.isArray(verification.findingCodes)
    || verification.findingCodes.length > MAXIMUM_FINDING_CODES
    || new Set(verification.findingCodes).size !== verification.findingCodes.length
    || verification.findingCodes.some((code) => !FINDING_CODE_PATTERN.test(code))
  ) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_FINDINGS_INVALID",
    );
  }
  if (
    verification.status === "published-and-live"
    && (
      !verification.publicationConfirmed
      || !verification.liveConfirmed
      || !verification.purchaseConfirmed
      || !verification.samplePlaybackConfirmed
      || verification.findingCodes.length !== 0
    )
  ) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_LIVE_STATE_INVALID",
    );
  }
  if (
    verification.status !== "published-and-live"
    && verification.liveConfirmed
  ) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_FALSE_LIVE_CLAIM",
    );
  }
  requireHumanActor(
    verification.verifiedByActorId,
    "AUDIOBOOK_RETAIL_PUBLICATION_VERIFIER_INVALID",
  );
  requireDate(
    verification.verifiedAt,
    "AUDIOBOOK_RETAIL_PUBLICATION_VERIFICATION_DATE_INVALID",
  );
  const { fingerprint, ...partial } = verification;
  if (verificationFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailPublicationVerificationMatchesSources(
  verification: AudiobookRetailPublicationVerification,
  sources: AudiobookRetailPublicationVerificationSources,
  now = new Date(verification.verifiedAt),
): void {
  assertAudiobookRetailPublicationVerification(verification);
  sourceScope(sources, now);
  const matches = metadataMatches(sources.listingIdentity, sources.observation);
  const state = deriveState({
    metadataMatches: matches,
    observation: sources.observation,
    requiredRegions: verification.requiredRegions,
  });
  const findings = findingCodes({
    identity: sources.listingIdentity,
    observation: sources.observation,
    requiredRegions: verification.requiredRegions,
  });
  if (
    verification.projectId !== sources.listingIdentity.projectId
    || verification.bookId !== sources.listingIdentity.bookId
    || verification.packageId !== sources.retailerStatus.packageId
    || verification.listingIdentity.id !== sources.listingIdentity.id
    || verification.listingIdentity.revision !== sources.listingIdentity.revision
    || verification.listingIdentity.fingerprint !== sources.listingIdentity.fingerprint
    || verification.listingIdentity.approvalFingerprint
      !== sources.listingIdentity.approval!.fingerprint
    || verification.retailerStatus.id !== sources.retailerStatus.id
    || verification.retailerStatus.fingerprint !== sources.retailerStatus.fingerprint
    || verification.retailerStatus.observedAt !== sources.retailerStatus.observedAt
    || verification.observation.id !== sources.observation.id
    || verification.observation.fingerprint !== sources.observation.fingerprint
    || verification.observation.audiobookAsin !== sources.observation.audiobookAsin
    || verification.observation.publicProductReferenceHash
      !== sources.observation.publicProductReferenceHash
    || verification.observation.observedAt !== sources.observation.observedAt
    || verification.observation.expiresAt !== sources.observation.expiresAt
    || stableHash(verification.observedRegions) !== stableHash(sources.observation.regions)
    || stableHash(verification.metadataMatches) !== stableHash(matches)
    || verification.coverIdentityMatched !== sources.observation.coverIdentityMatched
    || verification.ebookAssociationMatched
      !== (
        sources.observation.ebookAssociationMatched
        && sources.observation.ebookAsin === sources.listingIdentity.ebook.asin
      )
    || verification.publicationConfirmed !== state.publicationConfirmed
    || verification.liveConfirmed !== state.liveConfirmed
    || verification.purchaseConfirmed !== state.purchaseConfirmed
    || verification.samplePlaybackConfirmed !== state.samplePlaybackConfirmed
    || verification.status !== state.status
    || stableHash(verification.findingCodes) !== stableHash(findings)
  ) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_SOURCE_MISMATCH",
    );
  }
}

export function audiobookRetailPublicationVerificationPublicView(
  verification: AudiobookRetailPublicationVerification,
  observation: AudiobookRetailPublicListingObservation,
): AudiobookRetailPublicationVerificationPublicView {
  assertAudiobookRetailPublicationVerification(verification);
  assertAudiobookRetailPublicListingObservation(
    observation,
    new Date(verification.verifiedAt),
  );
  if (
    verification.observation.id !== observation.id
    || verification.observation.fingerprint !== observation.fingerprint
  ) {
    throw new AudiobookRetailPublicationVerificationError(
      "AUDIOBOOK_RETAIL_PUBLICATION_PUBLIC_VIEW_SOURCE_MISMATCH",
    );
  }
  return Object.freeze({
    id: verification.id,
    bookId: verification.bookId,
    distributor: "acx-audible",
    marketplace: "audible",
    audiobookAsin: observation.audiobookAsin,
    displayTitle: observation.displayTitle,
    authorCredit: observation.authorCredit,
    narratorCredit: observation.narratorCredit,
    publisherName: observation.publisherName,
    languageTag: observation.languageTag,
    description: observation.description,
    requiredRegions: verification.requiredRegions,
    regions: Object.freeze(verification.observedRegions.map((region) =>
      Object.freeze({
        regionCode: region.regionCode,
        productPageAccessible: region.productPageAccessible,
        purchaseAvailable: region.purchaseAvailable,
        sampleAvailable: region.sampleAvailable,
        samplePlaybackSuccessful: region.samplePlaybackSuccessful,
      })
    )),
    retailerAcceptanceConfirmed: true,
    publicationConfirmed: verification.publicationConfirmed,
    liveConfirmed: verification.liveConfirmed,
    purchaseConfirmed: verification.purchaseConfirmed,
    samplePlaybackConfirmed: verification.samplePlaybackConfirmed,
    findingCodes: verification.findingCodes,
    observedAt: verification.observation.observedAt,
    verifiedAt: verification.verifiedAt,
    status: verification.status,
    revision: 1,
    fingerprint: verification.fingerprint,
  });
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<AudiobookRetailPublicationVerification> {
  const verification = envelope.payload
    as unknown as AudiobookRetailPublicationVerification;
  assertAudiobookRetailPublicationVerification(verification);
  if (
    envelope.entityType !== AUDIOBOOK_RETAIL_PUBLICATION_VERIFICATION_ENTITY_TYPE
    || envelope.entityId !== verification.id
    || envelope.revision !== 1
  ) {
    throw new AudiobookRetailPublicationVerificationStoreConflictError(
      "AUDIOBOOK_RETAIL_PUBLICATION_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope
    as unknown as StoredEnvelope<AudiobookRetailPublicationVerification>;
}

export class FileAudiobookRetailPublicationVerificationStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    verification: AudiobookRetailPublicationVerification,
    actorId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPublicationVerification>> {
    assertAudiobookRetailPublicationVerification(verification);
    requireIdentifier(
      actorId,
      "AUDIOBOOK_RETAIL_PUBLICATION_STORE_ACTOR_INVALID",
    );
    const existing = await this.read(verification.id);
    if (existing) {
      if (existing.payload.fingerprint === verification.fingerprint) return existing;
      throw new AudiobookRetailPublicationVerificationStoreConflictError(
        "AUDIOBOOK_RETAIL_PUBLICATION_STORE_IDEMPOTENCY_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.create(
        AUDIOBOOK_RETAIL_PUBLICATION_VERIFICATION_ENTITY_TYPE,
        verification.id,
        verification as unknown as Record<string, unknown>,
        new Date(verification.verifiedAt),
      ));
      await this.#store.appendAuditEvent({
        actorId,
        action: "audiobook_retail_publication_verification.created",
        entityType: AUDIOBOOK_RETAIL_PUBLICATION_VERIFICATION_ENTITY_TYPE,
        entityId: verification.id,
        revision: 1,
        occurredAt: new Date(verification.verifiedAt),
        metadata: {
          status: verification.status,
          requiredRegionCount: verification.requiredRegions.length,
          observedRegionCount: verification.observedRegions.length,
          findingCount: verification.findingCodes.length,
          retailerAcceptanceConfirmed: true,
          publicationConfirmed: verification.publicationConfirmed,
          liveConfirmed: verification.liveConfirmed,
          purchaseConfirmed: verification.purchaseConfirmed,
          samplePlaybackConfirmed: verification.samplePlaybackConfirmed,
        },
      });
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailPublicationVerificationStoreConflictError(
          error.message,
        );
      }
      throw error;
    }
  }

  async read(
    verificationId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPublicationVerification> | null> {
    requireIdentifier(
      verificationId,
      "AUDIOBOOK_RETAIL_PUBLICATION_STORE_ID_INVALID",
    );
    const envelope = await this.#store.read<Record<string, unknown>>(
      AUDIOBOOK_RETAIL_PUBLICATION_VERIFICATION_ENTITY_TYPE,
      verificationId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(
    verificationId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPublicationVerification>> {
    const envelope = await this.read(verificationId);
    if (!envelope) {
      throw new AudiobookRetailPublicationVerificationStoreConflictError(
        "AUDIOBOOK_RETAIL_PUBLICATION_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }
}
