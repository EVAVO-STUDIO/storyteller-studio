import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertAudiobookReferenceMasterChain,
  audiobookReferenceMasterPublicView,
  ingestAudiobookReferenceMaster,
  type AudiobookReferenceMasterChain,
} from "./audiobook-reference-master.js";
import {
  renderAudiobookSequence,
  type AudiobookRenderResult,
  type AudiobookSourceResolver,
  type ResolvedAudiobookSource,
} from "./audiobook-render.js";
import type {
  AudiobookSequence,
  AudiobookSequenceArtifactSnapshot,
  AudiobookSequenceComponent,
} from "./audiobook-sequence.js";
import type {
  ArtifactRecord,
  ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import { FileArtifactRegistry } from "./artifact-store.js";
import type {
  AudioEngineeringCommand,
  AudioEngineeringCommandResult,
  AudioEngineeringRunner,
} from "./audio-engineering.js";
import type {
  ChapterRenderRequest,
  ChapterRenderRunner,
} from "./chapter-render.js";
import {
  createGenerationAudioEngineeringPolicy,
  type GenerationAudioEngineeringPolicy,
} from "./generation-audio-engineering.js";
import {
  ACX_AUDIOBOOK_PROFILE,
  stableHash,
} from "./index.js";
import { FilePrivateObjectStore } from "./private-object-store.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-28T00:00:00.000Z");
const t1 = new Date("2026-07-28T00:00:01.000Z");
const t2 = new Date("2026-07-28T00:00:02.000Z");
const output = Object.freeze({
  format: "wav" as const,
  sampleRateHz: 44_100,
  channels: 1 as const,
  bitDepth: 24 as const,
});

function wavBytes(seed = 1): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x08, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    seed, 0x01, 0x02, 0x03,
  ]);
}

function commandResult(
  stdout = "",
  stderr = "",
): AudioEngineeringCommandResult {
  return { exitCode: 0, stdout, stderr, durationMs: 5 };
}

class ReferenceEngineeringRunner implements AudioEngineeringRunner {
  constructor(
    readonly durationSeconds = 71,
    readonly loud = false,
    readonly failing = false,
  ) {}

  async run(
    command: AudioEngineeringCommand,
  ): Promise<AudioEngineeringCommandResult> {
    if (this.failing) {
      throw new Error("private engineering diagnostic must not escape");
    }
    switch (command.stage) {
      case "ffprobe-version":
        return commandResult("ffprobe version 7.1\n");
      case "ffmpeg-version":
        return commandResult("ffmpeg version 7.1\n");
      case "probe":
        return commandResult(JSON.stringify({
streams: [{
  codec_type: "audio",
  codec_name: "pcm_s24le",
  sample_rate: "44100",
  channels: 1,
  bit_rate: "192000",
  duration: String(this.durationSeconds),
}],
format: {
  format_name: "wav",
  duration: String(this.durationSeconds),
  bit_rate: "192000",
  size: String(wavBytes().byteLength),
},
        }));
      case "astats":
        return commandResult([
`lavfi.astats.Overall.RMS_level=${this.loud ? -14 : -20}`,
`lavfi.astats.Overall.Peak_level=${this.loud ? 0 : -4}`,
`lavfi.astats.Overall.Noise_floor=${this.loud ? -45 : -65}`,
`lavfi.astats.Overall.Peak_count=${this.loud ? 12 : 0}`,
        ].join("\n"));
      case "loudnorm":
        return commandResult("", JSON.stringify({
input_i: this.loud ? "-14" : "-20",
input_tp: this.loud ? "0.2" : "-4.2",
input_lra: "4",
input_thresh: "-30",
target_offset: "0",
        }));
      case "silence":
        return commandResult("", [
"silence_start: 0",
"silence_end: 1 | silence_duration: 1",
`silence_start: ${this.durationSeconds - 1}`,
`silence_end: ${this.durationSeconds} | silence_duration: 1`,
        ].join("\n"));
    }
  }
}

class ReferenceSourceResolver implements AudiobookSourceResolver {
  readonly disposed: string[] = [];

  async resolve(
    snapshot: AudiobookSequenceArtifactSnapshot,
  ): Promise<ResolvedAudiobookSource> {
    return {
      artifactId: snapshot.id,
      privatePath: `/private/storyteller/${snapshot.id}.wav`,
      contentHash: snapshot.contentHash,
      byteCount: snapshot.byteCount,
      dispose: async () => {
        this.disposed.push(snapshot.id);
      },
    };
  }
}

