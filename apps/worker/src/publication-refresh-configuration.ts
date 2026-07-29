import { resolve } from "node:path";
import type { WorkerEnvironment } from "./configuration.js";

export type PublicationRefreshRuntimeMode = "disabled" | "once" | "continuous";

export type PublicationRefreshRuntimeConfiguration =
  | Readonly<{
      mode: "disabled";
      enabled: false;
      persistence: "none";
      executionApiExposed: false;
    }>
  | Readonly<{
      mode: "once" | "continuous";
      enabled: true;
      persistence: "single-host-file";
      executionApiExposed: false;
      workerId: string;
      stateRootDirectory: string;
      recipientReferenceHash: string;
      concurrency: number;
      maximumBatchSize: number;
      pollIntervalMs: number;
      acquisitionTimeoutMs: number;
      shutdownGraceMs: number;
      verificationGateway: Readonly<{
        providerId: string;
        adapterVersion: string;
        endpoint: string;
        tokenEnvironmentVariable: string;
      }>;
      productionSingleHostAcknowledged: boolean;
    }>;

export interface PublicationRefreshRuntimeConfigurationSummary {
  mode: PublicationRefreshRuntimeMode;
  enabled: boolean;
  persistence: "none" | "single-host-file";
  executionApiExposed: false;
  concurrency: number;
  maximumBatchSize: number;
  pollIntervalMs: number;
  acquisitionTimeoutMs: number;
  shutdownGraceMs: number;
  verificationProviderConfigured: boolean;
  productionSingleHostAcknowledged: boolean;
}

const MODE_PATTERN = /^(?:disabled|once|continuous)$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const ENVIRONMENT_VARIABLE_PATTERN = /^[A-Z][A-Z0-9_]{2,127}$/u;

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

function requireVersion(value: string | undefined, code: string): string {
  const candidate = value?.trim() ?? "";
  if (!SEMVER_PATTERN.test(candidate)) throw new Error(code);
  return candidate;
}

function requireHash(value: string | undefined, code: string): string {
  const candidate = value?.trim() ?? "";
  if (!HASH_PATTERN.test(candidate)) throw new Error(code);
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

function endpoint(
  value: string | undefined,
  production: boolean,
): string {
  const candidate = value?.trim() ?? "";
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("PUBLICATION_REFRESH_RUNTIME_VERIFICATION_ENDPOINT_INVALID");
  }
  const localHttp = parsed.protocol === "http:"
    && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("PUBLICATION_REFRESH_RUNTIME_VERIFICATION_ENDPOINT_UNSAFE");
  }
  if (parsed.protocol !== "https:" && (!localHttp || production)) {
    throw new Error("PUBLICATION_REFRESH_RUNTIME_VERIFICATION_ENDPOINT_HTTPS_REQUIRED");
  }
  return parsed.toString();
}

