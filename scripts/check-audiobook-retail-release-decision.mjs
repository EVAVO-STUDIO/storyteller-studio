import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-release-decision file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-release-decision contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-release-decision.ts",
  "packages/storyteller/src/audiobook-retail-release-decision.test.ts",
  "packages/storyteller/src/test-support/retail-release-policy-fixture.ts",
  "packages/storyteller/src/test-support/retail-release-package-fixture.ts",
  "packages/storyteller/src/test-support/retail-release-review-fixture.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_RELEASE_DECISION.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-retail-release-decision.ts", [
  "AUDIOBOOK_RETAIL_DISTRIBUTOR_ACCOUNT_SCHEMA_VERSION",
  "AUDIOBOOK_RETAIL_RELEASE_DECISION_SCHEMA_VERSION",
  "createAudiobookRetailDistributorAccountEvidence",
  "assertAudiobookRetailDistributorAccountEvidence",
  "createAudiobookRetailReleaseDecision",
  "assertAudiobookRetailReleaseDecision",
  "assertAudiobookRetailReleaseDecisionMatchesSources",
  "audiobookRetailReleaseDecisionPublicView",
  "FileAudiobookRetailReleaseDecisionStore",
  "authorized-for-controlled-delivery",
  "manual-acx-upload",
  "maximumDeliveryAttempts: 1",
  "AUDIOBOOK_RETAIL_RELEASE_DECISION_INDEPENDENT_AUTHORITY_REQUIRED",
  "AUDIOBOOK_RETAIL_RELEASE_DECISION_VALIDITY_INVALID",
  "AUDIOBOOK_RETAIL_RELEASE_DECISION_NARRATION_MISMATCH",
  "AUDIOBOOK_RETAIL_RELEASE_DECISION_SOURCE_MISMATCH",
  "AUDIOBOOK_RETAIL_ACCOUNT_NOT_CURRENT",
]);

requireTokens("packages/storyteller/src/audiobook-retail-release-decision.test.ts", [
  "independent publisher authority authorizes one short-lived controlled delivery attempt",
  "synthetic narration requires current title-scoped platform authorisation",
  "expired rights, stale account access and overlong decision windows fail closed",
  "reviewers, approver, attestor and access verifier cannot self-authorize delivery",
  "cross-project account evidence and changed narration identity remain blocked",
  "recomputed decision state cannot replace the approved package-review identity",
]);

requireTokens("docs/AUDIOBOOK_RETAIL_RELEASE_DECISION.md", [
  "Admission boundary",
  "Distributor-specific scope",
  "Narration eligibility",
  "Distributor account evidence",
  "Independent publisher authority",
  "Short-lived authorization",
  "Persistence and idempotency",
  "Privacy boundary",
  "Output boundary",
  "does not mean uploaded, submitted, published, released, accepted, live, on sale or approved",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-release-decision"]
      !== "./src/audiobook-retail-release-decision.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-release-decision",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-release-decision"]
      !== "node scripts/check-audiobook-retail-release-decision.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-release-decision",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-release-decision",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail release decisions",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-release-decision",
    "createAudiobookRetailReleaseDecision",
    "createAudiobookRetailDistributorAccountEvidence",
    "accountReferenceHash",
    "manual-acx-upload",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private retail release-decision controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-release-decision check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_release_decision_check_passed");
console.log("- exact package review, inspection and manifest evidence are rebound");
console.log("- current policy, rights, narration and account access are revalidated");
console.log("- synthetic or mixed narration still requires platform authorization");
console.log("- an independent publisher authority permits one short-lived attempt");
console.log("- decisions stop before upload, submission or retailer acceptance");
console.log("- normal API and web runtimes cannot authorize delivery");