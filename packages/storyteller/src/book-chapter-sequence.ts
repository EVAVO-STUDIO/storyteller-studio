import {
  assertArtifactRecord,
  type ArtifactRecord,
} from "./artifact-registry.js";
import {
  assertMasteredChapterArtifactChain,
  type MasteredChapterArtifactChain,
} from "./mastered-chapter.js";
import {
  assertMasteredChapterReviewSession,
  type MasteredChapterReviewSession,
} from "./mastered-chapter-review.js";
import {
  assertMasteringPlan,
  type MasteringOutputProfile,
  type MasteringPlan,
} from "./mastering-plan.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";
import { stableHash } from "./index.js";

export const BOOK_CHAPTER_SEQUENCE_SCHEMA_VERSION =
  "storyteller-book-chapter-sequence-v1" as const;

export type BookChapterRole = "prologue" | "chapter" | "epilogue";

export interface BookChapterSequenceEntry {
  ordinal: number;
  role: BookChapterRole;
  chapterId: string;
  title: string;
  durationMs: number;
  masteredArtifact: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
    contentHash: string;
    byteCount: number;
  }>;
  masteredChainFingerprint: string;
  reviewSessionFingerprint: string;
  masteringPlanFingerprint: string;
  fingerprint: string;
}

export interface BookChapterSequence {
  schemaVersion: typeof BOOK_CHAPTER_SEQUENCE_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  title: string;
  languageTag: string;
  seriesTitle?: string;
  volumeNumber?: number;
  rightsFingerprint: string;
  engineeringProfileFingerprint: string;
  output: MasteringOutputProfile;
  chapters: readonly BookChapterSequenceEntry[];
  totalDurationMs: number;
  status: "ready-for-credits";
  createdByActorId: string;
  revision: number;
  previousFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface CreateBookChapterSequenceEntryInput {
  ordinal: number;
  role: BookChapterRole;
  title: string;
  masteringPlan: MasteringPlan;
  masteredChain: MasteredChapterArtifactChain;
  reviewSession: MasteredChapterReviewSession;
  approvedArtifact: ArtifactRecord;
}

export interface CreateBookChapterSequenceInput {
  id: string;
  projectId: string;
  bookId: string;
  title: string;
  languageTag: string;
  seriesTitle?: string;
  volumeNumber?: number;
  chapters: readonly CreateBookChapterSequenceEntryInput[];
  createdByActorId: string;
  createdAt?: Date;
}

export interface BookChapterSequencePublicEntry {
  ordinal: number;
  role: BookChapterRole;
  chapterId: string;
  title: string;
  durationMs: number;
}

export interface BookChapterSequencePublicView {
  id: string;
  bookId: string;
  title: string;
  languageTag: string;
  seriesTitle?: string;
  volumeNumber?: number;
  output: MasteringOutputProfile;
  chapterCount: number;
  totalDurationMs: number;
  chapters: readonly BookChapterSequencePublicEntry[];
  status: "ready-for-credits";
  revision: number;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export class BookChapterSequenceError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "BookChapterSequenceError";
    this.code = code;
  }
}

export class BookChapterSequenceStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookChapterSequenceStoreConflictError";
  }
}

const ENTITY_TYPE = "book-chapter-sequence" as const;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const LANGUAGE_TAG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const MAX_TITLE_LENGTH = 500;
const MAX_CHAPTERS = 2_000;
const MAX_BOOK_DURATION_MS = 14 * 24 * 60 * 60 * 1_000;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new BookChapterSequenceError(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new BookChapterSequenceError(code);
  return value;
}

function requireText(value: string, maximum: number, code: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum || CONTROL_CHARACTERS.test(trimmed)) {
    throw new BookChapterSequenceError(code);
  }
  return trimmed;
}

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new BookChapterSequenceError(code);
  }
  return value;
}

function requireCurrentRights(record: ArtifactRecord, now: Date): void {
  if (!record.rights.allowedUses.includes("audiobook")) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_AUDIOBOOK_RIGHTS_REQUIRED");
  }
  if (!record.rights.commercialUseApproved) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_COMMERCIAL_RIGHTS_REQUIRED");
  }
  if (record.rights.expiresAt && Date.parse(record.rights.expiresAt) <= now.getTime()) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_RIGHTS_EXPIRED");
  }
  if (
    record.rights.deletionRequiredAt
    && Date.parse(record.rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_RETENTION_EXPIRED");
  }
}

