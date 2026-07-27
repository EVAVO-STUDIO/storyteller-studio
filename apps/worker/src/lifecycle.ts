import type { GenerationWorkerServiceSnapshot } from "@evavo/storyteller-engine/worker-service";

export type WorkerProcessSignal = "SIGINT" | "SIGTERM";

export interface WorkerSignalSource {
  subscribe(listener: (signal: WorkerProcessSignal) => void): () => void;
}

export interface WorkerShutdownTimer {
  cancel(): void;
}

export interface WorkerShutdownScheduler {
  schedule(callback: () => void, delayMs: number): WorkerShutdownTimer;
}

export interface WorkerServiceControl {
  start(): Promise<void>;
  runUntilIdle(): Promise<void>;
  requestDrain(): void;
  abortActive(reason?: Error): void;
  snapshot(): GenerationWorkerServiceSnapshot;
}

export interface WorkerLifecycleResult {
  mode: "once" | "continuous";
  shutdownSignal?: WorkerProcessSignal;
  forcedAbort: boolean;
  service: GenerationWorkerServiceSnapshot;
}

function defaultSignalSource(): WorkerSignalSource {
  return {
    subscribe(listener) {
      const onInterrupt = () => listener("SIGINT");
      const onTerminate = () => listener("SIGTERM");
      process.on("SIGINT", onInterrupt);
      process.on("SIGTERM", onTerminate);
      return () => {
        process.off("SIGINT", onInterrupt);
        process.off("SIGTERM", onTerminate);
      };
    },
  };
}

function defaultShutdownScheduler(): WorkerShutdownScheduler {
  return {
    schedule(callback, delayMs) {
      const handle = setTimeout(callback, delayMs);
      handle.unref?.();
      return {
        cancel() {
          clearTimeout(handle);
        },
      };
    },
  };
}

export async function runWorkerLifecycle(input: Readonly<{
  service: WorkerServiceControl;
  mode: "once" | "continuous";
  shutdownGraceMs: number;
  signals?: WorkerSignalSource;
  scheduler?: WorkerShutdownScheduler;
}>): Promise<WorkerLifecycleResult> {
  if (
    !Number.isSafeInteger(input.shutdownGraceMs)
    || input.shutdownGraceMs < 1_000
    || input.shutdownGraceMs > 5 * 60_000
  ) {
    throw new Error("WORKER_LIFECYCLE_SHUTDOWN_GRACE_INVALID");
  }

  const signals = input.signals ?? defaultSignalSource();
  const scheduler = input.scheduler ?? defaultShutdownScheduler();
  let shutdownSignal: WorkerProcessSignal | undefined;
  let forcedAbort = false;
  let shutdownTimer: WorkerShutdownTimer | undefined;

  const forceAbort = (code: string): void => {
    if (forcedAbort) return;
    forcedAbort = true;
    shutdownTimer?.cancel();
    shutdownTimer = undefined;
    input.service.abortActive(new Error(code));
  };

  const unsubscribe = signals.subscribe((signal) => {
    if (!shutdownSignal) {
      shutdownSignal = signal;
      input.service.requestDrain();
      shutdownTimer = scheduler.schedule(() => {
        forceAbort("WORKER_PROCESS_SHUTDOWN_DEADLINE_EXCEEDED");
      }, input.shutdownGraceMs);
      return;
    }
    forceAbort("WORKER_PROCESS_SECOND_SIGNAL_ABORT");
  });

  try {
    const running = input.mode === "once"
      ? input.service.runUntilIdle()
      : input.service.start();
    await running;
    return Object.freeze({
      mode: input.mode,
      ...(shutdownSignal ? { shutdownSignal } : {}),
      forcedAbort,
      service: input.service.snapshot(),
    });
  } finally {
    shutdownTimer?.cancel();
    unsubscribe();
  }
}
