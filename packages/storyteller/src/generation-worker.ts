import { createHash } from "node:crypto";
import {
  ingestAudioEngineeringArtifact,
  type AudioEngineeringArtifactResult,
} from "./audio-engineering-artifact.js";
import type { GenerationAudioEngineeringPolicy } from "./generation-audio-engineering.js";
import {
  completeGenerationWithArtifacts,
  ArtifactAdmissionError,
  type ArtifactBackedCompletionResult,
} from "./artifact-queue.js";
import {
  ingestPrivateArtifact,
  type ArtifactIngestResult,
} from "./artifact-ingest.js";
import type {
  ArtifactRecord,
  ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import type { FileArtifactRegistry } from "./artifact-store.js";
import type {
  FileGenerationQueue,
  GenerationQueueClaim,
} from "./generation-queue.js";
import type {
  GenerationQueueItem,
  GenerationQueueStatus,
} from "./generation-queue-contracts.js";
import {
  stableHash,
  type PerformanceDirection,
  type ProjectUse,
} from "./index.js";
import {
  assertNaturalNarrationWorkerInput,
  type NaturalNarrationProductionPlan,
} from "./narration-production-policy.js";
import type { FilePrivateObjectStore } from "./private-object-store.js";
import {
  buildSynthesisRequest,
  executeGenerationJob,
  type CanonicalPronunciation,
  type CredentialResolver,
  type GenerationExecutionReport,
  type ProviderAdapterRegistry,
  type ProviderAudioFormat,
  type ProviderExecutionMode,
  type SynthesisRequest,
  type SynthesisResult,
} from "./provider-adapter.js";
import type { StoredEnvelope } from "./project-store.js";

export interface GenerationWorkerMaterial {
  text: string;
  immutableSourceHash: string;
  voiceProfileId: string;
  voiceRevision: number;
  voiceProfileHash?: string;
  direction: PerformanceDirection;
  pronunciations?: readonly CanonicalPronunciation[];
  mode?: ProviderExecutionMode;
  format?: ProviderAudioFormat;
  sampleRateHz?: number;
  rights: ArtifactRightsSnapshot;
  intendedUse?: ProjectUse;
  commercial?: boolean;
  parentArtifactIds?: readonly string[];
  naturalNarration?: NaturalNarrationProductionPlan;
  costPolicy?: Readonly<{
    currency: string;
    maximumTotalEstimatedCost: number;
  }>;
}

export interface GenerationWorkerCostAccounting {
  attemptedProviderCount: number;
  successfulResultCount: number;
  totalEstimatedCost?: number;
  currency?: string;
  blockedCode?: string;
}

export type GenerationWorkerQueueTransition =
  | Readonly<{
      kind: "block" | "retry";
      codes: readonly string[];
      accounting: GenerationWorkerCostAccounting;
      at: string;
    }>
  | Readonly<{
      kind: "complete";
      codes: readonly [];
      accounting: GenerationWorkerCostAccounting;
      artifactIds: readonly string[];
      candidateTakeIds: readonly string[];
      admissionFingerprint: string;
      at: string;
    }>;

export interface ClaimedGenerationWorkerInput {
  queue: FileGenerationQueue;
  claim: GenerationQueueClaim;
  providers: ProviderAdapterRegistry;
  credentials: CredentialResolver;
  objectStore: FilePrivateObjectStore;
  artifactRegistry: FileArtifactRegistry;
  audioEngineering?: GenerationAudioEngineeringPolicy;
  material: GenerationWorkerMaterial;
  workerActorId: string;
  verifierActorId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  beforeTerminalTransition?: (transition: GenerationWorkerQueueTransition) => Promise<void>;
  clock?: () => Date;
  now?: Date;
}

export interface GenerationWorkerResult {
  queueEnvelope: StoredEnvelope<GenerationQueueItem>;
  executionStatus: GenerationExecutionReport["status"];
  artifactIds: readonly string[];
  candidateArtifactIds: readonly string[];
  reportArtifactId?: string;
  executionReportHash?: string;
  completion?: ArtifactBackedCompletionResult;
}

export interface GenerationWorkerPublicView {
  queueItemId: string;
  jobId: string;
  status: GenerationQueueStatus;
  executionStatus: GenerationExecutionReport["status"];
  artifactCount: number;
  candidateCount: number;
  reportArtifactId?: string;
  executionReportHash?: string;
  revision: number;
}

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const CURRENCY_PATTERN = /^[A-Z]{3}$/u;

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireWorkerInput(input: ClaimedGenerationWorkerInput): void {
  const lease = input.claim.item.lease;
  if (
    input.claim.item.status !== "leased"
    || !lease
    || lease.workerId !== input.workerActorId
  ) {
    throw new Error("GENERATION_WORKER_CLAIM_ACTOR_MISMATCH");
  }
  if (!input.material.text.trim()) throw new Error("GENERATION_WORKER_TEXT_REQUIRED");
  if (!HASH_PATTERN.test(input.material.immutableSourceHash)) {
    throw new Error("GENERATION_WORKER_SOURCE_HASH_INVALID");
  }
  if (input.material.direction.segmentId !== input.claim.item.segmentId) {
    throw new Error("GENERATION_WORKER_DIRECTION_SCOPE_MISMATCH");
  }
  if (!Number.isSafeInteger(input.material.voiceRevision) || input.material.voiceRevision < 1) {
    throw new Error("GENERATION_WORKER_VOICE_REVISION_INVALID");
  }
  if (input.material.voiceProfileHash !== undefined && !HASH_PATTERN.test(input.material.voiceProfileHash)) {
    throw new Error("GENERATION_WORKER_VOICE_PROFILE_HASH_INVALID");
  }
  if (input.material.format === "pcm") {
    throw new Error("GENERATION_WORKER_UNSUPPORTED_STORAGE_FORMAT");
  }
  assertNaturalNarrationWorkerInput(input.claim.item.job, input.material);
  if (input.material.costPolicy) {
    if (!CURRENCY_PATTERN.test(input.material.costPolicy.currency)) {
      throw new Error("GENERATION_WORKER_COST_POLICY_CURRENCY_INVALID");
    }
    if (
      !Number.isFinite(input.material.costPolicy.maximumTotalEstimatedCost)
      || input.material.costPolicy.maximumTotalEstimatedCost < 0
    ) {
      throw new Error("GENERATION_WORKER_COST_POLICY_LIMIT_INVALID");
    }
  }
}

function throwIfWorkerAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new Error("GENERATION_WORKER_ABORTED");
}

