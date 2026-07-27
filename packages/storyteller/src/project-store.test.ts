import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileProjectStore, StoreConflictError, StoreIntegrityError } from "./project-store.js";

async function withStore(run: (store: FileProjectStore, root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-store-"));
  try {
    const store = new FileProjectStore(root, { lockTimeoutMs: 1_000 });
    await run(store, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("file project store creates, reads and revises immutable envelopes", async () => {
  await withStore(async (store) => {
    const created = await store.create("project", "project_001", { title: "The House", status: "planned" }, new Date("2026-07-27T00:00:00.000Z"));
    assert.equal(created.revision, 1);
    assert.match(created.contentHash, /^[a-f0-9]{64}$/u);
    assert.match(created.envelopeHash, /^[a-f0-9]{64}$/u);

    const read = await store.read<{ title: string; status: string }>("project", "project_001");
    assert.equal(read?.payload.title, "The House");
    assert.equal(read?.envelopeHash, created.envelopeHash);

    const revised = await store.replace("project", "project_001", 1, { title: "The House", status: "calibration" }, new Date("2026-07-27T01:00:00.000Z"));
    assert.equal(revised.revision, 2);
    assert.equal(revised.previousEnvelopeHash, created.envelopeHash);
    assert.notEqual(revised.contentHash, created.contentHash);

    const listed = await store.list("project");
    assert.deepEqual(listed.map((row) => [row.entityId, row.revision]), [["project_001", 2]]);
  });
});

test("file project store rejects stale writes instead of losing concurrent work", async () => {
  await withStore(async (store) => {
    await store.create("project", "project_001", { status: "planned" });
    await store.replace("project", "project_001", 1, { status: "calibration" });
    await assert.rejects(
      store.replace("project", "project_001", 1, { status: "production" }),
      (error: unknown) => error instanceof StoreConflictError && error.message === "STORE_REVISION_CONFLICT:2",
    );
  });
});

test("file project store detects payload tampering on read", async () => {
  await withStore(async (store, root) => {
    await store.create("project", "project_001", { title: "Original" });
    const path = join(root, "entities", "project", "project_001.json");
    const envelope = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    envelope.payload = { title: "Tampered" };
    await writeFile(path, `${JSON.stringify(envelope)}\n`, "utf8");
    await assert.rejects(
      store.read("project", "project_001"),
      (error: unknown) => error instanceof StoreIntegrityError && error.message === "STORE_CONTENT_HASH_MISMATCH",
    );
  });
});

test("file project store rejects path traversal and non-JSON payloads", async () => {
  await withStore(async (store) => {
    await assert.rejects(store.create("project", "../escape", { title: "No" }), /STORE_ENTITY_ID_INVALID/u);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    await assert.rejects(store.create("project", "project_cycle", cyclic), /STORE_PAYLOAD_CYCLE_DETECTED/u);
  });
});

test("audit records remain bounded and contain no implicit source payload", async () => {
  await withStore(async (store, root) => {
    const event = await store.appendAuditEvent({
      actorId: "actor_owner",
      action: "project.created",
      entityType: "project",
      entityId: "project_001",
      revision: 1,
      requestId: "request_001",
      metadata: { sourceHash: "a".repeat(64), blocked: false, segmentCount: 14 },
      occurredAt: new Date("2026-07-27T00:00:00.000Z"),
    });
    assert.match(event.fingerprint, /^[a-f0-9]{64}$/u);
    const audit = await readFile(join(root, "audit", "2026-07-27.jsonl"), "utf8");
    assert.equal(audit.includes("sourceHash"), true);
    assert.equal(audit.includes("manuscriptText"), false);
    await assert.rejects(
      store.appendAuditEvent({
        actorId: "actor_owner",
        action: "project.updated",
        entityType: "project",
        entityId: "project_001",
        metadata: { manuscriptText: "x".repeat(501) },
      }),
      /STORE_AUDIT_METADATA_VALUE_TOO_LARGE/u,
    );
  });
});
