import { AUDIO_STUDIO_PROVIDER_ID } from "./audio-studio-types.js";
import {
  stableHash,
  type GenerationJob,
  type PerformanceDirection,
} from "./index.js";
import {
  assertExpressivePerformancePlan,
  assertExpressiveVoiceRoleBinding,
  type ExpressivePerformancePlan,
  type ExpressiveVoiceRoleBinding,
} from "./narration-expressive-performance.js";
import type { ProviderExecutionMode } from "./provider-adapter.js";

export const EXPRESSIVE_GENERATION_BINDING_SCHEMA =
  "storyteller-expressive-generation-binding-v1" as const;

export interface ExpressiveGenerationBinding {
  schemaVersion: typeof EXPRESSIVE_GENERATION_BINDING_SCHEMA;
  role: ExpressiveVoiceRoleBinding;
  plan: ExpressivePerformancePlan;
  fingerprint: string;
}

export interface ExpressiveGenerationMaterialView {
  voiceProfileId: string;
  voiceRevision: number;
  voiceProfileHash?: string;
  direction: PerformanceDirection;
  mode?: ProviderExecutionMode;
  expressivePerformance?: ExpressiveGenerationBinding;
}

export interface ExpressiveGenerationBindingPublicView {
  expressiveGenerationBindingFingerprint: string;
  expressivePerformancePlanFingerprint: string;
  expressiveRoleBindingFingerprint: string;
  expressiveRoleKind: "narrator" | "character";
  expressiveVoiceStrategy: "dedicated-voice" | "performance-variation";
  expressiveCharacterScoped: boolean;
}

const HASH = /^[a-f0-9]{64}$/u;

function bindingBase(
  value: Omit<ExpressiveGenerationBinding, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: value.schemaVersion,
    role: value.role,
    plan: value.plan,
  };
}

function sameVoice(
  left: Readonly<{ profileId: string; revision: number; profileHash: string }>,
  right: Readonly<{ profileId: string; revision: number; profileHash: string }>,
): boolean {
  return left.profileId === right.profileId
    && left.revision === right.revision
    && left.profileHash === right.profileHash;
}

export function createExpressiveGenerationBinding(input: Readonly<{
  role: ExpressiveVoiceRoleBinding;
  plan: ExpressivePerformancePlan;
  direction?: PerformanceDirection;
}>): ExpressiveGenerationBinding {
  assertExpressiveVoiceRoleBinding(input.role);
  assertExpressivePerformancePlan(input.plan, input.role, input.direction);
  const partial: Omit<ExpressiveGenerationBinding, "fingerprint"> = {
    schemaVersion: EXPRESSIVE_GENERATION_BINDING_SCHEMA,
    role: input.role,
    plan: input.plan,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(bindingBase(partial)),
  });
}

export function assertExpressiveGenerationBinding(
  value: ExpressiveGenerationBinding,
  direction?: PerformanceDirection,
): void {
  if (value.schemaVersion !== EXPRESSIVE_GENERATION_BINDING_SCHEMA) {
    throw new Error("EXPRESSIVE_GENERATION_BINDING_SCHEMA_UNSUPPORTED");
  }
  assertExpressiveVoiceRoleBinding(value.role);
  assertExpressivePerformancePlan(value.plan, value.role, direction);
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(bindingBase(partial))) {
    throw new Error("EXPRESSIVE_GENERATION_BINDING_FINGERPRINT_INVALID");
  }
}

export function assertExpressiveWorkerInput(
  job: GenerationJob,
  material: ExpressiveGenerationMaterialView,
): void {
  const mode = material.mode ?? "production";
  const usesAudioStudio = job.providerFallbackIds.includes(AUDIO_STUDIO_PROVIDER_ID);
  const binding = material.expressivePerformance;

  if (!binding) {
    if (mode === "production" && usesAudioStudio) {
      throw new Error("EXPRESSIVE_PRODUCTION_BINDING_REQUIRED");
    }
    return;
  }

  assertExpressiveGenerationBinding(binding, material.direction);
  if (
    binding.role.projectId !== job.projectId
    || binding.plan.projectId !== job.projectId
  ) {
    throw new Error("EXPRESSIVE_GENERATION_PROJECT_MISMATCH");
  }
  if (
    binding.plan.segmentId !== job.segmentId
    || material.direction.segmentId !== job.segmentId
  ) {
    throw new Error("EXPRESSIVE_GENERATION_SEGMENT_MISMATCH");
  }
  if (job.candidateCount < binding.plan.minimumCandidateCount) {
    throw new Error("EXPRESSIVE_GENERATION_CANDIDATE_COUNT_INSUFFICIENT");
  }
  if (
    material.voiceProfileHash === undefined
    || !sameVoice(
      {
        profileId: material.voiceProfileId,
        revision: material.voiceRevision,
        profileHash: material.voiceProfileHash,
      },
      binding.role.voice,
    )
  ) {
    throw new Error("EXPRESSIVE_GENERATION_VOICE_PIN_MISMATCH");
  }
  if (
    binding.role.genericFallbackAllowed !== false
    || binding.plan.genericFallbackAllowed !== false
    || binding.plan.preserveVoiceIdentity !== true
  ) {
    throw new Error("EXPRESSIVE_GENERATION_POLICY_INVALID");
  }
}

export function normaliseExpressiveGenerationBinding(
  value: ExpressiveGenerationBinding,
  direction?: PerformanceDirection,
): ExpressiveGenerationBinding {
  assertExpressiveGenerationBinding(value, direction);
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    role: Object.freeze({
      ...value.role,
      voice: Object.freeze({ ...value.role.voice }),
    }),
    plan: Object.freeze({
      ...value.plan,
      voice: Object.freeze({ ...value.plan.voice }),
      cadence: Object.freeze({ ...value.plan.cadence }),
      requiredProviderFeatures: Object.freeze(["style-instructions"] as const),
      quality: Object.freeze({ ...value.plan.quality }),
    }),
    fingerprint: value.fingerprint,
  });
}

export function expressiveGenerationBindingPublicView(
  value: ExpressiveGenerationBinding,
): ExpressiveGenerationBindingPublicView {
  assertExpressiveGenerationBinding(value);
  return Object.freeze({
    expressiveGenerationBindingFingerprint: value.fingerprint,
    expressivePerformancePlanFingerprint: value.plan.fingerprint,
    expressiveRoleBindingFingerprint: value.role.fingerprint,
    expressiveRoleKind: value.role.roleKind,
    expressiveVoiceStrategy: value.role.voiceStrategy,
    expressiveCharacterScoped: value.role.roleKind === "character",
  });
}
