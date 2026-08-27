import { Buffer } from "node:buffer";
import {
  CHAIN_SEED,
  DEFAULT_MAX_DETAILED_FINDINGS,
  DEFAULT_TARGET_CHUNK_BYTES,
  MAX_TARGET_CHUNK_BYTES,
  MIN_TARGET_CHUNK_BYTES,
  SAFE_SOURCE_ID,
  boundedFindingCollector,
  hashUtf8,
  requireHash,
  requireSafeInteger,
  requireSource,
  stableHash,
} from "./manuscript-integrity-internal.js";
import {
  MANUSCRIPT_INTEGRITY_SCHEMA_VERSION,
  type ManuscriptChunkDescriptor,
  type ManuscriptIntegrityManifest,
  type ManuscriptIntegrityVerification,
} from "./manuscript-integrity-types.js";

function countCodePoints(source: string): number {
  let count = 0;
  for (const _character of source) count += 1;
  return count;
}

function descriptorChainHash(
  previousChainHash: string,
  descriptor: Omit<ManuscriptChunkDescriptor, "chainHash">,
): string {
  return stableHash({
    schemaVersion: MANUSCRIPT_INTEGRITY_SCHEMA_VERSION,
    previousChainHash,
    ...descriptor,
  });
}

function manifestFingerprint(
  manifest: Omit<ManuscriptIntegrityManifest, "fingerprint">,
): string {
  return stableHash(manifest);
}

function verificationFingerprint(
  verification: Omit<ManuscriptIntegrityVerification, "fingerprint">,
): string {
  return stableHash(verification);
}

function freezeManifest(
  manifest: ManuscriptIntegrityManifest,
): ManuscriptIntegrityManifest {
  return Object.freeze({
    ...manifest,
    chunks: Object.freeze(manifest.chunks.map((chunk) => Object.freeze({ ...chunk }))),
  });
}

export function createManuscriptIntegrityManifest(
  source: string,
  options: Readonly<{
    sourceId?: string;
    targetChunkBytes?: number;
  }> = {},
): ManuscriptIntegrityManifest {
  requireSource(source);
  if (options.sourceId !== undefined && !SAFE_SOURCE_ID.test(options.sourceId)) {
    throw new Error("MANUSCRIPT_INTEGRITY_SOURCE_ID_INVALID");
  }
  const targetChunkBytes = requireSafeInteger(
    options.targetChunkBytes ?? DEFAULT_TARGET_CHUNK_BYTES,
    MIN_TARGET_CHUNK_BYTES,
    MAX_TARGET_CHUNK_BYTES,
    "MANUSCRIPT_INTEGRITY_CHUNK_SIZE_INVALID",
  );

  const sourceByteLength = Buffer.byteLength(source, "utf8");
  const chunks: ManuscriptChunkDescriptor[] = [];
  let chunkCodeUnitStart = 0;
  let chunkByteStart = 0;
  let chunkByteLength = 0;
  let chunkCodePointCount = 0;
  let codeUnitCursor = 0;
  let byteCursor = 0;
  let previousChainHash = hashUtf8(CHAIN_SEED);

  const finaliseChunk = (codeUnitEnd: number, byteEnd: number): void => {
    if (codeUnitEnd <= chunkCodeUnitStart) return;
    const text = source.slice(chunkCodeUnitStart, codeUnitEnd);
    const descriptorWithoutChain: Omit<ManuscriptChunkDescriptor, "chainHash"> = {
      index: chunks.length,
      codeUnitStart: chunkCodeUnitStart,
      codeUnitEnd,
      codeUnitLength: codeUnitEnd - chunkCodeUnitStart,
      byteStart: chunkByteStart,
      byteEnd,
      byteLength: byteEnd - chunkByteStart,
      codePointCount: chunkCodePointCount,
      contentHash: hashUtf8(text),
    };
    const chainHash = descriptorChainHash(previousChainHash, descriptorWithoutChain);
    chunks.push(Object.freeze({ ...descriptorWithoutChain, chainHash }));
    previousChainHash = chainHash;
  };

  while (codeUnitCursor < source.length) {
    const codePoint = source.codePointAt(codeUnitCursor);
    if (codePoint === undefined) {
      throw new Error("MANUSCRIPT_INTEGRITY_CODE_POINT_READ_FAILED");
    }
    const character = String.fromCodePoint(codePoint);
    const characterByteLength = Buffer.byteLength(character, "utf8");

    if (
      chunkCodePointCount > 0
      && chunkByteLength + characterByteLength > targetChunkBytes
    ) {
      finaliseChunk(codeUnitCursor, byteCursor);
      chunkCodeUnitStart = codeUnitCursor;
      chunkByteStart = byteCursor;
      chunkByteLength = 0;
      chunkCodePointCount = 0;
    }

    codeUnitCursor += character.length;
    byteCursor += characterByteLength;
    chunkByteLength += characterByteLength;
    chunkCodePointCount += 1;
  }

  finaliseChunk(codeUnitCursor, byteCursor);
  if (chunks.length === 0) {
    throw new Error("MANUSCRIPT_INTEGRITY_CHUNKING_FAILED");
  }

  const partial: Omit<ManuscriptIntegrityManifest, "fingerprint"> = {
    schemaVersion: MANUSCRIPT_INTEGRITY_SCHEMA_VERSION,
    ...(options.sourceId ? { sourceId: options.sourceId } : {}),
    sourceHash: hashUtf8(source),
    sourceCodeUnitLength: source.length,
    sourceCodePointCount: countCodePoints(source),
    sourceByteLength,
    targetChunkBytes,
    chunkCount: chunks.length,
    chunks: Object.freeze(chunks),
    rootChainHash: chunks.at(-1)?.chainHash ?? hashUtf8(CHAIN_SEED),
  };

  return freezeManifest({ ...partial, fingerprint: manifestFingerprint(partial) });
}

