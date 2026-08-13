import type {
  PerformanceDirection,
  ProviderFeature,
} from "./index.js";
import {
  createCapabilitySnapshot,
  type CanonicalPronunciation,
  type ProviderAudioFormat,
  type ProviderCapabilitySnapshot,
  type SynthesisRequest,
} from "./provider-adapter.js";
import {
  isRecord,
  requireArray,
  requireBoolean,
  requireInteger,
  requireString,
} from "./audio-studio-http.js";
import {
  AUDIO_STUDIO_ADAPTER_VERSION,
  AUDIO_STUDIO_PROVIDER_ID,
  AUDIO_STUDIO_RENDER_SCHEMA,
  AUDIO_STUDIO_RIGHTS_SCHEMA,
  type AudioStudioArtifactStatus,
  type AudioStudioJobStatus,
  type AudioStudioServiceHealth,
  type AudioStudioSubmission,
  type AudioStudioVoiceBinding,
} from "./audio-studio-types.js";

const ALLOWED_FEATURES = new Set<ProviderFeature>([
  "streaming",
  "batch-long-form",
  "speech-to-speech",
  "pronunciation-dictionary",
  "phoneme-control",
  "word-timestamps",
  "multi-speaker",
  "deterministic-seed",
  "local-runtime",
  "regional-processing",
  "style-instructions",
]);

const ALLOWED_SOURCE_KINDS = new Set([
  "licensed-stock",
  "authorised-clone",
  "original-cast",
  "synthetic-designed",
]);
const ALLOWED_RIGHTS_BASES = new Set([
  "unknown",
  "owned",
  "licensed",
  "commissioned",
  "public_domain",
  "not_applicable",
]);
const ALLOWED_CONSENT_BASES = new Set([
  "unknown",
  "none",
  "self",
  "written_consent",
  "contract",
  "not_applicable",
]);
const ALLOWED_VOICE_OPERATIONS = new Set([
  "inspect",
  "hash",
  "transcode_for_analysis",
  "transcribe_for_analysis",
  "diarize_for_analysis",
  "segment_for_analysis",
  "create_voice_reference",
  "train_voice_model",
  "fine_tune_voice_model",
  "synthesise",
  "commercial_use",
  "public_distribution",
]);

export function parseAudioStudioHealth(value: unknown): AudioStudioServiceHealth {
  if (!isRecord(value) || value.schema !== "evavo_voice_service_health_v1") {
    throw new Error("AUDIO_STUDIO_HEALTH_SCHEMA_INVALID");
  }
  return {
    schema: "evavo_voice_service_health_v1",
    service: requireString(value.service, "AUDIO_STUDIO_HEALTH_SERVICE_INVALID", 1, 128),
    version: requireString(value.version, "AUDIO_STUDIO_HEALTH_VERSION_INVALID", 1, 64),
    capabilityFingerprint: (() => {
      const fingerprint = requireString(
        value.capabilityFingerprint,
        "AUDIO_STUDIO_HEALTH_FINGERPRINT_INVALID",
        64,
        64,
      );
      if (!/^[a-f0-9]{64}$/u.test(fingerprint)) {
        throw new Error("AUDIO_STUDIO_HEALTH_FINGERPRINT_INVALID");
      }
      return fingerprint;
    })(),
    features: requireArray(value.features, "AUDIO_STUDIO_HEALTH_FEATURES_INVALID")
      .map((item) => requireString(item, "AUDIO_STUDIO_HEALTH_FEATURE_INVALID", 1, 80)),
    maximumInputCharacters: requireInteger(
      value.maximumInputCharacters,
      "AUDIO_STUDIO_HEALTH_INPUT_LIMIT_INVALID",
      1,
      1_000_000,
    ),
    supportedFormats: requireArray(
      value.supportedFormats,
      "AUDIO_STUDIO_HEALTH_FORMATS_INVALID",
    ).map((item) => requireString(item, "AUDIO_STUDIO_HEALTH_FORMAT_INVALID", 1, 16)),
    supportedSampleRatesHz: requireArray(
      value.supportedSampleRatesHz,
      "AUDIO_STUDIO_HEALTH_SAMPLE_RATES_INVALID",
    ).map((item) => requireInteger(
      item,
      "AUDIO_STUDIO_HEALTH_SAMPLE_RATE_INVALID",
      8_000,
      384_000,
    )),
    storesInputs: requireBoolean(value.storesInputs, "AUDIO_STUDIO_HEALTH_STORAGE_FLAG_INVALID"),
    trainsOnCustomerData: requireBoolean(
      value.trainsOnCustomerData,
      "AUDIO_STUDIO_HEALTH_TRAINING_FLAG_INVALID",
    ),
    customVoiceRequiresConsent: requireBoolean(
      value.customVoiceRequiresConsent,
      "AUDIO_STUDIO_HEALTH_CONSENT_FLAG_INVALID",
    ),
  };
}

