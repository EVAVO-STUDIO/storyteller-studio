import { createHash } from "node:crypto";
import {
  ingestPrivateArtifact,
  type ArtifactIngestResult,
} from "./artifact-ingest.js";
import {
  assertArtifactRecord,
  recordArtifactReview,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import {
  ArtifactStoreConflictError,
  FileArtifactRegistry,
} from "./artifact-store.js";
import {
  assertBookCreditTakeReviewSession,
  type BookCreditTakeReviewEntry,
  type BookCreditTakeReviewSession,
} from "./book-credit-take-review.js";
import { stableHash } from "./index.js";
import type { FilePrivateObjectStore } from "./private-object-store.js";
import type { StoredEnvelope } from "./project-store.js";

export const BOOK_CREDIT_MASTER_SCHEMA_VERSION =
  "storyteller-book-credit-master-v1" as const;
export const BOOK_CREDIT_MASTER_REVIEW_EVIDENCE_SCHEMA_VERSION =
  "storyteller-book-credit-master-review-evidence-v1" as const;

export interface BookCreditMasterReviewEvidence {
  schemaVersion: typeof BOOK_CREDIT_MASTER_REVIEW_EVIDENCE_SCHEMA_VERSION;
  sessionId: string;
  sessionRevision: number;
  sessionFingerprint: string;
  bookId: string;
  creditKind: "opening" | "closing";
  selectedTakeRecordId: string;
  selectedAudioArtifactId: string;
  selectionFingerprint: string;
  approvalFingerprint: string;
  editorialReviewFingerprint: string;
  engineeringReviewFingerprint: string;
  selectedAt: string;
  approvedAt: string;
  fingerprint: string;
}

export interface BookCreditMasterChain {
  schemaVersion: typeof BOOK_CREDIT_MASTER_SCHEMA_VERSION;
  sessionId: string;
  sessionRevision: number;
  sessionFingerprint: string;
  bookId: string;
  creditKind: "opening" | "closing";
  selectedTakeRecordId: string;
  selectedAudioArtifactId: string;
  selectedAudioRevision: number;
  selectedAudioFingerprint: string;
  approvedSourceAudio: StoredEnvelope<ArtifactRecord>;
  transcriptArtifact: StoredEnvelope<ArtifactRecord>;
  engineeringArtifact: StoredEnvelope<ArtifactRecord>;
  reviewEvidence: StoredEnvelope<ArtifactRecord>;
  creditMaster: StoredEnvelope<ArtifactRecord>;
  contentHash: string;
  byteCount: number;
  format: "wav" | "flac";
  lossless: true;
  eligibleForBookAssembly: true;
  createdAt: string;
  fingerprint: string;
}

export interface BookCreditMasterPublicView {
  bookId: string;
  creditKind: "opening" | "closing";
  selectedTakeRecordId: string;
  creditMasterId: string;
  creditMasterRevision: number;
  format: "wav" | "flac";
  lossless: true;
  verificationStatus: ArtifactRecord["verification"]["status"];
  reviewStatus: ArtifactRecord["review"]["status"];
  eligibleForBookAssembly: true;
  createdAt: string;
  fingerprint: string;
}

export interface PromoteBookCreditMasterInput {
  session: BookCreditTakeReviewSession;
  sourceAudio: ArtifactRecord;
  transcriptArtifact: ArtifactRecord;
  engineeringArtifact: ArtifactRecord;
  sourceBytes: Uint8Array;
  rights: ArtifactRightsSnapshot;
  actorId: string;
  verifierActorId?: string;
  now?: Date;
}

export class BookCreditMasterError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "BookCreditMasterError";
    this.code = code;
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const REVIEW_ROLES = Object.freeze(["editorial", "engineering"] as const);

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new BookCreditMasterError(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new BookCreditMasterError(code);
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) throw new BookCreditMasterError(code);
  return value;
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function immutableArtifactFingerprint(record: ArtifactRecord): string {
  return stableHash({
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

function assertArtifactSnapshot(
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
  assertArtifactRecord(record);
  if (
    record.id !== snapshot.id
    || record.revision !== snapshot.revision
    || record.fingerprint !== snapshot.fingerprint
    || record.integrity.contentHash !== snapshot.contentHash
    || record.integrity.byteCount !== snapshot.byteCount
  ) {
    throw new BookCreditMasterError(code);
  }
}

function assertCurrentArtifact(
  current: ArtifactRecord,
  supplied: ArtifactRecord,
  code: string,
): void {
  assertArtifactRecord(current);
  if (immutableArtifactFingerprint(current) !== immutableArtifactFingerprint(supplied)) {
    throw new BookCreditMasterError(code);
  }
}

function assertVerified(record: ArtifactRecord, code: string): void {
  if (
    record.verification.status !== "verified"
    || record.verification.findings.some((finding) => finding.severity === "error")
    || record.quarantine
  ) {
    throw new BookCreditMasterError(code);
  }
}

function assertSameScope(
  expected: ArtifactRecord,
  actual: ArtifactRecord,
  code: string,
): void {
  if (
    actual.projectId !== expected.projectId
    || actual.jobId !== expected.jobId
    || actual.segmentId !== expected.segmentId
    || actual.takeId !== expected.takeId
  ) {
    throw new BookCreditMasterError(code);
  }
}

function assertParent(record: ArtifactRecord, parentId: string, code: string): void {
  if (!record.provenance.parentArtifactIds.includes(parentId)) {
    throw new BookCreditMasterError(code);
  }
}

function assertRights(
  rights: ArtifactRightsSnapshot,
  records: readonly ArtifactRecord[],
  now: Date,
): void {
  requireIdentifier(rights.rightsEvidenceId, "BOOK_CREDIT_MASTER_RIGHTS_ID_INVALID");
  requireHash(rights.rightsFingerprint, "BOOK_CREDIT_MASTER_RIGHTS_HASH_INVALID");
  if (!rights.allowedUses.includes("audiobook")) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_AUDIOBOOK_RIGHTS_REQUIRED");
  }
  if (!rights.commercialUseApproved) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_COMMERCIAL_RIGHTS_REQUIRED");
  }
  for (const [value, code] of [
    [rights.expiresAt, "BOOK_CREDIT_MASTER_RIGHTS_EXPIRY_INVALID"],
    [rights.retainUntil, "BOOK_CREDIT_MASTER_RETAIN_UNTIL_INVALID"],
    [rights.deletionRequiredAt, "BOOK_CREDIT_MASTER_DELETION_DATE_INVALID"],
  ] as const) {
    if (value !== undefined && Number.isNaN(Date.parse(value))) {
      throw new BookCreditMasterError(code);
    }
  }
  if (rights.expiresAt && Date.parse(rights.expiresAt) <= now.getTime()) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_RIGHTS_EXPIRED");
  }
  if (
    rights.deletionRequiredAt
    && Date.parse(rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_RETENTION_EXPIRED");
  }
  for (const record of records) {
    if (
      record.rights.rightsFingerprint !== rights.rightsFingerprint
      || record.rights.rightsEvidenceId !== rights.rightsEvidenceId
      || !record.rights.allowedUses.includes("audiobook")
      || !record.rights.commercialUseApproved
    ) {
      throw new BookCreditMasterError("BOOK_CREDIT_MASTER_RIGHTS_SCOPE_MISMATCH");
    }
  }
}

function latestSelectedReview(
  session: BookCreditTakeReviewSession,
  role: "editorial" | "engineering",
): BookCreditTakeReviewEntry {
  const selection = session.selection;
  if (!selection) throw new BookCreditMasterError("BOOK_CREDIT_MASTER_SELECTION_REQUIRED");
  const reviews = session.reviews.filter(
    (review) => review.candidateTakeId === selection.candidateTakeId && review.role === role,
  );
  const latest = reviews.at(-1);
  if (!latest || latest.decision !== "approve") {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_APPROVED_REVIEW_SET_REQUIRED");
  }
  return latest;
}

function reviewEvidenceFingerprint(
  evidence: Omit<BookCreditMasterReviewEvidence, "fingerprint">,
): string {
  return stableHash(evidence);
}

function createReviewEvidence(
  session: BookCreditTakeReviewSession,
): BookCreditMasterReviewEvidence {
  assertBookCreditTakeReviewSession(session);
  if (session.status !== "approved" || !session.selection || !session.approval) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_APPROVED_SESSION_REQUIRED");
  }
  const selected = session.candidates.find(
    (candidate) => candidate.take.id === session.selection!.candidateTakeId,
  );
  if (!selected) throw new BookCreditMasterError("BOOK_CREDIT_MASTER_SELECTED_TAKE_MISSING");
  const editorial = latestSelectedReview(session, "editorial");
  const engineering = latestSelectedReview(session, "engineering");
  const partial: Omit<BookCreditMasterReviewEvidence, "fingerprint"> = {
    schemaVersion: BOOK_CREDIT_MASTER_REVIEW_EVIDENCE_SCHEMA_VERSION,
    sessionId: session.id,
    sessionRevision: session.revision,
    sessionFingerprint: session.fingerprint,
    bookId: session.bookId,
    creditKind: session.creditKind,
    selectedTakeRecordId: selected.take.id,
    selectedAudioArtifactId: selected.take.audio.id,
    selectionFingerprint: session.selection.fingerprint,
    approvalFingerprint: session.approval.fingerprint,
    editorialReviewFingerprint: editorial.fingerprint,
    engineeringReviewFingerprint: engineering.fingerprint,
    selectedAt: session.selection.selectedAt,
    approvedAt: session.approval.approvedAt,
  };
  const evidence = Object.freeze({
    ...partial,
    fingerprint: reviewEvidenceFingerprint(partial),
  });
  assertBookCreditMasterReviewEvidence(evidence);
  return evidence;
}

export function assertBookCreditMasterReviewEvidence(
  evidence: BookCreditMasterReviewEvidence,
): void {
  if (evidence.schemaVersion !== BOOK_CREDIT_MASTER_REVIEW_EVIDENCE_SCHEMA_VERSION) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_REVIEW_SCHEMA_UNSUPPORTED");
  }
  for (const [value, code] of [
    [evidence.sessionId, "BOOK_CREDIT_MASTER_SESSION_ID_INVALID"],
    [evidence.bookId, "BOOK_CREDIT_MASTER_BOOK_ID_INVALID"],
    [evidence.selectedTakeRecordId, "BOOK_CREDIT_MASTER_TAKE_ID_INVALID"],
    [evidence.selectedAudioArtifactId, "BOOK_CREDIT_MASTER_AUDIO_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  if (evidence.creditKind !== "opening" && evidence.creditKind !== "closing") {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_KIND_INVALID");
  }
  if (!Number.isSafeInteger(evidence.sessionRevision) || evidence.sessionRevision < 1) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_SESSION_REVISION_INVALID");
  }
  for (const hash of [
    evidence.sessionFingerprint,
    evidence.selectionFingerprint,
    evidence.approvalFingerprint,
    evidence.editorialReviewFingerprint,
    evidence.engineeringReviewFingerprint,
  ]) requireHash(hash, "BOOK_CREDIT_MASTER_REVIEW_HASH_INVALID");
  requireDate(evidence.selectedAt, "BOOK_CREDIT_MASTER_SELECTION_DATE_INVALID");
  requireDate(evidence.approvedAt, "BOOK_CREDIT_MASTER_APPROVAL_DATE_INVALID");
  if (Date.parse(evidence.approvedAt) < Date.parse(evidence.selectedAt)) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_REVIEW_DATE_ORDER_INVALID");
  }
  const { fingerprint, ...partial } = evidence;
  if (!HASH_PATTERN.test(fingerprint) || reviewEvidenceFingerprint(partial) !== fingerprint) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_REVIEW_FINGERPRINT_INVALID");
  }
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

