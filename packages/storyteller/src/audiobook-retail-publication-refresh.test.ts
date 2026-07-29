import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE,
  FileAudiobookRetailPublicationAlertStore,
} from "./audiobook-retail-publication-alert.js";
import {
  FileAudiobookRetailPublicationMonitorStore,
  createAudiobookRetailPublicationMonitor,
  type AudiobookRetailPublicationMonitor,
} from "./audiobook-retail-publication-monitor.js";
import {
  AudiobookRetailPublicationRefreshWorker,
  listDueAudiobookRetailPublicationMonitorIds,
  refreshAudiobookRetailPublicationMonitor,
  type AudiobookRetailPublicationVerificationProvider,
} from "./audiobook-retail-publication-refresh.js";
import {
  createAudiobookRetailPublicListingObservation,
  verifyAudiobookRetailPublication,
  type AudiobookRetailPublicationVerification,
} from "./audiobook-retail-publication-verification.js";
import { stableHash } from "./index.js";
import { FileProjectStore } from "./project-store.js";
import { retailReleaseAt } from "./test-support/retail-release-policy-fixture.js";
import { retailPublicationVerificationFixture } from "./test-support/retail-publication-verification-fixture.js";

const recipientReferenceHash = stableHash({
  route: "publication-refresh-alert-primary",
});

interface VerificationOptions {
  suffix: string;
  observedSecond: number;
  displayTitle?: string;
  available?: boolean;
  samplePlaybackSuccessful?: boolean;
}

function publicationVerification(
  options: VerificationOptions,
): AudiobookRetailPublicationVerification {
  const fixture = retailPublicationVerificationFixture();
  const identity = fixture.listingIdentity;
  const available = options.available ?? true;
  const samplePlaybackSuccessful = options.samplePlaybackSuccessful ?? available;
  const regions = ["AU", "US"].map((regionCode) => Object.freeze({
    regionCode,
    productPageAccessible: available,
    purchaseAvailable: available,
    sampleAvailable: available,
    samplePlaybackSuccessful,
  }));
  const observation = createAudiobookRetailPublicListingObservation({
    id: `publication_refresh_observation_${options.suffix}`,
    projectId: identity.projectId,
    bookId: identity.bookId,
    audiobookAsin: "B0AUDIO001",
    publicProductReferenceHash: stableHash({
      kind: "product",
      suffix: options.suffix,
    }),
    sampleReferenceHash: stableHash({
      kind: "sample",
      suffix: options.suffix,
    }),
    coverReferenceHash: stableHash({
      kind: "cover",
      suffix: options.suffix,
    }),
    displayTitle: options.displayTitle ?? identity.metadata.displayTitle,
    authorCredit: identity.metadata.authorCredit,
    narratorCredit: identity.metadata.narratorCredit,
    publisherName: identity.metadata.publisherName,
    languageTag: identity.metadata.languageTag,
    description: identity.metadata.description,
    coverIdentityMatched: true,
    ebookAsin: identity.ebook.asin,
    ebookAssociationMatched: true,
    regions,
    observedByActorId: `publication_refresh_observer_${options.suffix}`,
    humanObservationConfirmed: true,
    observedAt: retailReleaseAt(options.observedSecond).toISOString(),
    expiresAt: retailReleaseAt(options.observedSecond + 7_200).toISOString(),
    now: retailReleaseAt(options.observedSecond),
  });
  return verifyAudiobookRetailPublication({
    id: `publication_refresh_verification_${options.suffix}`,
    sources: {
      listingIdentity: identity,
      retailerStatus: fixture.retailerStatus,
      observation,
    },
    requiredRegions: ["AU", "US"],
    verifiedByActorId: `publication_refresh_verifier_${options.suffix}`,
    humanVerificationConfirmed: true,
    verifiedAt: retailReleaseAt(options.observedSecond + 1),
  });
}

function monitor(
  id: string,
  initialSecond = 30,
): AudiobookRetailPublicationMonitor {
  const verification = publicationVerification({
    suffix: `${id}_initial`,
    observedSecond: initialSecond,
  });
  return createAudiobookRetailPublicationMonitor({
    id,
    verification,
    refreshIntervalHours: 1,
    createdAt: retailReleaseAt(initialSecond + 2),
  });
}

class QueueVerificationProvider
  implements AudiobookRetailPublicationVerificationProvider {
  readonly calls: string[] = [];
  readonly #values: Array<
    AudiobookRetailPublicationVerification | null | Error
  >;

  constructor(values: Array<AudiobookRetailPublicationVerification | null | Error>) {
    this.#values = [...values];
  }

  async acquire(
    monitorValue: AudiobookRetailPublicationMonitor,
    signal: AbortSignal,
  ): Promise<AudiobookRetailPublicationVerification | null> {
    if (signal.aborted) throw signal.reason;
    this.calls.push(monitorValue.id);
    const next = this.#values.shift() ?? null;
    if (next instanceof Error) throw next;
    return next;
  }
}

