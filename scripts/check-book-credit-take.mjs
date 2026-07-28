import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing book-credit-take file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing book-credit-take contract token: ${token}`);
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
  "packages/storyteller/src/book-credit-take.ts",
  "packages/storyteller/src/book-credit-take.test.ts",
  "packages/storyteller/package.json",
  "docs/BOOK_CREDIT_TAKES.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/book-credit-take.ts", [
  "BOOK_CREDIT_TRANSCRIPT_SCHEMA_VERSION",
  "BOOK_CREDIT_TAKE_SCHEMA_VERSION",
  "BookCreditTranscriptEvidence",
  "BookCreditTakeRecord",
  "createBookCreditTranscriptEvidence",
  "admitBookCreditTake",
  "assertBookCreditTakeRecord",
  "bookCreditTakePublicView",
  "FileBookCreditTakeStore",
  "BOOK_CREDIT_TAKE_PROVIDER_MISMATCH",
  "BOOK_CREDIT_TAKE_RIGHTS_SCOPE_MISMATCH",
  "BOOK_CREDIT_TAKE_TRANSCRIPT_SOURCE_MISMATCH",
  "BOOK_CREDIT_TAKE_ENGINEERING_CONTENT_MISMATCH",
  "BOOK_CREDIT_TAKE_TRANSCRIPT_NOT_EXACT",
  "BOOK_CREDIT_TAKE_FINAL_WORD_MISSING",
]);

requireTokens("packages/storyteller/src/book-credit-take.test.ts", [
  "exact verified opening credit take becomes eligible and public/store views stay redacted",
  "transcript drift, final-word loss and failed engineering remain classified but blocked",
  "provider, rights, scope, parent and chronology mismatches fail before classification",
  "transcript and take evidence reject recomputed structural tampering",
  "FileBookCreditTakeStore",
  "BOOK_CREDIT_TAKE_TRANSCRIPT_PARENT_MISMATCH",
  "BOOK_CREDIT_TAKE_TRANSCRIPT_PRECEDES_AUDIO",
]);

requireTokens("docs/BOOK_CREDIT_TAKES.md", [
  "Evidence chain",
  "Exact wording",
  "Technical evidence",
  "Classification",
  "Durable record",
  "Privacy boundary",
  "Current boundary",
  "must never be treated as one",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./book-credit-take"] !== "./src/book-credit-take.ts") {
    problems.push("storyteller package does not export ./book-credit-take");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/book-credit-take.ts"))
  ? read("packages/storyteller/src/book-credit-take.ts")
  : "";
const publicStart = source.indexOf("export function bookCreditTakePublicView");
if (publicStart < 0) problems.push("book credit take public view is missing");
else {
  const publicSource = source.slice(publicStart);
  for (const forbidden of [
    "audio:",
    "transcript:",
    "engineering:",
    "calibrationLockFingerprint:",
    "engineeringEvidenceFingerprint:",
    "contentHash:",
    "byteCount:",
    "providerId:",
    "modelId:",
    "rightsEvidenceId:",
    "script.text",
  ]) {
    if (publicSource.includes(forbidden)) {
      problems.push(`book credit take public view exposes private evidence: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/book-credit-take",
    "admitBookCreditTake",
    "FileBookCreditTakeStore",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private credit-take admission: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio book-credit-take check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_book_credit_take_check_passed");
console.log("- opening and closing credit candidates remain distinct from manuscript narration");
console.log("- exact transcript and final-word evidence bind to the approved credit script");
console.log("- independent engineering and verified artifact parents are mandatory");
console.log("- structurally valid failed takes are retained as blocked evidence");
console.log("- public views and normal web/API runtimes omit private media and execution state");
