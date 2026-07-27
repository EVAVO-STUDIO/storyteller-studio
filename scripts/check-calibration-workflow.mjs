import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing calibration file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing calibration contract token: ${token}`);
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
  "packages/storyteller/src/calibration-workflow.ts",
  "packages/storyteller/src/calibration-workflow.test.ts",
  "packages/storyteller/src/calibration-store.ts",
  "packages/storyteller/src/calibration-store.test.ts",
  "packages/storyteller/src/project-store.ts",
  "packages/storyteller/package.json",
  "docs/CALIBRATION_WORKFLOW.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/calibration-workflow.ts", [
  "CALIBRATION_SCHEMA_VERSION",
  "CalibrationPassageCategory",
  "CalibrationDimension",
  "CalibrationPolicy",
  "CalibrationCandidate",
  "CalibrationReview",
  "CalibrationApproval",
  "CalibrationSession",
  "proposeCalibrationPassages",
  "createCalibrationPolicy",
  "createCalibrationSession",
  "addCalibrationCandidate",
  "recordCalibrationReview",
  "selectCalibrationCandidate",
  "assessCalibrationSession",
  "approveCalibrationSession",
  "rejectCalibrationSession",
  "calibrationSessionPublicView",
  "CALIBRATION_HUMAN_CONFIRMATION_REQUIRED",
  "CALIBRATION_HUMAN_APPROVER_REQUIRED",
  "CALIBRATION_PROVIDER_CONFIGURATION_DRIFT",
  "sustainedListenability",
]);

requireTokens("packages/storyteller/src/calibration-workflow.test.ts", [
  "passage proposal covers varied narration demands without retaining manuscript text",
  "two blind independent reviewers can approve one consistent high-quality calibration set",
  "candidate and review creation are idempotent while conflicting reuse fails",
  "approval fails for missing selections, weak review coverage and low sustained listening",
  "non-blind, revise, reject, continuity and unresolved candidate findings block approval",
  "provider, model or capability drift across selected takes blocks a continuity lock",
  "automation identities cannot approve and terminal sessions cannot be revised",
  "fingerprint and revision-chain tampering are detected",
  "sustainedListenability: 2.0",
]);

requireTokens("packages/storyteller/src/calibration-store.ts", [
  'CALIBRATION_SESSION_ENTITY_TYPE = "calibration-session"',
  "StoredCalibrationSessionPublicView",
  "CalibrationStoreConflictError",
  "CalibrationStoreIntegrityError",
  "FileCalibrationSessionStore",
  "storedCalibrationSessionPublicView",
  "CALIBRATION_STORE_DOMAIN_REVISION_CONFLICT",
  "CALIBRATION_STORE_SCOPE_IMMUTABLE",
  "CALIBRATION_STORE_REVISION_CONFLICT",
  "calibration.session.created",
  "calibration.session.approved",
  "calibration.session.rejected",
  "eligibleForApproval",
  "sessionFingerprint",
]);

requireTokens("packages/storyteller/src/calibration-store.test.ts", [
  "calibration store creates, reads and idempotently reuses the same initial session",
  "every calibration domain revision persists through optimistic envelope revisions",
  "stale saves and skipped domain revisions fail without overwriting current state",
  "public projections and audit metadata omit review, artifact, provider and voice identities",
  "listing filters by project, series and status while returning only redacted views",
  "tampering with persisted calibration payloads is detected before domain use",
]);

requireTokens("packages/storyteller/src/project-store.ts", [
  '| "calibration-session"',
]);

requireTokens("docs/CALIBRATION_WORKFLOW.md", [
  "Passage diversity",
  "Candidate evidence",
  "Human review",
  "sustained listenability",
  "Continuity lock",
  "Human approval",
  "Durable persistence",
  "Audit boundary",
  "Public projection",
  "API and browser boundary",
  "Series use",
  "Production migration",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./calibration-workflow"] !== "./src/calibration-workflow.ts") {
    problems.push("storyteller package does not export ./calibration-workflow");
  }
  if (packageJson.exports?.["./calibration-store"] !== "./src/calibration-store.ts") {
    problems.push("storyteller package does not export ./calibration-store");
  }
}

const workflowSource = existsSync(fromRoot("packages/storyteller/src/calibration-workflow.ts"))
  ? read("packages/storyteller/src/calibration-workflow.ts")
  : "";
const publicViewStart = workflowSource.indexOf("export function calibrationSessionPublicView");
if (publicViewStart < 0) {
  problems.push("calibration public view implementation is missing");
} else {
  const publicSource = workflowSource.slice(publicViewStart);
  for (const forbidden of [
    "reviewerId:",
    "notes:",
    "approvedBy:",
    "selectedBy:",
    "takeArtifactId:",
    "transcriptAssessmentArtifactId:",
    "technicalAssessmentArtifactId:",
    "providerId:",
    "modelId:",
    "capabilityFingerprint:",
    "generationRequestHash:",
    "voiceProfileId:",
  ]) {
    if (publicSource.includes(forbidden)) {
      problems.push(`calibration public view exposes private field: ${forbidden}`);
    }
  }
}

const storeSource = existsSync(fromRoot("packages/storyteller/src/calibration-store.ts"))
  ? read("packages/storyteller/src/calibration-store.ts")
  : "";
const metadataStart = storeSource.indexOf("function safeMetadata(");
const metadataEnd = storeSource.indexOf("function auditAction(", metadataStart);
if (metadataStart < 0 || metadataEnd <= metadataStart) {
  problems.push("calibration audit metadata boundary is missing");
} else {
  const metadataSource = storeSource.slice(metadataStart, metadataEnd);
  for (const forbidden of [
    "reviewerId",
    "review.notes",
    "approvedBy",
    "selectedBy",
    "takeArtifactId",
    "transcriptAssessmentArtifactId",
    "technicalAssessmentArtifactId",
    "providerId",
    "modelId",
    "capabilityFingerprint",
    "generationRequestHash",
    "voiceProfileId",
  ]) {
    if (metadataSource.includes(forbidden)) {
      problems.push(`calibration audit metadata exposes private evidence: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const source = read(path);
  for (const forbidden of [
    "FileCalibrationSessionStore",
    "calibration-store",
    "addCalibrationCandidate",
    "recordCalibrationReview",
    "selectCalibrationCandidate",
    "approveCalibrationSession",
    "rejectCalibrationSession",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`${path} exposes calibration mutation capability: ${forbidden}`);
    }
  }
}

for (const path of [
  ".github/workflows/one-time-calibration-review-order-fix.yml",
  ".github/workflows/one-time-calibration-review-order-fix-v2.yml",
  ".github/calibration-review-order-fix.trigger",
]) {
  if (existsSync(fromRoot(path))) {
    problems.push(`obsolete calibration migration file remains: ${path}`);
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio calibration workflow check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_calibration_workflow_check_passed");
console.log("- varied passages evaluate long-form performance risks without retaining manuscript prose");
console.log("- blind independent reviews score textual truth, restraint and sustained listenability");
console.log("- explicit human approval locks one voice revision and provider capability snapshot");
console.log("- calibration sessions preserve linked domain and store-envelope revision chains");
console.log("- public views and audit metadata omit reviewers, artifacts, providers, voices and notes");
console.log("- normal API and browser runtimes expose no calibration mutation capability");
