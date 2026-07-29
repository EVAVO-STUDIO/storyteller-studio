#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
import type { ElevenLabsModelId } from "@evavo/storyteller-engine/elevenlabs-adapter";
import {
  FileGenerationQueue,
  type GenerationQueueItem,
  type GenerationQueueStatus,
} from "@evavo/storyteller-engine/generation-queue";
import {
  FileProjectStore,
  type StoredEnvelope,
} from "@evavo/storyteller-engine/project-store";
import {
  createElevenLabsPricingForConfiguration,
  validateElevenLabsConfigurationDocument,
} from "./elevenlabs-config.js";
import type { AudiobookRetailPublicationVerification } from "@evavo/storyteller-engine/audiobook-retail-publication-verification";
import { submitPublicationEvidenceCommand } from "./publication-evidence.js";

export type ParsedArguments = {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
};

const QUEUE_STATUSES: readonly GenerationQueueStatus[] = [
  "queued",
  "leased",
  "retry-wait",
  "completed",
  "blocked",
  "failed",
  "cancelled",
];

export function parseArguments(argv: readonly string[]): ParsedArguments {
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

function dateFlag(args: ParsedArguments, key: string): Date | undefined {
  const value = stringFlag(args, key);
  if (value === undefined) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`CLI_FLAG_DATE_INVALID:${key}`);
  return parsed;
}

