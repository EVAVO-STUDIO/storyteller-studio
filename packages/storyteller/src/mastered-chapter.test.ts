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
import { createGenerationAudioEngineeringPolicy } from "./generation-audio-engineering.js";
import { ACX_AUDIOBOOK_PROFILE, stableHash } from "./index.js";
import {
  MasteredChapterError,
  assertMasteredChapterArtifactChain,
  createMasteredChapterComparisonPolicy,
  ingestMasteredChapter,
  masteredChapterPublicView,
} from "./mastered-chapter.js";
import { createMasteringPlan, type MasteringOperation } from "./mastering-plan.js";
import type {
  ChapterRenderRequest,
  ChapterRenderRunner,
} from "./chapter-render.js";
import {
  renderMasteringPlan,
  type MasteringSourceResolver,
  type ResolvedMasteringSource,
} from "./mastering-render.js";
import { FilePrivateObjectStore } from "./private-object-store.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:00:01.000Z");
const t2 = new Date("2026-07-27T00:00:02.000Z");
const t3 = new Date("2026-07-27T00:00:03.000Z");
const t4 = new Date("2026-07-27T00:00:04.000Z");
const t5 = new Date("2026-07-27T00:00:05.000Z");
const rightsFingerprint = "a".repeat(64);

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
    rightsEvidenceId: "rights_mastered_chapter_001",
    rightsFingerprint,
    allowedUses: ["audiobook"],
    commercialUseApproved: true,
    expiresAt: "2028-07-27T00:00:00.000Z",
    retainUntil: "2033-07-27T00:00:00.000Z",
    deletionRequiredAt: "2034-07-27T00:00:00.000Z",
    ...overrides,
  };
}

function result(stdout = "", stderr = ""): AudioEngineeringCommandResult {
  return { exitCode: 0, stdout, stderr, durationMs: 5 };
}

class EngineeringRunner implements AudioEngineeringRunner {
  constructor(readonly input: Readonly<{
    byteCount: number;
    durationSeconds: number;
    rmsDb: number;
    peakDb: number;
    truePeakDb: number;
    noiseFloorDb: number;
    sampleRateHz?: number;
    channels?: number;
  }>) {}

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
            sample_rate: String(this.input.sampleRateHz ?? 44_100),
            channels: this.input.channels ?? 1,
            bit_rate: "192000",
            duration: this.input.durationSeconds.toFixed(6),
          }],
          format: {
            format_name: "wav",
            duration: this.input.durationSeconds.toFixed(6),
            bit_rate: "192000",
            size: String(this.input.byteCount),
          },
        }));
      case "astats":
        return result([
          `lavfi.astats.Overall.RMS_level=${this.input.rmsDb.toFixed(4)}`,
          `lavfi.astats.Overall.Peak_level=${this.input.peakDb.toFixed(4)}`,
          `lavfi.astats.Overall.Noise_floor=${this.input.noiseFloorDb.toFixed(4)}`,
          "lavfi.astats.Overall.Peak_count=0",
        ].join("\n"));
      case "loudnorm":
        return result("", JSON.stringify({
          input_i: this.input.rmsDb.toFixed(4),
          input_tp: this.input.truePeakDb.toFixed(4),
          input_lra: "4.20",
          input_thresh: "-30.20",
          target_offset: "0.10",
        }));
      case "silence":
        return result();
    }
  }
}

function verifiedArtifact(input: Readonly<{
  id: string;
  kind: "chapter-master" | "audio-analysis";
  bytes: Uint8Array;
  sourceContentHash: string;
  parentArtifactIds: readonly string[];
  reviewRequired: boolean;
}>): ArtifactRecord {
  const initial = createArtifactRecord({
    id: input.id,
    kind: input.kind,
    projectId: "project_mastered_chapter_001",
    jobId: "job_source_mastered_chapter_001",
    segmentId: "chapter_mastered_001",
    takeId: "take_source_mastered_chapter_001",
    storage: {
      driver: "private-object-store",
      provider: "storyteller-mastered-test",
      container: "private-mastered-test",
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
      createdByActorId: "worker_mastered_source_001",
      sourceContentHash: input.sourceContentHash,
      generationRequestHash: "b".repeat(64),
      parentArtifactIds: input.parentArtifactIds,
    },
    rights: rights(),
    reviewRequired: input.reviewRequired,
  }, t0);
  const verified = verifyArtifactIntegrity(initial, {
    observedContentHash: initial.integrity.contentHash,
    observedByteCount: initial.integrity.byteCount,
    checkedByActorId: "verifier_mastered_source_001",
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: t1,
  });
  return input.reviewRequired
    ? recordArtifactReview(verified, {
        decision: "approved",
        reviewerId: "director_mastered_source_001",
        notes: "Approved as the complete pre-master chapter before mastering.",
        decidedAt: t2,
      })
    : verified;
}

