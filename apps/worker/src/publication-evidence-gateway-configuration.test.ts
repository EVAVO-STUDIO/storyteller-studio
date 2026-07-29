import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import type { WorkerEnvironment } from "./configuration.js";
import {
  publicationEvidenceGatewayConfigurationSummary,
  resolvePublicationEvidenceGatewayConfiguration,
} from "./publication-evidence-gateway-configuration.js";

const root = "C:/storyteller-publication-evidence-gateway-test";

function enabledEnvironment(
  overrides: WorkerEnvironment = {},
): WorkerEnvironment {
  return {
    NODE_ENV: "test",
    STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_MODE: "serve",
    STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_ID:
      "publication_evidence_gateway_001",
    STORYTELLER_DATA_DIR: "./private-data",
    STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_BIND_HOST: "127.0.0.1",
    STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_PORT: "8789",
    STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_TOKEN_ENV:
      "PUBLICATION_EVIDENCE_GATEWAY_TOKEN",
    PUBLICATION_EVIDENCE_GATEWAY_TOKEN: "private-gateway-token",
    ...overrides,
  };
}

test("publication evidence gateway is disabled by default without evaluating private settings", () => {
  const configuration = resolvePublicationEvidenceGatewayConfiguration({
    STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_PORT: "invalid",
  }, root);
  assert.deepEqual(configuration, {
    mode: "disabled",
    enabled: false,
    persistence: "none",
    publicExecutionApiExposed: false,
    privateGatewayExposed: false,
  });
  assert.deepEqual(publicationEvidenceGatewayConfigurationSummary(configuration), {
    mode: "disabled",
    enabled: false,
    persistence: "none",
    publicExecutionApiExposed: false,
    privateGatewayExposed: false,
    maximumBodyBytes: 0,
    requestTimeoutMs: 0,
    shutdownGraceMs: 0,
    loopbackBound: true,
    productionSingleHostAcknowledged: false,
    privateNetworkAcknowledged: false,
  });
});

test("enabled gateway configuration resolves bounded loopback private controls", () => {
  const configuration = resolvePublicationEvidenceGatewayConfiguration(
    enabledEnvironment({
      STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_PORT: "8899",
      STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_MAX_BODY_BYTES: "524288",
      STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_REQUEST_TIMEOUT_MS: "12000",
      STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_SHUTDOWN_GRACE_MS: "20000",
    }),
    root,
  );
  assert.equal(configuration.enabled, true);
  if (!configuration.enabled) throw new Error("enabled configuration required");
  assert.equal(configuration.mode, "serve");
  assert.equal(configuration.bindHost, "127.0.0.1");
  assert.equal(configuration.port, 8_899);
  assert.equal(configuration.maximumBodyBytes, 524_288);
  assert.equal(configuration.requestTimeoutMs, 12_000);
  assert.equal(configuration.shutdownGraceMs, 20_000);
  assert.equal(
    configuration.stateRootDirectory,
    resolve(root, "./private-data", "publication-operations"),
  );
  assert.equal(configuration.publicExecutionApiExposed, false);
  assert.equal(configuration.privateGatewayExposed, true);
});

test("safe summaries omit identity, path, host, port and token binding", () => {
  const configuration = resolvePublicationEvidenceGatewayConfiguration(
    enabledEnvironment(),
    root,
  );
  const serialised = JSON.stringify(
    publicationEvidenceGatewayConfigurationSummary(configuration),
  );
  for (const forbidden of [
    "publication_evidence_gateway_001",
    "private-data",
    root,
    "127.0.0.1",
    "8789",
    "PUBLICATION_EVIDENCE_GATEWAY_TOKEN",
    "private-gateway-token",
  ]) {
    assert.equal(serialised.includes(forbidden), false);
  }
});

