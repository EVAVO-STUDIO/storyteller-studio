import assert from "node:assert/strict";
import test from "node:test";
import type { ProjectManifest } from "./index.js";
import {
  assertPinnedProductionMaterial,
  createNarratorProductionJobs,
  narratorProductionBinding,
} from "./narrator-production-job.js";
import type { AdmittedNarratorCasting } from "./narrator-casting-admission.js";
import {
  createTestAdmittedNarratorCasting,
} from "../test-support/narrator-casting.js";

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

function admitted(
  options: Readonly<{ profileRevision?: number; seed?: string }> = {},
): AdmittedNarratorCasting {
  return createTestAdmittedNarratorCasting(manifest.id, options);
}

test("narrator production jobs bind exact admission, casting and voice into deterministic identity", () => {
  const approved = admitted();
  const first = createNarratorProductionJobs(manifest, approved, 3);
  const second = createNarratorProductionJobs(manifest, approved, 3);
  assert.deepEqual(first, second);
  assert.equal(first.length, 1);
  const job = first[0]!;
  const binding = narratorProductionBinding(job);
  assert.ok(binding);
  assert.equal(
    binding.profileAdmissionHash,
    approved.profileAdmission.admissionHash,
  );
  assert.equal(binding.admittedCastingFingerprint, approved.fingerprint);
  assert.equal(binding.castingFingerprint, approved.casting.fingerprint);
  assert.deepEqual(binding.voice, approved.casting.voice);
  assert.equal(job.candidateCount, 3);
  assert.equal(job.status, "ready");
});

test("admission or casting changes produce different production job and cache identities", () => {
  const firstCasting = admitted();
  const secondCasting = admitted({
    profileRevision: firstCasting.casting.voice.revision + 1,
    seed: "second-casting",
  });
  const first = createNarratorProductionJobs(manifest, firstCasting)[0]!;
  const second = createNarratorProductionJobs(manifest, secondCasting)[0]!;
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.cacheKey, second.cacheKey);
  assert.notEqual(
    first.narratorProfileAdmissionHash,
    second.narratorProfileAdmissionHash,
  );
  assert.notEqual(
    first.narratorAdmittedCastingFingerprint,
    second.narratorAdmittedCastingFingerprint,
  );
  assert.notEqual(
    first.narratorCastingFingerprint,
    second.narratorCastingFingerprint,
  );
});

test("production material must match the exact admission-bound narrator profile", () => {
  const approved = admitted();
  const job = createNarratorProductionJobs(manifest, approved)[0]!;
  assert.doesNotThrow(() => assertPinnedProductionMaterial(job, {
    mode: "production",
    voiceProfileId: approved.casting.voice.profileId,
    voiceRevision: approved.casting.voice.revision,
    voiceProfileHash: approved.casting.voice.profileHash,
  }));
  assert.throws(() => assertPinnedProductionMaterial(job, {
    mode: "production",
    voiceProfileId: approved.casting.voice.profileId,
    voiceRevision: approved.casting.voice.revision + 1,
    voiceProfileHash: approved.casting.voice.profileHash,
  }), /NARRATOR_PROFILE_PIN_MISMATCH/u);
  assert.throws(() => assertPinnedProductionMaterial(job, {
    mode: "production",
    voiceProfileId: approved.casting.voice.profileId,
    voiceRevision: approved.casting.voice.revision,
  }), /NARRATOR_PRODUCTION_PROFILE_HASH_REQUIRED/u);
});

test("a standalone casting approval cannot create narrator production jobs", () => {
  const approved = admitted();
  assert.throws(
    () => createNarratorProductionJobs(
      manifest,
      approved.casting as unknown as AdmittedNarratorCasting,
    ),
    /NARRATOR_CASTING_ADMISSION_SHAPE_INVALID/u,
  );
});

test("a pinned production profile cannot execute on an unadmitted generic job", () => {
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
    voiceProfileId: "magician-narrator",
    voiceRevision: 4,
    voiceProfileHash: "c".repeat(64),
  }), /NARRATOR_PRODUCTION_CASTING_ADMISSION_REQUIRED/u);
  assert.doesNotThrow(() => assertPinnedProductionMaterial(generic, {
    mode: "preview",
    voiceProfileId: "magician-narrator",
    voiceRevision: 4,
    voiceProfileHash: "c".repeat(64),
  }));
});
