import { createHash } from "node:crypto";
import {
  ingestAudioEngineeringArtifact,
  type AudioEngineeringArtifactResult,
} from "./audio-engineering-artifact.js";
import {
  assertAudioEngineeringEvidence,
  type AudioEngineeringEvidence,
} from "./audio-engineering.js";
import {
  assertAudiobookRenderEvidence,
  type AudiobookRenderResult,
} from "./audiobook-render.js";
import {
  assertAudiobookSequence,
  type AudiobookSequence,
} from "./audiobook-sequence.js";
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
  assertEvidenceMatchesGenerationPolicy,
  assertGenerationAudioEngineeringPolicy,
  type GenerationAudioEngineeringPolicy,
} from "./generation-audio-engineering.js";
import { stableHash, type Finding } from "./index.js";
import type { FilePrivateObjectStore } from "./private-object-store.js";
import type { StoredEnvelope } from "./project-store.js";

export const AUDIOBOOK_REFERENCE_MASTER_SCHEMA_VERSION =
  "storyteller-audiobook-reference-master-v1" as const;

export interface IngestAudiobookReferenceMasterInput {
  sequence: AudiobookSequence;
  render: AudiobookRenderResult;
  rights: ArtifactRightsSnapshot;
  actorId: string;
  verifierActorId?: string;
  engineering: GenerationAudioEngineeringPolicy;
  maximumDurationDriftMs?: number;
  now?: Date;
  signal?: AbortSignal;
}

export interface AudiobookReferenceMasterChain {
  schemaVersion: typeof AUDIOBOOK_REFERENCE_MASTER_SCHEMA_VERSION;
  sequenceId: string;
  sequenceRevision: number;
  sequenceFingerprint: string;
  sequenceManifest: StoredEnvelope<ArtifactRecord>;
  renderEvidence: StoredEnvelope<ArtifactRecord>;
  referenceMaster: StoredEnvelope<ArtifactRecord>;
  postRenderEngineering: AudioEngineeringArtifactResult;
  expectedDurationMs: number;
  observedDurationMs: number;
  durationDriftMs: number;
  eligibleForReview: boolean;
  findingCodes: readonly string[];
  fingerprint: string;
}

export interface AudiobookReferenceMasterPublicView {
  sequenceId: string;
  sequenceRevision: number;
  sequenceFingerprint: string;
  referenceArtifactId: string;
  referenceRevision: number;
  verificationStatus: ArtifactRecord["verification"]["status"];
  reviewStatus: ArtifactRecord["review"]["status"];
  engineeringProfileId: string;
  engineeringProfileVersion: string;
  expectedDurationMs: number;
  observedDurationMs: number;
  durationDriftMs: number;
  eligibleForReview: boolean;
  findingCodes: readonly string[];
  fingerprint: string;
}

export class AudiobookReferenceMasterError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookReferenceMasterError";
    this.code = code;
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const DEFAULT_DURATION_DRIFT_MS = 250;
const MAXIMUM_DURATION_DRIFT_MS = 10_000;

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookReferenceMasterError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookReferenceMasterError(code);
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
    throw new AudiobookReferenceMasterError(code);
  }
  return value;
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

function stableArtifactId(kind: string, value: unknown): string {
  return `artifact_${kind}_${stableHash(value).slice(0, 24)}`;
}

