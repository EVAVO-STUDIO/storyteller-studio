import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  AUDIO_STUDIO_NARRATOR_PROFILE_SCHEMA,
  approveNarratorCasting,
  type AudioStudioNarratorVoiceProfile,
} from "./narrator-voice-profile.js";
import {
  assertNarratorBookMonitoringResult,
  assertNarratorChapterMonitoringResult,
  createNarratorChapterObjectiveObservation,
  createNarratorMonitoringPolicy,
  createNarratorQualityReference,
  monitorNarratorBook,
  monitorNarratorChapter,
  type NarratorChapterObjectiveObservation,
} from "./narrator-book-monitor.js";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      result[key] = canonical((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

function audioStudioHash(value: unknown): string {
  return createHash("sha256")
    .update(`${JSON.stringify(canonical(value))}\n`, "utf8")
    .digest("hex");
}

function profile(): AudioStudioNarratorVoiceProfile {
  const partial = {
    schema: AUDIO_STUDIO_NARRATOR_PROFILE_SCHEMA,
    profileId: "magician-narrator",
    revision: 3,
    voiceIdentityId: "magician-owner-authorised",
    engineKey: "qwen3-tts-1.7b-base-local",
    mode: "adapted" as const,
    modelArtifactTreeSha256: digest("model"),
    decisionHash: digest("decision"),
    holdoutLedgerHash: digest("ledger"),
    finalHoldoutFingerprint: digest("holdout"),
    evidenceHash: digest("evidence"),
    evidence: {
      sourceRightsFingerprint: digest("rights"),
      narratorDatasetFingerprint: digest("dataset"),
      referencePackFingerprint: digest("reference"),
      benchmarkRunHash: digest("benchmark-run"),
      benchmarkCandidateHash: digest("benchmark-candidate"),
      textEvidenceHash: digest("text"),
      speakerIdentityEvidenceHash: digest("speaker"),
      acousticEvidenceHash: digest("acoustic"),
      blindReviewEvidenceHash: digest("blind"),
      renderEngineLockFingerprint: digest("render-lock"),
      trainingEngineLockFingerprint: digest("training-lock"),
    },
    rights: {
      commercialSynthesisAuthorized: true as const,
      sourceRightsFingerprint: digest("rights"),
    },
    quality: {
      shortFormTournamentPassed: true as const,
      continuousHoldoutPassed: true as const,
      humanListeningApproval: true as const,
      chapterListeningApprovalRequired: true as const,
    },
    storyteller: {
      castingEligible: true as const,
      castingApproved: false as const,
      defaultNarrator: false as const,
      exactRevisionRequired: true as const,
    },
    runtimeDownloadsAllowed: false as const,
    titleReleaseAuthority: false as const,
    publicationAuthority: false as const,
  };
  return { ...partial, profileHash: audioStudioHash(partial) };
}

const casting = approveNarratorCasting({
  projectId: "book_001",
  profile: profile(),
  approvedBy: "Greg",
  approvedAt: "2026-08-10T06:30:00+10:00",
});

const acoustic = Object.freeze({
  medianPitchHz: 128,
  pitchRangeSemitones: 9.5,
  speakingRateWpm: 151,
  pauseRatio: 0.18,
  energyRmsDb: -21,
  embeddingDistanceFromAnchor: 0.08,
});

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

const reference = createNarratorQualityReference({
  casting,
  acousticSignature: acoustic,
  expectedChapterDurationSeconds: 1_800,
  roomToneRmsDb: -58,
  evidenceHash: digest("approved-reference"),
});

function observation(
  chapterId: string,
  overrides: Partial<Omit<NarratorChapterObjectiveObservation, "fingerprint">> = {},
) {
  return createNarratorChapterObjectiveObservation({
    projectId: "book_001",
    chapterId,
    castingFingerprint: casting.fingerprint,
    voice: casting.voice,
    renderFingerprint: digest(`render:${chapterId}`),
    sourceFingerprint: digest(`source:${chapterId}`),
    segmentCount: 42,
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
    transcriptEvidenceHash: digest(`transcript:${chapterId}`),
    speakerIdentityEvidenceHash: digest(`speaker:${chapterId}`),
    acousticEvidenceHash: digest(`acoustic:${chapterId}`),
    engineeringEvidenceHash: digest(`engineering:${chapterId}`),
    measuredAt: "2026-08-10T07:00:00+10:00",
    ...overrides,
  });
}

function monitor(chapterId: string, overrides = {}) {
  return monitorNarratorChapter({
    casting,
    policy,
    reference,
    observation: observation(chapterId, overrides),
  });
}

test("clean objective chapter evidence becomes eligible for human review only", () => {
  const result = monitor("chapter_001");
  assert.equal(result.status, "eligible-for-human-review");
  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 0);
  assert.equal(result.humanListeningApproval, false);
  assert.equal(result.titleReleaseAuthority, false);
  assert.equal(result.publicationAuthority, false);
  assert.doesNotThrow(() => assertNarratorChapterMonitoringResult(result, casting));
});

test("transcript loss, clipping and speaker substitution require regeneration", () => {
  const result = monitor("chapter_002", {
    transcriptCoverage: 0.97,
    finalWordPresent: false,
    clippedSampleCount: 4,
    unexpectedSpeakerChangeCount: 1,
    minimumSpeakerIdentitySimilarity: 0.7,
  });
  assert.equal(result.status, "requires-regeneration");
  for (const code of [
    "NARRATOR_MONITOR_TRANSCRIPT_COVERAGE_LOW",
    "NARRATOR_MONITOR_FINAL_WORD_MISSING",
    "NARRATOR_MONITOR_CLIPPING_DETECTED",
    "NARRATOR_MONITOR_UNEXPECTED_SPEAKER_CHANGE",
    "NARRATOR_MONITOR_IDENTITY_SIMILARITY_LOW",
  ]) assert.equal(result.findingCodes.includes(code), true);
});

test("repetitive cadence and sentence endings flag AI-like monotony for human attention", () => {
  const result = monitor("chapter_003", {
    cadenceTemplateSimilarity: 0.91,
    sentenceFinalContourRepetitionRatio: 0.83,
  });
  assert.equal(result.status, "requires-human-attention");
  assert.equal(result.errorCount, 0);
  assert.equal(result.findingCodes.includes("NARRATOR_MONITOR_CADENCE_TEMPLATE_REPETITION_HIGH"), true);
  assert.equal(result.findingCodes.includes("NARRATOR_MONITOR_SENTENCE_FINAL_CONTOUR_REPETITION_HIGH"), true);
});

test("room tone, seams and duration drift remain explicit review evidence", () => {
  const result = monitor("chapter_004", {
    chapterDurationSeconds: 2_200,
    roomToneRmsDb: -48,
    maximumSeamDiscontinuityScore: 0.48,
  });
  assert.equal(result.status, "requires-human-attention");
  assert.equal(result.findingCodes.includes("NARRATOR_MONITOR_ROOM_TONE_DRIFT"), true);
  assert.equal(result.findingCodes.includes("NARRATOR_MONITOR_SEAM_DISCONTINUITY"), true);
  assert.equal(result.findingCodes.includes("NARRATOR_MONITOR_CHAPTER_DURATION_DRIFT"), true);
});

test("large acoustic drift cannot pass as a stable chapter", () => {
  const result = monitor("chapter_005", {
    acousticSignature: {
      medianPitchHz: 220,
      pitchRangeSemitones: 20,
      speakingRateWpm: 260,
      pauseRatio: 0.05,
      energyRmsDb: -10,
      embeddingDistanceFromAnchor: 1.6,
    },
  });
  assert.notEqual(result.status, "eligible-for-human-review");
  assert.equal(
    result.findingCodes.includes("NARRATOR_MONITOR_ACOUSTIC_DRIFT_REJECTED")
      || result.findingCodes.includes("NARRATOR_MONITOR_ACOUSTIC_DRIFT_REVIEW"),
    true,
  );
});

test("chapter evidence cannot be rebound to another casting", () => {
  assert.throws(
    () => monitorNarratorChapter({
      casting,
      policy,
      reference,
      observation: observation("chapter_006", { castingFingerprint: digest("wrong-casting") }),
    }),
    /NARRATOR_MONITOR_CASTING_MISMATCH/u,
  );
});

test("tampered objective and monitoring evidence fail fingerprint validation", () => {
  const observed = observation("chapter_007");
  assert.throws(
    () => createNarratorChapterObjectiveObservation({
      ...observed,
      transcriptCoverage: 1.1,
    }),
    /NARRATOR_MONITOR_TRANSCRIPT_COVERAGE_INVALID/u,
  );
  const result = monitor("chapter_007");
  assert.throws(
    () => assertNarratorChapterMonitoringResult({ ...result, continuityScore: result.continuityScore + 1 }, casting),
    /NARRATOR_MONITOR_CHAPTER_FINGERPRINT_INVALID/u,
  );
});

test("whole-book monitoring requires every expected chapter exactly once", () => {
  const first = monitor("chapter_001");
  const second = monitor("chapter_002");
  assert.throws(
    () => monitorNarratorBook({
      casting,
      expectedChapterIds: ["chapter_001", "chapter_002"],
      chapters: [first],
      assessedAt: "2026-08-10T08:00:00+10:00",
    }),
    /NARRATOR_BOOK_MONITOR_CHAPTER_COUNT_MISMATCH/u,
  );
  assert.throws(
    () => monitorNarratorBook({
      casting,
      expectedChapterIds: ["chapter_001", "chapter_001"],
      chapters: [first, first],
      assessedAt: "2026-08-10T08:00:00+10:00",
    }),
    /NARRATOR_BOOK_MONITOR_CHAPTER_DUPLICATE/u,
  );
  void second;
});

test("a regeneration chapter blocks the whole-book monitoring result", () => {
  const result = monitorNarratorBook({
    casting,
    expectedChapterIds: ["chapter_a", "chapter_b", "chapter_c"],
    chapters: [
      monitor("chapter_a"),
      monitor("chapter_b", { clippedSampleCount: 1 }),
      monitor("chapter_c"),
    ],
    assessedAt: "2026-08-10T08:00:00+10:00",
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.regenerationChapterCount, 1);
  assert.equal(result.titleNarratorApproval, false);
  assert.equal(result.publicationAuthority, false);
  assert.doesNotThrow(() => assertNarratorBookMonitoringResult(result, casting));
});

test("adjacent chapter acoustic drift is measured across the complete ordered book", () => {
  const result = monitorNarratorBook({
    casting,
    expectedChapterIds: ["chapter_a", "chapter_b", "chapter_c"],
    chapters: [
      monitor("chapter_a"),
      monitor("chapter_b", {
        acousticSignature: {
          medianPitchHz: 180,
          pitchRangeSemitones: 15,
          speakingRateWpm: 205,
          pauseRatio: 0.1,
          energyRmsDb: -15,
          embeddingDistanceFromAnchor: 0.8,
        },
      }),
      monitor("chapter_c"),
    ],
    assessedAt: "2026-08-10T08:00:00+10:00",
  });
  assert.equal(result.maximumAdjacentAcousticDrift > 0, true);
  assert.equal(result.status === "blocked" || result.status === "requires-human-attention", true);
});
