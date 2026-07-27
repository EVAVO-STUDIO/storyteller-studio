import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type {
  ChapterRenderRequest,
  ChapterRenderRunner,
} from "./chapter-render.js";
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
} from "./artifact-registry.js";
import {
  createMasteringPlan,
  type MasteringOperation,
  type MasteringPlan,
} from "./mastering-plan.js";
import {
  assertMasteringRenderEvidence,
  buildMasteringFilterScript,
  masteringRenderPublicView,
  renderMasteringPlan,
  type MasteringSourceResolver,
  type ResolvedMasteringSource,
} from "./mastering-render.js";
import { ACX_AUDIOBOOK_PROFILE, stableHash } from "./index.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:00:01.000Z");
const t2 = new Date("2026-07-27T00:00:02.000Z");
const t3 = new Date("2026-07-27T00:00:03.000Z");

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function wavBytes(): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    0x01, 0x02, 0x03, 0x04,
  ]);
}

function commandResult(stdout = "", stderr = ""): AudioEngineeringCommandResult {
  return { exitCode: 0, stdout, stderr, durationMs: 4 };
}

class EngineeringRunner implements AudioEngineeringRunner {
  constructor(
    readonly bytes: number,
    readonly rmsDb = -25,
    readonly peakDb = -8,
    readonly truePeakDb = -9,
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
            duration: "10.000000",
          }],
          format: {
            format_name: "wav",
            duration: "10.000000",
            bit_rate: "192000",
            size: String(this.bytes),
          },
        }));
      case "astats":
        return commandResult([
          `lavfi.astats.Overall.RMS_level=${this.rmsDb}`,
          `lavfi.astats.Overall.Peak_level=${this.peakDb}`,
          "lavfi.astats.Overall.Noise_floor=-70",
          "lavfi.astats.Overall.Peak_count=0",
        ].join("\n"));
      case "loudnorm":
        return commandResult("", JSON.stringify({
          input_i: String(this.rmsDb),
          input_tp: String(this.truePeakDb),
          input_lra: "4.2",
          input_thresh: "-35",
          target_offset: "0",
        }));
      case "silence":
        return commandResult();
    }
  }
}

async function engineeringEvidence(
  input: Readonly<{ rmsDb?: number; peakDb?: number; truePeakDb?: number }> = {},
): Promise<AudioEngineeringEvidence> {
  const bytes = wavBytes();
  return await analyseAudioEngineering({
    audioPath: "/private/mastering/source.wav",
    inputContentHash: hashBytes(bytes),
    inputByteCount: bytes.byteLength,
    profile: ACX_AUDIOBOOK_PROFILE,
    profileVersion: "acx-2026-07",
    profileReviewedAt: "2026-07-01T00:00:00.000Z",
    profileSourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner: new EngineeringRunner(
      bytes.byteLength,
      input.rmsDb ?? -25,
      input.peakDb ?? -8,
      input.truePeakDb ?? -9,
    ),
    now: t2,
  });
}

function verifiedArtifact(input: Readonly<{
  id: string;
  kind: "chapter-master" | "audio-analysis";
  bytes: Uint8Array;
  parentArtifactIds: readonly string[];
  sourceContentHash: string;
  reviewRequired: boolean;
}>): ArtifactRecord {
  const initial = createArtifactRecord({
    id: input.id,
    kind: input.kind,
    projectId: "project_mastering_render_001",
    jobId: "job_mastering_render_001",
    segmentId: "chapter_mastering_render_001",
    takeId: "take_mastering_render_001",
    storage: {
      driver: "private-object-store",
      provider: "storyteller-render-test",
      container: "private-render-test",
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
      createdByActorId: "worker_mastering_render_001",
      sourceContentHash: input.sourceContentHash,
      generationRequestHash: "a".repeat(64),
      parentArtifactIds: input.parentArtifactIds,
    },
    rights: {
      rightsEvidenceId: "rights_mastering_render_001",
      rightsFingerprint: "b".repeat(64),
      allowedUses: ["audiobook"],
      commercialUseApproved: true,
      expiresAt: "2028-07-27T00:00:00.000Z",
    },
    reviewRequired: input.reviewRequired,
  }, t0);
  const verified = verifyArtifactIntegrity(initial, {
    observedContentHash: initial.integrity.contentHash,
    observedByteCount: initial.integrity.byteCount,
    checkedByActorId: "verifier_mastering_render_001",
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: t1,
  });
  return input.reviewRequired
    ? recordArtifactReview(verified, {
        decision: "approved",
        reviewerId: "director_mastering_render_001",
        notes: "Approved before preservation-first mastering.",
        decidedAt: t2,
      })
    : verified;
}

