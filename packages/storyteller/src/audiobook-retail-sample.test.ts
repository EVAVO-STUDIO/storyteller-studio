import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createArtifactRecord,
  recordArtifactReview,
  verifyArtifactIntegrity,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import { FileArtifactRegistry } from "./artifact-store.js";
import type {
  AudioEngineeringCommand,
  AudioEngineeringCommandResult,
  AudioEngineeringRunner,
} from "./audio-engineering.js";
import {
  assertAudiobookRetailSampleChain,
  assertAudiobookRetailSampleMatchesSources,
  audiobookRetailSamplePublicView,
  ingestAudiobookRetailSample,
  type AudiobookRetailSampleChain,
} from "./audiobook-retail-sample.js";
import {
  AUDIOBOOK_RETAIL_SAMPLE_PLAN_SCHEMA_VERSION,
  assertAudiobookRetailSamplePlan,
  type AudiobookRetailSamplePlan,
} from "./audiobook-retail-sample-plan.js";
import {
  renderAudiobookRetailSample,
  type AudiobookRetailSampleRenderResult,
  type AudiobookRetailSampleSourceResolver,
  type ResolvedAudiobookRetailSampleSource,
} from "./audiobook-retail-sample-render.js";
import type {
  AudiobookRetailTrackRenderRequest,
  AudiobookRetailTrackRenderRunner,
} from "./audiobook-retail-track-render.js";
import { createGenerationAudioEngineeringPolicy } from "./generation-audio-engineering.js";
import { ACX_AUDIOBOOK_PROFILE, stableHash } from "./index.js";
import { FilePrivateObjectStore } from "./private-object-store.js";
import { FileProjectStore } from "./project-store.js";

const time = (second: number): Date =>
  new Date(`2026-07-28T00:00:${String(second).padStart(2, "0")}.000Z`);
const t0 = time(0);
const t1 = time(1);
const t2 = time(2);
const t3 = time(3);
const t4 = time(4);
const t5 = time(5);
const t6 = time(6);
const t7 = time(7);
const rightsFingerprint = "a".repeat(64);

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function mp3Bytes(seed: number): Uint8Array {
  return new Uint8Array([0xff, 0xfb, 0x90, 0x64, seed, 0x01, 0x02, 0x03]);
}

function rights(
  overrides: Partial<ArtifactRightsSnapshot> = {},
): ArtifactRightsSnapshot {
  return {
    rightsEvidenceId: "rights_retail_sample_admission_001",
    rightsFingerprint,
    allowedUses: ["audiobook"],
    commercialUseApproved: true,
    expiresAt: "2028-07-28T00:00:00.000Z",
    retainUntil: "2033-07-28T00:00:00.000Z",
    deletionRequiredAt: "2034-07-28T00:00:00.000Z",
    ...overrides,
  };
}

function approvedSource(input: Readonly<{
  suffix?: string;
  rights?: ArtifactRightsSnapshot;
}> = {}): ArtifactRecord {
  const suffix = input.suffix ?? "001";
  const bytes = mp3Bytes(Number.parseInt(suffix.slice(-1), 10) || 9);
  const initial = createArtifactRecord({
    id: `artifact_retail_sample_source_${suffix}`,
    kind: "audiobook-retail-track",
    projectId: `project_retail_sample_admission_${suffix}`,
    jobId: `job_retail_track_admission_${suffix}`,
    segmentId: `retail_track_admission_${suffix}`,
    takeId: `take_retail_track_admission_${suffix}`,
    storage: {
      driver: "private-object-store",
      provider: "storyteller-retail-sample-admission-test",
      container: "private-retail-sample-admission-test",
      objectKey: `sha256/${hashBytes(bytes)}.mp3`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: hashBytes(bytes),
      byteCount: bytes.byteLength,
      mimeType: "audio/mpeg",
      format: "mp3",
    },
    provenance: {
      createdByActorId: `retail_track_encoder_${suffix}`,
      sourceContentHash: "b".repeat(64),
      generationRequestHash: "c".repeat(64),
      parentArtifactIds: [
        `artifact_retail_track_render_${suffix}`,
        `artifact_reference_master_${suffix}`,
      ],
    },
    rights: input.rights ?? rights(),
    reviewRequired: true,
  }, t0);
  const verified = verifyArtifactIntegrity(initial, {
    observedContentHash: initial.integrity.contentHash,
    observedByteCount: initial.integrity.byteCount,
    checkedByActorId: `retail_track_verifier_${suffix}`,
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: t1,
  });
  return recordArtifactReview(verified, {
    decision: "approved",
    reviewerId: `retail_track_release_manager_${suffix}`,
    notes: "Approved narrative retail MP3 for sample selection.",
    decidedAt: t2,
  });
}

