import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ACX_AUDIOBOOK_PROFILE,
  type DeliveryProfile,
} from "./index.js";
import {
  analyseAudioEngineering,
  type AudioEngineeringCommand,
  type AudioEngineeringCommandResult,
  type AudioEngineeringEvidence,
  type AudioEngineeringRunner,
} from "./audio-engineering.js";
import {
  createArtifactRecord,
  verifyArtifactIntegrity,
  type ArtifactRecord,
} from "./artifact-registry.js";
import { FileProjectStore } from "./project-store.js";
import {
  approveNarrationTakeSelection,
  assertApprovedNarrationTakeSelection,
  assertNarrationTakeReviewSession,
  createNarrationTakeReviewPolicy,
  createNarrationTakeReviewSession,
  FileNarrationTakeReviewStore,
  narrationTakeReviewPublicView,
  recordNarrationTakeReview,
  selectNarrationTake,
  type NarrationTakeReviewScores,
  type NarrationTakeReviewSession,
} from "./narration-take-review.js";

const t0 = new Date("2026-08-08T01:00:00.000Z");
const manuscriptSourceHash = "a".repeat(64);
const performanceContextFingerprint = "b".repeat(64);
const rightsFingerprint = "c".repeat(64);

function at(seconds: number): Date {
  return new Date(t0.getTime() + seconds * 1_000);
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function audioBytes(seed: number): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    seed, 0x01, 0x02, 0x03,
  ]);
}

function commandResult(stdout = "", stderr = ""): AudioEngineeringCommandResult {
  return { exitCode: 0, stdout, stderr, durationMs: 5 };
}

class EngineeringRunner implements AudioEngineeringRunner {
  constructor(
    readonly byteCount: number,
    readonly durationSeconds: number,
  ) {}

  async run(command: AudioEngineeringCommand): Promise<AudioEngineeringCommandResult> {
    switch (command.stage) {
      case "ffprobe-version":
        return commandResult("ffprobe version 7.1 fixture\n");
      case "ffmpeg-version":
        return commandResult("ffmpeg version 7.1 fixture\n");
      case "probe":
        return commandResult(JSON.stringify({
          streams: [{
            codec_type: "audio",
            codec_name: "pcm_s24le",
            sample_rate: "44100",
            channels: 1,
            bit_rate: "192000",
            duration: this.durationSeconds.toFixed(6),
          }],
          format: {
            format_name: "wav",
            duration: this.durationSeconds.toFixed(6),
            bit_rate: "192000",
            size: String(this.byteCount),
          },
        }));
      case "astats":
        return commandResult([
          "lavfi.astats.Overall.RMS_level=-20.0000",
          "lavfi.astats.Overall.Peak_level=-4.0000",
          "lavfi.astats.Overall.Noise_floor=-66.0000",
          "lavfi.astats.Overall.Peak_count=0",
        ].join("\n"));
      case "loudnorm":
        return commandResult("", JSON.stringify({
          input_i: "-20.20",
          input_tp: "-4.10",
          input_lra: "4.20",
          input_thresh: "-30.20",
          target_offset: "0.10",
        }));
      case "silence":
        return commandResult();
    }
  }
}

async function engineeringEvidence(
  bytes: Uint8Array,
  durationSeconds: number,
  profile: DeliveryProfile = ACX_AUDIOBOOK_PROFILE,
): Promise<AudioEngineeringEvidence> {
  return await analyseAudioEngineering({
    audioPath: "/private/narration-take-review/candidate.wav",
    inputContentHash: hashBytes(bytes),
    inputByteCount: bytes.byteLength,
    profile,
    profileVersion: "acx-2026-07",
    profileReviewedAt: "2026-07-01T00:00:00.000Z",
    profileSourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner: new EngineeringRunner(bytes.byteLength, durationSeconds),
    now: at(2),
  });
}

