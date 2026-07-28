import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
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
  BOOK_CREDIT_TAKE_SCHEMA_VERSION,
  createBookCreditTranscriptEvidence,
  type BookCreditTakeRecord,
} from "./book-credit-take.js";
import {
  FileBookCreditTakeReviewStore,
  approveBookCreditTakeSelection,
  assertBookCreditTakeReviewSession,
  bookCreditTakeReviewPublicView,
  createBookCreditTakeReviewSession,
  recordBookCreditTakeReview,
  selectBookCreditTake,
  type BookCreditTakeReviewScores,
} from "./book-credit-take-review.js";
import { ACX_AUDIOBOOK_PROFILE, stableHash } from "./index.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:00:01.000Z");
const t2 = new Date("2026-07-27T00:00:02.000Z");
const t3 = new Date("2026-07-27T00:00:03.000Z");
const t4 = new Date("2026-07-27T00:00:04.000Z");
const t5 = new Date("2026-07-27T00:00:05.000Z");
const scriptText = "The North Water, written by Ian McGuire, narrated by EVAVO Narrator.";
const scriptTextHash = stableHash(scriptText);
const audioBytes = 960_000;

function commandResult(stdout = "", stderr = ""): AudioEngineeringCommandResult {
  return Object.freeze({ exitCode: 0, stdout, stderr, durationMs: 5 });
}

class EngineeringRunner implements AudioEngineeringRunner {
  constructor(readonly byteCount: number) {}

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
            duration: "10.000000",
          }],
          format: {
            format_name: "wav",
            duration: "10.000000",
            bit_rate: "192000",
            size: String(this.byteCount),
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
          input_i: "-20.1",
          input_tp: "-4.2",
          input_lra: "4.1",
          input_thresh: "-30",
          target_offset: "0.1",
        }));
      case "silence":
        return commandResult("", [
          "[silencedetect] silence_start: 0",
          "[silencedetect] silence_end: 1.2 | silence_duration: 1.2",
          "[silencedetect] silence_start: 9",
          "[silencedetect] silence_end: 10 | silence_duration: 1",
        ].join("\n"));
    }
  }
}

async function evidence(contentHash: string) {
  return await analyseAudioEngineering({
    audioPath: "/private/book-credit-review.wav",
    inputContentHash: contentHash,
    inputByteCount: audioBytes,
    profile: ACX_AUDIOBOOK_PROFILE,
    profileVersion: "acx-2026-07",
    profileReviewedAt: "2026-07-26T00:00:00.000Z",
    profileSourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner: new EngineeringRunner(audioBytes),
    now: t1,
  });
}

