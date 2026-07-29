import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileAudiobookRetailPublicationAlertStore,
  createAudiobookRetailPublicationAlert,
} from "@evavo/storyteller-engine/audiobook-retail-publication-alert";
import {
  FileAudiobookRetailPublicationEvidenceInboxStore,
  acknowledgeAudiobookRetailPublicationEvidence,
  createAudiobookRetailPublicationEvidenceRequest,
  submitAudiobookRetailPublicationEvidence,
} from "@evavo/storyteller-engine/audiobook-retail-publication-evidence-inbox";
import {
  FileAudiobookRetailPublicationMonitorStore,
  createAudiobookRetailPublicationMonitor,
  recordAudiobookRetailPublicationRefresh,
} from "@evavo/storyteller-engine/audiobook-retail-publication-monitor";
import {
  createAudiobookRetailPublicListingObservation,
  verifyAudiobookRetailPublication,
  type AudiobookRetailPublicationVerification,
} from "@evavo/storyteller-engine/audiobook-retail-publication-verification";
import { stableHash } from "@evavo/storyteller-engine";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";
import { retailReleaseAt } from "../../storyteller/src/test-support/retail-release-policy-fixture.js";
import { retailPublicationVerificationFixture } from "../../storyteller/src/test-support/retail-publication-verification-fixture.js";
import { runPublicationOperationsIntegrityCli } from "./publication-operations-integrity-main.js";
import { verifyPublicationOperationsStateIntegrity } from "./publication-operations-integrity.js";

function publicationVerification(input: Readonly<{
  suffix: string;
  observedSecond: number;
  samplePlaybackSuccessful?: boolean;
}>): AudiobookRetailPublicationVerification {
  const fixture = retailPublicationVerificationFixture();
  const identity = fixture.listingIdentity;
  const samplePlaybackSuccessful = input.samplePlaybackSuccessful ?? true;
  const observation = createAudiobookRetailPublicListingObservation({
    id: `publication_integrity_observation_${input.suffix}`,
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
      samplePlaybackSuccessful,
    })),
    observedByActorId: `publication_integrity_observer_${input.suffix}`,
    humanObservationConfirmed: true,
    observedAt: retailReleaseAt(input.observedSecond).toISOString(),
    expiresAt: retailReleaseAt(input.observedSecond + 7_200).toISOString(),
    now: retailReleaseAt(input.observedSecond),
  });
  return verifyAudiobookRetailPublication({
    id: `publication_integrity_verification_${input.suffix}`,
    sources: {
      listingIdentity: identity,
      retailerStatus: fixture.retailerStatus,
      observation,
    },
    requiredRegions: ["AU", "US"],
    verifiedByActorId: `publication_integrity_verifier_${input.suffix}`,
    humanVerificationConfirmed: true,
    verifiedAt: retailReleaseAt(input.observedSecond + 1),
  });
}

