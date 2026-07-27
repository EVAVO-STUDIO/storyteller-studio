import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing artifact API file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) problems.push(`${path} is missing artifact API contract token: ${token}`);
  }
}

function forbidTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (source.includes(token)) problems.push(`${path} contains forbidden artifact API token: ${token}`);
  }
}

for (const path of [
  ".env.example",
  "apps/api/src/artifact-runtime.ts",
  "apps/api/src/artifact-runtime.test.ts",
  "apps/api/src/artifact-routes.ts",
  "apps/api/src/artifact-routes.test.ts",
  "apps/api/src/server.ts",
]) requireFile(path);

requireTokens(".env.example", [
  "STORYTELLER_ARTIFACT_DRIVER=disabled",
  "STORYTELLER_FILE_ARTIFACT_STORE_SINGLE_HOST=false",
]);

requireTokens("apps/api/src/artifact-runtime.ts", [
  "resolveArtifactRegistryRuntimeConfiguration",
  "ARTIFACT_REGISTRY_DRIVER_INVALID",
  "ARTIFACT_REGISTRY_DATA_DIR_REQUIRED",
  "ARTIFACT_REGISTRY_FILE_DRIVER_SINGLE_HOST_ACK_REQUIRED",
  "artifactRegistryRuntimeSummary",
  "createArtifactRegistryRuntime",
  "workerWriteApiExposed: false",
  "releaseApiExposed: false",
  'resolve(workingDirectory, dataDirectory, "artifact-registry")',
]);

requireTokens("apps/api/src/artifact-runtime.test.ts", [
  "artifact runtime is disabled unless a driver is explicitly configured",
  "production file artifacts require an explicit single-host acknowledgement",
  "artifact runtime rejects unknown drivers and missing data directories",
  "stores private records while returning only redacted views",
  "private-object-version-001",
  "private-provider-request-001",
]);

requireTokens("apps/api/src/artifact-routes.ts", [
  "handleArtifactReadRoute",
  'input.method !== "GET"',
  "ARTIFACT_WRITE_API_NOT_EXPOSED",
  "ARTIFACT_REGISTRY_NOT_CONFIGURED",
  'input.url.pathname === "/v1/artifacts"',
  "ARTIFACT_PROJECT_FILTER_INVALID",
  "ARTIFACT_KIND_FILTER_INVALID",
  "ARTIFACT_VERIFICATION_FILTER_INVALID",
  "ARTIFACT_REVIEW_FILTER_INVALID",
  "ARTIFACT_LIMIT_INVALID",
  "artifactPublicView",
  "workerWriteApiExposed: false",
  "releaseApiExposed: false",
]);

requireTokens("apps/api/src/artifact-routes.test.ts", [
  "applies bounded filters, limits and redacts private locators",
  "returns a redacted record and a stable not-found response",
  "expose no write or release operation",
  "reject invalid identifiers, enums and limits",
  "ignores unrelated API paths",
  "ARTIFACT_WRITE_API_NOT_EXPOSED",
  "providerRequestId",
]);

requireTokens("apps/api/src/server.ts", [
  'import type { FileArtifactRegistry } from "@evavo/storyteller-engine/artifact-store"',
  "resolveArtifactRegistryRuntimeConfiguration",
  "createArtifactRegistryRuntime",
  "artifactRegistryRuntimeSummary",
  "handleArtifactReadRoute",
  "ARTIFACT_REGISTRY_NOT_CONFIGURED",
  "ARTIFACT_REGISTRY_FILE_DRIVER_SINGLE_HOST_ACK_REQUIRED",
  "const artifactRegistry = artifactHealth()",
  "artifactRegistry,",
  'url.pathname.startsWith("/v1/artifacts")',
  'registry: request.method === "GET" ? requireArtifactRuntime() : null',
  "artifactWriteApiExposed: false",
  "releaseApiExposed: false",
]);

forbidTokens("apps/api/src/artifact-routes.ts", [
  "createArtifactRecord(",
  "verifyArtifactIntegrity(",
  "recordArtifactReview(",
  "confirmArtifactRelease(",
  "signedUrl",
  "downloadUrl",
]);

const routeSource = existsSync(fromRoot("apps/api/src/artifact-routes.ts"))
  ? read("apps/api/src/artifact-routes.ts")
  : "";
const responseSections = [
  routeSource.slice(routeSource.indexOf("body: {", routeSource.indexOf('input.method !== "GET"'))),
  routeSource.slice(routeSource.indexOf("body: {", routeSource.indexOf('input.url.pathname === "/v1/artifacts"'))),
  routeSource.slice(routeSource.indexOf("body: {", routeSource.indexOf("artifactPublicView"))),
];
for (const responseSource of responseSections) {
  for (const forbidden of [
    "objectKey",
    "container",
    "versionId",
    "providerRequestId",
    "leaseToken",
    "credential",
  ]) {
    if (responseSource.includes(forbidden)) problems.push(`artifact API response exposes forbidden field: ${forbidden}`);
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio artifact API check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_artifact_api_check_passed");
console.log("- artifact persistence is disabled until selected explicitly");
console.log("- production file persistence requires a one-host acknowledgement");
console.log("- authenticated artifact HTTP routes are read-only");
console.log("- write, verification, review and release APIs remain unavailable");
console.log("- public artifact responses omit private storage and provider request locators");
console.log("- API health reports disabled, ready or misconfigured artifact persistence honestly");