export function audioStudioCapabilitySnapshot(
  health: AudioStudioServiceHealth,
  now: () => Date = () => new Date(),
): ProviderCapabilitySnapshot {
  const features = health.features.filter(
    (feature): feature is ProviderFeature => ALLOWED_FEATURES.has(feature as ProviderFeature),
  );
  const supportedFormats = health.supportedFormats.filter(
    (format): format is ProviderAudioFormat =>
      format === "wav" || format === "flac" || format === "mp3",
  );
  if (health.trainsOnCustomerData) {
    throw new Error("AUDIO_STUDIO_CUSTOMER_DATA_TRAINING_FORBIDDEN");
  }
  if (!health.customVoiceRequiresConsent) {
    throw new Error("AUDIO_STUDIO_CONSENT_POLICY_REQUIRED");
  }
  if (!features.includes("local-runtime")) {
    throw new Error("AUDIO_STUDIO_LOCAL_RUNTIME_CAPABILITY_REQUIRED");
  }
  if (supportedFormats.length === 0 || health.supportedSampleRatesHz.length === 0) {
    throw new Error("AUDIO_STUDIO_MEDIA_CAPABILITY_EMPTY");
  }
  return createCapabilitySnapshot({
    providerId: AUDIO_STUDIO_PROVIDER_ID,
    adapterVersion: AUDIO_STUDIO_ADAPTER_VERSION,
    capturedAt: now().toISOString(),
    features,
    maximumInputCharacters: health.maximumInputCharacters,
    supportedFormats,
    supportedSampleRatesHz: [...health.supportedSampleRatesHz],
    regions: ["local"],
    storesInputs: health.storesInputs,
    trainsOnCustomerData: health.trainsOnCustomerData,
    customVoiceRequiresConsent: health.customVoiceRequiresConsent,
    rawPolicyVersion: `${health.version}:${health.capabilityFingerprint}`,
  });
}

export function parseAudioStudioSubmission(value: unknown): AudioStudioSubmission {
  if (!isRecord(value) || value.schema !== "evavo_voice_render_submission_v1") {
    throw new Error("AUDIO_STUDIO_SUBMISSION_SCHEMA_INVALID");
  }
  return {
    schema: "evavo_voice_render_submission_v1",
    jobId: requireString(value.jobId, "AUDIO_STUDIO_JOB_ID_INVALID", 1, 64),
    state: requireString(value.state, "AUDIO_STUDIO_JOB_STATE_INVALID", 1, 32),
    statusUrl: requireString(value.statusUrl, "AUDIO_STUDIO_STATUS_URL_INVALID", 1, 512),
  };
}

