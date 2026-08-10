import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { stableHash, type ProjectManifest } from "@evavo/storyteller-engine";
import type { NarratorCastingApproval } from "@evavo/storyteller-engine/narrator-voice-profile";
import { executeNarratorProductionCommand } from "./narrator-production.js";

const sourceHash = "a".repeat(64);

function project(): ProjectManifest {
  return {
    schemaVersion: "storyteller-project-v1",
    engineVersion: "0.2.0",
    id: "project_cli_casting_001",
    title: "CLI casting",
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
}

function casting(): NarratorCastingApproval {
  const base = {
    schemaVersion: "storyteller-narrator-casting-v1" as const,
    projectId: "project_cli_casting_001",
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

async function fixture(run: (paths: { project: string; casting: string; data: string }) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-narrator-cli-"));
  try {
    const projectPath = join(root, "project.json");
    const castingPath = join(root, "casting.json");
    await writeFile(projectPath, JSON.stringify(project()), "utf8");
    await writeFile(castingPath, JSON.stringify(casting()), "utf8");
    await run({ project: projectPath, casting: castingPath, data: join(root, "data") });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("narrator production jobs command requires and preserves exact casting", async () => {
  await fixture(async (paths) => {
    const result = await executeNarratorProductionCommand({
      command: "jobs",
      projectPath: paths.project,
      castingPath: paths.casting,
      candidateCount: 3,
    }) as Array<Record<string, unknown>>;
    assert.equal(result.length, 1);
    assert.equal(result[0]?.narratorCastingFingerprint, casting().fingerprint);
    assert.deepEqual(result[0]?.narratorVoice, casting().voice);
  });
});

test("narrator production queue command admits casting-bound jobs without exposing the voice pin", async () => {
  await fixture(async (paths) => {
    const result = await executeNarratorProductionCommand({
      command: "queue",
      projectPath: paths.project,
      castingPath: paths.casting,
      candidateCount: 3,
      dataDirectory: paths.data,
    }) as Array<Record<string, unknown>>;
    assert.equal(result.length, 1);
    assert.equal(result[0]?.status, "queued");
    const serialised = JSON.stringify(result);
    assert.equal(serialised.includes("magician_narrator"), false);
    assert.equal(serialised.includes(casting().voice.profileHash), false);
    assert.equal(serialised.includes(casting().fingerprint), false);
  });
});
