import { createHash } from "node:crypto";
import {
  type NarrationProviderAdapter,
  type ProviderCapabilitySnapshot,
  type ProviderExecutionContext,
  type SynthesisRequest,
  type SynthesisResult,
} from "./provider-adapter.js";
import {
  audioStudioCapabilitySnapshot,
  audioStudioRenderPayload,
  parseAudioStudioHealth,
  parseAudioStudioJobStatus,
  parseAudioStudioSubmission,
  verifyAudioStudioBinding,
  verifyAudioStudioExpressiveArtifactEvidence,
} from "./audio-studio-contracts.js";
import {
  audioStudioHeaders,
  audioStudioSleep,
  fetchAudioStudio,
  parseAudioStudioEnvelope,
  readAudioStudioResponseBytes,
  resolveAudioStudioUrl,
  validateAudioStudioBaseUrl,
} from "./audio-studio-http.js";
import {
  AUDIO_STUDIO_ADAPTER_VERSION,
  AUDIO_STUDIO_PROVIDER_ID,
  type AudioStudioCachedCapability,
  type AudioStudioFetch,
  type AudioStudioVoiceAdapterOptions,
  type AudioStudioVoiceBinding,
  type AudioStudioBindingResolver,
  type AudioStudioConsentBasis,
  type AudioStudioManuscriptRights,
  type AudioStudioRightsBasis,
  type AudioStudioVoiceOperation,
  type AudioStudioVoiceRightsRecord,
} from "./audio-studio-types.js";

export {
  AUDIO_STUDIO_ADAPTER_VERSION,
  AUDIO_STUDIO_PROVIDER_ID,
} from "./audio-studio-types.js";
export { verifyAudioStudioBinding } from "./audio-studio-contracts.js";

export type {
  AudioStudioBindingResolver,
  AudioStudioConsentBasis,
  AudioStudioFetch,
  AudioStudioManuscriptRights,
  AudioStudioRightsBasis,
  AudioStudioVoiceAdapterOptions,
  AudioStudioVoiceBinding,
  AudioStudioVoiceOperation,
  AudioStudioVoiceRightsRecord,
};

const TERMINAL_JOB_STATES = new Set(["completed", "failed"]);
const MAX_ARTIFACT_BYTES_ABSOLUTE = 2 * 1024 * 1024 * 1024;
const MAX_ENVELOPE_BYTES_ABSOLUTE = 16 * 1024 * 1024;

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new Error(code);
  }
  return candidate;
}


export class AudioStudioVoiceAdapter implements NarrationProviderAdapter {
  readonly providerId = AUDIO_STUDIO_PROVIDER_ID;
  readonly adapterVersion = AUDIO_STUDIO_ADAPTER_VERSION;
  readonly #baseUrl: URL;
  readonly #resolveBinding: AudioStudioBindingResolver;
  readonly #fetch: AudioStudioFetch;
  readonly #pollIntervalMs: number;
  readonly #maximumPollIntervalMs: number;
  readonly #healthCacheMs: number;
  readonly #maximumArtifactBytes: number;
  readonly #maximumEnvelopeBytes: number;
  readonly #preflightTimeoutMs: number;
  readonly #now: () => Date;
  #capability: AudioStudioCachedCapability | null = null;

