import {
  assertAudiobookRetailPackageInspectionEvidence,
  type AudiobookRetailPackageInspectionEvidence,
} from "./audiobook-retail-package-inspection.js";
import {
  assertAudiobookRetailPackageManifest,
  type AudiobookRetailPackageManifest,
} from "./audiobook-retail-package-manifest.js";
import {
  assertAudiobookRetailPackageReviewSession,
  type AudiobookRetailPackageReviewSession,
} from "./audiobook-retail-package-review.js";
import {
  assertAudiobookRetailDistributorAccountEvidence,
  assertAudiobookRetailReleaseDecision,
  type AudiobookRetailDistributorAccountEvidence,
  type AudiobookRetailReleaseDecision,
} from "./audiobook-retail-release-decision.js";
import { stableHash } from "./index.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";

export const AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_SCHEMA_VERSION =
  "storyteller-audiobook-retail-delivery-attempt-v1" as const;
export const AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_ENTITY_TYPE =
  "audiobook-retail-delivery-attempt" as const;

export type AudiobookRetailDeliveryAttemptStatus =
  | "in-progress"
  | "files-transferred-awaiting-submission-review"
  | "transfer-failed"
  | "cancelled";

export interface AudiobookRetailDeliveryReceipt {
  receiptReferenceHash: string;
  remoteDraftReferenceHash: string;
  fileCountAcknowledged: number;
  allMediaFilesTransferred: true;
  allFileNamesConfirmed: true;
  internalPackageManifestExcluded: true;
  submissionInitiated: false;
  retailerAcceptanceClaimed: false;
  completedByActorId: string;
  completedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailDeliveryFailure {
  failureCode: string;
  failedByActorId: string;
  failedAt: string;
  retryPermittedUnderDecision: false;
  fingerprint: string;
}

export interface AudiobookRetailDeliveryCancellation {
  reasonCode: string;
  cancelledByActorId: string;
  cancelledAt: string;
  retryPermittedUnderDecision: false;
  fingerprint: string;
}

export interface AudiobookRetailDeliveryAttempt {
  schemaVersion: typeof AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  packageId: string;
  distributor: "acx-audible";
  releaseDecision: Readonly<{
    id: string;
    revision: 1;
    fingerprint: string;
    validUntil: string;
  }>;
  packageReview: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
  }>;
  inspection: Readonly<{
    id: string;
    revision: 1;
    fingerprint: string;
  }>;
  packageManifest: Readonly<{
    id: string;
    revision: 1;
    fingerprint: string;
  }>;
  distributorAccount: Readonly<{
    evidenceId: string;
    evidenceFingerprint: string;
    accessExpiresAt: string;
  }>;
  package: Readonly<{
    mediaFileCount: number;
    totalMediaBytes: number;
    totalPackageBytes: number;
    fileSetFingerprint: string;
  }>;
  deliveryMethod: "manual-acx-upload";
  attemptOrdinal: 1;
  operatorId: string;
  humanOperationConfirmed: true;
  startedAt: string;
  status: AudiobookRetailDeliveryAttemptStatus;
  receipt?: AudiobookRetailDeliveryReceipt;
  failure?: AudiobookRetailDeliveryFailure;
  cancellation?: AudiobookRetailDeliveryCancellation;
  revision: number;
  previousFingerprint?: string;
  updatedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailDeliveryAttemptPublicView {
  id: string;
  bookId: string;
  distributor: "acx-audible";
  mediaFileCount: number;
  totalPackageBytes: number;
  deliveryMethod: "manual-acx-upload";
  attemptOrdinal: 1;
  status: AudiobookRetailDeliveryAttemptStatus;
  receiptRecorded: boolean;
  failureCode?: string;
  cancellationReasonCode?: string;
  startedAt: string;
  updatedAt: string;
  revision: number;
  fingerprint: string;
}

export interface StartAudiobookRetailDeliveryAttemptInput {
  releaseDecision: AudiobookRetailReleaseDecision;
  packageReview: AudiobookRetailPackageReviewSession;
  inspection: AudiobookRetailPackageInspectionEvidence;
  packageManifest: AudiobookRetailPackageManifest;
  distributorAccount: AudiobookRetailDistributorAccountEvidence;
  operatorId: string;
  humanOperationConfirmed: true;
  startedAt?: Date;
}

export class AudiobookRetailDeliveryAttemptError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailDeliveryAttemptError";
    this.code = code;
  }
}

export class AudiobookRetailDeliveryAttemptStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudiobookRetailDeliveryAttemptStoreConflictError";
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;
const HUMAN_BLOCKLIST = /^(?:system|worker|automation|automated|bot)(?:[_-]|$)/iu;
const MAXIMUM_FILES = 2_003;
const MAXIMUM_MEDIA_BYTES = 16 * 1024 * 1024 * 1024;
const MAXIMUM_PACKAGE_BYTES = MAXIMUM_MEDIA_BYTES + 32 * 1024 * 1024;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailDeliveryAttemptError(code);
  }
  return value;
}

function requireHumanActor(value: string, code: string): string {
  requireIdentifier(value, code);
  if (HUMAN_BLOCKLIST.test(value)) {
    throw new AudiobookRetailDeliveryAttemptError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailDeliveryAttemptError(code);
  }
  return value;
}

function requireCode(value: string, code: string): string {
  if (!SAFE_CODE.test(value)) {
    throw new AudiobookRetailDeliveryAttemptError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailDeliveryAttemptError(code);
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
    throw new AudiobookRetailDeliveryAttemptError(code);
  }
  return value;
}

function attemptFingerprint(
  value: Omit<AudiobookRetailDeliveryAttempt, "fingerprint">,
): string {
  return stableHash(value);
}

function receiptFingerprint(
  value: Omit<AudiobookRetailDeliveryReceipt, "fingerprint">,
): string {
  return stableHash(value);
}

function failureFingerprint(
  value: Omit<AudiobookRetailDeliveryFailure, "fingerprint">,
): string {
  return stableHash(value);
}

function cancellationFingerprint(
  value: Omit<AudiobookRetailDeliveryCancellation, "fingerprint">,
): string {
  return stableHash(value);
}

function fileSetFingerprint(
  review: AudiobookRetailPackageReviewSession,
): string {
  return stableHash(review.files.map((file) => ({
    ordinal: file.ordinal,
    kind: file.kind,
    role: file.role,
    fileName: file.fileName,
    contentHash: file.contentHash,
    byteCount: file.byteCount,
    fingerprint: file.fingerprint,
  })));
}

function assertCurrentSourceScope(
  input: StartAudiobookRetailDeliveryAttemptInput,
  startedAt: Date,
): void {
  assertAudiobookRetailReleaseDecision(input.releaseDecision);
  assertAudiobookRetailPackageReviewSession(input.packageReview);
  assertAudiobookRetailPackageInspectionEvidence(input.inspection);
  assertAudiobookRetailPackageManifest(input.packageManifest);
  assertAudiobookRetailDistributorAccountEvidence(
    input.distributorAccount,
    startedAt,
  );
  const decision = input.releaseDecision;
  if (
    decision.status !== "authorized-for-controlled-delivery"
    || decision.maximumDeliveryAttempts !== 1
    || decision.deliveryMethod !== "manual-acx-upload"
    || startedAt.getTime() < Date.parse(decision.decidedAt)
    || startedAt.getTime() >= Date.parse(decision.validUntil)
  ) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_DECISION_NOT_CURRENT",
    );
  }
  if (
    decision.projectId !== input.packageReview.projectId
    || decision.projectId !== input.inspection.projectId
    || decision.projectId !== input.packageManifest.projectId
    || decision.projectId !== input.distributorAccount.projectId
    || decision.bookId !== input.packageReview.bookId
    || decision.bookId !== input.inspection.bookId
    || decision.bookId !== input.packageManifest.bookId
    || decision.bookId !== input.distributorAccount.bookId
    || decision.packageReview.id !== input.packageReview.id
    || decision.packageReview.revision !== input.packageReview.revision
    || decision.packageReview.fingerprint !== input.packageReview.fingerprint
    || decision.inspection.id !== input.inspection.id
    || decision.inspection.fingerprint !== input.inspection.fingerprint
    || decision.packageManifest.id !== input.packageManifest.id
    || decision.packageManifest.fingerprint !== input.packageManifest.fingerprint
    || decision.distributorAccount.evidenceId !== input.distributorAccount.id
    || decision.distributorAccount.evidenceFingerprint
      !== input.distributorAccount.fingerprint
    || decision.distributorAccount.accessExpiresAt
      !== input.distributorAccount.expiresAt
    || decision.package.mediaFileCount !== input.packageReview.mediaFileCount
    || decision.package.totalMediaBytes !== input.packageReview.totalMediaBytes
    || decision.package.totalPackageBytes !== input.packageReview.totalPackageBytes
    || decision.package.fileSetFingerprint !== fileSetFingerprint(input.packageReview)
    || input.packageReview.packageId !== input.inspection.packageId
    || input.packageReview.sourceManifest.id !== input.packageManifest.id
    || input.packageReview.sourceManifest.fingerprint
      !== input.packageManifest.fingerprint
  ) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_SOURCE_MISMATCH",
    );
  }
}

