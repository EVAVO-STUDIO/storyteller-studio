import assert from "node:assert/strict";
import test from "node:test";
import { stableHash } from "./index.js";
import {
  admittedNarratorRetailPublicationMonitorPublicView,
  assertAdmittedNarratorRetailPublicationMonitor,
  createAdmittedNarratorRetailPublicationMonitor,
  markAdmittedNarratorRetailPublicationMonitorStale,
  recordAdmittedNarratorRetailPublicationRefresh,
} from "./narrator-retail-publication-monitor-admission.js";
import {
  createTestAdmittedNarratorRetailPublicationMonitorFixture,
  createTestAdmittedNarratorRetailRefreshVerification,
} from "../test-support/narrator-retail-publication-monitor-admission.js";

const adaptedFixture = createTestAdmittedNarratorRetailPublicationMonitorFixture({
  mode: "adapted",
  projectId: "project_narrator_publication_monitor_adapted_001",
  bookId: "book_narrator_publication_monitor_adapted_001",
});
const zeroShotFixture = createTestAdmittedNarratorRetailPublicationMonitorFixture({
  mode: "zero-shot",
  projectId: "project_narrator_publication_monitor_zero_shot_001",
  bookId: "book_narrator_publication_monitor_zero_shot_001",
});

test("initial published-and-live narrator verification starts one admission-bound healthy monitor", async () => {
  const adapted = await adaptedFixture;
  const zeroShot = await zeroShotFixture;
  for (const fixture of [adapted, zeroShot]) {
    const monitor = fixture.monitor;
    assert.doesNotThrow(() =>
      assertAdmittedNarratorRetailPublicationMonitor(monitor)
    );
    assert.equal(monitor.currentHealth, "healthy-live");
    assert.equal(monitor.initialLivePublicationConfirmed, true);
    assert.equal(monitor.latestLiveConfirmed, true);
    assert.equal(monitor.verifications.length, 1);
    assert.equal(monitor.monitor.entries.length, 1);
    assert.equal(monitor.monitor.transitions[0]?.kind, "initialized");
    assert.equal(monitor.continuousNarratorLineageBound, true);
    assert.equal(monitor.admittedListingIdentityInvariant, true);
    assert.equal(monitor.publicationAuthority, false);
  }
  assert.notEqual(
    adapted.monitor.profileAdmissionHash,
    zeroShot.monitor.profileAdmissionHash,
  );
  assert.ok(
    adapted.publication.verification.observation.listing.retailerStatus.submission
      .decision.review.delivery.release.packageApproval.sample.tracks.admittedPlan
      .wholeBookApproval.binding.reference.audiobook.admittedCasting
      .profileAdmission.training,
  );
  assert.equal(
    zeroShot.publication.verification.observation.listing.retailerStatus.submission
      .decision.review.delivery.release.packageApproval.sample.tracks.admittedPlan
      .wholeBookApproval.binding.reference.audiobook.admittedCasting
      .profileAdmission.training,
    null,
  );
});

test("narrator metadata drift records a regression without losing original narrator lineage", async () => {
  const fixture = await adaptedFixture;
  const drift = createTestAdmittedNarratorRetailRefreshVerification({
    publication: fixture.publication,
    suffix: "narrator-drift",
    observedAt: "2026-08-10T13:30:00.000Z",
    verifiedAt: "2026-08-10T13:31:00.000Z",
    observation: { narratorCredit: "Replacement Narrator" },
  });
  assert.equal(drift.status, "publication-mismatch");
  const next = recordAdmittedNarratorRetailPublicationRefresh(
    fixture.monitor,
    drift,
    new Date("2026-08-10T13:32:00.000Z"),
  );
  assert.equal(next.currentHealth, "mismatch");
  assert.equal(next.latestLiveConfirmed, false);
  assert.equal(next.monitor.transitions.at(-1)?.kind, "regression");
  assert.equal(next.verifications.length, 2);
  assert.equal(
    next.verifications[0]?.observation.listing.fingerprint,
    next.verifications[1]?.observation.listing.fingerprint,
  );
  assert.equal(next.admittedListingFingerprint, fixture.monitor.admittedListingFingerprint);
  assert.doesNotThrow(() => assertAdmittedNarratorRetailPublicationMonitor(next));
});

test("purchase or sample degradation can recover only through the same admitted narrator listing", async () => {
  const fixture = await adaptedFixture;
  const degradedVerification = createTestAdmittedNarratorRetailRefreshVerification({
    publication: fixture.publication,
    suffix: "degraded",
    observedAt: "2026-08-10T13:30:00.000Z",
    verifiedAt: "2026-08-10T13:31:00.000Z",
    observation: {
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
    },
  });
  assert.equal(degradedVerification.status, "published-but-unavailable");
  const degraded = recordAdmittedNarratorRetailPublicationRefresh(
    fixture.monitor,
    degradedVerification,
    new Date("2026-08-10T13:32:00.000Z"),
  );
  assert.equal(degraded.currentHealth, "degraded");
  assert.equal(degraded.monitor.transitions.at(-1)?.kind, "regression");
  assert.equal(degraded.latestPurchaseConfirmed, false);
  assert.equal(degraded.latestSamplePlaybackConfirmed, false);

  const recoveredVerification = createTestAdmittedNarratorRetailRefreshVerification({
    publication: fixture.publication,
    suffix: "recovered",
    observedAt: "2026-08-10T14:30:00.000Z",
    verifiedAt: "2026-08-10T14:31:00.000Z",
    expiresAt: "2026-08-15T14:30:00.000Z",
  });
  const recovered = recordAdmittedNarratorRetailPublicationRefresh(
    degraded,
    recoveredVerification,
    new Date("2026-08-10T14:32:00.000Z"),
  );
  assert.equal(recovered.currentHealth, "healthy-live");
  assert.equal(recovered.latestLiveConfirmed, true);
  assert.equal(recovered.monitor.transitions.at(-1)?.kind, "recovery");
  assert.equal(recovered.verifications.length, 3);
  assert.doesNotThrow(() =>
    assertAdmittedNarratorRetailPublicationMonitor(recovered)
  );
});

