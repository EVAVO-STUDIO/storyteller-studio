import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createArtifactRecord,
  recordArtifactReview,
  verifyArtifactIntegrity,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import { FileArtifactRegistry } from "./artifact-store.js";
import type {
  AudioEngineeringCommand,
  AudioEngineeringCommandResult,
  AudioEngineeringRunner,
} from "./audio-engineering.js";
import {
  createAcxAudibleRetailEncodingPolicy,
  type AudiobookRetailEncodingPolicy,
} from "./audiobook-retail-policy.js";
import {
  ingestAudiobookRetailTrackRender,
  type AudiobookRetailTrackEncodeChain,
} from "./audiobook-retail-track-encode.js";
import {
  approveAudiobookRetailTrackReview,
  createAudiobookRetailTrackReviewSession,
  recordAudiobookRetailTrackReview,
  type AudiobookRetailTrackReviewScores,
  type AudiobookRetailTrackReviewSession,
} from "./audiobook-retail-track-review.js";
import {
  FileAudiobookRetailSamplePlanStore,
  assertAudiobookRetailSamplePlan,
  assertAudiobookRetailSamplePlanMatchesSources,
  audiobookRetailSamplePlanPublicView,
  createAudiobookRetailSamplePlan,
  type AudiobookRetailSamplePlan,
  type CreateAudiobookRetailSamplePlanInput,
} from "./audiobook-retail-sample-plan.js";
import {
  AUDIOBOOK_RETAIL_TRACK_PLAN_SCHEMA_VERSION,
  assertAudiobookRetailTrackPlan,
  type AudiobookRetailTrack,
  type AudiobookRetailTrackOutput,
  type AudiobookRetailTrackPlan,
} from "./audiobook-retail-track-plan.js";
import {
  renderAudiobookRetailTrackPlan,
  type AudiobookRetailReferenceMasterResolver,
  type AudiobookRetailTrackRenderRequest,
  type AudiobookRetailTrackRenderResult,
  type AudiobookRetailTrackRenderRunner,
  type ResolvedAudiobookRetailReferenceMaster,
} from "./audiobook-retail-track-render.js";
import { createGenerationAudioEngineeringPolicy } from "./generation-audio-engineering.js";
import { ACX_AUDIOBOOK_PROFILE, stableHash } from "./index.js";
import { FilePrivateObjectStore } from "./private-object-store.js";
import { FileProjectStore } from "./project-store.js";

const time = (second: number): Date =>
  new Date(`2026-07-28T00:00:${String(second).padStart(2, "0")}.000Z`);
const t0 = time(0);
const t1 = time(1);
const t2 = time(2);
const t3 = time(3);
const t4 = time(4);
const t5 = time(5);
const rightsFingerprint = "a".repeat(64);
const output: AudiobookRetailTrackOutput = Object.freeze({
  format: "mp3",
  codec: "mp3",
  bitRateMode: "cbr",
  bitRateKbps: 192,
  sampleRateHz: 44_100,
  channels: 1,
});
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
  return new Uint8Array([0xff, 0xfb, 0x90, 0x64, seed, 0x01, 0x02, 0x03]);
}

function wavBytes(seed = 1): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    seed, 0x02, 0x03, 0x04,
  ]);
}

function rights(
  overrides: Partial<ArtifactRightsSnapshot> = {},
): ArtifactRightsSnapshot {
  return {
    rightsEvidenceId: "rights_retail_sample_plan_001",
    rightsFingerprint,
    allowedUses: ["audiobook"],
    commercialUseApproved: true,
    expiresAt: "2028-07-28T00:00:00.000Z",
    retainUntil: "2033-07-28T00:00:00.000Z",
    deletionRequiredAt: "2034-07-28T00:00:00.000Z",
    ...overrides,
  };
}

function policy(input: Readonly<{
  suffix?: string;
  expiresAt?: string;
}> = {}): AudiobookRetailEncodingPolicy {
  const suffix = input.suffix ?? "001";
  return createAcxAudibleRetailEncodingPolicy({
    id: `retail_sample_policy_${suffix}`,
    externalVersion: "acx-2026-07",
    reviewedAt: "2026-07-27T00:00:00.000Z",
    expiresAt: input.expiresAt ?? "2027-07-27T00:00:00.000Z",
    sourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    bitRateKbps: 192,
  });
}

