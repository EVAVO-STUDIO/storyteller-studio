import { createHash } from "node:crypto";
import {
  approveNarratorCasting,
  assertAudioStudioNarratorVoiceProfile,
  type AudioStudioNarratorVoiceProfile,
  type NarratorCastingApproval,
} from "./narrator-voice-profile.js";

export const AUDIO_STUDIO_NARRATOR_TRAINING_PROVENANCE_SCHEMA =
  "evavo_narrator_training_provenance_v1" as const;
export const AUDIO_STUDIO_NARRATOR_PROFILE_ADMISSION_SCHEMA =
  "evavo_storyteller_narrator_profile_admission_v1" as const;

export type AudioStudioNarratorTrainingMethod =
  | "supervised-fine-tune"
  | "parameter-efficient";
export type AudioStudioNarratorTrainableScope =
  | "full-model"
  | "parameter-efficient";
export type AudioStudioNarratorTrainingRecipeSource =
  | "official-upstream"
  | "evavo-reviewed-local";
export type AudioStudioNarratorTrainingPrecision = "bf16" | "fp16" | "fp32";
export type AudioStudioNarratorCampaignObjective =
  | "best-long-form"
  | "fastest-pilot"
  | "lowest-memory"
  | "multilingual"
  | "research-breadth";

export interface AudioStudioNarratorTrainingProvenance {
  schema: typeof AUDIO_STUDIO_NARRATOR_TRAINING_PROVENANCE_SCHEMA;
  portfolioFingerprint: string;
  campaignPlanHash: string;
  adaptationPolicyFingerprint: string;
  campaignObjective: AudioStudioNarratorCampaignObjective;
  capabilityId: string;
  capabilityHash: string;
  method: AudioStudioNarratorTrainingMethod;
  trainableScope: AudioStudioNarratorTrainableScope;
  recipeSource: AudioStudioNarratorTrainingRecipeSource;
  recipeEvidenceSha256: string;
  engineKey: string;
  engineRevision: string;
  engineLockFingerprint: string;
  adapterSha256: string;
  requestId: string;
  requestHash: string;
  requestFileSha256: string;
  trainingReceiptHash: string;
  validationReportSha256: string;
  validationReportHash: string;
  selectedCheckpointId: string;
  narratorDatasetFingerprint: string;
  narratorBindingFingerprint: string;
  trainingDatasetFingerprint: string;
  trainingPartitionFingerprint: string;
  validationDatasetFingerprint: string;
  validationPartitionFingerprint: string;
  modelArtifactTreeSha256: string;
  modelFileCount: number;
  modelTotalBytes: number;
  completedAt: string;
  minimumTrainingVramGb: number;
  recommendedTrainingVramGb: number;
  minimumSystemRamGb: number;
  minimumFreeDiskGb: number;
  precisionModes: readonly AudioStudioNarratorTrainingPrecision[];
  supportsResume: boolean;
  supportsGradientCheckpointing: boolean;
  resourceEstimateOnly: true;
  liveResourcePreflightRequired: true;
  trainingPartitionOnly: true;
  validationCheckpointSelectionOnly: true;
  protectedPartitionsExcluded: true;
  trainingReceiptGrantsListeningApproval: false;
  trainingReceiptGrantsCastingApproval: false;
  runtimeDownloadsAllowed: false;
  humanListeningApproval: false;
  publicationAuthority: false;
  provenanceHash: string;
}

export interface AudioStudioNarratorProfileAdmission {
  schema: typeof AUDIO_STUDIO_NARRATOR_PROFILE_ADMISSION_SCHEMA;
  profile: AudioStudioNarratorVoiceProfile;
  profileHash: string;
  profileId: string;
  profileRevision: number;
  engineKey: string;
  mode: AudioStudioNarratorVoiceProfile["mode"];
  modelArtifactTreeSha256: string;
  trainingProvenanceBound: boolean;
  training: AudioStudioNarratorTrainingProvenance | null;
  quality: Readonly<{
    shortFormTournamentPassed: true;
    continuousHoldoutPassed: true;
    humanListeningApproval: true;
    chapterListeningApprovalRequired: true;
    trainingDoesNotGrantQualityApproval: true;
  }>;
  storyteller: Readonly<{
    profileAdmissionEligible: true;
    castingApproved: false;
    defaultNarrator: false;
    exactRevisionRequired: true;
  }>;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  admissionHash: string;
}

