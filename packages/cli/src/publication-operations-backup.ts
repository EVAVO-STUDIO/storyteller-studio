import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { stableHash } from "@evavo/storyteller-engine";

export const PUBLICATION_OPERATIONS_BACKUP_SCHEMA_VERSION =
  "storyteller-publication-operations-backup-v1" as const;

export interface PublicationOperationsBackupFileRecord {
  relativePath: string;
  byteCount: number;
  contentHash: string;
  mode: number;
}

export interface PublicationOperationsBackupManifest {
  schemaVersion: typeof PUBLICATION_OPERATIONS_BACKUP_SCHEMA_VERSION;
  snapshotId: string;
  createdAt: string;
  createdByActorId: string;
  sourceFingerprint: string;
  files: readonly PublicationOperationsBackupFileRecord[];
  fileCount: number;
  totalBytes: number;
  fingerprint: string;
}

export interface PublicationOperationsBackupResult {
  status: "created" | "existing";
  snapshotId: string;
  createdAt: string;
  fileCount: number;
  totalBytes: number;
  fingerprint: string;
}

export interface PublicationOperationsBackupVerificationResult {
  status: "verified";
  snapshotId: string;
  createdAt: string;
  fileCount: number;
  totalBytes: number;
  fingerprint: string;
}

export interface PublicationOperationsRestoreResult {
  status: "restored";
  snapshotId: string;
  snapshotCreatedAt: string;
  restoredAt: string;
  fileCount: number;
  totalBytes: number;
  fingerprint: string;
}

export interface CreatePublicationOperationsBackupInput {
  dataDirectory: string;
  backupDirectory: string;
  actorId: string;
  offlineConfirmed: true;
  createdAt?: Date;
  afterCopy?: () => Promise<void>;
}

export interface RestorePublicationOperationsBackupInput {
  snapshotDirectory: string;
  dataDirectory: string;
  actorId: string;
  offlineConfirmed: true;
  restoredAt?: Date;
}

export class PublicationOperationsBackupError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PublicationOperationsBackupError";
    this.code = code;
  }
}

interface ScannedFileRecord extends PublicationOperationsBackupFileRecord {}

interface VerifiedSnapshot {
  manifest: PublicationOperationsBackupManifest;
  result: PublicationOperationsBackupVerificationResult;
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SNAPSHOT_ID_PATTERN = /^publication_backup_[a-f0-9]{24}$/u;
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9._-]{1,255}$/u;
const MANIFEST_NAME = "manifest.json";
const DATA_DIRECTORY_NAME = "data";
const MANIFEST_MAXIMUM_BYTES = 16 * 1024 * 1024;
const SNAPSHOT_FILE_MODE = 0o600;
const SNAPSHOT_DIRECTORY_MODE = 0o700;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new PublicationOperationsBackupError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new PublicationOperationsBackupError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new PublicationOperationsBackupError(code);
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
    throw new PublicationOperationsBackupError(code);
  }
  return value;
}

function requireOfflineConfirmation(value: true): void {
  if (value !== true) {
    throw new PublicationOperationsBackupError(
      "PUBLICATION_OPERATIONS_BACKUP_OFFLINE_CONFIRMATION_REQUIRED",
    );
  }
}

function normaliseRelativePath(value: string): string {
  if (
    !value
    || value.length > 2_048
    || isAbsolute(value)
    || value.includes("\\")
    || value.includes("\u0000")
  ) {
    throw new PublicationOperationsBackupError(
      "PUBLICATION_OPERATIONS_BACKUP_RELATIVE_PATH_INVALID",
    );
  }
  const segments = value.split("/");
  if (
    segments.some(
      (segment) =>
        !SAFE_PATH_SEGMENT.test(segment)
        || segment === "."
        || segment === "..",
    )
  ) {
    throw new PublicationOperationsBackupError(
      "PUBLICATION_OPERATIONS_BACKUP_RELATIVE_PATH_INVALID",
    );
  }
  return value;
}

