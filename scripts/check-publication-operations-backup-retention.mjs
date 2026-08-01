import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing publication-backup-retention file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing publication-backup-retention token: ${token}`);
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
  "packages/cli/src/publication-operations-backup-retention.ts",
  "packages/cli/src/publication-operations-backup-retention-evidence.ts",
  "packages/cli/src/publication-operations-backup-retention-inspection.ts",
  "packages/cli/src/publication-operations-backup-retention-main.ts",
  "packages/cli/src/publication-operations-backup-retention.test.ts",
  "packages/cli/src/publication-operations-backup-retention-output.test.ts",
  "packages/cli/src/publication-operations-backup-retention-apply-intent.test.ts",
  "packages/cli/src/publication-operations-backup-retention-inspection.test.ts",
  "docs/PUBLICATION_OPERATIONS_BACKUP_RETENTION.md",
  "package.json",
]) requireFile(path);

requireTokens("packages/cli/src/publication-operations-backup-retention.ts", [
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_SCHEMA_VERSION",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_SCHEMA_VERSION",
  "planPublicationOperationsBackupRetention",
  "prunePublicationOperationsBackups",
  "assertPublicationOperationsBackupRetentionPlan",
  "assertPublicationOperationsBackupRetentionResult",
  "verifyPublicationOperationsBackupSnapshot",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_STALE",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_SYMLINK_FORBIDDEN",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_DIRECTORY_BUSY",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_ROOT_LAYOUT_INVALID",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PROTECTED_NOT_FOUND",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_OFFLINE_CONFIRMATION_REQUIRED",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLICATION_REVISION_INVALID",
  "applicationRevision",
  '"latest"',
  '"daily"',
  '"weekly"',
  '"protected"',
  ".pruning",
  "DELETE_ROLLBACK_FAILED",
  "POST_DELETE_MISMATCH",
]);

requireTokens("packages/cli/src/publication-operations-backup-retention-evidence.ts", [
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_INTENT_SCHEMA_VERSION",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_FAILURE_SCHEMA_VERSION",
  "storyteller-publication-operations-backup-retention-apply-intent-v2",
  "storyteller-publication-operations-backup-retention-apply-failure-v2",
  "intentFingerprint",
  "failureFingerprint",
  'backupState: "inspection-required-until-completed"',
  'backupState: "inspection-required"',
  "APPLY_FAILURE_INTENT_MISMATCH",
  "requireExactKeys",
]);

requireTokens("packages/cli/src/publication-operations-backup-retention-inspection.ts", [
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_SCHEMA_VERSION",
  "inspectPublicationOperationsBackupRetention",
  "verified-complete",
  "verified-complete-recovered",
  "verified-no-mutation",
  "inspection-required",
  "legacy-unfingerprinted",
  "afterFirstInventory",
  "INSPECTION_STATE_CHANGED",
  "INSPECTION_EVIDENCE_CHANGED",
  "PRUNING_ENTRY_PATTERN",
  "normalServicesMayRestart",
  "applyEvidenceFingerprint",
  "inventoryFingerprint",
]);

requireTokens("packages/cli/src/publication-operations-backup-retention-main.ts", [
  "runPublicationOperationsBackupRetentionCli",
  'args.command === "plan"',
  'args.command === "apply"',
  'args.command === "inspect"',
  'stringFlag(args, "plan-receipt", true)',
  'stringFlag(args, "apply-receipt", true)',
  'await emit(result, output, force, "inspection", stdout);',
  'stringFlag(args, "backup-dir", true)',
  'stringFlag(args, "output", true)',
  '"application-revision"',
  '"plan-fingerprint"',
  "expectedPlanFingerprint",
  'stringFlag(args, "actor-id", true)',
  'booleanFlag(args, "offline-confirmed")',
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_OUTPUT_EXISTS",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_OUTPUT_INSIDE_BACKUP_ROOT",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_OUTPUT_RESERVATION_CHANGED",
  "receiptPathOutsideBackupRoot",
  "assertPrivateReceiptReservation",
  "replacePrivateReceipt",
  "syncParentDirectory",
  "afterApplyIntent",
  "safeCliErrorMessage",
  "randomUUID",
  'open(stagingPath, "wx", 0o600)',
  "handle.sync()",
  "link(stagingPath, path)",
  "rename(stagingPath, path)",
  'status: "written"',
  "0o600",
  "chmod(path, 0o600)",
]);

requireTokens("packages/cli/src/publication-operations-backup-retention.test.ts", [
  "retention planning verifies every snapshot and is deterministic without deleting",
  "daily and weekly buckets retain the newest verified snapshot in each UTC bucket",
  "offline apply deletes only the exact verified plan and preserves retained snapshots",
  "changed inventory invalidates a previously approved plan before deletion",
  "application revision change invalidates an approved plan before deletion",
  "retention rejects unknown root entries, staging state and symbolic links",
  "retention CLI requires a private apply receipt and writes mode-0600 evidence",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_STALE",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_SYMLINK_FORBIDDEN",
]);

requireTokens("packages/cli/src/publication-operations-backup-retention-output.test.ts", [
  "retention plan and apply both require private output receipts",
  "retention receipts publish atomically with bounded path-free acknowledgements",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_FLAG_REQUIRED:output",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_OUTPUT_EXISTS",
  'receipt: "plan"',
  'receipt: "apply"',
  'name.endsWith(".tmp")',
]);

requireTokens("packages/cli/src/publication-operations-backup-retention-apply-intent.test.ts", [
  "retention receipts cannot be written inside the backup inventory",
  "an occupied apply receipt path blocks all deletion before mutation",
  "inventory drift after intent produces private failure evidence without deletion",
  "a changed intent reservation stops deletion and preserves the external replacement",
  "successful apply atomically replaces intent with the final apply receipt",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_OUTPUT_INSIDE_BACKUP_ROOT",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_OUTPUT_RESERVATION_CHANGED",
  "storyteller-publication-operations-backup-retention-apply-failure-v2",
  'backupState, "inspection-required"',
]);

requireTokens("packages/cli/src/publication-operations-backup-retention-inspection.test.ts", [
  "successful apply produces a verified-complete private inspection",
  "failed apply with a later valid snapshot proves no planned deletion occurred",
  "exact retained state with an interrupted intent becomes verified recovery evidence",
  "partial deletion remains inspection-required and cannot authorise restart",
  "pruning residue is verified but remains an explicit manual-inspection blocker",
  "legacy v1 intent remains inspectable but is explicitly marked untrusted",
  "hard-linked private evidence is rejected before inspection",
  "failure evidence cannot be rebound to a forged apply intent",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_STATE_CHANGED",
  'receipt: "inspection"',
]);

requireTokens("docs/PUBLICATION_OPERATIONS_BACKUP_RETENTION.md", [
  "Verified inventory",
  "Retention policy",
  "Deterministic plan",
  "Exact apply gate",
  "exact application revision",
  "Verified deletion",
  "Required private receipts",
  "Atomic receipt publication",
  "Apply intent evidence",
  "Interrupted apply inspection",
  "verified-complete-recovered",
  "verified-no-mutation",
  "read-only two-pass inventory",
  "outside the backup root",
  "inspection-required-until-completed",
  "bounded acknowledgement",
  "Offline maintenance boundary",
  "No automatic pruning",
  "does not",
  "Keep at least one recent verified off-host recovery copy",
]);

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["publication-operations-backup-retention-plan"]
      !== "tsx packages/cli/src/publication-operations-backup-retention-main.ts plan"
  ) {
    problems.push("root package does not expose publication backup retention planning");
  }
  if (
    packageJson.scripts?.["publication-operations-backup-prune"]
      !== "tsx packages/cli/src/publication-operations-backup-retention-main.ts apply"
  ) {
    problems.push("root package does not expose publication backup pruning");
  }
  if (
    packageJson.scripts?.["publication-operations-backup-retention-inspect"]
      !== "tsx packages/cli/src/publication-operations-backup-retention-main.ts inspect"
  ) {
    problems.push("root package does not expose publication backup retention inspection");
  }
  if (
    packageJson.scripts?.["verify:publication-operations-backup-retention"]
      !== "node scripts/check-publication-operations-backup-retention.mjs"
  ) {
    problems.push("root package does not expose verify:publication-operations-backup-retention");
  }
  if (
    !packageJson.scripts?.["verify:runtime"]?.includes(
      "npm run verify:publication-operations-backup-retention",
    )
  ) {
    problems.push("permanent runtime verification omits publication backup retention");
  }
}

for (const path of [
  "packages/cli/src/publication-operations-backup.ts",
  "packages/cli/src/publication-operations-backup-main.ts",
  "packages/cli/src/publication-operations-readiness.ts",
  "packages/cli/src/publication-operations-readiness-main.ts",
  "apps/worker/src/main.ts",
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  if (!existsSync(fromRoot(path))) continue;
  const runtime = read(path);
  for (const forbidden of [
    "prunePublicationOperationsBackups",
    "planPublicationOperationsBackupRetention",
    "publication-operations-backup-prune",
    "inspectPublicationOperationsBackupRetention",
    "publication-operations-backup-retention-inspect",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} invokes private backup retention automatically: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio publication-backup-retention check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_publication_backup_retention_check_passed");
console.log("- all snapshots are fully verified before keep or delete selection");
console.log("- destructive apply requires an unchanged plan fingerprint and offline confirmation");
console.log("- apply reserves verified private intent evidence before any deletion can start");
console.log("- occupied, nested or externally changed receipt paths fail before mutation");
console.log("- fingerprinted v2 intent and failure evidence preserve one immutable apply chain");
console.log("- failed apply preserves an intent or publishes inspection-required private evidence");
console.log("- read-only two-pass inspection classifies complete, recovered, no-mutation and manual-review states");
console.log("- protected, daily, weekly and latest retention are deterministic");
console.log("- plan and apply require atomically published private mode-0600 receipts");
console.log("- standard output is a bounded acknowledgement without paths, revisions or snapshot evidence");
console.log("- backup creation, readiness, startup, API and web runtimes cannot prune automatically");
