import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-listing-identity file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-listing-identity contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-listing-policy.ts",
  "packages/storyteller/src/audiobook-retail-listing-identity.ts",
  "packages/storyteller/src/audiobook-retail-listing-identity.test.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_LISTING_IDENTITY.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/audiobook-retail-listing-policy.ts", [
  "AUDIOBOOK_RETAIL_LISTING_POLICY_SCHEMA_VERSION",
  "AUDIOBOOK_RETAIL_EBOOK_AVAILABILITY_SCHEMA_VERSION",
  "AUDIOBOOK_RETAIL_COVER_EVIDENCE_SCHEMA_VERSION",
  "createAcxAudibleRetailListingPolicy",
  "assertCurrentAudiobookRetailListingPolicy",
  "createAudiobookRetailEbookAvailabilityEvidence",
  "assertAudiobookRetailEbookAvailabilityEvidence",
  "createAudiobookRetailCoverEvidence",
  "assertAudiobookRetailCoverEvidenceMatchesArtifact",
  "maximumDescriptionCharacters: 2_000",
  "minimumWidthPx: 2_400",
  "minimumHeightPx: 2_400",
  "maximumByteCount: 8_388_608",
  "AUDIOBOOK_RETAIL_COVER_REQUIRED_CHECK_MISSING",
  "AUDIOBOOK_RETAIL_EBOOK_NOT_CURRENT",
]);

requireTokens("packages/storyteller/src/audiobook-retail-listing-identity.ts", [
  "AUDIOBOOK_RETAIL_LISTING_IDENTITY_SCHEMA_VERSION",
  "AUDIOBOOK_RETAIL_LISTING_IDENTITY_ENTITY_TYPE",
  "createAudiobookRetailListingIdentity",
  "recordAudiobookRetailListingReview",
  "approveAudiobookRetailListingIdentity",
  "assertAudiobookRetailListingIdentity",
  "assertAudiobookRetailListingIdentityMatchesSources",
  "audiobookRetailListingIdentityPublicView",
  "FileAudiobookRetailListingIdentityStore",
  "approved-for-publication-verification",
  "title-author-narrator-match-spoken-credits",
  "audiobook-rights-current",
  "cover-technical-compliance",
  "AUDIOBOOK_RETAIL_LISTING_CREDIT_METADATA_MISMATCH",
  "AUDIOBOOK_RETAIL_LISTING_INDEPENDENT_REVIEWERS_REQUIRED",
  "AUDIOBOOK_RETAIL_LISTING_INDEPENDENT_APPROVER_REQUIRED",
  "AUDIOBOOK_RETAIL_LISTING_SOURCE_MISMATCH",
]);

requireTokens("packages/storyteller/src/audiobook-retail-listing-identity.test.ts", [
  "approved credits, compliant cover and current eBook evidence become one governed public listing identity",
  "cover dimensions and cover text must match the canonical listing",
  "expired listing policy, eBook availability and rights fail closed",
  "spoken credit metadata drift cannot create another listing identity",
  "changes requested require a clean re-review and all roles remain independent",
  "recomputed identity state cannot replace the approved source manifest",
  "approved-for-publication-verification",
  "AUDIOBOOK_RETAIL_LISTING_CREDIT_METADATA_MISMATCH",
  "AUDIOBOOK_RETAIL_LISTING_SOURCE_MISMATCH",
]);

requireTokens("docs/AUDIOBOOK_RETAIL_LISTING_IDENTITY.md", [
  "Admission boundary",
  "Canonical public metadata",
  "Retail listing policy",
  "Cover evidence",
  "eBook availability evidence",
  "Independent review",
  "Publisher approval",
  "Persistence and audit",
  "Public projection",
  "Output boundary",
  "approved-for-publication-verification",
  "It does not mean the audiobook is published",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  for (const [name, target] of [
    [
      "./audiobook-retail-listing-policy",
      "./src/audiobook-retail-listing-policy.ts",
    ],
    [
      "./audiobook-retail-listing-identity",
      "./src/audiobook-retail-listing-identity.ts",
    ],
  ]) {
    if (packageJson.exports?.[name] !== target) {
      problems.push(`storyteller package does not export ${name}`);
    }
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-listing-identity"]
      !== "node scripts/check-audiobook-retail-listing-identity.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-listing-identity",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-listing-identity",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail listing identity",
    );
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-listing-policy",
    "@evavo/storyteller-engine/audiobook-retail-listing-identity",
    "createAudiobookRetailCoverEvidence",
    "createAudiobookRetailListingIdentity",
    "approveAudiobookRetailListingIdentity",
    "FileAudiobookRetailListingIdentityStore",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private retail listing controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-listing-identity check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_listing_identity_check_passed");
console.log("- listing policy, cover evidence and eBook evidence remain versioned and current");
console.log("- canonical metadata is rebound to exact approved spoken credits");
console.log("- editorial, rights and merchandising review roles remain independent");
console.log("- final publisher approval revalidates every source");
console.log("- public projection exposes intended retail copy without internal evidence");
console.log("- approved identity stops before publication, live availability or sale");
