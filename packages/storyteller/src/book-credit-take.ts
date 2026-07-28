import {
  assertAudioEngineeringEvidence,
  type AudioEngineeringEvidence,
} from "./audio-engineering.js";
import {
  assertArtifactRecord,
  type ArtifactRecord,
} from "./artifact-registry.js";
import {
  assertBookCreditGenerationPlan,
  type BookCreditGenerationPlan,
} from "./book-credit-generation.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";
import { stableHash, type Finding } from "./index.js";

export const BOOK_CREDIT_TRANSCRIPT_SCHEMA_VERSION =
  "storyteller-book-credit-transcript-v1" as const;
export const BOOK_CREDIT_TAKE_SCHEMA_VERSION =
  "storyteller-book-credit-take-v1" as const;

export interface BookCreditTranscriptEvidence {
  schemaVersion: typeof BOOK_CREDIT_TRANSCRIPT_SCHEMA_VERSION;
  sourceTextHash: string;
  observedTextHash: string;
  sourceCharacterCount: number;
  observedCharacterCount: number;
  exactMatch: boolean;
  finalWordCovered: boolean;
  firstMismatchIndex?: number;
  assessedAt: string;
  fingerprint: string;
}

export interface BookCreditArtifactSnapshot {
  id: string;
  revision: number;
  fingerprint: string;
  contentHash: string;
  byteCount: number;
}

export interface BookCreditTakeRecord {
  schemaVersion: typeof BOOK_CREDIT_TAKE_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  creditKind: BookCreditGenerationPlan["creditKind"];
  planId: string;
  planFingerprint: string;
  scriptId: string;
  scriptRevision: number;
  scriptTextHash: string;
  jobId: string;
  segmentId: string;
  takeId: string;
  voiceRevision: number;
  calibrationLockFingerprint: string;
  audio: BookCreditArtifactSnapshot;
  transcript: BookCreditArtifactSnapshot;
  engineering: BookCreditArtifactSnapshot;
  transcriptEvidence: BookCreditTranscriptEvidence;
  engineeringEvidenceFingerprint: string;
  engineeringProfileId: string;
  engineeringProfileVersion: string;
  eligibleForReview: boolean;
  findings: readonly Finding[];
  status: "eligible-for-review" | "blocked";
  createdAt: string;
  fingerprint: string;
}

export interface BookCreditTakePublicView {
  id: string;
  bookId: string;
  creditKind: BookCreditGenerationPlan["creditKind"];
  planId: string;
  scriptRevision: number;
  scriptTextHash: string;
  takeId: string;
  voiceRevision: number;
  transcriptExact: boolean;
  finalWordCovered: boolean;
  engineeringProfileId: string;
  engineeringProfileVersion: string;
  eligibleForReview: boolean;
  findingCodes: readonly string[];
  status: BookCreditTakeRecord["status"];
  createdAt: string;
  fingerprint: string;
}

export class BookCreditTakeError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "BookCreditTakeError";
    this.code = code;
  }
}

export class BookCreditTakeStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookCreditTakeStoreConflictError";
  }
}

const ENTITY_TYPE = "book-credit-take" as const;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const WORD_PATTERN = /[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu;
const MAX_TRANSCRIPT_CHARACTERS = 20_000;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new BookCreditTakeError(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new BookCreditTakeError(code);
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) throw new BookCreditTakeError(code);
  return value;
}

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new BookCreditTakeError(code);
  }
  return value;
}

function requireTranscript(value: string, code: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > MAX_TRANSCRIPT_CHARACTERS
    || CONTROL_CHARACTERS.test(value)
  ) {
    throw new BookCreditTakeError(code);
  }
  return value;
}

function firstMismatch(source: string, observed: string): number | undefined {
  const length = Math.min(source.length, observed.length);
  for (let index = 0; index < length; index += 1) {
    if (source[index] !== observed[index]) return index;
  }
  return source.length === observed.length ? undefined : length;
}

function finalWord(value: string): string | undefined {
  const matches = [...value.matchAll(WORD_PATTERN)];
  return matches.at(-1)?.[0];
}

function transcriptFingerprint(
  evidence: Omit<BookCreditTranscriptEvidence, "fingerprint">,
): string {
  return stableHash(evidence);
}

