import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  ACX_AUDIOBOOK_PROFILE,
  type DeliveryProfile,
} from "./index.js";
import {
  analyseAudioEngineering,
  type AudioEngineeringCommand,
  type AudioEngineeringCommandResult,
  type AudioEngineeringEvidence,
  type AudioEngineeringRunner,
} from "./audio-engineering.js";
import {
  assertArtifactRecord,
  createArtifactRecord,
  recordArtifactReview,
  verifyArtifactIntegrity,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import {
  assertChapterAssemblyPlan,
  chapterAssemblyPublicView,
  createChapterAssemblyPlan,
  type ChapterAssemblySegmentInput,
} from "./chapter-assembly.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:00:01.000Z");
const t2 = new Date("2026-07-27T00:00:02.000Z");
const t3 = new Date("2026-07-27T00:00:03.000Z");
const manuscriptSourceHash = "a".repeat(64);
const rightsFingerprint = "b".repeat(64);

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function audioBytes(seed: number): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    seed, 0x01, 0x02, 0x03,
  ]);
}

function rights(overrides: Partial<ArtifactRightsSnapshot> = {}): ArtifactRightsSnapshot {
  return {
    rightsEvidenceId: "rights_chapter_assembly_001",
    rightsFingerprint,
    allowedUses: ["audiobook"],
    commercialUseApproved: true,
    expiresAt: "2028-07-27T00:00:00.000Z",
    ...overrides,
  };
}

function verifiedArtifact(input: Readonly<{
  id: string;
  kind: "audio-candidate" | "transcript" | "audio-analysis";
  segmentId: string;
  takeId: string;
  jobId: string;
  bytes: Uint8Array;
  mimeType: string;
  format: string;
  sourceContentHash: string;
  generationRequestHash: string;
  parentArtifactIds: readonly string[];
  reviewRequired: boolean;
  rights?: ArtifactRightsSnapshot;
  projectId?: string;
}>): ArtifactRecord {
  const initial = createArtifactRecord({
    id: input.id,
    kind: input.kind,
    projectId: input.projectId ?? "project_chapter_assembly_001",
    jobId: input.jobId,
    segmentId: input.segmentId,
    takeId: input.takeId,
    storage: {
      driver: "private-object-store",
      provider: "storyteller-private-test",
      container: "chapter-assembly-test",
      objectKey: `sha256/${hashBytes(input.bytes)}.${input.format}`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: hashBytes(input.bytes),
      byteCount: input.bytes.byteLength,
      mimeType: input.mimeType,
      format: input.format,
    },
    provenance: {
      createdByActorId: "worker_chapter_assembly_001",
      sourceContentHash: input.sourceContentHash,
      generationRequestHash: input.generationRequestHash,
      ...(input.kind === "audio-candidate"
        ? {
            providerId: "provider_chapter_assembly",
            adapterVersion: "1.0.0",
          }
        : {}),
      parentArtifactIds: input.parentArtifactIds,
    },
    rights: input.rights ?? rights(),
    reviewRequired: input.reviewRequired,
  }, t0);
  const verified = verifyArtifactIntegrity(initial, {
    observedContentHash: initial.integrity.contentHash,
    observedByteCount: initial.integrity.byteCount,
    checkedByActorId: "verifier_chapter_assembly_001",
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: t1,
  });
  if (!input.reviewRequired) return verified;
  return recordArtifactReview(verified, {
    decision: "approved",
    reviewerId: "director_chapter_assembly_001",
    notes: "Approved in context against the manuscript, neighbouring takes and chapter rhythm.",
    decidedAt: t2,
  });
}

function commandResult(
  stdout = "",
  stderr = "",
): AudioEngineeringCommandResult {
  return { exitCode: 0, stdout, stderr, durationMs: 5 };
}

class EngineeringRunner implements AudioEngineeringRunner {
  constructor(
    readonly byteCount: number,
    readonly durationSeconds: number,
    readonly rmsDb = -20,
  ) {}

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
            duration: this.durationSeconds.toFixed(6),
          }],
          format: {
            format_name: "wav",
            duration: this.durationSeconds.toFixed(6),
            bit_rate: "192000",
            size: String(this.byteCount),
          },
        }));
      case "astats":
        return commandResult([
          `lavfi.astats.Overall.RMS_level=${this.rmsDb.toFixed(4)}`,
          "lavfi.astats.Overall.Peak_level=-4.0000",
          "lavfi.astats.Overall.Noise_floor=-66.0000",
          "lavfi.astats.Overall.Peak_count=0",
        ].join("\n"));
      case "loudnorm":
        return commandResult("", JSON.stringify({
          input_i: "-20.20",
          input_tp: "-4.10",
          input_lra: "4.20",
          input_thresh: "-30.20",
          target_offset: "0.10",
        }));
      case "silence":
        return commandResult();
    }
  }
}

