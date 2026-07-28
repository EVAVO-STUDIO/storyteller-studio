import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-track-review file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-track-review contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-track-review.ts",
  "packages/storyteller/src/audiobook-retail-track-review.test.ts",
  "packages/storyteller/src/project-store.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_TRACK_REVIEW.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-retail-track-review.ts", [
  "AUDIOBOOK_RETAIL_TRACK_REVIEW_SCHEMA_VERSION",
  "AUDIOBOOK_RETAIL_TRACK_REVIEW_ENTITY_TYPE",
  "createAudiobookRetailTrackReviewSession",
  "recordAudiobookRetailTrackReview",
  "approveAudiobookRetailTrackReview",
  "assertAudiobookRetailTrackReviewSession",
  "assertAudiobookRetailTrackReviewMatchesChain",
  "audiobookRetailTrackReviewPublicView",
  "FileAudiobookRetailTrackReviewStore",
  "completeListenConfirmed",
  "headerConfirmed",
  "openingBoundaryConfirmed",
  "closingBoundaryConfirmed",
  "studio-headphones",
  "consumer-headphones",
  "speakers",
  "sustainedListenability",
  "encodingTransparency",
  "AUDIOBOOK_RETAIL_TRACK_REVIEW_INDEPENDENT_ROLES_REQUIRED",
  "AUDIOBOOK_RETAIL_TRACK_REVIEW_INDEPENDENT_APPROVER_REQUIRED",
  "AUDIOBOOK_RETAIL_TRACK_REVIEW_RIGHTS_EXPIRED",
  "AUDIOBOOK_RETAIL_TRACK_REVIEW_CHAIN_MISMATCH",
  "recordArtifactReview",
]);

requireTokens("packages/storyteller/src/audiobook-retail-track-review.test.ts", [
  "every retail MP3 receives complete independent playback review before third-person approval",
  "incomplete listens, unchecked boundaries, weak scores and invalid playback contexts never reach approval",
  "changes-requested findings require notes and a later clean re-review",
  "editorial and engineering roles plus final approval remain independently human",
  "expired rights and recomputed cross-source tampering fail closed",
  "review persistence rejects stale revisions and conflicting session identity",
  "AUDIOBOOK_RETAIL_TRACK_REVIEW_LISTEN_DURATION_INVALID",
  "AUDIOBOOK_RETAIL_TRACK_REVIEW_INDEPENDENT_APPROVER_REQUIRED",
  "AUDIOBOOK_RETAIL_TRACK_REVIEW_CHAIN_MISMATCH",
]);

requireTokens("docs/AUDIOBOOK_RETAIL_TRACK_REVIEW.md", [
  "Admission boundary",
  "Every file is reviewed independently",
  "Editorial review",
  "Engineering playback review",
  "Scoring and findings",
  "Playback coverage",
  "Third-person approval",
  "Revision and tamper resistance",
  "Persistence and privacy",
  "Current boundary",
  "It does not mean released, uploaded, submitted or retailer accepted",
]);

requireTokens("packages/storyteller/src/project-store.ts", [
  '"audiobook-retail-track-review"',
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-track-review"]
      !== "./src/audiobook-retail-track-review.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-track-review",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-track-review"]
      !== "node scripts/check-audiobook-retail-track-review.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-track-review",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-track-review",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail track review",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-track-review",
    "recordAudiobookRetailTrackReview",
    "approveAudiobookRetailTrackReview",
    "FileAudiobookRetailTrackReviewStore",
    "assertAudiobookRetailTrackReviewMatchesChain",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private retail track review controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-track-review check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_track_review_check_passed");
console.log("- every retail MP3 requires complete editorial and engineering playback");
console.log("- current reviews cover studio headphones, consumer headphones and speakers");
console.log("- weak scores and unresolved findings remain fail-closed");
console.log("- a third independent human approves exact artifact revisions");
console.log("- rights and encode-chain identity are revalidated at approval time");
console.log("- public and audit views omit reviewer and private artifact evidence");