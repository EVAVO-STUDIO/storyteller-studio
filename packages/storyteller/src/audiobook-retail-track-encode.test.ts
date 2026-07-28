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
  assertAudiobookRetailTrackEncodeChain,
  assertAudiobookRetailTrackEncodeMatchesSources,
  audiobookRetailTrackEncodePublicView,
  ingestAudiobookRetailTrackRender,
  type AudiobookRetailTrackEncodeChain,
} from "./audiobook-retail-track-encode.js";
import {
  AUDIOBOOK_RETAIL_TRACK_PLAN_SCHEMA_VERSION,
  assertAudiobookRetailTrackPlan,
  type AudiobookRetailTrack,
  type AudiobookRetailTrackOutput,
  type AudiobookRetailTrackPlan,
} from "./audiobook-retail-track-plan.js";
import {
  renderAudiobookRetailTrackPlan,
  type AudiobookRetailReferenceMasterResolver,
  type AudiobookRetailTrackRenderRequest,
  type AudiobookRetailTrackRenderResult,
  type AudiobookRetailTrackRenderRunner,
  type ResolvedAudiobookRetailReferenceMaster,
} from "./audiobook-retail-track-render.js";
import { createGenerationAudioEngineeringPolicy } from "./generation-audio-engineering.js";
import { ACX_AUDIOBOOK_PROFILE, stableHash } from "./index.js";
import { FilePrivateObjectStore } from "./private-object-store.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-28T00:00:00.000Z");
const t1 = new Date("2026-07-28T00:00:01.000Z");
const t2 = new Date("2026-07-28T00:00:02.000Z");
const t3 = new Date("2026-07-28T00:00:03.000Z");
const t4 = new Date("2026-07-28T00:00:04.000Z");
const t5 = new Date("2026-07-28T00:00:05.000Z");
const rightsFingerprint = "a".repeat(64);
const output: AudiobookRetailTrackOutput = Object.freeze({
  format: "mp3",
  codec: "mp3",
  bitRateMode: "cbr",
  bitRateKbps: 192,
  sampleRateHz: 44_100,
  channels: 1,
});

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function mp3Bytes(seed: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xfb,
    0x90,
    0x64,
    seed,
    0x01,
    0x02,
    0x03,
  ]);
}

function wavBytes(seed = 1): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    seed, 0x02, 0x03, 0x04,
  ]);
}

function rights(
  overrides: Partial<ArtifactRightsSnapshot> = {},
): ArtifactRightsSnapshot {
  return {
    rightsEvidenceId: "rights_retail_track_encode_001",
    rightsFingerprint,
    allowedUses: ["audiobook"],
    commercialUseApproved: true,
    expiresAt: "2028-07-28T00:00:00.000Z",
    retainUntil: "2033-07-28T00:00:00.000Z",
    deletionRequiredAt: "2034-07-28T00:00:00.000Z",
    ...overrides,
  };
}

function approvedReference(input: Readonly<{
  suffix?: string;
  rights?: ArtifactRightsSnapshot;
}> = {}): ArtifactRecord {
  const suffix = input.suffix ?? "001";
  const bytes = wavBytes(Number.parseInt(suffix.slice(-1), 10) || 1);
  const initial = createArtifactRecord({
    id: `artifact_retail_reference_${suffix}`,
    kind: "audiobook-reference-master",
    projectId: `project_retail_encode_${suffix}`,
    jobId: `job_retail_reference_${suffix}`,
    segmentId: `book_retail_encode_${suffix}`,
    takeId: `take_retail_reference_${suffix}`,
    storage: {
      driver: "private-object-store",
      provider: "storyteller-retail-encode-test",
      container: "private-retail-encode-test",
      objectKey: `sha256/${hashBytes(bytes)}.wav`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: hashBytes(bytes),
      byteCount: bytes.byteLength,
      mimeType: "audio/wav",
      format: "wav",
    },
    provenance: {
      createdByActorId: `reference_builder_${suffix}`,
      sourceContentHash: "b".repeat(64),
      generationRequestHash: "c".repeat(64),
      parentArtifactIds: [
        `artifact_sequence_manifest_${suffix}`,
        `artifact_reference_render_${suffix}`,
      ],
    },
    rights: input.rights ?? rights(),
    reviewRequired: true,
  }, t0);
  const verified = verifyArtifactIntegrity(initial, {
    observedContentHash: initial.integrity.contentHash,
    observedByteCount: initial.integrity.byteCount,
    checkedByActorId: `reference_verifier_${suffix}`,
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: t1,
  });
  return recordArtifactReview(verified, {
    decision: "approved",
    reviewerId: `reference_reviewer_${suffix}`,
    notes: "Approved complete-book reference master for retail encoding.",
    decidedAt: t2,
  });
}

