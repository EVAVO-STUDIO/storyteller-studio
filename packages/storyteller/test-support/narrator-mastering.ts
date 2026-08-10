import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  analyseAudioEngineering,
  type AudioEngineeringCommand,
  type AudioEngineeringCommandResult,
  type AudioEngineeringRunner,
} from "../src/audio-engineering.js";
import {
  createArtifactRecord,
  recordArtifactReview,
  verifyArtifactIntegrity,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "../src/artifact-registry.js";
import { FileArtifactRegistry } from "../src/artifact-store.js";
import {
  CHAPTER_RENDER_SCHEMA_VERSION,
  type ChapterRenderEvidence,
  type ChapterRenderRequest,
  type ChapterRenderRunner,
} from "../src/chapter-render.js";
import { createGenerationAudioEngineeringPolicy } from "../src/generation-audio-engineering.js";
import {
  ACX_AUDIOBOOK_PROFILE,
  stableHash,
  type ProjectManifest,
} from "../src/index.js";
import {
  createMasteredChapterComparisonPolicy,
  type MasteredChapterArtifactChain,
} from "../src/mastered-chapter.js";
import type {
  MasteringSourceResolver,
  ResolvedMasteringSource,
} from "../src/mastering-render.js";
import {
  createNarratorMonitoringPolicy,
} from "../src/narrator-book-monitor.js";
import {
  createAdmittedChapterNarratorReview,
  createAdmittedNarratorQualityReference,
  monitorAdmittedNarratorChapter,
} from "../src/narrator-chapter-admission.js";
import {
  createAdmittedNarratorApprovedMasteringPlan,
  createAdmittedNarratorMasteringAuthorization,
  ingestAdmittedNarratorApprovedMasteredChapter,
  renderAdmittedNarratorApprovedMasteringPlan,
  type AdmittedNarratorApprovedMasteredChapterReceipt,
  type AdmittedNarratorApprovedMasteringPlan,
  type AdmittedNarratorApprovedMasteringRenderReceipt,
  type AdmittedNarratorMasteringContext,
} from "../src/narrator-mastering-admission.js";
import {
  createNarratorProductionJobs,
} from "../src/narrator-production-job.js";
import type { AdmittedNarratorCasting } from "../src/narrator-casting-admission.js";
import { FilePrivateObjectStore } from "../src/private-object-store.js";
import { FileProjectStore } from "../src/project-store.js";
import {
  createTestAdmittedNarratorCasting,
  testDigest,
} from "./narrator-casting.js";

export interface TestAdmittedMasteredChapterFixture {
  admittedCasting: AdmittedNarratorCasting;
  context: AdmittedNarratorMasteringContext;
  approvedPlan: AdmittedNarratorApprovedMasteringPlan;
  renderReceipt: AdmittedNarratorApprovedMasteringRenderReceipt;
  receipt: AdmittedNarratorApprovedMasteredChapterReceipt;
  chain: MasteredChapterArtifactChain;
  masteredArtifact: ArtifactRecord;
  rightsFingerprint: string;
}

export interface CreateTestAdmittedMasteredChapterFixtureOptions {
  projectId?: string;
  chapterId?: string;
  seed?: string;
  byteSeed?: number;
  mode?: "zero-shot" | "adapted";
  admittedCasting?: AdmittedNarratorCasting;
}

const t0 = new Date("2026-08-10T10:00:00.000Z");
const t1 = new Date("2026-08-10T10:01:00.000Z");
const t2 = new Date("2026-08-10T10:02:00.000Z");
const t3 = new Date("2026-08-10T10:03:00.000Z");
const t4 = new Date("2026-08-10T10:04:00.000Z");
const t5 = new Date("2026-08-10T10:05:00.000Z");
const t6 = new Date("2026-08-10T10:06:00.000Z");
const t7 = new Date("2026-08-10T10:07:00.000Z");
const t8 = new Date("2026-08-10T10:08:00.000Z");
const SHARED_RIGHTS_FINGERPRINT = testDigest("admitted-mastered-shared-rights");

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function wavBytes(seed: number): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    seed & 0xff, 0x01, 0x02, 0x03,
  ]);
}

