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
  assertAudiobookRetailSamplePlan,
  type AudiobookRetailSamplePlan,
} from "./audiobook-retail-sample-plan.js";
import {
  assertAudiobookRetailSampleRenderMatchesPlan,
  assertAudiobookRetailSampleRenderResult,
  type AudiobookRetailSampleRenderResult,
} from "./audiobook-retail-sample-render.js";
import {
  assertEvidenceMatchesGenerationPolicy,
  assertGenerationAudioEngineeringPolicy,
  type GenerationAudioEngineeringPolicy,
} from "./generation-audio-engineering.js";
import { stableHash, type Finding } from "./index.js";
import type { FilePrivateObjectStore } from "./private-object-store.js";
import type { StoredEnvelope } from "./project-store.js";

export const AUDIOBOOK_RETAIL_SAMPLE_SCHEMA_VERSION =
  "storyteller-audiobook-retail-sample-v1" as const;

export interface AudiobookRetailSampleChain {
  schemaVersion: typeof AUDIOBOOK_RETAIL_SAMPLE_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  jobId: string;
  takeId: string;
  planId: string;
  planFingerprint: string;
  planManifest: StoredEnvelope<ArtifactRecord>;
  renderEvidence: StoredEnvelope<ArtifactRecord>;
  approvedSource: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
    contentHash: string;
    byteCount: number;
    reviewFingerprint: string;
    rightsFingerprint: string;
  }>;
  sample: StoredEnvelope<ArtifactRecord>;
  engineering: AudioEngineeringArtifactResult;
  engineeringProfile: Readonly<{
    id: string;
    externalVersion: string;
    fingerprint: string;
  }>;
  expectedDurationMs: number;
  observedDurationMs: number;
  durationDriftMs: number;
  eligibleForReview: boolean;
  findingCodes: readonly string[];
  createdAt: string;
  fingerprint: string;
}

export interface AudiobookRetailSamplePublicView {
  id: string;
  bookId: string;
  planId: string;
  fileName: "RetailSample.mp3";
  expectedDurationMs: number;
  observedDurationMs: number;
  durationDriftMs: number;
  verificationStatus: ArtifactRecord["verification"]["status"];
  reviewStatus: ArtifactRecord["review"]["status"];
  engineeringProfileId: string;
  engineeringProfileVersion: string;
  engineeringEligible: boolean;
  eligibleForReview: boolean;
  findingCodes: readonly string[];
  createdAt: string;
  fingerprint: string;
}

export interface IngestAudiobookRetailSampleInput {
  plan: AudiobookRetailSamplePlan;
  render: AudiobookRetailSampleRenderResult;
  approvedSourceArtifact: ArtifactRecord;
  actorId: string;
  verifierActorId?: string;
  engineering: GenerationAudioEngineeringPolicy;
  maximumDurationDriftMs?: number;
  now?: Date;
  signal?: AbortSignal;
}

export class AudiobookRetailSampleError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailSampleError";
    this.code = code;
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const FINDING_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,95}$/u;
const DEFAULT_DURATION_DRIFT_MS = 1_000;
const MAXIMUM_DURATION_DRIFT_MS = 10_000;
const MAXIMUM_SAMPLE_DURATION_MS = 300_000;
const MAXIMUM_FINDING_CODES = 128;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailSampleError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailSampleError(code);
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
    throw new AudiobookRetailSampleError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailSampleError(code);
  }
  return value;
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

function stableArtifactId(kind: string, value: unknown): string {
  return `artifact_${kind}_${stableHash(value).slice(0, 24)}`;
}

function currentRights(
  rights: ArtifactRightsSnapshot,
  now: Date,
): void {
  requireIdentifier(
    rights.rightsEvidenceId,
    "AUDIOBOOK_RETAIL_SAMPLE_RIGHTS_ID_INVALID",
  );
  requireHash(
    rights.rightsFingerprint,
    "AUDIOBOOK_RETAIL_SAMPLE_RIGHTS_HASH_INVALID",
  );
  if (!rights.allowedUses.includes("audiobook")) {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_AUDIOBOOK_RIGHTS_REQUIRED",
    );
  }
  if (!rights.commercialUseApproved) {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_COMMERCIAL_RIGHTS_REQUIRED",
    );
  }
  if (
    rights.expiresAt
    && Date.parse(rights.expiresAt) <= now.getTime()
  ) {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_RIGHTS_EXPIRED",
    );
  }
  if (
    rights.deletionRequiredAt
    && Date.parse(rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_RETENTION_EXPIRED",
    );
  }
}

