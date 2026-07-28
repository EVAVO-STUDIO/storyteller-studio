import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AUDIOBOOK_RETAIL_PACKAGE_BUILD_SCHEMA_VERSION,
  AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_NAME,
  assertAudiobookRetailPackageBuildEvidence,
  assertAudiobookRetailPackageBuildMatchesManifest,
  audiobookRetailPackageBuildPublicView,
  buildAudiobookRetailPackage,
  type AudiobookRetailPackageBuildEvidence,
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
import { stableHash } from "./index.js";

const t0 = new Date("2026-07-29T00:00:00.000Z");
const t1 = new Date("2026-07-29T00:00:01.000Z");

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
    id: `artifact_package_build_${ordinal}`,
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

function manifest(
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
    id: "retail_package_manifest_build_001",
    projectId: "project_retail_package_build_001",
    bookId: "book_retail_package_build_001",
    distributor: "acx-audible",
    policy: Object.freeze({
      id: "retail_policy_package_build_001",
      externalVersion: "acx-2026-07",
      reviewedAt: "2026-07-27T00:00:00.000Z",
      expiresAt: "2027-07-27T00:00:00.000Z",
      fingerprint: "a".repeat(64),
    }),
    rightsFingerprint: "b".repeat(64),
    trackPlan: Object.freeze({
      id: "retail_track_plan_package_build_001",
      fingerprint: "c".repeat(64),
    }),
    trackReview: Object.freeze({
      sessionId: "retail_track_review_package_build_001",
      sessionRevision: 8,
      sessionFingerprint: "d".repeat(64),
      approvalFingerprint: "e".repeat(64),
      approvedAt: "2026-07-28T23:59:56.000Z",
    }),
    samplePlan: Object.freeze({
      id: "retail_sample_plan_package_build_001",
      fingerprint: "f".repeat(64),
    }),
    sampleReview: Object.freeze({
      sessionId: "retail_sample_review_package_build_001",
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
    createdByActorId: "retail_package_manifest_builder_001",
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

class FixtureResolver implements AudiobookRetailPackageMediaResolver {
  readonly calls: string[] = [];
  readonly disposed: string[] = [];

  constructor(
    readonly paths: ReadonlyMap<string, string>,
    readonly mismatch: Partial<ResolvedAudiobookRetailPackageMedia> = {},
  ) {}

  async resolve(
    snapshot: AudiobookRetailPackageArtifactSnapshot,
  ): Promise<ResolvedAudiobookRetailPackageMedia> {
    this.calls.push(snapshot.id);
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
      dispose: async () => {
        this.disposed.push(snapshot.id);
      },
      ...this.mismatch,
    };
  }
}

interface Fixture {
  root: string;
  sourceRoot: string;
  packageRoot: string;
  bytes: readonly Uint8Array[];
  manifest: AudiobookRetailPackageManifest;
  paths: ReadonlyMap<string, string>;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-retail-package-build-"));
  const sourceRoot = join(root, "sources");
  const packageRoot = join(root, "package-root");
  await mkdir(sourceRoot, { recursive: true, mode: 0o700 });
  const bytes = Object.freeze([
    mp3Bytes(1),
    mp3Bytes(2),
    mp3Bytes(3),
    mp3Bytes(4),
  ]);
  const packageManifest = manifest(bytes);
  const paths = new Map<string, string>();
  for (const [index, file] of packageManifest.files.entries()) {
    const path = join(sourceRoot, `source-${index + 1}.mp3`);
    await writeFile(path, bytes[index]!, { mode: 0o600 });
    await chmod(path, 0o600);
    paths.set(file.artifact.id, path);
  }
  return {
    root,
    sourceRoot,
    packageRoot,
    bytes,
    manifest: packageManifest,
    paths,
  };
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

test("approved MP3 files become one private content-addressed package and deterministic manifest", async () => {
  await withFixture(async (fixture) => {
    const firstResolver = new FixtureResolver(fixture.paths);
    const first = await buildAudiobookRetailPackage({
      manifest: fixture.manifest,
      sources: firstResolver,
      privatePackageRoot: fixture.packageRoot,
      builtAt: t1,
    });

    assert.equal(first.reusedExistingPackage, false);
    assert.equal(
      first.evidence.status,
      "ready-for-independent-inspection",
    );
    assert.equal(first.evidence.mediaFileCount, 4);
    assert.equal(first.evidence.packageFileCount, 5);
    assert.equal(first.evidence.totalMediaBytes, 32);
    assert.deepEqual(
      first.evidence.files.map((file) => file.fileName),
      fixture.manifest.files.map((file) => file.fileName),
    );
    assert.deepEqual(firstResolver.calls, fixture.manifest.files.map((file) => file.artifact.id));
    assert.deepEqual(firstResolver.disposed, firstResolver.calls);
    assert.doesNotThrow(() =>
      assertAudiobookRetailPackageBuildEvidence(first.evidence)
    );
    assert.doesNotThrow(() =>
      assertAudiobookRetailPackageBuildMatchesManifest(
        first.evidence,
        fixture.manifest,
      )
    );

    const entries = (await readdir(first.privatePackagePath)).sort();
    assert.deepEqual(entries, [
      "0001OpeningCredits.mp3",
      "0002Chapter0001.mp3",
      "0003ClosingCredits.mp3",
      "RetailSample.mp3",
      AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_NAME,
    ]);
    assert.equal(
      (await stat(first.privatePackagePath)).mode & 0o777,
      0o700,
    );
    for (const name of entries) {
      assert.equal(
        (await stat(join(first.privatePackagePath, name))).mode & 0o777,
        0o600,
      );
    }
    const canonical = JSON.parse(
      await readFile(
        join(
          first.privatePackagePath,
          AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_NAME,
        ),
        "utf8",
      ),
    ) as { packageId: string; builtAt: string; files: unknown[] };
    assert.equal(canonical.packageId, first.evidence.packageId);
    assert.equal(canonical.builtAt, t1.toISOString());
    assert.equal(canonical.files.length, 4);

    const secondResolver = new FixtureResolver(fixture.paths);
    const second = await buildAudiobookRetailPackage({
      manifest: fixture.manifest,
      sources: secondResolver,
      privatePackageRoot: fixture.packageRoot,
      builtAt: new Date(t1.getTime() + 10_000),
    });
    assert.equal(second.reusedExistingPackage, true);
    assert.equal(second.privatePackagePath, first.privatePackagePath);
    assert.equal(second.evidence.fingerprint, first.evidence.fingerprint);
    assert.equal(second.evidence.builtAt, first.evidence.builtAt);
    assert.deepEqual(secondResolver.disposed, secondResolver.calls);

    const view = audiobookRetailPackageBuildPublicView(first.evidence);
    const serialised = JSON.stringify(view);
    assert.equal(view.packageFileCount, 5);
    for (const forbidden of [
      fixture.packageRoot,
      first.privatePackagePath,
      fixture.manifest.projectId,
      fixture.manifest.rightsFingerprint,
      fixture.manifest.files[0]!.artifact.id,
      fixture.manifest.files[0]!.artifact.contentHash,
      "sourceArtifact",
      "sourceManifest",
      "contentHash",
      "privatePackagePath",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
    }
  });
});

test("source metadata drift, altered bytes and aborts fail closed and dispose resolved sources", async () => {
  await withFixture(async (fixture) => {
    const mismatched = new FixtureResolver(fixture.paths, {
      artifactRevision: 99,
    });
    await assert.rejects(
      buildAudiobookRetailPackage({
        manifest: fixture.manifest,
        sources: mismatched,
        privatePackageRoot: fixture.packageRoot,
        builtAt: t1,
      }),
      /AUDIOBOOK_RETAIL_PACKAGE_BUILD_SOURCE_INTEGRITY_MISMATCH/u,
    );
    assert.deepEqual(mismatched.disposed, mismatched.calls);

    const firstPath = fixture.paths.get(
      fixture.manifest.files[0]!.artifact.id,
    )!;
    await writeFile(firstPath, mp3Bytes(9));
    const altered = new FixtureResolver(fixture.paths);
    await assert.rejects(
      buildAudiobookRetailPackage({
        manifest: fixture.manifest,
        sources: altered,
        privatePackageRoot: fixture.packageRoot,
        builtAt: t1,
      }),
      /AUDIOBOOK_RETAIL_PACKAGE_BUILD_SOURCE_BYTES_MISMATCH/u,
    );
    assert.deepEqual(altered.disposed, altered.calls);

    const controller = new AbortController();
    controller.abort();
    const aborted = new FixtureResolver(fixture.paths);
    await assert.rejects(
      buildAudiobookRetailPackage({
        manifest: fixture.manifest,
        sources: aborted,
        privatePackageRoot: fixture.packageRoot,
        builtAt: t1,
        signal: controller.signal,
      }),
      /AUDIOBOOK_RETAIL_PACKAGE_BUILD_ABORTED/u,
    );
    assert.equal(aborted.calls.length, 0);
  });
});

test("tampered existing packages are not reused and unexpected entries remain blocked", async () => {
  await withFixture(async (fixture) => {
    const first = await buildAudiobookRetailPackage({
      manifest: fixture.manifest,
      sources: new FixtureResolver(fixture.paths),
      privatePackageRoot: fixture.packageRoot,
      builtAt: t1,
    });
    await writeFile(
      join(first.privatePackagePath, "0002Chapter0001.mp3"),
      mp3Bytes(8),
    );
    await assert.rejects(
      buildAudiobookRetailPackage({
        manifest: fixture.manifest,
        sources: new FixtureResolver(fixture.paths),
        privatePackageRoot: fixture.packageRoot,
        builtAt: new Date(t1.getTime() + 5_000),
      }),
      /AUDIOBOOK_RETAIL_PACKAGE_BUILD_OUTPUT_INTEGRITY_MISMATCH/u,
    );
  });

  await withFixture(async (fixture) => {
    const first = await buildAudiobookRetailPackage({
      manifest: fixture.manifest,
      sources: new FixtureResolver(fixture.paths),
      privatePackageRoot: fixture.packageRoot,
      builtAt: t1,
    });
    await writeFile(join(first.privatePackagePath, "unexpected.txt"), "private");
    await assert.rejects(
      buildAudiobookRetailPackage({
        manifest: fixture.manifest,
        sources: new FixtureResolver(fixture.paths),
        privatePackageRoot: fixture.packageRoot,
        builtAt: new Date(t1.getTime() + 5_000),
      }),
      /AUDIOBOOK_RETAIL_PACKAGE_BUILD_DIRECTORY_CONTENTS_MISMATCH/u,
    );
  });
});

test("recomputed build evidence cannot replace its approved package manifest", async () => {
  await withFixture(async (fixture) => {
    const result = await buildAudiobookRetailPackage({
      manifest: fixture.manifest,
      sources: new FixtureResolver(fixture.paths),
      privatePackageRoot: fixture.packageRoot,
      builtAt: t1,
    });
    const { fingerprint: _fingerprint, ...base } = result.evidence;
    const changedBase: Omit<AudiobookRetailPackageBuildEvidence, "fingerprint"> = {
      ...base,
      sourceManifest: Object.freeze({
        ...result.evidence.sourceManifest,
        id: "retail_package_manifest_structurally_wrong_001",
      }),
    };
    const changed = Object.freeze({
      ...changedBase,
      fingerprint: stableHash(changedBase),
    });

    assert.doesNotThrow(() =>
      assertAudiobookRetailPackageBuildEvidence(changed)
    );
    assert.throws(
      () => assertAudiobookRetailPackageBuildMatchesManifest(
        changed,
        fixture.manifest,
      ),
      /AUDIOBOOK_RETAIL_PACKAGE_BUILD_SOURCE_MISMATCH/u,
    );
  });
});

test("evidence schema and package status remain explicit non-release boundaries", () => {
  assert.equal(
    AUDIOBOOK_RETAIL_PACKAGE_BUILD_SCHEMA_VERSION,
    "storyteller-audiobook-retail-package-build-v1",
  );
  assert.notEqual(
    "ready-for-independent-inspection",
    "released",
  );
});
