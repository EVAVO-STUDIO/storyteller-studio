import assert from "node:assert/strict";
import test from "node:test";
import {
  stableHash,
  type ProjectManifest,
} from "./index.js";
import {
  assertPinnedProductionMaterial,
  createNarratorProductionJobs,
  narratorProductionBinding,
} from "./narrator-production-job.js";
import type { NarratorCastingApproval } from "./narrator-voice-profile.js";

const sourceHash = "a".repeat(64);

const manifest: ProjectManifest = {
  schemaVersion: "storyteller-project-v1",
  engineVersion: "0.2.0",
  id: "project_casting_001",
  title: "Casting-bound narration",
  sourceHash,
  createdAt: "2026-08-10T03:00:00.000Z",
  status: "planned",
  rights: { ok: true, findings: [] },
  manuscript: {
    sourceHash,
    characterCount: 24,
    wordCount: 4,
    chapters: [{ id: "chapter_001", ordinal: 1, title: "Chapter One", sourceStart: 0 }],
    segments: [{
      id: "segment_001",
      sourceHash,
      chapterId: "chapter_001",
      chapterOrdinal: 1,
      chapterTitle: "Chapter One",
      ordinal: 1,
      kind: "narration",
      sourceStart: 0,
      sourceEnd: 24,
      text: "The room remembered him.",
      wordCount: 4,
      estimatedSpeechSeconds: 1.5,
    }],
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
  fingerprint: "b".repeat(64),
  findings: [],
};

function casting(overrides: Partial<NarratorCastingApproval> = {}): NarratorCastingApproval {
  const partial = {
    schemaVersion: "storyteller-narrator-casting-v1" as const,
    projectId: manifest.id,
    voice: {
      profileId: "magician_narrator",
      revision: 7,
      profileHash: "c".repeat(64),
    },
    voiceIdentityId: "magician_narrator_identity",
    engineKey: "qwen3_tts_local",
    mode: "adapted" as const,
    modelArtifactTreeSha256: "d".repeat(64),
    sourceRightsFingerprint: "e".repeat(64),
    evidenceHash: "f".repeat(64),
    approvedBy: "storyteller_casting_editor",
    approvedAt: "2026-08-10T03:05:00.000Z",
    castingApproved: true as const,
    exactRevisionRequired: true as const,
    chapterListeningApprovalRequired: true as const,
    defaultNarrator: false as const,
    titleReleaseAuthority: false as const,
    publicationAuthority: false as const,
    ...overrides,
  };
  const { fingerprint: _ignored, ...base } = partial as NarratorCastingApproval;
  return {
    ...base,
    fingerprint: stableHash(base),
  };
}

test("narrator production jobs bind exact casting and voice into deterministic identity", () => {
  const approved = casting();
  const first = createNarratorProductionJobs(manifest, approved, 3);
  const second = createNarratorProductionJobs(manifest, approved, 3);
  assert.deepEqual(first, second);
  assert.equal(first.length, 1);
  const job = first[0]!;
  const binding = narratorProductionBinding(job);
  assert.ok(binding);
  assert.equal(binding.castingFingerprint, approved.fingerprint);
  assert.deepEqual(binding.voice, approved.voice);
  assert.equal(job.candidateCount, 3);
  assert.equal(job.status, "ready");
});

test("casting changes produce different production job and cache identities", () => {
  const firstCasting = casting();
  const secondCasting = casting({
    voice: {
      profileId: "magician_narrator",
      revision: 8,
      profileHash: "1".repeat(64),
    },
  });
  const first = createNarratorProductionJobs(manifest, firstCasting)[0]!;
  const second = createNarratorProductionJobs(manifest, secondCasting)[0]!;
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.cacheKey, second.cacheKey);
  assert.notEqual(first.narratorCastingFingerprint, second.narratorCastingFingerprint);
});

test("production material must match the exact casting-bound narrator profile", () => {
  const approved = casting();
  const job = createNarratorProductionJobs(manifest, approved)[0]!;
  assert.doesNotThrow(() => assertPinnedProductionMaterial(job, {
    mode: "production",
    voiceProfileId: approved.voice.profileId,
    voiceRevision: approved.voice.revision,
    voiceProfileHash: approved.voice.profileHash,
  }));
  assert.throws(() => assertPinnedProductionMaterial(job, {
    mode: "production",
    voiceProfileId: approved.voice.profileId,
    voiceRevision: approved.voice.revision + 1,
    voiceProfileHash: approved.voice.profileHash,
  }), /NARRATOR_PROFILE_PIN_MISMATCH/u);
  assert.throws(() => assertPinnedProductionMaterial(job, {
    mode: "production",
    voiceProfileId: approved.voice.profileId,
    voiceRevision: approved.voice.revision,
  }), /NARRATOR_PRODUCTION_PROFILE_HASH_REQUIRED/u);
});

test("a pinned production profile cannot execute on an uncast generic job", () => {
  const generic = {
    id: "job_generic_001",
    projectId: manifest.id,
    segmentId: "segment_001",
    providerFallbackIds: ["audio_studio_local"],
    cacheKey: "2".repeat(64),
    candidateCount: 3,
    status: "ready" as const,
  };
  assert.throws(() => assertPinnedProductionMaterial(generic, {
    mode: "production",
    voiceProfileId: "magician_narrator",
    voiceRevision: 7,
    voiceProfileHash: "c".repeat(64),
  }), /NARRATOR_PRODUCTION_CASTING_REQUIRED/u);
  assert.doesNotThrow(() => assertPinnedProductionMaterial(generic, {
    mode: "preview",
    voiceProfileId: "magician_narrator",
    voiceRevision: 7,
    voiceProfileHash: "c".repeat(64),
  }));
});