async function createIntegrityFixture(input: Readonly<{
  acknowledgeEvidence?: boolean;
}> = {}): Promise<Readonly<{
  root: string;
  dataDirectory: string;
  stateRoot: string;
  monitorId: string;
  alertId: string;
  evidenceId: string;
  cleanup(): Promise<void>;
}>> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-publication-integrity-"));
  const dataDirectory = join(root, "data");
  const stateRoot = join(dataDirectory, "publication-operations");
  const state = new FileProjectStore(stateRoot);
  const monitors = new FileAudiobookRetailPublicationMonitorStore(state);
  const alerts = new FileAudiobookRetailPublicationAlertStore(state);
  const inbox = new FileAudiobookRetailPublicationEvidenceInboxStore(state);

  const initialVerification = publicationVerification({
    suffix: "initial",
    observedSecond: 30,
  });
  const initialMonitor = createAudiobookRetailPublicationMonitor({
    id: "publication_integrity_monitor_001",
    verification: initialVerification,
    refreshIntervalHours: 1,
    createdAt: retailReleaseAt(32),
  });
  await monitors.create(initialMonitor, "publication_integrity_store_actor_001");

  const degradedVerification = publicationVerification({
    suffix: "degraded",
    observedSecond: 3_700,
    samplePlaybackSuccessful: false,
  });
  const request = createAudiobookRetailPublicationEvidenceRequest(
    initialMonitor,
    retailReleaseAt(3_600),
  );
  const evidence = submitAudiobookRetailPublicationEvidence({
    request,
    verification: degradedVerification,
    sourceReferenceHash: stableHash({
      source: "publication-integrity-fixture-envelope",
    }),
    receivedByActorId: "publication_integrity_receiver_001",
    receivedAt: retailReleaseAt(3_702),
  });
  await inbox.create(evidence, "publication_integrity_store_actor_001");

  const updatedMonitor = recordAudiobookRetailPublicationRefresh(
    initialMonitor,
    degradedVerification,
    retailReleaseAt(3_703),
  );
  await monitors.save(updatedMonitor, {
    expectedRevision: 1,
    actorId: "publication_integrity_store_actor_001",
    action: "audiobook_retail_publication_monitor.refresh_recorded",
  });

  if (input.acknowledgeEvidence ?? true) {
    const acknowledged = acknowledgeAudiobookRetailPublicationEvidence(
      evidence,
      {
        monitor: updatedMonitor,
        acknowledgedByActorId: "publication_integrity_gateway_001",
        acknowledgedAt: retailReleaseAt(3_704),
      },
    );
    await inbox.save(acknowledged, {
      expectedRevision: 1,
      actorId: "publication_integrity_gateway_001",
      action: "audiobook_retail_publication_evidence.acknowledged",
    });
  }

  const alert = createAudiobookRetailPublicationAlert({
    monitor: updatedMonitor,
    recipientReferenceHash: stableHash({
      route: "publication-integrity-fixture",
    }),
    createdAt: retailReleaseAt(3_705),
  });
  await alerts.create(alert, "publication_integrity_store_actor_001");

  return Object.freeze({
    root,
    dataDirectory,
    stateRoot,
    monitorId: updatedMonitor.id,
    alertId: alert.id,
    evidenceId: evidence.id,
    cleanup: () => rm(root, { recursive: true, force: true }),
  });
}

test("restored publication state validates domain envelopes, graph links and audit fingerprints", async () => {
  const fixture = await createIntegrityFixture();
  try {
    const result = await verifyPublicationOperationsStateIntegrity({
      dataDirectory: fixture.dataDirectory,
      checkedAt: retailReleaseAt(3_706),
    });
    assert.equal(result.status, "valid");
    assert.equal(result.monitorCount, 1);
    assert.equal(result.alertCount, 1);
    assert.equal(result.evidenceInboxCount, 1);
    assert.equal(result.totalEntityCount, 3);
    assert.equal(result.monitorHealth.degraded, 1);
    assert.equal(result.alertStatus.open, 1);
    assert.equal(result.evidenceStatus.acknowledged, 1);
    assert.equal(result.auditPartitionCount >= 1, true);
    assert.equal(result.auditEventCount >= 5, true);
    assert.deepEqual(result.issueCodes, []);
    assert.deepEqual(result.warningCodes, []);
    assert.match(result.fingerprint, /^[a-f0-9]{64}$/u);
  } finally {
    await fixture.cleanup();
  }
});

test("tampered entity envelopes fail closed without exposing entity identifiers", async () => {
  const fixture = await createIntegrityFixture();
  try {
    const monitorPath = join(
      fixture.stateRoot,
      "entities",
      "audiobook-retail-publication-monitor",
      `${fixture.monitorId}.json`,
    );
    const envelope = JSON.parse(
      await readFile(monitorPath, "utf8"),
    ) as Record<string, unknown>;
    const payload = envelope.payload as Record<string, unknown>;
    payload.currentHealth = "healthy-live";
    await writeFile(monitorPath, `${JSON.stringify(envelope)}\n`, "utf8");

    const result = await verifyPublicationOperationsStateIntegrity({
      dataDirectory: fixture.dataDirectory,
      checkedAt: retailReleaseAt(3_706),
    });
    assert.equal(result.status, "invalid");
    assert.equal(
      result.issueCodes.includes(
        "PUBLICATION_OPERATIONS_INTEGRITY_MONITOR_ENVELOPE_INVALID",
      ),
      true,
    );
    assert.equal(JSON.stringify(result).includes(fixture.monitorId), false);
  } finally {
    await fixture.cleanup();
  }
});

