import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { stableHash } from "./index.js";
import { FileProjectStore } from "./project-store.js";
import {
  applyStoryTruthRetcon,
  createStoryTruthEvidenceReference,
  createStoryTruthLedger,
  type StoryTruthEvidenceReference,
} from "./story-truth-ledger.js";
import {
  FileStoryTruthStore,
  StoryTruthStoreConflictError,
} from "./story-truth-store.js";

const SOURCE = "Chapter One\nAlice arrives in Melbourne.";
const SOURCE_HASH = stableHash(SOURCE);

function sourceEvidence(): StoryTruthEvidenceReference {
  return createStoryTruthEvidenceReference({
    bookId: "book_001",
    ordinal: 1,
    manuscriptRevisionId: "revision_001",
    sourceHash: SOURCE_HASH,
    sourceCodeUnitLength: SOURCE.length,
  }, SOURCE, { sourceStart: 0, sourceEnd: 11 });
}

function ledger() {
  return createStoryTruthLedger({
    id: "story_truth_store_001",
    projectId: "project_001",
    title: "Private Story Truth",
    manuscripts: [{
      bookId: "book_001",
      ordinal: 1,
      manuscriptRevisionId: "revision_001",
      sourceHash: SOURCE_HASH,
      sourceCodeUnitLength: SOURCE.length,
    }],
    entities: [
      {
        id: "entity_alice",
        kind: "character",
        canonicalName: "Alice Harrow",
        aliases: ["Alice"],
        introducedInBookId: "book_001",
      },
      {
        id: "entity_melbourne",
        kind: "place",
        canonicalName: "Melbourne",
        aliases: [],
        introducedInBookId: "book_001",
      },
    ],
    events: [{
      id: "event_arrival",
      bookId: "book_001",
      eventType: "arrival",
      label: "Alice arrives",
      worldOrder: 1,
      narrativeOrder: 1,
      participants: [{ entityId: "entity_alice", role: "arriver" }],
      locationEntityId: "entity_melbourne",
      causedByEventIds: [],
      evidence: [sourceEvidence()],
    }],
    facts: [{
      id: "fact_location",
      bookId: "book_001",
      subjectEntityId: "entity_alice",
      predicate: "location.current",
      object: { kind: "entity", entityId: "entity_melbourne" },
      cardinality: "one",
      polarity: "asserted",
      status: "canonical",
      authority: "source",
      confidence: 1,
      validFromWorldOrder: 1,
      assertedAtEventId: "event_arrival",
      evidence: [sourceEvidence()],
    }],
  }, new Date("2026-08-28T00:00:00.000Z"));
}

async function withStore(
  run: (store: FileStoryTruthStore, root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "story-truth-store-"));
  try {
    const projectStore = new FileProjectStore(root, { lockTimeoutMs: 1_000 });
    await run(new FileStoryTruthStore(projectStore), root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("file story truth store persists verified ledgers with optimistic revisions", async () => {
  await withStore(async (store) => {
    const initial = ledger();
    const created = await store.create(initial, {
      actorId: "editor_001",
      now: new Date("2026-08-28T00:00:00.000Z"),
    });
    assert.equal(created.revision, 1);
    assert.equal((await store.require(initial.id)).payload.fingerprint, initial.fingerprint);

    const revised = applyStoryTruthRetcon(initial, {
      id: "retcon_001",
      targetFactIds: ["fact_location"],
      replacements: [{
        id: "fact_location_corrected",
        bookId: "book_001",
        subjectEntityId: "entity_alice",
        predicate: "location.current",
        object: { kind: "literal", value: "Geelong" },
        cardinality: "one",
        polarity: "asserted",
        authority: "approved-canon",
        confidence: 1,
        validFromWorldOrder: 1,
        assertedAtEventId: "event_arrival",
        evidence: [sourceEvidence()],
      }],
      rationale: "The author approved the corrected destination for publication.",
      approvedBy: "editor_001",
      approvedAt: new Date("2026-08-28T01:00:00.000Z"),
      decisionEvidenceHash: stableHash("approved decision"),
    });
    const saved = await store.save(revised, {
      expectedRevision: created.revision,
      actorId: "editor_001",
      now: new Date("2026-08-28T01:00:00.000Z"),
    });
    assert.equal(saved.revision, 2);
    assert.equal(saved.payload.revision, 2);
    assert.equal((await store.list()).length, 1);
    assert.equal((await store.publicView(initial.id))?.retconCount, 1);

    await assert.rejects(
      store.save(revised, {
        expectedRevision: 1,
        actorId: "editor_001",
        now: new Date("2026-08-28T02:00:00.000Z"),
      }),
      (error: unknown) => error instanceof StoryTruthStoreConflictError,
    );
  });
});

test("story truth audit metadata exposes counts and hashes but no private canon values", async () => {
  await withStore(async (store, root) => {
    const initial = ledger();
    await store.create(initial, {
      actorId: "editor_001",
      now: new Date("2026-08-28T00:00:00.000Z"),
    });
    const audit = await readFile(join(root, "audit", "2026-08-28.jsonl"), "utf8");
    assert.equal(audit.includes(initial.fingerprint), true);
    assert.equal(audit.includes("Alice Harrow"), false);
    assert.equal(audit.includes("Melbourne"), false);
    assert.equal(audit.includes("location.current"), false);
    assert.equal(audit.includes("fact_location"), false);
  });
});