function verifiedArtifact(input: Readonly<{
  id: string;
  kind: "audio-candidate" | "transcript" | "audio-analysis";
  takeId: string;
  bytes: Uint8Array;
  mimeType: string;
  format: string;
  sourceContentHash: string;
  generationRequestHash: string;
  parentArtifactIds: readonly string[];
  reviewRequired: boolean;
  creatorId: string;
  verifierId: string;
  rightsExpiresAt?: string;
}>): ArtifactRecord {
  const initial = createArtifactRecord({
    id: input.id,
    kind: input.kind,
    projectId: "project_narration_review_001",
    jobId: "job_narration_review_001",
    segmentId: "segment_narration_review_001",
    takeId: input.takeId,
    storage: {
      driver: "private-object-store",
      provider: "storyteller-private-test",
      container: "narration-take-review-test",
      objectKey: `sha256/${hashBytes(input.bytes)}.${input.format}`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: hashBytes(input.bytes),
      byteCount: input.bytes.byteLength,
      mimeType: input.mimeType,
      format: input.format,
    },
    provenance: {
      createdByActorId: input.creatorId,
      sourceContentHash: input.sourceContentHash,
      generationRequestHash: input.generationRequestHash,
      ...(input.kind === "audio-candidate"
        ? { providerId: "audio-studio", adapterVersion: "1.0.0" }
        : {}),
      parentArtifactIds: input.parentArtifactIds,
    },
    rights: {
      rightsEvidenceId: "rights_narration_review_001",
      rightsFingerprint,
      allowedUses: ["audiobook"],
      commercialUseApproved: true,
      expiresAt: input.rightsExpiresAt ?? "2028-08-08T00:00:00.000Z",
    },
    reviewRequired: input.reviewRequired,
  }, t0);
  return verifyArtifactIntegrity(initial, {
    observedContentHash: initial.integrity.contentHash,
    observedByteCount: initial.integrity.byteCount,
    checkedByActorId: input.verifierId,
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: at(1),
  });
}

async function candidate(
  suffix: string,
  seed: number,
  durationSeconds = 1,
  rightsExpiresAt?: string,
): Promise<Readonly<{
  audioCandidate: ArtifactRecord;
  transcriptArtifact: ArtifactRecord;
  engineeringArtifact: ArtifactRecord;
  engineeringEvidence: AudioEngineeringEvidence;
}>> {
  const bytes = audioBytes(seed);
  const takeId = `take_narration_review_${suffix}`;
  const requestHash = seed.toString(16).padStart(64, "0");
  const creatorId = `worker_narration_review_${suffix}`;
  const verifierId = `verifier_narration_review_${suffix}`;
  const audio = verifiedArtifact({
    id: `artifact_audio_narration_review_${suffix}`,
    kind: "audio-candidate",
    takeId,
    bytes,
    mimeType: "audio/wav",
    format: "wav",
    sourceContentHash: manuscriptSourceHash,
    generationRequestHash: requestHash,
    parentArtifactIds: [],
    reviewRequired: true,
    creatorId,
    verifierId,
    rightsExpiresAt,
  });
  const transcriptBytes = new TextEncoder().encode(`transcript-${suffix}`);
  const transcript = verifiedArtifact({
    id: `artifact_transcript_narration_review_${suffix}`,
    kind: "transcript",
    takeId,
    bytes: transcriptBytes,
    mimeType: "text/plain",
    format: "txt",
    sourceContentHash: manuscriptSourceHash,
    generationRequestHash: requestHash,
    parentArtifactIds: [audio.id],
    reviewRequired: false,
    creatorId,
    verifierId,
    rightsExpiresAt,
  });
  const evidence = await engineeringEvidence(bytes, durationSeconds);
  const engineeringBytes = new TextEncoder().encode(JSON.stringify(evidence));
  const engineering = verifiedArtifact({
    id: `artifact_engineering_narration_review_${suffix}`,
    kind: "audio-analysis",
    takeId,
    bytes: engineeringBytes,
    mimeType: "application/json",
    format: "json",
    sourceContentHash: audio.integrity.contentHash,
    generationRequestHash: requestHash,
    parentArtifactIds: [audio.id],
    reviewRequired: false,
    creatorId,
    verifierId,
    rightsExpiresAt,
  });
  return {
    audioCandidate: audio,
    transcriptArtifact: transcript,
    engineeringArtifact: engineering,
    engineeringEvidence: evidence,
  };
}

