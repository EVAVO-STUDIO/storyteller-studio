import {
  assertBookCreditGenerationPlan,
  type BookCreditGenerationPlan,
  type PreparedBookCreditGeneration,
} from "./book-credit-generation.js";
import {
  assertGenerationCalibrationBindingRecord,
  type GenerationCalibrationBindingRecord,
} from "./generation-calibration.js";
import {
  assertGenerationMaterialRecord,
  type GenerationMaterialRecord,
} from "./generation-material.js";
import {
  FileGenerationQueue,
  assertGenerationQueueItem,
  generationQueueEntityId,
  generationQueueIdempotencyKey,
  type GenerationQueueItem,
  type GenerationQueueStatus,
} from "./generation-queue.js";
import { stableHash } from "./index.js";
import type { StoredEnvelope, StoredEntityType } from "./project-store.js";

export const BOOK_CREDIT_QUEUE_SCHEMA_VERSION =
  "storyteller-book-credit-queue-v1" as const;

export interface BookCreditQueueReceipt {
  schemaVersion: typeof BOOK_CREDIT_QUEUE_SCHEMA_VERSION;
  planId: string;
  planFingerprint: string;
  bookId: string;
  creditKind: BookCreditGenerationPlan["creditKind"];
  jobId: string;
  queueItemId: string;
  queueRevision: number;
  queueStatus: GenerationQueueStatus;
  priority: number;
  maxAttempts: number;
  availableAt: string;
  enqueuedAt: string;
  materialFingerprint: string;
  calibrationFingerprint: string;
  queueContentHash: string;
  queueEnvelopeHash: string;
  fingerprint: string;
}

export interface BookCreditQueuePublicView {
  planId: string;
  bookId: string;
  creditKind: BookCreditGenerationPlan["creditKind"];
  jobId: string;
  queueItemId: string;
  queueRevision: number;
  queueStatus: GenerationQueueStatus;
  priority: number;
  maxAttempts: number;
  availableAt: string;
  enqueuedAt: string;
  fingerprint: string;
}

export class BookCreditQueueError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "BookCreditQueueError";
    this.code = code;
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const QUEUE_STATUSES: ReadonlySet<GenerationQueueStatus> = new Set([
  "queued",
  "leased",
  "retry-wait",
  "completed",
  "blocked",
  "failed",
  "cancelled",
]);

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new BookCreditQueueError(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new BookCreditQueueError(code);
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) throw new BookCreditQueueError(code);
  return value;
}

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new BookCreditQueueError(code);
  }
  return value;
}