function assertApprovedSourceArtifact(
  plan: AudiobookRetailSamplePlan,
  artifact: ArtifactRecord,
  now: Date,
): void {
  assertArtifactRecord(artifact);
  if (
    artifact.kind !== "audiobook-retail-track"
    || artifact.projectId !== plan.projectId
    || artifact.id !== plan.source.approvedArtifactId
    || artifact.revision !== plan.source.approvedArtifactRevision
    || artifact.revision !== plan.source.originalArtifactRevision + 1
    || artifact.previousFingerprint !== plan.source.originalArtifactFingerprint
    || artifact.fingerprint !== plan.source.approvedArtifactFingerprint
    || artifact.integrity.contentHash
      !== plan.source.approvedArtifactContentHash
    || artifact.integrity.byteCount !== plan.source.approvedArtifactByteCount
    || stableHash(artifact.review)
      !== plan.source.approvedArtifactReviewFingerprint
    || artifact.integrity.mimeType !== "audio/mpeg"
    || artifact.integrity.format !== "mp3"
    || artifact.verification.status !== "verified"
    || artifact.review.required !== true
    || artifact.review.status !== "approved"
    || artifact.quarantine !== undefined
    || artifact.release.status !== "unavailable"
  ) {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_APPROVED_SOURCE_MISMATCH",
    );
  }
  currentRights(artifact.rights, now);
}

function validateInput(
  input: IngestAudiobookRetailSampleInput,
  now: Date,
): void {
  assertAudiobookRetailSamplePlan(input.plan);
  assertAudiobookRetailSampleRenderResult(input.render);
  assertAudiobookRetailSampleRenderMatchesPlan(
    input.render.evidence,
    input.plan,
  );
  if (input.plan.status !== "ready-for-rendering") {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_PLAN_NOT_READY",
    );
  }
  assertApprovedSourceArtifact(input.plan, input.approvedSourceArtifact, now);
  requireIdentifier(
    input.actorId,
    "AUDIOBOOK_RETAIL_SAMPLE_ACTOR_ID_INVALID",
  );
  requireIdentifier(
    input.verifierActorId ?? input.actorId,
    "AUDIOBOOK_RETAIL_SAMPLE_VERIFIER_ID_INVALID",
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
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_ENGINEERING_POLICY_UNSUPPORTED",
    );
  }
  if (input.signal?.aborted) {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_ABORTED",
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

function postRenderFindings(
  plan: AudiobookRetailSamplePlan,
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
    observedDurationMs - plan.range.durationMs,
  );
  const findings: Finding[] = [];
  if (durationDriftMs > maximumDurationDriftMs) {
    findings.push({
      code: "AUDIOBOOK_RETAIL_SAMPLE_DURATION_DRIFT",
      severity: "error",
      message: `Rendered retail sample duration differs from its approved range by ${durationDriftMs} ms.`,
    });
  }
  const formatName = evidence.probe.formatName.toLocaleLowerCase("en-AU");
  const codecName = evidence.probe.codecName.toLocaleLowerCase("en-AU");
  if (!formatName.includes("mp3") || !codecName.includes("mp3")) {
    findings.push({
      code: "AUDIOBOOK_RETAIL_SAMPLE_CODEC_MISMATCH",
      severity: "error",
      message: "Independent inspection did not identify an MP3 retail sample.",
    });
  }
  if (evidence.metrics.sampleRateHz !== plan.output.sampleRateHz) {
    findings.push({
      code: "AUDIOBOOK_RETAIL_SAMPLE_SAMPLE_RATE_MISMATCH",
      severity: "error",
      message: "Retail sample sample rate differs from approved output intent.",
    });
  }
  if (evidence.metrics.channels !== plan.output.channels) {
    findings.push({
      code: "AUDIOBOOK_RETAIL_SAMPLE_CHANNEL_MISMATCH",
      severity: "error",
      message: "Retail sample channel count differs from approved output intent.",
    });
  }
  const observedBitRate = evidence.metrics.bitRateKbps;
  const bitRateTolerance = Math.max(
    4,
    Math.ceil(plan.output.bitRateKbps * 0.03),
  );
  if (
    observedBitRate === undefined
    || Math.abs(observedBitRate - plan.output.bitRateKbps)
      > bitRateTolerance
  ) {
    findings.push({
      code: "AUDIOBOOK_RETAIL_SAMPLE_BIT_RATE_MISMATCH",
      severity: "error",
      message: "Retail sample bit rate differs from approved constant-bit-rate intent.",
    });
  }
  return Object.freeze({
    observedDurationMs,
    durationDriftMs,
    findings: Object.freeze(findings),
  });
}

