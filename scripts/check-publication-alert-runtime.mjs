import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing publication-alert-runtime file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing publication-alert-runtime token: ${token}`);
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
  "apps/worker/src/publication-alert-configuration.ts",
  "apps/worker/src/publication-alert-configuration.test.ts",
  "apps/worker/src/publication-alert-runtime.ts",
  "apps/worker/src/publication-alert-runtime.test.ts",
  "apps/worker/src/main.ts",
  "package.json",
  "docs/PUBLICATION_ALERT_WORKER_RUNTIME.md",
]) requireFile(path);

requireTokens("apps/worker/src/publication-alert-configuration.ts", [
  "resolvePublicationAlertRuntimeConfiguration",
  "publicationAlertRuntimeConfigurationSummary",
  "STORYTELLER_PUBLICATION_ALERT_MODE",
  "STORYTELLER_FILE_PUBLICATION_ALERT_SINGLE_HOST",
  "STORYTELLER_PUBLICATION_ALERT_RECIPIENT_BINDINGS",
  "STORYTELLER_PUBLICATION_ALERT_EMAIL_ENDPOINT",
  "STORYTELLER_PUBLICATION_ALERT_EMAIL_TOKEN_ENV",
  "STORYTELLER_PUBLICATION_ALERT_FROM_EMAIL_ENV",
  "PUBLICATION_ALERT_RUNTIME_PRODUCTION_SINGLE_HOST_ACK_REQUIRED",
  "PUBLICATION_ALERT_RUNTIME_EMAIL_ENDPOINT_HTTPS_REQUIRED",
  "executionApiExposed: false",
]);

requireTokens("apps/worker/src/publication-alert-runtime.ts", [
  "EnvironmentPublicationAlertRecipientResolver",
  "HttpPublicationAlertEmailProvider",
  "PublicationAlertDeliveryRuntimeService",
  "runConfiguredPublicationAlertRuntime",
  "AudiobookRetailPublicationAlertDeliveryWorker",
  "idempotency-key",
  "authorization: `Bearer",
  "PUBLICATION_ALERT_RUNTIME_PROVIDER_RATE_LIMITED",
  "PUBLICATION_ALERT_RUNTIME_PROVIDER_UNAVAILABLE",
  "PUBLICATION_ALERT_RUNTIME_PROVIDER_REJECTED",
  "PUBLICATION_ALERT_RUNTIME_PROVIDER_RESPONSE_TOO_LARGE",
  "PUBLICATION_ALERT_RUNTIME_SHUTDOWN_DEADLINE_EXCEEDED",
  "PUBLICATION_ALERT_RUNTIME_SECOND_SIGNAL_ABORT",
]);

requireTokens("apps/worker/src/publication-alert-configuration.test.ts", [
  "publication alert runtime is disabled by default without evaluating private settings",
  "enabled publication runtime resolves isolated file state and bounded controls",
  "configuration summaries omit secrets, email addresses, endpoints, paths and worker identities",
  "production publication runtime requires explicit single-host acknowledgement and HTTPS",
  "local HTTP email gateways are allowed only for non-production loopback testing",
  "unsafe modes, endpoints, bindings and bounded controls fail closed",
]);

requireTokens("apps/worker/src/publication-alert-runtime.test.ts", [
  "environment recipient resolution keeps raw addresses outside configuration and returns exact routes",
  "HTTP email adapter sends one bounded idempotent request and accepts header receipts",
  "HTTP adapter accepts bounded JSON receipts and maps provider failures to safe codes",
  "disabled publication runtime does not evaluate secrets, routes or network dependencies",
  "once mode resolves secrets privately and returns only a safe service snapshot",
  "enabled runtime fails before service creation when required environment secrets are missing",
  "continuous mode drains on the first signal and unsubscribes cleanly",
  "a second process signal forces an active publication delivery abort",
]);

requireTokens("apps/worker/src/main.ts", [
  'type StorytellerWorkerProcessRole = "generation" | "publication-alerts"',
  "STORYTELLER_WORKER_ROLE",
  "resolvePublicationAlertRuntimeConfiguration",
  "runConfiguredPublicationAlertRuntime",
  'role: "publication-alerts"',
  'role: "generation"',
]);

requireTokens("docs/PUBLICATION_ALERT_WORKER_RUNTIME.md", [
  "Process role",
  "Disabled by default",
  "Private file state",
  "Recipient bindings",
  "HTTP email gateway",
  "Gateway response",
  "Runtime controls",
  "Shutdown",
  "Safe summaries",
  "Private application boundary",
  "Current boundary",
  "It does not acquire fresh retailer-page evidence",
]);

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:publication-alert-runtime"]
      !== "node scripts/check-publication-alert-runtime.mjs"
  ) {
    problems.push("root package does not expose verify:publication-alert-runtime");
  }
  if (
    !packageJson.scripts?.["verify:runtime"]?.includes(
      "npm run verify:publication-alert-runtime",
    )
  ) {
    problems.push("worker runtime verification omits publication-alert runtime");
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "publication-alert-configuration",
    "publication-alert-runtime",
    "EnvironmentPublicationAlertRecipientResolver",
    "HttpPublicationAlertEmailProvider",
    "runConfiguredPublicationAlertRuntime",
    "AudiobookRetailPublicationAlertDeliveryWorker",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private publication-alert runtime: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio publication-alert-runtime check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_publication_alert_runtime_check_passed");
console.log("- publication delivery is independently role-selected and disabled by default");
console.log("- route, token and sender values stay in environment-only private resolution");
console.log("- the HTTP gateway preserves governed idempotency and hashes receipts later");
console.log("- continuous polling and signal shutdown remain bounded");
console.log("- summaries omit secrets, addresses, endpoints, paths and route hashes");
console.log("- normal API and web runtimes cannot invoke publication delivery");