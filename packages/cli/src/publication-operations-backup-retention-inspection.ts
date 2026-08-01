import {
  lstat,
  readFile,
  readdir,
  realpath,
} from "node:fs/promises";
import {
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { stableHash } from "@evavo/storyteller-engine";
import {
  verifyPublicationOperationsBackupSnapshot,
  type PublicationOperationsBackupVerificationResult,
} from "./publication-operations-backup.js";
import {
  assertPublicationOperationsBackupRetentionPlan,
  assertPublicationOperationsBackupRetentionResult,
  PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_SCHEMA_VERSION,
  type PublicationOperationsBackupRetentionPlan,
  type PublicationOperationsBackupRetentionResult,
  type PublicationOperationsBackupRetentionSnapshot,
} from "./publication-operations-backup-retention.js";
import {
  assertPublicationOperationsBackupRetentionApplyFailure,
  assertPublicationOperationsBackupRetentionApplyIntent,
  PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_FAILURE_SCHEMA_VERSION,
  PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_INTENT_SCHEMA_VERSION,
  PUBLICATION_OPERATIONS_BACKUP_RETENTION_LEGACY_APPLY_FAILURE_SCHEMA_VERSION,
  PUBLICATION_OPERATIONS_BACKUP_RETENTION_LEGACY_APPLY_INTENT_SCHEMA_VERSION,
  type PublicationOperationsBackupRetentionApplyFailure,
  type PublicationOperationsBackupRetentionApplyIntent,
} from "./publication-operations-backup-retention-evidence.js";

export const PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_SCHEMA_VERSION =
  "storyteller-publication-operations-backup-retention-inspection-v1" as const;

export type PublicationOperationsBackupRetentionInspectionStatus =
  | "verified-complete"
  | "verified-complete-recovered"
  | "verified-no-mutation"
  | "inspection-required";

export type PublicationOperationsBackupRetentionInspectionNextAction =
  | "retain-evidence-and-resume-services"
  | "retain-recovery-inspection-and-resume-services"
  | "create-new-plan-before-any-retry"
  | "keep-services-stopped-and-inspect-manually";

export type PublicationOperationsBackupRetentionApplyEvidenceTrust =
  | "fingerprinted"
  | "legacy-unfingerprinted";

export interface PublicationOperationsBackupRetentionInspectionIssue {
  code: string;
  entryName?: string;
  snapshotId?: string;
}

export interface PublicationOperationsBackupRetentionInspectionResult {
  schemaVersion:
    typeof PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_SCHEMA_VERSION;
  status: PublicationOperationsBackupRetentionInspectionStatus;
  inspectedAt: string;
  applicationRevision: string;
  planFingerprint: string;
  applyEvidenceFingerprint: string;
  inventoryFingerprint: string;
  applyEvidenceStatus: "applying" | "failed" | "pruned" | "unchanged";
  applyEvidenceTrust: PublicationOperationsBackupRetentionApplyEvidenceTrust;
  normalServicesMayRestart: boolean;
  nextAction: PublicationOperationsBackupRetentionInspectionNextAction;
  canonicalSnapshotIds: readonly string[];
  pruningSnapshotIds: readonly string[];
  missingRetainedSnapshotIds: readonly string[];
  remainingDeletionCandidateIds: readonly string[];
  missingDeletionCandidateIds: readonly string[];
  unexpectedSnapshotIds: readonly string[];
  changedSnapshotIds: readonly string[];
  issues: readonly PublicationOperationsBackupRetentionInspectionIssue[];
  fingerprint: string;
}

export interface InspectPublicationOperationsBackupRetentionInput {
  backupDirectory: string;
  planReceiptPath: string;
  applyReceiptPath: string;
  applicationRevision: string;
  offlineConfirmed: true;
  inspectedAt?: Date;
  afterFirstInventory?: () => Promise<void>;
}

export class PublicationOperationsBackupRetentionInspectionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PublicationOperationsBackupRetentionInspectionError";
    this.code = code;
  }
}

interface PrivateReceipt {
  content: string;
  value: unknown;
  realPath: string;
}

interface ObservedSnapshot
  extends PublicationOperationsBackupRetentionSnapshot {
  entryName: string;
  location: "canonical" | "pruning";
}

