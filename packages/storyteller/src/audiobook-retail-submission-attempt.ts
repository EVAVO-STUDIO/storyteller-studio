import {
  assertAudiobookRetailDeliveryAttempt,
  type AudiobookRetailDeliveryAttempt,
} from "./audiobook-retail-delivery-attempt.js";
import {
  assertAudiobookRetailDistributorAccountEvidence,
  type AudiobookRetailDistributorAccountEvidence,
} from "./audiobook-retail-release-decision.js";
import {
  assertAudiobookRetailSubmissionDecision,
  type AudiobookRetailSubmissionDecision,
} from "./audiobook-retail-submission-decision.js";
import {
  assertAudiobookRetailSubmissionReviewSession,
  type AudiobookRetailSubmissionReviewSession,
} from "./audiobook-retail-submission-review.js";
import { stableHash } from "./index.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";

export const AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_SCHEMA_VERSION =
  "storyteller-audiobook-retail-submission-attempt-v1" as const;
export const AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_ENTITY_TYPE =
  "audiobook-retail-submission-attempt" as const;

export type AudiobookRetailSubmissionAttemptStatus =
  | "in-progress"
  | "submitted-awaiting-retailer-review"
  | "submission-failed"
  | "cancelled";

export interface AudiobookRetailSubmissionReceipt {
  submissionReceiptHash: string;
  retailerSubmissionReferenceHash: string;
  remoteDraftReferenceHash: string;
  mediaFileCountAcknowledged: number;
  allApprovedFilesIncluded: true;
  submissionAcceptedForProcessing: true;
  submissionInitiated: true;
  retailerAcceptanceClaimed: false;
  listingPublished: false;
  completedByActorId: string;
  completedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailSubmissionFailure {
  failureCode: string;
  failedByActorId: string;
  failedAt: string;
  retryPermittedUnderDecision: false;
  fingerprint: string;
}

export interface AudiobookRetailSubmissionCancellation {
  reasonCode: string;
  cancelledByActorId: string;
  cancelledAt: string;
  retryPermittedUnderDecision: false;
  fingerprint: string;
}

export interface AudiobookRetailSubmissionAttempt {
  schemaVersion: typeof AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  packageId: string;
  distributor: "acx-audible";
  submissionDecision: Readonly<{
    id: string;
    revision: 1;
    fingerprint: string;
    validUntil: string;
  }>;
  submissionReview: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
  }>;
  deliveryAttempt: Readonly<{
    id: string;
    revision: 2;
    fingerprint: string;
    remoteDraftReferenceHash: string;
  }>;
  distributorAccount: Readonly<{
    evidenceId: string;
    evidenceFingerprint: string;
    accessExpiresAt: string;
  }>;
  package: Readonly<{
    mediaFileCount: number;
    totalPackageBytes: number;
    fileSetFingerprint: string;
  }>;
  submissionMethod: "manual-acx-submit";
  attemptOrdinal: 1;
  operatorId: string;
  humanOperationConfirmed: true;
  startedAt: string;
  status: AudiobookRetailSubmissionAttemptStatus;
  receipt?: AudiobookRetailSubmissionReceipt;
  failure?: AudiobookRetailSubmissionFailure;
  cancellation?: AudiobookRetailSubmissionCancellation;
  revision: number;
  previousFingerprint?: string;
  updatedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailSubmissionAttemptPublicView {
  id: string;
  bookId: string;
  distributor: "acx-audible";
  mediaFileCount: number;
  totalPackageBytes: number;
  submissionMethod: "manual-acx-submit";
  attemptOrdinal: 1;
  status: AudiobookRetailSubmissionAttemptStatus;
  receiptRecorded: boolean;
  failureCode?: string;
  cancellationReasonCode?: string;
  startedAt: string;
  updatedAt: string;
  revision: number;
  fingerprint: string;
}

export interface StartAudiobookRetailSubmissionAttemptInput {
  submissionDecision: AudiobookRetailSubmissionDecision;
  submissionReview: AudiobookRetailSubmissionReviewSession;
  deliveryAttempt: AudiobookRetailDeliveryAttempt;
  distributorAccount: AudiobookRetailDistributorAccountEvidence;
  operatorId: string;
  humanOperationConfirmed: true;
  startedAt?: Date;
}

export class AudiobookRetailSubmissionAttemptError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailSubmissionAttemptError";
    this.code = code;
  }
}

export class AudiobookRetailSubmissionAttemptStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudiobookRetailSubmissionAttemptStoreConflictError";
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;
const HUMAN_BLOCKLIST = /^(?:system|worker|automation|automated|bot)(?:[_-]|$)/iu;
const MAXIMUM_FILES = 2_003;
const MAXIMUM_PACKAGE_BYTES = 16 * 1024 * 1024 * 1024 + 32 * 1024 * 1024;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailSubmissionAttemptError(code);
  }
  return value;
}

function requireHumanActor(value: string, code: string): string {
  requireIdentifier(value, code);
  if (HUMAN_BLOCKLIST.test(value)) {
    throw new AudiobookRetailSubmissionAttemptError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailSubmissionAttemptError(code);
  }
  return value;
}

function requireCode(value: string, code: string): string {
  if (!SAFE_CODE.test(value)) {
    throw new AudiobookRetailSubmissionAttemptError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailSubmissionAttemptError(code);
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
    throw new AudiobookRetailSubmissionAttemptError(code);
  }
  return value;
}

function attemptFingerprint(
  value: Omit<AudiobookRetailSubmissionAttempt, "fingerprint">,
): string {
  return stableHash(value);
}

function receiptFingerprint(
  value: Omit<AudiobookRetailSubmissionReceipt, "fingerprint">,
): string {
  return stableHash(value);
}

function failureFingerprint(
  value: Omit<AudiobookRetailSubmissionFailure, "fingerprint">,
): string {
  return stableHash(value);
}

function cancellationFingerprint(
  value: Omit<AudiobookRetailSubmissionCancellation, "fingerprint">,
): string {
  return stableHash(value);
}

function assertSourceScope(
  input: StartAudiobookRetailSubmissionAttemptInput,
  startedAt: Date,
): void {
  assertAudiobookRetailSubmissionDecision(input.submissionDecision);
  assertAudiobookRetailSubmissionReviewSession(input.submissionReview);
  assertAudiobookRetailDeliveryAttempt(input.deliveryAttempt);
  assertAudiobookRetailDistributorAccountEvidence(
    input.distributorAccount,
    startedAt,
  );
  const decision = input.submissionDecision;
  const review = input.submissionReview;
  const delivery = input.deliveryAttempt;
  if (
    decision.status !== "authorized-for-single-submission"
    || decision.maximumSubmissionAttempts !== 1
    || decision.submissionMethod !== "manual-acx-submit"
    || startedAt.getTime() < Date.parse(decision.decidedAt)
    || startedAt.getTime() >= Date.parse(decision.validUntil)
  ) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_DECISION_NOT_CURRENT",
    );
  }
  if (
    review.status !== "approved-for-submission-decision"
    || !review.approval
    || review.approval.submissionDecisionEligible !== true
    || delivery.status !== "files-transferred-awaiting-submission-review"
    || !delivery.receipt
    || delivery.receipt.submissionInitiated !== false
    || delivery.receipt.retailerAcceptanceClaimed !== false
  ) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_APPROVED_REVIEW_REQUIRED",
    );
  }
  if (
    decision.projectId !== review.projectId
    || decision.projectId !== delivery.projectId
    || decision.projectId !== input.distributorAccount.projectId
    || decision.bookId !== review.bookId
    || decision.bookId !== delivery.bookId
    || decision.bookId !== input.distributorAccount.bookId
    || decision.packageId !== review.packageId
    || decision.packageId !== delivery.packageId
    || decision.submissionReview.id !== review.id
    || decision.submissionReview.revision !== review.revision
    || decision.submissionReview.fingerprint !== review.fingerprint
    || decision.submissionReview.approvalFingerprint
      !== review.approval.fingerprint
    || decision.deliveryAttempt.id !== delivery.id
    || decision.deliveryAttempt.fingerprint !== delivery.fingerprint
    || decision.deliveryAttempt.remoteDraftReferenceHash
      !== delivery.receipt.remoteDraftReferenceHash
    || decision.distributorAccount.evidenceId !== input.distributorAccount.id
    || decision.distributorAccount.evidenceFingerprint
      !== input.distributorAccount.fingerprint
    || decision.distributorAccount.accessExpiresAt
      !== input.distributorAccount.expiresAt
  ) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_SOURCE_MISMATCH",
    );
  }
  if (
    decision.package.mediaFileCount !== review.mediaFileCount
    || decision.package.totalPackageBytes !== review.totalPackageBytes
    || decision.package.fileSetFingerprint !== review.fileSetFingerprint
    || decision.package.fileSetFingerprint !== delivery.package.fileSetFingerprint
    || decision.package.mediaFileCount !== delivery.package.mediaFileCount
    || decision.package.totalPackageBytes !== delivery.package.totalPackageBytes
  ) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_FILE_SET_MISMATCH",
    );
  }
}

