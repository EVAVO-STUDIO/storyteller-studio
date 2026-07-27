import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileArtifactRegistry } from "./artifact-store.js";
import {
  FileBudgetLedger,
  budgetMicros,
} from "./budget-ledger.js";
import { FileGenerationBudgetController } from "./generation-budget.js";
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
import { GenerationWorkerService } from "./worker-service.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");

const job: GenerationJob = {
  id: "job_service_budget_001",
  projectId: "project_service_budget_001",
  segmentId: "segment_service_budget_001",
  providerFallbackIds: ["provider_budget"],
  cacheKey: "a".repeat(64),
  candidateCount: 1,
  status: "ready",
};

function material(
  maximumTotalEstimatedCost = 0.1,
): GenerationWorkerMaterial {
  return {
    text: "The voice waits a fraction longer, then gives the listener the final word.",
    immutableSourceHash: "b".repeat(64),
    voiceProfileId: "voice_service_budget_001",
    voiceRevision: 2,
    direction: {
      segmentId: job.segmentId,
      narrativeDistance: "close",
      pace: 0.83,
      intensity: 0.36,
      warmth: 0.5,
      restraint: 0.86,
      clarity: 0.96,
      pauseBeforeMs: 100,
      pauseAfterMs: 250,
      emotionalObjective: "Invite the listener nearer without performing importance.",
      subtext: "The withheld word changes the room.",
      notes: ["Keep the ending complete and unforced."],
    },
    mode: "production",
    format: "wav",
    sampleRateHz: 48_000,
    rights: {
      rightsEvidenceId: "rights_service_budget_001",
      rightsFingerprint: "c".repeat(64),
      allowedUses: ["audiobook"],
      commercialUseApproved: true,
      expiresAt: "2028-07-27T00:00:00.000Z",
    },
    intendedUse: "audiobook",
    commercial: true,
    costPolicy: {
      currency: "AUD",
      maximumTotalEstimatedCost,
    },
  };
}

function wavBytes(request: SynthesisRequest): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    request.candidateIndex,
    2,
    3,
    4,
  ]);
}

class StaticCredentials implements CredentialResolver {
  async resolve(providerId: string): Promise<string> {
    assert.equal(providerId, "provider_budget");
    return "fixture-worker-budget-credential";
  }
}

interface PendingResult {
  request: SynthesisRequest;
  context: ProviderExecutionContext;
  resolve: (result: SynthesisResult) => void;
  reject: (error: unknown) => void;
  abort: () => void;
}

class DeferredBudgetAdapter implements NarrationProviderAdapter {
  readonly providerId = "provider_budget";
  readonly adapterVersion = "1.0.0";
  readonly capability: ProviderCapabilitySnapshot;
  readonly started: Promise<void>;
  readonly #resolveStarted: () => void;
  #pending: PendingResult | undefined;
  startedCount = 0;

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
    if (!resolveStarted) throw new Error("budget adapter start resolver unavailable");
    this.#resolveStarted = resolveStarted;
  }

  async inspectCapabilities(): Promise<ProviderCapabilitySnapshot> {
    return this.capability;
  }

  async synthesise(
    request: SynthesisRequest,
    context: ProviderExecutionContext,
  ): Promise<SynthesisResult> {
    assert.equal(context.credential, "fixture-worker-budget-credential");
    this.startedCount += 1;
    this.#resolveStarted();
    return new Promise<SynthesisResult>((resolvePromise, rejectPromise) => {
      const abort = () => rejectPromise(
        context.signal?.reason ?? new Error("budget provider aborted"),
      );
      context.signal?.addEventListener("abort", abort, { once: true });
      this.#pending = {
        request,
        context,
        resolve: resolvePromise,
        reject: rejectPromise,
        abort,
      };
    });
  }

  releaseSuccess(cost = 0.02): void {
    const pending = this.#pending;
    if (!pending) throw new Error("budget provider result unavailable");
    this.#pending = undefined;
    pending.context.signal?.removeEventListener("abort", pending.abort);
    pending.resolve({
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      requestId: pending.request.requestId,
      idempotencyKey: pending.request.idempotencyKey,
      providerRequestId: "private-provider-service-budget-001",
      audio: wavBytes(pending.request),
      contentType: "audio/wav",
      usage: {
        inputCharacters: pending.request.text.length,
        outputSeconds: 4.2,
        estimatedCost: cost,
        currency: "AUD",
      },
      capabilityFingerprint: this.capability.fingerprint,
      generatedAt: "2026-07-27T00:00:01.000Z",
      provenance: { deterministicRequest: true },
    });
  }

  releaseFailure(): void {
    const pending = this.#pending;
    if (!pending) throw new Error("budget provider failure unavailable");
    this.#pending = undefined;
    pending.context.signal?.removeEventListener("abort", pending.abort);
    pending.reject(new Error("temporary provider outage"));
  }
}

