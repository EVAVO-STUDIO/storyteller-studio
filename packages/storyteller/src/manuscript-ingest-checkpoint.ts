import { Buffer } from "node:buffer";
import {
  hashUtf8,
  requireHash,
  requireSafeInteger,
  stableHash,
} from "./manuscript-integrity-internal.js";
import { assertManuscriptIntegrityManifest } from "./manuscript-integrity-manifest.js";
import {
  MANUSCRIPT_INGEST_CHECKPOINT_SCHEMA_VERSION,
  type ManuscriptIngestCheckpoint,
  type ManuscriptIntegrityManifest,
} from "./manuscript-integrity-types.js";

function checkpointFingerprint(
  checkpoint: Omit<ManuscriptIngestCheckpoint, "fingerprint">,
): string {
  return stableHash(checkpoint);
}

export function createManuscriptIngestCheckpoint(
  manifest: ManuscriptIntegrityManifest,
  now = new Date(),
): ManuscriptIngestCheckpoint {
  assertManuscriptIntegrityManifest(manifest);
  const partial: Omit<ManuscriptIngestCheckpoint, "fingerprint"> = {
    schemaVersion: MANUSCRIPT_INGEST_CHECKPOINT_SCHEMA_VERSION,
    sourceHash: manifest.sourceHash,
    manifestFingerprint: manifest.fingerprint,
    acceptedChunkHashes: Object.freeze(
      Array.from({ length: manifest.chunkCount }, () => null),
    ),
    acceptedChunkCount: 0,
    acceptedByteLength: 0,
    nextMissingChunkIndex: 0,
    complete: false,
    revision: 1,
    updatedAt: now.toISOString(),
  };
  return Object.freeze({ ...partial, fingerprint: checkpointFingerprint(partial) });
}

export function assertManuscriptIngestCheckpoint(
  manifest: ManuscriptIntegrityManifest,
  checkpoint: ManuscriptIngestCheckpoint,
): void {
  assertManuscriptIntegrityManifest(manifest);
  if (!checkpoint || typeof checkpoint !== "object") {
    throw new Error("MANUSCRIPT_INGEST_CHECKPOINT_REQUIRED");
  }
  if (checkpoint.schemaVersion !== MANUSCRIPT_INGEST_CHECKPOINT_SCHEMA_VERSION) {
    throw new Error("MANUSCRIPT_INGEST_CHECKPOINT_SCHEMA_UNSUPPORTED");
  }
  if (
    checkpoint.sourceHash !== manifest.sourceHash
    || checkpoint.manifestFingerprint !== manifest.fingerprint
  ) {
    throw new Error("MANUSCRIPT_INGEST_CHECKPOINT_LINEAGE_MISMATCH");
  }
  if (
    !Array.isArray(checkpoint.acceptedChunkHashes)
    || checkpoint.acceptedChunkHashes.length !== manifest.chunkCount
  ) {
    throw new Error("MANUSCRIPT_INGEST_CHECKPOINT_CHUNK_COUNT_MISMATCH");
  }
  requireSafeInteger(
    checkpoint.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "MANUSCRIPT_INGEST_CHECKPOINT_REVISION_INVALID",
  );
  if (Number.isNaN(Date.parse(checkpoint.updatedAt))) {
    throw new Error("MANUSCRIPT_INGEST_CHECKPOINT_TIME_INVALID");
  }

  let acceptedChunkCount = 0;
  let acceptedByteLength = 0;
  let nextMissingChunkIndex: number | null = null;
  for (let index = 0; index < checkpoint.acceptedChunkHashes.length; index += 1) {
    const acceptedHash = checkpoint.acceptedChunkHashes[index];
    if (acceptedHash === null) {
      if (nextMissingChunkIndex === null) nextMissingChunkIndex = index;
      continue;
    }
    requireHash(acceptedHash, "MANUSCRIPT_INGEST_ACCEPTED_HASH_INVALID");
    const descriptor = manifest.chunks[index];
    if (!descriptor || acceptedHash !== descriptor.contentHash) {
      throw new Error("MANUSCRIPT_INGEST_ACCEPTED_HASH_MISMATCH");
    }
    acceptedChunkCount += 1;
    acceptedByteLength += descriptor.byteLength;
  }
  if (checkpoint.acceptedChunkCount !== acceptedChunkCount) {
    throw new Error("MANUSCRIPT_INGEST_ACCEPTED_COUNT_MISMATCH");
  }
  if (checkpoint.acceptedByteLength !== acceptedByteLength) {
    throw new Error("MANUSCRIPT_INGEST_ACCEPTED_BYTES_MISMATCH");
  }
  if (checkpoint.nextMissingChunkIndex !== nextMissingChunkIndex) {
    throw new Error("MANUSCRIPT_INGEST_NEXT_CHUNK_MISMATCH");
  }
  const complete = acceptedChunkCount === manifest.chunkCount;
  if (checkpoint.complete !== complete) {
    throw new Error("MANUSCRIPT_INGEST_COMPLETION_MISMATCH");
  }
  const { fingerprint, ...partial } = checkpoint;
  if (checkpointFingerprint(partial) !== fingerprint) {
    throw new Error("MANUSCRIPT_INGEST_CHECKPOINT_FINGERPRINT_MISMATCH");
  }
}

