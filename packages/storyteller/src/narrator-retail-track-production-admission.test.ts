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
  type AudiobookRetailNarrationEligibilityEvidence,
} from "./audiobook-retail-policy.js";
import type {
  AudiobookRetailReferenceMasterResolver,
  AudiobookRetailTrackRenderRequest,
  AudiobookRetailTrackRenderRunner,
  ResolvedAudiobookRetailReferenceMaster,
} from "./audiobook-retail-track-render.js";
import { createGenerationAudioEngineeringPolicy } from "./generation-audio-engineering.js";
import { ACX_AUDIOBOOK_PROFILE, stableHash } from "./index.js";
import {
  createAdmittedNarratorRetailTrackPlan,
  type AdmittedNarratorRetailTrackPlan,
} from "./narrator-retail-track-admission.js";
import {
  admittedNarratorRetailTrackProductionPublicView,
  approveAdmittedNarratorRetailTrackReview,
  assertAdmittedNarratorRetailTrackEncode,
  assertAdmittedNarratorRetailTrackRender,
  assertAdmittedNarratorRetailTrackReviewApproval,
  assertAdmittedNarratorRetailTrackReviewBinding,
  bindAdmittedNarratorRetailTrackRender,
  createAdmittedNarratorRetailTrackReviewBinding,
  ingestAdmittedNarratorRetailTrackRender,
  recordAdmittedNarratorRetailTrackReview,
  renderAdmittedNarratorRetailTrackPlan,
  type AdmittedNarratorRetailTrackEncode,
  type AdmittedNarratorRetailTrackRender,
  type AdmittedNarratorRetailTrackReviewApproval,
  type AdmittedNarratorRetailTrackReviewBinding,
} from "./narrator-retail-track-production-admission.js";
import { FilePrivateObjectStore } from "./private-object-store.js";
import { FileProjectStore } from "./project-store.js";
import {
  createTestAdmittedNarratorAudiobookFixture,
} from "../test-support/narrator-audiobook.js";
import { testDigest } from "../test-support/narrator-casting.js";

const policyNow = new Date("2026-08-10T11:00:00.000Z");
const plannedAt = new Date("2026-08-10T11:05:00.000Z");
const renderedAt = new Date("2026-08-10T11:06:00.000Z");
const encodedAt = new Date("2026-08-10T11:07:00.000Z");
const reviewCreatedAt = new Date("2026-08-10T11:08:00.000Z");

const excellentScores = Object.freeze({
  spokenHeaderAccuracy: 5,
  contentCompleteness: 5,
  transitionIntegrity: 5,
  silenceIntegrity: 5,
  tonalConsistency: 5,
  encodingTransparency: 5,
  sustainedListenability: 5,
  freedomFromDefects: 5,
});

function atSecond(second: number): Date {
  return new Date(`2026-08-10T11:08:${String(second).padStart(2, "0")}.000Z`);
}

function policy(suffix: string): AudiobookRetailEncodingPolicy {
  return createAcxAudibleRetailEncodingPolicy({
    id: `retail_policy_admitted_production_${suffix}`,
    externalVersion: "acx-2026-08",
    reviewedAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2027-08-01T00:00:00.000Z",
    sourceReference: "Reviewed ACX and Audible audiobook delivery requirements for admission-bound retail production.",
    bitRateKbps: 192,
    now: policyNow,
  });
}

function syntheticEligibility(input: Readonly<{
  projectId: string;
  bookId: string;
  rightsFingerprint: string;
  policy: AudiobookRetailEncodingPolicy;
  suffix: string;
}>): AudiobookRetailNarrationEligibilityEvidence {
  const platformAuthorisation = createAudiobookRetailPlatformAuthorisation({
    id: `platform_authorisation_production_${input.suffix}`,
    authorisationType: "title-specific",
    projectId: input.projectId,
    bookId: input.bookId,
    policy: input.policy,
    authorisationEvidenceId: `audible_authorisation_evidence_production_${input.suffix}`,
    effectiveAt: "2026-08-10T10:47:00.000Z",
    expiresAt: "2027-07-31T00:00:00.000Z",
    now: policyNow,
  });
  return createAudiobookRetailNarrationEligibilityEvidence({
    id: `narration_eligibility_production_${input.suffix}`,
    projectId: input.projectId,
    bookId: input.bookId,
    policy: input.policy,
    sourceKind: "synthetic-voice",
    rightsFingerprint: input.rightsFingerprint,
    attestedByActorId: `retail-narration-attestor-${input.suffix}`,
    attestedAt: "2026-08-10T10:48:00.000Z",
    platformAuthorisation,
    now: policyNow,
  });
}

