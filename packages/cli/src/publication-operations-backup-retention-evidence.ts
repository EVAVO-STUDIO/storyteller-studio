import { stableHash } from "@evavo/storyteller-engine";

export const PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_INTENT_SCHEMA_VERSION =
  "storyteller-publication-operations-backup-retention-apply-intent-v2" as const;
export const PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_FAILURE_SCHEMA_VERSION =
  "storyteller-publication-operations-backup-retention-apply-failure-v2" as const;
export const PUBLICATION_OPERATIONS_BACKUP_RETENTION_LEGACY_APPLY_INTENT_SCHEMA_VERSION =
  "storyteller-publication-operations-backup-retention-apply-intent-v1" as const;
export const PUBLICATION_OPERATIONS_BACKUP_RETENTION_LEGACY_APPLY_FAILURE_SCHEMA_VERSION =
  "storyteller-publication-operations-backup-retention-apply-failure-v1" as const;

export interface PublicationOperationsBackupRetentionApplyIntent {
  schemaVersion:
    typeof PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_INTENT_SCHEMA_VERSION;
  status: "applying";
  operationId: string;
  actorId: string;
  startedAt: string;
  applicationRevision: string;
  expectedPlanFingerprint: string;
  backupState: "inspection-required-until-completed";
  fingerprint: string;
}

export interface PublicationOperationsBackupRetentionApplyFailure {
  schemaVersion:
    typeof PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_FAILURE_SCHEMA_VERSION;
  status: "failed";
  operationId: string;
  actorId: string;
  startedAt: string;
  failedAt: string;
  applicationRevision: string;
  expectedPlanFingerprint: string;
  intentFingerprint: string;
  errorCode: string;
  backupState: "inspection-required";
  fingerprint: string;
}

export interface CreatePublicationOperationsBackupRetentionApplyIntentInput {
  operationId: string;
  actorId: string;
  startedAt: Date;
  applicationRevision: string;
  expectedPlanFingerprint: string;
}

export interface CreatePublicationOperationsBackupRetentionApplyFailureInput {
  intent: PublicationOperationsBackupRetentionApplyIntent;
  failedAt: Date;
  errorCode: string;
}

export class PublicationOperationsBackupRetentionEvidenceError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PublicationOperationsBackupRetentionEvidenceError";
    this.code = code;
  }
}

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const APPLICATION_REVISION_PATTERN = /^[a-f0-9]{40}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]*$/u;
const UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

function requireRecord(
  value: unknown,
  code: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PublicationOperationsBackupRetentionEvidenceError(code);
  }
  return value as Record<string, unknown>;
}

function requireString(
  value: unknown,
  pattern: RegExp,
  code: string,
): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new PublicationOperationsBackupRetentionEvidenceError(code);
  }
  return value;
}

function requireExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort((left, right) =>
    left.localeCompare(right, "en-AU")
  );
  const sortedExpected = [...expected].sort((left, right) =>
    left.localeCompare(right, "en-AU")
  );
  if (stableHash(actual) !== stableHash(sortedExpected)) {
    throw new PublicationOperationsBackupRetentionEvidenceError(code);
  }
}

function requireCanonicalDate(value: unknown, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new PublicationOperationsBackupRetentionEvidenceError(code);
  }
  const parsed = new Date(value);
  if (parsed.toISOString() !== value) {
    throw new PublicationOperationsBackupRetentionEvidenceError(code);
  }
  return value;
}

function requireDate(value: Date, code: string): string {
  if (Number.isNaN(value.getTime())) {
    throw new PublicationOperationsBackupRetentionEvidenceError(code);
  }
  return value.toISOString();
}

function intentFingerprint(
  value: Omit<PublicationOperationsBackupRetentionApplyIntent, "fingerprint">,
): string {
  return stableHash(value);
}

function failureFingerprint(
  value: Omit<PublicationOperationsBackupRetentionApplyFailure, "fingerprint">,
): string {
  return stableHash(value);
}

