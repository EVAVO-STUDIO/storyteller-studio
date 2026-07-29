import {
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import {
  assertBookCreditPolicy,
  assertBookCreditScript,
  createBookCreditScript,
  type BookCreditMetadata,
  type BookCreditPolicy,
  type BookCreditScript,
} from "./book-credit-script.js";
import {
  assertAudiobookRetailPackageManifest,
  type AudiobookRetailPackageManifest,
} from "./audiobook-retail-package-manifest.js";
import {
  assertAudiobookRetailCoverEvidenceMatchesArtifact,
  assertAudiobookRetailEbookAvailabilityEvidence,
  assertCurrentAudiobookRetailListingPolicy,
  type AudiobookRetailCoverEvidence,
  type AudiobookRetailEbookAvailabilityEvidence,
  type AudiobookRetailListingPolicy,
} from "./audiobook-retail-listing-policy.js";
import { stableHash } from "./index.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";

export const AUDIOBOOK_RETAIL_LISTING_IDENTITY_SCHEMA_VERSION =
  "storyteller-audiobook-retail-listing-identity-v1" as const;
export const AUDIOBOOK_RETAIL_LISTING_IDENTITY_ENTITY_TYPE =
  "audiobook-retail-listing-identity" as const;

export type AudiobookRetailListingReviewRole =
  | "editorial"
  | "rights"
  | "merchandising";
export type AudiobookRetailListingReviewDecision =
  | "approve"
  | "changes-requested";
export type AudiobookRetailListingIdentityStatus =
  | "draft"
  | "changes-requested"
  | "ready-for-approval"
  | "approved-for-publication-verification";

export interface AudiobookRetailListingMetadataInput {
  title: string;
  subtitle?: string;
  authorCredit: string;
  narratorCredit: string;
  publisherName: string;
  languageTag: string;
  description: string;
  projectKind: "standalone" | "series";
  seriesTitle?: string;
  volumeNumber?: number;
  copyrightNotice: string;
  productionCredit?: string;
}

export interface AudiobookRetailListingMetadata {
  title: string;
  displayTitle: string;
  subtitle?: string;
  authorCredit: string;
  narratorCredit: string;
  publisherName: string;
  languageTag: string;
  description: string;
  projectKind: "standalone" | "series";
  seriesTitle?: string;
  volumeNumber?: number;
  copyrightNotice: string;
  productionCredit?: string;
  descriptionCharacterCount: number;
  fingerprint: string;
}

export interface AudiobookRetailListingReviewEntry {
  id: string;
  role: AudiobookRetailListingReviewRole;
  reviewerId: string;
  decision: AudiobookRetailListingReviewDecision;
  checks: readonly string[];
  findingCodes: readonly string[];
  notes?: string;
  decidedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailListingApproval {
  finalConfirmationId: string;
  approvedByActorId: string;
  approvedAt: string;
  reviewerSetFingerprint: string;
  sourceSetFingerprint: string;
  publicationVerificationEligible: true;
  fingerprint: string;
}

export interface AudiobookRetailListingIdentity {
  schemaVersion: typeof AUDIOBOOK_RETAIL_LISTING_IDENTITY_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  distributor: "acx-audible";
  policy: Readonly<{
    id: string;
    externalVersion: string;
    reviewedAt: string;
    expiresAt: string;
    fingerprint: string;
  }>;
  packageManifest: Readonly<{
    id: string;
    revision: 1;
    fingerprint: string;
    mediaFileCount: number;
    totalMediaBytes: number;
  }>;
  credits: Readonly<{
    metadataFingerprint: string;
    opening: Readonly<{
      id: string;
      revision: number;
      fingerprint: string;
      textHash: string;
      approvalFingerprint: string;
    }>;
    closing: Readonly<{
      id: string;
      revision: number;
      fingerprint: string;
      textHash: string;
      approvalFingerprint: string;
    }>;
  }>;
  metadata: AudiobookRetailListingMetadata;
  cover: Readonly<{
    evidenceId: string;
    evidenceFingerprint: string;
    artifactId: string;
    artifactRevision: number;
    artifactFingerprint: string;
    contentHash: string;
    rightsFingerprint: string;
    format: AudiobookRetailCoverEvidence["format"];
    widthPx: number;
    heightPx: number;
    dpi: number;
    bitDepth: number;
  }>;
  ebook: Readonly<{
    evidenceId: string;
    evidenceFingerprint: string;
    asin: string;
    observedAt: string;
    expiresAt: string;
  }>;
  audiobookRightsFingerprint: string;
  reviews: readonly AudiobookRetailListingReviewEntry[];
  requiredRoles: readonly AudiobookRetailListingReviewRole[];
  status: AudiobookRetailListingIdentityStatus;
  approval?: AudiobookRetailListingApproval;
  revision: number;
  previousFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailListingIdentitySources {
  policy: AudiobookRetailListingPolicy;
  packageManifest: AudiobookRetailPackageManifest;
  creditPolicy: BookCreditPolicy;
  creditMetadata: BookCreditMetadata;
  openingCredit: BookCreditScript;
  closingCredit: BookCreditScript;
  listingMetadata: AudiobookRetailListingMetadataInput;
  coverEvidence: AudiobookRetailCoverEvidence;
  coverArtifact: ArtifactRecord;
  ebookEvidence: AudiobookRetailEbookAvailabilityEvidence;
  audiobookRights: ArtifactRightsSnapshot;
}

export interface AudiobookRetailListingIdentityPublicView {
  id: string;
  bookId: string;
  distributor: "acx-audible";
  policyVersion: string;
  title: string;
  displayTitle: string;
  subtitle?: string;
  authorCredit: string;
  narratorCredit: string;
  publisherName: string;
  languageTag: string;
  description: string;
  projectKind: "standalone" | "series";
  seriesTitle?: string;
  volumeNumber?: number;
  copyrightNotice: string;
  cover: Readonly<{
    format: AudiobookRetailCoverEvidence["format"];
    widthPx: number;
    heightPx: number;
    dpi: number;
    bitDepth: number;
  }>;
  ebook: Readonly<{
    marketplace: "amazon";
    asin: string;
    available: true;
    evidenceExpiresAt: string;
  }>;
  reviewCount: number;
  reviewerCount: number;
  latestDecisions: Readonly<Record<
    AudiobookRetailListingReviewRole,
    AudiobookRetailListingReviewDecision | "pending"
  >>;
  findingCodes: readonly string[];
  status: AudiobookRetailListingIdentityStatus;
  readyForApproval: boolean;
  publicationVerificationEligible: boolean;
  approvedAt?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export class AudiobookRetailListingIdentityError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailListingIdentityError";
    this.code = code;
  }
}

export class AudiobookRetailListingIdentityStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudiobookRetailListingIdentityStoreConflictError";
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const LANGUAGE_TAG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
const FINDING_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,95}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const HUMAN_BLOCKLIST = /^(?:system|worker|automation|automated|bot)(?:[_-]|$)/iu;
const MAXIMUM_TEXT_LENGTH = 2_000;
const MAXIMUM_NOTES_LENGTH = 8_000;
const MAXIMUM_REVIEWS = 300;
const REQUIRED_ROLES = Object.freeze([
  "editorial",
  "rights",
  "merchandising",
] as const satisfies readonly AudiobookRetailListingReviewRole[]);
const REQUIRED_REVIEW_CHECKS = Object.freeze({
  editorial: Object.freeze([
    "title-author-narrator-match-spoken-credits",
    "description-accurate",
    "language-confirmed",
    "series-metadata-confirmed",
  ]),
  rights: Object.freeze([
    "audiobook-rights-current",
    "cover-rights-current",
    "copyright-confirmed",
    "ebook-association-confirmed",
  ]),
  merchandising: Object.freeze([
    "cover-technical-compliance",
    "cover-text-match",
    "description-within-limit",
    "prohibited-elements-absent",
    "ebook-availability-confirmed",
  ]),
} as const satisfies Readonly<Record<
  AudiobookRetailListingReviewRole,
  readonly string[]
>>);

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailListingIdentityError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailListingIdentityError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailListingIdentityError(code);
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
    throw new AudiobookRetailListingIdentityError(code);
  }
  return trimmed;
}

