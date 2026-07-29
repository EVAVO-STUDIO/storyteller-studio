import { resolve } from "node:path";
import type { WorkerEnvironment } from "./configuration.js";

export type PublicationAlertRuntimeMode = "disabled" | "once" | "continuous";

export type PublicationAlertRuntimeConfiguration =
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
      concurrency: number;
      maximumBatchSize: number;
      pollIntervalMs: number;
      providerTimeoutMs: number;
      shutdownGraceMs: number;
      recipientBindings: Readonly<Record<string, string>>;
      emailGateway: Readonly<{
        providerId: string;
        adapterVersion: string;
        endpoint: string;
        tokenEnvironmentVariable: string;
        fromEmailEnvironmentVariable: string;
        fromName?: string;
      }>;
      productionSingleHostAcknowledged: boolean;
    }>;

export interface PublicationAlertRuntimeConfigurationSummary {
  mode: PublicationAlertRuntimeMode;
  enabled: boolean;
  persistence: "none" | "single-host-file";
  executionApiExposed: false;
  concurrency: number;
  maximumBatchSize: number;
  pollIntervalMs: number;
  providerTimeoutMs: number;
  shutdownGraceMs: number;
  recipientBindingCount: number;
  emailProviderConfigured: boolean;
  productionSingleHostAcknowledged: boolean;
}

const MODE_PATTERN = /^(?:disabled|once|continuous)$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const ENVIRONMENT_VARIABLE_PATTERN = /^[A-Z][A-Z0-9_]{2,127}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const MAXIMUM_RECIPIENT_BINDINGS = 1_000;

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

function requireEnvironmentVariable(
  value: string | undefined,
  code: string,
): string {
  const candidate = value?.trim() ?? "";
  if (!ENVIRONMENT_VARIABLE_PATTERN.test(candidate)) throw new Error(code);
  return candidate;
}

function optionalText(
  value: string | undefined,
  maximum: number,
  code: string,
): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;
  if (candidate.length > maximum || CONTROL_CHARACTERS.test(candidate)) {
    throw new Error(code);
  }
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
    throw new Error("PUBLICATION_ALERT_RUNTIME_EMAIL_ENDPOINT_INVALID");
  }
  const localHttp = parsed.protocol === "http:"
    && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("PUBLICATION_ALERT_RUNTIME_EMAIL_ENDPOINT_UNSAFE");
  }
  if (parsed.protocol !== "https:" && (!localHttp || production)) {
    throw new Error("PUBLICATION_ALERT_RUNTIME_EMAIL_ENDPOINT_HTTPS_REQUIRED");
  }
  return parsed.toString();
}

function parseRecipientBindings(
  value: string | undefined,
): Readonly<Record<string, string>> {
  if (!value?.trim()) {
    throw new Error("PUBLICATION_ALERT_RUNTIME_RECIPIENT_BINDINGS_REQUIRED");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("PUBLICATION_ALERT_RUNTIME_RECIPIENT_BINDINGS_JSON_INVALID");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("PUBLICATION_ALERT_RUNTIME_RECIPIENT_BINDINGS_INVALID");
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0 || entries.length > MAXIMUM_RECIPIENT_BINDINGS) {
    throw new Error("PUBLICATION_ALERT_RUNTIME_RECIPIENT_BINDINGS_LIMIT_INVALID");
  }
  const bindings: Record<string, string> = {};
  const environmentVariables = new Set<string>();
  for (const [referenceHash, environmentVariable] of entries) {
    if (!HASH_PATTERN.test(referenceHash)) {
      throw new Error("PUBLICATION_ALERT_RUNTIME_RECIPIENT_HASH_INVALID");
    }
    if (
      typeof environmentVariable !== "string"
      || !ENVIRONMENT_VARIABLE_PATTERN.test(environmentVariable)
    ) {
      throw new Error("PUBLICATION_ALERT_RUNTIME_RECIPIENT_ENV_INVALID");
    }
    if (environmentVariables.has(environmentVariable)) {
      throw new Error("PUBLICATION_ALERT_RUNTIME_RECIPIENT_ENV_DUPLICATE");
    }
    environmentVariables.add(environmentVariable);
    bindings[referenceHash] = environmentVariable;
  }
  return Object.freeze(bindings);
}