async function plan(
  operations: readonly MasteringOperation[] = [{
    kind: "gain",
    gainDb: 4.5,
    rationaleCode: "MASTERING_TRANSPARENT_GAIN",
  }],
  evidence?: AudioEngineeringEvidence,
): Promise<Readonly<{ plan: MasteringPlan; evidence: AudioEngineeringEvidence }>> {
  const resolvedEvidence = evidence ?? await engineeringEvidence();
  const masterBytes = wavBytes();
  const master = verifiedArtifact({
    id: "artifact_mastering_render_001",
    kind: "chapter-master",
    bytes: masterBytes,
    parentArtifactIds: ["artifact_chapter_render_001"],
    sourceContentHash: "c".repeat(64),
    reviewRequired: true,
  });
  const engineering = verifiedArtifact({
    id: "artifact_mastering_render_engineering_001",
    kind: "audio-analysis",
    bytes: new TextEncoder().encode(JSON.stringify(resolvedEvidence)),
    parentArtifactIds: [master.id],
    sourceContentHash: master.integrity.contentHash,
    reviewRequired: false,
  });
  return {
    evidence: resolvedEvidence,
    plan: createMasteringPlan({
      id: "mastering_plan_render_001",
      projectId: master.projectId,
      chapterId: master.segmentId!,
      chapterMaster: master,
      engineeringArtifact: engineering,
      engineeringEvidence: resolvedEvidence,
      targetProfile: resolvedEvidence.profile,
      output: {
        format: "wav",
        sampleRateHz: 44_100,
        channels: 1,
        bitDepth: 24,
      },
      operations,
      rationale: "Apply only the approved transparent operations and remeasure the result.",
      createdByActorId: "mastering_engineer_001",
      createdAt: t3,
    }),
  };
}

class FixtureResolver implements MasteringSourceResolver {
  disposed = 0;
  resolveCount = 0;
  constructor(readonly mutate: Partial<ResolvedMasteringSource> = {}) {}

  async resolve(snapshot: MasteringPlan["sourceMaster"]): Promise<ResolvedMasteringSource> {
    this.resolveCount += 1;
    return {
      artifactId: snapshot.id,
      privatePath: "/private/mastering/source.wav",
      contentHash: snapshot.contentHash,
      byteCount: snapshot.byteCount,
      dispose: async () => {
        this.disposed += 1;
      },
      ...this.mutate,
    };
  }
}

class FixtureRunner implements ChapterRenderRunner {
  inspectCount = 0;
  renderCount = 0;
  lastRequest: ChapterRenderRequest | undefined;
  constructor(
    readonly bytes: Uint8Array = new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    0x05, 0x06, 0x07, 0x08,
  ]),
  readonly failure?: Error,

  ) {}

  async inspectVersion(): Promise<string> {
    this.inspectCount += 1;
    return "ffmpeg version 7.1 fixture";
  }

  async render(request: ChapterRenderRequest): Promise<Uint8Array> {
    this.renderCount += 1;
    this.lastRequest = request;
    if (this.failure) throw this.failure;
    return this.bytes;
  }
}

