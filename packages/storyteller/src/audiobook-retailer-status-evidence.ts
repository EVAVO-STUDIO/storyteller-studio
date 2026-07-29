import {
  assertAudiobookRetailDistributorAccountEvidence,
  type AudiobookRetailDistributorAccountEvidence,
} from "./audiobook-retail-release-decision.js";
import {
  assertAudiobookRetailSubmissionAttempt,
  type AudiobookRetailSubmissionAttempt,
} from "./audiobook-retail-submission-attempt.js";
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

export const AUDIOBOOK_RETAILER_STATUS_EVIDENCE_SCHEMA_VERSION =
  "storyteller-audiobook-retailer-status-evidence-v1" as const;
export const AUDIOBOOK_RETAILER_STATUS_EVIDENCE_ENTITY_TYPE =
  "audiobook-retailer-status-evidence" as const;

export type AudiobookRetailerNormalisedStatus =
  | "processing"
  | "changes-requested"
  | "accepted-awaiting-publication"
  | "rejected";

export interface AudiobookRetailerStatusEvidence {
  schemaVersion: typeof AUDIOBOOK_RETAILER_STATUS_EVIDENCE_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  packageId: string;
  distributor: "acx-audible";
  submissionAttempt: Readonly<{
    id: string;
    revision: 2;
    fingerprint: string;
    receiptFingerprint: string;
    retailerSubmissionReferenceHash: string;
    completedAt: string;
  }>;
  submissionDecision: Readonly<{
    id: string;
    revision: 1;
    fingerprint: string;
  }>;
  submissionReview: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
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
  normalisedStatus: AudiobookRetailerNormalisedStatus;
  externalStatusReferenceHash: string;
  externalStatusTextHash: string;
  issueCodes: readonly string[];
  retailerAcceptanceConfirmed: boolean;
  publicationConfirmed: false;
  liveConfirmed: false;
  resubmissionRequired: boolean;
  observedByActorId: string;
  humanObservationConfirmed: true;
  observedAt: string;
  status: "verified-retailer-status-evidence";
  revision: 1;
  fingerprint: string;
}

export interface AudiobookRetailerStatusEvidencePublicView {
  id: string;
  bookId: string;
  distributor: "acx-audible";
  normalisedStatus: AudiobookRetailerNormalisedStatus;
  issueCodes: readonly string[];
  retailerAcceptanceConfirmed: boolean;
  publicationConfirmed: false;
  liveConfirmed: false;
  resubmissionRequired: boolean;
  observedAt: string;
  status: "verified-retailer-status-evidence";
  revision: 1;
  fingerprint: string;
}

export interface CreateAudiobookRetailerStatusEvidenceInput {
  submissionAttempt: AudiobookRetailSubmissionAttempt;
  submissionDecision: AudiobookRetailSubmissionDecision;
  submissionReview: AudiobookRetailSubmissionReviewSession;
  distributorAccount: AudiobookRetailDistributorAccountEvidence;
  normalisedStatus: AudiobookRetailerNormalisedStatus;
  externalStatusReferenceHash: string;
  externalStatusTextHash: string;
  issueCodes?: readonly string[];
  retailerAcceptanceConfirmed: boolean;
  publicationConfirmed: false;
  liveConfirmed: false;
  observedByActorId: string;
  humanObservationConfirmed: true;
  observedAt?: Date;
}

export class AudiobookRetailerStatusEvidenceError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailerStatusEvidenceError";
    this.code = code;
  }
}

export class AudiobookRetailerStatusEvidenceStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudiobookRetailerStatusEvidenceStoreConflictError";
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const ISSUE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,95}$/u;
const HUMAN_BLOCKLIST = /^(?:system|worker|automation|automated|bot)(?:[_-]|$)/iu;
const MAXIMUM_ISSUE_CODES = 100;
const MAXIMUM_FILES = 2_003;
const MAXIMUM_PACKAGE_BYTES = 16 * 1024 * 1024 * 1024 + 32 * 1024 * 1024;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailerStatusEvidenceError(code);
  }
  return value;
}

function requireHumanActor(value: string, code: string): string {
  requireIdentifier(value, code);
  if (HUMAN_BLOCKLIST.test(value)) {
    throw new AudiobookRetailerStatusEvidenceError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailerStatusEvidenceError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailerStatusEvidenceError(code);
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
    throw new AudiobookRetailerStatusEvidenceError(code);
  }
  return value;
}

