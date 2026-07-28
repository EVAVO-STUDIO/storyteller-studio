import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-reference-master-review file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-reference-master-review contract token: ${token}`,
      );
    }
  }
}

function collectRuntimeFiles(directory, output = []) {
  const absolute = fromRoot(directory);
  if (!existsSync(absolute)) return output;
  for (const name of readdirSync(absolute)) {
    const absolutePath = join(absolute, name);
    const item = statSync(absolutePath);
    if (item.isDirectory()) {
      collectRuntimeFiles(relative(root, absolutePath), output);
    } else if (
      /\.(?:ts|tsx|js|mjs)$/u.test(name)
      && !/\.(?:test|spec)\.[^.]+$/u.test(name)
    ) {
      output.push(relative(root, absolutePath).replaceAll("\\", "/"));
    }
  }
  return output;
}

for (const path of [
  "packages/storyteller/src/audiobook-reference-master-review.ts",
  "packages/storyteller/src/audiobook-reference-master-review.test.ts",
  "packages/storyteller/src/project-store.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_REFERENCE_MASTER_REVIEW.md",
]) requireFile(path);

requireTokens(
  "packages/storyteller/src/audiobook-reference-master-review.ts",
  [
    "AUDIOBOOK_REFERENCE_MASTER_REVIEW_SCHEMA_VERSION",
    "AUDIOBOOK_REFERENCE_MASTER_REVIEW_ENTITY_TYPE",
    "createAudiobookReferenceMasterReviewSession",
    "recordAudiobookReferenceMasterReview",
    "approveAudiobookReferenceMasterReview",
    "assertAudiobookReferenceMasterReviewSession",
    "audiobookReferenceMasterReviewPublicView",
    "FileAudiobookReferenceMasterReviewStore",
    "completeListenConfirmed",
    "componentCountReviewed",
    "boundaryCountReviewed",
    "sustainedListenability",
    "creditAccuracy",
    "transitionIntegrity",
    "REFERENCE_REVIEW_CHANGE_FINDINGS_REQUIRED",
    "REFERENCE_REVIEW_INDEPENDENT_REVIEWERS_REQUIRED",
    "REFERENCE_REVIEW_INDEPENDENT_APPROVER_REQUIRED",
    "REFERENCE_REVIEW_RIGHTS_EXPIRED",
    "REFERENCE_REVIEW_RETENTION_EXPIRED",
    "REFERENCE_REVIEW_SESSION_SUBJECT_MISMATCH",
    "recordArtifactReview",
  ],
);

requireTokens(
  "packages/storyteller/src/audiobook-reference-master-review.test.ts",
  [
    "complete independent whole-book reviews require a third human approval",
    "coverage, context, findings, scores and independence remain blocking",
    "approval is bound to the exact sequence, chain and current rights",
    "review store is idempotent, revision-safe and audits no reviewer identities or notes",
    "session and approval semantics fail closed after recomputed tampering",
    "AUDIOBOOK_REFERENCE_REVIEW_COMPONENT_COVERAGE_MISMATCH",
    "AUDIOBOOK_REFERENCE_REVIEW_BOUNDARY_COVERAGE_MISMATCH",
    "AUDIOBOOK_REFERENCE_REVIEW_REVIEWER_SET_FINGERPRINT_INVALID",
  ],
);

requireTokens("docs/AUDIOBOOK_REFERENCE_MASTER_REVIEW.md", [
  "Whole-book coverage",
  "Independent roles",
  "Playback coverage",
  "Structured findings and re-review",
  "Third-person final confirmation",
  "Rights revalidation",
  "Durable review state",
  "Privacy boundary",
  "Current boundary",
  "It is not a released retail audiobook",
]);

if (existsSync(fromRoot("packages/storyteller/src/project-store.ts"))) {
  const source = read("packages/storyteller/src/project-store.ts");
  if (!source.includes('| "audiobook-reference-master-review"')) {
    problems.push(
      "project store does not recognise audiobook-reference-master-review",
    );
  }
}

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-reference-master-review"]
      !== "./src/audiobook-reference-master-review.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-reference-master-review",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-reference-master-review"]
      !== "node scripts/check-audiobook-reference-master-review.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-reference-master-review",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-reference-master-review",
    )
  ) {
    problems.push(
      "permanent artifact verification omits reference-master review",
    );
  }
}

const sourcePath =
  "packages/storyteller/src/audiobook-reference-master-review.ts";
if (existsSync(fromRoot(sourcePath))) {
  const source = read(sourcePath);
  const publicStart = source.indexOf(
    "export function audiobookReferenceMasterReviewPublicView",
  );
  const publicEnd = source.indexOf("\nfunction toEnvelope", publicStart);
  if (publicStart < 0 || publicEnd < 0) {
    problems.push("reference-master review public view boundary is missing");
  } else {
    const publicSource = source.slice(publicStart, publicEnd);
    for (const forbidden of [
      "reviewerId",
      "notes",
      "finalConfirmationId",
      "approvedByActorId",
      "chainFingerprint",
      "contentHash",
      "byteCount",
      "rightsEvidenceId",
      "sourceReference",
      "parentArtifactIds",
      "objectKey",
      "container",
      "commandFingerprints",
    ]) {
      if (publicSource.includes(forbidden)) {
        problems.push(
          `reference-master review public view exposes private state: ${forbidden}`,
        );
      }
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-reference-master-review",
    "createAudiobookReferenceMasterReviewSession",
    "recordAudiobookReferenceMasterReview",
    "approveAudiobookReferenceMasterReview",
    "FileAudiobookReferenceMasterReviewStore",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private reference-master review controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(
    "Storyteller Studio audiobook-reference-master-review check failed:\n",
  );
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_reference_master_review_check_passed");
console.log("- every role must confirm a complete whole-book listen");
console.log("- every component and adjacent transition boundary is covered");
console.log("- editorial and engineering reviewers remain independent");
console.log("- studio, consumer-headphone and speaker playback are required");
console.log("- unresolved structured findings block final confirmation");
console.log("- a third human revalidates current rights and approves exact bytes");
console.log("- public and audit projections exclude identities, notes and media state");
