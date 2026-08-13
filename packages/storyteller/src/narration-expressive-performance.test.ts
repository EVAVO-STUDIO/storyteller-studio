import assert from "node:assert/strict";
import test from "node:test";
import { stableHash, type GenerationJob, type PerformanceDirection } from "./index.js";
import { createCapabilitySnapshot } from "./provider-adapter.js";
import {
  assertExpressivePerformancePlan,
  assertExpressivePerformanceReview,
  assertExpressiveRoleContinuity,
  assertExpressiveRoleEnsemble,
  assertProviderSupportsExpressivePerformance,
  buildExpressiveSynthesisRequest,
  createExpressivePerformanceObservation,
  createExpressivePerformancePlan,
  createExpressiveVoiceRoleBinding,
  expressivePerformanceRequestMetadata,
  reviewExpressivePerformance,
  type ExpressiveCadencePlan,
  type ExpressivePerformanceObservation,
  type ExpressiveVoiceRoleBinding,
} from "./narration-expressive-performance.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);
const HASH_E = "e".repeat(64);

function role(input: Partial<{
  projectId: string;
  roleId: string;
  roleKind: "narrator" | "character";
  characterId: string;
  displayName: string;
  profileId: string;
  voiceRevision: number;
  profileHash: string;
  voiceIdentityId: string;
  engineKey: string;
  voiceStrategy: "dedicated-voice" | "performance-variation";
  performanceAnchorHash: string;
}> = {}): ExpressiveVoiceRoleBinding {
  const roleKind = input.roleKind ?? "narrator";
  return createExpressiveVoiceRoleBinding({
    projectId: input.projectId ?? "project_expressive",
    roleId: input.roleId ?? "role_narrator",
    roleKind,
    ...(roleKind === "character"
      ? { characterId: input.characterId ?? "character_ada" }
      : {}),
    displayName: input.displayName ?? (roleKind === "character" ? "Ada" : "Narrator"),
    voice: {
      profileId: input.profileId ?? "voice_narrator",
      revision: input.voiceRevision ?? 7,
      profileHash: input.profileHash ?? HASH_A,
    },
    voiceIdentityId: input.voiceIdentityId ?? "identity_narrator",
    engineKey: input.engineKey ?? "audio_studio_engine",
    sourceRightsFingerprint: HASH_B,
    voiceStrategy: input.voiceStrategy ?? "dedicated-voice",
    performanceAnchorHash: input.performanceAnchorHash ?? HASH_C,
    approvedBy: "casting_director",
    approvedAt: "2026-08-13T01:00:00.000Z",
  });
}

const direction: PerformanceDirection = Object.freeze({
  segmentId: "segment_dialogue_001",
  narrativeDistance: "intimate",
  pace: 0.72,
  intensity: 0.74,
  warmth: 0.58,
  restraint: 0.52,
  clarity: 0.93,
  pauseBeforeMs: 180,
  pauseAfterMs: 260,
  emotionalObjective: "Let the fear remain controlled until the final admission breaks through.",
  subtext: "She needs the listener to believe she is calm while deciding whether to confess.",
  notes: Object.freeze(["Keep the first clause contained; allow the last phrase to land without melodrama."]),
});

const cadence: ExpressiveCadencePlan = Object.freeze({
  profile: "intimate",
  minimumWpm: 118,
  targetWpm: 142,
  maximumWpm: 166,
  phraseLengthVariation: 0.46,
  pauseVariation: 0.38,
  minimumPitchRangeSemitones: 4.5,
  minimumDynamicRangeDb: 5.5,
  maximumCadenceTemplateSimilarity: 0.72,
  maximumSentenceFinalContourRepetitionRatio: 0.35,
});

function plan(binding = role()) {
  return createExpressivePerformancePlan({
    role: binding,
    direction,
    primaryEmotion: "contained fear",
    secondaryEmotion: "reluctant trust",
    emotionalTrajectory: "pivot",
    emotionalIntensity: 0.72,
    subtextIntent: "Hold back the confession until the final phrase, then let the need for help become audible.",
    cadence,
  });
}

