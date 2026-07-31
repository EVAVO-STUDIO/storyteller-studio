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

const applicationRevision = "3".repeat(40);
const evaluatedAt = "2026-07-31T00:00:00.000Z";

class CaptureOutput {
  value = "";
  write(value: string): void {
    this.value += value;
  }
}

async function withRetentionFixture(
  run: (paths: Readonly<{
    root: string;
    data: string;
    backups: string;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-retention-output-"));
  try {
    const data = join(root, "data");
    const backups = join(root, "backups");
    await mkdir(data, { recursive: true, mode: 0o700 });
    const store = new FileProjectStore(join(data, "publication-operations"));
    await store.create(
      "audiobook-retail-publication-monitor",
      "retention_output_monitor_001",
      {
        id: "retention_output_monitor_001",
        status: "healthy-live",
        revision: 1,
        fingerprint: "a".repeat(64),
      },
      new Date("2026-07-01T00:00:00.000Z"),
    );
    for (const createdAt of [
      "2026-07-29T00:00:00.000Z",
      "2026-07-30T00:00:00.000Z",
    ]) {
      await createPublicationOperationsBackup({
        dataDirectory: data,
        backupDirectory: backups,
        actorId: "retention_output_backup_operator_001",
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

test("retention plan and apply both require private output receipts", async () => {
  await withRetentionFixture(async ({ backups }) => {
    await assert.rejects(
      runPublicationOperationsBackupRetentionCli([
        "plan",
        ...commonArguments(backups),
      ], { stdout: new CaptureOutput() }),
      /PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_FLAG_REQUIRED:output/u,
    );
    await assert.rejects(
      runPublicationOperationsBackupRetentionCli([
        "apply",
        ...commonArguments(backups),
      ], { stdout: new CaptureOutput() }),
      /PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_FLAG_REQUIRED:output/u,
    );
  });
});

test("retention receipts publish atomically with bounded path-free acknowledgements", async () => {
  await withRetentionFixture(async ({ root, backups }) => {
    const planPath = join(root, "retention-plan.json");
    const planOutput = new CaptureOutput();
    assert.equal(
      await runPublicationOperationsBackupRetentionCli([
        "plan",
        ...commonArguments(backups),
        "--output", planPath,
      ], { stdout: planOutput }),
      0,
    );
    assert.deepEqual(JSON.parse(planOutput.value), {
      status: "written",
      receipt: "plan",
    });
    assert.equal((await stat(planPath)).mode & 0o777, 0o600);
    const plan = JSON.parse(await readFile(planPath, "utf8")) as {
      fingerprint: string;
      applicationRevision: string;
      delete: readonly unknown[];
    };
    assert.equal(plan.applicationRevision, applicationRevision);
    assert.equal(plan.delete.length, 1);

    const occupiedPath = join(root, "occupied-plan.json");
    await writeFile(occupiedPath, "original\n", { mode: 0o600 });
    await assert.rejects(
      runPublicationOperationsBackupRetentionCli([
        "plan",
        ...commonArguments(backups),
        "--output", occupiedPath,
      ], { stdout: new CaptureOutput() }),
      /PUBLICATION_OPERATIONS_BACKUP_RETENTION_CLI_OUTPUT_EXISTS/u,
    );
    assert.equal(await readFile(occupiedPath, "utf8"), "original\n");

    const forcedOutput = new CaptureOutput();
    assert.equal(
      await runPublicationOperationsBackupRetentionCli([
        "plan",
        ...commonArguments(backups),
        "--output", occupiedPath,
        "--force",
      ], { stdout: forcedOutput }),
      0,
    );
    assert.deepEqual(JSON.parse(forcedOutput.value), {
      status: "written",
      receipt: "plan",
    });
    assert.equal(
      (JSON.parse(await readFile(occupiedPath, "utf8")) as { status: string })
        .status,
      "planned",
    );

    const receiptPath = join(root, "retention-apply.json");
    const applyOutput = new CaptureOutput();
    assert.equal(
      await runPublicationOperationsBackupRetentionCli([
        "apply",
        ...commonArguments(backups),
        "--plan-fingerprint", plan.fingerprint,
        "--actor-id", "retention_output_apply_operator_001",
        "--offline-confirmed",
        "--pruned-at", "2026-07-31T00:05:00.000Z",
        "--output", receiptPath,
      ], { stdout: applyOutput }),
      0,
    );
    assert.deepEqual(JSON.parse(applyOutput.value), {
      status: "written",
      receipt: "apply",
    });
    assert.equal((await stat(receiptPath)).mode & 0o777, 0o600);

    for (const output of [planOutput.value, forcedOutput.value, applyOutput.value]) {
      for (const forbidden of [
        root,
        backups,
        planPath,
        receiptPath,
        occupiedPath,
        applicationRevision,
        plan.fingerprint,
        "publication_backup_",
      ]) {
        assert.equal(output.includes(forbidden), false);
      }
    }
    assert.equal(
      (await readdir(root)).some((name) => name.endsWith(".tmp")),
      false,
    );
  });
});
