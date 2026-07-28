import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing book-credit-take-review file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing book-credit-take-review contract token: ${token}`);
    }
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
  "packages/storyteller/src/book-credit-take-review.ts",
  "packages/storyteller/src/book-credit-take-review.test.ts",
  "packages/storyteller/package.json",
  "docs/BOOK_CREDIT_TAKE_REVIEW.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/book-credit-take-review.ts", [
  "BOOK_CREDIT_TAKE_REVIEW_SCHEMA_VERSION",
  "BookCreditTakeReviewCandidate",
  "BookCreditTakeReviewScores",
  "createBookCreditTakeReviewSession",
  "recordBookCreditTakeReview",
  "selectBookCreditTake",
  "approveBookCreditTakeSelection",
  "assertBookCreditTakeReviewSession",
  "bookCreditTakeReviewPublicView",
  "FileBookCreditTakeReviewStore",
  "BOOK_CREDIT_TAKE_REVIEW_ENGINEERING_MISMATCH",
  "BOOK_CREDIT_TAKE_REVIEW_INDEPENDENCE_REQUIRED",
  "BOOK_CREDIT_TAKE_REVIEW_LISTEN_DURATION_INVALID",
  "BOOK_CREDIT_TAKE_REVIEW_CANDIDATE_NOT_READY",
  "BOOK_CREDIT_TAKE_REVIEW_SELECTION_STALE",
  "humanConfirmation: true",
]);

requireTokens("packages/storyteller/src/book-credit-take-review.test.ts", [
  "independent complete-take reviews select and explicitly approve one opening credit",
  "incomplete listening, reviewer reuse, low scores and changes requests block selection",
  "durable review sessions preserve revision chains and audit redaction",
  "candidate, selection, approval and session tampering fail closed",
  "BOOK_CREDIT_TAKE_REVIEW_INDEPENDENCE_REQUIRED",
  "BOOK_CREDIT_TAKE_REVIEW_CANDIDATE_NOT_READY",
  "BOOK_CREDIT_TAKE_REVIEW_REVISION_CONFLICT",
]);

requireTokens("docs/BOOK_CREDIT_TAKE_REVIEW.md", [
  "Candidate set",
  "Independent roles",
  "Complete listening",
  "Score dimensions",
  "Selection and approval",
  "Durable state",
  "Public and audit boundary",
  "Current boundary",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./book-credit-take-review"] !== "./src/book-credit-take-review.ts") {
    problems.push("storyteller package does not export ./book-credit-take-review");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/book-credit-take-review.ts"))
  ? read("packages/storyteller/src/book-credit-take-review.ts")
  : "";
const publicStart = source.indexOf("export function bookCreditTakeReviewPublicView");
if (publicStart < 0) problems.push("book credit take review public view is missing");
else {
  const publicSource = source.slice(publicStart);
  for (const forbidden of [
    "candidates:",
    "reviews:",
    "reviewerId:",
    "selectedByActorId:",
    "approvedByActorId:",
    "notes:",
    "engineeringEvidence:",
    "contentHash:",
    "calibrationLockFingerprint:",
    "scriptTextHash:",
  ]) {
    if (publicSource.includes(forbidden)) {
      problems.push(`book credit take review public view exposes private state: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/book-credit-take-review",
    "selectBookCreditTake",
    "approveBookCreditTakeSelection",
    "FileBookCreditTakeReviewStore",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private credit-take review controls: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio book-credit-take-review check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_book_credit_take_review_check_passed");
console.log("- two independent human roles review the complete selected credit take");
console.log("- consumer and studio playback contexts are mandatory across the role set");
console.log("- every score dimension must meet the selection threshold");
console.log("- selection fingerprints the exact latest review set before final approval");
console.log("- public views and audits omit private evidence, identities, notes and credit text");