function requireHumanActor(value: string, code: string): string {
  requireIdentifier(value, code);
  if (HUMAN_BLOCKLIST.test(value)) {
    throw new AudiobookRetailListingIdentityError(code);
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
    throw new AudiobookRetailListingIdentityError(code);
  }
  return value;
}

function metadataFingerprint(
  value: Omit<AudiobookRetailListingMetadata, "fingerprint">,
): string {
  return stableHash(value);
}

function reviewFingerprint(
  value: Omit<AudiobookRetailListingReviewEntry, "fingerprint">,
): string {
  return stableHash(value);
}

function approvalFingerprint(
  value: Omit<AudiobookRetailListingApproval, "fingerprint">,
): string {
  return stableHash(value);
}

function identityFingerprint(
  value: Omit<AudiobookRetailListingIdentity, "fingerprint">,
): string {
  return stableHash(value);
}

function currentRights(
  rights: ArtifactRightsSnapshot,
  expectedFingerprint: string,
  now: Date,
  prefix: "AUDIOBOOK_RETAIL_LISTING" | "AUDIOBOOK_RETAIL_LISTING_COVER",
): void {
  requireIdentifier(rights.rightsEvidenceId, `${prefix}_RIGHTS_ID_INVALID`);
  requireHash(rights.rightsFingerprint, `${prefix}_RIGHTS_HASH_INVALID`);
  if (rights.rightsFingerprint !== expectedFingerprint) {
    throw new AudiobookRetailListingIdentityError(
      `${prefix}_RIGHTS_SCOPE_MISMATCH`,
    );
  }
  if (!rights.allowedUses.includes("audiobook")) {
    throw new AudiobookRetailListingIdentityError(
      `${prefix}_AUDIOBOOK_RIGHTS_REQUIRED`,
    );
  }
  if (!rights.commercialUseApproved) {
    throw new AudiobookRetailListingIdentityError(
      `${prefix}_COMMERCIAL_RIGHTS_REQUIRED`,
    );
  }
  if (rights.expiresAt && Date.parse(rights.expiresAt) <= now.getTime()) {
    throw new AudiobookRetailListingIdentityError(`${prefix}_RIGHTS_EXPIRED`);
  }
  if (
    rights.deletionRequiredAt
    && Date.parse(rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new AudiobookRetailListingIdentityError(
      `${prefix}_RETENTION_EXPIRED`,
    );
  }
}

function canonicalDisplayTitle(input: AudiobookRetailListingMetadataInput): string {
  const title = requireText(
    input.title,
    MAXIMUM_TEXT_LENGTH,
    "AUDIOBOOK_RETAIL_LISTING_TITLE_INVALID",
  );
  if (input.subtitle === undefined) return title;
  const subtitle = requireText(
    input.subtitle,
    MAXIMUM_TEXT_LENGTH,
    "AUDIOBOOK_RETAIL_LISTING_SUBTITLE_INVALID",
  );
  return `${title}: ${subtitle}`;
}

function createMetadata(
  input: AudiobookRetailListingMetadataInput,
  maximumDescriptionCharacters: number,
): AudiobookRetailListingMetadata {
  const displayTitle = canonicalDisplayTitle(input);
  const title = requireText(
    input.title,
    MAXIMUM_TEXT_LENGTH,
    "AUDIOBOOK_RETAIL_LISTING_TITLE_INVALID",
  );
  const subtitle = input.subtitle === undefined
    ? undefined
    : requireText(
        input.subtitle,
        MAXIMUM_TEXT_LENGTH,
        "AUDIOBOOK_RETAIL_LISTING_SUBTITLE_INVALID",
      );
  const description = requireText(
    input.description,
    maximumDescriptionCharacters,
    "AUDIOBOOK_RETAIL_LISTING_DESCRIPTION_INVALID",
  );
  const authorCredit = requireText(
    input.authorCredit,
    MAXIMUM_TEXT_LENGTH,
    "AUDIOBOOK_RETAIL_LISTING_AUTHOR_INVALID",
  );
  const narratorCredit = requireText(
    input.narratorCredit,
    MAXIMUM_TEXT_LENGTH,
    "AUDIOBOOK_RETAIL_LISTING_NARRATOR_INVALID",
  );
  const publisherName = requireText(
    input.publisherName,
    MAXIMUM_TEXT_LENGTH,
    "AUDIOBOOK_RETAIL_LISTING_PUBLISHER_INVALID",
  );
  if (!LANGUAGE_TAG.test(input.languageTag)) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_LANGUAGE_INVALID",
    );
  }
  if (input.projectKind !== "standalone" && input.projectKind !== "series") {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_PROJECT_KIND_INVALID",
    );
  }
  let seriesTitle: string | undefined;
  let volumeNumber: number | undefined;
  if (input.projectKind === "series") {
    seriesTitle = requireText(
      input.seriesTitle ?? "",
      MAXIMUM_TEXT_LENGTH,
      "AUDIOBOOK_RETAIL_LISTING_SERIES_TITLE_INVALID",
    );
    volumeNumber = requireInteger(
      input.volumeNumber ?? 0,
      1,
      10_000,
      "AUDIOBOOK_RETAIL_LISTING_VOLUME_NUMBER_INVALID",
    );
  } else if (input.seriesTitle !== undefined || input.volumeNumber !== undefined) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_STANDALONE_SERIES_METADATA_FORBIDDEN",
    );
  }
  const copyrightNotice = requireText(
    input.copyrightNotice,
    MAXIMUM_TEXT_LENGTH,
    "AUDIOBOOK_RETAIL_LISTING_COPYRIGHT_INVALID",
  );
  const productionCredit = input.productionCredit === undefined
    ? undefined
    : requireText(
        input.productionCredit,
        MAXIMUM_TEXT_LENGTH,
        "AUDIOBOOK_RETAIL_LISTING_PRODUCTION_CREDIT_INVALID",
      );
  const partial: Omit<AudiobookRetailListingMetadata, "fingerprint"> = {
    title,
    displayTitle,
    ...(subtitle ? { subtitle } : {}),
    authorCredit,
    narratorCredit,
    publisherName,
    languageTag: input.languageTag,
    description,
    projectKind: input.projectKind,
    ...(seriesTitle ? { seriesTitle } : {}),
    ...(volumeNumber !== undefined ? { volumeNumber } : {}),
    copyrightNotice,
    ...(productionCredit ? { productionCredit } : {}),
    descriptionCharacterCount: [...description].length,
  };
  return Object.freeze({
    ...partial,
    fingerprint: metadataFingerprint(partial),
  });
}

