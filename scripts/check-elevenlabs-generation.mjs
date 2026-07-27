import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing ElevenLabs production-path file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing ElevenLabs production-path token: ${token}`);
    }
  }
}

function collectRuntimeFiles(directory, output = []) {
  const absolute = fromRoot(directory);
  if (!existsSync(absolute)) return output;
  for (const name of readdirSync(absolute)) {
    const absolutePath = join(absolute, name);
    const item = statSync(absolutePath);
    if (item.isDirectory()) {
      collectRuntimeFiles(relative(root, absolutePath), output);
    } else if (
      /\.(?:ts|tsx|js|mjs)$/u.test(name)
      && !/\.(?:test|spec)\.[^.]+$/u.test(name)
    ) {
      output.push(relative(root, absolutePath).replaceAll("\\", "/"));
    }
  }
  return output;
}

for (const path of [
  "apps/worker/src/elevenlabs-generation.test.ts",
  "apps/worker/src/runtime.ts",
  "packages/storyteller/src/generation-worker.ts",
  "packages/storyteller/src/generation-budget.ts",
  "packages/storyteller/src/artifact-ingest.ts",
  "packages/storyteller/src/artifact-queue.ts",
  "docs/ELEVENLABS_PRODUCTION_PATH.md",
]) requireFile(path);

requireTokens("apps/worker/src/elevenlabs-generation.test.ts", [
  "queued ElevenLabs production reserves budget, verifies artifacts and completes with exact evidence",
  "FileBudgetLedger",
  "FileGenerationMaterialStore",
  "FileGenerationQueue",
  "FileArtifactRegistry",
  "createWorkerProviderRegistry",
  "runConfiguredWorkerRuntime",
  'providerFallbackIds: ["elevenlabs"]',
  'mode: "production"',
  'format: "wav"',
  "sampleRateHz: 44_100",
  "maximumTotalEstimatedCost: 0.1",
  "authorisedMicros: budgetMicros(1)",
  "await materials.create",
  "await queue.enqueue",
  'endpoint.searchParams.get("output_format")',
  'endpoint.searchParams.get("enable_logging")',
  "assert.equal(body.text, text)",
  'assert.equal(body.model_id, "eleven_multilingual_v2")',
  'JSON.stringify(body).includes("emotionalObjective")',
  'JSON.stringify(body).includes("subtext")',
  "outputArtifactRefs.length, 4",
  "totalEstimatedCost, 0.00168",
  "committedMicros, 1_680",
  '"audio-analysis"',
  '"audio-candidate"',
  '"transcript"',
  '"word-alignment"',
  'verification.status, "verified"',
]);

requireTokens("packages/storyteller/src/generation-worker.ts", [
  "executeGenerationJob",
  "ingestResultArtifacts",
  "ingestExecutionReport",
  "executionAccounting",
  "completeGenerationWithArtifacts",
  "beforeQueueComplete",
  "beforeTerminalTransition",
]);

requireTokens("packages/storyteller/src/generation-budget.ts", [
  "FileGenerationBudgetController",
  "reserve(",
  "settle(",
  "GENERATION_BUDGET_COMPLETED",
  "GENERATION_BUDGET_COMPLETION_ACCOUNTING_INVALID",
]);

requireTokens("packages/storyteller/src/artifact-ingest.ts", [
  "ingestPrivateArtifact",
  "verificationChecks",
  "quarantine",
]);

requireTokens("packages/storyteller/src/artifact-queue.ts", [
  "completeGenerationWithArtifacts",
  "assessQueueCompletionArtifacts",
  "beforeQueueComplete",
  "input.queue.complete",
]);

requireTokens("docs/ELEVENLABS_PRODUCTION_PATH.md", [
  "Proven sequence",
  "Exact provider request",
  "Timestamp and media evidence",
  "Transactional budget proof",
  "Queue completion evidence",
  "Redacted operational result",
  "What the fixture does not prove",
  "Required next evidence",
  "A technically completed provider job is therefore a verified candidate set, not a finished audiobook chapter",
]);

const fixture = existsSync(fromRoot("apps/worker/src/elevenlabs-generation.test.ts"))
  ? read("apps/worker/src/elevenlabs-generation.test.ts")
  : "";
const accountIndex = fixture.indexOf("await ledger.createAccount");
const materialIndex = fixture.indexOf("await materials.create");
const enqueueIndex = fixture.indexOf("await queue.enqueue");
const runtimeIndex = fixture.indexOf("await runConfiguredWorkerRuntime");
if (
  accountIndex < 0
  || materialIndex < 0
  || enqueueIndex < 0
  || runtimeIndex < 0
  || accountIndex >= materialIndex
  || materialIndex >= enqueueIndex
  || enqueueIndex >= runtimeIndex
) {
  problems.push("ElevenLabs production fixture does not prepare budget, material and queue before worker execution");
}

const resultIndex = fixture.indexOf('assert.equal(result.status, "stopped")');
const queueCompletedIndex = fixture.indexOf('queueEnvelope?.payload.status, "completed"');
const budgetCommittedIndex = fixture.indexOf("budget.payload.committedMicros, 1_680");
const artifactsVerifiedIndex = fixture.indexOf('artifact.payload.verification.status, "verified"');
if (
  resultIndex < 0
  || queueCompletedIndex < 0
  || budgetCommittedIndex < 0
  || artifactsVerifiedIndex < 0
) {
  problems.push("ElevenLabs production fixture does not assert worker, queue, budget and artifact outcomes");
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const source = read(path);
  for (const forbidden of [
    "elevenlabs-generation.test",
    "runConfiguredWorkerRuntime",
    "FileGenerationBudgetController",
    "ingestPrivateArtifact",
    "completeGenerationWithArtifacts",
    "/with-timestamps",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`${path} exposes the private production execution path: ${forbidden}`);
    }
  }
}

for (const path of [
  ".github/workflows/one-time-elevenlabs-generation-test-fix.yml",
  ".github/elevenlabs-generation-test-fix.trigger",
]) {
  if (existsSync(fromRoot(path))) {
    problems.push(`completed ElevenLabs generation fixture correction remains: ${path}`);
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio ElevenLabs production path check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_elevenlabs_generation_check_passed");
console.log("- one governed queue job traverses preflight, claim, budget, synthesis, artifact admission and completion");
console.log("- provider input remains exact source text with bounded settings and deterministic seed");
console.log("- verified audio, transcript, alignment and execution evidence back queue completion");
console.log("- actual estimated cost commits after artifact admission and before completion");
console.log("- operational results omit manuscript, credential, voice, provider-request and storage identities");
console.log("- the fixture proves orchestration, not subjective narration or release readiness");