function relativePath(root: string, absolutePath: string): string {
  const value = relative(root, absolutePath).split(sep).join("/");
  return normaliseRelativePath(value);
}

function isContained(child: string, parent: string): boolean {
  const relation = relative(parent, child);
  return relation === ""
    || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation));
}

function rejectNestedPaths(left: string, right: string): void {
  if (isContained(left, right) || isContained(right, left)) {
    throw new PublicationOperationsBackupError(
      "PUBLICATION_OPERATIONS_BACKUP_PATH_NESTING_FORBIDDEN",
    );
  }
}

function unsafeTransientName(path: string): boolean {
  const name = basename(path).toLocaleLowerCase("en-AU");
  return name.endsWith(".lock") || name.endsWith(".tmp");
}

async function hashFile(path: string): Promise<Readonly<{
  byteCount: number;
  contentHash: string;
}>> {
  const bytes = await readFile(path);
  return Object.freeze({
    byteCount: bytes.byteLength,
    contentHash: createHash("sha256").update(bytes).digest("hex"),
  });
}

async function requireDirectory(path: string, code: string): Promise<void> {
  let information;
  try {
    information = await lstat(path);
  } catch (error) {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && error.code === "ENOENT"
    ) {
      throw new PublicationOperationsBackupError(code);
    }
    throw error;
  }
  if (information.isSymbolicLink() || !information.isDirectory()) {
    throw new PublicationOperationsBackupError(code);
  }
}

async function ensurePrivateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: SNAPSHOT_DIRECTORY_MODE });
  await chmod(path, SNAPSHOT_DIRECTORY_MODE);
  const information = await lstat(path);
  if (information.isSymbolicLink() || !information.isDirectory()) {
    throw new PublicationOperationsBackupError(
      "PUBLICATION_OPERATIONS_BACKUP_DIRECTORY_INVALID",
    );
  }
}

async function scanTree(root: string): Promise<readonly ScannedFileRecord[]> {
  await requireDirectory(root, "PUBLICATION_OPERATIONS_BACKUP_SOURCE_NOT_FOUND");
  const records: ScannedFileRecord[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en-AU"));
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      const information = await lstat(absolutePath);
      if (information.isSymbolicLink()) {
        throw new PublicationOperationsBackupError(
          "PUBLICATION_OPERATIONS_BACKUP_SYMLINK_FORBIDDEN",
        );
      }
      if (unsafeTransientName(absolutePath)) {
        throw new PublicationOperationsBackupError(
          "PUBLICATION_OPERATIONS_BACKUP_STATE_BUSY",
        );
      }
      if (information.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!information.isFile()) {
        throw new PublicationOperationsBackupError(
          "PUBLICATION_OPERATIONS_BACKUP_SPECIAL_FILE_FORBIDDEN",
        );
      }
      const integrity = await hashFile(absolutePath);
      records.push(Object.freeze({
        relativePath: relativePath(root, absolutePath),
        byteCount: integrity.byteCount,
        contentHash: integrity.contentHash,
        mode: information.mode & 0o777,
      }));
    }
  }

  await visit(root);
  records.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, "en-AU")
  );
  return Object.freeze(records);
}

function normalisedSnapshotFiles(
  sourceFiles: readonly ScannedFileRecord[],
): readonly PublicationOperationsBackupFileRecord[] {
  return Object.freeze(sourceFiles.map((file) => Object.freeze({
    relativePath: file.relativePath,
    byteCount: file.byteCount,
    contentHash: file.contentHash,
    mode: SNAPSHOT_FILE_MODE,
  })));
}

function scansMatch(
  left: readonly ScannedFileRecord[],
  right: readonly ScannedFileRecord[],
): boolean {
  return stableHash(left) === stableHash(right);
}

function manifestFingerprint(
  value: Omit<PublicationOperationsBackupManifest, "fingerprint">,
): string {
  return stableHash(value);
}

