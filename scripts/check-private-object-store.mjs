import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing private-object-store file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing private-object-store contract token: ${token}`);
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
        problems.push(`${path} contains forbidden private-object-store token: ${token}`);
      }
    }
  }
}

for (const path of [
  "packages/storyteller/src/private-object-store.ts",
  "packages/storyteller/src/private-object-store.test.ts",
  "packages/storyteller/src/artifact-ingest.ts",
  "packages/storyteller/src/artifact-ingest.test.ts",
  "packages/storyteller/package.json",
  "docs/PRIVATE_OBJECT_STORAGE.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/private-object-store.ts", [
  "PRIVATE_OBJECT_STAGE_SCHEMA_VERSION",
  "PRIVATE_OBJECT_SCHEMA_VERSION",
  "detectArtifactMedia",
  "FilePrivateObjectStore",
  "PRIVATE_OBJECT_MEDIA_SIGNATURE_UNSUPPORTED",
  "PRIVATE_OBJECT_CLAIMED_MIME_MISMATCH",
  "PRIVATE_OBJECT_CLAIMED_FORMAT_MISMATCH",
  "PRIVATE_OBJECT_STAGE_FINGERPRINT_MISMATCH",
  "PRIVATE_OBJECT_STAGE_TAMPERED",
  "PRIVATE_OBJECT_CONTENT_ADDRESS_COLLISION",
  "PRIVATE_OBJECT_FINAL_VERIFICATION_FAILED",
  "COPYFILE_EXCL",
  "randomBytes(24)",
  "sha256/",
  "mode: 0o700",
  'open(path, "wx", 0o600)',
]);

requireTokens("packages/storyteller/src/private-object-store.test.ts", [
  "media detection recognises supported audio, image, archive and text signatures",
  "staging enforces size ceilings and claimed media identity",
  "verified content-addressed private object",
  "identical content is deduplicated",
  "promotion detects staged-byte tampering",
  "staged metadata tampering is rejected",
  "rejects URLs, traversal, absolute paths and backslashes",
  "discard removes unpromoted staged bytes",
]);

requireTokens("packages/storyteller/src/artifact-ingest.ts", [
  "ArtifactIngestConflictError",
  "ingestPrivateArtifact",
  "artifactIngestPublicView",
  "artifact.ingest_registered",
  "artifact.ingest_verified",
  "artifact.ingest_quarantined",
  "ARTIFACT_INGEST_IDEMPOTENCY_CONFLICT",
  "ARTIFACT_OBJECT_REINSPECTION_FAILED",
  "media-signature",
  "verifyArtifactIntegrity",
  "quarantineArtifact",
]);

requireTokens("packages/storyteller/src/artifact-ingest.test.ts", [
  "private bytes become a verified revisioned artifact without exposing storage locators",
  "identical retries are idempotent across object promotion and artifact registration",
  "reusing an artifact identifier for different immutable bytes fails closed",
  "post-promotion integrity mismatches are persisted as quarantine revisions",
  "unsupported bytes fail before an artifact record is created",
  "providerRequestId",
]);

requireTokens("docs/PRIVATE_OBJECT_STORAGE.md", [
  "Content-addressed storage",
  "Staging before promotion",
  "Media signature validation",
  "Pending record before verification",
  "Quarantine instead of approval",
  "No public write API",
  "Orphan reconciliation",
  "PostgreSQL and private object storage",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  for (const [exportPath, sourcePath] of [
    ["./artifact-ingest", "./src/artifact-ingest.ts"],
    ["./private-object-store", "./src/private-object-store.ts"],
  ]) {
    if (packageJson.exports?.[exportPath] !== sourcePath) {
      problems.push(`storyteller package does not export ${exportPath} from ${sourcePath}`);
    }
  }
}

const ingestSource = existsSync(fromRoot("packages/storyteller/src/artifact-ingest.ts"))
  ? read("packages/storyteller/src/artifact-ingest.ts")
  : "";
const publicViewStart = ingestSource.indexOf("export function artifactIngestPublicView");
if (publicViewStart < 0) {
  problems.push("artifact ingest public view implementation is missing");
} else {
  const publicView = ingestSource.slice(publicViewStart);
  for (const forbidden of [
    "objectKey",
    "container",
    "versionId",
    "providerRequestId",
    "leaseToken",
    "rootDirectory",
  ]) {
    if (publicView.includes(forbidden)) {
      problems.push(`artifact ingest public view exposes forbidden field: ${forbidden}`);
    }
  }
}

forbidTokensInFiles(
  [...collectTextFiles("apps/api/src"), ...collectTextFiles("apps/web/src")],
  [
    "FilePrivateObjectStore",
    "ingestPrivateArtifact",
    "artifact.ingest_registered",
    "artifact.ingest_verified",
    "artifact.ingest_quarantined",
  ],
);

if (problems.length > 0) {
  console.error("Storyteller Studio private object storage check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_private_object_storage_check_passed");
console.log("- staged bytes are signature checked and promoted by SHA-256 content address");
console.log("- immutable object promotion is verified and idempotently deduplicated");
console.log("- pending artifact records become verified or quarantined revisions");
console.log("- artifact identifiers cannot silently change immutable stored bytes");
console.log("- public views omit private object, provider request and filesystem locators");
console.log("- normal API and browser surfaces contain no object-store write capability");
