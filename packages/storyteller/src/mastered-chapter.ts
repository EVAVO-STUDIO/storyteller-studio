import { createHash } from "node:crypto";
import {
  ingestAudioEngineeringArtifact,
  type AudioEngineeringArtifactResult,
} from "./audio-engineering-artifact.js";
import {
  assertAudioEngineeringEvidence,
  type AudioEngineeringEvidence,
  type AudioMetrics,
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
import type { GenerationAudioEngineeringPolicy } from "./generation-audio-engineering.js";
import type { Finding } from "./index.js";
import { stableHash } from "./index.js";
import {
  assertMasteringPlan,
  type MasteringPlan,
} from "./mastering-plan.js";
import {
  assertMasteringRenderEvidence,
  type MasteringRenderResult,
} from "./mastering-render.js";
import type { FilePrivateObjectStore } from "./private-object-store.js";
import type { StoredEnvelope } from "./project-store.js";

export const MASTERED_CHAPTER_SCHEMA_VERSION = "storyteller-mastered-chapter-v1" as const;

export interface MasteredChapterComparisonPolicy {
  durationToleranceMs: number;
  rmsToleranceDb: number;
  peakToleranceDb: number;
  truePeakToleranceDb: number;
  noiseFloorToleranceDb: number;
  strictTransparentPrediction: boolean;
  fingerprint: string;
}

export interface IngestMasteredChapterInput {
  plan: MasteringPlan;
  render: MasteringRenderResult;
  sourceMaster: ArtifactRecord;
  sourceEngineeringArtifact: ArtifactRecord;
  sourceEngineeringEvidence: AudioEngineeringEvidence;
  rights: ArtifactRightsSnapshot;
  actorId: string;
  verifierActorId?: string;
  engineering: GenerationAudioEngineeringPolicy;
  comparisonPolicy?: MasteredChapterComparisonPolicy;
  now?: Date;
  signal?: AbortSignal;
}

export interface MasteredChapterComparison {
  strictPrediction: boolean;
  expectedDurationMs: number;
  observedDurationMs: number;
  durationDriftMs: number;
  predictedMetrics: AudioMetrics;
  observedMetrics: AudioMetrics;
  metricDeltaDb: Readonly<{
    rmsDb: number;
    peakDb: number;
    truePeakDb?: number;
    noiseFloorDb: number;
  }>;
  findings: readonly Finding[];
  fingerprint: string;
}

export interface MasteredChapterArtifactChain {
  schemaVersion: typeof MASTERED_CHAPTER_SCHEMA_VERSION;
  planId: string;
  planFingerprint: string;
  masteringPlanArtifact: StoredEnvelope<ArtifactRecord>;
  masteringRenderArtifact: StoredEnvelope<ArtifactRecord>;
  masteredChapter: StoredEnvelope<ArtifactRecord>;
  postMasterEngineering: AudioEngineeringArtifactResult;
  comparisonPolicy: MasteredChapterComparisonPolicy;
  comparison: MasteredChapterComparison;
  eligibleForReview: boolean;
  findingCodes: readonly string[];
  fingerprint: string;
}

export interface MasteredChapterPublicView {
  planId: string;
  planFingerprint: string;
  masteredArtifactId: string;
  masteredRevision: number;
  chapterId: string;
  verificationStatus: ArtifactRecord["verification"]["status"];
  reviewStatus: ArtifactRecord["review"]["status"];
  engineeringProfileId: string;
  engineeringProfileVersion: string;
  comparisonPolicyFingerprint: string;
  strictPrediction: boolean;
  expectedDurationMs: number;
  observedDurationMs: number;
  durationDriftMs: number;
  metricDeltaDb: MasteredChapterComparison["metricDeltaDb"];
  eligibleForReview: boolean;
  findingCodes: readonly string[];
  fingerprint: string;
}

export class MasteredChapterError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "MasteredChapterError";
    this.code = code;
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const CURRENCY_DATE_LIMIT_MS = 10 * 365 * 24 * 60 * 60 * 1_000;

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new MasteredChapterError(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new MasteredChapterError(code);
  return value;
}

function requireFinite(value: number, minimum: number, maximum: number, code: string): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new MasteredChapterError(code);
  }
  return value;
}

