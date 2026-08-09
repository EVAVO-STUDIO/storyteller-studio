import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  AUDIO_STUDIO_NARRATOR_PROFILE_SCHEMA,
  approveNarratorCasting,
  approveTitleNarrator,
  assertAudioStudioNarratorVoiceProfile,
  assertExactNarratorVoicePin,
  assertNarratorCasting,
  assertTitleNarratorApproval,
  createChapterNarratorReview,
  pinNarratorVoiceProfile,
  type AudioStudioNarratorVoiceProfile,
  type ChapterNarratorReviewInput,
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

function chapterInput(
  chapterId: string,
  casting: ReturnType<typeof approveNarratorCasting>,
  overrides: Partial<ChapterNarratorReviewInput> = {},
): ChapterNarratorReviewInput {
  return {
    projectId: "book_001",
    chapterId,
    casting,
    renderFingerprint: digest(`render:${chapterId}`),
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
    reviewedAt: "2026-08-10T06:40:00+10:00",
    ...overrides,
  };
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
  const value = profile();
  const casting = approveNarratorCasting({
    projectId: "book_001",
    profile: value,
    approvedBy: "Greg",
    approvedAt: "2026-08-10T06:30:00+10:00",
  });
  assertNarratorCasting(casting);
  assert.equal(casting.castingApproved, true);
  assert.equal(casting.defaultNarrator, false);
  assert.equal(casting.titleReleaseAuthority, false);
  assert.equal(casting.publicationAuthority, false);
  assert.throws(
    () => assertExactNarratorVoicePin(casting.voice, { ...casting.voice, revision: 4 }),
    /NARRATOR_PROFILE_PIN_MISMATCH/u,
  );
});

test("chapter approval rejects fatigue, drift and transcript faults", () => {
  const casting = approveNarratorCasting({
    projectId: "book_001",
    profile: profile(),
    approvedBy: "Greg",
    approvedAt: "2026-08-10T06:30:00+10:00",
  });
  assert.throws(
    () => createChapterNarratorReview(chapterInput("chapter_1", casting, { fatigueFlags: ["repetitive-cadence"] })),
    /CHAPTER_NARRATOR_FATIGUE_REPORTED/u,
  );
  assert.throws(
    () => createChapterNarratorReview(chapterInput("chapter_1", casting, { continuityScore: 3.9 })),
    /CHAPTER_NARRATOR_SCORE_BELOW_THRESHOLD/u,
  );
  assert.throws(
    () => createChapterNarratorReview(chapterInput("chapter_1", casting, { transcriptErrorCount: 1 })),
    /CHAPTER_NARRATOR_TRANSCRIPT_ERROR/u,
  );
});

test("title narrator requires an approved review for every chapter", () => {
  const casting = approveNarratorCasting({
    projectId: "book_001",
    profile: profile(),
    approvedBy: "Greg",
    approvedAt: "2026-08-10T06:30:00+10:00",
  });
  const first = createChapterNarratorReview(chapterInput("chapter_1", casting));
  const second = createChapterNarratorReview(chapterInput("chapter_2", casting));
  const approval = approveTitleNarrator({
    projectId: "book_001",
    casting,
    expectedChapterIds: ["chapter_1", "chapter_2"],
    chapterReviews: [first, second],
    approvedAt: "2026-08-10T06:50:00+10:00",
  });
  assertTitleNarratorApproval(approval, casting);
  assert.equal(approval.titleNarratorApproved, true);
  assert.equal(approval.titleReleaseAuthority, false);
  assert.equal(approval.publicationAuthority, false);

  assert.throws(
    () => approveTitleNarrator({
      projectId: "book_001",
      casting,
      expectedChapterIds: ["chapter_1", "chapter_2", "chapter_3"],
      chapterReviews: [first, second],
      approvedAt: "2026-08-10T06:50:00+10:00",
    }),
    /TITLE_NARRATOR_REVIEW_COUNT_MISMATCH/u,
  );
});
