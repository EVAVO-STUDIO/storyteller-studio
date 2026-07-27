import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createArtifactRecord } from "@evavo/storyteller-engine/artifact-registry";
import {
  artifactRegistryRuntimeSummary,
  createArtifactRegistryRuntime,
  resolveArtifactRegistryRuntimeConfiguration,
} from "./artifact-runtime.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");

test("artifact runtime is disabled unless a driver is explicitly configured", () => {
  const configuration = resolveArtifactRegistryRuntimeConfiguration({}, "C:\\work");
  assert.deepEqual(configuration, {
    driver: "disabled",
    enabled: false,
    persistence: "none",
    workerWriteApiExposed: false,
    releaseApiExposed: false,
  });
  assert.deepEqual(artifactRegistryRuntimeSummary(configuration), {
    driver: "disabled",
    enabled: false,
    persistence: "none",
    workerWriteApiExposed: false,
    releaseApiExposed: false,
    productionSingleHostAcknowledged: false,
  });
  assert.equal(createArtifactRegistryRuntime(configuration), null);
});

test("production file artifacts require an explicit single-host acknowledgement", () => {
  assert.throws(
    () => resolveArtifactRegistryRuntimeConfiguration({
      NODE_ENV: "production",
      STORYTELLER_ARTIFACT_DRIVER: "file",
      STORYTELLER_DATA_DIR: "./storage",
    }),
    /ARTIFACT_REGISTRY_FILE_DRIVER_SINGLE_HOST_ACK_REQUIRED/u,
  );

  const configuration = resolveArtifactRegistryRuntimeConfiguration({
    NODE_ENV: "production",
    STORYTELLER_ARTIFACT_DRIVER: "file",
    STORYTELLER_DATA_DIR: "./storage",
    STORYTELLER_FILE_ARTIFACT_STORE_SINGLE_HOST: "true",
  }, "/srv/storyteller");
  assert.equal(configuration.driver, "file");
  assert.equal(configuration.productionSingleHostAcknowledged, true);
  assert.equal(configuration.rootDirectory.endsWith(join("storage", "artifact-registry")), true);
  assert.deepEqual(artifactRegistryRuntimeSummary(configuration), {
    driver: "file",
    enabled: true,
    persistence: "single-host-file",
    workerWriteApiExposed: false,
    releaseApiExposed: false,
    productionSingleHostAcknowledged: true,
  });
});

test("artifact runtime rejects unknown drivers and missing data directories", () => {
  assert.throws(
    () => resolveArtifactRegistryRuntimeConfiguration({ STORYTELLER_ARTIFACT_DRIVER: "database" }),
    /ARTIFACT_REGISTRY_DRIVER_INVALID/u,
  );
  assert.throws(
    () => resolveArtifactRegistryRuntimeConfiguration({ STORYTELLER_ARTIFACT_DRIVER: "file" }),
    /ARTIFACT_REGISTRY_DATA_DIR_REQUIRED/u,
  );
});

test("file artifact runtime stores private records while returning only redacted views", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-api-artifact-runtime-"));
  try {
    const configuration = resolveArtifactRegistryRuntimeConfiguration({
      STORYTELLER_ARTIFACT_DRIVER: "file",
      STORYTELLER_DATA_DIR: ".",
    }, root);
    const registry = createArtifactRegistryRuntime(configuration);
    if (!registry) throw new Error("artifact registry required");

    const record = createArtifactRecord({
      id: "artifact_api_runtime_001",
      kind: "audio-candidate",
      projectId: "project_api_runtime_001",
      jobId: "job_api_runtime_001",
      segmentId: "segment_api_runtime_001",
      takeId: "take_api_runtime_001",
      storage: {
        driver: "private-object-store",
        provider: "s3-compatible-private",
        container: "storyteller-private-production",
        objectKey: "projects/project_api_runtime_001/takes/take_api_runtime_001.wav",
        versionId: "private-object-version-001",
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
        createdByActorId: "worker_api_runtime_001",
        sourceContentHash: "b".repeat(64),
        generationRequestHash: "c".repeat(64),
        providerId: "provider_primary",
        adapterVersion: "1.0.0",
        providerRequestId: "private-provider-request-001",
        parentArtifactIds: [],
      },
      rights: {
        rightsEvidenceId: "rights_api_runtime_001",
        rightsFingerprint: "d".repeat(64),
        allowedUses: ["audiobook"],
        commercialUseApproved: true,
      },
    }, t0);
    await registry.create(record, { actorId: "operator_api_runtime_001" });

    const views = await registry.publicViews({ projectId: record.projectId });
    assert.equal(views.length, 1);
    const serialised = JSON.stringify(views);
    assert.equal(serialised.includes(record.storage.container), false);
    assert.equal(serialised.includes(record.storage.objectKey), false);
    assert.equal(serialised.includes(record.storage.versionId!), false);
    assert.equal(serialised.includes(record.provenance.providerRequestId!), false);
    assert.equal(serialised.includes(record.integrity.contentHash), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
