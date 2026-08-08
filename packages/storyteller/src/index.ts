import { createHash } from "node:crypto";

export const STORYTELLER_ENGINE_VERSION = "0.2.0";

export type Severity = "info" | "warning" | "error";
export type ProjectUse = "audiobook" | "trailer" | "visual-companion" | "accessibility" | "internal-calibration";
export type VoiceSourceKind = "licensed-stock" | "authorised-clone" | "original-cast" | "synthetic-designed";
export type SegmentKind = "heading" | "narration" | "dialogue" | "scene-break";
export type NarrativeDistance = "intimate" | "close" | "balanced" | "formal" | "mythic";

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  segmentId?: string;
  providerId?: string;
}

export interface CraftReference {
  name: string;
  principles: readonly string[];
}

export interface VoiceRightsEvidence {
  id: string;
  voiceLabel: string;
  sourceKind: VoiceSourceKind;
  targetIdentity?: string;
  subjectId?: string;
  consentRecordId?: string;
  licenceRecordId?: string;
  allowedUses: readonly ProjectUse[];
  allowedProjectIds?: readonly string[];
  allowedSeriesIds?: readonly string[];
  territories?: readonly string[];
  expiresAt?: string;
  commercialUseApproved: boolean;
  craftReferences?: readonly CraftReference[];
}

export interface VoiceRightsContext {
  projectId: string;
  seriesId?: string;
  intendedUse: ProjectUse;
  commercial: boolean;
  now?: Date;
}

export interface RightsValidation {
  ok: boolean;
  findings: readonly Finding[];
}

export interface ChapterDefinition {
  id: string;
  ordinal: number;
  title: string;
  sourceStart: number;
}

export interface ManuscriptSegment {
  id: string;
  sourceHash: string;
  chapterId: string;
  chapterOrdinal: number;
  chapterTitle: string;
  ordinal: number;
  kind: SegmentKind;
  sourceStart: number;
  sourceEnd: number;
  text: string;
  wordCount: number;
  estimatedSpeechSeconds: number;
}

export interface SegmentedManuscript {
  sourceHash: string;
  characterCount: number;
  wordCount: number;
  chapters: readonly ChapterDefinition[];
  segments: readonly ManuscriptSegment[];
  findings: readonly Finding[];
}

export interface PerformanceDirection {
  segmentId: string;
  narrativeDistance: NarrativeDistance;
  pace: number;
  intensity: number;
  warmth: number;
  restraint: number;
  clarity: number;
  pauseBeforeMs: number;
  pauseAfterMs: number;
  emotionalObjective: string;
  subtext: string;
  notes: readonly string[];
}

export interface PerformancePlan {
  manuscriptHash: string;
  directions: readonly PerformanceDirection[];
  calibrationSegmentIds: readonly string[];
}

export interface AcousticSignature {
  medianPitchHz: number;
  pitchRangeSemitones: number;
  speakingRateWpm: number;
  pauseRatio: number;
  energyRmsDb: number;
  embeddingDistanceFromAnchor?: number;
}

export interface ContinuityAssessment {
  score: number;
  drift: number;
  severity: "stable" | "review" | "reject";
  findings: readonly Finding[];
}

export type ProviderFeature =
  | "streaming"
  | "batch-long-form"
  | "speech-to-speech"
  | "pronunciation-dictionary"
  | "phoneme-control"
  | "word-timestamps"
  | "multi-speaker"
  | "deterministic-seed"
  | "local-runtime"
  | "regional-processing"
  | "style-instructions";

export interface ProviderProfile {
  id: string;
  label: string;
  features: readonly ProviderFeature[];
  maximumInputCharacters: number;
  regions: readonly string[];
  storesInputs: boolean;
  trainsOnCustomerData: boolean;
  customVoiceRequiresConsent: boolean;
  estimatedUnitCost?: number;
  estimatedLatencyMs?: number;
}

export interface ProviderRequirements {
  requiredFeatures: readonly ProviderFeature[];
  preferredFeatures?: readonly ProviderFeature[];
  maximumSegmentCharacters: number;
  requiredRegion?: string;
  prohibitInputStorage?: boolean;
  prohibitTrainingUse?: boolean;
  requireCloneConsentEnforcement?: boolean;
  maximumUnitCost?: number;
  maximumLatencyMs?: number;
}

export interface ProviderRanking {
  providerId: string;
  label: string;
  eligible: boolean;
  score: number;
  reasons: readonly string[];
}

export interface DeliveryProfile {
  id: string;
  label: string;
  rmsDbMin: number;
  rmsDbMax: number;
  peakDbMax: number;
  truePeakDbMax?: number;
  noiseFloorDbMax: number;
  minimumSampleRateHz: number;
  minimumBitRateKbps?: number;
  channels: 1 | 2;
  notes: readonly string[];
}

export interface AudioMetrics {
  rmsDb: number;
  peakDb: number;
  truePeakDb?: number;
  noiseFloorDb: number;
  sampleRateHz: number;
  bitRateKbps?: number;
  channels: number;
  clippedSampleCount: number;
  leadingSilenceMs: number;
  trailingSilenceMs: number;
}

export interface TranscriptAssessment {
  sourceTokenCount: number;
  observedTokenCount: number;
  sourceCoverage: number;
  insertionRatio: number;
  finalWordPresent: boolean;
  omittedTokens: readonly string[];
  findings: readonly Finding[];
}

