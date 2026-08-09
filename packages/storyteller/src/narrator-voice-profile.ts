import { createHash } from "node:crypto";
import { stableHash } from "./index.js";

export const AUDIO_STUDIO_NARRATOR_PROFILE_SCHEMA =
  "evavo_storyteller_narrator_voice_profile_v1" as const;
export const STORYTELLER_NARRATOR_CASTING_SCHEMA =
  "storyteller-narrator-casting-v1" as const;
export const STORYTELLER_CHAPTER_NARRATOR_REVIEW_SCHEMA =
  "storyteller-chapter-narrator-review-v1" as const;
export const STORYTELLER_TITLE_NARRATOR_APPROVAL_SCHEMA =
  "storyteller-title-narrator-approval-v1" as const;

export type NarratorProfileMode = "zero-shot" | "adapted";

export interface AudioStudioNarratorVoiceProfile {
  schema: typeof AUDIO_STUDIO_NARRATOR_PROFILE_SCHEMA;
  profileId: string;
  revision: number;
  voiceIdentityId: string;
  engineKey: string;
  mode: NarratorProfileMode;
  modelArtifactTreeSha256: string;
  decisionHash: string;
  holdoutLedgerHash: string;
  finalHoldoutFingerprint: string;
  evidenceHash: string;
  evidence: Readonly<{
    sourceRightsFingerprint: string;
    narratorDatasetFingerprint: string;
    referencePackFingerprint: string;
    benchmarkRunHash: string;
    benchmarkCandidateHash: string;
    textEvidenceHash: string;
    speakerIdentityEvidenceHash: string;
    acousticEvidenceHash: string;
    blindReviewEvidenceHash: string;
    renderEngineLockFingerprint: string;
    trainingEngineLockFingerprint: string | null;
  }>;
  rights: Readonly<{
    commercialSynthesisAuthorized: true;
    sourceRightsFingerprint: string;
  }>;
  quality: Readonly<{
    shortFormTournamentPassed: true;
    continuousHoldoutPassed: true;
    humanListeningApproval: true;
    chapterListeningApprovalRequired: true;
  }>;
  storyteller: Readonly<{
    castingEligible: true;
    castingApproved: false;
    defaultNarrator: false;
    exactRevisionRequired: true;
  }>;
  runtimeDownloadsAllowed: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  profileHash: string;
}

export interface PinnedNarratorVoice {
  profileId: string;
  revision: number;
  profileHash: string;
}

export interface NarratorCastingApproval {
  schemaVersion: typeof STORYTELLER_NARRATOR_CASTING_SCHEMA;
  projectId: string;
  voice: PinnedNarratorVoice;
  voiceIdentityId: string;
  engineKey: string;
  mode: NarratorProfileMode;
  modelArtifactTreeSha256: string;
  sourceRightsFingerprint: string;
  evidenceHash: string;
  approvedBy: string;
  approvedAt: string;
  castingApproved: true;
  exactRevisionRequired: true;
  chapterListeningApprovalRequired: true;
  defaultNarrator: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface ChapterNarratorReviewInput {
  projectId: string;
  chapterId: string;
  casting: NarratorCastingApproval;
  renderFingerprint: string;
  expectedSegmentCount: number;
  renderedSegmentCount: number;
  transcriptErrorCount: number;
  finalWordPresent: boolean;
  clippedSampleCount: number;
  performanceScore: number;
  continuityScore: number;
  listeningEaseScore: number;
  identityStabilityScore: number;
  syntheticArtifactFlags: readonly string[];
  fatigueFlags: readonly string[];
  reviewerIds: readonly string[];
  reviewedAt: string;
}

export interface ChapterNarratorReview {
  schemaVersion: typeof STORYTELLER_CHAPTER_NARRATOR_REVIEW_SCHEMA;
  projectId: string;
  chapterId: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  renderFingerprint: string;
  expectedSegmentCount: number;
  renderedSegmentCount: number;
  transcriptErrorCount: number;
  finalWordPresent: true;
  clippedSampleCount: 0;
  performanceScore: number;
  continuityScore: number;
  listeningEaseScore: number;
  identityStabilityScore: number;
  reviewerCount: number;
  reviewerPanelFingerprint: string;
  syntheticArtifactFlags: readonly [];
  fatigueFlags: readonly [];
  reviewedAt: string;
  chapterApproved: true;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface TitleNarratorApproval {
  schemaVersion: typeof STORYTELLER_TITLE_NARRATOR_APPROVAL_SCHEMA;
  projectId: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  chapterIds: readonly string[];
  chapterReviewFingerprints: readonly string[];
  approvedAt: string;
  titleNarratorApproved: true;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const FORBIDDEN_ALIAS = /^(?:latest|current|default|auto|automatic|newest|production)$/iu;
const MINIMUM_REVIEWERS = 3;
const MINIMUM_CHAPTER_SCORE = 4;

function canonicalAudioStudioValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalAudioStudioValue);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      result[key] = canonicalAudioStudioValue((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

function audioStudioHash(value: unknown): string {
  const serialised = `${JSON.stringify(canonicalAudioStudioValue(value))}\n`;
  return createHash("sha256").update(serialised, "utf8").digest("hex");
}

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value) || FORBIDDEN_ALIAS.test(value)) {
    throw new Error(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) throw new Error(code);
  return value;
}

function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || value.length > 64 || Number.isNaN(Date.parse(value))) {
    throw new Error(code);
  }
  return value;
}

