import assert from "node:assert/strict";
import test from "node:test";
import { stableHash } from "@evavo/storyteller-engine";
import type { WorkerEnvironment } from "./configuration.js";
import { runPublicationOperationsPreflight } from "./publication-operations-preflight.js";

const workingDirectory = "C:/storyteller-publication-operations-preflight";
const recipientReferenceHash = stableHash({
  route: "publication-operations-primary",
});
const sharedGatewayToken = "private-publication-evidence-gateway-token";
const emailToken = "private-publication-alert-email-token";

function environment(
  overrides: WorkerEnvironment = {},
): WorkerEnvironment {
  return {
    NODE_ENV: "test",
    STORYTELLER_DATA_DIR: "./private-data",

    STORYTELLER_PUBLICATION_ALERT_MODE: "continuous",
    STORYTELLER_PUBLICATION_ALERT_WORKER_ID:
      "publication_operations_alert_worker_001",
    STORYTELLER_PUBLICATION_ALERT_RECIPIENT_BINDINGS: JSON.stringify({
      [recipientReferenceHash]: "PUBLICATION_OPERATIONS_RECIPIENT_EMAIL",
    }),
    PUBLICATION_OPERATIONS_RECIPIENT_EMAIL: "operations@example.test",
    STORYTELLER_PUBLICATION_ALERT_EMAIL_ENDPOINT:
      "https://mail-gateway.example.test/v1/messages",
    STORYTELLER_PUBLICATION_ALERT_EMAIL_TOKEN_ENV:
      "PUBLICATION_OPERATIONS_EMAIL_TOKEN",
    PUBLICATION_OPERATIONS_EMAIL_TOKEN: emailToken,
    STORYTELLER_PUBLICATION_ALERT_FROM_EMAIL_ENV:
      "PUBLICATION_OPERATIONS_FROM_EMAIL",
    PUBLICATION_OPERATIONS_FROM_EMAIL: "storyteller@example.test",

    STORYTELLER_PUBLICATION_REFRESH_MODE: "continuous",
    STORYTELLER_PUBLICATION_REFRESH_WORKER_ID:
      "publication_operations_refresh_worker_001",
    STORYTELLER_PUBLICATION_REFRESH_RECIPIENT_REFERENCE_HASH:
      recipientReferenceHash,
    STORYTELLER_PUBLICATION_REFRESH_VERIFICATION_ENDPOINT:
      "http://127.0.0.1:8789/v1/publication-evidence",
    STORYTELLER_PUBLICATION_REFRESH_VERIFICATION_TOKEN_ENV:
      "PUBLICATION_OPERATIONS_GATEWAY_TOKEN",
    STORYTELLER_PUBLICATION_REFRESH_ACQUISITION_TIMEOUT_MS: "30000",

    STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_MODE: "serve",
    STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_ID:
      "publication_operations_evidence_gateway_001",
    STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_BIND_HOST: "127.0.0.1",
    STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_PORT: "8789",
    STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_TOKEN_ENV:
      "PUBLICATION_OPERATIONS_GATEWAY_TOKEN",
    STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_REQUEST_TIMEOUT_MS: "15000",
    PUBLICATION_OPERATIONS_GATEWAY_TOKEN: sharedGatewayToken,
    ...overrides,
  };
}

test("publication operations preflight validates one complete direct-loopback deployment", () => {
  const result = runPublicationOperationsPreflight(
    environment(),
    workingDirectory,
  );
  assert.deepEqual(result, {
    status: "ready",
    executionApiExposed: false,
    publicGatewayExposed: false,
    sharedPublicationState: true,
    gatewayTokenMatched: true,
    recipientRouteMatched: true,
    roleIdentitiesDistinct: true,
    gatewayEndpointAligned: true,
    acquisitionDeadlineCompatible: true,
    singleHostAcknowledgementsComplete: false,
    alertMode: "continuous",
    refreshMode: "continuous",
    gatewayMode: "serve",
    gatewayTransport: "direct-loopback",
  });
});

test("preflight summary omits secrets, routes, identities, endpoints and paths", () => {
  const input = environment();
  const result = runPublicationOperationsPreflight(input, workingDirectory);
  const serialised = JSON.stringify(result);
  for (const forbidden of [
    sharedGatewayToken,
    emailToken,
    recipientReferenceHash,
    "operations@example.test",
    "storyteller@example.test",
    "publication_operations_alert_worker_001",
    "publication_operations_refresh_worker_001",
    "publication_operations_evidence_gateway_001",
    "mail-gateway.example.test",
    "127.0.0.1",
    "publication-operations",
    workingDirectory,
    "PUBLICATION_OPERATIONS_GATEWAY_TOKEN",
    "PUBLICATION_OPERATIONS_RECIPIENT_EMAIL",
  ]) {
    assert.equal(serialised.includes(forbidden), false);
  }
});

