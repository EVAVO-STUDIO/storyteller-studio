import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import {
  assertAudiobookRetailPackageManifest,
  type AudiobookRetailPackageArtifactSnapshot,
  type AudiobookRetailPackageManifest,
  type AudiobookRetailPackageMediaFile,
} from "./audiobook-retail-package-manifest.js";
import { stableHash } from "./index.js";
import { detectArtifactMedia } from "./private-object-store.js";

export const AUDIOBOOK_RETAIL_PACKAGE_BUILD_SCHEMA_VERSION =
  "storyteller-audiobook-retail-package-build-v1" as const;
export const AUDIOBOOK_RETAIL_PACKAGE_DIRECTORY_SCHEMA_VERSION =
  "storyteller-audiobook-retail-package-directory-v1" as const;
export const AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_NAME =
  "package-manifest.json" as const;

export interface ResolvedAudiobookRetailPackageMedia {
  artifactId: string;
  artifactRevision: number;
  artifactFingerprint: string;
  reviewFingerprint: string;
  privatePath: string;
  contentHash: string;
  byteCount: number;
  dispose(): Promise<void>;
}

export interface AudiobookRetailPackageMediaResolver {
  resolve(
    artifact: AudiobookRetailPackageArtifactSnapshot,
    signal?: AbortSignal,
  ): Promise<ResolvedAudiobookRetailPackageMedia>;
}

export interface AudiobookRetailPackageBuildFileEvidence {
  ordinal: number;
  kind: AudiobookRetailPackageMediaFile["kind"];
  role: AudiobookRetailPackageMediaFile["role"];
  fileName: string;
  expectedDurationMs: number;
  observedDurationMs: number;
  sourceFileFingerprint: string;
  sourceArtifact: AudiobookRetailPackageArtifactSnapshot;
  output: Readonly<{
    contentHash: string;
    byteCount: number;
    mimeType: "audio/mpeg";
    format: "mp3";
    mediaSignature: "mpeg-audio";
  }>;
  fingerprint: string;
}

export interface AudiobookRetailPackageBuildEvidence {
  schemaVersion: typeof AUDIOBOOK_RETAIL_PACKAGE_BUILD_SCHEMA_VERSION;
  id: string;
  packageId: string;
  projectId: string;
  bookId: string;
  distributor: "acx-audible";
  sourceManifest: Readonly<{
    id: string;
    revision: 1;
    fingerprint: string;
  }>;
  files: readonly AudiobookRetailPackageBuildFileEvidence[];
  mediaFileCount: number;
  totalMediaBytes: number;
  packageManifest: Readonly<{
    fileName: typeof AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_NAME;
    contentHash: string;
    byteCount: number;
    fingerprint: string;
  }>;
  packageFileCount: number;
  totalPackageBytes: number;
  status: "ready-for-independent-inspection";
  builtAt: string;
  fingerprint: string;
}

export interface AudiobookRetailPackageBuildResult {
  evidence: AudiobookRetailPackageBuildEvidence;
  privatePackagePath: string;
  reusedExistingPackage: boolean;
}

export interface AudiobookRetailPackageBuildPublicFile {
  ordinal: number;
  kind: AudiobookRetailPackageMediaFile["kind"];
  role: AudiobookRetailPackageMediaFile["role"];
  fileName: string;
  expectedDurationMs: number;
  observedDurationMs: number;
  byteCount: number;
}

export interface AudiobookRetailPackageBuildPublicView {
  id: string;
  bookId: string;
  distributor: "acx-audible";
  mediaFileCount: number;
  packageFileCount: number;
  totalMediaBytes: number;
  totalPackageBytes: number;
  files: readonly AudiobookRetailPackageBuildPublicFile[];
  status: "ready-for-independent-inspection";
  builtAt: string;
  fingerprint: string;
}

export interface BuildAudiobookRetailPackageInput {
  manifest: AudiobookRetailPackageManifest;
  sources: AudiobookRetailPackageMediaResolver;
  privatePackageRoot: string;
  maximumMediaBytes?: number;
  builtAt?: Date;
  signal?: AbortSignal;
}

export class AudiobookRetailPackageBuildError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailPackageBuildError";
    this.code = code;
  }
}

interface PackageDirectoryFile {
  ordinal: number;
  kind: AudiobookRetailPackageMediaFile["kind"];
  role: AudiobookRetailPackageMediaFile["role"];
  fileName: string;
  expectedDurationMs: number;
  observedDurationMs: number;
  contentHash: string;
  byteCount: number;
  sourceArtifactId: string;
  sourceArtifactRevision: number;
  sourceArtifactFingerprint: string;
  sourceReviewFingerprint: string;
  sourceFileFingerprint: string;
}

