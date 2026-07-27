import {
  assessContinuity,
  stableHash,
  type AcousticSignature,
  type Finding,
  type ManuscriptSegment,
  type VoiceSourceKind,
} from "./index.js";

export type SeriesVoiceRole = "narrator" | "character";
export type ContinuityChangeKind = "voice-recast" | "age-evolution" | "injury" | "language-shift" | "narrative-distance" | "pronunciation-revision";

export interface SeriesVoiceAssignment {
  id: string;
  role: SeriesVoiceRole;
  characterId?: string;
  voiceProfileId: string;
  voiceProfileRevision: number;
  sourceKind: VoiceSourceKind;
  continuityAnchorId: string;
  introducedInBookId: string;
  approvedBy: string;
  notes: readonly string[];
}

export interface SeriesPronunciation {
  id: string;
  writtenForm: string;
  canonicalForm: string;
  language?: string;
  context?: string;
  revision: number;
  introducedInBookId: string;
  approvedBy: string;
}

export interface SeriesAcousticAnchor {
  voiceProfileId: string;
  continuityAnchorId: string;
  signature: AcousticSignature;
  approvedInBookId: string;
  revision: number;
}

export interface SeriesContinuityBible {
  schemaVersion: "storyteller-series-continuity-v1";
  seriesId: string;
  title: string;
  revision: number;
  narratorAssignmentId: string;
  voiceAssignments: readonly SeriesVoiceAssignment[];
  pronunciations: readonly SeriesPronunciation[];
  acousticAnchors: readonly SeriesAcousticAnchor[];
  performancePrinciples: readonly string[];
  prohibitedShortcuts: readonly string[];
  createdAt: string;
  updatedAt: string;
  previousFingerprint?: string;
  fingerprint: string;
}

export interface ApprovedContinuityChange {
  id: string;
  kind: ContinuityChangeKind;
  targetId: string;
  fromRevision?: number;
  toRevision?: number;
  rationale: string;
  approvedBy: string;
  approvedAt: string;
}

export interface BookVoiceObservation {
  assignmentId: string;
  voiceProfileId: string;
  voiceProfileRevision: number;
  continuityAnchorId: string;
  acousticSignature?: AcousticSignature;
}

export interface BookPronunciationObservation {
  pronunciationId?: string;
  writtenForm: string;
  canonicalForm: string;
  language?: string;
  context?: string;
}

export interface BookContinuitySnapshot {
  seriesId: string;
  bookId: string;
  ordinal: number;
  narratorAssignmentId: string;
  voices: readonly BookVoiceObservation[];
  pronunciations: readonly BookPronunciationObservation[];
  approvedChanges: readonly ApprovedContinuityChange[];
}

export interface SeriesContinuityAssessment {
  seriesId: string;
  bookId: string;
  score: number;
  status: "compatible" | "review" | "blocked";
  findings: readonly Finding[];
  voiceScores: Readonly<Record<string, number>>;
  proposedPronunciations: readonly BookPronunciationObservation[];
}

export interface RegressionCalibrationItem {
  id: string;
  segmentId: string;
  chapterId: string;
  category: "dialogue" | "long-syntax" | "quiet-narration" | "high-pressure" | "chapter-ending";
  reason: string;
  priority: number;
}

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,127}$/u;
const FORBIDDEN_SHORTCUT = /\b(?:sound exactly like|clone|impersonat(?:e|ion)|indistinguishable from|voice of)\b/i;

function requireId(value: string, code: string): void {
  if (!SAFE_ID.test(value)) throw new Error(code);
}

function normaliseTerm(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-AU").replace(/\s+/gu, " ");
}

function canonicalPronunciationKey(value: Pick<SeriesPronunciation, "writtenForm" | "language" | "context">): string {
  return [normaliseTerm(value.writtenForm), normaliseTerm(value.language ?? ""), normaliseTerm(value.context ?? "")].join("|");
}

function voiceAssignmentKey(value: Pick<SeriesVoiceAssignment, "role" | "characterId">): string {
  return value.role === "narrator" ? "narrator" : `character:${value.characterId ?? ""}`;
}

