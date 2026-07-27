import {
  assertAudioEngineeringEvidence,
  type AudioEngineeringEvidence,
  type AudioEngineeringProfileSnapshot,
} from "./audio-engineering.js";
import {
  assertArtifactRecord,
  type ArtifactRecord,
} from "./artifact-registry.js";
import {
  assessTechnicalAudio,
  stableHash,
  type AudioMetrics,
  type Finding,
  type TechnicalAssessment,
} from "./index.js";

export const MASTERING_PLAN_SCHEMA_VERSION = "storyteller-mastering-plan-v1" as const;

export type MasteringOperation =
  | Readonly<{
      kind: "high-pass";
      frequencyHz: number;
      slopeDbPerOctave: 6 | 12 | 18 | 24;
      rationaleCode: string;
    }>
  | Readonly<{
      kind: "gain";
      gainDb: number;
      rationaleCode: string;
    }>
  | Readonly<{
      kind: "true-peak-limiter";
      ceilingDb: number;
      maximumReductionDb: number;
      rationaleCode: string;
    }>;

export interface MasteringArtifactSnapshot {
  id: string;
  fingerprint: string;
  contentHash: string;
  byteCount: number;
}

export interface MasteringPrediction {
  metrics: AudioMetrics;
  technical: TechnicalAssessment;
  requiresPostRenderMeasurement: boolean;
  eligibleByPrediction: boolean;
}

export interface MasteringPlan {
  schemaVersion: typeof MASTERING_PLAN_SCHEMA_VERSION;
  id: string;
  projectId: string;
  chapterId: string;
  sourceMaster: MasteringArtifactSnapshot;
  sourceEngineering: Readonly<{
    artifact: MasteringArtifactSnapshot;
    evidenceFingerprint: string;
    profileFingerprint: string;
  }>;
  targetProfile: AudioEngineeringProfileSnapshot;
  operations: readonly MasteringOperation[];
  prediction: MasteringPrediction;
  rationale: string;
  createdByActorId: string;
  createdAt: string;
  fingerprint: string;
}

export interface CreateMasteringPlanInput {
  id: string;
  projectId: string;
  chapterId: string;
  chapterMaster: ArtifactRecord;
  engineeringArtifact: ArtifactRecord;
  engineeringEvidence: AudioEngineeringEvidence;
  targetProfile: AudioEngineeringProfileSnapshot;
  operations: readonly MasteringOperation[];
  rationale: string;
  createdByActorId: string;
  createdAt?: Date;
}

export interface TransparentMasteringProposal {
  possible: boolean;
  operations: readonly MasteringOperation[];
  predictedMetrics: AudioMetrics;
  findings: readonly Finding[];
  fingerprint: string;
}

export interface MasteringPlanPublicView {
  id: string;
  chapterId: string;
  targetProfileId: string;
  targetProfileVersion: string;
  operationKinds: readonly MasteringOperation["kind"][];
  predictedMetrics: AudioMetrics;
  predictedEligible: boolean;
  requiresPostRenderMeasurement: boolean;
  findingCodes: readonly string[];
  createdAt: string;
  fingerprint: string;
}

export class MasteringPlanError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "MasteringPlanError";
    this.code = code;
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const MAX_RATIONALE = 2_000;
const MAX_OPERATIONS = 3;
const EPSILON = 0.0001;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new MasteringPlanError(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new MasteringPlanError(code);
  return value;
}

function requireFinite(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new MasteringPlanError(code);
  }
  return value;
}

function requireRationale(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_RATIONALE || CONTROL_CHARACTERS.test(trimmed)) {
    throw new MasteringPlanError("MASTERING_PLAN_RATIONALE_INVALID");
  }
  return trimmed;
}

function snapshot(record: ArtifactRecord): MasteringArtifactSnapshot {
  return Object.freeze({
    id: record.id,
    fingerprint: record.fingerprint,
    contentHash: record.integrity.contentHash,
    byteCount: record.integrity.byteCount,
  });
}

function assertSnapshot(value: MasteringArtifactSnapshot): void {
  requireIdentifier(value.id, "MASTERING_PLAN_ARTIFACT_ID_INVALID");
  requireHash(value.fingerprint, "MASTERING_PLAN_ARTIFACT_FINGERPRINT_INVALID");
  requireHash(value.contentHash, "MASTERING_PLAN_ARTIFACT_HASH_INVALID");
  if (!Number.isSafeInteger(value.byteCount) || value.byteCount < 1) {
    throw new MasteringPlanError("MASTERING_PLAN_ARTIFACT_SIZE_INVALID");
  }
}

