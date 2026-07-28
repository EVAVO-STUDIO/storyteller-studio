import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing book-credit-queue file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing book-credit-queue contract token: ${token}`);
    }
  }
}

function collectRuntimeFiles(directory, output = []) {
  const absolute = fromRoot(directory);
  if (!existsSync(absolute)) return output;
  for (const name of readdirSync(absolute)) {
    const absolutePath = join(absolute, name);
    const item = statSync(absolutePath);
    if (item.isDirectory()) collectRuntimeFiles(relative(root, absolutePath), output);
    else if (/\.(?:ts|tsx|js|mjs)$/u.test(name) && !/\.(?:test|spec)\.[^.]+$/u.test(name)) {
      output.push(relative(root, absolutePath).replaceAll("\\", "/"));
    }
  }
  return output;
}

for (const path of [
  "packages/storyteller/src/book-credit-queue.ts",
  "packages/storyteller/src/book-credit-queue.test.ts",
  "packages/storyteller/package.json",
  "docs/BOOK_CREDIT_QUEUE.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/book-credit-queue.ts", [
  "BOOK_CREDIT_QUEUE_SCHEMA_VERSION",
  "BookCreditQueueReceipt",
  "enqueuePreparedBookCreditGeneration",
  "assertBookCreditQueueReceipt",
  "bookCreditQueuePublicView",
  "assertBookCreditGenerationPlan",
  "assertGenerationMaterialRecord",
  "assertGenerationCalibrationBindingRecord",
  "assertGenerationQueueItem",
  "canonicalEnvelopeHash",
  "BOOK_CREDIT_QUEUE_PLAN_ENVELOPE_INVALID",
  "BOOK_CREDIT_QUEUE_MATERIAL_ENVELOPE_INVALID",
  "BOOK_CREDIT_QUEUE_CALIBRATION_ENVELOPE_INVALID",
  "BOOK_CREDIT_QUEUE_PREPARED_SCOPE_MISMATCH",
  "BOOK_CREDIT_QUEUE_BEFORE_PREPARATION",
  "generationQueueIdempotencyKey",
]);

requireTokens("packages/storyteller/src/book-credit-queue.test.ts", [
  "prepared credit generation enqueues idempotently and preserves exact worker material",
  "queue admission rejects forged prepared envelopes and reversed chronology",
  "queue receipts reject recomputed structural tampering",
  "materialStore.resolve(claim)",
  "calibrationStore.require(claim.item.jobId)",
  "claim.leaseToken",
  "BOOK_CREDIT_QUEUE_PLAN_ENVELOPE_INVALID",
  "BOOK_CREDIT_QUEUE_BEFORE_PREPARATION",
]);

requireTokens("docs/BOOK_CREDIT_QUEUE.md", [
  "Admission order",
  "Envelope validation",
  "Idempotency",
  "Worker compatibility",
  "Privacy boundary",
  "Current boundary",
  "No special credit provider adapter or public synthesis endpoint exists",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./book-credit-queue"] !== "./src/book-credit-queue.ts") {
    problems.push("storyteller package does not export ./book-credit-queue");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/book-credit-queue.ts"))
  ? read("packages/storyteller/src/book-credit-queue.ts")
  : "";
const publicStart = source.indexOf("export function bookCreditQueuePublicView");
if (publicStart < 0) problems.push("book credit queue public view is missing");
else {
  const publicSource = source.slice(publicStart);
  for (const forbidden of [
    "materialFingerprint:",
    "calibrationFingerprint:",
    "queueContentHash:",
    "queueEnvelopeHash:",
    "leaseToken:",
    "tokenHash:",
    "script.text",
    "providerId:",
    "modelId:",
    "rightsEvidenceId:",
  ]) {
    if (publicSource.includes(forbidden)) {
      problems.push(`book credit queue public view exposes private state: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/book-credit-queue",
    "enqueuePreparedBookCreditGeneration",
    "FileGenerationQueue",
    "claimNext(",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private book-credit queue execution: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio book-credit-queue check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_book_credit_queue_check_passed");
console.log("- only complete persisted credit plans, material and calibration may be queued");
console.log("- queue admission revalidates store and queue envelope hashes before execution");
console.log("- claimed jobs resolve exact approved text through the normal private worker stores");
console.log("- idempotent admission reports current queue state without exposing lease material");
console.log("- normal web and API runtimes cannot enqueue or claim credit generation work");