interface BackupInventory {
  canonical: readonly ObservedSnapshot[];
  pruning: readonly ObservedSnapshot[];
  issues: readonly PublicationOperationsBackupRetentionInspectionIssue[];
  fingerprint: string;
}

interface LegacyApplyIntent {
  schemaVersion:
    typeof PUBLICATION_OPERATIONS_BACKUP_RETENTION_LEGACY_APPLY_INTENT_SCHEMA_VERSION;
  status: "applying";
  operationId: string;
  actorId: string;
  startedAt: string;
  applicationRevision: string;
  expectedPlanFingerprint: string;
  backupState: "inspection-required-until-completed";
}

interface LegacyApplyFailure {
  schemaVersion:
    typeof PUBLICATION_OPERATIONS_BACKUP_RETENTION_LEGACY_APPLY_FAILURE_SCHEMA_VERSION;
  status: "failed";
  operationId: string;
  actorId: string;
  failedAt: string;
  applicationRevision: string;
  expectedPlanFingerprint: string;
  errorCode: string;
  backupState: "inspection-required";
}

type ApplyEvidence =
  | Readonly<{
      kind: "intent";
      trust: "fingerprinted";
      value: PublicationOperationsBackupRetentionApplyIntent;
    }>
  | Readonly<{
      kind: "failure";
      trust: "fingerprinted";
      value: PublicationOperationsBackupRetentionApplyFailure;
    }>
  | Readonly<{
      kind: "intent";
      trust: "legacy-unfingerprinted";
      value: LegacyApplyIntent;
    }>
  | Readonly<{
      kind: "failure";
      trust: "legacy-unfingerprinted";
      value: LegacyApplyFailure;
    }>
  | Readonly<{
      kind: "result";
      trust: "fingerprinted";
      value: PublicationOperationsBackupRetentionResult;
    }>;

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const APPLICATION_REVISION_PATTERN = /^[a-f0-9]{40}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]*$/u;
const UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SNAPSHOT_ID_PATTERN = /^publication_backup_[a-f0-9]{24}$/u;
const PRUNING_ENTRY_PATTERN =
  /^\.(publication_backup_[a-f0-9]{24})\.[0-9]+\.pruning$/u;
const MAXIMUM_RECEIPT_BYTES = 16 * 1024 * 1024;
const MAXIMUM_BACKUP_ENTRIES = 11_000;

function requireOfflineConfirmation(value: true): void {
  if (value !== true) {
    throw new PublicationOperationsBackupRetentionInspectionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_OFFLINE_CONFIRMATION_REQUIRED",
    );
  }
}

function requireApplicationRevision(value: string): string {
  if (!APPLICATION_REVISION_PATTERN.test(value)) {
    throw new PublicationOperationsBackupRetentionInspectionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_APPLICATION_REVISION_INVALID",
    );
  }
  return value;
}

function requireDate(value: Date, code: string): Date {
  if (Number.isNaN(value.getTime())) {
    throw new PublicationOperationsBackupRetentionInspectionError(code);
  }
  return value;
}

function isContained(child: string, parent: string): boolean {
  const relation = relative(parent, child);
  return relation === ""
    || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation));
}

function requireDistinctOutsideBackupRoot(
  path: string,
  backupRoot: string,
  otherPath?: string,
): string {
  if (!path.trim()) {
    throw new PublicationOperationsBackupRetentionInspectionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_RECEIPT_PATH_INVALID",
    );
  }
  const resolved = resolve(path);
  if (isContained(resolved, backupRoot) || (otherPath && resolved === otherPath)) {
    throw new PublicationOperationsBackupRetentionInspectionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_RECEIPT_PATH_INVALID",
    );
  }
  return resolved;
}

function safeIssueCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const [candidate = ""] = message.split(":", 1);
  if (SAFE_ERROR_CODE.test(candidate)) return candidate;
  if (
    error
    && typeof error === "object"
    && "code" in error
    && typeof error.code === "string"
    && /^[A-Z0-9_]+$/u.test(error.code)
  ) {
    return `PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_FILESYSTEM_${error.code}`;
  }
  return "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_ENTRY_INVALID";
}

