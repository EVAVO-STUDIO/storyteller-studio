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
  recordAudiobookRetailSubmissionReceipt,
  startAudiobookRetailSubmissionAttempt,
} from "./audiobook-retail-submission-attempt.js";
import {
  FileAudiobookRetailerStatusEvidenceStore,
  assertAudiobookRetailerStatusEvidence,
  assertAudiobookRetailerStatusEvidenceMatchesSources,
  audiobookRetailerStatusEvidencePublicView,
  createAudiobookRetailerStatusEvidence,
  type AudiobookRetailerStatusEvidence,
  type CreateAudiobookRetailerStatusEvidenceInput,
} from "./audiobook-retailer-status-evidence.js";
import { stableHash } from "./index.js";
import { FileProjectStore } from "./project-store.js";
import { retailReleaseAt } from "./test-support/retail-release-policy-fixture.js";
import { retailSubmissionReviewFixture } from "./test-support/retail-submission-review-fixture.js";

function fixture(): Omit<CreateAudiobookRetailerStatusEvidenceInput,
  | "normalisedStatus"
  | "externalStatusReferenceHash"
  | "externalStatusTextHash"
  | "issueCodes"
  | "retailerAcceptanceConfirmed"
  | "publicationConfirmed"
  | "liveConfirmed"
  | "observedByActorId"
  | "humanObservationConfirmed"
  | "observedAt"
