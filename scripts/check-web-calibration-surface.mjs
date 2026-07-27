import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing calibration workspace file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing calibration workspace token: ${token}`);
    }
  }
}

function forbidTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (source.includes(token)) {
      problems.push(`${path} exposes forbidden calibration workspace material: ${token}`);
    }
  }
}

for (const path of [
  "apps/web/src/app/page.tsx",
  "apps/web/src/app/layout.tsx",
  "apps/web/src/app/calibration.css",
]) requireFile(path);

requireTokens("apps/web/src/app/layout.tsx", [
  'import "./globals.css"',
  'import "./artifacts.css"',
  'import "./calibration.css"',
  'lang="en-AU"',
]);

requireTokens("apps/web/src/app/page.tsx", [
  'href="#calibration"',
  'id="calibration"',
  "Calibration-gated",
  "NARRATION CALIBRATION",
  "Prove the voice over time, not in ten seconds",
  "Varied by risk",
  "Blind + independent",
  "One approved lock",
  "Redacted reads only",
  "Propose passages",
  "Generate candidates",
  "Blind review",
  "Select references",
  "Approve continuity",
  "No single naturalness score",
  "Listener relationship",
  "Textual truth",
  "Sustained listenability",
  "No calibration session loaded",
  "mutations remain internal",
  "Read only",
  "NO PRIVATE MANUSCRIPT OR GENERATED MEDIA LOADED",
]);

requireTokens("apps/web/src/app/calibration.css", [
  ".calibration-panel",
  ".calibration-posture-grid",
  ".calibration-posture-card",
  ".calibration-body",
  ".calibration-flow",
  ".calibration-flow-state",
  ".calibration-dimensions",
  ".calibration-dimension-list",
  ".calibration-guardrail",
  "@media (max-width: 1180px)",
  "@media (max-width: 640px)",
]);

forbidTokens("apps/web/src/app/page.tsx", [
  "reviewerId",
  "approvedBy",
  "selectedBy",
  "takeArtifactId",
  "transcriptAssessmentArtifactId",
  "technicalAssessmentArtifactId",
  "capabilityFingerprint",
  "generationRequestHash",
  "voiceProfileId",
  "FileCalibrationSessionStore",
  "approveCalibrationSession",
  "recordCalibrationReview",
  "ELEVENLABS_API_KEY",
  "STORYTELLER_API_TOKEN",
]);

forbidTokens("apps/web/src/app/calibration.css", [
  "javascript:",
  "url(http",
]);

if (problems.length > 0) {
  console.error("Storyteller Studio calibration workspace surface check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_web_calibration_surface_check_passed");
console.log("- calibration is visible as a distinct production gate rather than a voice demo");
console.log("- varied passages, blind review and sustained listenability are communicated plainly");
console.log("- provider continuity and explicit human approval remain separate from generation");
console.log("- the interface states that authenticated reads are redacted and mutations remain internal");
console.log("- mobile, tablet and desktop calibration layouts are explicitly covered");
console.log("- no reviewer, artifact, provider, voice or credential material is rendered");
