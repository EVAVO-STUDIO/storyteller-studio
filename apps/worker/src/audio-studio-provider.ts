import {
  AUDIO_STUDIO_PROVIDER_ID,
  AudioStudioVoiceAdapter,
  verifyAudioStudioBinding,
  type AudioStudioVoiceBinding,
} from "@evavo/storyteller-engine/audio-studio-adapter";
import type { SynthesisRequest } from "@evavo/storyteller-engine/provider-adapter";
import type { WorkerEnvironment } from "./configuration.js";

export const AUDIO_STUDIO_CREDENTIAL_BINDING_ID = AUDIO_STUDIO_PROVIDER_ID;

export interface AudioStudioWorkerProviderSummary {
  enabled: boolean;
  providerId: typeof AUDIO_STUDIO_PROVIDER_ID;
  bindingCount: number;
  projectScopedBindingCount: number;
  baseUrl: string | null;
  localOnly: true;
}

export interface ResolvedAudioStudioWorkerProvider {
  adapter: AudioStudioVoiceAdapter;
  summary: AudioStudioWorkerProviderSummary;
}

export interface ResolveAudioStudioWorkerProviderInput {
  workerEnabled: boolean;
  environment: WorkerEnvironment;
  credentialBindings: Readonly<Record<string, string>>;
  now?: () => Date;
  fetch?: typeof fetch;
}

interface ConfiguredAudioStudioBinding {
  voiceProfileId: string;
  voiceRevision: number;
  projectId?: string;
  binding: AudioStudioVoiceBinding;
}

const MAX_JSON_CONFIGURATION_BYTES = 512 * 1024;
const MAX_BINDINGS = 256;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function strictBoolean(
  value: string | undefined,
  fallback: boolean,
  code: string,
): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const normalised = value.trim().toLocaleLowerCase("en-AU");
  if (normalised === "true") return true;
  if (normalised === "false") return false;
  throw new Error(code);
}

function requiredText(value: string | undefined, code: string): string {
  const candidate = value?.trim() ?? "";
  if (
    !candidate
    || candidate.length > 4_096
    || /[\u0000-\u001f\u007f]/u.test(candidate)
  ) {
    throw new Error(code);
  }
  return candidate;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(code);
  }
  return parsed;
}

function parseJson(value: string | undefined, code: string): unknown {
  const source = value?.trim() ?? "";
  if (
    !source
    || Buffer.byteLength(source, "utf8") > MAX_JSON_CONFIGURATION_BYTES
  ) {
    throw new Error(code);
  }
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new Error(code);
  }
}

function validateLoopbackBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("AUDIO_STUDIO_WORKER_BASE_URL_INVALID");
  }
  if (
    url.protocol !== "http:"
    || !LOOPBACK_HOSTS.has(url.hostname)
    || url.username
    || url.password
    || url.search
    || url.hash
    || (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error("AUDIO_STUDIO_WORKER_LOOPBACK_URL_REQUIRED");
  }
  url.pathname = "/";
  return url.toString().replace(/\/$/u, "");
}

function validationRequest(
  row: ConfiguredAudioStudioBinding,
): SynthesisRequest {
  return {
    requestId: "audio_studio_configuration_validation",
    idempotencyKey: "0".repeat(64),
    projectId: row.projectId ?? "audio_studio_configuration",
    segmentId: "audio_studio_configuration_segment",
    immutableSourceHash: "0".repeat(64),
    text: "Audio Studio configuration validation.",
    voiceProfileId: row.voiceProfileId,
    voiceRevision: row.voiceRevision,
    direction: {
      segmentId: "audio_studio_configuration_segment",
      narrativeDistance: "balanced",
      pace: 1,
      intensity: 0.5,
      warmth: 0.5,
      restraint: 0.5,
      clarity: 1,
      pauseBeforeMs: 0,
      pauseAfterMs: 0,
      emotionalObjective: "Validate the configured voice binding.",
      subtext: "Configuration only.",
      notes: [],
    },
    pronunciations: [],
    mode: row.binding.commercialUse ? "production" : "calibration",
    format: "wav",
    sampleRateHz: 48_000,
    candidateIndex: 0,
    metadata: {},
  };
}

