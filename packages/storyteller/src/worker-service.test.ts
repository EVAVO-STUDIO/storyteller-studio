import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileArtifactRegistry } from "./artifact-store.js";
import { FileGenerationMaterialStore } from "./generation-material.js";
import { FileGenerationQueue } from "./generation-queue.js";
import type { GenerationWorkerMaterial } from "./generation-worker.js";
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
import {
  GenerationWorkerService,
  generationWorkerServicePublicView,
} from "./worker-service.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");

function job(index: number): GenerationJob {
  return {
    id: `job_service_${String(index).padStart(3, "0")}`,
    projectId: "project_service_001",
    segmentId: `segment_service_${String(index).padStart(3, "0")}`,
    providerFallbackIds: ["provider_primary"],
    cacheKey: index.toString(16).padStart(64, "0"),
    candidateCount: 1,
    status: "ready",
  };
}

function materialFor(
  value: GenerationJob,
  overrides: Partial<GenerationWorkerMaterial> = {},
): GenerationWorkerMaterial {
  return {
    text: `Segment ${value.segmentId} keeps its own weather and waits for the listener.`,
    immutableSourceHash: "b".repeat(64),
    voiceProfileId: "voice_service_narrator_001",
    voiceRevision: 4,
    direction: {
      segmentId: value.segmentId,
      narrativeDistance: "close",
      pace: 0.84,
      intensity: 0.4,
      warmth: 0.52,
      restraint: 0.81,
      clarity: 0.95,
      pauseBeforeMs: 120,
      pauseAfterMs: 240,
      emotionalObjective: "Hold the listener near the threshold without forcing suspense.",
      subtext: "The narrator knows the room is listening as well.",
      notes: ["Protect the last word and preserve the sentence shape."],
    },
    mode: "production",
    format: "wav",
    sampleRateHz: 48_000,
    rights: {
      rightsEvidenceId: "rights_service_001",
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

function wavBytes(request: SynthesisRequest): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    request.segmentId.length % 255,
    request.candidateIndex,
    2,
    3,
  ]);
}

class StaticCredentialResolver implements CredentialResolver {
  async resolve(): Promise<string> {
    return "test-worker-service-secret";
  }
}

interface PendingSynthesis {
  request: SynthesisRequest;
  context: ProviderExecutionContext;
  resolve: (result: SynthesisResult) => void;
  reject: (error: unknown) => void;
  abort: () => void;
}

class ControlledAdapter implements NarrationProviderAdapter {
  readonly providerId = "provider_primary";
  readonly adapterVersion = "1.0.0";
  readonly capability: ProviderCapabilitySnapshot;
  readonly pending: PendingSynthesis[] = [];
  startedCount = 0;
  activeCount = 0;
  maximumActive = 0;
  readonly #waiters: Array<Readonly<{ count: number; resolve: () => void }>> = [];

