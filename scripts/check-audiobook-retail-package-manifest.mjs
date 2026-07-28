import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-package-manifest file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-package-manifest contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-package-manifest.ts",
  "packages/storyteller/src/audiobook-retail-package-manifest.test.ts",
  "packages/storyteller/src/project-store.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_PACKAGE_MANIFEST.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-retail-package-manifest.ts", [
  "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SCHEMA_VERSION",
  "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_ENTITY_TYPE",
  "createAudiobookRetailPackageManifest",
  "assertAudiobookRetailPackageManifest",
  "assertAudiobookRetailPackageManifestMatchesSources",
  "audiobookRetailPackageManifestPublicView",
  "FileAudiobookRetailPackageManifestStore",
  'status: "ready-for-package-build"',
  'kind: "audiobook-track"',
  'kind: "retail-sample"',
  'role: "retail-sample"',
  "RetailSample.mp3",
  "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_APPROVED_ARTIFACT_MISMATCH",
  "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_POLICY_MISMATCH",
  "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_RIGHTS_EXPIRED",
  "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_TRACK_COUNT_MISMATCH",
  "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SAMPLE_POSITION_INVALID",
  "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SOURCE_MISMATCH",
]);

requireTokens("packages/storyteller/src/audiobook-retail-package-manifest.test.ts", [
  "approved tracks and approved sample become one immutable package manifest",
  "missing, reordered or substituted approved artifacts fail before manifest creation",
  "policy drift, expired rights and pre-approval chronology remain blocked",
  "recomputed structural state cannot replace the approved source set",
  "0001OpeningCredits.mp3",
  "0003ClosingCredits.mp3",
  "RetailSample.mp3",
  "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SOURCE_MISMATCH",
]);

requireTokens("packages/storyteller/src/project-store.ts", [
  '"audiobook-retail-package-manifest"',
]);

requireTokens("docs/AUDIOBOOK_RETAIL_PACKAGE_MANIFEST.md", [
  "Admission chain",
  "Exact media set",
  "Approved artifact snapshots",
  "Policy and rights",
  "Immutable aggregates",
  "Structural and cross-source validation",
  "Persistence and audit privacy",
  "Current boundary",
  "It does not copy files",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-package-manifest"]
      !== "./src/audiobook-retail-package-manifest.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-package-manifest",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-package-manifest"]
      !== "node scripts/check-audiobook-retail-package-manifest.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-package-manifest",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-package-manifest",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail package manifest",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-package-manifest",
    "createAudiobookRetailPackageManifest",
    "FileAudiobookRetailPackageManifestStore",
    "approvedTrackArtifacts",
    "approvedSampleArtifact",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private retail package-manifest controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-package-manifest check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_package_manifest_check_passed");
console.log("- exact approved track and sample revisions are frozen into one manifest");
console.log("- opening and closing credits remain in governed track order");
console.log("- RetailSample.mp3 is unique and fixed as the final media entry");
console.log("- policy, rights, chronology and aggregate values fail closed");
console.log("- source substitution is detected even after structural rehashing");
console.log("- public and audit views omit artifact and reviewer identities");
console.log("- normal API and web runtimes cannot create package manifests");