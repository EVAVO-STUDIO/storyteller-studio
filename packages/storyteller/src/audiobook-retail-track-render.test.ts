import assert from "node:assert/strict";
import test from "node:test";
import {
  NodeAudiobookRetailTrackRenderRunner,
  assertAudiobookRetailTrackRenderEvidence,
  assertAudiobookRetailTrackRenderMatchesPlan,
  assertAudiobookRetailTrackRenderResult,
  audiobookRetailTrackRenderPublicView,
  buildAudiobookRetailTrackFilter,
  renderAudiobookRetailTrackPlan,
  type AudiobookRetailReferenceMasterResolver,
  type AudiobookRetailRenderedTrackEvidence,
  type AudiobookRetailTrackRenderEvidence,
  type AudiobookRetailTrackRenderRequest,
  type AudiobookRetailTrackRenderRunner,
  type ResolvedAudiobookRetailReferenceMaster,
} from "./audiobook-retail-track-render.js";
import {
  AUDIOBOOK_RETAIL_TRACK_PLAN_SCHEMA_VERSION,
  assertAudiobookRetailTrackPlan,
  type AudiobookRetailTrack,
  type AudiobookRetailTrackOutput,
  type AudiobookRetailTrackPlan,
  type AudiobookRetailTrackPlanBlocker,
} from "./audiobook-retail-track-plan.js";
import { stableHash } from "./index.js";

const t0 = new Date("2026-07-28T00:00:00.000Z");
const t1 = new Date("2026-07-28T00:00:01.000Z");
const t2 = new Date("2026-07-28T00:00:02.000Z");
const output: AudiobookRetailTrackOutput = Object.freeze({
  format: "mp3",
  codec: "mp3",
  bitRateMode: "cbr",
  bitRateKbps: 192,
  sampleRateHz: 44_100,
  channels: 1,
});

function mp3Bytes(seed: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xfb,
    0x90,
    0x64,
    seed,
    0x01,
    0x02,
    0x03,
  ]);
}

function wavBytes(): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    0x01, 0x02, 0x03, 0x04,
  ]);
}