function assertMetadata(metadata: AudiobookRetailListingMetadata): void {
  const reconstructed = createMetadata({
    title: metadata.title,
    ...(metadata.subtitle ? { subtitle: metadata.subtitle } : {}),
    authorCredit: metadata.authorCredit,
    narratorCredit: metadata.narratorCredit,
    publisherName: metadata.publisherName,
    languageTag: metadata.languageTag,
    description: metadata.description,
    projectKind: metadata.projectKind,
    ...(metadata.seriesTitle ? { seriesTitle: metadata.seriesTitle } : {}),
    ...(metadata.volumeNumber !== undefined
      ? { volumeNumber: metadata.volumeNumber }
      : {}),
    copyrightNotice: metadata.copyrightNotice,
    ...(metadata.productionCredit
      ? { productionCredit: metadata.productionCredit }
      : {}),
  }, 2_000);
  if (
    reconstructed.displayTitle !== metadata.displayTitle
    || reconstructed.descriptionCharacterCount
      !== metadata.descriptionCharacterCount
    || reconstructed.fingerprint !== metadata.fingerprint
  ) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_METADATA_INTEGRITY_INVALID",
    );
  }
}

function assertApprovedCredit(
  script: BookCreditScript,
  kind: "opening" | "closing",
): void {
  assertBookCreditScript(script);
  if (
    script.kind !== kind
    || script.status !== "approved"
    || !script.approval
  ) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_APPROVED_CREDIT_REQUIRED",
    );
  }
}

function assertCreditPairMatchesMetadata(input: Readonly<{
  projectId: string;
  bookId: string;
  metadata: BookCreditMetadata;
  policy: BookCreditPolicy;
  opening: BookCreditScript;
  closing: BookCreditScript;
}>): void {
  assertBookCreditPolicy(input.policy);
  assertApprovedCredit(input.opening, "opening");
  assertApprovedCredit(input.closing, "closing");
  if (
    input.opening.projectId !== input.projectId
    || input.closing.projectId !== input.projectId
    || input.opening.bookId !== input.bookId
    || input.closing.bookId !== input.bookId
    || input.opening.policyFingerprint !== input.policy.fingerprint
    || input.closing.policyFingerprint !== input.policy.fingerprint
    || input.opening.metadataFingerprint !== input.closing.metadataFingerprint
  ) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_CREDIT_SCOPE_MISMATCH",
    );
  }
  const probeSeed = stableHash({
    metadata: input.metadata,
    policy: input.policy.fingerprint,
  }).slice(0, 20);
  const openingProbe = createBookCreditScript({
    id: `listing_credit_probe_opening_${probeSeed}`,
    projectId: input.projectId,
    kind: "opening",
    metadata: input.metadata,
    policy: input.policy,
    createdAt: new Date(input.opening.createdAt),
  });
  const closingProbe = createBookCreditScript({
    id: `listing_credit_probe_closing_${probeSeed}`,
    projectId: input.projectId,
    kind: "closing",
    metadata: input.metadata,
    policy: input.policy,
    createdAt: new Date(input.closing.createdAt),
  });
  if (
    openingProbe.metadataFingerprint !== input.opening.metadataFingerprint
    || closingProbe.metadataFingerprint !== input.closing.metadataFingerprint
    || openingProbe.textHash !== input.opening.textHash
    || closingProbe.textHash !== input.closing.textHash
  ) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_CREDIT_METADATA_MISMATCH",
    );
  }
}

function sourceSetFingerprint(input: AudiobookRetailListingIdentitySources): string {
  return stableHash({
    policy: input.policy.fingerprint,
    packageManifest: input.packageManifest.fingerprint,
    creditPolicy: input.creditPolicy.fingerprint,
    openingCredit: input.openingCredit.fingerprint,
    closingCredit: input.closingCredit.fingerprint,
    listingMetadata: input.listingMetadata,
    coverEvidence: input.coverEvidence.fingerprint,
    coverArtifact: input.coverArtifact.fingerprint,
    ebookEvidence: input.ebookEvidence.fingerprint,
    audiobookRights: input.audiobookRights.rightsFingerprint,
  });
}

function assertSources(
  input: AudiobookRetailListingIdentitySources,
  now: Date,
): AudiobookRetailListingMetadata {
  assertCurrentAudiobookRetailListingPolicy(input.policy, now);
  assertAudiobookRetailPackageManifest(input.packageManifest);
  if (
    input.packageManifest.distributor !== "acx-audible"
    || input.packageManifest.status !== "ready-for-package-build"
  ) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_PACKAGE_MANIFEST_NOT_READY",
    );
  }
  const metadata = createMetadata(
    input.listingMetadata,
    input.policy.metadata.maximumDescriptionCharacters,
  );
  const projectId = input.packageManifest.projectId;
  const bookId = input.packageManifest.bookId;
  if (
    input.creditMetadata.bookId !== bookId
    || input.creditMetadata.title !== metadata.displayTitle
    || input.creditMetadata.authorCredit !== metadata.authorCredit
    || input.creditMetadata.narratorCredit !== metadata.narratorCredit
    || input.creditMetadata.projectKind !== metadata.projectKind
    || (input.creditMetadata.seriesTitle ?? undefined)
      !== (metadata.seriesTitle ?? undefined)
    || (input.creditMetadata.volumeNumber ?? undefined)
      !== (metadata.volumeNumber ?? undefined)
    || input.creditMetadata.copyrightNotice !== metadata.copyrightNotice
    || (input.creditMetadata.productionCredit ?? undefined)
      !== (metadata.productionCredit ?? undefined)
  ) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_CREDIT_METADATA_MISMATCH",
    );
  }
  assertCreditPairMatchesMetadata({
    projectId,
    bookId,
    metadata: input.creditMetadata,
    policy: input.creditPolicy,
    opening: input.openingCredit,
    closing: input.closingCredit,
  });
  currentRights(
    input.audiobookRights,
    input.packageManifest.rightsFingerprint,
    now,
    "AUDIOBOOK_RETAIL_LISTING",
  );
  assertAudiobookRetailCoverEvidenceMatchesArtifact(
    input.coverEvidence,
    input.coverArtifact,
    input.policy,
    now,
  );
  currentRights(
    input.coverArtifact.rights,
    input.coverEvidence.artifact.rightsFingerprint,
    now,
    "AUDIOBOOK_RETAIL_LISTING_COVER",
  );
  assertAudiobookRetailEbookAvailabilityEvidence(input.ebookEvidence, now);
  if (
    input.coverEvidence.projectId !== projectId
    || input.coverEvidence.bookId !== bookId
    || input.ebookEvidence.projectId !== projectId
    || input.ebookEvidence.bookId !== bookId
    || input.coverEvidence.titleText !== metadata.displayTitle
    || input.coverEvidence.authorText !== metadata.authorCredit
    || input.coverEvidence.policyFingerprint !== input.policy.fingerprint
  ) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_EXTERNAL_EVIDENCE_MISMATCH",
    );
  }
  return metadata;
}

