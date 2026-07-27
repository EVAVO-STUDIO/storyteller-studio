import {
  createCapabilitySnapshot,
  type CanonicalPronunciation,
  type NarrationProviderAdapter,
  type ProviderAudioFormat,
  type ProviderCapabilitySnapshot,
  type ProviderExecutionContext,
  type ProviderExecutionMode,
  type SynthesisRequest,
  type SynthesisResult,
} from "./provider-adapter.js";
import { stableHash, type PerformanceDirection } from "./index.js";

export const ELEVENLABS_PROVIDER_ID = "elevenlabs" as const;
export const ELEVENLABS_API_BASE_URL = "https://api.elevenlabs.io" as const;

export type ElevenLabsModelId = "eleven_multilingual_v2" | "eleven_v3";
export type ElevenLabsRetentionMode = "standard" | "zero-retention-enterprise";
export type ElevenLabsTextNormalisation = "auto" | "on" | "off";

export interface ElevenLabsPricingSnapshot {
  modelId: ElevenLabsModelId;
  currency: string;
  microsPerThousandCharacters: number;
  effectiveFrom: string;
  expiresAt: string;
  sourceReference: string;
  fingerprint: string;
}

export interface ElevenLabsModelPolicy {
  mode: ProviderExecutionMode;
  modelId: ElevenLabsModelId;
  maximumInputCharacters: number;
  pricing: ElevenLabsPricingSnapshot;
}

export interface ElevenLabsVoiceBinding {
  voiceProfileId: string;
  voiceRevision: number;
  voiceId: string;
  sourceKind: "premade";
  licenceEvidenceId: string;
  commercialUseApproved: true;
  allowedModes: readonly ProviderExecutionMode[];
}

export interface ElevenLabsPronunciationDictionaryBinding {
  writtenForm: string;
  approvedRevision: number;
  pronunciationDictionaryId: string;
  versionId: string;
}

export interface ElevenLabsDataPolicy {
  retentionMode: ElevenLabsRetentionMode;
  storesInputs: boolean;
  trainsOnCustomerData: boolean;
  policyVersion: string;
}

export interface ElevenLabsAdapterConfiguration {
  adapterVersion: string;
  modelPolicies: readonly ElevenLabsModelPolicy[];
  voiceBindings: readonly ElevenLabsVoiceBinding[];
  pronunciationDictionaries?: readonly ElevenLabsPronunciationDictionaryBinding[];
  dataPolicy: ElevenLabsDataPolicy;
  textNormalisation?: ElevenLabsTextNormalisation;
  outputBitrateKbps?: 128 | 192;
  maximumResponseBytes?: number;
  preflightTimeoutMs?: number;
  allowV3Production?: boolean;
  now?: () => Date;
  fetch?: typeof fetch;
}

export interface ElevenLabsDirectionSettings {
  stability: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
  speed?: number;
}

interface ElevenLabsModelsResponseItem {
  model_id?: unknown;
  can_do_text_to_speech?: unknown;
  max_characters_request?: unknown;
}

interface ElevenLabsVoiceResponse {
  voice_id?: unknown;
  category?: unknown;
}

interface ElevenLabsAlignmentResponse {
  characters?: unknown;
  character_start_times_seconds?: unknown;
  character_end_times_seconds?: unknown;
}

interface ElevenLabsTimestampResponse {
  audio_base64?: unknown;
  alignment?: unknown;
}

interface ResolvedGenerationPolicy {
  policy: ElevenLabsModelPolicy;
  voice: ElevenLabsVoiceBinding;
  outputFormat: string;
  settings: ElevenLabsDirectionSettings;
  dictionaries: readonly Readonly<{
    pronunciation_dictionary_id: string;
    version_id: string;
  }>[];
  seed: number;
}

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const VOICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/u;
const CURRENCY_PATTERN = /^[A-Z]{3}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SOURCE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,239}$/u;
const MAX_RESPONSE_BYTES_DEFAULT = 128 * 1024 * 1024;
const MAX_RESPONSE_BYTES_ABSOLUTE = 512 * 1024 * 1024;
const MAX_PREFLIGHT_BYTES = 4 * 1024 * 1024;
const MAX_DICTIONARIES_PER_REQUEST = 3;
const MODEL_LIMITS: Readonly<Record<ElevenLabsModelId, number>> = Object.freeze({
  eleven_multilingual_v2: 10_000,
  eleven_v3: 5_000,
});
const MODEL_IDS: ReadonlySet<ElevenLabsModelId> = new Set([
  "eleven_multilingual_v2",
  "eleven_v3",
]);
const EXECUTION_MODES: readonly ProviderExecutionMode[] = [
  "preview",
  "calibration",
  "production",
];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value: number): number {
  return Number(value.toFixed(3));
}

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new Error(code);
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(new Date(value).getTime())) throw new Error(code);
  return value;
}

function requireBoundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(code);
  }
  return value;
}

function canonicalWrittenForm(value: string): string {
  const canonical = value.trim().toLocaleLowerCase("en-AU");
  if (!canonical || canonical.length > 300) {
    throw new Error("ELEVENLABS_DICTIONARY_WRITTEN_FORM_INVALID");
  }
  return canonical;
}

export function createElevenLabsPricingSnapshot(
  input: Omit<ElevenLabsPricingSnapshot, "fingerprint">,
): ElevenLabsPricingSnapshot {
  if (!MODEL_IDS.has(input.modelId)) throw new Error("ELEVENLABS_PRICING_MODEL_INVALID");
  if (!CURRENCY_PATTERN.test(input.currency)) throw new Error("ELEVENLABS_PRICING_CURRENCY_INVALID");
  requireBoundedInteger(
    input.microsPerThousandCharacters,
    1,
    Number.MAX_SAFE_INTEGER,
    "ELEVENLABS_PRICING_RATE_INVALID",
  );
  requireDate(input.effectiveFrom, "ELEVENLABS_PRICING_EFFECTIVE_FROM_INVALID");
  requireDate(input.expiresAt, "ELEVENLABS_PRICING_EXPIRY_INVALID");
  if (Date.parse(input.expiresAt) <= Date.parse(input.effectiveFrom)) {
    throw new Error("ELEVENLABS_PRICING_DATE_ORDER_INVALID");
  }
  if (!SOURCE_REFERENCE_PATTERN.test(input.sourceReference)) {
    throw new Error("ELEVENLABS_PRICING_SOURCE_INVALID");
  }
  return Object.freeze({
    ...input,
    fingerprint: stableHash(input),
  });
}

export function assertElevenLabsPricingSnapshot(
  snapshot: ElevenLabsPricingSnapshot,
  now = new Date(),
): void {
  const expected = createElevenLabsPricingSnapshot({
    modelId: snapshot.modelId,
    currency: snapshot.currency,
    microsPerThousandCharacters: snapshot.microsPerThousandCharacters,
    effectiveFrom: snapshot.effectiveFrom,
    expiresAt: snapshot.expiresAt,
    sourceReference: snapshot.sourceReference,
  });
  if (!HASH_PATTERN.test(snapshot.fingerprint) || snapshot.fingerprint !== expected.fingerprint) {
    throw new Error("ELEVENLABS_PRICING_FINGERPRINT_INVALID");
  }
  if (now.getTime() < Date.parse(snapshot.effectiveFrom)) {
    throw new Error("ELEVENLABS_PRICING_NOT_EFFECTIVE");
  }
  if (now.getTime() >= Date.parse(snapshot.expiresAt)) {
    throw new Error("ELEVENLABS_PRICING_EXPIRED");
  }
}

export function compileElevenLabsDirectionSettings(
  direction: PerformanceDirection,
  modelId: ElevenLabsModelId,
): ElevenLabsDirectionSettings {
  const stability = modelId === "eleven_v3"
    ? direction.restraint >= 0.82
      ? 1
      : direction.intensity >= 0.66 && direction.restraint <= 0.54
        ? 0
        : 0.5
    : rounded(clamp(
        0.34 + direction.restraint * 0.48 - direction.intensity * 0.12,
        0.28,
        0.88,
      ));

  if (modelId === "eleven_v3") return Object.freeze({ stability });
  return Object.freeze({
    stability,
    similarity_boost: rounded(clamp(0.72 + direction.clarity * 0.18, 0.75, 0.9)),
    style: 0,
    use_speaker_boost: true,
    speed: rounded(clamp(direction.pace, 0.7, 1.2)),
  });
}

