import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildAudiobookRetailPackage,
  type AudiobookRetailPackageMediaResolver,
  type ResolvedAudiobookRetailPackageMedia,
} from "./audiobook-retail-package-build.js";
import {
  AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SCHEMA_VERSION,
  assertAudiobookRetailPackageManifest,
  type AudiobookRetailPackageArtifactSnapshot,
  type AudiobookRetailPackageManifest,
  type AudiobookRetailPackageMediaFile,
} from "./audiobook-retail-package-manifest.js";
import {
  FileAudiobookRetailPackageInspectionStore,
  assertAudiobookRetailPackageInspectionEvidence,
  assertAudiobookRetailPackageInspectionMatchesSources,
  audiobookRetailPackageInspectionPublicView,
  inspectAudiobookRetailPackage,
  type AudiobookRetailPackageInspectionEvidence,
} from "./audiobook-retail-package-inspection.js";
import { stableHash } from "./index.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-29T00:00:00.000Z");
const t1 = new Date("2026-07-29T00:00:01.000Z");
const t2 = new Date("2026-07-29T00:00:02.000Z");

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function mp3Bytes(seed: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xfb,
    0x90,
    0x64,
    seed,
    0x01,
    0x02,
    0x03,
  ]);
}

function artifact(
  ordinal: number,
  bytes: Uint8Array,
): AudiobookRetailPackageArtifactSnapshot {
  return Object.freeze({
    id: `artifact_package_inspection_${ordinal}`,
    revision: 4,
    fingerprint: String((ordinal % 8) + 1).repeat(64),
    contentHash: hashBytes(bytes),
    byteCount: bytes.byteLength,
    reviewFingerprint: String(((ordinal + 3) % 8) + 1).repeat(64),
  });
}

