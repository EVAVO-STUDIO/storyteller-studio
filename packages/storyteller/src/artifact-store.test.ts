import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  artifactPublicView,
  createArtifactRecord,
  recordArtifactReview,
  verifyArtifactIntegrity,
  type ArtifactRecord,
} from "./artifact-registry.js";
import {
  ArtifactStoreConflictError,
  FileArtifactRegistry,
} from "./artifact-store.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:01:00.000Z");
const t2 = new Date("2026-07-27T00:02:00.000Z");

function pendingArtifact(
  id = "artifact_store_take_001",
  projectId = "project_store_001",
): ArtifactRecord {
  return createArtifactRecord({
    id,
    kind: "audio-candidate",
    projectId,
    jobId: "job_store_001",
    segmentId: "segment_store_001",
    takeId: `take_${id}`,
    storage: {
      driver: "private-object-store",
      provider: "s3-compatible-private",
      container: "storyteller-production-private",
      objectKey: `projects/${projectId}/jobs/job_store_001/${id}.wav`,
      versionId: `private-version-${id}`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: "a".repeat(64),
      byteCount: 128_000,
      mimeType: "audio/wav",
      format: "wav",
    },
    provenance: {
      createdByActorId: "worker_store_001",
      sourceContentHash: "b".repeat(64),
      generationRequestHash: "c".repeat(64),
      providerId: "provider_primary",
      adapterVersion: "1.0.0",
      providerRequestId: `private-request-${id}`,
      parentArtifactIds: [],
    },
    rights: {
      rightsEvidenceId: "rights_store_001",
      rightsFingerprint: "d".repeat(64),
      allowedUses: ["audiobook"],
      commercialUseApproved: true,
      expiresAt: "2028-07-27T00:00:00.000Z",
    },
  }, t0);
}

