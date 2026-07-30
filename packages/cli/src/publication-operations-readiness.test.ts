import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  createAudiobookRetailPublicationAlert,
} from "@evavo/storyteller-engine/audiobook-retail-publication-alert";
import {
  createAudiobookRetailPublicationEvidenceRequest,
  submitAudiobookRetailPublicationEvidence,
} from "@evavo/storyteller-engine/audiobook-retail-publication-evidence-inbox";
import {
  createAudiobookRetailPublicationMonitor,
  recordAudiobookRetailPublicationRefresh,
  type AudiobookRetailPublicationMonitor,
} from "@evavo/storyteller-engine/audiobook-retail-publication-monitor";
import {
  createAudiobookRetailPublicListingObservation,
  verifyAudiobookRetailPublication,
  type AudiobookRetailPublicationVerification,
} from "@evavo/storyteller-engine/audiobook-retail-publication-verification";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";
import { stableHash } from "@evavo/storyteller-engine";
import { retailPublicationVerificationFixture } from "../../storyteller/src/test-support/retail-publication-verification-fixture.js";
import {
  inspectPublicationOperationsReadiness,
} from "./publication-operations-readiness.js";
import {
  runPublicationOperationsReadinessCli,
} from "./publication-operations-readiness-main.js";

const baseMs = Date.parse("2026-07-30T00:00:00.000Z");
const atMinute = (minute: number): Date => new Date(baseMs + minute * 60_000);
const recipientReferenceHash = stableHash({ route: "readiness-primary" });

function verification(input: Readonly<{
  suffix: string;
  observedMinute: number;
  degraded?: boolean;
}>): AudiobookRetailPublicationVerification {
  const fixture = retailPublicationVerificationFixture();
  const identity = fixture.listingIdentity;
  const regions = Object.freeze([
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
      purchaseAvailable: !input.degraded,
      sampleAvailable: true,
      samplePlaybackSuccessful: !input.degraded,
    }),
  ]);
  const observation = createAudiobookRetailPublicListingObservation({
    id: `readiness_observation_${input.suffix}`,
    projectId: identity.projectId,
    bookId: identity.bookId,
    audiobookAsin: "B0AUDIO001",
    publicProductReferenceHash: stableHash({ kind: "product", suffix: input.suffix }),
    sampleReferenceHash: stableHash({ kind: "sample", suffix: input.suffix }),
    coverReferenceHash: stableHash({ kind: "cover", suffix: input.suffix }),
    displayTitle: identity.metadata.displayTitle,
    authorCredit: identity.metadata.authorCredit,
    narratorCredit: identity.metadata.narratorCredit,
    publisherName: identity.metadata.publisherName,
    languageTag: identity.metadata.languageTag,
    description: identity.metadata.description,
    coverIdentityMatched: true,
    ebookAsin: identity.ebook.asin,
    ebookAssociationMatched: true,
    regions,
    observedByActorId: `readiness_observer_${input.suffix}`,
    humanObservationConfirmed: true,
    observedAt: atMinute(input.observedMinute).toISOString(),
    expiresAt: atMinute(input.observedMinute + 360).toISOString(),
    now: atMinute(input.observedMinute),
  });
  return verifyAudiobookRetailPublication({
    id: `readiness_verification_${input.suffix}`,
    sources: {
      listingIdentity: identity,
      retailerStatus: fixture.retailerStatus,
      observation,
    },
    requiredRegions: ["AU", "US"],
    verifiedByActorId: `readiness_verifier_${input.suffix}`,
    humanVerificationConfirmed: true,
    verifiedAt: atMinute(input.observedMinute + 1),
  });
}

function degradedMonitor(): AudiobookRetailPublicationMonitor {
  const initial = createAudiobookRetailPublicationMonitor({
    id: "readiness_monitor_001",
    verification: verification({ suffix: "initial", observedMinute: 10 }),
    refreshIntervalHours: 1,
    createdAt: atMinute(12),
  });
  return recordAudiobookRetailPublicationRefresh(
    initial,
    verification({ suffix: "degraded", observedMinute: 70, degraded: true }),
    atMinute(72),
  );
}

async function populateAttentionState(dataDirectory: string): Promise<void> {
  const stateRoot = resolve(dataDirectory, "publication-operations");
  const store = new FileProjectStore(stateRoot);
  const monitor = degradedMonitor();
  await store.create(
    "audiobook-retail-publication-monitor",
    monitor.id,
    monitor as unknown as Record<string, unknown>,
    new Date(monitor.createdAt),
  );
  const alert = createAudiobookRetailPublicationAlert({
    monitor,
    recipientReferenceHash,
    createdAt: atMinute(73),
  });
  await store.create(
    "audiobook-retail-publication-alert",
    alert.id,
    alert as unknown as Record<string, unknown>,
    new Date(alert.createdAt),
  );
  const request = createAudiobookRetailPublicationEvidenceRequest(
    monitor,
    atMinute(74),
  );
  const evidence = submitAudiobookRetailPublicationEvidence({
    request,
    verification: verification({ suffix: "recovery", observedMinute: 130 }),
    sourceReferenceHash: stableHash({ receipt: "readiness-recovery" }),
    receivedByActorId: "readiness_intake_operator_001",
    receivedAt: atMinute(132),
  });
  await store.create(
    "audiobook-retail-publication-evidence-inbox",
    evidence.id,
    evidence as unknown as Record<string, unknown>,
    new Date(evidence.receivedAt),
  );
  await store.appendAuditEvent({
    actorId: "readiness_audit_operator_001",
    action: "publication_operations.readiness_fixture",
    entityType: "audiobook-retail-publication-monitor",
    entityId: monitor.id,
    revision: monitor.revision,
    occurredAt: atMinute(133),
    metadata: { fixture: true },
  });
}