function assertVerified(record: ArtifactRecord, code: string): void {
  assertArtifactRecord(record);
  if (
    record.verification.status !== "verified"
    || record.verification.findings.some((finding) => finding.severity === "error")
    || record.quarantine
  ) {
    throw new MasteringPlanError(code);
  }
}

function assertProfile(profile: AudioEngineeringProfileSnapshot): void {
  requireIdentifier(profile.profile.id, "MASTERING_PLAN_PROFILE_ID_INVALID");
  if (!profile.externalVersion.trim() || profile.externalVersion.length > 128) {
    throw new MasteringPlanError("MASTERING_PLAN_PROFILE_VERSION_INVALID");
  }
  requireHash(profile.fingerprint, "MASTERING_PLAN_PROFILE_FINGERPRINT_INVALID");
  if (Number.isNaN(Date.parse(profile.reviewedAt))) {
    throw new MasteringPlanError("MASTERING_PLAN_PROFILE_REVIEW_DATE_INVALID");
  }
  if (!profile.sourceReference.trim() || profile.sourceReference.length > 500) {
    throw new MasteringPlanError("MASTERING_PLAN_PROFILE_SOURCE_INVALID");
  }
  const expected = stableHash({
    profile: profile.profile,
    externalVersion: profile.externalVersion,
    reviewedAt: profile.reviewedAt,
    sourceReference: profile.sourceReference,
  });
  if (expected !== profile.fingerprint) {
    throw new MasteringPlanError("MASTERING_PLAN_PROFILE_FINGERPRINT_MISMATCH");
  }
}

function assertOperation(operation: MasteringOperation): void {
  if (!SAFE_CODE.test(operation.rationaleCode)) {
    throw new MasteringPlanError("MASTERING_PLAN_OPERATION_RATIONALE_CODE_INVALID");
  }
  switch (operation.kind) {
    case "high-pass":
      requireFinite(operation.frequencyHz, 20, 120, "MASTERING_PLAN_HIGH_PASS_FREQUENCY_INVALID");
      if (![6, 12, 18, 24].includes(operation.slopeDbPerOctave)) {
        throw new MasteringPlanError("MASTERING_PLAN_HIGH_PASS_SLOPE_INVALID");
      }
      return;
    case "gain":
      requireFinite(operation.gainDb, -12, 12, "MASTERING_PLAN_GAIN_INVALID");
      return;
    case "true-peak-limiter":
      requireFinite(operation.ceilingDb, -12, -0.1, "MASTERING_PLAN_LIMITER_CEILING_INVALID");
      requireFinite(
        operation.maximumReductionDb,
        0.1,
        3,
        "MASTERING_PLAN_LIMITER_REDUCTION_INVALID",
      );
      return;
  }
}

function assertOperationOrder(operations: readonly MasteringOperation[]): void {
  if (!Array.isArray(operations) || operations.length > MAX_OPERATIONS) {
    throw new MasteringPlanError("MASTERING_PLAN_OPERATIONS_INVALID");
  }
  const order: Readonly<Record<MasteringOperation["kind"], number>> = {
    "high-pass": 0,
    gain: 1,
    "true-peak-limiter": 2,
  };
  const kinds = new Set<MasteringOperation["kind"]>();
  let previous = -1;
  for (const operation of operations) {
    assertOperation(operation);
    if (kinds.has(operation.kind)) {
      throw new MasteringPlanError("MASTERING_PLAN_OPERATION_DUPLICATE");
    }
    kinds.add(operation.kind);
    const current = order[operation.kind];
    if (current < previous) throw new MasteringPlanError("MASTERING_PLAN_OPERATION_ORDER_INVALID");
    previous = current;
  }
}