export function acceptVerifiedManuscriptChunk(
  manifest: ManuscriptIntegrityManifest,
  checkpoint: ManuscriptIngestCheckpoint,
  input: Readonly<{
    chunkIndex: number;
    chunkText: string;
    now?: Date;
  }>,
): ManuscriptIngestCheckpoint {
  assertManuscriptIngestCheckpoint(manifest, checkpoint);
  const chunkIndex = requireSafeInteger(
    input.chunkIndex,
    0,
    manifest.chunkCount - 1,
    "MANUSCRIPT_INGEST_CHUNK_INDEX_INVALID",
  );
  const descriptor = manifest.chunks[chunkIndex];
  if (!descriptor) throw new Error("MANUSCRIPT_INGEST_CHUNK_NOT_FOUND");
  if (input.chunkText.length !== descriptor.codeUnitLength) {
    throw new Error("MANUSCRIPT_INGEST_CHUNK_CODE_UNIT_LENGTH_MISMATCH");
  }
  if (Buffer.byteLength(input.chunkText, "utf8") !== descriptor.byteLength) {
    throw new Error("MANUSCRIPT_INGEST_CHUNK_BYTE_LENGTH_MISMATCH");
  }
  const contentHash = hashUtf8(input.chunkText);
  if (contentHash !== descriptor.contentHash) {
    throw new Error("MANUSCRIPT_INGEST_CHUNK_HASH_MISMATCH");
  }
  const existing = checkpoint.acceptedChunkHashes[chunkIndex];
  if (existing === contentHash) return checkpoint;
  if (existing !== null) {
    throw new Error("MANUSCRIPT_INGEST_CHUNK_IDEMPOTENCY_CONFLICT");
  }

  const acceptedChunkHashes = [...checkpoint.acceptedChunkHashes];
  acceptedChunkHashes[chunkIndex] = contentHash;
  const acceptedChunkCount = checkpoint.acceptedChunkCount + 1;
  const acceptedByteLength = checkpoint.acceptedByteLength + descriptor.byteLength;
  const nextMissing = acceptedChunkHashes.findIndex((hash) => hash === null);
  const { fingerprint: _previousFingerprint, ...checkpointWithoutFingerprint } = checkpoint;
  const partial: Omit<ManuscriptIngestCheckpoint, "fingerprint"> = {
    ...checkpointWithoutFingerprint,
    acceptedChunkHashes: Object.freeze(acceptedChunkHashes),
    acceptedChunkCount,
    acceptedByteLength,
    nextMissingChunkIndex: nextMissing < 0 ? null : nextMissing,
    complete: acceptedChunkCount === manifest.chunkCount,
    revision: checkpoint.revision + 1,
    updatedAt: (input.now ?? new Date()).toISOString(),
  };
  return Object.freeze({ ...partial, fingerprint: checkpointFingerprint(partial) });
}
