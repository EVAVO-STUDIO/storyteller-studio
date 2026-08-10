import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const problems = [];
const read = (path) => readFileSync(resolve(root, path), "utf8");

function requireFile(path) {
  if (!existsSync(resolve(root, path))) problems.push(`missing narrator production file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(resolve(root, path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) problems.push(`${path} is missing narrator production token: ${token}`);
  }
}

for (const path of [
  "packages/storyteller/src/narrator-voice-profile.ts",
  "packages/storyteller/src/narrator-production-job.ts",
  "packages/storyteller/src/narrator-production-job.test.ts",
  "packages/storyteller/src/narrator-production-queue.ts",
  "packages/storyteller/src/narrator-production-queue.test.ts",
  "packages/storyteller/src/narrator-production-worker.ts",
  "packages/storyteller/src/narrator-production-worker.test.ts",
  "packages/storyteller/src/narration-production-policy.ts",
  "packages/cli/src/narrator-production.ts",
  "packages/cli/src/narrator-production.test.ts",
  "apps/api/src/queue-runtime.ts",
  "packages/storyteller/package.json",
  "packages/cli/package.json",
]) requireFile(path);

requireTokens("packages/storyteller/src/narrator-production-job.ts", [
  "STORYTELLER_NARRATOR_PRODUCTION_JOB_SCHEMA",
  "narratorCastingFingerprint",
  "narratorVoice",
  "createNarratorProductionJobs",
  "assertPinnedProductionMaterial",
  "castingFingerprint: casting.fingerprint",
  "voice: casting.voice",
  "NARRATOR_PRODUCTION_CASTING_REQUIRED",
  "NARRATOR_PRODUCTION_PROFILE_HASH_REQUIRED",
]);
requireTokens("packages/storyteller/src/narrator-production-queue.ts", [
  "enqueueNarratorProduction",
  "assertNarratorProductionClaim",
  "createNarratorProductionJobs",
  "assertPinnedProductionMaterial",
]);
requireTokens("packages/storyteller/src/narrator-production-worker.ts", [
  "assertNarratorProductionClaim",
  "runClaimedGenerationWorker",
  "casting: NarratorCastingApproval",
]);
requireTokens("packages/storyteller/src/narration-production-policy.ts", [
  "assertPinnedProductionMaterial",
  "narratorProductionBinding",
  "material.voiceProfileHash !== undefined",
  "NARRATOR_PRODUCTION_VOICE_PIN_REQUIRED",
]);
requireTokens("packages/cli/src/narrator-production.ts", [
  'command: "jobs" | "queue"',
  "NARRATOR_PRODUCTION_CASTING_REQUIRED",
  "assertNarratorCasting(casting)",
  "createNarratorProductionJobs",
  "enqueueNarratorProduction",
]);

if (existsSync(resolve(root, "packages/storyteller/package.json"))) {
  const pkg = JSON.parse(read("packages/storyteller/package.json"));
  for (const [key, value] of [
    ["./narrator-production-job", "./src/narrator-production-job.ts"],
    ["./narrator-production-queue", "./src/narrator-production-queue.ts"],
    ["./narrator-production-worker", "./src/narrator-production-worker.ts"],
  ]) {
    if (pkg.exports?.[key] !== value) problems.push(`storyteller package export is missing or changed: ${key}`);
  }
}
if (existsSync(resolve(root, "packages/cli/package.json"))) {
  const pkg = JSON.parse(read("packages/cli/package.json"));
  if (pkg.scripts?.["narrator-production"] !== "tsx src/narrator-production.ts") {
    problems.push("CLI narrator-production script is missing or changed");
  }
}

if (existsSync(resolve(root, "apps/api/src/queue-runtime.ts"))) {
  const source = read("apps/api/src/queue-runtime.ts");
  const start = source.indexOf("export function generationQueuePublicView");
  if (start < 0) {
    problems.push("generation queue public view boundary is missing");
  } else {
    const view = source.slice(start);
    for (const forbidden of [
      "job: item.job",
      "narratorVoice",
      "narratorCastingFingerprint",
      "voiceProfileHash",
    ]) {
      if (view.includes(forbidden)) problems.push(`generation queue public view exposes narrator production identity: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller narrator production binding check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_narrator_production_binding_check_passed");
console.log("- production job identity is bound to one approved casting fingerprint and exact voice revision");
console.log("- private queue admission creates only casting-bound narrator production jobs");
console.log("- pinned profile material is rechecked at persistence and worker execution boundaries");
console.log("- the guarded worker validates the exact claim, casting and material before provider execution");
console.log("- dedicated CLI jobs and queue commands require the full casting approval document");
console.log("- queue public views expose no narrator profile, profile hash or casting fingerprint");