async function readPrivateReceipt(
  path: string,
  invalidCode: string,
): Promise<PrivateReceipt> {
  let information;
  try {
    information = await lstat(path);
  } catch {
    throw new PublicationOperationsBackupRetentionInspectionError(invalidCode);
  }
  if (
    information.isSymbolicLink()
    || !information.isFile()
    || information.size <= 0
    || information.size > MAXIMUM_RECEIPT_BYTES
    || information.nlink !== 1
    || (information.mode & 0o777) !== 0o600
  ) {
    throw new PublicationOperationsBackupRetentionInspectionError(invalidCode);
  }
  const content = await readFile(path, "utf8");
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new PublicationOperationsBackupRetentionInspectionError(invalidCode);
  }
  let resolvedRealPath: string;
  try {
    resolvedRealPath = await realpath(path);
  } catch {
    throw new PublicationOperationsBackupRetentionInspectionError(invalidCode);
  }
  return Object.freeze({ content, value, realPath: resolvedRealPath });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireLegacyString(
  value: unknown,
  pattern: RegExp,
  code: string,
): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new PublicationOperationsBackupRetentionInspectionError(code);
  }
  return value;
}

function requireLegacyDate(value: unknown, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new PublicationOperationsBackupRetentionInspectionError(code);
  }
  if (new Date(value).toISOString() !== value) {
    throw new PublicationOperationsBackupRetentionInspectionError(code);
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
    throw new PublicationOperationsBackupRetentionInspectionError(code);
  }
}

function parseLegacyIntent(value: Record<string, unknown>): LegacyApplyIntent {
  const code =
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_LEGACY_APPLY_RECEIPT_INVALID";
  requireExactKeys(value, [
    "schemaVersion",
    "status",
    "operationId",
    "actorId",
    "startedAt",
    "applicationRevision",
    "expectedPlanFingerprint",
    "backupState",
  ], code);
  if (
    value.schemaVersion
      !== PUBLICATION_OPERATIONS_BACKUP_RETENTION_LEGACY_APPLY_INTENT_SCHEMA_VERSION
    || value.status !== "applying"
    || value.backupState !== "inspection-required-until-completed"
  ) {
    throw new PublicationOperationsBackupRetentionInspectionError(code);
  }
  return Object.freeze({
    schemaVersion:
      PUBLICATION_OPERATIONS_BACKUP_RETENTION_LEGACY_APPLY_INTENT_SCHEMA_VERSION,
    status: "applying",
    operationId: requireLegacyString(value.operationId, UUID_PATTERN, code),
    actorId: requireLegacyString(value.actorId, SAFE_IDENTIFIER, code),
    startedAt: requireLegacyDate(value.startedAt, code),
    applicationRevision: requireLegacyString(
      value.applicationRevision,
      APPLICATION_REVISION_PATTERN,
      code,
    ),
    expectedPlanFingerprint: requireLegacyString(
      value.expectedPlanFingerprint,
      HASH_PATTERN,
      code,
    ),
    backupState: "inspection-required-until-completed",
  });
}

function parseLegacyFailure(value: Record<string, unknown>): LegacyApplyFailure {
  const code =
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_LEGACY_APPLY_RECEIPT_INVALID";
  requireExactKeys(value, [
    "schemaVersion",
    "status",
    "operationId",
    "actorId",
    "failedAt",
    "applicationRevision",
    "expectedPlanFingerprint",
    "errorCode",
    "backupState",
  ], code);
  if (
    value.schemaVersion
      !== PUBLICATION_OPERATIONS_BACKUP_RETENTION_LEGACY_APPLY_FAILURE_SCHEMA_VERSION
    || value.status !== "failed"
    || value.backupState !== "inspection-required"
  ) {
    throw new PublicationOperationsBackupRetentionInspectionError(code);
  }
  return Object.freeze({
    schemaVersion:
      PUBLICATION_OPERATIONS_BACKUP_RETENTION_LEGACY_APPLY_FAILURE_SCHEMA_VERSION,
    status: "failed",
    operationId: requireLegacyString(value.operationId, UUID_PATTERN, code),
    actorId: requireLegacyString(value.actorId, SAFE_IDENTIFIER, code),
    failedAt: requireLegacyDate(value.failedAt, code),
    applicationRevision: requireLegacyString(
      value.applicationRevision,
      APPLICATION_REVISION_PATTERN,
      code,
    ),
    expectedPlanFingerprint: requireLegacyString(
      value.expectedPlanFingerprint,
      HASH_PATTERN,
      code,
    ),
    errorCode: requireLegacyString(value.errorCode, SAFE_ERROR_CODE, code),
    backupState: "inspection-required",
  });
}

