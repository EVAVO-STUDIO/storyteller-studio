import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
} from "./artifact-registry.js";
import { approveNarrationTakeReviewFixture } from "../test-support/narration-take-review-fixture.js";
import {
  createChapterAssemblyPlan,
} from "./chapter-assembly.js";
import {
  assertChapterRenderEvidence,
  buildChapterFilterScript,
  chapterRenderPublicView,
  ChapterRenderError,
  renderChapterAssembly,
  type ChapterRenderRequest,
  type ChapterRenderRunner,
  type ChapterSourceResolver,
  type ResolvedChapterSource,
} from "./chapter-render.js";

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
    projectId: "project_chapter_render_001",
    jobId: "job_chapter_render_001",
    segmentId: "segment_chapter_render_001",
    takeId: input.takeId,
    storage: {
      driver: "private-object-store",
      provider: "storyteller-render-test",
      container: "private-render-test",
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
      createdByActorId: "worker_chapter_render_001",
      sourceContentHash: input.sourceContentHash,
      generationRequestHash: input.generationRequestHash,
      ...(input.kind === "audio-candidate"
        ? { providerId: "provider_render", adapterVersion: "1.0.0" }
        : {}),
      parentArtifactIds: input.parentArtifactIds,
    },
    rights: {
      rightsEvidenceId: "rights_chapter_render_001",
      rightsFingerprint,
      allowedUses: ["audiobook"],
      commercialUseApproved: true,
      expiresAt: "2028-07-27T00:00:00.000Z",
    },
    reviewRequired: input.reviewRequired,
  }, t0);
  const verified = verifyArtifactIntegrity(initial, {
    observedContentHash: initial.integrity.contentHash,
    observedByteCount: initial.integrity.byteCount,
    checkedByActorId: "verifier_chapter_render_001",
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: t1,
  });
  return verified;
}

function commandResult(stdout = "", stderr = ""): AudioEngineeringCommandResult {
  return { exitCode: 0, stdout, stderr, durationMs: 4 };
}

