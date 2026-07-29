import {
  assertArtifactRecord,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import { stableHash } from "./index.js";

export const AUDIOBOOK_RETAIL_LISTING_POLICY_SCHEMA_VERSION =
  "storyteller-audiobook-retail-listing-policy-v1" as const;
export const AUDIOBOOK_RETAIL_EBOOK_AVAILABILITY_SCHEMA_VERSION =
  "storyteller-audiobook-retail-ebook-availability-v1" as const;
export const AUDIOBOOK_RETAIL_COVER_EVIDENCE_SCHEMA_VERSION =
  "storyteller-audiobook-retail-cover-evidence-v1" as const;

export type AudiobookRetailCoverFormat = "jpeg" | "png" | "tiff";

export interface AudiobookRetailListingPolicy {
  schemaVersion: typeof AUDIOBOOK_RETAIL_LISTING_POLICY_SCHEMA_VERSION;
  id: string;
  distributor: "acx-audible";
  externalVersion: string;
  reviewedAt: string;
  expiresAt: string;
  sourceReference: string;
  metadata: Readonly<{
    maximumDescriptionCharacters: 2_000;
    titleAuthorNarratorMustMatchSpokenCredits: true;
    coverTitleAuthorMustMatchMetadata: true;
    ebookMustRemainAvailable: true;
    languageRequired: true;
  }>;
  cover: Readonly<{
    allowedFormats: readonly ["jpeg", "png", "tiff"];
    minimumWidthPx: 2_400;
    minimumHeightPx: 2_400;
    aspectRatio: "1:1";
    minimumDpi: 72;
    minimumBitDepth: 24;
    colorSpace: "rgb";
    maximumByteCount: 8_388_608;
    titleRequired: true;
    authorRequired: true;
    prohibitedElementsAbsent: true;
  }>;
  fingerprint: string;
}

export interface AudiobookRetailListingPolicyPublicView {
  id: string;
  distributor: "acx-audible";
  externalVersion: string;
  reviewedAt: string;
  expiresAt: string;
  current: boolean;
  maximumDescriptionCharacters: 2_000;
  cover: AudiobookRetailListingPolicy["cover"];
  fingerprint: string;
}

export interface AudiobookRetailEbookAvailabilityEvidence {
  schemaVersion: typeof AUDIOBOOK_RETAIL_EBOOK_AVAILABILITY_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  marketplace: "amazon";
  asin: string;
  productReferenceHash: string;
  available: true;
  observedByActorId: string;
  observedAt: string;
  expiresAt: string;
  status: "current";
  fingerprint: string;
}

export interface AudiobookRetailEbookAvailabilityPublicView {
  id: string;
  bookId: string;
  marketplace: "amazon";
  asin: string;
  available: true;
  observedAt: string;
  expiresAt: string;
  current: boolean;
  fingerprint: string;
}

export interface AudiobookRetailCoverEvidence {
  schemaVersion: typeof AUDIOBOOK_RETAIL_COVER_EVIDENCE_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  distributor: "acx-audible";
  policyFingerprint: string;
  artifact: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
    contentHash: string;
    byteCount: number;
    rightsFingerprint: string;
  }>;
  format: AudiobookRetailCoverFormat;
  widthPx: number;
  heightPx: number;
  dpi: number;
  bitDepth: number;
  colorSpace: "rgb";
  titleText: string;
  authorText: string;
  titleAuthorMatchConfirmed: true;
  prohibitedElementsAbsent: true;
  checks: readonly string[];
  observedByActorId: string;
  observedAt: string;
  status: "verified";
  fingerprint: string;
}

export interface AudiobookRetailCoverEvidencePublicView {
  id: string;
  bookId: string;
  format: AudiobookRetailCoverFormat;
  widthPx: number;
  heightPx: number;
  dpi: number;
  bitDepth: number;
  colorSpace: "rgb";
  titleText: string;
  authorText: string;
  titleAuthorMatchConfirmed: true;
  prohibitedElementsAbsent: true;
  observedAt: string;
  status: "verified";
  fingerprint: string;
}

