import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  recordAudiobookRetailDeliveryTransfer,
  startAudiobookRetailDeliveryAttempt,
} from "./audiobook-retail-delivery-attempt.js";
import { createAudiobookRetailReleaseDecision } from "./audiobook-retail-release-decision.js";
import {
  FileAudiobookRetailSubmissionReviewStore,
  approveAudiobookRetailSubmissionReview,
  assertAudiobookRetailSubmissionReviewMatchesSources,
  assertAudiobookRetailSubmissionReviewSession,
  audiobookRetailSubmissionReviewPublicView,
  createAudiobookRetailSubmissionReviewSession,
  recordAudiobookRetailSubmissionReview,
  type AudiobookRetailSubmissionReviewCoverage,
  type AudiobookRetailSubmissionReviewScores,
  type AudiobookRetailSubmissionReviewSession,
  type AudiobookRetailSubmissionReviewSources,
} from "./audiobook-retail-submission-review.js";
import { stableHash } from "./index.js";
import { FileProjectStore } from "./project-store.js";
import { retailReleaseAt } from "./test-support/retail-release-policy-fixture.js";
import { retailReleaseFixture } from "./test-support/retail-release-review-fixture.js";

function coverage(fileCount = 4): AudiobookRetailSubmissionReviewCoverage {
  return Object.freeze({
    remoteDraftOpened: true,
    remoteDraftReferenceMatched: true,
    completeFileListConfirmed: true,
    fileCountReviewed: fileCount,
    openingCreditPlayed: true,
    firstNarrativePlayed: true,
    midpointNarrativePlayed: true,
    finalNarrativePlayed: true,
    closingCreditPlayed: true,
    retailSamplePlayed: true,
    allRemoteProcessingComplete: true,
    noRemoteValidationErrors: true,
    submissionNotInitiated: true,
  });
}

function scores(value = 5): AudiobookRetailSubmissionReviewScores {
  return Object.freeze({
    remoteFileCompleteness: value,
    fileNamingAndOrder: value,
    openingAndClosingAccuracy: value,
    narrativeCoverage: value,
    remoteProcessingIntegrity: value,
    playbackIntegrity: value,
    retailSampleIntegrity: value,
    submissionReadiness: value,
  });
}

