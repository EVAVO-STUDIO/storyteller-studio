import type {
  StoryTruthEntityKind,
  StoryTruthFactAuthority,
  StoryTruthFactCardinality,
  StoryTruthFactObject,
  StoryTruthFactPolarity,
  StoryTruthFactStatus,
  StoryTruthSeverity,
} from "./story-truth-types.js";

export type StoryTruthQueryCollection =
  | "entities"
  | "facts"
  | "timeline"
  | "findings"
  | "review";

export type StoryTruthReviewKind =
  | "ambiguous-alias"
  | "proposed-fact"
  | "disputed-fact"
  | "validation-finding";

export interface StoryTruthEntityReadView {
  id: string;
  kind: StoryTruthEntityKind;
  canonicalName: string;
  aliases: readonly string[];
  introducedInBookId: string;
}

export interface StoryTruthEventReadView {
  id: string;
  bookId: string;
  eventType: string;
  label: string;
  worldOrder: number;
  narrativeOrder: number;
  worldTimeLabel?: string;
  participants: readonly Readonly<{ entityId: string; role: string }>[];
  locationEntityId?: string;
  causedByEventIds: readonly string[];
}

export interface StoryTruthFactReadView {
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
  supersedesFactIds?: readonly string[];
  supersededByRetconId?: string;
}

export interface StoryTruthFindingReadView {
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

export interface StoryTruthReviewItem {
  id: string;
  kind: StoryTruthReviewKind;
  severity: StoryTruthSeverity;
  summary: string;
  code?: string;
  normalizedAlias?: string;
  entityIds: readonly string[];
  eventIds: readonly string[];
  factIds: readonly string[];
  requiresHumanDecision: true;
}

export interface StoryTruthEntityResolutionReadView {
  status: "resolved" | "ambiguous" | "not-found";
  normalizedMention: string;
  entityIds: readonly string[];
  entity?: StoryTruthEntityReadView;
}

export interface StoryTruthQueryMeta {
  ledgerId: string;
  ledgerRevision: number;
  ledgerFingerprint: string;
  collection: StoryTruthQueryCollection;
  queryFingerprint: string;
  total: number;
  returned: number;
  hasMore: boolean;
  nextCursor?: string;
}

export interface StoryTruthQueryPage<T> {
  data: readonly T[];
  meta: StoryTruthQueryMeta;
}

export interface StoryTruthPageInput {
  limit?: number;
  cursor?: string;
}

export interface StoryTruthEntityQuery extends StoryTruthPageInput {
  kind?: StoryTruthEntityKind;
  search?: string;
}

export interface StoryTruthFactQueryInput extends StoryTruthPageInput {
  worldOrder?: number;
  subjectEntityId?: string;
  predicate?: string;
  statuses?: readonly StoryTruthFactStatus[];
}

export interface StoryTruthTimelineQuery extends StoryTruthPageInput {
  entityId?: string;
  bookId?: string;
  minimumWorldOrder?: number;
  maximumWorldOrder?: number;
}

export interface StoryTruthFindingQuery extends StoryTruthPageInput {
  severity?: StoryTruthSeverity;
  code?: string;
  entityId?: string;
  eventId?: string;
  factId?: string;
}

export interface StoryTruthReviewQuery extends StoryTruthPageInput {
  kind?: StoryTruthReviewKind;
  severity?: StoryTruthSeverity;
}
