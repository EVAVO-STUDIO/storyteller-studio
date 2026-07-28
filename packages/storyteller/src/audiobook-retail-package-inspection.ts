import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  readFile,
  readdir,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import {
  AUDIOBOOK_RETAIL_PACKAGE_DIRECTORY_SCHEMA_VERSION,
  AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_NAME,
  assertAudiobookRetailPackageBuildEvidence,
  assertAudiobookRetailPackageBuildMatchesManifest,
  type AudiobookRetailPackageBuildEvidence,
  type AudiobookRetailPackageBuildFileEvidence,
} from "./audiobook-retail-package-build.js";
import {
  assertAudiobookRetailPackageManifest,
  type AudiobookRetailPackageManifest,
  type AudiobookRetailPackageMediaFile,
} from "./audiobook-retail-package-manifest.js";
import { stableHash } from "./index.js";
import { detectArtifactMedia } from "./private-object-store.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";

export const AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_SCHEMA_VERSION =
  "storyteller-audiobook-retail-package-inspection-v1" as const;
export const AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_ENTITY_TYPE =
  "audiobook-retail-package-inspection" as const;

export interface AudiobookRetailPackageInspectionFile {
  ordinal: number;
  kind: AudiobookRetailPackageMediaFile["kind"];
  role: AudiobookRetailPackageMediaFile["role"];
  fileName: string;
  expectedDurationMs: number;
  observedDurationMs: number;
  sourceBuildFileFingerprint: string;
  contentHash: string;
  byteCount: number;
  mediaSignature: "mpeg-audio";
  privatePermissionsVerified: true;
  fingerprint: string;
}

export interface AudiobookRetailPackageInspectionEvidence {
  schemaVersion: typeof AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  packageId: string;
  distributor: "acx-audible";
  sourceBuild: Readonly<{
    id: string;
    fingerprint: string;
  }>;
  sourceManifest: Readonly<{
    id: string;
    fingerprint: string;
  }>;
  files: readonly AudiobookRetailPackageInspectionFile[];
  mediaFileCount: number;
  totalMediaBytes: number;
  packageManifest: Readonly<{
    fileName: typeof AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_NAME;
    contentHash: string;
    byteCount: number;
    fingerprint: string;
  }>;
  directoryEntryCount: number;
  packageFileCount: number;
  totalPackageBytes: number;
  directoryPermissionsVerified: true;
  allFilesPrivate: true;
  status: "ready-for-final-package-review";
  inspectedAt: string;
  revision: 1;
  fingerprint: string;
}

export interface AudiobookRetailPackageInspectionPublicFile {
  ordinal: number;
  kind: AudiobookRetailPackageMediaFile["kind"];
  role: AudiobookRetailPackageMediaFile["role"];
  fileName: string;
  expectedDurationMs: number;
  observedDurationMs: number;
  byteCount: number;
  privatePermissionsVerified: true;
}

export interface AudiobookRetailPackageInspectionPublicView {
  id: string;
  bookId: string;
  distributor: "acx-audible";
  mediaFileCount: number;
  packageFileCount: number;
  totalMediaBytes: number;
  totalPackageBytes: number;
  directoryPermissionsVerified: true;
  allFilesPrivate: true;
  files: readonly AudiobookRetailPackageInspectionPublicFile[];
  status: "ready-for-final-package-review";
  inspectedAt: string;
  revision: 1;
  fingerprint: string;
}

export interface InspectAudiobookRetailPackageInput {
  build: AudiobookRetailPackageBuildEvidence;
  manifest: AudiobookRetailPackageManifest;
  privatePackagePath: string;
  maximumMediaBytes?: number;
  inspectedAt?: Date;
  signal?: AbortSignal;
}

export class AudiobookRetailPackageInspectionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailPackageInspectionError";
    this.code = code;
  }
}

export class AudiobookRetailPackageInspectionStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudiobookRetailPackageInspectionStoreConflictError";
  }
}

