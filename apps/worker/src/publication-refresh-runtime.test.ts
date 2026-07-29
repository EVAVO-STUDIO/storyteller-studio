import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAudiobookRetailPublicationMonitor } from "@evavo/storyteller-engine/audiobook-retail-publication-monitor";
import {
  createAudiobookRetailPublicListingObservation,
  verifyAudiobookRetailPublication,
  type AudiobookRetailPublicationVerification,
} from "@evavo/storyteller-engine/audiobook-retail-publication-verification";
import type { FileAudiobookRetailPublicationAlertStore } from "@evavo/storyteller-engine/audiobook-retail-publication-alert";
import type { FileAudiobookRetailPublicationMonitorStore } from "@evavo/storyteller-engine/audiobook-retail-publication-monitor";
import type { AudiobookRetailPublicationVerificationProvider } from "@evavo/storyteller-engine/audiobook-retail-publication-refresh";
import type { FileProjectStore } from "@evavo/storyteller-engine/project-store";
import { stableHash } from "@evavo/storyteller-engine";
import { retailReleaseAt } from "../../../packages/storyteller/src/test-support/retail-release-policy-fixture.js";
import { retailPublicationVerificationFixture } from "../../../packages/storyteller/src/test-support/retail-publication-verification-fixture.js";
import type { WorkerEnvironment } from "./configuration.js";
import type {
  WorkerProcessSignal,
  WorkerShutdownScheduler,
  WorkerSignalSource,
} from "./lifecycle.js";
import {
  resolvePublicationRefreshRuntimeConfiguration,
  type PublicationRefreshRuntimeConfiguration,
} from "./publication-refresh-configuration.js";
import {
  HttpPublicationVerificationProvider,
  runConfiguredPublicationRefreshRuntime,
  type PublicationRefreshRuntimeServiceControl,
  type PublicationRefreshRuntimeServiceSnapshot,
  type PublicationRefreshRuntimeWaiter,
} from "./publication-refresh-runtime.js";

const root = "C:/storyteller-publication-refresh-runtime-test";
const recipientReferenceHash = stableHash({
  route: "publication-refresh-runtime-primary",
});
const gatewayToken = "private-publication-verification-token";

function environment(
  overrides: WorkerEnvironment = {},
): WorkerEnvironment {
  return {
    NODE_ENV: "test",
    STORYTELLER_DATA_DIR: "./private-data",
    STORYTELLER_PUBLICATION_REFRESH_MODE: "once",
    STORYTELLER_PUBLICATION_REFRESH_WORKER_ID:
      "publication_refresh_runtime_worker_001",
    STORYTELLER_PUBLICATION_REFRESH_RECIPIENT_REFERENCE_HASH:
      recipientReferenceHash,
    STORYTELLER_PUBLICATION_REFRESH_VERIFICATION_ENDPOINT:
      "https://verification-gateway.example.test/v1/evidence",
    STORYTELLER_PUBLICATION_REFRESH_VERIFICATION_TOKEN_ENV:
      "PUBLICATION_REFRESH_RUNTIME_TOKEN",
    PUBLICATION_REFRESH_RUNTIME_TOKEN: gatewayToken,
    ...overrides,
  };
}

function enabledConfiguration(
  overrides: WorkerEnvironment = {},
  workingDirectory = root,
): Extract<PublicationRefreshRuntimeConfiguration, { enabled: true }> {
  const configuration = resolvePublicationRefreshRuntimeConfiguration(
    environment(overrides),
    workingDirectory,
  );
  if (!configuration.enabled) throw new Error("enabled configuration required");
  return configuration;
}

