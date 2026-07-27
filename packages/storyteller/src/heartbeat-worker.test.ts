import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileArtifactRegistry } from "./artifact-store.js";
import { FileGenerationQueue } from "./generation-queue.js";
import {
  heartbeatingGenerationWorkerPublicView,
  runGenerationWorkerWithHeartbeat,
} from "./heartbeat-worker.js";
import {
  GenerationLeaseOwnershipLostError,
  type LeaseHeartbeatScheduler,
  type LeaseHeartbeatTimer,
} from "./lease-heartbeat.js";
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
import type { GenerationJob, PerformanceDirection } from "./index.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");

const job: GenerationJob = {
  id: "job_heartbeat_worker_001",
  projectId: "project_heartbeat_worker_001",
  segmentId: "segment_heartbeat_worker_001",
  providerFallbackIds: ["provider_primary"],
  cacheKey: "a".repeat(64),
  candidateCount: 1,
  status: "ready",
};

const direction: PerformanceDirection = {
  segmentId: job.segmentId,
  narrativeDistance: "close",
  pace: 0.84,
  intensity: 0.41,
  warmth: 0.52,
  restraint: 0.8,
  clarity: 0.94,
  pauseBeforeMs: 120,
  pauseAfterMs: 240,
  emotionalObjective: "Draw the listener closer while preserving uncertainty.",
  subtext: "The narrator understands more than the character does.",
  notes: ["Protect the final phrase and avoid synthetic suspense."],
};

function wavBytes(): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    1, 2, 3, 4,
  ]);
}

class ManualTimer implements LeaseHeartbeatTimer {
  cancelled = false;
  readonly callback: () => void | Promise<void>;
  readonly delayMs: number;

  constructor(callback: () => void | Promise<void>, delayMs: number) {
    this.callback = callback;
    this.delayMs = delayMs;
  }

  cancel(): void {
    this.cancelled = true;
  }
}

class ManualScheduler implements LeaseHeartbeatScheduler {
  readonly timers: ManualTimer[] = [];

  schedule(callback: () => void | Promise<void>, delayMs: number): LeaseHeartbeatTimer {
    const timer = new ManualTimer(callback, delayMs);
    this.timers.push(timer);
    return timer;
  }

  async runNext(): Promise<void> {
    const timer = this.timers.find((candidate) => !candidate.cancelled);
    if (!timer) throw new Error("manual heartbeat timer required");
    timer.cancelled = true;
    await timer.callback();
  }

  activeCount(): number {
    return this.timers.filter((timer) => !timer.cancelled).length;
  }
}

class StaticCredentialResolver implements CredentialResolver {
  async resolve(): Promise<string> {
    return "test-provider-secret";
  }
}

class DeferredAdapter implements NarrationProviderAdapter {
  readonly providerId = "provider_primary";
  readonly adapterVersion = "1.0.0";
  readonly capability: ProviderCapabilitySnapshot;
  readonly started: Promise<void>;
  #startedResolve!: () => void;
  #release: (() => void) | undefined;

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
    });
    this.started = new Promise<void>((resolvePromise) => {
      this.#startedResolve = resolvePromise;
    });
  }

  async inspectCapabilities(): Promise<ProviderCapabilitySnapshot> {
    return this.capability;
  }

  async synthesise(
    request: SynthesisRequest,
    context: ProviderExecutionContext,
  ): Promise<SynthesisResult> {
    assert.equal(context.credential, "test-provider-secret");
    return new Promise<SynthesisResult>((resolvePromise, reject) => {
      const abort = () => {
        reject(context.signal?.reason ?? new Error("provider execution aborted"));
      };
      context.signal?.addEventListener("abort", abort, { once: true });
      this.#release = () => {
        context.signal?.removeEventListener("abort", abort);
        resolvePromise({
          providerId: this.providerId,
          adapterVersion: this.adapterVersion,
          requestId: request.requestId,
          idempotencyKey: request.idempotencyKey,
          providerRequestId: "private-provider-request-heartbeat-worker-001",
          audio: wavBytes(),
          contentType: "audio/wav",
          usage: {
            inputCharacters: request.text.length,
            outputSeconds: 4.1,
            estimatedCost: 0.02,
            currency: "AUD",
          },
          capabilityFingerprint: this.capability.fingerprint,
          generatedAt: "2026-07-27T00:00:01.000Z",
          provenance: { deterministicRequest: true },
        });
      };
      this.#startedResolve();
    });
  }

  release(): void {
    const release = this.#release;
    if (!release) throw new Error("deferred provider release unavailable");
    this.#release = undefined;
    release();
  }
}

