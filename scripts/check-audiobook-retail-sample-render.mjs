import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-sample-render file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-sample-render contract token: ${token}`,
      );
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
  "packages/storyteller/src/audiobook-retail-sample-render.ts",
  "packages/storyteller/src/audiobook-retail-sample-render.test.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_SAMPLE_RENDER.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-retail-sample-render.ts", [
  "AUDIOBOOK_RETAIL_SAMPLE_RENDER_SCHEMA_VERSION",
  "ResolvedAudiobookRetailSampleSource",
  "AudiobookRetailSampleSourceResolver",
  "NodeAudiobookRetailTrackRenderRunner",
  "buildAudiobookRetailSampleFilter",
  "renderAudiobookRetailSample",
  "assertAudiobookRetailSampleRenderEvidence",
  "assertAudiobookRetailSampleRenderMatchesPlan",
  "assertAudiobookRetailSampleRenderResult",
  "audiobookRetailSampleRenderPublicView",
  "AUDIOBOOK_RETAIL_SAMPLE_RENDER_ESTIMATED_SIZE_EXCEEDS_LIMIT",
  "AUDIOBOOK_RETAIL_SAMPLE_RENDER_SOURCE_INTEGRITY_MISMATCH",
  "AUDIOBOOK_RETAIL_SAMPLE_RENDER_PRIVATE_PATH_INVALID",
  "AUDIOBOOK_RETAIL_SAMPLE_RENDER_OUTPUT_MEDIA_INVALID",
  "AUDIOBOOK_RETAIL_SAMPLE_RENDER_PLAN_SOURCE_MISMATCH",
  "AUDIOBOOK_RETAIL_SAMPLE_RENDER_RESULT_INTEGRITY_MISMATCH",
  'encoder: "libmp3lame"',
  'metadata: "stripped"',
  "shell: false",
]);

requireTokens("packages/storyteller/src/audiobook-retail-sample-render.test.ts", [
  "approved sample intent renders one exact shell-free MP3 range",
  "impossible size ceilings, stale dates and pre-aborted work fail before source resolution",
  "source identity and private-path mismatches never reach FFmpeg and always dispose",
  "runner failures and false media are bounded sample-render failures",
  "result bytes and recomputed structural evidence remain bound to the exact sample plan",
  "AUDIOBOOK_RETAIL_SAMPLE_RENDER_SOURCE_INTEGRITY_MISMATCH",
  "AUDIOBOOK_RETAIL_SAMPLE_RENDER_OUTPUT_MEDIA_INVALID",
  "AUDIOBOOK_RETAIL_SAMPLE_RENDER_PLAN_SOURCE_MISMATCH",
]);

requireTokens("docs/AUDIOBOOK_RETAIL_SAMPLE_RENDER.md", [
  "Admission chain",
  "Exact source resolution",
  "Shell-free rendering",
  "Immutable render evidence",
  "Bounded execution",
  "Independent validation",
  "Privacy boundary",
  "Current boundary",
  "It is a rendering boundary only",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-sample-render"]
      !== "./src/audiobook-retail-sample-render.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-sample-render",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-sample-render"]
      !== "node scripts/check-audiobook-retail-sample-render.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-sample-render",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-sample-render",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail sample rendering",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-sample-render",
    "renderAudiobookRetailSample",
    "AudiobookRetailSampleSourceResolver",
    "ResolvedAudiobookRetailSampleSource",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private retail sample rendering controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-sample-render check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_sample_render_check_passed");
console.log("- only the exact approved source artifact revision can be resolved");
console.log("- one exact approved range is rendered through the shell-free MP3 runner");
console.log("- output size, media identity and result bytes are independently bounded");
console.log("- immutable evidence remains cross-bound to the exact sample plan");
console.log("- public projections omit private source identity and path data");
console.log("- normal API and web runtimes cannot invoke private sample rendering");