function observation(
  binding: ExpressiveVoiceRoleBinding,
  performance = plan(binding),
  overrides: Partial<Omit<ExpressivePerformanceObservation, "schemaVersion" | "fingerprint">> = {},
) {
  return createExpressivePerformanceObservation({
    projectId: binding.projectId,
    segmentId: performance.segmentId,
    roleBindingFingerprint: binding.fingerprint,
    performancePlanFingerprint: performance.fingerprint,
    providerId: "audio-studio-local",
    providerCapabilityFingerprint: HASH_D,
    voice: { ...binding.voice },
    scores: {
      naturalness: 4.8,
      emotionalTruth: 4.75,
      cadence: 4.7,
      roleFidelity: 4.8,
      identityStability: 4.9,
      sustainedListenability: 4.75,
    },
    speakingRateWpm: 143,
    pitchRangeSemitones: 7.2,
    dynamicRangeDb: 8.4,
    cadenceTemplateSimilarity: 0.48,
    sentenceFinalContourRepetitionRatio: 0.18,
    unexpectedSpeakerChangeCount: 0,
    fallbackVoiceUsed: false,
    syntheticArtifactFlags: [],
    genericDeliveryFlags: [],
    reviewerIds: ["reviewer_a", "reviewer_b", "reviewer_c"],
    blindComparativeReview: true,
    observedAt: "2026-08-13T02:00:00.000Z",
    ...overrides,
  });
}

test("expressive narrator performance requires specific emotion, cadence and fail-closed quality gates", () => {
  const binding = role();
  const performance = plan(binding);
  assertExpressivePerformancePlan(performance, binding, direction);
  assert.equal(performance.genericFallbackAllowed, false);
  assert.equal(performance.preserveVoiceIdentity, true);
  assert.equal(performance.minimumCandidateCount, 3);
  assert.deepEqual(performance.requiredProviderFeatures, ["style-instructions"]);
  assert.equal(performance.quality.minimumNaturalnessScore, 4.25);
  assert.equal(performance.quality.minimumEmotionalTruthScore, 4.25);
  assert.equal(performance.quality.minimumIdentityStabilityScore, 4.5);
  assert.equal(performance.titleReleaseAuthority, false);
  assert.equal(performance.publicationAuthority, false);
});

test("dedicated character roles must not collapse onto the same exact voice identity", () => {
  const narrator = role();
  const ada = role({
    roleId: "role_ada",
    roleKind: "character",
    characterId: "character_ada",
    displayName: "Ada",
    profileId: "voice_ada",
    profileHash: HASH_D,
    voiceIdentityId: "identity_ada",
    performanceAnchorHash: HASH_D,
  });
  const malik = role({
    roleId: "role_malik",
    roleKind: "character",
    characterId: "character_malik",
    displayName: "Malik",
    profileId: "voice_malik",
    profileHash: HASH_E,
    voiceIdentityId: "identity_malik",
    performanceAnchorHash: HASH_E,
  });
  assert.doesNotThrow(() => assertExpressiveRoleEnsemble([narrator, ada, malik]));

  const collapsed = role({
    roleId: "role_malik",
    roleKind: "character",
    characterId: "character_malik",
    displayName: "Malik",
    profileId: "voice_ada",
    profileHash: HASH_D,
    voiceIdentityId: "identity_ada",
    performanceAnchorHash: HASH_E,
  });
  assert.throws(
    () => assertExpressiveRoleEnsemble([narrator, ada, collapsed]),
    /EXPRESSIVE_DEDICATED_CHARACTER_VOICE_COLLAPSE/u,
  );
});

test("performance-variation characters may share a base narrator voice but require distinct performance anchors", () => {
  const narrator = role({ voiceStrategy: "performance-variation" });
  const child = role({
    roleId: "role_child",
    roleKind: "character",
    characterId: "character_child",
    displayName: "The Child",
    voiceStrategy: "performance-variation",
    performanceAnchorHash: HASH_D,
  });
  const captain = role({
    roleId: "role_captain",
    roleKind: "character",
    characterId: "character_captain",
    displayName: "Captain Vale",
    voiceStrategy: "performance-variation",
    performanceAnchorHash: HASH_E,
  });
  assert.doesNotThrow(() => assertExpressiveRoleEnsemble([narrator, child, captain]));

  const collapsedAnchor = role({
    roleId: "role_captain",
    roleKind: "character",
    characterId: "character_captain",
    displayName: "Captain Vale",
    voiceStrategy: "performance-variation",
    performanceAnchorHash: HASH_D,
  });
  assert.throws(
    () => assertExpressiveRoleEnsemble([narrator, child, collapsedAnchor]),
    /EXPRESSIVE_CHARACTER_PERFORMANCE_ANCHOR_COLLAPSE/u,
  );
});

