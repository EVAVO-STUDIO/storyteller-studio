import {
  assertAudioEngineeringEvidence,
  type AudioEngineeringEvidence,
} from "./audio-engineering.js";
import {
  assertBookCreditMasterChain,
  type BookCreditMasterChain,
} from "./book-credit-master.js";
import {
  assertBookCreditTakeReviewSession,
  type BookCreditTakeReviewSession,
} from "./book-credit-take-review.js";
import { stableHash } from "./index.js";
import type { MasteringOutputProfile } from "./mastering-plan.js";

export const BOOK_CREDIT_DELIVERY_SCHEMA_VERSION =
  "storyteller-book-credit-delivery-v1" as const;

export interface BookCreditDeliverySnapshot {
  schemaVersion: typeof BOOK_CREDIT_DELIVERY_SCHEMA_VERSION;
  projectId: string;
  bookId: string;
  creditKind: "opening" | "closing";
  chainFingerprint: string;
  reviewSessionFingerprint: string;
  reviewApprovalFingerprint: string;
  selectedTakeRecordId: string;
  creditMaster: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
    contentHash: string;
    byteCount: number;
  }>;
  durationMs: number;
  engineeringProfileId: string;
  engineeringProfileVersion: string;
  engineeringProfileFingerprint: string;
  output: MasteringOutputProfile;
  rightsFingerprint: string;
  status: "ready-for-book-assembly";
  createdAt: string;
  fingerprint: string;
}

export interface BookCreditDeliveryPublicView {
  bookId: string;
  creditKind: "opening" | "closing";
  durationMs: number;
  engineeringProfileId: string;
  engineeringProfileVersion: string;
  output: MasteringOutputProfile;
  status: "ready-for-book-assembly";
  createdAt: string;
  fingerprint: string;
}

export class BookCreditDeliveryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "BookCreditDeliveryError";
    this.code = code;
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_DURATION_MS = 60 * 60 * 1_000;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new BookCreditDeliveryError(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new BookCreditDeliveryError(code);
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new BookCreditDeliveryError(code);
  }
  return value;
}

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new BookCreditDeliveryError(code);
  }
  return value;
}

function bitDepthFromEvidence(evidence: AudioEngineeringEvidence): 16 | 24 | 32 {
  const codec = evidence.probe.codecName.toLocaleLowerCase("en-AU");
  if (/^pcm_[su]16(?:le|be)$/u.test(codec)) return 16;
  if (/^pcm_[su]24(?:le|be)$/u.test(codec)) return 24;
  if (/^pcm_(?:[su]32|f32)(?:le|be)$/u.test(codec)) return 32;
  throw new BookCreditDeliveryError("BOOK_CREDIT_DELIVERY_BIT_DEPTH_UNSUPPORTED");
}

