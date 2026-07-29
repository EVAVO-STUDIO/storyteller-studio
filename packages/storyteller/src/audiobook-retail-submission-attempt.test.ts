import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { AudiobookRetailDistributorAccountEvidence } from "./audiobook-retail-release-decision.js";
import {
  createAudiobookRetailSubmissionDecision,
  type AudiobookRetailSubmissionDecisionSources,
} from "./audiobook-retail-submission-decision.js";
import {
  FileAudiobookRetailSubmissionAttemptStore,
  assertAudiobookRetailSubmissionAttempt,
  assertAudiobookRetailSubmissionAttemptMatchesSources,
  audiobookRetailSubmissionAttemptPublicView,
  cancelAudiobookRetailSubmissionAttempt,
  recordAudiobookRetailSubmissionFailure,
  recordAudiobookRetailSubmissionReceipt,
  startAudiobookRetailSubmissionAttempt,
  type AudiobookRetailSubmissionAttempt,
} from "./audiobook-retail-submission-attempt.js";
import { stableHash } from "./index.js";
import { FileProjectStore } from "./project-store.js";
import { retailReleaseAt } from "./test-support/retail-release-policy-fixture.js";
import { retailSubmissionReviewFixture } from "./test-support/retail-submission-review-fixture.js";

function fixture() {
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
    finalConfirmationId: "retail_submission_attempt_decision_confirmation_001",
    decidedByActorId: "publisher_submission_authority_001",
    humanConfirmation: true,
    submissionMethod: "manual-acx-submit",
    decidedAt: retailReleaseAt(17),
    validUntil: retailReleaseAt(30).toISOString(),
  });
  return {
    reviewFixture,
    submissionDecision,
    startInput: {
      submissionDecision,
      submissionReview: reviewFixture.submissionReview,
      deliveryAttempt: reviewFixture.deliveryAttempt,
      distributorAccount: reviewFixture.release.account,
      operatorId: "manual_submission_operator_001",
      humanOperationConfirmed: true as const,
      startedAt: retailReleaseAt(18),
    },
  };
}

