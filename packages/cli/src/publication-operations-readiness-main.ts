#!/usr/bin/env node

import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectPublicationOperationsReadiness,
  publicationOperationsReadinessSafeErrorCode,
  type PublicationOperationsReadinessResult,
} from "./publication-operations-readiness.js";

interface ParsedArguments {
  flags: Record<string, string | boolean>;
}

export interface PublicationOperationsReadinessTextOutput {
  write(value: string): unknown;
}

export interface PublicationOperationsReadinessCliDependencies {
  environment?: Readonly<Record<string, string | undefined>>;
  stdout?: PublicationOperationsReadinessTextOutput;
  stderr?: PublicationOperationsReadinessTextOutput;
}

function parseArguments(argv: readonly string[]): ParsedArguments {
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      throw new Error("PUBLICATION_OPERATIONS_READINESS_CLI_ARGUMENT_INVALID");
    }
    const key = token.slice(2);
    if (!key) {
      throw new Error("PUBLICATION_OPERATIONS_READINESS_CLI_FLAG_INVALID");
    }
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
  required = false,
): string | undefined {
  const value = args.flags[key];
  if (typeof value === "string" && value.trim()) return value;
  if (required) throw new Error(`PUBLICATION_OPERATIONS_READINESS_CLI_FLAG_REQUIRED:${key}`);
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
    throw new Error(`PUBLICATION_OPERATIONS_READINESS_CLI_INTEGER_INVALID:${key}`);
  }
  return parsed;
}

function dateFlag(args: ParsedArguments, key: string): Date | undefined {
  const value = stringFlag(args, key);
  if (value === undefined) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`PUBLICATION_OPERATIONS_READINESS_CLI_DATE_INVALID:${key}`);
  }
  return parsed;
}

function safeView(
  result: PublicationOperationsReadinessResult,
  readinessOnly: boolean,
): unknown {
  if (!readinessOnly) return result;
  return Object.freeze({
    schemaVersion: result.schemaVersion,
    status: result.status,
    operationalStatus: result.operationalStatus,
    checkedAt: result.checkedAt,
    fingerprint: result.fingerprint,
  });
}

function emit(
  value: unknown,
  outputPath: string | undefined,
  force: boolean,
  stdout: PublicationOperationsReadinessTextOutput,
): void {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (!outputPath) {
    stdout.write(content);
    return;
  }
  const path = resolve(outputPath);
  if (existsSync(path) && !force) {
    throw new Error("PUBLICATION_OPERATIONS_READINESS_CLI_OUTPUT_EXISTS");
  }
  writeFileSync(path, content, {
    encoding: "utf8",
    flag: force ? "w" : "wx",
    mode: 0o600,
  });
  stdout.write(`${path}\n`);
}

export async function runPublicationOperationsReadinessCli(
  argv: readonly string[],
  dependencies: PublicationOperationsReadinessCliDependencies = {},
): Promise<number> {
  const environment = dependencies.environment ?? process.env;
  const stdout = dependencies.stdout ?? process.stdout;
  const stderr = dependencies.stderr ?? process.stderr;
  try {
    const args = parseArguments(argv);
    const dataDirectory = stringFlag(args, "data-dir")
      ?? environment.STORYTELLER_DATA_DIR?.trim();
    if (!dataDirectory) {
      throw new Error("PUBLICATION_OPERATIONS_READINESS_CLI_FLAG_REQUIRED:data-dir");
    }
    const result = await inspectPublicationOperationsReadiness({
      dataDirectory,
      ...(dateFlag(args, "checked-at")
        ? { checkedAt: dateFlag(args, "checked-at")! }
        : {}),
      ...(integerFlag(args, "stale-temporary-after-ms") !== undefined
        ? {
            staleTemporaryAfterMs: integerFlag(
              args,
              "stale-temporary-after-ms",
            )!,
          }
        : {}),
    });
    emit(
      safeView(result, args.flags["readiness-only"] === true),
      stringFlag(args, "output"),
      args.flags.force === true,
      stdout,
    );
    return 0;
  } catch (error) {
    const code = publicationOperationsReadinessSafeErrorCode(error);
    stderr.write(`${JSON.stringify({ status: "not-ready", code })}\n`);
    return 1;
  }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  runPublicationOperationsReadinessCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
