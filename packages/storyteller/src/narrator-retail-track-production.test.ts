import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type {
  AudioEngineeringCommand,
  AudioEngineeringCommandResult,
  AudioEngineeringRunner,
} from "./audio-engineering.js";
import { FileArtifactRegistry } from "./artifact-store.js";
import {
  createAcxAudibleRetailEncodingPolicy,
  createAudiobookRetailNarrationEligibilityEvidence,
  createAudiobookRetailPlatformAuthorisation,
  type AudiobookRetailEncodingPolicy,
} from "./audiobook-retail-policy.js";
import type {
  AudiobookRetailReferenceMasterResolver,
  AudiobookRetailTrackRenderRequest,
  AudiobookRetailTrackRenderRunner,
  ResolvedAudiobookRetailReferenceMaster,
} from "./audiobook-retail-track-render.js";
import type {
  AudiobookRetailTrackReviewScores,
} from "./audiobook-retail-track-review.js";
import { createGenerationAudioEngineeringPolicy } from "./generation-audio-engineering.js";
import { ACX_AUDIOBOOK_PROFILE, stableHash } from "./index.js";
import {
  createAdmittedNarratorRetailTrackPlan,
  type AdmittedNarratorRetailTrackPlan,
} from "./narrator-retail-track-admission.js";
import {
  admittedNarratorRetailTrackEncodePublicView,
  admittedNarratorRetailTrackRenderPublicView,
  admittedNarratorRetailTrackReviewPublicView,
  assertAdmittedNarratorRetailTrackEncode,
  assertAdmittedNarratorRetailTrackRenderResult,
  assertAdmittedNarratorRetailTrackReviewApproval,
  createAdmittedNarratorRetailTrackReviewApproval,
  createAdmittedNarratorRetailTrackReviewBinding,
  ingestAdmittedNarratorRetailTrackRender,
  recordAdmittedNarratorRetailTrackReview,
  renderAdmittedNarratorRetailTrackPlan,
  type AdmittedNarratorRetailTrackEncode,
  type AdmittedNarratorRetailTrackRenderResult,
  type AdmittedNarratorRetailTrackReviewApproval,
  type AdmittedNarratorRetailTrackReviewBinding,
} from "./narrator-retail-track-production.js";
import { FilePrivateObjectStore } from "./private-object-store.js";
import { FileProjectStore } from "./project-store.js";
import {
  createTestAdmittedNarratorAudiobookFixture,
} from "../test-support/narrator-audiobook.js";

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

function policy(suffix: string): AudiobookRetailEncodingPolicy {
  return createAcxAudibleRetailEncodingPolicy({
    id: `retail_policy_track_production_${suffix}`,
    externalVersion: "acx-2026-08",
    reviewedAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2027-08-01T00:00:00.000Z",
    sourceReference:
      "Reviewed ACX and Audible audiobook delivery requirements for admission-bound retail track production.",
    bitRateKbps: 192,
    now: policyNow,
  });
}

async function admittedPlan(
  mode: "zero-shot" | "adapted",
  suffix: string,
): Promise<AdmittedNarratorRetailTrackPlan> {
  const fixture = await createTestAdmittedNarratorAudiobookFixture({
    mode,
    projectId: `project_track_production_${suffix}`,
    bookId: `book_track_production_${suffix}`,
  });
  const retailPolicy = policy(suffix);
  const platformAuthorisation = createAudiobookRetailPlatformAuthorisation({
    id: `platform_authorisation_track_production_${suffix}`,
    authorisationType: "title-specific",
    projectId: fixture.wholeBookApproval.projectId,
    bookId: fixture.wholeBookApproval.bookId,
    policy: retailPolicy,
    authorisationEvidenceId:
      `audible_authorisation_track_production_${suffix}`,
    effectiveAt: "2026-08-10T10:47:00.000Z",
    expiresAt: "2027-07-31T00:00:00.000Z",
    now: policyNow,
  });
  const narrationEligibility =
    createAudiobookRetailNarrationEligibilityEvidence({
      id: `narration_eligibility_track_production_${suffix}`,
      projectId: fixture.wholeBookApproval.projectId,
      bookId: fixture.wholeBookApproval.bookId,
      policy: retailPolicy,
      sourceKind: "synthetic-voice",
      rightsFingerprint:
        fixture.wholeBookApproval.approvedArtifact.rights.rightsFingerprint,
      attestedByActorId: `retail-rights-attestor-${suffix}`,
      attestedAt: "2026-08-10T10:48:00.000Z",
      platformAuthorisation,
      now: policyNow,
    });
  return createAdmittedNarratorRetailTrackPlan({
    id: `retail_track_plan_production_${suffix}`,
    wholeBookApproval: fixture.wholeBookApproval,
    policy: retailPolicy,
    narrationEligibility,
    createdByActorId: `retail-track-planner-${suffix}`,
    createdAt: plannedAt,
  });
}

