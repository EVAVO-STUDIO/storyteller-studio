import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import {
  publicationAlertRuntimeConfigurationSummary,
  resolvePublicationAlertRuntimeConfiguration,
} from "./publication-alert-configuration.js";
import type { WorkerEnvironment } from "./configuration.js";

const root = "C:/storyteller-publication-alert-runtime-test";
const recipientHash = "a".repeat(64);

function enabledEnvironment(
  overrides: WorkerEnvironment = {},
): WorkerEnvironment {
  return {
    NODE_ENV: "test",
    STORYTELLER_DATA_DIR: "./private-data",
    STORYTELLER_PUBLICATION_ALERT_MODE: "once",
    STORYTELLER_PUBLICATION_ALERT_WORKER_ID: "publication_alert_worker_001",
    STORYTELLER_PUBLICATION_ALERT_RECIPIENT_BINDINGS: JSON.stringify({
      [recipientHash]: "PUBLICATION_ALERT_PRIMARY_EMAIL",
    }),
    PUBLICATION_ALERT_PRIMARY_EMAIL: "alerts@example.test",
    STORYTELLER_PUBLICATION_ALERT_EMAIL_ENDPOINT:
      "https://mail-gateway.example.test/v1/messages",
    STORYTELLER_PUBLICATION_ALERT_EMAIL_TOKEN_ENV:
      "PUBLICATION_ALERT_EMAIL_TOKEN",
    PUBLICATION_ALERT_EMAIL_TOKEN: "private-email-token",
    STORYTELLER_PUBLICATION_ALERT_FROM_EMAIL_ENV:
      "PUBLICATION_ALERT_FROM_EMAIL",
    PUBLICATION_ALERT_FROM_EMAIL: "storyteller@example.test",
    STORYTELLER_PUBLICATION_ALERT_FROM_NAME: "Storyteller Operations",
    ...overrides,
  };
}

test("publication alert runtime is disabled by default without evaluating private settings", () => {
  const configuration = resolvePublicationAlertRuntimeConfiguration({
    STORYTELLER_PUBLICATION_ALERT_CONCURRENCY: "not-a-number",
    STORYTELLER_PUBLICATION_ALERT_RECIPIENT_BINDINGS: "{broken",
  }, root);
  assert.deepEqual(configuration, {
    mode: "disabled",
    enabled: false,
    persistence: "none",
    executionApiExposed: false,
  });
  assert.deepEqual(
    publicationAlertRuntimeConfigurationSummary(configuration),
    {
      mode: "disabled",
      enabled: false,
      persistence: "none",
      executionApiExposed: false,
      concurrency: 0,
      maximumBatchSize: 0,
      pollIntervalMs: 0,
      providerTimeoutMs: 0,
      shutdownGraceMs: 0,
      recipientBindingCount: 0,
      emailProviderConfigured: false,
      productionSingleHostAcknowledged: false,
    },
  );
});

test("enabled publication runtime resolves isolated file state and bounded controls", () => {
  const configuration = resolvePublicationAlertRuntimeConfiguration(
    enabledEnvironment({
      STORYTELLER_PUBLICATION_ALERT_MODE: "continuous",
      STORYTELLER_PUBLICATION_ALERT_CONCURRENCY: "4",
      STORYTELLER_PUBLICATION_ALERT_BATCH_SIZE: "250",
      STORYTELLER_PUBLICATION_ALERT_POLL_INTERVAL_MS: "45000",
      STORYTELLER_PUBLICATION_ALERT_PROVIDER_TIMEOUT_MS: "20000",
      STORYTELLER_PUBLICATION_ALERT_SHUTDOWN_GRACE_MS: "55000",
      STORYTELLER_PUBLICATION_ALERT_EMAIL_PROVIDER_ID: "private_mail_gateway",
      STORYTELLER_PUBLICATION_ALERT_EMAIL_ADAPTER_VERSION: "2.1.0",
    }),
    root,
  );
  assert.equal(configuration.enabled, true);
  if (!configuration.enabled) throw new Error("enabled configuration required");
  assert.equal(configuration.mode, "continuous");
  assert.equal(configuration.workerId, "publication_alert_worker_001");
  assert.equal(configuration.concurrency, 4);
  assert.equal(configuration.maximumBatchSize, 250);
  assert.equal(configuration.pollIntervalMs, 45_000);
  assert.equal(configuration.providerTimeoutMs, 20_000);
  assert.equal(configuration.shutdownGraceMs, 55_000);
  assert.equal(
    configuration.stateRootDirectory,
    resolve(root, "./private-data", "publication-operations"),
  );
  assert.equal(
    configuration.recipientBindings[recipientHash],
    "PUBLICATION_ALERT_PRIMARY_EMAIL",
  );
  assert.equal(configuration.emailGateway.providerId, "private_mail_gateway");
  assert.equal(configuration.emailGateway.adapterVersion, "2.1.0");
  assert.equal(configuration.executionApiExposed, false);
});

test("configuration summaries omit secrets, email addresses, endpoints, paths and worker identities", () => {
  const environment = enabledEnvironment();
  const configuration = resolvePublicationAlertRuntimeConfiguration(
    environment,
    root,
  );
  const summary = publicationAlertRuntimeConfigurationSummary(configuration);
  assert.equal(summary.enabled, true);
  assert.equal(summary.recipientBindingCount, 1);
  assert.equal(summary.emailProviderConfigured, true);
  const serialised = JSON.stringify(summary);
  for (const forbidden of [
    "private-email-token",
    "alerts@example.test",
    "storyteller@example.test",
    "PUBLICATION_ALERT_PRIMARY_EMAIL",
    "PUBLICATION_ALERT_EMAIL_TOKEN",
    "PUBLICATION_ALERT_FROM_EMAIL",
    "mail-gateway.example.test",
    "publication_alert_worker_001",
    "private-data",
    root,
    recipientHash,
  ]) {
    assert.equal(serialised.includes(forbidden), false);
  }
});

