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
  direction: PerformanceDirection;
  pronunciations?: readonly CanonicalPronunciation[];
  mode?: ProviderExecutionMode;
  format?: ProviderAudioFormat;
  sampleRateHz?: number;
  rights: ArtifactRightsSnapshot;
  intendedUse?: ProjectUse;
  commercial?: boolean;
  parentArtifactIds?: readonly string[];
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
  if (input.material.format === "pcm") {
    throw new Error("GENERATION_WORKER_UNSUPPORTED_STORAGE_FORMAT");
  }
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
      direction: material.direction,
      pronunciations: material.pronunciations ?? [],
      mode: material.mode ?? "production",
      format: material.format ?? "wav",
      sampleRateHz: material.sampleRateHz ?? 48_000,
      candidateIndex,
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
    kind: "generation-execution-report",
    reportHash,
  }).slice(0, 24)}`;
  const ingest = await ingestPrivateArtifact(
    input.worker.objectStore,
    input.worker.artifactRegistry,
    {
      id,
      kind: "audio-analysis",
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
        parentArtifactIds: input.candidateArtifactIds,
      },
      rights: input.worker.material.rights,
      reviewRequired: false,
      actorId: input.worker.workerActorId,
      verifierActorId: input.worker.verifierActorId ?? input.worker.workerActorId,
      verificationChecks: ["json-parse", "execution-evidence-schema"],
      now: input.now,
    },
  );
  return { ingest, reportHash };
}

async function blockClaim(input: Readonly<{
  worker: ClaimedGenerationWorkerInput;
  executionStatus: GenerationExecutionReport["status"];
  codes: readonly string[];
  message: string;
  artifacts: readonly ArtifactRecord[];
  candidateArtifactIds: readonly string[];
  reportArtifactId?: string;
  reportHash?: string;
  accounting: GenerationWorkerCostAccounting;
  now: Date;
}>): Promise<GenerationWorkerResult> {
  await input.worker.beforeTerminalTransition?.({
    kind: "block",
    codes: input.codes,
    accounting: input.accounting,
    at: input.now.toISOString(),
  });
  const queueEnvelope = await input.worker.queue.block(
    input.worker.claim.item.id,
    input.worker.claim.leaseToken,
    {
      codes: input.codes,
      message: input.message,
      now: input.now,
    },
  );
  return {
    queueEnvelope,
    executionStatus: input.executionStatus,
    artifactIds: Object.freeze(input.artifacts.map((artifact) => artifact.id).sort()),
    candidateArtifactIds: Object.freeze([...input.candidateArtifactIds].sort()),
    ...(input.reportArtifactId ? { reportArtifactId: input.reportArtifactId } : {}),
    ...(input.reportHash ? { executionReportHash: input.reportHash } : {}),
  };
}

function providerExecutionIsRetryable(report: GenerationExecutionReport): boolean {
  return report.attempts.some((attempt) =>
    attempt.status === "failed"
    && attempt.findings.some((finding) =>
      finding.code === "PROVIDER_SYNTHESIS_FAILED"
      || finding.code.startsWith("PROVIDER_RESULT_")
    )
  );
}

function generationWorkerNow(input: ClaimedGenerationWorkerInput): Date {
  return input.clock?.() ?? input.now ?? new Date();
}

export async function runClaimedGenerationWorker(
  input: ClaimedGenerationWorkerInput,
): Promise<GenerationWorkerResult> {
  requireWorkerInput(input);
  throwIfWorkerAborted(input.signal);
  const currentTime = () => generationWorkerNow(input);
  const requests = buildRequests(input.claim, input.material);
  const report = await executeGenerationJob({
    job: input.claim.item.job,
    registry: input.providers,
    credentials: input.credentials,
    requests,
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  throwIfWorkerAborted(input.signal);
  const accounting = executionAccounting(report, input.material.costPolicy);

  const requestsById = new Map(requests.map((request) => [request.requestId, request]));
  const ingested: ArtifactIngestResult[] = [];
  const engineeringBlockedCodes: string[] = [];
  try {
    for (const result of report.results) {
      throwIfWorkerAborted(input.signal);
      const request = requestsById.get(result.requestId);
      if (!request) throw new Error("GENERATION_WORKER_RESULT_REQUEST_MISSING");
      const resultArtifacts = await ingestResultArtifacts({
        worker: input,
        request,
        result,
        now: currentTime(),
      });
      ingested.push(...resultArtifacts.ingested);
      if (resultArtifacts.engineering && !resultArtifacts.engineering.candidateEligible) {
        const codes = resultArtifacts.engineering.evidence.findings
          .filter((finding) => finding.severity === "error")
          .map((finding) => finding.code);
        engineeringBlockedCodes.push(
          ...(codes.length > 0 ? codes : ["GENERATION_AUDIO_ENGINEERING_INELIGIBLE"]),
        );
      }
    }
  } catch {
    throwIfWorkerAborted(input.signal);
    return blockClaim({
      worker: input,
      executionStatus: report.status,
      accounting,
      codes: ["GENERATION_ARTIFACT_INGEST_FAILED"],
      message: "One or more provider results could not be admitted to private artifact storage.",
      artifacts: ingested.map((item) => item.envelope.payload),
      candidateArtifactIds: ingested
        .filter((item) => item.envelope.payload.kind === "audio-candidate")
        .map((item) => item.envelope.payload.id),
      now: currentTime(),
    });
  }

  throwIfWorkerAborted(input.signal);
  const artifacts = ingested.map((item) => item.envelope.payload);
  const candidateArtifactIds = artifacts
    .filter((artifact) => artifact.kind === "audio-candidate")
    .map((artifact) => artifact.id);
  if (ingested.some((item) => !item.accepted)) {
    return blockClaim({
      worker: input,
      executionStatus: report.status,
      accounting,
      codes: ["GENERATION_ARTIFACT_QUARANTINED"],
      message: "One or more provider results failed artifact integrity verification and were quarantined.",
      artifacts,
      candidateArtifactIds,
      now: currentTime(),
    });
  }

  throwIfWorkerAborted(input.signal);
  const reportArtifact = await ingestExecutionReport({
    worker: input,
    report,
    artifactIds: artifacts.map((artifact) => artifact.id),
    candidateArtifactIds,
    requests,
    now: currentTime(),
  });
  artifacts.push(reportArtifact.ingest.envelope.payload);
  throwIfWorkerAborted(input.signal);
  if (!reportArtifact.ingest.accepted) {
    return blockClaim({
      worker: input,
      executionStatus: report.status,
      accounting,
      codes: ["GENERATION_REPORT_ARTIFACT_INVALID"],
      message: "Generation execution evidence failed artifact verification.",
      artifacts,
      candidateArtifactIds,
      reportArtifactId: reportArtifact.ingest.envelope.payload.id,
      reportHash: reportArtifact.reportHash,
      now: currentTime(),
    });
  }

  if (accounting.blockedCode) {
    return blockClaim({
      worker: input,
      executionStatus: report.status,
      accounting,
      codes: [accounting.blockedCode],
      message: "Generation cost evidence does not satisfy the configured production policy.",
      artifacts,
      candidateArtifactIds,
      reportArtifactId: reportArtifact.ingest.envelope.payload.id,
      reportHash: reportArtifact.reportHash,
      now: currentTime(),
    });
  }

  if (engineeringBlockedCodes.length > 0) {
    return blockClaim({
      worker: input,
      executionStatus: report.status,
      accounting,
      codes: Object.freeze([...new Set(engineeringBlockedCodes)].sort()),
      message: "Independent engineering evidence did not satisfy the configured delivery profile.",
      artifacts,
      candidateArtifactIds,
      reportArtifactId: reportArtifact.ingest.envelope.payload.id,
      reportHash: reportArtifact.reportHash,
      now: currentTime(),
    });
  }

  if (report.status !== "completed") {
    if (providerExecutionIsRetryable(report)) {
      const transitionTime = currentTime();
      await input.beforeTerminalTransition?.({
        kind: "retry",
        codes: ["GENERATION_PROVIDER_EXECUTION_INCOMPLETE"],
        accounting,
        at: transitionTime.toISOString(),
      });
      const queueEnvelope = await input.queue.fail(
        input.claim.item.id,
        input.claim.leaseToken,
        {
          code: "GENERATION_PROVIDER_EXECUTION_INCOMPLETE",
          message: "Provider execution did not produce the complete governed candidate set.",
          retryable: true,
          now: transitionTime,
        },
      );
      return {
        queueEnvelope,
        executionStatus: report.status,
        artifactIds: Object.freeze(artifacts.map((artifact) => artifact.id).sort()),
        candidateArtifactIds: Object.freeze([...candidateArtifactIds].sort()),
        reportArtifactId: reportArtifact.ingest.envelope.payload.id,
        executionReportHash: reportArtifact.reportHash,
      };
    }
    return blockClaim({
      worker: input,
      executionStatus: report.status,
      accounting,
      codes: ["GENERATION_PROVIDER_CONFIGURATION_BLOCKED"],
      message: "No approved and configured provider route produced the required candidate set.",
      artifacts,
      candidateArtifactIds,
      reportArtifactId: reportArtifact.ingest.envelope.payload.id,
      reportHash: reportArtifact.reportHash,
      now: currentTime(),
    });
  }

  try {
    const completionTime = currentTime();
    const completion = await completeGenerationWithArtifacts({
      queue: input.queue,
      claim: input.claim,
      artifacts,
      executionReportHash: reportArtifact.reportHash,
      intendedUse: input.material.intendedUse ?? "audiobook",
      commercial: input.material.commercial ?? true,
      ...(accounting.totalEstimatedCost !== undefined
        ? {
            totalEstimatedCost: accounting.totalEstimatedCost,
            currency: accounting.currency,
          }
        : {}),
      beforeQueueComplete: async ({
        artifactIds,
        candidateTakeIds,
        admissionFingerprint,
      }) => {
        await input.beforeTerminalTransition?.({
          kind: "complete",
          codes: [],
          accounting,
          artifactIds,
          candidateTakeIds,
          admissionFingerprint,
          at: completionTime.toISOString(),
        });
      },
      now: completionTime,
    });
    return {
      queueEnvelope: completion.envelope,
      executionStatus: report.status,
      artifactIds: completion.artifactIds,
      candidateArtifactIds: Object.freeze([...candidateArtifactIds].sort()),
      reportArtifactId: reportArtifact.ingest.envelope.payload.id,
      executionReportHash: reportArtifact.reportHash,
      completion,
    };
  } catch (error) {
    if (!(error instanceof ArtifactAdmissionError)) throw error;
    const codes = error.assessment.findings
      .filter((finding) => finding.severity === "error")
      .map((finding) => finding.code);
    return blockClaim({
      worker: input,
      executionStatus: report.status,
      accounting,
      codes: codes.length > 0 ? codes : ["GENERATION_ARTIFACT_ADMISSION_BLOCKED"],
      message: "Verified artifacts did not satisfy the exact queue-completion governance gate.",
      artifacts,
      candidateArtifactIds,
      reportArtifactId: reportArtifact.ingest.envelope.payload.id,
      reportHash: reportArtifact.reportHash,
      now: currentTime(),
    });
  }
}

export function generationWorkerPublicView(
  result: GenerationWorkerResult,
): GenerationWorkerPublicView {
  return Object.freeze({
    queueItemId: result.queueEnvelope.payload.id,
    jobId: result.queueEnvelope.payload.jobId,
    status: result.queueEnvelope.payload.status,
    executionStatus: result.executionStatus,
    artifactCount: result.artifactIds.length,
    candidateCount: result.candidateArtifactIds.length,
    ...(result.reportArtifactId ? { reportArtifactId: result.reportArtifactId } : {}),
    ...(result.executionReportHash
      ? { executionReportHash: result.executionReportHash }
      : {}),
    revision: result.queueEnvelope.revision,
  });
}
