import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import type {
  AudioEngineeringCommand,
  AudioEngineeringCommandResult,
  AudioEngineeringRunner,
} from "@evavo/storyteller-engine/audio-engineering";
import { FileArtifactRegistry } from "@evavo/storyteller-engine/artifact-store";
import {
  FileBudgetLedger,
  budgetMicros,
} from "@evavo/storyteller-engine/budget-ledger";
import {
  createProductionCalibrationLock,
} from "@evavo/storyteller-engine/calibration-admission";
import { FileCalibrationSessionStore } from "@evavo/storyteller-engine/calibration-store";
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
import {
  createElevenLabsPricingSnapshot,
} from "@evavo/storyteller-engine/elevenlabs-adapter";
import {
  FileGenerationCalibrationBindingStore,
} from "@evavo/storyteller-engine/generation-calibration";
import { FileGenerationMaterialStore } from "@evavo/storyteller-engine/generation-material";
import { FileGenerationQueue } from "@evavo/storyteller-engine/generation-queue";
import type { GenerationWorkerMaterial } from "@evavo/storyteller-engine/generation-worker";
import {
  createCapabilitySnapshot,
} from "@evavo/storyteller-engine/provider-adapter";
import type {
  GenerationJob,
  ManuscriptSegment,
  PerformanceDirection,
  PerformancePlan,
  SegmentedManuscript,
} from "@evavo/storyteller-engine";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";
import { resolveWorkerAudioEngineeringPolicy } from "./audio-engineering.js";
import {
  EnvironmentCredentialResolver,
  resolveWorkerRuntimeConfiguration,
  type WorkerEnvironment,
} from "./configuration.js";
import { createWorkerProviderRegistry } from "./providers.js";
import { runConfiguredWorkerRuntime } from "./runtime.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const calibrationStart = new Date(t0.getTime() - 10_000);
const text = "Aelwyn waited.";
const sourceHash = "b".repeat(64);

const job: GenerationJob = {
  id: "job_elevenlabs_generation_001",
  projectId: "project_elevenlabs_generation_001",
  segmentId: "segment_elevenlabs_generation_001",
  providerFallbackIds: ["elevenlabs"],
  cacheKey: "a".repeat(64),
  candidateCount: 1,
  status: "ready",
};

