import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-sample file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-sample contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-sample.ts",
  "packages/storyteller/src/audiobook-retail-sample.test.ts",
  "packages/storyteller/src/artifact-registry.ts",
  "packages/storyteller/src/artifact-registry.test.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_SAMPLE.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-retail-sample.ts", [
  "AUDIOBOOK_RETAIL_SAMPLE_SCHEMA_VERSION",
  "ingestAudiobookRetailSample",
  "assertAudiobookRetailSampleChain",
  "assertAudiobookRetailSampleMatchesSources",
  "audiobookRetailSamplePublicView",
  'kind: "audiobook-retail-sample"',
  'claimedMimeType: "audio/mpeg"',
  'claimedFormat: "mp3"',
  "ingestAudioEngineeringArtifact",
  "assertEvidenceMatchesGenerationPolicy",
  "AUDIOBOOK_RETAIL_SAMPLE_DURATION_DRIFT",
  "AUDIOBOOK_RETAIL_SAMPLE_CODEC_MISMATCH",
  "AUDIOBOOK_RETAIL_SAMPLE_SAMPLE_RATE_MISMATCH",
  "AUDIOBOOK_RETAIL_SAMPLE_CHANNEL_MISMATCH",
  "AUDIOBOOK_RETAIL_SAMPLE_BIT_RATE_MISMATCH",
  "AUDIOBOOK_RETAIL_SAMPLE_ENGINEERING_INELIGIBLE",
  "AUDIOBOOK_RETAIL_SAMPLE_APPROVED_SOURCE_MISMATCH",
  "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_MISMATCH",
  "artifact.audiobook_retail_sample_quarantined",
]);

requireTokens("packages/storyteller/src/audiobook-retail-sample.test.ts", [
  "rendered retail sample becomes a private MP3 with independent engineering",
  "failed technical engineering quarantines the sample and preserves analysis",
  "independent duration drift blocks review eligibility",
  "wrong source, expired rights, altered bytes and aborts fail before admission",
  "recomputed structural state cannot replace the approved sample plan",
  "AUDIOBOOK_RETAIL_SAMPLE_BIT_RATE_MISMATCH",
  "AUDIOBOOK_RETAIL_SAMPLE_DURATION_DRIFT",
  "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_MISMATCH",
]);

requireTokens("packages/storyteller/src/artifact-registry.ts", [
  '"audiobook-retail-sample"',
  "ARTIFACT_RETAIL_SAMPLE_MP3_REQUIRED",
]);

requireTokens("packages/storyteller/src/artifact-registry.test.ts", [
  "audiobook retail samples require MP3 integrity, parent provenance and human review",
]);

requireTokens("docs/AUDIOBOOK_RETAIL_SAMPLE.md", [
  "Evidence graph",
  "Admission requirements",
  "Independent engineering",
  "Quarantine without evidence loss",
  "Immutable relationships",
  "Privacy boundary",
  "Current boundary",
  "It does not approve the listening experience",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-sample"]
      !== "./src/audiobook-retail-sample.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-sample",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-sample"]
      !== "node scripts/check-audiobook-retail-sample.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-sample",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-sample",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail sample admission",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-sample",
    "ingestAudiobookRetailSample",
    "assertAudiobookRetailSampleMatchesSources",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private retail sample admission controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-sample check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_sample_check_passed");
console.log("- plan, render and approved source evidence are rebound before admission");
console.log("- the rendered preview is stored as a private governed sample artifact");
console.log("- the actual sample MP3 receives independent engineering evidence");
console.log("- failed samples are quarantined without deleting their diagnostics");
console.log("- repeated identical admission is idempotent");
console.log("- normal API and web runtimes cannot invoke private admission controls");