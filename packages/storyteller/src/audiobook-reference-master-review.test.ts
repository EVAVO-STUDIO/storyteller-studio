import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileAudiobookReferenceMasterReviewStore,
  AudiobookReferenceMasterReviewStoreConflictError,
  approveAudiobookReferenceMasterReview,
  assertAudiobookReferenceMasterReviewSession,
  audiobookReferenceMasterReviewPublicView,
  createAudiobookReferenceMasterReviewSession,
  recordAudiobookReferenceMasterReview,
  type AudiobookReferenceMasterReviewScores,
  type AudiobookReferenceMasterReviewSession,
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
import type {
  AudiobookSequence,
  AudiobookSequenceArtifactSnapshot,
  AudiobookSequenceComponent,
} from "./audiobook-sequence.js";
import type { ArtifactRightsSnapshot } from "./artifact-registry.js";
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
import { ACX_AUDIOBOOK_PROFILE, stableHash } from "./index.js";
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
const output = Object.freeze({
  format: "wav" as const,
  sampleRateHz: 44_100,
  channels: 1 as const,
  bitDepth: 24 as const,
});

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

class ReferenceEngineeringRunner implements AudioEngineeringRunner {
  constructor(readonly durationSeconds = 71) {}

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
            sample_rate: "44100",
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
          `silence_start: ${this.durationSeconds - 1}`,
          `silence_end: ${this.durationSeconds} | silence_duration: 1`,
        ].join("\n"));
    }
  }
}

class ReferenceSourceResolver implements AudiobookSourceResolver {
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

class ReferenceRenderRunner implements ChapterRenderRunner {
  constructor(readonly bytes: Uint8Array = wavBytes()) {}

  async inspectVersion(): Promise<string> {
    return "ffmpeg version 7.1 fixture";
  }

