import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type {
  AudioEngineeringCommand,
  AudioEngineeringCommandResult,
  AudioEngineeringRunner,
} from "./audio-engineering.js";
import { FileArtifactRegistry } from "./artifact-store.js";
import { createGenerationAudioEngineeringPolicy } from "./generation-audio-engineering.js";
import { FileGenerationQueue } from "./generation-queue.js";
import {
  runClaimedGenerationWorker,
  type GenerationWorkerMaterial,
} from "./generation-worker.js";
import {
  ACX_AUDIOBOOK_PROFILE,
  type GenerationJob,
} from "./index.js";
import { FilePrivateObjectStore } from "./private-object-store.js";
import {
  createCapabilitySnapshot,
  ProviderAdapterRegistry,
  type CredentialResolver,
  type NarrationProviderAdapter,
  type ProviderCapabilitySnapshot,
  type ProviderExecutionContext,
  type SynthesisRequest,
  type SynthesisResult,
} from "./provider-adapter.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:00:05.000Z");
const audio = new Uint8Array([
  0x52, 0x49, 0x46, 0x46,
  0x04, 0x00, 0x00, 0x00,
  0x57, 0x41, 0x56, 0x45,
  0x01, 0x02, 0x03, 0x04,
]);

const job: GenerationJob = {
  id: "job_worker_engineering_001",
  projectId: "project_worker_engineering_001",
  segmentId: "segment_worker_engineering_001",
  providerFallbackIds: ["provider_engineering"],
  cacheKey: "a".repeat(64),
  candidateCount: 1,
  status: "ready",
};

function material(): GenerationWorkerMaterial {
  return {
    text: "Mara listened until the final bell settled into the empty room.",
    immutableSourceHash: "b".repeat(64),
    voiceProfileId: "voice_worker_engineering_001",
    voiceRevision: 2,
    direction: {
      segmentId: job.segmentId,
      narrativeDistance: "close",
      pace: 0.86,
      intensity: 0.25,
      warmth: 0.54,
      restraint: 0.91,
      clarity: 0.96,
      pauseBeforeMs: 120,
      pauseAfterMs: 320,
      emotionalObjective: "Keep the listener close without displaying technique.",
      subtext: "The silence matters as much as the bell.",
      notes: ["Protect the final word."],
    },
    mode: "production",
    format: "wav",
    sampleRateHz: 44_100,
    rights: {
      rightsEvidenceId: "rights_worker_engineering_001",
      rightsFingerprint: "c".repeat(64),
      allowedUses: ["audiobook"],
      commercialUseApproved: true,
      expiresAt: "2028-07-27T00:00:00.000Z",
    },
    intendedUse: "audiobook",
    commercial: true,
    costPolicy: {
      currency: "AUD",
      maximumTotalEstimatedCost: 0.1,
    },
  };
}

class StaticCredentials implements CredentialResolver {
  async resolve(): Promise<string | null> {
    return "engineering-provider-secret";
  }
}

class EngineeringProvider implements NarrationProviderAdapter {
  readonly providerId = "provider_engineering";
  readonly adapterVersion = "1.0.0";
  readonly capability: ProviderCapabilitySnapshot;

  constructor() {
    this.capability = createCapabilitySnapshot({
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      capturedAt: t0.toISOString(),
      features: ["word-timestamps", "style-instructions"],
      maximumInputCharacters: 10_000,
      supportedFormats: ["wav"],
      supportedSampleRatesHz: [44_100],
      regions: ["australia"],
      storesInputs: false,
      trainsOnCustomerData: false,
      customVoiceRequiresConsent: true,
      rawPolicyVersion: "engineering-provider-policy-001",
    });
  }

  async inspectCapabilities(): Promise<ProviderCapabilitySnapshot> {
    return this.capability;
  }

  async synthesise(
    request: SynthesisRequest,
    context: ProviderExecutionContext,
  ): Promise<SynthesisResult> {
    assert.equal(context.credential, "engineering-provider-secret");
    return {
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      requestId: request.requestId,
      idempotencyKey: request.idempotencyKey,
      providerRequestId: "private-engineering-provider-request",
      audio,
      contentType: "audio/wav",
      transcript: request.text,
      wordTimestamps: [{ word: "Mara", startMs: 0, endMs: 250 }],
      usage: {
        inputCharacters: request.text.length,
        outputSeconds: 4.5,
        estimatedCost: 0.02,
        currency: "AUD",
      },
      capabilityFingerprint: this.capability.fingerprint,
      generatedAt: t1.toISOString(),
      provenance: {
        modelId: "provider_engineering_long_form_v1",
        deterministicRequest: true,
      },
    };
  }
}

function engineeringResult(stdout = "", stderr = ""): AudioEngineeringCommandResult {
  return { exitCode: 0, stdout, stderr, durationMs: 4 };
}

class EngineeringRunner implements AudioEngineeringRunner {
  constructor(readonly ineligible = false) {}