function policy() {
  return createNarrationTakeReviewPolicy({
    id: "narration-performance-review",
    version: "2026.08",
    minimumCandidateCount: 2,
    maximumCandidateCount: 4,
    minimumDimensionScore: 4,
    requireBlindReview: true,
    requireFullListen: true,
    requiredPerspectives: ["editorial", "engineering"],
  });
}

async function session(): Promise<NarrationTakeReviewSession> {
  return createNarrationTakeReviewSession({
    id: "narration_take_review_001",
    performanceContextFingerprint,
    policy: policy(),
    candidates: [await candidate("a", 1), await candidate("b", 2)],
    createdAt: t0,
  });
}

function scores(value: number): NarrationTakeReviewScores {
  return {
    textualTruth: value,
    pronunciation: value,
    pacing: value,
    rhythm: value,
    emotionalTruth: value,
    restraint: value,
    sustainedListenability: value,
    continuity: value,
    technicalComfort: value,
  };
}

function review(
  value: NarrationTakeReviewSession,
  input: Readonly<{
    takeId: string;
    perspective: "editorial" | "engineering";
    reviewerId: string;
    score: number;
    seconds: number;
    decision?: "approve" | "changes-requested" | "reject";
    listenedDurationMs?: number;
    blind?: true;
  }>,
): NarrationTakeReviewSession {
  return recordNarrationTakeReview(value, {
    id: `review_${input.takeId}_${input.perspective}_${input.seconds}`,
    candidateTakeId: input.takeId,
    perspective: input.perspective,
    reviewerId: input.reviewerId,
    blind: input.blind ?? true,
    listenedDurationMs: input.listenedDurationMs ?? 1_000,
    playbackContexts: input.perspective === "engineering"
      ? ["studio-headphones"]
      : ["consumer-headphones", "speakers"],
    decision: input.decision ?? "approve",
    scores: scores(input.score),
    ...(input.decision && input.decision !== "approve"
      ? { notes: "This candidate needs a directed replacement before it can be selected." }
      : {}),
    decidedAt: at(input.seconds),
  });
}

function reviewAll(
  value: NarrationTakeReviewSession,
  firstScore: number,
  secondScore: number,
): NarrationTakeReviewSession {
  const [first, second] = value.candidates;
  let next = value;
  next = review(next, {
    takeId: first!.audioCandidate.takeId!,
    perspective: "editorial",
    reviewerId: "editorial_reviewer_001",
    score: firstScore,
    seconds: 10,
  });
  next = review(next, {
    takeId: first!.audioCandidate.takeId!,
    perspective: "engineering",
    reviewerId: "engineering_reviewer_001",
    score: firstScore,
    seconds: 11,
  });
  next = review(next, {
    takeId: second!.audioCandidate.takeId!,
    perspective: "editorial",
    reviewerId: "editorial_reviewer_001",
    score: secondScore,
    seconds: 12,
  });
  return review(next, {
    takeId: second!.audioCandidate.takeId!,
    perspective: "engineering",
    reviewerId: "engineering_reviewer_001",
    score: secondScore,
    seconds: 13,
  });
}

