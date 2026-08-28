import { stableHash } from "./index.js";
import { verifyStoryTruthLedger } from "./story-truth-ledger.js";
import {
  optionalStoryTruthId,
  pageStoryTruthRows,
  STORY_TRUTH_QUERY_SEVERITIES,
} from "./story-truth-query-page.js";
import { storyTruthFindingReadView } from "./story-truth-query-views.js";
import type {
  StoryTruthFinding,
  StoryTruthLedger,
} from "./story-truth-types.js";
import type {
  StoryTruthFindingQuery,
  StoryTruthFindingReadView,
  StoryTruthQueryPage,
} from "./story-truth-query-types.js";

const MAX_FINDING_CODE_LENGTH = 256;

function normalizedFindingQuery(
  input: StoryTruthFindingQuery,
): Readonly<Record<string, unknown>> {
  if (input.severity !== undefined && !STORY_TRUTH_QUERY_SEVERITIES.has(input.severity)) {
    throw new Error("STORY_TRUTH_QUERY_FINDING_SEVERITY_INVALID");
  }
  if (
    input.code !== undefined
    && (
      typeof input.code !== "string"
      || input.code.trim().length === 0
      || input.code.trim().length > MAX_FINDING_CODE_LENGTH
    )
  ) {
    throw new Error("STORY_TRUTH_QUERY_FINDING_CODE_INVALID");
  }
  return Object.freeze({
    severity: input.severity ?? null,
    code: input.code?.trim() ?? null,
    entityId: optionalStoryTruthId(
      input.entityId,
      "STORY_TRUTH_QUERY_FINDING_ENTITY_INVALID",
    ) ?? null,
    eventId: optionalStoryTruthId(
      input.eventId,
      "STORY_TRUTH_QUERY_FINDING_EVENT_INVALID",
    ) ?? null,
    factId: optionalStoryTruthId(
      input.factId,
      "STORY_TRUTH_QUERY_FINDING_FACT_INVALID",
    ) ?? null,
  });
}

function severityRank(value: StoryTruthFinding["severity"]): number {
  if (value === "error") return 3;
  if (value === "warning") return 2;
  return 1;
}

export function queryStoryTruthFindings(
  ledger: StoryTruthLedger,
  input: StoryTruthFindingQuery = {},
): StoryTruthQueryPage<StoryTruthFindingReadView> {
  const validation = verifyStoryTruthLedger(ledger);
  const normalized = normalizedFindingQuery(input);
  const rows = validation.findings
    .filter((finding) => input.severity === undefined || finding.severity === input.severity)
    .filter((finding) => input.code === undefined || finding.code === input.code.trim())
    .filter((finding) => input.entityId === undefined || finding.entityId === input.entityId)
    .filter((finding) => input.eventId === undefined || finding.eventId === input.eventId)
    .filter((finding) => input.factId === undefined
      || finding.factId === input.factId
      || finding.relatedFactId === input.factId)
    .sort((left, right) =>
      severityRank(right.severity) - severityRank(left.severity)
      || left.code.localeCompare(right.code, "en-AU")
      || (left.factId ?? "").localeCompare(right.factId ?? "", "en-AU")
    )
    .map(storyTruthFindingReadView);
  return pageStoryTruthRows(
    ledger,
    "findings",
    stableHash({ collection: "findings", ...normalized }),
    rows,
    input,
  );
}
