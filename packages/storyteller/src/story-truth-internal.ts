import { stableHash } from "./index.js";
import type {
  CreateStoryTruthEvidenceInput,
  StoryTruthEntityKind,
  StoryTruthEvidenceReference,
  StoryTruthFactAuthority,
  StoryTruthFactCardinality,
  StoryTruthFactObject,
  StoryTruthFactPolarity,
  StoryTruthFactStatus,
  StoryTruthFinding,
  StoryTruthLedger,
  StoryTruthManuscriptReference,
  StoryTruthRetcon,
  StoryTruthSeverity,
} from "./story-truth-types.js";

export const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
export const SAFE_PREDICATE = /^[a-z][a-z0-9._-]{1,95}$/u;
export const HASH = /^[a-f0-9]{64}$/u;
export const MAX_NAME_LENGTH = 240;
export const MAX_LITERAL_LENGTH = 4_000;
export const MAX_RATIONALE_LENGTH = 4_000;
export const ENTITY_KINDS = new Set<StoryTruthEntityKind>([
  "character",
  "place",
  "organisation",
  "group",
  "object",
  "concept",
  "species",
  "work",
  "other",
]);
export const FACT_STATUSES = new Set<StoryTruthFactStatus>(["canonical", "proposed", "disputed", "superseded"]);
export const FACT_AUTHORITIES = new Set<StoryTruthFactAuthority>(["source", "approved-canon", "author-note", "derived"]);
export const FACT_CARDINALITIES = new Set<StoryTruthFactCardinality>(["one", "many"]);
export const FACT_POLARITIES = new Set<StoryTruthFactPolarity>(["asserted", "denied"]);

export function finding(
  code: string,
  severity: StoryTruthSeverity,
  message: string,
  context: Omit<StoryTruthFinding, "code" | "severity" | "message"> = {},
): StoryTruthFinding {
  return Object.freeze({ code, severity, message, ...context });
}

export function isSafeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

export function isSafePredicate(value: unknown): value is string {
  return typeof value === "string" && SAFE_PREDICATE.test(value);
}

export function isHash(value: unknown): value is string {
  return typeof value === "string" && HASH.test(value);
}

export function isInteger(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

export function normalizedText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function normalizeStoryTruthAlias(value: string): string {
  return normalizedText(value).toLocaleLowerCase("en-AU");
}

export function createStoryTruthEvidenceReference(
  manuscript: StoryTruthManuscriptReference,
  source: string,
  input: CreateStoryTruthEvidenceInput,
): StoryTruthEvidenceReference {
  if (typeof source !== "string") throw new Error("STORY_TRUTH_EVIDENCE_SOURCE_REQUIRED");
  if (source.length !== manuscript.sourceCodeUnitLength || stableHash(source) !== manuscript.sourceHash) {
    throw new Error("STORY_TRUTH_EVIDENCE_SOURCE_MISMATCH");
  }
  if (
    !isInteger(input.sourceStart)
    || !isInteger(input.sourceEnd, 1)
    || input.sourceStart >= input.sourceEnd
    || input.sourceEnd > source.length
  ) {
    throw new Error("STORY_TRUTH_EVIDENCE_RANGE_INVALID");
  }
  if (input.segmentId !== undefined && !isSafeId(input.segmentId)) {
    throw new Error("STORY_TRUTH_EVIDENCE_SEGMENT_ID_INVALID");
  }
  if (input.chapterId !== undefined && !isSafeId(input.chapterId)) {
    throw new Error("STORY_TRUTH_EVIDENCE_CHAPTER_ID_INVALID");
  }
  return Object.freeze({
    bookId: manuscript.bookId,
    manuscriptRevisionId: manuscript.manuscriptRevisionId,
    sourceHash: manuscript.sourceHash,
    sourceStart: input.sourceStart,
    sourceEnd: input.sourceEnd,
    excerptHash: stableHash(source.slice(input.sourceStart, input.sourceEnd)),
    ...(input.segmentId ? { segmentId: input.segmentId } : {}),
    ...(input.chapterId ? { chapterId: input.chapterId } : {}),
  });
}

export function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((left, right) => left.localeCompare(right, "en-AU")));
}

export function evidenceFingerprint(evidence: StoryTruthEvidenceReference): unknown {
  return {
    bookId: evidence.bookId,
    manuscriptRevisionId: evidence.manuscriptRevisionId,
    sourceHash: evidence.sourceHash,
    sourceStart: evidence.sourceStart,
    sourceEnd: evidence.sourceEnd,
    excerptHash: evidence.excerptHash,
    segmentId: evidence.segmentId ?? null,
    chapterId: evidence.chapterId ?? null,
  };
}

export function factObjectFingerprint(object: StoryTruthFactObject): string {
  return stableHash(object.kind === "entity"
    ? { kind: object.kind, entityId: object.entityId }
    : { kind: object.kind, value: object.value });
}

export function retconFingerprint(input: Omit<StoryTruthRetcon, "fingerprint">): string {
  return stableHash({
    ...input,
    targetFactIds: sortedUnique(input.targetFactIds),
    replacementFactIds: sortedUnique(input.replacementFactIds),
  });
}