test("matched blind reviewers select the highest-rated narration take and approve its artifact", async () => {
  let value = reviewAll(await session(), 4, 5);
  const [first, second] = value.candidates;
  assert.equal(value.status, "ready-for-selection");
  assert.throws(
    () => selectNarrationTake(value, {
      candidateTakeId: first!.audioCandidate.takeId!,
      selectedByActorId: "narration_director_001",
      selectedAt: at(20),
    }),
    /NARRATION_TAKE_REVIEW_CANDIDATE_NOT_TOP_RATED/u,
  );

  value = selectNarrationTake(value, {
    candidateTakeId: second!.audioCandidate.takeId!,
    selectedByActorId: "narration_director_001",
    selectedAt: at(20),
  });
  assert.equal(value.status, "ready-for-approval");
  assert.equal(value.selection?.comparativeScore, 5);

  assert.throws(
    () => approveNarrationTakeSelection(value, {
      finalConfirmationId: "narration_confirmation_reviewer_conflict",
      approvedByActorId: "editorial_reviewer_001",
      humanConfirmation: true,
      approvedAt: at(21),
    }),
    /NARRATION_TAKE_REVIEW_APPROVER_INDEPENDENCE_REQUIRED/u,
  );

  const approved = approveNarrationTakeSelection(value, {
    finalConfirmationId: "narration_confirmation_001",
    approvedByActorId: "narration_director_001",
    humanConfirmation: true,
    approvedAt: at(21),
  });
  assert.equal(approved.session.status, "approved");
  assert.equal(approved.audioCandidate.review.status, "approved");
  assert.equal(
    approved.audioCandidate.previousFingerprint,
    second!.audioCandidate.fingerprint,
  );
  assert.doesNotThrow(() => assertApprovedNarrationTakeSelection(
    approved.session,
    approved.audioCandidate,
  ));
});

test("every candidate requires complete coverage from the same blind panel", async () => {
  let value = await session();
  const [first, second] = value.candidates;
  value = review(value, {
    takeId: first!.audioCandidate.takeId!,
    perspective: "editorial",
    reviewerId: "editorial_reviewer_001",
    score: 5,
    seconds: 10,
  });
  value = review(value, {
    takeId: first!.audioCandidate.takeId!,
    perspective: "engineering",
    reviewerId: "engineering_reviewer_001",
    score: 5,
    seconds: 11,
  });
  value = review(value, {
    takeId: second!.audioCandidate.takeId!,
    perspective: "editorial",
    reviewerId: "different_editorial_reviewer",
    score: 5,
    seconds: 12,
  });
  assert.throws(
    () => selectNarrationTake(value, {
      candidateTakeId: first!.audioCandidate.takeId!,
      selectedByActorId: "narration_director_001",
      selectedAt: at(20),
    }),
    /NARRATION_TAKE_REVIEW_COVERAGE_INCOMPLETE/u,
  );
  value = review(value, {
    takeId: second!.audioCandidate.takeId!,
    perspective: "engineering",
    reviewerId: "engineering_reviewer_001",
    score: 5,
    seconds: 13,
  });
  assert.throws(
    () => selectNarrationTake(value, {
      candidateTakeId: first!.audioCandidate.takeId!,
      selectedByActorId: "narration_director_001",
      selectedAt: at(20),
    }),
    /NARRATION_TAKE_REVIEW_PANEL_MISMATCH/u,
  );
});

test("reviewers must be independent, blind and listen to the complete take", async () => {
  const value = await session();
  const [first] = value.candidates;
  assert.throws(
    () => review(value, {
      takeId: first!.audioCandidate.takeId!,
      perspective: "editorial",
      reviewerId: first!.audioCandidate.verification.checkedByActorId!,
      score: 5,
      seconds: 10,
    }),
    /NARRATION_TAKE_REVIEW_REVIEWER_INDEPENDENCE_REQUIRED/u,
  );
  assert.throws(
    () => review(value, {
      takeId: first!.audioCandidate.takeId!,
      perspective: "editorial",
      reviewerId: "editorial_reviewer_001",
      score: 5,
      seconds: 10,
      listenedDurationMs: 500,
    }),
    /NARRATION_TAKE_REVIEW_FULL_LISTEN_REQUIRED/u,
  );
  assert.throws(
    () => recordNarrationTakeReview(value, {
      id: "review_non_blind_001",
      candidateTakeId: first!.audioCandidate.takeId!,
      perspective: "editorial",
      reviewerId: "editorial_reviewer_001",
      blind: false as true,
      listenedDurationMs: 1_000,
      playbackContexts: ["consumer-headphones"],
      decision: "approve",
      scores: scores(5),
      decidedAt: at(10),
    }),
    /NARRATION_TAKE_REVIEW_BLIND_REVIEW_REQUIRED/u,
  );

  const reviewed = reviewAll(value, 5, 4);
  assert.throws(
    () => selectNarrationTake(reviewed, {
      candidateTakeId: reviewed.candidates[0]!.audioCandidate.takeId!,
      selectedByActorId: "editorial_reviewer_001",
      selectedAt: at(20),
    }),
    /NARRATION_TAKE_REVIEW_SELECTOR_INDEPENDENCE_REQUIRED/u,
  );
  assert.throws(
    () => selectNarrationTake(reviewed, {
      candidateTakeId: reviewed.candidates[0]!.audioCandidate.takeId!,
      selectedByActorId: reviewed.candidates[0]!.audioCandidate.verification.checkedByActorId!,
      selectedAt: at(20),
    }),
    /NARRATION_TAKE_REVIEW_SELECTOR_INDEPENDENCE_REQUIRED/u,
  );
});

