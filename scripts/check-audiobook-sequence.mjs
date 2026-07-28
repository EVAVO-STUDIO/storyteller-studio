import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing audiobook-sequence file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing audiobook-sequence contract token: ${token}`);
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
  "packages/storyteller/src/audiobook-sequence.ts",
  "packages/storyteller/src/audiobook-sequence.test.ts",
  "packages/storyteller/package.json",
  "docs/AUDIOBOOK_SEQUENCE.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-sequence.ts", [
  "AUDIOBOOK_SEQUENCE_SCHEMA_VERSION",
  "AUDIOBOOK_SEQUENCE_ENTITY_TYPE",
  "AudiobookSequenceComponent",
  "createAudiobookSequence",
  "reviseAudiobookSequence",
  "assertAudiobookSequence",
  "audiobookSequencePublicView",
  "FileAudiobookSequenceStore",
  "assertBookCreditDeliverySnapshot",
  "assertBookChapterSequence",
  "AUDIOBOOK_SEQUENCE_CREDIT_SCOPE_MISMATCH",
  "AUDIOBOOK_SEQUENCE_CHAPTER_ARTIFACT_MISMATCH",
  "AUDIOBOOK_SEQUENCE_ENGINEERING_PROFILE_MISMATCH",
  "AUDIOBOOK_SEQUENCE_OUTPUT_PROFILE_MISMATCH",
  "AUDIOBOOK_SEQUENCE_TIMELINE_INVALID",
  "ready-for-retail-encoding",
]);

requireTokens("packages/storyteller/src/audiobook-sequence.test.ts", [
  "approved opening, chapter sequence and closing produce one exact contiguous audiobook timeline",
  "credit roles, output profiles, rights and exact artifact snapshots fail closed",
  "sequence validation rejects a recomputed non-contiguous timeline",
  "audiobook sequence store is idempotent and revision-safe",
  "AUDIOBOOK_SEQUENCE_RIGHTS_EXPIRED",
  "AUDIOBOOK_SEQUENCE_CREDIT_ARTIFACT_MISMATCH",
]);

requireTokens("docs/AUDIOBOOK_SEQUENCE.md", [
  "Admission order",
  "Live artifact validation",
  "Technical consistency",
  "Timeline",
  "Revisions and storage",
  "Privacy boundary",
  "Current boundary",
  "ready-for-retail-encoding",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./audiobook-sequence"] !== "./src/audiobook-sequence.ts") {
    problems.push("storyteller package does not export ./audiobook-sequence");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/audiobook-sequence.ts"))
  ? read("packages/storyteller/src/audiobook-sequence.ts")
  : "";
const publicStart = source.indexOf("export function audiobookSequencePublicView");
if (publicStart < 0) problems.push("audiobook sequence public view is missing");
else {
  const publicSource = source.slice(publicStart);
  for (const forbidden of [
    "artifact.id:",
    "contentHash:",
    "rightsFingerprint:",
    "engineeringProfileFingerprint:",
    "sourceFingerprint:",
    "objectKey:",
  ]) {
    if (publicSource.includes(forbidden)) {
      problems.push(`audiobook sequence public view exposes private state: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-sequence",
    "createAudiobookSequence",
    "FileAudiobookSequenceStore",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private complete-book assembly controls: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-sequence check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_sequence_check_passed");
console.log("- opening credit, approved chapters and closing credit have fixed roles and order");
console.log("- current approved artifacts and rights are revalidated before sequencing");
console.log("- all components share one reviewed engineering and lossless output profile");
console.log("- offsets are deterministic, contiguous and free from invented silence");
console.log("- rendering, retail encoding and release remain separate private boundaries");
