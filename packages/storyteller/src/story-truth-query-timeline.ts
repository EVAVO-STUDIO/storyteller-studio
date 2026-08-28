import { stableHash } from "./index.js";
import {
  optionalStoryTruthId,
  optionalStoryTruthWorldOrder,
  pageStoryTruthRows,
  validateStoryTruthLedgerForRead,
} from "./story-truth-query-page.js";
import { storyTruthEventReadView } from "./story-truth-query-views.js";
import type { StoryTruthLedger } from "./story-truth-types.js";
import type {
  StoryTruthEventReadView,
  StoryTruthQueryPage,
  StoryTruthTimelineQuery,
} from "./story-truth-query-types.js";

function normalizedTimelineQuery(
  input: StoryTruthTimelineQuery,
): Readonly<Record<string, unknown>> {
  const entityId = optionalStoryTruthId(
    input.entityId,
    "STORY_TRUTH_QUERY_TIMELINE_ENTITY_INVALID",
  );
  const bookId = optionalStoryTruthId(
    input.bookId,
    "STORY_TRUTH_QUERY_TIMELINE_BOOK_INVALID",
  );
  const minimumWorldOrder = optionalStoryTruthWorldOrder(
    input.minimumWorldOrder,
    "STORY_TRUTH_QUERY_TIMELINE_MINIMUM_INVALID",
  );
  const maximumWorldOrder = optionalStoryTruthWorldOrder(
    input.maximumWorldOrder,
    "STORY_TRUTH_QUERY_TIMELINE_MAXIMUM_INVALID",
  );
  if (
    minimumWorldOrder !== undefined
    && maximumWorldOrder !== undefined
    && minimumWorldOrder > maximumWorldOrder
  ) {
    throw new Error("STORY_TRUTH_QUERY_TIMELINE_RANGE_INVALID");
  }
  return Object.freeze({
    entityId: entityId ?? null,
    bookId: bookId ?? null,
    minimumWorldOrder: minimumWorldOrder ?? null,
    maximumWorldOrder: maximumWorldOrder ?? null,
  });
}

export function queryStoryTruthTimeline(
  ledger: StoryTruthLedger,
  input: StoryTruthTimelineQuery = {},
): StoryTruthQueryPage<StoryTruthEventReadView> {
  validateStoryTruthLedgerForRead(ledger);
  const normalized = normalizedTimelineQuery(input);
  const rows = ledger.events
    .filter((event) => input.bookId === undefined || event.bookId === input.bookId)
    .filter((event) => input.entityId === undefined
      || event.locationEntityId === input.entityId
      || event.participants.some((participant) => participant.entityId === input.entityId))
    .filter((event) => input.minimumWorldOrder === undefined
      || event.worldOrder >= input.minimumWorldOrder)
    .filter((event) => input.maximumWorldOrder === undefined
      || event.worldOrder <= input.maximumWorldOrder)
    .sort((left, right) =>
      left.worldOrder - right.worldOrder
      || left.narrativeOrder - right.narrativeOrder
      || left.id.localeCompare(right.id, "en-AU")
    )
    .map(storyTruthEventReadView);
  return pageStoryTruthRows(
    ledger,
    "timeline",
    stableHash({ collection: "timeline", ...normalized }),
    rows,
    input,
  );
}
