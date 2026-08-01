import { lstat, readdir, rename, rm } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { stableHash } from "@evavo/storyteller-engine";
import {
  verifyPublicationOperationsBackupSnapshot,
  type PublicationOperationsBackupVerificationResult,
} from "./publication-operations-backup.js";

export const PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_SCHEMA_VERSION =
  "storyteller-publication-operations-backup-retention-plan-v2" as const;
export const PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_SCHEMA_VERSION =
  "storyteller-publication-operations-backup-retention-result-v2" as const;

export type PublicationOperationsBackupRetentionReason =
  | "latest"
  | "daily"
  | "weekly"
  | "protected";

export interface PublicationOperationsBackupRetentionPolicy {
  keepLatest: number;
  keepDailyDays: number;
  keepWeeklyWeeks: number;
  protectedSnapshotIds: readonly string[];
  fingerprint: string;
}

export interface PublicationOperationsBackupRetentionSnapshot {
  snapshotId: string;
  createdAt: string;
  totalBytes: number;
  fingerprint: string;
}

export interface PublicationOperationsBackupRetainedSnapshot
  extends PublicationOperationsBackupRetentionSnapshot {
  reasons: readonly PublicationOperationsBackupRetentionReason[];
}

export interface PublicationOperationsBackupRetentionPlan {
  schemaVersion:
    typeof PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_SCHEMA_VERSION;
  status: "planned";
  evaluatedAt: string;
  applicationRevision: string;
  policy: PublicationOperationsBackupRetentionPolicy;
  snapshotCount: number;
  totalBytes: number;
  retained: readonly PublicationOperationsBackupRetainedSnapshot[];
  delete: readonly PublicationOperationsBackupRetentionSnapshot[];
  retainedBytes: number;
  reclaimableBytes: number;
  fingerprint: string;
}

export interface PublicationOperationsBackupRetentionResult {
  schemaVersion:
    typeof PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_SCHEMA_VERSION;
  status: "unchanged" | "pruned";
  actorId: string;
  prunedAt: string;
  planFingerprint: string;
  applicationRevision: string;
  retainedCount: number;
  deletedCount: number;
  reclaimedBytes: number;
  deletedSnapshotIds: readonly string[];
  fingerprint: string;
}

export interface PlanPublicationOperationsBackupRetentionInput {
  backupDirectory: string;
  applicationRevision: string;
  keepLatest?: number;
  keepDailyDays?: number;
  keepWeeklyWeeks?: number;
  protectedSnapshotIds?: readonly string[];
  evaluatedAt?: Date;
}

export interface PrunePublicationOperationsBackupsInput
  extends PlanPublicationOperationsBackupRetentionInput {
  actorId: string;
  offlineConfirmed: true;
  expectedPlanFingerprint: string;
  prunedAt?: Date;
}

export class PublicationOperationsBackupRetentionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PublicationOperationsBackupRetentionError";
    this.code = code;
  }
}

const SNAPSHOT_ID_PATTERN = /^publication_backup_[a-f0-9]{24}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const APPLICATION_REVISION_PATTERN = /^[a-f0-9]{40}$/u;
const MAXIMUM_SNAPSHOTS = 10_000;
const MAXIMUM_PROTECTED_SNAPSHOTS = 1_000;
const MAXIMUM_KEEP_LATEST = 1_000;
const MAXIMUM_KEEP_DAILY_DAYS = 3_650;
const MAXIMUM_KEEP_WEEKLY_WEEKS = 520;
const DAY_MS = 24 * 60 * 60_000;
const FUTURE_CLOCK_SKEW_MS = 5 * 60_000;
const REASON_ORDER: readonly PublicationOperationsBackupRetentionReason[] = [
  "latest",
  "daily",
  "weekly",
  "protected",
];

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new PublicationOperationsBackupRetentionError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new PublicationOperationsBackupRetentionError(code);
  }
  return value;
}

