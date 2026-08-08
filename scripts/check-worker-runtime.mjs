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
  "apps/worker/src/elevenlabs-provider.ts",
  "apps/worker/src/elevenlabs-provider.test.ts",
  "apps/worker/src/audio-studio-provider.ts",
  "apps/worker/src/audio-studio-provider.test.ts",
  "apps/worker/src/providers-audio-studio.test.ts",
  "apps/worker/src/lifecycle.ts",
  "apps/worker/src/lifecycle.test.ts",
  "apps/worker/src/runtime.ts",
  "apps/worker/src/runtime.test.ts",
  "apps/worker/src/providers.ts",
  "apps/worker/src/providers.test.ts",
  "apps/worker/src/main.ts",
  "docs/ELEVENLABS_ADAPTER.md",
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

requireTokens("apps/worker/src/elevenlabs-provider.ts", [
  "ELEVENLABS_CREDENTIAL_BINDING_ID",
  "resolveElevenLabsWorkerProvider",
  "elevenLabsWorkerProviderSummary",
  "if (!input.workerEnabled) return null",
  "STORYTELLER_ELEVENLABS_ENABLED",
  "STORYTELLER_ELEVENLABS_MODEL_POLICIES",
  "STORYTELLER_ELEVENLABS_VOICE_BINDINGS",
  "STORYTELLER_ELEVENLABS_PRONUNCIATION_DICTIONARIES",
  "STORYTELLER_ELEVENLABS_DATA_POLICY",
  "ELEVENLABS_WORKER_CREDENTIAL_BINDING_REQUIRED",
  "new ElevenLabsNarrationAdapter(configuration)",
]);

requireTokens("apps/worker/src/elevenlabs-provider.test.ts", [
  "disabled worker ignores every private ElevenLabs setting",
  "disabled provider does not evaluate model, voice or pricing records",
  "complete governed configuration creates one redacted provider summary",
  "enabled provider requires an explicit server credential binding",
  "malformed provider JSON and policy shapes fail before adapter registration",
  "expired pricing and non-premade voices fail closed during construction",
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
]);

requireTokens("apps/worker/src/runtime.ts", [
  "runConfiguredWorkerRuntime",
  "createWorkerService",
  "preflightProviders",
  "CachedCredentialResolver",
  "WORKER_PROVIDER_ADAPTERS_REQUIRED",
  "WORKER_PROVIDER_CREDENTIAL_MISSING",
  "WORKER_PROVIDER_CAPABILITY_ID_MISMATCH",
  "FileCalibrationSessionStore",
  "FileGenerationCalibrationBindingStore",
  "CalibratedGenerationMaterialStore",
  "createCalibrationBoundProviderRegistry",
  "FileBudgetLedger",
  "FileGenerationBudgetController",
  "budgetController",
  "requireBudget: true",
  "requireAudioEngineering: true",
  "WORKER_AUDIO_ENGINEERING_POLICY_REQUIRED",
  "FilePrivateObjectStore",
  "GenerationWorkerService",
  "runWorkerLifecycle",
]);

requireTokens("apps/worker/src/runtime.test.ts", [
  "disabled runtime returns without providers, credentials or persistence",
  "enabled runtime rejects missing engineering policy before provider preflight",
  "enabled runtime fails before queue polling when no provider adapter is registered",
  "enabled runtime requires every registered provider credential before claiming work",
  "once runtime preflights providers and stops cleanly when the durable queue is empty",
  "provider capability mismatch fails before service start",
]);

requireTokens("apps/worker/src/providers.ts", [
  "CreateWorkerProviderRegistryInput",
  "createWorkerProviderRegistry",
  "resolveAudioStudioWorkerProvider",
  "resolveElevenLabsWorkerProvider",
  "const audioStudio = resolveAudioStudioWorkerProvider({",
  "const elevenLabs = resolveElevenLabsWorkerProvider({",
  "workerEnabled: input.workerEnabled",
  "credentialBindings: input.credentialBindings",
  "return new ProviderAdapterRegistry([",
  "...(audioStudio ? [audioStudio.adapter] : []),",
  "...(elevenLabs ? [elevenLabs.adapter] : []),",
]);

requireTokens("apps/worker/src/providers.test.ts", [
  "worker provider registry remains empty when the worker is disabled",
  "worker provider registry remains empty when ElevenLabs is disabled",
  "worker provider registry conditionally registers one governed ElevenLabs adapter",
  "worker provider registry rejects incomplete ElevenLabs governance configuration",
]);

requireTokens("apps/worker/src/providers-audio-studio.test.ts", [
  "worker registry includes the governed Audio Studio provider",
  "disabled workers do not register or parse Audio Studio",
]);

requireTokens("apps/worker/src/main.ts", [
  "startStorytellerWorker",
  "resolveWorkerRuntimeConfiguration",
  "EnvironmentCredentialResolver",
  "workerAudioEngineeringPolicySummary",
  "resolveWorkerAudioEngineeringPolicy",
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
  "Required calibration control",
  "Required budget control",
  "Bounded execution",
  "Process signals",
  "No HTTP execution surface",
  "Safe operational output",
  "Production migration",
  "WORKER_PROVIDER_ADAPTERS_REQUIRED",
  "CalibratedGenerationMaterialStore",
  "before provider credentials are used",
  "after artifact admission and before queue completion",
  "settles interrupted work conservatively",
  "PostgreSQL transactional claims, material, calibration-binding and budget records",
]);

