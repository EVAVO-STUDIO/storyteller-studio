import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing production calibration file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing production calibration token: ${token}`);
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
  "packages/storyteller/src/calibration-admission.ts",
  "packages/storyteller/src/calibration-admission.test.ts",
  "packages/storyteller/src/generation-calibration.ts",
  "packages/storyteller/src/generation-calibration.test.ts",
  "packages/storyteller/package.json",
  "docs/CALIBRATION_WORKFLOW.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/calibration-admission.ts", [
  "PRODUCTION_CALIBRATION_LOCK_SCHEMA_VERSION",
  "ProductionCalibrationLock",
  "CalibrationAdmissionError",
  "assertProductionCalibrationLock",
  "createProductionCalibrationLock",
  "validateProductionCalibrationScope",
  "validatePersistedProductionCalibrationLock",
  "calibrationExecutionFindingCodes",
  "productionCalibrationLockPublicView",
  "CALIBRATION_LOCK_APPROVED_SESSION_REQUIRED",
  "CALIBRATION_LOCK_PROVIDER_ROUTE_MISMATCH",
  "GENERATION_CALIBRATION_PROVIDER_MISMATCH",
  "GENERATION_CALIBRATION_MODEL_MISMATCH",
  "GENERATION_CALIBRATION_CAPABILITY_MISMATCH",
]);

requireTokens("packages/storyteller/src/calibration-admission.test.ts", [
  "approved calibration creates an immutable production lock with a redacted public view",
  "draft or tampered calibration sessions cannot create production locks",
  "production scope requires the approved project, voice revision and sole provider route",
  "persisted approval must reproduce the exact lock",
  "provider results must match the approved provider, model and capability snapshot",
]);

requireTokens("packages/storyteller/src/generation-calibration.ts", [
  "GENERATION_CALIBRATION_BINDING_SCHEMA_VERSION",
  "GenerationCalibrationBindingRecord",
  "GenerationCalibrationBindingPublicView",
  "FileGenerationCalibrationBindingStore",
  "CalibratedGenerationMaterialStore",
  "CalibrationBoundNarrationProviderAdapter",
  "createCalibrationBoundProviderRegistry",
  "resolveForMaterial",
  "resolveForRequest",
  "validatePersistedProductionCalibrationLock",
  "validateProductionCalibrationScope",
  "calibrationExecutionFindingCodes",
  "GENERATION_CALIBRATION_BINDING_NOT_FOUND",
  "GENERATION_CALIBRATION_JOB_SCOPE_MISMATCH",
  "generation.calibration.bound",
]);

requireTokens("packages/storyteller/src/generation-calibration.test.ts", [
  "per-job calibration binding is immutable, idempotent and publicly redacted",
  "calibrated material resolution blocks a production claim until its approved binding exists",
  "calibrated material resolution rejects stale voice, project and route scope before provider work",
  "provider wrapper blocks unbound production before invoking the adapter",
  "provider wrapper admits matching production and rejects model or capability drift before artifact storage",
  "calibration-mode provider requests remain available before production approval",
]);

requireTokens("docs/CALIBRATION_WORKFLOW.md", [
  "Production calibration lock",
  "Per-job binding",
  "Pre-provider admission",
  "Provider result enforcement",
  "generationCalibrationBindingPublicView",
  "Every write method returns `CALIBRATION_MUTATION_API_NOT_EXPOSED`",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./calibration-admission"] !== "./src/calibration-admission.ts") {
    problems.push("storyteller package does not export ./calibration-admission");
  }
  if (packageJson.exports?.["./generation-calibration"] !== "./src/generation-calibration.ts") {
    problems.push("storyteller package does not export ./generation-calibration");
  }
}

const admissionSource = existsSync(fromRoot("packages/storyteller/src/calibration-admission.ts"))
  ? read("packages/storyteller/src/calibration-admission.ts")
  : "";
const publicViewStart = admissionSource.indexOf("export function productionCalibrationLockPublicView");
if (publicViewStart < 0) {
  problems.push("production calibration lock public view is missing");
} else {
  const publicSource = admissionSource.slice(publicViewStart);
  for (const forbidden of [
    "sessionId:",
    "sessionFingerprint:",
    "approvalFingerprint:",
    "assessmentFingerprint:",
    "projectId:",
    "seriesId:",
    "voiceProfileId:",
    "providerId:",
    "modelId:",
    "capabilityFingerprint:",
    "selectedTakeSetFingerprint:",
  ]) {
    if (publicSource.includes(forbidden)) {
      problems.push(`production calibration public view exposes private field: ${forbidden}`);
    }
  }
}

const generationSource = existsSync(fromRoot("packages/storyteller/src/generation-calibration.ts"))
  ? read("packages/storyteller/src/generation-calibration.ts")
  : "";
const auditStart = generationSource.indexOf('action: "generation.calibration.bound"');
const auditEnd = generationSource.indexOf("occurredAt: now", auditStart);
if (auditStart < 0 || auditEnd <= auditStart) {
  problems.push("generation calibration audit boundary is missing");
} else {
  const auditSource = generationSource.slice(auditStart, auditEnd);
  for (const forbidden of [
    "sessionId:",
    "voiceProfileId:",
    "providerId:",
    "modelId:",
    "capabilityFingerprint:",
    "selectedTakeArtifactIds",
    "reviewerId",
    "approvedBy",
  ]) {
    if (auditSource.includes(forbidden)) {
      problems.push(`generation calibration audit exposes private evidence: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const source = read(path);
  for (const forbidden of [
    "FileGenerationCalibrationBindingStore",
    "CalibratedGenerationMaterialStore",
    "createCalibrationBoundProviderRegistry",
    "generation-calibration",
    "createProductionCalibrationLock",
    "calibration-admission",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`${path} exposes private production calibration capability: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio production calibration check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_generation_calibration_check_passed");
console.log("- approved human calibration produces one immutable production lock");
console.log("- every production job binds to the exact approved project, voice revision and provider route");
console.log("- material resolution rechecks the persisted approved session before credentials are used");
console.log("- provider output must retain the approved provider, model and capability snapshot");
console.log("- calibration and preview generation remain available before production approval");
console.log("- public and audit projections omit session, voice, provider, model and take identities");
console.log("- normal API and browser runtimes expose no production calibration mutation capability");
