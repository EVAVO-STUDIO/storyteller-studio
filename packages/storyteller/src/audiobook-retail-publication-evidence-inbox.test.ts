import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createAudiobookRetailPublicationMonitor,
  recordAudiobookRetailPublicationRefresh,
  type AudiobookRetailPublicationMonitor,
} from "./audiobook-retail-publication-monitor.js";
import {
  createAudiobookRetailPublicListingObservation,
  verifyAudiobookRetailPublication,
  type AudiobookRetailPublicationVerification,
} from "./audiobook-retail-publication-verification.js";
import {
  FileAudiobookRetailPublicationEvidenceInboxStore,
  acknowledgeAudiobookRetailPublicationEvidence,
  assertAudiobookRetailPublicationEvidenceInboxItem,
  assertAudiobookRetailPublicationEvidenceMatchesRequest,
  audiobookRetailPublicationEvidenceInboxPublicView,
  audiobookRetailPublicationRefreshRequestFingerprint,
  createAudiobookRetailPublicationEvidenceRequest,
  submitAudiobookRetailPublicationEvidence,
  type AudiobookRetailPublicationEvidenceInboxItem,
} from "./audiobook-retail-publication-evidence-inbox.js";
import { stableHash } from "./index.js";
import { FileProjectStore } from "./project-store.js";
import { retailReleaseAt } from "./test-support/retail-release-policy-fixture.js";
import { retailPublicationVerificationFixture } from "./test-support/retail-publication-verification-fixture.js";

function verification(input: Readonly<{
  suffix: string;
  observedSecond: number;
  requiredRegions?: readonly string[];
}>): AudiobookRetailPublicationVerification {
  const fixture = retailPublicationVerificationFixture();
  const identity = fixture.listingIdentity;
  const requiredRegions = input.requiredRegions ?? ["AU", "US"];
  const observation = createAudiobookRetailPublicListingObservation({
    id: `publication_evidence_observation_${input.suffix}`,
    projectId: identity.projectId,
    bookId: identity.bookId,
    audiobookAsin: "B0AUDIO001",
    publicProductReferenceHash: stableHash({
      kind: "product",
      suffix: input.suffix,
    }),
    sampleReferenceHash: stableHash({
      kind: "sample",
      suffix: input.suffix,
    }),
    coverReferenceHash: stableHash({
      kind: "cover",
      suffix: input.suffix,
    }),
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
    observedByActorId: `publication_evidence_observer_${input.suffix}`,
    humanObservationConfirmed: true,
    observedAt: retailReleaseAt(input.observedSecond).toISOString(),
    expiresAt: retailReleaseAt(input.observedSecond + 7_200).toISOString(),
    now: retailReleaseAt(input.observedSecond),
  });
  return verifyAudiobookRetailPublication({
    id: `publication_evidence_verification_${input.suffix}`,
    sources: {
      listingIdentity: identity,
      retailerStatus: fixture.retailerStatus,
      observation,
    },
    requiredRegions,
    verifiedByActorId: `publication_evidence_verifier_${input.suffix}`,
    humanVerificationConfirmed: true,
    verifiedAt: retailReleaseAt(input.observedSecond + 1),
  });
}

function initialMonitor(
  id = "publication_evidence_monitor_001",
): AudiobookRetailPublicationMonitor {
  return createAudiobookRetailPublicationMonitor({
    id,
    verification: verification({ suffix: `${id}_initial`, observedSecond: 30 }),
    refreshIntervalHours: 1,
    createdAt: retailReleaseAt(32),
  });
}

function submittedItem(input: Readonly<{
  monitor?: AudiobookRetailPublicationMonitor;
  suffix?: string;
  observedSecond?: number;
  receivedSecond?: number;
}> = {}): Readonly<{
  monitor: AudiobookRetailPublicationMonitor;
  verification: AudiobookRetailPublicationVerification;
  item: AudiobookRetailPublicationEvidenceInboxItem;
}> {
  const monitor = input.monitor ?? initialMonitor();
  const request = createAudiobookRetailPublicationEvidenceRequest(
    monitor,
    retailReleaseAt(3_631),
  );
  const nextVerification = verification({
    suffix: input.suffix ?? "next",
    observedSecond: input.observedSecond ?? 3_700,
  });
  const item = submitAudiobookRetailPublicationEvidence({
    request,
    verification: nextVerification,
    sourceReferenceHash: stableHash({
      source: input.suffix ?? "next",
    }),
    receivedByActorId: "publication_evidence_intake_worker_001",
    receivedAt: retailReleaseAt(input.receivedSecond ?? 3_702),
  });
  return Object.freeze({ monitor, verification: nextVerification, item });
}

function consume(
  monitor: AudiobookRetailPublicationMonitor,
  nextVerification: AudiobookRetailPublicationVerification,
  recordedSecond: number,
): AudiobookRetailPublicationMonitor {
  return recordAudiobookRetailPublicationRefresh(
    monitor,
    nextVerification,
    retailReleaseAt(recordedSecond),
  );
}

