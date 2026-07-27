import assert from "node:assert/strict";
import test from "node:test";
import {
  addCalibrationCandidate,
  approveCalibrationSession,
  assertCalibrationSession,
  assessCalibrationSession,
  calibrationSessionPublicView,
  createCalibrationPolicy,
  createCalibrationSession,
  proposeCalibrationPassages,
  recordCalibrationReview,
  rejectCalibrationSession,
  selectCalibrationCandidate,
  type CalibrationCandidate,
  type CalibrationPassage,
  type CalibrationReview,
  type CalibrationScores,
  type CalibrationSession,
} from "./calibration-workflow.js";
import {
  stableHash,
  type ManuscriptSegment,
  type PerformanceDirection,
  type PerformancePlan,
  type SegmentedManuscript,
} from "./index.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const sourceHash = "a".repeat(64);
const capabilityFingerprint = "b".repeat(64);

function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function segment(
  index: number,
  kind: ManuscriptSegment["kind"],
  text: string,
): ManuscriptSegment {
  const wordCount = countWords(text);
  return {
    id: `segment_calibration_${String(index).padStart(3, "0")}`,
    sourceHash,
    chapterId: `chapter_calibration_${String(index).padStart(3, "0")}`,
    chapterOrdinal: index,
    chapterTitle: `Chapter ${index}`,
    ordinal: index,
    kind,
    sourceStart: index * 1_000,
    sourceEnd: index * 1_000 + text.length,
    text,
    wordCount,
    estimatedSpeechSeconds: Math.max(1, wordCount / 2.5),
  };
}

function direction(
  value: ManuscriptSegment,
  intensity: number,
  restraint: number,
  clarity: number,
): PerformanceDirection {
  return {
    segmentId: value.id,
    narrativeDistance: value.kind === "dialogue" ? "close" : "balanced",
    pace: 0.9,
    intensity,
    warmth: 0.52,
    restraint,
    clarity,
    pauseBeforeMs: 120,
    pauseAfterMs: 240,
    emotionalObjective: "Carry the dramatic intention without announcing an emotion label.",
    subtext: "Protect what the prose withholds.",
    notes: ["Preserve syntax and the final word."],
  };
}

function manuscriptFixture(): Readonly<{
  manuscript: SegmentedManuscript;
  performance: PerformancePlan;
}> {
  const segments = [
    segment(
      1,
      "narration",
      "The lamp burned quietly beside the empty chair while rain moved over the glass, and she listened without asking the room to answer.",
    ),
    segment(
      2,
      "dialogue",
      "“You came back for the ledger,” Mara said, “but you still have not told me who followed you across the river.”",
    ),
    segment(
      3,
      "narration",
      "Although the harbour bells had already marked midnight, and although every shutter along the quay had been drawn against the wind, the old clerk continued through the inventory, pausing at each erased name as though the missing ink might return if he gave it sufficient silence.",
    ),
    segment(
      4,
      "dialogue",
      "“Run now!” he shouted. “Do not look at the stair, do not call my name, and whatever you hear behind the door, keep moving!”",
    ),
    segment(
      5,
      "narration",
      "The charter divided the coast into seven customs districts, each governed by a different schedule of duties, exemptions, bonded storage rules, inspection windows, and appeal procedures that merchants ignored at considerable risk.",
    ),
    segment(
      6,
      "narration",
      "At dawn the tide removed the final footprint from the mud, leaving the watchman with the bell, the closed gate, and no one left to accuse.",
    ),
    segment(
      7,
      "narration",
      "Aelwyn told Mara that Captain Dunmore had carried the sealed dispatch from Caer Veyra through Saint Ormond before the winter roads failed.",
    ),
    segment(
      8,
      "narration",
      "The boy placed the cracked cup beside the polished silver service and waited for the mayor to decide which object embarrassed him more.",
    ),
  ] as const;
  const directions = [
    direction(segments[0], 0.12, 0.96, 0.94),
    direction(segments[1], 0.48, 0.72, 0.92),
    direction(segments[2], 0.44, 0.88, 0.93),
    direction(segments[3], 0.92, 0.42, 0.9),
    direction(segments[4], 0.26, 0.9, 0.99),
    direction(segments[5], 0.4, 0.94, 0.96),
    direction(segments[6], 0.34, 0.86, 0.95),
    direction(segments[7], 0.3, 0.91, 0.95),
  ];
  return {
    manuscript: {
      sourceHash,
      characterCount: segments.reduce((sum, value) => sum + value.text.length, 0),
      wordCount: segments.reduce((sum, value) => sum + value.wordCount, 0),
      chapters: segments.map((value) => ({
        id: value.chapterId,
        ordinal: value.chapterOrdinal,
        title: value.chapterTitle,
        sourceStart: value.sourceStart,
      })),
      segments,
      findings: [],
    },
    performance: {
      manuscriptHash: sourceHash,
      directions,
      calibrationSegmentIds: segments.map((value) => value.id),
    },
  };
}

