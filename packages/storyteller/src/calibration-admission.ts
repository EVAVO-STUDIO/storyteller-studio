import {
  assertCalibrationSession,
  type CalibrationSession,
} from "./calibration-workflow.js";
import { stableHash, type GenerationJob } from "./index.js";
import type {
  GenerationExecutionReport,
  ProviderExecutionMode,
} from "./provider-adapter.js";

export const PRODUCTION_CALIBRATION_LOCK_SCHEMA_VERSION =
  "storyteller-production-calibration-lock-v1" as const;

export interface ProductionCalibrationLock {
  schemaVersion: typeof PRODUCTION_CALIBRATION_LOCK_SCHEMA_VERSION;
  sessionId: string;
  sessionRevision: number;
  sessionFingerprint: string;
  approvalFingerprint: string;
  assessmentFingerprint: string;
  projectId: string;
  seriesId?: string;
  voiceProfileId: string;
  voiceRevision: number;
  providerId: string;
  modelId: string;
  capabilityFingerprint: string;
  selectedTakeCount: number;
  selectedTakeSetFingerprint: string;
  approvedAt: string;
  lockFingerprint: string;
}

export class CalibrationAdmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationAdmissionError";
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new CalibrationAdmissionError(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new CalibrationAdmissionError(code);
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new CalibrationAdmissionError(code);
  }
  return value;
}

function lockBase(
  lock: Omit<ProductionCalibrationLock, "lockFingerprint">,
): Readonly<Record<string, unknown>> {
  return {
    ...lock,
    seriesId: lock.seriesId ?? null,
  };
}

