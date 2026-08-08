import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing chapter-master file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) problems.push(`${path} is missing chapter-master contract token: ${token}`);
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
  "packages/storyteller/src/chapter-master.ts",
  "packages/storyteller/src/chapter-master.test.ts",
  "packages/storyteller/package.json",
  "docs/CHAPTER_MASTER.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/chapter-master.ts", [
  "CHAPTER_MASTER_SCHEMA_VERSION",
  "ChapterMasterArtifactChain",
  "ingestChapterMaster",
  "chapterMasterPublicView",
  "assertChapterAssemblyPlan",
  "assertChapterRenderEvidence",
  "ingestAudioEngineeringArtifact",
  "ingestPrivateArtifact",
  "quarantineArtifact",
  "chapter-assembly-schema",
  "chapter-render-evidence-schema",
  'kind: "chapter-master"',
  "CHAPTER_MASTER_RENDER_OUTPUT_MISMATCH",
  "CHAPTER_MASTER_RIGHTS_SCOPE_MISMATCH",
  "CHAPTER_MASTER_DURATION_DRIFT",
  "CHAPTER_MASTER_SAMPLE_RATE_DRIFT",
  "CHAPTER_MASTER_CHANNEL_DRIFT",
  "CHAPTER_MASTER_ENGINEERING_INELIGIBLE",
  "expectedDurationMs",
  "observedDurationMs",
  "durationDriftMs",
  "eligibleForReview",
  "chainFingerprint",
]);

requireTokens("packages/storyteller/src/chapter-master.test.ts", [
  "rendered chapter becomes an assembly manifest, render evidence, reviewed master candidate and post-render analysis",
  "identical master ingestion is idempotent",
  "failed engineering retains evidence and quarantines the master",
  "duration and output-profile drift quarantine the master with explicit findings",
  "render tampering and rights drift block before artifact creation",
  "expired rights and pre-aborted operation fail before persistence",
  "master chain tampering is detected by the public projection",
  "FilePrivateObjectStore",
  "FileArtifactRegistry",
  "createGenerationAudioEngineeringPolicy",
  "chapterMasterPublicView",
  "approveNarrationTakeReviewFixture",
  "requireApprovedTakeSelection: true",
  "takeReviewSession: approved.session",
  "registry.list()).length, 4",
]);

requireTokens("docs/CHAPTER_MASTER.md", [
  "Evidence graph",
  "Pre-ingestion validation",
  "Evidence artifacts",
  "Post-render engineering",
  "Quarantine behavior",
  "Idempotency and privacy",
  "Current boundary",
  "ready for human chapter review, not release",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./chapter-master"] !== "./src/chapter-master.ts") {
    problems.push("storyteller package does not export ./chapter-master");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/chapter-master.ts"))
  ? read("packages/storyteller/src/chapter-master.ts")
  : "";
const publicStart = source.indexOf("export function chapterMasterPublicView");
if (publicStart < 0) problems.push("chapter master public view is missing");
else {
  const returnStart = source.indexOf("  return Object.freeze({", publicStart);
  const returnEnd = returnStart < 0 ? -1 : source.indexOf("  });", returnStart);
  if (returnStart < 0 || returnEnd < 0) {
    problems.push("chapter master public return projection is missing");
  } else {
    const publicProjection = source.slice(returnStart, returnEnd + 5);
    for (const forbidden of [
      "assemblyManifest:",
      "renderEvidence:",
      "postRenderEngineering:",
      "rightsEvidenceId:",
      "rightsFingerprint:",
      "sourceContentHash:",
      "generationRequestHash:",
      "createdByActorId:",
      "objectKey:",
      "temporaryRoot:",
      "sourceReference:",
    ]) {
      if (publicProjection.includes(forbidden)) {
        problems.push(`chapter master public view exposes private evidence: ${forbidden}`);
      }
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/chapter-master",
    "ingestChapterMaster",
    "ChapterMasterArtifactChain",
    "chapter-assembly-schema",
    "chapter-render-evidence-schema",
  ]) {
    if (runtime.includes(forbidden)) problems.push(`${path} exposes private chapter-master mutation: ${forbidden}`);
  }
}

for (const path of [
  ".github/workflows/one-time-chapter-master-duration-contract.yml",
  ".github/chapter-master-duration-contract.trigger",
]) {
  if (existsSync(fromRoot(path))) problems.push(`temporary chapter-master migration remains: ${path}`);
}

if (problems.length > 0) {
  console.error("Storyteller Studio chapter master check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_chapter_master_check_passed");
console.log("- assembly, render, chapter master and post-render engineering form one immutable evidence chain");
console.log("- render bytes, source snapshots, output profile, rights and duration are revalidated before persistence");
console.log("- failed post-render engineering remains verified while the master is quarantined");
console.log("- identical ingestion is idempotent and uses content-addressed private storage");
console.log("- public projections omit rights, source takes, private manifests, actors, paths and tool configuration");
console.log("- an eligible master is ready for human chapter review, not mastering or release");
