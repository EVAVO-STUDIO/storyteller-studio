#!/usr/bin/env node

import fs from "node:fs";

const packageDocument = JSON.parse(fs.readFileSync("package.json", "utf8"));
const lockDocument = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const runtime = fs.readFileSync(".nvmrc", "utf8").trim();
const workflow = fs.readFileSync(
  ".github/workflows/evavo-mainline-verification.yml",
  "utf8",
);
const errors = [];
const lockRoot = lockDocument.packages?.[""];

if (runtime !== "24.18.0") {
  errors.push(`.nvmrc must remain 24.18.0, found ${runtime || "empty"}.`);
}
if (lockDocument.lockfileVersion !== 3) {
  errors.push("package-lock.json must remain lockfileVersion 3.");
}
if (!lockRoot || typeof lockRoot !== "object") {
  errors.push("package-lock.json must retain a root package record.");
} else {
  for (const field of ["name", "version"]) {
    if (lockRoot[field] !== packageDocument[field]) {
      errors.push(`package-lock root ${field} must match package.json.`);
    }
  }
  for (const field of ["workspaces", "devDependencies", "engines"]) {
    if (
      JSON.stringify(lockRoot[field] ?? {}) !==
      JSON.stringify(packageDocument[field] ?? {})
    ) {
      errors.push(`package-lock root ${field} must exactly match package.json.`);
    }
  }
}

for (const [path, record] of Object.entries(lockDocument.packages ?? {})) {
  if (!record || typeof record !== "object") continue;
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    for (const [name, specification] of Object.entries(record[field] ?? {})) {
      if (["latest", "*"].includes(String(specification).trim())) {
        errors.push(`${path || "."} ${field}.${name} must not use ${specification}.`);
      }
    }
  }
}

for (const [name, expected] of Object.entries({
  verify: "npm run verify:foundation && npm run verify:private-boundary && npm run verify:artifacts && npm run typecheck && npm run test",
  build: "npm run build --workspaces --if-present",
  typecheck: "tsc --noEmit",
  test: "node scripts/run-tests.mjs all",
})) {
  if (packageDocument.scripts?.[name] !== expected) {
    errors.push(`package.json scripts.${name} must remain ${expected}.`);
  }
}

for (const token of [
  "name: EVAVO mainline verification",
  "workflow_dispatch:",
  "expected_sha:",
  "request_source:",
  "group: storyteller-${{ inputs.expected_sha }}",
  "cancel-in-progress: false",
  "permissions:\n  contents: read",
  "ref: ${{ inputs.expected_sha }}",
  "fetch-depth: 0",
  "persist-credentials: false",
  "actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955",
  "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
  "node-version-file: .nvmrc",
  "npm install --global npm@10.9.2 --no-audit --no-fund",
  "npm ci --no-audit --no-fund",
  "node scripts/check-release-contract.mjs",
  "npm run verify",
  "npm run build",
  "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
  "retention-days: 14",
]) {
  if (!workflow.includes(token)) {
    errors.push(`Verification workflow is missing ${token}.`);
  }
}

for (const forbidden of [
  "\n  push:",
  "\n  pull_request:",
  "\n  schedule:",
  "\n  workflow_run:",
  "\n  repository_dispatch:",
  "contents: write",
  "packages: write",
  "pull-requests: write",
  "id-token: write",
  "persist-credentials: true",
  "npm publish",
  "vercel deploy",
  "wrangler deploy",
  "git push",
  "git commit",
  "secrets.",
  "actions/checkout@v",
  "actions/setup-node@v",
  "actions/upload-artifact@v",
]) {
  if (workflow.includes(forbidden)) {
    errors.push(`Verification workflow contains forbidden ${forbidden.trim()}.`);
  }
}

const report = {
  schemaVersion: "1.0",
  repository: "EVAVO-STUDIO/storyteller-studio",
  runtime,
  npm: "10.9.2",
  lockfileVersion: lockDocument.lockfileVersion ?? null,
  exactShaRequired: true,
  automaticTriggersAllowed: false,
  providerCredentialsRequired: false,
  publicationAllowed: false,
  deploymentAllowed: false,
  passed: errors.length === 0,
  errors,
};

console.log(JSON.stringify(report, null, 2));
if (errors.length > 0) process.exitCode = 1;
