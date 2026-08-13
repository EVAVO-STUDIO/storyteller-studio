import assert from "node:assert/strict";
import test from "node:test";
import {
  audioStudioRenderPayload,
  verifyAudioStudioBinding,
  verifyAudioStudioExpressiveArtifactEvidence,
} from "./audio-studio-contracts.js";
import {
  AUDIO_STUDIO_PROVIDER_ID,
  type AudioStudioVoiceBinding,
} from "./audio-studio-types.js";
import {
  createExpressiveGenerationBinding,
} from "./expressive-generation-binding.js";
import {
  createGenerationMaterialRecord,
  generationMaterialPublicView,
} from "./generation-material.js";
import {
  buildGenerationWorkerRequests,
  type GenerationWorkerMaterial,
} from "./generation-worker.js";
import {
  stableHash,
  type ManuscriptSegment,
  type PerformanceDirection,
  type ProviderFeature,
  type SegmentedManuscript,
} from "./index.js";
import {
  buildExpressiveSynthesisRequest,
  createExpressivePerformancePlan,
  createExpressiveVoiceRoleBinding,
  type ExpressiveCadencePlan,
} from "./narration-expressive-performance.js";
import {
  createNaturalNarrationProductionPlan,
} from "./narration-production-policy.js";
import type { NarratorProductionJob } from "./narrator-production-job.js";
import {
  createCapabilitySnapshot,
  executeGenerationJob,
  ProviderAdapterRegistry,
  type CredentialResolver,
  type NarrationProviderAdapter,
  type SynthesisRequest,
  type SynthesisResult,
} from "./provider-adapter.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);
const HASH_E = "e".repeat(64);
const HASH_F = "f".repeat(64);
const PROJECT_ID = "project_expressive_generation";
const SEGMENT_ID = "segment_expressive_generation";
const TEXT = "Mara steadied her breath before admitting that the locked room had answered her.";

const direction: PerformanceDirection = Object.freeze({
  segmentId: SEGMENT_ID,
  narrativeDistance: "intimate",
  pace: 0.76,
  intensity: 0.68,
  warmth: 0.54,
  restraint: 0.57,
  clarity: 0.95,
  pauseBeforeMs: 160,
  pauseAfterMs: 280,
  emotionalObjective: "Keep the fear controlled until the final admission becomes unavoidable.",
  subtext: "She wants help but is ashamed that she waited so long to ask.",
  notes: Object.freeze([
    "Let the breath tighten before the final clause without raising the overall volume.",
  ]),
});

const cadence: ExpressiveCadencePlan = Object.freeze({
  profile: "intimate",
  minimumWpm: 112,
  targetWpm: 138,
  maximumWpm: 162,
  phraseLengthVariation: 0.44,
  pauseVariation: 0.39,
  minimumPitchRangeSemitones: 4.5,
  minimumDynamicRangeDb: 5.5,
  maximumCadenceTemplateSimilarity: 0.7,
  maximumSentenceFinalContourRepetitionRatio: 0.34,
});

const voice = Object.freeze({
  profileId: "voice_mara_authorised",
  revision: 9,
  profileHash: HASH_A,
});

const role = createExpressiveVoiceRoleBinding({
  projectId: PROJECT_ID,
  roleId: "role_mara",
  roleKind: "character",
  characterId: "character_mara",
  displayName: "Mara",
  voice,
  voiceIdentityId: "identity_mara",
  engineKey: "chatterbox-local",
  sourceRightsFingerprint: HASH_B,
  voiceStrategy: "dedicated-voice",
  performanceAnchorHash: HASH_C,
  approvedBy: "casting_director",
  approvedAt: "2026-08-13T03:00:00.000Z",
});

const performancePlan = createExpressivePerformancePlan({
  role,
  direction,
  primaryEmotion: "contained fear",
  secondaryEmotion: "reluctant trust",
  emotionalTrajectory: "pivot",
  emotionalIntensity: 0.71,
  subtextIntent: "Delay the request for help until the last phrase, where the need finally becomes audible.",
  cadence,
});