export interface TechnicalAssessment {
  score: number;
  findings: readonly Finding[];
}

export interface TakeObservation {
  id: string;
  sourceText: string;
  transcript: string;
  audio: AudioMetrics;
  deliveryProfile: DeliveryProfile;
  continuity?: ContinuityAssessment;
  expressionReviewerScore?: number;
  rightsValid: boolean;
}

export interface CandidateTakeAssessment {
  takeId: string;
  eligible: boolean;
  overallScore: number;
  transcript: TranscriptAssessment;
  technical: TechnicalAssessment;
  continuityScore: number;
  expressionScore: number;
  findings: readonly Finding[];
}

export interface VisualBeat {
  id: string;
  chapterId: string;
  segmentIds: readonly string[];
  sourceStart: number;
  sourceEnd: number;
  wordCount: number;
  estimatedSeconds: number;
  visualObjective: string;
  continuityKeys: readonly string[];
  motionPolicy: "static-layered" | "restrained-parallax" | "practical-overlay" | "slow-camera";
}

export interface ProjectManifest {
  schemaVersion: "storyteller-project-v1";
  engineVersion: string;
  id: string;
  title: string;
  seriesId?: string;
  sourceHash: string;
  createdAt: string;
  status: "blocked" | "planned";
  rights: RightsValidation;
  manuscript: SegmentedManuscript;
  performance: PerformancePlan;
  providers: readonly ProviderRanking[];
  visualBeats: readonly VisualBeat[];
  fingerprint: string;
  findings: readonly Finding[];
}

export interface CreateProjectInput {
  id?: string;
  title: string;
  seriesId?: string;
  manuscriptText: string;
  rightsEvidence: VoiceRightsEvidence;
  intendedUse?: ProjectUse;
  commercial?: boolean;
  providerRequirements: ProviderRequirements;
  providerProfiles: readonly ProviderProfile[];
  maxSegmentCharacters?: number;
  createdAt?: Date;
}

