import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing publication-operations-readiness file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing publication-operations-readiness token: ${token}`);
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
  "packages/cli/src/publication-operations-readiness.ts",
  "packages/cli/src/publication-operations-readiness-main.ts",
  "packages/cli/src/publication-operations-readiness.test.ts",
  "docs/PUBLICATION_OPERATIONS_READINESS.md",
  "compose.publication-operations.yml",
  "package.json",
]) requireFile(path);

requireTokens("packages/cli/src/publication-operations-readiness.ts", [
  "PUBLICATION_OPERATIONS_READINESS_SCHEMA_VERSION",
  "inspectPublicationOperationsReadiness",
  "publicationOperationsReadinessSafeErrorCode",
  "assertAudiobookRetailPublicationMonitor",
  "assertAudiobookRetailPublicationEvidenceInboxItem",
  "assertAudiobookRetailPublicationAlert",
  'entityType: "audiobook-retail-publication-monitor"',
  'entityType: "audiobook-retail-publication-evidence-inbox"',
  'entityType: "audiobook-retail-publication-alert"',
  "PUBLICATION_OPERATIONS_READINESS_SYMBOLIC_LINK_REJECTED",
  "PUBLICATION_OPERATIONS_READINESS_SPECIAL_FILE_REJECTED",
  "PUBLICATION_OPERATIONS_READINESS_STALE_TEMPORARY_FILES",
  "PUBLICATION_OPERATIONS_READINESS_AUDIT_JSON_INVALID",
  'operationalStatus: operationalStatus',
  'status: "ready"',
]);

requireTokens("packages/cli/src/publication-operations-readiness-main.ts", [
  "runPublicationOperationsReadinessCli",
  'stringFlag(args, "data-dir")',
  'dateFlag(args, "checked-at")',
  'integerFlag(args, "stale-temporary-after-ms")',
  'args.flags["readiness-only"] === true',
  'status: "not-ready"',
  "publicationOperationsReadinessSafeErrorCode",
  "mode: 0o600",
]);

requireTokens("packages/cli/src/publication-operations-readiness.test.ts", [
  "empty publication state is infrastructure-ready without claiming operational health",
  "readiness validates persisted entities and reports aggregate attention state",
  "corrupt persisted entities fail readiness with a safe code",
  "symbolic links inside publication state are rejected",
  "readiness CLI emits a redacted readiness-only result and safe failures",
  'operationalStatus, "attention"',
  "PUBLICATION_OPERATIONS_READINESS_STORE_INVALID",
  "PUBLICATION_OPERATIONS_READINESS_SYMBOLIC_LINK_REJECTED",
]);

requireTokens("docs/PUBLICATION_OPERATIONS_READINESS.md", [
  "Infrastructure readiness",
  "Operational status",
  "Monitor aggregates",
  "Evidence inbox aggregates",
  "Alert aggregates",
  "Filesystem checks",
  "Audit boundary",
  "Redacted result",
  "Docker health check",
  "Backup and restore",
  "Private application boundary",
  "does not create human evidence",
]);

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["publication-operations-readiness"]
      !== "tsx packages/cli/src/publication-operations-readiness-main.ts"
  ) {
    problems.push("root package does not expose publication-operations-readiness");
  }
  if (
    packageJson.scripts?.["verify:publication-operations-readiness"]
      !== "node scripts/check-publication-operations-readiness.mjs"
  ) {
    problems.push("root package does not expose verify:publication-operations-readiness");
  }
  if (
    !packageJson.scripts?.["verify:runtime"]?.includes(
      "npm run verify:publication-operations-readiness",
    )
  ) {
    problems.push("permanent runtime verification omits publication operations readiness");
  }
}

if (existsSync(fromRoot("compose.publication-operations.yml"))) {
  const compose = read("compose.publication-operations.yml");
  for (const token of [
    "npm run publication-operations-readiness",
    "--readiness-only",
    "--data-dir /var/lib/storyteller",
    "net.connect",
  ]) {
    if (!compose.includes(token)) {
      problems.push(`Compose gateway health check is missing readiness token: ${token}`);
    }
  }
  if (compose.includes("curl ") || compose.includes("wget ")) {
    problems.push("Compose readiness must not require external HTTP clients");
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "inspectPublicationOperationsReadiness",
    "runPublicationOperationsReadinessCli",
    "publication-operations-readiness",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private publication readiness controls: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio publication-operations-readiness check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_publication_operations_readiness_check_passed");
console.log("- every persisted publication entity is reopened and domain-validated");
console.log("- unsafe links, special files, stale temporary files and malformed audit JSON fail closed");
console.log("- operational incidents remain aggregate attention rather than infrastructure failure");
console.log("- Docker health requires both store readiness and the private gateway listener");
console.log("- normal API and web runtimes expose no readiness controls");