function applyPrediction(
  metrics: AudioMetrics,
  operations: readonly MasteringOperation[],
): Readonly<{
  metrics: AudioMetrics;
  requiresMeasurement: boolean;
}> {
  let gainDb = 0;
  let limiterCeiling: number | undefined;
  let requiresMeasurement = false;
  for (const operation of operations) {
    switch (operation.kind) {
      case "gain":
        gainDb += operation.gainDb;
        break;
      case "high-pass":
        requiresMeasurement = true;
        break;
      case "true-peak-limiter":
        limiterCeiling = operation.ceilingDb;
        requiresMeasurement = true;
        break;
    }
  }
  const peakBeforeLimiter = metrics.peakDb + gainDb;
  const truePeakBeforeLimiter = (metrics.truePeakDb ?? metrics.peakDb) + gainDb;
  return Object.freeze({
    metrics: Object.freeze({
      rmsDb: Number((metrics.rmsDb + gainDb).toFixed(4)),
      peakDb: Number((limiterCeiling === undefined
        ? peakBeforeLimiter
        : Math.min(peakBeforeLimiter, limiterCeiling)).toFixed(4)),
      ...(metrics.truePeakDb !== undefined || limiterCeiling !== undefined
        ? {
            truePeakDb: Number((limiterCeiling === undefined
              ? truePeakBeforeLimiter
              : Math.min(truePeakBeforeLimiter, limiterCeiling)).toFixed(4)),
          }
        : {}),
      noiseFloorDb: Number((metrics.noiseFloorDb + gainDb).toFixed(4)),
      sampleRateHz: metrics.sampleRateHz,
      ...(metrics.bitRateKbps !== undefined ? { bitRateKbps: metrics.bitRateKbps } : {}),
      channels: metrics.channels,
      clippedSampleCount: metrics.clippedSampleCount,
      leadingSilenceMs: metrics.leadingSilenceMs,
      trailingSilenceMs: metrics.trailingSilenceMs,
    }),
    requiresMeasurement,
  });
}

function prediction(
  evidence: AudioEngineeringEvidence,
  targetProfile: AudioEngineeringProfileSnapshot,
  operations: readonly MasteringOperation[],
): MasteringPrediction {
  const predicted = applyPrediction(evidence.metrics, operations);
  const technical = assessTechnicalAudio(predicted.metrics, targetProfile.profile);
  const eligibleByPrediction = technical.findings.every((finding) => finding.severity !== "error");
  return Object.freeze({
    metrics: predicted.metrics,
    technical,
    requiresPostRenderMeasurement: true,
    eligibleByPrediction,
  });
}

function planFingerprint(plan: Omit<MasteringPlan, "fingerprint">): string {
  return stableHash(plan);
}

function proposalFingerprint(
  proposal: Omit<TransparentMasteringProposal, "fingerprint">,
): string {
  return stableHash(proposal);
}

function assertScope(
  input: Pick<
    CreateMasteringPlanInput,
    | "projectId"
    | "chapterId"
    | "chapterMaster"
    | "engineeringArtifact"
    | "engineeringEvidence"
  >,
): void {
  const { chapterMaster, engineeringArtifact, engineeringEvidence } = input;
  assertVerified(chapterMaster, "MASTERING_PLAN_MASTER_NOT_VERIFIED");
  assertVerified(engineeringArtifact, "MASTERING_PLAN_ENGINEERING_NOT_VERIFIED");
  assertAudioEngineeringEvidence(engineeringEvidence);
  if (chapterMaster.kind !== "chapter-master") {
    throw new MasteringPlanError("MASTERING_PLAN_CHAPTER_MASTER_REQUIRED");
  }
  if (chapterMaster.review.status !== "approved") {
    throw new MasteringPlanError("MASTERING_PLAN_CHAPTER_APPROVAL_REQUIRED");
  }
  if (engineeringArtifact.kind !== "audio-analysis") {
    throw new MasteringPlanError("MASTERING_PLAN_ENGINEERING_ARTIFACT_REQUIRED");
  }
  if (
    chapterMaster.projectId !== input.projectId
    || chapterMaster.segmentId !== input.chapterId
    || engineeringArtifact.projectId !== input.projectId
    || engineeringArtifact.segmentId !== input.chapterId
    || engineeringArtifact.jobId !== chapterMaster.jobId
    || engineeringArtifact.takeId !== chapterMaster.takeId
  ) {
    throw new MasteringPlanError("MASTERING_PLAN_SCOPE_MISMATCH");
  }
  if (!engineeringArtifact.provenance.parentArtifactIds.includes(chapterMaster.id)) {
    throw new MasteringPlanError("MASTERING_PLAN_ENGINEERING_PARENT_MISMATCH");
  }
  if (
    engineeringEvidence.inputContentHash !== chapterMaster.integrity.contentHash
    || engineeringEvidence.inputByteCount !== chapterMaster.integrity.byteCount
    || engineeringArtifact.provenance.sourceContentHash !== chapterMaster.integrity.contentHash
  ) {
    throw new MasteringPlanError("MASTERING_PLAN_ENGINEERING_CONTENT_MISMATCH");
  }
  if (
    engineeringArtifact.rights.rightsFingerprint
      !== chapterMaster.rights.rightsFingerprint
  ) {
    throw new MasteringPlanError("MASTERING_PLAN_RIGHTS_SCOPE_MISMATCH");
  }
}

