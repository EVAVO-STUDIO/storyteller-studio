import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ingestAudioEngineeringArtifact,
  type AudioEngineeringArtifactResult,
} from "./audio-engineering-artifact.js";
import type {
  AudioEngineeringCommand,
  AudioEngineeringCommandResult,
  AudioEngineeringRunner,
} from "./audio-engineering.js";
import {
  artifactPublicView,
  createArtifactRecord,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import {
  ingestPrivateArtifact,
  type ArtifactIngestResult,
} from "./artifact-ingest.js";
import { FileArtifactRegistry } from "./artifact-store.js";
import {
  admitEngineeringBackedCalibrationCandidate,
} from "./calibration-engineering.js";
import {
  calibrationSessionPublicView,
  createCalibrationPolicy,
  createCalibrationSession,
  proposeCalibrationPassages,
  type CalibrationCandidate,
  type CalibrationSession,
} from "./calibration-workflow.js";
import {
  ACX_AUDIOBOOK_PROFILE,
  type ManuscriptSegment,
  type PerformanceDirection,
  type PerformancePlan,
  type SegmentedManuscript,
} from "./index.js";
import { FilePrivateObjectStore } from "./private-object-store.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:00:01.000Z");
const t2 = new Date("2026-07-27T00:00:02.000Z");
const t3 = new Date("2026-07-27T00:00:03.000Z");
const t4 = new Date("2026-07-27T00:00:04.000Z");
const sourceHash = "a".repeat(64);
const requestHash = "b".repeat(64);
const capabilityFingerprint = "c".repeat(64);
const wavBytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46,
  0x04, 0x00, 0x00, 0x00,
  0x57, 0x41, 0x56, 0x45,
  0x01, 0x02, 0x03, 0x04,
]);
const alternateWavBytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46,
  0x04, 0x00, 0x00, 0x00,
  0x57, 0x41, 0x56, 0x45,
  0x01, 0x02, 0x03, 0x05,
]);

const rights: ArtifactRightsSnapshot = Object.freeze({
  rightsEvidenceId: "rights_calibration_engineering_001",
  rightsFingerprint: "d".repeat(64),
  allowedUses: Object.freeze(["audiobook"] as const),
  commercialUseApproved: true,
  expiresAt: "2028-07-27T00:00:00.000Z",
});

function segment(): ManuscriptSegment {
  const text = "Mara listened to the last bell and let the final word settle into the quiet room.";
  return {
    id: "segment_calibration_engineering_001",
    sourceHash,
    chapterId: "chapter_calibration_engineering_001",
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
}

function direction(value: ManuscriptSegment): PerformanceDirection {
  return {
    segmentId: value.id,
    narrativeDistance: "close",
    pace: 0.86,
    intensity: 0.22,
    warmth: 0.55,
    restraint: 0.92,
    clarity: 0.96,
    pauseBeforeMs: 120,
    pauseAfterMs: 320,
    emotionalObjective: "Keep the listener close while preserving the silence around the last word.",
    subtext: "Mara is waiting for permission that will not arrive.",
    notes: ["Protect the final word and avoid displaying technique."],
  };
}

function calibrationSession(): CalibrationSession {
  const value = segment();
  const manuscript: SegmentedManuscript = {
    sourceHash,
    characterCount: value.text.length,
    wordCount: value.wordCount,
    chapters: [{
      id: value.chapterId,
      ordinal: value.chapterOrdinal,
      title: value.chapterTitle,
      sourceStart: value.sourceStart,
    }],
    segments: [value],
    findings: [],
  };
  const performance: PerformancePlan = {
    manuscriptHash: sourceHash,
    directions: [direction(value)],
    calibrationSegmentIds: [value.id],
  };
  const proposal = proposeCalibrationPassages(manuscript, performance);
  const passage = proposal.passages[0];
  if (!passage) throw new Error("calibration engineering passage required");
  return createCalibrationSession({
    id: "calibration_engineering_001",
    projectId: "project_calibration_engineering_001",
    seriesId: "series_calibration_engineering_001",
    voiceProfileId: "voice_calibration_engineering_001",
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

function commandResult(stdout = "", stderr = ""): AudioEngineeringCommandResult {
  return { exitCode: 0, stdout, stderr, durationMs: 5 };
}

class EngineeringRunner implements AudioEngineeringRunner {
  constructor(readonly ineligible = false) {}

  async run(command: AudioEngineeringCommand): Promise<AudioEngineeringCommandResult> {
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
            duration: "10",
          }],
          format: {
            format_name: "wav",
            duration: "10",
            bit_rate: "192000",
            size: String(wavBytes.byteLength),
          },
        }));
      case "astats":
        return commandResult([
          `lavfi.astats.Overall.RMS_level=${this.ineligible ? -14 : -20}`,
          `lavfi.astats.Overall.Peak_level=${this.ineligible ? 0 : -4}`,
          `lavfi.astats.Overall.Noise_floor=${this.ineligible ? -45 : -65}`,
          `lavfi.astats.Overall.Peak_count=${this.ineligible ? 12 : 0}`,
        ].join("\n"));
      case "loudnorm":
        return commandResult("", JSON.stringify({
          input_i: this.ineligible ? "-14" : "-20",
          input_tp: this.ineligible ? "0.2" : "-4.2",
          input_lra: "4",
          input_thresh: "-30",
          target_offset: "0",
        }));
      case "silence":
        return commandResult("", [
          "silence_start: 0",
          "silence_end: 1 | silence_duration: 1",
          "silence_start: 9",
          "silence_end: 10 | silence_duration: 1",
        ].join("\n"));
    }
  }
}

