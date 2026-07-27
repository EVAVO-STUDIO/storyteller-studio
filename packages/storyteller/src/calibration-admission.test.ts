import assert from "node:assert/strict";
import test from "node:test";
import {
  addCalibrationCandidate,
  approveCalibrationSession,
  createCalibrationPolicy,
  createCalibrationSession,
  proposeCalibrationPassages,
  recordCalibrationReview,
  selectCalibrationCandidate,
  type CalibrationCandidate,
  type CalibrationPassage,
  type CalibrationReview,
  type CalibrationSession,
} from "./calibration-workflow.js";
import {
  assertProductionCalibrationLock,
  calibrationExecutionFindingCodes,
  createProductionCalibrationLock,
  productionCalibrationLockPublicView,
  validatePersistedProductionCalibrationLock,
  validateProductionCalibrationScope,
} from "./calibration-admission.js";
import type {
  GenerationJob,
  ManuscriptSegment,
  PerformanceDirection,
  PerformancePlan,
  SegmentedManuscript,
} from "./index.js";
import type { GenerationExecutionReport } from "./provider-adapter.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const capabilityFingerprint = "b".repeat(64);
const sourceHash = "a".repeat(64);

function draftSession(): CalibrationSession {
  const text = "The room stayed quiet while Mara counted each bell and protected the final word.";
  const segment: ManuscriptSegment = {
    id: "segment_calibration_admission_001",
    sourceHash,
    chapterId: "chapter_calibration_admission_001",
    chapterOrdinal: 1,
    chapterTitle: "Chapter One",
    ordinal: 1,
    kind: "narration",
    sourceStart: 0,
    sourceEnd: text.length,
    text,
    wordCount: 14,
    estimatedSpeechSeconds: 5.6,
  };
  const direction: PerformanceDirection = {
    segmentId: segment.id,
    narrativeDistance: "close",
    pace: 0.84,
    intensity: 0.24,
    warmth: 0.54,
    restraint: 0.92,
    clarity: 0.96,
    pauseBeforeMs: 120,
    pauseAfterMs: 320,
    emotionalObjective: "Keep the listener near without displaying technique.",
    subtext: "Silence carries part of the meaning.",
    notes: ["Protect the final word."],
  };
  const manuscript: SegmentedManuscript = {
    sourceHash,
    characterCount: text.length,
    wordCount: segment.wordCount,
    chapters: [{
      id: segment.chapterId,
      ordinal: 1,
      title: segment.chapterTitle,
      sourceStart: 0,
    }],
    segments: [segment],
    findings: [],
  };
  const performance: PerformancePlan = {
    manuscriptHash: sourceHash,
    directions: [direction],
    calibrationSegmentIds: [segment.id],
  };
  const proposal = proposeCalibrationPassages(manuscript, performance);
  const passage = proposal.passages[0];
  if (!passage) throw new Error("calibration admission passage required");
  return createCalibrationSession({
    id: "calibration_admission_001",
    projectId: "project_calibration_admission_001",
    seriesId: "series_calibration_admission_001",
    voiceProfileId: "voice_calibration_admission_001",
    voiceRevision: 4,
    policy: createCalibrationPolicy({
      requiredCategories: [passage.category],
      minimumPassageCount: 1,
      minimumDistinctReviewers: 1,
      minimumMeanScore: 4,
      minimumDimensionScore: 3.5,
      minimumContinuityScore: 0.8,
      requireBlindReview: true,
      requireApprovedDecision: true,
    }),
    passages: [passage],
    now: t0,
  });
}

function candidateFor(
  session: CalibrationSession,
  passage: CalibrationPassage,
): Omit<CalibrationCandidate, "fingerprint"> {
  return {
    id: "candidate_calibration_admission_001",
    passageId: passage.id,
    takeArtifactId: "artifact_take_calibration_admission_001",
    transcriptAssessmentArtifactId: "artifact_transcript_calibration_admission_001",
    technicalAssessmentArtifactId: "artifact_technical_calibration_admission_001",
    voiceProfileId: session.voiceProfileId,
    voiceRevision: session.voiceRevision,
    providerId: "elevenlabs",
    modelId: "eleven_multilingual_v2",
    capabilityFingerprint,
    generationRequestHash: "c".repeat(64),
    continuityScore: 0.94,
    eligible: true,
    findingCodes: [],
    createdAt: new Date(t0.getTime() + 1_000).toISOString(),
  };
}

