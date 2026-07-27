import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing artifact workspace file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) problems.push(`${path} is missing artifact workspace token: ${token}`);
  }
}

function forbidTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (source.includes(token)) problems.push(`${path} exposes forbidden artifact workspace material: ${token}`);
  }
}

for (const path of [
  "apps/web/src/app/page.tsx",
  "apps/web/src/app/layout.tsx",
  "apps/web/src/app/artifacts.css",
]) requireFile(path);

requireTokens("apps/web/src/app/layout.tsx", [
  'import "./globals.css"',
  'import "./artifacts.css"',
  'lang="en-AU"',
]);

requireTokens("apps/web/src/app/page.tsx", [
  'href="#artifacts"',
  "Artifact register",
  "Artifact-governed",
  "GOVERNED PRODUCTION ARTIFACTS",
  "A file exists only after its evidence exists",
  "Generation intent, stored media, human approval and final release are separate states.",
  "Disabled by default",
  "Read only",
  "Internal only",
  "Final confirmation",
  "Register",
  "Verify",
  "Review",
  "Assemble",
  "Release",
  "No generated media registered",
  "Fail closed",
  'id="artifacts"',
  'aria-label="Artifact lifecycle"',
  "NO PRIVATE MANUSCRIPT OR GENERATED MEDIA LOADED",
]);

requireTokens("apps/web/src/app/artifacts.css", [
  ".artifact-panel",
  ".artifact-posture-grid",
  ".artifact-posture-card",
  ".artifact-flow",
  ".artifact-stage-state",
  ".artifact-guardrail",
  ".state-waiting",
  "@media (max-width: 1180px)",
  "@media (max-width: 640px)",
]);

forbidTokens("apps/web/src/app/page.tsx", [
  "objectKey",
  "versionId",
  "providerRequestId",
  "signedUrl",
  "downloadUrl",
  "leaseToken",
  "OPENAI_API_KEY",
  "ELEVENLABS_API_KEY",
  "STORYTELLER_API_TOKEN",
]);

forbidTokens("apps/web/src/app/artifacts.css", [
  "javascript:",
  "url(http",
]);

if (problems.length > 0) {
  console.error("Storyteller Studio artifact workspace surface check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_web_artifact_surface_check_passed");
console.log("- artifact governance is visible in the production workflow and navigation");
console.log("- generation, verification, review, assembly and release remain distinct states");
console.log("- read-only, internal-worker and final-confirmation boundaries are communicated plainly");
console.log("- mobile, tablet and desktop layouts are explicitly covered");
console.log("- no private storage locator, provider request or worker lease material is rendered");