interface EvidenceChain {
  session: CalibrationSession;
  audio: ArtifactRecord;
  transcript: ArtifactRecord;
  engineering: AudioEngineeringArtifactResult;
  candidate: Omit<CalibrationCandidate, "fingerprint">;
}

async function withStores(
  run: (input: Readonly<{
    root: string;
    temporaryRoot: string;
    objectStore: FilePrivateObjectStore;
    registry: FileArtifactRegistry;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-calibration-engineering-"));
  try {
    await run({
      root,
      temporaryRoot: join(root, "temporary"),
      objectStore: new FilePrivateObjectStore(join(root, "objects")),
      registry: new FileArtifactRegistry(new FileProjectStore(join(root, "registry"))),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function ingestAudio(
  objectStore: FilePrivateObjectStore,
  registry: FileArtifactRegistry,
  input: Readonly<{
    id: string;
    bytes: Uint8Array;
    takeId: string;
    now: Date;
    rightsSnapshot?: ArtifactRightsSnapshot;
  }>,
): Promise<ArtifactIngestResult> {
  return await ingestPrivateArtifact(objectStore, registry, {
    id: input.id,
    kind: "audio-candidate",
    projectId: "project_calibration_engineering_001",
    jobId: "job_calibration_engineering_001",
    segmentId: "segment_calibration_engineering_001",
    takeId: input.takeId,
    bytes: input.bytes,
    claimedMimeType: "audio/wav",
    claimedFormat: "wav",
    provenance: {
      createdByActorId: "worker_calibration_engineering_001",
      sourceContentHash: sourceHash,
      generationRequestHash: requestHash,
      providerId: "elevenlabs",
      adapterVersion: "1.0.0",
      parentArtifactIds: [],
    },
    rights: input.rightsSnapshot ?? rights,
    actorId: "worker_calibration_engineering_001",
    verifierActorId: "verifier_calibration_engineering_001",
    now: input.now,
  });
}

async function ingestTranscript(
  objectStore: FilePrivateObjectStore,
  registry: FileArtifactRegistry,
  input: Readonly<{
    id: string;
    audio: ArtifactRecord;
    parentIds?: readonly string[];
    projectId?: string;
    jobId?: string;
    rightsSnapshot?: ArtifactRightsSnapshot;
    now: Date;
  }>,
): Promise<ArtifactIngestResult> {
  const transcript = new TextEncoder().encode(segment().text);
  return await ingestPrivateArtifact(objectStore, registry, {
    id: input.id,
    kind: "transcript",
    projectId: input.projectId ?? input.audio.projectId,
    jobId: input.jobId ?? input.audio.jobId,
    segmentId: input.audio.segmentId,
    takeId: input.audio.takeId,
    bytes: transcript,
    claimedMimeType: "text/plain",
    claimedFormat: "txt",
    provenance: {
      createdByActorId: "worker_calibration_engineering_001",
      sourceContentHash: sourceHash,
      generationRequestHash: requestHash,
      parentArtifactIds: input.parentIds ?? [input.audio.id],
    },
    rights: input.rightsSnapshot ?? input.audio.rights,
    reviewRequired: false,
    actorId: "worker_calibration_engineering_001",
    verifierActorId: "verifier_calibration_engineering_001",
    verificationChecks: ["utf8-decode", "transcript-fidelity"],
    now: input.now,
  });
}

async function evidenceChain(
  objectStore: FilePrivateObjectStore,
  registry: FileArtifactRegistry,
  temporaryRoot: string,
  options: Readonly<{ ineligible?: boolean }> = {},
): Promise<EvidenceChain> {
  const session = calibrationSession();
  const audio = (await ingestAudio(objectStore, registry, {
    id: "artifact_calibration_engineering_audio_001",
    bytes: wavBytes,
    takeId: "take_calibration_engineering_001",
    now: t1,
  })).envelope.payload;
  const transcript = (await ingestTranscript(objectStore, registry, {
    id: "artifact_calibration_engineering_transcript_001",
    audio,
    now: t2,
  })).envelope.payload;
  const engineering = await ingestAudioEngineeringArtifact(objectStore, registry, {
    candidateArtifactId: audio.id,
    projectId: audio.projectId,
    jobId: audio.jobId!,
    segmentId: audio.segmentId!,
    takeId: audio.takeId!,
    generationRequestHash: requestHash,
    bytes: wavBytes,
    format: "wav",
    rights: audio.rights,
    actorId: "worker_calibration_engineering_001",
    verifierActorId: "verifier_calibration_engineering_001",
    profile: ACX_AUDIOBOOK_PROFILE,
    profileVersion: "acx-2026-07",
    profileReviewedAt: "2026-07-26T00:00:00.000Z",
    profileSourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    temporaryRoot,
    runner: new EngineeringRunner(options.ineligible ?? false),
    now: t3,
  });
  const passage = session.passages[0];
  if (!passage) throw new Error("calibration passage required");
  const candidate: Omit<CalibrationCandidate, "fingerprint"> = {
    id: "candidate_calibration_engineering_001",
    passageId: passage.id,
    takeArtifactId: audio.id,
    transcriptAssessmentArtifactId: transcript.id,
    technicalAssessmentArtifactId: engineering.ingest.envelope.payload.id,
    voiceProfileId: session.voiceProfileId,
    voiceRevision: session.voiceRevision,
    providerId: "elevenlabs",
    modelId: "eleven_multilingual_v2",
    capabilityFingerprint,
    generationRequestHash: requestHash,
    continuityScore: 0.93,
    eligible: true,
    findingCodes: [],
    createdAt: t4.toISOString(),
  };
  return { session, audio, transcript, engineering, candidate };
}

test("verified scope-matched audio, transcript and independent engineering admit a calibration candidate", async () => {
  await withStores(async ({ temporaryRoot, objectStore, registry }) => {
    const chain = await evidenceChain(objectStore, registry, temporaryRoot);
    const admitted = admitEngineeringBackedCalibrationCandidate({
      session: chain.session,
      candidate: chain.candidate,
      audioCandidate: chain.audio,
      transcriptAssessment: chain.transcript,
      engineeringArtifact: chain.engineering.ingest.envelope.payload,
      engineeringEvidence: chain.engineering.evidence,
      now: t4,
    });

    assert.equal(admitted.candidates.length, 1);
    assert.equal(admitted.candidates[0]?.takeArtifactId, chain.audio.id);
    assert.equal(
      admitted.candidates[0]?.technicalAssessmentArtifactId,
      chain.engineering.ingest.envelope.payload.id,
    );
    const publicView = calibrationSessionPublicView(admitted);
    const serialised = JSON.stringify(publicView);
    assert.equal(publicView.candidateCount, 1);
    for (const forbidden of [
      chain.audio.id,
      chain.transcript.id,
      chain.engineering.ingest.envelope.payload.id,
      "elevenlabs",
      "eleven_multilingual_v2",
      capabilityFingerprint,
      segment().text,
    ]) assert.equal(serialised.includes(forbidden), false);
  });
});

test("ineligible independent engineering blocks candidate admission while evidence remains verified", async () => {
  await withStores(async ({ temporaryRoot, objectStore, registry }) => {
    const chain = await evidenceChain(objectStore, registry, temporaryRoot, { ineligible: true });
    assert.equal(chain.engineering.evidence.eligible, false);
    assert.equal(chain.engineering.ingest.accepted, true);
    await assert.rejects(
      async () => admitEngineeringBackedCalibrationCandidate({
        session: chain.session,
        candidate: chain.candidate,
        audioCandidate: chain.audio,
        transcriptAssessment: chain.transcript,
        engineeringArtifact: chain.engineering.ingest.envelope.payload,
        engineeringEvidence: chain.engineering.evidence,
      }),
      /CALIBRATION_ENGINEERING_EVIDENCE_INELIGIBLE/u,
    );
  });
});

test("tampered and pending artifacts fail before calibration domain mutation", async () => {
  await withStores(async ({ temporaryRoot, objectStore, registry }) => {
    const chain = await evidenceChain(objectStore, registry, temporaryRoot);
    assert.throws(
      () => admitEngineeringBackedCalibrationCandidate({
        session: chain.session,
        candidate: chain.candidate,
        audioCandidate: { ...chain.audio, fingerprint: "f".repeat(64) },
        transcriptAssessment: chain.transcript,
        engineeringArtifact: chain.engineering.ingest.envelope.payload,
        engineeringEvidence: chain.engineering.evidence,
      }),
      /ARTIFACT_FINGERPRINT_MISMATCH/u,
    );

    const pending = createArtifactRecord({
      id: "artifact_calibration_engineering_pending_001",
      kind: "transcript",
      projectId: chain.audio.projectId,
      jobId: chain.audio.jobId,
      segmentId: chain.audio.segmentId,
      takeId: chain.audio.takeId,
      storage: chain.transcript.storage,
      integrity: chain.transcript.integrity,
      provenance: {
        ...chain.transcript.provenance,
        parentArtifactIds: [chain.audio.id],
      },
      rights: chain.audio.rights,
      reviewRequired: false,
    }, t2);
    assert.throws(
      () => admitEngineeringBackedCalibrationCandidate({
        session: chain.session,
        candidate: {
          ...chain.candidate,
          transcriptAssessmentArtifactId: pending.id,
        },
        audioCandidate: chain.audio,
        transcriptAssessment: pending,
        engineeringArtifact: chain.engineering.ingest.envelope.payload,
        engineeringEvidence: chain.engineering.evidence,
      }),
      /CALIBRATION_ENGINEERING_TRANSCRIPT_NOT_VERIFIED/u,
    );
  });
});

test("scope, parent and rights mismatches fail closed", async () => {
  await withStores(async ({ temporaryRoot, objectStore, registry }) => {
    const chain = await evidenceChain(objectStore, registry, temporaryRoot);
    const wrongScope = (await ingestTranscript(objectStore, registry, {
      id: "artifact_calibration_engineering_wrong_scope_001",
      audio: chain.audio,
      jobId: "job_calibration_engineering_other",
      now: t2,
    })).envelope.payload;
    assert.throws(
      () => admitEngineeringBackedCalibrationCandidate({
        session: chain.session,
        candidate: {
          ...chain.candidate,
          transcriptAssessmentArtifactId: wrongScope.id,
        },
        audioCandidate: chain.audio,
        transcriptAssessment: wrongScope,
        engineeringArtifact: chain.engineering.ingest.envelope.payload,
        engineeringEvidence: chain.engineering.evidence,
      }),
      /CALIBRATION_ENGINEERING_TRANSCRIPT_SCOPE_MISMATCH/u,
    );

    const noParent = (await ingestTranscript(objectStore, registry, {
      id: "artifact_calibration_engineering_no_parent_001",
      audio: chain.audio,
      parentIds: [],
      now: t2,
    })).envelope.payload;
    assert.throws(
      () => admitEngineeringBackedCalibrationCandidate({
        session: chain.session,
        candidate: {
          ...chain.candidate,
          transcriptAssessmentArtifactId: noParent.id,
        },
        audioCandidate: chain.audio,
        transcriptAssessment: noParent,
        engineeringArtifact: chain.engineering.ingest.envelope.payload,
        engineeringEvidence: chain.engineering.evidence,
      }),
      /CALIBRATION_ENGINEERING_TRANSCRIPT_PARENT_MISMATCH/u,
    );

    const otherRights = Object.freeze({
      ...rights,
      rightsEvidenceId: "rights_calibration_engineering_other",
      rightsFingerprint: "e".repeat(64),
    });
    const wrongRights = (await ingestTranscript(objectStore, registry, {
      id: "artifact_calibration_engineering_wrong_rights_001",
      audio: chain.audio,
      rightsSnapshot: otherRights,
      now: t2,
    })).envelope.payload;
    assert.throws(
      () => admitEngineeringBackedCalibrationCandidate({
        session: chain.session,
        candidate: {
          ...chain.candidate,
          transcriptAssessmentArtifactId: wrongRights.id,
        },
        audioCandidate: chain.audio,
        transcriptAssessment: wrongRights,
        engineeringArtifact: chain.engineering.ingest.envelope.payload,
        engineeringEvidence: chain.engineering.evidence,
      }),
      /CALIBRATION_ENGINEERING_RIGHTS_SCOPE_MISMATCH/u,
    );
  });
});

test("content and chronology mismatches cannot be hidden by valid artifact envelopes", async () => {
  await withStores(async ({ temporaryRoot, objectStore, registry }) => {
    const chain = await evidenceChain(objectStore, registry, temporaryRoot);
    const alternateAudio = (await ingestAudio(objectStore, registry, {
      id: "artifact_calibration_engineering_audio_002",
      bytes: alternateWavBytes,
      takeId: "take_calibration_engineering_002",
      now: t1,
    })).envelope.payload;
    const alternateTranscript = (await ingestTranscript(objectStore, registry, {
      id: "artifact_calibration_engineering_transcript_002",
      audio: alternateAudio,
      now: t2,
    })).envelope.payload;
    const misleadingAnalysis = (await ingestPrivateArtifact(objectStore, registry, {
      id: "artifact_calibration_engineering_analysis_mismatch_001",
      kind: "audio-analysis",
      projectId: alternateAudio.projectId,
      jobId: alternateAudio.jobId,
      segmentId: alternateAudio.segmentId,
      takeId: alternateAudio.takeId,
      bytes: new TextEncoder().encode(JSON.stringify({ evidence: chain.engineering.evidence.fingerprint })),
      claimedMimeType: "application/json",
      claimedFormat: "json",
      provenance: {
        createdByActorId: "worker_calibration_engineering_001",
        sourceContentHash: chain.audio.integrity.contentHash,
        generationRequestHash: requestHash,
        parentArtifactIds: [alternateAudio.id],
      },
      rights: alternateAudio.rights,
      reviewRequired: false,
      actorId: "worker_calibration_engineering_001",
      verifierActorId: "verifier_calibration_engineering_001",
      now: t3,
    })).envelope.payload;
    assert.throws(
      () => admitEngineeringBackedCalibrationCandidate({
        session: chain.session,
        candidate: {
          ...chain.candidate,
          takeArtifactId: alternateAudio.id,
          transcriptAssessmentArtifactId: alternateTranscript.id,
          technicalAssessmentArtifactId: misleadingAnalysis.id,
        },
        audioCandidate: alternateAudio,
        transcriptAssessment: alternateTranscript,
        engineeringArtifact: misleadingAnalysis,
        engineeringEvidence: chain.engineering.evidence,
      }),
      /CALIBRATION_ENGINEERING_CONTENT_BINDING_MISMATCH/u,
    );

    assert.throws(
      () => admitEngineeringBackedCalibrationCandidate({
        session: chain.session,
        candidate: {
          ...chain.candidate,
          createdAt: new Date(t2.getTime() + 500).toISOString(),
        },
        audioCandidate: chain.audio,
        transcriptAssessment: chain.transcript,
        engineeringArtifact: chain.engineering.ingest.envelope.payload,
        engineeringEvidence: chain.engineering.evidence,
      }),
      /CALIBRATION_ENGINEERING_CANDIDATE_PRECEDES_EVIDENCE/u,
    );
  });
});

test("artifact public views remain structurally valid after engineering admission fixtures", async () => {
  await withStores(async ({ temporaryRoot, objectStore, registry }) => {
    const chain = await evidenceChain(objectStore, registry, temporaryRoot);
    for (const artifact of [
      chain.audio,
      chain.transcript,
      chain.engineering.ingest.envelope.payload,
    ]) {
      const view = artifactPublicView(artifact);
      assert.equal(JSON.stringify(view).includes(artifact.storage.objectKey), false);
    }
  });
});
