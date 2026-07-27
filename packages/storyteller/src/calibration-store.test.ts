import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  addCalibrationCandidate,
  approveCalibrationSession,
  createCalibrationPolicy,
  createCalibrationSession,
  proposeCalibrationPassages,
  recordCalibrationReview,
  selectCalibrationCandidate,
  type CalibrationCandidate,
  type CalibrationPassage,
  type CalibrationReview,
  type CalibrationSession,
} from "./calibration-workflow.js";
import {
  CalibrationStoreConflictError,
  FileCalibrationSessionStore,
  storedCalibrationSessionPublicView,
} from "./calibration-store.js";
import {
  FileProjectStore,
  StoreIntegrityError,
} from "./project-store.js";
import type {
  ManuscriptSegment,
  PerformanceDirection,
  PerformancePlan,
  SegmentedManuscript,
} from "./index.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const sourceHash = "a".repeat(64);
const capabilityFingerprint = "b".repeat(64);

function fixture(
  id = "calibration_store_session_001",
  projectId = "project_calibration_store_001",
  seriesId: string | undefined = "series_calibration_store_001",
): CalibrationSession {
  const text = "The quiet room held its breath while Mara counted each bell and refused to hurry the final word.";
  const segment: ManuscriptSegment = {
    id: `segment_${id}`,
    sourceHash,
    chapterId: `chapter_${id}`,
    chapterOrdinal: 1,
    chapterTitle: "Chapter One",
    ordinal: 1,
    kind: "narration",
    sourceStart: 0,
    sourceEnd: text.length,
    text,
    wordCount: 18,
    estimatedSpeechSeconds: 7.2,
  };
  const direction: PerformanceDirection = {
    segmentId: segment.id,
    narrativeDistance: "close",
    pace: 0.84,
    intensity: 0.24,
    warmth: 0.54,
    restraint: 0.92,
    clarity: 0.96,
    pauseBeforeMs: 120,
    pauseAfterMs: 320,
    emotionalObjective: "Keep the listener close without displaying the technique.",
    subtext: "The silence matters as much as the information.",
    notes: ["Protect the final word."],
  };
  const manuscript: SegmentedManuscript = {
    sourceHash,
    characterCount: text.length,
    wordCount: segment.wordCount,
    chapters: [{
      id: segment.chapterId,
      ordinal: 1,
      title: segment.chapterTitle,
      sourceStart: 0,
    }],
    segments: [segment],
    findings: [],
  };
  const performance: PerformancePlan = {
    manuscriptHash: sourceHash,
    directions: [direction],
    calibrationSegmentIds: [segment.id],
  };
  const proposal = proposeCalibrationPassages(manuscript, performance);
  const passage = proposal.passages[0];
  if (!passage) throw new Error("calibration passage fixture required");
  const policy = createCalibrationPolicy({
    requiredCategories: [passage.category],
    minimumPassageCount: 1,
    minimumDistinctReviewers: 1,
    minimumMeanScore: 4,
    minimumDimensionScore: 3.5,
    minimumContinuityScore: 0.8,
    requireBlindReview: true,
    requireApprovedDecision: true,
  });
  return createCalibrationSession({
    id,
    projectId,
    ...(seriesId ? { seriesId } : {}),
    voiceProfileId: `voice_${id}`,
    voiceRevision: 3,
    policy,
    passages: [passage],
    now: t0,
  });
}

function candidateFor(
  passage: CalibrationPassage,
  session: CalibrationSession,
): Omit<CalibrationCandidate, "fingerprint"> {
  return {
    id: `candidate_${session.id}`,
    passageId: passage.id,
    takeArtifactId: `artifact_take_${session.id}`,
    transcriptAssessmentArtifactId: `artifact_transcript_${session.id}`,
    technicalAssessmentArtifactId: `artifact_technical_${session.id}`,
    voiceProfileId: session.voiceProfileId,
    voiceRevision: session.voiceRevision,
    providerId: "elevenlabs",
    modelId: "eleven_multilingual_v2",
    capabilityFingerprint,
    generationRequestHash: "c".repeat(64),
    continuityScore: 0.94,
    eligible: true,
    findingCodes: [],
    createdAt: new Date(t0.getTime() + 1_000).toISOString(),
  };
}

