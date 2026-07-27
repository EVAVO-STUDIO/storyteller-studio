import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  analyseAudioEngineering,
  type AudioEngineeringCommand,
  type AudioEngineeringCommandResult,
  type AudioEngineeringRunner,
} from "./audio-engineering.js";
import {
  createArtifactRecord,
  recordArtifactReview,
  verifyArtifactIntegrity,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import { FileArtifactRegistry } from "./artifact-store.js";
import type { ChapterRenderRequest, ChapterRenderRunner } from "./chapter-render.js";
import { createGenerationAudioEngineeringPolicy } from "./generation-audio-engineering.js";
import { ACX_AUDIOBOOK_PROFILE, stableHash } from "./index.js";
import {
  createMasteredChapterComparisonPolicy,
  ingestMasteredChapter,
  type MasteredChapterArtifactChain,
} from "./mastered-chapter.js";
import {
  FileMasteredChapterReviewStore,
  MasteredChapterReviewError,
  MasteredChapterReviewStoreConflictError,
  approveMasteredChapterReview,
  assertMasteredChapterReviewSession,
  createMasteredChapterReviewSession,
  masteredChapterReviewPublicView,
  recordMasteredChapterReview,
  type MasteredChapterReviewScores,
} from "./mastered-chapter-review.js";
import { createMasteringPlan } from "./mastering-plan.js";
import {
  renderMasteringPlan,
  type MasteringSourceResolver,
  type ResolvedMasteringSource,
} from "./mastering-render.js";
import { FilePrivateObjectStore } from "./private-object-store.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:00:01.000Z");
const t2 = new Date("2026-07-27T00:00:02.000Z");
const t3 = new Date("2026-07-27T00:00:03.000Z");
const t4 = new Date("2026-07-27T00:00:04.000Z");
const t5 = new Date("2026-07-27T00:00:05.000Z");
const t6 = new Date("2026-07-27T00:00:06.000Z");
const t7 = new Date("2026-07-27T00:00:07.000Z");
const t8 = new Date("2026-07-27T00:00:08.000Z");
const rightsFingerprint = "a".repeat(64);

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

function rights(): ArtifactRightsSnapshot {
  return {
    rightsEvidenceId: "rights_mastered_review_001",
    rightsFingerprint,
    allowedUses: ["audiobook"],
    commercialUseApproved: true,
    expiresAt: "2028-07-27T00:00:00.000Z",
  };
}

function result(stdout = "", stderr = ""): AudioEngineeringCommandResult {
  return { exitCode: 0, stdout, stderr, durationMs: 5 };
}

class EngineeringRunner implements AudioEngineeringRunner {
  constructor(readonly input: Readonly<{
    byteCount: number;
    durationSeconds: number;
    rmsDb: number;
    peakDb: number;
    truePeakDb: number;
    noiseFloorDb: number;
  }>) {}

  async run(command: AudioEngineeringCommand): Promise<AudioEngineeringCommandResult> {
    switch (command.stage) {
      case "ffprobe-version":
        return result("ffprobe version 7.1 fixture\n");
      case "ffmpeg-version":
        return result("ffmpeg version 7.1 fixture\n");
      case "probe":
        return result(JSON.stringify({
          streams: [{
            codec_type: "audio",
            codec_name: "pcm_s24le",
            sample_rate: "44100",
            channels: 1,
            bit_rate: "192000",
            duration: this.input.durationSeconds.toFixed(6),
          }],
          format: {
            format_name: "wav",
            duration: this.input.durationSeconds.toFixed(6),
            bit_rate: "192000",
            size: String(this.input.byteCount),
          },
        }));
      case "astats":
        return result([
          `lavfi.astats.Overall.RMS_level=${this.input.rmsDb.toFixed(4)}`,
          `lavfi.astats.Overall.Peak_level=${this.input.peakDb.toFixed(4)}`,
          `lavfi.astats.Overall.Noise_floor=${this.input.noiseFloorDb.toFixed(4)}`,
          "lavfi.astats.Overall.Peak_count=0",
        ].join("\n"));
      case "loudnorm":
        return result("", JSON.stringify({
          input_i: this.input.rmsDb.toFixed(4),
          input_tp: this.input.truePeakDb.toFixed(4),
          input_lra: "4.20",
          input_thresh: "-30.20",
          target_offset: "0.10",
        }));
      case "silence":
        return result();
    }
  }
}

