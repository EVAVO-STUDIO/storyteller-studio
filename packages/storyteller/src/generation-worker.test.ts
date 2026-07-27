import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileArtifactRegistry } from "./artifact-store.js";
import { FileGenerationQueue } from "./generation-queue.js";
import {
  generationWorkerPublicView,
  runClaimedGenerationWorker,
  type GenerationWorkerMaterial,
} from "./generation-worker.js";
import type { GenerationJob } from "./index.js";
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

function wavBytes(candidateIndex: number): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    candidateIndex,
    1,
    2,
    3,
  ]);
}

const job: GenerationJob = {
  id: "job_worker_001",
  projectId: "project_worker_001",
  segmentId: "segment_worker_001",
  providerFallbackIds: ["provider_primary"],
  cacheKey: "a".repeat(64),
  candidateCount: 2,
  status: "ready",
};

function material(
  overrides: Partial<GenerationWorkerMaterial> = {},
): GenerationWorkerMaterial {
  return {
    text: "The house kept its own weather, and Mara listened at the locked door.",
    immutableSourceHash: "b".repeat(64),
    voiceProfileId: "voice_narrator_001",
    voiceRevision: 3,
    direction: {
      segmentId: job.segmentId,
      narrativeDistance: "close",
      pace: 0.82,
      intensity: 0.44,
      warmth: 0.51,
      restraint: 0.78,
      clarity: 0.93,
      pauseBeforeMs: 120,
      pauseAfterMs: 240,
      emotionalObjective: "Invite the listener closer without explaining the danger.",
      subtext: "The narrator knows the house is listening too.",
      notes: ["Protect the final clause and do not manufacture suspense with volume."],
    },
    format: "wav",
    sampleRateHz: 48_000,
    rights: {
      rightsEvidenceId: "rights_worker_001",
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
    ...overrides,
  };
}

class StaticCredentialResolver implements CredentialResolver {
  readonly #credential: string | null;

  constructor(credential: string | null) {
    this.#credential = credential;
  }

  async resolve(): Promise<string | null> {
    return this.#credential;
  }
}

class SuccessfulAdapter implements NarrationProviderAdapter {
  readonly providerId = "provider_primary";
  readonly adapterVersion = "1.0.0";
  readonly #costPerCandidate: number;
  readonly #capabilities: ProviderCapabilitySnapshot;

  constructor(costPerCandidate = 0.02) {
    this.#costPerCandidate = costPerCandidate;
    this.#capabilities = createCapabilitySnapshot({
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      capturedAt: t0.toISOString(),
      features: ["batch-long-form", "word-timestamps", "style-instructions"],
      maximumInputCharacters: 20_000,
      supportedFormats: ["wav"],
      supportedSampleRatesHz: [48_000],
      regions: ["australia"],
      storesInputs: false,
      trainsOnCustomerData: false,
      customVoiceRequiresConsent: true,
      rawPolicyVersion: "policy-2026-07",
    });
  }

  async inspectCapabilities(): Promise<ProviderCapabilitySnapshot> {
    return this.#capabilities;
  }

  async synthesise(
    request: SynthesisRequest,
    context: ProviderExecutionContext,
  ): Promise<SynthesisResult> {
    assert.equal(context.credential, "test-provider-secret");
    return {
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      requestId: request.requestId,
      idempotencyKey: request.idempotencyKey,
      providerRequestId: `private-provider-request-${request.candidateIndex}`,
      audio: wavBytes(request.candidateIndex),
      contentType: "audio/wav",
      transcript: request.text,
      wordTimestamps: [
        { word: "The", startMs: 0, endMs: 180 },
        { word: "house", startMs: 190, endMs: 520 },
      ],
      usage: {
        inputCharacters: request.text.length,
        outputSeconds: 4.2,
        estimatedCost: this.#costPerCandidate,
        currency: "AUD",
      },
      capabilityFingerprint: this.#capabilities.fingerprint,
      generatedAt: t1.toISOString(),
      provenance: {
        candidateIndex: request.candidateIndex,
        deterministicRequest: true,
      },
    };
  }
}