function canonicalEnvelopeHash<T>(
  envelope: Omit<StoredEnvelope<T>, "envelopeHash">,
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

function assertEnvelope<T extends Record<string, unknown>>(
  envelope: StoredEnvelope<T>,
  input: Readonly<{
    entityType: StoredEntityType;
    entityId: string;
    revision?: number;
    code: string;
  }>,
): void {
  const { envelopeHash, ...partial } = envelope;
  if (
    envelope.schemaVersion !== "storyteller-store-v1"
    || envelope.entityType !== input.entityType
    || envelope.entityId !== input.entityId
    || (input.revision !== undefined && envelope.revision !== input.revision)
    || envelope.contentHash !== stableHash(envelope.payload)
    || canonicalEnvelopeHash(partial) !== envelopeHash
    || Date.parse(envelope.savedAt) < Date.parse(envelope.createdAt)
  ) {
    throw new BookCreditQueueError(input.code);
  }
}

function assertPreparedGeneration(prepared: PreparedBookCreditGeneration): void {
  assertBookCreditGenerationPlan(prepared.plan.payload);
  assertGenerationMaterialRecord(prepared.material.payload);
  assertGenerationCalibrationBindingRecord(prepared.calibration.payload);

  assertEnvelope(
    prepared.plan as unknown as StoredEnvelope<Record<string, unknown>>,
    {
      entityType: "book-credit-generation",
      entityId: prepared.plan.payload.id,
      revision: 1,
      code: "BOOK_CREDIT_QUEUE_PLAN_ENVELOPE_INVALID",
    },
  );
  assertEnvelope(
    prepared.material as unknown as StoredEnvelope<Record<string, unknown>>,
    {
      entityType: "generation-material",
      entityId: prepared.material.payload.id,
      revision: 1,
      code: "BOOK_CREDIT_QUEUE_MATERIAL_ENVELOPE_INVALID",
    },
  );
  assertEnvelope(
    prepared.calibration as unknown as StoredEnvelope<Record<string, unknown>>,
    {
      entityType: "generation-job",
      entityId: prepared.calibration.payload.id,
      revision: 1,
      code: "BOOK_CREDIT_QUEUE_CALIBRATION_ENVELOPE_INVALID",
    },
  );

  const plan = prepared.plan.payload;
  if (
    prepared.material.payload.fingerprint !== plan.material.fingerprint
    || prepared.calibration.payload.fingerprint !== plan.calibration.fingerprint
    || prepared.material.payload.jobId !== plan.job.id
    || prepared.calibration.payload.jobId !== plan.job.id
    || prepared.material.payload.projectId !== plan.projectId
    || prepared.calibration.payload.projectId !== plan.projectId
    || prepared.material.payload.segmentId !== plan.job.segmentId
    || prepared.calibration.payload.segmentId !== plan.job.segmentId
    || prepared.material.payload.jobCacheKey !== plan.job.cacheKey
    || prepared.calibration.payload.jobCacheKey !== plan.job.cacheKey
    || prepared.material.payload.material.text !== plan.script.text
    || prepared.material.payload.material.immutableSourceHash !== plan.script.textHash
  ) {
    throw new BookCreditQueueError("BOOK_CREDIT_QUEUE_PREPARED_SCOPE_MISMATCH");
  }
}

function assertQueueEnvelope(
  envelope: StoredEnvelope<GenerationQueueItem>,
  plan: BookCreditGenerationPlan,
): void {
  assertGenerationQueueItem(envelope.payload, envelope.entityId);
  assertEnvelope(
    envelope as unknown as StoredEnvelope<Record<string, unknown>>,
    {
      entityType: "generation-job",
      entityId: generationQueueEntityId(plan.job.id),
      code: "BOOK_CREDIT_QUEUE_ENVELOPE_INVALID",
    },
  );
  if (
    envelope.payload.jobId !== plan.job.id
    || envelope.payload.projectId !== plan.projectId
    || envelope.payload.segmentId !== plan.job.segmentId
    || envelope.payload.idempotencyKey !== generationQueueIdempotencyKey(plan.job)
    || stableHash(envelope.payload.job) !== stableHash(plan.job)
  ) {
    throw new BookCreditQueueError("BOOK_CREDIT_QUEUE_JOB_SCOPE_MISMATCH");
  }
}

function receiptFingerprint(
  receipt: Omit<BookCreditQueueReceipt, "fingerprint">,
): string {
  return stableHash(receipt);
}

export function assertBookCreditQueueReceipt(receipt: BookCreditQueueReceipt): void {
  if (receipt.schemaVersion !== BOOK_CREDIT_QUEUE_SCHEMA_VERSION) {
    throw new BookCreditQueueError("BOOK_CREDIT_QUEUE_SCHEMA_UNSUPPORTED");
  }
  for (const [value, code] of [
    [receipt.planId, "BOOK_CREDIT_QUEUE_PLAN_ID_INVALID"],
    [receipt.bookId, "BOOK_CREDIT_QUEUE_BOOK_ID_INVALID"],
    [receipt.jobId, "BOOK_CREDIT_QUEUE_JOB_ID_INVALID"],
    [receipt.queueItemId, "BOOK_CREDIT_QUEUE_ITEM_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  for (const [value, code] of [
    [receipt.planFingerprint, "BOOK_CREDIT_QUEUE_PLAN_HASH_INVALID"],
    [receipt.materialFingerprint, "BOOK_CREDIT_QUEUE_MATERIAL_HASH_INVALID"],
    [receipt.calibrationFingerprint, "BOOK_CREDIT_QUEUE_CALIBRATION_HASH_INVALID"],
    [receipt.queueContentHash, "BOOK_CREDIT_QUEUE_CONTENT_HASH_INVALID"],
    [receipt.queueEnvelopeHash, "BOOK_CREDIT_QUEUE_ENVELOPE_HASH_INVALID"],
  ] as const) requireHash(value, code);
  if (receipt.creditKind !== "opening" && receipt.creditKind !== "closing") {
    throw new BookCreditQueueError("BOOK_CREDIT_QUEUE_KIND_INVALID");
}
if (!QUEUE_STATUSES.has(receipt.queueStatus)) {
  throw new BookCreditQueueError("BOOK_CREDIT_QUEUE_STATUS_INVALID");
}
if (receipt.queueItemId !== generationQueueEntityId(receipt.jobId)) {
  throw new BookCreditQueueError("BOOK_CREDIT_QUEUE_ITEM_SCOPE_MISMATCH");
}
  requireInteger(
    receipt.queueRevision,
    1,
    Number.MAX_SAFE_INTEGER,
    "BOOK_CREDIT_QUEUE_REVISION_INVALID",
  );
  requireInteger(receipt.priority, 0, 100, "BOOK_CREDIT_QUEUE_PRIORITY_INVALID");
  requireInteger(receipt.maxAttempts, 1, 20, "BOOK_CREDIT_QUEUE_MAX_ATTEMPTS_INVALID");
  requireDate(receipt.availableAt, "BOOK_CREDIT_QUEUE_AVAILABLE_AT_INVALID");
  requireDate(receipt.enqueuedAt, "BOOK_CREDIT_QUEUE_ENQUEUED_AT_INVALID");
  if (Date.parse(receipt.availableAt) < Date.parse(receipt.enqueuedAt)) {
    throw new BookCreditQueueError("BOOK_CREDIT_QUEUE_DATE_ORDER_INVALID");
  }
  const { fingerprint, ...partial } = receipt;
  if (!HASH_PATTERN.test(fingerprint) || receiptFingerprint(partial) !== fingerprint) {
    throw new BookCreditQueueError("BOOK_CREDIT_QUEUE_FINGERPRINT_INVALID");
  }
}

export async function enqueuePreparedBookCreditGeneration(input: Readonly<{
  prepared: PreparedBookCreditGeneration;
  queue: FileGenerationQueue;
  priority?: number;
  maxAttempts?: number;
  availableAt?: Date;
  now?: Date;
}>): Promise<Readonly<{
  receipt: BookCreditQueueReceipt;
  queue: StoredEnvelope<GenerationQueueItem>;
}>> {
  assertPreparedGeneration(input.prepared);
  const plan = input.prepared.plan.payload;
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new BookCreditQueueError("BOOK_CREDIT_QUEUE_NOW_INVALID");
  const latestPreparedAt = Math.max(
    Date.parse(input.prepared.plan.savedAt),
    Date.parse(input.prepared.material.savedAt),
    Date.parse(input.prepared.calibration.savedAt),
  );
  if (now.getTime() < latestPreparedAt) {
    throw new BookCreditQueueError("BOOK_CREDIT_QUEUE_BEFORE_PREPARATION");
  }
  const availableAt = input.availableAt ?? now;
  if (Number.isNaN(availableAt.getTime()) || availableAt.getTime() < now.getTime()) {
    throw new BookCreditQueueError("BOOK_CREDIT_QUEUE_AVAILABLE_AT_INVALID");
  }
  const queueEnvelope = await input.queue.enqueue(plan.job, {
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
    availableAt,
    now,
  });
  assertQueueEnvelope(queueEnvelope, plan);
  const partial: Omit<BookCreditQueueReceipt, "fingerprint"> = {
    schemaVersion: BOOK_CREDIT_QUEUE_SCHEMA_VERSION,
    planId: plan.id,
    planFingerprint: plan.fingerprint,
    bookId: plan.bookId,
    creditKind: plan.creditKind,
    jobId: plan.job.id,
    queueItemId: queueEnvelope.payload.id,
    queueRevision: queueEnvelope.revision,
    queueStatus: queueEnvelope.payload.status,
    priority: queueEnvelope.payload.priority,
    maxAttempts: queueEnvelope.payload.maxAttempts,
    availableAt: queueEnvelope.payload.availableAt,
    enqueuedAt: queueEnvelope.payload.createdAt,
    materialFingerprint: input.prepared.material.payload.fingerprint,
    calibrationFingerprint: input.prepared.calibration.payload.fingerprint,
    queueContentHash: queueEnvelope.contentHash,
    queueEnvelopeHash: queueEnvelope.envelopeHash,
  };
  const receipt = Object.freeze({
    ...partial,
    fingerprint: receiptFingerprint(partial),
  });
  assertBookCreditQueueReceipt(receipt);
  return Object.freeze({ receipt, queue: queueEnvelope });
}

export function bookCreditQueuePublicView(
  receipt: BookCreditQueueReceipt,
): BookCreditQueuePublicView {
  assertBookCreditQueueReceipt(receipt);
  return Object.freeze({
    planId: receipt.planId,
    bookId: receipt.bookId,
    creditKind: receipt.creditKind,
    jobId: receipt.jobId,
    queueItemId: receipt.queueItemId,
    queueRevision: receipt.queueRevision,
    queueStatus: receipt.queueStatus,
    priority: receipt.priority,
    maxAttempts: receipt.maxAttempts,
    availableAt: receipt.availableAt,
    enqueuedAt: receipt.enqueuedAt,
    fingerprint: receipt.fingerprint,
  });
}