export function createBookCreditTranscriptEvidence(input: Readonly<{
  sourceText: string;
  observedText: string;
  assessedAt?: Date;
}>): BookCreditTranscriptEvidence {
  const sourceText = requireTranscript(input.sourceText, "BOOK_CREDIT_TRANSCRIPT_SOURCE_INVALID");
  const observedText = requireTranscript(
    input.observedText,
    "BOOK_CREDIT_TRANSCRIPT_OBSERVED_INVALID",
  );
  const assessedAt = input.assessedAt ?? new Date();
  if (Number.isNaN(assessedAt.getTime())) {
    throw new BookCreditTakeError("BOOK_CREDIT_TRANSCRIPT_DATE_INVALID");
  }
  const mismatch = firstMismatch(sourceText, observedText);
  const sourceFinalWord = finalWord(sourceText);
  const observedFinalWord = finalWord(observedText);
  const partial: Omit<BookCreditTranscriptEvidence, "fingerprint"> = {
    schemaVersion: BOOK_CREDIT_TRANSCRIPT_SCHEMA_VERSION,
    sourceTextHash: stableHash(sourceText),
    observedTextHash: stableHash(observedText),
    sourceCharacterCount: sourceText.length,
    observedCharacterCount: observedText.length,
    exactMatch: mismatch === undefined,
    finalWordCovered: sourceFinalWord !== undefined && observedFinalWord === sourceFinalWord,
    ...(mismatch !== undefined ? { firstMismatchIndex: mismatch } : {}),
    assessedAt: assessedAt.toISOString(),
  };
  const evidence = Object.freeze({
    ...partial,
    fingerprint: transcriptFingerprint(partial),
  });
  assertBookCreditTranscriptEvidence(evidence);
  return evidence;
}

export function assertBookCreditTranscriptEvidence(
  evidence: BookCreditTranscriptEvidence,
): void {
  if (evidence.schemaVersion !== BOOK_CREDIT_TRANSCRIPT_SCHEMA_VERSION) {
    throw new BookCreditTakeError("BOOK_CREDIT_TRANSCRIPT_SCHEMA_UNSUPPORTED");
  }
  requireHash(evidence.sourceTextHash, "BOOK_CREDIT_TRANSCRIPT_SOURCE_HASH_INVALID");
  requireHash(evidence.observedTextHash, "BOOK_CREDIT_TRANSCRIPT_OBSERVED_HASH_INVALID");
  requireInteger(
    evidence.sourceCharacterCount,
    1,
    MAX_TRANSCRIPT_CHARACTERS,
    "BOOK_CREDIT_TRANSCRIPT_SOURCE_LENGTH_INVALID",
  );
  requireInteger(
    evidence.observedCharacterCount,
    1,
    MAX_TRANSCRIPT_CHARACTERS,
    "BOOK_CREDIT_TRANSCRIPT_OBSERVED_LENGTH_INVALID",
  );
  if (evidence.exactMatch) {
    if (
      evidence.sourceTextHash !== evidence.observedTextHash
      || evidence.sourceCharacterCount !== evidence.observedCharacterCount
      || evidence.firstMismatchIndex !== undefined
      || !evidence.finalWordCovered
    ) {
      throw new BookCreditTakeError("BOOK_CREDIT_TRANSCRIPT_EXACT_STATE_INVALID");
    }
  } else {
    requireInteger(
      evidence.firstMismatchIndex ?? -1,
      0,
      Math.max(evidence.sourceCharacterCount, evidence.observedCharacterCount),
      "BOOK_CREDIT_TRANSCRIPT_MISMATCH_INDEX_INVALID",
    );
  }
  requireDate(evidence.assessedAt, "BOOK_CREDIT_TRANSCRIPT_DATE_INVALID");
  const { fingerprint, ...partial } = evidence;
  if (!HASH_PATTERN.test(fingerprint) || transcriptFingerprint(partial) !== fingerprint) {
    throw new BookCreditTakeError("BOOK_CREDIT_TRANSCRIPT_FINGERPRINT_INVALID");
  }
}

function artifactSnapshot(record: ArtifactRecord): BookCreditArtifactSnapshot {
  return Object.freeze({
    id: record.id,
    revision: record.revision,
    fingerprint: record.fingerprint,
    contentHash: record.integrity.contentHash,
    byteCount: record.integrity.byteCount,
  });
}

