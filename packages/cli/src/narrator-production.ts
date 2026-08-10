#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectManifest } from "@evavo/storyteller-engine";
import { FileGenerationQueue } from "@evavo/storyteller-engine/generation-queue";
import {
  createNarratorProductionJobs,
} from "@evavo/storyteller-engine/narrator-production-job";
import {
  enqueueNarratorProduction,
} from "@evavo/storyteller-engine/narrator-production-queue";
import {
  assertNarratorCasting,
  type NarratorCastingApproval,
} from "@evavo/storyteller-engine/narrator-voice-profile";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";

export interface NarratorProductionCliInput {
  command: "jobs" | "queue";
  projectPath: string;
  castingPath: string;
  candidateCount: number;
  dataDirectory?: string;
}

function readJson<T>(pathValue: string): T {
  const path = resolve(pathValue);
  if (!existsSync(path)) throw new Error(`NARRATOR_PRODUCTION_FILE_NOT_FOUND:${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    throw new Error(`NARRATOR_PRODUCTION_JSON_INVALID:${path}`);
  }
}

function parse(argv: readonly string[]): NarratorProductionCliInput {
  const [commandRaw, ...tokens] = argv;
  if (commandRaw !== "jobs" && commandRaw !== "queue") {
    throw new Error("NARRATOR_PRODUCTION_COMMAND_INVALID");
  }
  const flags = new Map<string, string>();
  for (let index = 0; index < tokens.length; index += 2) {
    const key = tokens[index];
    const value = tokens[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("NARRATOR_PRODUCTION_ARGUMENT_INVALID");
    }
    flags.set(key.slice(2), value);
  }
  const projectPath = flags.get("project");
  const castingPath = flags.get("casting");
  if (!projectPath) throw new Error("NARRATOR_PRODUCTION_PROJECT_REQUIRED");
  if (!castingPath) throw new Error("NARRATOR_PRODUCTION_CASTING_REQUIRED");
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
    castingPath,
    candidateCount,
    ...(dataDirectory ? { dataDirectory } : {}),
  };
}

export async function executeNarratorProductionCommand(
  input: NarratorProductionCliInput,
): Promise<unknown> {
  const manifest = readJson<ProjectManifest>(input.projectPath);
  const casting = readJson<NarratorCastingApproval>(input.castingPath);
  assertNarratorCasting(casting);
  if (input.command === "jobs") {
    return createNarratorProductionJobs(manifest, casting, input.candidateCount);
  }
  const dataDirectory = input.dataDirectory;
  if (!dataDirectory) throw new Error("NARRATOR_PRODUCTION_DATA_DIRECTORY_REQUIRED");
  const queue = new FileGenerationQueue(
    new FileProjectStore(resolve(dataDirectory, "generation-queue")),
  );
  const rows = await enqueueNarratorProduction({
    queue,
    manifest,
    casting,
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
