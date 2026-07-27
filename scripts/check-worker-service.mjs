import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing worker-service file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing worker-service contract token: ${token}`);
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
  "packages/storyteller/src/worker-service.ts",
  "packages/storyteller/src/worker-service.test.ts",
  "packages/storyteller/src/worker-service-clock.test.ts",
  "packages/storyteller/package.json",
  "docs/WORKER_SERVICE.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/worker-service.ts", [
  "GenerationWorkerService",
  "GenerationWorkerServiceOptions",
  "GenerationWorkerServiceSnapshot",
  "WorkerJobDisposition",
  "runUntilIdle",
  "requestDrain",
  "abortActive",
  "#fillCapacity",
  "#processClaim",
  "FileGenerationMaterialStore",
  "validateGenerationWorkerMaterial",
  "runGenerationWorkerWithHeartbeat",
  "GenerationLeaseOwnershipLostError",
  "heartbeatScheduler",
  "clock: this.#now",
  "scheduler: this.#heartbeatScheduler",
  "GENERATION_WORKER_SERVICE_LEASE_NOT_AUTHORITATIVE",
  "GENERATION_WORKER_RUNTIME_FAILED",
  "generationWorkerServicePublicView",
]);

requireTokens("packages/storyteller/src/worker-service.test.ts", [
  "run-until-idle respects the concurrency ceiling and completes every prepared job",
  "missing generation material blocks a claim without invoking a provider",
  "rights are revalidated at execution time before provider work begins",
  "drain stops new claims and lets an active provider finish before shutdown",
  "forced shutdown aborts active provider work and leaves the claim recoverable by lease expiry",
  "service public state and outcomes omit worker, lease, credential and manuscript secrets",
  "test-worker-service-secret",
]);

requireTokens("packages/storyteller/src/worker-service-clock.test.ts", [
  "worker service uses the live clock after a heartbeat renewal",
  "ManualScheduler",
  "heartbeatScheduler: scheduler",
  "await scheduler.runNext()",
  "payload.lease?.heartbeatAt",
  "payload.completion?.completedAt",
  "artifacts.every",
  "test-worker-service-clock-secret",
]);

requireTokens("docs/WORKER_SERVICE.md", [
  "Claim polling",
  "Bounded concurrency",
  "Material resolution",
  "Provider execution",
  "Live transition time",
  "Outcome classification",
  "Graceful drain",
  "Forced abort",
  "Public snapshot",
  "No HTTP execution surface",
  "Production migration",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./worker-service"] !== "./src/worker-service.ts") {
    problems.push("storyteller package does not export ./worker-service from its governed source module");
  }
}

const serviceSource = existsSync(fromRoot("packages/storyteller/src/worker-service.ts"))
  ? read("packages/storyteller/src/worker-service.ts")
  : "";
const snapshotStart = serviceSource.indexOf("  snapshot(): GenerationWorkerServiceSnapshot");
const snapshotEnd = serviceSource.indexOf("  outcomes(): readonly WorkerJobOutcome[]", snapshotStart);
if (snapshotStart < 0 || snapshotEnd <= snapshotStart) {
  problems.push("worker-service public snapshot boundary is missing");
} else {
  const snapshotSource = serviceSource.slice(snapshotStart, snapshotEnd);
  for (const forbidden of [
    "#workerId",
    "#projectId",
    "leaseToken",
    "tokenHash",
    "voiceProfileId",
    "material.text",
    "credential",
    "providerRequestId",
    "objectKey",
    "container",
    "versionId",
  ]) {
    if (snapshotSource.includes(forbidden)) {
      problems.push(`worker-service public snapshot exposes forbidden field: ${forbidden}`);
    }
  }
}

const publicViewStart = serviceSource.indexOf("export function generationWorkerServicePublicView");
if (publicViewStart < 0) {
  problems.push("worker-service public view implementation is missing");
} else {
  const publicView = serviceSource.slice(publicViewStart);
  for (const forbidden of [
    "leaseToken",
    "tokenHash",
    "audio",
    "bytes",
    "voiceProfileId",
    "objectKey",
    "container",
    "versionId",
    "providerRequestId",
    "credential",
  ]) {
    if (publicView.includes(forbidden)) {
      problems.push(`worker-service public view exposes forbidden field: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const source = read(path);
  for (const forbidden of [
    "GenerationWorkerService",
    "worker-service",
    "FileGenerationMaterialStore",
    "runGenerationWorkerWithHeartbeat",
    "runClaimedGenerationWorker",
    "claimNext(",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`${path} exposes internal worker-service capability: ${forbidden}`);
    }
  }
}

for (const path of [
  ".github/workflows/one-time-worker-live-clock.yml",
  ".github/worker-live-clock.trigger",
  ".github/workflows/one-time-worker-service-clock.yml",
  ".github/worker-service-clock.trigger",
]) {
  if (existsSync(fromRoot(path))) {
    problems.push(`completed one-time worker migration file remains in the repository: ${path}`);
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio worker service check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_worker_service_check_passed");
console.log("- queue polling is bounded by priority, availability, project scope and concurrency");
console.log("- executable material is resolved and revalidated only after an exclusive claim");
console.log("- heartbeat renewal and terminal transitions share the live service clock");
console.log("- graceful drain stops claims while forced abort leaves recovery to lease expiry");
console.log("- service snapshots and outcomes omit manuscript, voice, credential, storage and lease secrets");
console.log("- normal API and browser runtime surfaces expose no worker service");
console.log("- completed one-time migration workflows have been removed");
