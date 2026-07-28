import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-policy file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-policy contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-policy.ts",
  "packages/storyteller/src/audiobook-retail-policy.test.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_POLICY.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-retail-policy.ts", [
  "AUDIOBOOK_RETAIL_POLICY_SCHEMA_VERSION",
  "AUDIOBOOK_RETAIL_PLATFORM_AUTHORISATION_SCHEMA_VERSION",
  "AUDIOBOOK_RETAIL_NARRATION_EVIDENCE_SCHEMA_VERSION",
  "createAcxAudibleRetailEncodingPolicy",
  "assertAudiobookRetailEncodingPolicy",
  "assertCurrentAudiobookRetailEncodingPolicy",
  "audiobookRetailEncodingPolicyPublicView",
  "createAudiobookRetailPlatformAuthorisation",
  "assertAudiobookRetailPlatformAuthorisation",
  "createAudiobookRetailNarrationEligibilityEvidence",
  "assertAudiobookRetailNarrationEligibilityEvidence",
  "audiobookRetailNarrationEligibilityPublicView",
  'bitRateMode: "cbr"',
  "bitRateKbps: AudiobookRetailBitRateKbps",
  "sampleRateHz: 44_100",
  "maximumFileDurationMs: 7_200_000",
  "minimumInclusive: -23",
  "maximumInclusive: -18",
  'comparator: "less-than"',
  "threshold: -3",
  "threshold: -60",
  "minimumRecommended: 1_000",
  "maximumAllowed: 5_000",
  "maximumDurationMs: 300_000",
  "voiceConsentIsNotPlatformAuthorisation: true",
  "AUDIOBOOK_RETAIL_POLICY_NOT_CURRENT",
  "AUDIOBOOK_RETAIL_POLICY_REQUIREMENTS_INVALID",
  "AUDIOBOOK_RETAIL_NARRATION_PLATFORM_AUTHORISATION_REQUIRED",
  "AUDIOBOOK_RETAIL_NARRATION_AUTHORISATION_SCOPE_MISMATCH",
  "AUDIOBOOK_RETAIL_NARRATION_AUTHORISATION_UNEXPECTED",
  "AUDIOBOOK_RETAIL_AUTHORISATION_POLICY_MISMATCH",
  "AUDIOBOOK_RETAIL_NARRATION_ATTESTOR_INVALID",
]);

requireTokens("packages/storyteller/src/audiobook-retail-policy.test.ts", [
  "ACX policy captures current official file, track, acoustic and sample requirements",
  "retail policies are versioned, current, expiring and tamper-evident",
  "human performance eligibility requires a real human attestation",
  "synthetic and mixed narration require current title-scoped Audible authorisation",
  "authorisation and eligibility stay bound after recomputed semantic tampering",
  "AUDIOBOOK_RETAIL_POLICY_REQUIREMENTS_INVALID",
  "AUDIOBOOK_RETAIL_NARRATION_PLATFORM_AUTHORISATION_REQUIRED",
  "AUDIOBOOK_RETAIL_NARRATION_AUTHORISATION_SCOPE_MISMATCH",
]);

requireTokens("docs/AUDIOBOOK_RETAIL_POLICY.md", [
  "Reviewed ACX requirements",
  "Versioned and expiring evidence",
  "Human, synthetic and mixed narration",
  "Platform authorisation",
  "Human attestation",
  "Tamper resistance",
  "Privacy boundary",
  "Current boundary",
  "voice actor consent record",
  "does not encode audio",
  "does not encode audio, upload files, create ACX projects or claim that ACX has accepted a title",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-policy"]
      !== "./src/audiobook-retail-policy.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-policy",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-policy"]
      !== "node scripts/check-audiobook-retail-policy.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-policy",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-policy",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail policy",
    );
  }
}

const sourcePath = "packages/storyteller/src/audiobook-retail-policy.ts";
if (existsSync(fromRoot(sourcePath))) {
  const source = read(sourcePath);
  const policyPublicStart = source.indexOf(
    "export function audiobookRetailEncodingPolicyPublicView",
  );
  const policyPublicEnd = source.indexOf(
    "\nexport function createAudiobookRetailPlatformAuthorisation",
    policyPublicStart,
  );
  if (policyPublicStart < 0 || policyPublicEnd < 0) {
    problems.push("retail policy public view boundary is missing");
  } else {
    const publicSource = source.slice(policyPublicStart, policyPublicEnd);
    for (const forbidden of [
      "sourceReference",
      "authorisationEvidenceId",
      "attestedByActorId",
      "rightsFingerprint",
      "projectId",
      "bookId",
    ]) {
      if (publicSource.includes(forbidden)) {
        problems.push(
          `retail policy public view exposes private state: ${forbidden}`,
        );
      }
    }
  }

  const narrationPublicStart = source.indexOf(
    "export function audiobookRetailNarrationEligibilityPublicView",
  );
  if (narrationPublicStart < 0) {
    problems.push("retail narration public view boundary is missing");
  } else {
    const publicSource = source.slice(narrationPublicStart);
    for (const forbidden of [
      "sourceReference",
      "authorisationEvidenceId",
      "attestedByActorId",
      "rightsFingerprint",
      "policyFingerprint",
      "projectId",
      "bookId",
    ]) {
      if (publicSource.includes(forbidden)) {
        problems.push(
          `retail narration public view exposes private state: ${forbidden}`,
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
    "@evavo/storyteller-engine/audiobook-retail-policy",
    "createAcxAudibleRetailEncodingPolicy",
    "createAudiobookRetailPlatformAuthorisation",
    "createAudiobookRetailNarrationEligibilityEvidence",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes private retail-policy controls: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-policy check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_policy_check_passed");
console.log("- ACX technical and track rules are versioned and expiring");
console.log("- current CBR, sample-rate, duration, acoustic and sample rules are explicit");
console.log("- human narration requires a real human attestation");
console.log("- synthetic and mixed narration require exact Audible or ACX authorisation");
console.log("- voice consent or provider licensing cannot substitute for platform permission");
console.log("- recomputed hashes cannot bypass project, book or policy scope");
console.log("- public views omit source, rights, actor and authorisation evidence");
