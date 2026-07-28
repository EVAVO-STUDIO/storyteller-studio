import {
  ingestAudioEngineeringArtifact,
  type AudioEngineeringArtifactResult,
} from "./audio-engineering-artifact.js";
import {
  assertAudioEngineeringEvidence,
  type AudioEngineeringEvidence,
} from "./audio-engineering.js";
import {
  ingestPrivateArtifact,
  type ArtifactIngestResult,
} from "./artifact-ingest.js";
import {
  assertArtifactRecord,
  quarantineArtifact,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import type { FileArtifactRegistry } from "./artifact-store.js";
import {
  assertAudiobookRetailTrackPlan,
  type AudiobookRetailTrack,
  type AudiobookRetailTrackPlan,
} from "./audiobook-retail-track-plan.js";
import {
  assertAudiobookRetailTrackRenderMatchesPlan,
  assertAudiobookRetailTrackRenderResult,
  type AudiobookRetailRenderedTrackEvidence,
  type AudiobookRetailTrackRenderResult,
} from "./audiobook-retail-track-render.js";
import {
  assertEvidenceMatchesGenerationPolicy,
  assertGenerationAudioEngineeringPolicy,
  type GenerationAudioEngineeringPolicy,
} from "./generation-audio-engineering.js";
import { stableHash, type Finding } from "./index.js";
import type { FilePrivateObjectStore } from "./private-object-store.js";
import type { StoredEnvelope } from "./project-store.js";

export const AUDIOBOOK_RETAIL_TRACK_ENCODE_SCHEMA_VERSION =
  "storyteller-audiobook-retail-track-encode-v1" as const;

export interface AudiobookRetailEncodedTrack {
  ordinal: number;
  role: AudiobookRetailTrack["role"];
  fileName: string;
  plannedTrackFingerprint: string;
  renderTrackFingerprint: string;
  commandFingerprint: string;
  artifact: StoredEnvelope<ArtifactRecord>;
  engineering: AudioEngineeringArtifactResult;
  expectedDurationMs: number;
  observedDurationMs: number;
  durationDriftMs: number;
  eligibleForReview: boolean;
  findingCodes: readonly string[];
  fingerprint: string;
}

export interface AudiobookRetailTrackEncodeChain {
  schemaVersion: typeof AUDIOBOOK_RETAIL_TRACK_ENCODE_SCHEMA_VERSION;
  projectId: string;
  bookId: string;
  jobId: string;
  planId: string;
  planFingerprint: string;
  planManifest: StoredEnvelope<ArtifactRecord>;
  renderEvidence: StoredEnvelope<ArtifactRecord>;
  referenceMaster: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
    contentHash: string;
    byteCount: number;
    rightsFingerprint: string;
  }>;
  engineeringProfile: Readonly<{
    id: string;
    externalVersion: string;
    fingerprint: string;
  }>;
  tracks: readonly AudiobookRetailEncodedTrack[];
  totalOutputBytes: number;
  eligibleForReview: boolean;
  findingCodes: readonly string[];
  createdAt: string;
  fingerprint: string;
}

export interface AudiobookRetailTrackEncodePublicTrack {
  ordinal: number;
  role: AudiobookRetailTrack["role"];
  fileName: string;
  expectedDurationMs: number;
  observedDurationMs: number;
  durationDriftMs: number;
  verificationStatus: ArtifactRecord["verification"]["status"];
  reviewStatus: ArtifactRecord["review"]["status"];
  engineeringEligible: boolean;
  eligibleForReview: boolean;
  findingCodes: readonly string[];
}

export interface AudiobookRetailTrackEncodePublicView {
  planId: string;
  bookId: string;
  trackCount: number;
  totalOutputBytes: number;
  engineeringProfileId: string;
  engineeringProfileVersion: string;
  tracks: readonly AudiobookRetailTrackEncodePublicTrack[];
  eligibleForReview: boolean;
  findingCodes: readonly string[];
  createdAt: string;
  fingerprint: string;
}

export interface IngestAudiobookRetailTrackRenderInput {
  plan: AudiobookRetailTrackPlan;
  render: AudiobookRetailTrackRenderResult;
  approvedReferenceArtifact: ArtifactRecord;
  actorId: string;
  verifierActorId?: string;
  engineering: GenerationAudioEngineeringPolicy;
  maximumDurationDriftMs?: number;
  now?: Date;
  signal?: AbortSignal;
}

export class AudiobookRetailTrackEncodeError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailTrackEncodeError";
    this.code = code;
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const FILE_NAME_PATTERN = /^[A-Za-z0-9]+\.mp3$/u;
const DEFAULT_DURATION_DRIFT_MS = 1_000;
const MAXIMUM_DURATION_DRIFT_MS = 10_000;
const MAXIMUM_TRACKS = 2_002;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailTrackEncodeError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailTrackEncodeError(code);
  }
  return value;
}

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new AudiobookRetailTrackEncodeError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailTrackEncodeError(code);
  }
  return value;
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

function stableArtifactId(kind: string, value: unknown): string {
  return `artifact_${kind}_${stableHash(value).slice(0, 24)}`;
}