test("non-loopback binding requires explicit private-network acknowledgement", () => {
  assert.throws(
    () => resolvePublicationEvidenceGatewayConfiguration(
      enabledEnvironment({
        STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_BIND_HOST:
          "gateway.internal.example",
      }),
      root,
    ),
    /PUBLICATION_EVIDENCE_GATEWAY_PRIVATE_NETWORK_ACK_REQUIRED/u,
  );
  const configuration = resolvePublicationEvidenceGatewayConfiguration(
    enabledEnvironment({
      STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_BIND_HOST:
        "gateway.internal.example",
      STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_PRIVATE_NETWORK: "true",
    }),
    root,
  );
  assert.equal(configuration.enabled, true);
  if (configuration.enabled) {
    assert.equal(configuration.privateNetworkAcknowledged, true);
    assert.equal(
      publicationEvidenceGatewayConfigurationSummary(configuration).loopbackBound,
      false,
    );
  }
});

test("production file gateway requires single-host acknowledgement", () => {
  assert.throws(
    () => resolvePublicationEvidenceGatewayConfiguration(
      enabledEnvironment({ NODE_ENV: "production" }),
      root,
    ),
    /PUBLICATION_EVIDENCE_GATEWAY_PRODUCTION_SINGLE_HOST_ACK_REQUIRED/u,
  );
  const configuration = resolvePublicationEvidenceGatewayConfiguration(
    enabledEnvironment({
      NODE_ENV: "production",
      STORYTELLER_FILE_PUBLICATION_EVIDENCE_GATEWAY_SINGLE_HOST: "true",
    }),
    root,
  );
  assert.equal(configuration.enabled, true);
  if (configuration.enabled) {
    assert.equal(configuration.productionSingleHostAcknowledged, true);
  }
});

test("gateway configuration rejects unsafe modes, hosts and secret references", () => {
  assert.throws(
    () => resolvePublicationEvidenceGatewayConfiguration(
      enabledEnvironment({
        STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_MODE: "public",
      }),
      root,
    ),
    /PUBLICATION_EVIDENCE_GATEWAY_MODE_INVALID/u,
  );
  assert.throws(
    () => resolvePublicationEvidenceGatewayConfiguration(
      enabledEnvironment({
        STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_BIND_HOST: "bad host value",
      }),
      root,
    ),
    /PUBLICATION_EVIDENCE_GATEWAY_BIND_HOST_INVALID/u,
  );
  assert.throws(
    () => resolvePublicationEvidenceGatewayConfiguration(
      enabledEnvironment({
        STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_TOKEN_ENV: "not-an-env-var",
      }),
      root,
    ),
    /PUBLICATION_EVIDENCE_GATEWAY_TOKEN_ENV_INVALID/u,
  );
});

test("gateway configuration rejects out-of-range body, port and timing controls", () => {
  assert.throws(
    () => resolvePublicationEvidenceGatewayConfiguration(
      enabledEnvironment({
        STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_PORT: "65536",
      }),
      root,
    ),
    /PUBLICATION_EVIDENCE_GATEWAY_PORT_INVALID/u,
  );
  assert.throws(
    () => resolvePublicationEvidenceGatewayConfiguration(
      enabledEnvironment({
        STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_MAX_BODY_BYTES: "1000",
      }),
      root,
    ),
    /PUBLICATION_EVIDENCE_GATEWAY_MAX_BODY_INVALID/u,
  );
  assert.throws(
    () => resolvePublicationEvidenceGatewayConfiguration(
      enabledEnvironment({
        STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_REQUEST_TIMEOUT_MS: "99",
      }),
      root,
    ),
    /PUBLICATION_EVIDENCE_GATEWAY_REQUEST_TIMEOUT_INVALID/u,
  );
  assert.throws(
    () => resolvePublicationEvidenceGatewayConfiguration(
      enabledEnvironment({
        STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_SHUTDOWN_GRACE_MS: "999",
      }),
      root,
    ),
    /PUBLICATION_EVIDENCE_GATEWAY_SHUTDOWN_GRACE_INVALID/u,
  );
});
