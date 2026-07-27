import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing budget-ledger file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing budget-ledger contract token: ${token}`);
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
  "packages/storyteller/src/budget-ledger.ts",
  "packages/storyteller/src/budget-ledger.test.ts",
  "packages/storyteller/src/project-store.ts",
  "packages/storyteller/package.json",
  "docs/BUDGET_RESERVATIONS.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/project-store.ts", [
  '| "budget-account"',
]);

requireTokens("packages/storyteller/src/budget-ledger.ts", [
  "BUDGET_ACCOUNT_SCHEMA_VERSION",
  "BUDGET_ACCOUNT_ENTITY_TYPE",
  "BUDGET_MICROS_PER_MAJOR_UNIT",
  "BudgetReservationStatus",
  "BudgetReservation",
  "BudgetAccount",
  "BudgetAccountPublicView",
  "BudgetReservationReceipt",
  "BudgetConflictError",
  "BudgetIntegrityError",
  "BudgetInsufficientFundsError",
  "budgetMicros",
  "budgetMajorUnits",
  "budgetAccountId",
  "budgetReservationId",
  "assertBudgetAccount",
  "FileBudgetLedger",
  "createAccount",
  "updateAuthorisedLimit",
  "reserve",
  "renew",
  "commit",
  "release",
  "reapExpired",
  "BUDGET_INSUFFICIENT_AVAILABLE_FUNDS",
  "BUDGET_COMMIT_EXCEEDS_RESERVATION",
  "BUDGET_LIMIT_BELOW_OBLIGATIONS",
  "BUDGET_MUTATION_RETRY_EXHAUSTED",
  "STORE_REVISION_CONFLICT:",
  "budget.reservation.created",
  "budget.reservation.renewed",
  "budget.reservation.committed",
  "budget.reservation.released",
  "budget.reservation.expired",
  "budgetAccountPublicView",
]);

requireTokens("packages/storyteller/src/budget-ledger.test.ts", [
  "major currency values convert to exact integer micro-units",
  "account creation is idempotent but a changed limit conflicts",
  "parallel reservations cannot overspend one account",
  "reservation retries are idempotent and changed amounts are rejected",
  "committing actual cost releases the unused reservation atomically",
  "commit cannot exceed the pre-provider reservation",
  "renewal extends active capacity while expiry and release return it",
  "authorised limit cannot be lowered below committed and active obligations",
  "public views and audit metadata omit reservation, queue and job identities",
  "tampered budget envelopes fail integrity verification",
  "invalid reservation and account transitions fail closed",
  "Promise.allSettled",
  "BudgetInsufficientFundsError",
]);

requireTokens("docs/BUDGET_RESERVATIONS.md", [
  "Integer micro-units",
  "Budget account",
  "Reservation identity",
  "Reservation lifecycle",
  "Concurrency model",
  "Integrity",
  "Audit and public views",
  "Worker integration contract",
  "No public spend mutation",
  "Production migration",
  "Queue completion must not precede budget settlement",
  "PostgreSQL transaction",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./budget-ledger"] !== "./src/budget-ledger.ts") {
    problems.push("storyteller package does not export ./budget-ledger from its governed source module");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/budget-ledger.ts"))
  ? read("packages/storyteller/src/budget-ledger.ts")
  : "";

const publicViewStart = source.indexOf("export function budgetAccountPublicView");
if (publicViewStart < 0) {
  problems.push("budget account public view implementation is missing");
} else {
  const publicView = source.slice(publicViewStart);
  for (const forbidden of [
    "projectId:",
    "reservationId:",
    "jobId:",
    "queueItemId:",
    "actorId:",
    "reservations:",
    "releaseCode:",
  ]) {
    if (publicView.includes(forbidden)) {
      problems.push(`budget account public view exposes private reservation field: ${forbidden}`);
    }
  }
}

const auditStart = source.indexOf("  async #audit(");
if (auditStart < 0) {
  problems.push("budget ledger audit boundary is missing");
} else {
  const auditSource = source.slice(auditStart, publicViewStart > auditStart ? publicViewStart : undefined);
  for (const forbidden of [
    "jobId",
    "queueItemId",
    "reservationId",
    "providerId",
    "credential",
    "objectKey",
    "leaseToken",
  ]) {
    if (auditSource.includes(forbidden)) {
      problems.push(`budget audit metadata exposes execution identity: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtimeSource = read(path);
  for (const forbidden of [
    "FileBudgetLedger",
    "budget-ledger",
    ".reserve(",
    ".commit(",
    ".release(",
  ]) {
    if (runtimeSource.includes(forbidden)) {
      problems.push(`${path} exposes budget mutation through a normal application surface: ${forbidden}`);
    }
  }
}

for (const path of [
  ".github/workflows/one-time-budget-account-entity.yml",
  ".github/budget-account-entity.trigger",
]) {
  if (existsSync(fromRoot(path))) {
    problems.push(`completed budget entity migration file remains in the repository: ${path}`);
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio budget ledger check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_budget_ledger_check_passed");
console.log("- all durable amounts use exact integer micro-units");
console.log("- concurrent reservations cannot exceed one project currency limit");
console.log("- reservation identity is deterministic across transport retries and unique per queue attempt");
console.log("- actual cost cannot exceed the pre-provider reservation");
console.log("- release, renewal and expiry preserve immutable reservation history");
console.log("- public views and audit metadata omit job, queue and reservation identities");
console.log("- normal API and browser runtimes expose no budget mutation capability");