function track(input: Readonly<{
  ordinal: number;
  role: AudiobookRetailTrack["role"];
  fileName: string;
  startMs: number;
  durationMs: number;
  headerKind: AudiobookRetailTrack["headerKind"];
}>): AudiobookRetailTrack {
  const character = String((input.ordinal % 9) + 1);
  const partial: Omit<AudiobookRetailTrack, "fingerprint"> = {
    ordinal: input.ordinal,
    role: input.role,
    fileName: input.fileName,
    sourceStartMs: input.startMs,
    sourceEndMs: input.startMs + input.durationMs,
    durationMs: input.durationMs,
    source: Object.freeze({
      componentOrdinal: input.ordinal,
      componentFingerprint: character.repeat(64),
      artifactId: `artifact_retail_track_source_${input.ordinal}`,
      artifactRevision: 3,
      artifactFingerprint: String((input.ordinal + 3) % 9 + 1).repeat(64),
      contentHash: String((input.ordinal + 5) % 9 + 1).repeat(64),
      byteCount: 240_000 + input.ordinal,
    }),
    headerKind: input.headerKind,
    sectionHeaderRequired: true,
    sectionHeaderReviewedUnderReferenceApproval: true,
    secondaryHeaderRequired: false,
    output,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
}

function readyPlan(): AudiobookRetailTrackPlan {
  const tracks = Object.freeze([
    track({
      ordinal: 1,
      role: "opening-credit",
      fileName: "0001OpeningCredits.mp3",
      startMs: 0,
      durationMs: 5_000,
      headerKind: "opening-credit",
    }),
    track({
      ordinal: 2,
      role: "chapter",
      fileName: "0002Chapter0001.mp3",
      startMs: 5_000,
      durationMs: 60_000,
      headerKind: "chapter-title",
    }),
    track({
      ordinal: 3,
      role: "closing-credit",
      fileName: "0003ClosingCredits.mp3",
      startMs: 65_000,
      durationMs: 6_000,
      headerKind: "closing-credit",
    }),
  ]);
  const partial: Omit<AudiobookRetailTrackPlan, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_TRACK_PLAN_SCHEMA_VERSION,
    id: "retail_track_plan_render_001",
    projectId: "project_retail_track_render_001",
    bookId: "book_retail_track_render_001",
    distributor: "acx-audible",
    policy: Object.freeze({
      id: "retail_policy_render_001",
      externalVersion: "acx-2026-07",
      reviewedAt: "2026-07-27T00:00:00.000Z",
      expiresAt: "2027-07-27T00:00:00.000Z",
      fingerprint: "a".repeat(64),
    }),
    narration: Object.freeze({
      evidenceId: "retail_narration_render_001",
      sourceKind: "human-performance",
      evidenceFingerprint: "b".repeat(64),
      platformAuthorisationPresent: false,
    }),
    sequence: Object.freeze({
      id: "audiobook_sequence_render_001",
      revision: 1,
      fingerprint: "c".repeat(64),
      componentCount: 3,
      chapterCount: 1,
      expectedDurationMs: 71_000,
      outputFingerprint: "d".repeat(64),
    }),
    referenceMaster: Object.freeze({
      id: "artifact_reference_master_render_001",
      revision: 3,
      fingerprint: "e".repeat(64),
      contentHash: "f".repeat(64),
      byteCount: 9_397_396,
      expectedDurationMs: 71_000,
      observedDurationMs: 71_000,
      durationDriftMs: 0,
    }),
    review: Object.freeze({
      sessionId: "reference_review_render_001",
      sessionRevision: 4,
      sessionFingerprint: "1".repeat(64),
      approvalFingerprint: "2".repeat(64),
      approvedAt: t0.toISOString(),
    }),
    output,
    tracks,
    blockers: Object.freeze([]),
    status: "ready-for-encoding",
    createdByActorId: "retail_track_planner_render_001",
    createdAt: t1.toISOString(),
  };
  const plan = Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
  assertAudiobookRetailTrackPlan(plan);
  return plan;
}

function blockedPlan(): AudiobookRetailTrackPlan {
  const base = readyPlan();
  const blockerBase: Omit<
    Extract<
      AudiobookRetailTrackPlanBlocker,
      { kind: "reference-duration-drift" }
    >,
    "fingerprint"
  > = {
    kind: "reference-duration-drift",
    findingCode: "AUDIOBOOK_RETAIL_TRACK_REFERENCE_DURATION_DRIFT",
    expectedDurationMs: 71_000,
    observedDurationMs: 71_001,
    durationDriftMs: 1,
    requiredAction: "sample-accurate-boundary-review",
  };
  const blocker = Object.freeze({
    ...blockerBase,
    fingerprint: stableHash(blockerBase),
  });
  const { fingerprint: _fingerprint, ...partialBase } = base;
  const partial: Omit<AudiobookRetailTrackPlan, "fingerprint"> = {
    ...partialBase,
    referenceMaster: Object.freeze({
      ...base.referenceMaster,
      observedDurationMs: 71_001,
      durationDriftMs: 1,
    }),
    tracks: Object.freeze([]),
    blockers: Object.freeze([blocker]),
    status: "blocked",
  };
  const plan = Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
  assertAudiobookRetailTrackPlan(plan);
  return plan;
}

class ReferenceResolver implements AudiobookRetailReferenceMasterResolver {
  calls = 0;
  disposed = 0;

  constructor(
    readonly plan: AudiobookRetailTrackPlan,
    readonly mismatch: Partial<ResolvedAudiobookRetailReferenceMaster> = {},
  ) {}