interface CanonicalPackageFile {
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

interface CanonicalPackageManifest {
  schemaVersion: typeof AUDIOBOOK_RETAIL_PACKAGE_DIRECTORY_SCHEMA_VERSION;
  packageId: string;
  projectId: string;
  bookId: string;
  distributor: "acx-audible";
  sourceManifestId: string;
  sourceManifestFingerprint: string;
  files: readonly CanonicalPackageFile[];
  mediaFileCount: number;
  totalMediaBytes: number;
  builtAt: string;
  fingerprint: string;
}

interface FileObservation {
  contentHash: string;
  byteCount: number;
  mediaSignature: string;
  privatePermissionsVerified: boolean;
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const MEDIA_FILE_NAME_PATTERN = /^[A-Za-z0-9]+\.mp3$/u;
const DEFAULT_MAXIMUM_MEDIA_BYTES = 4 * 1024 * 1024 * 1024;
const ABSOLUTE_MAXIMUM_MEDIA_BYTES = 16 * 1024 * 1024 * 1024;
const MAXIMUM_JSON_BYTES = 32 * 1024 * 1024;
const MAXIMUM_FILES = 2_003;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailPackageInspectionError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailPackageInspectionError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailPackageInspectionError(code);
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
    throw new AudiobookRetailPackageInspectionError(code);
  }
  return value;
}

function signalError(): AudiobookRetailPackageInspectionError {
  return new AudiobookRetailPackageInspectionError(
    "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_ABORTED",
  );
}

function checkedPackagePath(
  value: string,
  packageId: string,
): string {
  if (
    !value.trim()
    || value.includes("\0")
    || !isAbsolute(value)
  ) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_PRIVATE_PATH_INVALID",
    );
  }
  const path = resolve(value);
  if (
    basename(path) !== packageId
    || basename(dirname(path)) !== "packages"
  ) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_PRIVATE_PATH_SCOPE_INVALID",
    );
  }
  return path;
}

function checkedFileName(value: string): string {
  if (!MEDIA_FILE_NAME_PATTERN.test(value)) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_FILE_NAME_INVALID",
    );
  }
  return value;
}

function privateMode(mode: number): boolean {
  return (mode & 0o077) === 0 && (mode & 0o400) !== 0;
}

async function observeMp3(
  path: string,
  maximumBytes: number,
): Promise<FileObservation> {
  const metadata = await lstat(path);
  if (
    !metadata.isFile()
    || metadata.isSymbolicLink()
    || !privateMode(metadata.mode)
  ) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_PRIVATE_FILE_REQUIRED",
    );
  }
  requireInteger(
    metadata.size,
    1,
    maximumBytes,
    "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_FILE_SIZE_INVALID",
  );
  const handle = await import("node:fs/promises").then(
    async ({ open }) => await open(path, "r"),
  );
  let header: Uint8Array;
  try {
    const buffer = new Uint8Array(Math.min(64, metadata.size));
    const read = await handle.read(buffer, 0, buffer.byteLength, 0);
    header = buffer.slice(0, read.bytesRead);
  } finally {
    await handle.close();
  }
  let media;
  try {
    media = detectArtifactMedia(header);
  } catch {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_MEDIA_INVALID",
    );
  }
  if (
    media.mimeType !== "audio/mpeg"
    || media.format !== "mp3"
    || media.signature !== "mpeg-audio"
  ) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_MEDIA_INVALID",
    );
  }
  const hash = createHash("sha256");
  let byteCount = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    byteCount += chunk.byteLength;
    if (byteCount > maximumBytes) {
      throw new AudiobookRetailPackageInspectionError(
        "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_FILE_SIZE_INVALID",
      );
    }
  }
  if (byteCount !== metadata.size) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_FILE_CHANGED_DURING_READ",
    );
  }
  return Object.freeze({
    contentHash: hash.digest("hex"),
    byteCount,
    mediaSignature: "mpeg-audio",
    privatePermissionsVerified: true,
  });
}

function canonicalFingerprint(
  value: Omit<CanonicalPackageManifest, "fingerprint">,
): string {
  return stableHash(value);
}

function expectedCanonicalFile(
  file: AudiobookRetailPackageBuildFileEvidence,
): CanonicalPackageFile {
  return Object.freeze({
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
  });
}

function assertCanonicalManifest(
  value: CanonicalPackageManifest,
  build: AudiobookRetailPackageBuildEvidence,
): void {
  if (
    value.schemaVersion !== AUDIOBOOK_RETAIL_PACKAGE_DIRECTORY_SCHEMA_VERSION
    || value.packageId !== build.packageId
    || value.projectId !== build.projectId
    || value.bookId !== build.bookId
    || value.distributor !== build.distributor
    || value.sourceManifestId !== build.sourceManifest.id
    || value.sourceManifestFingerprint !== build.sourceManifest.fingerprint
    || value.mediaFileCount !== build.mediaFileCount
    || value.totalMediaBytes !== build.totalMediaBytes
    || value.builtAt !== build.builtAt
    || stableHash(value.files)
      !== stableHash(build.files.map(expectedCanonicalFile))
  ) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_CANONICAL_MANIFEST_MISMATCH",
    );
  }
  requireDate(
    value.builtAt,
    "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_DATE_INVALID",
  );
  const { fingerprint, ...partial } = value;
  if (
    !HASH_PATTERN.test(fingerprint)
    || canonicalFingerprint(partial) !== fingerprint
    || stableHash(value) !== build.packageManifest.fingerprint
  ) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_CANONICAL_MANIFEST_INVALID",
    );
  }
}

