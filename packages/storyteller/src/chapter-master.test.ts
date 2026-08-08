import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ACX_AUDIOBOOK_PROFILE,
} from "./index.js";
import {
  analyseAudioEngineering,
  type AudioEngineeringCommand,
  type AudioEngineeringCommandResult,
  type AudioEngineeringRunner,
} from "./audio-engineering.js";
import {
  createArtifactRecord,
  verifyArtifactIntegrity,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import { approveNarrationTakeReviewFixture } from "../test-support/narration-take-review-fixture.js";
import { FileArtifactRegistry } from "./artifact-store.js";
import { createChapterAssemblyPlan } from "./chapter-assembly.js";
import {
  ChapterMasterError,
  chapterMasterPublicView,
  ingestChapterMaster,
} from "./chapter-master.js";
import {
  renderChapterAssembly,
  type ChapterRenderRequest,
  type ChapterRenderRunner,
  type ChapterSourceResolver,
} from "./chapter-render.js";
import { createGenerationAudioEngineeringPolicy } from "./generation-audio-engineering.js";
import { FilePrivateObjectStore } from "./private-object-store.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:00:01.000Z");
const t2 = new Date("2026-07-27T00:00:02.000Z");
const t3 = new Date("2026-07-27T00:00:30.000Z");
const t4 = new Date("2026-07-27T00:00:31.000Z");
const manuscriptHash = "a".repeat(64);
const requestHash = "b".repeat(64);
const rightsFingerprint = "c".repeat(64);

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function wavBytes(seed: number): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    seed, 0x01, 0x02, 0x03,
  ]);
}

function rights(overrides: Partial<ArtifactRightsSnapshot> = {}): ArtifactRightsSnapshot {
  return {
    rightsEvidenceId: "rights_chapter_master_001",
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
  bytes: Uint8Array;
  sourceContentHash: string;
  parentArtifactIds: readonly string[];
  mimeType: string;
  format: string;
  reviewRequired: boolean;
  takeId: string;
  generationRequestHash: string;
}>): ArtifactRecord {
  const initial = createArtifactRecord({
    id: input.id,
    kind: input.kind,
    projectId: "project_chapter_master_001",
    jobId: "job_chapter_master_source_001",
    segmentId: "segment_chapter_master_001",
    takeId: input.takeId,
    storage: {
      driver: "private-object-store",
      provider: "storyteller-master-test",
      container: "private-master-test",
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
      createdByActorId: "worker_chapter_master_source_001",
      sourceContentHash: input.sourceContentHash,
      generationRequestHash: input.generationRequestHash,
      ...(input.kind === "audio-candidate"
        ? { providerId: "provider_master", adapterVersion: "1.0.0" }
        : {}),
      parentArtifactIds: input.parentArtifactIds,
    },
    rights: rights(),
    reviewRequired: input.reviewRequired,
  }, t0);
  const verified = verifyArtifactIntegrity(initial, {
    observedContentHash: initial.integrity.contentHash,
    observedByteCount: initial.integrity.byteCount,
    checkedByActorId: "verifier_chapter_master_source_001",
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: t1,
  });
  return verified;
}

function result(stdout = "", stderr = ""): AudioEngineeringCommandResult {
  return { exitCode: 0, stdout, stderr, durationMs: 5 };
}

class EngineeringRunner implements AudioEngineeringRunner {
  constructor(
    readonly byteCount: number,
    readonly durationSeconds: number,
    readonly rmsDb = -20,
    readonly sampleRateHz = 44_100,
    readonly channels = 1,
  ) {}

