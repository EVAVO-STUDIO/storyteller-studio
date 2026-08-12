import {
  createArtifactRecord,
  recordArtifactReview,
  verifyArtifactIntegrity,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "../src/artifact-registry.js";
import type {
  AudiobookRetailListingIdentitySources,
  AudiobookRetailListingReviewRole,
} from "../src/audiobook-retail-listing-identity.js";
import {
  createAcxAudibleRetailListingPolicy,
  createAudiobookRetailCoverEvidence,
  createAudiobookRetailEbookAvailabilityEvidence,
} from "../src/audiobook-retail-listing-policy.js";
import {
  approveBookCreditScript,
  createBookCreditPolicy,
  createBookCreditScript,
  recordBookCreditReview,
  type BookCreditMetadata,
  type BookCreditPolicy,
  type BookCreditScript,
} from "../src/book-credit-script.js";
import {
  approveAdmittedNarratorRetailListingIdentity,
  createAdmittedNarratorRetailListingIdentity,
  recordAdmittedNarratorRetailListingReview,
  type AdmittedNarratorRetailListingIdentity,
} from "../src/narrator-retail-listing-admission.js";
import {
  createTestAdmittedNarratorRetailerStatusFixture,
  type TestAdmittedNarratorRetailerStatusFixture,
} from "./narrator-retail-status-admission.js";

export interface TestAdmittedNarratorRetailListingFixture {
  retailerStatus: TestAdmittedNarratorRetailerStatusFixture;
  sources: AudiobookRetailListingIdentitySources;
  draft: AdmittedNarratorRetailListingIdentity;
  reviewed: AdmittedNarratorRetailListingIdentity;
  approved: AdmittedNarratorRetailListingIdentity;
}

const at = (minute: number): Date =>
  new Date(`2026-08-10T12:${String(minute).padStart(2, "0")}:00.000Z`);

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

const metadata = (bookId: string): BookCreditMetadata => Object.freeze({
  bookId,
  title: "Admission Bound Narrator Book",
  projectKind: "standalone",
  authorCredit: "EVAVO Author",
  narratorCredit: "EVAVO Narrator",
  copyrightNotice: "Copyright 2026 Rights Holder.",
});

function listingCreditPolicy(): BookCreditPolicy {
  return createBookCreditPolicy({
    id: "credit_policy_narrator_listing_validation_001",
    version: "2026.08-listing-validation",
    languageTag: "en-AU",
    reviewedAt: "2026-08-01T00:00:00.000Z",
    sourceReference: "Reviewed narrator listing credit validation policy.",
    maximumWords: 120,
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
        text: "You have been listening to {title}, written by {authorCredit}, narrated by {narratorCredit}. {copyrightNotice}",
        requiredTokens: [
          "title",
          "authorCredit",
          "narratorCredit",
          "copyrightNotice",
        ],
      },
      {
        kind: "opening",
        projectKind: "series",
        text: "{title}, volume {volumeNumber} of {seriesTitle}, written by {authorCredit}, narrated by {narratorCredit}.",
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
        text: "You have been listening to {title}, volume {volumeNumber} of {seriesTitle}, written by {authorCredit}, narrated by {narratorCredit}. {copyrightNotice}",
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
    now: at(16),
  });
}

function approvedValidationCredit(input: Readonly<{
  projectId: string;
  metadata: BookCreditMetadata;
  policy: BookCreditPolicy;
  kind: "opening" | "closing";
}>): BookCreditScript {
  let script = createBookCreditScript({
    id: `narrator_listing_validation_credit_${input.kind}_001`,
    projectId: input.projectId,
    kind: input.kind,
    metadata: input.metadata,
    policy: input.policy,
    createdAt: at(16),
  });
  script = recordBookCreditReview(script, {
    id: `narrator_listing_validation_${input.kind}_editorial_001`,
    role: "editorial",
    reviewerId: `narrator-listing-credit-editor-${input.kind}`,
    decision: "approve",
    checks: [
      "title-exact",
      "author-credit-exact",
      "narrator-credit-exact",
      "pronunciations-confirmed",
    ],
    decidedAt: at(17),
  });
  script = recordBookCreditReview(script, {
    id: `narrator_listing_validation_${input.kind}_rights_001`,
    role: "rights",
    reviewerId: `narrator-listing-credit-rights-${input.kind}`,
    decision: "approve",
    checks: [
      "copyright-notice-confirmed",
      "credit-entitlements-confirmed",
      "commercial-use-confirmed",
    ],
    decidedAt: at(18),
  });
  return approveBookCreditScript(script, {
    finalConfirmationId:
      `narrator_listing_validation_${input.kind}_confirmation_001`,
    approvedByActorId: `narrator-listing-credit-approver-${input.kind}`,
    humanConfirmation: true,
    approvedAt: at(19),
  });
}

function coverRights(): ArtifactRightsSnapshot {
  return Object.freeze({
    rightsEvidenceId: "rights_narrator_listing_cover_001",
    rightsFingerprint: "9".repeat(64),
    allowedUses: Object.freeze(["audiobook"] as const),
    commercialUseApproved: true,
    expiresAt: "2028-08-10T00:00:00.000Z",
    retainUntil: "2033-08-10T00:00:00.000Z",
    deletionRequiredAt: "2034-08-10T00:00:00.000Z",
  });
}

function approvedCoverArtifact(projectId: string, bookId: string): ArtifactRecord {
  const created = createArtifactRecord({
    id: `artifact_narrator_listing_cover_${bookId}`,
    kind: "visual-render",
    projectId,
    jobId: `job_narrator_listing_cover_${bookId}`,
    segmentId: bookId,
    takeId: `take_narrator_listing_cover_${bookId}`,
    storage: {
      driver: "local-private-file",
      provider: "storyteller-narrator-listing-fixture",
      container: "private-narrator-listing-fixtures",
      objectKey: `covers/${bookId}.png`,
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
      createdByActorId: "narrator-listing-cover-designer",
      sourceContentHash: "7".repeat(64),
      generationRequestHash: "6".repeat(64),
      providerId: "storyteller_cover_renderer",
      adapterVersion: "1.0.0",
      providerRequestId: `narrator-listing-cover-render-${bookId}`,
      parentArtifactIds: Object.freeze([]),
    },
    rights: coverRights(),
    reviewRequired: true,
  }, at(19));
  const verified = verifyArtifactIntegrity(created, {
    observedContentHash: created.integrity.contentHash,
    observedByteCount: created.integrity.byteCount,
    checkedByActorId: "narrator-listing-cover-verifier",
    checks: ["sha256", "byte-count", "image-signature"],
    checkedAt: at(20),
  });
  return recordArtifactReview(verified, {
    decision: "approved",
    reviewerId: "narrator-listing-cover-reviewer",
    notes: "Approved narrator-bound retail listing cover fixture.",
    decidedAt: at(21),
  });
}

export function createTestAdmittedNarratorRetailListingSources(
  retailerStatus: TestAdmittedNarratorRetailerStatusFixture,
): AudiobookRetailListingIdentitySources {
  const status = retailerStatus.statusEvidence;
  const packageApproval =
    status.submission.decision.review.delivery.release.packageApproval;
  const listingPolicy = createAcxAudibleRetailListingPolicy({
    id: `retail_listing_policy_${status.bookId}`,
    externalVersion: "acx-listing-2026-08",
    reviewedAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2027-08-01T00:00:00.000Z",
    sourceReference:
      "acx-title-profile-cover-and-content-requirements-reviewed-2026-08",
    now: at(20),
  });
  const creditMetadata = metadata(status.bookId);
  const creditPolicy = listingCreditPolicy();
  const openingCredit = approvedValidationCredit({
    projectId: status.projectId,
    metadata: creditMetadata,
    policy: creditPolicy,
    kind: "opening",
  });
  const closingCredit = approvedValidationCredit({
    projectId: status.projectId,
    metadata: creditMetadata,
    policy: creditPolicy,
    kind: "closing",
  });
  const coverArtifact = approvedCoverArtifact(status.projectId, status.bookId);
  const coverEvidence = createAudiobookRetailCoverEvidence({
    id: `retail_cover_evidence_${status.bookId}`,
    projectId: status.projectId,
    bookId: status.bookId,
    policy: listingPolicy,
    artifact: coverArtifact,
    widthPx: 2_400,
    heightPx: 2_400,
    dpi: 300,
    bitDepth: 24,
    colorSpace: "rgb",
    titleText: "Admission Bound Narrator Book",
    authorText: "EVAVO Author",
    titleAuthorMatchConfirmed: true,
    prohibitedElementsAbsent: true,
    checks: coverChecks,
    observedByActorId: "narrator-listing-cover-observer",
    observedAt: at(21).toISOString(),
    now: at(21),
  });
  const ebookEvidence = createAudiobookRetailEbookAvailabilityEvidence({
    id: `retail_ebook_evidence_${status.bookId}`,
    projectId: status.projectId,
    bookId: status.bookId,
    asin: "B0NARRATR1",
    productReferenceHash: "5".repeat(64),
    observedByActorId: "narrator-listing-ebook-observer",
    observedAt: at(21).toISOString(),
    expiresAt: "2026-08-20T00:00:00.000Z",
    now: at(21),
  });
  return Object.freeze({
    policy: listingPolicy,
    packageManifest: packageApproval.manifest,
    creditPolicy,
    creditMetadata,
    openingCredit,
    closingCredit,
    listingMetadata: Object.freeze({
      title: "Admission Bound Narrator Book",
      authorCredit: "EVAVO Author",
      narratorCredit: "EVAVO Narrator",
      publisherName: "EVAVO Studio",
      languageTag: "en-AU",
      description:
        "An admission-bound long-form narration fixture for governed retailer listing verification.",
      projectKind: "standalone",
      copyrightNotice: "Copyright 2026 Rights Holder.",
    }),
    coverEvidence,
    coverArtifact,
    ebookEvidence,
    audiobookRights: packageApproval.sample.approvedSampleArtifact.rights,
  });
}

function checks(role: AudiobookRetailListingReviewRole): readonly string[] {
  if (role === "editorial") {
    return Object.freeze([
      "title-author-narrator-match-spoken-credits",
      "description-accurate",
      "language-confirmed",
      "series-metadata-confirmed",
    ]);
  }
  if (role === "rights") {
    return Object.freeze([
      "audiobook-rights-current",
      "cover-rights-current",
      "copyright-confirmed",
      "ebook-association-confirmed",
    ]);
  }
  return Object.freeze([
    "cover-technical-compliance",
    "cover-text-match",
    "description-within-limit",
    "prohibited-elements-absent",
    "ebook-availability-confirmed",
  ]);
}

export async function createTestAdmittedNarratorRetailListingFixture(
  input: Readonly<{
    mode?: "zero-shot" | "adapted";
    projectId?: string;
    bookId?: string;
  }> = {},
): Promise<TestAdmittedNarratorRetailListingFixture> {
  const retailerStatus = await createTestAdmittedNarratorRetailerStatusFixture({
    ...input,
    normalisedStatus: "accepted-awaiting-publication",
  });
  const sources = createTestAdmittedNarratorRetailListingSources(retailerStatus);
  const draft = createAdmittedNarratorRetailListingIdentity({
    retailerStatus: retailerStatus.statusEvidence,
    id: `admitted_narrator_listing_${retailerStatus.statusEvidence.bookId}`,
    sources,
    createdAt: at(22),
  });
  let reviewed = recordAdmittedNarratorRetailListingReview(draft, {
    id: `admitted_narrator_listing_editorial_${draft.bookId}`,
    role: "editorial",
    reviewerId: "admitted-narrator-listing-editor",
    decision: "approve",
    checks: checks("editorial"),
    decidedAt: at(23),
  });
  reviewed = recordAdmittedNarratorRetailListingReview(reviewed, {
    id: `admitted_narrator_listing_rights_${draft.bookId}`,
    role: "rights",
    reviewerId: "admitted-narrator-listing-rights-reviewer",
    decision: "approve",
    checks: checks("rights"),
    decidedAt: at(24),
  });
  reviewed = recordAdmittedNarratorRetailListingReview(reviewed, {
    id: `admitted_narrator_listing_merchandising_${draft.bookId}`,
    role: "merchandising",
    reviewerId: "admitted-narrator-listing-merchandiser",
    decision: "approve",
    checks: checks("merchandising"),
    decidedAt: at(25),
  });
  const approved = approveAdmittedNarratorRetailListingIdentity(reviewed, {
    finalConfirmationId:
      `admitted_narrator_listing_confirmation_${draft.bookId}`,
    approvedByActorId: "admitted-narrator-listing-approver",
    humanConfirmation: true,
    approvedAt: at(26),
  });
  return Object.freeze({ retailerStatus, sources, draft, reviewed, approved });
}
