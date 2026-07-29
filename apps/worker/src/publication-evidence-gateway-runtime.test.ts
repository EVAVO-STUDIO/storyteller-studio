import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileAudiobookRetailPublicationEvidenceInboxStore,
  createAudiobookRetailPublicationEvidenceRequest,
  submitAudiobookRetailPublicationEvidence,
} from "@evavo/storyteller-engine/audiobook-retail-publication-evidence-inbox";
import {
  FileAudiobookRetailPublicationMonitorStore,
  createAudiobookRetailPublicationMonitor,
  recordAudiobookRetailPublicationRefresh,
  type AudiobookRetailPublicationMonitor,
} from "@evavo/storyteller-engine/audiobook-retail-publication-monitor";
import {
  createAudiobookRetailPublicListingObservation,
  verifyAudiobookRetailPublication,
  type AudiobookRetailPublicationVerification,
} from "@evavo/storyteller-engine/audiobook-retail-publication-verification";
import { stableHash } from "@evavo/storyteller-engine";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";
import { retailReleaseAt } from "../../../packages/storyteller/src/test-support/retail-release-policy-fixture.js";
import { retailPublicationVerificationFixture } from "../../../packages/storyteller/src/test-support/retail-publication-verification-fixture.js";
import type { WorkerEnvironment } from "./configuration.js";
import type {
  WorkerProcessSignal,
  WorkerShutdownScheduler,
  WorkerSignalSource,
} from "./lifecycle.js";
import {
  resolvePublicationEvidenceGatewayConfiguration,
  type PublicationEvidenceGatewayConfiguration,
} from "./publication-evidence-gateway-configuration.js";
import {
  handlePublicationEvidenceGatewayRequest,
  runConfiguredPublicationEvidenceGateway,
  type PublicationEvidenceGatewayServiceControl,
  type PublicationEvidenceGatewayServiceSnapshot,
} from "./publication-evidence-gateway-runtime.js";

const root = "C:/storyteller-publication-evidence-gateway-runtime-test";
const token = "private-publication-evidence-gateway-token";

function environment(
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
    PUBLICATION_EVIDENCE_GATEWAY_TOKEN: token,
    ...overrides,
  };
}

function enabledConfiguration(
  overrides: WorkerEnvironment = {},
  workingDirectory = root,
): Extract<PublicationEvidenceGatewayConfiguration, { enabled: true }> {
  const configuration = resolvePublicationEvidenceGatewayConfiguration(
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
    id: `publication_gateway_observation_${suffix}`,
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
    observedByActorId: `publication_gateway_observer_${suffix}`,
    humanObservationConfirmed: true,
    observedAt: retailReleaseAt(observedSecond).toISOString(),
    expiresAt: retailReleaseAt(observedSecond + 7_200).toISOString(),
    now: retailReleaseAt(observedSecond),
  });
  return verifyAudiobookRetailPublication({
    id: `publication_gateway_verification_${suffix}`,
    sources: {
      listingIdentity: identity,
      retailerStatus: fixture.retailerStatus,
      observation,
    },
    requiredRegions: ["AU", "US"],
    verifiedByActorId: `publication_gateway_verifier_${suffix}`,
    humanVerificationConfirmed: true,
    verifiedAt: retailReleaseAt(observedSecond + 1),
  });
}

function initialMonitor(
  id = "publication_gateway_monitor_001",
): AudiobookRetailPublicationMonitor {
  return createAudiobookRetailPublicationMonitor({
    id,
    verification: verification(`${id}_initial`, 30),
    refreshIntervalHours: 1,
    createdAt: retailReleaseAt(32),
  });
}