function parseArtifact(value: unknown): AudioStudioArtifactStatus {
  if (!isRecord(value)) throw new Error("AUDIO_STUDIO_JOB_ARTIFACT_INVALID");
  const sha256 = requireString(value.sha256, "AUDIO_STUDIO_ARTIFACT_SHA_INVALID", 64, 64);
  if (!/^[a-f0-9]{64}$/u.test(sha256)) {
    throw new Error("AUDIO_STUDIO_ARTIFACT_SHA_INVALID");
  }
  return {
    path: requireString(value.path, "AUDIO_STUDIO_ARTIFACT_PATH_INVALID", 1, 1_024),
    sha256,
    sizeBytes: requireInteger(
      value.sizeBytes,
      "AUDIO_STUDIO_ARTIFACT_SIZE_INVALID",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    contentType: requireString(
      value.contentType,
      "AUDIO_STUDIO_ARTIFACT_CONTENT_TYPE_INVALID",
      1,
      128,
    ),
    ...(isRecord(value.media) ? { media: value.media } : {}),
  };
}

export function parseAudioStudioJobStatus(value: unknown): AudioStudioJobStatus {
  if (!isRecord(value) || value.schema !== "evavo_voice_job_status_v1") {
    throw new Error("AUDIO_STUDIO_JOB_STATUS_SCHEMA_INVALID");
  }
  const engineLockFingerprint = typeof value.engineLockFingerprint === "string"
    ? requireString(
        value.engineLockFingerprint,
        "AUDIO_STUDIO_ENGINE_LOCK_FINGERPRINT_INVALID",
        64,
        64,
      )
    : undefined;
  if (engineLockFingerprint && !/^[a-f0-9]{64}$/u.test(engineLockFingerprint)) {
    throw new Error("AUDIO_STUDIO_ENGINE_LOCK_FINGERPRINT_INVALID");
  }
  const artifactUrls = value.artifactUrls === undefined
    ? undefined
    : requireArray(value.artifactUrls, "AUDIO_STUDIO_ARTIFACT_URLS_INVALID")
      .map((item) => requireString(item, "AUDIO_STUDIO_ARTIFACT_URL_INVALID", 1, 2_048));
  return {
    schema: "evavo_voice_job_status_v1",
    jobId: requireString(value.jobId, "AUDIO_STUDIO_JOB_ID_INVALID", 1, 64),
    state: requireString(value.state, "AUDIO_STUDIO_JOB_STATE_INVALID", 1, 32),
    requestId: requireString(value.requestId, "AUDIO_STUDIO_REQUEST_ID_INVALID", 1, 128),
    engineKey: requireString(value.engineKey, "AUDIO_STUDIO_ENGINE_KEY_INVALID", 1, 128),
    ...(engineLockFingerprint ? { engineLockFingerprint } : {}),
    ...(typeof value.completedAt === "string"
      ? { completedAt: requireString(value.completedAt, "AUDIO_STUDIO_COMPLETION_TIME_INVALID", 1, 128) }
      : {}),
    ...(isRecord(value.failure) ? { failure: value.failure } : {}),
    artifacts: requireArray(value.artifacts, "AUDIO_STUDIO_JOB_ARTIFACTS_INVALID")
      .map(parseArtifact),
    ...(artifactUrls ? { artifactUrls } : {}),
  };
}

function safeMetadata(metadata: Readonly<Record<string, string>>): Record<string, string> {
  const entries = Object.entries(metadata).sort(([left], [right]) =>
    left.localeCompare(right, "en-AU")
  );
  if (entries.length > 56) throw new Error("AUDIO_STUDIO_METADATA_LIMIT_EXCEEDED");
  return Object.fromEntries(entries.map(([key, value]) => [
    requireString(key, "AUDIO_STUDIO_METADATA_KEY_INVALID", 1, 128),
    requireString(value, "AUDIO_STUDIO_METADATA_VALUE_INVALID", 0, 1_000),
  ]));
}

function languageFor(request: SynthesisRequest, binding: AudioStudioVoiceBinding): string {
  const value = binding.language ?? request.metadata.language ?? "en-AU";
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/u.test(value)) {
    throw new Error("AUDIO_STUDIO_LANGUAGE_INVALID");
  }
  return value;
}

function outputFormat(format: ProviderAudioFormat): "wav" | "flac" | "mp3" {
  if (format === "wav" || format === "flac" || format === "mp3") return format;
  throw new Error("AUDIO_STUDIO_OUTPUT_FORMAT_UNSUPPORTED");
}

function metadataText(
  metadata: Readonly<Record<string, string>>,
  key: string,
  code: string,
  maximum = 1_000,
): string {
  return requireString(metadata[key], code, 1, maximum);
}

function metadataHash(
  metadata: Readonly<Record<string, string>>,
  key: string,
  code: string,
): string {
  const value = metadataText(metadata, key, code, 64);
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new Error(code);
  return value;
}

function metadataNumber(
  metadata: Readonly<Record<string, string>>,
  key: string,
  minimum: number,
  maximum: number,
  code: string,
): number {
  const value = Number(metadataText(metadata, key, code, 64));
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(code);
  }
  return value;
}