function normaliseChecks(
  role: AudiobookRetailListingReviewRole,
  values: readonly string[],
): readonly string[] {
  if (!Array.isArray(values) || values.length > 64) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_REVIEW_CHECKS_INVALID",
    );
  }
  const checks = new Set<string>();
  for (const value of values) {
    const check = requireText(
      value,
      160,
      "AUDIOBOOK_RETAIL_LISTING_REVIEW_CHECKS_INVALID",
    );
    if (checks.has(check)) {
      throw new AudiobookRetailListingIdentityError(
        "AUDIOBOOK_RETAIL_LISTING_REVIEW_CHECKS_DUPLICATE",
      );
    }
    checks.add(check);
  }
  for (const required of REQUIRED_REVIEW_CHECKS[role]) {
    if (!checks.has(required)) {
      throw new AudiobookRetailListingIdentityError(
        "AUDIOBOOK_RETAIL_LISTING_REVIEW_REQUIRED_CHECK_MISSING",
      );
    }
  }
  return Object.freeze(
    [...checks].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function normaliseFindingCodes(
  decision: AudiobookRetailListingReviewDecision,
  values: readonly string[] | undefined,
): readonly string[] {
  const findingCodes = values ?? [];
  if (!Array.isArray(findingCodes) || findingCodes.length > 100) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_FINDING_CODES_INVALID",
    );
  }
  const unique = new Set<string>();
  for (const value of findingCodes) {
    if (!FINDING_CODE_PATTERN.test(value) || unique.has(value)) {
      throw new AudiobookRetailListingIdentityError(
        "AUDIOBOOK_RETAIL_LISTING_FINDING_CODES_INVALID",
      );
    }
    unique.add(value);
  }
  if (decision === "approve" && unique.size > 0) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_APPROVAL_FINDINGS_FORBIDDEN",
    );
  }
  if (decision === "changes-requested" && unique.size === 0) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_CHANGE_FINDINGS_REQUIRED",
    );
  }
  return Object.freeze(
    [...unique].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function latestReviews(
  reviews: readonly AudiobookRetailListingReviewEntry[],
): ReadonlyMap<AudiobookRetailListingReviewRole, AudiobookRetailListingReviewEntry> {
  const latest = new Map<
    AudiobookRetailListingReviewRole,
    AudiobookRetailListingReviewEntry
  >();
  for (const review of reviews) latest.set(review.role, review);
  return latest;
}

function statusFromReviews(
  reviews: readonly AudiobookRetailListingReviewEntry[],
): Exclude<
  AudiobookRetailListingIdentityStatus,
  "approved-for-publication-verification"
> {
  const latest = latestReviews(reviews);
  if (
    [...latest.values()].some(
      (review) => review.decision === "changes-requested",
    )
  ) {
    return "changes-requested";
  }
  if (
    REQUIRED_ROLES.every((role) => latest.get(role)?.decision === "approve")
    && REQUIRED_ROLES.every(
      (role) => latest.get(role)?.findingCodes.length === 0,
    )
    && new Set(
      REQUIRED_ROLES.map((role) => latest.get(role)!.reviewerId),
    ).size === REQUIRED_ROLES.length
  ) {
    return "ready-for-approval";
  }
  return "draft";
}

function reviewerSetFingerprint(
  identity: AudiobookRetailListingIdentity,
): string {
  const latest = latestReviews(identity.reviews);
  return stableHash(REQUIRED_ROLES.map((role) => {
    const review = latest.get(role);
    if (!review) {
      throw new AudiobookRetailListingIdentityError(
        "AUDIOBOOK_RETAIL_LISTING_REVIEWER_SET_INCOMPLETE",
      );
    }
    return {
      role,
      reviewerId: review.reviewerId,
      reviewFingerprint: review.fingerprint,
    };
  }));
}

function assertReviewEntry(review: AudiobookRetailListingReviewEntry): void {
  requireIdentifier(review.id, "AUDIOBOOK_RETAIL_LISTING_REVIEW_ID_INVALID");
  if (!REQUIRED_ROLES.includes(review.role)) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_REVIEW_ROLE_INVALID",
    );
  }
  requireHumanActor(
    review.reviewerId,
    "AUDIOBOOK_RETAIL_LISTING_REVIEWER_INVALID",
  );
  if (
    review.decision !== "approve"
    && review.decision !== "changes-requested"
  ) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_REVIEW_DECISION_INVALID",
    );
  }
  normaliseChecks(review.role, review.checks);
  normaliseFindingCodes(review.decision, review.findingCodes);
  if (review.notes !== undefined) {
    requireText(
      review.notes,
      MAXIMUM_NOTES_LENGTH,
      "AUDIOBOOK_RETAIL_LISTING_REVIEW_NOTES_INVALID",
    );
  } else if (review.decision === "changes-requested") {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_REVIEW_NOTES_REQUIRED",
    );
  }
  requireDate(review.decidedAt, "AUDIOBOOK_RETAIL_LISTING_REVIEW_DATE_INVALID");
  const { fingerprint, ...partial } = review;
  if (reviewFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_REVIEW_FINGERPRINT_INVALID",
    );
  }
}

function reviseIdentity(
  identity: AudiobookRetailListingIdentity,
  updates: Partial<Pick<
    AudiobookRetailListingIdentity,
    "reviews" | "status" | "approval"
  >>,
  now: Date,
): AudiobookRetailListingIdentity {
  assertAudiobookRetailListingIdentity(identity);
  if (now.getTime() < Date.parse(identity.updatedAt)) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_TRANSITION_TIME_REVERSED",
    );
  }
  const {
    fingerprint: _fingerprint,
    previousFingerprint: _previous,
    ...base
  } = identity;
  const partial: Omit<AudiobookRetailListingIdentity, "fingerprint"> = {
    ...base,
    ...updates,
    revision: identity.revision + 1,
    previousFingerprint: identity.fingerprint,
    createdAt: identity.createdAt,
    updatedAt: now.toISOString(),
  };
  const next = Object.freeze({
    ...partial,
    fingerprint: identityFingerprint(partial),
  });
  assertAudiobookRetailListingIdentity(next);
  return next;
}

