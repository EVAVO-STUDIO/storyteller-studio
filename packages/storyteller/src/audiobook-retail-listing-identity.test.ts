import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createArtifactRecord,
  recordArtifactReview,
  verifyArtifactIntegrity,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import {
  approveAudiobookRetailListingIdentity,
  assertAudiobookRetailListingIdentity,
  assertAudiobookRetailListingIdentityMatchesSources,
  audiobookRetailListingIdentityPublicView,
  createAudiobookRetailListingIdentity,
  FileAudiobookRetailListingIdentityStore,
  recordAudiobookRetailListingReview,
  type AudiobookRetailListingIdentity,
  type AudiobookRetailListingIdentitySources,
  type AudiobookRetailListingReviewRole,
} from "./audiobook-retail-listing-identity.js";
import {
  createAcxAudibleRetailListingPolicy,
  createAudiobookRetailCoverEvidence,
  createAudiobookRetailEbookAvailabilityEvidence,
} from "./audiobook-retail-listing-policy.js";
import {
  approveBookCreditScript,
  createBookCreditPolicy,
  createBookCreditScript,
  recordBookCreditReview,
  type BookCreditMetadata,
  type BookCreditPolicy,
  type BookCreditScript,
} from "./book-credit-script.js";
import { stableHash } from "./index.js";
import { FileProjectStore } from "./project-store.js";
import { retailReleaseAt } from "./test-support/retail-release-policy-fixture.js";
import { retailReleaseFixture } from "./test-support/retail-release-review-fixture.js";

const coverRightsFingerprint = "9".repeat(64);
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

function coverRights(
  overrides: Partial<ArtifactRightsSnapshot> = {},
): ArtifactRightsSnapshot {
  return Object.freeze({
    rightsEvidenceId: "rights_retail_listing_cover_001",
    rightsFingerprint: coverRightsFingerprint,
    allowedUses: Object.freeze(["audiobook"] as const),
    commercialUseApproved: true,
    expiresAt: "2026-08-20T00:00:00.000Z",
    retainUntil: "2033-07-29T00:00:00.000Z",
    deletionRequiredAt: "2034-07-29T00:00:00.000Z",
    ...overrides,
  });
}

function approvedCoverArtifact(
  projectId: string,
  bookId: string,
  rights = coverRights(),
): ArtifactRecord {
  const created = createArtifactRecord({
    id: "artifact_retail_listing_cover_001",
    kind: "visual-render",
    projectId,
    segmentId: bookId,
    storage: {
      driver: "local-private-file",
      provider: "storyteller-listing-fixture",
      container: "private-cover-fixtures",
      objectKey: "covers/retail-listing-cover-001.png",
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
      createdByActorId: "retail_cover_designer_001",
      sourceContentHash: "7".repeat(64),
      generationRequestHash: "6".repeat(64),
      parentArtifactIds: Object.freeze([]),
    },
    rights,
    reviewRequired: true,
  }, retailReleaseAt(14));
  const verified = verifyArtifactIntegrity(created, {
    observedContentHash: created.integrity.contentHash,
    observedByteCount: created.integrity.byteCount,
    checkedByActorId: "retail_cover_verifier_001",
    checks: [
      "sha256",
      "byte-count",
      "image-signature",
    ],
    checkedAt: retailReleaseAt(15),
  });
  return recordArtifactReview(verified, {
    decision: "approved",
    reviewerId: "retail_cover_reviewer_001",
    notes: "Approved immutable retail cover artwork.",
    decidedAt: retailReleaseAt(16),
  });
}

