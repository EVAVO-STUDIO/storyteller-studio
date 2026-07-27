import {
  ELEVENLABS_PROVIDER_ID,
  ElevenLabsNarrationAdapter,
  type ElevenLabsAdapterConfiguration,
  type ElevenLabsDataPolicy,
  type ElevenLabsModelPolicy,
  type ElevenLabsPronunciationDictionaryBinding,
  type ElevenLabsRetentionMode,
  type ElevenLabsTextNormalisation,
  type ElevenLabsVoiceBinding,
} from "@evavo/storyteller-engine/elevenlabs-adapter";
import type { WorkerEnvironment } from "./configuration.js";

export const ELEVENLABS_CREDENTIAL_BINDING_ID = ELEVENLABS_PROVIDER_ID;

export interface ElevenLabsWorkerProviderSummary {
  enabled: boolean;
  providerId: typeof ELEVENLABS_PROVIDER_ID;
  modelPolicyCount: number;
  voiceBindingCount: number;
  pronunciationDictionaryCount: number;
  retentionMode: ElevenLabsRetentionMode | "none";
  zeroRetentionRequested: boolean;
}

export interface ResolvedElevenLabsWorkerProvider {
  adapter: ElevenLabsNarrationAdapter;
  summary: ElevenLabsWorkerProviderSummary;
}

export interface ResolveElevenLabsWorkerProviderInput {
  workerEnabled: boolean;
  environment: WorkerEnvironment;
  credentialBindings: Readonly<Record<string, string>>;
  now?: () => Date;
  fetch?: typeof fetch;
}

const MAX_JSON_CONFIGURATION_BYTES = 512 * 1024;
const TEXT_NORMALISATION = new Set<ElevenLabsTextNormalisation>(["auto", "on", "off"]);

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
  if (!candidate || candidate.length > 240 || /[\u0000-\u001f\u007f]/u.test(candidate)) {
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
  if (!source || Buffer.byteLength(source, "utf8") > MAX_JSON_CONFIGURATION_BYTES) {
    throw new Error(code);
  }
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new Error(code);
  }
}

function parseObject(value: string | undefined, code: string): Record<string, unknown> {
  const parsed = parseJson(value, code);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(code);
  return parsed as Record<string, unknown>;
}

function parseObjectArray<T>(value: string | undefined, code: string): readonly T[] {
  const parsed = parseJson(value, code);
  if (
    !Array.isArray(parsed)
    || parsed.some((item) => !item || typeof item !== "object" || Array.isArray(item))
  ) {
    throw new Error(code);
  }
  return parsed as readonly T[];
}

function validateModelPolicyShape(
  policies: readonly ElevenLabsModelPolicy[],
): readonly ElevenLabsModelPolicy[] {
  if (
    policies.some((policy) =>
      !policy.pricing
      || typeof policy.pricing !== "object"
      || Array.isArray(policy.pricing)
    )
  ) {
    throw new Error("ELEVENLABS_WORKER_MODEL_POLICIES_INVALID");
  }
  return policies;
}

function validateDataPolicyShape(value: Record<string, unknown>): ElevenLabsDataPolicy {
  if (
    (value.retentionMode !== "standard" && value.retentionMode !== "zero-retention-enterprise")
    || typeof value.storesInputs !== "boolean"
    || typeof value.trainsOnCustomerData !== "boolean"
    || typeof value.policyVersion !== "string"
  ) {
    throw new Error("ELEVENLABS_WORKER_DATA_POLICY_INVALID");
  }
  return value as unknown as ElevenLabsDataPolicy;
}

function disabledSummary(): ElevenLabsWorkerProviderSummary {
  return Object.freeze({
    enabled: false,
    providerId: ELEVENLABS_PROVIDER_ID,
    modelPolicyCount: 0,
    voiceBindingCount: 0,
    pronunciationDictionaryCount: 0,
    retentionMode: "none",
    zeroRetentionRequested: false,
  });
}

