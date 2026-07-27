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
  assertGenerationAudioEngineeringPolicy,
  type GenerationAudioEngineeringPolicy,
} from "./generation-audio-engineering.js";
import {
  stableHash,
  type AudioMetrics,
  type Finding,
} from "./index.js";
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
export const MASTERED_CHAPTER_COMPARISON_POLICY_SCHEMA_VERSION =
  "storyteller-mastered-chapter-comparison-policy-v1" as const;

export interface MasteredChapterComparisonPolicy {
  schemaVersion: typeof MASTERED_CHAPTER_COMPARISON_POLICY_SCHEMA_VERSION;
  id: string;
  version: string;
  reviewedAt: string;
  sourceReference: string;
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
  comparisonPolicy: MasteredChapterComparisonPolicy;
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
  sourceDurationMs: number;
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
  comparisonPolicyId: string;
  comparisonPolicyVersion: string;
  comparisonPolicyReviewedAt: string;
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
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

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

function requireBoundedText(value: string, maximum: number, code: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum || CONTROL_CHARACTERS.test(trimmed)) {
    throw new MasteredChapterError(code);
  }
  return trimmed;
}

function policyFingerprint(
  value: Omit<MasteredChapterComparisonPolicy, "fingerprint">,
): string {
  return stableHash(value);
}

export function createMasteredChapterComparisonPolicy(input: Readonly<{
  id: string;
  version: string;
  reviewedAt: string;
  sourceReference: string;
  durationToleranceMs?: number;
  rmsToleranceDb?: number;
  peakToleranceDb?: number;
  truePeakToleranceDb?: number;
  noiseFloorToleranceDb?: number;
  strictTransparentPrediction?: boolean;
  now?: Date;
}>): MasteredChapterComparisonPolicy {
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new MasteredChapterError("MASTERED_CHAPTER_COMPARISON_POLICY_NOW_INVALID");
  }
  requireIdentifier(input.id, "MASTERED_CHAPTER_COMPARISON_POLICY_ID_INVALID");
  if (!SAFE_VERSION.test(input.version)) {
    throw new MasteredChapterError("MASTERED_CHAPTER_COMPARISON_POLICY_VERSION_INVALID");
  }
  if (Number.isNaN(Date.parse(input.reviewedAt))) {
    throw new MasteredChapterError("MASTERED_CHAPTER_COMPARISON_POLICY_REVIEW_DATE_INVALID");
  }
  if (Date.parse(input.reviewedAt) > now.getTime()) {
    throw new MasteredChapterError("MASTERED_CHAPTER_COMPARISON_POLICY_REVIEW_IN_FUTURE");
  }
  const partial: Omit<MasteredChapterComparisonPolicy, "fingerprint"> = {
    schemaVersion: MASTERED_CHAPTER_COMPARISON_POLICY_SCHEMA_VERSION,
    id: input.id,
    version: input.version,
    reviewedAt: input.reviewedAt,
    sourceReference: requireBoundedText(
      input.sourceReference,
      500,
      "MASTERED_CHAPTER_COMPARISON_POLICY_SOURCE_INVALID",
    ),
    durationToleranceMs: requireInteger(
      input.durationToleranceMs ?? 100,
      0,
      5_000,
      "MASTERED_CHAPTER_DURATION_TOLERANCE_INVALID",
    ),
    rmsToleranceDb: requireFinite(input.rmsToleranceDb ?? 0.75, 0, 6, "MASTERED_CHAPTER_RMS_TOLERANCE_INVALID"),
    peakToleranceDb: requireFinite(input.peakToleranceDb ?? 0.75, 0, 6, "MASTERED_CHAPTER_PEAK_TOLERANCE_INVALID"),
    truePeakToleranceDb: requireFinite(input.truePeakToleranceDb ?? 0.75, 0, 6, "MASTERED_CHAPTER_TRUE_PEAK_TOLERANCE_INVALID"),
    noiseFloorToleranceDb: requireFinite(input.noiseFloorToleranceDb ?? 1.5, 0, 12, "MASTERED_CHAPTER_NOISE_TOLERANCE_INVALID"),
    strictTransparentPrediction: input.strictTransparentPrediction ?? true,
  };
  return Object.freeze({ ...partial, fingerprint: policyFingerprint(partial) });
}

