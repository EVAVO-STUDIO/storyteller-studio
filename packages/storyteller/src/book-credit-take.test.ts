import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  analyseAudioEngineering,
  type AudioEngineeringCommand,
  type AudioEngineeringCommandResult,
  type AudioEngineeringRunner,
  type AudioEngineeringStage,
} from "./audio-engineering.js";
import {
  createArtifactRecord,
  verifyArtifactIntegrity,
  type ArtifactKind,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import {
  approveBookCreditScript,
  createBookCreditPolicy,
  createBookCreditScript,
  recordBookCreditReview,
} from "./book-credit-script.js";
import { createBookCreditGenerationPlan } from "./book-credit-generation.js";
import {
  FileBookCreditTakeStore,
  admitBookCreditTake,
  assertBookCreditTakeRecord,
  assertBookCreditTranscriptEvidence,
  bookCreditTakePublicView,
  createBookCreditTranscriptEvidence,
} from "./book-credit-take.js";
import {
  PRODUCTION_CALIBRATION_LOCK_SCHEMA_VERSION,
  type ProductionCalibrationLock,
} from "./calibration-admission.js";
import {
  ACX_AUDIOBOOK_PROFILE,
  stableHash,
} from "./index.js";
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
const creditText = "The North Water, written by Ian McGuire, narrated by EVAVO Narrator.";
const audioHash = "a".repeat(64);
const audioBytes = 960_000;

const rights: ArtifactRightsSnapshot = Object.freeze({
  rightsEvidenceId: "rights_credit_take_001",
  rightsFingerprint: "b".repeat(64),
  allowedUses: Object.freeze(["audiobook"] as const),
  commercialUseApproved: true,
  expiresAt: "2028-07-27T00:00:00.000Z",
  retainUntil: "2033-07-27T00:00:00.000Z",
  deletionRequiredAt: "2034-07-27T00:00:00.000Z",
});

function policy() {
  return createBookCreditPolicy({
    id: "credit_take_policy_001",
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
    id: "credit_take_script_001",
    projectId: "project_credit_take_001",
    kind: "opening",
    metadata: {
      bookId: "book_credit_take_001",
      title: "The North Water",
      projectKind: "standalone",
      authorCredit: "Ian McGuire",
      narratorCredit: "EVAVO Narrator",
      copyrightNotice: "Copyright 2026 Rights Holder.",
    },
    policy: policy(),
    createdAt: t0,
  });
  script = recordBookCreditReview(script, {
    id: "credit_take_editorial_review_001",
    role: "editorial",
    reviewerId: "credit_take_editor_001",
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
    id: "credit_take_rights_review_001",
    role: "rights",
    reviewerId: "credit_take_rights_reviewer_001",
    decision: "approve",
    checks: [
      "copyright-notice-confirmed",
      "credit-entitlements-confirmed",
      "commercial-use-confirmed",
    ],
    decidedAt: t2,
  });
  return approveBookCreditScript(script, {
    finalConfirmationId: "credit_take_confirmation_001",
    approvedByActorId: "credit_take_owner_001",
    humanConfirmation: true,
    approvedAt: t3,
  });
}

function calibrationLock(): ProductionCalibrationLock {
  const base = {
    schemaVersion: PRODUCTION_CALIBRATION_LOCK_SCHEMA_VERSION,
    sessionId: "calibration_credit_take_001",
    sessionRevision: 7,
    sessionFingerprint: "1".repeat(64),
    approvalFingerprint: "2".repeat(64),
    assessmentFingerprint: "3".repeat(64),
    projectId: "project_credit_take_001",
    voiceProfileId: "voice_credit_take_001",
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

function plan() {
  return createBookCreditGenerationPlan({
    id: "credit_take_plan_001",
    jobId: "job_credit_take_001",
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
    costPolicy: {
      currency: "USD",
      maximumTotalEstimatedCost: 2,
    },
    format: "wav",
    sampleRateHz: 44_100,
    createdAt: t4,
  });
}

function commandResult(stdout = "", stderr = ""): AudioEngineeringCommandResult {
  return Object.freeze({ exitCode: 0, stdout, stderr, durationMs: 5 });
}

class EngineeringRunner implements AudioEngineeringRunner {
  constructor(readonly failed = false) {}

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
            sample_rate: this.failed ? "22050" : "44100",
            channels: this.failed ? 2 : 1,
            bit_rate: this.failed ? "128000" : "192000",
            duration: "10.000000",
          }],
          format: {
            format_name: "wav",
            duration: "10.000000",
            bit_rate: this.failed ? "128000" : "192000",
            size: String(audioBytes),
          },
        }));
      case "astats":
        return commandResult([
          `lavfi.astats.Overall.RMS_level=${this.failed ? "-15" : "-20"}`,
          `lavfi.astats.Overall.Peak_level=${this.failed ? "0" : "-4"}`,
          `lavfi.astats.Overall.Noise_floor=${this.failed ? "-45" : "-65"}`,
          `lavfi.astats.Overall.Peak_count=${this.failed ? "42" : "0"}`,
        ].join("\n"));
      case "loudnorm":
        return commandResult("", JSON.stringify({
          input_i: this.failed ? "-15" : "-20.1",
          input_tp: this.failed ? "0.3" : "-4.2",
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

async function engineeringEvidence(failed = false) {
  return await analyseAudioEngineering({
    audioPath: "/private/credit-take.wav",
    inputContentHash: audioHash,
    inputByteCount: audioBytes,
    profile: ACX_AUDIOBOOK_PROFILE,
    profileVersion: "acx-2026-07",
    profileReviewedAt: "2026-07-26T00:00:00.000Z",
    profileSourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner: new EngineeringRunner(failed),
    now: t6,
  });
}

function artifact(input: Readonly<{
  id: string;
  kind: ArtifactKind;
  hash: string;
  byteCount: number;
  createdAt: Date;
  parentIds?: readonly string[];
  sourceContentHash?: string;
  providerId?: string;
  takeId?: string;
  rightsOverride?: ArtifactRightsSnapshot;
}>): ArtifactRecord {
  const generationPlan = plan();
  const pending = createArtifactRecord({
    id: input.id,
    kind: input.kind,
    projectId: generationPlan.projectId,
    jobId: generationPlan.job.id,
    segmentId: generationPlan.job.segmentId,
    takeId: input.takeId ?? "take_credit_001",
    storage: {
      driver: "private-object-store",
      provider: "local-private",
      container: "storyteller-tests",
      objectKey: `projects/${generationPlan.projectId}/credits/${input.id}`,
    },
    integrity: {
      algorithm: "sha256",
      contentHash: input.hash,
      byteCount: input.byteCount,
      mimeType: input.kind === "audio-candidate" ? "audio/wav" : "application/json",
      format: input.kind === "audio-candidate" ? "wav" : "json",
    },
    provenance: {
      createdByActorId: "credit_take_worker_001",
      ...(input.sourceContentHash ? { sourceContentHash: input.sourceContentHash } : {}),
      generationRequestHash: generationPlan.job.cacheKey,
      ...(input.providerId ? { providerId: input.providerId, adapterVersion: "1.0.0" } : {}),
      parentArtifactIds: Object.freeze([...(input.parentIds ?? [])]),
    },
    rights: input.rightsOverride ?? rights,
    reviewRequired: input.kind === "audio-candidate",
  }, input.createdAt);
  return verifyArtifactIntegrity(pending, {
    observedContentHash: pending.integrity.contentHash,
    observedByteCount: pending.integrity.byteCount,
    checkedByActorId: "credit_take_verifier_001",
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: input.createdAt,
  });
}

async function admittedFixture(input: Readonly<{
  observedText?: string;
  engineeringFailed?: boolean;
  rightsOverride?: ArtifactRightsSnapshot;
  providerId?: string;
}> = {}) {
  const generationPlan = plan();
  const audio = artifact({
    id: "artifact_credit_audio_001",
    kind: "audio-candidate",
    hash: audioHash,
    byteCount: audioBytes,
    createdAt: t5,
    providerId: input.providerId ?? "elevenlabs",
    rightsOverride: input.rightsOverride,
  });
  const transcriptEvidence = createBookCreditTranscriptEvidence({
    sourceText: generationPlan.script.text,
    observedText: input.observedText ?? generationPlan.script.text,
    assessedAt: t6,
  });
  const transcript = artifact({
    id: "artifact_credit_transcript_001",
    kind: "transcript",
    hash: "c".repeat(64),
    byteCount: 1_024,
    createdAt: t7,
    parentIds: [audio.id],
    sourceContentHash: generationPlan.script.textHash,
    rightsOverride: input.rightsOverride,
  });
  const evidence = await engineeringEvidence(input.engineeringFailed ?? false);
  const engineering = artifact({
    id: "artifact_credit_engineering_001",
    kind: "audio-analysis",
    hash: "d".repeat(64),
    byteCount: 2_048,
    createdAt: t7,
    parentIds: [audio.id],
    sourceContentHash: audio.integrity.contentHash,
    rightsOverride: input.rightsOverride,
  });
  const record = admitBookCreditTake({
    id: "credit_take_record_001",
    plan: generationPlan,
    audioCandidate: audio,
    transcriptArtifact: transcript,
    engineeringArtifact: engineering,
    transcriptEvidence,
    engineeringEvidence: evidence,
    createdAt: t8,
  });
  return { generationPlan, audio, transcript, engineering, transcriptEvidence, evidence, record };
}

test("exact verified opening credit take becomes eligible and public/store views stay redacted", async () => {
  const fixture = await admittedFixture();
  assert.equal(fixture.record.creditKind, "opening");
  assert.equal(fixture.record.eligibleForReview, true);
  assert.equal(fixture.record.status, "eligible-for-review");
  assert.deepEqual(fixture.record.findings, []);
  assert.equal(fixture.record.transcriptEvidence.exactMatch, true);
  assert.equal(fixture.record.transcriptEvidence.finalWordCovered, true);
  assert.doesNotThrow(() => assertBookCreditTakeRecord(fixture.record));

  const view = bookCreditTakePublicView(fixture.record);
  const serialised = JSON.stringify(view);
  assert.equal(view.creditKind, "opening");
  assert.equal(view.transcriptExact, true);
  assert.equal(view.finalWordCovered, true);
  for (const forbidden of [
    creditText,
    fixture.audio.id,
    fixture.transcript.id,
    fixture.engineering.id,
    fixture.audio.integrity.contentHash,
    "elevenlabs",
    "eleven_multilingual_v2",
    rights.rightsEvidenceId,
    rights.rightsFingerprint,
    "calibration_credit_take_001",
    "credit_take_owner_001",
  ]) assert.equal(serialised.includes(forbidden), false);

  const root = await mkdtemp(join(tmpdir(), "storyteller-credit-take-store-"));
  try {
    const store = new FileBookCreditTakeStore(new FileProjectStore(root));
    const first = await store.create(fixture.record, "credit_take_operator_001");
    const repeated = await store.create(fixture.record, "credit_take_operator_001");
    assert.equal(first.envelopeHash, repeated.envelopeHash);
    assert.equal((await store.read(fixture.record.id))?.payload.fingerprint, fixture.record.fingerprint);
    const audit = await readFile(join(root, "audit", "2026-07-27.jsonl"), "utf8");
    for (const forbidden of [
      creditText,
      fixture.audio.id,
      fixture.audio.integrity.contentHash,
      "elevenlabs",
      rights.rightsEvidenceId,
      rights.rightsFingerprint,
    ]) assert.equal(audit.includes(forbidden), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("transcript drift, final-word loss and failed engineering remain classified but blocked", async () => {
  const transcriptDrift = await admittedFixture({
    observedText: "The North Water, written by Ian McGuire, narrated by EVAVO.",
  });
  assert.equal(transcriptDrift.record.eligibleForReview, false);
  assert.equal(transcriptDrift.record.status, "blocked");
  assert.equal(
    transcriptDrift.record.findings.some((finding) =>
      finding.code === "BOOK_CREDIT_TAKE_TRANSCRIPT_NOT_EXACT"
    ),
    true,
  );
  assert.equal(
    transcriptDrift.record.findings.some((finding) =>
      finding.code === "BOOK_CREDIT_TAKE_FINAL_WORD_MISSING"
    ),
    true,
  );

  const engineeringFailed = await admittedFixture({ engineeringFailed: true });
  assert.equal(engineeringFailed.record.eligibleForReview, false);
  assert.equal(engineeringFailed.record.status, "blocked");
  assert.equal(
    engineeringFailed.record.findings.some((finding) => finding.code === "AUDIO_RMS_OUT_OF_RANGE"),
    true,
  );
  assert.doesNotThrow(() => assertBookCreditTakeRecord(engineeringFailed.record));
});

test("provider, rights, scope, parent and chronology mismatches fail before classification", async () => {
  await assert.rejects(
    admittedFixture({ providerId: "other-provider" }),
    /BOOK_CREDIT_TAKE_PROVIDER_MISMATCH/u,
  );
  await assert.rejects(
    admittedFixture({
      rightsOverride: Object.freeze({ ...rights, rightsFingerprint: "e".repeat(64) }),
    }),
    /BOOK_CREDIT_TAKE_RIGHTS_SCOPE_MISMATCH/u,
  );

  const generationPlan = plan();
  const audio = artifact({
    id: "artifact_credit_audio_parent_001",
    kind: "audio-candidate",
    hash: audioHash,
    byteCount: audioBytes,
    createdAt: t5,
    providerId: "elevenlabs",
  });
  const transcript = artifact({
    id: "artifact_credit_transcript_parent_001",
    kind: "transcript",
    hash: "f".repeat(64),
    byteCount: 1_024,
    createdAt: t7,
    parentIds: [],
    sourceContentHash: generationPlan.script.textHash,
  });
  const evidence = await engineeringEvidence();
  const engineering = artifact({
    id: "artifact_credit_engineering_parent_001",
    kind: "audio-analysis",
    hash: "9".repeat(64),
    byteCount: 2_048,
    createdAt: t7,
    parentIds: [audio.id],
    sourceContentHash: audioHash,
  });
  const transcriptEvidence = createBookCreditTranscriptEvidence({
    sourceText: generationPlan.script.text,
    observedText: generationPlan.script.text,
    assessedAt: t6,
  });
  assert.throws(
    () => admitBookCreditTake({
      id: "credit_take_parent_failure_001",
      plan: generationPlan,
      audioCandidate: audio,
      transcriptArtifact: transcript,
      engineeringArtifact: engineering,
      transcriptEvidence,
      engineeringEvidence: evidence,
      createdAt: t8,
    }),
    /BOOK_CREDIT_TAKE_TRANSCRIPT_PARENT_MISMATCH/u,
  );
  assert.throws(
    () => admitBookCreditTake({
      id: "credit_take_chronology_failure_001",
      plan: generationPlan,
      audioCandidate: audio,
      transcriptArtifact: artifact({
        id: "artifact_credit_transcript_chronology_001",
        kind: "transcript",
        hash: "8".repeat(64),
        byteCount: 1_024,
        createdAt: t7,
        parentIds: [audio.id],
        sourceContentHash: generationPlan.script.textHash,
      }),
      engineeringArtifact: engineering,
      transcriptEvidence: createBookCreditTranscriptEvidence({
        sourceText: generationPlan.script.text,
        observedText: generationPlan.script.text,
        assessedAt: t4,
      }),
      engineeringEvidence: evidence,
      createdAt: t8,
    }),
    /BOOK_CREDIT_TAKE_TRANSCRIPT_PRECEDES_AUDIO/u,
  );
});

test("transcript and take evidence reject recomputed structural tampering", async () => {
  const evidence = createBookCreditTranscriptEvidence({
    sourceText: creditText,
    observedText: creditText,
    assessedAt: t6,
  });
  const { fingerprint: _fingerprint, ...evidenceBase } = evidence;
  const evidenceTamperedBase = {
    ...evidenceBase,
    exactMatch: false,
    firstMismatchIndex: 0,
  };
  const evidenceTampered = {
    ...evidenceTamperedBase,
    fingerprint: stableHash(evidenceTamperedBase),
  } as typeof evidence;
  assert.throws(
    () => assertBookCreditTranscriptEvidence(evidenceTampered),
    /BOOK_CREDIT_TRANSCRIPT_MISMATCH_STATE_INVALID/u,
  );

  const fixture = await admittedFixture();
  const {
    fingerprint: _transcriptFingerprint,
    ...transcriptWithoutFingerprint
  } = fixture.record.transcriptEvidence;
  const transcriptTamperedBase = {
    ...transcriptWithoutFingerprint,
    sourceTextHash: "0".repeat(64),
  };
  const transcriptTampered = {
    ...transcriptTamperedBase,
    fingerprint: stableHash(transcriptTamperedBase),
  };
  const { fingerprint: _recordFingerprint, ...recordBase } = fixture.record;
  const recordTamperedBase = {
    ...recordBase,
    transcriptEvidence: transcriptTampered,
  };
  const recordTampered = {
    ...recordTamperedBase,
    fingerprint: stableHash(recordTamperedBase),
  } as typeof fixture.record;
  assert.throws(
    () => assertBookCreditTakeRecord(recordTampered),
    /BOOK_CREDIT_TRANSCRIPT_EXACT_STATE_INVALID|BOOK_CREDIT_TAKE_TRANSCRIPT_SOURCE_MISMATCH/u,
  );
});
