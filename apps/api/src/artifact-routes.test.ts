import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createArtifactRecord,
  verifyArtifactIntegrity,
  type ArtifactRecord,
} from "@evavo/storyteller-engine/artifact-registry";
import { FileArtifactRegistry } from "@evavo/storyteller-engine/artifact-store";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";
import { handleArtifactReadRoute } from "./artifact-routes.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:01:00.000Z");

function pendingArtifact(
  id: string,
  projectId: string,
  takeId: string,
  hashCharacter: string,
): ArtifactRecord {
  return createArtifactRecord({
    id,
    kind: "audio-candidate",
    projectId,
    jobId: `job_${projectId}`,
    segmentId: `segment_${projectId}`,
    takeId,
    storage: {
      driver: "private-object-store",
      provider: "s3-compatible-private",
      container: "storyteller-private-production",
      objectKey: `projects/${projectId}/takes/${takeId}.wav`,
      versionId: `private-version-${takeId}`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: hashCharacter.repeat(64),
      byteCount: 96_000,
      mimeType: "audio/wav",
      format: "wav",
    },
    provenance: {
      createdByActorId: "worker_artifact_routes_001",
      sourceContentHash: "b".repeat(64),
      generationRequestHash: "c".repeat(64),
      providerId: "provider_primary",
      adapterVersion: "1.0.0",
      providerRequestId: `private-provider-request-${takeId}`,
      parentArtifactIds: [],
    },
    rights: {
      rightsEvidenceId: "rights_artifact_routes_001",
      rightsFingerprint: "d".repeat(64),
      allowedUses: ["audiobook"],
      commercialUseApproved: true,
    },
  }, t0);
}

