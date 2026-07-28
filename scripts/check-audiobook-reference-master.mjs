import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-reference-master file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-reference-master contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-reference-master.ts",
  "packages/storyteller/src/audiobook-reference-master.test.ts",
  "packages/storyteller/package.json",
  "docs/AUDIOBOOK_REFERENCE_MASTER.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-reference-master.ts", [
  "AUDIOBOOK_REFERENCE_MASTER_SCHEMA_VERSION",
  "ingestAudiobookReferenceMaster",
  "assertAudiobookReferenceMasterChain",
  "audiobookReferenceMasterPublicView",
  'kind: "audiobook-reference-master"',
  "audiobook-sequence-schema",
  "audiobook-render-evidence-schema",
  "ingestAudioEngineeringArtifact",
  "assertEvidenceMatchesGenerationPolicy",
  "AUDIOBOOK_REFERENCE_MASTER_ENGINEERING_INELIGIBLE",
  "AUDIOBOOK_REFERENCE_MASTER_DURATION_DRIFT",
  "AUDIOBOOK_REFERENCE_MASTER_EVIDENCE_CHAIN_MISMATCH",
  "AUDIOBOOK_REFERENCE_MASTER_FINGERPRINT_INVALID",
]);

requireTokens("packages/storyteller/src/audiobook-reference-master.test.ts", [
  "eligible complete-book render creates a governed reference master and evidence graph",
  "independent engineering failure quarantines the WAV while retaining evidence",
  "duration drift is a separate complete-book quarantine gate",
  "identical retries reuse the exact four-artifact reference chain",
  "scope, rights, bytes, tolerance and abort failures occur before artifact admission",
  "semantic artifact-chain tampering is rejected even when hashes are recomputed",
  "AUDIOBOOK_REFERENCE_MASTER_EVIDENCE_CHAIN_MISMATCH",
]);

requireTokens("docs/AUDIOBOOK_REFERENCE_MASTER.md", [
  "Evidence graph",
  "Independent engineering",
  "Quarantine rather than overwrite",
  "Human review boundary",
  "Idempotency",
  "Privacy boundary",
  "Current boundary",
  "not a released retail audiobook",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-reference-master"]
      !== "./src/audiobook-reference-master.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-reference-master",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-reference-master"]
      !== "node scripts/check-audiobook-reference-master.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-reference-master",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-reference-master",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook reference masters",
    );
  }
}

const source = existsSync(
  fromRoot("packages/storyteller/src/audiobook-reference-master.ts"),
)
  ? read("packages/storyteller/src/audiobook-reference-master.ts")
  : "";
const publicStart = source.indexOf(
  "export function audiobookReferenceMasterPublicView",
);
if (publicStart < 0) {
  problems.push("audiobook reference-master public view is missing");
} else {
  const publicSource = source.slice(publicStart);
  for (const forbidden of [
    "objectKey",
    "container",
    "versionId",
    "rightsEvidenceId",
    "actorId",
    "verifierActorId",
    "parentArtifactIds",
    "sourceReference",
    "commandFingerprints",
  ]) {
    if (publicSource.includes(forbidden)) {
      problems.push(
        `audiobook reference-master public view exposes private state: ${forbidden}`,
      );
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-reference-master",
    "ingestAudiobookReferenceMaster",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private reference-master controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(
    "Storyteller Studio audiobook-reference-master check failed:\n",
  );
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_reference_master_check_passed");
console.log("- complete-book WAV bytes remain private and content-addressed");
console.log("- sequence, render and engineering evidence form one immutable graph");
console.log("- engineering or duration failure quarantines rather than overwrites");
console.log("- retry identity remains stable across the four-artifact chain");
console.log("- human review remains mandatory before retail encoding or release");
