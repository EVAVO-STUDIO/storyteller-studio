import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) {
    problems.push(`missing audiobook-retail-publication-monitor file: ${path}`);
  }
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(
        `${path} is missing audiobook-retail-publication-monitor contract token: ${token}`,
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
  "packages/storyteller/src/audiobook-retail-publication-monitor.ts",
  "packages/storyteller/src/audiobook-retail-publication-monitor.test.ts",
  "packages/storyteller/src/narrator-retail-publication-monitor-admission.ts",
  "packages/storyteller/src/narrator-retail-publication-monitor-admission.test.ts",
  "packages/storyteller/test-support/narrator-retail-publication-monitor-admission.ts",
  "packages/storyteller/src/narrator-retail-publication-operations-admission.ts",
  "packages/storyteller/src/narrator-retail-publication-operations-admission.test.ts",
  "packages/storyteller/package.json",
  "package.json",
  "docs/AUDIOBOOK_RETAIL_PUBLICATION_MONITOR.md",
  "docs/NARRATOR_RETAIL_PUBLICATION_MONITOR_ADMISSION.md",
  "docs/NARRATOR_RETAIL_PUBLICATION_OPERATIONS_ADMISSION.md",
]) requireFile(path);

requireTokens(
  "packages/storyteller/src/audiobook-retail-publication-monitor.ts",
  [
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_SCHEMA_VERSION",
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTITY_TYPE",
    "createAudiobookRetailPublicationMonitor",
    "recordAudiobookRetailPublicationRefresh",
    "markAudiobookRetailPublicationMonitorStale",
    "assertAudiobookRetailPublicationMonitor",
    "audiobookRetailPublicationMonitorPublicView",
    "FileAudiobookRetailPublicationMonitorStore",
    "healthy-live",
    "degraded",
    "unavailable",
    "mismatch",
    "stale",
    "initialized",
    "refresh",
    "state-change",
    "regression",
    "recovery",
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REFRESH_OVERDUE",
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_SCOPE_MISMATCH",
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REFRESH_ORDER_INVALID",
  ],
);

requireTokens(
  "packages/storyteller/src/audiobook-retail-publication-monitor.test.ts",
  [
    "a live publication starts a healthy monitor with a bounded refresh deadline",
    "refresh, regression, state change and recovery retain immutable evidence history",
    "overdue publication evidence becomes stale and a fresh live verification recovers it",
    "duplicates, out-of-order evidence, region drift and listing substitution fail closed",
    "revision-safe persistence and public projections expose health without source evidence",
    "healthy-live",
    "regression",
    "recovery",
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REFRESH_OVERDUE",
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_SCOPE_MISMATCH",
  ],
);

requireTokens("docs/AUDIOBOOK_RETAIL_PUBLICATION_MONITOR.md", [
  "Admission boundary",
  "Immutable refresh history",
  "Health model",
  "Transition model",
  "Freshness and expiry",
  "Exact scope binding",
  "Persistence and audit",
  "Public projection",
  "Alerting boundary",
  "Output boundary",
  "healthy-live",
  "It does not guarantee future availability",
]);

requireTokens(
  "packages/storyteller/src/narrator-retail-publication-monitor-admission.ts",
  [
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_SCHEMA",
    "createAdmittedNarratorRetailPublicationMonitor",
    "recordAdmittedNarratorRetailPublicationRefresh",
    "markAdmittedNarratorRetailPublicationMonitorStale",
    "assertAdmittedNarratorRetailPublicationMonitor",
    "admittedNarratorRetailPublicationMonitorPublicView",
    "initialLivePublicationConfirmed: true",
    "continuousNarratorLineageBound: true",
    "admittedListingIdentityInvariant: true",
    "staleEvidence",
    "automaticRemediationAuthority: false",
    "automaticRepublishAuthority: false",
    "publicationAuthority: false",
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_INITIAL_LIVE_REQUIRED",
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_NARRATOR_LINEAGE_MISMATCH",
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_ENTRY_LINEAGE_MISMATCH",
  ],
);

