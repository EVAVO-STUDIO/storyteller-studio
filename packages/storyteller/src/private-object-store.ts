import { createHash, randomBytes } from "node:crypto";
import {
  constants as fileConstants,
  copyFile,
  link,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { stableHash } from "./index.js";
import type {
  ArtifactIntegrity,
  ArtifactStorageReference,
} from "./artifact-registry.js";

export const PRIVATE_OBJECT_STAGE_SCHEMA_VERSION = "storyteller-private-object-stage-v1" as const;
export const PRIVATE_OBJECT_SCHEMA_VERSION = "storyteller-private-object-v1" as const;

export interface DetectedArtifactMedia {
  mimeType: string;
  format: string;
  signature: string;
}

export interface StagedPrivateObject {
  schemaVersion: typeof PRIVATE_OBJECT_STAGE_SCHEMA_VERSION;
  stagingId: string;
  objectKey: string;
  contentHash: string;
  byteCount: number;
  mimeType: string;
  format: string;
  signature: string;
  createdAt: string;
  fingerprint: string;
}

export interface FinalPrivateObject {
  schemaVersion: typeof PRIVATE_OBJECT_SCHEMA_VERSION;
  storage: ArtifactStorageReference;
  integrity: ArtifactIntegrity;
  signature: string;
  deduplicated: boolean;
  finalisedAt: string;
  fingerprint: string;
}

export interface FilePrivateObjectStoreOptions {
  provider?: string;
  container?: string;
  region?: string;
  maximumBytes?: number;
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const SAFE_STORAGE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{1,239}$/u;
const STAGING_ID_PATTERN = /^stage_[A-Za-z0-9_-]{32}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const MIME_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;
const FORMAT_PATTERN = /^[a-z0-9][a-z0-9._+-]{0,31}$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const DEFAULT_MAXIMUM_BYTES = 512 * 1024 * 1024;
const ABSOLUTE_MAXIMUM_BYTES = 4 * 1024 * 1024 * 1024;

const FORMAT_EXTENSION: Readonly<Record<string, string>> = Object.freeze({
  wav: "wav",
  flac: "flac",
  mp3: "mp3",
  png: "png",
  jpeg: "jpg",
  webp: "webp",
  json: "json",
  vtt: "vtt",
  txt: "txt",
  zip: "zip",
});

function startsWith(bytes: Uint8Array, expected: readonly number[], offset = 0): boolean {
  if (bytes.byteLength < offset + expected.length) return false;
  return expected.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function decodeText(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function detectStructuredText(bytes: Uint8Array): DetectedArtifactMedia | null {
  const text = decodeText(bytes);
  if (text === null || CONTROL_CHARACTER_PATTERN.test(text)) return null;
  const trimmed = text.replace(/^\uFEFF/u, "").trimStart();
  if (trimmed.startsWith("WEBVTT")) {
    return { mimeType: "text/vtt", format: "vtt", signature: "webvtt-header" };
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return { mimeType: "application/json", format: "json", signature: "utf8-json" };
    } catch {
      throw new Error("PRIVATE_OBJECT_JSON_INVALID");
    }
  }
  return { mimeType: "text/plain", format: "txt", signature: "utf8-text" };
}

export function detectArtifactMedia(bytes: Uint8Array): DetectedArtifactMedia {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new Error("PRIVATE_OBJECT_BYTES_REQUIRED");
  }

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mimeType: "image/png", format: "png", signature: "png-signature" };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { mimeType: "image/jpeg", format: "jpeg", signature: "jpeg-soi" };
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return { mimeType: "image/webp", format: "webp", signature: "riff-webp" };
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE") {
    return { mimeType: "audio/wav", format: "wav", signature: "riff-wave" };
  }
  if (ascii(bytes, 0, 4) === "fLaC") {
    return { mimeType: "audio/flac", format: "flac", signature: "flac-marker" };
  }
  if (
    ascii(bytes, 0, 3) === "ID3"
    || (bytes.byteLength >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)
  ) {
    return { mimeType: "audio/mpeg", format: "mp3", signature: "mpeg-audio" };
  }
  if (
    startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
    || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])
    || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])
  ) {
    return { mimeType: "application/zip", format: "zip", signature: "zip-marker" };
  }

  const structuredText = detectStructuredText(bytes);
  if (structuredText) return structuredText;
  throw new Error("PRIVATE_OBJECT_MEDIA_SIGNATURE_UNSUPPORTED");
}

function contentHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

function assertContained(path: string, parent: string): void {
  const normalisedParent = parent.endsWith(sep) ? parent : `${parent}${sep}`;
  if (path !== parent && !path.startsWith(normalisedParent)) {
    throw new Error("PRIVATE_OBJECT_PATH_ESCAPE_DETECTED");
  }
}

function validateObjectKey(value: string): string {
  if (
    !value
    || value.length > 1_024
    || value.startsWith("/")
    || value.startsWith("\\")
    || value.includes("\\")
    || value.includes("?")
    || value.includes("#")
    || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value)
    || value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error("PRIVATE_OBJECT_KEY_INVALID");
  }
  return value;
}

function stageFingerprint(value: Omit<StagedPrivateObject, "fingerprint">): string {
  return stableHash(value);
}

function finalFingerprint(value: Omit<FinalPrivateObject, "fingerprint">): string {
  return stableHash(value);
}

function assertStage(value: StagedPrivateObject): void {
  if (value.schemaVersion !== PRIVATE_OBJECT_STAGE_SCHEMA_VERSION) {
    throw new Error("PRIVATE_OBJECT_STAGE_SCHEMA_UNSUPPORTED");
  }
  if (!STAGING_ID_PATTERN.test(value.stagingId)) throw new Error("PRIVATE_OBJECT_STAGE_ID_INVALID");
  validateObjectKey(value.objectKey);
  if (!HASH_PATTERN.test(value.contentHash)) throw new Error("PRIVATE_OBJECT_STAGE_HASH_INVALID");
  if (!Number.isSafeInteger(value.byteCount) || value.byteCount < 1) {
    throw new Error("PRIVATE_OBJECT_STAGE_SIZE_INVALID");
  }
  if (!MIME_PATTERN.test(value.mimeType)) throw new Error("PRIVATE_OBJECT_STAGE_MIME_INVALID");
  if (!FORMAT_PATTERN.test(value.format)) throw new Error("PRIVATE_OBJECT_STAGE_FORMAT_INVALID");
  if (Number.isNaN(new Date(value.createdAt).getTime())) throw new Error("PRIVATE_OBJECT_STAGE_DATE_INVALID");
  const { fingerprint, ...partial } = value;
  if (stageFingerprint(partial) !== fingerprint) throw new Error("PRIVATE_OBJECT_STAGE_FINGERPRINT_MISMATCH");
}

async function fileObservation(path: string): Promise<Readonly<{
  bytes: Uint8Array;
  contentHash: string;
  byteCount: number;
  media: DetectedArtifactMedia;
}>> {
  const buffer = await readFile(path);
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return {
    bytes,
    contentHash: contentHash(bytes),
    byteCount: bytes.byteLength,
    media: detectArtifactMedia(bytes),
  };
}

export class FilePrivateObjectStore {
  readonly #root: string;
  readonly #stagingRoot: string;
  readonly #objectsRoot: string;
  readonly #provider: string;
  readonly #container: string;
  readonly #region?: string;
  readonly #maximumBytes: number;