export function createPublicationOperationsBackupRetentionApplyIntent(
  input: CreatePublicationOperationsBackupRetentionApplyIntentInput,
): PublicationOperationsBackupRetentionApplyIntent {
  const partial: Omit<
    PublicationOperationsBackupRetentionApplyIntent,
    "fingerprint"
  > = {
    schemaVersion:
      PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_INTENT_SCHEMA_VERSION,
    status: "applying",
    operationId: requireString(
      input.operationId,
      UUID_PATTERN,
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_OPERATION_ID_INVALID",
    ),
    actorId: requireString(
      input.actorId,
      SAFE_IDENTIFIER,
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_ACTOR_ID_INVALID",
    ),
    startedAt: requireDate(
      input.startedAt,
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_STARTED_AT_INVALID",
    ),
    applicationRevision: requireString(
      input.applicationRevision,
      APPLICATION_REVISION_PATTERN,
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLICATION_REVISION_INVALID",
    ),
    expectedPlanFingerprint: requireString(
      input.expectedPlanFingerprint,
      HASH_PATTERN,
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_HASH_INVALID",
    ),
    backupState: "inspection-required-until-completed",
  };
  return Object.freeze({
    ...partial,
    fingerprint: intentFingerprint(partial),
  });
}

export function assertPublicationOperationsBackupRetentionApplyIntent(
  value: unknown,
): PublicationOperationsBackupRetentionApplyIntent {
  const record = requireRecord(
    value,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_INTENT_INVALID",
  );
  requireExactKeys(record, [
    "schemaVersion",
    "status",
    "operationId",
    "actorId",
    "startedAt",
    "applicationRevision",
    "expectedPlanFingerprint",
    "backupState",
    "fingerprint",
  ], "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_INTENT_INVALID");
  const candidate =
    record as unknown as PublicationOperationsBackupRetentionApplyIntent;
  if (
    candidate.schemaVersion
      !== PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_INTENT_SCHEMA_VERSION
    || candidate.status !== "applying"
    || candidate.backupState !== "inspection-required-until-completed"
  ) {
    throw new PublicationOperationsBackupRetentionEvidenceError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_INTENT_INVALID",
    );
  }
  requireString(
    candidate.operationId,
    UUID_PATTERN,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_OPERATION_ID_INVALID",
  );
  requireString(
    candidate.actorId,
    SAFE_IDENTIFIER,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_ACTOR_ID_INVALID",
  );
  requireCanonicalDate(
    candidate.startedAt,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_STARTED_AT_INVALID",
  );
  requireString(
    candidate.applicationRevision,
    APPLICATION_REVISION_PATTERN,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLICATION_REVISION_INVALID",
  );
  requireString(
    candidate.expectedPlanFingerprint,
    HASH_PATTERN,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_HASH_INVALID",
  );
  requireString(
    candidate.fingerprint,
    HASH_PATTERN,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_INTENT_FINGERPRINT_INVALID",
  );
  const { fingerprint, ...partial } = candidate;
  if (intentFingerprint(partial) !== fingerprint) {
    throw new PublicationOperationsBackupRetentionEvidenceError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_INTENT_FINGERPRINT_MISMATCH",
    );
  }
  return Object.freeze(candidate);
}

export function createPublicationOperationsBackupRetentionApplyFailure(
  input: CreatePublicationOperationsBackupRetentionApplyFailureInput,
): PublicationOperationsBackupRetentionApplyFailure {
  const intent = assertPublicationOperationsBackupRetentionApplyIntent(
    input.intent,
  );
  const failedAt = requireDate(
    input.failedAt,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_FAILED_AT_INVALID",
  );
  if (Date.parse(failedAt) < Date.parse(intent.startedAt)) {
    throw new PublicationOperationsBackupRetentionEvidenceError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_FAILED_AT_INVALID",
    );
  }
  const partial: Omit<
    PublicationOperationsBackupRetentionApplyFailure,
    "fingerprint"
  > = {
    schemaVersion:
      PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_FAILURE_SCHEMA_VERSION,
    status: "failed",
    operationId: intent.operationId,
    actorId: intent.actorId,
    startedAt: intent.startedAt,
    failedAt,
    applicationRevision: intent.applicationRevision,
    expectedPlanFingerprint: intent.expectedPlanFingerprint,
    intentFingerprint: intent.fingerprint,
    errorCode: requireString(
      input.errorCode,
      SAFE_ERROR_CODE,
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_ERROR_CODE_INVALID",
    ),
    backupState: "inspection-required",
  };
  return Object.freeze({
    ...partial,
    fingerprint: failureFingerprint(partial),
  });
}

