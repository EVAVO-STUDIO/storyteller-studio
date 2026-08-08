import assert from "node:assert/strict";
import test from "node:test";
import {
  assertArtifactRecord,
  createArtifactRecord,
  recordArtifactReview,
  verifyArtifactIntegrity,
  type ArtifactRecord,
} from "./artifact-registry.js";

const createdAt = new Date("2026-08-08T00:00:00.000Z");
const verifiedAt = new Date("2026-08-08T00:01:00.000Z");
const reviewedAt = new Date("2026-08-08T00:02:00.000Z");

function verifiedCandidate(): ArtifactRecord {
  const created = createArtifactRecord({
    id: "artifact_review_separation_001",
    kind: "audio-candidate",
    projectId: "project_review_separation_001",
    jobId: "job_review_separation_001",
    segmentId: "segment_review_separation_001",
    takeId: "take_review_separation_001",
    storage: {
      driver: "private-object-store",
      provider: "s3-compatible-private",
      container: "storyteller-production",
      objectKey: "projects/project_review_separation_001/jobs/job_review_separation_001/takes/take_review_separation_001.wav",
      versionId: "version_review_separation_001",
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: "a".repeat(64),
      byteCount: 96_000,
      mimeType: "audio/wav",
      format: "wav",
    },
    provenance: {
      createdByActorId: "worker_review_separation_001",
      sourceContentHash: "b".repeat(64),
      generationRequestHash: "c".repeat(64),
      providerId: "provider_review_separation_001",
      adapterVersion: "1.0.0",
      providerRequestId: "provider-request-review-separation-001",
      parentArtifactIds: [],
    },
    rights: {
      rightsEvidenceId: "rights_review_separation_001",
      rightsFingerprint: "d".repeat(64),
      allowedUses: ["audiobook"],
      commercialUseApproved: true,
      expiresAt: "2028-08-08T00:00:00.000Z",
      retainUntil: "2033-08-08T00:00:00.000Z",
      deletionRequiredAt: "2034-08-08T00:00:00.000Z",
    },
  }, createdAt);

  return verifyArtifactIntegrity(created, {
    observedContentHash: created.integrity.contentHash,
    observedByteCount: created.integrity.byteCount,
    checkedByActorId: "verifier_review_separation_001",
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: verifiedAt,
  });
}

test("artifact creators cannot approve or request changes on their own artifacts", () => {
  const artifact = verifiedCandidate();

  for (const decision of ["approved", "changes-requested"] as const) {
    assert.throws(
      () => recordArtifactReview(artifact, {
        decision,
        reviewerId: artifact.provenance.createdByActorId,
        notes: "A creator cannot satisfy the independent human review gate.",
        decidedAt: reviewedAt,
      }),
      /ARTIFACT_REVIEWER_CREATOR_CONFLICT/u,
    );
  }

  assert.equal(artifact.review.status, "pending");
  assert.equal(artifact.revision, 2);
});

test("integrity verifiers cannot approve or request changes on artifacts they verified", () => {
  const artifact = verifiedCandidate();
  const verifierId = artifact.verification.checkedByActorId;
  if (!verifierId) throw new Error("TEST_VERIFIER_ID_REQUIRED");

  for (const decision of ["approved", "changes-requested"] as const) {
    assert.throws(
      () => recordArtifactReview(artifact, {
        decision,
        reviewerId: verifierId,
        notes: "A byte verifier cannot satisfy the independent performance review gate.",
        decidedAt: reviewedAt,
      }),
      /ARTIFACT_REVIEWER_VERIFIER_CONFLICT/u,
    );
  }

  assert.equal(artifact.review.status, "pending");
  assert.equal(artifact.revision, 2);
});

test("an independent reviewer can approve a verified artifact through a linked revision", () => {
  const artifact = verifiedCandidate();
  const approved = recordArtifactReview(artifact, {
    decision: "approved",
    reviewerId: "director_review_separation_001",
    notes: "Approved after listening in manuscript and neighbouring-scene context.",
    decidedAt: reviewedAt,
  });

  assert.equal(approved.review.status, "approved");
  assert.equal(approved.review.reviewerId, "director_review_separation_001");
  assert.equal(approved.previousFingerprint, artifact.fingerprint);
  assert.equal(approved.revision, artifact.revision + 1);
  assert.doesNotThrow(() => assertArtifactRecord(approved));
});
