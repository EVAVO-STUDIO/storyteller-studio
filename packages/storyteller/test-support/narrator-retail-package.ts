import { mkdir, writeFile, chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AudioEngineeringCommand,
  AudioEngineeringCommandResult,
  AudioEngineeringRunner,
} from "../src/audio-engineering.js";
import { FileArtifactRegistry } from "../src/artifact-store.js";
import {
  buildAudiobookRetailPackage,
  type AudiobookRetailPackageBuildEvidence,
  type AudiobookRetailPackageMediaResolver,
  type ResolvedAudiobookRetailPackageMedia,
} from "../src/audiobook-retail-package-build.js";
import {
  inspectAudiobookRetailPackage,
  type AudiobookRetailPackageInspectionEvidence,
} from "../src/audiobook-retail-package-inspection.js";
import {
  createAudiobookRetailPackageManifest,
  type AudiobookRetailPackageManifest,
} from "../src/audiobook-retail-package-manifest.js";
import {
  approveAudiobookRetailPackageReview,
  createAudiobookRetailPackageReviewSession,
  recordAudiobookRetailPackageReview,
  type AudiobookRetailPackageReviewCoverage,
  type AudiobookRetailPackageReviewScores,
  type AudiobookRetailPackageReviewSession,
} from "../src/audiobook-retail-package-review.js";
import {
  ingestAudiobookRetailSample,
  type AudiobookRetailSampleChain,
} from "../src/audiobook-retail-sample.js";
import {
  createAudiobookRetailSamplePlan,
  type AudiobookRetailSamplePlan,
} from "../src/audiobook-retail-sample-plan.js";
import {
  renderAudiobookRetailSample,
  type AudiobookRetailSampleRenderResult,
  type AudiobookRetailSampleSourceResolver,
  type ResolvedAudiobookRetailSampleSource,
} from "../src/audiobook-retail-sample-render.js";
import {
  approveAudiobookRetailSampleReview,
  createAudiobookRetailSampleReviewSession,
  recordAudiobookRetailSampleReview,
  type AudiobookRetailSampleReviewScores,
  type AudiobookRetailSampleReviewSession,
} from "../src/audiobook-retail-sample-review.js";
import type {
  AudiobookRetailTrackRenderRequest,
  AudiobookRetailTrackRenderRunner,
} from "../src/audiobook-retail-track-render.js";
import { createGenerationAudioEngineeringPolicy } from "../src/generation-audio-engineering.js";
import { ACX_AUDIOBOOK_PROFILE } from "../src/index.js";
import {
  createAdmittedNarratorRetailPackageApproval,
  createAdmittedNarratorRetailSampleApproval,
  type AdmittedNarratorRetailPackageApproval,
  type AdmittedNarratorRetailSampleApproval,
} from "../src/narrator-retail-package-admission.js";
import { FilePrivateObjectStore } from "../src/private-object-store.js";
import { FileProjectStore } from "../src/project-store.js";
import {
  createTestAdmittedNarratorRetailTrackFixture,
  type TestAdmittedNarratorRetailTrackFixture,
} from "./narrator-retail.js";

export interface TestAdmittedNarratorRetailSampleFixture {
  tracks: TestAdmittedNarratorRetailTrackFixture;
  plan: AudiobookRetailSamplePlan;
  render: AudiobookRetailSampleRenderResult;
  chain: AudiobookRetailSampleChain;
  reviewSession: AudiobookRetailSampleReviewSession;
  approvedSampleArtifact: ReturnType<
    typeof approveAudiobookRetailSampleReview
  >["artifact"];
  approval: AdmittedNarratorRetailSampleApproval;
}

export interface TestAdmittedNarratorRetailPackageFixture {
  sample: TestAdmittedNarratorRetailSampleFixture;
  manifest: AudiobookRetailPackageManifest;
  build: AudiobookRetailPackageBuildEvidence;
  inspection: AudiobookRetailPackageInspectionEvidence;
  reviewSession: AudiobookRetailPackageReviewSession;
  approval: AdmittedNarratorRetailPackageApproval;
}

