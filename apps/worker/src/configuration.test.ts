import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import {
  EnvironmentCredentialResolver,
  resolveWorkerRuntimeConfiguration,
  workerRuntimeConfigurationSummary,
  type WorkerEnvironment,
} from "./configuration.js";

const root = "C:/storyteller-worker-test";

function enabledEnvironment(
  overrides: WorkerEnvironment = {},
): WorkerEnvironment {
  return {
    NODE_ENV: "test",
    STORYTELLER_WORKER_MODE: "once",
    STORYTELLER_WORKER_ID: "worker_runtime_001",
    STORYTELLER_WORKER_VERIFIER_ACTOR_ID: "verifier_runtime_001",
    STORYTELLER_QUEUE_DRIVER: "file",
    STORYTELLER_ARTIFACT_DRIVER: "file",
    STORYTELLER_DATA_DIR: "./private-data",
    STORYTELLER_WORKER_CREDENTIAL_BINDINGS: JSON.stringify({
      provider_primary: "PROVIDER_PRIMARY_SECRET",
    }),
    PROVIDER_PRIMARY_SECRET: "private-provider-secret",
    ...overrides,
  };
}

test("worker runtime is disabled by default without evaluating private settings", () => {
  const configuration = resolveWorkerRuntimeConfiguration({
    STORYTELLER_WORKER_CONCURRENCY: "not-a-number",
  }, root);
  assert.deepEqual(configuration, {
    mode: "disabled",
    enabled: false,
    persistence: "none",
    executionApiExposed: false,
  });
  const summary = workerRuntimeConfigurationSummary(configuration);
  assert.equal(summary.enabled, false);
  assert.equal(summary.concurrency, 0);
  assert.equal(summary.executionApiExposed, false);
});

test("enabled file worker configuration resolves isolated stores and bounded controls", () => {
  const configuration = resolveWorkerRuntimeConfiguration(enabledEnvironment({
    STORYTELLER_WORKER_MODE: "continuous",
    STORYTELLER_WORKER_PROJECT_ID: "project_runtime_001",
    STORYTELLER_WORKER_CONCURRENCY: "4",
    STORYTELLER_WORKER_POLL_INTERVAL_MS: "750",
    STORYTELLER_WORKER_LEASE_DURATION_MS: "90000",
    STORYTELLER_WORKER_HEARTBEAT_INTERVAL_MS: "25000",
    STORYTELLER_WORKER_PROVIDER_TIMEOUT_MS: "180000",
    STORYTELLER_WORKER_SHUTDOWN_GRACE_MS: "45000",
    STORYTELLER_WORKER_OBJECT_PROVIDER: "evavo-private-file-store",
    STORYTELLER_WORKER_OBJECT_CONTAINER: "storyteller-production",
    STORYTELLER_WORKER_OBJECT_REGION: "australia-southeast",
  }), root);
  assert.equal(configuration.enabled, true);
  if (!configuration.enabled) throw new Error("enabled configuration required");
  assert.equal(configuration.mode, "continuous");
  assert.equal(configuration.projectId, "project_runtime_001");
  assert.equal(configuration.concurrency, 4);
  assert.equal(configuration.pollIntervalMs, 750);
  assert.equal(configuration.leaseDurationMs, 90_000);
  assert.equal(configuration.heartbeatIntervalMs, 25_000);
  assert.equal(configuration.providerTimeoutMs, 180_000);
  assert.equal(configuration.shutdownGraceMs, 45_000);
  assert.equal(
    configuration.queueRootDirectory,
    resolve(root, "./private-data", "generation-queue"),
  );
  assert.equal(
    configuration.artifactRootDirectory,
    resolve(root, "./private-data", "artifact-registry"),
  );
  assert.equal(
    configuration.objectRootDirectory,
    resolve(root, "./private-data", "private-objects"),
  );
  assert.equal(configuration.executionApiExposed, false);
});

test("environment credential bindings resolve secrets without including them in configuration summaries", async () => {
  const environment = enabledEnvironment();
  const configuration = resolveWorkerRuntimeConfiguration(environment, root);
  if (!configuration.enabled) throw new Error("enabled configuration required");
  const resolver = new EnvironmentCredentialResolver(
    environment,
    configuration.credentialBindings,
  );
  assert.equal(
    await resolver.resolve("provider_primary"),
    "private-provider-secret",
  );
  assert.equal(await resolver.resolve("provider_missing"), null);

  const serialised = JSON.stringify(workerRuntimeConfigurationSummary(configuration));
  assert.equal(serialised.includes("private-provider-secret"), false);
  assert.equal(serialised.includes("PROVIDER_PRIMARY_SECRET"), false);
  assert.equal(serialised.includes("worker_runtime_001"), false);
  assert.equal(serialised.includes("private-data"), false);
  assert.equal(serialised.includes(root), false);
});

test("production file worker requires queue, artifact and worker single-host acknowledgements", () => {
  assert.throws(
    () => resolveWorkerRuntimeConfiguration(enabledEnvironment({
      NODE_ENV: "production",
      STORYTELLER_FILE_QUEUE_SINGLE_HOST: "true",
      STORYTELLER_FILE_ARTIFACT_STORE_SINGLE_HOST: "true",
      STORYTELLER_FILE_WORKER_SINGLE_HOST: undefined,
    }), root),
    /WORKER_PRODUCTION_SINGLE_HOST_ACK_REQUIRED/u,
  );

  const configuration = resolveWorkerRuntimeConfiguration(enabledEnvironment({
    NODE_ENV: "production",
    STORYTELLER_FILE_QUEUE_SINGLE_HOST: "true",
    STORYTELLER_FILE_ARTIFACT_STORE_SINGLE_HOST: "true",
    STORYTELLER_FILE_WORKER_SINGLE_HOST: "true",
  }), root);
  assert.equal(configuration.enabled, true);
  if (configuration.enabled) {
    assert.equal(configuration.productionSingleHostAcknowledged, true);
  }
});

test("worker configuration rejects unsafe drivers, timing and credential bindings", () => {
  assert.throws(
    () => resolveWorkerRuntimeConfiguration(enabledEnvironment({
      STORYTELLER_WORKER_MODE: "server",
    }), root),
    /WORKER_RUNTIME_MODE_INVALID/u,
  );
  assert.throws(
    () => resolveWorkerRuntimeConfiguration(enabledEnvironment({
      STORYTELLER_QUEUE_DRIVER: "disabled",
    }), root),
    /WORKER_FILE_QUEUE_DRIVER_REQUIRED/u,
  );
  assert.throws(
    () => resolveWorkerRuntimeConfiguration(enabledEnvironment({
      STORYTELLER_WORKER_LEASE_DURATION_MS: "2000",
      STORYTELLER_WORKER_HEARTBEAT_INTERVAL_MS: "1000",
    }), root),
    /WORKER_HEARTBEAT_INTERVAL_INVALID/u,
  );
  assert.throws(
    () => resolveWorkerRuntimeConfiguration(enabledEnvironment({
      STORYTELLER_WORKER_CREDENTIAL_BINDINGS: "{broken",
    }), root),
    /WORKER_CREDENTIAL_BINDINGS_JSON_INVALID/u,
  );
  assert.throws(
    () => resolveWorkerRuntimeConfiguration(enabledEnvironment({
      STORYTELLER_WORKER_CREDENTIAL_BINDINGS: JSON.stringify({
        provider_one: "SHARED_PROVIDER_SECRET",
        provider_two: "SHARED_PROVIDER_SECRET",
      }),
    }), root),
    /WORKER_CREDENTIAL_ENVIRONMENT_VARIABLE_DUPLICATE/u,
  );
});
