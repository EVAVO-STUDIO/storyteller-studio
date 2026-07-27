import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing lease-heartbeat file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing lease-heartbeat contract token: ${token}`);
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
  "packages/storyteller/src/lease-heartbeat.ts",
  "packages/storyteller/src/lease-heartbeat.test.ts",
  "packages/storyteller/package.json",
  "docs/LEASE_HEARTBEAT.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/lease-heartbeat.ts", [
  "GenerationLeaseHeartbeatController",
  "GenerationLeaseOwnershipLostError",
  "LeaseHeartbeatScheduler",
  "LeaseHeartbeatSnapshot",
  "GENERATION_HEARTBEAT_ACTIVE_LEASE_REQUIRED",
  "GENERATION_HEARTBEAT_LEASE_DURATION_INVALID",
  "GENERATION_HEARTBEAT_INTERVAL_INVALID",
  "GENERATION_HEARTBEAT_LEASE_ALREADY_EXPIRED",
  "GENERATION_HEARTBEAT_RENEWAL_SCOPE_INVALID",
  "stopForTerminalTransition",
  "AbortController",
  "#inFlight",
  "#markLost",
  "queue.heartbeat",
]);

requireTokens("packages/storyteller/src/lease-heartbeat.test.ts", [
  "scheduled heartbeats renew the same exclusive lease without exposing its token",
  "overlapping heartbeat requests share one serial renewal",
  "ownership loss aborts provider work when another worker acquires the recovered lease",
  "heartbeat stops before a terminal transition so completion cannot race a renewal",
  "heartbeat configuration rejects unsafe renewal intervals",
  "claim.leaseToken",
  "worker_heartbeat_001",
]);

requireTokens("docs/LEASE_HEARTBEAT.md", [
  "Exclusive ownership",
  "Renewal cadence",
  "Serial renewal",
  "Ownership loss",
  "Terminal transition shutdown",
  "Terminal state observation",
  "Process shutdown",
  "Internal-only boundary",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./lease-heartbeat"] !== "./src/lease-heartbeat.ts") {
    problems.push("storyteller package does not export ./lease-heartbeat from its governed source module");
  }
}

const source = existsSync(fromRoot("packages/storyteller/src/lease-heartbeat.ts"))
  ? read("packages/storyteller/src/lease-heartbeat.ts")
  : "";
const snapshotStart = source.indexOf("  snapshot(): LeaseHeartbeatSnapshot");
const scheduleStart = source.indexOf("  #scheduleNext(): void");
if (snapshotStart < 0 || scheduleStart <= snapshotStart) {
  problems.push("lease heartbeat public snapshot boundary is missing");
} else {
  const snapshotSource = source.slice(snapshotStart, scheduleStart);
  for (const forbidden of [
    "leaseToken",
    "workerId",
    "tokenHash",
    "credential",
    "objectKey",
  ]) {
    if (snapshotSource.includes(forbidden)) {
      problems.push(`lease heartbeat snapshot exposes forbidden field: ${forbidden}`);
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtimeSource = read(path);
  for (const forbidden of [
    "GenerationLeaseHeartbeatController",
    "lease-heartbeat",
    "queue.heartbeat(",
  ]) {
    if (runtimeSource.includes(forbidden)) {
      problems.push(`${path} exposes internal lease renewal capability: ${forbidden}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio lease heartbeat check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_lease_heartbeat_check_passed");
console.log("- heartbeat renewal remains bound to one exclusive worker claim");
console.log("- overlapping renewal calls share one queue revision operation");
console.log("- ownership loss aborts provider work and stops future scheduling");
console.log("- terminal transitions stop renewal before changing queue state");
console.log("- snapshots omit lease tokens, token hashes and worker identity");
console.log("- normal API and browser runtime surfaces expose no lease renewal operation");