function sourceSnapshot(
  input: StartAudiobookRetailDeliveryAttemptInput,
): Pick<
  AudiobookRetailDeliveryAttempt,
  | "projectId"
  | "bookId"
  | "packageId"
  | "distributor"
  | "releaseDecision"
  | "packageReview"
  | "inspection"
  | "packageManifest"
  | "distributorAccount"
  | "package"
  | "deliveryMethod"
  | "attemptOrdinal"
> {
  return {
    projectId: input.releaseDecision.projectId,
    bookId: input.releaseDecision.bookId,
    packageId: input.inspection.packageId,
    distributor: "acx-audible",
    releaseDecision: Object.freeze({
      id: input.releaseDecision.id,
      revision: 1,
      fingerprint: input.releaseDecision.fingerprint,
      validUntil: input.releaseDecision.validUntil,
    }),
    packageReview: Object.freeze({
      id: input.packageReview.id,
      revision: input.packageReview.revision,
      fingerprint: input.packageReview.fingerprint,
    }),
    inspection: Object.freeze({
      id: input.inspection.id,
      revision: 1,
      fingerprint: input.inspection.fingerprint,
    }),
    packageManifest: Object.freeze({
      id: input.packageManifest.id,
      revision: 1,
      fingerprint: input.packageManifest.fingerprint,
    }),
    distributorAccount: Object.freeze({
      evidenceId: input.distributorAccount.id,
      evidenceFingerprint: input.distributorAccount.fingerprint,
      accessExpiresAt: input.distributorAccount.expiresAt,
    }),
    package: Object.freeze({
      mediaFileCount: input.releaseDecision.package.mediaFileCount,
      totalMediaBytes: input.releaseDecision.package.totalMediaBytes,
      totalPackageBytes: input.releaseDecision.package.totalPackageBytes,
      fileSetFingerprint: input.releaseDecision.package.fileSetFingerprint,
    }),
    deliveryMethod: "manual-acx-upload",
    attemptOrdinal: 1,
  };
}

export function startAudiobookRetailDeliveryAttempt(
  input: StartAudiobookRetailDeliveryAttemptInput,
): AudiobookRetailDeliveryAttempt {
  const startedAt = input.startedAt ?? new Date();
  if (Number.isNaN(startedAt.getTime())) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_DATE_INVALID",
    );
  }
  if (input.humanOperationConfirmed !== true) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_HUMAN_OPERATION_REQUIRED",
    );
  }
  const operatorId = requireHumanActor(
    input.operatorId,
    "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_OPERATOR_INVALID",
  );
  assertCurrentSourceScope(input, startedAt);
  const sources = sourceSnapshot(input);
  const derivedId = `retail_delivery_attempt_${stableHash({
    releaseDecision: input.releaseDecision.fingerprint,
    attemptOrdinal: 1,
  }).slice(0, 24)}`;
  const partial: Omit<AudiobookRetailDeliveryAttempt, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_SCHEMA_VERSION,
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
  assertAudiobookRetailDeliveryAttempt(attempt);
  assertAudiobookRetailDeliveryAttemptMatchesSources(attempt, input);
  return attempt;
}

