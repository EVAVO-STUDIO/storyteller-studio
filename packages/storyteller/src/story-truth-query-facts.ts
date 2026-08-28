import { stableHash } from "./index.js";
import {
  FACT_STATUSES,
  isSafePredicate,
} from "./story-truth-internal.js";
import {
  optionalStoryTruthId,
  optionalStoryTruthWorldOrder,
  pageStoryTruthRows,
  validateStoryTruthLedgerForRead,
} from "./story-truth-query-page.js";
import { storyTruthFactReadView } from "./story-truth-query-views.js";
import type {
  StoryTruthFactStatus,
  StoryTruthLedger,
} from "./story-truth-types.js";
import type {
  StoryTruthFactQueryInput,
  StoryTruthFactReadView,
  StoryTruthQueryPage,
} from "./story-truth-query-types.js";

function normalizedFactQuery(
  input: StoryTruthFactQueryInput,
): Readonly<Record<string, unknown>> {
  const worldOrder = optionalStoryTruthWorldOrder(
    input.worldOrder,
    "STORY_TRUTH_QUERY_WORLD_ORDER_INVALID",
  );
  const subjectEntityId = optionalStoryTruthId(
    input.subjectEntityId,
    "STORY_TRUTH_QUERY_SUBJECT_INVALID",
  );
  if (input.predicate !== undefined && !isSafePredicate(input.predicate)) {
    throw new Error("STORY_TRUTH_QUERY_PREDICATE_INVALID");
  }
  if (input.statuses !== undefined && !Array.isArray(input.statuses)) {
    throw new Error("STORY_TRUTH_QUERY_FACT_STATUS_INVALID");
  }
  const statuses = input.statuses === undefined
    ? (["canonical"] as StoryTruthFactStatus[])
    : [...new Set(input.statuses)];
  if (statuses.length === 0 || statuses.some((status) => !FACT_STATUSES.has(status))) {
    throw new Error("STORY_TRUTH_QUERY_FACT_STATUS_INVALID");
  }
  return Object.freeze({
    worldOrder: worldOrder ?? null,
    subjectEntityId: subjectEntityId ?? null,
    predicate: input.predicate ?? null,
    statuses: Object.freeze([...statuses].sort((left, right) =>
      left.localeCompare(right, "en-AU")
    )),
  });
}

export function queryStoryTruthFacts(
  ledger: StoryTruthLedger,
  input: StoryTruthFactQueryInput = {},
): StoryTruthQueryPage<StoryTruthFactReadView> {
  validateStoryTruthLedgerForRead(ledger);
  const normalized = normalizedFactQuery(input);
  const statuses = new Set(normalized.statuses as readonly StoryTruthFactStatus[]);
  const worldOrder = normalized.worldOrder as number | null;
  const rows = ledger.facts
    .filter((fact) => statuses.has(fact.status))
    .filter((fact) => input.subjectEntityId === undefined
      || fact.subjectEntityId === input.subjectEntityId)
    .filter((fact) => input.predicate === undefined || fact.predicate === input.predicate)
    .filter((fact) => worldOrder === null || (
      fact.validFromWorldOrder <= worldOrder
      && (fact.validUntilWorldOrder === undefined || worldOrder < fact.validUntilWorldOrder)
    ))
    .sort((left, right) =>
      left.subjectEntityId.localeCompare(right.subjectEntityId, "en-AU")
      || left.predicate.localeCompare(right.predicate, "en-AU")
      || left.validFromWorldOrder - right.validFromWorldOrder
      || left.id.localeCompare(right.id, "en-AU")
    )
    .map(storyTruthFactReadView);
  return pageStoryTruthRows(
    ledger,
    "facts",
    stableHash({ collection: "facts", ...normalized }),
    rows,
    input,
  );
}