function immutableArtifactIdentity(record: ArtifactRecord): string {
  return stableHash({
    schemaVersion: record.schemaVersion,
    id: record.id,
    kind: record.kind,
    projectId: record.projectId,
    jobId: record.jobId ?? null,
    segmentId: record.segmentId ?? null,
    takeId: record.takeId ?? null,
    storage: record.storage,
    integrity: record.integrity,
    provenance: record.provenance,
    rights: record.rights,
    createdAt: record.createdAt,
  });
}

function entryFingerprint(
  entry: Omit<BookChapterSequenceEntry, "fingerprint">,
): string {
  return stableHash(entry);
}

function sequenceFingerprint(
  sequence: Omit<BookChapterSequence, "fingerprint">,
): string {
  return stableHash(sequence);
}

function validateApprovedChapter(
  input: CreateBookChapterSequenceEntryInput,
  projectId: string,
  now: Date,
): Readonly<{
  chapterId: string;
  durationMs: number;
  rightsFingerprint: string;
  engineeringProfileFingerprint: string;
  output: MasteringOutputProfile;
}> {
  assertMasteringPlan(input.masteringPlan);
  assertMasteredChapterArtifactChain(input.masteredChain);
  assertMasteredChapterReviewSession(input.reviewSession);
  assertArtifactRecord(input.approvedArtifact);

  const sourceArtifact = input.masteredChain.masteredChapter.payload;
  if (
    input.masteredChain.eligibleForReview !== true
    || input.reviewSession.status !== "approved"
    || !input.reviewSession.approval
    || input.approvedArtifact.kind !== "mastered-chapter"
    || input.approvedArtifact.verification.status !== "verified"
    || input.approvedArtifact.review.status !== "approved"
    || input.approvedArtifact.quarantine
    || input.approvedArtifact.release.status !== "unavailable"
  ) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_CHAPTER_NOT_APPROVED");
  }
  if (
    input.masteringPlan.id !== input.masteredChain.planId
    || input.masteringPlan.fingerprint !== input.masteredChain.planFingerprint
    || input.masteringPlan.projectId !== projectId
    || input.masteringPlan.chapterId !== sourceArtifact.segmentId
    || input.masteredChain.postMasterEngineering.evidence.profile.fingerprint
      !== input.masteringPlan.targetProfile.fingerprint
  ) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_MASTERING_SCOPE_MISMATCH");
  }
  if (
    input.reviewSession.projectId !== projectId
    || input.reviewSession.chapterId !== sourceArtifact.segmentId
    || input.reviewSession.chainFingerprint !== input.masteredChain.fingerprint
    || input.reviewSession.masteredArtifact.id !== sourceArtifact.id
    || input.reviewSession.masteredArtifact.revision !== sourceArtifact.revision
    || input.reviewSession.masteredArtifact.fingerprint !== sourceArtifact.fingerprint
    || input.reviewSession.masteredArtifact.contentHash !== sourceArtifact.integrity.contentHash
    || input.reviewSession.masteredArtifact.byteCount !== sourceArtifact.integrity.byteCount
    || input.reviewSession.approval.artifactReviewFingerprint
      !== input.approvedArtifact.fingerprint
  ) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_REVIEW_SCOPE_MISMATCH");
  }
  if (
    input.approvedArtifact.id !== sourceArtifact.id
    || input.approvedArtifact.revision !== sourceArtifact.revision + 1
    || input.approvedArtifact.previousFingerprint !== sourceArtifact.fingerprint
    || immutableArtifactIdentity(input.approvedArtifact)
      !== immutableArtifactIdentity(sourceArtifact)
  ) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_ARTIFACT_REVISION_MISMATCH");
  }
  if (
    input.approvedArtifact.projectId !== projectId
    || input.approvedArtifact.segmentId !== input.masteringPlan.chapterId
  ) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_PROJECT_SCOPE_MISMATCH");
  }
  requireCurrentRights(input.approvedArtifact, now);
  return Object.freeze({
    chapterId: requireIdentifier(
      input.masteringPlan.chapterId,
      "BOOK_SEQUENCE_CHAPTER_ID_INVALID",
    ),
    durationMs: requireInteger(
      input.masteredChain.comparison.observedDurationMs,
      1,
      7 * 24 * 60 * 60 * 1_000,
      "BOOK_SEQUENCE_CHAPTER_DURATION_INVALID",
    ),
    rightsFingerprint: requireHash(
      input.approvedArtifact.rights.rightsFingerprint,
      "BOOK_SEQUENCE_RIGHTS_FINGERPRINT_INVALID",
    ),
    engineeringProfileFingerprint: requireHash(
      input.masteringPlan.targetProfile.fingerprint,
      "BOOK_SEQUENCE_ENGINEERING_PROFILE_INVALID",
    ),
    output: Object.freeze({ ...input.masteringPlan.output }),
  });
}

