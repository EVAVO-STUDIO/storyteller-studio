import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
} from "@evavo/storyteller-engine/calibration-workflow";
import { FileCalibrationSessionStore } from "@evavo/storyteller-engine/calibration-store";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";
import type {
  ManuscriptSegment,
  PerformanceDirection,
  PerformancePlan,
  SegmentedManuscript,
} from "@evavo/storyteller-engine";
import { handleCalibrationReadRoute } from "./calibration-routes.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const sourceHash = "a".repeat(64);
const capabilityFingerprint = "b".repeat(64);

function draftSession(
  id: string,
  projectId: string,
  seriesId: string,
): CalibrationSession {
  const text = "The room remained quiet while Mara counted each bell and protected the final word from unnecessary weight.";
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
    wordCount: 17,
    estimatedSpeechSeconds: 7,
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
    emotionalObjective: "Keep the listener near without displaying technique.",
    subtext: "Silence carries part of the meaning.",
    notes: ["Protect the last word."],
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
  if (!passage) throw new Error("calibration route passage fixture required");
  return createCalibrationSession({
    id,
    projectId,
    seriesId,
    voiceProfileId: `voice_${id}`,
    voiceRevision: 2,
    policy: createCalibrationPolicy({
      requiredCategories: [passage.category],
      minimumPassageCount: 1,
      minimumDistinctReviewers: 1,
      minimumMeanScore: 4,
      minimumDimensionScore: 3.5,
      minimumContinuityScore: 0.8,
      requireBlindReview: true,
      requireApprovedDecision: true,
    }),
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
    reviewerId: "reviewer_calibration_routes_001",
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
    notes: "The take remains natural and unforced throughout.",
    createdAt: new Date(t0.getTime() + 2_000).toISOString(),
  };
}

function approveSession(session: CalibrationSession): CalibrationSession {
  const passage = session.passages[0];
  if (!passage) throw new Error("calibration route passage fixture required");
  const collecting = addCalibrationCandidate(
    session,
    candidateFor(passage, session),
    new Date(t0.getTime() + 1_000),
  );
  const candidate = collecting.candidates[0];
  if (!candidate) throw new Error("calibration route candidate fixture required");
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
      selectedBy: "director_calibration_routes_001",
      selectedAt: new Date(t0.getTime() + 3_000).toISOString(),
    },
    new Date(t0.getTime() + 3_000),
  );
  return approveCalibrationSession(selected, {
    approvedBy: "greg_parker",
    humanConfirmation: true,
    now: new Date(t0.getTime() + 4_000),
  });
}

