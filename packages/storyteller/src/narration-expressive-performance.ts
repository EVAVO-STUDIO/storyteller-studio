import {
  stableHash,
  type GenerationJob,
  type PerformanceDirection,
  type ProviderFeature,
} from "./index.js";
import {
  buildSynthesisRequest,
  type CanonicalPronunciation,
  type ProviderAudioFormat,
  type ProviderCapabilitySnapshot,
  type ProviderExecutionMode,
  type SynthesisRequest,
} from "./provider-adapter.js";
import type { PinnedNarratorVoice } from "./narrator-voice-profile.js";
import type { NaturalNarrationProductionPlan } from "./narration-production-policy.js";

export const EXPRESSIVE_VOICE_ROLE_SCHEMA =
  "storyteller-expressive-voice-role-v1" as const;
export const EXPRESSIVE_PERFORMANCE_PLAN_SCHEMA =
  "storyteller-expressive-performance-plan-v1" as const;
export const EXPRESSIVE_PERFORMANCE_OBSERVATION_SCHEMA =
  "storyteller-expressive-performance-observation-v1" as const;
export const EXPRESSIVE_PERFORMANCE_REVIEW_SCHEMA =
  "storyteller-expressive-performance-review-v1" as const;

export const EXPRESSIVE_MINIMUM_CANDIDATES = 3;
export const EXPRESSIVE_MINIMUM_REVIEWERS = 3;

export type ExpressiveVoiceRoleKind = "narrator" | "character";
export type ExpressiveVoiceStrategy =
  | "dedicated-voice"
  | "performance-variation";
export type ExpressiveEmotionTrajectory =
  | "sustained"
  | "rising"
  | "falling"
  | "pivot"
  | "layered";
export type ExpressiveCadenceProfile =
  | "conversational"
  | "intimate"
  | "measured"
  | "urgent"
  | "lyrical"
  | "comic"
  | "formal";

export interface ExpressiveVoiceRoleBinding {
  schemaVersion: typeof EXPRESSIVE_VOICE_ROLE_SCHEMA;
  projectId: string;
  roleId: string;
  roleKind: ExpressiveVoiceRoleKind;
  characterId?: string;
  displayName: string;
  voice: PinnedNarratorVoice;
  voiceIdentityId: string;
  engineKey: string;
  sourceRightsFingerprint: string;
  voiceStrategy: ExpressiveVoiceStrategy;
  performanceAnchorHash: string;
  approvedBy: string;
  approvedAt: string;
  exactRevisionRequired: true;
  preserveIdentityAcrossEmotion: true;
  genericFallbackAllowed: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface ExpressiveCadencePlan {
  profile: ExpressiveCadenceProfile;
  minimumWpm: number;
  targetWpm: number;
  maximumWpm: number;
  phraseLengthVariation: number;
  pauseVariation: number;
  minimumPitchRangeSemitones: number;
  minimumDynamicRangeDb: number;
  maximumCadenceTemplateSimilarity: number;
  maximumSentenceFinalContourRepetitionRatio: number;
}

export interface ExpressiveQualityThresholds {
  minimumNaturalnessScore: 4.25;
  minimumEmotionalTruthScore: 4.25;
  minimumCadenceScore: 4.2;
  minimumRoleFidelityScore: 4.25;
  minimumIdentityStabilityScore: 4.5;
  minimumSustainedListenabilityScore: 4.25;
  maximumSyntheticArtifactFlags: 0;
  maximumGenericDeliveryFlags: 0;
  requireZeroUnexpectedSpeakerChanges: true;
  requireNoFallbackVoice: true;
  requireBlindComparativeReview: true;
  minimumDistinctReviewers: 3;
}

export interface ExpressivePerformancePlan {
  schemaVersion: typeof EXPRESSIVE_PERFORMANCE_PLAN_SCHEMA;
  projectId: string;
  segmentId: string;
  roleBindingFingerprint: string;
  roleId: string;
  roleKind: ExpressiveVoiceRoleKind;
  characterId?: string;
  voice: PinnedNarratorVoice;
  voiceStrategy: ExpressiveVoiceStrategy;
  performanceAnchorHash: string;
  directionFingerprint: string;
  primaryEmotion: string;
  secondaryEmotion?: string;
  emotionalTrajectory: ExpressiveEmotionTrajectory;
  emotionalIntensity: number;
  subtextIntent: string;
  cadence: ExpressiveCadencePlan;
  requiredProviderFeatures: readonly ["style-instructions"];
  minimumCandidateCount: 3;
  preserveVoiceIdentity: true;
  genericFallbackAllowed: false;
  quality: ExpressiveQualityThresholds;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface ExpressivePerformanceScores {
  naturalness: number;
  emotionalTruth: number;
  cadence: number;
  roleFidelity: number;
  identityStability: number;
  sustainedListenability: number;
}

export interface ExpressivePerformanceObservation {
  schemaVersion: typeof EXPRESSIVE_PERFORMANCE_OBSERVATION_SCHEMA;
  projectId: string;
  segmentId: string;
  roleBindingFingerprint: string;
  performancePlanFingerprint: string;
  providerId: string;
  providerCapabilityFingerprint: string;
  voice: PinnedNarratorVoice;
  scores: ExpressivePerformanceScores;
  speakingRateWpm: number;
  pitchRangeSemitones: number;
  dynamicRangeDb: number;
  cadenceTemplateSimilarity: number;
  sentenceFinalContourRepetitionRatio: number;
  unexpectedSpeakerChangeCount: number;
  fallbackVoiceUsed: boolean;
  syntheticArtifactFlags: readonly string[];
  genericDeliveryFlags: readonly string[];
  reviewerIds: readonly string[];
  blindComparativeReview: boolean;
  observedAt: string;
  fingerprint: string;
}

export interface ExpressivePerformanceReview {
  schemaVersion: typeof EXPRESSIVE_PERFORMANCE_REVIEW_SCHEMA;
  projectId: string;
  segmentId: string;
  roleBindingFingerprint: string;
  performancePlanFingerprint: string;
  observationFingerprint: string;
  voice: PinnedNarratorVoice;
  providerId: string;
  findingCodes: readonly string[];
  status: "approved-for-chapter-monitoring" | "requires-regeneration";
  expressivePerformanceApproved: boolean;
  narratorOrCharacterIdentityPreserved: boolean;
  naturalnessGatePassed: boolean;
  emotionalTruthGatePassed: boolean;
  cadenceGatePassed: boolean;
  genericDeliveryRejected: boolean;
  syntheticArtifactsRejected: boolean;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  reviewedAt: string;
  fingerprint: string;
}

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const SAFE_FLAG = /^[A-Z][A-Z0-9._:-]{2,127}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const GENERIC_EMOTIONS = new Set([
  "neutral",
  "natural",
  "normal",
  "generic",
  "default",
  "none",
  "read naturally",
]);
const REQUIRED_PROVIDER_FEATURES = Object.freeze([
  "style-instructions",
] as const);
const QUALITY_THRESHOLDS = Object.freeze({
  minimumNaturalnessScore: 4.25,
  minimumEmotionalTruthScore: 4.25,
  minimumCadenceScore: 4.2,
  minimumRoleFidelityScore: 4.25,
  minimumIdentityStabilityScore: 4.5,
  minimumSustainedListenabilityScore: 4.25,
  maximumSyntheticArtifactFlags: 0,
  maximumGenericDeliveryFlags: 0,
  requireZeroUnexpectedSpeakerChanges: true,
  requireNoFallbackVoice: true,
  requireBlindComparativeReview: true,
  minimumDistinctReviewers: EXPRESSIVE_MINIMUM_REVIEWERS,
} as const satisfies ExpressiveQualityThresholds);

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) throw new Error(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) throw new Error(code);
  return value;
}

