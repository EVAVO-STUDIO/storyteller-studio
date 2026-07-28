import {
  assertArtifactRecord,
  type ArtifactKind,
  type ArtifactRecord,
} from "./artifact-registry.js";
import {
  assertBookChapterSequence,
  type BookChapterRole,
  type BookChapterSequence,
  type BookChapterSequenceEntry,
} from "./book-chapter-sequence.js";
import {
  assertBookCreditDeliverySnapshot,
  type BookCreditDeliverySnapshot,
} from "./book-credit-delivery.js";
import { stableHash } from "./index.js";
import type { MasteringOutputProfile } from "./mastering-plan.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";

export const AUDIOBOOK_SEQUENCE_SCHEMA_VERSION =
  "storyteller-audiobook-sequence-v1" as const;
export const AUDIOBOOK_SEQUENCE_ENTITY_TYPE = "audiobook-sequence" as const;

export type AudiobookSequenceComponentRole =
  | "opening-credit"
  | BookChapterRole
  | "closing-credit";

export interface AudiobookSequenceArtifactSnapshot {
  id: string;
  kind: "credit-master" | "mastered-chapter";
  revision: number;
  fingerprint: string;
  contentHash: string;
  byteCount: number;
}

export interface AudiobookSequenceComponent {
  ordinal: number;
  role: AudiobookSequenceComponentRole;
  title: string;
  durationMs: number;
  startMs: number;
  endMs: number;
  artifact: AudiobookSequenceArtifactSnapshot;
  sourceFingerprint: string;
  fingerprint: string;
}

export interface AudiobookSequence {
  schemaVersion: typeof AUDIOBOOK_SEQUENCE_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  title: string;
  languageTag: string;
  seriesTitle?: string;
  volumeNumber?: number;
  chapterSequenceFingerprint: string;
  openingDeliveryFingerprint: string;
  closingDeliveryFingerprint: string;
  rightsFingerprint: string;
  engineeringProfileFingerprint: string;
  output: MasteringOutputProfile;
  components: readonly AudiobookSequenceComponent[];
  chapterCount: number;
  totalDurationMs: number;
  status: "ready-for-retail-encoding";
  createdByActorId: string;
  revision: number;
  previousFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface AudiobookSequencePublicComponent {
  ordinal: number;
  role: AudiobookSequenceComponentRole;
  title: string;
  durationMs: number;
  startMs: number;
  endMs: number;
}

export interface AudiobookSequencePublicView {
  id: string;
  bookId: string;
  title: string;
  languageTag: string;
  seriesTitle?: string;
  volumeNumber?: number;
  output: MasteringOutputProfile;
  chapterCount: number;
  componentCount: number;
  totalDurationMs: number;
  components: readonly AudiobookSequencePublicComponent[];
  status: "ready-for-retail-encoding";
  revision: number;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface CreateAudiobookSequenceInput {
  id: string;
  projectId: string;
  bookId: string;
  opening: Readonly<{
    delivery: BookCreditDeliverySnapshot;
    artifact: ArtifactRecord;
  }>;
  chapters: BookChapterSequence;
  chapterArtifacts: readonly ArtifactRecord[];
  closing: Readonly<{
    delivery: BookCreditDeliverySnapshot;
    artifact: ArtifactRecord;
  }>;
  createdByActorId: string;
  createdAt?: Date;
}

export class AudiobookSequenceError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookSequenceError";
    this.code = code;
  }
}

export class AudiobookSequenceStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudiobookSequenceStoreConflictError";
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const LANGUAGE_TAG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const MAX_TITLE_LENGTH = 500;
const MAX_COMPONENTS = 2_002;
const MAX_DURATION_MS = 15 * 24 * 60 * 60 * 1_000;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new AudiobookSequenceError(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new AudiobookSequenceError(code);
  return value;
}

function requireText(value: string, maximum: number, code: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum || CONTROL_CHARACTERS.test(trimmed)) {
    throw new AudiobookSequenceError(code);
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
    throw new AudiobookSequenceError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookSequenceError(code);
  }
  return value;
}

function outputFingerprint(output: MasteringOutputProfile): string {
  return stableHash(output);
}

function componentFingerprint(
  component: Omit<AudiobookSequenceComponent, "fingerprint">,
): string {
  return stableHash(component);
}

function sequenceFingerprint(
  sequence: Omit<AudiobookSequence, "fingerprint">,
): string {
  return stableHash(sequence);
}

