import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_ENTITY_TYPE,
  FileAudiobookRetailPublicationEvidenceInboxStore,
} from "@evavo/storyteller-engine/audiobook-retail-publication-evidence-inbox";
import {
  FileAudiobookRetailPublicationMonitorStore,
  createAudiobookRetailPublicationMonitor,
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
import { parseArguments, run } from "./main.js";

function verification(
  suffix: string,
  observedSecond: number,
): AudiobookRetailPublicationVerification {
  const fixture = retailPublicationVerificationFixture();
  const identity = fixture.listingIdentity;
  const observation = createAudiobookRetailPublicListingObservation({
    id: `publication_evidence_cli_observation_${suffix}`,
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
    observedByActorId: `publication_evidence_cli_observer_${suffix}`,
    humanObservationConfirmed: true,
    observedAt: retailReleaseAt(observedSecond).toISOString(),
    expiresAt: retailReleaseAt(observedSecond + 7_200).toISOString(),
    now: retailReleaseAt(observedSecond),
  });
  return verifyAudiobookRetailPublication({
    id: `publication_evidence_cli_verification_${suffix}`,
    sources: {
      listingIdentity: identity,
      retailerStatus: fixture.retailerStatus,
      observation,
    },
    requiredRegions: ["AU", "US"],
    verifiedByActorId: `publication_evidence_cli_verifier_${suffix}`,
    humanVerificationConfirmed: true,
    verifiedAt: retailReleaseAt(observedSecond + 1),
  });
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

test("publication evidence CLI admits one exact verification idempotently and emits only the redacted view", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-publication-evidence-cli-"));
  try {
    const state = new FileProjectStore(join(root, "publication-operations"));
    const monitors = new FileAudiobookRetailPublicationMonitorStore(state);
    const initial = verification("initial", 30);
    const monitor = createAudiobookRetailPublicationMonitor({
      id: "publication_evidence_cli_monitor_001",
      verification: initial,
      refreshIntervalHours: 1,
      createdAt: retailReleaseAt(32),
    });
    await monitors.create(monitor, "publication_evidence_cli_fixture_store_001");

    const later = verification("later", 3_700);
    const verificationPath = join(root, "verification.json");
    const firstOutput = join(root, "first.json");
    const secondOutput = join(root, "second.json");
    const sourceReferenceHash = stableHash({
      source: "governed-publication-verification-envelope",
      suffix: "later",
    });
    await writeFile(
      verificationPath,
      `${JSON.stringify(later, null, 2)}\n`,
      "utf8",
    );

    const common = [
      "publication-evidence-submit",
      "--data-dir", root,
      "--monitor-id", monitor.id,
      "--verification", verificationPath,
      "--source-reference-hash", sourceReferenceHash,
      "--actor-id", "publication_evidence_cli_operator_001",
      "--received-at", retailReleaseAt(3_702).toISOString(),
    ];
    assert.equal(await run(parseArguments([
      ...common,
      "--output", firstOutput,
    ])), 0);
    const first = await readJson(firstOutput);
    assert.equal((first.meta as Record<string, unknown>).idempotent, false);
    assert.equal((first.meta as Record<string, unknown>).storeRevision, 1);
    const publicView = first.data as Record<string, unknown>;
    assert.equal(publicView.monitorId, monitor.id);
    assert.equal(publicView.status, "available");
    assert.equal(publicView.verificationStatus, "published-and-live");

    const serialised = JSON.stringify(first);
    for (const forbidden of [
      sourceReferenceHash,
      later.fingerprint,
      later.verifiedByActorId,
      later.observation.publicProductReferenceHash,
      "publication_evidence_cli_operator_001",
      verificationPath,
      join(root, "publication-operations"),
      "requestFingerprint",
      "sourceReferenceHash",
      "receivedByActorId",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
    }

    assert.equal(await run(parseArguments([
      ...common,
      "--output", secondOutput,
    ])), 0);
    const second = await readJson(secondOutput);
    assert.equal((second.meta as Record<string, unknown>).idempotent, true);
    assert.equal((second.meta as Record<string, unknown>).storeRevision, 1);

    const rows = await state.list(
      AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_ENTITY_TYPE,
    );
    assert.equal(rows.length, 1);
    const inbox = new FileAudiobookRetailPublicationEvidenceInboxStore(state);
    const stored = (await inbox.require(rows[0]!.entityId)).payload;
    assert.equal(stored.verification.fingerprint, later.fingerprint);
    assert.equal(stored.sourceReferenceHash, sourceReferenceHash);
    assert.equal(stored.receivedByActorId, "publication_evidence_cli_operator_001");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publication evidence CLI rejects invalid source provenance before persistence", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-publication-evidence-cli-invalid-"));
  try {
    const state = new FileProjectStore(join(root, "publication-operations"));
    const monitors = new FileAudiobookRetailPublicationMonitorStore(state);
    const initial = verification("invalid_initial", 30);
    const monitor = createAudiobookRetailPublicationMonitor({
      id: "publication_evidence_cli_monitor_invalid_001",
      verification: initial,
      refreshIntervalHours: 1,
      createdAt: retailReleaseAt(32),
    });
    await monitors.create(monitor, "publication_evidence_cli_fixture_store_002");
    const verificationPath = join(root, "verification.json");
    await writeFile(
      verificationPath,
      `${JSON.stringify(verification("invalid_later", 3_700), null, 2)}\n`,
      "utf8",
    );

    await assert.rejects(
      run(parseArguments([
        "publication-evidence-submit",
        "--data-dir", root,
        "--monitor-id", monitor.id,
        "--verification", verificationPath,
        "--source-reference-hash", "unsafe",
        "--actor-id", "publication_evidence_cli_operator_002",
        "--received-at", retailReleaseAt(3_702).toISOString(),
      ])),
      /AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_SOURCE_HASH_INVALID/u,
    );
    assert.equal(
      (await state.list(AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_ENTITY_TYPE))
        .length,
      0,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
