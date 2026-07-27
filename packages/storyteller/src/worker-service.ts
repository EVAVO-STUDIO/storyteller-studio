import type { FileArtifactRegistry } from "./artifact-store.js";
import {
  isGenerationBudgetAdmissionError,
  type FileGenerationBudgetController,
  type GenerationBudgetSession,
} from "./generation-budget.js";
import {
  FileGenerationMaterialStore,
  GenerationMaterialConflictError,
  GenerationMaterialIntegrityError,
  validateGenerationWorkerMaterial,
} from "./generation-material.js";
import type { FileGenerationQueue, GenerationQueueClaim } from "./generation-queue.js";
import type { GenerationQueueStatus } from "./generation-queue-contracts.js";
import {
  heartbeatingGenerationWorkerPublicView,
  runGenerationWorkerWithHeartbeat,
  type HeartbeatingGenerationWorkerPublicView,
} from "./heartbeat-worker.js";
import {
  GenerationLeaseOwnershipLostError,
  type LeaseHeartbeatScheduler,
} from "./lease-heartbeat.js";
import type { FilePrivateObjectStore } from "./private-object-store.js";
import type {
  CredentialResolver,
  ProviderAdapterRegistry,
} from "./provider-adapter.js";

export type GenerationWorkerServiceState =
  | "idle"
  | "running"
  | "draining"
  | "stopped"
  | "failed";

export type WorkerJobDisposition =
  | "completed"
  | "blocked"
  | "retry-wait"
  | "failed"
  | "cancelled"
  | "ownership-lost"
  | "aborted";

export interface WorkerServiceWaiter {
  wait(delayMs: number, signal: AbortSignal): Promise<void>;
}

export interface GenerationWorkerServiceDependencies {
  queue: FileGenerationQueue;
  materials: FileGenerationMaterialStore;
  providers: ProviderAdapterRegistry;
  credentials: CredentialResolver;
  objectStore: FilePrivateObjectStore;
  artifactRegistry: FileArtifactRegistry;
  budgetController?: FileGenerationBudgetController;
}

export interface GenerationWorkerServiceOptions {
  workerId: string;
  verifierActorId?: string;
  projectId?: string;
  concurrency?: number;
  pollIntervalMs?: number;
  leaseDurationMs?: number;
  heartbeatIntervalMs?: number;
  heartbeatScheduler?: LeaseHeartbeatScheduler;
  providerTimeoutMs?: number;
  outcomeHistoryLimit?: number;
  requireBudget?: boolean;
  now?: () => Date;
  waiter?: WorkerServiceWaiter;
}

export interface WorkerJobOutcome {
  queueItemId: string;
  jobId: string;
  disposition: WorkerJobDisposition;
  queueRevision: number;
  artifactCount: number;
  candidateCount: number;
  occurredAt: string;
  worker?: HeartbeatingGenerationWorkerPublicView;
  findingCodes: readonly string[];
}

export interface GenerationWorkerServiceSnapshot {
  state: GenerationWorkerServiceState;
  acceptingClaims: boolean;
  activeJobs: number;
  concurrency: number;
  claimedJobs: number;
  completedJobs: number;
  blockedJobs: number;
  retryingJobs: number;
  failedJobs: number;
  cancelledJobs: number;
  ownershipLostJobs: number;
  abortedJobs: number;
  outcomeHistorySize: number;
  lastDisposition?: WorkerJobDisposition;
  lastOccurredAt?: string;
  failureCode?: string;
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(code);
  }
  return value;
}

function signalReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("GENERATION_WORKER_SERVICE_ABORTED");
}

function defaultWaiter(): WorkerServiceWaiter {
  return {
    wait(delayMs, signal) {
      return new Promise<void>((resolvePromise, reject) => {
        if (signal.aborted) {
          reject(signalReason(signal));
          return;
        }
        const handle = setTimeout(() => {
          signal.removeEventListener("abort", onAbort);
          resolvePromise();
        }, delayMs);
        handle.unref?.();
        const onAbort = () => {
          clearTimeout(handle);
          signal.removeEventListener("abort", onAbort);
          reject(signalReason(signal));
        };
        signal.addEventListener("abort", onAbort, { once: true });
      });
    },
  };
}