export function createAudiobookRetailListingIdentity(input: Readonly<{
  id: string;
  sources: AudiobookRetailListingIdentitySources;
  createdAt?: Date;
}>): AudiobookRetailListingIdentity {
  requireIdentifier(input.id, "AUDIOBOOK_RETAIL_LISTING_ID_INVALID");
  const createdAt = input.createdAt ?? new Date();
  if (Number.isNaN(createdAt.getTime())) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_DATE_INVALID",
    );
  }
  const metadata = assertSources(input.sources, createdAt);
  const { sources } = input;
  const partial: Omit<AudiobookRetailListingIdentity, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_LISTING_IDENTITY_SCHEMA_VERSION,
    id: input.id,
    projectId: sources.packageManifest.projectId,
    bookId: sources.packageManifest.bookId,
    distributor: "acx-audible",
    policy: Object.freeze({
      id: sources.policy.id,
      externalVersion: sources.policy.externalVersion,
      reviewedAt: sources.policy.reviewedAt,
      expiresAt: sources.policy.expiresAt,
      fingerprint: sources.policy.fingerprint,
    }),
    packageManifest: Object.freeze({
      id: sources.packageManifest.id,
      revision: 1,
      fingerprint: sources.packageManifest.fingerprint,
      mediaFileCount: sources.packageManifest.mediaFileCount,
      totalMediaBytes: sources.packageManifest.totalMediaBytes,
    }),
    credits: Object.freeze({
      metadataFingerprint: sources.openingCredit.metadataFingerprint,
      opening: Object.freeze({
        id: sources.openingCredit.id,
        revision: sources.openingCredit.revision,
        fingerprint: sources.openingCredit.fingerprint,
        textHash: sources.openingCredit.textHash,
        approvalFingerprint: sources.openingCredit.approval!.fingerprint,
      }),
      closing: Object.freeze({
        id: sources.closingCredit.id,
        revision: sources.closingCredit.revision,
        fingerprint: sources.closingCredit.fingerprint,
        textHash: sources.closingCredit.textHash,
        approvalFingerprint: sources.closingCredit.approval!.fingerprint,
      }),
    }),
    metadata,
    cover: Object.freeze({
      evidenceId: sources.coverEvidence.id,
      evidenceFingerprint: sources.coverEvidence.fingerprint,
      artifactId: sources.coverArtifact.id,
      artifactRevision: sources.coverArtifact.revision,
      artifactFingerprint: sources.coverArtifact.fingerprint,
      contentHash: sources.coverArtifact.integrity.contentHash,
      rightsFingerprint: sources.coverArtifact.rights.rightsFingerprint,
      format: sources.coverEvidence.format,
      widthPx: sources.coverEvidence.widthPx,
      heightPx: sources.coverEvidence.heightPx,
      dpi: sources.coverEvidence.dpi,
      bitDepth: sources.coverEvidence.bitDepth,
    }),
    ebook: Object.freeze({
      evidenceId: sources.ebookEvidence.id,
      evidenceFingerprint: sources.ebookEvidence.fingerprint,
      asin: sources.ebookEvidence.asin,
      observedAt: sources.ebookEvidence.observedAt,
      expiresAt: sources.ebookEvidence.expiresAt,
    }),
    audiobookRightsFingerprint:
      sources.audiobookRights.rightsFingerprint,
    reviews: Object.freeze([]),
    requiredRoles: REQUIRED_ROLES,
    status: "draft",
    revision: 1,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
  };
  const identity = Object.freeze({
    ...partial,
    fingerprint: identityFingerprint(partial),
  });
  assertAudiobookRetailListingIdentity(identity);
  assertAudiobookRetailListingIdentityMatchesSources(
    identity,
    sources,
    createdAt,
  );
  return identity;
}

export function recordAudiobookRetailListingReview(
  identity: AudiobookRetailListingIdentity,
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
): AudiobookRetailListingIdentity {
  assertAudiobookRetailListingIdentity(identity);
  if (identity.status === "approved-for-publication-verification") {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_APPROVED_IMMUTABLE",
    );
  }
  requireIdentifier(input.id, "AUDIOBOOK_RETAIL_LISTING_REVIEW_ID_INVALID");
  if (identity.reviews.some((review) => review.id === input.id)) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_REVIEW_ID_DUPLICATE",
    );
  }
  if (!REQUIRED_ROLES.includes(input.role)) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_REVIEW_ROLE_INVALID",
    );
  }
  const reviewerId = requireHumanActor(
    input.reviewerId,
    "AUDIOBOOK_RETAIL_LISTING_REVIEWER_INVALID",
  );
  const latest = latestReviews(identity.reviews);
  for (const [role, review] of latest) {
    if (role !== input.role && review.reviewerId === reviewerId) {
      throw new AudiobookRetailListingIdentityError(
        "AUDIOBOOK_RETAIL_LISTING_INDEPENDENT_REVIEWERS_REQUIRED",
      );
    }
  }
  const decidedAt = input.decidedAt ?? new Date();
  if (
    Number.isNaN(decidedAt.getTime())
    || decidedAt.getTime() < Date.parse(identity.updatedAt)
  ) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_REVIEW_DATE_INVALID",
    );
  }
  const notes = input.notes === undefined
    ? undefined
    : requireText(
        input.notes,
        MAXIMUM_NOTES_LENGTH,
        "AUDIOBOOK_RETAIL_LISTING_REVIEW_NOTES_INVALID",
      );
  const reviewBase: Omit<AudiobookRetailListingReviewEntry, "fingerprint"> = {
    id: input.id,
    role: input.role,
    reviewerId,
    decision: input.decision,
    checks: normaliseChecks(input.role, input.checks),
    findingCodes: normaliseFindingCodes(
      input.decision,
      input.findingCodes,
    ),
    ...(notes ? { notes } : {}),
    decidedAt: decidedAt.toISOString(),
  };
  const review = Object.freeze({
    ...reviewBase,
    fingerprint: reviewFingerprint(reviewBase),
  });
  assertReviewEntry(review);
  const reviews = Object.freeze([...identity.reviews, review]);
  return reviseIdentity(
    identity,
    { reviews, status: statusFromReviews(reviews) },
    decidedAt,
  );
}

export function approveAudiobookRetailListingIdentity(
  identity: AudiobookRetailListingIdentity,
  input: Readonly<{
    sources: AudiobookRetailListingIdentitySources;
    finalConfirmationId: string;
    approvedByActorId: string;
    humanConfirmation: true;
    approvedAt?: Date;
  }>,
): AudiobookRetailListingIdentity {
  assertAudiobookRetailListingIdentity(identity);
  if (identity.status === "approved-for-publication-verification") {
    return identity;
  }
  if (input.humanConfirmation !== true) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_HUMAN_CONFIRMATION_REQUIRED",
    );
  }
  if (identity.status !== "ready-for-approval") {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_NOT_READY_FOR_APPROVAL",
    );
  }
  requireIdentifier(
    input.finalConfirmationId,
    "AUDIOBOOK_RETAIL_LISTING_CONFIRMATION_ID_INVALID",
  );
  const approvedByActorId = requireHumanActor(
    input.approvedByActorId,
    "AUDIOBOOK_RETAIL_LISTING_APPROVER_INVALID",
  );
  const approvedAt = input.approvedAt ?? new Date();
  if (
    Number.isNaN(approvedAt.getTime())
    || approvedAt.getTime() < Date.parse(identity.updatedAt)
  ) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_APPROVAL_DATE_INVALID",
    );
  }
  assertAudiobookRetailListingIdentityMatchesSources(
    identity,
    input.sources,
    approvedAt,
  );
  const excludedActors = new Set([
    ...latestReviews(identity.reviews).values(),
  ].map((review) => review.reviewerId));
  excludedActors.add(input.sources.openingCredit.approval!.approvedByActorId);
  excludedActors.add(input.sources.closingCredit.approval!.approvedByActorId);
  excludedActors.add(input.sources.coverEvidence.observedByActorId);
  excludedActors.add(input.sources.ebookEvidence.observedByActorId);
  if (excludedActors.has(approvedByActorId)) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_INDEPENDENT_APPROVER_REQUIRED",
    );
  }
  const approvalBase: Omit<AudiobookRetailListingApproval, "fingerprint"> = {
    finalConfirmationId: input.finalConfirmationId,
    approvedByActorId,
    approvedAt: approvedAt.toISOString(),
    reviewerSetFingerprint: reviewerSetFingerprint(identity),
    sourceSetFingerprint: sourceSetFingerprint(input.sources),
    publicationVerificationEligible: true,
  };
  const approval = Object.freeze({
    ...approvalBase,
    fingerprint: approvalFingerprint(approvalBase),
  });
  return reviseIdentity(
    identity,
    {
      status: "approved-for-publication-verification",
      approval,
    },
    approvedAt,
  );
}

