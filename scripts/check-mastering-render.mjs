import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing mastering-render file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) problems.push(`${path} is missing mastering-render contract token: ${token}`);
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
  "packages/storyteller/src/mastering-render.ts",
  "packages/storyteller/src/mastering-render.test.ts",
  "packages/storyteller/package.json",
  "docs/MASTERING_RENDERING.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/mastering-render.ts", [
  "MASTERING_RENDER_SCHEMA_VERSION",
  "MasteringSourceResolver",
  "MasteringRenderEvidence",
  "buildMasteringFilterScript",
  "renderMasteringPlan",
  "assertMasteringRenderEvidence",
  "masteringRenderPublicView",
  "NodeChapterRenderRunner",
  "assertAudioEngineeringEvidence",
  "MASTERING_RENDER_SOURCE_ENGINEERING_MISMATCH",
  "MASTERING_RENDER_SOURCE_INTEGRITY_MISMATCH",
  "MASTERING_RENDER_LIMITER_REDUCTION_EXCEEDS_PLAN",
  "MASTERING_RENDER_LIMITER_REDUCTION_REQUIRES_INTERMEDIATE_MEASUREMENT",
  "MASTERING_RENDER_OUTPUT_MEDIA_INVALID",
  "MASTERING_RENDER_FINGERPRINT_MISMATCH",
  "aresample=192000:resampler=soxr:precision=28",
  "level=0:latency=1",
  "aformat=sample_rates=",
]);

requireTokens("packages/storyteller/src/mastering-render.test.ts", [
  "deterministic mastering filters preserve operation order and explicit output",
  "limiter reduction bounds and high-pass uncertainty fail closed",
  "mastering render revalidates private source and emits redacted immutable evidence",
  "source integrity failure disposes the resolved private source before tool use",
  "source engineering mismatch and pre-abort fail before private source resolution",
  "invalid output media and runner failures are stable and always dispose sources",
  "render evidence tampering is detected",
  "FixtureResolver",
  "FixtureRunner",
  "EngineeringRunner",
]);

requireTokens("docs/MASTERING_RENDERING.md", [
  "Reused execution boundary",
  "Source admission",
  "Deterministic filters",
  "True-peak limiter",
  "Immutable evidence",
  "Failure posture",
  "Current boundary",
  "does not yet register a mastered artifact",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./mastering-render"] !== "./src/mastering-render.ts") {
    problems.push("storyteller package does not export ./mastering-render");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/mastering-render.ts"))
  ? read("packages/storyteller/src/mastering-render.ts")
  : "";
for (const forbidden of ["from \"node:child_process\"", "spawn(", "exec(", "execSync(", "shell: true"]) {
  if (source.includes(forbidden)) problems.push(`mastering renderer duplicates or weakens process execution: ${forbidden}`);
}
const publicStart = source.indexOf("export function masteringRenderPublicView");
if (publicStart < 0) problems.push("mastering render public view is missing");
else {
  const returnStart = source.indexOf("return Object.freeze({", publicStart);
  const returnEnd = returnStart < 0 ? -1 : source.indexOf("});", returnStart);
  const publicReturn = returnStart < 0 || returnEnd < 0
    ? ""
    : source.slice(returnStart, returnEnd);
  for (const forbidden of [
    "artifactId:",
    "artifactFingerprint:",
    "contentHash:",
    "engineeringFingerprint:",
    "privatePath:",
    "versionLine:",
    "commandFingerprint:",
    "filterScript:",
  ]) {
    if (publicReturn.includes(forbidden)) {
      problems.push(`mastering render public view exposes private evidence: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/mastering-render",
    "renderMasteringPlan",
    "MasteringSourceResolver",
    "buildMasteringFilterScript",
  ]) {
    if (runtime.includes(forbidden)) problems.push(`${path} exposes private mastering rendering: ${forbidden}`);
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio mastering-render check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_mastering_render_check_passed");
console.log("- mastering reuses the verified shell-free bounded chapter runner rather than duplicating process control");
console.log("- exact source engineering and private artifact identity are revalidated before rendering");
console.log("- high-pass, gain and true-peak limiting produce deterministic governed filters");
console.log("- limiter reduction is bounded and high-pass uncertainty requires intermediate measurement");
console.log("- private sources are disposed on success and every failure path");
console.log("- public evidence omits source identities, paths, raw filters, command details and tool output");
