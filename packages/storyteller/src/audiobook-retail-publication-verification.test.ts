import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileAudiobookRetailPublicationVerificationStore,
  assertAudiobookRetailPublicationVerification,
  assertAudiobookRetailPublicationVerificationMatchesSources,
  audiobookRetailPublicationVerificationPublicView,
  createAudiobookRetailPublicListingObservation,
  verifyAudiobookRetailPublication,
  type AudiobookRetailPublicationVerification,
  type AudiobookRetailPublicListingObservation,
} from "./audiobook-retail-publication-verification.js";
import { createAudiobookRetailerStatusEvidence } from "./audiobook-retailer-status-evidence.js";
import { stableHash } from "./index.js";
import { FileProjectStore } from "./project-store.js";
import { retailReleaseAt } from "./test-support/retail-release-policy-fixture.js";
import { retailPublicationVerificationFixture } from "./test-support/retail-publication-verification-fixture.js";

function observation(input: Readonly<{
  displayTitle?: string;
  authorCredit?: string;
  narratorCredit?: string;
  publisherName?: string;
  languageTag?: string;
  description?: string;
  coverIdentityMatched?: boolean;
  ebookAsin?: string;
  ebookAssociationMatched?: boolean;
  regions?: readonly Readonly<{
    regionCode: string;
    productPageAccessible: boolean;
    purchaseAvailable: boolean;
    sampleAvailable: boolean;
    samplePlaybackSuccessful: boolean;
  }>[];
  observedByActorId?: string;
  observedAt?: Date;
  expiresAt?: string;
}> = {}): AudiobookRetailPublicListingObservation {
  const fixture = retailPublicationVerificationFixture();
  const identity = fixture.listingIdentity;
  const observedAt = input.observedAt ?? retailReleaseAt(25);
  return createAudiobookRetailPublicListingObservation({
    id: `public_listing_observation_${stableHash({
      displayTitle: input.displayTitle ?? identity.metadata.displayTitle,
      regions: input.regions ?? "default",
      observedAt: observedAt.toISOString(),
    }).slice(0, 24)}`,
    projectId: identity.projectId,
    bookId: identity.bookId,
    audiobookAsin: "B0AUDIO001",
    publicProductReferenceHash: "e".repeat(64),
    sampleReferenceHash: "f".repeat(64),
    coverReferenceHash: "1".repeat(64),
    displayTitle: input.displayTitle ?? identity.metadata.displayTitle,
    authorCredit: input.authorCredit ?? identity.metadata.authorCredit,
    narratorCredit: input.narratorCredit ?? identity.metadata.narratorCredit,
    publisherName: input.publisherName ?? identity.metadata.publisherName,
    languageTag: input.languageTag ?? identity.metadata.languageTag,
    description: input.description ?? identity.metadata.description,
    coverIdentityMatched: input.coverIdentityMatched ?? true,
    ebookAsin: input.ebookAsin ?? identity.ebook.asin,
    ebookAssociationMatched: input.ebookAssociationMatched ?? true,
    regions: input.regions ?? Object.freeze([
      Object.freeze({
        regionCode: "AU",
        productPageAccessible: true,
        purchaseAvailable: true,
        sampleAvailable: true,
        samplePlaybackSuccessful: true,
      }),
      Object.freeze({
        regionCode: "US",
        productPageAccessible: true,
        purchaseAvailable: true,
        sampleAvailable: true,
        samplePlaybackSuccessful: true,
      }),
    ]),
    observedByActorId:
      input.observedByActorId ?? "public_listing_observer_001",
    humanObservationConfirmed: true,
    observedAt: observedAt.toISOString(),
    expiresAt: input.expiresAt ?? "2026-07-31T00:00:00.000Z",
    now: observedAt,
  });
}

function verify(
  publicObservation = observation(),
  input: Readonly<{
    requiredRegions?: readonly string[];
    verifiedByActorId?: string;
    verifiedAt?: Date;
  }> = {},
): AudiobookRetailPublicationVerification {
  const fixture = retailPublicationVerificationFixture();
  return verifyAudiobookRetailPublication({
    id: `retail_publication_verification_${stableHash({
      observation: publicObservation.fingerprint,
      regions: input.requiredRegions ?? ["AU", "US"],
    }).slice(0, 24)}`,
    sources: {
      listingIdentity: fixture.listingIdentity,
      retailerStatus: fixture.retailerStatus,
      observation: publicObservation,
    },
    requiredRegions: input.requiredRegions ?? ["AU", "US"],
    verifiedByActorId:
      input.verifiedByActorId ?? "public_listing_verifier_001",
    humanVerificationConfirmed: true,
    verifiedAt: input.verifiedAt ?? retailReleaseAt(26),
  });
}

