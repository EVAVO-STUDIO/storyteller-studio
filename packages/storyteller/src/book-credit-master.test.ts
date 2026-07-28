import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  analyseAudioEngineering,
  type AudioEngineeringCommand,
  type AudioEngineeringCommandResult,
  type AudioEngineeringRunner,
} from "./audio-engineering.js";
import { ingestPrivateArtifact } from "./artifact-ingest.js";
import type { ArtifactRecord, ArtifactRightsSnapshot } from "./artifact-registry.js";
import { FileArtifactRegistry } from "./artifact-store.js";
import {
  approveBookCreditScript,
  createBookCreditPolicy,
  createBookCreditScript,
  recordBookCreditReview,
} from "./book-credit-script.js";
import { createBookCreditGenerationPlan } from "./book-credit-generation.js";
import {
  admitBookCreditTake,
  createBookCreditTranscriptEvidence,
} from "./book-credit-take.js";
import {
  approveBookCreditTakeSelection,
  createBookCreditTakeReviewSession,
  recordBookCreditTakeReview,
  selectBookCreditTake,
  type BookCreditTakeReviewScores,
} from "./book-credit-take-review.js";
import {
  assertBookCreditMasterChain,
  bookCreditMasterPublicView,
  promoteBookCreditMaster,
} from "./book-credit-master.js";
import {
  PRODUCTION_CALIBRATION_LOCK_SCHEMA_VERSION,
  type ProductionCalibrationLock,
} from "./calibration-admission.js";
import { ACX_AUDIOBOOK_PROFILE, stableHash } from "./index.js";
import { FilePrivateObjectStore } from "./private-object-store.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:00:01.000Z");
const t2 = new Date("2026-07-27T00:00:02.000Z");
const t3 = new Date("2026-07-27T00:00:03.000Z");
const t4 = new Date("2026-07-27T00:00:04.000Z");
const t5 = new Date("2026-07-27T00:00:05.000Z");
const t6 = new Date("2026-07-27T00:00:06.000Z");
const t7 = new Date("2026-07-27T00:00:07.000Z");
const t8 = new Date("2026-07-27T00:00:08.000Z");
const t9 = new Date("2026-07-27T00:00:09.000Z");
const t10 = new Date("2026-07-27T00:00:10.000Z");
const t11 = new Date("2026-07-27T00:00:11.000Z");
const t12 = new Date("2026-07-27T00:00:12.000Z");
const t13 = new Date("2026-07-27T00:00:13.000Z");
const creditText = "The North Water, written by Ian McGuire, narrated by EVAVO Narrator.";

const rights: ArtifactRightsSnapshot = Object.freeze({
  rightsEvidenceId: "rights_credit_master_001",
  rightsFingerprint: "a".repeat(64),
  allowedUses: Object.freeze(["audiobook"] as const),
  commercialUseApproved: true,
  expiresAt: "2028-07-27T00:00:00.000Z",
  retainUntil: "2033-07-27T00:00:00.000Z",
  deletionRequiredAt: "2034-07-27T00:00:00.000Z",
});

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function wavBytes(seed: number): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x08, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    seed, 0x01, 0x02, 0x03,
  ]);
}

function creditPolicy() {
  return createBookCreditPolicy({
    id: "credit_master_policy_001",
    version: "2026.07",
    languageTag: "en-AU",
    reviewedAt: "2026-07-01T00:00:00.000Z",
    sourceReference: "Reviewed EVAVO audiobook credit policy.",
    maximumWords: 120,
    templates: [
      {
        kind: "opening",
        projectKind: "standalone",
        text: "{title}, written by {authorCredit}, narrated by {narratorCredit}.",
        requiredTokens: ["title", "authorCredit", "narratorCredit"],
      },
      {
        kind: "closing",
        projectKind: "standalone",
        text: "You have been listening to {title}, written by {authorCredit}, narrated by {narratorCredit}. {copyrightNotice}",
        requiredTokens: ["title", "authorCredit", "narratorCredit", "copyrightNotice"],
      },
      {
        kind: "opening",
        projectKind: "series",
        text: "{title}, volume {volumeNumber} of {seriesTitle}, written by {authorCredit}, narrated by {narratorCredit}.",
        requiredTokens: ["title", "seriesTitle", "volumeNumber", "authorCredit", "narratorCredit"],
      },
      {
        kind: "closing",
        projectKind: "series",
        text: "You have been listening to {title}, volume {volumeNumber} of {seriesTitle}, written by {authorCredit}, narrated by {narratorCredit}. {copyrightNotice}",
        requiredTokens: ["title", "seriesTitle", "volumeNumber", "authorCredit", "narratorCredit", "copyrightNotice"],
      },
    ],
    now: t0,
  });
}

