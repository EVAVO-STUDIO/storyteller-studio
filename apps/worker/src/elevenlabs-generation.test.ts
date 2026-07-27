import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileArtifactRegistry } from "@evavo/storyteller-engine/artifact-store";
import { FileBudgetLedger, budgetMicros } from "@evavo/storyteller-engine/budget-ledger";
import { createElevenLabsPricingSnapshot } from "@evavo/storyteller-engine/elevenlabs-adapter";
import { FileGenerationMaterialStore } from "@evavo/storyteller-engine/generation-material";
import { FileGenerationQueue } from "@evavo/storyteller-engine/generation-queue";
import type { GenerationWorkerMaterial } from "@evavo/storyteller-engine/generation-worker";
import type { GenerationJob } from "@evavo/storyteller-engine";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";
import {
  EnvironmentCredentialResolver,
  resolveWorkerRuntimeConfiguration,
  type WorkerEnvironment,
} from "./configuration.js";
import { createWorkerProviderRegistry } from "./providers.js";
import { runConfiguredWorkerRuntime } from "./runtime.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const text = "Aelwyn waited.";

const job: GenerationJob = {
  id: "job_elevenlabs_generation_001",
  projectId: "project_elevenlabs_generation_001",
  segmentId: "segment_elevenlabs_generation_001",
  providerFallbackIds: ["elevenlabs"],
  cacheKey: "a".repeat(64),
  candidateCount: 1,
  status: "ready",
};

function material(): GenerationWorkerMaterial {
  return {
    text,
    immutableSourceHash: "b".repeat(64),
    voiceProfileId: "voice_elevenlabs_generation_001",
    voiceRevision: 1,
    direction: {
      segmentId: job.segmentId,
      narrativeDistance: "close",
      pace: 0.86,
      intensity: 0.34,
      warmth: 0.52,
      restraint: 0.84,
      clarity: 0.96,
      pauseBeforeMs: 120,
      pauseAfterMs: 240,
      emotionalObjective: "Keep the listener close without explaining the wait.",
      subtext: "Aelwyn expects a sound that may not arrive.",
      notes: ["Preserve the full stop and allow the last word to settle."],
    },
    pronunciations: [],
    mode: "production",
    format: "wav",
    sampleRateHz: 44_100,
    rights: {
      rightsEvidenceId: "rights_elevenlabs_generation_001",
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

function pricing(modelId: "eleven_v3" | "eleven_multilingual_v2", rate: number) {
  return createElevenLabsPricingSnapshot({
    modelId,
    currency: "AUD",
    microsPerThousandCharacters: rate,
    effectiveFrom: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-08-31T00:00:00.000Z",
    sourceReference: `elevenlabs-${modelId}-generation-2026-07`,
  });
}

function environment(dataDirectory: string): WorkerEnvironment {
  const v3Pricing = pricing("eleven_v3", 240_000);
  const productionPricing = pricing("eleven_multilingual_v2", 120_000);
  return {
    NODE_ENV: "test",
    STORYTELLER_WORKER_MODE: "once",
    STORYTELLER_WORKER_ID: "worker_elevenlabs_generation_001",
    STORYTELLER_WORKER_VERIFIER_ACTOR_ID: "verifier_elevenlabs_generation_001",
    STORYTELLER_QUEUE_DRIVER: "file",
    STORYTELLER_ARTIFACT_DRIVER: "file",
    STORYTELLER_DATA_DIR: dataDirectory,
    STORYTELLER_WORKER_CONCURRENCY: "1",
    STORYTELLER_WORKER_POLL_INTERVAL_MS: "100",
    STORYTELLER_WORKER_LEASE_DURATION_MS: "60000",
    STORYTELLER_WORKER_HEARTBEAT_INTERVAL_MS: "20000",
    STORYTELLER_WORKER_PROVIDER_TIMEOUT_MS: "5000",
    STORYTELLER_WORKER_CREDENTIAL_BINDINGS: JSON.stringify({
      elevenlabs: "ELEVENLABS_API_KEY",
    }),
    ELEVENLABS_API_KEY: "fixture-elevenlabs-generation-secret",
    STORYTELLER_ELEVENLABS_ENABLED: "true",
    STORYTELLER_ELEVENLABS_ADAPTER_VERSION: "1.0.0",
    STORYTELLER_ELEVENLABS_MODEL_POLICIES: JSON.stringify([
      {
        mode: "preview",
        modelId: "eleven_v3",
        maximumInputCharacters: 3_000,
        pricing: v3Pricing,
      },
      {
        mode: "calibration",
        modelId: "eleven_v3",
        maximumInputCharacters: 3_000,
        pricing: v3Pricing,
      },
      {
        mode: "production",
        modelId: "eleven_multilingual_v2",
        maximumInputCharacters: 9_000,
        pricing: productionPricing,
      },
    ]),
    STORYTELLER_ELEVENLABS_VOICE_BINDINGS: JSON.stringify([{
      voiceProfileId: "voice_elevenlabs_generation_001",
      voiceRevision: 1,
      voiceId: "premadeVoice0001",
      sourceKind: "premade",
      licenceEvidenceId: "licence_elevenlabs_generation_001",
      commercialUseApproved: true,
      allowedModes: ["production"],
    }]),
    STORYTELLER_ELEVENLABS_PRONUNCIATION_DICTIONARIES: "[]",
    STORYTELLER_ELEVENLABS_DATA_POLICY: JSON.stringify({
      retentionMode: "zero-retention-enterprise",
      storesInputs: false,
      trainsOnCustomerData: false,
      policyVersion: "elevenlabs-enterprise-zero-retention-2026-07",
    }),
    STORYTELLER_ELEVENLABS_MAX_RESPONSE_BYTES: String(4 * 1024 * 1024),
    STORYTELLER_ELEVENLABS_PREFLIGHT_TIMEOUT_MS: "5000",
  };
}

function jsonResponse(value: unknown, headers: Record<string, string> = {}): Response {
  const body = JSON.stringify(value);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body)),
      ...headers,
    },
  });
}