function snapshotArtifact(record: ArtifactRecord): AudiobookSequenceArtifactSnapshot {
  return Object.freeze({
    id: record.id,
    kind: record.kind as "credit-master" | "mastered-chapter",
    revision: record.revision,
    fingerprint: record.fingerprint,
    contentHash: record.integrity.contentHash,
    byteCount: record.integrity.byteCount,
  });
}

function requireCurrentRights(record: ArtifactRecord, now: Date): void {
  if (!record.rights.allowedUses.includes("audiobook")) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_AUDIOBOOK_RIGHTS_REQUIRED");
  }
  if (!record.rights.commercialUseApproved) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_COMMERCIAL_RIGHTS_REQUIRED");
  }
  if (record.rights.expiresAt && Date.parse(record.rights.expiresAt) <= now.getTime()) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_RIGHTS_EXPIRED");
  }
  if (
    record.rights.deletionRequiredAt
    && Date.parse(record.rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_RETENTION_EXPIRED");
  }
}

function requireApprovedArtifact(
  record: ArtifactRecord,
  expectedKind: ArtifactKind,
  projectId: string,
  now: Date,
): void {
  assertArtifactRecord(record);
  if (
    record.kind !== expectedKind
    || record.projectId !== projectId
    || record.verification.status !== "verified"
    || record.review.status !== "approved"
    || record.quarantine
    || record.release.status !== "unavailable"
  ) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_ARTIFACT_NOT_APPROVED");
  }
  requireCurrentRights(record, now);
}

function requireArtifactSnapshot(
  record: ArtifactRecord,
  snapshot: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
    contentHash: string;
    byteCount: number;
  }>,
  code: string,
): void {
  if (
    record.id !== snapshot.id
    || record.revision !== snapshot.revision
    || record.fingerprint !== snapshot.fingerprint
    || record.integrity.contentHash !== snapshot.contentHash
    || record.integrity.byteCount !== snapshot.byteCount
  ) {
    throw new AudiobookSequenceError(code);
  }
}

function component(
  ordinal: number,
  role: AudiobookSequenceComponentRole,
  title: string,
  durationMs: number,
  startMs: number,
  artifact: ArtifactRecord,
  sourceFingerprint: string,
): AudiobookSequenceComponent {
  const checkedDuration = requireInteger(
    durationMs,
    1,
    MAX_DURATION_MS,
    "AUDIOBOOK_SEQUENCE_COMPONENT_DURATION_INVALID",
  );
  const partial: Omit<AudiobookSequenceComponent, "fingerprint"> = {
    ordinal,
    role,
    title: requireText(title, MAX_TITLE_LENGTH, "AUDIOBOOK_SEQUENCE_COMPONENT_TITLE_INVALID"),
    durationMs: checkedDuration,
    startMs,
    endMs: startMs + checkedDuration,
    artifact: snapshotArtifact(artifact),
    sourceFingerprint: requireHash(
      sourceFingerprint,
      "AUDIOBOOK_SEQUENCE_COMPONENT_SOURCE_HASH_INVALID",
    ),
  };
  return Object.freeze({ ...partial, fingerprint: componentFingerprint(partial) });
}

function validateCredit(
  delivery: BookCreditDeliverySnapshot,
  artifact: ArtifactRecord,
  expectedKind: "opening" | "closing",
  projectId: string,
  bookId: string,
  chapterSequence: BookChapterSequence,
  now: Date,
): void {
  assertBookCreditDeliverySnapshot(delivery);
  if (
    delivery.creditKind !== expectedKind
    || delivery.projectId !== projectId
    || delivery.bookId !== bookId
    || delivery.status !== "ready-for-book-assembly"
  ) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_CREDIT_SCOPE_MISMATCH");
  }
  requireApprovedArtifact(artifact, "credit-master", projectId, now);
  requireArtifactSnapshot(
    artifact,
    delivery.creditMaster,
    "AUDIOBOOK_SEQUENCE_CREDIT_ARTIFACT_MISMATCH",
  );
  if (
    delivery.rightsFingerprint !== chapterSequence.rightsFingerprint
    || artifact.rights.rightsFingerprint !== chapterSequence.rightsFingerprint
  ) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_RIGHTS_MISMATCH");
  }
  if (
    delivery.engineeringProfileFingerprint
      !== chapterSequence.engineeringProfileFingerprint
  ) {
    throw new AudiobookSequenceError(
      "AUDIOBOOK_SEQUENCE_ENGINEERING_PROFILE_MISMATCH",
    );
  }
  if (outputFingerprint(delivery.output) !== outputFingerprint(chapterSequence.output)) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_OUTPUT_PROFILE_MISMATCH");
  }
}