function rights(): ArtifactRightsSnapshot {
  return {
    rightsEvidenceId: "rights_admitted_narrator_mastering_001",
    rightsFingerprint: SHARED_RIGHTS_FINGERPRINT,
    allowedUses: ["audiobook"],
    commercialUseApproved: true,
    expiresAt: "2028-08-10T00:00:00.000Z",
    retainUntil: "2033-08-10T00:00:00.000Z",
    deletionRequiredAt: "2034-08-10T00:00:00.000Z",
  };
}

function commandResult(stdout = "", stderr = ""): AudioEngineeringCommandResult {
  return { exitCode: 0, stdout, stderr, durationMs: 4 };
}

class EngineeringRunner implements AudioEngineeringRunner {
  constructor(readonly byteCount: number) {}

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
            duration: "10",
          }],
          format: {
            format_name: "wav",
            duration: "10",
            bit_rate: "192000",
            size: String(this.byteCount),
          },
        }));
      case "astats":
        return commandResult([
          "lavfi.astats.Overall.RMS_level=-20",
          "lavfi.astats.Overall.Peak_level=-4",
          "lavfi.astats.Overall.Noise_floor=-65",
          "lavfi.astats.Overall.Peak_count=0",
        ].join("\n"));
      case "loudnorm":
        return commandResult("", JSON.stringify({
          input_i: "-20",
          input_tp: "-3.5",
          input_lra: "4.2",
          input_thresh: "-30",
          target_offset: "0",
        }));
      case "silence":
        return commandResult();
    }
  }
}

class SourceResolver implements MasteringSourceResolver {
  constructor(readonly artifact: ArtifactRecord) {}