function requireApplicationRevision(value: string): string {
  if (!APPLICATION_REVISION_PATTERN.test(value)) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLICATION_REVISION_INVALID",
    );
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
    throw new PublicationOperationsBackupRetentionError(code);
  }
  return value;
}

function requireDate(value: Date, code: string): Date {
  if (Number.isNaN(value.getTime())) {
    throw new PublicationOperationsBackupRetentionError(code);
  }
  return value;
}

function requireOfflineConfirmation(value: true): void {
  if (value !== true) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_OFFLINE_CONFIRMATION_REQUIRED",
    );
  }
}

function isContained(child: string, parent: string): boolean {
  const relation = relative(parent, child);
  return relation === ""
    || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation));
}

async function requireBackupRoot(path: string): Promise<void> {
  let information;
  try {
    information = await lstat(path);
  } catch (error) {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && error.code === "ENOENT"
    ) {
      throw new PublicationOperationsBackupRetentionError(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_DIRECTORY_NOT_FOUND",
      );
    }
    throw error;
  }
  if (information.isSymbolicLink() || !information.isDirectory()) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_DIRECTORY_INVALID",
    );
  }
}

function snapshotFromVerification(
  value: PublicationOperationsBackupVerificationResult,
): PublicationOperationsBackupRetentionSnapshot {
  return Object.freeze({
    snapshotId: value.snapshotId,
    createdAt: value.createdAt,
    totalBytes: value.totalBytes,
    fingerprint: value.fingerprint,
  });
}

function compareSnapshots(
  left: PublicationOperationsBackupRetentionSnapshot,
  right: PublicationOperationsBackupRetentionSnapshot,
): number {
  const byDate = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  if (byDate !== 0) return byDate;
  return left.snapshotId.localeCompare(right.snapshotId, "en-AU");
}

async function inventorySnapshots(
  backupDirectory: string,
  evaluatedAt: Date,
): Promise<readonly PublicationOperationsBackupRetentionSnapshot[]> {
  const root = resolve(backupDirectory);
  await requireBackupRoot(root);
  const entries = await readdir(root, { withFileTypes: true });
  if (entries.length > MAXIMUM_SNAPSHOTS) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_SNAPSHOT_LIMIT_EXCEEDED",
    );
  }
  entries.sort((left, right) => left.name.localeCompare(right.name, "en-AU"));
  const snapshots: PublicationOperationsBackupRetentionSnapshot[] = [];
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (!isContained(path, root)) {
      throw new PublicationOperationsBackupRetentionError(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PATH_ESCAPE",
      );
    }
    const information = await lstat(path);
    if (information.isSymbolicLink()) {
      throw new PublicationOperationsBackupRetentionError(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_SYMLINK_FORBIDDEN",
      );
    }
    if (
      entry.name.startsWith(".")
      || entry.name.endsWith(".tmp")
      || entry.name.endsWith(".pruning")
    ) {
      throw new PublicationOperationsBackupRetentionError(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_DIRECTORY_BUSY",
      );
    }
    if (!SNAPSHOT_ID_PATTERN.test(entry.name) || !information.isDirectory()) {
      throw new PublicationOperationsBackupRetentionError(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_ROOT_LAYOUT_INVALID",
      );
    }
    const verified = await verifyPublicationOperationsBackupSnapshot(path);
    if (verified.snapshotId !== entry.name) {
      throw new PublicationOperationsBackupRetentionError(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_SNAPSHOT_SCOPE_INVALID",
      );
    }
    if (
      Date.parse(verified.createdAt)
        > evaluatedAt.getTime() + FUTURE_CLOCK_SKEW_MS
    ) {
      throw new PublicationOperationsBackupRetentionError(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_SNAPSHOT_FROM_FUTURE",
      );
    }
    snapshots.push(snapshotFromVerification(verified));
  }
  snapshots.sort(compareSnapshots);
  return Object.freeze(snapshots);
}

