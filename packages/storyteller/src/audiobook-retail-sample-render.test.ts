import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIOBOOK_RETAIL_SAMPLE_PLAN_SCHEMA_VERSION,
  assertAudiobookRetailSamplePlan,
  type AudiobookRetailSamplePlan,
} from "./audiobook-retail-sample-plan.js";
import {
  assertAudiobookRetailSampleRenderEvidence,
  assertAudiobookRetailSampleRenderMatchesPlan,
  assertAudiobookRetailSampleRenderResult,
  audiobookRetailSampleRenderPublicView,
  buildAudiobookRetailSampleFilter,
  renderAudiobookRetailSample,
  type AudiobookRetailSampleRenderEvidence,
  type AudiobookRetailSampleSourceResolver,
  type ResolvedAudiobookRetailSampleSource,
} from "./audiobook-retail-sample-render.js";
import type {
  AudiobookRetailTrackRenderRequest,
  AudiobookRetailTrackRenderRunner,
} from "./audiobook-retail-track-render.js";
import { stableHash } from "./index.js";

const time = (second: number): Date =>
  new Date(`2026-07-28T00:00:${String(second).padStart(2, "0")}.000Z`);
const t0 = time(0);
const t1 = time(1);
const t2 = time(2);
const t3 = time(3);
const t4 = time(4);

function mp3Bytes(seed: number): Uint8Array {
  return new Uint8Array([0xff, 0xfb, 0x90, 0x64, seed, 0x01, 0x02, 0x03]);
}

function wavBytes(): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    0x01, 0x02, 0x03, 0x04,
  ]);
}

function samplePlan(input: Readonly<{
  id?: string;
  relativeStartMs?: number;
  relativeEndMs?: number;
  createdAt?: Date;
}> = {}): AudiobookRetailSamplePlan {
  const relativeStartMs = input.relativeStartMs ?? 0;
  const relativeEndMs = input.relativeEndMs ?? 120_000;
  const durationMs = relativeEndMs - relativeStartMs;
  const selectionBase = {
    selectedByActorId: "retail_sample_editor_001",
    completeRangeListenConfirmed: true as const,
    representativeOfBookConfirmed: true as const,
    startBoundaryConfirmed: true as const,
    endBoundaryConfirmed: true as const,
    selectionPreference: "preferred-book-beginning" as const,
    selectedAt: t1.toISOString(),
  };
  const selection = Object.freeze({
    ...selectionBase,
    fingerprint: stableHash(selectionBase),
  });
  const safetyBase = {
    reviewedByActorId: "retail_sample_safety_reviewer_001",
    completeRangeListenConfirmed: true as const,
    sourceFromAudiobookConfirmed: true as const,
    explicitContentDetected: false as const,
    unsuitableRetailPreviewContentDetected: false as const,
    approvedForRetailPreview: true as const,
    reviewedAt: t2.toISOString(),
  };
  const safety = Object.freeze({
    ...safetyBase,
    fingerprint: stableHash(safetyBase),
  });
  const partial: Omit<AudiobookRetailSamplePlan, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_SAMPLE_PLAN_SCHEMA_VERSION,
    id: input.id ?? "retail_sample_plan_render_001",
    projectId: "project_retail_sample_render_001",
    bookId: "book_retail_sample_render_001",
    distributor: "acx-audible",
    policy: Object.freeze({
      id: "retail_sample_policy_render_001",
      externalVersion: "acx-2026-07",
      reviewedAt: "2026-07-27T00:00:00.000Z",
      expiresAt: "2027-07-27T00:00:00.000Z",
      fingerprint: "1".repeat(64),
      maximumDurationMs: 300_000,
      explicitContentProhibited: true,
      humanContentSafetyReviewRequired: true,
    }),
    trackPlan: Object.freeze({
      id: "retail_track_plan_render_sample_001",
      fingerprint: "2".repeat(64),
    }),
    encodeChainFingerprint: "3".repeat(64),
    trackReview: Object.freeze({
      sessionId: "retail_track_review_render_sample_001",
      sessionRevision: 8,
      sessionFingerprint: "4".repeat(64),
      approvalFingerprint: "5".repeat(64),
      approvedAt: t0.toISOString(),
    }),
    source: Object.freeze({
      trackOrdinal: 2,
      role: "chapter",
      fileName: "0002Chapter0001.mp3",
      originalArtifactRevision: 2,
      originalArtifactFingerprint: "6".repeat(64),
      approvedArtifactId: "artifact_retail_sample_source_001",
      approvedArtifactRevision: 3,
      approvedArtifactFingerprint: "7".repeat(64),
      approvedArtifactContentHash: "8".repeat(64),
      approvedArtifactByteCount: 12_000_000,
      approvedArtifactReviewFingerprint: "9".repeat(64),
    }),
    range: Object.freeze({
      relativeStartMs,
      relativeEndMs,
      durationMs,
      absoluteBookStartMs: 5_000 + relativeStartMs,
      absoluteBookEndMs: 5_000 + relativeEndMs,
    }),
    output: Object.freeze({
      fileName: "RetailSample.mp3",
      format: "mp3",
      codec: "mp3",
      bitRateMode: "cbr",
      bitRateKbps: 192,
      sampleRateHz: 44_100,
      channels: 1,
    }),
    selection,
    safety,
    status: "ready-for-rendering",
    createdAt: (input.createdAt ?? t3).toISOString(),
    revision: 1,
  };
  const plan = Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
  assertAudiobookRetailSamplePlan(plan);
  return plan;
}

