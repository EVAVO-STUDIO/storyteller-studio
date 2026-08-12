import assert from "node:assert/strict";
import test from "node:test";
import { stableHash } from "./index.js";
import {
  admittedNarratorRetailPublicationVerificationPublicView,
  admittedNarratorRetailPublicListingObservationPublicView,
  assertAdmittedNarratorRetailPublicationVerification,
  assertAdmittedNarratorRetailPublicListingObservation,
  createAdmittedNarratorRetailPublicListingObservation,
  type AdmittedNarratorRetailPublicationVerification,
  type AdmittedNarratorRetailPublicListingObservation,
} from "./narrator-retail-publication-admission.js";
import {
  createTestAdmittedNarratorRetailListingFixture,
} from "../test-support/narrator-retail-listing-admission.js";
import {
  createTestAdmittedNarratorRetailPublicationFixture,
  createTestAdmittedNarratorRetailPublicObservationFixture,
} from "../test-support/narrator-retail-publication-admission.js";

function recomputeObservation(
  partial: Omit<AdmittedNarratorRetailPublicListingObservation, "fingerprint">,
): AdmittedNarratorRetailPublicListingObservation {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function recomputeVerification(
  partial: Omit<AdmittedNarratorRetailPublicationVerification, "fingerprint">,
): AdmittedNarratorRetailPublicationVerification {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

test("adapted narrator listing becomes live only after exact public observation and independent verification", async () => {
  const fixture = await createTestAdmittedNarratorRetailPublicationFixture({
    mode: "adapted",
    projectId: "project_narrator_publication_adapted",
    bookId: "book_narrator_publication_adapted",
  });
  const observation = fixture.observationFixture.observation;
  const verification = fixture.verification;
  assert.doesNotThrow(() =>
    assertAdmittedNarratorRetailPublicListingObservation(observation)
  );
  assert.doesNotThrow(() =>
    assertAdmittedNarratorRetailPublicationVerification(verification)
  );
  assert.equal(observation.publicationVerificationComplete, false);
  assert.equal(observation.publicationConfirmed, false);
  assert.equal(observation.liveConfirmed, false);
  assert.equal(verification.status, "published-and-live");
  assert.equal(verification.publicationConfirmed, true);
  assert.equal(verification.liveConfirmed, true);
  assert.equal(verification.purchaseConfirmed, true);
  assert.equal(verification.samplePlaybackConfirmed, true);
  assert.deepEqual(verification.verification.findingCodes, []);
  assert.equal(
    verification.observation.listing.retailerStatus.submission.decision.review.delivery.release.packageApproval.sample.tracks.admittedPlan.wholeBookApproval.binding.reference.audiobook.admittedCasting.profileAdmission.trainingProvenanceBound,
    true,
  );
});

test("zero-shot narrator uses the same storefront verification boundary without invented training provenance", async () => {
  const fixture = await createTestAdmittedNarratorRetailPublicationFixture({
    mode: "zero-shot",
    projectId: "project_narrator_publication_zero_shot",
    bookId: "book_narrator_publication_zero_shot",
  });
  const admission =
    fixture.verification.observation.listing.retailerStatus.submission.decision.review.delivery.release.packageApproval.sample.tracks.admittedPlan.wholeBookApproval.binding.reference.audiobook.admittedCasting.profileAdmission;
  assert.equal(admission.training, null);
  assert.equal(fixture.verification.narratorAdmissionComplete, true);
  assert.equal(fixture.verification.syntheticNarrationDeclared, true);
  assert.equal(fixture.verification.liveConfirmed, true);
});

test("public narrator credit drift is recorded as publication mismatch and never live", async () => {
  const fixture = await createTestAdmittedNarratorRetailPublicationFixture({
    projectId: "project_narrator_publication_credit_drift",
    bookId: "book_narrator_publication_credit_drift",
    observation: {
      narratorCredit: "Different Public Narrator",
    },
  });
  const observation = fixture.observationFixture.observation;
  const verification = fixture.verification;
  assert.equal(observation.observation.narratorCredit, "Different Public Narrator");
  assert.equal(observation.publicationConfirmed, false);
  assert.equal(observation.liveConfirmed, false);
  assert.equal(verification.status, "publication-mismatch");
  assert.equal(verification.publicationConfirmed, true);
  assert.equal(verification.liveConfirmed, false);
  assert.equal(
    verification.verification.findingCodes.includes(
      "AUDIOBOOK_RETAIL_PUBLICATION_NARRATOR_MISMATCH",
    ),
    true,
  );
});

test("no accessible required-region storefront remains not yet published for the exact narrator listing", async () => {
  const fixture = await createTestAdmittedNarratorRetailPublicationFixture({
    projectId: "project_narrator_publication_not_yet",
    bookId: "book_narrator_publication_not_yet",
    observation: {
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
    },
  });
  assert.equal(fixture.verification.status, "not-yet-published");
  assert.equal(fixture.verification.publicationConfirmed, false);
  assert.equal(fixture.verification.liveConfirmed, false);
  assert.equal(fixture.verification.purchaseConfirmed, false);
  assert.equal(fixture.verification.samplePlaybackConfirmed, false);
});

test("unavailable purchase or sample remains published but unavailable under the exact narrator listing", async () => {
  const fixture = await createTestAdmittedNarratorRetailPublicationFixture({
    projectId: "project_narrator_publication_unavailable",
    bookId: "book_narrator_publication_unavailable",
    observation: {
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
    },
  });
  assert.equal(fixture.verification.status, "published-but-unavailable");
  assert.equal(fixture.verification.publicationConfirmed, true);
  assert.equal(fixture.verification.liveConfirmed, false);
  assert.equal(fixture.verification.purchaseConfirmed, false);
  assert.equal(fixture.verification.samplePlaybackConfirmed, false);
});

test("an unapproved narrator listing cannot create public storefront evidence", async () => {
  const listing = await createTestAdmittedNarratorRetailListingFixture({
    projectId: "project_narrator_publication_unapproved",
    bookId: "book_narrator_publication_unapproved",
  });
  const identity = listing.draft.identity;
  assert.throws(
    () => createAdmittedNarratorRetailPublicListingObservation({
      listing: listing.draft,
      id: "admitted_narrator_public_observation_unapproved",
      audiobookAsin: "B0NARRAT02",
      publicProductReferenceHash: "1".repeat(64),
      sampleReferenceHash: "2".repeat(64),
      coverReferenceHash: "3".repeat(64),
      displayTitle: identity.metadata.displayTitle,
      authorCredit: identity.metadata.authorCredit,
      narratorCredit: identity.metadata.narratorCredit,
      publisherName: identity.metadata.publisherName,
      languageTag: identity.metadata.languageTag,
      description: identity.metadata.description,
      coverIdentityMatched: true,
      ebookAsin: identity.ebook.asin,
      ebookAssociationMatched: true,
      regions: [{
        regionCode: "AU",
        productPageAccessible: true,
        purchaseAvailable: true,
        sampleAvailable: true,
        samplePlaybackSuccessful: true,
      }],
      observedByActorId: "unapproved-public-observer",
      humanObservationConfirmed: true,
      observedAt: "2026-08-10T12:27:00.000Z",
      expiresAt: "2026-08-15T12:27:00.000Z",
      now: new Date("2026-08-10T12:27:00.000Z"),
    }),
    /ADMITTED_NARRATOR_RETAIL_PUBLICATION_APPROVED_LISTING_REQUIRED/u,
  );
});

test("cross-title storefront observation cannot be rebound to another admitted narrator listing after rehashing", async () => {
  const selected = await createTestAdmittedNarratorRetailPublicObservationFixture({
    projectId: "project_narrator_publication_selected",
    bookId: "book_narrator_publication_selected",
  });
  const other = await createTestAdmittedNarratorRetailPublicObservationFixture({
    projectId: "project_narrator_publication_other",
    bookId: "book_narrator_publication_other",
  });
  const { fingerprint: _fingerprint, ...base } = selected.observation;
  const changed = recomputeObservation({
    ...base,
    listing: other.listing.approved,
  });
  assert.throws(
    () => assertAdmittedNarratorRetailPublicListingObservation(changed),
    /ADMITTED_NARRATOR_RETAIL_PUBLIC_OBSERVATION_LINEAGE_MISMATCH|AUDIOBOOK_RETAIL_PUBLICATION/u,
  );
});

test("rehashing cannot escalate a publication mismatch to live or grant publication authority", async () => {
  const fixture = await createTestAdmittedNarratorRetailPublicationFixture({
    projectId: "project_narrator_publication_escalation",
    bookId: "book_narrator_publication_escalation",
    observation: {
      narratorCredit: "Wrong Narrator Credit",
    },
  });
  const { fingerprint: _fingerprint, ...base } = fixture.verification;
  const escalated = recomputeVerification({
    ...base,
    liveConfirmed: true,
    publicationAuthority: true as never,
  });
  assert.throws(
    () => assertAdmittedNarratorRetailPublicationVerification(escalated),
    /ADMITTED_NARRATOR_RETAIL_PUBLICATION_LINEAGE_MISMATCH|ADMITTED_NARRATOR_RETAIL_PUBLICATION_AUTHORITY_INVALID/u,
  );
});

test("public storefront views expose verified retail state without private narrator, actor or reference identity", async () => {
  const fixture = await createTestAdmittedNarratorRetailPublicationFixture({
    projectId: "project_narrator_publication_public",
    bookId: "book_narrator_publication_public",
  });
  const observation = fixture.observationFixture.observation;
  const verification = fixture.verification;
  const json = JSON.stringify([
    admittedNarratorRetailPublicListingObservationPublicView(observation),
    admittedNarratorRetailPublicationVerificationPublicView(verification),
  ]);
  assert.equal(
    admittedNarratorRetailPublicationVerificationPublicView(verification).status,
    "published-and-live",
  );
  const listing = observation.listing;
  const privateValues = [
    listing.voice.profileId,
    listing.voice.profileHash,
    listing.profileAdmissionHash,
    listing.admittedCastingFingerprint,
    listing.castingFingerprint,
    listing.identity.id,
    listing.identity.fingerprint,
    listing.identity.approval!.fingerprint,
    listing.retailerStatus.evidence.id,
    listing.retailerStatus.evidence.fingerprint,
    observation.observation.id,
    observation.observation.fingerprint,
    observation.observation.publicProductReferenceHash,
    observation.observation.sampleReferenceHash,
    observation.observation.coverReferenceHash,
    observation.observation.observedByActorId,
    verification.verification.verifiedByActorId,
    "publicProductReferenceHash",
    "sampleReferenceHash",
    "coverReferenceHash",
    "profileAdmissionHash",
    "admittedCastingFingerprint",
  ];
  for (const value of privateValues) assert.equal(json.includes(value), false);
});