function normaliseProtectedSnapshotIds(
  values: readonly string[],
): readonly string[] {
  if (!Array.isArray(values) || values.length > MAXIMUM_PROTECTED_SNAPSHOTS) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PROTECTED_INVALID",
    );
  }
  const output = new Set<string>();
  for (const value of values) {
    if (!SNAPSHOT_ID_PATTERN.test(value) || output.has(value)) {
      throw new PublicationOperationsBackupRetentionError(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PROTECTED_INVALID",
      );
    }
    output.add(value);
  }
  return Object.freeze(
    [...output].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function policy(input: PlanPublicationOperationsBackupRetentionInput):
  PublicationOperationsBackupRetentionPolicy {
  const partial = Object.freeze({
    keepLatest: requireInteger(
      input.keepLatest ?? 7,
      1,
      MAXIMUM_KEEP_LATEST,
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_KEEP_LATEST_INVALID",
    ),
    keepDailyDays: requireInteger(
      input.keepDailyDays ?? 30,
      0,
      MAXIMUM_KEEP_DAILY_DAYS,
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_KEEP_DAILY_INVALID",
    ),
    keepWeeklyWeeks: requireInteger(
      input.keepWeeklyWeeks ?? 12,
      0,
      MAXIMUM_KEEP_WEEKLY_WEEKS,
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_KEEP_WEEKLY_INVALID",
    ),
    protectedSnapshotIds: normaliseProtectedSnapshotIds(
      input.protectedSnapshotIds ?? [],
    ),
  });
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function utcDayKey(value: string): string {
  return value.slice(0, 10);
}

function utcWeekKey(value: string): string {
  const date = new Date(value);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

function addReason(
  reasons: Map<string, Set<PublicationOperationsBackupRetentionReason>>,
  snapshotId: string,
  reason: PublicationOperationsBackupRetentionReason,
): void {
  const current = reasons.get(snapshotId) ?? new Set();
  current.add(reason);
  reasons.set(snapshotId, current);
}

function selectRetained(input: Readonly<{
  snapshots: readonly PublicationOperationsBackupRetentionSnapshot[];
  policy: PublicationOperationsBackupRetentionPolicy;
  evaluatedAt: Date;
}>): ReadonlyMap<string, readonly PublicationOperationsBackupRetentionReason[]> {
  const reasons = new Map<
    string,
    Set<PublicationOperationsBackupRetentionReason>
  >();
  for (const snapshot of input.snapshots.slice(0, input.policy.keepLatest)) {
    addReason(reasons, snapshot.snapshotId, "latest");
  }

  const dailyKeys = new Set<string>();
  const dailyLimitMs = input.policy.keepDailyDays * DAY_MS;
  if (dailyLimitMs > 0) {
    for (const snapshot of input.snapshots) {
      const ageMs = input.evaluatedAt.getTime() - Date.parse(snapshot.createdAt);
      if (ageMs > dailyLimitMs || ageMs < -FUTURE_CLOCK_SKEW_MS) continue;
      const key = utcDayKey(snapshot.createdAt);
      if (dailyKeys.has(key)) continue;
      dailyKeys.add(key);
      addReason(reasons, snapshot.snapshotId, "daily");
    }
  }

  const weeklyKeys = new Set<string>();
  const weeklyLimitMs = input.policy.keepWeeklyWeeks * 7 * DAY_MS;
  if (weeklyLimitMs > 0) {
    for (const snapshot of input.snapshots) {
      const ageMs = input.evaluatedAt.getTime() - Date.parse(snapshot.createdAt);
      if (ageMs > weeklyLimitMs || ageMs < -FUTURE_CLOCK_SKEW_MS) continue;
      const key = utcWeekKey(snapshot.createdAt);
      if (weeklyKeys.has(key)) continue;
      weeklyKeys.add(key);
      addReason(reasons, snapshot.snapshotId, "weekly");
    }
  }

  const inventoryIds = new Set(input.snapshots.map((snapshot) => snapshot.snapshotId));
  for (const snapshotId of input.policy.protectedSnapshotIds) {
    if (!inventoryIds.has(snapshotId)) {
      throw new PublicationOperationsBackupRetentionError(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PROTECTED_NOT_FOUND",
      );
    }
    addReason(reasons, snapshotId, "protected");
  }

  return new Map([...reasons].map(([snapshotId, values]) => [
    snapshotId,
    Object.freeze(REASON_ORDER.filter((reason) => values.has(reason))),
  ]));
}

function planFingerprint(
  value: Omit<PublicationOperationsBackupRetentionPlan, "fingerprint">,
): string {
  return stableHash(value);
}

export async function planPublicationOperationsBackupRetention(
  input: PlanPublicationOperationsBackupRetentionInput,
): Promise<PublicationOperationsBackupRetentionPlan> {
  const backupDirectory = input.backupDirectory.trim();
  if (!backupDirectory) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_DIRECTORY_REQUIRED",
    );
  }
  const evaluatedAt = requireDate(
    input.evaluatedAt ?? new Date(),
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_DATE_INVALID",
  );
  const applicationRevision = requireApplicationRevision(
    input.applicationRevision,
  );
  const retentionPolicy = policy(input);
  const snapshots = await inventorySnapshots(backupDirectory, evaluatedAt);
  const reasons = selectRetained({
    snapshots,
    policy: retentionPolicy,
    evaluatedAt,
  });
  const retained = Object.freeze(snapshots
    .filter((snapshot) => reasons.has(snapshot.snapshotId))
    .map((snapshot): PublicationOperationsBackupRetainedSnapshot =>
      Object.freeze({
        ...snapshot,
        reasons: reasons.get(snapshot.snapshotId)!,
      })
    ));
  const deleting = Object.freeze(
    snapshots.filter((snapshot) => !reasons.has(snapshot.snapshotId)),
  );
  const totalBytes = snapshots.reduce(
    (total, snapshot) => total + snapshot.totalBytes,
    0,
  );
  const retainedBytes = retained.reduce(
    (total, snapshot) => total + snapshot.totalBytes,
    0,
  );
  const partial: Omit<PublicationOperationsBackupRetentionPlan, "fingerprint"> = {
    schemaVersion: PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_SCHEMA_VERSION,
    status: "planned",
    evaluatedAt: evaluatedAt.toISOString(),
    applicationRevision,
    policy: retentionPolicy,
    snapshotCount: snapshots.length,
    totalBytes,
    retained,
    delete: deleting,
    retainedBytes,
    reclaimableBytes: totalBytes - retainedBytes,
  };
  return Object.freeze({ ...partial, fingerprint: planFingerprint(partial) });
}

function retentionResultFingerprint(
  value: Omit<PublicationOperationsBackupRetentionResult, "fingerprint">,
): string {
  return stableHash(value);
}

function requireExactObjectKeys(
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
    throw new PublicationOperationsBackupRetentionError(code);
  }
}

function requireCanonicalDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new PublicationOperationsBackupRetentionError(code);
  }
  if (new Date(value).toISOString() !== value) {
    throw new PublicationOperationsBackupRetentionError(code);
  }
  return value;
}

function assertSnapshotValue(
  value: PublicationOperationsBackupRetentionSnapshot,
  retained: boolean,
): PublicationOperationsBackupRetentionSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
    );
  }
  requireExactObjectKeys(
    value as unknown as Record<string, unknown>,
    retained
      ? ["snapshotId", "createdAt", "totalBytes", "fingerprint", "reasons"]
      : ["snapshotId", "createdAt", "totalBytes", "fingerprint"],
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
  );
  if (!SNAPSHOT_ID_PATTERN.test(value.snapshotId)) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
    );
  }
  requireCanonicalDate(
    value.createdAt,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
  );
  requireInteger(
    value.totalBytes,
    0,
    Number.MAX_SAFE_INTEGER,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
  );
  requireHash(
    value.fingerprint,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
  );
  return value;
}

function assertSnapshotOrder(
  values: readonly PublicationOperationsBackupRetentionSnapshot[],
): void {
  for (let index = 1; index < values.length; index += 1) {
    if (compareSnapshots(values[index - 1]!, values[index]!) > 0) {
      throw new PublicationOperationsBackupRetentionError(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
      );
    }
  }
}

