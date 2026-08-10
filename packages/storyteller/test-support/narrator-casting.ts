import { createHash } from "node:crypto";
import { stableHash } from "../src/index.js";
import {
  approveAdmittedNarratorCasting,
  type AdmittedNarratorCasting,
} from "../src/narrator-casting-admission.js";
import {
  AUDIO_STUDIO_NARRATOR_PROFILE_ADMISSION_SCHEMA,
  AUDIO_STUDIO_NARRATOR_TRAINING_PROVENANCE_SCHEMA,
  type AudioStudioNarratorProfileAdmission,
  type AudioStudioNarratorTrainingProvenance,
} from "../src/narrator-profile-admission.js";
import {
  AUDIO_STUDIO_NARRATOR_PROFILE_SCHEMA,
  type AudioStudioNarratorVoiceProfile,
} from "../src/narrator-voice-profile.js";

export interface TestNarratorAdmissionOptions {
  mode?: "zero-shot" | "adapted";
  profileRevision?: number;
  seed?: string;
}

export interface TestAdmittedNarratorCastingOptions extends TestNarratorAdmissionOptions {
  approvedBy?: string;
  approvedAt?: string;
}

export function testDigest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      result[key] = canonical((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

export function testAudioStudioHash(value: unknown): string {
  return createHash("sha256")
    .update(`${JSON.stringify(canonical(value))}\n`, "utf8")
    .digest("hex");
}

function narratorProfile(
  options: TestNarratorAdmissionOptions = {},
): AudioStudioNarratorVoiceProfile {
  const mode = options.mode ?? "adapted";
  const seed = options.seed ?? "magician";
  const partial = {
    schema: AUDIO_STUDIO_NARRATOR_PROFILE_SCHEMA,
    profileId: "magician-narrator",
    revision: options.profileRevision ?? 4,
    voiceIdentityId: "magician-owner-authorised",
    engineKey: "qwen3-tts-1.7b-base-local",
    mode,
    modelArtifactTreeSha256: testDigest(`${seed}:model-tree`),
    decisionHash: testDigest(`${seed}:decision`),
    holdoutLedgerHash: testDigest(`${seed}:holdout-ledger`),
    finalHoldoutFingerprint: testDigest(`${seed}:final-holdout`),
    evidenceHash: testDigest(`${seed}:profile-evidence`),
    evidence: {
      sourceRightsFingerprint: testDigest(`${seed}:rights`),
      narratorDatasetFingerprint: testDigest(`${seed}:narrator-dataset`),
      referencePackFingerprint: testDigest(`${seed}:reference-pack`),
      benchmarkRunHash: testDigest(`${seed}:benchmark-run`),
      benchmarkCandidateHash: testDigest(`${seed}:benchmark-candidate`),
      textEvidenceHash: testDigest(`${seed}:text-evidence`),
      speakerIdentityEvidenceHash: testDigest(`${seed}:speaker-evidence`),
      acousticEvidenceHash: testDigest(`${seed}:acoustic-evidence`),
      blindReviewEvidenceHash: testDigest(`${seed}:blind-review`),
      renderEngineLockFingerprint: testDigest(`${seed}:render-engine-lock`),
      trainingEngineLockFingerprint:
        mode === "adapted" ? testDigest(`${seed}:training-engine-lock`) : null,
    },
    rights: {
      commercialSynthesisAuthorized: true as const,
      sourceRightsFingerprint: testDigest(`${seed}:rights`),
    },
    quality: {
      shortFormTournamentPassed: true as const,
      continuousHoldoutPassed: true as const,
      humanListeningApproval: true as const,
      chapterListeningApprovalRequired: true as const,
    },
    storyteller: {
      castingEligible: true as const,
      castingApproved: false as const,
      defaultNarrator: false as const,
      exactRevisionRequired: true as const,
    },
    runtimeDownloadsAllowed: false as const,
    titleReleaseAuthority: false as const,
    publicationAuthority: false as const,
  };
  return { ...partial, profileHash: testAudioStudioHash(partial) };
}

function narratorTrainingProvenance(
  voice: AudioStudioNarratorVoiceProfile,
  seed: string,
): AudioStudioNarratorTrainingProvenance {
  if (voice.mode !== "adapted" || voice.evidence.trainingEngineLockFingerprint === null) {
    throw new Error("TEST_ADAPTED_NARRATOR_PROFILE_REQUIRED");
  }
  const partial: Omit<AudioStudioNarratorTrainingProvenance, "provenanceHash"> = {
    schema: AUDIO_STUDIO_NARRATOR_TRAINING_PROVENANCE_SCHEMA,
    portfolioFingerprint: testDigest(`${seed}:training-portfolio`),
    campaignPlanHash: testDigest(`${seed}:campaign-plan`),
    adaptationPolicyFingerprint: testDigest(`${seed}:adaptation-policy`),
    campaignObjective: "best-long-form",
    capabilityId: "qwen3-tts-official-sft-full-model-causal-v2",
    capabilityHash: testDigest(`${seed}:capability`),
    method: "supervised-fine-tune",
    trainableScope: "full-model",
    recipeSource: "official-upstream",
    recipeEvidenceSha256: testDigest(`${seed}:recipe-evidence`),
    engineKey: voice.engineKey,
    engineRevision: "a".repeat(40),
    engineLockFingerprint: voice.evidence.trainingEngineLockFingerprint,
    adapterSha256: testDigest(`${seed}:training-adapter`),
    requestId: `magician-qwen3tts-${seed.replace(/[^A-Za-z0-9._:-]/gu, "-")}`,
    requestHash: testDigest(`${seed}:training-request`),
    requestFileSha256: testDigest(`${seed}:training-request-file`),
    trainingReceiptHash: testDigest(`${seed}:training-receipt`),
    validationReportSha256: testDigest(`${seed}:validation-report-file`),
    validationReportHash: testDigest(`${seed}:validation-report`),
    selectedCheckpointId: "checkpoint-epoch-003",
    narratorDatasetFingerprint: voice.evidence.narratorDatasetFingerprint,
    narratorBindingFingerprint: testDigest(`${seed}:narrator-binding`),
    trainingDatasetFingerprint: testDigest(`${seed}:training-dataset`),
    trainingPartitionFingerprint: testDigest(`${seed}:training-partition`),
    validationDatasetFingerprint: testDigest(`${seed}:validation-dataset`),
    validationPartitionFingerprint: testDigest(`${seed}:validation-partition`),
    modelArtifactTreeSha256: voice.modelArtifactTreeSha256,
    modelFileCount: 42,
    modelTotalBytes: 8_000_000_000,
    completedAt: "2026-08-10T18:20:00+10:00",
    minimumTrainingVramGb: 24,
    recommendedTrainingVramGb: 32,
    minimumSystemRamGb: 64,
    minimumFreeDiskGb: 80,
    precisionModes: ["bf16"],
    supportsResume: true,
    supportsGradientCheckpointing: true,
    resourceEstimateOnly: true,
    liveResourcePreflightRequired: true,
    trainingPartitionOnly: true,
    validationCheckpointSelectionOnly: true,
    protectedPartitionsExcluded: true,
    trainingReceiptGrantsListeningApproval: false,
    trainingReceiptGrantsCastingApproval: false,
    runtimeDownloadsAllowed: false,
    humanListeningApproval: false,
    publicationAuthority: false,
  };
  return { ...partial, provenanceHash: testAudioStudioHash(partial) };
}

export function createTestNarratorProfileAdmission(
  options: TestNarratorAdmissionOptions = {},
): AudioStudioNarratorProfileAdmission {
  const seed = options.seed ?? "magician";
  const voice = narratorProfile(options);
  const training = voice.mode === "adapted"
    ? narratorTrainingProvenance(voice, seed)
    : null;
  const partial: Omit<AudioStudioNarratorProfileAdmission, "admissionHash"> = {
    schema: AUDIO_STUDIO_NARRATOR_PROFILE_ADMISSION_SCHEMA,
    profile: voice,
    profileHash: voice.profileHash,
    profileId: voice.profileId,
    profileRevision: voice.revision,
    engineKey: voice.engineKey,
    mode: voice.mode,
    modelArtifactTreeSha256: voice.modelArtifactTreeSha256,
    trainingProvenanceBound: training !== null,
    training,
    quality: {
      shortFormTournamentPassed: true,
      continuousHoldoutPassed: true,
      humanListeningApproval: true,
      chapterListeningApprovalRequired: true,
      trainingDoesNotGrantQualityApproval: true,
    },
    storyteller: {
      profileAdmissionEligible: true,
      castingApproved: false,
      defaultNarrator: false,
      exactRevisionRequired: true,
    },
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  return { ...partial, admissionHash: testAudioStudioHash(partial) };
}

export function createTestAdmittedNarratorCasting(
  projectId: string,
  options: TestAdmittedNarratorCastingOptions = {},
): AdmittedNarratorCasting {
  return approveAdmittedNarratorCasting({
    projectId,
    admission: createTestNarratorProfileAdmission(options),
    approvedBy: options.approvedBy ?? "storyteller-casting-editor",
    approvedAt: options.approvedAt ?? "2026-08-10T18:45:00+10:00",
  });
}

export function rehashTestAdmittedNarratorCasting(
  value: AdmittedNarratorCasting,
): AdmittedNarratorCasting {
  const { fingerprint: _ignored, ...partial } = value;
  return { ...partial, fingerprint: stableHash(partial) };
}
