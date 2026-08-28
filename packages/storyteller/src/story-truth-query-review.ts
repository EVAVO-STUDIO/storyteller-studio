import { stableHash } from "./index.js";
import { verifyStoryTruthLedger } from "./story-truth-ledger.js";
import {
  normalizeStoryTruthAlias,
  sortedUnique,
} from "./story-truth-internal.js";
import {
  pageStoryTruthRows,
  STORY_TRUTH_QUERY_SEVERITIES,
} from "./story-truth-query-page.js";
import type {
  StoryTruthFact,
  StoryTruthLedger,
  StoryTruthSeverity,
} from "./story-truth-types.js";
import type {
  StoryTruthQueryPage,
  StoryTruthReviewItem,
  StoryTruthReviewKind,
  StoryTruthReviewQuery,
} from "./story-truth-query-types.js";

const REVIEW_KINDS = new Set<StoryTruthReviewKind>([
  "ambiguous-alias",
  "proposed-fact",
  "disputed-fact",
  "validation-finding",
]);

function severityRank(value: StoryTruthSeverity): number {
  if (value === "error") return 3;
  if (value === "warning") return 2;
  return 1;
}

function ambiguousAliasItems(ledger: StoryTruthLedger): readonly StoryTruthReviewItem[] {
  const aliases = new Map<string, Set<string>>();
  for (const entity of ledger.entities) {
    for (const candidate of [entity.canonicalName, ...entity.aliases]) {
      const alias = normalizeStoryTruthAlias(candidate);
      if (!alias) continue;
      const entityIds = aliases.get(alias) ?? new Set<string>();
      entityIds.add(entity.id);
      aliases.set(alias, entityIds);
    }
  }
  const items: StoryTruthReviewItem[] = [];
  for (const [alias, entityIds] of aliases) {
    if (entityIds.size < 2) continue;
    const sortedEntityIds = sortedUnique([...entityIds]);
    items.push(Object.freeze({
      id: `story_truth_review_${stableHash({
        kind: "ambiguous-alias",
        alias,
        entityIds: sortedEntityIds,
      }).slice(0, 32)}`,
      kind: "ambiguous-alias",
      severity: "warning",
      summary: `Alias “${alias}” resolves to multiple canonical entities and requires an explicit identity decision.`,
      code: "STORY_TRUTH_ALIAS_AMBIGUOUS",
      normalizedAlias: alias,
      entityIds: sortedEntityIds,
      eventIds: Object.freeze([]),
      factIds: Object.freeze([]),
      requiresHumanDecision: true,
    }));
  }
  return Object.freeze(items);
}

function factReviewItem(fact: StoryTruthFact): StoryTruthReviewItem | null {
  const kind = fact.status === "proposed"
    ? "proposed-fact"
    : fact.status === "disputed"
      ? "disputed-fact"
      : null;
  if (!kind) return null;
  return Object.freeze({
    id: `story_truth_review_${stableHash({
      kind,
      factId: fact.id,
      status: fact.status,
    }).slice(0, 32)}`,
    kind,
    severity: "warning",
    summary: fact.status === "proposed"
      ? `Fact ${fact.id} is proposed and must not be treated as canon without review.`
      : `Fact ${fact.id} remains disputed and requires an explicit production decision.`,
    code: fact.status === "proposed"
      ? "STORY_TRUTH_FACT_PROPOSED_REVIEW_REQUIRED"
      : "STORY_TRUTH_FACT_DISPUTED_REVIEW_REQUIRED",
    entityIds: Object.freeze([fact.subjectEntityId]),
    eventIds: Object.freeze(fact.assertedAtEventId ? [fact.assertedAtEventId] : []),
    factIds: Object.freeze([fact.id]),
    requiresHumanDecision: true,
  });
}

function validationItems(ledger: StoryTruthLedger): readonly StoryTruthReviewItem[] {
  return Object.freeze(verifyStoryTruthLedger(ledger).findings
    .filter((finding) => finding.code !== "STORY_TRUTH_ALIAS_AMBIGUOUS")
    .map((finding) => Object.freeze({
      id: `story_truth_review_${stableHash({
        kind: "validation-finding",
        code: finding.code,
        severity: finding.severity,
        message: finding.message,
        entityId: finding.entityId ?? null,
        eventId: finding.eventId ?? null,
        factId: finding.factId ?? null,
        relatedFactId: finding.relatedFactId ?? null,
        retconId: finding.retconId ?? null,
        bookId: finding.bookId ?? null,
      }).slice(0, 32)}`,
      kind: "validation-finding" as const,
      severity: finding.severity,
      summary: finding.message,
      code: finding.code,
      entityIds: Object.freeze(finding.entityId ? [finding.entityId] : []),
      eventIds: Object.freeze(finding.eventId ? [finding.eventId] : []),
      factIds: sortedUnique([
        ...(finding.factId ? [finding.factId] : []),
        ...(finding.relatedFactId ? [finding.relatedFactId] : []),
      ]),
      requiresHumanDecision: true as const,
    })));
}

export function buildStoryTruthReviewQueue(
  ledger: StoryTruthLedger,
): readonly StoryTruthReviewItem[] {
  const factItems = ledger.facts
    .map(factReviewItem)
    .filter((item): item is StoryTruthReviewItem => item !== null);
  const unique = new Map([
    ...ambiguousAliasItems(ledger),
    ...factItems,
    ...validationItems(ledger),
  ].map((item) => [item.id, item]));
  return Object.freeze([...unique.values()].sort((left, right) =>
    severityRank(right.severity) - severityRank(left.severity)
    || left.kind.localeCompare(right.kind, "en-AU")
    || left.id.localeCompare(right.id, "en-AU")
  ));
}

function normalizedReviewQuery(input: StoryTruthReviewQuery): Readonly<Record<string, unknown>> {
  if (input.kind !== undefined && !REVIEW_KINDS.has(input.kind)) {
    throw new Error("STORY_TRUTH_QUERY_REVIEW_KIND_INVALID");
  }
  if (input.severity !== undefined && !STORY_TRUTH_QUERY_SEVERITIES.has(input.severity)) {
    throw new Error("STORY_TRUTH_QUERY_REVIEW_SEVERITY_INVALID");
  }
  return Object.freeze({
    kind: input.kind ?? null,
    severity: input.severity ?? null,
  });
}

export function queryStoryTruthReviewItems(
  ledger: StoryTruthLedger,
  input: StoryTruthReviewQuery = {},
): StoryTruthQueryPage<StoryTruthReviewItem> {
  const normalized = normalizedReviewQuery(input);
  const rows = buildStoryTruthReviewQueue(ledger)
    .filter((item) => input.kind === undefined || item.kind === input.kind)
    .filter((item) => input.severity === undefined || item.severity === input.severity);
  return pageStoryTruthRows(
    ledger,
    "review",
    stableHash({ collection: "review", ...normalized }),
    rows,
    input,
  );
}
