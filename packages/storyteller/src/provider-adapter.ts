import {
  stableHash,
  type Finding,
  type GenerationJob,
  type PerformanceDirection,
  type ProviderFeature,
} from "./index.js";

export type ProviderExecutionMode = "preview" | "calibration" | "production";
export type ProviderAudioFormat = "wav" | "flac" | "mp3" | "pcm";

export interface ProviderCapabilitySnapshot {
  providerId: string;
  adapterVersion: string;
  capturedAt: string;
  features: readonly ProviderFeature[];
  maximumInputCharacters: number;
  supportedFormats: readonly ProviderAudioFormat[];
  supportedSampleRatesHz: readonly number[];
  regions: readonly string[];
  storesInputs: boolean;
  trainsOnCustomerData: boolean;
  customVoiceRequiresConsent: boolean;
  rawPolicyVersion?: string;
  fingerprint: string;
}

export interface CanonicalPronunciation {
  writtenForm: string;
  ipa?: string;
  providerPhoneme?: string;
  spokenForm?: string;
  approvedRevision: number;
}

export interface SynthesisRequest {
  requestId: string;
  idempotencyKey: string;
  projectId: string;
  segmentId: string;
  immutableSourceHash: string;
  text: string;
  voiceProfileId: string;
  voiceRevision: number;
  direction: PerformanceDirection;
  pronunciations: readonly CanonicalPronunciation[];
  mode: ProviderExecutionMode;
  format: ProviderAudioFormat;
  sampleRateHz: number;
  candidateIndex: number;
  metadata: Readonly<Record<string, string>>;
}

export interface ProviderUsage {
  inputCharacters: number;
  outputSeconds?: number;
  providerUnits?: number;
  estimatedCost?: number;
  currency?: string;
}

export interface SynthesisResult {
  providerId: string;
  adapterVersion: string;
  requestId: string;
  idempotencyKey: string;
  providerRequestId?: string;
  audio: Uint8Array;
  contentType: string;
  transcript?: string;
  wordTimestamps?: readonly Readonly<{
    word: string;
    startMs: number;
    endMs: number;
  }>[];
  usage: ProviderUsage;
  capabilityFingerprint: string;
  generatedAt: string;
  provenance: Readonly<Record<string, string | number | boolean>>;
}

export interface ProviderExecutionContext {
  signal?: AbortSignal;
  credential: string;
  region?: string;
  timeoutMs: number;
}

export interface NarrationProviderAdapter {
  readonly providerId: string;
  readonly adapterVersion: string;
  inspectCapabilities(
    context: Omit<ProviderExecutionContext, "timeoutMs">,
  ): Promise<ProviderCapabilitySnapshot>;
  synthesise(
    request: SynthesisRequest,
    context: ProviderExecutionContext,
  ): Promise<SynthesisResult>;
}

export interface CredentialResolver {
  resolve(providerId: string): Promise<string | null>;
}

export interface ExecutionAttempt {
  providerId: string;
  candidateIndex: number;
  status: "succeeded" | "failed" | "skipped";
  result?: SynthesisResult;
  findings: readonly Finding[];
}

export interface GenerationExecutionReport {
  jobId: string;
  status: "completed" | "partial" | "blocked";
  attempts: readonly ExecutionAttempt[];
  results: readonly SynthesisResult[];
  findings: readonly Finding[];
}

export class ProviderAdapterRegistry {
  readonly #adapters = new Map<string, NarrationProviderAdapter>();

  constructor(adapters: readonly NarrationProviderAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: NarrationProviderAdapter): void {
    if (!/^[a-z0-9][a-z0-9._-]{1,63}$/u.test(adapter.providerId)) {
      throw new Error("PROVIDER_ADAPTER_ID_INVALID");
    }
    if (!/^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/iu.test(adapter.adapterVersion)) {
      throw new Error("PROVIDER_ADAPTER_VERSION_INVALID");
    }
    if (this.#adapters.has(adapter.providerId)) {
      throw new Error(`PROVIDER_ADAPTER_DUPLICATE:${adapter.providerId}`);
    }
    this.#adapters.set(adapter.providerId, adapter);
  }

  get(providerId: string): NarrationProviderAdapter | null {
    return this.#adapters.get(providerId) ?? null;
  }

  ids(): readonly string[] {
    return [...this.#adapters.keys()].sort((left, right) =>
      left.localeCompare(right, "en-AU")
    );
  }
}