function verification(
  suffix: string,
  observedSecond = 30,
): AudiobookRetailPublicationVerification {
  const fixture = retailPublicationVerificationFixture();
  const identity = fixture.listingIdentity;
  const observation = createAudiobookRetailPublicListingObservation({
    id: `publication_refresh_runtime_observation_${suffix}`,
    projectId: identity.projectId,
    bookId: identity.bookId,
    audiobookAsin: "B0AUDIO001",
    publicProductReferenceHash: stableHash({ kind: "product", suffix }),
    sampleReferenceHash: stableHash({ kind: "sample", suffix }),
    coverReferenceHash: stableHash({ kind: "cover", suffix }),
    displayTitle: identity.metadata.displayTitle,
    authorCredit: identity.metadata.authorCredit,
    narratorCredit: identity.metadata.narratorCredit,
    publisherName: identity.metadata.publisherName,
    languageTag: identity.metadata.languageTag,
    description: identity.metadata.description,
    coverIdentityMatched: true,
    ebookAsin: identity.ebook.asin,
    ebookAssociationMatched: true,
    regions: ["AU", "US"].map((regionCode) => ({
      regionCode,
      productPageAccessible: true,
      purchaseAvailable: true,
      sampleAvailable: true,
      samplePlaybackSuccessful: true,
    })),
    observedByActorId: `publication_refresh_runtime_observer_${suffix}`,
    humanObservationConfirmed: true,
    observedAt: retailReleaseAt(observedSecond).toISOString(),
    expiresAt: retailReleaseAt(observedSecond + 7_200).toISOString(),
    now: retailReleaseAt(observedSecond),
  });
  return verifyAudiobookRetailPublication({
    id: `publication_refresh_runtime_verification_${suffix}`,
    sources: {
      listingIdentity: identity,
      retailerStatus: fixture.retailerStatus,
      observation,
    },
    requiredRegions: ["AU", "US"],
    verifiedByActorId: `publication_refresh_runtime_verifier_${suffix}`,
    humanVerificationConfirmed: true,
    verifiedAt: retailReleaseAt(observedSecond + 1),
  });
}

function monitor() {
  const value = verification("monitor", 30);
  return createAudiobookRetailPublicationMonitor({
    id: "publication_refresh_runtime_monitor_001",
    verification: value,
    refreshIntervalHours: 1,
    createdAt: retailReleaseAt(32),
  });
}

class FakeSignalSource implements WorkerSignalSource {
  listener: ((signal: WorkerProcessSignal) => void) | undefined;
  unsubscribed = false;

  subscribe(listener: (signal: WorkerProcessSignal) => void): () => void {
    this.listener = listener;
    return () => {
      this.unsubscribed = true;
      this.listener = undefined;
    };
  }

  emit(signal: WorkerProcessSignal): void {
    this.listener?.(signal);
  }
}

class FakeScheduler implements WorkerShutdownScheduler {
  readonly delays: number[] = [];
  callback: (() => void) | undefined;
  cancelled = false;

  schedule(callback: () => void, delayMs: number) {
    this.callback = callback;
    this.delays.push(delayMs);
    return {
      cancel: () => {
        this.cancelled = true;
      },
    };
  }
}

class FakeRuntimeService implements PublicationRefreshRuntimeServiceControl {
  state: PublicationRefreshRuntimeServiceSnapshot["state"] = "idle";
  runUntilIdleCalls = 0;
  startCalls = 0;
  drainCalls = 0;
  abortCodes: string[] = [];
  readonly #continuous: boolean;
  #resolveStart: (() => void) | undefined;

  constructor(continuous = false) {
    this.#continuous = continuous;
  }

  async runUntilIdle(): Promise<void> {
    this.runUntilIdleCalls += 1;
    this.state = "running";
    this.state = "stopped";
  }

  start(): Promise<void> {
    this.startCalls += 1;
    this.state = "running";
    if (!this.#continuous) {
      this.state = "stopped";
      return Promise.resolve();
    }
    return new Promise<void>((resolvePromise) => {
      this.#resolveStart = () => {
        this.state = "stopped";
        resolvePromise();
      };
    });
  }

  requestDrain(): void {
    this.drainCalls += 1;
    this.state = "draining";
    this.#resolveStart?.();
  }

  abortActive(reason = new Error("PUBLICATION_REFRESH_RUNTIME_ABORTED")): void {
    this.abortCodes.push(reason.message);
    this.#resolveStart?.();
  }

  snapshot(): PublicationRefreshRuntimeServiceSnapshot {
    return Object.freeze({
      state: this.state,
      passes: this.runUntilIdleCalls + this.startCalls,
      dueMonitors: 3,
      processedMonitors: 3,
      refreshedMonitors: 2,
      staleMonitors: 1,
      failedMonitors: 0,
      conflictMonitors: 0,
      alertsCreated: 1,
      alertsResolved: 1,
      remainingDueMonitors: 0,
      lastPassAt: "2026-07-29T00:00:00.000Z",
    });
  }
}

