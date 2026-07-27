import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createElevenLabsPricingSnapshot } from "@evavo/storyteller-engine/elevenlabs-adapter";
import {
  EnvironmentCredentialResolver,
  resolveWorkerRuntimeConfiguration,
  type WorkerEnvironment,
} from "./configuration.js";
import { createWorkerProviderRegistry } from "./providers.js";
import { runConfiguredWorkerRuntime } from "./runtime.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");

function environment(dataDirectory: string, overrides: WorkerEnvironment = {}): WorkerEnvironment {
  const v3Pricing = createElevenLabsPricingSnapshot({
    modelId: "eleven_v3",
    currency: "AUD",
    microsPerThousandCharacters: 240_000,
    effectiveFrom: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-08-31T00:00:00.000Z",
    sourceReference: "elevenlabs-v3-runtime-2026-07",
  });
  const productionPricing = createElevenLabsPricingSnapshot({
    modelId: "eleven_multilingual_v2",
    currency: "AUD",
    microsPerThousandCharacters: 120_000,
    effectiveFrom: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-08-31T00:00:00.000Z",
    sourceReference: "elevenlabs-v2-runtime-2026-07",
  });
  return {
    NODE_ENV: "test",
    STORYTELLER_WORKER_MODE: "once",
    STORYTELLER_WORKER_ID: "worker_elevenlabs_runtime_001",
    STORYTELLER_WORKER_VERIFIER_ACTOR_ID: "verifier_elevenlabs_runtime_001",
    STORYTELLER_QUEUE_DRIVER: "file",
    STORYTELLER_ARTIFACT_DRIVER: "file",
    STORYTELLER_DATA_DIR: dataDirectory,
    STORYTELLER_WORKER_CONCURRENCY: "1",
    STORYTELLER_WORKER_POLL_INTERVAL_MS: "100",
    STORYTELLER_WORKER_LEASE_DURATION_MS: "2000",
    STORYTELLER_WORKER_HEARTBEAT_INTERVAL_MS: "500",
    STORYTELLER_WORKER_PROVIDER_TIMEOUT_MS: "5000",
    STORYTELLER_WORKER_CREDENTIAL_BINDINGS: JSON.stringify({
      elevenlabs: "ELEVENLABS_API_KEY",
    }),
    ELEVENLABS_API_KEY: "fixture-elevenlabs-runtime-secret",
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
      voiceProfileId: "voice_runtime_narrator_001",
      voiceRevision: 1,
      voiceId: "premadeVoice0001",
      sourceKind: "premade",
      licenceEvidenceId: "licence_runtime_premade_001",
      commercialUseApproved: true,
      allowedModes: ["preview", "calibration", "production"],
    }]),
    STORYTELLER_ELEVENLABS_PRONUNCIATION_DICTIONARIES: "[]",
    STORYTELLER_ELEVENLABS_DATA_POLICY: JSON.stringify({
      retentionMode: "zero-retention-enterprise",
      storesInputs: false,
      trainsOnCustomerData: false,
      policyVersion: "elevenlabs-enterprise-zero-retention-2026-07",
    }),
    STORYTELLER_ELEVENLABS_PREFLIGHT_TIMEOUT_MS: "5000",
    ...overrides,
  };
}

function jsonResponse(value: unknown): Response {
  const body = JSON.stringify(value);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body)),
    },
  });
}

function fetchFrom(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    return await handler(url, init);
  }) as typeof fetch;
}

function modelsResponse(): Response {
  return jsonResponse([
    {
      model_id: "eleven_multilingual_v2",
      can_do_text_to_speech: true,
      max_characters_request: 10_000,
    },
    {
      model_id: "eleven_v3",
      can_do_text_to_speech: true,
      max_characters_request: 5_000,
    },
  ]);
}

function voiceResponse(category = "premade"): Response {
  return jsonResponse({
    voice_id: "premadeVoice0001",
    category,
  });
}

