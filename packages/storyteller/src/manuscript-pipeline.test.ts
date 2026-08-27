import assert from "node:assert/strict";
import test from "node:test";
import { segmentManuscriptWithIntegrity } from "./manuscript-pipeline.js";

test("integrity checked segmentation binds the core segmenter to whole-source proof", () => {
  const source = [
    "Chapter One",
    "The first witness waited beside the river.",
    "The second witness carried the sealed letter.",
  ].join("\n\n");
  const result = segmentManuscriptWithIntegrity(source, {
    projectId: "project_integrity_001",
    sourceId: "manuscript_revision_001",
    maximumCharacters: 240,
    targetChunkBytes: 64,
  });

  assert.equal(result.verification.ok, true);
  assert.equal(result.coverage.ok, true);
  assert.equal(result.coverage.wordCoverage, 1);
  assert.equal(result.coverage.nonWhitespaceCoverage, 1);
  assert.equal(result.manuscript.sourceHash, result.integrity.sourceHash);
  assert.match(result.fingerprint, /^[a-f0-9]{64}$/u);
});
