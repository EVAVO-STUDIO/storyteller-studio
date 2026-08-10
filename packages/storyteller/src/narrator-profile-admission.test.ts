import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  AUDIO_STUDIO_NARRATOR_PROFILE_SCHEMA,
  type AudioStudioNarratorVoiceProfile,
} from "./narrator-voice-profile.js";
import {
  AUDIO_STUDIO_NARRATOR_PROFILE_ADMISSION_SCHEMA,
  AUDIO_STUDIO_NARRATOR_TRAINING_PROVENANCE_SCHEMA,
  approveNarratorCastingFromAdmission,
  assertNarratorProfileAdmission,
  narratorProfileAdmissionPublicView,
  type AudioStudioNarratorProfileAdmission,
  type AudioStudioNarratorTrainingProvenance,
} from "./narrator-profile-admission.js";

function digest(value: string): string {
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

function audioStudioHash(value: unknown): string {
  return createHash("sha256")
    .update(`${JSON.stringify(canonical(value))}\n`, "utf8")
    .digest("hex");
}

function profile(mode: "zero-shot" | "adapted" = "adapted"): AudioStudioNarratorVoiceProfile {
  const partial = {
    schema: AUDIO_STUDIO_NARRATOR_PROFILE_SCHEMA,
    profileId: "magician-narrator",
    revision: 4,
    voiceIdentityId: "magician-owner-authorised",
    engineKey: "qwen3-tts-1.7b-base-local",
    mode,
    modelArtifactTreeSha256: digest("model-tree"),
    decisionHash: digest("decision"),
    holdoutLedgerHash: digest("holdout-ledger"),
    finalHoldoutFingerprint: digest("final-holdout"),
    evidenceHash: digest("profile-evidence"),
    evidence: {
      sourceRightsFingerprint: digest("rights"),
      narratorDatasetFingerprint: digest("narrator-dataset"),
      referencePackFingerprint: digest("reference-pack"),
      benchmarkRunHash: digest("benchmark-run"),
      benchmarkCandidateHash: digest("benchmark-candidate"),
      textEvidenceHash: digest("text-evidence"),
      speakerIdentityEvidenceHash: digest("speaker-evidence"),
      acousticEvidenceHash: digest("acoustic-evidence"),
      blindReviewEvidenceHash: digest("blind-review"),
      renderEngineLockFingerprint: digest("render-engine-lock"),
      trainingEngineLockFingerprint:
        mode === "adapted" ? digest("training-engine-lock") : null,
    },
    rights: {
      commercialSynthesisAuthorized: true as const,
      sourceRightsFingerprint: digest("rights"),
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
  return { ...partial, profileHash: audioStudioHash(partial) };
}

function trainingProvenance(
  voice: AudioStudioNarratorVoiceProfile,
  overrides: Partial<Omit<AudioStudioNarratorTrainingProvenance, "provenanceHash">> = {},
): AudioStudioNarratorTrainingProvenance {
  const partial: Omit<AudioStudioNarratorTrainingProvenance, "provenanceHash"> = {
    schema: AUDIO_STUDIO_NARRATOR_TRAINING_PROVENANCE_SCHEMA,
    portfolioFingerprint: digest("training-portfolio"),
    campaignPlanHash: digest("campaign-plan"),
    adaptationPolicyFingerprint: digest("adaptation-policy"),
    campaignObjective: "best-long-form",
    capabilityId: "qwen3-tts-official-sft-full-model-causal-v2",
    capabilityHash: digest("capability"),
    method: "supervised-fine-tune",
    trainableScope: "full-model",
    recipeSource: "official-upstream",
    recipeEvidenceSha256: digest("recipe-evidence"),
    engineKey: voice.engineKey,
    engineRevision: "a".repeat(40),
    engineLockFingerprint: voice.evidence.trainingEngineLockFingerprint
      ?? digest("unexpected-zero-shot-lock"),
    adapterSha256: digest("training-adapter"),
    requestId: "magician-qwen3tts-run-004",
    requestHash: digest("training-request"),
    requestFileSha256: digest("training-request-file"),
    trainingReceiptHash: digest("training-receipt"),
    validationReportSha256: digest("validation-report-file"),
    validationReportHash: digest("validation-report"),
    selectedCheckpointId: "checkpoint-epoch-003",
    narratorDatasetFingerprint: voice.evidence.narratorDatasetFingerprint,
    narratorBindingFingerprint: digest("narrator-binding"),
    trainingDatasetFingerprint: digest("training-dataset"),
    trainingPartitionFingerprint: digest("training-partition"),
    validationDatasetFingerprint: digest("validation-dataset"),
    validationPartitionFingerprint: digest("validation-partition"),
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
    ...overrides,
  };
  return { ...partial, provenanceHash: audioStudioHash(partial) };
}

function admission(
  voice: AudioStudioNarratorVoiceProfile,
  training: AudioStudioNarratorTrainingProvenance | null,
): AudioStudioNarratorProfileAdmission {
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
  return { ...partial, admissionHash: audioStudioHash(partial) };
}

function rehashTraining(
  value: AudioStudioNarratorTrainingProvenance,
  changes: Partial<Omit<AudioStudioNarratorTrainingProvenance, "provenanceHash">>,
): AudioStudioNarratorTrainingProvenance {
  const { provenanceHash: _ignored, ...partial } = value;
  const changed = { ...partial, ...changes };
  return { ...changed, provenanceHash: audioStudioHash(changed) };
}

function rehashProfile(
  value: AudioStudioNarratorVoiceProfile,
  changes: Record<string, unknown>,
): AudioStudioNarratorVoiceProfile {
  const { profileHash: _ignored, ...partial } = value;
  const changed = { ...partial, ...changes };
  return {
    ...(changed as unknown as Omit<AudioStudioNarratorVoiceProfile, "profileHash">),
    profileHash: audioStudioHash(changed),
  };
}

test("admits one exact Audio Studio training portfolio, capability, checkpoint and profile chain", () => {
  const voice = profile();
  const training = trainingProvenance(voice);
  const value = admission(voice, training);

  assert.doesNotThrow(() => assertNarratorProfileAdmission(value));
  assert.equal(value.training?.selectedCheckpointId, "checkpoint-epoch-003");
  assert.equal(value.training?.campaignObjective, "best-long-form");
  assert.equal(value.training?.trainingReceiptGrantsCastingApproval, false);
  assert.equal(value.storyteller.castingApproved, false);
});

test("zero-shot admission contains no invented training provenance", () => {
  const value = admission(profile("zero-shot"), null);
  assert.doesNotThrow(() => assertNarratorProfileAdmission(value));
  const publicView = narratorProfileAdmissionPublicView(value);
  assert.equal(publicView.trainingProvenanceBound, false);
  assert.equal(publicView.trainingMethod, null);
  assert.equal(publicView.exactCheckpointBound, false);
});

test("adapted admission cannot omit training provenance", () => {
  const value = admission(profile("adapted"), null);
  assert.throws(
    () => assertNarratorProfileAdmission(value),
    /NARRATOR_PROFILE_ADMISSION_ADAPTED_TRAINING_REQUIRED/u,
  );
});

test("rehashing cannot substitute model tree, training lock or narrator dataset", () => {
  const voice = profile();
  const base = trainingProvenance(voice);
  for (const changed of [
    rehashTraining(base, { modelArtifactTreeSha256: digest("other-model") }),
    rehashTraining(base, { engineLockFingerprint: digest("other-training-lock") }),
    rehashTraining(base, { narratorDatasetFingerprint: digest("other-dataset") }),
  ]) {
    assert.throws(
      () => assertNarratorProfileAdmission(admission(voice, changed)),
      /NARRATOR_PROFILE_ADMISSION_TRAINING_BINDING_MISMATCH/u,
    );
  }
});

test("training method and scope remain semantically paired", () => {
  const voice = profile();
  const changed = trainingProvenance(voice, {
    method: "parameter-efficient",
    trainableScope: "full-model",
  });
  assert.throws(
    () => assertNarratorProfileAdmission(admission(voice, changed)),
    /NARRATOR_PROFILE_ADMISSION_TRAINING_METHOD_SCOPE_MISMATCH/u,
  );
});

test("private paths and undeclared evidence cannot be smuggled", () => {
  const baseVoice = profile();
  const privateEvidence = {
    ...baseVoice.evidence,
    modelPath: "D:/EVAVO-VoiceLab/private/models/magician",
  };
  const privateVoice = rehashProfile(baseVoice, { evidence: privateEvidence });
  assert.throws(
    () => assertNarratorProfileAdmission(
      admission(privateVoice, trainingProvenance(privateVoice)),
    ),
    /NARRATOR_PROFILE_ADMISSION_PRIVATE_FIELD:profile\.evidence\.modelPath/u,
  );

  const training = trainingProvenance(baseVoice);
  const undeclared = {
    ...training,
    privateLedgerHash: digest("undeclared"),
  } as unknown as AudioStudioNarratorTrainingProvenance;
  assert.throws(
    () => assertNarratorProfileAdmission(admission(baseVoice, undeclared)),
    /NARRATOR_PROFILE_ADMISSION_TRAINING_SHAPE_INVALID/u,
  );
});

test("casting consumes the admitted exact profile", () => {
  const voice = profile();
  const value = admission(voice, trainingProvenance(voice));
  const casting = approveNarratorCastingFromAdmission({
    projectId: "book_001",
    admission: value,
    approvedBy: "Greg",
    approvedAt: "2026-08-10T18:45:00+10:00",
  });
  assert.equal(casting.voice.profileId, voice.profileId);
  assert.equal(casting.voice.revision, voice.revision);
  assert.equal(casting.voice.profileHash, voice.profileHash);
  assert.equal(casting.defaultNarrator, false);
  assert.equal(casting.publicationAuthority, false);
});

test("public view proves admission without exposing checkpoint, dataset, lock or receipt evidence", () => {
  const voice = profile();
  const training = trainingProvenance(voice);
  const view = narratorProfileAdmissionPublicView(admission(voice, training));
  const serialized = JSON.stringify(view);

  assert.equal(view.trainingMethod, "supervised-fine-tune");
  assert.equal(view.trainableScope, "full-model");
  assert.equal(view.exactCheckpointBound, true);
  assert.equal(view.exactModelArtifactBound, true);
  assert.equal(view.castingApproved, false);
  assert.equal(view.publicationAuthority, false);
  assert.equal(serialized.includes(training.selectedCheckpointId), false);
  assert.equal(serialized.includes(training.trainingDatasetFingerprint), false);
  assert.equal(serialized.includes(training.engineLockFingerprint), false);
  assert.equal(serialized.includes(training.trainingReceiptHash), false);
});

test("training and admission fingerprints detect direct tampering", () => {
  const voice = profile();
  const training = trainingProvenance(voice);
  assert.throws(
    () => assertNarratorProfileAdmission(admission(voice, {
      ...training,
      selectedCheckpointId: "checkpoint-epoch-999",
    })),
    /NARRATOR_PROFILE_ADMISSION_TRAINING_FINGERPRINT_INVALID/u,
  );

  const value = admission(voice, training);
  assert.throws(
    () => assertNarratorProfileAdmission({
      ...value,
      profileRevision: value.profileRevision + 1,
    }),
    /NARRATOR_PROFILE_ADMISSION_PROFILE_BINDING_MISMATCH/u,
  );
});