function assertSnapshot(snapshot: BookCreditArtifactSnapshot, code: string): void {
  requireIdentifier(snapshot.id, code);
  requireInteger(snapshot.revision, 1, Number.MAX_SAFE_INTEGER, code);
  requireHash(snapshot.fingerprint, code);
  requireHash(snapshot.contentHash, code);
  requireInteger(snapshot.byteCount, 1, Number.MAX_SAFE_INTEGER, code);
}

function requireVerified(record: ArtifactRecord, code: string): void {
  if (
    record.verification.status !== "verified"
    || record.verification.findings.some((finding) => finding.severity === "error")
    || record.quarantine
  ) {
    throw new BookCreditTakeError(code);
  }
}

function requireSameScope(expected: ArtifactRecord, actual: ArtifactRecord, code: string): void {
  if (
    actual.projectId !== expected.projectId
    || actual.jobId !== expected.jobId
    || actual.segmentId !== expected.segmentId
    || actual.takeId !== expected.takeId
  ) {
    throw new BookCreditTakeError(code);
  }
}

function requireParent(record: ArtifactRecord, parentId: string, code: string): void {
  if (!record.provenance.parentArtifactIds.includes(parentId)) {
    throw new BookCreditTakeError(code);
  }
}

function requireChronology(earlier: string, later: string, code: string): void {
  if (Date.parse(later) < Date.parse(earlier)) throw new BookCreditTakeError(code);
}

function recordFingerprint(record: Omit<BookCreditTakeRecord, "fingerprint">): string {
  return stableHash(record);
}

