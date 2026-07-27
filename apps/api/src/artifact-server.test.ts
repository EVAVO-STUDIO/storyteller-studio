import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { createArtifactRecord } from "@evavo/storyteller-engine/artifact-registry";
import {
  createArtifactRegistryRuntime,
  resolveArtifactRegistryRuntimeConfiguration,
} from "./artifact-runtime.js";
import { createStorytellerApiHandler } from "./server.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");

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
    "x-request-id": "request_artifact_server_001",
  };
}

function artifactEnvironment(
  overrides: Readonly<Record<string, string | undefined>> = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    STORYTELLER_API_TOKEN: "test-api-token",
    STORYTELLER_API_ACTOR_ID: "operator_artifact_server_001",
    STORYTELLER_QUEUE_DRIVER: "disabled",
    STORYTELLER_ARTIFACT_DRIVER: "file",
    STORYTELLER_DATA_DIR: ".",
    ...overrides,
  } as NodeJS.ProcessEnv;
}

async function seedArtifact(environment: NodeJS.ProcessEnv, root: string) {
  const configuration = resolveArtifactRegistryRuntimeConfiguration(environment, root);
  const registry = createArtifactRegistryRuntime(configuration);
  if (!registry) throw new Error("artifact registry required");
  const record = createArtifactRecord({
    id: "artifact_server_001",
    kind: "audio-candidate",
    projectId: "project_artifact_server_001",
    jobId: "job_artifact_server_001",
    segmentId: "segment_artifact_server_001",
    takeId: "take_artifact_server_001",
    storage: {
      driver: "private-object-store",
      provider: "s3-compatible-private",
      container: "storyteller-private-production",
      objectKey: "projects/project_artifact_server_001/takes/take_artifact_server_001.wav",
      versionId: "private-object-version-artifact-server-001",
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: "a".repeat(64),
      byteCount: 96_000,
      mimeType: "audio/wav",
      format: "wav",
    },
    provenance: {
      createdByActorId: "worker_artifact_server_001",
      sourceContentHash: "b".repeat(64),
      generationRequestHash: "c".repeat(64),
      providerId: "provider_primary",
      adapterVersion: "1.0.0",
      providerRequestId: "private-provider-request-artifact-server-001",
      parentArtifactIds: [],
    },
    rights: {
      rightsEvidenceId: "rights_artifact_server_001",
      rightsFingerprint: "d".repeat(64),
      allowedUses: ["audiobook"],
      commercialUseApproved: true,
    },
  }, t0);
  await registry.create(record, { actorId: "operator_artifact_server_001" });
  return record;
}

