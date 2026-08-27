import { stableHash } from "./index.js";
import {
  STORY_TRUTH_RETCON_SCHEMA_VERSION,
  STORY_TRUTH_SCHEMA_VERSION,
  StoryTruthValidationError,
  type ApplyStoryTruthRetconInput,
  type CreateStoryTruthLedgerInput,
  type StoryTruthEntityKind,
  type StoryTruthEntityResolution,
  type StoryTruthFact,
  type StoryTruthFactQuery,
  type StoryTruthFactStatus,
  type StoryTruthLedger,
  type StoryTruthPublicView,
  type StoryTruthRetcon,
} from "./story-truth-types.js";
import {
  MAX_RATIONALE_LENGTH,
  createStoryTruthEvidenceReference,
  isHash,
  isInteger,
  isSafeId,
  isSafePredicate,
  ledgerFingerprint,
  normalizeStoryTruthAlias,
  normalizedText,
  retconFingerprint,
  sortedUnique,
} from "./story-truth-internal.js";
import { analyseStoryTruthContradictions } from "./story-truth-contradictions.js";
import { verifyStoryTruthLedger } from "./story-truth-validation.js";

export * from "./story-truth-types.js";
export {
  createStoryTruthEvidenceReference,
  normalizeStoryTruthAlias,
} from "./story-truth-internal.js";
export { analyseStoryTruthContradictions } from "./story-truth-contradictions.js";
export { verifyStoryTruthLedger } from "./story-truth-validation.js";

function assertValidLedger(ledger: StoryTruthLedger): void {
  const validation = verifyStoryTruthLedger(ledger);
  if (!validation.ok) throw new StoryTruthValidationError(validation.findings);
}

export function createStoryTruthLedger(
  input: CreateStoryTruthLedgerInput,
  now = new Date(),
): StoryTruthLedger {
  const instant = now.toISOString();
  const partial: Omit<StoryTruthLedger, "fingerprint"> = {
    schemaVersion: STORY_TRUTH_SCHEMA_VERSION,
    id: input.id,
    projectId: input.projectId,
    ...(input.seriesId ? { seriesId: input.seriesId } : {}),
    title: input.title,
    manuscripts: Object.freeze([...(input.manuscripts ?? [])]),
    entities: Object.freeze([...(input.entities ?? [])]),
    events: Object.freeze([...(input.events ?? [])]),
    facts: Object.freeze([...(input.facts ?? [])]),
    retcons: Object.freeze([]),
    revision: 1,
    createdAt: instant,
    updatedAt: instant,
  };
  const ledger = Object.freeze({ ...partial, fingerprint: ledgerFingerprint(partial) });
  assertValidLedger(ledger);
  return ledger;
}

export function resolveStoryTruthEntity(
  ledger: Pick<StoryTruthLedger, "entities">,
  mention: string,
  options: Readonly<{ kind?: StoryTruthEntityKind }> = {},
): StoryTruthEntityResolution {
  const normalizedMention = normalizeStoryTruthAlias(mention);
  if (!normalizedMention) {
    return Object.freeze({ status: "not-found", normalizedMention, entityIds: Object.freeze([]) });
  }
  const matches = ledger.entities.filter((entity) => {
    if (options.kind && entity.kind !== options.kind) return false;
    return [entity.canonicalName, ...entity.aliases]
      .some((candidate) => normalizeStoryTruthAlias(candidate) === normalizedMention);
  });
  if (matches.length === 1 && matches[0]) {
    return Object.freeze({
      status: "resolved",
      normalizedMention,
      entityIds: Object.freeze([matches[0].id]),
      entity: matches[0],
    });
  }
  if (matches.length > 1) {
    return Object.freeze({
      status: "ambiguous",
      normalizedMention,
      entityIds: Object.freeze(matches.map((entity) => entity.id).sort((left, right) => left.localeCompare(right, "en-AU"))),
    });
  }
  return Object.freeze({ status: "not-found", normalizedMention, entityIds: Object.freeze([]) });
}

export function storyTruthFactsAt(
  ledger: Pick<StoryTruthLedger, "facts">,
  query: StoryTruthFactQuery,
): readonly StoryTruthFact[] {
  if (!isInteger(query.worldOrder)) throw new Error("STORY_TRUTH_QUERY_WORLD_ORDER_INVALID");
  if (query.subjectEntityId !== undefined && !isSafeId(query.subjectEntityId)) {
    throw new Error("STORY_TRUTH_QUERY_SUBJECT_INVALID");
  }
  if (query.predicate !== undefined && !isSafePredicate(query.predicate)) {
    throw new Error("STORY_TRUTH_QUERY_PREDICATE_INVALID");
  }
  const allowedStatuses = new Set<StoryTruthFactStatus>(["canonical"]);
  if (query.includeDisputed) allowedStatuses.add("disputed");
  if (query.includeProposed) allowedStatuses.add("proposed");
  return Object.freeze(ledger.facts
    .filter((fact) => allowedStatuses.has(fact.status))
    .filter((fact) => fact.validFromWorldOrder <= query.worldOrder)
    .filter((fact) => fact.validUntilWorldOrder === undefined || query.worldOrder < fact.validUntilWorldOrder)
    .filter((fact) => query.subjectEntityId === undefined || fact.subjectEntityId === query.subjectEntityId)
    .filter((fact) => query.predicate === undefined || fact.predicate === query.predicate)
    .sort((left, right) =>
      left.subjectEntityId.localeCompare(right.subjectEntityId, "en-AU")
      || left.predicate.localeCompare(right.predicate, "en-AU")
      || left.id.localeCompare(right.id, "en-AU")
    ));
}