test("production publication runtime requires explicit single-host acknowledgement and HTTPS", () => {
  assert.throws(
    () => resolvePublicationAlertRuntimeConfiguration(enabledEnvironment({
      NODE_ENV: "production",
    }), root),
    /PUBLICATION_ALERT_RUNTIME_PRODUCTION_SINGLE_HOST_ACK_REQUIRED/u,
  );
  assert.throws(
    () => resolvePublicationAlertRuntimeConfiguration(enabledEnvironment({
      NODE_ENV: "production",
      STORYTELLER_FILE_PUBLICATION_ALERT_SINGLE_HOST: "true",
      STORYTELLER_PUBLICATION_ALERT_EMAIL_ENDPOINT:
        "http://localhost:3400/messages",
    }), root),
    /PUBLICATION_ALERT_RUNTIME_EMAIL_ENDPOINT_HTTPS_REQUIRED/u,
  );
  const configuration = resolvePublicationAlertRuntimeConfiguration(
    enabledEnvironment({
      NODE_ENV: "production",
      STORYTELLER_FILE_PUBLICATION_ALERT_SINGLE_HOST: "true",
    }),
    root,
  );
  assert.equal(configuration.enabled, true);
  if (configuration.enabled) {
    assert.equal(configuration.productionSingleHostAcknowledged, true);
  }
});

test("local HTTP email gateways are allowed only for non-production loopback testing", () => {
  const configuration = resolvePublicationAlertRuntimeConfiguration(
    enabledEnvironment({
      STORYTELLER_PUBLICATION_ALERT_EMAIL_ENDPOINT:
        "http://127.0.0.1:3400/messages",
    }),
    root,
  );
  assert.equal(configuration.enabled, true);
  if (configuration.enabled) {
    assert.equal(
      configuration.emailGateway.endpoint,
      "http://127.0.0.1:3400/messages",
    );
  }
});

test("unsafe modes, endpoints, bindings and bounded controls fail closed", () => {
  const cases: ReadonlyArray<readonly [WorkerEnvironment, RegExp]> = [
    [
      { STORYTELLER_PUBLICATION_ALERT_MODE: "server" },
      /PUBLICATION_ALERT_RUNTIME_MODE_INVALID/u,
    ],
    [
      enabledEnvironment({ STORYTELLER_DATA_DIR: undefined }),
      /PUBLICATION_ALERT_RUNTIME_DATA_DIR_REQUIRED/u,
    ],
    [
      enabledEnvironment({
        STORYTELLER_PUBLICATION_ALERT_RECIPIENT_BINDINGS: "{broken",
      }),
      /PUBLICATION_ALERT_RUNTIME_RECIPIENT_BINDINGS_JSON_INVALID/u,
    ],
    [
      enabledEnvironment({
        STORYTELLER_PUBLICATION_ALERT_RECIPIENT_BINDINGS: JSON.stringify({
          unsafe: "PUBLICATION_ALERT_PRIMARY_EMAIL",
        }),
      }),
      /PUBLICATION_ALERT_RUNTIME_RECIPIENT_HASH_INVALID/u,
    ],
    [
      enabledEnvironment({
        STORYTELLER_PUBLICATION_ALERT_RECIPIENT_BINDINGS: JSON.stringify({
          [recipientHash]: "unsafe-env",
        }),
      }),
      /PUBLICATION_ALERT_RUNTIME_RECIPIENT_ENV_INVALID/u,
    ],
    [
      enabledEnvironment({
        STORYTELLER_PUBLICATION_ALERT_EMAIL_ENDPOINT:
          "https://user:password@mail.example.test/messages",
      }),
      /PUBLICATION_ALERT_RUNTIME_EMAIL_ENDPOINT_UNSAFE/u,
    ],
    [
      enabledEnvironment({
        STORYTELLER_PUBLICATION_ALERT_EMAIL_ENDPOINT:
          "http://mail.example.test/messages",
      }),
      /PUBLICATION_ALERT_RUNTIME_EMAIL_ENDPOINT_HTTPS_REQUIRED/u,
    ],
    [
      enabledEnvironment({
        STORYTELLER_PUBLICATION_ALERT_CONCURRENCY: "17",
      }),
      /PUBLICATION_ALERT_RUNTIME_CONCURRENCY_INVALID/u,
    ],
    [
      enabledEnvironment({
        STORYTELLER_PUBLICATION_ALERT_BATCH_SIZE: "0",
      }),
      /PUBLICATION_ALERT_RUNTIME_BATCH_SIZE_INVALID/u,
    ],
    [
      enabledEnvironment({
        STORYTELLER_PUBLICATION_ALERT_POLL_INTERVAL_MS: "999",
      }),
      /PUBLICATION_ALERT_RUNTIME_POLL_INTERVAL_INVALID/u,
    ],
    [
      enabledEnvironment({
        STORYTELLER_PUBLICATION_ALERT_EMAIL_TOKEN_ENV: "unsafe-token-env",
      }),
      /PUBLICATION_ALERT_RUNTIME_EMAIL_TOKEN_ENV_INVALID/u,
    ],
  ];
  for (const [environment, expected] of cases) {
    assert.throws(
      () => resolvePublicationAlertRuntimeConfiguration(environment, root),
      expected,
    );
  }
});
