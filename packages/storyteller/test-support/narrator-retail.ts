import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AudioEngineeringCommand,
  AudioEngineeringCommandResult,
  AudioEngineeringRunner,
} from "../src/audio-engineering.js";
import { FileArtifactRegistry } from "../src/artifact-store.js";
import {
  createAcxAudibleRetailEncodingPolicy,
  createAudiobookRetailNarrationEligibilityEvidence,
  createAudiobookRetailPlatformAuthorisation,
} from "../src/audiobook-retail-policy.js";
import {
  ingestAudiobookRetailTrackRender,
  type AudiobookRetailTrackEncodeChain,
} from "../src/audiobook-retail-track-encode.js";
import {
  approveAudiobookRetailTrackReview,
  createAudiobookRetailTrackReviewSession,
  recordAudiobookRetailTrackReview,
  type AudiobookRetailTrackReviewScores,
  type AudiobookRetailTrackReviewSession,
} from "../src/audiobook-retail-track-review.js";
import {
  renderAudiobookRetailTrackPlan,
  type AudiobookRetailReferenceMasterResolver,
  type AudiobookRetailTrackRenderRequest,
  type AudiobookRetailTrackRenderResult,
  type AudiobookRetailTrackRenderRunner,
  type ResolvedAudiobookRetailReferenceMaster,
} from "../src/audiobook-retail-track-render.js";
import { createGenerationAudioEngineeringPolicy } from "../src/generation-audio-engineering.js";
import { ACX_AUDIOBOOK_PROFILE } from "../src/index.js";
import {
  createAdmittedNarratorRetailTrackPlan,
  type AdmittedNarratorRetailTrackPlan,
} from "../src/narrator-retail-track-admission.js";
import {
  createAdmittedNarratorRetailTrackApproval,
  type AdmittedNarratorRetailTrackApproval,
} from "../src/narrator-retail-track-production.js";
import { FilePrivateObjectStore } from "../src/private-object-store.js";
import { FileProjectStore } from "../src/project-store.js";
import {
  createTestAdmittedNarratorAudiobookFixture,
} from "./narrator-audiobook.js";

export interface TestAdmittedNarratorRetailTrackFixture {
  admittedPlan: AdmittedNarratorRetailTrackPlan;
  render: AudiobookRetailTrackRenderResult;
  encodeChain: AudiobookRetailTrackEncodeChain;
  reviewSession: AudiobookRetailTrackReviewSession;
  approvedTrackArtifacts: ReturnType<
    typeof approveAudiobookRetailTrackReview
  >["artifacts"];
  approval: AdmittedNarratorRetailTrackApproval;
}

const policyNow = new Date("2026-08-10T11:00:00.000Z");
const plannedAt = new Date("2026-08-10T11:05:00.000Z");
const renderedAt = new Date("2026-08-10T11:06:00.000Z");
const encodedAt = new Date("2026-08-10T11:07:00.000Z");
const reviewCreatedAt = new Date("2026-08-10T11:08:00.000Z");

const excellentScores: AudiobookRetailTrackReviewScores = Object.freeze({
  spokenHeaderAccuracy: 5,
  contentCompleteness: 5,
  transitionIntegrity: 5,
  silenceIntegrity: 5,
  tonalConsistency: 5,
  encodingTransparency: 5,
  sustainedListenability: 5,
  freedomFromDefects: 5,
});

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function mp3Bytes(seed: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xfb, 0x90, 0x64,
    seed & 0xff, 0x01, 0x02, 0x03,
  ]);
}

class ReferenceResolver implements AudiobookRetailReferenceMasterResolver {
  constructor(readonly plan: AdmittedNarratorRetailTrackPlan) {}

  async resolve(): Promise<ResolvedAudiobookRetailReferenceMaster> {
    const source = this.plan.plan.referenceMaster;
    return {
      artifactId: source.id,
      artifactRevision: source.revision,
      artifactFingerprint: source.fingerprint,
      privatePath: "/private/storyteller/admitted-reference-master.wav",
      contentHash: source.contentHash,
      byteCount: source.byteCount,
      async dispose() {},
    };
  }
}

class RenderRunner implements AudiobookRetailTrackRenderRunner {
  #index = 0;

  constructor(readonly outputs: readonly Uint8Array[]) {}

  async inspectVersion(): Promise<string> {
    return "ffmpeg version 7.1 admitted narrator fixture";
  }