function validateConfiguration(configuration: ElevenLabsAdapterConfiguration): void {
  if (!SEMVER_PATTERN.test(configuration.adapterVersion)) {
    throw new Error("ELEVENLABS_ADAPTER_VERSION_INVALID");
  }
  if (!Array.isArray(configuration.modelPolicies) || configuration.modelPolicies.length !== 3) {
    throw new Error("ELEVENLABS_MODEL_POLICIES_INCOMPLETE");
  }
  const modes = new Set<ProviderExecutionMode>();
  for (const policy of configuration.modelPolicies) {
    if (!EXECUTION_MODES.includes(policy.mode)) throw new Error("ELEVENLABS_MODEL_MODE_INVALID");
    if (modes.has(policy.mode)) throw new Error("ELEVENLABS_MODEL_MODE_DUPLICATE");
    modes.add(policy.mode);
    if (!MODEL_IDS.has(policy.modelId)) throw new Error("ELEVENLABS_MODEL_ID_INVALID");
    requireBoundedInteger(
      policy.maximumInputCharacters,
      1,
      MODEL_LIMITS[policy.modelId],
      "ELEVENLABS_MODEL_CHARACTER_LIMIT_INVALID",
    );
    if (policy.pricing.modelId !== policy.modelId) {
      throw new Error("ELEVENLABS_PRICING_MODEL_MISMATCH");
    }
    assertElevenLabsPricingSnapshot(policy.pricing, configuration.now?.() ?? new Date());
    if (
      policy.mode === "production"
      && policy.modelId === "eleven_v3"
      && configuration.allowV3Production !== true
    ) {
      throw new Error("ELEVENLABS_V3_PRODUCTION_NOT_APPROVED");
    }
  }

  if (!Array.isArray(configuration.voiceBindings) || configuration.voiceBindings.length === 0) {
    throw new Error("ELEVENLABS_VOICE_BINDINGS_REQUIRED");
  }
  const voiceProfiles = new Set<string>();
  for (const binding of configuration.voiceBindings) {
    requireIdentifier(binding.voiceProfileId, "ELEVENLABS_VOICE_PROFILE_ID_INVALID");
    requireBoundedInteger(
      binding.voiceRevision,
      1,
      1_000_000,
      "ELEVENLABS_VOICE_REVISION_INVALID",
    );
    if (!VOICE_ID_PATTERN.test(binding.voiceId)) throw new Error("ELEVENLABS_VOICE_ID_INVALID");
    if (binding.sourceKind !== "premade") throw new Error("ELEVENLABS_NON_STOCK_VOICE_PROHIBITED");
    requireIdentifier(binding.licenceEvidenceId, "ELEVENLABS_VOICE_LICENCE_ID_INVALID");
    if (binding.commercialUseApproved !== true) {
      throw new Error("ELEVENLABS_VOICE_COMMERCIAL_USE_NOT_APPROVED");
    }
    if (voiceProfiles.has(binding.voiceProfileId)) {
      throw new Error("ELEVENLABS_VOICE_PROFILE_DUPLICATE");
    }
    voiceProfiles.add(binding.voiceProfileId);
    if (
      !Array.isArray(binding.allowedModes)
      || binding.allowedModes.length === 0
      || new Set(binding.allowedModes).size !== binding.allowedModes.length
      || binding.allowedModes.some((mode) => !EXECUTION_MODES.includes(mode))
    ) {
      throw new Error("ELEVENLABS_VOICE_ALLOWED_MODES_INVALID");
    }
  }

  const dictionaries = configuration.pronunciationDictionaries ?? [];
  const dictionaryTerms = new Set<string>();
  for (const dictionary of dictionaries) {
    const term = canonicalWrittenForm(dictionary.writtenForm);
    if (dictionaryTerms.has(term)) throw new Error("ELEVENLABS_DICTIONARY_TERM_DUPLICATE");
    dictionaryTerms.add(term);
    requireBoundedInteger(
      dictionary.approvedRevision,
      1,
      1_000_000,
      "ELEVENLABS_DICTIONARY_REVISION_INVALID",
    );
    requireIdentifier(
      dictionary.pronunciationDictionaryId,
      "ELEVENLABS_DICTIONARY_ID_INVALID",
    );
    requireIdentifier(dictionary.versionId, "ELEVENLABS_DICTIONARY_VERSION_INVALID");
  }

  const dataPolicy = configuration.dataPolicy;
  if (!dataPolicy.policyVersion.trim() || dataPolicy.policyVersion.length > 240) {
    throw new Error("ELEVENLABS_DATA_POLICY_VERSION_INVALID");
  }
  if (
    dataPolicy.retentionMode === "zero-retention-enterprise"
    && dataPolicy.storesInputs
  ) {
    throw new Error("ELEVENLABS_ZERO_RETENTION_POLICY_CONFLICT");
  }
  if (
    dataPolicy.retentionMode !== "standard"
    && dataPolicy.retentionMode !== "zero-retention-enterprise"
  ) {
    throw new Error("ELEVENLABS_RETENTION_MODE_INVALID");
  }
  if (configuration.textNormalisation && !["auto", "on", "off"].includes(configuration.textNormalisation)) {
    throw new Error("ELEVENLABS_TEXT_NORMALISATION_INVALID");
  }
  requireBoundedInteger(
    configuration.maximumResponseBytes ?? MAX_RESPONSE_BYTES_DEFAULT,
    1_024,
    MAX_RESPONSE_BYTES_ABSOLUTE,
    "ELEVENLABS_RESPONSE_LIMIT_INVALID",
  );
  requireBoundedInteger(
    configuration.preflightTimeoutMs ?? 15_000,
    1_000,
    120_000,
    "ELEVENLABS_PREFLIGHT_TIMEOUT_INVALID",
  );
}