  constructor() {
    this.capability = createCapabilitySnapshot({
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      capturedAt: t0.toISOString(),
      features: ["batch-long-form", "style-instructions"],
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
    return this.capability;
  }

  async synthesise(
    request: SynthesisRequest,
    context: ProviderExecutionContext,
  ): Promise<SynthesisResult> {
    assert.equal(context.credential, "test-worker-service-secret");
    this.startedCount += 1;
    this.activeCount += 1;
    this.maximumActive = Math.max(this.maximumActive, this.activeCount);
    this.#resolveWaiters();

    return new Promise<SynthesisResult>((resolvePromise, rejectPromise) => {
      const abort = () => {
        this.activeCount -= 1;
        rejectPromise(context.signal?.reason ?? new Error("controlled provider aborted"));
      };
      context.signal?.addEventListener("abort", abort, { once: true });
      this.pending.push({
        request,
        context,
        resolve: (result) => {
          context.signal?.removeEventListener("abort", abort);
          this.activeCount -= 1;
          resolvePromise(result);
        },
        reject: (error) => {
          context.signal?.removeEventListener("abort", abort);
          this.activeCount -= 1;
          rejectPromise(error);
        },
        abort,
      });
    });
  }

  waitForStarted(count: number): Promise<void> {
    if (this.startedCount >= count) return Promise.resolve();
    return new Promise<void>((resolvePromise) => {
      this.#waiters.push({ count, resolve: resolvePromise });
    });
  }

  releaseNext(): void {
    const pending = this.pending.shift();
    if (!pending) throw new Error("controlled provider result unavailable");
    pending.resolve({
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      requestId: pending.request.requestId,
      idempotencyKey: pending.request.idempotencyKey,
      providerRequestId: `private-provider-${pending.request.segmentId}`,
      audio: wavBytes(pending.request),
      contentType: "audio/wav",
      usage: {
        inputCharacters: pending.request.text.length,
        outputSeconds: 4.1,
        estimatedCost: 0.02,
        currency: "AUD",
      },
      capabilityFingerprint: this.capability.fingerprint,
      generatedAt: "2026-07-27T00:00:01.000Z",
      provenance: {
        deterministicRequest: true,
        privateProviderDiagnostic: `private-${pending.request.segmentId}`,
      },
    });
  }

  #resolveWaiters(): void {
    for (let index = this.#waiters.length - 1; index >= 0; index -= 1) {
      const waiter = this.#waiters[index];
      if (waiter && this.startedCount >= waiter.count) {
        this.#waiters.splice(index, 1);
        waiter.resolve();
      }
    }
  }
}

async function withServiceState(
  run: (input: Readonly<{
    queue: FileGenerationQueue;
    materials: FileGenerationMaterialStore;
    registry: FileArtifactRegistry;
    objectStore: FilePrivateObjectStore;
    root: string;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-worker-service-"));
  try {
    const state = new FileProjectStore(join(root, "state"));
    await run({
      queue: new FileGenerationQueue(state, {
        baseBackoffMs: 100,
        maximumBackoffMs: 1_000,
      }),
      materials: new FileGenerationMaterialStore(state),
      registry: new FileArtifactRegistry(new FileProjectStore(join(root, "artifacts"))),
      objectStore: new FilePrivateObjectStore(join(root, "objects"), {
        provider: "evavo-private-file-store",
        container: "storyteller-production",
        region: "australia-southeast",
      }),
      root,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function prepare(
  queue: FileGenerationQueue,
  materials: FileGenerationMaterialStore,
  jobs: readonly GenerationJob[],
  now = t0,
): Promise<void> {
  for (const value of jobs) {
    await materials.create(value, materialFor(value), {
      actorId: "operator_service_001",
      now,
    });
    await queue.enqueue(value, { now, maxAttempts: 3 });
  }
}

function createService(input: Readonly<{
  queue: FileGenerationQueue;
  materials: FileGenerationMaterialStore;
  registry: FileArtifactRegistry;
  objectStore: FilePrivateObjectStore;
  adapter: ControlledAdapter;
  concurrency?: number;
  now?: () => Date;
}>): GenerationWorkerService {
  return new GenerationWorkerService(
    {
      queue: input.queue,
      materials: input.materials,
      providers: new ProviderAdapterRegistry([input.adapter]),
      credentials: new StaticCredentialResolver(),
      objectStore: input.objectStore,
      artifactRegistry: input.registry,
    },
    {
      workerId: "worker_service_001",
      verifierActorId: "verifier_service_001",
      concurrency: input.concurrency ?? 2,
      leaseDurationMs: 60_000,
      heartbeatIntervalMs: 20_000,
      providerTimeoutMs: 120_000,
      pollIntervalMs: 100,
      now: input.now,
    },
  );
}

test("run-until-idle respects the concurrency ceiling and completes every prepared job", async () => {
  await withServiceState(async ({ queue, materials, registry, objectStore }) => {
    const jobs = [job(1), job(2), job(3)];
    await prepare(queue, materials, jobs);
    const adapter = new ControlledAdapter();
    const service = createService({
      queue,
      materials,
      registry,
      objectStore,
      adapter,
      concurrency: 2,
    });

    const running = service.runUntilIdle();
    await adapter.waitForStarted(2);
    assert.equal(adapter.maximumActive, 2);
    assert.equal(adapter.startedCount, 2);
    adapter.releaseNext();
    adapter.releaseNext();
    await adapter.waitForStarted(3);
    assert.equal(adapter.maximumActive, 2);
    adapter.releaseNext();
    await running;

    const snapshot = service.snapshot();
    assert.equal(snapshot.state, "stopped");
    assert.equal(snapshot.claimedJobs, 3);
    assert.equal(snapshot.completedJobs, 3);
    assert.equal(snapshot.activeJobs, 0);
    assert.equal(snapshot.outcomeHistorySize, 3);
    assert.equal((await registry.list()).length, 6);
    for (const value of jobs) {
      assert.equal((await queue.read(`queue_${value.id}`))?.payload.status, "completed");
    }
  });
});

test("missing generation material blocks a claim without invoking a provider", async () => {
  await withServiceState(async ({ queue, materials, registry, objectStore }) => {
    const value = job(10);
    await queue.enqueue(value, { now: t0 });
    const adapter = new ControlledAdapter();
    const service = createService({ queue, materials, registry, objectStore, adapter });
    await service.runUntilIdle();

    const row = await queue.read(`queue_${value.id}`);
    assert.equal(row?.payload.status, "blocked");
    assert.deepEqual(row?.payload.block?.codes, ["GENERATION_MATERIAL_NOT_FOUND"]);
    assert.equal(adapter.startedCount, 0);
    assert.equal((await registry.list()).length, 0);
    assert.equal(service.snapshot().blockedJobs, 1);
  });
});

test("rights are revalidated at execution time before provider work begins", async () => {
  await withServiceState(async ({ queue, materials, registry, objectStore }) => {
    const value = job(11);
    await materials.create(value, materialFor(value, {
      rights: {
        ...materialFor(value).rights,
        expiresAt: "2026-07-27T00:05:00.000Z",
      },
    }), {
      actorId: "operator_service_001",
      now: t0,
    });
    await queue.enqueue(value, { now: t0 });
    const adapter = new ControlledAdapter();
    const service = createService({
      queue,
      materials,
      registry,
      objectStore,
      adapter,
      now: () => new Date("2026-07-27T00:10:00.000Z"),
    });
    await service.runUntilIdle();

    const row = await queue.read(`queue_${value.id}`);
    assert.equal(row?.payload.status, "blocked");
    assert.deepEqual(row?.payload.block?.codes, ["GENERATION_MATERIAL_RIGHTS_EXPIRED"]);
    assert.equal(adapter.startedCount, 0);
    assert.equal((await registry.list()).length, 0);
  });
});

test("drain stops new claims and lets an active provider finish before shutdown", async () => {
  await withServiceState(async ({ queue, materials, registry, objectStore }) => {
    const jobs = [job(20), job(21)];
    await prepare(queue, materials, jobs);
    const adapter = new ControlledAdapter();
    const service = createService({
      queue,
      materials,
      registry,
      objectStore,
      adapter,
      concurrency: 1,
    });

    const running = service.start();
    await adapter.waitForStarted(1);
    service.requestDrain();
    adapter.releaseNext();
    await running;

    assert.equal(service.snapshot().state, "stopped");
    assert.equal(service.snapshot().claimedJobs, 1);
    assert.equal(service.snapshot().completedJobs, 1);
    assert.equal(adapter.startedCount, 1);
    assert.equal((await queue.read(`queue_${jobs[0]!.id}`))?.payload.status, "completed");
    assert.equal((await queue.read(`queue_${jobs[1]!.id}`))?.payload.status, "queued");
  });
});

test("forced shutdown aborts active provider work and leaves the claim recoverable by lease expiry", async () => {
  await withServiceState(async ({ queue, materials, registry, objectStore }) => {
    const value = job(30);
    await prepare(queue, materials, [value]);
    const adapter = new ControlledAdapter();
    const service = createService({
      queue,
      materials,
      registry,
      objectStore,
      adapter,
      concurrency: 1,
    });

    const running = service.start();
    await adapter.waitForStarted(1);
    service.abortActive(new Error("operator forced shutdown"));
    await running;

    const row = await queue.read(`queue_${value.id}`);
    assert.equal(row?.payload.status, "leased");
    assert.equal(row?.payload.lease?.workerId, "worker_service_001");
    assert.equal((await registry.list()).length, 0);
    assert.equal(service.snapshot().state, "stopped");
    assert.equal(service.snapshot().abortedJobs, 1);
    assert.equal(adapter.activeCount, 0);
  });
});

test("service public state and outcomes omit worker, lease, credential and manuscript secrets", async () => {
  await withServiceState(async ({ queue, materials, registry, objectStore }) => {
    const value = job(40);
    await prepare(queue, materials, [value]);
    const adapter = new ControlledAdapter();
    const service = createService({ queue, materials, registry, objectStore, adapter });
    const running = service.runUntilIdle();
    await adapter.waitForStarted(1);
    const claimBeforeCompletion = await queue.read(`queue_${value.id}`);
    const leaseTokenHash = claimBeforeCompletion?.payload.lease?.tokenHash;
    adapter.releaseNext();
    await running;

    const publicView = generationWorkerServicePublicView(service);
    const serialised = JSON.stringify({ publicView, outcomes: service.outcomes() });
    assert.equal(serialised.includes("worker_service_001"), false);
    assert.equal(serialised.includes("test-worker-service-secret"), false);
    assert.equal(serialised.includes(materialFor(value).text), false);
    assert.equal(serialised.includes("voice_service_narrator_001"), false);
    assert.equal(serialised.includes("storyteller-production"), false);
    assert.equal(serialised.includes("private-provider"), false);
    if (leaseTokenHash) assert.equal(serialised.includes(leaseTokenHash), false);
    assert.equal(publicView.completedJobs, 1);
    assert.equal(publicView.lastDisposition, "completed");
  });
});