function creditPolicy(): BookCreditPolicy {
  return createBookCreditPolicy({
    id: "book_credit_policy_retail_listing_001",
    version: "listing-2026-07",
    languageTag: "en-AU",
    reviewedAt: "2026-07-27T00:00:00.000Z",
    sourceReference: "approved-retail-credit-policy-2026-07",
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
  kind: "opening" | "closing";
  projectId: string;
  metadata: BookCreditMetadata;
  policy: BookCreditPolicy;
  suffix: string;
}>): BookCreditScript {
  let script = createBookCreditScript({
    id: `book_credit_listing_${input.kind}_${input.suffix}`,
    projectId: input.projectId,
    kind: input.kind,
    metadata: input.metadata,
    policy: input.policy,
    createdAt: retailReleaseAt(14),
  });
  script = recordBookCreditReview(script, {
    id: `book_credit_listing_${input.kind}_editorial_${input.suffix}`,
    role: "editorial",
    reviewerId: `credit_editor_${input.kind}_${input.suffix}`,
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
    id: `book_credit_listing_${input.kind}_rights_${input.suffix}`,
    role: "rights",
    reviewerId: `credit_rights_${input.kind}_${input.suffix}`,
    decision: "approve",
    checks: [
      "copyright-notice-confirmed",
      "credit-entitlements-confirmed",
      "commercial-use-confirmed",
    ],
    decidedAt: retailReleaseAt(16),
  });
  return approveBookCreditScript(script, {
    finalConfirmationId: `book_credit_listing_confirmation_${input.kind}_${input.suffix}`,
    approvedByActorId: `credit_manager_${input.kind}_${input.suffix}`,
    humanConfirmation: true,
    approvedAt: retailReleaseAt(17),
  });
}

function sources(input: Readonly<{
  ebookExpiresAt?: string;
  policyExpiresAt?: string;
  coverTitleText?: string;
  coverWidthPx?: number;
  audiobookRights?: ArtifactRightsSnapshot;
  coverRights?: ArtifactRightsSnapshot;
}> = {}): AudiobookRetailListingIdentitySources {
  const release = retailReleaseFixture();
  const listingPolicy = createAcxAudibleRetailListingPolicy({
    id: "retail_listing_policy_fixture_001",
    externalVersion: "acx-listing-2026-07",
    reviewedAt: "2026-07-27T00:00:00.000Z",
    expiresAt: input.policyExpiresAt ?? "2027-07-27T00:00:00.000Z",
    sourceReference: "acx-title-profile-cover-and-content-requirements-reviewed-2026-07",
    now: retailReleaseAt(18),
  });
  const metadata = creditMetadata(release.manifest.bookId);
  const policy = creditPolicy();
  const openingCredit = approvedCredit({
    kind: "opening",
    projectId: release.manifest.projectId,
    metadata,
    policy,
    suffix: "001",
  });
  const closingCredit = approvedCredit({
    kind: "closing",
    projectId: release.manifest.projectId,
    metadata,
    policy,
    suffix: "001",
  });
  const coverArtifact = approvedCoverArtifact(
    release.manifest.projectId,
    release.manifest.bookId,
    input.coverRights ?? coverRights(),
  );
  const coverEvidence = createAudiobookRetailCoverEvidence({
    id: "retail_cover_evidence_listing_001",
    projectId: release.manifest.projectId,
    bookId: release.manifest.bookId,
    policy: listingPolicy,
    artifact: coverArtifact,
    widthPx: input.coverWidthPx ?? 2_400,
    heightPx: input.coverWidthPx ?? 2_400,
    dpi: 300,
    bitDepth: 24,
    colorSpace: "rgb",
    titleText: input.coverTitleText ?? "The Lantern: A Harbour Story",
    authorText: "Greg Parker",
    titleAuthorMatchConfirmed: true,
    prohibitedElementsAbsent: true,
    checks: coverChecks,
    observedByActorId: "retail_cover_observer_001",
    observedAt: retailReleaseAt(18).toISOString(),
    now: retailReleaseAt(18),
  });
  const ebookEvidence = createAudiobookRetailEbookAvailabilityEvidence({
    id: "retail_ebook_availability_listing_001",
    projectId: release.manifest.projectId,
    bookId: release.manifest.bookId,
    asin: "B0LISTING1",
    productReferenceHash: "5".repeat(64),
    observedByActorId: "retail_ebook_observer_001",
    observedAt: retailReleaseAt(18).toISOString(),
    expiresAt: input.ebookExpiresAt ?? "2026-08-05T00:00:00.000Z",
    now: retailReleaseAt(18),
  });
  return {
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
    audiobookRights: input.audiobookRights ?? release.rights,
  };
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

function review(
  identity: AudiobookRetailListingIdentity,
  role: AudiobookRetailListingReviewRole,
  second: number,
  input: Readonly<{
    id?: string;
    reviewerId?: string;
    decision?: "approve" | "changes-requested";
    findingCodes?: readonly string[];
    notes?: string;
  }> = {},
): AudiobookRetailListingIdentity {
  return recordAudiobookRetailListingReview(identity, {
    id: input.id ?? `retail_listing_review_${role}_${second}`,
    role,
    reviewerId: input.reviewerId ?? `retail_listing_${role}_reviewer_001`,
    decision: input.decision ?? "approve",
    checks: checks(role),
    ...(input.findingCodes ? { findingCodes: input.findingCodes } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    decidedAt: retailReleaseAt(second),
  });
}

function approvedIdentity(
  source = sources(),
): AudiobookRetailListingIdentity {
  let identity = createAudiobookRetailListingIdentity({
    id: "retail_listing_identity_001",
    sources: source,
    createdAt: retailReleaseAt(19),
  });
  identity = review(identity, "editorial", 20);
  identity = review(identity, "rights", 21);
  identity = review(identity, "merchandising", 22);
  return approveAudiobookRetailListingIdentity(identity, {
    sources: source,
    finalConfirmationId: "retail_listing_final_confirmation_001",
    approvedByActorId: "retail_listing_publisher_approver_001",
    humanConfirmation: true,
    approvedAt: retailReleaseAt(23),
  });
}

function recomputeIdentity(
  partial: Omit<AudiobookRetailListingIdentity, "fingerprint">,
): AudiobookRetailListingIdentity {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

test("approved credits, compliant cover and current eBook evidence become one governed public listing identity", async () => {
  const source = sources();
  const identity = approvedIdentity(source);
  assert.equal(identity.status, "approved-for-publication-verification");
  assert.equal(identity.metadata.displayTitle, "The Lantern: A Harbour Story");
  assert.equal(identity.cover.widthPx, 2_400);
  assert.equal(identity.ebook.asin, "B0LISTING1");
  assert.doesNotThrow(() => assertAudiobookRetailListingIdentity(identity));
  assert.doesNotThrow(() =>
    assertAudiobookRetailListingIdentityMatchesSources(
      identity,
      source,
      retailReleaseAt(23),
    )
  );

  const root = await mkdtemp(join(tmpdir(), "storyteller-retail-listing-"));
  try {
    const store = new FileAudiobookRetailListingIdentityStore(
      new FileProjectStore(root),
    );
    let draft = createAudiobookRetailListingIdentity({
      id: "retail_listing_identity_store_001",
      sources: source,
      createdAt: retailReleaseAt(19),
    });
    const created = await store.create(draft, "retail_listing_owner_001");
    const repeated = await store.create(draft, "retail_listing_owner_001");
    assert.equal(created.envelopeHash, repeated.envelopeHash);
    draft = review(draft, "editorial", 20, {
      id: "retail_listing_store_editorial_001",
    });
    await store.save(draft, {
      expectedRevision: 1,
      actorId: "retail_listing_editorial_reviewer_001",
      action: "audiobook_retail_listing_identity.editorial_recorded",
    });
    draft = review(draft, "rights", 21, {
      id: "retail_listing_store_rights_001",
    });
    await store.save(draft, {
      expectedRevision: 2,
      actorId: "retail_listing_rights_reviewer_001",
      action: "audiobook_retail_listing_identity.rights_recorded",
    });
    draft = review(draft, "merchandising", 22, {
      id: "retail_listing_store_merchandising_001",
    });
    await store.save(draft, {
      expectedRevision: 3,
      actorId: "retail_listing_merchandising_reviewer_001",
      action: "audiobook_retail_listing_identity.merchandising_recorded",
    });
    const approved = approveAudiobookRetailListingIdentity(draft, {
      sources: source,
      finalConfirmationId: "retail_listing_store_confirmation_001",
      approvedByActorId: "retail_listing_store_approver_001",
      humanConfirmation: true,
      approvedAt: retailReleaseAt(23),
    });
    await store.save(approved, {
      expectedRevision: 4,
      actorId: "retail_listing_store_approver_001",
      action: "audiobook_retail_listing_identity.approved",
    });
    assert.equal(
      (await store.require(approved.id)).payload.fingerprint,
      approved.fingerprint,
    );

    const view = audiobookRetailListingIdentityPublicView(approved);
    assert.equal(view.publicationVerificationEligible, true);
    assert.equal(view.title, "The Lantern");
    assert.equal(view.authorCredit, "Greg Parker");
    assert.equal(view.ebook.asin, "B0LISTING1");
    const serialised = JSON.stringify(view);
    const audit = await readFile(join(root, "audit", "2026-07-29.jsonl"), "utf8");
    const auditMetadata = JSON.stringify(
      audit.trim().split(/\r?\n/u).filter(Boolean).map((line) =>
        (JSON.parse(line) as { metadata: unknown }).metadata
      ),
    );
    for (const forbidden of [
      approved.projectId,
      approved.packageManifest.id,
      approved.packageManifest.fingerprint,
      approved.credits.opening.id,
      approved.credits.opening.fingerprint,
      approved.credits.closing.id,
      approved.cover.evidenceId,
      approved.cover.artifactId,
      approved.cover.contentHash,
      approved.ebook.evidenceId,
      source.ebookEvidence.productReferenceHash,
      approved.audiobookRightsFingerprint,
      approved.approval!.finalConfirmationId,
      approved.approval!.approvedByActorId,
      "artifactFingerprint",
      "evidenceFingerprint",
      "rightsFingerprint",
      "sourceSetFingerprint",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
      assert.equal(auditMetadata.includes(forbidden), false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cover dimensions and cover text must match the canonical listing", () => {
  assert.throws(
    () => sources({ coverWidthPx: 2_399 }),
    /AUDIOBOOK_RETAIL_COVER_WIDTH_INVALID/u,
  );
  const wrongTitle = sources({ coverTitleText: "Another Title" });
  assert.throws(
    () => createAudiobookRetailListingIdentity({
      id: "retail_listing_wrong_cover_title_001",
      sources: wrongTitle,
      createdAt: retailReleaseAt(19),
    }),
    /AUDIOBOOK_RETAIL_LISTING_EXTERNAL_EVIDENCE_MISMATCH/u,
  );
});

test("expired listing policy, eBook availability and rights fail closed", () => {
  const staleEbook = sources({
    ebookExpiresAt: retailReleaseAt(20).toISOString(),
  });
  assert.throws(
    () => createAudiobookRetailListingIdentity({
      id: "retail_listing_expired_ebook_001",
      sources: staleEbook,
      createdAt: retailReleaseAt(21),
    }),
    /AUDIOBOOK_RETAIL_EBOOK_NOT_CURRENT/u,
  );

  const stalePolicy = sources({
    policyExpiresAt: retailReleaseAt(20).toISOString(),
  });
  assert.throws(
    () => createAudiobookRetailListingIdentity({
      id: "retail_listing_expired_policy_001",
      sources: stalePolicy,
      createdAt: retailReleaseAt(21),
    }),
    /AUDIOBOOK_RETAIL_LISTING_POLICY_NOT_CURRENT/u,
  );

  const expiredRights = sources({
    audiobookRights: {
      ...retailReleaseFixture().rights,
      expiresAt: retailReleaseAt(20).toISOString(),
    },
  });
  assert.throws(
    () => createAudiobookRetailListingIdentity({
      id: "retail_listing_expired_rights_001",
      sources: expiredRights,
      createdAt: retailReleaseAt(21),
    }),
    /AUDIOBOOK_RETAIL_LISTING_RIGHTS_EXPIRED/u,
  );
});

test("spoken credit metadata drift cannot create another listing identity", () => {
  const source = sources();
  assert.throws(
    () => createAudiobookRetailListingIdentity({
      id: "retail_listing_credit_drift_001",
      sources: {
        ...source,
        listingMetadata: {
          ...source.listingMetadata,
          narratorCredit: "Another Narrator",
        },
      },
      createdAt: retailReleaseAt(19),
    }),
    /AUDIOBOOK_RETAIL_LISTING_CREDIT_METADATA_MISMATCH/u,
  );
});

test("changes requested require a clean re-review and all roles remain independent", () => {
  const source = sources();
  let identity = createAudiobookRetailListingIdentity({
    id: "retail_listing_changes_cycle_001",
    sources: source,
    createdAt: retailReleaseAt(19),
  });
  identity = review(identity, "editorial", 20, {
    decision: "changes-requested",
    findingCodes: ["RETAIL_LISTING_DESCRIPTION_NEEDS_REVISION"],
    notes: "Description overstates the opening incident.",
  });
  assert.equal(identity.status, "changes-requested");
  identity = review(identity, "editorial", 21, {
    id: "retail_listing_editorial_rereview_001",
  });
  assert.equal(identity.status, "draft");
  assert.throws(
    () => review(identity, "rights", 22, {
      reviewerId: "retail_listing_editorial_reviewer_001",
    }),
    /AUDIOBOOK_RETAIL_LISTING_INDEPENDENT_REVIEWERS_REQUIRED/u,
  );
  identity = review(identity, "rights", 22);
  identity = review(identity, "merchandising", 23);
  assert.equal(identity.status, "ready-for-approval");
  assert.throws(
    () => approveAudiobookRetailListingIdentity(identity, {
      sources: source,
      finalConfirmationId: "retail_listing_non_independent_approval_001",
      approvedByActorId: source.coverEvidence.observedByActorId,
      humanConfirmation: true,
      approvedAt: retailReleaseAt(24),
    }),
    /AUDIOBOOK_RETAIL_LISTING_INDEPENDENT_APPROVER_REQUIRED/u,
  );
});

test("recomputed identity state cannot replace the approved source manifest", () => {
  const source = sources();
  const identity = approvedIdentity(source);
  const { fingerprint: _fingerprint, ...base } = identity;
  const changed = recomputeIdentity({
    ...base,
    packageManifest: Object.freeze({
      ...identity.packageManifest,
      id: "retail_package_manifest_structurally_wrong_001",
    }),
  });
  assert.doesNotThrow(() => assertAudiobookRetailListingIdentity(changed));
  assert.throws(
    () => assertAudiobookRetailListingIdentityMatchesSources(
      changed,
      source,
      retailReleaseAt(23),
    ),
    /AUDIOBOOK_RETAIL_LISTING_SOURCE_MISMATCH/u,
  );
});