function padded(value: number): string {
  return value.toString(10).padStart(4, "0");
}

function currentRights(
  rights: ArtifactRightsSnapshot,
  now: Date,
): void {
  requireIdentifier(
    rights.rightsEvidenceId,
    "AUDIOBOOK_RETAIL_TRACK_ENCODE_RIGHTS_ID_INVALID",
  );
  requireHash(
    rights.rightsFingerprint,
    "AUDIOBOOK_RETAIL_TRACK_ENCODE_RIGHTS_HASH_INVALID",
  );
  if (!rights.allowedUses.includes("audiobook")) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_AUDIOBOOK_RIGHTS_REQUIRED",
    );
  }
  if (!rights.commercialUseApproved) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_COMMERCIAL_RIGHTS_REQUIRED",
    );
  }
  if (rights.expiresAt && Date.parse(rights.expiresAt) <= now.getTime()) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_RIGHTS_EXPIRED",
    );
  }
  if (
    rights.deletionRequiredAt
    && Date.parse(rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_RETENTION_EXPIRED",
    );
  }
}

function assertApprovedReferenceArtifact(
  plan: AudiobookRetailTrackPlan,
  artifact: ArtifactRecord,
  now: Date,
): void {
  assertArtifactRecord(artifact);
  if (
    artifact.kind !== "audiobook-reference-master"
    || artifact.projectId !== plan.projectId
    || artifact.segmentId !== plan.bookId
    || artifact.id !== plan.referenceMaster.id
    || artifact.revision !== plan.referenceMaster.revision
    || artifact.fingerprint !== plan.referenceMaster.fingerprint
    || artifact.integrity.contentHash !== plan.referenceMaster.contentHash
    || artifact.integrity.byteCount !== plan.referenceMaster.byteCount
    || artifact.verification.status !== "verified"
    || artifact.review.status !== "approved"
    || artifact.quarantine !== undefined
    || artifact.release.status !== "unavailable"
  ) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_REFERENCE_MISMATCH",
    );
  }
  currentRights(artifact.rights, now);
}

function validateInput(
  input: IngestAudiobookRetailTrackRenderInput,
  now: Date,
): void {
  assertAudiobookRetailTrackPlan(input.plan);
  assertAudiobookRetailTrackRenderResult(input.render);
  assertAudiobookRetailTrackRenderMatchesPlan(input.render.evidence, input.plan);
  if (
    input.plan.status !== "ready-for-encoding"
    || input.plan.blockers.length !== 0
    || input.plan.tracks.length === 0
  ) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_PLAN_NOT_READY",
    );
  }
  assertApprovedReferenceArtifact(
    input.plan,
    input.approvedReferenceArtifact,
    now,
  );
  requireIdentifier(
    input.actorId,
    "AUDIOBOOK_RETAIL_TRACK_ENCODE_ACTOR_ID_INVALID",
  );
  requireIdentifier(
    input.verifierActorId ?? input.actorId,
    "AUDIOBOOK_RETAIL_TRACK_ENCODE_VERIFIER_ID_INVALID",
  );
  assertGenerationAudioEngineeringPolicy(input.engineering);
  if (
    input.engineering.profile.profile.minimumSampleRateHz
      > input.plan.output.sampleRateHz
    || (
      input.engineering.profile.profile.minimumBitRateKbps !== undefined
      && input.engineering.profile.profile.minimumBitRateKbps
        > input.plan.output.bitRateKbps
    )
  ) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_ENGINEERING_POLICY_UNSUPPORTED",
    );
  }
  if (input.signal?.aborted) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_ABORTED",
    );
  }
}

async function ingestEvidenceArtifact(
  objectStore: FilePrivateObjectStore,
  registry: FileArtifactRegistry,
  input: Readonly<{
    id: string;
    projectId: string;
    jobId: string;
    segmentId: string;
    takeId: string;
    bytes: Uint8Array;
    sourceContentHash: string;
    generationRequestHash: string;
    parentArtifactIds: readonly string[];
    rights: ArtifactRightsSnapshot;
    actorId: string;
    verifierActorId: string;
    now: Date;
    schemaCheck: string;
  }>,
): Promise<ArtifactIngestResult> {
  return await ingestPrivateArtifact(objectStore, registry, {
    id: input.id,
    kind: "audio-analysis",
    projectId: input.projectId,
    jobId: input.jobId,
    segmentId: input.segmentId,
    takeId: input.takeId,
    bytes: input.bytes,
    claimedMimeType: "application/json",
    claimedFormat: "json",
    provenance: {
      createdByActorId: input.actorId,
      sourceContentHash: input.sourceContentHash,
      generationRequestHash: input.generationRequestHash,
      parentArtifactIds: input.parentArtifactIds,
    },
    rights: input.rights,
    reviewRequired: false,
    actorId: input.actorId,
    verifierActorId: input.verifierActorId,
    verificationChecks: ["json-parse", input.schemaCheck],
    now: input.now,
  });
}

