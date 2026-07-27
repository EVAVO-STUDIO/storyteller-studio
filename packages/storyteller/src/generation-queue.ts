import { randomBytes } from "node:crypto";
import { stableHash, type GenerationJob } from "./index.js";
import { FileProjectStore, StoreConflictError, type StoredEnvelope } from "./project-store.js";
import {
  GENERATION_QUEUE_ENTITY_TYPE,
  GENERATION_QUEUE_SCHEMA_VERSION,
  GenerationLeaseError,
  GenerationQueueConflictError,
  activeGenerationQueueState,
  assertGenerationQueueItem,
  assertGenerationTransitionTime,
  createGenerationQueueBlock,
  createGenerationQueueCancellation,
  createGenerationQueueCompletion,
  createGenerationQueueFailure,
  generationLeaseTokenHash,
  generationLeaseTokenMatches,
  generationQueueDate,
  generationQueueEntityId,
  generationQueueIdempotencyKey,
  generationQueueIdentifier,
  generationQueueInteger,
  type GenerationQueueItem,
  type GenerationQueueStatus,
} from "./generation-queue-contracts.js";

export * from "./generation-queue-contracts.js";

export interface GenerationQueueClaim {
  envelope: StoredEnvelope<GenerationQueueItem>;
  item: GenerationQueueItem;
  leaseToken: string;
}

export interface QueueListFilter {
  projectId?: string;
  status?: GenerationQueueStatus | readonly GenerationQueueStatus[];
}

export interface FileGenerationQueueOptions {
  baseBackoffMs?: number;
  maximumBackoffMs?: number;
}

export class FileGenerationQueue {
  readonly #store: FileProjectStore;
  readonly #baseBackoffMs: number;
  readonly #maximumBackoffMs: number;