function buildRequests(
  claim: GenerationQueueClaim,
  material: GenerationWorkerMaterial,
): readonly SynthesisRequest[] {
  return Object.freeze(Array.from(
    { length: claim.item.job.candidateCount },
    (_, candidateIndex) => buildSynthesisRequest({
      job: claim.item.job,
      text: material.text,
      immutableSourceHash: material.immutableSourceHash,
      voiceProfileId: material.voiceProfileId,
      voiceRevision: material.voiceRevision,
      ...(material.voiceProfileHash !== undefined ? { voiceProfileHash: material.voiceProfileHash } : {}),
      direction: material.direction,
      pronunciations: material.pronunciations ?? [],
      mode: material.mode ?? "production",
      format: material.format ?? "wav",
      sampleRateHz: material.sampleRateHz ?? 48_000,
      candidateIndex,
      ...(material.naturalNarration
        ? { naturalNarration: material.naturalNarration }
        : {}),
    }),
  ));
}

function safeReportEvidence(
  report: GenerationExecutionReport,
  artifactIds: readonly string[],
): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: "storyteller-generation-execution-evidence-v1",
    jobId: report.jobId,
    status: report.status,
    attempts: report.attempts.map((attempt) => ({
      providerId: attempt.providerId,
      candidateIndex: attempt.candidateIndex,
      status: attempt.status,
      findingCodes: attempt.findings.map((finding) => finding.code),
      ...(attempt.result
        ? {
            result: {
              requestId: attempt.result.requestId,
              idempotencyKey: attempt.result.idempotencyKey,
              providerRequestIdHash: attempt.result.providerRequestId
                ? stableHash(attempt.result.providerRequestId)
                : null,
              audioContentHash: hashBytes(attempt.result.audio),
              contentType: attempt.result.contentType,
              capabilityFingerprint: attempt.result.capabilityFingerprint,
              generatedAt: attempt.result.generatedAt,
              usage: attempt.result.usage,
              provenanceFingerprint: stableHash(attempt.result.provenance),
            },
          }
        : {}),
    })),
    results: report.results.map((result) => ({
      providerId: result.providerId,
      adapterVersion: result.adapterVersion,
      requestId: result.requestId,
      idempotencyKey: result.idempotencyKey,
      audioContentHash: hashBytes(result.audio),
      contentType: result.contentType,
      capabilityFingerprint: result.capabilityFingerprint,
      generatedAt: result.generatedAt,
      usage: result.usage,
    })),
    findingCodes: report.findings.map((finding) => finding.code),
    artifactIds: [...artifactIds].sort((left, right) => left.localeCompare(right, "en-AU")),
  };
}