test("deterministic mastering filters preserve operation order and explicit output", async () => {
  const highPassGain = await plan([
    {
      kind: "high-pass",
      frequencyHz: 70,
      slopeDbPerOctave: 18,
      rationaleCode: "MASTERING_HIGH_PASS_RUMBLE",
    },
    {
      kind: "gain",
      gainDb: 2.25,
      rationaleCode: "MASTERING_TRANSPARENT_GAIN",
    },
  ]);
  assert.equal(
    buildMasteringFilterScript(highPassGain.plan),
    "[0:a]highpass=f=70:p=1,highpass=f=70:p=2,volume=2.25dB:precision=double,aformat=sample_rates=44100:channel_layouts=mono[out]\n",
  );

  const limiter = await plan([{
    kind: "true-peak-limiter",
    ceilingDb: -3.1,
    maximumReductionDb: 1,
    rationaleCode: "MASTERING_TRUE_PEAK_LIMIT",
  }], await engineeringEvidence({ peakDb: -3.5, truePeakDb: -3.4 }));
  const filter = buildMasteringFilterScript(limiter.plan);
  assert.match(filter, /aresample=192000:resampler=soxr:precision=28/u);
  assert.match(filter, /alimiter=limit=0\.699842:attack=5:release=50:level=0:latency=1/u);
  assert.match(filter, /aresample=44100:resampler=soxr:precision=28/u);
});

test("limiter reduction bounds and high-pass uncertainty fail closed", async () => {
  const excessive = await plan([{
    kind: "true-peak-limiter",
    ceilingDb: -6,
    maximumReductionDb: 1,
    rationaleCode: "MASTERING_LIMITER",
  }], await engineeringEvidence({ peakDb: -2, truePeakDb: -1 }));
  assert.throws(
    () => buildMasteringFilterScript(excessive.plan),
    /MASTERING_RENDER_LIMITER_REDUCTION_EXCEEDS_PLAN/u,
  );

  const uncertain = await plan([
    {
      kind: "high-pass",
      frequencyHz: 70,
      slopeDbPerOctave: 12,
      rationaleCode: "MASTERING_HIGH_PASS",
    },
    {
      kind: "true-peak-limiter",
      ceilingDb: -3.1,
      maximumReductionDb: 1,
      rationaleCode: "MASTERING_LIMITER",
    },
  ], await engineeringEvidence({ peakDb: -4, truePeakDb: -3.8 }));
  assert.throws(
    () => buildMasteringFilterScript(uncertain.plan),
    /MASTERING_RENDER_LIMITER_REDUCTION_REQUIRES_INTERMEDIATE_MEASUREMENT/u,
  );
});

test("mastering render revalidates private source and emits redacted immutable evidence", async () => {
  const data = await plan();
  const resolver = new FixtureResolver();
  const runner = new FixtureRunner();
  const result = await renderMasteringPlan({
    plan: data.plan,
    sourceEngineeringEvidence: data.evidence,
    sources: resolver,
    runner,
    renderedAt: new Date("2026-07-27T00:00:04.000Z"),
  });

  assert.equal(resolver.resolveCount, 1);
  assert.equal(resolver.disposed, 1);
  assert.equal(runner.inspectCount, 1);
  assert.equal(runner.renderCount, 1);
  assert.equal(runner.lastRequest?.sourcePaths[0], "/private/mastering/source.wav");
  assert.equal(runner.lastRequest?.expectedDurationMs, 10_000);
  assert.equal(result.evidence.source.engineeringFingerprint, data.evidence.fingerprint);
  assert.equal(result.evidence.output.contentHash, hashBytes(runner.bytes));
  assert.deepEqual(result.evidence.operationKinds, ["gain"]);
  assertMasteringRenderEvidence(result.evidence);

  const publicView = masteringRenderPublicView(result.evidence);
  const serialised = JSON.stringify(publicView);
  assert.equal(publicView.sourceDurationMs, 10_000);
  for (const forbidden of [
    data.plan.sourceMaster.id,
    data.plan.sourceMaster.contentHash,
    data.evidence.fingerprint,
    "/private/mastering/source.wav",
    "mastering_engineer_001",
    "acx-audio-submission-requirements-reviewed-2026-07",
  ]) assert.equal(serialised.includes(forbidden), false);
});