function reviewFor(candidateId: string): Omit<CalibrationReview, "fingerprint"> {
  return {
    id: "review_calibration_admission_001",
    candidateId,
    reviewerId: "reviewer_calibration_admission_001",
    blind: true,
    decision: "approve",
    scores: {
      listenerRelationship: 4.7,
      textualTruth: 4.8,
      clarity: 4.8,
      rhythm: 4.6,
      emotionalTruth: 4.5,
      restraint: 4.7,
      sustainedListenability: 4.8,
      differentiation: 4.4,
      pronunciation: 4.8,
    },
    notes: "The take remains natural and unforced throughout.",
    createdAt: new Date(t0.getTime() + 2_000).toISOString(),
  };
}

function approvedSession(): CalibrationSession {
  const draft = draftSession();
  const passage = draft.passages[0];
  if (!passage) throw new Error("calibration admission passage required");
  const collecting = addCalibrationCandidate(
    draft,
    candidateFor(draft, passage),
    new Date(t0.getTime() + 1_000),
  );
  const candidate = collecting.candidates[0];
  if (!candidate) throw new Error("calibration admission candidate required");
  const reviewed = recordCalibrationReview(
    collecting,
    reviewFor(candidate.id),
    new Date(t0.getTime() + 2_000),
  );
  const selected = selectCalibrationCandidate(
    reviewed,
    {
      passageId: passage.id,
      candidateId: candidate.id,
      selectedBy: "director_calibration_admission_001",
      selectedAt: new Date(t0.getTime() + 3_000).toISOString(),
    },
    new Date(t0.getTime() + 3_000),
  );
  return approveCalibrationSession(selected, {
    approvedBy: "greg_parker",
    humanConfirmation: true,
    now: new Date(t0.getTime() + 4_000),
  });
}

function job(overrides: Partial<GenerationJob> = {}): GenerationJob {
  return {
    id: "job_calibration_admission_001",
    projectId: "project_calibration_admission_001",
    segmentId: "segment_generation_calibration_001",
    providerFallbackIds: ["elevenlabs"],
    cacheKey: "d".repeat(64),
    candidateCount: 2,
    status: "ready",
    ...overrides,
  };
}

function completedReport(overrides: Partial<GenerationExecutionReport> = {}): GenerationExecutionReport {
  return {
    jobId: "job_calibration_admission_001",
    status: "completed",
    attempts: [],
    results: [{
      providerId: "elevenlabs",
      adapterVersion: "1.0.0",
      requestId: "request_calibration_admission_001",
      idempotencyKey: "e".repeat(64),
      audio: new Uint8Array([1, 2, 3]),
      contentType: "audio/wav",
      usage: { inputCharacters: 10, estimatedCost: 0.01, currency: "AUD" },
      capabilityFingerprint,
      generatedAt: new Date(t0.getTime() + 5_000).toISOString(),
      provenance: { modelId: "eleven_multilingual_v2" },
    }],
    findings: [],
    ...overrides,
  };
}

test("approved calibration creates an immutable production lock with a redacted public view", () => {
  const session = approvedSession();
  const lock = createProductionCalibrationLock(session);
  assertProductionCalibrationLock(lock);
  assert.equal(lock.sessionId, session.id);
  assert.equal(lock.sessionRevision, session.revision);
  assert.equal(lock.voiceProfileId, session.voiceProfileId);
  assert.equal(lock.providerId, "elevenlabs");
  assert.equal(lock.modelId, "eleven_multilingual_v2");
  assert.equal(lock.selectedTakeCount, 1);
  assert.match(lock.lockFingerprint, /^[a-f0-9]{64}$/u);

  const publicView = productionCalibrationLockPublicView(lock);
  assert.deepEqual(publicView, {
    locked: true,
    sessionRevision: session.revision,
    voiceRevision: session.voiceRevision,
    selectedTakeCount: 1,
    approvedAt: session.approval?.approvedAt,
    lockFingerprint: lock.lockFingerprint,
  });
  const serialised = JSON.stringify(publicView);
  for (const forbidden of [
    session.id,
    session.projectId,
    session.seriesId!,
    session.voiceProfileId,
    "elevenlabs",
    "eleven_multilingual_v2",
    capabilityFingerprint,
    "artifact_take_calibration_admission_001",
    "greg_parker",
    "reviewer_calibration_admission_001",
  ]) assert.equal(serialised.includes(forbidden), false);
});