export function assertAudiobookRetailListingIdentity(
  identity: AudiobookRetailListingIdentity,
): void {
  if (
    identity.schemaVersion !== AUDIOBOOK_RETAIL_LISTING_IDENTITY_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [identity.id, "AUDIOBOOK_RETAIL_LISTING_ID_INVALID"],
    [identity.projectId, "AUDIOBOOK_RETAIL_LISTING_PROJECT_ID_INVALID"],
    [identity.bookId, "AUDIOBOOK_RETAIL_LISTING_BOOK_ID_INVALID"],
    [identity.policy.id, "AUDIOBOOK_RETAIL_LISTING_POLICY_ID_INVALID"],
    [identity.packageManifest.id, "AUDIOBOOK_RETAIL_LISTING_MANIFEST_ID_INVALID"],
    [identity.credits.opening.id, "AUDIOBOOK_RETAIL_LISTING_OPENING_CREDIT_ID_INVALID"],
    [identity.credits.closing.id, "AUDIOBOOK_RETAIL_LISTING_CLOSING_CREDIT_ID_INVALID"],
    [identity.cover.evidenceId, "AUDIOBOOK_RETAIL_LISTING_COVER_EVIDENCE_ID_INVALID"],
    [identity.cover.artifactId, "AUDIOBOOK_RETAIL_LISTING_COVER_ARTIFACT_ID_INVALID"],
    [identity.ebook.evidenceId, "AUDIOBOOK_RETAIL_LISTING_EBOOK_EVIDENCE_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  for (const [value, code] of [
    [identity.policy.fingerprint, "AUDIOBOOK_RETAIL_LISTING_POLICY_HASH_INVALID"],
    [identity.packageManifest.fingerprint, "AUDIOBOOK_RETAIL_LISTING_MANIFEST_HASH_INVALID"],
    [identity.credits.metadataFingerprint, "AUDIOBOOK_RETAIL_LISTING_CREDIT_METADATA_HASH_INVALID"],
    [identity.credits.opening.fingerprint, "AUDIOBOOK_RETAIL_LISTING_OPENING_CREDIT_HASH_INVALID"],
    [identity.credits.opening.textHash, "AUDIOBOOK_RETAIL_LISTING_OPENING_TEXT_HASH_INVALID"],
    [identity.credits.opening.approvalFingerprint, "AUDIOBOOK_RETAIL_LISTING_OPENING_APPROVAL_HASH_INVALID"],
    [identity.credits.closing.fingerprint, "AUDIOBOOK_RETAIL_LISTING_CLOSING_CREDIT_HASH_INVALID"],
    [identity.credits.closing.textHash, "AUDIOBOOK_RETAIL_LISTING_CLOSING_TEXT_HASH_INVALID"],
    [identity.credits.closing.approvalFingerprint, "AUDIOBOOK_RETAIL_LISTING_CLOSING_APPROVAL_HASH_INVALID"],
    [identity.cover.evidenceFingerprint, "AUDIOBOOK_RETAIL_LISTING_COVER_EVIDENCE_HASH_INVALID"],
    [identity.cover.artifactFingerprint, "AUDIOBOOK_RETAIL_LISTING_COVER_ARTIFACT_HASH_INVALID"],
    [identity.cover.contentHash, "AUDIOBOOK_RETAIL_LISTING_COVER_CONTENT_HASH_INVALID"],
    [identity.cover.rightsFingerprint, "AUDIOBOOK_RETAIL_LISTING_COVER_RIGHTS_HASH_INVALID"],
    [identity.ebook.evidenceFingerprint, "AUDIOBOOK_RETAIL_LISTING_EBOOK_EVIDENCE_HASH_INVALID"],
    [identity.audiobookRightsFingerprint, "AUDIOBOOK_RETAIL_LISTING_RIGHTS_HASH_INVALID"],
  ] as const) requireHash(value, code);
  if (identity.distributor !== "acx-audible") {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_DISTRIBUTOR_INVALID",
    );
  }
  requireDate(identity.policy.reviewedAt, "AUDIOBOOK_RETAIL_LISTING_POLICY_DATE_INVALID");
  requireDate(identity.policy.expiresAt, "AUDIOBOOK_RETAIL_LISTING_POLICY_DATE_INVALID");
  requireInteger(
    identity.packageManifest.mediaFileCount,
    1,
    2_003,
    "AUDIOBOOK_RETAIL_LISTING_MEDIA_COUNT_INVALID",
  );
  requireInteger(
    identity.packageManifest.totalMediaBytes,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_LISTING_MEDIA_BYTES_INVALID",
  );
  requireInteger(
    identity.credits.opening.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_LISTING_CREDIT_REVISION_INVALID",
  );
  requireInteger(
    identity.credits.closing.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_LISTING_CREDIT_REVISION_INVALID",
  );
  assertMetadata(identity.metadata);
  requireInteger(
    identity.cover.artifactRevision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_LISTING_COVER_REVISION_INVALID",
  );
  for (const [value, minimum, maximum, code] of [
    [identity.cover.widthPx, 2_400, 32_768, "AUDIOBOOK_RETAIL_LISTING_COVER_WIDTH_INVALID"],
    [identity.cover.heightPx, 2_400, 32_768, "AUDIOBOOK_RETAIL_LISTING_COVER_HEIGHT_INVALID"],
    [identity.cover.dpi, 72, 2_400, "AUDIOBOOK_RETAIL_LISTING_COVER_DPI_INVALID"],
    [identity.cover.bitDepth, 24, 128, "AUDIOBOOK_RETAIL_LISTING_COVER_BIT_DEPTH_INVALID"],
  ] as const) requireInteger(value, minimum, maximum, code);
  if (identity.cover.widthPx !== identity.cover.heightPx) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_COVER_ASPECT_RATIO_INVALID",
    );
  }
  if (!/^[A-Z0-9]{10}$/u.test(identity.ebook.asin)) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_EBOOK_ASIN_INVALID",
    );
  }
  requireDate(identity.ebook.observedAt, "AUDIOBOOK_RETAIL_LISTING_EBOOK_DATE_INVALID");
  requireDate(identity.ebook.expiresAt, "AUDIOBOOK_RETAIL_LISTING_EBOOK_DATE_INVALID");
  if (stableHash(identity.requiredRoles) !== stableHash(REQUIRED_ROLES)) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_REQUIRED_ROLES_INVALID",
    );
  }
  if (!Array.isArray(identity.reviews) || identity.reviews.length > MAXIMUM_REVIEWS) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_REVIEWS_INVALID",
    );
  }
  const reviewIds = new Set<string>();
  let previousAt = Date.parse(identity.createdAt);
  for (const review of identity.reviews) {
    assertReviewEntry(review);
    if (reviewIds.has(review.id)) {
      throw new AudiobookRetailListingIdentityError(
        "AUDIOBOOK_RETAIL_LISTING_REVIEW_ID_DUPLICATE",
      );
    }
    reviewIds.add(review.id);
    const decidedAt = Date.parse(review.decidedAt);
    if (decidedAt < previousAt) {
      throw new AudiobookRetailListingIdentityError(
        "AUDIOBOOK_RETAIL_LISTING_TRANSITION_TIME_REVERSED",
      );
    }
    previousAt = decidedAt;
  }
  const latest = latestReviews(identity.reviews);
  if (
    new Set([...latest.values()].map((review) => review.reviewerId)).size
      !== latest.size
  ) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_INDEPENDENT_REVIEWERS_REQUIRED",
    );
  }
  const reviewStatus = statusFromReviews(identity.reviews);
  const expectedStatus = identity.approval
    ? "approved-for-publication-verification"
    : reviewStatus;
  if (identity.status !== expectedStatus) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_STATUS_MISMATCH",
    );
  }
  if (identity.approval) {
    if (reviewStatus !== "ready-for-approval") {
      throw new AudiobookRetailListingIdentityError(
        "AUDIOBOOK_RETAIL_LISTING_APPROVAL_WITHOUT_READY_REVIEWS",
      );
    }
    requireIdentifier(
      identity.approval.finalConfirmationId,
      "AUDIOBOOK_RETAIL_LISTING_CONFIRMATION_ID_INVALID",
    );
    requireHumanActor(
      identity.approval.approvedByActorId,
      "AUDIOBOOK_RETAIL_LISTING_APPROVER_INVALID",
    );
    requireDate(
      identity.approval.approvedAt,
      "AUDIOBOOK_RETAIL_LISTING_APPROVAL_DATE_INVALID",
    );
    for (const [value, code] of [
      [identity.approval.reviewerSetFingerprint, "AUDIOBOOK_RETAIL_LISTING_REVIEWER_SET_HASH_INVALID"],
      [identity.approval.sourceSetFingerprint, "AUDIOBOOK_RETAIL_LISTING_SOURCE_SET_HASH_INVALID"],
    ] as const) requireHash(value, code);
    if (
      identity.approval.publicationVerificationEligible !== true
      || identity.approval.reviewerSetFingerprint
        !== reviewerSetFingerprint(identity)
    ) {
      throw new AudiobookRetailListingIdentityError(
        "AUDIOBOOK_RETAIL_LISTING_APPROVAL_STATE_INVALID",
      );
    }
    const { fingerprint, ...partial } = identity.approval;
    if (approvalFingerprint(partial) !== fingerprint) {
      throw new AudiobookRetailListingIdentityError(
        "AUDIOBOOK_RETAIL_LISTING_APPROVAL_FINGERPRINT_INVALID",
      );
    }
  }
  requireInteger(
    identity.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_LISTING_REVISION_INVALID",
  );
  requireDate(identity.createdAt, "AUDIOBOOK_RETAIL_LISTING_DATE_INVALID");
  requireDate(identity.updatedAt, "AUDIOBOOK_RETAIL_LISTING_DATE_INVALID");
  if (
    Date.parse(identity.updatedAt) < previousAt
    || (identity.revision === 1 && identity.previousFingerprint !== undefined)
    || (
      identity.revision > 1
      && !HASH_PATTERN.test(identity.previousFingerprint ?? "")
    )
  ) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_REVISION_CHAIN_INVALID",
    );
  }
  const { fingerprint, ...partial } = identity;
  if (identityFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailListingIdentityMatchesSources(
  identity: AudiobookRetailListingIdentity,
  sources: AudiobookRetailListingIdentitySources,
  now = new Date(identity.updatedAt),
): void {
  assertAudiobookRetailListingIdentity(identity);
  const metadata = assertSources(sources, now);
  if (
    identity.projectId !== sources.packageManifest.projectId
    || identity.bookId !== sources.packageManifest.bookId
    || identity.policy.id !== sources.policy.id
    || identity.policy.externalVersion !== sources.policy.externalVersion
    || identity.policy.reviewedAt !== sources.policy.reviewedAt
    || identity.policy.expiresAt !== sources.policy.expiresAt
    || identity.policy.fingerprint !== sources.policy.fingerprint
    || identity.packageManifest.id !== sources.packageManifest.id
    || identity.packageManifest.fingerprint !== sources.packageManifest.fingerprint
    || identity.packageManifest.mediaFileCount
      !== sources.packageManifest.mediaFileCount
    || identity.packageManifest.totalMediaBytes
      !== sources.packageManifest.totalMediaBytes
    || identity.credits.metadataFingerprint
      !== sources.openingCredit.metadataFingerprint
    || identity.credits.opening.id !== sources.openingCredit.id
    || identity.credits.opening.revision !== sources.openingCredit.revision
    || identity.credits.opening.fingerprint !== sources.openingCredit.fingerprint
    || identity.credits.opening.textHash !== sources.openingCredit.textHash
    || identity.credits.opening.approvalFingerprint
      !== sources.openingCredit.approval!.fingerprint
    || identity.credits.closing.id !== sources.closingCredit.id
    || identity.credits.closing.revision !== sources.closingCredit.revision
    || identity.credits.closing.fingerprint !== sources.closingCredit.fingerprint
    || identity.credits.closing.textHash !== sources.closingCredit.textHash
    || identity.credits.closing.approvalFingerprint
      !== sources.closingCredit.approval!.fingerprint
    || identity.metadata.fingerprint !== metadata.fingerprint
    || identity.cover.evidenceId !== sources.coverEvidence.id
    || identity.cover.evidenceFingerprint !== sources.coverEvidence.fingerprint
    || identity.cover.artifactId !== sources.coverArtifact.id
    || identity.cover.artifactRevision !== sources.coverArtifact.revision
    || identity.cover.artifactFingerprint !== sources.coverArtifact.fingerprint
    || identity.cover.contentHash !== sources.coverArtifact.integrity.contentHash
    || identity.cover.rightsFingerprint
      !== sources.coverArtifact.rights.rightsFingerprint
    || identity.ebook.evidenceId !== sources.ebookEvidence.id
    || identity.ebook.evidenceFingerprint !== sources.ebookEvidence.fingerprint
    || identity.ebook.asin !== sources.ebookEvidence.asin
    || identity.ebook.expiresAt !== sources.ebookEvidence.expiresAt
    || identity.audiobookRightsFingerprint
      !== sources.audiobookRights.rightsFingerprint
  ) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_SOURCE_MISMATCH",
    );
  }
  if (
    identity.approval
    && identity.approval.sourceSetFingerprint !== sourceSetFingerprint(sources)
  ) {
    throw new AudiobookRetailListingIdentityError(
      "AUDIOBOOK_RETAIL_LISTING_APPROVED_SOURCE_SET_MISMATCH",
    );
  }
}