function parseApplyEvidence(value: unknown): ApplyEvidence {
  if (!isRecord(value)) {
    throw new PublicationOperationsBackupRetentionInspectionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_APPLY_RECEIPT_INVALID",
    );
  }
  if (
    value.schemaVersion
      === PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_INTENT_SCHEMA_VERSION
  ) {
    return Object.freeze({
      kind: "intent",
      trust: "fingerprinted",
      value: assertPublicationOperationsBackupRetentionApplyIntent(value),
    });
  }
  if (
    value.schemaVersion
      === PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_FAILURE_SCHEMA_VERSION
  ) {
    return Object.freeze({
      kind: "failure",
      trust: "fingerprinted",
      value: assertPublicationOperationsBackupRetentionApplyFailure(value),
    });
  }
  if (
    value.schemaVersion
      === PUBLICATION_OPERATIONS_BACKUP_RETENTION_LEGACY_APPLY_INTENT_SCHEMA_VERSION
  ) {
    return Object.freeze({
      kind: "intent",
      trust: "legacy-unfingerprinted",
      value: parseLegacyIntent(value),
    });
  }
  if (
    value.schemaVersion
      === PUBLICATION_OPERATIONS_BACKUP_RETENTION_LEGACY_APPLY_FAILURE_SCHEMA_VERSION
  ) {
    return Object.freeze({
      kind: "failure",
      trust: "legacy-unfingerprinted",
      value: parseLegacyFailure(value),
    });
  }
  if (
    value.schemaVersion
      === PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_SCHEMA_VERSION
  ) {
    return Object.freeze({
      kind: "result",
      trust: "fingerprinted",
      value: assertPublicationOperationsBackupRetentionResult(value),
    });
  }
  throw new PublicationOperationsBackupRetentionInspectionError(
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_APPLY_RECEIPT_INVALID",
  );
}

function snapshotFromVerification(
  entryName: string,
  location: "canonical" | "pruning",
  value: PublicationOperationsBackupVerificationResult,
): ObservedSnapshot {
  return Object.freeze({
    entryName,
    location,
    snapshotId: value.snapshotId,
    createdAt: value.createdAt,
    totalBytes: value.totalBytes,
    fingerprint: value.fingerprint,
  });
}

async function inventoryBackupRoot(
  backupDirectory: string,
): Promise<BackupInventory> {
  const root = resolve(backupDirectory);
  let rootInformation;
  try {
    rootInformation = await lstat(root);
  } catch {
    throw new PublicationOperationsBackupRetentionInspectionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_DIRECTORY_INVALID",
    );
  }
  if (rootInformation.isSymbolicLink() || !rootInformation.isDirectory()) {
    throw new PublicationOperationsBackupRetentionInspectionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_DIRECTORY_INVALID",
    );
  }
  const entries = await readdir(root, { withFileTypes: true });
  if (entries.length > MAXIMUM_BACKUP_ENTRIES) {
    throw new PublicationOperationsBackupRetentionInspectionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_ENTRY_LIMIT_EXCEEDED",
    );
  }
  entries.sort((left, right) => left.name.localeCompare(right.name, "en-AU"));
  const canonical: ObservedSnapshot[] = [];
  const pruning: ObservedSnapshot[] = [];
  const issues: PublicationOperationsBackupRetentionInspectionIssue[] = [];

  for (const entry of entries) {
    const path = join(root, entry.name);
    let information;
    try {
      information = await lstat(path);
    } catch (error) {
      issues.push(Object.freeze({
        code: safeIssueCode(error),
        entryName: entry.name,
      }));
      continue;
    }
    if (information.isSymbolicLink()) {
      issues.push(Object.freeze({
        code:
          "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_SYMLINK_FORBIDDEN",
        entryName: entry.name,
      }));
      continue;
    }
    const canonicalMatch = SNAPSHOT_ID_PATTERN.test(entry.name);
    const pruningMatch = PRUNING_ENTRY_PATTERN.exec(entry.name);
    if ((!canonicalMatch && !pruningMatch) || !information.isDirectory()) {
      issues.push(Object.freeze({
        code:
          "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_ROOT_LAYOUT_INVALID",
        entryName: entry.name,
      }));
      continue;
    }
    try {
      const verified = await verifyPublicationOperationsBackupSnapshot(path);
      if (
        (canonicalMatch && verified.snapshotId !== entry.name)
        || (pruningMatch && verified.snapshotId !== pruningMatch[1])
      ) {
        issues.push(Object.freeze({
          code:
            "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_SNAPSHOT_SCOPE_INVALID",
          entryName: entry.name,
          snapshotId: verified.snapshotId,
        }));
        continue;
      }
      const observed = snapshotFromVerification(
        entry.name,
        canonicalMatch ? "canonical" : "pruning",
        verified,
      );
      if (canonicalMatch) canonical.push(observed);
      else pruning.push(observed);
    } catch (error) {
      issues.push(Object.freeze({
        code: safeIssueCode(error),
        entryName: entry.name,
        ...(pruningMatch ? { snapshotId: pruningMatch[1] } : {}),
      }));
    }
  }

  const partial = Object.freeze({
    canonical: Object.freeze(canonical),
    pruning: Object.freeze(pruning),
    issues: Object.freeze(issues),
  });
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
}

