import assert from "node:assert/strict";
import test from "node:test";
import {
  addCalibrationCandidate,
  assessCalibrationSession,
  createCalibrationPolicy,
  createCalibrationSession,
  recordCalibrationReview,
  selectCalibrationCandidate,
  type CalibrationCandidate,
  type CalibrationPassage,
  type CalibrationReview,
  type CalibrationScores,
  type CalibrationSession,
} from "./calibration-workflow.js";
import { stableHash } from "./index.js";

const t0 = new Date("2026-08-08T00:00:00.000Z");
const sourceHash = "a".repeat(64);
const capabilityFingerprint = "b".repeat(64);

function at(seconds: number): string {
  return new Date(t0.getTime() + seconds * 1_000).toISOString();
}

function scores(value: number): CalibrationScores {
  return {
    listenerRelationship: value,
    textualTruth: value,
    clarity: value,
    rhythm: value,
    emotionalTruth: value,
    restraint: value,
    sustainedListenability: value,
    differentiation: value,
    pronunciation: value,
  };
}

function passage(): CalibrationPassage {
  const base = {
    id: "passage_comparative_001",
    segmentId: "segment_comparative_001",
    sourceHash,
    textHash: "c".repeat(64),
    chapterId: "chapter_comparative_001",
    category: "manual-critical" as const,
    required: true,
    wordCount: 48,
    estimatedSeconds: 19.2,
    rationaleCodes: Object.freeze(["CALIBRATION_MANUAL_CRITICAL"]),
  };
  return Object.freeze({ ...base, fingerprint: stableHash(base) });
}

function candidate(
  value: CalibrationPassage,
  suffix: string,
  createdAt: string,
  overrides: Partial<Omit<CalibrationCandidate, "fingerprint">> = {},
): Omit<CalibrationCandidate, "fingerprint"> {
  return {
    id: `candidate_comparative_${suffix}`,
    passageId: value.id,
    takeArtifactId: `artifact_take_comparative_${suffix}`,
    transcriptAssessmentArtifactId: `artifact_transcript_comparative_${suffix}`,
    technicalAssessmentArtifactId: `artifact_technical_comparative_${suffix}`,
    voiceProfileId: "voice_comparative_narrator_001",
    voiceRevision: 1,
    providerId: "audio-studio",
    modelId: "governed-local-voice-v1",
    capabilityFingerprint,
    generationRequestHash: stableHash({ suffix }),
    continuityScore: 0.94,
    eligible: true,
    findingCodes: [],
    createdAt,
    ...overrides,
  };
}

function review(
  candidateId: string,
  reviewerId: string,
  value: number,
  createdAt: string,
  overrides: Partial<Omit<CalibrationReview, "fingerprint">> = {},
): Omit<CalibrationReview, "fingerprint"> {
  return {
    id: `review_${candidateId}_${reviewerId}`,
    candidateId,
    reviewerId,
    blind: true,
    decision: "approve",
    scores: scores(value),
    notes: "Reviewed blind against the full passage and neighbouring approved context.",
    createdAt,
    ...overrides,
  };
}

function comparativeSession(input: Readonly<{
  secondCandidate?: Partial<Omit<CalibrationCandidate, "fingerprint">>;
}> = {}): CalibrationSession {
  const calibrationPassage = passage();
  const policy = createCalibrationPolicy({
    requiredCategories: ["manual-critical"],
    minimumPassageCount: 1,
    minimumDistinctReviewers: 2,
    minimumMeanScore: 4,
    minimumDimensionScore: 3.5,
    minimumContinuityScore: 0.8,
    requireBlindReview: true,
    requireApprovedDecision: true,
  });
  let session = createCalibrationSession({
    id: "calibration_comparative_001",
    projectId: "project_comparative_001",
    voiceProfileId: "voice_comparative_narrator_001",
    voiceRevision: 1,
    policy,
    passages: [calibrationPassage],
    now: t0,
  });
  session = addCalibrationCandidate(
    session,
    candidate(calibrationPassage, "a", at(1)),
  );
  return addCalibrationCandidate(
    session,
    candidate(calibrationPassage, "b", at(2), input.secondCandidate),
  );
}

function choose(
  session: CalibrationSession,
  candidateId: string,
  seconds = 30,
): CalibrationSession {
  return selectCalibrationCandidate(session, {
    passageId: session.passages[0]!.id,
    candidateId,
    selectedBy: "director_comparative_001",
    selectedAt: at(seconds),
  });
}

