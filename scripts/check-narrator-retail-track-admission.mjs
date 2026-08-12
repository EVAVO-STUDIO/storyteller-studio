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
  "packages/storyteller/src/narrator-retail-package-admission.ts",
  "packages/storyteller/src/narrator-retail-package-admission.test.ts",
  "packages/storyteller/src/narrator-retail-release-delivery.ts",
  "packages/storyteller/src/narrator-retail-release-delivery.test.ts",
  "packages/storyteller/src/narrator-retail-submission.ts",
  "packages/storyteller/src/narrator-retail-submission.test.ts",
  "packages/storyteller/test-support/narrator-retail.ts",
  "packages/storyteller/test-support/narrator-retail-package.ts",
  "packages/storyteller/test-support/narrator-retail-release.ts",
  "packages/storyteller/test-support/narrator-retail-submission.ts",
  "packages/storyteller/package.json",
  "docs/NARRATOR_RETAIL_TRACK_ADMISSION.md",
  "docs/NARRATOR_RETAIL_RELEASE_DELIVERY.md",
  "docs/NARRATOR_RETAIL_SUBMISSION.md",
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

requireTokens("packages/storyteller/src/narrator-retail-package-admission.ts", [
  "ADMITTED_NARRATOR_RETAIL_SAMPLE_APPROVAL_SCHEMA",
  "ADMITTED_NARRATOR_RETAIL_PACKAGE_APPROVAL_SCHEMA",
  "createAdmittedNarratorRetailSampleApproval",
  "assertAdmittedNarratorRetailSampleApproval",
  "admittedNarratorRetailSampleApprovalPublicView",
  "createAdmittedNarratorRetailPackageApproval",
  "assertAdmittedNarratorRetailPackageApproval",
  "admittedNarratorRetailPackageApprovalPublicView",
  "assertAudiobookRetailSamplePlanMatchesSources",
  "assertAudiobookRetailSampleReviewMatchesChain",
  "assertAudiobookRetailPackageManifestMatchesSources",
  "assertAudiobookRetailPackageBuildMatchesManifest",
  "assertAudiobookRetailPackageInspectionMatchesSources",
  "assertAudiobookRetailPackageReviewMatchesSources",
  "ADMITTED_NARRATOR_RETAIL_SAMPLE_ARTIFACT_MISMATCH",
  "ADMITTED_NARRATOR_RETAIL_SAMPLE_LINEAGE_MISMATCH",
  "ADMITTED_NARRATOR_RETAIL_PACKAGE_LINEAGE_MISMATCH",
  "sampleContentSafetyApproval: true",
  "retailSampleEngineeringComplete: true",
  "retailSampleListeningApproval: true",
  "privatePackageBuildComplete: true",
  "privatePackageInspectionComplete: true",
  "retailPackageReviewApproval: true",
  "releaseDecisionEligible: true",
  "deliveryAuthority: false",
  "releaseDecisionAuthority: false",
  "titleReleaseAuthority: false",
  "publicationAuthority: false",
]);

requireTokens("packages/storyteller/src/narrator-retail-release-delivery.ts", [
  "ADMITTED_NARRATOR_RETAIL_RELEASE_DECISION_SCHEMA",
  "ADMITTED_NARRATOR_RETAIL_DELIVERY_ATTEMPT_SCHEMA",
  "createAdmittedNarratorRetailReleaseDecision",
  "assertAdmittedNarratorRetailReleaseDecision",
  "admittedNarratorRetailReleaseDecisionPublicView",
  "startAdmittedNarratorRetailDeliveryAttempt",
  "recordAdmittedNarratorRetailDeliveryTransfer",
  "recordAdmittedNarratorRetailDeliveryFailure",
  "cancelAdmittedNarratorRetailDeliveryAttempt",
  "assertAdmittedNarratorRetailDeliveryAttempt",
  "admittedNarratorRetailDeliveryAttemptPublicView",
  "assertAudiobookRetailReleaseDecisionMatchesSources",
  "assertAudiobookRetailDeliveryAttemptMatchesSources",
  "ADMITTED_NARRATOR_RETAIL_RELEASE_LINEAGE_MISMATCH",
  "ADMITTED_NARRATOR_RETAIL_DELIVERY_LINEAGE_MISMATCH",
  "controlledDeliveryAuthorised: true",
  "maximumDeliveryAttempts: 1",
  "deliveryTransferComplete",
  "submissionReviewEligible",
  "submissionInitiated: false",
  "retailerAcceptanceClaimed: false",
  "releaseDecisionAuthority: false",
  "submissionAuthority: false",
  "retailerAcceptanceAuthority: false",
  "publicationAuthority: false",
]);

