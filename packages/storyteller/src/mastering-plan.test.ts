import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  ACX_AUDIOBOOK_PROFILE,
  stableHash,
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
  recordArtifactReview,
  verifyArtifactIntegrity,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import {
  assertMasteringPlan,
  createMasteringPlan,
  masteringPlanPublicView,
  proposeTransparentGainMastering,
  type MasteringOperation,
  type MasteringPlan,
} from "./mastering-plan.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:00:01.000Z");
const t2 = new Date("2026-07-27T00:00:02.000Z");
const rightsFingerprint = "a".repeat(64);

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function wavBytes(): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    0x01, 0x02, 0x03, 0x04,
  ]);
}

function rights(overrides: Partial<ArtifactRightsSnapshot> = {}): ArtifactRightsSnapshot {
  return {
    rightsEvidenceId: "rights_mastering_plan_001",
    rightsFingerprint,
    allowedUses: ["audiobook"],
    commercialUseApproved: true,
    expiresAt: "2028-07-27T00:00:00.000Z",
    ...overrides,
  };
}

function commandResult(
  stdout = "",
  stderr = "",
): AudioEngineeringCommandResult {
  return { exitCode: 0, stdout, stderr, durationMs: 4 };
}

class EngineeringRunner implements AudioEngineeringRunner {
  constructor(
    readonly byteCount: number,
    readonly rmsDb = -25,
    readonly peakDb = -8,
    readonly noiseFloorDb = -70,
    readonly truePeakDb = -9,
    readonly clippedSampleCount = 0,
    readonly sampleRateHz = 44_100,
    readonly channels = 1,
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
            sample_rate: String(this.sampleRateHz),
            channels: this.channels,
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
          `lavfi.astats.Overall.RMS_level=${this.rmsDb.toFixed(4)}`,
          `lavfi.astats.Overall.Peak_level=${this.peakDb.toFixed(4)}`,
          `lavfi.astats.Overall.Noise_floor=${this.noiseFloorDb.toFixed(4)}`,
          `lavfi.astats.Overall.Peak_count=${this.clippedSampleCount}`,
        ].join("\n"));
      case "loudnorm":
        return commandResult("", JSON.stringify({
          input_i: this.rmsDb.toFixed(2),
          input_tp: this.truePeakDb.toFixed(2),
          input_lra: "4.20",
          input_thresh: "-35.00",
          target_offset: "0.00",
        }));
      case "silence":
        return commandResult();
    }
  }
}

async function engineeringEvidence(
  overrides: Partial<{
    rmsDb: number;
    peakDb: number;
    noiseFloorDb: number;
    truePeakDb: number;
    clippedSampleCount: number;
    sampleRateHz: number;
    channels: number;
  }> = {},
): Promise<AudioEngineeringEvidence> {
  const bytes = wavBytes();
  return await analyseAudioEngineering({
    audioPath: "/private/mastering/chapter.wav",
    inputContentHash: hashBytes(bytes),
    inputByteCount: bytes.byteLength,
    profile: ACX_AUDIOBOOK_PROFILE,
    profileVersion: "acx-2026-07",
    profileReviewedAt: "2026-07-01T00:00:00.000Z",
    profileSourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner: new EngineeringRunner(
      bytes.byteLength,
      overrides.rmsDb ?? -25,
      overrides.peakDb ?? -8,
      overrides.noiseFloorDb ?? -70,
      overrides.truePeakDb ?? -9,
      overrides.clippedSampleCount ?? 0,
      overrides.sampleRateHz ?? 44_100,
      overrides.channels ?? 1,
    ),
    now: t2,
  });
}

function verifiedArtifact(input: Readonly<{
  id: string;
  kind: "chapter-master" | "audio-analysis";
  bytes: Uint8Array;
  parentArtifactIds: readonly string[];
  sourceContentHash: string;
  reviewRequired: boolean;
  rights?: ArtifactRightsSnapshot;
}>): ArtifactRecord {
  const initial = createArtifactRecord({
    id: input.id,
    kind: input.kind,
    projectId: "project_mastering_plan_001",
    jobId: "job_mastering_plan_001",
    segmentId: "chapter_mastering_plan_001",
    takeId: "take_mastering_plan_001",
    storage: {
      driver: "private-object-store",
      provider: "storyteller-mastering-test",
      container: "private-mastering-test",
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
      createdByActorId: "worker_mastering_plan_001",
      sourceContentHash: input.sourceContentHash,
      generationRequestHash: "b".repeat(64),
      parentArtifactIds: input.parentArtifactIds,
    },
    rights: input.rights ?? rights(),
    reviewRequired: input.reviewRequired,
  }, t0);
  const verified = verifyArtifactIntegrity(initial, {
    observedContentHash: initial.integrity.contentHash,
    observedByteCount: initial.integrity.byteCount,
    checkedByActorId: "verifier_mastering_plan_001",
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: t1,
  });
  return input.reviewRequired
    ? recordArtifactReview(verified, {
        decision: "approved",
        reviewerId: "director_mastering_plan_001",
        notes: "Approved in complete chapter context before mastering.",
        decidedAt: t2,
      })
    : verified;
}