export function admitBookCreditTake(input: Readonly<{
  id: string;
  plan: BookCreditGenerationPlan;
  audioCandidate: ArtifactRecord;
  transcriptArtifact: ArtifactRecord;
  engineeringArtifact: ArtifactRecord;
  transcriptEvidence: BookCreditTranscriptEvidence;
  engineeringEvidence: AudioEngineeringEvidence;
  createdAt?: Date;
}>): BookCreditTakeRecord {
  requireIdentifier(input.id, "BOOK_CREDIT_TAKE_ID_INVALID");
  assertBookCreditGenerationPlan(input.plan);
  assertBookCreditTranscriptEvidence(input.transcriptEvidence);
  assertAudioEngineeringEvidence(input.engineeringEvidence);
  for (const record of [
    input.audioCandidate,
    input.transcriptArtifact,
    input.engineeringArtifact,
  ]) assertArtifactRecord(record);

  if (input.audioCandidate.kind !== "audio-candidate") {
    throw new BookCreditTakeError("BOOK_CREDIT_TAKE_AUDIO_REQUIRED");
  }
  if (
    input.transcriptArtifact.kind !== "transcript"
    && input.transcriptArtifact.kind !== "audio-analysis"
  ) {
    throw new BookCreditTakeError("BOOK_CREDIT_TAKE_TRANSCRIPT_ARTIFACT_INVALID");
  }
  if (input.engineeringArtifact.kind !== "audio-analysis") {
    throw new BookCreditTakeError("BOOK_CREDIT_TAKE_ENGINEERING_ARTIFACT_INVALID");
  }
  requireVerified(input.audioCandidate, "BOOK_CREDIT_TAKE_AUDIO_NOT_VERIFIED");
  requireVerified(input.transcriptArtifact, "BOOK_CREDIT_TAKE_TRANSCRIPT_NOT_VERIFIED");
  requireVerified(input.engineeringArtifact, "BOOK_CREDIT_TAKE_ENGINEERING_NOT_VERIFIED");
  requireSameScope(
    input.audioCandidate,
    input.transcriptArtifact,
    "BOOK_CREDIT_TAKE_TRANSCRIPT_SCOPE_MISMATCH",
  );
  requireSameScope(
    input.audioCandidate,
    input.engineeringArtifact,
    "BOOK_CREDIT_TAKE_ENGINEERING_SCOPE_MISMATCH",
  );
  requireParent(
    input.transcriptArtifact,
    input.audioCandidate.id,
    "BOOK_CREDIT_TAKE_TRANSCRIPT_PARENT_MISMATCH",
  );
  requireParent(
    input.engineeringArtifact,
    input.audioCandidate.id,
    "BOOK_CREDIT_TAKE_ENGINEERING_PARENT_MISMATCH",
  );

  if (
    input.audioCandidate.projectId !== input.plan.projectId
    || input.audioCandidate.jobId !== input.plan.job.id
    || input.audioCandidate.segmentId !== input.plan.job.segmentId
    || !input.audioCandidate.takeId
  ) {
    throw new BookCreditTakeError("BOOK_CREDIT_TAKE_PLAN_SCOPE_MISMATCH");
  }
  if (
    input.audioCandidate.provenance.providerId
      !== input.plan.calibration.calibrationLock.providerId
  ) {
    throw new BookCreditTakeError("BOOK_CREDIT_TAKE_PROVIDER_MISMATCH");
  }
  if (
    input.transcriptArtifact.rights.rightsFingerprint
      !== input.audioCandidate.rights.rightsFingerprint
    || input.engineeringArtifact.rights.rightsFingerprint
      !== input.audioCandidate.rights.rightsFingerprint
    || input.audioCandidate.rights.rightsFingerprint
      !== input.plan.material.material.rights.rightsFingerprint
  ) {
    throw new BookCreditTakeError("BOOK_CREDIT_TAKE_RIGHTS_SCOPE_MISMATCH");
  }
  if (
    input.transcriptEvidence.sourceTextHash !== input.plan.script.textHash
    || input.transcriptEvidence.sourceCharacterCount !== input.plan.script.text.length
  ) {
    throw new BookCreditTakeError("BOOK_CREDIT_TAKE_TRANSCRIPT_SOURCE_MISMATCH");
  }
  if (
    input.engineeringEvidence.inputContentHash
      !== input.audioCandidate.integrity.contentHash
    || input.engineeringEvidence.inputByteCount
      !== input.audioCandidate.integrity.byteCount
    || input.engineeringArtifact.provenance.sourceContentHash
      !== input.audioCandidate.integrity.contentHash
  ) {
    throw new BookCreditTakeError("BOOK_CREDIT_TAKE_ENGINEERING_CONTENT_MISMATCH");
  }

  requireChronology(
    input.audioCandidate.createdAt,
    input.transcriptEvidence.assessedAt,
    "BOOK_CREDIT_TAKE_TRANSCRIPT_PRECEDES_AUDIO",
  );
  requireChronology(
    input.audioCandidate.createdAt,
    input.engineeringEvidence.measuredAt,
    "BOOK_CREDIT_TAKE_ENGINEERING_PRECEDES_AUDIO",
  );
  requireChronology(
    input.engineeringEvidence.measuredAt,
    input.engineeringArtifact.createdAt,
    "BOOK_CREDIT_TAKE_ENGINEERING_ARTIFACT_PRECEDES_MEASUREMENT",
  );

  const findings: Finding[] = [];
  if (!input.transcriptEvidence.exactMatch) {
    findings.push({
      code: "BOOK_CREDIT_TAKE_TRANSCRIPT_NOT_EXACT",
      severity: "error",
      message: "Observed credit transcript does not exactly match the approved script.",
    });
  }
  if (!input.transcriptEvidence.finalWordCovered) {
    findings.push({
      code: "BOOK_CREDIT_TAKE_FINAL_WORD_MISSING",
      severity: "error",
      message: "Observed credit transcript does not preserve the approved final word.",
    });
  }
  findings.push(...input.engineeringEvidence.findings.filter(
    (finding) => finding.severity === "error",
  ));
  if (!input.engineeringEvidence.eligible && findings.length === 0) {
    findings.push({
      code: "BOOK_CREDIT_TAKE_ENGINEERING_INELIGIBLE",
      severity: "error",
      message: "Independent engineering did not admit the generated credit take.",
    });
  }

  const createdAt = input.createdAt ?? new Date();
  if (Number.isNaN(createdAt.getTime())) {
    throw new BookCreditTakeError("BOOK_CREDIT_TAKE_DATE_INVALID");
  }
  requireChronology(
    input.engineeringArtifact.createdAt,
    createdAt.toISOString(),
    "BOOK_CREDIT_TAKE_PRECEDES_EVIDENCE",
  );
  const eligibleForReview = findings.length === 0;
  const partial: Omit<BookCreditTakeRecord, "fingerprint"> = {
    schemaVersion: BOOK_CREDIT_TAKE_SCHEMA_VERSION,
    id: input.id,
    projectId: input.plan.projectId,
    bookId: input.plan.bookId,
    creditKind: input.plan.creditKind,
    planId: input.plan.id,
    planFingerprint: input.plan.fingerprint,
    scriptId: input.plan.script.id,
    scriptRevision: input.plan.script.revision,
    scriptTextHash: input.plan.script.textHash,
    jobId: input.plan.job.id,
    segmentId: input.plan.job.segmentId,
    takeId: input.audioCandidate.takeId,
    voiceRevision: input.plan.material.material.voiceRevision,
    calibrationLockFingerprint:
      input.plan.calibration.calibrationLock.lockFingerprint,
    audio: artifactSnapshot(input.audioCandidate),
    transcript: artifactSnapshot(input.transcriptArtifact),
    engineering: artifactSnapshot(input.engineeringArtifact),
    transcriptEvidence: input.transcriptEvidence,
    engineeringEvidenceFingerprint: input.engineeringEvidence.fingerprint,
    engineeringProfileId: input.engineeringEvidence.profile.profile.id,
    engineeringProfileVersion: input.engineeringEvidence.profile.externalVersion,
    eligibleForReview,
    findings: Object.freeze(findings),
    status: eligibleForReview ? "eligible-for-review" : "blocked",
    createdAt: createdAt.toISOString(),
  };
  const record = Object.freeze({ ...partial, fingerprint: recordFingerprint(partial) });
  assertBookCreditTakeRecord(record);
  return record;
}