function approvedScript() {
  let script = createBookCreditScript({
    id: "credit_master_script_001",
    projectId: "project_credit_master_001",
    kind: "opening",
    metadata: {
      bookId: "book_credit_master_001",
      title: "The North Water",
      projectKind: "standalone",
      authorCredit: "Ian McGuire",
      narratorCredit: "EVAVO Narrator",
      copyrightNotice: "Copyright 2026 Rights Holder.",
    },
    policy: creditPolicy(),
    createdAt: t0,
  });
  script = recordBookCreditReview(script, {
    id: "credit_master_script_editorial_001",
    role: "editorial",
    reviewerId: "credit_master_script_editor_001",
    decision: "approve",
    checks: [
      "title-exact",
      "author-credit-exact",
      "narrator-credit-exact",
      "pronunciations-confirmed",
    ],
    decidedAt: t1,
  });
  script = recordBookCreditReview(script, {
    id: "credit_master_script_rights_001",
    role: "rights",
    reviewerId: "credit_master_script_rights_reviewer_001",
    decision: "approve",
    checks: [
      "copyright-notice-confirmed",
      "credit-entitlements-confirmed",
      "commercial-use-confirmed",
    ],
    decidedAt: t2,
  });
  return approveBookCreditScript(script, {
    finalConfirmationId: "credit_master_script_confirmation_001",
    approvedByActorId: "credit_master_script_owner_001",
    humanConfirmation: true,
    approvedAt: t3,
  });
}

function calibrationLock(): ProductionCalibrationLock {
  const base = {
    schemaVersion: PRODUCTION_CALIBRATION_LOCK_SCHEMA_VERSION,
    sessionId: "calibration_credit_master_001",
    sessionRevision: 7,
    sessionFingerprint: "1".repeat(64),
    approvalFingerprint: "2".repeat(64),
    assessmentFingerprint: "3".repeat(64),
    projectId: "project_credit_master_001",
    voiceProfileId: "voice_credit_master_001",
    voiceRevision: 4,
    providerId: "elevenlabs",
    modelId: "eleven_multilingual_v2",
    capabilityFingerprint: "4".repeat(64),
    selectedTakeCount: 3,
    selectedTakeSetFingerprint: "5".repeat(64),
    approvedAt: t3.toISOString(),
  } as const;
  return Object.freeze({
    ...base,
    lockFingerprint: stableHash({ ...base, seriesId: null }),
  });
}

function generationPlan() {
  return createBookCreditGenerationPlan({
    id: "credit_master_generation_plan_001",
    jobId: "job_credit_master_001",
    script: approvedScript(),
    calibrationLock: calibrationLock(),
    candidateCount: 2,
    direction: {
      narrativeDistance: "formal",
      pace: 0.94,
      intensity: 0.24,
      warmth: 0.58,
      restraint: 0.9,
      clarity: 0.98,
      pauseBeforeMs: 250,
      pauseAfterMs: 500,
      emotionalObjective: "State the approved credit text clearly and exactly.",
      subtext: "Professional, calm and restrained.",
      notes: ["Do not add or omit any word."],
    },
    pronunciations: [{
      writtenForm: "EVAVO",
      spokenForm: "ee vah voh",
      approvedRevision: 2,
    }],
    rights,
    costPolicy: { currency: "USD", maximumTotalEstimatedCost: 2 },
    format: "wav",
    sampleRateHz: 44_100,
    createdAt: t4,
  });
}