test("emotion may change scene to scene while the character voice identity remains exact", () => {
  const binding = role({
    roleId: "role_ada",
    roleKind: "character",
    characterId: "character_ada",
    displayName: "Ada",
    profileId: "voice_ada",
    profileHash: HASH_D,
    voiceIdentityId: "identity_ada",
    performanceAnchorHash: HASH_D,
  });
  const laterBinding = createExpressiveVoiceRoleBinding({
    projectId: binding.projectId,
    roleId: binding.roleId,
    roleKind: binding.roleKind,
    characterId: binding.characterId,
    displayName: binding.displayName,
    voice: binding.voice,
    voiceIdentityId: binding.voiceIdentityId,
    engineKey: binding.engineKey,
    sourceRightsFingerprint: binding.sourceRightsFingerprint,
    voiceStrategy: binding.voiceStrategy,
    performanceAnchorHash: binding.performanceAnchorHash,
    approvedBy: "casting_director_second_review",
    approvedAt: "2026-08-13T03:00:00.000Z",
  });
  assert.doesNotThrow(() => assertExpressiveRoleContinuity(binding, laterBinding));

  const swapped = role({
    roleId: "role_ada",
    roleKind: "character",
    characterId: "character_ada",
    displayName: "Ada",
    profileId: "voice_other",
    profileHash: HASH_E,
    voiceIdentityId: "identity_ada",
    performanceAnchorHash: HASH_D,
  });
  assert.throws(
    () => assertExpressiveRoleContinuity(binding, swapped),
    /EXPRESSIVE_ROLE_CONTINUITY_MISMATCH/u,
  );
});

test("generic emotion labels and flat cadence policies are rejected before synthesis", () => {
  const binding = role();
  assert.throws(
    () => createExpressivePerformancePlan({
      role: binding,
      direction,
      primaryEmotion: "neutral",
      emotionalTrajectory: "sustained",
      emotionalIntensity: 0.5,
      subtextIntent: "Keep the listener close to the decision without announcing it.",
      cadence,
    }),
    /EXPRESSIVE_PRIMARY_EMOTION_GENERIC/u,
  );
  assert.throws(
    () => createExpressivePerformancePlan({
      role: binding,
      direction,
      primaryEmotion: "controlled anger",
      emotionalTrajectory: "rising",
      emotionalIntensity: 0.7,
      subtextIntent: "The speaker is trying not to give the threat away too early.",
      cadence: {
        ...cadence,
        phraseLengthVariation: 0.03,
        pauseVariation: 0.02,
      },
    }),
    /EXPRESSIVE_CADENCE_VARIATION_TOO_LOW/u,
  );
});

test("expressive synthesis metadata is deterministic, provider-neutral and explicitly forbids generic fallback", () => {
  const binding = role();
  const performance = plan(binding);
  const metadata = expressivePerformanceRequestMetadata(performance, binding);
  assert.equal(metadata.expressivePerformanceRequired, "true");
  assert.equal(metadata.expressiveGenericFallbackAllowed, "false");
  assert.equal(metadata.expressivePreserveVoiceIdentity, "true");
  assert.equal(metadata.expressiveCadenceProfile, "intimate");
  assert.match(metadata.expressiveStyleInstruction ?? "", /Do not substitute a generic\/default voice/u);
  assert.match(metadata.expressiveStyleInstruction ?? "", /contained fear/u);
});

