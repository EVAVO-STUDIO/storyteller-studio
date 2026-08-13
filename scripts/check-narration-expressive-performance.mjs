import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

function absolute(path) {
  return resolve(repositoryRoot, path);
}

function fail(code) {
  console.error(code);
  process.exit(1);
}

function read(path) {
  try {
    return readFileSync(absolute(path), "utf8");
  } catch {
    fail(`EXPRESSIVE_VERIFICATION_FILE_MISSING:${path}`);
  }
}

const requiredFiles = Object.freeze({
  "packages/storyteller/src/narration-expressive-performance.ts": 10_000,
  "packages/storyteller/src/narration-expressive-performance.test.ts": 6_000,
  "packages/storyteller/src/expressive-cast-continuity.ts": 12_000,
  "packages/storyteller/src/expressive-cast-continuity.test.ts": 8_000,
  "docs/NARRATION_EXPRESSIVE_PERFORMANCE.md": 2_000,
  "docs/EXPRESSIVE_CAST_CONTINUITY.md": 2_000,
  "examples/expressive-character-cast.example.json": 500,
});

for (const [path, minimumBytes] of Object.entries(requiredFiles)) {
  let size = 0;
  try {
    size = statSync(absolute(path)).size;
  } catch {
    fail(`EXPRESSIVE_VERIFICATION_FILE_MISSING:${path}`);
  }
  if (size < minimumBytes) {
    fail(`EXPRESSIVE_VERIFICATION_FILE_TRUNCATED:${path}:${size}`);
  }
}

const enginePackage = JSON.parse(read("packages/storyteller/package.json"));
if (
  enginePackage.exports?.["./narration-expressive-performance"]
  !== "./src/narration-expressive-performance.ts"
) {
  fail("EXPRESSIVE_VERIFICATION_PACKAGE_EXPORT_MISSING");
}
if (
  enginePackage.exports?.["./expressive-cast-continuity"]
  !== "./src/expressive-cast-continuity.ts"
) {
  fail("EXPRESSIVE_CAST_VERIFICATION_PACKAGE_EXPORT_MISSING");
}

const rootPackage = JSON.parse(read("package.json"));
if (
  rootPackage.scripts?.["verify:expressive-narration"]
  !== "node scripts/check-narration-expressive-performance.mjs"
) {
  fail("EXPRESSIVE_VERIFICATION_ROOT_SCRIPT_MISSING");
}
if (
  typeof rootPackage.scripts?.["verify:calibration"] !== "string"
  || !rootPackage.scripts["verify:calibration"].includes(
    "npm run verify:expressive-narration",
  )
) {
  fail("EXPRESSIVE_VERIFICATION_CALIBRATION_CHAIN_MISSING");
}

const testRunner = read("scripts/run-tests.mjs");
for (const requiredTest of [
  "packages/storyteller/src/narration-expressive-performance.test.ts",
  "packages/storyteller/src/expressive-cast-continuity.test.ts",
]) {
  if (!testRunner.includes(requiredTest)) {
    fail(`EXPRESSIVE_VERIFICATION_AUDIO_STUDIO_SCOPE_MISSING:${requiredTest}`);
  }
}

const source = read(
  "packages/storyteller/src/narration-expressive-performance.ts",
).toLocaleLowerCase("en-AU");
for (const requiredTerm of [
  "style-instructions",
  "requires-regeneration",
  "cadence",
  "emotion",
  "voice",
]) {
  if (!source.includes(requiredTerm)) {
    fail(`EXPRESSIVE_VERIFICATION_SOURCE_CONTRACT_MISSING:${requiredTerm}`);
  }
}

const tests = read(
  "packages/storyteller/src/narration-expressive-performance.test.ts",
).toLocaleLowerCase("en-AU");
for (const requiredTerm of [
  "generic",
  "synthetic",
  "cadence",
  "voice",
  "fallback",
]) {
  if (!tests.includes(requiredTerm)) {
    fail(`EXPRESSIVE_VERIFICATION_REGRESSION_MISSING:${requiredTerm}`);
  }
}

const continuitySource = read(
  "packages/storyteller/src/expressive-cast-continuity.ts",
);
for (const requiredTerm of [
  "appendOnly: true",
  "automaticRecastAuthority: false",
  "automaticPerformanceRewriteAuthority: false",
  "EXPRESSIVE_CAST_CADENCE_TEMPLATE_OVERUSE",
  "assertExpressiveCastRouteMaterial",
  "assertExpressiveCastContinuityRevision",
]) {
  if (!continuitySource.includes(requiredTerm)) {
    fail(`EXPRESSIVE_CAST_VERIFICATION_CONTRACT_MISSING:${requiredTerm}`);
  }
}

const continuityTests = read(
  "packages/storyteller/src/expressive-cast-continuity.test.ts",
).toLocaleLowerCase("en-AU");
for (const requiredTerm of [
  "silent character recast",
  "append-only",
  "generic direction",
  "public continuity state",
  "worker requests",
]) {
  if (!continuityTests.includes(requiredTerm)) {
    fail(`EXPRESSIVE_CAST_VERIFICATION_REGRESSION_MISSING:${requiredTerm}`);
  }
}

const castExample = JSON.parse(
  read("examples/expressive-character-cast.example.json"),
);
if (
  !castExample
  || typeof castExample !== "object"
  || Array.isArray(castExample)
  || Object.keys(castExample).length < 2
) {
  fail("EXPRESSIVE_VERIFICATION_CAST_EXAMPLE_INVALID");
}

console.log("expressive_narration_verification=ok");
console.log(`expressive_narration_contract_files=${Object.keys(requiredFiles).length}`);