export function assertBookCreditTakeRecord(record: BookCreditTakeRecord): void {
  if (record.schemaVersion !== BOOK_CREDIT_TAKE_SCHEMA_VERSION) {
    throw new BookCreditTakeError("BOOK_CREDIT_TAKE_SCHEMA_UNSUPPORTED");
  }
  for (const [value, code] of [
    [record.id, "BOOK_CREDIT_TAKE_ID_INVALID"],
    [record.projectId, "BOOK_CREDIT_TAKE_PROJECT_ID_INVALID"],
    [record.bookId, "BOOK_CREDIT_TAKE_BOOK_ID_INVALID"],
    [record.planId, "BOOK_CREDIT_TAKE_PLAN_ID_INVALID"],
    [record.scriptId, "BOOK_CREDIT_TAKE_SCRIPT_ID_INVALID"],
    [record.jobId, "BOOK_CREDIT_TAKE_JOB_ID_INVALID"],
    [record.segmentId, "BOOK_CREDIT_TAKE_SEGMENT_ID_INVALID"],
    [record.takeId, "BOOK_CREDIT_TAKE_TAKE_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  for (const [value, code] of [
    [record.planFingerprint, "BOOK_CREDIT_TAKE_PLAN_HASH_INVALID"],
    [record.scriptTextHash, "BOOK_CREDIT_TAKE_SCRIPT_HASH_INVALID"],
    [record.calibrationLockFingerprint, "BOOK_CREDIT_TAKE_CALIBRATION_HASH_INVALID"],
    [record.engineeringEvidenceFingerprint, "BOOK_CREDIT_TAKE_ENGINEERING_HASH_INVALID"],
  ] as const) requireHash(value, code);
  if (record.creditKind !== "opening" && record.creditKind !== "closing") {
    throw new BookCreditTakeError("BOOK_CREDIT_TAKE_KIND_INVALID");
  }
  requireInteger(record.scriptRevision, 1, Number.MAX_SAFE_INTEGER, "BOOK_CREDIT_TAKE_SCRIPT_REVISION_INVALID");
  requireInteger(record.voiceRevision, 1, Number.MAX_SAFE_INTEGER, "BOOK_CREDIT_TAKE_VOICE_REVISION_INVALID");
  assertSnapshot(record.audio, "BOOK_CREDIT_TAKE_AUDIO_SNAPSHOT_INVALID");
  assertSnapshot(record.transcript, "BOOK_CREDIT_TAKE_TRANSCRIPT_SNAPSHOT_INVALID");
  assertSnapshot(record.engineering, "BOOK_CREDIT_TAKE_ENGINEERING_SNAPSHOT_INVALID");
  assertBookCreditTranscriptEvidence(record.transcriptEvidence);
  requireIdentifier(record.engineeringProfileId, "BOOK_CREDIT_TAKE_ENGINEERING_PROFILE_INVALID");
  if (!record.engineeringProfileVersion.trim()) {
    throw new BookCreditTakeError("BOOK_CREDIT_TAKE_ENGINEERING_VERSION_INVALID");
  }
  if (!Array.isArray(record.findings) || record.findings.some((finding) =>
    !finding.code?.trim()
    || !finding.message?.trim()
    || !["info", "warning", "error"].includes(finding.severity)
  )) {
    throw new BookCreditTakeError("BOOK_CREDIT_TAKE_FINDINGS_INVALID");
  }
  const errors = record.findings.filter((finding) => finding.severity === "error");
  if (
    record.eligibleForReview !== (errors.length === 0)
    || record.status !== (record.eligibleForReview ? "eligible-for-review" : "blocked")
  ) {
    throw new BookCreditTakeError("BOOK_CREDIT_TAKE_STATUS_MISMATCH");
  }
  requireDate(record.createdAt, "BOOK_CREDIT_TAKE_DATE_INVALID");
  const { fingerprint, ...partial } = record;
  if (!HASH_PATTERN.test(fingerprint) || recordFingerprint(partial) !== fingerprint) {
    throw new BookCreditTakeError("BOOK_CREDIT_TAKE_FINGERPRINT_INVALID");
  }
}

export function bookCreditTakePublicView(
  record: BookCreditTakeRecord,
): BookCreditTakePublicView {
  assertBookCreditTakeRecord(record);
  return Object.freeze({
    id: record.id,
    bookId: record.bookId,
    creditKind: record.creditKind,
    planId: record.planId,
    scriptRevision: record.scriptRevision,
    scriptTextHash: record.scriptTextHash,
    takeId: record.takeId,
    voiceRevision: record.voiceRevision,
    transcriptExact: record.transcriptEvidence.exactMatch,
    finalWordCovered: record.transcriptEvidence.finalWordCovered,
    engineeringProfileId: record.engineeringProfileId,
    engineeringProfileVersion: record.engineeringProfileVersion,
    eligibleForReview: record.eligibleForReview,
    findingCodes: Object.freeze(record.findings.map((finding) => finding.code)),
    status: record.status,
    createdAt: record.createdAt,
    fingerprint: record.fingerprint,
  });
}

function payload(record: BookCreditTakeRecord): Record<string, unknown> {
  return record as unknown as Record<string, unknown>;
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<BookCreditTakeRecord> {
  const record = envelope.payload as unknown as BookCreditTakeRecord;
  assertBookCreditTakeRecord(record);
  if (
    envelope.entityType !== ENTITY_TYPE
    || envelope.entityId !== record.id
    || envelope.revision !== 1
  ) {
    throw new BookCreditTakeStoreConflictError("BOOK_CREDIT_TAKE_STORE_SCOPE_MISMATCH");
  }
  return envelope as unknown as StoredEnvelope<BookCreditTakeRecord>;
}

export class FileBookCreditTakeStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    record: BookCreditTakeRecord,
    actorId: string,
  ): Promise<StoredEnvelope<BookCreditTakeRecord>> {
    assertBookCreditTakeRecord(record);
    requireIdentifier(actorId, "BOOK_CREDIT_TAKE_ACTOR_ID_INVALID");
    const existing = await this.read(record.id);
    if (existing) {
      if (existing.payload.fingerprint === record.fingerprint) return existing;
      throw new BookCreditTakeStoreConflictError("BOOK_CREDIT_TAKE_IDEMPOTENCY_CONFLICT");
    }
    try {
      const envelope = toEnvelope(await this.#store.create(
        ENTITY_TYPE,
        record.id,
        payload(record),
        new Date(record.createdAt),
      ));
      await this.#store.appendAuditEvent({
        actorId,
        action: "book_credit.take_admitted",
        entityType: ENTITY_TYPE,
        entityId: envelope.entityId,
        revision: envelope.revision,
        occurredAt: new Date(envelope.savedAt),
        metadata: {
          bookId: record.bookId,
          creditKind: record.creditKind,
          takeId: record.takeId,
          eligibleForReview: record.eligibleForReview,
          findingCount: record.findings.length,
          scriptTextHash: record.scriptTextHash,
          recordFingerprint: record.fingerprint,
        },
      });
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new BookCreditTakeStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(id: string): Promise<StoredEnvelope<BookCreditTakeRecord> | null> {
    requireIdentifier(id, "BOOK_CREDIT_TAKE_ID_INVALID");
    const envelope = await this.#store.read<Record<string, unknown>>(ENTITY_TYPE, id);
    return envelope ? toEnvelope(envelope) : null;
  }
}
