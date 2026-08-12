import assert from "node:assert/strict";
import test from "node:test";
import { stableHash } from "./index.js";
import {
  admittedNarratorRetailSubmissionAttemptPublicView,
  admittedNarratorRetailSubmissionDecisionPublicView,
  admittedNarratorRetailSubmissionReviewApprovalPublicView,
  assertAdmittedNarratorRetailSubmissionAttempt,
  assertAdmittedNarratorRetailSubmissionDecision,
  assertAdmittedNarratorRetailSubmissionReviewApproval,
  cancelAdmittedNarratorRetailSubmissionAttempt,
  createAdmittedNarratorRetailSubmissionReviewApproval,
  recordAdmittedNarratorRetailSubmissionFailure,
  startAdmittedNarratorRetailSubmissionAttempt,
  type AdmittedNarratorRetailSubmissionAttempt,
  type AdmittedNarratorRetailSubmissionDecision,
  type AdmittedNarratorRetailSubmissionReviewApproval,
} from "./narrator-retail-submission.js";
import {
  createTestAdmittedNarratorRetailSubmissionAttemptFixture,
  createTestAdmittedNarratorRetailSubmissionDecisionFixture,
  createTestAdmittedNarratorRetailSubmissionReviewFixture,
} from "../test-support/narrator-retail-submission.js";