  async run(command: AudioEngineeringCommand): Promise<AudioEngineeringCommandResult> {
    switch (command.stage) {
      case "ffprobe-version":
        return engineeringResult("ffprobe version 7.1\n");
      case "ffmpeg-version":
        return engineeringResult("ffmpeg version 7.1\n");
      case "probe":
        return engineeringResult(JSON.stringify({
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
            size: String(audio.byteLength),
          },
        }));
      case "astats":
        return engineeringResult([
          `RMS level dB: ${this.ineligible ? -14 : -20}`,
          `Peak level dB: ${this.ineligible ? 0 : -4}`,
          `Noise floor dB: ${this.ineligible ? -45 : -65}`,
          `Peak count: ${this.ineligible ? 12 : 0}`,
        ].join("\n"));
      case "loudnorm":
        return engineeringResult("", JSON.stringify({
          input_i: this.ineligible ? "-14" : "-20",
          input_tp: this.ineligible ? "0.2" : "-4.2",
          input_lra: "4",
          input_thresh: "-30",
          target_offset: "0",
        }));
      case "silence":
        return engineeringResult("", [
          "silence_start: 0",
          "silence_end: 1 | silence_duration: 1",
          "silence_start: 9",
          "silence_end: 10 | silence_duration: 1",
        ].join("\n"));
    }
  }
}

async function withWorker(
  run: (input: Readonly<{
    root: string;
    queue: FileGenerationQueue;
    claim: NonNullable<Awaited<ReturnType<FileGenerationQueue["claimNext"]>>>;
    registry: FileArtifactRegistry;
    objectStore: FilePrivateObjectStore;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-generation-worker-engineering-"));
  try {
    const queue = new FileGenerationQueue(new FileProjectStore(join(root, "queue")));
    await queue.enqueue(job, { now: t0 });
    const claim = await queue.claimNext({
      workerId: "worker_engineering_001",
      leaseDurationMs: 60_000,
      now: t0,
    });
    if (!claim) throw new Error("engineering worker claim required");
    await run({
      root,
      queue,
      claim,
      registry: new FileArtifactRegistry(new FileProjectStore(join(root, "registry"))),
      objectStore: new FilePrivateObjectStore(join(root, "objects")),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function policy(root: string, ineligible = false) {
  return createGenerationAudioEngineeringPolicy({
    profile: ACX_AUDIOBOOK_PROFILE,
    externalVersion: "acx-2026-07",
    reviewedAt: "2026-07-26T00:00:00.000Z",
    sourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner: new EngineeringRunner(ineligible),
    temporaryRoot: join(root, "engineering-temp"),
    now: t0,
  });
}

test("engineering policy creates one verified per-candidate analysis before completion", async () => {
  await withWorker(async ({ root, queue, claim, registry, objectStore }) => {
    const value = await runClaimedGenerationWorker({
      queue,
      claim,
      providers: new ProviderAdapterRegistry([new EngineeringProvider()]),
      credentials: new StaticCredentials(),
      objectStore,
      artifactRegistry: registry,
      audioEngineering: policy(root),
      material: material(),
      workerActorId: "worker_engineering_001",
      verifierActorId: "verifier_engineering_001",
      now: t1,
    });

    assert.equal(value.queueEnvelope.payload.status, "completed");
    assert.equal(value.artifactIds.length, 5);
    assert.equal(value.candidateArtifactIds.length, 1);
    const records = await registry.list({ jobId: job.id });
    assert.equal(records.length, 5);
    const audioCandidate = records.find((record) => record.payload.kind === "audio-candidate");
    const analyses = records.filter((record) => record.payload.kind === "audio-analysis");
    assert.ok(audioCandidate);
    assert.equal(analyses.length, 2);
    const engineering = analyses.find((record) => record.payload.takeId === audioCandidate.payload.takeId);
    const execution = analyses.find((record) => record.payload.takeId === undefined);
    assert.ok(engineering);
    assert.ok(execution);
    assert.deepEqual(engineering.payload.provenance.parentArtifactIds, [audioCandidate.payload.id]);
    assert.equal(
      engineering.payload.provenance.sourceContentHash,
      audioCandidate.payload.integrity.contentHash,
    );
    assert.equal(
      value.queueEnvelope.payload.completion?.outputArtifactRefs.length,
      5,
    );

    const serialised = JSON.stringify(value);
    for (const forbidden of [
      "engineering-provider-secret",
      "private-engineering-provider-request",
      join(root, "engineering-temp"),
      "provider_engineering_long_form_v1",
    ]) assert.equal(serialised.includes(forbidden), false);
  });
});

test("failed engineering retains verified evidence and blocks queue completion", async () => {
  await withWorker(async ({ root, queue, claim, registry, objectStore }) => {
    const value = await runClaimedGenerationWorker({
      queue,
      claim,
      providers: new ProviderAdapterRegistry([new EngineeringProvider()]),
      credentials: new StaticCredentials(),
      objectStore,
      artifactRegistry: registry,
      audioEngineering: policy(root, true),
      material: material(),
      workerActorId: "worker_engineering_001",
      verifierActorId: "verifier_engineering_001",
      now: t1,
    });

    assert.equal(value.queueEnvelope.payload.status, "blocked");
    const codes = new Set(value.queueEnvelope.payload.block?.codes ?? []);
    for (const code of [
      "AUDIO_RMS_OUT_OF_RANGE",
      "AUDIO_PEAK_TOO_HIGH",
      "AUDIO_NOISE_FLOOR_TOO_HIGH",
      "AUDIO_CLIPPING_DETECTED",
    ]) assert.equal(codes.has(code), true, code);
    assert.equal(value.artifactIds.length, 5);
    assert.equal(value.candidateArtifactIds.length, 1);
    const records = await registry.list({ jobId: job.id });
    assert.equal(records.length, 5);
    assert.equal(
      records.every((record) => record.payload.verification.status === "verified"),
      true,
    );
    assert.equal(
      records.filter((record) =>
        record.payload.kind === "audio-analysis"
        && record.payload.takeId !== undefined
      ).length,
      1,
    );
    assert.equal(value.queueEnvelope.payload.completion, undefined);
  });
});
