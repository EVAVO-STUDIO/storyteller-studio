import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const problems = [];
const fromRoot = (path) => resolve(root, path);
const read = (path) => readFileSync(fromRoot(path), "utf8");

function requireFile(path) {
  if (!existsSync(fromRoot(path))) problems.push(`missing narrator monitoring file: ${path}`);
}

function requireTokens(path, tokens) {
  if (!existsSync(fromRoot(path))) return;
  const source = read(path);
  for (const token of tokens) {
    if (!source.includes(token)) {
      problems.push(`${path} is missing narrator monitoring contract token: ${token}`);
    }
  }
}

for (const path of [
  "packages/storyteller/src/narrator-book-monitor.ts",
  "packages/storyteller/src/narrator-book-monitor.test.ts",
  "packages/storyteller/src/narrator-voice-profile.ts",
  "packages/storyteller/src/narrator-voice-profile.test.ts",
  "packages/storyteller/package.json",
  "docs/NARRATOR_BOOK_MONITORING.md",
]) requireFile(path);

requireTokens("packages/storyteller/src/narrator-book-monitor.ts", [
  "NARRATOR_MONITOR_POLICY_SCHEMA",
  "NARRATOR_CHAPTER_MONITOR_SCHEMA",
  "NARRATOR_BOOK_MONITOR_SCHEMA",
  "createNarratorMonitoringPolicy",
  "createNarratorQualityReference",
  "createNarratorChapterObjectiveObservation",
  "monitorNarratorChapter",
  "monitorNarratorBook",
  "assessContinuity",
  "NARRATOR_MONITOR_TRANSCRIPT_COVERAGE_LOW",
  "NARRATOR_MONITOR_FINAL_WORD_MISSING",
  "NARRATOR_MONITOR_CLIPPING_DETECTED",
  "NARRATOR_MONITOR_UNEXPECTED_SPEAKER_CHANGE",
  "NARRATOR_MONITOR_IDENTITY_SIMILARITY_LOW",
  "NARRATOR_MONITOR_CADENCE_TEMPLATE_REPETITION_HIGH",
  "NARRATOR_MONITOR_SENTENCE_FINAL_CONTOUR_REPETITION_HIGH",
  "NARRATOR_MONITOR_ROOM_TONE_DRIFT",
  "NARRATOR_MONITOR_SEAM_DISCONTINUITY",
  "NARRATOR_BOOK_MONITOR_ADJACENT_ACOUSTIC_DRIFT_REJECTED",
  'humanListeningApproval: false',
  'titleNarratorApproval: false',
  'titleReleaseAuthority: false',
  'publicationAuthority: false',
]);

requireTokens("packages/storyteller/src/narrator-book-monitor.test.ts", [
  "clean objective chapter evidence becomes eligible for human review only",
  "transcript loss, clipping and speaker substitution require regeneration",
  "repetitive cadence and sentence endings flag AI-like monotony for human attention",
  "room tone, seams and duration drift remain explicit review evidence",
  "large acoustic drift cannot pass as a stable chapter",
  "chapter evidence cannot be rebound to another casting",
  "tampered objective and monitoring evidence fail fingerprint validation",
  "whole-book monitoring requires every expected chapter exactly once",
  "a regeneration chapter blocks the whole-book monitoring result",
  "adjacent chapter acoustic drift is measured across the complete ordered book",
]);

requireTokens("packages/storyteller/src/narrator-voice-profile.ts", [
  'storyteller-chapter-narrator-review-v2',
  "objectiveMonitoring: NarratorChapterMonitoringResult",
  "objectiveFindingAcknowledgements",
  "assertReviewableObjectiveMonitoring",
  "objectiveMonitoringFingerprint",
  "objectiveMonitoringPolicyFingerprint",
  "objectiveMonitoringReferenceFingerprint",
  "objectiveMonitoringObservationFingerprint",
  "objectiveMonitoringMeasuredAt",
  "CHAPTER_NARRATOR_MONITOR_RENDER_MISMATCH",
  "CHAPTER_NARRATOR_MONITOR_REGENERATION_REQUIRED",
  "CHAPTER_NARRATOR_MONITOR_FINDINGS_UNACKNOWLEDGED",
  "CHAPTER_NARRATOR_REVIEW_PRECEDES_MONITORING",
]);

requireTokens("packages/storyteller/src/narrator-voice-profile.test.ts", [
  "human review is bound to the exact monitored project, chapter and render",
  "regeneration-required objective monitoring cannot be human-approved",
  "objective warnings require exact human acknowledgement",
  "monitor evidence cannot be altered or reviewed before it existed",
  "chapter review fingerprint seals its monitoring evidence",
  "title narrator requires a monitored approved review for every chapter",
]);

requireTokens("docs/NARRATOR_BOOK_MONITORING.md", [
  "Objective chapter evidence",
  "Fail-closed chapter gates",
  "Exact human-review binding",
  "Whole-book monitoring",
  "Human authority boundary",
  "eligible-for-human-review",
  "eligible-for-human-book-review",
  "repeated cadence templates",
  "sentence-final contours",
  "adjacent chapter acoustic signatures",
  "monitoring fingerprint",
  "requires-regeneration",
  "review timestamp",
]);

if (existsSync(fromRoot("packages/storyteller/package.json"))) {
  const packageJson = JSON.parse(read("packages/storyteller/package.json"));
  if (packageJson.exports?.["./narrator-book-monitor"] !== "./src/narrator-book-monitor.ts") {
    problems.push("storyteller package does not export ./narrator-book-monitor");
  }
}

const monitorSource = existsSync(fromRoot("packages/storyteller/src/narrator-book-monitor.ts"))
  ? read("packages/storyteller/src/narrator-book-monitor.ts")
  : "";
const reviewSource = existsSync(fromRoot("packages/storyteller/src/narrator-voice-profile.ts"))
  ? read("packages/storyteller/src/narrator-voice-profile.ts")
  : "";
for (const [label, source] of [
  ["narrator monitor", monitorSource],
  ["chapter review", reviewSource],
]) {
  for (const forbidden of [
    "humanListeningApproval: true",
    "titleReleaseAuthority: true",
    "publicationAuthority: true",
  ]) {
    if (source.includes(forbidden)) {
      problems.push(`${label} grants forbidden authority: ${forbidden}`);
    }
  }
}

if (reviewSource.includes('storyteller-chapter-narrator-review-v1')) {
  problems.push("chapter narrator review still exposes the unmonitored v1 schema");
}

if (problems.length > 0) {
  console.error("Storyteller narrator book monitoring check failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("storyteller_narrator_book_monitoring_check_passed");
console.log("- objective chapter evidence is bound to the exact approved narrator casting and voice revision");
console.log("- transcript, identity, acoustic, monotony, noise, room-tone and seam anomalies fail or flag explicitly");
console.log("- adjacent chapter acoustics are compared across the complete expected book");
console.log("- human chapter review is sealed to the same monitored source, render, policy, reference and observation");
console.log("- regeneration-required evidence cannot be approved and warning findings require exact acknowledgement");
console.log("- monitoring can require regeneration or human attention but never human-approve or publish narration");
