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

requireTokens("docs/AUDIO_ENGINEERING.md", [
  "Trust boundary",
  "Independent measurements",
  "Shell-free bounded runner",
  "Versioned delivery profiles",
  "Integrity and redaction",
  "Evidence eligibility",
  "Current boundary",
  "ffprobe",
  "astats",
  "loudnorm",
  "silencedetect",
  "does not yet automatically attach",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./audio-engineering"] !== "./src/audio-engineering.ts") {
    problems.push("storyteller package does not export ./audio-engineering");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/audio-engineering.ts"))
  ? read("packages/storyteller/src/audio-engineering.ts")
  : "";
for (const forbidden of [
  "exec(",
  "execSync(",
  "shell: true",
  "audioPath:",
  "stdout:",
  "stderr:",
]) {
  const evidenceStart = source.indexOf("export interface AudioEngineeringEvidence");
  const evidenceEnd = source.indexOf("export interface AudioEngineeringPublicView");
  if (evidenceStart >= 0 && evidenceEnd > evidenceStart) {
    const evidenceContract = source.slice(evidenceStart, evidenceEnd);
    if (evidenceContract.includes(forbidden)) {
      problems.push(`audio engineering evidence retains forbidden execution material: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audio-engineering",
    "NodeAudioEngineeringRunner",
    "analyseAudioEngineering",
    "FFMPEG_PATH",
    "FFPROBE_PATH",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private audio-engineering execution: ${forbidden}`);
    }
  }
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
console.log("- delivery profiles are versioned and fingerprinted for later release revalidation");
console.log("- evidence omits private paths, raw commands and raw tool output");
console.log("- engineering eligibility remains separate from transcript, performance, rights and release approval");