function bindingKey(
  voiceProfileId: string,
  voiceRevision: number,
  projectId?: string,
): string {
  return `${projectId ?? "*"}\u0000${voiceProfileId}\u0000${voiceRevision}`;
}

function parseBindings(
  value: string | undefined,
  now: () => Date,
): readonly ConfiguredAudioStudioBinding[] {
  const parsed = parseJson(value, "AUDIO_STUDIO_WORKER_BINDINGS_INVALID");
  if (
    !Array.isArray(parsed)
    || parsed.length === 0
    || parsed.length > MAX_BINDINGS
  ) {
    throw new Error("AUDIO_STUDIO_WORKER_BINDINGS_INVALID");
  }
  const keys = new Set<string>();
  return Object.freeze(parsed.map((item) => {
    if (!isRecord(item) || !isRecord(item.binding)) {
      throw new Error("AUDIO_STUDIO_WORKER_BINDING_INVALID");
    }
    const voiceProfileId = item.voiceProfileId;
    const voiceRevision = item.voiceRevision;
    const projectId = item.projectId;
    if (typeof voiceProfileId !== "string" || !SAFE_IDENTIFIER.test(voiceProfileId)) {
      throw new Error("AUDIO_STUDIO_WORKER_VOICE_PROFILE_ID_INVALID");
    }
    if (
      !Number.isSafeInteger(voiceRevision)
      || (voiceRevision as number) < 1
      || (voiceRevision as number) > 1_000_000
    ) {
      throw new Error("AUDIO_STUDIO_WORKER_VOICE_REVISION_INVALID");
    }
    if (
      projectId !== undefined
      && (typeof projectId !== "string" || !SAFE_IDENTIFIER.test(projectId))
    ) {
      throw new Error("AUDIO_STUDIO_WORKER_PROJECT_ID_INVALID");
    }
    const row: ConfiguredAudioStudioBinding = {
      voiceProfileId,
      voiceRevision: voiceRevision as number,
      ...(typeof projectId === "string" ? { projectId } : {}),
      binding: item.binding as unknown as AudioStudioVoiceBinding,
    };
    const key = bindingKey(row.voiceProfileId, row.voiceRevision, row.projectId);
    if (keys.has(key)) throw new Error("AUDIO_STUDIO_WORKER_BINDING_DUPLICATE");
    keys.add(key);
    verifyAudioStudioBinding(validationRequest(row), row.binding, now);
    return Object.freeze(row);
  }));
}

function createBindingResolver(
  rows: readonly ConfiguredAudioStudioBinding[],
): (request: SynthesisRequest) => AudioStudioVoiceBinding {
  const bindings = new Map<string, AudioStudioVoiceBinding>();
  for (const row of rows) {
    bindings.set(
      bindingKey(row.voiceProfileId, row.voiceRevision, row.projectId),
      row.binding,
    );
  }
  return (request) => {
    const projectBinding = bindings.get(bindingKey(
      request.voiceProfileId,
      request.voiceRevision,
      request.projectId,
    ));
    const sharedBinding = bindings.get(bindingKey(
      request.voiceProfileId,
      request.voiceRevision,
    ));
    const binding = projectBinding ?? sharedBinding;
    if (!binding) throw new Error("AUDIO_STUDIO_WORKER_VOICE_BINDING_NOT_FOUND");
    return binding;
  };
}

function disabledSummary(): AudioStudioWorkerProviderSummary {
  return Object.freeze({
    enabled: false,
    providerId: AUDIO_STUDIO_PROVIDER_ID,
    bindingCount: 0,
    projectScopedBindingCount: 0,
    baseUrl: null,
    localOnly: true,
  });
}