function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(code);
  return value;
}

function requireText(value: string, maximum: number, code: string): string {
  if (
    typeof value !== "string"
    || value.trim().length === 0
    || value.length > maximum
    || CONTROL.test(value)
  ) {
    throw new Error(code);
  }
  return value.trim();
}

function requireFinite(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(code);
  }
  return value;
}

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(code);
  }
  return value;
}

function requireScore(value: number, code: string): number {
  return requireFinite(value, 1, 5, code);
}

function requireRatio(value: number, code: string): number {
  return requireFinite(value, 0, 1, code);
}

function requirePinnedVoice(value: PinnedNarratorVoice, code: string): void {
  requireIdentifier(value.profileId, `${code}_PROFILE_ID_INVALID`);
  requireInteger(value.revision, 1, 999_999, `${code}_REVISION_INVALID`);
  requireHash(value.profileHash, `${code}_PROFILE_HASH_INVALID`);
}

function sameVoice(
  left: PinnedNarratorVoice,
  right: PinnedNarratorVoice,
): boolean {
  return left.profileId === right.profileId
    && left.revision === right.revision
    && left.profileHash === right.profileHash;
}

function roleBase(
  value: Omit<ExpressiveVoiceRoleBinding, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function planBase(
  value: Omit<ExpressivePerformancePlan, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function observationBase(
  value: Omit<ExpressivePerformanceObservation, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return {
    ...value,
    scores: { ...value.scores },
    syntheticArtifactFlags: [...value.syntheticArtifactFlags],
    genericDeliveryFlags: [...value.genericDeliveryFlags],
    reviewerIds: [...value.reviewerIds],
  };
}

function reviewBase(
  value: Omit<ExpressivePerformanceReview, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return { ...value, findingCodes: [...value.findingCodes] };
}

function uniqueFlags(values: readonly string[], code: string): readonly string[] {
  if (!Array.isArray(values)) throw new Error(code);
  const output = values.map((value) => {
    if (typeof value !== "string" || !SAFE_FLAG.test(value)) throw new Error(code);
    return value;
  });
  if (new Set(output).size !== output.length) throw new Error(`${code}_DUPLICATE`);
  return Object.freeze([...output].sort((left, right) => left.localeCompare(right, "en-AU")));
}

function uniqueReviewers(values: readonly string[]): readonly string[] {
  if (!Array.isArray(values)) throw new Error("EXPRESSIVE_REVIEWERS_INVALID");
  const output = values.map((value) =>
    requireIdentifier(value, "EXPRESSIVE_REVIEWER_ID_INVALID")
  );
  if (new Set(output).size !== output.length) {
    throw new Error("EXPRESSIVE_REVIEWERS_DUPLICATE");
  }
  return Object.freeze([...output].sort((left, right) => left.localeCompare(right, "en-AU")));
}

function assertCadencePlan(value: ExpressiveCadencePlan): void {
  if (!([
    "conversational",
    "intimate",
    "measured",
    "urgent",
    "lyrical",
    "comic",
    "formal",
  ] as const).includes(value.profile)) {
    throw new Error("EXPRESSIVE_CADENCE_PROFILE_INVALID");
  }
  requireFinite(value.minimumWpm, 40, 320, "EXPRESSIVE_CADENCE_MINIMUM_WPM_INVALID");
  requireFinite(value.targetWpm, 40, 320, "EXPRESSIVE_CADENCE_TARGET_WPM_INVALID");
  requireFinite(value.maximumWpm, 40, 320, "EXPRESSIVE_CADENCE_MAXIMUM_WPM_INVALID");
  if (
    value.minimumWpm > value.targetWpm
    || value.targetWpm > value.maximumWpm
    || value.maximumWpm - value.minimumWpm < 8
  ) {
    throw new Error("EXPRESSIVE_CADENCE_WPM_RANGE_INVALID");
  }
  requireRatio(value.phraseLengthVariation, "EXPRESSIVE_CADENCE_PHRASE_VARIATION_INVALID");
  requireRatio(value.pauseVariation, "EXPRESSIVE_CADENCE_PAUSE_VARIATION_INVALID");
  if (value.phraseLengthVariation < 0.15 || value.pauseVariation < 0.12) {
    throw new Error("EXPRESSIVE_CADENCE_VARIATION_TOO_LOW");
  }
  requireFinite(
    value.minimumPitchRangeSemitones,
    1,
    48,
    "EXPRESSIVE_CADENCE_PITCH_RANGE_INVALID",
  );
  requireFinite(
    value.minimumDynamicRangeDb,
    1,
    36,
    "EXPRESSIVE_CADENCE_DYNAMIC_RANGE_INVALID",
  );
  requireRatio(
    value.maximumCadenceTemplateSimilarity,
    "EXPRESSIVE_CADENCE_TEMPLATE_SIMILARITY_INVALID",
  );
  requireRatio(
    value.maximumSentenceFinalContourRepetitionRatio,
    "EXPRESSIVE_CADENCE_CONTOUR_REPETITION_INVALID",
  );
  if (
    value.maximumCadenceTemplateSimilarity > 0.85
    || value.maximumSentenceFinalContourRepetitionRatio > 0.55
  ) {
    throw new Error("EXPRESSIVE_CADENCE_REPETITION_POLICY_TOO_WEAK");
  }
}

function assertQualityThresholds(value: ExpressiveQualityThresholds): void {
  if (stableHash(value) !== stableHash(QUALITY_THRESHOLDS)) {
    throw new Error("EXPRESSIVE_QUALITY_THRESHOLDS_WEAKENED");
  }
}

export function createExpressiveVoiceRoleBinding(
  input: Omit<
    ExpressiveVoiceRoleBinding,
    | "schemaVersion"
    | "exactRevisionRequired"
    | "preserveIdentityAcrossEmotion"
    | "genericFallbackAllowed"
    | "titleReleaseAuthority"
    | "publicationAuthority"
    | "fingerprint"
  >,
): ExpressiveVoiceRoleBinding {
  requireIdentifier(input.projectId, "EXPRESSIVE_ROLE_PROJECT_ID_INVALID");
  requireIdentifier(input.roleId, "EXPRESSIVE_ROLE_ID_INVALID");
  requireText(input.displayName, 160, "EXPRESSIVE_ROLE_DISPLAY_NAME_INVALID");
  requirePinnedVoice(input.voice, "EXPRESSIVE_ROLE_VOICE");
  requireIdentifier(input.voiceIdentityId, "EXPRESSIVE_ROLE_VOICE_IDENTITY_INVALID");
  requireIdentifier(input.engineKey, "EXPRESSIVE_ROLE_ENGINE_KEY_INVALID");
  requireHash(input.sourceRightsFingerprint, "EXPRESSIVE_ROLE_RIGHTS_HASH_INVALID");
  requireHash(input.performanceAnchorHash, "EXPRESSIVE_ROLE_ANCHOR_HASH_INVALID");
  requireIdentifier(input.approvedBy, "EXPRESSIVE_ROLE_APPROVER_INVALID");
  requireDate(input.approvedAt, "EXPRESSIVE_ROLE_APPROVED_AT_INVALID");
  if (input.roleKind !== "narrator" && input.roleKind !== "character") {
    throw new Error("EXPRESSIVE_ROLE_KIND_INVALID");
  }
  if (
    input.voiceStrategy !== "dedicated-voice"
    && input.voiceStrategy !== "performance-variation"
  ) {
    throw new Error("EXPRESSIVE_ROLE_VOICE_STRATEGY_INVALID");
  }
  if (input.roleKind === "narrator" && input.characterId !== undefined) {
    throw new Error("EXPRESSIVE_NARRATOR_CHARACTER_ID_FORBIDDEN");
  }
  if (input.roleKind === "character") {
    requireIdentifier(input.characterId ?? "", "EXPRESSIVE_CHARACTER_ID_REQUIRED");
  }
  const partial: Omit<ExpressiveVoiceRoleBinding, "fingerprint"> = {
    schemaVersion: EXPRESSIVE_VOICE_ROLE_SCHEMA,
    ...input,
    exactRevisionRequired: true,
    preserveIdentityAcrossEmotion: true,
    genericFallbackAllowed: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  return Object.freeze({
    ...partial,
    voice: Object.freeze({ ...partial.voice }),
    fingerprint: stableHash(roleBase(partial)),
  });
}

export function assertExpressiveVoiceRoleBinding(
  value: ExpressiveVoiceRoleBinding,
): void {
  if (value.schemaVersion !== EXPRESSIVE_VOICE_ROLE_SCHEMA) {
    throw new Error("EXPRESSIVE_ROLE_SCHEMA_UNSUPPORTED");
  }
  const { fingerprint, ...partial } = value;
  const recreated = createExpressiveVoiceRoleBinding(partial);
  if (!HASH.test(fingerprint) || recreated.fingerprint !== fingerprint) {
    throw new Error("EXPRESSIVE_ROLE_FINGERPRINT_INVALID");
  }
  if (
    value.exactRevisionRequired !== true
    || value.preserveIdentityAcrossEmotion !== true
    || value.genericFallbackAllowed !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new Error("EXPRESSIVE_ROLE_AUTHORITY_INVALID");
  }
}

export function assertExpressiveRoleEnsemble(
  bindings: readonly ExpressiveVoiceRoleBinding[],
): void {
  if (!Array.isArray(bindings) || bindings.length === 0 || bindings.length > 512) {
    throw new Error("EXPRESSIVE_ROLE_ENSEMBLE_INVALID");
  }
  for (const binding of bindings) assertExpressiveVoiceRoleBinding(binding);
  const projectId = bindings[0]?.projectId;
  if (bindings.some((binding) => binding.projectId !== projectId)) {
    throw new Error("EXPRESSIVE_ROLE_ENSEMBLE_PROJECT_MISMATCH");
  }
  const roleIds = bindings.map((binding) => binding.roleId);
  if (new Set(roleIds).size !== roleIds.length) {
    throw new Error("EXPRESSIVE_ROLE_ENSEMBLE_ROLE_DUPLICATE");
  }
  const characterIds = bindings
    .filter((binding) => binding.roleKind === "character")
    .map((binding) => binding.characterId!);
  if (new Set(characterIds).size !== characterIds.length) {
    throw new Error("EXPRESSIVE_ROLE_ENSEMBLE_CHARACTER_DUPLICATE");
  }

  const dedicated = bindings.filter((binding) =>
    binding.roleKind === "character" && binding.voiceStrategy === "dedicated-voice"
  );
  const dedicatedVoiceKeys = dedicated.map((binding) =>
    `${binding.voiceIdentityId}:${binding.voice.profileId}:${binding.voice.revision}:${binding.voice.profileHash}`
  );
  if (new Set(dedicatedVoiceKeys).size !== dedicatedVoiceKeys.length) {
    throw new Error("EXPRESSIVE_DEDICATED_CHARACTER_VOICE_COLLAPSE");
  }

  const characterAnchors = bindings
    .filter((binding) => binding.roleKind === "character")
    .map((binding) => binding.performanceAnchorHash);
  if (new Set(characterAnchors).size !== characterAnchors.length) {
    throw new Error("EXPRESSIVE_CHARACTER_PERFORMANCE_ANCHOR_COLLAPSE");
  }
}

export function assertExpressiveRoleContinuity(
  previous: ExpressiveVoiceRoleBinding,
  next: ExpressiveVoiceRoleBinding,
): void {
  assertExpressiveVoiceRoleBinding(previous);
  assertExpressiveVoiceRoleBinding(next);
  if (
    previous.projectId !== next.projectId
    || previous.roleId !== next.roleId
    || previous.roleKind !== next.roleKind
    || previous.characterId !== next.characterId
    || previous.voiceIdentityId !== next.voiceIdentityId
    || previous.engineKey !== next.engineKey
    || previous.voiceStrategy !== next.voiceStrategy
    || previous.performanceAnchorHash !== next.performanceAnchorHash
    || !sameVoice(previous.voice, next.voice)
  ) {
    throw new Error("EXPRESSIVE_ROLE_CONTINUITY_MISMATCH");
  }
}

export function createExpressivePerformancePlan(input: Readonly<{
  role: ExpressiveVoiceRoleBinding;
  direction: PerformanceDirection;
  primaryEmotion: string;
  secondaryEmotion?: string;
  emotionalTrajectory: ExpressiveEmotionTrajectory;
  emotionalIntensity: number;
  subtextIntent: string;
  cadence: ExpressiveCadencePlan;
}>): ExpressivePerformancePlan {
  assertExpressiveVoiceRoleBinding(input.role);
  requireIdentifier(input.direction.segmentId, "EXPRESSIVE_PLAN_SEGMENT_ID_INVALID");
  const primaryEmotion = requireText(
    input.primaryEmotion,
    96,
    "EXPRESSIVE_PRIMARY_EMOTION_INVALID",
  );
  if (GENERIC_EMOTIONS.has(primaryEmotion.toLocaleLowerCase("en-AU"))) {
    throw new Error("EXPRESSIVE_PRIMARY_EMOTION_GENERIC");
  }
  const secondaryEmotion = input.secondaryEmotion === undefined
    ? undefined
    : requireText(
        input.secondaryEmotion,
        96,
        "EXPRESSIVE_SECONDARY_EMOTION_INVALID",
      );
  if (
    secondaryEmotion
    && GENERIC_EMOTIONS.has(secondaryEmotion.toLocaleLowerCase("en-AU"))
  ) {
    throw new Error("EXPRESSIVE_SECONDARY_EMOTION_GENERIC");
  }
  if (!([
    "sustained",
    "rising",
    "falling",
    "pivot",
    "layered",
  ] as const).includes(input.emotionalTrajectory)) {
    throw new Error("EXPRESSIVE_EMOTION_TRAJECTORY_INVALID");
  }
  const emotionalIntensity = requireFinite(
    input.emotionalIntensity,
    0.05,
    1,
    "EXPRESSIVE_EMOTIONAL_INTENSITY_INVALID",
  );
  const subtextIntent = requireText(
    input.subtextIntent,
    1_000,
    "EXPRESSIVE_SUBTEXT_INTENT_INVALID",
  );
  if (subtextIntent.toLocaleLowerCase("en-AU") === "none") {
    throw new Error("EXPRESSIVE_SUBTEXT_INTENT_GENERIC");
  }
  assertCadencePlan(input.cadence);
  const partial: Omit<ExpressivePerformancePlan, "fingerprint"> = {
    schemaVersion: EXPRESSIVE_PERFORMANCE_PLAN_SCHEMA,
    projectId: input.role.projectId,
    segmentId: input.direction.segmentId,
    roleBindingFingerprint: input.role.fingerprint,
    roleId: input.role.roleId,
    roleKind: input.role.roleKind,
    ...(input.role.characterId ? { characterId: input.role.characterId } : {}),
    voice: Object.freeze({ ...input.role.voice }),
    voiceStrategy: input.role.voiceStrategy,
    performanceAnchorHash: input.role.performanceAnchorHash,
    directionFingerprint: stableHash(input.direction),
    primaryEmotion,
    ...(secondaryEmotion ? { secondaryEmotion } : {}),
    emotionalTrajectory: input.emotionalTrajectory,
    emotionalIntensity,
    subtextIntent,
    cadence: Object.freeze({ ...input.cadence }),
    requiredProviderFeatures: REQUIRED_PROVIDER_FEATURES,
    minimumCandidateCount: EXPRESSIVE_MINIMUM_CANDIDATES,
    preserveVoiceIdentity: true,
    genericFallbackAllowed: false,
    quality: QUALITY_THRESHOLDS,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(planBase(partial)),
  });
}

export function assertExpressivePerformancePlan(
  plan: ExpressivePerformancePlan,
  role: ExpressiveVoiceRoleBinding,
  direction?: PerformanceDirection,
): void {
  if (plan.schemaVersion !== EXPRESSIVE_PERFORMANCE_PLAN_SCHEMA) {
    throw new Error("EXPRESSIVE_PLAN_SCHEMA_UNSUPPORTED");
  }
  assertExpressiveVoiceRoleBinding(role);
  requireHash(plan.roleBindingFingerprint, "EXPRESSIVE_PLAN_ROLE_HASH_INVALID");
  requireHash(plan.performanceAnchorHash, "EXPRESSIVE_PLAN_ANCHOR_HASH_INVALID");
  requireHash(plan.directionFingerprint, "EXPRESSIVE_PLAN_DIRECTION_HASH_INVALID");
  requirePinnedVoice(plan.voice, "EXPRESSIVE_PLAN_VOICE");
  assertCadencePlan(plan.cadence);
  assertQualityThresholds(plan.quality);
  if (
    plan.projectId !== role.projectId
    || plan.roleBindingFingerprint !== role.fingerprint
    || plan.roleId !== role.roleId
    || plan.roleKind !== role.roleKind
    || plan.characterId !== role.characterId
    || plan.voiceStrategy !== role.voiceStrategy
    || plan.performanceAnchorHash !== role.performanceAnchorHash
    || !sameVoice(plan.voice, role.voice)
  ) {
    throw new Error("EXPRESSIVE_PLAN_ROLE_BINDING_MISMATCH");
  }
  if (direction) {
    if (
      plan.segmentId !== direction.segmentId
      || plan.directionFingerprint !== stableHash(direction)
    ) {
      throw new Error("EXPRESSIVE_PLAN_DIRECTION_MISMATCH");
    }
  }
  if (
    plan.minimumCandidateCount !== EXPRESSIVE_MINIMUM_CANDIDATES
    || plan.requiredProviderFeatures.length !== 1
    || plan.requiredProviderFeatures[0] !== "style-instructions"
    || plan.preserveVoiceIdentity !== true
    || plan.genericFallbackAllowed !== false
    || plan.titleReleaseAuthority !== false
    || plan.publicationAuthority !== false
  ) {
    throw new Error("EXPRESSIVE_PLAN_POLICY_INVALID");
  }
  const { fingerprint, ...partial } = plan;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(planBase(partial))) {
    throw new Error("EXPRESSIVE_PLAN_FINGERPRINT_INVALID");
  }
}

export function assertProviderSupportsExpressivePerformance(
  snapshot: ProviderCapabilitySnapshot,
  requiredCharacters = 1,
): void {
  requireIdentifier(snapshot.providerId, "EXPRESSIVE_PROVIDER_ID_INVALID");
  requireHash(snapshot.fingerprint, "EXPRESSIVE_PROVIDER_CAPABILITY_HASH_INVALID");
  requireInteger(
    requiredCharacters,
    1,
    Number.MAX_SAFE_INTEGER,
    "EXPRESSIVE_PROVIDER_REQUIRED_CHARACTERS_INVALID",
  );
  if (snapshot.maximumInputCharacters < requiredCharacters) {
    throw new Error("EXPRESSIVE_PROVIDER_INPUT_CAPACITY_INSUFFICIENT");
  }
  for (const feature of REQUIRED_PROVIDER_FEATURES) {
    if (!snapshot.features.includes(feature as ProviderFeature)) {
      throw new Error(`EXPRESSIVE_PROVIDER_FEATURE_REQUIRED:${feature}`);
    }
  }
}

export function expressivePerformanceRequestMetadata(
  plan: ExpressivePerformancePlan,
  role: ExpressiveVoiceRoleBinding,
): Readonly<Record<string, string>> {
  assertExpressivePerformancePlan(plan, role);
  const styleInstruction = [
    `Perform as ${role.displayName} (${role.roleKind}).`,
    `Primary emotion: ${plan.primaryEmotion}`,
    plan.secondaryEmotion ? `with ${plan.secondaryEmotion} underneath` : "",
    `trajectory: ${plan.emotionalTrajectory}`,
    `intensity ${plan.emotionalIntensity.toFixed(2)}.`,
    `Subtext: ${plan.subtextIntent}.`,
    `Cadence: ${plan.cadence.profile}, target ${plan.cadence.targetWpm} WPM`,
    "with varied phrase lengths and pauses.",
    "Preserve the exact approved voice identity and performance anchor.",
    "Do not substitute a generic/default voice or flatten the emotional intent.",
  ].filter(Boolean).join(" ");

  return Object.freeze({
    expressivePerformanceRequired: "true",
    expressivePerformancePlanFingerprint: plan.fingerprint,
    expressiveRoleBindingFingerprint: role.fingerprint,
    expressiveRoleId: role.roleId,
    expressiveRoleKind: role.roleKind,
    ...(role.characterId ? { expressiveCharacterId: role.characterId } : {}),
    expressiveVoiceStrategy: role.voiceStrategy,
    expressiveEngineKey: role.engineKey,
    expressiveVoiceProfileHash: role.voice.profileHash,
    expressivePerformanceAnchorHash: role.performanceAnchorHash,
    expressivePrimaryEmotion: plan.primaryEmotion,
    ...(plan.secondaryEmotion
      ? { expressiveSecondaryEmotion: plan.secondaryEmotion }
      : {}),
    expressiveEmotionTrajectory: plan.emotionalTrajectory,
    expressiveEmotionalIntensity: plan.emotionalIntensity.toFixed(3),
    expressiveSubtextIntent: plan.subtextIntent,
    expressiveCadenceProfile: plan.cadence.profile,
    expressiveMinimumWpm: String(plan.cadence.minimumWpm),
    expressiveTargetWpm: String(plan.cadence.targetWpm),
    expressiveMaximumWpm: String(plan.cadence.maximumWpm),
    expressivePhraseVariation: plan.cadence.phraseLengthVariation.toFixed(3),
    expressivePauseVariation: plan.cadence.pauseVariation.toFixed(3),
    expressiveMinimumPitchRangeSemitones:
      plan.cadence.minimumPitchRangeSemitones.toFixed(3),
    expressiveMinimumDynamicRangeDb:
      plan.cadence.minimumDynamicRangeDb.toFixed(3),
    expressiveMaximumCadenceTemplateSimilarity:
      plan.cadence.maximumCadenceTemplateSimilarity.toFixed(3),
    expressiveMaximumContourRepetitionRatio:
      plan.cadence.maximumSentenceFinalContourRepetitionRatio.toFixed(3),
    expressiveGenericFallbackAllowed: "false",
    expressivePreserveVoiceIdentity: "true",
    expressiveBlindComparativeReviewRequired: "true",
    expressiveStyleInstruction: styleInstruction,
  });
}

export function buildExpressiveSynthesisRequest(input: Readonly<{
  job: GenerationJob;
  text: string;
  immutableSourceHash: string;
  role: ExpressiveVoiceRoleBinding;
  direction: PerformanceDirection;
  plan: ExpressivePerformancePlan;
  pronunciations?: readonly CanonicalPronunciation[];
  mode: ProviderExecutionMode;
  format?: ProviderAudioFormat;
  sampleRateHz?: number;
  candidateIndex: number;
  naturalNarration?: NaturalNarrationProductionPlan;
}>): SynthesisRequest {
  assertExpressivePerformancePlan(input.plan, input.role, input.direction);
  if (input.job.projectId !== input.role.projectId) {
    throw new Error("EXPRESSIVE_REQUEST_PROJECT_MISMATCH");
  }
  if (input.job.segmentId !== input.plan.segmentId) {
    throw new Error("EXPRESSIVE_REQUEST_SEGMENT_MISMATCH");
  }
  if (input.job.candidateCount < EXPRESSIVE_MINIMUM_CANDIDATES) {
    throw new Error("EXPRESSIVE_REQUEST_CANDIDATE_COUNT_INSUFFICIENT");
  }
  const base = buildSynthesisRequest({
    job: input.job,
    text: input.text,
    immutableSourceHash: input.immutableSourceHash,
    voiceProfileId: input.role.voice.profileId,
    voiceRevision: input.role.voice.revision,
    voiceProfileHash: input.role.voice.profileHash,
    direction: input.direction,
    ...(input.pronunciations ? { pronunciations: input.pronunciations } : {}),
    mode: input.mode,
    ...(input.format ? { format: input.format } : {}),
    ...(input.sampleRateHz ? { sampleRateHz: input.sampleRateHz } : {}),
    candidateIndex: input.candidateIndex,
    ...(input.naturalNarration
      ? { naturalNarration: input.naturalNarration }
      : {}),
  });
  const metadata = Object.freeze({
    ...base.metadata,
    ...expressivePerformanceRequestMetadata(input.plan, input.role),
  });
  const idempotencyKey = stableHash({
    baseIdempotencyKey: base.idempotencyKey,
    expressivePerformancePlanFingerprint: input.plan.fingerprint,
    expressiveRoleBindingFingerprint: input.role.fingerprint,
    expressiveMetadata: metadata,
  });
  return Object.freeze({
    ...base,
    requestId: `request_${idempotencyKey.slice(0, 24)}`,
    idempotencyKey,
    metadata,
  });
}

export function createExpressivePerformanceObservation(
  input: Omit<
    ExpressivePerformanceObservation,
    "schemaVersion" | "fingerprint"
  >,
): ExpressivePerformanceObservation {
  requireIdentifier(input.projectId, "EXPRESSIVE_OBSERVATION_PROJECT_ID_INVALID");
  requireIdentifier(input.segmentId, "EXPRESSIVE_OBSERVATION_SEGMENT_ID_INVALID");
  requireHash(
    input.roleBindingFingerprint,
    "EXPRESSIVE_OBSERVATION_ROLE_HASH_INVALID",
  );
  requireHash(
    input.performancePlanFingerprint,
    "EXPRESSIVE_OBSERVATION_PLAN_HASH_INVALID",
  );
  requireIdentifier(input.providerId, "EXPRESSIVE_OBSERVATION_PROVIDER_ID_INVALID");
  requireHash(
    input.providerCapabilityFingerprint,
    "EXPRESSIVE_OBSERVATION_PROVIDER_CAPABILITY_HASH_INVALID",
  );
  requirePinnedVoice(input.voice, "EXPRESSIVE_OBSERVATION_VOICE");
  const scores: ExpressivePerformanceScores = {
    naturalness: requireScore(
      input.scores.naturalness,
      "EXPRESSIVE_OBSERVATION_NATURALNESS_SCORE_INVALID",
    ),
    emotionalTruth: requireScore(
      input.scores.emotionalTruth,
      "EXPRESSIVE_OBSERVATION_EMOTIONAL_TRUTH_SCORE_INVALID",
    ),
    cadence: requireScore(
      input.scores.cadence,
      "EXPRESSIVE_OBSERVATION_CADENCE_SCORE_INVALID",
    ),
    roleFidelity: requireScore(
      input.scores.roleFidelity,
      "EXPRESSIVE_OBSERVATION_ROLE_FIDELITY_SCORE_INVALID",
    ),
    identityStability: requireScore(
      input.scores.identityStability,
      "EXPRESSIVE_OBSERVATION_IDENTITY_SCORE_INVALID",
    ),
    sustainedListenability: requireScore(
      input.scores.sustainedListenability,
      "EXPRESSIVE_OBSERVATION_LISTENABILITY_SCORE_INVALID",
    ),
  };
  requireFinite(input.speakingRateWpm, 20, 500, "EXPRESSIVE_OBSERVATION_WPM_INVALID");
  requireFinite(input.pitchRangeSemitones, 0, 96, "EXPRESSIVE_OBSERVATION_PITCH_RANGE_INVALID");
  requireFinite(input.dynamicRangeDb, 0, 72, "EXPRESSIVE_OBSERVATION_DYNAMIC_RANGE_INVALID");
  requireRatio(input.cadenceTemplateSimilarity, "EXPRESSIVE_OBSERVATION_CADENCE_SIMILARITY_INVALID");
  requireRatio(input.sentenceFinalContourRepetitionRatio, "EXPRESSIVE_OBSERVATION_CONTOUR_REPETITION_INVALID");
  requireInteger(input.unexpectedSpeakerChangeCount, 0, 100_000, "EXPRESSIVE_OBSERVATION_SPEAKER_CHANGE_COUNT_INVALID");
  if (typeof input.fallbackVoiceUsed !== "boolean") {
    throw new Error("EXPRESSIVE_OBSERVATION_FALLBACK_FLAG_INVALID");
  }
  const syntheticArtifactFlags = uniqueFlags(
    input.syntheticArtifactFlags,
    "EXPRESSIVE_OBSERVATION_SYNTHETIC_FLAGS_INVALID",
  );
  const genericDeliveryFlags = uniqueFlags(
    input.genericDeliveryFlags,
    "EXPRESSIVE_OBSERVATION_GENERIC_FLAGS_INVALID",
  );
  const reviewerIds = uniqueReviewers(input.reviewerIds);
  if (typeof input.blindComparativeReview !== "boolean") {
    throw new Error("EXPRESSIVE_OBSERVATION_BLIND_REVIEW_FLAG_INVALID");
  }
  requireDate(input.observedAt, "EXPRESSIVE_OBSERVATION_DATE_INVALID");
  const partial: Omit<ExpressivePerformanceObservation, "fingerprint"> = {
    schemaVersion: EXPRESSIVE_PERFORMANCE_OBSERVATION_SCHEMA,
    ...input,
    voice: Object.freeze({ ...input.voice }),
    scores: Object.freeze(scores),
    syntheticArtifactFlags,
    genericDeliveryFlags,
    reviewerIds,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(observationBase(partial)),
  });
}