function executionAccounting(
  report: GenerationExecutionReport,
  policy: GenerationWorkerMaterial["costPolicy"],
): GenerationWorkerCostAccounting {
  let total = 0;
  let currency: string | undefined;
  let observedCosts = 0;
  const attemptedProviderCount = report.attempts.filter(
    (attempt) => attempt.status !== "skipped",
  ).length;
  const successfulResultCount = report.results.length;
  const resultBase = { attemptedProviderCount, successfulResultCount };

  for (const result of report.results) {
    const cost = result.usage.estimatedCost;
    const resultCurrency = result.usage.currency;
    if (cost === undefined) continue;
    if (!Number.isFinite(cost) || cost < 0 || !resultCurrency || !CURRENCY_PATTERN.test(resultCurrency)) {
      return { ...resultBase, blockedCode: "GENERATION_COST_EVIDENCE_INVALID" };
    }
    if (currency && currency !== resultCurrency) {
      return {
        ...resultBase,
        totalEstimatedCost: Number(total.toFixed(6)),
        currency,
        blockedCode: "GENERATION_COST_CURRENCY_MISMATCH",
      };
    }
    currency = resultCurrency;
    total += cost;
    observedCosts += 1;
  }

  const observed = observedCosts > 0
    ? { totalEstimatedCost: Number(total.toFixed(6)), currency }
    : {};
  if (policy) {
    if (report.results.length > 0 && observedCosts !== report.results.length) {
      return { ...resultBase, ...observed, blockedCode: "GENERATION_COST_EVIDENCE_MISSING" };
    }
    if (observedCosts > 0 && currency !== policy.currency) {
      return { ...resultBase, ...observed, blockedCode: "GENERATION_COST_POLICY_CURRENCY_MISMATCH" };
    }
    if (total > policy.maximumTotalEstimatedCost) {
      return { ...resultBase, ...observed, blockedCode: "GENERATION_COST_POLICY_EXCEEDED" };
    }
  }
  return { ...resultBase, ...observed };
}

function resultIdentity(
  jobId: string,
  request: SynthesisRequest,
  result: SynthesisResult,
): Readonly<{ artifactId: string; takeId: string; contentHash: string }> {
  const contentHash = hashBytes(result.audio);
  const fingerprint = stableHash({
    jobId,
    candidateIndex: request.candidateIndex,
    requestId: request.requestId,
    idempotencyKey: request.idempotencyKey,
    providerId: result.providerId,
    adapterVersion: result.adapterVersion,
    contentHash,
  });
  return {
    artifactId: `artifact_${fingerprint.slice(0, 24)}`,
    takeId: `take_${fingerprint.slice(0, 24)}`,
    contentHash,
  };
}