function highScores(overrides: Partial<CalibrationScores> = {}): CalibrationScores {
  return {
    listenerRelationship: 4.6,
    textualTruth: 4.8,
    clarity: 4.7,
    rhythm: 4.5,
    emotionalTruth: 4.5,
    restraint: 4.6,
    sustainedListenability: 4.7,
    differentiation: 4.4,
    pronunciation: 4.8,
    ...overrides,
  };
}

function candidateFor(
  passage: CalibrationPassage,
  index: number,
  overrides: Partial<Omit<CalibrationCandidate, "fingerprint">> = {},
): Omit<CalibrationCandidate, "fingerprint"> {
  return {
    id: `candidate_calibration_${String(index).padStart(3, "0")}`,
    passageId: passage.id,
    takeArtifactId: `artifact_take_calibration_${String(index).padStart(3, "0")}`,
    transcriptAssessmentArtifactId: `artifact_transcript_assessment_${String(index).padStart(3, "0")}`,
    technicalAssessmentArtifactId: `artifact_technical_assessment_${String(index).padStart(3, "0")}`,
    voiceProfileId: "voice_calibration_narrator_001",
    voiceRevision: 4,
    providerId: "elevenlabs",
    modelId: "eleven_multilingual_v2",
    capabilityFingerprint,
    generationRequestHash: index.toString(16).padStart(64, "0"),
    continuityScore: 0.92,
    eligible: true,
    findingCodes: [],
    createdAt: new Date(t0.getTime() + index * 1_000).toISOString(),
    ...overrides,
  };
}

function reviewFor(
  candidateId: string,
  reviewerId: string,
  index: number,
  overrides: Partial<Omit<CalibrationReview, "fingerprint">> = {},
): Omit<CalibrationReview, "fingerprint"> {
  return {
    id: `review_${reviewerId}_${String(index).padStart(3, "0")}`,
    candidateId,
    reviewerId,
    blind: true,
    decision: "approve",
    scores: highScores(),
    notes: "The take remains natural over sustained listening and does not advertise its technique.",
    createdAt: new Date(t0.getTime() + 20_000 + index * 1_000).toISOString(),
    ...overrides,
  };
}

function baseSession(): CalibrationSession {
  const { manuscript, performance } = manuscriptFixture();
  const proposal = proposeCalibrationPassages(manuscript, performance);
  assert.equal(proposal.findings.some((finding) => finding.severity === "error"), false);
  const policy = createCalibrationPolicy({
    requiredCategories: proposal.recommendedRequiredCategories,
    minimumPassageCount: proposal.passages.length,
    minimumDistinctReviewers: 2,
    minimumMeanScore: 4,
    minimumDimensionScore: 3.5,
    minimumContinuityScore: 0.8,
    requireBlindReview: true,
    requireApprovedDecision: true,
  });
  return createCalibrationSession({
    id: "calibration_session_001",
    projectId: "project_calibration_001",
    seriesId: "series_calibration_001",
    voiceProfileId: "voice_calibration_narrator_001",
    voiceRevision: 4,
    policy,
    passages: proposal.passages,
    now: t0,
  });
}

