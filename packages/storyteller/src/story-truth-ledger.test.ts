import assert from "node:assert/strict";
import test from "node:test";
import { stableHash } from "./index.js";
import {
  StoryTruthValidationError,
  analyseStoryTruthContradictions,
  createStoryTruthLedger,
  resolveStoryTruthEntity,
  storyTruthFactsAt,
  storyTruthPublicView,
  verifyStoryTruthLedger,
} from "./story-truth-ledger.js";
import {
  SOURCE,
  arrivalEvent,
  createInput,
  entities,
  locationFact,
} from "./story-truth-test-fixtures.js";

test("canonical story truth binds entities, events and facts to immutable source evidence", () => {
  const ledger = createStoryTruthLedger(
    createInput(),
    new Date("2026-08-28T00:00:00.000Z"),
  );
  const validation = verifyStoryTruthLedger(ledger);
  assert.equal(validation.ok, true);
  assert.equal(validation.contradictionCount, 0);
  assert.match(ledger.fingerprint, /^[a-f0-9]{64}$/u);

  const publicView = storyTruthPublicView(ledger);
  assert.equal(publicView.entityCount, 3);
  assert.equal(publicView.canonicalFactCount, 1);
  assert.equal(JSON.stringify(publicView).includes("Alice Harrow"), false);
  assert.equal(JSON.stringify(publicView).includes("Melbourne"), false);
  assert.equal(JSON.stringify(publicView).includes("location.current"), false);
});

test("entity aliases resolve explicitly and ambiguous mentions never silently merge characters", () => {
  const ledger = createStoryTruthLedger(createInput({
    entities: [
      ...entities(),
      {
        id: "entity_captain",
        kind: "character",
        canonicalName: "Captain Voss",
        aliases: ["The Captain", "Old Salt"],
        introducedInBookId: "book_001",
      },
      {
        id: "entity_captain_guard",
        kind: "character",
        canonicalName: "Captain Reed",
        aliases: ["The Captain"],
        introducedInBookId: "book_001",
      },
    ],
  }));

  assert.equal(resolveStoryTruthEntity(ledger, "  ALICE  ").entity?.id, "entity_alice");
  const ambiguous = resolveStoryTruthEntity(ledger, "the captain", { kind: "character" });
  assert.equal(ambiguous.status, "ambiguous");
  assert.deepEqual(ambiguous.entityIds, ["entity_captain", "entity_captain_guard"]);
  assert.equal(storyTruthPublicView(ledger).ambiguousAliasCount, 1);
});

test("time-aware facts permit real change while overlapping canonical contradictions fail closed", () => {
  const oldLocation = locationFact({ validFromWorldOrder: 0, validUntilWorldOrder: 10 });
  const newLocation = locationFact({
    id: "fact_alice_location_after_arrival",
    validFromWorldOrder: 10,
    object: { kind: "literal", value: "The river house" },
  });
  const ledger = createStoryTruthLedger(createInput({ facts: [oldLocation, newLocation] }));

  assert.equal(storyTruthFactsAt(ledger, {
    worldOrder: 9,
    subjectEntityId: "entity_alice",
    predicate: "location.current",
  })[0]?.id, oldLocation.id);
  assert.equal(storyTruthFactsAt(ledger, {
    worldOrder: 10,
    subjectEntityId: "entity_alice",
    predicate: "location.current",
  })[0]?.id, newLocation.id);

  const conflict = locationFact({
    id: "fact_alice_location_conflict",
    validFromWorldOrder: 5,
    object: { kind: "literal", value: "Sydney" },
  });
  const contradictions = analyseStoryTruthContradictions({ facts: [oldLocation, conflict] });
  assert.equal(contradictions.some((finding) =>
    finding.code === "STORY_TRUTH_FACT_CONTRADICTION" && finding.severity === "error"
  ), true);
  const cardinalityConflict = analyseStoryTruthContradictions({
    facts: [oldLocation, { ...oldLocation, id: "fact_location_many", cardinality: "many" }],
  });
  assert.equal(cardinalityConflict.some((finding) =>
    finding.code === "STORY_TRUTH_FACT_CARDINALITY_CONFLICT" && finding.severity === "error"
  ), true);
  assert.throws(
    () => createStoryTruthLedger(createInput({ facts: [oldLocation, conflict] })),
    (error: unknown) => error instanceof StoryTruthValidationError
      && error.findings.some((finding) => finding.code === "STORY_TRUTH_FACT_CONTRADICTION"),
  );
});

test("source revision drift, out-of-range evidence and causal cycles are rejected", () => {
  const ledger = createStoryTruthLedger(createInput());
  const tampered = {
    ...ledger,
    facts: ledger.facts.map((fact) => ({
      ...fact,
      evidence: fact.evidence.map((item) => ({
        ...item,
        sourceHash: stableHash("different source"),
        sourceEnd: SOURCE.length + 100,
      })),
    })),
  };
  const validation = verifyStoryTruthLedger(tampered);
  assert.equal(validation.ok, false);
  assert.equal(validation.findings.some((finding) => finding.code === "STORY_TRUTH_EVIDENCE_SOURCE_HASH_MISMATCH"), true);
  assert.equal(validation.findings.some((finding) => finding.code === "STORY_TRUTH_EVIDENCE_RANGE_INVALID"), true);

  const first = arrivalEvent({ id: "event_first", causedByEventIds: ["event_second"] });
  const second = arrivalEvent({
    id: "event_second",
    narrativeOrder: 2,
    worldOrder: 11,
    causedByEventIds: ["event_first"],
  });
  assert.throws(
    () => createStoryTruthLedger(createInput({ events: [first, second], facts: [] })),
    (error: unknown) => error instanceof StoryTruthValidationError
      && error.findings.some((finding) => finding.code === "STORY_TRUTH_CAUSAL_CYCLE"),
  );
});

test("queries keep canonical, disputed and proposed truth states separate", () => {
  const ledger = createStoryTruthLedger(createInput({
    facts: [
      locationFact(),
      locationFact({
        id: "fact_alice_goal_disputed",
        predicate: "goal.current",
        object: { kind: "literal", value: "Find the missing ledger" },
        status: "disputed",
      }),
      locationFact({
        id: "fact_alice_secret_proposed",
        predicate: "secret.claimed",
        object: { kind: "literal", value: "She knew Rowan before the voyage" },
        status: "proposed",
      }),
    ],
  }));

  assert.deepEqual(storyTruthFactsAt(ledger, { worldOrder: 10 }).map((fact) => fact.id), [
    "fact_alice_location",
  ]);
  assert.equal(storyTruthFactsAt(ledger, { worldOrder: 10, includeDisputed: true }).length, 2);
  assert.equal(storyTruthFactsAt(ledger, {
    worldOrder: 10,
    includeDisputed: true,
    includeProposed: true,
  }).length, 3);
});
