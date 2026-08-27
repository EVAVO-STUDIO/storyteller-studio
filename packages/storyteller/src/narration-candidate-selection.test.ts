import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertNarrationCandidateEvidence,
  createNarrationCandidateEvidence,
  type NarrationCandidateEvidence,
} from "./narration-candidate-evidence.js";
import {
  assertNarrationCandidateSelection,
  createNarrationCandidateSelection,
  narrationCandidateSelectionPublicView,
} from "./narration-candidate-selection.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);
const HASH_E = "e".repeat(64);
const HASH_F = "f".repeat(64);

function indexedHash(index: number, offset: number): string {
  return ((index + offset) % 10).toString().repeat(64);
}

function candidate(
  candidateIndex: number,
  score: number,
  overrides: Partial<Parameters<typeof createNarrationCandidateEvidence>[0]> = {},
): NarrationCandidateEvidence {
  return createNarrationCandidateEvidence({
    candidateIndex,
    projectId: "project_selection_001",
    segmentId: "segment_selection_001",
    takeId: `take_selection_${candidateIndex}`,
    audioArtifactId: `artifact_selection_${candidateIndex}`,
    audioArtifactFingerprint: indexedHash(candidateIndex, 1),
    audioContentHash: indexedHash(candidateIndex, 2),
    audioByteCount: 48_000 + candidateIndex,
    sourceContentHash: HASH_A,
    generationRequestHash: indexedHash(candidateIndex, 3),
    engineeringEvidenceFingerprint: indexedHash(candidateIndex, 4),
    expressiveRoleBindingFingerprint: HASH_B,
    expressivePerformancePlanFingerprint: HASH_C,
    expressiveObservationFingerprint: indexedHash(candidateIndex, 5),
    expressiveReviewFingerprint: indexedHash(candidateIndex, 6),
    providerId: "audio-studio-local",
    rightsFingerprint: HASH_D,
    createdByActorId: "worker_selection_fixture",
    verifiedByActorId: "verifier_selection_fixture",
    durationMs: 12_000,
    scores: {
      naturalness: score,
      emotionalTruth: score,
      cadence: score,
      roleFidelity: score,
      identityStability: score,
      sustainedListenability: score,
    },
    reviewerIds: ["reviewer_a", "reviewer_b", "reviewer_c"],
    ...overrides,
  });
}

function selectionInput(
  candidates: readonly NarrationCandidateEvidence[],
  selectedTakeId = "take_selection_1",
) {
  return {
    id: "selection_segment_001",
    candidates,
    selectedTakeId,
    selectedByActorId: "selector_multimodel",
    selectedAt: new Date("2026-08-27T03:00:00.000Z"),
    finalConfirmationId: "confirmation_segment_001",
    approvedByActorId: "human_director",
    approvedAt: new Date("2026-08-27T03:01:00.000Z"),
  };
}

test("matched blind comparative evidence selects only the top exact candidate", () => {
  const candidates = [candidate(2, 4.6), candidate(0, 4.5), candidate(1, 4.8)];
  const selection = createNarrationCandidateSelection(selectionInput(candidates));

  assertNarrationCandidateSelection(selection);
  assert.deepEqual(selection.candidates.map((value) => value.candidateIndex), [0, 1, 2]);
  assert.equal(selection.selectedCandidateIndex, 1);
  assert.equal(selection.selectedTakeId, "take_selection_1");
  assert.equal(selection.selectedCompositeScore, 4.8);
  assert.equal(selection.humanListeningApproval, true);
  assert.equal(selection.titleReleaseAuthority, false);
  assert.equal(selection.publicationAuthority, false);
  assert.match(selection.fingerprint, /^[a-f0-9]{64}$/u);
});

test("selection fails closed when a lower-rated candidate is chosen", () => {
  const candidates = [candidate(0, 4.5), candidate(1, 4.8), candidate(2, 4.6)];
  assert.throws(
    () => createNarrationCandidateSelection(
      selectionInput(candidates, "take_selection_0"),
    ),
    /NARRATION_SELECTION_SELECTED_CANDIDATE_NOT_TOP_RATED/u,
  );
});

