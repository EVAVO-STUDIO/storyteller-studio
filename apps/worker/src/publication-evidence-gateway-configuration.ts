import { resolve } from "node:path";
import type { WorkerEnvironment } from "./configuration.js";

export type PublicationEvidenceGatewayMode = "disabled" | "serve";

export type PublicationEvidenceGatewayConfiguration =
  | Readonly<{
      mode: "disabled";
      enabled: false;
      persistence: "none";
      publicExecutionApiExposed: false;
      privateGatewayExposed: false;
    }>
  | Readonly<{
      mode: "serve";
      enabled: true;
      persistence: "single-host-file";
      publicExecutionApiExposed: false;
      privateGatewayExposed: true;
      gatewayId: string;
      stateRootDirectory: string;
      bindHost: string;
      port: number;
      tokenEnvironmentVariable: string;
      maximumBodyBytes: number;
      requestTimeoutMs: number;
      shutdownGraceMs: number;
      productionSingleHostAcknowledged: boolean;
      privateNetworkAcknowledged: boolean;
    }>;

export interface PublicationEvidenceGatewayConfigurationSummary {
  mode: PublicationEvidenceGatewayMode;
  enabled: boolean;
  persistence: "none" | "single-host-file";
  publicExecutionApiExposed: false;
  privateGatewayExposed: boolean;
  maximumBodyBytes: number;
  requestTimeoutMs: number;
  shutdownGraceMs: number;
  loopbackBound: boolean;
  productionSingleHostAcknowledged: boolean;
  privateNetworkAcknowledged: boolean;
}

const MODE_PATTERN = /^(?:disabled|serve)$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const ENVIRONMENT_VARIABLE_PATTERN = /^[A-Z][A-Z0-9_]{2,127}$/u;
const HOST_PATTERN = /^(?:localhost|127\.0\.0\.1|::1|[A-Za-z0-9][A-Za-z0-9.-]{0,252})$/u;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isProduction(environment: WorkerEnvironment): boolean {
  return environment.NODE_ENV === "production"
    || environment.VERCEL_ENV === "production";
}

function acknowledged(value: string | undefined): boolean {
  return value?.trim().toLocaleLowerCase("en-AU") === "true";
}

function requireIdentifier(value: string | undefined, code: string): string {
  const candidate = value?.trim() ?? "";
  if (!SAFE_IDENTIFIER.test(candidate)) throw new Error(code);
  return candidate;
}

function requireEnvironmentVariable(
  value: string | undefined,
  code: string,
): string {
  const candidate = value?.trim() ?? "";
  if (!ENVIRONMENT_VARIABLE_PATTERN.test(candidate)) throw new Error(code);
  return candidate;
}

function integer(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(code);
  }
  return parsed;
}

function bindHost(
  value: string | undefined,
  privateNetworkAcknowledged: boolean,
): string {
  const candidate = value?.trim() || "127.0.0.1";
  if (!HOST_PATTERN.test(candidate)) {
    throw new Error("PUBLICATION_EVIDENCE_GATEWAY_BIND_HOST_INVALID");
  }
  if (!LOOPBACK_HOSTS.has(candidate) && !privateNetworkAcknowledged) {
    throw new Error(
      "PUBLICATION_EVIDENCE_GATEWAY_PRIVATE_NETWORK_ACK_REQUIRED",
    );
  }
  return candidate;
}