function mp3Bytes(seed: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xfb,
    0x90,
    0x64,
    seed & 0xff,
    0x01,
    0x02,
    0x03,
  ]);
}

class ReferenceResolver implements AudiobookRetailReferenceMasterResolver {
  constructor(
    readonly admittedPlan: AdmittedNarratorRetailTrackPlan,
    readonly fingerprintOverride?: string,
  ) {}

  async resolve(): Promise<ResolvedAudiobookRetailReferenceMaster> {
    const reference = this.admittedPlan.plan.referenceMaster;
    return {
      artifactId: reference.id,
      artifactRevision: reference.revision,
      artifactFingerprint:
        this.fingerprintOverride ?? reference.fingerprint,
      privatePath: "/private/storyteller/admitted-reference-master.wav",
      contentHash: reference.contentHash,
      byteCount: reference.byteCount,
      async dispose() {},
    };
  }
}

class RenderRunner implements AudiobookRetailTrackRenderRunner {
  readonly requests: AudiobookRetailTrackRenderRequest[] = [];

  constructor(readonly outputs: readonly Uint8Array[]) {}

  async inspectVersion(): Promise<string> {
    return "ffmpeg version 7.1 fixture";
  }

  async render(request: AudiobookRetailTrackRenderRequest): Promise<Uint8Array> {
    this.requests.push(request);
    const output = this.outputs[this.requests.length - 1];
    if (!output) throw new Error("fixture output missing");
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
      return commandResult("ffprobe version 7.1 fixture\n");
    }
    const current = this.observations[this.#index];
    if (!current) throw new Error("engineering observation missing");
    switch (command.stage) {
      case "ffmpeg-version":
        return commandResult("ffmpeg version 7.1 fixture\n");
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
    sourceReference:
      "acx-audio-submission-requirements-reviewed-2026-08",
    runner: new EngineeringRunner(observations),
    ffprobePath: "/opt/media/ffprobe",
    ffmpegPath: "/opt/media/ffmpeg",
    timeoutMs: 30_000,
    maximumOutputBytes: 2 * 1024 * 1024,
    temporaryRoot,
    now: encodedAt,
  });
}

interface ProductionFixture {
  root: string;
  plan: AdmittedNarratorRetailTrackPlan;
  render: AdmittedNarratorRetailTrackRenderResult;
  encode: AdmittedNarratorRetailTrackEncode;
  cleanup(): Promise<void>;
}