test("eligible alternatives require complete blind review coverage", () => {
  let session = comparativeSession();
  const [first, second] = session.candidates;
  session = recordCalibrationReview(session, review(first!.id, "reviewer_alpha", 4.6, at(10)));
  session = recordCalibrationReview(session, review(first!.id, "reviewer_beta", 4.6, at(11)));
  session = recordCalibrationReview(session, review(second!.id, "reviewer_alpha", 4.8, at(12)));
  session = choose(session, first!.id);

  const assessment = assessCalibrationSession(session);
  assert.equal(assessment.eligible, false);
  assert.equal(
    assessment.findings.some((finding) =>
      finding.code === "CALIBRATION_COMPARATIVE_REVIEW_COVERAGE_INCOMPLETE"
      && finding.candidateId === second!.id
    ),
    true,
  );
});

test("eligible alternatives require a matched blind reviewer panel", () => {
  let session = comparativeSession();
  const [first, second] = session.candidates;
  session = recordCalibrationReview(session, review(first!.id, "reviewer_alpha", 4.6, at(10)));
  session = recordCalibrationReview(session, review(first!.id, "reviewer_beta", 4.6, at(11)));
  session = recordCalibrationReview(session, review(second!.id, "reviewer_gamma", 4.8, at(12)));
  session = recordCalibrationReview(session, review(second!.id, "reviewer_delta", 4.8, at(13)));
  session = choose(session, first!.id);

  const assessment = assessCalibrationSession(session);
  assert.equal(assessment.eligible, false);
  assert.equal(
    assessment.findings.some((finding) =>
      finding.code === "CALIBRATION_COMPARATIVE_REVIEW_PANEL_MISMATCH"
    ),
    true,
  );
});

test("a lower-rated selected take cannot pass comparative calibration", () => {
  let session = comparativeSession();
  const [first, second] = session.candidates;
  session = recordCalibrationReview(session, review(first!.id, "reviewer_alpha", 4.2, at(10)));
  session = recordCalibrationReview(session, review(first!.id, "reviewer_beta", 4.2, at(11)));
  session = recordCalibrationReview(session, review(second!.id, "reviewer_alpha", 4.8, at(12)));
  session = recordCalibrationReview(session, review(second!.id, "reviewer_beta", 4.8, at(13)));
  session = choose(session, first!.id);

  const lowerRated = assessCalibrationSession(session);
  assert.equal(lowerRated.eligible, false);
  assert.equal(
    lowerRated.findings.some((finding) =>
      finding.code === "CALIBRATION_SELECTED_CANDIDATE_NOT_TOP_RATED"
      && finding.candidateId === first!.id
    ),
    true,
  );

  const highestRated = assessCalibrationSession(choose(session, second!.id, 31));
  assert.equal(highestRated.eligible, true);
  assert.deepEqual(highestRated.findings, []);
});

test("a rejected alternative cannot outrank an approved selected take", () => {
  let session = comparativeSession();
  const [first, second] = session.candidates;
  session = recordCalibrationReview(session, review(first!.id, "reviewer_alpha", 4.5, at(10)));
  session = recordCalibrationReview(session, review(first!.id, "reviewer_beta", 4.5, at(11)));
  session = recordCalibrationReview(session, review(second!.id, "reviewer_alpha", 4.9, at(12)));
  session = recordCalibrationReview(session, review(
    second!.id,
    "reviewer_beta",
    4.9,
    at(13),
    { decision: "reject" },
  ));
  session = choose(session, first!.id);

  const assessment = assessCalibrationSession(session);
  assert.equal(assessment.eligible, true);
  assert.deepEqual(assessment.findings, []);
});

test("objective-ineligible alternatives do not force comparative review", () => {
  let session = comparativeSession({
    secondCandidate: {
      eligible: false,
      findingCodes: ["TRANSCRIPT_FINAL_WORD_MISSING"],
    },
  });
  const [first] = session.candidates;
  session = recordCalibrationReview(session, review(first!.id, "reviewer_alpha", 4.7, at(10)));
  session = recordCalibrationReview(session, review(first!.id, "reviewer_beta", 4.7, at(11)));
  session = choose(session, first!.id);

  const assessment = assessCalibrationSession(session);
  assert.equal(assessment.eligible, true);
  assert.deepEqual(assessment.findings, []);
});
