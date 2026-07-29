import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { stableHash } from "@evavo/storyteller-engine";
import {
  publicationRefreshRuntimeConfigurationSummary,
  resolvePublicationRefreshRuntimeConfiguration,
} from "./publication-refresh-configuration.js";
import type { WorkerEnvironment } from "./configuration.js";

const root = "C:/storyteller-publication-refresh-test";
const recipientReferenceHash = stableHash({
  route: "publication-refresh-primary",
});

function enabledEnvironment(
  overrides: WorkerEnvironment = {},
): WorkerEnvironment {
  return {
    NODE_ENV: "test",
    STORYTELLER_PUBLICATION_REFRESH_MODE: "once",
    STORYTELLER_PUBLICATION_REFRESH_WORKER_ID: "publication_refresh_runtime_001",
    STORYTELLER_DATA_DIR: "./private-data",
    STORYTELLER_PUBLICATION_REFRESH_RECIPIENT_REFERENCE_HASH:
      recipientReferenceHash,
    STORYTELLER_PUBLICATION_REFRESH_VERIFICATION_ENDPOINT:
      "https://verification.example.test/v1/publication-evidence",
    STORYTELLER_PUBLICATION_REFRESH_VERIFICATION_TOKEN_ENV:
      "PUBLICATION_REFRESH_GATEWAY_TOKEN",
    PUBLICATION_REFRESH_GATEWAY_TOKEN: "private-refresh-token",
    ...overrides,
  };
}

test("publication refresh runtime is disabled by default without evaluating secrets", () => {
  const configuration = resolvePublicationRefreshRuntimeConfiguration({
    STORYTELLER_PUBLICATION_REFRESH_CONCURRENCY: "invalid",
  }, root);
  assert.deepEqual(configuration, {
    mode: "disabled",
    enabled: false,
    persistence: "none",
    executionApiExposed: false,
  });
  assert.deepEqual(publicationRefreshRuntimeConfigurationSummary(configuration), {
    mode: "disabled",
    enabled: false,
    persistence: "none",
    executionApiExposed: false,
    concurrency: 0,
    maximumBatchSize: 0,
    pollIntervalMs: 0,
    acquisitionTimeoutMs: 0,
    shutdownGraceMs: 0,
    verificationProviderConfigured: false,
    productionSingleHostAcknowledged: false,
  });
});

test("enabled publication refresh configuration resolves bounded private controls", () => {
  const configuration = resolvePublicationRefreshRuntimeConfiguration(
    enabledEnvironment({
      STORYTELLER_PUBLICATION_REFRESH_MODE: "continuous",
      STORYTELLER_PUBLICATION_REFRESH_CONCURRENCY: "4",
      STORYTELLER_PUBLICATION_REFRESH_BATCH_SIZE: "250",
      STORYTELLER_PUBLICATION_REFRESH_POLL_INTERVAL_MS: "90000",
      STORYTELLER_PUBLICATION_REFRESH_ACQUISITION_TIMEOUT_MS: "45000",
      STORYTELLER_PUBLICATION_REFRESH_SHUTDOWN_GRACE_MS: "20000",
      STORYTELLER_PUBLICATION_REFRESH_PROVIDER_ID:
        "governed_publication_verification",
      STORYTELLER_PUBLICATION_REFRESH_ADAPTER_VERSION: "2.1.0",
    }),
    root,
  );
  assert.equal(configuration.enabled, true);
  if (!configuration.enabled) throw new Error("enabled configuration required");
  assert.equal(configuration.mode, "continuous");
  assert.equal(configuration.concurrency, 4);
  assert.equal(configuration.maximumBatchSize, 250);
  assert.equal(configuration.pollIntervalMs, 90_000);
  assert.equal(configuration.acquisitionTimeoutMs, 45_000);
  assert.equal(configuration.shutdownGraceMs, 20_000);
  assert.equal(configuration.recipientReferenceHash, recipientReferenceHash);
  assert.equal(
    configuration.stateRootDirectory,
    resolve(root, "./private-data", "publication-operations"),
  );
  assert.equal(
    configuration.verificationGateway.providerId,
    "governed_publication_verification",
  );
  assert.equal(configuration.verificationGateway.adapterVersion, "2.1.0");
  assert.equal(configuration.executionApiExposed, false);
});

test("safe summaries omit worker, path, endpoint, token binding and recipient hash", () => {
  const configuration = resolvePublicationRefreshRuntimeConfiguration(
    enabledEnvironment(),
    root,
  );
  const serialised = JSON.stringify(
    publicationRefreshRuntimeConfigurationSummary(configuration),
  );
  for (const forbidden of [
    "publication_refresh_runtime_001",
    "private-data",
    root,
    "verification.example.test",
    "PUBLICATION_REFRESH_GATEWAY_TOKEN",
    "private-refresh-token",
    recipientReferenceHash,
  ]) {
    assert.equal(serialised.includes(forbidden), false);
  }
});