function track(input: Readonly<{
  suffix: string;
  ordinal: number;
  role: AudiobookRetailTrack["role"];
  fileName: string;
  startMs: number;
  durationMs: number;
  headerKind: AudiobookRetailTrack["headerKind"];
}>): AudiobookRetailTrack {
  const character = String((input.ordinal % 9) + 1);
  const partial: Omit<AudiobookRetailTrack, "fingerprint"> = {
    ordinal: input.ordinal,
    role: input.role,
    fileName: input.fileName,
    sourceStartMs: input.startMs,
    sourceEndMs: input.startMs + input.durationMs,
    durationMs: input.durationMs,
    source: Object.freeze({
      componentOrdinal: input.ordinal,
      componentFingerprint: character.repeat(64),
      artifactId: `artifact_retail_source_${input.suffix}_${input.ordinal}`,
      artifactRevision: 3,
      artifactFingerprint: String((input.ordinal + 3) % 9 + 1).repeat(64),
      contentHash: String((input.ordinal + 5) % 9 + 1).repeat(64),
      byteCount: 240_000 + input.ordinal,
    }),
    headerKind: input.headerKind,
    sectionHeaderRequired: true,
    sectionHeaderReviewedUnderReferenceApproval: true,
    secondaryHeaderRequired: false,
    output,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
}

function readyPlan(
  reference: ArtifactRecord,
  suffix = "001",
): AudiobookRetailTrackPlan {
  const tracks = Object.freeze([
    track({
      suffix,
      ordinal: 1,
      role: "opening-credit",
      fileName: "0001OpeningCredits.mp3",
      startMs: 0,
      durationMs: 5_000,
      headerKind: "opening-credit",
    }),
    track({
      suffix,
      ordinal: 2,
      role: "chapter",
      fileName: "0002Chapter0001.mp3",
      startMs: 5_000,
      durationMs: 60_000,
      headerKind: "chapter-title",
    }),
    track({
      suffix,
      ordinal: 3,
      role: "closing-credit",
      fileName: "0003ClosingCredits.mp3",
      startMs: 65_000,
      durationMs: 6_000,
      headerKind: "closing-credit",
    }),
  ]);
  const partial: Omit<AudiobookRetailTrackPlan, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_TRACK_PLAN_SCHEMA_VERSION,
    id: `retail_track_plan_encode_${suffix}`,
    projectId: reference.projectId,
    bookId: reference.segmentId!,
    distributor: "acx-audible",
    policy: Object.freeze({
      id: `retail_policy_encode_${suffix}`,
      externalVersion: "acx-2026-07",
      reviewedAt: "2026-07-27T00:00:00.000Z",
      expiresAt: "2027-07-27T00:00:00.000Z",
      fingerprint: "d".repeat(64),
    }),
    narration: Object.freeze({
      evidenceId: `retail_narration_encode_${suffix}`,
      sourceKind: "human-performance",
      evidenceFingerprint: "e".repeat(64),
      platformAuthorisationPresent: false,
    }),
    sequence: Object.freeze({
      id: `audiobook_sequence_encode_${suffix}`,
      revision: 1,
      fingerprint: "f".repeat(64),
      componentCount: 3,
      chapterCount: 1,
      expectedDurationMs: 71_000,
      outputFingerprint: "1".repeat(64),
    }),
    referenceMaster: Object.freeze({
      id: reference.id,
      revision: reference.revision,
      fingerprint: reference.fingerprint,
      contentHash: reference.integrity.contentHash,
      byteCount: reference.integrity.byteCount,
      expectedDurationMs: 71_000,
      observedDurationMs: 71_000,
      durationDriftMs: 0,
    }),
    review: Object.freeze({
      sessionId: `reference_review_encode_${suffix}`,
      sessionRevision: 4,
      sessionFingerprint: "2".repeat(64),
      approvalFingerprint: "3".repeat(64),
      approvedAt: t2.toISOString(),
    }),
    output,
    tracks,
    blockers: Object.freeze([]),
    status: "ready-for-encoding",
    createdByActorId: `retail_track_planner_${suffix}`,
    createdAt: t3.toISOString(),
  };
  const plan = Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
  assertAudiobookRetailTrackPlan(plan);
  return plan;
}

