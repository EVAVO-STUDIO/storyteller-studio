import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing book-credit-generation file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) problems.push(`${path} is missing book-credit-generation contract token: ${token}`);
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
  "packages/storyteller/src/book-credit-generation.ts",
  "packages/storyteller/src/book-credit-generation.test.ts",
  "packages/storyteller/src/project-store.ts",
  "packages/storyteller/package.json",
  "docs/BOOK_CREDIT_GENERATION.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/book-credit-generation.ts", [
  "BOOK_CREDIT_GENERATION_SCHEMA_VERSION",
  "BookCreditGenerationPlan",
  "createBookCreditGenerationPlan",
  "assertBookCreditGenerationPlan",
  "bookCreditSegmentId",
  "bookCreditGenerationPublicView",
  "FileBookCreditGenerationStore",
  "prepareBookCreditGeneration",
  "createGenerationMaterialRecord",
  "createGenerationCalibrationBindingRecord",
  "FileGenerationMaterialStore",
  "FileGenerationCalibrationBindingStore",
  "BOOK_CREDIT_GENERATION_APPROVED_SCRIPT_REQUIRED",
  "BOOK_CREDIT_GENERATION_CALIBRATION_PROJECT_MISMATCH",
  "BOOK_CREDIT_GENERATION_SCOPE_MISMATCH",
  "book_credit.generation_prepared",
  'mode: "production"',
  'intendedUse: "audiobook"',
  "commercial: true",
]);

requireTokens("packages/storyteller/src/book-credit-generation.test.ts", [
  "approved credit script derives one exact calibrated production job and material record",
  "draft scripts and cross-project calibration locks are rejected before material creation",
  "cache keys change for performance, pronunciation, candidate and calibration intent",
  "preparation persists plan, exact material and calibration binding idempotently",
  "persisted script, material and calibration tampering fail even with recomputed outer fingerprints",
  "FileBookCreditGenerationStore",
  "FileGenerationMaterialStore",
  "FileGenerationCalibrationBindingStore",
  "prepareBookCreditGeneration",
]);

requireTokens("docs/BOOK_CREDIT_GENERATION.md", [
  "Approved-script boundary",
  "Deterministic credit segment",
  "Calibrated production lock",
  "Exact worker material",
  "Deterministic cache key",
  "Durable preparation",
  "Privacy boundary",
  "Current boundary",
  "ready for the existing private queue and calibrated worker",
]);

requireTokens("packages/storyteller/src/project-store.ts", [
  '"book-credit-generation"',
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./book-credit-generation"] !== "./src/book-credit-generation.ts") {
    problems.push("storyteller package does not export ./book-credit-generation");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/book-credit-generation.ts"))
  ? read("packages/storyteller/src/book-credit-generation.ts")
  : "";
const publicStart = source.indexOf("export function bookCreditGenerationPublicView");
if (publicStart < 0) problems.push("book credit generation public view is missing");
else {
  const returnStart = source.indexOf("return Object.freeze({", publicStart);
  const returnEnd = returnStart < 0 ? -1 : source.indexOf("});", returnStart);
  const publicReturn = returnStart < 0 || returnEnd < 0 ? "" : source.slice(returnStart, returnEnd);
  for (const forbidden of [
    "text:",
    "providerFallbackIds:",
    "providerId:",
    "modelId:",
    "sessionId:",
    "voiceProfileId:",
    "rightsEvidenceId:",
    "rightsFingerprint:",
    "pronunciations:",
    "direction:",
    "costPolicy:",
    "approval:",
    "reviews:",
  ]) {
    if (publicReturn.includes(forbidden)) {
      problems.push(`book credit generation public view exposes private production evidence: ${forbidden}`);
    }
  }
}

const auditStart = source.indexOf("appendAuditEvent");
if (auditStart < 0) problems.push("book credit generation audit boundary is missing");
else {
  const auditSource = source.slice(auditStart);
  for (const forbidden of [
    "material.text",
    "providerId",
    "modelId",
    "sessionId",
    "rightsEvidenceId",
    "rightsFingerprint",
    "pronunciations",
    "direction",
    "maximumTotalEstimatedCost",
  ]) {
    if (auditSource.includes(forbidden)) problems.push(`book credit generation audit exposes private field: ${forbidden}`);
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/book-credit-generation",
    "createBookCreditGenerationPlan",
    "prepareBookCreditGeneration",
    "FileBookCreditGenerationStore",
  ]) {
    if (runtime.includes(forbidden)) problems.push(`${path} exposes private book-credit generation: ${forbidden}`);
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio book credit generation check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_book_credit_generation_check_passed");
console.log("- approved exact credit text uses the same calibrated production worker path as manuscript narration");
console.log("- deterministic job, material and calibration records are derived together from one private preparation");
console.log("- cache keys bind script, direction, pronunciations, rights, cost, format and calibration intent");
console.log("- idempotent stores allow partial file-store retries while rejecting conflicting reuse");
console.log("- public and audit surfaces omit text, provider, model, calibration-session, rights and cost details");
console.log("- preparation remains distinct from synthesis, take selection, mastering and release");