export interface NarratorProfileAdmissionPublicView {
  profileId: string;
  profileRevision: number;
  engineKey: string;
  mode: AudioStudioNarratorVoiceProfile["mode"];
  trainingProvenanceBound: boolean;
  trainingMethod: AudioStudioNarratorTrainingMethod | null;
  trainableScope: AudioStudioNarratorTrainableScope | null;
  exactCheckpointBound: boolean;
  exactModelArtifactBound: true;
  humanListeningApproved: true;
  chapterListeningApprovalRequired: true;
  castingEligible: true;
  castingApproved: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  profileHash: string;
  admissionHash: string;
}

export class NarratorProfileAdmissionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NarratorProfileAdmissionError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const REVISION = /^[a-f0-9]{40}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const FORBIDDEN_ALIAS = /^(?:latest|current|default|auto|automatic|newest|production)$/iu;
const CAMPAIGN_OBJECTIVES = new Set<AudioStudioNarratorCampaignObjective>([
  "best-long-form",
  "fastest-pilot",
  "lowest-memory",
  "multilingual",
  "research-breadth",
]);
const PRECISION_MODES = new Set<AudioStudioNarratorTrainingPrecision>([
  "bf16",
  "fp16",
  "fp32",
]);
const PRIVATE_FIELD_NAMES = new Set([
  "path",
  "modelroot",
  "sourceroot",
  "datasetroot",
  "datasetmanifestpath",
  "narratordatasetmanifestpath",
  "narratordatasetpolicypath",
  "registrypath",
  "enginelockpath",
  "licenseevidencepath",
  "adapterpath",
  "outputdirectory",
  "validationreportpath",
  "audiopath",
  "transcript",
  "text",
  "expectedtext",
  "observedtext",
  "reviewerids",
  "rawreviewerid",
  "revieweridentity",
  "listeneridentity",
  "credential",
  "token",
  "stdout",
  "stderr",
  "command",
  "environment",
  "secrets",
]);

const TRAINING_KEYS = new Set([
  "schema",
  "portfolioFingerprint",
  "campaignPlanHash",
  "adaptationPolicyFingerprint",
  "campaignObjective",
  "capabilityId",
  "capabilityHash",
  "method",
  "trainableScope",
  "recipeSource",
  "recipeEvidenceSha256",
  "engineKey",
  "engineRevision",
  "engineLockFingerprint",
  "adapterSha256",
  "requestId",
  "requestHash",
  "requestFileSha256",
  "trainingReceiptHash",
  "validationReportSha256",
  "validationReportHash",
  "selectedCheckpointId",
  "narratorDatasetFingerprint",
  "narratorBindingFingerprint",
  "trainingDatasetFingerprint",
  "trainingPartitionFingerprint",
  "validationDatasetFingerprint",
  "validationPartitionFingerprint",
  "modelArtifactTreeSha256",
  "modelFileCount",
  "modelTotalBytes",
  "completedAt",
  "minimumTrainingVramGb",
  "recommendedTrainingVramGb",
  "minimumSystemRamGb",
  "minimumFreeDiskGb",
  "precisionModes",
  "supportsResume",
  "supportsGradientCheckpointing",
  "resourceEstimateOnly",
  "liveResourcePreflightRequired",
  "trainingPartitionOnly",
  "validationCheckpointSelectionOnly",
  "protectedPartitionsExcluded",
  "trainingReceiptGrantsListeningApproval",
  "trainingReceiptGrantsCastingApproval",
  "runtimeDownloadsAllowed",
  "humanListeningApproval",
  "publicationAuthority",
  "provenanceHash",
]);
const ADMISSION_KEYS = new Set([
  "schema",
  "profile",
  "profileHash",
  "profileId",
  "profileRevision",
  "engineKey",
  "mode",
  "modelArtifactTreeSha256",
  "trainingProvenanceBound",
  "training",
  "quality",
  "storyteller",
  "titleReleaseAuthority",
  "publicationAuthority",
  "admissionHash",
]);
const QUALITY_KEYS = new Set([
  "shortFormTournamentPassed",
  "continuousHoldoutPassed",
  "humanListeningApproval",
  "chapterListeningApprovalRequired",
  "trainingDoesNotGrantQualityApproval",
]);
const STORYTELLER_KEYS = new Set([
  "profileAdmissionEligible",
  "castingApproved",
  "defaultNarrator",
  "exactRevisionRequired",
]);

function canonicalAudioStudioValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalAudioStudioValue);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      result[key] = canonicalAudioStudioValue((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

function audioStudioHash(value: unknown): string {
  return createHash("sha256")
    .update(`${JSON.stringify(canonicalAudioStudioValue(value))}\n`, "utf8")
    .digest("hex");
}

function requireObject(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NarratorProfileAdmissionError(code);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
  code: string,
): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) {
    throw new NarratorProfileAdmissionError(code);
  }
}

function requireIdentifier(value: unknown, code: string): string {
  if (
    typeof value !== "string"
    || !IDENTIFIER.test(value)
    || FORBIDDEN_ALIAS.test(value)
  ) {
    throw new NarratorProfileAdmissionError(code);
  }
  return value;
}

function requireHash(value: unknown, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new NarratorProfileAdmissionError(code);
  }
  return value;
}

function requireRevision(value: unknown, code: string): string {
  if (typeof value !== "string" || !REVISION.test(value)) {
    throw new NarratorProfileAdmissionError(code);
  }
  return value;
}

function requireDate(value: unknown, code: string): string {
  if (
    typeof value !== "string"
    || value.length > 64
    || Number.isNaN(Date.parse(value))
  ) {
    throw new NarratorProfileAdmissionError(code);
  }
  return value;
}

function requireInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw new NarratorProfileAdmissionError(code);
  }
  return value;
}

function requireFinite(
  value: unknown,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < minimum
    || value > maximum
  ) {
    throw new NarratorProfileAdmissionError(code);
  }
  return value;
}

function requireBoolean(value: unknown, code: string): boolean {
  if (typeof value !== "boolean") {
    throw new NarratorProfileAdmissionError(code);
  }
  return value;
}

function requirePrecisionModes(value: unknown): readonly AudioStudioNarratorTrainingPrecision[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw new NarratorProfileAdmissionError("NARRATOR_PROFILE_ADMISSION_PRECISION_INVALID");
  }
  const modes = value.map((mode) => {
    if (typeof mode !== "string" || !PRECISION_MODES.has(mode as AudioStudioNarratorTrainingPrecision)) {
      throw new NarratorProfileAdmissionError("NARRATOR_PROFILE_ADMISSION_PRECISION_INVALID");
    }
    return mode as AudioStudioNarratorTrainingPrecision;
  });
  if (new Set(modes).size !== modes.length) {
    throw new NarratorProfileAdmissionError("NARRATOR_PROFILE_ADMISSION_PRECISION_INVALID");
  }
  return Object.freeze([...modes]);
}

function assertNoPrivateFields(value: unknown, trail: readonly string[] = []): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateFields(item, [...trail, String(index)]));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLocaleLowerCase("en-AU");
    if (
      PRIVATE_FIELD_NAMES.has(lower)
      || lower.endsWith("path")
      || lower.endsWith("root")
    ) {
      throw new NarratorProfileAdmissionError(
        `NARRATOR_PROFILE_ADMISSION_PRIVATE_FIELD:${[...trail, key].join(".")}`,
      );
    }
    assertNoPrivateFields(item, [...trail, key]);
  }
}