async function ingestResultArtifacts(input: Readonly<{
  worker: ClaimedGenerationWorkerInput;
  request: SynthesisRequest;
  result: SynthesisResult;
  now: Date;
}>): Promise<Readonly<{
  ingested: readonly ArtifactIngestResult[];
  engineering?: AudioEngineeringArtifactResult;
}>> {
  const { worker, request, result, now } = input;
  const identity = resultIdentity(worker.claim.item.jobId, request, result);
  const verifierActorId = worker.verifierActorId ?? worker.workerActorId;
  const commonProvenance = {
    createdByActorId: worker.workerActorId,
    sourceContentHash: worker.material.immutableSourceHash,
    generationRequestHash: request.idempotencyKey,
    providerId: result.providerId,
    adapterVersion: result.adapterVersion,
    ...(request.voiceProfileHash ? { voiceProfileHash: request.voiceProfileHash } : {}),
    ...(result.providerRequestId ? { providerRequestId: result.providerRequestId } : {}),
  };

  const audio = await ingestPrivateArtifact(
    worker.objectStore,
    worker.artifactRegistry,
    {
      id: identity.artifactId,
      kind: "audio-candidate",
      projectId: worker.claim.item.projectId,
      jobId: worker.claim.item.jobId,
      segmentId: worker.claim.item.segmentId,
      takeId: identity.takeId,
      bytes: result.audio,
      claimedMimeType: result.contentType.split(";", 1)[0]?.trim().toLocaleLowerCase("en-AU"),
      claimedFormat: request.format,
      provenance: {
        ...commonProvenance,
        parentArtifactIds: worker.material.parentArtifactIds ?? [],
      },
      rights: worker.material.rights,
      actorId: worker.workerActorId,
      verifierActorId,
      now,
    },
  );
  const ingested: ArtifactIngestResult[] = [audio];
  if (!audio.accepted) return Object.freeze({ ingested: Object.freeze(ingested) });

  if (result.transcript?.trim()) {
    const transcriptBytes = new TextEncoder().encode(result.transcript);
    const transcriptId = `artifact_${stableHash({
      parentId: identity.artifactId,
      kind: "transcript",
      contentHash: hashBytes(transcriptBytes),
    }).slice(0, 24)}`;
    ingested.push(await ingestPrivateArtifact(
      worker.objectStore,
      worker.artifactRegistry,
      {
        id: transcriptId,
        kind: "transcript",
        projectId: worker.claim.item.projectId,
        jobId: worker.claim.item.jobId,
        segmentId: worker.claim.item.segmentId,
        takeId: identity.takeId,
        bytes: transcriptBytes,
        claimedMimeType: "text/plain",
        claimedFormat: "txt",
        provenance: {
          ...commonProvenance,
          parentArtifactIds: [identity.artifactId],
        },
        rights: worker.material.rights,
        reviewRequired: false,
        actorId: worker.workerActorId,
        verifierActorId,
        verificationChecks: ["utf8-decode"],
        now,
      },
    ));
  }

  if (result.wordTimestamps && result.wordTimestamps.length > 0) {
    const alignmentBytes = new TextEncoder().encode(JSON.stringify({
      schemaVersion: "storyteller-word-alignment-v1",
      words: result.wordTimestamps,
    }));
    const alignmentId = `artifact_${stableHash({
      parentId: identity.artifactId,
      kind: "word-alignment",
      contentHash: hashBytes(alignmentBytes),
    }).slice(0, 24)}`;
    ingested.push(await ingestPrivateArtifact(
      worker.objectStore,
      worker.artifactRegistry,
      {
        id: alignmentId,
        kind: "word-alignment",
        projectId: worker.claim.item.projectId,
        jobId: worker.claim.item.jobId,
        segmentId: worker.claim.item.segmentId,
        takeId: identity.takeId,
        bytes: alignmentBytes,
        claimedMimeType: "application/json",
        claimedFormat: "json",
        provenance: {
          ...commonProvenance,
          parentArtifactIds: [identity.artifactId],
        },
        rights: worker.material.rights,
        reviewRequired: false,
        actorId: worker.workerActorId,
        verifierActorId,
        verificationChecks: ["json-parse"],
        now,
      },
    ));
  }

  let engineering: AudioEngineeringArtifactResult | undefined;
  if (worker.audioEngineering) {
    if (request.format === "pcm") {
      throw new Error("GENERATION_AUDIO_ENGINEERING_FORMAT_UNSUPPORTED");
    }
    engineering = await ingestAudioEngineeringArtifact(
      worker.objectStore,
      worker.artifactRegistry,
      {
        candidateArtifactId: identity.artifactId,
        projectId: worker.claim.item.projectId,
        jobId: worker.claim.item.jobId,
        segmentId: worker.claim.item.segmentId,
        takeId: identity.takeId,
        generationRequestHash: request.idempotencyKey,
        bytes: result.audio,
        format: request.format,
        rights: worker.material.rights,
        actorId: worker.workerActorId,
        verifierActorId,
        profile: worker.audioEngineering.profile.profile,
        profileVersion: worker.audioEngineering.profile.externalVersion,
        profileReviewedAt: worker.audioEngineering.profile.reviewedAt,
        profileSourceReference: worker.audioEngineering.profile.sourceReference,
        ...(worker.audioEngineering.runner
          ? { runner: worker.audioEngineering.runner }
          : {}),
        ...(worker.audioEngineering.ffprobePath
          ? { ffprobePath: worker.audioEngineering.ffprobePath }
          : {}),
        ...(worker.audioEngineering.ffmpegPath
          ? { ffmpegPath: worker.audioEngineering.ffmpegPath }
          : {}),
        ...(worker.audioEngineering.timeoutMs !== undefined
          ? { timeoutMs: worker.audioEngineering.timeoutMs }
          : {}),
        ...(worker.audioEngineering.maximumOutputBytes !== undefined
          ? { maximumOutputBytes: worker.audioEngineering.maximumOutputBytes }
          : {}),
        ...(worker.audioEngineering.temporaryRoot
          ? { temporaryRoot: worker.audioEngineering.temporaryRoot }
          : {}),
        now,
        ...(worker.signal ? { signal: worker.signal } : {}),
      },
    );
    ingested.push(engineering.ingest);
  }

  return Object.freeze({
    ingested: Object.freeze(ingested),
    ...(engineering ? { engineering } : {}),
  });
}

