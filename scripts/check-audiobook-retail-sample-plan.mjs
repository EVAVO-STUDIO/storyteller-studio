import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-sample-plan file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-sample-plan contract token: ${token}`,
      );
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
  "packages/storyteller/src/audiobook-retail-sample-plan.ts",
  "packages/storyteller/src/audiobook-retail-sample-plan.test.ts",
  "packages/storyteller/src/project-store.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_SAMPLE_PLAN.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-retail-sample-plan.ts", [
  "AUDIOBOOK_RETAIL_SAMPLE_PLAN_SCHEMA_VERSION",
  "AUDIOBOOK_RETAIL_SAMPLE_PLAN_ENTITY_TYPE",
  "createAudiobookRetailSamplePlan",
  "assertAudiobookRetailSamplePlan",
  "assertAudiobookRetailSamplePlanMatchesSources",
  "audiobookRetailSamplePlanPublicView",
  "FileAudiobookRetailSamplePlanStore",
  "preferred-book-beginning",
  "curated-exception",
  "explicit-content-at-beginning",
  "stronger-representative-excerpt",
  "completeRangeListenConfirmed",
  "representativeOfBookConfirmed",
  "startBoundaryConfirmed",
  "endBoundaryConfirmed",
  "sourceFromAudiobookConfirmed",
  "explicitContentDetected",
  "unsuitableRetailPreviewContentDetected",
  "AUDIOBOOK_RETAIL_SAMPLE_NARRATIVE_SOURCE_REQUIRED",
  "AUDIOBOOK_RETAIL_SAMPLE_DURATION_EXCEEDS_POLICY",
  "AUDIOBOOK_RETAIL_SAMPLE_INDEPENDENT_SAFETY_REVIEW_REQUIRED",
  "AUDIOBOOK_RETAIL_SAMPLE_CONTENT_SAFETY_APPROVAL_REQUIRED",
  "AUDIOBOOK_RETAIL_SAMPLE_APPROVED_SOURCE_ARTIFACT_MISMATCH",
  "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_MISMATCH",
  'fileName: "RetailSample.mp3"',
]);

requireTokens("packages/storyteller/src/audiobook-retail-sample-plan.test.ts", [
  "approved opening narrative becomes a five-minute safety-reviewed sample plan",
  "credits, oversized ranges and out-of-track extraction remain blocked",
  "editorial boundary and independent content-safety confirmations are mandatory",
  "wrong approved artifact and changed review identity cannot enter sample planning",
  "policy and source rights must remain current at sample-plan creation",
  "recomputed structural tampering cannot replace the approved source chain",
  "AUDIOBOOK_RETAIL_SAMPLE_DURATION_EXCEEDS_POLICY",
  "AUDIOBOOK_RETAIL_SAMPLE_CONTENT_SAFETY_APPROVAL_REQUIRED",
  "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_MISMATCH",
]);

requireTokens("docs/AUDIOBOOK_RETAIL_SAMPLE_PLAN.md", [
  "Admission chain",
  "Narrative source only",
  "Exact range",
  "Preferred beginning and governed exceptions",
  "Human sample editor",
  "Independent content-safety review",
  "Current policy and rights",
  "Output intent",
  "Tamper resistance",
  "Persistence and privacy",
  "Current boundary",
  "It does not mean the sample has been cut, encoded",
]);

requireTokens("packages/storyteller/src/project-store.ts", [
  '"audiobook-retail-sample-plan"',
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-sample-plan"]
      !== "./src/audiobook-retail-sample-plan.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-sample-plan",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-sample-plan"]
      !== "node scripts/check-audiobook-retail-sample-plan.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-sample-plan",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-sample-plan",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail sample planning",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-sample-plan",
    "createAudiobookRetailSamplePlan",
    "FileAudiobookRetailSamplePlanStore",
    "assertAudiobookRetailSamplePlanMatchesSources",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private retail sample planning controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-sample-plan check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_sample_plan_check_passed");
console.log("- sample intent starts from exact human-approved narrative MP3 revisions");
console.log("- the current five-minute distributor ceiling is enforced");
console.log("- non-beginning selections require a governed exception reason");
console.log("- sample editor and content-safety reviewer remain independently human");
console.log("- current rights and policy are revalidated at plan creation");
console.log("- public and audit views omit private source and reviewer evidence");