test("configured ElevenLabs worker preflights models and premade voices before an empty queue stops", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-elevenlabs-runtime-"));
  try {
    const env = environment("./private-data");
    const configuration = resolveWorkerRuntimeConfiguration(env, root);
    assert.equal(configuration.enabled, true);
    const calls: string[] = [];
    const providers = createWorkerProviderRegistry({
      workerEnabled: configuration.enabled,
      environment: env,
      credentialBindings: configuration.enabled ? configuration.credentialBindings : {},
      now: () => t0,
      fetch: fetchFrom((url, init) => {
        calls.push(url);
        assert.equal(
          new Headers(init?.headers).get("xi-api-key"),
          "fixture-elevenlabs-runtime-secret",
        );
        if (url.endsWith("/v1/models")) return modelsResponse();
        if (url.endsWith("/v1/voices/premadeVoice0001")) return voiceResponse();
        throw new Error(`unexpected provider preflight URL: ${url}`);
      }),
    });
    const credentials = new EnvironmentCredentialResolver(
      env,
      configuration.enabled ? configuration.credentialBindings : {},
    );
    const result = await runConfiguredWorkerRuntime(configuration, {
      providers,
      credentials,
      now: () => t0,
    });

    assert.equal(result.status, "stopped");
    assert.equal(result.providerCount, 1);
    assert.deepEqual(providers.ids(), ["elevenlabs"]);
    assert.equal(calls.length, 2);
    assert.equal(calls.some((url) => url.includes("/with-timestamps")), false);
    if (result.status === "disabled") throw new Error("enabled result required");
    assert.equal(result.lifecycle.service.claimedJobs, 0);

    const serialised = JSON.stringify(result);
    for (const forbidden of [
      root,
      "private-data",
      "worker_elevenlabs_runtime_001",
      "verifier_elevenlabs_runtime_001",
      "fixture-elevenlabs-runtime-secret",
      "premadeVoice0001",
      "voice_runtime_narrator_001",
    ]) assert.equal(serialised.includes(forbidden), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("missing ElevenLabs secret blocks startup before any provider request or queue claim", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-elevenlabs-secret-"));
  try {
    const env = environment("./private-data", { ELEVENLABS_API_KEY: "" });
    const configuration = resolveWorkerRuntimeConfiguration(env, root);
    const calls: string[] = [];
    const providers = createWorkerProviderRegistry({
      workerEnabled: configuration.enabled,
      environment: env,
      credentialBindings: configuration.enabled ? configuration.credentialBindings : {},
      now: () => t0,
      fetch: fetchFrom((url) => {
        calls.push(url);
        return modelsResponse();
      }),
    });
    const credentials = new EnvironmentCredentialResolver(
      env,
      configuration.enabled ? configuration.credentialBindings : {},
    );
    await assert.rejects(
      runConfiguredWorkerRuntime(configuration, { providers, credentials, now: () => t0 }),
      /WORKER_PROVIDER_CREDENTIAL_MISSING:elevenlabs/u,
    );
    assert.equal(calls.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("remote non-premade voice blocks startup before queue polling", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-elevenlabs-voice-"));
  try {
    const env = environment("./private-data");
    const configuration = resolveWorkerRuntimeConfiguration(env, root);
    const providers = createWorkerProviderRegistry({
      workerEnabled: configuration.enabled,
      environment: env,
      credentialBindings: configuration.enabled ? configuration.credentialBindings : {},
      now: () => t0,
      fetch: fetchFrom((url) =>
        url.endsWith("/v1/models") ? modelsResponse() : voiceResponse("cloned")
      ),
    });
    const credentials = new EnvironmentCredentialResolver(
      env,
      configuration.enabled ? configuration.credentialBindings : {},
    );
    await assert.rejects(
      runConfiguredWorkerRuntime(configuration, { providers, credentials, now: () => t0 }),
      /ELEVENLABS_REMOTE_NON_STOCK_VOICE_PROHIBITED/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