const expressiveBinding = createExpressiveGenerationBinding({
  role,
  plan: performancePlan,
  direction,
});

const manuscriptSegment: ManuscriptSegment = Object.freeze({
  id: SEGMENT_ID,
  sourceHash: HASH_D,
  chapterId: "chapter_001",
  chapterOrdinal: 1,
  chapterTitle: "Chapter One",
  ordinal: 1,
  kind: "dialogue",
  sourceStart: 0,
  sourceEnd: TEXT.length,
  text: TEXT,
  wordCount: TEXT.split(/\s+/u).length,
  estimatedSpeechSeconds: 7.5,
});

const manuscript: SegmentedManuscript = Object.freeze({
  sourceHash: HASH_D,
  characterCount: TEXT.length,
  wordCount: manuscriptSegment.wordCount,
  chapters: Object.freeze([{
    id: "chapter_001",
    ordinal: 1,
    title: "Chapter One",
    sourceStart: 0,
  }]),
  segments: Object.freeze([manuscriptSegment]),
  findings: Object.freeze([]),
});

const naturalNarration = createNaturalNarrationProductionPlan({
  manuscript,
  segmentId: SEGMENT_ID,
  direction,
  language: "en-AU",
});

const job: NarratorProductionJob = Object.freeze({
  id: "job_expressive_generation",
  projectId: PROJECT_ID,
  segmentId: SEGMENT_ID,
  providerFallbackIds: Object.freeze([AUDIO_STUDIO_PROVIDER_ID]),
  cacheKey: HASH_E,
  candidateCount: 3,
  status: "ready",
  narratorProductionSchema: "storyteller-narrator-production-job-v2",
  narratorProfileAdmissionHash: HASH_B,
  narratorAdmittedCastingFingerprint: HASH_C,
  narratorCastingFingerprint: HASH_F,
  narratorVoice: voice,
});

function material(): GenerationWorkerMaterial {
  return {
    text: TEXT,
    immutableSourceHash: HASH_D,
    voiceProfileId: voice.profileId,
    voiceRevision: voice.revision,
    voiceProfileHash: voice.profileHash,
    direction,
    pronunciations: Object.freeze([]),
    mode: "production",
    format: "wav",
    sampleRateHz: 48_000,
    rights: {
      rightsEvidenceId: "rights_expressive_generation",
      rightsFingerprint: HASH_B,
      allowedUses: ["audiobook"],
      commercialUseApproved: true,
      expiresAt: "2028-08-13T00:00:00.000Z",
    },
    intendedUse: "audiobook",
    commercial: true,
    parentArtifactIds: Object.freeze(["artifact_mara_voice_anchor"]),
    naturalNarration,
    expressivePerformance: expressiveBinding,
  };
}

function audioStudioBinding(): AudioStudioVoiceBinding {
  return {
    engineKey: role.engineKey,
    sourceKind: "authorised-clone",
    referenceManifest: "evavo-storage://voice/mara/revision-9",
    voiceRights: {
      schema: "evavo_voice_rights_record_v1",
      sourceSha256: HASH_A,
      sourceTitle: "Authorised Mara voice reference",
      textRightsBasis: "licensed",
      recordingRightsBasis: "commissioned",
      performerIdentity: "Mara performer",
      performerConsentBasis: "contract",
      operations: [
        "create_voice_reference",
        "synthesise",
        "commercial_use",
      ],
      evidenceRefs: ["evavo-storage://rights/mara-contract"],
      commercialUseAuthorized: true,
      publicDistributionAuthorized: false,
    },
    manuscriptRights: {
      evidenceId: "rights_manuscript_expressive_generation",
      synthesisAuthorized: true,
      commercialUseAuthorized: true,
    },
    commercialUse: true,
    maximumVramGb: 24,
    language: "en-AU",
    channels: 1,
  };
}

