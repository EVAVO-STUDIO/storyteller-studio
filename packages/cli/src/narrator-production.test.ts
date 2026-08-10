import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ProjectManifest } from "@evavo/storyteller-engine";
import {
  assertAdmittedNarratorCasting,
  type AdmittedNarratorCasting,
} from "@evavo/storyteller-engine/narrator-casting-admission";
import {
  createTestAdmittedNarratorCasting,
  createTestNarratorProfileAdmission,
} from "../../storyteller/test-support/narrator-casting.js";
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

async function fixture(
  run: (paths: {
    project: string;
    admission: string;
    castingAdmission: string;
    data: string;
  }) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-narrator-cli-"));
  try {
    const projectPath = join(root, "project.json");
    const admissionPath = join(root, "profile-admission.json");
    const castingAdmissionPath = join(root, "casting-admission.json");
    await writeFile(projectPath, JSON.stringify(project()), "utf8");
    await writeFile(
      admissionPath,
      JSON.stringify(createTestNarratorProfileAdmission()),
      "utf8",
    );
    await writeFile(
      castingAdmissionPath,
      JSON.stringify(createTestAdmittedNarratorCasting(project().id)),
      "utf8",
    );
    await run({
      project: projectPath,
      admission: admissionPath,
      castingAdmission: castingAdmissionPath,
      data: join(root, "data"),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("narrator cast command creates one exact admission-bound human casting document", async () => {
  await fixture(async (paths) => {
    const result = await executeNarratorProductionCommand({
      command: "cast",
      admissionPath: paths.admission,
      projectId: project().id,
      approvedBy: "Greg",
      approvedAt: "2026-08-10T18:45:00+10:00",
    }) as AdmittedNarratorCasting;
    assert.doesNotThrow(() => assertAdmittedNarratorCasting(result));
    assert.equal(result.projectId, project().id);
    assert.equal(result.profileAdmission.admissionHash, createTestNarratorProfileAdmission().admissionHash);
    assert.equal(result.casting.approvedBy, "Greg");
    assert.equal(result.publicationAuthority, false);
  });
});

test("narrator production jobs command requires and preserves exact casting admission", async () => {
  await fixture(async (paths) => {
    const admittedCasting = createTestAdmittedNarratorCasting(project().id);
    const result = await executeNarratorProductionCommand({
      command: "jobs",
      projectPath: paths.project,
      castingAdmissionPath: paths.castingAdmission,
      candidateCount: 3,
    }) as Array<Record<string, unknown>>;
    assert.equal(result.length, 1);
    assert.equal(
      result[0]?.narratorProfileAdmissionHash,
      admittedCasting.profileAdmission.admissionHash,
    );
    assert.equal(
      result[0]?.narratorAdmittedCastingFingerprint,
      admittedCasting.fingerprint,
    );
    assert.equal(
      result[0]?.narratorCastingFingerprint,
      admittedCasting.casting.fingerprint,
    );
    assert.deepEqual(result[0]?.narratorVoice, admittedCasting.casting.voice);
  });
});

test("narrator production queue admits profile-admission-bound jobs without exposing identity", async () => {
  await fixture(async (paths) => {
    const admittedCasting = createTestAdmittedNarratorCasting(project().id);
    const result = await executeNarratorProductionCommand({
      command: "queue",
      projectPath: paths.project,
      castingAdmissionPath: paths.castingAdmission,
      candidateCount: 3,
      dataDirectory: paths.data,
    }) as Array<Record<string, unknown>>;
    assert.equal(result.length, 1);
    assert.equal(result[0]?.status, "queued");
    const serialised = JSON.stringify(result);
    assert.equal(serialised.includes(admittedCasting.casting.voice.profileId), false);
    assert.equal(serialised.includes(admittedCasting.casting.voice.profileHash), false);
    assert.equal(serialised.includes(admittedCasting.casting.fingerprint), false);
    assert.equal(serialised.includes(admittedCasting.fingerprint), false);
    assert.equal(serialised.includes(admittedCasting.profileAdmission.admissionHash), false);
  });
});

test("narrator production CLI rejects a legacy standalone casting document", async () => {
  await fixture(async (paths) => {
    const admittedCasting = createTestAdmittedNarratorCasting(project().id);
    await writeFile(
      paths.castingAdmission,
      JSON.stringify(admittedCasting.casting),
      "utf8",
    );
    await assert.rejects(
      executeNarratorProductionCommand({
        command: "jobs",
        projectPath: paths.project,
        castingAdmissionPath: paths.castingAdmission,
        candidateCount: 3,
      }),
      /NARRATOR_CASTING_ADMISSION_SHAPE_INVALID/u,
    );
  });
});
