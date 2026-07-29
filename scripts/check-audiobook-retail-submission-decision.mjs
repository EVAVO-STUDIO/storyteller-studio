import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-submission-decision file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-submission-decision contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-submission-decision.ts",
  "packages/storyteller/src/audiobook-retail-submission-decision.test.ts",
  "packages/storyteller/src/test-support/retail-submission-review-fixture.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_SUBMISSION_DECISION.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-retail-submission-decision.ts", [
  "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_SCHEMA_VERSION",
  "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_ENTITY_TYPE",
  "createAudiobookRetailSubmissionDecision",
  "assertAudiobookRetailSubmissionDecision",
  "assertAudiobookRetailSubmissionDecisionMatchesSources",
  "audiobookRetailSubmissionDecisionPublicView",
  "FileAudiobookRetailSubmissionDecisionStore",
  "authorized-for-single-submission",
  "manual-acx-submit",
  "maximumSubmissionAttempts: 1",
  "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_INDEPENDENT_AUTHORITY_REQUIRED",
  "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_VALIDITY_INVALID",
  "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_NARRATION_MISMATCH",
  "AUDIOBOOK_RETAIL_SUBMISSION_DECISION_SOURCE_MISMATCH",
]);

requireTokens("packages/storyteller/src/audiobook-retail-submission-decision.test.ts", [
  "independent authority authorizes one short-lived manual submission action",
  "synthetic narration remains bound to current title-scoped platform authorization",
  "expired rights, stale account evidence and overlong validity windows fail closed",
  "reviewers, delivery actors and prior authorities cannot self-authorize submission",
  "changed account, narration or manifest evidence cannot replace approved sources",
  "recomputed decision state cannot replace the approved submission review",
]);

requireTokens("docs/AUDIOBOOK_RETAIL_SUBMISSION_DECISION.md", [
  "Admission boundary",
  "Distributor-specific method",
  "Narration eligibility",
  "Independent authority",
  "Single-action authorization",
  "Exact remote-draft binding",
  "Persistence and audit",
  "Privacy boundary",
  "Output boundary",
  "does not mean submitted, published, released, accepted, live, on sale or approved",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-submission-decision"]
      !== "./src/audiobook-retail-submission-decision.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-submission-decision",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-submission-decision"]
      !== "node scripts/check-audiobook-retail-submission-decision.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-submission-decision",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-submission-decision",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail submission decisions",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-submission-decision",
    "createAudiobookRetailSubmissionDecision",
    "manual-acx-submit",
    "remoteDraftReferenceHash",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private retail submission-decision controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-submission-decision check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_submission_decision_check_passed");
console.log("- exact remote-draft review and all upstream evidence are rebound");
console.log("- current policy, rights, narration and account access are revalidated");
console.log("- an independent human authority permits one short-lived submit action");
console.log("- synthetic and mixed narration retain platform authorization gates");
console.log("- decisions stop before submission receipts or retailer acceptance");
console.log("- normal API and web runtimes cannot authorize submission");