function createManifest(input: Readonly<{
  sourceFiles: readonly ScannedFileRecord[];
  createdAt: string;
  actorId: string;
}>): PublicationOperationsBackupManifest {
  const files = normalisedSnapshotFiles(input.sourceFiles);
  const sourceFingerprint = stableHash(input.sourceFiles);
  const snapshotId = `publication_backup_${stableHash({
    sourceFingerprint,
    createdAt: input.createdAt,
    actorId: input.actorId,
  }).slice(0, 24)}`;
  const partial: Omit<PublicationOperationsBackupManifest, "fingerprint"> = {
    schemaVersion: PUBLICATION_OPERATIONS_BACKUP_SCHEMA_VERSION,
    snapshotId,
    createdAt: input.createdAt,
    createdByActorId: input.actorId,
    sourceFingerprint,
    files,
    fileCount: files.length,
    totalBytes: files.reduce((total, file) => total + file.byteCount, 0),
  };
  return Object.freeze({
    ...partial,
    fingerprint: manifestFingerprint(partial),
  });
}

function assertManifest(
  manifest: PublicationOperationsBackupManifest,
): void {
  if (manifest.schemaVersion !== PUBLICATION_OPERATIONS_BACKUP_SCHEMA_VERSION) {
    throw new PublicationOperationsBackupError(
      "PUBLICATION_OPERATIONS_BACKUP_SCHEMA_UNSUPPORTED",
    );
  }
  if (!SNAPSHOT_ID_PATTERN.test(manifest.snapshotId)) {
    throw new PublicationOperationsBackupError(
      "PUBLICATION_OPERATIONS_BACKUP_SNAPSHOT_ID_INVALID",
    );
  }
  requireDate(
    manifest.createdAt,
    "PUBLICATION_OPERATIONS_BACKUP_CREATED_AT_INVALID",
  );
  requireIdentifier(
    manifest.createdByActorId,
    "PUBLICATION_OPERATIONS_BACKUP_ACTOR_ID_INVALID",
  );
  requireHash(
    manifest.sourceFingerprint,
    "PUBLICATION_OPERATIONS_BACKUP_SOURCE_FINGERPRINT_INVALID",
  );
  if (!Array.isArray(manifest.files) || manifest.files.length > 1_000_000) {
    throw new PublicationOperationsBackupError(
      "PUBLICATION_OPERATIONS_BACKUP_FILES_INVALID",
    );
  }
  const paths = new Set<string>();
  let totalBytes = 0;
  let previousPath = "";
  for (const file of manifest.files) {
    const path = normaliseRelativePath(file.relativePath);
    if (
      paths.has(path)
      || (previousPath && previousPath.localeCompare(path, "en-AU") >= 0)
    ) {
      throw new PublicationOperationsBackupError(
        "PUBLICATION_OPERATIONS_BACKUP_FILES_ORDER_INVALID",
      );
    }
    paths.add(path);
    previousPath = path;
    requireInteger(
      file.byteCount,
      0,
      Number.MAX_SAFE_INTEGER,
      "PUBLICATION_OPERATIONS_BACKUP_FILE_SIZE_INVALID",
    );
    requireHash(
      file.contentHash,
      "PUBLICATION_OPERATIONS_BACKUP_FILE_HASH_INVALID",
    );
    if (file.mode !== SNAPSHOT_FILE_MODE) {
      throw new PublicationOperationsBackupError(
        "PUBLICATION_OPERATIONS_BACKUP_FILE_MODE_INVALID",
      );
    }
    totalBytes += file.byteCount;
  }
  requireInteger(
    manifest.fileCount,
    0,
    1_000_000,
    "PUBLICATION_OPERATIONS_BACKUP_FILE_COUNT_INVALID",
  );
  requireInteger(
    manifest.totalBytes,
    0,
    Number.MAX_SAFE_INTEGER,
    "PUBLICATION_OPERATIONS_BACKUP_TOTAL_SIZE_INVALID",
  );
  if (
    manifest.fileCount !== manifest.files.length
    || manifest.totalBytes !== totalBytes
  ) {
    throw new PublicationOperationsBackupError(
      "PUBLICATION_OPERATIONS_BACKUP_TOTALS_MISMATCH",
    );
  }
  const { fingerprint, ...partial } = manifest;
  requireHash(
    fingerprint,
    "PUBLICATION_OPERATIONS_BACKUP_FINGERPRINT_INVALID",
  );
  if (manifestFingerprint(partial) !== fingerprint) {
    throw new PublicationOperationsBackupError(
      "PUBLICATION_OPERATIONS_BACKUP_FINGERPRINT_MISMATCH",
    );
  }
}

