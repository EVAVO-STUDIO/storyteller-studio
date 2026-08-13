import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import { stableHash } from "./index.js";
import {
  applyAdmittedNarratorRetailPublicationEvidence,
  markAdmittedNarratorRetailPublicationEvidenceStale,
  createAdmittedNarratorRetailPublicationEvidenceRequest,
  submitAdmittedNarratorRetailPublicationEvidence,
  type AdmittedNarratorRetailPublicationOperation,
} from "./narrator-retail-publication-operations-admission.js";
import {
  ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_ENTITY_TYPE,
  FileAdmittedNarratorRetailPublicationOperationsStore,
  admittedNarratorRetailPublicationOperationIntentPublicView,
  assertAdmittedNarratorRetailPublicationOperationIntent,
} from "./narrator-retail-publication-operations-store.js";
import { FileProjectStore } from "./project-store.js";
import {
  createTestAdmittedNarratorRetailPublicationMonitorFixture,
  createTestAdmittedNarratorRetailRefreshVerification,
} from "../test-support/narrator-retail-publication-monitor-admission.js";

const sourceReferenceHash = stableHash({
  source: "private-human-governed-publication-evidence",
});
const primaryRecipientReferenceHash = stableHash({
  route: "admitted-narrator-publication-primary",
});
const secondaryRecipientReferenceHash = stableHash({
  route: "admitted-narrator-publication-secondary",
});