async function engineeringEvidence(
  bytes: Uint8Array,
  durationSeconds: number,
  profile: DeliveryProfile = ACX_AUDIOBOOK_PROFILE,
  rmsDb = -20,
): Promise<AudioEngineeringEvidence> {
  return await analyseAudioEngineering({
    audioPath: "/private/chapter-assembly/candidate.wav",
    inputContentHash: hashBytes(bytes),
    inputByteCount: bytes.byteLength,
    profile,
    profileVersion: "acx-2026-07",
    profileReviewedAt: "2026-07-01T00:00:00.000Z",
    profileSourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner: new EngineeringRunner(bytes.byteLength, durationSeconds, rmsDb),
    now: t2,
  });
}

async function segmentChain(input: Readonly<{
  ordinal: number;
  segmentId: string;
  sourceStart: number;
  sourceEnd: number;
  seed: number;
  durationSeconds?: number;
  rmsDb?: number;
  rights?: ArtifactRightsSnapshot;
  projectId?: string;
}>): Promise<ChapterAssemblySegmentInput> {
  const bytes = audioBytes(input.seed);
  const requestHash = input.seed.toString(16).padStart(64, "0");
  const jobId = `job_chapter_assembly_${input.ordinal.toString().padStart(3, "0")}`;
  const takeId = `take_chapter_assembly_${input.ordinal.toString().padStart(3, "0")}`;
  const audio = verifiedArtifact({
    id: `artifact_audio_chapter_assembly_${input.ordinal.toString().padStart(3, "0")}`,
    kind: "audio-candidate",
    segmentId: input.segmentId,
    takeId,
    jobId,
    bytes,
    mimeType: "audio/wav",
    format: "wav",
    sourceContentHash: manuscriptSourceHash,
    generationRequestHash: requestHash,
    parentArtifactIds: [],
    reviewRequired: true,
    rights: input.rights,
    projectId: input.projectId,
  });
  const transcriptBytes = new TextEncoder().encode(`transcript-${input.ordinal}`);
  const transcript = verifiedArtifact({
    id: `artifact_transcript_chapter_assembly_${input.ordinal.toString().padStart(3, "0")}`,
    kind: "transcript",
    segmentId: input.segmentId,
    takeId,
    jobId,
    bytes: transcriptBytes,
    mimeType: "text/plain",
    format: "txt",
    sourceContentHash: manuscriptSourceHash,
    generationRequestHash: requestHash,
    parentArtifactIds: [audio.id],
    reviewRequired: false,
    rights: input.rights,
    projectId: input.projectId,
  });
  const evidence = await engineeringEvidence(
    bytes,
    input.durationSeconds ?? 1,
    ACX_AUDIOBOOK_PROFILE,
    input.rmsDb ?? -20,
  );
  const evidenceBytes = new TextEncoder().encode(JSON.stringify(evidence));
  const engineering = verifiedArtifact({
    id: `artifact_engineering_chapter_assembly_${input.ordinal.toString().padStart(3, "0")}`,
    kind: "audio-analysis",
    segmentId: input.segmentId,
    takeId,
    jobId,
    bytes: evidenceBytes,
    mimeType: "application/json",
    format: "json",
    sourceContentHash: audio.integrity.contentHash,
    generationRequestHash: requestHash,
    parentArtifactIds: [audio.id],
    reviewRequired: false,
    rights: input.rights,
    projectId: input.projectId,
  });
  for (const record of [audio, transcript, engineering]) assertArtifactRecord(record);
  return {
    ordinal: input.ordinal,
    segmentId: input.segmentId,
    sourceStart: input.sourceStart,
    sourceEnd: input.sourceEnd,
    audioCandidate: audio,
    transcriptArtifact: transcript,
    engineeringArtifact: engineering,
    engineeringEvidence: evidence,
  };
}

function assemblyInput(segments: readonly ChapterAssemblySegmentInput[]) {
  return {
    id: "assembly_chapter_001",
    projectId: "project_chapter_assembly_001",
    chapterId: "chapter_001",
    manuscriptSourceHash,
    policy: {
      id: "evavo-narrative-assembly",
      version: "2026.07",
      maximumTrimMs: 500,
      maximumGapMs: 5_000,
      maximumFadeMs: 500,
      requireApprovedCandidates: true as const,
    },
    output: {
      format: "wav" as const,
      sampleRateHz: 44_100,
      channels: 1 as const,
      bitDepth: 24 as const,
    },
    segments,
    createdByActorId: "editor_chapter_assembly_001",
    createdAt: t3,
  };
}