function mp3Bytes(seed: number): Uint8Array {
  return new Uint8Array([0xff, 0xfb, 0x90, 0x64, seed, 0x01, 0x02, 0x03]);
}

class ReferenceResolver implements AudiobookRetailReferenceMasterResolver {
  constructor(readonly admittedPlan: AdmittedNarratorRetailTrackPlan) {}

  async resolve(): Promise<ResolvedAudiobookRetailReferenceMaster> {
    const reference = this.admittedPlan.plan.referenceMaster;
    return {
      artifactId: reference.id,
      artifactRevision: reference.revision,
      artifactFingerprint: reference.fingerprint,
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
    return "ffmpeg version 7.1 admission-bound fixture";
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

  async run(command: AudioEngineeringCommand): Promise<AudioEngineeringCommandResult> {
    if (command.stage === "ffprobe-version") {
      this.#index += 1;
      return commandResult("ffprobe version 7.1 admission-bound fixture\n");
    }
    const observation = this.observations[this.#index];
    if (!observation) throw new Error("engineering observation missing");
    switch (command.stage) {
      case "ffmpeg-version":
        return commandResult("ffmpeg version 7.1 admission-bound fixture\n");
      case "probe":
        return commandResult(JSON.stringify({
          streams: [{
            codec_type: "audio",
            codec_name: "mp3",
            sample_rate: "44100",
            channels: 1,
            bit_rate: String(observation.bitRateKbps * 1_000),
            duration: observation.durationSeconds.toFixed(6),
          }],
          format: {
            format_name: "mp3",
            duration: observation.durationSeconds.toFixed(6),
            bit_rate: String(observation.bitRateKbps * 1_000),
            size: String(observation.byteCount),
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
          `silence_start: ${Math.max(1, observation.durationSeconds - 1)}`,
          `silence_end: ${observation.durationSeconds} | silence_duration: 1`,
        ].join("\n"));
    }
  }
}

interface ProductionFixture {
  root: string;
  admittedPlan: AdmittedNarratorRetailTrackPlan;
  admittedRender: AdmittedNarratorRetailTrackRender;
  encode: AdmittedNarratorRetailTrackEncode;
}

async function createProductionFixture(input: Readonly<{
  root: string;
  suffix: string;
  mode?: "zero-shot" | "adapted";
}>): Promise<ProductionFixture> {
  const fixture = await createTestAdmittedNarratorAudiobookFixture({
    mode: input.mode ?? "adapted",
    projectId: `project_retail_production_${input.suffix}`,
    bookId: `book_retail_production_${input.suffix}`,
  });
  const retailPolicy = policy(input.suffix);
  const eligibility = syntheticEligibility({
    projectId: fixture.wholeBookApproval.projectId,
    bookId: fixture.wholeBookApproval.bookId,
    rightsFingerprint:
      fixture.wholeBookApproval.approvedArtifact.rights.rightsFingerprint,
    policy: retailPolicy,
    suffix: input.suffix,
  });
  const admittedPlan = createAdmittedNarratorRetailTrackPlan({
    id: `retail_track_plan_admitted_production_${input.suffix}`,
    wholeBookApproval: fixture.wholeBookApproval,
    policy: retailPolicy,
    narrationEligibility: eligibility,
    createdByActorId: `retail-track-planner-${input.suffix}`,
    createdAt: plannedAt,
  });
  const outputs = admittedPlan.plan.tracks.map((_, index) => mp3Bytes(index + 1));
  const rendered = await renderAdmittedNarratorRetailTrackPlan({
    admittedPlan,
    referenceMaster: new ReferenceResolver(admittedPlan),
    runner: new RenderRunner(outputs),
    renderedAt,
  });
  const observations = admittedPlan.plan.tracks.map((track, index) => ({
    durationSeconds: track.durationMs / 1_000,
    byteCount: rendered.render.tracks[index]!.bytes.byteLength,
    bitRateKbps: 192,
  }));
  const engineering = createGenerationAudioEngineeringPolicy({
    profile: ACX_AUDIOBOOK_PROFILE,
    externalVersion: "acx-2026-08",
    reviewedAt: "2026-08-01T00:00:00.000Z",
    sourceReference: "acx-audio-submission-requirements-reviewed-2026-08",
    runner: new EngineeringRunner(observations),
    ffprobePath: "/opt/media/ffprobe",
    ffmpegPath: "/opt/media/ffmpeg",
    timeoutMs: 30_000,
    maximumOutputBytes: 2 * 1024 * 1024,
    temporaryRoot: join(input.root, "engineering"),
    now: encodedAt,
  });
  const encode = await ingestAdmittedNarratorRetailTrackRender(
    new FilePrivateObjectStore(join(input.root, "objects")),
    new FileArtifactRegistry(new FileProjectStore(join(input.root, "artifacts"))),
    {
      admittedRender: rendered.admission,
      render: rendered.render,
      actorId: `retail-track-encoder-${input.suffix}`,
      verifierActorId: `retail-track-verifier-${input.suffix}`,
      engineering,
      now: encodedAt,
    },
  );
  return Object.freeze({
    root: input.root,
    admittedPlan,
    admittedRender: rendered.admission,
    encode,
  });
}

async function withFixture(
  suffix: string,
  run: (fixture: ProductionFixture) => Promise<void>,
  mode: "zero-shot" | "adapted" = "adapted",
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-admitted-retail-production-"));
  try {
    await run(await createProductionFixture({ root, suffix, mode }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function reviewInput(
  binding: AdmittedNarratorRetailTrackReviewBinding,
  ordinal: number,
  role: "editorial" | "engineering",
  second: number,
): Parameters<typeof recordAdmittedNarratorRetailTrackReview>[1] {
  const track = binding.session.tracks[ordinal - 1]!;
  return {
    id: `admitted_retail_review_${ordinal}_${role}_${second}`,
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
    decidedAt: atSecond(second),
  };
}

function completeReview(
  encode: AdmittedNarratorRetailTrackEncode,
): AdmittedNarratorRetailTrackReviewApproval {
  let binding = createAdmittedNarratorRetailTrackReviewBinding({
    id: `admitted_retail_review_session_${encode.bookId}`,
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
  return approveAdmittedNarratorRetailTrackReview(binding, {
    finalConfirmationId: `admitted_retail_confirmation_${encode.bookId}`,
    approvedByActorId: "admitted-retail-final-approver",
    humanConfirmation: true,
    approvedAt: atSecond(second),
  });
}

test("adapted narrator retail production retains exact admission through render, engineering and human track approval", async () => {
  await withFixture("adapted", async (fixture) => {
    assert.doesNotThrow(() => assertAdmittedNarratorRetailTrackRender(fixture.admittedRender));
    assert.doesNotThrow(() => assertAdmittedNarratorRetailTrackEncode(fixture.encode));
    assert.equal(fixture.encode.retailTrackReviewEligible, true);
    assert.equal(fixture.encode.independentEngineeringComplete, true);
    assert.equal(
      fixture.admittedPlan.wholeBookApproval.binding.reference.audiobook.admittedCasting.profileAdmission.trainingProvenanceBound,
      true,
    );
    const approval = completeReview(fixture.encode);
    assert.doesNotThrow(() => assertAdmittedNarratorRetailTrackReviewApproval(approval));
    assert.equal(approval.humanTrackReviewComplete, true);
    assert.equal(approval.retailSampleEligible, true);
    assert.equal(approval.approvedArtifacts.length, fixture.admittedPlan.plan.tracks.length);
    assert.equal(approval.deliveryAuthority, false);
    assert.equal(approval.publicationAuthority, false);
  });
});

test("zero-shot narrator uses the same retail production chain without invented training provenance", async () => {
  await withFixture("zero_shot", async (fixture) => {
    const admission = fixture.admittedPlan.wholeBookApproval.binding.reference.audiobook.admittedCasting.profileAdmission;
    assert.equal(admission.training, null);
    assert.equal(admission.trainingProvenanceBound, false);
    const approval = completeReview(fixture.encode);
    assert.equal(approval.syntheticNarrationDeclared, true);
    assert.equal(approval.platformAuthorisationBound, true);
    assert.equal(approval.humanTrackReviewComplete, true);
  }, "zero-shot");
});

test("a render from another admitted plan cannot be rebound to the selected narrator", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-admitted-retail-cross-render-"));
  try {
    const selected = await createProductionFixture({
      root: join(root, "selected"),
      suffix: "selected",
    });
    const other = await createProductionFixture({
      root: join(root, "other"),
      suffix: "other",
    });
    const forgedResult = {
      evidence: other.admittedRender.renderEvidence,
      tracks: other.encode.chain.tracks.map((track) => Object.freeze({
        fileName: track.fileName,
        bytes: mp3Bytes(track.ordinal),
      })),
    };
    assert.throws(
      () => bindAdmittedNarratorRetailTrackRender({
        admittedPlan: selected.admittedPlan,
        render: forgedResult,
      }),
      /AUDIOBOOK_RETAIL_TRACK_RENDER_PLAN_SOURCE_MISMATCH|RESULT_INTEGRITY_MISMATCH/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rehashing cannot substitute render, engineering or profile-admission lineage", async () => {
  await withFixture("tamper_encode", async (fixture) => {
    const { fingerprint: _fingerprint, ...base } = fixture.encode;
    const changedBase = {
      ...base,
      profileAdmissionHash: testDigest("substituted-profile-admission"),
      renderEvidenceFingerprint: testDigest("substituted-render-evidence"),
      engineeringProfileFingerprint: testDigest("substituted-engineering-profile"),
    };
    const changed = {
      ...changedBase,
      fingerprint: stableHash(changedBase),
    } as unknown as AdmittedNarratorRetailTrackEncode;
    assert.throws(
      () => assertAdmittedNarratorRetailTrackEncode(changed),
      /ADMITTED_NARRATOR_RETAIL_ENCODE_LINEAGE_MISMATCH/u,
    );
  });
});

test("review binding and approval remain inseparable from the exact admitted encode chain", async () => {
  await withFixture("tamper_review", async (fixture) => {
    const binding = createAdmittedNarratorRetailTrackReviewBinding({
      id: "admitted_retail_review_tamper",
      encode: fixture.encode,
      createdAt: reviewCreatedAt,
    });
    const { fingerprint: _fingerprint, ...base } = binding;
    const changedBase = {
      ...base,
      sessionFingerprint: testDigest("substituted-review-session"),
    };
    const changed = {
      ...changedBase,
      fingerprint: stableHash(changedBase),
    } as unknown as AdmittedNarratorRetailTrackReviewBinding;
    assert.throws(
      () => assertAdmittedNarratorRetailTrackReviewBinding(changed),
      /ADMITTED_NARRATOR_RETAIL_REVIEW_LINEAGE_MISMATCH/u,
    );

    const approval = completeReview(fixture.encode);
    const { fingerprint: _approvalFingerprint, ...approvalBase } = approval;
    const changedApprovalBase = {
      ...approvalBase,
      reviewApprovalFingerprint: testDigest("substituted-review-approval"),
    };
    const changedApproval = {
      ...changedApprovalBase,
      fingerprint: stableHash(changedApprovalBase),
    } as unknown as AdmittedNarratorRetailTrackReviewApproval;
    assert.throws(
      () => assertAdmittedNarratorRetailTrackReviewApproval(changedApproval),
      /ADMITTED_NARRATOR_RETAIL_REVIEW_APPROVAL_LINEAGE_MISMATCH/u,
    );
  });
});

test("authority escalation remains impossible after retail track approval", async () => {
  await withFixture("authority", async (fixture) => {
    const approval = completeReview(fixture.encode);
    const { fingerprint: _fingerprint, ...base } = approval;
    const changedBase = {
      ...base,
      packageAuthority: true,
      deliveryAuthority: true,
      releaseDecisionAuthority: true,
      publicationAuthority: true,
    };
    const changed = {
      ...changedBase,
      fingerprint: stableHash(changedBase),
    } as unknown as AdmittedNarratorRetailTrackReviewApproval;
    assert.throws(
      () => assertAdmittedNarratorRetailTrackReviewApproval(changed),
      /ADMITTED_NARRATOR_RETAIL_REVIEW_APPROVAL_AUTHORITY_INVALID/u,
    );
  });
});

test("public retail production views prove readiness without narrator, platform, reviewer or artifact identity", async () => {
  await withFixture("public", async (fixture) => {
    const approval = completeReview(fixture.encode);
    const view = admittedNarratorRetailTrackProductionPublicView(approval);
    const json = JSON.stringify(view);
    assert.equal(view.narratorAdmissionComplete, true);
    assert.equal(view.syntheticNarrationDeclared, true);
    assert.equal(view.platformAuthorisationBound, true);
    assert.equal(view.independentEngineeringComplete, true);
    assert.equal(view.humanTrackReviewComplete, true);
    assert.equal(view.retailSampleEligible, true);
    for (const forbidden of [
      approval.voice.profileId,
      approval.voice.profileHash,
      approval.profileAdmissionHash,
      approval.admittedCastingFingerprint,
      approval.castingFingerprint,
      fixture.admittedPlan.narrationEligibility.platformAuthorisation!.id,
      approval.session.approval!.approvedByActorId,
      approval.approvedArtifacts[0]!.id,
      fixture.encode.engineeringProfileFingerprint,
      fixture.encode.chain.tracks[0]!.engineering.ingest.envelope.payload.id,
    ]) {
      assert.equal(json.includes(forbidden), false);
    }
  });
});
