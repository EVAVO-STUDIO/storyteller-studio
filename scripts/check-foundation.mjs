import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const problems = [];
const requiredFiles = [
  "README.md",
  "package.json",
  "tsconfig.json",
  ".env.example",
  "packages/storyteller/package.json",
  "packages/storyteller/src/index.ts",
  "packages/storyteller/src/index.test.ts",
  "packages/storyteller/src/project-store.ts",
  "packages/storyteller/src/project-store.test.ts",
  "packages/storyteller/src/provider-adapter.ts",
  "packages/storyteller/src/provider-adapter.test.ts",
  "packages/storyteller/src/series-continuity.ts",
  "packages/storyteller/src/series-continuity.test.ts",
  "packages/storyteller/src/generation-queue-contracts.ts",
  "packages/storyteller/src/generation-queue.ts",
  "packages/storyteller/src/generation-queue.test.ts",
  "packages/cli/src/main.ts",
  "packages/cli/src/main.test.ts",
  "apps/api/src/queue-runtime.ts",
  "apps/api/src/queue-runtime.test.ts",
  "apps/api/src/server.ts",
  "apps/api/src/server.test.ts",
  "apps/web/src/app/page.tsx",
  "apps/web/src/app/layout.tsx",
  "apps/web/src/app/robots.ts",
  "apps/web/src/lib/evavoHubManifest.ts",
  "apps/web/public/hub/storyteller-studio.card.json",
  "docs/FOUNDATION.md",
  "docs/GENERATION_EXECUTION.md",
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

function forbidTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (source.includes(token)) problems.push(`${path} contains forbidden contract token: ${token}`);
  }
}

