import {
  createGenerationJobs,
  stableHash,
  type GenerationJob,
  type ProjectManifest,
} from "./index.js";
import {
  assertAdmittedNarratorCasting,
  type AdmittedNarratorCasting,
} from "./narrator-casting-admission.js";
import {
  assertExactNarratorVoicePin,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";

export const STORYTELLER_NARRATOR_PRODUCTION_JOB_SCHEMA =
  "storyteller-narrator-production-job-v2" as const;

export interface NarratorProductionJob extends GenerationJob {
  narratorProductionSchema: typeof STORYTELLER_NARRATOR_PRODUCTION_JOB_SCHEMA;
  narratorProfileAdmissionHash: string;
  narratorAdmittedCastingFingerprint: string;
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
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
}> | null {
  const candidate = job as Partial<NarratorProductionJob>;
  if (
    candidate.narratorProductionSchema === undefined
    && candidate.narratorProfileAdmissionHash === undefined
    && candidate.narratorAdmittedCastingFingerprint === undefined
    && candidate.narratorCastingFingerprint === undefined
    && candidate.narratorVoice === undefined
  ) {
    return null;
  }
  if (candidate.narratorProductionSchema !== STORYTELLER_NARRATOR_PRODUCTION_JOB_SCHEMA) {
    throw new Error("NARRATOR_PRODUCTION_JOB_SCHEMA_INVALID");
  }
  const profileAdmissionHash = requireHash(
    candidate.narratorProfileAdmissionHash ?? "",
    "NARRATOR_PRODUCTION_PROFILE_ADMISSION_HASH_INVALID",
  );
  const admittedCastingFingerprint = requireHash(
    candidate.narratorAdmittedCastingFingerprint ?? "",
    "NARRATOR_PRODUCTION_ADMITTED_CASTING_FINGERPRINT_INVALID",
  );
  const castingFingerprint = requireHash(
    candidate.narratorCastingFingerprint ?? "",
    "NARRATOR_PRODUCTION_CASTING_FINGERPRINT_INVALID",
  );
  if (!candidate.narratorVoice) throw new Error("NARRATOR_PRODUCTION_VOICE_REQUIRED");
  const voice = Object.freeze({
    profileId: candidate.narratorVoice.profileId,
    revision: candidate.narratorVoice.revision,
    profileHash: candidate.narratorVoice.profileHash,
  });
  assertExactNarratorVoicePin(voice, voice);
  return Object.freeze({
    profileAdmissionHash,
    admittedCastingFingerprint,
    castingFingerprint,
    voice,
  });
}

export function assertNarratorProductionJob(
  job: GenerationJob,
  admittedCasting: AdmittedNarratorCasting,
): asserts job is NarratorProductionJob {
  assertAdmittedNarratorCasting(admittedCasting);
  const casting = admittedCasting.casting;
  if (job.projectId !== admittedCasting.projectId) {
    throw new Error("NARRATOR_PRODUCTION_PROJECT_MISMATCH");
  }
  const binding = narratorProductionBinding(job);
  if (!binding) throw new Error("NARRATOR_PRODUCTION_CASTING_ADMISSION_REQUIRED");
  if (binding.profileAdmissionHash !== admittedCasting.profileAdmission.admissionHash) {
    throw new Error("NARRATOR_PRODUCTION_PROFILE_ADMISSION_MISMATCH");
  }
  if (binding.admittedCastingFingerprint !== admittedCasting.fingerprint) {
    throw new Error("NARRATOR_PRODUCTION_ADMITTED_CASTING_MISMATCH");
  }
  if (binding.castingFingerprint !== casting.fingerprint) {
    throw new Error("NARRATOR_PRODUCTION_CASTING_MISMATCH");
  }
  assertExactNarratorVoicePin(casting.voice, binding.voice);
  requireHash(job.cacheKey, "NARRATOR_PRODUCTION_CACHE_KEY_INVALID");
}

export function createNarratorProductionJobs(
  manifest: ProjectManifest,
  admittedCasting: AdmittedNarratorCasting,
  candidateCount = 3,
): NarratorProductionJob[] {
  assertAdmittedNarratorCasting(admittedCasting);
  const casting = admittedCasting.casting;
  if (manifest.id !== admittedCasting.projectId) {
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
      profileAdmissionHash: admittedCasting.profileAdmission.admissionHash,
      admittedCastingFingerprint: admittedCasting.fingerprint,
      castingFingerprint: casting.fingerprint,
      voice: casting.voice,
    });
    return Object.freeze({
      ...job,
      id: `job_${stableHash({
        baseJobId: job.id,
        cacheKey,
        profileAdmissionHash: admittedCasting.profileAdmission.admissionHash,
        admittedCastingFingerprint: admittedCasting.fingerprint,
        castingFingerprint: casting.fingerprint,
      }).slice(0, 20)}`,
      cacheKey,
      narratorProductionSchema: STORYTELLER_NARRATOR_PRODUCTION_JOB_SCHEMA,
      narratorProfileAdmissionHash: admittedCasting.profileAdmission.admissionHash,
      narratorAdmittedCastingFingerprint: admittedCasting.fingerprint,
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
  if (!binding) throw new Error("NARRATOR_PRODUCTION_CASTING_ADMISSION_REQUIRED");
  assertExactNarratorVoicePin(binding.voice, {
    profileId: material.voiceProfileId,
    revision: material.voiceRevision,
    profileHash: material.voiceProfileHash,
  });
}