function reviseAttempt(
  attempt: AudiobookRetailDeliveryAttempt,
  updates: Partial<Pick<
    AudiobookRetailDeliveryAttempt,
    "status" | "receipt" | "failure" | "cancellation"
  >>,
  at: Date,
): AudiobookRetailDeliveryAttempt {
  assertAudiobookRetailDeliveryAttempt(attempt);
  if (attempt.status !== "in-progress") {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_TERMINAL_IMMUTABLE",
    );
  }
  if (
    Number.isNaN(at.getTime())
    || at.getTime() < Date.parse(attempt.updatedAt)
    || at.getTime() > Date.parse(attempt.releaseDecision.validUntil)
  ) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_DATE_INVALID",
    );
  }
  const {
    fingerprint: _fingerprint,
    previousFingerprint: _previous,
    ...base
  } = attempt;
  const partial: Omit<AudiobookRetailDeliveryAttempt, "fingerprint"> = {
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
  assertAudiobookRetailDeliveryAttempt(next);
  return next;
}

export function recordAudiobookRetailDeliveryTransfer(
  attempt: AudiobookRetailDeliveryAttempt,
  input: Readonly<{
    receiptReferenceHash: string;
    remoteDraftReferenceHash: string;
    fileCountAcknowledged: number;
    allMediaFilesTransferred: true;
    allFileNamesConfirmed: true;
    internalPackageManifestExcluded: true;
    submissionInitiated: false;
    retailerAcceptanceClaimed: false;
    completedByActorId: string;
    humanConfirmation: true;
    completedAt?: Date;
  }>,
): AudiobookRetailDeliveryAttempt {
  if (input.humanConfirmation !== true) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_HUMAN_CONFIRMATION_REQUIRED",
    );
  }
  if (
    input.allMediaFilesTransferred !== true
    || input.allFileNamesConfirmed !== true
    || input.internalPackageManifestExcluded !== true
    || input.submissionInitiated !== false
    || input.retailerAcceptanceClaimed !== false
  ) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_TRANSFER_ATTESTATION_INVALID",
    );
  }
  const fileCountAcknowledged = requireInteger(
    input.fileCountAcknowledged,
    1,
    MAXIMUM_FILES,
    "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_FILE_COUNT_INVALID",
  );
  if (fileCountAcknowledged !== attempt.package.mediaFileCount) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_FILE_COUNT_MISMATCH",
    );
  }
  const completedAt = input.completedAt ?? new Date();
  const receiptBase: Omit<AudiobookRetailDeliveryReceipt, "fingerprint"> = {
    receiptReferenceHash: requireHash(
      input.receiptReferenceHash,
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_RECEIPT_HASH_INVALID",
    ),
    remoteDraftReferenceHash: requireHash(
      input.remoteDraftReferenceHash,
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_REMOTE_DRAFT_HASH_INVALID",
    ),
    fileCountAcknowledged,
    allMediaFilesTransferred: true,
    allFileNamesConfirmed: true,
    internalPackageManifestExcluded: true,
    submissionInitiated: false,
    retailerAcceptanceClaimed: false,
    completedByActorId: requireHumanActor(
      input.completedByActorId,
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_COMPLETER_INVALID",
    ),
    completedAt: completedAt.toISOString(),
  };
  const receipt = Object.freeze({
    ...receiptBase,
    fingerprint: receiptFingerprint(receiptBase),
  });
  return reviseAttempt(
    attempt,
    {
      status: "files-transferred-awaiting-submission-review",
      receipt,
    },
    completedAt,
  );
}