class CaptureOutput {
  value = "";
  write(value: string): void {
    this.value += value;
  }
}

test("empty publication state is infrastructure-ready without claiming operational health", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-readiness-empty-"));
  try {
    const result = await inspectPublicationOperationsReadiness({
      dataDirectory: root,
      checkedAt: atMinute(100),
    });
    assert.equal(result.status, "ready");
    assert.equal(result.operationalStatus, "empty");
    assert.equal(result.monitors.total, 0);
    assert.equal(result.evidenceInbox.total, 0);
    assert.equal(result.alerts.total, 0);
    assert.equal(result.store.auditPartitionCount, 0);
    assert.equal(JSON.stringify(result).includes(root), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readiness validates persisted entities and reports aggregate attention state", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-readiness-state-"));
  try {
    await populateAttentionState(root);
    const result = await inspectPublicationOperationsReadiness({
      dataDirectory: root,
      checkedAt: atMinute(140),
    });
    assert.equal(result.status, "ready");
    assert.equal(result.operationalStatus, "attention");
    assert.deepEqual(result.monitors.health, {
      "healthy-live": 0,
      degraded: 1,
      unavailable: 0,
      mismatch: 0,
      stale: 0,
    });
    assert.equal(result.monitors.due, 1);
    assert.equal(result.evidenceInbox.available, 1);
    assert.equal(result.evidenceInbox.expiredAvailable, 0);
    assert.equal(result.alerts.open, 1);
    assert.equal(result.alerts.deliveryPending, 1);
    assert.equal(result.store.auditPartitionCount, 1);
    assert.equal(result.store.auditEventCount, 1);
    assert.equal(JSON.stringify(result).includes("readiness_monitor_001"), false);
    assert.equal(JSON.stringify(result).includes(recipientReferenceHash), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("corrupt persisted entities fail readiness with a safe code", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-readiness-corrupt-"));
  try {
    const directory = join(
      root,
      "publication-operations",
      "entities",
      "audiobook-retail-publication-monitor",
    );
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "corrupt.json"), "{not-json", "utf8");
    await assert.rejects(
      inspectPublicationOperationsReadiness({
        dataDirectory: root,
        checkedAt: atMinute(100),
      }),
      /PUBLICATION_OPERATIONS_READINESS_STORE_INVALID/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("symbolic links inside publication state are rejected", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-readiness-link-"));
  try {
    const stateRoot = join(root, "publication-operations");
    const store = new FileProjectStore(stateRoot);
    await store.initialise();
    const target = join(root, "outside.txt");
    await writeFile(target, "private", "utf8");
    try {
      await symlink(target, join(stateRoot, "unsafe-link"));
    } catch (error) {
      context.skip(`symbolic links unavailable: ${String(error)}`);
      return;
    }
    await assert.rejects(
      inspectPublicationOperationsReadiness({
        dataDirectory: root,
        checkedAt: atMinute(100),
      }),
      /PUBLICATION_OPERATIONS_READINESS_SYMBOLIC_LINK_REJECTED/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readiness CLI emits a redacted readiness-only result and safe failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-readiness-cli-"));
  try {
    await populateAttentionState(root);
    const stdout = new CaptureOutput();
    const stderr = new CaptureOutput();
    const exitCode = await runPublicationOperationsReadinessCli([
      "--data-dir", root,
      "--checked-at", atMinute(140).toISOString(),
      "--readiness-only",
    ], { stdout, stderr });
    assert.equal(exitCode, 0);
    assert.equal(stderr.value, "");
    const parsed = JSON.parse(stdout.value) as Record<string, unknown>;
    assert.equal(parsed.status, "ready");
    assert.equal(parsed.operationalStatus, "attention");
    assert.equal("monitors" in parsed, false);
    assert.equal(stdout.value.includes(root), false);

    const failed = new CaptureOutput();
    const failedExit = await runPublicationOperationsReadinessCli(
      ["--data-dir", ""],
      { stdout: new CaptureOutput(), stderr: failed },
    );
    assert.equal(failedExit, 1);
    assert.equal(failed.value.includes("status"), true);
    assert.equal(failed.value.includes(root), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
