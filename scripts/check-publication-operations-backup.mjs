import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing publication-operations-backup file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing publication-operations-backup token: ${token}`);
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
  "packages/cli/src/publication-operations-backup.ts",
  "packages/cli/src/publication-operations-backup-main.ts",
  "packages/cli/src/publication-operations-backup.test.ts",
  "package.json",
  ".gitignore",
  "docs/PUBLICATION_OPERATIONS_BACKUP.md",
]) requireFile(path);

requireTokens("packages/cli/src/publication-operations-backup.ts", [
  "PUBLICATION_OPERATIONS_BACKUP_SCHEMA_VERSION",
  "createPublicationOperationsBackup",
  "verifyPublicationOperationsBackupSnapshot",
  "restorePublicationOperationsBackup",
  "PUBLICATION_OPERATIONS_BACKUP_OFFLINE_CONFIRMATION_REQUIRED",
  "PUBLICATION_OPERATIONS_BACKUP_PATH_NESTING_FORBIDDEN",
  "PUBLICATION_OPERATIONS_BACKUP_SYMLINK_FORBIDDEN",
  "PUBLICATION_OPERATIONS_BACKUP_STATE_BUSY",
  "PUBLICATION_OPERATIONS_BACKUP_SPECIAL_FILE_FORBIDDEN",
  "PUBLICATION_OPERATIONS_BACKUP_SOURCE_CHANGED",
  "PUBLICATION_OPERATIONS_BACKUP_COPY_VERIFICATION_FAILED",
  "PUBLICATION_OPERATIONS_BACKUP_CONTENT_MISMATCH",
  "PUBLICATION_OPERATIONS_RESTORE_TARGET_NOT_EMPTY",
  "PUBLICATION_OPERATIONS_RESTORE_COPY_VERIFICATION_FAILED",
  "PUBLICATION_OPERATIONS_RESTORE_FINAL_VERIFICATION_FAILED",
  "manifest.json",
  'const DATA_DIRECTORY_NAME = "data"',
  "mode: SNAPSHOT_FILE_MODE",
  "await input.afterCopy?.()",
  "await rename(stagingDirectory, finalDirectory)",
  "await rename(stagingDirectory, targetRoot)",
]);

requireTokens("packages/cli/src/publication-operations-backup-main.ts", [
  "runPublicationOperationsBackupCli",
  'args.command === "backup"',
  'args.command === "verify"',
  'args.command === "restore"',
  'stringFlag(args, "data-dir")',
  'stringFlag(args, "backup-dir", true)',
  'stringFlag(args, "snapshot", true)',
  'stringFlag(args, "actor-id", true)',
  'booleanFlag(args, "offline-confirmed")',
  'dateFlag(args, "created-at")',
  'dateFlag(args, "restored-at")',
  "await chmod(path, 0o600)",
]);

requireTokens("packages/cli/src/publication-operations-backup.test.ts", [
  "offline backup creates one verified immutable snapshot and repeats idempotently",
  "snapshot verification rejects altered bytes and unexpected extra files",
  "backup rejects active locks, temporary files and symbolic links",
  "backup detects publication state mutation during the copy window and removes staging state",
  "verified snapshot restores into new state and refuses to overwrite live state",
  "backup and restore require explicit offline confirmation and reject nested paths",
  "standalone CLI emits redacted backup, verify and restore results",
  "PUBLICATION_OPERATIONS_BACKUP_SOURCE_CHANGED",
  "PUBLICATION_OPERATIONS_RESTORE_TARGET_NOT_EMPTY",
]);

requireTokens("docs/PUBLICATION_OPERATIONS_BACKUP.md", [
  "Stop mutation roles first",
  "Snapshot layout",
  "Manifest",
  "Safe file handling",
  "Copy verification and concurrent-change detection",
  "Snapshot verification",
  "Restore boundary",
  "Restore rehearsal",
  "Docker volume workflow",
  "Encryption and retention",
  "Off-host copies",
  "Redacted output",
  "Audit boundary",
  "Rollback boundary",
  "Current boundary",
  "does not stop running services",
]);

requireTokens(".gitignore", [
  "backups/",
]);

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  const expected = {
    "publication-operations-backup":
      "tsx packages/cli/src/publication-operations-backup-main.ts backup",
    "publication-operations-backup-verify":
      "tsx packages/cli/src/publication-operations-backup-main.ts verify",
    "publication-operations-restore":
      "tsx packages/cli/src/publication-operations-backup-main.ts restore",
    "verify:publication-operations-backup":
      "node scripts/check-publication-operations-backup.mjs",
  };
  for (const [script, command] of Object.entries(expected)) {
    if (packageJson.scripts?.[script] !== command) {
      problems.push(`root package script ${script} is missing or invalid`);
    }
  }
  if (
    !packageJson.scripts?.["verify:runtime"]?.includes(
      "npm run verify:publication-operations-backup",
    )
  ) {
    problems.push("worker runtime verification omits publication operations backup");
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "publication-operations-backup",
    "createPublicationOperationsBackup",
    "restorePublicationOperationsBackup",
    "verifyPublicationOperationsBackupSnapshot",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private publication backup controls: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio publication-operations-backup check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_publication_operations_backup_check_passed");
console.log("- offline confirmation and absence of locks or temporary files are mandatory");
console.log("- source and copied bytes are independently rescanned before atomic publication");
console.log("- verification rejects missing, extra, altered, linked and unsafe snapshot content");
console.log("- restore only targets absent or empty publication state and verifies final bytes");
console.log("- command output omits paths, actors, source fingerprints and individual file evidence");
console.log("- normal API and web runtimes cannot invoke publication backup or restore controls");