function recomputeAttempt(
  partial: Omit<AudiobookRetailSubmissionAttempt, "fingerprint">,
): AudiobookRetailSubmissionAttempt {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function recomputeAccount(
  partial: Omit<AudiobookRetailDistributorAccountEvidence, "fingerprint">,
): AudiobookRetailDistributorAccountEvidence {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

test("one authorized decision becomes one persisted sanitized submission receipt", async () => {
  const value = fixture();
  const started = startAudiobookRetailSubmissionAttempt(value.startInput);
  assert.equal(started.status, "in-progress");
  assert.equal(started.attemptOrdinal, 1);
  assert.doesNotThrow(() => assertAudiobookRetailSubmissionAttempt(started));
  assert.doesNotThrow(() =>
    assertAudiobookRetailSubmissionAttemptMatchesSources(started, value.startInput)
  );

  const submitted = recordAudiobookRetailSubmissionReceipt(started, {
    submissionReceiptHash: "a".repeat(64),
    retailerSubmissionReferenceHash: "b".repeat(64),
    mediaFileCountAcknowledged: started.package.mediaFileCount,
    allApprovedFilesIncluded: true,
    submissionAcceptedForProcessing: true,
    submissionInitiated: true,
    retailerAcceptanceClaimed: false,
    listingPublished: false,
    completedByActorId: "manual_submission_operator_001",
    humanConfirmation: true,
    completedAt: retailReleaseAt(19),
  });
  assert.equal(submitted.status, "submitted-awaiting-retailer-review");
  assert.equal(submitted.receipt?.submissionInitiated, true);
  assert.equal(submitted.receipt?.retailerAcceptanceClaimed, false);
  assert.equal(submitted.receipt?.listingPublished, false);
  assert.equal(submitted.revision, 2);
  assert.doesNotThrow(() => assertAudiobookRetailSubmissionAttempt(submitted));

  const root = await mkdtemp(join(tmpdir(), "storyteller-submission-attempt-"));
  try {
    const store = new FileAudiobookRetailSubmissionAttemptStore(
      new FileProjectStore(root),
    );
    const first = await store.create(started, "submission_attempt_store_actor_001");
    const repeated = await store.create(started, "submission_attempt_store_actor_001");
    assert.equal(first.envelopeHash, repeated.envelopeHash);
    await store.save(submitted, {
      expectedRevision: 1,
      actorId: "manual_submission_operator_001",
      action: "audiobook_retail_submission_attempt.submitted",
    });
    assert.equal(
      (await store.require(started.id)).payload.fingerprint,
      submitted.fingerprint,
    );

    const view = audiobookRetailSubmissionAttemptPublicView(submitted);
    const serialised = JSON.stringify(view);
    const audit = await readFile(join(root, "audit", "2026-07-29.jsonl"), "utf8");
    const auditMetadata = JSON.stringify(
      audit.trim().split(/\r?\n/u).filter(Boolean).map((line) =>
        (JSON.parse(line) as { metadata: unknown }).metadata
      ),
    );
    for (const forbidden of [
      submitted.projectId,
      submitted.packageId,
      submitted.submissionDecision.id,
      submitted.submissionDecision.fingerprint,
      submitted.submissionReview.id,
      submitted.deliveryAttempt.id,
      submitted.deliveryAttempt.remoteDraftReferenceHash,
      submitted.distributorAccount.evidenceId,
      submitted.distributorAccount.evidenceFingerprint,
      submitted.package.fileSetFingerprint,
      submitted.operatorId,
      submitted.receipt!.submissionReceiptHash,
      submitted.receipt!.retailerSubmissionReferenceHash,
      submitted.receipt!.completedByActorId,
      "remoteDraftReferenceHash",
      "fileSetFingerprint",
      "submissionReceiptHash",
      "retailerSubmissionReferenceHash",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
      assert.equal(auditMetadata.includes(forbidden), false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("attempt identity is deterministic and terminal results cannot be replaced", async () => {
  const value = fixture();
  const first = startAudiobookRetailSubmissionAttempt(value.startInput);
  const repeated = startAudiobookRetailSubmissionAttempt(value.startInput);
  assert.equal(first.id, repeated.id);
  assert.equal(first.fingerprint, repeated.fingerprint);

  const submitted = recordAudiobookRetailSubmissionReceipt(first, {
    submissionReceiptHash: "a".repeat(64),
    retailerSubmissionReferenceHash: "b".repeat(64),
    mediaFileCountAcknowledged: first.package.mediaFileCount,
    allApprovedFilesIncluded: true,
    submissionAcceptedForProcessing: true,
    submissionInitiated: true,
    retailerAcceptanceClaimed: false,
    listingPublished: false,
    completedByActorId: "manual_submission_operator_001",
    humanConfirmation: true,
    completedAt: retailReleaseAt(19),
  });
  assert.throws(
    () => recordAudiobookRetailSubmissionFailure(submitted, {
      failureCode: "SUBMISSION_REMOTE_SAVE_FAILED",
      failedByActorId: "manual_submission_operator_001",
      humanConfirmation: true,
      failedAt: retailReleaseAt(20),
    }),
    /AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_TERMINAL_IMMUTABLE/u,
  );

  const root = await mkdtemp(join(tmpdir(), "storyteller-submission-idempotency-"));
  try {
    const store = new FileAudiobookRetailSubmissionAttemptStore(
      new FileProjectStore(root),
    );
    await store.create(first, "submission_attempt_store_actor_001");
    const changedOperator = startAudiobookRetailSubmissionAttempt({
      ...value.startInput,
      operatorId: "manual_submission_operator_other_001",
    });
    assert.equal(changedOperator.id, first.id);
    await assert.rejects(
      store.create(changedOperator, "submission_attempt_store_actor_001"),
      /AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_STORE_IDEMPOTENCY_CONFLICT/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failed and cancelled submissions are terminal under the consumed decision", () => {
  const value = fixture();
  const started = startAudiobookRetailSubmissionAttempt(value.startInput);
  const failed = recordAudiobookRetailSubmissionFailure(started, {
    failureCode: "SUBMISSION_REMOTE_VALIDATION_FAILED",
    failedByActorId: "manual_submission_operator_001",
    humanConfirmation: true,
    failedAt: retailReleaseAt(19),
  });
  assert.equal(failed.status, "submission-failed");
  assert.equal(failed.failure?.retryPermittedUnderDecision, false);
  assert.equal(
    audiobookRetailSubmissionAttemptPublicView(failed).failureCode,
    "SUBMISSION_REMOTE_VALIDATION_FAILED",
  );

  const cancelled = cancelAudiobookRetailSubmissionAttempt(started, {
    reasonCode: "SUBMISSION_OPERATOR_CANCELLED",
    cancelledByActorId: "manual_submission_operator_001",
    humanConfirmation: true,
    cancelledAt: retailReleaseAt(19),
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancellation?.retryPermittedUnderDecision, false);
});

test("expired decisions, bot operators, wrong accounts and incomplete receipts fail closed", () => {
  const value = fixture();
  assert.throws(
    () => startAudiobookRetailSubmissionAttempt({
      ...value.startInput,
      startedAt: new Date(value.submissionDecision.validUntil),
    }),
    /AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_DECISION_NOT_CURRENT/u,
  );
  assert.throws(
    () => startAudiobookRetailSubmissionAttempt({
      ...value.startInput,
      operatorId: "bot_submission_operator",
    }),
    /AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_OPERATOR_INVALID/u,
  );

  const { fingerprint: _fingerprint, ...accountBase } =
    value.reviewFixture.release.account;
  const wrongAccount = recomputeAccount({
    ...accountBase,
    projectId: "project_submission_attempt_other_001",
  });
  assert.throws(
    () => startAudiobookRetailSubmissionAttempt({
      ...value.startInput,
      distributorAccount: wrongAccount,
    }),
    /AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_SOURCE_MISMATCH/u,
  );

  const started = startAudiobookRetailSubmissionAttempt(value.startInput);
  assert.throws(
    () => recordAudiobookRetailSubmissionReceipt(started, {
      submissionReceiptHash: "a".repeat(64),
      retailerSubmissionReferenceHash: "b".repeat(64),
      mediaFileCountAcknowledged: started.package.mediaFileCount - 1,
      allApprovedFilesIncluded: true,
      submissionAcceptedForProcessing: true,
      submissionInitiated: true,
      retailerAcceptanceClaimed: false,
      listingPublished: false,
      completedByActorId: "manual_submission_operator_001",
      humanConfirmation: true,
      completedAt: retailReleaseAt(19),
    }),
    /AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_FILE_COUNT_MISMATCH/u,
  );
  assert.throws(
    () => recordAudiobookRetailSubmissionReceipt(started, {
      submissionReceiptHash: "a".repeat(64),
      retailerSubmissionReferenceHash: "b".repeat(64),
      mediaFileCountAcknowledged: started.package.mediaFileCount,
      allApprovedFilesIncluded: true,
      submissionAcceptedForProcessing: true,
      submissionInitiated: true,
      retailerAcceptanceClaimed: true as never,
      listingPublished: false,
      completedByActorId: "manual_submission_operator_001",
      humanConfirmation: true,
      completedAt: retailReleaseAt(19),
    }),
    /AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_RECEIPT_ATTESTATION_INVALID/u,
  );
});

test("recomputed attempt state cannot replace the authorized submission decision", () => {
  const value = fixture();
  const attempt = startAudiobookRetailSubmissionAttempt(value.startInput);
  const { fingerprint: _fingerprint, ...base } = attempt;
  const changed = recomputeAttempt({
    ...base,
    submissionDecision: Object.freeze({
      ...attempt.submissionDecision,
      id: "retail_submission_decision_structurally_wrong_001",
    }),
  });
  assert.doesNotThrow(() => assertAudiobookRetailSubmissionAttempt(changed));
  assert.throws(
    () => assertAudiobookRetailSubmissionAttemptMatchesSources(
      changed,
      value.startInput,
    ),
    /AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_SOURCE_MISMATCH/u,
  );
});