function assertTrainingProvenance(
  value: AudioStudioNarratorTrainingProvenance,
): void {
  const record = requireObject(
    value,
    "NARRATOR_PROFILE_ADMISSION_TRAINING_REQUIRED",
  );
  requireExactKeys(
    record,
    TRAINING_KEYS,
    "NARRATOR_PROFILE_ADMISSION_TRAINING_SHAPE_INVALID",
  );
  if (value.schema !== AUDIO_STUDIO_NARRATOR_TRAINING_PROVENANCE_SCHEMA) {
    throw new NarratorProfileAdmissionError(
      "NARRATOR_PROFILE_ADMISSION_TRAINING_SCHEMA_UNSUPPORTED",
    );
  }
  for (const hash of [
    value.portfolioFingerprint,
    value.campaignPlanHash,
    value.adaptationPolicyFingerprint,
    value.capabilityHash,
    value.recipeEvidenceSha256,
    value.engineLockFingerprint,
    value.adapterSha256,
    value.requestHash,
    value.requestFileSha256,
    value.trainingReceiptHash,
    value.validationReportSha256,
    value.validationReportHash,
    value.narratorDatasetFingerprint,
    value.narratorBindingFingerprint,
    value.trainingDatasetFingerprint,
    value.trainingPartitionFingerprint,
    value.validationDatasetFingerprint,
    value.validationPartitionFingerprint,
    value.modelArtifactTreeSha256,
    value.provenanceHash,
  ]) requireHash(hash, "NARRATOR_PROFILE_ADMISSION_TRAINING_HASH_INVALID");
  for (const identifier of [
    value.capabilityId,
    value.engineKey,
    value.requestId,
    value.selectedCheckpointId,
  ]) requireIdentifier(identifier, "NARRATOR_PROFILE_ADMISSION_TRAINING_ID_INVALID");
  requireRevision(
    value.engineRevision,
    "NARRATOR_PROFILE_ADMISSION_ENGINE_REVISION_INVALID",
  );
  if (!CAMPAIGN_OBJECTIVES.has(value.campaignObjective)) {
    throw new NarratorProfileAdmissionError(
      "NARRATOR_PROFILE_ADMISSION_CAMPAIGN_OBJECTIVE_INVALID",
    );
  }
  if (
    value.method !== "supervised-fine-tune"
    && value.method !== "parameter-efficient"
  ) {
    throw new NarratorProfileAdmissionError(
      "NARRATOR_PROFILE_ADMISSION_TRAINING_METHOD_INVALID",
    );
  }
  if (
    value.trainableScope !== "full-model"
    && value.trainableScope !== "parameter-efficient"
  ) {
    throw new NarratorProfileAdmissionError(
      "NARRATOR_PROFILE_ADMISSION_TRAINING_SCOPE_INVALID",
    );
  }
  if (
    (value.method === "supervised-fine-tune") !== (value.trainableScope === "full-model")
    || (value.method === "parameter-efficient")
      !== (value.trainableScope === "parameter-efficient")
  ) {
    throw new NarratorProfileAdmissionError(
      "NARRATOR_PROFILE_ADMISSION_TRAINING_METHOD_SCOPE_MISMATCH",
    );
  }
  if (
    value.recipeSource !== "official-upstream"
    && value.recipeSource !== "evavo-reviewed-local"
  ) {
    throw new NarratorProfileAdmissionError(
      "NARRATOR_PROFILE_ADMISSION_RECIPE_SOURCE_INVALID",
    );
  }
  requireDate(value.completedAt, "NARRATOR_PROFILE_ADMISSION_TRAINING_DATE_INVALID");
  requireInteger(
    value.modelFileCount,
    1,
    10_000_000,
    "NARRATOR_PROFILE_ADMISSION_MODEL_FILE_COUNT_INVALID",
  );
  requireInteger(
    value.modelTotalBytes,
    1,
    Number.MAX_SAFE_INTEGER,
    "NARRATOR_PROFILE_ADMISSION_MODEL_SIZE_INVALID",
  );
  const minimumVram = requireFinite(
    value.minimumTrainingVramGb,
    0,
    256,
    "NARRATOR_PROFILE_ADMISSION_MINIMUM_VRAM_INVALID",
  );
  requireFinite(
    value.recommendedTrainingVramGb,
    minimumVram,
    256,
    "NARRATOR_PROFILE_ADMISSION_RECOMMENDED_VRAM_INVALID",
  );
  requireFinite(
    value.minimumSystemRamGb,
    1,
    1_024,
    "NARRATOR_PROFILE_ADMISSION_SYSTEM_RAM_INVALID",
  );
  requireFinite(
    value.minimumFreeDiskGb,
    1,
    4_096,
    "NARRATOR_PROFILE_ADMISSION_FREE_DISK_INVALID",
  );
  requirePrecisionModes(value.precisionModes);
  requireBoolean(value.supportsResume, "NARRATOR_PROFILE_ADMISSION_RESUME_INVALID");
  requireBoolean(
    value.supportsGradientCheckpointing,
    "NARRATOR_PROFILE_ADMISSION_GRADIENT_CHECKPOINTING_INVALID",
  );
  if (
    value.resourceEstimateOnly !== true
    || value.liveResourcePreflightRequired !== true
    || value.trainingPartitionOnly !== true
    || value.validationCheckpointSelectionOnly !== true
    || value.protectedPartitionsExcluded !== true
    || value.trainingReceiptGrantsListeningApproval !== false
    || value.trainingReceiptGrantsCastingApproval !== false
    || value.runtimeDownloadsAllowed !== false
    || value.humanListeningApproval !== false
    || value.publicationAuthority !== false
  ) {
    throw new NarratorProfileAdmissionError(
      "NARRATOR_PROFILE_ADMISSION_TRAINING_AUTHORITY_INVALID",
    );
  }
  const { provenanceHash, ...partial } = value;
  if (provenanceHash !== audioStudioHash(partial)) {
    throw new NarratorProfileAdmissionError(
      "NARRATOR_PROFILE_ADMISSION_TRAINING_FINGERPRINT_INVALID",
    );
  }
}