function verifiedArtifact(input: Readonly<{
  id: string;
  kind: "chapter-master" | "audio-analysis";
  bytes: Uint8Array;
  sourceContentHash: string;
  parentArtifactIds: readonly string[];
  reviewRequired: boolean;
}>): ArtifactRecord {
  const initial = createArtifactRecord({
    id: input.id,
    kind: input.kind,
    projectId: "project_mastered_review_001",
    jobId: "job_mastered_review_source_001",
    segmentId: "chapter_mastered_review_001",
    takeId: "take_mastered_review_source_001",
    storage: {
      driver: "private-object-store",
      provider: "storyteller-mastered-review-test",
      container: "private-mastered-review-test",
      objectKey: `sha256/${hashBytes(input.bytes)}.${input.kind === "chapter-master" ? "wav" : "json"}`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: hashBytes(input.bytes),
      byteCount: input.bytes.byteLength,
      mimeType: input.kind === "chapter-master" ? "audio/wav" : "application/json",
      format: input.kind === "chapter-master" ? "wav" : "json",
    },
    provenance: {
      createdByActorId: "worker_mastered_review_source_001",
      sourceContentHash: input.sourceContentHash,
      generationRequestHash: "b".repeat(64),
      parentArtifactIds: input.parentArtifactIds,
    },
    rights: rights(),
    reviewRequired: input.reviewRequired,
  }, t0);
  const verified = verifyArtifactIntegrity(initial, {
    observedContentHash: initial.integrity.contentHash,
    observedByteCount: initial.integrity.byteCount,
    checkedByActorId: "verifier_mastered_review_source_001",
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: t1,
  });
  return input.reviewRequired
    ? recordArtifactReview(verified, {
        decision: "approved",
        reviewerId: "director_mastered_review_source_001",
        notes: "Approved pre-master chapter before the mastering review fixture.",
        decidedAt: t2,
      })
    : verified;
}

class SourceResolver implements MasteringSourceResolver {
  constructor(readonly artifact: ArtifactRecord) {}
  async resolve(): Promise<ResolvedMasteringSource> {
    return {
      artifactId: this.artifact.id,
      privatePath: "/private/mastered-review/source.wav",
      contentHash: this.artifact.integrity.contentHash,
      byteCount: this.artifact.integrity.byteCount,
      async dispose() {},
    };
  }
}

class RenderRunner implements ChapterRenderRunner {
  constructor(readonly bytes = wavBytes(9)) {}
  async inspectVersion(): Promise<string> {
    return "ffmpeg version 7.1 fixture";
  }
  async render(_request: ChapterRenderRequest): Promise<Uint8Array> {
    return this.bytes;
  }
}