class EvidenceRunner implements AudioEngineeringRunner {
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
            duration: "1.000000",
          }],
          format: {
            format_name: "wav",
            duration: "1.000000",
            bit_rate: "192000",
            size: String(this.byteCount),
          },
        }));
      case "astats":
        return commandResult([
          "lavfi.astats.Overall.RMS_level=-20.0000",
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

async function candidateChain(input: Readonly<{
  variant: "primary" | "alternative";
  seed: number;
  generationRequestHash: string;
}>) {
  const takeId = `take_chapter_render_001_${input.variant}`;
  const audioBytes = wavBytes(input.seed);
  const audio = verifiedArtifact({
    id: `artifact_audio_chapter_render_001_${input.variant}`,
    kind: "audio-candidate",
    bytes: audioBytes,
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
    id: `artifact_transcript_chapter_render_001_${input.variant}`,
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
    audioPath: `/private/render/source-${input.variant}.wav`,
    inputContentHash: audio.integrity.contentHash,
    inputByteCount: audio.integrity.byteCount,
    profile: ACX_AUDIOBOOK_PROFILE,
    profileVersion: "acx-2026-07",
    profileReviewedAt: "2026-07-01T00:00:00.000Z",
    profileSourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner: new EvidenceRunner(audio.integrity.byteCount),
    now: t2,
  });
  const engineeringBytes = new TextEncoder().encode(JSON.stringify(evidence));
  const engineering = verifiedArtifact({
    id: `artifact_engineering_chapter_render_001_${input.variant}`,
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
    audioBytes,
    audioCandidate: audio,
    transcriptArtifact: transcript,
    engineeringArtifact: engineering,
    engineeringEvidence: evidence,
  };
}

async function planFixture() {
  const primary = await candidateChain({
    variant: "primary",
    seed: 1,
    generationRequestHash: requestHash,
  });
  const alternative = await candidateChain({
    variant: "alternative",
    seed: 2,
    generationRequestHash: "d".repeat(64),
  });
  const approved = approveNarrationTakeReviewFixture({
    sessionId: "narration_take_review_chapter_render_001",
    performanceContextFingerprint: "e".repeat(64),
    candidates: [
      { ...primary, score: 5 },
      { ...alternative, score: 4 },
    ],
    selectedTakeId: primary.audioCandidate.takeId!,
    editorialReviewerId: "editorial_reviewer_chapter_render_001",
    engineeringReviewerId: "engineering_reviewer_chapter_render_001",
    directorId: "director_chapter_render_001",
    createdAt: t2,
  });
  const plan = createChapterAssemblyPlan({
    id: "assembly_chapter_render_001",
    projectId: "project_chapter_render_001",
    chapterId: "chapter_render_001",
    manuscriptSourceHash: manuscriptHash,
    policy: {
      id: "evavo-render-test-policy",
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
      segmentId: "segment_chapter_render_001",
      sourceStart: 0,
      sourceEnd: 100,
      audioCandidate: approved.audioCandidate,
      transcriptArtifact: primary.transcriptArtifact,
      engineeringArtifact: primary.engineeringArtifact,
      engineeringEvidence: primary.engineeringEvidence,
      takeReviewSession: approved.session,
      trimStartMs: 100,
      trimEndMs: 100,
      fadeInMs: 40,
      fadeOutMs: 60,
      gapBeforeMs: 120,
      gapAfterMs: 240,
    }],
    createdByActorId: "editor_chapter_render_001",
    createdAt: t3,
  });
  return { plan, audioBytes: primary.audioBytes, audio: approved.audioCandidate };
}

class FixtureResolver implements ChapterSourceResolver {
  disposeCount = 0;
  resolveCount = 0;

  constructor(
    readonly expectedArtifactId: string,
    readonly contentHash: string,
    readonly byteCount: number,
    readonly overrides: Partial<ResolvedChapterSource> = {},
  ) {}

  async resolve(): Promise<ResolvedChapterSource> {
    this.resolveCount += 1;
    return {
      artifactId: this.expectedArtifactId,
      privatePath: "/private/storyteller/source-001.wav",
      contentHash: this.contentHash,
      byteCount: this.byteCount,
      dispose: async () => {
        this.disposeCount += 1;
      },
      ...this.overrides,
    };
  }
}

class FixtureRenderRunner implements ChapterRenderRunner {
  inspectCount = 0;
  renderCount = 0;
  request?: ChapterRenderRequest;

  constructor(readonly output = wavBytes(9)) {}

  async inspectVersion(): Promise<string> {
    this.inspectCount += 1;
    return "ffmpeg version 7.1 fixture";
  }

  async render(request: ChapterRenderRequest): Promise<Uint8Array> {
    this.renderCount += 1;
    this.request = request;
    return this.output;
  }
}

test("shell-free render evidence binds the exact plan and private sources without exposing paths", async () => {
  const { plan, audio } = await planFixture();
  const resolver = new FixtureResolver(
    audio.id,
    audio.integrity.contentHash,
    audio.integrity.byteCount,
  );
  const runner = new FixtureRenderRunner();
  const result = await renderChapterAssembly({
    plan,
    sources: resolver,
    runner,
    ffmpegPath: "/private/tools/ffmpeg",
    temporaryRoot: "/private/render-temp",
    timeoutMs: 5_000,
    maximumOutputBytes: 1024 * 1024,
    renderedAt: t4,
  });

  assertChapterRenderEvidence(result.evidence);
  assert.equal(resolver.resolveCount, 1);
  assert.equal(resolver.disposeCount, 1);
  assert.equal(runner.inspectCount, 1);
  assert.equal(runner.renderCount, 1);
  assert.equal(result.evidence.planFingerprint, plan.fingerprint);
  assert.equal(result.evidence.sources.length, 1);
  assert.equal(result.evidence.output.mediaSignature, "riff-wave");
  assert.equal(result.evidence.output.bitDepth, 24);
  assert.match(result.evidence.commandFingerprint, /^[a-f0-9]{64}$/u);
  assert.match(result.evidence.filterFingerprint, /^[a-f0-9]{64}$/u);

  const request = runner.request;
  assert.ok(request);
  assert.deepEqual(request.sourcePaths, ["/private/storyteller/source-001.wav"]);
  assert.match(request.filterScript, /atrim=start=0\.100000:end=0\.900000/u);
  assert.match(request.filterScript, /afade=t=in:st=0:d=0\.040000/u);
  assert.match(request.filterScript, /afade=t=out:st=0\.740000:d=0\.060000/u);
  assert.match(request.filterScript, /adelay=120\|120/u);
  assert.match(request.filterScript, /anullsrc=r=44100:cl=mono:d=1\.160000/u);
  assert.match(request.filterScript, /amix=inputs=2:normalize=0/u);

  const publicView = chapterRenderPublicView(result.evidence);
  const serialised = JSON.stringify(publicView);
  for (const forbidden of [
    audio.id,
    audio.takeId!,
    "/private/storyteller/source-001.wav",
    "/private/render-temp",
    "/private/tools/ffmpeg",
    manuscriptHash,
    rightsFingerprint,
    requestHash,
    "director_chapter_render_001",
  ]) assert.equal(serialised.includes(forbidden), false);
});

test("filter construction is deterministic and path independent", async () => {
  const { plan } = await planFixture();
  const first = buildChapterFilterScript(plan);
  const second = buildChapterFilterScript(plan);
  assert.equal(first, second);
  assert.equal(first.includes("/private/"), false);
  assert.equal(first.includes(plan.segments[0]!.audio.id), false);
});

test("source integrity mismatch blocks before tool inspection and still disposes the source", async () => {
  const { plan, audio } = await planFixture();
  const resolver = new FixtureResolver(
    audio.id,
    "f".repeat(64),
    audio.integrity.byteCount,
  );
  const runner = new FixtureRenderRunner();
  await assert.rejects(
    renderChapterAssembly({ plan, sources: resolver, runner }),
    /CHAPTER_RENDER_SOURCE_INTEGRITY_MISMATCH/u,
  );
  assert.equal(runner.inspectCount, 0);
  assert.equal(runner.renderCount, 0);
  assert.equal(resolver.disposeCount, 1);
});

test("invalid media and unsafe runner failures become stable render errors", async () => {
  const { plan, audio } = await planFixture();
  const resolver = new FixtureResolver(
    audio.id,
    audio.integrity.contentHash,
    audio.integrity.byteCount,
  );
  await assert.rejects(
    renderChapterAssembly({
      plan,
      sources: resolver,
      runner: new FixtureRenderRunner(new TextEncoder().encode("not wav")),
    }),
    /CHAPTER_RENDER_OUTPUT_MEDIA_INVALID|PRIVATE_OBJECT_MEDIA_SIGNATURE_UNSUPPORTED/u,
  );

  const secretRunner: ChapterRenderRunner = {
    async inspectVersion() {
      return "ffmpeg version 7.1 fixture";
    },
    async render() {
      throw new Error("/private/secret/chapter.wav provider-account-123");
    },
  };
  await assert.rejects(
    renderChapterAssembly({ plan, sources: resolver, runner: secretRunner }),
    (error: unknown) => {
      assert.ok(error instanceof ChapterRenderError);
      assert.equal(error.code, "CHAPTER_RENDER_FAILED");
      assert.equal(error.message.includes("/private/secret"), false);
      return true;
    },
  );
});

test("pre-aborted rendering does not resolve sources or invoke tools", async () => {
  const { plan, audio } = await planFixture();
  const resolver = new FixtureResolver(
    audio.id,
    audio.integrity.contentHash,
    audio.integrity.byteCount,
  );
  const runner = new FixtureRenderRunner();
  const controller = new AbortController();
  controller.abort(new ChapterRenderError("CHAPTER_RENDER_OPERATOR_ABORTED"));
  await assert.rejects(
    renderChapterAssembly({
      plan,
      sources: resolver,
      runner,
      signal: controller.signal,
    }),
    /CHAPTER_RENDER_OPERATOR_ABORTED/u,
  );
  assert.equal(resolver.resolveCount, 0);
  assert.equal(runner.inspectCount, 0);
});

test("render evidence tampering is detected", async () => {
  const { plan, audio } = await planFixture();
  const resolver = new FixtureResolver(
    audio.id,
    audio.integrity.contentHash,
    audio.integrity.byteCount,
  );
  const result = await renderChapterAssembly({
    plan,
    sources: resolver,
    runner: new FixtureRenderRunner(),
  });
  assert.throws(
    () => assertChapterRenderEvidence({
      ...result.evidence,
      expectedDurationMs: result.evidence.expectedDurationMs + 1,
    }),
    /CHAPTER_RENDER_FINGERPRINT_MISMATCH/u,
  );
  assert.throws(
    () => assertChapterRenderEvidence({
      ...result.evidence,
      output: {
        ...result.evidence.output,
        mediaSignature: "mpeg-audio",
      },
    }),
    /CHAPTER_RENDER_OUTPUT_SIGNATURE_INVALID/u,
  );
});