class ReferenceResolver implements AudiobookRetailReferenceMasterResolver {
  constructor(readonly plan: AudiobookRetailTrackPlan) {}

  async resolve(): Promise<ResolvedAudiobookRetailReferenceMaster> {
    return {
      artifactId: this.plan.referenceMaster.id,
      artifactRevision: this.plan.referenceMaster.revision,
      artifactFingerprint: this.plan.referenceMaster.fingerprint,
      privatePath: "/private/storyteller/reference-master.wav",
      contentHash: this.plan.referenceMaster.contentHash,
      byteCount: this.plan.referenceMaster.byteCount,
      async dispose() {},
    };
  }
}

class RenderRunner implements AudiobookRetailTrackRenderRunner {
  readonly requests: AudiobookRetailTrackRenderRequest[] = [];

  constructor(readonly outputs: readonly Uint8Array[]) {}

  async inspectVersion(): Promise<string> {
    return "ffmpeg version 7.1 fixture";
  }

  async render(request: AudiobookRetailTrackRenderRequest): Promise<Uint8Array> {
    this.requests.push(request);
    const bytes = this.outputs[this.requests.length - 1];
    if (!bytes) throw new Error("fixture output missing");
    return bytes;
  }
}

interface EngineeringObservation {
  durationSeconds: number;
  byteCount: number;
  bitRateKbps: number;
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
      return commandResult("ffprobe version 7.1 fixture\n");
    }
    const current = this.observations[this.#index];
    if (!current) throw new Error("engineering observation missing");
    switch (command.stage) {
      case "ffmpeg-version":
        return commandResult("ffmpeg version 7.1 fixture\n");
      case "probe":
        return commandResult(JSON.stringify({
          streams: [{
            codec_type: "audio",
            codec_name: "mp3",
            sample_rate: String(current.sampleRateHz ?? 44_100),
            channels: current.channels ?? 1,
            bit_rate: String(current.bitRateKbps * 1_000),
            duration: current.durationSeconds.toFixed(6),
          }],
          format: {
            format_name: "mp3",
            duration: current.durationSeconds.toFixed(6),
            bit_rate: String(current.bitRateKbps * 1_000),
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

function defaultObservations(
  plan: AudiobookRetailTrackPlan,
  render: AudiobookRetailTrackRenderResult,
): EngineeringObservation[] {
  return plan.tracks.map((track, index) => ({
    durationSeconds: track.durationMs / 1_000,
    byteCount: render.tracks[index]!.bytes.byteLength,
    bitRateKbps: 192,
  }));
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
    now: t4,
  });
}

async function withFixture(
  run: (fixture: Readonly<{
    root: string;
    objectStore: FilePrivateObjectStore;
    registry: FileArtifactRegistry;
    reference: ArtifactRecord;
    plan: AudiobookRetailTrackPlan;
    render: AudiobookRetailTrackRenderResult;
  }>) => Promise<void>,
  input: Readonly<{
    suffix?: string;
    rights?: ArtifactRightsSnapshot;
  }> = {},
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-retail-track-encode-"));
  try {
    const reference = approvedReference({
      suffix: input.suffix,
      rights: input.rights,
    });
    const plan = readyPlan(reference, input.suffix ?? "001");
    const outputs = Object.freeze([
      mp3Bytes(1),
      mp3Bytes(2),
      mp3Bytes(3),
    ]);
    const render = await renderAudiobookRetailTrackPlan({
      plan,
      referenceMaster: new ReferenceResolver(plan),
      runner: new RenderRunner(outputs),
      renderedAt: t4,
    });
    await run({
      root,
      objectStore: new FilePrivateObjectStore(join(root, "objects")),
      registry: new FileArtifactRegistry(
        new FileProjectStore(join(root, "registry")),
      ),
      reference,
      plan,
      render,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function encodeChainFingerprint(
  value: Omit<AudiobookRetailTrackEncodeChain, "fingerprint">,
): string {
  return stableHash({
    schemaVersion: value.schemaVersion,
    projectId: value.projectId,
    bookId: value.bookId,
    jobId: value.jobId,
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
    referenceMaster: value.referenceMaster,
    engineeringProfile: value.engineeringProfile,
    tracks: value.tracks.map((track) => track.fingerprint),
    totalOutputBytes: value.totalOutputBytes,
    eligibleForReview: value.eligibleForReview,
    findingCodes: value.findingCodes,
    createdAt: value.createdAt,
  });
}

test("verified CBR renders become private retail-track artifacts with independent engineering", async () => {
  await withFixture(async ({
    root,
    objectStore,
    registry,
    reference,
    plan,
    render,
  }) => {
    const observations = defaultObservations(plan, render);
    const first = await ingestAudiobookRetailTrackRender(
      objectStore,
      registry,
      {
        plan,
        render,
        approvedReferenceArtifact: reference,
        actorId: "retail_track_encoder_001",
        verifierActorId: "retail_track_verifier_001",
        engineering: engineeringPolicy(join(root, "engineering-1"), observations),
        now: t5,
      },
    );

    assert.equal(first.eligibleForReview, true);
    assert.deepEqual(first.findingCodes, []);
    assert.equal(first.tracks.length, 3);
    assert.deepEqual(
      first.tracks.map((track) => track.fileName),
      [
        "0001OpeningCredits.mp3",
        "0002Chapter0001.mp3",
        "0003ClosingCredits.mp3",
      ],
    );
    assert.deepEqual(
      first.tracks.map((track) => track.artifact.payload.kind),
      [
        "audiobook-retail-track",
        "audiobook-retail-track",
        "audiobook-retail-track",
      ],
    );
    assert.deepEqual(
      first.tracks.map((track) => track.artifact.payload.review.status),
      ["pending", "pending", "pending"],
    );
    assert.deepEqual(
      first.tracks.map((track) => track.engineering.candidateEligible),
      [true, true, true],
    );
    assert.doesNotThrow(() => assertAudiobookRetailTrackEncodeChain(first));
    assert.doesNotThrow(() =>
      assertAudiobookRetailTrackEncodeMatchesSources(first, {
        plan,
        render,
        approvedReferenceArtifact: reference,
      })
    );

    const records = await registry.list();
    assert.equal(records.length, 8);
    assert.equal(
      records.filter((record) => record.payload.kind === "audiobook-retail-track").length,
      3,
    );
    assert.equal(
      records.filter((record) => record.payload.kind === "audio-analysis").length,
      5,
    );

    const second = await ingestAudiobookRetailTrackRender(
      objectStore,
      registry,
      {
        plan,
        render,
        approvedReferenceArtifact: reference,
        actorId: "retail_track_encoder_001",
        verifierActorId: "retail_track_verifier_001",
        engineering: engineeringPolicy(join(root, "engineering-2"), observations),
        now: t5,
      },
    );
    assert.equal(second.fingerprint, first.fingerprint);
    assert.equal((await registry.list()).length, 8);

    const view = audiobookRetailTrackEncodePublicView(first);
    const serialised = JSON.stringify(view);
    assert.equal(view.trackCount, 3);
    assert.equal(view.eligibleForReview, true);
    for (const forbidden of [
      reference.id,
      reference.fingerprint,
      reference.integrity.contentHash,
      first.jobId,
      first.planManifest.payload.id,
      first.renderEvidence.payload.id,
      first.tracks[0]!.artifact.payload.id,
      first.tracks[0]!.engineering.ingest.envelope.payload.id,
      "retail_track_encoder_001",
      "/private/storyteller",
      "artifactId",
      "contentHash",
      "commandFingerprint",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
    }
  });
});

test("failed engineering quarantines only the affected MP3 while retaining verified evidence", async () => {
  await withFixture(async ({
    root,
    objectStore,
    registry,
    reference,
    plan,
    render,
  }) => {
    const observations = defaultObservations(plan, render);
    observations[1] = {
      ...observations[1]!,
      bitRateKbps: 128,
      rmsDb: -14,
      peakDb: 0,
      truePeakDb: 0.2,
      noiseFloorDb: -45,
    };
    const chain = await ingestAudiobookRetailTrackRender(
      objectStore,
      registry,
      {
        plan,
        render,
        approvedReferenceArtifact: reference,
        actorId: "retail_track_encoder_failure_001",
        verifierActorId: "retail_track_verifier_failure_001",
        engineering: engineeringPolicy(join(root, "engineering"), observations),
        now: t5,
      },
    );

    assert.equal(chain.eligibleForReview, false);
    assert.equal(chain.tracks[0]?.eligibleForReview, true);
    assert.equal(chain.tracks[1]?.eligibleForReview, false);
    assert.equal(chain.tracks[2]?.eligibleForReview, true);
    assert.equal(
      chain.tracks[1]?.artifact.payload.verification.status,
      "quarantined",
    );
    assert.equal(
      chain.tracks[1]?.engineering.ingest.envelope.payload.verification.status,
      "verified",
    );
    assert.equal(
      chain.tracks[1]?.findingCodes.includes(
        "AUDIOBOOK_RETAIL_TRACK_ENCODE_BIT_RATE_MISMATCH",
      ),
      true,
    );
    assert.equal(
      chain.findingCodes.includes(
        "AUDIOBOOK_RETAIL_TRACK_ENCODE_BIT_RATE_MISMATCH",
      ),
      true,
    );
    assert.doesNotThrow(() => assertAudiobookRetailTrackEncodeChain(chain));
  });
});

test("duration drift is measured independently and blocks review eligibility", async () => {
  await withFixture(async ({
    root,
    objectStore,
    registry,
    reference,
    plan,
    render,
  }) => {
    const observations = defaultObservations(plan, render);
    observations[2] = {
      ...observations[2]!,
      durationSeconds: 6.75,
    };
    const chain = await ingestAudiobookRetailTrackRender(
      objectStore,
      registry,
      {
        plan,
        render,
        approvedReferenceArtifact: reference,
        actorId: "retail_track_encoder_drift_001",
        verifierActorId: "retail_track_verifier_drift_001",
        engineering: engineeringPolicy(join(root, "engineering"), observations),
        maximumDurationDriftMs: 250,
        now: t5,
      },
    );

    assert.equal(chain.tracks[2]?.durationDriftMs, 750);
    assert.equal(chain.tracks[2]?.eligibleForReview, false);
    assert.equal(
      chain.tracks[2]?.findingCodes.includes(
        "AUDIOBOOK_RETAIL_TRACK_ENCODE_DURATION_DRIFT",
      ),
      true,
    );
    assert.equal(
      chain.tracks[2]?.artifact.payload.verification.status,
      "quarantined",
    );
  });
});

test("wrong reference scope, expired rights, altered bytes and aborts fail before admission", async () => {
  await withFixture(async ({
    root,
    objectStore,
    registry,
    reference,
    plan,
    render,
  }) => {
    const observations = defaultObservations(plan, render);
    const otherReference = approvedReference({ suffix: "999" });
    await assert.rejects(
      ingestAudiobookRetailTrackRender(objectStore, registry, {
        plan,
        render,
        approvedReferenceArtifact: otherReference,
        actorId: "retail_track_encoder_scope_001",
        engineering: engineeringPolicy(join(root, "engineering-scope"), observations),
        now: t5,
      }),
      /AUDIOBOOK_RETAIL_TRACK_ENCODE_REFERENCE_MISMATCH/u,
    );
    assert.equal((await registry.list()).length, 0);

    const changedBytes = new Uint8Array(render.tracks[0]!.bytes);
    changedBytes[changedBytes.length - 1] = changedBytes.at(-1)! ^ 0xff;
    const altered: AudiobookRetailTrackRenderResult = Object.freeze({
      evidence: render.evidence,
      tracks: Object.freeze([
        Object.freeze({
          fileName: render.tracks[0]!.fileName,
          bytes: changedBytes,
        }),
        ...render.tracks.slice(1),
      ]),
    });
    await assert.rejects(
      ingestAudiobookRetailTrackRender(objectStore, registry, {
        plan,
        render: altered,
        approvedReferenceArtifact: reference,
        actorId: "retail_track_encoder_bytes_001",
        engineering: engineeringPolicy(join(root, "engineering-bytes"), observations),
        now: t5,
      }),
      /AUDIOBOOK_RETAIL_TRACK_RENDER_RESULT_INTEGRITY_MISMATCH/u,
    );
    assert.equal((await registry.list()).length, 0);

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      ingestAudiobookRetailTrackRender(objectStore, registry, {
        plan,
        render,
        approvedReferenceArtifact: reference,
        actorId: "retail_track_encoder_abort_001",
        engineering: engineeringPolicy(join(root, "engineering-abort"), observations),
        now: t5,
        signal: controller.signal,
      }),
      /AUDIOBOOK_RETAIL_TRACK_ENCODE_ABORTED/u,
    );
    assert.equal((await registry.list()).length, 0);
  });

  await withFixture(async ({
    root,
    objectStore,
    registry,
    reference,
    plan,
    render,
  }) => {
    await assert.rejects(
      ingestAudiobookRetailTrackRender(objectStore, registry, {
        plan,
        render,
        approvedReferenceArtifact: reference,
        actorId: "retail_track_encoder_rights_001",
        engineering: engineeringPolicy(
          join(root, "engineering"),
          defaultObservations(plan, render),
        ),
        now: t5,
      }),
      /AUDIOBOOK_RETAIL_TRACK_ENCODE_RIGHTS_EXPIRED/u,
    );
    assert.equal((await registry.list()).length, 0);
  }, {
    suffix: "expired",
    rights: rights({ expiresAt: "2026-07-28T00:00:04.500Z" }),
  });
});

test("recomputed structural state cannot replace the approved plan identity", async () => {
  await withFixture(async ({
    root,
    objectStore,
    registry,
    reference,
    plan,
    render,
  }) => {
    const chain = await ingestAudiobookRetailTrackRender(
      objectStore,
      registry,
      {
        plan,
        render,
        approvedReferenceArtifact: reference,
        actorId: "retail_track_encoder_tamper_001",
        engineering: engineeringPolicy(
          join(root, "engineering"),
          defaultObservations(plan, render),
        ),
        now: t5,
      },
    );
    const { fingerprint: _fingerprint, ...base } = chain;
    const changedBase: Omit<AudiobookRetailTrackEncodeChain, "fingerprint"> = {
      ...base,
      planId: "retail_track_plan_structurally_valid_but_wrong_001",
    };
    const changed = Object.freeze({
      ...changedBase,
      fingerprint: encodeChainFingerprint(changedBase),
    });

    assert.doesNotThrow(() => assertAudiobookRetailTrackEncodeChain(changed));
    assert.throws(
      () => assertAudiobookRetailTrackEncodeMatchesSources(changed, {
        plan,
        render,
        approvedReferenceArtifact: reference,
      }),
      /AUDIOBOOK_RETAIL_TRACK_ENCODE_SOURCE_MISMATCH/u,
    );
  });
});