class SourceResolver implements MasteringSourceResolver {
  disposed = 0;
  constructor(
    readonly artifact: ArtifactRecord,
    readonly mutate: Partial<ResolvedMasteringSource> = {},
  ) {}

  async resolve(): Promise<ResolvedMasteringSource> {
    return {
      artifactId: this.artifact.id,
      privatePath: "/private/mastered/source.wav",
      contentHash: this.artifact.integrity.contentHash,
      byteCount: this.artifact.integrity.byteCount,
      dispose: async () => {
        this.disposed += 1;
      },
      ...this.mutate,
    };
  }
}

class RenderRunner implements ChapterRenderRunner {
  constructor(readonly bytes: Uint8Array = wavBytes(9)) {}
  async inspectVersion(): Promise<string> {
    return "ffmpeg version 7.1 fixture";
  }
  async render(_request: ChapterRenderRequest): Promise<Uint8Array> {
    return this.bytes;
  }
}

async function sourceFixture(
  operations: readonly MasteringOperation[] = [{
    kind: "gain",
    gainDb: 4.5,
    rationaleCode: "MASTERING_TRANSPARENT_GAIN",
  }],
): Promise<Readonly<{
  sourceBytes: Uint8Array;
  sourceMaster: ArtifactRecord;
  sourceEngineeringArtifact: ArtifactRecord;
  sourceEngineeringEvidence: AudioEngineeringEvidence;
  plan: ReturnType<typeof createMasteringPlan>;
  render: Awaited<ReturnType<typeof renderMasteringPlan>>;
}>> {
  const sourceBytes = wavBytes(1);
  const sourceMaster = verifiedArtifact({
    id: "artifact_source_mastered_chapter_001",
    kind: "chapter-master",
    bytes: sourceBytes,
    sourceContentHash: "c".repeat(64),
    parentArtifactIds: ["artifact_source_render_001"],
    reviewRequired: true,
  });
  const sourceEngineeringEvidence = await analyseAudioEngineering({
    audioPath: "/private/mastered/source.wav",
    inputContentHash: sourceMaster.integrity.contentHash,
    inputByteCount: sourceMaster.integrity.byteCount,
    profile: ACX_AUDIOBOOK_PROFILE,
    profileVersion: "acx-2026-07",
    profileReviewedAt: "2026-07-01T00:00:00.000Z",
    profileSourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner: new EngineeringRunner({
      byteCount: sourceMaster.integrity.byteCount,
      durationSeconds: 10,
      rmsDb: -24,
      peakDb: -8,
      truePeakDb: -7.8,
      noiseFloorDb: -70,
    }),
    now: t2,
  });
  const sourceEngineeringArtifact = verifiedArtifact({
    id: "artifact_source_mastered_engineering_001",
    kind: "audio-analysis",
    bytes: new TextEncoder().encode(JSON.stringify(sourceEngineeringEvidence)),
    sourceContentHash: sourceMaster.integrity.contentHash,
    parentArtifactIds: [sourceMaster.id],
    reviewRequired: false,
  });
  const plan = createMasteringPlan({
    id: "mastering_plan_mastered_chapter_001",
    projectId: sourceMaster.projectId,
    chapterId: sourceMaster.segmentId!,
    chapterMaster: sourceMaster,
    engineeringArtifact: sourceEngineeringArtifact,
    engineeringEvidence: sourceEngineeringEvidence,
    targetProfile: sourceEngineeringEvidence.profile,
    output: {
      format: "wav",
      sampleRateHz: 44_100,
      channels: 1,
      bitDepth: 24,
    },
    operations,
    rationale: "Apply only approved preservation-first mastering operations and remeasure the result.",
    createdByActorId: "mastering_engineer_001",
    createdAt: t3,
  });
  const render = await renderMasteringPlan({
    plan,
    sourceEngineeringEvidence,
    sources: new SourceResolver(sourceMaster),
    runner: new RenderRunner(),
    renderedAt: t4,
  });
  return {
    sourceBytes,
    sourceMaster,
    sourceEngineeringArtifact,
    sourceEngineeringEvidence,
    plan,
    render,
  };
}