export function audiobookRetailListingIdentityPublicView(
  identity: AudiobookRetailListingIdentity,
): AudiobookRetailListingIdentityPublicView {
  assertAudiobookRetailListingIdentity(identity);
  const latest = latestReviews(identity.reviews);
  const findingCodes = new Set<string>();
  for (const review of latest.values()) {
    for (const code of review.findingCodes) findingCodes.add(code);
  }
  return Object.freeze({
    id: identity.id,
    bookId: identity.bookId,
    distributor: "acx-audible",
    policyVersion: identity.policy.externalVersion,
    title: identity.metadata.title,
    displayTitle: identity.metadata.displayTitle,
    ...(identity.metadata.subtitle
      ? { subtitle: identity.metadata.subtitle }
      : {}),
    authorCredit: identity.metadata.authorCredit,
    narratorCredit: identity.metadata.narratorCredit,
    publisherName: identity.metadata.publisherName,
    languageTag: identity.metadata.languageTag,
    description: identity.metadata.description,
    projectKind: identity.metadata.projectKind,
    ...(identity.metadata.seriesTitle
      ? { seriesTitle: identity.metadata.seriesTitle }
      : {}),
    ...(identity.metadata.volumeNumber !== undefined
      ? { volumeNumber: identity.metadata.volumeNumber }
      : {}),
    copyrightNotice: identity.metadata.copyrightNotice,
    cover: Object.freeze({
      format: identity.cover.format,
      widthPx: identity.cover.widthPx,
      heightPx: identity.cover.heightPx,
      dpi: identity.cover.dpi,
      bitDepth: identity.cover.bitDepth,
    }),
    ebook: Object.freeze({
      marketplace: "amazon",
      asin: identity.ebook.asin,
      available: true,
      evidenceExpiresAt: identity.ebook.expiresAt,
    }),
    reviewCount: identity.reviews.length,
    reviewerCount:
      new Set([...latest.values()].map((review) => review.reviewerId)).size,
    latestDecisions: Object.freeze({
      editorial: latest.get("editorial")?.decision ?? "pending",
      rights: latest.get("rights")?.decision ?? "pending",
      merchandising: latest.get("merchandising")?.decision ?? "pending",
    }),
    findingCodes: Object.freeze(
      [...findingCodes].sort((left, right) => left.localeCompare(right, "en-AU")),
    ),
    status: identity.status,
    readyForApproval: identity.status === "ready-for-approval",
    publicationVerificationEligible:
      identity.status === "approved-for-publication-verification",
    ...(identity.approval ? { approvedAt: identity.approval.approvedAt } : {}),
    revision: identity.revision,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt,
    fingerprint: identity.fingerprint,
  });
}

