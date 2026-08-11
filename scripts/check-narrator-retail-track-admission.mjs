import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing narrator retail admission file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing narrator retail admission contract token: ${token}`);
    }
  }
}

for (const path of [
  "packages/storyteller/src/narrator-retail-track-admission.ts",
  "packages/storyteller/src/narrator-retail-track-admission.test.ts",
  "packages/storyteller/src/narrator-retail-track-production.ts",
  "packages/storyteller/src/narrator-retail-track-production.test.ts",
  "packages/storyteller/test-support/narrator-retail.ts",
  "packages/storyteller/package.json",
  "docs/NARRATOR_RETAIL_TRACK_ADMISSION.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/narrator-retail-track-admission.ts", [
  "ADMITTED_NARRATOR_RETAIL_TRACK_PLAN_SCHEMA",
  "createAdmittedNarratorRetailTrackPlan",
  "assertAdmittedNarratorRetailTrackPlan",
  "admittedNarratorRetailTrackPlanPublicView",
  "assertAdmittedNarratorWholeBookReviewApproval",
  "createAcxAudiobookRetailTrackPlan",
  'evidence.sourceKind !== "synthetic-voice"',
  "ADMITTED_NARRATOR_RETAIL_PLATFORM_AUTHORISATION_REQUIRED",
  "ADMITTED_NARRATOR_RETAIL_NARRATION_SCOPE_MISMATCH",
  "ADMITTED_NARRATOR_RETAIL_TRACK_PLAN_LINEAGE_MISMATCH",
  "narratorAdmissionComplete: true",
  "completeBookListeningApproval: true",
  "syntheticNarrationDeclared: true",
  "platformAuthorisationBound: true",
  "deliveryAuthority: false",
  "releaseDecisionAuthority: false",
  "titleReleaseAuthority: false",
  "publicationAuthority: false",
]);

requireTokens("packages/storyteller/src/narrator-retail-track-production.ts", [
  "ADMITTED_NARRATOR_RETAIL_TRACK_APPROVAL_SCHEMA",
  "createAdmittedNarratorRetailTrackApproval",
  "assertAdmittedNarratorRetailTrackApproval",
  "admittedNarratorRetailTrackApprovalPublicView",
  "assertAudiobookRetailTrackEncodeChain",
  "assertAudiobookRetailTrackReviewMatchesChain",
  "ADMITTED_NARRATOR_RETAIL_TRACK_ARTIFACT_MISMATCH",
  "ADMITTED_NARRATOR_RETAIL_TRACK_LINEAGE_MISMATCH",
  "retailTrackEngineeringComplete: true",
  "retailTrackListeningApproval: true",
  "eligibleForRetailSample: true",
  "deliveryAuthority: false",
  "releaseDecisionAuthority: false",
  "titleReleaseAuthority: false",
  "publicationAuthority: false",
]);

requireTokens("packages/storyteller/src/narrator-retail-track-admission.test.ts", [
  "adapted narrator retail planning retains exact whole-book admission and platform authorisation",
  "zero-shot narrator uses the same authorised retail boundary without invented training provenance",
  "owned voice rights cannot be misrepresented as human performance for platform admission",
  "cross-title platform authorisation and rights evidence fail closed",
  "rehashing cannot substitute the approved reference master or generic retail plan",
  "authority escalation is rejected even when the outer record is rehashed",
  "public retail planning view proves authorisation without exposing narrator or platform evidence identity",
]);

requireTokens("packages/storyteller/src/narrator-retail-track-production.test.ts", [
  "adapted narrator admission survives MP3 engineering and complete human track approval",
  "zero-shot narrator uses the same retail production boundary without invented training evidence",
  "another retail plan or encode chain cannot be attached to approved MP3 reviews",
  "approved MP3 artifact substitution fails even after the outer record is rehashed",
  "retail track approval cannot grant delivery, release or publication authority",
  "public retail track approval proves completion without narrator, platform or reviewer identity",
]);

requireTokens("packages/storyteller/test-support/narrator-retail.ts", [
  "createTestAdmittedNarratorRetailTrackFixture",
  "renderAudiobookRetailTrackPlan",
  "ingestAudiobookRetailTrackRender",
  "createAudiobookRetailTrackReviewSession",
  "approveAudiobookRetailTrackReview",
  "createAdmittedNarratorRetailTrackApproval",
]);

requireTokens("docs/NARRATOR_RETAIL_TRACK_ADMISSION.md", [
  "Synthetic narration must be declared honestly",
  "Deterministic technical planning",
  "Admission-bound MP3 production and review",
  "Zero-shot and adapted parity",
  "Authority boundary",
  "Public privacy boundary",
  "platform authorisation",
  "createAcxAudiobookRetailTrackPlan",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./narrator-retail-track-admission"]
      !== "./src/narrator-retail-track-admission.ts"
  ) problems.push("storyteller package does not export ./narrator-retail-track-admission");
  if (
    packageJson.exports?.["./narrator-retail-track-production"]
      !== "./src/narrator-retail-track-production.ts"
  ) problems.push("storyteller package does not export ./narrator-retail-track-production");
}

for (const sourcePath of [
  "packages/storyteller/src/narrator-retail-track-admission.ts",
  "packages/storyteller/src/narrator-retail-track-production.ts",
]) {
  if (!existsSync(fromRoot(sourcePath))) continue;
  const source = read(sourcePath);
  for (const forbidden of [
    "deliveryAuthority: true",
    "releaseDecisionAuthority: true",
    "titleReleaseAuthority: true",
    "publicationAuthority: true",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`narrator retail admission grants forbidden authority: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller narrator retail track admission check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_narrator_retail_track_admission_check_passed");
console.log("- retail planning begins from the exact admission-bound whole-book approval and reference master");
console.log("- Audio Studio narration is declared synthetic for both zero-shot and adapted profiles");
console.log("- current title-scoped Audible or ACX platform authorisation remains mandatory");
console.log("- ownership, consent, licensing and quality approval cannot masquerade as platform permission");
console.log("- exact retail MP3 rendering, engineering and human approval retain narrator admission lineage");
console.log("- approved retail artifacts remain bound to the reviewed encode chain and exact bytes");
console.log("- public state remains redacted and retail production cannot grant delivery, release or publication authority");
