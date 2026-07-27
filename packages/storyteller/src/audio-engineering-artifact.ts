import { createHash } from "node:crypto";
import { mkdir, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  analyseAudioEngineering,
  audioEngineeringPublicView,
  AudioEngineeringError,
  type AnalyseAudioEngineeringInput,
  type AudioEngineeringEvidence,
  type AudioEngineeringPublicView,
  type AudioEngineeringRunner,
} from "./audio-engineering.js";
import {
  artifactIngestPublicView,
  ingestPrivateArtifact,
  type ArtifactIngestPublicView,
  type ArtifactIngestResult,
} from "./artifact-ingest.js";
import type { ArtifactRightsSnapshot } from "./artifact-registry.js";
import type { FileArtifactRegistry } from "./artifact-store.js";
import { stableHash } from "./index.js";
import type { FilePrivateObjectStore } from "./private-object-store.js";

export interface AudioEngineeringArtifactInput {
  candidateArtifactId: string;
  projectId: string;
  jobId: string;
  segmentId: string;
  takeId: string;
  generationRequestHash: string;
  bytes: Uint8Array;
  format: "wav" | "flac" | "mp3";
  rights: ArtifactRightsSnapshot;
  actorId: string;
  verifierActorId?: string;
  profile: AnalyseAudioEngineeringInput["profile"];
  profileVersion: string;
  profileReviewedAt: string;
  profileSourceReference: string;
  runner?: AudioEngineeringRunner;
  ffprobePath?: string;
  ffmpegPath?: string;
  timeoutMs?: number;
  maximumOutputBytes?: number;
  temporaryRoot?: string;
  now?: Date;
  signal?: AbortSignal;
}

export interface AudioEngineeringArtifactResult {
  evidence: AudioEngineeringEvidence;
  ingest: ArtifactIngestResult;
  candidateEligible: boolean;
}

export interface AudioEngineeringArtifactPublicView {
  evidence: AudioEngineeringPublicView;
  artifact: ArtifactIngestPublicView;
  candidateEligible: boolean;
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const EXTENSIONS: Readonly<Record<AudioEngineeringArtifactInput["format"], string>> = Object.freeze({
  wav: "wav",
  flac: "flac",
  mp3: "mp3",
});

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new AudioEngineeringError(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new AudioEngineeringError(code);
  return value;
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function withPrivateTemporaryAudio<T>(input: Readonly<{
  bytes: Uint8Array;
  format: AudioEngineeringArtifactInput["format"];
  temporaryRoot?: string;
  run: (path: string) => Promise<T>;
}>): Promise<T> {
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0) {
    throw new AudioEngineeringError("AUDIO_ENGINEERING_ARTIFACT_BYTES_REQUIRED");
  }
  const root = input.temporaryRoot ? resolve(input.temporaryRoot) : tmpdir();
  let directory: string | undefined;
  try {
    await mkdir(root, { recursive: true, mode: 0o700 });
    directory = await mkdtemp(join(root, "storyteller-audio-engineering-"));
    const path = join(directory, `candidate.${EXTENSIONS[input.format]}`);
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(input.bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return await input.run(path);
  } catch (error) {
    if (error instanceof AudioEngineeringError) throw error;
    throw new AudioEngineeringError("AUDIO_ENGINEERING_TEMPORARY_FILE_FAILED");
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}

function validateInput(input: AudioEngineeringArtifactInput): void {
  requireIdentifier(input.candidateArtifactId, "AUDIO_ENGINEERING_CANDIDATE_ARTIFACT_ID_INVALID");
  requireIdentifier(input.projectId, "AUDIO_ENGINEERING_PROJECT_ID_INVALID");
  requireIdentifier(input.jobId, "AUDIO_ENGINEERING_JOB_ID_INVALID");
  requireIdentifier(input.segmentId, "AUDIO_ENGINEERING_SEGMENT_ID_INVALID");
  requireIdentifier(input.takeId, "AUDIO_ENGINEERING_TAKE_ID_INVALID");
  requireHash(input.generationRequestHash, "AUDIO_ENGINEERING_REQUEST_HASH_INVALID");
  requireIdentifier(input.actorId, "AUDIO_ENGINEERING_ACTOR_ID_INVALID");
  if (input.verifierActorId) {
    requireIdentifier(input.verifierActorId, "AUDIO_ENGINEERING_VERIFIER_ID_INVALID");
  }
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0) {
    throw new AudioEngineeringError("AUDIO_ENGINEERING_ARTIFACT_BYTES_REQUIRED");
  }
}

export async function ingestAudioEngineeringArtifact(
  objectStore: FilePrivateObjectStore,
  registry: FileArtifactRegistry,
  input: AudioEngineeringArtifactInput,
): Promise<AudioEngineeringArtifactResult> {
  validateInput(input);
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new AudioEngineeringError("AUDIO_ENGINEERING_NOW_INVALID");
  const inputContentHash = hashBytes(input.bytes);
  const evidence = await withPrivateTemporaryAudio({
    bytes: input.bytes,
    format: input.format,
    ...(input.temporaryRoot ? { temporaryRoot: input.temporaryRoot } : {}),
    run: async (audioPath) => await analyseAudioEngineering({
      audioPath,
      inputContentHash,
      inputByteCount: input.bytes.byteLength,
      profile: input.profile,
      profileVersion: input.profileVersion,
      profileReviewedAt: input.profileReviewedAt,
      profileSourceReference: input.profileSourceReference,
      ...(input.runner ? { runner: input.runner } : {}),
      ...(input.ffprobePath ? { ffprobePath: input.ffprobePath } : {}),
      ...(input.ffmpegPath ? { ffmpegPath: input.ffmpegPath } : {}),
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
      ...(input.maximumOutputBytes !== undefined
        ? { maximumOutputBytes: input.maximumOutputBytes }
        : {}),
      now,
      ...(input.signal ? { signal: input.signal } : {}),
    }),
  });

  const bytes = new TextEncoder().encode(`${JSON.stringify(evidence)}\n`);
  const artifactId = `artifact_${stableHash({
    candidateArtifactId: input.candidateArtifactId,
    evidenceFingerprint: evidence.fingerprint,
  }).slice(0, 24)}`;
  const ingest = await ingestPrivateArtifact(
    objectStore,
    registry,
    {
      id: artifactId,
      kind: "audio-analysis",
      projectId: input.projectId,
      jobId: input.jobId,
      segmentId: input.segmentId,
      takeId: input.takeId,
      bytes,
      claimedMimeType: "application/json",
      claimedFormat: "json",
      provenance: {
        createdByActorId: input.actorId,
        sourceContentHash: evidence.inputContentHash,
        generationRequestHash: input.generationRequestHash,
        parentArtifactIds: [input.candidateArtifactId],
      },
      rights: input.rights,
      reviewRequired: false,
      actorId: input.actorId,
      verifierActorId: input.verifierActorId ?? input.actorId,
      verificationChecks: [
        "json-parse",
        "audio-engineering-evidence",
        "ffprobe-stream",
        "ffmpeg-astats",
        "ffmpeg-loudnorm",
        "ffmpeg-silencedetect",
      ],
      now,
    },
  );
  return Object.freeze({
    evidence,
    ingest,
    candidateEligible: evidence.eligible && ingest.accepted,
  });
}

export function audioEngineeringArtifactPublicView(
  result: AudioEngineeringArtifactResult,
): AudioEngineeringArtifactPublicView {
  return Object.freeze({
    evidence: audioEngineeringPublicView(result.evidence),
    artifact: artifactIngestPublicView(result.ingest),
    candidateEligible: result.candidateEligible,
  });
}
