import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileBudgetLedger,
  budgetMicros,
} from "@evavo/storyteller-engine/budget-ledger";
import { FileGenerationMaterialStore } from "@evavo/storyteller-engine/generation-material";
import { FileGenerationQueue } from "@evavo/storyteller-engine/generation-queue";
import type { GenerationWorkerMaterial } from "@evavo/storyteller-engine/generation-worker";
import type { GenerationJob } from "@evavo/storyteller-engine";
import {
  createCapabilitySnapshot,
  ProviderAdapterRegistry,
  type CredentialResolver,
  type NarrationProviderAdapter,
  type ProviderCapabilitySnapshot,
  type ProviderExecutionContext,
  type SynthesisRequest,
  type SynthesisResult,
} from "@evavo/storyteller-engine/provider-adapter";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";
import { resolveWorkerAudioEngineeringPolicy } from "./audio-engineering.js";
import {
  resolveWorkerRuntimeConfiguration,
  type WorkerEnvironment,
} from "./configuration.js";
import { runConfiguredWorkerRuntime } from "./runtime.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");

const job: GenerationJob = {
  id: "job_uncalibrated_runtime_001",
  projectId: "project_uncalibrated_runtime_001",
  segmentId: "segment_uncalibrated_runtime_001",
  providerFallbackIds: ["provider_uncalibrated_fixture"],
  cacheKey: "a".repeat(64),
  candidateCount: 1,
  status: "ready",
};

const material: GenerationWorkerMaterial = {
  text: "The production worker must not speak this line without an approved calibration lock.",
  immutableSourceHash: "b".repeat(64),
  voiceProfileId: "voice_uncalibrated_runtime_001",
  voiceRevision: 1,
  direction: {
    segmentId: job.segmentId,
    narrativeDistance: "close",
    pace: 0.9,
    intensity: 0.3,
    warmth: 0.5,
    restraint: 0.8,
    clarity: 0.95,
    pauseBeforeMs: 120,
    pauseAfterMs: 240,
    emotionalObjective: "Preserve the listener relationship without display.",
    subtext: "The voice has not yet earned production approval.",
    notes: ["Do not invoke a provider without calibration evidence."],
  },
  mode: "production",
  format: "wav",
  sampleRateHz: 44_100,
  rights: {
    rightsEvidenceId: "rights_uncalibrated_runtime_001",
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

class FixtureCredentials implements CredentialResolver {
  async resolve(): Promise<string> {
    return "fixture-uncalibrated-runtime-secret";
  }
}

class CountingAdapter implements NarrationProviderAdapter {
  readonly providerId = "provider_uncalibrated_fixture";
  readonly adapterVersion = "1.0.0";
  preflightCount = 0;
  synthesisCount = 0;

  async inspectCapabilities(): Promise<ProviderCapabilitySnapshot> {
    this.preflightCount += 1;
    return createCapabilitySnapshot({
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      capturedAt: t0.toISOString(),
      features: ["batch-long-form"],
      maximumInputCharacters: 10_000,
      supportedFormats: ["wav"],
      supportedSampleRatesHz: [44_100],
      regions: ["australia"],
      storesInputs: false,
      trainsOnCustomerData: false,
      customVoiceRequiresConsent: true,
      rawPolicyVersion: "fixture-policy-001",
    });
  }

  async synthesise(
    request: SynthesisRequest,
    _context: ProviderExecutionContext,
  ): Promise<SynthesisResult> {
    this.synthesisCount += 1;
    return {
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      requestId: request.requestId,
      idempotencyKey: request.idempotencyKey,
      audio: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]),
      contentType: "audio/wav",
      usage: { inputCharacters: request.text.length },
      capabilityFingerprint: "d".repeat(64),
      generatedAt: t0.toISOString(),
      provenance: { modelId: "fixture-model" },
    };
  }
}