async function chainFixture(input: Readonly<{
  root: string;
  objectStore: FilePrivateObjectStore;
  registry: FileArtifactRegistry;
  seed?: number;
}>): Promise<MasteredChapterArtifactChain> {
  const sourceBytes = wavBytes(input.seed ?? 1);
  const sourceMaster = verifiedArtifact({
    id: `artifact_mastered_review_source_${input.seed ?? 1}`,
    kind: "chapter-master",
    bytes: sourceBytes,
    sourceContentHash: "c".repeat(64),
    parentArtifactIds: ["artifact_mastered_review_render_001"],
    reviewRequired: true,
  });
  const sourceEvidence = await analyseAudioEngineering({
    audioPath: "/private/mastered-review/source.wav",
    inputContentHash: sourceMaster.integrity.contentHash,
    inputByteCount: sourceMaster.integrity.byteCount,
    profile: ACX_AUDIOBOOK_PROFILE,
    profileVersion: "acx-2026-07",
    profileReviewedAt: "2026-07-01T00:00:00.000Z",
    profileSourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner: new EngineeringRunner({
      byteCount: sourceMaster.integrity.byteCount,
      durationSeconds: 10,
      rmsDb: -24,
      peakDb: -8,
      truePeakDb: -7.8,
      noiseFloorDb: -70,
    }),
    now: t2,
  });
  const sourceEngineering = verifiedArtifact({
    id: `artifact_mastered_review_engineering_${input.seed ?? 1}`,
    kind: "audio-analysis",
    bytes: new TextEncoder().encode(JSON.stringify(sourceEvidence)),
    sourceContentHash: sourceMaster.integrity.contentHash,
    parentArtifactIds: [sourceMaster.id],
    reviewRequired: false,
  });
  const plan = createMasteringPlan({
    id: `mastering_plan_review_${input.seed ?? 1}`,
    projectId: sourceMaster.projectId,
    chapterId: sourceMaster.segmentId!,
    chapterMaster: sourceMaster,
    engineeringArtifact: sourceEngineering,
    engineeringEvidence: sourceEvidence,
    targetProfile: sourceEvidence.profile,
    output: { format: "wav", sampleRateHz: 44_100, channels: 1, bitDepth: 24 },
    operations: [{
      kind: "gain",
      gainDb: 4.5,
      rationaleCode: "MASTERING_TRANSPARENT_GAIN",
    }],
    rationale: "Create a transparent mastered chapter for human review testing.",
    createdByActorId: "mastering_engineer_review_001",
    createdAt: t3,
  });
  const render = await renderMasteringPlan({
    plan,
    sourceEngineeringEvidence: sourceEvidence,
    sources: new SourceResolver(sourceMaster),
    runner: new RenderRunner(wavBytes((input.seed ?? 1) + 20)),
    renderedAt: t4,
  });
  const engineering = createGenerationAudioEngineeringPolicy({
    profile: ACX_AUDIOBOOK_PROFILE,
    externalVersion: "acx-2026-07",
    reviewedAt: "2026-07-01T00:00:00.000Z",
    sourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner: new EngineeringRunner({
      byteCount: render.bytes.byteLength,
      durationSeconds: 10,
      rmsDb: -19.5,
      peakDb: -3.5,
      truePeakDb: -3.3,
      noiseFloorDb: -65.5,
    }),
    temporaryRoot: join(input.root, `engineering-temp-${input.seed ?? 1}`),
    now: t4,
  });
  return await ingestMasteredChapter(input.objectStore, input.registry, {
    plan,
    render,
    sourceMaster,
    sourceEngineeringArtifact: sourceEngineering,
    sourceEngineeringEvidence: sourceEvidence,
    rights: rights(),
    actorId: "worker_mastered_review_001",
    verifierActorId: "verifier_mastered_review_001",
    engineering,
    comparisonPolicy: createMasteredChapterComparisonPolicy({
      id: "mastered-review-comparison-policy",
      version: "2026.07",
      reviewedAt: "2026-07-01T00:00:00.000Z",
      sourceReference: "evavo-mastered-review-comparison-policy-reviewed-2026-07",
      now: t4,
    }),
    now: t5,
  });
}

const goodScores: MasteredChapterReviewScores = {
  listenerComfort: 5,
  intelligibility: 5,
  tonalBalance: 4,
  dynamicNaturalness: 4,
  noiseConsistency: 5,
  breathAndConsonantIntegrity: 4,
  silenceAndTransitionIntegrity: 5,
  continuityWithNeighbours: 4,
};