function postEncodeFindings(
  planned: AudiobookRetailTrack,
  rendered: AudiobookRetailRenderedTrackEvidence,
  evidence: AudioEngineeringEvidence,
  maximumDurationDriftMs: number,
): Readonly<{
  observedDurationMs: number;
  durationDriftMs: number;
  findings: readonly Finding[];
}> {
  assertAudioEngineeringEvidence(evidence);
  const observedDurationMs = Math.round(evidence.probe.durationSeconds * 1_000);
  const durationDriftMs = Math.abs(
    observedDurationMs - rendered.expectedDurationMs,
  );
  const findings: Finding[] = [];
  if (durationDriftMs > maximumDurationDriftMs) {
    findings.push({
      code: "AUDIOBOOK_RETAIL_TRACK_ENCODE_DURATION_DRIFT",
      severity: "error",
      message: `Encoded retail track duration differs from its approved source range by ${durationDriftMs} ms.`,
    });
  }
  const formatName = evidence.probe.formatName.toLocaleLowerCase("en-AU");
  const codecName = evidence.probe.codecName.toLocaleLowerCase("en-AU");
  if (!formatName.includes("mp3") || !codecName.includes("mp3")) {
    findings.push({
      code: "AUDIOBOOK_RETAIL_TRACK_ENCODE_CODEC_MISMATCH",
      severity: "error",
      message: "Independent inspection did not identify an MP3 retail track.",
    });
  }
  if (evidence.metrics.sampleRateHz !== planned.output.sampleRateHz) {
    findings.push({
      code: "AUDIOBOOK_RETAIL_TRACK_ENCODE_SAMPLE_RATE_MISMATCH",
      severity: "error",
      message: "Encoded retail track sample rate differs from approved output intent.",
    });
  }
  if (evidence.metrics.channels !== planned.output.channels) {
    findings.push({
      code: "AUDIOBOOK_RETAIL_TRACK_ENCODE_CHANNEL_MISMATCH",
      severity: "error",
      message: "Encoded retail track channel count differs from approved output intent.",
    });
  }
  const observedBitRate = evidence.metrics.bitRateKbps;
  const bitRateTolerance = Math.max(
    4,
    Math.ceil(planned.output.bitRateKbps * 0.03),
  );
  if (
    observedBitRate === undefined
    || Math.abs(observedBitRate - planned.output.bitRateKbps)
      > bitRateTolerance
  ) {
    findings.push({
      code: "AUDIOBOOK_RETAIL_TRACK_ENCODE_BIT_RATE_MISMATCH",
      severity: "error",
      message: "Encoded retail track bit rate differs from approved constant-bit-rate intent.",
    });
  }
  return Object.freeze({
    observedDurationMs,
    durationDriftMs,
    findings: Object.freeze(findings),
  });
}

function encodedTrackFingerprint(
  value: Omit<AudiobookRetailEncodedTrack, "fingerprint">,
): string {
  return stableHash({
    ordinal: value.ordinal,
    role: value.role,
    fileName: value.fileName,
    plannedTrackFingerprint: value.plannedTrackFingerprint,
    renderTrackFingerprint: value.renderTrackFingerprint,
    commandFingerprint: value.commandFingerprint,
    artifact: {
      id: value.artifact.payload.id,
      revision: value.artifact.revision,
      fingerprint: value.artifact.payload.fingerprint,
    },
    engineering: {
      artifactId: value.engineering.ingest.envelope.payload.id,
      revision: value.engineering.ingest.envelope.revision,
      evidenceFingerprint: value.engineering.evidence.fingerprint,
    },
    expectedDurationMs: value.expectedDurationMs,
    observedDurationMs: value.observedDurationMs,
    durationDriftMs: value.durationDriftMs,
    eligibleForReview: value.eligibleForReview,
    findingCodes: value.findingCodes,
  });
}