function recomputeReview(
  partial: Omit<AdmittedNarratorRetailSubmissionReviewApproval, "fingerprint">,
): AdmittedNarratorRetailSubmissionReviewApproval {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function recomputeDecision(
  partial: Omit<AdmittedNarratorRetailSubmissionDecision, "fingerprint">,
): AdmittedNarratorRetailSubmissionDecision {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function recomputeAttempt(
  partial: Omit<AdmittedNarratorRetailSubmissionAttempt, "fingerprint">,
): AdmittedNarratorRetailSubmissionAttempt {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

test("adapted narrator admission survives remote-draft review, submission authority and retailer handoff", async () => {
  const fixture = await createTestAdmittedNarratorRetailSubmissionAttemptFixture({
    mode: "adapted",
    projectId: "project_narrator_submission_adapted",
    bookId: "book_narrator_submission_adapted",
  });
  const review = fixture.decisionFixture.reviewFixture.approval;
  const decision = fixture.decisionFixture.decision;
  const submitted = fixture.submitted;
  assert.doesNotThrow(() =>
    assertAdmittedNarratorRetailSubmissionReviewApproval(review)
  );
  assert.doesNotThrow(() =>
    assertAdmittedNarratorRetailSubmissionDecision(decision)
  );
  assert.doesNotThrow(() =>
    assertAdmittedNarratorRetailSubmissionAttempt(submitted)
  );
  assert.equal(
    review.delivery.release.packageApproval.sample.tracks.admittedPlan.wholeBookApproval.binding.reference.audiobook.admittedCasting.profileAdmission.trainingProvenanceBound,
    true,
  );
  assert.equal(decision.decision.narration.sourceKind, "synthetic-voice");
  assert.equal(decision.decision.narration.platformAuthorisationPresent, true);
  assert.equal(submitted.submissionComplete, true);
  assert.equal(submitted.retailerReviewEligible, true);
  assert.equal(submitted.submissionInitiated, true);
  assert.equal(submitted.retailerAcceptanceClaimed, false);
  assert.equal(submitted.listingPublished, false);
  assert.equal(submitted.publicationAuthority, false);
});

test("zero-shot narrator uses the same submission boundary without invented training provenance", async () => {
  const fixture = await createTestAdmittedNarratorRetailSubmissionDecisionFixture({
    mode: "zero-shot",
    projectId: "project_narrator_submission_zero_shot",
    bookId: "book_narrator_submission_zero_shot",
  });
  const value = fixture.decision;
  assert.equal(
    value.review.delivery.release.packageApproval.sample.tracks.admittedPlan.wholeBookApproval.binding.reference.audiobook.admittedCasting.profileAdmission.training,
    null,
  );
  assert.equal(value.syntheticNarrationDeclared, true);
  assert.equal(value.platformAuthorisationBound, true);
  assert.equal(value.singleSubmissionAuthorised, true);
  assert.equal(value.maximumSubmissionAttempts, 1);
});

test("cross-title remote-draft review and delivery evidence cannot be attached to another narrator", async () => {
  const selected = await createTestAdmittedNarratorRetailSubmissionReviewFixture({
    projectId: "project_narrator_submission_selected",
    bookId: "book_narrator_submission_selected",
  });
  const other = await createTestAdmittedNarratorRetailSubmissionReviewFixture({
    projectId: "project_narrator_submission_other",
    bookId: "book_narrator_submission_other",
  });
  assert.throws(
    () => createAdmittedNarratorRetailSubmissionReviewApproval({
      delivery: selected.delivery.transferred,
      session: other.session,
    }),
    /ADMITTED_NARRATOR_RETAIL_SUBMISSION_REVIEW_LINEAGE_MISMATCH|AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_SOURCE_MISMATCH/u,
  );

  const { fingerprint: _fingerprint, ...base } = selected.approval;
  const changed = recomputeReview({
    ...base,
    session: other.session,
  });
  assert.throws(
    () => assertAdmittedNarratorRetailSubmissionReviewApproval(changed),
    /ADMITTED_NARRATOR_RETAIL_SUBMISSION_REVIEW_LINEAGE_MISMATCH|AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_SOURCE_MISMATCH/u,
  );
});

test("successful admitted submission records processing handoff without retailer acceptance or publication claims", async () => {
  const fixture = await createTestAdmittedNarratorRetailSubmissionAttemptFixture({
    projectId: "project_narrator_submission_success",
    bookId: "book_narrator_submission_success",
  });
  const value = fixture.submitted;
  assert.equal(value.status, "submitted-awaiting-retailer-review");
  assert.equal(value.attempt.receipt?.submissionAcceptedForProcessing, true);
  assert.equal(value.attempt.receipt?.submissionInitiated, true);
  assert.equal(value.attempt.receipt?.retailerAcceptanceClaimed, false);
  assert.equal(value.attempt.receipt?.listingPublished, false);
  const view = admittedNarratorRetailSubmissionAttemptPublicView(value);
  assert.equal(view.retailerReviewEligible, true);
  assert.equal(view.retailerAcceptanceClaimed, false);
  assert.equal(view.listingPublished, false);
  assert.equal(view.publicationAuthority, false);
});

test("failed and cancelled narrator submissions remain terminal under the consumed decision", async () => {
  const fixture = await createTestAdmittedNarratorRetailSubmissionDecisionFixture({
    projectId: "project_narrator_submission_terminal",
    bookId: "book_narrator_submission_terminal",
  });
  const started = startAdmittedNarratorRetailSubmissionAttempt({
    decision: fixture.decision,
    operatorId: "admitted-retail-submission-terminal-operator",
    humanOperationConfirmed: true,
    startedAt: new Date("2026-08-10T12:08:00.000Z"),
  });
  const failed = recordAdmittedNarratorRetailSubmissionFailure(started, {
    failureCode: "SUBMISSION_REMOTE_VALIDATION_FAILED",
    failedByActorId: "admitted-retail-submission-terminal-operator",
    humanConfirmation: true,
    failedAt: new Date("2026-08-10T12:09:00.000Z"),
  });
  assert.equal(failed.status, "submission-failed");
  assert.equal(failed.attempt.failure?.retryPermittedUnderDecision, false);
  assert.equal(failed.submissionComplete, false);
  assert.equal(failed.retailerReviewEligible, false);
  assert.equal(failed.submissionInitiated, false);

  const cancelled = cancelAdmittedNarratorRetailSubmissionAttempt(started, {
    reasonCode: "SUBMISSION_OPERATOR_CANCELLED",
    cancelledByActorId: "admitted-retail-submission-terminal-operator",
    humanConfirmation: true,
    cancelledAt: new Date("2026-08-10T12:09:00.000Z"),
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.attempt.cancellation?.retryPermittedUnderDecision, false);
  assert.equal(cancelled.submissionComplete, false);
  assert.equal(cancelled.retailerReviewEligible, false);
});

test("rehashing cannot substitute the approved review or escalate retailer and publication authority", async () => {
  const selected = await createTestAdmittedNarratorRetailSubmissionDecisionFixture({
    projectId: "project_narrator_submission_decision_selected",
    bookId: "book_narrator_submission_decision_selected",
  });
  const other = await createTestAdmittedNarratorRetailSubmissionDecisionFixture({
    projectId: "project_narrator_submission_decision_other",
    bookId: "book_narrator_submission_decision_other",
  });
  const { fingerprint: _fingerprint, ...decisionBase } = selected.decision;
  const changedDecision = recomputeDecision({
    ...decisionBase,
    review: other.reviewFixture.approval,
  });
  assert.throws(
    () => assertAdmittedNarratorRetailSubmissionDecision(changedDecision),
    /ADMITTED_NARRATOR_RETAIL_SUBMISSION_DECISION_LINEAGE_MISMATCH|AUDIOBOOK_RETAIL_SUBMISSION_DECISION/u,
  );

  const attemptFixture =
    await createTestAdmittedNarratorRetailSubmissionAttemptFixture({
      projectId: "project_narrator_submission_authority",
      bookId: "book_narrator_submission_authority",
    });
  const { fingerprint: _attemptFingerprint, ...attemptBase } =
    attemptFixture.submitted;
  const escalated = recomputeAttempt({
    ...attemptBase,
    retailerAcceptanceClaimed: true as never,
    listingPublished: true as never,
    retailerAcceptanceAuthority: true as never,
    publicationAuthority: true as never,
  });
  assert.throws(
    () => assertAdmittedNarratorRetailSubmissionAttempt(escalated),
    /ADMITTED_NARRATOR_RETAIL_SUBMISSION_ATTEMPT_AUTHORITY_INVALID/u,
  );
});

test("public submission views prove governed progress without private narrator, account, reviewer or receipt identity", async () => {
  const fixture = await createTestAdmittedNarratorRetailSubmissionAttemptFixture({
    projectId: "project_narrator_submission_public",
    bookId: "book_narrator_submission_public",
  });
  const review = fixture.decisionFixture.reviewFixture.approval;
  const decision = fixture.decisionFixture.decision;
  const submitted = fixture.submitted;
  const serialised = JSON.stringify([
    admittedNarratorRetailSubmissionReviewApprovalPublicView(review),
    admittedNarratorRetailSubmissionDecisionPublicView(decision),
    admittedNarratorRetailSubmissionAttemptPublicView(submitted),
  ]);
  const forbidden = [
    review.projectId,
    review.profileAdmissionHash,
    review.admittedCastingFingerprint,
    review.castingFingerprint,
    review.delivery.attempt.id,
    review.delivery.attempt.fingerprint,
    review.delivery.attempt.receipt!.remoteDraftReferenceHash,
    review.delivery.release.distributorAccount.id,
    review.delivery.release.distributorAccount.fingerprint,
    review.session.id,
    review.session.fingerprint,
    ...review.session.reviews.map((entry) => entry.reviewerId),
    review.session.approval!.approvedByActorId,
    decision.decision.finalConfirmationId,
    decision.decision.decidedByActorId,
    submitted.attempt.operatorId,
    submitted.attempt.receipt!.submissionReceiptHash,
    submitted.attempt.receipt!.retailerSubmissionReferenceHash,
    submitted.attempt.receipt!.completedByActorId,
    "profileAdmissionHash",
    "admittedCastingFingerprint",
    "remoteDraftReferenceHash",
    "submissionReceiptHash",
    "retailerSubmissionReferenceHash",
  ];
  for (const value of forbidden) assert.equal(serialised.includes(value), false);
});
