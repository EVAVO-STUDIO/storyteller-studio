import { resolve } from "node:path";

export type WorkerEnvironment = Readonly<Record<string, string | undefined>>;
export type WorkerRuntimeMode = "disabled" | "once" | "continuous";

export type WorkerRuntimeConfiguration =
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
      verifierActorId: string;
      projectId?: string;
      queueRootDirectory: string;
      artifactRootDirectory: string;
      objectRootDirectory: string;
      objectProvider: string;
      objectContainer: string;
      objectRegion?: string;
      concurrency: number;
      pollIntervalMs: number;
      leaseDurationMs: number;
      heartbeatIntervalMs: number;
      providerTimeoutMs: number;
      outcomeHistoryLimit: number;
      shutdownGraceMs: number;
      credentialBindings: Readonly<Record<string, string>>;
      productionSingleHostAcknowledged: boolean;
    }>;

export interface WorkerRuntimeConfigurationSummary {
  mode: WorkerRuntimeMode;
  enabled: boolean;
  persistence: "none" | "single-host-file";
  executionApiExposed: false;
  projectScoped: boolean;
  concurrency: number;
  pollIntervalMs: number;
  leaseDurationMs: number;
  heartbeatIntervalMs: number;
  providerTimeoutMs: number;
  shutdownGraceMs: number;
  credentialBindingCount: number;
  productionSingleHostAcknowledged: boolean;
}

const MODE_PATTERN = /^(?:disabled|once|continuous)$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const SAFE_STORAGE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{1,239}$/u;
const ENVIRONMENT_VARIABLE_PATTERN = /^[A-Z][A-Z0-9_]{2,127}$/u;
const MAX_CREDENTIAL_BINDINGS = 32;

function isProduction(environment: WorkerEnvironment): boolean {
  return environment.NODE_ENV === "production" || environment.VERCEL_ENV === "production";
}

function acknowledged(value: string | undefined): boolean {
  return value?.trim().toLocaleLowerCase("en-AU") === "true";
}

function requireIdentifier(value: string | undefined, code: string): string {
  const candidate = value?.trim() ?? "";
  if (!SAFE_IDENTIFIER.test(candidate)) throw new Error(code);
  return candidate;
}

function optionalIdentifier(value: string | undefined, code: string): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;
  if (!SAFE_IDENTIFIER.test(candidate)) throw new Error(code);
  return candidate;
}

function storageLabel(
  value: string | undefined,
  fallback: string,
  code: string,
): string {
  const candidate = value?.trim() || fallback;
  if (!SAFE_STORAGE_LABEL.test(candidate)) throw new Error(code);
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

function parseCredentialBindings(value: string | undefined): Readonly<Record<string, string>> {
  if (!value?.trim()) return Object.freeze({});
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("WORKER_CREDENTIAL_BINDINGS_JSON_INVALID");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("WORKER_CREDENTIAL_BINDINGS_INVALID");
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length > MAX_CREDENTIAL_BINDINGS) {
    throw new Error("WORKER_CREDENTIAL_BINDINGS_LIMIT_EXCEEDED");
  }
  const bindings: Record<string, string> = {};
  const environmentVariables = new Set<string>();
  for (const [providerId, environmentVariable] of entries) {
    if (!SAFE_IDENTIFIER.test(providerId)) {
      throw new Error("WORKER_CREDENTIAL_PROVIDER_ID_INVALID");
    }
    if (
      typeof environmentVariable !== "string"
      || !ENVIRONMENT_VARIABLE_PATTERN.test(environmentVariable)
    ) {
      throw new Error("WORKER_CREDENTIAL_ENVIRONMENT_VARIABLE_INVALID");
    }
    if (environmentVariables.has(environmentVariable)) {
      throw new Error("WORKER_CREDENTIAL_ENVIRONMENT_VARIABLE_DUPLICATE");
    }
    environmentVariables.add(environmentVariable);
    bindings[providerId] = environmentVariable;
  }
  return Object.freeze(bindings);
}