function approvedChange(snapshot: BookContinuitySnapshot, kind: ContinuityChangeKind, targetId: string): ApprovedContinuityChange | undefined {
  return snapshot.approvedChanges.find((change) => change.kind === kind && change.targetId === targetId && change.rationale.trim().length >= 12 && change.approvedBy.trim().length > 0);
}

function validateBibleInput(input: Omit<SeriesContinuityBible, "schemaVersion" | "revision" | "createdAt" | "updatedAt" | "fingerprint">): void {
  requireId(input.seriesId, "SERIES_ID_INVALID");
  requireId(input.narratorAssignmentId, "SERIES_NARRATOR_ASSIGNMENT_ID_INVALID");
  if (!input.title.trim()) throw new Error("SERIES_TITLE_REQUIRED");
  const assignmentIds = new Set<string>();
  const assignmentKeys = new Set<string>();
  for (const assignment of input.voiceAssignments) {
    requireId(assignment.id, "SERIES_VOICE_ASSIGNMENT_ID_INVALID");
    requireId(assignment.voiceProfileId, "SERIES_VOICE_PROFILE_ID_INVALID");
    requireId(assignment.continuityAnchorId, "SERIES_CONTINUITY_ANCHOR_ID_INVALID");
    requireId(assignment.introducedInBookId, "SERIES_BOOK_ID_INVALID");
    if (!Number.isSafeInteger(assignment.voiceProfileRevision) || assignment.voiceProfileRevision < 1) throw new Error("SERIES_VOICE_REVISION_INVALID");
    if (assignment.role === "character" && !assignment.characterId) throw new Error("SERIES_CHARACTER_ID_REQUIRED");
    if (assignmentIds.has(assignment.id)) throw new Error(`SERIES_VOICE_ASSIGNMENT_DUPLICATE:${assignment.id}`);
    const key = voiceAssignmentKey(assignment);
    if (assignmentKeys.has(key)) throw new Error(`SERIES_VOICE_ROLE_DUPLICATE:${key}`);
    assignmentIds.add(assignment.id);
    assignmentKeys.add(key);
  }
  if (!assignmentIds.has(input.narratorAssignmentId)) throw new Error("SERIES_NARRATOR_ASSIGNMENT_NOT_FOUND");
  const narrator = input.voiceAssignments.find((assignment) => assignment.id === input.narratorAssignmentId);
  if (narrator?.role !== "narrator") throw new Error("SERIES_NARRATOR_ASSIGNMENT_ROLE_INVALID");

  const pronunciationIds = new Set<string>();
  const pronunciationKeys = new Set<string>();
  for (const pronunciation of input.pronunciations) {
    requireId(pronunciation.id, "SERIES_PRONUNCIATION_ID_INVALID");
    if (!pronunciation.writtenForm.trim() || !pronunciation.canonicalForm.trim()) throw new Error("SERIES_PRONUNCIATION_FORM_REQUIRED");
    if (!Number.isSafeInteger(pronunciation.revision) || pronunciation.revision < 1) throw new Error("SERIES_PRONUNCIATION_REVISION_INVALID");
    if (pronunciationIds.has(pronunciation.id)) throw new Error(`SERIES_PRONUNCIATION_ID_DUPLICATE:${pronunciation.id}`);
    const key = canonicalPronunciationKey(pronunciation);
    if (pronunciationKeys.has(key)) throw new Error(`SERIES_PRONUNCIATION_TERM_DUPLICATE:${key}`);
    pronunciationIds.add(pronunciation.id);
    pronunciationKeys.add(key);
  }

  const anchorProfiles = new Set<string>();
  for (const anchor of input.acousticAnchors) {
    requireId(anchor.voiceProfileId, "SERIES_ACOUSTIC_PROFILE_ID_INVALID");
    requireId(anchor.continuityAnchorId, "SERIES_ACOUSTIC_ANCHOR_ID_INVALID");
    if (!Number.isSafeInteger(anchor.revision) || anchor.revision < 1) throw new Error("SERIES_ACOUSTIC_ANCHOR_REVISION_INVALID");
    if (anchorProfiles.has(anchor.voiceProfileId)) throw new Error(`SERIES_ACOUSTIC_PROFILE_DUPLICATE:${anchor.voiceProfileId}`);
    anchorProfiles.add(anchor.voiceProfileId);
  }

  for (const shortcut of input.prohibitedShortcuts) {
    if (shortcut.trim().length < 5) throw new Error("SERIES_PROHIBITED_SHORTCUT_TOO_SHORT");
  }
  for (const principle of input.performancePrinciples) {
    if (FORBIDDEN_SHORTCUT.test(principle)) throw new Error("SERIES_PERFORMANCE_PRINCIPLE_IMPERSONATION_FORBIDDEN");
  }
}

