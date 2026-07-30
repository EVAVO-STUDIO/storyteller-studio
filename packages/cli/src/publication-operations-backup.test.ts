import assert from "node:assert/strict";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";
import {
  createPublicationOperationsBackup,
  restorePublicationOperationsBackup,
  verifyPublicationOperationsBackupSnapshot,
  type PublicationOperationsBackupManifest,
} from "./publication-operations-backup.js";
import { runPublicationOperationsBackupCli } from "./publication-operations-backup-main.js";

const createdAt = new Date("2026-07-30T00:00:00.000Z");
const restoredAt = new Date("2026-07-30T01:00:00.000Z");
const applicationRevision = "1".repeat(40);
const compatibleApplicationRevision = "2".repeat(40);

async function createPublicationState(dataDirectory: string): Promise<Readonly<{
  root: string;
  state: FileProjectStore;
}>> {
  const root = join(dataDirectory, "publication-operations");
  const state = new FileProjectStore(root);
  await state.create(
    "audiobook-retail-publication-monitor",
    "publication_backup_monitor_001",
    {
      id: "publication_backup_monitor_001",
      status: "healthy-live",
      revision: 2,
      fingerprint: "a".repeat(64),
    },
    new Date("2026-07-29T22:00:00.000Z"),
  );
  await state.create(
    "audiobook-retail-publication-alert",
    "publication_backup_alert_001",
    {
      id: "publication_backup_alert_001",
      status: "resolved",
      revision: 3,
      fingerprint: "b".repeat(64),
    },
    new Date("2026-07-29T22:00:01.000Z"),
  );
  await state.appendAuditEvent({
    actorId: "publication_backup_fixture_actor_001",
    action: "publication_backup.fixture_created",
    entityType: "audiobook-retail-publication-monitor",
    entityId: "publication_backup_monitor_001",
    revision: 1,
    occurredAt: new Date("2026-07-29T22:00:02.000Z"),
    metadata: {
      fixture: true,
      recordCount: 2,
    },
  });
  return Object.freeze({ root, state });
}

async function snapshotManifest(
  snapshotDirectory: string,
): Promise<PublicationOperationsBackupManifest> {
  return JSON.parse(
    await readFile(join(snapshotDirectory, "manifest.json"), "utf8"),
  ) as PublicationOperationsBackupManifest;
}

