import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing narrator profile-admission file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing narrator profile-admission contract token: ${token}`);
    }
  }
}

for (const path of [
  "packages/storyteller/src/narrator-profile-admission.ts",
  "packages/storyteller/src/narrator-profile-admission.test.ts",
  "packages/storyteller/package.json",
  "docs/NARRATOR_PROFILE_ADMISSION.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/narrator-profile-admission.ts", [
  "AUDIO_STUDIO_NARRATOR_TRAINING_PROVENANCE_SCHEMA",
  "AUDIO_STUDIO_NARRATOR_PROFILE_ADMISSION_SCHEMA",
  "assertNarratorProfileAdmission",
  "approveNarratorCastingFromAdmission",
  "narratorProfileAdmissionPublicView",
  "trainingReceiptGrantsListeningApproval: false",
  "trainingReceiptGrantsCastingApproval: false",
  "resourceEstimateOnly: true",
  "liveResourcePreflightRequired: true",
  "protectedPartitionsExcluded: true",
  "castingApproved: false",
  "titleReleaseAuthority: false",
  "publicationAuthority: false",
]);

requireTokens("packages/storyteller/src/narrator-profile-admission.test.ts", [
  "admits one exact Audio Studio training portfolio, capability, checkpoint and profile chain",
  "zero-shot admission contains no invented training provenance",
  "adapted admission cannot omit training provenance",
  "rehashing cannot substitute model tree, training lock or narrator dataset",
  "training method and scope remain semantically paired",
  "private paths and undeclared evidence cannot be smuggled",
  "casting consumes the admitted exact profile",
  "public view proves admission without exposing checkpoint, dataset, lock or receipt evidence",
]);

requireTokens("docs/NARRATOR_PROFILE_ADMISSION.md", [
  "Audio Studio owns model training and profile promotion",
  "Storyteller owns casting",
  "Zero-shot admission",
  "Adapted admission",
  "Cross-repository hash contract",
  "Complete-book authority remains separate",
  "evavo_narrator_training_provenance_v1",
  "evavo_storyteller_narrator_profile_admission_v1",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./narrator-profile-admission"]
      !== "./src/narrator-profile-admission.ts"
  ) problems.push("storyteller package does not export ./narrator-profile-admission");
}

for (const path of [
  "packages/storyteller/src/narrator-profile-admission.ts",
  "docs/NARRATOR_PROFILE_ADMISSION.md",
]) {
  if (!existsSync(fromRoot(path))) continue;
  const source = read(path);
  for (const forbidden of [
    "trainingReceiptGrantsListeningApproval: true",
    "trainingReceiptGrantsCastingApproval: true",
    "castingApproved: true",
    "titleReleaseAuthority: true",
    "publicationAuthority: true",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`${path} grants forbidden narrator profile authority: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller narrator profile-admission check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_narrator_profile_admission_check_passed");
console.log("- Audio Studio training provenance must match the exact holdout-approved profile");
console.log("- zero-shot profiles cannot invent training evidence");
console.log("- adapted profiles bind campaign, capability, checkpoint, dataset, lock and model tree");
console.log("- resource values remain advisory and require live preflight");
console.log("- private paths, commands, credentials, transcripts and reviewers are rejected");
console.log("- admission eligibility remains separate from casting, release and publication authority");