function comparisonPolicy(now = t4) {
  return createMasteredChapterComparisonPolicy({
    id: "mastered-comparison-policy",
    version: "2026.07",
    reviewedAt: "2026-07-01T00:00:00.000Z",
    sourceReference: "evavo-mastered-chapter-comparison-policy-reviewed-2026-07",
    durationToleranceMs: 100,
    rmsToleranceDb: 0.75,
    peakToleranceDb: 0.75,
    truePeakToleranceDb: 0.75,
    noiseFloorToleranceDb: 1.5,
    strictTransparentPrediction: true,
    now,
  });
}

function postEngineeringPolicy(input: Readonly<{
  byteCount: number;
  durationSeconds?: number;
  rmsDb?: number;
  peakDb?: number;
  truePeakDb?: number;
  noiseFloorDb?: number;
  sampleRateHz?: number;
  channels?: number;
  temporaryRoot?: string;
}>) {
  return createGenerationAudioEngineeringPolicy({
    profile: ACX_AUDIOBOOK_PROFILE,
    externalVersion: "acx-2026-07",
    reviewedAt: "2026-07-01T00:00:00.000Z",
    sourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner: new EngineeringRunner({
      byteCount: input.byteCount,
      durationSeconds: input.durationSeconds ?? 10,
      rmsDb: input.rmsDb ?? -19.5,
      peakDb: input.peakDb ?? -3.5,
      truePeakDb: input.truePeakDb ?? -3.3,
      noiseFloorDb: input.noiseFloorDb ?? -65.5,
      sampleRateHz: input.sampleRateHz,
      channels: input.channels,
    }),
    ...(input.temporaryRoot ? { temporaryRoot: input.temporaryRoot } : {}),
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
  const root = await mkdtemp(join(tmpdir(), "storyteller-mastered-chapter-"));
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

async function ingestFixture(input: Readonly<{
  root: string;
  objectStore: FilePrivateObjectStore;
  registry: FileArtifactRegistry;
  source?: Awaited<ReturnType<typeof sourceFixture>>;
  post?: Omit<Parameters<typeof postEngineeringPolicy>[0], "byteCount" | "temporaryRoot">;
  rights?: ArtifactRightsSnapshot;
  comparison?: ReturnType<typeof comparisonPolicy>;
  signal?: AbortSignal;
}>) {
  const source = input.source ?? await sourceFixture();
  return await ingestMasteredChapter(input.objectStore, input.registry, {
    plan: source.plan,
    render: source.render,
    sourceMaster: source.sourceMaster,
    sourceEngineeringArtifact: source.sourceEngineeringArtifact,
    sourceEngineeringEvidence: source.sourceEngineeringEvidence,
    rights: input.rights ?? rights(),
    actorId: "worker_mastered_chapter_001",
    verifierActorId: "verifier_mastered_chapter_001",
    engineering: postEngineeringPolicy({
      byteCount: source.render.bytes.byteLength,
      temporaryRoot: join(input.root, "engineering-temp"),
      ...input.post,
    }),
    comparisonPolicy: input.comparison ?? comparisonPolicy(),
    now: t5,
    ...(input.signal ? { signal: input.signal } : {}),
  });
}

test("mastered chapter stores plan, render, new audio and post-master engineering as one reviewable chain", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const source = await sourceFixture();
    const chain = await ingestFixture({ root, objectStore, registry, source });
    assert.equal(chain.eligibleForReview, true);
    assert.equal(chain.findingCodes.length, 0);
    assert.equal(chain.sourceDurationMs, 10_000);
    assert.equal(chain.comparison.expectedDurationMs, 10_000);
    assert.equal(chain.comparison.observedDurationMs, 10_000);
    assert.equal(chain.comparison.durationDriftMs, 0);
    assert.equal(chain.comparison.strictPrediction, true);
    assert.equal(chain.masteredChapter.payload.kind, "mastered-chapter");
    assert.equal(chain.masteredChapter.payload.verification.status, "verified");
    assert.equal(chain.masteredChapter.payload.review.status, "pending");
    assert.equal(chain.postMasterEngineering.ingest.envelope.payload.kind, "audio-analysis");
    assert.deepEqual(
      chain.masteringRenderArtifact.payload.provenance.parentArtifactIds,
      [chain.masteringPlanArtifact.payload.id],
    );
    assert.equal(
      chain.masteredChapter.payload.provenance.parentArtifactIds.includes(source.sourceMaster.id),
      true,
    );
    assert.deepEqual(
      chain.postMasterEngineering.ingest.envelope.payload.provenance.parentArtifactIds,
      [chain.masteredChapter.payload.id],
    );
    assert.equal((await registry.list()).length, 4);
    assert.doesNotThrow(() => assertMasteredChapterArtifactChain(chain));

    const publicView = masteredChapterPublicView(chain);
    const serialised = JSON.stringify(publicView);
    assert.equal(publicView.eligibleForReview, true);
    assert.equal(publicView.comparisonPolicyVersion, "2026.07");
    for (const forbidden of [
      rightsFingerprint,
      source.sourceMaster.id,
      source.sourceEngineeringArtifact.id,
      chain.masteringPlanArtifact.payload.id,
      chain.masteringRenderArtifact.payload.id,
      "worker_mastered_chapter_001",
      "verifier_mastered_chapter_001",
      "/private/",
      "acx-audio-submission-requirements-reviewed-2026-07",
      "evavo-mastered-chapter-comparison-policy-reviewed-2026-07",
    ]) assert.equal(serialised.includes(forbidden), false);
  });
});

