import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retailer-status-evidence file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing retailer-status contract token: ${token}`);
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
  "packages/storyteller/src/audiobook-retailer-status-evidence.ts",
  "packages/storyteller/src/audiobook-retailer-status-evidence.test.ts",
  "packages/storyteller/src/narrator-retail-status-admission.ts",
  "packages/storyteller/src/narrator-retail-status-admission.test.ts",
  "packages/storyteller/test-support/narrator-retail-status-admission.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAILER_STATUS_EVIDENCE.md",
  "docs/NARRATOR_RETAILER_STATUS_ADMISSION.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-retailer-status-evidence.ts", [
  "AUDIOBOOK_RETAILER_STATUS_EVIDENCE_SCHEMA_VERSION",
  "AUDIOBOOK_RETAILER_STATUS_EVIDENCE_ENTITY_TYPE",
  "createAudiobookRetailerStatusEvidence",
  "assertAudiobookRetailerStatusEvidence",
  "assertAudiobookRetailerStatusEvidenceMatchesSources",
  "audiobookRetailerStatusEvidencePublicView",
  "FileAudiobookRetailerStatusEvidenceStore",
  "accepted-awaiting-publication",
  "publicationConfirmed: false",
  "liveConfirmed: false",
  "AUDIOBOOK_RETAILER_STATUS_INDEPENDENT_OBSERVER_REQUIRED",
  "AUDIOBOOK_RETAILER_STATUS_ISSUES_REQUIRED",
  "AUDIOBOOK_RETAILER_STATUS_SOURCE_MISMATCH",
]);

requireTokens("packages/storyteller/src/audiobook-retailer-status-evidence.test.ts", [
  "processing evidence is persisted without acceptance, publication or live claims",
  "changes-requested and rejected statuses require bounded issue codes",
  "accepted evidence remains explicitly awaiting publication",
  "retailer status must be observed by an independent current-account human",
  "recomputed status evidence cannot replace the submitted attempt",
]);

requireTokens("docs/AUDIOBOOK_RETAILER_STATUS_EVIDENCE.md", [
  "Admission boundary",
  "Normalized statuses",
  "Changes requested",
  "Acceptance awaiting publication",
  "Independent observation",
  "Persistence and audit",
  "Privacy boundary",
  "Output boundary",
  "does not mean published, released, live or on sale",
]);

requireTokens("packages/storyteller/src/narrator-retail-status-admission.ts", [
  "ADMITTED_NARRATOR_RETAILER_STATUS_EVIDENCE_SCHEMA",
  "createAdmittedNarratorRetailerStatusEvidence",
  "assertAdmittedNarratorRetailerStatusEvidence",
  "admittedNarratorRetailerStatusEvidencePublicView",
  "assertAdmittedNarratorRetailSubmissionAttempt",
  "createAudiobookRetailerStatusEvidence",
  "assertAudiobookRetailerStatusEvidenceMatchesSources",
  "assertExactNarratorVoicePin",
  "ADMITTED_NARRATOR_RETAILER_STATUS_LINEAGE_MISMATCH",
  "ADMITTED_NARRATOR_RETAILER_STATUS_AUTHORITY_INVALID",
  "narratorAdmissionComplete: true",
  "syntheticNarrationDeclared: true",
  "platformAuthorisationBound: true",
  "submissionComplete: true",
  "retailerReviewEligible: true",
  "retailerStatusEvidenceComplete: true",
  "publicationConfirmed: false",
  "liveConfirmed: false",
  "automaticResubmissionAuthority: false",
  "retailerAcceptanceAuthority: false",
  "publicationAuthority: false",
]);

requireTokens("packages/storyteller/src/narrator-retail-status-admission.test.ts", [
  "adapted narrator admission survives exact retailer processing evidence",
  "zero-shot narrator uses the same retailer-status boundary without invented training provenance",
  "retailer acceptance remains evidence awaiting separate publication verification",
  "retailer changes requested preserve narrator lineage without automatic resubmission authority",
  "rehashing cannot attach retailer status from another submitted narrator chain",
  "rehashing cannot escalate retailer, resubmission or publication authority",
  "public retailer-status view proves bounded state without private narrator, account, submission or retailer references",
]);

requireTokens("packages/storyteller/test-support/narrator-retail-status-admission.ts", [
  "createTestAdmittedNarratorRetailerStatusFixture",
  "createTestAdmittedNarratorRetailSubmissionAttemptFixture",
  "createAdmittedNarratorRetailerStatusEvidence",
  'normalisedStatus === "changes-requested"',
  'normalisedStatus === "rejected"',
  "humanObservationConfirmed: true",
]);

requireTokens("docs/NARRATOR_RETAILER_STATUS_ADMISSION.md", [
  "Exact submission lineage",
  "Independent human retailer-status observation",
  "Normalised retailer states",
  "Derived acceptance, not caller authority",
  "Zero-shot and adapted parity",
  "Substitution resistance",
  "Authority boundary",
  "Public privacy boundary",
  "createAdmittedNarratorRetailerStatusEvidence",
  "accepted-awaiting-publication",
  "automaticResubmissionAuthority = false",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retailer-status-evidence"]
      !== "./src/audiobook-retailer-status-evidence.ts"
  ) {
    problems.push("storyteller package does not export retailer status evidence");
  }
  if (
    packageJson.exports?.["./narrator-retail-status-admission"]
      !== "./src/narrator-retail-status-admission.ts"
  ) {
    problems.push("storyteller package does not export narrator retailer-status admission");
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retailer-status-evidence"]
      !== "node scripts/check-audiobook-retailer-status-evidence.mjs"
  ) {
    problems.push("root package does not expose retailer-status verification");
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retailer-status-evidence",
    )
  ) {
    problems.push("permanent artifact verification omits retailer status evidence");
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retailer-status-evidence",
    "@evavo/storyteller-engine/narrator-retail-status-admission",
    "createAudiobookRetailerStatusEvidence",
    "createAdmittedNarratorRetailerStatusEvidence",
    "externalStatusReferenceHash",
    "externalStatusTextHash",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private retailer-status controls: ${forbidden}`);
    }
  }
}

if (existsSync(fromRoot("packages/storyteller/src/narrator-retail-status-admission.ts"))) {
  const source = read("packages/storyteller/src/narrator-retail-status-admission.ts");
  for (const forbidden of [
    "automaticResubmissionAuthority: true",
    "retailerAcceptanceAuthority: true",
    "publicationAuthority: true",
    "publicationConfirmed: true",
    "liveConfirmed: true",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`narrator retailer-status admission grants forbidden authority: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio retailer-status check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retailer_status_evidence_check_passed");
console.log("- submitted attempts are rebound to external retailer observations");
console.log("- processing, changes, acceptance and rejection remain distinct");
console.log("- narrator retailer status reopens the exact admission-bound submitted chain");
console.log("- retailer acceptance never implies publication or live availability");
console.log("- changes requested never grant automatic resubmission authority");
console.log("- external references and raw status text remain hashed and private");
console.log("- normal API and web runtimes cannot create retailer-status evidence");