interface PackageDirectoryManifestBase {
  schemaVersion: typeof AUDIOBOOK_RETAIL_PACKAGE_DIRECTORY_SCHEMA_VERSION;
  packageId: string;
  projectId: string;
  bookId: string;
  distributor: "acx-audible";
  sourceManifestId: string;
  sourceManifestFingerprint: string;
  files: readonly PackageDirectoryFile[];
  mediaFileCount: number;
  totalMediaBytes: number;
}

interface PackageDirectoryManifest extends PackageDirectoryManifestBase {
  builtAt: string;
  fingerprint: string;
}

interface FileObservation {
  contentHash: string;
  byteCount: number;
  mimeType: string;
  format: string;
  mediaSignature: string;
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const MEDIA_FILE_NAME_PATTERN = /^[A-Za-z0-9]+\.mp3$/u;
const DEFAULT_MAXIMUM_MEDIA_BYTES = 4 * 1024 * 1024 * 1024;
const ABSOLUTE_MAXIMUM_MEDIA_BYTES = 16 * 1024 * 1024 * 1024;
const MAXIMUM_FILES = 2_003;
const MAXIMUM_JSON_BYTES = 32 * 1024 * 1024;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailPackageBuildError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailPackageBuildError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailPackageBuildError(code);
  }
  return value;
}

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new AudiobookRetailPackageBuildError(code);
  }
  return value;
}

function assertContained(path: string, parent: string): void {
  const normalisedParent = parent.endsWith(sep) ? parent : `${parent}${sep}`;
  if (path !== parent && !path.startsWith(normalisedParent)) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_PATH_ESCAPE_DETECTED",
    );
  }
}

function checkedPrivateRoot(value: string): string {
  if (!value.trim() || value.includes("\0")) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_ROOT_INVALID",
    );
  }
  return resolve(value);
}

function checkedMediaFileName(value: string): string {
  if (!MEDIA_FILE_NAME_PATTERN.test(value)) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_FILE_NAME_INVALID",
    );
  }
  return value;
}

function signalError(): AudiobookRetailPackageBuildError {
  return new AudiobookRetailPackageBuildError(
    "AUDIOBOOK_RETAIL_PACKAGE_BUILD_ABORTED",
  );
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    && typeof error.code === "string"
    ? error.code
    : undefined;
}

async function observeFile(
  path: string,
  maximumBytes: number,
): Promise<FileObservation> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_REGULAR_FILE_REQUIRED",
    );
  }
  requireInteger(
    metadata.size,
    1,
    maximumBytes,
    "AUDIOBOOK_RETAIL_PACKAGE_BUILD_FILE_SIZE_INVALID",
  );
  const handle = await open(path, "r");
  let header: Uint8Array;
  try {
    const buffer = new Uint8Array(Math.min(64, metadata.size));
    const observed = await handle.read(buffer, 0, buffer.byteLength, 0);
    header = buffer.slice(0, observed.bytesRead);
  } finally {
    await handle.close();
  }
  let media;
  try {
    media = detectArtifactMedia(header);
  } catch {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_MEDIA_INVALID",
    );
  }
  const hash = createHash("sha256");
  let byteCount = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    byteCount += chunk.byteLength;
    if (byteCount > maximumBytes) {
      throw new AudiobookRetailPackageBuildError(
        "AUDIOBOOK_RETAIL_PACKAGE_BUILD_FILE_SIZE_INVALID",
      );
    }
  }
  if (byteCount !== metadata.size) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_FILE_CHANGED_DURING_READ",
    );
  }
  return Object.freeze({
    contentHash: hash.digest("hex"),
    byteCount,
    mimeType: media.mimeType,
    format: media.format,
    mediaSignature: media.signature,
  });
}

function assertMp3Observation(
  observed: FileObservation,
  code: string,
): void {
  if (
    observed.mimeType !== "audio/mpeg"
    || observed.format !== "mp3"
    || observed.mediaSignature !== "mpeg-audio"
  ) {
    throw new AudiobookRetailPackageBuildError(code);
  }
}

