#!/usr/bin/env node

import { existsSync } from "node:fs";
import { chmod, open } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPublicationOperationsStateIntegrity } from "./publication-operations-integrity.js";

interface ParsedArguments {
  flags: Record<string, string | boolean>;
}

export interface PublicationOperationsIntegrityTextOutput {
  write(value: string): unknown;
}

export interface PublicationOperationsIntegrityCliDependencies {
  environment?: Readonly<Record<string, string | undefined>>;
  stdout?: PublicationOperationsIntegrityTextOutput;
}

function parseArguments(argv: readonly string[]): ParsedArguments {
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      throw new Error("PUBLICATION_OPERATIONS_INTEGRITY_CLI_ARGUMENT_INVALID");
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { flags };
}

function stringFlag(
  args: ParsedArguments,
  key: string,
): string | undefined {
  const value = args.flags[key];
  return typeof value === "string" && value.trim()
    ? value.trim()
    : undefined;
}

function booleanFlag(args: ParsedArguments, key: string): boolean {
  const value = args.flags[key];
  if (value === true) return true;
  return typeof value === "string"
    && value.trim().toLocaleLowerCase("en-AU") === "true";
}

function dateFlag(args: ParsedArguments, key: string): Date | undefined {
  const value = stringFlag(args, key);
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`PUBLICATION_OPERATIONS_INTEGRITY_CLI_DATE_INVALID:${key}`);
  }
  return date;
}

async function emit(
  value: unknown,
  outputPath: string | undefined,
  force: boolean,
  stdout: PublicationOperationsIntegrityTextOutput,
): Promise<void> {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (!outputPath) {
    stdout.write(content);
    return;
  }
  const path = resolve(outputPath);
  if (existsSync(path) && !force) {
    throw new Error("PUBLICATION_OPERATIONS_INTEGRITY_CLI_OUTPUT_EXISTS");
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

export async function runPublicationOperationsIntegrityCli(
  argv: readonly string[],
  dependencies: PublicationOperationsIntegrityCliDependencies = {},
): Promise<number> {
  const args = parseArguments(argv);
  const environment = dependencies.environment ?? process.env;
  const stdout = dependencies.stdout ?? process.stdout;
  const dataDirectory = stringFlag(args, "data-dir")
    ?? environment.STORYTELLER_DATA_DIR?.trim();
  if (!dataDirectory) {
    throw new Error("PUBLICATION_OPERATIONS_INTEGRITY_CLI_FLAG_REQUIRED:data-dir");
  }
  const checkedAt = dateFlag(args, "checked-at");
  const summary = await verifyPublicationOperationsStateIntegrity({
    dataDirectory,
    ...(checkedAt ? { checkedAt } : {}),
  });
  await emit(
    summary,
    stringFlag(args, "output"),
    booleanFlag(args, "force"),
    stdout,
  );
  if (summary.status === "invalid") return 2;
  if (
    summary.status === "valid-with-warnings"
    && booleanFlag(args, "strict-warnings")
  ) {
    return 2;
  }
  return 0;
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  runPublicationOperationsIntegrityCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error
        ? error.message
        : "PUBLICATION_OPERATIONS_INTEGRITY_CLI_FAILED";
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