function validateRolePlacement(entries: readonly BookChapterSequenceEntry[]): void {
  const prologues = entries.filter((entry) => entry.role === "prologue");
  const epilogues = entries.filter((entry) => entry.role === "epilogue");
  if (prologues.length > 1 || epilogues.length > 1) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_SPECIAL_ROLE_DUPLICATE");
  }
  if (prologues.length === 1 && prologues[0]?.ordinal !== 1) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_PROLOGUE_POSITION_INVALID");
  }
  if (
    epilogues.length === 1
    && epilogues[0]?.ordinal !== entries.length
  ) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_EPILOGUE_POSITION_INVALID");
  }
}

function buildEntries(
  inputs: readonly CreateBookChapterSequenceEntryInput[],
  projectId: string,
  now: Date,
): Readonly<{
  entries: readonly BookChapterSequenceEntry[];
  rightsFingerprint: string;
  engineeringProfileFingerprint: string;
  output: MasteringOutputProfile;
  totalDurationMs: number;
}> {
  if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > MAX_CHAPTERS) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_CHAPTERS_INVALID");
  }
  const sorted = [...inputs].sort((left, right) => left.ordinal - right.ordinal);
  const chapterIds = new Set<string>();
  const artifactIds = new Set<string>();
  const entries: BookChapterSequenceEntry[] = [];
  let rightsFingerprint: string | undefined;
  let engineeringProfileFingerprint: string | undefined;
  let output: MasteringOutputProfile | undefined;
  let totalDurationMs = 0;

  for (const [index, input] of sorted.entries()) {
    const ordinal = requireInteger(
      input.ordinal,
      1,
      inputs.length,
      "BOOK_SEQUENCE_ORDINAL_INVALID",
    );
    if (ordinal !== index + 1) {
      throw new BookChapterSequenceError("BOOK_SEQUENCE_ORDINALS_NOT_CONTIGUOUS");
    }
    if (!(["prologue", "chapter", "epilogue"] as const).includes(input.role)) {
      throw new BookChapterSequenceError("BOOK_SEQUENCE_ROLE_INVALID");
    }
    const admitted = validateApprovedChapter(input, projectId, now);
    if (chapterIds.has(admitted.chapterId)) {
      throw new BookChapterSequenceError("BOOK_SEQUENCE_CHAPTER_DUPLICATE");
    }
    if (artifactIds.has(input.approvedArtifact.id)) {
      throw new BookChapterSequenceError("BOOK_SEQUENCE_ARTIFACT_DUPLICATE");
    }
    chapterIds.add(admitted.chapterId);
    artifactIds.add(input.approvedArtifact.id);

    rightsFingerprint ??= admitted.rightsFingerprint;
    engineeringProfileFingerprint ??= admitted.engineeringProfileFingerprint;
    output ??= admitted.output;
    if (admitted.rightsFingerprint !== rightsFingerprint) {
      throw new BookChapterSequenceError("BOOK_SEQUENCE_RIGHTS_MISMATCH");
    }
    if (admitted.engineeringProfileFingerprint !== engineeringProfileFingerprint) {
      throw new BookChapterSequenceError("BOOK_SEQUENCE_ENGINEERING_PROFILE_MISMATCH");
    }
    if (stableHash(admitted.output) !== stableHash(output)) {
      throw new BookChapterSequenceError("BOOK_SEQUENCE_OUTPUT_PROFILE_MISMATCH");
    }
    totalDurationMs += admitted.durationMs;
    if (totalDurationMs > MAX_BOOK_DURATION_MS) {
      throw new BookChapterSequenceError("BOOK_SEQUENCE_DURATION_EXCEEDED");
    }

    const partial: Omit<BookChapterSequenceEntry, "fingerprint"> = {
      ordinal,
      role: input.role,
      chapterId: admitted.chapterId,
      title: requireText(input.title, MAX_TITLE_LENGTH, "BOOK_SEQUENCE_CHAPTER_TITLE_INVALID"),
      durationMs: admitted.durationMs,
      masteredArtifact: Object.freeze({
        id: input.approvedArtifact.id,
        revision: input.approvedArtifact.revision,
        fingerprint: input.approvedArtifact.fingerprint,
        contentHash: input.approvedArtifact.integrity.contentHash,
        byteCount: input.approvedArtifact.integrity.byteCount,
      }),
      masteredChainFingerprint: input.masteredChain.fingerprint,
      reviewSessionFingerprint: input.reviewSession.fingerprint,
      masteringPlanFingerprint: input.masteringPlan.fingerprint,
    };
    entries.push(Object.freeze({ ...partial, fingerprint: entryFingerprint(partial) }));
  }
  validateRolePlacement(entries);
  return Object.freeze({
    entries: Object.freeze(entries),
    rightsFingerprint: rightsFingerprint!,
    engineeringProfileFingerprint: engineeringProfileFingerprint!,
    output: Object.freeze({ ...output! }),
    totalDurationMs,
  });
}

