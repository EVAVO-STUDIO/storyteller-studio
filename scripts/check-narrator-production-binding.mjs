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
  "packages/storyteller/src/narrator-production-job.ts",
  "packages/storyteller/src/narrator-production-job.test.ts",
  "packages/storyteller/src/narrator-production-queue.ts",
  "packages/storyteller/src/narrator-production-queue.test.ts",
  "packages/storyteller/src/narrator-production-worker.ts",
  "packages/storyteller/src/narrator-production-worker.test.ts",
  "packages/storyteller/src/narrator-chapter-admission.ts",
  "packages/storyteller/src/narrator-chapter-admission.test.ts",
  "packages/storyteller/src/narration-production-policy.ts",
  "packages/storyteller/test-support/narrator-casting.ts",
  "packages/cli/src/narrator-production.ts",
  "packages/cli/src/narrator-production.test.ts",
  "apps/api/src/queue-runtime.ts",
  "packages/storyteller/package.json",
  "packages/cli/package.json",
  "docs/NARRATOR_CASTING_ADMISSION.md",
  "docs/NARRATOR_CHAPTER_ADMISSION.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/narrator-casting-admission.ts", [
  "STORYTELLER_ADMITTED_NARRATOR_CASTING_SCHEMA",
  "approveAdmittedNarratorCasting",
  "assertAdmittedNarratorCasting",
  "profileAdmission",
  "admissionVerified",
  "castingApproved",
  "profileAdmissionHash",
  "admittedCastingFingerprint",
]);
requireTokens("packages/storyteller/src/narrator-production-job.ts", [
  "storyteller-narrator-production-job-v2",
  "narratorProfileAdmissionHash",
  "narratorAdmittedCastingFingerprint",
  "narratorCastingFingerprint",
  "narratorVoice",
  "createNarratorProductionJobs",
  "assertPinnedProductionMaterial",
  "NARRATOR_PRODUCTION_CASTING_ADMISSION_REQUIRED",
  "NARRATOR_PRODUCTION_PROFILE_ADMISSION_MISMATCH",
  "NARRATOR_PRODUCTION_ADMITTED_CASTING_MISMATCH",
]);
requireTokens("packages/storyteller/src/narrator-production-queue.ts", [
  "enqueueNarratorProduction",
  "assertNarratorProductionClaim",
  "AdmittedNarratorCasting",
  "createNarratorProductionJobs",
  "assertPinnedProductionMaterial",
]);
requireTokens("packages/storyteller/src/narrator-production-worker.ts", [
  "assertNarratorProductionClaim",
  "runClaimedGenerationWorker",
  "admittedCasting: AdmittedNarratorCasting",
]);
requireTokens("packages/storyteller/src/narrator-chapter-admission.ts", [
  "ADMITTED_NARRATOR_QUALITY_REFERENCE_SCHEMA",
  "ADMITTED_NARRATOR_CHAPTER_MONITOR_SCHEMA",
  "ADMITTED_CHAPTER_NARRATOR_REVIEW_SCHEMA",
  "createAdmittedNarratorQualityReference",
  "monitorAdmittedNarratorChapter",
  "assertAdmittedNarratorChapterMonitoring",
  "createAdmittedChapterNarratorReview",
  "assertAdmittedChapterNarratorReview",
  "admittedChapterNarratorReviewPublicView",
  "profileAdmissionHash",
  "admittedCastingFingerprint",
  "productionSetFingerprint",
  "chapterSourceFingerprint",
  "ADMITTED_CHAPTER_PRODUCTION_JOB_COUNT_MISMATCH",
  "ADMITTED_CHAPTER_PRODUCTION_SEGMENT_ORDER_MISMATCH",
  "ADMITTED_CHAPTER_MONITOR_RECOMPUTATION_MISMATCH",
  "ADMITTED_CHAPTER_REVIEW_MONITORING_BINDING_MISMATCH",
  "humanListeningApproval: false",
  "titleNarratorApproval: false",
  "titleReleaseAuthority: false",
  "publicationAuthority: false",
]);
requireTokens("packages/storyteller/src/narrator-chapter-admission.test.ts", [
  "adapted chapter monitoring binds the exact profile admission, admitted casting and production job set",
  "zero-shot profiles use the same admitted chapter evidence boundary without invented training claims",
  "production jobs from another admission cannot be monitored under the selected casting",
  "rehashing cannot substitute the admission, production set, render or source lineage",
  "human chapter review is inseparable from the exact admitted monitoring result",
  "AI-like cadence warnings must be acknowledged exactly before admitted human approval",
  "review substitution and authority escalation fail even after outer rehashing",
  "public review projection proves admission binding without exposing private training or casting evidence",
]);
requireTokens("packages/storyteller/src/narration-production-policy.ts", [
  "assertPinnedProductionMaterial",
  "narratorProductionBinding",
  "material.voiceProfileHash !== undefined",
  "NARRATOR_PRODUCTION_VOICE_PIN_REQUIRED",
]);
requireTokens("packages/cli/src/narrator-production.ts", [
  'command: "cast" | "jobs" | "queue"',
  "NARRATOR_PRODUCTION_CASTING_ADMISSION_REQUIRED",
  "approveAdmittedNarratorCasting",
  "assertAdmittedNarratorCasting",
  "createNarratorProductionJobs",
  "enqueueNarratorProduction",
]);
requireTokens("docs/NARRATOR_CHAPTER_ADMISSION.md", [
  "storyteller-admitted-narrator-chapter-monitor-v1",
  "storyteller-admitted-chapter-narrator-review-v1",
  "Exact job-set admission",
  "Objective evidence recomputation",
  "Zero-shot and adapted voices",
  "Public privacy boundary",
  "titleNarratorApproval=false",
]);