export function resolvePublicationEvidenceGatewayConfiguration(
  environment: WorkerEnvironment = process.env,
  workingDirectory = process.cwd(),
): PublicationEvidenceGatewayConfiguration {
  const rawMode = environment.STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_MODE
    ?.trim()
    .toLocaleLowerCase("en-AU") ?? "disabled";
  if (!MODE_PATTERN.test(rawMode)) {
    throw new Error("PUBLICATION_EVIDENCE_GATEWAY_MODE_INVALID");
  }
  const mode = rawMode as PublicationEvidenceGatewayMode;
  if (mode === "disabled") {
    return Object.freeze({
      mode,
      enabled: false,
      persistence: "none",
      publicExecutionApiExposed: false,
      privateGatewayExposed: false,
    });
  }

  const dataDirectory = environment.STORYTELLER_DATA_DIR?.trim();
  if (!dataDirectory) {
    throw new Error("PUBLICATION_EVIDENCE_GATEWAY_DATA_DIR_REQUIRED");
  }
  const productionSingleHostAcknowledged = acknowledged(
    environment.STORYTELLER_FILE_PUBLICATION_EVIDENCE_GATEWAY_SINGLE_HOST,
  );
  const privateNetworkAcknowledged = acknowledged(
    environment.STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_PRIVATE_NETWORK,
  );
  const production = isProduction(environment);
  if (production && !productionSingleHostAcknowledged) {
    throw new Error(
      "PUBLICATION_EVIDENCE_GATEWAY_PRODUCTION_SINGLE_HOST_ACK_REQUIRED",
    );
  }

  const configuration = {
    mode: "serve" as const,
    enabled: true as const,
    persistence: "single-host-file" as const,
    publicExecutionApiExposed: false as const,
    privateGatewayExposed: true as const,
    gatewayId: requireIdentifier(
      environment.STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_ID,
      "PUBLICATION_EVIDENCE_GATEWAY_ID_INVALID",
    ),
    stateRootDirectory: resolve(
      workingDirectory,
      dataDirectory,
      "publication-operations",
    ),
    bindHost: bindHost(
      environment.STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_BIND_HOST,
      privateNetworkAcknowledged,
    ),
    port: integer(
      environment.STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_PORT,
      8789,
      1,
      65_535,
      "PUBLICATION_EVIDENCE_GATEWAY_PORT_INVALID",
    ),
    tokenEnvironmentVariable: requireEnvironmentVariable(
      environment.STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_TOKEN_ENV,
      "PUBLICATION_EVIDENCE_GATEWAY_TOKEN_ENV_INVALID",
    ),
    maximumBodyBytes: integer(
      environment.STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_MAX_BODY_BYTES,
      256 * 1024,
      1_024,
      2 * 1024 * 1024,
      "PUBLICATION_EVIDENCE_GATEWAY_MAX_BODY_INVALID",
    ),
    requestTimeoutMs: integer(
      environment.STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_REQUEST_TIMEOUT_MS,
      15_000,
      100,
      120_000,
      "PUBLICATION_EVIDENCE_GATEWAY_REQUEST_TIMEOUT_INVALID",
    ),
    shutdownGraceMs: integer(
      environment.STORYTELLER_PUBLICATION_EVIDENCE_GATEWAY_SHUTDOWN_GRACE_MS,
      30_000,
      1_000,
      5 * 60_000,
      "PUBLICATION_EVIDENCE_GATEWAY_SHUTDOWN_GRACE_INVALID",
    ),
    productionSingleHostAcknowledged,
    privateNetworkAcknowledged,
  } satisfies Extract<PublicationEvidenceGatewayConfiguration, { enabled: true }>;
  return Object.freeze(configuration);
}

export function publicationEvidenceGatewayConfigurationSummary(
  configuration: PublicationEvidenceGatewayConfiguration,
): PublicationEvidenceGatewayConfigurationSummary {
  if (!configuration.enabled) {
    return Object.freeze({
      mode: configuration.mode,
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
  }
  return Object.freeze({
    mode: configuration.mode,
    enabled: true,
    persistence: configuration.persistence,
    publicExecutionApiExposed: false,
    privateGatewayExposed: true,
    maximumBodyBytes: configuration.maximumBodyBytes,
    requestTimeoutMs: configuration.requestTimeoutMs,
    shutdownGraceMs: configuration.shutdownGraceMs,
    loopbackBound: LOOPBACK_HOSTS.has(configuration.bindHost),
    productionSingleHostAcknowledged:
      configuration.productionSingleHostAcknowledged,
    privateNetworkAcknowledged: configuration.privateNetworkAcknowledged,
  });
}
