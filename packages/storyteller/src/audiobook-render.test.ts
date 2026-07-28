import assert from "node:assert/strict";
import test from "node:test";
import {
  AudiobookRenderError,
  assertAudiobookRenderEvidence,
  audiobookRenderPublicView,
  buildAudiobookFilterScript,
  renderAudiobookSequence,
  type AudiobookSourceResolver,
  type ResolvedAudiobookSource,
} from "./audiobook-render.js";
import type {
  AudiobookSequence,
  AudiobookSequenceArtifactSnapshot,
  AudiobookSequenceComponent,
} from "./audiobook-sequence.js";
import type {
  ChapterRenderRequest,
  ChapterRenderRunner,
} from "./chapter-render.js";
import { stableHash } from "./index.js";

const t0 = new Date("2026-07-28T00:00:00.000Z");
const t1 = new Date("2026-07-28T00:00:01.000Z");
const output = Object.freeze({
  format: "wav" as const,
  sampleRateHz: 44_100,
  channels: 1 as const,
  bitDepth: 24 as const,
});

function wavBytes(seed = 1): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x08, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    seed, 0x01, 0x02, 0x03,
  ]);
}

function artifact(
  id: string,
  kind: "credit-master" | "mastered-chapter",
  seed: string,
): AudiobookSequenceArtifactSnapshot {
  return Object.freeze({
    id,
    kind,
    revision: 3,
    fingerprint: seed.repeat(64),
    contentHash: seed.toUpperCase().repeat(64).toLocaleLowerCase("en-AU"),
    byteCount: 240_000 + Number.parseInt(seed, 16),
  });
}

