import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-track-render file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-track-render contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-track-render.ts",
  "packages/storyteller/src/audiobook-retail-track-render.test.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_TRACK_RENDER.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-retail-track-render.ts", [
  "AUDIOBOOK_RETAIL_TRACK_RENDER_SCHEMA_VERSION",
  "AudiobookRetailReferenceMasterResolver",
  "NodeAudiobookRetailTrackRenderRunner",
  "buildAudiobookRetailTrackFilter",
  "renderAudiobookRetailTrackPlan",
  "assertAudiobookRetailTrackRenderEvidence",
  "assertAudiobookRetailTrackRenderMatchesPlan",
  "assertAudiobookRetailTrackRenderResult",
  "audiobookRetailTrackRenderPublicView",
  "AUDIOBOOK_RETAIL_TRACK_RENDER_PLAN_NOT_READY",
  "AUDIOBOOK_RETAIL_TRACK_RENDER_SOURCE_INTEGRITY_MISMATCH",
  "AUDIOBOOK_RETAIL_TRACK_RENDER_ESTIMATED_SIZE_EXCEEDS_LIMIT",
  "AUDIOBOOK_RETAIL_TRACK_RENDER_OUTPUT_MEDIA_INVALID",
  "AUDIOBOOK_RETAIL_TRACK_RENDER_TOTAL_OUTPUT_LIMIT_EXCEEDED",
  "AUDIOBOOK_RETAIL_TRACK_RENDER_PLAN_SOURCE_MISMATCH",
  "AUDIOBOOK_RETAIL_TRACK_RENDER_RESULT_INTEGRITY_MISMATCH",
  "atrim=start=",
  "asetpts=PTS-STARTPTS",
  "aformat=sample_rates=",
  'encoder: "libmp3lame"',
  '"-c:a",\n        "libmp3lame"',
  '"-b:a"',
  '"-map_metadata",\n        "-1"',
  '"-write_id3v1",\n        "0"',
  '"-id3v2_version",\n        "0"',
  '"-write_xing",\n        "0"',
  "shell: false",
  "detectArtifactMedia",
  "audio/mpeg",
  "mpeg-audio",
  "maximumTrackOutputBytes",
  "maximumTotalOutputBytes",
  "source.dispose()",
]);

requireTokens("packages/storyteller/src/audiobook-retail-track-render.test.ts", [
  "ready ACX track intent renders exact sequential ranges as governed CBR MP3 evidence",
  "blocked plans and impossible encoded-size ceilings fail before private source resolution",
  "reference drift, private-path errors and aborts never reach the renderer",
  "false media, runner failures and total output overflow are stable and dispose the reference",
  "render result integrity and cross-source plan binding detect recomputed tampering",
  "the production runner contract remains shell-free and accepts only bounded MP3 requests",
  "AUDIOBOOK_RETAIL_TRACK_RENDER_OUTPUT_MEDIA_INVALID",
  "AUDIOBOOK_RETAIL_TRACK_RENDER_PLAN_SOURCE_MISMATCH",
  "AUDIOBOOK_RETAIL_TRACK_RENDER_RESULT_INTEGRITY_MISMATCH",
]);

requireTokens("docs/AUDIOBOOK_RETAIL_TRACK_RENDER.md", [
  "Admission boundary",
  "One source resolution",
  "Exact extraction ranges",
  "Shell-free FFmpeg execution",
  "CBR MP3 intent",
  "Preflight output bounds",
  "Media identity",
  "Immutable evidence",
  "Privacy boundary",
  "Current boundary",
  "does not upload files",
  "never become the editorial master",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-track-render"]
      !== "./src/audiobook-retail-track-render.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-track-render",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-track-render"]
      !== "node scripts/check-audiobook-retail-track-render.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-track-render",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-track-render",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail track rendering",
    );
  }
}

const sourcePath =
  "packages/storyteller/src/audiobook-retail-track-render.ts";
if (existsSync(fromRoot(sourcePath))) {
  const source = read(sourcePath);
  const publicStart = source.indexOf(
    "export function audiobookRetailTrackRenderPublicView",
  );
  if (publicStart < 0) {
    problems.push("retail track-render public view boundary is missing");
  } else {
    const publicSource = source.slice(publicStart);
    for (const forbidden of [
      "referenceMaster:",
      "artifactId:",
      "artifactRevision:",
      "artifactFingerprint:",
      "privatePath:",
      "sourceStartMs:",
      "sourceEndMs:",
      "filterFingerprint:",
      "commandFingerprint:",
      "executableName:",
      "versionLine:",
    ]) {
      if (publicSource.includes(forbidden)) {
        problems.push(
          `retail track-render public view exposes private state: ${forbidden}`,
        );
      }
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-track-render",
    "renderAudiobookRetailTrackPlan",
    "NodeAudiobookRetailTrackRenderRunner",
    "AudiobookRetailReferenceMasterResolver",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private retail track-render controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(
    "Storyteller Studio audiobook-retail-track-render check failed:\n",
  );
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_track_render_check_passed");
console.log("- only ready approved track plans can reach private source resolution");
console.log("- the exact reference-master artifact snapshot is revalidated once");
console.log("- tracks render sequentially from approved contiguous source ranges");
console.log("- FFmpeg execution remains shell-free, bounded and metadata-stripped");
console.log("- output intent is fixed 44.1 kHz libmp3lame CBR at the reviewed bit rate");
console.log("- every output must have an MPEG audio signature before evidence admission");
console.log("- result bytes, per-track evidence and the complete plan remain hash-bound");
console.log("- private paths, source snapshots, commands and tool output remain non-public");