function chainFingerprint(
  chain: Omit<BookCreditMasterChain, "fingerprint">,
): string {
  return stableHash({
    schemaVersion: chain.schemaVersion,
    sessionId: chain.sessionId,
    sessionRevision: chain.sessionRevision,
    sessionFingerprint: chain.sessionFingerprint,
    bookId: chain.bookId,
    creditKind: chain.creditKind,
    selectedTakeRecordId: chain.selectedTakeRecordId,
    selectedAudioArtifactId: chain.selectedAudioArtifactId,
    selectedAudioRevision: chain.selectedAudioRevision,
    selectedAudioFingerprint: chain.selectedAudioFingerprint,
  approvedSourceAudio: {
    id: chain.approvedSourceAudio.payload.id,
    revision: chain.approvedSourceAudio.revision,
    fingerprint: chain.approvedSourceAudio.payload.fingerprint,
    envelopeHash: chain.approvedSourceAudio.envelopeHash,
  },
  transcriptArtifact: {
    id: chain.transcriptArtifact.payload.id,
    revision: chain.transcriptArtifact.revision,
    fingerprint: chain.transcriptArtifact.payload.fingerprint,
    envelopeHash: chain.transcriptArtifact.envelopeHash,
  },
  engineeringArtifact: {
    id: chain.engineeringArtifact.payload.id,
    revision: chain.engineeringArtifact.revision,
    fingerprint: chain.engineeringArtifact.payload.fingerprint,
    envelopeHash: chain.engineeringArtifact.envelopeHash,
  },
    reviewEvidence: {
      id: chain.reviewEvidence.payload.id,
      revision: chain.reviewEvidence.revision,
      fingerprint: chain.reviewEvidence.payload.fingerprint,
    },
    creditMaster: {
      id: chain.creditMaster.payload.id,
      revision: chain.creditMaster.revision,
      fingerprint: chain.creditMaster.payload.fingerprint,
    },
    contentHash: chain.contentHash,
    byteCount: chain.byteCount,
    format: chain.format,
    lossless: chain.lossless,
    eligibleForBookAssembly: chain.eligibleForBookAssembly,
    createdAt: chain.createdAt,
  });
}

