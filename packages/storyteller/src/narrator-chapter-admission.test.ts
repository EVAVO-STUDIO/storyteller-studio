import assert from "node:assert/strict";
import test from "node:test";
import {
  stableHash,
  type ProjectManifest,
} from "./index.js";
import {
  createNarratorMonitoringPolicy,
} from "./narrator-book-monitor.js";
import {
  admittedChapterNarratorReviewPublicView,
  assertAdmittedChapterNarratorReview,
  assertAdmittedNarratorChapterMonitoring,
  createAdmittedChapterNarratorReview,
  createAdmittedNarratorQualityReference,
  monitorAdmittedNarratorChapter,
  type AdmittedNarratorChapterMonitoring,
  type AdmittedNarratorObjectiveMetrics,
} from "./narrator-chapter-admission.js";
import {
  createNarratorProductionJobs,
} from "./narrator-production-job.js";
import {
  createTestAdmittedNarratorCasting,
  testDigest,
} from "../test-support/narrator-casting.js";

const sourceHash = testDigest("admitted-chapter-source");
const projectId = "project_admitted_chapter_001";
const chapterId = "chapter_001";

const manifest: ProjectManifest = {
  schemaVersion: "storyteller-project-v1",
  engineVersion: "0.2.0",
  id: projectId,
  title: "Admission-bound chapter",
  sourceHash,
  createdAt: "2026-08-10T19:00:00+10:00",
  status: "planned",
  rights: { ok: true, findings: [] },
  manuscript: {
    sourceHash,
    characterCount: 59,
    wordCount: 10,
    chapters: [{
      id: chapterId,
      ordinal: 1,
      title: "Chapter One",
      sourceStart: 0,
    }],
    segments: [
      {
        id: "segment_001",
        sourceHash,
        chapterId,
        chapterOrdinal: 1,
        chapterTitle: "Chapter One",
        ordinal: 1,
        kind: "narration",
        sourceStart: 0,
        sourceEnd: 30,
        text: "The first lamp failed quietly.",
        wordCount: 5,
        estimatedSpeechSeconds: 2.2,
      },
      {
        id: "segment_002",
        sourceHash,
        chapterId,
        chapterOrdinal: 1,
        chapterTitle: "Chapter One",
        ordinal: 2,
        kind: "narration",
        sourceStart: 31,
        sourceEnd: 59,
        text: "Mara waited beside the door.",
        wordCount: 5,
        estimatedSpeechSeconds: 2.1,
      },
    ],
    findings: [],
  },
  performance: {
    manuscriptHash: sourceHash,
    directions: [],
    calibrationSegmentIds: [],
  },
  providers: [{
    providerId: "audio_studio_local",
    label: "EVAVO Audio Studio",
    eligible: true,
    score: 100,
    reasons: [],
  }],
  visualBeats: [],
  fingerprint: testDigest("admitted-chapter-manifest"),
  findings: [],
};

const policy = createNarratorMonitoringPolicy({
  minimumTranscriptCoverage: 0.995,
  maximumInsertionRatio: 0.01,
  minimumSpeakerIdentitySimilarity: 0.86,
  maximumCadenceTemplateSimilarity: 0.78,
  maximumSentenceFinalContourRepetitionRatio: 0.62,
  maximumNoiseFloorDb: -55,
  maximumRoomToneDriftDb: 4,
  maximumSeamDiscontinuityScore: 0.25,
  maximumChapterDurationDriftRatio: 0.18,
  requireFinalWord: true,
  requireZeroClipping: true,
  forbidUnexpectedSpeakerChange: true,
});

const acoustic = Object.freeze({
  medianPitchHz: 128,
  pitchRangeSemitones: 9.5,
  speakingRateWpm: 151,
  pauseRatio: 0.18,
  energyRmsDb: -21,
  embeddingDistanceFromAnchor: 0.08,
});

function fixture(options: Readonly<{
  mode?: "zero-shot" | "adapted";
  seed?: string;
}> = {}) {
  const admittedCasting = createTestAdmittedNarratorCasting(projectId, options);
  const productionJobs = createNarratorProductionJobs(manifest, admittedCasting, 3);
  const reference = createAdmittedNarratorQualityReference({
    admittedCasting,
    acousticSignature: acoustic,
    expectedChapterDurationSeconds: 1_800,
    roomToneRmsDb: -58,
    evidenceHash: testDigest(`${options.seed ?? "magician"}:quality-reference`),
  });
  return { admittedCasting, productionJobs, reference };
}