test("identical mastered chapter ingestion is idempotent", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const source = await sourceFixture();
    const first = await ingestFixture({ root, objectStore, registry, source });
    const second = await ingestFixture({ root, objectStore, registry, source });
    assert.equal(second.fingerprint, first.fingerprint);
    assert.equal(second.masteredChapter.payload.id, first.masteredChapter.payload.id);
    assert.equal((await registry.list()).length, 4);
  });
});

test("failed post-master engineering remains verified while the mastered audio is quarantined", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const chain = await ingestFixture({
      root,
      objectStore,
      registry,
      post: { rmsDb: -30, peakDb: -4, truePeakDb: -3.8, noiseFloorDb: -66 },
    });
    assert.equal(chain.eligibleForReview, false);
    assert.equal(chain.findingCodes.includes("AUDIO_RMS_OUT_OF_RANGE"), true);
    assert.equal(chain.findingCodes.includes("MASTERED_CHAPTER_RMS_PREDICTION_DRIFT"), true);
    assert.equal(chain.masteredChapter.payload.verification.status, "quarantined");
    assert.equal(
      chain.masteredChapter.payload.quarantine?.code,
      "MASTERED_CHAPTER_ENGINEERING_INELIGIBLE",
    );
    assert.equal(chain.postMasterEngineering.ingest.accepted, true);
    assert.equal(
      chain.postMasterEngineering.ingest.envelope.payload.verification.status,
      "verified",
    );
  });
});

test("duration, sample-rate and channel drift are explicit quarantine findings", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const chain = await ingestFixture({
      root,
      objectStore,
      registry,
      post: {
        durationSeconds: 10.5,
        sampleRateHz: 48_000,
        channels: 2,
      },
    });
    assert.equal(chain.eligibleForReview, false);
    assert.equal(chain.comparison.durationDriftMs, 500);
    assert.equal(chain.findingCodes.includes("MASTERED_CHAPTER_DURATION_DRIFT"), true);
    assert.equal(chain.findingCodes.includes("MASTERED_CHAPTER_SAMPLE_RATE_DRIFT"), true);
    assert.equal(chain.findingCodes.includes("MASTERED_CHAPTER_CHANNEL_DRIFT"), true);
    assert.equal(chain.masteredChapter.payload.verification.status, "quarantined");
  });
});

test("non-transparent mastering reports prediction drift as review evidence without automatic quarantine", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const source = await sourceFixture([{
      kind: "high-pass",
      frequencyHz: 70,
      slopeDbPerOctave: 12,
      rationaleCode: "MASTERING_HIGH_PASS",
    }]);
    const chain = await ingestFixture({
      root,
      objectStore,
      registry,
      source,
      post: {
        rmsDb: -22.8,
        peakDb: -7.8,
        truePeakDb: -7.6,
        noiseFloorDb: -68,
      },
    });
    assert.equal(chain.comparison.strictPrediction, false);
    assert.equal(chain.findingCodes.includes("MASTERED_CHAPTER_RMS_PREDICTION_DRIFT"), true);
    assert.equal(chain.comparison.findings.some((finding) => finding.severity === "warning"), true);
    assert.equal(chain.eligibleForReview, true);
    assert.equal(chain.masteredChapter.payload.verification.status, "verified");
  });
});

