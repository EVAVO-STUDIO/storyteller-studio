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
import type {
  LeaseHeartbeatScheduler,
  LeaseHeartbeatTimer,
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
import { GenerationWorkerService } from "./worker-service.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");

const job: GenerationJob = {
  id: "job_service_clock_001",
  projectId: "project_service_clock_001",
  segmentId: "segment_service_clock_001",
  providerFallbackIds: ["provider_clock"],
  cacheKey: "a".repeat(64),
  candidateCount: 1,
  status: "ready",
};

const material: GenerationWorkerMaterial = {
  text: "The house kept the last word until the listener was ready to hear it.",
  immutableSourceHash: "b".repeat(64),
  voiceProfileId: "voice_service_clock_001",
  voiceRevision: 3,
  direction: {
    segmentId: job.segmentId,
    narrativeDistance: "close",
    pace: 0.86,
    intensity: 0.35,
    warmth: 0.51,
    restraint: 0.84,
    clarity: 0.96,
    pauseBeforeMs: 100,
    pauseAfterMs: 240,
    emotionalObjective: "Keep the listener close without announcing the tension.",
    subtext: "The narrator knows the silence matters more than volume.",
    notes: ["Protect the final word and do not rush the release."],
  },
  mode: "production",
  format: "wav",
  sampleRateHz: 48_000,
  rights: {
    rightsEvidenceId: "rights_service_clock_001",
    rightsFingerprint: "c".repeat(64),
    allowedUses: ["audiobook"],
    commercialUseApproved: true,
    expiresAt: "2028-07-27T00:00:00.000Z",
  },
  intendedUse: "audiobook",
  commercial: true,
};

class ManualTimer implements LeaseHeartbeatTimer {
  cancelled = false;

  constructor(
    readonly callback: () => void | Promise<void>,
    readonly delayMs: number,
  ) {}

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
    if (!timer) throw new Error("manual worker-service heartbeat timer required");
    timer.cancelled = true;
    await timer.callback();
  }

  activeCount(): number {
    return this.timers.filter((timer) => !timer.cancelled).length;
  }
}

class StaticCredentialResolver implements CredentialResolver {
  async resolve(providerId: string): Promise<string> {
    assert.equal(providerId, "provider_clock");
    return "test-worker-service-clock-secret";
  }
}

class DeferredAdapter implements NarrationProviderAdapter {
  readonly providerId = "provider_clock";
  readonly adapterVersion = "1.0.0";
  readonly capability: ProviderCapabilitySnapshot;
  readonly started: Promise<void>;
  readonly #resolveStarted: () => void;
  #pending: Readonly<{
    request: SynthesisRequest;
    context: ProviderExecutionContext;
    resolve: (result: SynthesisResult) => void;
    reject: (error: unknown) => void;
    abort: () => void;
  }> | undefined;

  constructor() {
    this.capability = createCapabilitySnapshot({
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      capturedAt: t0.toISOString(),
      features: ["style-instructions"],
      maximumInputCharacters: 20_000,
      supportedFormats: ["wav"],
      supportedSampleRatesHz: [48_000],
      regions: ["australia"],
      storesInputs: false,
      trainsOnCustomerData: false,
      customVoiceRequiresConsent: true,
      rawPolicyVersion: "policy-2026-07",
    });
    let resolveStarted: (() => void) | undefined;
    this.started = new Promise<void>((resolvePromise) => {
      resolveStarted = resolvePromise;
    });
    if (!resolveStarted) throw new Error("deferred adapter start resolver unavailable");
    this.#resolveStarted = resolveStarted;
  }

  async inspectCapabilities(): Promise<ProviderCapabilitySnapshot> {
    return this.capability;
  }

  async synthesise(
    request: SynthesisRequest,
    context: ProviderExecutionContext,
  ): Promise<SynthesisResult> {
    assert.equal(context.credential, "test-worker-service-clock-secret");
    return new Promise<SynthesisResult>((resolvePromise, rejectPromise) => {
      const abort = () => rejectPromise(
        context.signal?.reason ?? new Error("worker-service clock provider aborted"),
      );
      context.signal?.addEventListener("abort", abort, { once: true });
      this.#pending = {
        request,
        context,
        resolve: resolvePromise,
        reject: rejectPromise,
        abort,
      };
      this.#resolveStarted();
    });
  }

  release(): void {
    const pending = this.#pending;
    if (!pending) throw new Error("deferred worker-service result unavailable");
    this.#pending = undefined;
    pending.context.signal?.removeEventListener("abort", pending.abort);
    pending.resolve({
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      requestId: pending.request.requestId,
      idempotencyKey: pending.request.idempotencyKey,
      providerRequestId: "private-provider-clock-001",
      audio: new Uint8Array([
        0x52, 0x49, 0x46, 0x46,
        0x04, 0x00, 0x00, 0x00,
        0x57, 0x41, 0x56, 0x45,
        1, 2, 3, 4,
      ]),
      contentType: "audio/wav",
      usage: {
        inputCharacters: pending.request.text.length,
        outputSeconds: 4.2,
      },
      capabilityFingerprint: this.capability.fingerprint,
      generatedAt: "2026-07-27T00:00:00.750Z",
      provenance: { deterministicRequest: true },
    });
  }
}