function safeErrorCode(error: unknown, fallback: string): string {
  const candidate = error instanceof Error ? error.message : "";
  return SAFE_CODE.test(candidate) ? candidate : fallback;
}

function statusDisposition(status: GenerationQueueStatus): WorkerJobDisposition {
  switch (status) {
    case "completed":
    case "blocked":
    case "retry-wait":
    case "failed":
    case "cancelled":
      return status;
    case "queued":
    case "leased":
      return "failed";
  }
}

export class GenerationWorkerService {
  readonly #dependencies: GenerationWorkerServiceDependencies;
  readonly #workerId: string;
  readonly #verifierActorId: string | undefined;
  readonly #projectId: string | undefined;
  readonly #concurrency: number;
  readonly #pollIntervalMs: number;
  readonly #leaseDurationMs: number;
  readonly #heartbeatIntervalMs: number;
  readonly #heartbeatScheduler: LeaseHeartbeatScheduler | undefined;
  readonly #providerTimeoutMs: number;
  readonly #outcomeHistoryLimit: number;
  readonly #requireBudget: boolean;
  readonly #now: () => Date;
  readonly #waiter: WorkerServiceWaiter;
  readonly #abortController = new AbortController();
  readonly #active = new Set<Promise<void>>();
  readonly #outcomes: WorkerJobOutcome[] = [];
  #state: GenerationWorkerServiceState = "idle";
  #runPromise: Promise<void> | undefined;
  #claimedJobs = 0;
  #completedJobs = 0;
  #blockedJobs = 0;
  #retryingJobs = 0;
  #failedJobs = 0;
  #cancelledJobs = 0;
  #ownershipLostJobs = 0;
  #abortedJobs = 0;
  #failureCode: string | undefined;