function bibleFingerprint(input: Omit<SeriesContinuityBible, "fingerprint">): string {
  return stableHash({
    ...input,
    voiceAssignments: [...input.voiceAssignments].sort((left, right) => left.id.localeCompare(right.id, "en-AU")),
    pronunciations: [...input.pronunciations].sort((left, right) => left.id.localeCompare(right.id, "en-AU")),
    acousticAnchors: [...input.acousticAnchors].sort((left, right) => left.voiceProfileId.localeCompare(right.voiceProfileId, "en-AU")),
  });
}

export function createSeriesContinuityBible(
  input: Omit<SeriesContinuityBible, "schemaVersion" | "revision" | "createdAt" | "updatedAt" | "fingerprint">,
  now = new Date(),
): SeriesContinuityBible {
  validateBibleInput(input);
  const instant = now.toISOString();
  const partial: Omit<SeriesContinuityBible, "fingerprint"> = {
    schemaVersion: "storyteller-series-continuity-v1",
    ...input,
    revision: 1,
    createdAt: instant,
    updatedAt: instant,
  };
  return { ...partial, fingerprint: bibleFingerprint(partial) };
}

export function verifySeriesContinuityBible(bible: SeriesContinuityBible): Finding[] {
  const findings: Finding[] = [];
  try {
    validateBibleInput({
      seriesId: bible.seriesId,
      title: bible.title,
      narratorAssignmentId: bible.narratorAssignmentId,
      voiceAssignments: bible.voiceAssignments,
      pronunciations: bible.pronunciations,
      acousticAnchors: bible.acousticAnchors,
      performancePrinciples: bible.performancePrinciples,
      prohibitedShortcuts: bible.prohibitedShortcuts,
      ...(bible.previousFingerprint ? { previousFingerprint: bible.previousFingerprint } : {}),
    });
  } catch (error) {
    findings.push({ code: "SERIES_BIBLE_STRUCTURE_INVALID", severity: "error", message: error instanceof Error ? error.message : "Series continuity bible is invalid." });
  }
  const { fingerprint, ...partial } = bible;
  if (bibleFingerprint(partial) !== fingerprint) findings.push({ code: "SERIES_BIBLE_FINGERPRINT_MISMATCH", severity: "error", message: "Series continuity bible fingerprint does not match its current content." });
  if (bible.schemaVersion !== "storyteller-series-continuity-v1") findings.push({ code: "SERIES_BIBLE_SCHEMA_UNSUPPORTED", severity: "error", message: "Series continuity bible schema is unsupported." });
  if (!Number.isSafeInteger(bible.revision) || bible.revision < 1) findings.push({ code: "SERIES_BIBLE_REVISION_INVALID", severity: "error", message: "Series continuity bible revision is invalid." });
  return findings;
}