export function assertMasteredChapterComparisonPolicy(
  policy: MasteredChapterComparisonPolicy,
): void {
  if (policy.schemaVersion !== MASTERED_CHAPTER_COMPARISON_POLICY_SCHEMA_VERSION) {
    throw new MasteredChapterError("MASTERED_CHAPTER_COMPARISON_POLICY_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(policy.id, "MASTERED_CHAPTER_COMPARISON_POLICY_ID_INVALID");
  if (!SAFE_VERSION.test(policy.version)) {
    throw new MasteredChapterError("MASTERED_CHAPTER_COMPARISON_POLICY_VERSION_INVALID");
  }
  if (Number.isNaN(Date.parse(policy.reviewedAt))) {
    throw new MasteredChapterError("MASTERED_CHAPTER_COMPARISON_POLICY_REVIEW_DATE_INVALID");
  }
  requireBoundedText(policy.sourceReference, 500, "MASTERED_CHAPTER_COMPARISON_POLICY_SOURCE_INVALID");
  requireInteger(policy.durationToleranceMs, 0, 5_000, "MASTERED_CHAPTER_DURATION_TOLERANCE_INVALID");
  requireFinite(policy.rmsToleranceDb, 0, 6, "MASTERED_CHAPTER_RMS_TOLERANCE_INVALID");
  requireFinite(policy.peakToleranceDb, 0, 6, "MASTERED_CHAPTER_PEAK_TOLERANCE_INVALID");
  requireFinite(policy.truePeakToleranceDb, 0, 6, "MASTERED_CHAPTER_TRUE_PEAK_TOLERANCE_INVALID");
  requireFinite(policy.noiseFloorToleranceDb, 0, 12, "MASTERED_CHAPTER_NOISE_TOLERANCE_INVALID");
  const { fingerprint, ...partial } = policy;
  if (policyFingerprint(partial) !== fingerprint) {
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
  for (const [value, invalidCode] of [
    [rights.expiresAt, "MASTERED_CHAPTER_RIGHTS_EXPIRY_INVALID"],
    [rights.retainUntil, "MASTERED_CHAPTER_RETAIN_UNTIL_INVALID"],
    [rights.deletionRequiredAt, "MASTERED_CHAPTER_DELETION_DATE_INVALID"],
  ] as const) {
    if (value && Number.isNaN(Date.parse(value))) throw new MasteredChapterError(invalidCode);
  }
  if (rights.expiresAt && Date.parse(rights.expiresAt) <= now.getTime()) {
    throw new MasteredChapterError("MASTERED_CHAPTER_RIGHTS_EXPIRED");
  }
  if (rights.deletionRequiredAt && Date.parse(rights.deletionRequiredAt) <= now.getTime()) {
    throw new MasteredChapterError("MASTERED_CHAPTER_RETENTION_EXPIRED");
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
  assertGenerationAudioEngineeringPolicy(input.engineering);
  assertMasteredChapterComparisonPolicy(input.comparisonPolicy);
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
  input.engineering.profile.fingerprint !== input.plan.targetProfile.fingerprint
) {
  throw new MasteredChapterError("MASTERED_CHAPTER_ENGINEERING_PROFILE_MISMATCH");
}
  const sourceDurationMs = requireInteger(
    Math.round(input.sourceEngineeringEvidence.probe.durationSeconds * 1_000),
    1,
    7 * 24 * 60 * 60 * 1_000,
    "MASTERED_CHAPTER_SOURCE_DURATION_INVALID",
  );
  if (input.render.evidence.source.durationMs !== sourceDurationMs) {
    throw new MasteredChapterError("MASTERED_CHAPTER_SOURCE_DURATION_MISMATCH");
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
  expectedDurationMs: number,
  policy: MasteredChapterComparisonPolicy,
): MasteredChapterComparison {
  assertMasteredChapterComparisonPolicy(policy);
  requireInteger(expectedDurationMs, 1, 7 * 24 * 60 * 60 * 1_000, "MASTERED_CHAPTER_EXPECTED_DURATION_INVALID");
  const strictPrediction = policy.strictTransparentPrediction
    && plan.operations.every((operation) => operation.kind === "gain");
  const observedDurationMs = Math.round(observed.probe.durationSeconds * 1_000);
  const durationDriftMs = Math.abs(observedDurationMs - expectedDurationMs);
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
  if (predicted.truePeakDb !== undefined && metrics.truePeakDb === undefined) {
    findings.push({
      code: "MASTERED_CHAPTER_TRUE_PEAK_OBSERVATION_MISSING",
      severity: "error",
      message: "Post-master engineering did not provide required true-peak evidence.",
    });
  }
  if (durationDriftMs > policy.durationToleranceMs) {
    findings.push({
      code: "MASTERED_CHAPTER_DURATION_DRIFT",
      severity: "error",
      message: `Observed mastered duration differs from the source by ${durationDriftMs} ms.`,
    });
  }
  if (metrics.sampleRateHz !== plan.output.sampleRateHz) {
    findings.push({ code: "MASTERED_CHAPTER_SAMPLE_RATE_DRIFT", severity: "error", message: "Observed mastered sample rate differs from the approved output profile." });
  }
  if (metrics.channels !== plan.output.channels) {
    findings.push({ code: "MASTERED_CHAPTER_CHANNEL_DRIFT", severity: "error", message: "Observed mastered channel count differs from the approved output profile." });
  }
  const checks: Array<readonly [string, number, number]> = [
    ["MASTERED_CHAPTER_RMS_PREDICTION_DRIFT", metricDeltaDb.rmsDb, policy.rmsToleranceDb],
    ["MASTERED_CHAPTER_PEAK_PREDICTION_DRIFT", metricDeltaDb.peakDb, policy.peakToleranceDb],
    ["MASTERED_CHAPTER_NOISE_PREDICTION_DRIFT", metricDeltaDb.noiseFloorDb, policy.noiseFloorToleranceDb],
  ];
  if (metricDeltaDb.truePeakDb !== undefined) {
    checks.push(["MASTERED_CHAPTER_TRUE_PEAK_PREDICTION_DRIFT", metricDeltaDb.truePeakDb, policy.truePeakToleranceDb]);
  }
  for (const [code, amount, tolerance] of checks) {
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

function chainFingerprint(
  value: Omit<MasteredChapterArtifactChain, "fingerprint">,
): string {
  return stableHash({
    schemaVersion: value.schemaVersion,
    planId: value.planId,
    planFingerprint: value.planFingerprint,
    sourceDurationMs: value.sourceDurationMs,
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
  const policy = input.comparisonPolicy;
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

  const comparison = compareMastering(
  input.plan,
  postEngineering.evidence,
  input.render.evidence.source.durationMs,
  policy,
);
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
    sourceDurationMs: input.render.evidence.source.durationMs,
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

function assertMetrics(metrics: AudioMetrics, code: string): void {
  for (const value of [metrics.rmsDb, metrics.peakDb, metrics.noiseFloorDb]) {
    if (!Number.isFinite(value)) throw new MasteredChapterError(code);
  }
  if (metrics.truePeakDb !== undefined && !Number.isFinite(metrics.truePeakDb)) {
    throw new MasteredChapterError(code);
  }
  requireInteger(metrics.sampleRateHz, 8_000, 384_000, code);
  requireInteger(metrics.channels, 1, 32, code);
  requireInteger(metrics.clippedSampleCount, 0, Number.MAX_SAFE_INTEGER, code);
  requireInteger(metrics.leadingSilenceMs, 0, 86_400_000, code);
  requireInteger(metrics.trailingSilenceMs, 0, 86_400_000, code);
}

function assertComparison(comparison: MasteredChapterComparison): void {
  requireInteger(comparison.expectedDurationMs, 1, 7 * 24 * 60 * 60 * 1_000, "MASTERED_CHAPTER_COMPARISON_DURATION_INVALID");
  requireInteger(comparison.observedDurationMs, 1, 7 * 24 * 60 * 60 * 1_000, "MASTERED_CHAPTER_COMPARISON_DURATION_INVALID");
  if (comparison.durationDriftMs !== Math.abs(comparison.observedDurationMs - comparison.expectedDurationMs)) {
    throw new MasteredChapterError("MASTERED_CHAPTER_COMPARISON_DURATION_MISMATCH");
  }
  assertMetrics(comparison.predictedMetrics, "MASTERED_CHAPTER_PREDICTED_METRICS_INVALID");
  assertMetrics(comparison.observedMetrics, "MASTERED_CHAPTER_OBSERVED_METRICS_INVALID");
  const expectedDelta = {
    rmsDb: delta(comparison.predictedMetrics.rmsDb, comparison.observedMetrics.rmsDb),
    peakDb: delta(comparison.predictedMetrics.peakDb, comparison.observedMetrics.peakDb),
    ...(comparison.predictedMetrics.truePeakDb !== undefined
      && comparison.observedMetrics.truePeakDb !== undefined
      ? { truePeakDb: delta(comparison.predictedMetrics.truePeakDb, comparison.observedMetrics.truePeakDb) }
      : {}),
    noiseFloorDb: delta(
      comparison.predictedMetrics.noiseFloorDb,
      comparison.observedMetrics.noiseFloorDb,
    ),
  };
  if (stableHash(expectedDelta) !== stableHash(comparison.metricDeltaDb)) {
    throw new MasteredChapterError("MASTERED_CHAPTER_COMPARISON_DELTA_MISMATCH");
  }
  if (!Array.isArray(comparison.findings) || comparison.findings.some((finding) =>
    !finding.code?.trim()
    || !["info", "warning", "error"].includes(finding.severity)
    || !finding.message?.trim()
  )) {
    throw new MasteredChapterError("MASTERED_CHAPTER_COMPARISON_FINDINGS_INVALID");
  }
  const { fingerprint, ...partial } = comparison;
  if (comparisonFingerprint(partial) !== fingerprint) {
    throw new MasteredChapterError("MASTERED_CHAPTER_COMPARISON_FINGERPRINT_INVALID");
  }
}

function envelopeHash(envelope: StoredEnvelope<ArtifactRecord>): string {
  return stableHash({
    schemaVersion: envelope.schemaVersion,
    entityType: envelope.entityType,
    entityId: envelope.entityId,
    revision: envelope.revision,
    createdAt: envelope.createdAt,
    savedAt: envelope.savedAt,
    contentHash: envelope.contentHash,
    previousEnvelopeHash: envelope.previousEnvelopeHash ?? null,
    payload: envelope.payload,
  });
}

function assertArtifactEnvelope(
  envelope: StoredEnvelope<ArtifactRecord>,
  kind: ArtifactRecord["kind"],
): void {
  assertArtifactRecord(envelope.payload);
  if (
    envelope.schemaVersion !== "storyteller-store-v1"
    || envelope.entityType !== "artifact"
    || envelope.entityId !== envelope.payload.id
    || envelope.revision !== envelope.payload.revision
    || envelope.payload.kind !== kind
    || envelope.contentHash !== stableHash(envelope.payload)
    || envelope.envelopeHash !== envelopeHash(envelope)
  ) {
    throw new MasteredChapterError("MASTERED_CHAPTER_ARTIFACT_ENVELOPE_INVALID");
  }
}

export function assertMasteredChapterArtifactChain(
  chain: MasteredChapterArtifactChain,
): void {
  if (chain.schemaVersion !== MASTERED_CHAPTER_SCHEMA_VERSION) {
    throw new MasteredChapterError("MASTERED_CHAPTER_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(chain.planId, "MASTERED_CHAPTER_PLAN_ID_INVALID");
  requireHash(chain.planFingerprint, "MASTERED_CHAPTER_PLAN_HASH_INVALID");
  requireInteger(chain.sourceDurationMs, 1, 7 * 24 * 60 * 60 * 1_000, "MASTERED_CHAPTER_SOURCE_DURATION_INVALID");
  assertMasteredChapterComparisonPolicy(chain.comparisonPolicy);
  assertComparison(chain.comparison);
  assertArtifactEnvelope(chain.masteringPlanArtifact, "audio-analysis");
  assertArtifactEnvelope(chain.masteringRenderArtifact, "audio-analysis");
  assertArtifactEnvelope(chain.masteredChapter, "mastered-chapter");
  assertArtifactEnvelope(chain.postMasterEngineering.ingest.envelope, "audio-analysis");
  assertAudioEngineeringEvidence(chain.postMasterEngineering.evidence);

  const planArtifact = chain.masteringPlanArtifact.payload;
  const renderArtifact = chain.masteringRenderArtifact.payload;
  const mastered = chain.masteredChapter.payload;
  const postArtifact = chain.postMasterEngineering.ingest.envelope.payload;
  for (const record of [planArtifact, renderArtifact, mastered, postArtifact]) {
    if (
      record.projectId !== mastered.projectId
      || record.jobId !== mastered.jobId
      || record.segmentId !== mastered.segmentId
      || record.takeId !== mastered.takeId
    ) {
      throw new MasteredChapterError("MASTERED_CHAPTER_ARTIFACT_SCOPE_MISMATCH");
    }
  }
  if (
    planArtifact.provenance.generationRequestHash !== chain.planFingerprint
    || renderArtifact.provenance.parentArtifactIds.length !== 1
    || renderArtifact.provenance.parentArtifactIds[0] !== planArtifact.id
    || mastered.provenance.parentArtifactIds.length !== 3
    || !mastered.provenance.parentArtifactIds.includes(planArtifact.id)
    || !mastered.provenance.parentArtifactIds.includes(renderArtifact.id)
    || postArtifact.provenance.parentArtifactIds.length !== 1
    || postArtifact.provenance.parentArtifactIds[0] !== mastered.id
  ) {
    throw new MasteredChapterError("MASTERED_CHAPTER_ARTIFACT_PARENT_MISMATCH");
  }
  if (
    chain.postMasterEngineering.evidence.inputContentHash !== mastered.integrity.contentHash
    || chain.postMasterEngineering.evidence.inputByteCount !== mastered.integrity.byteCount
    || postArtifact.provenance.sourceContentHash !== mastered.integrity.contentHash
    || stableHash(chain.comparison.observedMetrics)
      !== stableHash(chain.postMasterEngineering.evidence.metrics)
    || chain.comparison.observedDurationMs
      !== Math.round(chain.postMasterEngineering.evidence.probe.durationSeconds * 1_000)
    || chain.comparison.expectedDurationMs !== chain.sourceDurationMs
  ) {
    throw new MasteredChapterError("MASTERED_CHAPTER_DURATION_CHAIN_MISMATCH");
  }

  const engineeringErrors = chain.postMasterEngineering.evidence.findings
    .filter((finding) => finding.severity === "error");
  const comparisonErrors = chain.comparison.findings
    .filter((finding) => finding.severity === "error");
  const expectedEligible = chain.postMasterEngineering.candidateEligible
    && comparisonErrors.length === 0;
  if (chain.eligibleForReview !== expectedEligible) {
    throw new MasteredChapterError("MASTERED_CHAPTER_ELIGIBILITY_MISMATCH");
  }
  if (
    chain.postMasterEngineering.candidateEligible
      !== (chain.postMasterEngineering.evidence.eligible
        && chain.postMasterEngineering.ingest.accepted)
  ) {
    throw new MasteredChapterError("MASTERED_CHAPTER_ENGINEERING_ELIGIBILITY_MISMATCH");
  }
  const expectedFindingCodes = [
    ...new Set([
      ...engineeringErrors.map((finding) => finding.code),
      ...chain.comparison.findings.map((finding) => finding.code),
    ]),
  ].sort((left, right) => left.localeCompare(right, "en-AU"));
  if (stableHash(expectedFindingCodes) !== stableHash(chain.findingCodes)) {
    throw new MasteredChapterError("MASTERED_CHAPTER_FINDING_CODES_MISMATCH");
  }
  if (
    (chain.eligibleForReview && mastered.verification.status !== "verified")
    || (!chain.eligibleForReview && mastered.verification.status !== "quarantined")
    || mastered.review.required !== true
    || postArtifact.verification.status !== "verified"
  ) {
    throw new MasteredChapterError("MASTERED_CHAPTER_ARTIFACT_STATE_MISMATCH");
  }
  const { fingerprint, ...partial } = chain;
  if (chainFingerprint(partial) !== fingerprint) {
    throw new MasteredChapterError("MASTERED_CHAPTER_CHAIN_FINGERPRINT_INVALID");
  }
}

export function masteredChapterPublicView(
  chain: MasteredChapterArtifactChain,
): MasteredChapterPublicView {
  assertMasteredChapterArtifactChain(chain);
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
    comparisonPolicyId: chain.comparisonPolicy.id,
  comparisonPolicyVersion: chain.comparisonPolicy.version,
  comparisonPolicyReviewedAt: chain.comparisonPolicy.reviewedAt,
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