const sampleReviewScores: AudiobookRetailSampleReviewScores = Object.freeze({
  startBoundaryIntegrity: 5,
  endBoundaryIntegrity: 5,
  contentContinuity: 5,
  representativeness: 5,
  spokenClarity: 5,
  encodingTransparency: 5,
  levelAndToneConsistency: 5,
  freedomFromDefects: 5,
});

const packageReviewScores: AudiobookRetailPackageReviewScores = Object.freeze({
  packageCompleteness: 5,
  fileNamingAndOrder: 5,
  creditAccuracy: 5,
  narrativeContinuity: 5,
  transitionAndSilenceIntegrity: 5,
  encodingConsistency: 5,
  retailSampleQuality: 5,
  releaseReadiness: 5,
});

function mp3Bytes(seed: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xfb, 0x90, 0x64,
    seed & 0xff, 0x05, 0x06, 0x07,
  ]);
}

function commandResult(
  stdout = "",
  stderr = "",
): AudioEngineeringCommandResult {
  return Object.freeze({ exitCode: 0, stdout, stderr, durationMs: 5 });
}

class SampleRenderRunner implements AudiobookRetailTrackRenderRunner {
  constructor(readonly output: Uint8Array) {}

  async inspectVersion(): Promise<string> {
    return "ffmpeg version 7.1 admitted retail sample fixture";
  }

  async render(
    _request: AudiobookRetailTrackRenderRequest,
  ): Promise<Uint8Array> {
    return this.output;
  }
}

class SampleEngineeringRunner implements AudioEngineeringRunner {
  constructor(
    readonly durationSeconds: number,
    readonly byteCount: number,
  ) {}

  async run(
    command: AudioEngineeringCommand,
  ): Promise<AudioEngineeringCommandResult> {
    switch (command.stage) {
      case "ffprobe-version":
        return commandResult("ffprobe version 7.1 admitted sample fixture\n");
      case "ffmpeg-version":
        return commandResult("ffmpeg version 7.1 admitted sample fixture\n");
      case "probe":
        return commandResult(JSON.stringify({
          streams: [{
            codec_type: "audio",
            codec_name: "mp3",
            sample_rate: "44100",
            channels: 1,
            bit_rate: "192000",
            duration: this.durationSeconds.toFixed(6),
          }],
          format: {
            format_name: "mp3",
            duration: this.durationSeconds.toFixed(6),
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
          input_tp: "-4.2",
          input_lra: "4",
          input_thresh: "-30",
          target_offset: "0",
        }));
      case "silence":
        return commandResult("", [
          "silence_start: 0",
          "silence_end: 1 | silence_duration: 1",
          `silence_start: ${Math.max(1, this.durationSeconds - 1)}`,
          `silence_end: ${this.durationSeconds} | silence_duration: 1`,
        ].join("\n"));
    }
  }
}

class SampleSourceResolver implements AudiobookRetailSampleSourceResolver {
  constructor(
    readonly artifact: TestAdmittedNarratorRetailTrackFixture["approvedTrackArtifacts"][number],
  ) {}

  async resolve(): Promise<ResolvedAudiobookRetailSampleSource> {
    return {
      artifactId: this.artifact.id,
      artifactRevision: this.artifact.revision,
      artifactFingerprint: this.artifact.fingerprint,
      privatePath: "/private/storyteller/admitted-retail-source.mp3",
      contentHash: this.artifact.integrity.contentHash,
      byteCount: this.artifact.integrity.byteCount,
      async dispose() {},
    };
  }
}

interface PackageSource {
  path: string;
  artifact: AudiobookRetailPackageManifest["files"][number]["artifact"];
}

class PackageMediaResolver implements AudiobookRetailPackageMediaResolver {
  constructor(readonly sources: ReadonlyMap<string, PackageSource>) {}

