import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createCapabilitySnapshot,
  ProviderAdapterRegistry,
  type CredentialResolver,
  type NarrationProviderAdapter,
  type ProviderCapabilitySnapshot,
  type ProviderExecutionContext,
  type SynthesisRequest,
  type SynthesisResult,
} from "@evavo/storyteller-engine/provider-adapter";
import {
  resolveWorkerRuntimeConfiguration,
  type WorkerEnvironment,
} from "./configuration.js";
import { runConfiguredWorkerRuntime } from "./runtime.js";

const capability = createCapabilitySnapshot({
  providerId: "provider_runtime",
  adapterVersion: "1.0.0",
  capturedAt: "2026-07-27T00:00:00.000Z",
  features: ["style-instructions"],
  maximumInputCharacters: 20_000,
  supportedFormats: ["wav"],
  supportedSampleRatesHz: [48_000],
  regions: ["australia"],
  storesInputs: false,
  trainsOnCustomerData: false,
  customVoiceRequiresConsent: true,
  rawPolicyVersion: "policy-2026-07",
});

class PreflightOnlyAdapter implements NarrationProviderAdapter {
  readonly providerId = "provider_runtime";
  readonly adapterVersion = "1.0.0";
  inspectCount = 0;
  synthesiseCount = 0;

  async inspectCapabilities(
    context: Omit<ProviderExecutionContext, "timeoutMs">,
  ): Promise<ProviderCapabilitySnapshot> {
    assert.equal(context.credential, "fixture-credential");
    this.inspectCount += 1;
    return capability;
  }

  async synthesise(
    _request: SynthesisRequest,
    _context: ProviderExecutionContext,
  ): Promise<SynthesisResult> {
    this.synthesiseCount += 1;
    throw new Error("runtime preflight test must not synthesise");
  }
}

class StaticCredentials implements CredentialResolver {
  constructor(readonly credential: string | null) {}

  async resolve(providerId: string): Promise<string | null> {
    assert.equal(providerId, "provider_runtime");
    return this.credential;
  }
}

function environment(dataDirectory: string): WorkerEnvironment {
  return {
    NODE_ENV: "test",
    STORYTELLER_WORKER_MODE: "once",
    STORYTELLER_WORKER_ID: "worker_runtime_test_001",
    STORYTELLER_WORKER_VERIFIER_ACTOR_ID: "verifier_runtime_test_001",
    STORYTELLER_QUEUE_DRIVER: "file",
    STORYTELLER_ARTIFACT_DRIVER: "file",
    STORYTELLER_DATA_DIR: dataDirectory,
    STORYTELLER_WORKER_CONCURRENCY: "1",
    STORYTELLER_WORKER_POLL_INTERVAL_MS: "100",
    STORYTELLER_WORKER_LEASE_DURATION_MS: "2000",
    STORYTELLER_WORKER_HEARTBEAT_INTERVAL_MS: "500",
  };
}

test("disabled runtime returns without providers, credentials or persistence", async () => {
  const result = await runConfiguredWorkerRuntime(
    resolveWorkerRuntimeConfiguration({}),
    {
      providers: new ProviderAdapterRegistry(),
      credentials: new StaticCredentials(null),
    },
  );
  assert.equal(result.status, "disabled");
  assert.equal(result.providerCount, 0);
  assert.equal(result.configuration.executionApiExposed, false);
});

test("enabled runtime fails before queue polling when no provider adapter is registered", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-worker-runtime-empty-"));
  try {
    const configuration = resolveWorkerRuntimeConfiguration(environment("./data"), root);
    await assert.rejects(
      runConfiguredWorkerRuntime(configuration, {
        providers: new ProviderAdapterRegistry(),
        credentials: new StaticCredentials(null),
      }),
      /WORKER_PROVIDER_ADAPTERS_REQUIRED/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("enabled runtime requires every registered provider credential before claiming work", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-worker-runtime-credential-"));
  try {
    const adapter = new PreflightOnlyAdapter();
    const configuration = resolveWorkerRuntimeConfiguration(environment("./data"), root);
    await assert.rejects(
      runConfiguredWorkerRuntime(configuration, {
        providers: new ProviderAdapterRegistry([adapter]),
        credentials: new StaticCredentials(null),
      }),
      /WORKER_PROVIDER_CREDENTIAL_MISSING:provider_runtime/u,
    );
    assert.equal(adapter.inspectCount, 0);
    assert.equal(adapter.synthesiseCount, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("once runtime preflights providers and stops cleanly when the durable queue is empty", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-worker-runtime-once-"));
  try {
    const adapter = new PreflightOnlyAdapter();
    const configuration = resolveWorkerRuntimeConfiguration(environment("./private-data"), root);
    const result = await runConfiguredWorkerRuntime(configuration, {
      providers: new ProviderAdapterRegistry([adapter]),
      credentials: new StaticCredentials("fixture-credential"),
      now: () => new Date("2026-07-27T00:00:00.000Z"),
    });

    assert.equal(result.status, "stopped");
    assert.equal(result.providerCount, 1);
    assert.equal(adapter.inspectCount, 1);
    assert.equal(adapter.synthesiseCount, 0);
    if (result.status === "disabled") throw new Error("enabled worker result required");
    assert.equal(result.lifecycle.mode, "once");
    assert.equal(result.lifecycle.service.state, "stopped");
    assert.equal(result.lifecycle.service.claimedJobs, 0);

    const serialised = JSON.stringify(result);
    for (const forbidden of [
      root,
      "private-data",
      "worker_runtime_test_001",
      "verifier_runtime_test_001",
      "fixture-credential",
      "provider_runtime",
    ]) assert.equal(serialised.includes(forbidden), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("provider capability mismatch fails before service start", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-worker-runtime-capability-"));
  try {
    const adapter = new PreflightOnlyAdapter();
    adapter.inspectCapabilities = async () => ({
      ...capability,
      providerId: "provider_wrong",
    });
    const configuration = resolveWorkerRuntimeConfiguration(environment("./data"), root);
    await assert.rejects(
      runConfiguredWorkerRuntime(configuration, {
        providers: new ProviderAdapterRegistry([adapter]),
        credentials: new StaticCredentials("fixture-credential"),
      }),
      /WORKER_PROVIDER_CAPABILITY_ID_MISMATCH/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
