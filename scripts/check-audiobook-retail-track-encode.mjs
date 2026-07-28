import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-track-encode file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-track-encode contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-track-encode.ts",
  "packages/storyteller/src/audiobook-retail-track-encode.test.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_TRACK_ENCODE.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-retail-track-encode.ts", [
  "AUDIOBOOK_RETAIL_TRACK_ENCODE_SCHEMA_VERSION",
  "ingestAudiobookRetailTrackRender",
  "assertAudiobookRetailTrackEncodeChain",
  "assertAudiobookRetailTrackEncodeMatchesSources",
  "audiobookRetailTrackEncodePublicView",
  'kind: "audiobook-retail-track"',
  'claimedMimeType: "audio/mpeg"',
  'claimedFormat: "mp3"',
  "ingestAudioEngineeringArtifact",
  "assertEvidenceMatchesGenerationPolicy",
  "AUDIOBOOK_RETAIL_TRACK_ENCODE_DURATION_DRIFT",
  "AUDIOBOOK_RETAIL_TRACK_ENCODE_CODEC_MISMATCH",
  "AUDIOBOOK_RETAIL_TRACK_ENCODE_SAMPLE_RATE_MISMATCH",
  "AUDIOBOOK_RETAIL_TRACK_ENCODE_CHANNEL_MISMATCH",
  "AUDIOBOOK_RETAIL_TRACK_ENCODE_BIT_RATE_MISMATCH",
  "AUDIOBOOK_RETAIL_TRACK_ENCODE_ENGINEERING_INELIGIBLE",
  "AUDIOBOOK_RETAIL_TRACK_ENCODE_REFERENCE_MISMATCH",
  "AUDIOBOOK_RETAIL_TRACK_ENCODE_SOURCE_MISMATCH",
  "artifact.audiobook_retail_track_quarantined",
]);

requireTokens("packages/storyteller/src/audiobook-retail-track-encode.test.ts", [
  "verified CBR renders become private retail-track artifacts with independent engineering",
  "failed engineering quarantines only the affected MP3 while retaining verified evidence",
  "duration drift is measured independently and blocks review eligibility",
  "wrong reference scope, expired rights, altered bytes and aborts fail before admission",
  "recomputed structural state cannot replace the approved plan identity",
  "AUDIOBOOK_RETAIL_TRACK_ENCODE_BIT_RATE_MISMATCH",
  "AUDIOBOOK_RETAIL_TRACK_ENCODE_DURATION_DRIFT",
  "AUDIOBOOK_RETAIL_TRACK_ENCODE_SOURCE_MISMATCH",
]);

requireTokens("docs/AUDIOBOOK_RETAIL_TRACK_ENCODE.md", [
  "Evidence chain",
  "Durable private artifacts",
  "Exact source and artifact binding",
  "Independent engineering",
  "Quarantine without evidence loss",
  "Human-review boundary",
  "Tamper resistance",
  "Privacy boundary",
  "Current boundary",
  "It does not approve the listening experience",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-track-encode"]
      !== "./src/audiobook-retail-track-encode.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-track-encode",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-track-encode"]
      !== "node scripts/check-audiobook-retail-track-encode.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-track-encode",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-track-encode",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail track admission",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-track-encode",
    "ingestAudiobookRetailTrackRender",
    "assertAudiobookRetailTrackEncodeMatchesSources",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private retail track admission controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-track-encode check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_track_encode_check_passed");
console.log("- approved reference, plan and render evidence are rebound before admission");
console.log("- every MP3 is stored privately as a governed audiobook-retail-track artifact");
console.log("- every MP3 receives independent engineering evidence");
console.log("- technically failed files are quarantined without deleting evidence");
console.log("- repeated identical admission is idempotent");
console.log("- normal API and web runtimes cannot invoke private admission controls");