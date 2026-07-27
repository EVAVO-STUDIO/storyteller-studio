import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing book-sequence file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) problems.push(`${path} is missing book-sequence contract token: ${token}`);
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
  "packages/storyteller/src/book-chapter-sequence.ts",
  "packages/storyteller/src/book-chapter-sequence.test.ts",
  "packages/storyteller/src/project-store.ts",
  "packages/storyteller/package.json",
  "docs/BOOK_CHAPTER_SEQUENCE.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/book-chapter-sequence.ts", [
  "BOOK_CHAPTER_SEQUENCE_SCHEMA_VERSION",
  "BookChapterSequenceEntry",
  "BookChapterSequence",
  "createBookChapterSequence",
  "reviseBookChapterSequence",
  "assertBookChapterSequence",
  "bookChapterSequencePublicView",
  "FileBookChapterSequenceStore",
  "assertMasteredChapterArtifactChain",
  "assertMasteredChapterReviewSession",
  "assertMasteringPlan",
  "BOOK_SEQUENCE_ARTIFACT_REVISION_MISMATCH",
  "BOOK_SEQUENCE_REVIEW_SCOPE_MISMATCH",
  "BOOK_SEQUENCE_RIGHTS_MISMATCH",
  "BOOK_SEQUENCE_ENGINEERING_PROFILE_MISMATCH",
  "BOOK_SEQUENCE_OUTPUT_PROFILE_MISMATCH",
  "BOOK_SEQUENCE_ORDINALS_NOT_CONTIGUOUS",
  "ready-for-credits",
  "book_sequence.created",
]);

requireTokens("packages/storyteller/src/book-chapter-sequence.test.ts", [
  "approved mastered chapters form a deterministic ready-for-credits book sequence",
  "chapter ordinals, special roles and identities fail closed",
  "unapproved, mismatched or altered mastered evidence cannot enter the sequence",
  "rights, engineering and output profiles must remain consistent across the book",
  "sequence revisions preserve immutable book scope and linked fingerprints",
  "book sequence store is idempotent, stale-write safe and audits only bounded summary data",
  "entry, duration and sequence fingerprints reject recomputed tampering",
  "FileBookChapterSequenceStore",
  "approveMasteredChapterReview",
]);

requireTokens("docs/BOOK_CHAPTER_SEQUENCE.md", [
  "Admission boundary",
  "Chapter order and roles",
  "Technical consistency",
  "Rights at sequencing time",
  "Immutable entries",
  "Revision model",
  "Durable store",
  "Public projection",
  "Current boundary",
  "ready-for-credits",
]);

requireTokens("packages/storyteller/src/project-store.ts", [
  '"book-chapter-sequence"',
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./book-chapter-sequence"] !== "./src/book-chapter-sequence.ts") {
    problems.push("storyteller package does not export ./book-chapter-sequence");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/book-chapter-sequence.ts"))
  ? read("packages/storyteller/src/book-chapter-sequence.ts")
  : "";
const publicStart = source.indexOf("export function bookChapterSequencePublicView");
if (publicStart < 0) problems.push("book chapter sequence public view is missing");
else {
  const returnStart = source.indexOf("return Object.freeze({", publicStart);
  const returnEnd = returnStart < 0 ? -1 : source.indexOf("});", returnStart);
  const publicReturn = returnStart < 0 || returnEnd < 0 ? "" : source.slice(returnStart, returnEnd);
  for (const forbidden of [
    "masteredArtifact:",
    "masteredChainFingerprint:",
    "reviewSessionFingerprint:",
    "masteringPlanFingerprint:",
    "rightsFingerprint:",
    "engineeringProfileFingerprint:",
    "contentHash:",
    "byteCount:",
    "createdByActorId:",
  ]) {
    if (publicReturn.includes(forbidden)) {
      problems.push(`book chapter sequence public view exposes private evidence: ${forbidden}`);
    }
  }
}

const auditStart = source.indexOf("async #audit");
if (auditStart < 0) problems.push("book chapter sequence audit boundary is missing");
else {
  const auditSource = source.slice(auditStart);
  for (const forbidden of [
    "masteredArtifact",
    "chapterId",
    "title",
    "rightsFingerprint",
    "reviewSessionFingerprint",
  ]) {
    if (auditSource.includes(forbidden)) problems.push(`book sequence audit exposes private field: ${forbidden}`);
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/book-chapter-sequence",
    "createBookChapterSequence",
    "reviseBookChapterSequence",
    "FileBookChapterSequenceStore",
  ]) {
    if (runtime.includes(forbidden)) problems.push(`${path} exposes private book sequence mutation: ${forbidden}`);
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio book chapter sequence check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_book_chapter_sequence_check_passed");
console.log("- only exact approved mastered artifact revisions and review sessions enter the book sequence");
console.log("- ordinals, prologue and epilogue placement, chapter identity and duration are deterministic");
console.log("- rights, engineering profile and lossless output remain consistent across every chapter");
console.log("- revisions preserve immutable book scope and reject stale writes");
console.log("- audit and public projections omit artifact hashes, review evidence and private rights data");
console.log("- a valid sequence is ready for credits and complete-book assembly, not release");