export function assessBookContinuity(bible: SeriesContinuityBible, snapshot: BookContinuitySnapshot): SeriesContinuityAssessment {
  const findings: Finding[] = [...verifySeriesContinuityBible(bible)];
  const voiceScores: Record<string, number> = {};
  const proposedPronunciations: BookPronunciationObservation[] = [];

  if (snapshot.seriesId !== bible.seriesId) findings.push({ code: "SERIES_BOOK_ID_MISMATCH", severity: "error", message: "Book snapshot belongs to a different series." });
  requireId(snapshot.bookId, "SERIES_BOOK_ID_INVALID");
  if (!Number.isSafeInteger(snapshot.ordinal) || snapshot.ordinal < 1) throw new Error("SERIES_BOOK_ORDINAL_INVALID");
  if (snapshot.narratorAssignmentId !== bible.narratorAssignmentId) {
    findings.push({ code: "SERIES_NARRATOR_ASSIGNMENT_CHANGED", severity: "error", message: "Book snapshot silently changes the approved series narrator assignment." });
  }

  const expectedAssignments = new Map(bible.voiceAssignments.map((assignment) => [assignment.id, assignment]));
  const observedAssignments = new Set<string>();
  for (const observation of snapshot.voices) {
    if (observedAssignments.has(observation.assignmentId)) {
      findings.push({ code: "SERIES_BOOK_VOICE_OBSERVATION_DUPLICATE", severity: "error", message: `Book contains duplicate voice observation ${observation.assignmentId}.` });
      continue;
    }
    observedAssignments.add(observation.assignmentId);
    const expected = expectedAssignments.get(observation.assignmentId);
    if (!expected) {
      findings.push({ code: "SERIES_BOOK_VOICE_ASSIGNMENT_UNKNOWN", severity: "warning", message: `Book introduces unregistered voice assignment ${observation.assignmentId}.` });
      continue;
    }

    if (observation.voiceProfileId !== expected.voiceProfileId) {
      const change = approvedChange(snapshot, "voice-recast", observation.assignmentId);
      findings.push({
        code: change ? "SERIES_VOICE_RECAST_APPROVED_REVIEW" : "SERIES_VOICE_RECAST_UNAPPROVED",
        severity: change ? "warning" : "error",
        message: change
          ? `Voice assignment ${observation.assignmentId} uses an approved recast that must be promoted into the series bible.`
          : `Voice assignment ${observation.assignmentId} changes profile without an approved recast record.`,
      });
    }
    if (observation.voiceProfileRevision < expected.voiceProfileRevision) {
      findings.push({ code: "SERIES_VOICE_REVISION_REGRESSION", severity: "error", message: `Voice assignment ${observation.assignmentId} uses an older profile revision.` });
    } else if (observation.voiceProfileRevision > expected.voiceProfileRevision && !approvedChange(snapshot, "age-evolution", observation.assignmentId) && !approvedChange(snapshot, "narrative-distance", observation.assignmentId)) {
      findings.push({ code: "SERIES_VOICE_REVISION_UNAPPROVED", severity: "warning", message: `Voice assignment ${observation.assignmentId} uses a newer profile revision without a documented continuity change.` });
    }
    if (observation.continuityAnchorId !== expected.continuityAnchorId && !approvedChange(snapshot, "age-evolution", observation.assignmentId) && !approvedChange(snapshot, "injury", observation.assignmentId)) {
      findings.push({ code: "SERIES_CONTINUITY_ANCHOR_CHANGED", severity: "error", message: `Voice assignment ${observation.assignmentId} changes its continuity anchor without an approved story reason.` });
    }

    const anchor = bible.acousticAnchors.find((candidate) => candidate.voiceProfileId === expected.voiceProfileId);
    if (anchor && observation.acousticSignature) {
      const assessment = assessContinuity(anchor.signature, observation.acousticSignature);
      voiceScores[observation.assignmentId] = assessment.score;
      findings.push(...assessment.findings.map((finding) => ({ ...finding, message: `${observation.assignmentId}: ${finding.message}` })));
      if (assessment.severity === "reject" && !approvedChange(snapshot, "age-evolution", observation.assignmentId) && !approvedChange(snapshot, "injury", observation.assignmentId)) {
        findings.push({ code: "SERIES_ACOUSTIC_DRIFT_REJECTED", severity: "error", message: `Voice assignment ${observation.assignmentId} falls outside the approved continuity envelope.` });
      } else if (assessment.severity === "review") {
        findings.push({ code: "SERIES_ACOUSTIC_DRIFT_REVIEW", severity: "warning", message: `Voice assignment ${observation.assignmentId} requires continuity review.` });
      }
    } else if (anchor && !observation.acousticSignature) {
      findings.push({ code: "SERIES_ACOUSTIC_OBSERVATION_MISSING", severity: "warning", message: `Voice assignment ${observation.assignmentId} has no acoustic observation for regression review.` });
    }
  }

  for (const expected of bible.voiceAssignments) {
    if (!observedAssignments.has(expected.id)) findings.push({ code: "SERIES_EXPECTED_VOICE_UNOBSERVED", severity: "warning", message: `Book snapshot does not include approved voice assignment ${expected.id}.` });
  }

  const canonical = new Map(bible.pronunciations.map((entry) => [canonicalPronunciationKey(entry), entry]));
  const observedPronunciationKeys = new Set<string>();
  for (const observation of snapshot.pronunciations) {
    const key = canonicalPronunciationKey(observation);
    if (observedPronunciationKeys.has(key)) {
      findings.push({ code: "SERIES_BOOK_PRONUNCIATION_DUPLICATE", severity: "error", message: `Book contains duplicate pronunciation observation for ${observation.writtenForm}.` });
      continue;
    }
    observedPronunciationKeys.add(key);
    const expected = canonical.get(key);
    if (!expected) {
      proposedPronunciations.push(observation);
      findings.push({ code: "SERIES_PRONUNCIATION_PROPOSED", severity: "warning", message: `New pronunciation ${observation.writtenForm} requires approval before it becomes series canon.` });
      continue;
    }
    if (normaliseTerm(observation.canonicalForm) !== normaliseTerm(expected.canonicalForm)) {
      const change = approvedChange(snapshot, "pronunciation-revision", expected.id);
      findings.push({
        code: change ? "SERIES_PRONUNCIATION_REVISION_APPROVED_REVIEW" : "SERIES_PRONUNCIATION_CONFLICT",
        severity: change ? "warning" : "error",
        message: change
          ? `Pronunciation ${observation.writtenForm} has an approved revision awaiting promotion.`
          : `Pronunciation ${observation.writtenForm} conflicts with approved series canon.`,
      });
    }
  }

  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  const acousticScores = Object.values(voiceScores);
  const acousticAverage = acousticScores.length > 0 ? acousticScores.reduce((total, score) => total + score, 0) / acousticScores.length : 100;
  const score = Math.max(0, Math.min(100, Number((acousticAverage - errors * 18 - warnings * 3).toFixed(1))));
  return {
    seriesId: bible.seriesId,
    bookId: snapshot.bookId,
    score,
    status: errors > 0 ? "blocked" : warnings > 0 || score < 88 ? "review" : "compatible",
    findings,
    voiceScores,
    proposedPronunciations,
  };
}