  async run(command: AudioEngineeringCommand): Promise<AudioEngineeringCommandResult> {
    switch (command.stage) {
      case "ffprobe-version":
        return result("ffprobe version 7.1 fixture\n");
      case "ffmpeg-version":
        return result("ffmpeg version 7.1 fixture\n");
      case "probe":
        return result(JSON.stringify({
          streams: [{
            codec_type: "audio",
            codec_name: "pcm_s24le",
            sample_rate: String(this.sampleRateHz),
            channels: this.channels,
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
        return result([
          `lavfi.astats.Overall.RMS_level=${this.rmsDb.toFixed(4)}`,
          "lavfi.astats.Overall.Peak_level=-4.0000",
          "lavfi.astats.Overall.Noise_floor=-66.0000",
          "lavfi.astats.Overall.Peak_count=0",
        ].join("\n"));
      case "loudnorm":
        return result("", JSON.stringify({
          input_i: "-20.20",
          input_tp: "-4.10",
          input_lra: "4.20",
          input_thresh: "-30.20",
          target_offset: "0.10",
        }));
      case "silence":
        return result();
    }
  }
}

async function sourceCandidateChain(input: Readonly<{
  variant: "primary" | "alternative";
  seed: number;
  generationRequestHash: string;
}>) {
  const takeId = `take_chapter_master_source_001_${input.variant}`;
  const sourceBytes = wavBytes(input.seed);
  const audio = verifiedArtifact({
    id: `artifact_audio_chapter_master_source_001_${input.variant}`,
    kind: "audio-candidate",
    bytes: sourceBytes,
    sourceContentHash: manuscriptHash,
    parentArtifactIds: [],
    mimeType: "audio/wav",
    format: "wav",
    reviewRequired: true,
    takeId,
    generationRequestHash: input.generationRequestHash,
  });
  const transcriptBytes = new TextEncoder().encode(`Aelwyn waited. ${input.variant}`);
  const transcript = verifiedArtifact({
    id: `artifact_transcript_chapter_master_source_001_${input.variant}`,
    kind: "transcript",
    bytes: transcriptBytes,
    sourceContentHash: manuscriptHash,
    parentArtifactIds: [audio.id],
    mimeType: "text/plain",
    format: "txt",
    reviewRequired: false,
    takeId,
    generationRequestHash: input.generationRequestHash,
  });
  const evidence = await analyseAudioEngineering({
    audioPath: `/private/chapter-master/source-${input.variant}.wav`,
    inputContentHash: audio.integrity.contentHash,
    inputByteCount: audio.integrity.byteCount,
    profile: ACX_AUDIOBOOK_PROFILE,
    profileVersion: "acx-2026-07",
    profileReviewedAt: "2026-07-01T00:00:00.000Z",
    profileSourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner: new EngineeringRunner(audio.integrity.byteCount, 1),
    now: t2,
  });
  const engineeringBytes = new TextEncoder().encode(JSON.stringify(evidence));
  const engineering = verifiedArtifact({
    id: `artifact_engineering_chapter_master_source_001_${input.variant}`,
    kind: "audio-analysis",
    bytes: engineeringBytes,
    sourceContentHash: audio.integrity.contentHash,
    parentArtifactIds: [audio.id],
    mimeType: "application/json",
    format: "json",
    reviewRequired: false,
    takeId,
    generationRequestHash: input.generationRequestHash,
  });
  return {
    sourceBytes,
    audioCandidate: audio,
    transcriptArtifact: transcript,
    engineeringArtifact: engineering,
    engineeringEvidence: evidence,
  };
}

async function sourcePlan() {
  const primary = await sourceCandidateChain({
    variant: "primary",
    seed: 1,
    generationRequestHash: requestHash,
  });
  const alternative = await sourceCandidateChain({
    variant: "alternative",
    seed: 2,
    generationRequestHash: "d".repeat(64),
  });
  const approved = approveNarrationTakeReviewFixture({
    sessionId: "narration_take_review_chapter_master_001",
    performanceContextFingerprint: "e".repeat(64),
    candidates: [
      { ...primary, score: 5 },
      { ...alternative, score: 4 },
    ],
    selectedTakeId: primary.audioCandidate.takeId!,
    editorialReviewerId: "editorial_reviewer_chapter_master_001",
    engineeringReviewerId: "engineering_reviewer_chapter_master_001",
    directorId: "director_chapter_master_source_001",
    createdAt: t2,
  });
  const plan = createChapterAssemblyPlan({
    id: "assembly_chapter_master_001",
    projectId: "project_chapter_master_001",
    chapterId: "chapter_master_001",
    manuscriptSourceHash: manuscriptHash,
    policy: {
      id: "evavo-master-test-policy",
      version: "2026.07",
      maximumTrimMs: 500,
      maximumGapMs: 5_000,
      maximumFadeMs: 500,
      requireApprovedCandidates: true,
      requireApprovedTakeSelection: true,
    },
    output: {
      format: "wav",
      sampleRateHz: 44_100,
      channels: 1,
      bitDepth: 24,
    },
    segments: [{
      ordinal: 1,
      segmentId: "segment_chapter_master_001",
      sourceStart: 0,
      sourceEnd: 100,
      audioCandidate: approved.audioCandidate,
      transcriptArtifact: primary.transcriptArtifact,
      engineeringArtifact: primary.engineeringArtifact,
      engineeringEvidence: primary.engineeringEvidence,
      takeReviewSession: approved.session,
      trimStartMs: 100,
      trimEndMs: 100,
      gapBeforeMs: 100,
      gapAfterMs: 200,
    }],
    createdByActorId: "editor_chapter_master_001",
    createdAt: t3,
  });
  return { plan, sourceBytes: primary.sourceBytes, audio: approved.audioCandidate };
}

class SourceResolver implements ChapterSourceResolver {
  constructor(
    readonly artifact: ArtifactRecord,
  ) {}

  async resolve() {
    return {
      artifactId: this.artifact.id,
      privatePath: "/private/chapter-master/source.wav",
      contentHash: this.artifact.integrity.contentHash,
      byteCount: this.artifact.integrity.byteCount,
      async dispose() {},
    };
  }
}

class RenderRunner implements ChapterRenderRunner {
  constructor(readonly bytes = wavBytes(9)) {}

  async inspectVersion(): Promise<string> {
    return "ffmpeg version 7.1 fixture";
  }

  async render(_request: ChapterRenderRequest): Promise<Uint8Array> {
    return this.bytes;
  }
}

async function renderFixture() {
  const source = await sourcePlan();
  const render = await renderChapterAssembly({
    plan: source.plan,
    sources: new SourceResolver(source.audio),
    runner: new RenderRunner(),
    renderedAt: t4,
  });
  return { ...source, render };
}

function engineeringPolicy(input: Readonly<{
  byteCount: number;
  durationSeconds: number;
  rmsDb?: number;
  sampleRateHz?: number;
  channels?: number;
  temporaryRoot?: string;
}>) {
  return createGenerationAudioEngineeringPolicy({
    profile: ACX_AUDIOBOOK_PROFILE,
    externalVersion: "acx-2026-07",
    reviewedAt: "2026-07-01T00:00:00.000Z",
    sourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner: new EngineeringRunner(
      input.byteCount,
      input.durationSeconds,
      input.rmsDb ?? -20,
      input.sampleRateHz ?? 44_100,
      input.channels ?? 1,
    ),
    temporaryRoot: input.temporaryRoot,
    now: t4,
  });
}

async function withStores(
  run: (input: Readonly<{
    root: string;
    objectStore: FilePrivateObjectStore;
    registry: FileArtifactRegistry;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-chapter-master-"));
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

test("rendered chapter becomes an assembly manifest, render evidence, reviewed master candidate and post-render analysis", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const fixture = await renderFixture();
    const chain = await ingestChapterMaster(objectStore, registry, {
      plan: fixture.plan,
      render: fixture.render,
      rights: rights(),
      actorId: "worker_chapter_master_001",
      verifierActorId: "verifier_chapter_master_001",
      engineering: engineeringPolicy({
        byteCount: fixture.render.bytes.byteLength,
        durationSeconds: fixture.plan.renderedDurationMs / 1_000,
        temporaryRoot: join(root, "engineering-temp"),
      }),
      now: t4,
    });

    assert.equal(chain.eligibleForReview, true);
    assert.equal(chain.findingCodes.length, 0);
    assert.equal(chain.expectedDurationMs, fixture.plan.renderedDurationMs);
    assert.equal(chain.observedDurationMs, fixture.plan.renderedDurationMs);
    assert.equal(chain.durationDriftMs, 0);
    assert.equal(chain.chapterMaster.payload.kind, "chapter-master");
    assert.equal(chain.chapterMaster.payload.verification.status, "verified");
    assert.equal(chain.chapterMaster.payload.review.status, "pending");
    assert.equal(chain.assemblyManifest.payload.kind, "audio-analysis");
    assert.equal(chain.renderEvidence.payload.kind, "audio-analysis");
    assert.equal(chain.postRenderEngineering.ingest.envelope.payload.kind, "audio-analysis");
    assert.deepEqual(
      chain.renderEvidence.payload.provenance.parentArtifactIds,
      [chain.assemblyManifest.payload.id],
    );
    assert.deepEqual(
      chain.chapterMaster.payload.provenance.parentArtifactIds,
      [chain.renderEvidence.payload.id],
    );
    assert.deepEqual(
      chain.postRenderEngineering.ingest.envelope.payload.provenance.parentArtifactIds,
      [chain.chapterMaster.payload.id],
    );
    assert.equal((await registry.list()).length, 4);

    const publicView = chapterMasterPublicView(chain);
    const serialised = JSON.stringify(publicView);
    assert.equal(publicView.eligibleForReview, true);
    assert.equal(publicView.expectedDurationMs, fixture.plan.renderedDurationMs);
    assert.equal(publicView.durationDriftMs, 0);
    for (const forbidden of [
      manuscriptHash,
      rightsFingerprint,
      fixture.audio.id,
      chain.assemblyManifest.payload.id,
      chain.renderEvidence.payload.id,
      "worker_chapter_master_001",
      "verifier_chapter_master_001",
      "/private/",
      "acx-audio-submission-requirements-reviewed-2026-07",
    ]) assert.equal(serialised.includes(forbidden), false);
  });
});

test("identical master ingestion is idempotent", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const fixture = await renderFixture();
    const input = {
      plan: fixture.plan,
      render: fixture.render,
      rights: rights(),
      actorId: "worker_chapter_master_001",
      verifierActorId: "verifier_chapter_master_001",
      engineering: engineeringPolicy({
        byteCount: fixture.render.bytes.byteLength,
        durationSeconds: fixture.plan.renderedDurationMs / 1_000,
        temporaryRoot: join(root, "engineering-temp"),
      }),
      now: t4,
    };
    const first = await ingestChapterMaster(objectStore, registry, input);
    const second = await ingestChapterMaster(objectStore, registry, input);
    assert.equal(second.fingerprint, first.fingerprint);
    assert.equal(second.chapterMaster.payload.id, first.chapterMaster.payload.id);
    assert.equal((await registry.list()).length, 4);
  });
});

test("failed engineering retains evidence and quarantines the master", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const fixture = await renderFixture();
    const chain = await ingestChapterMaster(objectStore, registry, {
      plan: fixture.plan,
      render: fixture.render,
      rights: rights(),
      actorId: "worker_chapter_master_001",
      verifierActorId: "verifier_chapter_master_001",
      engineering: engineeringPolicy({
        byteCount: fixture.render.bytes.byteLength,
        durationSeconds: fixture.plan.renderedDurationMs / 1_000,
        rmsDb: -30,
        temporaryRoot: join(root, "engineering-temp"),
      }),
      now: t4,
    });

    assert.equal(chain.eligibleForReview, false);
    assert.equal(chain.findingCodes.includes("AUDIO_RMS_OUT_OF_RANGE"), true);
    assert.equal(chain.chapterMaster.payload.verification.status, "quarantined");
    assert.equal(chain.chapterMaster.payload.quarantine?.code, "CHAPTER_MASTER_ENGINEERING_INELIGIBLE");
    assert.equal(chain.postRenderEngineering.ingest.accepted, true);
    assert.equal(chain.postRenderEngineering.ingest.envelope.payload.verification.status, "verified");
    assert.equal((await registry.list()).length, 4);
  });
});