function expressiveDirectionPayload(
  metadata: Readonly<Record<string, string>>,
): Record<string, unknown> | undefined {
  const required = metadata.expressivePerformanceRequired;
  if (required === undefined) return undefined;
  if (required !== "true") {
    throw new Error("AUDIO_STUDIO_EXPRESSIVE_REQUIRED_FLAG_INVALID");
  }
  if (metadata.expressivePreserveVoiceIdentity !== "true") {
    throw new Error("AUDIO_STUDIO_EXPRESSIVE_IDENTITY_POLICY_INVALID");
  }
  if (metadata.expressiveGenericFallbackAllowed !== "false") {
    throw new Error("AUDIO_STUDIO_EXPRESSIVE_FALLBACK_POLICY_INVALID");
  }
  if (metadata.expressiveBlindComparativeReviewRequired !== "true") {
    throw new Error("AUDIO_STUDIO_EXPRESSIVE_REVIEW_POLICY_INVALID");
  }
  const roleKind = metadataText(
    metadata,
    "expressiveRoleKind",
    "AUDIO_STUDIO_EXPRESSIVE_ROLE_KIND_INVALID",
    32,
  );
  if (roleKind !== "narrator" && roleKind !== "character") {
    throw new Error("AUDIO_STUDIO_EXPRESSIVE_ROLE_KIND_INVALID");
  }
  const voiceStrategy = metadataText(
    metadata,
    "expressiveVoiceStrategy",
    "AUDIO_STUDIO_EXPRESSIVE_VOICE_STRATEGY_INVALID",
    64,
  );
  if (
    voiceStrategy !== "dedicated-voice"
    && voiceStrategy !== "performance-variation"
  ) {
    throw new Error("AUDIO_STUDIO_EXPRESSIVE_VOICE_STRATEGY_INVALID");
  }
  const emotionalTrajectory = metadataText(
    metadata,
    "expressiveEmotionTrajectory",
    "AUDIO_STUDIO_EXPRESSIVE_TRAJECTORY_INVALID",
    32,
  );
  if (!["sustained", "rising", "falling", "pivot", "layered"].includes(
    emotionalTrajectory,
  )) {
    throw new Error("AUDIO_STUDIO_EXPRESSIVE_TRAJECTORY_INVALID");
  }
  const characterId = metadata.expressiveCharacterId === undefined
    ? undefined
    : metadataText(
        metadata,
        "expressiveCharacterId",
        "AUDIO_STUDIO_EXPRESSIVE_CHARACTER_ID_INVALID",
        128,
      );
  if (roleKind === "character" && !characterId) {
    throw new Error("AUDIO_STUDIO_EXPRESSIVE_CHARACTER_ID_REQUIRED");
  }
  if (roleKind === "narrator" && characterId) {
    throw new Error("AUDIO_STUDIO_EXPRESSIVE_NARRATOR_CHARACTER_FORBIDDEN");
  }
  return {
    schema: "storyteller-expressive-performance-directive-v1",
    planFingerprint: metadataHash(
      metadata,
      "expressivePerformancePlanFingerprint",
      "AUDIO_STUDIO_EXPRESSIVE_PLAN_HASH_INVALID",
    ),
    roleBindingFingerprint: metadataHash(
      metadata,
      "expressiveRoleBindingFingerprint",
      "AUDIO_STUDIO_EXPRESSIVE_ROLE_HASH_INVALID",
    ),
    roleId: metadataText(
      metadata,
      "expressiveRoleId",
      "AUDIO_STUDIO_EXPRESSIVE_ROLE_ID_INVALID",
      128,
    ),
    roleKind,
    ...(characterId ? { characterId } : {}),
    voiceStrategy,
    engineKey: metadataText(
      metadata,
      "expressiveEngineKey",
      "AUDIO_STUDIO_EXPRESSIVE_ENGINE_KEY_INVALID",
      128,
    ),
    voiceProfileHash: metadataHash(
      metadata,
      "expressiveVoiceProfileHash",
      "AUDIO_STUDIO_EXPRESSIVE_VOICE_HASH_INVALID",
    ),
    performanceAnchorHash: metadataHash(
      metadata,
      "expressivePerformanceAnchorHash",
      "AUDIO_STUDIO_EXPRESSIVE_ANCHOR_HASH_INVALID",
    ),
    emotion: {
      primary: metadataText(
        metadata,
        "expressivePrimaryEmotion",
        "AUDIO_STUDIO_EXPRESSIVE_PRIMARY_EMOTION_INVALID",
        96,
      ),
      ...(metadata.expressiveSecondaryEmotion
        ? {
            secondary: metadataText(
              metadata,
              "expressiveSecondaryEmotion",
              "AUDIO_STUDIO_EXPRESSIVE_SECONDARY_EMOTION_INVALID",
              96,
            ),
          }
        : {}),
      trajectory: emotionalTrajectory,
      intensity: metadataNumber(
        metadata,
        "expressiveEmotionalIntensity",
        0.05,
        1,
        "AUDIO_STUDIO_EXPRESSIVE_INTENSITY_INVALID",
      ),
    },
    subtextIntent: metadataText(
      metadata,
      "expressiveSubtextIntent",
      "AUDIO_STUDIO_EXPRESSIVE_SUBTEXT_INVALID",
      1_000,
    ),
    cadence: {
      profile: metadataText(
        metadata,
        "expressiveCadenceProfile",
        "AUDIO_STUDIO_EXPRESSIVE_CADENCE_PROFILE_INVALID",
        32,
      ),
      minimumWpm: metadataNumber(
        metadata,
        "expressiveMinimumWpm",
        40,
        320,
        "AUDIO_STUDIO_EXPRESSIVE_MINIMUM_WPM_INVALID",
      ),
      targetWpm: metadataNumber(
        metadata,
        "expressiveTargetWpm",
        40,
        320,
        "AUDIO_STUDIO_EXPRESSIVE_TARGET_WPM_INVALID",
      ),
      maximumWpm: metadataNumber(
        metadata,
        "expressiveMaximumWpm",
        40,
        320,
        "AUDIO_STUDIO_EXPRESSIVE_MAXIMUM_WPM_INVALID",
      ),
      phraseLengthVariation: metadataNumber(
        metadata,
        "expressivePhraseVariation",
        0,
        1,
        "AUDIO_STUDIO_EXPRESSIVE_PHRASE_VARIATION_INVALID",
      ),
      pauseVariation: metadataNumber(
        metadata,
        "expressivePauseVariation",
        0,
        1,
        "AUDIO_STUDIO_EXPRESSIVE_PAUSE_VARIATION_INVALID",
      ),
      minimumPitchRangeSemitones: metadataNumber(
        metadata,
        "expressiveMinimumPitchRangeSemitones",
        1,
        48,
        "AUDIO_STUDIO_EXPRESSIVE_PITCH_RANGE_INVALID",
      ),
      minimumDynamicRangeDb: metadataNumber(
        metadata,
        "expressiveMinimumDynamicRangeDb",
        1,
        36,
        "AUDIO_STUDIO_EXPRESSIVE_DYNAMIC_RANGE_INVALID",
      ),
      maximumCadenceTemplateSimilarity: metadataNumber(
        metadata,
        "expressiveMaximumCadenceTemplateSimilarity",
        0,
        1,
        "AUDIO_STUDIO_EXPRESSIVE_TEMPLATE_SIMILARITY_INVALID",
      ),
      maximumSentenceFinalContourRepetitionRatio: metadataNumber(
        metadata,
        "expressiveMaximumContourRepetitionRatio",
        0,
        1,
        "AUDIO_STUDIO_EXPRESSIVE_CONTOUR_REPETITION_INVALID",
      ),
    },
    styleInstruction: metadataText(
      metadata,
      "expressiveStyleInstruction",
      "AUDIO_STUDIO_EXPRESSIVE_STYLE_INSTRUCTION_INVALID",
      1_000,
    ),
    preserveVoiceIdentity: true,
    genericFallbackAllowed: false,
    styleInstructionsAppliedRequired: true,
    blindComparativeReviewRequired: true,
  };
}

