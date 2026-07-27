import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  BudgetConflictError,
  BudgetInsufficientFundsError,
  FileBudgetLedger,
  budgetAccountId,
  budgetAccountPublicView,
  budgetMajorUnits,
  budgetMicros,
} from "./budget-ledger.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");

async function withLedger(
  run: (input: Readonly<{
    ledger: FileBudgetLedger;
    root: string;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-budget-ledger-"));
  try {
    await run({
      ledger: new FileBudgetLedger(new FileProjectStore(root)),
      root,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function createAccount(
  ledger: FileBudgetLedger,
  authorisedMicros = budgetMicros(1),
) {
  return ledger.createAccount({
    projectId: "project_budget_001",
    currency: "AUD",
    authorisedMicros,
    actorId: "operator_budget_001",
    now: t0,
  });
}

function reservationInput(
  overrides: Partial<Parameters<FileBudgetLedger["reserve"]>[0]> = {},
): Parameters<FileBudgetLedger["reserve"]>[0] {
  return {
    projectId: "project_budget_001",
    currency: "AUD",
    jobId: "job_budget_001",
    queueItemId: "queue_job_budget_001",
    attempt: 1,
    maximumMicros: budgetMicros(0.4),
    reservationTtlMs: 60_000,
    actorId: "worker_budget_001",
    now: t0,
    ...overrides,
  };
}

test("major currency values convert to exact integer micro-units", () => {
  assert.equal(budgetMicros(0), 0);
  assert.equal(budgetMicros(0.000001), 1);
  assert.equal(budgetMicros(0.1), 100_000);
  assert.equal(budgetMicros(12.345678), 12_345_678);
  assert.equal(budgetMajorUnits(12_345_678), 12.345678);
  assert.throws(() => budgetMicros(-1), /BUDGET_MAJOR_UNITS_INVALID/u);
  assert.throws(
    () => budgetMicros(0.0000001),
    /BUDGET_MAJOR_UNITS_PRECISION_INVALID/u,
  );
});

test("account creation is idempotent but a changed limit conflicts", async () => {
  await withLedger(async ({ ledger }) => {
    const first = await createAccount(ledger, budgetMicros(1));
    const repeated = await createAccount(ledger, budgetMicros(1));
    assert.equal(repeated.revision, first.revision);
    assert.equal(repeated.envelopeHash, first.envelopeHash);

    await assert.rejects(
      createAccount(ledger, budgetMicros(2)),
      /BUDGET_ACCOUNT_IDEMPOTENCY_CONFLICT/u,
    );
  });
});

test("parallel reservations cannot overspend one account", async () => {
  await withLedger(async ({ ledger }) => {
    await createAccount(ledger, budgetMicros(0.1));
    const requests = [
      reservationInput({
        jobId: "job_budget_parallel_001",
        queueItemId: "queue_job_budget_parallel_001",
        maximumMicros: budgetMicros(0.08),
      }),
      reservationInput({
        jobId: "job_budget_parallel_002",
        queueItemId: "queue_job_budget_parallel_002",
        maximumMicros: budgetMicros(0.08),
      }),
    ];
    const results = await Promise.allSettled(requests.map((input) => ledger.reserve(input)));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(rejected && rejected.status === "rejected");
    assert.ok(rejected.reason instanceof BudgetInsufficientFundsError);
    assert.equal(rejected.reason.requestedMicros, budgetMicros(0.08));
    assert.equal(rejected.reason.availableMicros, budgetMicros(0.02));

    const view = await ledger.publicView("project_budget_001", "AUD");
    assert.equal(view.authorisedMicros, budgetMicros(0.1));
    assert.equal(view.reservedMicros, budgetMicros(0.08));
    assert.equal(view.availableMicros, budgetMicros(0.02));
    assert.equal(view.activeReservationCount, 1);
  });
});

test("reservation retries are idempotent and changed amounts are rejected", async () => {
  await withLedger(async ({ ledger }) => {
    await createAccount(ledger);
    const first = await ledger.reserve(reservationInput());
    const repeated = await ledger.reserve(reservationInput());
    assert.equal(first.idempotent, false);
    assert.equal(repeated.idempotent, true);
    assert.equal(repeated.reservation.id, first.reservation.id);
    assert.equal(repeated.envelope.revision, first.envelope.revision);

    await assert.rejects(
      ledger.reserve(reservationInput({ maximumMicros: budgetMicros(0.5) })),
      /BUDGET_RESERVATION_IDEMPOTENCY_CONFLICT/u,
    );
  });
});

test("committing actual cost releases the unused reservation atomically", async () => {
  await withLedger(async ({ ledger }) => {
    await createAccount(ledger, budgetMicros(1));
    const reserved = await ledger.reserve(reservationInput({
      maximumMicros: budgetMicros(0.4),
      reservationTtlMs: 120_000,
    }));
    const committedAt = new Date(t0.getTime() + 30_000);
    const committed = await ledger.commit({
      projectId: "project_budget_001",
      currency: "AUD",
      reservationId: reserved.reservation.id,
      actualMicros: budgetMicros(0.12),
      actorId: "worker_budget_001",
      now: committedAt,
    });
    assert.equal(committed.reservation.status, "committed");
    assert.equal(committed.reservation.committedMicros, budgetMicros(0.12));
    assert.equal(committed.idempotent, false);

    const view = await ledger.publicView("project_budget_001", "AUD");
    assert.equal(view.committedMicros, budgetMicros(0.12));
    assert.equal(view.reservedMicros, 0);
    assert.equal(view.availableMicros, budgetMicros(0.88));
    assert.equal(view.committedReservationCount, 1);

    const repeated = await ledger.commit({
      projectId: "project_budget_001",
      currency: "AUD",
      reservationId: reserved.reservation.id,
      actualMicros: budgetMicros(0.12),
      actorId: "worker_budget_001",
      now: committedAt,
    });
    assert.equal(repeated.idempotent, true);
    await assert.rejects(
      ledger.commit({
        projectId: "project_budget_001",
        currency: "AUD",
        reservationId: reserved.reservation.id,
        actualMicros: budgetMicros(0.13),
        actorId: "worker_budget_001",
        now: committedAt,
      }),
      /BUDGET_COMMIT_IDEMPOTENCY_CONFLICT/u,
    );
    await assert.rejects(
      ledger.release({
        projectId: "project_budget_001",
        currency: "AUD",
        reservationId: reserved.reservation.id,
        releaseCode: "GENERATION_CANCELLED",
        actorId: "worker_budget_001",
        now: committedAt,
      }),
      /BUDGET_RESERVATION_NOT_ACTIVE/u,
    );
  });
});

test("commit cannot exceed the pre-provider reservation", async () => {
  await withLedger(async ({ ledger }) => {
    await createAccount(ledger);
    const reserved = await ledger.reserve(reservationInput());
    await assert.rejects(
      ledger.commit({
        projectId: "project_budget_001",
        currency: "AUD",
        reservationId: reserved.reservation.id,
        actualMicros: budgetMicros(0.400001),
        actorId: "worker_budget_001",
        now: new Date(t0.getTime() + 1_000),
      }),
      /BUDGET_COMMIT_EXCEEDS_RESERVATION/u,
    );
    assert.equal(
      (await ledger.publicView("project_budget_001", "AUD")).reservedMicros,
      budgetMicros(0.4),
    );
  });
});

test("renewal extends active capacity while expiry and release return it", async () => {
  await withLedger(async ({ ledger }) => {
    await createAccount(ledger, budgetMicros(0.5));
    const reserved = await ledger.reserve(reservationInput({
      maximumMicros: budgetMicros(0.4),
      reservationTtlMs: 2_000,
    }));
    const renewed = await ledger.renew({
      projectId: "project_budget_001",
      currency: "AUD",
      reservationId: reserved.reservation.id,
      reservationTtlMs: 4_000,
      actorId: "worker_budget_001",
      now: new Date(t0.getTime() + 1_000),
    });
    assert.equal(renewed.idempotent, false);
    assert.equal(
      renewed.reservation.expiresAt,
      new Date(t0.getTime() + 5_000).toISOString(),
    );

    const early = await ledger.reapExpired({
      projectId: "project_budget_001",
      currency: "AUD",
      actorId: "worker_budget_001",
      now: new Date(t0.getTime() + 4_999),
    });
    assert.equal(early.expiredCount, 0);
    const expired = await ledger.reapExpired({
      projectId: "project_budget_001",
      currency: "AUD",
      actorId: "worker_budget_001",
      now: new Date(t0.getTime() + 5_000),
    });
    assert.equal(expired.expiredCount, 1);
    assert.equal(
      (await ledger.publicView("project_budget_001", "AUD")).availableMicros,
      budgetMicros(0.5),
    );

    const retry = await ledger.reserve(reservationInput({
      jobId: "job_budget_001",
      queueItemId: "queue_job_budget_001",
      attempt: 2,
      maximumMicros: budgetMicros(0.3),
      now: new Date(t0.getTime() + 6_000),
    }));
    const released = await ledger.release({
      projectId: "project_budget_001",
      currency: "AUD",
      reservationId: retry.reservation.id,
      releaseCode: "GENERATION_PROVIDER_BLOCKED",
      actorId: "worker_budget_001",
      now: new Date(t0.getTime() + 7_000),
    });
    assert.equal(released.reservation.status, "released");
    assert.equal(
      (await ledger.publicView("project_budget_001", "AUD")).availableMicros,
      budgetMicros(0.5),
    );
  });
});

test("authorised limit cannot be lowered below committed and active obligations", async () => {
  await withLedger(async ({ ledger }) => {
    await createAccount(ledger, budgetMicros(1));
    await ledger.reserve(reservationInput({ maximumMicros: budgetMicros(0.4) }));
    await assert.rejects(
      ledger.updateAuthorisedLimit({
        projectId: "project_budget_001",
        currency: "AUD",
        authorisedMicros: budgetMicros(0.39),
        actorId: "operator_budget_001",
        now: new Date(t0.getTime() + 1_000),
      }),
      /BUDGET_LIMIT_BELOW_OBLIGATIONS/u,
    );
    const increased = await ledger.updateAuthorisedLimit({
      projectId: "project_budget_001",
      currency: "AUD",
      authorisedMicros: budgetMicros(2),
      actorId: "operator_budget_001",
      now: new Date(t0.getTime() + 1_000),
    });
    assert.equal(increased.payload.authorisedMicros, budgetMicros(2));
  });
});

test("public views and audit metadata omit reservation, queue and job identities", async () => {
  await withLedger(async ({ ledger, root }) => {
    const account = await createAccount(ledger);
    const reserved = await ledger.reserve(reservationInput());
    const view = budgetAccountPublicView(reserved.envelope.payload);
    const serialisedView = JSON.stringify(view);
    for (const forbidden of [
      account.payload.projectId,
      reserved.reservation.id,
      reserved.reservation.jobId,
      reserved.reservation.queueItemId,
      "worker_budget_001",
    ]) assert.equal(serialisedView.includes(forbidden), false);

    const audit = await readFile(
      join(root, "audit", "2026-07-27.jsonl"),
      "utf8",
    );
    assert.equal(audit.includes(reserved.reservation.jobId), false);
    assert.equal(audit.includes(reserved.reservation.queueItemId), false);
    assert.equal(audit.includes(reserved.reservation.id), false);
    assert.equal(audit.includes(reserved.reservation.fingerprint), true);
    assert.equal(audit.includes("requestedMicros"), true);
  });
});

test("tampered budget envelopes fail integrity verification", async () => {
  await withLedger(async ({ ledger, root }) => {
    const created = await createAccount(ledger);
    const path = join(
      root,
      "entities",
      "budget-account",
      `${budgetAccountId("project_budget_001", "AUD")}.json`,
    );
    const envelope = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    const payload = envelope.payload as Record<string, unknown>;
    payload.authorisedMicros = budgetMicros(999);
    await writeFile(path, `${JSON.stringify(envelope)}\n`, "utf8");

    await assert.rejects(
      ledger.read("project_budget_001", "AUD"),
      /STORE_ENVELOPE|STORE_CONTENT|BUDGET_ACCOUNT/u,
    );
    assert.equal(created.payload.authorisedMicros, budgetMicros(1));
  });
});

test("invalid reservation and account transitions fail closed", async () => {
  await withLedger(async ({ ledger }) => {
    await createAccount(ledger);
    await assert.rejects(
      ledger.reserve(reservationInput({ reservationTtlMs: 999 })),
      /BUDGET_RESERVATION_TTL_INVALID/u,
    );
    await assert.rejects(
      ledger.reserve(reservationInput({ attempt: 0 })),
      /BUDGET_RESERVATION_ATTEMPT_INVALID/u,
    );
    await assert.rejects(
      ledger.release({
        projectId: "project_budget_001",
        currency: "AUD",
        reservationId: "reservation_missing_001",
        releaseCode: "not-lowercase",
        actorId: "worker_budget_001",
        now: t0,
      }),
      /BUDGET_RESERVATION_RELEASE_CODE_INVALID/u,
    );
    await assert.rejects(
      ledger.require("project_budget_missing", "AUD"),
      (error: unknown) => error instanceof BudgetConflictError,
    );
  });
});
