#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectManifest } from "@evavo/storyteller-engine";
import { FileGenerationQueue } from "@evavo/storyteller-engine/generation-queue";
import {
  approveAdmittedNarratorCasting,
  assertAdmittedNarratorCasting,
  type AdmittedNarratorCasting,
} from "@evavo/storyteller-engine/narrator-casting-admission";
import type {
  AudioStudioNarratorProfileAdmission,
} from "@evavo/storyteller-engine/narrator-profile-admission";
import {
  createNarratorProductionJobs,
} from "@evavo/storyteller-engine/narrator-production-job";
import {
  enqueueNarratorProduction,
} from "@evavo/storyteller-engine/narrator-production-queue";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";

export type NarratorProductionCliInput =
  | Readonly<{
      command: "cast";
      admissionPath: string;
      projectId: string;
      approvedBy: string;
      approvedAt: string;
    }>
  | Readonly<{
      command: "jobs" | "queue";
      projectPath: string;
      castingAdmissionPath: string;
      candidateCount: number;
      dataDirectory?: string;
    }>;

function readJson<T>(pathValue: string): T {
  const path = resolve(pathValue);
  if (!existsSync(path)) throw new Error(`NARRATOR_PRODUCTION_FILE_NOT_FOUND:${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    throw new Error(`NARRATOR_PRODUCTION_JSON_INVALID:${path}`);
  }
}

function flagsFrom(tokens: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let index = 0; index < tokens.length; index += 2) {
    const key = tokens[index];
    const value = tokens[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("NARRATOR_PRODUCTION_ARGUMENT_INVALID");
    }
    const name = key.slice(2);
    if (flags.has(name)) throw new Error(`NARRATOR_PRODUCTION_ARGUMENT_DUPLICATE:${name}`);
    flags.set(name, value);
  }
  return flags;
}

function requireFlag(flags: ReadonlyMap<string, string>, name: string): string {
  const value = flags.get(name);
  if (!value) throw new Error(`NARRATOR_PRODUCTION_ARGUMENT_REQUIRED:${name}`);
  return value;
}

function rejectUnknownFlags(
  flags: ReadonlyMap<string, string>,
  allowed: ReadonlySet<string>,
): void {
  for (const name of flags.keys()) {
    if (!allowed.has(name)) throw new Error(`NARRATOR_PRODUCTION_ARGUMENT_UNKNOWN:${name}`);
  }
}

function parse(argv: readonly string[]): NarratorProductionCliInput {
  const [commandRaw, ...tokens] = argv;
  if (commandRaw !== "cast" && commandRaw !== "jobs" && commandRaw !== "queue") {
    throw new Error("NARRATOR_PRODUCTION_COMMAND_INVALID");
  }
  const flags = flagsFrom(tokens);
  if (commandRaw === "cast") {
    rejectUnknownFlags(
      flags,
      new Set(["admission", "project-id", "approved-by", "approved-at"]),
    );
    return {
      command: "cast",
      admissionPath: requireFlag(flags, "admission"),
      projectId: requireFlag(flags, "project-id"),
      approvedBy: requireFlag(flags, "approved-by"),
      approvedAt: requireFlag(flags, "approved-at"),
    };
  }
  rejectUnknownFlags(
    flags,
    new Set(["project", "casting-admission", "candidates", "data-dir"]),
  );
  const projectPath = requireFlag(flags, "project");
  const castingAdmissionPath = requireFlag(flags, "casting-admission");
  const candidateCount = Number(flags.get("candidates") ?? "3");
  if (!Number.isSafeInteger(candidateCount) || candidateCount < 1 || candidateCount > 8) {
    throw new Error("NARRATOR_PRODUCTION_CANDIDATE_COUNT_INVALID");
  }
  const dataDirectory = flags.get("data-dir");
  if (commandRaw === "queue" && !dataDirectory) {
    throw new Error("NARRATOR_PRODUCTION_DATA_DIRECTORY_REQUIRED");
  }
  return {
    command: commandRaw,
    projectPath,
    castingAdmissionPath,
    candidateCount,
    ...(dataDirectory ? { dataDirectory } : {}),
  };
}

export async function executeNarratorProductionCommand(
  input: NarratorProductionCliInput,
): Promise<unknown> {
  if (input.command === "cast") {
    return approveAdmittedNarratorCasting({
      projectId: input.projectId,
      admission: readJson<AudioStudioNarratorProfileAdmission>(input.admissionPath),
      approvedBy: input.approvedBy,
      approvedAt: input.approvedAt,
    });
  }
  const manifest = readJson<ProjectManifest>(input.projectPath);
  const admittedCasting = readJson<AdmittedNarratorCasting>(input.castingAdmissionPath);
  assertAdmittedNarratorCasting(admittedCasting);
  if (input.command === "jobs") {
    return createNarratorProductionJobs(manifest, admittedCasting, input.candidateCount);
  }
  const dataDirectory = input.dataDirectory;
  if (!dataDirectory) throw new Error("NARRATOR_PRODUCTION_DATA_DIRECTORY_REQUIRED");
  const queue = new FileGenerationQueue(
    new FileProjectStore(resolve(dataDirectory, "generation-queue")),
  );
  const rows = await enqueueNarratorProduction({
    queue,
    manifest,
    admittedCasting,
    candidateCount: input.candidateCount,
  });
  return rows.map((row) => ({
    id: row.payload.id,
    jobId: row.payload.jobId,
    projectId: row.payload.projectId,
    segmentId: row.payload.segmentId,
    status: row.payload.status,
    revision: row.revision,
    contentHash: row.contentHash,
  }));
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const result = await executeNarratorProductionCommand(parse(argv));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof Error ? error.message : "NARRATOR_PRODUCTION_FAILED";
    process.stderr.write(`${code}\n`);
    return 2;
  }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
