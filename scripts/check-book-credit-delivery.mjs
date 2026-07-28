import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing book-credit-delivery file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing book-credit-delivery contract token: ${token}`);
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
  "packages/storyteller/src/book-credit-delivery.ts",
  "packages/storyteller/src/book-credit-master.test.ts",
  "packages/storyteller/package.json",
  "docs/BOOK_CREDIT_DELIVERY.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/book-credit-delivery.ts", [
  "BOOK_CREDIT_DELIVERY_SCHEMA_VERSION",
  "BookCreditDeliverySnapshot",
  "createBookCreditDeliverySnapshot",
  "assertBookCreditDeliverySnapshot",
  "bookCreditDeliveryPublicView",
  "assertBookCreditMasterChain",
  "assertBookCreditTakeReviewSession",
  "assertAudioEngineeringEvidence",
  "BOOK_CREDIT_DELIVERY_APPROVED_REVIEW_REQUIRED",
  "BOOK_CREDIT_DELIVERY_ENGINEERING_INELIGIBLE",
  "BOOK_CREDIT_DELIVERY_DURATION_EVIDENCE_MISMATCH",
  "BOOK_CREDIT_DELIVERY_WAV_MASTER_REQUIRED",
  "BOOK_CREDIT_DELIVERY_BIT_DEPTH_UNSUPPORTED",
  "BOOK_CREDIT_DELIVERY_RIGHTS_EXPIRED",
  "ready-for-book-assembly",
]);

requireTokens("packages/storyteller/src/book-credit-master.test.ts", [
  "approved credit master produces an immutable delivery snapshot",
  "BOOK_CREDIT_DELIVERY_DURATION_EVIDENCE_MISMATCH",
  "BOOK_CREDIT_DELIVERY_RIGHTS_EXPIRED",
  "bookCreditDeliveryPublicView",
]);

requireTokens("docs/BOOK_CREDIT_DELIVERY.md", [
  "Required evidence",
  "Bound delivery data",
  "Privacy boundary",
  "Current boundary",
  "Only WAV credit masters are admitted",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./book-credit-delivery"] !== "./src/book-credit-delivery.ts") {
    problems.push("storyteller package does not export ./book-credit-delivery");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/book-credit-delivery.ts"))
  ? read("packages/storyteller/src/book-credit-delivery.ts")
  : "";
const publicStart = source.indexOf("export function bookCreditDeliveryPublicView");
if (publicStart < 0) problems.push("book credit delivery public view is missing");
else {
  const publicSource = source.slice(publicStart);
  for (const forbidden of [
    "creditMaster.id:",
    "contentHash:",
    "rightsFingerprint:",
    "reviewApprovalFingerprint:",
    "selectedTakeRecordId:",
    "providerId:",
    "objectKey:",
  ]) {
    if (publicSource.includes(forbidden)) {
      problems.push(`book credit delivery public view exposes private state: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/book-credit-delivery",
    "createBookCreditDeliverySnapshot",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private book-credit delivery creation: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio book-credit-delivery check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_book_credit_delivery_check_passed");
console.log("- approved credit masters become deterministic role-bound delivery snapshots");
console.log("- observed duration and PCM output are taken from independent engineering evidence");
console.log("- current rights and exact review/master scope are required");
console.log("- public views omit artifact, rights, review and provider identities");
console.log("- complete-book assembly remains a separate future boundary");