export function assertManuscriptIntegrityManifest(
  manifest: ManuscriptIntegrityManifest,
): void {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("MANUSCRIPT_INTEGRITY_MANIFEST_REQUIRED");
  }
  if (manifest.schemaVersion !== MANUSCRIPT_INTEGRITY_SCHEMA_VERSION) {
    throw new Error("MANUSCRIPT_INTEGRITY_SCHEMA_UNSUPPORTED");
  }
  if (manifest.sourceId !== undefined && !SAFE_SOURCE_ID.test(manifest.sourceId)) {
    throw new Error("MANUSCRIPT_INTEGRITY_SOURCE_ID_INVALID");
  }
  requireHash(manifest.sourceHash, "MANUSCRIPT_INTEGRITY_SOURCE_HASH_INVALID");
  requireHash(manifest.rootChainHash, "MANUSCRIPT_INTEGRITY_ROOT_HASH_INVALID");
  requireHash(manifest.fingerprint, "MANUSCRIPT_INTEGRITY_FINGERPRINT_INVALID");
  requireSafeInteger(
    manifest.sourceCodeUnitLength,
    1,
    Number.MAX_SAFE_INTEGER,
    "MANUSCRIPT_INTEGRITY_SOURCE_LENGTH_INVALID",
  );
  requireSafeInteger(
    manifest.sourceCodePointCount,
    1,
    manifest.sourceCodeUnitLength,
    "MANUSCRIPT_INTEGRITY_SOURCE_CODE_POINT_COUNT_INVALID",
  );
  requireSafeInteger(
    manifest.sourceByteLength,
    1,
    Number.MAX_SAFE_INTEGER,
    "MANUSCRIPT_INTEGRITY_SOURCE_BYTE_LENGTH_INVALID",
  );
  requireSafeInteger(
    manifest.targetChunkBytes,
    MIN_TARGET_CHUNK_BYTES,
    MAX_TARGET_CHUNK_BYTES,
    "MANUSCRIPT_INTEGRITY_CHUNK_SIZE_INVALID",
  );
  requireSafeInteger(
    manifest.chunkCount,
    1,
    Number.MAX_SAFE_INTEGER,
    "MANUSCRIPT_INTEGRITY_CHUNK_COUNT_INVALID",
  );
  if (!Array.isArray(manifest.chunks) || manifest.chunks.length !== manifest.chunkCount) {
    throw new Error("MANUSCRIPT_INTEGRITY_CHUNK_COUNT_MISMATCH");
  }

  let expectedCodeUnitStart = 0;
  let expectedByteStart = 0;
  let totalCodePoints = 0;
  let previousChainHash = hashUtf8(CHAIN_SEED);
  for (let index = 0; index < manifest.chunks.length; index += 1) {
    const chunk = manifest.chunks[index];
    if (!chunk || typeof chunk !== "object") {
      throw new Error("MANUSCRIPT_INTEGRITY_CHUNK_INVALID");
    }
    if (chunk.index !== index) {
      throw new Error("MANUSCRIPT_INTEGRITY_CHUNK_INDEX_INVALID");
    }
    if (chunk.codeUnitStart !== expectedCodeUnitStart) {
      throw new Error("MANUSCRIPT_INTEGRITY_CODE_UNIT_RANGE_NOT_CONTIGUOUS");
    }
    if (chunk.byteStart !== expectedByteStart) {
      throw new Error("MANUSCRIPT_INTEGRITY_BYTE_RANGE_NOT_CONTIGUOUS");
    }
    requireSafeInteger(
      chunk.codeUnitEnd,
      chunk.codeUnitStart + 1,
      manifest.sourceCodeUnitLength,
      "MANUSCRIPT_INTEGRITY_CHUNK_CODE_UNIT_END_INVALID",
    );
    requireSafeInteger(
      chunk.byteEnd,
      chunk.byteStart + 1,
      manifest.sourceByteLength,
      "MANUSCRIPT_INTEGRITY_CHUNK_BYTE_END_INVALID",
    );
    if (chunk.codeUnitLength !== chunk.codeUnitEnd - chunk.codeUnitStart) {
      throw new Error("MANUSCRIPT_INTEGRITY_CHUNK_CODE_UNIT_LENGTH_MISMATCH");
    }
    if (chunk.byteLength !== chunk.byteEnd - chunk.byteStart) {
      throw new Error("MANUSCRIPT_INTEGRITY_CHUNK_BYTE_LENGTH_MISMATCH");
    }
    requireSafeInteger(
      chunk.codePointCount,
      1,
      chunk.codeUnitLength,
      "MANUSCRIPT_INTEGRITY_CHUNK_CODE_POINT_COUNT_INVALID",
    );
    requireHash(chunk.contentHash, "MANUSCRIPT_INTEGRITY_CHUNK_HASH_INVALID");
    requireHash(chunk.chainHash, "MANUSCRIPT_INTEGRITY_CHAIN_HASH_INVALID");
    const { chainHash, ...descriptorWithoutChain } = chunk;
    const expectedChainHash = descriptorChainHash(
      previousChainHash,
      descriptorWithoutChain,
    );
    if (chainHash !== expectedChainHash) {
      throw new Error("MANUSCRIPT_INTEGRITY_CHAIN_HASH_MISMATCH");
    }
    previousChainHash = chainHash;
    expectedCodeUnitStart = chunk.codeUnitEnd;
    expectedByteStart = chunk.byteEnd;
    totalCodePoints += chunk.codePointCount;
  }

  if (expectedCodeUnitStart !== manifest.sourceCodeUnitLength) {
    throw new Error("MANUSCRIPT_INTEGRITY_SOURCE_LENGTH_NOT_COVERED");
  }
  if (expectedByteStart !== manifest.sourceByteLength) {
    throw new Error("MANUSCRIPT_INTEGRITY_SOURCE_BYTES_NOT_COVERED");
  }
  if (totalCodePoints !== manifest.sourceCodePointCount) {
    throw new Error("MANUSCRIPT_INTEGRITY_SOURCE_CODE_POINTS_NOT_COVERED");
  }
  if (previousChainHash !== manifest.rootChainHash) {
    throw new Error("MANUSCRIPT_INTEGRITY_ROOT_HASH_MISMATCH");
  }
  const { fingerprint, ...partial } = manifest;
  if (manifestFingerprint(partial) !== fingerprint) {
    throw new Error("MANUSCRIPT_INTEGRITY_FINGERPRINT_MISMATCH");
  }
}