export function resolveElevenLabsWorkerProvider(
  input: ResolveElevenLabsWorkerProviderInput,
): ResolvedElevenLabsWorkerProvider | null {
  if (!input.workerEnabled) return null;

  const enabled = strictBoolean(
    input.environment.STORYTELLER_ELEVENLABS_ENABLED,
    false,
    "ELEVENLABS_WORKER_ENABLED_INVALID",
  );
  if (!enabled) return null;

  if (!input.credentialBindings[ELEVENLABS_CREDENTIAL_BINDING_ID]) {
    throw new Error("ELEVENLABS_WORKER_CREDENTIAL_BINDING_REQUIRED");
  }

  const modelPolicies = validateModelPolicyShape(
    parseObjectArray<ElevenLabsModelPolicy>(
      input.environment.STORYTELLER_ELEVENLABS_MODEL_POLICIES,
      "ELEVENLABS_WORKER_MODEL_POLICIES_INVALID",
    ),
  );
  const voiceBindings = parseObjectArray<ElevenLabsVoiceBinding>(
    input.environment.STORYTELLER_ELEVENLABS_VOICE_BINDINGS,
    "ELEVENLABS_WORKER_VOICE_BINDINGS_INVALID",
  );
  const pronunciationDictionaries = input.environment
    .STORYTELLER_ELEVENLABS_PRONUNCIATION_DICTIONARIES?.trim()
    ? parseObjectArray<ElevenLabsPronunciationDictionaryBinding>(
        input.environment.STORYTELLER_ELEVENLABS_PRONUNCIATION_DICTIONARIES,
        "ELEVENLABS_WORKER_PRONUNCIATION_DICTIONARIES_INVALID",
      )
    : Object.freeze([]);
  const dataPolicy = validateDataPolicyShape(parseObject(
    input.environment.STORYTELLER_ELEVENLABS_DATA_POLICY,
    "ELEVENLABS_WORKER_DATA_POLICY_INVALID",
  ));

  const textNormalisationValue = input.environment.STORYTELLER_ELEVENLABS_TEXT_NORMALISATION
    ?.trim()
    .toLocaleLowerCase("en-AU") ?? "auto";
  if (!TEXT_NORMALISATION.has(textNormalisationValue as ElevenLabsTextNormalisation)) {
    throw new Error("ELEVENLABS_WORKER_TEXT_NORMALISATION_INVALID");
  }
  const textNormalisation = textNormalisationValue as ElevenLabsTextNormalisation;
  const outputBitrateKbps = boundedInteger(
    input.environment.STORYTELLER_ELEVENLABS_OUTPUT_BITRATE_KBPS,
    192,
    128,
    192,
    "ELEVENLABS_WORKER_OUTPUT_BITRATE_INVALID",
  );
  if (outputBitrateKbps !== 128 && outputBitrateKbps !== 192) {
    throw new Error("ELEVENLABS_WORKER_OUTPUT_BITRATE_INVALID");
  }

  const configuration: ElevenLabsAdapterConfiguration = {
    adapterVersion: requiredText(
      input.environment.STORYTELLER_ELEVENLABS_ADAPTER_VERSION,
      "ELEVENLABS_WORKER_ADAPTER_VERSION_REQUIRED",
    ),
    modelPolicies,
    voiceBindings,
    pronunciationDictionaries,
    dataPolicy,
    textNormalisation,
    outputBitrateKbps,
    maximumResponseBytes: boundedInteger(
      input.environment.STORYTELLER_ELEVENLABS_MAX_RESPONSE_BYTES,
      128 * 1024 * 1024,
      1_024,
      512 * 1024 * 1024,
      "ELEVENLABS_WORKER_MAX_RESPONSE_BYTES_INVALID",
    ),
    preflightTimeoutMs: boundedInteger(
      input.environment.STORYTELLER_ELEVENLABS_PREFLIGHT_TIMEOUT_MS,
      15_000,
      1_000,
      120_000,
      "ELEVENLABS_WORKER_PREFLIGHT_TIMEOUT_INVALID",
    ),
    allowV3Production: strictBoolean(
      input.environment.STORYTELLER_ELEVENLABS_ALLOW_V3_PRODUCTION,
      false,
      "ELEVENLABS_WORKER_V3_PRODUCTION_FLAG_INVALID",
    ),
    ...(input.now ? { now: input.now } : {}),
    ...(input.fetch ? { fetch: input.fetch } : {}),
  };

  const adapter = new ElevenLabsNarrationAdapter(configuration);
  const summary = Object.freeze({
    enabled: true,
    providerId: ELEVENLABS_PROVIDER_ID,
    modelPolicyCount: modelPolicies.length,
    voiceBindingCount: voiceBindings.length,
    pronunciationDictionaryCount: pronunciationDictionaries.length,
    retentionMode: dataPolicy.retentionMode,
    zeroRetentionRequested: dataPolicy.retentionMode === "zero-retention-enterprise",
  } satisfies ElevenLabsWorkerProviderSummary);

  return Object.freeze({ adapter, summary });
}

export function elevenLabsWorkerProviderSummary(
  provider: ResolvedElevenLabsWorkerProvider | null,
): ElevenLabsWorkerProviderSummary {
  return provider?.summary ?? disabledSummary();
}