test("draft or tampered calibration sessions cannot create production locks", () => {
  assert.throws(
    () => createProductionCalibrationLock(draftSession()),
    /CALIBRATION_LOCK_APPROVED_SESSION_REQUIRED/u,
  );
  const lock = createProductionCalibrationLock(approvedSession());
  assert.throws(
    () => assertProductionCalibrationLock({
      ...lock,
      selectedTakeCount: 2,
    }),
    /CALIBRATION_LOCK_FINGERPRINT_INVALID/u,
  );
});

test("production scope requires the approved project, voice revision and sole provider route", () => {
  const session = approvedSession();
  const lock = createProductionCalibrationLock(session);
  assert.doesNotThrow(() => validateProductionCalibrationScope({
    lock,
    job: job(),
    voiceProfileId: session.voiceProfileId,
    voiceRevision: session.voiceRevision,
    mode: "production",
    now: new Date(t0.getTime() + 10_000),
  }));
  assert.throws(
    () => validateProductionCalibrationScope({
      lock,
      job: job({ projectId: "project_calibration_admission_other" }),
      voiceProfileId: session.voiceProfileId,
      voiceRevision: session.voiceRevision,
      mode: "production",
    }),
    /CALIBRATION_LOCK_PROJECT_SCOPE_MISMATCH/u,
  );
  assert.throws(
    () => validateProductionCalibrationScope({
      lock,
      job: job(),
      voiceProfileId: "voice_calibration_admission_other",
      voiceRevision: session.voiceRevision,
      mode: "production",
    }),
    /CALIBRATION_LOCK_VOICE_SCOPE_MISMATCH/u,
  );
  assert.throws(
    () => validateProductionCalibrationScope({
      lock,
      job: job({ providerFallbackIds: ["elevenlabs", "provider_other"] }),
      voiceProfileId: session.voiceProfileId,
      voiceRevision: session.voiceRevision,
      mode: "production",
    }),
    /CALIBRATION_LOCK_PROVIDER_ROUTE_MISMATCH/u,
  );
  assert.throws(
    () => validateProductionCalibrationScope({
      lock,
      job: job(),
      voiceProfileId: session.voiceProfileId,
      voiceRevision: session.voiceRevision,
      mode: "calibration",
    }),
    /CALIBRATION_LOCK_PRODUCTION_MODE_REQUIRED/u,
  );
});

test("persisted approval must reproduce the exact lock", () => {
  const session = approvedSession();
  const lock = createProductionCalibrationLock(session);
  assert.doesNotThrow(() => validatePersistedProductionCalibrationLock(lock, session));
  assert.throws(
    () => validatePersistedProductionCalibrationLock({
      ...lock,
      sessionFingerprint: "f".repeat(64),
      lockFingerprint: lock.lockFingerprint,
    }, session),
    /CALIBRATION_LOCK_FINGERPRINT_INVALID/u,
  );
});

test("provider results must match the approved provider, model and capability snapshot", () => {
  const lock = createProductionCalibrationLock(approvedSession());
  assert.deepEqual(calibrationExecutionFindingCodes(lock, completedReport()), []);
  assert.deepEqual(
    calibrationExecutionFindingCodes(lock, completedReport({
      results: [{
        ...completedReport().results[0]!,
        providerId: "provider_other",
        capabilityFingerprint: "f".repeat(64),
        provenance: { modelId: "model_other" },
      }],
    })),
    [
      "GENERATION_CALIBRATION_CAPABILITY_MISMATCH",
      "GENERATION_CALIBRATION_MODEL_MISMATCH",
      "GENERATION_CALIBRATION_PROVIDER_MISMATCH",
    ],
  );
  assert.deepEqual(
    calibrationExecutionFindingCodes(lock, completedReport({ results: [] })),
    ["GENERATION_CALIBRATION_RESULT_REQUIRED"],
  );
});