export function ledgerFingerprint(input: Omit<StoryTruthLedger, "fingerprint">): string {
  return stableHash({
    ...input,
    manuscripts: [...input.manuscripts]
      .sort((left, right) => left.ordinal - right.ordinal || left.bookId.localeCompare(right.bookId, "en-AU")),
    entities: [...input.entities]
      .map((entity) => ({ ...entity, aliases: sortedUnique(entity.aliases) }))
      .sort((left, right) => left.id.localeCompare(right.id, "en-AU")),
    events: [...input.events]
      .map((event) => ({
        ...event,
        participants: [...event.participants].sort((left, right) =>
          left.entityId.localeCompare(right.entityId, "en-AU") || left.role.localeCompare(right.role, "en-AU")
        ),
        causedByEventIds: sortedUnique(event.causedByEventIds),
        evidence: [...event.evidence]
          .map(evidenceFingerprint)
          .sort((left, right) => stableHash(left).localeCompare(stableHash(right), "en-AU")),
      }))
      .sort((left, right) => left.id.localeCompare(right.id, "en-AU")),
    facts: [...input.facts]
      .map((fact) => ({
        ...fact,
        supersedesFactIds: fact.supersedesFactIds ? sortedUnique(fact.supersedesFactIds) : null,
        evidence: [...fact.evidence]
          .map(evidenceFingerprint)
          .sort((left, right) => stableHash(left).localeCompare(stableHash(right), "en-AU")),
      }))
      .sort((left, right) => left.id.localeCompare(right.id, "en-AU")),
    retcons: [...input.retcons].sort((left, right) =>
      left.approvedAt.localeCompare(right.approvedAt, "en-AU") || left.id.localeCompare(right.id, "en-AU")
    ),
  });
}

export function addDuplicateFinding(
  seen: Set<string>,
  id: string,
  code: string,
  context: Omit<StoryTruthFinding, "code" | "severity" | "message">,
  findings: StoryTruthFinding[],
): void {
  if (seen.has(id)) {
    findings.push(finding(code, "error", `Duplicate identifier ${id} is not permitted.`, context));
  }
  seen.add(id);
}

export function verifyEvidence(
  evidence: StoryTruthEvidenceReference,
  manuscripts: ReadonlyMap<string, StoryTruthManuscriptReference>,
  context: Omit<StoryTruthFinding, "code" | "severity" | "message">,
  findings: StoryTruthFinding[],
): void {
  const manuscript = manuscripts.get(evidence.bookId);
  if (!manuscript) {
    findings.push(finding(
      "STORY_TRUTH_EVIDENCE_BOOK_UNKNOWN",
      "error",
      `Evidence references unknown book ${evidence.bookId}.`,
      { ...context, bookId: evidence.bookId },
    ));
    return;
  }
  if (evidence.manuscriptRevisionId !== manuscript.manuscriptRevisionId) {
    findings.push(finding(
      "STORY_TRUTH_EVIDENCE_REVISION_MISMATCH",
      "error",
      "Evidence belongs to a different immutable manuscript revision.",
      { ...context, bookId: evidence.bookId },
    ));
  }
  if (evidence.sourceHash !== manuscript.sourceHash) {
    findings.push(finding(
      "STORY_TRUTH_EVIDENCE_SOURCE_HASH_MISMATCH",
      "error",
      "Evidence source hash does not match the registered immutable manuscript.",
      { ...context, bookId: evidence.bookId },
    ));
  }
  if (
    !isInteger(evidence.sourceStart)
    || !isInteger(evidence.sourceEnd, 1)
    || evidence.sourceStart >= evidence.sourceEnd
    || evidence.sourceEnd > manuscript.sourceCodeUnitLength
  ) {
    findings.push(finding(
      "STORY_TRUTH_EVIDENCE_RANGE_INVALID",
      "error",
      "Evidence source range is outside the registered manuscript revision.",
      { ...context, bookId: evidence.bookId },
    ));
  }
  if (!isHash(evidence.excerptHash)) {
    findings.push(finding(
      "STORY_TRUTH_EVIDENCE_HASH_INVALID",
      "error",
      "Evidence must retain a SHA-256 hash of the exact supporting source span.",
      { ...context, bookId: evidence.bookId },
    ));
  }
  if (evidence.segmentId !== undefined && !isSafeId(evidence.segmentId)) {
    findings.push(finding(
      "STORY_TRUTH_EVIDENCE_SEGMENT_ID_INVALID",
      "error",
      "Evidence segment identifier is invalid.",
      { ...context, bookId: evidence.bookId },
    ));
  }
  if (evidence.chapterId !== undefined && !isSafeId(evidence.chapterId)) {
    findings.push(finding(
      "STORY_TRUTH_EVIDENCE_CHAPTER_ID_INVALID",
      "error",
      "Evidence chapter identifier is invalid.",
      { ...context, bookId: evidence.bookId },
    ));
  }
}