test("refresh requests are deterministic and bind the exact monitor revision", () => {
  const monitor = initialMonitor();
  const first = createAudiobookRetailPublicationEvidenceRequest(
    monitor,
    retailReleaseAt(3_631),
  );
  const repeated = createAudiobookRetailPublicationEvidenceRequest(
    monitor,
    retailReleaseAt(3_631),
  );
  assert.deepEqual(first, repeated);
  assert.equal(
    first.requestFingerprint,
    audiobookRetailPublicationRefreshRequestFingerprint(monitor),
  );
  assert.equal(first.monitor.revision, monitor.revision);
  assert.equal(first.monitor.fingerprint, monitor.fingerprint);
  assert.equal(
    first.monitor.latestVerificationFingerprint,
    monitor.entries.at(-1)?.verificationFingerprint,
  );

  const nextVerification = verification({
    suffix: "request_advanced",
    observedSecond: 3_700,
  });
  const advanced = consume(monitor, nextVerification, 3_702);
  const advancedRequest = createAudiobookRetailPublicationEvidenceRequest(
    advanced,
    retailReleaseAt(7_303),
  );
  assert.notEqual(advancedRequest.requestFingerprint, first.requestFingerprint);
  assert.notEqual(advancedRequest.monitor.fingerprint, first.monitor.fingerprint);
});

test("evidence admission requires a later current complete verification with exact regions", () => {
  const monitor = initialMonitor();
  const request = createAudiobookRetailPublicationEvidenceRequest(
    monitor,
    retailReleaseAt(3_631),
  );
  const nextVerification = verification({
    suffix: "admission",
    observedSecond: 3_700,
  });
  const item = submitAudiobookRetailPublicationEvidence({
    request,
    verification: nextVerification,
    sourceReferenceHash: "a".repeat(64),
    receivedByActorId: "publication_evidence_intake_worker_001",
    receivedAt: retailReleaseAt(3_702),
  });
  assert.equal(item.status, "available");
  assert.equal(item.revision, 1);
  assert.equal(item.verification.fingerprint, nextVerification.fingerprint);
  assert.doesNotThrow(() =>
    assertAudiobookRetailPublicationEvidenceMatchesRequest(
      request,
      nextVerification,
      retailReleaseAt(3_702),
    )
  );
  assert.doesNotThrow(() =>
    assertAudiobookRetailPublicationEvidenceInboxItem(item)
  );

  assert.throws(
    () => submitAudiobookRetailPublicationEvidence({
      request,
      verification: monitor.entries.length
        ? verification({ suffix: `${monitor.id}_initial`, observedSecond: 30 })
        : nextVerification,
      sourceReferenceHash: "b".repeat(64),
      receivedByActorId: "publication_evidence_intake_worker_001",
      receivedAt: retailReleaseAt(3_702),
    }),
    /AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REQUEST_MISMATCH/u,
  );

  const regionDrift = verification({
    suffix: "region_drift",
    observedSecond: 3_710,
    requiredRegions: ["AU"],
  });
  assert.throws(
    () => submitAudiobookRetailPublicationEvidence({
      request,
      verification: regionDrift,
      sourceReferenceHash: "c".repeat(64),
      receivedByActorId: "publication_evidence_intake_worker_001",
      receivedAt: retailReleaseAt(3_712),
    }),
    /AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REQUEST_MISMATCH/u,
  );

  assert.throws(
    () => submitAudiobookRetailPublicationEvidence({
      request,
      verification: nextVerification,
      sourceReferenceHash: "d".repeat(64),
      receivedByActorId: "publication_evidence_intake_worker_001",
      receivedAt: retailReleaseAt(11_000),
    }),
    /AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REQUEST_MISMATCH/u,
  );
});

