import assert from "node:assert/strict";
import test from "node:test";
import { stableHash } from "./index.js";
import {
  admittedNarratorRetailTrackApprovalPublicView,
  assertAdmittedNarratorRetailTrackApproval,
  createAdmittedNarratorRetailTrackApproval,
  type AdmittedNarratorRetailTrackApproval,
} from "./narrator-retail-track-production.js";
import {
  createTestAdmittedNarratorRetailTrackFixture,
} from "../test-support/narrator-retail.js";
import { testDigest } from "../test-support/narrator-casting.js";

test("adapted narrator admission survives MP3 engineering and complete human track approval", async () => {
  const fixture = await createTestAdmittedNarratorRetailTrackFixture({
    mode: "adapted",
    projectId: "project_retail_track_adapted",
    bookId: "book_retail_track_adapted",
  });
  const value = fixture.approval;
  assert.doesNotThrow(() => assertAdmittedNarratorRetailTrackApproval(value));
  assert.equal(
    value.admittedPlan.wholeBookApproval.binding.reference.audiobook.admittedCasting.profileAdmission.trainingProvenanceBound,
    true,
  );
  assert.equal(value.encodeChain.eligibleForReview, true);
  assert.equal(value.reviewSession.status, "approved");
  assert.equal(value.approvedTrackArtifacts.length, value.admittedPlan.plan.tracks.length);
  assert.equal(value.retailTrackEngineeringComplete, true);
  assert.equal(value.retailTrackListeningApproval, true);
  assert.equal(value.eligibleForRetailSample, true);
  assert.equal(value.releaseDecisionAuthority, false);
  assert.equal(value.publicationAuthority, false);
});

test("zero-shot narrator uses the same retail production boundary without invented training evidence", async () => {
  const fixture = await createTestAdmittedNarratorRetailTrackFixture({
    mode: "zero-shot",
    projectId: "project_retail_track_zero_shot",
    bookId: "book_retail_track_zero_shot",
  });
  const value = fixture.approval;
  assert.doesNotThrow(() => assertAdmittedNarratorRetailTrackApproval(value));
  assert.equal(
    value.admittedPlan.wholeBookApproval.binding.reference.audiobook.admittedCasting.profileAdmission.training,
    null,
  );
  assert.equal(value.syntheticNarrationDeclared, true);
  assert.equal(value.platformAuthorisationBound, true);
});

test("another retail plan or encode chain cannot be attached to approved MP3 reviews", async () => {
  const selected = await createTestAdmittedNarratorRetailTrackFixture({
    projectId: "project_retail_track_selected",
    bookId: "book_retail_track_selected",
  });
  const other = await createTestAdmittedNarratorRetailTrackFixture({
    projectId: "project_retail_track_other",
    bookId: "book_retail_track_other",
  });
  assert.throws(
    () => createAdmittedNarratorRetailTrackApproval({
      admittedPlan: selected.admittedPlan,
      encodeChain: other.encodeChain,
      reviewSession: other.reviewSession,
      approvedTrackArtifacts: other.approvedTrackArtifacts,
    }),
    /ADMITTED_NARRATOR_RETAIL_TRACK_LINEAGE_MISMATCH|AUDIOBOOK_RETAIL_TRACK/u,
  );
});

test("approved MP3 artifact substitution fails even after the outer record is rehashed", async () => {
  const fixture = await createTestAdmittedNarratorRetailTrackFixture({
    projectId: "project_retail_track_artifact",
    bookId: "book_retail_track_artifact",
  });
  const value = fixture.approval;
  const changedArtifact = {
    ...value.approvedTrackArtifacts[0]!,
    fingerprint: testDigest("substituted-approved-track"),
  };
  const { fingerprint: _fingerprint, ...base } = value;
  const changedBase = {
    ...base,
    approvedTrackArtifacts: Object.freeze([
      changedArtifact,
      ...value.approvedTrackArtifacts.slice(1),
    ]),
  };
  const changed = {
    ...changedBase,
    fingerprint: stableHash(changedBase),
  } as AdmittedNarratorRetailTrackApproval;
  assert.throws(
    () => assertAdmittedNarratorRetailTrackApproval(changed),
    /ADMITTED_NARRATOR_RETAIL_TRACK_ARTIFACT_MISMATCH|ARTIFACT/u,
  );
});

test("retail track approval cannot grant delivery, release or publication authority", async () => {
  const fixture = await createTestAdmittedNarratorRetailTrackFixture({
    projectId: "project_retail_track_authority",
    bookId: "book_retail_track_authority",
  });
  const value = fixture.approval;
  const { fingerprint: _fingerprint, ...base } = value;
  const changedBase = {
    ...base,
    deliveryAuthority: true,
    releaseDecisionAuthority: true,
    publicationAuthority: true,
  };
  const changed = {
    ...changedBase,
    fingerprint: stableHash(changedBase),
  } as unknown as AdmittedNarratorRetailTrackApproval;
  assert.throws(
    () => assertAdmittedNarratorRetailTrackApproval(changed),
    /ADMITTED_NARRATOR_RETAIL_TRACK_AUTHORITY_INVALID/u,
  );
});

test("public retail track approval proves completion without narrator, platform or reviewer identity", async () => {
  const fixture = await createTestAdmittedNarratorRetailTrackFixture({
    projectId: "project_retail_track_public",
    bookId: "book_retail_track_public",
  });
  const value = fixture.approval;
  const view = admittedNarratorRetailTrackApprovalPublicView(value);
  const json = JSON.stringify(view);
  assert.equal(view.retailTrackEngineeringComplete, true);
  assert.equal(view.retailTrackListeningApproval, true);
  assert.equal(view.eligibleForRetailSample, true);
  for (const forbidden of [
    value.voice.profileId,
    value.voice.profileHash,
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
    value.admittedPlan.narrationEligibility.platformAuthorisation!.id,
    value.reviewSession.approval!.approvedByActorId,
    value.approvedTrackArtifacts[0]!.id,
  ]) assert.equal(json.includes(forbidden), false);
});