function directionPayload(
  direction: PerformanceDirection,
  metadata: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const expressivePerformance = expressiveDirectionPayload(metadata);
  return {
    ...direction,
    previousContext: requireString(
      metadata.previousContext ?? "none",
      "AUDIO_STUDIO_PREVIOUS_CONTEXT_INVALID",
      1,
      4_000,
    ),
    nextContext: requireString(
      metadata.nextContext ?? "none",
      "AUDIO_STUDIO_NEXT_CONTEXT_INVALID",
      1,
      4_000,
    ),
    ...(expressivePerformance ? { expressivePerformance } : {}),
  };
}

function pronunciations(
  values: readonly CanonicalPronunciation[],
): readonly Record<string, unknown>[] {
  return values.map((value) => ({
    writtenForm: value.writtenForm,
    ...(value.ipa ? { ipa: value.ipa } : {}),
    ...(value.providerPhoneme ? { providerPhoneme: value.providerPhoneme } : {}),
    ...(value.spokenForm ? { spokenForm: value.spokenForm } : {}),
    approvedRevision: value.approvedRevision,
  }));
}

export function audioStudioRenderPayload(
  request: SynthesisRequest,
  binding: AudioStudioVoiceBinding,
): Record<string, unknown> {
  return {
    schema: AUDIO_STUDIO_RENDER_SCHEMA,
    requestId: request.requestId,
    idempotencyKey: request.idempotencyKey,
    projectId: request.projectId,
    segmentId: request.segmentId,
    immutableSourceHash: request.immutableSourceHash,
    text: request.text,
    language: languageFor(request, binding),
    voiceProfile: {
      id: request.voiceProfileId,
      revision: request.voiceRevision,
      ...(request.voiceProfileHash
        ? { profileHash: request.voiceProfileHash }
        : {}),
      engineKey: binding.engineKey,
      sourceKind: binding.sourceKind,
      ...(binding.referenceManifest ? { referenceManifest: binding.referenceManifest } : {}),
    },
    direction: directionPayload(request.direction, request.metadata),
    pronunciations: pronunciations(request.pronunciations),
    mode: request.mode,
    enginePolicy: {
      requestedEngine: binding.engineKey,
      zeroApiFeeRequired: true,
      offlineRequired: true,
      commercialUse: binding.commercialUse,
      maximumVramGb: binding.maximumVramGb ?? 256,
    },
    output: {
      format: outputFormat(request.format),
      sampleRateHz: request.sampleRateHz,
      channels: binding.channels ?? 1,
    },
    voiceRights: binding.voiceRights,
    manuscriptRights: binding.manuscriptRights,
    candidateIndex: request.candidateIndex,
    metadata: {
      ...safeMetadata(request.metadata),
      storytellerProviderId: AUDIO_STUDIO_PROVIDER_ID,
      storytellerAdapterVersion: AUDIO_STUDIO_ADAPTER_VERSION,
    },
  };
}

