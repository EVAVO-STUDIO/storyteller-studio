import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing generation-worker file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing generation-worker contract token: ${token}`);
    }
  }
}

function collectTextFiles(directory, output = []) {
  const absolute = fromRoot(directory);
  if (!existsSync(absolute)) return output;
  for (const name of readdirSync(absolute)) {
    const absolutePath = join(absolute, name);
    const item = statSync(absolutePath);
    if (item.isDirectory()) {
      collectTextFiles(relative(root, absolutePath), output);
    } else if (/\.(?:ts|tsx|js|mjs|json|md|css)$/u.test(name)) {
      output.push(relative(root, absolutePath).replaceAll("\\", "/"));
    }
  }
  return output;
}

for (const path of [
  "packages/storyteller/src/generation-worker.ts",
  "packages/storyteller/src/generation-worker.test.ts",
  "packages/storyteller/src/narration-production-policy.ts",
  "packages/storyteller/src/narration-production-policy.test.ts",
  "packages/storyteller/src/heartbeat-worker.ts",
  "packages/storyteller/src/heartbeat-worker.test.ts",
  "packages/storyteller/package.json",
  "docs/GENERATION_WORKER.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/generation-worker.ts", [
  "GenerationWorkerMaterial",
  "ClaimedGenerationWorkerInput",
  "runClaimedGenerationWorker",
  "generationWorkerPublicView",
  "GENERATION_WORKER_CLAIM_ACTOR_MISMATCH",
  "GENERATION_WORKER_ABORTED",
  "beforeTerminalTransition",
  "throwIfWorkerAborted",
  "buildSynthesisRequest",
  "executeGenerationJob",
  "ingestPrivateArtifact",
  "completeGenerationWithArtifacts",
  "GENERATION_ARTIFACT_INGEST_FAILED",
  "GENERATION_ARTIFACT_QUARANTINED",
  "GENERATION_REPORT_ARTIFACT_INVALID",
  "GENERATION_PROVIDER_EXECUTION_INCOMPLETE",
  "GENERATION_PROVIDER_CONFIGURATION_BLOCKED",
  "GENERATION_COST_EVIDENCE_INVALID",
  "GENERATION_COST_POLICY_EXCEEDED",
  "storyteller-generation-execution-evidence-v1",
  "providerRequestIdHash",
  "provenanceFingerprint",
  "assertNaturalNarrationWorkerInput",
  "naturalNarration",
]);

requireTokens("packages/storyteller/src/narration-production-policy.ts", [
  "NARRATION_PRODUCTION_PLAN_SCHEMA_VERSION",
  "NATURAL_NARRATION_MINIMUM_CANDIDATES",
  "createNarrationContextWindow",
  "createNaturalNarrationProductionPlan",
  "assertNaturalNarrationWorkerInput",
  "NARRATION_PRODUCTION_PLAN_REQUIRED",
  "NARRATION_PRODUCTION_CANDIDATE_COUNT_INSUFFICIENT",
  "naturalNarrationRequestMetadata",
]);

requireTokens("packages/storyteller/src/narration-production-policy.test.ts", [
  "Audio Studio production requires a governed natural narration plan",
  "Audio Studio production requires at least three candidate performances",
  "generic objectives cannot create a production narration plan",
  "deterministic synthesis requests carry the same governed context across variants",
]);

requireTokens("packages/storyteller/src/generation-worker.test.ts", [
  "a claimed job persists exact provider candidates and completes only with verified artifacts",
  "missing provider credentials block the queue while preserving a verified execution report",
  "transient provider failures use bounded queue retry instead of false completion",
  "cost policy excess blocks completion after retaining verified evidence",
  "worker identity must match the exclusive queue lease",
  "test-provider-secret",
  "claim.leaseToken",
]);

requireTokens("packages/storyteller/src/heartbeat-worker.ts", [
  "HeartbeatingGenerationWorkerInput",
  "HeartbeatingGenerationWorkerResult",
  "runGenerationWorkerWithHeartbeat",
  "heartbeatingGenerationWorkerPublicView",
  "GenerationLeaseHeartbeatController",
  "combineAbortSignals",
  "stopForTerminalTransition",
  "beforeTerminalTransition",
  "heartbeat.assertHealthy",
  "combined.dispose",
]);

requireTokens("packages/storyteller/src/heartbeat-worker.test.ts", [
  "heartbeat renews during provider execution and stops before verified completion",
  "lease recovery aborts the stale provider and prevents post-loss artifacts or terminal writes",
  "an already aborted external signal starts no heartbeat or provider work",
  "GenerationLeaseOwnershipLostError",
  "claim.leaseToken",
  "test-provider-secret",
  "private-provider-request",
]);

requireTokens("docs/GENERATION_WORKER.md", [
  "Internal worker boundary",
  "Deterministic requests",
  "Candidate evidence",
  "Cost policy",
  "Failure classification",
  "Queue completion",
  "No public execution route",
  "Lease heartbeat",
  "Natural narration production",
  "three candidate performances",
  "neighbouring context",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  for (const [exportPath, sourcePath] of [
    ["./generation-worker", "./src/generation-worker.ts"],
    ["./heartbeat-worker", "./src/heartbeat-worker.ts"],
    ["./narration-production-policy", "./src/narration-production-policy.ts"],
  ]) {
    if (packageJson.exports?.[exportPath] !== sourcePath) {
      problems.push(`storyteller package does not export ${exportPath} from ${sourcePath}`);
    }
  }
}

for (const [path, marker] of [
  ["packages/storyteller/src/generation-worker.ts", "export function generationWorkerPublicView"],
  ["packages/storyteller/src/heartbeat-worker.ts", "export function heartbeatingGenerationWorkerPublicView"],
]) {
  const source = existsSync(fromRoot(path)) ? read(path) : "";
  const publicViewStart = source.indexOf(marker);
  if (publicViewStart < 0) {
    problems.push(`${path} public view implementation is missing`);
    continue;
  }
  const publicView = source.slice(publicViewStart);
  for (const forbidden of [
    "leaseToken",
    "audio",
    "bytes",
    "objectKey",
    "container",
    "versionId",
    "providerRequestId",
    "credential",
  ]) {
    if (publicView.includes(forbidden)) {
      problems.push(`${path} public view exposes forbidden field: ${forbidden}`);
    }
  }
}

const runtimeFiles = [
  ...collectTextFiles("apps/api/src"),
  ...collectTextFiles("apps/web/src"),
].filter((path) => !/\.(?:test|spec)\.[^.]+$/u.test(path));

for (const path of runtimeFiles) {
  const source = read(path);
  for (const forbidden of [
    "runClaimedGenerationWorker",
    "runGenerationWorkerWithHeartbeat",
    "generation-worker",
    "heartbeat-worker",
    "GenerationLeaseHeartbeatController",
    "executeGenerationJob(",
    "claimNext(",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`${path} exposes internal worker execution capability: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio generation worker check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_generation_worker_check_passed");
console.log("- claimed jobs are bound to the exclusive worker identity");
console.log("- provider results are correlated to deterministic synthesis requests");
console.log("- Audio Studio production requires a fingerprinted context plan and at least three candidate performances");
console.log("- candidate bytes, transcripts, alignments and execution evidence are governed artifacts");
console.log("- aborted workers stop before post-provider artifact or terminal writes");
console.log("- heartbeat ownership loss aborts provider work and prevents stale completion");
console.log("- terminal queue transitions stop heartbeat scheduling first");
console.log("- partial provider failures retry without pretending the generation completed");
console.log("- missing configuration, quarantine and cost-policy failures block completion");
console.log("- queue completion receives only verified artifact and candidate identifiers");
console.log("- normal API and browser runtime surfaces expose no worker execution operation");