function validateChapters(
  chapterSequence: BookChapterSequence,
  artifacts: readonly ArtifactRecord[],
  projectId: string,
  now: Date,
): ReadonlyMap<string, ArtifactRecord> {
  if (artifacts.length !== chapterSequence.chapters.length) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_CHAPTER_ARTIFACTS_INCOMPLETE");
  }
  const byId = new Map<string, ArtifactRecord>();
  for (const artifact of artifacts) {
    requireApprovedArtifact(artifact, "mastered-chapter", projectId, now);
    if (byId.has(artifact.id)) {
      throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_ARTIFACT_DUPLICATE");
    }
    byId.set(artifact.id, artifact);
  }
  for (const entry of chapterSequence.chapters) {
    const artifact = byId.get(entry.masteredArtifact.id);
    if (!artifact) {
      throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_CHAPTER_ARTIFACT_MISSING");
    }
    requireArtifactSnapshot(
      artifact,
      entry.masteredArtifact,
      "AUDIOBOOK_SEQUENCE_CHAPTER_ARTIFACT_MISMATCH",
    );
    if (artifact.rights.rightsFingerprint !== chapterSequence.rightsFingerprint) {
      throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_RIGHTS_MISMATCH");
    }
  }
  return byId;
}

function buildSequence(
  input: CreateAudiobookSequenceInput,
  revision: number,
  createdAt: Date,
  previous?: AudiobookSequence,
): AudiobookSequence {
  requireIdentifier(input.id, "AUDIOBOOK_SEQUENCE_ID_INVALID");
  requireIdentifier(input.projectId, "AUDIOBOOK_SEQUENCE_PROJECT_ID_INVALID");
  requireIdentifier(input.bookId, "AUDIOBOOK_SEQUENCE_BOOK_ID_INVALID");
  requireIdentifier(input.createdByActorId, "AUDIOBOOK_SEQUENCE_ACTOR_ID_INVALID");
  if (Number.isNaN(createdAt.getTime())) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_DATE_INVALID");
  }
  assertBookChapterSequence(input.chapters);
  if (
    input.chapters.projectId !== input.projectId
    || input.chapters.bookId !== input.bookId
    || input.chapters.status !== "ready-for-credits"
  ) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_CHAPTER_SCOPE_MISMATCH");
  }
  validateCredit(
    input.opening.delivery,
    input.opening.artifact,
    "opening",
    input.projectId,
    input.bookId,
    input.chapters,
    createdAt,
  );
  validateCredit(
    input.closing.delivery,
    input.closing.artifact,
    "closing",
    input.projectId,
    input.bookId,
    input.chapters,
    createdAt,
  );
  const chaptersById = validateChapters(
    input.chapters,
    input.chapterArtifacts,
    input.projectId,
    createdAt,
  );
  const artifactIds = new Set(input.chapterArtifacts.map((artifact) => artifact.id));
  if (
    artifactIds.has(input.opening.artifact.id)
    || artifactIds.has(input.closing.artifact.id)
    || input.opening.artifact.id === input.closing.artifact.id
  ) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_ARTIFACT_DUPLICATE");
  }
  const latestEvidenceTime = Math.max(
    Date.parse(input.chapters.updatedAt),
    Date.parse(input.opening.delivery.createdAt),
    Date.parse(input.closing.delivery.createdAt),
    Date.parse(input.opening.artifact.updatedAt),
    Date.parse(input.closing.artifact.updatedAt),
    ...input.chapterArtifacts.map((artifact) => Date.parse(artifact.updatedAt)),
  );
  if (createdAt.getTime() < latestEvidenceTime) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_PRECEDES_EVIDENCE");
  }

  const components: AudiobookSequenceComponent[] = [];
  let cursor = 0;
  components.push(component(
    1,
    "opening-credit",
    "Opening credit",
    input.opening.delivery.durationMs,
    cursor,
    input.opening.artifact,
    input.opening.delivery.fingerprint,
  ));
  cursor = components.at(-1)!.endMs;
  for (const chapter of input.chapters.chapters) {
    const artifact = chaptersById.get(chapter.masteredArtifact.id)!;
    components.push(component(
      components.length + 1,
      chapter.role,
      chapter.title,
      chapter.durationMs,
      cursor,
      artifact,
      chapter.fingerprint,
    ));
    cursor = components.at(-1)!.endMs;
  }
  components.push(component(
    components.length + 1,
    "closing-credit",
    "Closing credit",
    input.closing.delivery.durationMs,
    cursor,
    input.closing.artifact,
    input.closing.delivery.fingerprint,
  ));
  cursor = components.at(-1)!.endMs;
  if (components.length > MAX_COMPONENTS || cursor > MAX_DURATION_MS) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_LIMIT_EXCEEDED");
  }

  const partial: Omit<AudiobookSequence, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_SEQUENCE_SCHEMA_VERSION,
    id: input.id,
    projectId: input.projectId,
    bookId: input.bookId,
    title: input.chapters.title,
    languageTag: input.chapters.languageTag,
    ...(input.chapters.seriesTitle
      ? { seriesTitle: input.chapters.seriesTitle }
      : {}),
    ...(input.chapters.volumeNumber !== undefined
      ? { volumeNumber: input.chapters.volumeNumber }
      : {}),
    chapterSequenceFingerprint: input.chapters.fingerprint,
    openingDeliveryFingerprint: input.opening.delivery.fingerprint,
    closingDeliveryFingerprint: input.closing.delivery.fingerprint,
    rightsFingerprint: input.chapters.rightsFingerprint,
    engineeringProfileFingerprint: input.chapters.engineeringProfileFingerprint,
    output: Object.freeze({ ...input.chapters.output }),
    components: Object.freeze(components),
    chapterCount: input.chapters.chapters.length,
    totalDurationMs: cursor,
    status: "ready-for-retail-encoding",
    createdByActorId: input.createdByActorId,
    revision,
    ...(previous ? { previousFingerprint: previous.fingerprint } : {}),
    createdAt: previous?.createdAt ?? createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
  };
  const sequence = Object.freeze({
    ...partial,
    fingerprint: sequenceFingerprint(partial),
  });
  assertAudiobookSequence(sequence);
  return sequence;
}