function material(): GenerationWorkerMaterial {
  return {
    text,
    immutableSourceHash: sourceHash,
    voiceProfileId: "voice_elevenlabs_generation_001",
    voiceRevision: 1,
    direction: {
      segmentId: job.segmentId,
      narrativeDistance: "close",
      pace: 0.86,
      intensity: 0.34,
      warmth: 0.52,
      restraint: 0.84,
      clarity: 0.96,
      pauseBeforeMs: 120,
      pauseAfterMs: 240,
      emotionalObjective: "Keep the listener close without explaining the wait.",
      subtext: "Aelwyn expects a sound that may not arrive.",
      notes: ["Preserve the full stop and allow the last word to settle."],
    },
    pronunciations: [],
    mode: "production",
    format: "wav",
    sampleRateHz: 44_100,
    rights: {
      rightsEvidenceId: "rights_elevenlabs_generation_001",
      rightsFingerprint: "c".repeat(64),
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
  };
}

function pricing(
  modelId: "eleven_v3" | "eleven_multilingual_v2",
  rate: number,
) {
  return createElevenLabsPricingSnapshot({
    modelId,
    currency: "AUD",
    microsPerThousandCharacters: rate,
    effectiveFrom: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-08-31T00:00:00.000Z",
    sourceReference: `elevenlabs-${modelId}-generation-2026-07`,
  });
}

function environment(dataDirectory: string): WorkerEnvironment {
  const v3Pricing = pricing("eleven_v3", 240_000);
  const productionPricing = pricing("eleven_multilingual_v2", 120_000);
  return {
    NODE_ENV: "test",
    STORYTELLER_WORKER_MODE: "once",
    STORYTELLER_WORKER_ID: "worker_elevenlabs_generation_001",
    STORYTELLER_WORKER_VERIFIER_ACTOR_ID: "verifier_elevenlabs_generation_001",
    STORYTELLER_QUEUE_DRIVER: "file",
    STORYTELLER_ARTIFACT_DRIVER: "file",
    STORYTELLER_DATA_DIR: dataDirectory,
    STORYTELLER_WORKER_CONCURRENCY: "1",
    STORYTELLER_WORKER_POLL_INTERVAL_MS: "100",
    STORYTELLER_WORKER_LEASE_DURATION_MS: "60000",
    STORYTELLER_WORKER_HEARTBEAT_INTERVAL_MS: "20000",
    STORYTELLER_WORKER_PROVIDER_TIMEOUT_MS: "5000",
    STORYTELLER_WORKER_CREDENTIAL_BINDINGS: JSON.stringify({
      elevenlabs: "ELEVENLABS_API_KEY",
    }),
    STORYTELLER_AUDIO_ENGINEERING_PROFILE: "acx-audiobook",
    STORYTELLER_AUDIO_ENGINEERING_PROFILE_VERSION: "acx-2026-07",
    STORYTELLER_AUDIO_ENGINEERING_PROFILE_REVIEWED_AT: "2026-07-01T00:00:00.000Z",
    STORYTELLER_AUDIO_ENGINEERING_PROFILE_SOURCE_REFERENCE:
      "acx-audio-submission-requirements-reviewed-2026-07",
    STORYTELLER_AUDIO_ENGINEERING_TIMEOUT_MS: "5000",
    STORYTELLER_AUDIO_ENGINEERING_MAX_OUTPUT_BYTES: String(1024 * 1024),
    ELEVENLABS_API_KEY: "fixture-elevenlabs-generation-secret",
    STORYTELLER_ELEVENLABS_ENABLED: "true",
    STORYTELLER_ELEVENLABS_ADAPTER_VERSION: "1.0.0",
    STORYTELLER_ELEVENLABS_MODEL_POLICIES: JSON.stringify([
      {
        mode: "preview",
        modelId: "eleven_v3",
        maximumInputCharacters: 3_000,
        pricing: v3Pricing,
      },
      {
        mode: "calibration",
        modelId: "eleven_v3",
        maximumInputCharacters: 3_000,
        pricing: v3Pricing,
      },
      {
        mode: "production",
        modelId: "eleven_multilingual_v2",
        maximumInputCharacters: 9_000,
        pricing: productionPricing,
      },
    ]),
    STORYTELLER_ELEVENLABS_VOICE_BINDINGS: JSON.stringify([{
      voiceProfileId: "voice_elevenlabs_generation_001",
      voiceRevision: 1,
      voiceId: "premadeVoice0001",
      sourceKind: "premade",
      licenceEvidenceId: "licence_elevenlabs_generation_001",
      commercialUseApproved: true,
      allowedModes: ["production"],
    }]),
    STORYTELLER_ELEVENLABS_PRONUNCIATION_DICTIONARIES: "[]",
    STORYTELLER_ELEVENLABS_DATA_POLICY: JSON.stringify({
      retentionMode: "zero-retention-enterprise",
      storesInputs: false,
      trainsOnCustomerData: false,
      policyVersion: "elevenlabs-enterprise-zero-retention-2026-07",
    }),
    STORYTELLER_ELEVENLABS_MAX_RESPONSE_BYTES: String(4 * 1024 * 1024),
    STORYTELLER_ELEVENLABS_PREFLIGHT_TIMEOUT_MS: "5000",
  };
}

function jsonResponse(
  value: unknown,
  headers: Record<string, string> = {},
): Response {
  const body = JSON.stringify(value);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body)),
      ...headers,
    },
  });
}

function wavBytes(): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    0x01, 0x02, 0x03, 0x04,
  ]);
}

function timestampResponse(): Response {
  const characters = [...text];
  return jsonResponse({
    audio_base64: Buffer.from(wavBytes()).toString("base64"),
    alignment: {
      characters,
      character_start_times_seconds: characters.map((_, index) => index * 0.05),
      character_end_times_seconds: characters.map((_, index) =>
        (index + 1) * 0.05
      ),
    },
  }, { "request-id": "private-elevenlabs-request-001" });
}

function engineeringCommandResult(
  stdout = "",
  stderr = "",
): AudioEngineeringCommandResult {
  return Object.freeze({
    exitCode: 0,
    stdout,
    stderr,
    durationMs: 4,
  });
}

class ElevenLabsEngineeringRunner implements AudioEngineeringRunner {
  readonly commands: AudioEngineeringCommand[] = [];

