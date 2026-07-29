import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileAudiobookRetailPublicationAlertStore,
  createAudiobookRetailPublicationAlert,
  type AudiobookRetailPublicationAlert,
} from "./audiobook-retail-publication-alert.js";
import {
  AudiobookRetailPublicationAlertDeliveryWorker,
  deliverAudiobookRetailPublicationAlert,
  renderAudiobookRetailPublicationAlertEmail,
  type AudiobookRetailPublicationAlertEmailMessage,
  type AudiobookRetailPublicationAlertEmailProvider,
  type AudiobookRetailPublicationAlertRecipientResolver,
  type AudiobookRetailPublicationAlertRecipientRoute,
} from "./audiobook-retail-publication-alert-delivery.js";
import {
  createAudiobookRetailPublicListingObservation,
  verifyAudiobookRetailPublication,
  type AudiobookRetailPublicationVerification,
} from "./audiobook-retail-publication-verification.js";
import {
  createAudiobookRetailPublicationMonitor,
  markAudiobookRetailPublicationMonitorStale,
  recordAudiobookRetailPublicationRefresh,
  type AudiobookRetailPublicationMonitor,
} from "./audiobook-retail-publication-monitor.js";
import { stableHash } from "./index.js";
import { FileProjectStore } from "./project-store.js";
import { retailPublicationVerificationFixture } from "./test-support/retail-publication-verification-fixture.js";

const baseMs = Date.parse("2026-07-29T00:00:00.000Z");
const atMinute = (minute: number): Date =>
  new Date(baseMs + minute * 60 * 1_000);
const recipientReferenceHash = stableHash({
  route: "publication-alert-delivery-primary",
});
const rawRecipient = "publication-ops@example.test";

interface VerificationOptions {
  monitorId: string;
  observedMinute: number;
  displayTitle?: string;
  regions?: readonly Readonly<{
    regionCode: string;
    productPageAccessible: boolean;
    purchaseAvailable: boolean;
    sampleAvailable: boolean;
    samplePlaybackSuccessful: boolean;
  }>[];
}