  constructor(rootDirectory: string, options: FilePrivateObjectStoreOptions = {}) {
    if (!rootDirectory.trim()) throw new Error("PRIVATE_OBJECT_ROOT_REQUIRED");
    this.#root = resolve(rootDirectory);
    this.#stagingRoot = resolve(this.#root, "staging");
    this.#objectsRoot = resolve(this.#root, "objects");
    assertContained(this.#stagingRoot, this.#root);
    assertContained(this.#objectsRoot, this.#root);

    this.#provider = options.provider ?? "storyteller-local-private-store";
    this.#container = options.container ?? "storyteller-private-artifacts";
    if (!SAFE_STORAGE_LABEL.test(this.#provider)) throw new Error("PRIVATE_OBJECT_PROVIDER_INVALID");
    if (!SAFE_STORAGE_LABEL.test(this.#container)) throw new Error("PRIVATE_OBJECT_CONTAINER_INVALID");
    if (options.region !== undefined && !SAFE_STORAGE_LABEL.test(options.region)) {
      throw new Error("PRIVATE_OBJECT_REGION_INVALID");
    }
    this.#region = options.region;
    this.#maximumBytes = options.maximumBytes ?? DEFAULT_MAXIMUM_BYTES;
    if (
      !Number.isSafeInteger(this.#maximumBytes)
      || this.#maximumBytes < 1
      || this.#maximumBytes > ABSOLUTE_MAXIMUM_BYTES
    ) {
      throw new Error("PRIVATE_OBJECT_MAXIMUM_BYTES_INVALID");
    }
  }

  async initialise(): Promise<void> {
    await mkdir(this.#stagingRoot, { recursive: true, mode: 0o700 });
    await mkdir(this.#objectsRoot, { recursive: true, mode: 0o700 });
  }

  async stage(input: Readonly<{
    bytes: Uint8Array;
    claimedMimeType?: string;
    claimedFormat?: string;
    now?: Date;
  }>): Promise<StagedPrivateObject> {
    await this.initialise();
    if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0) {
      throw new Error("PRIVATE_OBJECT_BYTES_REQUIRED");
    }
    if (input.bytes.byteLength > this.#maximumBytes) throw new Error("PRIVATE_OBJECT_SIZE_LIMIT_EXCEEDED");
    const media = detectArtifactMedia(input.bytes);
    const claimedMimeType = input.claimedMimeType?.trim().toLocaleLowerCase("en-AU");
    const claimedFormat = input.claimedFormat?.trim().toLocaleLowerCase("en-AU");
    if (claimedMimeType && claimedMimeType !== media.mimeType) {
      throw new Error("PRIVATE_OBJECT_CLAIMED_MIME_MISMATCH");
    }
    if (claimedFormat && claimedFormat !== media.format) {
      throw new Error("PRIVATE_OBJECT_CLAIMED_FORMAT_MISMATCH");
    }
    const hash = contentHash(input.bytes);
    const extension = FORMAT_EXTENSION[media.format];
    if (!extension) throw new Error("PRIVATE_OBJECT_FORMAT_EXTENSION_MISSING");
    const stagingId = `stage_${randomBytes(24).toString("base64url")}`;
    const objectKey = validateObjectKey(
      `sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.${extension}`,
    );
    const path = this.#stagePath(stagingId);
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(input.bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }

    try {
      const observed = await fileObservation(path);
      if (observed.contentHash !== hash || observed.byteCount !== input.bytes.byteLength) {
        throw new Error("PRIVATE_OBJECT_STAGE_WRITE_MISMATCH");
      }
      if (observed.media.mimeType !== media.mimeType || observed.media.format !== media.format) {
        throw new Error("PRIVATE_OBJECT_STAGE_MEDIA_MISMATCH");
      }
      const partial: Omit<StagedPrivateObject, "fingerprint"> = {
        schemaVersion: PRIVATE_OBJECT_STAGE_SCHEMA_VERSION,
        stagingId,
        objectKey,
        contentHash: hash,
        byteCount: input.bytes.byteLength,
        mimeType: media.mimeType,
        format: media.format,
        signature: media.signature,
        createdAt: (input.now ?? new Date()).toISOString(),
      };
      return { ...partial, fingerprint: stageFingerprint(partial) };
    } catch (error) {
      await rm(path, { force: true });
      throw error;
    }
  }

  async promote(staged: StagedPrivateObject, now = new Date()): Promise<FinalPrivateObject> {
    await this.initialise();
    assertStage(staged);
    const stagePath = this.#stagePath(staged.stagingId);
    const observed = await fileObservation(stagePath);
    this.#assertMatchesStage(staged, observed);
    const targetPath = this.#objectPath(staged.objectKey);
    await mkdir(dirname(targetPath), { recursive: true, mode: 0o700 });

    let deduplicated = false;
    try {
      const existing = await fileObservation(targetPath);
      this.#assertMatchesStage(staged, existing, "PRIVATE_OBJECT_CONTENT_ADDRESS_COLLISION");
      deduplicated = true;
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
      try {
        await link(stagePath, targetPath);
      } catch (linkError) {
        if (errorCode(linkError) === "EEXIST") {
          const raced = await fileObservation(targetPath);
          this.#assertMatchesStage(staged, raced, "PRIVATE_OBJECT_CONTENT_ADDRESS_COLLISION");
          deduplicated = true;
        } else if (["EPERM", "EXDEV", "ENOSYS", "ENOTSUP"].includes(errorCode(linkError) ?? "")) {
          const temporaryTarget = `${targetPath}.${staged.stagingId}.tmp`;
          await copyFile(stagePath, temporaryTarget, fileConstants.COPYFILE_EXCL);
          const copied = await fileObservation(temporaryTarget);
          this.#assertMatchesStage(staged, copied, "PRIVATE_OBJECT_COPY_VERIFICATION_FAILED");
          try {
            await rename(temporaryTarget, targetPath);
          } catch (renameError) {
            await rm(temporaryTarget, { force: true });
            if (errorCode(renameError) !== "EEXIST") throw renameError;
            const raced = await fileObservation(targetPath);
            this.#assertMatchesStage(staged, raced, "PRIVATE_OBJECT_CONTENT_ADDRESS_COLLISION");
            deduplicated = true;
          }
        } else {
          throw linkError;
        }
      }
    }

    const finalObservation = await fileObservation(targetPath);
    this.#assertMatchesStage(staged, finalObservation, "PRIVATE_OBJECT_FINAL_VERIFICATION_FAILED");
    await rm(stagePath, { force: true });
    const partial: Omit<FinalPrivateObject, "fingerprint"> = {
      schemaVersion: PRIVATE_OBJECT_SCHEMA_VERSION,
      storage: {
        driver: "local-private-file",
        provider: this.#provider,
        container: this.#container,
        objectKey: staged.objectKey,
        versionId: staged.contentHash,
        ...(this.#region ? { region: this.#region } : {}),
      },
      integrity: {
        algorithm: "sha256",
        contentHash: staged.contentHash,
        byteCount: staged.byteCount,
        mimeType: staged.mimeType,
        format: staged.format,
      },
      signature: staged.signature,
      deduplicated,
      finalisedAt: now.toISOString(),
    };
    return { ...partial, fingerprint: finalFingerprint(partial) };
  }

  async inspect(objectKey: string): Promise<FinalPrivateObject> {
    await this.initialise();
    const checkedKey = validateObjectKey(objectKey);
    const observed = await fileObservation(this.#objectPath(checkedKey));
    const partial: Omit<FinalPrivateObject, "fingerprint"> = {
      schemaVersion: PRIVATE_OBJECT_SCHEMA_VERSION,
      storage: {
        driver: "local-private-file",
        provider: this.#provider,
        container: this.#container,
        objectKey: checkedKey,
        versionId: observed.contentHash,
        ...(this.#region ? { region: this.#region } : {}),
      },
      integrity: {
        algorithm: "sha256",
        contentHash: observed.contentHash,
        byteCount: observed.byteCount,
        mimeType: observed.media.mimeType,
        format: observed.media.format,
      },
      signature: observed.media.signature,
      deduplicated: true,
      finalisedAt: new Date((await stat(this.#objectPath(checkedKey))).mtimeMs).toISOString(),
    };
    return { ...partial, fingerprint: finalFingerprint(partial) };
  }

  async discard(staged: StagedPrivateObject): Promise<void> {
    assertStage(staged);
    await rm(this.#stagePath(staged.stagingId), { force: true });
  }

  #stagePath(stagingId: string): string {
    if (!STAGING_ID_PATTERN.test(stagingId)) throw new Error("PRIVATE_OBJECT_STAGE_ID_INVALID");
    const path = resolve(this.#stagingRoot, `${stagingId}.part`);
    assertContained(path, this.#stagingRoot);
    return path;
  }

  #objectPath(objectKey: string): string {
    const path = resolve(this.#objectsRoot, validateObjectKey(objectKey));
    assertContained(path, this.#objectsRoot);
    return path;
  }

  #assertMatchesStage(
    staged: StagedPrivateObject,
    observed: Readonly<{
      contentHash: string;
      byteCount: number;
      media: DetectedArtifactMedia;
    }>,
    code = "PRIVATE_OBJECT_STAGE_TAMPERED",
  ): void {
    if (
      observed.contentHash !== staged.contentHash
      || observed.byteCount !== staged.byteCount
      || observed.media.mimeType !== staged.mimeType
      || observed.media.format !== staged.format
    ) {
      throw new Error(code);
    }
  }
}