async function withStore(
  run: (fixture: Readonly<{
    state: FileProjectStore;
    store: FileAdmittedNarratorRetailPublicationOperationsStore;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(
    join(tmpdir(), "storyteller-admitted-publication-store-"),
  );
  try {
    const state = new FileProjectStore(root);
    const store = new FileAdmittedNarratorRetailPublicationOperationsStore(
      state,
    );
    await run({ state, store });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function staleOperation(
  monitor: Awaited<
    ReturnType<typeof createTestAdmittedNarratorRetailPublicationMonitorFixture>
  >["monitor"],
  recipientReferenceHash = primaryRecipientReferenceHash,
  occurredAt = "2026-08-10T13:29:00.000Z",
): AdmittedNarratorRetailPublicationOperation {
  return markAdmittedNarratorRetailPublicationEvidenceStale({
    monitor,
    recipientReferenceHash,
    occurredAt: new Date(occurredAt),
  });
}

async function driftOperation(input: Readonly<{
  suffix: string;
  projectId: string;
  bookId: string;
  narratorCredit?: string;
}>): Promise<Readonly<{
  fixture: Awaited<
    ReturnType<typeof createTestAdmittedNarratorRetailPublicationMonitorFixture>
  >;
  operation: AdmittedNarratorRetailPublicationOperation;
}>> {
  const fixture = await createTestAdmittedNarratorRetailPublicationMonitorFixture({
    mode: "adapted",
    projectId: input.projectId,
    bookId: input.bookId,
  });
  const request = createAdmittedNarratorRetailPublicationEvidenceRequest(
    fixture.monitor,
    new Date("2026-08-10T13:28:00.000Z"),
  );
  const verification = createTestAdmittedNarratorRetailRefreshVerification({
    publication: fixture.publication,
    suffix: input.suffix,
    observedAt: "2026-08-10T13:30:00.000Z",
    verifiedAt: "2026-08-10T13:31:00.000Z",
    observation: {
      narratorCredit: input.narratorCredit ?? "Replacement Public Narrator",
    },
  });
  const evidence = submitAdmittedNarratorRetailPublicationEvidence({
    request,
    verification,
    sourceReferenceHash,
    receivedByActorId: `admitted-publication-evidence-${input.suffix}`,
    receivedAt: new Date("2026-08-10T13:31:30.000Z"),
  });
  const operation = applyAdmittedNarratorRetailPublicationEvidence({
    evidence,
    actorId: `admitted-publication-refresh-${input.suffix}`,
    recipientReferenceHash: primaryRecipientReferenceHash,
    occurredAt: new Date("2026-08-10T13:32:00.000Z"),
  });
  return Object.freeze({ fixture, operation });
}

test("genesis admitted narrator monitor persistence is private, idempotent and revision aligned", async () => {
  const fixture = await createTestAdmittedNarratorRetailPublicationMonitorFixture({
    mode: "adapted",
    projectId: "project_admitted_publication_store_genesis_001",
    bookId: "book_admitted_publication_store_genesis_001",
  });
  const replacement = await createTestAdmittedNarratorRetailPublicationMonitorFixture({
    mode: "zero-shot",
    projectId: "project_admitted_publication_store_genesis_001",
    bookId: "book_admitted_publication_store_genesis_001",
  });
  await withStore(async ({ store }) => {
    const created = await store.createMonitor(
      fixture.monitor,
      "admitted-publication-store-genesis-001",
    );
    assert.equal(created.revision, 1);
    assert.equal(created.payload.monitor.revision, 1);
    assert.equal(created.payload.fingerprint, fixture.monitor.fingerprint);
    const repeated = await store.createMonitor(
      fixture.monitor,
      "admitted-publication-store-genesis-retry-001",
    );
    assert.equal(repeated.envelopeHash, created.envelopeHash);
    await assert.rejects(
      store.createMonitor(
        replacement.monitor,
        "admitted-publication-store-genesis-conflict-001",
      ),
      /ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_STORE_IDEMPOTENCY_CONFLICT/u,
    );
  });
});

test("prepared stale operation reserves write-ahead intent without mutating the current monitor", async () => {
  const fixture = await createTestAdmittedNarratorRetailPublicationMonitorFixture({
    mode: "adapted",
    projectId: "project_admitted_publication_store_prepare_001",
    bookId: "book_admitted_publication_store_prepare_001",
  });
  const operation = staleOperation(fixture.monitor);
  await withStore(async ({ store }) => {
    await store.createMonitor(
      fixture.monitor,
      "admitted-publication-store-prepare-genesis-001",
    );
    const prepared = await store.prepareOperation(operation, {
      actorId: "admitted-publication-store-preparer-001",
      preparedAt: new Date("2026-08-10T13:29:10.000Z"),
    });
    assert.equal(prepared.revision, 1);
    assert.equal(prepared.payload.status, "prepared");
    assert.equal(prepared.payload.writeAheadReserved, true);
    assert.equal(prepared.payload.monitorMutationCommitted, false);
    assert.equal(prepared.payload.expectedMonitorRevision, 1);
    assert.equal(prepared.payload.targetMonitorRevision, 2);
    const current = await store.requireMonitor(fixture.monitor.monitor.id);
    assert.equal(current.revision, 1);
    assert.equal(current.payload.currentHealth, "healthy-live");
    const inspection = await store.inspectIntent(
      prepared.payload.id,
      new Date("2026-08-10T13:29:11.000Z"),
    );
    assert.equal(inspection.state, "ready");
    const repeated = await store.prepareOperation(operation, {
      actorId: "admitted-publication-store-preparer-retry-001",
      preparedAt: new Date("2026-08-10T13:29:12.000Z"),
    });
    assert.equal(repeated.envelopeHash, prepared.envelopeHash);
    assert.deepEqual(
      await store.listPreparedIntentIds(),
      [prepared.payload.id],
    );
  });
});

test("committing a prepared operation advances the monitor and intent exactly once", async () => {
  const fixture = await createTestAdmittedNarratorRetailPublicationMonitorFixture({
    mode: "adapted",
    projectId: "project_admitted_publication_store_commit_001",
    bookId: "book_admitted_publication_store_commit_001",
  });
  const operation = staleOperation(fixture.monitor);
  await withStore(async ({ store }) => {
    await store.createMonitor(
      fixture.monitor,
      "admitted-publication-store-commit-genesis-001",
    );
    const prepared = await store.prepareOperation(operation, {
      actorId: "admitted-publication-store-commit-preparer-001",
      preparedAt: new Date("2026-08-10T13:29:10.000Z"),
    });
    const committed = await store.commitOperation(prepared.payload.id, {
      actorId: "admitted-publication-store-committer-001",
      committedAt: new Date("2026-08-10T13:29:20.000Z"),
    });
    assert.equal(committed.recoveredPreparedIntent, false);
    assert.equal(committed.intent.revision, 2);
    assert.equal(committed.intent.payload.status, "committed");
    assert.equal(committed.intent.payload.monitorMutationCommitted, true);
    assert.equal(committed.monitor.revision, 2);
    assert.equal(committed.monitor.payload.currentHealth, "stale");
    assert.equal(
      committed.monitor.payload.monitor.previousFingerprint,
      fixture.monitor.monitor.fingerprint,
    );
    const repeated = await store.commitOperation(prepared.payload.id, {
      actorId: "admitted-publication-store-committer-retry-001",
      committedAt: new Date("2026-08-10T13:29:30.000Z"),
    });
    assert.equal(repeated.intent.envelopeHash, committed.intent.envelopeHash);
    assert.equal(repeated.monitor.envelopeHash, committed.monitor.envelopeHash);
    assert.equal(
      (await store.inspectIntent(prepared.payload.id)).state,
      "committed",
    );
    assert.deepEqual(await store.listPreparedIntentIds(), []);
  });
});

test("competing prepared operations cannot fork one admitted narrator monitor head", async () => {
  const fixture = await createTestAdmittedNarratorRetailPublicationMonitorFixture({
    mode: "adapted",
    projectId: "project_admitted_publication_store_competing_001",
    bookId: "book_admitted_publication_store_competing_001",
  });
  const primary = staleOperation(
    fixture.monitor,
    primaryRecipientReferenceHash,
  );
  const secondary = staleOperation(
    fixture.monitor,
    secondaryRecipientReferenceHash,
  );
  assert.notEqual(primary.fingerprint, secondary.fingerprint);
  await withStore(async ({ store }) => {
    await store.createMonitor(
      fixture.monitor,
      "admitted-publication-store-competing-genesis-001",
    );
    const first = await store.prepareOperation(primary, {
      actorId: "admitted-publication-store-competing-preparer-a-001",
      preparedAt: new Date("2026-08-10T13:29:10.000Z"),
    });
    const second = await store.prepareOperation(secondary, {
      actorId: "admitted-publication-store-competing-preparer-b-001",
      preparedAt: new Date("2026-08-10T13:29:11.000Z"),
    });
    await store.commitOperation(first.payload.id, {
      actorId: "admitted-publication-store-competing-committer-a-001",
      committedAt: new Date("2026-08-10T13:29:20.000Z"),
    });
    assert.equal(
      (await store.inspectIntent(second.payload.id)).state,
      "conflict",
    );
    await assert.rejects(
      store.commitOperation(second.payload.id, {
        actorId: "admitted-publication-store-competing-committer-b-001",
        committedAt: new Date("2026-08-10T13:29:21.000Z"),
      }),
      /ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_CURRENT_MONITOR_CONFLICT/u,
    );
    const current = await store.requireMonitor(fixture.monitor.monitor.id);
    assert.equal(current.revision, 2);
    assert.equal(current.payload.fingerprint, primary.monitor.fingerprint);
  });
});

test("a prepared intent recovers after monitor mutation but before intent finalisation", async () => {
  const fixture = await createTestAdmittedNarratorRetailPublicationMonitorFixture({
    mode: "adapted",
    projectId: "project_admitted_publication_store_recovery_001",
    bookId: "book_admitted_publication_store_recovery_001",
  });
  const operation = staleOperation(fixture.monitor);
  await withStore(async ({ state, store }) => {
    await store.createMonitor(
      fixture.monitor,
      "admitted-publication-store-recovery-genesis-001",
    );
    const prepared = await store.prepareOperation(operation, {
      actorId: "admitted-publication-store-recovery-preparer-001",
      preparedAt: new Date("2026-08-10T13:29:10.000Z"),
    });
    await state.replace(
      ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_ENTITY_TYPE as never,
      fixture.monitor.monitor.id,
      1,
      operation.monitor as unknown as Record<string, unknown>,
      new Date("2026-08-10T13:29:15.000Z"),
    );
    assert.equal(
      (await store.inspectIntent(prepared.payload.id)).state,
      "monitor-applied-intent-pending",
    );
    const committed = await store.commitOperation(prepared.payload.id, {
      actorId: "admitted-publication-store-recovery-committer-001",
      committedAt: new Date("2026-08-10T13:29:20.000Z"),
    });
    assert.equal(committed.recoveredPreparedIntent, true);
    assert.equal(committed.monitor.revision, 2);
    assert.equal(committed.intent.revision, 2);
    assert.equal(committed.intent.payload.status, "committed");
    assert.equal(
      (await store.inspectIntent(prepared.payload.id)).state,
      "committed",
    );
  });
});

test("full admission-bound refresh evidence persists through the write-ahead chain", async () => {
  const { fixture, operation } = await driftOperation({
    suffix: "store-full-evidence-001",
    projectId: "project_admitted_publication_store_evidence_001",
    bookId: "book_admitted_publication_store_evidence_001",
  });
  assert.equal(operation.kind, "evidence-refresh");
  assert.equal(operation.monitor.currentHealth, "mismatch");
  assert.equal(operation.incident?.alert.category, "identity-mismatch");
  await withStore(async ({ store }) => {
    await store.createMonitor(
      fixture.monitor,
      "admitted-publication-store-evidence-genesis-001",
    );
    const prepared = await store.prepareOperation(operation, {
      actorId: "admitted-publication-store-evidence-preparer-001",
      preparedAt: new Date("2026-08-10T13:32:10.000Z"),
    });
    const committed = await store.commitOperation(prepared.payload.id, {
      actorId: "admitted-publication-store-evidence-committer-001",
      committedAt: new Date("2026-08-10T13:32:20.000Z"),
    });
    assert.equal(committed.monitor.payload.currentHealth, "mismatch");
    assert.equal(committed.intent.payload.operation.evidenceAcknowledged, true);
    assert.equal(committed.intent.payload.operation.incidentCreated, true);
    assert.equal(
      committed.intent.payload.operation.acknowledgedEvidence?.status,
      "acknowledged",
    );
    assert.equal(
      committed.intent.payload.operation.incident?.alert.category,
      "identity-mismatch",
    );
  });
});

test("rehashing an intent cannot change revision lineage or manufacture authority", async () => {
  const fixture = await createTestAdmittedNarratorRetailPublicationMonitorFixture({
    mode: "adapted",
    projectId: "project_admitted_publication_store_tamper_001",
    bookId: "book_admitted_publication_store_tamper_001",
  });
  const operation = staleOperation(fixture.monitor);
  await withStore(async ({ store }) => {
    await store.createMonitor(
      fixture.monitor,
      "admitted-publication-store-tamper-genesis-001",
    );
    const prepared = await store.prepareOperation(operation, {
      actorId: "admitted-publication-store-tamper-preparer-001",
      preparedAt: new Date("2026-08-10T13:29:10.000Z"),
    });
    const { fingerprint: _fingerprint, ...base } = prepared.payload;
    const wrongRevision = {
      ...base,
      targetMonitorRevision: 3,
    };
    assert.throws(
      () => assertAdmittedNarratorRetailPublicationOperationIntent({
        ...wrongRevision,
        fingerprint: stableHash(wrongRevision),
      }),
      /ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_LINEAGE_INVALID/u,
    );
    const escalated = {
      ...base,
      automaticRefreshAuthority: true as never,
      automaticRemediationAuthority: true as never,
      automaticRepublishAuthority: true as never,
      publicationAuthority: true as never,
    };
    assert.throws(
      () => assertAdmittedNarratorRetailPublicationOperationIntent({
        ...escalated,
        fingerprint: stableHash(escalated),
      }),
      /ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INTENT_AUTHORITY_INVALID/u,
    );
  });
});

test("public intent projection omits private narrator, actor, route and evidence identities", async () => {
  const { fixture, operation } = await driftOperation({
    suffix: "store-public-view-001",
    projectId: "project_admitted_publication_store_public_001",
    bookId: "book_admitted_publication_store_public_001",
  });
  await withStore(async ({ store }) => {
    await store.createMonitor(
      fixture.monitor,
      "admitted-publication-store-public-genesis-001",
    );
    const prepared = await store.prepareOperation(operation, {
      actorId: "admitted-publication-store-public-preparer-001",
      preparedAt: new Date("2026-08-10T13:32:10.000Z"),
    });
    const committed = await store.commitOperation(prepared.payload.id, {
      actorId: "admitted-publication-store-public-committer-001",
      committedAt: new Date("2026-08-10T13:32:20.000Z"),
    });
    const view = admittedNarratorRetailPublicationOperationIntentPublicView(
      committed.intent.payload,
    );
    assert.equal(view.audiobookAsin, "B0NARRAT01");
    assert.equal(view.narratorCredit, "EVAVO Narrator");
    assert.equal(view.operationKind, "evidence-refresh");
    assert.equal(view.intentStatus, "committed");
    assert.equal(view.monitorMutationCommitted, true);
    assert.equal(view.publicationAuthority, false);
    const json = JSON.stringify(view);
    const evidence = operation.evidence!;
    for (const forbidden of [
      fixture.monitor.projectId,
      fixture.monitor.monitor.id,
      fixture.monitor.monitor.fingerprint,
      fixture.monitor.profileAdmissionHash,
      fixture.monitor.admittedCastingFingerprint,
      fixture.monitor.castingFingerprint,
      fixture.monitor.voice.profileId,
      fixture.monitor.voice.profileHash,
      fixture.monitor.admittedListingFingerprint,
      prepared.payload.id,
      prepared.payload.preparedByActorId,
      committed.intent.payload.committedByActorId!,
      evidence.request.request.id,
      evidence.request.request.fingerprint,
      evidence.inboxItem.id,
      evidence.inboxItem.sourceReferenceHash,
      evidence.inboxItem.receivedByActorId,
      primaryRecipientReferenceHash,
    ]) assert.equal(json.includes(forbidden), false);
  });
});

test("storyteller package exports the private admitted publication operations store", async () => {
  const packageJson = JSON.parse(
    await readFile(
      resolve(process.cwd(), "packages", "storyteller", "package.json"),
      "utf8",
    ),
  ) as Readonly<{ exports?: Readonly<Record<string, string>> }>;
  assert.equal(
    packageJson.exports?.[
      "./narrator-retail-publication-operations-store"
    ],
    "./src/narrator-retail-publication-operations-store.ts",
  );
});

async function collectRuntimeFiles(
  root: string,
  output: string[] = [],
): Promise<string[]> {
  for (const name of await readdir(root)) {
    const path = join(root, name);
    const item = await stat(path);
    if (item.isDirectory()) {
      await collectRuntimeFiles(path, output);
    } else if (
      /\.(?:ts|tsx|js|mjs)$/u.test(name)
      && !/\.(?:test|spec)\.[^.]+$/u.test(name)
    ) {
      output.push(path);
    }
  }
  return output;
}

test("normal web and API runtimes cannot import private admitted publication persistence", async () => {
  const repositoryRoot = resolve(process.cwd());
  const runtimeFiles = [
    ...await collectRuntimeFiles(join(repositoryRoot, "apps", "api", "src")),
    ...await collectRuntimeFiles(join(repositoryRoot, "apps", "web", "src")),
  ];
  const forbidden = [
    "@evavo/storyteller-engine/narrator-retail-publication-operations-store",
    "FileAdmittedNarratorRetailPublicationOperationsStore",
    "prepareOperation(",
    "commitOperation(",
    ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_ENTITY_TYPE,
  ];
  for (const path of runtimeFiles) {
    const source = await readFile(path, "utf8");
    for (const token of forbidden) {
      assert.equal(
        source.includes(token),
        false,
        `${relative(repositoryRoot, path)} exposes private persistence token ${token}`,
      );
    }
  }
});