function normaliseIssueCodes(
  status: AudiobookRetailerNormalisedStatus,
  input: readonly string[] | undefined,
): readonly string[] {
  const values = input ?? [];
  if (!Array.isArray(values) || values.length > MAXIMUM_ISSUE_CODES) {
    throw new AudiobookRetailerStatusEvidenceError(
      "AUDIOBOOK_RETAILER_STATUS_ISSUES_INVALID",
    );
  }
  const unique = new Set<string>();
  for (const code of values) {
    if (!ISSUE_CODE_PATTERN.test(code) || unique.has(code)) {
      throw new AudiobookRetailerStatusEvidenceError(
        "AUDIOBOOK_RETAILER_STATUS_ISSUES_INVALID",
      );
    }
    unique.add(code);
  }
  const requiresIssues = status === "changes-requested" || status === "rejected";
  if (requiresIssues !== (unique.size > 0)) {
    throw new AudiobookRetailerStatusEvidenceError(
      requiresIssues
        ? "AUDIOBOOK_RETAILER_STATUS_ISSUES_REQUIRED"
        : "AUDIOBOOK_RETAILER_STATUS_ISSUES_FORBIDDEN",
    );
  }
  return Object.freeze(
    [...unique].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function evidenceFingerprint(
  value: Omit<AudiobookRetailerStatusEvidence, "fingerprint">,
): string {
  return stableHash(value);
}

function statusFlags(status: AudiobookRetailerNormalisedStatus): Readonly<{
  retailerAcceptanceConfirmed: boolean;
  resubmissionRequired: boolean;
}> {
  return Object.freeze({
    retailerAcceptanceConfirmed: status === "accepted-awaiting-publication",
    resubmissionRequired: status === "changes-requested",
  });
}

function assertSources(
  input: CreateAudiobookRetailerStatusEvidenceInput,
  observedAt: Date,
): void {
  assertAudiobookRetailSubmissionAttempt(input.submissionAttempt);
  assertAudiobookRetailSubmissionDecision(input.submissionDecision);
  assertAudiobookRetailSubmissionReviewSession(input.submissionReview);
  assertAudiobookRetailDistributorAccountEvidence(
    input.distributorAccount,
    observedAt,
  );
  const attempt = input.submissionAttempt;
  const decision = input.submissionDecision;
  const review = input.submissionReview;
  if (
    attempt.status !== "submitted-awaiting-retailer-review"
    || !attempt.receipt
    || attempt.receipt.submissionInitiated !== true
    || attempt.receipt.retailerAcceptanceClaimed !== false
    || attempt.receipt.listingPublished !== false
    || decision.status !== "authorized-for-single-submission"
    || review.status !== "approved-for-submission-decision"
    || !review.approval
  ) {
    throw new AudiobookRetailerStatusEvidenceError(
      "AUDIOBOOK_RETAILER_STATUS_SUBMISSION_RECEIPT_REQUIRED",
    );
  }
  if (
    attempt.projectId !== decision.projectId
    || attempt.projectId !== review.projectId
    || attempt.projectId !== input.distributorAccount.projectId
    || attempt.bookId !== decision.bookId
    || attempt.bookId !== review.bookId
    || attempt.bookId !== input.distributorAccount.bookId
    || attempt.packageId !== decision.packageId
    || attempt.packageId !== review.packageId
    || attempt.submissionDecision.id !== decision.id
    || attempt.submissionDecision.fingerprint !== decision.fingerprint
    || attempt.submissionReview.id !== review.id
    || attempt.submissionReview.fingerprint !== review.fingerprint
    || attempt.distributorAccount.evidenceId !== input.distributorAccount.id
    || attempt.distributorAccount.evidenceFingerprint
      !== input.distributorAccount.fingerprint
    || decision.submissionReview.id !== review.id
    || decision.submissionReview.fingerprint !== review.fingerprint
  ) {
    throw new AudiobookRetailerStatusEvidenceError(
      "AUDIOBOOK_RETAILER_STATUS_SOURCE_MISMATCH",
    );
  }
  if (
    attempt.package.mediaFileCount !== decision.package.mediaFileCount
    || attempt.package.mediaFileCount !== review.mediaFileCount
    || attempt.package.totalPackageBytes !== decision.package.totalPackageBytes
    || attempt.package.totalPackageBytes !== review.totalPackageBytes
    || attempt.package.fileSetFingerprint !== decision.package.fileSetFingerprint
    || attempt.package.fileSetFingerprint !== review.fileSetFingerprint
  ) {
    throw new AudiobookRetailerStatusEvidenceError(
      "AUDIOBOOK_RETAILER_STATUS_FILE_SET_MISMATCH",
    );
  }
  if (observedAt.getTime() < Date.parse(attempt.receipt.completedAt)) {
    throw new AudiobookRetailerStatusEvidenceError(
      "AUDIOBOOK_RETAILER_STATUS_DATE_INVALID",
    );
  }
}

export function createAudiobookRetailerStatusEvidence(
  input: CreateAudiobookRetailerStatusEvidenceInput,
): AudiobookRetailerStatusEvidence {
  const observedAt = input.observedAt ?? new Date();
  if (Number.isNaN(observedAt.getTime())) {
    throw new AudiobookRetailerStatusEvidenceError(
      "AUDIOBOOK_RETAILER_STATUS_DATE_INVALID",
    );
  }
  if (input.humanObservationConfirmed !== true) {
    throw new AudiobookRetailerStatusEvidenceError(
      "AUDIOBOOK_RETAILER_STATUS_HUMAN_CONFIRMATION_REQUIRED",
    );
  }
  if (input.publicationConfirmed !== false || input.liveConfirmed !== false) {
    throw new AudiobookRetailerStatusEvidenceError(
      "AUDIOBOOK_RETAILER_STATUS_PUBLICATION_CLAIM_FORBIDDEN",
    );
  }
  assertSources(input, observedAt);
  const observedByActorId = requireHumanActor(
    input.observedByActorId,
    "AUDIOBOOK_RETAILER_STATUS_OBSERVER_INVALID",
  );
  const excludedActors = new Set([
    input.submissionAttempt.operatorId,
    input.submissionAttempt.receipt!.completedByActorId,
    input.submissionDecision.decidedByActorId,
    input.distributorAccount.verifiedByActorId,
  ]);
  if (excludedActors.has(observedByActorId)) {
    throw new AudiobookRetailerStatusEvidenceError(
      "AUDIOBOOK_RETAILER_STATUS_INDEPENDENT_OBSERVER_REQUIRED",
    );
  }
  const flags = statusFlags(input.normalisedStatus);
  if (input.retailerAcceptanceConfirmed !== flags.retailerAcceptanceConfirmed) {
    throw new AudiobookRetailerStatusEvidenceError(
      "AUDIOBOOK_RETAILER_STATUS_ACCEPTANCE_STATE_INVALID",
    );
  }
  const issueCodes = normaliseIssueCodes(
    input.normalisedStatus,
    input.issueCodes,
  );
  const submissionReceipt = input.submissionAttempt.receipt!;
  const derivedId = `retailer_status_${stableHash({
    submissionAttempt: input.submissionAttempt.fingerprint,
    normalisedStatus: input.normalisedStatus,
    externalStatusReferenceHash: input.externalStatusReferenceHash,
    observedAt: observedAt.toISOString(),
  }).slice(0, 24)}`;
  const partial: Omit<AudiobookRetailerStatusEvidence, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAILER_STATUS_EVIDENCE_SCHEMA_VERSION,
    id: derivedId,
    projectId: input.submissionAttempt.projectId,
    bookId: input.submissionAttempt.bookId,
    packageId: input.submissionAttempt.packageId,
    distributor: "acx-audible",
    submissionAttempt: Object.freeze({
      id: input.submissionAttempt.id,
      revision: 2,
      fingerprint: input.submissionAttempt.fingerprint,
      receiptFingerprint: submissionReceipt.fingerprint,
      retailerSubmissionReferenceHash:
        submissionReceipt.retailerSubmissionReferenceHash,
      completedAt: submissionReceipt.completedAt,
    }),
    submissionDecision: Object.freeze({
      id: input.submissionDecision.id,
      revision: 1,
      fingerprint: input.submissionDecision.fingerprint,
    }),
    submissionReview: Object.freeze({
      id: input.submissionReview.id,
      revision: input.submissionReview.revision,
      fingerprint: input.submissionReview.fingerprint,
    }),
    distributorAccount: Object.freeze({
      evidenceId: input.distributorAccount.id,
      evidenceFingerprint: input.distributorAccount.fingerprint,
      accessExpiresAt: input.distributorAccount.expiresAt,
    }),
    package: Object.freeze({
      mediaFileCount: input.submissionAttempt.package.mediaFileCount,
      totalPackageBytes: input.submissionAttempt.package.totalPackageBytes,
      fileSetFingerprint: input.submissionAttempt.package.fileSetFingerprint,
    }),
    normalisedStatus: input.normalisedStatus,
    externalStatusReferenceHash: requireHash(
      input.externalStatusReferenceHash,
      "AUDIOBOOK_RETAILER_STATUS_REFERENCE_HASH_INVALID",
    ),
    externalStatusTextHash: requireHash(
      input.externalStatusTextHash,
      "AUDIOBOOK_RETAILER_STATUS_TEXT_HASH_INVALID",
    ),
    issueCodes,
    retailerAcceptanceConfirmed: flags.retailerAcceptanceConfirmed,
    publicationConfirmed: false,
    liveConfirmed: false,
    resubmissionRequired: flags.resubmissionRequired,
    observedByActorId,
    humanObservationConfirmed: true,
    observedAt: observedAt.toISOString(),
    status: "verified-retailer-status-evidence",
    revision: 1,
  };
  const evidence = Object.freeze({
    ...partial,
    fingerprint: evidenceFingerprint(partial),
  });
  assertAudiobookRetailerStatusEvidence(evidence);
  assertAudiobookRetailerStatusEvidenceMatchesSources(evidence, input);
  return evidence;
}

export function assertAudiobookRetailerStatusEvidence(
  evidence: AudiobookRetailerStatusEvidence,
): void {
  if (
    evidence.schemaVersion !== AUDIOBOOK_RETAILER_STATUS_EVIDENCE_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailerStatusEvidenceError(
      "AUDIOBOOK_RETAILER_STATUS_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [evidence.id, "AUDIOBOOK_RETAILER_STATUS_ID_INVALID"],
    [evidence.projectId, "AUDIOBOOK_RETAILER_STATUS_PROJECT_ID_INVALID"],
    [evidence.bookId, "AUDIOBOOK_RETAILER_STATUS_BOOK_ID_INVALID"],
    [evidence.packageId, "AUDIOBOOK_RETAILER_STATUS_PACKAGE_ID_INVALID"],
    [evidence.submissionAttempt.id, "AUDIOBOOK_RETAILER_STATUS_ATTEMPT_ID_INVALID"],
    [evidence.submissionDecision.id, "AUDIOBOOK_RETAILER_STATUS_DECISION_ID_INVALID"],
    [evidence.submissionReview.id, "AUDIOBOOK_RETAILER_STATUS_REVIEW_ID_INVALID"],
    [evidence.distributorAccount.evidenceId, "AUDIOBOOK_RETAILER_STATUS_ACCOUNT_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  for (const [value, code] of [
    [evidence.submissionAttempt.fingerprint, "AUDIOBOOK_RETAILER_STATUS_ATTEMPT_HASH_INVALID"],
    [evidence.submissionAttempt.receiptFingerprint, "AUDIOBOOK_RETAILER_STATUS_RECEIPT_HASH_INVALID"],
    [evidence.submissionAttempt.retailerSubmissionReferenceHash, "AUDIOBOOK_RETAILER_STATUS_SUBMISSION_REFERENCE_HASH_INVALID"],
    [evidence.submissionDecision.fingerprint, "AUDIOBOOK_RETAILER_STATUS_DECISION_HASH_INVALID"],
    [evidence.submissionReview.fingerprint, "AUDIOBOOK_RETAILER_STATUS_REVIEW_HASH_INVALID"],
    [evidence.distributorAccount.evidenceFingerprint, "AUDIOBOOK_RETAILER_STATUS_ACCOUNT_HASH_INVALID"],
    [evidence.package.fileSetFingerprint, "AUDIOBOOK_RETAILER_STATUS_FILE_SET_HASH_INVALID"],
    [evidence.externalStatusReferenceHash, "AUDIOBOOK_RETAILER_STATUS_REFERENCE_HASH_INVALID"],
    [evidence.externalStatusTextHash, "AUDIOBOOK_RETAILER_STATUS_TEXT_HASH_INVALID"],
  ] as const) requireHash(value, code);
  requireHumanActor(
    evidence.observedByActorId,
    "AUDIOBOOK_RETAILER_STATUS_OBSERVER_INVALID",
  );
  requireInteger(
    evidence.submissionReview.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAILER_STATUS_REVIEW_REVISION_INVALID",
  );
  if (
    evidence.submissionAttempt.revision !== 2
    || evidence.submissionDecision.revision !== 1
  ) {
    throw new AudiobookRetailerStatusEvidenceError(
      "AUDIOBOOK_RETAILER_STATUS_SOURCE_REVISION_INVALID",
    );
  }
  requireInteger(
    evidence.package.mediaFileCount,
    4,
    MAXIMUM_FILES,
    "AUDIOBOOK_RETAILER_STATUS_FILE_COUNT_INVALID",
  );
  requireInteger(
    evidence.package.totalPackageBytes,
    1,
    MAXIMUM_PACKAGE_BYTES,
    "AUDIOBOOK_RETAILER_STATUS_SIZE_INVALID",
  );
  for (const value of [
    evidence.submissionAttempt.completedAt,
    evidence.distributorAccount.accessExpiresAt,
    evidence.observedAt,
  ]) requireDate(value, "AUDIOBOOK_RETAILER_STATUS_DATE_INVALID");
  const statuses: ReadonlySet<AudiobookRetailerNormalisedStatus> = new Set([
    "processing",
    "changes-requested",
    "accepted-awaiting-publication",
    "rejected",
  ]);
  if (!statuses.has(evidence.normalisedStatus)) {
    throw new AudiobookRetailerStatusEvidenceError(
      "AUDIOBOOK_RETAILER_STATUS_NORMALISED_STATUS_INVALID",
    );
  }
  const flags = statusFlags(evidence.normalisedStatus);
  if (
    evidence.distributor !== "acx-audible"
    || evidence.retailerAcceptanceConfirmed !== flags.retailerAcceptanceConfirmed
    || evidence.publicationConfirmed !== false
    || evidence.liveConfirmed !== false
    || evidence.resubmissionRequired !== flags.resubmissionRequired
    || evidence.humanObservationConfirmed !== true
    || evidence.status !== "verified-retailer-status-evidence"
    || evidence.revision !== 1
    || Date.parse(evidence.observedAt)
      < Date.parse(evidence.submissionAttempt.completedAt)
  ) {
    throw new AudiobookRetailerStatusEvidenceError(
      "AUDIOBOOK_RETAILER_STATUS_STATE_INVALID",
    );
  }
  normaliseIssueCodes(evidence.normalisedStatus, evidence.issueCodes);
  const { fingerprint, ...partial } = evidence;
  if (evidenceFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailerStatusEvidenceError(
      "AUDIOBOOK_RETAILER_STATUS_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailerStatusEvidenceMatchesSources(
  evidence: AudiobookRetailerStatusEvidence,
  input: CreateAudiobookRetailerStatusEvidenceInput,
): void {
  assertAudiobookRetailerStatusEvidence(evidence);
  assertSources(input, new Date(evidence.observedAt));
  const attempt = input.submissionAttempt;
  const decision = input.submissionDecision;
  const review = input.submissionReview;
  if (
    evidence.projectId !== attempt.projectId
    || evidence.bookId !== attempt.bookId
    || evidence.packageId !== attempt.packageId
    || evidence.submissionAttempt.id !== attempt.id
    || evidence.submissionAttempt.fingerprint !== attempt.fingerprint
    || evidence.submissionAttempt.receiptFingerprint
      !== attempt.receipt!.fingerprint
    || evidence.submissionAttempt.retailerSubmissionReferenceHash
      !== attempt.receipt!.retailerSubmissionReferenceHash
    || evidence.submissionDecision.id !== decision.id
    || evidence.submissionDecision.fingerprint !== decision.fingerprint
    || evidence.submissionReview.id !== review.id
    || evidence.submissionReview.revision !== review.revision
    || evidence.submissionReview.fingerprint !== review.fingerprint
    || evidence.distributorAccount.evidenceId !== input.distributorAccount.id
    || evidence.distributorAccount.evidenceFingerprint
      !== input.distributorAccount.fingerprint
    || evidence.package.mediaFileCount !== attempt.package.mediaFileCount
    || evidence.package.totalPackageBytes !== attempt.package.totalPackageBytes
    || evidence.package.fileSetFingerprint !== attempt.package.fileSetFingerprint
    || evidence.normalisedStatus !== input.normalisedStatus
    || evidence.externalStatusReferenceHash !== input.externalStatusReferenceHash
    || evidence.externalStatusTextHash !== input.externalStatusTextHash
  ) {
    throw new AudiobookRetailerStatusEvidenceError(
      "AUDIOBOOK_RETAILER_STATUS_SOURCE_MISMATCH",
    );
  }
}

export function audiobookRetailerStatusEvidencePublicView(
  evidence: AudiobookRetailerStatusEvidence,
): AudiobookRetailerStatusEvidencePublicView {
  assertAudiobookRetailerStatusEvidence(evidence);
  return Object.freeze({
    id: evidence.id,
    bookId: evidence.bookId,
    distributor: evidence.distributor,
    normalisedStatus: evidence.normalisedStatus,
    issueCodes: evidence.issueCodes,
    retailerAcceptanceConfirmed: evidence.retailerAcceptanceConfirmed,
    publicationConfirmed: false,
    liveConfirmed: false,
    resubmissionRequired: evidence.resubmissionRequired,
    observedAt: evidence.observedAt,
    status: evidence.status,
    revision: 1,
    fingerprint: evidence.fingerprint,
  });
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<AudiobookRetailerStatusEvidence> {
  const evidence = envelope.payload as unknown as AudiobookRetailerStatusEvidence;
  assertAudiobookRetailerStatusEvidence(evidence);
  if (
    envelope.entityType !== AUDIOBOOK_RETAILER_STATUS_EVIDENCE_ENTITY_TYPE
    || envelope.entityId !== evidence.id
    || envelope.revision !== evidence.revision
  ) {
    throw new AudiobookRetailerStatusEvidenceStoreConflictError(
      "AUDIOBOOK_RETAILER_STATUS_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<AudiobookRetailerStatusEvidence>;
}

function payload(
  evidence: AudiobookRetailerStatusEvidence,
): Record<string, unknown> {
  return evidence as unknown as Record<string, unknown>;
}

export class FileAudiobookRetailerStatusEvidenceStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    evidence: AudiobookRetailerStatusEvidence,
    actorId: string,
  ): Promise<StoredEnvelope<AudiobookRetailerStatusEvidence>> {
    assertAudiobookRetailerStatusEvidence(evidence);
    requireIdentifier(actorId, "AUDIOBOOK_RETAILER_STATUS_STORE_ACTOR_INVALID");
    try {
      const existing = await this.read(evidence.id);
      if (existing) {
        if (existing.payload.fingerprint === evidence.fingerprint) return existing;
        throw new AudiobookRetailerStatusEvidenceStoreConflictError(
          "AUDIOBOOK_RETAILER_STATUS_STORE_IDEMPOTENCY_CONFLICT",
        );
      }
      const envelope = toEnvelope(await this.#store.create(
        AUDIOBOOK_RETAILER_STATUS_EVIDENCE_ENTITY_TYPE,
        evidence.id,
        payload(evidence),
        new Date(evidence.observedAt),
      ));
      await this.#store.appendAuditEvent({
        actorId,
        action: "audiobook_retailer_status_evidence.created",
        entityType: AUDIOBOOK_RETAILER_STATUS_EVIDENCE_ENTITY_TYPE,
        entityId: envelope.entityId,
        revision: envelope.revision,
        occurredAt: new Date(envelope.savedAt),
        metadata: {
          normalisedStatus: evidence.normalisedStatus,
          issueCount: evidence.issueCodes.length,
          retailerAcceptanceConfirmed: evidence.retailerAcceptanceConfirmed,
          publicationConfirmed: false,
          liveConfirmed: false,
          resubmissionRequired: evidence.resubmissionRequired,
        },
      });
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailerStatusEvidenceStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(
    evidenceId: string,
  ): Promise<StoredEnvelope<AudiobookRetailerStatusEvidence> | null> {
    requireIdentifier(evidenceId, "AUDIOBOOK_RETAILER_STATUS_STORE_ID_INVALID");
    const envelope = await this.#store.read<Record<string, unknown>>(
      AUDIOBOOK_RETAILER_STATUS_EVIDENCE_ENTITY_TYPE,
      evidenceId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(
    evidenceId: string,
  ): Promise<StoredEnvelope<AudiobookRetailerStatusEvidence>> {
    const envelope = await this.read(evidenceId);
    if (!envelope) {
      throw new AudiobookRetailerStatusEvidenceStoreConflictError(
        "AUDIOBOOK_RETAILER_STATUS_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }
}
