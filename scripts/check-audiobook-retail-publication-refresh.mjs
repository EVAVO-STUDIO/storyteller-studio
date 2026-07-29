import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-publication-refresh file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-publication-refresh contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-publication-refresh.ts",
  "packages/storyteller/src/audiobook-retail-publication-refresh.test.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_PUBLICATION_REFRESH.md",
]) requireFile(path);

requireTokens(
  "packages/storyteller/src/audiobook-retail-publication-refresh.ts",
  [
    "AudiobookRetailPublicationVerificationProvider",
    "refreshAudiobookRetailPublicationMonitor",
    "listDueAudiobookRetailPublicationMonitorIds",
    "AudiobookRetailPublicationRefreshWorker",
    "not-due",
    "refreshed",
    "marked-stale",
    "already-stale",
    "failed",
    "conflict",
    "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_ABORTED",
    "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_TIMEOUT",
    "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_SAVE_CONFLICT",
    "createAudiobookRetailPublicationAlert",
    "resolveAudiobookRetailPublicationAlert",
    "markAudiobookRetailPublicationMonitorStale",
    "recordAudiobookRetailPublicationRefresh",
  ],
);

requireTokens(
  "packages/storyteller/src/audiobook-retail-publication-refresh.test.ts",
  [
    "not-due monitors skip acquisition and remain unchanged",
    "fresh degraded verification appends the monitor and creates one deterministic incident",
    "missing evidence at the deadline marks stale and creates an evidence-stale incident",
    "verified recovery resolves every earlier open incident for the monitor",
    "provider failures and external aborts do not mutate monitor or alert state",
    "due discovery and the batch worker are deterministic and bounded",
    "regional-degradation",
    "evidence-stale",
    "recovery",
    "AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_ABORTED",
  ],
);

requireTokens("docs/AUDIOBOOK_RETAIL_PUBLICATION_REFRESH.md", [
  "Admission boundary",
  "Complete verification evidence only",
  "Due discovery",
  "Refresh outcomes",
  "Alert creation",
  "Verified recovery resolution",
  "Timeout and abort",
  "Revision and concurrency safety",
  "Batch worker",
  "Persistence and audit",
  "Private application boundary",
  "Output boundary",
  "never fabricates a human observation",
  "does not prove perpetual availability",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-publication-refresh"]
      !== "./src/audiobook-retail-publication-refresh.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-publication-refresh",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-publication-refresh"]
      !== "node scripts/check-audiobook-retail-publication-refresh.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-publication-refresh",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-publication-refresh",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail publication refresh coordination",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-publication-refresh",
    "refreshAudiobookRetailPublicationMonitor",
    "listDueAudiobookRetailPublicationMonitorIds",
    "AudiobookRetailPublicationRefreshWorker",
    "AudiobookRetailPublicationVerificationProvider",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private publication-refresh controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-publication-refresh check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_publication_refresh_check_passed");
console.log("- only complete human-governed publication verification can refresh a monitor");
console.log("- missing current evidence produces governed staleness rather than fabricated facts");
console.log("- actionable regressions create deterministic incidents");
console.log("- only verified recovery resolves earlier incidents");
console.log("- acquisition, timeout, abort and save conflicts fail without ambiguous mutation");
console.log("- normal API and web runtimes cannot mutate publication refresh coordination");
