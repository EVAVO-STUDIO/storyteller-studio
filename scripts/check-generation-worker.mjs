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
  "packages/storyteller/package.json",
  "docs/GENERATION_WORKER.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/generation-worker.ts", [
  "GenerationWorkerMaterial",
  "ClaimedGenerationWorkerInput",
  "runClaimedGenerationWorker",
  "generationWorkerPublicView",
  "GENERATION_WORKER_CLAIM_ACTOR_MISMATCH",
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

requireTokens("docs/GENERATION_WORKER.md", [
  "Internal worker boundary",
  "Deterministic requests",
  "Candidate evidence",
  "Cost policy",
  "Failure classification",
  "Queue completion",
  "No public execution route",
  "Lease heartbeat",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./generation-worker"] !== "./src/generation-worker.ts") {
    problems.push("storyteller package does not export ./generation-worker from its governed source module");
  }
}

const workerSource = existsSync(fromRoot("packages/storyteller/src/generation-worker.ts"))
  ? read("packages/storyteller/src/generation-worker.ts")
  : "";
const publicViewStart = workerSource.indexOf("export function generationWorkerPublicView");
if (publicViewStart < 0) {
  problems.push("generation worker public view implementation is missing");
} else {
  const publicView = workerSource.slice(publicViewStart);
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
      problems.push(`generation worker public view exposes forbidden field: ${forbidden}`);
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
    "generation-worker",
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
console.log("- candidate bytes, transcripts, alignments and execution evidence are governed artifacts");
console.log("- partial provider failures retry without pretending the generation completed");
console.log("- missing configuration, quarantine and cost-policy failures block completion");
console.log("- queue completion receives only verified artifact and candidate identifiers");
console.log("- normal API and browser runtime surfaces expose no worker execution operation");