export class EnvironmentCredentialResolver {
  readonly #environment: WorkerEnvironment;
  readonly #bindings: Readonly<Record<string, string>>;

  constructor(
    environment: WorkerEnvironment,
    bindings: Readonly<Record<string, string>>,
  ) {
    this.#environment = environment;
    this.#bindings = bindings;
  }

  async resolve(providerId: string): Promise<string | null> {
    if (!SAFE_IDENTIFIER.test(providerId)) throw new Error("WORKER_CREDENTIAL_PROVIDER_ID_INVALID");
    const environmentVariable = this.#bindings[providerId];
    if (!environmentVariable) return null;
    const credential = this.#environment[environmentVariable]?.trim();
    return credential || null;
  }
}

export function resolveWorkerRuntimeConfiguration(
  environment: WorkerEnvironment = process.env,
  workingDirectory = process.cwd(),
): WorkerRuntimeConfiguration {
  const rawMode = environment.STORYTELLER_WORKER_MODE
    ?.trim()
    .toLocaleLowerCase("en-AU") ?? "disabled";
  if (!MODE_PATTERN.test(rawMode)) throw new Error("WORKER_RUNTIME_MODE_INVALID");
  const mode = rawMode as WorkerRuntimeMode;
  if (mode === "disabled") {
    return Object.freeze({
      mode,
      enabled: false,
      persistence: "none",
      executionApiExposed: false,
    });
  }

  if (environment.STORYTELLER_QUEUE_DRIVER?.trim().toLocaleLowerCase("en-AU") !== "file") {
    throw new Error("WORKER_FILE_QUEUE_DRIVER_REQUIRED");
  }
  if (environment.STORYTELLER_ARTIFACT_DRIVER?.trim().toLocaleLowerCase("en-AU") !== "file") {
    throw new Error("WORKER_FILE_ARTIFACT_DRIVER_REQUIRED");
  }
  const dataDirectory = environment.STORYTELLER_DATA_DIR?.trim();
  if (!dataDirectory) throw new Error("WORKER_DATA_DIR_REQUIRED");

  const workerId = requireIdentifier(
    environment.STORYTELLER_WORKER_ID,
    "WORKER_ID_INVALID",
  );
  const verifierActorId = requireIdentifier(
    environment.STORYTELLER_WORKER_VERIFIER_ACTOR_ID,
    "WORKER_VERIFIER_ACTOR_ID_INVALID",
  );
  const projectId = optionalIdentifier(
    environment.STORYTELLER_WORKER_PROJECT_ID,
    "WORKER_PROJECT_ID_INVALID",
  );

  const concurrency = integer(
    environment.STORYTELLER_WORKER_CONCURRENCY,
    2,
    1,
    16,
    "WORKER_CONCURRENCY_INVALID",
  );
  const pollIntervalMs = integer(
    environment.STORYTELLER_WORKER_POLL_INTERVAL_MS,
    1_000,
    100,
    60_000,
    "WORKER_POLL_INTERVAL_INVALID",
  );
  const leaseDurationMs = integer(
    environment.STORYTELLER_WORKER_LEASE_DURATION_MS,
    60_000,
    1_000,
    15 * 60_000,
    "WORKER_LEASE_DURATION_INVALID",
  );
  const heartbeatIntervalMs = integer(
    environment.STORYTELLER_WORKER_HEARTBEAT_INTERVAL_MS,
    20_000,
    250,
    Math.max(250, Math.floor(leaseDurationMs / 2) - 1),
    "WORKER_HEARTBEAT_INTERVAL_INVALID",
  );
  const providerTimeoutMs = integer(
    environment.STORYTELLER_WORKER_PROVIDER_TIMEOUT_MS,
    120_000,
    1_000,
    2 * 60 * 60_000,
    "WORKER_PROVIDER_TIMEOUT_INVALID",
  );
  const outcomeHistoryLimit = integer(
    environment.STORYTELLER_WORKER_OUTCOME_HISTORY_LIMIT,
    100,
    0,
    1_000,
    "WORKER_OUTCOME_HISTORY_LIMIT_INVALID",
  );
  const shutdownGraceMs = integer(
    environment.STORYTELLER_WORKER_SHUTDOWN_GRACE_MS,
    30_000,
    1_000,
    5 * 60_000,
    "WORKER_SHUTDOWN_GRACE_INVALID",
  );

  const productionSingleHostAcknowledged = [
    environment.STORYTELLER_FILE_QUEUE_SINGLE_HOST,
    environment.STORYTELLER_FILE_ARTIFACT_STORE_SINGLE_HOST,
    environment.STORYTELLER_FILE_WORKER_SINGLE_HOST,
  ].every(acknowledged);
  if (isProduction(environment) && !productionSingleHostAcknowledged) {
    throw new Error("WORKER_PRODUCTION_SINGLE_HOST_ACK_REQUIRED");
  }

  const rootDirectory = resolve(workingDirectory, dataDirectory);
  const configuration = {
    mode,
    enabled: true as const,
    persistence: "single-host-file" as const,
    executionApiExposed: false as const,
    workerId,
    verifierActorId,
    ...(projectId ? { projectId } : {}),
    queueRootDirectory: resolve(rootDirectory, "generation-queue"),
    artifactRootDirectory: resolve(rootDirectory, "artifact-registry"),
    objectRootDirectory: resolve(rootDirectory, "private-objects"),
    objectProvider: storageLabel(
      environment.STORYTELLER_WORKER_OBJECT_PROVIDER,
      "storyteller-local-private-store",
      "WORKER_OBJECT_PROVIDER_INVALID",
    ),
    objectContainer: storageLabel(
      environment.STORYTELLER_WORKER_OBJECT_CONTAINER,
      "storyteller-private-artifacts",
      "WORKER_OBJECT_CONTAINER_INVALID",
    ),
    ...(environment.STORYTELLER_WORKER_OBJECT_REGION?.trim()
      ? {
          objectRegion: storageLabel(
            environment.STORYTELLER_WORKER_OBJECT_REGION,
            "australia-southeast",
            "WORKER_OBJECT_REGION_INVALID",
          ),
        }
      : {}),
    concurrency,
    pollIntervalMs,
    leaseDurationMs,
    heartbeatIntervalMs,
    providerTimeoutMs,
    outcomeHistoryLimit,
    shutdownGraceMs,
    credentialBindings: parseCredentialBindings(
      environment.STORYTELLER_WORKER_CREDENTIAL_BINDINGS,
    ),
    productionSingleHostAcknowledged,
  } satisfies Extract<WorkerRuntimeConfiguration, { enabled: true }>;
  return Object.freeze(configuration);
}

