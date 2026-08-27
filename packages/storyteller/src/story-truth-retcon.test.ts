import assert from "node:assert/strict";
import test from "node:test";
import { stableHash } from "./index.js";
import {
  applyStoryTruthRetcon,
  createStoryTruthEvidenceReference,
  createStoryTruthLedger,
  storyTruthFactsAt,
  verifyStoryTruthLedger,
  type StoryTruthLedger,
} from "./story-truth-ledger.js";
import {
  SOURCE,
  createInput,
  evidence,
  manuscript,
} from "./story-truth-test-fixtures.js";

test("controlled retcons are append-only, approved and linked to the facts they replace", () => {
  const ledger = createStoryTruthLedger(createInput(), new Date("2026-08-28T00:00:00.000Z"));
  assert.throws(
    () => createStoryTruthEvidenceReference(manuscript(), `${SOURCE} changed`, { sourceStart: 0, sourceEnd: 5 }),
    /STORY_TRUTH_EVIDENCE_SOURCE_MISMATCH/u,
  );
  assert.throws(
    () => applyStoryTruthRetcon(ledger, {
      id: "retcon_short",
      targetFactIds: ["fact_alice_location"],
      rationale: "change",
      approvedBy: "editor_001",
      decisionEvidenceHash: stableHash("decision"),
    }),
    /STORY_TRUTH_RETCON_RATIONALE_INVALID/u,
  );

  assert.throws(
    () => applyStoryTruthRetcon(ledger, {
      id: "retcon_time_regression",
      targetFactIds: ["fact_alice_location"],
      rationale: "This otherwise valid change was approved before the current ledger revision.",
      approvedBy: "editor_001",
      approvedAt: new Date("2026-08-27T23:59:59.000Z"),
      decisionEvidenceHash: stableHash("decision"),
    }),
    /STORY_TRUTH_RETCON_TIME_REGRESSION/u,
  );

  const revised = applyStoryTruthRetcon(ledger, {
    id: "retcon_001",
    targetFactIds: ["fact_alice_location"],
    replacements: [{
      id: "fact_alice_location_corrected",
      bookId: "book_001",
      subjectEntityId: "entity_alice",
      predicate: "location.current",
      object: { kind: "literal", value: "Geelong" },
      cardinality: "one",
      polarity: "asserted",
      authority: "approved-canon",
      confidence: 1,
      validFromWorldOrder: 10,
      assertedAtEventId: "event_arrival",
      evidence: [evidence()],
    }],
    rationale: "The author approved Geelong as the canonical destination.",
    approvedBy: "editor_001",
    approvedAt: new Date("2026-08-28T01:00:00.000Z"),
    decisionEvidenceHash: stableHash("signed editorial decision"),
  });

  assert.equal(revised.revision, 2);
  assert.equal(revised.previousFingerprint, ledger.fingerprint);
  assert.notEqual(revised.fingerprint, ledger.fingerprint);
  assert.equal(revised.retcons.length, 1);
  assert.equal(revised.facts.find((fact) => fact.id === "fact_alice_location")?.status, "superseded");
  const replacement = revised.facts.find((fact) => fact.id === "fact_alice_location_corrected");
  assert.equal(replacement?.status, "canonical");
  assert.deepEqual(replacement?.supersedesFactIds, ["fact_alice_location"]);
  assert.equal(storyTruthFactsAt(revised, {
    worldOrder: 10,
    subjectEntityId: "entity_alice",
    predicate: "location.current",
  })[0]?.id, "fact_alice_location_corrected");
  assert.equal(verifyStoryTruthLedger(revised).ok, true);

  const revisionWithoutLineage = {
    ...revised,
    previousFingerprint: undefined,
  } as unknown as StoryTruthLedger;
  assert.equal(
    verifyStoryTruthLedger(revisionWithoutLineage).findings.some(
      (finding) => finding.code === "STORY_TRUTH_PREVIOUS_FINGERPRINT_REQUIRED",
    ),
    true,
  );

  const replacementWithoutRetconLink = {
    ...revised,
    facts: revised.facts.map((fact) => fact.id === "fact_alice_location_corrected"
      ? { ...fact, supersedesFactIds: [] }
      : fact),
  } as unknown as StoryTruthLedger;
  assert.equal(
    verifyStoryTruthLedger(replacementWithoutRetconLink).findings.some(
      (finding) => finding.code === "STORY_TRUTH_RETCON_REPLACEMENT_STATE_INVALID",
    ),
    true,
  );
});
