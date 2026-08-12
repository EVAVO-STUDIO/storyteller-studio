import assert from "node:assert/strict";
import test from "node:test";
import { stableHash } from "./index.js";
import {
  admittedNarratorRetailPublicationEvidencePublicView,
  admittedNarratorRetailPublicationEvidenceRequestPublicView,
  admittedNarratorRetailPublicationIncidentPublicView,
  admittedNarratorRetailPublicationOperationPublicView,
  applyAdmittedNarratorRetailPublicationEvidence,
  assertAdmittedNarratorRetailPublicationEvidence,
  assertAdmittedNarratorRetailPublicationEvidenceRequest,
  assertAdmittedNarratorRetailPublicationIncident,
  assertAdmittedNarratorRetailPublicationOperation,
  createAdmittedNarratorRetailPublicationEvidenceRequest,
  markAdmittedNarratorRetailPublicationEvidenceStale,
  resolveAdmittedNarratorRetailPublicationIncident,
  submitAdmittedNarratorRetailPublicationEvidence,
} from "./narrator-retail-publication-operations-admission.js";
import {
  createTestAdmittedNarratorRetailPublicationMonitorFixture,
  createTestAdmittedNarratorRetailRefreshVerification,
} from "../test-support/narrator-retail-publication-monitor-admission.js";

const adaptedFixture = createTestAdmittedNarratorRetailPublicationMonitorFixture({
  mode: "adapted",
  projectId: "project_narrator_publication_operations_adapted_001",
  bookId: "book_narrator_publication_operations_adapted_001",
});
const zeroShotFixture =
  createTestAdmittedNarratorRetailPublicationMonitorFixture({
    mode: "zero-shot",
    projectId: "project_narrator_publication_operations_zero_shot_001",
    bookId: "book_narrator_publication_operations_zero_shot_001",
  });

const sourceReferenceHash = stableHash({
  source: "human-governed-public-storefront-observation",
});
const recipientReferenceHash = stableHash({
  route: "narrator-publication-incident-primary",
});

function requestAt(
  monitor: Awaited<typeof adaptedFixture>["monitor"],
  requestedAt: string,
) {
  return createAdmittedNarratorRetailPublicationEvidenceRequest(
    monitor,
    new Date(requestedAt),
  );
}

test("adapted and zero-shot narrator monitors create exact admission-bound evidence requests", async () => {
  const adapted = await adaptedFixture;
  const zeroShot = await zeroShotFixture;
  for (const fixture of [adapted, zeroShot]) {
    const request = createAdmittedNarratorRetailPublicationEvidenceRequest(
      fixture.monitor,
      new Date("2026-08-10T13:28:00.000Z"),
    );
    assert.doesNotThrow(() =>
      assertAdmittedNarratorRetailPublicationEvidenceRequest(request)
    );
    assert.equal(request.request.monitor.id, fixture.monitor.monitor.id);
    assert.equal(
      request.request.monitor.fingerprint,
      fixture.monitor.monitor.fingerprint,
    );
    assert.equal(request.monitor.audiobookAsin, "B0NARRAT01");
    assert.equal(request.narratorLineageBound, true);
    assert.equal(request.automaticRefreshAuthority, false);
    assert.equal(request.publicationAuthority, false);
  }
  assert.notEqual(
    adapted.monitor.profileAdmissionHash,
    zeroShot.monitor.profileAdmissionHash,
  );
});

