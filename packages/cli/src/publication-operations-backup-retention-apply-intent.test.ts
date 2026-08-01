import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";
import { createPublicationOperationsBackup } from "./publication-operations-backup.js";
import { runPublicationOperationsBackupRetentionCli } from "./publication-operations-backup-retention-main.js";

const applicationRevision = "4".repeat(40);
const evaluatedAt = "2026-08-01T00:00:00.000Z";
const prunedAt = "2026-08-01T00:05:00.000Z";

class CaptureOutput {
  value = "";
  write(value: string): void {
    this.value += value;
  }
}

interface FixturePaths {
  root: string;
  data: string;
  backups: string;
}

async function withFixture(
  run: (paths: FixturePaths) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-retention-intent-"));
  try {
    const data = join(root, "data");
    const backups = join(root, "backups");
    await mkdir(data, { recursive: true, mode: 0o700 });
    const store = new FileProjectStore(join(data, "publication-operations"));
    await store.create(
      "audiobook-retail-publication-monitor",
      "retention_intent_monitor_001",
      {
        id: "retention_intent_monitor_001",
        status: "healthy-live",
        revision: 1,
        fingerprint: "a".repeat(64),
      },
      new Date("2026-07-01T00:00:00.000Z"),
    );
    for (const createdAt of [
      "2026-07-30T00:00:00.000Z",
      "2026-07-31T00:00:00.000Z",
    ]) {
      await createPublicationOperationsBackup({
        dataDirectory: data,
        backupDirectory: backups,
        actorId: "retention_intent_backup_operator_001",
        offlineConfirmed: true,
        applicationRevision,
        createdAt: new Date(createdAt),
      });
    }
    await run({ root, data, backups });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function commonArguments(backups: string): string[] {
  return [
    "--backup-dir", backups,
    "--evaluated-at", evaluatedAt,
    "--application-revision", applicationRevision,
    "--keep-latest", "1",
    "--keep-daily-days", "0",
    "--keep-weekly-weeks", "0",
  ];
}

async function planFingerprint(paths: FixturePaths, name: string): Promise<string> {
  const output = join(paths.root, name);
  await runPublicationOperationsBackupRetentionCli([
    "plan",
    ...commonArguments(paths.backups),
    "--output", output,
  ], { stdout: new CaptureOutput() });
  const plan = JSON.parse(await readFile(output, "utf8")) as {
    fingerprint: string;
  };
  return plan.fingerprint;
}

function applyArguments(
  paths: FixturePaths,
  fingerprint: string,
  output: string,
): string[] {
  return [
    "apply",
    ...commonArguments(paths.backups),
    "--plan-fingerprint", fingerprint,
    "--actor-id", "retention_intent_apply_operator_001",
    "--offline-confirmed",
    "--pruned-at", prunedAt,
    "--output", output,
  ];
}

async function snapshotNames(backups: string): Promise<readonly string[]> {
  return (await readdir(backups))
    .filter((name) => name.startsWith("publication_backup_"))
    .sort();
}

test("retention receipts cannot be written inside the backup inventory", async () => {
  await withFixture(async (paths) => {
    const before = await snapshotNames(paths.backups);
    await assert.rejects(
      runPublicationOperationsBackupRetentionCli([
        "plan",
        ...commonArguments(paths.backups),
        "--output", join(paths.backups, "retention-plan.json"),
      ], { stdout: new CaptureOutput() }),
      /PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_OUTPUT_INSIDE_BACKUP_ROOT/u,
    );

    const fingerprint = await planFingerprint(paths, "safe-plan.json");
    await assert.rejects(
      runPublicationOperationsBackupRetentionCli(
        applyArguments(
          paths,
          fingerprint,
          join(paths.backups, "retention-apply.json"),
        ),
        { stdout: new CaptureOutput() },
      ),
      /PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_OUTPUT_INSIDE_BACKUP_ROOT/u,
    );
    assert.deepEqual(await snapshotNames(paths.backups), before);
  });
});

test("an occupied apply receipt path blocks all deletion before mutation", async () => {
  await withFixture(async (paths) => {
    const fingerprint = await planFingerprint(paths, "occupied-plan.json");
    const output = join(paths.root, "occupied-apply.json");
    await writeFile(output, "existing private evidence\n", {
      encoding: "utf8",
      mode: 0o600,
    });
    const before = await snapshotNames(paths.backups);

    await assert.rejects(
      runPublicationOperationsBackupRetentionCli(
        applyArguments(paths, fingerprint, output),
        { stdout: new CaptureOutput() },
      ),
      /PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_OUTPUT_EXISTS/u,
    );
    assert.deepEqual(await snapshotNames(paths.backups), before);
    assert.equal(
      await readFile(output, "utf8"),
      "existing private evidence\n",
    );
  });
});

test("inventory drift after intent produces private failure evidence without deletion", async () => {
  await withFixture(async (paths) => {
    const fingerprint = await planFingerprint(paths, "drift-plan.json");
    const output = join(paths.root, "drift-apply.json");
    const stdout = new CaptureOutput();

    await assert.rejects(
      runPublicationOperationsBackupRetentionCli(
        applyArguments(paths, fingerprint, output),
        {
          stdout,
          now: () => new Date("2026-08-01T00:02:00.000Z"),
          afterApplyIntent: async () => {
            await createPublicationOperationsBackup({
              dataDirectory: paths.data,
              backupDirectory: paths.backups,
              actorId: "retention_intent_late_backup_operator_001",
              offlineConfirmed: true,
              applicationRevision,
              createdAt: new Date("2026-07-31T12:00:00.000Z"),
            });
          },
        },
      ),
      /PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_STALE/u,
    );

    const receipt = JSON.parse(await readFile(output, "utf8")) as {
      schemaVersion: string;
      status: string;
      errorCode: string;
      backupState: string;
      applicationRevision: string;
      expectedPlanFingerprint: string;
    };
    assert.equal(
      receipt.schemaVersion,
      "storyteller-publication-operations-backup-retention-apply-failure-v2",
    );
    assert.equal(receipt.status, "failed");
    assert.equal(
      receipt.errorCode,
      "PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_STALE",
    );
    assert.equal(receipt.backupState, "inspection-required");
    assert.equal(receipt.applicationRevision, applicationRevision);
    assert.equal(receipt.expectedPlanFingerprint, fingerprint);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    assert.equal(stdout.value, "");
    assert.equal((await snapshotNames(paths.backups)).length, 3);
    assert.equal(
      (await readdir(paths.root)).some((name) => name.endsWith(".tmp")),
      false,
    );
    assert.equal(JSON.stringify(receipt).includes(paths.backups), false);
  });
});

test("a changed intent reservation stops deletion and preserves the external replacement", async () => {
  await withFixture(async (paths) => {
    const fingerprint = await planFingerprint(paths, "reservation-plan.json");
    const output = join(paths.root, "reservation-apply.json");
    const before = await snapshotNames(paths.backups);

    await assert.rejects(
      runPublicationOperationsBackupRetentionCli(
        applyArguments(paths, fingerprint, output),
        {
          stdout: new CaptureOutput(),
          now: () => new Date("2026-08-01T00:03:00.000Z"),
          afterApplyIntent: async () => {
            await writeFile(output, "external replacement\n", {
              encoding: "utf8",
              mode: 0o600,
            });
          },
        },
      ),
      /PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_OUTPUT_RESERVATION_CHANGED/u,
    );

    assert.deepEqual(await snapshotNames(paths.backups), before);
    assert.equal(await readFile(output, "utf8"), "external replacement\n");
  });
});

test("successful apply atomically replaces intent with the final apply receipt", async () => {
  await withFixture(async (paths) => {
    const fingerprint = await planFingerprint(paths, "success-plan.json");
    const output = join(paths.root, "success-apply.json");
    const stdout = new CaptureOutput();

    assert.equal(
      await runPublicationOperationsBackupRetentionCli(
        applyArguments(paths, fingerprint, output),
        {
          stdout,
          now: () => new Date("2026-08-01T00:04:00.000Z"),
        },
      ),
      0,
    );

    const receipt = JSON.parse(await readFile(output, "utf8")) as {
      status: string;
      applicationRevision: string;
      deletedCount: number;
    };
    assert.equal(receipt.status, "pruned");
    assert.equal(receipt.applicationRevision, applicationRevision);
    assert.equal(receipt.deletedCount, 1);
    assert.deepEqual(JSON.parse(stdout.value), {
      status: "written",
      receipt: "apply",
    });
    assert.equal((await snapshotNames(paths.backups)).length, 1);
    assert.equal(
      (await readdir(paths.root)).some((name) => name.endsWith(".tmp")),
      false,
    );
  });
});