export class AudiobookRetailListingPolicyError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailListingPolicyError";
    this.code = code;
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const ASIN_PATTERN = /^[A-Z0-9]{10}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const HUMAN_BLOCKLIST = /^(?:system|worker|automation|automated|bot)(?:[_-]|$)/iu;
const MAXIMUM_POLICY_LIFETIME_MS = 366 * 24 * 60 * 60 * 1_000;
const MAXIMUM_EBOOK_EVIDENCE_LIFETIME_MS = 31 * 24 * 60 * 60 * 1_000;
const MAXIMUM_SOURCE_REFERENCE_LENGTH = 1_000;
const MAXIMUM_TEXT_LENGTH = 1_000;
const REQUIRED_COVER_CHECKS = Object.freeze([
  "dimensions-confirmed",
  "square-aspect-confirmed",
  "rgb-confirmed",
  "bit-depth-confirmed",
  "dpi-confirmed",
  "title-text-confirmed",
  "author-text-confirmed",
  "prohibited-elements-absent",
] as const);
const CANONICAL_METADATA_POLICY = Object.freeze({
  maximumDescriptionCharacters: 2_000,
  titleAuthorNarratorMustMatchSpokenCredits: true,
  coverTitleAuthorMustMatchMetadata: true,
  ebookMustRemainAvailable: true,
  languageRequired: true,
} as const);
const CANONICAL_COVER_POLICY = Object.freeze({
  allowedFormats: Object.freeze(["jpeg", "png", "tiff"] as const),
  minimumWidthPx: 2_400,
  minimumHeightPx: 2_400,
  aspectRatio: "1:1",
  minimumDpi: 72,
  minimumBitDepth: 24,
  colorSpace: "rgb",
  maximumByteCount: 8_388_608,
  titleRequired: true,
  authorRequired: true,
  prohibitedElementsAbsent: true,
} as const);

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailListingPolicyError(code);
  }
  return value;
}

function requireVersion(value: string, code: string): string {
  if (!SAFE_VERSION.test(value)) {
    throw new AudiobookRetailListingPolicyError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailListingPolicyError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailListingPolicyError(code);
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
    throw new AudiobookRetailListingPolicyError(code);
  }
  return trimmed;
}

function requireHumanActor(value: string, code: string): string {
  requireIdentifier(value, code);
  if (HUMAN_BLOCKLIST.test(value)) {
    throw new AudiobookRetailListingPolicyError(code);
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
    throw new AudiobookRetailListingPolicyError(code);
  }
  return value;
}

function policyFingerprint(
  value: Omit<AudiobookRetailListingPolicy, "fingerprint">,
): string {
  return stableHash(value);
}

function ebookFingerprint(
  value: Omit<AudiobookRetailEbookAvailabilityEvidence, "fingerprint">,
): string {
  return stableHash(value);
}

function coverFingerprint(
  value: Omit<AudiobookRetailCoverEvidence, "fingerprint">,
): string {
  return stableHash(value);
}

function assertChronology(input: Readonly<{
  reviewedAt: string;
  expiresAt: string;
  now?: Date;
}>): void {
  const reviewedAt = Date.parse(requireDate(
    input.reviewedAt,
    "AUDIOBOOK_RETAIL_LISTING_POLICY_REVIEW_DATE_INVALID",
  ));
  const expiresAt = Date.parse(requireDate(
    input.expiresAt,
    "AUDIOBOOK_RETAIL_LISTING_POLICY_EXPIRY_INVALID",
  ));
  const now = input.now;
  if (
    expiresAt <= reviewedAt
    || expiresAt - reviewedAt > MAXIMUM_POLICY_LIFETIME_MS
    || (
      now
      && (
        Number.isNaN(now.getTime())
        || reviewedAt > now.getTime()
        || expiresAt <= now.getTime()
      )
    )
  ) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_LISTING_POLICY_NOT_CURRENT",
    );
  }
}

