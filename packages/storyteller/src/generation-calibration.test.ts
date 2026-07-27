import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
import { FileCalibrationSessionStore } from "./calibration-store.js";
import { createProductionCalibrationLock } from "./calibration-admission.js";
import {
  CalibratedGenerationMaterialStore,
  FileGenerationCalibrationBindingStore,
  createCalibrationBoundProviderRegistry,
  generationCalibrationBindingPublicView,
} from "./generation-calibration.js";
import { FileGenerationQueue } from "./generation-queue.js";
import type { GenerationWorkerMaterial } from "./generation-worker.js";
import {
  stableHash,
  type GenerationJob,
  type ManuscriptSegment,
  type PerformanceDirection,
  type PerformancePlan,
  type SegmentedManuscript,
} from "./index.js";
import {
  buildSynthesisRequest,
  createCapabilitySnapshot,
  ProviderAdapterRegistry,
  type NarrationProviderAdapter,
  type ProviderCapabilitySnapshot,
  type ProviderExecutionContext,
  type SynthesisRequest,
  type SynthesisResult,
} from "./provider-adapter.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const sourceHash = "a".repeat(64);
const capabilityFingerprint = "b".repeat(64);

function calibrationRevisions(): readonly CalibrationSession[] {
  const text = "The room stayed quiet while Mara counted each bell and protected the final word.";
  const segment: ManuscriptSegment = {
    id: "segment_generation_calibration_001",
    sourceHash,
    chapterId: "chapter_generation_calibration_001",
    chapterOrdinal: 1,
    chapterTitle: "Chapter One",
    ordinal: 1,
    kind: "narration",
    sourceStart: 0,
    sourceEnd: text.length,
    text,
    wordCount: 14,
    estimatedSpeechSeconds: 5.6,
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
  if (!passage) throw new Error("generation calibration passage required");
  const initial = createCalibrationSession({
    id: "calibration_generation_001",
    projectId: "project_generation_calibration_001",
    seriesId: "series_generation_calibration_001",
    voiceProfileId: "voice_generation_calibration_001",
    voiceRevision: 4,
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
  const candidateInput: Omit<CalibrationCandidate, "fingerprint"> = {
    id: "candidate_generation_calibration_001",
    passageId: passage.id,
    takeArtifactId: "artifact_take_generation_calibration_001",
    transcriptAssessmentArtifactId: "artifact_transcript_generation_calibration_001",
    technicalAssessmentArtifactId: "artifact_technical_generation_calibration_001",
    voiceProfileId: initial.voiceProfileId,
    voiceRevision: initial.voiceRevision,
    providerId: "elevenlabs",
    modelId: "eleven_multilingual_v2",
    capabilityFingerprint,
    generationRequestHash: "c".repeat(64),
    continuityScore: 0.94,
    eligible: true,
    findingCodes: [],
    createdAt: new Date(t0.getTime() + 1_000).toISOString(),
  };
  const collecting = addCalibrationCandidate(
    initial,
    candidateInput,
    new Date(t0.getTime() + 1_000),
  );
  const candidate = collecting.candidates[0];
  if (!candidate) throw new Error("generation calibration candidate required");
  const reviewInput: Omit<CalibrationReview, "fingerprint"> = {
    id: "review_generation_calibration_001",
    candidateId: candidate.id,
    reviewerId: "reviewer_generation_calibration_001",
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
  const reviewed = recordCalibrationReview(
    collecting,
    reviewInput,
    new Date(t0.getTime() + 2_000),
  );
  const selected = selectCalibrationCandidate(
    reviewed,
    {
      passageId: passage.id,
      candidateId: candidate.id,
      selectedBy: "director_generation_calibration_001",
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

function job(overrides: Partial<GenerationJob> = {}): GenerationJob {
  return {
    id: "job_generation_calibration_001",
    projectId: "project_generation_calibration_001",
    segmentId: "segment_generation_calibration_001",
    providerFallbackIds: ["elevenlabs"],
    cacheKey: "d".repeat(64),
    candidateCount: 1,
    status: "ready",
    ...overrides,
  };
}

function material(overrides: Partial<GenerationWorkerMaterial> = {}): GenerationWorkerMaterial {
  return {
    text: "The room stayed quiet while Mara counted each bell and protected the final word.",
    immutableSourceHash: sourceHash,
    voiceProfileId: "voice_generation_calibration_001",
    voiceRevision: 4,
    direction: {
      segmentId: "segment_generation_calibration_001",
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
    },
    mode: "production",
    format: "wav",
    sampleRateHz: 44_100,
    rights: {
      rightsEvidenceId: "rights_generation_calibration_001",
      rightsFingerprint: "e".repeat(64),
      allowedUses: ["audiobook"],
      commercialUseApproved: true,
      expiresAt: "2028-07-27T00:00:00.000Z",
    },
    intendedUse: "audiobook",
    commercial: true,
    costPolicy: {
      currency: "AUD",
      maximumTotalEstimatedCost: 0.1,
    },
    ...overrides,
  };
}

async function persistCalibration(
  store: FileCalibrationSessionStore,
): Promise<CalibrationSession> {
  const [initial, ...rest] = calibrationRevisions();
  if (!initial) throw new Error("initial calibration revision required");
  let envelope = await store.create(initial, {
    actorId: "director_generation_calibration_001",
    now: t0,
  });
  for (const session of rest) {
    envelope = await store.save(session, envelope.revision, {
      actorId: session.status === "approved"
        ? "greg_parker"
        : "director_generation_calibration_001",
      now: new Date(session.updatedAt),
    });
  }
  return envelope.payload;
}

async function withState(
  run: (input: Readonly<{
    root: string;
    state: FileProjectStore;
    calibrations: FileCalibrationSessionStore;
    bindings: FileGenerationCalibrationBindingStore;
    approved: CalibrationSession;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-generation-calibration-"));
  try {
    const state = new FileProjectStore(join(root, "state"));
    const calibrations = new FileCalibrationSessionStore(
      new FileProjectStore(join(root, "calibrations")),
    );
    const approved = await persistCalibration(calibrations);
    await run({
      root,
      state,
      calibrations,
      bindings: new FileGenerationCalibrationBindingStore(state),
      approved,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

class FixtureAdapter implements NarrationProviderAdapter {
  readonly providerId = "elevenlabs";
  readonly adapterVersion = "1.0.0";
  readonly capability: ProviderCapabilitySnapshot;
  calls = 0;
  resultOverrides: Partial<SynthesisResult> = {};

  constructor() {
    this.capability = createCapabilitySnapshot({
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      capturedAt: t0.toISOString(),
      features: ["word-timestamps", "style-instructions"],
      maximumInputCharacters: 10_000,
      supportedFormats: ["wav"],
      supportedSampleRatesHz: [44_100],
      regions: ["global"],
      storesInputs: false,
      trainsOnCustomerData: false,
      customVoiceRequiresConsent: true,
      rawPolicyVersion: "fixture-policy-001",
    });
  }

  async inspectCapabilities(): Promise<ProviderCapabilitySnapshot> {
    return this.capability;
  }

  async synthesise(
    request: SynthesisRequest,
    _context: ProviderExecutionContext,
  ): Promise<SynthesisResult> {
    this.calls += 1;
    return {
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      requestId: request.requestId,
      idempotencyKey: request.idempotencyKey,
      audio: new Uint8Array([
        0x52, 0x49, 0x46, 0x46,
        0, 0, 0, 0,
        0x57, 0x41, 0x56, 0x45,
      ]),
      contentType: "audio/wav",
      transcript: request.text,
      usage: {
        inputCharacters: request.text.length,
        estimatedCost: 0.01,
        currency: "AUD",
      },
      capabilityFingerprint,
      generatedAt: new Date(t0.getTime() + 10_000).toISOString(),
      provenance: {
        modelId: "eleven_multilingual_v2",
        deterministicRequest: true,
      },
      ...this.resultOverrides,
    };
  }
}

function synthesisRequest(
  value: GenerationJob,
  input: GenerationWorkerMaterial,
  mode: "production" | "calibration" = "production",
): SynthesisRequest {
  return buildSynthesisRequest({
    job: value,
    text: input.text,
    immutableSourceHash: input.immutableSourceHash,
    voiceProfileId: input.voiceProfileId,
    voiceRevision: input.voiceRevision,
    direction: input.direction,
    pronunciations: input.pronunciations ?? [],
    mode,
    format: "wav",
    sampleRateHz: 44_100,
    candidateIndex: 0,
  });
}

test("per-job calibration binding is immutable, idempotent and publicly redacted", async () => {
  await withState(async ({ root, bindings, approved }) => {
    const lock = createProductionCalibrationLock(approved);
    const created = await bindings.create(job(), lock, {
      actorId: "director_generation_calibration_001",
      requestId: "request_generation_calibration_001",
      now: new Date(t0.getTime() + 5_000),
    });
    assert.deepEqual(await bindings.create(job(), lock, {
      actorId: "director_generation_calibration_001",
      now: new Date(t0.getTime() + 5_000),
    }), created);
    const view = generationCalibrationBindingPublicView(created.payload);
    assert.equal(view.locked, true);
    assert.equal(view.voiceRevision, 4);
    assert.equal(view.selectedTakeCount, 1);
    const serialised = JSON.stringify(view);
    for (const forbidden of [
      approved.id,
      approved.seriesId!,
      approved.voiceProfileId,
      "elevenlabs",
      "eleven_multilingual_v2",
      capabilityFingerprint,
      "artifact_take_generation_calibration_001",
      "reviewer_generation_calibration_001",
      "greg_parker",
    ]) assert.equal(serialised.includes(forbidden), false);

    const audit = await readFile(
      join(root, "state", "audit", "2026-07-27.jsonl"),
      "utf8",
    );
    for (const forbidden of [
      approved.id,
      approved.voiceProfileId,
      "elevenlabs",
      "eleven_multilingual_v2",
      capabilityFingerprint,
      "artifact_take_generation_calibration_001",
      "reviewer_generation_calibration_001",
    ]) assert.equal(audit.includes(forbidden), false);
    assert.equal(audit.includes("generation.calibration.bound"), true);
  });
});

test("calibrated material resolution blocks a production claim until its approved binding exists", async () => {
  await withState(async ({ state, calibrations, bindings, approved }) => {
    const value = job();
    const input = material();
    const materials = new CalibratedGenerationMaterialStore(
      state,
      bindings,
      calibrations,
      () => new Date(t0.getTime() + 10_000),
    );
    await materials.create(value, input, {
      actorId: "operator_generation_calibration_001",
      now: t0,
    });
    const queue = new FileGenerationQueue(state);
    await queue.enqueue(value, { now: t0 });
    const claim = await queue.claimNext({
      workerId: "worker_generation_calibration_001",
      now: new Date(t0.getTime() + 5_000),
    });
    if (!claim) throw new Error("generation calibration claim required");
    await assert.rejects(
      materials.resolve(claim),
      /GENERATION_CALIBRATION_BINDING_NOT_FOUND/u,
    );

    await bindings.create(value, createProductionCalibrationLock(approved), {
      actorId: "director_generation_calibration_001",
      now: new Date(t0.getTime() + 6_000),
    });
    assert.deepEqual(await materials.resolve(claim), {
      ...input,
      pronunciations: [],
      parentArtifactIds: [],
    });
  });
});

test("calibrated material resolution rejects stale voice, project and route scope before provider work", async () => {
  await withState(async ({ calibrations, bindings, approved }) => {
    const lock = createProductionCalibrationLock(approved);
    await bindings.create(job(), lock, {
      actorId: "director_generation_calibration_001",
      now: new Date(t0.getTime() + 5_000),
    });
    await assert.rejects(
      bindings.resolveForMaterial({
        job: job(),
        material: material({ voiceRevision: 5 }),
        calibrations,
        now: new Date(t0.getTime() + 10_000),
      }),
      /CALIBRATION_LOCK_VOICE_SCOPE_MISMATCH/u,
    );
    await assert.rejects(
      bindings.resolveForMaterial({
        job: job({ projectId: "project_generation_calibration_other" }),
        material: material(),
        calibrations,
        now: new Date(t0.getTime() + 10_000),
      }),
      /GENERATION_CALIBRATION_JOB_SCOPE_MISMATCH/u,
    );
    await assert.rejects(
      bindings.resolveForMaterial({
        job: job({ providerFallbackIds: ["elevenlabs", "provider_other"] }),
        material: material(),
        calibrations,
        now: new Date(t0.getTime() + 10_000),
      }),
      /GENERATION_CALIBRATION_JOB_SCOPE_MISMATCH/u,
    );
  });
});

test("provider wrapper blocks unbound production before invoking the adapter", async () => {
  await withState(async ({ bindings, calibrations }) => {
    const adapter = new FixtureAdapter();
    const registry = createCalibrationBoundProviderRegistry({
      providers: new ProviderAdapterRegistry([adapter]),
      bindings,
      calibrations,
      now: () => new Date(t0.getTime() + 10_000),
    });
    const wrapped = registry.get("elevenlabs");
    if (!wrapped) throw new Error("wrapped provider required");
    await assert.rejects(
      wrapped.synthesise(synthesisRequest(job(), material()), {
        credential: "fixture-secret",
        timeoutMs: 5_000,
      }),
      /GENERATION_CALIBRATION_BINDING_NOT_FOUND/u,
    );
    assert.equal(adapter.calls, 0);
  });
});

test("provider wrapper admits matching production and rejects model or capability drift before artifact storage", async () => {
  await withState(async ({ bindings, calibrations, approved }) => {
    await bindings.create(job(), createProductionCalibrationLock(approved), {
      actorId: "director_generation_calibration_001",
      now: new Date(t0.getTime() + 5_000),
    });
    const adapter = new FixtureAdapter();
    const registry = createCalibrationBoundProviderRegistry({
      providers: new ProviderAdapterRegistry([adapter]),
      bindings,
      calibrations,
      now: () => new Date(t0.getTime() + 10_000),
    });
    const wrapped = registry.get("elevenlabs");
    if (!wrapped) throw new Error("wrapped provider required");
    const request = synthesisRequest(job(), material());
    const result = await wrapped.synthesise(request, {
      credential: "fixture-secret",
      timeoutMs: 5_000,
    });
    assert.equal(result.providerId, "elevenlabs");
    assert.equal(adapter.calls, 1);

    adapter.resultOverrides = {
      capabilityFingerprint: "f".repeat(64),
    };
    await assert.rejects(
      wrapped.synthesise(request, {
        credential: "fixture-secret",
        timeoutMs: 5_000,
      }),
      /GENERATION_CALIBRATION_CAPABILITY_MISMATCH/u,
    );
    adapter.resultOverrides = {
      provenance: { modelId: "eleven_v3" },
    };
    await assert.rejects(
      wrapped.synthesise(request, {
        credential: "fixture-secret",
        timeoutMs: 5_000,
      }),
      /GENERATION_CALIBRATION_MODEL_MISMATCH/u,
    );
  });
});

test("calibration-mode provider requests remain available before production approval", async () => {
  await withState(async ({ bindings, calibrations }) => {
    const adapter = new FixtureAdapter();
    const registry = createCalibrationBoundProviderRegistry({
      providers: new ProviderAdapterRegistry([adapter]),
      bindings,
      calibrations,
    });
    const wrapped = registry.get("elevenlabs");
    if (!wrapped) throw new Error("wrapped provider required");
    const result = await wrapped.synthesise(
      synthesisRequest(job(), material(), "calibration"),
      {
        credential: "fixture-secret",
        timeoutMs: 5_000,
      },
    );
    assert.equal(result.providerId, "elevenlabs");
    assert.equal(adapter.calls, 1);
  });
});

test("binding fingerprints change when governed job identity changes", () => {
  const approved = calibrationRevisions().at(-1);
  if (!approved) throw new Error("approved calibration required");
  const lock = createProductionCalibrationLock(approved);
  const first = stableHash({ job: job(), lock });
  const second = stableHash({
    job: job({ id: "job_generation_calibration_002" }),
    lock,
  });
  assert.notEqual(first, second);
});