requireTokens("packages/storyteller/src/narrator-retail-submission.ts", [
  "ADMITTED_NARRATOR_RETAIL_SUBMISSION_REVIEW_SCHEMA",
  "ADMITTED_NARRATOR_RETAIL_SUBMISSION_DECISION_SCHEMA",
  "ADMITTED_NARRATOR_RETAIL_SUBMISSION_ATTEMPT_SCHEMA",
  "createAdmittedNarratorRetailSubmissionReviewApproval",
  "assertAdmittedNarratorRetailSubmissionReviewApproval",
  "admittedNarratorRetailSubmissionReviewApprovalPublicView",
  "createAdmittedNarratorRetailSubmissionDecision",
  "assertAdmittedNarratorRetailSubmissionDecision",
  "admittedNarratorRetailSubmissionDecisionPublicView",
  "startAdmittedNarratorRetailSubmissionAttempt",
  "recordAdmittedNarratorRetailSubmissionReceipt",
  "recordAdmittedNarratorRetailSubmissionFailure",
  "cancelAdmittedNarratorRetailSubmissionAttempt",
  "assertAdmittedNarratorRetailSubmissionAttempt",
  "admittedNarratorRetailSubmissionAttemptPublicView",
  "assertAudiobookRetailSubmissionReviewMatchesSources",
  "assertAudiobookRetailSubmissionDecisionMatchesSources",
  "assertAudiobookRetailSubmissionAttemptMatchesSources",
  "ADMITTED_NARRATOR_RETAIL_SUBMISSION_REVIEW_LINEAGE_MISMATCH",
  "ADMITTED_NARRATOR_RETAIL_SUBMISSION_DECISION_LINEAGE_MISMATCH",
  "ADMITTED_NARRATOR_RETAIL_SUBMISSION_ATTEMPT_LINEAGE_MISMATCH",
  "remoteDraftReviewComplete: true",
  "submissionDecisionEligible: true",
  "singleSubmissionAuthorised: true",
  "maximumSubmissionAttempts: 1",
  "submissionAttemptStarted: true",
  "submissionComplete",
  "retailerReviewEligible",
  "automaticSubmissionAuthority: false",
  "retailerAcceptanceAuthority: false",
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

requireTokens("packages/storyteller/src/narrator-retail-package-admission.test.ts", [
  "adapted narrator admission survives safety-reviewed sample and inspected retail package",
  "zero-shot narrator uses the same package boundary without invented training provenance",
  "sample approval cannot detach from the selected retail track approval",
  "sample artifact substitution fails even after the outer record is rehashed",
  "package manifest, build and inspection substitution fail closed",
  "retail package approval cannot grant delivery, release or publication authority",
  "public sample and package views prove completion without private narrator or reviewer identity",
]);

requireTokens("packages/storyteller/src/narrator-retail-release-delivery.test.ts", [
  "adapted narrator package approval becomes one admission-bound controlled delivery decision",
  "zero-shot narrator uses the same release boundary without invented training provenance",
  "cross-title package or distributor account evidence cannot authorise narrator delivery",
  "successful controlled transfer preserves narrator admission without submission or retailer claims",
  "failed and cancelled admitted delivery attempts remain terminal without retry or submission eligibility",
  "release substitution and authority escalation fail even after outer records are rehashed",
  "public release and delivery views prove bounded progress without private narrator, account or receipt identity",
]);

requireTokens("packages/storyteller/src/narrator-retail-submission.test.ts", [
  "adapted narrator admission survives remote-draft review, submission authority and retailer handoff",
  "zero-shot narrator uses the same submission boundary without invented training provenance",
  "cross-title remote-draft review and delivery evidence cannot be attached to another narrator",
  "successful admitted submission records processing handoff without retailer acceptance or publication claims",
  "failed and cancelled narrator submissions remain terminal under the consumed decision",
  "rehashing cannot substitute the approved review or escalate retailer and publication authority",
  "public submission views prove governed progress without private narrator, account, reviewer or receipt identity",
]);

requireTokens("packages/storyteller/test-support/narrator-retail.ts", [
  "createTestAdmittedNarratorRetailTrackFixture",
  "renderAudiobookRetailTrackPlan",
  "ingestAudiobookRetailTrackRender",
  "createAudiobookRetailTrackReviewSession",
  "approveAudiobookRetailTrackReview",
  "createAdmittedNarratorRetailTrackApproval",
]);

requireTokens("packages/storyteller/test-support/narrator-retail-package.ts", [
  "createTestAdmittedNarratorRetailSampleFixture",
  "createTestAdmittedNarratorRetailPackageFixture",
  "createAudiobookRetailSamplePlan",
  "renderAudiobookRetailSample",
  "ingestAudiobookRetailSample",
  "approveAudiobookRetailSampleReview",
  "buildAudiobookRetailPackage",
  "inspectAudiobookRetailPackage",
  "approveAudiobookRetailPackageReview",
  "createAdmittedNarratorRetailPackageApproval",
]);

requireTokens("packages/storyteller/test-support/narrator-retail-release.ts", [
  "createTestAdmittedNarratorRetailReleaseFixture",
  "createTestAdmittedNarratorRetailDeliveryFixture",
  "createAudiobookRetailDistributorAccountEvidence",
  "createAdmittedNarratorRetailReleaseDecision",
  "startAdmittedNarratorRetailDeliveryAttempt",
  "recordAdmittedNarratorRetailDeliveryTransfer",
]);

requireTokens("packages/storyteller/test-support/narrator-retail-submission.ts", [
  "createTestAdmittedNarratorRetailSubmissionReviewFixture",
  "createTestAdmittedNarratorRetailSubmissionDecisionFixture",
  "createTestAdmittedNarratorRetailSubmissionAttemptFixture",
  "createAudiobookRetailSubmissionReviewSession",
  "recordAudiobookRetailSubmissionReview",
  "approveAudiobookRetailSubmissionReview",
  "createAdmittedNarratorRetailSubmissionReviewApproval",
  "createAdmittedNarratorRetailSubmissionDecision",
  "startAdmittedNarratorRetailSubmissionAttempt",
  "recordAdmittedNarratorRetailSubmissionReceipt",
]);

requireTokens("docs/NARRATOR_RETAIL_TRACK_ADMISSION.md", [
  "Synthetic narration must be declared honestly",
  "Deterministic technical planning",
  "Admission-bound MP3 production and review",
  "Admission-bound sample production and review",
  "Private package build, inspection and review",
  "Zero-shot and adapted parity",
  "Authority boundary",
  "Public privacy boundary",
  "platform authorisation",
  "createAcxAudiobookRetailTrackPlan",
]);

requireTokens("docs/NARRATOR_RETAIL_RELEASE_DELIVERY.md", [
  "Admission-bound release decision",
  "One controlled delivery attempt",
  "Independent authority",
  "No submission or acceptance claim",
  "Failure and cancellation",
  "Public privacy boundary",
  "createAdmittedNarratorRetailReleaseDecision",
  "startAdmittedNarratorRetailDeliveryAttempt",
  "recordAdmittedNarratorRetailDeliveryTransfer",
]);

requireTokens("docs/NARRATOR_RETAIL_SUBMISSION.md", [
  "Admission-bound remote-draft review",
  "Independent single-submission decision",
  "One governed submission attempt",
  "Failure and cancellation",
  "Zero-shot and adapted parity",
  "Substitution resistance",
  "Public privacy boundary",
  "createAdmittedNarratorRetailSubmissionReviewApproval",
  "createAdmittedNarratorRetailSubmissionDecision",
  "startAdmittedNarratorRetailSubmissionAttempt",
  "recordAdmittedNarratorRetailSubmissionReceipt",
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
  if (
    packageJson.exports?.["./narrator-retail-package-admission"]
      !== "./src/narrator-retail-package-admission.ts"
  ) problems.push("storyteller package does not export ./narrator-retail-package-admission");
  if (
    packageJson.exports?.["./narrator-retail-release-delivery"]
      !== "./src/narrator-retail-release-delivery.ts"
  ) problems.push("storyteller package does not export ./narrator-retail-release-delivery");
  if (
    packageJson.exports?.["./narrator-retail-submission"]
      !== "./src/narrator-retail-submission.ts"
  ) problems.push("storyteller package does not export ./narrator-retail-submission");
}

for (const sourcePath of [
  "packages/storyteller/src/narrator-retail-track-admission.ts",
  "packages/storyteller/src/narrator-retail-track-production.ts",
  "packages/storyteller/src/narrator-retail-package-admission.ts",
  "packages/storyteller/src/narrator-retail-release-delivery.ts",
  "packages/storyteller/src/narrator-retail-submission.ts",
]) {
  if (!existsSync(fromRoot(sourcePath))) continue;
  const source = read(sourcePath);
  for (const forbidden of [
    "deliveryAuthority: true",
    "releaseDecisionAuthority: true",
    "submissionAuthority: true",
    "automaticSubmissionAuthority: true",
    "retailerAcceptanceAuthority: true",
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
console.log("- exact retail MP3 rendering, engineering and human approval retain narrator admission lineage");
console.log("- the governed sample retains exact source-track approval, content safety, engineering and listening evidence");
console.log("- private package build and independent inspection retain the exact approved media-file set");
console.log("- the independent release decision authorises exactly one controlled manual delivery attempt");
console.log("- successful transfer remains awaiting separate submission review and claims no retailer acceptance");
console.log("- remote-draft review retains the exact delivered narrator package and requires independent humans");
console.log("- the independent submission decision authorises exactly one manual submission attempt");
console.log("- successful submission records retailer processing without claiming acceptance or publication");
console.log("- failed and cancelled delivery or submission attempts retain terminal evidence without retry authority");
console.log("- all public narrator retail projections remain redacted");
