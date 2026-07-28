import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  approveAudiobookReferenceMasterReview,
  createAudiobookReferenceMasterReviewSession,
  recordAudiobookReferenceMasterReview,
  type AudiobookReferenceMasterReviewScores,
} from "./audiobook-reference-master-review.js";
import {
  ingestAudiobookReferenceMaster,
  type AudiobookReferenceMasterChain,
} from "./audiobook-reference-master.js";
import {
  renderAudiobookSequence,
  type AudiobookRenderResult,
  type AudiobookSourceResolver,
  type ResolvedAudiobookSource,
} from "./audiobook-render.js";
import {
  createAcxAudibleRetailEncodingPolicy,
  createAudiobookRetailNarrationEligibilityEvidence,
  createAudiobookRetailPlatformAuthorisation,
  type AudiobookRetailEncodingPolicy,
  type AudiobookRetailNarrationEligibilityEvidence,
} from "./audiobook-retail-policy.js";
import {
  assertAudiobookRetailTrackPlan,
  assertAudiobookRetailTrackPlanMatchesSources,
  audiobookRetailTrackPlanPublicView,
  createAcxAudiobookRetailTrackPlan,
  type AudiobookRetailTrack,
  type AudiobookRetailTrackPlan,
} from "./audiobook-retail-track-plan.js";
import type {
  AudiobookSequence,
  AudiobookSequenceArtifactSnapshot,
  AudiobookSequenceComponent,
  AudiobookSequenceComponentRole,
} from "./audiobook-sequence.js";
import type {
  ArtifactRecord,
  ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import { FileArtifactRegistry } from "./artifact-store.js";
import type {
  AudioEngineeringCommand,
  AudioEngineeringCommandResult,
  AudioEngineeringRunner,
} from "./audio-engineering.js";
import type {
  ChapterRenderRequest,
  ChapterRenderRunner,
} from "./chapter-render.js";
import {
  createGenerationAudioEngineeringPolicy,
  type GenerationAudioEngineeringPolicy,
} from "./generation-audio-engineering.js";
import {
  ACX_AUDIOBOOK_PROFILE,
  stableHash,
} from "./index.js";
import { FilePrivateObjectStore } from "./private-object-store.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-28T00:00:00.000Z");
const t1 = new Date("2026-07-28T00:00:01.000Z");
const t2 = new Date("2026-07-28T00:00:02.000Z");
const t3 = new Date("2026-07-28T00:00:03.000Z");
const t4 = new Date("2026-07-28T00:00:04.000Z");
const t5 = new Date("2026-07-28T00:00:05.000Z");
const t6 = new Date("2026-07-28T00:00:06.000Z");
const t7 = new Date("2026-07-28T00:00:07.000Z");
const t8 = new Date("2026-07-28T00:00:08.000Z");
const rightsFingerprint = "a".repeat(64);
const goodScores: AudiobookReferenceMasterReviewScores = {
  narrativeContinuity: 5,
  sustainedListenability: 5,
  chapterOrderAndLabelling: 5,
  creditAccuracy: 5,
  transitionIntegrity: 5,
  silenceAndBoundaryIntegrity: 5,
  tonalAndLoudnessConsistency: 5,
  freedomFromTechnicalDefects: 5,
};

function wavBytes(seed = 1): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x08, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    seed, 0x01, 0x02, 0x03,
  ]);
}

function commandResult(
  stdout = "",
  stderr = "",
): AudioEngineeringCommandResult {
  return { exitCode: 0, stdout, stderr, durationMs: 5 };
}

class TrackPlanEngineeringRunner implements AudioEngineeringRunner {
  constructor(
    readonly durationSeconds: number,
    readonly sampleRateHz: number,
  ) {}