test("new review evidence invalidates a prior selection until comparison is current", async () => {
  let value = reviewAll(await session(), 5, 4);
  const [first] = value.candidates;
  value = selectNarrationTake(value, {
    candidateTakeId: first!.audioCandidate.takeId!,
    selectedByActorId: "narration_director_001",
    selectedAt: at(20),
  });
  assert.equal(value.status, "ready-for-approval");
  value = review(value, {
    takeId: first!.audioCandidate.takeId!,
    perspective: "editorial",
    reviewerId: "editorial_reviewer_001",
    score: 4,
    seconds: 21,
  });
  assert.equal(value.selection, undefined);
  assert.equal(value.status, "ready-for-selection");
});

test("engineering evidence must match the exact analysis artifact bytes", async () => {
  const first = await candidate("binding_a", 7);
  const second = await candidate("binding_b", 8);
  const newlineBytes = new TextEncoder().encode(
    `${JSON.stringify(first.engineeringEvidence)}\n`,
  );
  const newlineEngineering = verifiedArtifact({
    id: "artifact_engineering_narration_review_binding_newline",
    kind: "audio-analysis",
    takeId: first.audioCandidate.takeId!,
    bytes: newlineBytes,
    mimeType: "application/json",
    format: "json",
    sourceContentHash: first.audioCandidate.integrity.contentHash,
    generationRequestHash: first.audioCandidate.provenance.generationRequestHash!,
    parentArtifactIds: [first.audioCandidate.id],
    reviewRequired: false,
    creatorId: first.engineeringArtifact.provenance.createdByActorId,
    verifierId: first.engineeringArtifact.verification.checkedByActorId!,
  });
  assert.doesNotThrow(() => createNarrationTakeReviewSession({
    id: "narration_take_review_binding_newline_001",
    performanceContextFingerprint,
    policy: policy(),
    candidates: [
      { ...first, engineeringArtifact: newlineEngineering },
      second,
    ],
    createdAt: t0,
  }));

  const unrelatedEvidence = await engineeringEvidence(audioBytes(7), 1.25);
  assert.throws(
    () => createNarrationTakeReviewSession({
      id: "narration_take_review_binding_mismatch_001",
      performanceContextFingerprint,
      policy: policy(),
      candidates: [
        { ...first, engineeringEvidence: unrelatedEvidence },
        second,
      ],
      createdAt: t0,
    }),
    /NARRATION_TAKE_REVIEW_ENGINEERING_EVIDENCE_ARTIFACT_MISMATCH/u,
  );
});

test("candidate order is canonical and approval revalidates current rights", async () => {
  const expiresAt = at(20).toISOString();
  const value = createNarrationTakeReviewSession({
    id: "narration_take_review_rights_001",
    performanceContextFingerprint,
    policy: policy(),
    candidates: [
      await candidate("rights_b", 4, 1, expiresAt),
      await candidate("rights_a", 3, 1, expiresAt),
    ],
    createdAt: t0,
  });
  assert.deepEqual(
    value.candidates.map((candidateValue) => candidateValue.audioCandidate.takeId),
    ["take_narration_review_rights_a", "take_narration_review_rights_b"],
  );
  let reviewed = reviewAll(value, 5, 4);
  reviewed = selectNarrationTake(reviewed, {
    candidateTakeId: reviewed.candidates[0]!.audioCandidate.takeId!,
    selectedByActorId: "narration_director_001",
    selectedAt: at(19),
  });
  assert.throws(
    () => approveNarrationTakeSelection(reviewed, {
      finalConfirmationId: "narration_confirmation_rights_001",
      approvedByActorId: "narration_director_001",
      humanConfirmation: true,
      approvedAt: at(21),
    }),
    /NARRATION_TAKE_REVIEW_RIGHTS_EXPIRED/u,
  );
});

