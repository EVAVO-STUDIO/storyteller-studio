import {
  ELEVENLABS_PROVIDER_ID,
  ElevenLabsNarrationAdapter,
  createElevenLabsPricingSnapshot,
  type ElevenLabsAdapterConfiguration,
  type ElevenLabsModelId,
  type ElevenLabsPricingSnapshot,
} from "@evavo/storyteller-engine/elevenlabs-adapter";
import { stableHash } from "@evavo/storyteller-engine";

export type ElevenLabsConfigurationDocument = Omit<
  ElevenLabsAdapterConfiguration,
  "fetch" | "now"
>;

export interface CreateElevenLabsPricingInput {
  modelId: ElevenLabsModelId;
  currency: string;
  microsPerThousandCharacters: number;
  effectiveFrom: string;
  expiresAt: string;
  sourceReference: string;
}

export interface ElevenLabsConfigurationSummary {
  schemaVersion: "storyteller-elevenlabs-configuration-summary-v1";
  providerId: typeof ELEVENLABS_PROVIDER_ID;
  adapterVersion: string;
  validationAt: string;
  modelPolicies: readonly Readonly<{
    mode: "preview" | "calibration" | "production";
    modelId: ElevenLabsModelId;
    maximumInputCharacters: number;
    currency: string;
    pricingEffectiveFrom: string;
    pricingExpiresAt: string;
    pricingFingerprint: string;
  }>[];
  voiceBindingCount: number;
  allVoiceBindingsPremade: boolean;
  commercialVoiceBindingCount: number;
  pronunciationDictionaryCount: number;
  retentionMode: "standard" | "zero-retention-enterprise";
  storesInputs: boolean;
  trainsOnCustomerData: boolean;
  dataPolicyVersion: string;
  outputBitrateKbps: 128 | 192;
  textNormalisation: "auto" | "on" | "off";
  maximumResponseBytes: number;
  preflightTimeoutMs: number;
  v3ProductionApproved: boolean;
  configurationFingerprint: string;
}

function requireDocument(value: unknown): ElevenLabsConfigurationDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CLI_ELEVENLABS_CONFIGURATION_OBJECT_REQUIRED");
  }
  const document = value as Partial<ElevenLabsConfigurationDocument>;
  if (typeof document.adapterVersion !== "string") {
    throw new Error("CLI_ELEVENLABS_ADAPTER_VERSION_REQUIRED");
  }
  if (!Array.isArray(document.modelPolicies)) {
    throw new Error("CLI_ELEVENLABS_MODEL_POLICIES_REQUIRED");
  }
  if (!Array.isArray(document.voiceBindings)) {
    throw new Error("CLI_ELEVENLABS_VOICE_BINDINGS_REQUIRED");
  }
  if (
    !document.dataPolicy
    || typeof document.dataPolicy !== "object"
    || Array.isArray(document.dataPolicy)
  ) {
    throw new Error("CLI_ELEVENLABS_DATA_POLICY_REQUIRED");
  }
  if (
    document.pronunciationDictionaries !== undefined
    && !Array.isArray(document.pronunciationDictionaries)
  ) {
    throw new Error("CLI_ELEVENLABS_DICTIONARIES_INVALID");
  }
  return document as ElevenLabsConfigurationDocument;
}

function validationDate(value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error("CLI_ELEVENLABS_VALIDATION_DATE_INVALID");
  }
  return value;
}

function networkProhibitedFetch(): typeof fetch {
  return (async () => {
    throw new Error("CLI_ELEVENLABS_NETWORK_PROHIBITED");
  }) as typeof fetch;
}

export function createElevenLabsPricingForConfiguration(
  input: CreateElevenLabsPricingInput,
): ElevenLabsPricingSnapshot {
  return createElevenLabsPricingSnapshot(input);
}

export function validateElevenLabsConfigurationDocument(
  value: unknown,
  at = new Date(),
): ElevenLabsConfigurationSummary {
  const document = requireDocument(value);
  const instant = validationDate(at);
  new ElevenLabsNarrationAdapter({
    ...document,
    fetch: networkProhibitedFetch(),
    now: () => instant,
  });

  const modelPolicies = Object.freeze(
    [...document.modelPolicies]
      .sort((left, right) => left.mode.localeCompare(right.mode, "en-AU"))
      .map((policy) => Object.freeze({
        mode: policy.mode,
        modelId: policy.modelId,
        maximumInputCharacters: policy.maximumInputCharacters,
        currency: policy.pricing.currency,
        pricingEffectiveFrom: policy.pricing.effectiveFrom,
        pricingExpiresAt: policy.pricing.expiresAt,
        pricingFingerprint: policy.pricing.fingerprint,
      })),
  );

  const configurationFingerprint = stableHash({
    adapterVersion: document.adapterVersion,
    modelPolicies: document.modelPolicies,
    voiceBindings: document.voiceBindings,
    pronunciationDictionaries: document.pronunciationDictionaries ?? [],
    dataPolicy: document.dataPolicy,
    textNormalisation: document.textNormalisation ?? "auto",
    outputBitrateKbps: document.outputBitrateKbps ?? 192,
    maximumResponseBytes: document.maximumResponseBytes ?? 128 * 1024 * 1024,
    preflightTimeoutMs: document.preflightTimeoutMs ?? 15_000,
    allowV3Production: document.allowV3Production ?? false,
  });

  return Object.freeze({
    schemaVersion: "storyteller-elevenlabs-configuration-summary-v1",
    providerId: ELEVENLABS_PROVIDER_ID,
    adapterVersion: document.adapterVersion,
    validationAt: instant.toISOString(),
    modelPolicies,
    voiceBindingCount: document.voiceBindings.length,
    allVoiceBindingsPremade: document.voiceBindings.every(
      (binding) => binding.sourceKind === "premade",
    ),
    commercialVoiceBindingCount: document.voiceBindings.filter(
      (binding) => binding.commercialUseApproved,
    ).length,
    pronunciationDictionaryCount: document.pronunciationDictionaries?.length ?? 0,
    retentionMode: document.dataPolicy.retentionMode,
    storesInputs: document.dataPolicy.storesInputs,
    trainsOnCustomerData: document.dataPolicy.trainsOnCustomerData,
    dataPolicyVersion: document.dataPolicy.policyVersion,
    outputBitrateKbps: document.outputBitrateKbps ?? 192,
    textNormalisation: document.textNormalisation ?? "auto",
    maximumResponseBytes: document.maximumResponseBytes ?? 128 * 1024 * 1024,
    preflightTimeoutMs: document.preflightTimeoutMs ?? 15_000,
    v3ProductionApproved: document.allowV3Production ?? false,
    configurationFingerprint,
  });
}
