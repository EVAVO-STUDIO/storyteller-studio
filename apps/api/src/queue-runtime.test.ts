import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileGenerationQueue } from "@evavo/storyteller-engine/generation-queue";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";
import type { GenerationJob } from "@evavo/storyteller-engine";
import {
  generationQueuePublicView,
  generationQueueRuntimeSummary,
  resolveGenerationQueueRuntimeConfiguration,
} from "./queue-runtime.js";

function generationJob(): GenerationJob {
  return {
    id: "job_api_001",
    projectId: "project_api_001",
    segmentId: "segment_api_001",
    providerFallbackIds: ["provider_primary"],
    cacheKey: "a".repeat(64),
    candidateCount: 2,
    status: "ready",
  };
}

test("queue runtime is disabled unless a driver is explicitly configured", () => {
  const configuration = resolveGenerationQueueRuntimeConfiguration({}, "C:\\work");
  assert.deepEqual(configuration, {
    driver: "disabled",
    enabled: false,
    persistence: "none",
    workerApiExposed: false,
  });
  assert.deepEqual(generationQueueRuntimeSummary(configuration), {
    driver: "disabled",
    enabled: false,
    persistence: "none",
    workerApiExposed: false,
    productionSingleHostAcknowledged: false,
  });
});

test("production file queue requires an explicit single-host acknowledgement", () => {
  assert.throws(
    () => resolveGenerationQueueRuntimeConfiguration({
      NODE_ENV: "production",
      STORYTELLER_QUEUE_DRIVER: "file",
      STORYTELLER_DATA_DIR: "./storage",
    }),
    /GENERATION_QUEUE_FILE_DRIVER_SINGLE_HOST_ACK_REQUIRED/u,
  );
  const configuration = resolveGenerationQueueRuntimeConfiguration({
    NODE_ENV: "production",
    STORYTELLER_QUEUE_DRIVER: "file",
    STORYTELLER_DATA_DIR: "./storage",
    STORYTELLER_FILE_QUEUE_SINGLE_HOST: "true",
  }, "/srv/storyteller");
  assert.equal(configuration.driver, "file");
  assert.equal(configuration.productionSingleHostAcknowledged, true);
  assert.equal(configuration.rootDirectory.endsWith(join("storage", "generation-queue")), true);
});

test("queue runtime rejects unknown drivers and missing data directories", () => {
  assert.throws(
    () => resolveGenerationQueueRuntimeConfiguration({ STORYTELLER_QUEUE_DRIVER: "redis" }),
    /GENERATION_QUEUE_DRIVER_INVALID/u,
  );
  assert.throws(
    () => resolveGenerationQueueRuntimeConfiguration({ STORYTELLER_QUEUE_DRIVER: "file" }),
    /GENERATION_QUEUE_DATA_DIR_REQUIRED/u,
  );
});

test("public queue views redact lease hashes, job routing and artifact references", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-api-queue-view-"));
  try {
    const queue = new FileGenerationQueue(new FileProjectStore(root));
    const queued = await queue.enqueue(generationJob(), {
      now: new Date("2026-07-27T00:00:00.000Z"),
    });
    const claim = await queue.claimNext({
      workerId: "worker_api_001",
      now: new Date("2026-07-27T00:00:00.000Z"),
    });
    if (!claim) throw new Error("claim required");
    const view = generationQueuePublicView(claim.envelope);
    const serialised = JSON.stringify(view);
    assert.equal(view.id, queued.payload.id);
    assert.equal(view.status, "leased");
    assert.equal(view.lease?.expiresAt, claim.item.lease?.expiresAt);
    assert.equal(serialised.includes("tokenHash"), false);
    assert.equal(serialised.includes(claim.leaseToken), false);
    assert.equal(serialised.includes("providerFallbackIds"), false);
    assert.equal(serialised.includes("cacheKey"), false);
    assert.equal(serialised.includes("outputArtifactRefs"), false);
    assert.equal(serialised.includes("worker_api_001"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