function take(input: Readonly<{
  id: string;
  takeId: string;
  audioId: string;
  audioHash: string;
  engineeringFingerprint: string;
}>): BookCreditTakeRecord {
  const transcriptEvidence = createBookCreditTranscriptEvidence({
    sourceText: scriptText,
    observedText: scriptText,
    assessedAt: t1,
  });
  const partial: Omit<BookCreditTakeRecord, "fingerprint"> = {
    schemaVersion: BOOK_CREDIT_TAKE_SCHEMA_VERSION,
    id: input.id,
    projectId: "project_credit_review_001",
    bookId: "book_credit_review_001",
    creditKind: "opening",
    planId: "credit_review_plan_001",
    planFingerprint: "1".repeat(64),
    scriptId: "credit_review_script_001",
    scriptRevision: 4,
    scriptTextHash,
    jobId: "job_credit_review_001",
    segmentId: "credit_segment_opening_review_001",
    takeId: input.takeId,
    voiceRevision: 6,
    calibrationLockFingerprint: "2".repeat(64),
    audio: Object.freeze({
      id: input.audioId,
      revision: 2,
      fingerprint: "3".repeat(64),
      contentHash: input.audioHash,
      byteCount: audioBytes,
    }),
    transcript: Object.freeze({
      id: `artifact_transcript_${input.takeId}`,
      revision: 2,
      fingerprint: "4".repeat(64),
      contentHash: "5".repeat(64),
      byteCount: 1_024,
    }),
    engineering: Object.freeze({
      id: `artifact_engineering_${input.takeId}`,
      revision: 2,
      fingerprint: "6".repeat(64),
      contentHash: "7".repeat(64),
      byteCount: 2_048,
    }),
    transcriptEvidence,
    engineeringEvidenceFingerprint: input.engineeringFingerprint,
    engineeringProfileId: "acx-audiobook",
    engineeringProfileVersion: "acx-2026-07",
    eligibleForReview: true,
    findings: Object.freeze([]),
    status: "eligible-for-review",
    createdAt: t2.toISOString(),
  };
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

const excellentScores: BookCreditTakeReviewScores = Object.freeze({
  wordingFidelity: 5,
  pronunciation: 5,
  diction: 5,
  pacing: 4,
  tone: 5,
  boundaryCleanliness: 5,
  technicalComfort: 5,
  narratorConsistency: 5,
});

async function sessionFixture() {
  const firstEvidence = await evidence("a".repeat(64));
  const secondEvidence = await evidence("b".repeat(64));
  const first = take({
    id: "credit_review_take_record_001",
    takeId: "take_credit_review_001",
    audioId: "artifact_credit_review_audio_001",
    audioHash: "a".repeat(64),
    engineeringFingerprint: firstEvidence.fingerprint,
  });
  const second = take({
    id: "credit_review_take_record_002",
    takeId: "take_credit_review_002",
    audioId: "artifact_credit_review_audio_002",
    audioHash: "b".repeat(64),
    engineeringFingerprint: secondEvidence.fingerprint,
  });
  const session = createBookCreditTakeReviewSession({
    id: "credit_take_review_session_001",
    candidates: [
      { take: first, engineeringEvidence: firstEvidence },
      { take: second, engineeringEvidence: secondEvidence },
    ],
    createdAt: t2,
  });
  return { first, second, firstEvidence, secondEvidence, session };
}

function approveCandidate(
  initial: Awaited<ReturnType<typeof sessionFixture>>["session"],
  candidateTakeId: string,
) {
  let session = recordBookCreditTakeReview(initial, {
    id: "credit_take_review_editorial_001",
    candidateTakeId,
    role: "editorial",
    reviewerId: "credit_take_editor_001",
    listenedDurationMs: 10_000,
    playbackContexts: ["consumer-headphones", "speakers"],
    decision: "approve",
    scores: excellentScores,
    decidedAt: t3,
  });
  session = recordBookCreditTakeReview(session, {
    id: "credit_take_review_engineering_001",
    candidateTakeId,
    role: "engineering",
    reviewerId: "credit_take_engineer_001",
    listenedDurationMs: 10_000,
    playbackContexts: ["studio-headphones"],
    decision: "approve",
    scores: excellentScores,
    decidedAt: t4,
  });
  return session;
}

test("independent complete-take reviews select and explicitly approve one opening credit", async () => {
  const fixture = await sessionFixture();
  let session = approveCandidate(fixture.session, fixture.first.id);
  assert.equal(session.status, "open");
  session = selectBookCreditTake(session, {
    candidateTakeId: fixture.first.id,
    selectedByActorId: "credit_take_director_001",
    selectedAt: t5,
  });
  assert.equal(session.status, "ready-for-approval");
  session = approveBookCreditTakeSelection(session, {
    finalConfirmationId: "credit_take_selection_confirmation_001",
    approvedByActorId: "credit_take_owner_001",
    humanConfirmation: true,
    approvedAt: new Date(t5.getTime() + 1_000),
  });
  assert.equal(session.status, "approved");
  assert.equal(session.selection?.candidateTakeId, fixture.first.id);
  assert.doesNotThrow(() => assertBookCreditTakeReviewSession(session));

  const view = bookCreditTakeReviewPublicView(session);
  const serialised = JSON.stringify(view);
  assert.equal(view.selectedTakeId, fixture.first.id);
  assert.equal(view.latestSelectedDecisions.editorial, "approve");
  assert.equal(view.latestSelectedDecisions.engineering, "approve");
  assert.deepEqual(view.playbackContexts, [
    "consumer-headphones",
    "speakers",
    "studio-headphones",
  ]);
  for (const forbidden of [
    scriptText,
    fixture.first.audio.id,
    fixture.first.audio.contentHash,
    "credit_take_editor_001",
    "credit_take_engineer_001",
    "credit_take_owner_001",
    "acx-audio-submission-requirements-reviewed-2026-07",
  ]) assert.equal(serialised.includes(forbidden), false);
});

test("incomplete listening, reviewer reuse, low scores and changes requests block selection", async () => {
  const fixture = await sessionFixture();
  assert.throws(
    () => recordBookCreditTakeReview(fixture.session, {
      id: "credit_take_review_short_001",
      candidateTakeId: fixture.first.id,
      role: "editorial",
      reviewerId: "credit_take_editor_short_001",
      listenedDurationMs: 9_000,
      playbackContexts: ["consumer-headphones"],
      decision: "approve",
      scores: excellentScores,
      decidedAt: t3,
    }),
    /BOOK_CREDIT_TAKE_REVIEW_LISTEN_DURATION_INVALID/u,
  );

  let session = recordBookCreditTakeReview(fixture.session, {
    id: "credit_take_review_changes_001",
    candidateTakeId: fixture.first.id,
    role: "editorial",
    reviewerId: "credit_take_editor_001",
    listenedDurationMs: 10_000,
    playbackContexts: ["consumer-headphones"],
    decision: "changes-requested",
    scores: { ...excellentScores, pacing: 3 },
    notes: "The final production credit is rushed and needs a restrained reread.",
    decidedAt: t3,
  });
  session = recordBookCreditTakeReview(session, {
    id: "credit_take_review_engineering_low_001",
    candidateTakeId: fixture.first.id,
    role: "engineering",
    reviewerId: "credit_take_engineer_001",
    listenedDurationMs: 10_000,
    playbackContexts: ["studio-headphones"],
    decision: "approve",
    scores: { ...excellentScores, technicalComfort: 3 },
    decidedAt: t4,
  });
  assert.throws(
    () => selectBookCreditTake(session, {
      candidateTakeId: fixture.first.id,
      selectedByActorId: "credit_take_director_001",
      selectedAt: t5,
    }),
    /BOOK_CREDIT_TAKE_REVIEW_CANDIDATE_NOT_READY/u,
  );

  const oneRole = recordBookCreditTakeReview(fixture.session, {
    id: "credit_take_review_independence_editorial_001",
    candidateTakeId: fixture.second.id,
    role: "editorial",
    reviewerId: "credit_take_reused_reviewer_001",
    listenedDurationMs: 10_000,
    playbackContexts: ["speakers"],
    decision: "approve",
    scores: excellentScores,
    decidedAt: t3,
  });
  assert.throws(
    () => recordBookCreditTakeReview(oneRole, {
      id: "credit_take_review_independence_engineering_001",
      candidateTakeId: fixture.second.id,
      role: "engineering",
      reviewerId: "credit_take_reused_reviewer_001",
      listenedDurationMs: 10_000,
      playbackContexts: ["studio-headphones"],
      decision: "approve",
      scores: excellentScores,
      decidedAt: t4,
    }),
    /BOOK_CREDIT_TAKE_REVIEW_INDEPENDENCE_REQUIRED/u,
  );
});

test("durable review sessions preserve revision chains and audit redaction", async () => {
  const fixture = await sessionFixture();
  const root = await mkdtemp(join(tmpdir(), "storyteller-credit-take-review-store-"));
  try {
    const store = new FileBookCreditTakeReviewStore(new FileProjectStore(root));
    const created = await store.create(fixture.session, "credit_take_review_operator_001");
    const repeated = await store.create(fixture.session, "credit_take_review_operator_001");
    assert.equal(created.envelopeHash, repeated.envelopeHash);

    const reviewed = recordBookCreditTakeReview(fixture.session, {
      id: "credit_take_review_store_editorial_001",
      candidateTakeId: fixture.first.id,
      role: "editorial",
      reviewerId: "credit_take_store_editor_001",
      listenedDurationMs: 10_000,
      playbackContexts: ["consumer-headphones"],
      decision: "approve",
      scores: excellentScores,
      decidedAt: t3,
    });
    const saved = await store.save(reviewed, {
      expectedRevision: created.revision,
      actorId: "credit_take_review_operator_001",
      action: "book_credit_take_review.editorial_recorded",
    });
    assert.equal(saved.revision, 2);
    await assert.rejects(
      store.save(reviewed, {
        expectedRevision: created.revision,
        actorId: "credit_take_review_operator_001",
        action: "book_credit_take_review.stale_write",
      }),
      /BOOK_CREDIT_TAKE_REVIEW_REVISION_CONFLICT/u,
    );

    const audit = await readFile(join(root, "audit", "2026-07-27.jsonl"), "utf8");
    for (const forbidden of [
      scriptText,
      fixture.first.audio.id,
      fixture.first.audio.contentHash,
      "credit_take_store_editor_001",
      fixture.first.engineeringEvidenceFingerprint,
    ]) assert.equal(audit.includes(forbidden), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("candidate, selection, approval and session tampering fail closed", async () => {
  const fixture = await sessionFixture();
  const { fingerprint: _candidateFingerprint, ...candidateBase } = fixture.session.candidates[0]!;
  const candidateTamperedBase = {
    ...candidateBase,
    durationMs: candidateBase.durationMs + 1,
  };
  const candidateTampered = {
    ...candidateTamperedBase,
    fingerprint: stableHash(candidateTamperedBase),
  };
  const { fingerprint: _sessionFingerprint, ...sessionBase } = fixture.session;
  const candidateSessionBase = {
    ...sessionBase,
    candidates: [candidateTampered, fixture.session.candidates[1]!],
  };
  const candidateSession = {
    ...candidateSessionBase,
    fingerprint: stableHash(candidateSessionBase),
  } as typeof fixture.session;
  assert.throws(
    () => assertBookCreditTakeReviewSession(candidateSession),
    /BOOK_CREDIT_TAKE_REVIEW_DURATION_MISMATCH/u,
  );

  let approved = approveCandidate(fixture.session, fixture.first.id);
  approved = selectBookCreditTake(approved, {
    candidateTakeId: fixture.first.id,
    selectedByActorId: "credit_take_director_001",
    selectedAt: t5,
  });
  const { fingerprint: _selectionFingerprint, ...selectionBase } = approved.selection!;
  const selectionTamperedBase = {
    ...selectionBase,
    reviewSetFingerprint: "f".repeat(64),
  };
  const selectionTampered = {
    ...selectionTamperedBase,
    fingerprint: stableHash(selectionTamperedBase),
  };
  const { fingerprint: _approvedFingerprint, ...approvedBase } = approved;
  const selectionSessionBase = {
    ...approvedBase,
    selection: selectionTampered,
  };
  const selectionSession = {
    ...selectionSessionBase,
    fingerprint: stableHash(selectionSessionBase),
  } as typeof approved;
  assert.throws(
    () => assertBookCreditTakeReviewSession(selectionSession),
    /BOOK_CREDIT_TAKE_REVIEW_SELECTION_STALE/u,
  );

  const final = approveBookCreditTakeSelection(approved, {
    finalConfirmationId: "credit_take_selection_confirmation_001",
    approvedByActorId: "credit_take_owner_001",
    humanConfirmation: true,
    approvedAt: new Date(t5.getTime() + 1_000),
  });
  const { fingerprint: _finalFingerprint, ...finalBase } = final;
  const approvalTamperedBase = {
    ...final.approval!,
    selectionFingerprint: "e".repeat(64),
  };
  const { fingerprint: _approvalFingerprint, ...approvalWithoutFingerprint } = approvalTamperedBase;
  const approvalTampered = {
    ...approvalWithoutFingerprint,
    fingerprint: stableHash(approvalWithoutFingerprint),
  };
  const finalTamperedBase = {
    ...finalBase,
    approval: approvalTampered,
  };
  const finalTampered = {
    ...finalTamperedBase,
    fingerprint: stableHash(finalTamperedBase),
  } as typeof final;
  assert.throws(
    () => assertBookCreditTakeReviewSession(finalTampered),
    /BOOK_CREDIT_TAKE_REVIEW_APPROVAL_SELECTION_MISMATCH/u,
  );
});
