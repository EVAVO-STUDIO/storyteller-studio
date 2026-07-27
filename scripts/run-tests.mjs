import { readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scope = process.argv[2] ?? "all";
const rootsByScope = Object.freeze({
  engine: ["packages/storyteller/src"],
  api: ["apps/api/src"],
  cli: ["packages/cli/src"],
  all: ["packages/storyteller/src", "apps/api/src", "packages/cli/src"],
});

if (!Object.prototype.hasOwnProperty.call(rootsByScope, scope)) {
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

const files = rootsByScope[scope]
  .flatMap((directory) => collectTests(directory))
  .sort((left, right) => left.localeCompare(right, "en-AU"));

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
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(`TEST_RUNNER_SPAWN_FAILED:${result.error.message}`);
  process.exit(1);
}

if (result.signal) {
  console.error(`TEST_RUNNER_SIGNALLED:${result.signal}`);
  process.exit(1);
}

const exitCode = result.status ?? 1;
if (exitCode !== 0) console.error(`TEST_SCOPE_FAILED:${scope}:exit-${exitCode}`);
process.exit(exitCode);