export function recordAudiobookRetailDeliveryFailure(
  attempt: AudiobookRetailDeliveryAttempt,
  input: Readonly<{
    failureCode: string;
    failedByActorId: string;
    humanConfirmation: true;
    failedAt?: Date;
  }>,
): AudiobookRetailDeliveryAttempt {
  if (input.humanConfirmation !== true) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_HUMAN_CONFIRMATION_REQUIRED",
    );
  }
  const failedAt = input.failedAt ?? new Date();
  const failureBase: Omit<AudiobookRetailDeliveryFailure, "fingerprint"> = {
    failureCode: requireCode(
      input.failureCode,
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_FAILURE_CODE_INVALID",
    ),
    failedByActorId: requireHumanActor(
      input.failedByActorId,
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_FAILURE_ACTOR_INVALID",
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
    { status: "transfer-failed", failure },
    failedAt,
  );
}

export function cancelAudiobookRetailDeliveryAttempt(
  attempt: AudiobookRetailDeliveryAttempt,
  input: Readonly<{
    reasonCode: string;
    cancelledByActorId: string;
    humanConfirmation: true;
    cancelledAt?: Date;
  }>,
): AudiobookRetailDeliveryAttempt {
  if (input.humanConfirmation !== true) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_HUMAN_CONFIRMATION_REQUIRED",
    );
  }
  const cancelledAt = input.cancelledAt ?? new Date();
  const cancellationBase: Omit<AudiobookRetailDeliveryCancellation, "fingerprint"> = {
    reasonCode: requireCode(
      input.reasonCode,
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_CANCELLATION_CODE_INVALID",
    ),
    cancelledByActorId: requireHumanActor(
      input.cancelledByActorId,
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_CANCELLATION_ACTOR_INVALID",
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
  receipt: AudiobookRetailDeliveryReceipt,
  attempt: AudiobookRetailDeliveryAttempt,
): void {
  requireHash(
    receipt.receiptReferenceHash,
    "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_RECEIPT_HASH_INVALID",
  );
  requireHash(
    receipt.remoteDraftReferenceHash,
    "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_REMOTE_DRAFT_HASH_INVALID",
  );
  if (
    receipt.fileCountAcknowledged !== attempt.package.mediaFileCount
    || receipt.allMediaFilesTransferred !== true
    || receipt.allFileNamesConfirmed !== true
    || receipt.internalPackageManifestExcluded !== true
    || receipt.submissionInitiated !== false
    || receipt.retailerAcceptanceClaimed !== false
  ) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_RECEIPT_STATE_INVALID",
    );
  }
  requireHumanActor(
    receipt.completedByActorId,
    "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_COMPLETER_INVALID",
  );
  requireDate(
    receipt.completedAt,
    "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_DATE_INVALID",
  );
  const { fingerprint, ...partial } = receipt;
  if (receiptFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_RECEIPT_FINGERPRINT_INVALID",
    );
  }
}

function assertFailure(failure: AudiobookRetailDeliveryFailure): void {
  requireCode(
    failure.failureCode,
    "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_FAILURE_CODE_INVALID",
  );
  requireHumanActor(
    failure.failedByActorId,
    "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_FAILURE_ACTOR_INVALID",
  );
  requireDate(
    failure.failedAt,
    "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_DATE_INVALID",
  );
  if (failure.retryPermittedUnderDecision !== false) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_RETRY_STATE_INVALID",
    );
  }
  const { fingerprint, ...partial } = failure;
  if (failureFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_FAILURE_FINGERPRINT_INVALID",
    );
  }
}

