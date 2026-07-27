import assert from "node:assert/strict";
import test from "node:test";
import {
  ACX_AUDIOBOOK_PROFILE,
  assessCandidateTake,
  assessContinuity,
  assessTranscriptFidelity,
  buildVisualBeatPlan,
  createProjectManifest,
  rankProviders,
  segmentManuscript,
  validateVoiceRights,
  type ProviderProfile,
  type VoiceRightsEvidence,
} from "./index.js";

const safeRights: VoiceRightsEvidence = {
  id: "rights_original_001",
  voiceLabel: "Original designed narrator",
  sourceKind: "synthetic-designed",
  allowedUses: ["audiobook", "visual-companion"],
  commercialUseApproved: true,
  craftReferences: [
    {
      name: "ensemble oral storytelling",
      principles: ["clear listener relationship", "restrained character differentiation", "silence carries dramatic meaning"],
    },
  ],
};

const providers: ProviderProfile[] = [
  {
    id: "provider-capable",
    label: "Capability-complete provider",
    features: ["batch-long-form", "pronunciation-dictionary", "word-timestamps", "style-instructions"],
    maximumInputCharacters: 10_000,
    regions: ["australia"],
    storesInputs: false,
    trainsOnCustomerData: false,
    customVoiceRequiresConsent: true,
    estimatedUnitCost: 0.8,
    estimatedLatencyMs: 900,
  },
  {
    id: "provider-ineligible",
    label: "Ineligible provider",
    features: ["streaming"],
    maximumInputCharacters: 400,
    regions: ["global"],
    storesInputs: true,
    trainsOnCustomerData: true,
    customVoiceRequiresConsent: false,
    estimatedUnitCost: 2.5,
    estimatedLatencyMs: 4_000,
  },
];

test("manuscript segmentation preserves exact source spans and final word", () => {
  const source = `Prologue\n\nThe old house waited. It had waited through three winters.\n\n***\n\n“Are you certain?” Mara asked.\n\nHe did not answer until the final lantern went dark.`;
  const manuscript = segmentManuscript(source, { maximumCharacters: 260, projectId: "project_test" });
  assert.equal(manuscript.findings.length, 0);
  assert.equal(manuscript.chapters[0]?.title, "Prologue");
  assert.equal(manuscript.segments.at(-1)?.text.endsWith("dark."), true);
  for (const segment of manuscript.segments) {
    assert.equal(source.slice(segment.sourceStart, segment.sourceEnd), segment.text);
  }
});

