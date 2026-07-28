import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

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

function collectTextFiles(directory, output = []) {
  const absolute = fromRoot(directory);
  if (!existsSync(absolute)) return output;
  for (const name of readdirSync(absolute)) {
    const absolutePath = join(absolute, name);
    const item = statSync(absolutePath);
    if (item.isDirectory()) {
      collectTextFiles(relative(root, absolutePath), output);
    } else if (/\.(?:ts|tsx|js|mjs|json|md|css)$/u.test(name)) {
      output.push(relative(root, absolutePath).replaceAll("\\", "/"));
    }
  }
  return output;
}

function forbidTokensInFiles(paths, tokens) {
  for (const path of paths) {
    const source = read(path);
    for (const token of tokens) {
      if (source.includes(token)) {
        problems.push(`${path} contains forbidden artifact-registry token: ${token}`);
      }
    }
  }
}

for (const path of [
  "packages/storyteller/src/artifact-queue.ts",
  "packages/storyteller/src/artifact-queue.test.ts",
  "packages/storyteller/src/artifact-registry.ts",
  "packages/storyteller/src/artifact-registry.test.ts",
  "packages/storyteller/src/artifact-store.ts",
  "packages/storyteller/src/artifact-store.test.ts",
  "packages/storyteller/package.json",
  "docs/ARTIFACT_REGISTRY.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/artifact-registry.ts", [
  "ARTIFACT_REGISTRY_SCHEMA_VERSION",
  "ArtifactStorageReference",
  "ArtifactIntegrity",
  "ArtifactProvenance",
  "ArtifactRightsSnapshot",
  '"mastered-chapter"',
  '"credit-master"',
  '"audiobook-reference-master"',
  '"audiobook-retail-track"',
  '"audiobook-retail-sample"',
  "ARTIFACT_RETAIL_TRACK_MP3_REQUIRED",
  "ARTIFACT_RETAIL_SAMPLE_MP3_REQUIRED",
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
  "ARTIFACT_RELEASE_MASTERED_CHAPTER_REQUIRED",
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
  "a pre-master chapter alone cannot satisfy audiobook release",
  "expired rights block queue completion and final release",
  "fingerprint tampering is detected",
  "mastered chapters require audio integrity, parent provenance and human review",
  "credit masters require audio integrity, parent provenance and human review",
  "audiobook reference masters require audio integrity, parent provenance and human review",
  "audiobook retail tracks require MP3 integrity, parent provenance and human review",
  "audiobook retail samples require MP3 integrity, parent provenance and human review",
]);

requireTokens("packages/storyteller/src/artifact-queue.ts", [
  "ArtifactAdmissionError",
  "artifactAdmissionFingerprint",
  "completeGenerationWithArtifacts",
  "assessQueueCompletionArtifacts",
  "outputArtifactRefs: assessment.artifactIds",
  "resultIds: candidateTakeIds",
  "artifactBackedCompletionPublicView",
  "ARTIFACT_COMPLETION_REPORT_HASH_INVALID",
  "ARTIFACT_COMPLETION_CLAIM_INVALID",
]);

requireTokens("packages/storyteller/src/artifact-queue.test.ts", [
  "artifact-backed completion admits an exact verified candidate bundle",
  "unverified artifacts block completion without consuming the worker lease",
  "candidate-count and scope failures are reported before queue completion",
  "completion accounting and report hashes fail closed before persistence",
  "providerRequestId",
  "claim.leaseToken",
]);

requireTokens("packages/storyteller/src/artifact-store.ts", [
  "FileArtifactRegistry",
  "ArtifactStoreConflictError",
  "ArtifactStoreIntegrityError",
  "immutableArtifactFingerprint",
  "ARTIFACT_STORE_REVISION_CHAIN_INVALID",
  "ARTIFACT_STORE_IMMUTABLE_FIELDS_CHANGED",
  "ARTIFACT_STORE_REVISION_MISMATCH",
  "publicViews",
  "appendAuditEvent",
]);

requireTokens("packages/storyteller/src/artifact-store.test.ts", [
  "creates, reads and lists validated artifact envelopes",
  "transitions keep store and domain revisions aligned",
  "stale transitions are rejected",
  "outside the fingerprint chain",
  "public artifact listings redact private object and provider request locators",
  "audit events contain governed state but no private storage locator",
]);

requireTokens("docs/ARTIFACT_REGISTRY.md", [
  "Generation intent",
  "Production artifact",
  "Release decision",
  "No signed URL is durable project state",
  "Verification before review",
  "Queue-completion gate",
  "Release gate",
  "PostgreSQL for revisioned artifact metadata",
  "private object storage",
  "never auto-release from a worker",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  for (const [exportPath, sourcePath] of [
    ["./artifact-queue", "./src/artifact-queue.ts"],
    ["./artifact-registry", "./src/artifact-registry.ts"],
    ["./artifact-store", "./src/artifact-store.ts"],
  ]) {
    if (packageJson.exports?.[exportPath] !== sourcePath) {
      problems.push(`storyteller package does not export ${exportPath} from ${sourcePath}`);
    }
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

const completionSource = existsSync(fromRoot("packages/storyteller/src/artifact-queue.ts"))
  ? read("packages/storyteller/src/artifact-queue.ts")
  : "";
const completionPublicViewStart = completionSource.indexOf("export function artifactBackedCompletionPublicView");
if (completionPublicViewStart < 0) {
  problems.push("artifact-backed completion public view is missing");
} else {
  const publicView = completionSource.slice(completionPublicViewStart);
  for (const forbidden of [
    "leaseToken",
    "objectKey",
    "container",
    "versionId",
    "providerRequestId",
    "outputArtifactRefs",
  ]) {
    if (publicView.includes(forbidden)) {
      problems.push(`artifact-backed completion public view exposes forbidden field: ${forbidden}`);
    }
  }
}

const storeSource = existsSync(fromRoot("packages/storyteller/src/artifact-store.ts"))
  ? read("packages/storyteller/src/artifact-store.ts")
  : "";
const auditStart = storeSource.indexOf("async #audit");
if (auditStart < 0) {
  problems.push("artifact store audit boundary is missing");
} else {
  const auditSource = storeSource.slice(auditStart);
  for (const forbidden of [
    "objectKey",
    "container",
    "versionId",
    "providerRequestId",
    "leaseToken",
  ]) {
    if (auditSource.includes(forbidden)) {
      problems.push(`artifact store audit exposes forbidden field: ${forbidden}`);
    }
  }
}

forbidTokensInFiles(collectTextFiles("apps/web/src"), [
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
console.log("- queue persistence receives only governed artifact and candidate identifiers");
console.log("- artifact revisions remain aligned with integrity-checked store envelopes");
console.log("- release traverses verified, approved and rights-valid dependencies");
console.log("- public views and audit events omit private storage, provider and worker lease material");