export function resolveAudioStudioWorkerProvider(
  input: ResolveAudioStudioWorkerProviderInput,
): ResolvedAudioStudioWorkerProvider | null {
  if (!input.workerEnabled) return null;
  const enabled = strictBoolean(
    input.environment.STORYTELLER_AUDIO_STUDIO_ENABLED,
    false,
    "AUDIO_STUDIO_WORKER_ENABLED_INVALID",
  );
  if (!enabled) return null;
  if (!input.credentialBindings[AUDIO_STUDIO_CREDENTIAL_BINDING_ID]) {
    throw new Error("AUDIO_STUDIO_WORKER_CREDENTIAL_BINDING_REQUIRED");
  }

  const now = input.now ?? (() => new Date());
  const bindings = parseBindings(
    input.environment.STORYTELLER_AUDIO_STUDIO_VOICE_BINDINGS,
    now,
  );
  const baseUrl = validateLoopbackBaseUrl(requiredText(
    input.environment.STORYTELLER_AUDIO_STUDIO_BASE_URL,
    "AUDIO_STUDIO_WORKER_BASE_URL_REQUIRED",
  ));
  const adapter = new AudioStudioVoiceAdapter({
    baseUrl,
    resolveBinding: createBindingResolver(bindings),
    pollIntervalMs: boundedInteger(
      input.environment.STORYTELLER_AUDIO_STUDIO_POLL_INTERVAL_MS,
      125,
      10,
      60_000,
      "AUDIO_STUDIO_WORKER_POLL_INTERVAL_INVALID",
    ),
    maximumPollIntervalMs: boundedInteger(
      input.environment.STORYTELLER_AUDIO_STUDIO_MAXIMUM_POLL_INTERVAL_MS,
      1_000,
      10,
      60_000,
      "AUDIO_STUDIO_WORKER_MAXIMUM_POLL_INTERVAL_INVALID",
    ),
    healthCacheMs: boundedInteger(
      input.environment.STORYTELLER_AUDIO_STUDIO_HEALTH_CACHE_MS,
      30_000,
      0,
      24 * 60 * 60_000,
      "AUDIO_STUDIO_WORKER_HEALTH_CACHE_INVALID",
    ),
    maximumArtifactBytes: boundedInteger(
      input.environment.STORYTELLER_AUDIO_STUDIO_MAX_ARTIFACT_BYTES,
      256 * 1024 * 1024,
      1_024,
      2 * 1024 * 1024 * 1024,
      "AUDIO_STUDIO_WORKER_MAX_ARTIFACT_BYTES_INVALID",
    ),
    maximumEnvelopeBytes: boundedInteger(
      input.environment.STORYTELLER_AUDIO_STUDIO_MAX_ENVELOPE_BYTES,
      2 * 1024 * 1024,
      1_024,
      16 * 1024 * 1024,
      "AUDIO_STUDIO_WORKER_MAX_ENVELOPE_BYTES_INVALID",
    ),
    preflightTimeoutMs: boundedInteger(
      input.environment.STORYTELLER_AUDIO_STUDIO_PREFLIGHT_TIMEOUT_MS,
      15_000,
      1_000,
      120_000,
      "AUDIO_STUDIO_WORKER_PREFLIGHT_TIMEOUT_INVALID",
    ),
    now,
    ...(input.fetch ? { fetch: input.fetch } : {}),
  });

  return Object.freeze({
    adapter,
    summary: Object.freeze({
      enabled: true,
      providerId: AUDIO_STUDIO_PROVIDER_ID,
      bindingCount: bindings.length,
      projectScopedBindingCount: bindings.filter((row) => Boolean(row.projectId)).length,
      baseUrl,
      localOnly: true,
    }),
  });
}

export function audioStudioWorkerProviderSummary(
  provider: ResolvedAudioStudioWorkerProvider | null,
): AudioStudioWorkerProviderSummary {
  return provider?.summary ?? disabledSummary();
}