function buildReviewedSession(
  candidateOverride: (
    passage: CalibrationPassage,
    index: number,
  ) => Partial<Omit<CalibrationCandidate, "fingerprint">> = () => ({}),
  reviewOverride: (
    candidateId: string,
    reviewerId: string,
    index: number,
  ) => Partial<Omit<CalibrationReview, "fingerprint">> = () => ({}),
): CalibrationSession {
  let session = baseSession();
  for (const [index, passage] of session.passages.entries()) {
    session = addCalibrationCandidate(
      session,
      candidateFor(passage, index + 1, candidateOverride(passage, index + 1)),
    );
  }
  for (const [index, candidate] of session.candidates.entries()) {
    for (const [reviewerOffset, reviewerId] of ["reviewer_alpha", "reviewer_beta"].entries()) {
      const reviewIndex = index * 2 + reviewerOffset + 1;
      session = recordCalibrationReview(
        session,
        reviewFor(
          candidate.id,
          reviewerId,
          reviewIndex,
          reviewOverride(candidate.id, reviewerId, reviewIndex),
        ),
      );
    }
  }
  for (const [index, candidate] of session.candidates.entries()) {
    session = selectCalibrationCandidate(session, {
      passageId: candidate.passageId,
      candidateId: candidate.id,
      selectedBy: "director_calibration_001",
      selectedAt: new Date(t0.getTime() + 60_000 + index * 1_000).toISOString(),
    });
  }
  return session;
}

test("passage proposal covers varied narration demands without retaining manuscript text", () => {
  const { manuscript, performance } = manuscriptFixture();
  const proposal = proposeCalibrationPassages(manuscript, performance);
  const categories = new Set(proposal.passages.map((passage) => passage.category));
  const segmentIds = new Set(proposal.passages.map((passage) => passage.segmentId));

  assert.equal(proposal.passages.length >= 6, true);
  assert.equal(segmentIds.size, proposal.passages.length);
  for (const category of [
    "quiet-intimacy",
    "dialogue-distinction",
    "long-syntax",
    "dramatic-pressure",
    "exposition-clarity",
    "chapter-ending",
    "pronunciation-load",
  ]) assert.equal(categories.has(category as never), true);
  assert.equal(proposal.findings.some((finding) => finding.severity === "error"), false);
  assert.match(proposal.fingerprint, /^[a-f0-9]{64}$/u);

  const serialised = JSON.stringify(proposal);
  for (const value of manuscript.segments.map((item) => item.text)) {
    assert.equal(serialised.includes(value), false);
  }
  for (const passage of proposal.passages) {
    assert.equal(passage.sourceHash, sourceHash);
    assert.match(passage.textHash, /^[a-f0-9]{64}$/u);
    assert.match(passage.fingerprint, /^[a-f0-9]{64}$/u);
  }
});