requireTokens(
  "packages/storyteller/src/narrator-retail-publication-monitor-admission.test.ts",
  [
    "initial published-and-live narrator verification starts one admission-bound healthy monitor",
    "narrator metadata drift records a regression without losing original narrator lineage",
    "purchase or sample degradation can recover only through the same admitted narrator listing",
    "overdue evidence becomes stale without inventing another narrator verification",
    "a non-live verification cannot initialize post-publication narrator monitoring",
    "cross-title, replacement narrator and public product substitutions cannot enter an existing monitor",
    "rehashing a narrator monitor cannot manufacture remediation or republish authority",
    "public monitor projection exposes drift health without private narrator or evidence identities",
    "healthy-live",
    "mismatch",
    "degraded",
    "recovery",
    "stale",
  ],
);

requireTokens("docs/NARRATOR_RETAIL_PUBLICATION_MONITOR_ADMISSION.md", [
  "Admission boundary",
  "Initial live proof",
  "Exact narrator lineage",
  "Immutable verification history",
  "Health and transitions",
  "Narrator and metadata drift",
  "Purchase and sample degradation",
  "Freshness and stale evidence",
  "Public product identity",
  "Authority boundary",
  "Public projection",
  "Alerting boundary",
  "Output boundary",
  "It does not guarantee future availability",
]);

requireTokens(
  "packages/storyteller/src/narrator-retail-publication-operations-admission.ts",
  [
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_REQUEST_SCHEMA",
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_SCHEMA",
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_INCIDENT_SCHEMA",
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_SCHEMA",
    "createAdmittedNarratorRetailPublicationEvidenceRequest",
    "submitAdmittedNarratorRetailPublicationEvidence",
    "applyAdmittedNarratorRetailPublicationEvidence",
    "markAdmittedNarratorRetailPublicationEvidenceStale",
    "createAdmittedNarratorRetailPublicationIncident",
    "resolveAdmittedNarratorRetailPublicationIncident",
    "assertAdmittedNarratorRetailPublicationEvidenceRequest",
    "assertAdmittedNarratorRetailPublicationEvidence",
    "assertAdmittedNarratorRetailPublicationIncident",
    "assertAdmittedNarratorRetailPublicationOperation",
    "admittedNarratorRetailPublicationEvidenceRequestPublicView",
    "admittedNarratorRetailPublicationEvidencePublicView",
    "admittedNarratorRetailPublicationIncidentPublicView",
    "admittedNarratorRetailPublicationOperationPublicView",
    "evidenceAcquisitionRequested: true",
    "evidenceAvailable: true",
    "refreshEligible: true",
    "verifiedRecoveryRequired: true",
    "automaticRefreshAuthority: false",
    "automaticRemediationAuthority: false",
    "automaticRepublishAuthority: false",
    "publicationAuthority: false",
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATIONS_EVIDENCE_LINEAGE_MISMATCH",
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATIONS_NARRATOR_LINEAGE_MISMATCH",
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_INCIDENT_RECOVERY_LINEAGE_INVALID",
  ],
);

requireTokens(
  "packages/storyteller/src/narrator-retail-publication-operations-admission.test.ts",
  [
    "adapted and zero-shot narrator monitors create exact admission-bound evidence requests",
    "narrator metadata drift is admitted as evidence, acknowledged by refresh and raised as one critical incident",
    "missing current evidence marks only the same admitted narrator monitor stale and creates a warning incident",
    "verified recovery resolves an incident only through the same admitted narrator listing and ASIN",
    "cross-title, replacement narrator and public product substitutions fail before evidence intake",
    "another admitted narrator recovery cannot resolve an existing narrator incident",
    "rehashing operations or incidents cannot manufacture refresh, remediation, republish or publication authority",
    "public evidence, operation and incident projections expose bounded retail health without private narrator evidence",
    "evidence-refresh",
    "evidence-stale",
    "identity-mismatch",
    "evidence-stale",
    "verified-recovery",
  ],
);