  async resolve(): Promise<ResolvedMasteringSource> {
    return {
      artifactId: this.artifact.id,
      privatePath: "/private/admitted-narrator-mastering/source.wav",
      contentHash: this.artifact.integrity.contentHash,
      byteCount: this.artifact.integrity.byteCount,
      dispose: async () => undefined,
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

function manifest(
  projectId: string,
  chapterId: string,
  sourceHash: string,
  seed: string,
): ProjectManifest {
  const text = "The first lamp failed quietly.";
  return {
    schemaVersion: "storyteller-project-v1",
    engineVersion: "0.2.0",
    id: projectId,
    title: `Admitted mastered ${chapterId}`,
    sourceHash,
    createdAt: t0.toISOString(),
    status: "planned",
    rights: { ok: true, findings: [] },
    manuscript: {
      sourceHash,
      characterCount: text.length,
      wordCount: 5,
      chapters: [{
        id: chapterId,
        ordinal: 1,
        title: "Chapter One",
        sourceStart: 0,
      }],
      segments: [{
        id: `segment_${seed.replace(/[^A-Za-z0-9._:-]/gu, "-")}`,
        sourceHash,
        chapterId,
        chapterOrdinal: 1,
        chapterTitle: "Chapter One",
        ordinal: 1,
        kind: "narration",
        sourceStart: 0,
        sourceEnd: text.length,
        text,
        wordCount: 5,
        estimatedSpeechSeconds: 2.2,
      }],
      findings: [],
    },
    performance: {
      manuscriptHash: sourceHash,
      directions: [],
      calibrationSegmentIds: [],
    },
    providers: [{
      providerId: "audio_studio_local",
      label: "EVAVO Audio Studio",
      eligible: true,
      score: 100,
      reasons: [],
    }],
    visualBeats: [],
    fingerprint: testDigest(`${seed}:manifest`),
    findings: [],
  };
}

function renderEvidence(
  projectId: string,
  chapterId: string,
  seed: string,
  sourceBytes: Uint8Array,
): ChapterRenderEvidence {
  const partial: Omit<ChapterRenderEvidence, "fingerprint"> = {
    schemaVersion: CHAPTER_RENDER_SCHEMA_VERSION,
    id: `chapter_render_${seed}`,
    planId: `chapter_assembly_${seed}`,
    planFingerprint: testDigest(`${seed}:assembly-plan`),
    sources: Object.freeze([Object.freeze({
      artifactId: `artifact_source_${seed}`,
      artifactFingerprint: testDigest(`${seed}:source-artifact`),
      contentHash: testDigest(`${seed}:source-content`),
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
    filterFingerprint: testDigest(`${seed}:chapter-filter`),
    commandFingerprint: testDigest(`${seed}:chapter-command`),
    renderedAt: t1.toISOString(),
  };
  void projectId;
  void chapterId;
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function verifiedArtifact(input: Readonly<{
  projectId: string;
  chapterId: string;
  seed: string;
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
    projectId: input.projectId,
    jobId: `job_mastering_${input.seed}`,
    segmentId: input.chapterId,
    takeId: `take_mastering_${input.seed}`,
    storage: {
      driver: "private-object-store",
      provider: "storyteller-admitted-narrator-mastering-test",
      container: "private-admitted-narrator-mastering-test",
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
      createdByActorId: `worker_mastering_${input.seed}`,
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
    checkedByActorId: `verifier_mastering_${input.seed}`,
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: t2,
  });
  return input.reviewRequired
    ? recordArtifactReview(verified, {
        decision: "approved",
        reviewerId: `director_mastering_${input.seed}`,
        notes: "Approved exact admission-bound pre-master bytes.",
        decidedAt: t3,
      })
    : verified;
}

function monitoringPolicy() {
  return createNarratorMonitoringPolicy({
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
}

const acousticSignature = Object.freeze({
  medianPitchHz: 128,
  pitchRangeSemitones: 9.5,
  speakingRateWpm: 151,
  pauseRatio: 0.18,
  energyRmsDb: -21,
  embeddingDistanceFromAnchor: 0.08,
});

function comparisonPolicy(seed: string) {
  return createMasteredChapterComparisonPolicy({
    id: `admitted-mastered-comparison-${seed}`,
    version: "2026.08",
    reviewedAt: "2026-08-01T00:00:00.000Z",
    sourceReference: "evavo-admitted-narrator-mastered-comparison-reviewed-2026-08",
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
    runner: new EngineeringRunner(bytes.byteLength),
    now: t7,
  });
}

export async function createTestAdmittedMasteredChapterFixture(
  options: CreateTestAdmittedMasteredChapterFixtureOptions = {},
): Promise<TestAdmittedMasteredChapterFixture> {
  const projectId = options.projectId ?? "project_admitted_mastered_001";
  const chapterId = options.chapterId ?? "chapter_001";
  const seed = options.seed ?? chapterId;
  const byteSeed = options.byteSeed ?? 1;
  const sourceHash = testDigest(`${seed}:manuscript-source`);
  const admittedCasting = options.admittedCasting ?? createTestAdmittedNarratorCasting(
    projectId,
    {
      mode: options.mode ?? "adapted",
      seed: "admitted-mastered-shared-narrator",
      approvedAt: t0.toISOString(),
    },
  );
  const project = manifest(projectId, chapterId, sourceHash, seed);
  const sourceBytes = wavBytes(byteSeed);
  const chapterRenderEvidence = renderEvidence(
    projectId,
    chapterId,
    seed,
    sourceBytes,
  );
  const chapterMaster = verifiedArtifact({
    projectId,
    chapterId,
    seed,
    id: `artifact_chapter_master_${seed}`,
    kind: "chapter-master",
    bytes: sourceBytes,
    sourceContentHash: sourceHash,
    generationRequestHash: chapterRenderEvidence.commandFingerprint,
    parentArtifactIds: [`artifact_chapter_render_evidence_${seed}`],
    reviewRequired: true,
  });
  const engineeringEvidence = await analyseAudioEngineering({
    audioPath: "/private/admitted-narrator-mastering/source.wav",
    inputContentHash: chapterMaster.integrity.contentHash,
    inputByteCount: chapterMaster.integrity.byteCount,
    profile: ACX_AUDIOBOOK_PROFILE,
    profileVersion: "acx-2026-08",
    profileReviewedAt: "2026-08-01T00:00:00.000Z",
    profileSourceReference: "acx-audio-submission-requirements-reviewed-2026-08",
    runner: new EngineeringRunner(chapterMaster.integrity.byteCount),
    now: t3,
  });
  const engineeringArtifact = verifiedArtifact({
    projectId,
    chapterId,
    seed,
    id: `artifact_chapter_engineering_${seed}`,
    kind: "audio-analysis",
    bytes: new TextEncoder().encode(JSON.stringify(engineeringEvidence)),
    sourceContentHash: chapterMaster.integrity.contentHash,
    generationRequestHash: chapterRenderEvidence.commandFingerprint,
    parentArtifactIds: [chapterMaster.id],
    reviewRequired: false,
  });
  const policy = monitoringPolicy();
  const productionJobs = createNarratorProductionJobs(project, admittedCasting, 3);
  const reference = createAdmittedNarratorQualityReference({
    admittedCasting,
    acousticSignature,
    expectedChapterDurationSeconds: 10,
    roomToneRmsDb: -58,
    evidenceHash: testDigest(`${seed}:monitor-reference`),
  });
  const context: AdmittedNarratorMasteringContext = Object.freeze({
    admittedCasting,
    manifest: project,
    productionJobs,
    policy,
    reference,
  });
  const monitoring = monitorAdmittedNarratorChapter({
    admittedCasting,
    manifest: project,
    chapterId,
    productionJobs,
    renderFingerprint: chapterRenderEvidence.fingerprint,
    policy,
    reference,
    objective: {
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
      transcriptEvidenceHash: testDigest(`${seed}:transcript-evidence`),
      speakerIdentityEvidenceHash: testDigest(`${seed}:identity-evidence`),
      acousticEvidenceHash: testDigest(`${seed}:acoustic-evidence`),
      engineeringEvidenceHash: testDigest(`${seed}:engineering-evidence`),
      measuredAt: t3.toISOString(),
    },
  });
  const review = createAdmittedChapterNarratorReview({
    admittedCasting,
    manifest: project,
    productionJobs,
    policy,
    reference,
    monitoring,
    review: {
      objectiveFindingAcknowledgements: monitoring.objectiveMonitoring.findingCodes,
      expectedSegmentCount: 1,
      renderedSegmentCount: 1,
      transcriptErrorCount: 0,
      finalWordPresent: true,
      clippedSampleCount: 0,
      performanceScore: 4.7,
      continuityScore: 4.6,
      listeningEaseScore: 4.6,
      identityStabilityScore: 4.8,
      syntheticArtifactFlags: [],
      fatigueFlags: [],
      reviewerIds: ["reviewer-a", "reviewer-b", "reviewer-c"],
      reviewedAt: t4.toISOString(),
    },
  });
  const authorization = createAdmittedNarratorMasteringAuthorization({
    context,
    review,
    chapterRenderEvidence,
    chapterMaster,
    engineeringArtifact,
    engineeringEvidence,
    authorizedByActorId: `mastering-director-${seed}`,
    authorizedAt: t5,
  });
  const approvedPlan = createAdmittedNarratorApprovedMasteringPlan({
    context,
    authorization,
    chapterMaster,
    engineeringArtifact,
    engineeringEvidence,
    id: `mastering_plan_${seed}`,
    targetProfile: engineeringEvidence.profile,
    output: {
      format: "wav",
      sampleRateHz: 44_100,
      channels: 1,
      bitDepth: 24,
    },
    operations: [],
    rationale: "Preserve the admission-bound reviewed performance and remeasure exact output.",
    createdByActorId: `mastering-engineer-${seed}`,
    createdAt: t6,
  });
  const outputBytes = wavBytes(byteSeed + 100);
  const rendered = await renderAdmittedNarratorApprovedMasteringPlan({
    context,
    approvedPlan,
    sourceEngineeringEvidence: engineeringEvidence,
    sources: new SourceResolver(chapterMaster),
    runner: new RenderRunner(outputBytes),
    renderedAt: t7,
  });
  const root = await mkdtemp(join(tmpdir(), "storyteller-admitted-mastered-"));
  try {
    const objectStore = new FilePrivateObjectStore(join(root, "objects"));
    const registry = new FileArtifactRegistry(new FileProjectStore(join(root, "registry")));
    const completed = await ingestAdmittedNarratorApprovedMasteredChapter(
      objectStore,
      registry,
      {
        context,
        approvedPlan,
        render: rendered.render,
        renderReceipt: rendered.receipt,
        sourceMaster: chapterMaster,
        sourceEngineeringArtifact: engineeringArtifact,
        sourceEngineeringEvidence: engineeringEvidence,
        rights: rights(),
        actorId: `mastering-worker-${seed}`,
        verifierActorId: `mastering-verifier-${seed}`,
        comparisonPolicy: comparisonPolicy(seed),
        now: t8,
        engineering: {
          ...postEngineeringPolicy(outputBytes),
          temporaryRoot: join(root, "engineering"),
        },
      },
    );
    return Object.freeze({
      admittedCasting,
      context,
      approvedPlan,
      renderReceipt: rendered.receipt,
      receipt: completed.receipt,
      chain: completed.chain,
      masteredArtifact: completed.chain.masteredChapter.payload,
      rightsFingerprint: SHARED_RIGHTS_FINGERPRINT,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