test("worker service uses the live clock after a heartbeat renewal", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-worker-service-clock-"));
  try {
    const state = new FileProjectStore(join(root, "state"));
    const queue = new FileGenerationQueue(state, {
      baseBackoffMs: 100,
      maximumBackoffMs: 1_000,
    });
    const materials = new FileGenerationMaterialStore(state);
    const registry = new FileArtifactRegistry(new FileProjectStore(join(root, "artifacts")));
    const objectStore = new FilePrivateObjectStore(join(root, "objects"), {
      provider: "evavo-private-file-store",
      container: "storyteller-production",
      region: "australia-southeast",
    });
    await materials.create(job, material, {
      actorId: "operator_service_clock_001",
      now: t0,
    });
    await queue.enqueue(job, { now: t0, maxAttempts: 3 });

    let current = t0;
    const scheduler = new ManualScheduler();
    const adapter = new DeferredAdapter();
    const service = new GenerationWorkerService(
      {
        queue,
        materials,
        providers: new ProviderAdapterRegistry([adapter]),
        credentials: new StaticCredentialResolver(),
        objectStore,
        artifactRegistry: registry,
      },
      {
        workerId: "worker_service_clock_001",
        verifierActorId: "verifier_service_clock_001",
        concurrency: 1,
        pollIntervalMs: 100,
        leaseDurationMs: 2_000,
        heartbeatIntervalMs: 500,
        heartbeatScheduler: scheduler,
        providerTimeoutMs: 120_000,
        now: () => current,
      },
    );

    const running = service.runUntilIdle();
    await adapter.started;
    assert.equal(scheduler.activeCount(), 1);

    current = new Date(t0.getTime() + 500);
    await scheduler.runNext();
    const renewed = await queue.read(`queue_${job.id}`);
    assert.equal(renewed?.payload.status, "leased");
    assert.equal(renewed?.payload.lease?.heartbeatAt, current.toISOString());
    assert.equal(renewed?.payload.updatedAt, current.toISOString());

    current = new Date(t0.getTime() + 750);
    adapter.release();
    await running;

    const completed = await queue.read(`queue_${job.id}`);
    assert.equal(completed?.payload.status, "completed");
    assert.equal(completed?.payload.updatedAt, current.toISOString());
    assert.equal(completed?.payload.completion?.completedAt, current.toISOString());
    assert.equal(service.snapshot().completedJobs, 1);
    assert.equal(service.snapshot().retryingJobs, 0);
    assert.equal(service.snapshot().failedJobs, 0);
    assert.equal(scheduler.activeCount(), 0);

    const artifacts = await registry.list();
    assert.equal(artifacts.length, 2);
    assert.equal(
      artifacts.every((artifact) => artifact.payload.createdAt === current.toISOString()),
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