function assertCancellation(
  cancellation: AudiobookRetailDeliveryCancellation,
): void {
  requireCode(
    cancellation.reasonCode,
    "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_CANCELLATION_CODE_INVALID",
  );
  requireHumanActor(
    cancellation.cancelledByActorId,
    "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_CANCELLATION_ACTOR_INVALID",
  );
  requireDate(
    cancellation.cancelledAt,
    "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_DATE_INVALID",
  );
  if (cancellation.retryPermittedUnderDecision !== false) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_RETRY_STATE_INVALID",
    );
  }
  const { fingerprint, ...partial } = cancellation;
  if (cancellationFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_CANCELLATION_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailDeliveryAttempt(
  attempt: AudiobookRetailDeliveryAttempt,
): void {
  if (attempt.schemaVersion !== AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_SCHEMA_VERSION) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [attempt.id, "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_ID_INVALID"],
    [attempt.projectId, "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_PROJECT_ID_INVALID"],
    [attempt.bookId, "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_BOOK_ID_INVALID"],
    [attempt.packageId, "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_PACKAGE_ID_INVALID"],
    [attempt.releaseDecision.id, "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_DECISION_ID_INVALID"],
    [attempt.packageReview.id, "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_REVIEW_ID_INVALID"],
    [attempt.inspection.id, "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_INSPECTION_ID_INVALID"],
    [attempt.packageManifest.id, "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_MANIFEST_ID_INVALID"],
    [attempt.distributorAccount.evidenceId, "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_ACCOUNT_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  requireHumanActor(
    attempt.operatorId,
    "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_OPERATOR_INVALID",
  );
  for (const [value, code] of [
    [attempt.releaseDecision.fingerprint, "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_DECISION_HASH_INVALID"],
    [attempt.packageReview.fingerprint, "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_REVIEW_HASH_INVALID"],
    [attempt.inspection.fingerprint, "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_INSPECTION_HASH_INVALID"],
    [attempt.packageManifest.fingerprint, "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_MANIFEST_HASH_INVALID"],
    [attempt.distributorAccount.evidenceFingerprint, "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_ACCOUNT_HASH_INVALID"],
    [attempt.package.fileSetFingerprint, "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_FILE_SET_HASH_INVALID"],
  ] as const) requireHash(value, code);
  requireInteger(
    attempt.packageReview.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_REVIEW_REVISION_INVALID",
  );
  if (
    attempt.releaseDecision.revision !== 1
    || attempt.inspection.revision !== 1
    || attempt.packageManifest.revision !== 1
  ) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_SOURCE_REVISION_INVALID",
    );
  }
  requireInteger(
    attempt.package.mediaFileCount,
    1,
    MAXIMUM_FILES,
    "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_FILE_COUNT_INVALID",
  );
  requireInteger(
    attempt.package.totalMediaBytes,
    1,
    MAXIMUM_MEDIA_BYTES,
    "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_SIZE_INVALID",
  );
  requireInteger(
    attempt.package.totalPackageBytes,
    attempt.package.totalMediaBytes + 1,
    MAXIMUM_PACKAGE_BYTES,
    "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_SIZE_INVALID",
  );
  for (const value of [
    attempt.releaseDecision.validUntil,
    attempt.distributorAccount.accessExpiresAt,
    attempt.startedAt,
    attempt.updatedAt,
  ]) requireDate(value, "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_DATE_INVALID");
  if (
    attempt.distributor !== "acx-audible"
    || attempt.deliveryMethod !== "manual-acx-upload"
    || attempt.attemptOrdinal !== 1
    || attempt.humanOperationConfirmed !== true
    || Date.parse(attempt.startedAt) >= Date.parse(attempt.releaseDecision.validUntil)
    || Date.parse(attempt.updatedAt) < Date.parse(attempt.startedAt)
    || Date.parse(attempt.updatedAt) > Date.parse(attempt.releaseDecision.validUntil)
  ) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_STATE_INVALID",
    );
  }
  const statusSet: ReadonlySet<AudiobookRetailDeliveryAttemptStatus> = new Set([
    "in-progress",
    "files-transferred-awaiting-submission-review",
    "transfer-failed",
    "cancelled",
  ]);
  if (!statusSet.has(attempt.status)) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_STATUS_INVALID",
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
      throw new AudiobookRetailDeliveryAttemptError(
        "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_STATE_INVALID",
      );
    }
  } else {
    if (attempt.revision !== 2) {
      throw new AudiobookRetailDeliveryAttemptError(
        "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_REVISION_INVALID",
      );
    }
    requireHash(
      attempt.previousFingerprint ?? "",
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_REVISION_CHAIN_INVALID",
    );
    if (attempt.status === "files-transferred-awaiting-submission-review") {
      if (!attempt.receipt || attempt.failure || attempt.cancellation) {
        throw new AudiobookRetailDeliveryAttemptError(
          "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_STATE_INVALID",
        );
      }
      assertReceipt(attempt.receipt, attempt);
      if (attempt.receipt.completedAt !== attempt.updatedAt) {
        throw new AudiobookRetailDeliveryAttemptError(
          "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_DATE_INVALID",
        );
      }
    } else if (attempt.status === "transfer-failed") {
      if (!attempt.failure || attempt.receipt || attempt.cancellation) {
        throw new AudiobookRetailDeliveryAttemptError(
          "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_STATE_INVALID",
        );
      }
      assertFailure(attempt.failure);
      if (attempt.failure.failedAt !== attempt.updatedAt) {
        throw new AudiobookRetailDeliveryAttemptError(
          "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_DATE_INVALID",
        );
      }
    } else {
      if (!attempt.cancellation || attempt.receipt || attempt.failure) {
        throw new AudiobookRetailDeliveryAttemptError(
          "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_STATE_INVALID",
        );
      }
      assertCancellation(attempt.cancellation);
      if (attempt.cancellation.cancelledAt !== attempt.updatedAt) {
        throw new AudiobookRetailDeliveryAttemptError(
          "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_DATE_INVALID",
        );
      }
    }
  }
  const { fingerprint, ...partial } = attempt;
  if (attemptFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailDeliveryAttemptMatchesSources(
  attempt: AudiobookRetailDeliveryAttempt,
  input: StartAudiobookRetailDeliveryAttemptInput,
): void {
  assertAudiobookRetailDeliveryAttempt(attempt);
  const startedAt = new Date(attempt.startedAt);
  assertCurrentSourceScope(input, startedAt);
  const expected = sourceSnapshot(input);
  if (
    attempt.projectId !== expected.projectId
    || attempt.bookId !== expected.bookId
    || attempt.packageId !== expected.packageId
    || attempt.distributor !== expected.distributor
    || stableHash(attempt.releaseDecision) !== stableHash(expected.releaseDecision)
    || stableHash(attempt.packageReview) !== stableHash(expected.packageReview)
    || stableHash(attempt.inspection) !== stableHash(expected.inspection)
    || stableHash(attempt.packageManifest) !== stableHash(expected.packageManifest)
    || stableHash(attempt.distributorAccount)
      !== stableHash(expected.distributorAccount)
    || stableHash(attempt.package) !== stableHash(expected.package)
    || attempt.deliveryMethod !== expected.deliveryMethod
    || attempt.attemptOrdinal !== expected.attemptOrdinal
    || attempt.operatorId !== input.operatorId
  ) {
    throw new AudiobookRetailDeliveryAttemptError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_SOURCE_MISMATCH",
    );
  }
}