> {
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
    finalConfirmationId: "retailer_status_submission_confirmation_001",
    decidedByActorId: "publisher_submission_authority_001",
    humanConfirmation: true,
    submissionMethod: "manual-acx-submit",
    decidedAt: retailReleaseAt(17),
    validUntil: retailReleaseAt(30).toISOString(),
  });
  const started = startAudiobookRetailSubmissionAttempt({
    submissionDecision,
    submissionReview: reviewFixture.submissionReview,
    deliveryAttempt: reviewFixture.deliveryAttempt,
    distributorAccount: reviewFixture.release.account,
    operatorId: "manual_submission_operator_001",
    humanOperationConfirmed: true,
    startedAt: retailReleaseAt(18),
  });
  const submissionAttempt = recordAudiobookRetailSubmissionReceipt(started, {
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
  return {
    submissionAttempt,
    submissionDecision,
    submissionReview: reviewFixture.submissionReview,
    distributorAccount: reviewFixture.release.account,
  };
}

function input(
  normalisedStatus: CreateAudiobookRetailerStatusEvidenceInput["normalisedStatus"],
  issueCodes?: readonly string[],
): CreateAudiobookRetailerStatusEvidenceInput {
  return {
    ...fixture(),
    normalisedStatus,
    externalStatusReferenceHash: "c".repeat(64),
    externalStatusTextHash: "d".repeat(64),
    ...(issueCodes ? { issueCodes } : {}),
    retailerAcceptanceConfirmed:
      normalisedStatus === "accepted-awaiting-publication",
    publicationConfirmed: false,
    liveConfirmed: false,
    observedByActorId: "retailer_status_observer_001",
    humanObservationConfirmed: true,
    observedAt: retailReleaseAt(20),
  };
}

function recomputeEvidence(
  partial: Omit<AudiobookRetailerStatusEvidence, "fingerprint">,
): AudiobookRetailerStatusEvidence {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function recomputeAccount(
  partial: Omit<AudiobookRetailDistributorAccountEvidence, "fingerprint">,
): AudiobookRetailDistributorAccountEvidence {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

test("processing evidence is persisted without acceptance, publication or live claims", async () => {
  const value = input("processing");
  const evidence = createAudiobookRetailerStatusEvidence(value);
  assert.equal(evidence.normalisedStatus, "processing");
  assert.equal(evidence.retailerAcceptanceConfirmed, false);
  assert.equal(evidence.publicationConfirmed, false);
  assert.equal(evidence.liveConfirmed, false);
  assert.equal(evidence.resubmissionRequired, false);
  assert.doesNotThrow(() => assertAudiobookRetailerStatusEvidence(evidence));
  assert.doesNotThrow(() =>
    assertAudiobookRetailerStatusEvidenceMatchesSources(evidence, value)
  );

  const root = await mkdtemp(join(tmpdir(), "storyteller-retailer-status-"));
  try {
    const store = new FileAudiobookRetailerStatusEvidenceStore(
      new FileProjectStore(root),
    );
    const first = await store.create(evidence, "retailer_status_store_actor_001");
    const repeated = await store.create(evidence, "retailer_status_store_actor_001");
    assert.equal(first.envelopeHash, repeated.envelopeHash);
    const view = audiobookRetailerStatusEvidencePublicView(evidence);
    const serialised = JSON.stringify(view);
    const audit = await readFile(join(root, "audit", "2026-07-29.jsonl"), "utf8");
    const auditMetadata = JSON.stringify(
      audit.trim().split(/\r?\n/u).filter(Boolean).map((line) =>
        (JSON.parse(line) as { metadata: unknown }).metadata
      ),
    );
    for (const forbidden of [
      evidence.projectId,
      evidence.packageId,
      evidence.submissionAttempt.id,
      evidence.submissionAttempt.fingerprint,
      evidence.submissionAttempt.receiptFingerprint,
      evidence.submissionAttempt.retailerSubmissionReferenceHash,
      evidence.submissionDecision.id,
      evidence.submissionReview.id,
      evidence.distributorAccount.evidenceId,
      evidence.distributorAccount.evidenceFingerprint,
      evidence.package.fileSetFingerprint,
      evidence.externalStatusReferenceHash,
      evidence.externalStatusTextHash,
      evidence.observedByActorId,
      "externalStatusReferenceHash",
      "externalStatusTextHash",
      "fileSetFingerprint",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
      assert.equal(auditMetadata.includes(forbidden), false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("changes-requested and rejected statuses require bounded issue codes", () => {
  const changes = createAudiobookRetailerStatusEvidence(input(
    "changes-requested",
    ["RETAILER_AUDIO_REVISION_REQUIRED"],
  ));
  assert.equal(changes.resubmissionRequired, true);
  assert.deepEqual(changes.issueCodes, ["RETAILER_AUDIO_REVISION_REQUIRED"]);

  const rejected = createAudiobookRetailerStatusEvidence(input(
    "rejected",
    ["RETAILER_TITLE_RIGHTS_REJECTED"],
  ));
  assert.equal(rejected.resubmissionRequired, false);
  assert.equal(rejected.retailerAcceptanceConfirmed, false);

  assert.throws(
    () => createAudiobookRetailerStatusEvidence(input("changes-requested")),
    /AUDIOBOOK_RETAILER_STATUS_ISSUES_REQUIRED/u,
  );
  assert.throws(
    () => createAudiobookRetailerStatusEvidence(input(
      "processing",
      ["RETAILER_AUDIO_REVISION_REQUIRED"],
    )),
    /AUDIOBOOK_RETAILER_STATUS_ISSUES_FORBIDDEN/u,
  );
});

test("accepted evidence remains explicitly awaiting publication", () => {
  const accepted = createAudiobookRetailerStatusEvidence(
    input("accepted-awaiting-publication"),
  );
  assert.equal(accepted.retailerAcceptanceConfirmed, true);
  assert.equal(accepted.publicationConfirmed, false);
  assert.equal(accepted.liveConfirmed, false);
  assert.equal(
    audiobookRetailerStatusEvidencePublicView(accepted).normalisedStatus,
    "accepted-awaiting-publication",
  );
  assert.throws(
    () => createAudiobookRetailerStatusEvidence({
      ...input("accepted-awaiting-publication"),
      publicationConfirmed: true as never,
    }),
    /AUDIOBOOK_RETAILER_STATUS_PUBLICATION_CLAIM_FORBIDDEN/u,
  );
});

test("retailer status must be observed by an independent current-account human", () => {
  const base = input("processing");
  for (const actorId of [
    "manual_submission_operator_001",
    "publisher_submission_authority_001",
    "distribution_access_verifier_001",
  ]) {
    assert.throws(
      () => createAudiobookRetailerStatusEvidence({
        ...base,
        observedByActorId: actorId,
      }),
      /AUDIOBOOK_RETAILER_STATUS_INDEPENDENT_OBSERVER_REQUIRED/u,
    );
  }
  assert.throws(
    () => createAudiobookRetailerStatusEvidence({
      ...base,
      observedByActorId: "bot_retailer_status_observer",
    }),
    /AUDIOBOOK_RETAILER_STATUS_OBSERVER_INVALID/u,
  );

  const { fingerprint: _fingerprint, ...accountBase } = base.distributorAccount;
  const wrongAccount = recomputeAccount({
    ...accountBase,
    projectId: "project_retailer_status_other_001",
  });
  assert.throws(
    () => createAudiobookRetailerStatusEvidence({
      ...base,
      distributorAccount: wrongAccount,
    }),
    /AUDIOBOOK_RETAILER_STATUS_SOURCE_MISMATCH/u,
  );
});

test("recomputed status evidence cannot replace the submitted attempt", () => {
  const value = input("processing");
  const evidence = createAudiobookRetailerStatusEvidence(value);
  const { fingerprint: _fingerprint, ...base } = evidence;
  const changed = recomputeEvidence({
    ...base,
    submissionAttempt: Object.freeze({
      ...evidence.submissionAttempt,
      id: "retail_submission_attempt_structurally_wrong_001",
    }),
  });
  assert.doesNotThrow(() => assertAudiobookRetailerStatusEvidence(changed));
  assert.throws(
    () => assertAudiobookRetailerStatusEvidenceMatchesSources(changed, value),
    /AUDIOBOOK_RETAILER_STATUS_SOURCE_MISMATCH/u,
  );
});