test("persisted production material drives the normal worker through exact expressive requests", () => {
  const record = createGenerationMaterialRecord(
    job,
    material(),
    new Date("2026-08-13T03:30:00.000Z"),
  );
  const view = generationMaterialPublicView(record);
  assert.equal(
    view.expressiveGenerationBindingFingerprint,
    expressiveBinding.fingerprint,
  );
  assert.equal(
    view.expressivePerformancePlanFingerprint,
    performancePlan.fingerprint,
  );
  assert.equal(view.expressiveRoleKind, "character");
  assert.equal(view.expressiveVoiceStrategy, "dedicated-voice");
  assert.equal(view.expressiveCharacterScoped, true);
  const publicJson = JSON.stringify(view);
  assert.equal(publicJson.includes(role.displayName), false);
  assert.equal(publicJson.includes(role.characterId ?? ""), false);
  assert.equal(publicJson.includes(voice.profileId), false);

  const requests = buildGenerationWorkerRequests(job, record.material);
  assert.equal(requests.length, 3);
  assert.equal(
    requests.every((request) => request.voiceProfileHash === voice.profileHash),
    true,
  );
  assert.equal(
    requests.every((request) =>
      request.metadata.expressivePerformancePlanFingerprint
        === performancePlan.fingerprint
    ),
    true,
  );
  assert.equal(
    requests.every((request) =>
      request.metadata.expressiveRoleBindingFingerprint === role.fingerprint
    ),
    true,
  );
  assert.equal(
    new Set(requests.map((request) => request.idempotencyKey)).size,
    3,
  );
});

test("production Audio Studio material cannot silently fall back to plain synthesis", () => {
  const complete = material();
  const {
    expressivePerformance: _expressivePerformance,
    ...withoutExpressive
  } = complete;
  assert.throws(
    () => createGenerationMaterialRecord(
      job,
      withoutExpressive,
      new Date("2026-08-13T03:30:00.000Z"),
    ),
    /EXPRESSIVE_PRODUCTION_BINDING_REQUIRED/u,
  );

  assert.throws(
    () => createGenerationMaterialRecord(
      job,
      {
        ...complete,
        voiceProfileHash: HASH_F,
      },
      new Date("2026-08-13T03:30:00.000Z"),
    ),
    /NARRATOR_PROFILE_PIN_MISMATCH|NARRATOR_PRODUCTION_VOICE_MISMATCH|EXPRESSIVE_GENERATION_VOICE_PIN_MISMATCH/u,
  );
});

function providerAdapter(
  providerId: string,
  features: readonly ProviderFeature[],
  synthesiseCalls: { count: number },
): NarrationProviderAdapter {
  const capability = createCapabilitySnapshot({
    providerId,
    adapterVersion: "1.0.0",
    capturedAt: "2026-08-13T03:40:00.000Z",
    features,
    maximumInputCharacters: 20_000,
    supportedFormats: ["wav"],
    supportedSampleRatesHz: [48_000],
    regions: ["local"],
    storesInputs: false,
    trainsOnCustomerData: false,
    customVoiceRequiresConsent: true,
  });
  return {
    providerId,
    adapterVersion: "1.0.0",
    async inspectCapabilities() {
      return capability;
    },
    async synthesise(request: SynthesisRequest): Promise<SynthesisResult> {
      synthesiseCalls.count += 1;
      return {
        providerId,
        adapterVersion: "1.0.0",
        requestId: request.requestId,
        idempotencyKey: request.idempotencyKey,
        audio: new Uint8Array([82, 73, 70, 70, request.candidateIndex]),
        contentType: "audio/wav",
        transcript: request.text,
        usage: { inputCharacters: request.text.length },
        capabilityFingerprint: capability.fingerprint,
        generatedAt: "2026-08-13T03:41:00.000Z",
        provenance: {
          expressivePerformancePlanFingerprint:
            request.metadata.expressivePerformancePlanFingerprint ?? "missing",
        },
      };
    },
  };
}