function approvedReference(input: Readonly<{
  suffix?: string;
  rights?: ArtifactRightsSnapshot;
}> = {}): ArtifactRecord {
  const suffix = input.suffix ?? "001";
  const bytes = wavBytes(Number.parseInt(suffix.slice(-1), 10) || 1);
  const initial = createArtifactRecord({
    id: `artifact_retail_sample_reference_${suffix}`,
    kind: "audiobook-reference-master",
    projectId: `project_retail_sample_${suffix}`,
    jobId: `job_retail_sample_reference_${suffix}`,
    segmentId: `book_retail_sample_${suffix}`,
    takeId: `take_retail_sample_reference_${suffix}`,
    storage: {
      driver: "private-object-store",
      provider: "storyteller-retail-sample-test",
      container: "private-retail-sample-test",
      objectKey: `sha256/${hashBytes(bytes)}.wav`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: hashBytes(bytes),
      byteCount: bytes.byteLength,
      mimeType: "audio/wav",
      format: "wav",
    },
    provenance: {
      createdByActorId: `reference_builder_${suffix}`,
      sourceContentHash: "b".repeat(64),
      generationRequestHash: "c".repeat(64),
      parentArtifactIds: [
        `artifact_sequence_manifest_${suffix}`,
        `artifact_reference_render_${suffix}`,
      ],
    },
    rights: input.rights ?? rights(),
    reviewRequired: true,
  }, t0);
  const verified = verifyArtifactIntegrity(initial, {
    observedContentHash: initial.integrity.contentHash,
    observedByteCount: initial.integrity.byteCount,
    checkedByActorId: `reference_verifier_${suffix}`,
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: t1,
  });
  return recordArtifactReview(verified, {
    decision: "approved",
    reviewerId: `reference_reviewer_${suffix}`,
    notes: "Approved complete-book reference for retail sample planning.",
    decidedAt: t2,
  });
}

