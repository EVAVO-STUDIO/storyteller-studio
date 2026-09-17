import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing chapter-assembly file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing chapter-assembly contract token: ${token}`);
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
  "packages/storyteller/src/chapter-assembly.ts",
  "packages/storyteller/src/chapter-assembly.test.ts",
  "packages/storyteller/package.json",
  "docs/CHAPTER_ASSEMBLY.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/chapter-assembly.ts", [
  "CHAPTER_ASSEMBLY_SCHEMA_VERSION",
  "ChapterAssemblyPolicy",
  "ChapterAssemblySegment",
  "ChapterAssemblyPlan",
  "createChapterAssemblyPolicy",
  "createChapterAssemblyPlan",
  "assertChapterAssemblyPlan",
  "chapterAssemblyPublicView",
  "assertAudioEngineeringEvidence",
  "assertArtifactRecord",
  "CHAPTER_ASSEMBLY_AUDIO_REVIEW_APPROVAL_REQUIRED",
  "CHAPTER_ASSEMBLY_ENGINEERING_INELIGIBLE",
  "CHAPTER_ASSEMBLY_RIGHTS_EXPIRED",
  "CHAPTER_ASSEMBLY_SOURCE_OVERLAP",
  "CHAPTER_ASSEMBLY_OUTPUT_PROFILE_MISMATCH",
  "CHAPTER_ASSEMBLY_FINGERPRINT_MISMATCH",
  "timelineStartMs",
  "timelineEndMs",
  "generationRequestHash",
  "rightsFingerprint",
]);

requireTokens("packages/storyteller/src/chapter-assembly.test.ts", [
  "approved evidence chains create a deterministic ordered chapter timeline",
  "unapproved audio and ineligible engineering cannot enter assembly",
  "scope, parent, content and rights drift fail closed",
  "source overlap, duplicate takes and invalid edit bounds are rejected",
  "expired rights and output-profile drift block assembly",
  "persisted plan tampering is detected",
  "recordArtifactReview",
  "analyseAudioEngineering",
  "assertChapterAssemblyPlan",
  "renderedDurationMs, 2_100",
]);

requireTokens("docs/CHAPTER_ASSEMBLY.md", [
  "Admission boundary",
  "Immutable edit decisions",
  "Timeline policy",
  "Continuity and duplication controls",
  "Current boundary",
  "explicit in-context human approval",
  "non-overlapping segments and explicit gaps",
  "does not yet render a chapter master",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./chapter-assembly"] !== "./src/chapter-assembly.ts") {
    problems.push("storyteller package does not export ./chapter-assembly");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/chapter-assembly.ts"))
  ? read("packages/storyteller/src/chapter-assembly.ts")
  : "";
const publicStart = source.indexOf("export function chapterAssemblyPublicView");
if (publicStart < 0) {
  problems.push("chapter assembly public view is missing");
} else {
  const publicSource = source.slice(publicStart);
  for (const forbidden of [
    "manuscriptSourceHash:",
    "createdByActorId:",
    "segments:",
    "takeId:",
    "rightsFingerprint:",
    "generationRequestHash:",
    "audio:",
    "transcript:",
    "engineering:",
  ]) {
    if (publicSource.includes(forbidden)) {
      problems.push(`chapter assembly public view exposes private decision evidence: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/chapter-assembly",
    "createChapterAssemblyPlan",
    "ChapterAssemblySegmentInput",
    "audioCandidate",
    "engineeringEvidence",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private chapter-assembly mutation: ${forbidden}`);
    }
  }
}

for (const path of [
  ".github/workflows/one-time-worker-engineering-completion.yml",
  ".github/worker-engineering-completion.trigger",
  ".github/workflows/one-time-worker-engineering-completion-v2.yml",
  ".github/worker-engineering-completion-v2.trigger",
  ".github/workflows/one-time-worker-engineering-v2-selector-fix.yml",
  ".github/worker-engineering-v2-selector-fix.trigger",
  ".github/workflows/one-time-worker-engineering-completion-v3.yml",
  ".github/worker-engineering-completion-v3.trigger",
  ".github/worker-engineering-anchor-diagnostic.txt",
]) {
  if (existsSync(fromRoot(path))) problems.push(`temporary worker migration remains: ${path}`);
}

if (problems.length > 0) {
  console.error("Storyteller Studio chapter assembly check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_chapter_assembly_check_passed");
console.log("- chapter plans admit only reviewed audio with matching transcript and independent engineering evidence");
console.log("- artifact revisions, hashes, rights, generation intent and source order are locked immutably");
console.log("- trims, fades and directed gaps produce a deterministic non-overlapping chapter timeline");
console.log("- source, scope, rights, output-profile and fingerprint drift fail closed");
console.log("- public projections omit manuscript, take, artifact, rights and private edit evidence");
console.log("- assembly planning remains distinct from rendering, mastering and release approval");