async function writeSecureFile(path: string, bytes: Uint8Array): Promise<void> {
  await ensurePrivateDirectory(dirname(path));
  const handle = await open(path, "wx", SNAPSHOT_FILE_MODE);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(path, SNAPSHOT_FILE_MODE);
}

async function writeManifest(
  snapshotDirectory: string,
  manifest: PublicationOperationsBackupManifest,
): Promise<void> {
  await writeSecureFile(
    join(snapshotDirectory, MANIFEST_NAME),
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
  );
}

async function copyFiles(
  sourceRoot: string,
  targetRoot: string,
  files: readonly PublicationOperationsBackupFileRecord[],
): Promise<void> {
  await ensurePrivateDirectory(targetRoot);
  for (const file of files) {
    const sourcePath = resolve(sourceRoot, file.relativePath);
    const targetPath = resolve(targetRoot, file.relativePath);
    if (!isContained(sourcePath, sourceRoot) || !isContained(targetPath, targetRoot)) {
      throw new PublicationOperationsBackupError(
        "PUBLICATION_OPERATIONS_BACKUP_PATH_ESCAPE_DETECTED",
      );
    }
    const information = await lstat(sourcePath);
    if (information.isSymbolicLink() || !information.isFile()) {
      throw new PublicationOperationsBackupError(
        "PUBLICATION_OPERATIONS_BACKUP_SOURCE_CHANGED",
      );
    }
    const bytes = await readFile(sourcePath);
    await writeSecureFile(targetPath, bytes);
  }
}

async function assertSnapshotRootLayout(snapshotDirectory: string): Promise<void> {
  await requireDirectory(
    snapshotDirectory,
    "PUBLICATION_OPERATIONS_BACKUP_SNAPSHOT_NOT_FOUND",
  );
  const entries = await readdir(snapshotDirectory, { withFileTypes: true });
  const names = entries.map((entry) => entry.name).sort((left, right) =>
    left.localeCompare(right, "en-AU")
  );
  if (stableHash(names) !== stableHash([DATA_DIRECTORY_NAME, MANIFEST_NAME])) {
    throw new PublicationOperationsBackupError(
      "PUBLICATION_OPERATIONS_BACKUP_SNAPSHOT_LAYOUT_INVALID",
    );
  }
  for (const entry of entries) {
    const information = await lstat(join(snapshotDirectory, entry.name));
    if (information.isSymbolicLink()) {
      throw new PublicationOperationsBackupError(
        "PUBLICATION_OPERATIONS_BACKUP_SYMLINK_FORBIDDEN",
      );
    }
  }
}