function objective(
  overrides: Partial<AdmittedNarratorObjectiveMetrics> = {},
): AdmittedNarratorObjectiveMetrics {
  return {
    segmentCount: 2,
    transcriptCoverage: 0.999,
    insertionRatio: 0.002,
    finalWordPresent: true,
    clippedSampleCount: 0,
    unexpectedSpeakerChangeCount: 0,
    minimumSpeakerIdentitySimilarity: 0.94,
    acousticSignature: acoustic,
    chapterDurationSeconds: 1_790,
    cadenceTemplateSimilarity: 0.44,
    sentenceFinalContourRepetitionRatio: 0.31,
    noiseFloorDb: -62,
    roomToneRmsDb: -57.5,
    maximumSeamDiscontinuityScore: 0.08,
    transcriptEvidenceHash: testDigest("chapter-transcript"),
    speakerIdentityEvidenceHash: testDigest("chapter-speaker"),
    acousticEvidenceHash: testDigest("chapter-acoustic"),
    engineeringEvidenceHash: testDigest("chapter-engineering"),
    measuredAt: "2026-08-10T19:30:00+10:00",
    ...overrides,
  };
}

function monitor(options: Readonly<{
  mode?: "zero-shot" | "adapted";
  seed?: string;
  objectiveOverrides?: Partial<AdmittedNarratorObjectiveMetrics>;
}> = {}) {
  const scope = fixture(options);
  const monitoring = monitorAdmittedNarratorChapter({
    ...scope,
    manifest,
    chapterId,
    renderFingerprint: testDigest(`${options.seed ?? "magician"}:chapter-render`),
    policy,
    objective: objective(options.objectiveOverrides),
  });
  return { ...scope, monitoring };
}

function reviewInput(monitoring: AdmittedNarratorChapterMonitoring) {
  return {
    objectiveFindingAcknowledgements: monitoring.objectiveMonitoring.findingCodes,
    expectedSegmentCount: 2,
    renderedSegmentCount: 2,
    transcriptErrorCount: 0,
    finalWordPresent: true as const,
    clippedSampleCount: 0,
    performanceScore: 4.6,
    continuityScore: 4.5,
    listeningEaseScore: 4.6,
    identityStabilityScore: 4.7,
    syntheticArtifactFlags: [],
    fatigueFlags: [],
    reviewerIds: ["reviewer-a", "reviewer-b", "reviewer-c"],
    reviewedAt: "2026-08-10T20:00:00+10:00",
  };
}

function rehashMonitoring(
  value: AdmittedNarratorChapterMonitoring,
  changes: Partial<Omit<AdmittedNarratorChapterMonitoring, "fingerprint">>,
): AdmittedNarratorChapterMonitoring {
  const { fingerprint: _ignored, ...partial } = value;
  const changed = { ...partial, ...changes };
  return { ...changed, fingerprint: stableHash(changed) };
}

test("adapted chapter monitoring binds the exact profile admission, admitted casting and production job set", () => {
  const scope = monitor();
  assert.equal(
    scope.monitoring.profileAdmissionHash,
    scope.admittedCasting.profileAdmission.admissionHash,
  );
  assert.equal(
    scope.monitoring.admittedCastingFingerprint,
    scope.admittedCasting.fingerprint,
  );
  assert.equal(scope.monitoring.productionJobIds.length, 2);
  assert.equal(scope.monitoring.segmentIds.length, 2);
  assert.equal(scope.monitoring.status, "eligible-for-human-review");
  assert.doesNotThrow(() => assertAdmittedNarratorChapterMonitoring(
    scope.monitoring,
    { ...scope, manifest, policy },
  ));
});

test("zero-shot profiles use the same admitted chapter evidence boundary without invented training claims", () => {
  const scope = monitor({ mode: "zero-shot", seed: "zero-shot" });
  assert.equal(scope.admittedCasting.profileAdmission.training, null);
  assert.equal(scope.monitoring.status, "eligible-for-human-review");
  assert.doesNotThrow(() => assertAdmittedNarratorChapterMonitoring(
    scope.monitoring,
    { ...scope, manifest, policy },
  ));
});

test("production jobs from another admission cannot be monitored under the selected casting", () => {
  const selected = fixture({ seed: "selected" });
  const substituted = fixture({ seed: "substituted" });
  assert.throws(
    () => monitorAdmittedNarratorChapter({
      admittedCasting: selected.admittedCasting,
      manifest,
      chapterId,
      productionJobs: substituted.productionJobs,
      renderFingerprint: testDigest("substituted-render"),
      policy,
      reference: selected.reference,
      objective: objective(),
    }),
    /NARRATOR_PRODUCTION_PROFILE_ADMISSION_MISMATCH|NARRATOR_PRODUCTION_ADMITTED_CASTING_MISMATCH/u,
  );
});

