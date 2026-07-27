import { timingSafeEqual } from "node:crypto";
import { stableHash, type GenerationJob } from "./index.js";

export const GENERATION_QUEUE_SCHEMA_VERSION = "storyteller-generation-queue-v1";
export const GENERATION_QUEUE_ENTITY_TYPE = "generation-job" as const;

const SAFE_IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,127}$/u;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;
const SAFE_CURRENCY = /^[A-Z]{3}$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const LEASE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_FAILURE_MESSAGE_LENGTH = 500;
const MAX_REASON_LENGTH = 500;
const MAX_REFERENCE_LENGTH = 500;
const MAX_REFERENCES = 64;
const MAX_PROVIDER_ROUTES = 16;

export type GenerationQueueStatus =
  | "queued"
  | "leased"
  | "retry-wait"
  | "completed"
  | "blocked"
  | "failed"
  | "cancelled";

const QUEUE_STATUSES: ReadonlySet<GenerationQueueStatus> = new Set([
  "queued",
  "leased",
  "retry-wait",
  "completed",
  "blocked",
  "failed",
  "cancelled",
]);

export interface GenerationLease {
  tokenHash: string;
  workerId: string;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
}

export interface GenerationQueueFailure {
  code: string;
  message: string;
  retryable: boolean;
  occurredAt: string;
  providerId?: string;
  fingerprint: string;
}

export interface GenerationQueueCompletion {
  executionReportHash: string;
  resultIds: readonly string[];
  outputArtifactRefs: readonly string[];
  totalEstimatedCost?: number;
  currency?: string;
  completedAt: string;
  fingerprint: string;
}

export interface GenerationQueueCancellation {
  actorId: string;
  reason: string;
  cancelledAt: string;
  fingerprint: string;
}

export interface GenerationQueueBlock {
  codes: readonly string[];
  message: string;
  blockedAt: string;
  fingerprint: string;
}

export interface GenerationQueueItem {
  schemaVersion: typeof GENERATION_QUEUE_SCHEMA_VERSION;
  id: string;
  jobId: string;
  projectId: string;
  segmentId: string;
  idempotencyKey: string;
  job: GenerationJob;
  status: GenerationQueueStatus;
  priority: number;
  attempt: number;
  maxAttempts: number;
  availableAt: string;
  createdAt: string;
  updatedAt: string;
  lease?: GenerationLease;
  lastFailure?: GenerationQueueFailure;
  completion?: GenerationQueueCompletion;
  cancellation?: GenerationQueueCancellation;
  block?: GenerationQueueBlock;
}

export class GenerationQueueConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationQueueConflictError";
  }
}

export class GenerationLeaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationLeaseError";
  }
}

export function generationQueueDate(value: Date, code: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(code);
  return value;
}

export function generationQueueInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(code);
  return value;
}

export function generationQueueIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new Error(code);
  return value;
}

function boundedText(value: string, maximum: number, code: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum || CONTROL_CHARACTER_PATTERN.test(trimmed)) throw new Error(code);
  return trimmed;
}

function validDate(value: string): boolean {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(new Date(value).getTime());
}

function referenceList(values: readonly string[], code: string, allowEmpty = true): readonly string[] {
  if (!Array.isArray(values) || values.length > MAX_REFERENCES || (!allowEmpty && values.length === 0)) {
    throw new Error(code);
  }
  const unique = new Set<string>();
  for (const value of values) {
    const checked = boundedText(value, MAX_REFERENCE_LENGTH, code);
    if (unique.has(checked)) throw new Error(`${code}_DUPLICATE`);
    unique.add(checked);
  }
  return Object.freeze([...unique]);
}

export function generationQueueEntityId(jobId: string): string {
  generationQueueIdentifier(jobId, "GENERATION_JOB_ID_INVALID");
  const value = `queue_${jobId}`;
  if (value.length > 128) throw new Error("GENERATION_QUEUE_ID_TOO_LONG");
  return value;
}