  constructor(
    dependencies: GenerationWorkerServiceDependencies,
    options: GenerationWorkerServiceOptions,
  ) {
    if (!SAFE_IDENTIFIER.test(options.workerId)) {
      throw new Error("GENERATION_WORKER_SERVICE_WORKER_ID_INVALID");
    }
    if (options.verifierActorId && !SAFE_IDENTIFIER.test(options.verifierActorId)) {
      throw new Error("GENERATION_WORKER_SERVICE_VERIFIER_ID_INVALID");
    }
    if (options.projectId && !SAFE_IDENTIFIER.test(options.projectId)) {
      throw new Error("GENERATION_WORKER_SERVICE_PROJECT_ID_INVALID");
    }
    this.#dependencies = dependencies;
    this.#workerId = options.workerId;
    this.#verifierActorId = options.verifierActorId;
    this.#projectId = options.projectId;
    this.#concurrency = requireInteger(
      options.concurrency ?? 2,
      1,
      16,
      "GENERATION_WORKER_SERVICE_CONCURRENCY_INVALID",
    );
    this.#pollIntervalMs = requireInteger(
      options.pollIntervalMs ?? 1_000,
      100,
      60_000,
      "GENERATION_WORKER_SERVICE_POLL_INTERVAL_INVALID",
    );
    this.#leaseDurationMs = requireInteger(
      options.leaseDurationMs ?? 60_000,
      1_000,
      15 * 60_000,
      "GENERATION_WORKER_SERVICE_LEASE_DURATION_INVALID",
    );
    this.#heartbeatIntervalMs = requireInteger(
      options.heartbeatIntervalMs ?? 20_000,
      250,
      Math.max(250, Math.floor(this.#leaseDurationMs / 2) - 1),
      "GENERATION_WORKER_SERVICE_HEARTBEAT_INTERVAL_INVALID",
    );
    this.#heartbeatScheduler = options.heartbeatScheduler;
    this.#providerTimeoutMs = requireInteger(
      options.providerTimeoutMs ?? 120_000,
      1_000,
      2 * 60 * 60_000,
      "GENERATION_WORKER_SERVICE_PROVIDER_TIMEOUT_INVALID",
    );
    this.#outcomeHistoryLimit = requireInteger(
      options.outcomeHistoryLimit ?? 100,
      0,
      1_000,
      "GENERATION_WORKER_SERVICE_HISTORY_LIMIT_INVALID",
    );
    this.#requireBudget = options.requireBudget ?? false;
    if (this.#requireBudget && !dependencies.budgetController) {
      throw new Error("GENERATION_WORKER_SERVICE_BUDGET_CONTROLLER_REQUIRED");
    }
    this.#now = options.now ?? (() => new Date());
    this.#waiter = options.waiter ?? defaultWaiter();
  }

  get state(): GenerationWorkerServiceState {
    return this.#state;
  }

  start(): Promise<void> {
    if (this.#runPromise) return this.#runPromise;
    if (this.#state !== "idle") {
      throw new Error("GENERATION_WORKER_SERVICE_START_STATE_INVALID");
    }
    this.#state = "running";
    this.#runPromise = this.#runLoop(false);
    return this.#runPromise;
  }

  runUntilIdle(): Promise<void> {
    if (this.#runPromise) return this.#runPromise;
    if (this.#state !== "idle") {
      throw new Error("GENERATION_WORKER_SERVICE_START_STATE_INVALID");
    }
    this.#state = "running";
    this.#runPromise = this.#runLoop(true);
    return this.#runPromise;
  }

  requestDrain(): void {
    if (this.#state === "idle") {
      this.#state = "stopped";
      return;
    }
    if (this.#state === "running") this.#state = "draining";
  }

  abortActive(reason: Error = new Error("GENERATION_WORKER_SERVICE_ABORTED")): void {
    if (this.#state === "running") this.#state = "draining";
    if (!this.#abortController.signal.aborted) this.#abortController.abort(reason);
  }

  async drain(): Promise<void> {
    this.requestDrain();
    await this.#runPromise;
  }

  snapshot(): GenerationWorkerServiceSnapshot {
    const last = this.#outcomes.at(-1);
    return Object.freeze({
      state: this.#state,
      acceptingClaims: this.#state === "running",
      activeJobs: this.#active.size,
      concurrency: this.#concurrency,
      claimedJobs: this.#claimedJobs,
      completedJobs: this.#completedJobs,
      blockedJobs: this.#blockedJobs,
      retryingJobs: this.#retryingJobs,
      failedJobs: this.#failedJobs,
      cancelledJobs: this.#cancelledJobs,
      ownershipLostJobs: this.#ownershipLostJobs,
      abortedJobs: this.#abortedJobs,
      outcomeHistorySize: this.#outcomes.length,
      ...(last ? { lastDisposition: last.disposition, lastOccurredAt: last.occurredAt } : {}),
      ...(this.#failureCode ? { failureCode: this.#failureCode } : {}),
    });
  }

  outcomes(): readonly WorkerJobOutcome[] {
    return Object.freeze([...this.#outcomes]);
  }

  async #runLoop(stopWhenIdle: boolean): Promise<void> {
    try {
      while (true) {
        let claimed = 0;
        if (this.#state === "running") claimed = await this.#fillCapacity();
        if (stopWhenIdle && claimed === 0 && this.#active.size === 0) break;
        if (this.#state === "draining" && this.#active.size === 0) break;

        if (this.#active.size > 0) {
          await Promise.race(this.#active);
          continue;
        }

        try {
          await this.#waiter.wait(this.#pollIntervalMs, this.#abortController.signal);
        } catch (error) {
          if (this.#abortController.signal.aborted && this.#state === "draining") continue;
          throw error;
        }
      }
      await Promise.allSettled(this.#active);
      this.#state = "stopped";
    } catch (error) {
      this.#failureCode = safeErrorCode(error, "GENERATION_WORKER_SERVICE_FAILED");
      this.#state = "failed";
      if (!this.#abortController.signal.aborted) {
        this.#abortController.abort(new Error(this.#failureCode));
      }
      await Promise.allSettled(this.#active);
      throw error;
    }
  }

  async #fillCapacity(): Promise<number> {
    let claimed = 0;
    while (this.#state === "running" && this.#active.size < this.#concurrency) {
      const claim = await this.#dependencies.queue.claimNext({
        workerId: this.#workerId,
        leaseDurationMs: this.#leaseDurationMs,
        now: this.#now(),
        ...(this.#projectId ? { projectId: this.#projectId } : {}),
      });
      if (!claim) break;
      claimed += 1;
      this.#claimedJobs += 1;
      let tracked: Promise<void>;
      tracked = this.#processClaim(claim)
        .then((outcome) => {
          this.#recordOutcome(outcome);
        })
        .catch((error: unknown) => {
          this.#failureCode = safeErrorCode(error, "GENERATION_WORKER_SERVICE_JOB_FAILED");
          this.#state = "failed";
          if (!this.#abortController.signal.aborted) {
            this.#abortController.abort(new Error(this.#failureCode));
          }
          throw error;
        })
        .finally(() => {
          this.#active.delete(tracked);
        });
      this.#active.add(tracked);
    }
    return claimed;
  }

  async #processClaim(claim: GenerationQueueClaim): Promise<WorkerJobOutcome> {
    const startedAt = this.#now();
    if (this.#abortController.signal.aborted) {
      return this.#outcome(claim, "aborted", 0, 0, [], startedAt);
    }

    let material;
    try {
      material = await this.#dependencies.materials.resolve(claim);
      validateGenerationWorkerMaterial(claim.item.job, material, startedAt);
    } catch (error) {
      if (this.#abortController.signal.aborted) {
        return this.#outcome(claim, "aborted", 0, 0, [], this.#now());
      }
      const code = error instanceof GenerationMaterialConflictError
        || error instanceof GenerationMaterialIntegrityError
        ? safeErrorCode(error, "GENERATION_MATERIAL_RESOLUTION_FAILED")
        : "GENERATION_MATERIAL_RESOLUTION_FAILED";
      const envelope = await this.#dependencies.queue.block(
        claim.item.id,
        claim.leaseToken,
        {
          codes: [code],
          message: "The claimed job does not have valid, scope-matched private generation material.",
          now: this.#now(),
        },
      );
      return {
        queueItemId: envelope.payload.id,
        jobId: envelope.payload.jobId,
        disposition: "blocked",
        queueRevision: envelope.revision,
        artifactCount: 0,
        candidateCount: 0,
        occurredAt: this.#now().toISOString(),
        findingCodes: Object.freeze([code]),
      };
    }


    let budgetSession: GenerationBudgetSession | undefined;
    if (this.#requireBudget) {
      if (this.#abortController.signal.aborted) {
        return this.#outcome(claim, "aborted", 0, 0, [], this.#now());
      }
      const controller = this.#dependencies.budgetController;
      if (!controller) {
        throw new Error("GENERATION_WORKER_SERVICE_BUDGET_CONTROLLER_REQUIRED");
      }
      try {
        budgetSession = await controller.reserve({
          claim,
          material,
          actorId: this.#workerId,
          providerTimeoutMs: this.#providerTimeoutMs,
          now: this.#now(),
        });
      } catch (error) {
        if (!isGenerationBudgetAdmissionError(error)) throw error;
        const code = safeErrorCode(error, "GENERATION_BUDGET_ADMISSION_FAILED");
        const envelope = await this.#dependencies.queue.block(
          claim.item.id,
          claim.leaseToken,
          {
            codes: [code],
            message: "The claimed job could not reserve its approved maximum provider cost.",
            now: this.#now(),
          },
        );
        return {
          queueItemId: envelope.payload.id,
          jobId: envelope.payload.jobId,
          disposition: "blocked",
          queueRevision: envelope.revision,
          artifactCount: 0,
          candidateCount: 0,
          occurredAt: this.#now().toISOString(),
          findingCodes: Object.freeze([code]),
        };
      }
    }

    const settleInterruptedBudget = async (code: string): Promise<void> => {
      if (!budgetSession) return;
      await budgetSession.settleInterrupted({ code, at: this.#now() });
    };

    try {
      const result = await runGenerationWorkerWithHeartbeat({
        queue: this.#dependencies.queue,
        claim,
        providers: this.#dependencies.providers,
        credentials: this.#dependencies.credentials,
        objectStore: this.#dependencies.objectStore,
        artifactRegistry: this.#dependencies.artifactRegistry,
        material,
        workerActorId: this.#workerId,
        ...(this.#verifierActorId ? { verifierActorId: this.#verifierActorId } : {}),
        timeoutMs: this.#providerTimeoutMs,
        signal: this.#abortController.signal,
        clock: this.#now,
        now: startedAt,
        ...(budgetSession
          ? {
              beforeQueueTransition: async (transition) => {
                await budgetSession?.settle(transition);
              },
            }
          : {}),
        heartbeat: {
          leaseDurationMs: this.#leaseDurationMs,
          heartbeatIntervalMs: this.#heartbeatIntervalMs,
          now: this.#now,
          ...(this.#heartbeatScheduler
            ? { scheduler: this.#heartbeatScheduler }
            : {}),
        },
      });
      const publicView = heartbeatingGenerationWorkerPublicView(result);
      const disposition = statusDisposition(result.worker.queueEnvelope.payload.status);
      return {
        queueItemId: result.worker.queueEnvelope.payload.id,
        jobId: result.worker.queueEnvelope.payload.jobId,
        disposition,
        queueRevision: result.worker.queueEnvelope.revision,
        artifactCount: result.worker.artifactIds.length,
        candidateCount: result.worker.candidateArtifactIds.length,
        occurredAt: this.#now().toISOString(),
        worker: publicView,
        findingCodes: Object.freeze([
          ...(result.worker.queueEnvelope.payload.block?.codes ?? []),
          ...(result.worker.queueEnvelope.payload.lastFailure
            ? [result.worker.queueEnvelope.payload.lastFailure.code]
            : []),
        ]),
      };
    } catch (error) {
      if (error instanceof GenerationLeaseOwnershipLostError) {
        await settleInterruptedBudget("GENERATION_BUDGET_LEASE_OWNERSHIP_LOST");
        return this.#outcome(claim, "ownership-lost", 0, 0, [error.causeCode], this.#now());
      }
      if (this.#abortController.signal.aborted) {
        await settleInterruptedBudget("GENERATION_BUDGET_WORKER_ABORTED");
        return this.#outcome(claim, "aborted", 0, 0, [], this.#now());
      }

      await settleInterruptedBudget("GENERATION_BUDGET_WORKER_RUNTIME_FAILED");
      const current = await this.#dependencies.queue.read(claim.item.id);
      if (
        !current
        || current.payload.status !== "leased"
        || current.payload.lease?.workerId !== this.#workerId
      ) {
        return this.#outcome(
          claim,
          "ownership-lost",
          0,
          0,
          ["GENERATION_WORKER_SERVICE_LEASE_NOT_AUTHORITATIVE"],
          this.#now(),
        );
      }

      const failed = await this.#dependencies.queue.fail(
        claim.item.id,
        claim.leaseToken,
        {
          code: "GENERATION_WORKER_RUNTIME_FAILED",
          message: "The internal generation worker failed before reaching a governed terminal result.",
          retryable: true,
          now: this.#now(),
        },
      );
      return {
        queueItemId: failed.payload.id,
        jobId: failed.payload.jobId,
        disposition: statusDisposition(failed.payload.status),
        queueRevision: failed.revision,
        artifactCount: 0,
        candidateCount: 0,
        occurredAt: this.#now().toISOString(),
        findingCodes: Object.freeze(["GENERATION_WORKER_RUNTIME_FAILED"]),
      };
    }
  }

  #outcome(
    claim: GenerationQueueClaim,
    disposition: WorkerJobDisposition,
    artifactCount: number,
    candidateCount: number,
    findingCodes: readonly string[],
    occurredAt: Date,
  ): WorkerJobOutcome {
    return {
      queueItemId: claim.item.id,
      jobId: claim.item.jobId,
      disposition,
      queueRevision: claim.envelope.revision,
      artifactCount,
      candidateCount,
      occurredAt: occurredAt.toISOString(),
      findingCodes: Object.freeze([...findingCodes]),
    };
  }

  #recordOutcome(outcome: WorkerJobOutcome): void {
    switch (outcome.disposition) {
      case "completed": this.#completedJobs += 1; break;
      case "blocked": this.#blockedJobs += 1; break;
      case "retry-wait": this.#retryingJobs += 1; break;
      case "failed": this.#failedJobs += 1; break;
      case "cancelled": this.#cancelledJobs += 1; break;
      case "ownership-lost": this.#ownershipLostJobs += 1; break;
      case "aborted": this.#abortedJobs += 1; break;
    }
    if (this.#outcomeHistoryLimit === 0) return;
    this.#outcomes.push(Object.freeze({ ...outcome }));
    while (this.#outcomes.length > this.#outcomeHistoryLimit) this.#outcomes.shift();
  }
}

export function generationWorkerServicePublicView(
  service: GenerationWorkerService,
): GenerationWorkerServiceSnapshot {
  return service.snapshot();
}
