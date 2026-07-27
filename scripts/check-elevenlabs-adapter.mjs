import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing ElevenLabs adapter file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing ElevenLabs contract token: ${token}`);
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
  "packages/storyteller/src/elevenlabs-adapter.ts",
  "packages/storyteller/src/elevenlabs-adapter.test.ts",
  "packages/storyteller/package.json",
  "docs/ELEVENLABS_ADAPTER.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/elevenlabs-adapter.ts", [
  "ELEVENLABS_PROVIDER_ID",
  "ELEVENLABS_API_BASE_URL",
  "ElevenLabsPricingSnapshot",
  "ElevenLabsModelPolicy",
  "ElevenLabsVoiceBinding",
  "ElevenLabsPronunciationDictionaryBinding",
  "ElevenLabsDataPolicy",
  "ElevenLabsAdapterConfiguration",
  "createElevenLabsPricingSnapshot",
  "assertElevenLabsPricingSnapshot",
  "compileElevenLabsDirectionSettings",
  "ElevenLabsNarrationAdapter",
  'sourceKind: "premade"',
  "ELEVENLABS_NON_STOCK_VOICE_PROHIBITED",
  "ELEVENLABS_REMOTE_NON_STOCK_VOICE_PROHIBITED",
  "ELEVENLABS_V3_PRODUCTION_NOT_APPROVED",
  "ELEVENLABS_PRICING_EXPIRED",
  "ELEVENLABS_PRICING_FINGERPRINT_INVALID",
  "ELEVENLABS_PREFLIGHT_REQUIRED",
  "ELEVENLABS_ALIGNMENT_TEXT_MISMATCH",
  "ELEVENLABS_AUDIO_WAV_SIGNATURE_INVALID",
  "ELEVENLABS_AUDIO_MP3_SIGNATURE_INVALID",
  "ELEVENLABS_OUTPUT_CONFIGURATION_UNSUPPORTED",
  "ELEVENLABS_PRONUNCIATION_BINDING_REQUIRED",
  "ELEVENLABS_HTTP_",
  'text: request.text',
  '"enable_logging"',
  '"zero-retention-enterprise"',
  '"word-timestamps"',
  '"deterministic-seed"',
  "requestSeed",
  "pronunciation_dictionary_locators",
  "sourceTextPreserved: true",
  'alignmentSource: "original_alignment"',
  "voiceBindingFingerprint",
  "pricingFingerprint",
  "pronunciationBindingFingerprint",
]);

requireTokens("packages/storyteller/src/elevenlabs-adapter.test.ts", [
  "pricing snapshots are immutable, effective and expire explicitly",
  "direction compilation is deterministic and model aware",
  "configuration prohibits cloned voices and unapproved v3 production",
  "preflight verifies configured models and remote premade voice category",
  "preflight rejects a remote clone even when local data is tampered",
  "synthesis preserves source text, uses governed settings and returns exact alignment",
  "policy gates reject unverified, mismatched, unsupported and unbound requests",
  "response validation rejects transcript drift, false media and oversized output",
  "HTTP failures are sanitised and never include provider payloads or credentials",
  "v3 calibration sends only supported stability control and exact prose",
  "fixture-elevenlabs-credential",
  "Aelwyn waited.",
  "maximumInputCharacters: 3_000",
  "oversizedAudio",
]);

requireTokens("docs/ELEVENLABS_ADAPTER.md", [
  "Current scope",
  "Premade voice boundary",
  "Immutable pricing evidence",
  "Exact manuscript text",
  "Deterministic candidates",
  "Pronunciation dictionaries",
  "Provider preflight",
  "Privacy and bounded transport",
  "Audio and alignment verification",
  "Cost and provenance",
  "Worker boundary",
  "Next integration gate",
  "The built-in worker registry must remain empty when configuration is absent or invalid",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./elevenlabs-adapter"] !== "./src/elevenlabs-adapter.ts") {
    problems.push("storyteller package does not export ./elevenlabs-adapter from its governed source module");
  }
}

const adapterSource = existsSync(fromRoot("packages/storyteller/src/elevenlabs-adapter.ts"))
  ? read("packages/storyteller/src/elevenlabs-adapter.ts")
  : "";

for (const forbidden of [
  "console.log",
  "console.error",
  "sound exactly like",
  "impersonate",
  "clone the voice",
]) {
  if (adapterSource.toLocaleLowerCase("en-AU").includes(forbidden)) {
    problems.push(`ElevenLabs adapter contains prohibited operational or impersonation text: ${forbidden}`);
  }
}

const synthesisStart = adapterSource.indexOf("  async synthesise(");
const policyStart = adapterSource.indexOf("  #resolveGenerationPolicy(", synthesisStart);
if (synthesisStart < 0 || policyStart <= synthesisStart) {
  problems.push("ElevenLabs synthesis boundary is missing");
} else {
  const synthesisSource = adapterSource.slice(synthesisStart, policyStart);
  if (!synthesisSource.includes("text: request.text")) {
    problems.push("ElevenLabs synthesis does not pass the immutable request text exactly");
  }
  for (const forbidden of [
    "request.direction.emotionalObjective",
    "request.direction.subtext",
    "request.direction.notes",
    "craftReferences",
    "targetIdentity",
  ]) {
    if (synthesisSource.includes(forbidden)) {
      problems.push(`ElevenLabs provider body exposes non-source direction text: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const source = read(path);
  for (const forbidden of [
    "ElevenLabsNarrationAdapter",
    "elevenlabs-adapter",
    "ELEVENLABS_API_KEY",
    "xi-api-key",
    "/v1/text-to-speech",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`${path} exposes the private ElevenLabs provider boundary: ${forbidden}`);
    }
  }
}

for (const path of [
  ".github/workflows/one-time-elevenlabs-typescript-fix.yml",
  ".github/elevenlabs-typescript-fix.trigger",
  ".github/workflows/one-time-elevenlabs-test-fixture-fix.yml",
  ".github/elevenlabs-test-fixture-fix.trigger",
]) {
  if (existsSync(fromRoot(path))) {
    problems.push(`completed ElevenLabs correction machinery remains in the repository: ${path}`);
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio ElevenLabs adapter check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_elevenlabs_adapter_check_passed");
console.log("- the first provider adapter remains behind the provider-neutral engine contract");
console.log("- only governed premade voices and exact approved revisions are admitted");
console.log("- pricing, model, privacy and pronunciation policy are immutable and expiring");
console.log("- provider input preserves exact manuscript text without injecting direction notes");
console.log("- character alignment and media signatures fail closed before artifact admission");
console.log("- bounded provider errors omit response bodies, credentials and manuscript content");
console.log("- normal API and browser runtimes expose no ElevenLabs execution capability");