async function readCanonicalManifest(
  path: string,
  build: AudiobookRetailPackageBuildEvidence,
): Promise<Readonly<{
  value: CanonicalPackageManifest;
  contentHash: string;
  byteCount: number;
}>> {
  const metadata = await lstat(path);
  if (
    !metadata.isFile()
    || metadata.isSymbolicLink()
    || !privateMode(metadata.mode)
    || metadata.size < 1
    || metadata.size > MAXIMUM_JSON_BYTES
  ) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_CANONICAL_MANIFEST_INVALID",
    );
  }
  const bytes = await readFile(path);
  let value: CanonicalPackageManifest;
  try {
    value = JSON.parse(bytes.toString("utf8")) as CanonicalPackageManifest;
  } catch {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_CANONICAL_MANIFEST_INVALID",
    );
  }
  assertCanonicalManifest(value, build);
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  if (
    contentHash !== build.packageManifest.contentHash
    || bytes.byteLength !== build.packageManifest.byteCount
  ) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_CANONICAL_BYTES_MISMATCH",
    );
  }
  return Object.freeze({
    value,
    contentHash,
    byteCount: bytes.byteLength,
  });
}

function fileFingerprint(
  value: Omit<AudiobookRetailPackageInspectionFile, "fingerprint">,
): string {
  return stableHash(value);
}

function inspectionFingerprint(
  value: Omit<AudiobookRetailPackageInspectionEvidence, "fingerprint">,
): string {
  return stableHash(value);
}