export function assertPublicationOperationsBackupRetentionPlan(
  value: unknown,
): PublicationOperationsBackupRetentionPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
    );
  }
  const candidate = value as PublicationOperationsBackupRetentionPlan;
  requireExactObjectKeys(
    candidate as unknown as Record<string, unknown>,
    [
      "schemaVersion",
      "status",
      "evaluatedAt",
      "applicationRevision",
      "policy",
      "snapshotCount",
      "totalBytes",
      "retained",
      "delete",
      "retainedBytes",
      "reclaimableBytes",
      "fingerprint",
    ],
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
  );
  if (
    candidate.schemaVersion
      !== PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_SCHEMA_VERSION
    || candidate.status !== "planned"
  ) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
    );
  }
  const evaluatedAt = new Date(requireCanonicalDate(
    candidate.evaluatedAt,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
  ));
  requireApplicationRevision(candidate.applicationRevision);
  if (!candidate.policy || typeof candidate.policy !== "object") {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
    );
  }
  requireExactObjectKeys(
    candidate.policy as unknown as Record<string, unknown>,
    [
      "keepLatest",
      "keepDailyDays",
      "keepWeeklyWeeks",
      "protectedSnapshotIds",
      "fingerprint",
    ],
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
  );
  requireInteger(
    candidate.policy.keepLatest,
    1,
    MAXIMUM_KEEP_LATEST,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
  );
  requireInteger(
    candidate.policy.keepDailyDays,
    0,
    MAXIMUM_KEEP_DAILY_DAYS,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
  );
  requireInteger(
    candidate.policy.keepWeeklyWeeks,
    0,
    MAXIMUM_KEEP_WEEKLY_WEEKS,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
  );
  if (!Array.isArray(candidate.policy.protectedSnapshotIds)) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
    );
  }
  const protectedSnapshotIds = normaliseProtectedSnapshotIds(
    candidate.policy.protectedSnapshotIds,
  );
  if (
    stableHash(protectedSnapshotIds)
      !== stableHash(candidate.policy.protectedSnapshotIds)
  ) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
    );
  }
  requireHash(
    candidate.policy.fingerprint,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
  );
  const {
    fingerprint: policyFingerprintValue,
    ...policyPartial
  } = candidate.policy;
  if (stableHash(policyPartial) !== policyFingerprintValue) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
    );
  }
  if (
    !Array.isArray(candidate.retained)
    || !Array.isArray(candidate.delete)
    || candidate.retained.length + candidate.delete.length > MAXIMUM_SNAPSHOTS
  ) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
    );
  }
  const retained = candidate.retained.map((item) => {
    const snapshot = assertSnapshotValue(item, true);
    if (!Array.isArray(item.reasons) || item.reasons.length === 0) {
      throw new PublicationOperationsBackupRetentionError(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
      );
    }
    const expectedReasons = REASON_ORDER.filter((reason) =>
      item.reasons.includes(reason)
    );
    if (stableHash(expectedReasons) !== stableHash(item.reasons)) {
      throw new PublicationOperationsBackupRetentionError(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
      );
    }
    return snapshot;
  });
  const deleting = candidate.delete.map((item) =>
    assertSnapshotValue(item, false)
  );
  assertSnapshotOrder(retained);
  assertSnapshotOrder(deleting);
  const snapshots = [...retained, ...deleting].sort(compareSnapshots);
  const snapshotIds = new Set<string>();
  for (const snapshot of snapshots) {
    if (snapshotIds.has(snapshot.snapshotId)) {
      throw new PublicationOperationsBackupRetentionError(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
      );
    }
    snapshotIds.add(snapshot.snapshotId);
    if (
      Date.parse(snapshot.createdAt)
        > evaluatedAt.getTime() + FUTURE_CLOCK_SKEW_MS
    ) {
      throw new PublicationOperationsBackupRetentionError(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
      );
    }
  }
  const expectedReasons = selectRetained({
    snapshots,
    policy: candidate.policy,
    evaluatedAt,
  });
  const retainedById = new Map(candidate.retained.map((snapshot) => [
    snapshot.snapshotId,
    snapshot,
  ]));
  for (const snapshot of snapshots) {
    const reasons = expectedReasons.get(snapshot.snapshotId);
    const retainedSnapshot = retainedById.get(snapshot.snapshotId);
    if (
      Boolean(reasons) !== Boolean(retainedSnapshot)
      || (reasons && stableHash(reasons) !== stableHash(retainedSnapshot!.reasons))
    ) {
      throw new PublicationOperationsBackupRetentionError(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
      );
    }
  }
  const totalBytes = snapshots.reduce(
    (total, snapshot) => total + snapshot.totalBytes,
    0,
  );
  const retainedBytes = retained.reduce(
    (total, snapshot) => total + snapshot.totalBytes,
    0,
  );
  requireInteger(
    candidate.snapshotCount,
    0,
    MAXIMUM_SNAPSHOTS,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
  );
  requireInteger(
    candidate.totalBytes,
    0,
    Number.MAX_SAFE_INTEGER,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
  );
  requireInteger(
    candidate.retainedBytes,
    0,
    Number.MAX_SAFE_INTEGER,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
  );
  requireInteger(
    candidate.reclaimableBytes,
    0,
    Number.MAX_SAFE_INTEGER,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
  );
  if (
    candidate.snapshotCount !== snapshots.length
    || candidate.totalBytes !== totalBytes
    || candidate.retainedBytes !== retainedBytes
    || candidate.reclaimableBytes !== totalBytes - retainedBytes
  ) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
    );
  }
  requireHash(
    candidate.fingerprint,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
  );
  const { fingerprint, ...partial } = candidate;
  if (planFingerprint(partial) !== fingerprint) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_INVALID",
    );
  }
  return Object.freeze(candidate);
}