test("public projection omits take, artifact, actor, manuscript and rights evidence", async () => {
  let value = reviewAll(await session(), 4, 5);
  const [, second] = value.candidates;
  value = selectNarrationTake(value, {
    candidateTakeId: second!.audioCandidate.takeId!,
    selectedByActorId: "narration_director_001",
    selectedAt: at(20),
  });
  const view = narrationTakeReviewPublicView(value);
  const serialised = JSON.stringify(view);
  assert.equal(view.candidateCount, 2);
  assert.equal(view.completePanel, true);
  assert.equal(view.selectedComparativeScore, 5);
  for (const forbidden of [
    second!.audioCandidate.takeId!,
    second!.audioCandidate.id,
    "editorial_reviewer_001",
    manuscriptSourceHash,
    rightsFingerprint,
    performanceContextFingerprint,
  ]) assert.equal(serialised.includes(forbidden), false);
});

test("revisioned review sessions persist with optimistic concurrency and audit evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-narration-take-review-"));
  try {
    const store = new FileNarrationTakeReviewStore(new FileProjectStore(root));
    const original = await session();
    const created = await store.create(original, "narration_director_001");
    assert.equal(created.payload.fingerprint, original.fingerprint);

    const first = original.candidates[0]!;
    const revised = review(original, {
      takeId: first.audioCandidate.takeId!,
      perspective: "editorial",
      reviewerId: "editorial_reviewer_001",
      score: 5,
      seconds: 10,
    });
    const saved = await store.save(revised, {
      expectedRevision: 1,
      actorId: "editorial_reviewer_001",
      action: "narration_take_review.review_recorded",
    });
    assert.equal(saved.payload.revision, 2);
    assert.equal((await store.require(original.id)).payload.fingerprint, revised.fingerprint);
    await assert.rejects(
      () => store.save(revised, {
        expectedRevision: 1,
        actorId: "editorial_reviewer_001",
        action: "narration_take_review.review_recorded",
      }),
      /NARRATION_TAKE_REVIEW_REVISION_CONFLICT|STORE_REVISION_CONFLICT/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tampering with candidates, scores, selection or approval fingerprints fails closed", async () => {
  let value = reviewAll(await session(), 4, 5);
  const [, second] = value.candidates;
  value = selectNarrationTake(value, {
    candidateTakeId: second!.audioCandidate.takeId!,
    selectedByActorId: "narration_director_001",
    selectedAt: at(20),
  });
  const approved = approveNarrationTakeSelection(value, {
    finalConfirmationId: "narration_confirmation_001",
    approvedByActorId: "narration_director_001",
    humanConfirmation: true,
    approvedAt: at(21),
  });
  assert.throws(
    () => assertNarrationTakeReviewSession({
      ...approved.session,
      approval: {
        ...approved.session.approval!,
        approvedArtifactFingerprint: "f".repeat(64),
      },
    }),
    /NARRATION_TAKE_REVIEW_APPROVAL_FINGERPRINT_INVALID|NARRATION_TAKE_REVIEW_SESSION_FINGERPRINT_INVALID/u,
  );
  assert.throws(
    () => assertApprovedNarrationTakeSelection(
      approved.session,
      { ...approved.audioCandidate, fingerprint: "e".repeat(64) },
    ),
    /ARTIFACT_FINGERPRINT_MISMATCH|NARRATION_TAKE_REVIEW_APPROVED_ARTIFACT_MISMATCH/u,
  );
});
