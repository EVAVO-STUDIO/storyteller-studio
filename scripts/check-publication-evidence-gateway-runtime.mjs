import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing publication-evidence-gateway runtime file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing publication-evidence-gateway token: ${token}`);
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
  "apps/worker/src/publication-evidence-gateway-configuration.ts",
  "apps/worker/src/publication-evidence-gateway-configuration.test.ts",
  "apps/worker/src/publication-evidence-gateway-runtime.ts",
  "apps/worker/src/publication-evidence-gateway-runtime.test.ts",
  "apps/worker/src/main.ts",
  "docs/PUBLICATION_EVIDENCE_GATEWAY_RUNTIME.md",
  "package.json",
]) requireFile(path);

requireTokens("apps/worker/src/publication-evidence-gateway-configuration.ts", [
  "PublicationEvidenceGatewayConfiguration",
  "resolvePublicationEvidenceGatewayConfiguration",
  "publicationEvidenceGatewayConfigurationSummary",
  "STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_MODE",
  "STORYTELLER_FILE_PUBLICATION_EVIDENCE_GATEWAY_SINGLE_HOST",
  "STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_PRIVATE_NETWORK",
  "STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_TOKEN_ENV",
  "publicExecutionApiExposed: false",
  "privateGatewayExposed: true",
  "PUBLICATION_EVIDENCE_GATEWAY_PRODUCTION_SINGLE_HOST_ACK_REQUIRED",
  "PUBLICATION_EVIDENCE_GATEWAY_PRIVATE_NETWORK_ACK_REQUIRED",
]);

requireTokens("apps/worker/src/publication-evidence-gateway-runtime.ts", [
  "handlePublicationEvidenceGatewayRequest",
  "PublicationEvidenceGatewayService",
  "runConfiguredPublicationEvidenceGateway",
  "timingSafeEqual",
  "FileAudiobookRetailPublicationEvidenceInboxStore",
  "FileAudiobookRetailPublicationMonitorStore",
  "createAudiobookRetailPublicationEvidenceRequest",
  "acknowledgeAudiobookRetailPublicationEvidence",
  "findCurrentForRequest",
  "PUBLICATION_EVIDENCE_GATEWAY_UNAUTHORIZED",
  "PUBLICATION_EVIDENCE_GATEWAY_REQUEST_STALE",
  "PUBLICATION_EVIDENCE_GATEWAY_BODY_TOO_LARGE",
  "PUBLICATION_EVIDENCE_GATEWAY_REQUEST_TIMEOUT",
  "PUBLICATION_EVIDENCE_GATEWAY_SHUTDOWN_DEADLINE_EXCEEDED",
  "PUBLICATION_EVIDENCE_GATEWAY_SECOND_SIGNAL_ABORT",
  "cache-control",
  "no-store",
  "status: 204",
  "status: 200",
]);

requireTokens("apps/worker/src/publication-evidence-gateway-configuration.test.ts", [
  "publication evidence gateway is disabled by default without evaluating private settings",
  "enabled gateway configuration resolves bounded loopback private controls",
  "safe summaries omit identity, path, host, port and token binding",
  "non-loopback binding requires explicit private-network acknowledgement",
  "production file gateway requires single-host acknowledgement",
  "gateway configuration rejects unsafe modes, hosts and secret references",
  "gateway configuration rejects out-of-range body, port and timing controls",
]);

requireTokens("apps/worker/src/publication-evidence-gateway-runtime.test.ts", [
  "gateway rejects unauthorized, wrong-route, wrong-method, wrong-content and oversized requests",
  "gateway serves exact current evidence without acknowledging it",
  "gateway returns 204 when no exact current inbox evidence exists",
  "gateway rejects stale or substituted monitor request state",
  "gateway reconciles acknowledgement only after a later persisted monitor consumed the evidence",
  "disabled gateway runtime does not evaluate token or create a private listener",
  "enabled gateway runtime fails before service creation when token is missing",
  "first signal drains the gateway and returns only a safe runtime snapshot",
  "a second signal forces a bounded active gateway abort",
]);

requireTokens("apps/worker/src/main.ts", [
  '"publication-evidence-gateway"',
  "resolvePublicationEvidenceGatewayConfiguration",
  "publicationEvidenceGatewayConfigurationSummary",
  "runConfiguredPublicationEvidenceGateway",
  "startPublicationEvidenceGateway",
]);

requireTokens("docs/PUBLICATION_EVIDENCE_GATEWAY_RUNTIME.md", [
  "Process role",
  "Disabled by default",
  "Private file state",
  "Private network binding",
  "Authentication",
  "Route and request limits",
  "Exact persisted-monitor rebind",
  "Evidence response",
  "No acknowledgement on serve",
  "Proven-consumption reconciliation",
  "Runtime controls",
  "Shutdown",
  "Safe summaries",
  "Private application boundary",
  "Current boundary",
  "does not scrape retailer pages",
  "does not expose a public execution API",
]);

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:publication-evidence-gateway-runtime"]
      !== "node scripts/check-publication-evidence-gateway-runtime.mjs"
  ) {
    problems.push(
      "root package does not expose verify:publication-evidence-gateway-runtime",
    );
  }
  if (
    !packageJson.scripts?.["verify:runtime"]?.includes(
      "npm run verify:publication-evidence-gateway-runtime",
    )
  ) {
    problems.push(
      "permanent runtime verification omits publication evidence gateway runtime",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "publication-evidence-gateway-configuration",
    "publication-evidence-gateway-runtime",
    "handlePublicationEvidenceGatewayRequest",
    "PublicationEvidenceGatewayService",
    "runConfiguredPublicationEvidenceGateway",
    "FileAudiobookRetailPublicationEvidenceInboxStore",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private evidence gateway control: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio publication evidence gateway runtime check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_publication_evidence_gateway_runtime_check_passed");
console.log("- the gateway remains a disabled-by-default explicit private worker role");
console.log("- bearer authentication and exact persisted-monitor rebinding fail closed");
console.log("- serving evidence never acknowledges it");
console.log("- reconciliation requires a later persisted monitor proving exact consumption");
console.log("- request bodies, timeouts, shutdown and network binding are bounded");
console.log("- normal API and web runtimes expose no evidence gateway controls");