class FailingAdapter extends SuccessfulAdapter {
  override async synthesise(): Promise<SynthesisResult> {
    throw new Error("temporary provider outage");
  }
}

async function withWorker(
  run: (input: Readonly<{
    queue: FileGenerationQueue;
    claim: NonNullable<Awaited<ReturnType<FileGenerationQueue["claimNext"]>>>;
    registry: FileArtifactRegistry;
    objectStore: FilePrivateObjectStore;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-generation-worker-"));
  try {
    const queue = new FileGenerationQueue(
      new FileProjectStore(join(root, "queue")),
      { baseBackoffMs: 100, maximumBackoffMs: 1_000 },
    );
    await queue.enqueue(job, { now: t0, maxAttempts: 3 });
    const claim = await queue.claimNext({
      workerId: "worker_generation_001",
      leaseDurationMs: 60_000,
      now: t0,
    });
    if (!claim) throw new Error("worker claim required");
    const registry = new FileArtifactRegistry(
      new FileProjectStore(join(root, "registry")),
    );
    const objectStore = new FilePrivateObjectStore(join(root, "objects"), {
      provider: "evavo-private-file-store",
      container: "storyteller-production",
      region: "australia-southeast",
    });
    await run({ queue, claim, registry, objectStore });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("a claimed job persists exact provider candidates and completes only with verified artifacts", async () => {
  await withWorker(async ({ queue, claim, registry, objectStore }) => {
    const result = await runClaimedGenerationWorker({
      queue,
      claim,
      providers: new ProviderAdapterRegistry([new SuccessfulAdapter()]),
      credentials: new StaticCredentialResolver("test-provider-secret"),
      objectStore,
      artifactRegistry: registry,
      material: material(),
      workerActorId: "worker_generation_001",
      verifierActorId: "verifier_generation_001",
      now: t1,
    });

    assert.equal(result.queueEnvelope.payload.status, "completed");
    assert.equal(result.executionStatus, "completed");
    assert.equal(result.candidateArtifactIds.length, 2);
    assert.equal(result.artifactIds.length, 7);
    assert.match(result.executionReportHash ?? "", /^[a-f0-9]{64}$/u);
    assert.ok(result.reportArtifactId);

    const artifacts = await registry.list({ jobId: job.id });
    assert.equal(artifacts.length, 7);
    assert.equal(
      artifacts.every((artifact) => artifact.payload.verification.status === "verified"),
      true,
    );
    assert.equal(
      artifacts.filter((artifact) => artifact.payload.kind === "audio-candidate").length,
      2,
    );
    assert.equal(
      artifacts.filter((artifact) => artifact.payload.kind === "transcript").length,
      2,
    );
    assert.equal(
      artifacts.filter((artifact) => artifact.payload.kind === "word-alignment").length,
      2,
    );
    assert.equal(
      artifacts.filter((artifact) => artifact.payload.kind === "audio-analysis").length,
      1,
    );
    assert.equal(
      artifacts
        .filter((artifact) => artifact.payload.kind === "audio-candidate")
        .every((artifact) => artifact.payload.review.status === "pending"),
      true,
    );

    const completion = result.queueEnvelope.payload.completion;
    assert.equal(completion?.outputArtifactRefs.length, 7);
    assert.equal(completion?.resultIds.length, 2);
    assert.equal(completion?.totalEstimatedCost, 0.04);
    assert.equal(completion?.currency, "AUD");

    const publicView = generationWorkerPublicView(result);
    assert.equal(publicView.status, "completed");
    assert.equal(publicView.candidateCount, 2);
    const serialised = JSON.stringify(publicView);
    assert.equal(serialised.includes("test-provider-secret"), false);
    assert.equal(serialised.includes("private-provider-request"), false);
    assert.equal(serialised.includes(claim.leaseToken), false);
    assert.equal(serialised.includes("storyteller-production"), false);
    assert.equal(serialised.includes("RIFF"), false);
  });
});

test("missing provider credentials block the queue while preserving a verified execution report", async () => {
  await withWorker(async ({ queue, claim, registry, objectStore }) => {
    const result = await runClaimedGenerationWorker({
      queue,
      claim,
      providers: new ProviderAdapterRegistry([new SuccessfulAdapter()]),
      credentials: new StaticCredentialResolver(null),
      objectStore,
      artifactRegistry: registry,
      material: material({ costPolicy: undefined }),
      workerActorId: "worker_generation_001",
      now: t1,
    });

    assert.equal(result.queueEnvelope.payload.status, "blocked");
    assert.equal(result.executionStatus, "blocked");
    assert.deepEqual(
      result.queueEnvelope.payload.block?.codes,
      ["GENERATION_PROVIDER_CONFIGURATION_BLOCKED"],
    );
    assert.equal(result.candidateArtifactIds.length, 0);
    assert.equal(result.artifactIds.length, 1);
    const records = await registry.list({ jobId: job.id });
    assert.equal(records.length, 1);
    assert.equal(records[0]?.payload.kind, "audio-analysis");
    assert.equal(records[0]?.payload.verification.status, "verified");
  });
});

test("transient provider failures use bounded queue retry instead of false completion", async () => {
  await withWorker(async ({ queue, claim, registry, objectStore }) => {
    const result = await runClaimedGenerationWorker({
      queue,
      claim,
      providers: new ProviderAdapterRegistry([new FailingAdapter()]),
      credentials: new StaticCredentialResolver("test-provider-secret"),
      objectStore,
      artifactRegistry: registry,
      material: material({ costPolicy: undefined }),
      workerActorId: "worker_generation_001",
      now: t1,
    });

    assert.equal(result.queueEnvelope.payload.status, "retry-wait");
    assert.equal(result.executionStatus, "blocked");
    assert.equal(result.queueEnvelope.payload.lastFailure?.code, "GENERATION_PROVIDER_EXECUTION_INCOMPLETE");
    assert.equal(result.queueEnvelope.payload.lastFailure?.retryable, true);
    assert.equal(Date.parse(result.queueEnvelope.payload.availableAt) > t1.getTime(), true);
    assert.equal((await registry.list({ jobId: job.id })).length, 1);
  });
});

test("cost policy excess blocks completion after retaining verified evidence", async () => {
  await withWorker(async ({ queue, claim, registry, objectStore }) => {
    const result = await runClaimedGenerationWorker({
      queue,
      claim,
      providers: new ProviderAdapterRegistry([new SuccessfulAdapter(0.06)]),
      credentials: new StaticCredentialResolver("test-provider-secret"),
      objectStore,
      artifactRegistry: registry,
      material: material(),
      workerActorId: "worker_generation_001",
      now: t1,
    });

    assert.equal(result.queueEnvelope.payload.status, "blocked");
    assert.deepEqual(
      result.queueEnvelope.payload.block?.codes,
      ["GENERATION_COST_POLICY_EXCEEDED"],
    );
    assert.equal(result.candidateArtifactIds.length, 2);
    assert.equal((await registry.list({ jobId: job.id })).length, 7);
  });
});

test("worker identity must match the exclusive queue lease", async () => {
  await withWorker(async ({ queue, claim, registry, objectStore }) => {
    await assert.rejects(
      runClaimedGenerationWorker({
        queue,
        claim,
        providers: new ProviderAdapterRegistry([new SuccessfulAdapter()]),
        credentials: new StaticCredentialResolver("test-provider-secret"),
        objectStore,
        artifactRegistry: registry,
        material: material(),
        workerActorId: "different_worker",
        now: t1,
      }),
      /GENERATION_WORKER_CLAIM_ACTOR_MISMATCH/u,
    );
    assert.equal((await queue.read(claim.item.id))?.payload.status, "leased");
    assert.equal((await registry.list()).length, 0);
  });
});