test("all candidates must use the same comparative reviewer panel", () => {
  const candidates = [
    candidate(0, 4.5),
    candidate(1, 4.8),
    candidate(2, 4.6, {
      reviewerIds: ["reviewer_a", "reviewer_b", "reviewer_other"],
    }),
  ];
  assert.throws(
    () => createNarrationCandidateSelection(selectionInput(candidates)),
    /NARRATION_SELECTION_REVIEW_PANEL_MISMATCH/u,
  );
});

test("candidate indices remain the exact zero-based generation sequence", () => {
  const candidates = [candidate(0, 4.5), candidate(1, 4.8), candidate(3, 4.6)];
  assert.throws(
    () => createNarrationCandidateSelection(selectionInput(candidates)),
    /NARRATION_SELECTION_CANDIDATE_INDEX_SEQUENCE_INVALID/u,
  );
});

test("duplicate audio or generation request identities cannot masquerade as distinct candidates", () => {
  const first = candidate(0, 4.5);
  const candidates = [
    first,
    candidate(1, 4.8),
    candidate(2, 4.6, {
      audioContentHash: first.audioContentHash,
      generationRequestHash: first.generationRequestHash,
    }),
  ];
  assert.throws(
    () => createNarrationCandidateSelection(selectionInput(candidates)),
    /NARRATION_SELECTION_CANDIDATE_DUPLICATE/u,
  );
});

test("candidate evidence and final selection fingerprints fail closed on tampering", () => {
  const evidence = candidate(0, 4.7);
  assert.doesNotThrow(() => assertNarrationCandidateEvidence(evidence));
  assert.throws(
    () => assertNarrationCandidateEvidence({
      ...evidence,
      audioContentHash: HASH_E,
    }),
    /NARRATION_SELECTION_EVIDENCE_FINGERPRINT_INVALID/u,
  );

  const selection = createNarrationCandidateSelection(selectionInput([
    candidate(0, 4.5),
    candidate(1, 4.8),
    candidate(2, 4.6),
  ]));
  assert.throws(
    () => assertNarrationCandidateSelection({
      ...selection,
      selectedAudioContentHash: HASH_F,
    }),
    /NARRATION_SELECTION_FINGERPRINT_INVALID/u,
  );
});

test("final human confirmation is separate from automated selection", () => {
  const candidates = [candidate(0, 4.5), candidate(1, 4.8), candidate(2, 4.6)];
  assert.throws(
    () => createNarrationCandidateSelection({
      ...selectionInput(candidates),
      approvedByActorId: "automation_release",
    }),
    /NARRATION_SELECTION_APPROVER_INVALID/u,
  );
  assert.throws(
    () => createNarrationCandidateSelection({
      ...selectionInput(candidates),
      approvedByActorId: "selector_multimodel",
    }),
    /NARRATION_SELECTION_APPROVER_SEPARATION_REQUIRED/u,
  );
});

test("public view exposes decision state without private artifact identities", () => {
  const selection = createNarrationCandidateSelection(selectionInput([
    candidate(0, 4.5),
    candidate(1, 4.8),
    candidate(2, 4.6),
  ]));
  const view = narrationCandidateSelectionPublicView(selection);
  const serialised = JSON.stringify(view);

  assert.equal(view.candidateCount, 3);
  assert.equal(view.reviewerCount, 3);
  assert.equal(view.selectedCandidateIndex, 1);
  for (const forbidden of [
    selection.selectedTakeId,
    selection.selectedAudioArtifactId,
    selection.selectedAudioArtifactFingerprint,
    selection.selectedAudioContentHash,
    selection.sourceContentHash,
    selection.rightsFingerprint,
    selection.finalConfirmationId,
    selection.approvedByActorId,
  ]) assert.equal(serialised.includes(forbidden), false);
});

test("package surface exports the governed candidate-selection path", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { exports?: Record<string, string> };
  assert.equal(
    packageJson.exports?.["./narration-candidate-evidence"],
    "./src/narration-candidate-evidence.ts",
  );
  assert.equal(
    packageJson.exports?.["./narration-candidate-selection"],
    "./src/narration-candidate-selection.ts",
  );
  assert.equal(
    packageJson.exports?.["./reviewed-chapter-assembly"],
    "./src/reviewed-chapter-assembly.ts",
  );
});
