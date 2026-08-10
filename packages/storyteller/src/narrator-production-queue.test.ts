import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { stableHash, type ProjectManifest } from "./index.js";
import { FileGenerationQueue } from "./generation-queue.js";
import {
  assertNarratorProductionClaim,
  enqueueNarratorProduction,
} from "./narrator-production-queue.js";
import type { NarratorCastingApproval } from "./narrator-voice-profile.js";
import { FileProjectStore } from "./project-store.js";

const sourceHash = "a".repeat(64);
const manifest: ProjectManifest = {
  schemaVersion: "storyteller-project-v1",
  engineVersion: "0.2.0",
  id: "project_queue_casting_001",
  title: "Queue casting",
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
  performance: { manuscriptHash: sourceHash, directions: [], calibrationSegmentIds: [] },
  providers: [{ providerId: "audio_studio_local", label: "EVAVO Audio Studio", eligible: true, score: 100, reasons: [] }],
  visualBeats: [],
  fingerprint: "b".repeat(64),
  findings: [],
};

function casting(): NarratorCastingApproval {
  const base = {
    schemaVersion: "storyteller-narrator-casting-v1" as const,
    projectId: manifest.id,
    voice: { profileId: "magician_narrator", revision: 7, profileHash: "c".repeat(64) },
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
  };
  return { ...base, fingerprint: stableHash(base) };
}

test("private narrator queue admission persists only casting-bound production jobs", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-narrator-production-queue-"));
  try {
    const queue = new FileGenerationQueue(new FileProjectStore(root));
    const approved = casting();
    const admitted = await enqueueNarratorProduction({
      queue,
      manifest,
      casting: approved,
      candidateCount: 3,
      options: { now: new Date("2026-08-10T03:10:00.000Z") },
    });
    assert.equal(admitted.length, 1);
    assert.equal(admitted[0]!.payload.status, "queued");
    const claim = await queue.claimNext({
      workerId: "worker_narrator_001",
      now: new Date("2026-08-10T03:10:01.000Z"),
    });
    assert.ok(claim);
    assert.doesNotThrow(() => assertNarratorProductionClaim(claim, approved, {
      mode: "production",
      voiceProfileId: approved.voice.profileId,
      voiceRevision: approved.voice.revision,
      voiceProfileHash: approved.voice.profileHash,
    }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("claim validation rejects profile substitution after queue admission", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-narrator-production-queue-drift-"));
  try {
    const queue = new FileGenerationQueue(new FileProjectStore(root));
    const approved = casting();
    await enqueueNarratorProduction({ queue, manifest, casting: approved });
    const claim = await queue.claimNext({ workerId: "worker_narrator_001" });
    assert.ok(claim);
    assert.throws(() => assertNarratorProductionClaim(claim, approved, {
      mode: "production",
      voiceProfileId: approved.voice.profileId,
      voiceRevision: approved.voice.revision,
      voiceProfileHash: "1".repeat(64),
    }), /NARRATOR_PROFILE_PIN_MISMATCH/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
