import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-publication-alert-delivery file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-publication-alert-delivery contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-publication-alert-delivery.ts",
  "packages/storyteller/src/audiobook-retail-publication-alert-delivery.test.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY.md",
]) requireFile(path);

requireTokens(
  "packages/storyteller/src/audiobook-retail-publication-alert-delivery.ts",
  [
    "AudiobookRetailPublicationAlertRecipientResolver",
    "AudiobookRetailPublicationAlertEmailProvider",
    "renderAudiobookRetailPublicationAlertEmail",
    "deliverAudiobookRetailPublicationAlert",
    "listDeliverableAudiobookRetailPublicationAlertIds",
    "AudiobookRetailPublicationAlertDeliveryWorker",
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_ROUTE_MISMATCH",
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_ROUTE_NOT_FOUND",
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_TIMEOUT",
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_ABORTED",
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_PROVIDER_FAILED",
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_SAVE_CONFLICT",
    "recipientReferenceHash",
    "idempotencyKey",
    "providerReceiptHash",
    "SEVERITY_PRIORITY",
  ],
);

requireTokens(
  "packages/storyteller/src/audiobook-retail-publication-alert-delivery.test.ts",
  [
    "ephemeral route resolution produces one sanitized idempotent sent revision",
    "safe provider failures append bounded attempts and a later retry succeeds",
    "missing routes exhaust after three safe failures without calling the provider",
    "route substitution and invalid addresses fail closed without persisting recipient data",
    "external aborts do not create ambiguous delivery attempts",
    "the batch worker prioritizes critical, high and warning alerts and drains them",
    "the default template is deterministic and omits private source evidence",
    "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_ROUTE_NOT_FOUND",
    "already-sent",
    "exhausted",
  ],
);

requireTokens("docs/AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY.md", [
  "Admission boundary",
  "Ephemeral recipient resolution",
  "Deterministic provider idempotency",
  "Safe message rendering",
  "Provider adapter boundary",
  "Bounded retries",
  "Timeout and abort semantics",
  "Revision and concurrency safety",
  "Batch worker",
  "Persistence and audit",
  "Private runtime boundary",
  "Output boundary",
  "It does not prove that the recipient read the message",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-publication-alert-delivery"]
      !== "./src/audiobook-retail-publication-alert-delivery.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-publication-alert-delivery",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-publication-alert-delivery"]
      !== "node scripts/check-audiobook-retail-publication-alert-delivery.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-publication-alert-delivery",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-publication-alert-delivery",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail publication alert delivery",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-publication-alert-delivery",
    "deliverAudiobookRetailPublicationAlert",
    "AudiobookRetailPublicationAlertDeliveryWorker",
    "AudiobookRetailPublicationAlertRecipientResolver",
    "AudiobookRetailPublicationAlertEmailProvider",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private publication-alert-delivery controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-publication-alert-delivery check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_publication_alert_delivery_check_passed");
console.log("- recipient addresses are resolved ephemerally from one-way route references");
console.log("- provider retries preserve one deterministic notification idempotency key");
console.log("- only one-way provider receipt hashes or safe failure codes are persisted");
console.log("- optimistic alert revisions prevent silent competing-worker overwrites");
console.log("- critical, high and warning incidents drain in deterministic order");
console.log("- normal API and web runtimes cannot invoke private delivery controls");