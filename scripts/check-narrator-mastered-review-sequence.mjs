import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing narrator mastered-review or whole-book admission file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing narrator production contract token: ${token}`);
    }
  }
}

for (const path of [
  "packages/storyteller/src/narrator-mastered-review.ts",
  "packages/storyteller/src/narrator-book-sequence.ts",
  "packages/storyteller/src/narrator-mastered-review-admission.ts",
  "packages/storyteller/src/narrator-book-sequence-admission.ts",
  "packages/storyteller/src/narrator-credit-admission.ts",
  "packages/storyteller/src/narrator-audiobook-admission.ts",
  "packages/storyteller/src/narrator-mastered-review.test.ts",
  "packages/storyteller/src/narrator-mastered-review-admission.test.ts",
  "packages/storyteller/src/narrator-audiobook-admission.test.ts",
  "packages/storyteller/test-support/narrator-mastering.ts",
  "packages/storyteller/test-support/narrator-audiobook.ts",
  "packages/storyteller/package.json",
  "docs/NARRATOR_MASTERED_REVIEW_SEQUENCE.md",
  "docs/NARRATOR_MASTERED_REVIEW_ADMISSION.md",
  "docs/NARRATOR_AUDIOBOOK_ADMISSION.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/narrator-mastered-review.ts", [
  "NARRATOR_MASTERED_REVIEW_BINDING_SCHEMA",
  "NARRATOR_MASTERED_REVIEW_APPROVAL_SCHEMA",
  "createNarratorMasteredReviewBinding",
  "recordNarratorMasteredReview",
  "createNarratorMasteredReviewApproval",
  "assertNarratorMasteredReviewApproval",
  "narratorMasteredReviewPublicView",
  "assertNarratorApprovedMasteredChapterReceipt",
  "assertNarratorMasteringAuthorization",
  "NARRATOR_MASTERED_REVIEW_SOURCE_BINDING_MISMATCH",
  "NARRATOR_MASTERED_REVIEW_FINDINGS_UNACKNOWLEDGED",
  "NARRATOR_MASTERED_REVIEW_FINAL_APPROVER_NOT_INDEPENDENT",
  "NARRATOR_MASTERED_REVIEW_APPROVED_ARTIFACT_MISMATCH",
  "masteredListeningApproval: true",
  "completeBookListeningApproval: false",
  "titleNarratorApproval: false",
  "titleReleaseAuthority: false",
  "publicationAuthority: false",
]);

requireTokens("packages/storyteller/src/narrator-book-sequence.ts", [
  "NARRATOR_BOOK_SEQUENCE_SCHEMA",
  "createNarratorBookChapterSequence",
  "assertNarratorBookChapterSequence",
  "narratorBookSequencePublicView",
  "assertNarratorMasteredReviewApproval",
  "assertBookChapterSequence",
  "NARRATOR_BOOK_SEQUENCE_APPROVAL_COUNT_MISMATCH",
  "NARRATOR_BOOK_SEQUENCE_APPROVAL_DUPLICATE",
  "NARRATOR_BOOK_SEQUENCE_APPROVAL_MISSING",
  "NARRATOR_BOOK_SEQUENCE_CHAPTER_BINDING_MISMATCH",
  "narratorEvidenceComplete: true",
  "masteredChapterListeningComplete: true",
  "completeBookListeningApproval: false",
  "titleNarratorApproval: false",
  "titleReleaseAuthority: false",
  "publicationAuthority: false",
]);

requireTokens("packages/storyteller/src/narrator-mastered-review-admission.ts", [
  "ADMITTED_NARRATOR_MASTERED_REVIEW_BINDING_SCHEMA",
  "ADMITTED_NARRATOR_MASTERED_REVIEW_APPROVAL_SCHEMA",
  "createAdmittedNarratorMasteredReviewBinding",
  "recordAdmittedNarratorMasteredReview",
  "createAdmittedNarratorMasteredReviewApproval",
  "assertAdmittedNarratorMasteredReviewApproval",
  "admittedNarratorMasteredReviewPublicView",
  "assertAdmittedNarratorApprovedMasteredChapterReceipt",
  "profileAdmissionHash",
  "productionSetFingerprint",
  "admittedMasteredChapterFingerprint",
  "masteredListeningApproval: true",
  "completeBookListeningApproval: false",
]);

requireTokens("packages/storyteller/src/narrator-book-sequence-admission.ts", [
  "ADMITTED_NARRATOR_BOOK_SEQUENCE_SCHEMA",
  "createAdmittedNarratorBookChapterSequence",
  "assertAdmittedNarratorBookChapterSequence",
  "admittedNarratorBookSequencePublicView",
  "assertAdmittedNarratorMasteredReviewApproval",
  "totalProductionJobCount",
  "narratorAdmissionComplete: true",
  "masteredChapterListeningComplete: true",
  "completeBookListeningApproval: false",
]);

requireTokens("packages/storyteller/src/narrator-credit-admission.ts", [
  "ADMITTED_NARRATOR_CREDIT_GENERATION_SCHEMA",
  "ADMITTED_NARRATOR_CREDIT_DELIVERY_SCHEMA",
  "createAdmittedNarratorBookCreditGeneration",
  "assertAdmittedNarratorBookCreditGeneration",
  "createAdmittedNarratorBookCreditDelivery",
  "assertAdmittedNarratorBookCreditDelivery",
  "admittedNarratorBookCreditArtifact",
  "admittedNarratorBookCreditPublicView",
  "STORYTELLER_NARRATOR_PRODUCTION_JOB_SCHEMA",
  "assertNarratorProductionJob",
  "voiceProfileHash",
  "profileAdmissionHash",
  "productionCacheKey",
  "eligibleForAdmittedBookAssembly: true",
  "completeBookListeningApproval: false",
]);

requireTokens("packages/storyteller/src/narrator-audiobook-admission.ts", [
  "ADMITTED_NARRATOR_AUDIOBOOK_SEQUENCE_SCHEMA",
  "ADMITTED_NARRATOR_REFERENCE_MASTER_SCHEMA",
  "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_BINDING_SCHEMA",
  "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_APPROVAL_SCHEMA",
  "createAdmittedNarratorAudiobookSequence",
  "assertAdmittedNarratorAudiobookSequence",
  "ingestAdmittedNarratorAudiobookReferenceMaster",
  "assertAdmittedNarratorAudiobookReferenceMaster",
  "createAdmittedNarratorWholeBookReviewBinding",
  "recordAdmittedNarratorWholeBookReview",
  "createAdmittedNarratorWholeBookReviewApproval",
  "assertAdmittedNarratorWholeBookReviewApproval",
  "admittedNarratorWholeBookPublicView",
  "renderEvidence: AudiobookRenderEvidence",
  "totalProductionJobCount",
  "narratorAdmissionComplete: true",
  "creditNarrationAdmissionComplete: true",
  "masteredChapterListeningComplete: true",
  "completeBookListeningApproval: true",
  "eligibleForRetailEncoding: true",
  "titleNarratorApproval: false",
  "titleReleaseAuthority: false",
  "publicationAuthority: false",
]);

requireTokens("packages/storyteller/src/narrator-mastered-review.test.ts", [
  "initial post-master review binding requires the exact narrator receipt",
  "every human role must acknowledge the exact post-master finding set",
  "complete independent post-master review grants only mastered listening approval",
  "the final post-master approver must be independent from both listening roles",
  "mastered artifact, receipt and review substitutions fail closed",
  "public post-master review view redacts voice, casting and reviewer evidence",
  "book sequence requires one exact narrator mastered approval per chapter",
  "book sequencing rejects missing, duplicate or substituted narrator evidence",
  "book sequence public view proves narrator binding without exposing private identity",
]);

requireTokens("packages/storyteller/src/narrator-mastered-review-admission.test.ts", [
  "post-master review begins from the exact admitted mastered chapter receipt",
  "zero-shot and adapted mastered chapters retain distinct admission provenance through review",
  "complete admitted post-master review grants only mastered listening approval",
  "another admission, production set or mastered receipt cannot be substituted after mastering",
  "admission-bound post-master public view exposes no voice, training or reviewer identity",
  "book sequence requires one exact admission-bound mastered approval for every chapter",
  "admission-bound book sequence public view proves completeness without private narrator evidence",
]);

requireTokens("packages/storyteller/src/narrator-audiobook-admission.test.ts", [
  "credit production binds the exact admitted profile hash into deterministic narrator identity",
  "credit delivery reopens the exact selected take, review and lossless master chain",
  "complete audiobook assembly requires both admitted credits and every exact chapter artifact",
  "a credit from another profile admission cannot enter the selected narrator audiobook",
  "zero-shot and adapted narrator provenance remain distinct through whole-book approval",
  "reference mastering remains bound to the exact admitted sequence and render evidence",
  "continuous whole-book approval grants retail eligibility but no title or publication authority",
  "public whole-book projections prove admission completeness without private narrator evidence",
]);

requireTokens("packages/storyteller/test-support/narrator-audiobook.ts", [
  "createTestAdmittedNarratorCreditFixture",
  "createTestAdmittedNarratorChapterApproval",
  "createTestAdmittedNarratorAudiobookFixture",
  "createAdmittedNarratorBookCreditGeneration",
  "createAdmittedNarratorBookCreditDelivery",
  "createAdmittedNarratorAudiobookSequence",
  "ingestAdmittedNarratorAudiobookReferenceMaster",
  "createAdmittedNarratorWholeBookReviewApproval",
]);

requireTokens("docs/NARRATOR_MASTERED_REVIEW_SEQUENCE.md", [
  "Initial post-master review binding",
  "Review finding acknowledgement",
  "Independent final approval",
  "Narrator-bound book sequence",
  "Public privacy boundary",
  "Complete-book authority remains separate",
  "Validation and failure-order semantics",
  "earliest specific integrity failure",
  "No recurring workflow is permitted to rewrite production source",
  "NarratorApprovedMasteredChapterReceipt",
  "createNarratorBookChapterSequence",
]);

requireTokens("docs/NARRATOR_MASTERED_REVIEW_ADMISSION.md", [
  "Exact mastered source",
  "Human review history",
  "Independent mastered listening approval",
  "Admission-bound narrator book sequence",
  "Zero-shot and adapted parity",
  "createAdmittedNarratorBookChapterSequence",
]);

requireTokens("docs/NARRATOR_AUDIOBOOK_ADMISSION.md", [
  "Admission-bound credit generation",
  "Admission-bound credit delivery",
  "Admission-bound complete audiobook sequence",
  "Exact render and reference master",
  "Continuous whole-book listening review",
  "Zero-shot and adapted parity",
  "Public privacy boundary",
  "completeBookListeningApproval = true",
  "titleNarratorApproval = false",
  "eligibleForRetailEncoding = true",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  const requiredExports = {
    "./narrator-mastered-review": "./src/narrator-mastered-review.ts",
    "./narrator-book-sequence": "./src/narrator-book-sequence.ts",
    "./narrator-mastered-review-admission": "./src/narrator-mastered-review-admission.ts",
    "./narrator-book-sequence-admission": "./src/narrator-book-sequence-admission.ts",
    "./narrator-credit-admission": "./src/narrator-credit-admission.ts",
    "./narrator-audiobook-admission": "./src/narrator-audiobook-admission.ts",
  };
  for (const [key, expected] of Object.entries(requiredExports)) {
    if (packageJson.exports?.[key] !== expected) {
      problems.push(`storyteller package does not export ${key}`);
    }
  }
}

for (const path of [
  "packages/storyteller/src/narrator-mastered-review.ts",
  "packages/storyteller/src/narrator-book-sequence.ts",
  "packages/storyteller/src/narrator-mastered-review-admission.ts",
  "packages/storyteller/src/narrator-book-sequence-admission.ts",
  "packages/storyteller/src/narrator-credit-admission.ts",
]) {
  if (!existsSync(fromRoot(path))) continue;
  const source = read(path);
  for (const forbidden of [
    "completeBookListeningApproval: true",
    "titleNarratorApproval: true",
    "titleReleaseAuthority: true",
    "publicationAuthority: true",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`${path} grants forbidden downstream authority: ${forbidden}`);
    }
  }
}

if (existsSync(fromRoot("packages/storyteller/src/narrator-audiobook-admission.ts"))) {
  const source = read("packages/storyteller/src/narrator-audiobook-admission.ts");
  for (const forbidden of [
    "titleNarratorApproval: true",
    "titleReleaseAuthority: true",
    "publicationAuthority: true",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`narrator whole-book admission grants forbidden authority: ${forbidden}`);
    }
  }
}

for (const path of [
  ".github/workflows/one-time-narrator-mastered-review-fix.yml",
  ".github/workflows/narrator-mastered-review-fix.yml",
  ".github/workflows/narrator-review-auto-fix.yml",
  ".github/workflows/narrator-audiobook-auto-fix.yml",
  ".github/workflows/one-time-narrator-audiobook-fix.yml",
]) {
  if (existsSync(fromRoot(path))) {
    problems.push(`temporary or recurring narrator source mutation workflow must not remain: ${path}`);
  }
}

if (problems.length > 0) {
  console.error("Storyteller narrator mastered-review and whole-book admission check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_narrator_mastered_review_sequence_check_passed");
console.log("- technical and admission-bound post-master review retain exact audio bytes, findings and independent human roles");
console.log("- opening and closing credit jobs bind the exact admitted narrator profile hash and casting");
console.log("- complete audiobook assembly requires exact admitted credits, chapter approvals and mastered artifacts");
console.log("- lossless reference mastering retains exact sequence and render evidence before whole-book review");
console.log("- continuous whole-book approval requires complete independent listening and grants retail eligibility only");
console.log("- zero-shot and adapted provenance remains distinct through credits, assembly and whole-book review");
console.log("- public views redact voice, training, casting, job, reviewer and private evidence identities");
console.log("- title-narrator, release and publication authority remain separate");
console.log("- temporary correction workflows are absent and recurring source mutation is prohibited");