function chainFingerprint(
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

function trackFindingCodes(
  engineering: AudioEngineeringArtifactResult,
  findings: readonly Finding[],
): readonly string[] {
  return Object.freeze([
    ...new Set([
      ...engineering.evidence.findings
        .filter((finding) => finding.severity === "error")
        .map((finding) => finding.code),
      ...findings
        .filter((finding) => finding.severity === "error")
        .map((finding) => finding.code),
    ]),
  ].sort((left, right) => left.localeCompare(right, "en-AU")));
}

export async function ingestAudiobookRetailTrackRender(
  objectStore: FilePrivateObjectStore,
  registry: FileArtifactRegistry,
  input: IngestAudiobookRetailTrackRenderInput,
): Promise<AudiobookRetailTrackEncodeChain> {
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_DATE_INVALID",
    );
  }
  validateInput(input, now);
  const maximumDurationDriftMs = input.maximumDurationDriftMs
    ?? DEFAULT_DURATION_DRIFT_MS;
  requireInteger(
    maximumDurationDriftMs,
    0,
    MAXIMUM_DURATION_DRIFT_MS,
    "AUDIOBOOK_RETAIL_TRACK_ENCODE_DURATION_TOLERANCE_INVALID",
  );
  const verifierActorId = input.verifierActorId ?? input.actorId;
  const rights = input.approvedReferenceArtifact.rights;
  const scopeHash = stableHash({
    plan: input.plan.fingerprint,
    render: input.render.evidence.fingerprint,
    reference: input.approvedReferenceArtifact.fingerprint,
  });
  const jobId = `job_audiobook_retail_encode_${scopeHash.slice(0, 24)}`;
  const takeId = `take_audiobook_retail_encode_${scopeHash.slice(0, 24)}`;

  const planManifest = await ingestEvidenceArtifact(objectStore, registry, {
    id: stableArtifactId("audiobook_retail_track_plan", input.plan.fingerprint),
    projectId: input.plan.projectId,
    jobId,
    segmentId: input.plan.bookId,
    takeId,
    bytes: jsonBytes(input.plan),
    sourceContentHash: input.plan.fingerprint,
    generationRequestHash: input.plan.fingerprint,
    parentArtifactIds: [input.approvedReferenceArtifact.id],
    rights,
    actorId: input.actorId,
    verifierActorId,
    now,
    schemaCheck: "audiobook-retail-track-plan-schema",
  });
  if (!planManifest.accepted) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_PLAN_ARTIFACT_INVALID",
    );
  }

  const renderEvidence = await ingestEvidenceArtifact(objectStore, registry, {
    id: stableArtifactId(
      "audiobook_retail_track_render",
      input.render.evidence.fingerprint,
    ),
    projectId: input.plan.projectId,
    jobId,
    segmentId: input.plan.bookId,
    takeId,
    bytes: jsonBytes(input.render.evidence),
    sourceContentHash: input.approvedReferenceArtifact.integrity.contentHash,
    generationRequestHash: input.render.evidence.fingerprint,
    parentArtifactIds: [
      planManifest.envelope.payload.id,
      input.approvedReferenceArtifact.id,
    ],
    rights,
    actorId: input.actorId,
    verifierActorId,
    now,
    schemaCheck: "audiobook-retail-track-render-schema",
  });
  if (!renderEvidence.accepted) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_RENDER_ARTIFACT_INVALID",
    );
  }

  const encodedTracks: AudiobookRetailEncodedTrack[] = [];
  for (const [index, planned] of input.plan.tracks.entries()) {
    if (input.signal?.aborted) {
      throw new AudiobookRetailTrackEncodeError(
        "AUDIOBOOK_RETAIL_TRACK_ENCODE_ABORTED",
      );
    }
    const rendered = input.render.evidence.tracks[index];
    const output = input.render.tracks[index];
    if (!rendered || !output) {
      throw new AudiobookRetailTrackEncodeError(
        "AUDIOBOOK_RETAIL_TRACK_ENCODE_RENDER_TRACK_MISSING",
      );
    }
    const trackTakeId = `take_retail_${scopeHash.slice(0, 16)}_${padded(planned.ordinal)}`;
    const segmentId = `retail_track_${scopeHash.slice(0, 16)}_${padded(planned.ordinal)}`;
    const trackIngest = await ingestPrivateArtifact(objectStore, registry, {
      id: stableArtifactId("audiobook_retail_track", {
        plan: input.plan.fingerprint,
        track: rendered.fingerprint,
        contentHash: rendered.output.contentHash,
      }),
      kind: "audiobook-retail-track",
      projectId: input.plan.projectId,
      jobId,
      segmentId,
      takeId: trackTakeId,
      bytes: output.bytes,
      claimedMimeType: "audio/mpeg",
      claimedFormat: "mp3",
      provenance: {
        createdByActorId: input.actorId,
        sourceContentHash: input.approvedReferenceArtifact.integrity.contentHash,
        generationRequestHash: rendered.commandFingerprint,
        parentArtifactIds: [
          renderEvidence.envelope.payload.id,
          input.approvedReferenceArtifact.id,
        ],
      },
      rights,
      reviewRequired: true,
      actorId: input.actorId,
      verifierActorId,
      verificationChecks: [
        "retail-track-output-hash",
        "retail-track-output-size",
        "retail-track-output-signature",
        "retail-track-source-range",
        "constant-bit-rate-intent",
      ],
      now,
    });
    if (
      !trackIngest.accepted
      && trackIngest.envelope.payload.verification.status !== "quarantined"
    ) {
      throw new AudiobookRetailTrackEncodeError(
        "AUDIOBOOK_RETAIL_TRACK_ENCODE_ARTIFACT_INVALID",
      );
    }

    const engineering = await ingestAudioEngineeringArtifact(
      objectStore,
      registry,
      {
        candidateArtifactId: trackIngest.envelope.payload.id,
        projectId: input.plan.projectId,
        jobId,
        segmentId,
        takeId: trackTakeId,
        generationRequestHash: rendered.commandFingerprint,
        bytes: output.bytes,
        format: "mp3",
        rights,
        actorId: input.actorId,
        verifierActorId,
        profile: input.engineering.profile.profile,
        profileVersion: input.engineering.profile.externalVersion,
        profileReviewedAt: input.engineering.profile.reviewedAt,
        profileSourceReference: input.engineering.profile.sourceReference,
        ...(input.engineering.runner
          ? { runner: input.engineering.runner }
          : {}),
        ...(input.engineering.ffprobePath
          ? { ffprobePath: input.engineering.ffprobePath }
          : {}),
        ...(input.engineering.ffmpegPath
          ? { ffmpegPath: input.engineering.ffmpegPath }
          : {}),
        ...(input.engineering.timeoutMs !== undefined
          ? { timeoutMs: input.engineering.timeoutMs }
          : {}),
        ...(input.engineering.maximumOutputBytes !== undefined
          ? { maximumOutputBytes: input.engineering.maximumOutputBytes }
          : {}),
        ...(input.engineering.temporaryRoot
          ? { temporaryRoot: input.engineering.temporaryRoot }
          : {}),
        now,
        ...(input.signal ? { signal: input.signal } : {}),
      },
    );
    assertEvidenceMatchesGenerationPolicy(
      input.engineering,
      engineering.evidence,
    );
    const comparison = postEncodeFindings(
      planned,
      rendered,
      engineering.evidence,
      maximumDurationDriftMs,
    );
    const findingCodes = trackFindingCodes(engineering, comparison.findings);
    const eligibleForReview = trackIngest.accepted
      && engineering.candidateEligible
      && comparison.findings.every((finding) => finding.severity !== "error");
    let artifactEnvelope = trackIngest.envelope;
    if (
      !eligibleForReview
      && artifactEnvelope.payload.verification.status === "verified"
    ) {
      const quarantined = quarantineArtifact(artifactEnvelope.payload, {
        code: "AUDIOBOOK_RETAIL_TRACK_ENCODE_ENGINEERING_INELIGIBLE",
        message: "The encoded retail MP3 failed independent engineering or source-range comparison.",
        actorId: verifierActorId,
        findings: [
          ...engineering.evidence.findings,
          ...comparison.findings,
        ],
        quarantinedAt: now,
      });
      artifactEnvelope = await registry.save(quarantined, {
        expectedRevision: artifactEnvelope.revision,
        actorId: verifierActorId,
        action: "artifact.audiobook_retail_track_quarantined",
      });
    }

    const trackBase: Omit<AudiobookRetailEncodedTrack, "fingerprint"> = {
      ordinal: planned.ordinal,
      role: planned.role,
      fileName: planned.fileName,
      plannedTrackFingerprint: planned.fingerprint,
      renderTrackFingerprint: rendered.fingerprint,
      commandFingerprint: rendered.commandFingerprint,
      artifact: artifactEnvelope,
      engineering,
      expectedDurationMs: rendered.expectedDurationMs,
      observedDurationMs: comparison.observedDurationMs,
      durationDriftMs: comparison.durationDriftMs,
      eligibleForReview,
      findingCodes,
    };
    encodedTracks.push(Object.freeze({
      ...trackBase,
      fingerprint: encodedTrackFingerprint(trackBase),
    }));
  }

  const findingCodes = Object.freeze([
    ...new Set(encodedTracks.flatMap((track) => track.findingCodes)),
  ].sort((left, right) => left.localeCompare(right, "en-AU")));
  const totalOutputBytes = encodedTracks.reduce(
    (total, track) => total + track.artifact.payload.integrity.byteCount,
    0,
  );
  const partial: Omit<AudiobookRetailTrackEncodeChain, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_TRACK_ENCODE_SCHEMA_VERSION,
    projectId: input.plan.projectId,
    bookId: input.plan.bookId,
    jobId,
    planId: input.plan.id,
    planFingerprint: input.plan.fingerprint,
    planManifest: planManifest.envelope,
    renderEvidence: renderEvidence.envelope,
    referenceMaster: Object.freeze({
      id: input.approvedReferenceArtifact.id,
      revision: input.approvedReferenceArtifact.revision,
      fingerprint: input.approvedReferenceArtifact.fingerprint,
      contentHash: input.approvedReferenceArtifact.integrity.contentHash,
      byteCount: input.approvedReferenceArtifact.integrity.byteCount,
      rightsFingerprint: rights.rightsFingerprint,
    }),
    engineeringProfile: Object.freeze({
      id: input.engineering.profile.profile.id,
      externalVersion: input.engineering.profile.externalVersion,
      fingerprint: input.engineering.profile.fingerprint,
    }),
    tracks: Object.freeze(encodedTracks),
    totalOutputBytes,
    eligibleForReview: encodedTracks.every((track) => track.eligibleForReview),
    findingCodes,
    createdAt: now.toISOString(),
  };
  const chain = Object.freeze({
    ...partial,
    fingerprint: chainFingerprint(partial),
  });
  assertAudiobookRetailTrackEncodeChain(chain);
  assertAudiobookRetailTrackEncodeMatchesSources(chain, {
    plan: input.plan,
    render: input.render,
    approvedReferenceArtifact: input.approvedReferenceArtifact,
  });
  return chain;
}