export function promoteBookContinuity(
  bible: SeriesContinuityBible,
  snapshot: BookContinuitySnapshot,
  input: Readonly<{
    approvedBy: string;
    approvedAt?: Date;
    voiceAssignments?: readonly SeriesVoiceAssignment[];
    pronunciations?: readonly SeriesPronunciation[];
    acousticAnchors?: readonly SeriesAcousticAnchor[];
  }>,
): SeriesContinuityBible {
  const assessment = assessBookContinuity(bible, snapshot);
  const unresolvedErrors = assessment.findings.filter((finding) => finding.severity === "error");
  if (unresolvedErrors.length > 0) throw new Error(`SERIES_PROMOTION_BLOCKED:${unresolvedErrors.map((finding) => finding.code).join(",")}`);
  requireId(input.approvedBy, "SERIES_APPROVER_ID_INVALID");
  const instant = (input.approvedAt ?? new Date()).toISOString();
  const voiceAssignments = input.voiceAssignments ?? bible.voiceAssignments;
  const pronunciations = input.pronunciations ?? bible.pronunciations;
  const acousticAnchors = input.acousticAnchors ?? bible.acousticAnchors;
  const validationInput = {
    seriesId: bible.seriesId,
    title: bible.title,
    narratorAssignmentId: bible.narratorAssignmentId,
    voiceAssignments,
    pronunciations,
    acousticAnchors,
    performancePrinciples: bible.performancePrinciples,
    prohibitedShortcuts: bible.prohibitedShortcuts,
    previousFingerprint: bible.fingerprint,
  };
  validateBibleInput(validationInput);
  const partial: Omit<SeriesContinuityBible, "fingerprint"> = {
    schemaVersion: "storyteller-series-continuity-v1",
    ...validationInput,
    revision: bible.revision + 1,
    createdAt: bible.createdAt,
    updatedAt: instant,
  };
  return { ...partial, fingerprint: bibleFingerprint(partial) };
}