export function validateGenerationJob(job: GenerationJob): void {
  generationQueueIdentifier(job.id, "GENERATION_JOB_ID_INVALID");
  generationQueueIdentifier(job.projectId, "GENERATION_JOB_PROJECT_ID_INVALID");
  generationQueueIdentifier(job.segmentId, "GENERATION_JOB_SEGMENT_ID_INVALID");
  if (!HASH_PATTERN.test(job.cacheKey)) throw new Error("GENERATION_JOB_CACHE_KEY_INVALID");
  generationQueueInteger(job.candidateCount, 1, 8, "GENERATION_JOB_CANDIDATE_COUNT_INVALID");
  if (job.status !== "ready" && job.status !== "blocked") throw new Error("GENERATION_JOB_STATUS_INVALID");
  if (!Array.isArray(job.providerFallbackIds) || job.providerFallbackIds.length > MAX_PROVIDER_ROUTES) {
    throw new Error("GENERATION_JOB_PROVIDER_ROUTES_INVALID");
  }
  const providers = new Set<string>();
  for (const providerId of job.providerFallbackIds) {
    generationQueueIdentifier(providerId, "GENERATION_JOB_PROVIDER_ID_INVALID");
    if (providers.has(providerId)) throw new Error("GENERATION_JOB_PROVIDER_ROUTE_DUPLICATE");
    providers.add(providerId);
  }
  if (job.status === "ready" && providers.size === 0) {
    throw new Error("GENERATION_JOB_READY_PROVIDER_ROUTE_REQUIRED");
  }
}

export function generationQueueIdempotencyKey(job: GenerationJob): string {
  validateGenerationJob(job);
  return stableHash({
    schemaVersion: GENERATION_QUEUE_SCHEMA_VERSION,
    jobId: job.id,
    projectId: job.projectId,
    segmentId: job.segmentId,
    cacheKey: job.cacheKey,
    candidateCount: job.candidateCount,
    providerFallbackIds: job.providerFallbackIds,
  });
}

export function generationLeaseTokenHash(value: string): string {
  if (!LEASE_TOKEN_PATTERN.test(value)) {
    throw new GenerationLeaseError("GENERATION_QUEUE_LEASE_TOKEN_INVALID");
  }
  return stableHash(value);
}