async function readManifest(
  snapshotDirectory: string,
): Promise<PublicationOperationsBackupManifest> {
  const path = join(snapshotDirectory, MANIFEST_NAME);
  const information = await lstat(path);
  if (
    information.isSymbolicLink()
    || !information.isFile()
    || information.size > MANIFEST_MAXIMUM_BYTES
  ) {
    throw new PublicationOperationsBackupError(
      "PUBLICATION_OPERATIONS_BACKUP_MANIFEST_INVALID",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new PublicationOperationsBackupError(
      "PUBLICATION_OPERATIONS_BACKUP_MANIFEST_INVALID",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PublicationOperationsBackupError(
      "PUBLICATION_OPERATIONS_BACKUP_MANIFEST_INVALID",
    );
  }
  const manifest = parsed as PublicationOperationsBackupManifest;
  assertManifest(manifest);
  return manifest;
}

async function verifySnapshotInternal(
  snapshotDirectory: string,
): Promise<VerifiedSnapshot> {
  const root = resolve(snapshotDirectory);
  await assertSnapshotRootLayout(root);
  const manifest = await readManifest(root);
  const files = await scanTree(join(root, DATA_DIRECTORY_NAME));
  const expected = manifest.files;
  if (stableHash(files) !== stableHash(expected)) {
    throw new PublicationOperationsBackupError(
      "PUBLICATION_OPERATIONS_BACKUP_CONTENT_MISMATCH",
    );
  }
  return Object.freeze({
    manifest,
    result: Object.freeze({
      status: "verified",
      snapshotId: manifest.snapshotId,
      createdAt: manifest.createdAt,
      fileCount: manifest.fileCount,
      totalBytes: manifest.totalBytes,
      fingerprint: manifest.fingerprint,
    }),
  });
}

export async function verifyPublicationOperationsBackupSnapshot(
  snapshotDirectory: string,
): Promise<PublicationOperationsBackupVerificationResult> {
  return (await verifySnapshotInternal(snapshotDirectory)).result;
}

export async function createPublicationOperationsBackup(
  input: CreatePublicationOperationsBackupInput,
): Promise<PublicationOperationsBackupResult> {
  requireOfflineConfirmation(input.offlineConfirmed);
  const actorId = requireIdentifier(
    input.actorId,
    "PUBLICATION_OPERATIONS_BACKUP_ACTOR_ID_INVALID",
  );
  const createdAt = input.createdAt ?? new Date();
  if (Number.isNaN(createdAt.getTime())) {
    throw new PublicationOperationsBackupError(
      "PUBLICATION_OPERATIONS_BACKUP_CREATED_AT_INVALID",
    );
  }

  const sourceRoot = resolve(input.dataDirectory, "publication-operations");
  const backupRoot = resolve(input.backupDirectory);
  rejectNestedPaths(sourceRoot, backupRoot);
  await requireDirectory(
    sourceRoot,
    "PUBLICATION_OPERATIONS_BACKUP_SOURCE_NOT_FOUND",
  );
  await ensurePrivateDirectory(backupRoot);

  const sourceBefore = await scanTree(sourceRoot);
  const manifest = createManifest({
    sourceFiles: sourceBefore,
    createdAt: createdAt.toISOString(),
    actorId,
  });
  const finalDirectory = join(backupRoot, manifest.snapshotId);

  try {
    const existing = await verifySnapshotInternal(finalDirectory);
    if (existing.manifest.fingerprint !== manifest.fingerprint) {
      throw new PublicationOperationsBackupError(
        "PUBLICATION_OPERATIONS_BACKUP_EXISTING_SNAPSHOT_CONFLICT",
      );
    }
    return Object.freeze({
      status: "existing",
      snapshotId: manifest.snapshotId,
      createdAt: manifest.createdAt,
      fileCount: manifest.fileCount,
      totalBytes: manifest.totalBytes,
      fingerprint: manifest.fingerprint,
    });
  } catch (error) {
    if (
      !(error instanceof PublicationOperationsBackupError)
      || error.code !== "PUBLICATION_OPERATIONS_BACKUP_SNAPSHOT_NOT_FOUND"
    ) {
      throw error;
    }
  }

  const stagingDirectory = join(
    backupRoot,
    `.${manifest.snapshotId}.${process.pid}.tmp`,
  );
  await rm(stagingDirectory, { recursive: true, force: true });
  try {
    await ensurePrivateDirectory(stagingDirectory);
    await copyFiles(
      sourceRoot,
      join(stagingDirectory, DATA_DIRECTORY_NAME),
      manifest.files,
    );
    await input.afterCopy?.();

    const copied = await scanTree(join(stagingDirectory, DATA_DIRECTORY_NAME));
    if (stableHash(copied) !== stableHash(manifest.files)) {
      throw new PublicationOperationsBackupError(
        "PUBLICATION_OPERATIONS_BACKUP_COPY_VERIFICATION_FAILED",
      );
    }

    const sourceAfter = await scanTree(sourceRoot);
    if (!scansMatch(sourceBefore, sourceAfter)) {
      throw new PublicationOperationsBackupError(
        "PUBLICATION_OPERATIONS_BACKUP_SOURCE_CHANGED",
      );
    }

    await writeManifest(stagingDirectory, manifest);
    await verifySnapshotInternal(stagingDirectory);
    await rename(stagingDirectory, finalDirectory);
    await chmod(finalDirectory, SNAPSHOT_DIRECTORY_MODE);
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }

  return Object.freeze({
    status: "created",
    snapshotId: manifest.snapshotId,
    createdAt: manifest.createdAt,
    fileCount: manifest.fileCount,
    totalBytes: manifest.totalBytes,
    fingerprint: manifest.fingerprint,
  });
}

async function targetState(
  targetRoot: string,
): Promise<"missing" | "empty"> {
  try {
    const information = await lstat(targetRoot);
    if (information.isSymbolicLink() || !information.isDirectory()) {
      throw new PublicationOperationsBackupError(
        "PUBLICATION_OPERATIONS_RESTORE_TARGET_INVALID",
      );
    }
    if ((await readdir(targetRoot)).length !== 0) {
      throw new PublicationOperationsBackupError(
        "PUBLICATION_OPERATIONS_RESTORE_TARGET_NOT_EMPTY",
      );
    }
    return "empty";
  } catch (error) {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && error.code === "ENOENT"
    ) {
      return "missing";
    }
    throw error;
  }
}

export async function restorePublicationOperationsBackup(
  input: RestorePublicationOperationsBackupInput,
): Promise<PublicationOperationsRestoreResult> {
  requireOfflineConfirmation(input.offlineConfirmed);
  requireIdentifier(
    input.actorId,
    "PUBLICATION_OPERATIONS_RESTORE_ACTOR_ID_INVALID",
  );
  const restoredAt = input.restoredAt ?? new Date();
  if (Number.isNaN(restoredAt.getTime())) {
    throw new PublicationOperationsBackupError(
      "PUBLICATION_OPERATIONS_RESTORE_DATE_INVALID",
    );
  }

  const snapshotRoot = resolve(input.snapshotDirectory);
  const targetRoot = resolve(input.dataDirectory, "publication-operations");
  rejectNestedPaths(snapshotRoot, targetRoot);
  const verified = await verifySnapshotInternal(snapshotRoot);
  const state = await targetState(targetRoot);
  await ensurePrivateDirectory(dirname(targetRoot));

  const stagingDirectory = `${targetRoot}.restore.${verified.manifest.snapshotId}.${process.pid}.tmp`;
  await rm(stagingDirectory, { recursive: true, force: true });
  try {
    await copyFiles(
      join(snapshotRoot, DATA_DIRECTORY_NAME),
      stagingDirectory,
      verified.manifest.files,
    );
    const restoredFiles = await scanTree(stagingDirectory);
    if (stableHash(restoredFiles) !== stableHash(verified.manifest.files)) {
      throw new PublicationOperationsBackupError(
        "PUBLICATION_OPERATIONS_RESTORE_COPY_VERIFICATION_FAILED",
      );
    }
    if (state === "empty") {
      await rm(targetRoot, { recursive: false });
    }
    await rename(stagingDirectory, targetRoot);
    await chmod(targetRoot, SNAPSHOT_DIRECTORY_MODE);
    const finalFiles = await scanTree(targetRoot);
    if (stableHash(finalFiles) !== stableHash(verified.manifest.files)) {
      throw new PublicationOperationsBackupError(
        "PUBLICATION_OPERATIONS_RESTORE_FINAL_VERIFICATION_FAILED",
      );
    }
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }

  return Object.freeze({
    status: "restored",
    snapshotId: verified.manifest.snapshotId,
    snapshotCreatedAt: verified.manifest.createdAt,
    restoredAt: restoredAt.toISOString(),
    fileCount: verified.manifest.fileCount,
    totalBytes: verified.manifest.totalBytes,
    fingerprint: verified.manifest.fingerprint,
  });
}