test("narrator metadata drift is admitted as evidence, acknowledged by refresh and raised as one critical incident", async () => {
  const fixture = await adaptedFixture;
  const request = requestAt(
    fixture.monitor,
    "2026-08-10T13:28:00.000Z",
  );
  const verification = createTestAdmittedNarratorRetailRefreshVerification({
    publication: fixture.publication,
    suffix: "operations-narrator-drift",
    observedAt: "2026-08-10T13:30:00.000Z",
    verifiedAt: "2026-08-10T13:31:00.000Z",
    observation: { narratorCredit: "Replacement Public Narrator" },
  });
  const evidence = submitAdmittedNarratorRetailPublicationEvidence({
    request,
    verification,
    sourceReferenceHash,
    receivedByActorId: "narrator-publication-evidence-receiver-001",
    receivedAt: new Date("2026-08-10T13:31:30.000Z"),
  });
  assert.doesNotThrow(() =>
    assertAdmittedNarratorRetailPublicationEvidence(evidence)
  );
  const operation = applyAdmittedNarratorRetailPublicationEvidence({
    evidence,
    actorId: "narrator-publication-refresh-worker-001",
    recipientReferenceHash,
    occurredAt: new Date("2026-08-10T13:32:00.000Z"),
  });
  assert.doesNotThrow(() =>
    assertAdmittedNarratorRetailPublicationOperation(operation)
  );
  assert.equal(operation.kind, "evidence-refresh");
  assert.equal(operation.monitor.currentHealth, "mismatch");
  assert.equal(operation.monitor.monitor.transitions.at(-1)?.kind, "regression");
  assert.equal(operation.evidenceAcknowledged, true);
  assert.equal(operation.acknowledgedEvidence?.status, "acknowledged");
  assert.equal(operation.incidentCreated, true);
  assert.equal(operation.incident?.alert.category, "identity-mismatch");
  assert.equal(operation.incident?.alert.severity, "critical");
  assert.equal(operation.incident?.status, "open");
  assert.equal(operation.automaticRemediationAuthority, false);
  assert.equal(operation.automaticRepublishAuthority, false);
});

test("missing current evidence marks only the same admitted narrator monitor stale and creates a warning incident", async () => {
  const fixture = await adaptedFixture;
  const operation = markAdmittedNarratorRetailPublicationEvidenceStale({
    monitor: fixture.monitor,
    recipientReferenceHash,
    occurredAt: new Date("2026-08-10T13:29:00.000Z"),
  });
  assert.equal(operation.kind, "evidence-stale");
  assert.equal(operation.monitor.currentHealth, "stale");
  assert.equal(operation.monitor.verifications.length, 1);
  assert.equal(operation.evidenceAcknowledged, false);
  assert.equal(operation.incidentCreated, true);
  assert.equal(operation.incident?.alert.category, "evidence-stale");
  assert.equal(operation.incident?.alert.severity, "warning");
  assert.equal(operation.incident?.verifiedRecoveryRequired, true);
  assert.equal(operation.publicationAuthority, false);
  assert.doesNotThrow(() =>
    assertAdmittedNarratorRetailPublicationOperation(operation)
  );
});

