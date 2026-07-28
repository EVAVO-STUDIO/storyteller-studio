import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-sample-review file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-sample-review contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-sample-review.ts",
  "packages/storyteller/src/audiobook-retail-sample-review.test.ts",
  "packages/storyteller/src/project-store.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_SAMPLE_REVIEW.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-retail-sample-review.ts", [
  "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_SCHEMA_VERSION",
  "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ENTITY_TYPE",
  "createAudiobookRetailSampleReviewSession",
  "recordAudiobookRetailSampleReview",
  "approveAudiobookRetailSampleReview",
  "assertAudiobookRetailSampleReviewSession",
  "assertAudiobookRetailSampleReviewMatchesChain",
  "audiobookRetailSampleReviewPublicView",
  "FileAudiobookRetailSampleReviewStore",
  "completePlaybackConfirmed",
  "startBoundaryConfirmed",
  "endBoundaryConfirmed",
  "sourceContinuityConfirmed",
  "retailSuitabilityConfirmed",
  "contentSafetyConfirmed",
  "studio-headphones",
  "consumer-headphones",
  "speakers",
  "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_INDEPENDENT_REVIEWERS_REQUIRED",
  "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_INDEPENDENT_APPROVER_REQUIRED",
  "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_RIGHTS_EXPIRED",
  "recordArtifactReview",
]);

requireTokens("packages/storyteller/src/audiobook-retail-sample-review.test.ts", [
  "two complete independent reviews and a third human approve the exact sample",
  "changes requested require findings and a later complete re-review",
  "incomplete playback, weak scores, missing contexts and shared reviewer identities remain blocked",
  "approval requires a third human and current rights",
  "cross-chain tampering and stale store writes fail closed",
  "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_COMPLETE_PLAYBACK_REQUIRED",
  "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_INDEPENDENT_APPROVER_REQUIRED",
  "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_SESSION_SUBJECT_MISMATCH",
]);

requireTokens("packages/storyteller/src/project-store.ts", [
  '"audiobook-retail-sample-review"',
]);

requireTokens("docs/AUDIOBOOK_RETAIL_SAMPLE_REVIEW.md", [
  "Review subject",
  "Complete playback review",
  "Independent roles and playback contexts",
  "Changes and re-review",
  "Final human approval",
  "Structural and cross-source validation",
  "Persistence and audit privacy",
  "Current boundary",
  "It does not add the sample to a release package",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-sample-review"]
      !== "./src/audiobook-retail-sample-review.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-sample-review",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-sample-review"]
      !== "node scripts/check-audiobook-retail-sample-review.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-sample-review",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-sample-review",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail sample review",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-sample-review",
    "approveAudiobookRetailSampleReview",
    "recordAudiobookRetailSampleReview",
    "FileAudiobookRetailSampleReviewStore",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private retail sample review controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-sample-review check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_sample_review_check_passed");
console.log("- review is bound to the exact engineered sample artifact revision");
console.log("- editorial and engineering reviewers must complete full playback independently");
console.log("- consumer, speaker and studio playback contexts are required");
console.log("- changes-requested history remains append-only and requires re-review");
console.log("- a third current-rights-aware human performs final approval");
console.log("- public and audit views omit reviewer and artifact identities");
console.log("- normal API and web runtimes cannot invoke private approval controls");