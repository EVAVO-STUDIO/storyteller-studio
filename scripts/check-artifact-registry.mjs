import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing artifact-registry file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing artifact-registry contract token: ${token}`);
    }
  }
}

function forbidTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (source.includes(token)) {
      problems.push(`${path} contains forbidden artifact-registry token: ${token}`);
    }
  }
}

for (const path of [
  "packages/storyteller/src/artifact-registry.ts",
  "packages/storyteller/src/artifact-registry.test.ts",
  "packages/storyteller/package.json",
  "docs/ARTIFACT_REGISTRY.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/artifact-registry.ts", [
  "ARTIFACT_REGISTRY_SCHEMA_VERSION",
  "ArtifactStorageReference",
  "ArtifactIntegrity",
  "ArtifactProvenance",
  "ArtifactRightsSnapshot",
  "ARTIFACT_STORAGE_OBJECT_KEY_UNSAFE",
  "ARTIFACT_CONTENT_HASH_MISMATCH",
  "ARTIFACT_BYTE_COUNT_MISMATCH",
  "verifyArtifactIntegrity",
  "quarantineArtifact",
  "rejectArtifact",
  "recordArtifactReview",
  "assessQueueCompletionArtifacts",
  "ARTIFACT_CANDIDATE_COUNT_MISMATCH",
  "assessArtifactRelease",
  "ARTIFACT_RELEASE_REVIEW_PENDING",
  "confirmArtifactRelease",
  "artifactPublicView",
  "finalConfirmationId",
  "previousFingerprint",
]);

requireTokens("packages/storyteller/src/artifact-registry.test.ts", [
  "public views redact private storage and provider references",
  "artifact storage references reject URLs, traversal, queries and absolute paths",
  "integrity verification and human review create linked non-destructive revisions",
  "hash or byte mismatches quarantine an artifact and prevent approval",
  "generation completion requires the exact verified candidate bundle and matching scope",
  "release remains blocked until every dependency is verified, reviewed and rights-valid",
  "expired rights block queue completion and final release",
  "fingerprint tampering is detected",
]);

requireTokens("docs/ARTIFACT_REGISTRY.md", [
  "Generation intent",
  "Production artifact",
  "Release decision",
  "No signed URL is durable project state",
  "Verification before review",
  "Queue-completion gate",
  "Release gate",
  "private object storage",
  "never auto-release from a worker",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./artifact-registry"] !== "./src/artifact-registry.ts") {
    problems.push("storyteller package does not export ./artifact-registry from the governed source module");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/artifact-registry.ts"))
  ? read("packages/storyteller/src/artifact-registry.ts")
  : "";

const publicViewStart = source.indexOf("export function artifactPublicView");
if (publicViewStart < 0) {
  problems.push("artifact public view implementation is missing");
} else {
  const publicView = source.slice(publicViewStart);
  for (const forbidden of [
    "objectKey:",
    "container:",
    "versionId:",
    "providerRequestId:",
    "signedUrl:",
    "downloadUrl:",
    "credential:",
  ]) {
    if (publicView.includes(forbidden)) {
      problems.push(`artifact public view exposes forbidden private field: ${forbidden}`);
    }
  }
}

forbidTokens("apps/web/src", [
  "ARTIFACT_STORAGE_OBJECT_KEY",
  "providerRequestId",
  "versionId",
]);

if (problems.length > 0) {
  console.error("Storyteller Studio artifact registry check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_artifact_registry_check_passed");
console.log("- generated media remains separate from generation intent and release state");
console.log("- immutable hash, byte-count, provenance and rights evidence are required");
console.log("- verification precedes review and failed bytes are quarantined");
console.log("- queue completion requires an exact verified candidate bundle");
console.log("- release traverses verified, approved and rights-valid dependencies");
console.log("- public views omit private storage locators and provider request identifiers");