function assertResolvedSource(
  expected: AudiobookRetailPackageArtifactSnapshot,
  resolved: ResolvedAudiobookRetailPackageMedia,
): void {
  if (
    resolved.artifactId !== expected.id
    || resolved.artifactRevision !== expected.revision
    || resolved.artifactFingerprint !== expected.fingerprint
    || resolved.reviewFingerprint !== expected.reviewFingerprint
    || resolved.contentHash !== expected.contentHash
    || resolved.byteCount !== expected.byteCount
  ) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_SOURCE_INTEGRITY_MISMATCH",
    );
  }
  if (
    !resolved.privatePath.trim()
    || resolved.privatePath.includes("\0")
    || !isAbsolute(resolved.privatePath)
  ) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_PRIVATE_PATH_INVALID",
    );
  }
}

function fileEvidenceFingerprint(
  value: Omit<AudiobookRetailPackageBuildFileEvidence, "fingerprint">,
): string {
  return stableHash(value);
}

function buildEvidenceFingerprint(
  value: Omit<AudiobookRetailPackageBuildEvidence, "fingerprint">,
): string {
  return stableHash(value);
}

function directoryManifestFingerprint(
  value: Omit<PackageDirectoryManifest, "fingerprint">,
): string {
  return stableHash(value);
}

function directoryManifestBase(
  manifest: AudiobookRetailPackageManifest,
  packageId: string,
  files: readonly AudiobookRetailPackageBuildFileEvidence[],
): PackageDirectoryManifestBase {
  return Object.freeze({
    schemaVersion: AUDIOBOOK_RETAIL_PACKAGE_DIRECTORY_SCHEMA_VERSION,
    packageId,
    projectId: manifest.projectId,
    bookId: manifest.bookId,
    distributor: "acx-audible",
    sourceManifestId: manifest.id,
    sourceManifestFingerprint: manifest.fingerprint,
    files: Object.freeze(files.map((file) => Object.freeze({
      ordinal: file.ordinal,
      kind: file.kind,
      role: file.role,
      fileName: file.fileName,
      expectedDurationMs: file.expectedDurationMs,
      observedDurationMs: file.observedDurationMs,
      contentHash: file.output.contentHash,
      byteCount: file.output.byteCount,
      sourceArtifactId: file.sourceArtifact.id,
      sourceArtifactRevision: file.sourceArtifact.revision,
      sourceArtifactFingerprint: file.sourceArtifact.fingerprint,
      sourceReviewFingerprint: file.sourceArtifact.reviewFingerprint,
      sourceFileFingerprint: file.sourceFileFingerprint,
    }))),
    mediaFileCount: files.length,
    totalMediaBytes: files.reduce(
      (total, file) => total + file.output.byteCount,
      0,
    ),
  });
}

function createDirectoryManifest(
  base: PackageDirectoryManifestBase,
  builtAt: string,
): PackageDirectoryManifest {
  requireDate(builtAt, "AUDIOBOOK_RETAIL_PACKAGE_BUILD_DATE_INVALID");
  const partial: Omit<PackageDirectoryManifest, "fingerprint"> = {
    ...base,
    builtAt,
  };
  return Object.freeze({
    ...partial,
    fingerprint: directoryManifestFingerprint(partial),
  });
}

function assertDirectoryManifest(
  value: PackageDirectoryManifest,
  expected: PackageDirectoryManifestBase,
): void {
  if (
    value.schemaVersion !== AUDIOBOOK_RETAIL_PACKAGE_DIRECTORY_SCHEMA_VERSION
    || value.packageId !== expected.packageId
    || value.projectId !== expected.projectId
    || value.bookId !== expected.bookId
    || value.distributor !== expected.distributor
    || value.sourceManifestId !== expected.sourceManifestId
    || value.sourceManifestFingerprint !== expected.sourceManifestFingerprint
    || value.mediaFileCount !== expected.mediaFileCount
    || value.totalMediaBytes !== expected.totalMediaBytes
    || stableHash(value.files) !== stableHash(expected.files)
  ) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_EXISTING_MANIFEST_MISMATCH",
    );
  }
  requireDate(value.builtAt, "AUDIOBOOK_RETAIL_PACKAGE_BUILD_DATE_INVALID");
  const { fingerprint, ...partial } = value;
  if (
    !HASH_PATTERN.test(fingerprint)
    || directoryManifestFingerprint(partial) !== fingerprint
  ) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_DIRECTORY_MANIFEST_INVALID",
    );
  }
}

function canonicalJsonBytes(value: PackageDirectoryManifest): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

async function writePrivateFile(
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(path, 0o600);
}

