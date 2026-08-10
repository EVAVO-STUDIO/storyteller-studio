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
  "packages/storyteller/src/narrator-profile-admission.ts",
  "packages/storyteller/src/narrator-casting-admission.ts",
  "packages/storyteller/src/narrator-casting-admission.test.ts",
  "packages/storyteller/test-support/narrator-casting.ts",
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
  "docs/NARRATOR_PROFILE_ADMISSION.md",
  "docs/NARRATOR_CASTING_ADMISSION.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/narrator-casting-admission.ts", [
  "STORYTELLER_ADMITTED_NARRATOR_CASTING_SCHEMA",
  "approveAdmittedNarratorCasting",
  "assertAdmittedNarratorCasting",
  "narratorCastingFromAdmission",
  "admittedNarratorCastingPublicView",
  "profileAdmission: AudioStudioNarratorProfileAdmission",
  "admissionVerified: true",
  "castingApproved: true",
  "defaultNarrator: false",
  "titleReleaseAuthority: false",
  "publicationAuthority: false",
  "NARRATOR_CASTING_ADMISSION_FINGERPRINT_INVALID",
]);
requireTokens("packages/storyteller/src/narrator-casting-admission.test.ts", [
  "binds the full adapted profile admission",
  "zero-shot casting retains an explicit admission",
  "standalone casting approval is not a production casting admission",
  "rehashing cannot substitute the admitted profile",
  "cannot gain default, release or publication authority",
  "public admitted-casting view omits private training and human identity evidence",
]);
requireTokens("packages/storyteller/src/narrator-production-job.ts", [
  "storyteller-narrator-production-job-v2",
  "narratorProfileAdmissionHash",
  "narratorAdmittedCastingFingerprint",
  "narratorCastingFingerprint",
  "narratorVoice",
  "createNarratorProductionJobs",
  "assertPinnedProductionMaterial",
  "profileAdmissionHash: admittedCasting.profileAdmission.admissionHash",
  "admittedCastingFingerprint: admittedCasting.fingerprint",
  "castingFingerprint: casting.fingerprint",
  "NARRATOR_PRODUCTION_CASTING_ADMISSION_REQUIRED",
  "NARRATOR_PRODUCTION_PROFILE_HASH_REQUIRED",
]);
requireTokens("packages/storyteller/src/narrator-production-queue.ts", [
  "enqueueNarratorProduction",
  "assertNarratorProductionClaim",
  "assertNarratorProductionJob",
  "admittedCasting: AdmittedNarratorCasting",
  "assertPinnedProductionMaterial",
]);
requireTokens("packages/storyteller/src/narrator-production-worker.ts", [
  "assertNarratorProductionClaim",
  "runClaimedGenerationWorker",
  "admittedCasting: AdmittedNarratorCasting",
]);
requireTokens("packages/storyteller/src/narration-production-policy.ts", [
  "assertPinnedProductionMaterial",
  "narratorProductionBinding",
  "material.voiceProfileHash !== undefined",
  "NARRATOR_PRODUCTION_VOICE_PIN_REQUIRED",
]);
requireTokens("packages/cli/src/narrator-production.ts", [
  'command: "cast"',
  'command: "jobs" | "queue"',
  "castingAdmissionPath",
  "approveAdmittedNarratorCasting",
  "assertAdmittedNarratorCasting(admittedCasting)",
  "createNarratorProductionJobs",
  "enqueueNarratorProduction",
  '"casting-admission"',
]);
requireTokens("docs/NARRATOR_CASTING_ADMISSION.md", [
  "storyteller-admitted-narrator-casting-v1",
  "storyteller-narrator-production-job-v2",
  "--casting-admission",
  "narratorProfileAdmissionHash",
  "narratorAdmittedCastingFingerprint",
  "Legacy casting documents",
  "Authority remains separated",
]);

if (existsSync(resolve(root, "packages/storyteller/package.json"))) {
  const pkg = JSON.parse(read("packages/storyteller/package.json"));
  for (const [key, value] of [
    ["./narrator-casting-admission", "./src/narrator-casting-admission.ts"],
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
      "narratorProfileAdmissionHash",
      "narratorAdmittedCastingFingerprint",
      "narratorCastingFingerprint",
      "voiceProfileHash",
    ]) {
      if (view.includes(forbidden)) problems.push(`generation queue public view exposes narrator production identity: ${forbidden}`);
    }
  }
}

for (const path of [
  "packages/storyteller/src/narrator-casting-admission.ts",
  "packages/storyteller/src/narrator-production-job.ts",
  "packages/storyteller/src/narrator-production-queue.ts",
  "packages/storyteller/src/narrator-production-worker.ts",
  "packages/cli/src/narrator-production.ts",
  "docs/NARRATOR_CASTING_ADMISSION.md",
]) {
  if (!existsSync(resolve(root, path))) continue;
  const source = read(path);
  for (const forbidden of [
    "admissionVerified: false",
    "castingApproved: false",
    "defaultNarrator: true",
    "titleReleaseAuthority: true",
    "publicationAuthority: true",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`${path} grants or weakens forbidden narrator production authority: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller narrator production binding check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_narrator_production_binding_check_passed");
console.log("- human casting is bound to the full validated Audio Studio profile admission");
console.log("- standalone casting approvals cannot create, queue or execute narrator production jobs");
console.log("- production job identity binds admission, admitted casting, raw casting and exact voice revision");
console.log("- private queue admission and guarded workers recheck the complete production binding");
console.log("- dedicated CLI cast, jobs and queue commands require the admitted-casting workflow");
console.log("- queue public views expose no narrator profile, admission or casting identity");
console.log("- casting admission remains separate from chapter, title release and publication authority");