test("expressive synthesis request pins exact role voice and includes expressive intent in idempotency", () => {
  const binding = role();
  const performance = plan(binding);
  const job: GenerationJob = {
    id: "job_expressive_001",
    projectId: binding.projectId,
    segmentId: direction.segmentId,
    providerFallbackIds: ["audio-studio-local", "elevenlabs"],
    cacheKey: HASH_E,
    candidateCount: 3,
    status: "ready",
  };
  const request = buildExpressiveSynthesisRequest({
    job,
    text: "I thought I could keep it from you. I cannot.",
    immutableSourceHash: HASH_B,
    role: binding,
    direction,
    plan: performance,
    mode: "production",
    candidateIndex: 0,
  });
  assert.equal(request.voiceProfileId, binding.voice.profileId);
  assert.equal(request.voiceRevision, binding.voice.revision);
  assert.equal(request.voiceProfileHash, binding.voice.profileHash);
  assert.equal(request.metadata.expressivePerformancePlanFingerprint, performance.fingerprint);
  assert.equal(request.metadata.expressiveRoleBindingFingerprint, binding.fingerprint);

  const altered = createExpressivePerformancePlan({
    role: binding,
    direction,
    primaryEmotion: "controlled grief",
    secondaryEmotion: "relief",
    emotionalTrajectory: "falling",
    emotionalIntensity: 0.62,
    subtextIntent: "The confession releases pressure but the speaker is afraid of the answer.",
    cadence,
  });
  const requestB = buildExpressiveSynthesisRequest({
    job,
    text: "I thought I could keep it from you. I cannot.",
    immutableSourceHash: HASH_B,
    role: binding,
    direction,
    plan: altered,
    mode: "production",
    candidateIndex: 0,
  });
  assert.notEqual(request.idempotencyKey, requestB.idempotencyKey);
  assert.notEqual(request.requestId, requestB.requestId);
});

test("provider capability must support style instructions for expressive production", () => {
  const capable = createCapabilitySnapshot({
    providerId: "expressive-provider",
    adapterVersion: "1.0.0",
    capturedAt: "2026-08-13T01:30:00.000Z",
    features: ["style-instructions", "word-timestamps"],
    maximumInputCharacters: 10_000,
    supportedFormats: ["wav"],
    supportedSampleRatesHz: [48_000],
    regions: ["local"],
    storesInputs: false,
    trainsOnCustomerData: false,
    customVoiceRequiresConsent: true,
  });
  assert.doesNotThrow(() => assertProviderSupportsExpressivePerformance(capable, 1_000));

  const incapable = createCapabilitySnapshot({
    providerId: "flat-provider",
    adapterVersion: "1.0.0",
    capturedAt: "2026-08-13T01:30:00.000Z",
    features: ["word-timestamps"],
    maximumInputCharacters: 10_000,
    supportedFormats: ["wav"],
    supportedSampleRatesHz: [48_000],
    regions: ["local"],
    storesInputs: false,
    trainsOnCustomerData: false,
    customVoiceRequiresConsent: true,
  });
  assert.throws(
    () => assertProviderSupportsExpressivePerformance(incapable, 1_000),
    /EXPRESSIVE_PROVIDER_FEATURE_REQUIRED:style-instructions/u,
  );
});

test("a natural, emotional, varied and identity-stable performance is approved for existing chapter monitoring", () => {
  const binding = role();
  const performance = plan(binding);
  const observed = observation(binding, performance);
  const review = reviewExpressivePerformance({
    plan: performance,
    role: binding,
    observation: observed,
    reviewedAt: new Date("2026-08-13T02:30:00.000Z"),
  });
  assert.equal(review.status, "approved-for-chapter-monitoring");
  assert.equal(review.expressivePerformanceApproved, true);
  assert.equal(review.naturalnessGatePassed, true);
  assert.equal(review.emotionalTruthGatePassed, true);
  assert.equal(review.cadenceGatePassed, true);
  assert.equal(review.genericDeliveryRejected, true);
  assert.equal(review.syntheticArtifactsRejected, true);
  assert.equal(review.titleReleaseAuthority, false);
  assert.equal(review.publicationAuthority, false);
  assertExpressivePerformanceReview(review, {
    plan: performance,
    role: binding,
    observation: observed,
  });
});