test("render tampering, profile drift, stale rights and aborts fail before a usable chain is created", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const source = await sourceFixture();
    await assert.rejects(
      ingestMasteredChapter(objectStore, registry, {
        plan: source.plan,
        render: { ...source.render, bytes: wavBytes(8) },
        sourceMaster: source.sourceMaster,
        sourceEngineeringArtifact: source.sourceEngineeringArtifact,
        sourceEngineeringEvidence: source.sourceEngineeringEvidence,
        rights: rights(),
        actorId: "worker_mastered_chapter_001",
        engineering: postEngineeringPolicy({
          byteCount: source.render.bytes.byteLength,
          temporaryRoot: join(root, "engineering-temp"),
        }),
        comparisonPolicy: comparisonPolicy(),
        now: t5,
      }),
      /MASTERED_CHAPTER_RENDER_BYTES_MISMATCH/u,
    );
    assert.equal((await registry.list()).length, 0);

    const wrongProfile = createGenerationAudioEngineeringPolicy({
      profile: { ...ACX_AUDIOBOOK_PROFILE, id: "different-profile" },
      externalVersion: "different-2026-07",
      reviewedAt: "2026-07-01T00:00:00.000Z",
      sourceReference: "different-reviewed-profile",
      runner: new EngineeringRunner({
        byteCount: source.render.bytes.byteLength,
        durationSeconds: 10,
        rmsDb: -19.5,
        peakDb: -3.5,
        truePeakDb: -3.3,
        noiseFloorDb: -65.5,
      }),
      now: t4,
    });
    await assert.rejects(
      ingestMasteredChapter(objectStore, registry, {
        plan: source.plan,
        render: source.render,
        sourceMaster: source.sourceMaster,
        sourceEngineeringArtifact: source.sourceEngineeringArtifact,
        sourceEngineeringEvidence: source.sourceEngineeringEvidence,
        rights: rights(),
        actorId: "worker_mastered_chapter_001",
        engineering: wrongProfile,
        comparisonPolicy: comparisonPolicy(),
        now: t5,
      }),
      /MASTERED_CHAPTER_ENGINEERING_PROFILE_MISMATCH/u,
    );

    await assert.rejects(
      ingestFixture({
        root,
        objectStore,
        registry,
        source,
        rights: rights({ expiresAt: "2026-07-26T00:00:00.000Z" }),
      }),
      /MASTERED_CHAPTER_RIGHTS_EXPIRED/u,
    );

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      ingestFixture({ root, objectStore, registry, source, signal: controller.signal }),
      /MASTERED_CHAPTER_ABORTED/u,
    );
  });
});

test("comparison policy and artifact-chain tampering fail closed", async () => {
  assert.throws(
    () => createMasteredChapterComparisonPolicy({
      id: "mastered-comparison-policy",
      version: "2026.07",
      reviewedAt: "2026-07-28T00:00:00.000Z",
      sourceReference: "future-policy",
      now: t4,
    }),
    /MASTERED_CHAPTER_COMPARISON_POLICY_REVIEW_IN_FUTURE/u,
  );

  await withStores(async ({ root, objectStore, registry }) => {
    const chain = await ingestFixture({ root, objectStore, registry });
    const policyTampered = {
      ...chain,
      comparisonPolicy: {
        ...chain.comparisonPolicy,
        rmsToleranceDb: chain.comparisonPolicy.rmsToleranceDb + 1,
      },
    };
    assert.throws(
      () => assertMasteredChapterArtifactChain(policyTampered),
      /MASTERED_CHAPTER_COMPARISON_POLICY_FINGERPRINT_INVALID/u,
    );

    const comparisonTampered = {
      ...chain,
      comparison: {
        ...chain.comparison,
        expectedDurationMs: chain.comparison.expectedDurationMs + 1,
      },
    };
    assert.throws(
      () => masteredChapterPublicView(comparisonTampered),
      /MASTERED_CHAPTER_COMPARISON_DURATION_MISMATCH|MASTERED_CHAPTER_COMPARISON_FINGERPRINT_INVALID/u,
    );

    const sourceDurationTampered = {
      ...chain,
      sourceDurationMs: chain.sourceDurationMs + 1,
      fingerprint: stableHash({ altered: true }),
    };
    assert.throws(
      () => assertMasteredChapterArtifactChain(sourceDurationTampered),
      /MASTERED_CHAPTER_CHAIN_FINGERPRINT_INVALID|MASTERED_CHAPTER_DURATION_CHAIN_MISMATCH/u,
    );
  });
});
