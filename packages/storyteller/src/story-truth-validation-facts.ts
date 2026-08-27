import type {
  StoryTruthEntity,
  StoryTruthEvent,
  StoryTruthFact,
  StoryTruthFinding,
  StoryTruthLedger,
  StoryTruthManuscriptReference,
} from "./story-truth-types.js";
import {
  FACT_AUTHORITIES,
  FACT_CARDINALITIES,
  FACT_POLARITIES,
  FACT_STATUSES,
  MAX_LITERAL_LENGTH,
  addDuplicateFinding,
  finding,
  isInteger,
  isSafeId,
  isSafePredicate,
  verifyEvidence,
} from "./story-truth-internal.js";

export function validateStoryTruthFacts(
  ledger: StoryTruthLedger,
  manuscripts: ReadonlyMap<string, StoryTruthManuscriptReference>,
  entities: ReadonlyMap<string, StoryTruthEntity>,
  events: ReadonlyMap<string, StoryTruthEvent>,
  findings: StoryTruthFinding[],
): ReadonlyMap<string, StoryTruthFact> {
  const factIds = new Set<string>();
  const facts = new Map<string, StoryTruthFact>();
  for (const fact of ledger.facts) {
    const context = { factId: fact.id, entityId: fact.subjectEntityId, bookId: fact.bookId };
    if (!isSafeId(fact.id)) {
      findings.push(finding("STORY_TRUTH_FACT_ID_INVALID", "error", "Fact identifier is invalid.", context));
      continue;
    }
    addDuplicateFinding(factIds, fact.id, "STORY_TRUTH_FACT_DUPLICATE_ID", context, findings);
    if (!manuscripts.has(fact.bookId)) {
      findings.push(finding("STORY_TRUTH_FACT_BOOK_UNKNOWN", "error", "Fact references a book outside this ledger.", context));
    }
    if (!entities.has(fact.subjectEntityId)) {
      findings.push(finding("STORY_TRUTH_FACT_SUBJECT_UNKNOWN", "error", "Fact subject is not a canonical entity.", context));
    }
    if (!isSafePredicate(fact.predicate)) {
      findings.push(finding("STORY_TRUTH_FACT_PREDICATE_INVALID", "error", "Fact predicate must use a stable machine identifier.", context));
    }
    if (!FACT_CARDINALITIES.has(fact.cardinality)) {
      findings.push(finding("STORY_TRUTH_FACT_CARDINALITY_INVALID", "error", "Fact cardinality is unsupported.", context));
    }
    if (!FACT_POLARITIES.has(fact.polarity)) {
      findings.push(finding("STORY_TRUTH_FACT_POLARITY_INVALID", "error", "Fact polarity is unsupported.", context));
    }
    if (!FACT_STATUSES.has(fact.status)) {
      findings.push(finding("STORY_TRUTH_FACT_STATUS_INVALID", "error", "Fact status is unsupported.", context));
    }
    if (!FACT_AUTHORITIES.has(fact.authority)) {
      findings.push(finding("STORY_TRUTH_FACT_AUTHORITY_INVALID", "error", "Fact authority is unsupported.", context));
    }
    if (fact.object.kind === "entity") {
      if (!entities.has(fact.object.entityId)) {
        findings.push(finding(
          "STORY_TRUTH_FACT_OBJECT_ENTITY_UNKNOWN",
          "error",
          "Fact object is not a canonical entity.",
          { ...context, entityId: fact.object.entityId },
        ));
      }
    } else if (fact.object.kind === "literal") {
      const value = fact.object.value;
      if (typeof value === "number" && !Number.isFinite(value)) {
        findings.push(finding("STORY_TRUTH_FACT_LITERAL_INVALID", "error", "Fact numeric literal must be finite.", context));
      }
      if (typeof value === "string" && value.length > MAX_LITERAL_LENGTH) {
        findings.push(finding("STORY_TRUTH_FACT_LITERAL_TOO_LONG", "error", "Fact literal exceeds the bounded truth value length.", context));
      }
    } else {
      findings.push(finding("STORY_TRUTH_FACT_OBJECT_INVALID", "error", "Fact object type is unsupported.", context));
    }
    if (!Number.isFinite(fact.confidence) || fact.confidence < 0 || fact.confidence > 1) {
      findings.push(finding("STORY_TRUTH_FACT_CONFIDENCE_INVALID", "error", "Fact confidence must be between zero and one.", context));
    }
    if (!isInteger(fact.validFromWorldOrder)) {
      findings.push(finding("STORY_TRUTH_FACT_START_INVALID", "error", "Fact validity start must be a non-negative integer.", context));
    }
    if (
      fact.validUntilWorldOrder !== undefined
      && (!isInteger(fact.validUntilWorldOrder, 1) || fact.validUntilWorldOrder <= fact.validFromWorldOrder)
    ) {
      findings.push(finding("STORY_TRUTH_FACT_END_INVALID", "error", "Fact validity end must be greater than its start and is exclusive.", context));
    }
    if (fact.assertedAtEventId !== undefined && !events.has(fact.assertedAtEventId)) {
      findings.push(finding("STORY_TRUTH_FACT_EVENT_UNKNOWN", "error", "Fact assertion event is not registered.", context));
    }
    for (const evidence of fact.evidence) verifyEvidence(evidence, manuscripts, context, findings);
    if (fact.authority !== "author-note" && fact.evidence.length === 0) {
      findings.push(finding("STORY_TRUTH_FACT_EVIDENCE_REQUIRED", "error", "Source, approved and derived facts require immutable evidence.", context));
    }
    if (fact.status === "superseded" && !isSafeId(fact.supersededByRetconId)) {
      findings.push(finding("STORY_TRUTH_FACT_RETCON_REQUIRED", "error", "Superseded facts must identify the approving retcon.", context));
    }
    if (fact.status !== "superseded" && fact.supersededByRetconId !== undefined) {
      findings.push(finding("STORY_TRUTH_FACT_RETCON_STATE_INVALID", "error", "Only superseded facts may carry a superseding retcon identifier.", context));
    }
    if (fact.supersedesFactIds) {
      const targets = new Set<string>();
      for (const targetId of fact.supersedesFactIds) {
        if (!isSafeId(targetId)) {
          findings.push(finding("STORY_TRUTH_FACT_SUPERSEDES_ID_INVALID", "error", "Superseded fact identifier is invalid.", context));
        }
        if (targets.has(targetId)) {
          findings.push(finding("STORY_TRUTH_FACT_SUPERSEDES_DUPLICATE", "warning", "Replacement fact repeats a superseded fact identifier.", context));
        }
        targets.add(targetId);
      }
    }
    facts.set(fact.id, fact);
  }

  return facts;
}
