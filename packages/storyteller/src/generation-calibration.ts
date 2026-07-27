import type { FileCalibrationSessionStore } from "./calibration-store.js";
import {
  CalibrationAdmissionError,
  assertProductionCalibrationLock,
  calibrationExecutionFindingCodes,
  productionCalibrationLockPublicView,
  validatePersistedProductionCalibrationLock,
  validateProductionCalibrationScope,
  type ProductionCalibrationLock,
} from "./calibration-admission.js";
import {
  FileGenerationMaterialStore,
  type GenerationMaterialPublicView,
} from "./generation-material.js";
import type { GenerationQueueClaim } from "./generation-queue.js";
import {
  stableHash,
  type GenerationJob,
} from "./index.js";
import {
  ProviderAdapterRegistry,
  type NarrationProviderAdapter,
  type ProviderCapabilitySnapshot,
  type ProviderExecutionContext,
  type SynthesisRequest,
  type SynthesisResult,
} from "./provider-adapter.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";
import type { GenerationWorkerMaterial } from "./generation-worker.js";

export const GENERATION_CALIBRATION_BINDING_SCHEMA_VERSION =
  "storyteller-generation-calibration-binding-v1" as const;
export const GENERATION_CALIBRATION_BINDING_ENTITY_TYPE = "generation-job" as const;

export interface GenerationCalibrationBindingRecord {
  schemaVersion: typeof GENERATION_CALIBRATION_BINDING_SCHEMA_VERSION;
  id: string;
  jobId: string;
  projectId: string;
  segmentId: string;
  jobCacheKey: string;
  candidateCount: number;
  providerRouteFingerprint: string;
  calibrationLock: ProductionCalibrationLock;
  createdAt: string;
  fingerprint: string;
}

export interface GenerationCalibrationBindingPublicView {
  jobId: string;
  projectId: string;
  segmentId: string;
  candidateCount: number;
  locked: true;
  sessionRevision: number;
  voiceRevision: number;
  selectedTakeCount: number;
  approvedAt: string;
  lockFingerprint: string;
  recordFingerprint: string;
}

export class GenerationCalibrationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationCalibrationConflictError";
  }
}

export class GenerationCalibrationIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationCalibrationIntegrityError";
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new GenerationCalibrationIntegrityError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new GenerationCalibrationIntegrityError(code);
  }
  return value;
}

function bindingEntityId(jobId: string): string {
  requireIdentifier(jobId, "GENERATION_CALIBRATION_JOB_ID_INVALID");
  return `calibration_binding_${stableHash(jobId).slice(0, 32)}`;
}

function routeFingerprint(job: GenerationJob): string {
  return stableHash([...job.providerFallbackIds]);
}

function bindingBase(input: Readonly<{
  job: GenerationJob;
  lock: ProductionCalibrationLock;
}>): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: GENERATION_CALIBRATION_BINDING_SCHEMA_VERSION,
    jobId: input.job.id,
    projectId: input.job.projectId,
    segmentId: input.job.segmentId,
    jobCacheKey: input.job.cacheKey,
    candidateCount: input.job.candidateCount,
    providerRouteFingerprint: routeFingerprint(input.job),
    calibrationLock: input.lock,
  };
}

export function createGenerationCalibrationBindingRecord(
  job: GenerationJob,
  lock: ProductionCalibrationLock,
  now = new Date(),
): GenerationCalibrationBindingRecord {
  if (job.status !== "ready") {
    throw new GenerationCalibrationIntegrityError(
      "GENERATION_CALIBRATION_READY_JOB_REQUIRED",
    );
  }
  if (Number.isNaN(now.getTime())) {
    throw new GenerationCalibrationIntegrityError(
      "GENERATION_CALIBRATION_CREATED_AT_INVALID",
    );
  }
  assertProductionCalibrationLock(lock);
  validateProductionCalibrationScope({
    lock,
    job,
    voiceProfileId: lock.voiceProfileId,
    voiceRevision: lock.voiceRevision,
    mode: "production",
    now,
  });
  const base = bindingBase({ job, lock });
  return Object.freeze({
    schemaVersion: GENERATION_CALIBRATION_BINDING_SCHEMA_VERSION,
    id: bindingEntityId(job.id),
    jobId: job.id,
    projectId: job.projectId,
    segmentId: job.segmentId,
    jobCacheKey: job.cacheKey,
    candidateCount: job.candidateCount,
    providerRouteFingerprint: routeFingerprint(job),
    calibrationLock: lock,
    createdAt: now.toISOString(),
    fingerprint: stableHash(base),
  });
}