function requireRights(
  rights: ArtifactRightsSnapshot,
  sequence: AudiobookSequence,
  now: Date,
): void {
  requireIdentifier(
    rights.rightsEvidenceId,
    "AUDIOBOOK_REFERENCE_MASTER_RIGHTS_ID_INVALID",
  );
  requireHash(
    rights.rightsFingerprint,
    "AUDIOBOOK_REFERENCE_MASTER_RIGHTS_HASH_INVALID",
  );
  if (rights.rightsFingerprint !== sequence.rightsFingerprint) {
    throw new AudiobookReferenceMasterError(
      "AUDIOBOOK_REFERENCE_MASTER_RIGHTS_SCOPE_MISMATCH",
    );
  }
  if (!rights.allowedUses.includes("audiobook")) {
    throw new AudiobookReferenceMasterError(
      "AUDIOBOOK_REFERENCE_MASTER_AUDIOBOOK_RIGHTS_REQUIRED",
    );
  }
  if (!rights.commercialUseApproved) {
    throw new AudiobookReferenceMasterError(
      "AUDIOBOOK_REFERENCE_MASTER_COMMERCIAL_RIGHTS_REQUIRED",
    );
  }
  if (rights.expiresAt && Date.parse(rights.expiresAt) <= now.getTime()) {
    throw new AudiobookReferenceMasterError(
      "AUDIOBOOK_REFERENCE_MASTER_RIGHTS_EXPIRED",
    );
  }
  if (
    rights.deletionRequiredAt
    && Date.parse(rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new AudiobookReferenceMasterError(
      "AUDIOBOOK_REFERENCE_MASTER_RETENTION_EXPIRED",
    );
  }
}

function assertRenderMatchesSequence(
  sequence: AudiobookSequence,
  render: AudiobookRenderResult,
): void {
  assertAudiobookSequence(sequence);
  assertAudiobookRenderEvidence(render.evidence);
  if (!(render.bytes instanceof Uint8Array) || render.bytes.byteLength === 0) {
    throw new AudiobookReferenceMasterError(
      "AUDIOBOOK_REFERENCE_MASTER_BYTES_REQUIRED",
    );
  }
  if (
    render.evidence.sequenceId !== sequence.id
    || render.evidence.sequenceRevision !== sequence.revision
    || render.evidence.sequenceFingerprint !== sequence.fingerprint
    || render.evidence.expectedDurationMs !== sequence.totalDurationMs
    || render.evidence.sources.length !== sequence.components.length
  ) {
    throw new AudiobookReferenceMasterError(
      "AUDIOBOOK_REFERENCE_MASTER_RENDER_SEQUENCE_MISMATCH",
    );
  }
  for (const [index, component] of sequence.components.entries()) {
    const source = render.evidence.sources[index];
    if (
      !source
      || source.ordinal !== component.ordinal
      || source.artifactId !== component.artifact.id
      || source.artifactFingerprint !== component.artifact.fingerprint
      || source.contentHash !== component.artifact.contentHash
      || source.byteCount !== component.artifact.byteCount
    ) {
      throw new AudiobookReferenceMasterError(
        "AUDIOBOOK_REFERENCE_MASTER_RENDER_SOURCE_MISMATCH",
      );
    }
  }
  if (
    render.evidence.output.contentHash !== hashBytes(render.bytes)
    || render.evidence.output.byteCount !== render.bytes.byteLength
  ) {
    throw new AudiobookReferenceMasterError(
      "AUDIOBOOK_REFERENCE_MASTER_RENDER_OUTPUT_MISMATCH",
    );
  }
  if (
    render.evidence.output.format !== sequence.output.format
    || render.evidence.output.sampleRateHz !== sequence.output.sampleRateHz
    || render.evidence.output.channels !== sequence.output.channels
    || render.evidence.output.bitDepth !== sequence.output.bitDepth
  ) {
    throw new AudiobookReferenceMasterError(
      "AUDIOBOOK_REFERENCE_MASTER_RENDER_PROFILE_MISMATCH",
    );
  }
}

function codecMatchesBitDepth(
  codecName: string,
  bitDepth: 16 | 24 | 32,
): boolean {
  const codec = codecName.toLocaleLowerCase("en-AU");
  if (bitDepth === 16) return /^pcm_[su]16(?:le|be)$/u.test(codec);
  if (bitDepth === 24) return /^pcm_[su]24(?:le|be)$/u.test(codec);
  return /^pcm_(?:[su]32|f32)(?:le|be)$/u.test(codec);
}

function postRenderFindings(
  sequence: AudiobookSequence,
  engineering: AudioEngineeringArtifactResult,
  maximumDurationDriftMs: number,
): Readonly<{
  observedDurationMs: number;
  durationDriftMs: number;
  findings: readonly Finding[];
}> {
  assertAudioEngineeringEvidence(engineering.evidence);
  const observedDurationMs = Math.round(
    engineering.evidence.probe.durationSeconds * 1_000,
  );
  const durationDriftMs = Math.abs(observedDurationMs - sequence.totalDurationMs);
  const findings: Finding[] = [];
  if (durationDriftMs > maximumDurationDriftMs) {
    findings.push({
      code: "AUDIOBOOK_REFERENCE_MASTER_DURATION_DRIFT",
      severity: "error",
      message: `Reference render duration differs from the approved sequence by ${durationDriftMs} ms.`,
    });
  }
  if (engineering.evidence.metrics.sampleRateHz !== sequence.output.sampleRateHz) {
    findings.push({
      code: "AUDIOBOOK_REFERENCE_MASTER_SAMPLE_RATE_DRIFT",
      severity: "error",
      message: "Reference render sample rate differs from the approved sequence output.",
    });
  }
  if (engineering.evidence.metrics.channels !== sequence.output.channels) {
    findings.push({
      code: "AUDIOBOOK_REFERENCE_MASTER_CHANNEL_DRIFT",
      severity: "error",
      message: "Reference render channel count differs from the approved sequence output.",
    });
  }
  if (!codecMatchesBitDepth(
    engineering.evidence.probe.codecName,
    sequence.output.bitDepth,
  )) {
    findings.push({
      code: "AUDIOBOOK_REFERENCE_MASTER_BIT_DEPTH_DRIFT",
      severity: "error",
      message: "Reference render PCM codec differs from the approved sequence bit depth.",
    });
  }
  return Object.freeze({
    observedDurationMs,
    durationDriftMs,
    findings: Object.freeze(findings),
  });
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

function chainFingerprint(
  value: Omit<AudiobookReferenceMasterChain, "fingerprint">,
): string {
  return stableHash({
    schemaVersion: value.schemaVersion,
    sequenceId: value.sequenceId,
    sequenceRevision: value.sequenceRevision,
    sequenceFingerprint: value.sequenceFingerprint,
    sequenceManifest: {
      id: value.sequenceManifest.payload.id,
      revision: value.sequenceManifest.revision,
      fingerprint: value.sequenceManifest.payload.fingerprint,
    },
    renderEvidence: {
      id: value.renderEvidence.payload.id,
      revision: value.renderEvidence.revision,
      fingerprint: value.renderEvidence.payload.fingerprint,
    },
    referenceMaster: {
      id: value.referenceMaster.payload.id,
      revision: value.referenceMaster.revision,
      fingerprint: value.referenceMaster.payload.fingerprint,
    },
    postRenderEngineering: {
      id: value.postRenderEngineering.ingest.envelope.payload.id,
      revision: value.postRenderEngineering.ingest.envelope.revision,
      fingerprint: value.postRenderEngineering.evidence.fingerprint,
    },
    expectedDurationMs: value.expectedDurationMs,
    observedDurationMs: value.observedDurationMs,
    durationDriftMs: value.durationDriftMs,
    eligibleForReview: value.eligibleForReview,
    findingCodes: value.findingCodes,
  });
}

export async function ingestAudiobookReferenceMaster(
  objectStore: FilePrivateObjectStore,
  registry: FileArtifactRegistry,
  input: IngestAudiobookReferenceMasterInput,
): Promise<AudiobookReferenceMasterChain> {
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new AudiobookReferenceMasterError(
      "AUDIOBOOK_REFERENCE_MASTER_DATE_INVALID",
    );
  }
  requireIdentifier(
    input.actorId,
    "AUDIOBOOK_REFERENCE_MASTER_ACTOR_ID_INVALID",
  );
  const verifierActorId = input.verifierActorId ?? input.actorId;
  requireIdentifier(
    verifierActorId,
    "AUDIOBOOK_REFERENCE_MASTER_VERIFIER_ID_INVALID",
  );
  if (input.signal?.aborted) {
    throw new AudiobookReferenceMasterError(
      "AUDIOBOOK_REFERENCE_MASTER_ABORTED",
    );
  }
  assertRenderMatchesSequence(input.sequence, input.render);
  assertGenerationAudioEngineeringPolicy(input.engineering);
  if (
    input.engineering.profile.fingerprint
      !== input.sequence.engineeringProfileFingerprint
  ) {
    throw new AudiobookReferenceMasterError(
      "AUDIOBOOK_REFERENCE_MASTER_ENGINEERING_PROFILE_MISMATCH",
    );
  }
  requireRights(input.rights, input.sequence, now);
  const maximumDurationDriftMs = input.maximumDurationDriftMs
    ?? DEFAULT_DURATION_DRIFT_MS;
  requireInteger(
    maximumDurationDriftMs,
    0,
    MAXIMUM_DURATION_DRIFT_MS,
    "AUDIOBOOK_REFERENCE_MASTER_DURATION_TOLERANCE_INVALID",
  );

  const scopeHash = stableHash({
    sequence: input.sequence.fingerprint,
    render: input.render.evidence.fingerprint,
  });
  const jobId = `job_audiobook_reference_${scopeHash.slice(0, 24)}`;
  const segmentId = input.sequence.bookId;
  const takeId = `take_audiobook_reference_${scopeHash.slice(0, 24)}`;

  const sequenceManifest = await ingestEvidenceArtifact(objectStore, registry, {
    id: stableArtifactId("audiobook_sequence", input.sequence.fingerprint),
    projectId: input.sequence.projectId,
    jobId,
    segmentId,
    takeId,
    bytes: jsonBytes(input.sequence),
    sourceContentHash: input.sequence.fingerprint,
    generationRequestHash: input.sequence.fingerprint,
    parentArtifactIds: [],
    rights: input.rights,
    actorId: input.actorId,
    verifierActorId,
    now,
    schemaCheck: "audiobook-sequence-schema",
  });
  if (!sequenceManifest.accepted) {
    throw new AudiobookReferenceMasterError(
      "AUDIOBOOK_REFERENCE_MASTER_SEQUENCE_ARTIFACT_INVALID",
    );
  }

  const renderEvidence = await ingestEvidenceArtifact(objectStore, registry, {
    id: stableArtifactId("audiobook_render", input.render.evidence.fingerprint),
    projectId: input.sequence.projectId,
    jobId,
    segmentId,
    takeId,
    bytes: jsonBytes(input.render.evidence),
    sourceContentHash: input.render.evidence.output.contentHash,
    generationRequestHash: input.render.evidence.commandFingerprint,
    parentArtifactIds: [sequenceManifest.envelope.payload.id],
    rights: input.rights,
    actorId: input.actorId,
    verifierActorId,
    now,
    schemaCheck: "audiobook-render-evidence-schema",
  });
  if (!renderEvidence.accepted) {
    throw new AudiobookReferenceMasterError(
      "AUDIOBOOK_REFERENCE_MASTER_RENDER_ARTIFACT_INVALID",
    );
  }

  const referenceMaster = await ingestPrivateArtifact(objectStore, registry, {
    id: stableArtifactId("audiobook_reference_master", {
      sequence: input.sequence.fingerprint,
      render: input.render.evidence.fingerprint,
      contentHash: input.render.evidence.output.contentHash,
    }),
    kind: "audiobook-reference-master",
    projectId: input.sequence.projectId,
    jobId,
    segmentId,
    takeId,
    bytes: input.render.bytes,
    claimedMimeType: "audio/wav",
    claimedFormat: "wav",
    provenance: {
      createdByActorId: input.actorId,
      sourceContentHash: input.sequence.fingerprint,
      generationRequestHash: input.render.evidence.commandFingerprint,
      parentArtifactIds: [
        sequenceManifest.envelope.payload.id,
        renderEvidence.envelope.payload.id,
      ],
    },
    rights: input.rights,
    reviewRequired: true,
    actorId: input.actorId,
    verifierActorId,
    verificationChecks: [
      "audiobook-render-output-hash",
      "audiobook-render-output-size",
      "audiobook-render-output-signature",
      "classic-riff-capacity",
    ],
    now,
  });
  if (
    !referenceMaster.accepted
    && referenceMaster.envelope.payload.verification.status !== "quarantined"
  ) {
    throw new AudiobookReferenceMasterError(
      "AUDIOBOOK_REFERENCE_MASTER_ARTIFACT_INVALID",
    );
  }

  const engineering = await ingestAudioEngineeringArtifact(
    objectStore,
    registry,
    {
      candidateArtifactId: referenceMaster.envelope.payload.id,
      projectId: input.sequence.projectId,
      jobId,
      segmentId,
      takeId,
      generationRequestHash: input.render.evidence.commandFingerprint,
      bytes: input.render.bytes,
      format: "wav",
      rights: input.rights,
      actorId: input.actorId,
      verifierActorId,
      profile: input.engineering.profile.profile,
      profileVersion: input.engineering.profile.externalVersion,
      profileReviewedAt: input.engineering.profile.reviewedAt,
      profileSourceReference: input.engineering.profile.sourceReference,
      ...(input.engineering.runner ? { runner: input.engineering.runner } : {}),
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

  const comparison = postRenderFindings(
    input.sequence,
    engineering,
    maximumDurationDriftMs,
  );
  const engineeringErrors = engineering.evidence.findings.filter(
    (finding) => finding.severity === "error",
  );
  const findingCodes = Object.freeze([
    ...new Set([
      ...engineeringErrors.map((finding) => finding.code),
      ...comparison.findings.map((finding) => finding.code),
    ]),
  ].sort((left, right) => left.localeCompare(right, "en-AU")));
  const eligibleForReview = engineering.candidateEligible
    && comparison.findings.length === 0;
  let referenceEnvelope = referenceMaster.envelope;
  if (
    !eligibleForReview
    && referenceEnvelope.payload.verification.status === "verified"
  ) {
    const quarantined = quarantineArtifact(referenceEnvelope.payload, {
      code: "AUDIOBOOK_REFERENCE_MASTER_ENGINEERING_INELIGIBLE",
      message: "The complete-book reference WAV failed independent engineering or sequence comparison.",
      actorId: verifierActorId,
      findings: [
        ...engineering.evidence.findings,
        ...comparison.findings,
      ],
      quarantinedAt: now,
    });
    referenceEnvelope = await registry.save(quarantined, {
      expectedRevision: referenceEnvelope.revision,
      actorId: verifierActorId,
      action: "artifact.audiobook_reference_master_quarantined",
    });
  }

  const partial: Omit<AudiobookReferenceMasterChain, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_REFERENCE_MASTER_SCHEMA_VERSION,
    sequenceId: input.sequence.id,
    sequenceRevision: input.sequence.revision,
    sequenceFingerprint: input.sequence.fingerprint,
    sequenceManifest: sequenceManifest.envelope,
    renderEvidence: renderEvidence.envelope,
    referenceMaster: referenceEnvelope,
    postRenderEngineering: engineering,
    expectedDurationMs: input.sequence.totalDurationMs,
    observedDurationMs: comparison.observedDurationMs,
    durationDriftMs: comparison.durationDriftMs,
    eligibleForReview,
    findingCodes,
  };
  const chain = Object.freeze({
    ...partial,
    fingerprint: chainFingerprint(partial),
  });
  assertAudiobookReferenceMasterChain(chain);
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
    throw new AudiobookReferenceMasterError(code);
  }
}

export function assertAudiobookReferenceMasterChain(
  chain: AudiobookReferenceMasterChain,
): void {
  if (chain.schemaVersion !== AUDIOBOOK_REFERENCE_MASTER_SCHEMA_VERSION) {
    throw new AudiobookReferenceMasterError(
      "AUDIOBOOK_REFERENCE_MASTER_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    chain.sequenceId,
    "AUDIOBOOK_REFERENCE_MASTER_SEQUENCE_ID_INVALID",
  );
  requireInteger(
    chain.sequenceRevision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_REFERENCE_MASTER_SEQUENCE_REVISION_INVALID",
  );
  requireHash(
    chain.sequenceFingerprint,
    "AUDIOBOOK_REFERENCE_MASTER_SEQUENCE_HASH_INVALID",
  );
  assertArtifactEnvelope(
    chain.sequenceManifest,
    "audio-analysis",
    "AUDIOBOOK_REFERENCE_MASTER_SEQUENCE_ENVELOPE_INVALID",
  );
  assertArtifactEnvelope(
    chain.renderEvidence,
    "audio-analysis",
    "AUDIOBOOK_REFERENCE_MASTER_RENDER_ENVELOPE_INVALID",
  );
  assertArtifactEnvelope(
    chain.referenceMaster,
    "audiobook-reference-master",
    "AUDIOBOOK_REFERENCE_MASTER_AUDIO_ENVELOPE_INVALID",
  );
  assertArtifactEnvelope(
    chain.postRenderEngineering.ingest.envelope,
    "audio-analysis",
    "AUDIOBOOK_REFERENCE_MASTER_ENGINEERING_ENVELOPE_INVALID",
  );
  assertAudioEngineeringEvidence(chain.postRenderEngineering.evidence);
  const master = chain.referenceMaster.payload;
  const sequenceArtifact = chain.sequenceManifest.payload;
  const renderArtifact = chain.renderEvidence.payload;
  const engineeringArtifact = chain.postRenderEngineering.ingest.envelope.payload;
  for (const artifact of [sequenceArtifact, renderArtifact, master, engineeringArtifact]) {
    if (
      artifact.projectId !== master.projectId
      || artifact.jobId !== master.jobId
      || artifact.segmentId !== master.segmentId
      || artifact.takeId !== master.takeId
    ) {
      throw new AudiobookReferenceMasterError(
        "AUDIOBOOK_REFERENCE_MASTER_ARTIFACT_SCOPE_MISMATCH",
      );
    }
  }
  if (
    !renderArtifact.provenance.parentArtifactIds.includes(sequenceArtifact.id)
    || !master.provenance.parentArtifactIds.includes(sequenceArtifact.id)
    || !master.provenance.parentArtifactIds.includes(renderArtifact.id)
    || engineeringArtifact.provenance.parentArtifactIds.length !== 1
    || engineeringArtifact.provenance.parentArtifactIds[0] !== master.id
    || chain.postRenderEngineering.evidence.inputContentHash
      !== master.integrity.contentHash
    || chain.postRenderEngineering.evidence.inputByteCount
      !== master.integrity.byteCount
  ) {
    throw new AudiobookReferenceMasterError(
      "AUDIOBOOK_REFERENCE_MASTER_EVIDENCE_CHAIN_MISMATCH",
    );
  }
  requireInteger(
    chain.expectedDurationMs,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_REFERENCE_MASTER_EXPECTED_DURATION_INVALID",
  );
  requireInteger(
    chain.observedDurationMs,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_REFERENCE_MASTER_OBSERVED_DURATION_INVALID",
  );
  if (
    chain.durationDriftMs
      !== Math.abs(chain.observedDurationMs - chain.expectedDurationMs)
  ) {
    throw new AudiobookReferenceMasterError(
      "AUDIOBOOK_REFERENCE_MASTER_DURATION_MISMATCH",
    );
  }
  const engineeringErrors = chain.postRenderEngineering.evidence.findings
    .filter((finding) => finding.severity === "error")
    .map((finding) => finding.code);
  const expectedEligible = chain.postRenderEngineering.candidateEligible
    && chain.findingCodes.length === 0;
  if (
    chain.eligibleForReview !== expectedEligible
    || (chain.eligibleForReview
      && master.verification.status !== "verified")
    || (!chain.eligibleForReview
      && master.verification.status !== "quarantined")
    || master.review.required !== true
    || (engineeringErrors.length > 0
      && !engineeringErrors.every((code) => chain.findingCodes.includes(code)))
  ) {
    throw new AudiobookReferenceMasterError(
      "AUDIOBOOK_REFERENCE_MASTER_STATE_MISMATCH",
    );
  }
  const { fingerprint, ...partial } = chain;
  if (!HASH_PATTERN.test(fingerprint) || chainFingerprint(partial) !== fingerprint) {
    throw new AudiobookReferenceMasterError(
      "AUDIOBOOK_REFERENCE_MASTER_FINGERPRINT_INVALID",
    );
  }
}

export function audiobookReferenceMasterPublicView(
  chain: AudiobookReferenceMasterChain,
): AudiobookReferenceMasterPublicView {
  assertAudiobookReferenceMasterChain(chain);
  const master = chain.referenceMaster.payload;
  const evidence = chain.postRenderEngineering.evidence;
  return Object.freeze({
    sequenceId: chain.sequenceId,
    sequenceRevision: chain.sequenceRevision,
    sequenceFingerprint: chain.sequenceFingerprint,
    referenceArtifactId: master.id,
    referenceRevision: chain.referenceMaster.revision,
    verificationStatus: master.verification.status,
    reviewStatus: master.review.status,
    engineeringProfileId: evidence.profile.profile.id,
    engineeringProfileVersion: evidence.profile.externalVersion,
    expectedDurationMs: chain.expectedDurationMs,
    observedDurationMs: chain.observedDurationMs,
    durationDriftMs: chain.durationDriftMs,
    eligibleForReview: chain.eligibleForReview,
    findingCodes: chain.findingCodes,
    fingerprint: chain.fingerprint,
  });
}
