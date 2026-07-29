import { timingSafeEqual } from "node:crypto";
import {
  resolvePublicationAlertRuntimeConfiguration,
  type PublicationAlertRuntimeConfiguration,
} from "./publication-alert-configuration.js";
import {
  resolvePublicationEvidenceGatewayConfiguration,
  type PublicationEvidenceGatewayConfiguration,
} from "./publication-evidence-gateway-configuration.js";
import {
  resolvePublicationRefreshRuntimeConfiguration,
  type PublicationRefreshRuntimeConfiguration,
} from "./publication-refresh-configuration.js";
import type { WorkerEnvironment } from "./configuration.js";

export type PublicationOperationsGatewayTransport =
  | "direct-loopback"
  | "private-network"
  | "private-proxy";

export interface PublicationOperationsPreflightSummary {
  status: "ready";
  executionApiExposed: false;
  publicGatewayExposed: false;
  sharedPublicationState: true;
  gatewayTokenMatched: true;
  recipientRouteMatched: true;
  roleIdentitiesDistinct: true;
  gatewayEndpointAligned: true;
  acquisitionDeadlineCompatible: true;
  singleHostAcknowledgementsComplete: boolean;
  alertMode: "once" | "continuous";
  refreshMode: "once" | "continuous";
  gatewayMode: "serve";
  gatewayTransport: PublicationOperationsGatewayTransport;
}

export class PublicationOperationsPreflightError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PublicationOperationsPreflightError";
    this.code = code;
  }
}

type EnabledAlertConfiguration = Extract<
  PublicationAlertRuntimeConfiguration,
  { enabled: true }
>;
type EnabledRefreshConfiguration = Extract<
  PublicationRefreshRuntimeConfiguration,
  { enabled: true }
>;
type EnabledGatewayConfiguration = Extract<
  PublicationEvidenceGatewayConfiguration,
  { enabled: true }
>;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

function enabledAlert(
  configuration: PublicationAlertRuntimeConfiguration,
): EnabledAlertConfiguration {
  if (!configuration.enabled) {
    throw new PublicationOperationsPreflightError(
      "PUBLICATION_OPERATIONS_PREFLIGHT_ALERT_DISABLED",
    );
  }
  return configuration;
}

function enabledRefresh(
  configuration: PublicationRefreshRuntimeConfiguration,
): EnabledRefreshConfiguration {
  if (!configuration.enabled) {
    throw new PublicationOperationsPreflightError(
      "PUBLICATION_OPERATIONS_PREFLIGHT_REFRESH_DISABLED",
    );
  }
  return configuration;
}

function enabledGateway(
  configuration: PublicationEvidenceGatewayConfiguration,
): EnabledGatewayConfiguration {
  if (!configuration.enabled) {
    throw new PublicationOperationsPreflightError(
      "PUBLICATION_OPERATIONS_PREFLIGHT_GATEWAY_DISABLED",
    );
  }
  return configuration;
}

function requireSecret(
  environment: WorkerEnvironment,
  environmentVariable: string,
  code: string,
): string {
  const value = environment[environmentVariable]?.trim() ?? "";
  if (!value || value.length > 8_192 || CONTROL_CHARACTERS.test(value)) {
    throw new PublicationOperationsPreflightError(code);
  }
  return value;
}

function secretsMatch(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length
    && timingSafeEqual(leftBytes, rightBytes);
}

function requireEmail(value: string | undefined): void {
  const candidate = value?.trim().toLocaleLowerCase("en-AU") ?? "";
  if (
    !candidate
    || candidate.length > 320
    || !EMAIL_PATTERN.test(candidate)
    || CONTROL_CHARACTERS.test(candidate)
  ) {
    throw new PublicationOperationsPreflightError(
      "PUBLICATION_OPERATIONS_PREFLIGHT_RECIPIENT_EMAIL_INVALID",
    );
  }
}

function acknowledged(value: string | undefined): boolean {
  return value?.trim().toLocaleLowerCase("en-AU") === "true";
}

function endpointPort(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === "https:" ? 443 : 80;
}