export function createAcxAudibleRetailListingPolicy(input: Readonly<{
  id?: string;
  externalVersion: string;
  reviewedAt: string;
  expiresAt: string;
  sourceReference: string;
  now?: Date;
}>): AudiobookRetailListingPolicy {
  assertChronology({
    reviewedAt: input.reviewedAt,
    expiresAt: input.expiresAt,
    ...(input.now ? { now: input.now } : {}),
  });
  const externalVersion = requireVersion(
    input.externalVersion,
    "AUDIOBOOK_RETAIL_LISTING_POLICY_VERSION_INVALID",
  );
  const sourceReference = requireText(
    input.sourceReference,
    MAXIMUM_SOURCE_REFERENCE_LENGTH,
    "AUDIOBOOK_RETAIL_LISTING_POLICY_SOURCE_INVALID",
  );
  const derivedId = `retail_listing_policy_acx_${stableHash({
    externalVersion,
    reviewedAt: input.reviewedAt,
  }).slice(0, 24)}`;
  const partial: Omit<AudiobookRetailListingPolicy, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_LISTING_POLICY_SCHEMA_VERSION,
    id: requireIdentifier(
      input.id ?? derivedId,
      "AUDIOBOOK_RETAIL_LISTING_POLICY_ID_INVALID",
    ),
    distributor: "acx-audible",
    externalVersion,
    reviewedAt: input.reviewedAt,
    expiresAt: input.expiresAt,
    sourceReference,
    metadata: CANONICAL_METADATA_POLICY,
    cover: CANONICAL_COVER_POLICY,
  };
  const policy = Object.freeze({
    ...partial,
    fingerprint: policyFingerprint(partial),
  });
  assertAudiobookRetailListingPolicy(policy);
  return policy;
}

export function assertAudiobookRetailListingPolicy(
  policy: AudiobookRetailListingPolicy,
): void {
  if (policy.schemaVersion !== AUDIOBOOK_RETAIL_LISTING_POLICY_SCHEMA_VERSION) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_LISTING_POLICY_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(policy.id, "AUDIOBOOK_RETAIL_LISTING_POLICY_ID_INVALID");
  requireVersion(
    policy.externalVersion,
    "AUDIOBOOK_RETAIL_LISTING_POLICY_VERSION_INVALID",
  );
  if (policy.distributor !== "acx-audible") {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_LISTING_POLICY_DISTRIBUTOR_UNSUPPORTED",
    );
  }
  assertChronology({
    reviewedAt: policy.reviewedAt,
    expiresAt: policy.expiresAt,
  });
  requireText(
    policy.sourceReference,
    MAXIMUM_SOURCE_REFERENCE_LENGTH,
    "AUDIOBOOK_RETAIL_LISTING_POLICY_SOURCE_INVALID",
  );
  if (
    stableHash(policy.metadata) !== stableHash(CANONICAL_METADATA_POLICY)
    || stableHash(policy.cover) !== stableHash(CANONICAL_COVER_POLICY)
  ) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_LISTING_POLICY_REQUIREMENTS_INVALID",
    );
  }
  const { fingerprint, ...partial } = policy;
  if (policyFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_LISTING_POLICY_FINGERPRINT_INVALID",
    );
  }
}

export function assertCurrentAudiobookRetailListingPolicy(
  policy: AudiobookRetailListingPolicy,
  now = new Date(),
): void {
  assertAudiobookRetailListingPolicy(policy);
  assertChronology({
    reviewedAt: policy.reviewedAt,
    expiresAt: policy.expiresAt,
    now,
  });
}

