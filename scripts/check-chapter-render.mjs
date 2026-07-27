import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing chapter-render file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) problems.push(`${path} is missing chapter-render contract token: ${token}`);
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
  "packages/storyteller/src/chapter-render.ts",
  "packages/storyteller/src/chapter-render.test.ts",
  "packages/storyteller/package.json",
  "docs/CHAPTER_RENDERING.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/chapter-render.ts", [
  "CHAPTER_RENDER_SCHEMA_VERSION",
  "ChapterSourceResolver",
  "ChapterRenderRunner",
  "NodeChapterRenderRunner",
  "buildChapterFilterScript",
  "renderChapterAssembly",
  "assertChapterRenderEvidence",
  "chapterRenderPublicView",
  'shell: false',
  '"-filter_complex_script"',
  '"-nostdin"',
  '"SIGKILL"',
  "CHAPTER_RENDER_SOURCE_INTEGRITY_MISMATCH",
  "CHAPTER_RENDER_OUTPUT_MEDIA_INVALID",
  "CHAPTER_RENDER_PROCESS_OUTPUT_TOO_LARGE",
  "CHAPTER_RENDER_FINGERPRINT_MISMATCH",
  "commandFingerprint",
  "filterFingerprint",
]);

requireTokens("packages/storyteller/src/chapter-render.test.ts", [
  "shell-free render evidence binds the exact plan and private sources without exposing paths",
  "filter construction is deterministic and path independent",
  "source integrity mismatch blocks before tool inspection and still disposes the source",
  "invalid media and unsafe runner failures become stable render errors",
  "pre-aborted rendering does not resolve sources or invoke tools",
  "render evidence tampering is detected",
  "FixtureResolver",
  "FixtureRenderRunner",
  "atrim=start=0\\.100000:end=0\\.900000",
  "amix=inputs=2:normalize=0",
]);

requireTokens("docs/CHAPTER_RENDERING.md", [
  "Source resolution",
  "Deterministic edit graph",
  "Shell-free bounded execution",
  "Render evidence",
  "Output validation",
  "Current boundary",
  "does not yet register the chapter master",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./chapter-render"] !== "./src/chapter-render.ts") {
    problems.push("storyteller package does not export ./chapter-render");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/chapter-render.ts"))
  ? read("packages/storyteller/src/chapter-render.ts")
  : "";
for (const forbidden of ["exec(", "execSync(", "shell: true"]) {
  if (source.includes(forbidden)) problems.push(`chapter renderer contains unsafe process execution: ${forbidden}`);
}
const publicStart = source.indexOf("export function chapterRenderPublicView");
if (publicStart < 0) problems.push("chapter render public view is missing");
else {
  const publicSource = source.slice(publicStart);
  for (const forbidden of [
    "sources:",
    "artifactId:",
    "privatePath:",
    "commandFingerprint:",
    "versionLine:",
    "bytes:",
  ]) {
    if (publicSource.includes(forbidden)) {
      problems.push(`chapter render public view exposes private render evidence: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/chapter-render",
    "renderChapterAssembly",
    "NodeChapterRenderRunner",
    "ChapterSourceResolver",
    "filter_complex_script",
  ]) {
    if (runtime.includes(forbidden)) problems.push(`${path} exposes private chapter rendering: ${forbidden}`);
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio chapter render check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_chapter_render_check_passed");
console.log("- private sources are revalidated against immutable assembly snapshots immediately before rendering");
console.log("- the deterministic FFmpeg graph preserves trims, fades, directed gaps and output profile");
console.log("- process execution is shell-free, bounded, abortable and cleans private temporary files");
console.log("- WAV output signature, size and immutable render evidence are required after process success");
console.log("- public projections omit source identities, private paths, filters, raw output and editorial evidence");
console.log("- rendering remains distinct from chapter-master ingestion, engineering reanalysis and release approval");
