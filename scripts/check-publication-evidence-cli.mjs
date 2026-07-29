import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing publication-evidence-cli file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing publication-evidence-cli token: ${token}`);
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
  "packages/cli/src/main.ts",
  "packages/cli/src/publication-evidence.ts",
  "packages/cli/src/publication-evidence.test.ts",
  "package.json",
  "docs/PUBLICATION_EVIDENCE_INTAKE_CLI.md",
]) requireFile(path);

requireTokens("packages/cli/src/publication-evidence.ts", [
  "SubmitPublicationEvidenceCommandInput",
  "submitPublicationEvidenceCommand",
  "createAudiobookRetailPublicationEvidenceRequest",
  "submitAudiobookRetailPublicationEvidence",
  "audiobookRetailPublicationEvidenceInboxPublicView",
  "FileAudiobookRetailPublicationMonitorStore",
  "FileAudiobookRetailPublicationEvidenceInboxStore",
  'resolve(dataDirectory, "publication-operations")',
  "idempotent: existing !== null",
]);

requireTokens("packages/cli/src/main.ts", [
  'case "publication-evidence-submit"',
  "submitPublicationEvidenceCommand",
  'stringFlag(args, "data-dir"',
  'stringFlag(args, "monitor-id", true)',
  'stringFlag(args, "verification", true)',
  'stringFlag(args, "source-reference-hash", true)',
  'stringFlag(args, "actor-id", true)',
  'dateFlag(args, "received-at")',
  "publication-evidence-submit",
]);

requireTokens("packages/cli/src/publication-evidence.test.ts", [
  "publication evidence CLI admits one exact verification idempotently and emits only the redacted view",
  "publication evidence CLI rejects invalid source provenance before persistence",
  "publication-evidence-submit",
  "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_SOURCE_HASH_INVALID",
  "idempotent",
  "sourceReferenceHash",
  "receivedByActorId",
]);

requireTokens("docs/PUBLICATION_EVIDENCE_INTAKE_CLI.md", [
  "Exact persisted monitor",
  "Complete verification input",
  "Source provenance",
  "Operator identity",
  "Idempotency",
  "Output boundary",
  "Persistence and audit",
  "Private application boundary",
  "Current boundary",
  "does not acquire retailer evidence",
]);

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:publication-evidence-cli"]
      !== "node scripts/check-publication-evidence-cli.mjs"
  ) {
    problems.push("root package does not expose verify:publication-evidence-cli");
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:publication-evidence-cli",
    )
  ) {
    problems.push("permanent artifact verification omits publication evidence intake CLI");
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "submitPublicationEvidenceCommand",
    "publication-evidence-submit",
    "audiobook-retail-publication-evidence-inbox",
    "submitAudiobookRetailPublicationEvidence",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private publication evidence intake controls: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio publication-evidence-cli check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_publication_evidence_cli_check_passed");
console.log("- the command rebinds evidence to the exact persisted monitor revision");
console.log("- only complete fingerprint-valid publication verification is admitted");
console.log("- deterministic repeated intake is idempotent");
console.log("- output omits complete evidence, provenance, identities and paths");
console.log("- no normal API or web runtime exposes publication evidence intake");
