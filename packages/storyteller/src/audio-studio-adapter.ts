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
} from "./audio-studio-contracts.js";
import {
  audioStudioHeaders,
  audioStudioSleep,
  fetchAudioStudio,
  parseAudioStudioEnvelope,
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

export class AudioStudioVoiceAdapter implements NarrationProviderAdapter {
  readonly providerId = AUDIO_STUDIO_PROVIDER_ID;
  readonly adapterVersion = AUDIO_STUDIO_ADAPTER_VERSION;
  readonly #baseUrl: URL;
  readonly #resolveBinding: AudioStudioBindingResolver;
  readonly #fetch: AudioStudioFetch;
  readonly #pollIntervalMs: number;
  readonly #maximumPollIntervalMs: number;
  readonly #healthCacheMs: number;
  #capability: AudioStudioCachedCapability | null = null;

  constructor(options: AudioStudioVoiceAdapterOptions) {
    this.#baseUrl = validateAudioStudioBaseUrl(options.baseUrl);
    this.#resolveBinding = options.resolveBinding;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#pollIntervalMs = options.pollIntervalMs ?? 125;
    this.#maximumPollIntervalMs = options.maximumPollIntervalMs ?? 1_000;
    this.#healthCacheMs = options.healthCacheMs ?? 30_000;
    if (
      !Number.isSafeInteger(this.#pollIntervalMs)
      || this.#pollIntervalMs < 10
      || !Number.isSafeInteger(this.#maximumPollIntervalMs)
      || this.#maximumPollIntervalMs < this.#pollIntervalMs
      || !Number.isSafeInteger(this.#healthCacheMs)
      || this.#healthCacheMs < 0
    ) {
      throw new Error("AUDIO_STUDIO_ADAPTER_TIMING_INVALID");
    }
  }

  async inspectCapabilities(
    context: Omit<ProviderExecutionContext, "timeoutMs">,
  ): Promise<ProviderCapabilitySnapshot> {
    const cached = this.#capability;
    if (cached && cached.expiresAt >= Date.now()) return cached.snapshot;
    const response = await fetchAudioStudio(
      this.#fetch,
      new URL("health", this.#baseUrl),
      {
        method: "GET",
        headers: audioStudioHeaders(context.credential, {
          accept: "application/json",
        }),
      },
      15_000,
      context.signal,
    );
    const health = parseAudioStudioHealth(
      await parseAudioStudioEnvelope<unknown>(response, "AUDIO_STUDIO_HEALTH"),
    );
    const snapshot = audioStudioCapabilitySnapshot(health);
    this.#capability = {
      expiresAt: Date.now() + this.#healthCacheMs,
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
    verifyAudioStudioBinding(request, binding);
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
    if (
      !status.artifactUrls
      || status.artifactUrls.length === 0
      || status.artifactUrls.length !== status.artifacts.length
    ) {
      throw new Error("AUDIO_STUDIO_ARTIFACT_URLS_MISSING");
    }
    const artifact = status.artifacts[0];
    const artifactUrlValue = status.artifactUrls[0];
    if (!artifact || !artifactUrlValue) {
      throw new Error("AUDIO_STUDIO_ARTIFACT_MISSING");
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
    const audio = new Uint8Array(await artifactResponse.arrayBuffer());
    if (audio.byteLength !== artifact.sizeBytes || audio.byteLength === 0) {
      throw new Error("AUDIO_STUDIO_ARTIFACT_SIZE_MISMATCH");
    }
    if (createHash("sha256").update(audio).digest("hex") !== artifact.sha256) {
      throw new Error("AUDIO_STUDIO_ARTIFACT_SHA_MISMATCH");
    }
    const contentType = artifactResponse.headers.get("content-type")
      ?? artifact.contentType;
    if (!contentType.startsWith("audio/")) {
      throw new Error("AUDIO_STUDIO_ARTIFACT_CONTENT_TYPE_INVALID");
    }

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
      generatedAt: status.completedAt ?? new Date().toISOString(),
      provenance: {
        jobId: status.jobId,
        engineKey: status.engineKey,
        engineLockFingerprint: status.engineLockFingerprint ?? "not-reported",
        artifactSha256: artifact.sha256,
        artifactPath: artifact.path,
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
