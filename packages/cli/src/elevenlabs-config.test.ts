import assert from "node:assert/strict";
import test from "node:test";
import {
  createElevenLabsPricingForConfiguration,
  validateElevenLabsConfigurationDocument,
  type ElevenLabsConfigurationDocument,
} from "./elevenlabs-config.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");

function pricing(modelId: "eleven_v3" | "eleven_multilingual_v2", rate: number) {
  return createElevenLabsPricingForConfiguration({
    modelId,
    currency: "AUD",
    microsPerThousandCharacters: rate,
    effectiveFrom: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-08-31T00:00:00.000Z",
    sourceReference: `elevenlabs-${modelId}-cli-2026-07`,
  });
}

function configuration(
  overrides: Partial<ElevenLabsConfigurationDocument> = {},
): ElevenLabsConfigurationDocument {
  return {
    adapterVersion: "1.0.0",
    modelPolicies: [
      {
        mode: "preview",
        modelId: "eleven_v3",
        maximumInputCharacters: 3_000,
        pricing: pricing("eleven_v3", 240_000),
      },
      {
        mode: "calibration",
        modelId: "eleven_v3",
        maximumInputCharacters: 3_000,
        pricing: pricing("eleven_v3", 240_000),
      },
      {
        mode: "production",
        modelId: "eleven_multilingual_v2",
        maximumInputCharacters: 9_000,
        pricing: pricing("eleven_multilingual_v2", 120_000),
      },
    ],
    voiceBindings: [{
      voiceProfileId: "voice_cli_narrator_001",
      voiceRevision: 4,
      voiceId: "premadeVoice0001",
      sourceKind: "premade",
      licenceEvidenceId: "licence_cli_premade_001",
      commercialUseApproved: true,
      allowedModes: ["preview", "calibration", "production"],
    }],
    pronunciationDictionaries: [{
      writtenForm: "Aelwyn",
      approvedRevision: 2,
      pronunciationDictionaryId: "dictionary_cli_aelwyn_001",
      versionId: "version_cli_aelwyn_002",
    }],
    dataPolicy: {
      retentionMode: "zero-retention-enterprise",
      storesInputs: false,
      trainsOnCustomerData: false,
      policyVersion: "elevenlabs-enterprise-zero-retention-2026-07",
    },
    textNormalisation: "auto",
    outputBitrateKbps: 192,
    maximumResponseBytes: 4 * 1024 * 1024,
    preflightTimeoutMs: 5_000,
    allowV3Production: false,
    ...overrides,
  };
}

test("pricing authoring creates an immutable deterministic snapshot", () => {
  const first = pricing("eleven_multilingual_v2", 120_000);
  const second = pricing("eleven_multilingual_v2", 120_000);
  assert.deepEqual(first, second);
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(first.microsPerThousandCharacters, 120_000);
  assert.equal(first.currency, "AUD");
});

test("offline configuration validation returns a redacted deterministic summary", () => {
  const document = configuration();
  const first = validateElevenLabsConfigurationDocument(document, t0);
  const second = validateElevenLabsConfigurationDocument(document, t0);
  assert.deepEqual(first, second);
  assert.equal(first.providerId, "elevenlabs");
  assert.equal(first.voiceBindingCount, 1);
  assert.equal(first.allVoiceBindingsPremade, true);
  assert.equal(first.commercialVoiceBindingCount, 1);
  assert.equal(first.pronunciationDictionaryCount, 1);
  assert.equal(first.retentionMode, "zero-retention-enterprise");
  assert.equal(first.modelPolicies.length, 3);
  assert.match(first.configurationFingerprint, /^[a-f0-9]{64}$/u);

  const serialised = JSON.stringify(first);
  for (const forbidden of [
    "premadeVoice0001",
    "voice_cli_narrator_001",
    "licence_cli_premade_001",
    "dictionary_cli_aelwyn_001",
    "version_cli_aelwyn_002",
    "sourceReference",
    "microsPerThousandCharacters",
    "ELEVENLABS_API_KEY",
  ]) assert.equal(serialised.includes(forbidden), false);
});

test("configuration fingerprint changes when governed production intent changes", () => {
  const first = validateElevenLabsConfigurationDocument(configuration(), t0);
  const second = validateElevenLabsConfigurationDocument(configuration({
    outputBitrateKbps: 128,
  }), t0);
  assert.notEqual(first.configurationFingerprint, second.configurationFingerprint);
});

test("offline validation rejects expired pricing and non-premade voice sources", () => {
  const expired = createElevenLabsPricingForConfiguration({
    modelId: "eleven_multilingual_v2",
    currency: "AUD",
    microsPerThousandCharacters: 120_000,
    effectiveFrom: "2026-06-01T00:00:00.000Z",
    expiresAt: "2026-07-01T00:00:00.000Z",
    sourceReference: "elevenlabs-expired-cli-2026-06",
  });
  const expiredPolicies = configuration().modelPolicies.map((policy) =>
    policy.mode === "production" ? { ...policy, pricing: expired } : policy
  );
  assert.throws(
    () => validateElevenLabsConfigurationDocument(configuration({
      modelPolicies: expiredPolicies,
    }), t0),
    /ELEVENLABS_PRICING_EXPIRED/u,
  );

  assert.throws(
    () => validateElevenLabsConfigurationDocument(configuration({
      voiceBindings: [{
        ...configuration().voiceBindings[0]!,
        sourceKind: "cloned" as "premade",
      }],
    }), t0),
    /ELEVENLABS_NON_STOCK_VOICE_PROHIBITED/u,
  );
});

test("malformed configuration documents fail with bounded CLI errors", () => {
  assert.throws(
    () => validateElevenLabsConfigurationDocument(null, t0),
    /CLI_ELEVENLABS_CONFIGURATION_OBJECT_REQUIRED/u,
  );
  assert.throws(
    () => validateElevenLabsConfigurationDocument({ adapterVersion: "1.0.0" }, t0),
    /CLI_ELEVENLABS_MODEL_POLICIES_REQUIRED/u,
  );
  assert.throws(
    () => validateElevenLabsConfigurationDocument({
      adapterVersion: "1.0.0",
      modelPolicies: [],
      voiceBindings: [],
    }, t0),
    /CLI_ELEVENLABS_DATA_POLICY_REQUIRED/u,
  );
});

test("offline validation performs no provider network request", () => {
  const summary = validateElevenLabsConfigurationDocument(configuration(), t0);
  assert.equal(summary.validationAt, t0.toISOString());
  assert.equal(summary.modelPolicies.some((policy) => policy.modelId === "eleven_v3"), true);
});