async function withRegistry(
  run: (registry: FileArtifactRegistry) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-artifact-routes-"));
  try {
    const registry = new FileArtifactRegistry(new FileProjectStore(root));
    await run(registry);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function seed(registry: FileArtifactRegistry): Promise<{
  first: ArtifactRecord;
  second: ArtifactRecord;
  other: ArtifactRecord;
}> {
  const first = pendingArtifact(
    "artifact_routes_001",
    "project_routes_001",
    "take_routes_001",
    "1",
  );
  const secondPending = pendingArtifact(
    "artifact_routes_002",
    "project_routes_001",
    "take_routes_002",
    "2",
  );
  const other = pendingArtifact(
    "artifact_routes_003",
    "project_routes_other",
    "take_routes_003",
    "3",
  );
  await registry.create(first, { actorId: "operator_artifact_routes_001" });
  await registry.create(secondPending, { actorId: "operator_artifact_routes_001" });
  await registry.create(other, { actorId: "operator_artifact_routes_001" });
  const verifiedEnvelope = await registry.transition(secondPending.id, {
    expectedRevision: 1,
    actorId: "verifier_artifact_routes_001",
    action: "artifact.verified",
    apply: (current) => verifyArtifactIntegrity(current, {
      observedContentHash: current.integrity.contentHash,
      observedByteCount: current.integrity.byteCount,
      checkedByActorId: "verifier_artifact_routes_001",
      checks: ["sha256", "byte-count", "media-signature"],
      checkedAt: t1,
    }),
  });
  return { first, second: verifiedEnvelope.payload, other };
}

test("artifact list route applies bounded filters, limits and redacts private locators", async () => {
  await withRegistry(async (registry) => {
    const { first, second } = await seed(registry);
    const result = await handleArtifactReadRoute({
      method: "GET",
      url: new URL(
        "http://storyteller.local/v1/artifacts"
        + "?projectId=project_routes_001"
        + "&kind=audio-candidate"
        + "&verificationStatus=pending,verified"
        + "&reviewStatus=pending"
        + "&released=false"
        + "&limit=1",
      ),
      registry,
      requestId: "request_artifact_routes_001",
    });
    assert.ok(result);
    assert.equal(result.status, 200);
    const data = result.body.data as Array<Record<string, unknown>>;
    const meta = result.body.meta as Record<string, unknown>;
    assert.equal(data.length, 1);
    assert.equal(meta.total, 2);
    assert.equal(meta.returned, 1);
    assert.equal(meta.truncated, true);
    assert.equal(result.body.workerWriteApiExposed, false);
    assert.equal(result.body.releaseApiExposed, false);

    const serialised = JSON.stringify(result.body);
    for (const privateValue of [
      first.storage.container,
      first.storage.objectKey,
      first.storage.versionId!,
      first.provenance.providerRequestId!,
      second.storage.objectKey,
    ]) {
      assert.equal(serialised.includes(privateValue), false);
    }
    assert.equal(serialised.includes(first.integrity.contentHash) || serialised.includes(second.integrity.contentHash), true);
  });
});

test("artifact item route returns a redacted record and a stable not-found response", async () => {
  await withRegistry(async (registry) => {
    const { first } = await seed(registry);
    const found = await handleArtifactReadRoute({
      method: "GET",
      url: new URL(`http://storyteller.local/v1/artifacts/${encodeURIComponent(first.id)}`),
      registry,
      requestId: "request_artifact_routes_002",
    });
    assert.ok(found);
    assert.equal(found.status, 200);
    assert.equal((found.body.data as Record<string, unknown>).id, first.id);
    const serialised = JSON.stringify(found.body);
    assert.equal(serialised.includes(first.storage.container), false);
    assert.equal(serialised.includes(first.storage.objectKey), false);
    assert.equal(serialised.includes(first.storage.versionId!), false);
    assert.equal(serialised.includes(first.provenance.providerRequestId!), false);

    const missing = await handleArtifactReadRoute({
      method: "GET",
      url: new URL("http://storyteller.local/v1/artifacts/artifact_routes_missing"),
      registry,
      requestId: "request_artifact_routes_003",
    });
    assert.ok(missing);
    assert.equal(missing.status, 404);
    assert.equal(
      ((missing.body.error as Record<string, unknown>).code),
      "ARTIFACT_NOT_FOUND",
    );
  });
});

test("artifact routes expose no write or release operation", async () => {
  await withRegistry(async (registry) => {
    const { first } = await seed(registry);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const result = await handleArtifactReadRoute({
        method,
        url: new URL(`http://storyteller.local/v1/artifacts/${first.id}`),
        registry,
        requestId: `request_artifact_routes_${method.toLocaleLowerCase("en-AU")}`,
      });
      assert.ok(result);
      assert.equal(result.status, 405);
      assert.equal(
        ((result.body.error as Record<string, unknown>).code),
        "ARTIFACT_WRITE_API_NOT_EXPOSED",
      );
      assert.equal(result.body.workerWriteApiExposed, false);
      assert.equal(result.body.releaseApiExposed, false);
    }
    const rows = await registry.list();
    assert.equal(rows.length, 3);
  });
});

test("artifact route filters reject invalid identifiers, enums and limits", async () => {
  await withRegistry(async (registry) => {
    await assert.rejects(
      handleArtifactReadRoute({
        method: "GET",
        url: new URL("http://storyteller.local/v1/artifacts?projectId=../escape"),
        registry,
        requestId: "request_artifact_routes_invalid_001",
      }),
      /ARTIFACT_PROJECT_FILTER_INVALID/u,
    );
    await assert.rejects(
      handleArtifactReadRoute({
        method: "GET",
        url: new URL("http://storyteller.local/v1/artifacts?kind=unknown-media"),
        registry,
        requestId: "request_artifact_routes_invalid_002",
      }),
      /ARTIFACT_KIND_FILTER_INVALID/u,
    );
    await assert.rejects(
      handleArtifactReadRoute({
        method: "GET",
        url: new URL("http://storyteller.local/v1/artifacts?verificationStatus=trusted"),
        registry,
        requestId: "request_artifact_routes_invalid_003",
      }),
      /ARTIFACT_VERIFICATION_FILTER_INVALID/u,
    );
    await assert.rejects(
      handleArtifactReadRoute({
        method: "GET",
        url: new URL("http://storyteller.local/v1/artifacts?limit=201"),
        registry,
        requestId: "request_artifact_routes_invalid_004",
      }),
      /ARTIFACT_LIMIT_INVALID/u,
    );
  });
});

test("artifact route helper ignores unrelated API paths", async () => {
  await withRegistry(async (registry) => {
    const result = await handleArtifactReadRoute({
      method: "GET",
      url: new URL("http://storyteller.local/v1/projects/plan"),
      registry,
      requestId: "request_artifact_routes_unrelated",
    });
    assert.equal(result, null);
  });
});