export function storyTruthPublicView(ledger: StoryTruthLedger): StoryTruthPublicView {
  const validation = verifyStoryTruthLedger(ledger);
  const counts = new Map<StoryTruthFactStatus, number>();
  for (const fact of ledger.facts) counts.set(fact.status, (counts.get(fact.status) ?? 0) + 1);
  const latestWorldOrder = ledger.events.length > 0
    ? Math.max(...ledger.events.map((event) => event.worldOrder))
    : null;
  return Object.freeze({
    schemaVersion: ledger.schemaVersion,
    id: ledger.id,
    projectId: ledger.projectId,
    ...(ledger.seriesId ? { seriesId: ledger.seriesId } : {}),
    revision: ledger.revision,
    fingerprint: ledger.fingerprint,
    manuscriptCount: ledger.manuscripts.length,
    entityCount: ledger.entities.length,
    eventCount: ledger.events.length,
    factCount: ledger.facts.length,
    canonicalFactCount: counts.get("canonical") ?? 0,
    disputedFactCount: counts.get("disputed") ?? 0,
    proposedFactCount: counts.get("proposed") ?? 0,
    supersededFactCount: counts.get("superseded") ?? 0,
    retconCount: ledger.retcons.length,
    contradictionCount: validation.contradictionCount,
    ambiguousAliasCount: validation.ambiguousAliasCount,
    findingCodes: sortedUnique(validation.findings.map((item) => item.code)),
    latestWorldOrder,
  });
}

export function applyStoryTruthRetcon(
  current: StoryTruthLedger,
  input: ApplyStoryTruthRetconInput,
): StoryTruthLedger {
  assertValidLedger(current);
  if (!isSafeId(input.id)) throw new Error("STORY_TRUTH_RETCON_ID_INVALID");
  if (current.retcons.some((retcon) => retcon.id === input.id)) throw new Error("STORY_TRUTH_RETCON_ID_CONFLICT");
  if (!isSafeId(input.approvedBy)) throw new Error("STORY_TRUTH_RETCON_APPROVER_INVALID");
  if (!isHash(input.decisionEvidenceHash)) throw new Error("STORY_TRUTH_RETCON_DECISION_HASH_INVALID");
  if (
    typeof input.rationale !== "string"
    || normalizedText(input.rationale).length < 12
    || input.rationale.length > MAX_RATIONALE_LENGTH
  ) {
    throw new Error("STORY_TRUTH_RETCON_RATIONALE_INVALID");
  }
  const targetFactIds = sortedUnique(input.targetFactIds);
  if (targetFactIds.length === 0) throw new Error("STORY_TRUTH_RETCON_TARGET_REQUIRED");
  const factMap = new Map(current.facts.map((fact) => [fact.id, fact]));
  for (const targetId of targetFactIds) {
    const target = factMap.get(targetId);
    if (!target) throw new Error(`STORY_TRUTH_RETCON_TARGET_UNKNOWN:${targetId}`);
    if (target.status === "superseded") throw new Error(`STORY_TRUTH_RETCON_TARGET_ALREADY_SUPERSEDED:${targetId}`);
  }

  const replacements: StoryTruthFact[] = [];
  for (const replacement of input.replacements ?? []) {
    if (factMap.has(replacement.id) || replacements.some((candidate) => candidate.id === replacement.id)) {
      throw new Error(`STORY_TRUTH_RETCON_REPLACEMENT_ID_CONFLICT:${replacement.id}`);
    }
    replacements.push(Object.freeze({
      ...replacement,
      status: "canonical" as const,
      supersedesFactIds: targetFactIds,
    }));
  }

  const approvedAt = input.approvedAt ?? new Date();
  if (Number.isNaN(approvedAt.getTime())) throw new Error("STORY_TRUTH_RETCON_APPROVED_AT_INVALID");
  if (approvedAt.getTime() < Date.parse(current.updatedAt)) {
    throw new Error("STORY_TRUTH_RETCON_TIME_REGRESSION");
  }
  const retconWithoutFingerprint: Omit<StoryTruthRetcon, "fingerprint"> = {
    schemaVersion: STORY_TRUTH_RETCON_SCHEMA_VERSION,
    id: input.id,
    targetFactIds,
    replacementFactIds: Object.freeze(replacements.map((fact) => fact.id)),
    rationale: input.rationale,
    approvedBy: input.approvedBy,
    approvedAt: approvedAt.toISOString(),
    decisionEvidenceHash: input.decisionEvidenceHash,
  };
  const retcon: StoryTruthRetcon = Object.freeze({
    ...retconWithoutFingerprint,
    fingerprint: retconFingerprint(retconWithoutFingerprint),
  });

  const facts = Object.freeze([
    ...current.facts.map((fact) => targetFactIds.includes(fact.id)
      ? Object.freeze({ ...fact, status: "superseded" as const, supersededByRetconId: input.id })
      : fact),
    ...replacements,
  ]);
  const { fingerprint: _currentFingerprint, ...currentWithoutFingerprint } = current;
  const nextWithoutFingerprint: Omit<StoryTruthLedger, "fingerprint"> = {
    ...currentWithoutFingerprint,
    facts,
    retcons: Object.freeze([...current.retcons, retcon]),
    revision: current.revision + 1,
    updatedAt: approvedAt.toISOString(),
    previousFingerprint: current.fingerprint,
  };
  const next = Object.freeze({
    ...nextWithoutFingerprint,
    fingerprint: ledgerFingerprint(nextWithoutFingerprint),
  });
  assertValidLedger(next);
  return next;
}
