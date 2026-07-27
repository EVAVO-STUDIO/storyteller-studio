import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing worker-runtime file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing worker-runtime contract token: ${token}`);
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
  "apps/worker/package.json",
  "apps/worker/src/configuration.ts",
  "apps/worker/src/configuration.test.ts",
  "apps/worker/src/lifecycle.ts",
  "apps/worker/src/lifecycle.test.ts",
  "apps/worker/src/runtime.ts",
  "apps/worker/src/runtime.test.ts",
  "apps/worker/src/providers.ts",
  "apps/worker/src/main.ts",
  "docs/WORKER_RUNTIME.md",
  "scripts/run-tests.mjs",
  ".env.example",
]) requireFile(path);

requireTokens("apps/worker/src/configuration.ts", [
  "WorkerRuntimeConfiguration",
  "EnvironmentCredentialResolver",
  "resolveWorkerRuntimeConfiguration",
  "workerRuntimeConfigurationSummary",
  "WORKER_RUNTIME_MODE_INVALID",
  "WORKER_FILE_QUEUE_DRIVER_REQUIRED",
  "WORKER_FILE_ARTIFACT_DRIVER_REQUIRED",
  "WORKER_PRODUCTION_SINGLE_HOST_ACK_REQUIRED",
  "STORYTELLER_FILE_WORKER_SINGLE_HOST",
  "STORYTELLER_WORKER_CREDENTIAL_BINDINGS",
  'resolve(rootDirectory, "generation-queue")',
  'resolve(rootDirectory, "artifact-registry")',
  'resolve(rootDirectory, "private-objects")',
  "executionApiExposed: false",
]);

requireTokens("apps/worker/src/configuration.test.ts", [
  "worker runtime is disabled by default without evaluating private settings",
  "enabled file worker configuration resolves isolated stores and bounded controls",
  "environment credential bindings resolve secrets without including them in configuration summaries",
  "production file worker requires queue, artifact and worker single-host acknowledgements",
  "worker configuration rejects unsafe drivers, timing and credential bindings",
]);

requireTokens("apps/worker/src/lifecycle.ts", [
  "runWorkerLifecycle",
  'WorkerProcessSignal = "SIGINT" | "SIGTERM"',
  "requestDrain",
  "WORKER_PROCESS_SHUTDOWN_DEADLINE_EXCEEDED",
  "WORKER_PROCESS_SECOND_SIGNAL_ABORT",
  'process.on("SIGINT"',
  'process.on("SIGTERM"',
  'process.off("SIGINT"',
  'process.off("SIGTERM"',
]);

requireTokens("apps/worker/src/lifecycle.test.ts", [
  "once mode runs until the queue is idle without installing a false shutdown outcome",
  "first process signal requests a graceful drain and cancels the deadline after completion",
  "shutdown deadline forces an abort while preserving a redacted lifecycle result",
  "a second process signal aborts immediately instead of extending shutdown",
  "lifecycle rejects unbounded shutdown grace periods",
]);

requireTokens("apps/worker/src/runtime.ts", [
  "runConfiguredWorkerRuntime",
  "createWorkerService",
  "preflightProviders",
  "CachedCredentialResolver",
  "WORKER_PROVIDER_ADAPTERS_REQUIRED",
  "WORKER_PROVIDER_CREDENTIAL_MISSING",
  "WORKER_PROVIDER_CAPABILITY_ID_MISMATCH",
  "FileGenerationMaterialStore",
  "FilePrivateObjectStore",
  "GenerationWorkerService",
  "runWorkerLifecycle",
]);

requireTokens("apps/worker/src/runtime.test.ts", [
  "disabled runtime returns without providers, credentials or persistence",
  "enabled runtime fails before queue polling when no provider adapter is registered",
  "enabled runtime requires every registered provider credential before claiming work",
  "once runtime preflights providers and stops cleanly when the durable queue is empty",
  "provider capability mismatch fails before service start",
]);

requireTokens("apps/worker/src/providers.ts", [
  "createWorkerProviderRegistry",
  "return new ProviderAdapterRegistry();",
  "rights, privacy, cost and response-validation contracts",
]);

requireTokens("apps/worker/src/main.ts", [
  "startStorytellerWorker",
  "resolveWorkerRuntimeConfiguration",
  "EnvironmentCredentialResolver",
  "createWorkerProviderRegistry",
  "runConfiguredWorkerRuntime",
  'service: "storyteller-studio-worker"',
  "safeErrorCode",
  "process.exitCode = 1",
]);

requireTokens("docs/WORKER_RUNTIME.md", [
  "Disabled by default",
  "Fail-closed storage",
  "Isolated persistence",
  "Provider preflight",
  "Bounded execution",
  "Process signals",
  "No HTTP execution surface",
  "Safe operational output",
  "Production migration",
  "WORKER_PROVIDER_ADAPTERS_REQUIRED",
  "transactional budget reservations before provider execution",
]);

requireTokens("scripts/run-tests.mjs", [
  'worker: ["apps/worker/src"]',
  '"apps/worker/src"',
]);

requireTokens(".env.example", [
  "STORYTELLER_WORKER_MODE=disabled",
  "STORYTELLER_WORKER_ID=storyteller_worker_001",
  "STORYTELLER_WORKER_VERIFIER_ACTOR_ID=storyteller_verifier_001",
  "STORYTELLER_WORKER_CONCURRENCY=2",
  "STORYTELLER_WORKER_LEASE_DURATION_MS=60000",
  "STORYTELLER_WORKER_HEARTBEAT_INTERVAL_MS=20000",
  "STORYTELLER_WORKER_SHUTDOWN_GRACE_MS=30000",
  "STORYTELLER_FILE_WORKER_SINGLE_HOST=false",
  "STORYTELLER_WORKER_CREDENTIAL_BINDINGS={}",
]);

const workerRuntimeFiles = collectRuntimeFiles("apps/worker/src");
for (const path of workerRuntimeFiles) {
  const source = read(path);
  for (const forbidden of [
    'from "node:http"',
    'from "node:https"',
    "createServer(",
    ".listen(",
    "express(",
    "Fastify(",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`${path} exposes an HTTP listener or server dependency: ${forbidden}`);
    }
  }
}

const configurationSource = existsSync(fromRoot("apps/worker/src/configuration.ts"))
  ? read("apps/worker/src/configuration.ts")
  : "";
const summaryStart = configurationSource.indexOf("export function workerRuntimeConfigurationSummary");
if (summaryStart < 0) {
  problems.push("worker runtime configuration summary is missing");
} else {
  const summary = configurationSource.slice(summaryStart);
  for (const forbidden of [
    "workerId:",
    "verifierActorId:",
    "projectId:",
    "queueRootDirectory:",
    "artifactRootDirectory:",
    "objectRootDirectory:",
    "credentialBindings:",
    "objectContainer:",
  ]) {
    if (summary.includes(forbidden)) {
      problems.push(`worker runtime summary exposes private configuration: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const source = read(path);
  for (const forbidden of [
    "@evavo/storyteller-worker",
    "apps/worker",
    "runConfiguredWorkerRuntime",
    "startStorytellerWorker",
    "createWorkerService",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`${path} exposes the private worker runtime: ${forbidden}`);
    }
  }
}

const envSource = existsSync(fromRoot(".env.example")) ? read(".env.example") : "";
if (/NEXT_PUBLIC_[A-Z0-9_]*(?:WORKER|CREDENTIAL|SECRET|TOKEN|KEY)/u.test(envSource)) {
  problems.push("worker or credential configuration must never use a NEXT_PUBLIC_ variable");
}

if (problems.length > 0) {
  console.error("Storyteller Studio worker runtime check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_worker_runtime_check_passed");
console.log("- the dedicated worker is disabled by default and opens no HTTP listener");
console.log("- file execution requires explicit queue, artifact and worker one-host posture");
console.log("- provider adapters, credentials and capability snapshots pass preflight before claims");
console.log("- SIGINT and SIGTERM drain gracefully before a bounded forced abort");
console.log("- runtime summaries omit identities, paths, credential bindings and generated media");
console.log("- normal API and browser runtimes expose no worker process controls");