test("approved evidence chains create a deterministic ordered chapter timeline", async () => {
  const first = await segmentChain({
    ordinal: 1,
    segmentId: "segment_chapter_001_001",
    sourceStart: 0,
    sourceEnd: 120,
    seed: 1,
  });
  const second = await segmentChain({
    ordinal: 2,
    segmentId: "segment_chapter_001_002",
    sourceStart: 121,
    sourceEnd: 260,
    seed: 2,
  });
  const plan = createChapterAssemblyPlan(assemblyInput([
    {
      ...first,
      trimStartMs: 100,
      trimEndMs: 100,
      fadeInMs: 40,
      fadeOutMs: 60,
      gapAfterMs: 200,
    },
    {
      ...second,
      gapBeforeMs: 100,
      fadeInMs: 50,
      fadeOutMs: 50,
    },
  ]));

  assertChapterAssemblyPlan(plan);
  assert.equal(plan.segments.length, 2);
  assert.equal(plan.sourceDurationMs, 2_000);
  assert.equal(plan.segments[0]?.timelineStartMs, 0);
  assert.equal(plan.segments[0]?.timelineEndMs, 800);
  assert.equal(plan.segments[1]?.timelineStartMs, 1_100);
  assert.equal(plan.segments[1]?.timelineEndMs, 2_100);
  assert.equal(plan.renderedDurationMs, 2_100);
  assert.match(plan.fingerprint, /^[a-f0-9]{64}$/u);

  const publicView = chapterAssemblyPublicView(plan);
  const serialised = JSON.stringify(publicView);
  assert.equal(publicView.segmentCount, 2);
  assert.equal(publicView.renderedDurationMs, 2_100);
  for (const forbidden of [
    manuscriptSourceHash,
    rightsFingerprint,
    first.audioCandidate.id,
    first.audioCandidate.takeId!,
    first.transcriptArtifact.id,
    first.engineeringArtifact.id,
    "provider_chapter_assembly",
    "director_chapter_assembly_001",
  ]) assert.equal(serialised.includes(forbidden), false);
});

test("unapproved audio and ineligible engineering cannot enter assembly", async () => {
  const chain = await segmentChain({
    ordinal: 1,
    segmentId: "segment_chapter_002_001",
    sourceStart: 0,
    sourceEnd: 100,
    seed: 3,
  });
  const unapproved = {
    ...chain.audioCandidate,
    review: { required: true as const, status: "pending" as const },
  };
  assert.throws(
    () => createChapterAssemblyPlan(assemblyInput([{
      ...chain,
      audioCandidate: unapproved,
    }])),
    /ARTIFACT_FINGERPRINT_MISMATCH|CHAPTER_ASSEMBLY_AUDIO_REVIEW_APPROVAL_REQUIRED/u,
  );

  const failed = await segmentChain({
    ordinal: 1,
    segmentId: "segment_chapter_002_002",
    sourceStart: 0,
    sourceEnd: 100,
    seed: 4,
    rmsDb: -30,
  });
  assert.equal(failed.engineeringEvidence.eligible, false);
  assert.throws(
    () => createChapterAssemblyPlan(assemblyInput([failed])),
    /CHAPTER_ASSEMBLY_ENGINEERING_INELIGIBLE/u,
  );
});

test("scope, parent, content and rights drift fail closed", async () => {
  const chain = await segmentChain({
    ordinal: 1,
    segmentId: "segment_chapter_003_001",
    sourceStart: 0,
    sourceEnd: 100,
    seed: 5,
  });
  assert.throws(
    () => createChapterAssemblyPlan(assemblyInput([{
      ...chain,
      segmentId: "segment_chapter_003_other",
    }])),
    /CHAPTER_ASSEMBLY_AUDIO_SCOPE_MISMATCH/u,
  );

  assert.throws(
    () => createChapterAssemblyPlan(assemblyInput([{
      ...chain,
      transcriptArtifact: {
        ...chain.transcriptArtifact,
        provenance: {
          ...chain.transcriptArtifact.provenance,
          parentArtifactIds: [],
        },
      },
    }])),
    /ARTIFACT_FINGERPRINT_MISMATCH|CHAPTER_ASSEMBLY_TRANSCRIPT_PARENT_MISMATCH/u,
  );

  assert.throws(
    () => createChapterAssemblyPlan(assemblyInput([{
      ...chain,
      engineeringEvidence: {
        ...chain.engineeringEvidence,
        inputContentHash: "f".repeat(64),
      },
    }])),
    /AUDIO_ENGINEERING_FINGERPRINT_INVALID|AUDIO_ENGINEERING_EVIDENCE_FINGERPRINT_MISMATCH|CHAPTER_ASSEMBLY_ENGINEERING_CONTENT_MISMATCH/u,
  );

  const otherRights = rights({ rightsFingerprint: "e".repeat(64) });
  const drifted = await segmentChain({
    ordinal: 1,
    segmentId: "segment_chapter_003_002",
    sourceStart: 0,
    sourceEnd: 100,
    seed: 6,
    rights: otherRights,
  });
  assert.throws(
    () => createChapterAssemblyPlan({
      ...assemblyInput([drifted]),
      segments: [{
        ...drifted,
        transcriptArtifact: chain.transcriptArtifact,
      }],
    }),
    /CHAPTER_ASSEMBLY_TRANSCRIPT_SCOPE_MISMATCH|CHAPTER_ASSEMBLY_RIGHTS_SCOPE_MISMATCH/u,
  );
});