  async run(command: AudioEngineeringCommand): Promise<AudioEngineeringCommandResult> {
    this.commands.push(command);
    switch (command.stage) {
      case "ffprobe-version":
        return engineeringCommandResult("ffprobe version 7.1 fixture\n");
      case "ffmpeg-version":
        return engineeringCommandResult("ffmpeg version 7.1 fixture\n");
      case "probe":
        return engineeringCommandResult(JSON.stringify({
          streams: [{
            codec_type: "audio",
            codec_name: "pcm_s16le",
            sample_rate: "44100",
            channels: 1,
            bit_rate: "192000",
            duration: "0.750000",
          }],
          format: {
            format_name: "wav",
            duration: "0.750000",
            bit_rate: "192000",
            size: String(wavBytes().byteLength),
          },
        }));
      case "astats":
        return engineeringCommandResult([
          "lavfi.astats.Overall.RMS_level=-20.0000",
          "lavfi.astats.Overall.Peak_level=-4.0000",
          "lavfi.astats.Overall.Noise_floor=-65.0000",
          "lavfi.astats.Overall.Peak_count=0",
        ].join("\n"));
      case "loudnorm":
        return engineeringCommandResult("", JSON.stringify({
          input_i: "-20.10",
          input_tp: "-4.20",
          input_lra: "4.10",
          input_thresh: "-30.00",
          target_offset: "0.10",
        }));
      case "silence":
        return engineeringCommandResult();
    }
  }
}

function fetchFrom(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    return await handler(url, init);
  }) as typeof fetch;
}

function approvedCapabilityFingerprint(): string {
  return createCapabilitySnapshot({
    providerId: "elevenlabs",
    adapterVersion: "1.0.0",
    capturedAt: t0.toISOString(),
    features: [
      "pronunciation-dictionary",
      "word-timestamps",
      "deterministic-seed",
      "style-instructions",
    ],
    maximumInputCharacters: 3_000,
    supportedFormats: ["wav", "mp3"],
    supportedSampleRatesHz: [44_100],
    regions: ["global"],
    storesInputs: false,
    trainsOnCustomerData: false,
    customVoiceRequiresConsent: true,
    rawPolicyVersion: "elevenlabs-enterprise-zero-retention-2026-07",
  }).fingerprint;
}