async function inspectPackageDirectory(input: Readonly<{
  path: string;
  files: readonly AudiobookRetailPackageBuildFileEvidence[];
  manifestBase: PackageDirectoryManifestBase;
  maximumMediaBytes: number;
}>): Promise<Readonly<{
  directoryManifest: PackageDirectoryManifest;
  manifestObservation: FileObservation;
}>> {
  const packageMetadata = await lstat(input.path);
  if (!packageMetadata.isDirectory() || packageMetadata.isSymbolicLink()) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_DIRECTORY_INVALID",
    );
  }
  const expectedNames = new Set([
    ...input.files.map((file) => file.fileName),
    AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_NAME,
  ]);
  const entries = await readdir(input.path, { withFileTypes: true });
  if (entries.length !== expectedNames.size) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_DIRECTORY_CONTENTS_MISMATCH",
    );
  }
  for (const entry of entries) {
    if (
      !expectedNames.has(entry.name)
      || !entry.isFile()
      || entry.isSymbolicLink()
    ) {
      throw new AudiobookRetailPackageBuildError(
        "AUDIOBOOK_RETAIL_PACKAGE_BUILD_DIRECTORY_CONTENTS_MISMATCH",
      );
    }
  }
  for (const file of input.files) {
    const path = resolve(input.path, checkedMediaFileName(file.fileName));
    assertContained(path, input.path);
    const observed = await observeFile(path, input.maximumMediaBytes);
    assertMp3Observation(
      observed,
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_OUTPUT_MEDIA_MISMATCH",
    );
    if (
      observed.contentHash !== file.output.contentHash
      || observed.byteCount !== file.output.byteCount
    ) {
      throw new AudiobookRetailPackageBuildError(
        "AUDIOBOOK_RETAIL_PACKAGE_BUILD_OUTPUT_INTEGRITY_MISMATCH",
      );
    }
  }
  const manifestPath = resolve(
    input.path,
    AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_NAME,
  );
  assertContained(manifestPath, input.path);
  const manifestMetadata = await lstat(manifestPath);
  if (
    !manifestMetadata.isFile()
    || manifestMetadata.isSymbolicLink()
    || manifestMetadata.size < 1
    || manifestMetadata.size > MAXIMUM_JSON_BYTES
  ) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_DIRECTORY_MANIFEST_INVALID",
    );
  }
  let directoryManifest: PackageDirectoryManifest;
  try {
    directoryManifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as PackageDirectoryManifest;
  } catch {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_DIRECTORY_MANIFEST_INVALID",
    );
  }
  assertDirectoryManifest(directoryManifest, input.manifestBase);
  const manifestBytes = await readFile(manifestPath);
  const manifestObservation: FileObservation = Object.freeze({
    contentHash: createHash("sha256").update(manifestBytes).digest("hex"),
    byteCount: manifestBytes.byteLength,
    mimeType: "application/json",
    format: "json",
    mediaSignature: "utf8-json",
  });
  return Object.freeze({ directoryManifest, manifestObservation });
}

function buildEvidence(input: Readonly<{
  packageId: string;
  manifest: AudiobookRetailPackageManifest;
  files: readonly AudiobookRetailPackageBuildFileEvidence[];
  directoryManifest: PackageDirectoryManifest;
  manifestObservation: FileObservation;
}>): AudiobookRetailPackageBuildEvidence {
  const packageManifestFingerprint = stableHash(input.directoryManifest);
  const totalMediaBytes = input.files.reduce(
    (total, file) => total + file.output.byteCount,
    0,
  );
  const partial: Omit<AudiobookRetailPackageBuildEvidence, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_PACKAGE_BUILD_SCHEMA_VERSION,
    id: `retail_package_build_${stableHash({
      packageId: input.packageId,
      sourceManifest: input.manifest.fingerprint,
      files: input.files.map((file) => file.fingerprint),
      directoryManifest: packageManifestFingerprint,
    }).slice(0, 24)}`,
    packageId: input.packageId,
    projectId: input.manifest.projectId,
    bookId: input.manifest.bookId,
    distributor: "acx-audible",
    sourceManifest: Object.freeze({
      id: input.manifest.id,
      revision: 1,
      fingerprint: input.manifest.fingerprint,
    }),
    files: input.files,
    mediaFileCount: input.files.length,
    totalMediaBytes,
    packageManifest: Object.freeze({
      fileName: AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_NAME,
      contentHash: input.manifestObservation.contentHash,
      byteCount: input.manifestObservation.byteCount,
      fingerprint: packageManifestFingerprint,
    }),
    packageFileCount: input.files.length + 1,
    totalPackageBytes: totalMediaBytes + input.manifestObservation.byteCount,
    status: "ready-for-independent-inspection",
    builtAt: input.directoryManifest.builtAt,
  };
  const evidence = Object.freeze({
    ...partial,
    fingerprint: buildEvidenceFingerprint(partial),
  });
  assertAudiobookRetailPackageBuildEvidence(evidence);
  assertAudiobookRetailPackageBuildMatchesManifest(evidence, input.manifest);
  return evidence;
}

