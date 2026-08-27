import type {
  StoryTruthEntity,
  StoryTruthEvent,
  StoryTruthFact,
  StoryTruthFinding,
  StoryTruthLedger,
  StoryTruthSeverity,
} from "./story-truth-types.js";
import {
  factObjectFingerprint,
  finding,
  isInteger,
  normalizeStoryTruthAlias,
} from "./story-truth-internal.js";

function intervalEnd(fact: StoryTruthFact): number {
  return fact.validUntilWorldOrder ?? Number.POSITIVE_INFINITY;
}

function intervalsOverlap(left: StoryTruthFact, right: StoryTruthFact): boolean {
  return left.validFromWorldOrder < intervalEnd(right)
    && right.validFromWorldOrder < intervalEnd(left);
}

function activeFact(fact: StoryTruthFact): boolean {
  return fact.status !== "superseded";
}

export function analyseStoryTruthContradictions(
  ledger: Pick<StoryTruthLedger, "facts">,
): readonly StoryTruthFinding[] {
  const findings: StoryTruthFinding[] = [];
  const facts = ledger.facts.filter(activeFact);
  for (let leftIndex = 0; leftIndex < facts.length; leftIndex += 1) {
    const left = facts[leftIndex];
    if (!left || !isInteger(left.validFromWorldOrder)) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < facts.length; rightIndex += 1) {
      const right = facts[rightIndex];
      if (!right || !isInteger(right.validFromWorldOrder)) continue;
      if (left.subjectEntityId !== right.subjectEntityId || left.predicate !== right.predicate) continue;
      if (!intervalsOverlap(left, right)) continue;

      if (left.cardinality !== right.cardinality) {
        const severity: StoryTruthSeverity = left.status === "canonical" && right.status === "canonical"
          ? "error"
          : "warning";
        findings.push(finding(
          "STORY_TRUTH_FACT_CARDINALITY_CONFLICT",
          severity,
          `Facts ${left.id} and ${right.id} disagree about whether ${left.predicate} is single or multi-valued.`,
          {
            entityId: left.subjectEntityId,
            factId: left.id,
            relatedFactId: right.id,
          },
        ));
        continue;
      }

      const sameObject = factObjectFingerprint(left.object) === factObjectFingerprint(right.object);
      const oppositePolarity = left.polarity !== right.polarity;
      const singleValueConflict = left.cardinality === "one"
        && right.cardinality === "one"
        && (!sameObject || oppositePolarity);
      const membershipConflict = sameObject && oppositePolarity;

      if (singleValueConflict || membershipConflict) {
        const severity: StoryTruthSeverity = left.status === "canonical" && right.status === "canonical"
          ? "error"
          : "warning";
        findings.push(finding(
          "STORY_TRUTH_FACT_CONTRADICTION",
          severity,
          `Facts ${left.id} and ${right.id} assert incompatible truth over an overlapping world-time interval.`,
          {
            entityId: left.subjectEntityId,
            factId: left.id,
            relatedFactId: right.id,
          },
        ));
      } else if (
        sameObject
        && left.polarity === right.polarity
        && left.status === "canonical"
        && right.status === "canonical"
      ) {
        findings.push(finding(
          "STORY_TRUTH_FACT_DUPLICATE",
          "warning",
          `Facts ${left.id} and ${right.id} redundantly assert the same canonical truth over an overlapping interval.`,
          {
            entityId: left.subjectEntityId,
            factId: left.id,
            relatedFactId: right.id,
          },
        ));
      }
    }
  }
  return Object.freeze(findings);
}

export function causalCycleFindings(events: readonly StoryTruthEvent[]): readonly StoryTruthFinding[] {
  const findings: StoryTruthFinding[] = [];
  const eventMap = new Map(events.map((event) => [event.id, event]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const reported = new Set<string>();

  const visit = (eventId: string): void => {
    if (visited.has(eventId)) return;
    if (visiting.has(eventId)) {
      if (!reported.has(eventId)) {
        findings.push(finding(
          "STORY_TRUTH_CAUSAL_CYCLE",
          "error",
          `Event ${eventId} participates in a causal cycle.`,
          { eventId },
        ));
        reported.add(eventId);
      }
      return;
    }
    const event = eventMap.get(eventId);
    if (!event) return;
    visiting.add(eventId);
    for (const causeId of event.causedByEventIds) visit(causeId);
    visiting.delete(eventId);
    visited.add(eventId);
  };

  for (const event of events) visit(event.id);
  return Object.freeze(findings);
}

export function ambiguousAliasFindings(entities: readonly StoryTruthEntity[]): readonly StoryTruthFinding[] {
  const aliasMap = new Map<string, Set<string>>();
  for (const entity of entities) {
    for (const alias of [entity.canonicalName, ...entity.aliases]) {
      const normalized = normalizeStoryTruthAlias(alias);
      if (!normalized) continue;
      const matches = aliasMap.get(normalized) ?? new Set<string>();
      matches.add(entity.id);
      aliasMap.set(normalized, matches);
    }
  }
  const findings: StoryTruthFinding[] = [];
  for (const [alias, entityIds] of aliasMap) {
    if (entityIds.size < 2) continue;
    findings.push(finding(
      "STORY_TRUTH_ALIAS_AMBIGUOUS",
      "warning",
      `Alias “${alias}” resolves to multiple canonical entities: ${[...entityIds].sort().join(", ")}.`,
    ));
  }
  return Object.freeze(findings);
}