test("missing monitors make alert, evidence and audit references invalid", async () => {
  const fixture = await createIntegrityFixture();
  try {
    await unlink(join(
      fixture.stateRoot,
      "entities",
      "audiobook-retail-publication-monitor",
      `${fixture.monitorId}.json`,
    ));
    const result = await verifyPublicationOperationsStateIntegrity({
      dataDirectory: fixture.dataDirectory,
      checkedAt: retailReleaseAt(3_706),
    });
    assert.equal(result.status, "invalid");
    assert.equal(
      result.issueCodes.includes(
        "PUBLICATION_OPERATIONS_INTEGRITY_ALERT_MONITOR_MISSING",
      ),
      true,
    );
    assert.equal(
      result.issueCodes.includes(
        "PUBLICATION_OPERATIONS_INTEGRITY_EVIDENCE_MONITOR_MISSING",
      ),
      true,
    );
    assert.equal(
      result.issueCodes.includes(
        "PUBLICATION_OPERATIONS_INTEGRITY_AUDIT_ENTITY_MISSING",
      ),
      true,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("audit metadata tampering is detected independently from entity envelopes", async () => {
  const fixture = await createIntegrityFixture();
  try {
    const auditFiles = await readdir(join(fixture.stateRoot, "audit"));
    const auditPath = join(fixture.stateRoot, "audit", auditFiles[0]!);
    const lines = (await readFile(auditPath, "utf8")).trimEnd().split("\n");
    const first = JSON.parse(lines[0]!) as Record<string, unknown>;
    first.metadata = { altered: true };
    lines[0] = JSON.stringify(first);
    await writeFile(auditPath, `${lines.join("\n")}\n`, "utf8");

    const result = await verifyPublicationOperationsStateIntegrity({
      dataDirectory: fixture.dataDirectory,
      checkedAt: retailReleaseAt(3_706),
    });
    assert.equal(result.status, "invalid");
    assert.equal(
      result.issueCodes.includes(
        "PUBLICATION_OPERATIONS_INTEGRITY_AUDIT_FINGERPRINT_INVALID",
      ),
      true,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("consumed but unacknowledged evidence is a safe reconciliation warning", async () => {
  const fixture = await createIntegrityFixture({ acknowledgeEvidence: false });
  try {
    const result = await verifyPublicationOperationsStateIntegrity({
      dataDirectory: fixture.dataDirectory,
      checkedAt: retailReleaseAt(3_706),
    });
    assert.equal(result.status, "valid-with-warnings");
    assert.equal(
      result.warningCodes.includes(
        "PUBLICATION_OPERATIONS_INTEGRITY_EVIDENCE_RECONCILIATION_PENDING",
      ),
      true,
    );
    assert.deepEqual(result.issueCodes, []);

    const nonStrictOutput: string[] = [];
    assert.equal(
      await runPublicationOperationsIntegrityCli(
        [
          "--data-dir", fixture.dataDirectory,
          "--checked-at", retailReleaseAt(3_706).toISOString(),
        ],
        {
          environment: {},
          stdout: { write: (value) => nonStrictOutput.push(value) },
        },
      ),
      0,
    );
    assert.equal(
      await runPublicationOperationsIntegrityCli(
        [
          "--data-dir", fixture.dataDirectory,
          "--checked-at", retailReleaseAt(3_706).toISOString(),
          "--strict-warnings",
        ],
        {
          environment: {},
          stdout: { write: () => true },
        },
      ),
      2,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("CLI writes aggregate-only integrity output and returns two for invalid state", async () => {
  const fixture = await createIntegrityFixture();
  try {
    const output = join(fixture.root, "integrity.json");
    assert.equal(
      await runPublicationOperationsIntegrityCli(
        [
          "--data-dir", fixture.dataDirectory,
          "--checked-at", retailReleaseAt(3_706).toISOString(),
          "--output", output,
        ],
        { environment: {}, stdout: { write: () => true } },
      ),
      0,
    );
    const serialised = await readFile(output, "utf8");
    for (const forbidden of [
      fixture.root,
      fixture.stateRoot,
      fixture.monitorId,
      fixture.alertId,
      fixture.evidenceId,
      "publication_integrity_observer_",
      "publication_integrity_verifier_",
      "publication_integrity_store_actor_001",
      "sourceReferenceHash",
      "requestFingerprint",
      "verificationFingerprint",
      "entityId",
      "actorId",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
    }

    await unlink(join(
      fixture.stateRoot,
      "entities",
      "audiobook-retail-publication-monitor",
      `${fixture.monitorId}.json`,
    ));
    assert.equal(
      await runPublicationOperationsIntegrityCli(
        [
          "--data-dir", fixture.dataDirectory,
          "--checked-at", retailReleaseAt(3_706).toISOString(),
        ],
        { environment: {}, stdout: { write: () => true } },
      ),
      2,
    );
  } finally {
    await fixture.cleanup();
  }
});