class SourceResolver implements AudiobookRetailSampleSourceResolver {
  calls = 0;
  disposed = 0;

  constructor(
    readonly plan: AudiobookRetailSamplePlan,
    readonly mismatch: Partial<ResolvedAudiobookRetailSampleSource> = {},
  ) {}

  async resolve(): Promise<ResolvedAudiobookRetailSampleSource> {
    this.calls += 1;
    return {
      artifactId: this.plan.source.approvedArtifactId,
      artifactRevision: this.plan.source.approvedArtifactRevision,
      artifactFingerprint: this.plan.source.approvedArtifactFingerprint,
      privatePath: "/private/storyteller/approved-narrative-track.mp3",
      contentHash: this.plan.source.approvedArtifactContentHash,
      byteCount: this.plan.source.approvedArtifactByteCount,
      dispose: async () => {
        this.disposed += 1;
      },
      ...this.mismatch,
    };
  }
}

class RenderRunner implements AudiobookRetailTrackRenderRunner {
  readonly requests: AudiobookRetailTrackRenderRequest[] = [];
  versionCalls = 0;

  constructor(
    readonly output: Uint8Array = mp3Bytes(1),
    readonly failure?: Error,
  ) {}

  async inspectVersion(): Promise<string> {
    this.versionCalls += 1;
    return "ffmpeg version 7.1 retail sample fixture";
  }

  async render(request: AudiobookRetailTrackRenderRequest): Promise<Uint8Array> {
    this.requests.push(request);
    if (this.failure) throw this.failure;
    return this.output;
  }
}