async function withStores(
  run: (input: Readonly<{
    root: string;
    projectStore: FileProjectStore;
    objectStore: FilePrivateObjectStore;
    registry: FileArtifactRegistry;
    reviewStore: FileMasteredChapterReviewStore;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-mastered-review-"));
  try {
    const projectStore = new FileProjectStore(join(root, "project-store"));
    await run({
      root,
      projectStore,
      objectStore: new FilePrivateObjectStore(join(root, "objects")),
      registry: new FileArtifactRegistry(new FileProjectStore(join(root, "registry"))),
      reviewStore: new FileMasteredChapterReviewStore(projectStore),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function editorialApprove(session: ReturnType<typeof createMasteredChapterReviewSession>) {
  return recordMasteredChapterReview(session, {
    id: "review_editorial_001",
    role: "editorial",
    reviewerId: "editorial_reviewer_001",
    listenedDurationMs: session.durationMs,
    playbackContexts: ["consumer-headphones", "speakers"],
    decision: "approve",
    scores: goodScores,
    decidedAt: t6,
  });
}

function engineeringApprove(session: ReturnType<typeof editorialApprove>) {
  return recordMasteredChapterReview(session, {
    id: "review_engineering_001",
    role: "engineering",
    reviewerId: "engineering_reviewer_001",
    listenedDurationMs: session.durationMs,
    playbackContexts: ["studio-headphones"],
    decision: "approve",
    scores: goodScores,
    decidedAt: t7,
  });
}

test("independent full-chapter editorial and engineering reviews produce an explicit human approval", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const chain = await chainFixture({ root, objectStore, registry });
    const initial = createMasteredChapterReviewSession({
      id: "mastered_review_session_001",
      chain,
      createdAt: t5,
    });
    const editorial = editorialApprove(initial);
    assert.equal(editorial.status, "open");
    const ready = engineeringApprove(editorial);
    assert.equal(ready.status, "ready-for-approval");

    const approved = approveMasteredChapterReview(ready, chain, {
      finalConfirmationId: "mastered_review_confirmation_001",
      approvedByActorId: "mastering_owner_001",
      humanConfirmation: true,
      approvedAt: t8,
    });
    assert.equal(approved.session.status, "approved");
    assert.equal(approved.artifact.review.status, "approved");
    assert.equal(approved.artifact.previousFingerprint, chain.masteredChapter.payload.fingerprint);
    assert.doesNotThrow(() => assertMasteredChapterReviewSession(approved.session));

    const view = masteredChapterReviewPublicView(approved.session);
    const serialised = JSON.stringify(view);
    assert.equal(view.reviewCount, 2);
    assert.equal(view.status, "approved");
    assert.deepEqual(view.playbackContexts, [
      "consumer-headphones",
      "speakers",
      "studio-headphones",
    ]);
    for (const forbidden of [
      "editorial_reviewer_001",
      "engineering_reviewer_001",
      "mastering_owner_001",
      "mastered_review_confirmation_001",
      "Approved through",
    ]) assert.equal(serialised.includes(forbidden), false);
  });
});

test("changes requested remain blocking until a new independent role review approves", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const chain = await chainFixture({ root, objectStore, registry });
    let session = createMasteredChapterReviewSession({
      id: "mastered_review_session_changes_001",
      chain,
      createdAt: t5,
    });
    session = recordMasteredChapterReview(session, {
      id: "review_editorial_changes_001",
      role: "editorial",
      reviewerId: "editorial_reviewer_changes_001",
      listenedDurationMs: session.durationMs,
      playbackContexts: ["consumer-headphones"],
      decision: "changes-requested",
      scores: { ...goodScores, listenerComfort: 2 },
      notes: "Limiter movement is tiring during the final sustained passage.",
      decidedAt: t6,
    });
    session = recordMasteredChapterReview(session, {
      id: "review_engineering_changes_001",
      role: "engineering",
      reviewerId: "engineering_reviewer_changes_001",
      listenedDurationMs: session.durationMs,
      playbackContexts: ["studio-headphones"],
      decision: "approve",
      scores: goodScores,
      decidedAt: t7,
    });
    assert.equal(session.status, "changes-requested");
    assert.throws(
      () => approveMasteredChapterReview(session, chain, {
        finalConfirmationId: "confirmation_changes_001",
        approvedByActorId: "mastering_owner_001",
        humanConfirmation: true,
        approvedAt: t8,
      }),
      /MASTERED_REVIEW_NOT_READY_FOR_APPROVAL/u,
    );

    const rereviewed = recordMasteredChapterReview(session, {
      id: "review_editorial_rereview_001",
      role: "editorial",
      reviewerId: "editorial_reviewer_rereview_001",
      listenedDurationMs: session.durationMs,
      playbackContexts: ["speakers"],
      decision: "approve",
      scores: goodScores,
      notes: "The revised chapter is comfortable through the final passage.",
      decidedAt: t8,
    });
    assert.equal(rereviewed.status, "ready-for-approval");
  });
});

test("review admission enforces human independence, full listening, playback context and score gates", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const chain = await chainFixture({ root, objectStore, registry });
    const initial = createMasteredChapterReviewSession({
      id: "mastered_review_session_admission_001",
      chain,
      createdAt: t5,
    });
    assert.throws(
      () => recordMasteredChapterReview(initial, {
        id: "review_bot_001",
        role: "editorial",
        reviewerId: "automation_reviewer_001",
        listenedDurationMs: initial.durationMs,
        playbackContexts: ["speakers"],
        decision: "approve",
        scores: goodScores,
        decidedAt: t6,
      }),
      /MASTERED_REVIEW_REVIEWER_INVALID/u,
    );
    assert.throws(
      () => recordMasteredChapterReview(initial, {
        id: "review_short_001",
        role: "editorial",
        reviewerId: "editorial_short_001",
        listenedDurationMs: initial.durationMs - 5_000,
        playbackContexts: ["speakers"],
        decision: "approve",
        scores: goodScores,
        decidedAt: t6,
      }),
      /MASTERED_REVIEW_LISTEN_DURATION_INVALID/u,
    );
    assert.throws(
      () => recordMasteredChapterReview(initial, {
        id: "review_context_001",
        role: "engineering",
        reviewerId: "engineering_context_001",
        listenedDurationMs: initial.durationMs,
        playbackContexts: ["speakers"],
        decision: "approve",
        scores: goodScores,
        decidedAt: t6,
      }),
      /MASTERED_REVIEW_ENGINEERING_HEADPHONES_REQUIRED/u,
    );

    const editorial = editorialApprove(initial);
    assert.throws(
      () => recordMasteredChapterReview(editorial, {
        id: "review_same_person_001",
        role: "engineering",
        reviewerId: "editorial_reviewer_001",
        listenedDurationMs: initial.durationMs,
        playbackContexts: ["studio-headphones"],
        decision: "approve",
        scores: goodScores,
        decidedAt: t7,
      }),
      /MASTERED_REVIEW_INDEPENDENT_REVIEWERS_REQUIRED/u,
    );
    const lowScore = recordMasteredChapterReview(editorial, {
      id: "review_low_score_001",
      role: "engineering",
      reviewerId: "engineering_low_score_001",
      listenedDurationMs: initial.durationMs,
      playbackContexts: ["studio-headphones"],
      decision: "approve",
      scores: { ...goodScores, dynamicNaturalness: 3 },
      decidedAt: t7,
    });
    assert.equal(lowScore.status, "open");
  });
});