test("preflight fails closed when any publication role is disabled", () => {
  assert.throws(
    () => runPublicationOperationsPreflight(
      environment({ STORYTELLER_PUBLICATION_ALERT_MODE: "disabled" }),
      workingDirectory,
    ),
    /PUBLICATION_OPERATIONS_PREFLIGHT_ALERT_DISABLED/u,
  );
  assert.throws(
    () => runPublicationOperationsPreflight(
      environment({ STORYTELLER_PUBLICATION_REFRESH_MODE: "disabled" }),
      workingDirectory,
    ),
    /PUBLICATION_OPERATIONS_PREFLIGHT_REFRESH_DISABLED/u,
  );
  assert.throws(
    () => runPublicationOperationsPreflight(
      environment({
        STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_MODE: "disabled",
      }),
      workingDirectory,
    ),
    /PUBLICATION_OPERATIONS_PREFLIGHT_GATEWAY_DISABLED/u,
  );
});

test("preflight rejects token, route and role identity mismatches", () => {
  assert.throws(
    () => runPublicationOperationsPreflight(
      environment({ PUBLICATION_OPERATIONS_GATEWAY_TOKEN: "different-token" }),
      workingDirectory,
    ),
    /PUBLICATION_OPERATIONS_PREFLIGHT_GATEWAY_TOKEN_MISMATCH/u,
  );
  assert.throws(
    () => runPublicationOperationsPreflight(
      environment({
        STORYTELLER_PUBLICATION_ALERT_RECIPIENT_BINDINGS: JSON.stringify({
          ["b".repeat(64)]: "PUBLICATION_OPERATIONS_RECIPIENT_EMAIL",
        }),
      }),
      workingDirectory,
    ),
    /PUBLICATION_OPERATIONS_PREFLIGHT_RECIPIENT_ROUTE_MISSING/u,
  );
  assert.throws(
    () => runPublicationOperationsPreflight(
      environment({
        STORYTELLER_PUBLICATION_REFRESH_WORKER_ID:
          "publication_operations_alert_worker_001",
      }),
      workingDirectory,
    ),
    /PUBLICATION_OPERATIONS_PREFLIGHT_ROLE_IDENTITY_COLLISION/u,
  );
});

test("preflight rejects direct endpoint and deadline drift", () => {
  assert.throws(
    () => runPublicationOperationsPreflight(
      environment({
        STORYTELLER_PUBLICATION_REFRESH_VERIFICATION_ENDPOINT:
          "http://127.0.0.1:8790/v1/publication-evidence",
      }),
      workingDirectory,
    ),
    /PUBLICATION_OPERATIONS_PREFLIGHT_LOOPBACK_ENDPOINT_MISMATCH/u,
  );
  assert.throws(
    () => runPublicationOperationsPreflight(
      environment({
        STORYTELLER_PUBLICATION_REFRESH_ACQUISITION_TIMEOUT_MS: "10000",
        STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_REQUEST_TIMEOUT_MS: "15000",
      }),
      workingDirectory,
    ),
    /PUBLICATION_OPERATIONS_PREFLIGHT_ACQUISITION_DEADLINE_INVALID/u,
  );
});

test("explicit private proxy acknowledgement supports TLS termination before a loopback gateway", () => {
  const result = runPublicationOperationsPreflight(
    environment({
      STORYTELLER_PUBLICATION_REFRESH_VERIFICATION_ENDPOINT:
        "https://publication-evidence.internal.example.test/v1/publication-evidence",
      STORYTELLER_PUBLICATION_OPERATIONS_GATEWAY_PROXY: "true",
    }),
    workingDirectory,
  );
  assert.equal(result.gatewayTransport, "private-proxy");
});

test("production preflight reports complete single-host acknowledgements", () => {
  const result = runPublicationOperationsPreflight(
    environment({
      NODE_ENV: "production",
      STORYTELLER_PUBLICATION_REFRESH_VERIFICATION_ENDPOINT:
        "https://publication-evidence.internal.example.test/v1/publication-evidence",
      STORYTELLER_PUBLICATION_OPERATIONS_GATEWAY_PROXY: "true",
      STORYTELLER_FILE_PUBLICATION_ALERT_SINGLE_HOST: "true",
      STORYTELLER_FILE_PUBLICATION_REFRESH_SINGLE_HOST: "true",
      STORYTELLER_FILE_PUBLICATION_EVIDENCE_GATEWAY_SINGLE_HOST: "true",
    }),
    workingDirectory,
  );
  assert.equal(result.singleHostAcknowledgementsComplete, true);
});
