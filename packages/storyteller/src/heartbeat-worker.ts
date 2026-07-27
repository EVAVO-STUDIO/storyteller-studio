import {
  generationWorkerPublicView,
  runClaimedGenerationWorker,
  type ClaimedGenerationWorkerInput,
  type GenerationWorkerPublicView,
  type GenerationWorkerQueueTransition,
  type GenerationWorkerResult,
} from "./generation-worker.js";
import {
  GenerationLeaseHeartbeatController,
  type GenerationLeaseHeartbeatOptions,
  type LeaseHeartbeatSnapshot,
} from "./lease-heartbeat.js";

export interface HeartbeatingGenerationWorkerInput
  extends Omit<
    ClaimedGenerationWorkerInput,
    "signal" | "beforeTerminalTransition"
  > {
  signal?: AbortSignal;
  heartbeat?: GenerationLeaseHeartbeatOptions;
  beforeQueueTransition?: (transition: GenerationWorkerQueueTransition) => Promise<void>;
}

export interface HeartbeatingGenerationWorkerResult {
  worker: GenerationWorkerResult;
  heartbeat: LeaseHeartbeatSnapshot;
}

export interface HeartbeatingGenerationWorkerPublicView {
  worker: GenerationWorkerPublicView;
  heartbeat: LeaseHeartbeatSnapshot;
}

interface CombinedAbortSignal {
  signal: AbortSignal;
  dispose(): void;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error("GENERATION_WORKER_ABORTED");
}

function throwIfAlreadyAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const reason = abortReason(signal);
  if (reason instanceof Error) throw reason;
  throw new Error("GENERATION_WORKER_ABORTED");
}

function combineAbortSignals(
  heartbeatSignal: AbortSignal,
  externalSignal: AbortSignal | undefined,
): CombinedAbortSignal {
  if (!externalSignal) {
    return {
      signal: heartbeatSignal,
      dispose() {},
    };
  }

  const controller = new AbortController();
  const listeners: Array<Readonly<{
    signal: AbortSignal;
    listener: () => void;
  }>> = [];
  const forward = (source: AbortSignal): void => {
    if (!controller.signal.aborted) controller.abort(abortReason(source));
  };

  for (const signal of [heartbeatSignal, externalSignal]) {
    if (signal.aborted) {
      forward(signal);
      break;
    }
    const listener = () => forward(signal);
    signal.addEventListener("abort", listener, { once: true });
    listeners.push({ signal, listener });
  }

  return {
    signal: controller.signal,
    dispose() {
      for (const { signal, listener } of listeners) {
        signal.removeEventListener("abort", listener);
      }
      listeners.length = 0;
    },
  };
}

export async function runGenerationWorkerWithHeartbeat(
  input: HeartbeatingGenerationWorkerInput,
): Promise<HeartbeatingGenerationWorkerResult> {
  throwIfAlreadyAborted(input.signal);
  const {
    heartbeat: heartbeatOptions,
    signal: externalSignal,
    beforeQueueTransition,
    ...workerInput
  } = input;
  const heartbeat = new GenerationLeaseHeartbeatController(
    input.queue,
    input.claim,
    heartbeatOptions,
  );
  heartbeat.start();
  const combined = combineAbortSignals(heartbeat.signal, externalSignal);

  try {
    const worker = await runClaimedGenerationWorker({
      ...workerInput,
      signal: combined.signal,
      beforeTerminalTransition: async (transition) => {
        await heartbeat.stopForTerminalTransition();
        await beforeQueueTransition?.(transition);
      },
    });
    heartbeat.assertHealthy();
    return Object.freeze({
      worker,
      heartbeat: heartbeat.snapshot(),
    });
  } finally {
    combined.dispose();
    await heartbeat.stop();
  }
}

export function heartbeatingGenerationWorkerPublicView(
  result: HeartbeatingGenerationWorkerResult,
): HeartbeatingGenerationWorkerPublicView {
  return Object.freeze({
    worker: generationWorkerPublicView(result.worker),
    heartbeat: result.heartbeat,
  });
}