test("production file refresh runtime requires explicit single-host acknowledgement", () => {
  assert.throws(
    () => resolvePublicationRefreshRuntimeConfiguration(
      enabledEnvironment({ NODE_ENV: "production" }),
      root,
    ),
    /PUBLICATION_REFRESH_RUNTIME_PRODUCTION_SINGLE_HOST_ACK_REQUIRED/u,
  );
  const configuration = resolvePublicationRefreshRuntimeConfiguration(
    enabledEnvironment({
      NODE_ENV: "production",
      STORYTELLER_FILE_PUBLICATION_REFRESH_SINGLE_HOST: "true",
    }),
    root,
  );
  assert.equal(configuration.enabled, true);
  if (configuration.enabled) {
    assert.equal(configuration.productionSingleHostAcknowledged, true);
  }
});

test("configuration rejects unsafe modes, endpoints, hashes and secret references", () => {
  assert.throws(
    () => resolvePublicationRefreshRuntimeConfiguration(
      enabledEnvironment({ STORYTELLER_PUBLICATION_REFRESH_MODE: "server" }),
      root,
    ),
    /PUBLICATION_REFRESH_RUNTIME_MODE_INVALID/u,
  );
  assert.throws(
    () => resolvePublicationRefreshRuntimeConfiguration(
      enabledEnvironment({
        STORYTELLER_PUBLICATION_REFRESH_RECIPIENT_REFERENCE_HASH: "raw-email",
      }),
      root,
    ),
    /PUBLICATION_REFRESH_RUNTIME_RECIPIENT_HASH_INVALID/u,
  );
  assert.throws(
    () => resolvePublicationRefreshRuntimeConfiguration(
      enabledEnvironment({
        STORYTELLER_PUBLICATION_REFRESH_VERIFICATION_ENDPOINT:
          "http://remote.example.test/evidence",
      }),
      root,
    ),
    /PUBLICATION_REFRESH_RUNTIME_VERIFICATION_ENDPOINT_HTTPS_REQUIRED/u,
  );
  assert.throws(
    () => resolvePublicationRefreshRuntimeConfiguration(
      enabledEnvironment({
        STORYTELLER_PUBLICATION_REFRESH_VERIFICATION_ENDPOINT:
          "https://user:secret@example.test/evidence",
      }),
      root,
    ),
    /PUBLICATION_REFRESH_RUNTIME_VERIFICATION_ENDPOINT_UNSAFE/u,
  );
  assert.throws(
    () => resolvePublicationRefreshRuntimeConfiguration(
      enabledEnvironment({
        STORYTELLER_PUBLICATION_REFRESH_VERIFICATION_TOKEN_ENV:
          "not-an-environment-variable",
      }),
      root,
    ),
    /PUBLICATION_REFRESH_RUNTIME_TOKEN_ENV_INVALID/u,
  );
});

test("configuration rejects out-of-range operational controls", () => {
  assert.throws(
    () => resolvePublicationRefreshRuntimeConfiguration(
      enabledEnvironment({
        STORYTELLER_PUBLICATION_REFRESH_CONCURRENCY: "17",
      }),
      root,
    ),
    /PUBLICATION_REFRESH_RUNTIME_CONCURRENCY_INVALID/u,
  );
  assert.throws(
    () => resolvePublicationRefreshRuntimeConfiguration(
      enabledEnvironment({
        STORYTELLER_PUBLICATION_REFRESH_BATCH_SIZE: "0",
      }),
      root,
    ),
    /PUBLICATION_REFRESH_RUNTIME_BATCH_SIZE_INVALID/u,
  );
  assert.throws(
    () => resolvePublicationRefreshRuntimeConfiguration(
      enabledEnvironment({
        STORYTELLER_PUBLICATION_REFRESH_POLL_INTERVAL_MS: "999",
      }),
      root,
    ),
    /PUBLICATION_REFRESH_RUNTIME_POLL_INTERVAL_INVALID/u,
  );
  assert.throws(
    () => resolvePublicationRefreshRuntimeConfiguration(
      enabledEnvironment({
        STORYTELLER_PUBLICATION_REFRESH_ACQUISITION_TIMEOUT_MS: "99",
      }),
      root,
    ),
    /PUBLICATION_REFRESH_RUNTIME_ACQUISITION_TIMEOUT_INVALID/u,
  );
});