function calibrationRevisions(): readonly CalibrationSession[] {
  const segment: ManuscriptSegment = {
    id: job.segmentId,
    sourceHash,
    chapterId: "chapter_elevenlabs_generation_001",
    chapterOrdinal: 1,
    chapterTitle: "Chapter One",
    ordinal: 1,
    kind: "narration",
    sourceStart: 0,
    sourceEnd: text.length,
    text,
    wordCount: 2,
    estimatedSpeechSeconds: 0.8,
  };
  const direction: PerformanceDirection = material().direction;
  const manuscript: SegmentedManuscript = {
    sourceHash,
    characterCount: text.length,
    wordCount: 2,
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
  if (!passage) throw new Error("ElevenLabs calibration passage required");
  const initial = createCalibrationSession({
    id: "calibration_elevenlabs_generation_001",
    projectId: job.projectId,
    seriesId: "series_elevenlabs_generation_001",
    voiceProfileId: material().voiceProfileId,
    voiceRevision: material().voiceRevision,
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
    now: calibrationStart,
  });
  const candidateInput: Omit<CalibrationCandidate, "fingerprint"> = {
    id: "candidate_elevenlabs_generation_001",
    passageId: passage.id,
    takeArtifactId: "artifact_calibration_take_elevenlabs_generation_001",
    transcriptAssessmentArtifactId: "artifact_calibration_transcript_elevenlabs_generation_001",
    technicalAssessmentArtifactId: "artifact_calibration_technical_elevenlabs_generation_001",
    voiceProfileId: initial.voiceProfileId,
    voiceRevision: initial.voiceRevision,
    providerId: "elevenlabs",
    modelId: "eleven_multilingual_v2",
    capabilityFingerprint: approvedCapabilityFingerprint(),
    generationRequestHash: "d".repeat(64),
    continuityScore: 0.95,
    eligible: true,
    findingCodes: [],
    createdAt: new Date(calibrationStart.getTime() + 1_000).toISOString(),
  };
  const collecting = addCalibrationCandidate(
    initial,
    candidateInput,
    new Date(calibrationStart.getTime() + 1_000),
  );
  const candidate = collecting.candidates[0];
  if (!candidate) throw new Error("ElevenLabs calibration candidate required");
  const reviewInput: Omit<CalibrationReview, "fingerprint"> = {
    id: "review_elevenlabs_generation_001",
    candidateId: candidate.id,
    reviewerId: "reviewer_elevenlabs_generation_001",
    blind: true,
    decision: "approve",
    scores: {
      listenerRelationship: 4.7,
      textualTruth: 4.9,
      clarity: 4.8,
      rhythm: 4.6,
      emotionalTruth: 4.5,
      restraint: 4.7,
      sustainedListenability: 4.8,
      differentiation: 4.4,
      pronunciation: 4.9,
    },
    notes: "The take remains controlled and exact through the complete passage.",
    createdAt: new Date(calibrationStart.getTime() + 2_000).toISOString(),
  };
  const reviewed = recordCalibrationReview(
    collecting,
    reviewInput,
    new Date(calibrationStart.getTime() + 2_000),
  );
  const selected = selectCalibrationCandidate(
    reviewed,
    {
      passageId: passage.id,
      candidateId: candidate.id,
      selectedBy: "director_elevenlabs_generation_001",
      selectedAt: new Date(calibrationStart.getTime() + 3_000).toISOString(),
    },
    new Date(calibrationStart.getTime() + 3_000),
  );
  const approved = approveCalibrationSession(selected, {
    approvedBy: "greg_parker",
    humanConfirmation: true,
    now: new Date(calibrationStart.getTime() + 4_000),
  });
  return [initial, collecting, reviewed, selected, approved];
}

async function persistCalibrationAndBinding(input: Readonly<{
  configuration: Extract<ReturnType<typeof resolveWorkerRuntimeConfiguration>, { enabled: true }>;
  queueState: FileProjectStore;
}>): Promise<CalibrationSession> {
  const calibrationStore = new FileCalibrationSessionStore(
    new FileProjectStore(resolve(
      dirname(input.configuration.queueRootDirectory),
      "calibration-sessions",
    )),
  );
  const [initial, ...rest] = calibrationRevisions();
  if (!initial) throw new Error("initial ElevenLabs calibration required");
  let envelope = await calibrationStore.create(initial, {
    actorId: "director_elevenlabs_generation_001",
    now: new Date(initial.updatedAt),
  });
  for (const session of rest) {
    envelope = await calibrationStore.save(session, envelope.revision, {
      actorId: session.status === "approved"
        ? "greg_parker"
        : "director_elevenlabs_generation_001",
      now: new Date(session.updatedAt),
    });
  }
  const approved = envelope.payload;
  await new FileGenerationCalibrationBindingStore(input.queueState).create(
    job,
    createProductionCalibrationLock(approved),
    {
      actorId: "director_elevenlabs_generation_001",
      now: t0,
    },
  );
  return approved;
}

test("queued ElevenLabs production requires approved calibration, reserves budget, verifies artifacts and completes with exact evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-elevenlabs-generation-"));
  try {
    const env = environment("./private-data");
    const configuration = resolveWorkerRuntimeConfiguration(env, root);
    if (!configuration.enabled) {
      throw new Error("enabled worker configuration required");
    }

    const queueState = new FileProjectStore(configuration.queueRootDirectory);
    const queue = new FileGenerationQueue(queueState);
    const materials = new FileGenerationMaterialStore(queueState);
    const ledger = new FileBudgetLedger(queueState);
    await ledger.createAccount({
      projectId: job.projectId,
      currency: "AUD",
      authorisedMicros: budgetMicros(1),
      actorId: "operator_elevenlabs_generation_001",
      now: t0,
    });
    await materials.create(job, material(), {
      actorId: "operator_elevenlabs_generation_001",
      now: t0,
    });
    const approvedCalibration = await persistCalibrationAndBinding({
      configuration,
      queueState,
    });
    await queue.enqueue(job, { now: t0, maxAttempts: 3 });

    const engineeringRunner = new ElevenLabsEngineeringRunner();
    const audioEngineering = resolveWorkerAudioEngineeringPolicy({
      workerEnabled: true,
      environment: env,
      temporaryRoot: resolve(
        dirname(configuration.objectRootDirectory),
        "audio-engineering-temp",
      ),
      runner: engineeringRunner,
      now: t0,
    });
    if (!audioEngineering) throw new Error("worker engineering policy required");

    const calls: string[] = [];
    const providers = createWorkerProviderRegistry({
      workerEnabled: true,
      environment: env,
      credentialBindings: configuration.credentialBindings,
      now: () => t0,
      fetch: fetchFrom(async (url, init) => {
        calls.push(url);
        assert.equal(
          new Headers(init?.headers).get("xi-api-key"),
          "fixture-elevenlabs-generation-secret",
        );
        if (url.endsWith("/v1/models")) {
          return jsonResponse([
            {
              model_id: "eleven_multilingual_v2",
              can_do_text_to_speech: true,
              max_characters_request: 10_000,
            },
            {
              model_id: "eleven_v3",
              can_do_text_to_speech: true,
              max_characters_request: 5_000,
            },
          ]);
        }
        if (url.endsWith("/v1/voices/premadeVoice0001")) {
          return jsonResponse({
            voice_id: "premadeVoice0001",
            category: "premade",
          });
        }
        if (
          url.includes(
            "/v1/text-to-speech/premadeVoice0001/with-timestamps",
          )
        ) {
          const endpoint = new URL(url);
          assert.equal(endpoint.searchParams.get("output_format"), "wav_44100");
          assert.equal(endpoint.searchParams.get("enable_logging"), "false");
          assert.equal(init?.method, "POST");
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          assert.equal(body.text, text);
          assert.equal(body.model_id, "eleven_multilingual_v2");
          assert.equal(typeof body.seed, "number");
          assert.equal(JSON.stringify(body).includes("emotionalObjective"), false);
          assert.equal(JSON.stringify(body).includes("subtext"), false);
          return timestampResponse();
        }
        throw new Error(`unexpected ElevenLabs URL: ${url}`);
      }),
    });
    const credentials = new EnvironmentCredentialResolver(
      env,
      configuration.credentialBindings,
    );
    const result = await runConfiguredWorkerRuntime(configuration, {
      providers,
      credentials,
      audioEngineering,
      now: () => t0,
    });

    assert.equal(result.status, "stopped");
    assert.equal(result.providerCount, 1);
    assert.equal(result.lifecycle.service.claimedJobs, 1);
    assert.equal(result.lifecycle.service.completedJobs, 1);
    assert.equal(result.lifecycle.service.blockedJobs, 0);
    assert.equal(calls.length, 3);
    assert.equal(engineeringRunner.commands.length, 6);

    const queueEnvelope = await queue.read(`queue_${job.id}`);
    assert.equal(queueEnvelope?.payload.status, "completed");
    assert.equal(queueEnvelope?.payload.completion?.resultIds.length, 1);
    assert.equal(queueEnvelope?.payload.completion?.outputArtifactRefs.length, 5);
    assert.equal(queueEnvelope?.payload.completion?.currency, "AUD");
    assert.equal(queueEnvelope?.payload.completion?.totalEstimatedCost, 0.00168);

    const budget = await ledger.require(job.projectId, "AUD");
    assert.equal(budget.payload.committedMicros, 1_680);
    assert.equal(budget.payload.reservations.length, 1);
    assert.equal(budget.payload.reservations[0]?.status, "committed");
    assert.equal(budget.payload.reservations[0]?.committedMicros, 1_680);

    const registry = new FileArtifactRegistry(
      new FileProjectStore(configuration.artifactRootDirectory),
    );
    const artifactRows = await registry.list();
    assert.equal(artifactRows.length, 5);
    const artifactKinds: string[] = [];
    for (const row of artifactRows) {
      const artifact = await registry.require(row.entityId);
      artifactKinds.push(artifact.payload.kind);
      assert.equal(artifact.payload.verification.status, "verified");
      assert.equal(artifact.payload.projectId, job.projectId);
      assert.equal(artifact.payload.jobId, job.id);
      assert.equal(artifact.payload.segmentId, job.segmentId);
    }
    assert.deepEqual(artifactKinds.sort(), [
      "audio-analysis",
      "audio-analysis",
      "audio-candidate",
      "transcript",
      "word-alignment",
    ]);
    const analysisArtifacts = artifactRows.filter(
      (row) => row.payload.kind === "audio-analysis",
    );
    assert.equal(analysisArtifacts.length, 2);
    assert.equal(
      analysisArtifacts.some((row) => row.payload.takeId !== undefined),
      true,
    );

    const serialised = JSON.stringify(result);
    for (const forbidden of [
      text,
      "fixture-elevenlabs-generation-secret",
      "premadeVoice0001",
      "voice_elevenlabs_generation_001",
      "private-elevenlabs-request-001",
      approvedCalibration.id,
      approvedCalibration.seriesId!,
      "artifact_calibration_take_elevenlabs_generation_001",
      "reviewer_elevenlabs_generation_001",
      "greg_parker",
      configuration.queueRootDirectory,
      configuration.artifactRootDirectory,
      configuration.objectRootDirectory,
      "audio-engineering-temp",
      "acx-audio-submission-requirements-reviewed-2026-07",
    ]) assert.equal(serialised.includes(forbidden), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
