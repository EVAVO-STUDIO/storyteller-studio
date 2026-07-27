import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing mastered-review file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) problems.push(`${path} is missing mastered-review contract token: ${token}`);
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
  "packages/storyteller/src/mastered-chapter-review.ts",
  "packages/storyteller/src/mastered-chapter-review.test.ts",
  "packages/storyteller/src/project-store.ts",
  "packages/storyteller/package.json",
  "docs/MASTERED_CHAPTER_REVIEW.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/mastered-chapter-review.ts", [
  "MASTERED_CHAPTER_REVIEW_SCHEMA_VERSION",
  "MasteredChapterReviewSession",
  "MasteredChapterReviewEntry",
  "createMasteredChapterReviewSession",
  "recordMasteredChapterReview",
  "approveMasteredChapterReview",
  "assertMasteredChapterReviewSession",
  "masteredChapterReviewPublicView",
  "FileMasteredChapterReviewStore",
  "MASTERED_REVIEW_INDEPENDENT_REVIEWERS_REQUIRED",
  "MASTERED_REVIEW_LISTEN_DURATION_INVALID",
  "MASTERED_REVIEW_ENGINEERING_HEADPHONES_REQUIRED",
  "MASTERED_REVIEW_EDITORIAL_CONSUMER_CONTEXT_REQUIRED",
  "MASTERED_REVIEW_HUMAN_CONFIRMATION_REQUIRED",
  "MASTERED_REVIEW_CHAIN_MISMATCH",
  "mastered_review.created",
  "reviewCount",
]);

requireTokens("packages/storyteller/src/mastered-chapter-review.test.ts", [
  "independent full-chapter editorial and engineering reviews produce an explicit human approval",
  "changes requested remain blocking until a new independent role review approves",
  "review admission enforces human independence, full listening, playback context and score gates",
  "approval is bound to the exact mastered artifact and chain",
  "review store is idempotent, revision-safe and audits no reviewer identities or notes",
  "session fingerprints, statuses and approval records fail closed when recomputed around invalid state",
  "FileMasteredChapterReviewStore",
  "approveMasteredChapterReview",
  "masteredChapterReviewPublicView",
]);

requireTokens("docs/MASTERED_CHAPTER_REVIEW.md", [
  "Exact evidence binding",
  "Required roles",
  "Full-chapter listening",
  "Review dimensions",
  "Changes requested and re-review",
  "Final confirmation",
  "Durable store",
  "Public projection",
  "Current boundary",
  "two independent human reviews",
]);

requireTokens("packages/storyteller/src/project-store.ts", [
  '"mastered-chapter-review"',
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./mastered-chapter-review"] !== "./src/mastered-chapter-review.ts") {
    problems.push("storyteller package does not export ./mastered-chapter-review");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/mastered-chapter-review.ts"))
  ? read("packages/storyteller/src/mastered-chapter-review.ts")
  : "";
const publicStart = source.indexOf("export function masteredChapterReviewPublicView");
if (publicStart < 0) problems.push("mastered chapter review public view is missing");
else {
  const returnStart = source.indexOf("return Object.freeze({", publicStart);
  const returnEnd = returnStart < 0 ? -1 : source.indexOf("});", returnStart);
  const publicReturn = returnStart < 0 || returnEnd < 0 ? "" : source.slice(returnStart, returnEnd);
  for (const forbidden of [
    "reviewerId:",
    "notes:",
    "finalConfirmationId:",
    "approvedByActorId:",
    "chainFingerprint:",
    "contentHash:",
    "byteCount:",
  ]) {
    if (publicReturn.includes(forbidden)) {
      problems.push(`mastered chapter review public view exposes private review evidence: ${forbidden}`);
    }
  }
}

const auditStart = source.indexOf("async #audit");
if (auditStart < 0) problems.push("mastered chapter review audit boundary is missing");
else {
  const auditSource = source.slice(auditStart);
  for (const forbidden of ["reviewerId", "notes", "approvedByActorId", "finalConfirmationId"]) {
    if (auditSource.includes(forbidden)) problems.push(`mastered chapter review audit exposes private field: ${forbidden}`);
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/mastered-chapter-review",
    "approveMasteredChapterReview",
    "FileMasteredChapterReviewStore",
    "recordMasteredChapterReview",
  ]) {
    if (runtime.includes(forbidden)) problems.push(`${path} exposes private mastered-review mutation: ${forbidden}`);
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio mastered chapter review check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_mastered_chapter_review_check_passed");
console.log("- full-chapter editorial and engineering reviews remain distinct and independently human");
console.log("- listened duration, playback context and quality dimensions gate readiness");
console.log("- review sessions bind the exact mastered artifact revision and evidence chain");
console.log("- final confirmation creates a linked mastered-artifact approval rather than a release");
console.log("- durable sessions reject stale writes and audit only bounded non-private metadata");
console.log("- public projections omit reviewer identities, notes, confirmations and private evidence");