test("verified recovery resolves an incident only through the same admitted narrator listing and ASIN", async () => {
  const fixture = await adaptedFixture;
  const degradedRequest = requestAt(
    fixture.monitor,
    "2026-08-10T13:28:00.000Z",
  );
  const degradedVerification =
    createTestAdmittedNarratorRetailRefreshVerification({
      publication: fixture.publication,
      suffix: "operations-degraded",
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
  const degradedEvidence = submitAdmittedNarratorRetailPublicationEvidence({
    request: degradedRequest,
    verification: degradedVerification,
    sourceReferenceHash,
    receivedByActorId: "narrator-publication-evidence-receiver-degraded-001",
    receivedAt: new Date("2026-08-10T13:31:30.000Z"),
  });
  const degraded = applyAdmittedNarratorRetailPublicationEvidence({
    evidence: degradedEvidence,
    actorId: "narrator-publication-refresh-worker-degraded-001",
    recipientReferenceHash,
    occurredAt: new Date("2026-08-10T13:32:00.000Z"),
  });
  assert.equal(degraded.monitor.currentHealth, "degraded");
  assert.ok(degraded.incident);

  const recoveryRequest = createAdmittedNarratorRetailPublicationEvidenceRequest(
    degraded.monitor,
    new Date("2026-08-10T14:31:00.000Z"),
  );
  const recoveryVerification =
    createTestAdmittedNarratorRetailRefreshVerification({
      publication: fixture.publication,
      suffix: "operations-recovery",
      observedAt: "2026-08-10T14:32:00.000Z",
      verifiedAt: "2026-08-10T14:33:00.000Z",
      expiresAt: "2026-08-15T14:32:00.000Z",
    });
  const recoveryEvidence = submitAdmittedNarratorRetailPublicationEvidence({
    request: recoveryRequest,
    verification: recoveryVerification,
    sourceReferenceHash,
    receivedByActorId: "narrator-publication-evidence-receiver-recovery-001",
    receivedAt: new Date("2026-08-10T14:33:30.000Z"),
  });
  const recovery = applyAdmittedNarratorRetailPublicationEvidence({
    evidence: recoveryEvidence,
    actorId: "narrator-publication-refresh-worker-recovery-001",
    recipientReferenceHash,
    occurredAt: new Date("2026-08-10T14:34:00.000Z"),
  });
  assert.equal(recovery.monitor.currentHealth, "healthy-live");
  assert.equal(recovery.monitor.monitor.transitions.at(-1)?.kind, "recovery");
  assert.equal(recovery.incidentCreated, false);

  const resolved = resolveAdmittedNarratorRetailPublicationIncident(
    degraded.incident!,
    {
      recoveryMonitor: recovery.monitor,
      resolvedByActorId: "narrator-publication-incident-resolver-001",
      resolvedAt: new Date("2026-08-10T14:35:00.000Z"),
    },
  );
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.alert.resolution?.kind, "verified-recovery");
  assert.equal(
    resolved.alert.resolution?.recoveryMonitorFingerprint,
    recovery.monitor.monitor.fingerprint,
  );
  assert.equal(resolved.recoveryMonitor?.fingerprint, recovery.monitor.fingerprint);
  assert.doesNotThrow(() =>
    assertAdmittedNarratorRetailPublicationIncident(resolved)
  );
});

test("cross-title, replacement narrator and public product substitutions fail before evidence intake", async () => {
  const selected = await adaptedFixture;
  const replacement = await zeroShotFixture;
  const request = requestAt(
    selected.monitor,
    "2026-08-10T13:28:00.000Z",
  );
  const replacementVerification =
    createTestAdmittedNarratorRetailRefreshVerification({
      publication: replacement.publication,
      suffix: "operations-replacement",
      observedAt: "2026-08-10T13:30:00.000Z",
      verifiedAt: "2026-08-10T13:31:00.000Z",
    });
  assert.throws(
    () => submitAdmittedNarratorRetailPublicationEvidence({
      request,
      verification: replacementVerification,
      sourceReferenceHash,
      receivedByActorId: "narrator-publication-evidence-receiver-reject-001",
      receivedAt: new Date("2026-08-10T13:31:30.000Z"),
    }),
    /ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATIONS_EVIDENCE_LINEAGE_MISMATCH/u,
  );

  const changedAsin = createTestAdmittedNarratorRetailRefreshVerification({
    publication: selected.publication,
    suffix: "operations-asin-substitution",
    observedAt: "2026-08-10T13:30:00.000Z",
    verifiedAt: "2026-08-10T13:31:00.000Z",
    audiobookAsin: "B0NARRAT99",
  });
  assert.throws(
    () => submitAdmittedNarratorRetailPublicationEvidence({
      request,
      verification: changedAsin,
      sourceReferenceHash,
      receivedByActorId: "narrator-publication-evidence-receiver-reject-002",
      receivedAt: new Date("2026-08-10T13:31:30.000Z"),
    }),
    /ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATIONS_EVIDENCE_LINEAGE_MISMATCH/u,
  );
});

test("another admitted narrator recovery cannot resolve an existing narrator incident", async () => {
  const selected = await adaptedFixture;
  const replacement = await zeroShotFixture;
  const stale = markAdmittedNarratorRetailPublicationEvidenceStale({
    monitor: selected.monitor,
    recipientReferenceHash,
    occurredAt: new Date("2026-08-10T13:29:00.000Z"),
  });
  assert.throws(
    () => resolveAdmittedNarratorRetailPublicationIncident(stale.incident!, {
      recoveryMonitor: replacement.monitor,
      resolvedByActorId: "narrator-publication-incident-resolver-reject-001",
      resolvedAt: new Date("2026-08-10T13:30:00.000Z"),
    }),
    /ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATIONS_NARRATOR_LINEAGE_MISMATCH/u,
  );
});

test("rehashing operations or incidents cannot manufacture refresh, remediation, republish or publication authority", async () => {
  const fixture = await adaptedFixture;
  const operation = markAdmittedNarratorRetailPublicationEvidenceStale({
    monitor: fixture.monitor,
    recipientReferenceHash,
    occurredAt: new Date("2026-08-10T13:29:00.000Z"),
  });
  const { fingerprint: _operationFingerprint, ...operationBase } = operation;
  const escalatedOperation = {
    ...operationBase,
    automaticRefreshAuthority: true as never,
    automaticRemediationAuthority: true as never,
    automaticRepublishAuthority: true as never,
    publicationAuthority: true as never,
  };
  assert.throws(
    () => assertAdmittedNarratorRetailPublicationOperation({
      ...escalatedOperation,
      fingerprint: stableHash(escalatedOperation),
    }),
    /ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_AUTHORITY_INVALID/u,
  );

  const incident = operation.incident!;
  const { fingerprint: _incidentFingerprint, ...incidentBase } = incident;
  const escalatedIncident = {
    ...incidentBase,
    automaticRefreshAuthority: true as never,
    automaticRemediationAuthority: true as never,
    automaticRepublishAuthority: true as never,
    publicationAuthority: true as never,
  };
  assert.throws(
    () => assertAdmittedNarratorRetailPublicationIncident({
      ...escalatedIncident,
      fingerprint: stableHash(escalatedIncident),
    }),
    /ADMITTED_NARRATOR_RETAIL_PUBLICATION_INCIDENT_AUTHORITY_INVALID/u,
  );
});

test("public evidence, operation and incident projections expose bounded retail health without private narrator evidence", async () => {
  const fixture = await adaptedFixture;
  const request = requestAt(
    fixture.monitor,
    "2026-08-10T13:28:00.000Z",
  );
  const verification = createTestAdmittedNarratorRetailRefreshVerification({
    publication: fixture.publication,
    suffix: "operations-public-redaction",
    observedAt: "2026-08-10T13:30:00.000Z",
    verifiedAt: "2026-08-10T13:31:00.000Z",
    observation: { narratorCredit: "Drifted Storefront Narrator" },
  });
  const evidence = submitAdmittedNarratorRetailPublicationEvidence({
    request,
    verification,
    sourceReferenceHash,
    receivedByActorId: "narrator-publication-evidence-receiver-public-001",
    receivedAt: new Date("2026-08-10T13:31:30.000Z"),
  });
  const operation = applyAdmittedNarratorRetailPublicationEvidence({
    evidence,
    actorId: "narrator-publication-refresh-worker-public-001",
    recipientReferenceHash,
    occurredAt: new Date("2026-08-10T13:32:00.000Z"),
  });
  const views = [
    admittedNarratorRetailPublicationEvidenceRequestPublicView(request),
    admittedNarratorRetailPublicationEvidencePublicView(evidence),
    admittedNarratorRetailPublicationOperationPublicView(operation),
    admittedNarratorRetailPublicationIncidentPublicView(operation.incident!),
  ];
  for (const view of views) {
    assert.equal(view.audiobookAsin, "B0NARRAT01");
    assert.equal(view.narratorCredit, "EVAVO Narrator");
    assert.equal(view.narratorLineageBound, true);
    assert.equal(view.publicationAuthority, false);
  }
  const json = JSON.stringify(views);
  const initial = fixture.publication.verification;
  for (const forbidden of [
    fixture.monitor.projectId,
    fixture.monitor.profileAdmissionHash,
    fixture.monitor.admittedCastingFingerprint,
    fixture.monitor.castingFingerprint,
    fixture.monitor.voice.profileId,
    fixture.monitor.voice.profileHash,
    fixture.monitor.admittedListingFingerprint,
    fixture.monitor.monitor.id,
    fixture.monitor.monitor.fingerprint,
    fixture.monitor.monitor.listingIdentity.id,
    fixture.monitor.monitor.listingIdentity.fingerprint,
    request.request.id,
    request.request.fingerprint,
    evidence.inboxItem.id,
    evidence.inboxItem.sourceReferenceHash,
    evidence.inboxItem.receivedByActorId,
    evidence.verification.fingerprint,
    evidence.verification.verification.id,
    evidence.verification.verification.fingerprint,
    initial.observation.observation.publicProductReferenceHash,
    initial.observation.observation.sampleReferenceHash,
    initial.observation.observation.coverReferenceHash,
    recipientReferenceHash,
  ]) assert.equal(json.includes(forbidden), false);
});
