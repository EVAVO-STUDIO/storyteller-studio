import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-delivery-attempt file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-delivery-attempt contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-delivery-attempt.ts",
  "packages/storyteller/src/audiobook-retail-delivery-attempt.test.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-retail-delivery-attempt.ts", [
  "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_SCHEMA_VERSION",
  "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_ENTITY_TYPE",
  "startAudiobookRetailDeliveryAttempt",
  "recordAudiobookRetailDeliveryTransfer",
  "recordAudiobookRetailDeliveryFailure",
  "cancelAudiobookRetailDeliveryAttempt",
  "assertAudiobookRetailDeliveryAttempt",
  "assertAudiobookRetailDeliveryAttemptMatchesSources",
  "audiobookRetailDeliveryAttemptPublicView",
  "FileAudiobookRetailDeliveryAttemptStore",
  "files-transferred-awaiting-submission-review",
  "submissionInitiated: false",
  "retailerAcceptanceClaimed: false",
  "retryPermittedUnderDecision: false",
  "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_TERMINAL_IMMUTABLE",
  "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_SOURCE_MISMATCH",
  "AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT_FILE_COUNT_MISMATCH",
]);

requireTokens("packages/storyteller/src/audiobook-retail-delivery-attempt.test.ts", [
  "one authorized decision becomes one persisted transfer receipt without submission claims",
  "attempt identity is deterministic and terminal outcomes cannot be replaced or retried",
  "failed and cancelled attempts retain safe terminal evidence and forbid retries",
  "expired decisions, bot operators, wrong accounts and incomplete file receipts fail closed",
  "recomputed attempt state cannot replace the approved release decision",
]);

requireTokens("docs/AUDIOBOOK_RETAIL_DELIVERY_ATTEMPT.md", [
  "Admission boundary",
  "Deterministic one-attempt consumption",
  "Manual transfer boundary",
  "Successful transfer receipt",
  "Failed and cancelled attempts",
  "Terminal immutability",
  "Persistence and audit",
  "Privacy boundary",
  "Output boundary",
  "does not mean submitted, published, released, accepted, live, on sale or approved",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-delivery-attempt"]
      !== "./src/audiobook-retail-delivery-attempt.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-delivery-attempt",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-delivery-attempt"]
      !== "node scripts/check-audiobook-retail-delivery-attempt.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-delivery-attempt",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-delivery-attempt",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail delivery attempts",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-delivery-attempt",
    "startAudiobookRetailDeliveryAttempt",
    "recordAudiobookRetailDeliveryTransfer",
    "receiptReferenceHash",
    "remoteDraftReferenceHash",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private retail delivery-attempt controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-delivery-attempt check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_delivery_attempt_check_passed");
console.log("- one current release decision produces one deterministic attempt");
console.log("- exact package, review, inspection, manifest and account evidence are rebound");
console.log("- successful receipts explicitly stop before submission and acceptance");
console.log("- failed and cancelled attempts are terminal under the consumed decision");
console.log("- audit and public views omit account, receipt and source evidence");
console.log("- normal API and web runtimes cannot initiate or complete delivery");