async function productionFixture(input: Readonly<{
  mode?: "zero-shot" | "adapted";
  suffix: string;
  observationOverrides?: Readonly<Record<
    number,
    Partial<EngineeringObservation>
  >>;
}>): Promise<ProductionFixture> {
  const root = await mkdtemp(
    join(tmpdir(), "storyteller-admitted-retail-track-production-"),
  );
  try {
    const plan = await admittedPlan(input.mode ?? "adapted", input.suffix);
    const outputs = Object.freeze(
      plan.plan.tracks.map((track) => mp3Bytes(track.ordinal)),
    );
    const render = await renderAdmittedNarratorRetailTrackPlan({
      admittedPlan: plan,
      referenceMaster: new ReferenceResolver(plan),
      runner: new RenderRunner(outputs),
      renderedAt,
    });
    const observations = plan.plan.tracks.map((track, index) => ({
      durationSeconds: track.durationMs / 1_000,
      byteCount: render.render.tracks[index]!.bytes.byteLength,
      bitRateKbps: 192,
      ...(input.observationOverrides?.[track.ordinal] ?? {}),
    }));
    const encode = await ingestAdmittedNarratorRetailTrackRender(
      new FilePrivateObjectStore(join(root, "objects")),
      new FileArtifactRegistry(
        new FileProjectStore(join(root, "artifacts")),
      ),
      {
        render,
        actorId: `retail-track-encoder-${input.suffix}`,
        verifierActorId: `retail-track-verifier-${input.suffix}`,
        engineering: engineeringPolicy(
          join(root, "engineering"),
          observations,
        ),
        now: encodedAt,
      },
    );
    return {
      root,
      plan,
      render,
      encode,
      async cleanup() {
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

function reviewInput(
  binding: AdmittedNarratorRetailTrackReviewBinding,
  ordinal: number,
  role: "editorial" | "engineering",
  secondOffset: number,
): Parameters<typeof recordAdmittedNarratorRetailTrackReview>[1] {
  const track = binding.session.tracks[ordinal - 1]!;
  return {
    id: `admitted_retail_track_review_${ordinal}_${role}_${secondOffset}`,
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
    decidedAt: new Date(
      reviewCreatedAt.getTime() + secondOffset * 1_000,
    ),
  };
}

function reviewAllTracks(
  encode: AdmittedNarratorRetailTrackEncode,
): AdmittedNarratorRetailTrackReviewBinding {
  let binding = createAdmittedNarratorRetailTrackReviewBinding({
    id: `admitted_retail_track_review_${encode.bookId}`,
    encode,
    createdAt: reviewCreatedAt,
  });
  let second = 1;
  for (const track of binding.session.tracks) {
    binding = recordAdmittedNarratorRetailTrackReview(
      binding,
      reviewInput(binding, track.ordinal, "editorial", second++),
    );
    binding = recordAdmittedNarratorRetailTrackReview(
      binding,
      reviewInput(binding, track.ordinal, "engineering", second++),
    );
  }
  return binding;
}

function approveAllTracks(
  binding: AdmittedNarratorRetailTrackReviewBinding,
): AdmittedNarratorRetailTrackReviewApproval {
  return createAdmittedNarratorRetailTrackReviewApproval(binding, {
    finalConfirmationId:
      `admitted_retail_track_confirmation_${binding.bookId}`,
    approvedByActorId: "admitted-retail-final-approver",
    humanConfirmation: true,
    approvedAt: new Date(
      reviewCreatedAt.getTime()
        + (binding.session.reviews.length + 2) * 1_000,
    ),
  });
}

test("adapted narrator admission survives rendering, engineering and complete track listening", async () => {
  const fixture = await productionFixture({
    suffix: "adapted_complete",
    mode: "adapted",
  });
  try {
    assert.doesNotThrow(() =>
      assertAdmittedNarratorRetailTrackRenderResult(fixture.render)
    );
    assert.doesNotThrow(() =>
      assertAdmittedNarratorRetailTrackEncode(fixture.encode)
    );
    const binding = reviewAllTracks(fixture.encode);
    const approval = approveAllTracks(binding);
    assert.doesNotThrow(() =>
      assertAdmittedNarratorRetailTrackReviewApproval(approval)
    );
    assert.equal(
      approval.binding.encode.admittedPlan.wholeBookApproval.binding.reference
        .audiobook.admittedCasting.profileAdmission.trainingProvenanceBound,
      true,
    );
    assert.equal(approval.humanTrackListeningApproval, true);
    assert.equal(approval.retailSamplePlanningEligible, true);
    assert.equal(approval.packageManifestEligible, false);
    assert.equal(approval.releaseDecisionAuthority, false);
    assert.equal(approval.publicationAuthority, false);
  } finally {
    await fixture.cleanup();
  }
});

test("zero-shot narration uses the same production chain without invented training provenance", async () => {
  const fixture = await productionFixture({
    suffix: "zero_shot_complete",
    mode: "zero-shot",
  });
  try {
    const approval = approveAllTracks(reviewAllTracks(fixture.encode));
    const admission =
      approval.binding.encode.admittedPlan.wholeBookApproval.binding.reference
        .audiobook.admittedCasting.profileAdmission;
    assert.equal(admission.training, null);
    assert.equal(admission.trainingProvenanceBound, false);
    assert.equal(approval.syntheticNarrationDeclared, true);
    assert.equal(approval.platformAuthorisationBound, true);
  } finally {
    await fixture.cleanup();
  }
});

test("reference-master substitution fails before private MP3 rendering", async () => {
  const plan = await admittedPlan("adapted", "wrong_reference");
  const runner = new RenderRunner(
    plan.plan.tracks.map((track) => mp3Bytes(track.ordinal)),
  );
  await assert.rejects(
    () => renderAdmittedNarratorRetailTrackPlan({
      admittedPlan: plan,
      referenceMaster: new ReferenceResolver(
        plan,
        "f".repeat(64),
      ),
      runner,
      renderedAt,
    }),
    /AUDIOBOOK_RETAIL_TRACK_RENDER_SOURCE_INTEGRITY_MISMATCH/u,
  );
  assert.equal(runner.requests.length, 0);
});

test("render output byte substitution is rejected before artifact ingestion", async () => {
  const fixture = await productionFixture({
    suffix: "render_bytes",
  });
  try {
    const changedTracks = fixture.render.render.tracks.map((track, index) =>
      index === 0
        ? Object.freeze({
            ...track,
            bytes: mp3Bytes(99),
          })
        : track
    );
    const changed = Object.freeze({
      admission: fixture.render.admission,
      render: Object.freeze({
        evidence: fixture.render.render.evidence,
        tracks: Object.freeze(changedTracks),
      }),
    });
    assert.throws(
      () => assertAdmittedNarratorRetailTrackRenderResult(changed),
      /AUDIOBOOK_RETAIL_TRACK_RENDER_RESULT_INTEGRITY_MISMATCH/u,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("rehashing cannot attach another admitted plan or render to the encoded chain", async () => {
  const selected = await productionFixture({ suffix: "selected_chain" });
  const other = await productionFixture({ suffix: "other_chain" });
  try {
    const { fingerprint: _fingerprint, ...base } = selected.encode;
    const changedBase = {
      ...base,
      admittedPlan: other.plan,
      admittedRender: other.render.admission,
    };
    const changed = Object.freeze({
      ...changedBase,
      fingerprint: stableHash(changedBase),
    }) as AdmittedNarratorRetailTrackEncode;
    assert.throws(
      () => assertAdmittedNarratorRetailTrackEncode(changed),
      /ADMITTED_NARRATOR_RETAIL_TRACK_PRODUCTION_LINEAGE_MISMATCH|ADMITTED_NARRATOR_RETAIL_TRACK_ENCODE_LINEAGE_MISMATCH/u,
    );
  } finally {
    await selected.cleanup();
    await other.cleanup();
  }
});

test("failed independent engineering cannot enter the human track review", async () => {
  const fixture = await productionFixture({
    suffix: "engineering_failure",
    observationOverrides: {
      1: { bitRateKbps: 96 },
    },
  });
  try {
    assert.equal(fixture.encode.engineeringEvidenceComplete, true);
    assert.equal(fixture.encode.allTracksEngineeringEligible, false);
    assert.equal(fixture.encode.humanTrackReviewEligible, false);
    assert.throws(
      () => createAdmittedNarratorRetailTrackReviewBinding({
        id: "admitted_retail_review_engineering_failure",
        encode: fixture.encode,
        createdAt: reviewCreatedAt,
      }),
      /ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_ENGINEERING_INELIGIBLE/u,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("incomplete listening cannot be converted into an admission-bound approval", async () => {
  const fixture = await productionFixture({
    suffix: "incomplete_review",
  });
  try {
    let binding = createAdmittedNarratorRetailTrackReviewBinding({
      id: "admitted_retail_review_incomplete",
      encode: fixture.encode,
      createdAt: reviewCreatedAt,
    });
    binding = recordAdmittedNarratorRetailTrackReview(
      binding,
      reviewInput(binding, 1, "editorial", 1),
    );
    assert.throws(
      () => approveAllTracks(binding),
      /AUDIOBOOK_RETAIL_TRACK_REVIEW_NOT_READY_FOR_APPROVAL/u,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("authority escalation and public evidence leakage fail closed after track approval", async () => {
  const fixture = await productionFixture({
    suffix: "public_redaction",
  });
  try {
    const approval = approveAllTracks(reviewAllTracks(fixture.encode));
    const renderView =
      admittedNarratorRetailTrackRenderPublicView(fixture.render.admission);
    const encodeView =
      admittedNarratorRetailTrackEncodePublicView(fixture.encode);
    const reviewView = admittedNarratorRetailTrackReviewPublicView(approval);
    const json = JSON.stringify({ renderView, encodeView, reviewView });
    for (const forbidden of [
      approval.voice.profileId,
      approval.voice.profileHash,
      approval.profileAdmissionHash,
      approval.admittedCastingFingerprint,
      approval.castingFingerprint,
      approval.binding.encode.admittedPlan.narrationEligibility
        .platformAuthorisation!.id,
      approval.session.reviews[0]!.reviewerId,
      approval.approvedArtifacts[0]!.id,
      approval.approvedArtifacts[0]!.integrity.contentHash,
    ]) {
      assert.equal(json.includes(forbidden), false);
    }
    assert.equal(reviewView.humanTrackListeningApproval, true);
    assert.equal(reviewView.retailSamplePlanningEligible, true);
    assert.equal(reviewView.packageManifestEligible, false);

    const { fingerprint: _fingerprint, ...base } = approval;
    const changedBase = {
      ...base,
      packageManifestEligible: true,
      deliveryAuthority: true,
      publicationAuthority: true,
    };
    const changed = Object.freeze({
      ...changedBase,
      fingerprint: stableHash(changedBase),
    }) as unknown as AdmittedNarratorRetailTrackReviewApproval;
    assert.throws(
      () => assertAdmittedNarratorRetailTrackReviewApproval(changed),
      /ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_APPROVAL_AUTHORITY_INVALID/u,
    );
  } finally {
    await fixture.cleanup();
  }
});
