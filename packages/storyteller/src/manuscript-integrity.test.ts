import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  acceptVerifiedManuscriptChunk,
  assertManuscriptIngestCheckpoint,
  auditManuscriptSegmentCoverage,
  createManuscriptIngestCheckpoint,
  createManuscriptIntegrityManifest,
  extractVerifiedManuscriptChunk,
  verifyManuscriptIntegrityManifest,
  type ManuscriptIntegritySegment,
} from "./manuscript-integrity.js";

function exactSegments(source: string): ManuscriptIntegritySegment[] {
  const sourceHash = createManuscriptIntegrityManifest(source).sourceHash;
  const paragraphs = [...source.matchAll(/\S(?:.|\n)*?(?=\n\n|$)/gu)];
  return paragraphs.map((match, index) => {
    const sourceStart = match.index ?? 0;
    const text = match[0];
    return {
      id: `segment_${index + 1}`,
      ordinal: index + 1,
      sourceHash,
      sourceStart,
      sourceEnd: sourceStart + text.length,
      text,
    };
  });
}

test("integrity manifests are deterministic and preserve every Unicode code point", () => {
  const source = [
    "Chapter One",
    "A lantern moved through the fog. 👩🏽‍🚀",
    "Cafe\u0301 and café remain exact source forms.",
    "海の向こうに灯りが見えた。",
  ].join("\n\n");
  const first = createManuscriptIntegrityManifest(source, {
    sourceId: "book_001_revision_003",
    targetChunkBytes: 64,
  });
  const second = createManuscriptIntegrityManifest(source, {
    sourceId: "book_001_revision_003",
    targetChunkBytes: 64,
  });

  assert.deepEqual(first, second);
  assert.equal(first.sourceCodePointCount, [...source].length);
  assert.equal(first.chunks.length > 1, true);
  const reconstructed = first.chunks
    .map((chunk) => extractVerifiedManuscriptChunk(source, first, chunk.index))
    .join("");
  assert.equal(reconstructed, source);
  assert.equal(verifyManuscriptIntegrityManifest(source, first).ok, true);
  for (let index = 1; index < first.chunks.length; index += 1) {
    assert.equal(first.chunks[index]?.codeUnitStart, first.chunks[index - 1]?.codeUnitEnd);
    assert.equal(first.chunks[index]?.byteStart, first.chunks[index - 1]?.byteEnd);
  }
});


test("integrity verification catches same-length middle-source substitution", () => {
  const source = "Alpha keeps watch.\n\nBeta carries the key.\n\nGamma closes the gate.";
  const manifest = createManuscriptIntegrityManifest(source, {
    targetChunkBytes: 64,
  });
  const changed = source.replace("key", "map");
  assert.equal(changed.length, source.length);

  const verification = verifyManuscriptIntegrityManifest(changed, manifest);
  assert.equal(verification.ok, false);
  assert.equal(verification.sourceHashMatches, false);
  assert.equal(
    verification.findings.some((finding) =>
      finding.code === "MANUSCRIPT_INTEGRITY_SOURCE_HASH_MISMATCH"
    ),
    true,
  );
  assert.equal(
    verification.findings.some((finding) =>
      finding.code === "MANUSCRIPT_INTEGRITY_CHUNK_SOURCE_MISMATCH"
    ),
    true,
  );
});

test("manifest descriptor tampering fails closed before source admission", () => {
  const source = "A source with enough text to produce chained evidence. ".repeat(4);
  const manifest = createManuscriptIntegrityManifest(source, {
    targetChunkBytes: 64,
  });
  const first = manifest.chunks[0];
  if (!first) throw new Error("TEST_CHUNK_REQUIRED");
  const tampered = {
    ...manifest,
    chunks: [
      { ...first, contentHash: "0".repeat(64) },
      ...manifest.chunks.slice(1),
    ],
  };

  const verification = verifyManuscriptIntegrityManifest(source, tampered);
  assert.equal(verification.ok, false);
  assert.equal(verification.structureValid, false);
  assert.equal(
    verification.findings.some((finding) =>
      finding.code === "MANUSCRIPT_INTEGRITY_CHAIN_HASH_MISMATCH"
    ),
    true,
  );
});

test("resumable checkpoints accept verified chunks out of order and remain idempotent", () => {
  const source = "one ".repeat(80) + "final";
  const manifest = createManuscriptIntegrityManifest(source, {
    targetChunkBytes: 64,
  });
  let checkpoint = createManuscriptIngestCheckpoint(
    manifest,
    new Date("2026-08-28T00:00:00.000Z"),
  );
  const finalIndex = manifest.chunkCount - 1;
  checkpoint = acceptVerifiedManuscriptChunk(manifest, checkpoint, {
    chunkIndex: finalIndex,
    chunkText: extractVerifiedManuscriptChunk(source, manifest, finalIndex),
    now: new Date("2026-08-28T00:01:00.000Z"),
  });
  assert.equal(checkpoint.complete, false);
  assert.equal(checkpoint.nextMissingChunkIndex, 0);
  const idempotent = acceptVerifiedManuscriptChunk(manifest, checkpoint, {
    chunkIndex: finalIndex,
    chunkText: extractVerifiedManuscriptChunk(source, manifest, finalIndex),
    now: new Date("2026-08-28T00:02:00.000Z"),
  });
  assert.equal(idempotent, checkpoint);

  for (let index = 0; index < finalIndex; index += 1) {
    checkpoint = acceptVerifiedManuscriptChunk(manifest, checkpoint, {
      chunkIndex: index,
      chunkText: extractVerifiedManuscriptChunk(source, manifest, index),
      now: new Date(`2026-08-28T00:${String(index + 3).padStart(2, "0")}:00.000Z`),
    });
  }
  assert.equal(checkpoint.complete, true);
  assert.equal(checkpoint.nextMissingChunkIndex, null);
  assert.equal(checkpoint.acceptedByteLength, manifest.sourceByteLength);
  assertManuscriptIngestCheckpoint(manifest, checkpoint);
});

