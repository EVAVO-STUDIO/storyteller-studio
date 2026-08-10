import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ProjectManifest } from "./index.js";
import { FileGenerationQueue } from "./generation-queue.js";
import {
  assertNarratorProductionClaim,
  enqueueNarratorProduction,
} from "./narrator-production-queue.js";
import { FileProjectStore } from "./project-store.js";
import {
  createTestAdmittedNarratorCasting,
} from "../test-support/narrator-casting.js";

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

test("private narrator queue admission persists only profile-admission-bound production jobs", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-narrator-production-queue-"));
  try {
    const queue = new FileGenerationQueue(new FileProjectStore(root));
    const admittedCasting = createTestAdmittedNarratorCasting(manifest.id);
    const admitted = await enqueueNarratorProduction({
      queue,
      manifest,
      admittedCasting,
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
    assert.doesNotThrow(() => assertNarratorProductionClaim(
      claim,
      admittedCasting,
      {
        mode: "production",
        voiceProfileId: admittedCasting.casting.voice.profileId,
        voiceRevision: admittedCasting.casting.voice.revision,
        voiceProfileHash: admittedCasting.casting.voice.profileHash,
      },
    ));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("claim validation rejects profile-admission substitution after queue admission", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-narrator-production-queue-drift-"));
  try {
    const queue = new FileGenerationQueue(new FileProjectStore(root));
    const admittedCasting = createTestAdmittedNarratorCasting(manifest.id);
    await enqueueNarratorProduction({ queue, manifest, admittedCasting });
    const claim = await queue.claimNext({ workerId: "worker_narrator_001" });
    assert.ok(claim);
    const replacement = createTestAdmittedNarratorCasting(manifest.id, {
      seed: "replacement",
      profileRevision: admittedCasting.casting.voice.revision + 1,
    });
    assert.throws(() => assertNarratorProductionClaim(claim, replacement, {
      mode: "production",
      voiceProfileId: replacement.casting.voice.profileId,
      voiceRevision: replacement.casting.voice.revision,
      voiceProfileHash: replacement.casting.voice.profileHash,
    }), /NARRATOR_PRODUCTION_PROFILE_ADMISSION_MISMATCH|NARRATOR_PRODUCTION_ADMITTED_CASTING_MISMATCH/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