function findingCodes(
  engineering: AudioEngineeringArtifactResult,
  comparison: readonly Finding[],
): readonly string[] {
  return Object.freeze([
    ...new Set([
      ...engineering.evidence.findings
        .filter((finding) => finding.severity === "error")
        .map((finding) => finding.code),
      ...comparison
        .filter((finding) => finding.severity === "error")
        .map((finding) => finding.code),
    ]),
  ].sort((left, right) => left.localeCompare(right, "en-AU")));
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

export async function ingestAudiobookRetailSample(
  objectStore: FilePrivateObjectStore,
  registry: FileArtifactRegistry,
  input: IngestAudiobookRetailSampleInput,
): Promise<AudiobookRetailSampleChain> {
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_DATE_INVALID",
    );
  }
  validateInput(input, now);
  const maximumDurationDriftMs = input.maximumDurationDriftMs
    ?? DEFAULT_DURATION_DRIFT_MS;
  requireInteger(
    maximumDurationDriftMs,
    0,
    MAXIMUM_DURATION_DRIFT_MS,
    "AUDIOBOOK_RETAIL_SAMPLE_DURATION_TOLERANCE_INVALID",
  );
  const verifierActorId = input.verifierActorId ?? input.actorId;
  const rights = input.approvedSourceArtifact.rights;
  const scopeHash = stableHash({
    plan: input.plan.fingerprint,
    render: input.render.evidence.fingerprint,
    source: input.approvedSourceArtifact.fingerprint,
  });
  const jobId = `job_audiobook_retail_sample_${scopeHash.slice(0, 24)}`;
  const takeId = `take_audiobook_retail_sample_${scopeHash.slice(0, 24)}`;
  const chainId = `retail_sample_${scopeHash.slice(0, 24)}`;

  const planManifest = await ingestEvidenceArtifact(objectStore, registry, {
    id: stableArtifactId("audiobook_retail_sample_plan", input.plan.fingerprint),
    projectId: input.plan.projectId,
    jobId,
    segmentId: input.plan.bookId,
    takeId,
    bytes: jsonBytes(input.plan),
    sourceContentHash: input.plan.fingerprint,
    generationRequestHash: input.plan.fingerprint,
    parentArtifactIds: [input.approvedSourceArtifact.id],
    rights,
    actorId: input.actorId,
    verifierActorId,
    now,
    schemaCheck: "audiobook-retail-sample-plan-schema",
  });
  if (!planManifest.accepted) {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_PLAN_ARTIFACT_INVALID",
    );
  }

  const renderEvidence = await ingestEvidenceArtifact(objectStore, registry, {
    id: stableArtifactId(
      "audiobook_retail_sample_render",
      input.render.evidence.fingerprint,
    ),
    projectId: input.plan.projectId,
    jobId,
    segmentId: input.plan.bookId,
    takeId,
    bytes: jsonBytes(input.render.evidence),
    sourceContentHash: input.approvedSourceArtifact.integrity.contentHash,
    generationRequestHash: input.render.evidence.commandFingerprint,
    parentArtifactIds: [
      planManifest.envelope.payload.id,
      input.approvedSourceArtifact.id,
    ],
    rights,
    actorId: input.actorId,
    verifierActorId,
    now,
    schemaCheck: "audiobook-retail-sample-render-schema",
  });
  if (!renderEvidence.accepted) {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_ARTIFACT_INVALID",
    );
  }

  const sampleIngest = await ingestPrivateArtifact(objectStore, registry, {
    id: stableArtifactId("audiobook_retail_sample", {
      plan: input.plan.fingerprint,
      render: input.render.evidence.fingerprint,
      contentHash: input.render.evidence.output.contentHash,
    }),
    kind: "audiobook-retail-sample",
    projectId: input.plan.projectId,
    jobId,
    segmentId: input.plan.bookId,
    takeId,
    bytes: input.render.bytes,
    claimedMimeType: "audio/mpeg",
    claimedFormat: "mp3",
    provenance: {
      createdByActorId: input.actorId,
      sourceContentHash: input.approvedSourceArtifact.integrity.contentHash,
      generationRequestHash: input.render.evidence.commandFingerprint,
      parentArtifactIds: [
        planManifest.envelope.payload.id,
        renderEvidence.envelope.payload.id,
        input.approvedSourceArtifact.id,
      ],
    },
    rights,
    reviewRequired: true,
    actorId: input.actorId,
    verifierActorId,
    verificationChecks: [
      "retail-sample-output-hash",
      "retail-sample-output-size",
      "retail-sample-output-signature",
      "retail-sample-approved-range",
      "retail-sample-constant-bit-rate-intent",
    ],
    now,
  });
  if (
    !sampleIngest.accepted
    && sampleIngest.envelope.payload.verification.status !== "quarantined"
  ) {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_ARTIFACT_INVALID",
    );
  }

  const engineering = await ingestAudioEngineeringArtifact(
    objectStore,
    registry,
    {
      candidateArtifactId: sampleIngest.envelope.payload.id,
      projectId: input.plan.projectId,
      jobId,
      segmentId: input.plan.bookId,
      takeId,
      generationRequestHash: input.render.evidence.commandFingerprint,
      bytes: input.render.bytes,
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
  const comparison = postRenderFindings(
    input.plan,
    engineering.evidence,
    maximumDurationDriftMs,
  );
  const codes = findingCodes(engineering, comparison.findings);
  const eligibleForReview = sampleIngest.accepted
    && engineering.candidateEligible
    && comparison.findings.every((finding) => finding.severity !== "error");
  let sampleEnvelope = sampleIngest.envelope;
  if (
    !eligibleForReview
    && sampleEnvelope.payload.verification.status === "verified"
  ) {
    const quarantined = quarantineArtifact(sampleEnvelope.payload, {
      code: "AUDIOBOOK_RETAIL_SAMPLE_ENGINEERING_INELIGIBLE",
      message: "The rendered retail sample failed independent engineering or approved-range comparison.",
      actorId: verifierActorId,
      findings: [
        ...engineering.evidence.findings,
        ...comparison.findings,
      ],
      quarantinedAt: now,
    });
    sampleEnvelope = await registry.save(quarantined, {
      expectedRevision: sampleEnvelope.revision,
      actorId: verifierActorId,
      action: "artifact.audiobook_retail_sample_quarantined",
    });
  }

  const partial: Omit<AudiobookRetailSampleChain, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_SAMPLE_SCHEMA_VERSION,
    id: chainId,
    projectId: input.plan.projectId,
    bookId: input.plan.bookId,
    jobId,
    takeId,
    planId: input.plan.id,
    planFingerprint: input.plan.fingerprint,
    planManifest: planManifest.envelope,
    renderEvidence: renderEvidence.envelope,
    approvedSource: Object.freeze({
      id: input.approvedSourceArtifact.id,
      revision: input.approvedSourceArtifact.revision,
      fingerprint: input.approvedSourceArtifact.fingerprint,
      contentHash: input.approvedSourceArtifact.integrity.contentHash,
      byteCount: input.approvedSourceArtifact.integrity.byteCount,
      reviewFingerprint: stableHash(input.approvedSourceArtifact.review),
      rightsFingerprint: rights.rightsFingerprint,
    }),
    sample: sampleEnvelope,
    engineering,
    engineeringProfile: Object.freeze({
      id: input.engineering.profile.profile.id,
      externalVersion: input.engineering.profile.externalVersion,
      fingerprint: input.engineering.profile.fingerprint,
    }),
    expectedDurationMs: input.plan.range.durationMs,
    observedDurationMs: comparison.observedDurationMs,
    durationDriftMs: comparison.durationDriftMs,
    eligibleForReview,
    findingCodes: codes,
    createdAt: now.toISOString(),
  };
  const chain = Object.freeze({
    ...partial,
    fingerprint: chainFingerprint(partial),
  });
  assertAudiobookRetailSampleChain(chain);
  assertAudiobookRetailSampleMatchesSources(chain, {
    plan: input.plan,
    render: input.render,
    approvedSourceArtifact: input.approvedSourceArtifact,
    engineering: input.engineering,
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
    throw new AudiobookRetailSampleError(code);
  }
}

export function assertAudiobookRetailSampleChain(
  chain: AudiobookRetailSampleChain,
): void {
  if (chain.schemaVersion !== AUDIOBOOK_RETAIL_SAMPLE_SCHEMA_VERSION) {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [chain.id, "AUDIOBOOK_RETAIL_SAMPLE_ID_INVALID"],
    [chain.projectId, "AUDIOBOOK_RETAIL_SAMPLE_PROJECT_ID_INVALID"],
    [chain.bookId, "AUDIOBOOK_RETAIL_SAMPLE_BOOK_ID_INVALID"],
    [chain.jobId, "AUDIOBOOK_RETAIL_SAMPLE_JOB_ID_INVALID"],
    [chain.takeId, "AUDIOBOOK_RETAIL_SAMPLE_TAKE_ID_INVALID"],
    [chain.planId, "AUDIOBOOK_RETAIL_SAMPLE_PLAN_ID_INVALID"],
    [chain.approvedSource.id, "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_ID_INVALID"],
    [chain.engineeringProfile.id, "AUDIOBOOK_RETAIL_SAMPLE_PROFILE_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  for (const [value, code] of [
    [chain.planFingerprint, "AUDIOBOOK_RETAIL_SAMPLE_PLAN_HASH_INVALID"],
    [chain.approvedSource.fingerprint, "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_FINGERPRINT_INVALID"],
    [chain.approvedSource.contentHash, "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_HASH_INVALID"],
    [chain.approvedSource.reviewFingerprint, "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_REVIEW_HASH_INVALID"],
    [chain.approvedSource.rightsFingerprint, "AUDIOBOOK_RETAIL_SAMPLE_RIGHTS_HASH_INVALID"],
    [chain.engineeringProfile.fingerprint, "AUDIOBOOK_RETAIL_SAMPLE_PROFILE_HASH_INVALID"],
  ] as const) requireHash(value, code);
  requireInteger(
    chain.approvedSource.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_REVISION_INVALID",
  );
  requireInteger(
    chain.approvedSource.byteCount,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_SIZE_INVALID",
  );
  if (!chain.engineeringProfile.externalVersion.trim()) {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_PROFILE_VERSION_INVALID",
    );
  }
  assertArtifactEnvelope(
    chain.planManifest,
    "audio-analysis",
    "AUDIOBOOK_RETAIL_SAMPLE_PLAN_ENVELOPE_INVALID",
  );
  assertArtifactEnvelope(
    chain.renderEvidence,
    "audio-analysis",
    "AUDIOBOOK_RETAIL_SAMPLE_RENDER_ENVELOPE_INVALID",
  );
  assertArtifactEnvelope(
    chain.sample,
    "audiobook-retail-sample",
    "AUDIOBOOK_RETAIL_SAMPLE_ARTIFACT_ENVELOPE_INVALID",
  );
  assertArtifactEnvelope(
    chain.engineering.ingest.envelope,
    "audio-analysis",
    "AUDIOBOOK_RETAIL_SAMPLE_ENGINEERING_ENVELOPE_INVALID",
  );
  assertAudioEngineeringEvidence(chain.engineering.evidence);

  const planArtifact = chain.planManifest.payload;
  const renderArtifact = chain.renderEvidence.payload;
  const sampleArtifact = chain.sample.payload;
  const engineeringArtifact = chain.engineering.ingest.envelope.payload;
  if (
    planArtifact.projectId !== chain.projectId
    || planArtifact.jobId !== chain.jobId
    || planArtifact.segmentId !== chain.bookId
    || planArtifact.takeId !== chain.takeId
    || planArtifact.provenance.sourceContentHash !== chain.planFingerprint
    || stableHash(planArtifact.provenance.parentArtifactIds)
      !== stableHash([chain.approvedSource.id])
    || renderArtifact.projectId !== chain.projectId
    || renderArtifact.jobId !== chain.jobId
    || renderArtifact.segmentId !== chain.bookId
    || renderArtifact.takeId !== chain.takeId
    || renderArtifact.provenance.sourceContentHash
      !== chain.approvedSource.contentHash
    || stableHash(renderArtifact.provenance.parentArtifactIds)
      !== stableHash([planArtifact.id, chain.approvedSource.id])
    || sampleArtifact.projectId !== chain.projectId
    || sampleArtifact.jobId !== chain.jobId
    || sampleArtifact.segmentId !== chain.bookId
    || sampleArtifact.takeId !== chain.takeId
    || sampleArtifact.integrity.mimeType !== "audio/mpeg"
    || sampleArtifact.integrity.format !== "mp3"
    || sampleArtifact.rights.rightsFingerprint
      !== chain.approvedSource.rightsFingerprint
    || sampleArtifact.provenance.sourceContentHash
      !== chain.approvedSource.contentHash
    || stableHash(sampleArtifact.provenance.parentArtifactIds)
      !== stableHash([
        planArtifact.id,
        renderArtifact.id,
        chain.approvedSource.id,
      ])
    || engineeringArtifact.projectId !== chain.projectId
    || engineeringArtifact.jobId !== chain.jobId
    || engineeringArtifact.segmentId !== chain.bookId
    || engineeringArtifact.takeId !== chain.takeId
    || stableHash(engineeringArtifact.provenance.parentArtifactIds)
      !== stableHash([sampleArtifact.id])
    || engineeringArtifact.provenance.sourceContentHash
      !== sampleArtifact.integrity.contentHash
    || chain.engineering.evidence.inputContentHash
      !== sampleArtifact.integrity.contentHash
    || chain.engineering.evidence.inputByteCount
      !== sampleArtifact.integrity.byteCount
    || chain.engineering.evidence.profile.fingerprint
      !== chain.engineeringProfile.fingerprint
  ) {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_ARTIFACT_GRAPH_INVALID",
    );
  }

  requireInteger(
    chain.expectedDurationMs,
    1,
    MAXIMUM_SAMPLE_DURATION_MS,
    "AUDIOBOOK_RETAIL_SAMPLE_EXPECTED_DURATION_INVALID",
  );
  requireInteger(
    chain.observedDurationMs,
    1,
    MAXIMUM_SAMPLE_DURATION_MS + MAXIMUM_DURATION_DRIFT_MS,
    "AUDIOBOOK_RETAIL_SAMPLE_OBSERVED_DURATION_INVALID",
  );
  requireInteger(
    chain.durationDriftMs,
    0,
    MAXIMUM_SAMPLE_DURATION_MS + MAXIMUM_DURATION_DRIFT_MS,
    "AUDIOBOOK_RETAIL_SAMPLE_DURATION_DRIFT_INVALID",
  );
  if (
    chain.durationDriftMs
      !== Math.abs(chain.observedDurationMs - chain.expectedDurationMs)
    || chain.engineering.candidateEligible
      !== (
        chain.engineering.evidence.eligible
        && chain.engineering.ingest.accepted
      )
  ) {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_ENGINEERING_STATE_INVALID",
    );
  }
  if (
    !Array.isArray(chain.findingCodes)
    || chain.findingCodes.length > MAXIMUM_FINDING_CODES
    || new Set(chain.findingCodes).size !== chain.findingCodes.length
    || chain.findingCodes.some((code) => !FINDING_CODE_PATTERN.test(code))
  ) {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_FINDINGS_INVALID",
    );
  }
  const shouldBeEligible = sampleArtifact.verification.status === "verified"
    && chain.engineering.candidateEligible
    && chain.findingCodes.length === 0;
  if (chain.eligibleForReview !== shouldBeEligible) {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_ELIGIBILITY_INVALID",
    );
  }
  if (
    chain.eligibleForReview
    && (
      sampleArtifact.review.required !== true
      || sampleArtifact.review.status !== "pending"
      || sampleArtifact.quarantine !== undefined
    )
  ) {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_REVIEW_STATE_INVALID",
    );
  }
  if (
    !chain.eligibleForReview
    && sampleArtifact.verification.status === "verified"
  ) {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_FAILED_ARTIFACT_NOT_QUARANTINED",
    );
  }
  requireDate(chain.createdAt, "AUDIOBOOK_RETAIL_SAMPLE_DATE_INVALID");
  const { fingerprint, ...partial } = chain;
  if (
    !HASH_PATTERN.test(fingerprint)
    || chainFingerprint(partial) !== fingerprint
  ) {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailSampleMatchesSources(
  chain: AudiobookRetailSampleChain,
  input: Readonly<{
    plan: AudiobookRetailSamplePlan;
    render: AudiobookRetailSampleRenderResult;
    approvedSourceArtifact: ArtifactRecord;
    engineering: GenerationAudioEngineeringPolicy;
  }>,
): void {
  assertAudiobookRetailSampleChain(chain);
  assertAudiobookRetailSamplePlan(input.plan);
  assertAudiobookRetailSampleRenderResult(input.render);
  assertAudiobookRetailSampleRenderMatchesPlan(
    input.render.evidence,
    input.plan,
  );
  assertArtifactRecord(input.approvedSourceArtifact);
  assertGenerationAudioEngineeringPolicy(input.engineering);
  if (
    chain.projectId !== input.plan.projectId
    || chain.bookId !== input.plan.bookId
    || chain.planId !== input.plan.id
    || chain.planFingerprint !== input.plan.fingerprint
    || chain.approvedSource.id !== input.approvedSourceArtifact.id
    || chain.approvedSource.revision !== input.approvedSourceArtifact.revision
    || chain.approvedSource.fingerprint
      !== input.approvedSourceArtifact.fingerprint
    || chain.approvedSource.contentHash
      !== input.approvedSourceArtifact.integrity.contentHash
    || chain.approvedSource.byteCount
      !== input.approvedSourceArtifact.integrity.byteCount
    || chain.approvedSource.reviewFingerprint
      !== stableHash(input.approvedSourceArtifact.review)
    || chain.approvedSource.rightsFingerprint
      !== input.approvedSourceArtifact.rights.rightsFingerprint
    || chain.engineeringProfile.id
      !== input.engineering.profile.profile.id
    || chain.engineeringProfile.externalVersion
      !== input.engineering.profile.externalVersion
    || chain.engineeringProfile.fingerprint
      !== input.engineering.profile.fingerprint
    || chain.expectedDurationMs !== input.plan.range.durationMs
    || chain.sample.payload.integrity.contentHash
      !== input.render.evidence.output.contentHash
    || chain.sample.payload.integrity.byteCount
      !== input.render.evidence.output.byteCount
    || chain.sample.payload.provenance.generationRequestHash
      !== input.render.evidence.commandFingerprint
    || chain.renderEvidence.payload.provenance.generationRequestHash
      !== input.render.evidence.commandFingerprint
  ) {
    throw new AudiobookRetailSampleError(
      "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_MISMATCH",
    );
  }
}

export function audiobookRetailSamplePublicView(
  chain: AudiobookRetailSampleChain,
): AudiobookRetailSamplePublicView {
  assertAudiobookRetailSampleChain(chain);
  return Object.freeze({
    id: chain.id,
    bookId: chain.bookId,
    planId: chain.planId,
    fileName: "RetailSample.mp3",
    expectedDurationMs: chain.expectedDurationMs,
    observedDurationMs: chain.observedDurationMs,
    durationDriftMs: chain.durationDriftMs,
    verificationStatus: chain.sample.payload.verification.status,
    reviewStatus: chain.sample.payload.review.status,
    engineeringProfileId: chain.engineeringProfile.id,
    engineeringProfileVersion: chain.engineeringProfile.externalVersion,
    engineeringEligible: chain.engineering.candidateEligible,
    eligibleForReview: chain.eligibleForReview,
    findingCodes: chain.findingCodes,
    createdAt: chain.createdAt,
    fingerprint: chain.fingerprint,
  });
}