function sourceSnapshot(
  input: StartAudiobookRetailSubmissionAttemptInput,
): Pick<
  AudiobookRetailSubmissionAttempt,
  | "projectId"
  | "bookId"
  | "packageId"
  | "distributor"
  | "submissionDecision"
  | "submissionReview"
  | "deliveryAttempt"
  | "distributorAccount"
  | "package"
  | "submissionMethod"
  | "attemptOrdinal"
> {
  return {
    projectId: input.submissionDecision.projectId,
    bookId: input.submissionDecision.bookId,
    packageId: input.submissionDecision.packageId,
    distributor: "acx-audible",
    submissionDecision: Object.freeze({
      id: input.submissionDecision.id,
      revision: 1,
      fingerprint: input.submissionDecision.fingerprint,
      validUntil: input.submissionDecision.validUntil,
    }),
    submissionReview: Object.freeze({
      id: input.submissionReview.id,
      revision: input.submissionReview.revision,
      fingerprint: input.submissionReview.fingerprint,
    }),
    deliveryAttempt: Object.freeze({
      id: input.deliveryAttempt.id,
      revision: 2,
      fingerprint: input.deliveryAttempt.fingerprint,
      remoteDraftReferenceHash:
        input.deliveryAttempt.receipt!.remoteDraftReferenceHash,
    }),
    distributorAccount: Object.freeze({
      evidenceId: input.distributorAccount.id,
      evidenceFingerprint: input.distributorAccount.fingerprint,
      accessExpiresAt: input.distributorAccount.expiresAt,
    }),
    package: Object.freeze({
      mediaFileCount: input.submissionDecision.package.mediaFileCount,
      totalPackageBytes: input.submissionDecision.package.totalPackageBytes,
      fileSetFingerprint: input.submissionDecision.package.fileSetFingerprint,
    }),
    submissionMethod: "manual-acx-submit",
    attemptOrdinal: 1,
  };
}

export function startAudiobookRetailSubmissionAttempt(
  input: StartAudiobookRetailSubmissionAttemptInput,
): AudiobookRetailSubmissionAttempt {
  const startedAt = input.startedAt ?? new Date();
  if (Number.isNaN(startedAt.getTime())) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_DATE_INVALID",
    );
  }
  if (input.humanOperationConfirmed !== true) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_HUMAN_OPERATION_REQUIRED",
    );
  }
  const operatorId = requireHumanActor(
    input.operatorId,
    "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_OPERATOR_INVALID",
  );
  assertSourceScope(input, startedAt);
  const sources = sourceSnapshot(input);
  const derivedId = `retail_submission_attempt_${stableHash({
    submissionDecision: input.submissionDecision.fingerprint,
    attemptOrdinal: 1,
  }).slice(0, 24)}`;
  const partial: Omit<AudiobookRetailSubmissionAttempt, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_SCHEMA_VERSION,
    id: derivedId,
    ...sources,
    operatorId,
    humanOperationConfirmed: true,
    startedAt: startedAt.toISOString(),
    status: "in-progress",
    revision: 1,
    updatedAt: startedAt.toISOString(),
  };
  const attempt = Object.freeze({
    ...partial,
    fingerprint: attemptFingerprint(partial),
  });
  assertAudiobookRetailSubmissionAttempt(attempt);
  assertAudiobookRetailSubmissionAttemptMatchesSources(attempt, input);
  return attempt;
}

