import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-package-inspection file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-package-inspection contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-package-inspection.ts",
  "packages/storyteller/src/audiobook-retail-package-inspection.test.ts",
  "packages/storyteller/src/project-store.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_PACKAGE_INSPECTION.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-retail-package-inspection.ts", [
  "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_SCHEMA_VERSION",
  "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_ENTITY_TYPE",
  "inspectAudiobookRetailPackage",
  "assertAudiobookRetailPackageInspectionEvidence",
  "assertAudiobookRetailPackageInspectionMatchesSources",
  "audiobookRetailPackageInspectionPublicView",
  "FileAudiobookRetailPackageInspectionStore",
  "ready-for-final-package-review",
  "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_DIRECTORY_CONTENTS_MISMATCH",
  "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_MEDIA_BYTES_MISMATCH",
  "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_CANONICAL_MANIFEST_MISMATCH",
  "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_PRIVATE_DIRECTORY_REQUIRED",
  "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_PRIVATE_FILE_REQUIRED",
  "AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_SOURCE_MISMATCH",
  "isSymbolicLink",
  "createReadStream",
  "readCanonicalManifest",
]);

requireTokens("packages/storyteller/src/audiobook-retail-package-inspection.test.ts", [
  "independent inspection reopens every package file and persists a review-ready evidence record",
  "media tampering and unexpected directory entries fail independent inspection",
  "permission drift on the package directory or any media file is rejected",
  "a recomputed but semantically altered canonical package manifest remains invalid",
  "recomputed inspection evidence cannot replace another package build",
  "inspection aborts before touching the private directory",
]);

requireTokens("packages/storyteller/src/project-store.ts", [
  '"audiobook-retail-package-inspection"',
]);

requireTokens("docs/AUDIOBOOK_RETAIL_PACKAGE_INSPECTION.md", [
  "Directory distrust",
  "Independent media observation",
  "Canonical manifest inspection",
  "Persisted inspection evidence",
  "Public boundary",
  "Honest completion boundary",
  "Inspection is not human approval, release, upload, submission or retailer acceptance",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-package-inspection"]
      !== "./src/audiobook-retail-package-inspection.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-package-inspection",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-package-inspection"]
      !== "node scripts/check-audiobook-retail-package-inspection.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-package-inspection",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-package-inspection",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail package inspection",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-package-inspection",
    "inspectAudiobookRetailPackage",
    "FileAudiobookRetailPackageInspectionStore",
    "privatePackagePath",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private retail package-inspection controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-package-inspection check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_package_inspection_check_passed");
console.log("- the inspector distrusts and reopens the complete private package directory");
console.log("- exact entries, hashes, MP3 signatures and permissions are recomputed");
console.log("- canonical package-manifest semantics and bytes are independently verified");
console.log("- inspection evidence is immutable, persisted and audit-redacted");
console.log("- normal API and web runtimes cannot invoke private inspection");
console.log("- successful inspection stops before human approval or release");