function assertCurrentRights(
  chain: BookCreditMasterChain,
  now: Date,
): void {
  const rights = chain.creditMaster.payload.rights;
  requireIdentifier(
    rights.rightsEvidenceId,
    "BOOK_CREDIT_DELIVERY_RIGHTS_ID_INVALID",
  );
  requireHash(
    rights.rightsFingerprint,
    "BOOK_CREDIT_DELIVERY_RIGHTS_HASH_INVALID",
  );
  if (!rights.allowedUses.includes("audiobook")) {
    throw new BookCreditDeliveryError(
      "BOOK_CREDIT_DELIVERY_AUDIOBOOK_RIGHTS_REQUIRED",
    );
  }
  if (!rights.commercialUseApproved) {
    throw new BookCreditDeliveryError(
      "BOOK_CREDIT_DELIVERY_COMMERCIAL_RIGHTS_REQUIRED",
    );
  }
  if (rights.expiresAt && Date.parse(rights.expiresAt) <= now.getTime()) {
    throw new BookCreditDeliveryError("BOOK_CREDIT_DELIVERY_RIGHTS_EXPIRED");
  }
  if (
    rights.deletionRequiredAt
    && Date.parse(rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new BookCreditDeliveryError("BOOK_CREDIT_DELIVERY_RETENTION_EXPIRED");
  }
}

function deliveryFingerprint(
  snapshot: Omit<BookCreditDeliverySnapshot, "fingerprint">,
): string {
  return stableHash(snapshot);
}

export function createBookCreditDeliverySnapshot(input: Readonly<{
  chain: BookCreditMasterChain;
  reviewSession: BookCreditTakeReviewSession;
  now?: Date;
}>): BookCreditDeliverySnapshot {
  assertBookCreditMasterChain(input.chain);
  assertBookCreditTakeReviewSession(input.reviewSession);
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new BookCreditDeliveryError("BOOK_CREDIT_DELIVERY_DATE_INVALID");
  }
  const session = input.reviewSession;
  if (
    session.status !== "approved"
    || !session.selection
    || !session.approval
  ) {
    throw new BookCreditDeliveryError(
      "BOOK_CREDIT_DELIVERY_APPROVED_REVIEW_REQUIRED",
    );
  }
  const selected = session.candidates.find(
    (candidate) => candidate.take.id === session.selection!.candidateTakeId,
  );
  if (!selected) {
    throw new BookCreditDeliveryError(
      "BOOK_CREDIT_DELIVERY_SELECTED_TAKE_MISSING",
    );
  }
  assertAudioEngineeringEvidence(selected.engineeringEvidence);
  if (
    input.chain.sessionId !== session.id
    || input.chain.sessionRevision !== session.revision
    || input.chain.sessionFingerprint !== session.fingerprint
    || input.chain.bookId !== session.bookId
    || input.chain.creditKind !== session.creditKind
    || input.chain.selectedTakeRecordId !== selected.take.id
    || input.chain.selectedAudioArtifactId !== selected.take.audio.id
  ) {
    throw new BookCreditDeliveryError("BOOK_CREDIT_DELIVERY_REVIEW_SCOPE_MISMATCH");
  }
  if (
    selected.take.status !== "eligible-for-review"
    || !selected.take.eligibleForReview
    || !selected.engineeringEvidence.eligible
    || selected.engineeringEvidence.findings.some(
      (finding) => finding.severity === "error",
    )
  ) {
    throw new BookCreditDeliveryError(
      "BOOK_CREDIT_DELIVERY_ENGINEERING_INELIGIBLE",
    );
  }
  const observedDurationMs = Math.round(
    selected.engineeringEvidence.probe.durationSeconds * 1_000,
  );
  if (selected.durationMs !== observedDurationMs) {
    throw new BookCreditDeliveryError(
      "BOOK_CREDIT_DELIVERY_DURATION_EVIDENCE_MISMATCH",
    );
  }
  const master = input.chain.creditMaster.payload;
  if (
    master.kind !== "credit-master"
    || master.verification.status !== "verified"
    || master.review.status !== "approved"
    || master.quarantine
    || master.release.status !== "unavailable"
    || master.integrity.contentHash !== input.chain.contentHash
    || master.integrity.byteCount !== input.chain.byteCount
    || master.integrity.format !== input.chain.format
    || input.chain.lossless !== true
    || input.chain.eligibleForBookAssembly !== true
  ) {
    throw new BookCreditDeliveryError(
      "BOOK_CREDIT_DELIVERY_MASTER_STATE_INVALID",
    );
  }
  if (
    input.chain.format !== "wav"
    || master.integrity.mimeType !== "audio/wav"
  ) {
    throw new BookCreditDeliveryError(
      "BOOK_CREDIT_DELIVERY_WAV_MASTER_REQUIRED",
    );
  }
  const output: MasteringOutputProfile = Object.freeze({
    format: "wav",
    sampleRateHz: requireInteger(
      selected.engineeringEvidence.metrics.sampleRateHz,
      8_000,
      384_000,
      "BOOK_CREDIT_DELIVERY_SAMPLE_RATE_INVALID",
    ),
    channels: requireInteger(
      selected.engineeringEvidence.metrics.channels,
      1,
      2,
      "BOOK_CREDIT_DELIVERY_CHANNELS_INVALID",
    ) as 1 | 2,
    bitDepth: bitDepthFromEvidence(selected.engineeringEvidence),
  });
  assertCurrentRights(input.chain, now);
  const createdAt = requireDate(
    input.chain.createdAt,
    "BOOK_CREDIT_DELIVERY_CREATED_AT_INVALID",
  );
  if (
    Date.parse(createdAt) < Date.parse(session.updatedAt)
    || Date.parse(createdAt) > now.getTime()
  ) {
    throw new BookCreditDeliveryError(
      "BOOK_CREDIT_DELIVERY_CHRONOLOGY_INVALID",
    );
  }
  const partial: Omit<BookCreditDeliverySnapshot, "fingerprint"> = {
    schemaVersion: BOOK_CREDIT_DELIVERY_SCHEMA_VERSION,
    projectId: master.projectId,
    bookId: input.chain.bookId,
    creditKind: input.chain.creditKind,
    chainFingerprint: input.chain.fingerprint,
    reviewSessionFingerprint: session.fingerprint,
    reviewApprovalFingerprint: session.approval.fingerprint,
    selectedTakeRecordId: selected.take.id,
    creditMaster: Object.freeze({
      id: master.id,
      revision: input.chain.creditMaster.revision,
      fingerprint: master.fingerprint,
      contentHash: master.integrity.contentHash,
      byteCount: master.integrity.byteCount,
    }),
    durationMs: requireInteger(
      selected.durationMs,
      1,
      MAX_DURATION_MS,
      "BOOK_CREDIT_DELIVERY_DURATION_INVALID",
    ),
    engineeringProfileId: requireIdentifier(
      selected.engineeringEvidence.profile.profile.id,
      "BOOK_CREDIT_DELIVERY_PROFILE_ID_INVALID",
    ),
    engineeringProfileVersion: selected.engineeringEvidence.profile.externalVersion,
    engineeringProfileFingerprint: selected.engineeringEvidence.profile.fingerprint,
    output,
    rightsFingerprint: master.rights.rightsFingerprint,
    status: "ready-for-book-assembly",
    createdAt,
  };
  const snapshot = Object.freeze({
    ...partial,
    fingerprint: deliveryFingerprint(partial),
  });
  assertBookCreditDeliverySnapshot(snapshot);
  return snapshot;
}