export function audiobookRetailDeliveryAttemptPublicView(
  attempt: AudiobookRetailDeliveryAttempt,
): AudiobookRetailDeliveryAttemptPublicView {
  assertAudiobookRetailDeliveryAttempt(attempt);
  return Object.freeze({
    id: attempt.id,
    bookId: attempt.bookId,
    distributor: attempt.distributor,
    mediaFileCount: attempt.package.mediaFileCount,
    totalPackageBytes: attempt.package.totalPackageBytes,
    deliveryMethod: attempt.deliveryMethod,
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
): StoredEnvelope<AudiobookRetailDeliveryAttempt> {
  const attempt = envelope.payload as unknown as AudiobookRetailDeliveryAttempt;
  assertAudiobookRetailDeliveryAttempt(attempt);
  if (
    envelope.entityType !== AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_ENTITY_TYPE
    || envelope.entityId !== attempt.id
    || envelope.revision !== attempt.revision
  ) {
    throw new AudiobookRetailDeliveryAttemptStoreConflictError(
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<AudiobookRetailDeliveryAttempt>;
}

function payload(
  attempt: AudiobookRetailDeliveryAttempt,
): Record<string, unknown> {
  return attempt as unknown as Record<string, unknown>;
}

export class FileAudiobookRetailDeliveryAttemptStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    attempt: AudiobookRetailDeliveryAttempt,
    actorId: string,
  ): Promise<StoredEnvelope<AudiobookRetailDeliveryAttempt>> {
    assertAudiobookRetailDeliveryAttempt(attempt);
    requireIdentifier(
      actorId,
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_STORE_ACTOR_INVALID",
    );
    try {
      const existing = await this.read(attempt.id);
      if (existing) {
        if (existing.payload.fingerprint === attempt.fingerprint) return existing;
        throw new AudiobookRetailDeliveryAttemptStoreConflictError(
          "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_STORE_IDEMPOTENCY_CONFLICT",
        );
      }
      const envelope = toEnvelope(await this.#store.create(
        AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_ENTITY_TYPE,
        attempt.id,
        payload(attempt),
        new Date(attempt.startedAt),
      ));
      await this.#audit(actorId, "audiobook_retail_delivery_attempt.created", envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailDeliveryAttemptStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(
    attemptId: string,
  ): Promise<StoredEnvelope<AudiobookRetailDeliveryAttempt> | null> {
    requireIdentifier(
      attemptId,
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_STORE_ID_INVALID",
    );
    const envelope = await this.#store.read<Record<string, unknown>>(
      AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_ENTITY_TYPE,
      attemptId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(
    attemptId: string,
  ): Promise<StoredEnvelope<AudiobookRetailDeliveryAttempt>> {
    const envelope = await this.read(attemptId);
    if (!envelope) {
      throw new AudiobookRetailDeliveryAttemptStoreConflictError(
        "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }

  async save(
    attempt: AudiobookRetailDeliveryAttempt,
    input: Readonly<{
      expectedRevision: number;
      actorId: string;
      action: string;
    }>,
  ): Promise<StoredEnvelope<AudiobookRetailDeliveryAttempt>> {
    assertAudiobookRetailDeliveryAttempt(attempt);
    requireIdentifier(
      input.actorId,
      "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_STORE_ACTOR_INVALID",
    );
    if (
      !/^audiobook_retail_delivery_attempt\.[a-z][a-z0-9._-]{1,80}$/u.test(
        input.action,
      )
    ) {
      throw new AudiobookRetailDeliveryAttemptStoreConflictError(
        "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_STORE_ACTION_INVALID",
      );
    }
    const current = await this.require(attempt.id);
    if (
      current.revision !== input.expectedRevision
      || attempt.revision !== current.payload.revision + 1
      || attempt.previousFingerprint !== current.payload.fingerprint
    ) {
      throw new AudiobookRetailDeliveryAttemptStoreConflictError(
        "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_STORE_REVISION_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.replace(
        AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_ENTITY_TYPE,
        attempt.id,
        input.expectedRevision,
        payload(attempt),
        new Date(attempt.updatedAt),
      ));
      await this.#audit(input.actorId, input.action, envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailDeliveryAttemptStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async #audit(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<AudiobookRetailDeliveryAttempt>,
  ): Promise<void> {
    const attempt = envelope.payload;
    await this.#store.appendAuditEvent({
      actorId,
      action,
      entityType: AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_ENTITY_TYPE,
      entityId: envelope.entityId,
      revision: envelope.revision,
      occurredAt: new Date(envelope.savedAt),
      metadata: {
        status: attempt.status,
        mediaFileCount: attempt.package.mediaFileCount,
        totalPackageBytes: attempt.package.totalPackageBytes,
        attemptOrdinal: attempt.attemptOrdinal,
        receiptRecorded: attempt.receipt !== undefined,
        submissionInitiated: false,
        retailerAcceptanceClaimed: false,
      },
    });
  }
}