test("source integrity failure disposes the resolved private source before tool use", async () => {
  const data = await plan();
  const resolver = new FixtureResolver({ contentHash: "d".repeat(64) });
  const runner = new FixtureRunner();
  await assert.rejects(
    renderMasteringPlan({
      plan: data.plan,
      sourceEngineeringEvidence: data.evidence,
      sources: resolver,
      runner,
    }),
    /MASTERING_RENDER_SOURCE_INTEGRITY_MISMATCH/u,
  );
  assert.equal(resolver.disposed, 1);
  assert.equal(runner.inspectCount, 0);
  assert.equal(runner.renderCount, 0);
});

test("source engineering mismatch and pre-abort fail before private source resolution", async () => {
  const data = await plan();
  const resolver = new FixtureResolver();
  const other = await engineeringEvidence({ rmsDb: -24 });
  await assert.rejects(
    renderMasteringPlan({
      plan: data.plan,
      sourceEngineeringEvidence: other,
      sources: resolver,
      runner: new FixtureRunner(),
    }),
    /MASTERING_RENDER_SOURCE_ENGINEERING_MISMATCH/u,
  );
  assert.equal(resolver.resolveCount, 0);

  const controller = new AbortController();
  controller.abort(new Error("MASTERING_RENDER_ABORTED_BY_OPERATOR"));
  await assert.rejects(
    renderMasteringPlan({
      plan: data.plan,
      sourceEngineeringEvidence: data.evidence,
      sources: resolver,
      runner: new FixtureRunner(),
      signal: controller.signal,
    }),
    /MASTERING_RENDER_ABORTED_BY_OPERATOR/u,
  );
  assert.equal(resolver.resolveCount, 0);
});

test("invalid output media and runner failures are stable and always dispose sources", async () => {
  const data = await plan();
  const invalidResolver = new FixtureResolver();
  await assert.rejects(
    renderMasteringPlan({
      plan: data.plan,
      sourceEngineeringEvidence: data.evidence,
      sources: invalidResolver,
      runner: new FixtureRunner(new TextEncoder().encode("not wav")),
    }),
    /MASTERING_RENDER_OUTPUT_MEDIA_INVALID/u,
  );
  assert.equal(invalidResolver.disposed, 1);

  const failedResolver = new FixtureResolver();
  await assert.rejects(
    renderMasteringPlan({
      plan: data.plan,
      sourceEngineeringEvidence: data.evidence,
      sources: failedResolver,
      runner: new FixtureRunner(wavBytes(), new Error("private source and credential detail")),
    }),
    /MASTERING_RENDER_FAILED/u,
  );
  assert.equal(failedResolver.disposed, 1);
});

test("render evidence tampering is detected", async () => {
  const data = await plan();
  const result = await renderMasteringPlan({
    plan: data.plan,
    sourceEngineeringEvidence: data.evidence,
    sources: new FixtureResolver(),
    runner: new FixtureRunner(),
  });
  const { fingerprint: _fingerprint, ...base } = result.evidence;
  const partial = {
    ...base,
    output: {
      ...base.output,
      sampleRateHz: 1_000,
    },
  };
  const tampered = {
    ...partial,
    fingerprint: stableHash(partial),
  } as typeof result.evidence;
  assert.throws(
    () => assertMasteringRenderEvidence(tampered),
    /MASTERING_RENDER_FINGERPRINT_MISMATCH|MASTERING_RENDER_OUTPUT_RATE_INVALID/u,
  );
});