function reviewFor(candidateId: string): Omit<CalibrationReview, "fingerprint"> {
  return {
    id: `review_${candidateId}`,
    candidateId,
    reviewerId: "reviewer_calibration_store_001",
    blind: true,
    decision: "approve",
    scores: {
      listenerRelationship: 4.7,
      textualTruth: 4.8,
      clarity: 4.8,
      rhythm: 4.6,
      emotionalTruth: 4.5,
      restraint: 4.7,
      sustainedListenability: 4.8,
      differentiation: 4.4,
      pronunciation: 4.8,
    },
    notes: "The take remains convincing and unforced through the complete passage.",
    createdAt: new Date(t0.getTime() + 2_000).toISOString(),
  };
}

function revisions(initial = fixture()): readonly CalibrationSession[] {
  const passage = initial.passages[0];
  if (!passage) throw new Error("calibration passage fixture required");
  const collecting = addCalibrationCandidate(
    initial,
    candidateFor(passage, initial),
    new Date(t0.getTime() + 1_000),
  );
  const candidate = collecting.candidates[0];
  if (!candidate) throw new Error("calibration candidate fixture required");
  const reviewed = recordCalibrationReview(
    collecting,
    reviewFor(candidate.id),
    new Date(t0.getTime() + 2_000),
  );
  const selected = selectCalibrationCandidate(
    reviewed,
    {
      passageId: passage.id,
      candidateId: candidate.id,
      selectedBy: "director_calibration_store_001",
      selectedAt: new Date(t0.getTime() + 3_000).toISOString(),
    },
    new Date(t0.getTime() + 3_000),
  );
  const approved = approveCalibrationSession(selected, {
    approvedBy: "greg_parker",
    humanConfirmation: true,
    now: new Date(t0.getTime() + 4_000),
  });
  return [initial, collecting, reviewed, selected, approved];
}