function buildSequence(
  input: CreateBookChapterSequenceInput,
  revision: number,
  createdAt: Date,
  previous?: BookChapterSequence,
): BookChapterSequence {
  requireIdentifier(input.id, "BOOK_SEQUENCE_ID_INVALID");
  requireIdentifier(input.projectId, "BOOK_SEQUENCE_PROJECT_ID_INVALID");
  requireIdentifier(input.bookId, "BOOK_SEQUENCE_BOOK_ID_INVALID");
  requireIdentifier(input.createdByActorId, "BOOK_SEQUENCE_ACTOR_ID_INVALID");
  const title = requireText(input.title, MAX_TITLE_LENGTH, "BOOK_SEQUENCE_TITLE_INVALID");
  if (!LANGUAGE_TAG.test(input.languageTag)) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_LANGUAGE_TAG_INVALID");
  }
  const seriesTitle = input.seriesTitle === undefined
    ? undefined
    : requireText(input.seriesTitle, MAX_TITLE_LENGTH, "BOOK_SEQUENCE_SERIES_TITLE_INVALID");
  if (
    input.volumeNumber !== undefined
    && (!Number.isSafeInteger(input.volumeNumber)
      || input.volumeNumber < 1
      || input.volumeNumber > 10_000)
  ) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_VOLUME_NUMBER_INVALID");
  }
  if (Number.isNaN(createdAt.getTime())) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_DATE_INVALID");
  }
  const built = buildEntries(input.chapters, input.projectId, createdAt);
  const partial: Omit<BookChapterSequence, "fingerprint"> = {
    schemaVersion: BOOK_CHAPTER_SEQUENCE_SCHEMA_VERSION,
    id: input.id,
    projectId: input.projectId,
    bookId: input.bookId,
    title,
    languageTag: input.languageTag,
    ...(seriesTitle ? { seriesTitle } : {}),
    ...(input.volumeNumber !== undefined ? { volumeNumber: input.volumeNumber } : {}),
    rightsFingerprint: built.rightsFingerprint,
    engineeringProfileFingerprint: built.engineeringProfileFingerprint,
    output: built.output,
    chapters: built.entries,
    totalDurationMs: built.totalDurationMs,
    status: "ready-for-credits",
    createdByActorId: input.createdByActorId,
    revision,
    ...(previous ? { previousFingerprint: previous.fingerprint } : {}),
    createdAt: previous?.createdAt ?? createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
  };
  const sequence = Object.freeze({ ...partial, fingerprint: sequenceFingerprint(partial) });
  assertBookChapterSequence(sequence);
  return sequence;
}