export function verifyManuscriptIntegrityManifest(
  source: string,
  manifest: ManuscriptIntegrityManifest,
): ManuscriptIntegrityVerification {
  requireSource(source);
  const collector = boundedFindingCollector(DEFAULT_MAX_DETAILED_FINDINGS);
  let structureValid = true;
  try {
    assertManuscriptIntegrityManifest(manifest);
  } catch (error) {
    structureValid = false;
    collector.add({
      code: error instanceof Error
        ? error.message
        : "MANUSCRIPT_INTEGRITY_MANIFEST_INVALID",
      severity: "error",
      message: "The manuscript integrity manifest failed structural verification.",
    });
  }

  let sourceHashMatches = false;
  let verifiedChunkCount = 0;
  let verifiedByteLength = 0;
  if (structureValid) {
    const expected = createManuscriptIntegrityManifest(source, {
      ...(manifest.sourceId ? { sourceId: manifest.sourceId } : {}),
      targetChunkBytes: manifest.targetChunkBytes,
    });
    sourceHashMatches = expected.sourceHash === manifest.sourceHash;
    if (!sourceHashMatches) {
      collector.add({
        code: "MANUSCRIPT_INTEGRITY_SOURCE_HASH_MISMATCH",
        severity: "error",
        message: "The supplied manuscript source does not match the immutable source hash.",
      });
    }
    if (expected.sourceCodeUnitLength !== manifest.sourceCodeUnitLength) {
      collector.add({
        code: "MANUSCRIPT_INTEGRITY_SOURCE_LENGTH_MISMATCH",
        severity: "error",
        message: "The supplied manuscript source has a different UTF-16 code-unit length.",
      });
    }
    if (expected.sourceCodePointCount !== manifest.sourceCodePointCount) {
      collector.add({
        code: "MANUSCRIPT_INTEGRITY_SOURCE_CODE_POINT_COUNT_MISMATCH",
        severity: "error",
        message: "The supplied manuscript source has a different Unicode code-point count.",
      });
    }
    if (expected.sourceByteLength !== manifest.sourceByteLength) {
      collector.add({
        code: "MANUSCRIPT_INTEGRITY_SOURCE_BYTE_LENGTH_MISMATCH",
        severity: "error",
        message: "The supplied manuscript source has a different UTF-8 byte length.",
      });
    }
    if (expected.chunkCount !== manifest.chunkCount) {
      collector.add({
        code: "MANUSCRIPT_INTEGRITY_CHUNK_COUNT_SOURCE_MISMATCH",
        severity: "error",
        message: "The supplied manuscript source produces a different integrity chunk count.",
      });
    }

    const comparableChunks = Math.min(expected.chunkCount, manifest.chunkCount);
    for (let index = 0; index < comparableChunks; index += 1) {
      const expectedChunk = expected.chunks[index];
      const observedChunk = manifest.chunks[index];
      if (!expectedChunk || !observedChunk) continue;
      if (
        expectedChunk.codeUnitStart === observedChunk.codeUnitStart
        && expectedChunk.codeUnitEnd === observedChunk.codeUnitEnd
        && expectedChunk.byteStart === observedChunk.byteStart
        && expectedChunk.byteEnd === observedChunk.byteEnd
        && expectedChunk.codePointCount === observedChunk.codePointCount
        && expectedChunk.contentHash === observedChunk.contentHash
        && expectedChunk.chainHash === observedChunk.chainHash
      ) {
        verifiedChunkCount += 1;
        verifiedByteLength += observedChunk.byteLength;
      } else {
        collector.add({
          code: "MANUSCRIPT_INTEGRITY_CHUNK_SOURCE_MISMATCH",
          severity: "error",
          message: "The manuscript source does not match this integrity chunk and its chain position.",
          chunkIndex: index,
          sourceStart: observedChunk.codeUnitStart,
          sourceEnd: observedChunk.codeUnitEnd,
        });
      }
    }
    if (expected.rootChainHash !== manifest.rootChainHash) {
      collector.add({
        code: "MANUSCRIPT_INTEGRITY_ROOT_SOURCE_MISMATCH",
        severity: "error",
        message: "The manuscript source does not reproduce the manifest root chain hash.",
      });
    }
  }

  const omitted = collector.omitted();
  if (omitted > 0) {
    collector.findings.push(Object.freeze({
      code: "MANUSCRIPT_INTEGRITY_FINDINGS_TRUNCATED",
      severity: "error",
      message: `${omitted} additional integrity mismatches were omitted from the bounded report.`,
    }));
  }
  const findings = Object.freeze([...collector.findings]);
  const partial: Omit<ManuscriptIntegrityVerification, "fingerprint"> = {
    ok: structureValid
      && sourceHashMatches
      && verifiedChunkCount === manifest.chunkCount
      && !findings.some((finding) => finding.severity === "error"),
    structureValid,
    sourceHashMatches,
    verifiedChunkCount,
    chunkCount: structureValid ? manifest.chunkCount : 0,
    verifiedByteLength,
    findings,
  };
  return Object.freeze({ ...partial, fingerprint: verificationFingerprint(partial) });
}

export function extractVerifiedManuscriptChunk(
  source: string,
  manifest: ManuscriptIntegrityManifest,
  chunkIndex: number,
): string {
  const verification = verifyManuscriptIntegrityManifest(source, manifest);
  if (!verification.ok) {
    throw new Error("MANUSCRIPT_INTEGRITY_SOURCE_NOT_VERIFIED");
  }
  requireSafeInteger(
    chunkIndex,
    0,
    manifest.chunkCount - 1,
    "MANUSCRIPT_INTEGRITY_CHUNK_INDEX_INVALID",
  );
  const descriptor = manifest.chunks[chunkIndex];
  if (!descriptor) throw new Error("MANUSCRIPT_INTEGRITY_CHUNK_NOT_FOUND");
  return source.slice(descriptor.codeUnitStart, descriptor.codeUnitEnd);
}