async function withStore(
  run: (input: Readonly<{
    root: string;
    store: FileCalibrationSessionStore;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-calibration-store-"));
  try {
    await run({
      root,
      store: new FileCalibrationSessionStore(new FileProjectStore(root)),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("calibration store creates, reads and idempotently reuses the same initial session", async () => {
  await withStore(async ({ store }) => {
    const session = fixture();
    const created = await store.create(session, {
      actorId: "director_calibration_store_001",
      requestId: "request_calibration_store_001",
      now: t0,
    });
    assert.equal(created.revision, 1);
    assert.equal(created.payload.fingerprint, session.fingerprint);
    assert.equal(await store.create(session, {
      actorId: "director_calibration_store_001",
      now: t0,
    }), created);
    assert.deepEqual(await store.read(session.id), created);

    const conflicting = fixture(session.id, "project_calibration_store_conflict");
    await assert.rejects(
      store.create(conflicting, {
        actorId: "director_calibration_store_001",
        now: t0,
      }),
      CalibrationStoreConflictError,
    );
  });
});

test("every calibration domain revision persists through optimistic envelope revisions", async () => {
  await withStore(async ({ store }) => {
    const [initial, ...nextRevisions] = revisions();
    if (!initial) throw new Error("initial calibration session required");
    let envelope = await store.create(initial, {
      actorId: "director_calibration_store_001",
      now: t0,
    });
    for (const session of nextRevisions) {
      envelope = await store.save(session, envelope.revision, {
        actorId: session.status === "approved" ? "greg_parker" : "director_calibration_store_001",
        now: new Date(session.updatedAt),
      });
      assert.equal(envelope.revision, session.revision);
      assert.equal(envelope.payload.fingerprint, session.fingerprint);
    }
    assert.equal(envelope.payload.status, "approved");
    assert.equal(envelope.revision, 5);
    assert.deepEqual(await store.require(initial.id), envelope);
  });
});

test("stale saves and skipped domain revisions fail without overwriting current state", async () => {
  await withStore(async ({ store }) => {
    const [initial, collecting, reviewed] = revisions();
    if (!initial || !collecting || !reviewed) throw new Error("calibration revisions required");
    await store.create(initial, {
      actorId: "director_calibration_store_001",
      now: t0,
    });
    const saved = await store.save(collecting, 1, {
      actorId: "director_calibration_store_001",
      now: new Date(collecting.updatedAt),
    });
    await assert.rejects(
      store.save(reviewed, 1, {
        actorId: "director_calibration_store_001",
        now: new Date(reviewed.updatedAt),
      }),
      /CALIBRATION_STORE_REVISION_CONFLICT:2/u,
    );
    const approved = revisions().at(-1);
    if (!approved) throw new Error("approved calibration revision required");
    await assert.rejects(
      store.save(approved, saved.revision, {
        actorId: "greg_parker",
        now: new Date(approved.updatedAt),
      }),
      /CALIBRATION_STORE_DOMAIN_REVISION_CONFLICT/u,
    );
    assert.equal((await store.require(initial.id)).payload.status, "collecting");
  });
});

test("public projections and audit metadata omit review, artifact, provider and voice identities", async () => {
  await withStore(async ({ root, store }) => {
    const [initial, ...nextRevisions] = revisions();
    if (!initial) throw new Error("initial calibration session required");
    let envelope = await store.create(initial, {
      actorId: "director_calibration_store_001",
      now: t0,
    });
    for (const session of nextRevisions) {
      envelope = await store.save(session, envelope.revision, {
        actorId: session.status === "approved" ? "greg_parker" : "director_calibration_store_001",
        now: new Date(session.updatedAt),
      });
    }

    const publicView = storedCalibrationSessionPublicView(envelope);
    assert.equal(publicView.status, "approved");
    assert.equal(publicView.eligibleForApproval, true);
    const publicSource = JSON.stringify(publicView);
    for (const forbidden of [
      "reviewer_calibration_store_001",
      "director_calibration_store_001",
      "greg_parker",
      "artifact_take_",
      "artifact_transcript_",
      "artifact_technical_",
      "elevenlabs",
      "eleven_multilingual_v2",
      capabilityFingerprint,
      "voice_calibration_store_session_001",
      "The take remains convincing",
    ]) assert.equal(publicSource.includes(forbidden), false);

    const audit = await readFile(join(root, "audit", "2026-07-27.jsonl"), "utf8");
    for (const forbidden of [
      "reviewer_calibration_store_001",
      "artifact_take_",
      "artifact_transcript_",
      "artifact_technical_",
      "elevenlabs",
      "eleven_multilingual_v2",
      capabilityFingerprint,
      "voice_calibration_store_session_001",
      "The take remains convincing",
    ]) assert.equal(audit.includes(forbidden), false);
    assert.equal(audit.includes("calibration.session.approved"), true);
  });
});

test("listing filters by project, series and status while returning only redacted views", async () => {
  await withStore(async ({ store }) => {
    const first = fixture(
      "calibration_store_session_101",
      "project_calibration_store_101",
      "series_calibration_store_shared",
    );
    const second = fixture(
      "calibration_store_session_102",
      "project_calibration_store_102",
      "series_calibration_store_shared",
    );
    await store.create(first, {
      actorId: "director_calibration_store_001",
      now: t0,
    });
    await store.create(second, {
      actorId: "director_calibration_store_001",
      now: t0,
    });

    assert.equal((await store.list({ seriesId: "series_calibration_store_shared" })).length, 2);
    assert.equal((await store.list({ projectId: first.projectId })).length, 1);
    assert.equal((await store.list({ status: "approved" })).length, 0);
    const publicRows = await store.listPublic({ status: "draft" });
    assert.equal(publicRows.length, 2);
    assert.equal(JSON.stringify(publicRows).includes("voice_"), false);
  });
});

test("tampering with persisted calibration payloads is detected before domain use", async () => {
  await withStore(async ({ root, store }) => {
    const session = fixture();
    await store.create(session, {
      actorId: "director_calibration_store_001",
      now: t0,
    });
    const path = join(
      root,
      "entities",
      "calibration-session",
      `${session.id}.json`,
    );
    const envelope = JSON.parse(await readFile(path, "utf8")) as {
      payload: Record<string, unknown>;
    };
    envelope.payload.status = "approved";
    await writeFile(path, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
    await assert.rejects(
      store.read(session.id),
      StoreIntegrityError,
    );
  });
});
