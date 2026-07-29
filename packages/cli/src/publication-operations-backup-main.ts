#!/usr/bin/env node

import { existsSync } from "node:fs";
import { chmod, open } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicationOperationsBackup,
  restorePublicationOperationsBackup,
  verifyPublicationOperationsBackupSnapshot,
} from "./publication-operations-backup.js";

interface ParsedArguments {
  command: string;
  flags: Record<string, string | boolean>;
}

export interface PublicationOperationsBackupTextOutput {
  write(value: string): unknown;
}

export interface PublicationOperationsBackupCliDependencies {
  environment?: NodeJS.ProcessEnv;
  stdout?: PublicationOperationsBackupTextOutput;
}

function parseArguments(argv: readonly string[]): ParsedArguments {
  const [command = "help", ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token?.startsWith("--")) {
      throw new Error("PUBLICATION_OPERATIONS_BACKUP_CLI_ARGUMENT_INVALID");
    }
    const key = token.slice(2);
    if (!key) throw new Error("PUBLICATION_OPERATIONS_BACKUP_CLI_FLAG_INVALID");
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
    throw new Error(`PUBLICATION_OPERATIONS_BACKUP_CLI_FLAG_REQUIRED:${key}`);
  }
  return undefined;
}

function dateFlag(args: ParsedArguments, key: string): Date | undefined {
  const value = stringFlag(args, key);
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`PUBLICATION_OPERATIONS_BACKUP_CLI_DATE_INVALID:${key}`);
  }
  return date;
}

function booleanFlag(args: ParsedArguments, key: string): boolean {
  const value = args.flags[key];
  if (value === true) return true;
  if (typeof value === "string") {
    return value.trim().toLocaleLowerCase("en-AU") === "true";
  }
  return false;
}

async function emit(
  value: unknown,
  outputPath: string | undefined,
  force: boolean,
  stdout: PublicationOperationsBackupTextOutput,
): Promise<void> {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (!outputPath) {
    stdout.write(content);
    return;
  }
  const path = resolve(outputPath);
  if (existsSync(path) && !force) {
    throw new Error("PUBLICATION_OPERATIONS_BACKUP_CLI_OUTPUT_EXISTS");
  }
  const handle = await open(path, force ? "w" : "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(path, 0o600);
}

function help(stdout: PublicationOperationsBackupTextOutput): void {
  stdout.write("Storyteller publication operations backup CLI\n\n");
  stdout.write("Commands:\n");
  stdout.write("  backup   Create an offline, integrity-checked publication state snapshot.\n");
  stdout.write("  verify   Verify one immutable snapshot and reject missing, extra or changed files.\n");
  stdout.write("  restore  Restore a verified snapshot only into absent or empty publication state.\n\n");
  stdout.write("Backup example:\n");
  stdout.write("  npm run publication-operations-backup -- --data-dir ./storage --backup-dir ./backups --actor-id operator_greg --offline-confirmed --output backup.json\n\n");
  stdout.write("Verify example:\n");
  stdout.write("  npm run publication-operations-backup-verify -- --snapshot ./backups/publication_backup_... --output verification.json\n\n");
  stdout.write("Restore example:\n");
  stdout.write("  npm run publication-operations-restore -- --snapshot ./backups/publication_backup_... --data-dir ./restored-storage --actor-id operator_greg --offline-confirmed --output restore.json\n");
}

export async function runPublicationOperationsBackupCli(
  argv: readonly string[],
  dependencies: PublicationOperationsBackupCliDependencies = {},
): Promise<number> {
  const args = parseArguments(argv);
  const environment = dependencies.environment ?? process.env;
  const stdout = dependencies.stdout ?? process.stdout;
  const output = stringFlag(args, "output");
  const force = booleanFlag(args, "force");

  if (["help", "--help", "-h"].includes(args.command)) {
    help(stdout);
    return 0;
  }

  if (args.command === "backup") {
    const dataDirectory = stringFlag(args, "data-dir")
      ?? environment.STORYTELLER_DATA_DIR?.trim();
    if (!dataDirectory) {
      throw new Error("PUBLICATION_OPERATIONS_BACKUP_CLI_FLAG_REQUIRED:data-dir");
    }
    const createdAt = dateFlag(args, "created-at");
    const result = await createPublicationOperationsBackup({
      dataDirectory,
      backupDirectory: stringFlag(args, "backup-dir", true)!,
      actorId: stringFlag(args, "actor-id", true)!,
      offlineConfirmed: booleanFlag(args, "offline-confirmed") as true,
      ...(createdAt ? { createdAt } : {}),
    });
    await emit(result, output, force, stdout);
    return 0;
  }

  if (args.command === "verify") {
    const result = await verifyPublicationOperationsBackupSnapshot(
      stringFlag(args, "snapshot", true)!,
    );
    await emit(result, output, force, stdout);
    return 0;
  }

  if (args.command === "restore") {
    const dataDirectory = stringFlag(args, "data-dir")
      ?? environment.STORYTELLER_DATA_DIR?.trim();
    if (!dataDirectory) {
      throw new Error("PUBLICATION_OPERATIONS_BACKUP_CLI_FLAG_REQUIRED:data-dir");
    }
    const restoredAt = dateFlag(args, "restored-at");
    const result = await restorePublicationOperationsBackup({
      snapshotDirectory: stringFlag(args, "snapshot", true)!,
      dataDirectory,
      actorId: stringFlag(args, "actor-id", true)!,
      offlineConfirmed: booleanFlag(args, "offline-confirmed") as true,
      ...(restoredAt ? { restoredAt } : {}),
    });
    await emit(result, output, force, stdout);
    return 0;
  }

  throw new Error(`PUBLICATION_OPERATIONS_BACKUP_CLI_COMMAND_UNKNOWN:${args.command}`);
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  runPublicationOperationsBackupCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error
      ? error.message
      : "PUBLICATION_OPERATIONS_BACKUP_CLI_FAILED";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