test("resumable checkpoints reject damaged chunks and cross-manuscript lineage", () => {
  const source = "A complete source that spans more than one integrity chunk. ".repeat(4);
  const manifest = createManuscriptIntegrityManifest(source, {
    targetChunkBytes: 64,
  });
  const checkpoint = createManuscriptIngestCheckpoint(manifest);
  const chunk = extractVerifiedManuscriptChunk(source, manifest, 0);
  const damaged = `${chunk.slice(0, -1)}x`;
  assert.throws(
    () => acceptVerifiedManuscriptChunk(manifest, checkpoint, {
      chunkIndex: 0,
      chunkText: damaged,
    }),
    /MANUSCRIPT_INGEST_CHUNK_HASH_MISMATCH/u,
  );

  const otherManifest = createManuscriptIntegrityManifest(`${source}different`, {
    targetChunkBytes: 64,
  });
  assert.throws(
    () => assertManuscriptIngestCheckpoint(otherManifest, checkpoint),
    /MANUSCRIPT_INGEST_CHECKPOINT_LINEAGE_MISMATCH/u,
  );
});

test("coverage audit catches an omitted middle passage even when the final word remains", () => {
  const source = "Alpha keeps watch.\n\nBeta carries the key.\n\nGamma closes the gate.";
  const complete = exactSegments(source);
  const incomplete = [complete[0], complete[2]].filter(
    (segment): segment is ManuscriptIntegritySegment => Boolean(segment),
  );

  const report = auditManuscriptSegmentCoverage(source, incomplete);
  assert.equal(report.ok, false);
  assert.equal(report.finalWordCovered, true);
  assert.equal(report.missingWordCount > 0, true);
  assert.equal(report.wordCoverage < 1, true);
  assert.equal(
    report.findings.some((finding) =>
      finding.code === "MANUSCRIPT_SEGMENT_GAP_NON_WHITESPACE"
    ),
    true,
  );
});

test("coverage audit permits separator whitespace by default and supports strict byte-for-byte mode", () => {
  const source = "Chapter One\n\nFirst paragraph.\n\nSecond paragraph.";
  const segments = exactSegments(source);
  const normal = auditManuscriptSegmentCoverage(source, segments);
  assert.equal(normal.ok, true);
  assert.equal(normal.wordCoverage, 1);
  assert.equal(normal.nonWhitespaceCoverage, 1);
  assert.equal(normal.exactSourceCoverage, false);
  assert.equal(normal.whitespaceGapCount, 2);

  const strict = auditManuscriptSegmentCoverage(source, segments, {
    requireWhitespaceCoverage: true,
  });
  assert.equal(strict.ok, false);
  assert.equal(
    strict.findings.some((finding) =>
      finding.code === "MANUSCRIPT_SEGMENT_GAP_WHITESPACE"
    ),
    true,
  );
});

test("coverage audit rejects source drift, text drift, overlaps and ordering drift", () => {
  const source = "One sentence.\n\nTwo sentence.";
  const segments = exactSegments(source);
  const first = segments[0];
  const second = segments[1];
  if (!first || !second) throw new Error("TEST_SEGMENTS_REQUIRED");
  const invalid: ManuscriptIntegritySegment[] = [
    {
      ...second,
      ordinal: 1,
    },
    {
      ...first,
      ordinal: 1,
      sourceHash: "0".repeat(64),
      sourceEnd: first.sourceEnd + 2,
      text: `${first.text}\n\n`,
    },
  ];

  const report = auditManuscriptSegmentCoverage(source, invalid);
  const codes = new Set(report.findings.map((finding) => finding.code));
  assert.equal(report.ok, false);
  assert.equal(codes.has("MANUSCRIPT_SEGMENT_SOURCE_ORDER_INVALID"), true);
  assert.equal(codes.has("MANUSCRIPT_SEGMENT_ORDINAL_DUPLICATE"), true);
  assert.equal(codes.has("MANUSCRIPT_SEGMENT_ORDINAL_OUT_OF_ORDER"), true);
  assert.equal(codes.has("MANUSCRIPT_SEGMENT_SOURCE_HASH_MISMATCH"), true);
});


test("manuscript integrity remains exported and documented as a permanent contract", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { exports?: Record<string, string> };
  assert.equal(
    packageJson.exports?.["./manuscript-integrity"],
    "./src/manuscript-integrity.ts",
  );
  assert.equal(
    packageJson.exports?.["./manuscript-pipeline"],
    "./src/manuscript-pipeline.ts",
  );

  const documentation = await readFile(
    new URL("../../../docs/MANUSCRIPT_INTEGRITY.md", import.meta.url),
    "utf8",
  );
  for (const token of [
    "Whole-source identity",
    "Resumable intake",
    "Complete production coverage",
    "A valid final word is not enough",
    "checkpoint stores hashes",
    "Preferred intake entry point",
    "segmentManuscriptWithIntegrity",
  ]) {
    assert.equal(documentation.includes(token), true, `missing documentation token: ${token}`);
  }

  const readme = await readFile(
    new URL("../../../README.md", import.meta.url),
    "utf8",
  );
  assert.equal(readme.includes("Lossless manuscript integrity"), true);
  assert.equal(readme.includes("every word and non-whitespace source span"), true);
  assert.equal(readme.includes("Integrity-checked segmentation"), true);
});
