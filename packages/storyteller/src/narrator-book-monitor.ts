import {
  assessContinuity,
  stableHash,
  type AcousticSignature,
  type Finding,
} from "./index.js";
import {
  assertExactNarratorVoicePin,
  assertNarratorCasting,
  type NarratorCastingApproval,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";

export const NARRATOR_MONITOR_POLICY_SCHEMA =
  "storyteller-narrator-monitor-policy-v1" as const;
export const NARRATOR_CHAPTER_MONITOR_SCHEMA =
  "storyteller-narrator-chapter-monitor-v1" as const;
export const NARRATOR_BOOK_MONITOR_SCHEMA =
  "storyteller-narrator-book-monitor-v1" as const;

export interface NarratorMonitoringPolicy {
  schemaVersion: typeof NARRATOR_MONITOR_POLICY_SCHEMA;
  minimumTranscriptCoverage: number;
  maximumInsertionRatio: number;
  minimumSpeakerIdentitySimilarity: number;
  maximumCadenceTemplateSimilarity: number;
  maximumSentenceFinalContourRepetitionRatio: number;
  maximumNoiseFloorDb: number;
  maximumRoomToneDriftDb: number;
  maximumSeamDiscontinuityScore: number;
  maximumChapterDurationDriftRatio: number;
  requireFinalWord: true;
  requireZeroClipping: true;
  forbidUnexpectedSpeakerChange: true;
  fingerprint: string;
}

export interface NarratorQualityReference {
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  acousticSignature: AcousticSignature;
  expectedChapterDurationSeconds?: number;
  roomToneRmsDb: number;
  evidenceHash: string;
  fingerprint: string;
}

export interface NarratorChapterObjectiveObservation {
  projectId: string;
  chapterId: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  renderFingerprint: string;
  sourceFingerprint: string;
  segmentCount: number;
  transcriptCoverage: number;
  insertionRatio: number;
  finalWordPresent: boolean;
  clippedSampleCount: number;
  unexpectedSpeakerChangeCount: number;
  minimumSpeakerIdentitySimilarity: number;
  acousticSignature: AcousticSignature;
  chapterDurationSeconds: number;
  cadenceTemplateSimilarity: number;
  sentenceFinalContourRepetitionRatio: number;
  noiseFloorDb: number;
  roomToneRmsDb: number;
  maximumSeamDiscontinuityScore: number;
  transcriptEvidenceHash: string;
  speakerIdentityEvidenceHash: string;
  acousticEvidenceHash: string;
  engineeringEvidenceHash: string;
  measuredAt: string;
  fingerprint: string;
}

export type NarratorChapterMonitoringStatus =
  | "eligible-for-human-review"
  | "requires-human-attention"
  | "requires-regeneration";

export interface NarratorChapterMonitoringResult {
  schemaVersion: typeof NARRATOR_CHAPTER_MONITOR_SCHEMA;
  projectId: string;
  chapterId: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  renderFingerprint: string;
  sourceFingerprint: string;
  policyFingerprint: string;
  referenceFingerprint: string;
  observationFingerprint: string;
  acousticSignature: AcousticSignature;
  continuityScore: number;
  continuitySeverity: "stable" | "review" | "reject";
  transcriptCoverage: number;
  insertionRatio: number;
  minimumSpeakerIdentitySimilarity: number;
  cadenceTemplateSimilarity: number;
  sentenceFinalContourRepetitionRatio: number;
  chapterDurationSeconds: number;
  findingCodes: readonly string[];
  warningCount: number;
  errorCount: number;
  status: NarratorChapterMonitoringStatus;
  humanListeningApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  measuredAt: string;
  fingerprint: string;
}

export interface NarratorBookMonitoringResult {
  schemaVersion: typeof NARRATOR_BOOK_MONITOR_SCHEMA;
  projectId: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  expectedChapterIds: readonly string[];
  chapterResultFingerprints: readonly string[];
  chapterCount: number;
  stableChapterCount: number;
  attentionChapterCount: number;
  regenerationChapterCount: number;
  maximumAdjacentAcousticDrift: number;
  averageContinuityScore: number;
  findingCodes: readonly string[];
  status: "eligible-for-human-book-review" | "requires-human-attention" | "blocked";
  humanListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  assessedAt: string;
  fingerprint: string;
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) throw new Error(code);
  return value;
}

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) throw new Error(code);
  return value;
}

