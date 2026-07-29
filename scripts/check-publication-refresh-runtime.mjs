import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing publication-refresh runtime file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing publication-refresh runtime token: ${token}`);
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
  "apps/worker/src/publication-refresh-configuration.ts",
  "apps/worker/src/publication-refresh-configuration.test.ts",
  "apps/worker/src/publication-refresh-runtime.ts",
  "apps/worker/src/publication-refresh-runtime.test.ts",
  "apps/worker/src/main.ts",
  "docs/PUBLICATION_REFRESH_WORKER_RUNTIME.md",
  "package.json",
]) requireFile(path);

requireTokens("apps/worker/src/publication-refresh-configuration.ts", [
  "PublicationRefreshRuntimeConfiguration",
  "resolvePublicationRefreshRuntimeConfiguration",
  "publicationRefreshRuntimeConfigurationSummary",
  "STORYTELLER_PUBLICATION_REFRESH_MODE",
  "STORYTELLER_FILE_PUBLICATION_REFRESH_SINGLE_HOST",
  "STORYTELLER_PUBLICATION_REFRESH_RECIPIENT_REFERENCE_HASH",
  "STORYTELLER_PUBLICATION_REFRESH_VERIFICATION_ENDPOINT",
  "STORYTELLER_PUBLICATION_REFRESH_VERIFICATION_TOKEN_ENV",
  "executionApiExposed: false",
  "PUBLICATION_REFRESH_RUNTIME_PRODUCTION_SINGLE_HOST_ACK_REQUIRED",
  "PUBLICATION_REFRESH_RUNTIME_VERIFICATION_ENDPOINT_HTTPS_REQUIRED",
]);

requireTokens("apps/worker/src/publication-refresh-runtime.ts", [
  "HttpPublicationVerificationProvider",
  "PublicationRefreshRuntimeService",
  "runConfiguredPublicationRefreshRuntime",
  "AudiobookRetailPublicationRefreshWorker",
  "assertAudiobookRetailPublicationVerification",
  "PUBLICATION_REFRESH_RUNTIME_EVIDENCE_INVALID",
  "PUBLICATION_REFRESH_RUNTIME_EVIDENCE_NOT_CURRENT",
  "PUBLICATION_REFRESH_RUNTIME_PROVIDER_RATE_LIMITED",
  "PUBLICATION_REFRESH_RUNTIME_PROVIDER_UNAVAILABLE",
  "PUBLICATION_REFRESH_RUNTIME_PROVIDER_REJECTED",
  "PUBLICATION_REFRESH_RUNTIME_SHUTDOWN_DEADLINE_EXCEEDED",
  "PUBLICATION_REFRESH_RUNTIME_SECOND_SIGNAL_ABORT",
  "idempotency-key",
  "response.status === 204",
]);

requireTokens("apps/worker/src/publication-refresh-configuration.test.ts", [
  "publication refresh runtime is disabled by default without evaluating secrets",
  "enabled publication refresh configuration resolves bounded private controls",
  "safe summaries omit worker, path, endpoint, token binding and recipient hash",
  "production file refresh runtime requires explicit single-host acknowledgement",
  "configuration rejects unsafe modes, endpoints, hashes and secret references",
  "configuration rejects out-of-range operational controls",
]);

requireTokens("apps/worker/src/publication-refresh-runtime.test.ts", [
  "HTTP verification provider sends a deterministic private request and accepts governed evidence",
  "HTTP verification provider treats 204 as no evidence and maps safe failures",
  "HTTP verification provider rejects malformed and expired evidence",
  "disabled refresh runtime does not evaluate secrets or network dependencies",
  "once mode resolves secrets privately and returns only a safe service snapshot",
  "enabled refresh runtime fails before service creation when the gateway token is missing",
  "real once-mode wiring drains an empty publication store without network access",
  "continuous mode drains on the first signal and unsubscribes cleanly",
  "a second signal forces a bounded active refresh abort",
]);

requireTokens("apps/worker/src/main.ts", [
  '"publication-refresh"',
  "resolvePublicationRefreshRuntimeConfiguration",
  "publicationRefreshRuntimeConfigurationSummary",
  "runConfiguredPublicationRefreshRuntime",
  "startPublicationRefreshWorker",
]);

requireTokens("docs/PUBLICATION_REFRESH_WORKER_RUNTIME.md", [
  "Process role",
  "Disabled by default",
  "Private file state",
  "Governed verification gateway",
  "Gateway request",
  "Complete evidence boundary",
  "No-evidence behavior",
  "Recipient route",
  "Runtime controls",
  "Failure mapping",
  "Shutdown",
  "Safe summaries",
  "Private application boundary",
  "Current boundary",
  "does not scrape retailer pages",
  "does not browse retailer pages",
]);

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:publication-refresh-runtime"]
      !== "node scripts/check-publication-refresh-runtime.mjs"
  ) {
    problems.push("root package does not expose verify:publication-refresh-runtime");
  }
  if (
    !packageJson.scripts?.["verify:runtime"]?.includes(
      "npm run verify:publication-refresh-runtime",
    )
  ) {
    problems.push("permanent runtime verification omits publication refresh runtime");
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "publication-refresh-configuration",
    "publication-refresh-runtime",
    "HttpPublicationVerificationProvider",
    "runConfiguredPublicationRefreshRuntime",
    "AudiobookRetailPublicationRefreshWorker",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private publication-refresh runtime control: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio publication-refresh runtime check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_publication_refresh_runtime_check_passed");
console.log("- publication refresh execution remains a private explicit worker role");
console.log("- disabled mode does not evaluate gateway secrets or storage paths");
console.log("- HTTPS evidence acquisition accepts only complete governed verification");
console.log("- 204 responses produce governed no-evidence handling without fabricated facts");
console.log("- configuration and runtime summaries omit private routing and evidence details");
console.log("- normal API and web runtimes expose no publication-refresh execution controls");