async function ingestExecutionReport(input: Readonly<{
  worker: ClaimedGenerationWorkerInput;
  report: GenerationExecutionReport;
  artifactIds: readonly string[];
  candidateArtifactIds: readonly string[];
  requests: readonly SynthesisRequest[];
  now: Date;
}>): Promise<Readonly<{
  ingest: ArtifactIngestResult;
  reportHash: string;
}>> {
  const evidence = safeReportEvidence(input.report, input.artifactIds);
  const bytes = new TextEncoder().encode(JSON.stringify(evidence));
  const reportHash = hashBytes(bytes);
  const id = `artifact_${stableHash({
    jobId: input.worker.claim.item.jobId,
    kind: "generation-report",
    reportHash,
  }).slice(0, 24)}`;
  return {
    ingest: await ingestPrivateArtifact(
      input.worker.objectStore,
      input.worker.artifactRegistry,
      {
        id,
        kind: "generation-report",
        projectId: input.worker.claim.item.projectId,
        jobId: input.worker.claim.item.jobId,
        segmentId: input.worker.claim.item.segmentId,
        bytes,
        claimedMimeType: "application/json",
        claimedFormat: "json",
        provenance: {
          createdByActorId: input.worker.workerActorId,
          sourceContentHash: input.worker.material.immutableSourceHash,
          generationRequestHash: stableHash(input.requests.map((request) => request.idempotencyKey)),
          ...(input.worker.material.voiceProfileHash ? { voiceProfileHash: input.worker.material.voiceProfileHash } : {}),
          parentArtifactIds: [...input.candidateArtifactIds],
        },
        rights: input.worker.material.rights,
        reviewRequired: false,
        actorId: input.worker.workerActorId,
        verifierActorId: input.worker.verifierActorId ?? input.worker.workerActorId,
        verificationChecks: ["json-parse"],
        now: input.now,
      },
    ),
    reportHash,
  };
}

async function terminalTransition(
  input: ClaimedGenerationWorkerInput,
  transition: GenerationWorkerQueueTransition,
): Promise<void> {
  throwIfWorkerAborted(input.signal);
  await input.beforeTerminalTransition?.(transition);
}