function assertArtifactEnvelope(
  envelope: StoredEnvelope<ArtifactRecord>,
  kind: ArtifactRecord["kind"],
  code: string,
): void {
  assertArtifactRecord(envelope.payload);
  if (
    envelope.schemaVersion !== "storyteller-store-v1"
    || envelope.entityType !== "artifact"
    || envelope.entityId !== envelope.payload.id
    || envelope.revision !== envelope.payload.revision
    || envelope.payload.kind !== kind
    || envelope.contentHash !== stableHash(envelope.payload)
  ) {
    throw new AudiobookRetailTrackEncodeError(code);
  }
}

function assertEncodedTrack(
  track: AudiobookRetailEncodedTrack,
  chain: Pick<
    AudiobookRetailTrackEncodeChain,
    "projectId" | "jobId" | "referenceMaster" | "renderEvidence"
  >,
): void {
  requireInteger(
    track.ordinal,
    1,
    MAXIMUM_TRACKS,
    "AUDIOBOOK_RETAIL_TRACK_ENCODE_ORDINAL_INVALID",
  );
  if (!FILE_NAME_PATTERN.test(track.fileName)) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_FILE_NAME_INVALID",
    );
  }
  requireHash(
    track.plannedTrackFingerprint,
    "AUDIOBOOK_RETAIL_TRACK_ENCODE_PLAN_TRACK_HASH_INVALID",
  );
  requireHash(
    track.renderTrackFingerprint,
    "AUDIOBOOK_RETAIL_TRACK_ENCODE_RENDER_TRACK_HASH_INVALID",
  );
  requireHash(
    track.commandFingerprint,
    "AUDIOBOOK_RETAIL_TRACK_ENCODE_COMMAND_HASH_INVALID",
  );
  assertArtifactEnvelope(
    track.artifact,
    "audiobook-retail-track",
    "AUDIOBOOK_RETAIL_TRACK_ENCODE_ARTIFACT_ENVELOPE_INVALID",
  );
  assertArtifactEnvelope(
    track.engineering.ingest.envelope,
    "audio-analysis",
    "AUDIOBOOK_RETAIL_TRACK_ENCODE_ENGINEERING_ENVELOPE_INVALID",
  );
  assertAudioEngineeringEvidence(track.engineering.evidence);
  const artifact = track.artifact.payload;
  const engineeringArtifact = track.engineering.ingest.envelope.payload;
  if (
    artifact.projectId !== chain.projectId
    || artifact.jobId !== chain.jobId
    || artifact.integrity.mimeType !== "audio/mpeg"
    || artifact.integrity.format !== "mp3"
    || artifact.rights.rightsFingerprint
      !== chain.referenceMaster.rightsFingerprint
    || artifact.provenance.sourceContentHash
      !== chain.referenceMaster.contentHash
    || artifact.provenance.generationRequestHash !== track.commandFingerprint
    || stableHash(artifact.provenance.parentArtifactIds)
      !== stableHash([
        chain.renderEvidence.payload.id,
        chain.referenceMaster.id,
      ])
    || engineeringArtifact.projectId !== chain.projectId
    || engineeringArtifact.jobId !== chain.jobId
    || engineeringArtifact.segmentId !== artifact.segmentId
    || engineeringArtifact.takeId !== artifact.takeId
    || stableHash(engineeringArtifact.provenance.parentArtifactIds)
      !== stableHash([artifact.id])
    || engineeringArtifact.provenance.sourceContentHash
      !== artifact.integrity.contentHash
    || track.engineering.evidence.inputContentHash
      !== artifact.integrity.contentHash
    || track.engineering.evidence.inputByteCount
      !== artifact.integrity.byteCount
  ) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_ARTIFACT_GRAPH_INVALID",
    );
  }
  requireInteger(
    track.expectedDurationMs,
    1,
    7_200_000,
    "AUDIOBOOK_RETAIL_TRACK_ENCODE_EXPECTED_DURATION_INVALID",
  );
  requireInteger(
    track.observedDurationMs,
    1,
    7_200_000 + MAXIMUM_DURATION_DRIFT_MS,
    "AUDIOBOOK_RETAIL_TRACK_ENCODE_OBSERVED_DURATION_INVALID",
  );
  requireInteger(
    track.durationDriftMs,
    0,
    MAXIMUM_DURATION_DRIFT_MS + 7_200_000,
    "AUDIOBOOK_RETAIL_TRACK_ENCODE_DURATION_DRIFT_INVALID",
  );
  if (
    track.durationDriftMs
      !== Math.abs(track.observedDurationMs - track.expectedDurationMs)
    || track.engineering.candidateEligible
      !== (
        track.engineering.evidence.eligible
        && track.engineering.ingest.accepted
      )
  ) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_ENGINEERING_STATE_INVALID",
    );
  }
  if (
    !Array.isArray(track.findingCodes)
    || track.findingCodes.length > 128
    || new Set(track.findingCodes).size !== track.findingCodes.length
    || track.findingCodes.some((code) => !/^[A-Z][A-Z0-9_]{2,95}$/u.test(code))
  ) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_FINDINGS_INVALID",
    );
  }
  const shouldBeEligible = artifact.verification.status === "verified"
    && track.engineering.candidateEligible
    && track.findingCodes.length === 0;
  if (track.eligibleForReview !== shouldBeEligible) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_ELIGIBILITY_INVALID",
    );
  }
  if (
    track.eligibleForReview
    && (
      artifact.review.status !== "pending"
      || artifact.quarantine !== undefined
    )
  ) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_REVIEW_STATE_INVALID",
    );
  }
  if (
    !track.eligibleForReview
    && artifact.verification.status === "verified"
  ) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_FAILED_TRACK_NOT_QUARANTINED",
    );
  }
  const { fingerprint, ...partial } = track;
  if (
    !HASH_PATTERN.test(fingerprint)
    || encodedTrackFingerprint(partial) !== fingerprint
  ) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_TRACK_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailTrackEncodeChain(
  chain: AudiobookRetailTrackEncodeChain,
): void {
  if (
    chain.schemaVersion !== AUDIOBOOK_RETAIL_TRACK_ENCODE_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [chain.projectId, "AUDIOBOOK_RETAIL_TRACK_ENCODE_PROJECT_ID_INVALID"],
    [chain.bookId, "AUDIOBOOK_RETAIL_TRACK_ENCODE_BOOK_ID_INVALID"],
    [chain.jobId, "AUDIOBOOK_RETAIL_TRACK_ENCODE_JOB_ID_INVALID"],
    [chain.planId, "AUDIOBOOK_RETAIL_TRACK_ENCODE_PLAN_ID_INVALID"],
    [chain.referenceMaster.id, "AUDIOBOOK_RETAIL_TRACK_ENCODE_REFERENCE_ID_INVALID"],
    [chain.engineeringProfile.id, "AUDIOBOOK_RETAIL_TRACK_ENCODE_PROFILE_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  for (const [value, code] of [
    [chain.planFingerprint, "AUDIOBOOK_RETAIL_TRACK_ENCODE_PLAN_HASH_INVALID"],
    [chain.referenceMaster.fingerprint, "AUDIOBOOK_RETAIL_TRACK_ENCODE_REFERENCE_HASH_INVALID"],
    [chain.referenceMaster.contentHash, "AUDIOBOOK_RETAIL_TRACK_ENCODE_REFERENCE_CONTENT_HASH_INVALID"],
    [chain.referenceMaster.rightsFingerprint, "AUDIOBOOK_RETAIL_TRACK_ENCODE_RIGHTS_HASH_INVALID"],
    [chain.engineeringProfile.fingerprint, "AUDIOBOOK_RETAIL_TRACK_ENCODE_PROFILE_HASH_INVALID"],
  ] as const) requireHash(value, code);
  requireInteger(
    chain.referenceMaster.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_TRACK_ENCODE_REFERENCE_REVISION_INVALID",
  );
  requireInteger(
    chain.referenceMaster.byteCount,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_TRACK_ENCODE_REFERENCE_SIZE_INVALID",
  );
  if (!chain.engineeringProfile.externalVersion.trim()) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_PROFILE_VERSION_INVALID",
    );
  }
  assertArtifactEnvelope(
    chain.planManifest,
    "audio-analysis",
    "AUDIOBOOK_RETAIL_TRACK_ENCODE_PLAN_ENVELOPE_INVALID",
  );
  assertArtifactEnvelope(
    chain.renderEvidence,
    "audio-analysis",
    "AUDIOBOOK_RETAIL_TRACK_ENCODE_RENDER_ENVELOPE_INVALID",
  );
  const planArtifact = chain.planManifest.payload;
  const renderArtifact = chain.renderEvidence.payload;
  if (
    planArtifact.projectId !== chain.projectId
    || planArtifact.jobId !== chain.jobId
    || planArtifact.segmentId !== chain.bookId
    || planArtifact.provenance.sourceContentHash !== chain.planFingerprint
    || stableHash(planArtifact.provenance.parentArtifactIds)
      !== stableHash([chain.referenceMaster.id])
    || renderArtifact.projectId !== chain.projectId
    || renderArtifact.jobId !== chain.jobId
    || renderArtifact.segmentId !== chain.bookId
    || renderArtifact.provenance.sourceContentHash
      !== chain.referenceMaster.contentHash
    || stableHash(renderArtifact.provenance.parentArtifactIds)
      !== stableHash([planArtifact.id, chain.referenceMaster.id])
  ) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_EVIDENCE_GRAPH_INVALID",
    );
  }
  if (
    !Array.isArray(chain.tracks)
    || chain.tracks.length === 0
    || chain.tracks.length > MAXIMUM_TRACKS
  ) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_TRACKS_INVALID",
    );
  }
  const names = new Set<string>();
  let totalOutputBytes = 0;
  for (const [index, track] of chain.tracks.entries()) {
    assertEncodedTrack(track, chain);
    if (track.ordinal !== index + 1 || names.has(track.fileName)) {
      throw new AudiobookRetailTrackEncodeError(
        "AUDIOBOOK_RETAIL_TRACK_ENCODE_TRACK_ORDER_INVALID",
      );
    }
    names.add(track.fileName);
    totalOutputBytes += track.artifact.payload.integrity.byteCount;
  }
  requireInteger(
    chain.totalOutputBytes,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_TRACK_ENCODE_TOTAL_SIZE_INVALID",
  );
  if (chain.totalOutputBytes !== totalOutputBytes) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_TOTAL_SIZE_MISMATCH",
    );
  }
  if (
    !Array.isArray(chain.findingCodes)
    || new Set(chain.findingCodes).size !== chain.findingCodes.length
    || stableHash(chain.findingCodes)
      !== stableHash([
        ...new Set(chain.tracks.flatMap((track) => track.findingCodes)),
      ].sort((left, right) => left.localeCompare(right, "en-AU")))
  ) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_CHAIN_FINDINGS_INVALID",
    );
  }
  if (
    chain.eligibleForReview
      !== chain.tracks.every((track) => track.eligibleForReview)
    || (chain.eligibleForReview && chain.findingCodes.length !== 0)
  ) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_CHAIN_ELIGIBILITY_INVALID",
    );
  }
  requireDate(chain.createdAt, "AUDIOBOOK_RETAIL_TRACK_ENCODE_DATE_INVALID");
  const { fingerprint, ...partial } = chain;
  if (
    !HASH_PATTERN.test(fingerprint)
    || chainFingerprint(partial) !== fingerprint
  ) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_CHAIN_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailTrackEncodeMatchesSources(
  chain: AudiobookRetailTrackEncodeChain,
  input: Readonly<{
    plan: AudiobookRetailTrackPlan;
    render: AudiobookRetailTrackRenderResult;
    approvedReferenceArtifact: ArtifactRecord;
  }>,
): void {
  assertAudiobookRetailTrackEncodeChain(chain);
  assertAudiobookRetailTrackPlan(input.plan);
  assertAudiobookRetailTrackRenderResult(input.render);
  assertAudiobookRetailTrackRenderMatchesPlan(input.render.evidence, input.plan);
  assertArtifactRecord(input.approvedReferenceArtifact);
  if (
    chain.projectId !== input.plan.projectId
    || chain.bookId !== input.plan.bookId
    || chain.planId !== input.plan.id
    || chain.planFingerprint !== input.plan.fingerprint
    || chain.referenceMaster.id !== input.approvedReferenceArtifact.id
    || chain.referenceMaster.revision
      !== input.approvedReferenceArtifact.revision
    || chain.referenceMaster.fingerprint
      !== input.approvedReferenceArtifact.fingerprint
    || chain.referenceMaster.contentHash
      !== input.approvedReferenceArtifact.integrity.contentHash
    || chain.referenceMaster.byteCount
      !== input.approvedReferenceArtifact.integrity.byteCount
    || chain.referenceMaster.rightsFingerprint
      !== input.approvedReferenceArtifact.rights.rightsFingerprint
    || chain.tracks.length !== input.plan.tracks.length
    || chain.tracks.length !== input.render.evidence.tracks.length
  ) {
    throw new AudiobookRetailTrackEncodeError(
      "AUDIOBOOK_RETAIL_TRACK_ENCODE_SOURCE_MISMATCH",
    );
  }
  for (const [index, encoded] of chain.tracks.entries()) {
    const planned = input.plan.tracks[index];
    const rendered = input.render.evidence.tracks[index];
    const output = input.render.tracks[index];
    if (
      !planned
      || !rendered
      || !output
      || encoded.ordinal !== planned.ordinal
      || encoded.role !== planned.role
      || encoded.fileName !== planned.fileName
      || encoded.plannedTrackFingerprint !== planned.fingerprint
      || encoded.renderTrackFingerprint !== rendered.fingerprint
      || encoded.commandFingerprint !== rendered.commandFingerprint
      || encoded.expectedDurationMs !== rendered.expectedDurationMs
      || encoded.artifact.payload.integrity.contentHash
        !== rendered.output.contentHash
      || encoded.artifact.payload.integrity.byteCount
        !== rendered.output.byteCount
      || output.bytes.byteLength !== rendered.output.byteCount
    ) {
      throw new AudiobookRetailTrackEncodeError(
        "AUDIOBOOK_RETAIL_TRACK_ENCODE_SOURCE_MISMATCH",
      );
    }
  }
}