async function withRuntime(
  run: (input: Readonly<{
    queue: FileGenerationQueue;
    claim: NonNullable<Awaited<ReturnType<FileGenerationQueue["claimNext"]>>>;
    registry: FileArtifactRegistry;
    objectStore: FilePrivateObjectStore;
  }>) => Promise<void>,
  leaseDurationMs = 2_000,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-heartbeat-worker-"));
  try {
    const queue = new FileGenerationQueue(
      new FileProjectStore(join(root, "queue")),
      { baseBackoffMs: 100, maximumBackoffMs: 1_000 },
    );
    await queue.enqueue(job, { now: t0, maxAttempts: 4 });
    const claim = await queue.claimNext({
      workerId: "worker_heartbeat_runtime_001",
      leaseDurationMs,
      now: t0,
    });
    if (!claim) throw new Error("heartbeating worker claim required");
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

function workerMaterial() {
  return {
    text: "The house kept its own weather, and Mara listened at the locked door.",
    immutableSourceHash: "b".repeat(64),
    voiceProfileId: "voice_narrator_001",
    voiceRevision: 2,
    direction,
    format: "wav" as const,
    sampleRateHz: 48_000,
    rights: {
      rightsEvidenceId: "rights_heartbeat_worker_001",
      rightsFingerprint: "c".repeat(64),
      allowedUses: ["audiobook" as const],
      commercialUseApproved: true,
      expiresAt: "2028-07-27T00:00:00.000Z",
    },
    intendedUse: "audiobook" as const,
    commercial: true,
    costPolicy: {
      currency: "AUD",
      maximumTotalEstimatedCost: 0.1,
    },
  };
}

test("heartbeat renews during provider execution and stops before verified completion", async () => {
  await withRuntime(async ({ queue, claim, registry, objectStore }) => {
    let current = new Date(t0.getTime() + 400);
    const scheduler = new ManualScheduler();
    const adapter = new DeferredAdapter();
    const running = runGenerationWorkerWithHeartbeat({
      queue,
      claim,
      providers: new ProviderAdapterRegistry([adapter]),
      credentials: new StaticCredentialResolver(),
      objectStore,
      artifactRegistry: registry,
      material: workerMaterial(),
      workerActorId: "worker_heartbeat_runtime_001",
      verifierActorId: "verifier_heartbeat_runtime_001",
      now: new Date(t0.getTime() + 1_200),
      heartbeat: {
        leaseDurationMs: 2_000,
        heartbeatIntervalMs: 500,
        now: () => current,
        scheduler,
      },
    });

    await adapter.started;
    assert.equal(scheduler.activeCount(), 1);
    await scheduler.runNext();
    current = new Date(current.getTime() + 100);
    adapter.release();
    const result = await running;

    assert.equal(result.worker.queueEnvelope.payload.status, "completed");
    assert.equal(result.heartbeat.state, "stopped");
    assert.equal(result.heartbeat.healthy, true);
    assert.equal(result.heartbeat.heartbeatCount, 1);
    assert.equal(scheduler.activeCount(), 0);
    assert.equal((await registry.list({ jobId: job.id })).length, 2);

    const publicView = heartbeatingGenerationWorkerPublicView(result);
    const serialised = JSON.stringify(publicView);
    assert.equal(serialised.includes(claim.leaseToken), false);
    assert.equal(serialised.includes("worker_heartbeat_runtime_001"), false);
    assert.equal(serialised.includes("test-provider-secret"), false);
    assert.equal(serialised.includes("private-provider-request"), false);
    assert.equal(serialised.includes("storyteller-production"), false);
  });
});

test("lease recovery aborts the stale provider and prevents post-loss artifacts or terminal writes", async () => {
  await withRuntime(async ({ queue, claim, registry, objectStore }) => {
    let current = new Date(t0.getTime() + 100);
    const scheduler = new ManualScheduler();
    const adapter = new DeferredAdapter();
    const running = runGenerationWorkerWithHeartbeat({
      queue,
      claim,
      providers: new ProviderAdapterRegistry([adapter]),
      credentials: new StaticCredentialResolver(),
      objectStore,
      artifactRegistry: registry,
      material: workerMaterial(),
      workerActorId: "worker_heartbeat_runtime_001",
      now: new Date(t0.getTime() + 5_000),
      heartbeat: {
        leaseDurationMs: 1_000,
        heartbeatIntervalMs: 250,
        now: () => current,
        scheduler,
      },
    });

    await adapter.started;
    current = new Date(t0.getTime() + 1_001);
    assert.equal(await queue.reapExpiredLeases({ now: current }), 1);
    const waiting = await queue.read(claim.item.id);
    assert.equal(waiting?.payload.status, "retry-wait");
    current = new Date(Date.parse(waiting!.payload.availableAt) + 1);
    const replacement = await queue.claimNext({
      workerId: "worker_heartbeat_runtime_002",
      leaseDurationMs: 1_000,
      now: current,
    });
    assert.ok(replacement);

    current = new Date(current.getTime() + 10);
    await scheduler.runNext();
    await assert.rejects(
      running,
      (error: unknown) => error instanceof GenerationLeaseOwnershipLostError,
    );

    const authoritative = await queue.read(claim.item.id);
    assert.equal(authoritative?.payload.status, "leased");
    assert.equal(authoritative?.payload.lease?.workerId, "worker_heartbeat_runtime_002");
    assert.equal(authoritative?.revision, replacement!.envelope.revision);
    assert.equal((await registry.list({ jobId: job.id })).length, 0);
    assert.equal(scheduler.activeCount(), 0);
  }, 1_000);
});

test("an already aborted external signal starts no heartbeat or provider work", async () => {
  await withRuntime(async ({ queue, claim, registry, objectStore }) => {
    const scheduler = new ManualScheduler();
    const adapter = new DeferredAdapter();
    const external = new AbortController();
    const reason = new Error("operator shutdown");
    external.abort(reason);

    await assert.rejects(
      runGenerationWorkerWithHeartbeat({
        queue,
        claim,
        providers: new ProviderAdapterRegistry([adapter]),
        credentials: new StaticCredentialResolver(),
        objectStore,
        artifactRegistry: registry,
        material: workerMaterial(),
        workerActorId: "worker_heartbeat_runtime_001",
        signal: external.signal,
        heartbeat: {
          leaseDurationMs: 2_000,
          heartbeatIntervalMs: 500,
          scheduler,
        },
      }),
      (error: unknown) => error === reason,
    );
    assert.equal(scheduler.activeCount(), 0);
    assert.equal((await queue.read(claim.item.id))?.payload.status, "leased");
    assert.equal((await registry.list()).length, 0);
  });
});