test("overdue evidence becomes stale without inventing another narrator verification", async () => {
  const fixture = await adaptedFixture;
  const stale = markAdmittedNarratorRetailPublicationMonitorStale(
    fixture.monitor,
    new Date("2026-08-10T13:29:00.000Z"),
  );
  assert.equal(stale.currentHealth, "stale");
  assert.equal(stale.staleEvidence, true);
  assert.equal(stale.verifications.length, 1);
  assert.equal(stale.monitor.entries.length, 1);
  assert.equal(stale.monitor.transitions.at(-1)?.kind, "stale");
  assert.equal(
    stale.monitor.latestFindingCodes.includes(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REFRESH_OVERDUE",
    ),
    true,
  );
  assert.equal(stale.automaticRemediationAuthority, false);
  assert.equal(stale.automaticRepublishAuthority, false);
});

test("a non-live verification cannot initialize post-publication narrator monitoring", async () => {
  const fixture = await adaptedFixture;
  const mismatch = createTestAdmittedNarratorRetailRefreshVerification({
    publication: fixture.publication,
    suffix: "initial-mismatch",
    observedAt: "2026-08-10T13:30:00.000Z",
    verifiedAt: "2026-08-10T13:31:00.000Z",
    observation: { narratorCredit: "Wrong Initial Narrator" },
  });
  assert.throws(
    () => createAdmittedNarratorRetailPublicationMonitor({
      id: "admitted_narrator_monitor_non_live_001",
      verification: mismatch,
      refreshIntervalHours: 1,
    }),
    /ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_INITIAL_LIVE_REQUIRED/u,
  );
});

test("cross-title, replacement narrator and public product substitutions cannot enter an existing monitor", async () => {
  const selected = await adaptedFixture;
  const replacement = await zeroShotFixture;
  assert.throws(
    () => recordAdmittedNarratorRetailPublicationRefresh(
      selected.monitor,
      replacement.publication.verification,
      new Date("2026-08-10T13:32:00.000Z"),
    ),
    /ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_NARRATOR_LINEAGE_MISMATCH/u,
  );

  const changedAsin = createTestAdmittedNarratorRetailRefreshVerification({
    publication: selected.publication,
    suffix: "asin-substitution",
    observedAt: "2026-08-10T13:30:00.000Z",
    verifiedAt: "2026-08-10T13:31:00.000Z",
    audiobookAsin: "B0NARRAT99",
  });
  assert.equal(changedAsin.status, "published-and-live");
  assert.throws(
    () => recordAdmittedNarratorRetailPublicationRefresh(
      selected.monitor,
      changedAsin,
      new Date("2026-08-10T13:32:00.000Z"),
    ),
    /ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_NARRATOR_LINEAGE_MISMATCH/u,
  );
});

test("rehashing a narrator monitor cannot manufacture remediation or republish authority", async () => {
  const fixture = await adaptedFixture;
  const { fingerprint: _fingerprint, ...base } = fixture.monitor;
  const escalated = {
    ...base,
    automaticRemediationAuthority: true as never,
    automaticRepublishAuthority: true as never,
    publicationAuthority: true as never,
  };
  assert.throws(
    () => assertAdmittedNarratorRetailPublicationMonitor({
      ...escalated,
      fingerprint: stableHash(escalated),
    }),
    /ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_AUTHORITY_INVALID/u,
  );
});

test("public monitor projection exposes drift health without private narrator or evidence identities", async () => {
  const fixture = await adaptedFixture;
  const drift = createTestAdmittedNarratorRetailRefreshVerification({
    publication: fixture.publication,
    suffix: "public-redaction",
    observedAt: "2026-08-10T13:30:00.000Z",
    verifiedAt: "2026-08-10T13:31:00.000Z",
    observation: { narratorCredit: "Publicly Drifted Narrator" },
  });
  const monitor = recordAdmittedNarratorRetailPublicationRefresh(
    fixture.monitor,
    drift,
    new Date("2026-08-10T13:32:00.000Z"),
  );
  const view = admittedNarratorRetailPublicationMonitorPublicView(
    monitor,
    new Date("2026-08-10T13:32:00.000Z"),
  );
  assert.equal(view.currentHealth, "mismatch");
  assert.equal(view.audiobookAsin, "B0NARRAT01");
  assert.equal(view.narratorCredit, "EVAVO Narrator");
  assert.equal(view.continuousNarratorLineageBound, true);
  assert.equal(view.publicationAuthority, false);
  const json = JSON.stringify(view);
  const initial = fixture.publication.verification;
  for (const forbidden of [
    monitor.projectId,
    monitor.profileAdmissionHash,
    monitor.admittedCastingFingerprint,
    monitor.castingFingerprint,
    monitor.voice.profileId,
    monitor.voice.profileHash,
    monitor.admittedListingFingerprint,
    monitor.monitor.id,
    monitor.monitor.listingIdentity.id,
    monitor.monitor.listingIdentity.fingerprint,
    initial.fingerprint,
    initial.verification.id,
    initial.verification.fingerprint,
    initial.observation.fingerprint,
    initial.observation.observation.fingerprint,
    initial.observation.observation.publicProductReferenceHash,
    initial.observation.observation.sampleReferenceHash,
    initial.observation.observation.coverReferenceHash,
  ]) assert.equal(json.includes(forbidden), false);
});
