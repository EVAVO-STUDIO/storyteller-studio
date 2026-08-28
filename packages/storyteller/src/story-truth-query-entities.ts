import { stableHash } from "./index.js";
import { resolveStoryTruthEntity } from "./story-truth-ledger.js";
import {
  ENTITY_KINDS,
  normalizeStoryTruthAlias,
} from "./story-truth-internal.js";
import {
  pageStoryTruthRows,
  validateStoryTruthLedgerForRead,
} from "./story-truth-query-page.js";
import { storyTruthEntityReadView } from "./story-truth-query-views.js";
import type {
  StoryTruthEntityKind,
  StoryTruthLedger,
} from "./story-truth-types.js";
import type {
  StoryTruthEntityQuery,
  StoryTruthEntityReadView,
  StoryTruthEntityResolutionReadView,
  StoryTruthQueryPage,
} from "./story-truth-query-types.js";

const MAX_ENTITY_SEARCH_LENGTH = 512;
const MAX_RESOLUTION_MENTION_LENGTH = 512;

function normalizedEntityQuery(
  input: StoryTruthEntityQuery,
): Readonly<Record<string, unknown>> {
  if (input.kind !== undefined && !ENTITY_KINDS.has(input.kind)) {
    throw new Error("STORY_TRUTH_QUERY_ENTITY_KIND_INVALID");
  }
  if (input.search !== undefined && typeof input.search !== "string") {
    throw new Error("STORY_TRUTH_QUERY_ENTITY_SEARCH_INVALID");
  }
  const search = input.search === undefined
    ? null
    : normalizeStoryTruthAlias(input.search) || null;
  if (search !== null && search.length > MAX_ENTITY_SEARCH_LENGTH) {
    throw new Error("STORY_TRUTH_QUERY_ENTITY_SEARCH_INVALID");
  }
  return Object.freeze({
    kind: input.kind ?? null,
    search,
  });
}

export function queryStoryTruthEntities(
  ledger: StoryTruthLedger,
  input: StoryTruthEntityQuery = {},
): StoryTruthQueryPage<StoryTruthEntityReadView> {
  validateStoryTruthLedgerForRead(ledger);
  const normalized = normalizedEntityQuery(input);
  const search = normalized.search as string | null;
  const rows = ledger.entities
    .filter((entity) => input.kind === undefined || entity.kind === input.kind)
    .filter((entity) => !search || [entity.canonicalName, ...entity.aliases]
      .some((candidate) => normalizeStoryTruthAlias(candidate).includes(search)))
    .sort((left, right) =>
      left.canonicalName.localeCompare(right.canonicalName, "en-AU")
      || left.id.localeCompare(right.id, "en-AU")
    )
    .map(storyTruthEntityReadView);
  return pageStoryTruthRows(
    ledger,
    "entities",
    stableHash({ collection: "entities", ...normalized }),
    rows,
    input,
  );
}

export function resolveStoryTruthEntityForReview(
  ledger: StoryTruthLedger,
  mention: string,
  options: Readonly<{ kind?: StoryTruthEntityKind }> = {},
): StoryTruthEntityResolutionReadView {
  validateStoryTruthLedgerForRead(ledger);
  if (options.kind !== undefined && !ENTITY_KINDS.has(options.kind)) {
    throw new Error("STORY_TRUTH_QUERY_ENTITY_KIND_INVALID");
  }
  if (
    typeof mention !== "string"
    || normalizeStoryTruthAlias(mention).length > MAX_RESOLUTION_MENTION_LENGTH
  ) {
    throw new Error("STORY_TRUTH_QUERY_ENTITY_MENTION_INVALID");
  }
  const resolution = resolveStoryTruthEntity(ledger, mention, options);
  return Object.freeze({
    status: resolution.status,
    normalizedMention: resolution.normalizedMention,
    entityIds: Object.freeze([...resolution.entityIds]),
    ...(resolution.entity
      ? { entity: storyTruthEntityReadView(resolution.entity) }
      : {}),
  });
}