export async function inspectAudiobookRetailPackage(
  input: InspectAudiobookRetailPackageInput,
): Promise<AudiobookRetailPackageInspectionEvidence> {
  assertAudiobookRetailPackageBuildEvidence(input.build);
  assertAudiobookRetailPackageManifest(input.manifest);
  assertAudiobookRetailPackageBuildMatchesManifest(input.build, input.manifest);
  if (input.build.status !== "ready-for-independent-inspection") {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_BUILD_NOT_READY",
    );
  }
  const inspectedAt = input.inspectedAt ?? new Date();
  if (
    Number.isNaN(inspectedAt.getTime())
    || inspectedAt.getTime() < Date.parse(input.build.builtAt)
  ) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_DATE_INVALID",
    );
  }
  if (input.signal?.aborted) throw signalError();
  const maximumMediaBytes = input.maximumMediaBytes
    ?? DEFAULT_MAXIMUM_MEDIA_BYTES;
  requireInteger(
    maximumMediaBytes,
    input.build.totalMediaBytes,
    ABSOLUTE_MAXIMUM_MEDIA_BYTES,
    "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_MEDIA_LIMIT_INVALID",
  );
  const packagePath = checkedPackagePath(
    input.privatePackagePath,
    input.build.packageId,
  );
  const directory = await lstat(packagePath);
  if (
    !directory.isDirectory()
    || directory.isSymbolicLink()
    || !privateMode(directory.mode)
  ) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_PRIVATE_DIRECTORY_REQUIRED",
    );
  }
  const expectedNames = new Set([
    ...input.build.files.map((file) => file.fileName),
    AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_NAME,
  ]);
  const entries = await readdir(packagePath, { withFileTypes: true });
  if (entries.length !== input.build.packageFileCount) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_DIRECTORY_CONTENTS_MISMATCH",
    );
  }
  for (const entry of entries) {
    if (
      !expectedNames.has(entry.name)
      || !entry.isFile()
      || entry.isSymbolicLink()
    ) {
      throw new AudiobookRetailPackageInspectionError(
        "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_DIRECTORY_CONTENTS_MISMATCH",
      );
    }
  }
  const canonical = await readCanonicalManifest(
    resolve(packagePath, AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_NAME),
    input.build,
  );
  const files: AudiobookRetailPackageInspectionFile[] = [];
  let totalMediaBytes = 0;
  for (const source of input.build.files) {
    if (input.signal?.aborted) throw signalError();
    const observed = await observeMp3(
      resolve(packagePath, checkedFileName(source.fileName)),
      maximumMediaBytes,
    );
    if (
      observed.contentHash !== source.output.contentHash
      || observed.byteCount !== source.output.byteCount
      || observed.contentHash !== source.sourceArtifact.contentHash
      || observed.byteCount !== source.sourceArtifact.byteCount
    ) {
      throw new AudiobookRetailPackageInspectionError(
        "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_MEDIA_BYTES_MISMATCH",
      );
    }
    totalMediaBytes += observed.byteCount;
    const partial: Omit<AudiobookRetailPackageInspectionFile, "fingerprint"> = {
      ordinal: source.ordinal,
      kind: source.kind,
      role: source.role,
      fileName: source.fileName,
      expectedDurationMs: source.expectedDurationMs,
      observedDurationMs: source.observedDurationMs,
      sourceBuildFileFingerprint: source.fingerprint,
      contentHash: observed.contentHash,
      byteCount: observed.byteCount,
      mediaSignature: "mpeg-audio",
      privatePermissionsVerified: true,
    };
    files.push(Object.freeze({
      ...partial,
      fingerprint: fileFingerprint(partial),
    }));
  }
  if (totalMediaBytes !== input.build.totalMediaBytes) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_AGGREGATES_MISMATCH",
    );
  }
  const partial: Omit<AudiobookRetailPackageInspectionEvidence, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_SCHEMA_VERSION,
    id: `retail_package_inspection_${stableHash({
      build: input.build.fingerprint,
      canonical: canonical.value.fingerprint,
      files: files.map((file) => file.fingerprint),
    }).slice(0, 24)}`,
    projectId: input.build.projectId,
    bookId: input.build.bookId,
    packageId: input.build.packageId,
    distributor: "acx-audible",
    sourceBuild: Object.freeze({
      id: input.build.id,
      fingerprint: input.build.fingerprint,
    }),
    sourceManifest: input.build.sourceManifest,
    files: Object.freeze(files),
    mediaFileCount: files.length,
    totalMediaBytes,
    packageManifest: Object.freeze({
      fileName: AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_NAME,
      contentHash: canonical.contentHash,
      byteCount: canonical.byteCount,
      fingerprint: input.build.packageManifest.fingerprint,
    }),
    directoryEntryCount: entries.length,
    packageFileCount: input.build.packageFileCount,
    totalPackageBytes: totalMediaBytes + canonical.byteCount,
    directoryPermissionsVerified: true,
    allFilesPrivate: true,
    status: "ready-for-final-package-review",
    inspectedAt: inspectedAt.toISOString(),
    revision: 1,
  };
  const evidence = Object.freeze({
    ...partial,
    fingerprint: inspectionFingerprint(partial),
  });
  assertAudiobookRetailPackageInspectionEvidence(evidence);
  assertAudiobookRetailPackageInspectionMatchesSources(
    evidence,
    input.build,
    input.manifest,
  );
  return evidence;
}

