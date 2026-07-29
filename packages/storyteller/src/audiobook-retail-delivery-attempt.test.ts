import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileAudiobookRetailDeliveryAttemptStore,
  assertAudiobookRetailDeliveryAttempt,
  assertAudiobookRetailDeliveryAttemptMatchesSources,
  audiobookRetailDeliveryAttemptPublicView,
  cancelAudiobookRetailDeliveryAttempt,
  recordAudiobookRetailDeliveryFailure,
  recordAudiobookRetailDeliveryTransfer,
  startAudiobookRetailDeliveryAttempt,
  type AudiobookRetailDeliveryAttempt,
} from "./audiobook-retail-delivery-attempt.js";
import {
  createAudiobookRetailReleaseDecision,
  type AudiobookRetailDistributorAccountEvidence,
} from "./audiobook-retail-release-decision.js";
import { stableHash } from "./index.js";
import { FileProjectStore } from "./project-store.js";
import { retailReleaseAt } from "./test-support/retail-release-policy-fixture.js";
import { retailReleaseFixture } from "./test-support/retail-release-review-fixture.js";

function fixture() {
  const source = retailReleaseFixture();
  const releaseDecision = createAudiobookRetailReleaseDecision(source.input);
  return {
    source,
    releaseDecision,
    startInput: {
      releaseDecision,
      packageReview: source.packageReview,
      inspection: source.inspection,
      packageManifest: source.manifest,
      distributorAccount: source.account,
      operatorId: "manual_delivery_operator_001",
      humanOperationConfirmed: true as const,
      startedAt: retailReleaseAt(11),
    },
  };
}

