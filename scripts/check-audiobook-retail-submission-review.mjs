import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-submission-review file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-submission-review contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-submission-review.ts",
  "packages/storyteller/src/audiobook-retail-submission-review.test.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_SUBMISSION_REVIEW.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-retail-submission-review.ts", [
  "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_SCHEMA_VERSION",
  "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_ENTITY_TYPE",
  "createAudiobookRetailSubmissionReviewSession",
  "recordAudiobookRetailSubmissionReview",
  "approveAudiobookRetailSubmissionReview",
  "assertAudiobookRetailSubmissionReviewSession",
  "assertAudiobookRetailSubmissionReviewMatchesSources",
  "audiobookRetailSubmissionReviewPublicView",
  "FileAudiobookRetailSubmissionReviewStore",
  "approved-for-submission-decision",
  "submissionDecisionEligible: true",
  "remoteDraftReferenceHash",
  "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_INDEPENDENT_REVIEWERS_REQUIRED",
  "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_INDEPENDENT_APPROVER_REQUIRED",
  "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_WINDOW_EXPIRED",
  "AUDIOBOOK_RETAIL_SUBMISSION_REVIEW_SOURCE_MISMATCH",
  "submissionInitiated: false",
]);

requireTokens("packages/storyteller/src/audiobook-retail-submission-review.test.ts", [
  "two remote-draft reviewers and a third approver create submission-decision eligibility",
  "changes-requested findings require a clean editorial re-review",
  "reviewers and final approver remain independent human roles",
  "incomplete remote coverage, processing errors and expired windows fail closed",
  "source substitution and recomputed session state remain blocked",
]);

requireTokens("docs/AUDIOBOOK_RETAIL_SUBMISSION_REVIEW.md", [
  "Admission boundary",
  "Review window",
  "Independent reviewer roles",
  "Scores and findings",
  "Third-person approval",
  "Persistence and revision safety",
  "Privacy boundary",
  "Output boundary",
  "does not mean submitted, published, released, accepted, live, on sale or approved",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-submission-review"]
      !== "./src/audiobook-retail-submission-review.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-submission-review",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-submission-review"]
      !== "node scripts/check-audiobook-retail-submission-review.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-submission-review",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-submission-review",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail submission review",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-submission-review",
    "createAudiobookRetailSubmissionReviewSession",
    "approveAudiobookRetailSubmissionReview",
    "remoteDraftReferenceHash",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private retail submission-review controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-submission-review check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_submission_review_check_passed");
console.log("- successful transfer evidence is independently reviewed in the remote draft");
console.log("- editorial and engineering reviewers are distinct human roles");
console.log("- complete remote playback and processing coverage is mandatory");
console.log("- a third approver creates eligibility for a later submission decision");
console.log("- approval does not submit, release or claim retailer acceptance");
console.log("- normal API and web runtimes cannot review or approve submission");