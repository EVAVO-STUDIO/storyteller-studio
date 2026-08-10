import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing narrator mastered-review file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing narrator mastered-review contract token: ${token}`);
    }
  }
}

for (const path of [
  "packages/storyteller/src/narrator-mastered-review.ts",
  "packages/storyteller/src/narrator-book-sequence.ts",
  "packages/storyteller/src/narrator-mastered-review-admission.ts",
  "packages/storyteller/src/narrator-book-sequence-admission.ts",
  "packages/storyteller/src/narrator-mastered-review.test.ts",
  "packages/storyteller/src/narrator-mastered-review-admission.test.ts",
  "packages/storyteller/test-support/narrator-mastering.ts",
  "packages/storyteller/package.json",
  "docs/NARRATOR_MASTERED_REVIEW_SEQUENCE.md",
  "docs/NARRATOR_MASTERED_REVIEW_ADMISSION.md",
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
  "AdmittedNarratorMasteredReviewSource",
  "createAdmittedNarratorMasteredReviewBinding",
  "recordAdmittedNarratorMasteredReview",
  "assertAdmittedNarratorMasteredReviewBinding",
  "createAdmittedNarratorMasteredReviewApproval",
  "assertAdmittedNarratorMasteredReviewApproval",
  "admittedNarratorMasteredReviewPublicView",
  "assertAdmittedNarratorApprovedMasteredChapterReceipt",
  "profileAdmissionHash",
  "admittedCastingFingerprint",
  "chapterSourceFingerprint",
  "productionSetFingerprint",
  "productionJobCount",
  "admittedChapterReviewFingerprint",
  "admittedMonitoringFingerprint",
  "objectiveMonitoringFingerprint",
  "chapterNarratorReviewFingerprint",
  "admittedMasteringAuthorizationFingerprint",
  "admittedMasteringPlanFingerprint",
  "admittedMasteringRenderFingerprint",
  "admittedMasteredChapterFingerprint",
  "ADMITTED_NARRATOR_MASTERED_REVIEW_LINEAGE_MISMATCH",
  "ADMITTED_NARRATOR_MASTERED_REVIEW_TECHNICAL_BINDING_MISMATCH",
  "ADMITTED_NARRATOR_MASTERED_REVIEW_APPROVAL_BINDING_MISMATCH",
  "masteredListeningApproval: true",
  "completeBookListeningApproval: false",
  "titleNarratorApproval: false",
  "titleReleaseAuthority: false",
  "publicationAuthority: false",
]);

requireTokens("packages/storyteller/src/narrator-book-sequence-admission.ts", [
  "ADMITTED_NARRATOR_BOOK_SEQUENCE_SCHEMA",
  "createAdmittedNarratorBookChapterSequence",
  "assertAdmittedNarratorBookChapterSequence",
  "admittedNarratorBookSequencePublicView",
  "assertAdmittedNarratorMasteredReviewApproval",
  "createNarratorBookChapterSequence",
  "profileAdmissionHash",
  "admittedCastingFingerprint",
  "admittedApprovalFingerprint",
  "totalProductionJobCount",
  "ADMITTED_NARRATOR_BOOK_SEQUENCE_APPROVAL_COUNT_MISMATCH",
  "ADMITTED_NARRATOR_BOOK_SEQUENCE_APPROVAL_DUPLICATE",
  "ADMITTED_NARRATOR_BOOK_SEQUENCE_APPROVAL_MISSING",
  "ADMITTED_NARRATOR_BOOK_SEQUENCE_CHAPTER_BINDING_MISMATCH",
  "narratorAdmissionComplete: true",
  "masteredChapterListeningComplete: true",
  "completeBookListeningApproval: false",
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
  "outer rehashing cannot change admitted review lineage or downstream authority",
  "admission-bound post-master public view exposes no voice, training or reviewer identity",
  "book sequence requires one exact admission-bound mastered approval for every chapter",
  "book sequencing rejects missing, duplicate and cross-casting admitted approvals",
  "admission-bound book sequence public view proves completeness without private narrator evidence",
]);

requireTokens("packages/storyteller/test-support/narrator-mastering.ts", [
  "createTestAdmittedMasteredChapterFixture",
  "createAdmittedNarratorMasteringAuthorization",
  "createAdmittedNarratorApprovedMasteringPlan",
  "renderAdmittedNarratorApprovedMasteringPlan",
  "ingestAdmittedNarratorApprovedMasteredChapter",
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
  "Initial binding",
  "Human review history",
  "Independent mastered listening approval",
  "Admission-bound narrator book sequence",
  "Zero-shot and adapted parity",
  "Public privacy boundary",
  "Authority boundary",
  "AdmittedNarratorApprovedMasteredChapterReceipt",
  "createAdmittedNarratorMasteredReviewBinding",
  "recordAdmittedNarratorMasteredReview",
  "createAdmittedNarratorMasteredReviewApproval",
  "createAdmittedNarratorBookChapterSequence",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  for (const [key, value] of [
    ["./narrator-mastered-review", "./src/narrator-mastered-review.ts"],
    ["./narrator-book-sequence", "./src/narrator-book-sequence.ts"],
    ["./narrator-mastered-review-admission", "./src/narrator-mastered-review-admission.ts"],
    ["./narrator-book-sequence-admission", "./src/narrator-book-sequence-admission.ts"],
  ]) {
    if (packageJson.exports?.[key] !== value) {
      problems.push(`storyteller package does not export ${key}`);
    }
  }
}

for (const path of [
  "packages/storyteller/src/narrator-mastered-review.ts",
  "packages/storyteller/src/narrator-book-sequence.ts",
  "packages/storyteller/src/narrator-mastered-review-admission.ts",
  "packages/storyteller/src/narrator-book-sequence-admission.ts",
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

for (const [path, marker] of [
  [
    "packages/storyteller/src/narrator-mastered-review-admission.ts",
    "export function admittedNarratorMasteredReviewPublicView",
  ],
  [
    "packages/storyteller/src/narrator-book-sequence-admission.ts",
    "export function admittedNarratorBookSequencePublicView",
  ],
]) {
  if (!existsSync(fromRoot(path))) continue;
  const source = read(path);
  const start = source.indexOf(marker);
  if (start < 0) {
    problems.push(`${path} is missing its admission-bound public view`);
    continue;
  }
  const publicView = source.slice(start);
  for (const forbidden of [
    "profileAdmissionHash:",
    "admittedCastingFingerprint:",
    "castingFingerprint:",
    "profileHash:",
    "chapterSourceFingerprint:",
    "productionSetFingerprint:",
    "admittedChapterReviewFingerprint:",
    "admittedMonitoringFingerprint:",
    "objectiveMonitoringFingerprint:",
    "chapterNarratorReviewFingerprint:",
    "admittedMasteringAuthorizationFingerprint:",
    "admittedMasteringPlanFingerprint:",
    "admittedMasteringRenderFingerprint:",
    "selectedCheckpointId",
    "trainingReceiptHash",
    "productionJobIds",
    "productionCacheKeys",
    "reviewerIds",
  ]) {
    if (publicView.includes(forbidden)) {
      problems.push(`${path} public view exposes private narrator admission evidence: ${forbidden}`);
    }
  }
}

for (const path of [
  ".github/workflows/one-time-narrator-mastered-review-fix.yml",
  ".github/workflows/narrator-mastered-review-fix.yml",
  ".github/workflows/narrator-review-auto-fix.yml",
]) {
  if (existsSync(fromRoot(path))) {
    problems.push(`temporary or recurring narrator review mutation workflow must not remain: ${path}`);
  }
}

if (problems.length > 0) {
  console.error("Storyteller narrator mastered-review sequence check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_narrator_mastered_review_sequence_check_passed");
console.log("- technical post-master review still binds exact audio bytes, findings and independent human roles");
console.log("- production review now reopens the full admitted mastered chapter, profile admission and production lineage");
console.log("- zero-shot and adapted narrator provenance survives through mastered listening approval");
console.log("- admission-bound book sequencing requires one exact admitted mastered approval for every chapter");
console.log("- public views redact voice, training, casting, job, reviewer and private evidence identities");
console.log("- per-chapter approval cannot grant complete-book, title-release or publication authority");
console.log("- temporary correction workflows are absent and recurring source mutation is prohibited");
