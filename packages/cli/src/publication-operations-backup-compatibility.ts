import { stableHash } from "@evavo/storyteller-engine";
import {
  AUDIOBOOK_RETAIL_PUBLICATION_ALERT_SCHEMA_VERSION,
} from "@evavo/storyteller-engine/audiobook-retail-publication-alert";
import {
  AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_SCHEMA_VERSION,
  AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REQUEST_SCHEMA_VERSION,
} from "@evavo/storyteller-engine/audiobook-retail-publication-evidence-inbox";
import {
  AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_SCHEMA_VERSION,
} from "@evavo/storyteller-engine/audiobook-retail-publication-monitor";

export const PUBLICATION_OPERATIONS_DURABLE_SCHEMA_CONTRACT_VERSION =
  "storyteller-publication-operations-durable-schema-v1" as const;

export const PUBLICATION_OPERATIONS_DURABLE_SCHEMA_FINGERPRINT = stableHash({
  contractVersion: PUBLICATION_OPERATIONS_DURABLE_SCHEMA_CONTRACT_VERSION,
  storeEnvelopeSchema: "storyteller-store-v1",
  auditSchema: "storyteller-audit-v1",
  monitorSchema: AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_SCHEMA_VERSION,
  alertSchema: AUDIOBOOK_RETAIL_PUBLICATION_ALERT_SCHEMA_VERSION,
  evidenceRequestSchema:
    AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REQUEST_SCHEMA_VERSION,
  evidenceInboxSchema:
    AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_SCHEMA_VERSION,
  entityTypes: Object.freeze([
    "audiobook-retail-publication-monitor",
    "audiobook-retail-publication-alert",
    "audiobook-retail-publication-evidence-inbox",
  ]),
});

export interface PublicationOperationsBackupCompatibilityIdentity {
  applicationRevision: string;
  durableSchemaContractVersion:
    typeof PUBLICATION_OPERATIONS_DURABLE_SCHEMA_CONTRACT_VERSION;
  durableSchemaFingerprint: string;
  fingerprint: string;
}

export interface PublicationOperationsRestoreCompatibilityApproval {
  approvedByActorId: string;
  evidenceReferenceHash: string;
  approvedAt: Date;
}

export interface PublicationOperationsRestoreCompatibilityResult {
  mode: "exact-revision" | "approved-compatible-revision";
  compatibilityApprovalFingerprint?: string;
}

export class PublicationOperationsBackupCompatibilityError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PublicationOperationsBackupCompatibilityError";
    this.code = code;
  }
}

const APPLICATION_REVISION_PATTERN = /^[a-f0-9]{40}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;

function requireApplicationRevision(value: string): string {
  if (!APPLICATION_REVISION_PATTERN.test(value)) {
    throw new PublicationOperationsBackupCompatibilityError(
      "PUBLICATION_OPERATIONS_BACKUP_APPLICATION_REVISION_INVALID",
    );
  }
  return value;
}

function identityFingerprint(
  value: Omit<PublicationOperationsBackupCompatibilityIdentity, "fingerprint">,
): string {
  return stableHash(value);
}

export function createPublicationOperationsBackupCompatibilityIdentity(
  applicationRevision: string,
): PublicationOperationsBackupCompatibilityIdentity {
  const partial: Omit<
    PublicationOperationsBackupCompatibilityIdentity,
    "fingerprint"
  > = {
    applicationRevision: requireApplicationRevision(applicationRevision),
    durableSchemaContractVersion:
      PUBLICATION_OPERATIONS_DURABLE_SCHEMA_CONTRACT_VERSION,
    durableSchemaFingerprint:
      PUBLICATION_OPERATIONS_DURABLE_SCHEMA_FINGERPRINT,
  };
  return Object.freeze({
    ...partial,
    fingerprint: identityFingerprint(partial),
  });
}

export function assertPublicationOperationsBackupCompatibilityIdentity(
  identity: PublicationOperationsBackupCompatibilityIdentity,
): void {
  requireApplicationRevision(identity.applicationRevision);
  if (
    identity.durableSchemaContractVersion
      !== PUBLICATION_OPERATIONS_DURABLE_SCHEMA_CONTRACT_VERSION
    || identity.durableSchemaFingerprint
      !== PUBLICATION_OPERATIONS_DURABLE_SCHEMA_FINGERPRINT
  ) {
    throw new PublicationOperationsBackupCompatibilityError(
      "PUBLICATION_OPERATIONS_RESTORE_DURABLE_SCHEMA_INCOMPATIBLE",
    );
  }
  if (!HASH_PATTERN.test(identity.fingerprint)) {
    throw new PublicationOperationsBackupCompatibilityError(
      "PUBLICATION_OPERATIONS_BACKUP_COMPATIBILITY_FINGERPRINT_INVALID",
    );
  }
  const { fingerprint, ...partial } = identity;
  if (identityFingerprint(partial) !== fingerprint) {
    throw new PublicationOperationsBackupCompatibilityError(
      "PUBLICATION_OPERATIONS_BACKUP_COMPATIBILITY_FINGERPRINT_MISMATCH",
    );
  }
}

export function resolvePublicationOperationsRestoreCompatibility(
  input: Readonly<{
    snapshot: PublicationOperationsBackupCompatibilityIdentity;
    applicationRevision: string;
    approval?: PublicationOperationsRestoreCompatibilityApproval;
  }>,
): PublicationOperationsRestoreCompatibilityResult {
  assertPublicationOperationsBackupCompatibilityIdentity(input.snapshot);
  const applicationRevision = requireApplicationRevision(
    input.applicationRevision,
  );
  if (input.snapshot.applicationRevision === applicationRevision) {
    return Object.freeze({ mode: "exact-revision" });
  }
  if (!input.approval) {
    throw new PublicationOperationsBackupCompatibilityError(
      "PUBLICATION_OPERATIONS_RESTORE_APPLICATION_REVISION_MISMATCH",
    );
  }
  if (!SAFE_IDENTIFIER.test(input.approval.approvedByActorId)) {
    throw new PublicationOperationsBackupCompatibilityError(
      "PUBLICATION_OPERATIONS_RESTORE_COMPATIBILITY_APPROVER_INVALID",
    );
  }
  if (!HASH_PATTERN.test(input.approval.evidenceReferenceHash)) {
    throw new PublicationOperationsBackupCompatibilityError(
      "PUBLICATION_OPERATIONS_RESTORE_COMPATIBILITY_EVIDENCE_INVALID",
    );
  }
  if (Number.isNaN(input.approval.approvedAt.getTime())) {
    throw new PublicationOperationsBackupCompatibilityError(
      "PUBLICATION_OPERATIONS_RESTORE_COMPATIBILITY_DATE_INVALID",
    );
  }
  return Object.freeze({
    mode: "approved-compatible-revision",
    compatibilityApprovalFingerprint: stableHash({
      snapshotApplicationRevision: input.snapshot.applicationRevision,
      targetApplicationRevision: applicationRevision,
      durableSchemaFingerprint: input.snapshot.durableSchemaFingerprint,
      approvedByActorId: input.approval.approvedByActorId,
      evidenceReferenceHash: input.approval.evidenceReferenceHash,
      approvedAt: input.approval.approvedAt.toISOString(),
    }),
  });
}
