import {
  assertAudioEngineeringEvidence,
  createAudioEngineeringProfileSnapshot,
  type AudioEngineeringProfileSnapshot,
  type AudioEngineeringRunner,
} from "./audio-engineering.js";
import type { DeliveryProfile } from "./index.js";

export interface GenerationAudioEngineeringPolicy {
  profile: AudioEngineeringProfileSnapshot;
  runner?: AudioEngineeringRunner;
  ffprobePath?: string;
  ffmpegPath?: string;
  timeoutMs?: number;
  maximumOutputBytes?: number;
  temporaryRoot?: string;
}

export interface GenerationAudioEngineeringPolicyPublicView {
  profileId: string;
  profileVersion: string;
  profileFingerprint: string;
  profileReviewedAt: string;
  runnerConfigured: boolean;
  commandTimeoutMs: number;
  maximumOutputBytes: number;
}

export class GenerationAudioEngineeringPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationAudioEngineeringPolicyError";
  }
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAXIMUM_OUTPUT_BYTES = 8 * 1024 * 1024;

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new GenerationAudioEngineeringPolicyError(code);
  }
  return value;
}

function optionalExecutable(value: string | undefined, code: string): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;
  if (candidate.length > 2_000 || candidate.includes("\0") || /[\r\n]/u.test(candidate)) {
    throw new GenerationAudioEngineeringPolicyError(code);
  }
  return candidate;
}

function optionalTemporaryRoot(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;
  if (candidate.length > 4_000 || candidate.includes("\0") || /[\r\n]/u.test(candidate)) {
    throw new GenerationAudioEngineeringPolicyError("GENERATION_AUDIO_ENGINEERING_TEMP_ROOT_INVALID");
  }
  return candidate;
}

export function createGenerationAudioEngineeringPolicy(input: Readonly<{
  profile: DeliveryProfile;
  externalVersion: string;
  reviewedAt: string;
  sourceReference: string;
  runner?: AudioEngineeringRunner;
  ffprobePath?: string;
  ffmpegPath?: string;
  timeoutMs?: number;
  maximumOutputBytes?: number;
  temporaryRoot?: string;
  now?: Date;
}>): GenerationAudioEngineeringPolicy {
  const profile = createAudioEngineeringProfileSnapshot({
    profile: input.profile,
    externalVersion: input.externalVersion,
    reviewedAt: input.reviewedAt,
    sourceReference: input.sourceReference,
    ...(input.now ? { now: input.now } : {}),
  });
  const policy = Object.freeze({
    profile,
    ...(input.runner ? { runner: input.runner } : {}),
    ...(optionalExecutable(
      input.ffprobePath,
      "GENERATION_AUDIO_ENGINEERING_FFPROBE_PATH_INVALID",
    ) ? { ffprobePath: input.ffprobePath!.trim() } : {}),
    ...(optionalExecutable(
      input.ffmpegPath,
      "GENERATION_AUDIO_ENGINEERING_FFMPEG_PATH_INVALID",
    ) ? { ffmpegPath: input.ffmpegPath!.trim() } : {}),
    timeoutMs: boundedInteger(
      input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      10,
      15 * 60_000,
      "GENERATION_AUDIO_ENGINEERING_TIMEOUT_INVALID",
    ),
    maximumOutputBytes: boundedInteger(
      input.maximumOutputBytes ?? DEFAULT_MAXIMUM_OUTPUT_BYTES,
      1,
      64 * 1024 * 1024,
      "GENERATION_AUDIO_ENGINEERING_OUTPUT_LIMIT_INVALID",
    ),
    ...(optionalTemporaryRoot(input.temporaryRoot)
      ? { temporaryRoot: input.temporaryRoot!.trim() }
      : {}),
  });
  assertGenerationAudioEngineeringPolicy(policy);
  return policy;
}

export function assertGenerationAudioEngineeringPolicy(
  policy: GenerationAudioEngineeringPolicy,
): void {
  const probe = createAudioEngineeringProfileSnapshot({
    profile: policy.profile.profile,
    externalVersion: policy.profile.externalVersion,
    reviewedAt: policy.profile.reviewedAt,
    sourceReference: policy.profile.sourceReference,
    now: new Date(Math.max(Date.now(), Date.parse(policy.profile.reviewedAt))),
  });
  if (probe.fingerprint !== policy.profile.fingerprint) {
    throw new GenerationAudioEngineeringPolicyError(
      "GENERATION_AUDIO_ENGINEERING_PROFILE_FINGERPRINT_INVALID",
    );
  }
  optionalExecutable(
    policy.ffprobePath,
    "GENERATION_AUDIO_ENGINEERING_FFPROBE_PATH_INVALID",
  );
  optionalExecutable(
    policy.ffmpegPath,
    "GENERATION_AUDIO_ENGINEERING_FFMPEG_PATH_INVALID",
  );
  boundedInteger(
    policy.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    10,
    15 * 60_000,
    "GENERATION_AUDIO_ENGINEERING_TIMEOUT_INVALID",
  );
  boundedInteger(
    policy.maximumOutputBytes ?? DEFAULT_MAXIMUM_OUTPUT_BYTES,
    1,
    64 * 1024 * 1024,
    "GENERATION_AUDIO_ENGINEERING_OUTPUT_LIMIT_INVALID",
  );
  optionalTemporaryRoot(policy.temporaryRoot);
}

export function generationAudioEngineeringPolicyPublicView(
  policy: GenerationAudioEngineeringPolicy,
): GenerationAudioEngineeringPolicyPublicView {
  assertGenerationAudioEngineeringPolicy(policy);
  return Object.freeze({
    profileId: policy.profile.profile.id,
    profileVersion: policy.profile.externalVersion,
    profileFingerprint: policy.profile.fingerprint,
    profileReviewedAt: policy.profile.reviewedAt,
    runnerConfigured: Boolean(policy.runner),
    commandTimeoutMs: policy.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maximumOutputBytes: policy.maximumOutputBytes ?? DEFAULT_MAXIMUM_OUTPUT_BYTES,
  });
}

export function assertEvidenceMatchesGenerationPolicy(
  policy: GenerationAudioEngineeringPolicy,
  evidence: Parameters<typeof assertAudioEngineeringEvidence>[0],
): void {
  assertGenerationAudioEngineeringPolicy(policy);
  assertAudioEngineeringEvidence(evidence);
  if (evidence.profile.fingerprint !== policy.profile.fingerprint) {
    throw new GenerationAudioEngineeringPolicyError(
      "GENERATION_AUDIO_ENGINEERING_EVIDENCE_PROFILE_MISMATCH",
    );
  }
}