test("two blind independent reviewers can approve one consistent high-quality calibration set", () => {
  const reviewed = buildReviewedSession();
  const assessment = assessCalibrationSession(reviewed);
  assert.equal(assessment.eligible, true);
  assert.equal(assessment.distinctReviewerCount, 2);
  assert.equal(assessment.selectedCandidateCount, reviewed.passages.length);
  assert.equal(assessment.overallMeanScore >= 4, true);
  assert.equal(assessment.dimensionAverages.sustainedListenability, 4.7);
  assert.deepEqual(assessment.findings, []);

  const approved = approveCalibrationSession(reviewed, {
    approvedBy: "greg_parker",
    humanConfirmation: true,
    now: new Date(t0.getTime() + 120_000),
  });
  assert.equal(approved.status, "approved");
  assert.equal(approved.approval?.selectedCandidateIds.length, approved.passages.length);
  assert.equal(approved.approval?.selectedTakeArtifactIds.length, approved.passages.length);
  assert.equal(approved.approval?.providerId, "elevenlabs");
  assert.equal(approved.approval?.modelId, "eleven_multilingual_v2");
  assert.equal(approved.approval?.capabilityFingerprint, capabilityFingerprint);
  assertCalibrationSession(approved);

  const publicView = calibrationSessionPublicView(approved);
  assert.equal(publicView.status, "approved");
  assert.equal(publicView.eligibleForApproval, true);
  assert.equal(publicView.distinctReviewerCount, 2);
  assert.equal(publicView.approvedAt, approved.approval?.approvedAt);
  const serialised = JSON.stringify(publicView);
  for (const forbidden of [
    "reviewer_alpha",
    "reviewer_beta",
    "greg_parker",
    "director_calibration_001",
    "artifact_take_calibration",
    "artifact_transcript_assessment",
    "artifact_technical_assessment",
    "elevenlabs",
    "eleven_multilingual_v2",
    capabilityFingerprint,
    "The take remains natural",
  ]) assert.equal(serialised.includes(forbidden), false);
});

test("candidate and review creation are idempotent while conflicting reuse fails", () => {
  let session = baseSession();
  const passage = session.passages[0]!;
  const candidate = candidateFor(passage, 1);
  const created = addCalibrationCandidate(session, candidate);
  assert.equal(addCalibrationCandidate(created, candidate), created);
  assert.throws(
    () => addCalibrationCandidate(created, { ...candidate, continuityScore: 0.91 }),
    /CALIBRATION_CANDIDATE_IDEMPOTENCY_CONFLICT/u,
  );

  const review = reviewFor(candidate.id, "reviewer_alpha", 1);
  const reviewed = recordCalibrationReview(created, review);
  assert.equal(recordCalibrationReview(reviewed, review), reviewed);
  assert.throws(
    () => recordCalibrationReview(reviewed, {
      ...review,
      id: "review_reused_identity_001",
      decision: "revise",
    }),
    /CALIBRATION_REVIEW_ALREADY_RECORDED/u,
  );
});

test("approval fails for missing selections, weak review coverage and low sustained listening", () => {
  const draft = baseSession();
  const draftAssessment = assessCalibrationSession(draft);
  assert.equal(draftAssessment.eligible, false);
  assert.equal(
    draftAssessment.findings.some((finding) => finding.code === "CALIBRATION_REQUIRED_PASSAGE_UNSELECTED"),
    true,
  );
  assert.throws(
    () => approveCalibrationSession(draft, {
      approvedBy: "greg_parker",
      humanConfirmation: true,
      now: new Date(t0.getTime() + 120_000),
    }),
    /CALIBRATION_APPROVAL_BLOCKED/u,
  );

  const low = buildReviewedSession(
    () => ({}),
    (_candidateId, reviewerId) => reviewerId === "reviewer_beta"
      ? { scores: highScores({ sustainedListenability: 2.0 }) }
      : {},
  );
  const lowAssessment = assessCalibrationSession(low);
  assert.equal(lowAssessment.eligible, false);
  assert.equal(
    lowAssessment.findings.some((finding) =>
      finding.code === "CALIBRATION_DIMENSION_BELOW_MINIMUM"
      && finding.dimension === "sustainedListenability"
    ),
    true,
  );
});