for (const path of requiredFiles) requireFile(path);

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  const workspaces = new Set(packageJson.workspaces ?? []);
  for (const workspace of ["apps/*", "packages/*"]) {
    if (!workspaces.has(workspace)) problems.push(`package.json is missing workspace: ${workspace}`);
  }
  for (const script of ["dev:web", "dev:api", "storyteller", "typecheck", "test:engine", "test:api", "test:cli", "test", "verify", "build"]) {
    if (typeof packageJson.scripts?.[script] !== "string") problems.push(`package.json is missing script: ${script}`);
  }
}

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  for (const exportPath of [".", "./generation-queue", "./project-store", "./provider-adapter", "./series-continuity"]) {
    if (typeof packageJson.exports?.[exportPath] !== "string") {
      problems.push(`packages/storyteller/package.json is missing export: ${exportPath}`);
    }
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

requireTokens("packages/storyteller/src/project-store.ts", [
  "StoreConflictError",
  "StoreIntegrityError",
  "previousEnvelopeHash",
  "#writeAtomic",
  "#acquireLock",
  "appendAuditEvent",
]);

requireTokens("packages/storyteller/src/provider-adapter.ts", [
  "ProviderAdapterRegistry",
  "ProviderCapabilitySnapshot",
  "CredentialResolver",
  "buildSynthesisRequest",
  "executeGenerationJob",
  "idempotencyKey",
  "PROVIDER_CREDENTIAL_UNAVAILABLE",
]);

requireTokens("packages/storyteller/src/series-continuity.ts", [
  "createSeriesContinuityBible",
  "assessBookContinuity",
  "promoteBookContinuity",
  "buildSeriesRegressionSuite",
  "SERIES_VOICE_RECAST_UNAPPROVED",
]);

requireTokens("packages/storyteller/src/generation-queue-contracts.ts", [
  "GENERATION_QUEUE_SCHEMA_VERSION",
  "GenerationQueueStatus",
  "tokenHash",
  "generationQueueIdempotencyKey",
  "generationLeaseTokenMatches",
  "assertGenerationQueueItem",
  "GENERATION_QUEUE_LEASE_TOKEN_INVALID",
  "outputArtifactRefs",
]);

requireTokens("packages/storyteller/src/generation-queue.ts", [
  "FileGenerationQueue",
  "claimNext",
  "heartbeat",
  "complete",
  "reapExpiredLeases",
  "GENERATION_QUEUE_LEASE_TOKEN_MISMATCH",
  "GENERATION_QUEUE_LEASE_LOST",
  "generation.queue.cancelled",
  "retry-wait",
]);

requireTokens("packages/storyteller/src/generation-queue.test.ts", [
  "enqueue is idempotent but rejects changed generation intent",
  "blocked generation intents remain visible but cannot be leased",
  "claims are priority ordered and lease exclusive",
  "persisted leases contain only a token hash",
  "retryable failures back off and stop at the attempt ceiling",
  "expired leases are reaped",
  "completion stores references and provenance hashes without raw media",
  "operator cancellation invalidates an in-flight worker lease",
  "queue reads fail closed for malformed persisted queue state",
]);

requireTokens("apps/api/src/queue-runtime.ts", [
  "resolveGenerationQueueRuntimeConfiguration",
  "GENERATION_QUEUE_FILE_DRIVER_SINGLE_HOST_ACK_REQUIRED",
  "generationQueueRuntimeSummary",
  "generationQueuePublicView",
  "workerApiExposed: false",
  "outputArtifactCount",
]);
forbidTokens("apps/api/src/queue-runtime.ts", ["tokenHash", "leaseToken"]);

requireTokens("apps/api/src/queue-runtime.test.ts", [
  "queue runtime is disabled unless a driver is explicitly configured",
  "production file queue requires an explicit single-host acknowledgement",
  "public queue views redact lease hashes, job routing and artifact references",
]);

requireTokens("apps/api/src/server.ts", [
  "API_AUTH_CONFIGURATION_MISSING",
  "API_ACTOR_CONFIGURATION_MISSING",
  "API_DEVELOPMENT_LOOPBACK_ONLY",
  "timingSafeEqual",
  "STORYTELLER_MAX_REQUEST_BYTES",
  "noindex, nofollow, noarchive",
  "/v1/projects/plan",
  "/v1/providers/rank",
  "/v1/takes/evaluate",
  "/v1/generation/jobs",
  "/v1/generation/queue",
  'execution: "not-started"',
  'execution: hasRunnable ? "queued" : "blocked"',
  "workerApiExposed: false",
  "Cancellation is recorded and any in-flight worker lease is invalidated.",
]);
forbidTokens("apps/api/src/server.ts", ["claimNext(", "leaseToken", "heartbeat("]);

requireTokens("apps/api/src/server.test.ts", [
  "queue routes fail closed when durable admission is not configured",
  "queue admission, inspection and cancellation expose only redacted operator state",
  "production queue cancellation requires a server-configured actor identity",
  "untrusted_body_actor",
  "/claim",
]);

requireTokens("packages/cli/src/main.ts", [
  'case "segment"',
  'case "plan"',
  'case "providers"',
  'case "take-check"',
  'case "visual-plan"',
  'case "jobs"',
  'case "queue-enqueue"',
  'case "queue-list"',
  'case "queue-show"',
  'case "queue-cancel"',
  'case "queue-reap"',
  'case "verify"',
  "queueCliView",
  "fileURLToPath(import.meta.url)",
  "PROVIDER_EXECUTION_NOT_CONFIGURED",
]);
forbidTokens("packages/cli/src/main.ts", ["tokenHash", "leaseToken", "claimNext("]);

requireTokens("packages/cli/src/main.test.ts", [
  "local queue CLI can enqueue, list, inspect and cancel without exposing lease hashes",
  "queue commands require an explicit data root when the environment is unset",
  "operator_cli_test",
  "tokenHash",
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

requireTokens("docs/GENERATION_EXECUTION.md", [
  "generation intent",
  "Queue state model",
  "Lease security",
  "Only its SHA-256 hash is persisted",
  "deterministic exponential backoff",
  "private object storage",
  "Production worker sequence",
  "do not auto-release",
]);

if (problems.length > 0) {
  console.error("Storyteller Studio foundation check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_foundation_check_passed");
console.log("- exact-source manuscript and performance contracts are present");
console.log("- rights, provider, continuity, transcript and technical QA gates are present");
console.log("- durable queue leases, retries, cancellation and artifact references are verified");
console.log("- queue API admission and operator views remain redacted and fail closed");
console.log("- local queue CLI workflows remain deterministic and do not expose lease secrets");
console.log("- provider execution remains disabled until its rights, budget and artifact boundaries are configured");
console.log("- private web and EVAVO hub contracts remain source-ready but unreleased");