test("rights validation reports missing clone consent before expiry", () => {
  const result = validateVoiceRights(
    {
      id: "rights_bad_clone",
      voiceLabel: "Unverified identity",
      sourceKind: "authorised-clone",
      targetIdentity: "Named performer",
      subjectId: "subject_1",
      allowedUses: ["audiobook"],
      commercialUseApproved: true,
      expiresAt: "2020-01-01T00:00:00.000Z",
    },
    {
      projectId: "project_1",
      intendedUse: "audiobook",
      commercial: true,
      now: new Date("2026-07-27T00:00:00.000Z"),
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.findings[0]?.code, "VOICE_CLONE_CONSENT_MISSING");
  assert.equal(result.findings.some((finding) => finding.code === "VOICE_RIGHTS_EXPIRED"), true);
});

test("craft references cannot become performer impersonation instructions", () => {
  const result = validateVoiceRights(
    {
      ...safeRights,
      craftReferences: [{ name: "Named narrator", principles: ["sound exactly like the named narrator"] }],
    },
    { projectId: "project_1", intendedUse: "audiobook", commercial: true },
  );
  assert.equal(result.ok, false);
  assert.equal(result.findings[0]?.code, "CRAFT_REFERENCE_IMPERSONATION_DIRECTION");
});

test("transcript QA catches final-word truncation", () => {
  const result = assessTranscriptFidelity(
    "The river carried the last red leaf into darkness.",
    "The river carried the last red leaf into",
  );
  assert.equal(result.finalWordPresent, false);
  assert.equal(result.findings.some((finding) => finding.code === "TAKE_FINAL_WORD_TRUNCATED"), true);
});

test("continuity assessment distinguishes stable and rejected takes", () => {
  const anchor = {
    medianPitchHz: 118,
    pitchRangeSemitones: 7,
    speakingRateWpm: 156,
    pauseRatio: 0.19,
    energyRmsDb: -21,
  };
  const stable = assessContinuity(anchor, { ...anchor, speakingRateWpm: 158, embeddingDistanceFromAnchor: 0.03 });
  const drifted = assessContinuity(anchor, {
    medianPitchHz: 170,
    pitchRangeSemitones: 13,
    speakingRateWpm: 210,
    pauseRatio: 0.43,
    energyRmsDb: -12,
    embeddingDistanceFromAnchor: 0.72,
  });
  assert.equal(stable.severity, "stable");
  assert.equal(drifted.severity, "reject");
});

test("provider ranking fails closed on capability and data-policy mismatch", () => {
  const ranked = rankProviders(
    {
      requiredFeatures: ["batch-long-form", "pronunciation-dictionary"],
      preferredFeatures: ["word-timestamps", "style-instructions"],
      maximumSegmentCharacters: 1_200,
      requiredRegion: "australia",
      prohibitInputStorage: true,
      prohibitTrainingUse: true,
      requireCloneConsentEnforcement: true,
      maximumUnitCost: 1,
      maximumLatencyMs: 2_000,
    },
    providers,
  );
  assert.equal(ranked[0]?.providerId, "provider-capable");
  assert.equal(ranked[0]?.eligible, true);
  assert.equal(ranked[1]?.eligible, false);
  assert.equal((ranked[1]?.reasons.length ?? 0) > 3, true);
});

test("candidate QA combines manuscript fidelity and engineering gates", () => {
  const assessment = assessCandidateTake({
    id: "take_001",
    sourceText: "The door opened, and no one stood beyond it.",
    transcript: "The door opened, and no one stood beyond it.",
    deliveryProfile: ACX_AUDIOBOOK_PROFILE,
    audio: {
      rmsDb: -20,
      peakDb: -3.5,
      noiseFloorDb: -68,
      sampleRateHz: 44_100,
      bitRateKbps: 192,
      channels: 1,
      clippedSampleCount: 0,
      leadingSilenceMs: 800,
      trailingSilenceMs: 1_200,
    },
    continuity: {
      score: 94,
      drift: 0.06,
      severity: "stable",
      findings: [],
    },
    expressionReviewerScore: 91,
    rightsValid: true,
  });
  assert.equal(assessment.eligible, true);
  assert.equal(assessment.overallScore > 90, true);
});

test("visual planning groups dramatic material instead of generating one image per sentence", () => {
  const source = `Chapter One\n\nThe train entered the valley. Smoke flattened against the rain. The bridge appeared between the pines.\n\n“Keep your head down,” she said. “They will see the lamp.”\n\nThe wheels struck the first iron span.`;
  const manuscript = segmentManuscript(source, { maximumCharacters: 500 });
  const beats = buildVisualBeatPlan(manuscript.segments, { targetSeconds: 18, maximumWords: 120 });
  const sentenceCount = source.match(/[.!?]/g)?.length ?? 0;
  assert.equal(beats.length > 0, true);
  assert.equal(beats.length < sentenceCount, true);
  assert.equal(beats.every((beat) => beat.continuityKeys.length >= 3), true);
});

test("project manifests block generation when rights or providers are insufficient", () => {
  const manifest = createProjectManifest({
    id: "project_blocked",
    title: "Blocked Book",
    manuscriptText: "Chapter One\n\nNothing moved beyond the glass.",
    rightsEvidence: { ...safeRights, commercialUseApproved: false },
    providerRequirements: {
      requiredFeatures: ["batch-long-form"],
      maximumSegmentCharacters: 1_200,
      requiredRegion: "antarctica",
    },
    providerProfiles: providers,
    createdAt: new Date("2026-07-27T00:00:00.000Z"),
  });
  assert.equal(manifest.status, "blocked");
  assert.equal(manifest.findings.some((finding) => finding.code === "VOICE_COMMERCIAL_USE_NOT_APPROVED"), true);
  assert.equal(manifest.findings.some((finding) => finding.code === "PROVIDER_NO_ELIGIBLE_ROUTE"), true);
});