export function audiobookRetailListingPolicyPublicView(
  policy: AudiobookRetailListingPolicy,
  now = new Date(),
): AudiobookRetailListingPolicyPublicView {
  assertAudiobookRetailListingPolicy(policy);
  if (Number.isNaN(now.getTime())) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_LISTING_POLICY_VIEW_DATE_INVALID",
    );
  }
  return Object.freeze({
    id: policy.id,
    distributor: policy.distributor,
    externalVersion: policy.externalVersion,
    reviewedAt: policy.reviewedAt,
    expiresAt: policy.expiresAt,
    current:
      Date.parse(policy.reviewedAt) <= now.getTime()
      && Date.parse(policy.expiresAt) > now.getTime(),
    maximumDescriptionCharacters: 2_000,
    cover: policy.cover,
    fingerprint: policy.fingerprint,
  });
}

export function createAudiobookRetailEbookAvailabilityEvidence(input: Readonly<{
  id: string;
  projectId: string;
  bookId: string;
  asin: string;
  productReferenceHash: string;
  observedByActorId: string;
  observedAt: string;
  expiresAt: string;
  now?: Date;
}>): AudiobookRetailEbookAvailabilityEvidence {
  const now = input.now ?? new Date();
  const observedAt = Date.parse(requireDate(
    input.observedAt,
    "AUDIOBOOK_RETAIL_EBOOK_OBSERVATION_DATE_INVALID",
  ));
  const expiresAt = Date.parse(requireDate(
    input.expiresAt,
    "AUDIOBOOK_RETAIL_EBOOK_EXPIRY_INVALID",
  ));
  if (
    Number.isNaN(now.getTime())
    || observedAt > now.getTime()
    || expiresAt <= now.getTime()
    || expiresAt <= observedAt
    || expiresAt - observedAt > MAXIMUM_EBOOK_EVIDENCE_LIFETIME_MS
  ) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_EBOOK_NOT_CURRENT",
    );
  }
  if (!ASIN_PATTERN.test(input.asin)) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_EBOOK_ASIN_INVALID",
    );
  }
  const partial: Omit<
    AudiobookRetailEbookAvailabilityEvidence,
    "fingerprint"
  > = {
    schemaVersion: AUDIOBOOK_RETAIL_EBOOK_AVAILABILITY_SCHEMA_VERSION,
    id: requireIdentifier(input.id, "AUDIOBOOK_RETAIL_EBOOK_ID_INVALID"),
    projectId: requireIdentifier(
      input.projectId,
      "AUDIOBOOK_RETAIL_EBOOK_PROJECT_ID_INVALID",
    ),
    bookId: requireIdentifier(
      input.bookId,
      "AUDIOBOOK_RETAIL_EBOOK_BOOK_ID_INVALID",
    ),
    marketplace: "amazon",
    asin: input.asin,
    productReferenceHash: requireHash(
      input.productReferenceHash,
      "AUDIOBOOK_RETAIL_EBOOK_REFERENCE_HASH_INVALID",
    ),
    available: true,
    observedByActorId: requireHumanActor(
      input.observedByActorId,
      "AUDIOBOOK_RETAIL_EBOOK_OBSERVER_INVALID",
    ),
    observedAt: input.observedAt,
    expiresAt: input.expiresAt,
    status: "current",
  };
  const evidence = Object.freeze({
    ...partial,
    fingerprint: ebookFingerprint(partial),
  });
  assertAudiobookRetailEbookAvailabilityEvidence(evidence, now);
  return evidence;
}

