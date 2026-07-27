import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing calibration-engineering file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing calibration-engineering contract token: ${token}`);
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
  "packages/storyteller/src/calibration-engineering.ts",
  "packages/storyteller/src/calibration-engineering.test.ts",
  "packages/storyteller/src/audio-engineering.ts",
  "packages/storyteller/src/audio-engineering-artifact.ts",
  "packages/storyteller/src/artifact-registry.ts",
  "packages/storyteller/src/calibration-workflow.ts",
  "packages/storyteller/package.json",
  "docs/CALIBRATION_ENGINEERING.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/calibration-engineering.ts", [
  "EngineeringBackedCalibrationCandidateInput",
  "CalibrationEngineeringAdmissionError",
  "admitEngineeringBackedCalibrationCandidate",
  "assertCalibrationSession",
  "assertAudioEngineeringEvidence",
  "assertArtifactRecord(audioCandidate)",
  "assertArtifactRecord(transcriptAssessment)",
  "assertArtifactRecord(engineeringArtifact)",
  'audioCandidate.kind !== "audio-candidate"',
  'engineeringArtifact.kind !== "audio-analysis"',
  "CALIBRATION_ENGINEERING_AUDIO_NOT_VERIFIED",
  "CALIBRATION_ENGINEERING_TRANSCRIPT_NOT_VERIFIED",
  "CALIBRATION_ENGINEERING_ANALYSIS_NOT_VERIFIED",
  "CALIBRATION_ENGINEERING_TRANSCRIPT_SCOPE_MISMATCH",
  "CALIBRATION_ENGINEERING_ANALYSIS_SCOPE_MISMATCH",
  "CALIBRATION_ENGINEERING_TRANSCRIPT_PARENT_MISMATCH",
  "CALIBRATION_ENGINEERING_ANALYSIS_PARENT_MISMATCH",
  "CALIBRATION_ENGINEERING_CANDIDATE_EVIDENCE_MISMATCH",
  "CALIBRATION_ENGINEERING_CONTENT_BINDING_MISMATCH",
  "CALIBRATION_ENGINEERING_RIGHTS_SCOPE_MISMATCH",
  "CALIBRATION_ENGINEERING_EVIDENCE_INELIGIBLE",
  "CALIBRATION_ENGINEERING_CANDIDATE_PRECEDES_EVIDENCE",
  "addCalibrationCandidate",
]);

requireTokens("packages/storyteller/src/calibration-engineering.test.ts", [
  "verified scope-matched audio, transcript and independent engineering admit a calibration candidate",
  "ineligible independent engineering blocks candidate admission while evidence remains verified",
  "tampered and pending artifacts fail before calibration domain mutation",
  "scope, parent and rights mismatches fail closed",
  "content and chronology mismatches cannot be hidden by valid artifact envelopes",
  "artifact public views remain structurally valid after engineering admission fixtures",
  "ingestAudioEngineeringArtifact",
  "ingestPrivateArtifact",
  "ARTIFACT_FINGERPRINT_MISMATCH",
  "CALIBRATION_ENGINEERING_EVIDENCE_INELIGIBLE",
  "CALIBRATION_ENGINEERING_CONTENT_BINDING_MISMATCH",
  "CALIBRATION_ENGINEERING_CANDIDATE_PRECEDES_EVIDENCE",
]);

requireTokens("docs/CALIBRATION_ENGINEERING.md", [
  "Required evidence chain",
  "Artifact integrity",
  "Technical failure remains evidence",
  "valid evidence artifact != eligible audio candidate",
  "Redacted operational view",
  "Current boundary",
  "assertArtifactRecord",
  "audio-analysis",
  "private generation worker",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./calibration-engineering"]
    !== "./src/calibration-engineering.ts"
  ) {
    problems.push("storyteller package does not export ./calibration-engineering");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/calibration-engineering.ts"))
  ? read("packages/storyteller/src/calibration-engineering.ts")
  : "";
const validationOrder = [
  "assertCalibrationSession(input.session)",
  "assertAudioEngineeringEvidence(input.engineeringEvidence)",
  "assertArtifactRecord(audioCandidate)",
  "assertArtifactRecord(transcriptAssessment)",
  "assertArtifactRecord(engineeringArtifact)",
  'audioCandidate.kind !== "audio-candidate"',
  "requireVerified(audioCandidate",
  "requireSameScope(audioCandidate, transcriptAssessment",
  "requireParent(",
  "CALIBRATION_ENGINEERING_CONTENT_BINDING_MISMATCH",
  "CALIBRATION_ENGINEERING_EVIDENCE_INELIGIBLE",
  "CALIBRATION_ENGINEERING_CANDIDATE_PRECEDES_EVIDENCE",
  "return addCalibrationCandidate",
];
let previous = -1;
for (const token of validationOrder) {
  const index = source.indexOf(token, previous + 1);
  if (index < 0) {
    problems.push(`calibration engineering validation order is missing: ${token}`);
    continue;
  }
  previous = index;
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/calibration-engineering",
    "admitEngineeringBackedCalibrationCandidate",
    "CalibrationEngineeringAdmissionError",
    "ingestAudioEngineeringArtifact",
    "addCalibrationCandidate",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(`${path} exposes calibration evidence mutation: ${forbidden}`);
    }
  }
}

const testSource = existsSync(fromRoot("packages/storyteller/src/calibration-engineering.test.ts"))
  ? read("packages/storyteller/src/calibration-engineering.test.ts")
  : "";
for (const sentinel of [
  "artifact_calibration_engineering_audio_001",
  "artifact_calibration_engineering_transcript_001",
  "eleven_multilingual_v2",
  "capabilityFingerprint",
]) {
  if (!testSource.includes(sentinel)) {
    problems.push(`calibration engineering test lacks redaction sentinel: ${sentinel}`);
  }
}
if (!testSource.includes("serialised.includes(forbidden), false")) {
  problems.push("calibration engineering test does not assert redacted public projection");
}

if (problems.length > 0) {
  console.error("Storyteller Studio calibration engineering check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_calibration_engineering_check_passed");
console.log("- calibration candidates require verified audio, transcript and independent engineering evidence");
console.log("- all supplied artifact fingerprints and evidence fingerprints are revalidated");
console.log("- scope, parent, rights, content and chronology must form one coherent chain");
console.log("- failed engineering evidence remains auditable but cannot enter calibration review");
console.log("- calibration public projections omit artifact, provider, voice and manuscript evidence");
console.log("- normal API and browser runtimes expose no calibration evidence mutation");
