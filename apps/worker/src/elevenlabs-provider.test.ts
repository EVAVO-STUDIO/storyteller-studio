import assert from "node:assert/strict";
import test from "node:test";
import {
  createElevenLabsPricingSnapshot,
  type ElevenLabsModelId,
} from "@evavo/storyteller-engine/elevenlabs-adapter";
import {
  ELEVENLABS_CREDENTIAL_BINDING_ID,
  elevenLabsWorkerProviderSummary,
  resolveElevenLabsWorkerProvider,
} from "./elevenlabs-provider.js";
import type { WorkerEnvironment } from "./configuration.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");

function pricing(modelId: ElevenLabsModelId, rate = 120_000) {
  return createElevenLabsPricingSnapshot({
    modelId,
    currency: "AUD",
    microsPerThousandCharacters: rate,
    effectiveFrom: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-08-31T00:00:00.000Z",
    sourceReference: `elevenlabs-${modelId}-2026-07`,
  });
}

function environment(overrides: WorkerEnvironment = {}): WorkerEnvironment {
  return {
    STORYTELLER_ELEVENLABS_ENABLED: "true",
    STORYTELLER_ELEVENLABS_ADAPTER_VERSION: "1.0.0",
    STORYTELLER_ELEVENLABS_MODEL_POLICIES: JSON.stringify([
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
        pricing: pricing("eleven_multilingual_v2"),
      },
    ]),
    STORYTELLER_ELEVENLABS_VOICE_BINDINGS: JSON.stringify([{
      voiceProfileId: "voice_profile_narrator_001",
      voiceRevision: 4,
      voiceId: "premadeVoice0001",
      sourceKind: "premade",
      licenceEvidenceId: "licence_elevenlabs_premade_001",
      commercialUseApproved: true,
      allowedModes: ["preview", "calibration", "production"],
    }]),
    STORYTELLER_ELEVENLABS_PRONUNCIATION_DICTIONARIES: JSON.stringify([{
      writtenForm: "Aelwyn",
      approvedRevision: 2,
      pronunciationDictionaryId: "dictionary_aelwyn_001",
      versionId: "version_aelwyn_002",
    }]),
    STORYTELLER_ELEVENLABS_DATA_POLICY: JSON.stringify({
      retentionMode: "zero-retention-enterprise",
      storesInputs: false,
      trainsOnCustomerData: false,
      policyVersion: "elevenlabs-enterprise-zero-retention-2026-07",
    }),
    STORYTELLER_ELEVENLABS_TEXT_NORMALISATION: "auto",
    STORYTELLER_ELEVENLABS_OUTPUT_BITRATE_KBPS: "192",
    STORYTELLER_ELEVENLABS_MAX_RESPONSE_BYTES: String(4 * 1024 * 1024),
    STORYTELLER_ELEVENLABS_PREFLIGHT_TIMEOUT_MS: "5000",
    STORYTELLER_ELEVENLABS_ALLOW_V3_PRODUCTION: "false",
    ...overrides,
  };
}

const credentialBindings = Object.freeze({
  [ELEVENLABS_CREDENTIAL_BINDING_ID]: "ELEVENLABS_API_KEY",
});

test("disabled worker ignores every private ElevenLabs setting", () => {
  const resolved = resolveElevenLabsWorkerProvider({
    workerEnabled: false,
    environment: {
      STORYTELLER_ELEVENLABS_ENABLED: "not-a-boolean",
      STORYTELLER_ELEVENLABS_MODEL_POLICIES: "{broken",
    },
    credentialBindings: {},
  });
  assert.equal(resolved, null);
  assert.deepEqual(elevenLabsWorkerProviderSummary(resolved), {
    enabled: false,
    providerId: "elevenlabs",
    modelPolicyCount: 0,
    voiceBindingCount: 0,
    pronunciationDictionaryCount: 0,
    retentionMode: "none",
    zeroRetentionRequested: false,
  });
});

test("disabled provider does not evaluate model, voice or pricing records", () => {
  const resolved = resolveElevenLabsWorkerProvider({
    workerEnabled: true,
    environment: {
      STORYTELLER_ELEVENLABS_ENABLED: "false",
      STORYTELLER_ELEVENLABS_MODEL_POLICIES: "{broken",
      STORYTELLER_ELEVENLABS_VOICE_BINDINGS: "{broken",
    },
    credentialBindings: {},
  });
  assert.equal(resolved, null);
});

