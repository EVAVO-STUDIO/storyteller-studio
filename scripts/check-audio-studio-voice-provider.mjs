import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing Audio Studio provider file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) problems.push(`${path} is missing Audio Studio contract token: ${token}`);
  }
}

function collectRuntimeFiles(directory, output = []) {
  const absolute = fromRoot(directory);
  if (!existsSync(absolute)) return output;
  for (const name of readdirSync(absolute)) {
    const absolutePath = join(absolute, name);
    const metadata = statSync(absolutePath);
    if (metadata.isDirectory()) collectRuntimeFiles(relative(root, absolutePath), output);
    else if (/\.(?:ts|tsx|js|mjs)$/u.test(name) && !/\.(?:test|spec)\.[^.]+$/u.test(name)) {
      output.push(relative(root, absolutePath).replaceAll("\\", "/"));
    }
  }
  return output;
}

for (const path of [
  "packages/storyteller/src/audio-studio-adapter.ts",
  "packages/storyteller/src/audio-studio-adapter.test.ts",
  "packages/storyteller/src/audio-studio-contracts.ts",
  "packages/storyteller/src/audio-studio-http.ts",
  "packages/storyteller/src/audio-studio-types.ts",
  "packages/storyteller/package.json",
  "apps/worker/src/audio-studio-provider.ts",
  "apps/worker/src/audio-studio-provider.test.ts",
  "apps/worker/src/providers-audio-studio.test.ts",
  "apps/worker/src/providers.ts",
  "docs/AUDIO_STUDIO_VOICE_PROVIDER.md",
  "docs/AUDIO_STUDIO_VOICE_PROVIDER_STATUS.json",
  "examples/audio-studio-worker.env.example",
  "examples/audio-studio-voice-bindings.example.json",
  ".github/workflows/audio-studio-voice-provider.yml",
]) requireFile(path);

requireTokens("packages/storyteller/src/audio-studio-adapter.ts", [
  "AudioStudioVoiceAdapter",
  "verifyAudioStudioBinding(request, binding, this.#now)",
  "readAudioStudioResponseBytes",
  "AUDIO_STUDIO_ENGINE_CORRELATION_MISMATCH",
  "AUDIO_STUDIO_ENGINE_LOCK_EVIDENCE_MISSING",
  "AUDIO_STUDIO_AUDIO_ARTIFACT_AMBIGUOUS",
  "AUDIO_STUDIO_ARTIFACT_TOO_LARGE",
  "humanListeningApproval: false",
  "publicationAuthority: false",
]);
requireTokens("packages/storyteller/src/audio-studio-http.ts", [
  "response.body.getReader()",
  "reader.cancel",
  "AUDIO_STUDIO_CREDENTIAL_INVALID",
  'cache: "no-store"',
  'credentials: "omit"',
  'redirect: "error"',
  'referrerPolicy: "no-referrer"',
]);
requireTokens("packages/storyteller/src/audio-studio-contracts.ts", [
  "AUDIO_STUDIO_CUSTOMER_DATA_TRAINING_FORBIDDEN",
  "AUDIO_STUDIO_CONSENT_POLICY_REQUIRED",
  "AUDIO_STUDIO_LOCAL_RUNTIME_CAPABILITY_REQUIRED",
  "AUDIO_STUDIO_SOURCE_RIGHTS_UNRESOLVED",
  "AUDIO_STUDIO_PERFORMER_CONSENT_REQUIRED",
  "AUDIO_STUDIO_COMMERCIAL_RIGHTS_NOT_AUTHORISED",
]);
requireTokens("apps/worker/src/audio-studio-provider.ts", [
  "AUDIO_STUDIO_CREDENTIAL_BINDING_ID",
  "STORYTELLER_AUDIO_STUDIO_ENABLED",
  "STORYTELLER_AUDIO_STUDIO_BASE_URL",
  "STORYTELLER_AUDIO_STUDIO_VOICE_BINDINGS",
  "AUDIO_STUDIO_WORKER_LOOPBACK_URL_REQUIRED",
  "AUDIO_STUDIO_WORKER_VOICE_BINDING_NOT_FOUND",
  "verifyAudioStudioBinding",
  "localOnly: true",
]);
requireTokens("apps/worker/src/providers.ts", [
  "resolveAudioStudioWorkerProvider",
  "resolveElevenLabsWorkerProvider",
  "audioStudio.adapter",
  "elevenLabs.adapter",
]);
requireTokens("docs/AUDIO_STUDIO_VOICE_PROVIDER.md", [
  "Responsibility boundary",
  "Worker activation",
  "Rights binding",
  "Transport and response hardening",
  "Natural performance rather than monotone TTS",
  "Failure and fallback",
  "Release boundary",
  "files above 100 MB",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./audio-studio-adapter"] !== "./src/audio-studio-adapter.ts") {
    problems.push("storyteller engine does not export the governed Audio Studio adapter");
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const source = read(path);
  for (const forbidden of [
    "EVAVO_VOICE_SERVICE_TOKEN",
    "STORYTELLER_AUDIO_STUDIO_VOICE_BINDINGS",
    "AudioStudioVoiceAdapter",
    "/v1/voice/renders",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`${path} exposes the private local voice boundary: ${forbidden}`);
    }
  }
}

