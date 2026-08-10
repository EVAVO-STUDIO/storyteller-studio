import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createNarratorChapterObjectiveObservation,
  createNarratorMonitoringPolicy,
  createNarratorQualityReference,
  monitorNarratorChapter,
  type NarratorChapterMonitoringResult,
  type NarratorChapterObjectiveObservation,
} from "./narrator-book-monitor.js";
import {
  AUDIO_STUDIO_NARRATOR_PROFILE_SCHEMA,
  approveNarratorCasting,
  approveTitleNarrator,
  assertAudioStudioNarratorVoiceProfile,
  assertChapterNarratorReview,
  assertExactNarratorVoicePin,
  assertNarratorCasting,
  assertTitleNarratorApproval,
  createChapterNarratorReview,
  pinNarratorVoiceProfile,
  type AudioStudioNarratorVoiceProfile,
  type ChapterNarratorReviewInput,
  type NarratorCastingApproval,
} from "./narrator-voice-profile.js";

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

function profile(mode: "zero-shot" | "adapted" = "adapted"): AudioStudioNarratorVoiceProfile {
  const partial = {
    schema: AUDIO_STUDIO_NARRATOR_PROFILE_SCHEMA,
    profileId: "magician-narrator",
    revision: 3,
    voiceIdentityId: "magician-owner-authorised",
    engineKey: "qwen3-tts-1.7b-base-local",
    mode,
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
      trainingEngineLockFingerprint: mode === "adapted" ? digest("training-lock") : null,
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
  return {
    ...partial,
    profileHash: audioStudioHash(partial),
  };
}

const acoustic = Object.freeze({
  medianPitchHz: 128,
  pitchRangeSemitones: 9.5,
  speakingRateWpm: 151,
  pauseRatio: 0.18,
  energyRmsDb: -21,
  embeddingDistanceFromAnchor: 0.08,
});

function objectiveMonitoring(
  chapterId: string,
  casting: NarratorCastingApproval,
  renderFingerprint: string,
  overrides: Partial<Omit<NarratorChapterObjectiveObservation, "fingerprint">> = {},
): NarratorChapterMonitoringResult {
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
  const observation = createNarratorChapterObjectiveObservation({
    projectId: casting.projectId,
    chapterId,
    castingFingerprint: casting.fingerprint,
    voice: casting.voice,
    renderFingerprint,
    sourceFingerprint: digest(`source:${chapterId}`),
    segmentCount: 20,
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
    measuredAt: "2026-08-10T06:55:00+10:00",
    ...overrides,
  });
  return monitorNarratorChapter({ casting, policy, reference, observation });
}

function chapterInput(
  chapterId: string,
  casting: NarratorCastingApproval,
  overrides: Partial<ChapterNarratorReviewInput> = {},
): ChapterNarratorReviewInput {
  const renderFingerprint = overrides.renderFingerprint ?? digest(`render:${chapterId}`);
  const monitoring = overrides.objectiveMonitoring
    ?? objectiveMonitoring(chapterId, casting, renderFingerprint);
  return {
    projectId: "book_001",
    chapterId,
    casting,
    renderFingerprint,
    objectiveMonitoring: monitoring,
    objectiveFindingAcknowledgements:
      overrides.objectiveFindingAcknowledgements ?? monitoring.findingCodes,
    expectedSegmentCount: 20,
    renderedSegmentCount: 20,
    transcriptErrorCount: 0,
    finalWordPresent: true,
    clippedSampleCount: 0,
    performanceScore: 4.6,
    continuityScore: 4.5,
    listeningEaseScore: 4.4,
    identityStabilityScore: 4.7,
    syntheticArtifactFlags: [],
    fatigueFlags: [],
    reviewerIds: ["reviewer-a", "reviewer-b", "reviewer-c"],
    reviewedAt: "2026-08-10T07:10:00+10:00",
    ...overrides,
  };
}

function casting(): NarratorCastingApproval {
  return approveNarratorCasting({
    projectId: "book_001",
    profile: profile(),
    approvedBy: "Greg",
    approvedAt: "2026-08-10T06:30:00+10:00",
  });
}

test("pins exact Audio Studio profile id, revision and hash", () => {
  const value = profile();
  assertAudioStudioNarratorVoiceProfile(value);
  assert.deepEqual(pinNarratorVoiceProfile(value), {
    profileId: "magician-narrator",
    revision: 3,
    profileHash: value.profileHash,
  });
});

test("rejects profile hash drift and mutable aliases", () => {
  const value = profile();
  assert.throws(
    () => assertAudioStudioNarratorVoiceProfile({ ...value, revision: 4 }),
    /NARRATOR_PROFILE_HASH_MISMATCH/u,
  );
  const latest = { ...value, profileId: "latest" };
  latest.profileHash = audioStudioHash({ ...latest, profileHash: undefined });
  assert.throws(
    () => assertAudioStudioNarratorVoiceProfile(latest),
    /NARRATOR_PROFILE_ID_INVALID/u,
  );
});

test("explicit casting remains non-default and non-publishing", () => {
  const value = casting();
  assertNarratorCasting(value);
  assert.equal(value.castingApproved, true);
  assert.equal(value.defaultNarrator, false);
  assert.equal(value.titleReleaseAuthority, false);
  assert.equal(value.publicationAuthority, false);
  assert.throws(
    () => assertExactNarratorVoicePin(value.voice, { ...value.voice, revision: 4 }),
    /NARRATOR_PROFILE_PIN_MISMATCH/u,
  );
});

test("chapter approval rejects fatigue, drift and transcript faults", () => {
  const value = casting();
  assert.throws(
    () => createChapterNarratorReview(chapterInput("chapter_1", value, { fatigueFlags: ["repetitive-cadence"] })),
    /CHAPTER_NARRATOR_FATIGUE_REPORTED/u,
  );
  assert.throws(
    () => createChapterNarratorReview(chapterInput("chapter_1", value, { continuityScore: 3.9 })),
    /CHAPTER_NARRATOR_SCORE_BELOW_THRESHOLD/u,
  );
  assert.throws(
    () => createChapterNarratorReview(chapterInput("chapter_1", value, { transcriptErrorCount: 1 })),
    /CHAPTER_NARRATOR_TRANSCRIPT_ERROR/u,
  );
});

test("human review is bound to the exact monitored project, chapter and render", () => {
  const value = casting();
  const originalRender = digest("render:chapter_1");
  const monitoring = objectiveMonitoring("chapter_1", value, originalRender);
  assert.throws(
    () => createChapterNarratorReview(chapterInput("chapter_1", value, {
      renderFingerprint: digest("render:replacement"),
      objectiveMonitoring: monitoring,
    })),
    /CHAPTER_NARRATOR_MONITOR_RENDER_MISMATCH/u,
  );
  assert.throws(
    () => createChapterNarratorReview(chapterInput("chapter_2", value, {
      renderFingerprint: originalRender,
      objectiveMonitoring: monitoring,
    })),
    /CHAPTER_NARRATOR_MONITOR_CHAPTER_MISMATCH/u,
  );
});

test("regeneration-required objective monitoring cannot be human-approved", () => {
  const value = casting();
  const renderFingerprint = digest("render:chapter_bad");
  const monitoring = objectiveMonitoring("chapter_bad", value, renderFingerprint, {
    clippedSampleCount: 2,
  });
  assert.equal(monitoring.status, "requires-regeneration");
  assert.throws(
    () => createChapterNarratorReview(chapterInput("chapter_bad", value, {
      renderFingerprint,
      objectiveMonitoring: monitoring,
    })),
    /CHAPTER_NARRATOR_MONITOR_REGENERATION_REQUIRED/u,
  );
});

test("objective warnings require exact human acknowledgement", () => {
  const value = casting();
  const renderFingerprint = digest("render:chapter_attention");
  const monitoring = objectiveMonitoring("chapter_attention", value, renderFingerprint, {
    cadenceTemplateSimilarity: 0.91,
    sentenceFinalContourRepetitionRatio: 0.83,
  });
  assert.equal(monitoring.status, "requires-human-attention");
  const review = createChapterNarratorReview(chapterInput("chapter_attention", value, {
    renderFingerprint,
    objectiveMonitoring: monitoring,
    objectiveFindingAcknowledgements: monitoring.findingCodes,
  }));
  assert.equal(review.objectiveMonitoringStatus, "requires-human-attention");
  assert.deepEqual(review.objectiveFindingAcknowledgements, monitoring.findingCodes);
  assert.throws(
    () => createChapterNarratorReview(chapterInput("chapter_attention", value, {
      renderFingerprint,
      objectiveMonitoring: monitoring,
      objectiveFindingAcknowledgements: [],
    })),
    /CHAPTER_NARRATOR_MONITOR_FINDINGS_UNACKNOWLEDGED/u,
  );
});

test("monitor evidence cannot be altered or reviewed before it existed", () => {
  const value = casting();
  const renderFingerprint = digest("render:chapter_3");
  const monitoring = objectiveMonitoring("chapter_3", value, renderFingerprint);
  assert.throws(
    () => createChapterNarratorReview(chapterInput("chapter_3", value, {
      renderFingerprint,
      objectiveMonitoring: { ...monitoring, sourceFingerprint: digest("other-source") },
    })),
    /CHAPTER_NARRATOR_MONITOR_FINGERPRINT_INVALID/u,
  );
  assert.throws(
    () => createChapterNarratorReview(chapterInput("chapter_3", value, {
      renderFingerprint,
      objectiveMonitoring: monitoring,
      reviewedAt: "2026-08-10T06:50:00+10:00",
    })),
    /CHAPTER_NARRATOR_REVIEW_PRECEDES_MONITORING/u,
  );
});

test("chapter review fingerprint seals its monitoring evidence", () => {
  const value = casting();
  const review = createChapterNarratorReview(chapterInput("chapter_4", value));
  assert.doesNotThrow(() => assertChapterNarratorReview(review, value));
  assert.throws(
    () => assertChapterNarratorReview({
      ...review,
      objectiveMonitoringFingerprint: digest("other-monitor"),
    }, value),
    /CHAPTER_NARRATOR_REVIEW_FINGERPRINT_INVALID/u,
  );
});

test("title narrator requires a monitored approved review for every chapter", () => {
  const value = casting();
  const first = createChapterNarratorReview(chapterInput("chapter_1", value));
  const second = createChapterNarratorReview(chapterInput("chapter_2", value));
  const approval = approveTitleNarrator({
    projectId: "book_001",
    casting: value,
    expectedChapterIds: ["chapter_1", "chapter_2"],
    chapterReviews: [first, second],
    approvedAt: "2026-08-10T07:30:00+10:00",
  });
  assertTitleNarratorApproval(approval, value);
  assert.equal(approval.titleNarratorApproved, true);
  assert.equal(approval.titleReleaseAuthority, false);
  assert.equal(approval.publicationAuthority, false);

  assert.throws(
    () => approveTitleNarrator({
      projectId: "book_001",
      casting: value,
      expectedChapterIds: ["chapter_1", "chapter_2", "chapter_3"],
      chapterReviews: [first, second],
      approvedAt: "2026-08-10T07:30:00+10:00",
    }),
    /TITLE_NARRATOR_REVIEW_COUNT_MISMATCH/u,
  );
});