test("approval is bound to the exact mastered artifact and chain", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const first = await chainFixture({ root, objectStore, registry, seed: 1 });
    const secondRoot = join(root, "second");
    const second = await chainFixture({
      root: secondRoot,
      objectStore: new FilePrivateObjectStore(join(secondRoot, "objects")),
      registry: new FileArtifactRegistry(new FileProjectStore(join(secondRoot, "registry"))),
      seed: 2,
    });
    const ready = engineeringApprove(editorialApprove(
      createMasteredChapterReviewSession({
        id: "mastered_review_session_binding_001",
        chain: first,
        createdAt: t5,
      }),
    ));
    assert.throws(
      () => approveMasteredChapterReview(ready, second, {
        finalConfirmationId: "mastered_review_confirmation_binding_001",
        approvedByActorId: "mastering_owner_001",
        humanConfirmation: true,
        approvedAt: t8,
      }),
      /MASTERED_REVIEW_CHAIN_MISMATCH/u,
    );
  });
});

test("review store is idempotent, revision-safe and audits no reviewer identities or notes", async () => {
  await withStores(async ({ root, objectStore, registry, reviewStore }) => {
    const chain = await chainFixture({ root, objectStore, registry });
    const initial = createMasteredChapterReviewSession({
      id: "mastered_review_session_store_001",
      chain,
      createdAt: t5,
    });
    const created = await reviewStore.create(initial, "review_operator_001");
    const idempotent = await reviewStore.create(initial, "review_operator_001");
    assert.equal(idempotent.envelopeHash, created.envelopeHash);

    const editorial = editorialApprove(initial);
    const saved = await reviewStore.save(editorial, {
      expectedRevision: created.revision,
      actorId: "review_operator_001",
      action: "mastered_review.editorial_recorded",
    });
    assert.equal(saved.revision, 2);
    await assert.rejects(
      reviewStore.save(engineeringApprove(editorial), {
        expectedRevision: created.revision,
        actorId: "review_operator_001",
        action: "mastered_review.engineering_recorded",
      }),
      MasteredChapterReviewStoreConflictError,
    );

    const audit = await readFile(
      join(root, "project-store", "audit", "2026-07-27.jsonl"),
      "utf8",
    );
    assert.equal(audit.includes("editorial_reviewer_001"), false);
    assert.equal(audit.includes("Approved through"), false);
    assert.equal(audit.includes("notes"), false);
    assert.equal(audit.includes("reviewCount"), true);
  });
});

test("session fingerprints, statuses and approval records fail closed when recomputed around invalid state", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const chain = await chainFixture({ root, objectStore, registry });
    const ready = engineeringApprove(editorialApprove(
      createMasteredChapterReviewSession({
        id: "mastered_review_session_tamper_001",
        chain,
        createdAt: t5,
      }),
    ));
    const { fingerprint: _fingerprint, ...base } = ready;
    const tamperedBase = { ...base, status: "approved" as const };
    const tampered = {
      ...tamperedBase,
      fingerprint: stableHash(tamperedBase),
    };
    assert.throws(
      () => assertMasteredChapterReviewSession(tampered),
      /MASTERED_REVIEW_STATUS_MISMATCH/u,
    );

    assert.throws(
      () => approveMasteredChapterReview(ready, chain, {
        finalConfirmationId: "mastered_review_confirmation_tamper_001",
        approvedByActorId: "bot_approval_001",
        humanConfirmation: true,
        approvedAt: t8,
      }),
      /MASTERED_REVIEW_APPROVER_INVALID/u,
    );
  });
});
