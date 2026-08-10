import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  analyseAudioEngineering,
  type AudioEngineeringCommand,
  type AudioEngineeringCommandResult,
  type AudioEngineeringEvidence,
  type AudioEngineeringRunner,
} from "./audio-engineering.js";
import {
  createArtifactRecord,
  recordArtifactReview,
  verifyArtifactIntegrity,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import { FileArtifactRegistry } from "./artifact-store.js";
import {
  CHAPTER_RENDER_SCHEMA_VERSION,
  type ChapterRenderEvidence,
  type ChapterRenderRequest,
  type ChapterRenderRunner,
} from "./chapter-render.js";
import { createGenerationAudioEngineeringPolicy } from "./generation-audio-engineering.js";
import { ACX_AUDIOBOOK_PROFILE, stableHash } from "./index.js";
import {
  createMasteredChapterComparisonPolicy,
} from "./mastered-chapter.js";
import type {
  MasteringSourceResolver,
  ResolvedMasteringSource,
} from "./mastering-render.js";
import {
  assertNarratorApprovedMasteredChapterReceipt,
  assertNarratorApprovedMasteringPlan,
  assertNarratorApprovedMasteringRenderReceipt,
  assertNarratorMasteringAuthorization,
  createNarratorApprovedMasteringPlan,
  createNarratorApprovedMasteringRenderReceipt,
  createNarratorMasteringAuthorization,
  ingestNarratorApprovedMasteredChapter,
  narratorApprovedMasteredChapterPublicView,
  renderNarratorApprovedMasteringPlan,
} from "./narrator-mastering-chain.js";
import {
  createNarratorChapterObjectiveObservation,
  createNarratorMonitoringPolicy,
  createNarratorQualityReference,
  monitorNarratorChapter,
} from "./narrator-book-monitor.js";
import {
  AUDIO_STUDIO_NARRATOR_PROFILE_SCHEMA,
  approveNarratorCasting,
  createChapterNarratorReview,
  type AudioStudioNarratorVoiceProfile,
} from "./narrator-voice-profile.js";
import { FilePrivateObjectStore } from "./private-object-store.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-08-10T00:00:00.000Z");
const t1 = new Date("2026-08-10T00:00:01.000Z");
const t2 = new Date("2026-08-10T00:00:02.000Z");
const t3 = new Date("2026-08-10T00:00:03.000Z");
const t4 = new Date("2026-08-10T00:00:04.000Z");
const t5 = new Date("2026-08-10T00:00:05.000Z");
const t6 = new Date("2026-08-10T00:00:06.000Z");
const t7 = new Date("2026-08-10T00:00:07.000Z");
const t8 = new Date("2026-08-10T00:00:08.000Z");
const rightsFingerprint = "a".repeat(64);
const manuscriptSourceHash = "b".repeat(64);

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
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

function wavBytes(seed: number): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    seed, 0x01, 0x02, 0x03,
  ]);
}

function rights(): ArtifactRightsSnapshot {
  return {
    rightsEvidenceId: "rights_narrator_mastering_001",
    rightsFingerprint,
    allowedUses: ["audiobook"],
    commercialUseApproved: true,
    expiresAt: "2028-08-10T00:00:00.000Z",
    retainUntil: "2033-08-10T00:00:00.000Z",
    deletionRequiredAt: "2034-08-10T00:00:00.000Z",
  };
}