export function createAudiobookSequence(
  input: CreateAudiobookSequenceInput,
): AudiobookSequence {
  return buildSequence(input, 1, input.createdAt ?? new Date());
}

export function reviseAudiobookSequence(
  current: AudiobookSequence,
  input: CreateAudiobookSequenceInput,
): AudiobookSequence {
  assertAudiobookSequence(current);
  if (
    current.id !== input.id
    || current.projectId !== input.projectId
    || current.bookId !== input.bookId
  ) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_IMMUTABLE_SCOPE_CHANGED");
  }
  const updatedAt = input.createdAt ?? new Date();
  if (updatedAt.getTime() < Date.parse(current.updatedAt)) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_TRANSITION_TIME_REVERSED");
  }
  return buildSequence(input, current.revision + 1, updatedAt, current);
}

export function assertAudiobookSequence(sequence: AudiobookSequence): void {
  if (sequence.schemaVersion !== AUDIOBOOK_SEQUENCE_SCHEMA_VERSION) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_SCHEMA_UNSUPPORTED");
  }
  for (const [value, code] of [
    [sequence.id, "AUDIOBOOK_SEQUENCE_ID_INVALID"],
    [sequence.projectId, "AUDIOBOOK_SEQUENCE_PROJECT_ID_INVALID"],
    [sequence.bookId, "AUDIOBOOK_SEQUENCE_BOOK_ID_INVALID"],
    [sequence.createdByActorId, "AUDIOBOOK_SEQUENCE_ACTOR_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  requireText(sequence.title, MAX_TITLE_LENGTH, "AUDIOBOOK_SEQUENCE_TITLE_INVALID");
  if (!LANGUAGE_TAG.test(sequence.languageTag)) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_LANGUAGE_INVALID");
  }
  if (sequence.seriesTitle !== undefined) {
    requireText(
      sequence.seriesTitle,
      MAX_TITLE_LENGTH,
      "AUDIOBOOK_SEQUENCE_SERIES_TITLE_INVALID",
    );
  }
  if (
    sequence.volumeNumber !== undefined
    && (!Number.isSafeInteger(sequence.volumeNumber)
      || sequence.volumeNumber < 1
      || sequence.volumeNumber > 10_000)
  ) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_VOLUME_INVALID");
  }
  for (const hash of [
    sequence.chapterSequenceFingerprint,
    sequence.openingDeliveryFingerprint,
    sequence.closingDeliveryFingerprint,
    sequence.rightsFingerprint,
    sequence.engineeringProfileFingerprint,
  ]) requireHash(hash, "AUDIOBOOK_SEQUENCE_HASH_INVALID");
  if (
    sequence.output.format !== "wav"
    || !Number.isSafeInteger(sequence.output.sampleRateHz)
    || ![1, 2].includes(sequence.output.channels)
    || ![16, 24, 32].includes(sequence.output.bitDepth)
  ) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_OUTPUT_INVALID");
  }
  if (
    !Array.isArray(sequence.components)
    || sequence.components.length < 3
    || sequence.components.length > MAX_COMPONENTS
  ) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_COMPONENTS_INVALID");
  }
  const artifactIds = new Set<string>();
  let cursor = 0;
  let chapterCount = 0;
  for (const [index, entry] of sequence.components.entries()) {
    if (entry.ordinal !== index + 1) {
      throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_ORDINALS_INVALID");
    }
    const expectedRole = index === 0
      ? "opening-credit"
      : index === sequence.components.length - 1
        ? "closing-credit"
        : null;
    if (expectedRole && entry.role !== expectedRole) {
      throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_CREDIT_POSITION_INVALID");
    }
    if (!expectedRole) {
      if (!(entry.role === "prologue" || entry.role === "chapter" || entry.role === "epilogue")) {
        throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_CHAPTER_ROLE_INVALID");
      }
      chapterCount += 1;
    }
    requireText(entry.title, MAX_TITLE_LENGTH, "AUDIOBOOK_SEQUENCE_COMPONENT_TITLE_INVALID");
    requireInteger(
      entry.durationMs,
      1,
      MAX_DURATION_MS,
      "AUDIOBOOK_SEQUENCE_COMPONENT_DURATION_INVALID",
    );
    if (entry.startMs !== cursor || entry.endMs !== entry.startMs + entry.durationMs) {
      throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_TIMELINE_INVALID");
    }
    requireIdentifier(entry.artifact.id, "AUDIOBOOK_SEQUENCE_ARTIFACT_ID_INVALID");
    if (
      entry.artifact.kind !== "credit-master"
      && entry.artifact.kind !== "mastered-chapter"
    ) {
      throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_ARTIFACT_KIND_INVALID");
    }
    requireInteger(
      entry.artifact.revision,
      1,
      Number.MAX_SAFE_INTEGER,
      "AUDIOBOOK_SEQUENCE_ARTIFACT_REVISION_INVALID",
    );
    requireHash(entry.artifact.fingerprint, "AUDIOBOOK_SEQUENCE_ARTIFACT_HASH_INVALID");
    requireHash(entry.artifact.contentHash, "AUDIOBOOK_SEQUENCE_ARTIFACT_HASH_INVALID");
    requireInteger(
      entry.artifact.byteCount,
      1,
      Number.MAX_SAFE_INTEGER,
      "AUDIOBOOK_SEQUENCE_ARTIFACT_SIZE_INVALID",
    );
    requireHash(
      entry.sourceFingerprint,
      "AUDIOBOOK_SEQUENCE_COMPONENT_SOURCE_HASH_INVALID",
    );
    if (artifactIds.has(entry.artifact.id)) {
      throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_ARTIFACT_DUPLICATE");
    }
    artifactIds.add(entry.artifact.id);
    const { fingerprint, ...partial } = entry;
    if (componentFingerprint(partial) !== fingerprint) {
      throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_COMPONENT_FINGERPRINT_INVALID");
    }
    cursor = entry.endMs;
  }
  if (
    chapterCount !== sequence.chapterCount
    || cursor !== sequence.totalDurationMs
    || cursor > MAX_DURATION_MS
  ) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_TOTALS_INVALID");
  }
  if (sequence.status !== "ready-for-retail-encoding") {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_STATUS_INVALID");
  }
  requireInteger(
    sequence.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_SEQUENCE_REVISION_INVALID",
  );
  if (sequence.revision === 1 && sequence.previousFingerprint !== undefined) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_REVISION_CHAIN_INVALID");
  }
  if (sequence.revision > 1) {
    requireHash(
      sequence.previousFingerprint ?? "",
      "AUDIOBOOK_SEQUENCE_REVISION_CHAIN_INVALID",
    );
  }
  requireDate(sequence.createdAt, "AUDIOBOOK_SEQUENCE_DATE_INVALID");
  requireDate(sequence.updatedAt, "AUDIOBOOK_SEQUENCE_DATE_INVALID");
  if (Date.parse(sequence.updatedAt) < Date.parse(sequence.createdAt)) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_DATE_ORDER_INVALID");
  }
  const { fingerprint, ...partial } = sequence;
  if (!HASH_PATTERN.test(fingerprint) || sequenceFingerprint(partial) !== fingerprint) {
    throw new AudiobookSequenceError("AUDIOBOOK_SEQUENCE_FINGERPRINT_INVALID");
  }
}