  async resolve(
    snapshot: AudiobookRetailPackageManifest["files"][number]["artifact"],
  ): Promise<ResolvedAudiobookRetailPackageMedia> {
    const source = this.sources.get(snapshot.id);
    if (!source) throw new Error("package source missing");
    return {
      artifactId: source.artifact.id,
      artifactRevision: source.artifact.revision,
      artifactFingerprint: source.artifact.fingerprint,
      reviewFingerprint: source.artifact.reviewFingerprint,
      privatePath: source.path,
      contentHash: source.artifact.contentHash,
      byteCount: source.artifact.byteCount,
      async dispose() {},
    };
  }
}

function packageCoverage(fileCount: number): AudiobookRetailPackageReviewCoverage {
  return Object.freeze({
    completeFileListConfirmed: true,
    manifestConfirmed: true,
    openingCreditPlayed: true,
    firstNarrativePlayed: true,
    midpointNarrativePlayed: true,
    finalNarrativePlayed: true,
    closingCreditPlayed: true,
    retailSamplePlayed: true,
    fileCountReviewed: fileCount,
  });
}

export async function createTestAdmittedNarratorRetailSampleFixture(
  input: Readonly<{
    mode?: "zero-shot" | "adapted";
    projectId?: string;
    bookId?: string;
  }> = {},
): Promise<TestAdmittedNarratorRetailSampleFixture> {
  const tracks = await createTestAdmittedNarratorRetailTrackFixture(input);
  const sourceIndex = tracks.admittedPlan.plan.tracks.findIndex((track) =>
    track.role === "chapter" || track.role === "prologue" || track.role === "epilogue"
  );
  if (sourceIndex < 0) throw new Error("narrative retail source missing");
  const sourceTrack = tracks.encodeChain.tracks[sourceIndex]!;
  const sourceArtifact = tracks.approvedTrackArtifacts[sourceIndex]!;
  const durationMs = Math.min(60_000, sourceTrack.observedDurationMs);
  const plan = createAudiobookRetailSamplePlan({
    id: `admitted_retail_sample_plan_${tracks.approval.bookId}`,
    policy: tracks.admittedPlan.policy,
    trackPlan: tracks.admittedPlan.plan,
    encodeChain: tracks.encodeChain,
    trackReview: tracks.reviewSession,
    approvedSourceArtifact: sourceArtifact,
    sourceTrackOrdinal: sourceTrack.ordinal,
    relativeStartMs: 0,
    relativeEndMs: durationMs,
    selection: {
      selectedByActorId: "admitted-retail-sample-editor",
      completeRangeListenConfirmed: true,
      representativeOfBookConfirmed: true,
      startBoundaryConfirmed: true,
      endBoundaryConfirmed: true,
      selectedAt: new Date("2026-08-10T11:21:00.000Z"),
    },
    safety: {
      reviewedByActorId: "admitted-retail-sample-safety-reviewer",
      completeRangeListenConfirmed: true,
      sourceFromAudiobookConfirmed: true,
      explicitContentDetected: false,
      unsuitableRetailPreviewContentDetected: false,
      approvedForRetailPreview: true,
      reviewedAt: new Date("2026-08-10T11:22:00.000Z"),
    },
    createdAt: new Date("2026-08-10T11:23:00.000Z"),
  });
  const sampleBytes = mp3Bytes(91);
  const render = await renderAudiobookRetailSample({
    plan,
    source: new SampleSourceResolver(sourceArtifact),
    runner: new SampleRenderRunner(sampleBytes),
    renderedAt: new Date("2026-08-10T11:24:00.000Z"),
  });
  const root = await mkdtemp(join(tmpdir(), "storyteller-admitted-sample-"));
  try {
    const chain = await ingestAudiobookRetailSample(
      new FilePrivateObjectStore(join(root, "objects")),
      new FileArtifactRegistry(new FileProjectStore(join(root, "artifacts"))),
      {
        plan,
        render,
        approvedSourceArtifact: sourceArtifact,
        actorId: "admitted-retail-sample-worker",
        verifierActorId: "admitted-retail-sample-verifier",
        engineering: createGenerationAudioEngineeringPolicy({
          profile: ACX_AUDIOBOOK_PROFILE,
          externalVersion: "acx-2026-08",
          reviewedAt: "2026-08-01T00:00:00.000Z",
          sourceReference: "acx-audio-submission-requirements-reviewed-2026-08",
          runner: new SampleEngineeringRunner(
            durationMs / 1_000,
            render.bytes.byteLength,
          ),
          temporaryRoot: join(root, "engineering"),
          now: new Date("2026-08-10T11:25:00.000Z"),
        }),
        now: new Date("2026-08-10T11:25:00.000Z"),
      },
    );
    let reviewSession = createAudiobookRetailSampleReviewSession({
      id: `admitted_retail_sample_review_${tracks.approval.bookId}`,
      chain,
      createdAt: new Date("2026-08-10T11:26:00.000Z"),
    });
    reviewSession = recordAudiobookRetailSampleReview(reviewSession, {
      id: `admitted_retail_sample_editorial_${tracks.approval.bookId}`,
      role: "editorial",
      reviewerId: "admitted-retail-sample-editorial-reviewer",
      completePlaybackConfirmed: true,
      listenedDurationMs: chain.observedDurationMs,
      startBoundaryConfirmed: true,
      endBoundaryConfirmed: true,
      sourceContinuityConfirmed: true,
      retailSuitabilityConfirmed: true,
      contentSafetyConfirmed: true,
      playbackContexts: ["consumer-headphones", "speakers"],
      decision: "approve",
      scores: sampleReviewScores,
      decidedAt: new Date("2026-08-10T11:27:00.000Z"),
    });
    reviewSession = recordAudiobookRetailSampleReview(reviewSession, {
      id: `admitted_retail_sample_engineering_${tracks.approval.bookId}`,
      role: "engineering",
      reviewerId: "admitted-retail-sample-engineering-reviewer",
      completePlaybackConfirmed: true,
      listenedDurationMs: chain.observedDurationMs,
      startBoundaryConfirmed: true,
      endBoundaryConfirmed: true,
      sourceContinuityConfirmed: true,
      retailSuitabilityConfirmed: true,
      contentSafetyConfirmed: true,
      playbackContexts: ["studio-headphones"],
      decision: "approve",
      scores: sampleReviewScores,
      decidedAt: new Date("2026-08-10T11:28:00.000Z"),
    });
    const approved = approveAudiobookRetailSampleReview(
      reviewSession,
      chain,
      {
        finalConfirmationId: `admitted_retail_sample_confirmation_${tracks.approval.bookId}`,
        approvedByActorId: "admitted-retail-sample-final-approver",
        humanConfirmation: true,
        approvedAt: new Date("2026-08-10T11:29:00.000Z"),
      },
    );
    const approval = createAdmittedNarratorRetailSampleApproval({
      tracks: tracks.approval,
      plan,
      chain,
      reviewSession: approved.session,
      approvedSampleArtifact: approved.artifact,
    });
    return Object.freeze({
      tracks,
      plan,
      render,
      chain,
      reviewSession: approved.session,
      approvedSampleArtifact: approved.artifact,
      approval,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function createTestAdmittedNarratorRetailPackageFixture(
  input: Readonly<{
    mode?: "zero-shot" | "adapted";
    projectId?: string;
    bookId?: string;
  }> = {},
): Promise<TestAdmittedNarratorRetailPackageFixture> {
  const sample = await createTestAdmittedNarratorRetailSampleFixture(input);
  const manifest = createAudiobookRetailPackageManifest({
    id: `admitted_retail_package_manifest_${sample.approval.bookId}`,
    trackPlan: sample.tracks.admittedPlan.plan,
    trackReview: sample.tracks.reviewSession,
    approvedTrackArtifacts: sample.tracks.approvedTrackArtifacts,
    samplePlan: sample.plan,
    sampleReview: sample.reviewSession,
    approvedSampleArtifact: sample.approvedSampleArtifact,
    createdByActorId: "admitted-retail-package-manifest-builder",
    createdAt: new Date("2026-08-10T11:30:00.000Z"),
  });
  const root = await mkdtemp(join(tmpdir(), "storyteller-admitted-package-"));
  try {
    const sourceRoot = join(root, "sources");
    await mkdir(sourceRoot, { recursive: true, mode: 0o700 });
    const sources = new Map<string, PackageSource>();
    for (const [index, file] of manifest.files.entries()) {
      const bytes = file.kind === "retail-sample"
        ? sample.render.bytes
        : sample.tracks.render.tracks[index]!.bytes;
      const path = join(sourceRoot, file.fileName);
      await writeFile(path, bytes, { mode: 0o600 });
      await chmod(path, 0o600);
      sources.set(file.artifact.id, { path, artifact: file.artifact });
    }
    const built = await buildAudiobookRetailPackage({
      manifest,
      sources: new PackageMediaResolver(sources),
      privatePackageRoot: join(root, "private-packages"),
      builtAt: new Date("2026-08-10T11:31:00.000Z"),
    });
    const inspection = await inspectAudiobookRetailPackage({
      build: built.evidence,
      manifest,
      privatePackagePath: built.privatePackagePath,
      inspectedAt: new Date("2026-08-10T11:32:00.000Z"),
    });
    let reviewSession = createAudiobookRetailPackageReviewSession({
      id: `admitted_retail_package_review_${sample.approval.bookId}`,
      inspection,
      manifest,
      rights: sample.approvedSampleArtifact.rights,
      createdAt: new Date("2026-08-10T11:33:00.000Z"),
    });
    reviewSession = recordAudiobookRetailPackageReview(reviewSession, {
      id: `admitted_retail_package_editorial_${sample.approval.bookId}`,
      role: "editorial",
      reviewerId: "admitted-retail-package-editorial-reviewer",
      coverage: packageCoverage(manifest.mediaFileCount),
      playbackContexts: ["consumer-headphones", "speakers"],
      decision: "approve",
      scores: packageReviewScores,
      decidedAt: new Date("2026-08-10T11:34:00.000Z"),
    });
    reviewSession = recordAudiobookRetailPackageReview(reviewSession, {
      id: `admitted_retail_package_engineering_${sample.approval.bookId}`,
      role: "engineering",
      reviewerId: "admitted-retail-package-engineering-reviewer",
      coverage: packageCoverage(manifest.mediaFileCount),
      playbackContexts: ["studio-headphones"],
      decision: "approve",
      scores: packageReviewScores,
      decidedAt: new Date("2026-08-10T11:35:00.000Z"),
    });
    const approvedSession = approveAudiobookRetailPackageReview(
      reviewSession,
      {
        inspection,
        manifest,
        rights: sample.approvedSampleArtifact.rights,
        finalConfirmationId: `admitted_retail_package_confirmation_${sample.approval.bookId}`,
        approvedByActorId: "admitted-retail-package-final-approver",
        humanConfirmation: true,
        approvedAt: new Date("2026-08-10T11:36:00.000Z"),
      },
    );
    const approval = createAdmittedNarratorRetailPackageApproval({
      sample: sample.approval,
      manifest,
      build: built.evidence,
      inspection,
      reviewSession: approvedSession,
    });
    return Object.freeze({
      sample,
      manifest,
      build: built.evidence,
      inspection,
      reviewSession: approvedSession,
      approval,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