function reviseAttempt(
  attempt: AudiobookRetailSubmissionAttempt,
  updates: Partial<Pick<
    AudiobookRetailSubmissionAttempt,
    "status" | "receipt" | "failure" | "cancellation"
  >>,
  at: Date,
): AudiobookRetailSubmissionAttempt {
  assertAudiobookRetailSubmissionAttempt(attempt);
  if (attempt.status !== "in-progress") {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_TERMINAL_IMMUTABLE",
    );
  }
  if (
    Number.isNaN(at.getTime())
    || at.getTime() < Date.parse(attempt.updatedAt)
    || at.getTime() > Date.parse(attempt.submissionDecision.validUntil)
  ) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_DATE_INVALID",
    );
  }
  const {
    fingerprint: _fingerprint,
    previousFingerprint: _previous,
    ...base
  } = attempt;
  const partial: Omit<AudiobookRetailSubmissionAttempt, "fingerprint"> = {
    ...base,
    ...updates,
    revision: attempt.revision + 1,
    previousFingerprint: attempt.fingerprint,
    updatedAt: at.toISOString(),
  };
  const next = Object.freeze({
    ...partial,
    fingerprint: attemptFingerprint(partial),
  });
  assertAudiobookRetailSubmissionAttempt(next);
  return next;
}

export function recordAudiobookRetailSubmissionReceipt(
  attempt: AudiobookRetailSubmissionAttempt,
  input: Readonly<{
    submissionReceiptHash: string;
    retailerSubmissionReferenceHash: string;
    mediaFileCountAcknowledged: number;
    allApprovedFilesIncluded: true;
    submissionAcceptedForProcessing: true;
    submissionInitiated: true;
    retailerAcceptanceClaimed: false;
    listingPublished: false;
    completedByActorId: string;
    humanConfirmation: true;
    completedAt?: Date;
  }>,
): AudiobookRetailSubmissionAttempt {
  if (input.humanConfirmation !== true) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_HUMAN_CONFIRMATION_REQUIRED",
    );
  }
  if (
    input.allApprovedFilesIncluded !== true
    || input.submissionAcceptedForProcessing !== true
    || input.submissionInitiated !== true
    || input.retailerAcceptanceClaimed !== false
    || input.listingPublished !== false
  ) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_RECEIPT_ATTESTATION_INVALID",
    );
  }
  const mediaFileCountAcknowledged = requireInteger(
    input.mediaFileCountAcknowledged,
    1,
    MAXIMUM_FILES,
    "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_FILE_COUNT_INVALID",
  );
  if (mediaFileCountAcknowledged !== attempt.package.mediaFileCount) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_FILE_COUNT_MISMATCH",
    );
  }
  const completedAt = input.completedAt ?? new Date();
  const receiptBase: Omit<AudiobookRetailSubmissionReceipt, "fingerprint"> = {
    submissionReceiptHash: requireHash(
      input.submissionReceiptHash,
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_RECEIPT_HASH_INVALID",
    ),
    retailerSubmissionReferenceHash: requireHash(
      input.retailerSubmissionReferenceHash,
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_RETAILER_REFERENCE_HASH_INVALID",
    ),
    remoteDraftReferenceHash: attempt.deliveryAttempt.remoteDraftReferenceHash,
    mediaFileCountAcknowledged,
    allApprovedFilesIncluded: true,
    submissionAcceptedForProcessing: true,
    submissionInitiated: true,
    retailerAcceptanceClaimed: false,
    listingPublished: false,
    completedByActorId: requireHumanActor(
      input.completedByActorId,
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_COMPLETER_INVALID",
    ),
    completedAt: completedAt.toISOString(),
  };
  const receipt = Object.freeze({
    ...receiptBase,
    fingerprint: receiptFingerprint(receiptBase),
  });
  return reviseAttempt(
    attempt,
    { status: "submitted-awaiting-retailer-review", receipt },
    completedAt,
  );
}

