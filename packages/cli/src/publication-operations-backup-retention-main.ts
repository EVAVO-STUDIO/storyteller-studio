#!/usr/bin/env node

import { existsSync } from "node:fs";
import { chmod, open } from "node:fs/promises";
import { resolve } from "node:path";
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
}

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

async function emit(
  value: unknown,
  outputPath: string | undefined,
  force: boolean,
  stdout: PublicationOperationsBackupRetentionTextOutput,
): Promise<void> {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (!outputPath) {
    stdout.write(content);
    return;
  }
  const path = resolve(outputPath);
  if (existsSync(path) && !force) {
    throw new Error(
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_OUTPUT_EXISTS",
    );
  }
  const handle = await open(path, force ? "w" : "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(path, 0o600);
  stdout.write(`${path}\n`);
}

function help(stdout: PublicationOperationsBackupRetentionTextOutput): void {
  stdout.write("Storyteller publication backup retention CLI\n\n");
  stdout.write("Commands:\n");
  stdout.write("  plan   Verify all snapshots and create a non-destructive retention plan.\n");
  stdout.write("  apply  Recompute and apply an unchanged plan while publication writers are stopped.\n\n");
  stdout.write("Plan example:\n");
  stdout.write("  npm run publication-operations-backup-retention-plan -- --backup-dir ./backups --evaluated-at 2026-07-30T00:00:00Z --keep-latest 7 --keep-daily-days 30 --keep-weekly-weeks 12 --output retention-plan.json\n\n");
  stdout.write("Apply example:\n");
  stdout.write("  npm run publication-operations-backup-prune -- --backup-dir ./backups --evaluated-at 2026-07-30T00:00:00Z --keep-latest 7 --keep-daily-days 30 --keep-weekly-weeks 12 --plan-fingerprint <sha256> --actor-id operator_greg --offline-confirmed --output retention-receipt.json\n");
}

function commonInput(args: ParsedArguments) {
  const evaluatedAt = dateFlag(args, "evaluated-at");
  const keepLatest = integerFlag(args, "keep-latest");
  const keepDailyDays = integerFlag(args, "keep-daily-days");
  const keepWeeklyWeeks = integerFlag(args, "keep-weekly-weeks");
  return {
    backupDirectory: stringFlag(args, "backup-dir", true)!,
    ...(keepLatest !== undefined ? { keepLatest } : {}),
    ...(keepDailyDays !== undefined ? { keepDailyDays } : {}),
    ...(keepWeeklyWeeks !== undefined ? { keepWeeklyWeeks } : {}),
    protectedSnapshotIds: protectedSnapshotIds(args),
    ...(evaluatedAt ? { evaluatedAt } : {}),
  };
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
  const output = stringFlag(args, "output");
  const force = booleanFlag(args, "force");

  if (args.command === "plan") {
    const result = await planPublicationOperationsBackupRetention(
      commonInput(args),
    );
    await emit(result, output, force, stdout);
    return 0;
  }

  if (args.command === "apply") {
    if (!output) {
      throw new Error(
        "PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_FLAG_REQUIRED:output",
      );
    }
    const prunedAt = dateFlag(args, "pruned-at");
    const result = await prunePublicationOperationsBackups({
      ...commonInput(args),
      actorId: stringFlag(args, "actor-id", true)!,
      offlineConfirmed: booleanFlag(args, "offline-confirmed") as true,
      expectedPlanFingerprint: stringFlag(
        args,
        "plan-fingerprint",
        true,
      )!,
      ...(prunedAt ? { prunedAt } : {}),
    });
    await emit(result, output, force, stdout);
    return 0;
  }

  throw new Error(
    `PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_COMMAND_UNKNOWN:${args.command}`,
  );
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  runPublicationOperationsBackupRetentionCli(process.argv.slice(2)).catch(
    (error: unknown) => {
      const message = error instanceof Error
        ? error.message
        : "PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_FAILED";
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    },
  );
}