const CHAPTER_HEADING = /^[\t ]*(?:(?:prologue|epilogue)|(?:chapter(?:\s+(?:[0-9ivxlcdm]+|[^\r\n]+))?)|(?:part(?:\s+(?:[0-9ivxlcdm]+|[^\r\n]+))?))[\t ]*$/i;
const SCENE_BREAK = /^(?:\*{3,}|#{3,}|-{3,}|•{3,})$/u;
const FORBIDDEN_REFERENCE_DIRECTION = /\b(?:sound exactly like|sound like|indistinguishable from|impersonat(?:e|ion)|clone(?:d| the)? voice|exact voice|voice of)\b/i;
const WORD_PATTERN = /[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu;

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalise((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

export function stableHash(value: unknown): string {
  const serialised = typeof value === "string" ? value : JSON.stringify(canonicalise(value));
  return createHash("sha256").update(serialised, "utf8").digest("hex");
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function words(value: string): string[] {
  return [...value.toLocaleLowerCase("en-AU").matchAll(WORD_PATTERN)].map((match) => match[0]);
}

function firstNonWhitespace(source: string, start: number, end: number): number {
  let cursor = start;
  while (cursor < end && /\s/u.test(source[cursor] ?? "")) cursor += 1;
  return cursor;
}

function lastNonWhitespace(source: string, start: number, end: number): number {
  let cursor = end;
  while (cursor > start && /\s/u.test(source[cursor - 1] ?? "")) cursor -= 1;
  return cursor;
}

function paragraphSpans(source: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const separator = /(?:\r?\n[\t ]*){2,}/g;
  let cursor = 0;
  for (const match of source.matchAll(separator)) {
    const matchIndex = match.index ?? cursor;
    const start = firstNonWhitespace(source, cursor, matchIndex);
    const end = lastNonWhitespace(source, start, matchIndex);
    if (end > start) spans.push({ start, end });
    cursor = matchIndex + match[0].length;
  }
  const start = firstNonWhitespace(source, cursor, source.length);
  const end = lastNonWhitespace(source, start, source.length);
  if (end > start) spans.push({ start, end });
  return spans;
}

function chooseNaturalSplit(source: string, start: number, maximumEnd: number, hardEnd: number): number {
  const searchStart = Math.min(maximumEnd, start + Math.floor((maximumEnd - start) * 0.55));
  const window = source.slice(searchStart, maximumEnd);
  let sentenceSplit = -1;
  for (const match of window.matchAll(/[.!?…]["'”’\])}]*\s+/gu)) {
    sentenceSplit = searchStart + (match.index ?? 0) + match[0].length;
  }
  if (sentenceSplit > start) return sentenceSplit;

  const whitespaceIndex = window.search(/\s+\S*$/u);
  if (whitespaceIndex >= 0) return searchStart + whitespaceIndex + 1;
  return Math.min(maximumEnd, hardEnd);
}

function splitSpan(source: string, span: { start: number; end: number }, maximumCharacters: number): Array<{ start: number; end: number }> {
  if (span.end - span.start <= maximumCharacters) return [span];
  const chunks: Array<{ start: number; end: number }> = [];
  let cursor = span.start;
  while (cursor < span.end) {
    const remaining = span.end - cursor;
    if (remaining <= maximumCharacters) {
      const start = firstNonWhitespace(source, cursor, span.end);
      const end = lastNonWhitespace(source, start, span.end);
      if (end > start) chunks.push({ start, end });
      break;
    }
    const maximumEnd = Math.min(span.end, cursor + maximumCharacters);
    const split = chooseNaturalSplit(source, cursor, maximumEnd, span.end);
    const start = firstNonWhitespace(source, cursor, split);
    const end = lastNonWhitespace(source, start, split);
    if (end > start) chunks.push({ start, end });
    cursor = split > cursor ? split : maximumEnd;
  }
  return chunks;
}

function estimateSpeechSeconds(text: string): number {
  const wordSeconds = (words(text).length / 155) * 60;
  const punctuationPause = (text.match(/[.!?…:;]/gu)?.length ?? 0) * 0.18;
  const paragraphPause = (text.match(/\r?\n/gu)?.length ?? 0) * 0.22;
  return Math.max(0.4, Number((wordSeconds + punctuationPause + paragraphPause).toFixed(2)));
}

function segmentKind(text: string): SegmentKind {
  const trimmed = text.trim();
  if (CHAPTER_HEADING.test(trimmed)) return "heading";
  if (SCENE_BREAK.test(trimmed)) return "scene-break";
  const dialogueLines = trimmed.split(/\r?\n/u).filter((line) => /^[\t ]*(?:[“"‘']|—)/u.test(line));
  if (dialogueLines.length > 0 || /^[“"‘']/u.test(trimmed)) return "dialogue";
  return "narration";
}

export function segmentManuscript(source: string, options: { maximumCharacters?: number; projectId?: string } = {}): SegmentedManuscript {
  if (typeof source !== "string" || source.trim().length === 0) throw new Error("MANUSCRIPT_SOURCE_EMPTY");
  const maximumCharacters = options.maximumCharacters ?? 1_200;
  if (!Number.isSafeInteger(maximumCharacters) || maximumCharacters < 240 || maximumCharacters > 8_000) {
    throw new Error("MANUSCRIPT_SEGMENT_LIMIT_INVALID");
  }

  const sourceHash = stableHash(source);
  const paragraphs = paragraphSpans(source);
  const chapterCandidates = paragraphs.filter((span) => CHAPTER_HEADING.test(source.slice(span.start, span.end).trim()));
  const chapters: ChapterDefinition[] = chapterCandidates.length > 0
    ? chapterCandidates.map((span, index) => ({
        id: `chapter_${stableHash({ sourceHash, start: span.start }).slice(0, 16)}`,
        ordinal: index + 1,
        title: source.slice(span.start, span.end).trim(),
        sourceStart: span.start,
      }))
    : [{
        id: `chapter_${stableHash({ sourceHash, start: 0 }).slice(0, 16)}`,
        ordinal: 1,
        title: "Book",
        sourceStart: 0,
      }];

  const chunks = paragraphs.flatMap((span) => splitSpan(source, span, maximumCharacters));
  const segments: ManuscriptSegment[] = chunks.map((span, index) => {
    const chapter = [...chapters].reverse().find((candidate) => candidate.sourceStart <= span.start) ?? chapters[0];
    if (!chapter) throw new Error("MANUSCRIPT_CHAPTER_RESOLUTION_FAILED");
    const text = source.slice(span.start, span.end);
    return {
      id: `segment_${stableHash({ projectId: options.projectId ?? null, sourceHash, start: span.start, end: span.end }).slice(0, 20)}`,
      sourceHash,
      chapterId: chapter.id,
      chapterOrdinal: chapter.ordinal,
      chapterTitle: chapter.title,
      ordinal: index + 1,
      kind: segmentKind(text),
      sourceStart: span.start,
      sourceEnd: span.end,
      text,
      wordCount: words(text).length,
      estimatedSpeechSeconds: estimateSpeechSeconds(text),
    };
  });

  const findings = verifySegmentCoverage(source, segments);
  return {
    sourceHash,
    characterCount: source.length,
    wordCount: words(source).length,
    chapters,
    segments,
    findings,
  };
}

export function verifySegmentCoverage(source: string, segments: readonly ManuscriptSegment[]): Finding[] {
  const findings: Finding[] = [];
  let previousEnd = -1;
  for (const segment of segments) {
    if (segment.sourceStart < 0 || segment.sourceEnd > source.length || segment.sourceStart >= segment.sourceEnd) {
      findings.push({ code: "SEGMENT_RANGE_INVALID", severity: "error", message: `Segment ${segment.id} has an invalid source range.`, segmentId: segment.id });
      continue;
    }
    if (segment.sourceStart < previousEnd) {
      findings.push({ code: "SEGMENT_RANGE_OVERLAP", severity: "error", message: `Segment ${segment.id} overlaps the previous segment.`, segmentId: segment.id });
    }
    if (source.slice(segment.sourceStart, segment.sourceEnd) !== segment.text) {
      findings.push({ code: "SEGMENT_SOURCE_MISMATCH", severity: "error", message: `Segment ${segment.id} does not exactly match its immutable source span.`, segmentId: segment.id });
    }
    previousEnd = Math.max(previousEnd, segment.sourceEnd);
  }

  const sourceTokens = words(source);
  const finalToken = sourceTokens.at(-1);
  const finalSegmentTokens = words(segments.at(-1)?.text ?? "");
  if (finalToken && !finalSegmentTokens.includes(finalToken)) {
    findings.push({ code: "MANUSCRIPT_FINAL_WORD_UNCOVERED", severity: "error", message: `The final manuscript word “${finalToken}” is not present in the final production segment.` });
  }
  if (segments.length === 0) findings.push({ code: "MANUSCRIPT_NO_SEGMENTS", severity: "error", message: "No production segments were created." });
  return findings;
}

function directionForSegment(segment: ManuscriptSegment): PerformanceDirection {
  const text = segment.text;
  const questionCount = text.match(/\?/gu)?.length ?? 0;
  const exclamationCount = text.match(/!/gu)?.length ?? 0;
  const ellipsisCount = text.match(/…|\.\.\./gu)?.length ?? 0;
  const sentenceCount = Math.max(1, text.match(/[.!?](?:[”"']|$)/gu)?.length ?? 1);
  const dialogue = segment.kind === "dialogue";
  const heading = segment.kind === "heading";
  const sceneBreak = segment.kind === "scene-break";
  const density = clamp(segment.wordCount / Math.max(1, sentenceCount * 26));

  const pace = heading || sceneBreak ? 0.72 : clamp(0.96 - density * 0.11 + exclamationCount * 0.025, 0.68, 1.2);
  const intensity = sceneBreak ? 0.18 : clamp(0.31 + exclamationCount * 0.1 + questionCount * 0.035 + (dialogue ? 0.08 : 0), 0.12, 0.9);
  const restraint = clamp(0.82 - exclamationCount * 0.08 - (dialogue ? 0.09 : 0), 0.25, 0.95);
  const notes: string[] = [];
  if (dialogue) notes.push("Differentiate intention and rhythm before changing pitch or accent.");
  if (ellipsisCount > 0) notes.push("Treat ellipses as unresolved thought; avoid mechanically identical pauses.");
  if (questionCount > 0) notes.push("Resolve whether each question seeks information, reassurance, control or concealment.");
  if (heading) notes.push("Announce structure cleanly without promotional emphasis.");
  if (sceneBreak) notes.push("Use silence and room continuity rather than spoken decoration.");
  if (segment.wordCount > 170) notes.push("Protect syntactic shape across the longer breath architecture.");

  return {
    segmentId: segment.id,
    narrativeDistance: heading ? "formal" : dialogue ? "close" : intensity > 0.62 ? "intimate" : "balanced",
    pace: Number(pace.toFixed(3)),
    intensity: Number(intensity.toFixed(3)),
    warmth: Number(clamp(dialogue ? 0.56 : 0.48).toFixed(3)),
    restraint: Number(restraint.toFixed(3)),
    clarity: Number(clamp(0.9 - density * 0.08, 0.72, 0.96).toFixed(3)),
    pauseBeforeMs: sceneBreak ? 900 : heading ? 480 : 120,
    pauseAfterMs: sceneBreak ? 1_200 : heading ? 650 : ellipsisCount > 0 ? 360 : 220,
    emotionalObjective: sceneBreak
      ? "Allow the previous dramatic beat to settle before the world changes."
      : dialogue
        ? "Speak from the character’s immediate need, not from an emotion label."
        : "Carry the listener through the author’s thought while preserving narrative perspective.",
    subtext: dialogue
      ? "Infer what the speaker is trying to obtain, avoid or hide; retain ambiguity when the text retains it."
      : "Do not explain more than the prose reveals.",
    notes,
  };
}

export function buildPerformancePlan(manuscript: SegmentedManuscript): PerformancePlan {
  const directions = manuscript.segments.map(directionForSegment);
  const substantive = manuscript.segments.filter((segment) => segment.kind === "dialogue" || segment.wordCount >= 60);
  const calibrationSegmentIds = substantive
    .sort((left, right) => right.wordCount - left.wordCount)
    .slice(0, Math.min(5, substantive.length))
    .map((segment) => segment.id);
  return { manuscriptHash: manuscript.sourceHash, directions, calibrationSegmentIds };
}

export function validateVoiceRights(evidence: VoiceRightsEvidence, context: VoiceRightsContext): RightsValidation {
  const findings: Finding[] = [];
  const now = context.now ?? new Date();
  const add = (code: string, message: string) => findings.push({ code, severity: "error" as const, message });

  for (const reference of evidence.craftReferences ?? []) {
    if (reference.principles.length === 0) add("CRAFT_REFERENCE_EMPTY", `Craft reference ${reference.name} has no stated principles.`);
    for (const principle of reference.principles) {
      if (FORBIDDEN_REFERENCE_DIRECTION.test(principle)) {
        add("CRAFT_REFERENCE_IMPERSONATION_DIRECTION", `Craft reference ${reference.name} contains an identity-imitation instruction rather than a general craft principle.`);
      }
    }
  }

  if (evidence.targetIdentity && evidence.sourceKind !== "authorised-clone") {
    add("VOICE_IDENTITY_IMITATION_FORBIDDEN", "An identifiable target voice requires an explicitly authorised clone record; craft reference alone is not permission.");
  }

  if (evidence.sourceKind === "authorised-clone") {
    if (!evidence.subjectId) add("VOICE_CLONE_SUBJECT_MISSING", "Authorised clone evidence must identify the consenting voice subject.");
    if (!evidence.consentRecordId) add("VOICE_CLONE_CONSENT_MISSING", "Authorised clone evidence must include a verifiable consent record before any expiry evaluation.");
    if (!evidence.targetIdentity) add("VOICE_CLONE_IDENTITY_MISSING", "Authorised clone evidence must identify the licensed voice identity.");
  }

  if (evidence.sourceKind === "original-cast" && !evidence.consentRecordId) {
    add("ORIGINAL_CAST_CONSENT_MISSING", "Original cast recordings require a performer consent and usage record.");
  }

  if (evidence.sourceKind === "licensed-stock" && !evidence.licenceRecordId) {
    add("STOCK_VOICE_LICENCE_MISSING", "Licensed stock voices require a licence record tied to the provider and intended use.");
  }

  if (!evidence.allowedUses.includes(context.intendedUse)) {
    add("VOICE_USE_NOT_AUTHORISED", `Voice rights do not cover intended use: ${context.intendedUse}.`);
  }
  if (context.commercial && !evidence.commercialUseApproved) {
    add("VOICE_COMMERCIAL_USE_NOT_APPROVED", "Commercial production is blocked because commercial voice use is not approved.");
  }
  if (evidence.allowedProjectIds && !evidence.allowedProjectIds.includes(context.projectId)) {
    add("VOICE_PROJECT_NOT_AUTHORISED", "Voice rights are restricted to different project identifiers.");
  }
  if (context.seriesId && evidence.allowedSeriesIds && !evidence.allowedSeriesIds.includes(context.seriesId)) {
    add("VOICE_SERIES_NOT_AUTHORISED", "Voice rights do not cover this series identifier.");
  }

  if (evidence.expiresAt) {
    const expiry = new Date(evidence.expiresAt);
    if (Number.isNaN(expiry.getTime())) add("VOICE_RIGHTS_EXPIRY_INVALID", "Voice rights expiry is not a valid date.");
    else if (expiry.getTime() <= now.getTime()) add("VOICE_RIGHTS_EXPIRED", "Voice rights have expired.");
  }

  return { ok: findings.length === 0, findings };
}

function normalisedDifference(current: number, anchor: number, tolerance: number): number {
  return clamp(Math.abs(current - anchor) / Math.max(tolerance, Number.EPSILON));
}

export function assessContinuity(anchor: AcousticSignature, current: AcousticSignature): ContinuityAssessment {
  const components = [
    { code: "VOICE_PITCH_DRIFT", label: "median pitch", value: normalisedDifference(current.medianPitchHz, anchor.medianPitchHz, Math.max(8, anchor.medianPitchHz * 0.12)), weight: 0.18 },
    { code: "VOICE_RANGE_DRIFT", label: "pitch range", value: normalisedDifference(current.pitchRangeSemitones, anchor.pitchRangeSemitones, 2.5), weight: 0.13 },
    { code: "VOICE_RATE_DRIFT", label: "speaking rate", value: normalisedDifference(current.speakingRateWpm, anchor.speakingRateWpm, Math.max(14, anchor.speakingRateWpm * 0.13)), weight: 0.2 },
    { code: "VOICE_PAUSE_DRIFT", label: "pause ratio", value: normalisedDifference(current.pauseRatio, anchor.pauseRatio, 0.1), weight: 0.16 },
    { code: "VOICE_ENERGY_DRIFT", label: "energy", value: normalisedDifference(current.energyRmsDb, anchor.energyRmsDb, 4), weight: 0.13 },
    { code: "VOICE_EMBEDDING_DRIFT", label: "voice embedding", value: clamp(current.embeddingDistanceFromAnchor ?? 0), weight: 0.2 },
  ];
  const drift = components.reduce((total, component) => total + component.value * component.weight, 0);
  const score = Number(((1 - drift) * 100).toFixed(1));
  const findings = components
    .filter((component) => component.value >= 0.7)
    .map((component) => ({
      code: component.code,
      severity: component.value >= 1 ? "error" as const : "warning" as const,
      message: `Observed ${component.label} differs materially from the approved continuity anchor.`,
    }));
  return {
    score,
    drift: Number(drift.toFixed(4)),
    severity: score >= 85 ? "stable" : score >= 70 ? "review" : "reject",
    findings,
  };
}

export function rankProviders(requirements: ProviderRequirements, profiles: readonly ProviderProfile[]): ProviderRanking[] {
  return profiles.map((profile) => {
    const reasons: string[] = [];
    const features = new Set(profile.features);
    for (const required of requirements.requiredFeatures) {
      if (!features.has(required)) reasons.push(`missing required capability: ${required}`);
    }
    if (profile.maximumInputCharacters < requirements.maximumSegmentCharacters) reasons.push("maximum input is below the production segment size");
    if (requirements.requiredRegion && !profile.regions.includes(requirements.requiredRegion)) reasons.push(`required processing region is unavailable: ${requirements.requiredRegion}`);
    if (requirements.prohibitInputStorage && profile.storesInputs) reasons.push("provider stores inputs but the project prohibits input storage");
    if (requirements.prohibitTrainingUse && profile.trainsOnCustomerData) reasons.push("provider data policy conflicts with the project training-use prohibition");
    if (requirements.requireCloneConsentEnforcement && !profile.customVoiceRequiresConsent) reasons.push("provider does not attest consent enforcement for custom voices");
    if (requirements.maximumUnitCost !== undefined && (profile.estimatedUnitCost ?? Number.POSITIVE_INFINITY) > requirements.maximumUnitCost) reasons.push("estimated unit cost exceeds the project ceiling");
    if (requirements.maximumLatencyMs !== undefined && (profile.estimatedLatencyMs ?? Number.POSITIVE_INFINITY) > requirements.maximumLatencyMs) reasons.push("estimated latency exceeds the project ceiling");

    const eligible = reasons.length === 0;
    let score = eligible ? 70 : 0;
    for (const preferred of requirements.preferredFeatures ?? []) if (features.has(preferred)) score += 5;
    if (!profile.storesInputs) score += 5;
    if (!profile.trainsOnCustomerData) score += 5;
    if (profile.maximumInputCharacters >= requirements.maximumSegmentCharacters * 4) score += 3;
    score = Math.min(100, score);
    return { providerId: profile.id, label: profile.label, eligible, score, reasons };
  }).sort((left, right) => Number(right.eligible) - Number(left.eligible) || right.score - left.score || left.label.localeCompare(right.label, "en-AU"));
}

export const ACX_AUDIOBOOK_PROFILE: DeliveryProfile = Object.freeze({
  id: "acx-audiobook",
  label: "ACX delivery",
  rmsDbMin: -23,
  rmsDbMax: -18,
  peakDbMax: -3,
  noiseFloorDbMax: -60,
  minimumSampleRateHz: 44_100,
  minimumBitRateKbps: 192,
  channels: 1,
  notes: Object.freeze([
    "Each submitted file should contain one chapter or section.",
    "Validate current distributor requirements again at release time.",
    "Keep lossless production masters even when the delivery package is compressed.",
  ]),
});

export const LOSSLESS_PRODUCTION_PROFILE: DeliveryProfile = Object.freeze({
  id: "lossless-production-master",
  label: "Lossless production master",
  rmsDbMin: -24,
  rmsDbMax: -16,
  peakDbMax: -1,
  truePeakDbMax: -1,
  noiseFloorDbMax: -65,
  minimumSampleRateHz: 48_000,
  channels: 1,
  notes: Object.freeze(["Retain 24-bit WAV masters, edit histories and approved source takes before distributor encoding."]),
});

function lcsAlignment(sourceTokens: readonly string[], observedTokens: readonly string[]): { matched: number; omitted: string[] } {
  const rows = sourceTokens.length + 1;
  const columns = observedTokens.length + 1;
  const table = Array.from({ length: rows }, () => new Uint16Array(columns));
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      table[row]![column] = sourceTokens[row - 1] === observedTokens[column - 1]
        ? (table[row - 1]![column - 1] ?? 0) + 1
        : Math.max(table[row - 1]![column] ?? 0, table[row]![column - 1] ?? 0);
    }
  }
  const matched = table[rows - 1]?.[columns - 1] ?? 0;
  const omitted: string[] = [];
  let row = rows - 1;
  let column = columns - 1;
  while (row > 0) {
    if (column > 0 && sourceTokens[row - 1] === observedTokens[column - 1]) {
      row -= 1;
      column -= 1;
    } else if (column > 0 && (table[row]?.[column - 1] ?? 0) >= (table[row - 1]?.[column] ?? 0)) {
      column -= 1;
    } else {
      omitted.push(sourceTokens[row - 1] ?? "");
      row -= 1;
    }
  }
  return { matched, omitted: omitted.reverse().filter(Boolean) };
}

export function assessTranscriptFidelity(sourceText: string, transcript: string): TranscriptAssessment {
  const sourceTokens = words(sourceText);
  const observedTokens = words(transcript);
  const alignment = lcsAlignment(sourceTokens, observedTokens);
  const sourceCoverage = sourceTokens.length === 0 ? 1 : alignment.matched / sourceTokens.length;
  const insertionRatio = observedTokens.length === 0 ? 0 : Math.max(0, observedTokens.length - alignment.matched) / observedTokens.length;
  const finalSourceToken = sourceTokens.at(-1);
  const finalObservedWindow = observedTokens.slice(-3);
  const finalWordPresent = !finalSourceToken || finalObservedWindow.includes(finalSourceToken);
  const findings: Finding[] = [];
  if (sourceCoverage < 0.995) findings.push({ code: "TAKE_TRANSCRIPT_COVERAGE_LOW", severity: "error", message: `Transcript covers ${(sourceCoverage * 100).toFixed(2)}% of source tokens.` });
  if (insertionRatio > 0.01) findings.push({ code: "TAKE_TRANSCRIPT_INSERTIONS", severity: insertionRatio > 0.03 ? "error" : "warning", message: `Transcript contains ${(insertionRatio * 100).toFixed(2)}% unmatched tokens.` });
  if (!finalWordPresent) findings.push({ code: "TAKE_FINAL_WORD_TRUNCATED", severity: "error", message: `The final source word “${finalSourceToken}” is absent from the end of the observed transcript.` });
  return {
    sourceTokenCount: sourceTokens.length,
    observedTokenCount: observedTokens.length,
    sourceCoverage: Number(sourceCoverage.toFixed(5)),
    insertionRatio: Number(insertionRatio.toFixed(5)),
    finalWordPresent,
    omittedTokens: alignment.omitted.slice(0, 50),
    findings,
  };
}

export function assessTechnicalAudio(metrics: AudioMetrics, profile: DeliveryProfile): TechnicalAssessment {
  const findings: Finding[] = [];
  const add = (code: string, severity: Severity, message: string) => findings.push({ code, severity, message });
  if (metrics.rmsDb < profile.rmsDbMin || metrics.rmsDb > profile.rmsDbMax) add("AUDIO_RMS_OUT_OF_RANGE", "error", `RMS ${metrics.rmsDb} dB is outside ${profile.rmsDbMin} to ${profile.rmsDbMax} dB.`);
  if (metrics.peakDb > profile.peakDbMax) add("AUDIO_PEAK_TOO_HIGH", "error", `Peak ${metrics.peakDb} dB exceeds ${profile.peakDbMax} dB.`);
  if (profile.truePeakDbMax !== undefined && (metrics.truePeakDb ?? metrics.peakDb) > profile.truePeakDbMax) add("AUDIO_TRUE_PEAK_TOO_HIGH", "error", `True peak exceeds ${profile.truePeakDbMax} dBTP.`);
  if (metrics.noiseFloorDb > profile.noiseFloorDbMax) add("AUDIO_NOISE_FLOOR_TOO_HIGH", "error", `Noise floor ${metrics.noiseFloorDb} dB is louder than ${profile.noiseFloorDbMax} dB.`);
  if (metrics.sampleRateHz < profile.minimumSampleRateHz) add("AUDIO_SAMPLE_RATE_LOW", "error", `Sample rate ${metrics.sampleRateHz} Hz is below ${profile.minimumSampleRateHz} Hz.`);
  if (profile.minimumBitRateKbps !== undefined && (metrics.bitRateKbps ?? 0) < profile.minimumBitRateKbps) add("AUDIO_BIT_RATE_LOW", "error", `Bit rate is below ${profile.minimumBitRateKbps} kbps.`);
  if (metrics.channels !== profile.channels) add("AUDIO_CHANNEL_COUNT_INVALID", "error", `Expected ${profile.channels} channel(s), received ${metrics.channels}.`);
  if (metrics.clippedSampleCount > 0) add("AUDIO_CLIPPING_DETECTED", "error", `${metrics.clippedSampleCount} clipped sample(s) were detected.`);
  if (metrics.leadingSilenceMs > 5_000) add("AUDIO_LEADING_SILENCE_LONG", "warning", "Leading silence exceeds five seconds.");
  if (metrics.trailingSilenceMs > 5_000) add("AUDIO_TRAILING_SILENCE_LONG", "warning", "Trailing silence exceeds five seconds.");
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  return { score: Math.max(0, 100 - errors * 18 - warnings * 5), findings };
}

export function assessCandidateTake(observation: TakeObservation): CandidateTakeAssessment {
  const transcript = assessTranscriptFidelity(observation.sourceText, observation.transcript);
  const technical = assessTechnicalAudio(observation.audio, observation.deliveryProfile);
  const continuityScore = observation.continuity?.score ?? 100;
  const expressionScore = clamp(observation.expressionReviewerScore ?? 70, 0, 100);
  const findings: Finding[] = [...transcript.findings, ...technical.findings, ...(observation.continuity?.findings ?? [])];
  if (!observation.rightsValid) findings.unshift({ code: "TAKE_RIGHTS_NOT_VALID", severity: "error", message: "Take cannot be approved because its voice rights gate is not valid." });
  const eligible = observation.rightsValid && transcript.sourceCoverage >= 0.995 && transcript.finalWordPresent && !findings.some((finding) => finding.severity === "error");
  const overallScore = eligible
    ? transcript.sourceCoverage * 45 + technical.score * 0.22 + continuityScore * 0.2 + expressionScore * 0.13
    : 0;
  return {
    takeId: observation.id,
    eligible,
    overallScore: Number(overallScore.toFixed(2)),
    transcript,
    technical,
    continuityScore,
    expressionScore,
    findings,
  };
}

export function selectBestCandidate(assessments: readonly CandidateTakeAssessment[]): CandidateTakeAssessment | null {
  return assessments.filter((assessment) => assessment.eligible).sort((left, right) => right.overallScore - left.overallScore || left.takeId.localeCompare(right.takeId, "en-AU"))[0] ?? null;
}

export function buildVisualBeatPlan(segments: readonly ManuscriptSegment[], options: { targetSeconds?: number; maximumWords?: number } = {}): VisualBeat[] {
  const targetSeconds = options.targetSeconds ?? 14;
  const maximumWords = options.maximumWords ?? 110;
  const beats: VisualBeat[] = [];
  let group: ManuscriptSegment[] = [];

  const flush = () => {
    if (group.length === 0) return;
    const first = group[0];
    const last = group.at(-1);
    if (!first || !last) return;
    const text = group.map((segment) => segment.text).join(" ");
    const hash = stableHash({ chapter: first.chapterId, segments: group.map((segment) => segment.id) });
    const policies: VisualBeat["motionPolicy"][] = ["static-layered", "restrained-parallax", "practical-overlay", "slow-camera"];
    const motionPolicy = policies[Number.parseInt(hash.slice(0, 2), 16) % policies.length] ?? "static-layered";
    const kinds = new Set(group.map((segment) => segment.kind));
    beats.push({
      id: `beat_${hash.slice(0, 18)}`,
      chapterId: first.chapterId,
      segmentIds: group.map((segment) => segment.id),
      sourceStart: first.sourceStart,
      sourceEnd: last.sourceEnd,
      wordCount: group.reduce((total, segment) => total + segment.wordCount, 0),
      estimatedSeconds: Number(group.reduce((total, segment) => total + segment.estimatedSpeechSeconds, 0).toFixed(2)),
      visualObjective: kinds.has("dialogue")
        ? "Hold character intention, spatial relationships and reaction detail instead of illustrating every spoken line."
        : "Express the scene’s dramatic change, atmosphere and point of view without literal sentence-by-sentence imagery.",
      continuityKeys: [`chapter:${first.chapterId}`, `location:unresolved`, `cast:review-required`],
      motionPolicy,
    });
    group = [];
  };

  for (const segment of segments) {
    if (segment.kind === "heading") continue;
    if (segment.kind === "scene-break") {
      flush();
      continue;
    }
    const projectedWords = group.reduce((total, item) => total + item.wordCount, 0) + segment.wordCount;
    const projectedSeconds = group.reduce((total, item) => total + item.estimatedSpeechSeconds, 0) + segment.estimatedSpeechSeconds;
    const crossesChapter = group.length > 0 && group[0]?.chapterId !== segment.chapterId;
    if (crossesChapter || (group.length > 0 && (projectedWords > maximumWords || projectedSeconds > targetSeconds * 1.7))) flush();
    group.push(segment);
  }
  flush();
  return beats;
}

export function createProjectManifest(input: CreateProjectInput): ProjectManifest {
  const createdAt = input.createdAt ?? new Date();
  const sourceHash = stableHash(input.manuscriptText);
  const id = input.id ?? `project_${stableHash({ title: input.title, sourceHash }).slice(0, 16)}`;
  const rights = validateVoiceRights(input.rightsEvidence, {
    projectId: id,
    seriesId: input.seriesId,
    intendedUse: input.intendedUse ?? "audiobook",
    commercial: input.commercial ?? true,
    now: createdAt,
  });
  const manuscript = segmentManuscript(input.manuscriptText, { maximumCharacters: input.maxSegmentCharacters, projectId: id });
  const performance = buildPerformancePlan(manuscript);
  const providers = rankProviders(input.providerRequirements, input.providerProfiles);
  const visualBeats = buildVisualBeatPlan(manuscript.segments);
  const findings = [...rights.findings, ...manuscript.findings];
  if (!providers.some((provider) => provider.eligible)) findings.push({ code: "PROVIDER_NO_ELIGIBLE_ROUTE", severity: "error", message: "No configured provider satisfies the project capability and data-policy requirements." });
  const status = findings.some((finding) => finding.severity === "error") ? "blocked" : "planned";
  const fingerprint = stableHash({
    schemaVersion: "storyteller-project-v1",
    engineVersion: STORYTELLER_ENGINE_VERSION,
    id,
    title: input.title,
    seriesId: input.seriesId ?? null,
    sourceHash,
    rightsEvidence: input.rightsEvidence,
    providerRequirements: input.providerRequirements,
    segmentIds: manuscript.segments.map((segment) => segment.id),
  });
  return {
    schemaVersion: "storyteller-project-v1",
    engineVersion: STORYTELLER_ENGINE_VERSION,
    id,
    title: input.title,
    ...(input.seriesId ? { seriesId: input.seriesId } : {}),
    sourceHash,
    createdAt: createdAt.toISOString(),
    status,
    rights,
    manuscript,
    performance,
    providers,
    visualBeats,
    fingerprint,
    findings,
  };
}

export interface GenerationJob {
  id: string;
  projectId: string;
  segmentId: string;
  providerFallbackIds: readonly string[];
  cacheKey: string;
  candidateCount: number;
  status: "blocked" | "ready";
}

export function createGenerationJobs(manifest: ProjectManifest, candidateCount = 3): GenerationJob[] {
  if (!Number.isSafeInteger(candidateCount) || candidateCount < 1 || candidateCount > 8) throw new Error("GENERATION_CANDIDATE_COUNT_INVALID");
  const providerFallbackIds = manifest.providers.filter((provider) => provider.eligible).map((provider) => provider.providerId);
  return manifest.manuscript.segments
    .filter((segment) => segment.kind === "narration" || segment.kind === "dialogue")
    .map((segment) => ({
      id: `job_${stableHash({ project: manifest.id, fingerprint: manifest.fingerprint, segment: segment.id }).slice(0, 20)}`,
      projectId: manifest.id,
      segmentId: segment.id,
      providerFallbackIds,
      cacheKey: stableHash({ projectFingerprint: manifest.fingerprint, segmentId: segment.id, candidateCount }),
      candidateCount,
      status: manifest.status === "planned" && providerFallbackIds.length > 0 ? "ready" : "blocked",
    }));
}
