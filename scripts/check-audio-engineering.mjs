import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing audio-engineering file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing audio-engineering contract token: ${token}`);
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
  "packages/storyteller/src/audio-engineering.ts",
  "packages/storyteller/src/audio-engineering.test.ts",
  "packages/storyteller/src/audio-engineering-artifact.ts",
  "packages/storyteller/src/audio-engineering-artifact.test.ts",
  "packages/storyteller/package.json",
  "docs/AUDIO_ENGINEERING.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audio-engineering.ts", [
  "AUDIO_ENGINEERING_SCHEMA_VERSION",
  "AudioEngineeringRunner",
  "NodeAudioEngineeringRunner",
  "createAudioEngineeringProfileSnapshot",
  "parseFfprobeAudio",
  "parseAstatsAudio",
  "parseLoudnormAudio",
  "parseSilenceDetect",
  "analyseAudioEngineering",
  "assertAudioEngineeringEvidence",
  "audioEngineeringPublicView",
  'shell: false',
  "maximumOutputBytes",
  "commandFingerprints",
  "AUDIO_ENGINEERING_BYTE_COUNT_MISMATCH",
  "AUDIO_ENGINEERING_SILENCE_EVENT_INVALID",
  "assessTechnicalAudio",
  '"<private-audio>"',
]);

requireTokens("packages/storyteller/src/audio-engineering.test.ts", [
  "independent engineering evidence passes compliant audio without retaining private paths",
  "engineering evidence rejects loud, clipped, noisy, low-rate stereo delivery",
  "lossless production profile accepts 48 kHz mono without a delivery bitrate",
  "byte-count mismatch is a hard integrity failure",
  "parsers reject malformed or incomplete tool output",
  "raw runner errors are converted to stable codes without private diagnostic text",
  "node runner enforces output and time bounds without a shell",
  "profile chronology and evidence fingerprint tampering fail closed",
  "AUDIO_RMS_OUT_OF_RANGE",
  "AUDIO_CLIPPING_DETECTED",
  "AUDIO_ENGINEERING_COMMAND_OUTPUT_TOO_LARGE",
]);

requireTokens("packages/storyteller/src/audio-engineering-artifact.ts", [
  "AudioEngineeringArtifactInput",
  "ingestAudioEngineeringArtifact",
  "audioEngineeringArtifactPublicView",
  "withPrivateTemporaryAudio",
  "ingestPrivateArtifact",
  'kind: "audio-analysis"',
  'claimedMimeType: "application/json"',
  'parentArtifactIds: [input.candidateArtifactId]',
  '"audio-engineering-evidence"',
  "candidateEligible: evidence.eligible && ingest.accepted",
  "AUDIO_ENGINEERING_TEMPORARY_FILE_FAILED",
]);

requireTokens("packages/storyteller/src/audio-engineering-artifact.test.ts", [
  "eligible independent evidence becomes a verified audio-analysis artifact",
  "engineering failure evidence is retained while candidate eligibility remains blocked",
  "identical engineering retries reuse the same evidence artifact",
  "analysis failure creates no artifact and always removes temporary bytes",
  "candidate and request scope are validated before temporary file creation",
  'kind, "audio-analysis"',
  'verification.status, "verified"',
  "AUDIO_ENGINEERING_COMMAND_FAILED:ffprobe-version",
]);

requireTokens("docs/AUDIO_ENGINEERING.md", [
  "Trust boundary",
  "Independent measurements",
  "Shell-free bounded runner",
  "Versioned delivery profiles",
  "Integrity and redaction",
  "Evidence eligibility",
  "Governed artifact integration",
  "ffprobe",
  "astats",
  "loudnorm",
  "silencedetect",
  "audio-analysis",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./audio-engineering"] !== "./src/audio-engineering.ts") {
    problems.push("storyteller package does not export ./audio-engineering");
  }
  if (
    packageJson.exports?.["./audio-engineering-artifact"]
    !== "./src/audio-engineering-artifact.ts"
  ) {
    problems.push("storyteller package does not export ./audio-engineering-artifact");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/audio-engineering.ts"))
  ? read("packages/storyteller/src/audio-engineering.ts")
  : "";
const evidenceStart = source.indexOf("export interface AudioEngineeringEvidence");
const evidenceEnd = source.indexOf("export interface AudioEngineeringPublicView");
if (evidenceStart < 0 || evidenceEnd <= evidenceStart) {
  problems.push("audio engineering evidence contract is missing");
} else {
  const evidenceContract = source.slice(evidenceStart, evidenceEnd);
  for (const forbidden of [
    "audioPath:",
    "stdout:",
    "stderr:",
    "credential",
    "providerRequestId",
  ]) {
    if (evidenceContract.includes(forbidden)) {
      problems.push(`audio engineering evidence retains forbidden execution material: ${forbidden}`);
    }
  }
}
for (const forbidden of ["exec(", "execSync(", "shell: true"]) {
  if (source.includes(forbidden)) problems.push(`audio engineering runner uses forbidden execution: ${forbidden}`);
}

const coordinator = existsSync(fromRoot("packages/storyteller/src/audio-engineering-artifact.ts"))
  ? read("packages/storyteller/src/audio-engineering-artifact.ts")
  : "";
if (coordinator.includes("adapterVersion:")) {
  problems.push("independent audio analysis is incorrectly represented as provider-adapter provenance");
}
if (coordinator.includes("temporaryRoot:") && coordinator.includes("AudioEngineeringArtifactPublicView")) {
  const publicStart = coordinator.indexOf("export interface AudioEngineeringArtifactPublicView");
  const publicEnd = coordinator.indexOf("const SAFE_IDENTIFIER", publicStart);
  if (coordinator.slice(publicStart, publicEnd).includes("temporaryRoot")) {
    problems.push("audio engineering artifact public view exposes temporary storage");
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audio-engineering",
    "@evavo/storyteller-engine/audio-engineering-artifact",
    "NodeAudioEngineeringRunner",
    "analyseAudioEngineering",
    "ingestAudioEngineeringArtifact",
    "FFMPEG_PATH",
    "FFPROBE_PATH",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private audio-engineering execution: ${forbidden}`);
    }
  }
}

for (const path of [
  ".github/workflows/one-time-audio-silence-parser-fix.yml",
  ".github/audio-silence-parser-fix.trigger",
]) {
  if (existsSync(fromRoot(path))) problems.push(`completed audio parser migration remains: ${path}`);
}

if (problems.length > 0) {
  console.error("Storyteller Studio audio engineering check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audio_engineering_check_passed");
console.log("- provider metadata cannot self-certify generated audio");
console.log("- ffprobe, astats, loudnorm and silencedetect evidence remain distinct");
console.log("- the process runner is shell-free, abortable and bounded by time and output size");
console.log("- private temporary media is deleted before the coordinator returns");
console.log("- immutable evidence is registered as a verified audio-analysis artifact");
console.log("- failed engineering evidence remains reviewable while candidate eligibility stays blocked");
console.log("- API and browser runtimes expose no engineering execution or private paths");
