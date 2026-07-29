import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
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
import {
  FileAudiobookRetailPublicationAlertStore,
  acknowledgeAudiobookRetailPublicationAlert,
  assertAudiobookRetailPublicationAlert,
  assertAudiobookRetailPublicationAlertMatchesMonitor,
  audiobookRetailPublicationAlertPublicView,
  createAudiobookRetailPublicationAlert,
  recordAudiobookRetailPublicationAlertDelivery,
  resolveAudiobookRetailPublicationAlert,
  type AudiobookRetailPublicationAlert,
} from "./audiobook-retail-publication-alert.js";
import { stableHash } from "./index.js";
import { FileProjectStore } from "./project-store.js";
import { retailPublicationVerificationFixture } from "./test-support/retail-publication-verification-fixture.js";

const baseMs = Date.parse("2026-07-29T00:00:00.000Z");
const atMinute = (minute: number): Date =>
  new Date(baseMs + minute * 60 * 1_000);
const recipientReferenceHash = stableHash({
  route: "publication-operations-primary",
});

interface VerificationOptions {
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
    id: `publication_alert_observation_${stableHash({
      minute: options.observedMinute,
      title: options.displayTitle ?? identity.metadata.displayTitle,
      regions,
    }).slice(0, 24)}`,
    projectId: identity.projectId,
    bookId: identity.bookId,
    audiobookAsin: "B0AUDIO001",
    publicProductReferenceHash: stableHash({
      kind: "product",
      minute: options.observedMinute,
    }),
    sampleReferenceHash: stableHash({
      kind: "sample",
      minute: options.observedMinute,
    }),
    coverReferenceHash: stableHash({
      kind: "cover",
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
    observedByActorId: `publication_alert_observer_${options.observedMinute}`,
    humanObservationConfirmed: true,
    observedAt: atMinute(options.observedMinute).toISOString(),
    expiresAt: atMinute(options.observedMinute + 360).toISOString(),
    now: atMinute(options.observedMinute),
  });
  return verifyAudiobookRetailPublication({
    id: `publication_alert_verification_${stableHash({
      observation: observation.fingerprint,
    }).slice(0, 24)}`,
    sources: {
      listingIdentity: identity,
      retailerStatus: fixture.retailerStatus,
      observation,
    },
    requiredRegions: ["AU", "US"],
    verifiedByActorId: `publication_alert_verifier_${options.observedMinute}`,
    humanVerificationConfirmed: true,
    verifiedAt: atMinute(options.observedMinute + 1),
  });
}

function liveMonitor(): AudiobookRetailPublicationMonitor {
  return createAudiobookRetailPublicationMonitor({
    id: "publication_alert_monitor_001",
    verification: verification({ observedMinute: 10 }),
    refreshIntervalHours: 1,
    createdAt: atMinute(12),
  });
}

function degradedMonitor(): AudiobookRetailPublicationMonitor {
  const monitor = liveMonitor();
  const degraded = verification({
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
  });
  return recordAudiobookRetailPublicationRefresh(
    monitor,
    degraded,
    atMinute(72),
  );
}

function recoveredMonitor(
  monitor: AudiobookRetailPublicationMonitor,
): AudiobookRetailPublicationMonitor {
  return recordAudiobookRetailPublicationRefresh(
    monitor,
    verification({ observedMinute: 130 }),
    atMinute(132),
  );
}

