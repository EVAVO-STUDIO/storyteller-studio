import assert from "node:assert/strict";
import test from "node:test";
import type {
  AudiobookRetailListingIdentity,
  AudiobookRetailListingMetadata,
} from "./audiobook-retail-listing-identity.js";
import { stableHash } from "./index.js";
import {
  admittedNarratorRetailListingIdentityPublicView,
  assertAdmittedNarratorRetailListingIdentity,
  createAdmittedNarratorRetailListingIdentity,
  type AdmittedNarratorRetailListingIdentity,
} from "./narrator-retail-listing-admission.js";
import {
  createTestAdmittedNarratorRetailListingFixture,
  createTestAdmittedNarratorRetailListingSources,
} from "../test-support/narrator-retail-listing-admission.js";
import {
  createTestAdmittedNarratorRetailerStatusFixture,
} from "../test-support/narrator-retail-status-admission.js";

function recomputeMetadata(
  partial: Omit<AudiobookRetailListingMetadata, "fingerprint">,
): AudiobookRetailListingMetadata {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function recomputeIdentity(
  partial: Omit<AudiobookRetailListingIdentity, "fingerprint">,
): AudiobookRetailListingIdentity {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function recomputeAdmission(
  partial: Omit<AdmittedNarratorRetailListingIdentity, "fingerprint">,
): AdmittedNarratorRetailListingIdentity {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

test("adapted narrator retailer acceptance becomes one admission-bound approved listing identity", async () => {
  const fixture = await createTestAdmittedNarratorRetailListingFixture({
    mode: "adapted",
    projectId: "project_narrator_listing_adapted",
    bookId: "book_narrator_listing_adapted",
  });
  const value = fixture.approved;
  const audiobook = value.retailerStatus.submission.decision.review.delivery.release
    .packageApproval.sample.tracks.admittedPlan.wholeBookApproval.binding.reference
    .audiobook;
  assert.doesNotThrow(() => assertAdmittedNarratorRetailListingIdentity(value));
  assert.equal(value.retailerAcceptanceConfirmed, true);
  assert.equal(value.admittedPackageManifestBound, true);
  assert.equal(value.spokenNarratorCreditBound, true);
  assert.equal(value.listingIdentityApproved, true);
  assert.equal(value.publicationVerificationEligible, true);
  assert.equal(value.publicationConfirmed, false);
  assert.equal(value.liveConfirmed, false);
  assert.equal(value.identity.metadata.narratorCredit, "EVAVO Narrator");
  assert.equal(
    value.sources.openingCredit.textHash,
    audiobook.opening.generation.plan.script.textHash,
  );
  assert.equal(
    value.sources.closingCredit.textHash,
    audiobook.closing.generation.plan.script.textHash,
  );
  assert.equal(
    value.sources.openingCredit.metadataFingerprint,
    audiobook.opening.generation.plan.script.metadataFingerprint,
  );
});

test("zero-shot narrator uses the same listing boundary without invented training provenance", async () => {
  const fixture = await createTestAdmittedNarratorRetailListingFixture({
    mode: "zero-shot",
    projectId: "project_narrator_listing_zero_shot",
    bookId: "book_narrator_listing_zero_shot",
  });
  const value = fixture.approved;
  const training = value.retailerStatus.submission.decision.review.delivery.release
    .packageApproval.sample.tracks.admittedPlan.wholeBookApproval.binding.reference
    .audiobook.admittedCasting.profileAdmission.training;
  assert.equal(training, null);
  assert.equal(value.syntheticNarrationDeclared, true);
  assert.equal(value.platformAuthorisationBound, true);
  assert.equal(value.identity.metadata.narratorCredit, "EVAVO Narrator");
  assert.equal(value.publicationVerificationEligible, true);
});

test("processing evidence cannot create an admission-bound retail listing", async () => {
  const retailerStatus = await createTestAdmittedNarratorRetailerStatusFixture({
    projectId: "project_narrator_listing_processing",
    bookId: "book_narrator_listing_processing",
    normalisedStatus: "processing",
  });
  const sources = createTestAdmittedNarratorRetailListingSources(retailerStatus);
  assert.throws(
    () => createAdmittedNarratorRetailListingIdentity({
      retailerStatus: retailerStatus.statusEvidence,
      id: "admitted_narrator_listing_processing",
      sources,
      createdAt: new Date("2026-08-10T12:22:00.000Z"),
    }),
    /ADMITTED_NARRATOR_RETAIL_LISTING_RETAILER_ACCEPTANCE_REQUIRED/u,
  );
});

test("another title package and spoken credits cannot be attached after retailer acceptance", async () => {
  const selected = await createTestAdmittedNarratorRetailerStatusFixture({
    projectId: "project_narrator_listing_selected",
    bookId: "book_narrator_listing_selected",
    normalisedStatus: "accepted-awaiting-publication",
  });
  const other = await createTestAdmittedNarratorRetailerStatusFixture({
    projectId: "project_narrator_listing_other",
    bookId: "book_narrator_listing_other",
    normalisedStatus: "accepted-awaiting-publication",
  });
  const otherSources = createTestAdmittedNarratorRetailListingSources(other);
  assert.throws(
    () => createAdmittedNarratorRetailListingIdentity({
      retailerStatus: selected.statusEvidence,
      id: "admitted_narrator_listing_cross_title",
      sources: otherSources,
      createdAt: new Date("2026-08-10T12:22:00.000Z"),
    }),
    /ADMITTED_NARRATOR_RETAIL_LISTING_SOURCE_MISMATCH/u,
  );
});

test("rehashing cannot replace the narrator credit metadata inside an approved listing", async () => {
  const fixture = await createTestAdmittedNarratorRetailListingFixture({
    projectId: "project_narrator_listing_metadata_tamper",
    bookId: "book_narrator_listing_metadata_tamper",
  });
  const value = fixture.approved;
  const { fingerprint: _metadataFingerprint, ...metadataBase } =
    value.identity.metadata;
  const changedMetadata = recomputeMetadata({
    ...metadataBase,
    narratorCredit: "Replacement Narrator",
  });
  const { fingerprint: _identityFingerprint, ...identityBase } = value.identity;
  const changedIdentity = recomputeIdentity({
    ...identityBase,
    metadata: changedMetadata,
  });
  const { fingerprint: _admissionFingerprint, ...admissionBase } = value;
  const changedAdmission = recomputeAdmission({
    ...admissionBase,
    identity: changedIdentity,
  });
  assert.throws(
    () => assertAdmittedNarratorRetailListingIdentity(changedAdmission),
    /AUDIOBOOK_RETAIL_LISTING_CREDIT_METADATA_MISMATCH|AUDIOBOOK_RETAIL_LISTING_SOURCE_MISMATCH/u,
  );
});

test("rehashing cannot turn listing approval into publication or automatic publication authority", async () => {
  const fixture = await createTestAdmittedNarratorRetailListingFixture({
    projectId: "project_narrator_listing_authority_tamper",
    bookId: "book_narrator_listing_authority_tamper",
  });
  const value = fixture.approved;
  const { fingerprint: _fingerprint, ...base } = value;
  const escalated = recomputeAdmission({
    ...base,
    publicationConfirmed: true as never,
    liveConfirmed: true as never,
    automaticPublicationAuthority: true as never,
    publicationAuthority: true as never,
  });
  assert.throws(
    () => assertAdmittedNarratorRetailListingIdentity(escalated),
    /ADMITTED_NARRATOR_RETAIL_LISTING_AUTHORITY_INVALID/u,
  );
});

test("public listing view exposes intended retail credits without private narrator or evidence identity", async () => {
  const fixture = await createTestAdmittedNarratorRetailListingFixture({
    projectId: "project_narrator_listing_public",
    bookId: "book_narrator_listing_public",
  });
  const value = fixture.approved;
  const view = admittedNarratorRetailListingIdentityPublicView(value);
  const serialised = JSON.stringify(view);
  assert.equal(view.narratorCredit, "EVAVO Narrator");
  assert.equal(view.publicationVerificationEligible, true);
  assert.equal(view.publicationConfirmed, false);
  for (const forbidden of [
    value.projectId,
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
    value.voice.profileId,
    value.voice.profileHash,
    value.retailerStatus.evidence.externalStatusReferenceHash,
    value.retailerStatus.evidence.externalStatusTextHash,
    value.retailerStatus.evidence.observedByActorId,
    value.sources.packageManifest.fingerprint,
    value.sources.openingCredit.fingerprint,
    value.sources.closingCredit.fingerprint,
    value.sources.coverEvidence.id,
    value.sources.coverArtifact.fingerprint,
    value.sources.ebookEvidence.id,
    "profileAdmissionHash",
    "admittedCastingFingerprint",
    "externalStatusReferenceHash",
    "coverArtifact",
  ]) assert.equal(serialised.includes(forbidden), false);
});