function assertInspectionFile(
  file: AudiobookRetailPackageInspectionFile,
): void {
  requireInteger(
    file.ordinal,
    1,
    MAXIMUM_FILES,
    "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_FILE_ORDINAL_INVALID",
  );
  checkedFileName(file.fileName);
  requireInteger(
    file.expectedDurationMs,
    1,
    7_200_000,
    "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_DURATION_INVALID",
  );
  requireInteger(
    file.observedDurationMs,
    1,
    7_210_000,
    "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_DURATION_INVALID",
  );
  requireHash(
    file.sourceBuildFileFingerprint,
    "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_SOURCE_FILE_HASH_INVALID",
  );
  requireHash(
    file.contentHash,
    "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_FILE_HASH_INVALID",
  );
  requireInteger(
    file.byteCount,
    1,
    ABSOLUTE_MAXIMUM_MEDIA_BYTES,
    "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_FILE_SIZE_INVALID",
  );
  if (
    file.mediaSignature !== "mpeg-audio"
    || file.privatePermissionsVerified !== true
  ) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_FILE_STATE_INVALID",
    );
  }
  const { fingerprint, ...partial } = file;
  if (fileFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_FILE_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailPackageInspectionEvidence(
  evidence: AudiobookRetailPackageInspectionEvidence,
): void {
  if (
    evidence.schemaVersion
      !== AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [evidence.id, "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_ID_INVALID"],
    [evidence.projectId, "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_PROJECT_ID_INVALID"],
    [evidence.bookId, "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_BOOK_ID_INVALID"],
    [evidence.packageId, "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_PACKAGE_ID_INVALID"],
    [evidence.sourceBuild.id, "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_BUILD_ID_INVALID"],
    [evidence.sourceManifest.id, "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_MANIFEST_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  for (const [value, code] of [
    [evidence.sourceBuild.fingerprint, "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_BUILD_HASH_INVALID"],
    [evidence.sourceManifest.fingerprint, "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_MANIFEST_HASH_INVALID"],
    [evidence.packageManifest.contentHash, "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_CANONICAL_HASH_INVALID"],
    [evidence.packageManifest.fingerprint, "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_CANONICAL_FINGERPRINT_INVALID"],
  ] as const) requireHash(value, code);
  if (evidence.distributor !== "acx-audible") {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_DISTRIBUTOR_INVALID",
    );
  }
  if (
    !Array.isArray(evidence.files)
    || evidence.files.length < 4
    || evidence.files.length > MAXIMUM_FILES
  ) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_FILES_INVALID",
    );
  }
  const names = new Set<string>();
  let totalMediaBytes = 0;
  for (const [index, file] of evidence.files.entries()) {
    assertInspectionFile(file);
    if (file.ordinal !== index + 1 || names.has(file.fileName)) {
      throw new AudiobookRetailPackageInspectionError(
        "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_FILE_ORDER_INVALID",
      );
    }
    names.add(file.fileName);
    totalMediaBytes += file.byteCount;
  }
  if (
    evidence.mediaFileCount !== evidence.files.length
    || evidence.totalMediaBytes !== totalMediaBytes
    || evidence.packageFileCount !== evidence.files.length + 1
    || evidence.directoryEntryCount !== evidence.packageFileCount
    || evidence.totalPackageBytes
      !== evidence.totalMediaBytes + evidence.packageManifest.byteCount
  ) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_AGGREGATES_MISMATCH",
    );
  }
  requireInteger(
    evidence.packageManifest.byteCount,
    1,
    MAXIMUM_JSON_BYTES,
    "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_CANONICAL_SIZE_INVALID",
  );
  if (
    evidence.packageManifest.fileName
      !== AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_NAME
    || evidence.directoryPermissionsVerified !== true
    || evidence.allFilesPrivate !== true
    || evidence.status !== "ready-for-final-package-review"
    || evidence.revision !== 1
  ) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_STATE_INVALID",
    );
  }
  requireDate(
    evidence.inspectedAt,
    "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_DATE_INVALID",
  );
  const { fingerprint, ...partial } = evidence;
  if (inspectionFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailPackageInspectionMatchesSources(
  evidence: AudiobookRetailPackageInspectionEvidence,
  build: AudiobookRetailPackageBuildEvidence,
  manifest: AudiobookRetailPackageManifest,
): void {
  assertAudiobookRetailPackageInspectionEvidence(evidence);
  assertAudiobookRetailPackageBuildEvidence(build);
  assertAudiobookRetailPackageManifest(manifest);
  assertAudiobookRetailPackageBuildMatchesManifest(build, manifest);
  if (
    evidence.projectId !== build.projectId
    || evidence.bookId !== build.bookId
    || evidence.packageId !== build.packageId
    || evidence.distributor !== build.distributor
    || evidence.sourceBuild.id !== build.id
    || evidence.sourceBuild.fingerprint !== build.fingerprint
    || evidence.sourceManifest.id !== manifest.id
    || evidence.sourceManifest.fingerprint !== manifest.fingerprint
    || evidence.mediaFileCount !== build.mediaFileCount
    || evidence.totalMediaBytes !== build.totalMediaBytes
    || evidence.packageFileCount !== build.packageFileCount
    || evidence.totalPackageBytes !== build.totalPackageBytes
    || evidence.packageManifest.contentHash
      !== build.packageManifest.contentHash
    || evidence.packageManifest.byteCount !== build.packageManifest.byteCount
    || evidence.packageManifest.fingerprint
      !== build.packageManifest.fingerprint
    || Date.parse(evidence.inspectedAt) < Date.parse(build.builtAt)
  ) {
    throw new AudiobookRetailPackageInspectionError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_SOURCE_MISMATCH",
    );
  }
  for (const [index, inspected] of evidence.files.entries()) {
    const source = build.files[index];
    if (
      !source
      || inspected.ordinal !== source.ordinal
      || inspected.kind !== source.kind
      || inspected.role !== source.role
      || inspected.fileName !== source.fileName
      || inspected.expectedDurationMs !== source.expectedDurationMs
      || inspected.observedDurationMs !== source.observedDurationMs
      || inspected.sourceBuildFileFingerprint !== source.fingerprint
      || inspected.contentHash !== source.output.contentHash
      || inspected.byteCount !== source.output.byteCount
    ) {
      throw new AudiobookRetailPackageInspectionError(
        "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_SOURCE_MISMATCH",
      );
    }
  }
}