export function assertPublicationOperationsBackupRetentionResult(
  value: unknown,
): PublicationOperationsBackupRetentionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_INVALID",
    );
  }
  const candidate = value as PublicationOperationsBackupRetentionResult;
  requireExactObjectKeys(
    candidate as unknown as Record<string, unknown>,
    [
      "schemaVersion",
      "status",
      "actorId",
      "prunedAt",
      "planFingerprint",
      "applicationRevision",
      "retainedCount",
      "deletedCount",
      "reclaimedBytes",
      "deletedSnapshotIds",
      "fingerprint",
    ],
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_INVALID",
  );
  if (
    candidate.schemaVersion
      !== PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_SCHEMA_VERSION
    || !["unchanged", "pruned"].includes(candidate.status)
  ) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_INVALID",
    );
  }
  requireIdentifier(
    candidate.actorId,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_INVALID",
  );
  requireCanonicalDate(
    candidate.prunedAt,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_INVALID",
  );
  requireHash(
    candidate.planFingerprint,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_INVALID",
  );
  requireApplicationRevision(candidate.applicationRevision);
  requireInteger(
    candidate.retainedCount,
    0,
    MAXIMUM_SNAPSHOTS,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_INVALID",
  );
  requireInteger(
    candidate.deletedCount,
    0,
    MAXIMUM_SNAPSHOTS,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_INVALID",
  );
  requireInteger(
    candidate.reclaimedBytes,
    0,
    Number.MAX_SAFE_INTEGER,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_INVALID",
  );
  if (!Array.isArray(candidate.deletedSnapshotIds)) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_INVALID",
    );
  }
  const ids = new Set<string>();
  for (const snapshotId of candidate.deletedSnapshotIds) {
    if (!SNAPSHOT_ID_PATTERN.test(snapshotId) || ids.has(snapshotId)) {
      throw new PublicationOperationsBackupRetentionError(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_INVALID",
      );
    }
    ids.add(snapshotId);
  }
  if (
    candidate.deletedCount !== candidate.deletedSnapshotIds.length
    || (candidate.status === "unchanged" && candidate.deletedCount !== 0)
    || (candidate.status === "pruned" && candidate.deletedCount === 0)
  ) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_INVALID",
    );
  }
  requireHash(
    candidate.fingerprint,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_INVALID",
  );
  const { fingerprint, ...partial } = candidate;
  if (retentionResultFingerprint(partial) !== fingerprint) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_INVALID",
    );
  }
  return Object.freeze(candidate);
}

