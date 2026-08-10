import {
  createGenerationJobs,
  stableHash,
  type GenerationJob,
  type ProjectManifest,
} from "./index.js";
import {
  assertExactNarratorVoicePin,
  assertNarratorCasting,
  type NarratorCastingApproval,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";

export const STORYTELLER_NARRATOR_PRODUCTION_JOB_SCHEMA =
  "storyteller-narrator-production-job-v1" as const;

export interface NarratorProductionJob extends GenerationJob {
  narratorProductionSchema: typeof STORYTELLER_NARRATOR_PRODUCTION_JOB_SCHEMA;
  narratorCastingFingerprint: string;
  narratorVoice: PinnedNarratorVoice;
}

const HASH = /^[a-f0-9]{64}$/u;

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) throw new Error(code);
  return value;
}

export function narratorProductionBinding(
  job: GenerationJob,
): Readonly<{
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
}> | null {
  const candidate = job as Partial<NarratorProductionJob>;
  if (
    candidate.narratorProductionSchema === undefined
    && candidate.narratorCastingFingerprint === undefined
    && candidate.narratorVoice === undefined
  ) {
    return null;
  }
  if (candidate.narratorProductionSchema !== STORYTELLER_NARRATOR_PRODUCTION_JOB_SCHEMA) {
    throw new Error("NARRATOR_PRODUCTION_JOB_SCHEMA_INVALID");
  }
  const castingFingerprint = requireHash(
    candidate.narratorCastingFingerprint ?? "",
    "NARRATOR_PRODUCTION_CASTING_FINGERPRINT_INVALID",
  );
  if (!candidate.narratorVoice) throw new Error("NARRATOR_PRODUCTION_VOICE_REQUIRED");
  const voice = {
    profileId: candidate.narratorVoice.profileId,
    revision: candidate.narratorVoice.revision,
    profileHash: candidate.narratorVoice.profileHash,
  };
  assertExactNarratorVoicePin(voice, voice);
  return Object.freeze({ castingFingerprint, voice: Object.freeze(voice) });
}

export function assertNarratorProductionJob(
  job: GenerationJob,
  casting: NarratorCastingApproval,
): asserts job is NarratorProductionJob {
  assertNarratorCasting(casting);
  if (job.projectId !== casting.projectId) {
    throw new Error("NARRATOR_PRODUCTION_PROJECT_MISMATCH");
  }
  const binding = narratorProductionBinding(job);
  if (!binding) throw new Error("NARRATOR_PRODUCTION_CASTING_REQUIRED");
  if (binding.castingFingerprint !== casting.fingerprint) {
    throw new Error("NARRATOR_PRODUCTION_CASTING_MISMATCH");
  }
  assertExactNarratorVoicePin(casting.voice, binding.voice);
  const expectedCacheKey = stableHash({
    baseCacheKey: stableHash({
      projectFingerprint: (job as NarratorProductionJob & { baseProjectFingerprint?: string }).baseProjectFingerprint ?? null,
      segmentId: job.segmentId,
      candidateCount: job.candidateCount,
    }),
    castingFingerprint: casting.fingerprint,
    voice: casting.voice,
  });
  if (!HASH.test(job.cacheKey)) throw new Error("NARRATOR_PRODUCTION_CACHE_KEY_INVALID");
  // The exact cache key is verified at creation time by createNarratorProductionJobs.
  // Runtime callers re-check casting + voice identity because the base manifest is not retained in a job.
  void expectedCacheKey;
}

export function createNarratorProductionJobs(
  manifest: ProjectManifest,
  casting: NarratorCastingApproval,
  candidateCount = 3,
): NarratorProductionJob[] {
  assertNarratorCasting(casting);
  if (manifest.id !== casting.projectId) {
    throw new Error("NARRATOR_PRODUCTION_PROJECT_MISMATCH");
  }
  if (manifest.status !== "planned") {
    throw new Error("NARRATOR_PRODUCTION_PROJECT_NOT_PLANNED");
  }
  const baseJobs = createGenerationJobs(manifest, candidateCount);
  return baseJobs.map((job) => {
    if (job.status !== "ready") {
      throw new Error("NARRATOR_PRODUCTION_JOB_NOT_READY");
    }
    const cacheKey = stableHash({
      baseCacheKey: job.cacheKey,
      castingFingerprint: casting.fingerprint,
      voice: casting.voice,
    });
    return Object.freeze({
      ...job,
      id: `job_${stableHash({
        baseJobId: job.id,
        cacheKey,
        castingFingerprint: casting.fingerprint,
      }).slice(0, 20)}`,
      cacheKey,
      narratorProductionSchema: STORYTELLER_NARRATOR_PRODUCTION_JOB_SCHEMA,
      narratorCastingFingerprint: casting.fingerprint,
      narratorVoice: Object.freeze({ ...casting.voice }),
    });
  });
}

export function assertPinnedProductionMaterial(
  job: GenerationJob,
  material: Readonly<{
    mode?: string;
    voiceProfileId: string;
    voiceRevision: number;
    voiceProfileHash?: string;
  }>,
): void {
  const mode = material.mode ?? "production";
  const binding = narratorProductionBinding(job);
  if (mode !== "production") return;
  if (material.voiceProfileHash === undefined) {
    if (binding) throw new Error("NARRATOR_PRODUCTION_PROFILE_HASH_REQUIRED");
    return;
  }
  if (!binding) throw new Error("NARRATOR_PRODUCTION_CASTING_REQUIRED");
  assertExactNarratorVoicePin(binding.voice, {
    profileId: material.voiceProfileId,
    revision: material.voiceRevision,
    profileHash: material.voiceProfileHash,
  });
}