export function assertGenerationCalibrationBindingRecord(
  record: GenerationCalibrationBindingRecord,
  expectedEntityId = record.id,
): void {
  if (record.schemaVersion !== GENERATION_CALIBRATION_BINDING_SCHEMA_VERSION) {
    throw new GenerationCalibrationIntegrityError(
      "GENERATION_CALIBRATION_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(record.id, "GENERATION_CALIBRATION_ID_INVALID");
  requireIdentifier(record.jobId, "GENERATION_CALIBRATION_JOB_ID_INVALID");
  requireIdentifier(record.projectId, "GENERATION_CALIBRATION_PROJECT_ID_INVALID");
  requireIdentifier(record.segmentId, "GENERATION_CALIBRATION_SEGMENT_ID_INVALID");
  requireHash(record.jobCacheKey, "GENERATION_CALIBRATION_JOB_CACHE_KEY_INVALID");
  requireHash(
    record.providerRouteFingerprint,
    "GENERATION_CALIBRATION_PROVIDER_ROUTE_FINGERPRINT_INVALID",
  );
  if (!Number.isSafeInteger(record.candidateCount) || record.candidateCount < 1) {
    throw new GenerationCalibrationIntegrityError(
      "GENERATION_CALIBRATION_CANDIDATE_COUNT_INVALID",
    );
  }
  if (!record.createdAt || Number.isNaN(Date.parse(record.createdAt))) {
    throw new GenerationCalibrationIntegrityError(
      "GENERATION_CALIBRATION_CREATED_AT_INVALID",
    );
  }
  assertProductionCalibrationLock(record.calibrationLock);
  if (
    record.id !== expectedEntityId
    || record.id !== bindingEntityId(record.jobId)
  ) {
    throw new GenerationCalibrationIntegrityError(
      "GENERATION_CALIBRATION_ENTITY_SCOPE_INVALID",
    );
  }
  const job: GenerationJob = {
    id: record.jobId,
    projectId: record.projectId,
    segmentId: record.segmentId,
    providerFallbackIds: [record.calibrationLock.providerId],
    cacheKey: record.jobCacheKey,
    candidateCount: record.candidateCount,
    status: "ready",
  };
  if (routeFingerprint(job) !== record.providerRouteFingerprint) {
    throw new GenerationCalibrationIntegrityError(
      "GENERATION_CALIBRATION_PROVIDER_ROUTE_FINGERPRINT_MISMATCH",
    );
  }
  const expected = stableHash(bindingBase({
    job,
    lock: record.calibrationLock,
  }));
  if (
    !HASH_PATTERN.test(record.fingerprint)
    || record.fingerprint !== expected
  ) {
    throw new GenerationCalibrationIntegrityError(
      "GENERATION_CALIBRATION_FINGERPRINT_INVALID",
    );
  }
}

export function generationCalibrationBindingPublicView(
  record: GenerationCalibrationBindingRecord,
): GenerationCalibrationBindingPublicView {
  assertGenerationCalibrationBindingRecord(record);
  const lock = productionCalibrationLockPublicView(record.calibrationLock);
  return Object.freeze({
    jobId: record.jobId,
    projectId: record.projectId,
    segmentId: record.segmentId,
    candidateCount: record.candidateCount,
    ...lock,
    recordFingerprint: record.fingerprint,
  });
}

function asPayload(
  record: GenerationCalibrationBindingRecord,
): Record<string, unknown> {
  return record as unknown as Record<string, unknown>;
}

function typedEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<GenerationCalibrationBindingRecord> {
  const record = envelope.payload as unknown as GenerationCalibrationBindingRecord;
  try {
    assertGenerationCalibrationBindingRecord(record, envelope.entityId);
  } catch (error) {
    throw new GenerationCalibrationIntegrityError(
      `GENERATION_CALIBRATION_RECORD_INVALID:${error instanceof Error ? error.message : "UNKNOWN"}`,
    );
  }
  if (
    envelope.entityType !== GENERATION_CALIBRATION_BINDING_ENTITY_TYPE
    || envelope.revision !== 1
  ) {
    throw new GenerationCalibrationIntegrityError(
      "GENERATION_CALIBRATION_ENVELOPE_SCOPE_INVALID",
    );
  }
  return envelope as unknown as StoredEnvelope<GenerationCalibrationBindingRecord>;
}

export class FileGenerationCalibrationBindingStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    job: GenerationJob,
    lock: ProductionCalibrationLock,
    input: Readonly<{
      actorId: string;
      requestId?: string;
      now?: Date;
    }>,
  ): Promise<StoredEnvelope<GenerationCalibrationBindingRecord>> {
    const now = input.now ?? new Date();
    const record = createGenerationCalibrationBindingRecord(job, lock, now);
    const existing = await this.read(job.id);
    if (existing) return this.#assertIdempotent(existing, record);
    try {
      const created = typedEnvelope(await this.#store.create(
        GENERATION_CALIBRATION_BINDING_ENTITY_TYPE,
        record.id,
        asPayload(record),
        now,
      ));
      await this.#store.appendAuditEvent({
        actorId: input.actorId,
        action: "generation.calibration.bound",
        entityType: GENERATION_CALIBRATION_BINDING_ENTITY_TYPE,
        entityId: created.entityId,
        revision: created.revision,
        ...(input.requestId ? { requestId: input.requestId } : {}),
        metadata: {
          jobId: record.jobId,
          projectId: record.projectId,
          segmentId: record.segmentId,
          candidateCount: record.candidateCount,
          sessionRevision: record.calibrationLock.sessionRevision,
          voiceRevision: record.calibrationLock.voiceRevision,
          lockFingerprint: record.calibrationLock.lockFingerprint,
          recordFingerprint: record.fingerprint,
        },
        occurredAt: now,
      });
      return created;
    } catch (error) {
      if (!(error instanceof StoreConflictError)) throw error;
      const raced = await this.read(job.id);
      if (!raced) throw error;
      return this.#assertIdempotent(raced, record);
    }
  }

  async read(
    jobId: string,
  ): Promise<StoredEnvelope<GenerationCalibrationBindingRecord> | null> {
    const id = bindingEntityId(jobId);
    const envelope = await this.#store.read<Record<string, unknown>>(
      GENERATION_CALIBRATION_BINDING_ENTITY_TYPE,
      id,
    );
    return envelope ? typedEnvelope(envelope) : null;
  }

  async require(
    jobId: string,
  ): Promise<StoredEnvelope<GenerationCalibrationBindingRecord>> {
    const envelope = await this.read(jobId);
    if (!envelope) {
      throw new GenerationCalibrationConflictError(
        "GENERATION_CALIBRATION_BINDING_NOT_FOUND",
      );
    }
    return envelope;
  }

  async resolveForMaterial(input: Readonly<{
    job: GenerationJob;
    material: GenerationWorkerMaterial;
    calibrations: FileCalibrationSessionStore;
    now?: Date;
  }>): Promise<ProductionCalibrationLock> {
    const envelope = await this.require(input.job.id);
    const record = envelope.payload;
    if (
      record.projectId !== input.job.projectId
      || record.segmentId !== input.job.segmentId
      || record.jobCacheKey !== input.job.cacheKey
      || record.candidateCount !== input.job.candidateCount
      || record.providerRouteFingerprint !== routeFingerprint(input.job)
    ) {
      throw new GenerationCalibrationConflictError(
        "GENERATION_CALIBRATION_JOB_SCOPE_MISMATCH",
      );
    }
    validateProductionCalibrationScope({
      lock: record.calibrationLock,
      job: input.job,
      voiceProfileId: input.material.voiceProfileId,
      voiceRevision: input.material.voiceRevision,
      mode: input.material.mode ?? "production",
      now: input.now,
    });
    const session = await input.calibrations.require(
      record.calibrationLock.sessionId,
    );
    validatePersistedProductionCalibrationLock(
      record.calibrationLock,
      session.payload,
    );
    return record.calibrationLock;
  }

  async resolveForRequest(input: Readonly<{
    request: SynthesisRequest;
    calibrations: FileCalibrationSessionStore;
    now?: Date;
  }>): Promise<ProductionCalibrationLock> {
    const jobId = input.request.metadata.jobId;
    if (!jobId) {
      throw new GenerationCalibrationConflictError(
        "GENERATION_CALIBRATION_REQUEST_JOB_ID_REQUIRED",
      );
    }
    const envelope = await this.require(jobId);
    const record = envelope.payload;
    const job: GenerationJob = {
      id: record.jobId,
      projectId: record.projectId,
      segmentId: record.segmentId,
      providerFallbackIds: [record.calibrationLock.providerId],
      cacheKey: record.jobCacheKey,
      candidateCount: record.candidateCount,
      status: "ready",
    };
    if (
      input.request.projectId !== record.projectId
      || input.request.segmentId !== record.segmentId
    ) {
      throw new GenerationCalibrationConflictError(
        "GENERATION_CALIBRATION_REQUEST_SCOPE_MISMATCH",
      );
    }
    validateProductionCalibrationScope({
      lock: record.calibrationLock,
      job,
      voiceProfileId: input.request.voiceProfileId,
      voiceRevision: input.request.voiceRevision,
      mode: input.request.mode,
      now: input.now,
    });
    const session = await input.calibrations.require(
      record.calibrationLock.sessionId,
    );
    validatePersistedProductionCalibrationLock(
      record.calibrationLock,
      session.payload,
    );
    return record.calibrationLock;
  }

  async publicView(jobId: string): Promise<GenerationCalibrationBindingPublicView> {
    return generationCalibrationBindingPublicView(
      (await this.require(jobId)).payload,
    );
  }

  #assertIdempotent(
    existing: StoredEnvelope<GenerationCalibrationBindingRecord>,
    proposed: GenerationCalibrationBindingRecord,
  ): StoredEnvelope<GenerationCalibrationBindingRecord> {
    assertGenerationCalibrationBindingRecord(
      existing.payload,
      existing.entityId,
    );
    if (existing.payload.fingerprint !== proposed.fingerprint) {
      throw new GenerationCalibrationConflictError(
        "GENERATION_CALIBRATION_IDEMPOTENCY_CONFLICT",
      );
    }
    return existing;
  }
}

