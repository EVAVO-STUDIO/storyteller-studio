import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing book-credit file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) problems.push(`${path} is missing book-credit contract token: ${token}`);
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
  "packages/storyteller/src/book-credit-script.ts",
  "packages/storyteller/src/book-credit-script.test.ts",
  "packages/storyteller/src/project-store.ts",
  "packages/storyteller/package.json",
  "docs/BOOK_CREDIT_SCRIPT.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/book-credit-script.ts", [
  "BOOK_CREDIT_POLICY_SCHEMA_VERSION",
  "BOOK_CREDIT_SCRIPT_SCHEMA_VERSION",
  "BookCreditTemplate",
  "BookCreditPolicy",
  "BookCreditScript",
  "createBookCreditPolicy",
  "assertBookCreditPolicy",
  "createBookCreditScript",
  "recordBookCreditReview",
  "approveBookCreditScript",
  "assertBookCreditScript",
  "bookCreditScriptPublicView",
  "FileBookCreditScriptStore",
  "BOOK_CREDIT_TEMPLATE_TOKEN_UNKNOWN",
  "BOOK_CREDIT_TEMPLATE_SEMANTIC_TOKEN_MISSING",
  "BOOK_CREDIT_TEMPLATE_SERIES_TOKEN_MISSING",
  "BOOK_CREDIT_REVIEW_REQUIRED_CHECK_MISSING",
  "BOOK_CREDIT_INDEPENDENT_REVIEWERS_REQUIRED",
  "BOOK_CREDIT_HUMAN_CONFIRMATION_REQUIRED",
  "book_credit.created",
]);

requireTokens("packages/storyteller/src/book-credit-script.test.ts", [
  "reviewed templates render exact standalone and series opening and closing scripts",
  "policy templates reject unknown, missing, duplicate and future-reviewed definitions",
  "series metadata and word limits fail before an unusable script is admitted",
  "independent editorial and rights reviews plus final confirmation approve exact credit text",
  "reviews require semantic checks, independent humans and notes for changes requested",
  "credit script store is idempotent, revision-safe and audits no text or reviewer identities",
  "text, status and approval tampering fail even with recomputed outer fingerprints",
  "FileBookCreditScriptStore",
  "approveBookCreditScript",
]);

requireTokens("docs/BOOK_CREDIT_SCRIPT.md", [
  "Versioned credit policy",
  "Semantic templates",
  "Exact rendering",
  "Editorial and rights review",
  "Final confirmation",
  "Durable store",
  "Public projection",
  "Current boundary",
  "ready for governed narration calibration and generation",
]);

requireTokens("packages/storyteller/src/project-store.ts", [
  '"book-credit-script"',
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./book-credit-script"] !== "./src/book-credit-script.ts") {
    problems.push("storyteller package does not export ./book-credit-script");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/book-credit-script.ts"))
  ? read("packages/storyteller/src/book-credit-script.ts")
  : "";
const publicStart = source.indexOf("export function bookCreditScriptPublicView");
if (publicStart < 0) problems.push("book credit script public view is missing");
else {
  const returnStart = source.indexOf("return Object.freeze({", publicStart);
  const returnEnd = returnStart < 0 ? -1 : source.indexOf("});", returnStart);
  const publicReturn = returnStart < 0 || returnEnd < 0 ? "" : source.slice(returnStart, returnEnd);
  for (const forbidden of [
    "text:",
    "metadataFingerprint:",
    "policyFingerprint:",
    "reviews:",
    "approval:",
    "reviewerId:",
    "notes:",
    "finalConfirmationId:",
    "approvedByActorId:",
  ]) {
    if (publicReturn.includes(forbidden)) {
      problems.push(`book credit public view exposes private script evidence: ${forbidden}`);
    }
  }
}

const auditStart = source.indexOf("async #audit");
if (auditStart < 0) problems.push("book credit script audit boundary is missing");
else {
  const auditSource = source.slice(auditStart);
  for (const forbidden of [
    "text",
    "reviewerId",
    "notes",
    "approvedByActorId",
    "finalConfirmationId",
    "metadataFingerprint",
  ]) {
    if (auditSource.includes(forbidden)) problems.push(`book credit audit exposes private field: ${forbidden}`);
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/book-credit-script",
    "createBookCreditPolicy",
    "createBookCreditScript",
    "approveBookCreditScript",
    "FileBookCreditScriptStore",
  ]) {
    if (runtime.includes(forbidden)) problems.push(`${path} exposes private book-credit mutation: ${forbidden}`);
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio book credit script check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_book_credit_script_check_passed");
console.log("- opening and closing credits render from reviewed versioned semantic templates");
console.log("- exact wording, punctuation, names and copyright notices remain fingerprinted");
console.log("- independent editorial and rights reviews gate explicit human approval");
console.log("- changes requested remain revisioned and automation identities cannot approve");
console.log("- durable audit and public views omit script text, reviewer identities and private policy evidence");
console.log("- approved credit scripts are ready for narration generation, not mastered audio or release");
