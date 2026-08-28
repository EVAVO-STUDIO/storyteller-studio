import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStoryTruthReviewQueue,
  createStoryTruthLedger,
  queryStoryTruthEntities,
  queryStoryTruthFacts,
  queryStoryTruthFindings,
  queryStoryTruthReviewItems,
  queryStoryTruthTimeline,
  resolveStoryTruthEntityForReview,
  type StoryTruthEvent,
  type StoryTruthFact,
  type StoryTruthLedger,
} from "./story-truth.js";
import {
  arrivalEvent,
  createInput,
  entities,
  evidence,
  locationFact,
} from "./story-truth-test-fixtures.js";

const createdAt = new Date("2026-08-28T05:00:00.000Z");

function queryLedger(now = createdAt): StoryTruthLedger {
  const meeting: StoryTruthEvent = arrivalEvent({
    id: "event_meeting",
    eventType: "meeting",
    label: "Alice meets Rowan",
    worldOrder: 20,
    narrativeOrder: 2,
    participants: [
      { entityId: "entity_alice", role: "speaker" },
      { entityId: "entity_rowan", role: "listener" },
    ],
    causedByEventIds: ["event_arrival"],
    evidence: [evidence()],
  });
  const proposedRole: StoryTruthFact = locationFact({
    id: "fact_alice_role_proposed",
    predicate: "role.current",
    object: { kind: "literal", value: "courier" },
    status: "proposed",
    authority: "derived",
    confidence: 0.72,
  });
  const disputedEyes: StoryTruthFact = locationFact({
    id: "fact_alice_eye_colour_disputed",
    predicate: "appearance.eye-colour",
    object: { kind: "literal", value: "grey" },
    status: "disputed",
    confidence: 0.55,
  });
  return createStoryTruthLedger(createInput({
    entities: [
      ...entities().map((entity) => entity.id === "entity_alice"
        ? { ...entity, privateNotesHash: "a".repeat(64) }
        : entity),
      {
        id: "entity_harbour_council",
        kind: "organisation",
        canonicalName: "Harbour Council",
        aliases: ["Naarm"],
        introducedInBookId: "book_001",
        privateNotesHash: "b".repeat(64),
      },
    ],
    events: [arrivalEvent(), meeting],
    facts: [
      locationFact(),
      locationFact({ id: "fact_alice_location_duplicate" }),
      proposedRole,
      disputedEyes,
    ],
  }), now);
}

test("story truth entity queries are bounded, revision-bound and redact private notes", () => {
  const ledger = queryLedger();
  const first = queryStoryTruthEntities(ledger, { limit: 2 });
  assert.equal(first.data.length, 2);
  assert.equal(first.meta.total, 4);
  assert.equal(first.meta.hasMore, true);
  const cursor = first.meta.nextCursor;
  assert.ok(cursor);

  const second = queryStoryTruthEntities(ledger, { limit: 2, cursor });
  assert.equal(second.data.length, 2);
  assert.equal(second.meta.hasMore, false);
  const serialised = JSON.stringify([first, second]);
  assert.equal(serialised.includes("privateNotesHash"), false);
  assert.equal(serialised.includes("a".repeat(64)), false);
  assert.equal(serialised.includes("b".repeat(64)), false);

  assert.throws(
    () => queryStoryTruthEntities(ledger, { search: "Alice", cursor }),
    /STORY_TRUTH_QUERY_CURSOR_QUERY_MISMATCH/u,
  );
  assert.throws(
    () => queryStoryTruthEntities(queryLedger(new Date("2026-08-28T05:00:01.000Z")), { cursor }),
    /STORY_TRUTH_QUERY_CURSOR_STALE/u,
  );
  const tampered = `${cursor.slice(0, -1)}${cursor.endsWith("A") ? "B" : "A"}`;
  assert.throws(
    () => queryStoryTruthEntities(ledger, { cursor: tampered }),
    /STORY_TRUTH_QUERY_CURSOR_INVALID/u,
  );
});


