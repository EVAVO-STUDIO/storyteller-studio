import { FileArtifactRegistry } from "@evavo/storyteller-engine/artifact-store";
import { FileGenerationMaterialStore } from "@evavo/storyteller-engine/generation-material";
import { FileGenerationQueue } from "@evavo/storyteller-engine/generation-queue";
import type { LeaseHeartbeatScheduler } from "@evavo/storyteller-engine/lease-heartbeat";
import { FilePrivateObjectStore } from "@evavo/storyteller-engine/private-object-store";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";
import type {
  CredentialResolver,
  ProviderAdapterRegistry,
  ProviderCapabilitySnapshot,
} from "@evavo/storyteller-engine/provider-adapter";
import {
  GenerationWorkerService,
  generationWorkerServicePublicView,
  type WorkerServiceWaiter,
} from "@evavo/storyteller-engine/worker-service";
import {
  workerRuntimeConfigurationSummary,
  type WorkerRuntimeConfiguration,
  type WorkerRuntimeConfigurationSummary,
} from "./configuration.js";
import {
  runWorkerLifecycle,
  type WorkerLifecycleResult,
  type WorkerShutdownScheduler,
  type WorkerSignalSource,
} from "./lifecycle.js";

export interface WorkerRuntimeDependencies {
  providers: ProviderAdapterRegistry;
  credentials: CredentialResolver;
  signals?: WorkerSignalSource;
  shutdownScheduler?: WorkerShutdownScheduler;
  heartbeatScheduler?: LeaseHeartbeatScheduler;
  waiter?: WorkerServiceWaiter;
  now?: () => Date;
}

export type WorkerRuntimeResult =
  | Readonly<{
      status: "disabled";
      configuration: WorkerRuntimeConfigurationSummary;
      providerCount: 0;
    }>
  | Readonly<{
      status: "stopped" | "failed";
      configuration: WorkerRuntimeConfigurationSummary;
      providerCount: number;
      lifecycle: WorkerLifecycleResult;
    }>;

const HASH_PATTERN = /^[a-f0-9]{64}$/u;

class CachedCredentialResolver implements CredentialResolver {
  readonly #credentials: ReadonlyMap<string, string>;

  constructor(credentials: ReadonlyMap<string, string>) {
    this.#credentials = credentials;
  }

  async resolve(providerId: string): Promise<string | null> {
    return this.#credentials.get(providerId) ?? null;
  }
}

function assertCapability(
  snapshot: ProviderCapabilitySnapshot,
  providerId: string,
  adapterVersion: string,
): void {
  if (snapshot.providerId !== providerId) {
    throw new Error("WORKER_PROVIDER_CAPABILITY_ID_MISMATCH");
  }
  if (snapshot.adapterVersion !== adapterVersion) {
    throw new Error("WORKER_PROVIDER_CAPABILITY_VERSION_MISMATCH");
  }
  if (!HASH_PATTERN.test(snapshot.fingerprint)) {
    throw new Error("WORKER_PROVIDER_CAPABILITY_FINGERPRINT_INVALID");
  }
  if (
    !Number.isSafeInteger(snapshot.maximumInputCharacters)
    || snapshot.maximumInputCharacters < 1
    || snapshot.supportedFormats.length === 0
    || snapshot.supportedSampleRatesHz.length === 0
  ) {
    throw new Error("WORKER_PROVIDER_CAPABILITY_INCOMPLETE");
  }
}

async function preflightProviders(
  configuration: Extract<WorkerRuntimeConfiguration, { enabled: true }>,
  dependencies: WorkerRuntimeDependencies,
): Promise<Readonly<{
  providerCount: number;
  credentials: CredentialResolver;
}>> {
  const providerIds = dependencies.providers.ids();
  if (providerIds.length === 0) throw new Error("WORKER_PROVIDER_ADAPTERS_REQUIRED");

  const credentials = new Map<string, string>();
  for (const providerId of providerIds) {
    const adapter = dependencies.providers.get(providerId);
    if (!adapter) throw new Error("WORKER_PROVIDER_ADAPTER_LOOKUP_FAILED");
    const credential = await dependencies.credentials.resolve(providerId);
    if (!credential) throw new Error(`WORKER_PROVIDER_CREDENTIAL_MISSING:${providerId}`);
    credentials.set(providerId, credential);
    const snapshot = await adapter.inspectCapabilities({
      credential,
      signal: AbortSignal.timeout(Math.min(configuration.providerTimeoutMs, 30_000)),
    });
    assertCapability(snapshot, adapter.providerId, adapter.adapterVersion);
  }

  return Object.freeze({
    providerCount: providerIds.length,
    credentials: new CachedCredentialResolver(credentials),
  });
}

export function createWorkerService(
  configuration: Extract<WorkerRuntimeConfiguration, { enabled: true }>,
  dependencies: WorkerRuntimeDependencies,
  credentials: CredentialResolver,
): GenerationWorkerService {
  const queueState = new FileProjectStore(configuration.queueRootDirectory);
  const queue = new FileGenerationQueue(queueState);
  const materials = new FileGenerationMaterialStore(queueState);
  const artifactRegistry = new FileArtifactRegistry(
    new FileProjectStore(configuration.artifactRootDirectory),
  );
  const objectStore = new FilePrivateObjectStore(configuration.objectRootDirectory, {
    provider: configuration.objectProvider,
    container: configuration.objectContainer,
    ...(configuration.objectRegion ? { region: configuration.objectRegion } : {}),
  });

  return new GenerationWorkerService(
    {
      queue,
      materials,
      providers: dependencies.providers,
      credentials,
      objectStore,
      artifactRegistry,
    },
    {
      workerId: configuration.workerId,
      verifierActorId: configuration.verifierActorId,
      ...(configuration.projectId ? { projectId: configuration.projectId } : {}),
      concurrency: configuration.concurrency,
      pollIntervalMs: configuration.pollIntervalMs,
      leaseDurationMs: configuration.leaseDurationMs,
      heartbeatIntervalMs: configuration.heartbeatIntervalMs,
      ...(dependencies.heartbeatScheduler
        ? { heartbeatScheduler: dependencies.heartbeatScheduler }
        : {}),
      providerTimeoutMs: configuration.providerTimeoutMs,
      outcomeHistoryLimit: configuration.outcomeHistoryLimit,
      ...(dependencies.now ? { now: dependencies.now } : {}),
      ...(dependencies.waiter ? { waiter: dependencies.waiter } : {}),
    },
  );
}

export async function runConfiguredWorkerRuntime(
  configuration: WorkerRuntimeConfiguration,
  dependencies: WorkerRuntimeDependencies,
): Promise<WorkerRuntimeResult> {
  const summary = workerRuntimeConfigurationSummary(configuration);
  if (!configuration.enabled) {
    return Object.freeze({
      status: "disabled",
      configuration: summary,
      providerCount: 0,
    });
  }

  const preflight = await preflightProviders(configuration, dependencies);
  const service = createWorkerService(configuration, dependencies, preflight.credentials);
  const lifecycle = await runWorkerLifecycle({
    service,
    mode: configuration.mode,
    shutdownGraceMs: configuration.shutdownGraceMs,
    ...(dependencies.signals ? { signals: dependencies.signals } : {}),
    ...(dependencies.shutdownScheduler
      ? { scheduler: dependencies.shutdownScheduler }
      : {}),
  });
  const serviceView = generationWorkerServicePublicView(service);
  return Object.freeze({
    status: serviceView.state === "failed" ? "failed" : "stopped",
    configuration: summary,
    providerCount: preflight.providerCount,
    lifecycle,
  });
}