export class CalibratedGenerationMaterialStore extends FileGenerationMaterialStore {
  readonly #bindings: FileGenerationCalibrationBindingStore;
  readonly #calibrations: FileCalibrationSessionStore;
  readonly #now: () => Date;

  constructor(
    store: FileProjectStore,
    bindings: FileGenerationCalibrationBindingStore,
    calibrations: FileCalibrationSessionStore,
    now: () => Date = () => new Date(),
  ) {
    super(store);
    this.#bindings = bindings;
    this.#calibrations = calibrations;
    this.#now = now;
  }

  override async resolve(
    claim: GenerationQueueClaim,
  ): Promise<GenerationWorkerMaterial> {
    const material = await super.resolve(claim);
    if ((material.mode ?? "production") === "production") {
      await this.#bindings.resolveForMaterial({
        job: claim.item.job,
        material,
        calibrations: this.#calibrations,
        now: this.#now(),
      });
    }
    return material;
  }

  override async publicView(
    jobId: string,
  ): Promise<GenerationMaterialPublicView> {
    return super.publicView(jobId);
  }
}

class CalibrationBoundNarrationProviderAdapter
implements NarrationProviderAdapter {
  readonly providerId: string;
  readonly adapterVersion: string;
  readonly #adapter: NarrationProviderAdapter;
  readonly #bindings: FileGenerationCalibrationBindingStore;
  readonly #calibrations: FileCalibrationSessionStore;
  readonly #now: () => Date;

  constructor(
    adapter: NarrationProviderAdapter,
    bindings: FileGenerationCalibrationBindingStore,
    calibrations: FileCalibrationSessionStore,
    now: () => Date,
  ) {
    this.providerId = adapter.providerId;
    this.adapterVersion = adapter.adapterVersion;
    this.#adapter = adapter;
    this.#bindings = bindings;
    this.#calibrations = calibrations;
    this.#now = now;
  }

  inspectCapabilities(
    context: Omit<ProviderExecutionContext, "timeoutMs">,
  ): Promise<ProviderCapabilitySnapshot> {
    return this.#adapter.inspectCapabilities(context);
  }

  async synthesise(
    request: SynthesisRequest,
    context: ProviderExecutionContext,
  ): Promise<SynthesisResult> {
    if (request.mode !== "production") {
      return this.#adapter.synthesise(request, context);
    }
    const lock = await this.#bindings.resolveForRequest({
      request,
      calibrations: this.#calibrations,
      now: this.#now(),
    });
    if (lock.providerId !== this.providerId) {
      throw new CalibrationAdmissionError(
        "GENERATION_CALIBRATION_PROVIDER_MISMATCH",
      );
    }
    const result = await this.#adapter.synthesise(request, context);
    const codes = calibrationExecutionFindingCodes(lock, {
      jobId: request.metadata.jobId ?? "generation_calibration_unknown",
      status: "completed",
      attempts: [],
      results: [result],
      findings: [],
    });
    if (codes.length > 0) {
      throw new CalibrationAdmissionError(codes[0]!);
    }
    return result;
  }
}

export function createCalibrationBoundProviderRegistry(input: Readonly<{
  providers: ProviderAdapterRegistry;
  bindings: FileGenerationCalibrationBindingStore;
  calibrations: FileCalibrationSessionStore;
  now?: () => Date;
}>): ProviderAdapterRegistry {
  const now = input.now ?? (() => new Date());
  const adapters: NarrationProviderAdapter[] = [];
  for (const providerId of input.providers.ids()) {
    const adapter = input.providers.get(providerId);
    if (!adapter) {
      throw new GenerationCalibrationIntegrityError(
        "GENERATION_CALIBRATION_PROVIDER_LOOKUP_FAILED",
      );
    }
    adapters.push(new CalibrationBoundNarrationProviderAdapter(
      adapter,
      input.bindings,
      input.calibrations,
      now,
    ));
  }
  return new ProviderAdapterRegistry(adapters);
}
