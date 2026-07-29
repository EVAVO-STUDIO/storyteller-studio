import {
  createArtifactRecord,
  recordArtifactReview,
  verifyArtifactIntegrity,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "../artifact-registry.js";
import {
  approveAudiobookRetailListingIdentity,
  createAudiobookRetailListingIdentity,
  recordAudiobookRetailListingReview,
  type AudiobookRetailListingIdentity,
  type AudiobookRetailListingIdentitySources,
} from "../audiobook-retail-listing-identity.js";
import {
  createAcxAudibleRetailListingPolicy,
  createAudiobookRetailCoverEvidence,
  createAudiobookRetailEbookAvailabilityEvidence,
} from "../audiobook-retail-listing-policy.js";
import {
  createAudiobookRetailSubmissionDecision,
  type AudiobookRetailSubmissionDecision,
  type AudiobookRetailSubmissionDecisionSources,
} from "../audiobook-retail-submission-decision.js";
import {
  recordAudiobookRetailSubmissionReceipt,
  startAudiobookRetailSubmissionAttempt,
  type AudiobookRetailSubmissionAttempt,
} from "../audiobook-retail-submission-attempt.js";
import {
  createAudiobookRetailerStatusEvidence,
  type AudiobookRetailerStatusEvidence,
} from "../audiobook-retailer-status-evidence.js";
import {
  approveBookCreditScript,
  createBookCreditPolicy,
  createBookCreditScript,
  recordBookCreditReview,
  type BookCreditMetadata,
  type BookCreditPolicy,
  type BookCreditScript,
} from "../book-credit-script.js";
import { retailReleaseAt } from "./retail-release-policy-fixture.js";
import {
  retailSubmissionReviewFixture,
  type RetailSubmissionReviewFixture,
} from "./retail-submission-review-fixture.js";

const coverChecks = Object.freeze([
  "dimensions-confirmed",
  "square-aspect-confirmed",
  "rgb-confirmed",
  "bit-depth-confirmed",
  "dpi-confirmed",
  "title-text-confirmed",
  "author-text-confirmed",
  "prohibited-elements-absent",
]);

function coverRights(): ArtifactRightsSnapshot {
  return Object.freeze({
    rightsEvidenceId: "rights_publication_fixture_cover_001",
    rightsFingerprint: "9".repeat(64),
    allowedUses: Object.freeze(["audiobook"] as const),
    commercialUseApproved: true,
    expiresAt: "2026-08-20T00:00:00.000Z",
    retainUntil: "2033-07-29T00:00:00.000Z",
    deletionRequiredAt: "2034-07-29T00:00:00.000Z",
  });
}

function approvedCoverArtifact(
  projectId: string,
  bookId: string,
): ArtifactRecord {
  const created = createArtifactRecord({
    id: "artifact_publication_fixture_cover_001",
    kind: "visual-render",
    projectId,
    jobId: "job_publication_fixture_cover_001",
    segmentId: bookId,
    takeId: "take_publication_fixture_cover_001",
    storage: {
      driver: "local-private-file",
      provider: "storyteller-publication-fixture",
      container: "private-publication-fixtures",
      objectKey: "covers/publication-fixture-cover-001.png",
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: "8".repeat(64),
      byteCount: 2_400_000,
      mimeType: "image/png",
      format: "png",
    },
    provenance: {
      createdByActorId: "publication_fixture_cover_designer_001",
      sourceContentHash: "7".repeat(64),
      generationRequestHash: "6".repeat(64),
      providerId: "storyteller_cover_renderer",
      adapterVersion: "1.0.0",
      providerRequestId: "publication-cover-render-fixture-001",
      parentArtifactIds: Object.freeze([]),
    },
    rights: coverRights(),
    reviewRequired: true,
  }, retailReleaseAt(14));
  const verified = verifyArtifactIntegrity(created, {
    observedContentHash: created.integrity.contentHash,
    observedByteCount: created.integrity.byteCount,
    checkedByActorId: "publication_fixture_cover_verifier_001",
    checks: ["sha256", "byte-count", "image-signature"],
    checkedAt: retailReleaseAt(15),
  });
  return recordArtifactReview(verified, {
    decision: "approved",
    reviewerId: "publication_fixture_cover_reviewer_001",
    notes: "Approved public-listing fixture cover.",
    decidedAt: retailReleaseAt(16),
  });
}

function creditPolicy(): BookCreditPolicy {
  return createBookCreditPolicy({
    id: "book_credit_policy_publication_fixture_001",
    version: "publication-2026-07",
    languageTag: "en-AU",
    reviewedAt: "2026-07-27T00:00:00.000Z",
    sourceReference: "approved-publication-credit-policy-2026-07",
    maximumWords: 100,
    templates: [
      {
        kind: "opening",
        projectKind: "standalone",
        text: "{title}, written by {authorCredit}, narrated by {narratorCredit}.",
        requiredTokens: ["title", "authorCredit", "narratorCredit"],
      },
      {
        kind: "closing",
        projectKind: "standalone",
        text: "You have been listening to {title}, written by {authorCredit}, narrated by {narratorCredit}. {copyrightNotice}. {productionCredit}",
        requiredTokens: [
          "title",
          "authorCredit",
          "narratorCredit",
          "copyrightNotice",
          "productionCredit",
        ],
      },
      {
        kind: "opening",
        projectKind: "series",
        text: "{title}, {seriesTitle}, volume {volumeNumber}, written by {authorCredit}, narrated by {narratorCredit}.",
        requiredTokens: [
          "title",
          "seriesTitle",
          "volumeNumber",
          "authorCredit",
          "narratorCredit",
        ],
      },
      {
        kind: "closing",
        projectKind: "series",
        text: "You have been listening to {title}, {seriesTitle}, volume {volumeNumber}, written by {authorCredit}, narrated by {narratorCredit}. {copyrightNotice}.",
        requiredTokens: [
          "title",
          "seriesTitle",
          "volumeNumber",
          "authorCredit",
          "narratorCredit",
          "copyrightNotice",
        ],
      },
    ],
    now: retailReleaseAt(14),
  });
}

function creditMetadata(bookId: string): BookCreditMetadata {
  return Object.freeze({
    bookId,
    title: "The Lantern: A Harbour Story",
    projectKind: "standalone",
    authorCredit: "Greg Parker",
    narratorCredit: "Naomi Mabvurira",
    copyrightNotice: "Copyright 2026 Greg Parker",
    productionCredit: "Produced by EVAVO Studio.",
  });
}

function approvedCredit(input: Readonly<{
  projectId: string;
  metadata: BookCreditMetadata;
  policy: BookCreditPolicy;
  kind: "opening" | "closing";
}>): BookCreditScript {
  const suffix = input.kind === "opening" ? "open" : "close";
  let script = createBookCreditScript({
    id: `book_credit_publication_fixture_${suffix}_001`,
    projectId: input.projectId,
    kind: input.kind,
    metadata: input.metadata,
    policy: input.policy,
    createdAt: retailReleaseAt(14),
  });
  script = recordBookCreditReview(script, {
    id: `book_credit_publication_fixture_${suffix}_editorial_001`,
    role: "editorial",
    reviewerId: `publication_credit_editor_${suffix}_001`,
    decision: "approve",
    checks: [
      "title-exact",
      "author-credit-exact",
      "narrator-credit-exact",
      "pronunciations-confirmed",
    ],
    decidedAt: retailReleaseAt(15),
  });
  script = recordBookCreditReview(script, {
    id: `book_credit_publication_fixture_${suffix}_rights_001`,
    role: "rights",
    reviewerId: `publication_credit_rights_${suffix}_001`,
    decision: "approve",
    checks: [
      "copyright-notice-confirmed",
      "credit-entitlements-confirmed",
      "commercial-use-confirmed",
    ],
    decidedAt: retailReleaseAt(16),
  });
  return approveBookCreditScript(script, {
    finalConfirmationId: `book_credit_publication_fixture_${suffix}_confirmation_001`,
    approvedByActorId: `publication_credit_manager_${suffix}_001`,
    humanConfirmation: true,
    approvedAt: retailReleaseAt(17),
  });
}

function approvedListingIdentity(
  reviewFixture: RetailSubmissionReviewFixture,
): AudiobookRetailListingIdentity {
  const { release } = reviewFixture;
  const listingPolicy = createAcxAudibleRetailListingPolicy({
    id: "retail_listing_policy_publication_fixture_001",
    externalVersion: "acx-listing-2026-07",
    reviewedAt: "2026-07-27T00:00:00.000Z",
    expiresAt: "2027-07-27T00:00:00.000Z",
    sourceReference: "acx-title-profile-cover-and-content-requirements-reviewed-2026-07",
    now: retailReleaseAt(18),
  });
  const metadata = creditMetadata(release.manifest.bookId);
  const policy = creditPolicy();
  const openingCredit = approvedCredit({
    projectId: release.manifest.projectId,
    metadata,
    policy,
    kind: "opening",
  });
  const closingCredit = approvedCredit({
    projectId: release.manifest.projectId,
    metadata,
    policy,
    kind: "closing",
  });
  const coverArtifact = approvedCoverArtifact(
    release.manifest.projectId,
    release.manifest.bookId,
  );
  const coverEvidence = createAudiobookRetailCoverEvidence({
    id: "retail_cover_evidence_publication_fixture_001",
    projectId: release.manifest.projectId,
    bookId: release.manifest.bookId,
    policy: listingPolicy,
    artifact: coverArtifact,
    widthPx: 2_400,
    heightPx: 2_400,
    dpi: 300,
    bitDepth: 24,
    colorSpace: "rgb",
    titleText: "The Lantern: A Harbour Story",
    authorText: "Greg Parker",
    titleAuthorMatchConfirmed: true,
    prohibitedElementsAbsent: true,
    checks: coverChecks,
    observedByActorId: "publication_fixture_cover_observer_001",
    observedAt: retailReleaseAt(18).toISOString(),
    now: retailReleaseAt(18),
  });
  const ebookEvidence = createAudiobookRetailEbookAvailabilityEvidence({
    id: "retail_ebook_publication_fixture_001",
    projectId: release.manifest.projectId,
    bookId: release.manifest.bookId,
    asin: "B0LISTING1",
    productReferenceHash: "5".repeat(64),
    observedByActorId: "publication_fixture_ebook_observer_001",
    observedAt: retailReleaseAt(18).toISOString(),
    expiresAt: "2026-08-05T00:00:00.000Z",
    now: retailReleaseAt(18),
  });
  const sources: AudiobookRetailListingIdentitySources = {
    policy: listingPolicy,
    packageManifest: release.manifest,
    creditPolicy: policy,
    creditMetadata: metadata,
    openingCredit,
    closingCredit,
    listingMetadata: Object.freeze({
      title: "The Lantern",
      subtitle: "A Harbour Story",
      authorCredit: "Greg Parker",
      narratorCredit: "Naomi Mabvurira",
      publisherName: "EVAVO Studio",
      languageTag: "en-AU",
      description: "A restrained maritime mystery about memory, obligation and the light that draws a divided harbour community together.",
      projectKind: "standalone",
      copyrightNotice: "Copyright 2026 Greg Parker",
      productionCredit: "Produced by EVAVO Studio.",
    }),
    coverEvidence,
    coverArtifact,
    ebookEvidence,
    audiobookRights: release.rights,
  };
  let identity = createAudiobookRetailListingIdentity({
    id: "retail_listing_identity_publication_fixture_001",
    sources,
    createdAt: retailReleaseAt(20),
  });
  identity = recordAudiobookRetailListingReview(identity, {
    id: "retail_listing_publication_editorial_001",
    role: "editorial",
    reviewerId: "retail_listing_publication_editor_001",
    decision: "approve",
    checks: [
      "title-author-narrator-match-spoken-credits",
      "description-accurate",
      "language-confirmed",
      "series-metadata-confirmed",
    ],
    decidedAt: retailReleaseAt(21),
  });
  identity = recordAudiobookRetailListingReview(identity, {
    id: "retail_listing_publication_rights_001",
    role: "rights",
    reviewerId: "retail_listing_publication_rights_reviewer_001",
    decision: "approve",
    checks: [
      "audiobook-rights-current",
      "cover-rights-current",
      "copyright-confirmed",
      "ebook-association-confirmed",
    ],
    decidedAt: retailReleaseAt(22),
  });
  identity = recordAudiobookRetailListingReview(identity, {
    id: "retail_listing_publication_merchandising_001",
    role: "merchandising",
    reviewerId: "retail_listing_publication_merchandiser_001",
    decision: "approve",
    checks: [
      "cover-technical-compliance",
      "cover-text-match",
      "description-within-limit",
      "prohibited-elements-absent",
      "ebook-availability-confirmed",
    ],
    decidedAt: retailReleaseAt(23),
  });
  return approveAudiobookRetailListingIdentity(identity, {
    sources,
    finalConfirmationId: "retail_listing_publication_confirmation_001",
    approvedByActorId: "retail_listing_publication_approver_001",
    humanConfirmation: true,
    approvedAt: retailReleaseAt(24),
  });
}

export interface RetailPublicationVerificationFixture {
  reviewFixture: RetailSubmissionReviewFixture;
  submissionDecision: AudiobookRetailSubmissionDecision;
  submissionAttempt: AudiobookRetailSubmissionAttempt;
  retailerStatus: AudiobookRetailerStatusEvidence;
  listingIdentity: AudiobookRetailListingIdentity;
}

export function retailPublicationVerificationFixture(): RetailPublicationVerificationFixture {
  const reviewFixture = retailSubmissionReviewFixture();
  const decisionSources: AudiobookRetailSubmissionDecisionSources = {
    submissionReview: reviewFixture.submissionReview,
    deliveryAttempt: reviewFixture.deliveryAttempt,
    releaseDecision: reviewFixture.releaseDecision,
    packageReview: reviewFixture.release.packageReview,
    inspection: reviewFixture.release.inspection,
    packageManifest: reviewFixture.release.manifest,
    trackPlan: reviewFixture.release.plan,
    policy: reviewFixture.release.policy,
    narration: reviewFixture.release.narration,
    rights: reviewFixture.release.rights,
    distributorAccount: reviewFixture.release.account,
  };
  const submissionDecision = createAudiobookRetailSubmissionDecision({
    sources: decisionSources,
    finalConfirmationId: "publication_fixture_submission_confirmation_001",
    decidedByActorId: "publication_fixture_submission_authority_001",
    humanConfirmation: true,
    submissionMethod: "manual-acx-submit",
    decidedAt: retailReleaseAt(17),
    validUntil: retailReleaseAt(30).toISOString(),
  });
  const started = startAudiobookRetailSubmissionAttempt({
    submissionDecision,
    submissionReview: reviewFixture.submissionReview,
    deliveryAttempt: reviewFixture.deliveryAttempt,
    distributorAccount: reviewFixture.release.account,
    operatorId: "publication_fixture_submission_operator_001",
    humanOperationConfirmed: true,
    startedAt: retailReleaseAt(18),
  });
  const submissionAttempt = recordAudiobookRetailSubmissionReceipt(started, {
    submissionReceiptHash: "a".repeat(64),
    retailerSubmissionReferenceHash: "b".repeat(64),
    mediaFileCountAcknowledged: started.package.mediaFileCount,
    allApprovedFilesIncluded: true,
    submissionAcceptedForProcessing: true,
    submissionInitiated: true,
    retailerAcceptanceClaimed: false,
    listingPublished: false,
    completedByActorId: "publication_fixture_submission_operator_001",
    humanConfirmation: true,
    completedAt: retailReleaseAt(19),
  });
  const retailerStatus = createAudiobookRetailerStatusEvidence({
    submissionAttempt,
    submissionDecision,
    submissionReview: reviewFixture.submissionReview,
    distributorAccount: reviewFixture.release.account,
    normalisedStatus: "accepted-awaiting-publication",
    externalStatusReferenceHash: "c".repeat(64),
    externalStatusTextHash: "d".repeat(64),
    retailerAcceptanceConfirmed: true,
    publicationConfirmed: false,
    liveConfirmed: false,
    observedByActorId: "publication_fixture_retailer_status_observer_001",
    humanObservationConfirmed: true,
    observedAt: retailReleaseAt(20),
  });
  return Object.freeze({
    reviewFixture,
    submissionDecision,
    submissionAttempt,
    retailerStatus,
    listingIdentity: approvedListingIdentity(reviewFixture),
  });
}
