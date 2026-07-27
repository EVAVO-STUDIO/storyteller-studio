#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assessCandidateTake,
  buildVisualBeatPlan,
  createGenerationJobs,
  createProjectManifest,
  rankProviders,
  segmentManuscript,
  type CreateProjectInput,
  type ProjectManifest,
  type ProviderProfile,
  type ProviderRequirements,
  type TakeObservation,
  type VoiceRightsEvidence,
} from "@evavo/storyteller-engine";

type ParsedArguments = {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
};

function parseArguments(argv: readonly string[]): ParsedArguments {
  const [command = "help", ...rest] = argv;
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token) continue;
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const key = token.slice(2);
    if (!key) throw new Error("CLI_FLAG_INVALID");
    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { command, positionals, flags };
}

function stringFlag(args: ParsedArguments, key: string, required = false): string | undefined {
  const value = args.flags[key];
  if (typeof value === "string" && value.trim()) return value;
  if (required) throw new Error(`CLI_FLAG_REQUIRED:${key}`);
  return undefined;
}

function numberFlag(args: ParsedArguments, key: string): number | undefined {
  const value = stringFlag(args, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`CLI_FLAG_NUMBER_INVALID:${key}`);
  return parsed;
}

function readText(pathValue: string): string {
  const path = resolve(pathValue);
  if (!existsSync(path)) throw new Error(`CLI_FILE_NOT_FOUND:${path}`);
  return readFileSync(path, "utf8");
}

function readJson<T>(pathValue: string): T {
  const path = resolve(pathValue);
  try {
    return JSON.parse(readText(path)) as T;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CLI_FILE_NOT_FOUND")) throw error;
    throw new Error(`CLI_JSON_INVALID:${path}`);
  }
}

function emit(value: unknown, outputPath?: string, force = false): void {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (!outputPath) {
    process.stdout.write(content);
    return;
  }
  const path = resolve(outputPath);
  if (existsSync(path) && !force) throw new Error(`CLI_OUTPUT_EXISTS:${path}`);
  writeFileSync(path, content, { encoding: "utf8", flag: force ? "w" : "wx" });
  process.stdout.write(`${path}\n`);
}

function help(): void {
  process.stdout.write(`EVAVO Storyteller Studio CLI\n\n`);
  process.stdout.write(`Usage: npm run storyteller -- <command> [options]\n\n`);
  process.stdout.write(`Commands:\n`);
  process.stdout.write(`  segment       Segment an immutable manuscript into stable production units.\n`);
  process.stdout.write(`  plan          Build a governed project manifest from manuscript, rights and provider evidence.\n`);
  process.stdout.write(`  providers     Rank a provider catalogue against explicit project requirements.\n`);
  process.stdout.write(`  take-check    Evaluate transcript fidelity, engineering limits and continuity evidence.\n`);
  process.stdout.write(`  visual-plan   Build scene-level visual beats without literal sentence-by-sentence imagery.\n`);
  process.stdout.write(`  jobs          Create deterministic generation job intents from a project manifest.\n`);
  process.stdout.write(`  verify        Validate structural invariants in a project manifest.\n`);
  process.stdout.write(`  generate      Explain why provider execution remains gated until an adapter is configured.\n\n`);
  process.stdout.write(`Examples:\n`);
  process.stdout.write(`  npm run storyteller -- segment --input book.txt --output segments.json\n`);
  process.stdout.write(`  npm run storyteller -- plan --title "Book One" --input book.txt --rights rights.json --requirements requirements.json --providers providers.json --output project.json\n`);
  process.stdout.write(`  npm run storyteller -- take-check --input take-observation.json\n`);
}

function verifyManifest(manifest: ProjectManifest): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (manifest.schemaVersion !== "storyteller-project-v1") problems.push("schema version is unsupported");
  if (!/^[a-f0-9]{64}$/u.test(manifest.sourceHash)) problems.push("source hash is not SHA-256");
  if (!/^[a-f0-9]{64}$/u.test(manifest.fingerprint)) problems.push("manifest fingerprint is not SHA-256");
  if (manifest.manuscript.sourceHash !== manifest.sourceHash) problems.push("manuscript and project source hashes differ");
  if (manifest.performance.manuscriptHash !== manifest.sourceHash) problems.push("performance plan is bound to a different manuscript");
  if (manifest.manuscript.segments.some((segment) => segment.sourceHash !== manifest.sourceHash)) problems.push("one or more segments are bound to a different source hash");
  if (manifest.manuscript.segments.some((segment, index) => segment.ordinal !== index + 1)) problems.push("segment ordinals are not contiguous");
  if (manifest.status === "planned" && !manifest.rights.ok) problems.push("planned project has an invalid rights gate");
  if (manifest.status === "planned" && !manifest.providers.some((provider) => provider.eligible)) problems.push("planned project has no eligible provider route");
  return { ok: problems.length === 0, problems };
}

