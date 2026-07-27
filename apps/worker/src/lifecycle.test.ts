import assert from "node:assert/strict";
import test from "node:test";
import type { GenerationWorkerServiceSnapshot } from "@evavo/storyteller-engine/worker-service";
import {
  runWorkerLifecycle,
  type WorkerProcessSignal,
  type WorkerServiceControl,
  type WorkerShutdownScheduler,
  type WorkerShutdownTimer,
  type WorkerSignalSource,
} from "./lifecycle.js";

class FakeSignalSource implements WorkerSignalSource {
  #listener: ((signal: WorkerProcessSignal) => void) | undefined;
  unsubscribeCount = 0;

  subscribe(listener: (signal: WorkerProcessSignal) => void): () => void {
    this.#listener = listener;
    return () => {
      this.unsubscribeCount += 1;
      this.#listener = undefined;
    };
  }

  emit(signal: WorkerProcessSignal): void {
    if (!this.#listener) throw new Error("worker signal listener unavailable");
    this.#listener(signal);
  }
}

class ManualShutdownTimer implements WorkerShutdownTimer {
  cancelled = false;

  constructor(readonly callback: () => void, readonly delayMs: number) {}

  cancel(): void {
    this.cancelled = true;
  }
}

class ManualShutdownScheduler implements WorkerShutdownScheduler {
  readonly timers: ManualShutdownTimer[] = [];

  schedule(callback: () => void, delayMs: number): WorkerShutdownTimer {
    const timer = new ManualShutdownTimer(callback, delayMs);
    this.timers.push(timer);
    return timer;
  }

  fireNext(): void {
    const timer = this.timers.find((candidate) => !candidate.cancelled);
    if (!timer) throw new Error("worker shutdown timer unavailable");
    timer.cancelled = true;
    timer.callback();
  }
}

class FakeWorkerService implements WorkerServiceControl {
  startCount = 0;
  runUntilIdleCount = 0;
  drainCount = 0;
  abortCount = 0;
  abortCode: string | undefined;
  state: GenerationWorkerServiceSnapshot["state"] = "idle";
  readonly started: Promise<void>;
  readonly #resolveStarted: () => void;
  readonly #running: Promise<void>;
  readonly #resolveRunning: () => void;

  constructor() {
    let resolveStarted: (() => void) | undefined;
    this.started = new Promise<void>((resolvePromise) => {
      resolveStarted = resolvePromise;
    });
    if (!resolveStarted) throw new Error("fake worker start resolver unavailable");
    this.#resolveStarted = resolveStarted;

    let resolveRunning: (() => void) | undefined;
    this.#running = new Promise<void>((resolvePromise) => {
      resolveRunning = resolvePromise;
    });
    if (!resolveRunning) throw new Error("fake worker run resolver unavailable");
    this.#resolveRunning = resolveRunning;
  }

  start(): Promise<void> {
    this.startCount += 1;
    this.state = "running";
    this.#resolveStarted();
    return this.#running;
  }

  runUntilIdle(): Promise<void> {
    this.runUntilIdleCount += 1;
    this.state = "running";
    this.#resolveStarted();
    return this.#running;
  }

  requestDrain(): void {
    this.drainCount += 1;
    this.state = "draining";
  }

  abortActive(reason?: Error): void {
    this.abortCount += 1;
    this.abortCode = reason?.message;
    this.state = "stopped";
    this.#resolveRunning();
  }

  complete(): void {
    this.state = "stopped";
    this.#resolveRunning();
  }

  snapshot(): GenerationWorkerServiceSnapshot {
    return {
      state: this.state,
      acceptingClaims: this.state === "running",
      activeJobs: 0,
      concurrency: 2,
      claimedJobs: 0,
      completedJobs: 0,
      blockedJobs: 0,
      retryingJobs: 0,
      failedJobs: 0,
      cancelledJobs: 0,
      ownershipLostJobs: 0,
      abortedJobs: this.abortCount,
      outcomeHistorySize: 0,
    };
  }
}

