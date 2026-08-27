export const STORY_TRUTH_SCHEMA_VERSION = "storyteller-story-truth-v1" as const;
export const STORY_TRUTH_RETCON_SCHEMA_VERSION = "storyteller-story-truth-retcon-v1" as const;

export type StoryTruthSeverity = "info" | "warning" | "error";
export type StoryTruthEntityKind =
  | "character"
  | "place"
  | "organisation"
  | "group"
  | "object"
  | "concept"
  | "species"
  | "work"
  | "other";
export type StoryTruthFactStatus = "canonical" | "proposed" | "disputed" | "superseded";
export type StoryTruthFactAuthority = "source" | "approved-canon" | "author-note" | "derived";
export type StoryTruthFactCardinality = "one" | "many";
export type StoryTruthFactPolarity = "asserted" | "denied";
export type StoryTruthLiteral = string | number | boolean | null;

export interface StoryTruthFinding {
  code: string;
  severity: StoryTruthSeverity;
  message: string;
  entityId?: string;
  eventId?: string;
  factId?: string;
  relatedFactId?: string;
  retconId?: string;
  bookId?: string;
}

export interface StoryTruthManuscriptReference {
  bookId: string;
  ordinal: number;
  manuscriptRevisionId: string;
  sourceHash: string;
  sourceCodeUnitLength: number;
}

export interface StoryTruthEvidenceReference {
  bookId: string;
  manuscriptRevisionId: string;
  sourceHash: string;
  sourceStart: number;
  sourceEnd: number;
  excerptHash: string;
  segmentId?: string;
  chapterId?: string;
}

export interface CreateStoryTruthEvidenceInput {
  sourceStart: number;
  sourceEnd: number;
  segmentId?: string;
  chapterId?: string;
}

export interface StoryTruthEntity {
  id: string;
  kind: StoryTruthEntityKind;
  canonicalName: string;
  aliases: readonly string[];
  introducedInBookId: string;
  privateNotesHash?: string;
}

export interface StoryTruthEventParticipant {
  entityId: string;
  role: string;
}

export interface StoryTruthEvent {
  id: string;
  bookId: string;
  eventType: string;
  label: string;
  worldOrder: number;
  narrativeOrder: number;
  worldTimeLabel?: string;
  participants: readonly StoryTruthEventParticipant[];
  locationEntityId?: string;
  causedByEventIds: readonly string[];
  evidence: readonly StoryTruthEvidenceReference[];
}

export type StoryTruthFactObject =
  | Readonly<{ kind: "entity"; entityId: string }>
  | Readonly<{ kind: "literal"; value: StoryTruthLiteral }>;

export interface StoryTruthFact {
  id: string;
  bookId: string;
  subjectEntityId: string;
  predicate: string;
  object: StoryTruthFactObject;
  cardinality: StoryTruthFactCardinality;
  polarity: StoryTruthFactPolarity;
  status: StoryTruthFactStatus;
  authority: StoryTruthFactAuthority;
  confidence: number;
  validFromWorldOrder: number;
  validUntilWorldOrder?: number;
  assertedAtEventId?: string;
  evidence: readonly StoryTruthEvidenceReference[];
  supersedesFactIds?: readonly string[];
  supersededByRetconId?: string;
}

export interface StoryTruthRetcon {
  schemaVersion: typeof STORY_TRUTH_RETCON_SCHEMA_VERSION;
  id: string;
  targetFactIds: readonly string[];
  replacementFactIds: readonly string[];
  rationale: string;
  approvedBy: string;
  approvedAt: string;
  decisionEvidenceHash: string;
  fingerprint: string;
}

export interface StoryTruthLedger {
  schemaVersion: typeof STORY_TRUTH_SCHEMA_VERSION;
  id: string;
  projectId: string;
  seriesId?: string;
  title: string;
  manuscripts: readonly StoryTruthManuscriptReference[];
  entities: readonly StoryTruthEntity[];
  events: readonly StoryTruthEvent[];
  facts: readonly StoryTruthFact[];
  retcons: readonly StoryTruthRetcon[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  previousFingerprint?: string;
  fingerprint: string;
}

export interface CreateStoryTruthLedgerInput {
  id: string;
  projectId: string;
  seriesId?: string;
  title: string;
  manuscripts: readonly StoryTruthManuscriptReference[];
  entities?: readonly StoryTruthEntity[];
  events?: readonly StoryTruthEvent[];
  facts?: readonly StoryTruthFact[];
}

export interface StoryTruthValidation {
  ok: boolean;
  findings: readonly StoryTruthFinding[];
  contradictionCount: number;
  ambiguousAliasCount: number;
  fingerprint: string;
}

export interface StoryTruthEntityResolution {
  status: "resolved" | "ambiguous" | "not-found";
  normalizedMention: string;
  entityIds: readonly string[];
  entity?: StoryTruthEntity;
}

export interface StoryTruthFactQuery {
  worldOrder: number;
  subjectEntityId?: string;
  predicate?: string;
  includeDisputed?: boolean;
  includeProposed?: boolean;
}

export interface StoryTruthPublicView {
  schemaVersion: typeof STORY_TRUTH_SCHEMA_VERSION;
  id: string;
  projectId: string;
  seriesId?: string;
  revision: number;
  fingerprint: string;
  manuscriptCount: number;
  entityCount: number;
  eventCount: number;
  factCount: number;
  canonicalFactCount: number;
  disputedFactCount: number;
  proposedFactCount: number;
  supersededFactCount: number;
  retconCount: number;
  contradictionCount: number;
  ambiguousAliasCount: number;
  findingCodes: readonly string[];
  latestWorldOrder: number | null;
}

export type StoryTruthReplacementFact = Omit<
  StoryTruthFact,
  "status" | "supersedesFactIds" | "supersededByRetconId"
>;

export interface ApplyStoryTruthRetconInput {
  id: string;
  targetFactIds: readonly string[];
  replacements?: readonly StoryTruthReplacementFact[];
  rationale: string;
  approvedBy: string;
  approvedAt?: Date;
  decisionEvidenceHash: string;
}

export class StoryTruthValidationError extends Error {
  readonly findings: readonly StoryTruthFinding[];

  constructor(findings: readonly StoryTruthFinding[]) {
    const codes = [...new Set(findings.filter((finding) => finding.severity === "error").map((finding) => finding.code))];
    super(`STORY_TRUTH_LEDGER_INVALID:${codes.join(",") || "UNKNOWN"}`);
    this.name = "StoryTruthValidationError";
    this.findings = Object.freeze([...findings]);
  }
}