export function createBookChapterSequence(
  input: CreateBookChapterSequenceInput,
): BookChapterSequence {
  return buildSequence(input, 1, input.createdAt ?? new Date());
}

export function reviseBookChapterSequence(
  current: BookChapterSequence,
  input: CreateBookChapterSequenceInput,
): BookChapterSequence {
  assertBookChapterSequence(current);
  if (
    input.id !== current.id
    || input.projectId !== current.projectId
    || input.bookId !== current.bookId
  ) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_IMMUTABLE_SCOPE_CHANGED");
  }
  const updatedAt = input.createdAt ?? new Date();
  if (updatedAt.getTime() < Date.parse(current.updatedAt)) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_TRANSITION_TIME_REVERSED");
  }
  return buildSequence(input, current.revision + 1, updatedAt, current);
}

export function assertBookChapterSequence(sequence: BookChapterSequence): void {
  if (sequence.schemaVersion !== BOOK_CHAPTER_SEQUENCE_SCHEMA_VERSION) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(sequence.id, "BOOK_SEQUENCE_ID_INVALID");
  requireIdentifier(sequence.projectId, "BOOK_SEQUENCE_PROJECT_ID_INVALID");
  requireIdentifier(sequence.bookId, "BOOK_SEQUENCE_BOOK_ID_INVALID");
  requireIdentifier(sequence.createdByActorId, "BOOK_SEQUENCE_ACTOR_ID_INVALID");
  requireText(sequence.title, MAX_TITLE_LENGTH, "BOOK_SEQUENCE_TITLE_INVALID");
  if (!LANGUAGE_TAG.test(sequence.languageTag)) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_LANGUAGE_TAG_INVALID");
  }
  if (sequence.seriesTitle !== undefined) {
    requireText(sequence.seriesTitle, MAX_TITLE_LENGTH, "BOOK_SEQUENCE_SERIES_TITLE_INVALID");
  }
  if (
    sequence.volumeNumber !== undefined
    && (!Number.isSafeInteger(sequence.volumeNumber)
      || sequence.volumeNumber < 1
      || sequence.volumeNumber > 10_000)
  ) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_VOLUME_NUMBER_INVALID");
  }
  requireHash(sequence.rightsFingerprint, "BOOK_SEQUENCE_RIGHTS_FINGERPRINT_INVALID");
  requireHash(
    sequence.engineeringProfileFingerprint,
    "BOOK_SEQUENCE_ENGINEERING_PROFILE_INVALID",
  );
  if (
    sequence.output.format !== "wav"
    || !Number.isSafeInteger(sequence.output.sampleRateHz)
    || ![1, 2].includes(sequence.output.channels)
    || ![16, 24, 32].includes(sequence.output.bitDepth)
  ) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_OUTPUT_PROFILE_INVALID");
  }
  if (
    !Array.isArray(sequence.chapters)
    || sequence.chapters.length === 0
    || sequence.chapters.length > MAX_CHAPTERS
  ) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_CHAPTERS_INVALID");
  }
  const chapterIds = new Set<string>();
  const artifactIds = new Set<string>();
  let duration = 0;
  for (const [index, entry] of sequence.chapters.entries()) {
    if (entry.ordinal !== index + 1) {
      throw new BookChapterSequenceError("BOOK_SEQUENCE_ORDINALS_NOT_CONTIGUOUS");
    }
    if (!(["prologue", "chapter", "epilogue"] as const).includes(entry.role)) {
      throw new BookChapterSequenceError("BOOK_SEQUENCE_ROLE_INVALID");
    }
    requireIdentifier(entry.chapterId, "BOOK_SEQUENCE_CHAPTER_ID_INVALID");
    requireText(entry.title, MAX_TITLE_LENGTH, "BOOK_SEQUENCE_CHAPTER_TITLE_INVALID");
    requireInteger(
      entry.durationMs,
      1,
      7 * 24 * 60 * 60 * 1_000,
      "BOOK_SEQUENCE_CHAPTER_DURATION_INVALID",
    );
    requireIdentifier(entry.masteredArtifact.id, "BOOK_SEQUENCE_ARTIFACT_ID_INVALID");
    requireInteger(
      entry.masteredArtifact.revision,
      1,
      Number.MAX_SAFE_INTEGER,
      "BOOK_SEQUENCE_ARTIFACT_REVISION_INVALID",
    );
    requireHash(entry.masteredArtifact.fingerprint, "BOOK_SEQUENCE_ARTIFACT_HASH_INVALID");
    requireHash(entry.masteredArtifact.contentHash, "BOOK_SEQUENCE_ARTIFACT_HASH_INVALID");
    requireInteger(
      entry.masteredArtifact.byteCount,
      1,
      Number.MAX_SAFE_INTEGER,
      "BOOK_SEQUENCE_ARTIFACT_SIZE_INVALID",
    );
    requireHash(entry.masteredChainFingerprint, "BOOK_SEQUENCE_CHAIN_HASH_INVALID");
    requireHash(entry.reviewSessionFingerprint, "BOOK_SEQUENCE_REVIEW_HASH_INVALID");
    requireHash(entry.masteringPlanFingerprint, "BOOK_SEQUENCE_PLAN_HASH_INVALID");
    if (chapterIds.has(entry.chapterId)) {
      throw new BookChapterSequenceError("BOOK_SEQUENCE_CHAPTER_DUPLICATE");
    }
    if (artifactIds.has(entry.masteredArtifact.id)) {
      throw new BookChapterSequenceError("BOOK_SEQUENCE_ARTIFACT_DUPLICATE");
    }
    chapterIds.add(entry.chapterId);
    artifactIds.add(entry.masteredArtifact.id);
    duration += entry.durationMs;
    const { fingerprint, ...partial } = entry;
    if (entryFingerprint(partial) !== fingerprint) {
      throw new BookChapterSequenceError("BOOK_SEQUENCE_ENTRY_FINGERPRINT_INVALID");
    }
  }
  validateRolePlacement(sequence.chapters);
  if (duration !== sequence.totalDurationMs || duration > MAX_BOOK_DURATION_MS) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_TOTAL_DURATION_INVALID");
  }
  if (sequence.status !== "ready-for-credits") {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_STATUS_INVALID");
  }
  requireInteger(sequence.revision, 1, Number.MAX_SAFE_INTEGER, "BOOK_SEQUENCE_REVISION_INVALID");
  if (sequence.revision === 1 && sequence.previousFingerprint !== undefined) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_REVISION_CHAIN_INVALID");
  }
  if (sequence.revision > 1) {
    requireHash(sequence.previousFingerprint ?? "", "BOOK_SEQUENCE_REVISION_CHAIN_INVALID");
  }
  if (
    Number.isNaN(Date.parse(sequence.createdAt))
    || Number.isNaN(Date.parse(sequence.updatedAt))
    || Date.parse(sequence.updatedAt) < Date.parse(sequence.createdAt)
  ) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_DATE_INVALID");
  }
  const { fingerprint, ...partial } = sequence;
  if (sequenceFingerprint(partial) !== fingerprint) {
    throw new BookChapterSequenceError("BOOK_SEQUENCE_FINGERPRINT_INVALID");
  }
}