export function assertAudiobookRetailEbookAvailabilityEvidence(
  evidence: AudiobookRetailEbookAvailabilityEvidence,
  now = new Date(),
): void {
  if (
    evidence.schemaVersion
      !== AUDIOBOOK_RETAIL_EBOOK_AVAILABILITY_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_EBOOK_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [evidence.id, "AUDIOBOOK_RETAIL_EBOOK_ID_INVALID"],
    [evidence.projectId, "AUDIOBOOK_RETAIL_EBOOK_PROJECT_ID_INVALID"],
    [evidence.bookId, "AUDIOBOOK_RETAIL_EBOOK_BOOK_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  if (!ASIN_PATTERN.test(evidence.asin)) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_EBOOK_ASIN_INVALID",
    );
  }
  requireHash(
    evidence.productReferenceHash,
    "AUDIOBOOK_RETAIL_EBOOK_REFERENCE_HASH_INVALID",
  );
  requireHumanActor(
    evidence.observedByActorId,
    "AUDIOBOOK_RETAIL_EBOOK_OBSERVER_INVALID",
  );
  const observedAt = Date.parse(requireDate(
    evidence.observedAt,
    "AUDIOBOOK_RETAIL_EBOOK_OBSERVATION_DATE_INVALID",
  ));
  const expiresAt = Date.parse(requireDate(
    evidence.expiresAt,
    "AUDIOBOOK_RETAIL_EBOOK_EXPIRY_INVALID",
  ));
  if (
    Number.isNaN(now.getTime())
    || evidence.marketplace !== "amazon"
    || evidence.available !== true
    || evidence.status !== "current"
    || observedAt > now.getTime()
    || expiresAt <= now.getTime()
    || expiresAt <= observedAt
    || expiresAt - observedAt > MAXIMUM_EBOOK_EVIDENCE_LIFETIME_MS
  ) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_EBOOK_NOT_CURRENT",
    );
  }
  const { fingerprint, ...partial } = evidence;
  if (ebookFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_EBOOK_FINGERPRINT_INVALID",
    );
  }
}

export function audiobookRetailEbookAvailabilityPublicView(
  evidence: AudiobookRetailEbookAvailabilityEvidence,
  now = new Date(),
): AudiobookRetailEbookAvailabilityPublicView {
  assertAudiobookRetailEbookAvailabilityEvidence(evidence, now);
  return Object.freeze({
    id: evidence.id,
    bookId: evidence.bookId,
    marketplace: "amazon",
    asin: evidence.asin,
    available: true,
    observedAt: evidence.observedAt,
    expiresAt: evidence.expiresAt,
    current: true,
    fingerprint: evidence.fingerprint,
  });
}

function canonicalCoverFormat(artifact: ArtifactRecord): AudiobookRetailCoverFormat {
  const format = artifact.integrity.format.toLocaleLowerCase("en-AU");
  const mimeType = artifact.integrity.mimeType.toLocaleLowerCase("en-AU");
  if ((format === "jpg" || format === "jpeg") && mimeType === "image/jpeg") {
    return "jpeg";
  }
  if (format === "png" && mimeType === "image/png") return "png";
  if ((format === "tif" || format === "tiff") && mimeType === "image/tiff") {
    return "tiff";
  }
  throw new AudiobookRetailListingPolicyError(
    "AUDIOBOOK_RETAIL_COVER_FORMAT_INVALID",
  );
}