export function recordAudiobookRetailSubmissionFailure(
  attempt: AudiobookRetailSubmissionAttempt,
  input: Readonly<{
    failureCode: string;
    failedByActorId: string;
    humanConfirmation: true;
    failedAt?: Date;
  }>,
): AudiobookRetailSubmissionAttempt {
  if (input.humanConfirmation !== true) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_HUMAN_CONFIRMATION_REQUIRED",
    );
  }
  const failedAt = input.failedAt ?? new Date();
  const failureBase: Omit<AudiobookRetailSubmissionFailure, "fingerprint"> = {
    failureCode: requireCode(
      input.failureCode,
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_FAILURE_CODE_INVALID",
    ),
    failedByActorId: requireHumanActor(
      input.failedByActorId,
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_FAILURE_ACTOR_INVALID",
    ),
    failedAt: failedAt.toISOString(),
    retryPermittedUnderDecision: false,
  };
  const failure = Object.freeze({
    ...failureBase,
    fingerprint: failureFingerprint(failureBase),
  });
  return reviseAttempt(
    attempt,
    { status: "submission-failed", failure },
    failedAt,
  );
}

export function cancelAudiobookRetailSubmissionAttempt(
  attempt: AudiobookRetailSubmissionAttempt,
  input: Readonly<{
    reasonCode: string;
    cancelledByActorId: string;
    humanConfirmation: true;
    cancelledAt?: Date;
  }>,
): AudiobookRetailSubmissionAttempt {
  if (input.humanConfirmation !== true) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_HUMAN_CONFIRMATION_REQUIRED",
    );
  }
  const cancelledAt = input.cancelledAt ?? new Date();
  const cancellationBase: Omit<AudiobookRetailSubmissionCancellation, "fingerprint"> = {
    reasonCode: requireCode(
      input.reasonCode,
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_CANCELLATION_CODE_INVALID",
    ),
    cancelledByActorId: requireHumanActor(
      input.cancelledByActorId,
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_CANCELLATION_ACTOR_INVALID",
    ),
    cancelledAt: cancelledAt.toISOString(),
    retryPermittedUnderDecision: false,
  };
  const cancellation = Object.freeze({
    ...cancellationBase,
    fingerprint: cancellationFingerprint(cancellationBase),
  });
  return reviseAttempt(
    attempt,
    { status: "cancelled", cancellation },
    cancelledAt,
  );
}

function assertReceipt(
  receipt: AudiobookRetailSubmissionReceipt,
  attempt: AudiobookRetailSubmissionAttempt,
): void {
  for (const [value, code] of [
    [receipt.submissionReceiptHash, "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_RECEIPT_HASH_INVALID"],
    [receipt.retailerSubmissionReferenceHash, "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_RETAILER_REFERENCE_HASH_INVALID"],
    [receipt.remoteDraftReferenceHash, "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_REMOTE_DRAFT_HASH_INVALID"],
  ] as const) requireHash(value, code);
  if (
    receipt.remoteDraftReferenceHash !== attempt.deliveryAttempt.remoteDraftReferenceHash
    || receipt.mediaFileCountAcknowledged !== attempt.package.mediaFileCount
    || receipt.allApprovedFilesIncluded !== true
    || receipt.submissionAcceptedForProcessing !== true
    || receipt.submissionInitiated !== true
    || receipt.retailerAcceptanceClaimed !== false
    || receipt.listingPublished !== false
  ) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_RECEIPT_STATE_INVALID",
    );
  }
  requireHumanActor(
    receipt.completedByActorId,
    "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_COMPLETER_INVALID",
  );
  requireDate(
    receipt.completedAt,
    "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_DATE_INVALID",
  );
  const { fingerprint, ...partial } = receipt;
  if (receiptFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_RECEIPT_FINGERPRINT_INVALID",
    );
  }
}

function assertFailure(failure: AudiobookRetailSubmissionFailure): void {
  requireCode(
    failure.failureCode,
    "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_FAILURE_CODE_INVALID",
  );
  requireHumanActor(
    failure.failedByActorId,
    "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_FAILURE_ACTOR_INVALID",
  );
  requireDate(
    failure.failedAt,
    "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_DATE_INVALID",
  );
  if (failure.retryPermittedUnderDecision !== false) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_RETRY_STATE_INVALID",
    );
  }
  const { fingerprint, ...partial } = failure;
  if (failureFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_FAILURE_FINGERPRINT_INVALID",
    );
  }
}