export function verifyAudioStudioExpressiveArtifactEvidence(
  request: SynthesisRequest,
  artifact: AudioStudioArtifactStatus,
): void {
  const directive = expressiveDirectionPayload(request.metadata);
  if (!directive) return;
  if (!request.voiceProfileHash) {
    throw new Error("AUDIO_STUDIO_EXPRESSIVE_VOICE_HASH_REQUIRED");
  }
  if (!isRecord(artifact.media)) {
    throw new Error("AUDIO_STUDIO_EXPRESSIVE_ARTIFACT_EVIDENCE_MISSING");
  }
  if (artifact.media.voiceProfileHash !== request.voiceProfileHash) {
    throw new Error("AUDIO_STUDIO_EXPRESSIVE_ARTIFACT_VOICE_MISMATCH");
  }
  if (
    artifact.media.expressivePerformancePlanFingerprint
      !== request.metadata.expressivePerformancePlanFingerprint
  ) {
    throw new Error("AUDIO_STUDIO_EXPRESSIVE_ARTIFACT_PLAN_MISMATCH");
  }
  if (
    artifact.media.expressiveRoleBindingFingerprint
      !== request.metadata.expressiveRoleBindingFingerprint
  ) {
    throw new Error("AUDIO_STUDIO_EXPRESSIVE_ARTIFACT_ROLE_MISMATCH");
  }
  if (
    artifact.media.expressivePerformanceAnchorHash
      !== request.metadata.expressivePerformanceAnchorHash
  ) {
    throw new Error("AUDIO_STUDIO_EXPRESSIVE_ARTIFACT_ANCHOR_MISMATCH");
  }
  if (artifact.media.expressiveStyleInstructionsApplied !== true) {
    throw new Error("AUDIO_STUDIO_EXPRESSIVE_STYLE_EVIDENCE_MISSING");
  }
  if (artifact.media.genericFallbackVoiceUsed !== false) {
    throw new Error("AUDIO_STUDIO_EXPRESSIVE_FALLBACK_EVIDENCE_INVALID");
  }
}

function requireActiveRightsWindow(
  binding: AudioStudioVoiceBinding,
  now: () => Date,
): void {
  const timestamp = now().getTime();
  for (const [field, value] of [
    ["effectiveFrom", binding.voiceRights.effectiveFrom],
    ["expiresAt", binding.voiceRights.expiresAt],
    ["revokedAt", binding.voiceRights.revokedAt],
  ] as const) {
    if (value !== undefined && !Number.isFinite(Date.parse(value))) {
      throw new Error(`AUDIO_STUDIO_VOICE_RIGHTS_${field.toUpperCase()}_INVALID`);
    }
  }
  if (
    binding.voiceRights.effectiveFrom
    && timestamp < Date.parse(binding.voiceRights.effectiveFrom)
  ) {
    throw new Error("AUDIO_STUDIO_VOICE_RIGHTS_NOT_EFFECTIVE");
  }
  if (binding.voiceRights.expiresAt && timestamp >= Date.parse(binding.voiceRights.expiresAt)) {
    throw new Error("AUDIO_STUDIO_VOICE_RIGHTS_EXPIRED");
  }
  if (binding.voiceRights.revokedAt && timestamp >= Date.parse(binding.voiceRights.revokedAt)) {
    throw new Error("AUDIO_STUDIO_VOICE_RIGHTS_REVOKED");
  }
}

