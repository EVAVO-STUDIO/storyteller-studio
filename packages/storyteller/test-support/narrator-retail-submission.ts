import {
  approveAudiobookRetailSubmissionReview,
  createAudiobookRetailSubmissionReviewSession,
  recordAudiobookRetailSubmissionReview,
  type AudiobookRetailSubmissionReviewCoverage,
  type AudiobookRetailSubmissionReviewScores,
  type AudiobookRetailSubmissionReviewSession,
  type AudiobookRetailSubmissionReviewSources,
} from "../src/audiobook-retail-submission-review.js";
import {
  createAdmittedNarratorRetailSubmissionDecision,
  createAdmittedNarratorRetailSubmissionReviewApproval,
  recordAdmittedNarratorRetailSubmissionReceipt,
  startAdmittedNarratorRetailSubmissionAttempt,
  type AdmittedNarratorRetailSubmissionAttempt,
  type AdmittedNarratorRetailSubmissionDecision,
  type AdmittedNarratorRetailSubmissionReviewApproval,
} from "../src/narrator-retail-submission.js";
import {
  createTestAdmittedNarratorRetailDeliveryFixture,
  type TestAdmittedNarratorRetailDeliveryFixture,
} from "./narrator-retail-release.js";

export interface TestAdmittedNarratorRetailSubmissionReviewFixture {
  delivery: TestAdmittedNarratorRetailDeliveryFixture;
  sources: AudiobookRetailSubmissionReviewSources;
  session: AudiobookRetailSubmissionReviewSession;
  approval: AdmittedNarratorRetailSubmissionReviewApproval;
}

export interface TestAdmittedNarratorRetailSubmissionDecisionFixture {
  reviewFixture: TestAdmittedNarratorRetailSubmissionReviewFixture;
  decision: AdmittedNarratorRetailSubmissionDecision;
}

export interface TestAdmittedNarratorRetailSubmissionAttemptFixture {
  decisionFixture: TestAdmittedNarratorRetailSubmissionDecisionFixture;
  started: AdmittedNarratorRetailSubmissionAttempt;
  submitted: AdmittedNarratorRetailSubmissionAttempt;
}

const reviewScores: AudiobookRetailSubmissionReviewScores = Object.freeze({
  remoteFileCompleteness: 5,
  fileNamingAndOrder: 5,
  openingAndClosingAccuracy: 5,
  narrativeCoverage: 5,
  remoteProcessingIntegrity: 5,
  playbackIntegrity: 5,
  retailSampleIntegrity: 5,
  submissionReadiness: 5,
});

function reviewCoverage(fileCount: number): AudiobookRetailSubmissionReviewCoverage {
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

export async function createTestAdmittedNarratorRetailSubmissionReviewFixture(
  input: Readonly<{
    mode?: "zero-shot" | "adapted";
    projectId?: string;
    bookId?: string;
  }> = {},
): Promise<TestAdmittedNarratorRetailSubmissionReviewFixture> {
  const delivery = await createTestAdmittedNarratorRetailDeliveryFixture(input);
  const packageApproval = delivery.transferred.release.packageApproval;
  const admittedPlan = packageApproval.sample.tracks.admittedPlan;
  const sources: AudiobookRetailSubmissionReviewSources = {
    deliveryAttempt: delivery.transferred.attempt,
    releaseDecision: delivery.transferred.release.decision,
    packageReview: packageApproval.reviewSession,
    inspection: packageApproval.inspection,
    packageManifest: packageApproval.manifest,
    policy: admittedPlan.policy,
    rights: packageApproval.sample.approvedSampleArtifact.rights,
    distributorAccount: delivery.transferred.release.distributorAccount,
  };
  let session = createAudiobookRetailSubmissionReviewSession({
    id: `admitted_retail_submission_review_${delivery.transferred.bookId}`,
    sources,
    createdAt: new Date("2026-08-10T12:03:00.000Z"),
  });
  session = recordAudiobookRetailSubmissionReview(session, {
    id: `admitted_retail_submission_editorial_${delivery.transferred.bookId}`,
    role: "editorial",
    reviewerId: "admitted-retail-submission-editor",
    coverage: reviewCoverage(session.mediaFileCount),
    playbackContexts: [
      "consumer-headphones",
      "speakers",
      "remote-draft-player",
    ],
    decision: "approve",
    scores: reviewScores,
    decidedAt: new Date("2026-08-10T12:04:00.000Z"),
  });
  session = recordAudiobookRetailSubmissionReview(session, {
    id: `admitted_retail_submission_engineering_${delivery.transferred.bookId}`,
    role: "engineering",
    reviewerId: "admitted-retail-submission-engineer",
    coverage: reviewCoverage(session.mediaFileCount),
    playbackContexts: ["studio-headphones", "remote-draft-player"],
    decision: "approve",
    scores: reviewScores,
    decidedAt: new Date("2026-08-10T12:05:00.000Z"),
  });
  session = approveAudiobookRetailSubmissionReview(session, {
    sources,
    finalConfirmationId:
      `admitted_retail_submission_review_confirmation_${delivery.transferred.bookId}`,
    approvedByActorId: "admitted-retail-submission-review-approver",
    humanConfirmation: true,
    approvedAt: new Date("2026-08-10T12:06:00.000Z"),
  });
  const approval = createAdmittedNarratorRetailSubmissionReviewApproval({
    delivery: delivery.transferred,
    session,
  });
  return Object.freeze({ delivery, sources, session, approval });
}

export async function createTestAdmittedNarratorRetailSubmissionDecisionFixture(
  input: Readonly<{
    mode?: "zero-shot" | "adapted";
    projectId?: string;
    bookId?: string;
  }> = {},
): Promise<TestAdmittedNarratorRetailSubmissionDecisionFixture> {
  const reviewFixture =
    await createTestAdmittedNarratorRetailSubmissionReviewFixture(input);
  const decision = createAdmittedNarratorRetailSubmissionDecision({
    review: reviewFixture.approval,
    finalConfirmationId:
      `admitted_retail_submission_decision_confirmation_${reviewFixture.approval.bookId}`,
    decidedByActorId: "admitted-retail-submission-authority",
    humanConfirmation: true,
    validUntil: "2026-08-10T13:00:00.000Z",
    decidedAt: new Date("2026-08-10T12:07:00.000Z"),
  });
  return Object.freeze({ reviewFixture, decision });
}

export async function createTestAdmittedNarratorRetailSubmissionAttemptFixture(
  input: Readonly<{
    mode?: "zero-shot" | "adapted";
    projectId?: string;
    bookId?: string;
  }> = {},
): Promise<TestAdmittedNarratorRetailSubmissionAttemptFixture> {
  const decisionFixture =
    await createTestAdmittedNarratorRetailSubmissionDecisionFixture(input);
  const started = startAdmittedNarratorRetailSubmissionAttempt({
    decision: decisionFixture.decision,
    operatorId: "admitted-retail-submission-operator",
    humanOperationConfirmed: true,
    startedAt: new Date("2026-08-10T12:08:00.000Z"),
  });
  const submitted = recordAdmittedNarratorRetailSubmissionReceipt(started, {
    submissionReceiptHash: "d".repeat(64),
    retailerSubmissionReferenceHash: "e".repeat(64),
    completedByActorId: "admitted-retail-submission-operator",
    humanConfirmation: true,
    completedAt: new Date("2026-08-10T12:09:00.000Z"),
  });
  return Object.freeze({ decisionFixture, started, submitted });
}
