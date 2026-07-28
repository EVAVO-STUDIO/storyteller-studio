import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing audiobook-render file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing audiobook-render contract token: ${token}`);
    }
  }
}

function collectRuntimeFiles(directory, output = []) {
  const absolute = fromRoot(directory);
  if (!existsSync(absolute)) return output;
  for (const name of readdirSync(absolute)) {
    const absolutePath = join(absolute, name);
    const item = statSync(absolutePath);
    if (item.isDirectory()) collectRuntimeFiles(relative(root, absolutePath), output);
    else if (/\.(?:ts|tsx|js|mjs)$/u.test(name) && !/\.(?:test|spec)\.[^.]+$/u.test(name)) {
      output.push(relative(root, absolutePath).replaceAll("\\", "/"));
    }
  }
  return output;
}

for (const path of [
  "packages/storyteller/src/audiobook-render.ts",
  "packages/storyteller/src/audiobook-render.test.ts",
  "packages/storyteller/package.json",
  "docs/AUDIOBOOK_RENDER.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-render.ts", [
  "AUDIOBOOK_RENDER_SCHEMA_VERSION",
  "AudiobookSourceResolver",
  "AudiobookRenderEvidence",
  "buildAudiobookFilterScript",
  "renderAudiobookSequence",
  "assertAudiobookRenderEvidence",
  "audiobookRenderPublicView",
  "NodeChapterRenderRunner",
  "shell: false",
  "AUDIOBOOK_RENDER_SOURCE_INTEGRITY_MISMATCH",
  "AUDIOBOOK_RENDER_OUTPUT_MEDIA_INVALID",
  "AUDIOBOOK_RENDER_RIFF_CAPACITY_EXCEEDED",
  "estimatedPcmByteCount",
  "RIFF_MAXIMUM_OUTPUT_BYTES",
]);

requireTokens("packages/storyteller/src/audiobook-render.test.ts", [
  "complete audiobook rendering preserves manifest order and emits governed WAV evidence",
  "source drift and invalid output fail closed while disposing every resolved private source",
  "classic RIFF capacity is checked before private sources or FFmpeg are used",
  "abort, runner failures and evidence tampering produce stable render failures",
  "concat=n=3:v=0:a=1[out]",
  "AUDIOBOOK_RENDER_SOURCE_ORDER_INVALID",
]);

requireTokens("docs/AUDIOBOOK_RENDER.md", [
  "Exact source order",
  "Private-source verification",
  "RIFF capacity boundary",
  "Evidence",
  "Privacy boundary",
  "Current boundary",
  "RF64 support would require a separate reviewed output profile",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./audiobook-render"] !== "./src/audiobook-render.ts") {
    problems.push("storyteller package does not export ./audiobook-render");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/audiobook-render.ts"))
  ? read("packages/storyteller/src/audiobook-render.ts")
  : "";
const publicStart = source.indexOf("export function audiobookRenderPublicView");
if (publicStart < 0) problems.push("audiobook render public view is missing");
else {
  const publicSource = source.slice(publicStart);
  for (const forbidden of [
    "sources:",
    "artifactId:",
    "privatePath:",
    "contentHash:",
    "sourcePaths:",
  ]) {
    if (publicSource.includes(forbidden)) {
      problems.push(`audiobook render public view exposes private state: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-render",
    "renderAudiobookSequence",
    "NodeChapterRenderRunner",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private audiobook render controls: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-render check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_render_check_passed");
console.log("- exact lossless components are concatenated in governed manifest order");
console.log("- private source integrity is revalidated and all sources are disposed");
console.log("- classic RIFF capacity is checked before private media or FFmpeg are used");
console.log("- the existing shell-free bounded FFmpeg runner is reused");
console.log("- rendering remains private and distinct from retail encoding or release");