class ReferenceRenderRunner implements ChapterRenderRunner {
  request?: ChapterRenderRequest;

  constructor(readonly bytes: Uint8Array = wavBytes()) {}

  async inspectVersion(): Promise<string> {
    return "ffmpeg version 7.1 fixture";
  }

  async render(request: ChapterRenderRequest): Promise<Uint8Array> {
    this.request = request;
    return this.bytes;
  }
}

function artifact(
  id: string,
  kind: "credit-master" | "mastered-chapter",
  fingerprintCharacter: string,
  contentCharacter: string,
): AudiobookSequenceArtifactSnapshot {
  return Object.freeze({
    id,
    kind,
    revision: 3,
    fingerprint: fingerprintCharacter.repeat(64),
    contentHash: contentCharacter.repeat(64),
    byteCount: 240_000 + Number.parseInt(fingerprintCharacter, 16),
  });
}

function component(input: Readonly<{
  ordinal: number;
  role: AudiobookSequenceComponent["role"];
  title: string;
  durationMs: number;
  startMs: number;
  artifact: AudiobookSequenceArtifactSnapshot;
  sourceFingerprint: string;
}>): AudiobookSequenceComponent {
  const partial: Omit<AudiobookSequenceComponent, "fingerprint"> = {
    ordinal: input.ordinal,
    role: input.role,
    title: input.title,
    durationMs: input.durationMs,
    startMs: input.startMs,
    endMs: input.startMs + input.durationMs,
    artifact: input.artifact,
    sourceFingerprint: input.sourceFingerprint,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
}

function sequence(
  engineeringProfileFingerprint: string,
): AudiobookSequence {
  const opening = component({
    ordinal: 1,
    role: "opening-credit",
    title: "Opening credit",
    durationMs: 5_000,
    startMs: 0,
    artifact: artifact(
      "artifact_reference_opening_001",
      "credit-master",
      "1",
      "4",
    ),
    sourceFingerprint: "7".repeat(64),
  });
  const chapter = component({
    ordinal: 2,
    role: "chapter",
    title: "Chapter One",
    durationMs: 60_000,
    startMs: opening.endMs,
    artifact: artifact(
      "artifact_reference_chapter_001",
      "mastered-chapter",
      "2",
      "5",
    ),
    sourceFingerprint: "8".repeat(64),
  });
  const closing = component({
    ordinal: 3,
    role: "closing-credit",
    title: "Closing credit",
    durationMs: 6_000,
    startMs: chapter.endMs,
    artifact: artifact(
      "artifact_reference_closing_001",
      "credit-master",
      "3",
      "6",
    ),
    sourceFingerprint: "9".repeat(64),
  });
  const partial: Omit<AudiobookSequence, "fingerprint"> = {
    schemaVersion: "storyteller-audiobook-sequence-v1",
    id: "audiobook_reference_sequence_001",
    projectId: "project_audiobook_reference_001",
    bookId: "book_audiobook_reference_001",
    title: "Reference Master Fixture",
    languageTag: "en-AU",
    chapterSequenceFingerprint: "b".repeat(64),
    openingDeliveryFingerprint: "c".repeat(64),
    closingDeliveryFingerprint: "d".repeat(64),
    rightsFingerprint: "a".repeat(64),
    engineeringProfileFingerprint,
    output,
    components: Object.freeze([opening, chapter, closing]),
    chapterCount: 1,
    totalDurationMs: closing.endMs,
    status: "ready-for-retail-encoding",
    createdByActorId: "owner_audiobook_reference_001",
    revision: 1,
    createdAt: t0.toISOString(),
    updatedAt: t0.toISOString(),
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
}

function policy(
  temporaryRoot: string,
  runner: AudioEngineeringRunner,
): GenerationAudioEngineeringPolicy {
  return createGenerationAudioEngineeringPolicy({
    profile: ACX_AUDIOBOOK_PROFILE,
    externalVersion: "acx-2026-07",
    reviewedAt: "2026-07-27T00:00:00.000Z",
    sourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner,
    ffprobePath: "/opt/media/ffprobe",
    ffmpegPath: "/opt/media/ffmpeg",
    timeoutMs: 30_000,
    maximumOutputBytes: 2 * 1024 * 1024,
    temporaryRoot,
    now: t0,
  });
}

function rights(
  overrides: Partial<ArtifactRightsSnapshot> = {},
): ArtifactRightsSnapshot {
  return {
    rightsEvidenceId: "rights_audiobook_reference_001",
    rightsFingerprint: "a".repeat(64),
    allowedUses: ["audiobook"],
    commercialUseApproved: true,
    expiresAt: "2028-07-28T00:00:00.000Z",
    retainUntil: "2033-07-28T00:00:00.000Z",
    deletionRequiredAt: "2034-07-28T00:00:00.000Z",
    ...overrides,
  };
}

function withSequenceFingerprint(
  value: AudiobookSequence,
  updates: Partial<Omit<AudiobookSequence, "fingerprint">>,
): AudiobookSequence {
  const { fingerprint: _fingerprint, ...base } = value;
  const partial: Omit<AudiobookSequence, "fingerprint"> = {
    ...base,
    ...updates,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
}

async function renderFixture(
  value: AudiobookSequence,
  bytes = wavBytes(),
): Promise<AudiobookRenderResult> {
  return await renderAudiobookSequence({
    sequence: value,
    sources: new ReferenceSourceResolver(),
    runner: new ReferenceRenderRunner(bytes),
    renderedAt: t1,
    maximumOutputBytes: 100_000_000,
  });
}

async function withStores(
  run: (input: Readonly<{
    root: string;
    temporaryRoot: string;
    objectStore: FilePrivateObjectStore;
    registry: FileArtifactRegistry;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(
    join(tmpdir(), "storyteller-audiobook-reference-master-"),
  );
  try {
    const temporaryRoot = join(root, "temporary");
    await run({
      root,
      temporaryRoot,
      objectStore: new FilePrivateObjectStore(join(root, "objects")),
      registry: new FileArtifactRegistry(
        new FileProjectStore(join(root, "registry")),
      ),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("eligible complete-book render creates a governed reference master and evidence graph", async () => {
  await withStores(async ({
    temporaryRoot,
    objectStore,
    registry,
  }) => {
    const engineering = policy(
      temporaryRoot,
      new ReferenceEngineeringRunner(),
    );
    const plan = sequence(engineering.profile.fingerprint);
    const render = await renderFixture(plan);
    const chain = await ingestAudiobookReferenceMaster(
      objectStore,
      registry,
      {
        sequence: plan,
        render,
        rights: rights(),
        actorId: "worker_audiobook_reference_001",
        verifierActorId: "verifier_audiobook_reference_001",
        engineering,
        now: t2,
      },
    );

    assert.equal(chain.eligibleForReview, true);
    assert.deepEqual(chain.findingCodes, []);
    assert.equal(
      chain.sequenceManifest.payload.kind,
      "audio-analysis",
    );
    assert.equal(chain.renderEvidence.payload.kind, "audio-analysis");
    assert.equal(
      chain.referenceMaster.payload.kind,
      "audiobook-reference-master",
    );
    assert.equal(
      chain.postRenderEngineering.ingest.envelope.payload.kind,
      "audio-analysis",
    );
    assert.equal(
      chain.referenceMaster.payload.verification.status,
      "verified",
    );
    assert.equal(chain.referenceMaster.payload.review.status, "pending");
    assert.deepEqual(
      chain.referenceMaster.payload.provenance.parentArtifactIds,
      [
        chain.sequenceManifest.payload.id,
        chain.renderEvidence.payload.id,
      ],
    );
    assert.deepEqual(
      chain.postRenderEngineering.ingest.envelope.payload.provenance
        .parentArtifactIds,
      [chain.referenceMaster.payload.id],
    );
    assert.equal(
      chain.postRenderEngineering.evidence.inputContentHash,
      chain.referenceMaster.payload.integrity.contentHash,
    );
    assert.equal(
      chain.postRenderEngineering.evidence.inputByteCount,
      chain.referenceMaster.payload.integrity.byteCount,
    );
    assert.equal((await registry.list()).length, 4);
    assert.doesNotThrow(() =>
      assertAudiobookReferenceMasterChain(chain)
    );

    const view = audiobookReferenceMasterPublicView(chain);
    const serialised = JSON.stringify(view);
    assert.equal(view.eligibleForReview, true);
    for (const forbidden of [
      temporaryRoot,
      "/opt/media/ffprobe",
      "/opt/media/ffmpeg",
      "acx-audio-submission-requirements-reviewed-2026-07",
      "rights_audiobook_reference_001",
      "worker_audiobook_reference_001",
      "verifier_audiobook_reference_001",
      chain.sequenceManifest.payload.id,
      chain.renderEvidence.payload.id,
      ...plan.components.map((entry) => entry.artifact.id),
    ]) {
      assert.equal(serialised.includes(forbidden), false);
    }
  });
});

test("independent engineering failure quarantines the WAV while retaining evidence", async () => {
  await withStores(async ({
    temporaryRoot,
    objectStore,
    registry,
  }) => {
    const engineering = policy(
      temporaryRoot,
      new ReferenceEngineeringRunner(71, true),
    );
    const plan = sequence(engineering.profile.fingerprint);
    const chain = await ingestAudiobookReferenceMaster(
      objectStore,
      registry,
      {
        sequence: plan,
        render: await renderFixture(plan),
        rights: rights(),
        actorId: "worker_audiobook_reference_002",
        verifierActorId: "verifier_audiobook_reference_002",
        engineering,
        now: t2,
      },
    );

    assert.equal(chain.eligibleForReview, false);
    assert.equal(
      chain.referenceMaster.payload.verification.status,
      "quarantined",
    );
    assert.equal(
      chain.referenceMaster.payload.quarantine?.code,
      "AUDIOBOOK_REFERENCE_MASTER_ENGINEERING_INELIGIBLE",
    );
    for (const code of [
      "AUDIO_RMS_OUT_OF_RANGE",
      "AUDIO_PEAK_TOO_HIGH",
      "AUDIO_NOISE_FLOOR_TOO_HIGH",
      "AUDIO_CLIPPING_DETECTED",
    ]) {
      assert.equal(chain.findingCodes.includes(code), true);
    }
    assert.equal(
      chain.postRenderEngineering.ingest.envelope.payload
        .verification.status,
      "verified",
    );
    assert.equal((await registry.list()).length, 4);
    assert.doesNotThrow(() =>
      assertAudiobookReferenceMasterChain(chain)
    );
  });
});

test("duration drift is a separate complete-book quarantine gate", async () => {
  await withStores(async ({
    temporaryRoot,
    objectStore,
    registry,
  }) => {
    const engineering = policy(
      temporaryRoot,
      new ReferenceEngineeringRunner(72),
    );
    const plan = sequence(engineering.profile.fingerprint);
    const chain = await ingestAudiobookReferenceMaster(
      objectStore,
      registry,
      {
        sequence: plan,
        render: await renderFixture(plan),
        rights: rights(),
        actorId: "worker_audiobook_reference_003",
        verifierActorId: "verifier_audiobook_reference_003",
        engineering,
        maximumDurationDriftMs: 250,
        now: t2,
      },
    );

    assert.equal(
      chain.postRenderEngineering.candidateEligible,
      true,
    );
    assert.equal(chain.durationDriftMs, 1_000);
    assert.equal(chain.eligibleForReview, false);
    assert.equal(
      chain.findingCodes.includes(
        "AUDIOBOOK_REFERENCE_MASTER_DURATION_DRIFT",
      ),
      true,
    );
    assert.equal(
      chain.referenceMaster.payload.verification.status,
      "quarantined",
    );
  });
});

test("identical retries reuse the exact four-artifact reference chain", async () => {
  await withStores(async ({
    temporaryRoot,
    objectStore,
    registry,
  }) => {
    const engineering = policy(
      temporaryRoot,
      new ReferenceEngineeringRunner(),
    );
    const plan = sequence(engineering.profile.fingerprint);
    const render = await renderFixture(plan);
    const input = {
      sequence: plan,
      render,
      rights: rights(),
      actorId: "worker_audiobook_reference_004",
      verifierActorId: "verifier_audiobook_reference_004",
      engineering,
      now: t2,
    } as const;

    const first = await ingestAudiobookReferenceMaster(
      objectStore,
      registry,
      input,
    );
    const second = await ingestAudiobookReferenceMaster(
      objectStore,
      registry,
      input,
    );

    assert.equal(second.fingerprint, first.fingerprint);
    assert.equal(
      second.referenceMaster.payload.id,
      first.referenceMaster.payload.id,
    );
    assert.equal(
      second.referenceMaster.revision,
      first.referenceMaster.revision,
    );
    assert.equal(
      second.postRenderEngineering.ingest.envelope.revision,
      first.postRenderEngineering.ingest.envelope.revision,
    );
    assert.equal((await registry.list()).length, 4);
  });
});

test("scope, rights, bytes, tolerance and abort failures occur before artifact admission", async () => {
  await withStores(async ({
    temporaryRoot,
    objectStore,
    registry,
  }) => {
    const engineering = policy(
      temporaryRoot,
      new ReferenceEngineeringRunner(),
    );
    const plan = sequence(engineering.profile.fingerprint);
    const render = await renderFixture(plan);
    const wrongProfile = withSequenceFingerprint(plan, {
      engineeringProfileFingerprint: "f".repeat(64),
    });

    await assert.rejects(
      ingestAudiobookReferenceMaster(objectStore, registry, {
        sequence: wrongProfile,
        render: await renderFixture(wrongProfile),
        rights: rights(),
        actorId: "worker_audiobook_reference_005",
        engineering,
        now: t2,
      }),
      /AUDIOBOOK_REFERENCE_MASTER_ENGINEERING_PROFILE_MISMATCH/u,
    );
    await assert.rejects(
      ingestAudiobookReferenceMaster(objectStore, registry, {
        sequence: plan,
        render,
        rights: rights({
expiresAt: "2026-07-27T00:00:00.000Z",
        }),
        actorId: "worker_audiobook_reference_005",
        engineering,
        now: t2,
      }),
      /AUDIOBOOK_REFERENCE_MASTER_RIGHTS_EXPIRED/u,
    );
    const changedBytes = new Uint8Array(render.bytes);
    const lastByteIndex = changedBytes.length - 1;
    changedBytes[lastByteIndex] = changedBytes[lastByteIndex]! ^ 0xff;
    await assert.rejects(
      ingestAudiobookReferenceMaster(objectStore, registry, {
        sequence: plan,
        render: { evidence: render.evidence, bytes: changedBytes },
        rights: rights(),
        actorId: "worker_audiobook_reference_005",
        engineering,
        now: t2,
      }),
      /AUDIOBOOK_REFERENCE_MASTER_RENDER_OUTPUT_MISMATCH/u,
    );
    await assert.rejects(
      ingestAudiobookReferenceMaster(objectStore, registry, {
        sequence: plan,
        render,
        rights: rights(),
        actorId: "worker_audiobook_reference_005",
        engineering,
        maximumDurationDriftMs: 10_001,
        now: t2,
      }),
      /AUDIOBOOK_REFERENCE_MASTER_DURATION_TOLERANCE_INVALID/u,
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      ingestAudiobookReferenceMaster(objectStore, registry, {
        sequence: plan,
        render,
        rights: rights(),
        actorId: "worker_audiobook_reference_005",
        engineering,
        now: t2,
        signal: controller.signal,
      }),
      /AUDIOBOOK_REFERENCE_MASTER_ABORTED/u,
    );
    assert.equal((await registry.list()).length, 0);
  });
});

test("semantic artifact-chain tampering is rejected even when hashes are recomputed", async () => {
  await withStores(async ({
    temporaryRoot,
    objectStore,
    registry,
  }) => {
    const engineering = policy(
      temporaryRoot,
      new ReferenceEngineeringRunner(),
    );
    const plan = sequence(engineering.profile.fingerprint);
    const chain = await ingestAudiobookReferenceMaster(
      objectStore,
      registry,
      {
        sequence: plan,
        render: await renderFixture(plan),
        rights: rights(),
        actorId: "worker_audiobook_reference_006",
        verifierActorId: "verifier_audiobook_reference_006",
        engineering,
        now: t2,
      },
    );

    const original = chain.referenceMaster.payload;
    const { fingerprint: _fingerprint, ...recordBase } = original;
    const alteredRecordBase = {
      ...recordBase,
      provenance: {
        ...original.provenance,
        parentArtifactIds: Object.freeze([
chain.sequenceManifest.payload.id,
        ]),
      },
    };
    const alteredRecord: ArtifactRecord = {
      ...alteredRecordBase,
      fingerprint: stableHash(alteredRecordBase),
    };
    const alteredEnvelope = {
      ...chain.referenceMaster,
      payload: alteredRecord,
      contentHash: stableHash(alteredRecord),
    };
    const altered = {
      ...chain,
      referenceMaster: alteredEnvelope,
    } as AudiobookReferenceMasterChain;

    assert.throws(
      () => assertAudiobookReferenceMasterChain(altered),
      /AUDIOBOOK_REFERENCE_MASTER_EVIDENCE_CHAIN_MISMATCH/u,
    );
  });
});