export function assertPublicationOperationsBackupRetentionApplyFailure(
  value: unknown,
): PublicationOperationsBackupRetentionApplyFailure {
  const record = requireRecord(
    value,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_FAILURE_INVALID",
  );
  requireExactKeys(record, [
    "schemaVersion",
    "status",
    "operationId",
    "actorId",
    "startedAt",
    "failedAt",
    "applicationRevision",
    "expectedPlanFingerprint",
    "intentFingerprint",
    "errorCode",
    "backupState",
    "fingerprint",
  ], "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_FAILURE_INVALID");
  const candidate =
    record as unknown as PublicationOperationsBackupRetentionApplyFailure;
  if (
    candidate.schemaVersion
      !== PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_FAILURE_SCHEMA_VERSION
    || candidate.status !== "failed"
    || candidate.backupState !== "inspection-required"
  ) {
    throw new PublicationOperationsBackupRetentionEvidenceError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_FAILURE_INVALID",
    );
  }
  requireString(
    candidate.operationId,
    UUID_PATTERN,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_OPERATION_ID_INVALID",
  );
  requireString(
    candidate.actorId,
    SAFE_IDENTIFIER,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_ACTOR_ID_INVALID",
  );
  requireCanonicalDate(
    candidate.startedAt,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_STARTED_AT_INVALID",
  );
  requireCanonicalDate(
    candidate.failedAt,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_FAILED_AT_INVALID",
  );
  if (Date.parse(candidate.failedAt) < Date.parse(candidate.startedAt)) {
    throw new PublicationOperationsBackupRetentionEvidenceError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_FAILED_AT_INVALID",
    );
  }
  requireString(
    candidate.applicationRevision,
    APPLICATION_REVISION_PATTERN,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLICATION_REVISION_INVALID",
  );
  requireString(
    candidate.expectedPlanFingerprint,
    HASH_PATTERN,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_HASH_INVALID",
  );
  requireString(
    candidate.intentFingerprint,
    HASH_PATTERN,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_INTENT_FINGERPRINT_INVALID",
  );
  const reconstructedIntent = {
    schemaVersion:
      PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_INTENT_SCHEMA_VERSION,
    status: "applying" as const,
    operationId: candidate.operationId,
    actorId: candidate.actorId,
    startedAt: candidate.startedAt,
    applicationRevision: candidate.applicationRevision,
    expectedPlanFingerprint: candidate.expectedPlanFingerprint,
    backupState: "inspection-required-until-completed" as const,
  };
  if (intentFingerprint(reconstructedIntent) !== candidate.intentFingerprint) {
    throw new PublicationOperationsBackupRetentionEvidenceError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_FAILURE_INTENT_MISMATCH",
    );
  }
  requireString(
    candidate.errorCode,
    SAFE_ERROR_CODE,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_ERROR_CODE_INVALID",
  );
  requireString(
    candidate.fingerprint,
    HASH_PATTERN,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_FAILURE_FINGERPRINT_INVALID",
  );
  const { fingerprint, ...partial } = candidate;
  if (failureFingerprint(partial) !== fingerprint) {
    throw new PublicationOperationsBackupRetentionEvidenceError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_FAILURE_FINGERPRINT_MISMATCH",
    );
  }
  return Object.freeze(candidate);
}
