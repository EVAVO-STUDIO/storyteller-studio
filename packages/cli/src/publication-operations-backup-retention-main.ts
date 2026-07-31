#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import {
  planPublicationOperationsBackupRetention,
  prunePublicationOperationsBackups,
} from "./publication-operations-backup-retention.js";

interface ParsedArguments {
  command: string;
  flags: Record<string, string | boolean>;
}

export interface PublicationOperationsBackupRetentionTextOutput {
  write(value: string): unknown;
}

export interface PublicationOperationsBackupRetentionCliDependencies {
  stdout?: PublicationOperationsBackupRetentionTextOutput;
  now?: () => Date;
  afterApplyIntent?: () => Promise<void>;
}

type PublicationOperationsBackupRetentionReceiptKind = "plan" | "apply";

interface PrivateReceiptReservation {
  path: string;
  content: string;
}

export const PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_INTENT_SCHEMA_VERSION =
  "storyteller-publication-operations-backup-retention-apply-intent-v1" as const;
export const PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_FAILURE_SCHEMA_VERSION =
  "storyteller-publication-operations-backup-retention-apply-failure-v1" as const;

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]*$/u;

function parseArguments(argv: readonly string[]): ParsedArguments {
  const [command = "help", ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token?.startsWith("--")) {
      throw new Error("PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_ARGUMENT_INVALID");
    }
    const key = token.slice(2);
    if (!key) {
      throw new Error("PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_FLAG_INVALID");
    }
    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

function stringFlag(
  args: ParsedArguments,
  key: string,
  required = false,
): string | undefined {
  const value = args.flags[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (required) {
    throw new Error(
      `PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_FLAG_REQUIRED:${key}`,
    );
  }
  return undefined;
}

function integerFlag(
  args: ParsedArguments,
  key: string,
): number | undefined {
  const value = stringFlag(args, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(
      `PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_INTEGER_INVALID:${key}`,
    );
  }
  return parsed;
}

function dateFlag(args: ParsedArguments, key: string): Date | undefined {
  const value = stringFlag(args, key);
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_DATE_INVALID:${key}`,
    );
  }
  return parsed;
}

function booleanFlag(args: ParsedArguments, key: string): boolean {
  const value = args.flags[key];
  if (value === true) return true;
  if (typeof value === "string") {
    return value.trim().toLocaleLowerCase("en-AU") === "true";
  }
  return false;
}

function protectedSnapshotIds(args: ParsedArguments): readonly string[] {
  const value = stringFlag(args, "protect");
  if (!value) return Object.freeze([]);
  return Object.freeze(
    value.split(",").map((item) => item.trim()).filter(Boolean),
  );
}

function errorCode(error: unknown): string | undefined {
  return error
    && typeof error === "object"
    && "code" in error
    && typeof error.code === "string"
    ? error.code
    : undefined;
}

function safeFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const [candidate = ""] = message.split(":", 1);
  if (SAFE_ERROR_CODE.test(candidate)) return candidate;
  const filesystemCode = errorCode(error);
  if (filesystemCode && /^[A-Z0-9_]+$/u.test(filesystemCode)) {
    return `PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_FILESYSTEM_${filesystemCode}`;
  }
  return "PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_FAILED";
}

function safeCliErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/^[A-Z][A-Z0-9_]*(?::[A-Za-z0-9._-]+)?$/u.test(message)) {
    return message;
  }
  return safeFailureCode(error);
}

function isContained(child: string, parent: string): boolean {
  const relation = relative(parent, child);
  return relation === ""
    || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation));
}

function receiptPathOutsideBackupRoot(
  outputPath: string,
  backupDirectory: string,
): string {
  const path = resolve(outputPath);
  const backupRoot = resolve(backupDirectory);
  if (isContained(path, backupRoot)) {
    throw new Error(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_OUTPUT_INSIDE_BACKUP_ROOT",
    );
  }
  return path;
}

async function syncParentDirectory(path: string): Promise<void> {
  const handle = await open(dirname(path), "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function stagePrivateReceipt(
  path: string,
  content: string,
): Promise<string> {
  const stagingPath = `${path}.${randomUUID()}.tmp`;
  const handle = await open(stagingPath, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(stagingPath, 0o600);
  return stagingPath;
}

async function assertRegularReceiptTarget(path: string): Promise<void> {
  const information = await lstat(path);
  if (information.isSymbolicLink() || !information.isFile()) {
    throw new Error(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_OUTPUT_TARGET_INVALID",
    );
  }
}

async function assertPrivateReceiptReservation(
  reservation: PrivateReceiptReservation,
): Promise<void> {
  await assertRegularReceiptTarget(reservation.path);
  if (await readFile(reservation.path, "utf8") !== reservation.content) {
    throw new Error(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_OUTPUT_RESERVATION_CHANGED",
    );
  }
}

async function writePrivateReceipt(
  value: unknown,
  outputPath: string,
  force: boolean,
): Promise<PrivateReceiptReservation> {
  const path = resolve(outputPath);
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const stagingPath = await stagePrivateReceipt(path, content);
  let stagingPublished = false;
  try {
    if (force) {
      try {
        await assertRegularReceiptTarget(path);
      } catch (error) {
        if (errorCode(error) !== "ENOENT") throw error;
      }
      await rename(stagingPath, path);
    } else {
      try {
        await link(stagingPath, path);
      } catch (error) {
        if (errorCode(error) === "EEXIST") {
          throw new Error(
            "PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_OUTPUT_EXISTS",
          );
        }
        throw error;
      }
      await rm(stagingPath);
    }
    stagingPublished = true;
    await chmod(path, 0o600);
    await syncParentDirectory(path);
    const reservation = Object.freeze({ path, content });
    await assertPrivateReceiptReservation(reservation);
    return reservation;
  } finally {
    if (!stagingPublished) await rm(stagingPath, { force: true });
  }
}

async function replacePrivateReceipt(
  value: unknown,
  reservation: PrivateReceiptReservation,
): Promise<PrivateReceiptReservation> {
  await assertPrivateReceiptReservation(reservation);
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const stagingPath = await stagePrivateReceipt(reservation.path, content);
  let stagingPublished = false;
  try {
    await assertPrivateReceiptReservation(reservation);
    await rename(stagingPath, reservation.path);
    stagingPublished = true;
    await chmod(reservation.path, 0o600);
    await syncParentDirectory(reservation.path);
    const replaced = Object.freeze({ path: reservation.path, content });
    await assertPrivateReceiptReservation(replaced);
    return replaced;
  } finally {
    if (!stagingPublished) await rm(stagingPath, { force: true });
  }
}

async function emit(
  value: unknown,
  outputPath: string,
  force: boolean,
  receipt: PublicationOperationsBackupRetentionReceiptKind,
  stdout: PublicationOperationsBackupRetentionTextOutput,
): Promise<void> {
  await writePrivateReceipt(value, outputPath, force);
  stdout.write(`${JSON.stringify({ status: "written", receipt })}\n`);
}

function help(stdout: PublicationOperationsBackupRetentionTextOutput): void {
  stdout.write("Storyteller publication backup retention CLI\n\n");
  stdout.write("Commands:\n");
  stdout.write("  plan   Verify all snapshots and write a private non-destructive retention plan.\n");
  stdout.write("  apply  Reserve private intent evidence, then recompute and apply an unchanged plan while publication writers are stopped.\n\n");
  stdout.write("Both commands require --output. Standard output contains only a bounded receipt-written acknowledgement.\n\n");
  stdout.write("Plan example:\n");
  stdout.write("  npm run publication-operations-backup-retention-plan -- --backup-dir ./backups --evaluated-at 2026-07-30T00:00:00Z --application-revision <40-character-git-sha> --keep-latest 7 --keep-daily-days 30 --keep-weekly-weeks 12 --output retention-plan.json\n\n");
  stdout.write("Apply example:\n");
  stdout.write("  npm run publication-operations-backup-prune -- --backup-dir ./backups --evaluated-at 2026-07-30T00:00:00Z --application-revision <40-character-git-sha> --keep-latest 7 --keep-daily-days 30 --keep-weekly-weeks 12 --plan-fingerprint <sha256> --actor-id operator_greg --offline-confirmed --output retention-receipt.json\n");
}

function commonInput(args: ParsedArguments) {
  const evaluatedAt = dateFlag(args, "evaluated-at");
  const keepLatest = integerFlag(args, "keep-latest");
  const keepDailyDays = integerFlag(args, "keep-daily-days");
  const keepWeeklyWeeks = integerFlag(args, "keep-weekly-weeks");
  return {
    backupDirectory: stringFlag(args, "backup-dir", true)!,
    applicationRevision: stringFlag(
      args,
      "application-revision",
      true,
    )!,
    ...(keepLatest !== undefined ? { keepLatest } : {}),
    ...(keepDailyDays !== undefined ? { keepDailyDays } : {}),
    ...(keepWeeklyWeeks !== undefined ? { keepWeeklyWeeks } : {}),
    protectedSnapshotIds: protectedSnapshotIds(args),
    ...(evaluatedAt ? { evaluatedAt } : {}),
  };
}

function requireApplyActorId(args: ParsedArguments): string {
  const actorId = stringFlag(args, "actor-id", true)!;
  if (!SAFE_IDENTIFIER.test(actorId)) {
    throw new Error(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_ACTOR_ID_INVALID",
    );
  }
  return actorId;
}

function requirePlanFingerprint(args: ParsedArguments): string {
  const fingerprint = stringFlag(args, "plan-fingerprint", true)!;
  if (!HASH_PATTERN.test(fingerprint)) {
    throw new Error(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_HASH_INVALID",
    );
  }
  return fingerprint;
}

function requireOfflineApply(args: ParsedArguments): true {
  if (!booleanFlag(args, "offline-confirmed")) {
    throw new Error(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_OFFLINE_CONFIRMATION_REQUIRED",
    );
  }
  return true;
}

function now(
  dependencies: PublicationOperationsBackupRetentionCliDependencies,
): Date {
  const value = dependencies.now?.() ?? new Date();
  if (Number.isNaN(value.getTime())) {
    throw new Error(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_NOW_INVALID",
    );
  }
  return value;
}

export async function runPublicationOperationsBackupRetentionCli(
  argv: readonly string[],
  dependencies: PublicationOperationsBackupRetentionCliDependencies = {},
): Promise<number> {
  const args = parseArguments(argv);
  const stdout = dependencies.stdout ?? process.stdout;
  if (["help", "--help", "-h"].includes(args.command)) {
    help(stdout);
    return 0;
  }
  const force = booleanFlag(args, "force");

  if (args.command === "plan") {
    const outputFlag = stringFlag(args, "output", true)!;
    const input = commonInput(args);
    const output = receiptPathOutsideBackupRoot(
      outputFlag,
      input.backupDirectory,
    );
    const result = await planPublicationOperationsBackupRetention(input);
    await emit(result, output, force, "plan", stdout);
    return 0;
  }

  if (args.command === "apply") {
    const outputFlag = stringFlag(args, "output", true)!;
    const input = commonInput(args);
    const output = receiptPathOutsideBackupRoot(
      outputFlag,
      input.backupDirectory,
    );
    const actorId = requireApplyActorId(args);
    const offlineConfirmed = requireOfflineApply(args);
    const expectedPlanFingerprint = requirePlanFingerprint(args);
    const prunedAt = dateFlag(args, "pruned-at");
    const preflightPlan = await planPublicationOperationsBackupRetention(input);
    if (preflightPlan.fingerprint !== expectedPlanFingerprint) {
      throw new Error(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_STALE",
      );
    }
    if (
      prunedAt
      && prunedAt.getTime() < Date.parse(preflightPlan.evaluatedAt)
    ) {
      throw new Error(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PRUNED_AT_INVALID",
      );
    }

    const operationId = randomUUID();
    const intent = Object.freeze({
      schemaVersion:
        PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_INTENT_SCHEMA_VERSION,
      status: "applying" as const,
      operationId,
      actorId,
      startedAt: now(dependencies).toISOString(),
      applicationRevision: input.applicationRevision,
      expectedPlanFingerprint,
      backupState: "inspection-required-until-completed" as const,
    });
    const reservation = await writePrivateReceipt(intent, output, force);

    try {
      await dependencies.afterApplyIntent?.();
      await assertPrivateReceiptReservation(reservation);
      const result = await prunePublicationOperationsBackups({
        ...input,
        actorId,
        offlineConfirmed,
        expectedPlanFingerprint,
        ...(prunedAt ? { prunedAt } : {}),
      });
      await replacePrivateReceipt(result, reservation);
      stdout.write(`${JSON.stringify({ status: "written", receipt: "apply" })}\n`);
      return 0;
    } catch (error) {
      const failure = Object.freeze({
        schemaVersion:
          PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_FAILURE_SCHEMA_VERSION,
        status: "failed" as const,
        operationId,
        actorId,
        failedAt: now(dependencies).toISOString(),
        applicationRevision: input.applicationRevision,
        expectedPlanFingerprint,
        errorCode: safeFailureCode(error),
        backupState: "inspection-required" as const,
      });
      try {
        await replacePrivateReceipt(failure, reservation);
      } catch {
        // Preserve the original intent when the reserved evidence path changed
        // or the failure receipt itself could not be published.
      }
      throw error;
    }
  }

  throw new Error(
    `PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_COMMAND_UNKNOWN:${args.command}`,
  );
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  runPublicationOperationsBackupRetentionCli(process.argv.slice(2)).catch(
    (error: unknown) => {
      process.stderr.write(`${safeCliErrorMessage(error)}\n`);
      process.exitCode = 1;
    },
  );
}