function payload(
  identity: AudiobookRetailListingIdentity,
): Record<string, unknown> {
  return identity as unknown as Record<string, unknown>;
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<AudiobookRetailListingIdentity> {
  const identity = envelope.payload as unknown as AudiobookRetailListingIdentity;
  assertAudiobookRetailListingIdentity(identity);
  if (
    envelope.entityType !== AUDIOBOOK_RETAIL_LISTING_IDENTITY_ENTITY_TYPE
    || envelope.entityId !== identity.id
    || envelope.revision !== identity.revision
  ) {
    throw new AudiobookRetailListingIdentityStoreConflictError(
      "AUDIOBOOK_RETAIL_LISTING_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<AudiobookRetailListingIdentity>;
}

export class FileAudiobookRetailListingIdentityStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    identity: AudiobookRetailListingIdentity,
    actorId: string,
  ): Promise<StoredEnvelope<AudiobookRetailListingIdentity>> {
    assertAudiobookRetailListingIdentity(identity);
    requireIdentifier(actorId, "AUDIOBOOK_RETAIL_LISTING_STORE_ACTOR_INVALID");
    const existing = await this.read(identity.id);
    if (existing) {
      if (existing.payload.fingerprint === identity.fingerprint) return existing;
      throw new AudiobookRetailListingIdentityStoreConflictError(
        "AUDIOBOOK_RETAIL_LISTING_STORE_IDEMPOTENCY_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.create(
        AUDIOBOOK_RETAIL_LISTING_IDENTITY_ENTITY_TYPE,
        identity.id,
        payload(identity),
        new Date(identity.createdAt),
      ));
      await this.#audit(actorId, "audiobook_retail_listing_identity.created", envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailListingIdentityStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(
    identityId: string,
  ): Promise<StoredEnvelope<AudiobookRetailListingIdentity> | null> {
    requireIdentifier(identityId, "AUDIOBOOK_RETAIL_LISTING_STORE_ID_INVALID");
    const envelope = await this.#store.read<Record<string, unknown>>(
      AUDIOBOOK_RETAIL_LISTING_IDENTITY_ENTITY_TYPE,
      identityId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(
    identityId: string,
  ): Promise<StoredEnvelope<AudiobookRetailListingIdentity>> {
    const envelope = await this.read(identityId);
    if (!envelope) {
      throw new AudiobookRetailListingIdentityStoreConflictError(
        "AUDIOBOOK_RETAIL_LISTING_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }

  async save(
    identity: AudiobookRetailListingIdentity,
    input: Readonly<{
      expectedRevision: number;
      actorId: string;
      action: string;
    }>,
  ): Promise<StoredEnvelope<AudiobookRetailListingIdentity>> {
    assertAudiobookRetailListingIdentity(identity);
    requireIdentifier(
      input.actorId,
      "AUDIOBOOK_RETAIL_LISTING_STORE_ACTOR_INVALID",
    );
    if (
      !/^audiobook_retail_listing_identity\.[a-z][a-z0-9._-]{1,80}$/u.test(
        input.action,
      )
    ) {
      throw new AudiobookRetailListingIdentityStoreConflictError(
        "AUDIOBOOK_RETAIL_LISTING_STORE_ACTION_INVALID",
      );
    }
    const current = await this.require(identity.id);
    if (
      current.revision !== input.expectedRevision
      || identity.revision !== current.payload.revision + 1
      || identity.previousFingerprint !== current.payload.fingerprint
    ) {
      throw new AudiobookRetailListingIdentityStoreConflictError(
        "AUDIOBOOK_RETAIL_LISTING_STORE_REVISION_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.replace(
        AUDIOBOOK_RETAIL_LISTING_IDENTITY_ENTITY_TYPE,
        identity.id,
        input.expectedRevision,
        payload(identity),
        new Date(identity.updatedAt),
      ));
      await this.#audit(input.actorId, input.action, envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailListingIdentityStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async #audit(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<AudiobookRetailListingIdentity>,
  ): Promise<void> {
    const latest = latestReviews(envelope.payload.reviews);
    const findingCodes = new Set<string>();
    for (const review of latest.values()) {
      for (const code of review.findingCodes) findingCodes.add(code);
    }
    await this.#store.appendAuditEvent({
      actorId,
      action,
      entityType: AUDIOBOOK_RETAIL_LISTING_IDENTITY_ENTITY_TYPE,
      entityId: envelope.entityId,
      revision: envelope.revision,
      occurredAt: new Date(envelope.savedAt),
      metadata: {
        status: envelope.payload.status,
        projectKind: envelope.payload.metadata.projectKind,
        descriptionCharacterCount:
          envelope.payload.metadata.descriptionCharacterCount,
        reviewCount: envelope.payload.reviews.length,
        reviewerCount:
          new Set([...latest.values()].map((review) => review.reviewerId)).size,
        findingCount: findingCodes.size,
        mediaFileCount: envelope.payload.packageManifest.mediaFileCount,
        coverFormat: envelope.payload.cover.format,
        ebookAvailable: true,
        publicationVerificationEligible:
          envelope.payload.status === "approved-for-publication-verification",
      },
    });
  }
}