function recomputeAttempt(
  partial: Omit<AudiobookRetailDeliveryAttempt, "fingerprint">,
): AudiobookRetailDeliveryAttempt {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function recomputeAccount(
  partial: Omit<AudiobookRetailDistributorAccountEvidence, "fingerprint">,
): AudiobookRetailDistributorAccountEvidence {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

test("one authorized decision becomes one persisted transfer receipt without submission claims", async () => {
  const value = fixture();
  const started = startAudiobookRetailDeliveryAttempt(value.startInput);
  assert.equal(started.status, "in-progress");
  assert.equal(started.attemptOrdinal, 1);
  assert.doesNotThrow(() => assertAudiobookRetailDeliveryAttempt(started));
  assert.doesNotThrow(() =>
    assertAudiobookRetailDeliveryAttemptMatchesSources(started, value.startInput)
  );

  const transferred = recordAudiobookRetailDeliveryTransfer(started, {
    receiptReferenceHash: "a".repeat(64),
    remoteDraftReferenceHash: "c".repeat(64),
    fileCountAcknowledged: started.package.mediaFileCount,
    allMediaFilesTransferred: true,
    allFileNamesConfirmed: true,
    internalPackageManifestExcluded: true,
    submissionInitiated: false,
    retailerAcceptanceClaimed: false,
    completedByActorId: "manual_delivery_operator_001",
    humanConfirmation: true,
    completedAt: retailReleaseAt(12),
  });
  assert.equal(
    transferred.status,
    "files-transferred-awaiting-submission-review",
  );
  assert.equal(transferred.receipt?.submissionInitiated, false);
  assert.equal(transferred.receipt?.retailerAcceptanceClaimed, false);
  assert.equal(transferred.revision, 2);
  assert.doesNotThrow(() => assertAudiobookRetailDeliveryAttempt(transferred));

  const root = await mkdtemp(join(tmpdir(), "storyteller-delivery-attempt-"));
  try {
    const store = new FileAudiobookRetailDeliveryAttemptStore(
      new FileProjectStore(root),
    );
    const first = await store.create(started, "delivery_attempt_store_actor_001");
    const repeated = await store.create(started, "delivery_attempt_store_actor_001");
    assert.equal(first.envelopeHash, repeated.envelopeHash);
    await store.save(transferred, {
      expectedRevision: 1,
      actorId: "manual_delivery_operator_001",
      action: "audiobook_retail_delivery_attempt.transferred",
    });
    assert.equal(
      (await store.require(started.id)).payload.fingerprint,
      transferred.fingerprint,
    );

    const view = audiobookRetailDeliveryAttemptPublicView(transferred);
    const serialised = JSON.stringify(view);
    const audit = await readFile(join(root, "audit", "2026-07-29.jsonl"), "utf8");
    const auditMetadata = JSON.stringify(
      audit.trim().split(/\r?\n/u).filter(Boolean).map((line) =>
        (JSON.parse(line) as { metadata: unknown }).metadata
      ),
    );
    for (const forbidden of [
      started.projectId,
      started.packageId,
      started.releaseDecision.id,
      started.releaseDecision.fingerprint,
      started.packageReview.id,
      started.inspection.id,
      started.packageManifest.id,
      started.distributorAccount.evidenceId,
      started.distributorAccount.evidenceFingerprint,
      started.package.fileSetFingerprint,
      started.operatorId,
      transferred.receipt!.receiptReferenceHash,
      transferred.receipt!.remoteDraftReferenceHash,
      transferred.receipt!.completedByActorId,
      "fileSetFingerprint",
      "receiptReferenceHash",
      "remoteDraftReferenceHash",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
      assert.equal(auditMetadata.includes(forbidden), false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("attempt identity is deterministic and terminal outcomes cannot be replaced or retried", async () => {
  const value = fixture();
  const first = startAudiobookRetailDeliveryAttempt(value.startInput);
  const repeated = startAudiobookRetailDeliveryAttempt(value.startInput);
  assert.equal(first.id, repeated.id);
  assert.equal(first.fingerprint, repeated.fingerprint);

  const transferred = recordAudiobookRetailDeliveryTransfer(first, {
    receiptReferenceHash: "a".repeat(64),
    remoteDraftReferenceHash: "c".repeat(64),
    fileCountAcknowledged: first.package.mediaFileCount,
    allMediaFilesTransferred: true,
    allFileNamesConfirmed: true,
    internalPackageManifestExcluded: true,
    submissionInitiated: false,
    retailerAcceptanceClaimed: false,
    completedByActorId: "manual_delivery_operator_001",
    humanConfirmation: true,
    completedAt: retailReleaseAt(12),
  });
  assert.throws(
    () => recordAudiobookRetailDeliveryFailure(transferred, {
      failureCode: "DELIVERY_REMOTE_SAVE_FAILED",
      failedByActorId: "manual_delivery_operator_001",
      humanConfirmation: true,
      failedAt: retailReleaseAt(13),
    }),
    /AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_TERMINAL_IMMUTABLE/u,
  );
  assert.throws(
    () => recordAudiobookRetailDeliveryTransfer(first, {
      receiptReferenceHash: "a".repeat(64),
      remoteDraftReferenceHash: "c".repeat(64),
      fileCountAcknowledged: first.package.mediaFileCount,
      allMediaFilesTransferred: true,
      allFileNamesConfirmed: true,
      internalPackageManifestExcluded: true,
      submissionInitiated: true as never,
      retailerAcceptanceClaimed: false,
      completedByActorId: "manual_delivery_operator_001",
      humanConfirmation: true,
      completedAt: retailReleaseAt(12),
    }),
    /AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_TRANSFER_ATTESTATION_INVALID/u,
  );

  const root = await mkdtemp(join(tmpdir(), "storyteller-delivery-idempotency-"));
  try {
    const store = new FileAudiobookRetailDeliveryAttemptStore(
      new FileProjectStore(root),
    );
    await store.create(first, "delivery_attempt_store_actor_001");
    const changedOperator = startAudiobookRetailDeliveryAttempt({
      ...value.startInput,
      operatorId: "manual_delivery_operator_other_001",
    });
    assert.equal(changedOperator.id, first.id);
    await assert.rejects(
      store.create(changedOperator, "delivery_attempt_store_actor_001"),
      /AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_STORE_IDEMPOTENCY_CONFLICT/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failed and cancelled attempts retain safe terminal evidence and forbid retries", () => {
  const value = fixture();
  const started = startAudiobookRetailDeliveryAttempt(value.startInput);
  const failed = recordAudiobookRetailDeliveryFailure(started, {
    failureCode: "DELIVERY_REMOTE_DRAFT_UNAVAILABLE",
    failedByActorId: "manual_delivery_operator_001",
    humanConfirmation: true,
    failedAt: retailReleaseAt(12),
  });
  assert.equal(failed.status, "transfer-failed");
  assert.equal(failed.failure?.retryPermittedUnderDecision, false);
  assert.equal(
    audiobookRetailDeliveryAttemptPublicView(failed).failureCode,
    "DELIVERY_REMOTE_DRAFT_UNAVAILABLE",
  );

  const cancelled = cancelAudiobookRetailDeliveryAttempt(started, {
    reasonCode: "DELIVERY_OPERATOR_CANCELLED",
    cancelledByActorId: "manual_delivery_operator_001",
    humanConfirmation: true,
    cancelledAt: retailReleaseAt(12),
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancellation?.retryPermittedUnderDecision, false);
  assert.equal(
    audiobookRetailDeliveryAttemptPublicView(cancelled).cancellationReasonCode,
    "DELIVERY_OPERATOR_CANCELLED",
  );
});

test("expired decisions, bot operators, wrong accounts and incomplete file receipts fail closed", () => {
  const value = fixture();
  assert.throws(
    () => startAudiobookRetailDeliveryAttempt({
      ...value.startInput,
      startedAt: new Date(value.releaseDecision.validUntil),
    }),
    /AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_DECISION_NOT_CURRENT/u,
  );
  assert.throws(
    () => startAudiobookRetailDeliveryAttempt({
      ...value.startInput,
      operatorId: "bot_delivery_operator",
    }),
    /AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_OPERATOR_INVALID/u,
  );

  const { fingerprint: _fingerprint, ...accountBase } = value.source.account;
  const wrongAccount = recomputeAccount({
    ...accountBase,
    projectId: "project_delivery_attempt_other_001",
  });
  assert.throws(
    () => startAudiobookRetailDeliveryAttempt({
      ...value.startInput,
      distributorAccount: wrongAccount,
    }),
    /AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_SOURCE_MISMATCH/u,
  );

  const started = startAudiobookRetailDeliveryAttempt(value.startInput);
  assert.throws(
    () => recordAudiobookRetailDeliveryTransfer(started, {
      receiptReferenceHash: "a".repeat(64),
      remoteDraftReferenceHash: "c".repeat(64),
      fileCountAcknowledged: started.package.mediaFileCount - 1,
      allMediaFilesTransferred: true,
      allFileNamesConfirmed: true,
      internalPackageManifestExcluded: true,
      submissionInitiated: false,
      retailerAcceptanceClaimed: false,
      completedByActorId: "manual_delivery_operator_001",
      humanConfirmation: true,
      completedAt: retailReleaseAt(12),
    }),
    /AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_FILE_COUNT_MISMATCH/u,
  );
});

test("recomputed attempt state cannot replace the approved release decision", () => {
  const value = fixture();
  const attempt = startAudiobookRetailDeliveryAttempt(value.startInput);
  const { fingerprint: _fingerprint, ...base } = attempt;
  const changed = recomputeAttempt({
    ...base,
    releaseDecision: Object.freeze({
      ...attempt.releaseDecision,
      id: "retail_release_decision_structurally_wrong_001",
    }),
  });
  assert.doesNotThrow(() => assertAudiobookRetailDeliveryAttempt(changed));
  assert.throws(
    () => assertAudiobookRetailDeliveryAttemptMatchesSources(
      changed,
      value.startInput,
    ),
    /AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_SOURCE_MISMATCH/u,
  );
});