export function audiobookRetailPackageInspectionPublicView(
  evidence: AudiobookRetailPackageInspectionEvidence,
): AudiobookRetailPackageInspectionPublicView {
  assertAudiobookRetailPackageInspectionEvidence(evidence);
  return Object.freeze({
    id: evidence.id,
    bookId: evidence.bookId,
    distributor: evidence.distributor,
    mediaFileCount: evidence.mediaFileCount,
    packageFileCount: evidence.packageFileCount,
    totalMediaBytes: evidence.totalMediaBytes,
    totalPackageBytes: evidence.totalPackageBytes,
    directoryPermissionsVerified: true,
    allFilesPrivate: true,
    files: Object.freeze(evidence.files.map((file) => Object.freeze({
      ordinal: file.ordinal,
      kind: file.kind,
      role: file.role,
      fileName: file.fileName,
      expectedDurationMs: file.expectedDurationMs,
      observedDurationMs: file.observedDurationMs,
      byteCount: file.byteCount,
      privatePermissionsVerified: true as const,
    }))),
    status: evidence.status,
    inspectedAt: evidence.inspectedAt,
    revision: 1,
    fingerprint: evidence.fingerprint,
  });
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<AudiobookRetailPackageInspectionEvidence> {
  const evidence = envelope.payload as unknown as AudiobookRetailPackageInspectionEvidence;
  assertAudiobookRetailPackageInspectionEvidence(evidence);
  if (
    envelope.entityType !== AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_ENTITY_TYPE
    || envelope.entityId !== evidence.id
    || envelope.revision !== evidence.revision
  ) {
    throw new AudiobookRetailPackageInspectionStoreConflictError(
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<AudiobookRetailPackageInspectionEvidence>;
}

function payload(
  evidence: AudiobookRetailPackageInspectionEvidence,
): Record<string, unknown> {
  return evidence as unknown as Record<string, unknown>;
}

export class FileAudiobookRetailPackageInspectionStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    evidence: AudiobookRetailPackageInspectionEvidence,
    actorId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPackageInspectionEvidence>> {
    assertAudiobookRetailPackageInspectionEvidence(evidence);
    requireIdentifier(
      actorId,
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_STORE_ACTOR_INVALID",
    );
    try {
      const existing = await this.read(evidence.id);
      if (existing) {
        if (existing.payload.fingerprint === evidence.fingerprint) return existing;
        throw new AudiobookRetailPackageInspectionStoreConflictError(
          "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_STORE_IDEMPOTENCY_CONFLICT",
        );
      }
      const envelope = toEnvelope(await this.#store.create(
        AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_ENTITY_TYPE,
        evidence.id,
        payload(evidence),
        new Date(evidence.inspectedAt),
      ));
      await this.#store.appendAuditEvent({
        actorId,
        action: "audiobook_retail_package_inspection.created",
        entityType: AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_ENTITY_TYPE,
        entityId: envelope.entityId,
        revision: envelope.revision,
        occurredAt: new Date(envelope.savedAt),
        metadata: {
          status: evidence.status,
          mediaFileCount: evidence.mediaFileCount,
          packageFileCount: evidence.packageFileCount,
          totalPackageBytes: evidence.totalPackageBytes,
          directoryPermissionsVerified: true,
          allFilesPrivate: true,
        },
      });
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailPackageInspectionStoreConflictError(
          error.message,
        );
      }
      throw error;
    }
  }

  async read(
    evidenceId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPackageInspectionEvidence> | null> {
    requireIdentifier(
      evidenceId,
      "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_STORE_ID_INVALID",
    );
    const envelope = await this.#store.read<Record<string, unknown>>(
      AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_ENTITY_TYPE,
      evidenceId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(
    evidenceId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPackageInspectionEvidence>> {
    const envelope = await this.read(evidenceId);
    if (!envelope) {
      throw new AudiobookRetailPackageInspectionStoreConflictError(
        "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }
}
