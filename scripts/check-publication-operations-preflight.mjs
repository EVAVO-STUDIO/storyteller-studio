import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing publication-operations-preflight file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing publication-operations-preflight token: ${token}`);
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
  "apps/worker/src/publication-operations-preflight.ts",
  "apps/worker/src/publication-operations-preflight.test.ts",
  "apps/worker/src/main.ts",
  "package.json",
  ".env.example",
  "docs/PUBLICATION_OPERATIONS_PREFLIGHT.md",
]) requireFile(path);

requireTokens("apps/worker/src/publication-operations-preflight.ts", [
  "runPublicationOperationsPreflight",
  "PublicationOperationsPreflightSummary",
  "timingSafeEqual",
  "resolvePublicationAlertRuntimeConfiguration",
  "resolvePublicationRefreshRuntimeConfiguration",
  "resolvePublicationEvidenceGatewayConfiguration",
  "PUBLICATION_OPERATIONS_PREFLIGHT_ALERT_DISABLED",
  "PUBLICATION_OPERATIONS_PREFLIGHT_REFRESH_DISABLED",
  "PUBLICATION_OPERATIONS_PREFLIGHT_GATEWAY_DISABLED",
  "PUBLICATION_OPERATIONS_PREFLIGHT_STATE_ROOT_MISMATCH",
  "PUBLICATION_OPERATIONS_PREFLIGHT_GATEWAY_TOKEN_MISMATCH",
  "PUBLICATION_OPERATIONS_PREFLIGHT_RECIPIENT_ROUTE_MISSING",
  "PUBLICATION_OPERATIONS_PREFLIGHT_ROLE_IDENTITY_COLLISION",
  "PUBLICATION_OPERATIONS_PREFLIGHT_ACQUISITION_DEADLINE_INVALID",
  "PUBLICATION_OPERATIONS_PREFLIGHT_GATEWAY_PROXY_ACK_REQUIRED",
  'endpoint.pathname !== "/v1/publication-evidence"',
  "sharedPublicationState: true",
  "executionApiExposed: false",
  "publicGatewayExposed: false",
]);

requireTokens("apps/worker/src/publication-operations-preflight.test.ts", [
  "publication operations preflight validates one complete direct-loopback deployment",
  "preflight summary omits secrets, routes, identities, endpoints and paths",
  "preflight fails closed when any publication role is disabled",
  "preflight rejects token, route and role identity mismatches",
  "preflight rejects direct endpoint and deadline drift",
  "explicit private proxy acknowledgement supports TLS termination before a loopback gateway",
  "production preflight reports complete single-host acknowledgements",
  "PUBLICATION_OPERATIONS_PREFLIGHT_GATEWAY_TOKEN_MISMATCH",
  "PUBLICATION_OPERATIONS_PREFLIGHT_RECIPIENT_ROUTE_MISSING",
]);

requireTokens("apps/worker/src/main.ts", [
  '"publication-operations-preflight"',
  "runPublicationOperationsPreflight",
  'role: "publication-operations-preflight"',
]);

requireTokens("docs/PUBLICATION_OPERATIONS_PREFLIGHT.md", [
  "Required enabled roles",
  "Shared private state",
  "Gateway token pairing",
  "Gateway endpoint alignment",
  "Private networking and TLS termination",
  "Incident recipient route",
  "Email delivery preflight",
  "Distinct operational identities",
  "Deadline compatibility",
  "Single-host acknowledgements",
  "Safe result",
  "Private application boundary",
  "Current boundary",
  "does not start those roles",
]);

requireTokens(".env.example", [
  "STORYTELLER_WORKER_ROLE=generation",
  "STORYTELLER_PUBLICATION_ALERT_MODE=disabled",
  "STORYTELLER_PUBLICATION_REFRESH_MODE=disabled",
  "STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_MODE=disabled",
  "STORYTELLER_PUBLICATION_OPERATIONS_GATEWAY_PROXY=false",
]);

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:publication-operations-preflight"]
      !== "node scripts/check-publication-operations-preflight.mjs"
  ) {
    problems.push("root package does not expose verify:publication-operations-preflight");
  }
  if (
    !packageJson.scripts?.["verify:runtime"]?.includes(
      "npm run verify:publication-operations-preflight",
    )
  ) {
    problems.push("worker runtime verification omits publication operations preflight");
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "publication-operations-preflight",
    "runPublicationOperationsPreflight",
    "PUBLICATION_OPERATIONS_PREFLIGHT_",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private publication operations preflight: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio publication-operations-preflight check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_publication_operations_preflight_check_passed");
console.log("- alert, refresh and evidence-gateway roles must all be enabled");
console.log("- publication state, gateway token, incident route and deadlines are cross-checked");
console.log("- direct loopback and explicitly acknowledged private proxy transports are supported");
console.log("- readiness output omits secrets, routes, identities, endpoints and paths");
console.log("- normal API and web runtimes cannot invoke publication operations preflight");
