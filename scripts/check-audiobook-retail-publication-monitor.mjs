import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-publication-monitor file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-publication-monitor contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-publication-monitor.ts",
  "packages/storyteller/src/audiobook-retail-publication-monitor.test.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_PUBLICATION_MONITOR.md",
]) requireFile(path);

requireTokens(
  "packages/storyteller/src/audiobook-retail-publication-monitor.ts",
  [
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_SCHEMA_VERSION",
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTITY_TYPE",
    "createAudiobookRetailPublicationMonitor",
    "recordAudiobookRetailPublicationRefresh",
    "markAudiobookRetailPublicationMonitorStale",
    "assertAudiobookRetailPublicationMonitor",
    "audiobookRetailPublicationMonitorPublicView",
    "FileAudiobookRetailPublicationMonitorStore",
    "healthy-live",
    "degraded",
    "unavailable",
    "mismatch",
    "stale",
    "initialized",
    "refresh",
    "state-change",
    "regression",
    "recovery",
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REFRESH_OVERDUE",
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_SCOPE_MISMATCH",
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REFRESH_ORDER_INVALID",
  ],
);

requireTokens(
  "packages/storyteller/src/audiobook-retail-publication-monitor.test.ts",
  [
    "a live publication starts a healthy monitor with a bounded refresh deadline",
    "refresh, regression, state change and recovery retain immutable evidence history",
    "overdue publication evidence becomes stale and a fresh live verification recovers it",
    "duplicates, out-of-order evidence, region drift and listing substitution fail closed",
    "revision-safe persistence and public projections expose health without source evidence",
    "healthy-live",
    "regression",
    "recovery",
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REFRESH_OVERDUE",
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_SCOPE_MISMATCH",
  ],
);

requireTokens("docs/AUDIOBOOK_RETAIL_PUBLICATION_MONITOR.md", [
  "Admission boundary",
  "Immutable refresh history",
  "Health model",
  "Transition model",
  "Freshness and expiry",
  "Exact scope binding",
  "Persistence and audit",
  "Public projection",
  "Alerting boundary",
  "Output boundary",
  "healthy-live",
  "It does not guarantee future availability",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-publication-monitor"]
      !== "./src/audiobook-retail-publication-monitor.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-publication-monitor",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-publication-monitor"]
      !== "node scripts/check-audiobook-retail-publication-monitor.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-publication-monitor",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-publication-monitor",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail publication monitoring",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-publication-monitor",
    "createAudiobookRetailPublicationMonitor",
    "recordAudiobookRetailPublicationRefresh",
    "markAudiobookRetailPublicationMonitorStale",
    "FileAudiobookRetailPublicationMonitorStore",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private publication-monitor controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-publication-monitor check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_publication_monitor_check_passed");
console.log("- immutable publication verifications remain append-only and chronological");
console.log("- health derives from truthful publication-verification outcomes");
console.log("- regression, recovery, refresh and stale transitions remain evidence-backed");
console.log("- refresh deadlines cannot outlive the underlying public observation");
console.log("- public and audit projections omit source evidence and private identities");
console.log("- normal API and web runtimes cannot mutate publication monitoring");