export function resolvePublicationRefreshRuntimeConfiguration(
  environment: WorkerEnvironment = process.env,
  workingDirectory = process.cwd(),
): PublicationRefreshRuntimeConfiguration {
  const rawMode = environment.STORYTELLER_PUBLICATION_REFRESH_MODE
    ?.trim()
    .toLocaleLowerCase("en-AU") ?? "disabled";
  if (!MODE_PATTERN.test(rawMode)) {
    throw new Error("PUBLICATION_REFRESH_RUNTIME_MODE_INVALID");
  }
  const mode = rawMode as PublicationRefreshRuntimeMode;
  if (mode === "disabled") {
    return Object.freeze({
      mode,
      enabled: false,
      persistence: "none",
      executionApiExposed: false,
    });
  }

  const dataDirectory = environment.STORYTELLER_DATA_DIR?.trim();
  if (!dataDirectory) throw new Error("PUBLICATION_REFRESH_RUNTIME_DATA_DIR_REQUIRED");
  const production = isProduction(environment);
  const productionSingleHostAcknowledged = acknowledged(
    environment.STORYTELLER_FILE_PUBLICATION_REFRESH_SINGLE_HOST,
  );
  if (production && !productionSingleHostAcknowledged) {
    throw new Error("PUBLICATION_REFRESH_RUNTIME_PRODUCTION_SINGLE_HOST_ACK_REQUIRED");
  }

  const configuration = {
    mode,
    enabled: true as const,
    persistence: "single-host-file" as const,
    executionApiExposed: false as const,
    workerId: requireIdentifier(
      environment.STORYTELLER_PUBLICATION_REFRESH_WORKER_ID,
      "PUBLICATION_REFRESH_RUNTIME_WORKER_ID_INVALID",
    ),
    stateRootDirectory: resolve(
      workingDirectory,
      dataDirectory,
      "publication-operations",
    ),
    recipientReferenceHash: requireHash(
      environment.STORYTELLER_PUBLICATION_REFRESH_RECIPIENT_REFERENCE_HASH,
      "PUBLICATION_REFRESH_RUNTIME_RECIPIENT_HASH_INVALID",
    ),
    concurrency: integer(
      environment.STORYTELLER_PUBLICATION_REFRESH_CONCURRENCY,
      2,
      1,
      16,
      "PUBLICATION_REFRESH_RUNTIME_CONCURRENCY_INVALID",
    ),
    maximumBatchSize: integer(
      environment.STORYTELLER_PUBLICATION_REFRESH_BATCH_SIZE,
      100,
      1,
      1_000,
      "PUBLICATION_REFRESH_RUNTIME_BATCH_SIZE_INVALID",
    ),
    pollIntervalMs: integer(
      environment.STORYTELLER_PUBLICATION_REFRESH_POLL_INTERVAL_MS,
      60_000,
      1_000,
      15 * 60_000,
      "PUBLICATION_REFRESH_RUNTIME_POLL_INTERVAL_INVALID",
    ),
    acquisitionTimeoutMs: integer(
      environment.STORYTELLER_PUBLICATION_REFRESH_ACQUISITION_TIMEOUT_MS,
      60_000,
      100,
      10 * 60_000,
      "PUBLICATION_REFRESH_RUNTIME_ACQUISITION_TIMEOUT_INVALID",
    ),
    shutdownGraceMs: integer(
      environment.STORYTELLER_PUBLICATION_REFRESH_SHUTDOWN_GRACE_MS,
      30_000,
      1_000,
      5 * 60_000,
      "PUBLICATION_REFRESH_RUNTIME_SHUTDOWN_GRACE_INVALID",
    ),
    verificationGateway: Object.freeze({
      providerId: requireIdentifier(
        environment.STORYTELLER_PUBLICATION_REFRESH_PROVIDER_ID
          ?? "publication_verification_gateway",
        "PUBLICATION_REFRESH_RUNTIME_PROVIDER_ID_INVALID",
      ),
      adapterVersion: requireVersion(
        environment.STORYTELLER_PUBLICATION_REFRESH_ADAPTER_VERSION
          ?? "1.0.0",
        "PUBLICATION_REFRESH_RUNTIME_ADAPTER_VERSION_INVALID",
      ),
      endpoint: endpoint(
        environment.STORYTELLER_PUBLICATION_REFRESH_VERIFICATION_ENDPOINT,
        production,
      ),
      tokenEnvironmentVariable: requireEnvironmentVariable(
        environment.STORYTELLER_PUBLICATION_REFRESH_VERIFICATION_TOKEN_ENV,
        "PUBLICATION_REFRESH_RUNTIME_TOKEN_ENV_INVALID",
      ),
    }),
    productionSingleHostAcknowledged,
  } satisfies Extract<PublicationRefreshRuntimeConfiguration, { enabled: true }>;
  return Object.freeze(configuration);
}

export function publicationRefreshRuntimeConfigurationSummary(
  configuration: PublicationRefreshRuntimeConfiguration,
): PublicationRefreshRuntimeConfigurationSummary {
  if (!configuration.enabled) {
    return Object.freeze({
      mode: configuration.mode,
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
  }
  return Object.freeze({
    mode: configuration.mode,
    enabled: true,
    persistence: configuration.persistence,
    executionApiExposed: false,
    concurrency: configuration.concurrency,
    maximumBatchSize: configuration.maximumBatchSize,
    pollIntervalMs: configuration.pollIntervalMs,
    acquisitionTimeoutMs: configuration.acquisitionTimeoutMs,
    shutdownGraceMs: configuration.shutdownGraceMs,
    verificationProviderConfigured: true,
    productionSingleHostAcknowledged:
      configuration.productionSingleHostAcknowledged,
  });
}