test("health reports artifact persistence separately without exposing its data directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-artifact-server-health-"));
  const environment = artifactEnvironment();
  const server = createServer(createStorytellerApiHandler({ environment, workingDirectory: root }));
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/health`);
    const body = await json(response);
    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    const artifactRegistry = body.artifactRegistry as Record<string, unknown>;
    assert.equal(artifactRegistry.status, "ready");
    assert.equal(artifactRegistry.enabled, true);
    assert.equal(artifactRegistry.persistence, "single-host-file");
    assert.equal(artifactRegistry.workerWriteApiExposed, false);
    assert.equal(artifactRegistry.releaseApiExposed, false);
    assert.equal(JSON.stringify(body).includes(root), false);
  } finally {
    await close(server);
    await rm(root, { recursive: true, force: true });
  }
});

test("authenticated artifact list and item routes expose only redacted governed views", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-artifact-server-read-"));
  const environment = artifactEnvironment();
  const record = await seedArtifact(environment, root);
  const server = createServer(createStorytellerApiHandler({ environment, workingDirectory: root }));
  const baseUrl = await listen(server);
  try {
    const listResponse = await fetch(
      `${baseUrl}/v1/artifacts?projectId=${record.projectId}&kind=audio-candidate&limit=10`,
      { headers: authHeaders() },
    );
    const listBody = await json(listResponse);
    assert.equal(listResponse.status, 200);
    assert.equal((listBody.data as unknown[]).length, 1);
    assert.equal((listBody.meta as Record<string, unknown>).truncated, false);
    assert.equal(listBody.workerWriteApiExposed, false);
    assert.equal(listBody.releaseApiExposed, false);

    const itemResponse = await fetch(
      `${baseUrl}/v1/artifacts/${encodeURIComponent(record.id)}`,
      { headers: authHeaders() },
    );
    const itemBody = await json(itemResponse);
    assert.equal(itemResponse.status, 200);
    assert.equal((itemBody.data as Record<string, unknown>).id, record.id);

    for (const body of [listBody, itemBody]) {
      const serialised = JSON.stringify(body);
      assert.equal(serialised.includes(record.storage.container), false);
      assert.equal(serialised.includes(record.storage.objectKey), false);
      assert.equal(serialised.includes(record.storage.versionId!), false);
      assert.equal(serialised.includes(record.provenance.providerRequestId!), false);
      assert.equal(serialised.includes(record.integrity.contentHash), true);
    }
  } finally {
    await close(server);
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact reads require authentication before registry access", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-artifact-server-auth-"));
  const environment = artifactEnvironment();
  await seedArtifact(environment, root);
  const server = createServer(createStorytellerApiHandler({ environment, workingDirectory: root }));
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/v1/artifacts`);
    const body = await json(response);
    assert.equal(response.status, 401);
    assert.equal((body.error as Record<string, unknown>).code, "API_BEARER_TOKEN_REQUIRED");
  } finally {
    await close(server);
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact reads fail closed when persistence is disabled", async () => {
  const environment = artifactEnvironment({ STORYTELLER_ARTIFACT_DRIVER: "disabled" });
  const server = createServer(createStorytellerApiHandler({ environment }));
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/v1/artifacts`, { headers: authHeaders() });
    const body = await json(response);
    assert.equal(response.status, 503);
    assert.equal((body.error as Record<string, unknown>).code, "ARTIFACT_REGISTRY_NOT_CONFIGURED");
  } finally {
    await close(server);
  }
});

test("normal artifact HTTP routes reject every write and release method even when persistence is disabled", async () => {
  const environment = artifactEnvironment({ STORYTELLER_ARTIFACT_DRIVER: "disabled" });
  const server = createServer(createStorytellerApiHandler({ environment }));
  const baseUrl = await listen(server);
  try {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const response = await fetch(`${baseUrl}/v1/artifacts/artifact_server_001`, {
        method,
        headers: authHeaders(),
        body: method === "DELETE" ? undefined : "{}",
      });
      const body = await json(response);
      assert.equal(response.status, 405);
      assert.equal((body.error as Record<string, unknown>).code, "ARTIFACT_WRITE_API_NOT_EXPOSED");
      assert.equal(body.workerWriteApiExposed, false);
      assert.equal(body.releaseApiExposed, false);
    }
  } finally {
    await close(server);
  }
});

test("production artifact file misconfiguration degrades health without exposing the private path", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-artifact-server-production-"));
  const environment = artifactEnvironment({
    NODE_ENV: "production",
    STORYTELLER_ARTIFACT_DRIVER: "file",
    STORYTELLER_DATA_DIR: "./private-artifact-data",
    STORYTELLER_FILE_ARTIFACT_STORE_SINGLE_HOST: undefined,
  });
  const server = createServer(createStorytellerApiHandler({ environment, workingDirectory: root }));
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/health`);
    const body = await json(response);
    assert.equal(response.status, 503);
    assert.equal(body.status, "degraded");
    const artifactRegistry = body.artifactRegistry as Record<string, unknown>;
    assert.equal(artifactRegistry.status, "misconfigured");
    assert.equal(artifactRegistry.code, "ARTIFACT_REGISTRY_FILE_DRIVER_SINGLE_HOST_ACK_REQUIRED");
    const serialised = JSON.stringify(body);
    assert.equal(serialised.includes(root), false);
    assert.equal(serialised.includes("private-artifact-data"), false);
  } finally {
    await close(server);
    await rm(root, { recursive: true, force: true });
  }
});

test("capabilities disclose read-only artifact posture without implying worker or release access", async () => {
  const server = createServer(createStorytellerApiHandler({
    environment: artifactEnvironment({ STORYTELLER_ARTIFACT_DRIVER: "disabled" }),
  }));
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/v1/capabilities`);
    const body = await json(response);
    assert.equal(response.status, 200);
    assert.equal(Array.isArray(body.artifacts), true);
    assert.equal(body.artifactWriteApiExposed, false);
    assert.equal(body.releaseApiExposed, false);
    assert.equal(body.workerApiExposed, false);
  } finally {
    await close(server);
  }
});
