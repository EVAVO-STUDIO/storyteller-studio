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
  FileAudiobookRetailSampleReviewStore,
  AudiobookRetailSampleReviewStoreConflictError,
  approveAudiobookRetailSampleReview,
  assertAudiobookRetailSampleReviewMatchesChain,
  assertAudiobookRetailSampleReviewSession,
  audiobookRetailSampleReviewPublicView,
  createAudiobookRetailSampleReviewSession,
  recordAudiobookRetailSampleReview,
  type AudiobookRetailSampleReviewScores,
  type AudiobookRetailSampleReviewSession,
} from "./audiobook-retail-sample-review.js";
import {
  ingestAudiobookRetailSample,
  type AudiobookRetailSampleChain,
} from "./audiobook-retail-sample.js";
import {
  AUDIOBOOK_RETAIL_SAMPLE_PLAN_SCHEMA_VERSION,
  assertAudiobookRetailSamplePlan,
  type AudiobookRetailSamplePlan,
} from "./audiobook-retail-sample-plan.js";
import {
  renderAudiobookRetailSample,
  type AudiobookRetailSampleSourceResolver,
  type ResolvedAudiobookRetailSampleSource,
} from "./audiobook-retail-sample-render.js";
import type {
  AudiobookRetailTrackRenderRequest,
  AudiobookRetailTrackRenderRunner,
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
const t6 = time(6);
const t7 = time(7);
const t8 = time(8);
const t9 = time(9);
const t10 = time(10);
const t11 = time(11);
const t12 = time(12);
const rightsFingerprint = "a".repeat(64);

const excellentScores: AudiobookRetailSampleReviewScores = Object.freeze({
  startBoundaryIntegrity: 5,
  endBoundaryIntegrity: 5,
  contentContinuity: 5,
  representativeness: 5,
  spokenClarity: 5,
  encodingTransparency: 5,
  levelAndToneConsistency: 5,
  freedomFromDefects: 5,
});

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function mp3Bytes(seed: number): Uint8Array {
  return new Uint8Array([0xff, 0xfb, 0x90, 0x64, seed, 0x01, 0x02, 0x03]);
}

function rights(
  overrides: Partial<ArtifactRightsSnapshot> = {},
): ArtifactRightsSnapshot {
  return {
    rightsEvidenceId: "rights_retail_sample_review_001",
    rightsFingerprint,
    allowedUses: ["audiobook"],
    commercialUseApproved: true,
    expiresAt: "2028-07-28T00:00:00.000Z",
    retainUntil: "2033-07-28T00:00:00.000Z",
    deletionRequiredAt: "2034-07-28T00:00:00.000Z",
    ...overrides,
  };
}

function approvedSource(input: Readonly<{
  suffix?: string;
  rights?: ArtifactRightsSnapshot;
}> = {}): ArtifactRecord {
  const suffix = input.suffix ?? "001";
  const bytes = mp3Bytes(Number.parseInt(suffix.slice(-1), 10) || 9);
  const initial = createArtifactRecord({
    id: `artifact_retail_sample_review_source_${suffix}`,
    kind: "audiobook-retail-track",
    projectId: `project_retail_sample_review_${suffix}`,
    jobId: `job_retail_sample_review_source_${suffix}`,
    segmentId: `retail_sample_review_source_${suffix}`,
    takeId: `take_retail_sample_review_source_${suffix}`,
    storage: {
      driver: "private-object-store",
      provider: "storyteller-retail-sample-review-test",
      container: "private-retail-sample-review-test",
      objectKey: `sha256/${hashBytes(bytes)}.mp3`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: hashBytes(bytes),
      byteCount: bytes.byteLength,
      mimeType: "audio/mpeg",
      format: "mp3",
    },
    provenance: {
      createdByActorId: `retail_track_encoder_review_${suffix}`,
      sourceContentHash: "b".repeat(64),
      generationRequestHash: "c".repeat(64),
      parentArtifactIds: [
        `artifact_retail_track_render_review_${suffix}`,
        `artifact_reference_master_review_${suffix}`,
      ],
    },
    rights: input.rights ?? rights(),
    reviewRequired: true,
  }, t0);
  const verified = verifyArtifactIntegrity(initial, {
    observedContentHash: initial.integrity.contentHash,
    observedByteCount: initial.integrity.byteCount,
    checkedByActorId: `retail_track_verifier_review_${suffix}`,
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: t1,
  });
  return recordArtifactReview(verified, {
    decision: "approved",
    reviewerId: `retail_track_release_manager_review_${suffix}`,
    notes: "Approved narrative retail MP3 for post-render sample review fixture.",
    decidedAt: t2,
  });
}

function samplePlan(
  source: ArtifactRecord,
  suffix = "001",
): AudiobookRetailSamplePlan {
  const selectionBase = {
    selectedByActorId: `retail_sample_editor_review_${suffix}`,
    completeRangeListenConfirmed: true as const,
    representativeOfBookConfirmed: true as const,
    startBoundaryConfirmed: true as const,
    endBoundaryConfirmed: true as const,
    selectionPreference: "preferred-book-beginning" as const,
    selectedAt: t3.toISOString(),
  };
  const safetyBase = {
    reviewedByActorId: `retail_sample_safety_review_${suffix}`,
    completeRangeListenConfirmed: true as const,
    sourceFromAudiobookConfirmed: true as const,
    explicitContentDetected: false as const,
    unsuitableRetailPreviewContentDetected: false as const,
    approvedForRetailPreview: true as const,
    reviewedAt: t4.toISOString(),
  };
  const selection = Object.freeze({
    ...selectionBase,
    fingerprint: stableHash(selectionBase),
  });
  const safety = Object.freeze({
    ...safetyBase,
    fingerprint: stableHash(safetyBase),
  });
  const partial: Omit<AudiobookRetailSamplePlan, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_SAMPLE_PLAN_SCHEMA_VERSION,
    id: `retail_sample_review_plan_${suffix}`,
    projectId: source.projectId,
    bookId: `book_retail_sample_review_${suffix}`,
    distributor: "acx-audible",
    policy: Object.freeze({
      id: `retail_sample_review_policy_${suffix}`,
      externalVersion: "acx-2026-07",
      reviewedAt: "2026-07-27T00:00:00.000Z",
      expiresAt: "2027-07-27T00:00:00.000Z",
      fingerprint: "1".repeat(64),
      maximumDurationMs: 300_000,
      explicitContentProhibited: true,
      humanContentSafetyReviewRequired: true,
    }),
    trackPlan: Object.freeze({
      id: `retail_track_review_plan_${suffix}`,
      fingerprint: "2".repeat(64),
    }),
    encodeChainFingerprint: "3".repeat(64),
    trackReview: Object.freeze({
      sessionId: `retail_track_review_session_${suffix}`,
      sessionRevision: 8,
      sessionFingerprint: "4".repeat(64),
      approvalFingerprint: "5".repeat(64),
      approvedAt: t2.toISOString(),
    }),
    source: Object.freeze({
      trackOrdinal: 2,
      role: "chapter",
      fileName: "0002Chapter0001.mp3",
      originalArtifactRevision: source.revision - 1,
      originalArtifactFingerprint: source.previousFingerprint!,
      approvedArtifactId: source.id,
      approvedArtifactRevision: source.revision,
      approvedArtifactFingerprint: source.fingerprint,
      approvedArtifactContentHash: source.integrity.contentHash,
      approvedArtifactByteCount: source.integrity.byteCount,
      approvedArtifactReviewFingerprint: stableHash(source.review),
    }),
    range: Object.freeze({
      relativeStartMs: 0,
      relativeEndMs: 120_000,
      durationMs: 120_000,
      absoluteBookStartMs: 5_000,
      absoluteBookEndMs: 125_000,
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
    createdAt: t5.toISOString(),
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
  constructor(readonly plan: AudiobookRetailSamplePlan) {}

  async resolve(): Promise<ResolvedAudiobookRetailSampleSource> {
    return {
      artifactId: this.plan.source.approvedArtifactId,
      artifactRevision: this.plan.source.approvedArtifactRevision,
      artifactFingerprint: this.plan.source.approvedArtifactFingerprint,
      privatePath: "/private/storyteller/approved-sample-review-source.mp3",
      contentHash: this.plan.source.approvedArtifactContentHash,
      byteCount: this.plan.source.approvedArtifactByteCount,
      async dispose() {},
    };
  }
}

class SampleRenderRunner implements AudiobookRetailTrackRenderRunner {
  async inspectVersion(): Promise<string> {
    return "ffmpeg version 7.1 retail sample review fixture";
  }

  async render(_request: AudiobookRetailTrackRenderRequest): Promise<Uint8Array> {
    return mp3Bytes(1);
  }
}

function commandResult(
  stdout = "",
  stderr = "",
): AudioEngineeringCommandResult {
  return { exitCode: 0, stdout, stderr, durationMs: 5 };
}

class EngineeringRunner implements AudioEngineeringRunner {
  async run(
    command: AudioEngineeringCommand,
  ): Promise<AudioEngineeringCommandResult> {
    switch (command.stage) {
      case "ffprobe-version":
        return commandResult("ffprobe version 7.1 retail sample review fixture\n");
      case "ffmpeg-version":
        return commandResult("ffmpeg version 7.1 retail sample review fixture\n");
      case "probe":
        return commandResult(JSON.stringify({
          streams: [{
            codec_type: "audio",
            codec_name: "mp3",
            sample_rate: "44100",
            channels: 1,
            bit_rate: "192000",
            duration: "120.000000",
          }],
          format: {
            format_name: "mp3",
            duration: "120.000000",
            bit_rate: "192000",
            size: String(mp3Bytes(1).byteLength),
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
          "silence_start: 119",
          "silence_end: 120 | silence_duration: 1",
        ].join("\n"));
    }
  }
}

function engineeringPolicy(root: string) {
  return createGenerationAudioEngineeringPolicy({
    profile: ACX_AUDIOBOOK_PROFILE,
    externalVersion: "acx-2026-07",
    reviewedAt: "2026-07-27T00:00:00.000Z",
    sourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner: new EngineeringRunner(),
    ffprobePath: "/opt/media/ffprobe",
    ffmpegPath: "/opt/media/ffmpeg",
    timeoutMs: 30_000,
    maximumOutputBytes: 2 * 1024 * 1024,
    temporaryRoot: join(root, "engineering"),
    now: t6,
  });
}

interface Fixture {
  root: string;
  projectStore: FileProjectStore;
  chain: AudiobookRetailSampleChain;
}

async function withFixture(
  run: (fixture: Fixture) => Promise<void>,
  input: Readonly<{
    suffix?: string;
    rights?: ArtifactRightsSnapshot;
  }> = {},
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-retail-sample-review-"));
  try {
    const suffix = input.suffix ?? "001";
    const source = approvedSource({ suffix, rights: input.rights });
    const plan = samplePlan(source, suffix);
    const render = await renderAudiobookRetailSample({
      plan,
      source: new SourceResolver(plan),
      runner: new SampleRenderRunner(),
      renderedAt: t6,
    });
    const chain = await ingestAudiobookRetailSample(
      new FilePrivateObjectStore(join(root, "objects")),
      new FileArtifactRegistry(new FileProjectStore(join(root, "artifacts"))),
      {
        plan,
        render,
        approvedSourceArtifact: source,
        actorId: `retail_sample_ingestor_review_${suffix}`,
        verifierActorId: `retail_sample_verifier_review_${suffix}`,
        engineering: engineeringPolicy(root),
        now: t7,
      },
    );
    await run({
      root,
      projectStore: new FileProjectStore(join(root, "review-store")),
      chain,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function reviewInput(
  session: AudiobookRetailSampleReviewSession,
  role: "editorial" | "engineering",
  second: number,
  overrides: Partial<Parameters<typeof recordAudiobookRetailSampleReview>[1]> = {},
): Parameters<typeof recordAudiobookRetailSampleReview>[1] {
  return {
    id: `retail_sample_post_render_${role}_${second}`,
    role,
    reviewerId: role === "editorial"
      ? "retail_sample_editorial_reviewer_001"
      : "retail_sample_engineering_reviewer_001",
    completePlaybackConfirmed: true,
    listenedDurationMs: session.durationMs,
    startBoundaryConfirmed: true,
    endBoundaryConfirmed: true,
    sourceContinuityConfirmed: true,
    retailSuitabilityConfirmed: true,
    contentSafetyConfirmed: true,
    playbackContexts: role === "editorial"
      ? ["consumer-headphones", "speakers"]
      : ["studio-headphones"],
    decision: "approve",
    scores: excellentScores,
    decidedAt: time(second),
    ...overrides,
  };
}

function recomputeSession(
  session: AudiobookRetailSampleReviewSession,
  updates: Partial<Omit<AudiobookRetailSampleReviewSession, "fingerprint">>,
): AudiobookRetailSampleReviewSession {
  const { fingerprint: _fingerprint, ...base } = session;
  const partial: Omit<AudiobookRetailSampleReviewSession, "fingerprint"> = {
    ...base,
    ...updates,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
}

test("two complete independent reviews and a third human approve the exact sample", async () => {
  await withFixture(async ({ root, projectStore, chain }) => {
    const store = new FileAudiobookRetailSampleReviewStore(projectStore);
    const initial = createAudiobookRetailSampleReviewSession({
      id: "retail_sample_post_render_session_001",
      chain,
      createdAt: t8,
    });
    const created = await store.create(
      initial,
      "retail_sample_review_store_actor_001",
    );
    const duplicate = await store.create(
      initial,
      "retail_sample_review_store_actor_001",
    );
    assert.equal(created.envelopeHash, duplicate.envelopeHash);

    const editorial = recordAudiobookRetailSampleReview(
      initial,
      reviewInput(initial, "editorial", 9),
    );
    await store.save(editorial, {
      expectedRevision: initial.revision,
      actorId: "retail_sample_review_store_actor_001",
      action: "audiobook_retail_sample_review.editorial_recorded",
    });
    const engineering = recordAudiobookRetailSampleReview(
      editorial,
      reviewInput(editorial, "engineering", 10),
    );
    assert.equal(engineering.status, "ready-for-approval");
    assert.doesNotThrow(() =>
      assertAudiobookRetailSampleReviewMatchesChain(engineering, chain)
    );
    await store.save(engineering, {
      expectedRevision: editorial.revision,
      actorId: "retail_sample_review_store_actor_001",
      action: "audiobook_retail_sample_review.engineering_recorded",
    });

    const approval = approveAudiobookRetailSampleReview(
      engineering,
      chain,
      {
        finalConfirmationId: "retail_sample_final_confirmation_001",
        approvedByActorId: "retail_sample_release_manager_001",
        humanConfirmation: true,
        approvedAt: t11,
      },
    );
    assert.equal(approval.session.status, "approved");
    assert.equal(approval.artifact.kind, "audiobook-retail-sample");
    assert.equal(approval.artifact.review.status, "approved");
    assert.equal(
      approval.artifact.previousFingerprint,
      chain.sample.payload.fingerprint,
    );
    assert.equal(
      approval.artifact.revision,
      chain.sample.payload.revision + 1,
    );
    assert.doesNotThrow(() =>
      assertAudiobookRetailSampleReviewMatchesChain(
        approval.session,
        chain,
        { approvedArtifact: approval.artifact, now: t11 },
      )
    );
    await store.save(approval.session, {
      expectedRevision: engineering.revision,
      actorId: "retail_sample_review_store_actor_001",
      action: "audiobook_retail_sample_review.approved",
    });
    assert.equal(
      (await store.require(initial.id)).payload.fingerprint,
      approval.session.fingerprint,
    );

    const view = audiobookRetailSampleReviewPublicView(approval.session);
    const serialised = JSON.stringify(view);
    assert.equal(view.status, "approved");
    assert.equal(view.reviewCount, 2);
    assert.deepEqual(view.playbackContexts, [
      "consumer-headphones",
      "speakers",
      "studio-headphones",
    ]);
    for (const forbidden of [
      chain.fingerprint,
      chain.planFingerprint,
      chain.sample.payload.id,
      chain.sample.payload.fingerprint,
      chain.sample.payload.integrity.contentHash,
      chain.engineering.evidence.fingerprint,
      "retail_sample_editorial_reviewer_001",
      "retail_sample_engineering_reviewer_001",
      "retail_sample_release_manager_001",
      "retail_sample_final_confirmation_001",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
    }

    const audit = await readFile(
      join(root, "review-store", "audit", "2026-07-28.jsonl"),
      "utf8",
    );
    for (const forbidden of [
      chain.sample.payload.id,
      chain.sample.payload.integrity.contentHash,
      "retail_sample_editorial_reviewer_001",
      "retail_sample_engineering_reviewer_001",
      "retail_sample_release_manager_001",
    ]) {
      assert.equal(audit.includes(forbidden), false);
    }
  });
});

test("changes requested require findings and a later complete re-review", async () => {
  await withFixture(async ({ chain }) => {
    const initial = createAudiobookRetailSampleReviewSession({
      id: "retail_sample_post_render_changes_001",
      chain,
      createdAt: t8,
    });
    const changes = recordAudiobookRetailSampleReview(
      initial,
      reviewInput(initial, "editorial", 9, {
        decision: "changes-requested",
        findingCodes: ["RETAIL_SAMPLE_END_BOUNDARY_ABRUPT"],
        notes: "The final phrase is cut too close to the encoded end boundary.",
      }),
    );
    assert.equal(changes.status, "changes-requested");
    const engineering = recordAudiobookRetailSampleReview(
      changes,
      reviewInput(changes, "engineering", 10),
    );
    assert.equal(engineering.status, "changes-requested");
    const editorial = recordAudiobookRetailSampleReview(
      engineering,
      reviewInput(engineering, "editorial", 11, {
        id: "retail_sample_post_render_editorial_rereview_001",
      }),
    );
    assert.equal(editorial.status, "ready-for-approval");
    assert.equal(editorial.reviews.length, 3);
  });
});

test("incomplete playback, weak scores, missing contexts and shared reviewer identities remain blocked", async () => {
  await withFixture(async ({ chain }) => {
    const initial = createAudiobookRetailSampleReviewSession({
      id: "retail_sample_post_render_blockers_001",
      chain,
      createdAt: t8,
    });
    assert.throws(
      () => recordAudiobookRetailSampleReview(
        initial,
        reviewInput(initial, "editorial", 9, {
          completePlaybackConfirmed: false as true,
        }),
      ),
      /AUDIOBOOK_RETAIL_SAMPLE_REVIEW_COMPLETE_PLAYBACK_REQUIRED/u,
    );
    assert.throws(
      () => recordAudiobookRetailSampleReview(
        initial,
        reviewInput(initial, "engineering", 9, {
          playbackContexts: ["speakers"],
        }),
      ),
      /AUDIOBOOK_RETAIL_SAMPLE_REVIEW_ENGINEERING_STUDIO_CONTEXT_REQUIRED/u,
    );
    assert.throws(
      () => recordAudiobookRetailSampleReview(
        initial,
        reviewInput(initial, "editorial", 9, {
          reviewerId: "worker_retail_sample_reviewer_001",
        }),
      ),
      /AUDIOBOOK_RETAIL_SAMPLE_REVIEW_REVIEWER_INVALID/u,
    );

    const weakScores: AudiobookRetailSampleReviewScores = {
      ...excellentScores,
      sustainedListenability: 3,
    } as AudiobookRetailSampleReviewScores;
    const editorial = recordAudiobookRetailSampleReview(
      initial,
      reviewInput(initial, "editorial", 9, {
        scores: weakScores,
      }),
    );
    assert.throws(
      () => recordAudiobookRetailSampleReview(
        editorial,
        reviewInput(editorial, "engineering", 10, {
          reviewerId: "retail_sample_editorial_reviewer_001",
        }),
      ),
      /AUDIOBOOK_RETAIL_SAMPLE_REVIEW_INDEPENDENT_REVIEWERS_REQUIRED/u,
    );
    const engineering = recordAudiobookRetailSampleReview(
      editorial,
      reviewInput(editorial, "engineering", 10),
    );
    assert.equal(engineering.status, "open");
    assert.throws(
      () => approveAudiobookRetailSampleReview(engineering, chain, {
        finalConfirmationId: "retail_sample_confirmation_too_early_001",
        approvedByActorId: "retail_sample_release_manager_002",
        humanConfirmation: true,
        approvedAt: t11,
      }),
      /AUDIOBOOK_RETAIL_SAMPLE_REVIEW_NOT_READY_FOR_APPROVAL/u,
    );
  });
});

test("approval requires a third human and current rights", async () => {
  await withFixture(async ({ chain }) => {
    let session = createAudiobookRetailSampleReviewSession({
      id: "retail_sample_post_render_approval_gate_001",
      chain,
      createdAt: t8,
    });
    session = recordAudiobookRetailSampleReview(
      session,
      reviewInput(session, "editorial", 9),
    );
    session = recordAudiobookRetailSampleReview(
      session,
      reviewInput(session, "engineering", 10),
    );
    assert.throws(
      () => approveAudiobookRetailSampleReview(session, chain, {
        finalConfirmationId: "retail_sample_confirmation_shared_001",
        approvedByActorId: "retail_sample_editorial_reviewer_001",
        humanConfirmation: true,
        approvedAt: t11,
      }),
      /AUDIOBOOK_RETAIL_SAMPLE_REVIEW_INDEPENDENT_APPROVER_REQUIRED/u,
    );
    assert.throws(
      () => approveAudiobookRetailSampleReview(session, chain, {
        finalConfirmationId: "retail_sample_confirmation_bot_001",
        approvedByActorId: "automation_retail_sample_approver_001",
        humanConfirmation: true,
        approvedAt: t11,
      }),
      /AUDIOBOOK_RETAIL_SAMPLE_REVIEW_APPROVER_INVALID/u,
    );
  });

  await withFixture(async ({ chain }) => {
    let session = createAudiobookRetailSampleReviewSession({
      id: "retail_sample_post_render_expired_001",
      chain,
      createdAt: t8,
    });
    session = recordAudiobookRetailSampleReview(
      session,
      reviewInput(session, "editorial", 9),
    );
    session = recordAudiobookRetailSampleReview(
      session,
      reviewInput(session, "engineering", 10),
    );
    assert.throws(
      () => approveAudiobookRetailSampleReview(session, chain, {
        finalConfirmationId: "retail_sample_confirmation_expired_001",
        approvedByActorId: "retail_sample_release_manager_expired_001",
        humanConfirmation: true,
        approvedAt: t11,
      }),
      /AUDIOBOOK_RETAIL_SAMPLE_REVIEW_RIGHTS_EXPIRED/u,
    );
  }, {
    suffix: "expired",
    rights: rights({ expiresAt: "2026-07-28T00:00:10.500Z" }),
  });
});

test("cross-chain tampering and stale store writes fail closed", async () => {
  await withFixture(async ({ projectStore, chain }) => {
    const store = new FileAudiobookRetailSampleReviewStore(projectStore);
    const initial = createAudiobookRetailSampleReviewSession({
      id: "retail_sample_post_render_tamper_001",
      chain,
      createdAt: t8,
    });
    await store.create(initial, "retail_sample_review_store_actor_002");
    const editorial = recordAudiobookRetailSampleReview(
      initial,
      reviewInput(initial, "editorial", 9),
    );
    await store.save(editorial, {
      expectedRevision: initial.revision,
      actorId: "retail_sample_review_store_actor_002",
      action: "audiobook_retail_sample_review.editorial_recorded",
    });
    await assert.rejects(
      store.save(editorial, {
        expectedRevision: initial.revision,
        actorId: "retail_sample_review_store_actor_002",
        action: "audiobook_retail_sample_review.stale_write",
      }),
      AudiobookRetailSampleReviewStoreConflictError,
    );

    const changed = recomputeSession(initial, {
      plan: Object.freeze({
        ...initial.plan,
        id: "retail_sample_review_plan_structurally_valid_wrong_001",
      }),
    });
    assert.doesNotThrow(() =>
      assertAudiobookRetailSampleReviewSession(changed)
    );
    assert.throws(
      () => assertAudiobookRetailSampleReviewMatchesChain(changed, chain),
      /AUDIOBOOK_RETAIL_SAMPLE_REVIEW_SESSION_SUBJECT_MISMATCH/u,
    );
  });
});
