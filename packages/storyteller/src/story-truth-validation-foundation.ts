import {
  STORY_TRUTH_SCHEMA_VERSION,
  type StoryTruthEntity,
  type StoryTruthFinding,
  type StoryTruthLedger,
  type StoryTruthManuscriptReference,
} from "./story-truth-types.js";
import {
  ENTITY_KINDS,
  MAX_NAME_LENGTH,
  addDuplicateFinding,
  finding,
  isHash,
  isInteger,
  isSafeId,
  normalizedText,
} from "./story-truth-internal.js";

export interface StoryTruthFoundationValidation {
  manuscripts: ReadonlyMap<string, StoryTruthManuscriptReference>;
  entities: ReadonlyMap<string, StoryTruthEntity>;
}

export function validateStoryTruthFoundation(
  ledger: StoryTruthLedger,
  findings: StoryTruthFinding[],
): StoryTruthFoundationValidation {
  if (ledger.schemaVersion !== STORY_TRUTH_SCHEMA_VERSION) {
    findings.push(finding("STORY_TRUTH_SCHEMA_UNSUPPORTED", "error", "Story truth ledger schema is unsupported."));
  }
  if (!isSafeId(ledger.id)) findings.push(finding("STORY_TRUTH_ID_INVALID", "error", "Story truth ledger identifier is invalid."));
  if (!isSafeId(ledger.projectId)) findings.push(finding("STORY_TRUTH_PROJECT_ID_INVALID", "error", "Story truth project identifier is invalid."));
  if (ledger.seriesId !== undefined && !isSafeId(ledger.seriesId)) {
    findings.push(finding("STORY_TRUTH_SERIES_ID_INVALID", "error", "Story truth series identifier is invalid."));
  }
  if (typeof ledger.title !== "string" || normalizedText(ledger.title).length === 0 || ledger.title.length > MAX_NAME_LENGTH) {
    findings.push(finding("STORY_TRUTH_TITLE_INVALID", "error", "Story truth title is missing or too long."));
  }
  if (!isInteger(ledger.revision, 1)) findings.push(finding("STORY_TRUTH_REVISION_INVALID", "error", "Story truth revision is invalid."));
  if (Number.isNaN(Date.parse(ledger.createdAt)) || Number.isNaN(Date.parse(ledger.updatedAt))) {
    findings.push(finding("STORY_TRUTH_TIMESTAMP_INVALID", "error", "Story truth timestamps are invalid."));
  } else if (Date.parse(ledger.updatedAt) < Date.parse(ledger.createdAt)) {
    findings.push(finding("STORY_TRUTH_TIMESTAMP_REGRESSION", "error", "Story truth update time precedes creation time."));
  }
  if (ledger.revision === 1 && ledger.previousFingerprint !== undefined) {
    findings.push(finding(
      "STORY_TRUTH_INITIAL_PREVIOUS_FINGERPRINT_FORBIDDEN",
      "error",
      "The first story truth revision cannot claim an earlier ledger fingerprint.",
    ));
  } else if (ledger.revision > 1 && !isHash(ledger.previousFingerprint)) {
    findings.push(finding(
      "STORY_TRUTH_PREVIOUS_FINGERPRINT_REQUIRED",
      "error",
      "Revised story truth must link to the exact preceding ledger fingerprint.",
    ));
  }

  const manuscriptIds = new Set<string>();
  const manuscriptOrdinals = new Set<number>();
  const manuscripts = new Map<string, StoryTruthManuscriptReference>();
  for (const manuscript of ledger.manuscripts) {
    const context = { bookId: manuscript.bookId };
    if (!isSafeId(manuscript.bookId)) {
      findings.push(finding("STORY_TRUTH_BOOK_ID_INVALID", "error", "Book identifier is invalid.", context));
      continue;
    }
    addDuplicateFinding(manuscriptIds, manuscript.bookId, "STORY_TRUTH_BOOK_DUPLICATE", context, findings);
    if (!isInteger(manuscript.ordinal, 1)) {
      findings.push(finding("STORY_TRUTH_BOOK_ORDINAL_INVALID", "error", "Book ordinal must be a positive integer.", context));
    } else if (manuscriptOrdinals.has(manuscript.ordinal)) {
      findings.push(finding("STORY_TRUTH_BOOK_ORDINAL_DUPLICATE", "error", `Book ordinal ${manuscript.ordinal} is duplicated.`, context));
    }
    manuscriptOrdinals.add(manuscript.ordinal);
    if (!isSafeId(manuscript.manuscriptRevisionId)) {
      findings.push(finding("STORY_TRUTH_MANUSCRIPT_REVISION_ID_INVALID", "error", "Manuscript revision identifier is invalid.", context));
    }
    if (!isHash(manuscript.sourceHash)) {
      findings.push(finding("STORY_TRUTH_MANUSCRIPT_HASH_INVALID", "error", "Manuscript source hash is invalid.", context));
    }
    if (!isInteger(manuscript.sourceCodeUnitLength, 1)) {
      findings.push(finding("STORY_TRUTH_MANUSCRIPT_LENGTH_INVALID", "error", "Manuscript source length is invalid.", context));
    }
    manuscripts.set(manuscript.bookId, manuscript);
  }
  if (ledger.manuscripts.length === 0) {
    findings.push(finding("STORY_TRUTH_MANUSCRIPT_REQUIRED", "error", "At least one immutable manuscript revision is required."));
  }

  const entityIds = new Set<string>();
  const entities = new Map<string, StoryTruthEntity>();
  for (const entity of ledger.entities) {
    const context = { entityId: entity.id };
    if (!isSafeId(entity.id)) {
      findings.push(finding("STORY_TRUTH_ENTITY_ID_INVALID", "error", "Entity identifier is invalid.", context));
      continue;
    }
    addDuplicateFinding(entityIds, entity.id, "STORY_TRUTH_ENTITY_DUPLICATE", context, findings);
    if (!ENTITY_KINDS.has(entity.kind)) {
      findings.push(finding("STORY_TRUTH_ENTITY_KIND_INVALID", "error", "Entity kind is unsupported.", context));
    }
    if (
      typeof entity.canonicalName !== "string"
      || normalizedText(entity.canonicalName).length === 0
      || entity.canonicalName.length > MAX_NAME_LENGTH
    ) {
      findings.push(finding("STORY_TRUTH_ENTITY_NAME_INVALID", "error", "Entity canonical name is missing or too long.", context));
    }
    for (const alias of entity.aliases) {
      if (typeof alias !== "string" || normalizedText(alias).length === 0 || alias.length > MAX_NAME_LENGTH) {
        findings.push(finding("STORY_TRUTH_ENTITY_ALIAS_INVALID", "error", "Entity alias is missing or too long.", context));
      }
    }
    if (!manuscripts.has(entity.introducedInBookId)) {
      findings.push(finding(
        "STORY_TRUTH_ENTITY_BOOK_UNKNOWN",
        "error",
        "Entity introduction references a book outside this ledger.",
        { ...context, bookId: entity.introducedInBookId },
      ));
    }
    if (entity.privateNotesHash !== undefined && !isHash(entity.privateNotesHash)) {
      findings.push(finding("STORY_TRUTH_ENTITY_NOTES_HASH_INVALID", "error", "Private notes hash is invalid.", context));
    }
    entities.set(entity.id, entity);
  }

  return Object.freeze({ manuscripts, entities });
}