async function withDirectories(
  run: (paths: Readonly<{
    root: string;
    data: string;
    backups: string;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-publication-backup-"));
  try {
    const data = join(root, "data");
    const backups = join(root, "backups");
    await mkdir(data, { recursive: true, mode: 0o700 });
    await run({ root, data, backups });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("offline backup creates one verified immutable snapshot and repeats idempotently", async () => {
  await withDirectories(async ({ data, backups }) => {
    await createPublicationState(data);
    const first = await createPublicationOperationsBackup({
      dataDirectory: data,
      backupDirectory: backups,
      actorId: "publication_backup_operator_001",
      offlineConfirmed: true,
      applicationRevision,
      createdAt,
    });
    assert.equal(first.status, "created");
    assert.equal(first.fileCount, 3);
    assert.equal(first.totalBytes > 0, true);
    assert.equal(first.compatibilityBound, true);
    assert.match(first.snapshotId, /^publication_backup_[a-f0-9]{24}$/u);

    const snapshot = join(backups, first.snapshotId);
    const verified = await verifyPublicationOperationsBackupSnapshot(snapshot);
    assert.equal(verified.status, "verified");
    assert.equal(verified.fingerprint, first.fingerprint);
    assert.equal(verified.fileCount, first.fileCount);
    assert.equal(verified.totalBytes, first.totalBytes);
    assert.equal(verified.compatibilityBound, true);

    const manifest = await snapshotManifest(snapshot);
    assert.equal(manifest.createdByActorId, "publication_backup_operator_001");
    assert.equal(manifest.compatibility.applicationRevision, applicationRevision);
    assert.deepEqual(
      manifest.files.map((file) => file.mode),
      Array.from({ length: manifest.fileCount }, () => 0o600),
    );

    const second = await createPublicationOperationsBackup({
      dataDirectory: data,
      backupDirectory: backups,
      actorId: "publication_backup_operator_001",
      offlineConfirmed: true,
      applicationRevision,
      createdAt,
    });
    assert.equal(second.status, "existing");
    assert.deepEqual(second, { ...first, status: "existing" });
    assert.deepEqual(await readdir(backups), [first.snapshotId]);
  });
});

test("snapshot verification rejects altered bytes and unexpected extra files", async () => {
  await withDirectories(async ({ data, backups }) => {
    await createPublicationState(data);
    const first = await createPublicationOperationsBackup({
      dataDirectory: data,
      backupDirectory: backups,
      actorId: "publication_backup_operator_tamper_001",
      offlineConfirmed: true,
      applicationRevision,
      createdAt,
    });
    const snapshot = join(backups, first.snapshotId);
    const manifest = await snapshotManifest(snapshot);
    const firstFile = manifest.files[0]!;
    await writeFile(
      join(snapshot, "data", firstFile.relativePath),
      "tampered\n",
      { encoding: "utf8", mode: 0o600 },
    );
    await assert.rejects(
      verifyPublicationOperationsBackupSnapshot(snapshot),
      /PUBLICATION_OPERATIONS_BACKUP_CONTENT_MISMATCH/u,
    );
  });

  await withDirectories(async ({ data, backups }) => {
    await createPublicationState(data);
    const first = await createPublicationOperationsBackup({
      dataDirectory: data,
      backupDirectory: backups,
      actorId: "publication_backup_operator_extra_001",
      offlineConfirmed: true,
      applicationRevision,
      createdAt,
    });
    const snapshot = join(backups, first.snapshotId);
    await writeFile(
      join(snapshot, "data", "unexpected.json"),
      "{}\n",
      { encoding: "utf8", mode: 0o600 },
    );
    await assert.rejects(
      verifyPublicationOperationsBackupSnapshot(snapshot),
      /PUBLICATION_OPERATIONS_BACKUP_CONTENT_MISMATCH/u,
    );
  });
});

test("backup rejects active locks, temporary files and symbolic links", async () => {
  await withDirectories(async ({ data, backups }) => {
    const fixture = await createPublicationState(data);
    const lock = join(fixture.root, "active.json.lock");
    await writeFile(lock, "locked\n", { encoding: "utf8", mode: 0o600 });
    await assert.rejects(
      createPublicationOperationsBackup({
        dataDirectory: data,
        backupDirectory: backups,
        actorId: "publication_backup_operator_busy_001",
        offlineConfirmed: true,
        applicationRevision,
        createdAt,
      }),
      /PUBLICATION_OPERATIONS_BACKUP_STATE_BUSY/u,
    );
    await rm(lock);

    const temporary = join(fixture.root, "partial-write.tmp");
    await writeFile(temporary, "partial\n", {
      encoding: "utf8",
      mode: 0o600,
    });
    await assert.rejects(
      createPublicationOperationsBackup({
        dataDirectory: data,
        backupDirectory: backups,
        actorId: "publication_backup_operator_busy_001",
        offlineConfirmed: true,
        applicationRevision,
        createdAt,
      }),
      /PUBLICATION_OPERATIONS_BACKUP_STATE_BUSY/u,
    );
    await rm(temporary);

    const target = join(
      fixture.root,
      "entities",
      "audiobook-retail-publication-monitor",
      "publication_backup_monitor_001.json",
    );
    const link = join(fixture.root, "linked-monitor.json");
    await symlink(target, link);
    await assert.rejects(
      createPublicationOperationsBackup({
        dataDirectory: data,
        backupDirectory: backups,
        actorId: "publication_backup_operator_symlink_001",
        offlineConfirmed: true,
        applicationRevision,
        createdAt,
      }),
      /PUBLICATION_OPERATIONS_BACKUP_SYMLINK_FORBIDDEN/u,
    );
  });
});

test("backup detects publication state mutation during the copy window and removes staging state", async () => {
  await withDirectories(async ({ data, backups }) => {
    const fixture = await createPublicationState(data);
    await assert.rejects(
      createPublicationOperationsBackup({
        dataDirectory: data,
        backupDirectory: backups,
        actorId: "publication_backup_operator_mutation_001",
        offlineConfirmed: true,
        applicationRevision,
        createdAt,
        afterCopy: async () => {
          await fixture.state.create(
            "audiobook-retail-publication-alert",
            "publication_backup_alert_late_001",
            {
              id: "publication_backup_alert_late_001",
              status: "open",
              revision: 1,
              fingerprint: "c".repeat(64),
            },
            new Date("2026-07-30T00:00:01.000Z"),
          );
        },
      }),
      /PUBLICATION_OPERATIONS_BACKUP_SOURCE_CHANGED/u,
    );
    assert.deepEqual(await readdir(backups), []);
  });
});

test("verified snapshot restores into new state and refuses to overwrite live state", async () => {
  await withDirectories(async ({ root, data, backups }) => {
    await createPublicationState(data);
    const backup = await createPublicationOperationsBackup({
      dataDirectory: data,
      backupDirectory: backups,
      actorId: "publication_backup_operator_restore_001",
      offlineConfirmed: true,
      applicationRevision,
      createdAt,
    });
    const snapshot = join(backups, backup.snapshotId);
    const restoredData = join(root, "restored-data");
    const restored = await restorePublicationOperationsBackup({
      snapshotDirectory: snapshot,
      dataDirectory: restoredData,
      actorId: "publication_restore_operator_001",
      offlineConfirmed: true,
      applicationRevision,
      restoredAt,
    });
    assert.equal(restored.status, "restored");
    assert.equal(restored.snapshotId, backup.snapshotId);
    assert.equal(restored.fingerprint, backup.fingerprint);
    assert.equal(restored.applicationCompatibility, "exact-revision");

    const restoredState = new FileProjectStore(
      join(restoredData, "publication-operations"),
    );
    const monitor = await restoredState.read<Record<string, unknown>>(
      "audiobook-retail-publication-monitor",
      "publication_backup_monitor_001",
    );
    assert.equal(monitor?.payload.status, "healthy-live");
    assert.equal(
      (
        await readFile(
          join(
            restoredData,
            "publication-operations",
            "audit",
            "2026-07-29.jsonl",
          ),
          "utf8",
        )
      ).includes("publication_backup.fixture_created"),
      true,
    );

    await assert.rejects(
      restorePublicationOperationsBackup({
        snapshotDirectory: snapshot,
        dataDirectory: restoredData,
        actorId: "publication_restore_operator_001",
        offlineConfirmed: true,
        applicationRevision,
        restoredAt,
      }),
      /PUBLICATION_OPERATIONS_RESTORE_TARGET_NOT_EMPTY/u,
    );
  });
});


test("restore fails closed across revisions without approval and records a redacted governed override", async () => {
  await withDirectories(async ({ root, data, backups }) => {
    await createPublicationState(data);
    const backup = await createPublicationOperationsBackup({
      dataDirectory: data,
      backupDirectory: backups,
      actorId: "publication_backup_operator_compatibility_001",
      offlineConfirmed: true,
      applicationRevision,
      createdAt,
    });
    const snapshot = join(backups, backup.snapshotId);
    const restoredData = join(root, "compatible-restored-data");
    await assert.rejects(
      restorePublicationOperationsBackup({
        snapshotDirectory: snapshot,
        dataDirectory: restoredData,
        actorId: "publication_restore_operator_compatibility_001",
        offlineConfirmed: true,
        applicationRevision: compatibleApplicationRevision,
        restoredAt,
      }),
      /PUBLICATION_OPERATIONS_RESTORE_APPLICATION_REVISION_MISMATCH/u,
    );
    const restored = await restorePublicationOperationsBackup({
      snapshotDirectory: snapshot,
      dataDirectory: restoredData,
      actorId: "publication_restore_operator_compatibility_001",
      offlineConfirmed: true,
      applicationRevision: compatibleApplicationRevision,
      compatibilityApproval: {
        approvedByActorId: "publication_compatibility_reviewer_001",
        evidenceReferenceHash: "d".repeat(64),
        approvedAt: new Date("2026-07-30T00:30:00.000Z"),
      },
      restoredAt,
    });
    assert.equal(
      restored.applicationCompatibility,
      "approved-compatible-revision",
    );
    assert.match(
      restored.compatibilityApprovalFingerprint ?? "",
      /^[a-f0-9]{64}$/u,
    );
    const serialised = JSON.stringify(restored);
    for (const forbidden of [
      applicationRevision,
      compatibleApplicationRevision,
      "publication_compatibility_reviewer_001",
      "d".repeat(64),
    ]) {
      assert.equal(serialised.includes(forbidden), false);
    }
  });
});

test("backup and restore require explicit offline confirmation and reject nested paths", async () => {
  await withDirectories(async ({ data, backups }) => {
    await createPublicationState(data);
    await assert.rejects(
      createPublicationOperationsBackup({
        dataDirectory: data,
        backupDirectory: backups,
        actorId: "publication_backup_operator_offline_001",
        offlineConfirmed: false as true,
        applicationRevision,
        createdAt,
      }),
      /PUBLICATION_OPERATIONS_BACKUP_OFFLINE_CONFIRMATION_REQUIRED/u,
    );
    await assert.rejects(
      createPublicationOperationsBackup({
        dataDirectory: data,
        backupDirectory: join(data, "publication-operations", "backups"),
        actorId: "publication_backup_operator_nested_001",
        offlineConfirmed: true,
        applicationRevision,
        createdAt,
      }),
      /PUBLICATION_OPERATIONS_BACKUP_PATH_NESTING_FORBIDDEN/u,
    );
  });
});

test("standalone CLI emits redacted backup, verify and restore results", async () => {
  await withDirectories(async ({ root, data, backups }) => {
    await createPublicationState(data);
    const backupOutput = join(root, "backup-result.json");
    const stdout: string[] = [];
    assert.equal(
      await runPublicationOperationsBackupCli(
        [
          "backup",
          "--data-dir", data,
          "--backup-dir", backups,
          "--actor-id", "publication_backup_cli_operator_001",
          "--offline-confirmed",
          "--created-at", createdAt.toISOString(),
          "--output", backupOutput,
        ],
        {
          environment: { STORYTELLER_APPLICATION_REVISION: applicationRevision },
          stdout: { write: (value) => stdout.push(String(value)) },
        },
      ),
      0,
    );
    const backupResult = JSON.parse(
      await readFile(backupOutput, "utf8"),
    ) as Record<string, unknown>;
    const snapshot = join(backups, String(backupResult.snapshotId));
    const verifyOutput = join(root, "verify-result.json");
    assert.equal(
      await runPublicationOperationsBackupCli(
        [
          "verify",
          "--snapshot", snapshot,
          "--output", verifyOutput,
        ],
        { environment: { STORYTELLER_APPLICATION_REVISION: applicationRevision }, stdout: { write: () => true } },
      ),
      0,
    );
    const restoredData = join(root, "cli-restored");
    const restoreOutput = join(root, "restore-result.json");
    assert.equal(
      await runPublicationOperationsBackupCli(
        [
          "restore",
          "--snapshot", snapshot,
          "--data-dir", restoredData,
          "--actor-id", "publication_restore_cli_operator_001",
          "--offline-confirmed",
          "--restored-at", restoredAt.toISOString(),
          "--output", restoreOutput,
        ],
        { environment: { STORYTELLER_APPLICATION_REVISION: applicationRevision }, stdout: { write: () => true } },
      ),
      0,
    );

    for (const path of [backupOutput, verifyOutput, restoreOutput]) {
      await chmod(path, 0o600);
      const serialised = await readFile(path, "utf8");
      for (const forbidden of [
        data,
        backups,
        snapshot,
        restoredData,
        "publication_backup_cli_operator_001",
        "publication_restore_cli_operator_001",
        "createdByActorId",
        "sourceFingerprint",
        applicationRevision,
        "applicationRevision",
        "durableSchemaFingerprint",
        "relativePath",
        "contentHash",
      ]) {
        assert.equal(serialised.includes(forbidden), false);
      }
    }
  });
});
