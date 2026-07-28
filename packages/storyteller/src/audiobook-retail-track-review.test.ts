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
  ingestAudiobookRetailTrackRender,
  type AudiobookRetailTrackEncodeChain,
} from "./audiobook-retail-track-encode.js";
import {
  AudiobookRetailTrackReviewStoreConflictError,
  FileAudiobookRetailTrackReviewStore,
  approveAudiobookRetailTrackReview,
  assertAudiobookRetailTrackReviewMatchesChain,
  assertAudiobookRetailTrackReviewSession,
  audiobookRetailTrackReviewPublicView,
  createAudiobookRetailTrackReviewSession,
  recordAudiobookRetailTrackReview,
  type AudiobookRetailTrackReviewScores,
  type AudiobookRetailTrackReviewSession,
} from "./audiobook-retail-track-review.js";
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
    rightsEvidenceId: "rights_retail_track_review_001",
    rightsFingerprint,
    allowedUses: ["audiobook"],
    commercialUseApproved: true,
    expiresAt: "2028-07-28T00:00:00.000Z",
    retainUntil: "2033-07-28T00:00:00.000Z",
    deletionRequiredAt: "2034-07-28T00:00:00.000Z",
    ...overrides,
  };
}

function approvedReference(input: Readonly<{
  suffix?: string;
  rights?: ArtifactRightsSnapshot;
}> = {}): ArtifactRecord {
  const suffix = input.suffix ?? "001";
  const bytes = wavBytes(Number.parseInt(suffix.slice(-1), 10) || 1);
  const initial = createArtifactRecord({
    id: `artifact_retail_review_reference_${suffix}`,
    kind: "audiobook-reference-master",
    projectId: `project_retail_review_${suffix}`,
    jobId: `job_retail_review_reference_${suffix}`,
    segmentId: `book_retail_review_${suffix}`,
    takeId: `take_retail_review_reference_${suffix}`,
    storage: {
      driver: "private-object-store",
      provider: "storyteller-retail-review-test",
      container: "private-retail-review-test",
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
    notes: "Approved reference master for governed retail-track review tests.",
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
      artifactId: `artifact_retail_review_source_${input.suffix}_${input.ordinal}`,
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
      durationMs: 60_000,
      headerKind: "chapter-title",
    }),
    track({
      suffix,
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
    id: `retail_track_plan_review_${suffix}`,
    projectId: reference.projectId,
    bookId: reference.segmentId!,
    distributor: "acx-audible",
    policy: Object.freeze({
      id: `retail_policy_review_${suffix}`,
      externalVersion: "acx-2026-07",
      reviewedAt: "2026-07-27T00:00:00.000Z",
      expiresAt: "2027-07-27T00:00:00.000Z",
      fingerprint: "d".repeat(64),
    }),
    narration: Object.freeze({
      evidenceId: `retail_narration_review_${suffix}`,
      sourceKind: "human-performance",
      evidenceFingerprint: "e".repeat(64),
      platformAuthorisationPresent: false,
    }),
    sequence: Object.freeze({
      id: `audiobook_sequence_review_${suffix}`,
      revision: 1,
      fingerprint: "f".repeat(64),
      componentCount: 3,
      chapterCount: 1,
      expectedDurationMs: 71_000,
      outputFingerprint: "1".repeat(64),
    }),
    referenceMaster: Object.freeze({
      id: reference.id,
      revision: reference.revision,
      fingerprint: reference.fingerprint,
      contentHash: reference.integrity.contentHash,
      byteCount: reference.integrity.byteCount,
      expectedDurationMs: 71_000,
      observedDurationMs: 71_000,
      durationDriftMs: 0,
    }),
    review: Object.freeze({
      sessionId: `reference_review_${suffix}`,
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
  bitRateKbps: number;
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

async function chainFixture(input: Readonly<{
  root: string;
  suffix?: string;
  rights?: ArtifactRightsSnapshot;
}>): Promise<AudiobookRetailTrackEncodeChain> {
  const suffix = input.suffix ?? "001";
  const reference = approvedReference({ suffix, rights: input.rights });
  const plan = readyPlan(reference, suffix);
  const outputs = Object.freeze([mp3Bytes(1), mp3Bytes(2), mp3Bytes(3)]);
  const render: AudiobookRetailTrackRenderResult =
    await renderAudiobookRetailTrackPlan({
      plan,
      referenceMaster: new ReferenceResolver(plan),
      runner: new RenderRunner(outputs),
      renderedAt: t4,
    });
  const observations = plan.tracks.map((track, index) => ({
    durationSeconds: track.durationMs / 1_000,
    byteCount: render.tracks[index]!.bytes.byteLength,
    bitRateKbps: 192,
  }));
  return await ingestAudiobookRetailTrackRender(
    new FilePrivateObjectStore(join(input.root, "objects")),
    new FileArtifactRegistry(new FileProjectStore(join(input.root, "artifacts"))),
    {
      plan,
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
}

async function withFixture(
  run: (fixture: Readonly<{
    root: string;
    chain: AudiobookRetailTrackEncodeChain;
    projectStore: FileProjectStore;
    reviewStore: FileAudiobookRetailTrackReviewStore;
  }>) => Promise<void>,
  input: Readonly<{
    suffix?: string;
    rights?: ArtifactRightsSnapshot;
  }> = {},
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-retail-track-review-"));
  try {
    const projectStore = new FileProjectStore(join(root, "review-store"));
    await run({
      root,
      chain: await chainFixture({
        root: join(root, "chain"),
        suffix: input.suffix,
        rights: input.rights,
      }),
      projectStore,
      reviewStore: new FileAudiobookRetailTrackReviewStore(projectStore),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function reviewInput(
  session: AudiobookRetailTrackReviewSession,
  ordinal: number,
  role: "editorial" | "engineering",
  second: number,
  overrides: Partial<Parameters<typeof recordAudiobookRetailTrackReview>[1]> = {},
): Parameters<typeof recordAudiobookRetailTrackReview>[1] {
  const track = session.tracks[ordinal - 1]!;
  return {
    id: `retail_track_review_${ordinal}_${role}_${second}`,
    trackOrdinal: ordinal,
    role,
    reviewerId: role === "editorial"
      ? "editorial_reviewer_retail_001"
      : "engineering_reviewer_retail_001",
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
    decidedAt: time(second),
    ...overrides,
  };
}

function reviewAllTracks(
  session: AudiobookRetailTrackReviewSession,
  startSecond = 7,
): AudiobookRetailTrackReviewSession {
  let current = session;
  let second = startSecond;
  for (const track of session.tracks) {
    current = recordAudiobookRetailTrackReview(
      current,
      reviewInput(current, track.ordinal, "editorial", second++),
    );
    current = recordAudiobookRetailTrackReview(
      current,
      reviewInput(current, track.ordinal, "engineering", second++),
    );
  }
  return current;
}

function recomputeSession(
  session: AudiobookRetailTrackReviewSession,
  updates: Partial<Omit<AudiobookRetailTrackReviewSession, "fingerprint">>,
): AudiobookRetailTrackReviewSession {
  const { fingerprint: _fingerprint, ...base } = session;
  const partial: Omit<AudiobookRetailTrackReviewSession, "fingerprint"> = {
    ...base,
    ...updates,
  };
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

test("every retail MP3 receives complete independent playback review before third-person approval", async () => {
  await withFixture(async ({ root, chain, reviewStore }) => {
    let session = createAudiobookRetailTrackReviewSession({
      id: "retail_track_review_session_001",
      chain,
      createdAt: time(6),
    });
    const created = await reviewStore.create(session, "review_coordinator_001");
    assert.equal(created.revision, 1);
    assert.equal(
      (await reviewStore.create(session, "review_coordinator_001")).envelopeHash,
      created.envelopeHash,
    );

    let expectedRevision = created.revision;
    let second = 7;
    for (const track of session.tracks) {
      session = recordAudiobookRetailTrackReview(
        session,
        reviewInput(session, track.ordinal, "editorial", second++),
      );
      const editorial = await reviewStore.save(session, {
        expectedRevision,
        actorId: "review_coordinator_001",
        action: "audiobook_retail_track_review.editorial_recorded",
      });
      expectedRevision = editorial.revision;
      session = editorial.payload;

      session = recordAudiobookRetailTrackReview(
        session,
        reviewInput(session, track.ordinal, "engineering", second++),
      );
      const engineering = await reviewStore.save(session, {
        expectedRevision,
        actorId: "review_coordinator_001",
        action: "audiobook_retail_track_review.engineering_recorded",
      });
      expectedRevision = engineering.revision;
      session = engineering.payload;
    }

    assert.equal(session.status, "ready-for-approval");
    assert.equal(session.reviews.length, 6);
    assert.doesNotThrow(() => assertAudiobookRetailTrackReviewSession(session));
    assert.doesNotThrow(() =>
      assertAudiobookRetailTrackReviewMatchesChain(session, chain, time(13))
    );

    const approved = approveAudiobookRetailTrackReview(session, chain, {
      finalConfirmationId: "retail_track_final_confirmation_001",
      approvedByActorId: "retail_release_manager_001",
      humanConfirmation: true,
      approvedAt: time(13),
    });
    assert.equal(approved.session.status, "approved");
    assert.deepEqual(
      approved.artifacts.map((artifact) => artifact.review.status),
      ["approved", "approved", "approved"],
    );
    assert.deepEqual(
      approved.artifacts.map((artifact, index) =>
        artifact.revision === chain.tracks[index]!.artifact.payload.revision + 1
      ),
      [true, true, true],
    );
    const savedApproval = await reviewStore.save(approved.session, {
      expectedRevision,
      actorId: "retail_release_manager_001",
      action: "audiobook_retail_track_review.approved",
    });
    assert.equal(savedApproval.payload.status, "approved");

    const view = audiobookRetailTrackReviewPublicView(approved.session);
    const serialised = JSON.stringify(view);
    assert.equal(view.trackCount, 3);
    assert.equal(view.reviewerCount, 2);
    assert.equal(view.status, "approved");
    assert.deepEqual(view.tracks.map((track) => track.ready), [true, true, true]);
    for (const forbidden of [
      "editorial_reviewer_retail_001",
      "engineering_reviewer_retail_001",
      "retail_release_manager_001",
      chain.fingerprint,
      chain.tracks[0]!.artifact.payload.id,
      chain.tracks[0]!.artifact.payload.fingerprint,
      chain.tracks[0]!.artifact.payload.integrity.contentHash,
      chain.tracks[0]!.engineering.ingest.envelope.payload.id,
      "Approved through retail track review session",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
    }

    const audit = await readFile(
      join(root, "review-store", "audit", "2026-07-28.jsonl"),
      "utf8",
    );
    for (const forbidden of [
      "editorial_reviewer_retail_001",
      "engineering_reviewer_retail_001",
      chain.tracks[0]!.artifact.payload.id,
      chain.tracks[0]!.fileName,
    ]) {
      assert.equal(audit.includes(forbidden), false);
    }
  });
});

test("incomplete listens, unchecked boundaries, weak scores and invalid playback contexts never reach approval", async () => {
  await withFixture(async ({ chain }) => {
    const base = createAudiobookRetailTrackReviewSession({
      id: "retail_track_review_session_validation_001",
      chain,
      createdAt: time(6),
    });
    assert.throws(
      () => recordAudiobookRetailTrackReview(base, reviewInput(
        base,
        1,
        "editorial",
        7,
        { listenedDurationMs: 1_000 },
      )),
      /AUDIOBOOK_RETAIL_TRACK_REVIEW_LISTEN_DURATION_INVALID/u,
    );
    assert.throws(
      () => recordAudiobookRetailTrackReview(base, {
        ...reviewInput(base, 1, "editorial", 7),
        headerConfirmed: false as never,
      }),
      /AUDIOBOOK_RETAIL_TRACK_REVIEW_COMPLETE_PLAYBACK_REQUIRED/u,
    );
    assert.throws(
      () => recordAudiobookRetailTrackReview(base, reviewInput(
        base,
        1,
        "engineering",
        7,
        { playbackContexts: ["consumer-headphones"] },
      )),
      /AUDIOBOOK_RETAIL_TRACK_REVIEW_ENGINEERING_STUDIO_CONTEXT_REQUIRED/u,
    );
    assert.throws(
      () => recordAudiobookRetailTrackReview(base, reviewInput(
        base,
        1,
        "editorial",
        7,
        { reviewerId: "automation_reviewer_001" },
      )),
      /AUDIOBOOK_RETAIL_TRACK_REVIEW_REVIEWER_INVALID/u,
    );

    let session = base;
    let second = 7;
    for (const track of base.tracks) {
      session = recordAudiobookRetailTrackReview(
        session,
        reviewInput(session, track.ordinal, "editorial", second++, {
          ...(track.ordinal === 2
            ? {
                scores: {
                  ...excellentScores,
                  sustainedListenability: 3,
                },
              }
            : {}),
        }),
      );
      session = recordAudiobookRetailTrackReview(
        session,
        reviewInput(session, track.ordinal, "engineering", second++),
      );
    }
    assert.equal(session.status, "open");
    assert.throws(
      () => approveAudiobookRetailTrackReview(session, chain, {
        finalConfirmationId: "retail_track_final_confirmation_invalid_001",
        approvedByActorId: "retail_release_manager_invalid_001",
        humanConfirmation: true,
        approvedAt: time(13),
      }),
      /AUDIOBOOK_RETAIL_TRACK_REVIEW_NOT_READY_FOR_APPROVAL/u,
    );
  });
});

test("changes-requested findings require notes and a later clean re-review", async () => {
  await withFixture(async ({ chain }) => {
    let session = createAudiobookRetailTrackReviewSession({
      id: "retail_track_review_session_changes_001",
      chain,
      createdAt: time(6),
    });
    assert.throws(
      () => recordAudiobookRetailTrackReview(session, reviewInput(
        session,
        1,
        "editorial",
        7,
        { decision: "changes-requested" },
      )),
      /AUDIOBOOK_RETAIL_TRACK_REVIEW_CHANGE_FINDINGS_REQUIRED/u,
    );
    session = recordAudiobookRetailTrackReview(session, reviewInput(
      session,
      1,
      "editorial",
      7,
      {
        decision: "changes-requested",
        findingCodes: ["RETAIL_TRACK_HEADER_MISREAD"],
        notes: "Opening credit contains an incorrect spoken title.",
      },
    ));
    assert.equal(session.status, "changes-requested");
    session = recordAudiobookRetailTrackReview(session, reviewInput(
      session,
      1,
      "editorial",
      8,
    ));
    assert.equal(session.status, "open");
    session = reviewAllTracks(session, 9);
    assert.equal(session.status, "ready-for-approval");
    const view = audiobookRetailTrackReviewPublicView(session);
    assert.equal(view.findingCodes.includes("RETAIL_TRACK_HEADER_MISREAD"), false);
  });
});

test("editorial and engineering roles plus final approval remain independently human", async () => {
  await withFixture(async ({ chain }) => {
    let session = createAudiobookRetailTrackReviewSession({
      id: "retail_track_review_session_independence_001",
      chain,
      createdAt: time(6),
    });
    session = recordAudiobookRetailTrackReview(
      session,
      reviewInput(session, 1, "editorial", 7),
    );
    assert.throws(
      () => recordAudiobookRetailTrackReview(session, reviewInput(
        session,
        1,
        "engineering",
        8,
        { reviewerId: "editorial_reviewer_retail_001" },
      )),
      /AUDIOBOOK_RETAIL_TRACK_REVIEW_INDEPENDENT_ROLES_REQUIRED/u,
    );
    session = reviewAllTracks(createAudiobookRetailTrackReviewSession({
      id: "retail_track_review_session_independence_ready_001",
      chain,
      createdAt: time(6),
    }));
    assert.throws(
      () => approveAudiobookRetailTrackReview(session, chain, {
        finalConfirmationId: "retail_track_final_confirmation_same_001",
        approvedByActorId: "editorial_reviewer_retail_001",
        humanConfirmation: true,
        approvedAt: time(13),
      }),
      /AUDIOBOOK_RETAIL_TRACK_REVIEW_INDEPENDENT_APPROVER_REQUIRED/u,
    );
    assert.throws(
      () => approveAudiobookRetailTrackReview(session, chain, {
        finalConfirmationId: "retail_track_final_confirmation_bot_001",
        approvedByActorId: "worker_release_manager_001",
        humanConfirmation: true,
        approvedAt: time(13),
      }),
      /AUDIOBOOK_RETAIL_TRACK_REVIEW_APPROVER_INVALID/u,
    );
  });
});

test("expired rights and recomputed cross-source tampering fail closed", async () => {
  await withFixture(async ({ chain }) => {
    const session = createAudiobookRetailTrackReviewSession({
      id: "retail_track_review_session_tamper_001",
      chain,
      createdAt: time(6),
    });
    const changed = recomputeSession(session, {
      planFingerprint: "9".repeat(64),
    });
    assert.doesNotThrow(() => assertAudiobookRetailTrackReviewSession(changed));
    assert.throws(
      () => assertAudiobookRetailTrackReviewMatchesChain(changed, chain, time(7)),
      /AUDIOBOOK_RETAIL_TRACK_REVIEW_CHAIN_MISMATCH/u,
    );
  });

  await withFixture(async ({ chain }) => {
    assert.throws(
      () => createAudiobookRetailTrackReviewSession({
        id: "retail_track_review_session_expired_001",
        chain,
        createdAt: time(6),
      }),
      /AUDIOBOOK_RETAIL_TRACK_REVIEW_RIGHTS_EXPIRED/u,
    );
  }, {
    suffix: "expired",
    rights: rights({ expiresAt: "2026-07-28T00:00:05.500Z" }),
  });
});

test("review persistence rejects stale revisions and conflicting session identity", async () => {
  await withFixture(async ({ chain, reviewStore }) => {
    const session = createAudiobookRetailTrackReviewSession({
      id: "retail_track_review_session_store_001",
      chain,
      createdAt: time(6),
    });
    const first = await reviewStore.create(session, "review_store_actor_001");
    const changedIdentity = recomputeSession(session, {
      planFingerprint: "8".repeat(64),
    });
    await assert.rejects(
      reviewStore.create(changedIdentity, "review_store_actor_001"),
      AudiobookRetailTrackReviewStoreConflictError,
    );
    const reviewed = recordAudiobookRetailTrackReview(
      session,
      reviewInput(session, 1, "editorial", 7),
    );
    await reviewStore.save(reviewed, {
      expectedRevision: first.revision,
      actorId: "review_store_actor_001",
      action: "audiobook_retail_track_review.review_recorded",
    });
    await assert.rejects(
      reviewStore.save(reviewed, {
        expectedRevision: first.revision,
        actorId: "review_store_actor_001",
        action: "audiobook_retail_track_review.review_recorded",
      }),
      AudiobookRetailTrackReviewStoreConflictError,
    );
  });
});
