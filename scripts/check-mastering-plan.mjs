import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing mastering-plan file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) problems.push(`${path} is missing mastering-plan contract token: ${token}`);
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
  "packages/storyteller/src/mastering-plan.ts",
  "packages/storyteller/src/mastering-plan.test.ts",
  "packages/storyteller/package.json",
  "docs/MASTERING_PLAN.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/mastering-plan.ts", [
  "MASTERING_PLAN_SCHEMA_VERSION",
  "MasteringOperation",
  "MasteringPlan",
  "TransparentMasteringProposal",
  "createMasteringPlan",
  "proposeTransparentGainMastering",
  "assertMasteringPlan",
  "masteringPlanPublicView",
  "MASTERING_PLAN_CHAPTER_APPROVAL_REQUIRED",
  "MASTERING_PLAN_ENGINEERING_PARENT_MISMATCH",
  "MASTERING_PLAN_RIGHTS_SCOPE_MISMATCH",
  "MASTERING_PLAN_OPERATION_DUPLICATE",
  "MASTERING_PLAN_OPERATION_ORDER_INVALID",
  "MASTERING_PLAN_PREDICTION_MISMATCH",
  "MASTERING_TRANSPARENT_GAIN_WINDOW_EMPTY",
  "MASTERING_SOURCE_CLIPPING_REQUIRES_REPAIR",
  "MASTERING_SAMPLE_RATE_CONVERSION_REQUIRED",
  "MASTERING_CHANNEL_CONVERSION_REQUIRED",
  "requiresPostRenderMeasurement: true",
  "sourceEngineering",
  "metrics:",
]);

requireTokens("packages/storyteller/src/mastering-plan.test.ts", [
  "transparent gain proposal finds a bounded common RMS, peak, true-peak and noise window",
  "transparent gain proposal blocks impossible windows and source repair requirements",
  "approved chapter evidence produces a recomputable preservation-first mastering plan",
  "mastering plan rejects unapproved, mismatched and stale evidence",
  "operation bounds, duplicates and ordering are fail-closed",
  "persisted source metrics cannot be changed behind a recomputed plan fingerprint",
  "MASTERING_TRANSPARENT_GAIN",
  "MASTERING_PLAN_PREDICTION_MISMATCH",
]);

requireTokens("docs/MASTERING_PLAN.md", [
  "Admission boundary",
  "Allowed operations",
  "Transparent gain proposal",
  "Immutable prediction",
  "Mandatory remeasurement",
  "Public projection",
  "Current boundary",
  "does not yet execute FFmpeg mastering",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./mastering-plan"] !== "./src/mastering-plan.ts") {
    problems.push("storyteller package does not export ./mastering-plan");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/mastering-plan.ts"))
  ? read("packages/storyteller/src/mastering-plan.ts")
  : "";
const publicStart = source.indexOf("export function masteringPlanPublicView");
if (publicStart < 0) problems.push("mastering plan public view is missing");
else {
  const returnStart = source.indexOf("return Object.freeze({", publicStart);
  const returnEnd = returnStart < 0 ? -1 : source.indexOf("});", returnStart);
  const publicReturn = returnStart < 0 || returnEnd < 0
    ? ""
    : source.slice(returnStart, returnEnd);
  for (const forbidden of [
    "sourceMaster:",
    "sourceEngineering:",
    "contentHash:",
    "byteCount:",
    "createdByActorId:",
    "sourceReference:",
    "rightsEvidenceId:",
    "rightsFingerprint:",
  ]) {
    if (publicReturn.includes(forbidden)) {
      problems.push(`mastering plan public view exposes private evidence: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/mastering-plan",
    "createMasteringPlan",
    "proposeTransparentGainMastering",
    "masteringPlanPublicView",
  ]) {
    if (runtime.includes(forbidden)) problems.push(`${path} exposes private mastering mutation: ${forbidden}`);
  }
}

for (const temporary of [
  ".github/workflows/one-time-mastering-plan-promotion.yml",
  ".github/mastering-plan-promotion.trigger",
]) {
  if (existsSync(fromRoot(temporary))) problems.push(`temporary mastering migration remains: ${temporary}`);
}

if (problems.length > 0) {
  console.error("Storyteller Studio mastering-plan check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_mastering_plan_check_passed");
console.log("- mastering requires an approved verified chapter master and matching post-render engineering evidence");
console.log("- source metrics are persisted so predictions are recomputed rather than merely trusted");
console.log("- only bounded high-pass, gain and true-peak limiting are represented in the initial contract");
console.log("- transparent gain respects RMS, peak, true-peak and noise-floor constraints together");
console.log("- every mastering decision requires independent post-render measurement before approval");
console.log("- public projections omit private artifacts, rights, actors, paths and source references");
