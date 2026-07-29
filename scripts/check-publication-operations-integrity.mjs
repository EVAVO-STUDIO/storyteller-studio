import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing publication-operations-integrity file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing publication-operations-integrity token: ${token}`);
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
  "packages/cli/src/publication-operations-integrity.ts",
  "packages/cli/src/publication-operations-integrity-main.ts",
  "packages/cli/src/publication-operations-integrity.test.ts",
  "compose.publication-operations.yml",
  "package.json",
  "docs/PUBLICATION_OPERATIONS_INTEGRITY.md",
  "docs/PUBLICATION_OPERATIONS_MAINTENANCE_PROFILE.md",
]) requireFile(path);

requireTokens("packages/cli/src/publication-operations-integrity.ts", [
  "verifyPublicationOperationsStateIntegrity",
  "PublicationOperationsIntegritySummary",
  "FileAudiobookRetailPublicationMonitorStore",
  "FileAudiobookRetailPublicationAlertStore",
  "FileAudiobookRetailPublicationEvidenceInboxStore",
  "createReadStream",
  "createInterface",
  "PUBLICATION_OPERATIONS_INTEGRITY_STATE_ROOT_INVALID",
  "PUBLICATION_OPERATIONS_INTEGRITY_TRANSIENT_FILE_PRESENT",
  "PUBLICATION_OPERATIONS_INTEGRITY_ENTITY_TYPE_INVALID",
  "PUBLICATION_OPERATIONS_INTEGRITY_MONITOR_ENVELOPE_INVALID",
  "PUBLICATION_OPERATIONS_INTEGRITY_ALERT_MONITOR_MISSING",
  "PUBLICATION_OPERATIONS_INTEGRITY_ALERT_TRIGGER_MISMATCH",
  "PUBLICATION_OPERATIONS_INTEGRITY_EVIDENCE_ACKNOWLEDGEMENT_MISMATCH",
  "PUBLICATION_OPERATIONS_INTEGRITY_AUDIT_FINGERPRINT_INVALID",
  "PUBLICATION_OPERATIONS_INTEGRITY_EVIDENCE_RECONCILIATION_PENDING",
  "PUBLICATION_OPERATIONS_INTEGRITY_EVIDENCE_REQUEST_SUPERSEDED",
  "PUBLICATION_OPERATIONS_INTEGRITY_EVIDENCE_AVAILABLE_EXPIRED",
  'status: PublicationOperationsIntegrityStatus',
  "fingerprint: stableHash(partial)",
]);

requireTokens("packages/cli/src/publication-operations-integrity-main.ts", [
  "runPublicationOperationsIntegrityCli",
  'stringFlag(args, "data-dir")',
  'dateFlag(args, "checked-at")',
  'booleanFlag(args, "strict-warnings")',
  'stringFlag(args, "output")',
  "await chmod(path, 0o600)",
  'summary.status === "invalid"',
  'summary.status === "valid-with-warnings"',
]);

requireTokens("packages/cli/src/publication-operations-integrity.test.ts", [
  "restored publication state validates domain envelopes, graph links and audit fingerprints",
  "tampered entity envelopes fail closed without exposing entity identifiers",
  "missing monitors make alert, evidence and audit references invalid",
  "audit metadata tampering is detected independently from entity envelopes",
  "consumed but unacknowledged evidence is a safe reconciliation warning",
  "CLI writes aggregate-only integrity output and returns two for invalid state",
  "PUBLICATION_OPERATIONS_INTEGRITY_MONITOR_ENVELOPE_INVALID",
  "PUBLICATION_OPERATIONS_INTEGRITY_AUDIT_FINGERPRINT_INVALID",
  "PUBLICATION_OPERATIONS_INTEGRITY_EVIDENCE_RECONCILIATION_PENDING",
]);

requireTokens("docs/PUBLICATION_OPERATIONS_INTEGRITY.md", [
  "Read-only boundary",
  "Allowed durable entities",
  "Filesystem layout checks",
  "Domain envelope checks",
  "Alert graph checks",
  "Evidence inbox graph checks",
  "Audit partition verification",
  "Status",
  "Redacted result",
  "Restore rehearsal",
  "Docker maintenance profile",
  "Current boundary",
  "does not prove historical envelope reconstruction",
]);

requireTokens("compose.publication-operations.yml", [
  "publication-integrity:",
  "publication-operations-integrity",
  "--strict-warnings",
  "publication-data:/var/lib/storyteller:ro",
]);

requireTokens("docs/PUBLICATION_OPERATIONS_MAINTENANCE_PROFILE.md", [
  "Verify restored-state integrity",
  "publication-integrity",
  "--strict-warnings",
]);

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["publication-operations-integrity"]
      !== "tsx packages/cli/src/publication-operations-integrity-main.ts"
  ) {
    problems.push("root package does not expose publication-operations-integrity");
  }
  if (
    packageJson.scripts?.["verify:publication-operations-integrity"]
      !== "node scripts/check-publication-operations-integrity.mjs"
  ) {
    problems.push("root package does not expose verify:publication-operations-integrity");
  }
  if (
    !packageJson.scripts?.["verify:runtime"]?.includes(
      "npm run verify:publication-operations-integrity",
    )
  ) {
    problems.push("worker runtime verification omits publication operations integrity");
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "publication-operations-integrity",
    "verifyPublicationOperationsStateIntegrity",
    "runPublicationOperationsIntegrityCli",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private publication integrity controls: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio publication-operations-integrity check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_publication_operations_integrity_check_passed");
console.log("- restored monitor, alert and evidence envelopes are reopened through domain stores");
console.log("- retained graph references and audit-event fingerprints are checked read-only");
console.log("- structural corruption is separated from safe reconciliation warnings");
console.log("- output exposes only aggregate counts, distributions and safe issue codes");
console.log("- strict warning mode can gate restore promotion without mutating state");
console.log("- normal API and web runtimes cannot invoke publication integrity controls");
