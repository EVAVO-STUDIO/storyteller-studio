import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-publication-alert file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-publication-alert contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-publication-alert.ts",
  "packages/storyteller/src/audiobook-retail-publication-alert.test.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_PUBLICATION_ALERTS.md",
]) requireFile(path);

requireTokens(
  "packages/storyteller/src/audiobook-retail-publication-alert.ts",
  [
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_SCHEMA_VERSION",
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE",
    "createAudiobookRetailPublicationAlert",
    "recordAudiobookRetailPublicationAlertDelivery",
    "acknowledgeAudiobookRetailPublicationAlert",
    "resolveAudiobookRetailPublicationAlert",
    "assertAudiobookRetailPublicationAlert",
    "assertAudiobookRetailPublicationAlertMatchesMonitor",
    "audiobookRetailPublicationAlertPublicView",
    "FileAudiobookRetailPublicationAlertStore",
    "identity-mismatch",
    "publication-unavailable",
    "regional-degradation",
    "evidence-stale",
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_TRIGGER_NOT_ACTIONABLE",
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_EXHAUSTED",
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_RECOVERY_INVALID",
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_SOURCE_MISMATCH",
  ],
);

requireTokens(
  "packages/storyteller/src/audiobook-retail-publication-alert.test.ts",
  [
    "a verified live regression creates one deterministic high-severity email incident",
    "mismatch, unavailability and stale evidence map to distinct alert classifications",
    "notification delivery retries remain append-only, bounded and idempotent after success",
    "human acknowledgement and verified recovery resolve the incident without erasing it",
    "source substitution cannot replace the triggering monitor transition",
    "revision-safe storage and public projections redact routing and evidence identities",
    "regional-degradation",
    "identity-mismatch",
    "publication-unavailable",
    "evidence-stale",
  ],
);

requireTokens("docs/AUDIOBOOK_RETAIL_PUBLICATION_ALERTS.md", [
  "Admission boundary",
  "Alert classifications",
  "Deterministic incident identity",
  "Notification request boundary",
  "Delivery attempts",
  "Acknowledgement",
  "Verified recovery resolution",
  "Persistence and audit",
  "Public projection",
  "Output boundary",
  "does not send mail",
  "does not guarantee future availability",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-publication-alert"]
      !== "./src/audiobook-retail-publication-alert.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-publication-alert",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-publication-alert"]
      !== "node scripts/check-audiobook-retail-publication-alert.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-publication-alert",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-publication-alert",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail publication alerts",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-publication-alert",
    "createAudiobookRetailPublicationAlert",
    "recordAudiobookRetailPublicationAlertDelivery",
    "acknowledgeAudiobookRetailPublicationAlert",
    "resolveAudiobookRetailPublicationAlert",
    "FileAudiobookRetailPublicationAlertStore",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private publication-alert controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-publication-alert check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_publication_alert_check_passed");
console.log("- incidents are created only from actionable persisted monitor transitions");
console.log("- category and severity derive from verified publication health");
console.log("- notification routing remains hashed and delivery attempts are bounded");
console.log("- human acknowledgement does not resolve publication health");
console.log("- only a later verified recovery can resolve an incident");
console.log("- normal API and web runtimes cannot mutate private alert evidence");
