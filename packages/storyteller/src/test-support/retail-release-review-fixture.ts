import type { ArtifactRightsSnapshot } from "../artifact-registry.js";
import type { AudiobookRetailPackageInspectionEvidence } from "../audiobook-retail-package-inspection.js";
import type { AudiobookRetailPackageManifest } from "../audiobook-retail-package-manifest.js";
import {
  approveAudiobookRetailPackageReview,
  createAudiobookRetailPackageReviewSession,
  recordAudiobookRetailPackageReview,
  type AudiobookRetailPackageReviewCoverage,
  type AudiobookRetailPackageReviewScores,
  type AudiobookRetailPackageReviewSession,
} from "../audiobook-retail-package-review.js";
import type {
  AudiobookRetailEncodingPolicy,
  AudiobookRetailNarrationEligibilityEvidence,
  AudiobookRetailNarrationSourceKind,
} from "../audiobook-retail-policy.js";
import {
  createAudiobookRetailDistributorAccountEvidence,
  type AudiobookRetailDistributorAccountEvidence,
  type CreateAudiobookRetailReleaseDecisionInput,
} from "../audiobook-retail-release-decision.js";
import type { AudiobookRetailTrackPlan } from "../audiobook-retail-track-plan.js";
import {
  retailReleaseInspection,
  retailReleaseManifest,
} from "./retail-release-package-fixture.js";
import {
  retailReleaseAt,
  retailReleaseNarration,
  retailReleasePolicy,
  retailReleaseRights,
  retailReleaseTrackPlan,
} from "./retail-release-policy-fixture.js";

function coverage(): AudiobookRetailPackageReviewCoverage {
  return Object.freeze({
    completeFileListConfirmed: true,
    manifestConfirmed: true,
    openingCreditPlayed: true,
    firstNarrativePlayed: true,
    midpointNarrativePlayed: true,
    finalNarrativePlayed: true,
    closingCreditPlayed: true,
    retailSamplePlayed: true,
    fileCountReviewed: 4,
  });
}

function scores(): AudiobookRetailPackageReviewScores {
  return Object.freeze({
    packageCompleteness: 5,
    fileNamingAndOrder: 5,
    creditAccuracy: 5,
    narrativeContinuity: 5,
    transitionAndSilenceIntegrity: 5,
    encodingConsistency: 5,
    retailSampleQuality: 5,
    releaseReadiness: 5,
  });
}

export function retailReleaseApprovedReview(
  inspection: AudiobookRetailPackageInspectionEvidence,
  manifest: AudiobookRetailPackageManifest,
  rights: ArtifactRightsSnapshot,
): AudiobookRetailPackageReviewSession {
  const initial = createAudiobookRetailPackageReviewSession({
    id: "retail_package_review_release_decision_001",
    inspection,
    manifest,
    rights,
    createdAt: retailReleaseAt(5),
  });
  const editorial = recordAudiobookRetailPackageReview(initial, {
    id: "release_package_editorial_review_001",
    role: "editorial",
    reviewerId: "release_package_editor_001",
    coverage: coverage(),
    playbackContexts: ["consumer-headphones", "speakers"],
    decision: "approve",
    scores: scores(),
    decidedAt: retailReleaseAt(6),
  });
  const engineering = recordAudiobookRetailPackageReview(editorial, {
    id: "release_package_engineering_review_001",
    role: "engineering",
    reviewerId: "release_package_engineer_001",
    coverage: coverage(),
    playbackContexts: ["studio-headphones"],
    decision: "approve",
    scores: scores(),
    decidedAt: retailReleaseAt(7),
  });
  return approveAudiobookRetailPackageReview(engineering, {
    inspection,
    manifest,
    rights,
    finalConfirmationId: "release_package_review_confirmation_001",
    approvedByActorId: "release_package_review_manager_001",
    humanConfirmation: true,
    approvedAt: retailReleaseAt(8),
  });
}

export interface RetailReleaseFixture {
  input: CreateAudiobookRetailReleaseDecisionInput;
  policy: AudiobookRetailEncodingPolicy;
  narration: AudiobookRetailNarrationEligibilityEvidence;
  plan: AudiobookRetailTrackPlan;
  manifest: AudiobookRetailPackageManifest;
  inspection: AudiobookRetailPackageInspectionEvidence;
  packageReview: AudiobookRetailPackageReviewSession;
  rights: ArtifactRightsSnapshot;
  account: AudiobookRetailDistributorAccountEvidence;
}

export function retailReleaseFixture(
  sourceKind: AudiobookRetailNarrationSourceKind = "human-performance",
  rightsOverrides: Partial<ArtifactRightsSnapshot> = {},
): RetailReleaseFixture {
  const policy = retailReleasePolicy();
  const narration = retailReleaseNarration(policy, sourceKind);
  const plan = retailReleaseTrackPlan(policy, narration);
  const manifest = retailReleaseManifest(plan, policy);
  const inspection = retailReleaseInspection(manifest);
  const rights = retailReleaseRights(rightsOverrides);
  const packageReview = retailReleaseApprovedReview(
    inspection,
    manifest,
    rights,
  );
  const account = createAudiobookRetailDistributorAccountEvidence({
    id: "retail_distributor_account_release_001",
    projectId: plan.projectId,
    bookId: plan.bookId,
    accountReferenceHash: "d".repeat(64),
    verifiedByActorId: "distribution_access_verifier_001",
    verifiedAt: retailReleaseAt(9).toISOString(),
    expiresAt: "2026-08-05T00:00:00.000Z",
    now: retailReleaseAt(10),
  });
  return {
    input: {
      packageReview,
      inspection,
      packageManifest: manifest,
      trackPlan: plan,
      policy,
      narration,
      rights,
      distributorAccount: account,
      finalConfirmationId: "retail_release_confirmation_001",
      decidedByActorId: "publisher_release_authority_001",
      humanConfirmation: true,
      deliveryMethod: "manual-acx-upload",
      validUntil: "2026-07-30T00:00:00.000Z",
      decidedAt: retailReleaseAt(10),
    },
    policy,
    narration,
    plan,
    manifest,
    inspection,
    packageReview,
    rights,
    account,
  };
}