  async render(_request: ChapterRenderRequest): Promise<Uint8Array> {
    return this.bytes;
  }
}

function artifact(
  id: string,
  kind: "credit-master" | "mastered-chapter",
  fingerprintCharacter: string,
  contentCharacter: string,
): AudiobookSequenceArtifactSnapshot {
  return Object.freeze({
    id,
    kind,
    revision: 3,
    fingerprint: fingerprintCharacter.repeat(64),
    contentHash: contentCharacter.repeat(64),
    byteCount: 240_000 + Number.parseInt(fingerprintCharacter, 16),
  });
}

function component(input: Readonly<{
  ordinal: number;
  role: AudiobookSequenceComponent["role"];
  title: string;
  durationMs: number;
  startMs: number;
  artifact: AudiobookSequenceArtifactSnapshot;
  sourceFingerprint: string;
}>): AudiobookSequenceComponent {
  const partial: Omit<AudiobookSequenceComponent, "fingerprint"> = {
    ordinal: input.ordinal,
    role: input.role,
    title: input.title,
    durationMs: input.durationMs,
    startMs: input.startMs,
    endMs: input.startMs + input.durationMs,
    artifact: input.artifact,
    sourceFingerprint: input.sourceFingerprint,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
}

function sequence(
  engineeringProfileFingerprint: string,
  suffix = "001",
): AudiobookSequence {
  const opening = component({
    ordinal: 1,
    role: "opening-credit",
    title: "Opening credit",
    durationMs: 5_000,
    startMs: 0,
    artifact: artifact(
      `artifact_reference_review_opening_${suffix}`,
      "credit-master",
      "1",
      "4",
    ),
    sourceFingerprint: "7".repeat(64),
  });
  const chapter = component({
    ordinal: 2,
    role: "chapter",
    title: "Chapter One",
    durationMs: 60_000,
    startMs: opening.endMs,
    artifact: artifact(
      `artifact_reference_review_chapter_${suffix}`,
      "mastered-chapter",
      "2",
      "5",
    ),
    sourceFingerprint: "8".repeat(64),
  });
  const closing = component({
    ordinal: 3,
    role: "closing-credit",
    title: "Closing credit",
    durationMs: 6_000,
    startMs: chapter.endMs,
    artifact: artifact(
      `artifact_reference_review_closing_${suffix}`,
      "credit-master",
      "3",
      "6",
    ),
    sourceFingerprint: "9".repeat(64),
  });
  const partial: Omit<AudiobookSequence, "fingerprint"> = {
    schemaVersion: "storyteller-audiobook-sequence-v1",
    id: `audiobook_reference_review_sequence_${suffix}`,
    projectId: `project_audiobook_reference_review_${suffix}`,
    bookId: `book_audiobook_reference_review_${suffix}`,
    title: "Whole Book Review Fixture",
    languageTag: "en-AU",
    chapterSequenceFingerprint: "b".repeat(64),
    openingDeliveryFingerprint: "c".repeat(64),
    closingDeliveryFingerprint: "d".repeat(64),
    rightsFingerprint: "a".repeat(64),
    engineeringProfileFingerprint,
    output,
    components: Object.freeze([opening, chapter, closing]),
    chapterCount: 1,
    totalDurationMs: closing.endMs,
    status: "ready-for-retail-encoding",
    createdByActorId: "owner_audiobook_reference_review_001",
    revision: 1,
    createdAt: t0.toISOString(),
    updatedAt: t0.toISOString(),
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
}

function policy(
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

function rights(
  overrides: Partial<ArtifactRightsSnapshot> = {},
): ArtifactRightsSnapshot {
  return {
    rightsEvidenceId: "rights_audiobook_reference_review_001",
    rightsFingerprint: "a".repeat(64),
    allowedUses: ["audiobook"],
    commercialUseApproved: true,
    expiresAt: "2028-07-28T00:00:00.000Z",
    retainUntil: "2033-07-28T00:00:00.000Z",
    deletionRequiredAt: "2034-07-28T00:00:00.000Z",
    ...overrides,
  };
}

function withSequenceFingerprint(
  value: AudiobookSequence,
  updates: Partial<Omit<AudiobookSequence, "fingerprint">>,
): AudiobookSequence {
  const { fingerprint: _fingerprint, ...base } = value;
  const partial: Omit<AudiobookSequence, "fingerprint"> = {
    ...base,
    ...updates,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
}

async function renderFixture(
  value: AudiobookSequence,
): Promise<AudiobookRenderResult> {
  return await renderAudiobookSequence({
    sequence: value,
    sources: new ReferenceSourceResolver(),
    runner: new ReferenceRenderRunner(),
    renderedAt: t1,
    maximumOutputBytes: 100_000_000,
  });
}

async function chainFixture(input: Readonly<{
  temporaryRoot: string;
  objectStore: FilePrivateObjectStore;
  registry: FileArtifactRegistry;
  suffix?: string;
  rights?: ArtifactRightsSnapshot;
}>): Promise<Readonly<{
  sequence: AudiobookSequence;
  chain: AudiobookReferenceMasterChain;
}>> {
  const engineering = policy(
    input.temporaryRoot,
    new ReferenceEngineeringRunner(),
  );
  const plan = sequence(engineering.profile.fingerprint, input.suffix);
  const chain = await ingestAudiobookReferenceMaster(
    input.objectStore,
    input.registry,
    {
      sequence: plan,
      render: await renderFixture(plan),
      rights: input.rights ?? rights(),
      actorId: "worker_audiobook_reference_review_001",
      verifierActorId: "verifier_audiobook_reference_review_001",
      engineering,
      now: t2,
    },
  );
  return Object.freeze({ sequence: plan, chain });
}

async function withStores(
  run: (input: Readonly<{
    root: string;
    temporaryRoot: string;
    projectStore: FileProjectStore;
    objectStore: FilePrivateObjectStore;
    registry: FileArtifactRegistry;
    reviewStore: FileAudiobookReferenceMasterReviewStore;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(
    join(tmpdir(), "storyteller-audiobook-reference-review-"),
  );
  try {
    const projectStore = new FileProjectStore(join(root, "project-store"));
    await run({
      root,
      temporaryRoot: join(root, "temporary"),
      projectStore,
      objectStore: new FilePrivateObjectStore(join(root, "objects")),
      registry: new FileArtifactRegistry(
        new FileProjectStore(join(root, "registry")),
      ),
      reviewStore: new FileAudiobookReferenceMasterReviewStore(projectStore),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const goodScores: AudiobookReferenceMasterReviewScores = {
  narrativeContinuity: 5,
  sustainedListenability: 5,
  chapterOrderAndLabelling: 5,
  creditAccuracy: 5,
  transitionIntegrity: 4,
  silenceAndBoundaryIntegrity: 4,
  tonalAndLoudnessConsistency: 5,
  freedomFromTechnicalDefects: 5,
};

function editorialApproval(
  session: AudiobookReferenceMasterReviewSession,
  input: Readonly<{
    id?: string;
    reviewerId?: string;
    decidedAt?: Date;
    scores?: AudiobookReferenceMasterReviewScores;
  }> = {},
): AudiobookReferenceMasterReviewSession {
  return recordAudiobookReferenceMasterReview(session, {
    id: input.id ?? "audiobook_reference_editorial_review_001",
    role: "editorial",
    reviewerId: input.reviewerId ?? "editorial_reviewer_reference_001",
    completeListenConfirmed: true,
    listenedDurationMs: session.durationMs,
    componentCountReviewed: session.sequence.componentCount,
    boundaryCountReviewed: session.boundaryCount,
    playbackContexts: ["consumer-headphones", "speakers"],
    decision: "approve",
    scores: input.scores ?? goodScores,
    decidedAt: input.decidedAt ?? t4,
  });
}

function engineeringApproval(
  session: AudiobookReferenceMasterReviewSession,
  input: Readonly<{
    id?: string;
    reviewerId?: string;
    decidedAt?: Date;
    scores?: AudiobookReferenceMasterReviewScores;
  }> = {},
): AudiobookReferenceMasterReviewSession {
  return recordAudiobookReferenceMasterReview(session, {
    id: input.id ?? "audiobook_reference_engineering_review_001",
    role: "engineering",
    reviewerId: input.reviewerId ?? "engineering_reviewer_reference_001",
    completeListenConfirmed: true,
    listenedDurationMs: session.durationMs,
    componentCountReviewed: session.sequence.componentCount,
    boundaryCountReviewed: session.boundaryCount,
    playbackContexts: ["studio-headphones"],
    decision: "approve",
    scores: input.scores ?? goodScores,
    decidedAt: input.decidedAt ?? t5,
  });
}

test("complete independent whole-book reviews require a third human approval", async () => {
  await withStores(async ({
    temporaryRoot,
    objectStore,
    registry,
  }) => {
    const fixture = await chainFixture({
      temporaryRoot,
      objectStore,
      registry,
    });
    const initial = createAudiobookReferenceMasterReviewSession({
      id: "audiobook_reference_review_session_001",
      sequence: fixture.sequence,
      chain: fixture.chain,
      createdAt: t3,
    });
    assert.equal(initial.status, "open");

    const editorial = editorialApproval(initial);
    assert.equal(editorial.status, "open");
    const ready = engineeringApproval(editorial);
    assert.equal(ready.status, "ready-for-approval");

    const approved = approveAudiobookReferenceMasterReview(
      ready,
      fixture.sequence,
      fixture.chain,
      {
        finalConfirmationId: "audiobook_reference_confirmation_001",
        approvedByActorId: "audiobook_release_director_001",
        humanConfirmation: true,
        approvedAt: t6,
      },
    );

    assert.equal(approved.session.status, "approved");
    assert.equal(approved.artifact.review.status, "approved");
    assert.equal(
      approved.artifact.previousFingerprint,
      fixture.chain.referenceMaster.payload.fingerprint,
    );
    assert.equal(
      approved.artifact.revision,
      fixture.chain.referenceMaster.payload.revision + 1,
    );
    assert.equal(
      approved.session.approval?.approvedArtifactFingerprint,
      approved.artifact.fingerprint,
    );
    assert.equal(
      approved.session.approval?.artifactReviewFingerprint,
      stableHash(approved.artifact.review),
    );
    assert.doesNotThrow(() =>
      assertAudiobookReferenceMasterReviewSession(approved.session)
    );

    const view = audiobookReferenceMasterReviewPublicView(approved.session);
    const serialised = JSON.stringify(view);
    assert.equal(view.status, "approved");
    assert.equal(view.reviewCount, 2);
    assert.equal(view.componentCount, 3);
    assert.equal(view.boundaryCount, 2);
    assert.deepEqual(view.playbackContexts, [
      "consumer-headphones",
      "speakers",
      "studio-headphones",
    ]);
    for (const forbidden of [
      "editorial_reviewer_reference_001",
      "engineering_reviewer_reference_001",
      "audiobook_release_director_001",
      "audiobook_reference_confirmation_001",
      "rights_audiobook_reference_review_001",
      fixture.chain.fingerprint,
      fixture.chain.referenceMaster.payload.integrity.contentHash,
      "Approved through audiobook reference-master review session",
      "/opt/media/ffprobe",
      temporaryRoot,
    ]) {
      assert.equal(serialised.includes(forbidden), false);
    }
  });
});

test("coverage, context, findings, scores and independence remain blocking", async () => {
  await withStores(async ({
    temporaryRoot,
    objectStore,
    registry,
  }) => {
    const fixture = await chainFixture({
      temporaryRoot,
      objectStore,
      registry,
    });
    const initial = createAudiobookReferenceMasterReviewSession({
      id: "audiobook_reference_review_admission_001",
      sequence: fixture.sequence,
      chain: fixture.chain,
      createdAt: t3,
    });
    const base = {
      id: "audiobook_reference_invalid_review_001",
      role: "editorial" as const,
      reviewerId: "editorial_invalid_reference_001",
      completeListenConfirmed: true as const,
      listenedDurationMs: initial.durationMs,
      componentCountReviewed: initial.sequence.componentCount,
      boundaryCountReviewed: initial.boundaryCount,
      playbackContexts: ["consumer-headphones", "speakers"] as const,
      decision: "approve" as const,
      scores: goodScores,
      decidedAt: t4,
    };

    assert.throws(
      () => recordAudiobookReferenceMasterReview(initial, {
        ...base,
        listenedDurationMs: initial.durationMs - 5_000,
      }),
      /AUDIOBOOK_REFERENCE_REVIEW_LISTEN_DURATION_INVALID/u,
    );
    assert.throws(
      () => recordAudiobookReferenceMasterReview(initial, {
        ...base,
        componentCountReviewed: initial.sequence.componentCount - 1,
      }),
      /AUDIOBOOK_REFERENCE_REVIEW_COMPONENT_COVERAGE_MISMATCH/u,
    );
    assert.throws(
      () => recordAudiobookReferenceMasterReview(initial, {
        ...base,
        boundaryCountReviewed: initial.boundaryCount - 1,
      }),
      /AUDIOBOOK_REFERENCE_REVIEW_BOUNDARY_COVERAGE_MISMATCH/u,
    );
    assert.throws(
      () => recordAudiobookReferenceMasterReview(initial, {
        ...base,
        role: "engineering",
        reviewerId: "engineering_invalid_reference_001",
        playbackContexts: ["speakers"],
      }),
      /AUDIOBOOK_REFERENCE_REVIEW_ENGINEERING_STUDIO_CONTEXT_REQUIRED/u,
    );
    assert.throws(
      () => recordAudiobookReferenceMasterReview(initial, {
        ...base,
        findingCodes: ["REFERENCE_TRANSITION_CLICK"],
      }),
      /AUDIOBOOK_REFERENCE_REVIEW_APPROVAL_FINDINGS_FORBIDDEN/u,
    );
    assert.throws(
      () => recordAudiobookReferenceMasterReview(initial, {
        ...base,
        decision: "changes-requested",
        notes: "The chapter transition needs another render.",
      }),
      /AUDIOBOOK_REFERENCE_REVIEW_CHANGE_FINDINGS_REQUIRED/u,
    );

    let session = recordAudiobookReferenceMasterReview(initial, {
      ...base,
      id: "audiobook_reference_editorial_changes_001",
      decision: "changes-requested",
      scores: { ...goodScores, transitionIntegrity: 2 },
      findingCodes: ["REFERENCE_TRANSITION_CLICK"],
      notes: "A click is audible at the chapter boundary.",
    });
    session = engineeringApproval(session);
    assert.equal(session.status, "changes-requested");
    assert.throws(
      () => approveAudiobookReferenceMasterReview(
        session,
        fixture.sequence,
        fixture.chain,
        {
          finalConfirmationId: "audiobook_reference_blocked_confirmation_001",
          approvedByActorId: "audiobook_release_director_001",
          humanConfirmation: true,
          approvedAt: t6,
        },
      ),
      /AUDIOBOOK_REFERENCE_REVIEW_NOT_READY_FOR_APPROVAL/u,
    );

    const rereviewed = editorialApproval(session, {
      id: "audiobook_reference_editorial_rereview_001",
      reviewerId: "editorial_rereviewer_reference_001",
      decidedAt: t6,
    });
    assert.equal(rereviewed.status, "ready-for-approval");
    assert.throws(
      () => approveAudiobookReferenceMasterReview(
        rereviewed,
        fixture.sequence,
        fixture.chain,
        {
          finalConfirmationId: "audiobook_reference_same_person_001",
          approvedByActorId: "engineering_reviewer_reference_001",
          humanConfirmation: true,
          approvedAt: t7,
        },
      ),
      /AUDIOBOOK_REFERENCE_REVIEW_INDEPENDENT_APPROVER_REQUIRED/u,
    );

    const editorial = editorialApproval(initial, {
      id: "audiobook_reference_editorial_low_score_001",
      reviewerId: "editorial_low_score_reference_001",
    });
    const lowScore = engineeringApproval(editorial, {
      id: "audiobook_reference_engineering_low_score_001",
      reviewerId: "engineering_low_score_reference_001",
      scores: { ...goodScores, freedomFromTechnicalDefects: 3 },
    });
    assert.equal(lowScore.status, "open");
    assert.throws(
      () => recordAudiobookReferenceMasterReview(editorial, {
        id: "audiobook_reference_same_reviewer_001",
        role: "engineering",
        reviewerId: "editorial_low_score_reference_001",
        completeListenConfirmed: true,
        listenedDurationMs: editorial.durationMs,
        componentCountReviewed: editorial.sequence.componentCount,
        boundaryCountReviewed: editorial.boundaryCount,
        playbackContexts: ["studio-headphones"],
        decision: "approve",
        scores: goodScores,
        decidedAt: t5,
      }),
      /AUDIOBOOK_REFERENCE_REVIEW_INDEPENDENT_REVIEWERS_REQUIRED/u,
    );
  });
});

test("approval is bound to the exact sequence, chain and current rights", async () => {
  await withStores(async ({
    root,
    temporaryRoot,
    objectStore,
    registry,
  }) => {
    const fixture = await chainFixture({
      temporaryRoot,
      objectStore,
      registry,
    });
    const ready = engineeringApproval(editorialApproval(
      createAudiobookReferenceMasterReviewSession({
        id: "audiobook_reference_review_binding_001",
        sequence: fixture.sequence,
        chain: fixture.chain,
        createdAt: t3,
      }),
    ));
    const alteredSequence = withSequenceFingerprint(fixture.sequence, {
      title: "A silently altered book title",
    });
    assert.throws(
      () => approveAudiobookReferenceMasterReview(
        ready,
        alteredSequence,
        fixture.chain,
        {
          finalConfirmationId: "audiobook_reference_binding_confirmation_001",
          approvedByActorId: "audiobook_release_director_001",
          humanConfirmation: true,
          approvedAt: t6,
        },
      ),
      /AUDIOBOOK_REFERENCE_REVIEW_SUBJECT_MISMATCH/u,
    );

    const expiringRoot = join(root, "expiring-rights");
    const expiring = await chainFixture({
      temporaryRoot: join(expiringRoot, "temporary"),
      objectStore: new FilePrivateObjectStore(join(expiringRoot, "objects")),
      registry: new FileArtifactRegistry(
        new FileProjectStore(join(expiringRoot, "registry")),
      ),
      suffix: "expiry",
      rights: rights({
        expiresAt: "2026-07-28T00:00:05.500Z",
      }),
    });
    const expiringReady = engineeringApproval(editorialApproval(
      createAudiobookReferenceMasterReviewSession({
        id: "audiobook_reference_review_expiry_001",
        sequence: expiring.sequence,
        chain: expiring.chain,
        createdAt: t3,
      }),
      {
        id: "audiobook_reference_editorial_expiry_001",
        reviewerId: "editorial_reviewer_expiry_001",
      },
    ), {
      id: "audiobook_reference_engineering_expiry_001",
      reviewerId: "engineering_reviewer_expiry_001",
    });
    assert.throws(
      () => approveAudiobookReferenceMasterReview(
        expiringReady,
        expiring.sequence,
        expiring.chain,
        {
          finalConfirmationId: "audiobook_reference_expiry_confirmation_001",
          approvedByActorId: "audiobook_release_director_expiry_001",
          humanConfirmation: true,
          approvedAt: t6,
        },
      ),
      /AUDIOBOOK_REFERENCE_REVIEW_RIGHTS_EXPIRED/u,
    );
  });
});

test("review store is idempotent, revision-safe and audits no reviewer identities or notes", async () => {
  await withStores(async ({
    root,
    temporaryRoot,
    objectStore,
    registry,
    reviewStore,
  }) => {
    const fixture = await chainFixture({
      temporaryRoot,
      objectStore,
      registry,
    });
    const initial = createAudiobookReferenceMasterReviewSession({
      id: "audiobook_reference_review_store_001",
      sequence: fixture.sequence,
      chain: fixture.chain,
      createdAt: t3,
    });
    const created = await reviewStore.create(initial, "review_operator_001");
    const idempotent = await reviewStore.create(initial, "review_operator_001");
    assert.equal(idempotent.envelopeHash, created.envelopeHash);

    const editorial = editorialApproval(initial);
    const saved = await reviewStore.save(editorial, {
      expectedRevision: created.revision,
      actorId: "review_operator_001",
      action: "audiobook_reference_review.editorial_recorded",
    });
    assert.equal(saved.revision, 2);
    await assert.rejects(
      reviewStore.save(engineeringApproval(editorial), {
        expectedRevision: created.revision,
        actorId: "review_operator_001",
        action: "audiobook_reference_review.engineering_recorded",
      }),
      AudiobookReferenceMasterReviewStoreConflictError,
    );

    const audit = await readFile(
      join(root, "project-store", "audit", "2026-07-28.jsonl"),
      "utf8",
    );
    for (const forbidden of [
      "editorial_reviewer_reference_001",
      "A click is audible",
      "REFERENCE_TRANSITION_CLICK",
      "findingCodes",
      "notes",
      fixture.chain.fingerprint,
      fixture.chain.referenceMaster.payload.integrity.contentHash,
    ]) {
      assert.equal(audit.includes(forbidden), false);
    }
    for (const required of [
      "reviewCount",
      "componentCount",
      "boundaryCount",
      "referenceArtifactRevision",
    ]) {
      assert.equal(audit.includes(required), true);
    }
  });
});

test("session and approval semantics fail closed after recomputed tampering", async () => {
  await withStores(async ({
    temporaryRoot,
    objectStore,
    registry,
  }) => {
    const fixture = await chainFixture({
      temporaryRoot,
      objectStore,
      registry,
    });
    const ready = engineeringApproval(editorialApproval(
      createAudiobookReferenceMasterReviewSession({
        id: "audiobook_reference_review_tamper_001",
        sequence: fixture.sequence,
        chain: fixture.chain,
        createdAt: t3,
      }),
    ));

    const firstReview = ready.reviews[0]!;
    const {
      fingerprint: _reviewFingerprint,
      ...firstReviewBase
    } = firstReview;
    const alteredReviewBase = {
      ...firstReviewBase,
      componentCountReviewed: firstReview.componentCountReviewed + 1,
    };
    const alteredReview = {
      ...alteredReviewBase,
      fingerprint: stableHash(alteredReviewBase),
    };
    const {
      fingerprint: _sessionFingerprint,
      ...sessionBase
    } = ready;
    const alteredSessionBase = {
      ...sessionBase,
      reviews: Object.freeze([alteredReview, ready.reviews[1]!]),
    };
    const alteredSession = {
      ...alteredSessionBase,
      fingerprint: stableHash(alteredSessionBase),
    };
    assert.throws(
      () => assertAudiobookReferenceMasterReviewSession(alteredSession),
      /AUDIOBOOK_REFERENCE_REVIEW_COMPONENT_COVERAGE_MISMATCH/u,
    );

    const falseApprovalBase = {
      ...sessionBase,
      status: "approved" as const,
    };
    const falseApproval = {
      ...falseApprovalBase,
      fingerprint: stableHash(falseApprovalBase),
    };
    assert.throws(
      () => assertAudiobookReferenceMasterReviewSession(falseApproval),
      /AUDIOBOOK_REFERENCE_REVIEW_STATUS_MISMATCH/u,
    );
    assert.throws(
      () => approveAudiobookReferenceMasterReview(
        ready,
        fixture.sequence,
        fixture.chain,
        {
          finalConfirmationId: "audiobook_reference_bot_confirmation_001",
          approvedByActorId: "bot_release_approval_001",
          humanConfirmation: true,
          approvedAt: t6,
        },
      ),
      /AUDIOBOOK_REFERENCE_REVIEW_APPROVER_INVALID/u,
    );

    const approved = approveAudiobookReferenceMasterReview(
      ready,
      fixture.sequence,
      fixture.chain,
      {
        finalConfirmationId: "audiobook_reference_tamper_confirmation_001",
        approvedByActorId: "audiobook_release_director_tamper_001",
        humanConfirmation: true,
        approvedAt: t6,
      },
    );
    const approval = approved.session.approval!;
    const {
      fingerprint: _approvalFingerprint,
      ...approvalBase
    } = approval;
    const alteredApprovalBase = {
      ...approvalBase,
      reviewerSetFingerprint: "f".repeat(64),
    };
    const alteredApproval = {
      ...alteredApprovalBase,
      fingerprint: stableHash(alteredApprovalBase),
    };
    const {
      fingerprint: _approvedSessionFingerprint,
      ...approvedSessionBase
    } = approved.session;
    const reviewerTamperBase = {
      ...approvedSessionBase,
      approval: alteredApproval,
    };
    const reviewerTamper = {
      ...reviewerTamperBase,
      fingerprint: stableHash(reviewerTamperBase),
    };
    assert.throws(
      () => assertAudiobookReferenceMasterReviewSession(reviewerTamper),
      /AUDIOBOOK_REFERENCE_REVIEW_REVIEWER_SET_FINGERPRINT_INVALID/u,
    );
  });
});