async function renderFixture(input: Readonly<{
  plan?: AudiobookRetailSamplePlan;
  resolver?: SourceResolver;
  runner?: RenderRunner;
  maximumOutputBytes?: number;
  signal?: AbortSignal;
}> = {}) {
  const plan = input.plan ?? samplePlan();
  const resolver = input.resolver ?? new SourceResolver(plan);
  const runner = input.runner ?? new RenderRunner();
  const result = await renderAudiobookRetailSample({
    plan,
    source: resolver,
    runner,
    renderedAt: t4,
    ...(input.maximumOutputBytes !== undefined
      ? { maximumOutputBytes: input.maximumOutputBytes }
      : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  return { plan, resolver, runner, result };
}

test("approved sample intent renders one exact shell-free MP3 range", async () => {
  const { plan, resolver, runner, result } = await renderFixture();

  assert.equal(resolver.calls, 1);
  assert.equal(resolver.disposed, 1);
  assert.equal(runner.versionCalls, 1);
  assert.equal(runner.requests.length, 1);
  assert.deepEqual(
    {
      sourcePath: runner.requests[0]?.sourcePath,
      sourceStartMs: runner.requests[0]?.sourceStartMs,
      durationMs: runner.requests[0]?.durationMs,
      output: runner.requests[0]?.output,
    },
    {
      sourcePath: "/private/storyteller/approved-narrative-track.mp3",
      sourceStartMs: 0,
      durationMs: 120_000,
      output: plan.output,
    },
  );
  assert.equal(
    runner.requests[0]?.filterScript,
    "atrim=start=0.000000:duration=120.000000,asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=mono\n",
  );
  assert.equal(buildAudiobookRetailSampleFilter(plan), runner.requests[0]?.filterScript);
  assert.equal(result.evidence.output.fileName, "RetailSample.mp3");
  assert.equal(result.evidence.output.encoder, "libmp3lame");
  assert.equal(result.evidence.output.mediaSignature, "mpeg-audio");
  assert.deepEqual(result.evidence.range, plan.range);
  assert.doesNotThrow(() =>
    assertAudiobookRetailSampleRenderEvidence(result.evidence)
  );
  assert.doesNotThrow(() =>
    assertAudiobookRetailSampleRenderMatchesPlan(result.evidence, plan)
  );
  assert.doesNotThrow(() => assertAudiobookRetailSampleRenderResult(result));

  const view = audiobookRetailSampleRenderPublicView(result.evidence);
  const serialised = JSON.stringify(view);
  assert.equal(view.durationMs, plan.range.durationMs);
  assert.equal(view.sourceRole, "chapter");
  for (const forbidden of [
    "/private/storyteller/approved-narrative-track.mp3",
    plan.source.approvedArtifactId,
    plan.source.approvedArtifactFingerprint,
    plan.source.approvedArtifactContentHash,
    plan.encodeChainFingerprint,
    plan.trackReview.sessionId,
    plan.selection.selectedByActorId,
    plan.safety.reviewedByActorId,
    "artifactRevision",
    "artifactFingerprint",
  ]) {
    assert.equal(serialised.includes(forbidden), false);
  }
});

test("impossible size ceilings, stale dates and pre-aborted work fail before source resolution", async () => {
  const plan = samplePlan();
  const tooSmall = new SourceResolver(plan);
  await assert.rejects(
    renderAudiobookRetailSample({
      plan,
      source: tooSmall,
      runner: new RenderRunner(),
      maximumOutputBytes: 1,
      renderedAt: t4,
    }),
    /AUDIOBOOK_RETAIL_SAMPLE_RENDER_ESTIMATED_SIZE_EXCEEDS_LIMIT/u,
  );
  assert.equal(tooSmall.calls, 0);

  const stale = new SourceResolver(plan);
  await assert.rejects(
    renderAudiobookRetailSample({
      plan,
      source: stale,
      runner: new RenderRunner(),
      renderedAt: t2,
    }),
    /AUDIOBOOK_RETAIL_SAMPLE_RENDER_DATE_INVALID/u,
  );
  assert.equal(stale.calls, 0);

  const controller = new AbortController();
  controller.abort();
  const aborted = new SourceResolver(plan);
  await assert.rejects(
    renderAudiobookRetailSample({
      plan,
      source: aborted,
      runner: new RenderRunner(),
      renderedAt: t4,
      signal: controller.signal,
    }),
    /AUDIOBOOK_RETAIL_SAMPLE_RENDER_ABORTED/u,
  );
  assert.equal(aborted.calls, 0);
});

test("source identity and private-path mismatches never reach FFmpeg and always dispose", async () => {
  const plan = samplePlan();
  const mismatched = new SourceResolver(plan, {
    contentHash: "0".repeat(64),
  });
  const mismatchRunner = new RenderRunner();
  await assert.rejects(
    renderAudiobookRetailSample({
      plan,
      source: mismatched,
      runner: mismatchRunner,
      renderedAt: t4,
    }),
    /AUDIOBOOK_RETAIL_SAMPLE_RENDER_SOURCE_INTEGRITY_MISMATCH/u,
  );
  assert.equal(mismatchRunner.requests.length, 0);
  assert.equal(mismatched.disposed, 1);

  const unsafe = new SourceResolver(plan, {
    privatePath: "private\0sample.mp3",
  });
  const unsafeRunner = new RenderRunner();
  await assert.rejects(
    renderAudiobookRetailSample({
      plan,
      source: unsafe,
      runner: unsafeRunner,
      renderedAt: t4,
    }),
    /AUDIOBOOK_RETAIL_SAMPLE_RENDER_PRIVATE_PATH_INVALID/u,
  );
  assert.equal(unsafeRunner.requests.length, 0);
  assert.equal(unsafe.disposed, 1);
});

test("runner failures and false media are bounded sample-render failures", async () => {
  const plan = samplePlan();
  const failedResolver = new SourceResolver(plan);
  await assert.rejects(
    renderAudiobookRetailSample({
      plan,
      source: failedResolver,
      runner: new RenderRunner(mp3Bytes(1), new Error("private runner detail")),
      renderedAt: t4,
    }),
    /AUDIOBOOK_RETAIL_SAMPLE_RENDER_RUNNER_FAILED/u,
  );
  assert.equal(failedResolver.disposed, 1);

  const falseMediaResolver = new SourceResolver(plan);
  await assert.rejects(
    renderAudiobookRetailSample({
      plan,
      source: falseMediaResolver,
      runner: new RenderRunner(wavBytes()),
      renderedAt: t4,
    }),
    /AUDIOBOOK_RETAIL_SAMPLE_RENDER_OUTPUT_MEDIA_INVALID/u,
  );
  assert.equal(falseMediaResolver.disposed, 1);
});

test("result bytes and recomputed structural evidence remain bound to the exact sample plan", async () => {
  const { plan, result } = await renderFixture();
  const changedBytes = new Uint8Array(result.bytes);
  changedBytes[changedBytes.length - 1] = changedBytes.at(-1)! ^ 0xff;
  assert.throws(
    () => assertAudiobookRetailSampleRenderResult({
      evidence: result.evidence,
      bytes: changedBytes,
    }),
    /AUDIOBOOK_RETAIL_SAMPLE_RENDER_RESULT_INTEGRITY_MISMATCH/u,
  );

  const { fingerprint: _fingerprint, ...base } = result.evidence;
  const changedBase: Omit<AudiobookRetailSampleRenderEvidence, "fingerprint"> = {
    ...base,
    planId: "retail_sample_plan_render_other_001",
  };
  const changedEvidence = Object.freeze({
    ...changedBase,
    fingerprint: stableHash(changedBase),
  });
  assert.doesNotThrow(() =>
    assertAudiobookRetailSampleRenderEvidence(changedEvidence)
  );
  assert.throws(
    () => assertAudiobookRetailSampleRenderMatchesPlan(changedEvidence, plan),
    /AUDIOBOOK_RETAIL_SAMPLE_RENDER_PLAN_SOURCE_MISMATCH/u,
  );

  const otherPlan = samplePlan({
    id: "retail_sample_plan_render_other_002",
    relativeStartMs: 1_000,
    relativeEndMs: 121_000,
  });
  assert.throws(
    () => assertAudiobookRetailSampleRenderMatchesPlan(result.evidence, otherPlan),
    /AUDIOBOOK_RETAIL_SAMPLE_RENDER_PLAN_SOURCE_MISMATCH/u,
  );
});