async function deleteVerifiedSnapshot(input: Readonly<{
  backupDirectory: string;
  snapshot: PublicationOperationsBackupRetentionSnapshot;
}>): Promise<void> {
  const root = resolve(input.backupDirectory);
  const source = resolve(root, input.snapshot.snapshotId);
  if (!isContained(source, root) || basename(source) !== input.snapshot.snapshotId) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PATH_ESCAPE",
    );
  }
  const information = await lstat(source);
  if (information.isSymbolicLink() || !information.isDirectory()) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_SNAPSHOT_SCOPE_INVALID",
    );
  }
  const verified = await verifyPublicationOperationsBackupSnapshot(source);
  if (
    verified.snapshotId !== input.snapshot.snapshotId
    || verified.createdAt !== input.snapshot.createdAt
    || verified.totalBytes !== input.snapshot.totalBytes
    || verified.fingerprint !== input.snapshot.fingerprint
  ) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_STALE",
    );
  }
  const staging = resolve(
    root,
    `.${input.snapshot.snapshotId}.${process.pid}.pruning`,
  );
  if (!isContained(staging, root)) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PATH_ESCAPE",
    );
  }
  await rename(source, staging);
  try {
    await rm(staging, { recursive: true, force: false });
  } catch (error) {
    try {
      await rename(staging, source);
    } catch {
      throw new PublicationOperationsBackupRetentionError(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_DELETE_ROLLBACK_FAILED",
      );
    }
    throw error;
  }
}

export async function prunePublicationOperationsBackups(
  input: PrunePublicationOperationsBackupsInput,
): Promise<PublicationOperationsBackupRetentionResult> {
  requireOfflineConfirmation(input.offlineConfirmed);
  const actorId = requireIdentifier(
    input.actorId,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_ACTOR_ID_INVALID",
  );
  const expectedPlanFingerprint = requireHash(
    input.expectedPlanFingerprint,
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_HASH_INVALID",
  );
  const prunedAt = requireDate(
    input.prunedAt ?? new Date(),
    "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PRUNED_AT_INVALID",
  );
  const plan = await planPublicationOperationsBackupRetention(input);
  if (plan.fingerprint !== expectedPlanFingerprint) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_STALE",
    );
  }
  if (prunedAt.getTime() < Date.parse(plan.evaluatedAt)) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PRUNED_AT_INVALID",
    );
  }

  for (const snapshot of plan.delete) {
    await deleteVerifiedSnapshot({
      backupDirectory: input.backupDirectory,
      snapshot,
    });
  }

  const remaining = await inventorySnapshots(input.backupDirectory, prunedAt);
  if (
    stableHash(remaining.map((snapshot) => snapshot.snapshotId))
      !== stableHash(plan.retained.map((snapshot) => snapshot.snapshotId))
  ) {
    throw new PublicationOperationsBackupRetentionError(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_POST_DELETE_MISMATCH",
    );
  }

  const partial: Omit<
    PublicationOperationsBackupRetentionResult,
    "fingerprint"
  > = {
    schemaVersion: PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_SCHEMA_VERSION,
    status: plan.delete.length === 0 ? "unchanged" : "pruned",
    actorId,
    prunedAt: prunedAt.toISOString(),
    planFingerprint: plan.fingerprint,
    applicationRevision: plan.applicationRevision,
    retainedCount: plan.retained.length,
    deletedCount: plan.delete.length,
    reclaimedBytes: plan.reclaimableBytes,
    deletedSnapshotIds: Object.freeze(
      plan.delete.map((snapshot) => snapshot.snapshotId),
    ),
  };
  return Object.freeze({
    ...partial,
    fingerprint: retentionResultFingerprint(partial),
  });
}