async function withRegistry(
  run: (
    registry: FileArtifactRegistry,
    store: FileProjectStore,
    root: string,
  ) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-artifact-store-"));
  try {
    const store = new FileProjectStore(root, { lockTimeoutMs: 1_000 });
    const registry = new FileArtifactRegistry(store);
    await run(registry, store, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("file artifact registry creates, reads and lists validated artifact envelopes", async () => {
  await withRegistry(async (registry) => {
    const record = pendingArtifact();
    const created = await registry.create(record, { actorId: "operator_store_001" });
    assert.equal(created.revision, 1);
    assert.equal(created.payload.revision, 1);
    assert.equal(created.payload.fingerprint, record.fingerprint);

    const read = await registry.read(record.id);
    assert.equal(read?.payload.id, record.id);
    assert.equal(read?.payload.storage.objectKey, record.storage.objectKey);

    const listed = await registry.list({
      projectId: record.projectId,
      kind: "audio-candidate",
      verificationStatus: "pending",
    });
    assert.deepEqual(listed.map((item) => item.payload.id), [record.id]);
    assert.deepEqual(await registry.list({ projectId: "project_other" }), []);
  });
});

test("artifact transitions keep store and domain revisions aligned", async () => {
  await withRegistry(async (registry) => {
    const pending = pendingArtifact("artifact_store_take_002");
    await registry.create(pending, { actorId: "operator_store_001" });

    const verifiedEnvelope = await registry.transition(pending.id, {
      expectedRevision: 1,
      actorId: "verifier_store_001",
      action: "artifact.verified",
      apply: (current) => verifyArtifactIntegrity(current, {
        observedContentHash: current.integrity.contentHash,
        observedByteCount: current.integrity.byteCount,
        checkedByActorId: "verifier_store_001",
        checks: ["sha256", "byte-count", "media-signature"],
        checkedAt: t1,
      }),
    });
    assert.equal(verifiedEnvelope.revision, 2);
    assert.equal(verifiedEnvelope.payload.revision, 2);
    assert.equal(verifiedEnvelope.payload.verification.status, "verified");
    assert.equal(verifiedEnvelope.payload.previousFingerprint, pending.fingerprint);

    const approvedEnvelope = await registry.transition(pending.id, {
      expectedRevision: 2,
      actorId: "reviewer_store_001",
      action: "artifact.review_approved",
      apply: (current) => recordArtifactReview(current, {
        decision: "approved",
        reviewerId: "reviewer_store_001",
        notes: "Approved against the immutable source and neighbouring takes.",
        decidedAt: t2,
      }),
    });
    assert.equal(approvedEnvelope.revision, 3);
    assert.equal(approvedEnvelope.payload.revision, 3);
    assert.equal(approvedEnvelope.payload.review.status, "approved");
    assert.equal(
      approvedEnvelope.payload.previousFingerprint,
      verifiedEnvelope.payload.fingerprint,
    );
  });
});

test("stale transitions are rejected instead of overwriting a newer decision", async () => {
  await withRegistry(async (registry) => {
    const pending = pendingArtifact("artifact_store_take_003");
    await registry.create(pending, { actorId: "operator_store_001" });
    await registry.transition(pending.id, {
      expectedRevision: 1,
      actorId: "verifier_store_001",
      action: "artifact.verified",
      apply: (current) => verifyArtifactIntegrity(current, {
        observedContentHash: current.integrity.contentHash,
        observedByteCount: current.integrity.byteCount,
        checkedByActorId: "verifier_store_001",
        checks: ["sha256", "byte-count"],
        checkedAt: t1,
      }),
    });

    await assert.rejects(
      registry.transition(pending.id, {
        expectedRevision: 1,
        actorId: "reviewer_store_001",
        action: "artifact.review_approved",
        apply: (current) => current,
      }),
      (error: unknown) =>
        error instanceof ArtifactStoreConflictError
        && error.message === "ARTIFACT_STORE_REVISION_CONFLICT:2",
    );
  });
});

test("artifact store rejects replacement records outside the fingerprint chain", async () => {
  await withRegistry(async (registry) => {
    const pending = pendingArtifact("artifact_store_take_004");
    await registry.create(pending, { actorId: "operator_store_001" });
    const unrelated = pendingArtifact("artifact_store_take_004", "project_store_other");
    await assert.rejects(
      registry.save(unrelated, {
        expectedRevision: 1,
        actorId: "operator_store_001",
        action: "artifact.updated",
      }),
      (error: unknown) =>
        error instanceof ArtifactStoreConflictError
        && error.message === "ARTIFACT_STORE_REVISION_CHAIN_INVALID",
    );
  });
});

test("public artifact listings redact private object and provider request locators", async () => {
  await withRegistry(async (registry) => {
    const pending = pendingArtifact("artifact_store_take_005");
    await registry.create(pending, { actorId: "operator_store_001" });
    const views = await registry.publicViews({ projectId: pending.projectId });
    assert.equal(views.length, 1);
    assert.deepEqual(views[0], artifactPublicView(pending));
    const serialised = JSON.stringify(views);
    assert.equal(serialised.includes(pending.storage.container), false);
    assert.equal(serialised.includes(pending.storage.objectKey), false);
    assert.equal(serialised.includes(pending.storage.versionId!), false);
    assert.equal(serialised.includes(pending.provenance.providerRequestId!), false);
  });
});

test("artifact audit events contain governed state but no private storage locator", async () => {
  await withRegistry(async (registry, _store, root) => {
    const pending = pendingArtifact("artifact_store_take_006");
    await registry.create(pending, { actorId: "operator_store_001" });
    const audit = await readFile(join(root, "audit", "2026-07-27.jsonl"), "utf8");
    assert.equal(audit.includes(pending.id), true);
    assert.equal(audit.includes(pending.integrity.contentHash), true);
    assert.equal(audit.includes(pending.storage.container), false);
    assert.equal(audit.includes(pending.storage.objectKey), false);
    assert.equal(audit.includes(pending.storage.versionId!), false);
    assert.equal(audit.includes(pending.provenance.providerRequestId!), false);
  });
});