test("provider fallback rejects engines without style instructions before manuscript synthesis", async () => {
  const expressiveJob = {
    ...job,
    providerFallbackIds: ["flat-provider", "expressive-provider"],
  };
  const requests = Array.from({ length: expressiveJob.candidateCount }, (_, candidateIndex) =>
    buildExpressiveSynthesisRequest({
      job: expressiveJob,
      text: TEXT,
      immutableSourceHash: HASH_D,
      role,
      direction,
      plan: performancePlan,
      mode: "production",
      candidateIndex,
    })
  );
  const flatCalls = { count: 0 };
  const expressiveCalls = { count: 0 };
  const credentials: CredentialResolver = {
    async resolve() {
      return "server-only-token";
    },
  };
  const report = await executeGenerationJob({
    job: expressiveJob,
    registry: new ProviderAdapterRegistry([
      providerAdapter("flat-provider", ["word-timestamps"], flatCalls),
      providerAdapter(
        "expressive-provider",
        ["word-timestamps", "style-instructions"],
        expressiveCalls,
      ),
    ]),
    credentials,
    requests,
  });
  assert.equal(report.status, "completed");
  assert.equal(flatCalls.count, 0);
  assert.equal(expressiveCalls.count, 3);
  assert.equal(
    report.attempts
      .filter((attempt) => attempt.providerId === "flat-provider")
      .every((attempt) =>
        attempt.findings.some((finding) =>
          finding.code === "GENERATION_EXPRESSIVE_STYLE_INSTRUCTIONS_REQUIRED"
        )
      ),
    true,
  );
});

test("Audio Studio receives structured expressive direction and must prove it was applied", () => {
  const request = buildExpressiveSynthesisRequest({
    job,
    text: TEXT,
    immutableSourceHash: HASH_D,
    role,
    direction,
    plan: performancePlan,
    mode: "production",
    candidateIndex: 0,
    naturalNarration,
  });
  const binding = audioStudioBinding();
  assert.doesNotThrow(() => verifyAudioStudioBinding(
    request,
    binding,
    () => new Date("2026-08-13T03:45:00.000Z"),
  ));
  const payload = audioStudioRenderPayload(request, binding);
  const voiceProfile = payload.voiceProfile as Record<string, unknown>;
  const renderedDirection = payload.direction as Record<string, unknown>;
  const expressive = renderedDirection.expressivePerformance as Record<string, unknown>;
  const emotion = expressive.emotion as Record<string, unknown>;
  const renderedCadence = expressive.cadence as Record<string, unknown>;
  assert.equal(voiceProfile.profileHash, voice.profileHash);
  assert.equal(expressive.planFingerprint, performancePlan.fingerprint);
  assert.equal(expressive.roleBindingFingerprint, role.fingerprint);
  assert.equal(expressive.performanceAnchorHash, role.performanceAnchorHash);
  assert.equal(expressive.engineKey, role.engineKey);
  assert.equal(expressive.styleInstructionsAppliedRequired, true);
  assert.equal(expressive.genericFallbackAllowed, false);
  assert.equal(emotion.primary, "contained fear");
  assert.equal(renderedCadence.targetWpm, cadence.targetWpm);

  const artifact = {
    path: "candidate-000.wav",
    sha256: stableHash("candidate-000.wav"),
    sizeBytes: 1024,
    contentType: "audio/wav",
    media: {
      voiceProfileHash: voice.profileHash,
      expressivePerformancePlanFingerprint: performancePlan.fingerprint,
      expressiveRoleBindingFingerprint: role.fingerprint,
      expressivePerformanceAnchorHash: role.performanceAnchorHash,
      expressiveStyleInstructionsApplied: true,
      genericFallbackVoiceUsed: false,
    },
  };
  assert.doesNotThrow(() =>
    verifyAudioStudioExpressiveArtifactEvidence(request, artifact)
  );
  assert.throws(
    () => verifyAudioStudioExpressiveArtifactEvidence(request, {
      ...artifact,
      media: {
        ...artifact.media,
        voiceProfileHash: HASH_F,
      },
    }),
    /AUDIO_STUDIO_EXPRESSIVE_ARTIFACT_VOICE_MISMATCH/u,
  );
  assert.throws(
    () => verifyAudioStudioExpressiveArtifactEvidence(request, {
      ...artifact,
      media: {
        ...artifact.media,
        expressiveStyleInstructionsApplied: false,
      },
    }),
    /AUDIO_STUDIO_EXPRESSIVE_STYLE_EVIDENCE_MISSING/u,
  );
});
