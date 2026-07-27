import type { FileGenerationQueue, GenerationQueueClaim } from "./generation-queue.js";
import type { GenerationQueueItem } from "./generation-queue-contracts.js";
import type { StoredEnvelope } from "./project-store.js";

export type LeaseHeartbeatState =
  | "idle"
  | "running"
  | "stopping"
  | "stopped"
  | "lost";

export interface LeaseHeartbeatTimer {
  cancel(): void;
}

export interface LeaseHeartbeatScheduler {
  schedule(
    callback: () => void | Promise<void>,
    delayMs: number,
  ): LeaseHeartbeatTimer;
}

export interface GenerationLeaseHeartbeatOptions {
  leaseDurationMs?: number;
  heartbeatIntervalMs?: number;
  now?: () => Date;
  scheduler?: LeaseHeartbeatScheduler;
}

export interface LeaseHeartbeatSnapshot {
  queueItemId: string;
  jobId: string;
  state: LeaseHeartbeatState;
  healthy: boolean;
  heartbeatCount: number;
  revision: number;
  lastHeartbeatAt?: string;
  expiresAt?: string;
}

export class GenerationLeaseOwnershipLostError extends Error {
  readonly causeCode: string;

  constructor(causeCode: string) {
    super(`GENERATION_LEASE_OWNERSHIP_LOST:${causeCode}`);
    this.name = "GenerationLeaseOwnershipLostError";
    this.causeCode = causeCode;
  }
}

const TERMINAL_STATUSES = new Set([
  "completed",
  "blocked",
  "failed",
  "cancelled",
]);

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message : "UNKNOWN";
}

function defaultScheduler(): LeaseHeartbeatScheduler {
  return {
    schedule(callback, delayMs) {
      const handle = setTimeout(() => {
        void callback();
      }, delayMs);
      handle.unref?.();
      return {
        cancel() {
          clearTimeout(handle);
        },
      };
    },
  };
}

export class GenerationLeaseHeartbeatController {
  readonly #queue: FileGenerationQueue;
  readonly #queueItemId: string;
  readonly #jobId: string;
  readonly #workerId: string;
  readonly #leaseToken: string;
  readonly #leaseDurationMs: number;
  readonly #heartbeatIntervalMs: number;
  readonly #now: () => Date;
  readonly #scheduler: LeaseHeartbeatScheduler;
  readonly #abortController = new AbortController();
  #state: LeaseHeartbeatState = "idle";
  #timer: LeaseHeartbeatTimer | undefined;
  #inFlight: Promise<StoredEnvelope<GenerationQueueItem>> | undefined;
  #latest: StoredEnvelope<GenerationQueueItem>;
  #heartbeatCount = 0;
  #loss: GenerationLeaseOwnershipLostError | undefined;

