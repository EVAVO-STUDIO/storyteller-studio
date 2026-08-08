import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPerformancePlan,
  segmentManuscript,
  type GenerationJob,
  type ManuscriptSegment,
  type PerformanceDirection,
} from "./index.js";
import {
  assertNaturalNarrationProductionPlan,
  assertNaturalNarrationWorkerInput,
  createNarrationContextWindow,
  createNaturalNarrationProductionPlan,
  naturalNarrationRequestMetadata,
  NATURAL_NARRATION_MINIMUM_CANDIDATES,
} from "./narration-production-policy.js";
import {
  createGenerationMaterialRecord,
  generationMaterialPublicView,
} from "./generation-material.js";
import { buildSynthesisRequest } from "./provider-adapter.js";

const source = `Chapter One

The first lamp went out before Mara reached the landing. She stopped with one hand on the rail and listened to the house settle around her.

The second lamp dimmed rather than failed. In that softer dark, the locked door at the end of the corridor seemed to breathe.

Someone moved behind the door, slowly enough to pretend it had been the timber. Mara did not call out.`;

const manuscript = segmentManuscript(source, {
  projectId: "project_natural_narration_001",
  maximumCharacters: 1_200,
});
const performance = buildPerformancePlan(manuscript);
const targetCandidate = manuscript.segments.find((segment) =>
  segment.text.includes("second lamp")
);
if (!targetCandidate) throw new Error("TEST_TARGET_SEGMENT_REQUIRED");
const target: ManuscriptSegment = targetCandidate;
const directionCandidate = performance.directions.find((item) => item.segmentId === target.id);
if (!directionCandidate) throw new Error("TEST_DIRECTION_REQUIRED");
const direction: PerformanceDirection = {
  ...directionCandidate,
  emotionalObjective:
    "Let the fading light make the listener notice the locked door before Mara admits her fear.",
  subtext:
    "Mara recognises a presence behind the door but is still bargaining with herself about it.",
  notes: [
    ...directionCandidate.notes,
    "Keep the first sentence observational; let dread arrive only on the final verb.",
  ],
};

function job(candidateCount = 3): GenerationJob {
  return {
    id: "job_natural_narration_001",
    projectId: "project_natural_narration_001",
    segmentId: target.id,
    providerFallbackIds: ["evavo-audio-studio"],
    cacheKey: "a".repeat(64),
    candidateCount,
    status: "ready",
  };
}

function plan(customDirection: PerformanceDirection = direction) {
  return createNaturalNarrationProductionPlan({
    manuscript,
    segmentId: target.id,
    direction: customDirection,
    language: "en-AU",
  });
}

function material(candidatePlan = plan()) {
  return {
    text: target.text,
    immutableSourceHash: manuscript.sourceHash,
    direction,
    mode: "production" as const,
    naturalNarration: candidatePlan,
  };
}

test("narration context windows carry real adjacent prose without the current segment", () => {
  const context = createNarrationContextWindow(manuscript, target.id);
  assert.equal(context.boundary, "middle");
  assert.match(context.previousContext, /first lamp/u);
  assert.match(context.nextContext, /Someone moved behind the door/u);
  assert.equal(context.previousContext.includes(target.text), false);
  assert.equal(context.nextContext.includes(target.text), false);
  assert.equal(context.availableCharacters > 120, true);
  assert.match(context.fingerprint, /^[a-f0-9]{64}$/u);
});

test("natural narration plans bind text, direction, language and context", () => {
  const value = plan();
  assert.equal(value.segmentId, target.id);
  assert.equal(value.sourceHash, manuscript.sourceHash);
  assert.equal(value.minimumCandidateCount, NATURAL_NARRATION_MINIMUM_CANDIDATES);
  assert.equal(value.requireBlindComparativeReview, true);
  assert.match(value.textHash, /^[a-f0-9]{64}$/u);
  assert.match(value.directionFingerprint, /^[a-f0-9]{64}$/u);
  assert.match(value.fingerprint, /^[a-f0-9]{64}$/u);
  assert.doesNotThrow(() => assertNaturalNarrationProductionPlan(value, {
    job: job(),
    material: material(value),
  }));
});

test("Audio Studio production requires a governed natural narration plan", () => {
  assert.throws(
    () => assertNaturalNarrationWorkerInput(job(), {
      text: target.text,
      immutableSourceHash: manuscript.sourceHash,
      direction,
      mode: "production",
    }),
    /NARRATION_PRODUCTION_PLAN_REQUIRED/u,
  );
});

