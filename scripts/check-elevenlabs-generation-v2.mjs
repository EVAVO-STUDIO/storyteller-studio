import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing ElevenLabs generation file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing ElevenLabs generation contract token: ${token}`);
    }
  }
}

for (const path of [
  "apps/worker/src/elevenlabs-generation.test.ts",
  "apps/worker/src/runtime.ts",
  "packages/storyteller/src/calibration-admission.ts",
  "packages/storyteller/src/generation-calibration.ts",
  "packages/storyteller/src/generation-worker.ts",
  "packages/storyteller/src/generation-budget.ts",
  "packages/storyteller/src/artifact-ingest.ts",
  "packages/storyteller/src/artifact-queue.ts",
  "packages/storyteller/src/elevenlabs-adapter.ts",
  "docs/ELEVENLABS_PRODUCTION_PATH.md",
]) requireFile(path);

requireTokens("apps/worker/src/elevenlabs-generation.test.ts", [
  "queued ElevenLabs production requires approved calibration, reserves budget, verifies artifacts and completes with exact evidence",
  "createWorkerProviderRegistry",
  "runConfiguredWorkerRuntime",
  "FileGenerationQueue",
  "FileGenerationMaterialStore",
  "FileBudgetLedger",
  "FileCalibrationSessionStore",
  "FileGenerationCalibrationBindingStore",
  "createProductionCalibrationLock",
  "persistCalibrationAndBinding",
  "approvedCapabilityFingerprint",
  "FileArtifactRegistry",
  "premadeVoice0001",
  "eleven_multilingual_v2",
  "enable_logging",
  "wav_44100",
  "completedJobs",
  "committedMicros",
  "artifactKinds",
  "artifact_calibration_take_elevenlabs_generation_001",
  "reviewer_elevenlabs_generation_001",
]);

requireTokens("apps/worker/src/runtime.ts", [
  "FileCalibrationSessionStore",
  "FileGenerationCalibrationBindingStore",
  "CalibratedGenerationMaterialStore",
  "createCalibrationBoundProviderRegistry",
  "FileGenerationBudgetController",
  "requireBudget: true",
]);

requireTokens("packages/storyteller/src/calibration-admission.ts", [
  "createProductionCalibrationLock",
  "validatePersistedProductionCalibrationLock",
  "validateProductionCalibrationScope",
  "calibrationExecutionFindingCodes",
]);

requireTokens("packages/storyteller/src/generation-calibration.ts", [
  "FileGenerationCalibrationBindingStore",
  "CalibratedGenerationMaterialStore",
  "createCalibrationBoundProviderRegistry",
  "resolveForMaterial",
  "resolveForRequest",
]);

requireTokens("packages/storyteller/src/generation-budget.ts", [
  "FileGenerationBudgetController",
  "GenerationBudgetSession",
  "GENERATION_BUDGET_COMPLETED",
]);

requireTokens("packages/storyteller/src/generation-worker.ts", [
  "runClaimedGenerationWorker",
  "ingestResultArtifacts",
  "beforeQueueTransition",
]);

requireTokens("packages/storyteller/src/artifact-ingest.ts", [
  "ingestPrivateArtifact",
  "verifyArtifactIntegrity",
]);

requireTokens("packages/storyteller/src/artifact-queue.ts", [
  "completeGenerationWithArtifacts",
  "beforeQueueComplete",
]);

requireTokens("packages/storyteller/src/elevenlabs-adapter.ts", [
  "ElevenLabsNarrationAdapter",
  "/with-timestamps",
  "original_alignment",
  "ELEVENLABS_ALIGNMENT_TEXT_MISMATCH",
]);

requireTokens("docs/ELEVENLABS_PRODUCTION_PATH.md", [
  "Governed ElevenLabs Production Path",
  "approved calibration session",
  "production calibration lock",
  "per-job calibration binding",
  "exact provider request",
  "Transaction budget proof",
  "Queue completion evidence",
  "What the fixture does not prove",
]);

const testSource = existsSync(fromRoot("apps/worker/src/elevenlabs-generation.test.ts"))
  ? read("apps/worker/src/elevenlabs-generation.test.ts")
  : "";
const orderedTokens = [
  "resolveWorkerRuntimeConfiguration",
  "new FileBudgetLedger",
  "materials.create",
  "persistCalibrationAndBinding",
  "queue.enqueue",
  "createWorkerProviderRegistry",
  "runConfiguredWorkerRuntime",
  "queue.read",
  "ledger.require",
  "registry.list",
];
let previous = -1;
for (const token of orderedTokens) {
  const index = testSource.indexOf(token);
  if (index < 0 || index <= previous) {
    problems.push(`ElevenLabs generation fixture sequence is missing or out of order at: ${token}`);
  }
  previous = index;
}

const runtimeSource = existsSync(fromRoot("apps/worker/src/runtime.ts"))
  ? read("apps/worker/src/runtime.ts")
  : "";
const runtimeOrder = [
  "const queueState = new FileProjectStore",
  "const calibrationStore = new FileCalibrationSessionStore",
  "const calibrationBindings = new FileGenerationCalibrationBindingStore",
  "const materials = new CalibratedGenerationMaterialStore",
  "const providers = createCalibrationBoundProviderRegistry",
  "const budgetController = new FileGenerationBudgetController",
  "const artifactRegistry = new FileArtifactRegistry",
  "return new GenerationWorkerService",
];
previous = -1;
for (const token of runtimeOrder) {
  const index = runtimeSource.indexOf(token);
  if (index < 0 || index <= previous) {
    problems.push(`ElevenLabs calibrated worker runtime sequence is missing or out of order at: ${token}`);
  }
  previous = index;
}

for (const sentinel of [
  "fixture-elevenlabs-generation-secret",
  "premadeVoice0001",
  "Aelwyn waited.",
  "artifact_calibration_take_elevenlabs_generation_001",
  "reviewer_elevenlabs_generation_001",
  "greg_parker",
]) {
  if (!testSource.includes(sentinel)) {
    problems.push(`ElevenLabs generation fixture is missing redaction sentinel: ${sentinel}`);
  }
}
if (!testSource.includes("assert.equal(serialised.includes(forbidden), false)")) {
  problems.push("ElevenLabs generation fixture does not assert redacted runtime output");
}

if (problems.length > 0) {
  console.error("Storyteller Studio ElevenLabs generation check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_elevenlabs_generation_check_passed");
console.log("- the first concrete provider path is proven through the dedicated private worker");
console.log("- an approved calibration session and per-job lock are required before production synthesis");
console.log("- exact manuscript text, deterministic settings, timestamp alignment and media signatures are verified");
console.log("- approved provider, model and capability evidence are rechecked around synthesis");
console.log("- project budget capacity is reserved before provider work and actual cost is committed before completion");
console.log("- private audio, transcript, alignment and execution evidence become verified artifact records");
console.log("- queue completion contains governed references rather than media, credentials, calibration evidence or private locators");
console.log("- the deterministic fixture proves orchestration but does not claim real narrator or release approval");