test("once mode runs until the queue is idle without installing a false shutdown outcome", async () => {
  const service = new FakeWorkerService();
  const signals = new FakeSignalSource();
  const lifecycle = runWorkerLifecycle({
    service,
    mode: "once",
    shutdownGraceMs: 30_000,
    signals,
  });
  await service.started;
  assert.equal(service.runUntilIdleCount, 1);
  assert.equal(service.startCount, 0);
  service.complete();
  const result = await lifecycle;
  assert.equal(result.mode, "once");
  assert.equal(result.shutdownSignal, undefined);
  assert.equal(result.forcedAbort, false);
  assert.equal(result.service.state, "stopped");
  assert.equal(signals.unsubscribeCount, 1);
});

test("first process signal requests a graceful drain and cancels the deadline after completion", async () => {
  const service = new FakeWorkerService();
  const signals = new FakeSignalSource();
  const scheduler = new ManualShutdownScheduler();
  const lifecycle = runWorkerLifecycle({
    service,
    mode: "continuous",
    shutdownGraceMs: 12_000,
    signals,
    scheduler,
  });
  await service.started;
  signals.emit("SIGTERM");
  assert.equal(service.drainCount, 1);
  assert.equal(service.abortCount, 0);
  assert.equal(scheduler.timers.length, 1);
  assert.equal(scheduler.timers[0]?.delayMs, 12_000);
  service.complete();

  const result = await lifecycle;
  assert.equal(result.shutdownSignal, "SIGTERM");
  assert.equal(result.forcedAbort, false);
  assert.equal(scheduler.timers[0]?.cancelled, true);
  assert.equal(signals.unsubscribeCount, 1);
});

test("shutdown deadline forces an abort while preserving a redacted lifecycle result", async () => {
  const service = new FakeWorkerService();
  const signals = new FakeSignalSource();
  const scheduler = new ManualShutdownScheduler();
  const lifecycle = runWorkerLifecycle({
    service,
    mode: "continuous",
    shutdownGraceMs: 5_000,
    signals,
    scheduler,
  });
  await service.started;
  signals.emit("SIGINT");
  scheduler.fireNext();

  const result = await lifecycle;
  assert.equal(service.abortCount, 1);
  assert.equal(service.abortCode, "WORKER_PROCESS_SHUTDOWN_DEADLINE_EXCEEDED");
  assert.equal(result.shutdownSignal, "SIGINT");
  assert.equal(result.forcedAbort, true);
  assert.equal(JSON.stringify(result).includes("credential"), false);
});

test("a second process signal aborts immediately instead of extending shutdown", async () => {
  const service = new FakeWorkerService();
  const signals = new FakeSignalSource();
  const scheduler = new ManualShutdownScheduler();
  const lifecycle = runWorkerLifecycle({
    service,
    mode: "continuous",
    shutdownGraceMs: 30_000,
    signals,
    scheduler,
  });
  await service.started;
  signals.emit("SIGTERM");
  signals.emit("SIGINT");

  const result = await lifecycle;
  assert.equal(service.drainCount, 1);
  assert.equal(service.abortCount, 1);
  assert.equal(service.abortCode, "WORKER_PROCESS_SECOND_SIGNAL_ABORT");
  assert.equal(result.shutdownSignal, "SIGTERM");
  assert.equal(result.forcedAbort, true);
  assert.equal(scheduler.timers[0]?.cancelled, true);
});

test("lifecycle rejects unbounded shutdown grace periods", async () => {
  const service = new FakeWorkerService();
  await assert.rejects(
    runWorkerLifecycle({
      service,
      mode: "once",
      shutdownGraceMs: 999,
    }),
    /WORKER_LIFECYCLE_SHUTDOWN_GRACE_INVALID/u,
  );
});
