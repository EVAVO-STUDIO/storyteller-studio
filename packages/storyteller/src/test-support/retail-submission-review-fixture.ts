import {
  recordAudiobookRetailDeliveryTransfer,
  startAudiobookRetailDeliveryAttempt,
  type AudiobookRetailDeliveryAttempt,
} from "../audiobook-retail-delivery-attempt.js";
import type { AudiobookRetailNarrationSourceKind } from "../audiobook-retail-policy.js";
import {
  createAudiobookRetailReleaseDecision,
  type AudiobookRetailReleaseDecision,
} from "../audiobook-retail-release-decision.js";
import {
  approveAudiobookRetailSubmissionReview,
  createAudiobookRetailSubmissionReviewSession,
  recordAudiobookRetailSubmissionReview,
  type AudiobookRetailSubmissionReviewCoverage,
  type AudiobookRetailSubmissionReviewScores,
  type AudiobookRetailSubmissionReviewSession,
  type AudiobookRetailSubmissionReviewSources,
} from "../audiobook-retail-submission-review.js";
import { retailReleaseAt } from "./retail-release-policy-fixture.js";
import {
  retailReleaseFixture,
  type RetailReleaseFixture,
} from "./retail-release-review-fixture.js";

function coverage(): AudiobookRetailSubmissionReviewCoverage {
  return Object.freeze({
    remoteDraftOpened: true,
    remoteDraftReferenceMatched: true,
    completeFileListConfirmed: true,
    fileCountReviewed: 4,
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

function scores(): AudiobookRetailSubmissionReviewScores {
  return Object.freeze({
    remoteFileCompleteness: 5,
    fileNamingAndOrder: 5,
    openingAndClosingAccuracy: 5,
    narrativeCoverage: 5,
    remoteProcessingIntegrity: 5,
    playbackIntegrity: 5,
    retailSampleIntegrity: 5,
    submissionReadiness: 5,
  });
}

export interface RetailSubmissionReviewFixture {
  release: RetailReleaseFixture;
  releaseDecision: AudiobookRetailReleaseDecision;
  deliveryAttempt: AudiobookRetailDeliveryAttempt;
  sources: AudiobookRetailSubmissionReviewSources;
  submissionReview: AudiobookRetailSubmissionReviewSession;
}

export function retailSubmissionReviewFixture(
  sourceKind: AudiobookRetailNarrationSourceKind = "human-performance",
): RetailSubmissionReviewFixture {
  const release = retailReleaseFixture(sourceKind);
  const releaseDecision = createAudiobookRetailReleaseDecision(release.input);
  const started = startAudiobookRetailDeliveryAttempt({
    releaseDecision,
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
    releaseDecision,
    packageReview: release.packageReview,
    inspection: release.inspection,
    packageManifest: release.manifest,
    policy: release.policy,
    rights: release.rights,
    distributorAccount: release.account,
  };
  const initial = createAudiobookRetailSubmissionReviewSession({
    id: "retail_submission_review_decision_fixture_001",
    sources,
    createdAt: retailReleaseAt(13),
  });
  const editorial = recordAudiobookRetailSubmissionReview(initial, {
    id: "submission_decision_editorial_review_001",
    role: "editorial",
    reviewerId: "submission_decision_editor_001",
    coverage: coverage(),
    playbackContexts: [
      "consumer-headphones",
      "speakers",
      "remote-draft-player",
    ],
    decision: "approve",
    scores: scores(),
    decidedAt: retailReleaseAt(14),
  });
  const engineering = recordAudiobookRetailSubmissionReview(editorial, {
    id: "submission_decision_engineering_review_001",
    role: "engineering",
    reviewerId: "submission_decision_engineer_001",
    coverage: coverage(),
    playbackContexts: ["studio-headphones", "remote-draft-player"],
    decision: "approve",
    scores: scores(),
    decidedAt: retailReleaseAt(15),
  });
  const submissionReview = approveAudiobookRetailSubmissionReview(engineering, {
    sources,
    finalConfirmationId: "submission_review_decision_confirmation_001",
    approvedByActorId: "submission_review_decision_manager_001",
    humanConfirmation: true,
    approvedAt: retailReleaseAt(16),
  });
  return Object.freeze({
    release,
    releaseDecision,
    deliveryAttempt,
    sources,
    submissionReview,
  });
}