function track(input: Readonly<{
  suffix: string;
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
      artifactId: `artifact_retail_sample_source_${input.suffix}_${input.ordinal}`,
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
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function readyPlan(
  reference: ArtifactRecord,
  retailPolicy: AudiobookRetailEncodingPolicy,
  suffix = "001",
): AudiobookRetailTrackPlan {
  const tracks = Object.freeze([
    track({
      suffix,
      ordinal: 1,
      role: "opening-credit",
      fileName: "0001OpeningCredits.mp3",
      startMs: 0,
      durationMs: 5_000,
      headerKind: "opening-credit",
    }),
    track({
      suffix,
      ordinal: 2,
      role: "chapter",
      fileName: "0002Chapter0001.mp3",
      startMs: 5_000,
      durationMs: 600_000,
      headerKind: "chapter-title",
    }),
    track({
      suffix,
      ordinal: 3,
      role: "closing-credit",
      fileName: "0003ClosingCredits.mp3",
      startMs: 605_000,
      durationMs: 6_000,
      headerKind: "closing-credit",
    }),
  ]);
  const partial: Omit<AudiobookRetailTrackPlan, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_TRACK_PLAN_SCHEMA_VERSION,
    id: `retail_track_plan_sample_${suffix}`,
    projectId: reference.projectId,
    bookId: reference.segmentId!,
    distributor: "acx-audible",
    policy: Object.freeze({
      id: retailPolicy.id,
      externalVersion: retailPolicy.externalVersion,
      reviewedAt: retailPolicy.reviewedAt,
      expiresAt: retailPolicy.expiresAt,
      fingerprint: retailPolicy.fingerprint,
    }),
    narration: Object.freeze({
      evidenceId: `retail_narration_sample_${suffix}`,
      sourceKind: "human-performance",
      evidenceFingerprint: "e".repeat(64),
      platformAuthorisationPresent: false,
    }),
    sequence: Object.freeze({
      id: `audiobook_sequence_sample_${suffix}`,
      revision: 1,
      fingerprint: "f".repeat(64),
      componentCount: 3,
      chapterCount: 1,
      expectedDurationMs: 611_000,
      outputFingerprint: "1".repeat(64),
    }),
    referenceMaster: Object.freeze({
      id: reference.id,
      revision: reference.revision,
      fingerprint: reference.fingerprint,
      contentHash: reference.integrity.contentHash,
      byteCount: reference.integrity.byteCount,
      expectedDurationMs: 611_000,
      observedDurationMs: 611_000,
      durationDriftMs: 0,
    }),
    review: Object.freeze({
      sessionId: `reference_review_sample_${suffix}`,
      sessionRevision: 4,
      sessionFingerprint: "2".repeat(64),
      approvalFingerprint: "3".repeat(64),
      approvedAt: t2.toISOString(),
    }),
    output,
    tracks,
    blockers: Object.freeze([]),
    status: "ready-for-encoding",
    createdByActorId: `retail_track_planner_${suffix}`,
    createdAt: t3.toISOString(),
  };
  const plan = Object.freeze({ ...partial, fingerprint: stableHash(partial) });
  assertAudiobookRetailTrackPlan(plan);
  return plan;
}

class ReferenceResolver implements AudiobookRetailReferenceMasterResolver {
  constructor(readonly plan: AudiobookRetailTrackPlan) {}

  async resolve(): Promise<ResolvedAudiobookRetailReferenceMaster> {
    return {
      artifactId: this.plan.referenceMaster.id,
      artifactRevision: this.plan.referenceMaster.revision,
      artifactFingerprint: this.plan.referenceMaster.fingerprint,
      privatePath: "/private/storyteller/reference-master.wav",
      contentHash: this.plan.referenceMaster.contentHash,
      byteCount: this.plan.referenceMaster.byteCount,
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
    const bytes = this.outputs[this.requests.length - 1];
    if (!bytes) throw new Error("fixture output missing");
    return bytes;
  }
}

interface EngineeringObservation {
  durationSeconds: number;
  byteCount: number;
}

function commandResult(
  stdout = "",
  stderr = "",
): AudioEngineeringCommandResult {
  return { exitCode: 0, stdout, stderr, durationMs: 5 };
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
            bit_rate: "192000",
            duration: current.durationSeconds.toFixed(6),
          }],
          format: {
            format_name: "mp3",
            duration: current.durationSeconds.toFixed(6),
            bit_rate: "192000",
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
    externalVersion: "acx-2026-07",
    reviewedAt: "2026-07-27T00:00:00.000Z",
    sourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner: new EngineeringRunner(observations),
    ffprobePath: "/opt/media/ffprobe",
    ffmpegPath: "/opt/media/ffmpeg",
    timeoutMs: 30_000,
    maximumOutputBytes: 2 * 1024 * 1024,
    temporaryRoot,
    now: t4,
  });
}

function reviewInput(
  session: AudiobookRetailTrackReviewSession,
  ordinal: number,
  role: "editorial" | "engineering",
  second: number,
) {
  const source = session.tracks[ordinal - 1]!;
  return {
    id: `retail_sample_track_review_${ordinal}_${role}_${second}`,
    trackOrdinal: ordinal,
    role,
    reviewerId: role === "editorial"
      ? "editorial_reviewer_sample_001"
      : "engineering_reviewer_sample_001",
    completeListenConfirmed: true as const,
    listenedDurationMs: source.observedDurationMs,
    headerConfirmed: true as const,
    openingBoundaryConfirmed: true as const,
    closingBoundaryConfirmed: true as const,
    playbackContexts: role === "editorial"
      ? ["consumer-headphones", "speakers"] as const
      : ["studio-headphones"] as const,
    decision: "approve" as const,
    scores: excellentScores,
    decidedAt: time(second),
  };
}

interface Fixture {
  root: string;
  policy: AudiobookRetailEncodingPolicy;
  trackPlan: AudiobookRetailTrackPlan;
  encodeChain: AudiobookRetailTrackEncodeChain;
  trackReview: AudiobookRetailTrackReviewSession;
  approvedArtifacts: readonly ArtifactRecord[];
  projectStore: FileProjectStore;
}