function profile(): AudioStudioNarratorVoiceProfile {
  const partial = {
    schema: AUDIO_STUDIO_NARRATOR_PROFILE_SCHEMA,
    profileId: "magician-narrator",
    revision: 4,
    voiceIdentityId: "magician-owner-authorised",
    engineKey: "qwen3-tts-1.7b-base-local",
    mode: "adapted" as const,
    modelArtifactTreeSha256: digest("model"),
    decisionHash: digest("decision"),
    holdoutLedgerHash: digest("ledger"),
    finalHoldoutFingerprint: digest("holdout"),
    evidenceHash: digest("evidence"),
    evidence: {
      sourceRightsFingerprint: digest("voice-rights"),
      narratorDatasetFingerprint: digest("dataset"),
      referencePackFingerprint: digest("reference"),
      benchmarkRunHash: digest("benchmark-run"),
      benchmarkCandidateHash: digest("benchmark-candidate"),
      textEvidenceHash: digest("text"),
      speakerIdentityEvidenceHash: digest("speaker"),
      acousticEvidenceHash: digest("acoustic"),
      blindReviewEvidenceHash: digest("blind"),
      renderEngineLockFingerprint: digest("render-lock"),
      trainingEngineLockFingerprint: digest("training-lock"),
    },
    rights: {
      commercialSynthesisAuthorized: true as const,
      sourceRightsFingerprint: digest("voice-rights"),
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

function commandResult(stdout = "", stderr = ""): AudioEngineeringCommandResult {
  return { exitCode: 0, stdout, stderr, durationMs: 4 };
}

class EngineeringRunner implements AudioEngineeringRunner {
  constructor(readonly input: Readonly<{
    byteCount: number;
    durationSeconds?: number;
    rmsDb?: number;
    peakDb?: number;
    truePeakDb?: number;
    noiseFloorDb?: number;
  }>) {}

  async run(command: AudioEngineeringCommand): Promise<AudioEngineeringCommandResult> {
    switch (command.stage) {
      case "ffprobe-version":
        return commandResult("ffprobe version 7.1 fixture\n");
      case "ffmpeg-version":
        return commandResult("ffmpeg version 7.1 fixture\n");
      case "probe":
        return commandResult(JSON.stringify({
          streams: [{
            codec_type: "audio",
            codec_name: "pcm_s24le",
            sample_rate: "44100",
            channels: 1,
            bit_rate: "192000",
            duration: String(this.input.durationSeconds ?? 10),
          }],
          format: {
            format_name: "wav",
            duration: String(this.input.durationSeconds ?? 10),
            bit_rate: "192000",
            size: String(this.input.byteCount),
          },
        }));
      case "astats":
        return commandResult([
          `lavfi.astats.Overall.RMS_level=${this.input.rmsDb ?? -20}`,
          `lavfi.astats.Overall.Peak_level=${this.input.peakDb ?? -4}`,
          `lavfi.astats.Overall.Noise_floor=${this.input.noiseFloorDb ?? -65}`,
          "lavfi.astats.Overall.Peak_count=0",
        ].join("\n"));
      case "loudnorm":
        return commandResult("", JSON.stringify({
          input_i: String(this.input.rmsDb ?? -20),
          input_tp: String(this.input.truePeakDb ?? -3.5),
          input_lra: "4.2",
          input_thresh: "-30",
          target_offset: "0",
        }));
      case "silence":
        return commandResult();
    }
  }
}

function renderEvidence(sourceBytes: Uint8Array): ChapterRenderEvidence {
  const partial: Omit<ChapterRenderEvidence, "fingerprint"> = {
    schemaVersion: CHAPTER_RENDER_SCHEMA_VERSION,
    id: "chapter_render_narrator_mastering_001",
    planId: "chapter_assembly_narrator_mastering_001",
    planFingerprint: digest("assembly-plan"),
    sources: Object.freeze([Object.freeze({
      artifactId: "artifact_source_take_001",
      artifactFingerprint: digest("source-take-fingerprint"),
      contentHash: digest("source-take-content"),
      byteCount: 256,
    })]),
    expectedDurationMs: 10_000,
    output: Object.freeze({
      format: "wav" as const,
      sampleRateHz: 44_100,
      channels: 1 as const,
      bitDepth: 24 as const,
      contentHash: hashBytes(sourceBytes),
      byteCount: sourceBytes.byteLength,
      mediaSignature: "riff-wave",
    }),
    tool: Object.freeze({
      executableName: "ffmpeg",
      versionLine: "ffmpeg version 7.1 fixture",
      versionFingerprint: stableHash("ffmpeg version 7.1 fixture"),
    }),
    filterFingerprint: digest("chapter-filter"),
    commandFingerprint: digest("chapter-command"),
    renderedAt: t1.toISOString(),
  };
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function verifiedArtifact(input: Readonly<{
  id: string;
  kind: "chapter-master" | "audio-analysis";
  bytes: Uint8Array;
  sourceContentHash: string;
  generationRequestHash: string;
  parentArtifactIds: readonly string[];
  reviewRequired: boolean;
}>): ArtifactRecord {
  const initial = createArtifactRecord({
    id: input.id,
    kind: input.kind,
    projectId: "book_001",
    jobId: "job_narrator_mastering_001",
    segmentId: "chapter_001",
    takeId: "take_narrator_mastering_001",
    storage: {
      driver: "private-object-store",
      provider: "storyteller-narrator-mastering-test",
      container: "private-narrator-mastering-test",
      objectKey: `sha256/${hashBytes(input.bytes)}.${input.kind === "chapter-master" ? "wav" : "json"}`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: hashBytes(input.bytes),
      byteCount: input.bytes.byteLength,
      mimeType: input.kind === "chapter-master" ? "audio/wav" : "application/json",
      format: input.kind === "chapter-master" ? "wav" : "json",
    },
    provenance: {
      createdByActorId: "worker_narrator_mastering_001",
      sourceContentHash: input.sourceContentHash,
      generationRequestHash: input.generationRequestHash,
      parentArtifactIds: input.parentArtifactIds,
    },
    rights: rights(),
    reviewRequired: input.reviewRequired,
  }, t2);
  const verified = verifyArtifactIntegrity(initial, {
    observedContentHash: initial.integrity.contentHash,
    observedByteCount: initial.integrity.byteCount,
    checkedByActorId: "verifier_narrator_mastering_001",
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: t2,
  });
  return input.reviewRequired
    ? recordArtifactReview(verified, {
        decision: "approved",
        reviewerId: "director_narrator_mastering_001",
        notes: "Approved exact pre-master chapter bytes.",
        decidedAt: t3,
      })
    : verified;
}

class SourceResolver implements MasteringSourceResolver {
  disposed = 0;
  constructor(readonly artifact: ArtifactRecord) {}

  async resolve(): Promise<ResolvedMasteringSource> {
    return {
      artifactId: this.artifact.id,
      privatePath: "/private/narrator-mastering/source.wav",
      contentHash: this.artifact.integrity.contentHash,
      byteCount: this.artifact.integrity.byteCount,
      dispose: async () => {
        this.disposed += 1;
      },
    };
  }
}

class RenderRunner implements ChapterRenderRunner {
  constructor(readonly bytes: Uint8Array) {}
  async inspectVersion(): Promise<string> {
    return "ffmpeg version 7.1 fixture";
  }
  async render(_request: ChapterRenderRequest): Promise<Uint8Array> {
    return this.bytes;
  }
}

async function fixture() {
  const sourceBytes = wavBytes(1);
  const chapterRenderEvidence = renderEvidence(sourceBytes);
  const chapterMaster = verifiedArtifact({
    id: "artifact_chapter_master_narrator_001",
    kind: "chapter-master",
    bytes: sourceBytes,
    sourceContentHash: manuscriptSourceHash,
    generationRequestHash: chapterRenderEvidence.commandFingerprint,
    parentArtifactIds: ["artifact_chapter_render_evidence_001"],
    reviewRequired: true,
  });
  const engineeringEvidence = await analyseAudioEngineering({
    audioPath: "/private/narrator-mastering/source.wav",
    inputContentHash: chapterMaster.integrity.contentHash,
    inputByteCount: chapterMaster.integrity.byteCount,
    profile: ACX_AUDIOBOOK_PROFILE,
    profileVersion: "acx-2026-08",
    profileReviewedAt: "2026-08-01T00:00:00.000Z",
    profileSourceReference: "acx-audio-submission-requirements-reviewed-2026-08",
    runner: new EngineeringRunner({ byteCount: chapterMaster.integrity.byteCount }),
    now: t3,
  });
  const engineeringArtifact = verifiedArtifact({
    id: "artifact_chapter_master_engineering_001",
    kind: "audio-analysis",
    bytes: new TextEncoder().encode(JSON.stringify(engineeringEvidence)),
    sourceContentHash: chapterMaster.integrity.contentHash,
    generationRequestHash: chapterRenderEvidence.commandFingerprint,
    parentArtifactIds: [chapterMaster.id],
    reviewRequired: false,
  });
  const casting = approveNarratorCasting({
    projectId: "book_001",
    profile: profile(),
    approvedBy: "Greg",
    approvedAt: t0.toISOString(),
  });
  const monitoringPolicy = createNarratorMonitoringPolicy({
    minimumTranscriptCoverage: 0.995,
    maximumInsertionRatio: 0.01,
    minimumSpeakerIdentitySimilarity: 0.86,
    maximumCadenceTemplateSimilarity: 0.78,
    maximumSentenceFinalContourRepetitionRatio: 0.62,
    maximumNoiseFloorDb: -55,
    maximumRoomToneDriftDb: 4,
    maximumSeamDiscontinuityScore: 0.25,
    maximumChapterDurationDriftRatio: 0.18,
    requireFinalWord: true,
    requireZeroClipping: true,
    forbidUnexpectedSpeakerChange: true,
  });
  const acousticSignature = Object.freeze({
    medianPitchHz: 128,
    pitchRangeSemitones: 9.5,
    speakingRateWpm: 151,
    pauseRatio: 0.18,
    energyRmsDb: -21,
    embeddingDistanceFromAnchor: 0.08,
  });
  const monitoringReference = createNarratorQualityReference({
    casting,
    acousticSignature,
    expectedChapterDurationSeconds: 10,
    roomToneRmsDb: -58,
    evidenceHash: digest("monitor-reference"),
  });
  const observation = createNarratorChapterObjectiveObservation({
    projectId: "book_001",
    chapterId: "chapter_001",
    castingFingerprint: casting.fingerprint,
    voice: casting.voice,
    renderFingerprint: chapterRenderEvidence.fingerprint,
    sourceFingerprint: digest("chapter-source"),
    segmentCount: 1,
    transcriptCoverage: 0.999,
    insertionRatio: 0.001,
    finalWordPresent: true,
    clippedSampleCount: 0,
    unexpectedSpeakerChangeCount: 0,
    minimumSpeakerIdentitySimilarity: 0.95,
    acousticSignature,
    chapterDurationSeconds: 10,
    cadenceTemplateSimilarity: 0.4,
    sentenceFinalContourRepetitionRatio: 0.3,
    noiseFloorDb: -65,
    roomToneRmsDb: -58,
    maximumSeamDiscontinuityScore: 0.05,
    transcriptEvidenceHash: digest("transcript-evidence"),
    speakerIdentityEvidenceHash: digest("identity-evidence"),
    acousticEvidenceHash: digest("acoustic-evidence"),
    engineeringEvidenceHash: digest("engineering-evidence"),
    measuredAt: t3.toISOString(),
  });
  const monitoring = monitorNarratorChapter({
    casting,
    policy: monitoringPolicy,
    reference: monitoringReference,
    observation,
  });
  const review = createChapterNarratorReview({
    projectId: "book_001",
    chapterId: "chapter_001",
    casting,
    renderFingerprint: chapterRenderEvidence.fingerprint,
    objectiveMonitoring: monitoring,
    objectiveFindingAcknowledgements: [],
    expectedSegmentCount: 1,
    renderedSegmentCount: 1,
    transcriptErrorCount: 0,
    finalWordPresent: true,
    clippedSampleCount: 0,
    performanceScore: 4.7,
    continuityScore: 4.6,
    listeningEaseScore: 4.5,
    identityStabilityScore: 4.8,
    syntheticArtifactFlags: [],
    fatigueFlags: [],
    reviewerIds: ["reviewer-a", "reviewer-b", "reviewer-c"],
    reviewedAt: t4.toISOString(),
  });
  const authorization = createNarratorMasteringAuthorization({
    casting,
    review,
    chapterRenderEvidence,
    chapterMaster,
    engineeringArtifact,
    engineeringEvidence,
    authorizedByActorId: "mastering-director",
    authorizedAt: t5,
  });
  const approvedPlan = createNarratorApprovedMasteringPlan({
    authorization,
    chapterMaster,
    engineeringArtifact,
    engineeringEvidence,
    id: "mastering_plan_narrator_001",
    targetProfile: engineeringEvidence.profile,
    output: {
      format: "wav",
      sampleRateHz: 44_100,
      channels: 1,
      bitDepth: 24,
    },
    operations: [],
    rationale: "Preserve the reviewed performance and remeasure the exact output.",
    createdByActorId: "mastering-engineer",
    createdAt: t6,
  });
  return {
    sourceBytes,
    chapterRenderEvidence,
    chapterMaster,
    engineeringEvidence,
    engineeringArtifact,
    casting,
    review,
    authorization,
    approvedPlan,
  };
}

function comparisonPolicy() {
  return createMasteredChapterComparisonPolicy({
    id: "narrator-mastered-comparison",
    version: "2026.08",
    reviewedAt: "2026-08-01T00:00:00.000Z",
    sourceReference: "evavo-narrator-mastered-comparison-reviewed-2026-08",
    strictTransparentPrediction: true,
    now: t7,
  });
}

function postEngineeringPolicy(bytes: Uint8Array) {
  return createGenerationAudioEngineeringPolicy({
    profile: ACX_AUDIOBOOK_PROFILE,
    externalVersion: "acx-2026-08",
    reviewedAt: "2026-08-01T00:00:00.000Z",
    sourceReference: "acx-audio-submission-requirements-reviewed-2026-08",
    runner: new EngineeringRunner({ byteCount: bytes.byteLength }),
    now: t7,
  });
}

async function withStores(
  run: (input: Readonly<{
    root: string;
    objectStore: FilePrivateObjectStore;
    registry: FileArtifactRegistry;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-narrator-mastering-"));
  try {
    await run({
      root,
      objectStore: new FilePrivateObjectStore(join(root, "objects")),
      registry: new FileArtifactRegistry(new FileProjectStore(join(root, "registry"))),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("authorization binds the exact reviewed render, source master and engineering evidence", async () => {
  const value = await fixture();
  assert.doesNotThrow(() => assertNarratorMasteringAuthorization(value.authorization));
  assert.equal(value.authorization.chapterReview.fingerprint, value.review.fingerprint);
  assert.equal(value.authorization.chapterRender.fingerprint, value.chapterRenderEvidence.fingerprint);
  assert.equal(value.authorization.sourceMaster.fingerprint, value.chapterMaster.fingerprint);
  assert.equal(value.authorization.masteringEligible, true);
  assert.equal(value.authorization.titleReleaseAuthority, false);
  assert.equal(value.authorization.publicationAuthority, false);
});

test("a human review for another render cannot authorize mastering", async () => {
  const value = await fixture();
  assert.throws(
    () => createNarratorMasteringAuthorization({
      casting: value.casting,
      review: { ...value.review, renderFingerprint: digest("different-render") },
      chapterRenderEvidence: value.chapterRenderEvidence,
      chapterMaster: value.chapterMaster,
      engineeringArtifact: value.engineeringArtifact,
      engineeringEvidence: value.engineeringEvidence,
      authorizedByActorId: "mastering-director",
      authorizedAt: t5,
    }),
    /CHAPTER_NARRATOR_REVIEW_FINGERPRINT_INVALID|NARRATOR_MASTERING_REVIEW_RENDER_MISMATCH/u,
  );
});

test("source master or engineering substitution is rejected before a plan is created", async () => {
  const value = await fixture();
  const changedMaster = { ...value.chapterMaster, revision: value.chapterMaster.revision + 1 };
  assert.throws(
    () => createNarratorApprovedMasteringPlan({
      authorization: value.authorization,
      chapterMaster: changedMaster,
      engineeringArtifact: value.engineeringArtifact,
      engineeringEvidence: value.engineeringEvidence,
      id: "mastering_plan_narrator_changed",
      targetProfile: value.engineeringEvidence.profile,
      output: { format: "wav", sampleRateHz: 44_100, channels: 1, bitDepth: 24 },
      operations: [],
      rationale: "This must fail before the approved source can be replaced.",
      createdByActorId: "mastering-engineer",
      createdAt: t6,
    }),
    /ARTIFACT_FINGERPRINT_MISMATCH|NARRATOR_MASTERING_SOURCE_MASTER_CHANGED/u,
  );
});

test("approved mastering plan seals the narrator review and objective monitor fingerprints", async () => {
  const value = await fixture();
  assert.doesNotThrow(() => assertNarratorApprovedMasteringPlan(value.approvedPlan));
  assert.equal(value.approvedPlan.chapterNarratorReviewFingerprint, value.review.fingerprint);
  assert.equal(
    value.approvedPlan.objectiveMonitoringFingerprint,
    value.review.objectiveMonitoringFingerprint,
  );
  assert.equal(value.approvedPlan.plan.sourceMaster.contentHash, value.chapterMaster.integrity.contentHash);
});

test("mastering render receipt remains bound to the exact approved plan and bytes", async () => {
  const value = await fixture();
  const outputBytes = wavBytes(9);
  const rendered = await renderNarratorApprovedMasteringPlan({
    approvedPlan: value.approvedPlan,
    sourceEngineeringEvidence: value.engineeringEvidence,
    sources: new SourceResolver(value.chapterMaster),
    runner: new RenderRunner(outputBytes),
    renderedAt: t7,
  });
  assert.doesNotThrow(() => assertNarratorApprovedMasteringRenderReceipt(
    rendered.receipt,
    value.approvedPlan,
  ));
  assert.equal(rendered.receipt.outputContentHash, hashBytes(outputBytes));
  assert.equal(rendered.receipt.chapterNarratorReviewFingerprint, value.review.fingerprint);
  assert.throws(
    () => createNarratorApprovedMasteringRenderReceipt({
      approvedPlan: value.approvedPlan,
      render: { ...rendered.render, bytes: wavBytes(8) },
    }),
    /NARRATOR_MASTERING_RENDER_BINDING_MISMATCH/u,
  );
});

test("mastered chapter receipt carries the exact review through the complete mastering chain", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const value = await fixture();
    const outputBytes = wavBytes(9);
    const rendered = await renderNarratorApprovedMasteringPlan({
      approvedPlan: value.approvedPlan,
      sourceEngineeringEvidence: value.engineeringEvidence,
      sources: new SourceResolver(value.chapterMaster),
      runner: new RenderRunner(outputBytes),
      renderedAt: t7,
    });
    const completed = await ingestNarratorApprovedMasteredChapter(
      objectStore,
      registry,
      {
        approvedPlan: value.approvedPlan,
        render: rendered.render,
        renderReceipt: rendered.receipt,
        sourceMaster: value.chapterMaster,
        sourceEngineeringArtifact: value.engineeringArtifact,
        sourceEngineeringEvidence: value.engineeringEvidence,
        rights: rights(),
        actorId: "mastering-worker",
        verifierActorId: "mastering-verifier",
        engineering: postEngineeringPolicy(outputBytes),
        comparisonPolicy: comparisonPolicy(),
        now: t8,
        engineering: {
          ...postEngineeringPolicy(outputBytes),
          temporaryRoot: join(root, "engineering"),
        },
      },
    );
    assert.doesNotThrow(() => assertNarratorApprovedMasteredChapterReceipt(completed.receipt));
    assert.equal(completed.receipt.chapterNarratorReviewFingerprint, value.review.fingerprint);
    assert.equal(
      completed.receipt.objectiveMonitoringFingerprint,
      value.review.objectiveMonitoringFingerprint,
    );
    assert.equal(completed.receipt.masteredChapterChainFingerprint, completed.chain.fingerprint);
    assert.equal(completed.receipt.masteredArtifact.contentHash, hashBytes(outputBytes));
    assert.equal(completed.receipt.masteredListeningApproval, false);
    assert.equal(completed.receipt.titleReleaseAuthority, false);
    assert.equal(completed.receipt.publicationAuthority, false);

    const publicView = narratorApprovedMasteredChapterPublicView(completed.receipt);
    const publicJson = JSON.stringify(publicView);
    assert.equal(publicView.narratorEvidenceBound, true);
    assert.equal(publicJson.includes("magician-narrator"), false);
    assert.equal(publicJson.includes(value.casting.fingerprint), false);
    assert.equal(publicJson.includes(value.review.reviewerPanelFingerprint), false);
  });
});

test("mastered chapter receipt detects review, plan and output substitution", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const value = await fixture();
    const outputBytes = wavBytes(9);
    const rendered = await renderNarratorApprovedMasteringPlan({
      approvedPlan: value.approvedPlan,
      sourceEngineeringEvidence: value.engineeringEvidence,
      sources: new SourceResolver(value.chapterMaster),
      runner: new RenderRunner(outputBytes),
      renderedAt: t7,
    });
    const completed = await ingestNarratorApprovedMasteredChapter(
      objectStore,
      registry,
      {
        approvedPlan: value.approvedPlan,
        render: rendered.render,
        renderReceipt: rendered.receipt,
        sourceMaster: value.chapterMaster,
        sourceEngineeringArtifact: value.engineeringArtifact,
        sourceEngineeringEvidence: value.engineeringEvidence,
        rights: rights(),
        actorId: "mastering-worker",
        verifierActorId: "mastering-verifier",
        engineering: {
          ...postEngineeringPolicy(outputBytes),
          temporaryRoot: join(root, "engineering"),
        },
        comparisonPolicy: comparisonPolicy(),
        now: t8,
      },
    );
    assert.throws(
      () => assertNarratorApprovedMasteredChapterReceipt({
        ...completed.receipt,
        chapterNarratorReviewFingerprint: digest("other-review"),
      }),
      /NARRATOR_MASTERED_CHAPTER_FINGERPRINT_INVALID/u,
    );
    assert.throws(
      () => assertNarratorApprovedMasteringRenderReceipt({
        ...rendered.receipt,
        planFingerprint: digest("other-plan"),
      }, value.approvedPlan),
      /NARRATOR_MASTERING_RENDER_RECEIPT_BINDING_MISMATCH/u,
    );
  });
});