export function createCapabilitySnapshot(
  input: Omit<ProviderCapabilitySnapshot, "fingerprint">,
): ProviderCapabilitySnapshot {
  const fingerprint = stableHash({
    providerId: input.providerId,
    adapterVersion: input.adapterVersion,
    features: [...input.features].sort(),
    maximumInputCharacters: input.maximumInputCharacters,
    supportedFormats: [...input.supportedFormats].sort(),
    supportedSampleRatesHz: [...input.supportedSampleRatesHz]
      .sort((left, right) => left - right),
    regions: [...input.regions].sort(),
    storesInputs: input.storesInputs,
    trainsOnCustomerData: input.trainsOnCustomerData,
    customVoiceRequiresConsent: input.customVoiceRequiresConsent,
    rawPolicyVersion: input.rawPolicyVersion ?? null,
  });
  return { ...input, fingerprint };
}

export function buildSynthesisRequest(input: Readonly<{
  job: GenerationJob;
  text: string;
  immutableSourceHash: string;
  voiceProfileId: string;
  voiceRevision: number;
  direction: PerformanceDirection;
  pronunciations?: readonly CanonicalPronunciation[];
  mode: ProviderExecutionMode;
  format?: ProviderAudioFormat;
  sampleRateHz?: number;
  candidateIndex: number;
}>): SynthesisRequest {
  if (input.job.status !== "ready") throw new Error("GENERATION_JOB_NOT_READY");
  if (input.text.length === 0) throw new Error("SYNTHESIS_TEXT_EMPTY");
  if (
    !Number.isSafeInteger(input.candidateIndex)
    || input.candidateIndex < 0
    || input.candidateIndex >= input.job.candidateCount
  ) {
    throw new Error("SYNTHESIS_CANDIDATE_INDEX_INVALID");
  }
  const requestFingerprint = stableHash({
    jobId: input.job.id,
    cacheKey: input.job.cacheKey,
    segmentId: input.job.segmentId,
    immutableSourceHash: input.immutableSourceHash,
    voiceProfileId: input.voiceProfileId,
    voiceRevision: input.voiceRevision,
    direction: input.direction,
    pronunciations: input.pronunciations ?? [],
    mode: input.mode,
    format: input.format ?? "wav",
    sampleRateHz: input.sampleRateHz ?? 48_000,
    candidateIndex: input.candidateIndex,
  });
  return {
    requestId: `request_${requestFingerprint.slice(0, 24)}`,
    idempotencyKey: requestFingerprint,
    projectId: input.job.projectId,
    segmentId: input.job.segmentId,
    immutableSourceHash: input.immutableSourceHash,
    text: input.text,
    voiceProfileId: input.voiceProfileId,
    voiceRevision: input.voiceRevision,
    direction: input.direction,
    pronunciations: input.pronunciations ?? [],
    mode: input.mode,
    format: input.format ?? "wav",
    sampleRateHz: input.sampleRateHz ?? 48_000,
    candidateIndex: input.candidateIndex,
    metadata: {
      jobId: input.job.id,
      jobCacheKey: input.job.cacheKey,
      projectId: input.job.projectId,
      segmentId: input.job.segmentId,
    },
  };
}

function validateResult(
  result: SynthesisResult,
  adapter: NarrationProviderAdapter,
  request: SynthesisRequest,
): Finding[] {
  const findings: Finding[] = [];
  if (result.providerId !== adapter.providerId) {
    findings.push({
      code: "PROVIDER_RESULT_ID_MISMATCH",
      severity: "error",
      message: "Provider result identifier does not match the executing adapter.",
    });
  }
  if (result.adapterVersion !== adapter.adapterVersion) {
    findings.push({
      code: "PROVIDER_RESULT_VERSION_MISMATCH",
      severity: "error",
      message: "Provider result adapter version does not match the executing adapter.",
    });
  }
  if (
    result.requestId !== request.requestId
    || result.idempotencyKey !== request.idempotencyKey
  ) {
    findings.push({
      code: "PROVIDER_RESULT_CORRELATION_MISMATCH",
      severity: "error",
      message: "Provider result cannot be correlated to the deterministic request.",
    });
  }
  if (!(result.audio instanceof Uint8Array) || result.audio.byteLength === 0) {
    findings.push({
      code: "PROVIDER_RESULT_AUDIO_EMPTY",
      severity: "error",
      message: "Provider returned no audio bytes.",
    });
  }
  if (!result.contentType.startsWith("audio/")) {
    findings.push({
      code: "PROVIDER_RESULT_CONTENT_TYPE_INVALID",
      severity: "error",
      message: "Provider result does not declare an audio content type.",
    });
  }
  if (!/^[a-f0-9]{64}$/u.test(result.capabilityFingerprint)) {
    findings.push({
      code: "PROVIDER_CAPABILITY_FINGERPRINT_INVALID",
      severity: "error",
      message: "Provider result is missing a valid capability snapshot fingerprint.",
    });
  }
  return findings;
}