function environment(dataDirectory: string): WorkerEnvironment {
  return {
    NODE_ENV: "test",
    STORYTELLER_WORKER_MODE: "once",
    STORYTELLER_WORKER_ID: "worker_uncalibrated_runtime_001",
    STORYTELLER_WORKER_VERIFIER_ACTOR_ID: "verifier_uncalibrated_runtime_001",
    STORYTELLER_QUEUE_DRIVER: "file",
    STORYTELLER_ARTIFACT_DRIVER: "file",
    STORYTELLER_DATA_DIR: dataDirectory,
    STORYTELLER_WORKER_CONCURRENCY: "1",
    STORYTELLER_WORKER_POLL_INTERVAL_MS: "100",
    STORYTELLER_WORKER_LEASE_DURATION_MS: "60000",
    STORYTELLER_WORKER_HEARTBEAT_INTERVAL_MS: "20000",
    STORYTELLER_WORKER_PROVIDER_TIMEOUT_MS: "5000",
    STORYTELLER_AUDIO_ENGINEERING_PROFILE: "lossless-production",
    STORYTELLER_AUDIO_ENGINEERING_PROFILE_VERSION: "evavo-lossless-2026-07",
    STORYTELLER_AUDIO_ENGINEERING_PROFILE_REVIEWED_AT: "2026-07-01T00:00:00.000Z",
    STORYTELLER_AUDIO_ENGINEERING_PROFILE_SOURCE_REFERENCE:
      "evavo-lossless-mastering-policy-2026-07",
  };
}

test("production without a calibration binding blocks before credentials, budget reservation or synthesis", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-uncalibrated-runtime-"));
  try {
    const runtimeEnvironment = environment("./private-data");
    const configuration = resolveWorkerRuntimeConfiguration(
      runtimeEnvironment,
      root,
    );
    if (!configuration.enabled) {
      throw new Error("enabled worker configuration required");
    }
    const audioEngineering = resolveWorkerAudioEngineeringPolicy({
      workerEnabled: true,
      environment: runtimeEnvironment,
      temporaryRoot: join(root, "audio-engineering-temp"),
      now: t0,
    });
    if (!audioEngineering) throw new Error("worker audio engineering policy required");

    const state = new FileProjectStore(configuration.queueRootDirectory);
    const queue = new FileGenerationQueue(state);
    await new FileGenerationMaterialStore(state).create(job, material, {
      actorId: "operator_uncalibrated_runtime_001",
      now: t0,
    });
    await new FileBudgetLedger(state).createAccount({
      projectId: job.projectId,
      currency: "AUD",
      authorisedMicros: budgetMicros(1),
      actorId: "operator_uncalibrated_runtime_001",
      now: t0,
    });
    await queue.enqueue(job, { now: t0, maxAttempts: 3 });

    const adapter = new CountingAdapter();
    const result = await runConfiguredWorkerRuntime(configuration, {
      providers: new ProviderAdapterRegistry([adapter]),
      credentials: new FixtureCredentials(),
      audioEngineering,
      now: () => t0,
    });

    assert.equal(result.status, "stopped");
    assert.equal(result.providerCount, 1);
    assert.equal(result.lifecycle.service.claimedJobs, 1);
    assert.equal(result.lifecycle.service.blockedJobs, 1);
    assert.equal(result.lifecycle.service.completedJobs, 0);
    assert.equal(adapter.preflightCount, 1);
    assert.equal(adapter.synthesisCount, 0);

    const queued = await queue.read(`queue_${job.id}`);
    assert.equal(queued?.payload.status, "blocked");
    assert.deepEqual(
      queued?.payload.block?.codes,
      ["GENERATION_MATERIAL_RESOLUTION_FAILED"],
    );
    const account = await new FileBudgetLedger(state).require(job.projectId, "AUD");
    assert.equal(account.payload.reservations.length, 0);
    assert.equal(account.payload.committedMicros, 0);

    const serialised = JSON.stringify(result);
    for (const forbidden of [
      material.text,
      material.voiceProfileId,
      "fixture-uncalibrated-runtime-secret",
      configuration.queueRootDirectory,
      configuration.artifactRootDirectory,
      configuration.objectRootDirectory,
      "evavo-lossless-mastering-policy-2026-07",
      "audio-engineering-temp",
    ]) assert.equal(serialised.includes(forbidden), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