async function approveArtifact(
  registry: FileArtifactRegistry,
  envelope: StoredEnvelope<ArtifactRecord>,
  input: Readonly<{
    reviewerId: string;
    notes: string;
    decidedAt: Date;
    action: string;
  }>,
): Promise<StoredEnvelope<ArtifactRecord>> {
  const record = envelope.payload;
  if (record.review.status === "approved") return envelope;
  if (!record.review.required || record.review.status !== "pending") {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_ARTIFACT_REVIEW_STATE_INVALID");
  }
  const reviewed = recordArtifactReview(record, {
    decision: "approved",
    reviewerId: input.reviewerId,
    notes: input.notes,
    decidedAt: input.decidedAt,
  });
  try {
    return await registry.save(reviewed, {
      expectedRevision: envelope.revision,
      actorId: input.reviewerId,
      action: input.action,
    });
  } catch (error) {
    if (!(error instanceof ArtifactStoreConflictError)) throw error;
    const current = await registry.require(record.id);
    if (current.payload.review.status !== "approved") throw error;
    return current;
  }
}

export async function promoteBookCreditMaster(
  objectStore: FilePrivateObjectStore,
  registry: FileArtifactRegistry,
  input: PromoteBookCreditMasterInput,
): Promise<BookCreditMasterChain> {
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new BookCreditMasterError("BOOK_CREDIT_MASTER_DATE_INVALID");
  requireIdentifier(input.actorId, "BOOK_CREDIT_MASTER_ACTOR_ID_INVALID");
  const verifierActorId = input.verifierActorId ?? input.actorId;
  requireIdentifier(verifierActorId, "BOOK_CREDIT_MASTER_VERIFIER_ID_INVALID");
  assertBookCreditTakeReviewSession(input.session);
  if (
    input.session.status !== "approved"
    || !input.session.selection
    || !input.session.approval
    || Date.parse(input.session.updatedAt) > now.getTime()
  ) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_APPROVED_SESSION_REQUIRED");
  }
  const selected = input.session.candidates.find(
    (candidate) => candidate.take.id === input.session.selection!.candidateTakeId,
  );
  if (!selected) throw new BookCreditMasterError("BOOK_CREDIT_MASTER_SELECTED_TAKE_MISSING");
  if (!selected.take.eligibleForReview || selected.take.status !== "eligible-for-review") {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_SELECTED_TAKE_INELIGIBLE");
  }

  assertArtifactSnapshot(
    input.sourceAudio,
    selected.take.audio,
    "BOOK_CREDIT_MASTER_AUDIO_SNAPSHOT_MISMATCH",
  );
  assertArtifactSnapshot(
    input.transcriptArtifact,
    selected.take.transcript,
    "BOOK_CREDIT_MASTER_TRANSCRIPT_SNAPSHOT_MISMATCH",
  );
  assertArtifactSnapshot(
    input.engineeringArtifact,
    selected.take.engineering,
    "BOOK_CREDIT_MASTER_ENGINEERING_SNAPSHOT_MISMATCH",
  );
  if (input.sourceAudio.kind !== "audio-candidate") {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_AUDIO_CANDIDATE_REQUIRED");
  }
  if (
    input.transcriptArtifact.kind !== "transcript"
    && input.transcriptArtifact.kind !== "audio-analysis"
  ) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_TRANSCRIPT_ARTIFACT_INVALID");
  }
  if (input.engineeringArtifact.kind !== "audio-analysis") {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_ENGINEERING_ARTIFACT_INVALID");
  }
  for (const [record, code] of [
    [input.sourceAudio, "BOOK_CREDIT_MASTER_AUDIO_NOT_VERIFIED"],
    [input.transcriptArtifact, "BOOK_CREDIT_MASTER_TRANSCRIPT_NOT_VERIFIED"],
    [input.engineeringArtifact, "BOOK_CREDIT_MASTER_ENGINEERING_NOT_VERIFIED"],
  ] as const) assertVerified(record, code);
  assertSameScope(
    input.sourceAudio,
    input.transcriptArtifact,
    "BOOK_CREDIT_MASTER_TRANSCRIPT_SCOPE_MISMATCH",
  );
  assertSameScope(
    input.sourceAudio,
    input.engineeringArtifact,
    "BOOK_CREDIT_MASTER_ENGINEERING_SCOPE_MISMATCH",
  );
  assertParent(
    input.transcriptArtifact,
    input.sourceAudio.id,
    "BOOK_CREDIT_MASTER_TRANSCRIPT_PARENT_MISMATCH",
  );
  assertParent(
    input.engineeringArtifact,
    input.sourceAudio.id,
    "BOOK_CREDIT_MASTER_ENGINEERING_PARENT_MISMATCH",
  );
  assertRights(
    input.rights,
    [input.sourceAudio, input.transcriptArtifact, input.engineeringArtifact],
    now,
  );
  if (!(input.sourceBytes instanceof Uint8Array) || input.sourceBytes.byteLength === 0) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_BYTES_REQUIRED");
  }
  if (
    input.sourceBytes.byteLength !== input.sourceAudio.integrity.byteCount
    || hashBytes(input.sourceBytes) !== input.sourceAudio.integrity.contentHash
  ) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_SOURCE_BYTES_MISMATCH");
  }
  if (
    (input.sourceAudio.integrity.format !== "wav"
      || input.sourceAudio.integrity.mimeType !== "audio/wav")
    && (input.sourceAudio.integrity.format !== "flac"
      || input.sourceAudio.integrity.mimeType !== "audio/flac")
  ) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_LOSSLESS_FORMAT_REQUIRED");
  }
  const format = input.sourceAudio.integrity.format as "wav" | "flac";

  const currentAudio = await registry.require(input.sourceAudio.id);
  const currentTranscript = await registry.require(input.transcriptArtifact.id);
  const currentEngineering = await registry.require(input.engineeringArtifact.id);
  assertCurrentArtifact(
    currentAudio.payload,
    input.sourceAudio,
    "BOOK_CREDIT_MASTER_CURRENT_AUDIO_MISMATCH",
  );
  assertCurrentArtifact(
    currentTranscript.payload,
    input.transcriptArtifact,
    "BOOK_CREDIT_MASTER_CURRENT_TRANSCRIPT_MISMATCH",
  );
  assertCurrentArtifact(
    currentEngineering.payload,
    input.engineeringArtifact,
    "BOOK_CREDIT_MASTER_CURRENT_ENGINEERING_MISMATCH",
  );
  for (const [record, code] of [
    [currentAudio.payload, "BOOK_CREDIT_MASTER_CURRENT_AUDIO_NOT_VERIFIED"],
    [currentTranscript.payload, "BOOK_CREDIT_MASTER_CURRENT_TRANSCRIPT_NOT_VERIFIED"],
    [currentEngineering.payload, "BOOK_CREDIT_MASTER_CURRENT_ENGINEERING_NOT_VERIFIED"],
  ] as const) assertVerified(record, code);

  const sourceApprovalTime = new Date(
    Math.max(now.getTime(), Date.parse(currentAudio.payload.updatedAt)),
  );
  const approvedSource = await approveArtifact(registry, currentAudio, {
    reviewerId: input.session.approval.approvedByActorId,
    notes: `Selected ${input.session.creditKind} credit take approved by review session ${input.session.id}.`,
    decidedAt: sourceApprovalTime,
    action: "artifact.credit_source_approved",
  });

  const reviewEvidence = createReviewEvidence(input.session);
  const reviewIngest = await ingestPrivateArtifact(objectStore, registry, {
    id: `artifact_credit_review_${reviewEvidence.fingerprint.slice(0, 24)}`,
    kind: "audio-analysis",
    projectId: input.sourceAudio.projectId,
    ...(input.sourceAudio.jobId ? { jobId: input.sourceAudio.jobId } : {}),
    ...(input.sourceAudio.segmentId ? { segmentId: input.sourceAudio.segmentId } : {}),
    ...(input.sourceAudio.takeId ? { takeId: input.sourceAudio.takeId } : {}),
    bytes: jsonBytes({ evidence: reviewEvidence, session: input.session }),
    claimedMimeType: "application/json",
    claimedFormat: "json",
    provenance: {
      createdByActorId: input.actorId,
      sourceContentHash: input.sourceAudio.integrity.contentHash,
      generationRequestHash: input.session.fingerprint,
      parentArtifactIds: [
        approvedSource.payload.id,
        currentTranscript.payload.id,
        currentEngineering.payload.id,
      ],
    },
    rights: input.rights,
    reviewRequired: false,
    actorId: input.actorId,
    verifierActorId,
    verificationChecks: [
      "credit-review-session-schema",
      "selection-fingerprint",
      "approval-fingerprint",
      "independent-review-set",
    ],
    now,
  });
  if (!reviewIngest.accepted) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_REVIEW_EVIDENCE_INVALID");
  }

  const masterIngest: ArtifactIngestResult = await ingestPrivateArtifact(
    objectStore,
    registry,
    {
      id: `artifact_credit_master_${stableHash({
        session: input.session.fingerprint,
        output: input.sourceAudio.integrity.contentHash,
        role: input.session.creditKind,
      }).slice(0, 24)}`,
      kind: "credit-master",
      projectId: input.sourceAudio.projectId,
      ...(input.sourceAudio.jobId ? { jobId: input.sourceAudio.jobId } : {}),
      ...(input.sourceAudio.segmentId ? { segmentId: input.sourceAudio.segmentId } : {}),
      ...(input.sourceAudio.takeId ? { takeId: input.sourceAudio.takeId } : {}),
      bytes: input.sourceBytes,
      claimedMimeType: input.sourceAudio.integrity.mimeType,
      claimedFormat: format,
      provenance: {
        createdByActorId: input.actorId,
        sourceContentHash: input.sourceAudio.integrity.contentHash,
        generationRequestHash: input.session.approval.fingerprint,
        parentArtifactIds: [
          approvedSource.payload.id,
          currentTranscript.payload.id,
          currentEngineering.payload.id,
          reviewIngest.envelope.payload.id,
        ],
      },
      rights: input.rights,
      reviewRequired: true,
      actorId: input.actorId,
      verifierActorId,
      verificationChecks: [
        "lossless-byte-identity",
        "selected-take-snapshot",
        "credit-review-evidence",
        "opening-closing-role",
      ],
      now,
    },
  );
  if (!masterIngest.accepted) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_ARTIFACT_INVALID");
  }
  if (
    masterIngest.envelope.payload.integrity.contentHash
      !== approvedSource.payload.integrity.contentHash
    || masterIngest.envelope.payload.integrity.byteCount
      !== approvedSource.payload.integrity.byteCount
  ) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_NOT_LOSSLESS");
  }
  const masterApprovalTime = new Date(
    Math.max(now.getTime(), Date.parse(masterIngest.envelope.payload.updatedAt)),
  );
  const approvedMaster = await approveArtifact(registry, masterIngest.envelope, {
    reviewerId: input.session.approval.approvedByActorId,
    notes: `Lossless ${input.session.creditKind} credit master promoted from approved take ${selected.take.id}.`,
    decidedAt: masterApprovalTime,
    action: "artifact.credit_master_approved",
  });

  const partial: Omit<BookCreditMasterChain, "fingerprint"> = {
    schemaVersion: BOOK_CREDIT_MASTER_SCHEMA_VERSION,
    sessionId: input.session.id,
    sessionRevision: input.session.revision,
    sessionFingerprint: input.session.fingerprint,
    bookId: input.session.bookId,
    creditKind: input.session.creditKind,
    selectedTakeRecordId: selected.take.id,
    selectedAudioArtifactId: approvedSource.payload.id,
    selectedAudioRevision: approvedSource.revision,
    selectedAudioFingerprint: approvedSource.payload.fingerprint,
  approvedSourceAudio: approvedSource,
  transcriptArtifact: currentTranscript,
  engineeringArtifact: currentEngineering,
    reviewEvidence: reviewIngest.envelope,
    creditMaster: approvedMaster,
    contentHash: approvedMaster.payload.integrity.contentHash,
    byteCount: approvedMaster.payload.integrity.byteCount,
    format,
    lossless: true,
    eligibleForBookAssembly: true,
    createdAt: approvedMaster.payload.updatedAt,
  };
  const chain = Object.freeze({ ...partial, fingerprint: chainFingerprint(partial) });
  assertBookCreditMasterChain(chain);
  return chain;
}