function assertCurrentRights(
  rights: ArtifactRightsSnapshot,
  now: Date,
  prefix: "AUDIOBOOK_RETAIL_COVER",
): void {
  requireIdentifier(rights.rightsEvidenceId, `${prefix}_RIGHTS_ID_INVALID`);
  requireHash(rights.rightsFingerprint, `${prefix}_RIGHTS_HASH_INVALID`);
  if (!rights.allowedUses.includes("audiobook")) {
    throw new AudiobookRetailListingPolicyError(
      `${prefix}_AUDIOBOOK_RIGHTS_REQUIRED`,
    );
  }
  if (!rights.commercialUseApproved) {
    throw new AudiobookRetailListingPolicyError(
      `${prefix}_COMMERCIAL_RIGHTS_REQUIRED`,
    );
  }
  if (rights.expiresAt && Date.parse(rights.expiresAt) <= now.getTime()) {
    throw new AudiobookRetailListingPolicyError(`${prefix}_RIGHTS_EXPIRED`);
  }
  if (
    rights.deletionRequiredAt
    && Date.parse(rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new AudiobookRetailListingPolicyError(
      `${prefix}_RETENTION_EXPIRED`,
    );
  }
}

function normaliseCoverChecks(values: readonly string[]): readonly string[] {
  if (!Array.isArray(values) || values.length > 32) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_COVER_CHECKS_INVALID",
    );
  }
  const checks = new Set<string>();
  for (const value of values) {
    const check = requireText(
      value,
      120,
      "AUDIOBOOK_RETAIL_COVER_CHECKS_INVALID",
    );
    if (checks.has(check)) {
      throw new AudiobookRetailListingPolicyError(
        "AUDIOBOOK_RETAIL_COVER_CHECKS_DUPLICATE",
      );
    }
    checks.add(check);
  }
  for (const required of REQUIRED_COVER_CHECKS) {
    if (!checks.has(required)) {
      throw new AudiobookRetailListingPolicyError(
        "AUDIOBOOK_RETAIL_COVER_REQUIRED_CHECK_MISSING",
      );
    }
  }
  return Object.freeze(
    [...checks].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

export function createAudiobookRetailCoverEvidence(input: Readonly<{
  id: string;
  projectId: string;
  bookId: string;
  policy: AudiobookRetailListingPolicy;
  artifact: ArtifactRecord;
  widthPx: number;
  heightPx: number;
  dpi: number;
  bitDepth: number;
  colorSpace: "rgb";
  titleText: string;
  authorText: string;
  titleAuthorMatchConfirmed: true;
  prohibitedElementsAbsent: true;
  checks: readonly string[];
  observedByActorId: string;
  observedAt: string;
  now?: Date;
}>): AudiobookRetailCoverEvidence {
  const now = input.now ?? new Date();
  assertCurrentAudiobookRetailListingPolicy(input.policy, now);
  assertArtifactRecord(input.artifact);
  if (
    input.artifact.kind !== "visual-render"
    || input.artifact.projectId !== input.projectId
    || input.artifact.segmentId !== input.bookId
    || input.artifact.verification.status !== "verified"
    || input.artifact.review.status !== "approved"
    || input.artifact.quarantine !== undefined
  ) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_COVER_ARTIFACT_NOT_APPROVED",
    );
  }
  assertCurrentRights(input.artifact.rights, now, "AUDIOBOOK_RETAIL_COVER");
  const format = canonicalCoverFormat(input.artifact);
  const widthPx = requireInteger(
    input.widthPx,
    input.policy.cover.minimumWidthPx,
    32_768,
    "AUDIOBOOK_RETAIL_COVER_WIDTH_INVALID",
  );
  const heightPx = requireInteger(
    input.heightPx,
    input.policy.cover.minimumHeightPx,
    32_768,
    "AUDIOBOOK_RETAIL_COVER_HEIGHT_INVALID",
  );
  if (widthPx !== heightPx) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_COVER_ASPECT_RATIO_INVALID",
    );
  }
  requireInteger(
    input.dpi,
    input.policy.cover.minimumDpi,
    2_400,
    "AUDIOBOOK_RETAIL_COVER_DPI_INVALID",
  );
  requireInteger(
    input.bitDepth,
    input.policy.cover.minimumBitDepth,
    128,
    "AUDIOBOOK_RETAIL_COVER_BIT_DEPTH_INVALID",
  );
  if (input.colorSpace !== "rgb") {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_COVER_COLOR_SPACE_INVALID",
    );
  }
  if (
    input.artifact.integrity.byteCount <= 0
    || input.artifact.integrity.byteCount > input.policy.cover.maximumByteCount
  ) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_COVER_SIZE_INVALID",
    );
  }
  const observedAt = Date.parse(requireDate(
    input.observedAt,
    "AUDIOBOOK_RETAIL_COVER_OBSERVATION_DATE_INVALID",
  ));
  if (Number.isNaN(now.getTime()) || observedAt > now.getTime()) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_COVER_OBSERVATION_DATE_INVALID",
    );
  }
  if (
    input.titleAuthorMatchConfirmed !== true
    || input.prohibitedElementsAbsent !== true
  ) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_COVER_HUMAN_CONFIRMATION_REQUIRED",
    );
  }
  const partial: Omit<AudiobookRetailCoverEvidence, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_COVER_EVIDENCE_SCHEMA_VERSION,
    id: requireIdentifier(input.id, "AUDIOBOOK_RETAIL_COVER_ID_INVALID"),
    projectId: requireIdentifier(
      input.projectId,
      "AUDIOBOOK_RETAIL_COVER_PROJECT_ID_INVALID",
    ),
    bookId: requireIdentifier(
      input.bookId,
      "AUDIOBOOK_RETAIL_COVER_BOOK_ID_INVALID",
    ),
    distributor: "acx-audible",
    policyFingerprint: input.policy.fingerprint,
    artifact: Object.freeze({
      id: input.artifact.id,
      revision: input.artifact.revision,
      fingerprint: input.artifact.fingerprint,
      contentHash: input.artifact.integrity.contentHash,
      byteCount: input.artifact.integrity.byteCount,
      rightsFingerprint: input.artifact.rights.rightsFingerprint,
    }),
    format,
    widthPx,
    heightPx,
    dpi: input.dpi,
    bitDepth: input.bitDepth,
    colorSpace: "rgb",
    titleText: requireText(
      input.titleText,
      MAXIMUM_TEXT_LENGTH,
      "AUDIOBOOK_RETAIL_COVER_TITLE_TEXT_INVALID",
    ),
    authorText: requireText(
      input.authorText,
      MAXIMUM_TEXT_LENGTH,
      "AUDIOBOOK_RETAIL_COVER_AUTHOR_TEXT_INVALID",
    ),
    titleAuthorMatchConfirmed: true,
    prohibitedElementsAbsent: true,
    checks: normaliseCoverChecks(input.checks),
    observedByActorId: requireHumanActor(
      input.observedByActorId,
      "AUDIOBOOK_RETAIL_COVER_OBSERVER_INVALID",
    ),
    observedAt: input.observedAt,
    status: "verified",
  };
  const evidence = Object.freeze({
    ...partial,
    fingerprint: coverFingerprint(partial),
  });
  assertAudiobookRetailCoverEvidence(evidence);
  assertAudiobookRetailCoverEvidenceMatchesArtifact(
    evidence,
    input.artifact,
    input.policy,
    now,
  );
  return evidence;
}