test("duration and output-profile drift quarantine the master with explicit findings", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const fixture = await renderFixture();
    const chain = await ingestChapterMaster(objectStore, registry, {
      plan: fixture.plan,
      render: fixture.render,
      rights: rights(),
      actorId: "worker_chapter_master_001",
      engineering: engineeringPolicy({
        byteCount: fixture.render.bytes.byteLength,
        durationSeconds: fixture.plan.renderedDurationMs / 1_000 + 0.5,
        sampleRateHz: 48_000,
        channels: 2,
        temporaryRoot: join(root, "engineering-temp"),
      }),
      maximumDurationDriftMs: 100,
      now: t4,
    });

    assert.equal(chain.eligibleForReview, false);
    assert.equal(chain.findingCodes.includes("CHAPTER_MASTER_DURATION_DRIFT"), true);
    assert.equal(chain.findingCodes.includes("CHAPTER_MASTER_SAMPLE_RATE_DRIFT"), true);
    assert.equal(chain.findingCodes.includes("CHAPTER_MASTER_CHANNEL_DRIFT"), true);
    assert.equal(chain.durationDriftMs, 500);
    assert.equal(chain.chapterMaster.payload.verification.status, "quarantined");
  });
});

test("render tampering and rights drift block before artifact creation", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const fixture = await renderFixture();
    await assert.rejects(
      ingestChapterMaster(objectStore, registry, {
        plan: fixture.plan,
        render: {
          ...fixture.render,
          bytes: wavBytes(8),
        },
        rights: rights(),
        actorId: "worker_chapter_master_001",
        engineering: engineeringPolicy({
          byteCount: fixture.render.bytes.byteLength,
          durationSeconds: fixture.plan.renderedDurationMs / 1_000,
          temporaryRoot: join(root, "engineering-temp"),
        }),
        now: t4,
      }),
      /CHAPTER_MASTER_RENDER_OUTPUT_MISMATCH/u,
    );
    assert.equal((await registry.list()).length, 0);

    await assert.rejects(
      ingestChapterMaster(objectStore, registry, {
        plan: fixture.plan,
        render: fixture.render,
        rights: rights({ rightsFingerprint: "f".repeat(64) }),
        actorId: "worker_chapter_master_001",
        engineering: engineeringPolicy({
          byteCount: fixture.render.bytes.byteLength,
          durationSeconds: fixture.plan.renderedDurationMs / 1_000,
          temporaryRoot: join(root, "engineering-temp"),
        }),
        now: t4,
      }),
      /CHAPTER_MASTER_RIGHTS_SCOPE_MISMATCH/u,
    );
    assert.equal((await registry.list()).length, 0);
  });
});