export function buildSeriesRegressionSuite(segments: readonly ManuscriptSegment[], maximumItems = 12): RegressionCalibrationItem[] {
  if (!Number.isSafeInteger(maximumItems) || maximumItems < 5 || maximumItems > 40) throw new Error("SERIES_REGRESSION_SUITE_LIMIT_INVALID");
  const substantive = segments.filter((segment) => segment.kind === "narration" || segment.kind === "dialogue");
  const candidates: RegressionCalibrationItem[] = [];

  for (const segment of substantive) {
    const punctuationPressure = (segment.text.match(/[!?…—]/gu)?.length ?? 0) / Math.max(1, segment.wordCount);
    const syntaxTurnCount = segment.text.match(/[,;:—]/gu)?.length ?? 0;
    if (segment.kind === "dialogue") {
      candidates.push({ id: `regression_${stableHash({ segment: segment.id, category: "dialogue" }).slice(0, 18)}`, segmentId: segment.id, chapterId: segment.chapterId, category: "dialogue", reason: "Checks recurring character distinction, intention and dialogue transitions.", priority: 92 + Math.min(7, Math.round(punctuationPressure * 100)) });
    }
    if (
      segment.wordCount >= 90
      || (segment.kind === "narration" && segment.wordCount >= 24 && syntaxTurnCount >= 2)
    ) {
      candidates.push({ id: `regression_${stableHash({ segment: segment.id, category: "long-syntax" }).slice(0, 18)}`, segmentId: segment.id, chapterId: segment.chapterId, category: "long-syntax", reason: "Checks breath architecture, clarity and sentence-shape continuity.", priority: 82 + Math.min(12, Math.floor(segment.wordCount / 40) + syntaxTurnCount) });
    }
    if (segment.kind === "narration" && punctuationPressure < 0.025) {
      candidates.push({ id: `regression_${stableHash({ segment: segment.id, category: "quiet-narration" }).slice(0, 18)}`, segmentId: segment.id, chapterId: segment.chapterId, category: "quiet-narration", reason: "Checks listener relationship and natural variation without dramatic prompts.", priority: 76 + Math.min(8, Math.floor(segment.wordCount / 35)) });
    }
    if (punctuationPressure >= 0.035 || (segment.kind === "dialogue" && segment.wordCount <= 24)) {
      candidates.push({ id: `regression_${stableHash({ segment: segment.id, category: "high-pressure" }).slice(0, 18)}`, segmentId: segment.id, chapterId: segment.chapterId, category: "high-pressure", reason: "Checks urgency, emotional control and avoidance of synthetic overstatement.", priority: 88 + Math.min(10, Math.round(punctuationPressure * 100) + (segment.kind === "dialogue" ? 1 : 0)) });
    }
  }

  const lastByChapter = new Map<string, ManuscriptSegment>();
  for (const segment of substantive) lastByChapter.set(segment.chapterId, segment);
  for (const segment of lastByChapter.values()) {
    candidates.push({ id: `regression_${stableHash({ segment: segment.id, category: "chapter-ending" }).slice(0, 18)}`, segmentId: segment.id, chapterId: segment.chapterId, category: "chapter-ending", reason: "Checks sentence-tail completeness, silence and chapter-ending restraint.", priority: 96 });
  }

  const selected: RegressionCalibrationItem[] = [];
  const usedSegments = new Set<string>();
  const categories: RegressionCalibrationItem["category"][] = ["dialogue", "long-syntax", "quiet-narration", "high-pressure", "chapter-ending"];
  for (const category of categories) {
    const candidate = candidates.filter((item) => item.category === category).sort((left, right) => right.priority - left.priority || left.segmentId.localeCompare(right.segmentId, "en-AU")).find((item) => !usedSegments.has(item.segmentId));
    if (candidate) {
      selected.push(candidate);
      usedSegments.add(candidate.segmentId);
    }
  }
  for (const candidate of candidates.sort((left, right) => right.priority - left.priority || left.segmentId.localeCompare(right.segmentId, "en-AU"))) {
    if (selected.length >= maximumItems) break;
    if (usedSegments.has(candidate.segmentId)) continue;
    selected.push(candidate);
    usedSegments.add(candidate.segmentId);
  }
  return selected.slice(0, maximumItems);
}