test("generic AI-like delivery, synthetic artefacts and fallback voices require regeneration", () => {
  const binding = role();
  const performance = plan(binding);
  const observed = observation(binding, performance, {
    scores: {
      naturalness: 3.3,
      emotionalTruth: 3.1,
      cadence: 3.2,
      roleFidelity: 3.5,
      identityStability: 4.7,
      sustainedListenability: 3.4,
    },
    fallbackVoiceUsed: true,
    syntheticArtifactFlags: ["SYNTHETIC_METALLIC_VOWEL", "SYNTHETIC_BREATH_DISCONTINUITY"],
    genericDeliveryFlags: ["GENERIC_EMOTION_FLATTENING", "GENERIC_REPETITIVE_CADENCE"],
  });
  const review = reviewExpressivePerformance({
    plan: performance,
    role: binding,
    observation: observed,
    reviewedAt: new Date("2026-08-13T02:30:00.000Z"),
  });
  assert.equal(review.status, "requires-regeneration");
  assert.equal(review.expressivePerformanceApproved, false);
  assert.ok(review.findingCodes.includes("EXPRESSIVE_GENERIC_OR_FALLBACK_VOICE_USED"));
  assert.ok(review.findingCodes.includes("EXPRESSIVE_SYNTHETIC_ARTIFACTS_DETECTED"));
  assert.ok(review.findingCodes.includes("EXPRESSIVE_GENERIC_DELIVERY_DETECTED"));
  assert.ok(review.findingCodes.includes("EXPRESSIVE_NATURALNESS_BELOW_THRESHOLD"));
  assert.ok(review.findingCodes.includes("EXPRESSIVE_EMOTIONAL_TRUTH_BELOW_THRESHOLD"));
});

test("monotone cadence and repeated sentence-final contours require regeneration even when human scores are generous", () => {
  const binding = role();
  const performance = plan(binding);
  const observed = observation(binding, performance, {
    pitchRangeSemitones: 1.2,
    dynamicRangeDb: 2.2,
    cadenceTemplateSimilarity: 0.94,
    sentenceFinalContourRepetitionRatio: 0.81,
  });
  const review = reviewExpressivePerformance({
    plan: performance,
    role: binding,
    observation: observed,
    reviewedAt: new Date("2026-08-13T02:30:00.000Z"),
  });
  assert.equal(review.status, "requires-regeneration");
  assert.equal(review.cadenceGatePassed, false);
  assert.ok(review.findingCodes.includes("EXPRESSIVE_PITCH_VARIATION_TOO_LOW"));
  assert.ok(review.findingCodes.includes("EXPRESSIVE_DYNAMIC_RANGE_TOO_LOW"));
  assert.ok(review.findingCodes.includes("EXPRESSIVE_CADENCE_TEMPLATE_REPETITIVE"));
  assert.ok(review.findingCodes.includes("EXPRESSIVE_SENTENCE_FINAL_CONTOUR_REPETITIVE"));
});

test("a voice swap cannot be hidden inside an otherwise excellent expressive observation", () => {
  const binding = role();
  const performance = plan(binding);
  const observed = observation(binding, performance, {
    voice: {
      profileId: "voice_substitute",
      revision: 1,
      profileHash: HASH_E,
    },
  });
  assert.throws(
    () => reviewExpressivePerformance({
      plan: performance,
      role: binding,
      observation: observed,
    }),
    /EXPRESSIVE_REVIEW_VOICE_IDENTITY_MISMATCH/u,
  );
});

test("rehashing an outer plan cannot weaken quality thresholds or manufacture authority", () => {
  const binding = role();
  const performance = plan(binding);
  const tampered = {
    ...performance,
    quality: {
      ...performance.quality,
      minimumNaturalnessScore: 1,
    },
    titleReleaseAuthority: true,
    publicationAuthority: true,
  } as unknown as typeof performance;
  (tampered as { fingerprint: string }).fingerprint = stableHash(
    Object.fromEntries(Object.entries(tampered).filter(([key]) => key !== "fingerprint")),
  );
  assert.throws(
    () => assertExpressivePerformancePlan(tampered, binding, direction),
    /EXPRESSIVE_QUALITY_THRESHOLDS_WEAKENED|EXPRESSIVE_PLAN_POLICY_INVALID/u,
  );
});
