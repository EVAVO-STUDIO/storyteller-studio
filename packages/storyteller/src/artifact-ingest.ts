import { stableHash, type Finding } from "./index.js";
import {
  artifactPublicView,
  createArtifactRecord,
  quarantineArtifact,
  verifyArtifactIntegrity,
  type ArtifactKind,
  type ArtifactProvenance,
  type ArtifactPublicView,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
  type ArtifactVerificationStatus,
} from "./artifact-registry.js";
import {
  ArtifactStoreConflictError,
  FileArtifactRegistry,
} from "./artifact-store.js";
import {
  FilePrivateObjectStore,
  type FinalPrivateObject,
  type StagedPrivateObject,
} from "./private-object-store.js";
import type { StoredEnvelope } from "./project-store.js";

export interface ArtifactIngestInput {
  id: string;
  kind: ArtifactKind;
  projectId: string;
  jobId?: string;
  segmentId?: string;
  takeId?: string;
  bytes: Uint8Array;
  claimedMimeType?: string;
  claimedFormat?: string;
  provenance: ArtifactProvenance;
  rights: ArtifactRightsSnapshot;
  reviewRequired?: boolean;
  actorId: string;
  verifierActorId?: string;
  verificationChecks?: readonly string[];
  now?: Date;
}

export interface ArtifactIngestResult {
  envelope: StoredEnvelope<ArtifactRecord>;
  accepted: boolean;
  verificationStatus: ArtifactVerificationStatus;
  deduplicated: boolean;
  signature: string;
}

export interface ArtifactIngestPublicView {
  artifact: ArtifactPublicView;
  accepted: boolean;
  verificationStatus: ArtifactVerificationStatus;
  deduplicated: boolean;
  signature: string;
}

export class ArtifactIngestConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactIngestConflictError";
  }
}

const DEFAULT_VERIFICATION_CHECKS = Object.freeze([
  "sha256",
  "byte-count",
  "media-signature",
]);

function logicalArtifactFingerprint(record: ArtifactRecord): string {
  return stableHash({
    id: record.id,
    kind: record.kind,
    projectId: record.projectId,
    jobId: record.jobId ?? null,
    segmentId: record.segmentId ?? null,
    takeId: record.takeId ?? null,
    storage: record.storage,
    integrity: record.integrity,
    provenance: record.provenance,
    rights: record.rights,
    reviewRequired: record.review.required,
  });
}

function assertSameLogicalArtifact(
  existing: ArtifactRecord,
  proposed: ArtifactRecord,
): void {
  if (logicalArtifactFingerprint(existing) !== logicalArtifactFingerprint(proposed)) {
    throw new ArtifactIngestConflictError("ARTIFACT_INGEST_IDEMPOTENCY_CONFLICT");
  }
}

function mediaFindings(
  record: ArtifactRecord,
  observed: FinalPrivateObject,
): Finding[] {
  const findings: Finding[] = [];
  if (observed.integrity.mimeType !== record.integrity.mimeType) {
    findings.push({
      code: "ARTIFACT_MEDIA_MIME_MISMATCH",
      severity: "error",
      message: "Reinspected artifact media type does not match the registered immutable media type.",
    });
  }
  if (observed.integrity.format !== record.integrity.format) {
    findings.push({
      code: "ARTIFACT_MEDIA_FORMAT_MISMATCH",
      severity: "error",
      message: "Reinspected artifact format does not match the registered immutable format.",
    });
  }
  if (!observed.signature.trim()) {
    findings.push({
      code: "ARTIFACT_MEDIA_SIGNATURE_MISSING",
      severity: "error",
      message: "Reinspected artifact does not have an accepted media signature.",
    });
  }
  return findings;
}

async function resolvePendingEnvelope(
  registry: FileArtifactRegistry,
  proposed: ArtifactRecord,
  actorId: string,
): Promise<StoredEnvelope<ArtifactRecord>> {
  const existing = await registry.read(proposed.id);
  if (existing) {
    assertSameLogicalArtifact(existing.payload, proposed);
    return existing;
  }

  try {
    return await registry.create(proposed, {
      actorId,
      action: "artifact.ingest_registered",
    });
  } catch (error) {
    if (!(error instanceof ArtifactStoreConflictError)) throw error;
    const raced = await registry.read(proposed.id);
    if (!raced) throw error;
    assertSameLogicalArtifact(raced.payload, proposed);
    return raced;
  }
}

