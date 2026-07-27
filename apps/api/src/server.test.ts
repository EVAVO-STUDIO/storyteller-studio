import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createProjectManifest,
  type CreateProjectInput,
} from "@evavo/storyteller-engine";
import { createStorytellerApiHandler } from "./server.js";

function projectManifest() {
  const input: CreateProjectInput = {
    id: "project_api_queue_001",
    title: "The House",
    manuscriptText: "Chapter One\n\nThe house kept its own weather, and Mara listened at the locked door.",
    rightsEvidence: {
      id: "rights_api_queue_001",
      voiceLabel: "Designed narrator",
      sourceKind: "synthetic-designed",
      allowedUses: ["audiobook"],
      commercialUseApproved: true,
    },
    providerRequirements: {
      requiredFeatures: ["batch-long-form"],
      maximumSegmentCharacters: 1_200,
      prohibitInputStorage: true,
      prohibitTrainingUse: true,
    },
    providerProfiles: [
      {
        id: "provider_primary",
        label: "Primary provider",
        features: ["batch-long-form", "word-timestamps"],
        maximumInputCharacters: 10_000,
        regions: ["australia"],
        storesInputs: false,
        trainsOnCustomerData: false,
        customVoiceRequiresConsent: true,
      },
    ],
    createdAt: new Date("2026-07-27T00:00:00.000Z"),
  };
  const manifest = createProjectManifest(input);
  assert.equal(manifest.status, "planned");
  return manifest;
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolvePromise();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server address unavailable");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    server.close((error) => error ? reject(error) : resolvePromise());
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function authHeaders(token = "test-api-token"): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-request-id": "request_api_queue_001",
  };
}

test("health reports a production file queue misconfiguration without exposing its data path", async () => {
  const handler = createStorytellerApiHandler({
    environment: {
      NODE_ENV: "production",
      STORYTELLER_QUEUE_DRIVER: "file",
      STORYTELLER_DATA_DIR: "./private-storage",
    },
  });
  const server = createServer(handler);
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/health`);
    const body = await json(response);
    assert.equal(response.status, 503);
    assert.equal(body.status, "degraded");
    const serialised = JSON.stringify(body);
    assert.equal(serialised.includes("GENERATION_QUEUE_FILE_DRIVER_SINGLE_HOST_ACK_REQUIRED"), true);
    assert.equal(serialised.includes("private-storage"), false);
  } finally {
    await close(server);
  }
});

test("queue routes fail closed when durable admission is not configured", async () => {
  const handler = createStorytellerApiHandler({
    environment: {
      NODE_ENV: "test",
      STORYTELLER_API_TOKEN: "test-api-token",
      STORYTELLER_API_ACTOR_ID: "operator_test",
      STORYTELLER_QUEUE_DRIVER: "disabled",
    },
  });
  const server = createServer(handler);
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/v1/generation/queue`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ manifest: projectManifest() }),
    });
    const body = await json(response);
    assert.equal(response.status, 503);
    assert.equal((body.error as Record<string, unknown>).code, "GENERATION_QUEUE_NOT_CONFIGURED");
  } finally {
    await close(server);
  }
});

test("queue admission, inspection and cancellation expose only redacted operator state", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-queue-api-"));
  let currentTime = new Date("2026-07-27T00:00:00.000Z");
  const handler = createStorytellerApiHandler({
    environment: {
      NODE_ENV: "test",
      STORYTELLER_API_TOKEN: "test-api-token",
      STORYTELLER_API_ACTOR_ID: "operator_server_configured",
      STORYTELLER_QUEUE_DRIVER: "file",
      STORYTELLER_DATA_DIR: ".",
    },
    workingDirectory: root,
    now: () => currentTime,
  });
  const server = createServer(handler);
  const baseUrl = await listen(server);
  try {
    const admittedResponse = await fetch(`${baseUrl}/v1/generation/queue`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        manifest: projectManifest(),
        candidateCount: 2,
        priority: 80,
        maxAttempts: 3,
      }),
    });
    const admittedBody = await json(admittedResponse);
    assert.equal(admittedResponse.status, 202);
    assert.equal(admittedBody.execution, "queued");
    assert.equal(admittedBody.workerApiExposed, false);
    const admitted = admittedBody.data as Array<Record<string, unknown>>;
    assert.ok(admitted.length > 0);
    const item = admitted[0]!;
    const itemId = item.id as string;
    assert.equal(item.status, "queued");
    assert.equal(item.priority, 80);
    const admittedSerialised = JSON.stringify(admittedBody);
    assert.equal(admittedSerialised.includes("tokenHash"), false);
    assert.equal(admittedSerialised.includes("providerFallbackIds"), false);
    assert.equal(admittedSerialised.includes("cacheKey"), false);
    assert.equal(admittedSerialised.includes("The house kept its own weather"), false);

    const listedResponse = await fetch(
      `${baseUrl}/v1/generation/queue?projectId=project_api_queue_001&status=queued&limit=10`,
      { headers: authHeaders() },
    );
    const listedBody = await json(listedResponse);
    assert.equal(listedResponse.status, 200);
    assert.ok((listedBody.data as unknown[]).length > 0);
    assert.equal((listedBody.meta as Record<string, unknown>).truncated, false);

    const itemResponse = await fetch(`${baseUrl}/v1/generation/queue/${encodeURIComponent(itemId)}`, {
      headers: authHeaders(),
    });
    assert.equal(itemResponse.status, 200);

    currentTime = new Date("2026-07-27T00:00:01.000Z");
    const cancelledResponse = await fetch(
      `${baseUrl}/v1/generation/queue/${encodeURIComponent(itemId)}/cancel`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          reason: "The author requested a direction review.",
          actorId: "untrusted_body_actor",
        }),
      },
    );
    const cancelledBody = await json(cancelledResponse);
    assert.equal(cancelledResponse.status, 200);
    const cancelled = cancelledBody.data as Record<string, unknown>;
    assert.equal(cancelled.status, "cancelled");
    assert.equal(
      (cancelled.cancellation as Record<string, unknown>).actorId,
      "operator_server_configured",
    );
    assert.equal(JSON.stringify(cancelledBody).includes("untrusted_body_actor"), false);

    const workerRouteResponse = await fetch(
      `${baseUrl}/v1/generation/queue/${encodeURIComponent(itemId)}/claim`,
      { method: "POST", headers: authHeaders(), body: "{}" },
    );
    assert.equal(workerRouteResponse.status, 404);
  } finally {
    await close(server);
    await rm(root, { recursive: true, force: true });
  }
});

test("production queue cancellation requires a server-configured actor identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-queue-api-actor-"));
  const handler = createStorytellerApiHandler({
    environment: {
      NODE_ENV: "production",
      STORYTELLER_API_TOKEN: "test-api-token",
      STORYTELLER_QUEUE_DRIVER: "file",
      STORYTELLER_DATA_DIR: ".",
      STORYTELLER_FILE_QUEUE_SINGLE_HOST: "true",
    },
    workingDirectory: root,
  });
  const server = createServer(handler);
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/v1/generation/queue`, {
      method: "GET",
      headers: authHeaders(),
    });
    const body = await json(response);
    assert.equal(response.status, 503);
    assert.equal((body.error as Record<string, unknown>).code, "API_ACTOR_CONFIGURATION_MISSING");
  } finally {
    await close(server);
    await rm(root, { recursive: true, force: true });
  }
});