function canonicalEnvelopeHash(
  envelope: Omit<StoredEnvelope<ArtifactRecord>, "envelopeHash">,
): string {
  return stableHash({
    schemaVersion: envelope.schemaVersion,
    entityType: envelope.entityType,
    entityId: envelope.entityId,
    revision: envelope.revision,
    createdAt: envelope.createdAt,
    savedAt: envelope.savedAt,
    contentHash: envelope.contentHash,
    previousEnvelopeHash: envelope.previousEnvelopeHash ?? null,
    payload: envelope.payload,
  });
}

function assertArtifactEnvelope(
  envelope: StoredEnvelope<ArtifactRecord>,
  kind: ArtifactRecord["kind"],
  code: string,
): void {
  assertArtifactRecord(envelope.payload);
  const { envelopeHash: _envelopeHash, ...partial } = envelope;
  if (
    envelope.schemaVersion !== "storyteller-store-v1"
    || envelope.entityType !== "artifact"
    || envelope.entityId !== envelope.payload.id
    || envelope.revision !== envelope.payload.revision
    || envelope.payload.kind !== kind
    || envelope.contentHash !== stableHash(envelope.payload)
  || canonicalEnvelopeHash(partial) !== envelope.envelopeHash
  ) {
    throw new BookCreditMasterError(code);
  }
}

