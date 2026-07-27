import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing calibrated ElevenLabs file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing calibrated ElevenLabs contract token: ${token}`);
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
  "FileCalibrationSessionStore",
  "FileGenerationCalibrationBindingStore",
  "createProductionCalibrationLock",
  "persistCalibrationAndBinding",
  "approvedCapabilityFingerprint",
  "FileBudgetLedger",
  "FileGenerationMaterialStore",
  "FileGenerationQueue",
  "FileArtifactRegistry",
  "createWorkerProviderRegistry",
  "runConfiguredWorkerRuntime",
  "engineeringRunner.commands.length, 6",
  "ElevenLabsEngineeringRunner",
  "resolveWorkerAudioEngineeringPolicy",
  'providerFallbackIds: ["elevenlabs"]',
  'mode: "production"',
  'format: "wav"',
  "sampleRateHz: 44_100",
  "maximumTotalEstimatedCost: 0.1",
  "authorisedMicros: budgetMicros(1)",
  'endpoint.searchParams.get("output_format")',
  'endpoint.searchParams.get("enable_logging")',
  "assert.equal(body.text, text)",
  'assert.equal(body.model_id, "eleven_multilingual_v2")',
  "outputArtifactRefs.length, 5",
  "committedMicros, 1_680",
  'verification.status, "verified"',
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
  "requireAudioEngineering: true",
  "WORKER_AUDIO_ENGINEERING_POLICY_REQUIRED",
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

requireTokens("packages/storyteller/src/generation-worker.ts", [
  "runClaimedGenerationWorker",
  "ingestResultArtifacts",
  "ingestExecutionReport",
  "completeGenerationWithArtifacts",
  "beforeTerminalTransition",
]);

requireTokens("packages/storyteller/src/generation-budget.ts", [
  "FileGenerationBudgetController",
  "reserve(",
  "settle(",
  "GENERATION_BUDGET_COMPLETED",
]);

requireTokens("packages/storyteller/src/artifact-ingest.ts", [
  "ingestPrivateArtifact",
  "verifyArtifactIntegrity",
  "quarantine",
]);

requireTokens("packages/storyteller/src/artifact-queue.ts", [
  "completeGenerationWithArtifacts",
  "assessQueueCompletionArtifacts",
  "beforeQueueComplete",
  "input.queue.complete",
]);

requireTokens("packages/storyteller/src/elevenlabs-adapter.ts", [
  "ElevenLabsNarrationAdapter",
  "/with-timestamps",
  "original_alignment",
  "ELEVENLABS_ALIGNMENT_TEXT_MISMATCH",
]);

requireTokens("docs/ELEVENLABS_PRODUCTION_PATH.md", [
  "Governed ElevenLabs Production Path",
  "Approved calibration admission",
  "production calibration lock",
  "per-job calibration binding",
  "Exact provider request",
  "Transactional budget proof",
  "Queue completion evidence",
  "What the fixture does not prove",
]);

const fixture = existsSync(fromRoot("apps/worker/src/elevenlabs-generation.test.ts"))
  ? read("apps/worker/src/elevenlabs-generation.test.ts")
  : "";
const orderedFixtureTokens = [
  "const configuration = resolveWorkerRuntimeConfiguration",
  "const ledger = new FileBudgetLedger",
  "await materials.create(job, material()",
  "const approvedCalibration = await persistCalibrationAndBinding",
  "await queue.enqueue(job",
  "const providers = createWorkerProviderRegistry",
  "const result = await runConfiguredWorkerRuntime",
  "const queueEnvelope = await queue.read",
  "const budget = await ledger.require",
  "const artifactRows = await registry.list",
];
let previous = -1;
for (const token of orderedFixtureTokens) {
  const index = fixture.indexOf(token, previous + 1);
  if (index < 0) {
    problems.push(`calibrated ElevenLabs fixture sequence is missing: ${token}`);
    continue;
  }
  previous = index;
}

const runtime = existsSync(fromRoot("apps/worker/src/runtime.ts"))
  ? read("apps/worker/src/runtime.ts")
  : "";
const orderedRuntimeTokens = [
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
for (const token of orderedRuntimeTokens) {
  const index = runtime.indexOf(token, previous + 1);
  if (index < 0) {
    problems.push(`calibrated worker runtime sequence is missing: ${token}`);
    continue;
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
  if (!fixture.includes(sentinel)) {
    problems.push(`calibrated ElevenLabs fixture is missing redaction sentinel: ${sentinel}`);
  }
}
if (!fixture.includes("assert.equal(serialised.includes(forbidden), false)")) {
  problems.push("calibrated ElevenLabs fixture does not assert redacted runtime output");
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const source = read(path);
  for (const forbidden of [
    "runConfiguredWorkerRuntime",
    "FileGenerationCalibrationBindingStore",
    "CalibratedGenerationMaterialStore",
    "createCalibrationBoundProviderRegistry",
    "ingestPrivateArtifact",
    "completeGenerationWithArtifacts",
    "/with-timestamps",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`${path} exposes the private calibrated production path: ${forbidden}`);
    }
  }
}

for (const path of [
  ".github/workflows/one-time-calibrated-elevenlabs-verifier.yml",
  ".github/calibrated-elevenlabs-verifier.trigger",
  ".github/workflows/one-time-calibrated-elevenlabs-verifier-v2.yml",
  ".github/calibrated-elevenlabs-verifier-v2.trigger",
  "scripts/check-elevenlabs-generation-v2.mjs",
  "scripts/check-elevenlabs-generation-current.mjs",
]) {
  if (existsSync(fromRoot(path))) {
    problems.push(`temporary calibrated verifier file remains: ${path}`);
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio calibrated ElevenLabs generation check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_calibrated_elevenlabs_generation_check_passed");
console.log("- production synthesis requires an approved calibration session and immutable per-job lock");
console.log("- calibrated material is resolved before provider credentials, budget reservation or synthesis");
console.log("- provider, model and capability evidence are rechecked around the exact request");
console.log("- project budget is reserved before provider work and actual cost is committed before completion");
console.log("- verified audio, transcript, alignment, independent engineering and execution evidence back queue completion");
console.log("- API, browser and operational outputs omit private calibration, credential and storage evidence");
console.log("- the deterministic fixture proves orchestration, not real narrator quality or release readiness");