function gatewayTransport(
  refresh: EnabledRefreshConfiguration,
  gateway: EnabledGatewayConfiguration,
  environment: WorkerEnvironment,
): PublicationOperationsGatewayTransport {
  const endpoint = new URL(refresh.verificationGateway.endpoint);
  if (endpoint.pathname !== "/v1/publication-evidence") {
    throw new PublicationOperationsPreflightError(
      "PUBLICATION_OPERATIONS_PREFLIGHT_GATEWAY_ROUTE_MISMATCH",
    );
  }

  const endpointLoopback = LOOPBACK_HOSTS.has(endpoint.hostname);
  const gatewayLoopback = LOOPBACK_HOSTS.has(gateway.bindHost);
  if (endpointLoopback) {
    if (!gatewayLoopback || endpointPort(endpoint) !== gateway.port) {
      throw new PublicationOperationsPreflightError(
        "PUBLICATION_OPERATIONS_PREFLIGHT_LOOPBACK_ENDPOINT_MISMATCH",
      );
    }
    return "direct-loopback";
  }

  if (endpoint.protocol !== "https:") {
    throw new PublicationOperationsPreflightError(
      "PUBLICATION_OPERATIONS_PREFLIGHT_PRIVATE_ENDPOINT_HTTPS_REQUIRED",
    );
  }
  if (gateway.privateNetworkAcknowledged) return "private-network";
  if (acknowledged(
    environment.STORYTELLER_PUBLICATION_OPERATIONS_GATEWAY_PROXY,
  )) {
    return "private-proxy";
  }
  throw new PublicationOperationsPreflightError(
    "PUBLICATION_OPERATIONS_PREFLIGHT_GATEWAY_PROXY_ACK_REQUIRED",
  );
}

export function runPublicationOperationsPreflight(
  environment: WorkerEnvironment = process.env,
  workingDirectory = process.cwd(),
): PublicationOperationsPreflightSummary {
  const alert = enabledAlert(
    resolvePublicationAlertRuntimeConfiguration(environment, workingDirectory),
  );
  const refresh = enabledRefresh(
    resolvePublicationRefreshRuntimeConfiguration(environment, workingDirectory),
  );
  const gateway = enabledGateway(
    resolvePublicationEvidenceGatewayConfiguration(environment, workingDirectory),
  );

  if (
    alert.stateRootDirectory !== refresh.stateRootDirectory
    || alert.stateRootDirectory !== gateway.stateRootDirectory
  ) {
    throw new PublicationOperationsPreflightError(
      "PUBLICATION_OPERATIONS_PREFLIGHT_STATE_ROOT_MISMATCH",
    );
  }

  const refreshToken = requireSecret(
    environment,
    refresh.verificationGateway.tokenEnvironmentVariable,
    "PUBLICATION_OPERATIONS_PREFLIGHT_REFRESH_TOKEN_MISSING",
  );
  const gatewayToken = requireSecret(
    environment,
    gateway.tokenEnvironmentVariable,
    "PUBLICATION_OPERATIONS_PREFLIGHT_GATEWAY_TOKEN_MISSING",
  );
  if (!secretsMatch(refreshToken, gatewayToken)) {
    throw new PublicationOperationsPreflightError(
      "PUBLICATION_OPERATIONS_PREFLIGHT_GATEWAY_TOKEN_MISMATCH",
    );
  }

  const recipientEnvironmentVariable =
    alert.recipientBindings[refresh.recipientReferenceHash];
  if (!recipientEnvironmentVariable) {
    throw new PublicationOperationsPreflightError(
      "PUBLICATION_OPERATIONS_PREFLIGHT_RECIPIENT_ROUTE_MISSING",
    );
  }
  requireEmail(environment[recipientEnvironmentVariable]);

  requireSecret(
    environment,
    alert.emailGateway.tokenEnvironmentVariable,
    "PUBLICATION_OPERATIONS_PREFLIGHT_EMAIL_TOKEN_MISSING",
  );
  requireEmail(environment[alert.emailGateway.fromEmailEnvironmentVariable]);

  if (
    new Set([alert.workerId, refresh.workerId, gateway.gatewayId]).size !== 3
  ) {
    throw new PublicationOperationsPreflightError(
      "PUBLICATION_OPERATIONS_PREFLIGHT_ROLE_IDENTITY_COLLISION",
    );
  }

  if (refresh.acquisitionTimeoutMs < gateway.requestTimeoutMs) {
    throw new PublicationOperationsPreflightError(
      "PUBLICATION_OPERATIONS_PREFLIGHT_ACQUISITION_DEADLINE_INVALID",
    );
  }

  const transport = gatewayTransport(refresh, gateway, environment);
  const singleHostAcknowledgementsComplete =
    alert.productionSingleHostAcknowledged
    && refresh.productionSingleHostAcknowledged
    && gateway.productionSingleHostAcknowledged;

  return Object.freeze({
    status: "ready",
    executionApiExposed: false,
    publicGatewayExposed: false,
    sharedPublicationState: true,
    gatewayTokenMatched: true,
    recipientRouteMatched: true,
    roleIdentitiesDistinct: true,
    gatewayEndpointAligned: true,
    acquisitionDeadlineCompatible: true,
    singleHostAcknowledgementsComplete,
    alertMode: alert.mode,
    refreshMode: refresh.mode,
    gatewayMode: gateway.mode,
    gatewayTransport: transport,
  });
}