function recomputeVerification(
  partial: Omit<AudiobookRetailPublicationVerification, "fingerprint">,
): AudiobookRetailPublicationVerification {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

test("exact metadata, cover, eBook, purchase and sample playback evidence becomes published and live", async () => {
  const publicObservation = observation();
  const verification = verify(publicObservation);
  const fixture = retailPublicationVerificationFixture();
  assert.equal(verification.status, "published-and-live");
  assert.equal(verification.publicationConfirmed, true);
  assert.equal(verification.liveConfirmed, true);
  assert.equal(verification.purchaseConfirmed, true);
  assert.equal(verification.samplePlaybackConfirmed, true);
  assert.deepEqual(verification.findingCodes, []);
  assert.doesNotThrow(() =>
    assertAudiobookRetailPublicationVerification(verification)
  );
  assert.doesNotThrow(() =>
    assertAudiobookRetailPublicationVerificationMatchesSources(
      verification,
      {
        listingIdentity: fixture.listingIdentity,
        retailerStatus: fixture.retailerStatus,
        observation: publicObservation,
      },
      retailReleaseAt(26),
    )
  );

  const root = await mkdtemp(join(tmpdir(), "storyteller-publication-verification-"));
  try {
    const store = new FileAudiobookRetailPublicationVerificationStore(
      new FileProjectStore(root),
    );
    const first = await store.create(
      verification,
      "publication_verification_store_actor_001",
    );
    const repeated = await store.create(
      verification,
      "publication_verification_store_actor_001",
    );
    assert.equal(first.envelopeHash, repeated.envelopeHash);
    assert.equal(
      (await store.require(verification.id)).payload.fingerprint,
      verification.fingerprint,
    );

    const view = audiobookRetailPublicationVerificationPublicView(
      verification,
      publicObservation,
    );
    assert.equal(view.status, "published-and-live");
    assert.equal(view.audiobookAsin, "B0AUDIO001");
    assert.deepEqual(view.requiredRegions, ["AU", "US"]);
    const serialised = JSON.stringify(view);
    const audit = await readFile(join(root, "audit", "2026-07-29.jsonl"), "utf8");
    const auditMetadata = JSON.stringify(
      audit.trim().split(/\r?\n/u).filter(Boolean).map((line) =>
        (JSON.parse(line) as { metadata: unknown }).metadata
      ),
    );
    for (const forbidden of [
      verification.projectId,
      verification.packageId,
      verification.listingIdentity.id,
      verification.listingIdentity.fingerprint,
      verification.listingIdentity.approvalFingerprint,
      verification.retailerStatus.id,
      verification.retailerStatus.fingerprint,
      verification.observation.id,
      verification.observation.fingerprint,
      verification.observation.publicProductReferenceHash,
      publicObservation.sampleReferenceHash,
      publicObservation.coverReferenceHash,
      verification.verifiedByActorId,
      publicObservation.observedByActorId,
      "publicProductReferenceHash",
      "sampleReferenceHash",
      "coverReferenceHash",
      "approvalFingerprint",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
      assert.equal(auditMetadata.includes(forbidden), false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("no accessible required-region product page remains not yet published", () => {
  const publicObservation = observation({
    regions: [
      {
        regionCode: "AU",
        productPageAccessible: false,
        purchaseAvailable: false,
        sampleAvailable: false,
        samplePlaybackSuccessful: false,
      },
      {
        regionCode: "US",
        productPageAccessible: false,
        purchaseAvailable: false,
        sampleAvailable: false,
        samplePlaybackSuccessful: false,
      },
    ],
  });
  const verification = verify(publicObservation);
  assert.equal(verification.status, "not-yet-published");
  assert.equal(verification.publicationConfirmed, false);
  assert.equal(verification.liveConfirmed, false);
  assert.equal(
    verification.findingCodes.includes(
      "AUDIOBOOK_RETAIL_PUBLICATION_REGION_AU_PAGE_UNAVAILABLE",
    ),
    true,
  );
});

test("public metadata, cover or eBook drift produces publication mismatch without a live claim", () => {
  const publicObservation = observation({
    displayTitle: "The Lantern: Another Harbour Story",
    coverIdentityMatched: false,
    ebookAsin: "B0WRONG001",
    ebookAssociationMatched: false,
  });
  const verification = verify(publicObservation);
  assert.equal(verification.status, "publication-mismatch");
  assert.equal(verification.publicationConfirmed, true);
  assert.equal(verification.liveConfirmed, false);
  assert.equal(
    verification.findingCodes.includes(
      "AUDIOBOOK_RETAIL_PUBLICATION_TITLE_MISMATCH",
    ),
    true,
  );
  assert.equal(
    verification.findingCodes.includes(
      "AUDIOBOOK_RETAIL_PUBLICATION_COVER_MISMATCH",
    ),
    true,
  );
  assert.equal(
    verification.findingCodes.includes(
      "AUDIOBOOK_RETAIL_PUBLICATION_EBOOK_MISMATCH",
    ),
    true,
  );
});

test("published pages with unavailable purchase or failed sample remain published but unavailable", () => {
  const publicObservation = observation({
    regions: [
      {
        regionCode: "AU",
        productPageAccessible: true,
        purchaseAvailable: true,
        sampleAvailable: true,
        samplePlaybackSuccessful: true,
      },
      {
        regionCode: "US",
        productPageAccessible: true,
        purchaseAvailable: false,
        sampleAvailable: true,
        samplePlaybackSuccessful: false,
      },
    ],
  });
  const verification = verify(publicObservation);
  assert.equal(verification.status, "published-but-unavailable");
  assert.equal(verification.publicationConfirmed, true);
  assert.equal(verification.liveConfirmed, false);
  assert.equal(verification.purchaseConfirmed, false);
  assert.equal(verification.samplePlaybackConfirmed, false);
  assert.equal(
    verification.findingCodes.includes(
      "AUDIOBOOK_RETAIL_PUBLICATION_REGION_US_PURCHASE_UNAVAILABLE",
    ),
    true,
  );
  assert.equal(
    verification.findingCodes.includes(
      "AUDIOBOOK_RETAIL_PUBLICATION_REGION_US_SAMPLE_PLAYBACK_FAILED",
    ),
    true,
  );
});

test("retailer processing status cannot authorize publication verification", () => {
  const fixture = retailPublicationVerificationFixture();
  const processing = createAudiobookRetailerStatusEvidence({
    submissionAttempt: fixture.submissionAttempt,
    submissionDecision: fixture.submissionDecision,
    submissionReview: fixture.reviewFixture.submissionReview,
    distributorAccount: fixture.reviewFixture.release.account,
    normalisedStatus: "processing",
    externalStatusReferenceHash: "2".repeat(64),
    externalStatusTextHash: "3".repeat(64),
    retailerAcceptanceConfirmed: false,
    publicationConfirmed: false,
    liveConfirmed: false,
    observedByActorId: "publication_fixture_processing_observer_001",
    humanObservationConfirmed: true,
    observedAt: retailReleaseAt(20),
  });
  const publicObservation = observation();
  assert.throws(
    () => verifyAudiobookRetailPublication({
      id: "retail_publication_processing_status_001",
      sources: {
        listingIdentity: fixture.listingIdentity,
        retailerStatus: processing,
        observation: publicObservation,
      },
      requiredRegions: ["AU", "US"],
      verifiedByActorId: "public_listing_verifier_processing_001",
      humanVerificationConfirmed: true,
      verifiedAt: retailReleaseAt(26),
    }),
    /AUDIOBOOK_RETAIL_PUBLICATION_ACCEPTED_STATUS_REQUIRED/u,
  );
});

test("observer, retailer-status observer and listing approver cannot self-verify publication", () => {
  const fixture = retailPublicationVerificationFixture();
  const publicObservation = observation();
  for (const actorId of [
    publicObservation.observedByActorId,
    fixture.retailerStatus.observedByActorId,
    fixture.listingIdentity.approval!.approvedByActorId,
  ]) {
    assert.throws(
      () => verify(publicObservation, { verifiedByActorId: actorId }),
      /AUDIOBOOK_RETAIL_PUBLICATION_INDEPENDENT_VERIFIER_REQUIRED/u,
    );
  }
  assert.throws(
    () => verify(publicObservation, {
      verifiedByActorId: "bot_publication_verifier",
    }),
    /AUDIOBOOK_RETAIL_PUBLICATION_VERIFIER_INVALID/u,
  );
});

test("expired observations and recomputed source substitutions fail closed", () => {
  assert.throws(
    () => observation({
      observedAt: retailReleaseAt(25),
      expiresAt: retailReleaseAt(25).toISOString(),
    }),
    /AUDIOBOOK_RETAIL_PUBLICATION_OBSERVATION_NOT_CURRENT/u,
  );

  const fixture = retailPublicationVerificationFixture();
  const publicObservation = observation();
  const verification = verify(publicObservation);
  const { fingerprint: _fingerprint, ...base } = verification;
  const changed = recomputeVerification({
    ...base,
    listingIdentity: Object.freeze({
      ...verification.listingIdentity,
      id: "retail_listing_identity_structurally_wrong_001",
    }),
  });
  assert.doesNotThrow(() =>
    assertAudiobookRetailPublicationVerification(changed)
  );
  assert.throws(
    () => assertAudiobookRetailPublicationVerificationMatchesSources(
      changed,
      {
        listingIdentity: fixture.listingIdentity,
        retailerStatus: fixture.retailerStatus,
        observation: publicObservation,
      },
      retailReleaseAt(26),
    ),
    /AUDIOBOOK_RETAIL_PUBLICATION_SOURCE_MISMATCH/u,
  );
});