export function assertNarratorProfileAdmission(
  value: AudioStudioNarratorProfileAdmission,
): void {
  const record = requireObject(
    value,
    "NARRATOR_PROFILE_ADMISSION_REQUIRED",
  );
  requireExactKeys(
    record,
    ADMISSION_KEYS,
    "NARRATOR_PROFILE_ADMISSION_SHAPE_INVALID",
  );
  if (value.schema !== AUDIO_STUDIO_NARRATOR_PROFILE_ADMISSION_SCHEMA) {
    throw new NarratorProfileAdmissionError(
      "NARRATOR_PROFILE_ADMISSION_SCHEMA_UNSUPPORTED",
    );
  }
  assertAudioStudioNarratorVoiceProfile(value.profile);
  requireHash(value.profileHash, "NARRATOR_PROFILE_ADMISSION_PROFILE_HASH_INVALID");
  requireIdentifier(value.profileId, "NARRATOR_PROFILE_ADMISSION_PROFILE_ID_INVALID");
  requireInteger(
    value.profileRevision,
    1,
    999_999,
    "NARRATOR_PROFILE_ADMISSION_PROFILE_REVISION_INVALID",
  );
  requireIdentifier(value.engineKey, "NARRATOR_PROFILE_ADMISSION_ENGINE_INVALID");
  requireHash(
    value.modelArtifactTreeSha256,
    "NARRATOR_PROFILE_ADMISSION_MODEL_HASH_INVALID",
  );
  requireBoolean(
    value.trainingProvenanceBound,
    "NARRATOR_PROFILE_ADMISSION_TRAINING_BOUND_INVALID",
  );
  if (
    value.profileHash !== value.profile.profileHash
    || value.profileId !== value.profile.profileId
    || value.profileRevision !== value.profile.revision
    || value.engineKey !== value.profile.engineKey
    || value.mode !== value.profile.mode
    || value.modelArtifactTreeSha256 !== value.profile.modelArtifactTreeSha256
  ) {
    throw new NarratorProfileAdmissionError(
      "NARRATOR_PROFILE_ADMISSION_PROFILE_BINDING_MISMATCH",
    );
  }

  if (value.profile.mode === "zero-shot") {
    if (value.trainingProvenanceBound || value.training !== null) {
      throw new NarratorProfileAdmissionError(
        "NARRATOR_PROFILE_ADMISSION_ZERO_SHOT_TRAINING_FORBIDDEN",
      );
    }
  } else {
    if (!value.trainingProvenanceBound || value.training === null) {
      throw new NarratorProfileAdmissionError(
        "NARRATOR_PROFILE_ADMISSION_ADAPTED_TRAINING_REQUIRED",
      );
    }
    assertTrainingProvenance(value.training);
    if (
      value.training.engineKey !== value.profile.engineKey
      || value.training.modelArtifactTreeSha256
        !== value.profile.modelArtifactTreeSha256
      || value.training.engineLockFingerprint
        !== value.profile.evidence.trainingEngineLockFingerprint
      || value.training.narratorDatasetFingerprint
        !== value.profile.evidence.narratorDatasetFingerprint
    ) {
      throw new NarratorProfileAdmissionError(
        "NARRATOR_PROFILE_ADMISSION_TRAINING_BINDING_MISMATCH",
      );
    }
  }

  const quality = requireObject(
    value.quality,
    "NARRATOR_PROFILE_ADMISSION_QUALITY_REQUIRED",
  );
  requireExactKeys(
    quality,
    QUALITY_KEYS,
    "NARRATOR_PROFILE_ADMISSION_QUALITY_SHAPE_INVALID",
  );
  if (
    value.quality.shortFormTournamentPassed !== true
    || value.quality.continuousHoldoutPassed !== true
    || value.quality.humanListeningApproval !== true
    || value.quality.chapterListeningApprovalRequired !== true
    || value.quality.trainingDoesNotGrantQualityApproval !== true
  ) {
    throw new NarratorProfileAdmissionError(
      "NARRATOR_PROFILE_ADMISSION_QUALITY_INVALID",
    );
  }
  const storyteller = requireObject(
    value.storyteller,
    "NARRATOR_PROFILE_ADMISSION_STORYTELLER_REQUIRED",
  );
  requireExactKeys(
    storyteller,
    STORYTELLER_KEYS,
    "NARRATOR_PROFILE_ADMISSION_STORYTELLER_SHAPE_INVALID",
  );
  if (
    value.storyteller.profileAdmissionEligible !== true
    || value.storyteller.castingApproved !== false
    || value.storyteller.defaultNarrator !== false
    || value.storyteller.exactRevisionRequired !== true
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new NarratorProfileAdmissionError(
      "NARRATOR_PROFILE_ADMISSION_AUTHORITY_INVALID",
    );
  }
  assertNoPrivateFields(value);
  const { admissionHash, ...partial } = value;
  if (!HASH.test(admissionHash) || admissionHash !== audioStudioHash(partial)) {
    throw new NarratorProfileAdmissionError(
      "NARRATOR_PROFILE_ADMISSION_FINGERPRINT_INVALID",
    );
  }
}

