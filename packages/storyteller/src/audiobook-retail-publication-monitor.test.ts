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
  FileAudiobookRetailPublicationMonitorStore,
  assertAudiobookRetailPublicationMonitor,
  audiobookRetailPublicationMonitorPublicView,
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

interface VerificationOptions {
  observedMinute: number;
  verifiedMinute?: number;
  expiresMinute?: number;
  displayTitle?: string;
  regions?: readonly Readonly<{
    regionCode: string;
    productPageAccessible: boolean;
    purchaseAvailable: boolean;
    sampleAvailable: boolean;
    samplePlaybackSuccessful: boolean;
  }>[];
  requiredRegions?: readonly string[];
  observerId?: string;
  verifierId?: string;
}

function publicationVerification(
  options: VerificationOptions,
): AudiobookRetailPublicationVerification {
  const fixture = retailPublicationVerificationFixture();
  const identity = fixture.listingIdentity;
  const verifiedMinute = options.verifiedMinute ?? options.observedMinute + 1;
  const expiresMinute = options.expiresMinute ?? options.observedMinute + 360;
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
    id: `publication_monitor_observation_${stableHash({
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
    observedByActorId:
      options.observerId ?? `publication_monitor_observer_${options.observedMinute}`,
    humanObservationConfirmed: true,
    observedAt: atMinute(options.observedMinute).toISOString(),
    expiresAt: atMinute(expiresMinute).toISOString(),
    now: atMinute(options.observedMinute),
  });
  return verifyAudiobookRetailPublication({
    id: `publication_monitor_verification_${stableHash({
      observation: observation.fingerprint,
      regions: options.requiredRegions ?? ["AU", "US"],
    }).slice(0, 24)}`,
    sources: {
      listingIdentity: identity,
      retailerStatus: fixture.retailerStatus,
      observation,
    },
    requiredRegions: options.requiredRegions ?? ["AU", "US"],
    verifiedByActorId:
      options.verifierId ?? `publication_monitor_verifier_${verifiedMinute}`,
    humanVerificationConfirmed: true,
    verifiedAt: atMinute(verifiedMinute),
  });
}

function recomputeVerification(
  partial: Omit<AudiobookRetailPublicationVerification, "fingerprint">,
): AudiobookRetailPublicationVerification {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function recomputeMonitor(
  partial: Omit<AudiobookRetailPublicationMonitor, "fingerprint">,
): AudiobookRetailPublicationMonitor {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

test("a live publication starts a healthy monitor with a bounded refresh deadline", () => {
  const verification = publicationVerification({ observedMinute: 10 });
  const monitor = createAudiobookRetailPublicationMonitor({
    id: "publication_monitor_healthy_001",
    verification,
    refreshIntervalHours: 1,
    createdAt: atMinute(12),
  });

  assert.equal(monitor.currentHealth, "healthy-live");
  assert.equal(monitor.latestVerificationStatus, "published-and-live");
  assert.equal(monitor.entries.length, 1);
  assert.equal(monitor.transitions.length, 1);
  assert.equal(monitor.transitions[0]?.kind, "initialized");
  assert.equal(monitor.nextRefreshDueAt, atMinute(71).toISOString());
  assert.deepEqual(monitor.latestFindingCodes, []);
  assert.doesNotThrow(() => assertAudiobookRetailPublicationMonitor(monitor));
});

test("refresh, regression, state change and recovery retain immutable evidence history", () => {
  const live1 = publicationVerification({ observedMinute: 10 });
  let monitor = createAudiobookRetailPublicationMonitor({
    id: "publication_monitor_transitions_001",
    verification: live1,
    refreshIntervalHours: 1,
    createdAt: atMinute(12),
  });

  const live2 = publicationVerification({ observedMinute: 40 });
  monitor = recordAudiobookRetailPublicationRefresh(
    monitor,
    live2,
    atMinute(42),
  );
  assert.equal(monitor.currentHealth, "healthy-live");
  assert.equal(monitor.transitions.at(-1)?.kind, "refresh");

  const degraded = publicationVerification({
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
  monitor = recordAudiobookRetailPublicationRefresh(
    monitor,
    degraded,
    atMinute(72),
  );
  assert.equal(monitor.currentHealth, "degraded");
  assert.equal(monitor.transitions.at(-1)?.kind, "regression");

  const mismatch = publicationVerification({
    observedMinute: 100,
    displayTitle: "The Lantern: Incorrect Public Edition",
  });
  monitor = recordAudiobookRetailPublicationRefresh(
    monitor,
    mismatch,
    atMinute(102),
  );
  assert.equal(monitor.currentHealth, "mismatch");
  assert.equal(monitor.transitions.at(-1)?.kind, "state-change");

  const live3 = publicationVerification({ observedMinute: 130 });
  monitor = recordAudiobookRetailPublicationRefresh(
    monitor,
    live3,
    atMinute(132),
  );
  assert.equal(monitor.currentHealth, "healthy-live");
  assert.equal(monitor.transitions.at(-1)?.kind, "recovery");
  assert.equal(monitor.entries.length, 5);
  assert.equal(monitor.transitions.length, 5);
  assert.deepEqual(
    monitor.entries.map((entry) => entry.verificationStatus),
    [
      "published-and-live",
      "published-and-live",
      "published-but-unavailable",
      "publication-mismatch",
      "published-and-live",
    ],
  );
  assert.doesNotThrow(() => assertAudiobookRetailPublicationMonitor(monitor));
});

test("overdue publication evidence becomes stale and a fresh live verification recovers it", () => {
  const live = publicationVerification({ observedMinute: 10 });
  let monitor = createAudiobookRetailPublicationMonitor({
    id: "publication_monitor_stale_001",
    verification: live,
    refreshIntervalHours: 1,
    createdAt: atMinute(12),
  });

  assert.throws(
    () => markAudiobookRetailPublicationMonitorStale(monitor, atMinute(70)),
    /AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_NOT_STALE/u,
  );
  monitor = markAudiobookRetailPublicationMonitorStale(monitor, atMinute(72));
  assert.equal(monitor.currentHealth, "stale");
  assert.equal(monitor.transitions.at(-1)?.kind, "stale");
  assert.equal(
    monitor.latestFindingCodes.includes(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REFRESH_OVERDUE",
    ),
    true,
  );

  const recovered = publicationVerification({ observedMinute: 80 });
  monitor = recordAudiobookRetailPublicationRefresh(
    monitor,
    recovered,
    atMinute(82),
  );
  assert.equal(monitor.currentHealth, "healthy-live");
  assert.equal(monitor.transitions.at(-1)?.kind, "recovery");
  assert.deepEqual(monitor.latestFindingCodes, []);
  assert.doesNotThrow(() => assertAudiobookRetailPublicationMonitor(monitor));
});

test("duplicates, out-of-order evidence, region drift and listing substitution fail closed", () => {
  const live = publicationVerification({ observedMinute: 10 });
  const monitor = createAudiobookRetailPublicationMonitor({
    id: "publication_monitor_scope_001",
    verification: live,
    refreshIntervalHours: 1,
    createdAt: atMinute(12),
  });

  assert.throws(
    () => recordAudiobookRetailPublicationRefresh(
      monitor,
      live,
      atMinute(20),
    ),
    /AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REFRESH_ORDER_INVALID/u,
  );

  const earlier = publicationVerification({
    observedMinute: 5,
    verifiedMinute: 6,
  });
  assert.throws(
    () => recordAudiobookRetailPublicationRefresh(
      monitor,
      earlier,
      atMinute(20),
    ),
    /AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REFRESH_ORDER_INVALID/u,
  );

  const differentRegions = publicationVerification({
    observedMinute: 40,
    requiredRegions: ["AU"],
  });
  assert.throws(
    () => recordAudiobookRetailPublicationRefresh(
      monitor,
      differentRegions,
      atMinute(42),
    ),
    /AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_SCOPE_MISMATCH/u,
  );

  const next = publicationVerification({ observedMinute: 40 });
  const { fingerprint: _fingerprint, ...base } = next;
  const substituted = recomputeVerification({
    ...base,
    listingIdentity: Object.freeze({
      ...next.listingIdentity,
      id: "retail_listing_identity_monitor_wrong_001",
    }),
  });
  assert.throws(
    () => recordAudiobookRetailPublicationRefresh(
      monitor,
      substituted,
      atMinute(42),
    ),
    /AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_SCOPE_MISMATCH/u,
  );
});

test("revision-safe persistence and public projections expose health without source evidence", async () => {
  const live = publicationVerification({ observedMinute: 10 });
  let monitor = createAudiobookRetailPublicationMonitor({
    id: "publication_monitor_store_001",
    verification: live,
    refreshIntervalHours: 1,
    createdAt: atMinute(12),
  });
  const root = await mkdtemp(join(tmpdir(), "storyteller-publication-monitor-"));
  try {
    const store = new FileAudiobookRetailPublicationMonitorStore(
      new FileProjectStore(root),
    );
    const created = await store.create(monitor, "publication_monitor_owner_001");
    const repeated = await store.create(monitor, "publication_monitor_owner_001");
    assert.equal(created.envelopeHash, repeated.envelopeHash);

    const degraded = publicationVerification({
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
          sampleAvailable: false,
          samplePlaybackSuccessful: false,
        },
      ],
    });
    monitor = recordAudiobookRetailPublicationRefresh(
      monitor,
      degraded,
      atMinute(72),
    );
    await store.save(monitor, {
      expectedRevision: 1,
      actorId: "publication_monitor_refresh_actor_001",
      action: "audiobook_retail_publication_monitor.refreshed",
    });
    assert.equal(
      (await store.require(monitor.id)).payload.fingerprint,
      monitor.fingerprint,
    );

    const view = audiobookRetailPublicationMonitorPublicView(
      monitor,
      atMinute(73),
    );
    assert.equal(view.currentHealth, "degraded");
    assert.equal(view.entryCount, 2);
    assert.equal(view.latestTransition.kind, "regression");
    assert.equal(view.refreshDue, false);
    const serialised = JSON.stringify(view);
    const audit = await readFile(join(root, "audit", "2026-07-29.jsonl"), "utf8");
    const auditMetadata = JSON.stringify(
      audit.trim().split(/\r?\n/u).filter(Boolean).map((line) =>
        (JSON.parse(line) as { metadata: unknown }).metadata
      ),
    );
    for (const forbidden of [
      monitor.projectId,
      monitor.listingIdentity.id,
      monitor.listingIdentity.fingerprint,
      monitor.entries[0]!.verificationId,
      monitor.entries[0]!.verificationFingerprint,
      monitor.entries[0]!.observationFingerprint,
      monitor.entries[1]!.verificationId,
      monitor.entries[1]!.verificationFingerprint,
      monitor.transitions[0]!.evidenceFingerprint,
      "verificationFingerprint",
      "observationFingerprint",
      "evidenceFingerprint",
      "listingIdentityFingerprint",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
      assert.equal(auditMetadata.includes(forbidden), false);
    }

    const { fingerprint: _fingerprint, ...partial } = monitor;
    const invalid = recomputeMonitor({
      ...partial,
      revision: monitor.revision + 1,
      previousFingerprint: "0".repeat(64),
    });
    await assert.rejects(
      store.save(invalid, {
        expectedRevision: 2,
        actorId: "publication_monitor_conflict_actor_001",
        action: "audiobook_retail_publication_monitor.invalid_save",
      }),
      /AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_STORE_REVISION_CONFLICT/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