async function fixture() {
  const evidence = await engineeringEvidence();
  const masterBytes = wavBytes();
  const master = verifiedArtifact({
    id: "artifact_chapter_mastering_plan_001",
    kind: "chapter-master",
    bytes: masterBytes,
    parentArtifactIds: ["artifact_render_mastering_plan_001"],
    sourceContentHash: "c".repeat(64),
    reviewRequired: true,
  });
  const engineeringBytes = new TextEncoder().encode(JSON.stringify(evidence));
  const engineering = verifiedArtifact({
    id: "artifact_engineering_mastering_plan_001",
    kind: "audio-analysis",
    bytes: engineeringBytes,
    parentArtifactIds: [master.id],
    sourceContentHash: master.integrity.contentHash,
    reviewRequired: false,
  });
  return { master, engineering, evidence };
}

function planInput(
  data: Awaited<ReturnType<typeof fixture>>,
  operations: readonly MasteringOperation[],
) {
  return {
    id: "mastering_plan_001",
    projectId: "project_mastering_plan_001",
    chapterId: "chapter_mastering_plan_001",
    chapterMaster: data.master,
    engineeringArtifact: data.engineering,
    engineeringEvidence: data.evidence,
    targetProfile: data.evidence.profile,
    operations,
    rationale: "Apply only the minimum transparent correction needed for the reviewed delivery profile.",
    createdByActorId: "mastering_engineer_001",
    createdAt: new Date("2026-07-27T00:00:03.000Z"),
  } as const;
}

test("transparent gain proposal finds a bounded common RMS, peak, true-peak and noise window", async () => {
  const evidence = await engineeringEvidence();
  const proposal = proposeTransparentGainMastering({
    evidence,
    targetProfile: evidence.profile,
  });

  assert.equal(proposal.possible, true);
  assert.deepEqual(proposal.findings, []);
  assert.deepEqual(proposal.operations, [{
    kind: "gain",
    gainDb: 4.5,
    rationaleCode: "MASTERING_TRANSPARENT_GAIN",
  }]);
  assert.equal(proposal.predictedMetrics.rmsDb, -20.5);
  assert.equal(proposal.predictedMetrics.peakDb, -3.5);
  assert.equal(proposal.predictedMetrics.truePeakDb, -4.5);
  assert.equal(proposal.predictedMetrics.noiseFloorDb, -65.5);
  assert.match(proposal.fingerprint, /^[a-f0-9]{64}$/u);
});

test("transparent gain proposal blocks impossible windows and source repair requirements", async () => {
  const impossible = await engineeringEvidence({
    rmsDb: -30,
    peakDb: -12,
    truePeakDb: -13,
    noiseFloorDb: -61,
  });
  const impossibleProposal = proposeTransparentGainMastering({
    evidence: impossible,
    targetProfile: impossible.profile,
  });
  assert.equal(impossibleProposal.possible, false);
  assert.equal(
    impossibleProposal.findings.some((finding) =>
      finding.code === "MASTERING_TRANSPARENT_GAIN_WINDOW_EMPTY"
    ),
    true,
  );

  const damaged = await engineeringEvidence({
    peakDb: 0,
    truePeakDb: 0.5,
    clippedSampleCount: 4,
    sampleRateHz: 22_050,
    channels: 2,
  });
  const damagedProposal = proposeTransparentGainMastering({
    evidence: damaged,
    targetProfile: impossible.profile,
  });
  assert.equal(damagedProposal.possible, false);
  assert.deepEqual(
    damagedProposal.findings
      .map((finding) => finding.code)
      .filter((code) => code.startsWith("MASTERING_"))
      .sort(),
    [
      "MASTERING_CHANNEL_CONVERSION_REQUIRED",
      "MASTERING_SAMPLE_RATE_CONVERSION_REQUIRED",
      "MASTERING_SOURCE_CLIPPING_REQUIRES_REPAIR",
    ],
  );
});