export async function buildAudiobookRetailPackage(
  input: BuildAudiobookRetailPackageInput,
): Promise<AudiobookRetailPackageBuildResult> {
  assertAudiobookRetailPackageManifest(input.manifest);
  if (input.manifest.status !== "ready-for-package-build") {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_MANIFEST_NOT_READY",
    );
  }
  const builtAt = input.builtAt ?? new Date();
  if (
    Number.isNaN(builtAt.getTime())
    || builtAt.getTime() < Date.parse(input.manifest.createdAt)
  ) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_DATE_INVALID",
    );
  }
  if (input.signal?.aborted) throw signalError();
  const maximumMediaBytes = input.maximumMediaBytes
    ?? DEFAULT_MAXIMUM_MEDIA_BYTES;
  requireInteger(
    maximumMediaBytes,
    input.manifest.totalMediaBytes,
    ABSOLUTE_MAXIMUM_MEDIA_BYTES,
    "AUDIOBOOK_RETAIL_PACKAGE_BUILD_MEDIA_LIMIT_INVALID",
  );
  const root = checkedPrivateRoot(input.privatePackageRoot);
  const stagingRoot = resolve(root, "staging");
  const packagesRoot = resolve(root, "packages");
  assertContained(stagingRoot, root);
  assertContained(packagesRoot, root);
  await mkdir(stagingRoot, { recursive: true, mode: 0o700 });
  await mkdir(packagesRoot, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700);
  await chmod(stagingRoot, 0o700);
  await chmod(packagesRoot, 0o700);

  let temporaryDirectory: string | undefined;
  const resolvedSources: ResolvedAudiobookRetailPackageMedia[] = [];
  try {
    temporaryDirectory = await mkdtemp(join(stagingRoot, "package-"));
    assertContained(temporaryDirectory, stagingRoot);
    await chmod(temporaryDirectory, 0o700);
    const files: AudiobookRetailPackageBuildFileEvidence[] = [];
    let totalMediaBytes = 0;
    for (const sourceFile of input.manifest.files) {
      if (input.signal?.aborted) throw signalError();
      const fileName = checkedMediaFileName(sourceFile.fileName);
      const resolvedSource = await input.sources.resolve(
        sourceFile.artifact,
        input.signal,
      );
      resolvedSources.push(resolvedSource);
      assertResolvedSource(sourceFile.artifact, resolvedSource);
      const sourceObservation = await observeFile(
        resolvedSource.privatePath,
        maximumMediaBytes,
      );
      assertMp3Observation(
        sourceObservation,
        "AUDIOBOOK_RETAIL_PACKAGE_BUILD_SOURCE_MEDIA_MISMATCH",
      );
      if (
        sourceObservation.contentHash !== sourceFile.artifact.contentHash
        || sourceObservation.byteCount !== sourceFile.artifact.byteCount
      ) {
        throw new AudiobookRetailPackageBuildError(
          "AUDIOBOOK_RETAIL_PACKAGE_BUILD_SOURCE_BYTES_MISMATCH",
        );
      }
      totalMediaBytes += sourceObservation.byteCount;
      if (
        totalMediaBytes > maximumMediaBytes
        || totalMediaBytes > input.manifest.totalMediaBytes
      ) {
        throw new AudiobookRetailPackageBuildError(
          "AUDIOBOOK_RETAIL_PACKAGE_BUILD_TOTAL_SIZE_INVALID",
        );
      }
      const targetPath = resolve(temporaryDirectory, fileName);
      assertContained(targetPath, temporaryDirectory);
      await copyFile(resolvedSource.privatePath, targetPath);
      await chmod(targetPath, 0o600);
      const outputObservation = await observeFile(
        targetPath,
        maximumMediaBytes,
      );
      assertMp3Observation(
        outputObservation,
        "AUDIOBOOK_RETAIL_PACKAGE_BUILD_OUTPUT_MEDIA_MISMATCH",
      );
      if (
        outputObservation.contentHash !== sourceObservation.contentHash
        || outputObservation.byteCount !== sourceObservation.byteCount
      ) {
        throw new AudiobookRetailPackageBuildError(
          "AUDIOBOOK_RETAIL_PACKAGE_BUILD_COPY_INTEGRITY_MISMATCH",
        );
      }
      const partial: Omit<
        AudiobookRetailPackageBuildFileEvidence,
        "fingerprint"
      > = {
        ordinal: sourceFile.ordinal,
        kind: sourceFile.kind,
        role: sourceFile.role,
        fileName,
        expectedDurationMs: sourceFile.expectedDurationMs,
        observedDurationMs: sourceFile.observedDurationMs,
        sourceFileFingerprint: sourceFile.fingerprint,
        sourceArtifact: sourceFile.artifact,
        output: Object.freeze({
          contentHash: outputObservation.contentHash,
          byteCount: outputObservation.byteCount,
          mimeType: "audio/mpeg",
          format: "mp3",
          mediaSignature: "mpeg-audio",
        }),
      };
      files.push(Object.freeze({
        ...partial,
        fingerprint: fileEvidenceFingerprint(partial),
      }));
    }
    if (totalMediaBytes !== input.manifest.totalMediaBytes) {
      throw new AudiobookRetailPackageBuildError(
        "AUDIOBOOK_RETAIL_PACKAGE_BUILD_TOTAL_SIZE_INVALID",
      );
    }
    const packageId = `retail_package_${stableHash({
      sourceManifest: input.manifest.fingerprint,
      files: files.map((file) => file.fingerprint),
    }).slice(0, 24)}`;
    requireIdentifier(
      packageId,
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_PACKAGE_ID_INVALID",
    );
    const manifestBase = directoryManifestBase(
      input.manifest,
      packageId,
      files,
    );
    const directoryManifest = createDirectoryManifest(
      manifestBase,
      builtAt.toISOString(),
    );
    const manifestBytes = canonicalJsonBytes(directoryManifest);
    if (manifestBytes.byteLength > MAXIMUM_JSON_BYTES) {
      throw new AudiobookRetailPackageBuildError(
        "AUDIOBOOK_RETAIL_PACKAGE_BUILD_DIRECTORY_MANIFEST_TOO_LARGE",
      );
    }
    await writePrivateFile(
      resolve(
        temporaryDirectory,
        AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_NAME,
      ),
      manifestBytes,
    );
    const finalDirectory = resolve(packagesRoot, packageId);
    assertContained(finalDirectory, packagesRoot);
    let reusedExistingPackage = false;
    try {
      await rename(temporaryDirectory, finalDirectory);
      temporaryDirectory = undefined;
    } catch (error) {
      if (!["EEXIST", "ENOTEMPTY"].includes(errorCode(error) ?? "")) {
        throw error;
      }
      reusedExistingPackage = true;
      await rm(temporaryDirectory!, { recursive: true, force: true });
      temporaryDirectory = undefined;
    }
    await chmod(finalDirectory, 0o700);
    const inspected = await inspectPackageDirectory({
      path: finalDirectory,
      files,
      manifestBase,
      maximumMediaBytes,
    });
    const evidence = buildEvidence({
      packageId,
      manifest: input.manifest,
      files: Object.freeze(files),
      directoryManifest: inspected.directoryManifest,
      manifestObservation: inspected.manifestObservation,
    });
    return Object.freeze({
      evidence,
      privatePackagePath: finalDirectory,
      reusedExistingPackage,
    });
  } catch (error) {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
    if (error instanceof AudiobookRetailPackageBuildError) throw error;
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_FILESYSTEM_FAILED",
    );
  } finally {
    await Promise.allSettled(
      resolvedSources.map(async (source) => await source.dispose()),
    );
  }
}

