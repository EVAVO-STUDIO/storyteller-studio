import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing ElevenLabs CLI file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing ElevenLabs CLI token: ${token}`);
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
  "packages/cli/src/elevenlabs-config.ts",
  "packages/cli/src/elevenlabs-config.test.ts",
  "packages/cli/src/elevenlabs-cli.test.ts",
  "packages/cli/src/main.ts",
  "docs/ELEVENLABS_CONFIGURATION_CLI.md",
]) requireFile(path);

requireTokens("packages/cli/src/elevenlabs-config.ts", [
  "ElevenLabsConfigurationDocument",
  "CreateElevenLabsPricingInput",
  "ElevenLabsConfigurationSummary",
  "createElevenLabsPricingForConfiguration",
  "validateElevenLabsConfigurationDocument",
  "CLI_ELEVENLABS_CONFIGURATION_OBJECT_REQUIRED",
  "CLI_ELEVENLABS_ADAPTER_VERSION_REQUIRED",
  "CLI_ELEVENLABS_MODEL_POLICIES_REQUIRED",
  "CLI_ELEVENLABS_VOICE_BINDINGS_REQUIRED",
  "CLI_ELEVENLABS_DATA_POLICY_REQUIRED",
  "CLI_ELEVENLABS_NETWORK_PROHIBITED",
  "new ElevenLabsNarrationAdapter",
  "networkProhibitedFetch",
  "configurationFingerprint",
  "allVoiceBindingsPremade",
  "commercialVoiceBindingCount",
]);

requireTokens("packages/cli/src/elevenlabs-config.test.ts", [
  "pricing authoring creates an immutable deterministic snapshot",
  "offline configuration validation returns a redacted deterministic summary",
  "configuration fingerprint changes when governed production intent changes",
  "offline validation rejects expired pricing and non-premade voice sources",
  "malformed configuration documents fail with bounded CLI errors",
  "offline validation performs no provider network request",
]);

requireTokens("packages/cli/src/main.ts", [
  'case "elevenlabs-pricing"',
  'case "elevenlabs-validate"',
  "createElevenLabsPricingForConfiguration",
  "validateElevenLabsConfigurationDocument",
  "CLI_FLAG_REQUIRED:micros-per-thousand",
  "CLI_FLAG_INTEGER_INVALID:micros-per-thousand",
  'stringFlag(args, "source-reference", true)',
  'dateFlag(args, "validation-at")',
  "elevenlabs-pricing",
  "elevenlabs-validate",
]);

requireTokens("packages/cli/src/elevenlabs-cli.test.ts", [
  "CLI creates pricing snapshots and validates a complete redacted configuration",
  "pricing command requires an integer micro-unit rate and protects existing output",
  "validation command rejects non-premade voice configuration offline",
  "CLI_OUTPUT_EXISTS",
  "CLI_FLAG_INTEGER_INVALID:micros-per-thousand",
  "ELEVENLABS_NON_STOCK_VOICE_PROHIBITED",
]);

requireTokens("docs/ELEVENLABS_CONFIGURATION_CLI.md", [
  "Pricing snapshots",
  "Complete configuration validation",
  "Redacted summary",
  "Output safety",
  "Failure behaviour",
  "Relationship to worker startup",
  "network-prohibited transport",
  "does not enable the worker",
  "does not weaken provider preflight",
]);

const configSource = existsSync(fromRoot("packages/cli/src/elevenlabs-config.ts"))
  ? read("packages/cli/src/elevenlabs-config.ts")
  : "";
for (const forbidden of [
  "process.env",
  "ELEVENLABS_API_KEY",
  "xi-api-key",
  "/v1/text-to-speech",
  "console.log",
  "console.error",
]) {
  if (configSource.includes(forbidden)) {
    problems.push(`offline ElevenLabs configuration tooling contains forbidden provider operation: ${forbidden}`);
  }
}
if (!configSource.includes("throw new Error(\"CLI_ELEVENLABS_NETWORK_PROHIBITED\")")) {
  problems.push("offline configuration validation does not install a network-prohibited transport");
}

const summaryStart = configSource.indexOf("  return Object.freeze({", configSource.indexOf("validateElevenLabsConfigurationDocument"));
if (summaryStart < 0) {
  problems.push("offline ElevenLabs configuration summary boundary is missing");
} else {
  const summarySource = configSource.slice(summaryStart);
  for (const forbidden of [
    "voiceId:",
    "voiceProfileId:",
    "licenceEvidenceId:",
    "pronunciationDictionaryId:",
    "versionId:",
    "sourceReference:",
    "microsPerThousandCharacters:",
    "credential",
  ]) {
    if (summarySource.includes(forbidden)) {
      problems.push(`offline ElevenLabs summary exposes private configuration: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const source = read(path);
  for (const forbidden of [
    "elevenlabs-config",
    "createElevenLabsPricingForConfiguration",
    "validateElevenLabsConfigurationDocument",
    "elevenlabs-pricing",
    "elevenlabs-validate",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`${path} exposes offline provider configuration tooling through a normal application surface: ${forbidden}`);
    }
  }
}

for (const path of [
  ".github/workflows/one-time-elevenlabs-cli-integration.yml",
  ".github/elevenlabs-cli-integration.trigger",
]) {
  if (existsSync(fromRoot(path))) {
    problems.push(`completed ElevenLabs CLI integration machinery remains in the repository: ${path}`);
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio ElevenLabs CLI check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_elevenlabs_cli_check_passed");
console.log("- pricing fingerprints are created from explicit expiring evidence");
console.log("- complete provider configuration validates through the production adapter constructor offline");
console.log("- configuration summaries omit provider voice, licence, dictionary, source-rate and credential identity");
console.log("- output files are non-destructive unless force is explicit");
console.log("- malformed, expired and non-premade configuration fails before deployment");
console.log("- API and browser runtimes expose no provider configuration authoring surface");