export function createMasteringPlan(
  input: CreateMasteringPlanInput,
): MasteringPlan {
  requireIdentifier(input.id, "MASTERING_PLAN_ID_INVALID");
  requireIdentifier(input.projectId, "MASTERING_PLAN_PROJECT_ID_INVALID");
  requireIdentifier(input.chapterId, "MASTERING_PLAN_CHAPTER_ID_INVALID");
  requireIdentifier(input.createdByActorId, "MASTERING_PLAN_ACTOR_ID_INVALID");
  const rationale = requireRationale(input.rationale);
  const createdAt = input.createdAt ?? new Date();
  if (Number.isNaN(createdAt.getTime())) throw new MasteringPlanError("MASTERING_PLAN_DATE_INVALID");
  assertScope(input);
  assertProfile(input.targetProfile);
  if (Date.parse(input.targetProfile.reviewedAt) > createdAt.getTime()) {
    throw new MasteringPlanError("MASTERING_PLAN_PROFILE_REVIEW_IN_FUTURE");
  }
  assertOperationOrder(input.operations);
  const predicted = prediction(input.engineeringEvidence, input.targetProfile, input.operations);
  const partial: Omit<MasteringPlan, "fingerprint"> = {
    schemaVersion: MASTERING_PLAN_SCHEMA_VERSION,
    id: input.id,
    projectId: input.projectId,
    chapterId: input.chapterId,
    sourceMaster: snapshot(input.chapterMaster),
    sourceEngineering: Object.freeze({
      artifact: snapshot(input.engineeringArtifact),
      evidenceFingerprint: input.engineeringEvidence.fingerprint,
      profileFingerprint: input.engineeringEvidence.profile.fingerprint,
    }),
    targetProfile: input.targetProfile,
    operations: Object.freeze(input.operations.map((operation) => Object.freeze({ ...operation }))),
    prediction: predicted,
    rationale,
    createdByActorId: input.createdByActorId,
    createdAt: createdAt.toISOString(),
  };
  const plan = Object.freeze({
    ...partial,
    fingerprint: planFingerprint(partial),
  });
  assertMasteringPlan(plan);
  return plan;
}

export function proposeTransparentGainMastering(input: Readonly<{
  evidence: AudioEngineeringEvidence;
  targetProfile: AudioEngineeringProfileSnapshot;
}>): TransparentMasteringProposal {
  assertAudioEngineeringEvidence(input.evidence);
  assertProfile(input.targetProfile);
  const current = input.evidence.metrics;
  const profile = input.targetProfile.profile;
  const lower = profile.rmsDbMin - current.rmsDb;
  const rmsUpper = profile.rmsDbMax - current.rmsDb;
  const peakUpper = profile.peakDbMax - current.peakDb;
  const truePeakUpper = profile.truePeakDbMax === undefined
    ? Number.POSITIVE_INFINITY
    : profile.truePeakDbMax - (current.truePeakDb ?? current.peakDb);
  const noiseUpper = profile.noiseFloorDbMax - current.noiseFloorDb;
  const upper = Math.min(rmsUpper, peakUpper, truePeakUpper, noiseUpper, 12);
  const minimum = Math.max(lower, -12);
  const findings: Finding[] = [];
  if (current.clippedSampleCount > 0) {
    findings.push({
      code: "MASTERING_SOURCE_CLIPPING_REQUIRES_REPAIR",
      severity: "error",
      message: "Transparent gain cannot repair clipped source samples.",
    });
  }
  if (current.sampleRateHz < profile.minimumSampleRateHz) {
    findings.push({
      code: "MASTERING_SAMPLE_RATE_CONVERSION_REQUIRED",
      severity: "error",
      message: "The source sample rate is below the target profile and requires a separate conversion plan.",
    });
  }
  if (current.channels !== profile.channels) {
    findings.push({
      code: "MASTERING_CHANNEL_CONVERSION_REQUIRED",
      severity: "error",
      message: "The source channel layout differs from the target profile and requires a separate conversion plan.",
    });
  }
  if (minimum > upper + EPSILON) {
    findings.push({
      code: "MASTERING_TRANSPARENT_GAIN_WINDOW_EMPTY",
      severity: "error",
      message: "No bounded transparent gain can satisfy RMS, peak, true-peak and noise-floor limits together.",
    });
  }

  let gainDb = 0;
  if (findings.every((finding) => finding.severity !== "error")) {
    const targetRms = (profile.rmsDbMin + profile.rmsDbMax) / 2;
    gainDb = Math.min(upper, Math.max(minimum, targetRms - current.rmsDb));
    if (Math.abs(gainDb) < 0.005) gainDb = 0;
  }
  const operations: readonly MasteringOperation[] = gainDb === 0
    ? Object.freeze([])
    : Object.freeze([Object.freeze({
        kind: "gain" as const,
        gainDb: Number(gainDb.toFixed(4)),
        rationaleCode: "MASTERING_TRANSPARENT_GAIN",
      })]);
  const predicted = applyPrediction(current, operations).metrics;
  const technical = assessTechnicalAudio(predicted, profile);
  findings.push(...technical.findings.filter((finding) => finding.severity === "error"));
  const possible = findings.every((finding) => finding.severity !== "error");
  const partial: Omit<TransparentMasteringProposal, "fingerprint"> = {
    possible,
    operations,
    predictedMetrics: predicted,
    findings: Object.freeze(findings),
  };
  return Object.freeze({
    ...partial,
    fingerprint: proposalFingerprint(partial),
  });
}