export function workerRuntimeConfigurationSummary(
  configuration: WorkerRuntimeConfiguration,
): WorkerRuntimeConfigurationSummary {
  if (!configuration.enabled) {
    return Object.freeze({
      mode: configuration.mode,
      enabled: false,
      persistence: "none",
      executionApiExposed: false,
      projectScoped: false,
      concurrency: 0,
      pollIntervalMs: 0,
      leaseDurationMs: 0,
      heartbeatIntervalMs: 0,
      providerTimeoutMs: 0,
      shutdownGraceMs: 0,
      credentialBindingCount: 0,
      productionSingleHostAcknowledged: false,
    });
  }
  return Object.freeze({
    mode: configuration.mode,
    enabled: true,
    persistence: configuration.persistence,
    executionApiExposed: false,
    projectScoped: Boolean(configuration.projectId),
    concurrency: configuration.concurrency,
    pollIntervalMs: configuration.pollIntervalMs,
    leaseDurationMs: configuration.leaseDurationMs,
    heartbeatIntervalMs: configuration.heartbeatIntervalMs,
    providerTimeoutMs: configuration.providerTimeoutMs,
    shutdownGraceMs: configuration.shutdownGraceMs,
    credentialBindingCount: Object.keys(configuration.credentialBindings).length,
    productionSingleHostAcknowledged: configuration.productionSingleHostAcknowledged,
  });
}
