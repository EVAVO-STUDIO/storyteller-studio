import assert from "node:assert/strict";
import test from "node:test";
import type { ProjectManifest } from "./index.js";
import { createNarratorProductionJobs } from "./narrator-production-job.js";
import { runNarratorProductionWorker } from "./narrator-production-worker.js";
import {
  createTestAdmittedNarratorCasting,
} from "../test-support/narrator-casting.js";

const sourceHash = "a".repeat(64);
const manifest: ProjectManifest = {
  schemaVersion: "storyteller-project-v1",
  engineVersion: "0.2.0",
  id: "project_worker_casting_001",
  title: "Worker casting",
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

test("narrator worker rejects a changed profile admission before touching provider dependencies", async () => {
  const admittedCasting = createTestAdmittedNarratorCasting(manifest.id);
  const job = createNarratorProductionJobs(manifest, admittedCasting)[0]!;
  const claim = {
    envelope: {} as never,
    item: {
      id: `queue_${job.id}`,
      jobId: job.id,
      projectId: job.projectId,
      segmentId: job.segmentId,
      job,
      status: "leased" as const,
      lease: {
        tokenHash: "0".repeat(64),
        workerId: "worker_narrator_001",
        acquiredAt: "2026-08-10T03:10:00.000Z",
        heartbeatAt: "2026-08-10T03:10:00.000Z",
        expiresAt: "2026-08-10T03:11:00.000Z",
      },
    } as never,
    leaseToken: "x".repeat(43),
  };
  const replacement = createTestAdmittedNarratorCasting(manifest.id, {
    profileRevision: admittedCasting.casting.voice.revision + 1,
    seed: "replacement-worker-casting",
  });
  await assert.rejects(
    runNarratorProductionWorker({
      queue: null as never,
      claim,
      providers: null as never,
      credentials: null as never,
      objectStore: null as never,
      artifactRegistry: null as never,
      material: {
        text: "The room remembered him.",
        immutableSourceHash: sourceHash,
        voiceProfileId: admittedCasting.casting.voice.profileId,
        voiceRevision: admittedCasting.casting.voice.revision,
        voiceProfileHash: admittedCasting.casting.voice.profileHash,
        direction: {
          segmentId: job.segmentId,
          narrativeDistance: "close",
          pace: 0.9,
          intensity: 0.4,
          warmth: 0.5,
          restraint: 0.8,
          clarity: 0.95,
          pauseBeforeMs: 0,
          pauseAfterMs: 0,
          emotionalObjective: "Keep the recollection contained and uneasy.",
          subtext: "The room matters more than the narrator admits.",
          notes: [],
        },
        rights: {
          rightsEvidenceId: "rights_worker_001",
          rightsFingerprint: "9".repeat(64),
          allowedUses: ["audiobook"],
          commercialUseApproved: true,
        },
      },
      workerActorId: "worker_narrator_001",
      admittedCasting: replacement,
    }),
    /NARRATOR_PRODUCTION_PROFILE_ADMISSION_MISMATCH|NARRATOR_PRODUCTION_ADMITTED_CASTING_MISMATCH/u,
  );
});