export function assertExpressivePerformanceObservation(
  value: ExpressivePerformanceObservation,
): void {
  if (value.schemaVersion !== EXPRESSIVE_PERFORMANCE_OBSERVATION_SCHEMA) {
    throw new Error("EXPRESSIVE_OBSERVATION_SCHEMA_UNSUPPORTED");
  }
  const { fingerprint, ...partial } = value;
  const recreated = createExpressivePerformanceObservation(partial);
  if (!HASH.test(fingerprint) || recreated.fingerprint !== fingerprint) {
    throw new Error("EXPRESSIVE_OBSERVATION_FINGERPRINT_INVALID");
  }
}

export function reviewExpressivePerformance(input: Readonly<{
  plan: ExpressivePerformancePlan;
  role: ExpressiveVoiceRoleBinding;
  observation: ExpressivePerformanceObservation;
  reviewedAt?: Date;
}>): ExpressivePerformanceReview {
  assertExpressivePerformancePlan(input.plan, input.role);
  assertExpressivePerformanceObservation(input.observation);
  const observation = input.observation;
  if (
    observation.projectId !== input.plan.projectId
    || observation.segmentId !== input.plan.segmentId
    || observation.roleBindingFingerprint !== input.role.fingerprint
    || observation.performancePlanFingerprint !== input.plan.fingerprint
  ) {
    throw new Error("EXPRESSIVE_REVIEW_SCOPE_MISMATCH");
  }
  if (!sameVoice(observation.voice, input.role.voice)) {
    throw new Error("EXPRESSIVE_REVIEW_VOICE_IDENTITY_MISMATCH");
  }

  const findings: string[] = [];
  const q = input.plan.quality;
  if (observation.scores.naturalness < q.minimumNaturalnessScore) {
    findings.push("EXPRESSIVE_NATURALNESS_BELOW_THRESHOLD");
  }
  if (observation.scores.emotionalTruth < q.minimumEmotionalTruthScore) {
    findings.push("EXPRESSIVE_EMOTIONAL_TRUTH_BELOW_THRESHOLD");
  }
  if (observation.scores.cadence < q.minimumCadenceScore) {
    findings.push("EXPRESSIVE_CADENCE_SCORE_BELOW_THRESHOLD");
  }
  if (observation.scores.roleFidelity < q.minimumRoleFidelityScore) {
    findings.push("EXPRESSIVE_ROLE_FIDELITY_BELOW_THRESHOLD");
  }
  if (observation.scores.identityStability < q.minimumIdentityStabilityScore) {
    findings.push("EXPRESSIVE_IDENTITY_STABILITY_BELOW_THRESHOLD");
  }
  if (observation.scores.sustainedListenability < q.minimumSustainedListenabilityScore) {
    findings.push("EXPRESSIVE_LISTENABILITY_BELOW_THRESHOLD");
  }
  if (
    observation.speakingRateWpm < input.plan.cadence.minimumWpm
    || observation.speakingRateWpm > input.plan.cadence.maximumWpm
  ) {
    findings.push("EXPRESSIVE_SPEAKING_RATE_OUTSIDE_PLAN");
  }
  if (observation.pitchRangeSemitones < input.plan.cadence.minimumPitchRangeSemitones) {
    findings.push("EXPRESSIVE_PITCH_VARIATION_TOO_LOW");
  }
  if (observation.dynamicRangeDb < input.plan.cadence.minimumDynamicRangeDb) {
    findings.push("EXPRESSIVE_DYNAMIC_RANGE_TOO_LOW");
  }
  if (observation.cadenceTemplateSimilarity > input.plan.cadence.maximumCadenceTemplateSimilarity) {
    findings.push("EXPRESSIVE_CADENCE_TEMPLATE_REPETITIVE");
  }
  if (
    observation.sentenceFinalContourRepetitionRatio
      > input.plan.cadence.maximumSentenceFinalContourRepetitionRatio
  ) {
    findings.push("EXPRESSIVE_SENTENCE_FINAL_CONTOUR_REPETITIVE");
  }
  if (observation.unexpectedSpeakerChangeCount > 0) {
    findings.push("EXPRESSIVE_UNEXPECTED_SPEAKER_CHANGE");
  }
  if (observation.fallbackVoiceUsed) {
    findings.push("EXPRESSIVE_GENERIC_OR_FALLBACK_VOICE_USED");
  }
  if (observation.syntheticArtifactFlags.length > 0) {
    findings.push("EXPRESSIVE_SYNTHETIC_ARTIFACTS_DETECTED");
  }
  if (observation.genericDeliveryFlags.length > 0) {
    findings.push("EXPRESSIVE_GENERIC_DELIVERY_DETECTED");
  }
  if (!observation.blindComparativeReview || observation.reviewerIds.length < q.minimumDistinctReviewers) {
    findings.push("EXPRESSIVE_BLIND_REVIEW_INSUFFICIENT");
  }

  const findingCodes = Object.freeze(
    [...new Set(findings)].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
  const expressivePerformanceApproved = findingCodes.length === 0;
  const reviewedAt = (input.reviewedAt ?? new Date()).toISOString();
  const partial: Omit<ExpressivePerformanceReview, "fingerprint"> = {
    schemaVersion: EXPRESSIVE_PERFORMANCE_REVIEW_SCHEMA,
    projectId: input.plan.projectId,
    segmentId: input.plan.segmentId,
    roleBindingFingerprint: input.role.fingerprint,
    performancePlanFingerprint: input.plan.fingerprint,
    observationFingerprint: observation.fingerprint,
    voice: Object.freeze({ ...input.role.voice }),
    providerId: observation.providerId,
    findingCodes,
    status: expressivePerformanceApproved
      ? "approved-for-chapter-monitoring"
      : "requires-regeneration",
    expressivePerformanceApproved,
    narratorOrCharacterIdentityPreserved: sameVoice(observation.voice, input.role.voice),
    naturalnessGatePassed: observation.scores.naturalness >= q.minimumNaturalnessScore,
    emotionalTruthGatePassed: observation.scores.emotionalTruth >= q.minimumEmotionalTruthScore,
    cadenceGatePassed:
      observation.scores.cadence >= q.minimumCadenceScore
      && observation.speakingRateWpm >= input.plan.cadence.minimumWpm
      && observation.speakingRateWpm <= input.plan.cadence.maximumWpm
      && observation.pitchRangeSemitones >= input.plan.cadence.minimumPitchRangeSemitones
      && observation.dynamicRangeDb >= input.plan.cadence.minimumDynamicRangeDb
      && observation.cadenceTemplateSimilarity <= input.plan.cadence.maximumCadenceTemplateSimilarity
      && observation.sentenceFinalContourRepetitionRatio <= input.plan.cadence.maximumSentenceFinalContourRepetitionRatio,
    genericDeliveryRejected:
      !observation.fallbackVoiceUsed && observation.genericDeliveryFlags.length === 0,
    syntheticArtifactsRejected: observation.syntheticArtifactFlags.length === 0,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    reviewedAt,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(reviewBase(partial)),
  });
}

export function assertExpressivePerformanceReview(
  value: ExpressivePerformanceReview,
  input: Readonly<{
    plan: ExpressivePerformancePlan;
    role: ExpressiveVoiceRoleBinding;
    observation: ExpressivePerformanceObservation;
  }>,
): void {
  const recreated = reviewExpressivePerformance({
    ...input,
    reviewedAt: new Date(value.reviewedAt),
  });
  if (
    value.schemaVersion !== EXPRESSIVE_PERFORMANCE_REVIEW_SCHEMA
    || value.fingerprint !== recreated.fingerprint
    || value.status !== recreated.status
    || value.expressivePerformanceApproved !== recreated.expressivePerformanceApproved
  ) {
    throw new Error("EXPRESSIVE_REVIEW_FINGERPRINT_INVALID");
  }
  if (value.titleReleaseAuthority !== false || value.publicationAuthority !== false) {
    throw new Error("EXPRESSIVE_REVIEW_AUTHORITY_INVALID");
  }
}