function component(input: Readonly<{
  ordinal: number;
  role: AudiobookSequenceComponent["role"];
  title: string;
  durationMs: number;
  startMs: number;
  artifact: AudiobookSequenceArtifactSnapshot;
  sourceFingerprint: string;
}>): AudiobookSequenceComponent {
  const partial: Omit<AudiobookSequenceComponent, "fingerprint"> = {
    ordinal: input.ordinal,
    role: input.role,
    title: input.title,
    durationMs: input.durationMs,
    startMs: input.startMs,
    endMs: input.startMs + input.durationMs,
    artifact: input.artifact,
    sourceFingerprint: input.sourceFingerprint,
  };
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function sequence(input: Readonly<{
  chapterDurationMs?: number;
}> = {}): AudiobookSequence {
  const chapterDurationMs = input.chapterDurationMs ?? 60_000;
  const opening = component({
    ordinal: 1,
    role: "opening-credit",
    title: "Opening credit",
    durationMs: 5_000,
    startMs: 0,
    artifact: artifact("artifact_render_opening_001", "credit-master", "1"),
    sourceFingerprint: "4".repeat(64),
  });
  const chapter = component({
    ordinal: 2,
    role: "chapter",
    title: "Chapter One",
    durationMs: chapterDurationMs,
    startMs: opening.endMs,
    artifact: artifact("artifact_render_chapter_001", "mastered-chapter", "2"),
    sourceFingerprint: "5".repeat(64),
  });
  const closing = component({
    ordinal: 3,
    role: "closing-credit",
    title: "Closing credit",
    durationMs: 6_000,
    startMs: chapter.endMs,
    artifact: artifact("artifact_render_closing_001", "credit-master", "3"),
    sourceFingerprint: "6".repeat(64),
  });
  const partial: Omit<AudiobookSequence, "fingerprint"> = {
    schemaVersion: "storyteller-audiobook-sequence-v1",
    id: "audiobook_render_sequence_001",
    projectId: "project_audiobook_render_001",
    bookId: "book_audiobook_render_001",
    title: "The North Water",
    languageTag: "en-AU",
    chapterSequenceFingerprint: "7".repeat(64),
    openingDeliveryFingerprint: "8".repeat(64),
    closingDeliveryFingerprint: "9".repeat(64),
    rightsFingerprint: "a".repeat(64),
    engineeringProfileFingerprint: "b".repeat(64),
    output,
    components: Object.freeze([opening, chapter, closing]),
    chapterCount: 1,
    totalDurationMs: closing.endMs,
    status: "ready-for-retail-encoding",
    createdByActorId: "audiobook_render_owner_001",
    revision: 1,
    createdAt: t0.toISOString(),
    updatedAt: t0.toISOString(),
  };
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

class FixtureResolver implements AudiobookSourceResolver {
  readonly resolved: string[] = [];
  readonly disposed: string[] = [];

  constructor(readonly mismatchId?: string) {}

  async resolve(
    snapshot: AudiobookSequenceArtifactSnapshot,
  ): Promise<ResolvedAudiobookSource> {
    this.resolved.push(snapshot.id);
    return {
      artifactId: snapshot.id,
      privatePath: `/private/storyteller/${snapshot.id}.wav`,
      contentHash: snapshot.id === this.mismatchId
        ? "f".repeat(64)
        : snapshot.contentHash,
      byteCount: snapshot.byteCount,
      dispose: async () => {
        this.disposed.push(snapshot.id);
      },
    };
  }
}

class FixtureRunner implements ChapterRenderRunner {
  request?: ChapterRenderRequest;

  constructor(
    readonly bytes: Uint8Array = wavBytes(),
    readonly error?: Error,
  ) {}

  async inspectVersion(): Promise<string> {
    return "ffmpeg version 7.1 fixture";
  }

  async render(request: ChapterRenderRequest): Promise<Uint8Array> {
    this.request = request;
    if (this.error) throw this.error;
    return this.bytes;
  }
}

test("complete audiobook rendering preserves manifest order and emits governed WAV evidence", async () => {
  const plan = sequence();
  const resolver = new FixtureResolver();
  const runner = new FixtureRunner(wavBytes(7));
  const result = await renderAudiobookSequence({
    sequence: plan,
    sources: resolver,
    runner,
    renderedAt: t1,
    maximumOutputBytes: 100_000_000,
  });

  assert.equal(
    buildAudiobookFilterScript(plan),
    "[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]\n",
  );
  assert.deepEqual(
    runner.request?.sourcePaths,
    plan.components.map((entry) => `/private/storyteller/${entry.artifact.id}.wav`),
  );
  assert.equal(runner.request?.filterScript, buildAudiobookFilterScript(plan));
  assert.equal(runner.request?.sampleRateHz, 44_100);
  assert.equal(runner.request?.channels, 1);
  assert.equal(runner.request?.bitDepth, 24);
  assert.equal(runner.request?.expectedDurationMs, 71_000);
  assert.deepEqual(resolver.disposed, plan.components.map((entry) => entry.artifact.id));
  assert.equal(result.evidence.sources.length, 3);
  assert.equal(result.evidence.expectedDurationMs, 71_000);
  assert.equal(result.evidence.estimatedPcmByteCount, 9_397_396);
  assert.equal(result.evidence.output.mediaSignature, "riff-wave");
  assert.equal(result.evidence.output.byteCount, result.bytes.byteLength);
  assert.doesNotThrow(() => assertAudiobookRenderEvidence(result.evidence));

  const view = audiobookRenderPublicView(result.evidence);
  const serialised = JSON.stringify(view);
  assert.equal(view.sourceCount, 3);
  for (const forbidden of [
    "/private/storyteller/",
    ...plan.components.map((entry) => entry.artifact.id),
    ...plan.components.map((entry) => entry.artifact.contentHash),
  ]) assert.equal(serialised.includes(forbidden), false);
});

test("source drift and invalid output fail closed while disposing every resolved private source", async () => {
  const plan = sequence();
  const mismatchResolver = new FixtureResolver(plan.components[1]!.artifact.id);
  await assert.rejects(
    renderAudiobookSequence({
      sequence: plan,
      sources: mismatchResolver,
      runner: new FixtureRunner(),
      renderedAt: t1,
    }),
    /AUDIOBOOK_RENDER_SOURCE_INTEGRITY_MISMATCH/u,
  );
  assert.deepEqual(
    mismatchResolver.disposed,
    plan.components.slice(0, 2).map((entry) => entry.artifact.id),
  );

  const invalidResolver = new FixtureResolver();
  await assert.rejects(
    renderAudiobookSequence({
      sequence: plan,
      sources: invalidResolver,
      runner: new FixtureRunner(new Uint8Array([1, 2, 3, 4])),
      renderedAt: t1,
    }),
    /AUDIOBOOK_RENDER_OUTPUT_MEDIA_INVALID/u,
  );
  assert.deepEqual(
    invalidResolver.disposed,
    plan.components.map((entry) => entry.artifact.id),
  );
});

test("classic RIFF capacity is checked before private sources or FFmpeg are used", async () => {
  const plan = sequence({ chapterDurationMs: 40_000_000 });
  const resolver = new FixtureResolver();
  const runner = new FixtureRunner();
  await assert.rejects(
    renderAudiobookSequence({
      sequence: plan,
      sources: resolver,
      runner,
      renderedAt: t1,
    }),
    /AUDIOBOOK_RENDER_RIFF_CAPACITY_EXCEEDED/u,
  );
  assert.deepEqual(resolver.resolved, []);
  assert.equal(runner.request, undefined);

  await assert.rejects(
    renderAudiobookSequence({
      sequence: sequence(),
      sources: new FixtureResolver(),
      runner: new FixtureRunner(),
      renderedAt: t1,
      maximumOutputBytes: 0x1_0000_0000,
    }),
    /AUDIOBOOK_RENDER_OUTPUT_LIMIT_INVALID/u,
  );
});

test("abort, runner failures and evidence tampering produce stable render failures", async () => {
  const aborted = new AbortController();
  aborted.abort(new AudiobookRenderError("AUDIOBOOK_RENDER_ABORTED"));
  await assert.rejects(
    renderAudiobookSequence({
      sequence: sequence(),
      sources: new FixtureResolver(),
      runner: new FixtureRunner(),
      renderedAt: t1,
      signal: aborted.signal,
    }),
    /AUDIOBOOK_RENDER_ABORTED/u,
  );

  await assert.rejects(
    renderAudiobookSequence({
      sequence: sequence(),
      sources: new FixtureResolver(),
      runner: new FixtureRunner(wavBytes(), new Error("private runner detail")),
      renderedAt: t1,
    }),
    /AUDIOBOOK_RENDER_FAILED/u,
  );

  const result = await renderAudiobookSequence({
    sequence: sequence(),
    sources: new FixtureResolver(),
    runner: new FixtureRunner(),
    renderedAt: t1,
  });
  const { fingerprint: _fingerprint, ...evidenceBase } = result.evidence;
  const alteredSource = {
    ...result.evidence.sources[0]!,
    ordinal: 2,
  };
  const alteredBase = {
    ...evidenceBase,
    sources: Object.freeze([
      alteredSource,
      ...result.evidence.sources.slice(1),
    ]),
  };
  const altered = {
    ...alteredBase,
    fingerprint: stableHash(alteredBase),
  } as typeof result.evidence;
  assert.throws(
    () => assertAudiobookRenderEvidence(altered),
    /AUDIOBOOK_RENDER_SOURCE_ORDER_INVALID/u,
  );
});