if (existsSync(resolve(root, "packages/storyteller/package.json"))) {
  const pkg = JSON.parse(read("packages/storyteller/package.json"));
  for (const [key, value] of [
    ["./narrator-casting-admission", "./src/narrator-casting-admission.ts"],
    ["./narrator-production-job", "./src/narrator-production-job.ts"],
    ["./narrator-production-queue", "./src/narrator-production-queue.ts"],
    ["./narrator-production-worker", "./src/narrator-production-worker.ts"],
    ["./narrator-chapter-admission", "./src/narrator-chapter-admission.ts"],
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

if (existsSync(resolve(root, "packages/storyteller/src/narrator-chapter-admission.ts"))) {
  const source = read("packages/storyteller/src/narrator-chapter-admission.ts");
  for (const forbidden of [
    "humanListeningApproval: true",
    "titleNarratorApproval: true",
    "titleReleaseAuthority: true",
    "publicationAuthority: true",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`admission-bound chapter evidence grants forbidden authority: ${forbidden}`);
    }
  }
  const publicViewStart = source.indexOf("export function admittedChapterNarratorReviewPublicView");
  if (publicViewStart < 0) {
    problems.push("admitted chapter review public view is missing");
  } else {
    const publicView = source.slice(publicViewStart);
    for (const forbidden of [
      "profileAdmissionHash:",
      "admittedCastingFingerprint:",
      "castingFingerprint:",
      "profileHash:",
      "selectedCheckpointId",
      "trainingReceiptHash",
      "reviewerIds",
    ]) {
      if (publicView.includes(forbidden)) {
        problems.push(`admitted chapter review public view exposes private narrator evidence: ${forbidden}`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller narrator production binding check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_narrator_production_binding_check_passed");
console.log("- production job identity is bound to one validated profile admission and admitted casting");
console.log("- private queue and worker execution recheck the exact admission, casting and voice revision");
console.log("- complete ordered chapter job sets now bind objective monitoring to the rendered source lineage");
console.log("- human chapter review is bound to the exact admitted monitor and cannot override regeneration evidence");
console.log("- zero-shot and adapted profiles retain their distinct Audio Studio provenance through chapter review");
console.log("- public views expose no profile hash, admission hash, casting fingerprint, training receipt or reviewer identity");