export function assertAudiobookRetailCoverEvidence(
  evidence: AudiobookRetailCoverEvidence,
): void {
  if (
    evidence.schemaVersion !== AUDIOBOOK_RETAIL_COVER_EVIDENCE_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_COVER_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [evidence.id, "AUDIOBOOK_RETAIL_COVER_ID_INVALID"],
    [evidence.projectId, "AUDIOBOOK_RETAIL_COVER_PROJECT_ID_INVALID"],
    [evidence.bookId, "AUDIOBOOK_RETAIL_COVER_BOOK_ID_INVALID"],
    [evidence.artifact.id, "AUDIOBOOK_RETAIL_COVER_ARTIFACT_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  for (const [value, code] of [
    [evidence.policyFingerprint, "AUDIOBOOK_RETAIL_COVER_POLICY_HASH_INVALID"],
    [evidence.artifact.fingerprint, "AUDIOBOOK_RETAIL_COVER_ARTIFACT_HASH_INVALID"],
    [evidence.artifact.contentHash, "AUDIOBOOK_RETAIL_COVER_CONTENT_HASH_INVALID"],
    [evidence.artifact.rightsFingerprint, "AUDIOBOOK_RETAIL_COVER_RIGHTS_HASH_INVALID"],
  ] as const) requireHash(value, code);
  if (
    evidence.distributor !== "acx-audible"
    || !CANONICAL_COVER_POLICY.allowedFormats.includes(evidence.format)
    || evidence.widthPx < CANONICAL_COVER_POLICY.minimumWidthPx
    || evidence.heightPx < CANONICAL_COVER_POLICY.minimumHeightPx
    || evidence.widthPx !== evidence.heightPx
    || evidence.dpi < CANONICAL_COVER_POLICY.minimumDpi
    || evidence.bitDepth < CANONICAL_COVER_POLICY.minimumBitDepth
    || evidence.colorSpace !== "rgb"
    || evidence.artifact.byteCount < 1
    || evidence.artifact.byteCount > CANONICAL_COVER_POLICY.maximumByteCount
    || evidence.titleAuthorMatchConfirmed !== true
    || evidence.prohibitedElementsAbsent !== true
    || evidence.status !== "verified"
  ) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_COVER_STATE_INVALID",
    );
  }
  requireInteger(
    evidence.artifact.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_COVER_ARTIFACT_REVISION_INVALID",
  );
  requireText(
    evidence.titleText,
    MAXIMUM_TEXT_LENGTH,
    "AUDIOBOOK_RETAIL_COVER_TITLE_TEXT_INVALID",
  );
  requireText(
    evidence.authorText,
    MAXIMUM_TEXT_LENGTH,
    "AUDIOBOOK_RETAIL_COVER_AUTHOR_TEXT_INVALID",
  );
  normaliseCoverChecks(evidence.checks);
  requireHumanActor(
    evidence.observedByActorId,
    "AUDIOBOOK_RETAIL_COVER_OBSERVER_INVALID",
  );
  requireDate(
    evidence.observedAt,
    "AUDIOBOOK_RETAIL_COVER_OBSERVATION_DATE_INVALID",
  );
  const { fingerprint, ...partial } = evidence;
  if (coverFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_COVER_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailCoverEvidenceMatchesArtifact(
  evidence: AudiobookRetailCoverEvidence,
  artifact: ArtifactRecord,
  policy: AudiobookRetailListingPolicy,
  now = new Date(),
): void {
  assertAudiobookRetailCoverEvidence(evidence);
  assertCurrentAudiobookRetailListingPolicy(policy, now);
  assertArtifactRecord(artifact);
  assertCurrentRights(artifact.rights, now, "AUDIOBOOK_RETAIL_COVER");
  if (
    evidence.policyFingerprint !== policy.fingerprint
    || evidence.projectId !== artifact.projectId
    || evidence.bookId !== artifact.segmentId
    || artifact.kind !== "visual-render"
    || artifact.verification.status !== "verified"
    || artifact.review.status !== "approved"
    || artifact.quarantine !== undefined
    || evidence.artifact.id !== artifact.id
    || evidence.artifact.revision !== artifact.revision
    || evidence.artifact.fingerprint !== artifact.fingerprint
    || evidence.artifact.contentHash !== artifact.integrity.contentHash
    || evidence.artifact.byteCount !== artifact.integrity.byteCount
    || evidence.artifact.rightsFingerprint !== artifact.rights.rightsFingerprint
    || evidence.format !== canonicalCoverFormat(artifact)
  ) {
    throw new AudiobookRetailListingPolicyError(
      "AUDIOBOOK_RETAIL_COVER_SOURCE_MISMATCH",
    );
  }
}

export function audiobookRetailCoverEvidencePublicView(
  evidence: AudiobookRetailCoverEvidence,
): AudiobookRetailCoverEvidencePublicView {
  assertAudiobookRetailCoverEvidence(evidence);
  return Object.freeze({
    id: evidence.id,
    bookId: evidence.bookId,
    format: evidence.format,
    widthPx: evidence.widthPx,
    heightPx: evidence.heightPx,
    dpi: evidence.dpi,
    bitDepth: evidence.bitDepth,
    colorSpace: "rgb",
    titleText: evidence.titleText,
    authorText: evidence.authorText,
    titleAuthorMatchConfirmed: true,
    prohibitedElementsAbsent: true,
    observedAt: evidence.observedAt,
    status: "verified",
    fingerprint: evidence.fingerprint,
  });
}