requireTokens("docs/ELEVENLABS_ADAPTER.md", [
  "Premade voice boundary",
  "Immutable pricing evidence",
  "Exact manuscript text",
  "Provider preflight",
  "Worker boundary",
  "The built-in worker registry remains empty when configuration is absent or invalid",
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
  "STORYTELLER_AUDIO_ENGINEERING_MAX_OUTPUT_BYTES=8388608",
  "STORYTELLER_AUDIO_ENGINEERING_TIMEOUT_MS=120000",
  "STORYTELLER_AUDIO_ENGINEERING_PROFILE_SOURCE_REFERENCE=",
  "STORYTELLER_AUDIO_ENGINEERING_PROFILE_REVIEWED_AT=",
  "STORYTELLER_AUDIO_ENGINEERING_PROFILE_VERSION=",
  "STORYTELLER_AUDIO_ENGINEERING_PROFILE=",
  "STORYTELLER_ELEVENLABS_ENABLED=false",
  "STORYTELLER_ELEVENLABS_ADAPTER_VERSION=1.0.0",
  "STORYTELLER_ELEVENLABS_MODEL_POLICIES=[]",
  "STORYTELLER_ELEVENLABS_VOICE_BINDINGS=[]",
  "STORYTELLER_ELEVENLABS_PRONUNCIATION_DICTIONARIES=[]",
  "STORYTELLER_ELEVENLABS_DATA_POLICY={}",
  "STORYTELLER_ELEVENLABS_ALLOW_V3_PRODUCTION=false",
]);

const runtimeSource = existsSync(fromRoot("apps/worker/src/runtime.ts"))
  ? read("apps/worker/src/runtime.ts")
  : "";
const runtimeOrder = [
  "const queueState = new FileProjectStore",
  "const queue = new FileGenerationQueue",
  "const calibrationStore = new FileCalibrationSessionStore",
  "const calibrationBindings = new FileGenerationCalibrationBindingStore",
  "const materials = new CalibratedGenerationMaterialStore",
  "const providers = createCalibrationBoundProviderRegistry",
  "const budgetController = new FileGenerationBudgetController",
  "const artifactRegistry = new FileArtifactRegistry",
  "const objectStore = new FilePrivateObjectStore",
  "return new GenerationWorkerService",
];
let previous = -1;
for (const token of runtimeOrder) {
  const index = runtimeSource.indexOf(token, previous + 1);
  if (index < 0) {
    problems.push(`private runtime sequence is missing: ${token}`);
    continue;
  }
  previous = index;
}
if (!runtimeSource.includes("budgetController,") || !runtimeSource.includes("requireBudget: true")) {
  problems.push("private runtime does not require its configured budget controller");
}

const privateHttpGatewayFiles = new Set([
  "apps/worker/src/publication-evidence-gateway-runtime.ts",
]);
for (const path of collectRuntimeFiles("apps/worker/src")) {
  if (privateHttpGatewayFiles.has(path)) continue;
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
    "budgetController:",
    "reservationId:",
  ]) {
    if (summary.includes(forbidden)) {
      problems.push(`worker runtime summary exposes private configuration: ${forbidden}`);
    }
  }
}

const providerConfigurationSource = existsSync(fromRoot("apps/worker/src/elevenlabs-provider.ts"))
  ? read("apps/worker/src/elevenlabs-provider.ts")
  : "";
const providerSummaryStart = providerConfigurationSource.indexOf("function disabledSummary");
if (providerSummaryStart < 0) {
  problems.push("ElevenLabs worker provider summary boundary is missing");
} else {
  const providerSummarySource = providerConfigurationSource.slice(providerSummaryStart);
  for (const forbidden of [
    "voiceId:",
    "voiceProfileId:",
    "licenceEvidenceId:",
    "pronunciationDictionaryId:",
    "versionId:",
    "sourceReference:",
    "microsPerThousandCharacters:",
    "credentialBindings:",
    "ELEVENLABS_API_KEY",
  ]) {
    if (providerSummarySource.includes(forbidden)) {
      problems.push(`ElevenLabs worker provider summary exposes private configuration: ${forbidden}`);
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
    "FileGenerationCalibrationBindingStore",
    "CalibratedGenerationMaterialStore",
    "createCalibrationBoundProviderRegistry",
    "FileGenerationBudgetController",
    "FileBudgetLedger",
    "resolveAudioStudioWorkerProvider",
    "resolveElevenLabsWorkerProvider",
    "AudioStudioVoiceAdapter",
    "EVAVO_VOICE_SERVICE_TOKEN",
    "STORYTELLER_AUDIO_STUDIO_VOICE_BINDINGS",
    "createWorkerProviderRegistry",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`${path} exposes the private worker runtime: ${forbidden}`);
    }
  }
}

const envSource = existsSync(fromRoot(".env.example")) ? read(".env.example") : "";
if (/NEXT_PUBLIC_[A-Z0-9_]*(?:WORKER|BUDGET|ELEVENLABS|AUDIO_STUDIO|CREDENTIAL|SECRET|TOKEN|KEY)/u.test(envSource)) {
  problems.push("worker, provider, budget or credential configuration must never use a NEXT_PUBLIC_ variable");
}

if (problems.length > 0) {
  console.error("Storyteller Studio worker runtime check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_worker_runtime_check_passed");
console.log("- the dedicated worker is disabled by default and opens no HTTP listener");
console.log("- file execution requires explicit queue, artifact and worker one-host posture");
console.log("- calibrated material and provider wrappers block unapproved production before synthesis");
console.log("- governed Audio Studio and ElevenLabs adapters, credentials and capability snapshots pass preflight before claims");
console.log("- the private runtime requires calibration, independent engineering and transactional budget control before provider work");
console.log("- SIGINT and SIGTERM drain gracefully before a bounded forced abort");
console.log("- runtime summaries omit identities, paths, provider records, credentials, budgets and generated media");
console.log("- normal API and browser runtimes expose no worker process controls");
