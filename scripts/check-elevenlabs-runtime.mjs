import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing ElevenLabs runtime file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing ElevenLabs runtime token: ${token}`);
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
  "apps/worker/src/elevenlabs-provider.ts",
  "apps/worker/src/elevenlabs-provider.test.ts",
  "apps/worker/src/elevenlabs-runtime.test.ts",
  "apps/worker/src/providers.ts",
  "apps/worker/src/providers.test.ts",
  "apps/worker/src/main.ts",
  "docs/ELEVENLABS_ADAPTER.md",
  "docs/WORKER_RUNTIME.md",
  ".env.example",
]) requireFile(path);

requireTokens("apps/worker/src/elevenlabs-provider.ts", [
  "ELEVENLABS_CREDENTIAL_BINDING_ID",
  "ElevenLabsWorkerProviderSummary",
  "ResolvedElevenLabsWorkerProvider",
  "ResolveElevenLabsWorkerProviderInput",
  "resolveElevenLabsWorkerProvider",
  "elevenLabsWorkerProviderSummary",
  "if (!input.workerEnabled) return null",
  "if (!enabled) return null",
  "STORYTELLER_ELEVENLABS_ENABLED",
  "STORYTELLER_ELEVENLABS_ADAPTER_VERSION",
  "STORYTELLER_ELEVENLABS_MODEL_POLICIES",
  "STORYTELLER_ELEVENLABS_VOICE_BINDINGS",
  "STORYTELLER_ELEVENLABS_PRONUNCIATION_DICTIONARIES",
  "STORYTELLER_ELEVENLABS_DATA_POLICY",
  "STORYTELLER_ELEVENLABS_TEXT_NORMALISATION",
  "STORYTELLER_ELEVENLABS_OUTPUT_BITRATE_KBPS",
  "STORYTELLER_ELEVENLABS_MAX_RESPONSE_BYTES",
  "STORYTELLER_ELEVENLABS_PREFLIGHT_TIMEOUT_MS",
  "STORYTELLER_ELEVENLABS_ALLOW_V3_PRODUCTION",
  "ELEVENLABS_WORKER_CREDENTIAL_BINDING_REQUIRED",
  "ELEVENLABS_WORKER_MODEL_POLICIES_INVALID",
  "ELEVENLABS_WORKER_VOICE_BINDINGS_INVALID",
  "ELEVENLABS_WORKER_DATA_POLICY_INVALID",
  "new ElevenLabsNarrationAdapter(configuration)",
]);

requireTokens("apps/worker/src/elevenlabs-provider.test.ts", [
  "disabled worker ignores every private ElevenLabs setting",
  "disabled provider does not evaluate model, voice or pricing records",
  "complete governed configuration creates one redacted provider summary",
  "enabled provider requires an explicit server credential binding",
  "malformed provider JSON and policy shapes fail before adapter registration",
  "expired pricing and non-premade voices fail closed during construction",
  "unsafe booleans, bitrate and text normalisation are rejected",
]);

requireTokens("apps/worker/src/providers.ts", [
  "CreateWorkerProviderRegistryInput",
  "createWorkerProviderRegistry",
  "resolveElevenLabsWorkerProvider",
  "workerEnabled: input.workerEnabled",
  "environment: input.environment",
  "credentialBindings: input.credentialBindings",
  "new ProviderAdapterRegistry([",
  "...(elevenLabs ? [elevenLabs.adapter] : []),",
]);

requireTokens("apps/worker/src/providers.test.ts", [
  "worker provider registry remains empty when the worker is disabled",
  "worker provider registry remains empty when ElevenLabs is disabled",
  "worker provider registry conditionally registers one governed ElevenLabs adapter",
  "worker provider registry rejects incomplete ElevenLabs governance configuration",
]);

requireTokens("apps/worker/src/elevenlabs-runtime.test.ts", [
  "configured ElevenLabs worker preflights models and premade voices before an empty queue stops",
  "missing ElevenLabs secret blocks startup before any provider request or queue claim",
  "remote non-premade voice blocks startup before queue polling",
  "resolveWorkerRuntimeConfiguration",
  "createWorkerProviderRegistry",
  "EnvironmentCredentialResolver",
  "runConfiguredWorkerRuntime",
  "fixture-elevenlabs-runtime-secret",
  "calls.some((url) => url.includes(\"/with-timestamps\"))",
  "WORKER_PROVIDER_CREDENTIAL_MISSING:elevenlabs",
  "ELEVENLABS_REMOTE_NON_STOCK_VOICE_PROHIBITED",
]);

requireTokens("apps/worker/src/main.ts", [
  "const configuration = resolveWorkerRuntimeConfiguration(environment)",
  "const credentialBindings = configuration.enabled ? configuration.credentialBindings : {}",
  "createWorkerProviderRegistry({",
  "workerEnabled: configuration.enabled",
  "environment",
  "credentialBindings",
  "new EnvironmentCredentialResolver",
  "runConfiguredWorkerRuntime",
]);

requireTokens("docs/ELEVENLABS_ADAPTER.md", [
  "Worker boundary",
  "Conditional worker registration",
  "Startup preflight proof",
  "Next production gate",
  "The built-in worker registry remains empty when configuration is absent or invalid",
  "No queue item is claimed merely because an API key exists",
]);

requireTokens("docs/WORKER_RUNTIME.md", [
  "Provider registration",
  "STORYTELLER_ELEVENLABS_ENABLED",
  "complete model, pricing, voice, privacy and credential configuration",
  "remote voice category",
  "before queue polling",
]);

requireTokens(".env.example", [
  "STORYTELLER_WORKER_CREDENTIAL_BINDINGS={}",
  "STORYTELLER_ELEVENLABS_ENABLED=false",
  "STORYTELLER_ELEVENLABS_ADAPTER_VERSION=1.0.0",
  "STORYTELLER_ELEVENLABS_MODEL_POLICIES=[]",
  "STORYTELLER_ELEVENLABS_VOICE_BINDINGS=[]",
  "STORYTELLER_ELEVENLABS_PRONUNCIATION_DICTIONARIES=[]",
  "STORYTELLER_ELEVENLABS_DATA_POLICY={}",
  "STORYTELLER_ELEVENLABS_TEXT_NORMALISATION=auto",
  "STORYTELLER_ELEVENLABS_OUTPUT_BITRATE_KBPS=192",
  "STORYTELLER_ELEVENLABS_ALLOW_V3_PRODUCTION=false",
]);

const providerSource = existsSync(fromRoot("apps/worker/src/elevenlabs-provider.ts"))
  ? read("apps/worker/src/elevenlabs-provider.ts")
  : "";
const disabledIndex = providerSource.indexOf("if (!input.workerEnabled) return null");
const enabledParseIndex = providerSource.indexOf("STORYTELLER_ELEVENLABS_ENABLED");
const adapterIndex = providerSource.indexOf("new ElevenLabsNarrationAdapter(configuration)");
if (
  disabledIndex < 0
  || enabledParseIndex < 0
  || adapterIndex < 0
  || disabledIndex >= enabledParseIndex
  || enabledParseIndex >= adapterIndex
) {
  problems.push("ElevenLabs worker configuration does not fail closed before private parsing and adapter construction");
}

const summaryStart = providerSource.indexOf("function disabledSummary");
if (summaryStart < 0) {
  problems.push("ElevenLabs worker summary boundary is missing");
} else {
  const summarySource = providerSource.slice(summaryStart);
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
    if (summarySource.includes(forbidden)) {
      problems.push(`ElevenLabs worker summary exposes private provider configuration: ${forbidden}`);
    }
  }
}

const providersSource = existsSync(fromRoot("apps/worker/src/providers.ts"))
  ? read("apps/worker/src/providers.ts")
  : "";
if (providersSource.includes("new ElevenLabsNarrationAdapter(")) {
  problems.push("worker provider registry bypasses governed ElevenLabs configuration resolution");
}
if (!providersSource.includes("elevenLabs ? [elevenLabs.adapter] : []")) {
  problems.push("worker provider registry does not remain empty when ElevenLabs is absent");
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const source = read(path);
  for (const forbidden of [
    "ElevenLabsNarrationAdapter",
    "resolveElevenLabsWorkerProvider",
    "createWorkerProviderRegistry",
    "STORYTELLER_ELEVENLABS_",
    "ELEVENLABS_API_KEY",
    "xi-api-key",
    "/v1/text-to-speech",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`${path} exposes ElevenLabs worker configuration or execution: ${forbidden}`);
    }
  }
}

const envSource = existsSync(fromRoot(".env.example")) ? read(".env.example") : "";
if (/NEXT_PUBLIC_[A-Z0-9_]*(?:ELEVENLABS|VOICE|PRICING|PROVIDER|CREDENTIAL|SECRET|TOKEN|KEY)/u.test(envSource)) {
  problems.push("ElevenLabs provider configuration must never use a NEXT_PUBLIC_ variable");
}

if (problems.length > 0) {
  console.error("Storyteller Studio ElevenLabs runtime check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_elevenlabs_runtime_check_passed");
console.log("- the worker and provider remain disabled without explicit configuration");
console.log("- model, pricing, premade voice, privacy and credential records validate before registration");
console.log("- missing secrets and remote non-premade voices fail before queue polling");
console.log("- successful preflight inspects models and voices without invoking synthesis on an empty queue");
console.log("- provider summaries omit credentials, voice identities, pricing sources and dictionary identifiers");
console.log("- normal API and browser runtimes expose no provider configuration or execution capability");