export async function processClaimedGeneration(
  input: ClaimedGenerationWorkerInput,
): Promise<GenerationWorkerResult> {
  requireWorkerInput(input);
  throwIfWorkerAborted(input.signal);
  const now = input.now ?? input.clock?.() ?? new Date();
  const requests = buildRequests(input.claim, input.material);
  const report = await executeGenerationJob({
    job: input.claim.item.job,
    text: input.material.text,
    immutableSourceHash: input.material.immutableSourceHash,
    voiceProfileId: input.material.voiceProfileId,
    voiceRevision: input.material.voiceRevision,
    ...(input.material.voiceProfileHash !== undefined ? { voiceProfileHash: input.material.voiceProfileHash } : {}),
    direction: input.material.direction,
    pronunciations: input.material.pronunciations ?? [],
    mode: input.material.mode ?? "production",
    format: input.material.format ?? "wav",
    sampleRateHz: input.material.sampleRateHz ?? 48_000,
    naturalNarration: input.material.naturalNarration,
    registry: input.providers,
    credentials: input.credentials,
    timeoutMs: input.timeoutMs,
    signal: input.signal,
  });
  const accounting = executionAccounting(report, input.material.costPolicy);
  if (accounting.blockedCode) {
    const transition: GenerationWorkerQueueTransition = {
      kind: "block",
      codes: [accounting.blockedCode],
      accounting,
      at: now.toISOString(),
    };
    await terminalTransition(input, transition);
    const blocked = await input.queue.block(
      input.claim.item.id,
      input.workerActorId,
      input.claim.item.lease?.token ?? "",
      [accounting.blockedCode],
      now,
    );
    return {
      queueEnvelope: blocked,
      executionStatus: report.status,
      artifactIds: [],
      candidateArtifactIds: [],
    };
  }

  if (report.results.length === 0) {
    const codes = report.findings.length > 0
      ? report.findings.map((finding) => finding.code)
      : ["GENERATION_NO_PROVIDER_RESULT"];
    const transition: GenerationWorkerQueueTransition = {
      kind: "retry",
      codes,
      accounting,
      at: now.toISOString(),
    };
    await terminalTransition(input, transition);
    const retry = await input.queue.retry(
      input.claim.item.id,
      input.workerActorId,
      input.claim.item.lease?.token ?? "",
      codes,
      now,
    );
    return {
      queueEnvelope: retry,
      executionStatus: report.status,
      artifactIds: [],
      candidateArtifactIds: [],
    };
  }

  const artifactIds: string[] = [];
  const candidateArtifactIds: string[] = [];
  for (const result of report.results) {
    const request = requests.find((candidate) => candidate.requestId === result.requestId);
    if (!request) throw new Error("GENERATION_WORKER_REQUEST_RESULT_MISMATCH");
    const ingested = await ingestResultArtifacts({ worker: input, request, result, now });
    for (const admission of ingested.ingested) {
      if (admission.accepted) artifactIds.push(admission.artifact.id);
    }
    const primary = ingested.ingested[0];
    if (!primary?.accepted) {
      const codes = primary?.artifact.findings.map((finding) => finding.code)
        ?? ["GENERATION_ARTIFACT_ADMISSION_FAILED"];
      const transition: GenerationWorkerQueueTransition = {
        kind: "block",
        codes,
        accounting,
        at: now.toISOString(),
      };
      await terminalTransition(input, transition);
      const blocked = await input.queue.block(
        input.claim.item.id,
        input.workerActorId,
        input.claim.item.lease?.token ?? "",
        codes,
        now,
      );
      return {
        queueEnvelope: blocked,
        executionStatus: report.status,
        artifactIds: Object.freeze([...artifactIds]),
        candidateArtifactIds: Object.freeze([...candidateArtifactIds]),
      };
    }
    candidateArtifactIds.push(primary.artifact.id);
  }

  const reportArtifact = await ingestExecutionReport({
    worker: input,
    report,
    artifactIds,
    candidateArtifactIds,
    requests,
    now,
  });
  if (!reportArtifact.ingest.accepted) {
    throw new ArtifactAdmissionError("GENERATION_EXECUTION_REPORT_ADMISSION_FAILED");
  }
  artifactIds.push(reportArtifact.ingest.artifact.id);

  const completion = await completeGenerationWithArtifacts(
    input.queue,
    input.artifactRegistry,
    input.claim.item.id,
    input.workerActorId,
    input.claim.item.lease?.token ?? "",
    {
      artifactIds,
      candidateArtifactIds,
      executionReportHash: reportArtifact.reportHash,
      now,
    },
  );
  return {
    queueEnvelope: completion.queueEnvelope,
    executionStatus: report.status,
    artifactIds: Object.freeze([...artifactIds]),
    candidateArtifactIds: Object.freeze([...candidateArtifactIds]),
    reportArtifactId: reportArtifact.ingest.artifact.id,
    executionReportHash: reportArtifact.reportHash,
    completion,
  };
}

export function generationWorkerPublicView(result: GenerationWorkerResult): GenerationWorkerPublicView {
  return Object.freeze({
    queueItemId: result.queueEnvelope.entityId,
    jobId: result.queueEnvelope.payload.jobId,
    status: result.queueEnvelope.payload.status,
    executionStatus: result.executionStatus,
    artifactCount: result.artifactIds.length,
    candidateCount: result.candidateArtifactIds.length,
    ...(result.reportArtifactId ? { reportArtifactId: result.reportArtifactId } : {}),
    ...(result.executionReportHash ? { executionReportHash: result.executionReportHash } : {}),
    revision: result.queueEnvelope.revision,
  });
}