export function audiobookSequencePublicView(
  sequence: AudiobookSequence,
): AudiobookSequencePublicView {
  assertAudiobookSequence(sequence);
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
    chapterCount: sequence.chapterCount,
    componentCount: sequence.components.length,
    totalDurationMs: sequence.totalDurationMs,
    components: Object.freeze(sequence.components.map((entry) => Object.freeze({
      ordinal: entry.ordinal,
      role: entry.role,
      title: entry.title,
      durationMs: entry.durationMs,
      startMs: entry.startMs,
      endMs: entry.endMs,
    }))),
    status: sequence.status,
    revision: sequence.revision,
    createdAt: sequence.createdAt,
    updatedAt: sequence.updatedAt,
    fingerprint: sequence.fingerprint,
  });
}

function payload(sequence: AudiobookSequence): Record<string, unknown> {
  return sequence as unknown as Record<string, unknown>;
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<AudiobookSequence> {
  const sequence = envelope.payload as unknown as AudiobookSequence;
  assertAudiobookSequence(sequence);
  if (
    envelope.entityType !== AUDIOBOOK_SEQUENCE_ENTITY_TYPE
    || envelope.entityId !== sequence.id
    || envelope.revision !== sequence.revision
  ) {
    throw new AudiobookSequenceStoreConflictError(
      "AUDIOBOOK_SEQUENCE_STORE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<AudiobookSequence>;
}

export class FileAudiobookSequenceStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    sequence: AudiobookSequence,
  ): Promise<StoredEnvelope<AudiobookSequence>> {
    assertAudiobookSequence(sequence);
    const existing = await this.read(sequence.id);
    if (existing) {
      if (existing.payload.fingerprint === sequence.fingerprint) return existing;
      throw new AudiobookSequenceStoreConflictError(
        "AUDIOBOOK_SEQUENCE_IDEMPOTENCY_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.create(
        AUDIOBOOK_SEQUENCE_ENTITY_TYPE,
        sequence.id,
        payload(sequence),
        new Date(sequence.createdAt),
      ));
      await this.#audit("audiobook_sequence.created", envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookSequenceStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(id: string): Promise<StoredEnvelope<AudiobookSequence> | null> {
    requireIdentifier(id, "AUDIOBOOK_SEQUENCE_ID_INVALID");
    const envelope = await this.#store.read<Record<string, unknown>>(
      AUDIOBOOK_SEQUENCE_ENTITY_TYPE,
      id,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(id: string): Promise<StoredEnvelope<AudiobookSequence>> {
    const envelope = await this.read(id);
    if (!envelope) {
      throw new AudiobookSequenceStoreConflictError(
        "AUDIOBOOK_SEQUENCE_NOT_FOUND",
      );
    }
    return envelope;
  }

  async save(
    sequence: AudiobookSequence,
    expectedRevision: number,
  ): Promise<StoredEnvelope<AudiobookSequence>> {
    assertAudiobookSequence(sequence);
    const current = await this.require(sequence.id);
    if (
      current.revision !== expectedRevision
      || sequence.revision !== current.payload.revision + 1
      || sequence.previousFingerprint !== current.payload.fingerprint
    ) {
      throw new AudiobookSequenceStoreConflictError(
        "AUDIOBOOK_SEQUENCE_REVISION_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.replace(
        AUDIOBOOK_SEQUENCE_ENTITY_TYPE,
        sequence.id,
        expectedRevision,
        payload(sequence),
        new Date(sequence.updatedAt),
      ));
      await this.#audit("audiobook_sequence.revised", envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookSequenceStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async #audit(
    action: string,
    envelope: StoredEnvelope<AudiobookSequence>,
  ): Promise<void> {
    await this.#store.appendAuditEvent({
      actorId: envelope.payload.createdByActorId,
      action,
      entityType: AUDIOBOOK_SEQUENCE_ENTITY_TYPE,
      entityId: envelope.entityId,
      revision: envelope.revision,
      occurredAt: new Date(envelope.savedAt),
      metadata: {
        bookId: envelope.payload.bookId,
        componentCount: envelope.payload.components.length,
        chapterCount: envelope.payload.chapterCount,
        totalDurationMs: envelope.payload.totalDurationMs,
        status: envelope.payload.status,
        sequenceFingerprint: envelope.payload.fingerprint,
      },
    });
  }
}