async function withStoredMonitor(
  monitorValue: AudiobookRetailPublicationMonitor,
  provider: AudiobookRetailPublicationVerificationProvider,
  run: (fixture: Readonly<{
    state: FileProjectStore;
    monitors: FileAudiobookRetailPublicationMonitorStore;
    alerts: FileAudiobookRetailPublicationAlertStore;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-publication-refresh-"));
  try {
    const state = new FileProjectStore(root);
    const monitors = new FileAudiobookRetailPublicationMonitorStore(state);
    const alerts = new FileAudiobookRetailPublicationAlertStore(state);
    await monitors.create(monitorValue, "publication_refresh_fixture_store_001");
    await run({ state, monitors, alerts });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("not-due monitors skip acquisition and remain unchanged", async () => {
  const initial = monitor("publication_refresh_monitor_not_due_001");
  const provider = new QueueVerificationProvider([
    publicationVerification({
      suffix: "not_due_unused",
      observedSecond: 3_700,
    }),
  ]);
  await withStoredMonitor(initial, provider, async ({ state, monitors, alerts }) => {
    const value = await refreshAudiobookRetailPublicationMonitor(
      { state, monitors, alerts, verificationProvider: provider },
      {
        monitorId: initial.id,
        workerId: "publication_refresh_worker_not_due_001",
        recipientReferenceHash,
        refreshedAt: retailReleaseAt(3_000),
      },
    );
    assert.equal(value.disposition, "not-due");
    assert.equal(value.monitorRevision, 1);
    assert.equal(provider.calls.length, 0);
    assert.equal((await monitors.require(initial.id)).revision, 1);
  });
});

test("fresh degraded verification appends the monitor and creates one deterministic incident", async () => {
  const initial = monitor("publication_refresh_monitor_degraded_001");
  const degraded = publicationVerification({
    suffix: "degraded_001",
    observedSecond: 3_700,
    available: true,
    samplePlaybackSuccessful: false,
  });
  const provider = new QueueVerificationProvider([degraded]);
  await withStoredMonitor(initial, provider, async ({ state, monitors, alerts }) => {
    const value = await refreshAudiobookRetailPublicationMonitor(
      { state, monitors, alerts, verificationProvider: provider },
      {
        monitorId: initial.id,
        workerId: "publication_refresh_worker_degraded_001",
        recipientReferenceHash,
        refreshedAt: retailReleaseAt(3_702),
      },
    );
    assert.equal(value.disposition, "refreshed");
    assert.equal(value.currentHealth, "degraded");
    assert.equal(value.transitionKind, "regression");
    assert.equal(value.alertCreated, true);
    assert.equal(value.alertsResolved, 0);
    const stored = (await monitors.require(initial.id)).payload;
    assert.equal(stored.revision, 2);
    assert.equal(stored.entries.length, 2);
    const alertRows = await state.list(AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE);
    assert.equal(alertRows.length, 1);
    const alert = (await alerts.require(alertRows[0]!.entityId)).payload;
    assert.equal(alert.monitor.id, initial.id);
    assert.equal(alert.category, "regional-degradation");
    assert.equal(alert.notification.recipientReferenceHash, recipientReferenceHash);
  });
});

test("missing evidence at the deadline marks stale and creates an evidence-stale incident", async () => {
  const initial = monitor("publication_refresh_monitor_stale_001");
  const provider = new QueueVerificationProvider([null]);
  await withStoredMonitor(initial, provider, async ({ state, monitors, alerts }) => {
    const value = await refreshAudiobookRetailPublicationMonitor(
      { state, monitors, alerts, verificationProvider: provider },
      {
        monitorId: initial.id,
        workerId: "publication_refresh_worker_stale_001",
        recipientReferenceHash,
        refreshedAt: retailReleaseAt(3_700),
      },
    );
    assert.equal(value.disposition, "marked-stale");
    assert.equal(value.currentHealth, "stale");
    assert.equal(value.transitionKind, "stale");
    assert.equal(value.alertCreated, true);
    const stored = (await monitors.require(initial.id)).payload;
    assert.equal(stored.currentHealth, "stale");
    const rows = await state.list(AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE);
    assert.equal(rows.length, 1);
    assert.equal(
      (await alerts.require(rows[0]!.entityId)).payload.category,
      "evidence-stale",
    );

    const repeated = await refreshAudiobookRetailPublicationMonitor(
      { state, monitors, alerts, verificationProvider: provider },
      {
        monitorId: initial.id,
        workerId: "publication_refresh_worker_stale_001",
        recipientReferenceHash,
        refreshedAt: retailReleaseAt(3_701),
      },
    );
    assert.equal(repeated.disposition, "already-stale");
    assert.equal((await state.list(AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE)).length, 1);
  });
});

test("verified recovery resolves every earlier open incident for the monitor", async () => {
  const initial = monitor("publication_refresh_monitor_recovery_001");
  const degraded = publicationVerification({
    suffix: "recovery_degraded_001",
    observedSecond: 3_700,
    available: true,
    samplePlaybackSuccessful: false,
  });
  const recovered = publicationVerification({
    suffix: "recovery_live_001",
    observedSecond: 7_400,
  });
  const provider = new QueueVerificationProvider([degraded, recovered]);
  await withStoredMonitor(initial, provider, async ({ state, monitors, alerts }) => {
    const first = await refreshAudiobookRetailPublicationMonitor(
      { state, monitors, alerts, verificationProvider: provider },
      {
        monitorId: initial.id,
        workerId: "publication_refresh_worker_recovery_001",
        recipientReferenceHash,
        refreshedAt: retailReleaseAt(3_702),
      },
    );
    assert.equal(first.alertCreated, true);
    const rows = await state.list(AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE);
    const alertId = rows[0]!.entityId;
    const second = await refreshAudiobookRetailPublicationMonitor(
      { state, monitors, alerts, verificationProvider: provider },
      {
        monitorId: initial.id,
        workerId: "publication_refresh_worker_recovery_001",
        recipientReferenceHash,
        refreshedAt: retailReleaseAt(7_402),
      },
    );
    assert.equal(second.disposition, "refreshed");
    assert.equal(second.currentHealth, "healthy-live");
    assert.equal(second.transitionKind, "recovery");
    assert.equal(second.alertCreated, false);
    assert.equal(second.alertsResolved, 1);
    const alert = (await alerts.require(alertId)).payload;
    assert.equal(alert.status, "resolved");
    assert.equal(alert.resolution?.recoveryMonitorRevision, 3);
  });
});

test("provider failures and external aborts do not mutate monitor or alert state", async () => {
  const initial = monitor("publication_refresh_monitor_failure_001");
  const provider = new QueueVerificationProvider([
    new Error("PUBLICATION_OBSERVATION_PROVIDER_UNAVAILABLE"),
  ]);
  await withStoredMonitor(initial, provider, async ({ state, monitors, alerts }) => {
    const failed = await refreshAudiobookRetailPublicationMonitor(
      { state, monitors, alerts, verificationProvider: provider },
      {
        monitorId: initial.id,
        workerId: "publication_refresh_worker_failure_001",
        recipientReferenceHash,
        refreshedAt: retailReleaseAt(3_700),
      },
    );
    assert.equal(failed.disposition, "failed");
    assert.equal(failed.failureCode, "PUBLICATION_OBSERVATION_PROVIDER_UNAVAILABLE");
    assert.equal((await monitors.require(initial.id)).revision, 1);
    assert.equal((await state.list(AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE)).length, 0);

    const controller = new AbortController();
    controller.abort(new Error("OPERATOR_ABORTED"));
    await assert.rejects(
      refreshAudiobookRetailPublicationMonitor(
        { state, monitors, alerts, verificationProvider: provider },
        {
          monitorId: initial.id,
          workerId: "publication_refresh_worker_failure_001",
          recipientReferenceHash,
          refreshedAt: retailReleaseAt(3_701),
          signal: controller.signal,
        },
      ),
      /AUDIOBOOK_RETAIL_PUBLICATION_REFRESH_ABORTED/u,
    );
    assert.equal((await monitors.require(initial.id)).revision, 1);
  });
});

test("due discovery and the batch worker are deterministic and bounded", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-publication-refresh-worker-"));
  try {
    const state = new FileProjectStore(root);
    const monitors = new FileAudiobookRetailPublicationMonitorStore(state);
    const alerts = new FileAudiobookRetailPublicationAlertStore(state);
    const first = monitor("publication_refresh_monitor_batch_a_001", 20);
    const second = monitor("publication_refresh_monitor_batch_b_001", 30);
    const third = monitor("publication_refresh_monitor_batch_c_001", 40);
    for (const value of [third, second, first]) {
      await monitors.create(value, "publication_refresh_batch_store_001");
    }
    const due = await listDueAudiobookRetailPublicationMonitorIds(
      state,
      monitors,
      retailReleaseAt(3_700),
    );
    assert.deepEqual(due, [first.id, second.id, third.id]);

    const provider = new QueueVerificationProvider([
      publicationVerification({
        suffix: "batch_a_refresh",
        observedSecond: 3_700,
      }),
      null,
      publicationVerification({
        suffix: "batch_c_refresh",
        observedSecond: 3_720,
        displayTitle: "The Lantern: Wrong Public Edition",
      }),
    ]);
    let secondValue = 3_700;
    const worker = new AudiobookRetailPublicationRefreshWorker(
      { state, monitors, alerts, verificationProvider: provider },
      {
        workerId: "publication_refresh_batch_worker_001",
        recipientReferenceHash,
        concurrency: 1,
        maximumBatchSize: 3,
        now: () => retailReleaseAt(secondValue++),
      },
    );
    const snapshot = await worker.runUntilIdle();
    assert.equal(snapshot.state, "stopped");
    assert.equal(snapshot.dueMonitors, 3);
    assert.equal(snapshot.processedMonitors, 3);
    assert.equal(snapshot.refreshedMonitors, 2);
    assert.equal(snapshot.staleMonitors, 1);
    assert.equal(snapshot.failedMonitors, 0);
    assert.equal(snapshot.alertsCreated, 2);
    assert.deepEqual(provider.calls, [first.id, second.id, third.id]);
    assert.equal(
      (await state.list(AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ENTITY_TYPE)).length,
      2,
    );
    assert.equal(JSON.stringify(snapshot).includes(recipientReferenceHash), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