export function audiobookRetailTrackEncodePublicView(
  chain: AudiobookRetailTrackEncodeChain,
): AudiobookRetailTrackEncodePublicView {
  assertAudiobookRetailTrackEncodeChain(chain);
  return Object.freeze({
    planId: chain.planId,
    bookId: chain.bookId,
    trackCount: chain.tracks.length,
    totalOutputBytes: chain.totalOutputBytes,
    engineeringProfileId: chain.engineeringProfile.id,
    engineeringProfileVersion: chain.engineeringProfile.externalVersion,
    tracks: Object.freeze(chain.tracks.map((track) => Object.freeze({
      ordinal: track.ordinal,
      role: track.role,
      fileName: track.fileName,
      expectedDurationMs: track.expectedDurationMs,
      observedDurationMs: track.observedDurationMs,
      durationDriftMs: track.durationDriftMs,
      verificationStatus: track.artifact.payload.verification.status,
      reviewStatus: track.artifact.payload.review.status,
      engineeringEligible: track.engineering.candidateEligible,
      eligibleForReview: track.eligibleForReview,
      findingCodes: track.findingCodes,
    }))),
    eligibleForReview: chain.eligibleForReview,
    findingCodes: chain.findingCodes,
    createdAt: chain.createdAt,
    fingerprint: chain.fingerprint,
  });
}