const adapterSource = existsSync(fromRoot("packages/storyteller/src/audio-studio-adapter.ts"))
  ? read("packages/storyteller/src/audio-studio-adapter.ts")
  : "";
for (const forbidden of [
  "GOOGLE_DRIVE_ACCESS_TOKEN",
  "HUGGING_FACE_HUB_TOKEN",
  "magician-audiobook_train.m4a",
  "child_process",
  "exec(",
  "spawn(",
]) {
  if (adapterSource.includes(forbidden)) {
    problems.push(`Audio Studio adapter contains prohibited implementation token: ${forbidden}`);
  }
}

const status = existsSync(fromRoot("docs/AUDIO_STUDIO_VOICE_PROVIDER_STATUS.json"))
  ? JSON.parse(read("docs/AUDIO_STUDIO_VOICE_PROVIDER_STATUS.json"))
  : {};
for (const key of [
  "browserExecutionExposed",
  "publicApiExecutionExposed",
  "sourceRecordingsCommitted",
  "trainingDatasetsCommitted",
  "modelWeightsCommitted",
  "generatedAudioCommitted",
  "credentialsCommitted",
  "humanListeningApprovalGranted",
  "publicReleaseAuthorityGranted",
]) {
  if (status[key] !== false) problems.push(`Audio Studio status must fail closed: ${key}`);
}
if (status.workerRegistrationImplemented !== true) {
  problems.push("Audio Studio status does not confirm worker registration");
}
if (status.localValidation?.focusedTestsPassed < 19) {
  problems.push("Audio Studio status does not retain the focused validation count");
}
if (status.localValidation?.crossLanguageVoiceLabSmokePassed !== true) {
  problems.push("Audio Studio status does not retain cross-language validation evidence");
}

const envExample = existsSync(fromRoot("examples/audio-studio-worker.env.example"))
  ? read("examples/audio-studio-worker.env.example")
  : "";
if (!envExample.includes("<high-entropy-local-token>")) {
  problems.push("Audio Studio environment example is missing the credential placeholder");
}
if (/EVAVO_VOICE_SERVICE_TOKEN=(?!<)[^\r\n]+/u.test(envExample)) {
  problems.push("Audio Studio environment example appears to contain a real service token");
}

if (problems.length > 0) {
  console.error("Storyteller Studio Audio Studio provider check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audio_studio_voice_provider_check_passed");
console.log("- reusable voice execution remains owned by EVAVO Audio Studio");
console.log("- Storyteller worker registration is explicit, credential-bound and loopback-only");
console.log("- JSON and audio response bodies are streamed through explicit byte limits");
console.log("- unresolved rights, unsafe service policy and engine drift fail closed");
console.log("- browser and public API runtimes expose no local voice execution secret");
console.log("- generated audio still requires downstream human review and release authority");