test("Audio Studio production requires at least three candidate performances", () => {
  assert.throws(
    () => assertNaturalNarrationWorkerInput(job(2), material()),
    /NARRATION_PRODUCTION_CANDIDATE_COUNT_INSUFFICIENT/u,
  );
  assert.doesNotThrow(() => assertNaturalNarrationWorkerInput(job(3), material()));
});

test("preview work remains available without production comparison evidence", () => {
  assert.doesNotThrow(() => assertNaturalNarrationWorkerInput(job(1), {
    text: target.text,
    immutableSourceHash: manuscript.sourceHash,
    direction,
    mode: "preview",
  }));
});

test("automatic draft direction must be revised before production", () => {
  assert.throws(
    () => createNaturalNarrationProductionPlan({
      manuscript,
      segmentId: target.id,
      direction: directionCandidate,
      language: "en-AU",
    }),
    /NARRATION_PRODUCTION_OBJECTIVE_GENERIC|NARRATION_PRODUCTION_SUBTEXT_GENERIC/u,
  );
});

test("generic objectives cannot create a production narration plan", () => {
  assert.throws(
    () => plan({
      ...direction,
      emotionalObjective: "clear neutral narration",
    }),
    /NARRATION_PRODUCTION_OBJECTIVE_GENERIC/u,
  );
  assert.throws(
    () => plan({
      ...direction,
      subtext: "none",
    }),
    /NARRATION_PRODUCTION_SUBTEXT_GENERIC/u,
  );
});

test("tampered context cannot be rebound to production material", () => {
  const value = plan();
  const tampered = {
    ...value,
    context: {
      ...value.context,
      previousContext: "Different prose that was never adjacent to this segment.",
    },
  };
  assert.throws(
    () => assertNaturalNarrationProductionPlan(tampered, {
      job: job(),
      material: material(value),
    }),
    /NARRATION_CONTEXT_AVAILABLE_CHARACTERS_INVALID|NARRATION_CONTEXT_FINGERPRINT_INVALID/u,
  );
});

test("deterministic synthesis requests carry the same governed context across variants", () => {
  const value = plan();
  const requests = [0, 1, 2].map((candidateIndex) => buildSynthesisRequest({
    job: job(),
    text: target.text,
    immutableSourceHash: manuscript.sourceHash,
    voiceProfileId: "voice_narrator_001",
    voiceRevision: 1,
    direction,
    mode: "production",
    candidateIndex,
    naturalNarration: value,
  }));
  const expectedMetadata = naturalNarrationRequestMetadata(value);
  assert.equal(new Set(requests.map((request) => request.requestId)).size, 3);
  assert.equal(new Set(requests.map((request) => request.idempotencyKey)).size, 3);
  for (const request of requests) {
    assert.equal(request.metadata.previousContext, expectedMetadata.previousContext);
    assert.equal(request.metadata.nextContext, expectedMetadata.nextContext);
    assert.equal(
      request.metadata.naturalNarrationPlanFingerprint,
      value.fingerprint,
    );
  }
});


test("generation material persists plan fingerprints without exposing neighbouring prose", () => {
  const value = plan();
  const record = createGenerationMaterialRecord(job(), {
    text: target.text,
    immutableSourceHash: manuscript.sourceHash,
    voiceProfileId: "voice_narrator_001",
    voiceRevision: 1,
    direction,
    mode: "production",
    naturalNarration: value,
    rights: {
      rightsEvidenceId: "rights_natural_narration_001",
      rightsFingerprint: "b".repeat(64),
      allowedUses: ["audiobook"],
      commercialUseApproved: true,
      expiresAt: "2028-08-09T00:00:00.000Z",
    },
    intendedUse: "audiobook",
    commercial: true,
  }, new Date("2026-08-09T00:00:00.000Z"));
  const view = generationMaterialPublicView(record);
  assert.equal(view.naturalNarrationPlanFingerprint, value.fingerprint);
  assert.equal(view.narrationContextFingerprint, value.context.fingerprint);
  assert.equal(view.narrationContextBoundary, "middle");
  assert.equal(view.narrationLanguage, "en-AU");
  const serialised = JSON.stringify(view);
  assert.equal(serialised.includes(value.context.previousContext), false);
  assert.equal(serialised.includes(value.context.nextContext), false);
  assert.equal(serialised.includes(target.text), false);
});
