import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing mastered-chapter file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) problems.push(`${path} is missing mastered-chapter contract token: ${token}`);
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
  "packages/storyteller/src/mastered-chapter.ts",
  "packages/storyteller/src/mastered-chapter.test.ts",
  "packages/storyteller/package.json",
  "docs/MASTERED_CHAPTER.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/mastered-chapter.ts", [
  "MASTERED_CHAPTER_SCHEMA_VERSION",
  "MASTERED_CHAPTER_COMPARISON_POLICY_SCHEMA_VERSION",
  "MasteredChapterArtifactChain",
  "createMasteredChapterComparisonPolicy",
  "assertMasteredChapterComparisonPolicy",
  "assertMasteredChapterArtifactChain",
  "ingestMasteredChapter",
  "masteredChapterPublicView",
  "assertGenerationAudioEngineeringPolicy",
  "ingestAudioEngineeringArtifact",
  'kind: "mastered-chapter"',
  "MASTERED_CHAPTER_ENGINEERING_PROFILE_MISMATCH",
  "MASTERED_CHAPTER_SOURCE_DURATION_MISMATCH",
  "MASTERED_CHAPTER_TRUE_PEAK_OBSERVATION_MISSING",
  "MASTERED_CHAPTER_DURATION_DRIFT",
  "MASTERED_CHAPTER_ENGINEERING_INELIGIBLE",
  "sourceDurationMs",
  "comparisonPolicyVersion",
  "chainFingerprint",
]);

requireTokens("packages/storyteller/src/mastered-chapter.test.ts", [
  "mastered chapter stores plan, render, new audio and post-master engineering as one reviewable chain",
  "identical mastered chapter ingestion is idempotent",
  "failed post-master engineering remains verified while the mastered audio is quarantined",
  "duration, sample-rate and channel drift are explicit quarantine findings",
  "non-transparent mastering reports prediction drift as review evidence without automatic quarantine",
  "render tampering, profile drift, stale rights and aborts fail before a usable chain is created",
  "comparison policy and artifact-chain tampering fail closed",
  "FilePrivateObjectStore",
  "FileArtifactRegistry",
  "assertMasteredChapterArtifactChain",
]);

requireTokens("docs/MASTERED_CHAPTER.md", [
  "Admission boundary",
  "Reviewed comparison policy",
  "Duration evidence",
  "Predicted and observed engineering",
  "Artifact chain",
  "Quarantine behavior",
  "Human review and release",
  "Public projection",
  "Current boundary",
  "approved `mastered-chapter`",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./mastered-chapter"] !== "./src/mastered-chapter.ts") {
    problems.push("storyteller package does not export ./mastered-chapter");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/mastered-chapter.ts"))
  ? read("packages/storyteller/src/mastered-chapter.ts")
  : "";
const publicStart = source.indexOf("export function masteredChapterPublicView");
if (publicStart < 0) problems.push("mastered chapter public view is missing");
else {
  const returnStart = source.indexOf("return Object.freeze({", publicStart);
  const returnEnd = returnStart < 0 ? -1 : source.indexOf("});", returnStart);
  const publicReturn = returnStart < 0 || returnEnd < 0 ? "" : source.slice(returnStart, returnEnd);
  for (const forbidden of [
    "masteringPlanArtifact:",
    "masteringRenderArtifact:",
    "postMasterEngineering:",
    "rightsEvidenceId:",
    "rightsFingerprint:",
    "sourceContentHash:",
    "generationRequestHash:",
    "createdByActorId:",
    "objectKey:",
    "sourceReference:",
  ]) {
    if (publicReturn.includes(forbidden)) {
      problems.push(`mastered chapter public view exposes private evidence: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/mastered-chapter",
    "ingestMasteredChapter",
    "MasteredChapterArtifactChain",
    "createMasteredChapterComparisonPolicy",
  ]) {
    if (runtime.includes(forbidden)) problems.push(`${path} exposes private mastered-chapter mutation: ${forbidden}`);
  }
}

for (const temporary of [
  ".github/workflows/one-time-mastered-chapter-foundation.yml",
  ".github/workflows/one-time-mastered-chapter-foundation-v2.yml",
  ".github/mastered-chapter-foundation.trigger",
  ".github/mastered-chapter-foundation-v2.trigger",
  ".github/mastered-chapter-foundation-diagnostic.txt",
  ".github/mastered-chapter-anchor-report.txt",
]) {
  if (existsSync(fromRoot(temporary))) problems.push(`temporary mastered-chapter migration remains: ${temporary}`);
}

if (problems.length > 0) {
  console.error("Storyteller Studio mastered-chapter check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_mastered_chapter_check_passed");
console.log("- approved pre-master audio remains immutable while mastered audio becomes a distinct governed artifact");
console.log("- plan, render, mastered WAV and post-master engineering form one integrity-checked evidence chain");
console.log("- reviewed comparison policy binds duration and predicted-versus-observed engineering tolerances");
console.log("- strict transparent gain drift fails closed while uncertain processing retains warning evidence for review");
console.log("- failed engineering is retained and the mastered WAV is quarantined rather than silently accepted");
console.log("- public projections omit source artifacts, rights, actors, storage paths and private policy references");