function samplePlan(
  source: ArtifactRecord,
  suffix = "001",
): AudiobookRetailSamplePlan {
  const selectionBase = {
    selectedByActorId: `retail_sample_editor_${suffix}`,
    completeRangeListenConfirmed: true as const,
    representativeOfBookConfirmed: true as const,
    startBoundaryConfirmed: true as const,
    endBoundaryConfirmed: true as const,
    selectionPreference: "preferred-book-beginning" as const,
    selectedAt: t3.toISOString(),
  };
  const selection = Object.freeze({
    ...selectionBase,
    fingerprint: stableHash(selectionBase),
  });
  const safetyBase = {
    reviewedByActorId: `retail_sample_safety_reviewer_${suffix}`,
    completeRangeListenConfirmed: true as const,
    sourceFromAudiobookConfirmed: true as const,
    explicitContentDetected: false as const,
    unsuitableRetailPreviewContentDetected: false as const,
    approvedForRetailPreview: true as const,
    reviewedAt: t4.toISOString(),
  };
  const safety = Object.freeze({
    ...safetyBase,
    fingerprint: stableHash(safetyBase),
  });
  const partial: Omit<AudiobookRetailSamplePlan, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_SAMPLE_PLAN_SCHEMA_VERSION,
    id: `retail_sample_plan_admission_${suffix}`,
    projectId: source.projectId,
    bookId: `book_retail_sample_admission_${suffix}`,
    distributor: "acx-audible",
    policy: Object.freeze({
      id: `retail_sample_policy_admission_${suffix}`,
      externalVersion: "acx-2026-07",
      reviewedAt: "2026-07-27T00:00:00.000Z",
      expiresAt: "2027-07-27T00:00:00.000Z",
      fingerprint: "1".repeat(64),
      maximumDurationMs: 300_000,
      explicitContentProhibited: true,
      humanContentSafetyReviewRequired: true,
    }),
    trackPlan: Object.freeze({
      id: `retail_track_plan_admission_${suffix}`,
      fingerprint: "2".repeat(64),
    }),
    encodeChainFingerprint: "3".repeat(64),
    trackReview: Object.freeze({
      sessionId: `retail_track_review_admission_${suffix}`,
      sessionRevision: 8,
      sessionFingerprint: "4".repeat(64),
      approvalFingerprint: "5".repeat(64),
      approvedAt: t2.toISOString(),
    }),
    source: Object.freeze({
      trackOrdinal: 2,
      role: "chapter",
      fileName: "0002Chapter0001.mp3",
      originalArtifactRevision: source.revision - 1,
      originalArtifactFingerprint: source.previousFingerprint!,
      approvedArtifactId: source.id,
      approvedArtifactRevision: source.revision,
      approvedArtifactFingerprint: source.fingerprint,
      approvedArtifactContentHash: source.integrity.contentHash,
      approvedArtifactByteCount: source.integrity.byteCount,
      approvedArtifactReviewFingerprint: stableHash(source.review),
    }),
    range: Object.freeze({
      relativeStartMs: 0,
      relativeEndMs: 120_000,
      durationMs: 120_000,
      absoluteBookStartMs: 5_000,
      absoluteBookEndMs: 125_000,
    }),
    output: Object.freeze({
      fileName: "RetailSample.mp3",
      format: "mp3",
      codec: "mp3",
      bitRateMode: "cbr",
      bitRateKbps: 192,
      sampleRateHz: 44_100,
      channels: 1,
    }),
    selection,
    safety,
    status: "ready-for-rendering",
    createdAt: t5.toISOString(),
    revision: 1,
  };
  const plan = Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
  assertAudiobookRetailSamplePlan(plan);
  return plan;
}

class SourceResolver implements AudiobookRetailSampleSourceResolver {
  constructor(readonly plan: AudiobookRetailSamplePlan) {}

