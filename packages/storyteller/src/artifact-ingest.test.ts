import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ArtifactIngestConflictError,
  artifactIngestPublicView,
  ingestPrivateArtifact,
  type ArtifactIngestInput,
} from "./artifact-ingest.js";
import { FileArtifactRegistry } from "./artifact-store.js";
import {
  FilePrivateObjectStore,
  type FinalPrivateObject,
} from "./private-object-store.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:01:00.000Z");

function wavBytes(payload: readonly number[] = [1, 2, 3, 4]): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    ...payload,
  ]);
}

function ingestInput(overrides: Partial<ArtifactIngestInput> = {}): ArtifactIngestInput {
  return {
    id: "artifact_ingest_take_001",
    kind: "audio-candidate",
    projectId: "project_ingest_001",
    jobId: "job_ingest_001",
    segmentId: "segment_ingest_001",
    takeId: "take_ingest_001",
    bytes: wavBytes(),
    claimedMimeType: "audio/wav",
    claimedFormat: "wav",
    provenance: {
      createdByActorId: "worker_ingest_001",
      sourceContentHash: "a".repeat(64),
      generationRequestHash: "b".repeat(64),
      providerId: "provider_primary",
      adapterVersion: "1.0.0",
      providerRequestId: "private-provider-request-ingest-001",
      parentArtifactIds: [],
    },
    rights: {
      rightsEvidenceId: "rights_ingest_001",
      rightsFingerprint: "c".repeat(64),
      allowedUses: ["audiobook"],
      commercialUseApproved: true,
      expiresAt: "2028-07-27T00:00:00.000Z",
    },
    actorId: "worker_ingest_001",
    verifierActorId: "verifier_ingest_001",
    now: t0,
    ...overrides,
  };
}

async function withStores(
  run: (
    objectStore: FilePrivateObjectStore,
    registry: FileArtifactRegistry,
    root: string,
  ) => Promise<void>,
  objectStoreFactory?: (root: string) => FilePrivateObjectStore,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-artifact-ingest-"));
  try {
    const objectStore = objectStoreFactory
      ? objectStoreFactory(join(root, "objects"))
      : new FilePrivateObjectStore(join(root, "objects"), {
          provider: "evavo-private-file-store",
          container: "storyteller-production",
          region: "australia-southeast",
        });
    const registry = new FileArtifactRegistry(
      new FileProjectStore(join(root, "registry")),
    );
    await run(objectStore, registry, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

class MismatchingInspectionStore extends FilePrivateObjectStore {
  override async inspect(objectKey: string): Promise<FinalPrivateObject> {
    const observed = await super.inspect(objectKey);
    return {
      ...observed,
      integrity: {
        ...observed.integrity,
        byteCount: observed.integrity.byteCount + 1,
      },
    };
  }
}

test("private bytes become a verified revisioned artifact without exposing storage locators", async () => {
  await withStores(async (objectStore, registry, root) => {
    const result = await ingestPrivateArtifact(
      objectStore,
      registry,
      ingestInput(),
    );

    assert.equal(result.accepted, true);
    assert.equal(result.verificationStatus, "verified");
    assert.equal(result.envelope.revision, 2);
    assert.equal(result.envelope.payload.revision, 2);
    assert.equal(result.envelope.payload.verification.status, "verified");
    assert.equal(result.envelope.payload.verification.checkedByActorId, "verifier_ingest_001");
    assert.deepEqual(result.envelope.payload.verification.checks, [
      "sha256",
      "byte-count",
      "media-signature",
    ]);

    const publicView = artifactIngestPublicView(result);
    assert.equal(publicView.artifact.id, "artifact_ingest_take_001");
    assert.equal(publicView.accepted, true);
    assert.equal(publicView.signature, "riff-wave");
    const serialised = JSON.stringify(publicView);
    assert.equal(serialised.includes(root), false);
    assert.equal(serialised.includes("storyteller-production"), false);
    assert.equal(serialised.includes("sha256/"), false);
    assert.equal(serialised.includes("private-provider-request-ingest-001"), false);

    const persisted = await registry.require("artifact_ingest_take_001");
    assert.equal(persisted.revision, 2);
    assert.equal(persisted.payload.integrity.contentHash, result.envelope.payload.integrity.contentHash);
  });
});

test("identical retries are idempotent across object promotion and artifact registration", async () => {
  await withStores(async (objectStore, registry) => {
    const first = await ingestPrivateArtifact(objectStore, registry, ingestInput());
    const second = await ingestPrivateArtifact(
      objectStore,
      registry,
      ingestInput({ now: t1 }),
    );

    assert.equal(first.envelope.payload.fingerprint, second.envelope.payload.fingerprint);
    assert.equal(first.envelope.revision, 2);
    assert.equal(second.envelope.revision, 2);
    assert.equal(first.deduplicated, false);
    assert.equal(second.deduplicated, true);
    assert.equal((await registry.list()).length, 1);
  });
});

test("reusing an artifact identifier for different immutable bytes fails closed", async () => {
  await withStores(async (objectStore, registry) => {
    const first = await ingestPrivateArtifact(objectStore, registry, ingestInput());
    await assert.rejects(
      ingestPrivateArtifact(
        objectStore,
        registry,
        ingestInput({
          bytes: wavBytes([9, 8, 7, 6]),
          now: t1,
        }),
      ),
      (error: unknown) =>
        error instanceof ArtifactIngestConflictError
        && error.message === "ARTIFACT_INGEST_IDEMPOTENCY_CONFLICT",
    );

    const persisted = await registry.require("artifact_ingest_take_001");
    assert.equal(persisted.payload.fingerprint, first.envelope.payload.fingerprint);
    assert.equal(persisted.revision, 2);
  });
});

test("post-promotion integrity mismatches are persisted as quarantine revisions", async () => {
  await withStores(async (objectStore, registry) => {
    const result = await ingestPrivateArtifact(
      objectStore,
      registry,
      ingestInput(),
    );

    assert.equal(result.accepted, false);
    assert.equal(result.verificationStatus, "quarantined");
    assert.equal(result.envelope.revision, 2);
    assert.equal(result.envelope.payload.quarantine?.code, "ARTIFACT_INTEGRITY_VERIFICATION_FAILED");
    assert.equal(
      result.envelope.payload.verification.findings.some(
        (finding) => finding.code === "ARTIFACT_BYTE_COUNT_MISMATCH",
      ),
      true,
    );
  }, (root) => new MismatchingInspectionStore(root));
});

test("unsupported bytes fail before an artifact record is created", async () => {
  await withStores(async (objectStore, registry) => {
    await assert.rejects(
      ingestPrivateArtifact(
        objectStore,
        registry,
        ingestInput({ bytes: new Uint8Array([0, 1, 2, 3]) }),
      ),
      /PRIVATE_OBJECT_MEDIA_SIGNATURE_UNSUPPORTED/u,
    );
    assert.equal(await registry.read("artifact_ingest_take_001"), null);
  });
});
