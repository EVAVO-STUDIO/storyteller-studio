import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createCalibrationPolicy,
  createCalibrationSession,
  proposeCalibrationPassages,
} from "@evavo/storyteller-engine/calibration-workflow";
import { FileCalibrationSessionStore } from "@evavo/storyteller-engine/calibration-store";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";
import type {
  ManuscriptSegment,
  PerformanceDirection,
  PerformancePlan,
  SegmentedManuscript,
} from "@evavo/storyteller-engine";
import { createStorytellerApiHandler } from "./server.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const sourceHash = "a".repeat(64);

function calibrationSession() {
  const text = "The room stayed quiet while Mara counted each bell and refused to hurry the final word.";
  const segment: ManuscriptSegment = {
    id: "segment_calibration_server_001",
    sourceHash,
    chapterId: "chapter_calibration_server_001",
    chapterOrdinal: 1,
    chapterTitle: "Chapter One",
    ordinal: 1,
    kind: "narration",
    sourceStart: 0,
    sourceEnd: text.length,
    text,
    wordCount: 16,
    estimatedSpeechSeconds: 6.4,
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
  if (!passage) throw new Error("calibration server passage fixture required");
  return createCalibrationSession({
    id: "calibration_server_001",
    projectId: "project_calibration_server_001",
    seriesId: "series_calibration_server_001",
    voiceProfileId: "voice_calibration_server_private_001",
    voiceRevision: 3,
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

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolvePromise();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test server address unavailable");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    server.close((error) => error ? reject(error) : resolvePromise());
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function authHeaders(token = "test-api-token"): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-request-id": "request_calibration_server_001",
  };
}

test("health reports calibration file-store misconfiguration without exposing its path", async () => {
  const handler = createStorytellerApiHandler({
    environment: {
      NODE_ENV: "production",
      STORYTELLER_CALIBRATION_DRIVER: "file",
      STORYTELLER_DATA_DIR: "./private-calibration-storage",
    },
  });
  const server = createServer(handler);
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/health`);
    const body = await json(response);
    assert.equal(response.status, 503);
    assert.equal(body.status, "degraded");
    const calibrationStore = body.calibrationStore as Record<string, unknown>;
    assert.equal(calibrationStore.status, "misconfigured");
    assert.equal(
      calibrationStore.code,
      "CALIBRATION_STORE_FILE_DRIVER_SINGLE_HOST_ACK_REQUIRED",
    );
    const serialised = JSON.stringify(body);
    assert.equal(serialised.includes("private-calibration-storage"), false);
    assert.equal(serialised.includes("rootDirectory"), false);
  } finally {
    await close(server);
  }
});

test("calibration reads fail closed when the store is disabled", async () => {
  const handler = createStorytellerApiHandler({
    environment: {
      NODE_ENV: "test",
      STORYTELLER_API_TOKEN: "test-api-token",
      STORYTELLER_API_ACTOR_ID: "operator_calibration_server_001",
      STORYTELLER_CALIBRATION_DRIVER: "disabled",
    },
  });
  const server = createServer(handler);
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/v1/calibrations`, {
      headers: authHeaders(),
    });
    const body = await json(response);
    assert.equal(response.status, 503);
    assert.equal(
      (body.error as Record<string, unknown>).code,
      "CALIBRATION_STORE_NOT_CONFIGURED",
    );
  } finally {
    await close(server);
  }
});

test("authenticated calibration list and item routes expose only redacted state", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-calibration-server-"));
  const session = calibrationSession();
  const store = new FileCalibrationSessionStore(
    new FileProjectStore(join(root, "calibration-sessions")),
  );
  await store.create(session, {
    actorId: "director_calibration_server_001",
    now: t0,
  });
  const handler = createStorytellerApiHandler({
    environment: {
      NODE_ENV: "test",
      STORYTELLER_API_TOKEN: "test-api-token",
      STORYTELLER_API_ACTOR_ID: "operator_calibration_server_001",
      STORYTELLER_CALIBRATION_DRIVER: "file",
      STORYTELLER_DATA_DIR: ".",
    },
    workingDirectory: root,
  });
  const server = createServer(handler);
  const baseUrl = await listen(server);
  try {
    const unauthorised = await fetch(`${baseUrl}/v1/calibrations`);
    assert.equal(unauthorised.status, 401);

    const listedResponse = await fetch(
      `${baseUrl}/v1/calibrations?projectId=${session.projectId}&status=draft&limit=10`,
      { headers: authHeaders() },
    );
    const listed = await json(listedResponse);
    assert.equal(listedResponse.status, 200);
    assert.equal((listed.data as unknown[]).length, 1);
    assert.equal(listed.mutationApiExposed, false);
    assert.equal(listed.privateEvidenceApiExposed, false);

    const itemResponse = await fetch(
      `${baseUrl}/v1/calibrations/${encodeURIComponent(session.id)}`,
      { headers: authHeaders() },
    );
    const item = await json(itemResponse);
    assert.equal(itemResponse.status, 200);
    assert.equal((item.data as Record<string, unknown>).id, session.id);

    const serialised = JSON.stringify({ listed, item });
    for (const forbidden of [
      session.voiceProfileId,
      "director_calibration_server_001",
      "reviewer_",
      "artifact_take_",
      "elevenlabs",
      "capabilityFingerprint",
      textFromSession(session),
    ]) assert.equal(serialised.includes(forbidden), false);

    const mutationResponse = await fetch(
      `${baseUrl}/v1/calibrations/${encodeURIComponent(session.id)}`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ approvedBy: "untrusted_body_actor" }),
      },
    );
    const mutation = await json(mutationResponse);
    assert.equal(mutationResponse.status, 405);
    assert.equal(
      (mutation.error as Record<string, unknown>).code,
      "CALIBRATION_MUTATION_API_NOT_EXPOSED",
    );
    assert.equal(JSON.stringify(mutation).includes("untrusted_body_actor"), false);
    assert.equal((await store.require(session.id)).payload.status, "draft");
  } finally {
    await close(server);
    await rm(root, { recursive: true, force: true });
  }
});

test("capabilities declare redacted calibration reads without claiming mutation access", async () => {
  const handler = createStorytellerApiHandler({ environment: { NODE_ENV: "test" } });
  const server = createServer(handler);
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/v1/capabilities`);
    const body = await json(response);
    assert.equal(response.status, 200);
    assert.equal(Array.isArray(body.calibration), true);
    assert.equal(body.calibrationMutationApiExposed, false);
    assert.equal(body.calibrationPrivateEvidenceApiExposed, false);
    assert.equal(JSON.stringify(body).includes("redacted session reads"), true);
  } finally {
    await close(server);
  }
});

function textFromSession(session: ReturnType<typeof calibrationSession>): string {
  return session.passages[0]?.textHash ?? "missing-calibration-text-hash";
}