test("source overlap, duplicate takes and invalid edit bounds are rejected", async () => {
  const first = await segmentChain({
    ordinal: 1,
    segmentId: "segment_chapter_004_001",
    sourceStart: 0,
    sourceEnd: 150,
    seed: 7,
  });
  const second = await segmentChain({
    ordinal: 2,
    segmentId: "segment_chapter_004_002",
    sourceStart: 140,
    sourceEnd: 260,
    seed: 8,
  });
  assert.throws(
    () => createChapterAssemblyPlan(assemblyInput([first, second])),
    /CHAPTER_ASSEMBLY_SOURCE_OVERLAP/u,
  );

  assert.throws(
    () => createChapterAssemblyPlan(assemblyInput([
      first,
      {
        ...second,
        sourceStart: 151,
        audioCandidate: first.audioCandidate,
        transcriptArtifact: first.transcriptArtifact,
        engineeringArtifact: first.engineeringArtifact,
        engineeringEvidence: first.engineeringEvidence,
      },
    ])),
    /CHAPTER_ASSEMBLY_AUDIO_SCOPE_MISMATCH|CHAPTER_ASSEMBLY_TAKE_DUPLICATE/u,
  );

  assert.throws(
    () => createChapterAssemblyPlan(assemblyInput([{
      ...first,
      trimStartMs: 600,
    }])),
    /CHAPTER_ASSEMBLY_TRIM_START_INVALID/u,
  );
  assert.throws(
    () => createChapterAssemblyPlan(assemblyInput([{
      ...first,
      trimStartMs: 500,
      trimEndMs: 500,
    }])),
    /CHAPTER_ASSEMBLY_TRIM_CONSUMES_AUDIO/u,
  );
  assert.throws(
    () => createChapterAssemblyPlan(assemblyInput([{
      ...first,
      gapBeforeMs: 5_001,
    }])),
    /CHAPTER_ASSEMBLY_GAP_BEFORE_INVALID/u,
  );
});

test("expired rights and output-profile drift block assembly", async () => {
  const expired = await segmentChain({
    ordinal: 1,
    segmentId: "segment_chapter_005_001",
    sourceStart: 0,
    sourceEnd: 100,
    seed: 9,
    rights: rights({ expiresAt: "2026-07-26T00:00:00.000Z" }),
  });
  assert.throws(
    () => createChapterAssemblyPlan(assemblyInput([expired])),
    /CHAPTER_ASSEMBLY_RIGHTS_EXPIRED/u,
  );

  const normal = await segmentChain({
    ordinal: 1,
    segmentId: "segment_chapter_005_002",
    sourceStart: 0,
    sourceEnd: 100,
    seed: 10,
  });
  assert.throws(
    () => createChapterAssemblyPlan({
      ...assemblyInput([normal]),
      output: {
        format: "wav",
        sampleRateHz: 48_000,
        channels: 1,
        bitDepth: 24,
      },
    }),
    /CHAPTER_ASSEMBLY_OUTPUT_PROFILE_MISMATCH/u,
  );
});

test("persisted plan tampering is detected", async () => {
  const chain = await segmentChain({
    ordinal: 1,
    segmentId: "segment_chapter_006_001",
    sourceStart: 0,
    sourceEnd: 100,
    seed: 11,
  });
  const plan = createChapterAssemblyPlan(assemblyInput([chain]));
  assert.throws(
    () => assertChapterAssemblyPlan({
      ...plan,
      renderedDurationMs: plan.renderedDurationMs + 1,
    }),
    /CHAPTER_ASSEMBLY_TOTALS_MISMATCH|CHAPTER_ASSEMBLY_FINGERPRINT_MISMATCH/u,
  );
  assert.throws(
    () => assertChapterAssemblyPlan({
      ...plan,
      segments: [{
        ...plan.segments[0]!,
        timelineEndMs: plan.segments[0]!.timelineEndMs + 1,
      }],
    }),
    /CHAPTER_ASSEMBLY_TIMELINE_END_INVALID|CHAPTER_ASSEMBLY_SEGMENT_FINGERPRINT_MISMATCH/u,
  );
});