function wavBytes(): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    0x01, 0x02, 0x03, 0x04,
  ]);
}

function timestampResponse(): Response {
  const characters = [...text];
  return jsonResponse({
    audio_base64: Buffer.from(wavBytes()).toString("base64"),
    alignment: {
      characters,
      character_start_times_seconds: characters.map((_, index) => index * 0.05),
      character_end_times_seconds: characters.map((_, index) => (index + 1) * 0.05),
    },
  }, { "request-id": "private-elevenlabs-request-001" });
}

function fetchFrom(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    return await handler(url, init);
  }) as typeof fetch;
}

test("queued ElevenLabs production reserves budget, verifies artifacts and completes with exact evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-elevenlabs-generation-"));
  try {
    const env = environment("./private-data");
    const configuration = resolveWorkerRuntimeConfiguration(env, root);
    if (!configuration.enabled) throw new Error("enabled worker configuration required");

    const queueState = new FileProjectStore(configuration.queueRootDirectory);
    const queue = new FileGenerationQueue(queueState);
    const materials = new FileGenerationMaterialStore(queueState);
    const ledger = new FileBudgetLedger(queueState);
    await ledger.createAccount({
      projectId: job.projectId,
      currency: "AUD",
      authorisedMicros: budgetMicros(1),
      actorId: "operator_elevenlabs_generation_001",
      now: t0,
    });
    await materials.create(job, material(), {
      actorId: "operator_elevenlabs_generation_001",
      now: t0,
    });
    await queue.enqueue(job, { now: t0, maxAttempts: 3 });

    const calls: string[] = [];
    const providers = createWorkerProviderRegistry({
      workerEnabled: true,
      environment: env,
      credentialBindings: configuration.credentialBindings,
      now: () => t0,
      fetch: fetchFrom(async (url, init) => {
        calls.push(url);
        assert.equal(
          new Headers(init?.headers).get("xi-api-key"),
          "fixture-elevenlabs-generation-secret",
        );
        if (url.endsWith("/v1/models")) {
          return jsonResponse([
            {
              model_id: "eleven_multilingual_v2",
              can_do_text_to_speech: true,
              max_characters_request: 10_000,
            },
            {
              model_id: "eleven_v3",
              can_do_text_to_speech: true,
              max_characters_request: 5_000,
            },
          ]);
        }
        if (url.endsWith("/v1/voices/premadeVoice0001")) {
          return jsonResponse({
            voice_id: "premadeVoice0001",
            category: "premade",
          });
        }
        if (url.includes("/v1/text-to-speech/premadeVoice0001/with-timestamps")) {
          const endpoint = new URL(url);
          assert.equal(endpoint.searchParams.get("output_format"), "wav_44100");
          assert.equal(endpoint.searchParams.get("enable_logging"), "false");
          assert.equal(init?.method, "POST");
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          assert.equal(body.text, text);
          assert.equal(body.model_id, "eleven_multilingual_v2");
          assert.equal(typeof body.seed, "number");
          assert.equal(JSON.stringify(body).includes("emotionalObjective"), false);
          assert.equal(JSON.stringify(body).includes("subtext"), false);
          return timestampResponse();
        }
        throw new Error(`unexpected ElevenLabs URL: ${url}`);
      }),
    });
    const credentials = new EnvironmentCredentialResolver(
      env,
      configuration.credentialBindings,
    );
    const result = await runConfiguredWorkerRuntime(configuration, {
      providers,
      credentials,
      now: () => t0,
    });

    assert.equal(result.status, "stopped");
    assert.equal(result.providerCount, 1);
    assert.equal(result.lifecycle.service.claimedJobs, 1);
    assert.equal(result.lifecycle.service.completedJobs, 1);
    assert.equal(result.lifecycle.service.blockedJobs, 0);
    assert.equal(calls.length, 3);

    const queueEnvelope = await queue.read(`queue_${job.id}`);
    assert.equal(queueEnvelope?.payload.status, "completed");
    assert.equal(queueEnvelope?.payload.completion?.resultIds.length, 1);
    assert.equal(queueEnvelope?.payload.completion?.outputArtifactRefs.length, 4);
    assert.equal(queueEnvelope?.payload.completion?.currency, "AUD");
    assert.equal(queueEnvelope?.payload.completion?.totalEstimatedCost, 0.00168);

    const budget = await ledger.require(job.projectId, "AUD");
    assert.equal(budget.payload.committedMicros, 1_680);
    assert.equal(budget.payload.reservations.length, 1);
    assert.equal(budget.payload.reservations[0]?.status, "committed");
    assert.equal(budget.payload.reservations[0]?.committedMicros, 1_680);

    const registry = new FileArtifactRegistry(
      new FileProjectStore(configuration.artifactRootDirectory),
    );
    const artifactRows = await registry.list();
    assert.equal(artifactRows.length, 4);
    const artifactKinds: string[] = [];
    for (const row of artifactRows) {
      const artifact = await registry.require(row.entityId);
      artifactKinds.push(artifact.payload.kind);
      assert.equal(artifact.payload.verification.status, "verified");
      assert.equal(artifact.payload.projectId, job.projectId);
      assert.equal(artifact.payload.jobId, job.id);
      assert.equal(artifact.payload.segmentId, job.segmentId);
    }
    assert.deepEqual(artifactKinds.sort(), [
      "audio-analysis",
      "audio-candidate",
      "transcript",
      "word-alignment",
    ]);

    const serialised = JSON.stringify(result);
    for (const forbidden of [
      text,
      "fixture-elevenlabs-generation-secret",
      "premadeVoice0001",
      "voice_elevenlabs_generation_001",
      "private-elevenlabs-request-001",
      configuration.queueRootDirectory,
      configuration.artifactRootDirectory,
      configuration.objectRootDirectory,
    ]) assert.equal(serialised.includes(forbidden), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