function createAbortScope(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
): Readonly<{ signal: AbortSignal; dispose(): void }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("ELEVENLABS_REQUEST_TIMEOUT"));
  }, timeoutMs);
  timeout.unref?.();
  const onAbort = () => controller.abort(
    externalSignal?.reason ?? new Error("ELEVENLABS_REQUEST_ABORTED"),
  );
  externalSignal?.addEventListener("abort", onAbort, { once: true });
  if (externalSignal?.aborted) onAbort();
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", onAbort);
    },
  };
}

async function readBoundedJson(
  response: Response,
  maximumBytes: number,
  code: string,
): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared) {
    const parsed = Number(declared);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximumBytes) {
      throw new Error(`${code}_TOO_LARGE`);
    }
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) throw new Error(`${code}_TOO_LARGE`);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error(`${code}_INVALID`);
  }
}

function responseCode(response: Response): string {
  return `ELEVENLABS_HTTP_${response.status}`;
}

function strictBase64(value: unknown, maximumBytes: number): Uint8Array {
  if (typeof value !== "string" || value.length === 0 || value.length > maximumBytes * 2) {
    throw new Error("ELEVENLABS_AUDIO_BASE64_INVALID");
  }
  const normalised = value.replace(/\s+/gu, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(normalised) || normalised.length % 4 !== 0) {
    throw new Error("ELEVENLABS_AUDIO_BASE64_INVALID");
  }
  const buffer = Buffer.from(normalised, "base64");
  if (buffer.byteLength === 0 || buffer.byteLength > maximumBytes) {
    throw new Error("ELEVENLABS_AUDIO_SIZE_INVALID");
  }
  if (
    buffer.toString("base64").replace(/=+$/u, "")
    !== normalised.replace(/=+$/u, "")
  ) {
    throw new Error("ELEVENLABS_AUDIO_BASE64_INVALID");
  }
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function validateAudioSignature(bytes: Uint8Array, format: ProviderAudioFormat): void {
  if (format === "wav") {
    if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 12) !== "WAVE") {
      throw new Error("ELEVENLABS_AUDIO_WAV_SIGNATURE_INVALID");
    }
    return;
  }
  if (format === "mp3") {
    const valid = ascii(bytes, 0, 3) === "ID3"
      || (bytes.byteLength >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0);
    if (!valid) throw new Error("ELEVENLABS_AUDIO_MP3_SIGNATURE_INVALID");
    return;
  }
  throw new Error("ELEVENLABS_OUTPUT_FORMAT_UNSUPPORTED");
}