function mediaFile(input: Readonly<{
  ordinal: number;
  kind: AudiobookRetailPackageMediaFile["kind"];
  role: AudiobookRetailPackageMediaFile["role"];
  fileName: string;
  durationMs: number;
  artifact: AudiobookRetailPackageArtifactSnapshot;
}>): AudiobookRetailPackageMediaFile {
  const partial: Omit<AudiobookRetailPackageMediaFile, "fingerprint"> = {
    ordinal: input.ordinal,
    kind: input.kind,
    role: input.role,
    fileName: input.fileName,
    expectedDurationMs: input.durationMs,
    observedDurationMs: input.durationMs,
    artifact: input.artifact,
    sourceFingerprint: String(((input.ordinal + 5) % 8) + 1).repeat(64),
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
}

function packageManifest(
  bytes: readonly Uint8Array[],
): AudiobookRetailPackageManifest {
  const files = Object.freeze([
    mediaFile({
      ordinal: 1,
      kind: "audiobook-track",
      role: "opening-credit",
      fileName: "0001OpeningCredits.mp3",
      durationMs: 5_000,
      artifact: artifact(1, bytes[0]!),
    }),
    mediaFile({
      ordinal: 2,
      kind: "audiobook-track",
      role: "chapter",
      fileName: "0002Chapter0001.mp3",
      durationMs: 60_000,
      artifact: artifact(2, bytes[1]!),
    }),
    mediaFile({
      ordinal: 3,
      kind: "audiobook-track",
      role: "closing-credit",
      fileName: "0003ClosingCredits.mp3",
      durationMs: 6_000,
      artifact: artifact(3, bytes[2]!),
    }),
    mediaFile({
      ordinal: 4,
      kind: "retail-sample",
      role: "retail-sample",
      fileName: "RetailSample.mp3",
      durationMs: 60_000,
      artifact: artifact(4, bytes[3]!),
    }),
  ]);
  const partial: Omit<AudiobookRetailPackageManifest, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SCHEMA_VERSION,
    id: "retail_package_manifest_inspection_001",
    projectId: "project_retail_package_inspection_001",
    bookId: "book_retail_package_inspection_001",
    distributor: "acx-audible",
    policy: Object.freeze({
      id: "retail_policy_package_inspection_001",
      externalVersion: "acx-2026-07",
      reviewedAt: "2026-07-27T00:00:00.000Z",
      expiresAt: "2027-07-27T00:00:00.000Z",
      fingerprint: "a".repeat(64),
    }),
    rightsFingerprint: "b".repeat(64),
    trackPlan: Object.freeze({
      id: "retail_track_plan_package_inspection_001",
      fingerprint: "c".repeat(64),
    }),
    trackReview: Object.freeze({
      sessionId: "retail_track_review_package_inspection_001",
      sessionRevision: 8,
      sessionFingerprint: "d".repeat(64),
      approvalFingerprint: "e".repeat(64),
      approvedAt: "2026-07-28T23:59:56.000Z",
    }),
    samplePlan: Object.freeze({
      id: "retail_sample_plan_package_inspection_001",
      fingerprint: "f".repeat(64),
    }),
    sampleReview: Object.freeze({
      sessionId: "retail_sample_review_package_inspection_001",
      sessionRevision: 4,
      sessionFingerprint: "1".repeat(64),
      approvalFingerprint: "2".repeat(64),
      approvedAt: "2026-07-28T23:59:57.000Z",
    }),
    files,
    trackCount: 3,
    mediaFileCount: 4,
    totalTrackDurationMs: 71_000,
    sampleDurationMs: 60_000,
    totalMediaBytes: files.reduce(
      (total, file) => total + file.artifact.byteCount,
      0,
    ),
    status: "ready-for-package-build",
    createdByActorId: "retail_package_manifest_inspector_fixture_001",
    createdAt: t0.toISOString(),
    revision: 1,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
  assertAudiobookRetailPackageManifest(value);
  return value;
}

class SourceResolver implements AudiobookRetailPackageMediaResolver {
  constructor(readonly paths: ReadonlyMap<string, string>) {}

  async resolve(
    snapshot: AudiobookRetailPackageArtifactSnapshot,
  ): Promise<ResolvedAudiobookRetailPackageMedia> {
    const privatePath = this.paths.get(snapshot.id);
    if (!privatePath) throw new Error("fixture source missing");
    return {
      artifactId: snapshot.id,
      artifactRevision: snapshot.revision,
      artifactFingerprint: snapshot.fingerprint,
      reviewFingerprint: snapshot.reviewFingerprint,
      privatePath,
      contentHash: snapshot.contentHash,
      byteCount: snapshot.byteCount,
      async dispose() {},
    };
  }
}

interface Fixture {
  root: string;
  packageRoot: string;
  projectStoreRoot: string;
  manifest: AudiobookRetailPackageManifest;
  build: Awaited<ReturnType<typeof buildAudiobookRetailPackage>>;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-package-inspection-"));
  const sourceRoot = join(root, "sources");
  const packageRoot = join(root, "private-packages");
  const projectStoreRoot = join(root, "project-store");
  await mkdir(sourceRoot, { recursive: true, mode: 0o700 });
  const bytes = Object.freeze([
    mp3Bytes(1),
    mp3Bytes(2),
    mp3Bytes(3),
    mp3Bytes(4),
  ]);
  const manifest = packageManifest(bytes);
  const paths = new Map<string, string>();
  for (const [index, file] of manifest.files.entries()) {
    const path = join(sourceRoot, `source-${index + 1}.mp3`);
    await writeFile(path, bytes[index]!, { mode: 0o600 });
    await chmod(path, 0o600);
    paths.set(file.artifact.id, path);
  }
  const build = await buildAudiobookRetailPackage({
    manifest,
    sources: new SourceResolver(paths),
    privatePackageRoot: packageRoot,
    builtAt: t1,
  });
  return { root, packageRoot, projectStoreRoot, manifest, build };
}

async function withFixture(
  run: (fixture: Fixture) => Promise<void>,
): Promise<void> {
  const fixture = await createFixture();
  try {
    await run(fixture);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
}

test("independent inspection reopens every package file and persists a review-ready evidence record", async () => {
  await withFixture(async (fixture) => {
    const inspection = await inspectAudiobookRetailPackage({
      build: fixture.build.evidence,
      manifest: fixture.manifest,
      privatePackagePath: fixture.build.privatePackagePath,
      inspectedAt: t2,
    });

    assert.equal(inspection.status, "ready-for-final-package-review");
    assert.equal(inspection.mediaFileCount, 4);
    assert.equal(inspection.packageFileCount, 5);
    assert.equal(inspection.directoryEntryCount, 5);
    assert.equal(inspection.directoryPermissionsVerified, true);
    assert.equal(inspection.allFilesPrivate, true);
    assert.deepEqual(
      inspection.files.map((file) => file.fileName),
      fixture.manifest.files.map((file) => file.fileName),
    );
    assert.doesNotThrow(() =>
      assertAudiobookRetailPackageInspectionEvidence(inspection)
    );
    assert.doesNotThrow(() =>
      assertAudiobookRetailPackageInspectionMatchesSources(
        inspection,
        fixture.build.evidence,
        fixture.manifest,
      )
    );

    const projectStore = new FileProjectStore(fixture.projectStoreRoot);
    const store = new FileAudiobookRetailPackageInspectionStore(projectStore);
    const first = await store.create(
      inspection,
      "package_inspection_worker_001",
    );
    const second = await store.create(
      inspection,
      "package_inspection_worker_001",
    );
    assert.equal(first.envelopeHash, second.envelopeHash);
    assert.equal((await store.require(inspection.id)).payload.fingerprint, inspection.fingerprint);

    const audit = await readFile(
      join(fixture.projectStoreRoot, "audit", "2026-07-29.jsonl"),
      "utf8",
    );
    for (const forbidden of [
      fixture.build.privatePackagePath,
      fixture.manifest.projectId,
      fixture.manifest.rightsFingerprint,
      fixture.manifest.files[0]!.artifact.id,
      fixture.manifest.files[0]!.artifact.contentHash,
      fixture.build.evidence.packageManifest.contentHash,
      "sourceManifest",
      "sourceBuild",
    ]) {
      assert.equal(audit.includes(forbidden), false);
    }

    const view = audiobookRetailPackageInspectionPublicView(inspection);
    const serialised = JSON.stringify(view);
    assert.equal(view.status, "ready-for-final-package-review");
    assert.equal(view.files.every((file) => file.privatePermissionsVerified), true);
    for (const forbidden of [
      fixture.build.privatePackagePath,
      fixture.manifest.projectId,
      fixture.manifest.rightsFingerprint,
      fixture.manifest.files[0]!.artifact.id,
      fixture.manifest.files[0]!.artifact.contentHash,
      fixture.build.evidence.id,
      fixture.build.evidence.packageId,
      "contentHash",
      "sourceBuild",
      "sourceManifest",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
    }
  });
});

test("media tampering and unexpected directory entries fail independent inspection", async () => {
  await withFixture(async (fixture) => {
    await writeFile(
      join(fixture.build.privatePackagePath, "0002Chapter0001.mp3"),
      mp3Bytes(9),
      { mode: 0o600 },
    );
    await assert.rejects(
      inspectAudiobookRetailPackage({
        build: fixture.build.evidence,
        manifest: fixture.manifest,
        privatePackagePath: fixture.build.privatePackagePath,
        inspectedAt: t2,
      }),
      /AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_MEDIA_BYTES_MISMATCH/u,
    );
  });

  await withFixture(async (fixture) => {
    await writeFile(
      join(fixture.build.privatePackagePath, "unexpected.txt"),
      "private",
      { mode: 0o600 },
    );
    await assert.rejects(
      inspectAudiobookRetailPackage({
        build: fixture.build.evidence,
        manifest: fixture.manifest,
        privatePackagePath: fixture.build.privatePackagePath,
        inspectedAt: t2,
      }),
      /AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_DIRECTORY_CONTENTS_MISMATCH/u,
    );
  });
});

test("permission drift on the package directory or any media file is rejected", async () => {
  await withFixture(async (fixture) => {
    await chmod(fixture.build.privatePackagePath, 0o755);
    await assert.rejects(
      inspectAudiobookRetailPackage({
        build: fixture.build.evidence,
        manifest: fixture.manifest,
        privatePackagePath: fixture.build.privatePackagePath,
        inspectedAt: t2,
      }),
      /AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_PRIVATE_DIRECTORY_REQUIRED/u,
    );
  });

  await withFixture(async (fixture) => {
    await chmod(
      join(fixture.build.privatePackagePath, "RetailSample.mp3"),
      0o644,
    );
    await assert.rejects(
      inspectAudiobookRetailPackage({
        build: fixture.build.evidence,
        manifest: fixture.manifest,
        privatePackagePath: fixture.build.privatePackagePath,
        inspectedAt: t2,
      }),
      /AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_PRIVATE_FILE_REQUIRED/u,
    );
  });
});

test("a recomputed but semantically altered canonical package manifest remains invalid", async () => {
  await withFixture(async (fixture) => {
    const path = join(
      fixture.build.privatePackagePath,
      "package-manifest.json",
    );
    const value = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    const { fingerprint: _fingerprint, ...base } = value;
    const changedBase = {
      ...base,
      sourceManifestId: "retail_package_manifest_wrong_001",
    };
    await writeFile(
      path,
      `${JSON.stringify({
        ...changedBase,
        fingerprint: stableHash(changedBase),
      })}\n`,
      { mode: 0o600 },
    );
    await chmod(path, 0o600);

    await assert.rejects(
      inspectAudiobookRetailPackage({
        build: fixture.build.evidence,
        manifest: fixture.manifest,
        privatePackagePath: fixture.build.privatePackagePath,
        inspectedAt: t2,
      }),
      /AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_CANONICAL_MANIFEST_MISMATCH/u,
    );
  });
});

test("recomputed inspection evidence cannot replace another package build", async () => {
  await withFixture(async (fixture) => {
    const inspection = await inspectAudiobookRetailPackage({
      build: fixture.build.evidence,
      manifest: fixture.manifest,
      privatePackagePath: fixture.build.privatePackagePath,
      inspectedAt: t2,
    });
    const { fingerprint: _fingerprint, ...base } = inspection;
    const changedBase: Omit<
      AudiobookRetailPackageInspectionEvidence,
      "fingerprint"
    > = {
      ...base,
      sourceBuild: Object.freeze({
        ...inspection.sourceBuild,
        id: "retail_package_build_structurally_wrong_001",
      }),
    };
    const changed = Object.freeze({
      ...changedBase,
      fingerprint: stableHash(changedBase),
    });

    assert.doesNotThrow(() =>
      assertAudiobookRetailPackageInspectionEvidence(changed)
    );
    assert.throws(
      () => assertAudiobookRetailPackageInspectionMatchesSources(
        changed,
        fixture.build.evidence,
        fixture.manifest,
      ),
      /AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_SOURCE_MISMATCH/u,
    );
  });
});

test("inspection aborts before touching the private directory", async () => {
  await withFixture(async (fixture) => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      inspectAudiobookRetailPackage({
        build: fixture.build.evidence,
        manifest: fixture.manifest,
        privatePackagePath: fixture.build.privatePackagePath,
        inspectedAt: t2,
        signal: controller.signal,
      }),
      /AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_ABORTED/u,
    );
  });
});