  async run(
    command: AudioEngineeringCommand,
  ): Promise<AudioEngineeringCommandResult> {
    switch (command.stage) {
      case "ffprobe-version":
        return commandResult("ffprobe version 7.1\n");
      case "ffmpeg-version":
        return commandResult("ffmpeg version 7.1\n");
      case "probe":
        return commandResult(JSON.stringify({
          streams: [{
            codec_type: "audio",
            codec_name: "pcm_s24le",
            sample_rate: String(this.sampleRateHz),
            channels: 1,
            bit_rate: "192000",
            duration: String(this.durationSeconds),
          }],
          format: {
            format_name: "wav",
            duration: String(this.durationSeconds),
            bit_rate: "192000",
            size: String(wavBytes().byteLength),
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

class TrackPlanSourceResolver implements AudiobookSourceResolver {
  async resolve(
    snapshot: AudiobookSequenceArtifactSnapshot,
  ): Promise<ResolvedAudiobookSource> {
    return {
      artifactId: snapshot.id,
      privatePath: `/private/storyteller/${snapshot.id}.wav`,
      contentHash: snapshot.contentHash,
      byteCount: snapshot.byteCount,
      async dispose() {},
    };
  }
}

class TrackPlanRenderRunner implements ChapterRenderRunner {
  constructor(readonly bytes: Uint8Array = wavBytes()) {}

  async inspectVersion(): Promise<string> {
    return "ffmpeg version 7.1 fixture";
  }

  async render(_request: ChapterRenderRequest): Promise<Uint8Array> {
    return this.bytes;
  }
}

interface SequenceSectionInput {
  role: "prologue" | "chapter" | "epilogue";
  durationMs: number;
}

interface FixtureOptions {
  suffix?: string;
  openingDurationMs?: number;
  sections?: readonly SequenceSectionInput[];
  closingDurationMs?: number;
  sampleRateHz?: number;
  observedDurationAdjustmentMs?: number;
  maximumDurationDriftMs?: number;
  rights?: ArtifactRightsSnapshot;
}

interface ApprovedFixture {
  sequence: AudiobookSequence;
  chain: AudiobookReferenceMasterChain;
  reviewSession: ReturnType<typeof createAudiobookReferenceMasterReviewSession>;
  approvedReferenceArtifact: ArtifactRecord;
  policy: AudiobookRetailEncodingPolicy;
  narrationEligibility: AudiobookRetailNarrationEligibilityEvidence;
}

function artifactSnapshot(
  suffix: string,
  ordinal: number,
  role: AudiobookSequenceComponentRole,
): AudiobookSequenceArtifactSnapshot {
  const character = ((ordinal % 9) + 1).toString(10);
  return Object.freeze({
    id: `artifact_track_plan_${role}_${suffix}_${ordinal}`,
    kind: role === "opening-credit" || role === "closing-credit"
      ? "credit-master"
      : "mastered-chapter",
    revision: 3,
    fingerprint: character.repeat(64),
    contentHash: ((ordinal + 3) % 9 + 1).toString(10).repeat(64),
    byteCount: 240_000 + ordinal,
  });
}

function sequenceComponent(input: Readonly<{
  suffix: string;
  ordinal: number;
  role: AudiobookSequenceComponentRole;
  title: string;
  durationMs: number;
  startMs: number;
}>): AudiobookSequenceComponent {
  const partial: Omit<AudiobookSequenceComponent, "fingerprint"> = {
    ordinal: input.ordinal,
    role: input.role,
    title: input.title,
    durationMs: input.durationMs,
    startMs: input.startMs,
    endMs: input.startMs + input.durationMs,
    artifact: artifactSnapshot(input.suffix, input.ordinal, input.role),
    sourceFingerprint: stableHash({
      suffix: input.suffix,
      ordinal: input.ordinal,
      role: input.role,
    }),
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
}

function sequenceFixture(
  engineeringProfileFingerprint: string,
  options: FixtureOptions,
): AudiobookSequence {
  const suffix = options.suffix ?? "001";
  const sections = options.sections ?? Object.freeze([
    { role: "chapter" as const, durationMs: 60_000 },
  ]);
  const components: AudiobookSequenceComponent[] = [];
  let cursor = 0;
  const openingDurationMs = options.openingDurationMs ?? 5_000;
  components.push(sequenceComponent({
    suffix,
    ordinal: 1,
    role: "opening-credit",
    title: "Opening credit",
    durationMs: openingDurationMs,
    startMs: cursor,
  }));
  cursor += openingDurationMs;
  for (const [index, section] of sections.entries()) {
    components.push(sequenceComponent({
      suffix,
      ordinal: index + 2,
      role: section.role,
      title: section.role === "chapter"
        ? `Chapter ${index + 1}`
        : section.role === "prologue"
          ? "Prologue"
          : "Epilogue",
      durationMs: section.durationMs,
      startMs: cursor,
    }));
    cursor += section.durationMs;
  }
  const closingDurationMs = options.closingDurationMs ?? 6_000;
  components.push(sequenceComponent({
    suffix,
    ordinal: components.length + 1,
    role: "closing-credit",
    title: "Closing credit",
    durationMs: closingDurationMs,
    startMs: cursor,
  }));
  cursor += closingDurationMs;

  const partial: Omit<AudiobookSequence, "fingerprint"> = {
    schemaVersion: "storyteller-audiobook-sequence-v1",
    id: `audiobook_track_plan_sequence_${suffix}`,
    projectId: `project_track_plan_${suffix}`,
    bookId: `book_track_plan_${suffix}`,
    title: "Retail Track Plan Fixture",
    languageTag: "en-AU",
    chapterSequenceFingerprint: "b".repeat(64),
    openingDeliveryFingerprint: "c".repeat(64),
    closingDeliveryFingerprint: "d".repeat(64),
    rightsFingerprint,
    engineeringProfileFingerprint,
    output: Object.freeze({
      format: "wav" as const,
      sampleRateHz: options.sampleRateHz ?? 44_100,
      channels: 1 as const,
      bitDepth: 24 as const,
    }),
    components: Object.freeze(components),
    chapterCount: sections.length,
    totalDurationMs: cursor,
    status: "ready-for-retail-encoding",
    createdByActorId: "owner_track_plan_001",
    revision: 1,
    createdAt: t0.toISOString(),
    updatedAt: t0.toISOString(),
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
}

function rights(
  overrides: Partial<ArtifactRightsSnapshot> = {},
): ArtifactRightsSnapshot {
  return {
    rightsEvidenceId: "rights_track_plan_001",
    rightsFingerprint,
    allowedUses: ["audiobook"],
    commercialUseApproved: true,
    expiresAt: "2028-07-28T00:00:00.000Z",
    retainUntil: "2033-07-28T00:00:00.000Z",
    deletionRequiredAt: "2034-07-28T00:00:00.000Z",
    ...overrides,
  };
}

function engineeringPolicy(
  temporaryRoot: string,
  runner: AudioEngineeringRunner,
): GenerationAudioEngineeringPolicy {
  return createGenerationAudioEngineeringPolicy({
    profile: ACX_AUDIOBOOK_PROFILE,
    externalVersion: "acx-2026-07",
    reviewedAt: "2026-07-27T00:00:00.000Z",
    sourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner,
    ffprobePath: "/opt/media/ffprobe",
    ffmpegPath: "/opt/media/ffmpeg",
    timeoutMs: 30_000,
    maximumOutputBytes: 2 * 1024 * 1024,
    temporaryRoot,
    now: t0,
  });
}

async function renderFixture(
  sequence: AudiobookSequence,
): Promise<AudiobookRenderResult> {
  return await renderAudiobookSequence({
    sequence,
    sources: new TrackPlanSourceResolver(),
    runner: new TrackPlanRenderRunner(),
    renderedAt: t1,
    maximumOutputBytes: 0xffff_ffff,
  });
}

function retailPolicy(): AudiobookRetailEncodingPolicy {
  return createAcxAudibleRetailEncodingPolicy({
    externalVersion: "2026-04-15",
    reviewedAt: t0.toISOString(),
    expiresAt: "2026-10-28T00:00:00.000Z",
    sourceReference:
      "ACX audio submission requirements reviewed 2026-07-28",
    now: t7,
  });
}

async function approvedFixture(input: Readonly<{
  root: string;
  options?: FixtureOptions;
}>): Promise<ApprovedFixture> {
  const options = input.options ?? {};
  const sampleRateHz = options.sampleRateHz ?? 44_100;
  const suffix = options.suffix ?? "001";
  const temporaryRoot = join(input.root, `temporary_${suffix}`);
  const policyForEngineering = engineeringPolicy(
    temporaryRoot,
    new TrackPlanEngineeringRunner(1, sampleRateHz),
  );
  const sequence = sequenceFixture(
    policyForEngineering.profile.fingerprint,
    options,
  );
  const observedDurationMs = sequence.totalDurationMs
    + (options.observedDurationAdjustmentMs ?? 0);
  const engineering = engineeringPolicy(
    temporaryRoot,
    new TrackPlanEngineeringRunner(
      observedDurationMs / 1_000,
      sampleRateHz,
    ),
  );
  assert.equal(
    engineering.profile.fingerprint,
    policyForEngineering.profile.fingerprint,
  );
  const objectStore = new FilePrivateObjectStore(
    join(input.root, `objects_${suffix}`),
  );
  const registry = new FileArtifactRegistry(
    new FileProjectStore(join(input.root, `registry_${suffix}`)),
  );
  const chain = await ingestAudiobookReferenceMaster(
    objectStore,
    registry,
    {
      sequence,
      render: await renderFixture(sequence),
      rights: options.rights ?? rights(),
      actorId: `worker_track_plan_${suffix}`,
      verifierActorId: `verifier_track_plan_${suffix}`,
      engineering,
      maximumDurationDriftMs:
        options.maximumDurationDriftMs ?? 250,
      now: t2,
    },
  );
  assert.equal(chain.eligibleForReview, true);
  const initial = createAudiobookReferenceMasterReviewSession({
    id: `reference_track_plan_review_${suffix}`,
    sequence,
    chain,
    createdAt: t3,
  });
  const editorial = recordAudiobookReferenceMasterReview(initial, {
    id: `reference_track_plan_editorial_${suffix}`,
    role: "editorial",
    reviewerId: `editorial_track_plan_${suffix}`,
    completeListenConfirmed: true,
    listenedDurationMs: chain.observedDurationMs,
    componentCountReviewed: sequence.components.length,
    boundaryCountReviewed: sequence.components.length - 1,
    playbackContexts: ["consumer-headphones", "speakers"],
    decision: "approve",
    scores: goodScores,
    decidedAt: t4,
  });
  const ready = recordAudiobookReferenceMasterReview(editorial, {
    id: `reference_track_plan_engineering_${suffix}`,
    role: "engineering",
    reviewerId: `engineering_track_plan_${suffix}`,
    completeListenConfirmed: true,
    listenedDurationMs: chain.observedDurationMs,
    componentCountReviewed: sequence.components.length,
    boundaryCountReviewed: sequence.components.length - 1,
    playbackContexts: ["studio-headphones"],
    decision: "approve",
    scores: goodScores,
    decidedAt: t5,
  });
  const approved = approveAudiobookReferenceMasterReview(
    ready,
    sequence,
    chain,
    {
      finalConfirmationId: `reference_track_plan_confirmation_${suffix}`,
      approvedByActorId: `release_director_track_plan_${suffix}`,
      humanConfirmation: true,
      approvedAt: t6,
    },
  );
  const policy = retailPolicy();
  const platformAuthorisation = createAudiobookRetailPlatformAuthorisation({
    id: `retail_track_plan_authorisation_${suffix}`,
    authorisationType: "title-specific",
    projectId: sequence.projectId,
    bookId: sequence.bookId,
    policy,
    authorisationEvidenceId: `retail_track_plan_authorisation_evidence_${suffix}`,
    effectiveAt: "2026-07-20T00:00:00.000Z",
    expiresAt: "2026-10-20T00:00:00.000Z",
    now: t7,
  });
  const narrationEligibility =
    createAudiobookRetailNarrationEligibilityEvidence({
      id: `retail_track_plan_narration_${suffix}`,
      projectId: sequence.projectId,
      bookId: sequence.bookId,
      policy,
      sourceKind: "synthetic-voice",
      rightsFingerprint: sequence.rightsFingerprint,
      attestedByActorId: `distribution_editor_track_plan_${suffix}`,
      attestedAt: t7.toISOString(),
      platformAuthorisation,
      now: t7,
    });
  return Object.freeze({
    sequence,
    chain,
    reviewSession: approved.session,
    approvedReferenceArtifact: approved.artifact,
    policy,
    narrationEligibility,
  });
}

function createPlan(
  fixture: ApprovedFixture,
  createdAt = t8,
): AudiobookRetailTrackPlan {
  return createAcxAudiobookRetailTrackPlan({
    sequence: fixture.sequence,
    referenceChain: fixture.chain,
    reviewSession: fixture.reviewSession,
    approvedReferenceArtifact: fixture.approvedReferenceArtifact,
    policy: fixture.policy,
    narrationEligibility: fixture.narrationEligibility,
    createdByActorId: "retail_planner_001",
    createdAt,
  });
}

async function withRoot(
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(
    join(tmpdir(), "storyteller-audiobook-retail-track-plan-"),
  );
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("approved whole-book evidence becomes exact ASCII ACX track intent", async () => {
  await withRoot(async (root) => {
    const fixture = await approvedFixture({ root });
    const plan = createPlan(fixture);

    assert.equal(plan.status, "ready-for-encoding");
    assert.deepEqual(plan.blockers, []);
    assert.equal(plan.tracks.length, 3);
    assert.deepEqual(
      plan.tracks.map((track) => track.fileName),
      [
        "0001OpeningCredits.mp3",
        "0002Chapter0001.mp3",
        "0003ClosingCredits.mp3",
      ],
    );
    assert.deepEqual(
      plan.tracks.map((track) => [
        track.sourceStartMs,
        track.sourceEndMs,
        track.durationMs,
      ]),
      [
        [0, 5_000, 5_000],
        [5_000, 65_000, 60_000],
        [65_000, 71_000, 6_000],
      ],
    );
    assert.deepEqual(plan.output, {
      format: "mp3",
      codec: "mp3",
      bitRateMode: "cbr",
      bitRateKbps: 192,
      sampleRateHz: 44_100,
      channels: 1,
    });
    for (const track of plan.tracks) {
      assert.match(track.fileName, /^[A-Za-z0-9]+\.mp3$/u);
      assert.equal(track.sectionHeaderRequired, true);
      assert.equal(
        track.sectionHeaderReviewedUnderReferenceApproval,
        true,
      );
      assert.equal(track.secondaryHeaderRequired, false);
    }
    assert.doesNotThrow(() => assertAudiobookRetailTrackPlan(plan));
    assert.doesNotThrow(() =>
      assertAudiobookRetailTrackPlanMatchesSources(plan, {
        ...fixture,
        now: t8,
      })
    );

    const view = audiobookRetailTrackPlanPublicView(plan);
    const serialised = JSON.stringify(view);
    assert.equal(view.status, "ready-for-encoding");
    assert.equal(view.trackCount, 3);
    for (const forbidden of [
      fixture.approvedReferenceArtifact.id,
      fixture.approvedReferenceArtifact.fingerprint,
      fixture.approvedReferenceArtifact.integrity.contentHash,
      fixture.reviewSession.id,
      fixture.reviewSession.approval!.fingerprint,
      fixture.narrationEligibility.id,
      fixture.narrationEligibility.fingerprint,
      fixture.policy.id,
      fixture.policy.fingerprint,
      "retail_planner_001",
      "/private/storyteller",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
    }
  });
});

test("prologue, chapter and epilogue receive deterministic non-title file names", async () => {
  await withRoot(async (root) => {
    const fixture = await approvedFixture({
      root,
      options: {
        suffix: "roles",
        sections: [
          { role: "prologue", durationMs: 10_000 },
          { role: "chapter", durationMs: 20_000 },
          { role: "epilogue", durationMs: 12_000 },
        ],
      },
    });
    const plan = createPlan(fixture);
    assert.equal(plan.status, "ready-for-encoding");
    assert.deepEqual(
      plan.tracks.map((track) => track.fileName),
      [
        "0001OpeningCredits.mp3",
        "0002Prologue.mp3",
        "0003Chapter0001.mp3",
        "0004Epilogue.mp3",
        "0005ClosingCredits.mp3",
      ],
    );
    assert.deepEqual(
      plan.tracks.map((track) => track.headerKind),
      [
        "opening-credit",
        "prologue-title",
        "chapter-title",
        "epilogue-title",
        "closing-credit",
      ],
    );
  });
});

test("duration drift blocks extraction until sample-accurate boundaries are reviewed", async () => {
  await withRoot(async (root) => {
    const fixture = await approvedFixture({
      root,
      options: {
        suffix: "drift",
        observedDurationAdjustmentMs: 1_000,
        maximumDurationDriftMs: 2_000,
      },
    });
    const plan = createPlan(fixture);
    assert.equal(plan.status, "blocked");
    assert.deepEqual(plan.tracks, []);
    assert.equal(plan.blockers.length, 1);
    assert.equal(
      plan.blockers[0]?.findingCode,
      "AUDIOBOOK_RETAIL_TRACK_REFERENCE_DURATION_DRIFT",
    );
    assert.equal(plan.referenceMaster.durationDriftMs, 1_000);
    const view = audiobookRetailTrackPlanPublicView(plan);
    assert.equal(view.blockers[0]?.requiredAction,
      "sample-accurate-boundary-review");
  });
});

test("non-44.1 kHz production masters require a separately approved conversion plan", async () => {
  await withRoot(async (root) => {
    const fixture = await approvedFixture({
      root,
      options: {
        suffix: "sample_rate",
        sampleRateHz: 48_000,
      },
    });
    const plan = createPlan(fixture);
    assert.equal(plan.status, "blocked");
    assert.deepEqual(plan.tracks, []);
    assert.equal(
      plan.blockers[0]?.findingCode,
      "AUDIOBOOK_RETAIL_TRACK_SOURCE_SAMPLE_RATE_CONVERSION_REQUIRED",
    );
  });
});

test("overlong narrative sections require approved secondary-header audio and a split plan", async () => {
  await withRoot(async (root) => {
    const fixture = await approvedFixture({
      root,
      options: {
        suffix: "long_section",
        sections: [
          { role: "chapter", durationMs: 7_200_001 },
        ],
      },
    });
    const plan = createPlan(fixture);
    assert.equal(plan.status, "blocked");
    assert.deepEqual(plan.tracks, []);
    const blocker = plan.blockers[0];
    assert.equal(blocker?.kind, "section-split-required");
    if (blocker?.kind !== "section-split-required") {
      assert.fail("expected section split blocker");
    }
    assert.equal(blocker.componentOrdinal, 2);
    assert.equal(blocker.durationMs, 7_200_001);
    assert.equal(blocker.maximumFileDurationMs, 7_200_000);
    assert.equal(blocker.secondaryHeaderAudioRequired, true);
    assert.equal(
      blocker.requiredAction,
      "approved-secondary-header-and-split-plan",
    );
  });
});

test("overlong credits are blocked instead of silently split", async () => {
  await withRoot(async (root) => {
    const fixture = await approvedFixture({
      root,
      options: {
        suffix: "long_credit",
        openingDurationMs: 7_200_001,
      },
    });
    const plan = createPlan(fixture);
    assert.equal(plan.status, "blocked");
    const blocker = plan.blockers[0];
    assert.equal(blocker?.kind, "credit-duration-exceeds-limit");
    if (blocker?.kind !== "credit-duration-exceeds-limit") {
      assert.fail("expected credit duration blocker");
    }
    assert.equal(blocker.role, "opening-credit");
    assert.equal(blocker.requiredAction, "manual-credit-restructure");
  });
});

test("track plans reject wrong title scope, stale rights and pre-approval reference artifacts", async () => {
  await withRoot(async (root) => {
    const fixture = await approvedFixture({ root });
    const other = await approvedFixture({
      root,
      options: { suffix: "other" },
    });
    assert.throws(
      () => createAcxAudiobookRetailTrackPlan({
        sequence: fixture.sequence,
        referenceChain: fixture.chain,
        reviewSession: fixture.reviewSession,
        approvedReferenceArtifact: fixture.approvedReferenceArtifact,
        policy: fixture.policy,
        narrationEligibility: other.narrationEligibility,
        createdByActorId: "retail_planner_scope_001",
        createdAt: t8,
      }),
      /AUDIOBOOK_RETAIL_TRACK_NARRATION_SCOPE_MISMATCH/u,
    );
    assert.throws(
      () => createAcxAudiobookRetailTrackPlan({
        sequence: fixture.sequence,
        referenceChain: fixture.chain,
        reviewSession: fixture.reviewSession,
        approvedReferenceArtifact: fixture.chain.referenceMaster.payload,
        policy: fixture.policy,
        narrationEligibility: fixture.narrationEligibility,
        createdByActorId: "retail_planner_scope_001",
        createdAt: t8,
      }),
      /AUDIOBOOK_RETAIL_TRACK_APPROVED_REFERENCE_MISMATCH/u,
    );

    const expiring = await approvedFixture({
      root,
      options: {
        suffix: "rights_expiry",
        rights: rights({
          expiresAt: "2026-07-28T00:00:07.500Z",
        }),
      },
    });
    assert.throws(
      () => createPlan(expiring, t8),
      /AUDIOBOOK_RETAIL_TRACK_RIGHTS_EXPIRED/u,
    );
    assert.throws(
      () => createPlan(fixture, t5),
      /AUDIOBOOK_RETAIL_TRACK_CHRONOLOGY_INVALID/u,
    );
  });
});

test("structural and cross-source tampering remain distinct fail-closed gates", async () => {
  await withRoot(async (root) => {
    const fixture = await approvedFixture({ root });
    const plan = createPlan(fixture);
    const firstTrack = plan.tracks[0]!;
    const {
      fingerprint: _trackFingerprint,
      ...firstTrackBase
    } = firstTrack;
    const invalidFileBase = {
      ...firstTrackBase,
      fileName: "0001 Opening Credits.mp3",
    };
    const invalidFileTrack = {
      ...invalidFileBase,
      fingerprint: stableHash(invalidFileBase),
    } as AudiobookRetailTrack;
    const {
      fingerprint: _planFingerprint,
      ...planBase
    } = plan;
    const invalidFilePlanBase = {
      ...planBase,
      tracks: Object.freeze([invalidFileTrack, ...plan.tracks.slice(1)]),
    };
    const invalidFilePlan = {
      ...invalidFilePlanBase,
      fingerprint: stableHash(invalidFilePlanBase),
    } as AudiobookRetailTrackPlan;
    assert.throws(
      () => assertAudiobookRetailTrackPlan(invalidFilePlan),
      /AUDIOBOOK_RETAIL_TRACK_FILE_NAME_INVALID/u,
    );

    const changedSourceBase = {
      ...firstTrackBase,
      source: {
        ...firstTrack.source,
        artifactId: "artifact_structurally_valid_but_wrong_001",
      },
    };
    const changedSourceTrack = {
      ...changedSourceBase,
      fingerprint: stableHash(changedSourceBase),
    } as AudiobookRetailTrack;
    const changedSourcePlanBase = {
      ...planBase,
      tracks: Object.freeze([changedSourceTrack, ...plan.tracks.slice(1)]),
    };
    const changedSourcePlan = {
      ...changedSourcePlanBase,
      fingerprint: stableHash(changedSourcePlanBase),
    } as AudiobookRetailTrackPlan;
    assert.doesNotThrow(() =>
      assertAudiobookRetailTrackPlan(changedSourcePlan)
    );
    assert.throws(
      () => assertAudiobookRetailTrackPlanMatchesSources(
        changedSourcePlan,
        {
          ...fixture,
          now: t8,
        },
      ),
      /AUDIOBOOK_RETAIL_TRACK_PLAN_SOURCE_MISMATCH/u,
    );
    assert.throws(
      () => assertAudiobookRetailTrackPlanMatchesSources(plan, {
        ...fixture,
        now: new Date("2026-10-28T00:00:00.000Z"),
      }),
      /AUDIOBOOK_RETAIL_POLICY_NOT_CURRENT/u,
    );
  });
});