test("the inbox selects the latest current available evidence deterministically", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "storyteller-evidence-inbox-"));
  try {
    const state = new FileProjectStore(temporaryRoot);
    const inbox = new FileAudiobookRetailPublicationEvidenceInboxStore(state);
    const monitor = initialMonitor();
    const request = createAudiobookRetailPublicationEvidenceRequest(
      monitor,
      retailReleaseAt(3_631),
    );
    const earlier = submitAudiobookRetailPublicationEvidence({
      request,
      verification: verification({
        suffix: "selection_earlier",
        observedSecond: 3_700,
      }),
      sourceReferenceHash: "e".repeat(64),
      receivedByActorId: "publication_evidence_intake_worker_001",
      receivedAt: retailReleaseAt(3_702),
    });
    const later = submitAudiobookRetailPublicationEvidence({
      request,
      verification: verification({
        suffix: "selection_later",
        observedSecond: 3_800,
      }),
      sourceReferenceHash: "f".repeat(64),
      receivedByActorId: "publication_evidence_intake_worker_001",
      receivedAt: retailReleaseAt(3_802),
    });
    await inbox.create(earlier, "publication_evidence_store_worker_001");
    await inbox.create(later, "publication_evidence_store_worker_001");

    const selected = await inbox.findCurrentForRequest(
      request,
      retailReleaseAt(3_900),
    );
    assert.equal(selected?.payload.id, later.id);

    const consumedMonitor = consume(monitor, later.verification, 3_803);
    const acknowledged = acknowledgeAudiobookRetailPublicationEvidence(later, {
      monitor: consumedMonitor,
      acknowledgedByActorId: "publication_refresh_gateway_worker_001",
      acknowledgedAt: retailReleaseAt(3_804),
    });
    await inbox.save(acknowledged, {
      expectedRevision: 1,
      actorId: "publication_refresh_gateway_worker_001",
      action: "audiobook_retail_publication_evidence.acknowledged",
    });

    const fallback = await inbox.findCurrentForRequest(
      request,
      retailReleaseAt(3_900),
    );
    assert.equal(fallback?.payload.id, earlier.id);
    assert.equal(
      await inbox.findCurrentForRequest(request, retailReleaseAt(11_100)),
      null,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("acknowledgement requires a later monitor revision that consumed the exact verification", () => {
  const { monitor, verification: nextVerification, item } = submittedItem({
    suffix: "acknowledgement",
  });
  const unrelatedVerification = verification({
    suffix: "acknowledgement_unrelated",
    observedSecond: 3_710,
  });
  const wrongMonitor = consume(monitor, unrelatedVerification, 3_712);
  assert.throws(
    () => acknowledgeAudiobookRetailPublicationEvidence(item, {
      monitor: wrongMonitor,
      acknowledgedByActorId: "publication_refresh_gateway_worker_001",
      acknowledgedAt: retailReleaseAt(3_713),
    }),
    /AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_ACKNOWLEDGEMENT_INVALID/u,
  );

  const consumedMonitor = consume(monitor, nextVerification, 3_703);
  const acknowledged = acknowledgeAudiobookRetailPublicationEvidence(item, {
    monitor: consumedMonitor,
    acknowledgedByActorId: "publication_refresh_gateway_worker_001",
    acknowledgedAt: retailReleaseAt(3_704),
  });
  assert.equal(acknowledged.status, "acknowledged");
  assert.equal(acknowledged.revision, 2);
  assert.equal(
    acknowledged.acknowledgement?.verificationFingerprint,
    nextVerification.fingerprint,
  );
  assert.equal(
    acknowledgeAudiobookRetailPublicationEvidence(acknowledged, {
      monitor: consumedMonitor,
      acknowledgedByActorId: "another_worker_001",
      acknowledgedAt: retailReleaseAt(3_705),
    }),
    acknowledged,
  );
});

test("revision-safe persistence and public views redact private evidence provenance", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "storyteller-evidence-store-"));
  try {
    const state = new FileProjectStore(temporaryRoot);
    const inbox = new FileAudiobookRetailPublicationEvidenceInboxStore(state);
    const { monitor, verification: nextVerification, item } = submittedItem({
      suffix: "persistence",
    });
    const created = await inbox.create(
      item,
      "publication_evidence_store_worker_001",
    );
    assert.equal(
      (await inbox.create(item, "publication_evidence_store_worker_001"))
        .envelopeHash,
      created.envelopeHash,
    );

    const publicView = audiobookRetailPublicationEvidenceInboxPublicView(item);
    const serialised = JSON.stringify(publicView);
    for (const forbidden of [
      item.sourceReferenceHash,
      item.request.requestFingerprint,
      item.request.monitor.fingerprint,
      item.verification.fingerprint,
      item.verification.verifiedByActorId,
      item.verification.observation.publicProductReferenceHash,
      item.receivedByActorId,
    ]) {
      assert.equal(serialised.includes(forbidden), false);
    }

    const consumedMonitor = consume(monitor, nextVerification, 3_703);
    const acknowledged = acknowledgeAudiobookRetailPublicationEvidence(item, {
      monitor: consumedMonitor,
      acknowledgedByActorId: "publication_refresh_gateway_worker_001",
      acknowledgedAt: retailReleaseAt(3_704),
    });
    const saved = await inbox.save(acknowledged, {
      expectedRevision: 1,
      actorId: "publication_refresh_gateway_worker_001",
      action: "audiobook_retail_publication_evidence.acknowledged",
    });
    assert.equal(saved.revision, 2);
    await assert.rejects(
      inbox.save(acknowledged, {
        expectedRevision: 1,
        actorId: "publication_refresh_gateway_worker_001",
        action: "audiobook_retail_publication_evidence.acknowledged",
      }),
      /AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_STORE_REVISION_CONFLICT/u,
    );

    const audit = await readFile(join(temporaryRoot, "audit.jsonl"), "utf8");
    for (const forbidden of [
      item.sourceReferenceHash,
      item.request.requestFingerprint,
      item.verification.fingerprint,
      item.verification.verifiedByActorId,
      item.receivedByActorId,
    ]) {
      assert.equal(audit.includes(forbidden), false);
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
