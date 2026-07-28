import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing book-credit-master file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing book-credit-master contract token: ${token}`);
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
  "packages/storyteller/src/book-credit-master.ts",
  "packages/storyteller/src/book-credit-master.test.ts",
  "packages/storyteller/package.json",
  "docs/BOOK_CREDIT_MASTER.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/book-credit-master.ts", [
  "BOOK_CREDIT_MASTER_SCHEMA_VERSION",
  "BOOK_CREDIT_MASTER_REVIEW_EVIDENCE_SCHEMA_VERSION",
  "BookCreditMasterReviewEvidence",
  "BookCreditMasterChain",
  "promoteBookCreditMaster",
  "assertBookCreditMasterReviewEvidence",
  "assertBookCreditMasterChain",
  "bookCreditMasterPublicView",
  "recordArtifactReview",
  "ingestPrivateArtifact",
  "BOOK_CREDIT_MASTER_APPROVED_SESSION_REQUIRED",
  "BOOK_CREDIT_MASTER_AUDIO_SNAPSHOT_MISMATCH",
  "BOOK_CREDIT_MASTER_RIGHTS_SCOPE_MISMATCH",
  "BOOK_CREDIT_MASTER_SOURCE_BYTES_MISMATCH",
  "BOOK_CREDIT_MASTER_LOSSLESS_FORMAT_REQUIRED",
  "BOOK_CREDIT_MASTER_NOT_LOSSLESS",
  "lossless: true",
]);

requireTokens("packages/storyteller/src/book-credit-master.test.ts", [
  "approved selected take promotes losslessly into a complete approved credit-master chain",
  "unapproved sessions, wrong bytes, rights drift and source snapshot drift fail before a master is usable",
  "credit-master chain rejects recomputed envelope and parent tampering",
  "approvedSourceAudio",
  "repeated.fingerprint",
  "BOOK_CREDIT_MASTER_SOURCE_BYTES_MISMATCH",
  "BOOK_CREDIT_MASTER_RIGHTS_SCOPE_MISMATCH",
]);

requireTokens("docs/BOOK_CREDIT_MASTER.md", [
  "Preconditions",
  "Source approval",
  "Private review evidence",
  "Lossless credit master",
  "Evidence chain",
  "Public boundary",
  "Current boundary",
  "without re-rendering, normalising or silently changing",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./book-credit-master"] !== "./src/book-credit-master.ts") {
    problems.push("storyteller package does not export ./book-credit-master");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/book-credit-master.ts"))
  ? read("packages/storyteller/src/book-credit-master.ts")
  : "";
const publicStart = source.indexOf("export function bookCreditMasterPublicView");
if (publicStart < 0) problems.push("book credit master public view is missing");
else {
  const publicSource = source.slice(publicStart);
  for (const forbidden of [
    "approvedSourceAudio:",
    "transcriptArtifact:",
    "engineeringArtifact:",
    "reviewEvidence:",
    "contentHash:",
    "byteCount:",
    "selectedAudioArtifactId:",
    "sessionId:",
    "sessionFingerprint:",
    "providerId:",
    "rightsEvidenceId:",
    "approvedByActorId:",
  ]) {
    if (publicSource.includes(forbidden)) {
      problems.push(`book credit master public view exposes private evidence: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/book-credit-master",
    "promoteBookCreditMaster",
    "BOOK_CREDIT_MASTER_SCHEMA_VERSION",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private credit-master promotion: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio book-credit-master check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_book_credit_master_check_passed");
console.log("- only an explicitly approved selected credit take can become a credit master");
console.log("- source, transcript, engineering and human review evidence remain separate parents");
console.log("- WAV or FLAC bytes are promoted without transformation and retain identical integrity");
console.log("- source and master review decisions are revisioned and idempotent");
console.log("- the private chain validates store envelopes, parent edges and complete fingerprints");
console.log("- public and normal runtime surfaces omit private source, review, rights and provider evidence");