async function withStore(
  run: (store: FileCalibrationSessionStore) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-calibration-routes-"));
  try {
    await run(new FileCalibrationSessionStore(new FileProjectStore(root)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function seed(store: FileCalibrationSessionStore): Promise<{
  draft: CalibrationSession;
  approved: CalibrationSession;
  other: CalibrationSession;
}> {
  const draft = draftSession(
    "calibration_routes_001",
    "project_calibration_routes_001",
    "series_calibration_routes_shared",
  );
  const approvedDraft = draftSession(
    "calibration_routes_002",
    "project_calibration_routes_001",
    "series_calibration_routes_shared",
  );
  const approved = approveSession(approvedDraft);
  const other = draftSession(
    "calibration_routes_003",
    "project_calibration_routes_other",
    "series_calibration_routes_other",
  );

  await store.create(draft, {
    actorId: "director_calibration_routes_001",
    now: t0,
  });
  let envelope = await store.create(approvedDraft, {
    actorId: "director_calibration_routes_001",
    now: t0,
  });
  const revisions = [
    addCalibrationCandidate(
      approvedDraft,
      candidateFor(approvedDraft.passages[0]!, approvedDraft),
      new Date(t0.getTime() + 1_000),
    ),
  ];
  const collecting = revisions[0]!;
  const candidate = collecting.candidates[0]!;
  const reviewed = recordCalibrationReview(
    collecting,
    reviewFor(candidate.id),
    new Date(t0.getTime() + 2_000),
  );
  const selected = selectCalibrationCandidate(
    reviewed,
    {
      passageId: approvedDraft.passages[0]!.id,
      candidateId: candidate.id,
      selectedBy: "director_calibration_routes_001",
      selectedAt: new Date(t0.getTime() + 3_000).toISOString(),
    },
    new Date(t0.getTime() + 3_000),
  );
  for (const revision of [collecting, reviewed, selected, approved]) {
    envelope = await store.save(revision, envelope.revision, {
      actorId: revision.status === "approved"
        ? "greg_parker"
        : "director_calibration_routes_001",
      now: new Date(revision.updatedAt),
    });
  }
  await store.create(other, {
    actorId: "director_calibration_routes_001",
    now: t0,
  });
  return { draft, approved, other };
}

test("calibration list route applies bounded filters and returns only redacted state", async () => {
  await withStore(async (store) => {
    const { draft, approved } = await seed(store);
    const result = await handleCalibrationReadRoute({
      method: "GET",
      url: new URL(
        "http://storyteller.local/v1/calibrations"
        + "?projectId=project_calibration_routes_001"
        + "&seriesId=series_calibration_routes_shared"
        + "&status=draft,approved"
        + "&limit=1",
      ),
      store,
      requestId: "request_calibration_routes_001",
    });
    assert.ok(result);
    assert.equal(result.status, 200);
    const data = result.body.data as Array<Record<string, unknown>>;
    const meta = result.body.meta as Record<string, unknown>;
    assert.equal(data.length, 1);
    assert.equal(meta.total, 2);
    assert.equal(meta.returned, 1);
    assert.equal(meta.truncated, true);
    assert.equal(result.body.mutationApiExposed, false);
    assert.equal(result.body.privateEvidenceApiExposed, false);

    const serialised = JSON.stringify(result.body);
    for (const forbidden of [
      draft.voiceProfileId,
      approved.voiceProfileId,
      "reviewer_calibration_routes_001",
      "director_calibration_routes_001",
      "greg_parker",
      "artifact_take_",
      "artifact_transcript_",
      "artifact_technical_",
      "elevenlabs",
      "eleven_multilingual_v2",
      capabilityFingerprint,
      "The take remains natural",
    ]) assert.equal(serialised.includes(forbidden), false);
  });
});

test("calibration item route returns one redacted session and a stable not-found response", async () => {
  await withStore(async (store) => {
    const { approved } = await seed(store);
    const found = await handleCalibrationReadRoute({
      method: "GET",
      url: new URL(
        `http://storyteller.local/v1/calibrations/${encodeURIComponent(approved.id)}`,
      ),
      store,
      requestId: "request_calibration_routes_002",
    });
    assert.ok(found);
    assert.equal(found.status, 200);
    assert.equal((found.body.data as Record<string, unknown>).id, approved.id);
    assert.equal((found.body.data as Record<string, unknown>).status, "approved");
    const serialised = JSON.stringify(found.body);
    assert.equal(serialised.includes(approved.voiceProfileId), false);
    assert.equal(serialised.includes("reviewer_calibration_routes_001"), false);
    assert.equal(serialised.includes("artifact_take_"), false);
    assert.equal(serialised.includes("elevenlabs"), false);

    const missing = await handleCalibrationReadRoute({
      method: "GET",
      url: new URL(
        "http://storyteller.local/v1/calibrations/calibration_routes_missing",
      ),
      store,
      requestId: "request_calibration_routes_003",
    });
    assert.ok(missing);
    assert.equal(missing.status, 404);
    assert.equal(
      (missing.body.error as Record<string, unknown>).code,
      "CALIBRATION_SESSION_NOT_FOUND",
    );
  });
});

test("calibration routes expose no review, selection, approval or rejection mutation", async () => {
  await withStore(async (store) => {
    const { draft } = await seed(store);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const result = await handleCalibrationReadRoute({
        method,
        url: new URL(
          `http://storyteller.local/v1/calibrations/${draft.id}`,
        ),
        store,
        requestId: `request_calibration_routes_${method.toLocaleLowerCase("en-AU")}`,
      });
      assert.ok(result);
      assert.equal(result.status, 405);
      assert.equal(
        (result.body.error as Record<string, unknown>).code,
        "CALIBRATION_MUTATION_API_NOT_EXPOSED",
      );
      assert.equal(result.body.mutationApiExposed, false);
      assert.equal(result.body.privateEvidenceApiExposed, false);
    }
    assert.equal((await store.list()).length, 3);
  });
});

test("calibration route filters reject invalid identifiers, states and limits", async () => {
  await withStore(async (store) => {
    await assert.rejects(
      handleCalibrationReadRoute({
        method: "GET",
        url: new URL(
          "http://storyteller.local/v1/calibrations?projectId=../escape",
        ),
        store,
        requestId: "request_calibration_routes_invalid_001",
      }),
      /CALIBRATION_PROJECT_FILTER_INVALID/u,
    );
    await assert.rejects(
      handleCalibrationReadRoute({
        method: "GET",
        url: new URL(
          "http://storyteller.local/v1/calibrations?seriesId=../escape",
        ),
        store,
        requestId: "request_calibration_routes_invalid_002",
      }),
      /CALIBRATION_SERIES_FILTER_INVALID/u,
    );
    await assert.rejects(
      handleCalibrationReadRoute({
        method: "GET",
        url: new URL(
          "http://storyteller.local/v1/calibrations?status=published",
        ),
        store,
        requestId: "request_calibration_routes_invalid_003",
      }),
      /CALIBRATION_STATUS_FILTER_INVALID/u,
    );
    await assert.rejects(
      handleCalibrationReadRoute({
        method: "GET",
        url: new URL(
          "http://storyteller.local/v1/calibrations?limit=201",
        ),
        store,
        requestId: "request_calibration_routes_invalid_004",
      }),
      /CALIBRATION_LIMIT_INVALID/u,
    );
  });
});

test("calibration route helper ignores unrelated API paths", async () => {
  await withStore(async (store) => {
    const result = await handleCalibrationReadRoute({
      method: "GET",
      url: new URL("http://storyteller.local/v1/artifacts"),
      store,
      requestId: "request_calibration_routes_unrelated",
    });
    assert.equal(result, null);
  });
});