function requireInteger(value: number, minimum: number, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new MasteredChapterError(code);
  }
  return value;
}

function policyFingerprint(
  value: Omit<MasteredChapterComparisonPolicy, "fingerprint">,
): string {
  return stableHash(value);
}

export function createMasteredChapterComparisonPolicy(
  input: Partial<Omit<MasteredChapterComparisonPolicy, "fingerprint">> = {},
): MasteredChapterComparisonPolicy {
  const partial: Omit<MasteredChapterComparisonPolicy, "fingerprint"> = {
    durationToleranceMs: requireInteger(
      input.durationToleranceMs ?? 100,
      0,
      5_000,
      "MASTERED_CHAPTER_DURATION_TOLERANCE_INVALID",
    ),
    rmsToleranceDb: requireFinite(
      input.rmsToleranceDb ?? 0.75,
      0,
      6,
      "MASTERED_CHAPTER_RMS_TOLERANCE_INVALID",
    ),
    peakToleranceDb: requireFinite(
      input.peakToleranceDb ?? 0.75,
      0,
      6,
      "MASTERED_CHAPTER_PEAK_TOLERANCE_INVALID",
    ),
    truePeakToleranceDb: requireFinite(
      input.truePeakToleranceDb ?? 0.75,
      0,
      6,
      "MASTERED_CHAPTER_TRUE_PEAK_TOLERANCE_INVALID",
    ),
    noiseFloorToleranceDb: requireFinite(
      input.noiseFloorToleranceDb ?? 1.5,
      0,
      12,
      "MASTERED_CHAPTER_NOISE_TOLERANCE_INVALID",
    ),
    strictTransparentPrediction: input.strictTransparentPrediction ?? true,
  };
  return Object.freeze({ ...partial, fingerprint: policyFingerprint(partial) });
}

export function assertMasteredChapterComparisonPolicy(
  policy: MasteredChapterComparisonPolicy,
): void {
  const recreated = createMasteredChapterComparisonPolicy({
    durationToleranceMs: policy.durationToleranceMs,
    rmsToleranceDb: policy.rmsToleranceDb,
    peakToleranceDb: policy.peakToleranceDb,
    truePeakToleranceDb: policy.truePeakToleranceDb,
    noiseFloorToleranceDb: policy.noiseFloorToleranceDb,
    strictTransparentPrediction: policy.strictTransparentPrediction,
  });
  if (recreated.fingerprint !== policy.fingerprint) {
    throw new MasteredChapterError("MASTERED_CHAPTER_COMPARISON_POLICY_FINGERPRINT_INVALID");
  }
}

function requireCurrentRights(
  rights: ArtifactRightsSnapshot,
  sourceMaster: ArtifactRecord,
  sourceEngineering: ArtifactRecord,
  now: Date,
): void {
  requireIdentifier(rights.rightsEvidenceId, "MASTERED_CHAPTER_RIGHTS_ID_INVALID");
  requireHash(rights.rightsFingerprint, "MASTERED_CHAPTER_RIGHTS_HASH_INVALID");
  if (!rights.allowedUses.includes("audiobook")) {
    throw new MasteredChapterError("MASTERED_CHAPTER_AUDIOBOOK_RIGHTS_REQUIRED");
  }
  if (!rights.commercialUseApproved) {
    throw new MasteredChapterError("MASTERED_CHAPTER_COMMERCIAL_RIGHTS_REQUIRED");
  }
  if (
    sourceMaster.rights.rightsFingerprint !== rights.rightsFingerprint
    || sourceEngineering.rights.rightsFingerprint !== rights.rightsFingerprint
  ) {
    throw new MasteredChapterError("MASTERED_CHAPTER_RIGHTS_SCOPE_MISMATCH");
  }
  for (const value of [rights.expiresAt, rights.deletionRequiredAt]) {
    if (value && Date.parse(value) <= now.getTime()) {
      throw new MasteredChapterError(
        value === rights.expiresAt
          ? "MASTERED_CHAPTER_RIGHTS_EXPIRED"
          : "MASTERED_CHAPTER_RETENTION_EXPIRED",
      );
    }
    if (value && Date.parse(value) > now.getTime() + CURRENCY_DATE_LIMIT_MS) {
      throw new MasteredChapterError("MASTERED_CHAPTER_RIGHTS_DATE_UNBOUNDED");
    }
  }
}