  async render(
    _request: AudiobookRetailTrackRenderRequest,
  ): Promise<Uint8Array> {
    const output = this.outputs[this.#index++];
    if (!output) throw new Error("retail fixture output missing");
    return output;
  }
}

interface EngineeringObservation {
  durationSeconds: number;
  byteCount: number;
  bitRateKbps: number;
}

function commandResult(
  stdout = "",
  stderr = "",
): AudioEngineeringCommandResult {
  return Object.freeze({ exitCode: 0, stdout, stderr, durationMs: 5 });
}

class EngineeringRunner implements AudioEngineeringRunner {
  #index = -1;

  constructor(readonly observations: readonly EngineeringObservation[]) {}

  async run(
    command: AudioEngineeringCommand,
  ): Promise<AudioEngineeringCommandResult> {
    if (command.stage === "ffprobe-version") {
      this.#index += 1;
      return commandResult("ffprobe version 7.1 admitted narrator fixture\n");
    }
    const current = this.observations[this.#index];
    if (!current) throw new Error("retail engineering observation missing");
    switch (command.stage) {
      case "ffmpeg-version":
        return commandResult("ffmpeg version 7.1 admitted narrator fixture\n");
      case "probe":
        return commandResult(JSON.stringify({
          streams: [{
            codec_type: "audio",
            codec_name: "mp3",
            sample_rate: "44100",
            channels: 1,
            bit_rate: String(current.bitRateKbps * 1_000),
            duration: current.durationSeconds.toFixed(6),
          }],
          format: {
            format_name: "mp3",
            duration: current.durationSeconds.toFixed(6),
            bit_rate: String(current.bitRateKbps * 1_000),
            size: String(current.byteCount),
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
          `silence_start: ${Math.max(1, current.durationSeconds - 1)}`,
          `silence_end: ${current.durationSeconds} | silence_duration: 1`,
        ].join("\n"));
    }
  }
}

function engineeringPolicy(
  temporaryRoot: string,
  observations: readonly EngineeringObservation[],
) {
  return createGenerationAudioEngineeringPolicy({
    profile: ACX_AUDIOBOOK_PROFILE,
    externalVersion: "acx-2026-08",
    reviewedAt: "2026-08-01T00:00:00.000Z",
    sourceReference: "acx-audio-submission-requirements-reviewed-2026-08",
    runner: new EngineeringRunner(observations),
    ffprobePath: "/opt/media/ffprobe",
    ffmpegPath: "/opt/media/ffmpeg",
    timeoutMs: 30_000,
    maximumOutputBytes: 2 * 1024 * 1024,
    temporaryRoot,
    now: encodedAt,
  });
}

function reviewInput(
  session: AudiobookRetailTrackReviewSession,
  ordinal: number,
  role: "editorial" | "engineering",
  decidedAt: Date,
): Parameters<typeof recordAudiobookRetailTrackReview>[1] {
  const track = session.tracks[ordinal - 1]!;
  return {
    id: `admitted_retail_track_review_${ordinal}_${role}`,
    trackOrdinal: ordinal,
    role,
    reviewerId: role === "editorial"
      ? "admitted-retail-editorial-reviewer"
      : "admitted-retail-engineering-reviewer",
    completeListenConfirmed: true,
    listenedDurationMs: track.observedDurationMs,
    headerConfirmed: true,
    openingBoundaryConfirmed: true,
    closingBoundaryConfirmed: true,
    playbackContexts: role === "editorial"
      ? ["consumer-headphones", "speakers"]
      : ["studio-headphones"],
    decision: "approve",
    scores: excellentScores,
    decidedAt,
  };
}

export async function createTestAdmittedNarratorRetailTrackFixture(
  input: Readonly<{
    mode?: "zero-shot" | "adapted";
    projectId?: string;
    bookId?: string;
  }> = {},
): Promise<TestAdmittedNarratorRetailTrackFixture> {
  const mode = input.mode ?? "adapted";
  const projectId = input.projectId ?? `project_admitted_retail_${mode.replace("-", "_")}`;
  const bookId = input.bookId ?? `book_admitted_retail_${mode.replace("-", "_")}`;
  const audiobook = await createTestAdmittedNarratorAudiobookFixture({
    mode,
    projectId,
    bookId,
  });
  const policy = createAcxAudibleRetailEncodingPolicy({
    id: `retail_policy_${bookId}`,
    externalVersion: "acx-2026-08",
    reviewedAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2027-08-01T00:00:00.000Z",
    sourceReference: "Reviewed ACX and Audible retail requirements for the admitted narrator production fixture.",
    bitRateKbps: 192,
    now: policyNow,
  });
  const authorisation = createAudiobookRetailPlatformAuthorisation({
    id: `platform_authorisation_${bookId}`,
    authorisationType: "title-specific",
    projectId,
    bookId,
    policy,
    authorisationEvidenceId: `audible_authorisation_evidence_${bookId}`,
    effectiveAt: "2026-08-10T10:47:00.000Z",
    expiresAt: "2027-07-31T00:00:00.000Z",
    now: policyNow,
  });
  const narrationEligibility = createAudiobookRetailNarrationEligibilityEvidence({
    id: `narration_eligibility_${bookId}`,
    projectId,
    bookId,
    policy,
    sourceKind: "synthetic-voice",
    rightsFingerprint:
      audiobook.wholeBookApproval.approvedArtifact.rights.rightsFingerprint,
    attestedByActorId: "admitted-retail-rights-attestor",
    attestedAt: "2026-08-10T10:48:00.000Z",
    platformAuthorisation: authorisation,
    now: policyNow,
  });
  const admittedPlan = createAdmittedNarratorRetailTrackPlan({
    id: `admitted_retail_track_plan_${bookId}`,
    wholeBookApproval: audiobook.wholeBookApproval,
    policy,
    narrationEligibility,
    createdByActorId: "admitted-retail-track-planner",
    createdAt: plannedAt,
  });
  const outputs = Object.freeze(
    admittedPlan.plan.tracks.map((_, index) => mp3Bytes(index + 1)),
  );
  const render = await renderAudiobookRetailTrackPlan({
    plan: admittedPlan.plan,
    referenceMaster: new ReferenceResolver(admittedPlan),
    runner: new RenderRunner(outputs),
    renderedAt,
  });
  for (const [index, output] of render.tracks.entries()) {
    if (
      output.bytes.byteLength !== outputs[index]!.byteLength
      || hashBytes(output.bytes) !== hashBytes(outputs[index]!)
    ) throw new Error("retail fixture render integrity mismatch");
  }
  const root = await mkdtemp(join(tmpdir(), "storyteller-admitted-retail-"));
  try {
    const observations = admittedPlan.plan.tracks.map((track, index) => ({
      durationSeconds: track.durationMs / 1_000,
      byteCount: render.tracks[index]!.bytes.byteLength,
      bitRateKbps: 192,
    }));
    const encodeChain = await ingestAudiobookRetailTrackRender(
      new FilePrivateObjectStore(join(root, "objects")),
      new FileArtifactRegistry(new FileProjectStore(join(root, "artifacts"))),
      {
        plan: admittedPlan.plan,
        render,
        approvedReferenceArtifact: audiobook.wholeBookApproval.approvedArtifact,
        actorId: "admitted-retail-track-encoder",
        verifierActorId: "admitted-retail-track-verifier",
        engineering: engineeringPolicy(join(root, "engineering"), observations),
        now: encodedAt,
      },
    );
    let reviewSession = createAudiobookRetailTrackReviewSession({
      id: `admitted_retail_track_review_${bookId}`,
      chain: encodeChain,
      createdAt: reviewCreatedAt,
    });
    let minute = 9;
    for (const track of reviewSession.tracks) {
      reviewSession = recordAudiobookRetailTrackReview(
        reviewSession,
        reviewInput(
          reviewSession,
          track.ordinal,
          "editorial",
          new Date(`2026-08-10T11:${String(minute++).padStart(2, "0")}:00.000Z`),
        ),
      );
      reviewSession = recordAudiobookRetailTrackReview(
        reviewSession,
        reviewInput(
          reviewSession,
          track.ordinal,
          "engineering",
          new Date(`2026-08-10T11:${String(minute++).padStart(2, "0")}:00.000Z`),
        ),
      );
    }
    const approved = approveAudiobookRetailTrackReview(
      reviewSession,
      encodeChain,
      {
        finalConfirmationId: `admitted_retail_track_confirmation_${bookId}`,
        approvedByActorId: "admitted-retail-final-approver",
        humanConfirmation: true,
        approvedAt: new Date("2026-08-10T11:20:00.000Z"),
      },
    );
    const approval = createAdmittedNarratorRetailTrackApproval({
      admittedPlan,
      encodeChain,
      reviewSession: approved.session,
      approvedTrackArtifacts: approved.artifacts,
    });
    return Object.freeze({
      admittedPlan,
      render,
      encodeChain,
      reviewSession: approved.session,
      approvedTrackArtifacts: approved.artifacts,
      approval,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