test("complete governed configuration creates one redacted provider summary", () => {
  const resolved = resolveElevenLabsWorkerProvider({
    workerEnabled: true,
    environment: environment(),
    credentialBindings,
    now: () => t0,
  });
  assert.ok(resolved);
  assert.equal(resolved.adapter.providerId, "elevenlabs");
  assert.equal(resolved.adapter.adapterVersion, "1.0.0");
  assert.deepEqual(resolved.summary, {
    enabled: true,
    providerId: "elevenlabs",
    modelPolicyCount: 3,
    voiceBindingCount: 1,
    pronunciationDictionaryCount: 1,
    retentionMode: "zero-retention-enterprise",
    zeroRetentionRequested: true,
  });

  const serialised = JSON.stringify(resolved.summary);
  for (const forbidden of [
    "premadeVoice0001",
    "voice_profile_narrator_001",
    "licence_elevenlabs_premade_001",
    "dictionary_aelwyn_001",
    "ELEVENLABS_API_KEY",
    "elevenlabs-eleven_multilingual_v2-2026-07",
  ]) assert.equal(serialised.includes(forbidden), false);
});

test("enabled provider requires an explicit server credential binding", () => {
  assert.throws(
    () => resolveElevenLabsWorkerProvider({
      workerEnabled: true,
      environment: environment(),
      credentialBindings: {},
      now: () => t0,
    }),
    /ELEVENLABS_WORKER_CREDENTIAL_BINDING_REQUIRED/u,
  );
});

test("malformed provider JSON and policy shapes fail before adapter registration", () => {
  assert.throws(
    () => resolveElevenLabsWorkerProvider({
      workerEnabled: true,
      environment: environment({
        STORYTELLER_ELEVENLABS_MODEL_POLICIES: "{broken",
      }),
      credentialBindings,
      now: () => t0,
    }),
    /ELEVENLABS_WORKER_MODEL_POLICIES_INVALID/u,
  );
  assert.throws(
    () => resolveElevenLabsWorkerProvider({
      workerEnabled: true,
      environment: environment({
        STORYTELLER_ELEVENLABS_DATA_POLICY: JSON.stringify({
          retentionMode: "zero-retention-enterprise",
          storesInputs: "false",
          trainsOnCustomerData: false,
          policyVersion: "policy",
        }),
      }),
      credentialBindings,
      now: () => t0,
    }),
    /ELEVENLABS_WORKER_DATA_POLICY_INVALID/u,
  );
});

test("expired pricing and non-premade voices fail closed during construction", () => {
  const expiredPricing = createElevenLabsPricingSnapshot({
    modelId: "eleven_multilingual_v2",
    currency: "AUD",
    microsPerThousandCharacters: 120_000,
    effectiveFrom: "2026-06-01T00:00:00.000Z",
    expiresAt: "2026-07-01T00:00:00.000Z",
    sourceReference: "elevenlabs-expired-2026-06",
  });
  const policies = JSON.parse(environment().STORYTELLER_ELEVENLABS_MODEL_POLICIES!) as Array<Record<string, unknown>>;
  policies[2] = { ...policies[2], pricing: expiredPricing };
  assert.throws(
    () => resolveElevenLabsWorkerProvider({
      workerEnabled: true,
      environment: environment({
        STORYTELLER_ELEVENLABS_MODEL_POLICIES: JSON.stringify(policies),
      }),
      credentialBindings,
      now: () => t0,
    }),
    /ELEVENLABS_PRICING_EXPIRED/u,
  );

  const voices = JSON.parse(environment().STORYTELLER_ELEVENLABS_VOICE_BINDINGS!) as Array<Record<string, unknown>>;
  voices[0] = { ...voices[0], sourceKind: "cloned" };
  assert.throws(
    () => resolveElevenLabsWorkerProvider({
      workerEnabled: true,
      environment: environment({
        STORYTELLER_ELEVENLABS_VOICE_BINDINGS: JSON.stringify(voices),
      }),
      credentialBindings,
      now: () => t0,
    }),
    /ELEVENLABS_NON_STOCK_VOICE_PROHIBITED/u,
  );
});

test("unsafe booleans, bitrate and text normalisation are rejected", () => {
  for (const [overrides, expected] of [
    [{ STORYTELLER_ELEVENLABS_ENABLED: "yes" }, /ELEVENLABS_WORKER_ENABLED_INVALID/u],
    [{ STORYTELLER_ELEVENLABS_ALLOW_V3_PRODUCTION: "sometimes" }, /ELEVENLABS_WORKER_V3_PRODUCTION_FLAG_INVALID/u],
    [{ STORYTELLER_ELEVENLABS_OUTPUT_BITRATE_KBPS: "160" }, /ELEVENLABS_WORKER_OUTPUT_BITRATE_INVALID/u],
    [{ STORYTELLER_ELEVENLABS_TEXT_NORMALISATION: "creative" }, /ELEVENLABS_WORKER_TEXT_NORMALISATION_INVALID/u],
  ] as const) {
    assert.throws(
      () => resolveElevenLabsWorkerProvider({
        workerEnabled: true,
        environment: environment(overrides),
        credentialBindings,
        now: () => t0,
      }),
      expected,
    );
  }
});