export function assertMasteringPlan(plan: MasteringPlan): void {
  if (plan.schemaVersion !== MASTERING_PLAN_SCHEMA_VERSION) {
    throw new MasteringPlanError("MASTERING_PLAN_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(plan.id, "MASTERING_PLAN_ID_INVALID");
  requireIdentifier(plan.projectId, "MASTERING_PLAN_PROJECT_ID_INVALID");
  requireIdentifier(plan.chapterId, "MASTERING_PLAN_CHAPTER_ID_INVALID");
  requireIdentifier(plan.createdByActorId, "MASTERING_PLAN_ACTOR_ID_INVALID");
  assertSnapshot(plan.sourceMaster);
  assertSnapshot(plan.sourceEngineering.artifact);
  requireHash(plan.sourceEngineering.evidenceFingerprint, "MASTERING_PLAN_EVIDENCE_HASH_INVALID");
  requireHash(plan.sourceEngineering.profileFingerprint, "MASTERING_PLAN_SOURCE_PROFILE_HASH_INVALID");
  assertProfile(plan.targetProfile);
  assertOperationOrder(plan.operations);
  requireRationale(plan.rationale);
  if (Number.isNaN(Date.parse(plan.createdAt))) throw new MasteringPlanError("MASTERING_PLAN_DATE_INVALID");
  const predicted = applyPrediction(plan.prediction.metrics, []);
  if (predicted.metrics.rmsDb !== plan.prediction.metrics.rmsDb) {
    throw new MasteringPlanError("MASTERING_PLAN_PREDICTION_INVALID");
  }
  if (plan.prediction.requiresPostRenderMeasurement !== true) {
    throw new MasteringPlanError("MASTERING_PLAN_POST_RENDER_MEASUREMENT_REQUIRED");
  }
  const assessment = assessTechnicalAudio(plan.prediction.metrics, plan.targetProfile.profile);
  if (stableHash(assessment) !== stableHash(plan.prediction.technical)) {
    throw new MasteringPlanError("MASTERING_PLAN_ASSESSMENT_MISMATCH");
  }
  const expectedEligible = assessment.findings.every((finding) => finding.severity !== "error");
  if (expectedEligible !== plan.prediction.eligibleByPrediction) {
    throw new MasteringPlanError("MASTERING_PLAN_ELIGIBILITY_MISMATCH");
  }
  const { fingerprint, ...partial } = plan;
  if (planFingerprint(partial) !== fingerprint) {
    throw new MasteringPlanError("MASTERING_PLAN_FINGERPRINT_MISMATCH");
  }
}

export function masteringPlanPublicView(
  plan: MasteringPlan,
): MasteringPlanPublicView {
  assertMasteringPlan(plan);
  return Object.freeze({
    id: plan.id,
    chapterId: plan.chapterId,
    targetProfileId: plan.targetProfile.profile.id,
    targetProfileVersion: plan.targetProfile.externalVersion,
    operationKinds: Object.freeze(plan.operations.map((operation) => operation.kind)),
    predictedMetrics: plan.prediction.metrics,
    predictedEligible: plan.prediction.eligibleByPrediction,
    requiresPostRenderMeasurement: plan.prediction.requiresPostRenderMeasurement,
    findingCodes: Object.freeze(plan.prediction.technical.findings.map((finding) => finding.code)),
    createdAt: plan.createdAt,
    fingerprint: plan.fingerprint,
  });
}
