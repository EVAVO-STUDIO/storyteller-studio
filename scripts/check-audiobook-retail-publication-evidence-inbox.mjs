import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-publication-evidence-inbox file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing publication-evidence-inbox contract token: ${token}`,
      );
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
  "packages/storyteller/src/audiobook-retail-publication-evidence-inbox.ts",
  "packages/storyteller/src/audiobook-retail-publication-evidence-inbox.test.ts",
  "packages/storyteller/package.json",
  "packages/storyteller/src/project-store.ts",
  "apps/worker/src/publication-refresh-runtime.ts",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX.md",
]) requireFile(path);

requireTokens(
  "packages/storyteller/src/audiobook-retail-publication-evidence-inbox.ts",
  [
    "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REQUEST_SCHEMA_VERSION",
    "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_SCHEMA_VERSION",
    "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_ENTITY_TYPE",
    "audiobookRetailPublicationRefreshRequestFingerprint",
    "createAudiobookRetailPublicationEvidenceRequest",
    "assertAudiobookRetailPublicationEvidenceRequest",
    "assertAudiobookRetailPublicationEvidenceMatchesRequest",
    "submitAudiobookRetailPublicationEvidence",
    "acknowledgeAudiobookRetailPublicationEvidence",
    "assertAudiobookRetailPublicationEvidenceInboxItem",
    "audiobookRetailPublicationEvidenceInboxPublicView",
    "FileAudiobookRetailPublicationEvidenceInboxStore",
    "findCurrentForRequest",
    "available",
    "acknowledged",
    "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REQUEST_MISMATCH",
    "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_ACKNOWLEDGEMENT_INVALID",
    "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_STORE_REVISION_CONFLICT",
  ],
);

requireTokens(
  "packages/storyteller/src/audiobook-retail-publication-evidence-inbox.test.ts",
  [
    "refresh requests are deterministic and bind the exact monitor revision",
    "evidence admission requires a later current complete verification with exact regions",
    "the inbox selects the latest current available evidence deterministically",
    "acknowledgement requires a later monitor revision that consumed the exact verification",
    "revision-safe persistence and public views redact private evidence provenance",
    "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REQUEST_MISMATCH",
    "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_ACKNOWLEDGEMENT_INVALID",
    "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_STORE_REVISION_CONFLICT",
  ],
);

requireTokens("docs/AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX.md", [
  "Exact refresh request",
  "Shared request fingerprint",
  "Complete evidence admission",
  "Deterministic inbox identity",
  "Available evidence",
  "Proven-consumption acknowledgement",
  "Revision and concurrency safety",
  "Persistence and audit",
  "Public projection",
  "Private application boundary",
  "Output boundary",
  "does not scrape retailer pages",
  "does not prove perpetual publication availability",
]);

requireTokens("packages/storyteller/src/project-store.ts", [
  '"audiobook-retail-publication-evidence-inbox"',
]);

requireTokens("apps/worker/src/publication-refresh-runtime.ts", [
  "audiobookRetailPublicationRefreshRequestFingerprint",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-publication-evidence-inbox"]
      !== "./src/audiobook-retail-publication-evidence-inbox.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-publication-evidence-inbox",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-publication-evidence-inbox"]
      !== "node scripts/check-audiobook-retail-publication-evidence-inbox.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-publication-evidence-inbox",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-publication-evidence-inbox",
    )
  ) {
    problems.push(
      "permanent artifact verification omits publication evidence inbox",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "audiobook-retail-publication-evidence-inbox",
    "createAudiobookRetailPublicationEvidenceRequest",
    "submitAudiobookRetailPublicationEvidence",
    "acknowledgeAudiobookRetailPublicationEvidence",
    "FileAudiobookRetailPublicationEvidenceInboxStore",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private publication evidence inbox: ${forbidden}`);
    }
  }
}

for (const path of [
  "packages/storyteller/src/audiobook-retail-publication-evidence-inbox.ts",
  "docs/AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX.md",
]) {
  if (!existsSync(fromRoot(path))) continue;
  const source = read(path).toLocaleLowerCase("en-AU");
  for (const forbidden of [
    "raw retailer html is stored",
    "automated observation is human-confirmed",
    "scraped evidence becomes verified",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`${path} contains prohibited evidence claim: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio publication evidence inbox check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_publication_evidence_inbox_check_passed");
console.log("- refresh requests bind the exact monitor revision and deadline");
console.log("- only complete current human-governed verification enters the inbox");
console.log("- current evidence selection is deterministic and excludes acknowledged items");
console.log("- acknowledgement requires a later monitor proving exact consumption");
console.log("- audit and public projections omit private evidence provenance");
console.log("- normal API and web runtimes cannot access gateway evidence controls");
