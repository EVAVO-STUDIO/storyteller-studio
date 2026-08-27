import { stableHash } from "./index.js";
import {
  createStoryTruthEvidenceReference,
  type CreateStoryTruthLedgerInput,
  type StoryTruthEntity,
  type StoryTruthEvent,
  type StoryTruthEvidenceReference,
  type StoryTruthFact,
  type StoryTruthManuscriptReference,
} from "./story-truth-ledger.js";

export const SOURCE = "Chapter One\nAlice arrives in Melbourne and meets Rowan.";
export const SOURCE_HASH = stableHash(SOURCE);

export function manuscript(): StoryTruthManuscriptReference {
  return {
    bookId: "book_001",
    ordinal: 1,
    manuscriptRevisionId: "revision_001",
    sourceHash: SOURCE_HASH,
    sourceCodeUnitLength: SOURCE.length,
  };
}

export function evidence(start = 0, end = 11): StoryTruthEvidenceReference {
  return createStoryTruthEvidenceReference(manuscript(), SOURCE, {
    sourceStart: start,
    sourceEnd: end,
    segmentId: "segment_001",
    chapterId: "chapter_001",
  });
}

export function entities(): readonly StoryTruthEntity[] {
  return [
    {
      id: "entity_alice",
      kind: "character",
      canonicalName: "Alice Harrow",
      aliases: ["Alice", "Al"],
      introducedInBookId: "book_001",
    },
    {
      id: "entity_rowan",
      kind: "character",
      canonicalName: "Rowan Vale",
      aliases: ["Rowan"],
      introducedInBookId: "book_001",
    },
    {
      id: "entity_melbourne",
      kind: "place",
      canonicalName: "Melbourne",
      aliases: ["Naarm"],
      introducedInBookId: "book_001",
    },
  ];
}

export function arrivalEvent(overrides: Partial<StoryTruthEvent> = {}): StoryTruthEvent {
  return {
    id: "event_arrival",
    bookId: "book_001",
    eventType: "arrival",
    label: "Alice arrives in Melbourne",
    worldOrder: 10,
    narrativeOrder: 1,
    participants: [{ entityId: "entity_alice", role: "arriver" }],
    locationEntityId: "entity_melbourne",
    causedByEventIds: [],
    evidence: [evidence()],
    ...overrides,
  };
}

export function locationFact(overrides: Partial<StoryTruthFact> = {}): StoryTruthFact {
  return {
    id: "fact_alice_location",
    bookId: "book_001",
    subjectEntityId: "entity_alice",
    predicate: "location.current",
    object: { kind: "entity", entityId: "entity_melbourne" },
    cardinality: "one",
    polarity: "asserted",
    status: "canonical",
    authority: "source",
    confidence: 1,
    validFromWorldOrder: 10,
    assertedAtEventId: "event_arrival",
    evidence: [evidence()],
    ...overrides,
  };
}

export function createInput(overrides: Partial<CreateStoryTruthLedgerInput> = {}): CreateStoryTruthLedgerInput {
  return {
    id: "story_truth_001",
    projectId: "project_001",
    seriesId: "series_001",
    title: "The Harrow Chronicle",
    manuscripts: [manuscript()],
    entities: entities(),
    events: [arrivalEvent()],
    facts: [locationFact()],
    ...overrides,
  };
}
