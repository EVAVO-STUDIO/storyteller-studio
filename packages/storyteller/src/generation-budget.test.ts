import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileBudgetLedger,
  budgetMicros,
} from "./budget-ledger.js";
import {
  FileGenerationBudgetController,
  generationBudgetReservationPublicView,
  isGenerationBudgetAdmissionError,
} from "./generation-budget.js";
import { FileGenerationQueue, type GenerationQueueClaim } from "./generation-queue.js";
import type {
  GenerationWorkerMaterial,
  GenerationWorkerQueueTransition,
} from "./generation-worker.js";
import type { GenerationJob } from "./index.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");

const job: GenerationJob = {
  id: "job_generation_budget_001",
  projectId: "project_generation_budget_001",
  segmentId: "segment_generation_budget_001",
  providerFallbackIds: ["provider_generation_budget"],
  cacheKey: "a".repeat(64),
  candidateCount: 1,
  status: "ready",
};

function material(
  maximumTotalEstimatedCost = 0.4,
): GenerationWorkerMaterial {
  return {
    text: "The narrator waits until the room has settled before releasing the final phrase.",
    immutableSourceHash: "b".repeat(64),
    voiceProfileId: "voice_generation_budget_001",
    voiceRevision: 2,
    direction: {
      segmentId: job.segmentId,
      narrativeDistance: "close",
      pace: 0.84,
      intensity: 0.32,
      warmth: 0.48,
      restraint: 0.87,
      clarity: 0.96,
      pauseBeforeMs: 90,
      pauseAfterMs: 260,
      emotionalObjective: "Hold the listener's trust without announcing the tension.",
      subtext: "The silence carries the warning.",
      notes: ["Protect the final phrase."],
    },
    mode: "production",
    format: "wav",
    sampleRateHz: 48_000,
    rights: {
      rightsEvidenceId: "rights_generation_budget_001",
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

async function withBudget(
  run: (input: Readonly<{
    ledger: FileBudgetLedger;
    controller: FileGenerationBudgetController;
    queue: FileGenerationQueue;
    claim: GenerationQueueClaim;
  }>) => Promise<void>,
  options: Readonly<{
    authorisedMajorUnits?: number;
    controller?: ConstructorParameters<typeof FileGenerationBudgetController>[1];
  }> = {},
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-generation-budget-"));
  try {
    const store = new FileProjectStore(root);
    const ledger = new FileBudgetLedger(store);
    const queue = new FileGenerationQueue(store, {
      baseBackoffMs: 100,
      maximumBackoffMs: 1_000,
    });
    await ledger.createAccount({
      projectId: job.projectId,
      currency: "AUD",
      authorisedMicros: budgetMicros(options.authorisedMajorUnits ?? 1),
      actorId: "operator_generation_budget_001",
      now: t0,
    });
    await queue.enqueue(job, { now: t0, maxAttempts: 3 });
    const claim = await queue.claimNext({
      workerId: "worker_generation_budget_001",
      leaseDurationMs: 60_000,
      now: t0,
    });
    if (!claim) throw new Error("generation budget claim required");
    const controller = new FileGenerationBudgetController(
      ledger,
      options.controller ?? {
        baseReservationTtlMs: 10_000,
        providerTimeoutMarginMs: 2_000,
      },
    );
    await run({ ledger, controller, queue, claim });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function completeTransition(
  totalEstimatedCost: number,
  at = new Date(t0.getTime() + 1_000),
): GenerationWorkerQueueTransition {
  return {
    kind: "complete",
    codes: [],
    accounting: {
      attemptedProviderCount: 1,
      successfulResultCount: 1,
      totalEstimatedCost,
      currency: "AUD",
    },
    artifactIds: ["artifact_generation_budget_audio_001"],
    candidateTakeIds: ["take_generation_budget_001"],
    admissionFingerprint: "d".repeat(64),
    at: at.toISOString(),
  };
}

function blockTransition(input: Readonly<{
  attemptedProviderCount: number;
  successfulResultCount: number;
  totalEstimatedCost?: number;
  currency?: string;
  blockedCode?: string;
  kind?: "block" | "retry";
  at?: Date;
}>): GenerationWorkerQueueTransition {
  return {
    kind: input.kind ?? "block",
    codes: [input.blockedCode ?? "GENERATION_PROVIDER_CONFIGURATION_BLOCKED"],
    accounting: {
      attemptedProviderCount: input.attemptedProviderCount,
      successfulResultCount: input.successfulResultCount,
      ...(input.totalEstimatedCost !== undefined
        ? { totalEstimatedCost: input.totalEstimatedCost }
        : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      ...(input.blockedCode ? { blockedCode: input.blockedCode } : {}),
    },
    at: (input.at ?? new Date(t0.getTime() + 1_000)).toISOString(),
  };
}

test("budget reservation is created before provider execution and complete settlement commits actual cost", async () => {
  await withBudget(async ({ ledger, controller, claim }) => {
    const session = await controller.reserve({
      claim,
      material: material(0.4),
      actorId: "worker_generation_budget_001",
      providerTimeoutMs: 5_000,
      now: t0,
    });
    assert.equal(session.reservation.maximumMicros, budgetMicros(0.4));
    assert.equal(
      session.reservation.expiresAt,
      new Date(t0.getTime() + 10_000).toISOString(),
    );
    const reserved = await ledger.publicView(job.projectId, "AUD");
    assert.equal(reserved.reservedMicros, budgetMicros(0.4));
    assert.equal(reserved.committedMicros, 0);

    const settlement = await session.settle(completeTransition(0.12));
    assert.equal(settlement.status, "committed");
    assert.equal(settlement.committedMicros, budgetMicros(0.12));
    assert.equal(settlement.conservative, false);
    assert.equal(settlement.settlementCode, "GENERATION_BUDGET_COMPLETED");

    const final = await ledger.publicView(job.projectId, "AUD");
    assert.equal(final.reservedMicros, 0);
    assert.equal(final.committedMicros, budgetMicros(0.12));
    assert.equal(final.availableMicros, budgetMicros(0.88));
  });
});

test("configuration block before a provider attempt releases the reservation", async () => {
  await withBudget(async ({ ledger, controller, claim }) => {
    const session = await controller.reserve({
      claim,
      material: material(),
      actorId: "worker_generation_budget_001",
      providerTimeoutMs: 2_000,
      now: t0,
    });
    const settlement = await session.settle(blockTransition({
      attemptedProviderCount: 0,
      successfulResultCount: 0,
    }));
    assert.equal(settlement.status, "released");
    assert.equal(settlement.conservative, false);
    assert.equal(
      settlement.settlementCode,
      "GENERATION_BUDGET_BLOCKED_BEFORE_PROVIDER",
    );
    const view = await ledger.publicView(job.projectId, "AUD");
    assert.equal(view.reservedMicros, 0);
    assert.equal(view.committedMicros, 0);
    assert.equal(view.availableMicros, budgetMicros(1));
  });
});

test("retry without a provider attempt releases capacity for the next queue attempt", async () => {
  await withBudget(async ({ ledger, controller, claim }) => {
    const session = await controller.reserve({
      claim,
      material: material(),
      actorId: "worker_generation_budget_001",
      providerTimeoutMs: 2_000,
      now: t0,
    });
    const settlement = await session.settle(blockTransition({
      kind: "retry",
      attemptedProviderCount: 0,
      successfulResultCount: 0,
    }));
    assert.equal(settlement.status, "released");
    assert.equal(
      settlement.settlementCode,
      "GENERATION_BUDGET_RETRY_WITHOUT_PROVIDER",
    );
    assert.equal(
      (await ledger.publicView(job.projectId, "AUD")).availableMicros,
      budgetMicros(1),
    );
  });
});

test("partial successful output commits observed cost before a block or retry transition", async () => {
  await withBudget(async ({ ledger, controller, claim }) => {
    const session = await controller.reserve({
      claim,
      material: material(),
      actorId: "worker_generation_budget_001",
      providerTimeoutMs: 2_000,
      now: t0,
    });
    const settlement = await session.settle(blockTransition({
      kind: "retry",
      attemptedProviderCount: 2,
      successfulResultCount: 1,
      totalEstimatedCost: 0.08,
      currency: "AUD",
      blockedCode: "GENERATION_PROVIDER_EXECUTION_INCOMPLETE",
    }));
    assert.equal(settlement.status, "committed");
    assert.equal(settlement.committedMicros, budgetMicros(0.08));
    assert.equal(settlement.conservative, false);
    assert.equal(
      settlement.settlementCode,
      "GENERATION_BUDGET_PARTIAL_COST_COMMITTED",
    );
    assert.equal(
      (await ledger.publicView(job.projectId, "AUD")).availableMicros,
      budgetMicros(0.92),
    );
  });
});

test("unreconciled provider attempts conservatively commit the full reservation", async () => {
  await withBudget(async ({ ledger, controller, claim }) => {
    const session = await controller.reserve({
      claim,
      material: material(),
      actorId: "worker_generation_budget_001",
      providerTimeoutMs: 2_000,
      now: t0,
    });
    const settlement = await session.settle(blockTransition({
      kind: "retry",
      attemptedProviderCount: 1,
      successfulResultCount: 0,
      blockedCode: "GENERATION_PROVIDER_EXECUTION_INCOMPLETE",
    }));
    assert.equal(settlement.status, "committed");
    assert.equal(settlement.committedMicros, budgetMicros(0.4));
    assert.equal(settlement.conservative, true);
    assert.equal(
      settlement.settlementCode,
      "GENERATION_BUDGET_PROVIDER_ATTEMPT_UNRECONCILED",
    );
    assert.equal(
      (await ledger.publicView(job.projectId, "AUD")).availableMicros,
      budgetMicros(0.6),
    );
  });
});

test("observed partial cost above the reservation is capped and marked conservative", async () => {
  await withBudget(async ({ ledger, controller, claim }) => {
    const session = await controller.reserve({
      claim,
      material: material(),
      actorId: "worker_generation_budget_001",
      providerTimeoutMs: 2_000,
      now: t0,
    });
    const settlement = await session.settle(blockTransition({
      attemptedProviderCount: 1,
      successfulResultCount: 1,
      totalEstimatedCost: 0.5,
      currency: "AUD",
      blockedCode: "GENERATION_COST_POLICY_EXCEEDED",
    }));
    assert.equal(settlement.status, "committed");
    assert.equal(settlement.committedMicros, budgetMicros(0.4));
    assert.equal(settlement.conservative, true);
    assert.equal(
      settlement.settlementCode,
      "GENERATION_BUDGET_OBSERVED_COST_CAPPED",
    );
    assert.equal(
      (await ledger.publicView(job.projectId, "AUD")).committedMicros,
      budgetMicros(0.4),
    );
  });
});

test("interrupted work commits the maximum reservation and repeated settlement is idempotent", async () => {
  await withBudget(async ({ ledger, controller, claim }) => {
    const session = await controller.reserve({
      claim,
      material: material(),
      actorId: "worker_generation_budget_001",
      providerTimeoutMs: 2_000,
      now: t0,
    });
    const first = await session.settleInterrupted({
      code: "GENERATION_BUDGET_WORKER_INTERRUPTED",
      at: new Date(t0.getTime() + 1_000),
    });
    const repeated = await session.settle(completeTransition(0.01));
    assert.deepEqual(repeated, first);
    assert.equal(first.status, "committed");
    assert.equal(first.committedMicros, budgetMicros(0.4));
    assert.equal(first.conservative, true);
    assert.equal(
      first.settlementCode,
      "GENERATION_BUDGET_WORKER_INTERRUPTED",
    );
    assert.equal(
      (await ledger.publicView(job.projectId, "AUD")).committedMicros,
      budgetMicros(0.4),
    );
  });
});

test("controller requires policy, active claim, account capacity and bounded timing", async () => {
  await withBudget(async ({ controller, claim }) => {
    const withoutPolicy = { ...material(), costPolicy: undefined };
    await assert.rejects(
      controller.reserve({
        claim,
        material: withoutPolicy,
        actorId: "worker_generation_budget_001",
        providerTimeoutMs: 2_000,
        now: t0,
      }),
      /GENERATION_BUDGET_POLICY_REQUIRED/u,
    );
    await assert.rejects(
      controller.reserve({
        claim: {
          ...claim,
          item: { ...claim.item, status: "queued", lease: undefined },
        },
        material: material(),
        actorId: "worker_generation_budget_001",
        providerTimeoutMs: 2_000,
        now: t0,
      }),
      /GENERATION_BUDGET_ACTIVE_CLAIM_REQUIRED/u,
    );
    await assert.rejects(
      controller.reserve({
        claim,
        material: material(),
        actorId: "worker_generation_budget_001",
        providerTimeoutMs: 999,
        now: t0,
      }),
      /GENERATION_BUDGET_PROVIDER_TIMEOUT_INVALID/u,
    );
  }, { authorisedMajorUnits: 1 });

  await withBudget(async ({ controller, claim }) => {
    await assert.rejects(
      controller.reserve({
        claim,
        material: material(0.4),
        actorId: "worker_generation_budget_001",
        providerTimeoutMs: 2_000,
        now: t0,
      }),
      (error: unknown) => isGenerationBudgetAdmissionError(error),
    );
  }, { authorisedMajorUnits: 0.1 });
});

test("complete settlement fails closed on missing, mismatched or excessive accounting", async () => {
  await withBudget(async ({ controller, claim }) => {
    const missing = await controller.reserve({
      claim,
      material: material(),
      actorId: "worker_generation_budget_001",
      providerTimeoutMs: 2_000,
      now: t0,
    });
    await assert.rejects(
      missing.settle({
        ...completeTransition(0.1),
        accounting: {
          attemptedProviderCount: 1,
          successfulResultCount: 1,
        },
      }),
      /GENERATION_BUDGET_COMPLETION_ACCOUNTING_INVALID/u,
    );
  });

  await withBudget(async ({ controller, claim }) => {
    const mismatched = await controller.reserve({
      claim,
      material: material(),
      actorId: "worker_generation_budget_001",
      providerTimeoutMs: 2_000,
      now: t0,
    });
    await assert.rejects(
      mismatched.settle({
        ...completeTransition(0.1),
        accounting: {
          attemptedProviderCount: 1,
          successfulResultCount: 1,
          totalEstimatedCost: 0.1,
          currency: "USD",
        },
      }),
      /GENERATION_BUDGET_COMPLETION_ACCOUNTING_INVALID/u,
    );
  });

  await withBudget(async ({ controller, claim }) => {
    const excessive = await controller.reserve({
      claim,
      material: material(),
      actorId: "worker_generation_budget_001",
      providerTimeoutMs: 2_000,
      now: t0,
    });
    await assert.rejects(
      excessive.settle(completeTransition(0.400001)),
      /GENERATION_BUDGET_COMPLETION_EXCEEDS_RESERVATION/u,
    );
  });
});

test("public reservation projection omits project, queue and reservation identities", async () => {
  await withBudget(async ({ controller, claim }) => {
    const session = await controller.reserve({
      claim,
      material: material(),
      actorId: "worker_generation_budget_001",
      providerTimeoutMs: 2_000,
      now: t0,
    });
    const view = generationBudgetReservationPublicView(session.reservation);
    const serialised = JSON.stringify(view);
    for (const forbidden of [
      session.reservation.projectId,
      session.reservation.reservationId,
      claim.item.jobId,
      claim.item.id,
      claim.item.segmentId,
      claim.leaseToken,
    ]) assert.equal(serialised.includes(forbidden), false);
    assert.equal(view.currency, "AUD");
    assert.equal(view.maximumMicros, budgetMicros(0.4));
    assert.match(view.reservationFingerprint, /^[a-f0-9]{64}$/u);
  });
});