function assertCancellation(
  cancellation: AudiobookRetailSubmissionCancellation,
): void {
  requireCode(
    cancellation.reasonCode,
    "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_CANCELLATION_CODE_INVALID",
  );
  requireHumanActor(
    cancellation.cancelledByActorId,
    "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_CANCELLATION_ACTOR_INVALID",
  );
  requireDate(
    cancellation.cancelledAt,
    "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_DATE_INVALID",
  );
  if (cancellation.retryPermittedUnderDecision !== false) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_RETRY_STATE_INVALID",
    );
  }
  const { fingerprint, ...partial } = cancellation;
  if (cancellationFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_CANCELLATION_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailSubmissionAttempt(
  attempt: AudiobookRetailSubmissionAttempt,
): void {
  if (
    attempt.schemaVersion !== AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [attempt.id, "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_ID_INVALID"],
    [attempt.projectId, "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_PROJECT_ID_INVALID"],
    [attempt.bookId, "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_BOOK_ID_INVALID"],
    [attempt.packageId, "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_PACKAGE_ID_INVALID"],
    [attempt.submissionDecision.id, "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_DECISION_ID_INVALID"],
    [attempt.submissionReview.id, "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_REVIEW_ID_INVALID"],
    [attempt.deliveryAttempt.id, "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_DELIVERY_ID_INVALID"],
    [attempt.distributorAccount.evidenceId, "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_ACCOUNT_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  requireHumanActor(
    attempt.operatorId,
    "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_OPERATOR_INVALID",
  );
  for (const [value, code] of [
    [attempt.submissionDecision.fingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_DECISION_HASH_INVALID"],
    [attempt.submissionReview.fingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_REVIEW_HASH_INVALID"],
    [attempt.deliveryAttempt.fingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_DELIVERY_HASH_INVALID"],
    [attempt.deliveryAttempt.remoteDraftReferenceHash, "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_REMOTE_DRAFT_HASH_INVALID"],
    [attempt.distributorAccount.evidenceFingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_ACCOUNT_HASH_INVALID"],
    [attempt.package.fileSetFingerprint, "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_FILE_SET_HASH_INVALID"],
  ] as const) requireHash(value, code);
  requireInteger(
    attempt.submissionReview.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_REVIEW_REVISION_INVALID",
  );
  if (
    attempt.submissionDecision.revision !== 1
    || attempt.deliveryAttempt.revision !== 2
  ) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_SOURCE_REVISION_INVALID",
    );
  }
  requireInteger(
    attempt.package.mediaFileCount,
    4,
    MAXIMUM_FILES,
    "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_FILE_COUNT_INVALID",
  );
  requireInteger(
    attempt.package.totalPackageBytes,
    1,
    MAXIMUM_PACKAGE_BYTES,
    "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_SIZE_INVALID",
  );
  for (const value of [
    attempt.submissionDecision.validUntil,
    attempt.distributorAccount.accessExpiresAt,
    attempt.startedAt,
    attempt.updatedAt,
  ]) requireDate(value, "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_DATE_INVALID");
  if (
    attempt.distributor !== "acx-audible"
    || attempt.submissionMethod !== "manual-acx-submit"
    || attempt.attemptOrdinal !== 1
    || attempt.humanOperationConfirmed !== true
    || Date.parse(attempt.startedAt) >= Date.parse(attempt.submissionDecision.validUntil)
    || Date.parse(attempt.updatedAt) < Date.parse(attempt.startedAt)
    || Date.parse(attempt.updatedAt) > Date.parse(attempt.submissionDecision.validUntil)
  ) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_STATE_INVALID",
    );
  }
  const statuses: ReadonlySet<AudiobookRetailSubmissionAttemptStatus> = new Set([
    "in-progress",
    "submitted-awaiting-retailer-review",
    "submission-failed",
    "cancelled",
  ]);
  if (!statuses.has(attempt.status)) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_STATUS_INVALID",
    );
  }
  if (attempt.status === "in-progress") {
    if (
      attempt.receipt !== undefined
      || attempt.failure !== undefined
      || attempt.cancellation !== undefined
      || attempt.revision !== 1
      || attempt.previousFingerprint !== undefined
      || attempt.updatedAt !== attempt.startedAt
    ) {
      throw new AudiobookRetailSubmissionAttemptError(
        "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_STATE_INVALID",
      );
    }
  } else {
    if (attempt.revision !== 2) {
      throw new AudiobookRetailSubmissionAttemptError(
        "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_REVISION_INVALID",
      );
    }
    requireHash(
      attempt.previousFingerprint ?? "",
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_REVISION_CHAIN_INVALID",
    );
    if (attempt.status === "submitted-awaiting-retailer-review") {
      if (!attempt.receipt || attempt.failure || attempt.cancellation) {
        throw new AudiobookRetailSubmissionAttemptError(
          "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_STATE_INVALID",
        );
      }
      assertReceipt(attempt.receipt, attempt);
      if (attempt.receipt.completedAt !== attempt.updatedAt) {
        throw new AudiobookRetailSubmissionAttemptError(
          "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_DATE_INVALID",
        );
      }
    } else if (attempt.status === "submission-failed") {
      if (!attempt.failure || attempt.receipt || attempt.cancellation) {
        throw new AudiobookRetailSubmissionAttemptError(
          "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_STATE_INVALID",
        );
      }
      assertFailure(attempt.failure);
      if (attempt.failure.failedAt !== attempt.updatedAt) {
        throw new AudiobookRetailSubmissionAttemptError(
          "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_DATE_INVALID",
        );
      }
    } else {
      if (!attempt.cancellation || attempt.receipt || attempt.failure) {
        throw new AudiobookRetailSubmissionAttemptError(
          "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_STATE_INVALID",
        );
      }
      assertCancellation(attempt.cancellation);
      if (attempt.cancellation.cancelledAt !== attempt.updatedAt) {
        throw new AudiobookRetailSubmissionAttemptError(
          "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_DATE_INVALID",
        );
      }
    }
  }
  const { fingerprint, ...partial } = attempt;
  if (attemptFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailSubmissionAttemptMatchesSources(
  attempt: AudiobookRetailSubmissionAttempt,
  input: StartAudiobookRetailSubmissionAttemptInput,
): void {
  assertAudiobookRetailSubmissionAttempt(attempt);
  assertSourceScope(input, new Date(attempt.startedAt));
  const expected = sourceSnapshot(input);
  if (
    attempt.projectId !== expected.projectId
    || attempt.bookId !== expected.bookId
    || attempt.packageId !== expected.packageId
    || stableHash(attempt.submissionDecision)
      !== stableHash(expected.submissionDecision)
    || stableHash(attempt.submissionReview)
      !== stableHash(expected.submissionReview)
    || stableHash(attempt.deliveryAttempt)
      !== stableHash(expected.deliveryAttempt)
    || stableHash(attempt.distributorAccount)
      !== stableHash(expected.distributorAccount)
    || stableHash(attempt.package) !== stableHash(expected.package)
    || attempt.submissionMethod !== expected.submissionMethod
    || attempt.attemptOrdinal !== expected.attemptOrdinal
    || attempt.operatorId !== input.operatorId
  ) {
    throw new AudiobookRetailSubmissionAttemptError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_SOURCE_MISMATCH",
    );
  }
}

export function audiobookRetailSubmissionAttemptPublicView(
  attempt: AudiobookRetailSubmissionAttempt,
): AudiobookRetailSubmissionAttemptPublicView {
  assertAudiobookRetailSubmissionAttempt(attempt);
  return Object.freeze({
    id: attempt.id,
    bookId: attempt.bookId,
    distributor: attempt.distributor,
    mediaFileCount: attempt.package.mediaFileCount,
    totalPackageBytes: attempt.package.totalPackageBytes,
    submissionMethod: attempt.submissionMethod,
    attemptOrdinal: 1,
    status: attempt.status,
    receiptRecorded: attempt.receipt !== undefined,
    ...(attempt.failure ? { failureCode: attempt.failure.failureCode } : {}),
    ...(attempt.cancellation
      ? { cancellationReasonCode: attempt.cancellation.reasonCode }
      : {}),
    startedAt: attempt.startedAt,
    updatedAt: attempt.updatedAt,
    revision: attempt.revision,
    fingerprint: attempt.fingerprint,
  });
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<AudiobookRetailSubmissionAttempt> {
  const attempt = envelope.payload as unknown as AudiobookRetailSubmissionAttempt;
  assertAudiobookRetailSubmissionAttempt(attempt);
  if (
    envelope.entityType !== AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_ENTITY_TYPE
    || envelope.entityId !== attempt.id
    || envelope.revision !== attempt.revision
  ) {
    throw new AudiobookRetailSubmissionAttemptStoreConflictError(
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<AudiobookRetailSubmissionAttempt>;
}

function payload(
  attempt: AudiobookRetailSubmissionAttempt,
): Record<string, unknown> {
  return attempt as unknown as Record<string, unknown>;
}

export class FileAudiobookRetailSubmissionAttemptStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    attempt: AudiobookRetailSubmissionAttempt,
    actorId: string,
  ): Promise<StoredEnvelope<AudiobookRetailSubmissionAttempt>> {
    assertAudiobookRetailSubmissionAttempt(attempt);
    requireIdentifier(
      actorId,
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_STORE_ACTOR_INVALID",
    );
    try {
      const existing = await this.read(attempt.id);
      if (existing) {
        if (existing.payload.fingerprint === attempt.fingerprint) return existing;
        throw new AudiobookRetailSubmissionAttemptStoreConflictError(
          "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_STORE_IDEMPOTENCY_CONFLICT",
        );
      }
      const envelope = toEnvelope(await this.#store.create(
        AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_ENTITY_TYPE,
        attempt.id,
        payload(attempt),
        new Date(attempt.startedAt),
      ));
      await this.#audit(
        actorId,
        "audiobook_retail_submission_attempt.created",
        envelope,
      );
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailSubmissionAttemptStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(
    attemptId: string,
  ): Promise<StoredEnvelope<AudiobookRetailSubmissionAttempt> | null> {
    requireIdentifier(
      attemptId,
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_STORE_ID_INVALID",
    );
    const envelope = await this.#store.read<Record<string, unknown>>(
      AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_ENTITY_TYPE,
      attemptId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(
    attemptId: string,
  ): Promise<StoredEnvelope<AudiobookRetailSubmissionAttempt>> {
    const envelope = await this.read(attemptId);
    if (!envelope) {
      throw new AudiobookRetailSubmissionAttemptStoreConflictError(
        "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }

  async save(
    attempt: AudiobookRetailSubmissionAttempt,
    input: Readonly<{
      expectedRevision: number;
      actorId: string;
      action: string;
    }>,
  ): Promise<StoredEnvelope<AudiobookRetailSubmissionAttempt>> {
    assertAudiobookRetailSubmissionAttempt(attempt);
    requireIdentifier(
      input.actorId,
      "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_STORE_ACTOR_INVALID",
    );
    if (
      !/^audiobook_retail_submission_attempt\.[a-z][a-z0-9._-]{1,80}$/u.test(
        input.action,
      )
    ) {
      throw new AudiobookRetailSubmissionAttemptStoreConflictError(
        "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_STORE_ACTION_INVALID",
      );
    }
    const current = await this.require(attempt.id);
    if (
      current.revision !== input.expectedRevision
      || attempt.revision !== current.payload.revision + 1
      || attempt.previousFingerprint !== current.payload.fingerprint
    ) {
      throw new AudiobookRetailSubmissionAttemptStoreConflictError(
        "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_STORE_REVISION_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.replace(
        AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_ENTITY_TYPE,
        attempt.id,
        input.expectedRevision,
        payload(attempt),
        new Date(attempt.updatedAt),
      ));
      await this.#audit(input.actorId, input.action, envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailSubmissionAttemptStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async #audit(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<AudiobookRetailSubmissionAttempt>,
  ): Promise<void> {
    const attempt = envelope.payload;
    await this.#store.appendAuditEvent({
      actorId,
      action,
      entityType: AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_ENTITY_TYPE,
      entityId: envelope.entityId,
      revision: envelope.revision,
      occurredAt: new Date(envelope.savedAt),
      metadata: {
        status: attempt.status,
        mediaFileCount: attempt.package.mediaFileCount,
        totalPackageBytes: attempt.package.totalPackageBytes,
        attemptOrdinal: attempt.attemptOrdinal,
        receiptRecorded: attempt.receipt !== undefined,
        submissionInitiated: attempt.receipt?.submissionInitiated === true,
        retailerAcceptanceClaimed: false,
        listingPublished: false,
      },
    });
  }
}