  constructor(options: AudioStudioVoiceAdapterOptions) {
    this.#baseUrl = validateAudioStudioBaseUrl(options.baseUrl);
    this.#resolveBinding = options.resolveBinding;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#pollIntervalMs = options.pollIntervalMs ?? 125;
    this.#maximumPollIntervalMs = options.maximumPollIntervalMs ?? 1_000;
    this.#healthCacheMs = options.healthCacheMs ?? 30_000;
    this.#maximumArtifactBytes = boundedInteger(
      options.maximumArtifactBytes,
      256 * 1024 * 1024,
      1_024,
      MAX_ARTIFACT_BYTES_ABSOLUTE,
      "AUDIO_STUDIO_ARTIFACT_LIMIT_INVALID",
    );
    this.#maximumEnvelopeBytes = boundedInteger(
      options.maximumEnvelopeBytes,
      2 * 1024 * 1024,
      1_024,
      MAX_ENVELOPE_BYTES_ABSOLUTE,
      "AUDIO_STUDIO_ENVELOPE_LIMIT_INVALID",
    );
    this.#preflightTimeoutMs = boundedInteger(
      options.preflightTimeoutMs,
      15_000,
      1_000,
      120_000,
      "AUDIO_STUDIO_PREFLIGHT_TIMEOUT_INVALID",
    );
    this.#now = options.now ?? (() => new Date());
    const current = this.#now();
    if (!(current instanceof Date) || !Number.isFinite(current.getTime())) {
      throw new Error("AUDIO_STUDIO_CLOCK_INVALID");
    }
    if (
      !Number.isSafeInteger(this.#pollIntervalMs)
      || this.#pollIntervalMs < 10
      || !Number.isSafeInteger(this.#maximumPollIntervalMs)
      || this.#maximumPollIntervalMs < this.#pollIntervalMs
      || !Number.isSafeInteger(this.#healthCacheMs)
      || this.#healthCacheMs < 0
      || this.#healthCacheMs > 24 * 60 * 60_000
    ) {
      throw new Error("AUDIO_STUDIO_ADAPTER_TIMING_INVALID");
    }
  }

  async inspectCapabilities(
    context: Omit<ProviderExecutionContext, "timeoutMs">,
  ): Promise<ProviderCapabilitySnapshot> {
    const cached = this.#capability;
    const now = this.#now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new Error("AUDIO_STUDIO_CLOCK_INVALID");
    }
    if (cached && cached.expiresAt >= now.getTime()) return cached.snapshot;
    const response = await fetchAudioStudio(
      this.#fetch,
      new URL("health", this.#baseUrl),
      {
        method: "GET",
        headers: audioStudioHeaders(context.credential, {
          accept: "application/json",
        }),
      },
      this.#preflightTimeoutMs,
      context.signal,
    );
    const health = parseAudioStudioHealth(
      await parseAudioStudioEnvelope<unknown>(
        response,
        "AUDIO_STUDIO_HEALTH",
        this.#maximumEnvelopeBytes,
      ),
    );
    const snapshot = audioStudioCapabilitySnapshot(health, this.#now);
    this.#capability = {
      expiresAt: now.getTime() + this.#healthCacheMs,
      healthFingerprint: health.capabilityFingerprint,
      snapshot,
    };
    return snapshot;
  }

  async synthesise(
    request: SynthesisRequest,
    context: ProviderExecutionContext,
  ): Promise<SynthesisResult> {
    const binding = await this.#resolveBinding(request);
    verifyAudioStudioBinding(request, binding, this.#now);
    const capability = await this.inspectCapabilities(context);
    if (!capability.supportedFormats.includes(request.format)) {
      throw new Error("AUDIO_STUDIO_OUTPUT_FORMAT_UNAVAILABLE");
    }
    if (!capability.supportedSampleRatesHz.includes(request.sampleRateHz)) {
      throw new Error("AUDIO_STUDIO_SAMPLE_RATE_UNAVAILABLE");
    }
    if (request.text.length > capability.maximumInputCharacters) {
      throw new Error("AUDIO_STUDIO_CAPABILITY_INPUT_LIMIT_EXCEEDED");
    }
    if (
      request.metadata.expressivePerformanceRequired === "true"
      && !capability.features.includes("style-instructions")
    ) {
      throw new Error("AUDIO_STUDIO_EXPRESSIVE_STYLE_INSTRUCTIONS_REQUIRED");
    }

    const deadline = Date.now() + context.timeoutMs;
    const requestWithinDeadline = (
      url: URL,
      init: RequestInit,
    ): Promise<Response> => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("AUDIO_STUDIO_SYNTHESIS_TIMEOUT");
      return fetchAudioStudio(
        this.#fetch,
        url,
        init,
        remaining,
        context.signal,
      );
    };

    const submissionResponse = await requestWithinDeadline(
      new URL("v1/voice/renders", this.#baseUrl),
      {
        method: "POST",
        headers: audioStudioHeaders(context.credential, {
          accept: "application/json",
          "content-type": "application/json; charset=utf-8",
        }),
        body: JSON.stringify(audioStudioRenderPayload(request, binding)),
      },
    );
    const submission = parseAudioStudioSubmission(
      await parseAudioStudioEnvelope<unknown>(
        submissionResponse,
        "AUDIO_STUDIO_SUBMIT",
        this.#maximumEnvelopeBytes,
      ),
    );
    const statusUrl = resolveAudioStudioUrl(
      this.#baseUrl,
      submission.statusUrl,
      "AUDIO_STUDIO_STATUS_URL_CROSS_ORIGIN",
    );

    let status = null as ReturnType<typeof parseAudioStudioJobStatus> | null;
    let delayMs = this.#pollIntervalMs;
    while (!status || !TERMINAL_JOB_STATES.has(status.state)) {
      const statusResponse = await requestWithinDeadline(statusUrl, {
        method: "GET",
        headers: audioStudioHeaders(context.credential, {
          accept: "application/json",
        }),
      });
      status = parseAudioStudioJobStatus(
        await parseAudioStudioEnvelope<unknown>(
          statusResponse,
          "AUDIO_STUDIO_STATUS",
          this.#maximumEnvelopeBytes,
        ),
      );
      if (
        status.jobId !== submission.jobId
        || status.requestId !== request.requestId
      ) {
        throw new Error("AUDIO_STUDIO_JOB_CORRELATION_MISMATCH");
      }
      if (!TERMINAL_JOB_STATES.has(status.state)) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error("AUDIO_STUDIO_SYNTHESIS_TIMEOUT");
        await audioStudioSleep(Math.min(delayMs, remaining), context.signal);
        delayMs = Math.min(delayMs * 2, this.#maximumPollIntervalMs);
      }
    }

    if (status.state !== "completed") {
      throw new Error("AUDIO_STUDIO_RENDER_FAILED");
    }
    if (status.engineKey !== binding.engineKey) {
      throw new Error("AUDIO_STUDIO_ENGINE_CORRELATION_MISMATCH");
    }
    if (!status.engineLockFingerprint) {
      throw new Error("AUDIO_STUDIO_ENGINE_LOCK_EVIDENCE_MISSING");
    }
    if (
      !status.artifactUrls
      || status.artifactUrls.length === 0
      || status.artifactUrls.length !== status.artifacts.length
    ) {
      throw new Error("AUDIO_STUDIO_ARTIFACT_URLS_MISSING");
    }
    const audioArtifacts = status.artifacts
      .map((artifact, index) => ({ artifact, index }))
      .filter(({ artifact }) => artifact.contentType.startsWith("audio/"));
    if (audioArtifacts.length !== 1) {
      throw new Error("AUDIO_STUDIO_AUDIO_ARTIFACT_AMBIGUOUS");
    }
    const selected = audioArtifacts[0];
    if (!selected) throw new Error("AUDIO_STUDIO_ARTIFACT_MISSING");
    const artifact = selected.artifact;
    verifyAudioStudioExpressiveArtifactEvidence(request, artifact);
    const artifactUrlValue = status.artifactUrls[selected.index];
    if (!artifactUrlValue) throw new Error("AUDIO_STUDIO_ARTIFACT_MISSING");
    if (artifact.sizeBytes > this.#maximumArtifactBytes) {
      throw new Error("AUDIO_STUDIO_ARTIFACT_TOO_LARGE");
    }
    const artifactUrl = resolveAudioStudioUrl(
      this.#baseUrl,
      artifactUrlValue,
      "AUDIO_STUDIO_ARTIFACT_URL_CROSS_ORIGIN",
    );
    const artifactResponse = await requestWithinDeadline(artifactUrl, {
      method: "GET",
      headers: audioStudioHeaders(context.credential, { accept: "audio/*" }),
    });
    if (!artifactResponse.ok) {
      throw new Error("AUDIO_STUDIO_ARTIFACT_FETCH_FAILED");
    }
    const responseContentType = artifactResponse.headers.get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLocaleLowerCase("en-AU");
    const receiptContentType = artifact.contentType
      .split(";", 1)[0]
      ?.trim()
      .toLocaleLowerCase("en-AU");
    if (
      !receiptContentType
      || !receiptContentType.startsWith("audio/")
      || (responseContentType && responseContentType !== receiptContentType)
    ) {
      throw new Error("AUDIO_STUDIO_ARTIFACT_CONTENT_TYPE_INVALID");
    }
    const audio = await readAudioStudioResponseBytes(
      artifactResponse,
      this.#maximumArtifactBytes,
      "AUDIO_STUDIO_ARTIFACT",
    );
    if (audio.byteLength !== artifact.sizeBytes || audio.byteLength === 0) {
      throw new Error("AUDIO_STUDIO_ARTIFACT_SIZE_MISMATCH");
    }
    if (createHash("sha256").update(audio).digest("hex") !== artifact.sha256) {
      throw new Error("AUDIO_STUDIO_ARTIFACT_SHA_MISMATCH");
    }
    const contentType = receiptContentType;

    return {
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      requestId: request.requestId,
      idempotencyKey: request.idempotencyKey,
      providerRequestId: status.jobId,
      audio,
      contentType,
      usage: { inputCharacters: request.text.length },
      capabilityFingerprint: capability.fingerprint,
      generatedAt: status.completedAt ?? this.#now().toISOString(),
      provenance: {
        jobId: status.jobId,
        engineKey: status.engineKey,
        engineLockFingerprint: status.engineLockFingerprint,
        artifactSha256: artifact.sha256,
        artifactPath: artifact.path,
        ...(request.metadata.expressivePerformanceRequired === "true"
          ? {
              voiceProfileHash: request.voiceProfileHash!,
              expressivePerformancePlanFingerprint:
                request.metadata.expressivePerformancePlanFingerprint!,
              expressiveRoleBindingFingerprint:
                request.metadata.expressiveRoleBindingFingerprint!,
              expressivePerformanceAnchorHash:
                request.metadata.expressivePerformanceAnchorHash!,
              expressiveStyleInstructionsApplied: true,
              genericFallbackVoiceUsed: false,
            }
          : {}),
        zeroApiFee: true,
        offline: true,
        humanListeningApproval: false,
        storytellerTakeApproval: false,
        publicationAuthority: false,
      },
    };
  }
}

export function createAudioStudioVoiceAdapter(
  options: AudioStudioVoiceAdapterOptions,
): AudioStudioVoiceAdapter {
  return new AudioStudioVoiceAdapter(options);
}
