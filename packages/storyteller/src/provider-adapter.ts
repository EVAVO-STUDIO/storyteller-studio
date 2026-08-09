import {
  stableHash,
  type Finding,
  type GenerationJob,
  type PerformanceDirection,
  type ProviderFeature,
} from "./index.js";
import {
  naturalNarrationRequestMetadata,
  type NaturalNarrationProductionPlan,
} from "./narration-production-policy.js";

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
  voiceProfileHash?: string;
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
  voiceProfileHash?: string;
  direction: PerformanceDirection;
  pronunciations?: readonly CanonicalPronunciation[];
  mode: ProviderExecutionMode;
  format?: ProviderAudioFormat;
  sampleRateHz?: number;
  candidateIndex: number;
  naturalNarration?: NaturalNarrationProductionPlan;
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
  if (input.voiceProfileHash !== undefined && !/^[a-f0-9]{64}$/u.test(input.voiceProfileHash)) {
    throw new Error("SYNTHESIS_VOICE_PROFILE_HASH_INVALID");
  }
  const narrationMetadata = input.naturalNarration
    ? naturalNarrationRequestMetadata(input.naturalNarration)
    : {};
  const requestFingerprint = stableHash({
    jobId: input.job.id,
    cacheKey: input.job.cacheKey,
    segmentId: input.job.segmentId,
    immutableSourceHash: input.immutableSourceHash,
    voiceProfileId: input.voiceProfileId,
    voiceRevision: input.voiceRevision,
    voiceProfileHash: input.voiceProfileHash ?? null,
    direction: input.direction,
    pronunciations: input.pronunciations ?? [],
    mode: input.mode,
    format: input.format ?? "wav",
    sampleRateHz: input.sampleRateHz ?? 48_000,
    candidateIndex: input.candidateIndex,
    naturalNarrationPlanFingerprint: input.naturalNarration?.fingerprint ?? null,
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
    ...(input.voiceProfileHash !== undefined ? { voiceProfileHash: input.voiceProfileHash } : {}),
    direction: input.direction,
    pronunciations: input.pronunciations ?? [],
    mode: input.mode,
    format: input.format ?? "wav",
    sampleRateHz: input.sampleRateHz ?? 48_000,
    candidateIndex: input.candidateIndex,
    metadata: {
      jobId: input.job.id,
      jobCacheKey: input.job.cacheKey,
      voiceProfileId: input.voiceProfileId,
      voiceRevision: String(input.voiceRevision),
      ...(input.voiceProfileHash !== undefined ? { voiceProfileHash: input.voiceProfileHash } : {}),
      ...narrationMetadata,
    },
  };
}

export function validateSynthesisResult(
  result: SynthesisResult,
  request: SynthesisRequest,
): void {
  if (result.requestId !== request.requestId) throw new Error("SYNTHESIS_RESULT_REQUEST_MISMATCH");
  if (result.idempotencyKey !== request.idempotencyKey) throw new Error("SYNTHESIS_RESULT_IDEMPOTENCY_MISMATCH");
  if (!(result.audio instanceof Uint8Array) || result.audio.byteLength === 0) {
    throw new Error("SYNTHESIS_RESULT_AUDIO_EMPTY");
  }
  if (!result.contentType.startsWith("audio/")) throw new Error("SYNTHESIS_RESULT_CONTENT_TYPE_INVALID");
  if (result.usage.inputCharacters !== request.text.length) {
    throw new Error("SYNTHESIS_RESULT_USAGE_INPUT_MISMATCH");
  }
  if (!/^[a-f0-9]{64}$/u.test(result.capabilityFingerprint)) {
    throw new Error("SYNTHESIS_RESULT_CAPABILITY_FINGERPRINT_INVALID");
  }
  if (Number.isNaN(Date.parse(result.generatedAt))) throw new Error("SYNTHESIS_RESULT_DATE_INVALID");
}

export async function executeGenerationJob(input: Readonly<{
  job: GenerationJob;
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
  naturalNarration?: NaturalNarrationProductionPlan;
  registry: ProviderAdapterRegistry;
  credentials: CredentialResolver;
  timeoutMs?: number;
  signal?: AbortSignal;
}>): Promise<GenerationExecutionReport> {
  if (input.job.status !== "ready") throw new Error("GENERATION_JOB_NOT_READY");
  const attempts: ExecutionAttempt[] = [];
  const findings: Finding[] = [];
  const results: SynthesisResult[] = [];
  for (const providerId of input.job.providerOrder) {
    const adapter = input.registry.get(providerId);
    if (!adapter) {
      findings.push({ code: "PROVIDER_ADAPTER_MISSING", severity: "error", message: `No adapter is registered for ${providerId}.`, providerId });
      continue;
    }
    const credential = await input.credentials.resolve(providerId);
    if (!credential) {
      findings.push({ code: "PROVIDER_CREDENTIAL_MISSING", severity: "error", message: `No credential is configured for ${providerId}.`, providerId });
      continue;
    }
    for (let candidateIndex = 0; candidateIndex < input.job.candidateCount; candidateIndex += 1) {
      const request = buildSynthesisRequest({
        job: input.job,
        text: input.text,
        immutableSourceHash: input.immutableSourceHash,
        voiceProfileId: input.voiceProfileId,
        voiceRevision: input.voiceRevision,
        ...(input.voiceProfileHash !== undefined ? { voiceProfileHash: input.voiceProfileHash } : {}),
        direction: input.direction,
        pronunciations: input.pronunciations,
        mode: input.mode ?? "production",
        format: input.format,
        sampleRateHz: input.sampleRateHz,
        candidateIndex,
        naturalNarration: input.naturalNarration,
      });
      try {
        const result = await adapter.synthesise(request, {
          credential,
          timeoutMs: input.timeoutMs ?? 120_000,
          signal: input.signal,
        });
        validateSynthesisResult(result, request);
        results.push(result);
        attempts.push({ providerId, candidateIndex, status: "succeeded", result, findings: [] });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown synthesis failure.";
        attempts.push({
          providerId,
          candidateIndex,
          status: "failed",
          findings: [{ code: "SYNTHESIS_PROVIDER_FAILURE", severity: "error", message, providerId }],
        });
      }
    }
  }
  const status = results.length === 0 ? "blocked" : results.length < input.job.candidateCount ? "partial" : "completed";
  return {
    jobId: input.job.id,
    status,
    attempts,
    results,
    findings,
  };
}
