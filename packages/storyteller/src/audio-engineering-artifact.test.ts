import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  audioEngineeringArtifactPublicView,
  ingestAudioEngineeringArtifact,
} from "./audio-engineering-artifact.js";
import {
  AudioEngineeringError,
  type AudioEngineeringCommand,
  type AudioEngineeringCommandResult,
  type AudioEngineeringRunner,
} from "./audio-engineering.js";
import { FileArtifactRegistry } from "./artifact-store.js";
import { ACX_AUDIOBOOK_PROFILE } from "./index.js";
import { FilePrivateObjectStore } from "./private-object-store.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const wavBytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46,
  0x04, 0x00, 0x00, 0x00,
  0x57, 0x41, 0x56, 0x45,
  0x01, 0x02, 0x03, 0x04,
]);

function result(stdout = "", stderr = ""): AudioEngineeringCommandResult {
  return { exitCode: 0, stdout, stderr, durationMs: 5 };
}

class EngineeringRunner implements AudioEngineeringRunner {
  constructor(readonly failing = false, readonly loud = false) {}

  async run(command: AudioEngineeringCommand): Promise<AudioEngineeringCommandResult> {
    if (this.failing) throw new Error("private-path-and-secret-must-not-escape");
    switch (command.stage) {
      case "ffprobe-version":
        return result("ffprobe version 7.1\n");
      case "ffmpeg-version":
        return result("ffmpeg version 7.1\n");
      case "probe":
        return result(JSON.stringify({
          streams: [{
            codec_type: "audio",
            codec_name: "pcm_s24le",
            sample_rate: "44100",
            channels: 1,
            bit_rate: "192000",
            duration: "10",
          }],
          format: {
            format_name: "wav",
            duration: "10",
            bit_rate: "192000",
            size: String(wavBytes.byteLength),
          },
        }));
      case "astats":
        return result([
          `lavfi.astats.Overall.RMS_level=${this.loud ? -14 : -20}`,
          `lavfi.astats.Overall.Peak_level=${this.loud ? 0 : -4}`,
          `lavfi.astats.Overall.Noise_floor=${this.loud ? -45 : -65}`,
          `lavfi.astats.Overall.Peak_count=${this.loud ? 12 : 0}`,
        ].join("\n"));
      case "loudnorm":
        return result("", JSON.stringify({
          input_i: this.loud ? "-14" : "-20",
          input_tp: this.loud ? "0.2" : "-4.2",
          input_lra: "4",
          input_thresh: "-30",
          target_offset: "0",
        }));
      case "silence":
        return result("", [
          "silence_start: 0",
          "silence_end: 1 | silence_duration: 1",
          "silence_start: 9",
          "silence_end: 10 | silence_duration: 1",
        ].join("\n"));
    }
  }
}