function snapshotsMatch(
  observed: ObservedSnapshot,
  planned: PublicationOperationsBackupRetentionSnapshot,
): boolean {
  return observed.snapshotId === planned.snapshotId
    && observed.createdAt === planned.createdAt
    && observed.totalBytes === planned.totalBytes
    && observed.fingerprint === planned.fingerprint;
}

function compareIds(left: string, right: string): number {
  return left.localeCompare(right, "en-AU");
}

function applyEvidenceTimestamp(evidence: ApplyEvidence): string {
  if (evidence.kind === "result") return evidence.value.prunedAt;
  return evidence.kind === "intent"
    ? evidence.value.startedAt
    : evidence.value.failedAt;
}

function applyEvidenceFingerprint(evidence: ApplyEvidence): string {
  return evidence.trust === "fingerprinted"
    ? evidence.value.fingerprint
    : stableHash(evidence.value);
}

function crossValidateEvidence(
  plan: PublicationOperationsBackupRetentionPlan,
  evidence: ApplyEvidence,
): void {
  if (evidence.kind === "result") {
    const result = evidence.value;
    if (
      result.planFingerprint !== plan.fingerprint
      || result.applicationRevision !== plan.applicationRevision
      || result.retainedCount !== plan.retained.length
      || result.deletedCount !== plan.delete.length
      || result.reclaimedBytes !== plan.reclaimableBytes
      || stableHash(result.deletedSnapshotIds)
        !== stableHash(plan.delete.map((snapshot) => snapshot.snapshotId))
      || Date.parse(result.prunedAt) < Date.parse(plan.evaluatedAt)
    ) {
      throw new PublicationOperationsBackupRetentionInspectionError(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_APPLY_RECEIPT_MISMATCH",
      );
    }
    return;
  }
  if (
    evidence.value.expectedPlanFingerprint !== plan.fingerprint
    || evidence.value.applicationRevision !== plan.applicationRevision
  ) {
    throw new PublicationOperationsBackupRetentionInspectionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_APPLY_RECEIPT_MISMATCH",
    );
  }
  const evidenceAt = evidence.kind === "intent"
    ? evidence.value.startedAt
    : evidence.value.failedAt;
  if (Date.parse(evidenceAt) < Date.parse(plan.evaluatedAt)) {
    throw new PublicationOperationsBackupRetentionInspectionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_APPLY_RECEIPT_MISMATCH",
    );
  }
}

function inspectionFingerprint(
  value: Omit<PublicationOperationsBackupRetentionInspectionResult, "fingerprint">,
): string {
  return stableHash(value);
}