export function assertProductionCalibrationLock(
  lock: ProductionCalibrationLock,
): void {
  if (lock.schemaVersion !== PRODUCTION_CALIBRATION_LOCK_SCHEMA_VERSION) {
    throw new CalibrationAdmissionError("CALIBRATION_LOCK_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(lock.sessionId, "CALIBRATION_LOCK_SESSION_ID_INVALID");
  if (!Number.isSafeInteger(lock.sessionRevision) || lock.sessionRevision < 1) {
    throw new CalibrationAdmissionError("CALIBRATION_LOCK_SESSION_REVISION_INVALID");
  }
  requireHash(lock.sessionFingerprint, "CALIBRATION_LOCK_SESSION_FINGERPRINT_INVALID");
  requireHash(lock.approvalFingerprint, "CALIBRATION_LOCK_APPROVAL_FINGERPRINT_INVALID");
  requireHash(lock.assessmentFingerprint, "CALIBRATION_LOCK_ASSESSMENT_FINGERPRINT_INVALID");
  requireIdentifier(lock.projectId, "CALIBRATION_LOCK_PROJECT_ID_INVALID");
  if (lock.seriesId !== undefined) {
    requireIdentifier(lock.seriesId, "CALIBRATION_LOCK_SERIES_ID_INVALID");
  }
  requireIdentifier(lock.voiceProfileId, "CALIBRATION_LOCK_VOICE_PROFILE_ID_INVALID");
  if (!Number.isSafeInteger(lock.voiceRevision) || lock.voiceRevision < 1) {
    throw new CalibrationAdmissionError("CALIBRATION_LOCK_VOICE_REVISION_INVALID");
  }
  requireIdentifier(lock.providerId, "CALIBRATION_LOCK_PROVIDER_ID_INVALID");
  requireIdentifier(lock.modelId, "CALIBRATION_LOCK_MODEL_ID_INVALID");
  requireHash(lock.capabilityFingerprint, "CALIBRATION_LOCK_CAPABILITY_FINGERPRINT_INVALID");
  if (!Number.isSafeInteger(lock.selectedTakeCount) || lock.selectedTakeCount < 1) {
    throw new CalibrationAdmissionError("CALIBRATION_LOCK_SELECTED_TAKE_COUNT_INVALID");
  }
  requireHash(
    lock.selectedTakeSetFingerprint,
    "CALIBRATION_LOCK_SELECTED_TAKE_SET_FINGERPRINT_INVALID",
  );
  requireDate(lock.approvedAt, "CALIBRATION_LOCK_APPROVED_AT_INVALID");
  const { lockFingerprint: _fingerprint, ...base } = lock;
  if (
    !HASH_PATTERN.test(lock.lockFingerprint)
    || lock.lockFingerprint !== stableHash(lockBase(base))
  ) {
    throw new CalibrationAdmissionError("CALIBRATION_LOCK_FINGERPRINT_INVALID");
  }
}

export function createProductionCalibrationLock(
  session: CalibrationSession,
): ProductionCalibrationLock {
  assertCalibrationSession(session);
  if (session.status !== "approved" || !session.approval) {
    throw new CalibrationAdmissionError("CALIBRATION_LOCK_APPROVED_SESSION_REQUIRED");
  }
  const selectedTakeArtifactIds = [...session.approval.selectedTakeArtifactIds]
    .sort((left, right) => left.localeCompare(right, "en-AU"));
  if (selectedTakeArtifactIds.length === 0) {
    throw new CalibrationAdmissionError("CALIBRATION_LOCK_SELECTED_TAKES_REQUIRED");
  }
  const base: Omit<ProductionCalibrationLock, "lockFingerprint"> = {
    schemaVersion: PRODUCTION_CALIBRATION_LOCK_SCHEMA_VERSION,
    sessionId: session.id,
    sessionRevision: session.revision,
    sessionFingerprint: session.fingerprint,
    approvalFingerprint: session.approval.fingerprint,
    assessmentFingerprint: session.approval.assessmentFingerprint,
    projectId: session.projectId,
    ...(session.seriesId ? { seriesId: session.seriesId } : {}),
    voiceProfileId: session.voiceProfileId,
    voiceRevision: session.voiceRevision,
    providerId: session.approval.providerId,
    modelId: session.approval.modelId,
    capabilityFingerprint: session.approval.capabilityFingerprint,
    selectedTakeCount: selectedTakeArtifactIds.length,
    selectedTakeSetFingerprint: stableHash(selectedTakeArtifactIds),
    approvedAt: session.approval.approvedAt,
  };
  const lock = Object.freeze({
    ...base,
    lockFingerprint: stableHash(lockBase(base)),
  });
  assertProductionCalibrationLock(lock);
  return lock;
}

export function validateProductionCalibrationScope(input: Readonly<{
  lock: ProductionCalibrationLock;
  job: GenerationJob;
  voiceProfileId: string;
  voiceRevision: number;
  mode: ProviderExecutionMode;
  now?: Date;
}>): void {
  assertProductionCalibrationLock(input.lock);
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new CalibrationAdmissionError("CALIBRATION_LOCK_VALIDATION_TIME_INVALID");
  }
  if (input.mode !== "production") {
    throw new CalibrationAdmissionError("CALIBRATION_LOCK_PRODUCTION_MODE_REQUIRED");
  }
  if (input.lock.projectId !== input.job.projectId) {
    throw new CalibrationAdmissionError("CALIBRATION_LOCK_PROJECT_SCOPE_MISMATCH");
  }
  if (
    input.lock.voiceProfileId !== input.voiceProfileId
    || input.lock.voiceRevision !== input.voiceRevision
  ) {
    throw new CalibrationAdmissionError("CALIBRATION_LOCK_VOICE_SCOPE_MISMATCH");
  }
  if (Date.parse(input.lock.approvedAt) > now.getTime()) {
    throw new CalibrationAdmissionError("CALIBRATION_LOCK_APPROVAL_NOT_EFFECTIVE");
  }
  if (
    input.job.providerFallbackIds.length !== 1
    || input.job.providerFallbackIds[0] !== input.lock.providerId
  ) {
    throw new CalibrationAdmissionError("CALIBRATION_LOCK_PROVIDER_ROUTE_MISMATCH");
  }
}

export function validatePersistedProductionCalibrationLock(
  lock: ProductionCalibrationLock,
  session: CalibrationSession,
): void {
  assertProductionCalibrationLock(lock);
  assertCalibrationSession(session);
  if (session.status !== "approved" || !session.approval) {
    throw new CalibrationAdmissionError("CALIBRATION_LOCK_PERSISTED_APPROVAL_REQUIRED");
  }
  const expected = createProductionCalibrationLock(session);
  if (expected.lockFingerprint !== lock.lockFingerprint) {
    throw new CalibrationAdmissionError("CALIBRATION_LOCK_PERSISTED_SESSION_MISMATCH");
  }
}

export function calibrationExecutionFindingCodes(
  lock: ProductionCalibrationLock,
  report: GenerationExecutionReport,
): readonly string[] {
  assertProductionCalibrationLock(lock);
  const codes = new Set<string>();
  if (report.status === "completed" && report.results.length === 0) {
    codes.add("GENERATION_CALIBRATION_RESULT_REQUIRED");
  }
  for (const result of report.results) {
    if (result.providerId !== lock.providerId) {
      codes.add("GENERATION_CALIBRATION_PROVIDER_MISMATCH");
    }
    if (result.capabilityFingerprint !== lock.capabilityFingerprint) {
      codes.add("GENERATION_CALIBRATION_CAPABILITY_MISMATCH");
    }
    if (result.provenance.modelId !== lock.modelId) {
      codes.add("GENERATION_CALIBRATION_MODEL_MISMATCH");
    }
  }
  return Object.freeze([...codes].sort());
}

export function productionCalibrationLockPublicView(
  lock: ProductionCalibrationLock,
): Readonly<{
  locked: true;
  sessionRevision: number;
  voiceRevision: number;
  selectedTakeCount: number;
  approvedAt: string;
  lockFingerprint: string;
}> {
  assertProductionCalibrationLock(lock);
  return Object.freeze({
    locked: true,
    sessionRevision: lock.sessionRevision,
    voiceRevision: lock.voiceRevision,
    selectedTakeCount: lock.selectedTakeCount,
    approvedAt: lock.approvedAt,
    lockFingerprint: lock.lockFingerprint,
  });
}