async function run(args: ParsedArguments): Promise<number> {
  const output = stringFlag(args, "output");
  const force = args.flags.force === true;

  switch (args.command) {
    case "help":
    case "--help":
    case "-h":
      help();
      return 0;

    case "segment": {
      const input = stringFlag(args, "input", true)!;
      const maximumCharacters = numberFlag(args, "max-characters");
      const result = segmentManuscript(readText(input), { ...(maximumCharacters ? { maximumCharacters } : {}) });
      emit(result, output, force);
      return result.findings.some((finding) => finding.severity === "error") ? 2 : 0;
    }

    case "plan": {
      const title = stringFlag(args, "title", true)!;
      const manuscriptPath = stringFlag(args, "input", true)!;
      const rightsPath = stringFlag(args, "rights", true)!;
      const requirementsPath = stringFlag(args, "requirements", true)!;
      const providersPath = stringFlag(args, "providers", true)!;
      const seriesId = stringFlag(args, "series-id");
      const projectId = stringFlag(args, "project-id");
      const maximumCharacters = numberFlag(args, "max-characters");
      const input: CreateProjectInput = {
        ...(projectId ? { id: projectId } : {}),
        title,
        ...(seriesId ? { seriesId } : {}),
        manuscriptText: readText(manuscriptPath),
        rightsEvidence: readJson<VoiceRightsEvidence>(rightsPath),
        providerRequirements: readJson<ProviderRequirements>(requirementsPath),
        providerProfiles: readJson<ProviderProfile[]>(providersPath),
        ...(maximumCharacters ? { maxSegmentCharacters: maximumCharacters } : {}),
      };
      const result = createProjectManifest(input);
      emit(result, output, force);
      return result.status === "planned" ? 0 : 2;
    }

    case "providers": {
      const requirements = readJson<ProviderRequirements>(stringFlag(args, "requirements", true)!);
      const profiles = readJson<ProviderProfile[]>(stringFlag(args, "providers", true)!);
      const result = rankProviders(requirements, profiles);
      emit(result, output, force);
      return result.some((provider) => provider.eligible) ? 0 : 2;
    }

    case "take-check": {
      const observation = readJson<TakeObservation>(stringFlag(args, "input", true)!);
      const result = assessCandidateTake(observation);
      emit(result, output, force);
      return result.eligible ? 0 : 2;
    }

    case "visual-plan": {
      const source = readText(stringFlag(args, "input", true)!);
      const manuscript = segmentManuscript(source, { maximumCharacters: numberFlag(args, "max-characters") ?? 1_200 });
      const result = buildVisualBeatPlan(manuscript.segments, {
        targetSeconds: numberFlag(args, "target-seconds") ?? 14,
        maximumWords: numberFlag(args, "maximum-words") ?? 110,
      });
      emit(result, output, force);
      return 0;
    }

    case "jobs": {
      const manifest = readJson<ProjectManifest>(stringFlag(args, "project", true)!);
      const result = createGenerationJobs(manifest, numberFlag(args, "candidates") ?? 2);
      emit(result, output, force);
      return result.every((job) => job.status === "ready") ? 0 : 2;
    }

    case "verify": {
      const manifest = readJson<ProjectManifest>(stringFlag(args, "project", true)!);
      const result = verifyManifest(manifest);
      emit(result, output, force);
      return result.ok ? 0 : 2;
    }

    case "generate":
      emit({
        ok: false,
        code: "PROVIDER_EXECUTION_NOT_CONFIGURED",
        message: "Generation is intentionally unavailable until a rights-aware provider adapter, server-only credentials, budget policy and output store are configured.",
      }, output, force);
      return 2;

    default:
      throw new Error(`CLI_COMMAND_UNKNOWN:${args.command}`);
  }
}

run(parseArguments(process.argv.slice(2)))
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "CLI_UNEXPECTED_ERROR";
    process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
    process.exitCode = message.startsWith("CLI_FLAG_REQUIRED") || message.startsWith("CLI_COMMAND_UNKNOWN") ? 64 : 1;
  });