export function approveNarratorCastingFromAdmission(input: Readonly<{
  projectId: string;
  admission: AudioStudioNarratorProfileAdmission;
  approvedBy: string;
  approvedAt: string;
}>): NarratorCastingApproval {
  assertNarratorProfileAdmission(input.admission);
  return approveNarratorCasting({
    projectId: input.projectId,
    profile: input.admission.profile,
    approvedBy: input.approvedBy,
    approvedAt: input.approvedAt,
  });
}

export function narratorProfileAdmissionPublicView(
  value: AudioStudioNarratorProfileAdmission,
): NarratorProfileAdmissionPublicView {
  assertNarratorProfileAdmission(value);
  return Object.freeze({
    profileId: value.profileId,
    profileRevision: value.profileRevision,
    engineKey: value.engineKey,
    mode: value.mode,
    trainingProvenanceBound: value.trainingProvenanceBound,
    trainingMethod: value.training?.method ?? null,
    trainableScope: value.training?.trainableScope ?? null,
    exactCheckpointBound: value.training !== null,
    exactModelArtifactBound: true,
    humanListeningApproved: true,
    chapterListeningApprovalRequired: true,
    castingEligible: true,
    castingApproved: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    profileHash: value.profileHash,
    admissionHash: value.admissionHash,
  });
}