function queueStatusesFlag(args: ParsedArguments): readonly GenerationQueueStatus[] | undefined {
  const value = stringFlag(args, "status");
  if (!value) return undefined;
  const output = new Set<GenerationQueueStatus>();
  for (const status of value.split(",").map((item) => item.trim()).filter(Boolean)) {
    if (!QUEUE_STATUSES.includes(status as GenerationQueueStatus)) {
      throw new Error(`CLI_QUEUE_STATUS_INVALID:${status}`);
    }
    output.add(status as GenerationQueueStatus);
  }
  return [...output];
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

function localGenerationQueue(args: ParsedArguments): FileGenerationQueue {
  const dataDirectory = stringFlag(args, "data-dir") ?? process.env.STORYTELLER_DATA_DIR?.trim();
  if (!dataDirectory) throw new Error("CLI_FLAG_REQUIRED:data-dir");
  return new FileGenerationQueue(
    new FileProjectStore(resolve(dataDirectory, "generation-queue")),
  );
}

export function queueCliView(envelope: StoredEnvelope<GenerationQueueItem>): Record<string, unknown> {
  const { lease, ...item } = envelope.payload;
  return {
    ...item,
    ...(lease
      ? {
          lease: {
            workerId: lease.workerId,
            acquiredAt: lease.acquiredAt,
            heartbeatAt: lease.heartbeatAt,
            expiresAt: lease.expiresAt,
          },
        }
      : {}),
    revision: envelope.revision,
    contentHash: envelope.contentHash,
  };
}

function help(): void {
  process.stdout.write(`EVAVO Storyteller Studio CLI\n\n`);
  process.stdout.write(`Usage: npm run storyteller -- <command> [options]\n\n`);
  process.stdout.write(`Commands:\n`);
  process.stdout.write(`  segment        Segment an immutable manuscript into stable production units.\n`);
  process.stdout.write(`  plan           Build a governed project manifest from manuscript, rights and provider evidence.\n`);
  process.stdout.write(`  providers      Rank a provider catalogue against explicit project requirements.\n`);
  process.stdout.write(`  take-check     Evaluate transcript fidelity, engineering limits and continuity evidence.\n`);
  process.stdout.write(`  visual-plan    Build scene-level visual beats without literal sentence-by-sentence imagery.\n`);
  process.stdout.write(`  jobs           Create deterministic generation job intents from a project manifest.\n`);
  process.stdout.write(`  elevenlabs-pricing  Create an immutable, expiring pricing snapshot without provider access.\n`);
  process.stdout.write(`  elevenlabs-validate Validate a complete ElevenLabs configuration offline.\n`);
  process.stdout.write(`  queue-enqueue  Persist generation intents to the local, single-host queue.\n`);
  process.stdout.write(`  queue-list     List local queue state without exposing lease tokens.\n`);
  process.stdout.write(`  queue-show     Inspect one local queue item without exposing its lease token hash.\n`);
  process.stdout.write(`  queue-cancel   Cancel queued or in-flight work as an identified operator.\n`);
  process.stdout.write(`  queue-reap     Requeue expired worker leases or fail exhausted work.\n`);
  process.stdout.write(`  publication-evidence-submit  Admit complete governed publication verification to the private inbox.\n`);
  process.stdout.write(`  verify         Validate structural invariants in a project manifest.\n`);
  process.stdout.write(`  generate       Explain why provider execution remains gated until an adapter is configured.\n\n`);
  process.stdout.write(`Examples:\n`);
  process.stdout.write(`  npm run storyteller -- segment --input book.txt --output segments.json\n`);
  process.stdout.write(`  npm run storyteller -- plan --title "Book One" --input book.txt --rights rights.json --requirements requirements.json --providers providers.json --output project.json\n`);
  process.stdout.write(`  npm run storyteller -- elevenlabs-pricing --model eleven_multilingual_v2 --currency AUD --micros-per-thousand 120000 --effective-from 2026-07-01T00:00:00Z --expires-at 2026-08-31T00:00:00Z --source-reference elevenlabs-pricing-2026-07 --output pricing.json\n`);
  process.stdout.write(`  npm run storyteller -- elevenlabs-validate --input elevenlabs.json --validation-at 2026-07-27T00:00:00Z --output elevenlabs-summary.json\n`);
  process.stdout.write(`  npm run storyteller -- queue-enqueue --project project.json --data-dir ./storage\n`);
  process.stdout.write(`  npm run storyteller -- queue-list --data-dir ./storage --status queued,retry-wait\n`);
  process.stdout.write(`  npm run storyteller -- queue-cancel --data-dir ./storage --item-id queue_job_123 --actor-id operator_greg --reason "Direction review required"\n`);
  process.stdout.write(`  npm run storyteller -- publication-evidence-submit --data-dir ./storage --monitor-id publication_monitor_001 --verification verification.json --source-reference-hash <sha256> --actor-id operator_greg --output intake.json\n`);
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

export async function run(args: ParsedArguments): Promise<number> {
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

    case "elevenlabs-pricing": {
    const rate = numberFlag(args, "micros-per-thousand");
    if (rate === undefined) throw new Error("CLI_FLAG_REQUIRED:micros-per-thousand");
    if (!Number.isSafeInteger(rate) || rate < 1) {
      throw new Error("CLI_FLAG_INTEGER_INVALID:micros-per-thousand");
    }
    const result = createElevenLabsPricingForConfiguration({
      modelId: stringFlag(args, "model", true)! as ElevenLabsModelId,
      currency: stringFlag(args, "currency", true)!,
      microsPerThousandCharacters: rate,
      effectiveFrom: stringFlag(args, "effective-from", true)!,
      expiresAt: stringFlag(args, "expires-at", true)!,
      sourceReference: stringFlag(args, "source-reference", true)!,
    });
    emit(result, output, force);
    return 0;
  }

  case "elevenlabs-validate": {
    const document = readJson<unknown>(stringFlag(args, "input", true)!);
    const result = validateElevenLabsConfigurationDocument(
      document,
      dateFlag(args, "validation-at") ?? new Date(),
    );
    emit(result, output, force);
    return 0;
  }

    case "queue-enqueue": {
      const manifest = readJson<ProjectManifest>(stringFlag(args, "project", true)!);
      const jobs = createGenerationJobs(manifest, numberFlag(args, "candidates") ?? 2);
      const queue = localGenerationQueue(args);
      const availableAt = dateFlag(args, "available-at");
      const rows: Record<string, unknown>[] = [];
      for (const job of jobs) {
        const envelope = await queue.enqueue(job, {
          priority: numberFlag(args, "priority") ?? 50,
          maxAttempts: numberFlag(args, "max-attempts") ?? 4,
          ...(availableAt ? { availableAt } : {}),
        });
        rows.push(queueCliView(envelope));
      }
      emit({ data: rows, execution: rows.some((row) => row.status === "queued") ? "queued" : "blocked" }, output, force);
      return rows.some((row) => row.status === "queued") ? 0 : 2;
    }

    case "queue-list": {
      const queue = localGenerationQueue(args);
      const statuses = queueStatusesFlag(args);
      const rows = await queue.list({
        ...(stringFlag(args, "project-id") ? { projectId: stringFlag(args, "project-id") } : {}),
        ...(statuses ? { status: statuses } : {}),
      });
      const limit = numberFlag(args, "limit") ?? 100;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) throw new Error("CLI_QUEUE_LIMIT_INVALID");
      const selected = rows.slice(0, limit);
      emit({
        data: selected.map(queueCliView),
        meta: { total: rows.length, returned: selected.length, truncated: rows.length > selected.length },
      }, output, force);
      return 0;
    }

    case "queue-show": {
      const queue = localGenerationQueue(args);
      const itemId = stringFlag(args, "item-id", true)!;
      const envelope = await queue.read(itemId);
      if (!envelope) {
        emit({ ok: false, code: "CLI_QUEUE_ITEM_NOT_FOUND", itemId }, output, force);
        return 2;
      }
      emit({ data: queueCliView(envelope) }, output, force);
      return 0;
    }

    case "queue-cancel": {
      const queue = localGenerationQueue(args);
      const envelope = await queue.cancel(stringFlag(args, "item-id", true)!, {
        actorId: stringFlag(args, "actor-id", true)!,
        reason: stringFlag(args, "reason", true)!,
      });
      emit({ data: queueCliView(envelope) }, output, force);
      return 0;
    }

    case "queue-reap": {
      const reaped = await localGenerationQueue(args).reapExpiredLeases();
      emit({ reaped }, output, force);
      return 0;
    }

    case "publication-evidence-submit": {
    const dataDirectory = stringFlag(args, "data-dir")
      ?? process.env.STORYTELLER_DATA_DIR?.trim();
    if (!dataDirectory) throw new Error("CLI_FLAG_REQUIRED:data-dir");
    const receivedAt = dateFlag(args, "received-at");
    const result = await submitPublicationEvidenceCommand({
      dataDirectory,
      monitorId: stringFlag(args, "monitor-id", true)!,
      verification: readJson<AudiobookRetailPublicationVerification>(
        stringFlag(args, "verification", true)!,
      ),
      sourceReferenceHash: stringFlag(
        args,
        "source-reference-hash",
        true,
      )!,
      actorId: stringFlag(args, "actor-id", true)!,
      ...(receivedAt ? { receivedAt } : {}),
    });
    emit(result, output, force);
    return 0;
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

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  run(parseArguments(process.argv.slice(2)))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "CLI_UNEXPECTED_ERROR";
      process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
      process.exitCode = message.startsWith("CLI_FLAG_REQUIRED") || message.startsWith("CLI_COMMAND_UNKNOWN") ? 64 : 1;
    });
}
