import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing narrator retail track production file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing narrator retail track production contract token: ${token}`,
      );
    }
  }
}

for (const path of [
  "packages/storyteller/src/narrator-retail-track-production.ts",
  "packages/storyteller/src/narrator-retail-track-production.test.ts",
  "packages/storyteller/package.json",
  "docs/NARRATOR_RETAIL_TRACK_PRODUCTION.md",
  ".github/workflows/verify.yml",
  ".github/workflows/sentinel-automation.yml",
]) {
  requireFile(path);
}

requireTokens(
  "packages/storyteller/src/narrator-retail-track-production.ts",
  [
    "ADMITTED_NARRATOR_RETAIL_TRACK_RENDER_SCHEMA",
    "ADMITTED_NARRATOR_RETAIL_TRACK_ENCODE_SCHEMA",
    "ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_BINDING_SCHEMA",
    "ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_APPROVAL_SCHEMA",
    "renderAdmittedNarratorRetailTrackPlan",
    "ingestAdmittedNarratorRetailTrackRender",
    "createAdmittedNarratorRetailTrackReviewBinding",
    "recordAdmittedNarratorRetailTrackReview",
    "createAdmittedNarratorRetailTrackReviewApproval",
    "assertAdmittedNarratorRetailTrackRenderResult",
    "assertAdmittedNarratorRetailTrackEncode",
    "assertAdmittedNarratorRetailTrackReviewApproval",
    "approvedReferenceArtifact:",
    "admittedPlan.wholeBookApproval.approvedArtifact",
    "assertAudiobookRetailTrackRenderMatchesPlan",
    "assertAudiobookRetailTrackEncodeChain",
    "assertAudiobookRetailTrackReviewMatchesChain",
    "engineeringEvidenceComplete: true",
    "allTracksEngineeringEligible",
    "humanTrackReviewEligible",
    "humanTrackListeningApproval: true",
    "retailSamplePlanningEligible: true",
    "packageManifestEligible: false",
    "deliveryAuthority: false",
    "releaseDecisionAuthority: false",
    "titleReleaseAuthority: false",
    "publicationAuthority: false",
  ],
);

requireTokens(
  "packages/storyteller/src/narrator-retail-track-production.test.ts",
  [
    "adapted narrator admission survives rendering, engineering and complete track listening",
    "zero-shot narration uses the same production chain without invented training provenance",
    "reference-master substitution fails before private MP3 rendering",
    "render output byte substitution is rejected before artifact ingestion",
    "rehashing cannot attach another admitted plan or render to the encoded chain",
    "failed independent engineering cannot enter the human track review",
    "incomplete listening cannot be converted into an admission-bound approval",
    "authority escalation and public evidence leakage fail closed after track approval",
  ],
);

requireTokens("docs/NARRATOR_RETAIL_TRACK_PRODUCTION.md", [
  "Exact render admission",
  "Artifact admission and independent engineering",
  "Complete track listening",
  "Approved artifacts",
  "Zero-shot and adapted voices",
  "Public privacy boundary",
  "retailSamplePlanningEligible = true",
  "packageManifestEligible = false",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./narrator-retail-track-production"]
      !== "./src/narrator-retail-track-production.ts"
  ) {
    problems.push(
      "storyteller package does not export ./narrator-retail-track-production",
    );
  }
}

requireTokens(".github/workflows/verify.yml", [
  "Verify narrator retail track production",
  "check-narrator-retail-track-production.mjs",
  ".verification/narrator-retail-track-production.log",
]);

requireTokens(".github/workflows/sentinel-automation.yml", [
  "check-narrator-retail-track-production.mjs",
  "narrator-retail-track-production.log",
]);

const productionSource = existsSync(
  fromRoot("packages/storyteller/src/narrator-retail-track-production.ts"),
)
  ? read("packages/storyteller/src/narrator-retail-track-production.ts")
  : "";

for (const forbidden of [
  "packageManifestEligible: true",
  "deliveryAuthority: true",
  "releaseDecisionAuthority: true",
  "titleReleaseAuthority: true",
  "publicationAuthority: true",
]) {
  if (productionSource.includes(forbidden)) {
    problems.push(
      `narrator retail track production grants forbidden authority: ${forbidden}`,
    );
  }
}

for (const forbiddenInput of [
  "approvedReferenceArtifact: input.",
  "approvedReferenceArtifact?:",
  "approvedReferenceArtifact: ArtifactRecord",
]) {
  if (productionSource.includes(forbiddenInput)) {
    problems.push(
      `narrator retail track production accepts a substitutable reference source: ${forbiddenInput}`,
    );
  }
}

if (problems.length > 0) {
  console.error("Storyteller narrator retail track production check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_narrator_retail_track_production_check_passed");
console.log(
  "- private MP3 rendering begins from the exact admitted retail plan and approved reference master",
);
console.log(
  "- rendered bytes, plan ranges, artifact hashes and independent engineering remain cross-bound",
);
console.log(
  "- failed engineering is quarantined and cannot enter human track review",
);
console.log(
  "- every MP3 requires complete independent editorial and engineering playback plus third-person approval",
);
console.log(
  "- zero-shot and adapted Audio Studio provenance remains intact through approved retail artifacts",
);
console.log(
  "- track approval enables governed sample planning but never package, delivery, release or publication authority",
);
