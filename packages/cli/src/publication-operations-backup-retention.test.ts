import assert from "node:assert/strict";
import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";
import {
  createPublicationOperationsBackup,
  verifyPublicationOperationsBackupSnapshot,
  type PublicationOperationsBackupResult,
} from "./publication-operations-backup.js";
import {
  planPublicationOperationsBackupRetention,
  prunePublicationOperationsBackups,
} from "./publication-operations-backup-retention.js";
import {
  runPublicationOperationsBackupRetentionCli,
} from "./publication-operations-backup-retention-main.js";

const applicationRevision = "1".repeat(40);
const evaluatedAt = new Date("2026-07-30T12:00:00.000Z");
const snapshotDates = Object.freeze([
  "2026-07-30T00:00:00.000Z",
  "2026-07-29T00:00:00.000Z",
  "2026-07-28T00:00:00.000Z",
  "2026-07-20T00:00:00.000Z",
  "2026-07-10T00:00:00.000Z",
  "2026-06-15T00:00:00.000Z",
  "2026-05-15T00:00:00.000Z",
]);

interface TestPaths {
  root: string;
  data: string;
  backups: string;
}

interface SnapshotFixture {
  createdAt: string;
  result: PublicationOperationsBackupResult;
}

async function withDirectories(
  run: (paths: TestPaths) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-backup-retention-"));
  try {
    const data = join(root, "data");
    const backups = join(root, "backups");
    await mkdir(data, { recursive: true, mode: 0o700 });
    await run({ root, data, backups });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function createPublicationState(dataDirectory: string): Promise<void> {
  const state = new FileProjectStore(join(dataDirectory, "publication-operations"));
  await state.create(
    "audiobook-retail-publication-monitor",
    "retention_monitor_001",
    {
      id: "retention_monitor_001",
      status: "healthy-live",
      revision: 1,
      fingerprint: "a".repeat(64),
    },
    new Date("2026-05-01T00:00:00.000Z"),
  );
  await state.appendAuditEvent({
    actorId: "retention_fixture_actor_001",
    action: "publication_retention.fixture_created",
    entityType: "audiobook-retail-publication-monitor",
    entityId: "retention_monitor_001",
    revision: 1,
    occurredAt: new Date("2026-05-01T00:00:01.000Z"),
    metadata: { fixture: true },
  });
}

async function createSnapshots(paths: TestPaths): Promise<readonly SnapshotFixture[]> {
  await createPublicationState(paths.data);
  const output: SnapshotFixture[] = [];
  for (const createdAt of snapshotDates) {
    const result = await createPublicationOperationsBackup({
      dataDirectory: paths.data,
      backupDirectory: paths.backups,
      actorId: "retention_backup_operator_001",
      offlineConfirmed: true,
      applicationRevision,
      createdAt: new Date(createdAt),
    });
    output.push({ createdAt, result });
  }
  return Object.freeze(output);
}

function fixtureByDate(
  fixtures: readonly SnapshotFixture[],
  createdAt: string,
): SnapshotFixture {
  const fixture = fixtures.find((candidate) => candidate.createdAt === createdAt);
  if (!fixture) throw new Error(`missing fixture ${createdAt}`);
  return fixture;
}

class CaptureOutput {
  value = "";
  write(value: string): void {
    this.value += value;
  }
}

test("retention planning verifies every snapshot and is deterministic without deleting", async () => {
  await withDirectories(async (paths) => {
    const snapshots = await createSnapshots(paths);
    const protectedId = fixtureByDate(
      snapshots,
      "2026-05-15T00:00:00.000Z",
    ).result.snapshotId;
    const input = {
      backupDirectory: paths.backups,
      keepLatest: 2,
      keepDailyDays: 0,
      keepWeeklyWeeks: 0,
      protectedSnapshotIds: [protectedId],
      evaluatedAt,
    } as const;
    const first = await planPublicationOperationsBackupRetention(input);
    const second = await planPublicationOperationsBackupRetention(input);

    assert.equal(first.status, "planned");
    assert.equal(first.snapshotCount, snapshotDates.length);
    assert.equal(first.retained.length, 3);
    assert.equal(first.delete.length, 4);
    assert.equal(first.fingerprint, second.fingerprint);
    assert.equal(first.reclaimableBytes > 0, true);
    assert.deepEqual(
      first.retained.find((snapshot) => snapshot.snapshotId === protectedId)?.reasons,
      ["protected"],
    );
    assert.equal((await readdir(paths.backups)).length, snapshotDates.length);
  });
});

test("daily and weekly buckets retain the newest verified snapshot in each UTC bucket", async () => {
  await withDirectories(async (paths) => {
    await createSnapshots(paths);
    const plan = await planPublicationOperationsBackupRetention({
      backupDirectory: paths.backups,
      keepLatest: 1,
      keepDailyDays: 3,
      keepWeeklyWeeks: 8,
      evaluatedAt,
    });
    assert.equal(
      plan.retained.some((snapshot) => snapshot.reasons.includes("daily")),
      true,
    );
    assert.equal(
      plan.retained.some((snapshot) => snapshot.reasons.includes("weekly")),
      true,
    );
    assert.equal(plan.retained.length < snapshotDates.length, true);
    assert.equal(
      new Set(plan.retained.map((snapshot) => snapshot.snapshotId)).size,
      plan.retained.length,
    );
  });
});

test("offline apply deletes only the exact verified plan and preserves retained snapshots", async () => {
  await withDirectories(async (paths) => {
    const snapshots = await createSnapshots(paths);
    const protectedId = fixtureByDate(
      snapshots,
      "2026-05-15T00:00:00.000Z",
    ).result.snapshotId;
    const common = {
      backupDirectory: paths.backups,
      keepLatest: 2,
      keepDailyDays: 0,
      keepWeeklyWeeks: 0,
      protectedSnapshotIds: [protectedId],
      evaluatedAt,
    } as const;
    const plan = await planPublicationOperationsBackupRetention(common);
    const result = await prunePublicationOperationsBackups({
      ...common,
      actorId: "retention_prune_operator_001",
      offlineConfirmed: true,
      expectedPlanFingerprint: plan.fingerprint,
      prunedAt: new Date("2026-07-30T12:05:00.000Z"),
    });

    assert.equal(result.status, "pruned");
    assert.equal(result.deletedCount, plan.delete.length);
    assert.equal(result.retainedCount, plan.retained.length);
    assert.equal(result.reclaimedBytes, plan.reclaimableBytes);
    assert.deepEqual(
      (await readdir(paths.backups)).sort(),
      plan.retained.map((snapshot) => snapshot.snapshotId).sort(),
    );
    for (const snapshot of plan.retained) {
      const verified = await verifyPublicationOperationsBackupSnapshot(
        join(paths.backups, snapshot.snapshotId),
      );
      assert.equal(verified.fingerprint, snapshot.fingerprint);
    }
    for (const snapshot of plan.delete) {
      await assert.rejects(
        lstat(join(paths.backups, snapshot.snapshotId)),
        (error: unknown) => Boolean(
          error
          && typeof error === "object"
          && "code" in error
          && error.code === "ENOENT"
        ),
      );
    }
  });
});

test("changed inventory invalidates a previously approved plan before deletion", async () => {
  await withDirectories(async (paths) => {
    await createSnapshots(paths);
    const common = {
      backupDirectory: paths.backups,
      keepLatest: 2,
      keepDailyDays: 0,
      keepWeeklyWeeks: 0,
      evaluatedAt,
    } as const;
    const plan = await planPublicationOperationsBackupRetention(common);
    await createPublicationOperationsBackup({
      dataDirectory: paths.data,
      backupDirectory: paths.backups,
      actorId: "retention_backup_operator_late_001",
      offlineConfirmed: true,
      applicationRevision,
      createdAt: new Date("2026-07-30T01:00:00.000Z"),
    });
    await assert.rejects(
      prunePublicationOperationsBackups({
        ...common,
        actorId: "retention_prune_operator_001",
        offlineConfirmed: true,
        expectedPlanFingerprint: plan.fingerprint,
        prunedAt: new Date("2026-07-30T12:05:00.000Z"),
      }),
      /PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_STALE/u,
    );
    assert.equal((await readdir(paths.backups)).length, snapshotDates.length + 1);
  });
});

test("retention rejects unknown root entries, staging state and symbolic links", async (context) => {
  await withDirectories(async (paths) => {
    await createSnapshots(paths);
    await writeFile(join(paths.backups, "notes.txt"), "unsafe\n", "utf8");
    await assert.rejects(
      planPublicationOperationsBackupRetention({
        backupDirectory: paths.backups,
        evaluatedAt,
      }),
      /PUBLICATION_OPERATIONS_BACKUP_RETENTION_ROOT_LAYOUT_INVALID/u,
    );
  });

  await withDirectories(async (paths) => {
    const snapshots = await createSnapshots(paths);
    await mkdir(join(paths.backups, ".partial.pruning"));
    await assert.rejects(
      planPublicationOperationsBackupRetention({
        backupDirectory: paths.backups,
        evaluatedAt,
      }),
      /PUBLICATION_OPERATIONS_BACKUP_RETENTION_DIRECTORY_BUSY/u,
    );
    await rm(join(paths.backups, ".partial.pruning"), { recursive: true });
    const target = join(paths.backups, snapshots[0]!.result.snapshotId);
    const link = join(paths.backups, "publication_backup_aaaaaaaaaaaaaaaaaaaaaaaa");
    try {
      await symlink(target, link);
    } catch (error) {
      context.skip(`symbolic links unavailable: ${String(error)}`);
      return;
    }
    await assert.rejects(
      planPublicationOperationsBackupRetention({
        backupDirectory: paths.backups,
        evaluatedAt,
      }),
      /PUBLICATION_OPERATIONS_BACKUP_RETENTION_SYMLINK_FORBIDDEN/u,
    );
  });
});

test("retention CLI requires a private apply receipt and writes mode-0600 evidence", async () => {
  await withDirectories(async (paths) => {
    await createSnapshots(paths);
    const planPath = join(paths.root, "retention-plan.json");
    const receiptPath = join(paths.root, "retention-receipt.json");
    const stdout = new CaptureOutput();
    const evaluated = evaluatedAt.toISOString();
    const planExit = await runPublicationOperationsBackupRetentionCli([
      "plan",
      "--backup-dir", paths.backups,
      "--evaluated-at", evaluated,
      "--keep-latest", "2",
      "--keep-daily-days", "0",
      "--keep-weekly-weeks", "0",
      "--output", planPath,
    ], { stdout });
    assert.equal(planExit, 0);
    const plan = JSON.parse(await readFile(planPath, "utf8")) as {
      fingerprint: string;
      delete: unknown[];
    };
    assert.equal(plan.delete.length > 0, true);

    await assert.rejects(
      runPublicationOperationsBackupRetentionCli([
        "apply",
        "--backup-dir", paths.backups,
        "--evaluated-at", evaluated,
        "--keep-latest", "2",
        "--keep-daily-days", "0",
        "--keep-weekly-weeks", "0",
        "--plan-fingerprint", plan.fingerprint,
        "--actor-id", "retention_cli_operator_001",
        "--offline-confirmed",
      ], { stdout: new CaptureOutput() }),
      /PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_FLAG_REQUIRED:output/u,
    );

    const applyExit = await runPublicationOperationsBackupRetentionCli([
      "apply",
      "--backup-dir", paths.backups,
      "--evaluated-at", evaluated,
      "--keep-latest", "2",
      "--keep-daily-days", "0",
      "--keep-weekly-weeks", "0",
      "--plan-fingerprint", plan.fingerprint,
      "--actor-id", "retention_cli_operator_001",
      "--offline-confirmed",
      "--pruned-at", "2026-07-30T12:05:00.000Z",
      "--output", receiptPath,
    ], { stdout: new CaptureOutput() });
    assert.equal(applyExit, 0);
    const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as {
      status: string;
      actorId: string;
      deletedCount: number;
    };
    assert.equal(receipt.status, "pruned");
    assert.equal(receipt.actorId, "retention_cli_operator_001");
    assert.equal(receipt.deletedCount > 0, true);
    assert.equal((await stat(receiptPath)).mode & 0o777, 0o600);
    assert.equal(JSON.stringify(receipt).includes(paths.backups), false);
  });
});
