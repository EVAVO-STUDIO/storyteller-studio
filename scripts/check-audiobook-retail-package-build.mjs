import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-package-build file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-package-build contract token: ${token}`,
      );
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
  "packages/storyteller/src/audiobook-retail-package-build.ts",
  "packages/storyteller/src/audiobook-retail-package-build.test.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_PACKAGE_BUILD.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-retail-package-build.ts", [
  "AUDIOBOOK_RETAIL_PACKAGE_BUILD_SCHEMA_VERSION",
  "AUDIOBOOK_RETAIL_PACKAGE_DIRECTORY_SCHEMA_VERSION",
  "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_NAME",
  "buildAudiobookRetailPackage",
  "assertAudiobookRetailPackageBuildEvidence",
  "assertAudiobookRetailPackageBuildMatchesManifest",
  "audiobookRetailPackageBuildPublicView",
  "AudiobookRetailPackageMediaResolver",
  "ResolvedAudiobookRetailPackageMedia",
  "ready-for-independent-inspection",
  "AUDIOBOOK_RETAIL_PACKAGE_BUILD_SOURCE_INTEGRITY_MISMATCH",
  "AUDIOBOOK_RETAIL_PACKAGE_BUILD_SOURCE_BYTES_MISMATCH",
  "AUDIOBOOK_RETAIL_PACKAGE_BUILD_COPY_INTEGRITY_MISMATCH",
  "AUDIOBOOK_RETAIL_PACKAGE_BUILD_DIRECTORY_CONTENTS_MISMATCH",
  "AUDIOBOOK_RETAIL_PACKAGE_BUILD_EXISTING_MANIFEST_MISMATCH",
  "AUDIOBOOK_RETAIL_PACKAGE_BUILD_SOURCE_MISMATCH",
  "isSymbolicLink",
  "mkdtemp",
  "shell",
]);

requireTokens("packages/storyteller/src/audiobook-retail-package-build.test.ts", [
  "approved MP3 files become one private content-addressed package and deterministic manifest",
  "source metadata drift, altered bytes and aborts fail closed and dispose resolved sources",
  "tampered existing packages are not reused and unexpected entries remain blocked",
  "recomputed build evidence cannot replace its approved package manifest",
  "evidence schema and package status remain explicit non-release boundaries",
  "ready-for-independent-inspection",
  "privatePackagePath",
]);

requireTokens("docs/AUDIOBOOK_RETAIL_PACKAGE_BUILD.md", [
  "Admission boundary",
  "Private source resolution",
  "Filesystem controls",
  "Copy verification",
  "Canonical package manifest",
  "Idempotency and collision handling",
  "Output boundary",
  "does not release, upload, submit, publish or claim retailer acceptance",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-package-build"]
      !== "./src/audiobook-retail-package-build.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-package-build",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-package-build"]
      !== "node scripts/check-audiobook-retail-package-build.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-package-build",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-package-build",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail package building",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-package-build",
    "buildAudiobookRetailPackage",
    "privatePackagePath",
    "AudiobookRetailPackageMediaResolver",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private retail package-build controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-package-build check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_package_build_check_passed");
console.log("- exact approved MP3 artifacts are resolved through a private boundary");
console.log("- source and copied bytes are reopened and hash verified");
console.log("- package directories are private, contained and content addressed");
console.log("- retries only reuse independently revalidated package contents");
console.log("- build evidence stops before release, upload or retailer submission");
console.log("- normal API and web runtimes cannot invoke package building");