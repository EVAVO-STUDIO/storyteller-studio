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
  "packages/storyteller/package.json",
  "docs/NARRATOR_MASTERING_CHAIN.md",
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

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./narrator-mastering-chain"]
      !== "./src/narrator-mastering-chain.ts"
  ) {
    problems.push("storyteller package does not export ./narrator-mastering-chain");
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

if (problems.length > 0) {
  console.error("Storyteller narrator mastering chain check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_narrator_mastering_chain_check_passed");
console.log("- narrator mastering authorization binds the exact casting, render, monitor, human review, source master and engineering evidence");
console.log("- narrator-approved mastering plans reopen and revalidate the exact approved source artifacts");
console.log("- mastering render receipts bind the exact plan, source, operations and output bytes");
console.log("- mastered chapter receipts retain the narrator review and objective monitor through post-master engineering");
console.log("- public projections redact voice, casting, reviewer and private evidence identities");
console.log("- mastering eligibility never becomes listening, title-release or publication authority");
