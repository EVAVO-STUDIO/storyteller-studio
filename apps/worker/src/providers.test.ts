import assert from "node:assert/strict";
import test from "node:test";
import { createElevenLabsPricingSnapshot } from "@evavo/storyteller-engine/elevenlabs-adapter";
import type { WorkerEnvironment } from "./configuration.js";
import { createWorkerProviderRegistry } from "./providers.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");

function providerEnvironment(overrides: WorkerEnvironment = {}): WorkerEnvironment {
  const v3Pricing = createElevenLabsPricingSnapshot({
    modelId: "eleven_v3",
    currency: "AUD",
    microsPerThousandCharacters: 240_000,
    effectiveFrom: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-08-31T00:00:00.000Z",
    sourceReference: "elevenlabs-v3-2026-07",
  });
  const productionPricing = createElevenLabsPricingSnapshot({
    modelId: "eleven_multilingual_v2",
    currency: "AUD",
    microsPerThousandCharacters: 120_000,
    effectiveFrom: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-08-31T00:00:00.000Z",
    sourceReference: "elevenlabs-multilingual-v2-2026-07",
  });
  return {
    STORYTELLER_ELEVENLABS_ENABLED: "true",
    STORYTELLER_ELEVENLABS_ADAPTER_VERSION: "1.0.0",
    STORYTELLER_ELEVENLABS_MODEL_POLICIES: JSON.stringify([
      {
        mode: "preview",
        modelId: "eleven_v3",
        maximumInputCharacters: 3_000,
        pricing: v3Pricing,
      },
      {
        mode: "calibration",
        modelId: "eleven_v3",
        maximumInputCharacters: 3_000,
        pricing: v3Pricing,
      },
      {
        mode: "production",
        modelId: "eleven_multilingual_v2",
        maximumInputCharacters: 9_000,
        pricing: productionPricing,
      },
    ]),
    STORYTELLER_ELEVENLABS_VOICE_BINDINGS: JSON.stringify([{
      voiceProfileId: "voice_registry_narrator_001",
      voiceRevision: 1,
      voiceId: "premadeVoice0001",
      sourceKind: "premade",
      licenceEvidenceId: "licence_registry_premade_001",
      commercialUseApproved: true,
      allowedModes: ["preview", "calibration", "production"],
    }]),
    STORYTELLER_ELEVENLABS_DATA_POLICY: JSON.stringify({
      retentionMode: "zero-retention-enterprise",
      storesInputs: false,
      trainsOnCustomerData: false,
      policyVersion: "elevenlabs-enterprise-zero-retention-2026-07",
    }),
    ...overrides,
  };
}

const bindings = Object.freeze({ elevenlabs: "ELEVENLABS_API_KEY" });

test("worker provider registry remains empty when the worker is disabled", () => {
  const registry = createWorkerProviderRegistry({
    workerEnabled: false,
    environment: {
      STORYTELLER_ELEVENLABS_ENABLED: "not-a-boolean",
      STORYTELLER_ELEVENLABS_MODEL_POLICIES: "{broken",
    },
    credentialBindings: {},
  });
  assert.deepEqual(registry.ids(), []);
});

test("worker provider registry remains empty when ElevenLabs is disabled", () => {
  const registry = createWorkerProviderRegistry({
    workerEnabled: true,
    environment: providerEnvironment({
      STORYTELLER_ELEVENLABS_ENABLED: "false",
      STORYTELLER_ELEVENLABS_MODEL_POLICIES: "{broken",
    }),
    credentialBindings: {},
  });
  assert.deepEqual(registry.ids(), []);
});

test("worker provider registry conditionally registers one governed ElevenLabs adapter", () => {
  const registry = createWorkerProviderRegistry({
    workerEnabled: true,
    environment: providerEnvironment(),
    credentialBindings: bindings,
    now: () => t0,
  });
  assert.deepEqual(registry.ids(), ["elevenlabs"]);
  assert.equal(registry.get("elevenlabs")?.adapterVersion, "1.0.0");
});

test("worker provider registry rejects incomplete ElevenLabs governance configuration", () => {
  assert.throws(
    () => createWorkerProviderRegistry({
      workerEnabled: true,
      environment: providerEnvironment(),
      credentialBindings: {},
      now: () => t0,
    }),
    /ELEVENLABS_WORKER_CREDENTIAL_BINDING_REQUIRED/u,
  );
  assert.throws(
    () => createWorkerProviderRegistry({
      workerEnabled: true,
      environment: providerEnvironment({
        STORYTELLER_ELEVENLABS_VOICE_BINDINGS: JSON.stringify([{
          voiceProfileId: "voice_registry_narrator_001",
          voiceRevision: 1,
          voiceId: "premadeVoice0001",
          sourceKind: "cloned",
          licenceEvidenceId: "licence_registry_premade_001",
          commercialUseApproved: true,
          allowedModes: ["production"],
        }]),
      }),
      credentialBindings: bindings,
      now: () => t0,
    }),
    /ELEVENLABS_NON_STOCK_VOICE_PROHIBITED/u,
  );
});
