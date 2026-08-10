import assert from "node:assert/strict";
import test from "node:test";
import { stableHash } from "./index.js";
import { createNarratorProductionJobs } from "./narrator-production-job.js";
import { runNarratorProductionWorker } from "./narrator-production-worker.js";
import type { NarratorCastingApproval } from "./narrator-voice-profile.js";
import type { ProjectManifest } from "./index.js";

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

function casting(profileHash = "c".repeat(64)): NarratorCastingApproval {
  const base = {
    schemaVersion: "storyteller-narrator-casting-v1" as const,
    projectId: manifest.id,
    voice: { profileId: "magician_narrator", revision: 7, profileHash },
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

test("narrator worker rejects a changed casting before touching provider dependencies", async () => {
  const approved = casting();
  const job = createNarratorProductionJobs(manifest, approved)[0]!;
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
        voiceProfileId: approved.voice.profileId,
        voiceRevision: approved.voice.revision,
        voiceProfileHash: approved.voice.profileHash,
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
      casting: casting("1".repeat(64)),
    }),
    /NARRATOR_PRODUCTION_CASTING_MISMATCH|NARRATOR_PROFILE_PIN_MISMATCH/u,
  );
});
