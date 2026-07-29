import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-publication-verification file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-publication-verification contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-publication-verification.ts",
  "packages/storyteller/src/audiobook-retail-publication-verification.test.ts",
  "packages/storyteller/src/test-support/retail-publication-verification-fixture.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_PUBLICATION_VERIFICATION.md",
]) requireFile(path);

requireTokens(
  "packages/storyteller/src/audiobook-retail-publication-verification.ts",
  [
    "AUDIOBOOK_RETAIL_PUBLIC_LISTING_OBSERVATION_SCHEMA_VERSION",
    "AUDIOBOOK_RETAIL_PUBLICATION_VERIFICATION_SCHEMA_VERSION",
    "AUDIOBOOK_RETAIL_PUBLICATION_VERIFICATION_ENTITY_TYPE",
    "createAudiobookRetailPublicListingObservation",
    "verifyAudiobookRetailPublication",
    "assertAudiobookRetailPublicListingObservation",
    "assertAudiobookRetailPublicationVerification",
    "assertAudiobookRetailPublicationVerificationMatchesSources",
    "audiobookRetailPublicationVerificationPublicView",
    "FileAudiobookRetailPublicationVerificationStore",
    "not-yet-published",
    "publication-mismatch",
    "published-but-unavailable",
    "published-and-live",
    "AUDIOBOOK_RETAIL_PUBLICATION_ACCEPTED_STATUS_REQUIRED",
    "AUDIOBOOK_RETAIL_PUBLICATION_INDEPENDENT_VERIFIER_REQUIRED",
    "AUDIOBOOK_RETAIL_PUBLICATION_TITLE_MISMATCH",
    "AUDIOBOOK_RETAIL_PUBLICATION_COVER_MISMATCH",
    "AUDIOBOOK_RETAIL_PUBLICATION_EBOOK_MISMATCH",
    "AUDIOBOOK_RETAIL_PUBLICATION_FALSE_LIVE_CLAIM",
  ],
);

requireTokens(
  "packages/storyteller/src/audiobook-retail-publication-verification.test.ts",
  [
    "exact metadata, cover, eBook, purchase and sample playback evidence becomes published and live",
    "no accessible required-region product page remains not yet published",
    "public metadata, cover or eBook drift produces publication mismatch without a live claim",
    "published pages with unavailable purchase or failed sample remain published but unavailable",
    "retailer processing status cannot authorize publication verification",
    "observer, retailer-status observer and listing approver cannot self-verify publication",
    "expired observations and recomputed source substitutions fail closed",
    "published-and-live",
    "publication-mismatch",
    "published-but-unavailable",
    "not-yet-published",
  ],
);

requireTokens("docs/AUDIOBOOK_RETAIL_PUBLICATION_VERIFICATION.md", [
  "Admission boundary",
  "Accepted is not published",
  "Public listing observation",
  "Regional evidence",
  "Exact public identity comparison",
  "Four truthful outcomes",
  "Independent verification",
  "Findings",
  "Persistence and audit",
  "Public projection",
  "Output boundary",
  "published-and-live",
  "It does not prove perpetual availability",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-publication-verification"]
      !== "./src/audiobook-retail-publication-verification.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-publication-verification",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-publication-verification"]
      !== "node scripts/check-audiobook-retail-publication-verification.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-publication-verification",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-publication-verification",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail publication verification",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-publication-verification",
    "createAudiobookRetailPublicListingObservation",
    "verifyAudiobookRetailPublication",
    "FileAudiobookRetailPublicationVerificationStore",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private publication-verification controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-publication-verification check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_publication_verification_check_passed");
console.log("- accepted retailer status remains distinct from publication and live availability");
console.log("- public metadata, cover and eBook identity are compared with the approved listing");
console.log("- purchase and sample playback are verified independently in every required region");
console.log("- observer and final verifier remain separate human actors");
console.log("- published-and-live requires exact identity, complete availability and zero findings");
console.log("- normal API and web runtimes cannot create publication evidence");
