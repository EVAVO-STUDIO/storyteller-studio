import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileGenerationQueue,
  GENERATION_QUEUE_SCHEMA_VERSION,
  GenerationLeaseError,
  GenerationQueueConflictError,
} from "./generation-queue.js";
import { FileProjectStore } from "./project-store.js";
import { stableHash, type GenerationJob } from "./index.js";

function job(id: string, overrides: Partial<GenerationJob> = {}): GenerationJob {
  return {
    id,
    projectId: "project_001",
    segmentId: `segment_${id}`,
    providerFallbackIds: ["provider_primary", "provider_fallback"],
    cacheKey: "a".repeat(64),
    candidateCount: 2,
    status: "ready",
    ...overrides,
  };
}

async function withQueue(
  run: (subject: FileGenerationQueue, store: FileProjectStore, root: string) => Promise<void>,
  options: { baseBackoffMs?: number; maximumBackoffMs?: number } = {},
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-generation-queue-"));
  try {
    const store = new FileProjectStore(root, { lockTimeoutMs: 1_000 });
    const subject = new FileGenerationQueue(store, options);
    await run(subject, store, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const t0 = new Date("2026-07-27T00:00:00.000Z");

test("enqueue is idempotent but rejects changed generation intent", async () => {
  await withQueue(async (subject) => {
    const first = await subject.enqueue(job("job_001"), { now: t0 });
    const same = await subject.enqueue(job("job_001"), { now: new Date(t0.getTime() + 10) });
    assert.equal(first.revision, 1);
    assert.equal(same.revision, 1);
    assert.equal(same.payload.status, "queued");
    await assert.rejects(
      () => subject.enqueue(job("job_001", { cacheKey: "b".repeat(64) }), { now: t0 }),
      (error: unknown) => error instanceof GenerationQueueConflictError && error.message === "GENERATION_QUEUE_IDEMPOTENCY_CONFLICT",
    );
  });
});

test("blocked generation intents remain visible but cannot be leased", async () => {
  await withQueue(async (subject) => {
    const blocked = await subject.enqueue(job("job_blocked", {
      providerFallbackIds: [],
      status: "blocked",
    }), { now: t0 });
    assert.equal(blocked.payload.status, "blocked");
    assert.deepEqual(blocked.payload.block?.codes, ["GENERATION_JOB_BLOCKED"]);
    assert.equal(await subject.claimNext({ workerId: "worker_01", now: t0 }), null);
  });
});

test("claims are priority ordered and lease exclusive", async () => {
  await withQueue(async (subject) => {
    await subject.enqueue(job("job_low"), { priority: 10, now: t0 });
    await subject.enqueue(job("job_high"), { priority: 90, now: t0 });
    const first = await subject.claimNext({ workerId: "worker_01", leaseDurationMs: 5_000, now: t0 });
    const second = await subject.claimNext({ workerId: "worker_02", leaseDurationMs: 5_000, now: t0 });
    const third = await subject.claimNext({ workerId: "worker_03", leaseDurationMs: 5_000, now: t0 });
    assert.equal(first?.item.jobId, "job_high");
    assert.equal(second?.item.jobId, "job_low");
    assert.equal(third, null);
    assert.notEqual(first?.leaseToken, second?.leaseToken);
  });
});

test("persisted leases contain only a token hash and heartbeat requires the opaque token", async () => {
  await withQueue(async (subject, _store, root) => {
    const queued = await subject.enqueue(job("job_heartbeat"), { now: t0 });
    const claim = await subject.claimNext({ workerId: "worker_01", leaseDurationMs: 2_000, now: t0 });
    if (!claim) throw new Error("claim required");

    const source = await readFile(
      join(root, "entities", "generation-job", `${queued.payload.id}.json`),
      "utf8",
    );
    assert.equal(source.includes(claim.leaseToken), false);
    assert.equal(source.includes(stableHash(claim.leaseToken)), true);
    assert.equal(Object.prototype.hasOwnProperty.call(claim.item.lease ?? {}, "token"), false);

    await assert.rejects(
      () => subject.heartbeat(queued.payload.id, "A".repeat(43), { now: new Date(t0.getTime() + 500) }),
      (error: unknown) => error instanceof GenerationLeaseError && error.message === "GENERATION_QUEUE_LEASE_TOKEN_MISMATCH",
    );
    const renewed = await subject.heartbeat(queued.payload.id, claim.leaseToken, {
      leaseDurationMs: 5_000,
      now: new Date(t0.getTime() + 500),
    });
    assert.equal(renewed.payload.lease?.heartbeatAt, "2026-07-27T00:00:00.500Z");
    assert.equal(renewed.payload.lease?.expiresAt, "2026-07-27T00:00:05.500Z");
  });
});

test("retryable failures back off and stop at the attempt ceiling", async () => {
  await withQueue(async (subject) => {
    const queued = await subject.enqueue(job("job_retry"), { maxAttempts: 2, now: t0 });
    const first = await subject.claimNext({ workerId: "worker_01", now: t0 });
    if (!first) throw new Error("first claim required");
    const retry = await subject.fail(queued.payload.id, first.leaseToken, {
      code: "PROVIDER_TEMPORARY_FAILURE",
      message: "Temporary provider outage.",
      retryable: true,
      providerId: "provider_primary",
      now: new Date(t0.getTime() + 100),
    });
    assert.equal(retry.payload.status, "retry-wait");
    assert.ok(Date.parse(retry.payload.availableAt) > t0.getTime() + 100);
    const tooEarly = await subject.claimNext({ workerId: "worker_02", now: new Date(t0.getTime() + 200) });
    assert.equal(tooEarly, null);
    const second = await subject.claimNext({ workerId: "worker_02", now: new Date(Date.parse(retry.payload.availableAt) + 1) });
    if (!second) throw new Error("second claim required");
    const failed = await subject.fail(queued.payload.id, second.leaseToken, {
      code: "PROVIDER_TEMPORARY_FAILURE",
      message: "Provider remained unavailable.",
      retryable: true,
      now: new Date(Date.parse(retry.payload.availableAt) + 2),
    });
    assert.equal(failed.payload.status, "failed");
    assert.equal(failed.payload.attempt, 2);
  }, { baseBackoffMs: 1_000, maximumBackoffMs: 10_000 });
});

test("expired leases are reaped and become claimable with a new token", async () => {
  await withQueue(async (subject) => {
    const queued = await subject.enqueue(job("job_reap"), { maxAttempts: 3, now: t0 });
    const first = await subject.claimNext({ workerId: "worker_01", leaseDurationMs: 1_000, now: t0 });
    if (!first) throw new Error("first claim required");
    const reaped = await subject.reapExpiredLeases({ now: new Date(t0.getTime() + 1_001) });
    assert.equal(reaped, 1);
    const row = await subject.read(queued.payload.id);
    assert.equal(row?.payload.status, "retry-wait");
    const second = await subject.claimNext({
      workerId: "worker_02",
      now: new Date(Date.parse(row!.payload.availableAt) + 1),
    });
    if (!second) throw new Error("second claim required");
    assert.notEqual(first.leaseToken, second.leaseToken);
    assert.equal(second.item.attempt, 2);
  }, { baseBackoffMs: 100, maximumBackoffMs: 1_000 });
});

test("completion stores references and provenance hashes without raw media", async () => {
  await withQueue(async (subject, _store, root) => {
    const queued = await subject.enqueue(job("job_complete"), { now: t0 });
    const claim = await subject.claimNext({ workerId: "worker_01", now: t0 });
    if (!claim) throw new Error("claim required");
    const completed = await subject.complete(queued.payload.id, claim.leaseToken, {
      executionReportHash: "b".repeat(64),
      resultIds: ["result_candidate_01", "result_candidate_02"],
      outputArtifactRefs: ["artifact_take_01", "artifact_take_02"],
      totalEstimatedCost: 0.12,
      currency: "AUD",
      now: new Date(t0.getTime() + 500),
    });
    assert.equal(completed.payload.status, "completed");
    assert.equal(completed.payload.lease, undefined);
    assert.equal(completed.payload.completion?.outputArtifactRefs.length, 2);
    assert.equal(Object.prototype.hasOwnProperty.call(completed.payload.completion ?? {}, "audio"), false);
    const source = await readFile(
      join(root, "entities", "generation-job", `${queued.payload.id}.json`),
      "utf8",
    );
    assert.equal(source.includes(claim.leaseToken), false);
    assert.equal(source.includes("audio"), false);
  });
});

test("operator cancellation invalidates an in-flight worker lease", async () => {
  await withQueue(async (subject) => {
    const queued = await subject.enqueue(job("job_cancel"), { now: t0 });
    const claim = await subject.claimNext({ workerId: "worker_01", now: t0 });
    if (!claim) throw new Error("claim required");
    const cancelled = await subject.cancel(queued.payload.id, {
      actorId: "operator_01",
      reason: "The author requested a direction review before further generation.",
      now: new Date(t0.getTime() + 100),
    });
    assert.equal(cancelled.payload.status, "cancelled");
    await assert.rejects(
      () => subject.complete(queued.payload.id, claim.leaseToken, {
        executionReportHash: "c".repeat(64),
        resultIds: ["result_late"],
        outputArtifactRefs: ["artifact_late"],
        now: new Date(t0.getTime() + 200),
      }),
      (error: unknown) => error instanceof GenerationLeaseError && error.message === "GENERATION_QUEUE_ITEM_NOT_LEASED",
    );
  });
});

test("queue reads fail closed for malformed persisted queue state", async () => {
  await withQueue(async (subject, store) => {
    await store.create("generation-job", "queue_job_invalid", {
      schemaVersion: GENERATION_QUEUE_SCHEMA_VERSION,
      status: "teleported",
    });
    await assert.rejects(
      () => subject.read("queue_job_invalid"),
      /GENERATION_QUEUE_STATUS_INVALID/u,
    );
  });
});