function requestBody(monitor: AudiobookRetailPublicationMonitor): string {
  const request = createAudiobookRetailPublicationEvidenceRequest(
    monitor,
    retailReleaseAt(Math.max(33, Math.floor((Date.parse(monitor.updatedAt)
      - Date.parse(retailReleaseAt(0).toISOString())) / 1_000) + 1)),
  );
  const latest = monitor.entries.at(-1)!;
  return JSON.stringify({
    providerId: "governed_verification_gateway",
    adapterVersion: "1.0.0",
    requestFingerprint: request.requestFingerprint,
    monitor: {
      id: monitor.id,
      revision: monitor.revision,
      fingerprint: monitor.fingerprint,
      projectId: monitor.projectId,
      bookId: monitor.bookId,
      listingIdentity: monitor.listingIdentity,
      requiredRegions: monitor.requiredRegions,
      currentHealth: monitor.currentHealth,
      latestVerificationStatus: monitor.latestVerificationStatus,
      latestVerificationFingerprint: latest.verificationFingerprint,
      lastVerifiedAt: monitor.lastVerifiedAt,
      observationExpiresAt: monitor.observationExpiresAt,
      nextRefreshDueAt: monitor.nextRefreshDueAt,
    },
  });
}

async function withState(
  callback: (context: Readonly<{
    state: FileProjectStore;
    monitors: FileAudiobookRetailPublicationMonitorStore;
    inbox: FileAudiobookRetailPublicationEvidenceInboxStore;
    root: string;
  }>) => Promise<void>,
): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "storyteller-evidence-gateway-"));
  try {
    const state = new FileProjectStore(temporaryRoot);
    await callback({
      state,
      monitors: new FileAudiobookRetailPublicationMonitorStore(state),
      inbox: new FileAudiobookRetailPublicationEvidenceInboxStore(state),
      root: temporaryRoot,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function request(input: Readonly<{
  body?: string;
  authorization?: string;
  method?: string;
  path?: string;
  contentType?: string;
}> = {}) {
  return {
    method: input.method ?? "POST",
    path: input.path ?? "/v1/publication-evidence",
    authorization: input.authorization ?? `Bearer ${token}`,
    contentType: input.contentType ?? "application/json",
    body: input.body ?? "{}",
  };
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

class FakeGatewayService implements PublicationEvidenceGatewayServiceControl {
  state: PublicationEvidenceGatewayServiceSnapshot["state"] = "idle";
  startCalls = 0;
  drainCalls = 0;
  abortCodes: string[] = [];
  #resolveStart: (() => void) | undefined;

  start(): Promise<void> {
    this.startCalls += 1;
    this.state = "running";
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

  abortActive(reason = new Error("PUBLICATION_EVIDENCE_GATEWAY_ABORTED")): void {
    this.abortCodes.push(reason.message);
    this.#resolveStart?.();
  }

  snapshot(): PublicationEvidenceGatewayServiceSnapshot {
    return Object.freeze({
      state: this.state,
      activeRequests: 0,
      totalRequests: 3,
      evidenceResponses: 1,
      noContentResponses: 1,
      rejectedRequests: 1,
      errorResponses: 0,
      reconciledItems: 1,
    });
  }
}

test("gateway rejects unauthorized, wrong-route, wrong-method, wrong-content and oversized requests", async () => {
  await withState(async ({ state, monitors, inbox }) => {
    const dependencies = {
      token,
      gatewayId: "publication_evidence_gateway_001",
      state,
      monitors,
      inbox,
      maximumBodyBytes: 1_024,
      now: () => retailReleaseAt(3_700),
    };
    assert.equal((await handlePublicationEvidenceGatewayRequest(
      request({ authorization: "Bearer wrong-token" }),
      dependencies,
    )).status, 401);
    assert.equal((await handlePublicationEvidenceGatewayRequest(
      request({ path: "/public/evidence" }),
      dependencies,
    )).status, 404);
    assert.equal((await handlePublicationEvidenceGatewayRequest(
      request({ method: "GET" }),
      dependencies,
    )).status, 405);
    assert.equal((await handlePublicationEvidenceGatewayRequest(
      request({ contentType: "text/plain" }),
      dependencies,
    )).status, 415);
    assert.equal((await handlePublicationEvidenceGatewayRequest(
      request({ body: "x".repeat(1_025) }),
      dependencies,
    )).status, 413);
  });
});

test("gateway serves exact current evidence without acknowledging it", async () => {
  await withState(async ({ state, monitors, inbox }) => {
    const monitor = initialMonitor();
    await monitors.create(monitor, "publication_gateway_monitor_store_001");
    const evidenceRequest = createAudiobookRetailPublicationEvidenceRequest(
      monitor,
      retailReleaseAt(3_631),
    );
    const nextVerification = verification("served", 3_700);
    const item = submitAudiobookRetailPublicationEvidence({
      request: evidenceRequest,
      verification: nextVerification,
      sourceReferenceHash: stableHash({ source: "served" }),
      receivedByActorId: "publication_gateway_intake_001",
      receivedAt: retailReleaseAt(3_702),
    });
    await inbox.create(item, "publication_gateway_inbox_store_001");

    const result = await handlePublicationEvidenceGatewayRequest(
      request({ body: requestBody(monitor) }),
      {
        token,
        gatewayId: "publication_evidence_gateway_001",
        state,
        monitors,
        inbox,
        maximumBodyBytes: 256 * 1_024,
        now: () => retailReleaseAt(3_703),
      },
    );
    assert.equal(result.status, 200);
    assert.equal(result.disposition, "evidence");
    assert.equal(result.reconciledItems, 0);
    const payload = JSON.parse(result.body ?? "{}") as Record<string, unknown>;
    const returned = payload.verification as AudiobookRetailPublicationVerification;
    assert.equal(returned.fingerprint, nextVerification.fingerprint);
    assert.equal((await inbox.require(item.id)).payload.status, "available");
    const serialised = result.body ?? "";
    assert.equal(serialised.includes(item.sourceReferenceHash), false);
    assert.equal(serialised.includes(item.receivedByActorId), false);
  });
});

test("gateway returns 204 when no exact current inbox evidence exists", async () => {
  await withState(async ({ state, monitors, inbox }) => {
    const monitor = initialMonitor("publication_gateway_monitor_empty_001");
    await monitors.create(monitor, "publication_gateway_monitor_store_001");
    const result = await handlePublicationEvidenceGatewayRequest(
      request({ body: requestBody(monitor) }),
      {
        token,
        gatewayId: "publication_evidence_gateway_001",
        state,
        monitors,
        inbox,
        maximumBodyBytes: 256 * 1_024,
        now: () => retailReleaseAt(3_700),
      },
    );
    assert.equal(result.status, 204);
    assert.equal(result.disposition, "no-content");
    assert.equal(result.body, undefined);
  });
});

test("gateway rejects stale or substituted monitor request state", async () => {
  await withState(async ({ state, monitors, inbox }) => {
    const monitor = initialMonitor("publication_gateway_monitor_stale_001");
    await monitors.create(monitor, "publication_gateway_monitor_store_001");
    const oldBody = requestBody(monitor);
    const nextVerification = verification("stale_advance", 3_700);
    const advanced = recordAudiobookRetailPublicationRefresh(
      monitor,
      nextVerification,
      retailReleaseAt(3_702),
    );
    await monitors.save(advanced, {
      expectedRevision: monitor.revision,
      actorId: "publication_gateway_monitor_store_001",
      action: "audiobook_retail_publication_monitor.refreshed",
    });
    const result = await handlePublicationEvidenceGatewayRequest(
      request({ body: oldBody }),
      {
        token,
        gatewayId: "publication_evidence_gateway_001",
        state,
        monitors,
        inbox,
        maximumBodyBytes: 256 * 1_024,
        now: () => retailReleaseAt(3_703),
      },
    );
    assert.equal(result.status, 409);
    assert.equal(result.disposition, "rejected");
  });
});

test("gateway reconciles acknowledgement only after a later persisted monitor consumed the evidence", async () => {
  await withState(async ({ state, monitors, inbox }) => {
    const monitor = initialMonitor("publication_gateway_monitor_reconcile_001");
    await monitors.create(monitor, "publication_gateway_monitor_store_001");
    const evidenceRequest = createAudiobookRetailPublicationEvidenceRequest(
      monitor,
      retailReleaseAt(3_631),
    );
    const nextVerification = verification("reconcile", 3_700);
    const item = submitAudiobookRetailPublicationEvidence({
      request: evidenceRequest,
      verification: nextVerification,
      sourceReferenceHash: stableHash({ source: "reconcile" }),
      receivedByActorId: "publication_gateway_intake_001",
      receivedAt: retailReleaseAt(3_702),
    });
    await inbox.create(item, "publication_gateway_inbox_store_001");

    const advanced = recordAudiobookRetailPublicationRefresh(
      monitor,
      nextVerification,
      retailReleaseAt(3_703),
    );
    await monitors.save(advanced, {
      expectedRevision: monitor.revision,
      actorId: "publication_gateway_monitor_store_001",
      action: "audiobook_retail_publication_monitor.refreshed",
    });

    const result = await handlePublicationEvidenceGatewayRequest(
      request({ body: requestBody(advanced) }),
      {
        token,
        gatewayId: "publication_evidence_gateway_001",
        state,
        monitors,
        inbox,
        maximumBodyBytes: 256 * 1_024,
        now: () => retailReleaseAt(3_704),
      },
    );
    assert.equal(result.status, 204);
    assert.equal(result.reconciledItems, 1);
    const acknowledged = await inbox.require(item.id);
    assert.equal(acknowledged.payload.status, "acknowledged");
    assert.equal(
      acknowledged.payload.acknowledgement?.monitorFingerprint,
      advanced.fingerprint,
    );
  });
});

test("disabled gateway runtime does not evaluate token or create a private listener", async () => {
  const configuration = resolvePublicationEvidenceGatewayConfiguration({}, root);
  const result = await runConfiguredPublicationEvidenceGateway(configuration, {
    environment: {
      PUBLICATION_EVIDENCE_GATEWAY_TOKEN: "must-not-be-read",
    },
    serviceFactory: () => {
      throw new Error("service must not be created");
    },
  });
  assert.equal(result.status, "disabled");
  assert.equal(result.configuration.privateGatewayExposed, false);
});

test("enabled gateway runtime fails before service creation when token is missing", async () => {
  const configuration = enabledConfiguration();
  await assert.rejects(
    runConfiguredPublicationEvidenceGateway(configuration, {
      environment: environment({
        PUBLICATION_EVIDENCE_GATEWAY_TOKEN: undefined,
      }),
      serviceFactory: () => new FakeGatewayService(),
    }),
    /PUBLICATION_EVIDENCE_GATEWAY_TOKEN_MISSING/u,
  );
});

test("first signal drains the gateway and returns only a safe runtime snapshot", async () => {
  const configuration = enabledConfiguration();
  const service = new FakeGatewayService();
  const signals = new FakeSignalSource();
  const scheduler = new FakeScheduler();
  const running = runConfiguredPublicationEvidenceGateway(configuration, {
    environment: environment(),
    signals,
    shutdownScheduler: scheduler,
    serviceFactory: () => service,
  });
  await Promise.resolve();
  signals.emit("SIGTERM");
  const result = await running;
  if (result.status === "disabled") throw new Error("enabled result required");
  assert.equal(service.startCalls, 1);
  assert.equal(service.drainCalls, 1);
  assert.equal(result.shutdownSignal, "SIGTERM");
  assert.equal(result.forcedAbort, false);
  assert.equal(signals.unsubscribed, true);
  assert.deepEqual(scheduler.delays, [configuration.shutdownGraceMs]);
  const serialised = JSON.stringify(result);
  for (const forbidden of [
    token,
    configuration.gatewayId,
    configuration.stateRootDirectory,
    configuration.bindHost,
    String(configuration.port),
    configuration.tokenEnvironmentVariable,
  ]) {
    assert.equal(serialised.includes(forbidden), false);
  }
});

test("a second signal forces a bounded active gateway abort", async () => {
  const configuration = enabledConfiguration();
  const service = new FakeGatewayService();
  const signals = new FakeSignalSource();
  const scheduler = new FakeScheduler();
  const running = runConfiguredPublicationEvidenceGateway(configuration, {
    environment: environment(),
    signals,
    shutdownScheduler: scheduler,
    serviceFactory: () => service,
  });
  await Promise.resolve();
  signals.emit("SIGINT");
  signals.emit("SIGTERM");
  const result = await running;
  if (result.status === "disabled") throw new Error("enabled result required");
  assert.equal(result.shutdownSignal, "SIGINT");
  assert.equal(result.forcedAbort, true);
  assert.deepEqual(service.abortCodes, [
    "PUBLICATION_EVIDENCE_GATEWAY_SECOND_SIGNAL_ABORT",
  ]);
});