test("story truth query inputs and cursors fail closed across collections", () => {
  const ledger = queryLedger();
  const entityPage = queryStoryTruthEntities(ledger, { limit: 1 });
  const cursor = entityPage.meta.nextCursor;
  assert.ok(cursor);

  assert.throws(
    () => queryStoryTruthFacts(ledger, { cursor }),
    /STORY_TRUTH_QUERY_CURSOR_COLLECTION_MISMATCH/u,
  );
  assert.throws(
    () => queryStoryTruthEntities(ledger, { limit: 201 }),
    /STORY_TRUTH_QUERY_LIMIT_INVALID/u,
  );
  assert.throws(
    () => queryStoryTruthFacts(ledger, { statuses: [] }),
    /STORY_TRUTH_QUERY_FACT_STATUS_INVALID/u,
  );
  assert.throws(
    () => resolveStoryTruthEntityForReview(ledger, "x".repeat(513)),
    /STORY_TRUTH_QUERY_ENTITY_MENTION_INVALID/u,
  );
});

test("story truth fact and timeline queries preserve temporal order without source evidence", () => {
  const ledger = queryLedger();
  const canonical = queryStoryTruthFacts(ledger, {
    worldOrder: 10,
    statuses: ["canonical"],
  });
  assert.equal(canonical.data.length, 2);

  const unresolved = queryStoryTruthFacts(ledger, {
    statuses: ["proposed", "disputed"],
  });
  assert.deepEqual(
    new Set(unresolved.data.map((fact) => fact.status)),
    new Set(["proposed", "disputed"]),
  );
  const timeline = queryStoryTruthTimeline(ledger, { entityId: "entity_alice" });
  assert.deepEqual(
    timeline.data.map((event) => event.id),
    ["event_arrival", "event_meeting"],
  );

  const serialised = JSON.stringify({ unresolved, timeline });
  for (const forbidden of [
    "evidence",
    "sourceStart",
    "sourceEnd",
    "excerptHash",
    "manuscriptRevisionId",
  ]) {
    assert.equal(serialised.includes(forbidden), false);
  }
});

test("story truth review queue exposes unresolved decisions without granting approval authority", () => {
  const ledger = queryLedger();
  const queue = buildStoryTruthReviewQueue(ledger);
  const kinds = new Set(queue.map((item) => item.kind));
  assert.equal(kinds.has("ambiguous-alias"), true);
  assert.equal(kinds.has("proposed-fact"), true);
  assert.equal(kinds.has("disputed-fact"), true);
  assert.equal(kinds.has("validation-finding"), true);
  assert.equal(new Set(queue.map((item) => item.id)).size, queue.length);
  assert.ok(queue.every((item) => item.requiresHumanDecision));

  const proposed = queryStoryTruthReviewItems(ledger, {
    kind: "proposed-fact",
  });
  assert.equal(proposed.data.length, 1);
  assert.deepEqual(proposed.data[0]?.factIds, ["fact_alice_role_proposed"]);
  const warnings = queryStoryTruthFindings(ledger, { severity: "warning" });
  assert.ok(warnings.data.length >= 2);

  const serialised = JSON.stringify({ queue, warnings });
  for (const forbidden of [
    "privateNotesHash",
    "approvedBy",
    "decisionEvidenceHash",
    "sourceStart",
    "excerptHash",
  ]) {
    assert.equal(serialised.includes(forbidden), false);
  }
});

test("story truth entity resolution remains explicit and returns only a redacted entity view", () => {
  const ledger = queryLedger();
  const resolved = resolveStoryTruthEntityForReview(ledger, "Alice");
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.entity?.id, "entity_alice");
  assert.equal("privateNotesHash" in (resolved.entity ?? {}), false);

  const ambiguous = resolveStoryTruthEntityForReview(ledger, "Naarm");
  assert.equal(ambiguous.status, "ambiguous");
  assert.deepEqual(ambiguous.entityIds, [
    "entity_harbour_council",
    "entity_melbourne",
  ]);
});