function requireText(value: string, code: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 256 || CONTROL.test(value)) {
    throw new Error(code);
  }
  return value.trim();
}

function requireInteger(value: number, minimum: number, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(code);
  return value;
}

function requireScore(value: number, code: string): number {
  if (!Number.isFinite(value) || value < 1 || value > 5) throw new Error(code);
  return value;
}

function requirePinnedVoice(value: PinnedNarratorVoice): PinnedNarratorVoice {
  return {
    profileId: requireIdentifier(value.profileId, "NARRATOR_PROFILE_ID_INVALID"),
    revision: requireInteger(value.revision, 1, 999_999, "NARRATOR_PROFILE_REVISION_INVALID"),
    profileHash: requireHash(value.profileHash, "NARRATOR_PROFILE_HASH_INVALID"),
  };
}

function castingBase(value: Omit<NarratorCastingApproval, "fingerprint">): Readonly<Record<string, unknown>> {
  return value;
}

function chapterReviewBase(value: Omit<ChapterNarratorReview, "fingerprint">): Readonly<Record<string, unknown>> {
  return value;
}

function titleApprovalBase(value: Omit<TitleNarratorApproval, "fingerprint">): Readonly<Record<string, unknown>> {
  return value;
}

export function assertAudioStudioNarratorVoiceProfile(
  profile: AudioStudioNarratorVoiceProfile,
): void {
  if (profile.schema !== AUDIO_STUDIO_NARRATOR_PROFILE_SCHEMA) {
    throw new Error("NARRATOR_PROFILE_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(profile.profileId, "NARRATOR_PROFILE_ID_INVALID");
  requireInteger(profile.revision, 1, 999_999, "NARRATOR_PROFILE_REVISION_INVALID");
  requireIdentifier(profile.voiceIdentityId, "NARRATOR_PROFILE_VOICE_IDENTITY_INVALID");
  requireIdentifier(profile.engineKey, "NARRATOR_PROFILE_ENGINE_INVALID");
  if (profile.mode !== "zero-shot" && profile.mode !== "adapted") {
    throw new Error("NARRATOR_PROFILE_MODE_INVALID");
  }
  for (const value of [
    profile.modelArtifactTreeSha256,
    profile.decisionHash,
    profile.holdoutLedgerHash,
    profile.finalHoldoutFingerprint,
    profile.evidenceHash,
    profile.evidence.sourceRightsFingerprint,
    profile.evidence.narratorDatasetFingerprint,
    profile.evidence.referencePackFingerprint,
    profile.evidence.benchmarkRunHash,
    profile.evidence.benchmarkCandidateHash,
    profile.evidence.textEvidenceHash,
    profile.evidence.speakerIdentityEvidenceHash,
    profile.evidence.acousticEvidenceHash,
    profile.evidence.blindReviewEvidenceHash,
    profile.evidence.renderEngineLockFingerprint,
    profile.rights.sourceRightsFingerprint,
    profile.profileHash,
  ]) requireHash(value, "NARRATOR_PROFILE_EVIDENCE_HASH_INVALID");
  if (profile.mode === "adapted") {
    if (profile.evidence.trainingEngineLockFingerprint === null) {
      throw new Error("NARRATOR_PROFILE_TRAINING_LOCK_REQUIRED");
    }
    requireHash(profile.evidence.trainingEngineLockFingerprint, "NARRATOR_PROFILE_TRAINING_LOCK_INVALID");
  } else if (profile.evidence.trainingEngineLockFingerprint !== null) {
    throw new Error("NARRATOR_PROFILE_ZERO_SHOT_TRAINING_LOCK_FORBIDDEN");
  }
  if (profile.evidence.sourceRightsFingerprint !== profile.rights.sourceRightsFingerprint) {
    throw new Error("NARRATOR_PROFILE_RIGHTS_BINDING_MISMATCH");
  }
  if (
    profile.rights.commercialSynthesisAuthorized !== true
    || profile.quality.shortFormTournamentPassed !== true
    || profile.quality.continuousHoldoutPassed !== true
    || profile.quality.humanListeningApproval !== true
    || profile.quality.chapterListeningApprovalRequired !== true
  ) {
    throw new Error("NARRATOR_PROFILE_QUALITY_INSUFFICIENT");
  }
  if (
    profile.storyteller.castingEligible !== true
    || profile.storyteller.castingApproved !== false
    || profile.storyteller.defaultNarrator !== false
    || profile.storyteller.exactRevisionRequired !== true
  ) {
    throw new Error("NARRATOR_PROFILE_CASTING_BOUNDARY_INVALID");
  }
  if (
    profile.runtimeDownloadsAllowed !== false
    || profile.titleReleaseAuthority !== false
    || profile.publicationAuthority !== false
  ) {
    throw new Error("NARRATOR_PROFILE_AUTHORITY_INVALID");
  }
  const { profileHash, ...partial } = profile;
  if (audioStudioHash(partial) !== profileHash) {
    throw new Error("NARRATOR_PROFILE_HASH_MISMATCH");
  }
}

export function pinNarratorVoiceProfile(
  profile: AudioStudioNarratorVoiceProfile,
): PinnedNarratorVoice {
  assertAudioStudioNarratorVoiceProfile(profile);
  return Object.freeze({
    profileId: profile.profileId,
    revision: profile.revision,
    profileHash: profile.profileHash,
  });
}

export function assertExactNarratorVoicePin(
  expected: PinnedNarratorVoice,
  actual: PinnedNarratorVoice,
): void {
  const left = requirePinnedVoice(expected);
  const right = requirePinnedVoice(actual);
  if (
    left.profileId !== right.profileId
    || left.revision !== right.revision
    || left.profileHash !== right.profileHash
  ) {
    throw new Error("NARRATOR_PROFILE_PIN_MISMATCH");
  }
}

export function approveNarratorCasting(input: Readonly<{
  projectId: string;
  profile: AudioStudioNarratorVoiceProfile;
  approvedBy: string;
  approvedAt: string;
}>): NarratorCastingApproval {
  assertAudioStudioNarratorVoiceProfile(input.profile);
  const partial: Omit<NarratorCastingApproval, "fingerprint"> = {
    schemaVersion: STORYTELLER_NARRATOR_CASTING_SCHEMA,
    projectId: requireIdentifier(input.projectId, "NARRATOR_CASTING_PROJECT_INVALID"),
    voice: pinNarratorVoiceProfile(input.profile),
    voiceIdentityId: input.profile.voiceIdentityId,
    engineKey: input.profile.engineKey,
    mode: input.profile.mode,
    modelArtifactTreeSha256: input.profile.modelArtifactTreeSha256,
    sourceRightsFingerprint: input.profile.rights.sourceRightsFingerprint,
    evidenceHash: input.profile.evidenceHash,
    approvedBy: requireText(input.approvedBy, "NARRATOR_CASTING_APPROVER_INVALID"),
    approvedAt: requireDate(input.approvedAt, "NARRATOR_CASTING_DATE_INVALID"),
    castingApproved: true,
    exactRevisionRequired: true,
    chapterListeningApprovalRequired: true,
    defaultNarrator: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  return Object.freeze({ ...partial, fingerprint: stableHash(castingBase(partial)) });
}

export function assertNarratorCasting(casting: NarratorCastingApproval): void {
  if (casting.schemaVersion !== STORYTELLER_NARRATOR_CASTING_SCHEMA) {
    throw new Error("NARRATOR_CASTING_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(casting.projectId, "NARRATOR_CASTING_PROJECT_INVALID");
  requirePinnedVoice(casting.voice);
  requireIdentifier(casting.voiceIdentityId, "NARRATOR_CASTING_VOICE_IDENTITY_INVALID");
  requireIdentifier(casting.engineKey, "NARRATOR_CASTING_ENGINE_INVALID");
  if (casting.mode !== "zero-shot" && casting.mode !== "adapted") throw new Error("NARRATOR_CASTING_MODE_INVALID");
  requireHash(casting.modelArtifactTreeSha256, "NARRATOR_CASTING_MODEL_HASH_INVALID");
  requireHash(casting.sourceRightsFingerprint, "NARRATOR_CASTING_RIGHTS_HASH_INVALID");
  requireHash(casting.evidenceHash, "NARRATOR_CASTING_EVIDENCE_HASH_INVALID");
  requireText(casting.approvedBy, "NARRATOR_CASTING_APPROVER_INVALID");
  requireDate(casting.approvedAt, "NARRATOR_CASTING_DATE_INVALID");
  if (
    casting.castingApproved !== true
    || casting.exactRevisionRequired !== true
    || casting.chapterListeningApprovalRequired !== true
    || casting.defaultNarrator !== false
    || casting.titleReleaseAuthority !== false
    || casting.publicationAuthority !== false
  ) throw new Error("NARRATOR_CASTING_AUTHORITY_INVALID");
  const { fingerprint, ...partial } = casting;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(castingBase(partial))) {
    throw new Error("NARRATOR_CASTING_FINGERPRINT_INVALID");
  }
}

export function createChapterNarratorReview(input: ChapterNarratorReviewInput): ChapterNarratorReview {
  assertNarratorCasting(input.casting);
  const projectId = requireIdentifier(input.projectId, "CHAPTER_NARRATOR_PROJECT_INVALID");
  if (projectId !== input.casting.projectId) throw new Error("CHAPTER_NARRATOR_CASTING_PROJECT_MISMATCH");
  const chapterId = requireIdentifier(input.chapterId, "CHAPTER_NARRATOR_CHAPTER_INVALID");
  const renderFingerprint = requireHash(input.renderFingerprint, "CHAPTER_NARRATOR_RENDER_HASH_INVALID");
  const expectedSegmentCount = requireInteger(input.expectedSegmentCount, 1, 100_000, "CHAPTER_NARRATOR_EXPECTED_SEGMENTS_INVALID");
  const renderedSegmentCount = requireInteger(input.renderedSegmentCount, 0, 100_000, "CHAPTER_NARRATOR_RENDERED_SEGMENTS_INVALID");
  if (renderedSegmentCount !== expectedSegmentCount) throw new Error("CHAPTER_NARRATOR_SEGMENT_COUNT_MISMATCH");
  if (requireInteger(input.transcriptErrorCount, 0, 1_000_000, "CHAPTER_NARRATOR_TRANSCRIPT_ERRORS_INVALID") !== 0) {
    throw new Error("CHAPTER_NARRATOR_TRANSCRIPT_ERROR");
  }
  if (input.finalWordPresent !== true) throw new Error("CHAPTER_NARRATOR_FINAL_WORD_MISSING");
  if (requireInteger(input.clippedSampleCount, 0, Number.MAX_SAFE_INTEGER, "CHAPTER_NARRATOR_CLIPPING_INVALID") !== 0) {
    throw new Error("CHAPTER_NARRATOR_CLIPPING_REPORTED");
  }
  const performanceScore = requireScore(input.performanceScore, "CHAPTER_NARRATOR_PERFORMANCE_SCORE_INVALID");
  const continuityScore = requireScore(input.continuityScore, "CHAPTER_NARRATOR_CONTINUITY_SCORE_INVALID");
  const listeningEaseScore = requireScore(input.listeningEaseScore, "CHAPTER_NARRATOR_LISTENING_SCORE_INVALID");
  const identityStabilityScore = requireScore(input.identityStabilityScore, "CHAPTER_NARRATOR_IDENTITY_SCORE_INVALID");
  if (Math.min(performanceScore, continuityScore, listeningEaseScore, identityStabilityScore) < MINIMUM_CHAPTER_SCORE) {
    throw new Error("CHAPTER_NARRATOR_SCORE_BELOW_THRESHOLD");
  }
  if (!Array.isArray(input.syntheticArtifactFlags) || input.syntheticArtifactFlags.length !== 0) {
    throw new Error("CHAPTER_NARRATOR_SYNTHETIC_ARTIFACT_REPORTED");
  }
  if (!Array.isArray(input.fatigueFlags) || input.fatigueFlags.length !== 0) {
    throw new Error("CHAPTER_NARRATOR_FATIGUE_REPORTED");
  }
  if (!Array.isArray(input.reviewerIds)) throw new Error("CHAPTER_NARRATOR_REVIEWERS_INVALID");
  const reviewers = [...new Set(input.reviewerIds.map((value) => requireText(value, "CHAPTER_NARRATOR_REVIEWER_INVALID")))].sort();
  if (reviewers.length < MINIMUM_REVIEWERS) throw new Error("CHAPTER_NARRATOR_REVIEWER_COUNT_INSUFFICIENT");
  const reviewedAt = requireDate(input.reviewedAt, "CHAPTER_NARRATOR_REVIEW_DATE_INVALID");
  const partial: Omit<ChapterNarratorReview, "fingerprint"> = {
    schemaVersion: STORYTELLER_CHAPTER_NARRATOR_REVIEW_SCHEMA,
    projectId,
    chapterId,
    castingFingerprint: input.casting.fingerprint,
    voice: input.casting.voice,
    renderFingerprint,
    expectedSegmentCount,
    renderedSegmentCount,
    transcriptErrorCount: 0,
    finalWordPresent: true,
    clippedSampleCount: 0,
    performanceScore,
    continuityScore,
    listeningEaseScore,
    identityStabilityScore,
    reviewerCount: reviewers.length,
    reviewerPanelFingerprint: stableHash(reviewers),
    syntheticArtifactFlags: [],
    fatigueFlags: [],
    reviewedAt,
    chapterApproved: true,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  return Object.freeze({ ...partial, fingerprint: stableHash(chapterReviewBase(partial)) });
}

export function assertChapterNarratorReview(
  review: ChapterNarratorReview,
  casting: NarratorCastingApproval,
): void {
  assertNarratorCasting(casting);
  if (review.schemaVersion !== STORYTELLER_CHAPTER_NARRATOR_REVIEW_SCHEMA) {
    throw new Error("CHAPTER_NARRATOR_REVIEW_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(review.projectId, "CHAPTER_NARRATOR_PROJECT_INVALID");
  requireIdentifier(review.chapterId, "CHAPTER_NARRATOR_CHAPTER_INVALID");
  if (review.projectId !== casting.projectId || review.castingFingerprint !== casting.fingerprint) {
    throw new Error("CHAPTER_NARRATOR_CASTING_MISMATCH");
  }
  assertExactNarratorVoicePin(casting.voice, review.voice);
  requireHash(review.renderFingerprint, "CHAPTER_NARRATOR_RENDER_HASH_INVALID");
  if (
    review.expectedSegmentCount !== review.renderedSegmentCount
    || review.transcriptErrorCount !== 0
    || review.finalWordPresent !== true
    || review.clippedSampleCount !== 0
    || review.reviewerCount < MINIMUM_REVIEWERS
    || review.syntheticArtifactFlags.length !== 0
    || review.fatigueFlags.length !== 0
    || review.chapterApproved !== true
    || review.titleReleaseAuthority !== false
    || review.publicationAuthority !== false
  ) throw new Error("CHAPTER_NARRATOR_REVIEW_NOT_APPROVED");
  if (Math.min(review.performanceScore, review.continuityScore, review.listeningEaseScore, review.identityStabilityScore) < MINIMUM_CHAPTER_SCORE) {
    throw new Error("CHAPTER_NARRATOR_SCORE_BELOW_THRESHOLD");
  }
  requireHash(review.reviewerPanelFingerprint, "CHAPTER_NARRATOR_REVIEWER_PANEL_INVALID");
  requireDate(review.reviewedAt, "CHAPTER_NARRATOR_REVIEW_DATE_INVALID");
  const { fingerprint, ...partial } = review;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(chapterReviewBase(partial))) {
    throw new Error("CHAPTER_NARRATOR_REVIEW_FINGERPRINT_INVALID");
  }
}

export function approveTitleNarrator(input: Readonly<{
  projectId: string;
  casting: NarratorCastingApproval;
  expectedChapterIds: readonly string[];
  chapterReviews: readonly ChapterNarratorReview[];
  approvedAt: string;
}>): TitleNarratorApproval {
  assertNarratorCasting(input.casting);
  const projectId = requireIdentifier(input.projectId, "TITLE_NARRATOR_PROJECT_INVALID");
  if (projectId !== input.casting.projectId) throw new Error("TITLE_NARRATOR_CASTING_PROJECT_MISMATCH");
  if (!Array.isArray(input.expectedChapterIds) || input.expectedChapterIds.length === 0) {
    throw new Error("TITLE_NARRATOR_CHAPTERS_REQUIRED");
  }
  const expectedChapterIds = input.expectedChapterIds.map((id) => requireIdentifier(id, "TITLE_NARRATOR_CHAPTER_INVALID"));
  if (new Set(expectedChapterIds).size !== expectedChapterIds.length) throw new Error("TITLE_NARRATOR_CHAPTER_DUPLICATE");
  if (!Array.isArray(input.chapterReviews) || input.chapterReviews.length !== expectedChapterIds.length) {
    throw new Error("TITLE_NARRATOR_REVIEW_COUNT_MISMATCH");
  }
  const byChapter = new Map<string, ChapterNarratorReview>();
  for (const review of input.chapterReviews) {
    assertChapterNarratorReview(review, input.casting);
    if (byChapter.has(review.chapterId)) throw new Error("TITLE_NARRATOR_REVIEW_DUPLICATE");
    byChapter.set(review.chapterId, review);
  }
  for (const chapterId of expectedChapterIds) {
    if (!byChapter.has(chapterId)) throw new Error("TITLE_NARRATOR_CHAPTER_UNAPPROVED");
  }
  const chapterReviewFingerprints = expectedChapterIds.map((chapterId) => byChapter.get(chapterId)?.fingerprint ?? "");
  const partial: Omit<TitleNarratorApproval, "fingerprint"> = {
    schemaVersion: STORYTELLER_TITLE_NARRATOR_APPROVAL_SCHEMA,
    projectId,
    castingFingerprint: input.casting.fingerprint,
    voice: input.casting.voice,
    chapterIds: Object.freeze([...expectedChapterIds]),
    chapterReviewFingerprints: Object.freeze(chapterReviewFingerprints),
    approvedAt: requireDate(input.approvedAt, "TITLE_NARRATOR_APPROVAL_DATE_INVALID"),
    titleNarratorApproved: true,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  return Object.freeze({ ...partial, fingerprint: stableHash(titleApprovalBase(partial)) });
}

export function assertTitleNarratorApproval(
  approval: TitleNarratorApproval,
  casting: NarratorCastingApproval,
): void {
  assertNarratorCasting(casting);
  if (approval.schemaVersion !== STORYTELLER_TITLE_NARRATOR_APPROVAL_SCHEMA) throw new Error("TITLE_NARRATOR_SCHEMA_UNSUPPORTED");
  if (approval.projectId !== casting.projectId || approval.castingFingerprint !== casting.fingerprint) {
    throw new Error("TITLE_NARRATOR_CASTING_MISMATCH");
  }
  assertExactNarratorVoicePin(casting.voice, approval.voice);
  if (
    approval.chapterIds.length === 0
    || approval.chapterIds.length !== approval.chapterReviewFingerprints.length
    || new Set(approval.chapterIds).size !== approval.chapterIds.length
    || approval.titleNarratorApproved !== true
    || approval.titleReleaseAuthority !== false
    || approval.publicationAuthority !== false
  ) throw new Error("TITLE_NARRATOR_APPROVAL_INVALID");
  for (const id of approval.chapterIds) requireIdentifier(id, "TITLE_NARRATOR_CHAPTER_INVALID");
  for (const hash of approval.chapterReviewFingerprints) requireHash(hash, "TITLE_NARRATOR_REVIEW_HASH_INVALID");
  requireDate(approval.approvedAt, "TITLE_NARRATOR_APPROVAL_DATE_INVALID");
  const { fingerprint, ...partial } = approval;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(titleApprovalBase(partial))) {
    throw new Error("TITLE_NARRATOR_FINGERPRINT_INVALID");
  }
}
