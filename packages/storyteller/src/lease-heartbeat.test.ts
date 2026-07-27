import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileGenerationQueue } from "./generation-queue.js";
import {
  GenerationLeaseHeartbeatController,
  GenerationLeaseOwnershipLostError,
  type LeaseHeartbeatScheduler,
  type LeaseHeartbeatTimer,
} from "./lease-heartbeat.js";
import { FileProjectStore } from "./project-store.js";
import type { GenerationJob } from "./index.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");

const job: GenerationJob = {
  id: "job_heartbeat_runtime_001",
  projectId: "project_heartbeat_runtime_001",
  segmentId: "segment_heartbeat_runtime_001",
  providerFallbackIds: ["provider_primary"],
  cacheKey: "a".repeat(64),
  candidateCount: 2,
  status: "ready",
};

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

async function withClaim(
  run: (input: Readonly<{
    queue: FileGenerationQueue;
    claim: NonNullable<Awaited<ReturnType<FileGenerationQueue["claimNext"]>>>;
  }>) => Promise<void>,
  leaseDurationMs = 5_000,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-lease-heartbeat-"));
  try {
    const queue = new FileGenerationQueue(
      new FileProjectStore(root),
      { baseBackoffMs: 100, maximumBackoffMs: 1_000 },
    );
    await queue.enqueue(job, { now: t0, maxAttempts: 4 });
    const claim = await queue.claimNext({
      workerId: "worker_heartbeat_001",
      leaseDurationMs,
      now: t0,
    });
    if (!claim) throw new Error("heartbeat claim required");
    await run({ queue, claim });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("scheduled heartbeats renew the same exclusive lease without exposing its token", async () => {
  await withClaim(async ({ queue, claim }) => {
    let current = new Date(t0.getTime() + 500);
    const scheduler = new ManualScheduler();
    const controller = new GenerationLeaseHeartbeatController(queue, claim, {
      leaseDurationMs: 2_000,
      heartbeatIntervalMs: 500,
      now: () => current,
      scheduler,
    });

    controller.start();
    assert.equal(controller.state, "running");
    assert.equal(scheduler.activeCount(), 1);
    await scheduler.runNext();

    const snapshot = controller.snapshot();
    assert.equal(snapshot.state, "running");
    assert.equal(snapshot.healthy, true);
    assert.equal(snapshot.heartbeatCount, 1);
    assert.equal(snapshot.revision, claim.envelope.revision + 1);
    assert.equal(snapshot.lastHeartbeatAt, current.toISOString());
    assert.equal(snapshot.expiresAt, new Date(current.getTime() + 2_000).toISOString());
    const serialised = JSON.stringify(snapshot);
    assert.equal(serialised.includes(claim.leaseToken), false);
    assert.equal(serialised.includes("worker_heartbeat_001"), false);
    assert.equal(scheduler.activeCount(), 1);

    current = new Date(current.getTime() + 500);
    await controller.stop();
    assert.equal(controller.snapshot().state, "stopped");
    assert.equal(scheduler.activeCount(), 0);
  });
});

test("overlapping heartbeat requests share one serial renewal", async () => {
  await withClaim(async ({ queue, claim }) => {
    const scheduler = new ManualScheduler();
    const controller = new GenerationLeaseHeartbeatController(queue, claim, {
      leaseDurationMs: 4_000,
      heartbeatIntervalMs: 1_000,
      now: () => new Date(t0.getTime() + 800),
      scheduler,
    });
    controller.start();

    const [first, second] = await Promise.all([
      controller.beat(),
      controller.beat(),
    ]);
    assert.equal(first.revision, second.revision);
    assert.equal(controller.snapshot().heartbeatCount, 1);
    assert.equal((await queue.read(claim.item.id))?.revision, claim.envelope.revision + 1);
    await controller.stop();
  });
});

test("ownership loss aborts provider work when another worker acquires the recovered lease", async () => {
  await withClaim(async ({ queue, claim }) => {
    let current = new Date(t0.getTime() + 100);
    const scheduler = new ManualScheduler();
    const controller = new GenerationLeaseHeartbeatController(queue, claim, {
      leaseDurationMs: 1_000,
      heartbeatIntervalMs: 250,
      now: () => current,
      scheduler,
    });
    controller.start();

    current = new Date(t0.getTime() + 1_001);
    assert.equal(await queue.reapExpiredLeases({ now: current }), 1);
    const waiting = await queue.read(claim.item.id);
    assert.equal(waiting?.payload.status, "retry-wait");
    current = new Date(Date.parse(waiting!.payload.availableAt) + 1);
    const replacement = await queue.claimNext({
      workerId: "worker_heartbeat_002",
      leaseDurationMs: 1_000,
      now: current,
    });
    assert.ok(replacement);

    current = new Date(current.getTime() + 10);
    await assert.rejects(
      controller.beat(),
      (error: unknown) => error instanceof GenerationLeaseOwnershipLostError,
    );
    assert.equal(controller.state, "lost");
    assert.equal(controller.signal.aborted, true);
    assert.throws(() => controller.assertHealthy(), GenerationLeaseOwnershipLostError);
    assert.equal(scheduler.activeCount(), 0);
    await controller.stop();
    assert.equal(controller.snapshot().state, "lost");
  }, 1_000);
});

test("heartbeat stops before a terminal transition so completion cannot race a renewal", async () => {
  await withClaim(async ({ queue, claim }) => {
    const scheduler = new ManualScheduler();
    const controller = new GenerationLeaseHeartbeatController(queue, claim, {
      leaseDurationMs: 5_000,
      heartbeatIntervalMs: 1_000,
      now: () => new Date(t0.getTime() + 500),
      scheduler,
    });
    controller.start();
    await controller.stopForTerminalTransition();
    assert.equal(controller.state, "stopped");
    assert.equal(scheduler.activeCount(), 0);

    const completed = await queue.complete(claim.item.id, claim.leaseToken, {
      executionReportHash: "b".repeat(64),
      resultIds: ["take_heartbeat_001", "take_heartbeat_002"],
      outputArtifactRefs: ["artifact_heartbeat_001", "artifact_heartbeat_002"],
      now: new Date(t0.getTime() + 500),
    });
    assert.equal(completed.payload.status, "completed");
    controller.assertHealthy();
    assert.equal(controller.snapshot().expiresAt, claim.item.lease?.expiresAt);
  });
});

test("heartbeat configuration rejects unsafe renewal intervals", async () => {
  await withClaim(async ({ queue, claim }) => {
    assert.throws(
      () => new GenerationLeaseHeartbeatController(queue, claim, {
        leaseDurationMs: 2_000,
        heartbeatIntervalMs: 1_000,
      }),
      /GENERATION_HEARTBEAT_INTERVAL_INVALID/u,
    );
    assert.throws(
      () => new GenerationLeaseHeartbeatController(queue, claim, {
        leaseDurationMs: 999,
        heartbeatIntervalMs: 250,
      }),
      /GENERATION_HEARTBEAT_LEASE_DURATION_INVALID/u,
    );
  });
});