async function buildFixture(input: Readonly<{
  root: string;
  suffix?: string;
  rights?: ArtifactRightsSnapshot;
  policyExpiresAt?: string;
}>): Promise<Fixture> {
  const suffix = input.suffix ?? "001";
  const retailPolicy = policy({
    suffix,
    expiresAt: input.policyExpiresAt,
  });
  const reference = approvedReference({ suffix, rights: input.rights });
  const trackPlan = readyPlan(reference, retailPolicy, suffix);
  const outputs = Object.freeze([mp3Bytes(1), mp3Bytes(2), mp3Bytes(3)]);
  const render: AudiobookRetailTrackRenderResult =
    await renderAudiobookRetailTrackPlan({
      plan: trackPlan,
      referenceMaster: new ReferenceResolver(trackPlan),
      runner: new RenderRunner(outputs),
      renderedAt: t4,
    });
  const observations = trackPlan.tracks.map((track, index) => ({
    durationSeconds: track.durationMs / 1_000,
    byteCount: render.tracks[index]!.bytes.byteLength,
  }));
  const encodeChain = await ingestAudiobookRetailTrackRender(
    new FilePrivateObjectStore(join(input.root, "objects")),
    new FileArtifactRegistry(new FileProjectStore(join(input.root, "artifacts"))),
    {
      plan: trackPlan,
      render,
      approvedReferenceArtifact: reference,
      actorId: `retail_track_encoder_${suffix}`,
      verifierActorId: `retail_track_verifier_${suffix}`,
      engineering: engineeringPolicy(
        join(input.root, "engineering"),
        observations,
      ),
      now: t5,
    },
  );
  let trackReview = createAudiobookRetailTrackReviewSession({
    id: `retail_sample_track_review_session_${suffix}`,
    chain: encodeChain,
    createdAt: time(6),
  });
  let second = 7;
  for (const track of trackReview.tracks) {
    trackReview = recordAudiobookRetailTrackReview(
      trackReview,
      reviewInput(trackReview, track.ordinal, "editorial", second++),
    );
    trackReview = recordAudiobookRetailTrackReview(
      trackReview,
      reviewInput(trackReview, track.ordinal, "engineering", second++),
    );
  }
  const approved = approveAudiobookRetailTrackReview(
    trackReview,
    encodeChain,
    {
      finalConfirmationId: `retail_sample_track_confirmation_${suffix}`,
      approvedByActorId: `retail_release_manager_${suffix}`,
      humanConfirmation: true,
      approvedAt: time(13),
    },
  );
  return {
    root: input.root,
    policy: retailPolicy,
    trackPlan,
    encodeChain,
    trackReview: approved.session,
    approvedArtifacts: approved.artifacts,
    projectStore: new FileProjectStore(join(input.root, "sample-store")),
  };
}

