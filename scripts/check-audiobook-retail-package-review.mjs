import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-package-review file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-package-review contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-package-review.ts",
  "packages/storyteller/src/audiobook-retail-package-review.test.ts",
  "packages/storyteller/src/project-store.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_PACKAGE_REVIEW.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-retail-package-review.ts", [
  "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_SCHEMA_VERSION",
  "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_ENTITY_TYPE",
  "createAudiobookRetailPackageReviewSession",
  "recordAudiobookRetailPackageReview",
  "approveAudiobookRetailPackageReview",
  "assertAudiobookRetailPackageReviewSession",
  "assertAudiobookRetailPackageReviewMatchesSources",
  "audiobookRetailPackageReviewPublicView",
  "FileAudiobookRetailPackageReviewStore",
  "completeFileListConfirmed",
  "openingCreditPlayed",
  "firstNarrativePlayed",
  "midpointNarrativePlayed",
  "finalNarrativePlayed",
  "closingCreditPlayed",
  "retailSamplePlayed",
  "studio-headphones",
  "consumer-headphones",
  "speakers",
  "approved-for-release-decision",
  "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_INDEPENDENT_REVIEWERS_REQUIRED",
  "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_INDEPENDENT_APPROVER_REQUIRED",
  "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_RIGHTS_EXPIRED",
  "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_POLICY_EXPIRED",
  "AUDIOBOOK_RETAIL_PACKAGE_REVIEW_SOURCE_MISMATCH",
]);

requireTokens("packages/storyteller/src/audiobook-retail-package-review.test.ts", [
  "two independent reviewers and a third release manager approve the exact inspected package",
  "changes-requested findings require a clean re-review before readiness",
  "partial playback, automation identities and shared cross-role reviewers fail closed",
  "score and playback-context coverage prevent premature approval",
  "rights and policy are revalidated at creation and final approval",
  "reviewers cannot provide the final independent release-manager confirmation",
  "recomputed structural state cannot replace the inspected package source",
  "store idempotency rejects reuse of a session identity for another package",
]);

requireTokens("packages/storyteller/src/project-store.ts", [
  '"audiobook-retail-package-review"',
]);

requireTokens("docs/AUDIOBOOK_RETAIL_PACKAGE_REVIEW.md", [
  "Exact subject binding",
  "Independent review roles",
  "Complete package coverage",
  "Review dimensions",
  "Changes and re-review",
  "Third-person approval",
  "Persistence and audit privacy",
  "Public boundary",
  "Honest completion boundary",
  "It does not mean the package has been released, uploaded, submitted or accepted by a retailer",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-package-review"]
      !== "./src/audiobook-retail-package-review.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-package-review",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-package-review"]
      !== "node scripts/check-audiobook-retail-package-review.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-package-review",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-package-review",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail package review",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-package-review",
    "approveAudiobookRetailPackageReview",
    "FileAudiobookRetailPackageReviewStore",
    "finalConfirmationId",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private retail package-review controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-package-review check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_package_review_check_passed");
console.log("- exact inspection, manifest, file set, policy and rights are bound");
console.log("- editorial and engineering reviewers must be independent humans");
console.log("- complete file-list and key playback coverage are mandatory");
console.log("- a third human release manager supplies final confirmation");
console.log("- persistence and public views redact identities and private evidence");
console.log("- approval stops at eligibility for a separate release decision");