function parseNumberArray(value: unknown, code: string): number[] {
  if (!Array.isArray(value) || value.some((item) => !Number.isFinite(item) || item < 0)) {
    throw new Error(code);
  }
  return value as number[];
}

function parseAlignment(
  value: unknown,
  sourceText: string,
): Readonly<{
  transcript: string;
  wordTimestamps: readonly Readonly<{ word: string; startMs: number; endMs: number }>[];
  outputSeconds: number;
}> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ELEVENLABS_ALIGNMENT_INVALID");
  }
  const alignment = value as ElevenLabsAlignmentResponse;
  if (!Array.isArray(alignment.characters) || alignment.characters.some((item) => typeof item !== "string")) {
    throw new Error("ELEVENLABS_ALIGNMENT_CHARACTERS_INVALID");
  }
  const characters = alignment.characters as string[];
  const starts = parseNumberArray(
    alignment.character_start_times_seconds,
    "ELEVENLABS_ALIGNMENT_START_TIMES_INVALID",
  );
  const ends = parseNumberArray(
    alignment.character_end_times_seconds,
    "ELEVENLABS_ALIGNMENT_END_TIMES_INVALID",
  );
  if (
    characters.length !== starts.length
    || characters.length !== ends.length
    || characters.length === 0
  ) {
    throw new Error("ELEVENLABS_ALIGNMENT_LENGTH_MISMATCH");
  }
  const transcript = characters.join("");
  if (transcript !== sourceText) throw new Error("ELEVENLABS_ALIGNMENT_TEXT_MISMATCH");

  const words: Array<{ word: string; startMs: number; endMs: number }> = [];
  let cursor = 0;
  while (cursor < characters.length) {
    while (cursor < characters.length && /\s/u.test(characters[cursor] ?? "")) cursor += 1;
    if (cursor >= characters.length) break;
    const start = cursor;
    while (cursor < characters.length && !/\s/u.test(characters[cursor] ?? "")) cursor += 1;
    const end = cursor - 1;
    const word = characters.slice(start, cursor).join("");
    const startSeconds = starts[start];
    const endSeconds = ends[end];
    if (
      startSeconds === undefined
      || endSeconds === undefined
      || endSeconds < startSeconds
      || (words.at(-1)?.endMs ?? 0) > startSeconds * 1_000 + 1
    ) {
      throw new Error("ELEVENLABS_ALIGNMENT_TIME_ORDER_INVALID");
    }
    words.push({
      word,
      startMs: Math.round(startSeconds * 1_000),
      endMs: Math.round(endSeconds * 1_000),
    });
  }
  const outputSeconds = ends.at(-1);
  if (outputSeconds === undefined) throw new Error("ELEVENLABS_ALIGNMENT_DURATION_MISSING");
  return Object.freeze({
    transcript,
    wordTimestamps: Object.freeze(words),
    outputSeconds,
  });
}

function requestSeed(request: SynthesisRequest): number {
  return Number.parseInt(request.idempotencyKey.slice(0, 8), 16) >>> 0;
}

function outputFormat(
  format: ProviderAudioFormat,
  sampleRateHz: number,
  bitrateKbps: 128 | 192,
): string {
  if (format === "wav" && sampleRateHz === 44_100) return "wav_44100";
  if (format === "mp3" && sampleRateHz === 44_100) return `mp3_44100_${bitrateKbps}`;
  throw new Error("ELEVENLABS_OUTPUT_CONFIGURATION_UNSUPPORTED");
}

function requestedCost(
  characters: number,
  pricing: ElevenLabsPricingSnapshot,
): Readonly<{ estimatedCost: number; currency: string; costMicros: number }> {
  const costMicros = Math.ceil(
    characters * pricing.microsPerThousandCharacters / 1_000,
  );
  if (!Number.isSafeInteger(costMicros) || costMicros < 0) {
    throw new Error("ELEVENLABS_COST_CALCULATION_INVALID");
  }
  return {
    costMicros,
    estimatedCost: costMicros / 1_000_000,
    currency: pricing.currency,
  };
}