function recomputeAlert(
  partial: Omit<AudiobookRetailPublicationAlert, "fingerprint">,
): AudiobookRetailPublicationAlert {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

test("a verified live regression creates one deterministic high-severity email incident", () => {
  const monitor = degradedMonitor();
  const first = createAudiobookRetailPublicationAlert({
    monitor,
    recipientReferenceHash,
    createdAt: atMinute(73),
  });
  const repeated = createAudiobookRetailPublicationAlert({
    monitor,
    recipientReferenceHash,
    createdAt: atMinute(73),
  });

  assert.equal(first.id, repeated.id);
  assert.equal(first.fingerprint, repeated.fingerprint);
  assert.equal(first.category, "regional-degradation");
  assert.equal(first.severity, "high");
  assert.equal(first.status, "open");
  assert.equal(first.trigger.transitionKind, "regression");
  assert.equal(first.trigger.fromHealth, "healthy-live");
  assert.equal(first.trigger.toHealth, "degraded");
  assert.equal(first.notification.channel, "email");
  assert.equal(first.notification.deliveryStatus, "pending");
  assert.equal(first.notification.attempts.length, 0);
  assert.doesNotThrow(() => assertAudiobookRetailPublicationAlert(first));
  assert.doesNotThrow(() =>
    assertAudiobookRetailPublicationAlertMatchesMonitor(first, monitor)
  );
});

test("mismatch, unavailability and stale evidence map to distinct alert classifications", () => {
  const live = liveMonitor();
  const mismatchMonitor = recordAudiobookRetailPublicationRefresh(
    live,
    verification({
      observedMinute: 70,
      displayTitle: "The Lantern: Incorrect Public Edition",
    }),
    atMinute(72),
  );
  const mismatch = createAudiobookRetailPublicationAlert({
    monitor: mismatchMonitor,
    recipientReferenceHash,
    createdAt: atMinute(73),
  });
  assert.equal(mismatch.category, "identity-mismatch");
  assert.equal(mismatch.severity, "critical");
  assert.equal(
    mismatch.notification.templateCode,
    "publication-identity-mismatch",
  );

  const unavailableMonitor = recordAudiobookRetailPublicationRefresh(
    live,
    verification({
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
  const unavailable = createAudiobookRetailPublicationAlert({
    monitor: unavailableMonitor,
    recipientReferenceHash,
    createdAt: atMinute(73),
  });
  assert.equal(unavailable.category, "publication-unavailable");
  assert.equal(unavailable.severity, "critical");

  const staleMonitor = markAudiobookRetailPublicationMonitorStale(
    live,
    atMinute(72),
  );
  const stale = createAudiobookRetailPublicationAlert({
    monitor: staleMonitor,
    recipientReferenceHash,
    createdAt: atMinute(73),
  });
  assert.equal(stale.category, "evidence-stale");
  assert.equal(stale.severity, "warning");
  assert.equal(stale.trigger.transitionKind, "stale");

  assert.throws(
    () => createAudiobookRetailPublicationAlert({
      monitor: live,
      recipientReferenceHash,
      createdAt: atMinute(13),
    }),
    /AUDIOBOOK_RETAIL_PUBLICATION_ALERT_TRIGGER_NOT_ACTIONABLE/u,
  );
  const refreshedDegraded = recordAudiobookRetailPublicationRefresh(
    degradedMonitor(),
    verification({
      observedMinute: 100,
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
    atMinute(102),
  );
  assert.equal(refreshedDegraded.transitions.at(-1)?.kind, "refresh");
  assert.throws(
    () => createAudiobookRetailPublicationAlert({
      monitor: refreshedDegraded,
      recipientReferenceHash,
      createdAt: atMinute(103),
    }),
    /AUDIOBOOK_RETAIL_PUBLICATION_ALERT_TRIGGER_NOT_ACTIONABLE/u,
  );
});

test("notification delivery retries remain append-only, bounded and idempotent after success", () => {
  let alert = createAudiobookRetailPublicationAlert({
    monitor: degradedMonitor(),
    recipientReferenceHash,
    createdAt: atMinute(73),
  });
  alert = recordAudiobookRetailPublicationAlertDelivery(alert, {
    outcome: "failed",
    failureCode: "EMAIL_PROVIDER_TEMPORARY_FAILURE",
    attemptedAt: atMinute(74),
  });
  assert.equal(alert.notification.deliveryStatus, "pending");
  assert.equal(alert.notification.attempts.length, 1);

  alert = recordAudiobookRetailPublicationAlertDelivery(alert, {
    outcome: "sent",
    providerReceiptHash: stableHash({ receipt: "publication-alert-001" }),
    attemptedAt: atMinute(75),
  });
  assert.equal(alert.notification.deliveryStatus, "sent");
  assert.equal(alert.notification.attempts.length, 2);
  const repeated = recordAudiobookRetailPublicationAlertDelivery(alert, {
    outcome: "sent",
    providerReceiptHash: stableHash({ receipt: "ignored-repeat" }),
    attemptedAt: atMinute(76),
  });
  assert.equal(repeated.fingerprint, alert.fingerprint);

  let exhausted = createAudiobookRetailPublicationAlert({
    monitor: degradedMonitor(),
    recipientReferenceHash: stableHash({ route: "secondary" }),
    createdAt: atMinute(73),
  });
  for (const minute of [74, 75, 76]) {
    exhausted = recordAudiobookRetailPublicationAlertDelivery(exhausted, {
      outcome: "failed",
      failureCode: "EMAIL_PROVIDER_PERMANENT_FAILURE",
      attemptedAt: atMinute(minute),
    });
  }
  assert.equal(exhausted.notification.deliveryStatus, "exhausted");
  assert.throws(
    () => recordAudiobookRetailPublicationAlertDelivery(exhausted, {
      outcome: "failed",
      failureCode: "EMAIL_PROVIDER_PERMANENT_FAILURE",
      attemptedAt: atMinute(77),
    }),
    /AUDIOBOOK_RETAIL_PUBLICATION_ALERT_DELIVERY_EXHAUSTED/u,
  );
});

test("human acknowledgement and verified recovery resolve the incident without erasing it", () => {
  const degraded = degradedMonitor();
  let alert = createAudiobookRetailPublicationAlert({
    monitor: degraded,
    recipientReferenceHash,
    createdAt: atMinute(73),
  });
  alert = acknowledgeAudiobookRetailPublicationAlert(alert, {
    acknowledgedByActorId: "publication_alert_responder_001",
    notes: "Investigating the US purchase and sample regression.",
    acknowledgedAt: atMinute(74),
  });
  assert.equal(alert.status, "acknowledged");
  assert.equal(
    alert.acknowledgement?.acknowledgedByActorId,
    "publication_alert_responder_001",
  );
  assert.throws(
    () => acknowledgeAudiobookRetailPublicationAlert(
      createAudiobookRetailPublicationAlert({
        monitor: degraded,
        recipientReferenceHash: stableHash({ route: "bot-ack" }),
        createdAt: atMinute(73),
      }),
      {
        acknowledgedByActorId: "bot_publication_responder",
        acknowledgedAt: atMinute(74),
      },
    ),
    /AUDIOBOOK_RETAIL_PUBLICATION_ALERT_ACKNOWLEDGER_INVALID/u,
  );

  const recovered = recoveredMonitor(degraded);
  alert = resolveAudiobookRetailPublicationAlert(alert, {
    recoveryMonitor: recovered,
    resolvedByActorId: "publication_monitor_recovery_worker_001",
    resolvedAt: atMinute(133),
  });
  assert.equal(alert.status, "resolved");
  assert.equal(alert.resolution?.kind, "verified-recovery");
  assert.equal(
    alert.resolution?.recoveryMonitorFingerprint,
    recovered.fingerprint,
  );
  assert.doesNotThrow(() => assertAudiobookRetailPublicationAlert(alert));

  assert.throws(
    () => resolveAudiobookRetailPublicationAlert(
      createAudiobookRetailPublicationAlert({
        monitor: degraded,
        recipientReferenceHash: stableHash({ route: "invalid-recovery" }),
        createdAt: atMinute(73),
      }),
      {
        recoveryMonitor: degraded,
        resolvedByActorId: "publication_monitor_worker_002",
        resolvedAt: atMinute(74),
      },
    ),
    /AUDIOBOOK_RETAIL_PUBLICATION_ALERT_RECOVERY_INVALID/u,
  );
});

test("source substitution cannot replace the triggering monitor transition", () => {
  const monitor = degradedMonitor();
  const alert = createAudiobookRetailPublicationAlert({
    monitor,
    recipientReferenceHash,
    createdAt: atMinute(73),
  });
  const { fingerprint: _fingerprint, ...base } = alert;
  const changed = recomputeAlert({
    ...base,
    monitor: Object.freeze({
      ...alert.monitor,
      id: "publication_monitor_structurally_wrong_001",
    }),
  });
  assert.doesNotThrow(() => assertAudiobookRetailPublicationAlert(changed));
  assert.throws(
    () => assertAudiobookRetailPublicationAlertMatchesMonitor(changed, monitor),
    /AUDIOBOOK_RETAIL_PUBLICATION_ALERT_SOURCE_MISMATCH/u,
  );
});

test("revision-safe storage and public projections redact routing and evidence identities", async () => {
  const monitor = degradedMonitor();
  let alert = createAudiobookRetailPublicationAlert({
    monitor,
    recipientReferenceHash,
    createdAt: atMinute(73),
  });
  const root = await mkdtemp(join(tmpdir(), "storyteller-publication-alert-"));
  try {
    const store = new FileAudiobookRetailPublicationAlertStore(
      new FileProjectStore(root),
    );
    const created = await store.create(alert, "publication_alert_owner_001");
    const repeated = await store.create(alert, "publication_alert_owner_001");
    assert.equal(created.envelopeHash, repeated.envelopeHash);

    alert = recordAudiobookRetailPublicationAlertDelivery(alert, {
      outcome: "sent",
      providerReceiptHash: stableHash({ receipt: "store-alert-001" }),
      attemptedAt: atMinute(74),
    });
    await store.save(alert, {
      expectedRevision: 1,
      actorId: "publication_alert_sender_001",
      action: "audiobook_retail_publication_alert.notification_sent",
    });
    alert = acknowledgeAudiobookRetailPublicationAlert(alert, {
      acknowledgedByActorId: "publication_alert_responder_store_001",
      acknowledgedAt: atMinute(75),
    });
    await store.save(alert, {
      expectedRevision: 2,
      actorId: "publication_alert_responder_store_001",
      action: "audiobook_retail_publication_alert.acknowledged",
    });
    assert.equal(
      (await store.require(alert.id)).payload.fingerprint,
      alert.fingerprint,
    );

    const view = audiobookRetailPublicationAlertPublicView(alert);
    assert.equal(view.status, "acknowledged");
    assert.equal(view.notification.deliveryStatus, "sent");
    assert.equal(view.notification.attemptCount, 1);
    const serialised = JSON.stringify(view);
    const audit = await readFile(join(root, "audit", "2026-07-29.jsonl"), "utf8");
    const auditMetadata = JSON.stringify(
      audit.trim().split(/\r?\n/u).filter(Boolean).map((line) =>
        (JSON.parse(line) as { metadata: unknown }).metadata
      ),
    );
    for (const forbidden of [
      alert.projectId,
      alert.monitor.id,
      alert.monitor.fingerprint,
      alert.monitor.listingIdentityId,
      alert.monitor.listingIdentityFingerprint,
      alert.trigger.transitionFingerprint,
      alert.notification.id,
      alert.notification.recipientReferenceHash,
      alert.notification.idempotencyKey,
      alert.notification.attempts[0]!.providerReceiptHash!,
      alert.acknowledgement!.acknowledgedByActorId,
      "recipientReferenceHash",
      "providerReceiptHash",
      "transitionFingerprint",
      "listingIdentityFingerprint",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
      assert.equal(auditMetadata.includes(forbidden), false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