export function assertBookCreditDeliverySnapshot(
  snapshot: BookCreditDeliverySnapshot,
): void {
  if (snapshot.schemaVersion !== BOOK_CREDIT_DELIVERY_SCHEMA_VERSION) {
    throw new BookCreditDeliveryError(
      "BOOK_CREDIT_DELIVERY_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [snapshot.projectId, "BOOK_CREDIT_DELIVERY_PROJECT_ID_INVALID"],
    [snapshot.bookId, "BOOK_CREDIT_DELIVERY_BOOK_ID_INVALID"],
    [snapshot.selectedTakeRecordId, "BOOK_CREDIT_DELIVERY_TAKE_ID_INVALID"],
    [snapshot.creditMaster.id, "BOOK_CREDIT_DELIVERY_MASTER_ID_INVALID"],
    [snapshot.engineeringProfileId, "BOOK_CREDIT_DELIVERY_PROFILE_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  if (snapshot.creditKind !== "opening" && snapshot.creditKind !== "closing") {
    throw new BookCreditDeliveryError("BOOK_CREDIT_DELIVERY_KIND_INVALID");
  }
  for (const [value, code] of [
    [snapshot.chainFingerprint, "BOOK_CREDIT_DELIVERY_CHAIN_HASH_INVALID"],
    [snapshot.reviewSessionFingerprint, "BOOK_CREDIT_DELIVERY_REVIEW_HASH_INVALID"],
    [snapshot.reviewApprovalFingerprint, "BOOK_CREDIT_DELIVERY_APPROVAL_HASH_INVALID"],
    [snapshot.creditMaster.fingerprint, "BOOK_CREDIT_DELIVERY_MASTER_HASH_INVALID"],
    [snapshot.creditMaster.contentHash, "BOOK_CREDIT_DELIVERY_CONTENT_HASH_INVALID"],
    [snapshot.engineeringProfileFingerprint, "BOOK_CREDIT_DELIVERY_PROFILE_HASH_INVALID"],
    [snapshot.rightsFingerprint, "BOOK_CREDIT_DELIVERY_RIGHTS_HASH_INVALID"],
  ] as const) requireHash(value, code);
  requireInteger(
    snapshot.creditMaster.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "BOOK_CREDIT_DELIVERY_MASTER_REVISION_INVALID",
  );
  requireInteger(
    snapshot.creditMaster.byteCount,
    1,
    Number.MAX_SAFE_INTEGER,
    "BOOK_CREDIT_DELIVERY_MASTER_SIZE_INVALID",
  );
  requireInteger(
    snapshot.durationMs,
    1,
    MAX_DURATION_MS,
    "BOOK_CREDIT_DELIVERY_DURATION_INVALID",
  );
  if (!SAFE_VERSION.test(snapshot.engineeringProfileVersion)) {
    throw new BookCreditDeliveryError(
      "BOOK_CREDIT_DELIVERY_PROFILE_VERSION_INVALID",
    );
  }
  if (
    snapshot.output.format !== "wav"
    || !Number.isSafeInteger(snapshot.output.sampleRateHz)
    || snapshot.output.sampleRateHz < 8_000
    || snapshot.output.sampleRateHz > 384_000
    || ![1, 2].includes(snapshot.output.channels)
    || ![16, 24, 32].includes(snapshot.output.bitDepth)
  ) {
    throw new BookCreditDeliveryError(
      "BOOK_CREDIT_DELIVERY_OUTPUT_PROFILE_INVALID",
    );
  }
  if (snapshot.status !== "ready-for-book-assembly") {
    throw new BookCreditDeliveryError("BOOK_CREDIT_DELIVERY_STATUS_INVALID");
  }
  requireDate(snapshot.createdAt, "BOOK_CREDIT_DELIVERY_CREATED_AT_INVALID");
  const { fingerprint, ...partial } = snapshot;
  if (!HASH_PATTERN.test(fingerprint) || deliveryFingerprint(partial) !== fingerprint) {
    throw new BookCreditDeliveryError(
      "BOOK_CREDIT_DELIVERY_FINGERPRINT_INVALID",
    );
  }
}

export function bookCreditDeliveryPublicView(
  snapshot: BookCreditDeliverySnapshot,
): BookCreditDeliveryPublicView {
  assertBookCreditDeliverySnapshot(snapshot);
  return Object.freeze({
    bookId: snapshot.bookId,
    creditKind: snapshot.creditKind,
    durationMs: snapshot.durationMs,
    engineeringProfileId: snapshot.engineeringProfileId,
    engineeringProfileVersion: snapshot.engineeringProfileVersion,
    output: snapshot.output,
    status: snapshot.status,
    createdAt: snapshot.createdAt,
    fingerprint: snapshot.fingerprint,
  });
}