function assertArtifactSnapshot(
  value: AudiobookRetailPackageArtifactSnapshot,
): void {
  requireIdentifier(
    value.id,
    "AUDIOBOOK_RETAIL_PACKAGE_BUILD_ARTIFACT_ID_INVALID",
  );
  requireInteger(
    value.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_PACKAGE_BUILD_ARTIFACT_REVISION_INVALID",
  );
  for (const [candidate, code] of [
    [value.fingerprint, "AUDIOBOOK_RETAIL_PACKAGE_BUILD_ARTIFACT_FINGERPRINT_INVALID"],
    [value.contentHash, "AUDIOBOOK_RETAIL_PACKAGE_BUILD_ARTIFACT_HASH_INVALID"],
    [value.reviewFingerprint, "AUDIOBOOK_RETAIL_PACKAGE_BUILD_REVIEW_HASH_INVALID"],
  ] as const) requireHash(candidate, code);
  requireInteger(
    value.byteCount,
    1,
    ABSOLUTE_MAXIMUM_MEDIA_BYTES,
    "AUDIOBOOK_RETAIL_PACKAGE_BUILD_ARTIFACT_SIZE_INVALID",
  );
}

function assertFileEvidence(
  file: AudiobookRetailPackageBuildFileEvidence,
): void {
  requireInteger(
    file.ordinal,
    1,
    MAXIMUM_FILES,
    "AUDIOBOOK_RETAIL_PACKAGE_BUILD_FILE_ORDINAL_INVALID",
  );
  checkedMediaFileName(file.fileName);
  requireInteger(
    file.expectedDurationMs,
    1,
    7_200_000,
    "AUDIOBOOK_RETAIL_PACKAGE_BUILD_FILE_DURATION_INVALID",
  );
  requireInteger(
    file.observedDurationMs,
    1,
    7_210_000,
    "AUDIOBOOK_RETAIL_PACKAGE_BUILD_FILE_DURATION_INVALID",
  );
  requireHash(
    file.sourceFileFingerprint,
    "AUDIOBOOK_RETAIL_PACKAGE_BUILD_SOURCE_FILE_HASH_INVALID",
  );
  assertArtifactSnapshot(file.sourceArtifact);
  requireHash(
    file.output.contentHash,
    "AUDIOBOOK_RETAIL_PACKAGE_BUILD_OUTPUT_HASH_INVALID",
  );
  requireInteger(
    file.output.byteCount,
    1,
    ABSOLUTE_MAXIMUM_MEDIA_BYTES,
    "AUDIOBOOK_RETAIL_PACKAGE_BUILD_OUTPUT_SIZE_INVALID",
  );
  if (
    file.output.mimeType !== "audio/mpeg"
    || file.output.format !== "mp3"
    || file.output.mediaSignature !== "mpeg-audio"
    || file.output.contentHash !== file.sourceArtifact.contentHash
    || file.output.byteCount !== file.sourceArtifact.byteCount
  ) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_OUTPUT_PROFILE_INVALID",
    );
  }
  const { fingerprint, ...partial } = file;
  if (fileEvidenceFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_FILE_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailPackageBuildEvidence(
  evidence: AudiobookRetailPackageBuildEvidence,
): void {
  if (
    evidence.schemaVersion !== AUDIOBOOK_RETAIL_PACKAGE_BUILD_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [evidence.id, "AUDIOBOOK_RETAIL_PACKAGE_BUILD_ID_INVALID"],
    [evidence.packageId, "AUDIOBOOK_RETAIL_PACKAGE_BUILD_PACKAGE_ID_INVALID"],
    [evidence.projectId, "AUDIOBOOK_RETAIL_PACKAGE_BUILD_PROJECT_ID_INVALID"],
    [evidence.bookId, "AUDIOBOOK_RETAIL_PACKAGE_BUILD_BOOK_ID_INVALID"],
    [evidence.sourceManifest.id, "AUDIOBOOK_RETAIL_PACKAGE_BUILD_MANIFEST_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  if (evidence.distributor !== "acx-audible") {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_DISTRIBUTOR_INVALID",
    );
  }
  if (evidence.sourceManifest.revision !== 1) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_MANIFEST_REVISION_INVALID",
    );
  }
  requireHash(
    evidence.sourceManifest.fingerprint,
    "AUDIOBOOK_RETAIL_PACKAGE_BUILD_MANIFEST_HASH_INVALID",
  );
  if (
    !Array.isArray(evidence.files)
    || evidence.files.length < 4
    || evidence.files.length > MAXIMUM_FILES
  ) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_FILES_INVALID",
    );
  }
  const names = new Set<string>();
  const artifactIds = new Set<string>();
  let totalMediaBytes = 0;
  for (const [index, file] of evidence.files.entries()) {
    assertFileEvidence(file);
    if (
      file.ordinal !== index + 1
      || names.has(file.fileName)
      || artifactIds.has(file.sourceArtifact.id)
    ) {
      throw new AudiobookRetailPackageBuildError(
        "AUDIOBOOK_RETAIL_PACKAGE_BUILD_FILE_ORDER_INVALID",
      );
    }
    names.add(file.fileName);
    artifactIds.add(file.sourceArtifact.id);
    totalMediaBytes += file.output.byteCount;
  }
  requireInteger(
    evidence.mediaFileCount,
    4,
    MAXIMUM_FILES,
    "AUDIOBOOK_RETAIL_PACKAGE_BUILD_FILE_COUNT_INVALID",
  );
  requireInteger(
    evidence.totalMediaBytes,
    1,
    ABSOLUTE_MAXIMUM_MEDIA_BYTES,
    "AUDIOBOOK_RETAIL_PACKAGE_BUILD_TOTAL_SIZE_INVALID",
  );
  if (
    evidence.mediaFileCount !== evidence.files.length
    || evidence.totalMediaBytes !== totalMediaBytes
  ) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_AGGREGATES_MISMATCH",
    );
  }
  if (
    evidence.packageManifest.fileName
      !== AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_NAME
  ) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_DIRECTORY_MANIFEST_NAME_INVALID",
    );
  }
  for (const [value, code] of [
    [evidence.packageManifest.contentHash, "AUDIOBOOK_RETAIL_PACKAGE_BUILD_DIRECTORY_MANIFEST_HASH_INVALID"],
    [evidence.packageManifest.fingerprint, "AUDIOBOOK_RETAIL_PACKAGE_BUILD_DIRECTORY_MANIFEST_FINGERPRINT_INVALID"],
  ] as const) requireHash(value, code);
  requireInteger(
    evidence.packageManifest.byteCount,
    1,
    MAXIMUM_JSON_BYTES,
    "AUDIOBOOK_RETAIL_PACKAGE_BUILD_DIRECTORY_MANIFEST_SIZE_INVALID",
  );
  if (
    evidence.packageFileCount !== evidence.mediaFileCount + 1
    || evidence.totalPackageBytes
      !== evidence.totalMediaBytes + evidence.packageManifest.byteCount
  ) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_PACKAGE_AGGREGATES_MISMATCH",
    );
  }
  if (evidence.status !== "ready-for-independent-inspection") {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_STATUS_INVALID",
    );
  }
  requireDate(evidence.builtAt, "AUDIOBOOK_RETAIL_PACKAGE_BUILD_DATE_INVALID");
  const { fingerprint, ...partial } = evidence;
  if (buildEvidenceFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailPackageBuildMatchesManifest(
  evidence: AudiobookRetailPackageBuildEvidence,
  manifest: AudiobookRetailPackageManifest,
): void {
  assertAudiobookRetailPackageBuildEvidence(evidence);
  assertAudiobookRetailPackageManifest(manifest);
  if (
    evidence.projectId !== manifest.projectId
    || evidence.bookId !== manifest.bookId
    || evidence.distributor !== manifest.distributor
    || evidence.sourceManifest.id !== manifest.id
    || evidence.sourceManifest.revision !== manifest.revision
    || evidence.sourceManifest.fingerprint !== manifest.fingerprint
    || evidence.mediaFileCount !== manifest.mediaFileCount
    || evidence.totalMediaBytes !== manifest.totalMediaBytes
    || evidence.files.length !== manifest.files.length
  ) {
    throw new AudiobookRetailPackageBuildError(
      "AUDIOBOOK_RETAIL_PACKAGE_BUILD_SOURCE_MISMATCH",
    );
  }
  for (const [index, built] of evidence.files.entries()) {
    const source = manifest.files[index];
    if (
      !source
      || built.ordinal !== source.ordinal
      || built.kind !== source.kind
      || built.role !== source.role
      || built.fileName !== source.fileName
      || built.expectedDurationMs !== source.expectedDurationMs
      || built.observedDurationMs !== source.observedDurationMs
      || built.sourceFileFingerprint !== source.fingerprint
      || stableHash(built.sourceArtifact) !== stableHash(source.artifact)
    ) {
      throw new AudiobookRetailPackageBuildError(
        "AUDIOBOOK_RETAIL_PACKAGE_BUILD_SOURCE_MISMATCH",
      );
    }
  }
}

export function audiobookRetailPackageBuildPublicView(
  evidence: AudiobookRetailPackageBuildEvidence,
): AudiobookRetailPackageBuildPublicView {
  assertAudiobookRetailPackageBuildEvidence(evidence);
  return Object.freeze({
    id: evidence.id,
    bookId: evidence.bookId,
    distributor: evidence.distributor,
    mediaFileCount: evidence.mediaFileCount,
    packageFileCount: evidence.packageFileCount,
    totalMediaBytes: evidence.totalMediaBytes,
    totalPackageBytes: evidence.totalPackageBytes,
    files: Object.freeze(evidence.files.map((file) => Object.freeze({
      ordinal: file.ordinal,
      kind: file.kind,
      role: file.role,
      fileName: file.fileName,
      expectedDurationMs: file.expectedDurationMs,
      observedDurationMs: file.observedDurationMs,
      byteCount: file.output.byteCount,
    }))),
    status: evidence.status,
    builtAt: evidence.builtAt,
    fingerprint: evidence.fingerprint,
  });
}
