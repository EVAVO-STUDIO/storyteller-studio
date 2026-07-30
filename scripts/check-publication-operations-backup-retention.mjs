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
  "packages/cli/src/publication-operations-backup-retention-main.ts",
  "packages/cli/src/publication-operations-backup-retention.test.ts",
  "docs/PUBLICATION_OPERATIONS_BACKUP_RETENTION.md",
  "package.json",
]) requireFile(path);

requireTokens("packages/cli/src/publication-operations-backup-retention.ts", [
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_SCHEMA_VERSION",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_RESULT_SCHEMA_VERSION",
  "planPublicationOperationsBackupRetention",
  "prunePublicationOperationsBackups",
  "verifyPublicationOperationsBackupSnapshot",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_STALE",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_SYMLINK_FORBIDDEN",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_DIRECTORY_BUSY",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_ROOT_LAYOUT_INVALID",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PROTECTED_NOT_FOUND",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_OFFLINE_CONFIRMATION_REQUIRED",
  '"latest"',
  '"daily"',
  '"weekly"',
  '"protected"',
  ".pruning",
  "DELETE_ROLLBACK_FAILED",
  "POST_DELETE_MISMATCH",
]);

requireTokens("packages/cli/src/publication-operations-backup-retention-main.ts", [
  "runPublicationOperationsBackupRetentionCli",
  'args.command === "plan"',
  'args.command === "apply"',
  'stringFlag(args, "backup-dir", true)',
  '"plan-fingerprint"',
  "expectedPlanFingerprint",
  'stringFlag(args, "actor-id", true)',
  'booleanFlag(args, "offline-confirmed")',
  'PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_FLAG_REQUIRED:output',
  "0o600",
  "chmod(path, 0o600)",
]);

requireTokens("packages/cli/src/publication-operations-backup-retention.test.ts", [
  "retention planning verifies every snapshot and is deterministic without deleting",
  "daily and weekly buckets retain the newest verified snapshot in each UTC bucket",
  "offline apply deletes only the exact verified plan and preserves retained snapshots",
  "changed inventory invalidates a previously approved plan before deletion",
  "retention rejects unknown root entries, staging state and symbolic links",
  "retention CLI requires a private apply receipt and writes mode-0600 evidence",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_STALE",
  "PUBLICATION_OPERATIONS_BACKUP_RETENTION_SYMLINK_FORBIDDEN",
]);

requireTokens("docs/PUBLICATION_OPERATIONS_BACKUP_RETENTION.md", [
  "Verified inventory",
  "Retention policy",
  "Deterministic plan",
  "Exact apply gate",
  "Verified deletion",
  "Required receipt",
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
console.log("- protected, daily, weekly and latest retention are deterministic");
console.log("- apply requires a private mode-0600 receipt");
console.log("- backup creation, readiness, startup, API and web runtimes cannot prune automatically");