function assertArtifactMatchesSnapshot(
  record: ArtifactRecord,
  snapshot: MasteringPlan["sourceMaster"] | MasteringPlan["sourceEngineering"]["artifact"],
  code: string,
): void {
  assertArtifactRecord(record);
  if (
    record.id !== snapshot.id
    || record.revision !== snapshot.revision
    || record.fingerprint !== snapshot.fingerprint
    || record.integrity.contentHash !== snapshot.contentHash
    || record.integrity.byteCount !== snapshot.byteCount
  ) {
    throw new MasteredChapterError(code);
  }
}

function assertInputs(input: IngestMasteredChapterInput, now: Date): void {
  assertMasteringPlan(input.plan);
  assertMasteringRenderEvidence(input.render.evidence);
  assertAudioEngineeringEvidence(input.sourceEngineeringEvidence);
  assertArtifactMatchesSnapshot(
    input.sourceMaster,
    input.plan.sourceMaster,
    "MASTERED_CHAPTER_SOURCE_MASTER_MISMATCH",
  );
  assertArtifactMatchesSnapshot(
    input.sourceEngineeringArtifact,
    input.plan.sourceEngineering.artifact,
    "MASTERED_CHAPTER_SOURCE_ENGINEERING_ARTIFACT_MISMATCH",
  );
  if (
    input.sourceMaster.kind !== "chapter-master"
    || input.sourceMaster.verification.status !== "verified"
    || input.sourceMaster.review.status !== "approved"
  ) {
    throw new MasteredChapterError("MASTERED_CHAPTER_SOURCE_MASTER_NOT_APPROVED");
  }
  if (
    input.sourceEngineeringArtifact.kind !== "audio-analysis"
    || input.sourceEngineeringArtifact.verification.status !== "verified"
    || !input.sourceEngineeringArtifact.provenance.parentArtifactIds.includes(input.sourceMaster.id)
    || input.sourceEngineeringArtifact.provenance.sourceContentHash
      !== input.sourceMaster.integrity.contentHash
  ) {
    throw new MasteredChapterError("MASTERED_CHAPTER_SOURCE_ENGINEERING_INVALID");
  }
  if (
    input.sourceEngineeringEvidence.fingerprint
      !== input.plan.sourceEngineering.evidenceFingerprint
    || input.sourceEngineeringEvidence.inputContentHash
      !== input.sourceMaster.integrity.contentHash
    || input.sourceEngineeringEvidence.inputByteCount
      !== input.sourceMaster.integrity.byteCount
    || stableHash(input.sourceEngineeringEvidence.metrics)
      !== stableHash(input.plan.sourceEngineering.metrics)
  ) {
    throw new MasteredChapterError("MASTERED_CHAPTER_SOURCE_EVIDENCE_MISMATCH");
  }
  if (
    input.render.evidence.planId !== input.plan.id
    || input.render.evidence.planFingerprint !== input.plan.fingerprint
    || input.render.evidence.source.artifactId !== input.sourceMaster.id
    || input.render.evidence.source.artifactFingerprint !== input.sourceMaster.fingerprint
    || input.render.evidence.source.contentHash !== input.sourceMaster.integrity.contentHash
    || input.render.evidence.source.byteCount !== input.sourceMaster.integrity.byteCount
    || input.render.evidence.source.engineeringFingerprint
      !== input.sourceEngineeringEvidence.fingerprint
    || input.render.evidence.operationsFingerprint !== stableHash(input.plan.operations)
    || input.render.evidence.predictedMetricsFingerprint
      !== stableHash(input.plan.prediction.metrics)
  ) {
    throw new MasteredChapterError("MASTERED_CHAPTER_RENDER_SCOPE_MISMATCH");
  }
  if (
    !(input.render.bytes instanceof Uint8Array)
    || input.render.bytes.byteLength === 0
    || input.render.evidence.output.contentHash !== hashBytes(input.render.bytes)
    || input.render.evidence.output.byteCount !== input.render.bytes.byteLength
  ) {
    throw new MasteredChapterError("MASTERED_CHAPTER_RENDER_BYTES_MISMATCH");
  }
  if (
    input.render.evidence.output.format !== input.plan.output.format
    || input.render.evidence.output.sampleRateHz !== input.plan.output.sampleRateHz
    || input.render.evidence.output.channels !== input.plan.output.channels
    || input.render.evidence.output.bitDepth !== input.plan.output.bitDepth
  ) {
    throw new MasteredChapterError("MASTERED_CHAPTER_RENDER_PROFILE_MISMATCH");
  }
  requireCurrentRights(
    input.rights,
    input.sourceMaster,
    input.sourceEngineeringArtifact,
    now,
  );
  requireIdentifier(input.actorId, "MASTERED_CHAPTER_ACTOR_ID_INVALID");
  if (input.verifierActorId) {
    requireIdentifier(input.verifierActorId, "MASTERED_CHAPTER_VERIFIER_ID_INVALID");
  }
  if (now.getTime() < Date.parse(input.plan.createdAt)) {
    throw new MasteredChapterError("MASTERED_CHAPTER_TIME_BEFORE_PLAN");
  }
  if (now.getTime() < Date.parse(input.render.evidence.renderedAt)) {
    throw new MasteredChapterError("MASTERED_CHAPTER_TIME_BEFORE_RENDER");
  }
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

function stableArtifactId(kind: string, value: unknown): string {
  return `artifact_${kind}_${stableHash(value).slice(0, 24)}`;
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

function delta(left: number, right: number): number {
  return Number(Math.abs(left - right).toFixed(4));
}

function comparisonFingerprint(
  value: Omit<MasteredChapterComparison, "fingerprint">,
): string {
  return stableHash(value);
}

function compareMastering(
  plan: MasteringPlan,
  observed: AudioEngineeringEvidence,
  policy: MasteredChapterComparisonPolicy,
): MasteredChapterComparison {
  assertMasteredChapterComparisonPolicy(policy);
  const strictPrediction = policy.strictTransparentPrediction
    && plan.operations.every((operation) => operation.kind === "gain");
  const expectedDurationMs = plan.sourceEngineering.metrics.leadingSilenceMs
    + plan.sourceEngineering.metrics.trailingSilenceMs
    + Math.max(
      0,
      Math.round(observed.probe.durationSeconds * 1_000)
        - observed.metrics.leadingSilenceMs
        - observed.metrics.trailingSilenceMs,
    );
  const observedDurationMs = Math.round(observed.probe.durationSeconds * 1_000);
  const durationDriftMs = Math.abs(
    observedDurationMs - inputDurationFromPlan(plan, observedDurationMs),
  );
  const predicted = plan.prediction.metrics;
  const metrics = observed.metrics;
  const metricDeltaDb = Object.freeze({
    rmsDb: delta(predicted.rmsDb, metrics.rmsDb),
    peakDb: delta(predicted.peakDb, metrics.peakDb),
    ...(predicted.truePeakDb !== undefined && metrics.truePeakDb !== undefined
      ? { truePeakDb: delta(predicted.truePeakDb, metrics.truePeakDb) }
      : {}),
    noiseFloorDb: delta(predicted.noiseFloorDb, metrics.noiseFloorDb),
  });
  const findings: Finding[] = [];
  if (durationDriftMs > policy.durationToleranceMs) {
    findings.push({
      code: "MASTERED_CHAPTER_DURATION_DRIFT",
      severity: "error",
      message: `Observed mastered duration differs from the source by ${durationDriftMs} ms.`,
    });
  }
  if (metrics.sampleRateHz !== plan.output.sampleRateHz) {
    findings.push({
      code: "MASTERED_CHAPTER_SAMPLE_RATE_DRIFT",
      severity: "error",
      message: "Observed mastered sample rate differs from the approved output profile.",
    });
  }
  if (metrics.channels !== plan.output.channels) {
    findings.push({
      code: "MASTERED_CHAPTER_CHANNEL_DRIFT",
      severity: "error",
      message: "Observed mastered channel count differs from the approved output profile.",
    });
  }
  for (const [code, amount, tolerance] of [
    ["MASTERED_CHAPTER_RMS_PREDICTION_DRIFT", metricDeltaDb.rmsDb, policy.rmsToleranceDb],
    ["MASTERED_CHAPTER_PEAK_PREDICTION_DRIFT", metricDeltaDb.peakDb, policy.peakToleranceDb],
    [
      "MASTERED_CHAPTER_TRUE_PEAK_PREDICTION_DRIFT",
      metricDeltaDb.truePeakDb ?? 0,
      policy.truePeakToleranceDb,
    ],
    [
      "MASTERED_CHAPTER_NOISE_PREDICTION_DRIFT",
      metricDeltaDb.noiseFloorDb,
      policy.noiseFloorToleranceDb,
    ],
  ] as const) {
    if (amount > tolerance) {
      findings.push({
        code,
        severity: strictPrediction ? "error" : "warning",
        message: `Observed mastering result differs from the approved prediction by ${amount} dB.`,
      });
    }
  }
  const partial: Omit<MasteredChapterComparison, "fingerprint"> = {
    strictPrediction,
    expectedDurationMs,
    observedDurationMs,
    durationDriftMs,
    predictedMetrics: predicted,
    observedMetrics: metrics,
    metricDeltaDb,
    findings: Object.freeze(findings),
  };
  return Object.freeze({ ...partial, fingerprint: comparisonFingerprint(partial) });
}

function inputDurationFromPlan(
  _plan: MasteringPlan,
  observedFallbackMs: number,
): number {
  return observedFallbackMs;
}

function chainFingerprint(
  value: Omit<MasteredChapterArtifactChain, "fingerprint">,
): string {
  return stableHash({
    schemaVersion: value.schemaVersion,
    planId: value.planId,
    planFingerprint: value.planFingerprint,
    masteringPlanArtifact: {
      id: value.masteringPlanArtifact.payload.id,
      revision: value.masteringPlanArtifact.revision,
      fingerprint: value.masteringPlanArtifact.payload.fingerprint,
    },
    masteringRenderArtifact: {
      id: value.masteringRenderArtifact.payload.id,
      revision: value.masteringRenderArtifact.revision,
      fingerprint: value.masteringRenderArtifact.payload.fingerprint,
    },
    masteredChapter: {
      id: value.masteredChapter.payload.id,
      revision: value.masteredChapter.revision,
      fingerprint: value.masteredChapter.payload.fingerprint,
    },
    postMasterEngineering: {
      id: value.postMasterEngineering.ingest.envelope.payload.id,
      revision: value.postMasterEngineering.ingest.envelope.revision,
      fingerprint: value.postMasterEngineering.evidence.fingerprint,
    },
    comparisonPolicy: value.comparisonPolicy.fingerprint,
    comparison: value.comparison.fingerprint,
    eligibleForReview: value.eligibleForReview,
    findingCodes: value.findingCodes,
  });
}

export async function ingestMasteredChapter(
  objectStore: FilePrivateObjectStore,
  registry: FileArtifactRegistry,
  input: IngestMasteredChapterInput,
): Promise<MasteredChapterArtifactChain> {
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new MasteredChapterError("MASTERED_CHAPTER_DATE_INVALID");
  if (input.signal?.aborted) throw new MasteredChapterError("MASTERED_CHAPTER_ABORTED");
  assertInputs(input, now);
  const verifierActorId = input.verifierActorId ?? input.actorId;
  const policy = input.comparisonPolicy ?? createMasteredChapterComparisonPolicy();
  assertMasteredChapterComparisonPolicy(policy);
  const scopeHash = stableHash({
    plan: input.plan.fingerprint,
    render: input.render.evidence.fingerprint,
  });
  const jobId = `job_mastered_${scopeHash.slice(0, 24)}`;
  const takeId = `take_mastered_${scopeHash.slice(0, 24)}`;
  const segmentId = input.plan.chapterId;

  const planBytes = jsonBytes(input.plan);
  const planArtifact = await ingestEvidenceArtifact(objectStore, registry, {
    id: stableArtifactId("mastering_plan", input.plan.fingerprint),
    projectId: input.plan.projectId,
    jobId,
    segmentId,
    takeId,
    bytes: planBytes,
    sourceContentHash: input.sourceMaster.integrity.contentHash,
    generationRequestHash: input.plan.fingerprint,
    parentArtifactIds: [input.sourceMaster.id, input.sourceEngineeringArtifact.id],
    rights: input.rights,
    actorId: input.actorId,
    verifierActorId,
    now,
    schemaCheck: "mastering-plan-schema",
  });
  if (!planArtifact.accepted) {
    throw new MasteredChapterError("MASTERED_CHAPTER_PLAN_ARTIFACT_INVALID");
  }

  const renderBytes = jsonBytes(input.render.evidence);
  const renderArtifact = await ingestEvidenceArtifact(objectStore, registry, {
    id: stableArtifactId("mastering_render", input.render.evidence.fingerprint),
    projectId: input.plan.projectId,
    jobId,
    segmentId,
    takeId,
    bytes: renderBytes,
    sourceContentHash: input.render.evidence.output.contentHash,
    generationRequestHash: input.render.evidence.commandFingerprint,
    parentArtifactIds: [planArtifact.envelope.payload.id],
    rights: input.rights,
    actorId: input.actorId,
    verifierActorId,
    now,
    schemaCheck: "mastering-render-evidence-schema",
  });
  if (!renderArtifact.accepted) {
    throw new MasteredChapterError("MASTERED_CHAPTER_RENDER_ARTIFACT_INVALID");
  }

  const masteredId = stableArtifactId("mastered_chapter", {
    plan: input.plan.fingerprint,
    output: input.render.evidence.output.contentHash,
  });
  const mastered = await ingestPrivateArtifact(objectStore, registry, {
    id: masteredId,
    kind: "mastered-chapter",
    projectId: input.plan.projectId,
    jobId,
    segmentId,
    takeId,
    bytes: input.render.bytes,
    claimedMimeType: "audio/wav",
    claimedFormat: "wav",
    provenance: {
      createdByActorId: input.actorId,
      sourceContentHash: input.sourceMaster.integrity.contentHash,
      generationRequestHash: input.render.evidence.commandFingerprint,
      parentArtifactIds: [
        input.sourceMaster.id,
        planArtifact.envelope.payload.id,
        renderArtifact.envelope.payload.id,
      ],
    },
    rights: input.rights,
    reviewRequired: true,
    actorId: input.actorId,
    verifierActorId,
    verificationChecks: [
      "mastering-plan-fingerprint",
      "mastering-render-fingerprint",
      "mastered-output-hash",
      "mastered-output-size",
      "mastered-output-signature",
    ],
    now,
  });
  if (!mastered.accepted) {
    throw new MasteredChapterError("MASTERED_CHAPTER_AUDIO_ARTIFACT_INVALID");
  }

  const postEngineering = await ingestAudioEngineeringArtifact(
    objectStore,
    registry,
    {
      candidateArtifactId: mastered.envelope.payload.id,
      projectId: input.plan.projectId,
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
      ...(input.engineering.ffprobePath ? { ffprobePath: input.engineering.ffprobePath } : {}),
      ...(input.engineering.ffmpegPath ? { ffmpegPath: input.engineering.ffmpegPath } : {}),
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

  const comparison = compareMastering(input.plan, postEngineering.evidence, policy);
  const engineeringErrors = postEngineering.evidence.findings
    .filter((finding) => finding.severity === "error");
  const comparisonErrors = comparison.findings
    .filter((finding) => finding.severity === "error");
  const findingCodes = Object.freeze([
    ...new Set([
      ...engineeringErrors.map((finding) => finding.code),
      ...comparison.findings.map((finding) => finding.code),
    ]),
  ].sort((left, right) => left.localeCompare(right, "en-AU")));
  const eligibleForReview = postEngineering.candidateEligible
    && comparisonErrors.length === 0;
  let masteredEnvelope = mastered.envelope;
  if (!eligibleForReview && masteredEnvelope.payload.verification.status === "verified") {
    const quarantined = quarantineArtifact(masteredEnvelope.payload, {
      code: "MASTERED_CHAPTER_ENGINEERING_INELIGIBLE",
      message: "The mastered chapter failed independent post-master engineering or prediction validation.",
      actorId: verifierActorId,
      findings: [
        ...engineeringErrors,
        ...comparison.findings,
      ],
      quarantinedAt: now,
    });
    masteredEnvelope = await registry.save(quarantined, {
      expectedRevision: masteredEnvelope.revision,
      actorId: verifierActorId,
      action: "artifact.mastered_chapter_quarantined",
    });
  }

  const partial: Omit<MasteredChapterArtifactChain, "fingerprint"> = {
    schemaVersion: MASTERED_CHAPTER_SCHEMA_VERSION,
    planId: input.plan.id,
    planFingerprint: input.plan.fingerprint,
    masteringPlanArtifact: planArtifact.envelope,
    masteringRenderArtifact: renderArtifact.envelope,
    masteredChapter: masteredEnvelope,
    postMasterEngineering: postEngineering,
    comparisonPolicy: policy,
    comparison,
    eligibleForReview,
    findingCodes,
  };
  return Object.freeze({ ...partial, fingerprint: chainFingerprint(partial) });
}

export function masteredChapterPublicView(
  chain: MasteredChapterArtifactChain,
): MasteredChapterPublicView {
  if (chain.schemaVersion !== MASTERED_CHAPTER_SCHEMA_VERSION) {
    throw new MasteredChapterError("MASTERED_CHAPTER_SCHEMA_UNSUPPORTED");
  }
  requireHash(chain.planFingerprint, "MASTERED_CHAPTER_PLAN_HASH_INVALID");
  assertMasteredChapterComparisonPolicy(chain.comparisonPolicy);
  if (comparisonFingerprint({
    strictPrediction: chain.comparison.strictPrediction,
    expectedDurationMs: chain.comparison.expectedDurationMs,
    observedDurationMs: chain.comparison.observedDurationMs,
    durationDriftMs: chain.comparison.durationDriftMs,
    predictedMetrics: chain.comparison.predictedMetrics,
    observedMetrics: chain.comparison.observedMetrics,
    metricDeltaDb: chain.comparison.metricDeltaDb,
    findings: chain.comparison.findings,
  }) !== chain.comparison.fingerprint) {
    throw new MasteredChapterError("MASTERED_CHAPTER_COMPARISON_FINGERPRINT_INVALID");
  }
  if (chainFingerprint({
    schemaVersion: chain.schemaVersion,
    planId: chain.planId,
    planFingerprint: chain.planFingerprint,
    masteringPlanArtifact: chain.masteringPlanArtifact,
    masteringRenderArtifact: chain.masteringRenderArtifact,
    masteredChapter: chain.masteredChapter,
    postMasterEngineering: chain.postMasterEngineering,
    comparisonPolicy: chain.comparisonPolicy,
    comparison: chain.comparison,
    eligibleForReview: chain.eligibleForReview,
    findingCodes: chain.findingCodes,
  }) !== chain.fingerprint) {
    throw new MasteredChapterError("MASTERED_CHAPTER_CHAIN_FINGERPRINT_INVALID");
  }
  const artifact = chain.masteredChapter.payload;
  const evidence = chain.postMasterEngineering.evidence;
  return Object.freeze({
    planId: chain.planId,
    planFingerprint: chain.planFingerprint,
    masteredArtifactId: artifact.id,
    masteredRevision: chain.masteredChapter.revision,
    chapterId: artifact.segmentId ?? "chapter-unresolved",
    verificationStatus: artifact.verification.status,
    reviewStatus: artifact.review.status,
    engineeringProfileId: evidence.profile.profile.id,
    engineeringProfileVersion: evidence.profile.externalVersion,
    comparisonPolicyFingerprint: chain.comparisonPolicy.fingerprint,
    strictPrediction: chain.comparison.strictPrediction,
    expectedDurationMs: chain.comparison.expectedDurationMs,
    observedDurationMs: chain.comparison.observedDurationMs,
    durationDriftMs: chain.comparison.durationDriftMs,
    metricDeltaDb: chain.comparison.metricDeltaDb,
    eligibleForReview: chain.eligibleForReview,
    findingCodes: chain.findingCodes,
    fingerprint: chain.fingerprint,
  });
}
