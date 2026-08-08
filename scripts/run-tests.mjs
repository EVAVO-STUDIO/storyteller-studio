import { readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scope = process.argv[2] ?? "all";
const rootsByScope = Object.freeze({
  engine: ["packages/storyteller/src"],
  api: ["apps/api/src"],
  worker: ["apps/worker/src"],
  cli: ["packages/cli/src"],
  all: [
    "packages/storyteller/src",
    "apps/api/src",
    "apps/worker/src",
    "packages/cli/src",
  ],
});

const filesByScope = Object.freeze({
  "audio-studio": Object.freeze([
    "packages/storyteller/src/audio-studio-adapter.test.ts",
    "packages/storyteller/src/generation-material.test.ts",
    "packages/storyteller/src/generation-worker-engineering.test.ts",
    "packages/storyteller/src/generation-worker.test.ts",
    "packages/storyteller/src/narration-production-policy.test.ts",
    "packages/storyteller/src/provider-adapter.test.ts",
    "apps/worker/src/audio-studio-provider.test.ts",
    "apps/worker/src/configuration.test.ts",
    "apps/worker/src/providers-audio-studio.test.ts",
    "apps/worker/src/providers.test.ts",
    "apps/api/src/server.test.ts",
    "packages/cli/src/main.test.ts",
  ]),
});

if (
  !Object.prototype.hasOwnProperty.call(rootsByScope, scope)
  && !Object.prototype.hasOwnProperty.call(filesByScope, scope)
) {
  console.error(`TEST_SCOPE_INVALID:${scope}`);
  process.exit(64);
}

function collectTests(directory, output = []) {
  const absoluteDirectory = resolve(repositoryRoot, directory);
  for (const name of readdirSync(absoluteDirectory)) {
    const absolutePath = resolve(absoluteDirectory, name);
    const metadata = statSync(absolutePath);
    if (metadata.isDirectory()) {
      collectTests(relative(repositoryRoot, absolutePath), output);
      continue;
    }
    if (name.endsWith(".test.ts")) output.push(relative(repositoryRoot, absolutePath));
  }
  return output;
}

const files = (
  filesByScope[scope]
    ? [...filesByScope[scope]]
    : rootsByScope[scope].flatMap((directory) => collectTests(directory))
).sort((left, right) => left.localeCompare(right, "en-AU"));

if (files.length === 0) {
  console.error(`TEST_FILES_NOT_FOUND:${scope}`);
  process.exit(1);
}

console.log(`storyteller_test_scope=${scope}`);
console.log(`storyteller_test_files=${files.length}`);
for (const file of files) console.log(`- ${file}`);

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...files],
  {
    cwd: repositoryRoot,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.error) {
  console.error(`TEST_RUNNER_SPAWN_FAILED:${result.error.message}`);
  process.exit(1);
}

if (result.signal) {
  console.error(`TEST_RUNNER_SIGNALLED:${result.signal}`);
  process.exit(1);
}

const exitCode = result.status ?? 1;
if (exitCode !== 0) {
  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
    .replace(/\u001b\[[0-9;]*m/g, "");
  const lines = combined
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const detail = lines.find((line) =>
    /AssertionError|ERR_[A-Z_]+|failureType:|Could not find|SyntaxError|TypeError|ReferenceError|RangeError|(?:^|\s)Error:/u.test(line),
  );
  const failedTest = lines.find((line) => /^(?:not ok \d+ - |[✖✘]\s+)/u.test(line));
  const primary = detail ?? failedTest ?? `exit-${exitCode}`;
  console.error(`TEST_FAILURE_DIAGNOSTIC:${scope}:${primary}`);
}
process.exit(exitCode);