export function bookChapterSequencePublicView(
  sequence: BookChapterSequence,
): BookChapterSequencePublicView {
  assertBookChapterSequence(sequence);
  return Object.freeze({
    id: sequence.id,
    bookId: sequence.bookId,
    title: sequence.title,
    languageTag: sequence.languageTag,
    ...(sequence.seriesTitle ? { seriesTitle: sequence.seriesTitle } : {}),
    ...(sequence.volumeNumber !== undefined
      ? { volumeNumber: sequence.volumeNumber }
      : {}),
    output: sequence.output,
    chapterCount: sequence.chapters.length,
    totalDurationMs: sequence.totalDurationMs,
    chapters: Object.freeze(sequence.chapters.map((entry) => Object.freeze({
      ordinal: entry.ordinal,
      role: entry.role,
      chapterId: entry.chapterId,
      title: entry.title,
      durationMs: entry.durationMs,
    }))),
    status: sequence.status,
    revision: sequence.revision,
    createdAt: sequence.createdAt,
    updatedAt: sequence.updatedAt,
    fingerprint: sequence.fingerprint,
  });
}

function payload(sequence: BookChapterSequence): Record<string, unknown> {
  return sequence as unknown as Record<string, unknown>;
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<BookChapterSequence> {
  const sequence = envelope.payload as unknown as BookChapterSequence;
  assertBookChapterSequence(sequence);
  if (
    envelope.entityType !== ENTITY_TYPE
    || envelope.entityId !== sequence.id
    || envelope.revision !== sequence.revision
  ) {
    throw new BookChapterSequenceStoreConflictError(
      "BOOK_SEQUENCE_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<BookChapterSequence>;
}

export class FileBookChapterSequenceStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    sequence: BookChapterSequence,
    actorId: string,
  ): Promise<StoredEnvelope<BookChapterSequence>> {
    assertBookChapterSequence(sequence);
    requireIdentifier(actorId, "BOOK_SEQUENCE_STORE_ACTOR_INVALID");
    const existing = await this.read(sequence.id);
    if (existing) {
      if (existing.payload.fingerprint === sequence.fingerprint) return existing;
      throw new BookChapterSequenceStoreConflictError(
        "BOOK_SEQUENCE_STORE_IDEMPOTENCY_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.create(
        ENTITY_TYPE,
        sequence.id,
        payload(sequence),
        new Date(sequence.createdAt),
      ));
      await this.#audit(actorId, "book_sequence.created", envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new BookChapterSequenceStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(
    sequenceId: string,
  ): Promise<StoredEnvelope<BookChapterSequence> | null> {
    requireIdentifier(sequenceId, "BOOK_SEQUENCE_STORE_ID_INVALID");
    const envelope = await this.#store.read<Record<string, unknown>>(
      ENTITY_TYPE,
      sequenceId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(sequenceId: string): Promise<StoredEnvelope<BookChapterSequence>> {
    const envelope = await this.read(sequenceId);
    if (!envelope) {
      throw new BookChapterSequenceStoreConflictError("BOOK_SEQUENCE_STORE_NOT_FOUND");
    }
    return envelope;
  }

  async save(
    sequence: BookChapterSequence,
    input: Readonly<{
      expectedRevision: number;
      actorId: string;
      action: string;
    }>,
  ): Promise<StoredEnvelope<BookChapterSequence>> {
    assertBookChapterSequence(sequence);
    requireIdentifier(input.actorId, "BOOK_SEQUENCE_STORE_ACTOR_INVALID");
    if (!/^book_sequence\.[a-z][a-z0-9._-]{1,80}$/u.test(input.action)) {
      throw new BookChapterSequenceStoreConflictError("BOOK_SEQUENCE_STORE_ACTION_INVALID");
    }
    const current = await this.require(sequence.id);
    if (
      current.revision !== input.expectedRevision
      || sequence.revision !== current.payload.revision + 1
      || sequence.previousFingerprint !== current.payload.fingerprint
    ) {
      throw new BookChapterSequenceStoreConflictError(
        "BOOK_SEQUENCE_STORE_REVISION_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.replace(
        ENTITY_TYPE,
        sequence.id,
        input.expectedRevision,
        payload(sequence),
        new Date(sequence.updatedAt),
      ));
      await this.#audit(input.actorId, input.action, envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new BookChapterSequenceStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async #audit(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<BookChapterSequence>,
  ): Promise<void> {
    await this.#store.appendAuditEvent({
      actorId,
      action,
      entityType: ENTITY_TYPE,
      entityId: envelope.entityId,
      revision: envelope.revision,
      occurredAt: new Date(envelope.savedAt),
      metadata: {
        status: envelope.payload.status,
        chapterCount: envelope.payload.chapters.length,
        totalDurationMs: envelope.payload.totalDurationMs,
        sampleRateHz: envelope.payload.output.sampleRateHz,
        channels: envelope.payload.output.channels,
      },
    });
  }
}