function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(code);
  return value;
}

function requireInteger(value: number, minimum: number, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(code);
  return value;
}

function requireFinite(value: number, minimum: number, maximum: number, code: string): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(code);
  return value;
}

function requireRatio(value: number, code: string): number {
  return requireFinite(value, 0, 1, code);
}

function policyBase(value: Omit<NarratorMonitoringPolicy, "fingerprint">): Readonly<Record<string, unknown>> {
  return value;
}

function referenceBase(value: Omit<NarratorQualityReference, "fingerprint">): Readonly<Record<string, unknown>> {
  return value;
}

function observationBase(
  value: Omit<NarratorChapterObjectiveObservation, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function chapterBase(
  value: Omit<NarratorChapterMonitoringResult, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function bookBase(
  value: Omit<NarratorBookMonitoringResult, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function assertAcousticSignature(value: AcousticSignature, code: string): void {
  requireFinite(value.medianPitchHz, 20, 1_500, code);
  requireFinite(value.pitchRangeSemitones, 0, 96, code);
  requireFinite(value.speakingRateWpm, 20, 500, code);
  requireRatio(value.pauseRatio, code);
  requireFinite(value.energyRmsDb, -120, 12, code);
  if (value.embeddingDistanceFromAnchor !== undefined) {
    requireFinite(value.embeddingDistanceFromAnchor, 0, 100, code);
  }
}

export function createNarratorMonitoringPolicy(
  input: Omit<NarratorMonitoringPolicy, "schemaVersion" | "fingerprint">,
): NarratorMonitoringPolicy {
  const partial: Omit<NarratorMonitoringPolicy, "fingerprint"> = {
    schemaVersion: NARRATOR_MONITOR_POLICY_SCHEMA,
    minimumTranscriptCoverage: requireRatio(input.minimumTranscriptCoverage, "NARRATOR_MONITOR_POLICY_TRANSCRIPT_INVALID"),
    maximumInsertionRatio: requireRatio(input.maximumInsertionRatio, "NARRATOR_MONITOR_POLICY_INSERTION_INVALID"),
    minimumSpeakerIdentitySimilarity: requireRatio(input.minimumSpeakerIdentitySimilarity, "NARRATOR_MONITOR_POLICY_IDENTITY_INVALID"),
    maximumCadenceTemplateSimilarity: requireRatio(input.maximumCadenceTemplateSimilarity, "NARRATOR_MONITOR_POLICY_CADENCE_INVALID"),
    maximumSentenceFinalContourRepetitionRatio: requireRatio(
      input.maximumSentenceFinalContourRepetitionRatio,
      "NARRATOR_MONITOR_POLICY_CONTOUR_INVALID",
    ),
    maximumNoiseFloorDb: requireFinite(input.maximumNoiseFloorDb, -120, 0, "NARRATOR_MONITOR_POLICY_NOISE_INVALID"),
    maximumRoomToneDriftDb: requireFinite(input.maximumRoomToneDriftDb, 0, 40, "NARRATOR_MONITOR_POLICY_ROOM_TONE_INVALID"),
    maximumSeamDiscontinuityScore: requireRatio(input.maximumSeamDiscontinuityScore, "NARRATOR_MONITOR_POLICY_SEAM_INVALID"),
    maximumChapterDurationDriftRatio: requireRatio(input.maximumChapterDurationDriftRatio, "NARRATOR_MONITOR_POLICY_DURATION_INVALID"),
    requireFinalWord: true,
    requireZeroClipping: true,
    forbidUnexpectedSpeakerChange: true,
  };
  if (
    input.requireFinalWord !== true
    || input.requireZeroClipping !== true
    || input.forbidUnexpectedSpeakerChange !== true
  ) {
    throw new Error("NARRATOR_MONITOR_POLICY_FAIL_CLOSED_GATES_REQUIRED");
  }
  return Object.freeze({ ...partial, fingerprint: stableHash(policyBase(partial)) });
}

export function assertNarratorMonitoringPolicy(policy: NarratorMonitoringPolicy): void {
  const recreated = createNarratorMonitoringPolicy(policy);
  if (policy.schemaVersion !== NARRATOR_MONITOR_POLICY_SCHEMA || recreated.fingerprint !== policy.fingerprint) {
    throw new Error("NARRATOR_MONITOR_POLICY_FINGERPRINT_INVALID");
  }
}

export function createNarratorQualityReference(input: Readonly<{
  casting: NarratorCastingApproval;
  acousticSignature: AcousticSignature;
  expectedChapterDurationSeconds?: number;
  roomToneRmsDb: number;
  evidenceHash: string;
}>): NarratorQualityReference {
  assertNarratorCasting(input.casting);
  assertAcousticSignature(input.acousticSignature, "NARRATOR_MONITOR_REFERENCE_ACOUSTIC_INVALID");
  const partial: Omit<NarratorQualityReference, "fingerprint"> = {
    castingFingerprint: input.casting.fingerprint,
    voice: Object.freeze({ ...input.casting.voice }),
    acousticSignature: Object.freeze({ ...input.acousticSignature }),
    ...(input.expectedChapterDurationSeconds !== undefined
      ? {
          expectedChapterDurationSeconds: requireFinite(
            input.expectedChapterDurationSeconds,
            1,
            24 * 60 * 60,
            "NARRATOR_MONITOR_REFERENCE_DURATION_INVALID",
          ),
        }
      : {}),
    roomToneRmsDb: requireFinite(input.roomToneRmsDb, -120, 12, "NARRATOR_MONITOR_REFERENCE_ROOM_TONE_INVALID"),
    evidenceHash: requireHash(input.evidenceHash, "NARRATOR_MONITOR_REFERENCE_EVIDENCE_HASH_INVALID"),
  };
  return Object.freeze({ ...partial, fingerprint: stableHash(referenceBase(partial)) });
}

export function assertNarratorQualityReference(
  reference: NarratorQualityReference,
  casting: NarratorCastingApproval,
): void {
  assertNarratorCasting(casting);
  if (reference.castingFingerprint !== casting.fingerprint) throw new Error("NARRATOR_MONITOR_REFERENCE_CASTING_MISMATCH");
  assertExactNarratorVoicePin(casting.voice, reference.voice);
  assertAcousticSignature(reference.acousticSignature, "NARRATOR_MONITOR_REFERENCE_ACOUSTIC_INVALID");
  requireFinite(reference.roomToneRmsDb, -120, 12, "NARRATOR_MONITOR_REFERENCE_ROOM_TONE_INVALID");
  requireHash(reference.evidenceHash, "NARRATOR_MONITOR_REFERENCE_EVIDENCE_HASH_INVALID");
  if (reference.expectedChapterDurationSeconds !== undefined) {
    requireFinite(reference.expectedChapterDurationSeconds, 1, 24 * 60 * 60, "NARRATOR_MONITOR_REFERENCE_DURATION_INVALID");
  }
  const { fingerprint, ...partial } = reference;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(referenceBase(partial))) {
    throw new Error("NARRATOR_MONITOR_REFERENCE_FINGERPRINT_INVALID");
  }
}

export function createNarratorChapterObjectiveObservation(
  input: Omit<NarratorChapterObjectiveObservation, "fingerprint">,
): NarratorChapterObjectiveObservation {
  requireIdentifier(input.projectId, "NARRATOR_MONITOR_PROJECT_INVALID");
  requireIdentifier(input.chapterId, "NARRATOR_MONITOR_CHAPTER_INVALID");
  requireHash(input.castingFingerprint, "NARRATOR_MONITOR_CASTING_HASH_INVALID");
  assertExactNarratorVoicePin(input.voice, input.voice);
  requireHash(input.renderFingerprint, "NARRATOR_MONITOR_RENDER_HASH_INVALID");
  requireHash(input.sourceFingerprint, "NARRATOR_MONITOR_SOURCE_HASH_INVALID");
  requireInteger(input.segmentCount, 1, 100_000, "NARRATOR_MONITOR_SEGMENT_COUNT_INVALID");
  requireRatio(input.transcriptCoverage, "NARRATOR_MONITOR_TRANSCRIPT_COVERAGE_INVALID");
  requireRatio(input.insertionRatio, "NARRATOR_MONITOR_INSERTION_RATIO_INVALID");
  requireInteger(input.clippedSampleCount, 0, Number.MAX_SAFE_INTEGER, "NARRATOR_MONITOR_CLIPPING_INVALID");
  requireInteger(input.unexpectedSpeakerChangeCount, 0, 100_000, "NARRATOR_MONITOR_SPEAKER_CHANGE_INVALID");
  requireRatio(input.minimumSpeakerIdentitySimilarity, "NARRATOR_MONITOR_IDENTITY_SIMILARITY_INVALID");
  assertAcousticSignature(input.acousticSignature, "NARRATOR_MONITOR_ACOUSTIC_INVALID");
  requireFinite(input.chapterDurationSeconds, 1, 24 * 60 * 60, "NARRATOR_MONITOR_DURATION_INVALID");
  requireRatio(input.cadenceTemplateSimilarity, "NARRATOR_MONITOR_CADENCE_INVALID");
  requireRatio(input.sentenceFinalContourRepetitionRatio, "NARRATOR_MONITOR_CONTOUR_INVALID");
  requireFinite(input.noiseFloorDb, -120, 0, "NARRATOR_MONITOR_NOISE_INVALID");
  requireFinite(input.roomToneRmsDb, -120, 12, "NARRATOR_MONITOR_ROOM_TONE_INVALID");
  requireRatio(input.maximumSeamDiscontinuityScore, "NARRATOR_MONITOR_SEAM_INVALID");
  for (const hash of [
    input.transcriptEvidenceHash,
    input.speakerIdentityEvidenceHash,
    input.acousticEvidenceHash,
    input.engineeringEvidenceHash,
  ]) requireHash(hash, "NARRATOR_MONITOR_EVIDENCE_HASH_INVALID");
  requireDate(input.measuredAt, "NARRATOR_MONITOR_DATE_INVALID");
  const partial = Object.freeze({ ...input });
  return Object.freeze({ ...partial, fingerprint: stableHash(observationBase(partial)) });
}

export function assertNarratorChapterObjectiveObservation(
  observation: NarratorChapterObjectiveObservation,
): void {
  const { fingerprint, ...partial } = observation;
  const recreated = createNarratorChapterObjectiveObservation(partial);
  if (!HASH.test(fingerprint) || recreated.fingerprint !== fingerprint) {
    throw new Error("NARRATOR_MONITOR_OBSERVATION_FINGERPRINT_INVALID");
  }
}

function finding(code: string, severity: "warning" | "error", message: string): Finding {
  return { code, severity, message };
}

function durationDrift(reference: NarratorQualityReference, observedSeconds: number): number {
  if (reference.expectedChapterDurationSeconds === undefined) return 0;
  return Math.abs(observedSeconds - reference.expectedChapterDurationSeconds)
    / reference.expectedChapterDurationSeconds;
}

function uniqueFindingCodes(findings: readonly Finding[]): readonly string[] {
  return Object.freeze([...new Set(findings.map((item) => item.code))].sort((left, right) =>
    left.localeCompare(right, "en-AU")
  ));
}

export function monitorNarratorChapter(input: Readonly<{
  casting: NarratorCastingApproval;
  policy: NarratorMonitoringPolicy;
  reference: NarratorQualityReference;
  observation: NarratorChapterObjectiveObservation;
}>): NarratorChapterMonitoringResult {
  assertNarratorCasting(input.casting);
  assertNarratorMonitoringPolicy(input.policy);
  assertNarratorQualityReference(input.reference, input.casting);
  assertNarratorChapterObjectiveObservation(input.observation);
  const observation = input.observation;
  if (observation.projectId !== input.casting.projectId) throw new Error("NARRATOR_MONITOR_PROJECT_CASTING_MISMATCH");
  if (observation.castingFingerprint !== input.casting.fingerprint) throw new Error("NARRATOR_MONITOR_CASTING_MISMATCH");
  assertExactNarratorVoicePin(input.casting.voice, observation.voice);

  const continuity = assessContinuity(
    input.reference.acousticSignature,
    observation.acousticSignature,
  );
  const findings: Finding[] = [...continuity.findings];
  if (observation.transcriptCoverage < input.policy.minimumTranscriptCoverage) {
    findings.push(finding("NARRATOR_MONITOR_TRANSCRIPT_COVERAGE_LOW", "error", "Chapter transcript coverage fell below the reviewed production policy."));
  }
  if (observation.insertionRatio > input.policy.maximumInsertionRatio) {
    findings.push(finding("NARRATOR_MONITOR_INSERTION_RATIO_HIGH", "error", "Chapter transcript insertions exceeded the reviewed production policy."));
  }
  if (input.policy.requireFinalWord && !observation.finalWordPresent) {
    findings.push(finding("NARRATOR_MONITOR_FINAL_WORD_MISSING", "error", "The chapter final source word is absent from the observed transcript ending."));
  }
  if (input.policy.requireZeroClipping && observation.clippedSampleCount !== 0) {
    findings.push(finding("NARRATOR_MONITOR_CLIPPING_DETECTED", "error", "Clipped samples were detected in the chapter render."));
  }
  if (input.policy.forbidUnexpectedSpeakerChange && observation.unexpectedSpeakerChangeCount !== 0) {
    findings.push(finding("NARRATOR_MONITOR_UNEXPECTED_SPEAKER_CHANGE", "error", "Unexpected speaker changes were detected inside the narrator render."));
  }
  if (observation.minimumSpeakerIdentitySimilarity < input.policy.minimumSpeakerIdentitySimilarity) {
    findings.push(finding("NARRATOR_MONITOR_IDENTITY_SIMILARITY_LOW", "error", "Narrator identity similarity fell below the reviewed policy floor."));
  }
  if (observation.cadenceTemplateSimilarity > input.policy.maximumCadenceTemplateSimilarity) {
    findings.push(finding("NARRATOR_MONITOR_CADENCE_TEMPLATE_REPETITION_HIGH", "warning", "Repeated cadence templates exceed the reviewed long-form naturalness threshold."));
  }
  if (
    observation.sentenceFinalContourRepetitionRatio
      > input.policy.maximumSentenceFinalContourRepetitionRatio
  ) {
    findings.push(finding("NARRATOR_MONITOR_SENTENCE_FINAL_CONTOUR_REPETITION_HIGH", "warning", "Repeated sentence-final contours exceed the reviewed long-form naturalness threshold."));
  }
  if (observation.noiseFloorDb > input.policy.maximumNoiseFloorDb) {
    findings.push(finding("NARRATOR_MONITOR_NOISE_FLOOR_HIGH", "error", "Chapter noise floor exceeds the reviewed production policy."));
  }
  if (Math.abs(observation.roomToneRmsDb - input.reference.roomToneRmsDb) > input.policy.maximumRoomToneDriftDb) {
    findings.push(finding("NARRATOR_MONITOR_ROOM_TONE_DRIFT", "warning", "Chapter room tone drifted outside the reviewed continuity envelope."));
  }
  if (observation.maximumSeamDiscontinuityScore > input.policy.maximumSeamDiscontinuityScore) {
    findings.push(finding("NARRATOR_MONITOR_SEAM_DISCONTINUITY", "warning", "One or more segment seams exceed the reviewed continuity threshold."));
  }
  if (durationDrift(input.reference, observation.chapterDurationSeconds) > input.policy.maximumChapterDurationDriftRatio) {
    findings.push(finding("NARRATOR_MONITOR_CHAPTER_DURATION_DRIFT", "warning", "Chapter duration drifted outside the reviewed reference envelope."));
  }
  if (continuity.severity === "reject") {
    findings.push(finding("NARRATOR_MONITOR_ACOUSTIC_DRIFT_REJECTED", "error", "Narrator acoustics fall outside the approved continuity envelope."));
  } else if (continuity.severity === "review") {
    findings.push(finding("NARRATOR_MONITOR_ACOUSTIC_DRIFT_REVIEW", "warning", "Narrator acoustics require human continuity review."));
  }

  const errorCount = findings.filter((item) => item.severity === "error").length;
  const warningCount = findings.filter((item) => item.severity === "warning").length;
  const status: NarratorChapterMonitoringStatus = errorCount > 0
    ? "requires-regeneration"
    : warningCount > 0
      ? "requires-human-attention"
      : "eligible-for-human-review";
  const partial: Omit<NarratorChapterMonitoringResult, "fingerprint"> = {
    schemaVersion: NARRATOR_CHAPTER_MONITOR_SCHEMA,
    projectId: observation.projectId,
    chapterId: observation.chapterId,
    castingFingerprint: input.casting.fingerprint,
    voice: Object.freeze({ ...observation.voice }),
    renderFingerprint: observation.renderFingerprint,
    sourceFingerprint: observation.sourceFingerprint,
    policyFingerprint: input.policy.fingerprint,
    referenceFingerprint: input.reference.fingerprint,
    observationFingerprint: observation.fingerprint,
    acousticSignature: Object.freeze({ ...observation.acousticSignature }),
    continuityScore: continuity.score,
    continuitySeverity: continuity.severity,
    transcriptCoverage: observation.transcriptCoverage,
    insertionRatio: observation.insertionRatio,
    minimumSpeakerIdentitySimilarity: observation.minimumSpeakerIdentitySimilarity,
    cadenceTemplateSimilarity: observation.cadenceTemplateSimilarity,
    sentenceFinalContourRepetitionRatio: observation.sentenceFinalContourRepetitionRatio,
    chapterDurationSeconds: observation.chapterDurationSeconds,
    findingCodes: uniqueFindingCodes(findings),
    warningCount,
    errorCount,
    status,
    humanListeningApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    measuredAt: observation.measuredAt,
  };
  return Object.freeze({ ...partial, fingerprint: stableHash(chapterBase(partial)) });
}

export function assertNarratorChapterMonitoringResult(
  result: NarratorChapterMonitoringResult,
  casting: NarratorCastingApproval,
): void {
  assertNarratorCasting(casting);
  if (result.schemaVersion !== NARRATOR_CHAPTER_MONITOR_SCHEMA) throw new Error("NARRATOR_MONITOR_CHAPTER_SCHEMA_UNSUPPORTED");
  if (result.projectId !== casting.projectId || result.castingFingerprint !== casting.fingerprint) {
    throw new Error("NARRATOR_MONITOR_CHAPTER_CASTING_MISMATCH");
  }
  assertExactNarratorVoicePin(casting.voice, result.voice);
  for (const hash of [
    result.renderFingerprint,
    result.sourceFingerprint,
    result.policyFingerprint,
    result.referenceFingerprint,
    result.observationFingerprint,
  ]) requireHash(hash, "NARRATOR_MONITOR_CHAPTER_HASH_INVALID");
  assertAcousticSignature(result.acousticSignature, "NARRATOR_MONITOR_CHAPTER_ACOUSTIC_INVALID");
  requireDate(result.measuredAt, "NARRATOR_MONITOR_CHAPTER_DATE_INVALID");
  if (
    result.humanListeningApproval !== false
    || result.titleReleaseAuthority !== false
    || result.publicationAuthority !== false
  ) throw new Error("NARRATOR_MONITOR_CHAPTER_AUTHORITY_INVALID");
  const { fingerprint, ...partial } = result;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(chapterBase(partial))) {
    throw new Error("NARRATOR_MONITOR_CHAPTER_FINGERPRINT_INVALID");
  }
}

export function monitorNarratorBook(input: Readonly<{
  casting: NarratorCastingApproval;
  expectedChapterIds: readonly string[];
  chapters: readonly NarratorChapterMonitoringResult[];
  assessedAt: string;
}>): NarratorBookMonitoringResult {
  assertNarratorCasting(input.casting);
  if (!Array.isArray(input.expectedChapterIds) || input.expectedChapterIds.length === 0) {
    throw new Error("NARRATOR_BOOK_MONITOR_CHAPTERS_REQUIRED");
  }
  const expectedChapterIds = input.expectedChapterIds.map((id) => requireIdentifier(id, "NARRATOR_BOOK_MONITOR_CHAPTER_ID_INVALID"));
  if (new Set(expectedChapterIds).size !== expectedChapterIds.length) throw new Error("NARRATOR_BOOK_MONITOR_CHAPTER_DUPLICATE");
  if (!Array.isArray(input.chapters) || input.chapters.length !== expectedChapterIds.length) {
    throw new Error("NARRATOR_BOOK_MONITOR_CHAPTER_COUNT_MISMATCH");
  }
  const byId = new Map<string, NarratorChapterMonitoringResult>();
  for (const chapter of input.chapters) {
    assertNarratorChapterMonitoringResult(chapter, input.casting);
    if (byId.has(chapter.chapterId)) throw new Error("NARRATOR_BOOK_MONITOR_CHAPTER_DUPLICATE");
    byId.set(chapter.chapterId, chapter);
  }
  for (const id of expectedChapterIds) {
    if (!byId.has(id)) throw new Error("NARRATOR_BOOK_MONITOR_CHAPTER_MISSING");
  }
  const ordered = expectedChapterIds.map((id) => byId.get(id)!);
  let maximumAdjacentAcousticDrift = 0;
  const findingCodes = new Set<string>();
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index]!;
    for (const code of current.findingCodes) findingCodes.add(code);
    const previous = ordered[index - 1];
    if (!previous) continue;
    const adjacent = assessContinuity(previous.acousticSignature, current.acousticSignature);
    maximumAdjacentAcousticDrift = Math.max(maximumAdjacentAcousticDrift, adjacent.drift);
    if (adjacent.severity === "reject") findingCodes.add("NARRATOR_BOOK_MONITOR_ADJACENT_ACOUSTIC_DRIFT_REJECTED");
    else if (adjacent.severity === "review") findingCodes.add("NARRATOR_BOOK_MONITOR_ADJACENT_ACOUSTIC_DRIFT_REVIEW");
  }
  const regenerationChapterCount = ordered.filter((chapter) => chapter.status === "requires-regeneration").length;
  const attentionChapterCount = ordered.filter((chapter) => chapter.status === "requires-human-attention").length;
  const stableChapterCount = ordered.length - regenerationChapterCount - attentionChapterCount;
  const averageContinuityScore = Number((ordered.reduce((total, chapter) => total + chapter.continuityScore, 0) / ordered.length).toFixed(4));
  const status: NarratorBookMonitoringResult["status"] = regenerationChapterCount > 0
    ? "blocked"
    : attentionChapterCount > 0 || [...findingCodes].some((code) => code.endsWith("_REVIEW"))
      ? "requires-human-attention"
      : "eligible-for-human-book-review";
  const assessedAt = requireDate(input.assessedAt, "NARRATOR_BOOK_MONITOR_DATE_INVALID");
  const partial: Omit<NarratorBookMonitoringResult, "fingerprint"> = {
    schemaVersion: NARRATOR_BOOK_MONITOR_SCHEMA,
    projectId: input.casting.projectId,
    castingFingerprint: input.casting.fingerprint,
    voice: Object.freeze({ ...input.casting.voice }),
    expectedChapterIds: Object.freeze([...expectedChapterIds]),
    chapterResultFingerprints: Object.freeze(ordered.map((chapter) => chapter.fingerprint)),
    chapterCount: ordered.length,
    stableChapterCount,
    attentionChapterCount,
    regenerationChapterCount,
    maximumAdjacentAcousticDrift: Number(maximumAdjacentAcousticDrift.toFixed(6)),
    averageContinuityScore,
    findingCodes: Object.freeze([...findingCodes].sort((left, right) => left.localeCompare(right, "en-AU"))),
    status,
    humanListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    assessedAt,
  };
  return Object.freeze({ ...partial, fingerprint: stableHash(bookBase(partial)) });
}

