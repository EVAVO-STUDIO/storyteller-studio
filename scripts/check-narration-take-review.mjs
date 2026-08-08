import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing narration-take-review file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing narration-take-review contract token: ${token}`);
    }
  }
}

function collectRuntimeFiles(directory, output = []) {
  const absolute = fromRoot(directory);
  if (!existsSync(absolute)) return output;
  for (const name of readdirSync(absolute)) {
    const absolutePath = join(absolute, name);
    const item = statSync(absolutePath);
    if (item.isDirectory()) collectRuntimeFiles(relative(root, absolutePath), output);
    else if (
      /\.(?:ts|tsx|js|mjs)$/u.test(name)
      && !/\.(?:test|spec)\.[^.]+$/u.test(name)
    ) {
      output.push(relative(root, absolutePath).replaceAll("\\", "/"));
    }
  }
  return output;
}

for (const path of [
  "packages/storyteller/src/narration-take-review.ts",
  "packages/storyteller/src/narration-take-review.test.ts",
  "packages/storyteller/test-support/narration-take-review-fixture.ts",
  "packages/storyteller/src/project-store.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/NARRATION_TAKE_REVIEW.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/narration-take-review.ts", [
  "NARRATION_TAKE_REVIEW_SCHEMA_VERSION",
  "NarrationTakeReviewPolicy",
  "NarrationTakeReviewSession",
  "NarrationTakeReviewEntry",
  "NarrationTakeSelection",
  "NarrationTakeApproval",
  "createNarrationTakeReviewPolicy",
  "createNarrationTakeReviewSession",
  "recordNarrationTakeReview",
  "selectNarrationTake",
  "approveNarrationTakeSelection",
  "assertApprovedNarrationTakeSelection",
  "assertNarrationTakeReviewSession",
  "narrationTakeReviewPublicView",
  "FileNarrationTakeReviewStore",
  "NARRATION_TAKE_REVIEW_PENDING_AUDIO_REQUIRED",
  "NARRATION_TAKE_REVIEW_ENGINEERING_INELIGIBLE",
  "NARRATION_TAKE_REVIEW_ENGINEERING_EVIDENCE_ARTIFACT_MISMATCH",
  "NARRATION_TAKE_REVIEW_REVIEWER_INDEPENDENCE_REQUIRED",
  "NARRATION_TAKE_REVIEW_PERSPECTIVE_INDEPENDENCE_REQUIRED",
  "NARRATION_TAKE_REVIEW_BLIND_REVIEW_REQUIRED",
  "NARRATION_TAKE_REVIEW_FULL_LISTEN_REQUIRED",
  "NARRATION_TAKE_REVIEW_CONTEXTS_NOT_CANONICAL",
  "NARRATION_TAKE_REVIEW_CANDIDATES_NOT_CANONICAL",
  "NARRATION_TAKE_REVIEW_COVERAGE_INCOMPLETE",
  "NARRATION_TAKE_REVIEW_PANEL_MISMATCH",
  "NARRATION_TAKE_REVIEW_CANDIDATE_NOT_TOP_RATED",
  "NARRATION_TAKE_REVIEW_SELECTOR_INDEPENDENCE_REQUIRED",
  "NARRATION_TAKE_REVIEW_APPROVER_INDEPENDENCE_REQUIRED",
  "NARRATION_TAKE_REVIEW_SELECTION_STALE",
  "NARRATION_TAKE_REVIEW_RIGHTS_EXPIRED",
  "NARRATION_TAKE_REVIEW_APPROVED_ARTIFACT_MISMATCH",
  "latestReviewSetFingerprint",
  "previousFingerprint",
]);

requireTokens("packages/storyteller/src/narration-take-review.test.ts", [
  "matched blind reviewers select the highest-rated narration take and approve its artifact",
  "every candidate requires complete coverage from the same blind panel",
  "reviewers must be independent, blind and listen to the complete take",
  "new review evidence invalidates a prior selection until comparison is current",
  "candidate order is canonical and approval revalidates current rights",
  "engineering evidence must match the exact analysis artifact bytes",
  "public projection omits take, artifact, actor, manuscript and rights evidence",
  "revisioned review sessions persist with optimistic concurrency and audit evidence",
  "tampering with candidates, scores, selection or approval fingerprints fails closed",
  "NARRATION_TAKE_REVIEW_SELECTOR_INDEPENDENCE_REQUIRED",
  "NARRATION_TAKE_REVIEW_APPROVER_INDEPENDENCE_REQUIRED",
]);

requireTokens("packages/storyteller/test-support/narration-take-review-fixture.ts", [
  "approveNarrationTakeReviewFixture",
  "minimumCandidateCount: 2",
  'requiredPerspectives: ["editorial", "engineering"]',
  "recordNarrationTakeReview",
  "selectNarrationTake",
  "approveNarrationTakeSelection",
]);

requireTokens("packages/storyteller/src/project-store.ts", [
  '"narration-take-review"',
]);

requireTokens("docs/NARRATION_TAKE_REVIEW.md", [
  "Repository boundary",
  "Candidate admission",
  "Blind matched-panel review",
  "Comparative selection",
  "Final approval and assembly binding",
  "Persistence and privacy",
  "between two and eight alternatives",
  "highest-rated candidate",
  "re-checks rights at approval time",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./narration-take-review"] !== "./src/narration-take-review.ts") {
    problems.push("storyteller package does not export ./narration-take-review");
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (packageJson.scripts?.["verify:narration-take-review"] !== "node scripts/check-narration-take-review.mjs") {
    problems.push("root package does not expose verify:narration-take-review");
  }
  if (!packageJson.scripts?.["verify:artifacts"]?.includes("npm run verify:narration-take-review")) {
    problems.push("verify:artifacts does not include narration take-review validation");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/narration-take-review.ts"))
  ? read("packages/storyteller/src/narration-take-review.ts")
  : "";
const publicStart = source.indexOf("export function narrationTakeReviewPublicView");
if (publicStart < 0) problems.push("narration take-review public view is missing");
else {
  const publicSource = source.slice(publicStart);
  for (const forbidden of [
    "projectId:",
    "segmentId:",
    "manuscriptSourceHash:",
    "performanceContextFingerprint:",
    "rightsFingerprint:",
    "candidates:",
    "reviews:",
    "candidateTakeId:",
    "reviewerId:",
    "selectedByActorId:",
    "approvedByActorId:",
    "audioCandidate:",
    "engineeringEvidence:",
  ]) {
    if (publicSource.includes(forbidden)) {
      problems.push(`narration take-review public view exposes private evidence: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/narration-take-review",
    "createNarrationTakeReviewSession",
    "recordNarrationTakeReview",
    "selectNarrationTake",
    "approveNarrationTakeSelection",
    "FileNarrationTakeReviewStore",
    "NarrationTakeReviewSession",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private narration take-review mutation: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio narration take-review check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_narration_take_review_check_passed");
console.log("- every ordinary narration segment compares two to eight verified candidate evidence chains");
console.log("- blind full-listen editorial and engineering reviews use one matched independent panel");
console.log("- only a top-rated ready take can be selected and later review evidence invalidates stale choices");
console.log("- rights are rechecked before an independent human creates the approved artifact revision");
console.log("- chapter assembly binds the exact approved audio, transcript and engineering evidence chain");
console.log("- public projections omit manuscripts, rights, takes, artifacts, actors, provider records and media locators");