function commandResult(stdout = "", stderr = ""): AudioEngineeringCommandResult {
  return Object.freeze({ exitCode: 0, stdout, stderr, durationMs: 5 });
}

class EngineeringRunner implements AudioEngineeringRunner {
  constructor(readonly byteCount: number) {}

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
            sample_rate: "44100",
            channels: 1,
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
          "lavfi.astats.Overall.RMS_level=-20",
          "lavfi.astats.Overall.Peak_level=-4",
          "lavfi.astats.Overall.Noise_floor=-65",
          "lavfi.astats.Overall.Peak_count=0",
        ].join("\n"));
      case "loudnorm":
        return commandResult("", JSON.stringify({
          input_i: "-20.1",
          input_tp: "-4.2",
          input_lra: "4.1",
          input_thresh: "-30",
          target_offset: "0.1",
        }));
      case "silence":
        return commandResult("", [
          "[silencedetect] silence_start: 0",
          "[silencedetect] silence_end: 1.2 | silence_duration: 1.2",
          "[silencedetect] silence_start: 9",
          "[silencedetect] silence_end: 10 | silence_duration: 1",
        ].join("\n"));
    }
  }
}

async function engineeringEvidence(bytes: Uint8Array) {
  return await analyseAudioEngineering({
    audioPath: "/private/book-credit-master.wav",
    inputContentHash: hashBytes(bytes),
    inputByteCount: bytes.byteLength,
    profile: ACX_AUDIOBOOK_PROFILE,
    profileVersion: "acx-2026-07",
    profileReviewedAt: "2026-07-26T00:00:00.000Z",
    profileSourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner: new EngineeringRunner(bytes.byteLength),
    now: t6,
  });
}

const reviewScores: BookCreditTakeReviewScores = Object.freeze({
  wordingFidelity: 5,
  pronunciation: 5,
  diction: 5,
  pacing: 4,
  tone: 5,
  boundaryCleanliness: 5,
  technicalComfort: 5,
  narratorConsistency: 5,
});

