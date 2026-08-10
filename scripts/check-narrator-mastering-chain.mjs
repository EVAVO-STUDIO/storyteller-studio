import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing narrator mastering file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing narrator mastering contract token: ${token}`);
    }
  }
}

for (const path of [
  "packages/storyteller/src/narrator-mastering-chain.ts",
  "packages/storyteller/src/narrator-mastering-chain.test.ts",
  "packages/storyteller/src/narrator-mastering-admission.ts",
  "packages/storyteller/src/narrator-mastering-admission.test.ts",
  "packages/storyteller/package.json",
  "docs/NARRATOR_MASTERING_CHAIN.md",
  "docs/NARRATOR_MASTERING_ADMISSION.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/narrator-mastering-chain.ts", [
  "NARRATOR_MASTERING_AUTHORIZATION_SCHEMA",
  "NARRATOR_APPROVED_MASTERING_PLAN_SCHEMA",
  "NARRATOR_APPROVED_MASTERING_RENDER_SCHEMA",
  "NARRATOR_APPROVED_MASTERED_CHAPTER_SCHEMA",
  "createNarratorMasteringAuthorization",
  "assertNarratorMasteringAuthorization",
  "createNarratorApprovedMasteringPlan",
  "assertNarratorApprovedMasteringPlan",
  "createNarratorApprovedMasteringRenderReceipt",
  "assertNarratorApprovedMasteringRenderReceipt",
  "renderNarratorApprovedMasteringPlan",
  "createNarratorApprovedMasteredChapterReceipt",
  "assertNarratorApprovedMasteredChapterReceipt",
  "ingestNarratorApprovedMasteredChapter",
  "narratorApprovedMasteredChapterPublicView",
  "chapterNarratorReviewFingerprint",
  "objectiveMonitoringFingerprint",
  "approvedMasteringPlanFingerprint",
  "masteringRenderReceiptFingerprint",
  "masteredChapterChainFingerprint",
  "postMasterEngineeringFingerprint",
  "NARRATOR_MASTERING_REVIEW_RENDER_MISMATCH",
  "NARRATOR_MASTERING_MASTER_RENDER_MISMATCH",
  "NARRATOR_MASTERING_SOURCE_MASTER_CHANGED",
  "NARRATOR_MASTERING_SOURCE_ENGINEERING_CHANGED",
  "NARRATOR_MASTERING_RENDER_BINDING_MISMATCH",
  "NARRATOR_MASTERED_CHAPTER_BINDING_MISMATCH",
  "NARRATOR_MASTERED_CHAPTER_RENDER_CHANGED",
  "masteredListeningApproval: false",
  "titleReleaseAuthority: false",
  "publicationAuthority: false",
]);

requireTokens("packages/storyteller/src/narrator-mastering-admission.ts", [
  "ADMITTED_NARRATOR_MASTERING_AUTHORIZATION_SCHEMA",
  "ADMITTED_NARRATOR_APPROVED_MASTERING_PLAN_SCHEMA",
  "ADMITTED_NARRATOR_APPROVED_MASTERING_RENDER_SCHEMA",
  "ADMITTED_NARRATOR_APPROVED_MASTERED_CHAPTER_SCHEMA",
  "AdmittedNarratorMasteringContext",
  "bindAdmittedNarratorMasteringAuthorization",
  "createAdmittedNarratorMasteringAuthorization",
  "assertAdmittedNarratorMasteringAuthorization",
  "createAdmittedNarratorApprovedMasteringPlan",
  "assertAdmittedNarratorApprovedMasteringPlan",
  "createAdmittedNarratorApprovedMasteringRenderReceipt",
  "assertAdmittedNarratorApprovedMasteringRenderReceipt",
  "renderAdmittedNarratorApprovedMasteringPlan",
  "createAdmittedNarratorApprovedMasteredChapterReceipt",
  "assertAdmittedNarratorApprovedMasteredChapterReceipt",
  "ingestAdmittedNarratorApprovedMasteredChapter",
  "admittedNarratorApprovedMasteredChapterPublicView",
  "profileAdmissionHash",
  "admittedCastingFingerprint",
  "chapterSourceFingerprint",
  "productionSetFingerprint",
  "productionJobCount",
  "admittedChapterReviewFingerprint",
  "admittedMonitoringFingerprint",
  "objectiveMonitoringFingerprint",
  "chapterNarratorReviewFingerprint",
  "ADMITTED_NARRATOR_MASTERING_TECHNICAL_AUTHORIZATION_MISMATCH",
  "ADMITTED_NARRATOR_MASTERING_PLAN_BINDING_MISMATCH",
  "ADMITTED_NARRATOR_MASTERING_RENDER_BINDING_MISMATCH",
  "ADMITTED_NARRATOR_MASTERED_CHAPTER_BINDING_MISMATCH",
  "masteredListeningApproval: false",
  "completeBookListeningApproval: false",
  "titleNarratorApproval: false",
  "titleReleaseAuthority: false",
  "publicationAuthority: false",
]);

requireTokens("packages/storyteller/src/narrator-mastering-chain.test.ts", [
  "authorization binds the exact reviewed render, source master and engineering evidence",
  "a human review for another render cannot authorize mastering",
  "source master or engineering substitution is rejected before a plan is created",
  "approved mastering plan seals the narrator review and objective monitor fingerprints",
  "mastering render receipt remains bound to the exact approved plan and bytes",
  "mastered chapter receipt carries the exact review through the complete mastering chain",
  "mastered chapter receipt detects review, plan and output substitution",
  "publicJson.includes(\"magician-narrator\")",
]);

requireTokens("packages/storyteller/src/narrator-mastering-admission.test.ts", [
  "adapted mastering authorization retains the complete profile admission and production lineage",
  "zero-shot and adapted voices use the same admitted mastering boundary without invented training evidence",
  "a technical authorization for another render cannot be attached to an admitted chapter review",
  "rehashing cannot substitute the profile admission, production set or admitted review",
  "an admitted review from another casting cannot authorize mastering",
  "outer authority escalation fails even after the admitted authorization is rehashed",
]);

requireTokens("docs/NARRATOR_MASTERING_CHAIN.md", [
  "Why a separate narrator boundary exists",
  "Evidence chain",
  "Source and chronology checks",
  "Narrator-approved mastering plan",
  "Render receipt",
  "Mastered chapter receipt",
  "Public privacy boundary",
  "Human authority boundary",
  "createNarratorMasteringAuthorization",
  "renderNarratorApprovedMasteringPlan",
  "ingestNarratorApprovedMasteredChapter",
]);

requireTokens("docs/NARRATOR_MASTERING_ADMISSION.md", [
  "Why this boundary exists",
  "Private context",
  "Authorization",
  "Plan, render and mastered receipt",
  "Public privacy boundary",
  "Human authority boundary",
  "createAdmittedNarratorMasteringAuthorization",
  "bindAdmittedNarratorMasteringAuthorization",
  "renderAdmittedNarratorApprovedMasteringPlan",
  "ingestAdmittedNarratorApprovedMasteredChapter",
  "productionSetFingerprint",
  "admittedChapterReviewFingerprint",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  for (const [key, value] of [
    ["./narrator-mastering-chain", "./src/narrator-mastering-chain.ts"],
    ["./narrator-mastering-admission", "./src/narrator-mastering-admission.ts"],
  ]) {
    if (packageJson.exports?.[key] !== value) {
      problems.push(`storyteller package does not export ${key}`);
    }
  }
}

if (existsSync(fromRoot("packages/storyteller/src/narrator-mastering-chain.ts"))) {
  const source = read("packages/storyteller/src/narrator-mastering-chain.ts");
  for (const forbidden of [
    "masteredListeningApproval: true",
    "titleReleaseAuthority: true",
    "publicationAuthority: true",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`narrator mastering chain grants forbidden authority: ${forbidden}`);
    }
  }
  if (!source.includes("planId: input.approvedPlan.plan.id")) {
    problems.push("mastered narrator receipt does not retain the actual mastering plan id");
  }
  if (!source.includes("planFingerprint: input.approvedPlan.plan.fingerprint")) {
    problems.push("mastered narrator receipt does not retain the actual mastering plan fingerprint");
  }
  if (!source.includes("planId: receipt.planId")) {
    problems.push("public narrator mastered view does not project the actual mastering plan id");
  }
  if (source.includes("planId: receipt.masteredArtifact.id")) {
    problems.push("public narrator mastered view aliases the mastered artifact id as a plan id");
  }
}

if (existsSync(fromRoot("packages/storyteller/src/narrator-mastering-admission.ts"))) {
  const source = read("packages/storyteller/src/narrator-mastering-admission.ts");
  for (const forbidden of [
    "masteredListeningApproval: true",
    "completeBookListeningApproval: true",
    "titleNarratorApproval: true",
    "titleReleaseAuthority: true",
    "publicationAuthority: true",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`admitted narrator mastering grants forbidden authority: ${forbidden}`);
    }
  }
  const publicViewStart = source.indexOf(
    "export function admittedNarratorApprovedMasteredChapterPublicView",
  );
  if (publicViewStart < 0) {
    problems.push("admitted narrator mastered public view is missing");
  } else {
    const publicView = source.slice(publicViewStart);
    for (const forbidden of [
      "profileAdmissionHash:",
      "admittedCastingFingerprint:",
      "castingFingerprint:",
      "profileHash:",
      "productionSetFingerprint:",
      "admittedChapterReviewFingerprint:",
      "admittedMonitoringFingerprint:",
      "objectiveMonitoringFingerprint:",
      "chapterNarratorReviewFingerprint:",
      "selectedCheckpointId",
      "trainingReceiptHash",
      "productionJobIds",
      "productionCacheKeys",
      "reviewerIds",
    ]) {
      if (publicView.includes(forbidden)) {
        problems.push(`admitted narrator mastered public view exposes private evidence: ${forbidden}`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller narrator mastering chain check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_narrator_mastering_chain_check_passed");
console.log("- technical narrator mastering still binds the exact render, human review, source master and engineering evidence");
console.log("- production mastering now reopens the complete profile admission, admitted casting and chapter-review context");
console.log("- the ordered narrator production set and immutable chapter source survive through plan, render and mastered receipts");
console.log("- zero-shot and adapted profiles retain their distinct Audio Studio provenance through mastering");
console.log("- public projections redact training, voice, casting, job, reviewer and private evidence identities");
console.log("- mastering eligibility never becomes listening, title-narrator, release or publication authority");
