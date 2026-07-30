import assert from "node:assert/strict";
import test from "node:test";
import {
  PUBLICATION_OPERATIONS_DURABLE_SCHEMA_FINGERPRINT,
  createPublicationOperationsBackupCompatibilityIdentity,
  resolvePublicationOperationsRestoreCompatibility,
} from "./publication-operations-backup-compatibility.js";

const revisionA = "1".repeat(40);
const revisionB = "2".repeat(40);
const approvedAt = new Date("2026-07-30T02:00:00.000Z");

test("backup compatibility identity binds one exact application and durable schema", () => {
  const identity = createPublicationOperationsBackupCompatibilityIdentity(revisionA);
  assert.equal(identity.applicationRevision, revisionA);
  assert.equal(
    identity.durableSchemaFingerprint,
    PUBLICATION_OPERATIONS_DURABLE_SCHEMA_FINGERPRINT,
  );
  assert.match(identity.fingerprint, /^[a-f0-9]{64}$/u);
  assert.throws(
    () => createPublicationOperationsBackupCompatibilityIdentity("main"),
    /PUBLICATION_OPERATIONS_BACKUP_APPLICATION_REVISION_INVALID/u,
  );
});

test("restore compatibility accepts the exact creating application revision", () => {
  const result = resolvePublicationOperationsRestoreCompatibility({
    snapshot: createPublicationOperationsBackupCompatibilityIdentity(revisionA),
    applicationRevision: revisionA,
  });
  assert.deepEqual(result, { mode: "exact-revision" });
});

test("cross-revision restore requires a bound human compatibility approval", () => {
  const snapshot = createPublicationOperationsBackupCompatibilityIdentity(revisionA);
  assert.throws(
    () => resolvePublicationOperationsRestoreCompatibility({
      snapshot,
      applicationRevision: revisionB,
    }),
    /PUBLICATION_OPERATIONS_RESTORE_APPLICATION_REVISION_MISMATCH/u,
  );
  const result = resolvePublicationOperationsRestoreCompatibility({
    snapshot,
    applicationRevision: revisionB,
    approval: {
      approvedByActorId: "publication_compatibility_reviewer_001",
      evidenceReferenceHash: "a".repeat(64),
      approvedAt,
    },
  });
  assert.equal(result.mode, "approved-compatible-revision");
  assert.match(
    result.compatibilityApprovalFingerprint ?? "",
    /^[a-f0-9]{64}$/u,
  );
  const serialised = JSON.stringify(result);
  assert.equal(serialised.includes("publication_compatibility_reviewer_001"), false);
  assert.equal(serialised.includes(revisionA), false);
  assert.equal(serialised.includes(revisionB), false);
});

test("durable schema drift cannot be bypassed by a compatibility approval", () => {
  const snapshot = {
    ...createPublicationOperationsBackupCompatibilityIdentity(revisionA),
    durableSchemaFingerprint: "f".repeat(64),
  };
  assert.throws(
    () => resolvePublicationOperationsRestoreCompatibility({
      snapshot,
      applicationRevision: revisionB,
      approval: {
        approvedByActorId: "publication_compatibility_reviewer_001",
        evidenceReferenceHash: "a".repeat(64),
        approvedAt,
      },
    }),
    /PUBLICATION_OPERATIONS_RESTORE_DURABLE_SCHEMA_INCOMPATIBLE/u,
  );
});