export class ElevenLabsNarrationAdapter implements NarrationProviderAdapter {
  readonly providerId = ELEVENLABS_PROVIDER_ID;
  readonly adapterVersion: string;
  readonly #configuration: ElevenLabsAdapterConfiguration;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;
  readonly #models = new Map<ProviderExecutionMode, ElevenLabsModelPolicy>();
  readonly #voices = new Map<string, ElevenLabsVoiceBinding>();
  readonly #dictionaries = new Map<string, ElevenLabsPronunciationDictionaryBinding>();
  readonly #maximumResponseBytes: number;
  readonly #preflightTimeoutMs: number;
  #capabilitySnapshot: ProviderCapabilitySnapshot | undefined;

  constructor(configuration: ElevenLabsAdapterConfiguration) {
    validateConfiguration(configuration);
    this.#configuration = configuration;
    this.adapterVersion = configuration.adapterVersion;
    this.#fetch = configuration.fetch ?? fetch;
    this.#now = configuration.now ?? (() => new Date());
    this.#maximumResponseBytes = configuration.maximumResponseBytes ?? MAX_RESPONSE_BYTES_DEFAULT;
    this.#preflightTimeoutMs = configuration.preflightTimeoutMs ?? 15_000;
    for (const policy of configuration.modelPolicies) this.#models.set(policy.mode, policy);
    for (const voice of configuration.voiceBindings) this.#voices.set(voice.voiceProfileId, voice);
    for (const dictionary of configuration.pronunciationDictionaries ?? []) {
      this.#dictionaries.set(canonicalWrittenForm(dictionary.writtenForm), dictionary);
    }
  }

  async inspectCapabilities(
    context: Omit<ProviderExecutionContext, "timeoutMs">,
  ): Promise<ProviderCapabilitySnapshot> {
    if (!context.credential.trim()) throw new Error("ELEVENLABS_CREDENTIAL_REQUIRED");
    const scope = createAbortScope(context.signal, this.#preflightTimeoutMs);
    try {
      const modelsResponse = await this.#fetch(`${ELEVENLABS_API_BASE_URL}/v1/models`, {
        method: "GET",
        headers: { "xi-api-key": context.credential },
        signal: scope.signal,
      });
      if (!modelsResponse.ok) throw new Error(responseCode(modelsResponse));
      const modelsPayload = await readBoundedJson(
        modelsResponse,
        MAX_PREFLIGHT_BYTES,
        "ELEVENLABS_MODELS_RESPONSE",
      );
      if (!Array.isArray(modelsPayload)) throw new Error("ELEVENLABS_MODELS_RESPONSE_INVALID");
      const remoteModels = new Map<string, ElevenLabsModelsResponseItem>();
      for (const item of modelsPayload) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const model = item as ElevenLabsModelsResponseItem;
        if (typeof model.model_id === "string") remoteModels.set(model.model_id, model);
      }
      for (const policy of this.#models.values()) {
        const remote = remoteModels.get(policy.modelId);
        if (!remote || remote.can_do_text_to_speech !== true) {
          throw new Error(`ELEVENLABS_MODEL_UNAVAILABLE:${policy.modelId}`);
        }
        if (
          typeof remote.max_characters_request === "number"
          && remote.max_characters_request < policy.maximumInputCharacters
        ) {
          throw new Error(`ELEVENLABS_MODEL_LIMIT_REDUCED:${policy.modelId}`);
        }
      }

      for (const voiceId of new Set([...this.#voices.values()].map((voice) => voice.voiceId))) {
        const response = await this.#fetch(
          `${ELEVENLABS_API_BASE_URL}/v1/voices/${encodeURIComponent(voiceId)}`,
          {
            method: "GET",
            headers: { "xi-api-key": context.credential },
            signal: scope.signal,
          },
        );
        if (!response.ok) throw new Error(responseCode(response));
        const payload = await readBoundedJson(
          response,
          MAX_PREFLIGHT_BYTES,
          "ELEVENLABS_VOICE_RESPONSE",
        );
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          throw new Error("ELEVENLABS_VOICE_RESPONSE_INVALID");
        }
        const voice = payload as ElevenLabsVoiceResponse;
        if (voice.voice_id !== voiceId) throw new Error("ELEVENLABS_VOICE_ID_MISMATCH");
        if (voice.category !== "premade") {
          throw new Error("ELEVENLABS_REMOTE_NON_STOCK_VOICE_PROHIBITED");
        }
      }