function verification(
  options: VerificationOptions,
): AudiobookRetailPublicationVerification {
  const fixture = retailPublicationVerificationFixture();
  const identity = fixture.listingIdentity;
  const regions = options.regions ?? Object.freeze([
    Object.freeze({
      regionCode: "AU",
      productPageAccessible: true,
      purchaseAvailable: true,
      sampleAvailable: true,
      samplePlaybackSuccessful: true,
    }),
    Object.freeze({
      regionCode: "US",
      productPageAccessible: true,
      purchaseAvailable: true,
      sampleAvailable: true,
      samplePlaybackSuccessful: true,
    }),
  ]);
  const observation = createAudiobookRetailPublicListingObservation({
    id: `publication_delivery_observation_${stableHash({
      monitorId: options.monitorId,
      minute: options.observedMinute,
      displayTitle: options.displayTitle ?? identity.metadata.displayTitle,
      regions,
    }).slice(0, 24)}`,
    projectId: identity.projectId,
    bookId: identity.bookId,
    audiobookAsin: "B0AUDIO001",
    publicProductReferenceHash: stableHash({
      kind: "product",
      monitorId: options.monitorId,
      minute: options.observedMinute,
    }),
    sampleReferenceHash: stableHash({
      kind: "sample",
      monitorId: options.monitorId,
      minute: options.observedMinute,
    }),
    coverReferenceHash: stableHash({
      kind: "cover",
      monitorId: options.monitorId,
      minute: options.observedMinute,
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
    observedByActorId: `publication_delivery_observer_${options.observedMinute}`,
    humanObservationConfirmed: true,
    observedAt: atMinute(options.observedMinute).toISOString(),
    expiresAt: atMinute(options.observedMinute + 360).toISOString(),
    now: atMinute(options.observedMinute),
  });
  return verifyAudiobookRetailPublication({
    id: `publication_delivery_verification_${stableHash({
      monitorId: options.monitorId,
      observation: observation.fingerprint,
    }).slice(0, 24)}`,
    sources: {
      listingIdentity: identity,
      retailerStatus: fixture.retailerStatus,
      observation,
    },
    requiredRegions: ["AU", "US"],
    verifiedByActorId: `publication_delivery_verifier_${options.observedMinute}`,
    humanVerificationConfirmed: true,
    verifiedAt: atMinute(options.observedMinute + 1),
  });
}

function liveMonitor(monitorId: string): AudiobookRetailPublicationMonitor {
  return createAudiobookRetailPublicationMonitor({
    id: monitorId,
    verification: verification({ monitorId, observedMinute: 10 }),
    refreshIntervalHours: 1,
    createdAt: atMinute(12),
  });
}

function degradedMonitor(monitorId: string): AudiobookRetailPublicationMonitor {
  return recordAudiobookRetailPublicationRefresh(
    liveMonitor(monitorId),
    verification({
      monitorId,
      observedMinute: 70,
      regions: [
        {
          regionCode: "AU",
          productPageAccessible: true,
          purchaseAvailable: true,
          sampleAvailable: true,
          samplePlaybackSuccessful: true,
        },
        {
          regionCode: "US",
          productPageAccessible: true,
          purchaseAvailable: false,
          sampleAvailable: true,
          samplePlaybackSuccessful: false,
        },
      ],
    }),
    atMinute(72),
  );
}

function mismatchMonitor(monitorId: string): AudiobookRetailPublicationMonitor {
  return recordAudiobookRetailPublicationRefresh(
    liveMonitor(monitorId),
    verification({
      monitorId,
      observedMinute: 70,
      displayTitle: "The Lantern: Incorrect Public Edition",
    }),
    atMinute(72),
  );
}

function unavailableMonitor(monitorId: string): AudiobookRetailPublicationMonitor {
  return recordAudiobookRetailPublicationRefresh(
    liveMonitor(monitorId),
    verification({
      monitorId,
      observedMinute: 70,
      regions: [
        {
          regionCode: "AU",
          productPageAccessible: false,
          purchaseAvailable: false,
          sampleAvailable: false,
          samplePlaybackSuccessful: false,
        },
        {
          regionCode: "US",
          productPageAccessible: false,
          purchaseAvailable: false,
          sampleAvailable: false,
          samplePlaybackSuccessful: false,
        },
      ],
    }),
    atMinute(72),
  );
}

function staleMonitor(monitorId: string): AudiobookRetailPublicationMonitor {
  return markAudiobookRetailPublicationMonitorStale(
    liveMonitor(monitorId),
    atMinute(371),
  );
}

function alertFrom(
  monitor: AudiobookRetailPublicationMonitor,
  createdAt: Date,
): AudiobookRetailPublicationAlert {
  return createAudiobookRetailPublicationAlert({
    monitor,
    recipientReferenceHash,
    createdAt,
  });
}

class FixtureRecipientResolver
  implements AudiobookRetailPublicationAlertRecipientResolver {
  readonly calls: string[] = [];

  constructor(
    readonly route: AudiobookRetailPublicationAlertRecipientRoute | null,
  ) {}

  async resolve(
    recipientHash: string,
    signal: AbortSignal,
  ): Promise<AudiobookRetailPublicationAlertRecipientRoute | null> {
    if (signal.aborted) throw signal.reason;
    this.calls.push(recipientHash);
    return this.route;
  }
}

class FixtureEmailProvider
  implements AudiobookRetailPublicationAlertEmailProvider {
  readonly providerId = "fixture_email_provider";
  readonly adapterVersion = "1.0.0";
  readonly messages: AudiobookRetailPublicationAlertEmailMessage[] = [];
  readonly #outcomes: Array<"sent" | string>;
  readonly #receiptByKey = new Map<string, string>();

  constructor(outcomes: Array<"sent" | string> = ["sent"]) {
    this.#outcomes = [...outcomes];
  }

  async send(
    message: AudiobookRetailPublicationAlertEmailMessage,
    signal: AbortSignal,
  ): Promise<{ receiptReference: string }> {
    if (signal.aborted) throw signal.reason;
    this.messages.push(message);
    const existing = this.#receiptByKey.get(message.idempotencyKey);
    if (existing) return { receiptReference: existing };
    const outcome = this.#outcomes.shift() ?? "sent";
    if (outcome !== "sent") throw new Error(outcome);
    const receiptReference = `provider-receipt-${message.idempotencyKey.slice(0, 24)}`;
    this.#receiptByKey.set(message.idempotencyKey, receiptReference);
    return { receiptReference };
  }
}

async function withStoredAlert(
  alert: AudiobookRetailPublicationAlert,
  run: (fixture: Readonly<{
    state: FileProjectStore;
    alerts: FileAudiobookRetailPublicationAlertStore;
    root: string;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-publication-delivery-"));
  try {
    const state = new FileProjectStore(root);
    const alerts = new FileAudiobookRetailPublicationAlertStore(state);
    await alerts.create(alert, "publication_alert_fixture_store_001");
    await run({ state, alerts, root });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("ephemeral route resolution produces one sanitized idempotent sent revision", async () => {
  const alert = alertFrom(degradedMonitor("publication_delivery_monitor_sent_001"), atMinute(73));
  await withStoredAlert(alert, async ({ state, alerts, root }) => {
    const recipients = new FixtureRecipientResolver({
      recipientReferenceHash,
      emailAddress: rawRecipient,
      displayName: "Publication Operations",
    });
    const provider = new FixtureEmailProvider();
    const dependencies = { state, alerts, recipients, provider };
    const first = await deliverAudiobookRetailPublicationAlert(dependencies, {
      alertId: alert.id,
      workerId: "publication_delivery_worker_001",
      attemptedAt: atMinute(74),
    });
    assert.equal(first.disposition, "sent");
    assert.equal(first.deliveryStatus, "sent");
    assert.equal(first.attemptCount, 1);
    assert.equal(provider.messages.length, 1);
    assert.equal(provider.messages[0]?.to, rawRecipient);
    assert.equal(provider.messages[0]?.idempotencyKey, alert.notification.idempotencyKey);
    assert.equal(provider.messages[0]?.subject.includes("HIGH"), true);
    assert.equal(provider.messages[0]?.textBody.includes(alert.id), true);

    const stored = (await alerts.require(alert.id)).payload;
    assert.equal(stored.notification.deliveryStatus, "sent");
    assert.match(
      stored.notification.attempts[0]?.providerReceiptHash ?? "",
      /^[a-f0-9]{64}$/u,
    );
    const serialised = JSON.stringify(stored);
    assert.equal(serialised.includes(rawRecipient), false);
    assert.equal(serialised.includes("provider-receipt-"), false);

    const repeated = await deliverAudiobookRetailPublicationAlert(dependencies, {
      alertId: alert.id,
      workerId: "publication_delivery_worker_001",
      attemptedAt: atMinute(75),
    });
    assert.equal(repeated.disposition, "already-sent");
    assert.equal(provider.messages.length, 1);

    const audit = await readFile(join(root, "audit", "2026-07-29.jsonl"), "utf8");
    assert.equal(audit.includes(rawRecipient), false);
    assert.equal(audit.includes("provider-receipt-"), false);
    assert.equal(JSON.stringify(first).includes(rawRecipient), false);
  });
});

test("safe provider failures append bounded attempts and a later retry succeeds", async () => {
  const alert = alertFrom(degradedMonitor("publication_delivery_monitor_retry_001"), atMinute(73));
  await withStoredAlert(alert, async ({ state, alerts }) => {
    const recipients = new FixtureRecipientResolver({
      recipientReferenceHash,
      emailAddress: rawRecipient,
    });
    const provider = new FixtureEmailProvider([
      "MAIL_PROVIDER_TEMPORARY_FAILURE",
      "sent",
    ]);
    const dependencies = { state, alerts, recipients, provider };
    const failed = await deliverAudiobookRetailPublicationAlert(dependencies, {
      alertId: alert.id,
      workerId: "publication_delivery_worker_retry_001",
      attemptedAt: atMinute(74),
    });
    assert.equal(failed.disposition, "failed");
    assert.equal(failed.failureCode, "MAIL_PROVIDER_TEMPORARY_FAILURE");
    assert.equal(failed.deliveryStatus, "pending");
    assert.equal(failed.attemptCount, 1);

    const sent = await deliverAudiobookRetailPublicationAlert(dependencies, {
      alertId: alert.id,
      workerId: "publication_delivery_worker_retry_001",
      attemptedAt: atMinute(75),
    });
    assert.equal(sent.disposition, "sent");
    assert.equal(sent.attemptCount, 2);
    assert.equal(provider.messages.length, 2);
    assert.equal(
      provider.messages[0]?.idempotencyKey,
      provider.messages[1]?.idempotencyKey,
    );
    const stored = (await alerts.require(alert.id)).payload;
    assert.deepEqual(
      stored.notification.attempts.map((attempt) => attempt.outcome),
      ["failed", "sent"],
    );
  });
});

test("missing routes exhaust after three safe failures without calling the provider", async () => {
  const alert = alertFrom(unavailableMonitor("publication_delivery_monitor_exhaust_001"), atMinute(73));
  await withStoredAlert(alert, async ({ state, alerts }) => {
    const recipients = new FixtureRecipientResolver(null);
    const provider = new FixtureEmailProvider();
    const dependencies = { state, alerts, recipients, provider };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await deliverAudiobookRetailPublicationAlert(dependencies, {
        alertId: alert.id,
        workerId: "publication_delivery_worker_exhaust_001",
        attemptedAt: atMinute(74 + attempt),
      });
      assert.equal(result.disposition, "failed");
      assert.equal(
        result.failureCode,
        "AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_ROUTE_NOT_FOUND",
      );
    }
    const stored = (await alerts.require(alert.id)).payload;
    assert.equal(stored.notification.deliveryStatus, "exhausted");
    assert.equal(stored.notification.attempts.length, 3);
    assert.equal(provider.messages.length, 0);

    const exhausted = await deliverAudiobookRetailPublicationAlert(dependencies, {
      alertId: alert.id,
      workerId: "publication_delivery_worker_exhaust_001",
      attemptedAt: atMinute(78),
    });
    assert.equal(exhausted.disposition, "exhausted");
    assert.equal(recipients.calls.length, 3);
  });
});

test("route substitution and invalid addresses fail closed without persisting recipient data", async () => {
  for (const route of [
    {
      recipientReferenceHash: "f".repeat(64),
      emailAddress: rawRecipient,
    },
    {
      recipientReferenceHash,
      emailAddress: "not-an-email",
    },
  ]) {
    const alert = alertFrom(
      degradedMonitor(`publication_delivery_monitor_route_${route.emailAddress.replaceAll("@", "_").replaceAll(".", "_")}`),
      atMinute(73),
    );
    await withStoredAlert(alert, async ({ state, alerts }) => {
      const recipients = new FixtureRecipientResolver(route);
      const provider = new FixtureEmailProvider();
      const delivered = await deliverAudiobookRetailPublicationAlert(
        { state, alerts, recipients, provider },
        {
          alertId: alert.id,
          workerId: "publication_delivery_worker_route_001",
          attemptedAt: atMinute(74),
        },
      );
      assert.equal(delivered.disposition, "failed");
      assert.equal(provider.messages.length, 0);
      const serialised = JSON.stringify((await alerts.require(alert.id)).payload);
      assert.equal(serialised.includes(route.emailAddress), false);
    });
  }
});

test("external aborts do not create ambiguous delivery attempts", async () => {
  const alert = alertFrom(degradedMonitor("publication_delivery_monitor_abort_001"), atMinute(73));
  await withStoredAlert(alert, async ({ state, alerts }) => {
    const recipients = new FixtureRecipientResolver({
      recipientReferenceHash,
      emailAddress: rawRecipient,
    });
    const provider = new FixtureEmailProvider();
    const controller = new AbortController();
    controller.abort(new Error("OPERATOR_ABORTED"));
    await assert.rejects(
      deliverAudiobookRetailPublicationAlert(
        { state, alerts, recipients, provider },
        {
          alertId: alert.id,
          workerId: "publication_delivery_worker_abort_001",
          attemptedAt: atMinute(74),
          signal: controller.signal,
        },
      ),
      /AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_ABORTED/u,
    );
    assert.equal(
      (await alerts.require(alert.id)).payload.notification.attempts.length,
      0,
    );
    assert.equal(provider.messages.length, 0);
  });
});

test("the batch worker prioritizes critical, high and warning alerts and drains them", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-publication-delivery-worker-"));
  try {
    const state = new FileProjectStore(root);
    const alerts = new FileAudiobookRetailPublicationAlertStore(state);
    const critical = alertFrom(
      mismatchMonitor("publication_delivery_monitor_priority_critical_001"),
      atMinute(73),
    );
    const high = alertFrom(
      degradedMonitor("publication_delivery_monitor_priority_high_001"),
      atMinute(74),
    );
    const warning = alertFrom(
      staleMonitor("publication_delivery_monitor_priority_warning_001"),
      atMinute(372),
    );
    await alerts.create(warning, "publication_alert_fixture_store_priority_001");
    await alerts.create(high, "publication_alert_fixture_store_priority_001");
    await alerts.create(critical, "publication_alert_fixture_store_priority_001");

    const recipients = new FixtureRecipientResolver({
      recipientReferenceHash,
      emailAddress: rawRecipient,
    });
    const provider = new FixtureEmailProvider(["sent", "sent", "sent"]);
    const worker = new AudiobookRetailPublicationAlertDeliveryWorker(
      { state, alerts, recipients, provider },
      {
        workerId: "publication_delivery_batch_worker_001",
        concurrency: 1,
        now: (() => {
          let minute = 400;
          return () => atMinute(minute++);
        })(),
      },
    );
    const snapshot = await worker.runUntilIdle();
    assert.equal(snapshot.state, "stopped");
    assert.equal(snapshot.discoveredAlerts, 3);
    assert.equal(snapshot.processedAlerts, 3);
    assert.equal(snapshot.sentAlerts, 3);
    assert.equal(snapshot.remainingPendingAlerts, 0);
    assert.deepEqual(
      snapshot.results.map((item) => item.alertId),
      [critical.id, high.id, warning.id],
    );
    assert.equal(provider.messages[0]?.subject.includes("CRITICAL"), true);
    assert.equal(provider.messages[1]?.subject.includes("HIGH"), true);
    assert.equal(provider.messages[2]?.subject.includes("WARNING"), true);
    assert.equal(JSON.stringify(snapshot).includes(rawRecipient), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the default template is deterministic and omits private source evidence", () => {
  const alert = alertFrom(degradedMonitor("publication_delivery_monitor_template_001"), atMinute(73));
  const first = renderAudiobookRetailPublicationAlertEmail(alert);
  const second = renderAudiobookRetailPublicationAlertEmail(alert);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.subject, second.subject);
  const serialised = JSON.stringify(first);
  for (const forbidden of [
    alert.projectId,
    alert.monitor.fingerprint,
    alert.monitor.listingIdentityFingerprint,
    alert.trigger.transitionFingerprint,
    alert.notification.recipientReferenceHash,
    alert.notification.idempotencyKey,
  ]) {
    assert.equal(serialised.includes(forbidden), false);
  }
});