async function withStores(
  run: (input: Readonly<{
    root: string;
    temporaryRoot: string;
    objectStore: FilePrivateObjectStore;
    registry: FileArtifactRegistry;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-audio-engineering-artifact-"));
  try {
    const temporaryRoot = join(root, "temporary");
    await run({
      root,
      temporaryRoot,
      objectStore: new FilePrivateObjectStore(join(root, "objects")),
      registry: new FileArtifactRegistry(new FileProjectStore(join(root, "registry"))),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function input(
  temporaryRoot: string,
  runner: AudioEngineeringRunner,
) {
  return {
    candidateArtifactId: "artifact_candidate_engineering_001",
    projectId: "project_engineering_001",
    jobId: "job_engineering_001",
    segmentId: "segment_engineering_001",
    takeId: "take_engineering_001",
    generationRequestHash: "a".repeat(64),
    bytes: wavBytes,
    format: "wav" as const,
    rights: {
      rightsEvidenceId: "rights_engineering_001",
      rightsFingerprint: "b".repeat(64),
      allowedUses: ["audiobook" as const],
      commercialUseApproved: true,
      expiresAt: "2028-07-27T00:00:00.000Z",
    },
    actorId: "worker_engineering_001",
    verifierActorId: "verifier_engineering_001",
    profile: ACX_AUDIOBOOK_PROFILE,
    profileVersion: "acx-2026-07",
    profileReviewedAt: "2026-07-26T00:00:00.000Z",
    profileSourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    temporaryRoot,
    runner,
    now: t0,
  };
}

test("eligible independent evidence becomes a verified audio-analysis artifact", async () => {
  await withStores(async ({ temporaryRoot, objectStore, registry }) => {
    const value = await ingestAudioEngineeringArtifact(
      objectStore,
      registry,
      input(temporaryRoot, new EngineeringRunner()),
    );

    assert.equal(value.evidence.eligible, true);
    assert.equal(value.ingest.accepted, true);
    assert.equal(value.candidateEligible, true);
    assert.equal(value.ingest.envelope.payload.kind, "audio-analysis");
    assert.deepEqual(
      value.ingest.envelope.payload.provenance.parentArtifactIds,
      ["artifact_candidate_engineering_001"],
    );
    assert.equal(
      value.ingest.envelope.payload.provenance.sourceContentHash,
      value.evidence.inputContentHash,
    );
    assert.equal(value.ingest.envelope.payload.review.status, "not-required");
    assert.equal(value.ingest.envelope.payload.verification.status, "verified");
    assert.equal((await readdir(temporaryRoot)).length, 0);

    const publicView = audioEngineeringArtifactPublicView(value);
    assert.equal(publicView.candidateEligible, true);
    assert.equal(publicView.artifact.artifact.kind, "audio-analysis");
    const serialised = JSON.stringify(publicView);
    assert.equal(serialised.includes(temporaryRoot), false);
    assert.equal(serialised.includes("private-path-and-secret"), false);
    assert.equal(serialised.includes("ffmpeg -i"), false);
  });
});

test("engineering failure evidence is retained while candidate eligibility remains blocked", async () => {
  await withStores(async ({ temporaryRoot, objectStore, registry }) => {
    const value = await ingestAudioEngineeringArtifact(
      objectStore,
      registry,
      input(temporaryRoot, new EngineeringRunner(false, true)),
    );

    assert.equal(value.evidence.eligible, false);
    assert.equal(value.ingest.accepted, true);
    assert.equal(value.candidateEligible, false);
    const codes = new Set(value.evidence.findings.map((finding) => finding.code));
    assert.equal(codes.has("AUDIO_RMS_OUT_OF_RANGE"), true);
    assert.equal(codes.has("AUDIO_PEAK_TOO_HIGH"), true);
    assert.equal(codes.has("AUDIO_NOISE_FLOOR_TOO_HIGH"), true);
    assert.equal(codes.has("AUDIO_CLIPPING_DETECTED"), true);
    assert.equal((await registry.list()).length, 1);
    assert.equal((await readdir(temporaryRoot)).length, 0);
  });
});

test("identical engineering retries reuse the same evidence artifact", async () => {
  await withStores(async ({ temporaryRoot, objectStore, registry }) => {
    const first = await ingestAudioEngineeringArtifact(
      objectStore,
      registry,
      input(temporaryRoot, new EngineeringRunner()),
    );
    const second = await ingestAudioEngineeringArtifact(
      objectStore,
      registry,
      input(temporaryRoot, new EngineeringRunner()),
    );

    assert.equal(second.evidence.fingerprint, first.evidence.fingerprint);
    assert.equal(second.ingest.envelope.entityId, first.ingest.envelope.entityId);
    assert.equal(second.ingest.envelope.revision, first.ingest.envelope.revision);
    assert.equal((await registry.list()).length, 1);
  });
});

test("analysis failure creates no artifact and always removes temporary bytes", async () => {
  await withStores(async ({ temporaryRoot, objectStore, registry }) => {
    await assert.rejects(
      ingestAudioEngineeringArtifact(
        objectStore,
        registry,
        input(temporaryRoot, new EngineeringRunner(true)),
      ),
      (error: unknown) => {
        assert.ok(error instanceof AudioEngineeringError);
        assert.equal(error.message, "AUDIO_ENGINEERING_COMMAND_FAILED:ffprobe-version");
        assert.equal(error.message.includes("private-path-and-secret"), false);
        return true;
      },
    );
    assert.equal((await registry.list()).length, 0);
    assert.equal((await readdir(temporaryRoot)).length, 0);
  });
});

test("candidate and request scope are validated before temporary file creation", async () => {
  await withStores(async ({ temporaryRoot, objectStore, registry }) => {
    await assert.rejects(
      ingestAudioEngineeringArtifact(objectStore, registry, {
        ...input(temporaryRoot, new EngineeringRunner()),
        candidateArtifactId: "../escape",
      }),
      /AUDIO_ENGINEERING_CANDIDATE_ARTIFACT_ID_INVALID/u,
    );
    await assert.rejects(
      ingestAudioEngineeringArtifact(objectStore, registry, {
        ...input(temporaryRoot, new EngineeringRunner()),
        generationRequestHash: "not-a-hash",
      }),
      /AUDIO_ENGINEERING_REQUEST_HASH_INVALID/u,
    );
    assert.equal((await registry.list()).length, 0);
  });
});