export function assertBookCreditMasterChain(chain: BookCreditMasterChain): void {
  if (chain.schemaVersion !== BOOK_CREDIT_MASTER_SCHEMA_VERSION) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_SCHEMA_UNSUPPORTED");
  }
  for (const [value, code] of [
    [chain.sessionId, "BOOK_CREDIT_MASTER_SESSION_ID_INVALID"],
    [chain.bookId, "BOOK_CREDIT_MASTER_BOOK_ID_INVALID"],
    [chain.selectedTakeRecordId, "BOOK_CREDIT_MASTER_TAKE_ID_INVALID"],
    [chain.selectedAudioArtifactId, "BOOK_CREDIT_MASTER_AUDIO_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  if (chain.creditKind !== "opening" && chain.creditKind !== "closing") {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_KIND_INVALID");
  }
  if (!Number.isSafeInteger(chain.sessionRevision) || chain.sessionRevision < 1) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_SESSION_REVISION_INVALID");
  }
  if (!Number.isSafeInteger(chain.selectedAudioRevision) || chain.selectedAudioRevision < 1) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_AUDIO_REVISION_INVALID");
  }
  for (const hash of [
    chain.sessionFingerprint,
    chain.selectedAudioFingerprint,
    chain.contentHash,
  ]) requireHash(hash, "BOOK_CREDIT_MASTER_HASH_INVALID");
  if (!Number.isSafeInteger(chain.byteCount) || chain.byteCount < 1) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_BYTE_COUNT_INVALID");
  }
  if (chain.format !== "wav" && chain.format !== "flac") {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_FORMAT_INVALID");
  }
  if (chain.lossless !== true || chain.eligibleForBookAssembly !== true) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_STATE_INVALID");
  }
  requireDate(chain.createdAt, "BOOK_CREDIT_MASTER_DATE_INVALID");
  assertArtifactEnvelope(
  chain.approvedSourceAudio,
  "audio-candidate",
  "BOOK_CREDIT_MASTER_SOURCE_ENVELOPE_INVALID",
);
  if (
    chain.transcriptArtifact.payload.kind !== "transcript"
    && chain.transcriptArtifact.payload.kind !== "audio-analysis"
  ) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_TRANSCRIPT_ENVELOPE_INVALID");
  }
  assertArtifactEnvelope(
    chain.transcriptArtifact,
    chain.transcriptArtifact.payload.kind,
    "BOOK_CREDIT_MASTER_TRANSCRIPT_ENVELOPE_INVALID",
  );
  assertArtifactEnvelope(
    chain.engineeringArtifact,
    "audio-analysis",
    "BOOK_CREDIT_MASTER_ENGINEERING_ENVELOPE_INVALID",
  );
  assertArtifactEnvelope(
    chain.reviewEvidence,
    "audio-analysis",
    "BOOK_CREDIT_MASTER_REVIEW_ENVELOPE_INVALID",
  );
  assertArtifactEnvelope(
    chain.creditMaster,
    "credit-master",
    "BOOK_CREDIT_MASTER_ARTIFACT_ENVELOPE_INVALID",
  );
  const approvedSource = chain.approvedSourceAudio.payload;
  const transcript = chain.transcriptArtifact.payload;
  const engineering = chain.engineeringArtifact.payload;
  const review = chain.reviewEvidence.payload;
  const master = chain.creditMaster.payload;
  if (
    chain.selectedAudioArtifactId !== approvedSource.id
    || chain.selectedAudioRevision !== chain.approvedSourceAudio.revision
    || chain.selectedAudioFingerprint !== approvedSource.fingerprint
    || approvedSource.verification.status !== "verified"
    || approvedSource.review.status !== "approved"
    || approvedSource.integrity.contentHash !== chain.contentHash
    || approvedSource.integrity.byteCount !== chain.byteCount
    || transcript.projectId !== approvedSource.projectId
    || transcript.jobId !== approvedSource.jobId
    || transcript.segmentId !== approvedSource.segmentId
    || transcript.takeId !== approvedSource.takeId
    || engineering.projectId !== approvedSource.projectId
    || engineering.jobId !== approvedSource.jobId
    || engineering.segmentId !== approvedSource.segmentId
    || engineering.takeId !== approvedSource.takeId
    || transcript.verification.status !== "verified"
    || engineering.verification.status !== "verified"
    || !transcript.provenance.parentArtifactIds.includes(approvedSource.id)
    || !engineering.provenance.parentArtifactIds.includes(approvedSource.id)
    || review.provenance.parentArtifactIds.length !== 3
    || !review.provenance.parentArtifactIds.includes(approvedSource.id)
    || !review.provenance.parentArtifactIds.includes(transcript.id)
    || !review.provenance.parentArtifactIds.includes(engineering.id)
    || master.provenance.parentArtifactIds.length !== 4
    || !master.provenance.parentArtifactIds.includes(approvedSource.id)
    || !master.provenance.parentArtifactIds.includes(transcript.id)
    || !master.provenance.parentArtifactIds.includes(engineering.id)
    || !master.provenance.parentArtifactIds.includes(review.id)
    || stableHash(approvedSource.rights) !== stableHash(master.rights)
    || stableHash(approvedSource.rights) !== stableHash(review.rights)
    || stableHash(approvedSource.rights) !== stableHash(transcript.rights)
    || stableHash(approvedSource.rights) !== stableHash(engineering.rights)
    || Date.parse(chain.createdAt) !== Date.parse(master.updatedAt)
    ||
    master.verification.status !== "verified"
    || master.review.status !== "approved"
    || review.verification.status !== "verified"
    || master.integrity.contentHash !== chain.contentHash
    || master.integrity.byteCount !== chain.byteCount
    || master.integrity.format !== chain.format
    || master.provenance.sourceContentHash !== chain.contentHash
    || !master.provenance.parentArtifactIds.includes(review.id)
    || !master.provenance.parentArtifactIds.includes(chain.selectedAudioArtifactId)
    || review.provenance.sourceContentHash !== chain.contentHash
    || !review.provenance.parentArtifactIds.includes(chain.selectedAudioArtifactId)
  ) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_CHAIN_SCOPE_MISMATCH");
  }
  const { fingerprint, ...partial } = chain;
  if (!HASH_PATTERN.test(fingerprint) || chainFingerprint(partial) !== fingerprint) {
    throw new BookCreditMasterError("BOOK_CREDIT_MASTER_FINGERPRINT_INVALID");
  }
}

export function bookCreditMasterPublicView(
  chain: BookCreditMasterChain,
): BookCreditMasterPublicView {
  assertBookCreditMasterChain(chain);
  return Object.freeze({
    bookId: chain.bookId,
    creditKind: chain.creditKind,
    selectedTakeRecordId: chain.selectedTakeRecordId,
    creditMasterId: chain.creditMaster.payload.id,
    creditMasterRevision: chain.creditMaster.revision,
    format: chain.format,
    lossless: true,
    verificationStatus: chain.creditMaster.payload.verification.status,
    reviewStatus: chain.creditMaster.payload.review.status,
    eligibleForBookAssembly: true,
    createdAt: chain.createdAt,
    fingerprint: chain.fingerprint,
  });
}