  constructor(
    queue: FileGenerationQueue,
    claim: GenerationQueueClaim,
    options: GenerationLeaseHeartbeatOptions = {},
  ) {
    const lease = claim.item.lease;
    if (claim.item.status !== "leased" || !lease) {
      throw new Error("GENERATION_HEARTBEAT_ACTIVE_LEASE_REQUIRED");
    }
    this.#queue = queue;
    this.#queueItemId = claim.item.id;
    this.#jobId = claim.item.jobId;
    this.#workerId = lease.workerId;
    this.#leaseToken = claim.leaseToken;
    this.#latest = claim.envelope;
    this.#leaseDurationMs = options.leaseDurationMs ?? 60_000;
    this.#heartbeatIntervalMs = options.heartbeatIntervalMs ?? 20_000;
    this.#now = options.now ?? (() => new Date());
    this.#scheduler = options.scheduler ?? defaultScheduler();

    if (
      !Number.isSafeInteger(this.#leaseDurationMs)
      || this.#leaseDurationMs < 1_000
      || this.#leaseDurationMs > 15 * 60_000
    ) {
      throw new Error("GENERATION_HEARTBEAT_LEASE_DURATION_INVALID");
    }
    if (
      !Number.isSafeInteger(this.#heartbeatIntervalMs)
      || this.#heartbeatIntervalMs < 250
      || this.#heartbeatIntervalMs >= this.#leaseDurationMs / 2
    ) {
      throw new Error("GENERATION_HEARTBEAT_INTERVAL_INVALID");
    }
    if (Date.parse(lease.expiresAt) <= this.#now().getTime()) {
      throw new Error("GENERATION_HEARTBEAT_LEASE_ALREADY_EXPIRED");
    }
  }

  get signal(): AbortSignal {
    return this.#abortController.signal;
  }

  get state(): LeaseHeartbeatState {
    return this.#state;
  }

  start(): void {
    if (this.#state !== "idle") throw new Error("GENERATION_HEARTBEAT_START_STATE_INVALID");
    this.#state = "running";
    this.#scheduleNext();
  }

  async beat(): Promise<StoredEnvelope<GenerationQueueItem>> {
    this.#throwIfLost();
    if (this.#state !== "running") {
      throw new Error("GENERATION_HEARTBEAT_NOT_RUNNING");
    }
    if (this.#inFlight) return this.#inFlight;

    const operation = this.#queue.heartbeat(
      this.#queueItemId,
      this.#leaseToken,
      {
        leaseDurationMs: this.#leaseDurationMs,
        now: this.#now(),
      },
    ).then((envelope) => {
      const lease = envelope.payload.lease;
      if (
        envelope.payload.status !== "leased"
        || !lease
        || lease.workerId !== this.#workerId
      ) {
        throw new Error("GENERATION_HEARTBEAT_RENEWAL_SCOPE_INVALID");
      }
      this.#latest = envelope;
      this.#heartbeatCount += 1;
      return envelope;
    }).catch(async (error: unknown) => {
      const current = await this.#queue.read(this.#queueItemId).catch(() => null);
      if (current && TERMINAL_STATUSES.has(current.payload.status)) {
        this.#latest = current;
        this.#state = "stopped";
        this.#cancelTimer();
        throw error;
      }
      this.#markLost(errorCode(error));
      throw this.#requireLoss();
    }).finally(() => {
      this.#inFlight = undefined;
    });

    this.#inFlight = operation;
    return operation;
  }

  async stopForTerminalTransition(): Promise<void> {
    this.#throwIfLost();
    if (this.#state === "idle") {
      this.#state = "stopped";
      return;
    }
    if (this.#state === "stopped") return;
    this.#state = "stopping";
    this.#cancelTimer();
    const inFlight = this.#inFlight;
    if (inFlight) {
      try {
        await inFlight;
      } catch {
        this.#throwIfLost();
      }
    }
    this.#throwIfLost();
    this.#state = "stopped";
  }

  async stop(): Promise<void> {
    if (this.#state === "stopped") return;
    if (this.#state === "idle") {
      this.#state = "stopped";
      return;
    }
    if (!this.#hasLostOwnership()) this.#state = "stopping";
    this.#cancelTimer();
    const inFlight = this.#inFlight;
    if (inFlight) {
      try {
        await inFlight;
      } catch {
        // The controller retains ownership-loss state and abort reason.
      }
    }
    if (!this.#hasLostOwnership()) this.#state = "stopped";
  }

  assertHealthy(): void {
    this.#throwIfLost();
  }

  snapshot(): LeaseHeartbeatSnapshot {
    const lease = this.#latest.payload.lease;
    return Object.freeze({
      queueItemId: this.#queueItemId,
      jobId: this.#jobId,
      state: this.#state,
      healthy: !this.#hasLostOwnership(),
      heartbeatCount: this.#heartbeatCount,
      revision: this.#latest.revision,
      ...(lease
        ? {
            lastHeartbeatAt: lease.heartbeatAt,
            expiresAt: lease.expiresAt,
          }
        : {}),
    });
  }

  #scheduleNext(): void {
    if (this.#state !== "running" || this.#timer) return;
    this.#timer = this.#scheduler.schedule(async () => {
      this.#timer = undefined;
      try {
        await this.beat();
      } catch {
        // beat records terminal or ownership-loss state before rejecting.
      }
      if (this.#state === "running") this.#scheduleNext();
    }, this.#heartbeatIntervalMs);
  }

  #cancelTimer(): void {
    this.#timer?.cancel();
    this.#timer = undefined;
  }

  #hasLostOwnership(): boolean {
    return this.#state === "lost";
  }

  #requireLoss(): GenerationLeaseOwnershipLostError {
    return this.#loss
      ?? new GenerationLeaseOwnershipLostError("GENERATION_HEARTBEAT_LOSS_STATE_INVALID");
  }

  #throwIfLost(): void {
    if (this.#hasLostOwnership()) throw this.#requireLoss();
  }

  #markLost(code: string): void {
    if (this.#hasLostOwnership()) return;
    this.#loss = new GenerationLeaseOwnershipLostError(code);
    this.#state = "lost";
    this.#cancelTimer();
    if (!this.#abortController.signal.aborted) {
      this.#abortController.abort(this.#loss);
    }
  }
}
