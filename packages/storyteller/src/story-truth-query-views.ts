import { sortedUnique } from "./story-truth-internal.js";
import type {
  StoryTruthEntity,
  StoryTruthEvent,
  StoryTruthFact,
  StoryTruthFinding,
} from "./story-truth-types.js";
import type {
  StoryTruthEntityReadView,
  StoryTruthEventReadView,
  StoryTruthFactReadView,
  StoryTruthFindingReadView,
} from "./story-truth-query-types.js";

export function storyTruthEntityReadView(
  entity: StoryTruthEntity,
): StoryTruthEntityReadView {
  return Object.freeze({
    id: entity.id,
    kind: entity.kind,
    canonicalName: entity.canonicalName,
    aliases: Object.freeze([...entity.aliases]),
    introducedInBookId: entity.introducedInBookId,
  });
}

export function storyTruthEventReadView(
  event: StoryTruthEvent,
): StoryTruthEventReadView {
  return Object.freeze({
    id: event.id,
    bookId: event.bookId,
    eventType: event.eventType,
    label: event.label,
    worldOrder: event.worldOrder,
    narrativeOrder: event.narrativeOrder,
    ...(event.worldTimeLabel ? { worldTimeLabel: event.worldTimeLabel } : {}),
    participants: Object.freeze(event.participants.map((participant) => Object.freeze({
      entityId: participant.entityId,
      role: participant.role,
    }))),
    ...(event.locationEntityId ? { locationEntityId: event.locationEntityId } : {}),
    causedByEventIds: sortedUnique(event.causedByEventIds),
  });
}

export function storyTruthFactReadView(
  fact: StoryTruthFact,
): StoryTruthFactReadView {
  return Object.freeze({
    id: fact.id,
    bookId: fact.bookId,
    subjectEntityId: fact.subjectEntityId,
    predicate: fact.predicate,
    object: Object.freeze({ ...fact.object }),
    cardinality: fact.cardinality,
    polarity: fact.polarity,
    status: fact.status,
    authority: fact.authority,
    confidence: fact.confidence,
    validFromWorldOrder: fact.validFromWorldOrder,
    ...(fact.validUntilWorldOrder !== undefined
      ? { validUntilWorldOrder: fact.validUntilWorldOrder }
      : {}),
    ...(fact.assertedAtEventId ? { assertedAtEventId: fact.assertedAtEventId } : {}),
    ...(fact.supersedesFactIds
      ? { supersedesFactIds: sortedUnique(fact.supersedesFactIds) }
      : {}),
    ...(fact.supersededByRetconId
      ? { supersededByRetconId: fact.supersededByRetconId }
      : {}),
  });
}

export function storyTruthFindingReadView(
  finding: StoryTruthFinding,
): StoryTruthFindingReadView {
  return Object.freeze({ ...finding });
}
