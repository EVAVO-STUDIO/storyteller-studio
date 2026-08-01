import assert from "node:assert/strict";
import {
  chmod,
  mkdtemp,
  mkdir,
  link,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { stableHash } from "@evavo/storyteller-engine";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";
import { createPublicationOperationsBackup } from "./publication-operations-backup.js";
import {
  createPublicationOperationsBackupRetentionApplyIntent,
} from "./publication-operations-backup-retention-evidence.js";
import {
  inspectPublicationOperationsBackupRetention,
} from "./publication-operations-backup-retention-inspection.js";
import { runPublicationOperationsBackupRetentionCli } from "./publication-operations-backup-retention-main.js";
import {
  prunePublicationOperationsBackups,
  type PublicationOperationsBackupRetentionPlan,
} from "./publication-operations-backup-retention.js";

const applicationRevision = "5".repeat(40);
const evaluatedAt = "2026-08-01T01:00:00.000Z";
const prunedAt = "2026-08-01T01:05:00.000Z";
const inspectedAt = "2026-08-01T01:10:00.000Z";

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
  snapshotCount: number,
  run: (paths: FixturePaths) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-retention-inspection-"));
  try {
    const data = join(root, "data");
    const backups = join(root, "backups");
    await mkdir(data, { recursive: true, mode: 0o700 });
    const store = new FileProjectStore(join(data, "publication-operations"));
    await store.create(
      "audiobook-retail-publication-monitor",
      "retention_inspection_monitor_001",
      {
        id: "retention_inspection_monitor_001",
        status: "healthy-live",
        revision: 1,
        fingerprint: "a".repeat(64),
      },
      new Date("2026-07-01T00:00:00.000Z"),
    );
    for (let index = 0; index < snapshotCount; index += 1) {
      await createPublicationOperationsBackup({
        dataDirectory: data,
        backupDirectory: backups,
        actorId: "retention_inspection_backup_operator_001",
        offlineConfirmed: true,
        applicationRevision,
        createdAt: new Date(`2026-07-${String(28 + index).padStart(2, "0")}T00:00:00.000Z`),
      });
    }
    await run({ root, data, backups });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function policyArguments(backups: string): string[] {
  return [
    "--backup-dir", backups,
    "--evaluated-at", evaluatedAt,
    "--application-revision", applicationRevision,
    "--keep-latest", "1",
    "--keep-daily-days", "0",
    "--keep-weekly-weeks", "0",
  ];
}

async function createPlan(
  paths: FixturePaths,
  name: string,
): Promise<Readonly<{ path: string; plan: PublicationOperationsBackupRetentionPlan }>> {
  const path = join(paths.root, name);
  await runPublicationOperationsBackupRetentionCli([
    "plan",
    ...policyArguments(paths.backups),
    "--output", path,
  ], { stdout: new CaptureOutput() });
  return Object.freeze({
    path,
    plan: JSON.parse(await readFile(path, "utf8")) as
      PublicationOperationsBackupRetentionPlan,
  });
}

function applyArguments(
  paths: FixturePaths,
  plan: PublicationOperationsBackupRetentionPlan,
  output: string,
): string[] {
  return [
    "apply",
    ...policyArguments(paths.backups),
    "--plan-fingerprint", plan.fingerprint,
    "--actor-id", "retention_inspection_apply_operator_001",
    "--offline-confirmed",
    "--pruned-at", prunedAt,
    "--output", output,
  ];
}

function inspectArguments(
  paths: FixturePaths,
  planPath: string,
  applyPath: string,
  output: string,
): string[] {
  return [
    "inspect",
    "--output", output,
    "--backup-dir", paths.backups,
    "--plan-receipt", planPath,
    "--apply-receipt", applyPath,
    "--application-revision", applicationRevision,
    "--offline-confirmed",
    "--inspected-at", inspectedAt,
  ];
}

async function writePrivateJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(path, 0o600);
}

function createIntent(plan: PublicationOperationsBackupRetentionPlan) {
  return createPublicationOperationsBackupRetentionApplyIntent({
    operationId: "7fbb3e3b-4995-4b37-9f5f-39d7a7ffed01",
    actorId: "retention_inspection_apply_operator_001",
    startedAt: new Date("2026-08-01T01:02:00.000Z"),
    applicationRevision,
    expectedPlanFingerprint: plan.fingerprint,
  });
}

test("successful apply produces a verified-complete private inspection", async () => {
  await withFixture(3, async (paths) => {
    const planned = await createPlan(paths, "complete-plan.json");
    const applyPath = join(paths.root, "complete-apply.json");
    await runPublicationOperationsBackupRetentionCli(
      applyArguments(paths, planned.plan, applyPath),
      {
        stdout: new CaptureOutput(),
        now: () => new Date("2026-08-01T01:02:00.000Z"),
      },
    );

    const inspectionPath = join(paths.root, "complete-inspection.json");
    const stdout = new CaptureOutput();
    assert.equal(
      await runPublicationOperationsBackupRetentionCli(
        inspectArguments(paths, planned.path, applyPath, inspectionPath),
        { stdout },
      ),
      0,
    );
    const inspection = JSON.parse(await readFile(inspectionPath, "utf8")) as {
      status: string;
      normalServicesMayRestart: boolean;
      nextAction: string;
      remainingDeletionCandidateIds: readonly string[];
      applyEvidenceFingerprint: string;
      inventoryFingerprint: string;
      fingerprint: string;
    };
    assert.equal(inspection.status, "verified-complete");
    assert.equal(inspection.normalServicesMayRestart, true);
    assert.equal(
      inspection.nextAction,
      "retain-evidence-and-resume-services",
    );
    assert.deepEqual(inspection.remainingDeletionCandidateIds, []);
    assert.match(inspection.applyEvidenceFingerprint, /^[a-f0-9]{64}$/u);
    assert.match(inspection.inventoryFingerprint, /^[a-f0-9]{64}$/u);
    assert.match(inspection.fingerprint, /^[a-f0-9]{64}$/u);
    assert.equal((await stat(inspectionPath)).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(stdout.value), {
      status: "written",
      receipt: "inspection",
    });
    assert.equal(stdout.value.includes(paths.backups), false);
  });
});

test("failed apply with a later valid snapshot proves no planned deletion occurred", async () => {
  await withFixture(2, async (paths) => {
    const planned = await createPlan(paths, "drift-plan.json");
    const applyPath = join(paths.root, "drift-apply.json");
    await assert.rejects(
      runPublicationOperationsBackupRetentionCli(
        applyArguments(paths, planned.plan, applyPath),
        {
          stdout: new CaptureOutput(),
          now: () => new Date("2026-08-01T01:02:00.000Z"),
          afterApplyIntent: async () => {
            await createPublicationOperationsBackup({
              dataDirectory: paths.data,
              backupDirectory: paths.backups,
              actorId: "retention_inspection_late_backup_operator_001",
              offlineConfirmed: true,
              applicationRevision,
              createdAt: new Date("2026-07-31T12:00:00.000Z"),
            });
          },
        },
      ),
      /PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_STALE/u,
    );

    const inspectionPath = join(paths.root, "drift-inspection.json");
    await runPublicationOperationsBackupRetentionCli(
      inspectArguments(paths, planned.path, applyPath, inspectionPath),
      { stdout: new CaptureOutput() },
    );
    const inspection = JSON.parse(await readFile(inspectionPath, "utf8")) as {
      status: string;
      applyEvidenceStatus: string;
      applyEvidenceTrust: string;
      normalServicesMayRestart: boolean;
      unexpectedSnapshotIds: readonly string[];
      nextAction: string;
    };
    assert.equal(inspection.status, "verified-no-mutation");
    assert.equal(inspection.applyEvidenceStatus, "failed");
    assert.equal(inspection.applyEvidenceTrust, "fingerprinted");
    assert.equal(inspection.normalServicesMayRestart, true);
    assert.equal(inspection.unexpectedSnapshotIds.length, 1);
    assert.equal(
      inspection.nextAction,
      "create-new-plan-before-any-retry",
    );
  });
});

test("exact retained state with an interrupted intent becomes verified recovery evidence", async () => {
  await withFixture(3, async (paths) => {
    const planned = await createPlan(paths, "recovered-plan.json");
    const applyPath = join(paths.root, "recovered-apply.json");
    await writePrivateJson(applyPath, createIntent(planned.plan));
    await prunePublicationOperationsBackups({
      backupDirectory: paths.backups,
      applicationRevision,
      keepLatest: 1,
      keepDailyDays: 0,
      keepWeeklyWeeks: 0,
      protectedSnapshotIds: [],
      evaluatedAt: new Date(evaluatedAt),
      actorId: "retention_inspection_apply_operator_001",
      offlineConfirmed: true,
      expectedPlanFingerprint: planned.plan.fingerprint,
      prunedAt: new Date(prunedAt),
    });

    const inspection = await inspectPublicationOperationsBackupRetention({
      backupDirectory: paths.backups,
      planReceiptPath: planned.path,
      applyReceiptPath: applyPath,
      applicationRevision,
      offlineConfirmed: true,
      inspectedAt: new Date(inspectedAt),
    });
    assert.equal(inspection.status, "verified-complete-recovered");
    assert.equal(inspection.normalServicesMayRestart, true);
    assert.equal(
      inspection.nextAction,
      "retain-recovery-inspection-and-resume-services",
    );
    assert.deepEqual(inspection.remainingDeletionCandidateIds, []);
  });
});

test("partial deletion remains inspection-required and cannot authorise restart", async () => {
  await withFixture(4, async (paths) => {
    const planned = await createPlan(paths, "partial-plan.json");
    const applyPath = join(paths.root, "partial-apply.json");
    await writePrivateJson(applyPath, createIntent(planned.plan));
    await rm(join(paths.backups, planned.plan.delete[0]!.snapshotId), {
      recursive: true,
      force: false,
    });

    const inspection = await inspectPublicationOperationsBackupRetention({
      backupDirectory: paths.backups,
      planReceiptPath: planned.path,
      applyReceiptPath: applyPath,
      applicationRevision,
      offlineConfirmed: true,
      inspectedAt: new Date(inspectedAt),
    });
    assert.equal(inspection.status, "inspection-required");
    assert.equal(inspection.normalServicesMayRestart, false);
    assert.equal(inspection.missingDeletionCandidateIds.length, 1);
    assert.equal(inspection.remainingDeletionCandidateIds.length, 2);
    assert.equal(
      inspection.nextAction,
      "keep-services-stopped-and-inspect-manually",
    );
  });
});

test("pruning residue is verified but remains an explicit manual-inspection blocker", async () => {
  await withFixture(3, async (paths) => {
    const planned = await createPlan(paths, "pruning-plan.json");
    const applyPath = join(paths.root, "pruning-apply.json");
    await writePrivateJson(applyPath, createIntent(planned.plan));
    const snapshotId = planned.plan.delete[0]!.snapshotId;
    await rename(
      join(paths.backups, snapshotId),
      join(paths.backups, `.${snapshotId}.999.pruning`),
    );

    const inspection = await inspectPublicationOperationsBackupRetention({
      backupDirectory: paths.backups,
      planReceiptPath: planned.path,
      applyReceiptPath: applyPath,
      applicationRevision,
      offlineConfirmed: true,
      inspectedAt: new Date(inspectedAt),
    });
    assert.equal(inspection.status, "inspection-required");
    assert.equal(inspection.normalServicesMayRestart, false);
    assert.deepEqual(inspection.pruningSnapshotIds, [snapshotId]);
  });
});

test("tampered fingerprinted apply evidence is rejected before an inspection receipt exists", async () => {
  await withFixture(2, async (paths) => {
    const planned = await createPlan(paths, "tampered-plan.json");
    const applyPath = join(paths.root, "tampered-apply.json");
    const intent = createIntent(planned.plan);
    const replacement = intent.fingerprint.endsWith("0") ? "1" : "0";
    await writePrivateJson(applyPath, {
      ...intent,
      fingerprint: `${intent.fingerprint.slice(0, -1)}${replacement}`,
    });
    const output = join(paths.root, "tampered-inspection.json");

    await assert.rejects(
      runPublicationOperationsBackupRetentionCli(
        inspectArguments(paths, planned.path, applyPath, output),
        { stdout: new CaptureOutput() },
      ),
      /PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_INTENT_FINGERPRINT_MISMATCH/u,
    );
    await assert.rejects(stat(output), /ENOENT/u);
  });
});

test("inspection rejects backup mutation during its two-pass read-only scan", async () => {
  await withFixture(2, async (paths) => {
    const planned = await createPlan(paths, "changing-plan.json");
    const applyPath = join(paths.root, "changing-apply.json");
    await writePrivateJson(applyPath, createIntent(planned.plan));

    await assert.rejects(
      inspectPublicationOperationsBackupRetention({
        backupDirectory: paths.backups,
        planReceiptPath: planned.path,
        applyReceiptPath: applyPath,
        applicationRevision,
        offlineConfirmed: true,
        inspectedAt: new Date(inspectedAt),
        afterFirstInventory: async () => {
          await createPublicationOperationsBackup({
            dataDirectory: paths.data,
            backupDirectory: paths.backups,
            actorId: "retention_inspection_concurrent_backup_operator_001",
            offlineConfirmed: true,
            applicationRevision,
            createdAt: new Date("2026-07-31T13:00:00.000Z"),
          });
        },
      }),
      /PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_STATE_CHANGED/u,
    );
  });
});

test("legacy v1 intent remains inspectable but is explicitly marked untrusted", async () => {
  await withFixture(2, async (paths) => {
    const planned = await createPlan(paths, "legacy-plan.json");
    const applyPath = join(paths.root, "legacy-apply.json");
    await writePrivateJson(applyPath, {
      schemaVersion:
        "storyteller-publication-operations-backup-retention-apply-intent-v1",
      status: "applying",
      operationId: "8fbb3e3b-4995-4b37-9f5f-39d7a7ffed02",
      actorId: "retention_inspection_apply_operator_001",
      startedAt: "2026-08-01T01:02:00.000Z",
      applicationRevision,
      expectedPlanFingerprint: planned.plan.fingerprint,
      backupState: "inspection-required-until-completed",
    });

    const inspection = await inspectPublicationOperationsBackupRetention({
      backupDirectory: paths.backups,
      planReceiptPath: planned.path,
      applyReceiptPath: applyPath,
      applicationRevision,
      offlineConfirmed: true,
      inspectedAt: new Date(inspectedAt),
    });
    assert.equal(inspection.status, "verified-no-mutation");
    assert.equal(inspection.applyEvidenceTrust, "legacy-unfingerprinted");
    assert.equal(inspection.normalServicesMayRestart, true);
  });
});

test("hard-linked private evidence is rejected before inspection", async () => {
  await withFixture(2, async (paths) => {
    const planned = await createPlan(paths, "linked-plan.json");
    const linkedPlan = join(paths.root, "linked-plan-alias.json");
    await link(planned.path, linkedPlan);
    const applyPath = join(paths.root, "linked-apply.json");
    await writePrivateJson(applyPath, createIntent(planned.plan));

    await assert.rejects(
      inspectPublicationOperationsBackupRetention({
        backupDirectory: paths.backups,
        planReceiptPath: linkedPlan,
        applyReceiptPath: applyPath,
        applicationRevision,
        offlineConfirmed: true,
        inspectedAt: new Date(inspectedAt),
      }),
      /PUBLICATION_OPERATIONS_BACKUP_RETENTION_INSPECTION_PLAN_RECEIPT_INVALID/u,
    );
  });
});

test("failure evidence cannot be rebound to a forged apply intent", async () => {
  await withFixture(2, async (paths) => {
    const planned = await createPlan(paths, "failure-chain-plan.json");
    const applyPath = join(paths.root, "failure-chain-apply.json");
    await assert.rejects(
      runPublicationOperationsBackupRetentionCli(
        applyArguments(paths, planned.plan, applyPath),
        {
          stdout: new CaptureOutput(),
          now: () => new Date("2026-08-01T01:02:00.000Z"),
          afterApplyIntent: async () => {
            await createPublicationOperationsBackup({
              dataDirectory: paths.data,
              backupDirectory: paths.backups,
              actorId: "retention_inspection_failure_chain_backup_001",
              offlineConfirmed: true,
              applicationRevision,
              createdAt: new Date("2026-07-31T14:00:00.000Z"),
            });
          },
        },
      ),
      /PUBLICATION_OPERATIONS_BACKUP_RETENTION_PLAN_STALE/u,
    );

    const failure = JSON.parse(await readFile(applyPath, "utf8")) as
      Record<string, unknown> & { fingerprint: string };
    const { fingerprint: _fingerprint, ...partial } = failure;
    const tamperedPartial = {
      ...partial,
      intentFingerprint: "0".repeat(64),
    };
    await writePrivateJson(applyPath, {
      ...tamperedPartial,
      fingerprint: stableHash(tamperedPartial),
    });

    await assert.rejects(
      inspectPublicationOperationsBackupRetention({
        backupDirectory: paths.backups,
        planReceiptPath: planned.path,
        applyReceiptPath: applyPath,
        applicationRevision,
        offlineConfirmed: true,
        inspectedAt: new Date(inspectedAt),
      }),
      /PUBLICATION_OPERATIONS_BACKUP_RETENTION_APPLY_FAILURE_INTENT_MISMATCH/u,
    );
  });
});