export function generationLeaseTokenMatches(persistedHash: string, leaseToken: string): boolean {
  const candidateHash = generationLeaseTokenHash(leaseToken);
  const left = Buffer.from(persistedHash, "utf8");
  const right = Buffer.from(candidateHash, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function activeGenerationQueueState(
  item: GenerationQueueItem,
): Omit<GenerationQueueItem, "lease" | "completion" | "cancellation" | "block"> {
  const {
    lease: _lease,
    completion: _completion,
    cancellation: _cancellation,
    block: _block,
    ...rest
  } = item;
  return rest;
}

export function assertGenerationTransitionTime(item: GenerationQueueItem, now: Date): void {
  if (now.getTime() < Date.parse(item.updatedAt)) {
    throw new Error("GENERATION_QUEUE_TRANSITION_TIME_REVERSED");
  }
}

export function createGenerationQueueFailure(input: Readonly<{
  code: string;
  message: string;
  retryable: boolean;
  providerId?: string;
  occurredAt: Date;
}>): GenerationQueueFailure {
  if (!SAFE_CODE.test(input.code)) throw new Error("GENERATION_QUEUE_FAILURE_CODE_INVALID");
  const message = boundedText(input.message, MAX_FAILURE_MESSAGE_LENGTH, "GENERATION_QUEUE_FAILURE_MESSAGE_INVALID");
  const providerId = input.providerId
    ? generationQueueIdentifier(input.providerId, "GENERATION_QUEUE_PROVIDER_ID_INVALID")
    : undefined;
  const base = {
    code: input.code,
    message,
    retryable: input.retryable,
    occurredAt: generationQueueDate(input.occurredAt, "GENERATION_QUEUE_FAILURE_DATE_INVALID").toISOString(),
    ...(providerId ? { providerId } : {}),
  };
  return { ...base, fingerprint: stableHash(base) };
}

export function createGenerationQueueCompletion(input: Readonly<{
  executionReportHash: string;
  resultIds: readonly string[];
  outputArtifactRefs: readonly string[];
  totalEstimatedCost?: number;
  currency?: string;
  completedAt: Date;
}>): GenerationQueueCompletion {
  if (!HASH_PATTERN.test(input.executionReportHash)) throw new Error("GENERATION_QUEUE_REPORT_HASH_INVALID");
  const resultIds = referenceList(input.resultIds, "GENERATION_QUEUE_RESULT_IDS_INVALID", false);
  const outputArtifactRefs = referenceList(input.outputArtifactRefs, "GENERATION_QUEUE_OUTPUT_REFS_INVALID", false);
  if ((input.totalEstimatedCost === undefined) !== (input.currency === undefined)) {
    throw new Error("GENERATION_QUEUE_COST_CURRENCY_PAIR_REQUIRED");
  }
  if (input.totalEstimatedCost !== undefined && (!Number.isFinite(input.totalEstimatedCost) || input.totalEstimatedCost < 0)) {
    throw new Error("GENERATION_QUEUE_COST_INVALID");
  }
  if (input.currency && !SAFE_CURRENCY.test(input.currency)) throw new Error("GENERATION_QUEUE_CURRENCY_INVALID");
  const base = {
    executionReportHash: input.executionReportHash,
    resultIds,
    outputArtifactRefs,
    ...(input.totalEstimatedCost !== undefined
      ? { totalEstimatedCost: input.totalEstimatedCost, currency: input.currency! }
      : {}),
    completedAt: generationQueueDate(input.completedAt, "GENERATION_QUEUE_COMPLETED_AT_INVALID").toISOString(),
  };
  return { ...base, fingerprint: stableHash(base) };
}

export function createGenerationQueueCancellation(input: Readonly<{
  actorId: string;
  reason: string;
  cancelledAt: Date;
}>): GenerationQueueCancellation {
  const base = {
    actorId: generationQueueIdentifier(input.actorId, "GENERATION_QUEUE_ACTOR_ID_INVALID"),
    reason: boundedText(input.reason, MAX_REASON_LENGTH, "GENERATION_QUEUE_CANCELLATION_REASON_INVALID"),
    cancelledAt: generationQueueDate(input.cancelledAt, "GENERATION_QUEUE_CANCELLED_AT_INVALID").toISOString(),
  };
  return { ...base, fingerprint: stableHash(base) };
}

export function createGenerationQueueBlock(input: Readonly<{
  codes: readonly string[];
  message: string;
  blockedAt: Date;
}>): GenerationQueueBlock {
  const codes = referenceList(input.codes, "GENERATION_QUEUE_BLOCK_CODES_INVALID", false);
  for (const code of codes) if (!SAFE_CODE.test(code)) throw new Error("GENERATION_QUEUE_BLOCK_CODE_INVALID");
  const base = {
    codes,
    message: boundedText(input.message, MAX_FAILURE_MESSAGE_LENGTH, "GENERATION_QUEUE_BLOCK_MESSAGE_INVALID"),
    blockedAt: generationQueueDate(input.blockedAt, "GENERATION_QUEUE_BLOCKED_AT_INVALID").toISOString(),
  };
  return { ...base, fingerprint: stableHash(base) };
}

function assertFingerprint(actual: string, base: unknown, code: string): void {
  if (!HASH_PATTERN.test(actual) || actual !== stableHash(base)) throw new Error(code);
}

function validateFailure(value: GenerationQueueFailure): void {
  const base = {
    code: value.code,
    message: value.message,
    retryable: value.retryable,
    occurredAt: value.occurredAt,
    ...(value.providerId ? { providerId: value.providerId } : {}),
  };
  createGenerationQueueFailure({
    code: value.code,
    message: value.message,
    retryable: value.retryable,
    ...(value.providerId ? { providerId: value.providerId } : {}),
    occurredAt: new Date(value.occurredAt),
  });
  assertFingerprint(value.fingerprint, base, "GENERATION_QUEUE_FAILURE_FINGERPRINT_INVALID");
}

function validateCompletion(value: GenerationQueueCompletion): void {
  const base = {
    executionReportHash: value.executionReportHash,
    resultIds: value.resultIds,
    outputArtifactRefs: value.outputArtifactRefs,
    ...(value.totalEstimatedCost !== undefined
      ? { totalEstimatedCost: value.totalEstimatedCost, currency: value.currency! }
      : {}),
    completedAt: value.completedAt,
  };
  createGenerationQueueCompletion({
    executionReportHash: value.executionReportHash,
    resultIds: value.resultIds,
    outputArtifactRefs: value.outputArtifactRefs,
    ...(value.totalEstimatedCost !== undefined
      ? { totalEstimatedCost: value.totalEstimatedCost, currency: value.currency }
      : {}),
    completedAt: new Date(value.completedAt),
  });
  assertFingerprint(value.fingerprint, base, "GENERATION_QUEUE_COMPLETION_FINGERPRINT_INVALID");
}

function validateCancellation(value: GenerationQueueCancellation): void {
  const base = { actorId: value.actorId, reason: value.reason, cancelledAt: value.cancelledAt };
  createGenerationQueueCancellation({
    actorId: value.actorId,
    reason: value.reason,
    cancelledAt: new Date(value.cancelledAt),
  });
  assertFingerprint(value.fingerprint, base, "GENERATION_QUEUE_CANCELLATION_FINGERPRINT_INVALID");
}

function validateBlock(value: GenerationQueueBlock): void {
  const base = { codes: value.codes, message: value.message, blockedAt: value.blockedAt };
  createGenerationQueueBlock({
    codes: value.codes,
    message: value.message,
    blockedAt: new Date(value.blockedAt),
  });
  assertFingerprint(value.fingerprint, base, "GENERATION_QUEUE_BLOCK_FINGERPRINT_INVALID");
}

export function assertGenerationQueueItem(item: GenerationQueueItem, entityId: string): void {
  if (item.schemaVersion !== GENERATION_QUEUE_SCHEMA_VERSION) throw new Error("GENERATION_QUEUE_SCHEMA_UNSUPPORTED");
  if (!QUEUE_STATUSES.has(item.status)) throw new Error("GENERATION_QUEUE_STATUS_INVALID");
  if (item.id !== entityId || generationQueueEntityId(item.jobId) !== entityId) {
    throw new Error("GENERATION_QUEUE_ENTITY_MISMATCH");
  }
  validateGenerationJob(item.job);
  if (item.projectId !== item.job.projectId || item.segmentId !== item.job.segmentId || item.jobId !== item.job.id) {
    throw new Error("GENERATION_QUEUE_JOB_SCOPE_MISMATCH");
  }
  if (item.idempotencyKey !== generationQueueIdempotencyKey(item.job)) {
    throw new Error("GENERATION_QUEUE_IDEMPOTENCY_KEY_INVALID");
  }
  generationQueueInteger(item.priority, 0, 100, "GENERATION_QUEUE_PRIORITY_INVALID");
  generationQueueInteger(item.attempt, 0, 100, "GENERATION_QUEUE_ATTEMPT_INVALID");
  generationQueueInteger(item.maxAttempts, 1, 20, "GENERATION_QUEUE_MAX_ATTEMPTS_INVALID");
  if (item.attempt > item.maxAttempts) throw new Error("GENERATION_QUEUE_ATTEMPT_OVERFLOW");
  for (const [value, code] of [
    [item.availableAt, "GENERATION_QUEUE_AVAILABLE_AT_INVALID"],
    [item.createdAt, "GENERATION_QUEUE_CREATED_AT_INVALID"],
    [item.updatedAt, "GENERATION_QUEUE_UPDATED_AT_INVALID"],
  ] as const) {
    if (!validDate(value)) throw new Error(code);
  }
  if (Date.parse(item.updatedAt) < Date.parse(item.createdAt)) {
    throw new Error("GENERATION_QUEUE_TIMESTAMP_ORDER_INVALID");
  }

  if (item.status === "leased") {
    if (!item.lease) throw new Error("GENERATION_QUEUE_LEASE_MISSING");
    generationQueueIdentifier(item.lease.workerId, "GENERATION_QUEUE_WORKER_ID_INVALID");
    if (!HASH_PATTERN.test(item.lease.tokenHash)) throw new Error("GENERATION_QUEUE_LEASE_TOKEN_HASH_INVALID");
    for (const value of [item.lease.acquiredAt, item.lease.heartbeatAt, item.lease.expiresAt]) {
      if (!validDate(value)) throw new Error("GENERATION_QUEUE_LEASE_DATE_INVALID");
    }
    const acquiredAt = Date.parse(item.lease.acquiredAt);
    const heartbeatAt = Date.parse(item.lease.heartbeatAt);
    const expiresAt = Date.parse(item.lease.expiresAt);
    if (acquiredAt > heartbeatAt || heartbeatAt >= expiresAt) {
      throw new Error("GENERATION_QUEUE_LEASE_DATE_ORDER_INVALID");
    }
  } else if (item.lease) {
    throw new Error("GENERATION_QUEUE_LEASE_STATUS_INVALID");
  }

  if (item.completion) validateCompletion(item.completion);
  if ((item.status === "completed") !== Boolean(item.completion)) {
    throw new Error("GENERATION_QUEUE_COMPLETION_STATUS_INVALID");
  }
  if (item.cancellation) validateCancellation(item.cancellation);
  if ((item.status === "cancelled") !== Boolean(item.cancellation)) {
    throw new Error("GENERATION_QUEUE_CANCELLATION_STATUS_INVALID");
  }
  if (item.block) validateBlock(item.block);
  if ((item.status === "blocked") !== Boolean(item.block)) {
    throw new Error("GENERATION_QUEUE_BLOCK_STATUS_INVALID");
  }
  if (item.lastFailure) validateFailure(item.lastFailure);
  if ((item.status === "failed" || item.status === "retry-wait") && !item.lastFailure) {
    throw new Error("GENERATION_QUEUE_FAILURE_MISSING");
  }
}