test("non-blind, revise, reject, continuity and unresolved candidate findings block approval", () => {
  const nonBlind = buildReviewedSession(
    () => ({}),
    (_candidateId, reviewerId) => reviewerId === "reviewer_alpha" ? { blind: false } : {},
  );
  assert.equal(
    assessCalibrationSession(nonBlind).findings.some((finding) =>
      finding.code === "CALIBRATION_BLIND_REVIEW_REQUIRED"
    ),
    true,
  );

  const revise = buildReviewedSession(
    () => ({}),
    (_candidateId, reviewerId) => reviewerId === "reviewer_alpha"
      ? { decision: "revise" }
      : {},
  );
  assert.equal(
    assessCalibrationSession(revise).findings.some((finding) =>
      finding.code === "CALIBRATION_APPROVED_DECISIONS_REQUIRED"
    ),
    true,
  );

  const rejected = buildReviewedSession(
    () => ({}),
    (_candidateId, reviewerId) => reviewerId === "reviewer_beta"
      ? { decision: "reject" }
      : {},
  );
  assert.equal(
    assessCalibrationSession(rejected).findings.some((finding) =>
      finding.code === "CALIBRATION_CANDIDATE_REJECTED"
    ),
    true,
  );

  const continuity = buildReviewedSession((_passage, index) =>
    index === 1 ? { continuityScore: 0.5 } : {}
  );
  assert.equal(
    assessCalibrationSession(continuity).findings.some((finding) =>
      finding.code === "CALIBRATION_CONTINUITY_BELOW_MINIMUM"
    ),
    true,
  );

  const ineligible = buildReviewedSession((_passage, index) =>
    index === 1
      ? { eligible: false, findingCodes: ["TRANSCRIPT_FINAL_WORD_MISSING"] }
      : {}
  );
  assert.equal(
    assessCalibrationSession(ineligible).findings.some((finding) =>
      finding.code === "CALIBRATION_SELECTED_CANDIDATE_INELIGIBLE"
    ),
    true,
  );
});

test("provider, model or capability drift across selected takes blocks a continuity lock", () => {
  const drifted = buildReviewedSession((_passage, index) =>
    index === 2
      ? {
          modelId: "eleven_v3",
          capabilityFingerprint: "c".repeat(64),
        }
      : {}
  );
  const assessment = assessCalibrationSession(drifted);
  assert.equal(assessment.eligible, false);
  assert.equal(
    assessment.findings.some((finding) =>
      finding.code === "CALIBRATION_PROVIDER_CONFIGURATION_DRIFT"
    ),
    true,
  );
});

test("automation identities cannot approve and terminal sessions cannot be revised", () => {
  const reviewed = buildReviewedSession();
  assert.throws(
    () => approveCalibrationSession(reviewed, {
      approvedBy: "automation_calibration",
      humanConfirmation: true,
      now: new Date(t0.getTime() + 120_000),
    }),
    /CALIBRATION_HUMAN_APPROVER_REQUIRED/u,
  );

  const approved = approveCalibrationSession(reviewed, {
    approvedBy: "greg_parker",
    humanConfirmation: true,
    now: new Date(t0.getTime() + 120_000),
  });
  assert.throws(
    () => recordCalibrationReview(approved, reviewFor(
      approved.candidates[0]!.id,
      "reviewer_gamma",
      99,
    )),
    /CALIBRATION_SESSION_TERMINAL/u,
  );

  const rejected = rejectCalibrationSession(baseSession(), {
    codes: ["CALIBRATION_NARRATOR_RELATIONSHIP_UNRESOLVED"],
    rejectedBy: "director_calibration_001",
    now: new Date(t0.getTime() + 1_000),
  });
  assert.equal(rejected.status, "rejected");
  assert.throws(
    () => addCalibrationCandidate(
      rejected,
      candidateFor(rejected.passages[0]!, 1),
    ),
    /CALIBRATION_SESSION_TERMINAL/u,
  );
});

test("fingerprint and revision-chain tampering are detected", () => {
  const session = baseSession();
  assert.throws(
    () => assertCalibrationSession({
      ...session,
      fingerprint: "d".repeat(64),
    }),
    /CALIBRATION_SESSION_FINGERPRINT_INVALID/u,
  );
  assert.throws(
    () => assertCalibrationSession({
      ...session,
      revision: 2,
      fingerprint: stableHash({ broken: true }),
    }),
    /CALIBRATION_REVISION_CHAIN_REQUIRED/u,
  );
});