function serviceFactory(service: FakeRuntimeService) {
  return (
    _configuration: Extract<PublicationRefreshRuntimeConfiguration, { enabled: true }>,
    dependencies: Readonly<{
      state: FileProjectStore;
      monitors: FileAudiobookRetailPublicationMonitorStore;
      alerts: FileAudiobookRetailPublicationAlertStore;
      verificationProvider: AudiobookRetailPublicationVerificationProvider;
      waiter: PublicationRefreshRuntimeWaiter;
      now: () => Date;
    }>,
  ): PublicationRefreshRuntimeServiceControl => {
    assert.ok(dependencies.state);
    assert.ok(dependencies.monitors);
    assert.ok(dependencies.alerts);
    assert.ok(dependencies.verificationProvider);
    return service;
  };
}

test("HTTP verification provider sends a deterministic private request and accepts governed evidence", async () => {
  const evidence = verification("gateway", 30);
  const calls: Array<Readonly<{ url: string; init: RequestInit }>> = [];
  const provider = new HttpPublicationVerificationProvider({
    providerId: "governed_verification_gateway",
    adapterVersion: "2.0.0",
    endpoint: "https://verification-gateway.example.test/v1/evidence",
    token: gatewayToken,
    now: () => retailReleaseAt(40),
    fetch: async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(JSON.stringify({ verification: evidence }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const acquired = await provider.acquire(
    monitor(),
    new AbortController().signal,
  );
  assert.equal(acquired?.fingerprint, evidence.fingerprint);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0]?.url,
    "https://verification-gateway.example.test/v1/evidence",
  );
  const headers = new Headers(calls[0]?.init.headers);
  assert.equal(headers.get("authorization"), `Bearer ${gatewayToken}`);
  assert.equal(headers.get("idempotency-key")?.length, 64);
  const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
  assert.equal(body.providerId, "governed_verification_gateway");
  const requestMonitor = body.monitor as Record<string, unknown>;
  assert.equal(requestMonitor.id, monitor().id);
  assert.equal(requestMonitor.revision, monitor().revision);
  const serialised = JSON.stringify(body);
  assert.equal(serialised.includes(gatewayToken), false);
  assert.equal(serialised.includes("observedByActorId"), false);
});

test("HTTP verification provider treats 204 as no evidence and maps safe failures", async () => {
  const noEvidence = new HttpPublicationVerificationProvider({
    providerId: "governed_verification_gateway",
    adapterVersion: "1.0.0",
    endpoint: "https://verification-gateway.example.test/v1/evidence",
    token: gatewayToken,
    fetch: async () => new Response(null, { status: 204 }),
  });
  assert.equal(
    await noEvidence.acquire(monitor(), new AbortController().signal),
    null,
  );

  for (const [status, expected] of [
    [429, /PUBLICATION_REFRESH_RUNTIME_PROVIDER_RATE_LIMITED/u],
    [503, /PUBLICATION_REFRESH_RUNTIME_PROVIDER_UNAVAILABLE/u],
    [400, /PUBLICATION_REFRESH_RUNTIME_PROVIDER_REJECTED/u],
  ] as const) {
    const provider = new HttpPublicationVerificationProvider({
      providerId: "governed_verification_gateway",
      adapterVersion: "1.0.0",
      endpoint: "https://verification-gateway.example.test/v1/evidence",
      token: gatewayToken,
      fetch: async () => new Response("rejected", { status }),
    });
    await assert.rejects(
      provider.acquire(monitor(), new AbortController().signal),
      expected,
    );
  }
});

test("HTTP verification provider rejects malformed and expired evidence", async () => {
  const malformed = new HttpPublicationVerificationProvider({
    providerId: "governed_verification_gateway",
    adapterVersion: "1.0.0",
    endpoint: "https://verification-gateway.example.test/v1/evidence",
    token: gatewayToken,
    fetch: async () => new Response(JSON.stringify({ invalid: true }), {
      status: 200,
    }),
  });
  await assert.rejects(
    malformed.acquire(monitor(), new AbortController().signal),
    /PUBLICATION_REFRESH_RUNTIME_EVIDENCE_INVALID/u,
  );

  const evidence = verification("expired", 30);
  const expired = new HttpPublicationVerificationProvider({
    providerId: "governed_verification_gateway",
    adapterVersion: "1.0.0",
    endpoint: "https://verification-gateway.example.test/v1/evidence",
    token: gatewayToken,
    now: () => retailReleaseAt(8_000),
    fetch: async () => new Response(JSON.stringify(evidence), { status: 200 }),
  });
  await assert.rejects(
    expired.acquire(monitor(), new AbortController().signal),
    /PUBLICATION_REFRESH_RUNTIME_EVIDENCE_NOT_CURRENT/u,
  );
});

test("disabled refresh runtime does not evaluate secrets or network dependencies", async () => {
  const configuration = resolvePublicationRefreshRuntimeConfiguration({}, root);
  const result = await runConfiguredPublicationRefreshRuntime(configuration, {
    environment: { PUBLICATION_REFRESH_RUNTIME_TOKEN: "should-not-be-read" },
    fetch: async () => {
      throw new Error("network must not be called");
    },
  });
  assert.deepEqual(result, {
    status: "disabled",
    configuration: {
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
    },
  });
});

test("once mode resolves secrets privately and returns only a safe service snapshot", async () => {
  const configuration = enabledConfiguration();
  const service = new FakeRuntimeService();
  const result = await runConfiguredPublicationRefreshRuntime(configuration, {
    environment: environment(),
    fetch: async () => new Response(null, { status: 204 }),
    serviceFactory: serviceFactory(service),
  });
  assert.equal(result.status, "stopped");
  assert.equal(service.runUntilIdleCalls, 1);
  assert.equal(service.startCalls, 0);
  const serialised = JSON.stringify(result);
  for (const forbidden of [
    gatewayToken,
    "PUBLICATION_REFRESH_RUNTIME_TOKEN",
    "verification-gateway.example.test",
    configuration.workerId,
    configuration.stateRootDirectory,
    recipientReferenceHash,
  ]) {
    assert.equal(serialised.includes(forbidden), false);
  }
});

test("enabled refresh runtime fails before service creation when the gateway token is missing", async () => {
  const configuration = enabledConfiguration();
  await assert.rejects(
    runConfiguredPublicationRefreshRuntime(configuration, {
      environment: environment({ PUBLICATION_REFRESH_RUNTIME_TOKEN: undefined }),
      serviceFactory: serviceFactory(new FakeRuntimeService()),
    }),
    /PUBLICATION_REFRESH_RUNTIME_TOKEN_MISSING/u,
  );
});

test("real once-mode wiring drains an empty publication store without network access", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "storyteller-refresh-runtime-"));
  try {
    const configuration = enabledConfiguration({}, temporaryRoot);
    let networkCalls = 0;
    const result = await runConfiguredPublicationRefreshRuntime(configuration, {
      environment: environment(),
      fetch: async () => {
        networkCalls += 1;
        return new Response(null, { status: 204 });
      },
      now: () => retailReleaseAt(3_700),
    });
    assert.equal(result.status, "stopped");
    assert.equal(result.service.passes, 1);
    assert.equal(result.service.dueMonitors, 0);
    assert.equal(result.service.processedMonitors, 0);
    assert.equal(networkCalls, 0);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("continuous mode drains on the first signal and unsubscribes cleanly", async () => {
  const configuration = enabledConfiguration({
    STORYTELLER_PUBLICATION_REFRESH_MODE: "continuous",
  });
  const service = new FakeRuntimeService(true);
  const signals = new FakeSignalSource();
  const scheduler = new FakeScheduler();
  const running = runConfiguredPublicationRefreshRuntime(configuration, {
    environment: environment(),
    signals,
    shutdownScheduler: scheduler,
    serviceFactory: serviceFactory(service),
  });
  await Promise.resolve();
  signals.emit("SIGTERM");
  const result = await running;
  assert.notEqual(result.status, "disabled");
  assert.equal(service.startCalls, 1);
  assert.equal(service.drainCalls, 1);
  assert.equal(result.shutdownSignal, "SIGTERM");
  assert.equal(result.forcedAbort, false);
  assert.equal(signals.unsubscribed, true);
  assert.deepEqual(scheduler.delays, [configuration.shutdownGraceMs]);
});

test("a second signal forces a bounded active refresh abort", async () => {
  const configuration = enabledConfiguration({
    STORYTELLER_PUBLICATION_REFRESH_MODE: "continuous",
  });
  const service = new FakeRuntimeService(true);
  const signals = new FakeSignalSource();
  const scheduler = new FakeScheduler();
  const running = runConfiguredPublicationRefreshRuntime(configuration, {
    environment: environment(),
    signals,
    shutdownScheduler: scheduler,
    serviceFactory: serviceFactory(service),
  });
  await Promise.resolve();
  signals.emit("SIGINT");
  signals.emit("SIGTERM");
  const result = await running;
  assert.notEqual(result.status, "disabled");
  assert.equal(result.shutdownSignal, "SIGINT");
  assert.equal(result.forcedAbort, true);
  assert.deepEqual(service.abortCodes, [
    "PUBLICATION_REFRESH_RUNTIME_SECOND_SIGNAL_ABORT",
  ]);
});