  async resolve(): Promise<ResolvedAudiobookRetailSampleSource> {
    return {
      artifactId: this.plan.source.approvedArtifactId,
      artifactRevision: this.plan.source.approvedArtifactRevision,
      artifactFingerprint: this.plan.source.approvedArtifactFingerprint,
      privatePath: "/private/storyteller/approved-sample-source.mp3",
      contentHash: this.plan.source.approvedArtifactContentHash,
      byteCount: this.plan.source.approvedArtifactByteCount,
      async dispose() {},
    };
  }
}

class SampleRenderRunner implements AudiobookRetailTrackRenderRunner {
  readonly requests: AudiobookRetailTrackRenderRequest[] = [];

  constructor(readonly bytes: Uint8Array = mp3Bytes(1)) {}

  async inspectVersion(): Promise<string> {
    return "ffmpeg version 7.1 retail sample admission fixture";
  }

  async render(request: AudiobookRetailTrackRenderRequest): Promise<Uint8Array> {
    this.requests.push(request);
    return this.bytes;
  }
}

interface EngineeringObservation {
  durationSeconds: number;
  byteCount: number;
  bitRateKbps?: number;
  sampleRateHz?: number;
  channels?: number;
  rmsDb?: number;
  peakDb?: number;
  truePeakDb?: number;
  noiseFloorDb?: number;
}

function commandResult(
  stdout = "",
  stderr = "",
): AudioEngineeringCommandResult {
  return { exitCode: 0, stdout, stderr, durationMs: 5 };
}

class EngineeringRunner implements AudioEngineeringRunner {
  #index = -1;

  constructor(readonly observations: readonly EngineeringObservation[]) {}

