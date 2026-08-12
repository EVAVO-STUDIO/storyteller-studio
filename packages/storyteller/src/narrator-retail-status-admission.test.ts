import assert from "node:assert/strict";
import test from "node:test";
import { stableHash } from "./index.js";
import {
  admittedNarratorRetailerStatusEvidencePublicView,
  assertAdmittedNarratorRetailerStatusEvidence,
  type AdmittedNarratorRetailerStatusEvidence,
} from "./narrator-retail-status-admission.js";
import {
  createTestAdmittedNarratorRetailerStatusFixture,
} from "../test-support/narrator-retail-status-admission.js";

function recomputeStatus(
  partial: Omit<AdmittedNarratorRetailerStatusEvidence, "fingerprint">,
): AdmittedNarratorRetailerStatusEvidence {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

test("adapted narrator admission survives exact retailer processing evidence", async () => {
  const fixture = await createTestAdmittedNarratorRetailerStatusFixture({
    mode: "adapted",
    projectId: "project_narrator_retailer_status_adapted",
    bookId: "book_narrator_retailer_status_adapted",
    normalisedStatus: "processing",
  });
  const value = fixture.statusEvidence;
  assert.doesNotThrow(() => assertAdmittedNarratorRetailerStatusEvidence(value));
  assert.equal(
    value.submission.decision.review.delivery.release.packageApproval.sample.tracks.admittedPlan.wholeBookApproval.binding.reference.audiobook.admittedCasting.profileAdmission.trainingProvenanceBound,
    true,
  );
  assert.equal(value.syntheticNarrationDeclared, true);
  assert.equal(value.platformAuthorisationBound, true);
  assert.equal(value.submissionComplete, true);
  assert.equal(value.retailerReviewEligible, true);
  assert.equal(value.retailerStatusEvidenceComplete, true);
  assert.equal(value.evidence.normalisedStatus, "processing");
  assert.equal(value.retailerAcceptanceConfirmed, false);
  assert.equal(value.publicationConfirmed, false);
  assert.equal(value.liveConfirmed, false);
  assert.equal(value.publicationAuthority, false);
});

test("zero-shot narrator uses the same retailer-status boundary without invented training provenance", async () => {
  const fixture = await createTestAdmittedNarratorRetailerStatusFixture({
    mode: "zero-shot",
    projectId: "project_narrator_retailer_status_zero_shot",
    bookId: "book_narrator_retailer_status_zero_shot",
  });
  const value = fixture.statusEvidence;
  assert.equal(
    value.submission.decision.review.delivery.release.packageApproval.sample.tracks.admittedPlan.wholeBookApproval.binding.reference.audiobook.admittedCasting.profileAdmission.training,
    null,
  );
  assert.equal(value.narratorAdmissionComplete, true);
  assert.equal(value.syntheticNarrationDeclared, true);
  assert.equal(value.platformAuthorisationBound, true);
  assert.equal(value.evidence.normalisedStatus, "processing");
});

test("retailer acceptance remains evidence awaiting separate publication verification", async () => {
  const fixture = await createTestAdmittedNarratorRetailerStatusFixture({
    projectId: "project_narrator_retailer_status_accepted",
    bookId: "book_narrator_retailer_status_accepted",
    normalisedStatus: "accepted-awaiting-publication",
  });
  const value = fixture.statusEvidence;
  assert.equal(value.evidence.normalisedStatus, "accepted-awaiting-publication");
  assert.equal(value.evidence.retailerAcceptanceConfirmed, true);
  assert.equal(value.retailerAcceptanceConfirmed, true);
  assert.equal(value.publicationConfirmed, false);
  assert.equal(value.liveConfirmed, false);
  assert.equal(value.retailerAcceptanceAuthority, false);
  assert.equal(value.publicationAuthority, false);
});

test("retailer changes requested preserve narrator lineage without automatic resubmission authority", async () => {
  const fixture = await createTestAdmittedNarratorRetailerStatusFixture({
    projectId: "project_narrator_retailer_status_changes",
    bookId: "book_narrator_retailer_status_changes",
    normalisedStatus: "changes-requested",
    issueCodes: ["RETAILER_AUDIO_REVISION_REQUIRED"],
  });
  const value = fixture.statusEvidence;
  assert.deepEqual(value.evidence.issueCodes, [
    "RETAILER_AUDIO_REVISION_REQUIRED",
  ]);
  assert.equal(value.resubmissionRequired, true);
  assert.equal(value.automaticResubmissionAuthority, false);
  assert.equal(value.retailerAcceptanceConfirmed, false);
  assert.equal(value.publicationConfirmed, false);
});

test("rehashing cannot attach retailer status from another submitted narrator chain", async () => {
  const selected = await createTestAdmittedNarratorRetailerStatusFixture({
    projectId: "project_narrator_retailer_status_selected",
    bookId: "book_narrator_retailer_status_selected",
  });
  const other = await createTestAdmittedNarratorRetailerStatusFixture({
    projectId: "project_narrator_retailer_status_other",
    bookId: "book_narrator_retailer_status_other",
  });
  const { fingerprint: _fingerprint, ...base } = selected.statusEvidence;
  const changed = recomputeStatus({
    ...base,
    evidence: other.statusEvidence.evidence,
  });
  assert.throws(
    () => assertAdmittedNarratorRetailerStatusEvidence(changed),
    /ADMITTED_NARRATOR_RETAILER_STATUS_LINEAGE_MISMATCH|AUDIOBOOK_RETAILER_STATUS_SOURCE_MISMATCH/u,
  );
});

test("rehashing cannot escalate retailer, resubmission or publication authority", async () => {
  const fixture = await createTestAdmittedNarratorRetailerStatusFixture({
    projectId: "project_narrator_retailer_status_authority",
    bookId: "book_narrator_retailer_status_authority",
    normalisedStatus: "accepted-awaiting-publication",
  });
  const { fingerprint: _fingerprint, ...base } = fixture.statusEvidence;
  const escalated = recomputeStatus({
    ...base,
    automaticResubmissionAuthority: true as never,
    retailerAcceptanceAuthority: true as never,
    publicationAuthority: true as never,
    publicationConfirmed: true as never,
    liveConfirmed: true as never,
  });
  assert.throws(
    () => assertAdmittedNarratorRetailerStatusEvidence(escalated),
    /ADMITTED_NARRATOR_RETAILER_STATUS_AUTHORITY_INVALID/u,
  );
});

test("public retailer-status view proves bounded state without private narrator, account, submission or retailer references", async () => {
  const fixture = await createTestAdmittedNarratorRetailerStatusFixture({
    projectId: "project_narrator_retailer_status_public",
    bookId: "book_narrator_retailer_status_public",
    normalisedStatus: "accepted-awaiting-publication",
  });
  const value = fixture.statusEvidence;
  const view = admittedNarratorRetailerStatusEvidencePublicView(value);
  const serialised = JSON.stringify(view);
  assert.equal(view.retailerAcceptanceConfirmed, true);
  assert.equal(view.publicationConfirmed, false);
  assert.equal(view.liveConfirmed, false);
  for (const forbidden of [
    value.projectId,
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
    value.voice.profileId,
    value.voice.profileHash,
    value.submission.attempt.id,
    value.submission.attempt.fingerprint,
    value.submission.attempt.receipt!.submissionReceiptHash,
    value.submission.attempt.receipt!.retailerSubmissionReferenceHash,
    value.evidence.externalStatusReferenceHash,
    value.evidence.externalStatusTextHash,
    value.evidence.observedByActorId,
    value.evidence.distributorAccount.evidenceId,
    value.evidence.distributorAccount.evidenceFingerprint,
    value.evidence.package.fileSetFingerprint,
    "profileAdmissionHash",
    "admittedCastingFingerprint",
    "retailerSubmissionReferenceHash",
    "externalStatusReferenceHash",
    "externalStatusTextHash",
    "observedByActorId",
  ]) assert.equal(serialised.includes(forbidden), false);
});