  constructor(store: FileProjectStore, options: FileGenerationQueueOptions = {}) {
    this.#store = store;
    this.#baseBackoffMs = generationQueueInteger(
      options.baseBackoffMs ?? 2_000,
      100,
      60_000,
      "GENERATION_QUEUE_BASE_BACKOFF_INVALID",
    );
    this.#maximumBackoffMs = generationQueueInteger(
      options.maximumBackoffMs ?? 15 * 60_000,
      this.#baseBackoffMs,
      24 * 60 * 60_000,
      "GENERATION_QUEUE_MAX_BACKOFF_INVALID",
    );
  }

  async enqueue(
    job: GenerationJob,
    options: Readonly<{ priority?: number; maxAttempts?: number; availableAt?: Date; now?: Date }> = {},
  ): Promise<StoredEnvelope<GenerationQueueItem>> {
    const now = generationQueueDate(options.now ?? new Date(), "GENERATION_QUEUE_NOW_INVALID");
    const availableAt = generationQueueDate(
      options.availableAt ?? now,
      "GENERATION_QUEUE_AVAILABLE_AT_INVALID",
    );
    const priority = generationQueueInteger(
      options.priority ?? 50,
      0,
      100,
      "GENERATION_QUEUE_PRIORITY_INVALID",
    );
    const maxAttempts = generationQueueInteger(
      options.maxAttempts ?? 4,
      1,
      20,
      "GENERATION_QUEUE_MAX_ATTEMPTS_INVALID",
    );
    const entityId = generationQueueEntityId(job.id);
    const idempotencyKey = generationQueueIdempotencyKey(job);
    const existing = await this.#readEnvelope(entityId);
    if (existing) return this.#assertIdempotent(existing, idempotencyKey);

    const instant = now.toISOString();
    const item: GenerationQueueItem = {
      schemaVersion: GENERATION_QUEUE_SCHEMA_VERSION,
      id: entityId,
      jobId: job.id,
      projectId: job.projectId,
      segmentId: job.segmentId,
      idempotencyKey,
      job,
      status: job.status === "ready" ? "queued" : "blocked",
      priority,
      attempt: 0,
      maxAttempts,
      availableAt: availableAt.toISOString(),
      createdAt: instant,
      updatedAt: instant,
      ...(job.status === "blocked"
        ? {
            block: createGenerationQueueBlock({
              codes: ["GENERATION_JOB_BLOCKED"],
              message: "The generation intent is blocked by an unresolved upstream governance gate.",
              blockedAt: now,
            }),
          }
        : {}),
    };

    try {
      const created = await this.#createEnvelope(entityId, item, now);
      await this.#audit("queue_system", "generation.queue.enqueued", created, now, {
        priority,
        maxAttempts,
        blocked: item.status === "blocked",
      });
      return created;
    } catch (error) {
      if (!(error instanceof StoreConflictError)) throw error;
      const raced = await this.#readEnvelope(entityId);
      if (!raced) throw error;
      return this.#assertIdempotent(raced, idempotencyKey);
    }
  }

  async read(itemId: string): Promise<StoredEnvelope<GenerationQueueItem> | null> {
    return this.#readEnvelope(generationQueueIdentifier(itemId, "GENERATION_QUEUE_ID_INVALID"));
  }

  async list(filter: QueueListFilter = {}): Promise<readonly StoredEnvelope<GenerationQueueItem>[]> {
    const statuses = filter.status === undefined
      ? null
      : new Set(Array.isArray(filter.status) ? filter.status : [filter.status]);
    const rows = await this.#store.list(GENERATION_QUEUE_ENTITY_TYPE);
    const envelopes: StoredEnvelope<GenerationQueueItem>[] = [];
    for (const row of rows) {
      const envelope = await this.#readEnvelope(row.entityId, true);
      if (!envelope) continue;
      if (filter.projectId && envelope.payload.projectId !== filter.projectId) continue;
      if (statuses && !statuses.has(envelope.payload.status)) continue;
      envelopes.push(envelope);
    }
    return envelopes.sort((left, right) =>
      right.payload.priority - left.payload.priority
      || Date.parse(left.payload.availableAt) - Date.parse(right.payload.availableAt)
      || Date.parse(left.payload.createdAt) - Date.parse(right.payload.createdAt)
      || left.payload.id.localeCompare(right.payload.id, "en-AU")
    );
  }

  async claimNext(input: Readonly<{
    workerId: string;
    leaseDurationMs?: number;
    now?: Date;
    projectId?: string;
  }>): Promise<GenerationQueueClaim | null> {
    const workerId = generationQueueIdentifier(input.workerId, "GENERATION_QUEUE_WORKER_ID_INVALID");
    const leaseDurationMs = generationQueueInteger(
      input.leaseDurationMs ?? 60_000,
      1_000,
      15 * 60_000,
      "GENERATION_QUEUE_LEASE_DURATION_INVALID",
    );
    const now = generationQueueDate(input.now ?? new Date(), "GENERATION_QUEUE_NOW_INVALID");
    await this.reapExpiredLeases({ now });
    const candidates = await this.list({
      ...(input.projectId ? { projectId: input.projectId } : {}),
      status: ["queued", "retry-wait"],
    });

    for (const candidate of candidates) {
      if (Date.parse(candidate.payload.availableAt) > now.getTime()) continue;
      if (now.getTime() < Date.parse(candidate.payload.updatedAt)) continue;
      if (candidate.payload.attempt >= candidate.payload.maxAttempts) {
        await this.#failExhausted(candidate, now);
        continue;
      }
      const token = randomBytes(32).toString("base64url");
      const instant = now.toISOString();
      const next: GenerationQueueItem = {
        ...candidate.payload,
        status: "leased",
        attempt: candidate.payload.attempt + 1,
        updatedAt: instant,
        lease: {
          tokenHash: generationLeaseTokenHash(token),
          workerId,
          acquiredAt: instant,
          heartbeatAt: instant,
          expiresAt: new Date(now.getTime() + leaseDurationMs).toISOString(),
        },
      };
      try {
        const envelope = await this.#replaceEnvelope(candidate, next, now);
        await this.#audit(workerId, "generation.queue.claimed", envelope, now, {
          attempt: next.attempt,
          leaseDurationMs,
        });
        return { envelope, item: envelope.payload, leaseToken: token };
      } catch (error) {
        if (error instanceof StoreConflictError) continue;
        throw error;
      }
    }
    return null;
  }

  async heartbeat(
    itemId: string,
    leaseToken: string,
    options: Readonly<{ leaseDurationMs?: number; now?: Date }> = {},
  ): Promise<StoredEnvelope<GenerationQueueItem>> {
    const now = generationQueueDate(options.now ?? new Date(), "GENERATION_QUEUE_NOW_INVALID");
    const leaseDurationMs = generationQueueInteger(
      options.leaseDurationMs ?? 60_000,
      1_000,
      15 * 60_000,
      "GENERATION_QUEUE_LEASE_DURATION_INVALID",
    );
    const current = await this.#requireActiveLease(itemId, leaseToken, now);
    assertGenerationTransitionTime(current.payload, now);
    const instant = now.toISOString();
    const next: GenerationQueueItem = {
      ...current.payload,
      updatedAt: instant,
      lease: {
        ...current.payload.lease!,
        heartbeatAt: instant,
        expiresAt: new Date(now.getTime() + leaseDurationMs).toISOString(),
      },
    };
    const envelope = await this.#replaceLeaseOwned(current, next, leaseToken, now);
    await this.#audit(next.lease!.workerId, "generation.queue.heartbeat", envelope, now, {
      leaseDurationMs,
    });
    return envelope;
  }

  async complete(
    itemId: string,
    leaseToken: string,
    input: Readonly<{
      executionReportHash: string;
      resultIds: readonly string[];
      outputArtifactRefs: readonly string[];
      totalEstimatedCost?: number;
      currency?: string;
      now?: Date;
    }>,
  ): Promise<StoredEnvelope<GenerationQueueItem>> {
    const now = generationQueueDate(input.now ?? new Date(), "GENERATION_QUEUE_NOW_INVALID");
    const current = await this.#requireActiveLease(itemId, leaseToken, now);
    assertGenerationTransitionTime(current.payload, now);
    const completion = createGenerationQueueCompletion({
      executionReportHash: input.executionReportHash,
      resultIds: input.resultIds,
      outputArtifactRefs: input.outputArtifactRefs,
      ...(input.totalEstimatedCost !== undefined
        ? { totalEstimatedCost: input.totalEstimatedCost, currency: input.currency }
        : {}),
      completedAt: now,
    });
    const next: GenerationQueueItem = {
      ...activeGenerationQueueState(current.payload),
      status: "completed",
      updatedAt: completion.completedAt,
      completion,
    };
    const envelope = await this.#replaceLeaseOwned(current, next, leaseToken, now);
    await this.#audit(current.payload.lease!.workerId, "generation.queue.completed", envelope, now, {
      resultCount: completion.resultIds.length,
      artifactCount: completion.outputArtifactRefs.length,
      ...(completion.totalEstimatedCost !== undefined
        ? { estimatedCost: completion.totalEstimatedCost, currency: completion.currency! }
        : {}),
    });
    return envelope;
  }

  async fail(
    itemId: string,
    leaseToken: string,
    input: Readonly<{
      code: string;
      message: string;
      retryable: boolean;
      providerId?: string;
      now?: Date;
    }>,
  ): Promise<StoredEnvelope<GenerationQueueItem>> {
    const now = generationQueueDate(input.now ?? new Date(), "GENERATION_QUEUE_NOW_INVALID");
    const current = await this.#requireActiveLease(itemId, leaseToken, now);
    assertGenerationTransitionTime(current.payload, now);
    const lastFailure = createGenerationQueueFailure({
      code: input.code,
      message: input.message,
      retryable: input.retryable,
      ...(input.providerId ? { providerId: input.providerId } : {}),
      occurredAt: now,
    });
    const retry = input.retryable && current.payload.attempt < current.payload.maxAttempts;
    const next: GenerationQueueItem = {
      ...activeGenerationQueueState(current.payload),
      status: retry ? "retry-wait" : "failed",
      availableAt: retry
        ? new Date(now.getTime() + this.#retryDelayMs(current.payload, input.code)).toISOString()
        : current.payload.availableAt,
      updatedAt: now.toISOString(),
      lastFailure,
    };
    const envelope = await this.#replaceLeaseOwned(current, next, leaseToken, now);
    await this.#audit(
      current.payload.lease!.workerId,
      retry ? "generation.queue.retry_scheduled" : "generation.queue.failed",
      envelope,
      now,
      {
        attempt: current.payload.attempt,
        retryable: input.retryable,
        retryScheduled: retry,
        failureCode: input.code,
      },
    );
    return envelope;
  }

  async block(
    itemId: string,
    leaseToken: string,
    input: Readonly<{ codes: readonly string[]; message: string; now?: Date }>,
  ): Promise<StoredEnvelope<GenerationQueueItem>> {
    const now = generationQueueDate(input.now ?? new Date(), "GENERATION_QUEUE_NOW_INVALID");
    const current = await this.#requireActiveLease(itemId, leaseToken, now);
    assertGenerationTransitionTime(current.payload, now);
    const block = createGenerationQueueBlock({
      codes: input.codes,
      message: input.message,
      blockedAt: now,
    });
    const next: GenerationQueueItem = {
      ...activeGenerationQueueState(current.payload),
      status: "blocked",
      updatedAt: block.blockedAt,
      block,
    };
    const envelope = await this.#replaceLeaseOwned(current, next, leaseToken, now);
    await this.#audit(current.payload.lease!.workerId, "generation.queue.blocked", envelope, now, {
      codeCount: block.codes.length,
    });
    return envelope;
  }

  async cancel(
    itemId: string,
    input: Readonly<{ actorId: string; reason: string; now?: Date }>,
  ): Promise<StoredEnvelope<GenerationQueueItem>> {
    const now = generationQueueDate(input.now ?? new Date(), "GENERATION_QUEUE_NOW_INVALID");
    const current = await this.#requireEnvelope(itemId);
    assertGenerationTransitionTime(current.payload, now);
    const cancellation = createGenerationQueueCancellation({
      actorId: input.actorId,
      reason: input.reason,
      cancelledAt: now,
    });
    if (current.payload.status === "cancelled") {
      if (
        current.payload.cancellation?.actorId === cancellation.actorId
        && current.payload.cancellation.reason === cancellation.reason
      ) return current;
      throw new GenerationQueueConflictError("GENERATION_QUEUE_ALREADY_CANCELLED");
    }
    if (current.payload.status === "completed" || current.payload.status === "failed") {
      throw new GenerationQueueConflictError(`GENERATION_QUEUE_TERMINAL:${current.payload.status}`);
    }
    const next: GenerationQueueItem = {
      ...activeGenerationQueueState(current.payload),
      status: "cancelled",
      updatedAt: cancellation.cancelledAt,
      cancellation,
    };
    try {
      const envelope = await this.#replaceEnvelope(current, next, now);
      await this.#audit(cancellation.actorId, "generation.queue.cancelled", envelope, now, {
        priorStatus: current.payload.status,
      });
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new GenerationQueueConflictError("GENERATION_QUEUE_CANCEL_CONFLICT");
      }
      throw error;
    }
  }

  async reapExpiredLeases(options: Readonly<{ now?: Date }> = {}): Promise<number> {
    const now = generationQueueDate(options.now ?? new Date(), "GENERATION_QUEUE_NOW_INVALID");
    const leased = await this.list({ status: "leased" });
    let reaped = 0;
    for (const current of leased) {
      const lease = current.payload.lease;
      if (!lease || Date.parse(lease.expiresAt) > now.getTime()) continue;
      assertGenerationTransitionTime(current.payload, now);
      const exhausted = current.payload.attempt >= current.payload.maxAttempts;
      const lastFailure = createGenerationQueueFailure({
        code: exhausted ? "GENERATION_ATTEMPTS_EXHAUSTED" : "GENERATION_LEASE_EXPIRED",
        message: exhausted
          ? "The generation item exhausted its permitted attempts after the worker lease expired."
          : "The worker lease expired before the generation item reached a terminal result.",
        retryable: !exhausted,
        occurredAt: now,
      });
      const next: GenerationQueueItem = {
        ...activeGenerationQueueState(current.payload),
        status: exhausted ? "failed" : "retry-wait",
        availableAt: exhausted
          ? current.payload.availableAt
          : new Date(now.getTime() + this.#retryDelayMs(current.payload, lastFailure.code)).toISOString(),
        updatedAt: now.toISOString(),
        lastFailure,
      };
      try {
        const envelope = await this.#replaceEnvelope(current, next, now);
        await this.#audit(
          "queue_reaper",
          exhausted ? "generation.queue.failed" : "generation.queue.lease_reaped",
          envelope,
          now,
          { attempt: current.payload.attempt, workerId: lease.workerId },
        );
        reaped += 1;
      } catch (error) {
        if (error instanceof StoreConflictError) continue;
        throw error;
      }
    }
    return reaped;
  }

  async #createEnvelope(
    entityId: string,
    item: GenerationQueueItem,
    now: Date,
  ): Promise<StoredEnvelope<GenerationQueueItem>> {
    assertGenerationQueueItem(item, entityId);
    const envelope = await this.#store.create(
      GENERATION_QUEUE_ENTITY_TYPE,
      entityId,
      item as unknown as Record<string, unknown>,
      now,
    );
    return envelope as unknown as StoredEnvelope<GenerationQueueItem>;
  }

  async #replaceEnvelope(
    current: StoredEnvelope<GenerationQueueItem>,
    next: GenerationQueueItem,
    now: Date,
  ): Promise<StoredEnvelope<GenerationQueueItem>> {
    assertGenerationQueueItem(next, current.entityId);
    const envelope = await this.#store.replace(
      GENERATION_QUEUE_ENTITY_TYPE,
      current.entityId,
      current.revision,
      next as unknown as Record<string, unknown>,
      now,
    );
    return envelope as unknown as StoredEnvelope<GenerationQueueItem>;
  }

  #assertIdempotent(
    envelope: StoredEnvelope<GenerationQueueItem>,
    idempotencyKey: string,
  ): StoredEnvelope<GenerationQueueItem> {
    if (envelope.payload.idempotencyKey !== idempotencyKey) {
      throw new GenerationQueueConflictError("GENERATION_QUEUE_IDEMPOTENCY_CONFLICT");
    }
    return envelope;
  }

  async #readEnvelope(
    entityId: string,
    ignoreNonQueue = false,
  ): Promise<StoredEnvelope<GenerationQueueItem> | null> {
    const envelope = await this.#store.read<Record<string, unknown>>(
      GENERATION_QUEUE_ENTITY_TYPE,
      entityId,
    );
    if (!envelope) return null;
    if (envelope.payload.schemaVersion !== GENERATION_QUEUE_SCHEMA_VERSION) {
      if (ignoreNonQueue) return null;
      throw new GenerationQueueConflictError("GENERATION_QUEUE_ENTITY_COLLISION");
    }
    const typed = envelope as unknown as StoredEnvelope<GenerationQueueItem>;
    assertGenerationQueueItem(typed.payload, typed.entityId);
    return typed;
  }

  async #requireEnvelope(itemId: string): Promise<StoredEnvelope<GenerationQueueItem>> {
    const entityId = generationQueueIdentifier(itemId, "GENERATION_QUEUE_ID_INVALID");
    const envelope = await this.#readEnvelope(entityId);
    if (!envelope) throw new GenerationQueueConflictError("GENERATION_QUEUE_ITEM_NOT_FOUND");
    return envelope;
  }

  async #requireActiveLease(
    itemId: string,
    leaseToken: string,
    now: Date,
  ): Promise<StoredEnvelope<GenerationQueueItem>> {
    const current = await this.#requireEnvelope(itemId);
    if (current.payload.status !== "leased" || !current.payload.lease) {
      throw new GenerationLeaseError("GENERATION_QUEUE_ITEM_NOT_LEASED");
    }
    if (!generationLeaseTokenMatches(current.payload.lease.tokenHash, leaseToken)) {
      throw new GenerationLeaseError("GENERATION_QUEUE_LEASE_TOKEN_MISMATCH");
    }
    if (Date.parse(current.payload.lease.expiresAt) <= now.getTime()) {
      throw new GenerationLeaseError("GENERATION_QUEUE_LEASE_EXPIRED");
    }
    return current;
  }

  async #replaceLeaseOwned(
    current: StoredEnvelope<GenerationQueueItem>,
    next: GenerationQueueItem,
    leaseToken: string,
    now: Date,
  ): Promise<StoredEnvelope<GenerationQueueItem>> {
    if (!current.payload.lease || !generationLeaseTokenMatches(current.payload.lease.tokenHash, leaseToken)) {
      throw new GenerationLeaseError("GENERATION_QUEUE_LEASE_TOKEN_MISMATCH");
    }
    try {
      return await this.#replaceEnvelope(current, next, now);
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new GenerationLeaseError("GENERATION_QUEUE_LEASE_LOST");
      }
      throw error;
    }
  }

  async #failExhausted(current: StoredEnvelope<GenerationQueueItem>, now: Date): Promise<void> {
    assertGenerationTransitionTime(current.payload, now);
    const lastFailure = createGenerationQueueFailure({
      code: "GENERATION_ATTEMPTS_EXHAUSTED",
      message: "The generation item has no remaining execution attempts.",
      retryable: false,
      occurredAt: now,
    });
    const next: GenerationQueueItem = {
      ...activeGenerationQueueState(current.payload),
      status: "failed",
      updatedAt: now.toISOString(),
      lastFailure,
    };
    try {
      const envelope = await this.#replaceEnvelope(current, next, now);
      await this.#audit("queue_system", "generation.queue.failed", envelope, now, {
        attempt: current.payload.attempt,
        failureCode: lastFailure.code,
      });
    } catch (error) {
      if (!(error instanceof StoreConflictError)) throw error;
    }
  }

  #retryDelayMs(item: GenerationQueueItem, code: string): number {
    const exponent = Math.max(0, item.attempt - 1);
    const raw = Math.min(this.#maximumBackoffMs, this.#baseBackoffMs * 2 ** exponent);
    const jitterSeed = Number.parseInt(
      stableHash({ itemId: item.id, attempt: item.attempt, code }).slice(0, 8),
      16,
    );
    const jitter = 0.85 + (jitterSeed % 301) / 1_000;
    return Math.max(
      this.#baseBackoffMs,
      Math.min(this.#maximumBackoffMs, Math.round(raw * jitter)),
    );
  }

  async #audit(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<GenerationQueueItem>,
    occurredAt: Date,
    metadata: Readonly<Record<string, string | number | boolean | null>>,
  ): Promise<void> {
    await this.#store.appendAuditEvent({
      actorId,
      action,
      entityType: GENERATION_QUEUE_ENTITY_TYPE,
      entityId: envelope.entityId,
      revision: envelope.revision,
      metadata,
      occurredAt,
    });
  }
}