test("approved chapter evidence produces a recomputable preservation-first mastering plan", async () => {
  const data = await fixture();
  const proposal = proposeTransparentGainMastering({
    evidence: data.evidence,
    targetProfile: data.evidence.profile,
  });
  const plan = createMasteringPlan(planInput(data, proposal.operations));

  assertMasteringPlan(plan);
  assert.deepEqual(plan.sourceEngineering.metrics, data.evidence.metrics);
  assert.equal(plan.prediction.eligibleByPrediction, true);
  assert.equal(plan.prediction.requiresPostRenderMeasurement, true);
  assert.equal(plan.prediction.metrics.rmsDb, -20.5);
  assert.deepEqual(plan.operations.map((operation) => operation.kind), ["gain"]);

  const publicView = masteringPlanPublicView(plan);
  const serialised = JSON.stringify(publicView);
  assert.equal(publicView.predictedEligible, true);
  assert.deepEqual(publicView.operationKinds, ["gain"]);
  for (const forbidden of [
    data.master.id,
    data.engineering.id,
    data.master.integrity.contentHash,
    rightsFingerprint,
    "mastering_engineer_001",
    "acx-audio-submission-requirements-reviewed-2026-07",
    "/private/",
  ]) assert.equal(serialised.includes(forbidden), false);
});

test("mastering plan rejects unapproved, mismatched and stale evidence", async () => {
  const data = await fixture();
  const unapprovedMaster: ArtifactRecord = {
    ...data.master,
    review: { required: true, status: "pending" },
  };
  await assert.rejects(
    async () => createMasteringPlan({
      ...planInput(data, []),
      chapterMaster: unapprovedMaster,
    }),
    /ARTIFACT_FINGERPRINT_MISMATCH|MASTERING_PLAN_CHAPTER_APPROVAL_REQUIRED/u,
  );

  const wrongParent: ArtifactRecord = {
    ...data.engineering,
    provenance: {
      ...data.engineering.provenance,
      parentArtifactIds: ["artifact_other_master_001"],
    },
  };
  await assert.rejects(
    async () => createMasteringPlan({
      ...planInput(data, []),
      engineeringArtifact: wrongParent,
    }),
    /ARTIFACT_FINGERPRINT_MISMATCH|MASTERING_PLAN_ENGINEERING_PARENT_MISMATCH/u,
  );

  const wrongRights = verifiedArtifact({
    id: "artifact_engineering_mastering_plan_wrong_rights",
    kind: "audio-analysis",
    bytes: new TextEncoder().encode(JSON.stringify(data.evidence)),
    parentArtifactIds: [data.master.id],
    sourceContentHash: data.master.integrity.contentHash,
    reviewRequired: false,
    rights: rights({ rightsFingerprint: "d".repeat(64) }),
  });
  assert.throws(
    () => createMasteringPlan({
      ...planInput(data, []),
      engineeringArtifact: wrongRights,
    }),
    /MASTERING_PLAN_RIGHTS_SCOPE_MISMATCH/u,
  );
});

test("operation bounds, duplicates and ordering are fail-closed", async () => {
  const data = await fixture();
  assert.throws(
    () => createMasteringPlan(planInput(data, [{
      kind: "gain",
      gainDb: 13,
      rationaleCode: "MASTERING_GAIN",
    }])),
    /MASTERING_PLAN_GAIN_INVALID/u,
  );
  assert.throws(
    () => createMasteringPlan(planInput(data, [
      { kind: "gain", gainDb: 1, rationaleCode: "MASTERING_GAIN_A" },
      { kind: "gain", gainDb: 2, rationaleCode: "MASTERING_GAIN_B" },
    ])),
    /MASTERING_PLAN_OPERATION_DUPLICATE/u,
  );
  assert.throws(
    () => createMasteringPlan(planInput(data, [
      {
        kind: "true-peak-limiter",
        ceilingDb: -3.1,
        maximumReductionDb: 1,
        rationaleCode: "MASTERING_LIMITER",
      },
      {
        kind: "high-pass",
        frequencyHz: 70,
        slopeDbPerOctave: 12,
        rationaleCode: "MASTERING_HIGH_PASS",
      },
    ])),
    /MASTERING_PLAN_OPERATION_ORDER_INVALID/u,
  );
});

test("persisted source metrics cannot be changed behind a recomputed plan fingerprint", async () => {
  const data = await fixture();
  const plan = createMasteringPlan(planInput(data, [{
    kind: "gain",
    gainDb: 4.5,
    rationaleCode: "MASTERING_TRANSPARENT_GAIN",
  }]));
  const { fingerprint: _fingerprint, ...base } = plan;
  const partial = {
    ...base,
    sourceEngineering: {
      ...base.sourceEngineering,
      metrics: {
        ...base.sourceEngineering.metrics,
        rmsDb: -10,
      },
    },
  };
  const tampered = {
    ...partial,
    fingerprint: stableHash(partial),
  } as MasteringPlan;

  assert.throws(
    () => assertMasteringPlan(tampered),
    /MASTERING_PLAN_PREDICTION_MISMATCH/u,
  );
});