export function assertNarratorBookMonitoringResult(
  result: NarratorBookMonitoringResult,
  casting: NarratorCastingApproval,
): void {
  assertNarratorCasting(casting);
  if (result.schemaVersion !== NARRATOR_BOOK_MONITOR_SCHEMA) throw new Error("NARRATOR_BOOK_MONITOR_SCHEMA_UNSUPPORTED");
  if (result.projectId !== casting.projectId || result.castingFingerprint !== casting.fingerprint) {
    throw new Error("NARRATOR_BOOK_MONITOR_CASTING_MISMATCH");
  }
  assertExactNarratorVoicePin(casting.voice, result.voice);
  if (
    result.chapterCount !== result.expectedChapterIds.length
    || result.chapterCount !== result.chapterResultFingerprints.length
    || result.stableChapterCount + result.attentionChapterCount + result.regenerationChapterCount !== result.chapterCount
  ) throw new Error("NARRATOR_BOOK_MONITOR_COUNTS_INVALID");
  if (
    result.humanListeningApproval !== false
    || result.titleNarratorApproval !== false
    || result.titleReleaseAuthority !== false
    || result.publicationAuthority !== false
  ) throw new Error("NARRATOR_BOOK_MONITOR_AUTHORITY_INVALID");
  for (const id of result.expectedChapterIds) requireIdentifier(id, "NARRATOR_BOOK_MONITOR_CHAPTER_ID_INVALID");
  for (const hash of result.chapterResultFingerprints) requireHash(hash, "NARRATOR_BOOK_MONITOR_CHAPTER_HASH_INVALID");
  requireDate(result.assessedAt, "NARRATOR_BOOK_MONITOR_DATE_INVALID");
  const { fingerprint, ...partial } = result;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(bookBase(partial))) {
    throw new Error("NARRATOR_BOOK_MONITOR_FINGERPRINT_INVALID");
  }
}
