import assert from "node:assert/strict";
import test from "node:test";
import { stableHash } from "./index.js";
import {
  admittedNarratorRetailDeliveryAttemptPublicView,
  admittedNarratorRetailReleaseDecisionPublicView,
  assertAdmittedNarratorRetailDeliveryAttempt,
  assertAdmittedNarratorRetailReleaseDecision,
  cancelAdmittedNarratorRetailDeliveryAttempt,
  createAdmittedNarratorRetailReleaseDecision,
  recordAdmittedNarratorRetailDeliveryFailure,
  startAdmittedNarratorRetailDeliveryAttempt,
  type AdmittedNarratorRetailDeliveryAttempt,
  type AdmittedNarratorRetailReleaseDecision,
} from "./narrator-retail-release-delivery.js";
import {
  createTestAdmittedNarratorRetailDeliveryFixture,
  createTestAdmittedNarratorRetailReleaseFixture,
} from "../test-support/narrator-retail-release.js";

function recomputeRelease(
  partial: Omit<AdmittedNarratorRetailReleaseDecision, "fingerprint">,
): AdmittedNarratorRetailReleaseDecision {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function recomputeDelivery(
  partial: Omit<AdmittedNarratorRetailDeliveryAttempt, "fingerprint">,
): AdmittedNarratorRetailDeliveryAttempt {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

test("adapted narrator package approval becomes one admission-bound controlled delivery decision", async () => {
  const fixture = await createTestAdmittedNarratorRetailReleaseFixture({
    mode: "adapted",
    projectId: "project_narrator_release_adapted",
    bookId: "book_narrator_release_adapted",
  });
  const value = fixture.release;
  assert.doesNotThrow(() => assertAdmittedNarratorRetailReleaseDecision(value));
  assert.equal(
    value.packageApproval.sample.tracks.admittedPlan.wholeBookApproval.binding.reference.audiobook.admittedCasting.profileAdmission.trainingProvenanceBound,
    true,
  );
  assert.equal(value.decision.narration.sourceKind, "synthetic-voice");
  assert.equal(value.decision.narration.platformAuthorisationPresent, true);
  assert.equal(value.releaseDecisionRecorded, true);
  assert.equal(value.controlledDeliveryAuthorised, true);
  assert.equal(value.maximumDeliveryAttempts, 1);
  assert.equal(value.submissionAuthority, false);
  assert.equal(value.retailerAcceptanceAuthority, false);
  assert.equal(value.publicationAuthority, false);
});

test("zero-shot narrator uses the same release boundary without invented training provenance", async () => {
  const fixture = await createTestAdmittedNarratorRetailReleaseFixture({
    mode: "zero-shot",
    projectId: "project_narrator_release_zero_shot",
    bookId: "book_narrator_release_zero_shot",
  });
  const value = fixture.release;
  assert.doesNotThrow(() => assertAdmittedNarratorRetailReleaseDecision(value));
  assert.equal(
    value.packageApproval.sample.tracks.admittedPlan.wholeBookApproval.binding.reference.audiobook.admittedCasting.profileAdmission.training,
    null,
  );
  assert.equal(value.syntheticNarrationDeclared, true);
  assert.equal(value.platformAuthorisationBound, true);
});

test("cross-title package or distributor account evidence cannot authorise narrator delivery", async () => {
  const selected = await createTestAdmittedNarratorRetailReleaseFixture({
    projectId: "project_narrator_release_selected",
    bookId: "book_narrator_release_selected",
  });
  const other = await createTestAdmittedNarratorRetailReleaseFixture({
    projectId: "project_narrator_release_other",
    bookId: "book_narrator_release_other",
  });
  assert.throws(
    () => createAdmittedNarratorRetailReleaseDecision({
      packageApproval: selected.package.approval,
      distributorAccount: other.distributorAccount,
      finalConfirmationId: "narrator_release_wrong_account_confirmation",
      decidedByActorId: "narrator-release-independent-authority",
      humanConfirmation: true,
      validUntil: "2026-08-10T14:00:00.000Z",
      decidedAt: new Date("2026-08-10T12:00:00.000Z"),
    }),
    /AUDIOBOOK_RETAIL_RELEASE_DECISION_SOURCE_SCOPE_MISMATCH/u,
  );

  const { fingerprint: _fingerprint, ...base } = selected.release;
  const changed = recomputeRelease({
    ...base,
    packageApproval: other.package.approval,
  });
  assert.throws(
    () => assertAdmittedNarratorRetailReleaseDecision(changed),
    /ADMITTED_NARRATOR_RETAIL_RELEASE_LINEAGE_MISMATCH|AUDIOBOOK_RETAIL_RELEASE_DECISION/u,
  );
});

test("successful controlled transfer preserves narrator admission without submission or retailer claims", async () => {
  const fixture = await createTestAdmittedNarratorRetailDeliveryFixture({
    mode: "adapted",
    projectId: "project_narrator_delivery_success",
    bookId: "book_narrator_delivery_success",
  });
  const value = fixture.transferred;
  assert.doesNotThrow(() => assertAdmittedNarratorRetailDeliveryAttempt(value));
  assert.equal(value.status, "files-transferred-awaiting-submission-review");
  assert.equal(value.deliveryTransferComplete, true);
  assert.equal(value.submissionReviewEligible, true);
  assert.equal(value.submissionInitiated, false);
  assert.equal(value.retailerAcceptanceClaimed, false);
  assert.equal(value.attempt.receipt?.submissionInitiated, false);
  assert.equal(value.attempt.receipt?.retailerAcceptanceClaimed, false);
  assert.equal(value.submissionAuthority, false);
  assert.equal(value.publicationAuthority, false);
});

test("failed and cancelled admitted delivery attempts remain terminal without retry or submission eligibility", async () => {
  const fixture = await createTestAdmittedNarratorRetailReleaseFixture({
    projectId: "project_narrator_delivery_terminal",
    bookId: "book_narrator_delivery_terminal",
  });
  const started = startAdmittedNarratorRetailDeliveryAttempt({
    release: fixture.release,
    operatorId: "narrator-delivery-terminal-operator",
    humanOperationConfirmed: true,
    startedAt: new Date("2026-08-10T12:01:00.000Z"),
  });
  const failed = recordAdmittedNarratorRetailDeliveryFailure(started, {
    failureCode: "DELIVERY_REMOTE_DRAFT_UNAVAILABLE",
    failedByActorId: "narrator-delivery-terminal-operator",
    humanConfirmation: true,
    failedAt: new Date("2026-08-10T12:02:00.000Z"),
  });
  assert.equal(failed.status, "transfer-failed");
  assert.equal(failed.attempt.failure?.retryPermittedUnderDecision, false);
  assert.equal(failed.deliveryTransferComplete, false);
  assert.equal(failed.submissionReviewEligible, false);
  assert.doesNotThrow(() => assertAdmittedNarratorRetailDeliveryAttempt(failed));

  const cancelled = cancelAdmittedNarratorRetailDeliveryAttempt(started, {
    reasonCode: "DELIVERY_OPERATOR_CANCELLED",
    cancelledByActorId: "narrator-delivery-terminal-operator",
    humanConfirmation: true,
    cancelledAt: new Date("2026-08-10T12:02:00.000Z"),
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(
    cancelled.attempt.cancellation?.retryPermittedUnderDecision,
    false,
  );
  assert.equal(cancelled.submissionReviewEligible, false);
  assert.doesNotThrow(() => assertAdmittedNarratorRetailDeliveryAttempt(cancelled));
});

test("release substitution and authority escalation fail even after outer records are rehashed", async () => {
  const selected = await createTestAdmittedNarratorRetailDeliveryFixture({
    projectId: "project_narrator_delivery_selected",
    bookId: "book_narrator_delivery_selected",
  });
  const other = await createTestAdmittedNarratorRetailDeliveryFixture({
    projectId: "project_narrator_delivery_other",
    bookId: "book_narrator_delivery_other",
  });
  const { fingerprint: _deliveryFingerprint, ...deliveryBase } =
    selected.started;
  const changedRelease = recomputeDelivery({
    ...deliveryBase,
    release: other.releaseFixture.release,
  });
  assert.throws(
    () => assertAdmittedNarratorRetailDeliveryAttempt(changedRelease),
    /ADMITTED_NARRATOR_RETAIL_DELIVERY_LINEAGE_MISMATCH|AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT/u,
  );

  const { fingerprint: _releaseFingerprint, ...releaseBase } =
    selected.releaseFixture.release;
  const escalatedRelease = recomputeRelease({
    ...releaseBase,
    submissionAuthority: true as never,
  });
  assert.throws(
    () => assertAdmittedNarratorRetailReleaseDecision(escalatedRelease),
    /ADMITTED_NARRATOR_RETAIL_RELEASE_AUTHORITY_INVALID/u,
  );

  const escalatedDelivery = recomputeDelivery({
    ...deliveryBase,
    retailerAcceptanceClaimed: true as never,
  });
  assert.throws(
    () => assertAdmittedNarratorRetailDeliveryAttempt(escalatedDelivery),
    /ADMITTED_NARRATOR_RETAIL_DELIVERY_AUTHORITY_INVALID/u,
  );
});

test("public release and delivery views prove bounded progress without private narrator, account or receipt identity", async () => {
  const fixture = await createTestAdmittedNarratorRetailDeliveryFixture({
    projectId: "project_narrator_delivery_public",
    bookId: "book_narrator_delivery_public",
  });
  const releaseView = admittedNarratorRetailReleaseDecisionPublicView(
    fixture.releaseFixture.release,
  );
  const deliveryView = admittedNarratorRetailDeliveryAttemptPublicView(
    fixture.transferred,
  );
  const serialised = JSON.stringify({ releaseView, deliveryView });
  for (const forbidden of [
    fixture.releaseFixture.release.profileAdmissionHash,
    fixture.releaseFixture.release.admittedCastingFingerprint,
    fixture.releaseFixture.release.castingFingerprint,
    fixture.releaseFixture.package.approval.fingerprint,
    fixture.releaseFixture.distributorAccount.id,
    fixture.releaseFixture.distributorAccount.accountReferenceHash,
    fixture.releaseFixture.release.decision.id,
    fixture.releaseFixture.release.decision.decidedByActorId,
    fixture.transferred.attempt.operatorId,
    fixture.transferred.attempt.receipt!.receiptReferenceHash,
    fixture.transferred.attempt.receipt!.remoteDraftReferenceHash,
    "accountReferenceHash",
    "profileAdmissionHash",
    "receiptReferenceHash",
    "remoteDraftReferenceHash",
  ]) assert.equal(serialised.includes(forbidden), false);
  assert.equal(releaseView.controlledDeliveryAuthorised, true);
  assert.equal(deliveryView.submissionReviewEligible, true);
  assert.equal(deliveryView.publicationAuthority, false);
});
