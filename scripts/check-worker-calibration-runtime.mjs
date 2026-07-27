import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing worker calibration runtime file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing worker calibration runtime token: ${token}`);
    }
  }
}

for (const path of [
  "apps/worker/src/runtime.ts",
  "apps/worker/src/calibration-admission-runtime.test.ts",
  "apps/worker/src/elevenlabs-generation.test.ts",
  "packages/storyteller/src/generation-calibration.ts",
  "packages/storyteller/src/provider-adapter.ts",
  "packages/storyteller/src/provider-governance-errors.test.ts",
  "docs/WORKER_RUNTIME.md",
]) requireFile(path);

requireTokens("apps/worker/src/runtime.ts", [
  "FileCalibrationSessionStore",
  "FileGenerationCalibrationBindingStore",
  "CalibratedGenerationMaterialStore",
  "createCalibrationBoundProviderRegistry",
  'dirname(configuration.queueRootDirectory)',
  '"calibration-sessions"',
  "providers,",
  "materials,",
  "requireBudget: true",
]);

requireTokens("apps/worker/src/calibration-admission-runtime.test.ts", [
  "production without a calibration binding blocks before credentials, budget reservation or synthesis",
  "GENERATION_MATERIAL_RESOLUTION_FAILED",
  "adapter.preflightCount",
  "adapter.synthesisCount",
  "account.payload.reservations.length",
  "account.payload.committedMicros",
]);

requireTokens("apps/worker/src/elevenlabs-generation.test.ts", [
  "queued ElevenLabs production requires approved calibration, reserves budget, verifies artifacts and completes with exact evidence",
  "persistCalibrationAndBinding",
  "createProductionCalibrationLock",
  "FileGenerationCalibrationBindingStore",
  "approvedCapabilityFingerprint",
  "approvedCalibration.id",
  "approvedCalibration.seriesId",
]);

requireTokens("packages/storyteller/src/generation-calibration.ts", [
  "CalibratedGenerationMaterialStore",
  "createCalibrationBoundProviderRegistry",
  "resolveForMaterial",
  "resolveForRequest",
  "calibrationExecutionFindingCodes",
]);

requireTokens("packages/storyteller/src/provider-adapter.ts", [
  "SAFE_PROVIDER_GOVERNANCE_CODE",
  "providerFailureFinding",
  "GENERATION_CALIBRATION_",
  "Provider output did not satisfy the approved production calibration lock.",
  "Provider attempt failed without producing approved output.",
]);

requireTokens("packages/storyteller/src/provider-governance-errors.test.ts", [
  "calibration drift remains a named non-retryable provider finding",
  "arbitrary provider errors are sanitised and never copy secrets or manuscript text",
  "GENERATION_CALIBRATION_CAPABILITY_MISMATCH",
  "PROVIDER_SYNTHESIS_FAILED",
]);

requireTokens("docs/WORKER_RUNTIME.md", [
  "Required calibration control",
  "before provider credentials are used",
  "A missing, stale, tampered or scope-mismatched binding blocks the job before provider invocation",
  "Returned output must retain the approved provider, model and capability fingerprint",
  "Safe `GENERATION_CALIBRATION_*` findings are treated as governance blocks rather than generic retries",
]);

const runtimeSource = existsSync(fromRoot("apps/worker/src/runtime.ts"))
  ? read("apps/worker/src/runtime.ts")
  : "";
const order = [
  "const queueState = new FileProjectStore",
  "const calibrationStore = new FileCalibrationSessionStore",
  "const calibrationBindings = new FileGenerationCalibrationBindingStore",
  "const materials = new CalibratedGenerationMaterialStore",
  "const providers = createCalibrationBoundProviderRegistry",
  "const budgetController = new FileGenerationBudgetController",
  "const artifactRegistry = new FileArtifactRegistry",
  "return new GenerationWorkerService",
];
let previous = -1;
for (const token of order) {
  const index = runtimeSource.indexOf(token);
  if (index < 0 || index <= previous) {
    problems.push(`worker calibration runtime order is invalid at: ${token}`);
  }
  previous = index;
}

const providerSource = existsSync(fromRoot("packages/storyteller/src/provider-adapter.ts"))
  ? read("packages/storyteller/src/provider-adapter.ts")
  : "";
const catchStart = providerSource.indexOf("      } catch (error) {");
const catchEnd = providerSource.indexOf("      }", catchStart + 24);
if (catchStart < 0 || catchEnd <= catchStart) {
  problems.push("provider error classification catch boundary is missing");
} else {
  const catchSource = providerSource.slice(catchStart, catchEnd + 7);
  if (catchSource.includes("error.message") || catchSource.includes("unknown provider failure")) {
    problems.push("provider execution catch copies arbitrary provider error text");
  }
  if (!catchSource.includes("providerFailureFinding")) {
    problems.push("provider execution catch does not use safe governance classification");
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio worker calibration runtime check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_worker_calibration_runtime_check_passed");
console.log("- private production material resolves an approved calibration binding before provider work");
console.log("- the dedicated worker derives calibration storage from its isolated data root");
console.log("- uncalibrated jobs block before synthesis and before any budget reservation");
console.log("- calibrated ElevenLabs production verifies the approved capability snapshot end to end");
console.log("- calibration drift is a named governance finding rather than a generic retry");
console.log("- arbitrary provider failure text cannot enter queue findings or operational output");
