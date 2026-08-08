import type { AudioEngineeringEvidence } from "../src/audio-engineering.js";
import type { ArtifactRecord } from "../src/artifact-registry.js";
import {
  approveNarrationTakeSelection,
  createNarrationTakeReviewPolicy,
  createNarrationTakeReviewSession,
  recordNarrationTakeReview,
  selectNarrationTake,
  type ApprovedNarrationTakeSelection,
  type NarrationTakeReviewPerspective,
  type NarrationTakeReviewScores,
} from "../src/narration-take-review.js";

export interface NarrationTakeReviewFixtureCandidate {
  audioCandidate: ArtifactRecord;
  transcriptArtifact: ArtifactRecord;
  engineeringArtifact: ArtifactRecord;
  engineeringEvidence: AudioEngineeringEvidence;
  score: number;
}

function scores(value: number): NarrationTakeReviewScores {
  return {
    textualTruth: value,
    pronunciation: value,
    pacing: value,
    rhythm: value,
    emotionalTruth: value,
    restraint: value,
    sustainedListenability: value,
    continuity: value,
    technicalComfort: value,
  };
}

export function approveNarrationTakeReviewFixture(input: Readonly<{
  sessionId: string;
  performanceContextFingerprint: string;
  candidates: readonly NarrationTakeReviewFixtureCandidate[];
  selectedTakeId?: string;
  editorialReviewerId?: string;
  engineeringReviewerId?: string;
  directorId?: string;
  createdAt: Date;
}>): ApprovedNarrationTakeSelection {
  const editorialReviewerId = input.editorialReviewerId ?? "editorial_reviewer_fixture_001";
  const engineeringReviewerId = input.engineeringReviewerId ?? "engineering_reviewer_fixture_001";
  const directorId = input.directorId ?? "narration_director_fixture_001";
  const policy = createNarrationTakeReviewPolicy({
    id: "narration-performance-review-fixture",
    version: "2026.08",
    minimumCandidateCount: 2,
    maximumCandidateCount: 8,
    minimumDimensionScore: 4,
    requireBlindReview: true,
    requireFullListen: true,
    requiredPerspectives: ["editorial", "engineering"],
  });
  let session = createNarrationTakeReviewSession({
    id: input.sessionId,
    performanceContextFingerprint: input.performanceContextFingerprint,
    policy,
    candidates: input.candidates,
    createdAt: input.createdAt,
  });
  let seconds = 1;
  for (const candidate of session.candidates) {
    for (const [perspective, reviewerId] of [
      ["editorial", editorialReviewerId],
      ["engineering", engineeringReviewerId],
    ] as const satisfies readonly [NarrationTakeReviewPerspective, string][]) {
      session = recordNarrationTakeReview(session, {
        id: `review_${candidate.audioCandidate.takeId}_${perspective}`,
        candidateTakeId: candidate.audioCandidate.takeId!,
        perspective,
        reviewerId,
        blind: true,
        listenedDurationMs: candidate.durationMs,
        playbackContexts: perspective === "engineering"
          ? ["studio-headphones"]
          : ["consumer-headphones", "speakers"],
        decision: "approve",
        scores: scores(
          input.candidates.find(
            (value) => value.audioCandidate.takeId === candidate.audioCandidate.takeId,
          )!.score,
        ),
        decidedAt: new Date(input.createdAt.getTime() + seconds * 1_000),
      });
      seconds += 1;
    }
  }
  const selectedTakeId = input.selectedTakeId
    ?? [...input.candidates]
      .sort((left, right) => right.score - left.score)[0]!
      .audioCandidate.takeId!;
  session = selectNarrationTake(session, {
    candidateTakeId: selectedTakeId,
    selectedByActorId: directorId,
    selectedAt: new Date(input.createdAt.getTime() + seconds * 1_000),
  });
  seconds += 1;
  return approveNarrationTakeSelection(session, {
    finalConfirmationId: `confirmation_${input.sessionId}`,
    approvedByActorId: directorId,
    humanConfirmation: true,
    approvedAt: new Date(input.createdAt.getTime() + seconds * 1_000),
  });
}