test("expired rights and pre-aborted operation fail before persistence", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const fixture = await renderFixture();
    await assert.rejects(
      ingestChapterMaster(objectStore, registry, {
        plan: fixture.plan,
        render: fixture.render,
        rights: rights({ expiresAt: "2026-07-26T00:00:00.000Z" }),
        actorId: "worker_chapter_master_001",
        engineering: engineeringPolicy({
          byteCount: fixture.render.bytes.byteLength,
          durationSeconds: fixture.plan.renderedDurationMs / 1_000,
          temporaryRoot: join(root, "engineering-temp"),
        }),
        now: t4,
      }),
      /CHAPTER_MASTER_RIGHTS_EXPIRED/u,
    );

    const controller = new AbortController();
    controller.abort(new ChapterMasterError("CHAPTER_MASTER_OPERATOR_ABORTED"));
    await assert.rejects(
      ingestChapterMaster(objectStore, registry, {
        plan: fixture.plan,
        render: fixture.render,
        rights: rights(),
        actorId: "worker_chapter_master_001",
        engineering: engineeringPolicy({
          byteCount: fixture.render.bytes.byteLength,
          durationSeconds: fixture.plan.renderedDurationMs / 1_000,
          temporaryRoot: join(root, "engineering-temp"),
        }),
        now: t4,
        signal: controller.signal,
      }),
      /CHAPTER_MASTER_ABORTED/u,
    );
    assert.equal((await registry.list()).length, 0);
  });
});

test("master chain tampering is detected by the public projection", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const fixture = await renderFixture();
    const chain = await ingestChapterMaster(objectStore, registry, {
      plan: fixture.plan,
      render: fixture.render,
      rights: rights(),
      actorId: "worker_chapter_master_001",
      engineering: engineeringPolicy({
        byteCount: fixture.render.bytes.byteLength,
        durationSeconds: fixture.plan.renderedDurationMs / 1_000,
        temporaryRoot: join(root, "engineering-temp"),
      }),
      now: t4,
    });
    assert.throws(
      () => chapterMasterPublicView({
        ...chain,
        durationDriftMs: chain.durationDriftMs + 1,
      }),
      /CHAPTER_MASTER_CHAIN_FINGERPRINT_MISMATCH/u,
    );
  });
});