export function verifyAudioStudioBinding(
  request: SynthesisRequest,
  binding: AudioStudioVoiceBinding,
  now: () => Date = () => new Date(),
): void {
  if (!isRecord(binding)) throw new Error("AUDIO_STUDIO_BINDING_INVALID");
  if (
    request.voiceProfileHash !== undefined
    && !/^[a-f0-9]{64}$/u.test(request.voiceProfileHash)
  ) {
    throw new Error("AUDIO_STUDIO_VOICE_PROFILE_HASH_INVALID");
  }
  const expressiveDirective = expressiveDirectionPayload(request.metadata);
  if (expressiveDirective) {
    if (!request.voiceProfileHash) {
      throw new Error("AUDIO_STUDIO_EXPRESSIVE_VOICE_HASH_REQUIRED");
    }
    if (expressiveDirective.voiceProfileHash !== request.voiceProfileHash) {
      throw new Error("AUDIO_STUDIO_EXPRESSIVE_VOICE_HASH_MISMATCH");
    }
    if (expressiveDirective.engineKey !== binding.engineKey) {
      throw new Error("AUDIO_STUDIO_EXPRESSIVE_ENGINE_MISMATCH");
    }
  }
  if (!/^[a-z0-9][a-z0-9._-]{1,127}$/u.test(binding.engineKey)) {
    throw new Error("AUDIO_STUDIO_ENGINE_KEY_INVALID");
  }
  if (!ALLOWED_SOURCE_KINDS.has(binding.sourceKind)) {
    throw new Error("AUDIO_STUDIO_VOICE_SOURCE_KIND_INVALID");
  }
  if (typeof binding.commercialUse !== "boolean") {
    throw new Error("AUDIO_STUDIO_COMMERCIAL_USE_FLAG_INVALID");
  }
  if (binding.maximumVramGb !== undefined && (
    !Number.isFinite(binding.maximumVramGb)
    || binding.maximumVramGb <= 0
    || binding.maximumVramGb > 256
  )) {
    throw new Error("AUDIO_STUDIO_MAXIMUM_VRAM_INVALID");
  }
  if (binding.channels !== undefined && binding.channels !== 1 && binding.channels !== 2) {
    throw new Error("AUDIO_STUDIO_CHANNEL_COUNT_INVALID");
  }
  if (binding.language !== undefined && !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/u.test(binding.language)) {
    throw new Error("AUDIO_STUDIO_LANGUAGE_INVALID");
  }
  if (binding.referenceManifest !== undefined) {
    requireString(
      binding.referenceManifest,
      "AUDIO_STUDIO_REFERENCE_MANIFEST_INVALID",
      1,
      2_048,
    );
  }
  if (binding.sourceKind === "authorised-clone" && !binding.referenceManifest) {
    throw new Error("AUDIO_STUDIO_REFERENCE_MANIFEST_REQUIRED");
  }

  if (!isRecord(binding.voiceRights)) {
    throw new Error("AUDIO_STUDIO_VOICE_RIGHTS_INVALID");
  }
  if (binding.voiceRights.schema !== AUDIO_STUDIO_RIGHTS_SCHEMA) {
    throw new Error("AUDIO_STUDIO_VOICE_RIGHTS_SCHEMA_INVALID");
  }
  if (!/^[a-f0-9]{64}$/u.test(binding.voiceRights.sourceSha256)) {
    throw new Error("AUDIO_STUDIO_VOICE_SOURCE_HASH_INVALID");
  }
  requireString(
    binding.voiceRights.sourceTitle,
    "AUDIO_STUDIO_VOICE_SOURCE_TITLE_INVALID",
    1,
    512,
  );
  if (!ALLOWED_RIGHTS_BASES.has(binding.voiceRights.textRightsBasis)) {
    throw new Error("AUDIO_STUDIO_TEXT_RIGHTS_BASIS_INVALID");
  }
  if (!ALLOWED_RIGHTS_BASES.has(binding.voiceRights.recordingRightsBasis)) {
    throw new Error("AUDIO_STUDIO_RECORDING_RIGHTS_BASIS_INVALID");
  }
  if (
    binding.voiceRights.textRightsBasis === "unknown"
    || binding.voiceRights.recordingRightsBasis === "unknown"
  ) {
    throw new Error("AUDIO_STUDIO_SOURCE_RIGHTS_UNRESOLVED");
  }
  if (!ALLOWED_CONSENT_BASES.has(binding.voiceRights.performerConsentBasis)) {
    throw new Error("AUDIO_STUDIO_PERFORMER_CONSENT_BASIS_INVALID");
  }
  if (binding.sourceKind === "authorised-clone" && ![
    "self",
    "written_consent",
    "contract",
  ].includes(binding.voiceRights.performerConsentBasis)) {
    throw new Error("AUDIO_STUDIO_PERFORMER_CONSENT_REQUIRED");
  }
  if (
    !Array.isArray(binding.voiceRights.operations)
    || binding.voiceRights.operations.length === 0
    || binding.voiceRights.operations.length > ALLOWED_VOICE_OPERATIONS.size
    || new Set(binding.voiceRights.operations).size !== binding.voiceRights.operations.length
    || binding.voiceRights.operations.some((operation) => !ALLOWED_VOICE_OPERATIONS.has(operation))
  ) {
    throw new Error("AUDIO_STUDIO_VOICE_OPERATIONS_INVALID");
  }
  if (!binding.voiceRights.operations.includes("synthesise")) {
    throw new Error("AUDIO_STUDIO_VOICE_SYNTHESIS_NOT_AUTHORISED");
  }
  if (
    !Array.isArray(binding.voiceRights.evidenceRefs)
    || binding.voiceRights.evidenceRefs.length === 0
    || binding.voiceRights.evidenceRefs.length > 64
    || new Set(binding.voiceRights.evidenceRefs).size !== binding.voiceRights.evidenceRefs.length
  ) {
    throw new Error("AUDIO_STUDIO_VOICE_RIGHTS_EVIDENCE_MISSING");
  }
  for (const evidenceRef of binding.voiceRights.evidenceRefs) {
    requireString(evidenceRef, "AUDIO_STUDIO_VOICE_RIGHTS_EVIDENCE_INVALID", 1, 2_048);
  }
  if (typeof binding.voiceRights.commercialUseAuthorized !== "boolean") {
    throw new Error("AUDIO_STUDIO_VOICE_COMMERCIAL_FLAG_INVALID");
  }
  if (typeof binding.voiceRights.publicDistributionAuthorized !== "boolean") {
    throw new Error("AUDIO_STUDIO_VOICE_PUBLIC_DISTRIBUTION_FLAG_INVALID");
  }
  requireActiveRightsWindow(binding, now);

  if (!isRecord(binding.manuscriptRights)) {
    throw new Error("AUDIO_STUDIO_MANUSCRIPT_RIGHTS_INVALID");
  }
  requireString(
    binding.manuscriptRights.evidenceId,
    "AUDIO_STUDIO_MANUSCRIPT_RIGHTS_EVIDENCE_INVALID",
    1,
    512,
  );
  if (
    typeof binding.manuscriptRights.synthesisAuthorized !== "boolean"
    || typeof binding.manuscriptRights.commercialUseAuthorized !== "boolean"
  ) {
    throw new Error("AUDIO_STUDIO_MANUSCRIPT_RIGHTS_FLAGS_INVALID");
  }
  if (!binding.manuscriptRights.synthesisAuthorized) {
    throw new Error("AUDIO_STUDIO_MANUSCRIPT_SYNTHESIS_NOT_AUTHORISED");
  }
  if (
    binding.commercialUse
    && (
      !binding.voiceRights.commercialUseAuthorized
      || !binding.voiceRights.operations.includes("commercial_use")
      || !binding.manuscriptRights.commercialUseAuthorized
    )
  ) {
    throw new Error("AUDIO_STUDIO_COMMERCIAL_RIGHTS_NOT_AUTHORISED");
  }
  if (request.text.length > 20_000) {
    throw new Error("AUDIO_STUDIO_TEXT_LIMIT_EXCEEDED");
  }
}