const SAFE_PROVIDER_GOVERNANCE_CODE =
  /^GENERATION_CALIBRATION_[A-Z0-9_]{3,80}$/u;

function providerFailureFinding(
  error: unknown,
  providerId: string,
): Finding {
  const candidate = error instanceof Error ? error.message : "";
  const code = SAFE_PROVIDER_GOVERNANCE_CODE.test(candidate)
    ? candidate
    : "PROVIDER_SYNTHESIS_FAILED";
  return {
    code,
    severity: "warning",
    message: code === "PROVIDER_SYNTHESIS_FAILED"
      ? "Provider attempt failed without producing approved output."
      : "Provider output did not satisfy the approved production calibration lock.",
    providerId,
  };
}

export async function executeGenerationJob(input: Readonly<{
  job: GenerationJob;
  registry: ProviderAdapterRegistry;
  credentials: CredentialResolver;
  requests: readonly SynthesisRequest[];
  timeoutMs?: number;
  signal?: AbortSignal;
}>): Promise<GenerationExecutionReport> {
  const findings: Finding[] = [];
  const attempts: ExecutionAttempt[] = [];
  const results: SynthesisResult[] = [];
  const timeoutMs = input.timeoutMs ?? 120_000;

  if (input.job.status !== "ready") {
    findings.push({
      code: "GENERATION_JOB_BLOCKED",
      severity: "error",
      message: "Generation job is not ready because an upstream governance gate is unresolved.",
    });
    return {
      jobId: input.job.id,
      status: "blocked",
      attempts,
      results,
      findings,
    };
  }
  if (input.requests.length !== input.job.candidateCount) {
    findings.push({
      code: "GENERATION_REQUEST_COUNT_MISMATCH",
      severity: "error",
      message: "Deterministic synthesis requests do not match the job candidate count.",
    });
    return {
      jobId: input.job.id,
      status: "blocked",
      attempts,
      results,
      findings,
    };
  }

  for (const request of input.requests) {
    let completed = false;
    for (const providerId of input.job.providerFallbackIds) {
      const adapter = input.registry.get(providerId);
      if (!adapter) {
        const attemptFinding: Finding = {
          code: "PROVIDER_ADAPTER_UNAVAILABLE",
          severity: "warning",
          message: `No adapter is registered for provider route ${providerId}.`,
          providerId,
        };
        attempts.push({
          providerId,
          candidateIndex: request.candidateIndex,
          status: "skipped",
          findings: [attemptFinding],
        });
        continue;
      }
      const credential = await input.credentials.resolve(providerId);
      if (!credential) {
        const attemptFinding: Finding = {
          code: "PROVIDER_CREDENTIAL_UNAVAILABLE",
          severity: "warning",
          message: `No server-side credential is available for provider route ${providerId}.`,
          providerId,
        };
        attempts.push({
          providerId,
          candidateIndex: request.candidateIndex,
          status: "skipped",
          findings: [attemptFinding],
        });
        continue;
      }

      try {
        const result = await adapter.synthesise(request, {
          credential,
          timeoutMs,
          ...(input.signal ? { signal: input.signal } : {}),
        });
        const resultFindings = validateResult(result, adapter, request);
        if (resultFindings.some((finding) => finding.severity === "error")) {
          attempts.push({
            providerId,
            candidateIndex: request.candidateIndex,
            status: "failed",
            result,
            findings: resultFindings,
          });
          continue;
        }
        attempts.push({
          providerId,
          candidateIndex: request.candidateIndex,
          status: "succeeded",
          result,
          findings: resultFindings,
        });
        results.push(result);
        completed = true;
        break;
      } catch (error) {
        attempts.push({
          providerId,
          candidateIndex: request.candidateIndex,
          status: "failed",
          findings: [providerFailureFinding(error, providerId)],
        });
      }
    }
    if (!completed) {
      findings.push({
        code: "GENERATION_CANDIDATE_UNRESOLVED",
        severity: "error",
        message: `No provider route produced a valid result for candidate ${request.candidateIndex}.`,
      });
    }
  }

  return {
    jobId: input.job.id,
    status: findings.some((finding) => finding.severity === "error")
      ? results.length > 0
        ? "partial"
        : "blocked"
      : "completed",
    attempts,
    results,
    findings,
  };
}
