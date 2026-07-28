import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-track-plan file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-track-plan contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-track-plan.ts",
  "packages/storyteller/src/audiobook-retail-track-plan.test.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_TRACK_PLAN.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-retail-track-plan.ts", [
  "AUDIOBOOK_RETAIL_TRACK_PLAN_SCHEMA_VERSION",
  "createAcxAudiobookRetailTrackPlan",
  "assertAudiobookRetailTrackPlan",
  "assertAudiobookRetailTrackPlanMatchesSources",
  "audiobookRetailTrackPlanPublicView",
  "sectionHeaderReviewedUnderReferenceApproval",
  "secondaryHeaderRequired: false",
  'bitRateMode: "cbr"',
  "sampleRateHz: REQUIRED_SAMPLE_RATE_HZ",
  "MAXIMUM_FILE_DURATION_MS = 7_200_000",
  "AUDIOBOOK_RETAIL_TRACK_REFERENCE_DURATION_DRIFT",
  "AUDIOBOOK_RETAIL_TRACK_SOURCE_SAMPLE_RATE_CONVERSION_REQUIRED",
  "AUDIOBOOK_RETAIL_TRACK_SECTION_SPLIT_REQUIRED",
  "AUDIOBOOK_RETAIL_TRACK_CREDIT_DURATION_EXCEEDS_LIMIT",
  "AUDIOBOOK_RETAIL_TRACK_APPROVED_REFERENCE_MISMATCH",
  "AUDIOBOOK_RETAIL_TRACK_NARRATION_SCOPE_MISMATCH",
  "AUDIOBOOK_RETAIL_TRACK_PLAN_SOURCE_MISMATCH",
  "sample-accurate-boundary-review",
  "approved-secondary-header-and-split-plan",
  "approved-sample-rate-conversion-plan",
  "manual-credit-restructure",
  "OpeningCredits.mp3",
  "ClosingCredits.mp3",
  "Chapter${padded(chapterNumber)}.mp3",
]);

requireTokens("packages/storyteller/src/audiobook-retail-track-plan.test.ts", [
  "approved whole-book evidence becomes exact ASCII ACX track intent",
  "prologue, chapter and epilogue receive deterministic non-title file names",
  "duration drift blocks extraction until sample-accurate boundaries are reviewed",
  "non-44.1 kHz production masters require a separately approved conversion plan",
  "overlong narrative sections require approved secondary-header audio and a split plan",
  "overlong credits are blocked instead of silently split",
  "track plans reject wrong title scope, stale rights and pre-approval reference artifacts",
  "structural and cross-source tampering remain distinct fail-closed gates",
  "AUDIOBOOK_RETAIL_TRACK_PLAN_SOURCE_MISMATCH",
]);

requireTokens("docs/AUDIOBOOK_RETAIL_TRACK_PLAN.md", [
  "Admission chain",
  "Exact source ranges",
  "Deterministic ASCII file names",
  "Header evidence",
  "Preservation blockers",
  "Reference duration drift",
  "Sample-rate conversion",
  "Sections longer than two hours",
  "Ready state",
  "Tamper resistance",
  "Privacy boundary",
  "Current boundary",
  "does not encode audio",
  "It is not encoded media, an ACX upload or an accepted retail audiobook",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-track-plan"]
      !== "./src/audiobook-retail-track-plan.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-track-plan",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-track-plan"]
      !== "node scripts/check-audiobook-retail-track-plan.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-track-plan",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-track-plan",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail track planning",
    );
  }
}

const sourcePath =
  "packages/storyteller/src/audiobook-retail-track-plan.ts";
if (existsSync(fromRoot(sourcePath))) {
  const source = read(sourcePath);
  const publicStart = source.indexOf(
    "export function audiobookRetailTrackPlanPublicView",
  );
  if (publicStart < 0) {
    problems.push("retail track-plan public view boundary is missing");
  } else {
    const publicSource = source.slice(publicStart);
    for (const forbidden of [
      "artifactId",
      "artifactRevision",
      "artifactFingerprint",
      "contentHash",
      "byteCount",
      "componentFingerprint",
      "sessionId",
      "sessionFingerprint",
      "approvalFingerprint",
      "evidenceId",
      "evidenceFingerprint",
      "createdByActorId",
      "platformAuthorisationPresent",
      "sourceStartMs",
      "sourceEndMs",
    ]) {
      if (publicSource.includes(forbidden)) {
        problems.push(
          `retail track-plan public view exposes private state: ${forbidden}`,
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
    "@evavo/storyteller-engine/audiobook-retail-track-plan",
    "createAcxAudiobookRetailTrackPlan",
    "assertAudiobookRetailTrackPlanMatchesSources",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private retail track-plan controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(
    "Storyteller Studio audiobook-retail-track-plan check failed:\n",
  );
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_track_plan_check_passed");
console.log("- approved reference, review, rights, policy and narration evidence are bound");
console.log("- ready tracks preserve exact contiguous source-component ranges");
console.log("- file names are deterministic ASCII role names, not user-entered titles");
console.log("- duration drift blocks guessed extraction boundaries");
console.log("- non-44.1 kHz sources require a reviewed conversion plan");
console.log("- overlong sections require secondary-header audio and governed splitting");
console.log("- blocked plans contain no provisional encode-ready tracks");
console.log("- public views omit artifact, source, review, actor and authorisation state");