      const maximumInputCharacters = Math.min(
        ...[...this.#models.values()].map((policy) => policy.maximumInputCharacters),
      );
      const snapshot = createCapabilitySnapshot({
        providerId: this.providerId,
        adapterVersion: this.adapterVersion,
        capturedAt: this.#now().toISOString(),
        features: [
          "pronunciation-dictionary",
          "word-timestamps",
          "deterministic-seed",
          "style-instructions",
        ],
        maximumInputCharacters,
        supportedFormats: ["wav", "mp3"],
        supportedSampleRatesHz: [44_100],
        regions: ["global"],
        storesInputs: this.#configuration.dataPolicy.storesInputs,
        trainsOnCustomerData: this.#configuration.dataPolicy.trainsOnCustomerData,
        customVoiceRequiresConsent: true,
        rawPolicyVersion: this.#configuration.dataPolicy.policyVersion,
      });
      this.#capabilitySnapshot = snapshot;
      return snapshot;
    } catch (error) {
      if (scope.signal.aborted) {
        const reason = scope.signal.reason;
        throw reason instanceof Error ? reason : new Error("ELEVENLABS_REQUEST_ABORTED");
      }
      throw error;
    } finally {
      scope.dispose();
    }
  }

  async synthesise(
    request: SynthesisRequest,
    context: ProviderExecutionContext,
  ): Promise<SynthesisResult> {
    if (!this.#capabilitySnapshot) throw new Error("ELEVENLABS_PREFLIGHT_REQUIRED");
    if (!context.credential.trim()) throw new Error("ELEVENLABS_CREDENTIAL_REQUIRED");
    const resolved = this.#resolveGenerationPolicy(request);
    const endpoint = new URL(
      `/v1/text-to-speech/${encodeURIComponent(resolved.voice.voiceId)}/with-timestamps`,
      ELEVENLABS_API_BASE_URL,
    );
    endpoint.searchParams.set("output_format", resolved.outputFormat);
    endpoint.searchParams.set(
      "enable_logging",
      this.#configuration.dataPolicy.retentionMode === "zero-retention-enterprise"
        ? "false"
        : "true",
    );
    const body = {
      text: request.text,
      model_id: resolved.policy.modelId,
      voice_settings: resolved.settings,
      seed: resolved.seed,
      apply_text_normalization: this.#configuration.textNormalisation ?? "auto",
      ...(resolved.dictionaries.length > 0
        ? { pronunciation_dictionary_locators: resolved.dictionaries }
        : {}),
    };
    const scope = createAbortScope(context.signal, context.timeoutMs);
    try {
      const response = await this.#fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "xi-api-key": context.credential,
        },
        body: JSON.stringify(body),
        signal: scope.signal,
      });
      if (!response.ok) throw new Error(responseCode(response));
      const payload = await readBoundedJson(
        response,
        this.#maximumResponseBytes * 2,
        "ELEVENLABS_SYNTHESIS_RESPONSE",
      );
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("ELEVENLABS_SYNTHESIS_RESPONSE_INVALID");
      }
      const result = payload as ElevenLabsTimestampResponse;
      const audio = strictBase64(result.audio_base64, this.#maximumResponseBytes);
      validateAudioSignature(audio, request.format);
      const alignment = parseAlignment(result.alignment, request.text);
      const cost = requestedCost(request.text.length, resolved.policy.pricing);
      const providerRequestId = response.headers.get("request-id")
        ?? response.headers.get("x-request-id")
        ?? undefined;
      const voiceBindingFingerprint = stableHash({
        voiceProfileId: resolved.voice.voiceProfileId,
        voiceRevision: resolved.voice.voiceRevision,
        voiceId: resolved.voice.voiceId,
        licenceEvidenceId: resolved.voice.licenceEvidenceId,
        sourceKind: resolved.voice.sourceKind,
      });
      return {
        providerId: this.providerId,
        adapterVersion: this.adapterVersion,
        requestId: request.requestId,
        idempotencyKey: request.idempotencyKey,
        ...(providerRequestId ? { providerRequestId } : {}),
        audio,
        contentType: request.format === "wav" ? "audio/wav" : "audio/mpeg",
        transcript: alignment.transcript,
        wordTimestamps: alignment.wordTimestamps,
        usage: {
          inputCharacters: request.text.length,
          outputSeconds: alignment.outputSeconds,
          providerUnits: request.text.length,
          estimatedCost: cost.estimatedCost,
          currency: cost.currency,
        },
        capabilityFingerprint: this.#capabilitySnapshot.fingerprint,
        generatedAt: this.#now().toISOString(),
        provenance: {
          modelId: resolved.policy.modelId,
          outputFormat: resolved.outputFormat,
          seed: resolved.seed,
          retentionMode: this.#configuration.dataPolicy.retentionMode,
          textNormalisation: this.#configuration.textNormalisation ?? "auto",
          directionFingerprint: stableHash(request.direction),
          voiceBindingFingerprint,
          pricingFingerprint: resolved.policy.pricing.fingerprint,
          pronunciationBindingFingerprint: stableHash(resolved.dictionaries),
          sourceTextPreserved: true,
          alignmentSource: "original_alignment",
          costMicros: cost.costMicros,
        },
      };
    } catch (error) {
      if (scope.signal.aborted) {
        const reason = scope.signal.reason;
        throw reason instanceof Error ? reason : new Error("ELEVENLABS_REQUEST_ABORTED");
      }
      throw error;
    } finally {
      scope.dispose();
    }
  }

  #resolveGenerationPolicy(request: SynthesisRequest): ResolvedGenerationPolicy {
    const policy = this.#models.get(request.mode);
    if (!policy) throw new Error("ELEVENLABS_MODEL_POLICY_MISSING");
    assertElevenLabsPricingSnapshot(policy.pricing, this.#now());
    if (request.text.length === 0 || request.text.length > policy.maximumInputCharacters) {
      throw new Error("ELEVENLABS_TEXT_LENGTH_INVALID");
    }
    const voice = this.#voices.get(request.voiceProfileId);
    if (!voice) throw new Error("ELEVENLABS_VOICE_PROFILE_NOT_BOUND");
    if (voice.voiceRevision !== request.voiceRevision) {
      throw new Error("ELEVENLABS_VOICE_REVISION_MISMATCH");
    }
    if (!voice.allowedModes.includes(request.mode)) {
      throw new Error("ELEVENLABS_VOICE_MODE_NOT_APPROVED");
    }
    const dictionaries = this.#resolveDictionaries(request.pronunciations);
    return {
      policy,
      voice,
      outputFormat: outputFormat(
        request.format,
        request.sampleRateHz,
        this.#configuration.outputBitrateKbps ?? 192,
      ),
      settings: compileElevenLabsDirectionSettings(request.direction, policy.modelId),
      dictionaries,
      seed: requestSeed(request),
    };
  }

  #resolveDictionaries(
    pronunciations: readonly CanonicalPronunciation[],
  ): readonly Readonly<{
    pronunciation_dictionary_id: string;
    version_id: string;
  }>[] {
    const locators = new Map<string, Readonly<{
      pronunciation_dictionary_id: string;
      version_id: string;
    }>>();
    for (const pronunciation of pronunciations) {
      const requiresControl = Boolean(
        pronunciation.ipa
        || pronunciation.providerPhoneme
        || pronunciation.spokenForm,
      );
      if (!requiresControl) continue;
      const binding = this.#dictionaries.get(canonicalWrittenForm(pronunciation.writtenForm));
      if (!binding || binding.approvedRevision !== pronunciation.approvedRevision) {
        throw new Error("ELEVENLABS_PRONUNCIATION_BINDING_REQUIRED");
      }
      const key = `${binding.pronunciationDictionaryId}:${binding.versionId}`;
      locators.set(key, {
        pronunciation_dictionary_id: binding.pronunciationDictionaryId,
        version_id: binding.versionId,
      });
    }
    if (locators.size > MAX_DICTIONARIES_PER_REQUEST) {
      throw new Error("ELEVENLABS_PRONUNCIATION_DICTIONARY_LIMIT_EXCEEDED");
    }
    return Object.freeze([...locators.values()]);
  }
}
