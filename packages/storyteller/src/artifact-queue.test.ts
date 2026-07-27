import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createArtifactRecord,
  verifyArtifactIntegrity,
  type ArtifactRecord,
} from "./artifact-registry.js";
import {
  ArtifactAdmissionError,
  artifactBackedCompletionPublicView,
  completeGenerationWithArtifacts,
} from "./artifact-queue.js";
import { FileGenerationQueue } from "./generation-queue.js";
import { FileProjectStore } from "./project-store.js";
import type { GenerationJob } from "./index.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:01:00.000Z");

const job: GenerationJob = {
  id: "job_artifact_queue_001",
  projectId: "project_artifact_queue_001",
  segmentId: "segment_artifact_queue_001",
  providerFallbackIds: ["provider_primary"],
  cacheKey: "a".repeat(64),
  candidateCount: 2,
  status: "ready",
};

function candidate(id: string, takeId: string, hashCharacter: string): ArtifactRecord {
  return createArtifactRecord({
    id,
    kind: "audio-candidate",
    projectId: job.projectId,
    jobId: job.id,
    segmentId: job.segmentId,
    takeId,
    storage: {
      driver: "private-object-store",
      provider: "s3-compatible-private",
      container: "storyteller-production",
      objectKey: `projects/${job.projectId}/jobs/${job.id}/takes/${takeId}.wav`,
      versionId: `private-${takeId}`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: hashCharacter.repeat(64),
      byteCount: 96_000,
      mimeType: "audio/wav",
      format: "wav",
    },
    provenance: {
      createdByActorId: "worker_artifact_queue_001",
      sourceContentHash: "b".repeat(64),
      generationRequestHash: "c".repeat(64),
      providerId: "provider_primary",
      adapterVersion: "1.0.0",
      providerRequestId: `private-provider-${takeId}`,
      parentArtifactIds: [],
    },
    rights: {
      rightsEvidenceId: "rights_artifact_queue_001",
      rightsFingerprint: "d".repeat(64),
      allowedUses: ["audiobook"],
      commercialUseApproved: true,
      expiresAt: "2028-07-27T00:00:00.000Z",
    },
  }, t0);
}

function verifiedCandidate(id: string, takeId: string, hashCharacter: string): ArtifactRecord {
  const record = candidate(id, takeId, hashCharacter);
  return verifyArtifactIntegrity(record, {
    observedContentHash: record.integrity.contentHash,
    observedByteCount: record.integrity.byteCount,
    checkedByActorId: "verifier_artifact_queue_001",
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: t1,
  });
}

async function withClaim(
  run: (
    queue: FileGenerationQueue,
    claim: NonNullable<Awaited<ReturnType<FileGenerationQueue["claimNext"]>>>,
  ) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-artifact-queue-"));
  try {
    const queue = new FileGenerationQueue(new FileProjectStore(root));
    await queue.enqueue(job, { now: t0 });
    const claim = await queue.claimNext({
      workerId: "worker_artifact_queue_001",
      leaseDurationMs: 120_000,
      now: t0,
    });
    if (!claim) throw new Error("queue claim required");
    await run(queue, claim);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("artifact-backed completion admits an exact verified candidate bundle", async () => {
  await withClaim(async (queue, claim) => {
    const first = verifiedCandidate("artifact_queue_take_001", "take_queue_001", "1");
    const second = verifiedCandidate("artifact_queue_take_002", "take_queue_002", "2");
    const result = await completeGenerationWithArtifacts({
      queue,
      claim,
      artifacts: [second, first],
      executionReportHash: "e".repeat(64),
      totalEstimatedCost: 0.08,
      currency: "AUD",
      now: new Date(t1.getTime() + 1_000),
    });

    assert.equal(result.envelope.payload.status, "completed");
    assert.deepEqual(result.artifactIds, ["artifact_queue_take_001", "artifact_queue_take_002"]);
    assert.deepEqual(result.candidateTakeIds, ["take_queue_001", "take_queue_002"]);
    assert.deepEqual(result.envelope.payload.completion?.outputArtifactRefs, result.artifactIds);
    assert.deepEqual(result.envelope.payload.completion?.resultIds, result.candidateTakeIds);
    assert.match(result.admissionFingerprint, /^[a-f0-9]{64}$/u);

    const publicView = artifactBackedCompletionPublicView(result);
    assert.deepEqual(publicView, {
      queueItemId: claim.item.id,
      jobId: job.id,
      status: "completed",
      artifactCount: 2,
      candidateCount: 2,
      admissionFingerprint: result.admissionFingerprint,
      revision: result.envelope.revision,
      completedAt: new Date(t1.getTime() + 1_000).toISOString(),
    });
    const serialised = JSON.stringify(publicView);
    assert.equal(serialised.includes("storyteller-production"), false);
    assert.equal(serialised.includes("providerRequestId"), false);
    assert.equal(serialised.includes(claim.leaseToken), false);
  });
});

test("unverified artifacts block completion without consuming the worker lease", async () => {
  await withClaim(async (queue, claim) => {
    const unverified = candidate("artifact_queue_take_003", "take_queue_003", "3");
    const verified = verifiedCandidate("artifact_queue_take_004", "take_queue_004", "4");
    await assert.rejects(
      completeGenerationWithArtifacts({
        queue,
        claim,
        artifacts: [unverified, verified],
        executionReportHash: "f".repeat(64),
        now: new Date(t1.getTime() + 2_000),
      }),
      (error: unknown) =>
        error instanceof ArtifactAdmissionError
        && error.assessment.findings.some((finding) => finding.code === "ARTIFACT_COMPLETION_NOT_VERIFIED"),
    );

    const current = await queue.read(claim.item.id);
    assert.equal(current?.payload.status, "leased");
    assert.equal(current?.revision, claim.envelope.revision);
  });
});

test("candidate-count and scope failures are reported before queue completion", async () => {
  await withClaim(async (queue, claim) => {
    const only = verifiedCandidate("artifact_queue_take_005", "take_queue_005", "5");
    await assert.rejects(
      completeGenerationWithArtifacts({
        queue,
        claim,
        artifacts: [only],
        executionReportHash: "6".repeat(64),
        now: new Date(t1.getTime() + 3_000),
      }),
      (error: unknown) =>
        error instanceof ArtifactAdmissionError
        && error.assessment.findings.some((finding) => finding.code === "ARTIFACT_CANDIDATE_COUNT_MISMATCH"),
    );
  });
});

test("completion accounting and report hashes fail closed before persistence", async () => {
  await withClaim(async (queue, claim) => {
    const artifacts = [
      verifiedCandidate("artifact_queue_take_006", "take_queue_006", "6"),
      verifiedCandidate("artifact_queue_take_007", "take_queue_007", "7"),
    ];
    await assert.rejects(
      completeGenerationWithArtifacts({
        queue,
        claim,
        artifacts,
        executionReportHash: "not-a-hash",
        now: new Date(t1.getTime() + 4_000),
      }),
      /ARTIFACT_COMPLETION_REPORT_HASH_INVALID/u,
    );
    await assert.rejects(
      completeGenerationWithArtifacts({
        queue,
        claim,
        artifacts,
        executionReportHash: "8".repeat(64),
        totalEstimatedCost: 0.1,
        now: new Date(t1.getTime() + 4_000),
      }),
      /ARTIFACT_COMPLETION_COST_CURRENCY_PAIR_REQUIRED/u,
    );
    const current = await queue.read(claim.item.id);
    assert.equal(current?.payload.status, "leased");
  });
});