async function withStores<T>(run: (input: Readonly<{
  root: string;
  objectStore: FilePrivateObjectStore;
  registry: FileArtifactRegistry;
}>) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-credit-master-"));
  try {
    const projectStore = new FileProjectStore(join(root, "metadata"));
    return await run({
      root,
      objectStore: new FilePrivateObjectStore(join(root, "objects"), {
        maximumBytes: 10 * 1024 * 1024,
      }),
      registry: new FileArtifactRegistry(projectStore),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function ingestCandidate(input: Readonly<{
  objectStore: FilePrivateObjectStore;
  registry: FileArtifactRegistry;
  index: number;
  bytes: Uint8Array;
}>) {
  const plan = generationPlan();
  const takeId = `take_credit_master_00${input.index}`;
  const audio = await ingestPrivateArtifact(input.objectStore, input.registry, {
    id: `artifact_credit_master_audio_00${input.index}`,
    kind: "audio-candidate",
    projectId: plan.projectId,
    jobId: plan.job.id,
    segmentId: plan.job.segmentId,
    takeId,
    bytes: input.bytes,
    claimedMimeType: "audio/wav",
    claimedFormat: "wav",
    provenance: {
      createdByActorId: "credit_master_worker_001",
      sourceContentHash: plan.script.textHash,
      generationRequestHash: plan.job.cacheKey,
      providerId: "elevenlabs",
      adapterVersion: "1.0.0",
      providerRequestId: `private-credit-master-request-${input.index}`,
      parentArtifactIds: [],
    },
    rights,
    reviewRequired: true,
    actorId: "credit_master_worker_001",
    verifierActorId: "credit_master_verifier_001",
    now: t5,
  });
  assert.equal(audio.accepted, true);

  const transcriptEvidence = createBookCreditTranscriptEvidence({
    sourceText: plan.script.text,
    observedText: plan.script.text,
    assessedAt: t6,
  });
  const transcript = await ingestPrivateArtifact(input.objectStore, input.registry, {
    id: `artifact_credit_master_transcript_00${input.index}`,
    kind: "transcript",
    projectId: plan.projectId,
    jobId: plan.job.id,
    segmentId: plan.job.segmentId,
    takeId,
    bytes: new TextEncoder().encode(plan.script.text),
    claimedMimeType: "text/plain",
    claimedFormat: "txt",
    provenance: {
      createdByActorId: "credit_master_worker_001",
      sourceContentHash: plan.script.textHash,
      generationRequestHash: plan.job.cacheKey,
      parentArtifactIds: [audio.envelope.payload.id],
    },
    rights,
    reviewRequired: false,
    actorId: "credit_master_worker_001",
    verifierActorId: "credit_master_verifier_001",
    now: t7,
  });
  assert.equal(transcript.accepted, true);

  const evidence = await engineeringEvidence(input.bytes);
  const engineering = await ingestPrivateArtifact(input.objectStore, input.registry, {
    id: `artifact_credit_master_engineering_00${input.index}`,
    kind: "audio-analysis",
    projectId: plan.projectId,
    jobId: plan.job.id,
    segmentId: plan.job.segmentId,
    takeId,
    bytes: new TextEncoder().encode(`${JSON.stringify(evidence)}\n`),
    claimedMimeType: "application/json",
    claimedFormat: "json",
    provenance: {
      createdByActorId: "credit_master_worker_001",
      sourceContentHash: audio.envelope.payload.integrity.contentHash,
      generationRequestHash: plan.job.cacheKey,
      parentArtifactIds: [audio.envelope.payload.id],
    },
    rights,
    reviewRequired: false,
    actorId: "credit_master_worker_001",
    verifierActorId: "credit_master_verifier_001",
    now: t7,
  });
  assert.equal(engineering.accepted, true);

  const take = admitBookCreditTake({
    id: `credit_master_take_record_00${input.index}`,
    plan,
    audioCandidate: audio.envelope.payload,
    transcriptArtifact: transcript.envelope.payload,
    engineeringArtifact: engineering.envelope.payload,
    transcriptEvidence,
    engineeringEvidence: evidence,
    createdAt: t8,
  });
  return { plan, take, evidence, audio, transcript, engineering };
}

async function approvedFixture(input: Readonly<{
  objectStore: FilePrivateObjectStore;
  registry: FileArtifactRegistry;
}>) {
  const first = await ingestCandidate({
    ...input,
    index: 1,
    bytes: wavBytes(1),
  });
  const second = await ingestCandidate({
    ...input,
    index: 2,
    bytes: wavBytes(2),
  });
  let session = createBookCreditTakeReviewSession({
    id: "credit_master_review_session_001",
    candidates: [
      { take: first.take, engineeringEvidence: first.evidence },
      { take: second.take, engineeringEvidence: second.evidence },
    ],
    createdAt: t8,
  });
  session = recordBookCreditTakeReview(session, {
    id: "credit_master_editorial_review_001",
    candidateTakeId: first.take.id,
    role: "editorial",
    reviewerId: "credit_master_editor_001",
    listenedDurationMs: 10_000,
    playbackContexts: ["consumer-headphones", "speakers"],
    decision: "approve",
    scores: reviewScores,
    decidedAt: t9,
  });
  session = recordBookCreditTakeReview(session, {
    id: "credit_master_engineering_review_001",
    candidateTakeId: first.take.id,
    role: "engineering",
    reviewerId: "credit_master_engineer_001",
    listenedDurationMs: 10_000,
    playbackContexts: ["studio-headphones"],
    decision: "approve",
    scores: reviewScores,
    decidedAt: t10,
  });
  session = selectBookCreditTake(session, {
    candidateTakeId: first.take.id,
    selectedByActorId: "credit_master_director_001",
    selectedAt: t11,
  });
  session = approveBookCreditTakeSelection(session, {
    finalConfirmationId: "credit_master_confirmation_001",
    approvedByActorId: "credit_master_owner_001",
    humanConfirmation: true,
    approvedAt: t12,
  });
  return { first, second, session };
}

test("approved selected take promotes losslessly into a complete approved credit-master chain", async () => {
  await withStores(async ({ root, objectStore, registry }) => {
    const fixture = await approvedFixture({ objectStore, registry });
    const chain = await promoteBookCreditMaster(objectStore, registry, {
      session: fixture.session,
      sourceAudio: fixture.first.audio.envelope.payload,
      transcriptArtifact: fixture.first.transcript.envelope.payload,
      engineeringArtifact: fixture.first.engineering.envelope.payload,
      sourceBytes: wavBytes(1),
      rights,
      actorId: "credit_master_operator_001",
      verifierActorId: "credit_master_verifier_001",
      now: t13,
    });
    assert.equal(chain.creditKind, "opening");
    assert.equal(chain.lossless, true);
    assert.equal(chain.eligibleForBookAssembly, true);
    assert.equal(chain.creditMaster.payload.kind, "credit-master");
    assert.equal(chain.creditMaster.payload.verification.status, "verified");
    assert.equal(chain.creditMaster.payload.review.status, "approved");
    assert.equal(chain.approvedSourceAudio.payload.review.status, "approved");
    assert.equal(chain.contentHash, hashBytes(wavBytes(1)));
    assert.equal(chain.creditMaster.payload.integrity.contentHash, chain.contentHash);
    assert.equal(chain.creditMaster.payload.integrity.byteCount, wavBytes(1).byteLength);
    assert.equal(chain.creditMaster.payload.provenance.parentArtifactIds.includes(
      chain.reviewEvidence.payload.id,
    ), true);
    assert.equal(chain.reviewEvidence.payload.provenance.parentArtifactIds.includes(
      chain.approvedSourceAudio.payload.id,
    ), true);
    assert.doesNotThrow(() => assertBookCreditMasterChain(chain));

    const repeated = await promoteBookCreditMaster(objectStore, registry, {
      session: fixture.session,
      sourceAudio: fixture.first.audio.envelope.payload,
      transcriptArtifact: fixture.first.transcript.envelope.payload,
      engineeringArtifact: fixture.first.engineering.envelope.payload,
      sourceBytes: wavBytes(1),
      rights,
      actorId: "credit_master_operator_001",
      verifierActorId: "credit_master_verifier_001",
      now: new Date(t13.getTime() + 1_000),
    });
    assert.equal(repeated.fingerprint, chain.fingerprint);
    assert.equal(repeated.creditMaster.envelopeHash, chain.creditMaster.envelopeHash);
    assert.equal(repeated.reviewEvidence.envelopeHash, chain.reviewEvidence.envelopeHash);

    const view = bookCreditMasterPublicView(chain);
    const serialised = JSON.stringify(view);
    for (const forbidden of [
      creditText,
      fixture.first.audio.envelope.payload.id,
      fixture.first.transcript.envelope.payload.id,
      fixture.first.engineering.envelope.payload.id,
      chain.contentHash,
      "elevenlabs",
      "eleven_multilingual_v2",
      fixture.session.id,
      "credit_master_editor_001",
      "credit_master_engineer_001",
      "credit_master_owner_001",
      rights.rightsEvidenceId,
      rights.rightsFingerprint,
    ]) assert.equal(serialised.includes(forbidden), false);

    const audit = await readFile(join(root, "metadata", "audit", "2026-07-27.jsonl"), "utf8");
    assert.equal(audit.includes(creditText), false);
    assert.equal(audit.includes("private-credit-master-request-1"), false);
  });
});

test("unapproved sessions, wrong bytes, rights drift and source snapshot drift fail before a master is usable", async () => {
  await withStores(async ({ objectStore, registry }) => {
    const fixture = await approvedFixture({ objectStore, registry });
    const {
    approval: _approval,
    fingerprint: _fingerprint,
    ...draftBase
  } = fixture.session;
  const draftPartial = {
    ...draftBase,
    status: "ready-for-approval" as const,
  };
  const draftSession = {
    ...draftPartial,
    fingerprint: stableHash(draftPartial),
  };
    await assert.rejects(
      promoteBookCreditMaster(objectStore, registry, {
        session: draftSession as typeof fixture.session,
        sourceAudio: fixture.first.audio.envelope.payload,
        transcriptArtifact: fixture.first.transcript.envelope.payload,
        engineeringArtifact: fixture.first.engineering.envelope.payload,
        sourceBytes: wavBytes(1),
        rights,
        actorId: "credit_master_operator_001",
        now: t13,
      }),
      /BOOK_CREDIT_TAKE_REVIEW_|BOOK_CREDIT_MASTER_APPROVED_SESSION_REQUIRED/u,
    );
    await assert.rejects(
      promoteBookCreditMaster(objectStore, registry, {
        session: fixture.session,
        sourceAudio: fixture.first.audio.envelope.payload,
        transcriptArtifact: fixture.first.transcript.envelope.payload,
        engineeringArtifact: fixture.first.engineering.envelope.payload,
        sourceBytes: wavBytes(9),
        rights,
        actorId: "credit_master_operator_001",
        now: t13,
      }),
      /BOOK_CREDIT_MASTER_SOURCE_BYTES_MISMATCH/u,
    );
    await assert.rejects(
      promoteBookCreditMaster(objectStore, registry, {
        session: fixture.session,
        sourceAudio: fixture.first.audio.envelope.payload,
        transcriptArtifact: fixture.first.transcript.envelope.payload,
        engineeringArtifact: fixture.first.engineering.envelope.payload,
        sourceBytes: wavBytes(1),
        rights: Object.freeze({ ...rights, rightsFingerprint: "f".repeat(64) }),
        actorId: "credit_master_operator_001",
        now: t13,
      }),
      /BOOK_CREDIT_MASTER_RIGHTS_SCOPE_MISMATCH/u,
    );
    const sourceTampered = {
      ...fixture.first.audio.envelope.payload,
      integrity: {
        ...fixture.first.audio.envelope.payload.integrity,
        byteCount: fixture.first.audio.envelope.payload.integrity.byteCount + 1,
      },
    };
    await assert.rejects(
      promoteBookCreditMaster(objectStore, registry, {
        session: fixture.session,
        sourceAudio: sourceTampered,
        transcriptArtifact: fixture.first.transcript.envelope.payload,
        engineeringArtifact: fixture.first.engineering.envelope.payload,
        sourceBytes: wavBytes(1),
        rights,
        actorId: "credit_master_operator_001",
        now: t13,
      }),
      /ARTIFACT_VERIFIED_STATE_INVALID|ARTIFACT_FINGERPRINT_MISMATCH|BOOK_CREDIT_MASTER_AUDIO_SNAPSHOT_MISMATCH/u,
    );
  });
});

test("credit-master chain rejects recomputed envelope and parent tampering", async () => {
  await withStores(async ({ objectStore, registry }) => {
    const fixture = await approvedFixture({ objectStore, registry });
    const chain = await promoteBookCreditMaster(objectStore, registry, {
      session: fixture.session,
      sourceAudio: fixture.first.audio.envelope.payload,
      transcriptArtifact: fixture.first.transcript.envelope.payload,
      engineeringArtifact: fixture.first.engineering.envelope.payload,
      sourceBytes: wavBytes(1),
      rights,
      actorId: "credit_master_operator_001",
      now: t13,
    });
    const { fingerprint: _fingerprint, ...base } = chain;
    const masterPayload = {
      ...chain.creditMaster.payload,
      provenance: {
        ...chain.creditMaster.payload.provenance,
        parentArtifactIds: chain.creditMaster.payload.provenance.parentArtifactIds.filter(
          (id) => id !== chain.reviewEvidence.payload.id,
        ),
      },
    };
    const masterEnvelope = {
      ...chain.creditMaster,
      payload: masterPayload,
      contentHash: stableHash(masterPayload),
    };
    const tamperedBase = {
      ...base,
      creditMaster: masterEnvelope,
    };
    const tampered = {
      ...tamperedBase,
      fingerprint: stableHash(tamperedBase),
    } as typeof chain;
    assert.throws(
      () => assertBookCreditMasterChain(tampered),
      /ARTIFACT_FINGERPRINT_MISMATCH|BOOK_CREDIT_MASTER_ARTIFACT_ENVELOPE_INVALID|BOOK_CREDIT_MASTER_CHAIN_SCOPE_MISMATCH/u,
    );
  });
});