export async function inspectPublicationOperationsBackupRetention(
  input: InspectPublicationOperationsBackupRetentionInput,
): Promise<PublicationOperationsBackupRetentionInspectionResult> {
  requireOfflineConfirmation(input.offlineConfirmed);
  const applicationRevision = requireApplicationRevision(
    input.applicationRevision,
  );
  const inspectedAt = requireDate(
    input.inspectedAt ?? new Date(),
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_DATE_INVALID",
  );
  if (!input.backupDirectory.trim()) {
    throw new PublicationOperationsBackupRetentionInspectionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_DIRECTORY_INVALID",
    );
  }
  const backupRoot = resolve(input.backupDirectory);
  let backupRealRoot: string;
  try {
    backupRealRoot = await realpath(backupRoot);
  } catch {
    throw new PublicationOperationsBackupRetentionInspectionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_DIRECTORY_INVALID",
    );
  }
  const planReceiptPath = requireDistinctOutsideBackupRoot(
    input.planReceiptPath,
    backupRoot,
  );
  const applyReceiptPath = requireDistinctOutsideBackupRoot(
    input.applyReceiptPath,
    backupRoot,
    planReceiptPath,
  );
  const planReceipt = await readPrivateReceipt(
    planReceiptPath,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_PLAN_RECEIPT_INVALID",
  );
  const applyReceipt = await readPrivateReceipt(
    applyReceiptPath,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_APPLY_RECEIPT_INVALID",
  );
  if (
    isContained(planReceipt.realPath, backupRealRoot)
    || isContained(applyReceipt.realPath, backupRealRoot)
    || planReceipt.realPath === applyReceipt.realPath
  ) {
    throw new PublicationOperationsBackupRetentionInspectionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_RECEIPT_PATH_INVALID",
    );
  }
  const plan = assertPublicationOperationsBackupRetentionPlan(planReceipt.value);
  const evidence = parseApplyEvidence(applyReceipt.value);
  if (
    plan.applicationRevision !== applicationRevision
    || inspectedAt.getTime() < Date.parse(plan.evaluatedAt)
  ) {
    throw new PublicationOperationsBackupRetentionInspectionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_SCOPE_INVALID",
    );
  }
  crossValidateEvidence(plan, evidence);
  if (inspectedAt.getTime() < Date.parse(applyEvidenceTimestamp(evidence))) {
    throw new PublicationOperationsBackupRetentionInspectionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_SCOPE_INVALID",
    );
  }

  const firstInventory = await inventoryBackupRoot(backupRoot);
  await input.afterFirstInventory?.();
  const secondInventory = await inventoryBackupRoot(backupRoot);
  if (firstInventory.fingerprint !== secondInventory.fingerprint) {
    throw new PublicationOperationsBackupRetentionInspectionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_STATE_CHANGED",
    );
  }
  const finalPlanReceipt = await readPrivateReceipt(
    planReceiptPath,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_PLAN_RECEIPT_INVALID",
  );
  const finalApplyReceipt = await readPrivateReceipt(
    applyReceiptPath,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_APPLY_RECEIPT_INVALID",
  );
  if (
    finalPlanReceipt.content !== planReceipt.content
    || finalApplyReceipt.content !== applyReceipt.content
  ) {
    throw new PublicationOperationsBackupRetentionInspectionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_EVIDENCE_CHANGED",
    );
  }

  const inventory = secondInventory;
  const plannedSnapshots = new Map<string, PublicationOperationsBackupRetentionSnapshot>([
    ...plan.retained.map((snapshot) => [snapshot.snapshotId, snapshot] as const),
    ...plan.delete.map((snapshot) => [snapshot.snapshotId, snapshot] as const),
  ]);
  const retainedIds = new Set(plan.retained.map((snapshot) => snapshot.snapshotId));
  const deleteIds = new Set(plan.delete.map((snapshot) => snapshot.snapshotId));
  const canonical = new Map(inventory.canonical.map((snapshot) => [
    snapshot.snapshotId,
    snapshot,
  ]));
  const pruning = new Map(inventory.pruning.map((snapshot) => [
    snapshot.snapshotId,
    snapshot,
  ]));
  const changedSnapshotIds = new Set<string>();
  const issues = [...inventory.issues];
  const locationCounts = new Map<string, number>();
  for (const snapshot of [...inventory.canonical, ...inventory.pruning]) {
    locationCounts.set(
      snapshot.snapshotId,
      (locationCounts.get(snapshot.snapshotId) ?? 0) + 1,
    );
  }
  for (const [snapshotId, count] of locationCounts) {
    if (count > 1) {
      issues.push(Object.freeze({
        code:
          "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_DUPLICATE_SNAPSHOT_LOCATION",
        snapshotId,
      }));
    }
  }

  for (const snapshot of [...inventory.canonical, ...inventory.pruning]) {
    const planned = plannedSnapshots.get(snapshot.snapshotId);
    if (planned && !snapshotsMatch(snapshot, planned)) {
      changedSnapshotIds.add(snapshot.snapshotId);
    }
  }

  const missingRetainedSnapshotIds = [...retainedIds]
    .filter((snapshotId) => !canonical.has(snapshotId))
    .sort(compareIds);
  const remainingDeletionCandidateIds = [...deleteIds]
    .filter((snapshotId) => canonical.has(snapshotId))
    .sort(compareIds);
  const missingDeletionCandidateIds = [...deleteIds]
    .filter((snapshotId) => !canonical.has(snapshotId) && !pruning.has(snapshotId))
    .sort(compareIds);
  const unexpectedSnapshotIds = [...new Set([
    ...inventory.canonical,
    ...inventory.pruning,
  ].map((snapshot) => snapshot.snapshotId))]
    .filter((snapshotId) => !plannedSnapshots.has(snapshotId))
    .sort(compareIds);
  const pruningSnapshotIds = [...pruning.keys()].sort(compareIds);
  const canonicalSnapshotIds = [...canonical.keys()].sort(compareIds);
  const changedIds = [...changedSnapshotIds].sort(compareIds);
  const sortedIssues = issues.sort((left, right) => {
    const byCode = left.code.localeCompare(right.code, "en-AU");
    if (byCode !== 0) return byCode;
    const byEntry = (left.entryName ?? "").localeCompare(
      right.entryName ?? "",
      "en-AU",
    );
    if (byEntry !== 0) return byEntry;
    return (left.snapshotId ?? "").localeCompare(
      right.snapshotId ?? "",
      "en-AU",
    );
  });

  const noStructuralIssues = sortedIssues.length === 0
    && pruningSnapshotIds.length === 0
    && changedIds.length === 0;
  const allPlannedCanonical = [...plannedSnapshots.keys()].every(
    (snapshotId) => canonical.has(snapshotId),
  );
  const exactTargetState = noStructuralIssues
    && missingRetainedSnapshotIds.length === 0
    && remainingDeletionCandidateIds.length === 0
    && unexpectedSnapshotIds.length === 0;
  const noMutationState = noStructuralIssues && allPlannedCanonical;

  let status: PublicationOperationsBackupRetentionInspectionStatus =
    "inspection-required";
  if (evidence.kind === "result" && exactTargetState) {
    status = "verified-complete";
  } else if (evidence.kind !== "result" && exactTargetState) {
    status = "verified-complete-recovered";
  } else if (evidence.kind !== "result" && noMutationState) {
    status = "verified-no-mutation";
  }

  const normalServicesMayRestart = status !== "inspection-required";
  const nextAction: PublicationOperationsBackupRetentionInspectionNextAction =
    status === "verified-complete"
      ? "retain-evidence-and-resume-services"
      : status === "verified-complete-recovered"
        ? "retain-recovery-inspection-and-resume-services"
        : status === "verified-no-mutation"
          ? "create-new-plan-before-any-retry"
          : "keep-services-stopped-and-inspect-manually";
  const partial: Omit<
    PublicationOperationsBackupRetentionInspectionResult,
    "fingerprint"
  > = {
    schemaVersion:
      PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_SCHEMA_VERSION,
    status,
    inspectedAt: inspectedAt.toISOString(),
    applicationRevision,
    planFingerprint: plan.fingerprint,
    applyEvidenceFingerprint: applyEvidenceFingerprint(evidence),
    inventoryFingerprint: inventory.fingerprint,
    applyEvidenceStatus: evidence.value.status,
    applyEvidenceTrust: evidence.trust,
    normalServicesMayRestart,
    nextAction,
    canonicalSnapshotIds: Object.freeze(canonicalSnapshotIds),
    pruningSnapshotIds: Object.freeze(pruningSnapshotIds),
    missingRetainedSnapshotIds: Object.freeze(missingRetainedSnapshotIds),
    remainingDeletionCandidateIds: Object.freeze(
      remainingDeletionCandidateIds,
    ),
    missingDeletionCandidateIds: Object.freeze(missingDeletionCandidateIds),
    unexpectedSnapshotIds: Object.freeze(unexpectedSnapshotIds),
    changedSnapshotIds: Object.freeze(changedIds),
    issues: Object.freeze(sortedIssues),
  };
  return Object.freeze({
    ...partial,
    fingerprint: inspectionFingerprint(partial),
  });
}