async function withBudgetService(
  run: (input: Readonly<{
    state: FileProjectStore;
    queue: FileGenerationQueue;
    materials: FileGenerationMaterialStore;
    ledger: FileBudgetLedger;
    controller: FileGenerationBudgetController;
    registry: FileArtifactRegistry;
    objectStore: FilePrivateObjectStore;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-worker-service-budget-"));
  try {
    const state = new FileProjectStore(join(root, "state"));
    const ledger = new FileBudgetLedger(state);
    await run({
      state,
      queue: new FileGenerationQueue(state, {
        baseBackoffMs: 100,
        maximumBackoffMs: 1_000,
      }),
      materials: new FileGenerationMaterialStore(state),
      ledger,
      controller: new FileGenerationBudgetController(ledger, {
        baseReservationTtlMs: 10_000,
        providerTimeoutMarginMs: 2_000,
      }),
      registry: new FileArtifactRegistry(new FileProjectStore(join(root, "artifacts"))),
      objectStore: new FilePrivateObjectStore(join(root, "objects"), {
        provider: "evavo-private-file-store",
        container: "storyteller-production",
        region: "australia-southeast",
      }),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function prepare(
  queue: FileGenerationQueue,
  materials: FileGenerationMaterialStore,
  value: GenerationJob = job,
  workerMaterial: GenerationWorkerMaterial = material(),
): Promise<void> {
  await materials.create(value, workerMaterial, {
    actorId: "operator_service_budget_001",
    now: t0,
  });
  await queue.enqueue(value, { now: t0, maxAttempts: 3 });
}

function createService(input: Readonly<{
  queue: FileGenerationQueue;
  materials: FileGenerationMaterialStore;
  controller?: FileGenerationBudgetController;
  registry: FileArtifactRegistry;
  objectStore: FilePrivateObjectStore;
  providers: ProviderAdapterRegistry;
  now?: () => Date;
}>): GenerationWorkerService {
  return new GenerationWorkerService(
    {
      queue: input.queue,
      materials: input.materials,
      providers: input.providers,
      credentials: new StaticCredentials(),
      objectStore: input.objectStore,
      artifactRegistry: input.registry,
      ...(input.controller ? { budgetController: input.controller } : {}),
    },
    {
      workerId: "worker_service_budget_001",
      verifierActorId: "verifier_service_budget_001",
      concurrency: 1,
      leaseDurationMs: 60_000,
      heartbeatIntervalMs: 20_000,
      providerTimeoutMs: 5_000,
      pollIntervalMs: 100,
      requireBudget: true,
      ...(input.now ? { now: input.now } : {}),
    },
  );
}

test("required budget controller must be configured before the service can start", async () => {
  await withBudgetService(async ({ queue, materials, registry, objectStore }) => {
    assert.throws(
      () => createService({
        queue,
        materials,
        registry,
        objectStore,
        providers: new ProviderAdapterRegistry(),
      }),
      /GENERATION_WORKER_SERVICE_BUDGET_CONTROLLER_REQUIRED/u,
    );
  });
});

test("worker reserves the maximum before provider invocation and commits actual cost before completion", async () => {
  await withBudgetService(async ({
    queue,
    materials,
    ledger,
    controller,
    registry,
    objectStore,
  }) => {
    await ledger.createAccount({
      projectId: job.projectId,
      currency: "AUD",
      authorisedMicros: budgetMicros(1),
      actorId: "operator_service_budget_001",
      now: t0,
    });
    await prepare(queue, materials);
    let current = t0;
    const adapter = new DeferredBudgetAdapter();
    const service = createService({
      queue,
      materials,
      controller,
      registry,
      objectStore,
      providers: new ProviderAdapterRegistry([adapter]),
      now: () => current,
    });

    const running = service.runUntilIdle();
    await adapter.started;
    const duringProvider = await ledger.publicView(job.projectId, "AUD");
    assert.equal(duringProvider.reservedMicros, budgetMicros(0.1));
    assert.equal(duringProvider.committedMicros, 0);
    assert.equal((await queue.read(`queue_${job.id}`))?.payload.status, "leased");

    current = new Date(t0.getTime() + 1_000);
    adapter.releaseSuccess(0.02);
    await running;

    const finalBudget = await ledger.publicView(job.projectId, "AUD");
    assert.equal(finalBudget.reservedMicros, 0);
    assert.equal(finalBudget.committedMicros, budgetMicros(0.02));
    assert.equal(finalBudget.availableMicros, budgetMicros(0.98));
    assert.equal((await queue.read(`queue_${job.id}`))?.payload.status, "completed");
    assert.equal(service.snapshot().completedJobs, 1);
    assert.equal((await registry.list()).length, 2);
  });
});

test("missing budget account blocks before provider invocation", async () => {
  await withBudgetService(async ({
    queue,
    materials,
    controller,
    registry,
    objectStore,
  }) => {
    await prepare(queue, materials);
    const adapter = new DeferredBudgetAdapter();
    const service = createService({
      queue,
      materials,
      controller,
      registry,
      objectStore,
      providers: new ProviderAdapterRegistry([adapter]),
      now: () => t0,
    });
    await service.runUntilIdle();

    const row = await queue.read(`queue_${job.id}`);
    assert.equal(row?.payload.status, "blocked");
    assert.deepEqual(row?.payload.block?.codes, ["BUDGET_ACCOUNT_NOT_FOUND"]);
    assert.equal(adapter.startedCount, 0);
    assert.equal((await registry.list()).length, 0);
  });
});

test("insufficient available budget blocks before provider invocation", async () => {
  await withBudgetService(async ({
    queue,
    materials,
    ledger,
    controller,
    registry,
    objectStore,
  }) => {
    await ledger.createAccount({
      projectId: job.projectId,
      currency: "AUD",
      authorisedMicros: budgetMicros(0.05),
      actorId: "operator_service_budget_001",
      now: t0,
    });
    await prepare(queue, materials);
    const adapter = new DeferredBudgetAdapter();
    const service = createService({
      queue,
      materials,
      controller,
      registry,
      objectStore,
      providers: new ProviderAdapterRegistry([adapter]),
      now: () => t0,
    });
    await service.runUntilIdle();

    const row = await queue.read(`queue_${job.id}`);
    assert.equal(row?.payload.status, "blocked");
    assert.deepEqual(row?.payload.block?.codes, ["BUDGET_INSUFFICIENT_AVAILABLE_FUNDS"]);
    assert.equal(adapter.startedCount, 0);
    assert.equal(
      (await ledger.publicView(job.projectId, "AUD")).availableMicros,
      budgetMicros(0.05),
    );
  });
});

test("provider configuration block releases the reservation before queue block", async () => {
  await withBudgetService(async ({
    queue,
    materials,
    ledger,
    controller,
    registry,
    objectStore,
  }) => {
    await ledger.createAccount({
      projectId: job.projectId,
      currency: "AUD",
      authorisedMicros: budgetMicros(1),
      actorId: "operator_service_budget_001",
      now: t0,
    });
    await prepare(queue, materials);
    const service = createService({
      queue,
      materials,
      controller,
      registry,
      objectStore,
      providers: new ProviderAdapterRegistry(),
      now: () => t0,
    });
    await service.runUntilIdle();

    const row = await queue.read(`queue_${job.id}`);
    assert.equal(row?.payload.status, "blocked");
    assert.deepEqual(row?.payload.block?.codes, ["GENERATION_PROVIDER_CONFIGURATION_BLOCKED"]);
    const budget = await ledger.publicView(job.projectId, "AUD");
    assert.equal(budget.reservedMicros, 0);
    assert.equal(budget.committedMicros, 0);
    assert.equal(budget.availableMicros, budgetMicros(1));
  });
});

test("attempted provider failure conservatively commits the reservation before retry", async () => {
  await withBudgetService(async ({
    queue,
    materials,
    ledger,
    controller,
    registry,
    objectStore,
  }) => {
    await ledger.createAccount({
      projectId: job.projectId,
      currency: "AUD",
      authorisedMicros: budgetMicros(1),
      actorId: "operator_service_budget_001",
      now: t0,
    });
    await prepare(queue, materials);
    let current = t0;
    const adapter = new DeferredBudgetAdapter();
    const service = createService({
      queue,
      materials,
      controller,
      registry,
      objectStore,
      providers: new ProviderAdapterRegistry([adapter]),
      now: () => current,
    });
    const running = service.runUntilIdle();
    await adapter.started;
    current = new Date(t0.getTime() + 1_000);
    adapter.releaseFailure();
    await running;

    const row = await queue.read(`queue_${job.id}`);
    assert.equal(row?.payload.status, "retry-wait");
    assert.equal(row?.payload.lastFailure?.code, "GENERATION_PROVIDER_EXECUTION_INCOMPLETE");
    const budget = await ledger.publicView(job.projectId, "AUD");
    assert.equal(budget.reservedMicros, 0);
    assert.equal(budget.committedMicros, budgetMicros(0.1));
    assert.equal(service.snapshot().retryingJobs, 1);
  });
});

test("forced abort conservatively settles the reservation and leaves the claim recoverable", async () => {
  await withBudgetService(async ({
    queue,
    materials,
    ledger,
    controller,
    registry,
    objectStore,
  }) => {
    await ledger.createAccount({
      projectId: job.projectId,
      currency: "AUD",
      authorisedMicros: budgetMicros(1),
      actorId: "operator_service_budget_001",
      now: t0,
    });
    await prepare(queue, materials);
    let current = t0;
    const adapter = new DeferredBudgetAdapter();
    const service = createService({
      queue,
      materials,
      controller,
      registry,
      objectStore,
      providers: new ProviderAdapterRegistry([adapter]),
      now: () => current,
    });
    const running = service.runUntilIdle();
    await adapter.started;
    current = new Date(t0.getTime() + 1_000);
    service.abortActive(new Error("test forced budget abort"));
    await running;

    assert.equal((await queue.read(`queue_${job.id}`))?.payload.status, "leased");
    const budget = await ledger.publicView(job.projectId, "AUD");
    assert.equal(budget.reservedMicros, 0);
    assert.equal(budget.committedMicros, budgetMicros(0.1));
    assert.equal(service.snapshot().abortedJobs, 1);
  });
});