test("rehashing cannot substitute the admission, production set, render or source lineage", () => {
  const scope = monitor();
  for (const changed of [
    rehashMonitoring(scope.monitoring, {
      profileAdmissionHash: testDigest("other-admission"),
    }),
    rehashMonitoring(scope.monitoring, {
      productionSetFingerprint: testDigest("other-production-set"),
    }),
    rehashMonitoring(scope.monitoring, {
      renderFingerprint: testDigest("other-render"),
    }),
    rehashMonitoring(scope.monitoring, {
      chapterSourceFingerprint: testDigest("other-source"),
    }),
  ]) {
    assert.throws(
      () => assertAdmittedNarratorChapterMonitoring(
        changed,
        { ...scope, manifest, policy },
      ),
      /ADMITTED_CHAPTER_MONITOR_/u,
    );
  }
});

test("human chapter review is inseparable from the exact admitted monitoring result", () => {
  const scope = monitor();
  const value = createAdmittedChapterNarratorReview({
    ...scope,
    manifest,
    policy,
    review: reviewInput(scope.monitoring),
  });
  assert.equal(value.chapterApproved, true);
  assert.equal(value.profileAdmissionHash, scope.monitoring.profileAdmissionHash);
  assert.equal(value.admittedMonitoringFingerprint, scope.monitoring.fingerprint);
  assert.equal(value.review.objectiveMonitoringFingerprint, scope.monitoring.objectiveMonitoring.fingerprint);
  assert.doesNotThrow(() => assertAdmittedChapterNarratorReview(
    value,
    { ...scope, manifest, policy },
  ));
});

test("AI-like cadence warnings must be acknowledged exactly before admitted human approval", () => {
  const scope = monitor({
    objectiveOverrides: {
      cadenceTemplateSimilarity: 0.92,
      sentenceFinalContourRepetitionRatio: 0.84,
    },
  });
  assert.equal(scope.monitoring.status, "requires-human-attention");
  assert.throws(
    () => createAdmittedChapterNarratorReview({
      ...scope,
      manifest,
      policy,
      review: {
        ...reviewInput(scope.monitoring),
        objectiveFindingAcknowledgements: [],
      },
    }),
    /CHAPTER_NARRATOR_MONITOR_FINDINGS_UNACKNOWLEDGED/u,
  );
  assert.doesNotThrow(() => createAdmittedChapterNarratorReview({
    ...scope,
    manifest,
    policy,
    review: reviewInput(scope.monitoring),
  }));
});

test("review substitution and authority escalation fail even after outer rehashing", () => {
  const scope = monitor();
  const value = createAdmittedChapterNarratorReview({
    ...scope,
    manifest,
    policy,
    review: reviewInput(scope.monitoring),
  });
  const other = monitor({ seed: "other-review" });
  const substituted = {
    ...value,
    monitoring: other.monitoring,
    admittedMonitoringFingerprint: other.monitoring.fingerprint,
  };
  assert.throws(
    () => assertAdmittedChapterNarratorReview(
      { ...substituted, fingerprint: stableHash(substituted) },
      { ...scope, manifest, policy },
    ),
    /ADMITTED_CHAPTER_MONITOR_|ADMITTED_CHAPTER_REVIEW_/u,
  );
  const { fingerprint: _ignored, ...partial } = value;
  const escalated = {
    ...partial,
    publicationAuthority: true,
  } as unknown as Omit<typeof value, "fingerprint">;
  assert.throws(
    () => assertAdmittedChapterNarratorReview(
      { ...escalated, fingerprint: stableHash(escalated) } as typeof value,
      { ...scope, manifest, policy },
    ),
    /ADMITTED_CHAPTER_REVIEW_AUTHORITY_INVALID/u,
  );
});

test("public review projection proves admission binding without exposing private training or casting evidence", () => {
  const scope = monitor();
  const value = createAdmittedChapterNarratorReview({
    ...scope,
    manifest,
    policy,
    review: reviewInput(scope.monitoring),
  });
  const view = admittedChapterNarratorReviewPublicView(
    value,
    { ...scope, manifest, policy },
  );
  assert.equal(view.admissionBound, true);
  assert.equal(view.humanReviewBound, true);
  const serialised = JSON.stringify(view);
  assert.equal(serialised.includes(scope.admittedCasting.profileAdmission.admissionHash), false);
  assert.equal(serialised.includes(scope.admittedCasting.fingerprint), false);
  assert.equal(serialised.includes(scope.admittedCasting.casting.fingerprint), false);
  assert.equal(serialised.includes(scope.admittedCasting.profileAdmission.training?.selectedCheckpointId ?? "never"), false);
  assert.equal(view.publicationAuthority, false);
});