async function saveVerificationRevision(
  registry: FileArtifactRegistry,
  current: StoredEnvelope<ArtifactRecord>,
  next: ArtifactRecord,
  actorId: string,
): Promise<StoredEnvelope<ArtifactRecord>> {
  try {
    return await registry.save(next, {
      expectedRevision: current.revision,
      actorId,
      action: next.verification.status === "verified"
        ? "artifact.ingest_verified"
        : "artifact.ingest_quarantined",
    });
  } catch (error) {
    if (!(error instanceof ArtifactStoreConflictError)) throw error;
    const raced = await registry.require(current.payload.id);
    assertSameLogicalArtifact(raced.payload, current.payload);
    if (raced.payload.verification.status === "pending") throw error;
    return raced;
  }
}

function resultFrom(
  envelope: StoredEnvelope<ArtifactRecord>,
  finalObject: FinalPrivateObject,
): ArtifactIngestResult {
  return Object.freeze({
    envelope,
    accepted: envelope.payload.verification.status === "verified",
    verificationStatus: envelope.payload.verification.status,
    deduplicated: finalObject.deduplicated,
    signature: finalObject.signature,
  });
}

export async function ingestPrivateArtifact(
  objectStore: FilePrivateObjectStore,
  registry: FileArtifactRegistry,
  input: ArtifactIngestInput,
): Promise<ArtifactIngestResult> {
  const now = input.now ?? new Date();
  const verifierActorId = input.verifierActorId ?? input.actorId;
  let staged: StagedPrivateObject | undefined;

  try {
    staged = await objectStore.stage({
      bytes: input.bytes,
      ...(input.claimedMimeType ? { claimedMimeType: input.claimedMimeType } : {}),
      ...(input.claimedFormat ? { claimedFormat: input.claimedFormat } : {}),
      now,
    });
    const finalObject = await objectStore.promote(staged, now);
    staged = undefined;

    const proposed = createArtifactRecord({
      id: input.id,
      kind: input.kind,
      projectId: input.projectId,
      ...(input.jobId ? { jobId: input.jobId } : {}),
      ...(input.segmentId ? { segmentId: input.segmentId } : {}),
      ...(input.takeId ? { takeId: input.takeId } : {}),
      storage: finalObject.storage,
      integrity: finalObject.integrity,
      provenance: input.provenance,
      rights: input.rights,
      ...(input.reviewRequired !== undefined
        ? { reviewRequired: input.reviewRequired }
        : {}),
    }, now);

    let envelope = await resolvePendingEnvelope(registry, proposed, input.actorId);
    if (envelope.payload.verification.status !== "pending") {
      return resultFrom(envelope, finalObject);
    }

    let inspected: FinalPrivateObject;
    try {
      inspected = await objectStore.inspect(finalObject.storage.objectKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNKNOWN";
      const quarantined = quarantineArtifact(envelope.payload, {
        code: "ARTIFACT_OBJECT_REINSPECTION_FAILED",
        message: "Promoted artifact bytes could not be reinspected after storage promotion.",
        actorId: verifierActorId,
        findings: [{
          code: "ARTIFACT_OBJECT_REINSPECTION_FAILED",
          severity: "error",
          message: `Private object reinspection failed with code: ${message.slice(0, 180)}.`,
        }],
        quarantinedAt: now,
      });
      envelope = await saveVerificationRevision(
        registry,
        envelope,
        quarantined,
        verifierActorId,
      );
      return resultFrom(envelope, finalObject);
    }

    const checks = Object.freeze([
      ...new Set([
        ...DEFAULT_VERIFICATION_CHECKS,
        ...(input.verificationChecks ?? []),
      ]),
    ]);
    const verified = verifyArtifactIntegrity(envelope.payload, {
      observedContentHash: inspected.integrity.contentHash,
      observedByteCount: inspected.integrity.byteCount,
      checkedByActorId: verifierActorId,
      checks,
      findings: mediaFindings(envelope.payload, inspected),
      checkedAt: now,
    });
    envelope = await saveVerificationRevision(
      registry,
      envelope,
      verified,
      verifierActorId,
    );
    return resultFrom(envelope, finalObject);
  } catch (error) {
    if (staged) {
      try {
        await objectStore.discard(staged);
      } catch {
        // Preserve the primary failure. Staging cleanup is safe to retry by retention maintenance.
      }
    }
    throw error;
  }
}

export function artifactIngestPublicView(
  result: ArtifactIngestResult,
): ArtifactIngestPublicView {
  return Object.freeze({
    artifact: artifactPublicView(result.envelope.payload),
    accepted: result.accepted,
    verificationStatus: result.verificationStatus,
    deduplicated: result.deduplicated,
    signature: result.signature,
  });
}