async function withFixture(
  run: (fixture: Fixture) => Promise<void>,
  input: Readonly<{
    suffix?: string;
    rights?: ArtifactRightsSnapshot;
    policyExpiresAt?: string;
  }> = {},
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-retail-sample-plan-"));
  try {
    await run(await buildFixture({ root, ...input }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function preferredInput(
  fixture: Fixture,
  overrides: Partial<CreateAudiobookRetailSamplePlanInput> = {},
): CreateAudiobookRetailSamplePlanInput {
  return {
    id: "retail_sample_plan_fixture_001",
    policy: fixture.policy,
    trackPlan: fixture.trackPlan,
    encodeChain: fixture.encodeChain,
    trackReview: fixture.trackReview,
    approvedSourceArtifact: fixture.approvedArtifacts[1]!,
    sourceTrackOrdinal: 2,
    relativeStartMs: 0,
    relativeEndMs: 300_000,
    selection: {
      selectedByActorId: "retail_sample_editor_001",
      completeRangeListenConfirmed: true,
      representativeOfBookConfirmed: true,
      startBoundaryConfirmed: true,
      endBoundaryConfirmed: true,
      selectedAt: time(14),
    },
    safety: {
      reviewedByActorId: "retail_sample_safety_reviewer_001",
      completeRangeListenConfirmed: true,
      sourceFromAudiobookConfirmed: true,
      explicitContentDetected: false,
      unsuitableRetailPreviewContentDetected: false,
      approvedForRetailPreview: true,
      reviewedAt: time(15),
    },
    createdAt: time(16),
    ...overrides,
  };
}

function recomputePlan(
  plan: AudiobookRetailSamplePlan,
  updates: Partial<Omit<AudiobookRetailSamplePlan, "fingerprint">>,
): AudiobookRetailSamplePlan {
  const { fingerprint: _fingerprint, ...base } = plan;
  const partial: Omit<AudiobookRetailSamplePlan, "fingerprint"> = {
    ...base,
    ...updates,
  };
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

test("approved opening narrative becomes a five-minute safety-reviewed sample plan", async () => {
  await withFixture(async (fixture) => {
    const input = preferredInput(fixture);
    const plan = createAudiobookRetailSamplePlan(input);
    assert.equal(plan.status, "ready-for-rendering");
    assert.equal(plan.source.trackOrdinal, 2);
    assert.equal(plan.source.role, "chapter");
    assert.equal(plan.range.durationMs, 300_000);
    assert.equal(plan.range.absoluteBookStartMs, 5_000);
    assert.equal(plan.range.absoluteBookEndMs, 305_000);
    assert.equal(plan.selection.selectionPreference, "preferred-book-beginning");
    assert.equal(plan.safety.approvedForRetailPreview, true);
    assert.doesNotThrow(() => assertAudiobookRetailSamplePlan(plan));
    assert.doesNotThrow(() =>
      assertAudiobookRetailSamplePlanMatchesSources(plan, input)
    );

    const store = new FileAudiobookRetailSamplePlanStore(fixture.projectStore);
    const first = await store.create(plan, "retail_sample_store_actor_001");
    const second = await store.create(plan, "retail_sample_store_actor_001");
    assert.equal(first.envelopeHash, second.envelopeHash);
    assert.equal((await store.require(plan.id)).payload.fingerprint, plan.fingerprint);

    const view = audiobookRetailSamplePlanPublicView(plan);
    const serialised = JSON.stringify(view);
    assert.equal(view.durationMs, 300_000);
    assert.equal(view.contentSafetyApproved, true);
    for (const forbidden of [
      plan.selection.selectedByActorId,
      plan.safety.reviewedByActorId,
      plan.source.approvedArtifactId,
      plan.source.approvedArtifactFingerprint,
      plan.source.approvedArtifactContentHash,
      plan.encodeChainFingerprint,
      plan.trackReview.sessionId,
      plan.trackReview.approvalFingerprint,
      "rights_retail_sample_plan_001",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
    }
    const audit = await readFile(
      join(fixture.root, "sample-store", "audit", "2026-07-28.jsonl"),
      "utf8",
    );
    for (const forbidden of [
      plan.selection.selectedByActorId,
      plan.safety.reviewedByActorId,
      plan.source.approvedArtifactId,
      plan.source.fileName,
      plan.source.approvedArtifactContentHash,
    ]) {
      assert.equal(audit.includes(forbidden), false);
    }
  });
});

test("credits, oversized ranges and out-of-track extraction remain blocked", async () => {
  await withFixture(async (fixture) => {
    assert.throws(
      () => createAudiobookRetailSamplePlan(preferredInput(fixture, {
        sourceTrackOrdinal: 1,
        approvedSourceArtifact: fixture.approvedArtifacts[0]!,
        relativeStartMs: 0,
        relativeEndMs: 5_000,
      })),
      /AUDIOBOOK_RETAIL_SAMPLE_NARRATIVE_SOURCE_REQUIRED/u,
    );
    assert.throws(
      () => createAudiobookRetailSamplePlan(preferredInput(fixture, {
        relativeEndMs: 300_001,
      })),
      /AUDIOBOOK_RETAIL_SAMPLE_DURATION_EXCEEDS_POLICY/u,
    );
    assert.throws(
      () => createAudiobookRetailSamplePlan(preferredInput(fixture, {
        relativeEndMs: 600_001,
      })),
      /AUDIOBOOK_RETAIL_SAMPLE_RANGE_INVALID/u,
    );
    assert.throws(
      () => createAudiobookRetailSamplePlan(preferredInput(fixture, {
        relativeStartMs: 20_000,
        relativeEndMs: 120_000,
      })),
      /AUDIOBOOK_RETAIL_SAMPLE_EXCEPTION_REASON_REQUIRED/u,
    );
    const exception = createAudiobookRetailSamplePlan(preferredInput(fixture, {
      id: "retail_sample_plan_exception_001",
      relativeStartMs: 20_000,
      relativeEndMs: 120_000,
      selection: {
        ...preferredInput(fixture).selection,
        exceptionReason: "stronger-representative-excerpt",
      },
    }));
    assert.equal(exception.selection.selectionPreference, "curated-exception");
    assert.equal(
      exception.selection.exceptionReason,
      "stronger-representative-excerpt",
    );
  });
});

test("editorial boundary and independent content-safety confirmations are mandatory", async () => {
  await withFixture(async (fixture) => {
    const base = preferredInput(fixture);
    assert.throws(
      () => createAudiobookRetailSamplePlan({
        ...base,
        selection: {
          ...base.selection,
          startBoundaryConfirmed: false as never,
        },
      }),
      /AUDIOBOOK_RETAIL_SAMPLE_EDITORIAL_CONFIRMATION_REQUIRED/u,
    );
    assert.throws(
      () => createAudiobookRetailSamplePlan({
        ...base,
        selection: {
          ...base.selection,
          selectedByActorId: "automation_sample_editor_001",
        },
      }),
      /AUDIOBOOK_RETAIL_SAMPLE_EDITOR_INVALID/u,
    );
    assert.throws(
      () => createAudiobookRetailSamplePlan({
        ...base,
        safety: {
          ...base.safety,
          reviewedByActorId: base.selection.selectedByActorId,
        },
      }),
      /AUDIOBOOK_RETAIL_SAMPLE_INDEPENDENT_SAFETY_REVIEW_REQUIRED/u,
    );
    assert.throws(
      () => createAudiobookRetailSamplePlan({
        ...base,
        safety: {
          ...base.safety,
          explicitContentDetected: true as never,
        },
      }),
      /AUDIOBOOK_RETAIL_SAMPLE_CONTENT_SAFETY_APPROVAL_REQUIRED/u,
    );
    assert.throws(
      () => createAudiobookRetailSamplePlan({
        ...base,
        safety: {
          ...base.safety,
          unsuitableRetailPreviewContentDetected: true as never,
        },
      }),
      /AUDIOBOOK_RETAIL_SAMPLE_CONTENT_SAFETY_APPROVAL_REQUIRED/u,
    );
  });
});

test("wrong approved artifact and changed review identity cannot enter sample planning", async () => {
  await withFixture(async (fixture) => {
    assert.throws(
      () => createAudiobookRetailSamplePlan(preferredInput(fixture, {
        approvedSourceArtifact: fixture.approvedArtifacts[0]!,
      })),
      /AUDIOBOOK_RETAIL_SAMPLE_APPROVED_SOURCE_ARTIFACT_MISMATCH/u,
    );
    const changedReview = (() => {
      const { fingerprint: _fingerprint, ...base } = fixture.trackReview;
      const partial = {
        ...base,
        planFingerprint: "9".repeat(64),
      };
      return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
    })();
    assert.throws(
      () => createAudiobookRetailSamplePlan(preferredInput(fixture, {
        trackReview: changedReview,
      })),
      /AUDIOBOOK_RETAIL_TRACK_REVIEW_CHAIN_MISMATCH|AUDIOBOOK_RETAIL_SAMPLE_APPROVED_REVIEW_REQUIRED/u,
    );
  });
});

test("policy and source rights must remain current at sample-plan creation", async () => {
  await withFixture(async (fixture) => {
    assert.throws(
      () => createAudiobookRetailSamplePlan(preferredInput(fixture)),
      /AUDIOBOOK_RETAIL_POLICY_NOT_CURRENT/u,
    );
  }, {
    suffix: "policy_expired",
    policyExpiresAt: "2026-07-28T00:00:15.500Z",
  });

  await withFixture(async (fixture) => {
    assert.throws(
      () => createAudiobookRetailSamplePlan(preferredInput(fixture)),
      /AUDIOBOOK_RETAIL_(?:SAMPLE|TRACK_REVIEW)_RIGHTS_EXPIRED/u,
    );
  }, {
    suffix: "rights_expired",
    rights: rights({ expiresAt: "2026-07-28T00:00:15.500Z" }),
  });
});

test("recomputed structural tampering cannot replace the approved source chain", async () => {
  await withFixture(async (fixture) => {
    const input = preferredInput(fixture);
    const plan = createAudiobookRetailSamplePlan(input);
    const changed = recomputePlan(plan, {
      trackPlan: Object.freeze({
        ...plan.trackPlan,
        id: "retail_track_plan_other_valid_identifier_001",
      }),
    });
    assert.doesNotThrow(() => assertAudiobookRetailSamplePlan(changed));
    assert.throws(
      () => assertAudiobookRetailSamplePlanMatchesSources(changed, input),
      /AUDIOBOOK_RETAIL_SAMPLE_SOURCE_MISMATCH/u,
    );
  });
});