  async run(
    command: AudioEngineeringCommand,
  ): Promise<AudioEngineeringCommandResult> {
    if (command.stage === "ffprobe-version") {
      this.#index += 1;
      return commandResult("ffprobe version 7.1 retail sample fixture\n");
    }
    const current = this.observations[this.#index];
    if (!current) throw new Error("engineering observation missing");
    const bitRateKbps = current.bitRateKbps ?? 192;
    switch (command.stage) {
      case "ffmpeg-version":
        return commandResult("ffmpeg version 7.1 retail sample fixture\n");
      case "probe":
        return commandResult(JSON.stringify({
          streams: [{
            codec_type: "audio",
            codec_name: "mp3",
            sample_rate: String(current.sampleRateHz ?? 44_100),
            channels: current.channels ?? 1,
            bit_rate: String(bitRateKbps * 1_000),
            duration: current.durationSeconds.toFixed(6),
          }],
          format: {
            format_name: "mp3",
            duration: current.durationSeconds.toFixed(6),
            bit_rate: String(bitRateKbps * 1_000),
            size: String(current.byteCount),
          },
        }));
      case "astats":
        return commandResult([
          `lavfi.astats.Overall.RMS_level=${current.rmsDb ?? -20}`,
          `lavfi.astats.Overall.Peak_level=${current.peakDb ?? -4}`,
          `lavfi.astats.Overall.Noise_floor=${current.noiseFloorDb ?? -65}`,
          "lavfi.astats.Overall.Peak_count=0",
        ].join("\n"));
      case "loudnorm":
        return commandResult("", JSON.stringify({
          input_i: String(current.rmsDb ?? -20),
          input_tp: String(current.truePeakDb ?? -4.2),
          input_lra: "4",
          input_thresh: "-30",
          target_offset: "0",
        }));
      case "silence":
        return commandResult("", [
          "silence_start: 0",
          "silence_end: 1 | silence_duration: 1",
          `silence_start: ${Math.max(1, current.durationSeconds - 1)}`,
          `silence_end: ${current.durationSeconds} | silence_duration: 1`,
        ].join("\n"));
    }
  }
}

function engineeringPolicy(
  temporaryRoot: string,
  observations: readonly EngineeringObservation[],
) {
  return createGenerationAudioEngineeringPolicy({
    profile: ACX_AUDIOBOOK_PROFILE,
    externalVersion: "acx-2026-07",
    reviewedAt: "2026-07-27T00:00:00.000Z",
    sourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner: new EngineeringRunner(observations),
    ffprobePath: "/opt/media/ffprobe",
    ffmpegPath: "/opt/media/ffmpeg",
    timeoutMs: 30_000,
    maximumOutputBytes: 2 * 1024 * 1024,
    temporaryRoot,
    now: t6,
  });
}

interface Fixture {
  root: string;
  objectStore: FilePrivateObjectStore;
  registry: FileArtifactRegistry;
  source: ArtifactRecord;
  plan: AudiobookRetailSamplePlan;
  render: AudiobookRetailSampleRenderResult;
}

async function withFixture(
  run: (fixture: Fixture) => Promise<void>,
  input: Readonly<{
    suffix?: string;
    rights?: ArtifactRightsSnapshot;
  }> = {},
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-retail-sample-admission-"));
  try {
    const suffix = input.suffix ?? "001";
    const source = approvedSource({ suffix, rights: input.rights });
    const plan = samplePlan(source, suffix);
    const render = await renderAudiobookRetailSample({
      plan,
      source: new SourceResolver(plan),
      runner: new SampleRenderRunner(),
      renderedAt: t6,
    });
    await run({
      root,
      objectStore: new FilePrivateObjectStore(join(root, "objects")),
      registry: new FileArtifactRegistry(
        new FileProjectStore(join(root, "registry")),
      ),
      source,
      plan,
      render,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function observation(
  render: AudiobookRetailSampleRenderResult,
  overrides: Partial<EngineeringObservation> = {},
): EngineeringObservation {
  return {
    durationSeconds: 120,
    byteCount: render.bytes.byteLength,
    bitRateKbps: 192,
    ...overrides,
  };
}

function chainFingerprint(
  value: Omit<AudiobookRetailSampleChain, "fingerprint">,
): string {
  return stableHash({
    schemaVersion: value.schemaVersion,
    id: value.id,
    projectId: value.projectId,
    bookId: value.bookId,
    jobId: value.jobId,
    takeId: value.takeId,
    planId: value.planId,
    planFingerprint: value.planFingerprint,
    planManifest: {
      id: value.planManifest.payload.id,
      revision: value.planManifest.revision,
      fingerprint: value.planManifest.payload.fingerprint,
    },
    renderEvidence: {
      id: value.renderEvidence.payload.id,
      revision: value.renderEvidence.revision,
      fingerprint: value.renderEvidence.payload.fingerprint,
    },
    approvedSource: value.approvedSource,
    sample: {
      id: value.sample.payload.id,
      revision: value.sample.revision,
      fingerprint: value.sample.payload.fingerprint,
    },
    engineering: {
      artifactId: value.engineering.ingest.envelope.payload.id,
      revision: value.engineering.ingest.envelope.revision,
      evidenceFingerprint: value.engineering.evidence.fingerprint,
    },
    engineeringProfile: value.engineeringProfile,
    expectedDurationMs: value.expectedDurationMs,
    observedDurationMs: value.observedDurationMs,
    durationDriftMs: value.durationDriftMs,
    eligibleForReview: value.eligibleForReview,
    findingCodes: value.findingCodes,
    createdAt: value.createdAt,
  });
}

test("rendered retail sample becomes a private MP3 with independent engineering", async () => {
  await withFixture(async ({
    root,
    objectStore,
    registry,
    source,
    plan,
    render,
  }) => {
    const firstPolicy = engineeringPolicy(
      join(root, "engineering-1"),
      [observation(render)],
    );
    const first = await ingestAudiobookRetailSample(
      objectStore,
      registry,
      {
        plan,
        render,
        approvedSourceArtifact: source,
        actorId: "retail_sample_ingestor_001",
        verifierActorId: "retail_sample_verifier_001",
        engineering: firstPolicy,
        now: t7,
      },
    );

    assert.equal(first.eligibleForReview, true);
    assert.deepEqual(first.findingCodes, []);
    assert.equal(first.expectedDurationMs, 120_000);
    assert.equal(first.observedDurationMs, 120_000);
    assert.equal(first.durationDriftMs, 0);
    assert.equal(first.sample.payload.kind, "audiobook-retail-sample");
    assert.equal(first.sample.payload.integrity.mimeType, "audio/mpeg");
    assert.equal(first.sample.payload.integrity.format, "mp3");
    assert.equal(first.sample.payload.verification.status, "verified");
    assert.equal(first.sample.payload.review.status, "pending");
    assert.equal(first.engineering.candidateEligible, true);
    assert.doesNotThrow(() => assertAudiobookRetailSampleChain(first));
    assert.doesNotThrow(() =>
      assertAudiobookRetailSampleMatchesSources(first, {
        plan,
        render,
        approvedSourceArtifact: source,
        engineering: firstPolicy,
      })
    );

    const records = await registry.list();
    assert.equal(records.length, 4);
    assert.equal(
      records.filter((record) =>
        record.payload.kind === "audiobook-retail-sample"
      ).length,
      1,
    );
    assert.equal(
      records.filter((record) => record.payload.kind === "audio-analysis").length,
      3,
    );

    const secondPolicy = engineeringPolicy(
      join(root, "engineering-2"),
      [observation(render)],
    );
    const second = await ingestAudiobookRetailSample(
      objectStore,
      registry,
      {
        plan,
        render,
        approvedSourceArtifact: source,
        actorId: "retail_sample_ingestor_001",
        verifierActorId: "retail_sample_verifier_001",
        engineering: secondPolicy,
        now: t7,
      },
    );
    assert.equal(second.fingerprint, first.fingerprint);
    assert.equal((await registry.list()).length, 4);

    const view = audiobookRetailSamplePublicView(first);
    const serialised = JSON.stringify(view);
    assert.equal(view.fileName, "RetailSample.mp3");
    assert.equal(view.eligibleForReview, true);
    for (const forbidden of [
      source.id,
      source.fingerprint,
      source.integrity.contentHash,
      source.rights.rightsEvidenceId,
      first.jobId,
      first.takeId,
      first.planManifest.payload.id,
      first.renderEvidence.payload.id,
      first.sample.payload.id,
      first.engineering.ingest.envelope.payload.id,
      "retail_sample_ingestor_001",
      "retail_sample_verifier_001",
      "/private/storyteller",
      "objectKey",
      "commandFingerprint",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
    }
  });
});

test("failed technical engineering quarantines the sample and preserves analysis", async () => {
  await withFixture(async ({
    root,
    objectStore,
    registry,
    source,
    plan,
    render,
  }) => {
    const policy = engineeringPolicy(join(root, "engineering"), [
      observation(render, {
        bitRateKbps: 128,
        rmsDb: -14,
        peakDb: 0,
        truePeakDb: 0.2,
        noiseFloorDb: -45,
      }),
    ]);
    const chain = await ingestAudiobookRetailSample(
      objectStore,
      registry,
      {
        plan,
        render,
        approvedSourceArtifact: source,
        actorId: "retail_sample_ingestor_failure_001",
        verifierActorId: "retail_sample_verifier_failure_001",
        engineering: policy,
        now: t7,
      },
    );

    assert.equal(chain.eligibleForReview, false);
    assert.equal(chain.sample.payload.verification.status, "quarantined");
    assert.equal(chain.sample.payload.review.status, "pending");
    assert.equal(
      chain.engineering.ingest.envelope.payload.verification.status,
      "verified",
    );
    assert.equal(chain.engineering.candidateEligible, false);
    assert.equal(
      chain.findingCodes.includes("AUDIOBOOK_RETAIL_SAMPLE_BIT_RATE_MISMATCH"),
      true,
    );
    assert.doesNotThrow(() => assertAudiobookRetailSampleChain(chain));
    assert.equal((await registry.list()).length, 4);
  });
});

test("independent duration drift blocks review eligibility", async () => {
  await withFixture(async ({
    root,
    objectStore,
    registry,
    source,
    plan,
    render,
  }) => {
    const policy = engineeringPolicy(join(root, "engineering"), [
      observation(render, { durationSeconds: 120.75 }),
    ]);
    const chain = await ingestAudiobookRetailSample(
      objectStore,
      registry,
      {
        plan,
        render,
        approvedSourceArtifact: source,
        actorId: "retail_sample_ingestor_drift_001",
        verifierActorId: "retail_sample_verifier_drift_001",
        engineering: policy,
        maximumDurationDriftMs: 250,
        now: t7,
      },
    );

    assert.equal(chain.durationDriftMs, 750);
    assert.equal(chain.eligibleForReview, false);
    assert.equal(chain.sample.payload.verification.status, "quarantined");
    assert.equal(
      chain.findingCodes.includes("AUDIOBOOK_RETAIL_SAMPLE_DURATION_DRIFT"),
      true,
    );
  });
});

test("wrong source, expired rights, altered bytes and aborts fail before admission", async () => {
  await withFixture(async ({
    root,
    objectStore,
    registry,
    source,
    plan,
    render,
  }) => {
    const policy = engineeringPolicy(
      join(root, "engineering"),
      [observation(render)],
    );
    const otherSource = approvedSource({ suffix: "999" });
    await assert.rejects(
      ingestAudiobookRetailSample(objectStore, registry, {
        plan,
        render,
        approvedSourceArtifact: otherSource,
        actorId: "retail_sample_ingestor_scope_001",
        engineering: policy,
        now: t7,
      }),
      /AUDIOBOOK_RETAIL_SAMPLE_APPROVED_SOURCE_MISMATCH/u,
    );
    assert.equal((await registry.list()).length, 0);

    const changedBytes = new Uint8Array(render.bytes);
    changedBytes[changedBytes.length - 1] = changedBytes.at(-1)! ^ 0xff;
    const altered: AudiobookRetailSampleRenderResult = Object.freeze({
      evidence: render.evidence,
      bytes: changedBytes,
    });
    await assert.rejects(
      ingestAudiobookRetailSample(objectStore, registry, {
        plan,
        render: altered,
        approvedSourceArtifact: source,
        actorId: "retail_sample_ingestor_bytes_001",
        engineering: policy,
        now: t7,
      }),
      /AUDIOBOOK_RETAIL_SAMPLE_RENDER_RESULT_INTEGRITY_MISMATCH/u,
    );
    assert.equal((await registry.list()).length, 0);

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      ingestAudiobookRetailSample(objectStore, registry, {
        plan,
        render,
        approvedSourceArtifact: source,
        actorId: "retail_sample_ingestor_abort_001",
        engineering: policy,
        now: t7,
        signal: controller.signal,
      }),
      /AUDIOBOOK_RETAIL_SAMPLE_ABORTED/u,
    );
    assert.equal((await registry.list()).length, 0);
  });

  await withFixture(async ({
    root,
    objectStore,
    registry,
    source,
    plan,
    render,
  }) => {
    const policy = engineeringPolicy(
      join(root, "engineering"),
      [observation(render)],
    );
    await assert.rejects(
      ingestAudiobookRetailSample(objectStore, registry, {
        plan,
        render,
        approvedSourceArtifact: source,
        actorId: "retail_sample_ingestor_rights_001",
        engineering: policy,
        now: t7,
      }),
      /AUDIOBOOK_RETAIL_SAMPLE_RIGHTS_EXPIRED/u,
    );
    assert.equal((await registry.list()).length, 0);
  }, {
    suffix: "expired",
    rights: rights({ expiresAt: "2026-07-28T00:00:06.500Z" }),
  });
});

test("recomputed structural state cannot replace the approved sample plan", async () => {
  await withFixture(async ({
    root,
    objectStore,
    registry,
    source,
    plan,
    render,
  }) => {
    const policy = engineeringPolicy(
      join(root, "engineering"),
      [observation(render)],
    );
    const chain = await ingestAudiobookRetailSample(
      objectStore,
      registry,
      {
        plan,
        render,
        approvedSourceArtifact: source,
        actorId: "retail_sample_ingestor_tamper_001",
        engineering: policy,
        now: t7,
      },
    );
    const { fingerprint: _fingerprint, ...base } = chain;
    const changedBase: Omit<AudiobookRetailSampleChain, "fingerprint"> = {
      ...base,
      planId: "retail_sample_plan_structurally_valid_but_wrong_001",
    };
    const changed = Object.freeze({
      ...changedBase,
      fingerprint: chainFingerprint(changedBase),
    });

    assert.doesNotThrow(() => assertAudiobookRetailSampleChain(changed));
    assert.throws(
      () => assertAudiobookRetailSampleMatchesSources(changed, {
        plan,
        render,
        approvedSourceArtifact: source,
        engineering: policy,
      }),
      /AUDIOBOOK_RETAIL_SAMPLE_SOURCE_MISMATCH/u,
    );
  });
});