function fixture(): Readonly<{
  sources: AudiobookRetailSubmissionReviewSources;
  initial: AudiobookRetailSubmissionReviewSession;
}> {
  const release = retailReleaseFixture();
  const decision = createAudiobookRetailReleaseDecision(release.input);
  const started = startAudiobookRetailDeliveryAttempt({
    releaseDecision: decision,
    packageReview: release.packageReview,
    inspection: release.inspection,
    packageManifest: release.manifest,
    distributorAccount: release.account,
    operatorId: "manual_delivery_operator_001",
    humanOperationConfirmed: true,
    startedAt: retailReleaseAt(11),
  });
  const deliveryAttempt = recordAudiobookRetailDeliveryTransfer(started, {
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
  const sources: AudiobookRetailSubmissionReviewSources = {
    deliveryAttempt,
    releaseDecision: decision,
    packageReview: release.packageReview,
    inspection: release.inspection,
    packageManifest: release.manifest,
    policy: release.policy,
    rights: release.rights,
    distributorAccount: release.account,
  };
  return Object.freeze({
    sources,
    initial: createAudiobookRetailSubmissionReviewSession({
      id: "retail_submission_review_001",
      sources,
      createdAt: retailReleaseAt(13),
    }),
  });
}

function editorialReview(
  session: AudiobookRetailSubmissionReviewSession,
  input: Readonly<{
    id?: string;
    reviewerId?: string;
    decision?: "approve" | "changes-requested";
    score?: number;
    findingCodes?: readonly string[];
    notes?: string;
    at?: Date;
  }> = {},
): AudiobookRetailSubmissionReviewSession {
  return recordAudiobookRetailSubmissionReview(session, {
    id: input.id ?? "submission_editorial_review_001",
    role: "editorial",
    reviewerId: input.reviewerId ?? "submission_editor_001",
    coverage: coverage(),
    playbackContexts: [
      "consumer-headphones",
      "speakers",
      "remote-draft-player",
    ],
    decision: input.decision ?? "approve",
    scores: scores(input.score ?? 5),
    ...(input.findingCodes ? { findingCodes: input.findingCodes } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    decidedAt: input.at ?? retailReleaseAt(14),
  });
}

function engineeringReview(
  session: AudiobookRetailSubmissionReviewSession,
  input: Readonly<{
    reviewerId?: string;
    at?: Date;
  }> = {},
): AudiobookRetailSubmissionReviewSession {
  return recordAudiobookRetailSubmissionReview(session, {
    id: "submission_engineering_review_001",
    role: "engineering",
    reviewerId: input.reviewerId ?? "submission_engineer_001",
    coverage: coverage(),
    playbackContexts: ["studio-headphones", "remote-draft-player"],
    decision: "approve",
    scores: scores(),
    decidedAt: input.at ?? retailReleaseAt(15),
  });
}

function recomputeSession(
  partial: Omit<AudiobookRetailSubmissionReviewSession, "fingerprint">,
): AudiobookRetailSubmissionReviewSession {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

test("two remote-draft reviewers and a third approver create submission-decision eligibility", async () => {
  const value = fixture();
  const editorial = editorialReview(value.initial);
  const engineering = engineeringReview(editorial);
  assert.equal(engineering.status, "ready-for-approval");
  const approved = approveAudiobookRetailSubmissionReview(engineering, {
    sources: value.sources,
    finalConfirmationId: "submission_review_confirmation_001",
    approvedByActorId: "submission_review_manager_001",
    humanConfirmation: true,
    approvedAt: retailReleaseAt(16),
  });
  assert.equal(approved.status, "approved-for-submission-decision");
  assert.equal(approved.approval?.submissionDecisionEligible, true);
  assert.equal(
    approved.approval?.remoteDraftReferenceHash,
    value.sources.deliveryAttempt.receipt!.remoteDraftReferenceHash,
  );
  assert.doesNotThrow(() => assertAudiobookRetailSubmissionReviewSession(approved));
  assert.doesNotThrow(() =>
    assertAudiobookRetailSubmissionReviewMatchesSources(approved, value.sources)
  );

  const root = await mkdtemp(join(tmpdir(), "storyteller-submission-review-"));
  try {
    const store = new FileAudiobookRetailSubmissionReviewStore(
      new FileProjectStore(root),
    );
    const first = await store.create(
      value.initial,
      "submission_review_store_actor_001",
    );
    const repeated = await store.create(
      value.initial,
      "submission_review_store_actor_001",
    );
    assert.equal(first.envelopeHash, repeated.envelopeHash);
    await store.save(editorial, {
      expectedRevision: 1,
      actorId: "submission_editor_001",
      action: "audiobook_retail_submission_review.editorial_recorded",
    });
    await store.save(engineering, {
      expectedRevision: 2,
      actorId: "submission_engineer_001",
      action: "audiobook_retail_submission_review.engineering_recorded",
    });
    await store.save(approved, {
      expectedRevision: 3,
      actorId: "submission_review_manager_001",
      action: "audiobook_retail_submission_review.approved",
    });
    assert.equal(
      (await store.require(approved.id)).payload.fingerprint,
      approved.fingerprint,
    );

    const view = audiobookRetailSubmissionReviewPublicView(approved);
    const serialised = JSON.stringify(view);
    const audit = await readFile(join(root, "audit", "2026-07-29.jsonl"), "utf8");
    const auditMetadata = JSON.stringify(
      audit.trim().split(/\r?\n/u).filter(Boolean).map((line) =>
        (JSON.parse(line) as { metadata: unknown }).metadata
      ),
    );
    assert.equal(view.submissionDecisionEligible, true);
    assert.deepEqual(view.playbackContexts, [
      "consumer-headphones",
      "remote-draft-player",
      "speakers",
      "studio-headphones",
    ]);
    for (const forbidden of [
      approved.projectId,
      approved.packageId,
      approved.deliveryAttempt.id,
      approved.deliveryAttempt.fingerprint,
      approved.deliveryAttempt.remoteDraftReferenceHash,
      approved.releaseDecision.id,
      approved.packageReview.id,
      approved.inspection.id,
      approved.sourceManifest.id,
      approved.rightsFingerprint,
      approved.distributorAccount.evidenceId,
      approved.fileSetFingerprint,
      "submission_editor_001",
      "submission_engineer_001",
      "submission_review_manager_001",
      "reviewerSetFingerprint",
      "remoteDraftReferenceHash",
      "fileSetFingerprint",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
      assert.equal(auditMetadata.includes(forbidden), false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("changes-requested findings require a clean editorial re-review", () => {
  const value = fixture();
  const changes = editorialReview(value.initial, {
    decision: "changes-requested",
    score: 3,
    findingCodes: ["REMOTE_CHAPTER_NAME_MISMATCH"],
    notes: "The remote chapter label does not match the approved file name.",
  });
  const engineering = engineeringReview(changes);
  assert.equal(engineering.status, "changes-requested");
  const corrected = editorialReview(engineering, {
    id: "submission_editorial_review_002",
    at: retailReleaseAt(16),
  });
  assert.equal(corrected.status, "ready-for-approval");
  const approved = approveAudiobookRetailSubmissionReview(corrected, {
    sources: value.sources,
    finalConfirmationId: "submission_review_confirmation_002",
    approvedByActorId: "submission_review_manager_001",
    humanConfirmation: true,
    approvedAt: retailReleaseAt(17),
  });
  assert.equal(approved.status, "approved-for-submission-decision");
  assert.equal(
    audiobookRetailSubmissionReviewPublicView(approved).findingCodes.length,
    0,
  );
});

test("reviewers and final approver remain independent human roles", () => {
  const value = fixture();
  const editorial = editorialReview(value.initial);
  assert.throws(
    () => engineeringReview(editorial, { reviewerId: "submission_editor_001" }),
    /AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_INDEPENDENT_REVIEWERS_REQUIRED/u,
  );
  const engineering = engineeringReview(editorial);
  for (const actorId of [
    "submission_editor_001",
    "submission_engineer_001",
    "manual_delivery_operator_001",
    "publisher_release_authority_001",
    "distribution_access_verifier_001",
  ]) {
    assert.throws(
      () => approveAudiobookRetailSubmissionReview(engineering, {
        sources: value.sources,
        finalConfirmationId: "submission_review_confirmation_independence_001",
        approvedByActorId: actorId,
        humanConfirmation: true,
        approvedAt: retailReleaseAt(16),
      }),
      /AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_INDEPENDENT_APPROVER_REQUIRED/u,
    );
  }
  assert.throws(
    () => recordAudiobookRetailSubmissionReview(value.initial, {
      id: "submission_bot_review_001",
      role: "editorial",
      reviewerId: "bot_submission_reviewer",
      coverage: coverage(),
      playbackContexts: ["consumer-headphones", "remote-draft-player"],
      decision: "approve",
      scores: scores(),
      decidedAt: retailReleaseAt(14),
    }),
    /AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_REVIEWER_INVALID/u,
  );
});

test("incomplete remote coverage, processing errors and expired windows fail closed", () => {
  const value = fixture();
  assert.throws(
    () => recordAudiobookRetailSubmissionReview(value.initial, {
      id: "submission_incomplete_review_001",
      role: "editorial",
      reviewerId: "submission_editor_001",
      coverage: {
        ...coverage(),
        noRemoteValidationErrors: false as never,
      },
      playbackContexts: ["consumer-headphones", "remote-draft-player"],
      decision: "approve",
      scores: scores(),
      decidedAt: retailReleaseAt(14),
    }),
    /AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_COVERAGE_INCOMPLETE/u,
  );
  assert.throws(
    () => createAudiobookRetailSubmissionReviewSession({
      id: "retail_submission_review_expired_001",
      sources: value.sources,
      createdAt: new Date(Date.parse(value.sources.deliveryAttempt.updatedAt)
        + 7 * 24 * 60 * 60 * 1_000),
    }),
    /AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_WINDOW_EXPIRED|AUDIOBOOK_RETAIL_ACCOUNT_NOT_CURRENT/u,
  );
});

test("source substitution and recomputed session state remain blocked", () => {
  const value = fixture();
  const wrongManifestBase = {
    ...value.sources.packageManifest,
    id: "retail_package_manifest_submission_other_001",
  };
  const { fingerprint: _manifestFingerprint, ...manifestPartial } =
    wrongManifestBase;
  const wrongManifest = Object.freeze({
    ...manifestPartial,
    fingerprint: stableHash(manifestPartial),
  });
  assert.throws(
    () => createAudiobookRetailSubmissionReviewSession({
      id: "retail_submission_review_wrong_source_001",
      sources: {
        ...value.sources,
        packageManifest: wrongManifest,
      },
      createdAt: retailReleaseAt(13),
    }),
    /AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_SOURCE_MISMATCH/u,
  );

  const { fingerprint: _fingerprint, ...base } = value.initial;
  const changed = recomputeSession({
    ...base,
    deliveryAttempt: Object.freeze({
      ...value.initial.deliveryAttempt,
      id: "retail_delivery_attempt_structurally_wrong_001",
    }),
  });
  assert.doesNotThrow(() => assertAudiobookRetailSubmissionReviewSession(changed));
  assert.throws(
    () => assertAudiobookRetailSubmissionReviewMatchesSources(
      changed,
      value.sources,
    ),
    /AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_SOURCE_MISMATCH/u,
  );
});
