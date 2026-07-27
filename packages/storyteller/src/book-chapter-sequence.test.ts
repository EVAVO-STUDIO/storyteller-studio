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
import {
  BookChapterSequenceError,
  BookChapterSequenceStoreConflictError,
  FileBookChapterSequenceStore,
  assertBookChapterSequence,
  bookChapterSequencePublicView,
  createBookChapterSequence,
  reviseBookChapterSequence,
  type CreateBookChapterSequenceEntryInput,
} from "./book-chapter-sequence.js";
import type { ChapterRenderRequest, ChapterRenderRunner } from "./chapter-render.js";
import { createGenerationAudioEngineeringPolicy } from "./generation-audio-engineering.js";
import {
  ACX_AUDIOBOOK_PROFILE,
  stableHash,
  type DeliveryProfile,
} from "./index.js";
import {
  createMasteredChapterComparisonPolicy,
  ingestMasteredChapter,
} from "./mastered-chapter.js";
import {
  approveMasteredChapterReview,
  createMasteredChapterReviewSession,
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
const projectId = "project_book_sequence_001";

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

function rights(
  fingerprint = "a".repeat(64),
  overrides: Partial<ArtifactRightsSnapshot> = {},
): ArtifactRightsSnapshot {
  return {
    rightsEvidenceId: `rights_book_sequence_${fingerprint.slice(0, 8)}`,
    rightsFingerprint: fingerprint,
    allowedUses: ["audiobook"],
    commercialUseApproved: true,
    expiresAt: "2028-07-27T00:00:00.000Z",
    ...overrides,
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
  seed: number;
  kind: "chapter-master" | "audio-analysis";
  bytes: Uint8Array;
  sourceContentHash: string;
  parentArtifactIds: readonly string[];
  reviewRequired: boolean;
  rights: ArtifactRightsSnapshot;
}>): ArtifactRecord {
  const chapterId = `chapter_book_${input.seed}`;
  const initial = createArtifactRecord({
    id: `artifact_${input.kind.replaceAll("-", "_")}_${input.seed}`,
    kind: input.kind,
    projectId,
    jobId: `job_book_${input.seed}`,
    segmentId: chapterId,
    takeId: `take_book_${input.seed}`,
    storage: {
      driver: "private-object-store",
      provider: "storyteller-book-test",
      container: "private-book-test",
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
      createdByActorId: `worker_book_${input.seed}`,
      sourceContentHash: input.sourceContentHash,
      generationRequestHash: "b".repeat(64),
      parentArtifactIds: input.parentArtifactIds,
    },
    rights: input.rights,
    reviewRequired: input.reviewRequired,
  }, t0);
  const verified = verifyArtifactIntegrity(initial, {
    observedContentHash: initial.integrity.contentHash,
    observedByteCount: initial.integrity.byteCount,
    checkedByActorId: `verifier_book_${input.seed}`,
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: t1,
  });
  return input.reviewRequired
    ? recordArtifactReview(verified, {
        decision: "approved",
        reviewerId: `director_book_${input.seed}`,
        notes: "Approved pre-master chapter before book-sequence fixture mastering.",
        decidedAt: t2,
      })
    : verified;
}

class SourceResolver implements MasteringSourceResolver {
  constructor(readonly artifact: ArtifactRecord) {}
  async resolve(): Promise<ResolvedMasteringSource> {
    return {
      artifactId: this.artifact.id,
      privatePath: `/private/book/${this.artifact.id}.wav`,
      contentHash: this.artifact.integrity.contentHash,
      byteCount: this.artifact.integrity.byteCount,
      async dispose() {},
    };
  }
}

class RenderRunner implements ChapterRenderRunner {
  constructor(readonly bytes: Uint8Array) {}
  async inspectVersion(): Promise<string> {
    return "ffmpeg version 7.1 fixture";
  }
  async render(_request: ChapterRenderRequest): Promise<Uint8Array> {
    return this.bytes;
  }
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

async function approvedChapter(input: Readonly<{
  root: string;
  seed: number;
  profile?: DeliveryProfile;
  bitDepth?: 16 | 24 | 32;
  rightsFingerprint?: string;
  rightsOverrides?: Partial<ArtifactRightsSnapshot>;
}>): Promise<Omit<CreateBookChapterSequenceEntryInput, "ordinal" | "role" | "title">> {
  const chapterRights = rights(input.rightsFingerprint, input.rightsOverrides);
  const profile = input.profile ?? ACX_AUDIOBOOK_PROFILE;
  const sourceBytes = wavBytes(input.seed);
  const sourceMaster = verifiedArtifact({
    seed: input.seed,
    kind: "chapter-master",
    bytes: sourceBytes,
    sourceContentHash: "c".repeat(64),
    parentArtifactIds: [`artifact_render_book_${input.seed}`],
    reviewRequired: true,
    rights: chapterRights,
  });
  const sourceEvidence = await analyseAudioEngineering({
    audioPath: `/private/book/source-${input.seed}.wav`,
    inputContentHash: sourceMaster.integrity.contentHash,
    inputByteCount: sourceMaster.integrity.byteCount,
    profile,
    profileVersion: `book-profile-${profile.id}`,
    profileReviewedAt: "2026-07-01T00:00:00.000Z",
    profileSourceReference: `reviewed-book-profile-${profile.id}`,
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
    seed: input.seed,
    kind: "audio-analysis",
    bytes: new TextEncoder().encode(JSON.stringify(sourceEvidence)),
    sourceContentHash: sourceMaster.integrity.contentHash,
    parentArtifactIds: [sourceMaster.id],
    reviewRequired: false,
    rights: chapterRights,
  });
  const plan = createMasteringPlan({
    id: `mastering_plan_book_${input.seed}`,
    projectId,
    chapterId: sourceMaster.segmentId!,
    chapterMaster: sourceMaster,
    engineeringArtifact: sourceEngineering,
    engineeringEvidence: sourceEvidence,
    targetProfile: sourceEvidence.profile,
    output: {
      format: "wav",
      sampleRateHz: 44_100,
      channels: 1,
      bitDepth: input.bitDepth ?? 24,
    },
    operations: [{
      kind: "gain",
      gainDb: 4.5,
      rationaleCode: "MASTERING_TRANSPARENT_GAIN",
    }],
    rationale: "Create a consistent mastered chapter for the immutable book sequence.",
    createdByActorId: `mastering_engineer_book_${input.seed}`,
    createdAt: t3,
  });
  const render = await renderMasteringPlan({
    plan,
    sourceEngineeringEvidence: sourceEvidence,
    sources: new SourceResolver(sourceMaster),
    runner: new RenderRunner(wavBytes(input.seed + 100)),
    renderedAt: t4,
  });
  const objectStore = new FilePrivateObjectStore(join(input.root, `objects-${input.seed}`));
  const registry = new FileArtifactRegistry(
    new FileProjectStore(join(input.root, `registry-${input.seed}`)),
  );
  const chain = await ingestMasteredChapter(objectStore, registry, {
    plan,
    render,
    sourceMaster,
    sourceEngineeringArtifact: sourceEngineering,
    sourceEngineeringEvidence: sourceEvidence,
    rights: chapterRights,
    actorId: `worker_mastered_book_${input.seed}`,
    verifierActorId: `verifier_mastered_book_${input.seed}`,
    engineering: createGenerationAudioEngineeringPolicy({
      profile,
      externalVersion: `book-profile-${profile.id}`,
      reviewedAt: "2026-07-01T00:00:00.000Z",
      sourceReference: `reviewed-book-profile-${profile.id}`,
      runner: new EngineeringRunner({
        byteCount: render.bytes.byteLength,
        durationSeconds: 10,
        rmsDb: -19.5,
        peakDb: -3.5,
        truePeakDb: -3.3,
        noiseFloorDb: -65.5,
      }),
      temporaryRoot: join(input.root, `engineering-${input.seed}`),
      now: t4,
    }),
    comparisonPolicy: createMasteredChapterComparisonPolicy({
      id: `comparison_book_${input.seed}`,
      version: "2026.07",
      reviewedAt: "2026-07-01T00:00:00.000Z",
      sourceReference: "reviewed-book-comparison-policy",
      now: t4,
    }),
    now: t5,
  });
  let review = createMasteredChapterReviewSession({
    id: `mastered_review_book_${input.seed}`,
    chain,
    createdAt: t5,
  });
  review = recordMasteredChapterReview(review, {
    id: `editorial_review_book_${input.seed}`,
    role: "editorial",
    reviewerId: `editorial_reviewer_book_${input.seed}`,
    listenedDurationMs: review.durationMs,
    playbackContexts: ["consumer-headphones", "speakers"],
    decision: "approve",
    scores: goodScores,
    decidedAt: t6,
  });
  review = recordMasteredChapterReview(review, {
    id: `engineering_review_book_${input.seed}`,
    role: "engineering",
    reviewerId: `engineering_reviewer_book_${input.seed}`,
    listenedDurationMs: review.durationMs,
    playbackContexts: ["studio-headphones"],
    decision: "approve",
    scores: goodScores,
    decidedAt: t7,
  });
  const approved = approveMasteredChapterReview(review, chain, {
    finalConfirmationId: `confirmation_book_${input.seed}`,
    approvedByActorId: `book_owner_${input.seed}`,
    humanConfirmation: true,
    approvedAt: t8,
  });
  return {
    masteringPlan: plan,
    masteredChain: chain,
    reviewSession: approved.session,
    approvedArtifact: approved.artifact,
  };
}

function sequenceInput(
  chapters: readonly CreateBookChapterSequenceEntryInput[],
  createdAt = new Date("2026-07-27T00:00:09.000Z"),
) {
  return {
    id: "book_sequence_001",
    projectId,
    bookId: "book_001",
    title: "The Long Road Home",
    languageTag: "en-AU",
    seriesTitle: "The Returning Road",
    volumeNumber: 1,
    chapters,
    createdByActorId: "book_editor_001",
    createdAt,
  };
}

async function threeChapters(root: string) {
  const first = await approvedChapter({ root, seed: 1 });
  const second = await approvedChapter({ root, seed: 2 });
  const third = await approvedChapter({ root, seed: 3 });
  return [
    { ordinal: 1, role: "prologue" as const, title: "Prologue", ...first },
    { ordinal: 2, role: "chapter" as const, title: "The Crossing", ...second },
    { ordinal: 3, role: "epilogue" as const, title: "Epilogue", ...third },
  ];
}

async function withRoot(
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-book-sequence-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("approved mastered chapters form a deterministic ready-for-credits book sequence", async () => {
  await withRoot(async (root) => {
    const sequence = createBookChapterSequence(sequenceInput(await threeChapters(root)));
    assert.equal(sequence.status, "ready-for-credits");
    assert.equal(sequence.chapters.length, 3);
    assert.equal(sequence.totalDurationMs, 30_000);
    assert.equal(sequence.output.sampleRateHz, 44_100);
    assert.equal(sequence.output.channels, 1);
    assert.equal(sequence.output.bitDepth, 24);
    assert.deepEqual(sequence.chapters.map((chapter) => chapter.role), [
      "prologue",
      "chapter",
      "epilogue",
    ]);
    assert.doesNotThrow(() => assertBookChapterSequence(sequence));

    const view = bookChapterSequencePublicView(sequence);
    const serialised = JSON.stringify(view);
    assert.equal(view.chapterCount, 3);
    assert.equal(view.totalDurationMs, 30_000);
    assert.deepEqual(view.chapters.map((chapter) => chapter.title), [
      "Prologue",
      "The Crossing",
      "Epilogue",
    ]);
    for (const chapter of sequence.chapters) {
      assert.equal(serialised.includes(chapter.masteredArtifact.id), false);
      assert.equal(serialised.includes(chapter.masteredArtifact.contentHash), false);
      assert.equal(serialised.includes(chapter.reviewSessionFingerprint), false);
    }
  });
});

test("chapter ordinals, special roles and identities fail closed", async () => {
  await withRoot(async (root) => {
    const chapters = await threeChapters(root);
    assert.throws(
      () => createBookChapterSequence(sequenceInput([
        { ...chapters[0]!, ordinal: 2 },
        { ...chapters[1]!, ordinal: 1 },
        chapters[2]!,
      ])),
      /BOOK_SEQUENCE_PROLOGUE_POSITION_INVALID|BOOK_SEQUENCE_ORDINALS_NOT_CONTIGUOUS/u,
    );
    assert.throws(
      () => createBookChapterSequence(sequenceInput([
        chapters[0]!,
        { ...chapters[1]!, role: "prologue" },
        chapters[2]!,
      ])),
      /BOOK_SEQUENCE_SPECIAL_ROLE_DUPLICATE/u,
    );
    assert.throws(
      () => createBookChapterSequence(sequenceInput([
        chapters[0]!,
        { ...chapters[1]!, role: "epilogue" },
        { ...chapters[2]!, role: "chapter" },
      ])),
      /BOOK_SEQUENCE_EPILOGUE_POSITION_INVALID/u,
    );
    assert.throws(
      () => createBookChapterSequence(sequenceInput([
        chapters[0]!,
        { ...chapters[1]!, approvedArtifact: chapters[0]!.approvedArtifact },
        chapters[2]!,
      ])),
      /BOOK_SEQUENCE_REVIEW_SCOPE_MISMATCH|BOOK_SEQUENCE_ARTIFACT_REVISION_MISMATCH/u,
    );
  });
});

test("unapproved, mismatched or altered mastered evidence cannot enter the sequence", async () => {
  await withRoot(async (root) => {
    const chapters = await threeChapters(root);
    const pending = chapters[1]!.masteredChain.masteredChapter.payload;
    assert.throws(
      () => createBookChapterSequence(sequenceInput([
        chapters[0]!,
        { ...chapters[1]!, approvedArtifact: pending },
        chapters[2]!,
      ])),
      /BOOK_SEQUENCE_CHAPTER_NOT_APPROVED/u,
    );

    const alteredReview = {
      ...chapters[1]!.reviewSession,
      chainFingerprint: "f".repeat(64),
      fingerprint: stableHash({ altered: true }),
    };
    assert.throws(
      () => createBookChapterSequence(sequenceInput([
        chapters[0]!,
        { ...chapters[1]!, reviewSession: alteredReview },
        chapters[2]!,
      ])),
      /MASTERED_REVIEW_SESSION_FINGERPRINT_INVALID|BOOK_SEQUENCE_REVIEW_SCOPE_MISMATCH/u,
    );
  });
});

test("rights, engineering and output profiles must remain consistent across the book", async () => {
  await withRoot(async (root) => {
    const first = await approvedChapter({ root, seed: 1 });
    const rightsMismatch = await approvedChapter({
      root,
      seed: 2,
      rightsFingerprint: "d".repeat(64),
    });
    assert.throws(
      () => createBookChapterSequence(sequenceInput([
        { ordinal: 1, role: "chapter", title: "One", ...first },
        { ordinal: 2, role: "chapter", title: "Two", ...rightsMismatch },
      ])),
      /BOOK_SEQUENCE_RIGHTS_MISMATCH/u,
    );

    const otherProfile: DeliveryProfile = {
      ...ACX_AUDIOBOOK_PROFILE,
      id: "alternate-audiobook-profile",
      label: "Alternate governed audiobook profile",
    };
    const profileMismatch = await approvedChapter({
      root,
      seed: 3,
      profile: otherProfile,
    });
    assert.throws(
      () => createBookChapterSequence(sequenceInput([
        { ordinal: 1, role: "chapter", title: "One", ...first },
        { ordinal: 2, role: "chapter", title: "Two", ...profileMismatch },
      ])),
      /BOOK_SEQUENCE_ENGINEERING_PROFILE_MISMATCH/u,
    );

    const outputMismatch = await approvedChapter({ root, seed: 4, bitDepth: 16 });
    assert.throws(
      () => createBookChapterSequence(sequenceInput([
        { ordinal: 1, role: "chapter", title: "One", ...first },
        { ordinal: 2, role: "chapter", title: "Two", ...outputMismatch },
      ])),
      /BOOK_SEQUENCE_OUTPUT_PROFILE_MISMATCH/u,
    );

    const expired = await approvedChapter({
      root,
      seed: 5,
      rightsOverrides: { expiresAt: "2026-07-27T00:00:08.500Z" },
    });
    assert.throws(
      () => createBookChapterSequence(sequenceInput([
        { ordinal: 1, role: "chapter", title: "Expired", ...expired },
      ])),
      /BOOK_SEQUENCE_RIGHTS_EXPIRED/u,
    );
  });
});

test("sequence revisions preserve immutable book scope and linked fingerprints", async () => {
  await withRoot(async (root) => {
    const chapters = await threeChapters(root);
    const first = createBookChapterSequence(sequenceInput(chapters));
    const revised = reviseBookChapterSequence(first, {
      ...sequenceInput([
        chapters[0]!,
        { ...chapters[1]!, title: "The Flooded Crossing" },
        chapters[2]!,
      ], new Date("2026-07-27T00:00:10.000Z")),
    });
    assert.equal(revised.revision, 2);
    assert.equal(revised.previousFingerprint, first.fingerprint);
    assert.equal(revised.createdAt, first.createdAt);
    assert.equal(revised.chapters[1]?.title, "The Flooded Crossing");
    assert.throws(
      () => reviseBookChapterSequence(first, {
        ...sequenceInput(chapters),
        bookId: "book_other_001",
      }),
      /BOOK_SEQUENCE_IMMUTABLE_SCOPE_CHANGED/u,
    );
  });
});

test("book sequence store is idempotent, stale-write safe and audits only bounded summary data", async () => {
  await withRoot(async (root) => {
    const projectStore = new FileProjectStore(join(root, "sequence-store"));
    const store = new FileBookChapterSequenceStore(projectStore);
    const chapters = await threeChapters(root);
    const sequence = createBookChapterSequence(sequenceInput(chapters));
    const created = await store.create(sequence, "book_operator_001");
    const duplicate = await store.create(sequence, "book_operator_001");
    assert.equal(duplicate.envelopeHash, created.envelopeHash);

    const revised = reviseBookChapterSequence(sequence, sequenceInput(
      chapters.map((chapter) => ({ ...chapter })),
      new Date("2026-07-27T00:00:10.000Z"),
    ));
    const saved = await store.save(revised, {
      expectedRevision: 1,
      actorId: "book_operator_001",
      action: "book_sequence.revised",
    });
    assert.equal(saved.revision, 2);
    await assert.rejects(
      store.save(revised, {
        expectedRevision: 1,
        actorId: "book_operator_001",
        action: "book_sequence.revised",
      }),
      BookChapterSequenceStoreConflictError,
    );

    const audit = await readFile(
      join(root, "sequence-store", "audit", "2026-07-27.jsonl"),
      "utf8",
    );
    assert.equal(audit.includes(chapters[0]!.approvedArtifact.id), false);
    assert.equal(audit.includes("The Crossing"), false);
    assert.equal(audit.includes("chapterCount"), true);
    assert.equal(audit.includes("totalDurationMs"), true);
  });
});

test("entry, duration and sequence fingerprints reject recomputed tampering", async () => {
  await withRoot(async (root) => {
    const sequence = createBookChapterSequence(sequenceInput(await threeChapters(root)));
    const entry = sequence.chapters[0]!;
    const { fingerprint: _entryFingerprint, ...entryBase } = entry;
    const alteredEntryBase = { ...entryBase, durationMs: entry.durationMs + 1 };
    const alteredEntry = {
      ...alteredEntryBase,
      fingerprint: stableHash(alteredEntryBase),
    };
    const { fingerprint: _sequenceFingerprint, ...sequenceBase } = sequence;
    const alteredBase = {
      ...sequenceBase,
      chapters: [alteredEntry, ...sequence.chapters.slice(1)],
    };
    const altered = { ...alteredBase, fingerprint: stableHash(alteredBase) };
    assert.throws(
      () => assertBookChapterSequence(altered),
      /BOOK_SEQUENCE_TOTAL_DURATION_INVALID/u,
    );

    const statusBase = { ...sequenceBase, status: "release-ready" as const };
    const statusTampered = { ...statusBase, fingerprint: stableHash(statusBase) };
    assert.throws(
      () => assertBookChapterSequence(statusTampered as never),
      /BOOK_SEQUENCE_STATUS_INVALID/u,
    );
  });
});
