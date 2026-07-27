import {
  ACX_AUDIOBOOK_PROFILE,
  LOSSLESS_PRODUCTION_PROFILE,
  type DeliveryProfile,
} from "@evavo/storyteller-engine";
import {
  createGenerationAudioEngineeringPolicy,
  generationAudioEngineeringPolicyPublicView,
  type GenerationAudioEngineeringPolicy,
  type GenerationAudioEngineeringPolicyPublicView,
} from "@evavo/storyteller-engine/generation-audio-engineering";
import type { AudioEngineeringRunner } from "@evavo/storyteller-engine/audio-engineering";
import type { WorkerEnvironment } from "./configuration.js";

export type WorkerAudioEngineeringProfileId =
  | "acx-audiobook"
  | "lossless-production";

export interface ResolveWorkerAudioEngineeringInput {
  workerEnabled: boolean;
  environment?: WorkerEnvironment;
  temporaryRoot?: string;
  runner?: AudioEngineeringRunner;
  now?: Date;
}

const PROFILE_PATTERN = /^(?:acx-audiobook|lossless-production)$/u;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

function required(
  value: string | undefined,
  maximum: number,
  code: string,
): string {
  const candidate = value?.trim() ?? "";
  if (
    !candidate
    || candidate.length > maximum
    || /[\u0000-\u001f\u007f]/u.test(candidate)
  ) {
    throw new Error(code);
  }
  return candidate;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(code);
  }
  return parsed;
}

function deliveryProfile(value: string | undefined): DeliveryProfile {
  const profileId = value?.trim().toLocaleLowerCase("en-AU") ?? "";
  if (!PROFILE_PATTERN.test(profileId)) {
    throw new Error("WORKER_AUDIO_ENGINEERING_PROFILE_INVALID");
  }
  return profileId === "acx-audiobook"
    ? ACX_AUDIOBOOK_PROFILE
    : LOSSLESS_PRODUCTION_PROFILE;
}

export function resolveWorkerAudioEngineeringPolicy(
  input: ResolveWorkerAudioEngineeringInput,
): GenerationAudioEngineeringPolicy | null {
  if (!input.workerEnabled) return null;
  const environment = input.environment ?? process.env;
  const profile = deliveryProfile(
    environment.STORYTELLER_AUDIO_ENGINEERING_PROFILE,
  );
  const externalVersion = required(
    environment.STORYTELLER_AUDIO_ENGINEERING_PROFILE_VERSION,
    128,
    "WORKER_AUDIO_ENGINEERING_PROFILE_VERSION_REQUIRED",
  );
  if (!VERSION_PATTERN.test(externalVersion)) {
    throw new Error("WORKER_AUDIO_ENGINEERING_PROFILE_VERSION_INVALID");
  }
  const reviewedAt = required(
    environment.STORYTELLER_AUDIO_ENGINEERING_PROFILE_REVIEWED_AT,
    100,
    "WORKER_AUDIO_ENGINEERING_PROFILE_REVIEWED_AT_REQUIRED",
  );
  const sourceReference = required(
    environment.STORYTELLER_AUDIO_ENGINEERING_PROFILE_SOURCE_REFERENCE,
    500,
    "WORKER_AUDIO_ENGINEERING_PROFILE_SOURCE_REQUIRED",
  );
  const temporaryRoot = required(
    input.temporaryRoot,
    4_000,
    "WORKER_AUDIO_ENGINEERING_TEMP_ROOT_REQUIRED",
  );
  return createGenerationAudioEngineeringPolicy({
    profile,
    externalVersion,
    reviewedAt,
    sourceReference,
    ...(input.runner ? { runner: input.runner } : {}),
    ffprobePath: environment.FFPROBE_PATH?.trim() || "ffprobe",
    ffmpegPath: environment.FFMPEG_PATH?.trim() || "ffmpeg",
    timeoutMs: boundedInteger(
      environment.STORYTELLER_AUDIO_ENGINEERING_TIMEOUT_MS,
      120_000,
      1_000,
      15 * 60_000,
      "WORKER_AUDIO_ENGINEERING_TIMEOUT_INVALID",
    ),
    maximumOutputBytes: boundedInteger(
      environment.STORYTELLER_AUDIO_ENGINEERING_MAX_OUTPUT_BYTES,
      8 * 1024 * 1024,
      1_024,
      64 * 1024 * 1024,
      "WORKER_AUDIO_ENGINEERING_OUTPUT_LIMIT_INVALID",
    ),
    temporaryRoot,
    ...(input.now ? { now: input.now } : {}),
  });
}

export function workerAudioEngineeringPolicySummary(
  policy: GenerationAudioEngineeringPolicy | null,
): Readonly<{
  enabled: boolean;
  profile?: GenerationAudioEngineeringPolicyPublicView;
}> {
  if (!policy) return Object.freeze({ enabled: false });
  return Object.freeze({
    enabled: true,
    profile: generationAudioEngineeringPolicyPublicView(policy),
  });
}