export function resolvePublicationAlertRuntimeConfiguration(
  environment: WorkerEnvironment = process.env,
  workingDirectory = process.cwd(),
): PublicationAlertRuntimeConfiguration {
  const rawMode = environment.STORYTELLER_PUBLICATION_ALERT_MODE
    ?.trim()
    .toLocaleLowerCase("en-AU") ?? "disabled";
  if (!MODE_PATTERN.test(rawMode)) {
    throw new Error("PUBLICATION_ALERT_RUNTIME_MODE_INVALID");
  }
  const mode = rawMode as PublicationAlertRuntimeMode;
  if (mode === "disabled") {
    return Object.freeze({
      mode,
      enabled: false,
      persistence: "none",
      executionApiExposed: false,
    });
  }

  const dataDirectory = environment.STORYTELLER_DATA_DIR?.trim();
  if (!dataDirectory) throw new Error("PUBLICATION_ALERT_RUNTIME_DATA_DIR_REQUIRED");
  const production = isProduction(environment);
  const productionSingleHostAcknowledged = acknowledged(
    environment.STORYTELLER_FILE_PUBLICATION_ALERT_SINGLE_HOST,
  );
  if (production && !productionSingleHostAcknowledged) {
    throw new Error("PUBLICATION_ALERT_RUNTIME_PRODUCTION_SINGLE_HOST_ACK_REQUIRED");
  }

  const configuration = {
    mode,
    enabled: true as const,
    persistence: "single-host-file" as const,
    executionApiExposed: false as const,
    workerId: requireIdentifier(
      environment.STORYTELLER_PUBLICATION_ALERT_WORKER_ID,
      "PUBLICATION_ALERT_RUNTIME_WORKER_ID_INVALID",
    ),
    stateRootDirectory: resolve(
      workingDirectory,
      dataDirectory,
      "publication-operations",
    ),
    concurrency: integer(
      environment.STORYTELLER_PUBLICATION_ALERT_CONCURRENCY,
      2,
      1,
      16,
      "PUBLICATION_ALERT_RUNTIME_CONCURRENCY_INVALID",
    ),
    maximumBatchSize: integer(
      environment.STORYTELLER_PUBLICATION_ALERT_BATCH_SIZE,
      100,
      1,
      1_000,
      "PUBLICATION_ALERT_RUNTIME_BATCH_SIZE_INVALID",
    ),
    pollIntervalMs: integer(
      environment.STORYTELLER_PUBLICATION_ALERT_POLL_INTERVAL_MS,
      30_000,
      1_000,
      5 * 60_000,
      "PUBLICATION_ALERT_RUNTIME_POLL_INTERVAL_INVALID",
    ),
    providerTimeoutMs: integer(
      environment.STORYTELLER_PUBLICATION_ALERT_PROVIDER_TIMEOUT_MS,
      30_000,
      100,
      5 * 60_000,
      "PUBLICATION_ALERT_RUNTIME_PROVIDER_TIMEOUT_INVALID",
    ),
    shutdownGraceMs: integer(
      environment.STORYTELLER_PUBLICATION_ALERT_SHUTDOWN_GRACE_MS,
      30_000,
      1_000,
      5 * 60_000,
      "PUBLICATION_ALERT_RUNTIME_SHUTDOWN_GRACE_INVALID",
    ),
    recipientBindings: parseRecipientBindings(
      environment.STORYTELLER_PUBLICATION_ALERT_RECIPIENT_BINDINGS,
    ),
    emailGateway: Object.freeze({
      providerId: requireIdentifier(
        environment.STORYTELLER_PUBLICATION_ALERT_EMAIL_PROVIDER_ID
          ?? "publication_email_gateway",
        "PUBLICATION_ALERT_RUNTIME_EMAIL_PROVIDER_ID_INVALID",
      ),
      adapterVersion: requireVersion(
        environment.STORYTELLER_PUBLICATION_ALERT_EMAIL_ADAPTER_VERSION
          ?? "1.0.0",
        "PUBLICATION_ALERT_RUNTIME_EMAIL_ADAPTER_VERSION_INVALID",
      ),
      endpoint: endpoint(
        environment.STORYTELLER_PUBLICATION_ALERT_EMAIL_ENDPOINT,
        production,
      ),
      tokenEnvironmentVariable: requireEnvironmentVariable(
        environment.STORYTELLER_PUBLICATION_ALERT_EMAIL_TOKEN_ENV,
        "PUBLICATION_ALERT_RUNTIME_EMAIL_TOKEN_ENV_INVALID",
      ),
      fromEmailEnvironmentVariable: requireEnvironmentVariable(
        environment.STORYTELLER_PUBLICATION_ALERT_FROM_EMAIL_ENV,
        "PUBLICATION_ALERT_RUNTIME_FROM_EMAIL_ENV_INVALID",
      ),
      ...(optionalText(
        environment.STORYTELLER_PUBLICATION_ALERT_FROM_NAME,
        200,
        "PUBLICATION_ALERT_RUNTIME_FROM_NAME_INVALID",
      )
        ? {
            fromName: optionalText(
              environment.STORYTELLER_PUBLICATION_ALERT_FROM_NAME,
              200,
              "PUBLICATION_ALERT_RUNTIME_FROM_NAME_INVALID",
            )!,
          }
        : {}),
    }),
    productionSingleHostAcknowledged,
  } satisfies Extract<PublicationAlertRuntimeConfiguration, { enabled: true }>;
  return Object.freeze(configuration);
}

export function publicationAlertRuntimeConfigurationSummary(
  configuration: PublicationAlertRuntimeConfiguration,
): PublicationAlertRuntimeConfigurationSummary {
  if (!configuration.enabled) {
    return Object.freeze({
      mode: configuration.mode,
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
    providerTimeoutMs: configuration.providerTimeoutMs,
    shutdownGraceMs: configuration.shutdownGraceMs,
    recipientBindingCount: Object.keys(configuration.recipientBindings).length,
    emailProviderConfigured: true,
    productionSingleHostAcknowledged:
      configuration.productionSingleHostAcknowledged,
  });
}