  async resolve(): Promise<ResolvedAudiobookRetailReferenceMaster> {
    this.calls += 1;
    return {
      artifactId: this.plan.referenceMaster.id,
      artifactRevision: this.plan.referenceMaster.revision,
      artifactFingerprint: this.plan.referenceMaster.fingerprint,
      privatePath: "/private/storyteller/reference-master.wav",
      contentHash: this.plan.referenceMaster.contentHash,
      byteCount: this.plan.referenceMaster.byteCount,
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
    readonly outputs: readonly Uint8Array[] = [
      mp3Bytes(1),
      mp3Bytes(2),
      mp3Bytes(3),
    ],
    readonly failure?: Error,
  ) {}

  async inspectVersion(): Promise<string> {
    this.versionCalls += 1;
    return "ffmpeg version 7.1 fixture";
  }

  async render(request: AudiobookRetailTrackRenderRequest): Promise<Uint8Array> {
    this.requests.push(request);
    if (this.failure) throw this.failure;
    const outputBytes = this.outputs[this.requests.length - 1];
    if (!outputBytes) throw new Error("fixture output missing");
    return outputBytes;
  }
}

async function renderFixture(input: Readonly<{
  plan?: AudiobookRetailTrackPlan;
  resolver?: ReferenceResolver;
  runner?: RenderRunner;
  maximumTrackOutputBytes?: number;
  maximumTotalOutputBytes?: number;
  signal?: AbortSignal;
}> = {}) {
  const plan = input.plan ?? readyPlan();
  const resolver = input.resolver ?? new ReferenceResolver(plan);
  const runner = input.runner ?? new RenderRunner();
  const result = await renderAudiobookRetailTrackPlan({
    plan,
    referenceMaster: resolver,
    runner,
    renderedAt: t2,
    ...(input.maximumTrackOutputBytes !== undefined
      ? { maximumTrackOutputBytes: input.maximumTrackOutputBytes }
      : {}),
    ...(input.maximumTotalOutputBytes !== undefined
      ? { maximumTotalOutputBytes: input.maximumTotalOutputBytes }
      : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  return { plan, resolver, runner, result };
}

test("ready ACX track intent renders exact sequential ranges as governed CBR MP3 evidence", async () => {
  const { plan, resolver, runner, result } = await renderFixture();

  assert.equal(resolver.calls, 1);
  assert.equal(resolver.disposed, 1);
  assert.equal(runner.versionCalls, 1);
  assert.equal(runner.requests.length, 3);
  assert.deepEqual(
    runner.requests.map((request) => [
      request.sourceStartMs,
      request.durationMs,
      request.output.bitRateKbps,
      request.output.sampleRateHz,
      request.output.channels,
    ]),
    [
      [0, 5_000, 192, 44_100, 1],
      [5_000, 60_000, 192, 44_100, 1],
      [65_000, 6_000, 192, 44_100, 1],
    ],
  );
  assert.equal(
    runner.requests[0]?.filterScript,
    "atrim=start=0.000000:duration=5.000000,asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=mono\n",
  );
  assert.deepEqual(
    result.tracks.map((track) => track.fileName),
    plan.tracks.map((track) => track.fileName),
  );
  assert.deepEqual(
    result.evidence.tracks.map((track) => track.output.mediaSignature),
    ["mpeg-audio", "mpeg-audio", "mpeg-audio"],
  );
  assert.deepEqual(
    result.evidence.tracks.map((track) => track.output.encoder),
    ["libmp3lame", "libmp3lame", "libmp3lame"],
  );
  assert.doesNotThrow(() =>
    assertAudiobookRetailTrackRenderEvidence(result.evidence)
  );
  assert.doesNotThrow(() =>
    assertAudiobookRetailTrackRenderMatchesPlan(result.evidence, plan)
  );
  assert.doesNotThrow(() => assertAudiobookRetailTrackRenderResult(result));

  const view = audiobookRetailTrackRenderPublicView(result.evidence);
  const serialised = JSON.stringify(view);
  assert.equal(view.trackCount, 3);
  assert.equal(
    view.totalOutputBytes,
    result.tracks.reduce((total, track) => total + track.bytes.byteLength, 0),
  );
  for (const forbidden of [
    "/private/storyteller/reference-master.wav",
    plan.referenceMaster.id,
    plan.referenceMaster.fingerprint,
    plan.referenceMaster.contentHash,
    "artifactId",
    "artifactRevision",
    "sourceStartMs",
    "sourceEndMs",
  ]) {
    assert.equal(serialised.includes(forbidden), false);
  }
});

test("blocked plans and impossible encoded-size ceilings fail before private source resolution", async () => {
  const blocked = blockedPlan();
  const blockedResolver = new ReferenceResolver(blocked);
  await assert.rejects(
    renderAudiobookRetailTrackPlan({
      plan: blocked,
      referenceMaster: blockedResolver,
      runner: new RenderRunner(),
      renderedAt: t2,
    }),
    /AUDIOBOOK_RETAIL_TRACK_RENDER_PLAN_NOT_READY/u,
  );
  assert.equal(blockedResolver.calls, 0);

  const plan = readyPlan();
  const limitedResolver = new ReferenceResolver(plan);
  await assert.rejects(
    renderAudiobookRetailTrackPlan({
      plan,
      referenceMaster: limitedResolver,
      runner: new RenderRunner(),
      maximumTrackOutputBytes: 1,
      renderedAt: t2,
    }),
    /AUDIOBOOK_RETAIL_TRACK_RENDER_ESTIMATED_SIZE_EXCEEDS_LIMIT/u,
  );
  assert.equal(limitedResolver.calls, 0);
});

test("reference drift, private-path errors and aborts never reach the renderer", async () => {
  const plan = readyPlan();
  const mismatch = new ReferenceResolver(plan, {
    contentHash: "0".repeat(64),
  });
  const mismatchRunner = new RenderRunner();
  await assert.rejects(
    renderAudiobookRetailTrackPlan({
      plan,
      referenceMaster: mismatch,
      runner: mismatchRunner,
      renderedAt: t2,
    }),
    /AUDIOBOOK_RETAIL_TRACK_RENDER_SOURCE_INTEGRITY_MISMATCH/u,
  );
  assert.equal(mismatchRunner.requests.length, 0);
  assert.equal(mismatch.disposed, 1);

  const unsafe = new ReferenceResolver(plan, {
    privatePath: "private\0reference.wav",
  });
  await assert.rejects(
    renderAudiobookRetailTrackPlan({
      plan,
      referenceMaster: unsafe,
      runner: new RenderRunner(),
      renderedAt: t2,
    }),
    /AUDIOBOOK_RETAIL_TRACK_RENDER_PRIVATE_PATH_INVALID/u,
  );
  assert.equal(unsafe.disposed, 1);

  const controller = new AbortController();
  controller.abort(new Error("private abort reason"));
  const aborted = new ReferenceResolver(plan);
  await assert.rejects(
    renderAudiobookRetailTrackPlan({
      plan,
      referenceMaster: aborted,
      runner: new RenderRunner(),
      renderedAt: t2,
      signal: controller.signal,
    }),
    /AUDIOBOOK_RETAIL_TRACK_RENDER_ABORTED/u,
  );
  assert.equal(aborted.calls, 0);
});

test("false media, runner failures and total output overflow are stable and dispose the reference", async () => {
  const plan = readyPlan();
  const falseMediaResolver = new ReferenceResolver(plan);
  await assert.rejects(
    renderAudiobookRetailTrackPlan({
      plan,
      referenceMaster: falseMediaResolver,
      runner: new RenderRunner([wavBytes(), mp3Bytes(2), mp3Bytes(3)]),
      renderedAt: t2,
    }),
    /AUDIOBOOK_RETAIL_TRACK_RENDER_OUTPUT_MEDIA_INVALID/u,
  );
  assert.equal(falseMediaResolver.disposed, 1);

  const failedResolver = new ReferenceResolver(plan);
  await assert.rejects(
    renderAudiobookRetailTrackPlan({
      plan,
      referenceMaster: failedResolver,
      runner: new RenderRunner(undefined, new Error("private runner detail")),
      renderedAt: t2,
    }),
    /AUDIOBOOK_RETAIL_TRACK_RENDER_RUNNER_FAILED/u,
  );
  assert.equal(failedResolver.disposed, 1);

  const totalResolver = new ReferenceResolver(plan);
  await assert.rejects(
    renderAudiobookRetailTrackPlan({
      plan,
      referenceMaster: totalResolver,
      runner: new RenderRunner(),
      maximumTotalOutputBytes: 12,
      renderedAt: t2,
    }),
    /AUDIOBOOK_RETAIL_TRACK_RENDER_TOTAL_OUTPUT_LIMIT_EXCEEDED/u,
  );
  assert.equal(totalResolver.disposed, 1);
});

test("render result integrity and cross-source plan binding detect recomputed tampering", async () => {
  const { plan, result } = await renderFixture();
  const firstEvidence = result.evidence.tracks[0]!;
  const {
    fingerprint: _trackFingerprint,
    ...firstEvidenceBase
  } = firstEvidence;
  const changedTrackBase: Omit<
    AudiobookRetailRenderedTrackEvidence,
    "fingerprint"
  > = {
    ...firstEvidenceBase,
    trackFingerprint: "9".repeat(64),
  };
  const changedTrack = Object.freeze({
    ...changedTrackBase,
    fingerprint: stableHash(changedTrackBase),
  });
  const {
    fingerprint: _evidenceFingerprint,
    ...evidenceBase
  } = result.evidence;
  const changedEvidenceBase: Omit<
    AudiobookRetailTrackRenderEvidence,
    "fingerprint"
  > = {
    ...evidenceBase,
    tracks: Object.freeze([
      changedTrack,
      ...result.evidence.tracks.slice(1),
    ]),
  };
  const changedEvidence = Object.freeze({
    ...changedEvidenceBase,
    fingerprint: stableHash(changedEvidenceBase),
  });
  assert.doesNotThrow(() =>
    assertAudiobookRetailTrackRenderEvidence(changedEvidence)
  );
  assert.throws(
    () => assertAudiobookRetailTrackRenderMatchesPlan(changedEvidence, plan),
    /AUDIOBOOK_RETAIL_TRACK_RENDER_PLAN_SOURCE_MISMATCH/u,
  );

  const changedBytes = new Uint8Array(result.tracks[0]!.bytes);
  const lastIndex = changedBytes.length - 1;
  changedBytes[lastIndex] = changedBytes[lastIndex]! ^ 0xff;
  const changedResult = {
    evidence: result.evidence,
    tracks: Object.freeze([
      Object.freeze({
        fileName: result.tracks[0]!.fileName,
        bytes: changedBytes,
      }),
      ...result.tracks.slice(1),
    ]),
  };
  assert.throws(
    () => assertAudiobookRetailTrackRenderResult(changedResult),
    /AUDIOBOOK_RETAIL_TRACK_RENDER_RESULT_INTEGRITY_MISMATCH/u,
  );
});

test("the production runner contract remains shell-free and accepts only bounded MP3 requests", () => {
  const plan = readyPlan();
  assert.equal(
    buildAudiobookRetailTrackFilter(plan.tracks[1]!),
    "atrim=start=5.000000:duration=60.000000,asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=mono\n",
  );
  assert.doesNotThrow(() => new NodeAudiobookRetailTrackRenderRunner({
    ffmpegPath: "/opt/media/ffmpeg",
    temporaryRoot: "/private/storyteller/retail-render",
  }));
  assert.throws(
    () => new NodeAudiobookRetailTrackRenderRunner({
      ffmpegPath: "ffmpeg\n--unsafe",
    }),
    /AUDIOBOOK_RETAIL_TRACK_RENDER_EXECUTABLE_INVALID/u,
  );
});
