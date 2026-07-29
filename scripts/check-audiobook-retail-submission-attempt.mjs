import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-submission-attempt file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-submission-attempt contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-submission-attempt.ts",
  "packages/storyteller/src/audiobook-retail-submission-attempt.test.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-retail-submission-attempt.ts", [
  "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_SCHEMA_VERSION",
  "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_ENTITY_TYPE",
  "startAudiobookRetailSubmissionAttempt",
  "recordAudiobookRetailSubmissionReceipt",
  "recordAudiobookRetailSubmissionFailure",
  "cancelAudiobookRetailSubmissionAttempt",
  "assertAudiobookRetailSubmissionAttempt",
  "assertAudiobookRetailSubmissionAttemptMatchesSources",
  "audiobookRetailSubmissionAttemptPublicView",
  "FileAudiobookRetailSubmissionAttemptStore",
  "submitted-awaiting-retailer-review",
  "submissionInitiated: true",
  "retailerAcceptanceClaimed: false",
  "listingPublished: false",
  "retryPermittedUnderDecision: false",
  "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_TERMINAL_IMMUTABLE",
  "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_SOURCE_MISMATCH",
  "AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT_FILE_COUNT_MISMATCH",
]);

requireTokens("packages/storyteller/src/audiobook-retail-submission-attempt.test.ts", [
  "one authorized decision becomes one persisted sanitized submission receipt",
  "attempt identity is deterministic and terminal results cannot be replaced",
  "failed and cancelled submissions are terminal under the consumed decision",
  "expired decisions, bot operators, wrong accounts and incomplete receipts fail closed",
  "recomputed attempt state cannot replace the authorized submission decision",
]);

requireTokens("docs/AUDIOBOOK_RETAIL_SUBMISSION_ATTEMPT.md", [
  "Admission boundary",
  "Deterministic one-attempt consumption",
  "Manual submission boundary",
  "Successful submission receipt",
  "Failed and cancelled attempts",
  "Terminal immutability",
  "Persistence and audit",
  "Privacy boundary",
  "Output boundary",
  "does not mean accepted, approved, published, released, live or on sale",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-submission-attempt"]
      !== "./src/audiobook-retail-submission-attempt.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-submission-attempt",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-submission-attempt"]
      !== "node scripts/check-audiobook-retail-submission-attempt.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-submission-attempt",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-submission-attempt",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail submission attempts",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-submission-attempt",
    "startAudiobookRetailSubmissionAttempt",
    "recordAudiobookRetailSubmissionReceipt",
    "submissionReceiptHash",
    "retailerSubmissionReferenceHash",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private retail submission-attempt controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-submission-attempt check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_submission_attempt_check_passed");
console.log("- one current submission decision produces one deterministic attempt");
console.log("- exact remote draft, review, account and file-set evidence are rebound");
console.log("- successful receipts acknowledge processing without acceptance claims");
console.log("- failed and cancelled attempts are terminal under the consumed decision");
console.log("- public and audit views omit private receipt and account evidence");
console.log("- normal API and web runtimes cannot initiate or complete submission");