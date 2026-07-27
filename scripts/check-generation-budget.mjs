import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing generation-budget file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing generation-budget contract token: ${token}`);
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
  "packages/storyteller/src/generation-budget.ts",
  "packages/storyteller/src/generation-budget.test.ts",
  "packages/storyteller/src/generation-worker.ts",
  "packages/storyteller/src/heartbeat-worker.ts",
  "packages/storyteller/src/artifact-queue.ts",
  "packages/storyteller/package.json",
  "docs/GENERATION_BUDGET.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/generation-budget.ts", [
  "GenerationBudgetReservation",
  "GenerationBudgetSettlement",
  "GenerationBudgetSession",
  "GenerationBudgetControllerOptions",
  "FileGenerationBudgetController",
  "GENERATION_BUDGET_POLICY_REQUIRED",
  "GENERATION_BUDGET_ACTIVE_CLAIM_REQUIRED",
  "GENERATION_BUDGET_COMPLETION_ACCOUNTING_INVALID",
  "GENERATION_BUDGET_COMPLETION_EXCEEDS_RESERVATION",
  "GENERATION_BUDGET_PARTIAL_COST_COMMITTED",
  "GENERATION_BUDGET_RESULT_COST_UNRECONCILED",
  "GENERATION_BUDGET_PROVIDER_ATTEMPT_UNRECONCILED",
  "GENERATION_BUDGET_BLOCKED_BEFORE_PROVIDER",
  "GENERATION_BUDGET_RETRY_WITHOUT_PROVIDER",
  "settleInterrupted",
  "isGenerationBudgetAdmissionError",
  "generationBudgetReservationPublicView",
]);

requireTokens("packages/storyteller/src/generation-budget.test.ts", [
  "budget reservation is created before provider execution and complete settlement commits actual cost",
  "configuration block before a provider attempt releases the reservation",
  "retry without a provider attempt releases capacity for the next queue attempt",
  "partial successful output commits observed cost before a block or retry transition",
  "unreconciled provider attempts conservatively commit the full reservation",
  "observed partial cost above the reservation is capped and marked conservative",
  "interrupted work commits the maximum reservation and repeated settlement is idempotent",
  "controller requires policy, active claim, account capacity and bounded timing",
  "complete settlement fails closed on missing, mismatched or excessive accounting",
  "public reservation projection omits project, queue and reservation identities",
  "GENERATION_BUDGET_WORKER_INTERRUPTED",
]);

requireTokens("packages/storyteller/src/generation-worker.ts", [
  "GenerationWorkerCostAccounting",
  "GenerationWorkerQueueTransition",
  'kind: "block"',
  'kind: "retry"',
  'kind: "complete"',
  "attemptedProviderCount",
  "successfulResultCount",
  "beforeTerminalTransition",
  "beforeQueueComplete: async",
]);

requireTokens("packages/storyteller/src/artifact-queue.ts", [
  "beforeQueueComplete",
  "admissionFingerprint",
  "await input.beforeQueueComplete?.",
  "input.queue.complete",
]);

requireTokens("packages/storyteller/src/heartbeat-worker.ts", [
  "beforeQueueTransition",
  "await heartbeat.stopForTerminalTransition()",
  "await beforeQueueTransition?.(transition)",
]);

requireTokens("docs/GENERATION_BUDGET.md", [
  "Admission before provider work",
  "Reservation duration",
  "Queue-transition settlement",
  "Partial or unsuccessful provider work",
  "Interrupted work",
  "Settlement idempotency",
  "Public projection",
  "Internal-only boundary",
  "Production sequence",
  "Queue completion must never occur before budget settlement",
  "provider invocation must never occur before reservation",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./generation-budget"] !== "./src/generation-budget.ts") {
    problems.push("storyteller package does not export ./generation-budget from its governed source module");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/generation-budget.ts"))
  ? read("packages/storyteller/src/generation-budget.ts")
  : "";
const publicViewStart = source.indexOf("export function generationBudgetReservationPublicView");
if (publicViewStart < 0) {
  problems.push("generation budget reservation public view is missing");
} else {
  const publicView = source.slice(publicViewStart);
  for (const forbidden of [
    "projectId:",
    "reservationId:",
    "jobId:",
    "queueItemId:",
    "attempt:",
    "actorId:",
    "leaseToken",
    "credential",
    "providerRequestId",
    "objectKey",
  ]) {
    if (publicView.includes(forbidden)) {
      problems.push(`generation budget public view exposes private execution field: ${forbidden}`);
    }
  }
}

const artifactQueueSource = existsSync(fromRoot("packages/storyteller/src/artifact-queue.ts"))
  ? read("packages/storyteller/src/artifact-queue.ts")
  : "";
const settlementIndex = artifactQueueSource.indexOf("await input.beforeQueueComplete?.");
const queueCompleteIndex = artifactQueueSource.indexOf("input.queue.complete", settlementIndex);
if (
  settlementIndex < 0
  || queueCompleteIndex < 0
  || settlementIndex >= queueCompleteIndex
) {
  problems.push("artifact admission must invoke settlement before queue completion");
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtimeSource = read(path);
  for (const forbidden of [
    "FileGenerationBudgetController",
    "generation-budget",
    "GenerationBudgetSession",
    "settleInterrupted(",
  ]) {
    if (runtimeSource.includes(forbidden)) {
      problems.push(`${path} exposes generation budget mutation through a normal application surface: ${forbidden}`);
    }
  }
}

for (const path of [
  ".github/workflows/one-time-worker-transition-hooks.yml",
  ".github/worker-transition-hooks.trigger",
  ".github/workflows/one-time-worker-transition-hooks-v2.yml",
  ".github/worker-transition-hooks-v2.trigger",
]) {
  if (existsSync(fromRoot(path))) {
    problems.push(`completed worker transition migration file remains in the repository: ${path}`);
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio generation budget check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_generation_budget_check_passed");
console.log("- an active queue attempt and approved cost policy are required before reservation");
console.log("- complete settlement follows artifact admission and precedes queue completion");
console.log("- pre-provider block and retry paths release their holds");
console.log("- attempted provider work without trustworthy cost is settled conservatively");
console.log("- interrupted work cannot silently return potentially spent capacity");
console.log("- public projections omit project, job, queue, reservation and provider identity");
console.log("- normal API and browser runtimes expose no budget settlement capability");
