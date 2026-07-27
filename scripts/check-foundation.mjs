import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const problems = [];
const requiredFiles = [
  "README.md",
  "package.json",
  "tsconfig.json",
  ".env.example",
  "packages/storyteller/src/index.ts",
  "packages/storyteller/src/index.test.ts",
  "packages/cli/src/main.ts",
  "apps/api/src/server.ts",
  "apps/web/src/app/page.tsx",
  "apps/web/src/app/layout.tsx",
  "apps/web/src/app/robots.ts",
  "apps/web/src/lib/evavoHubManifest.ts",
  "apps/web/public/hub/storyteller-studio.card.json",
  "docs/FOUNDATION.md",
];

function fromRoot(path) {
  return resolve(root, path);
}

function read(path) {
  return readFileSync(fromRoot(path), "utf8");
}

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing required file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) problems.push(`${path} is missing required contract token: ${token}`);
  }
}

for (const path of requiredFiles) requireFile(path);

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  const workspaces = new Set(packageJson.workspaces ?? []);
  for (const workspace of ["apps/*", "packages/*"]) {
    if (!workspaces.has(workspace)) problems.push(`package.json is missing workspace: ${workspace}`);
  }
  for (const script of ["dev:web", "dev:api", "storyteller", "typecheck", "test", "verify", "build"]) {
    if (typeof packageJson.scripts?.[script] !== "string") problems.push(`package.json is missing script: ${script}`);
  }
}

requireTokens("packages/storyteller/src/index.ts", [
  "segmentManuscript",
  "verifySegmentCoverage",
  "validateVoiceRights",
  "CRAFT_REFERENCE_IMPERSONATION_DIRECTION",
  "assessContinuity",
  "rankProviders",
  "assessTranscriptFidelity",
  "TAKE_FINAL_WORD_TRUNCATED",
  "assessTechnicalAudio",
  "selectBestCandidate",
  "buildVisualBeatPlan",
  "createProjectManifest",
  "createGenerationJobs",
  "ACX_AUDIOBOOK_PROFILE",
  "LOSSLESS_PRODUCTION_PROFILE",
]);

requireTokens("packages/storyteller/src/index.test.ts", [
  "manuscript segmentation preserves exact source spans and final word",
  "rights validation reports missing clone consent before expiry",
  "craft references cannot become performer impersonation instructions",
  "transcript QA catches final-word truncation",
  "provider ranking fails closed",
  "visual planning groups dramatic material",
]);

requireTokens("apps/api/src/server.ts", [
  "API_AUTH_CONFIGURATION_MISSING",
  "API_DEVELOPMENT_LOOPBACK_ONLY",
  "timingSafeEqual",
  "STORYTELLER_MAX_REQUEST_BYTES",
  "noindex, nofollow, noarchive",
  "/v1/projects/plan",
  "/v1/providers/rank",
  "/v1/takes/evaluate",
  "/v1/generation/jobs",
  'execution: "not-started"',
]);

requireTokens("packages/cli/src/main.ts", [
  'case "segment"',
  'case "plan"',
  'case "providers"',
  'case "take-check"',
  'case "visual-plan"',
  'case "jobs"',
  'case "verify"',
  "PROVIDER_EXECUTION_NOT_CONFIGURED",
]);

requireTokens("apps/web/src/app/page.tsx", [
  "Direct the performance.",
  "Protect the story.",
  "No provider connected",
  "Intent before emotion labels",
  "Blocked honestly",
  "Choose the best performance, not the first file",
  "ILLUSTRATED STORY COMPANION",
]);

requireTokens("apps/web/src/lib/evavoHubManifest.ts", [
  'applicationKey: "storyteller-studio"',
  'appKind: "protected-standalone-app"',
  'launchMode: "signed-launch-on-demand"',
  'availability: "source-ready-launch-pending"',
  "requiresWorkspaceProvisioning: true",
  "requiresAppEntitlement: true",
  "clientRelease: false",
  "launchHref: null",
]);

if (existsSync(fromRoot("apps/web/public/hub/storyteller-studio.card.json"))) {
  const card = JSON.parse(read("apps/web/public/hub/storyteller-studio.card.json"));
  const expected = {
    schemaVersion: "evavo-hub-card-v1",
    applicationKey: "storyteller-studio",
    availability: "source-ready-launch-pending",
    defaultVisible: false,
    clientRelease: false,
    sourceRepo: "EVAVO-STUDIO/storyteller-studio",
    launchHref: null,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (card[key] !== value) problems.push(`hub card ${key} expected ${JSON.stringify(value)} but received ${JSON.stringify(card[key])}`);
  }
  if (!Array.isArray(card.capabilities) || card.capabilities.length < 6) problems.push("hub card capability summary is incomplete");
  if (!Array.isArray(card.guardrails) || card.guardrails.length < 4) problems.push("hub card guardrail summary is incomplete");
}

requireTokens("docs/FOUNDATION.md", [
  "Listener relationship",
  "Provider capability negotiation",
  "Candidate takes and objective quality gates",
  "Long-form and series continuity",
  "Illustrated story companion",
  "Evaluation programme",
  "Security, privacy and rights",
  "Delivery roadmap",
]);

if (problems.length > 0) {
  console.error("Storyteller Studio foundation check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_foundation_check_passed");
console.log("- exact-source manuscript and performance contracts are present");
console.log("- rights, provider, continuity, transcript and technical QA gates are present");
console.log("- API and CLI remain provider-neutral and fail closed before execution");
console.log("- private web and EVAVO hub contracts remain source-ready but unreleased");