requireTokens(
  "docs/NARRATOR_RETAIL_PUBLICATION_OPERATIONS_ADMISSION.md",
  [
    "Admission boundary",
    "Evidence request",
    "Evidence intake",
    "Refresh operation",
    "Stale evidence",
    "Incident creation",
    "Verified recovery",
    "Adapted and zero-shot provenance",
    "Immutable lineage",
    "Authority boundary",
    "Private runtime boundary",
    "Public projection",
    "Output boundary",
    "It does not guarantee future availability",
  ],
);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (
    packageJson.exports?.["./audiobook-retail-publication-monitor"]
      !== "./src/audiobook-retail-publication-monitor.ts"
  ) {
    problems.push(
      "storyteller package does not export ./audiobook-retail-publication-monitor",
    );
  }
  if (
    packageJson.exports?.["./narrator-retail-publication-monitor-admission"]
      !== "./src/narrator-retail-publication-monitor-admission.ts"
  ) {
    problems.push(
      "storyteller package does not export ./narrator-retail-publication-monitor-admission",
    );
  }
  if (
    packageJson.exports?.["./narrator-retail-publication-operations-admission"]
      !== "./src/narrator-retail-publication-operations-admission.ts"
  ) {
    problems.push(
      "storyteller package does not export ./narrator-retail-publication-operations-admission",
    );
  }
}

if (existsSync(fromRoot("package.json"))) {
  const packageJson = JSON.parse(read("package.json"));
  if (
    packageJson.scripts?.["verify:audiobook-retail-publication-monitor"]
      !== "node scripts/check-audiobook-retail-publication-monitor.mjs"
  ) {
    problems.push(
      "root package does not expose verify:audiobook-retail-publication-monitor",
    );
  }
  if (
    !packageJson.scripts?.["verify:artifacts"]?.includes(
      "npm run verify:audiobook-retail-publication-monitor",
    )
  ) {
    problems.push(
      "permanent artifact verification omits audiobook retail publication monitoring",
    );
  }
}

for (const path of [
  "packages/storyteller/src/narrator-retail-publication-monitor-admission.ts",
  "packages/storyteller/src/narrator-retail-publication-operations-admission.ts",
]) {
  if (!existsSync(fromRoot(path))) continue;
  const source = read(path);
  for (const forbidden of [
    "automaticRefreshAuthority: true",
    "automaticRemediationAuthority: true",
    "automaticRepublishAuthority: true",
    "publicationAuthority: true",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(
        `narrator publication operations grant forbidden authority in ${path}: ${forbidden}`,
      );
    }
  }
}

for (const path of [
  ...collectRuntimeFiles("apps/api/src"),
  ...collectRuntimeFiles("apps/web/src"),
]) {
  const runtime = read(path);
  for (const forbidden of [
    "@evavo/storyteller-engine/audiobook-retail-publication-monitor",
    "@evavo/storyteller-engine/narrator-retail-publication-monitor-admission",
    "@evavo/storyteller-engine/narrator-retail-publication-operations-admission",
    "createAudiobookRetailPublicationMonitor",
    "createAdmittedNarratorRetailPublicationMonitor",
    "recordAudiobookRetailPublicationRefresh",
    "recordAdmittedNarratorRetailPublicationRefresh",
    "markAudiobookRetailPublicationMonitorStale",
    "markAdmittedNarratorRetailPublicationMonitorStale",
    "createAdmittedNarratorRetailPublicationEvidenceRequest",
    "submitAdmittedNarratorRetailPublicationEvidence",
    "applyAdmittedNarratorRetailPublicationEvidence",
    "markAdmittedNarratorRetailPublicationEvidenceStale",
    "createAdmittedNarratorRetailPublicationIncident",
    "resolveAdmittedNarratorRetailPublicationIncident",
    "FileAudiobookRetailPublicationMonitorStore",
  ]) {
    if (runtime.includes(forbidden)) {
      problems.push(
        `${path} exposes private publication-monitor controls: ${forbidden}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Storyteller Studio audiobook-retail-publication-monitor check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_audiobook_retail_publication_monitor_check_passed");
console.log("- immutable publication verifications remain append-only and chronological");
console.log("- health derives from truthful publication-verification outcomes");
console.log("- regression, recovery, refresh and stale transitions remain evidence-backed");
console.log("- refresh deadlines cannot outlive the underlying public observation");
console.log("- public and audit projections omit source evidence and private identities");
console.log("- normal API and web runtimes cannot mutate publication monitoring");
console.log("- narrator monitor history remains bound to the exact admitted narrator and Audible ASIN");
console.log("- narrator evidence intake reopens exact profile, casting, listing and public-product lineage");
console.log("- narrator incidents require exact admitted recovery and grant no repair or republish authority");
