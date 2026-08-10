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
  "packages/storyteller/src/narrator-mastered-review.test.ts",
  "packages/storyteller/package.json",
  "docs/NARRATOR_MASTERED_REVIEW_SEQUENCE.md",
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

requireTokens("docs/NARRATOR_MASTERED_REVIEW_SEQUENCE.md", [
  "Initial post-master review binding",
  "Review finding acknowledgement",
  "Independent final approval",
  "Narrator-bound book sequence",
  "Public privacy boundary",
  "Complete-book authority remains separate",
  "NarratorApprovedMasteredChapterReceipt",
  "createNarratorBookChapterSequence",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./narrator-mastered-review"]
      !== "./src/narrator-mastered-review.ts"
  ) problems.push("storyteller package does not export ./narrator-mastered-review");
  if (
    packageJson.exports?.["./narrator-book-sequence"]
      !== "./src/narrator-book-sequence.ts"
  ) problems.push("storyteller package does not export ./narrator-book-sequence");
}

for (const path of [
  "packages/storyteller/src/narrator-mastered-review.ts",
  "packages/storyteller/src/narrator-book-sequence.ts",
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

if (problems.length > 0) {
  console.error("Storyteller narrator mastered-review sequence check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_narrator_mastered_review_sequence_check_passed");
console.log("- post-master review starts from the exact narrator-approved mastered chapter receipt");
console.log("- every listening role acknowledges the complete post-master finding set");
console.log("- final mastered listening approval remains independent and bound to exact audio bytes");
console.log("- book sequencing requires one exact narrator mastered approval for every chapter");
console.log("- public views redact voice, casting, reviewer and private evidence identities");
console.log("- per-chapter approval cannot grant complete-book, title-release or publication authority");
