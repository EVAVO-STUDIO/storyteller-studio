import assert from "node:assert/strict";
import test from "node:test";
import {
  artifactPublicView,
  assessArtifactRelease,
  assessQueueCompletionArtifacts,
  assertArtifactRecord,
  confirmArtifactRelease,
  createArtifactRecord,
  quarantineArtifact,
  recordArtifactReview,
  rejectArtifact,
  verifyArtifactIntegrity,
  type ArtifactRecord,
  type CreateArtifactRecordInput,
} from "./artifact-registry.js";
import type { GenerationJob } from "./index.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:01:00.000Z");
const t2 = new Date("2026-07-27T00:02:00.000Z");
const t3 = new Date("2026-07-27T00:03:00.000Z");

const job: GenerationJob = {
  id: "job_artifact_001",
  projectId: "project_artifact_001",
  segmentId: "segment_artifact_001",
  providerFallbackIds: ["provider_primary"],
  cacheKey: "f".repeat(64),
  candidateCount: 2,
  status: "ready",
};

function rights(overrides: Partial<CreateArtifactRecordInput["rights"]> = {}): CreateArtifactRecordInput["rights"] {
  return {
    rightsEvidenceId: "rights_artifact_001",
    rightsFingerprint: "e".repeat(64),
    allowedUses: ["audiobook"],
    commercialUseApproved: true,
    expiresAt: "2028-07-27T00:00:00.000Z",
    retainUntil: "2033-07-27T00:00:00.000Z",
    deletionRequiredAt: "2034-07-27T00:00:00.000Z",
    ...overrides,
  };
}

function candidateInput(
  id: string,
  takeId: string,
  hashCharacter: string,
  overrides: Partial<CreateArtifactRecordInput> = {},
): CreateArtifactRecordInput {
  return {
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
      versionId: `private-version-${takeId}`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: hashCharacter.repeat(64),
      byteCount: 48_000,
      mimeType: "audio/wav",
      format: "wav",
    },
    provenance: {
      createdByActorId: "worker_artifact_001",
      sourceContentHash: "d".repeat(64),
      generationRequestHash: "c".repeat(64),
      providerId: "provider_primary",
      adapterVersion: "1.0.0",
      providerRequestId: `private-provider-request-${takeId}`,
      parentArtifactIds: [],
    },
    rights: rights(),
    ...overrides,
  };
}

function createCandidate(id: string, takeId: string, hashCharacter: string): ArtifactRecord {
  return createArtifactRecord(candidateInput(id, takeId, hashCharacter), t0);
}

function verify(record: ArtifactRecord, at = t1): ArtifactRecord {
  return verifyArtifactIntegrity(record, {
    observedContentHash: record.integrity.contentHash,
    observedByteCount: record.integrity.byteCount,
    checkedByActorId: "verifier_artifact_001",
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: at,
  });
}

function approve(record: ArtifactRecord, at = t2): ArtifactRecord {
  if (!record.review.required) return record;
  return recordArtifactReview(record, {
    decision: "approved",
    reviewerId: "reviewer_artifact_001",
    notes: "Approved in context against the immutable source and neighbouring material.",
    decidedAt: at,
  });
}

test("artifact records are fingerprinted while public views redact private storage and provider references", () => {
  const record = createCandidate("artifact_take_001", "take_001", "a");
  assert.equal(record.verification.status, "pending");
  assert.equal(record.review.status, "pending");
  assert.match(record.fingerprint, /^[a-f0-9]{64}$/u);
  assert.doesNotThrow(() => assertArtifactRecord(record));

  const view = artifactPublicView(record);
  const serialised = JSON.stringify(view);
  assert.equal(serialised.includes(record.storage.objectKey), false);
  assert.equal(serialised.includes(record.storage.versionId!), false);
  assert.equal(serialised.includes(record.storage.container), false);
  assert.equal(serialised.includes(record.provenance.providerRequestId!), false);
  assert.equal(view.storage.provider, "s3-compatible-private");
  assert.equal(view.integrity.contentHash, record.integrity.contentHash);
});

test("artifact storage references reject URLs, traversal, queries and absolute paths", () => {
  for (const objectKey of [
    "https://storage.example/private.wav",
    "projects/../private.wav",
    "projects/private.wav?token=secret",
    "/absolute/private.wav",
    "projects\\private.wav",
  ]) {
    assert.throws(
      () => createArtifactRecord(candidateInput("artifact_unsafe_001", "take_unsafe_001", "a", {
        storage: {
          ...candidateInput("artifact_unsafe_001", "take_unsafe_001", "a").storage,
          objectKey,
        },
      }), t0),
      /ARTIFACT_STORAGE_OBJECT_KEY_UNSAFE/u,
    );
  }
});

test("integrity verification and human review create linked non-destructive revisions", () => {
  const pending = createCandidate("artifact_take_002", "take_002", "b");
  const verified = verify(pending);
  assert.equal(verified.revision, 2);
  assert.equal(verified.previousFingerprint, pending.fingerprint);
  assert.equal(verified.verification.status, "verified");
  assert.equal(verified.verification.observedContentHash, pending.integrity.contentHash);

  const approved = approve(verified);
  assert.equal(approved.revision, 3);
  assert.equal(approved.previousFingerprint, verified.fingerprint);
  assert.equal(approved.review.status, "approved");
  assert.doesNotThrow(() => assertArtifactRecord(approved));
});

test("hash or byte mismatches quarantine an artifact and prevent approval", () => {
  const pending = createCandidate("artifact_take_003", "take_003", "c");
  const quarantined = verifyArtifactIntegrity(pending, {
    observedContentHash: "9".repeat(64),
    observedByteCount: pending.integrity.byteCount - 1,
    checkedByActorId: "verifier_artifact_001",
    checks: ["sha256", "byte-count"],
    checkedAt: t1,
  });
  assert.equal(quarantined.verification.status, "quarantined");
  assert.equal(quarantined.quarantine?.code, "ARTIFACT_INTEGRITY_VERIFICATION_FAILED");
  assert.equal(quarantined.verification.findings.some((finding) => finding.code === "ARTIFACT_CONTENT_HASH_MISMATCH"), true);
  assert.equal(quarantined.verification.findings.some((finding) => finding.code === "ARTIFACT_BYTE_COUNT_MISMATCH"), true);
  assert.throws(
    () => approve(quarantined),
    /ARTIFACT_REVIEW_REQUIRES_VERIFIED_ARTIFACT/u,
  );

  const rejected = rejectArtifact(quarantined, {
    actorId: "reviewer_artifact_001",
    reason: "The stored object does not match its immutable artifact registration.",
    rejectedAt: t2,
  });
  assert.equal(rejected.verification.status, "rejected");
  assert.equal(rejected.quarantine?.code, "ARTIFACT_REJECTED");
});

test("manual quarantine invalidates prior review and release state", () => {
  const approved = approve(verify(createCandidate("artifact_take_004", "take_004", "4")));
  const quarantined = quarantineArtifact(approved, {
    code: "ARTIFACT_MALWARE_SCAN_REVIEW",
    message: "A later safety scan requires the object to be isolated before further use.",
    actorId: "security_artifact_001",
    findings: [{
      code: "ARTIFACT_SAFETY_REVIEW_REQUIRED",
      severity: "error",
      message: "Artifact requires manual safety investigation.",
    }],
    quarantinedAt: t3,
  });
  assert.equal(quarantined.verification.status, "quarantined");
  assert.equal(quarantined.review.status, "pending");
  assert.equal(quarantined.release.status, "unavailable");
});

test("generation completion requires the exact verified candidate bundle and matching scope", () => {
  const first = verify(createCandidate("artifact_take_005", "take_005", "5"));
  const second = verify(createCandidate("artifact_take_006", "take_006", "6"));
  const accepted = assessQueueCompletionArtifacts(job, [first, second], { now: t2 });
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.artifactIds, ["artifact_take_005", "artifact_take_006"]);

  const incomplete = assessQueueCompletionArtifacts(job, [first], { now: t2 });
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.findings.some((finding) => finding.code === "ARTIFACT_CANDIDATE_COUNT_MISMATCH"), true);

  const wrongScope = verify(createArtifactRecord(candidateInput("artifact_take_007", "take_007", "7", {
    projectId: "project_other_001",
  }), t0));
  const mismatched = assessQueueCompletionArtifacts(job, [first, wrongScope], { now: t2 });
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.findings.some((finding) => finding.code === "ARTIFACT_COMPLETION_SCOPE_MISMATCH"), true);
});

test("mastered chapters require audio integrity, parent provenance and human review", () => {
  const source = approve(verify(createArtifactRecord({
    id: "artifact_mastered_source_001",
    kind: "chapter-master",
    projectId: job.projectId,
    storage: {
      driver: "private-object-store",
      provider: "s3-compatible-private",
      container: "storyteller-production",
      objectKey: `projects/${job.projectId}/chapters/chapter_001/pre-master.wav`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: "1".repeat(64),
      byteCount: 960_000,
      mimeType: "audio/wav",
      format: "wav",
    },
    provenance: {
      createdByActorId: "assembler_artifact_001",
      sourceContentHash: "d".repeat(64),
      parentArtifactIds: ["artifact_take_001"],
    },
    rights: rights(),
  }, t0)));
  const mastered = createArtifactRecord({
    id: "artifact_mastered_chapter_001",
    kind: "mastered-chapter",
    projectId: job.projectId,
    segmentId: "chapter_001",
    takeId: "mastered_take_001",
    storage: {
      driver: "private-object-store",
      provider: "s3-compatible-private",
      container: "storyteller-production",
      objectKey: `projects/${job.projectId}/chapters/chapter_001/mastered.wav`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: "2".repeat(64),
      byteCount: 960_000,
      mimeType: "audio/wav",
      format: "wav",
    },
    provenance: {
      createdByActorId: "mastering_artifact_001",
      sourceContentHash: source.integrity.contentHash,
      generationRequestHash: "3".repeat(64),
      parentArtifactIds: [source.id],
    },
    rights: rights(),
  }, t1);
  assert.equal(mastered.review.required, true);
  assert.equal(mastered.review.status, "pending");
  assert.doesNotThrow(() => assertArtifactRecord(mastered));

  assert.throws(
    () => createArtifactRecord({
      ...candidateInput("artifact_mastered_invalid_001", "take_mastered_invalid_001", "4"),
      kind: "mastered-chapter",
      provenance: {
        createdByActorId: "mastering_artifact_001",
        parentArtifactIds: [],
      },
    }, t1),
    /ARTIFACT_PARENT_REQUIRED/u,
  );
});

test("credit masters require audio integrity, parent provenance and human review", () => {
  const source = approve(verify(createCandidate(
    "artifact_credit_master_source_001",
    "take_credit_master_source_001",
    "d",
  )));
  const creditMaster = createArtifactRecord({
    id: "artifact_credit_master_001",
    kind: "credit-master",
    projectId: job.projectId,
    segmentId: "credit_opening_001",
    takeId: "take_credit_master_001",
    storage: {
      driver: "private-object-store",
      provider: "s3-compatible-private",
      container: "storyteller-production",
      objectKey: `projects/${job.projectId}/credits/opening/master.wav`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: "e".repeat(64),
      byteCount: 480_000,
      mimeType: "audio/wav",
      format: "wav",
    },
    provenance: {
      createdByActorId: "credit_master_artifact_001",
      sourceContentHash: source.integrity.contentHash,
      generationRequestHash: "f".repeat(64),
      parentArtifactIds: [source.id],
    },
    rights: rights(),
  }, t1);
  assert.equal(creditMaster.review.required, true);
  assert.equal(creditMaster.review.status, "pending");
  assert.doesNotThrow(() => assertArtifactRecord(creditMaster));

  assert.throws(
    () => createArtifactRecord({
      ...candidateInput(
        "artifact_credit_master_invalid_001",
        "take_credit_master_invalid_001",
        "9",
      ),
      kind: "credit-master",
      provenance: {
        createdByActorId: "credit_master_artifact_001",
        parentArtifactIds: [],
      },
    }, t1),
    /ARTIFACT_PARENT_REQUIRED/u,
  );
});

test("audiobook reference masters require audio integrity, parent provenance and human review", () => {
  const reference = createArtifactRecord({
    id: "artifact_audiobook_reference_master_001",
    kind: "audiobook-reference-master",
    projectId: job.projectId,
    jobId: "job_audiobook_reference_001",
    segmentId: "book_reference_001",
    takeId: "take_audiobook_reference_001",
    storage: {
      driver: "private-object-store",
      provider: "s3-compatible-private",
      container: "storyteller-production",
      objectKey: `projects/${job.projectId}/books/book_reference_001/reference-master.wav`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: "a".repeat(64),
      byteCount: 4_800_000,
      mimeType: "audio/wav",
      format: "wav",
    },
    provenance: {
      createdByActorId: "audiobook_reference_master_001",
      sourceContentHash: "b".repeat(64),
      generationRequestHash: "c".repeat(64),
      parentArtifactIds: [
        "artifact_audiobook_sequence_001",
        "artifact_audiobook_render_evidence_001",
      ],
    },
    rights: rights(),
  }, t1);
  assert.equal(reference.review.required, true);
  assert.equal(reference.review.status, "pending");
  assert.doesNotThrow(() => assertArtifactRecord(reference));

  assert.throws(
    () => createArtifactRecord({
      ...candidateInput(
        "artifact_audiobook_reference_non_audio_001",
        "take_audiobook_reference_non_audio_001",
        "8",
      ),
      kind: "audiobook-reference-master",
      integrity: {
        algorithm: "sha256",
        contentHash: "8".repeat(64),
        byteCount: 128,
        mimeType: "application/json",
        format: "json",
      },
      provenance: {
        createdByActorId: "audiobook_reference_master_001",
        parentArtifactIds: ["artifact_audiobook_sequence_001"],
      },
    }, t1),
    /ARTIFACT_AUDIO_MIME_REQUIRED/u,
  );

  assert.throws(
    () => createArtifactRecord({
      ...candidateInput(
        "artifact_audiobook_reference_parentless_001",
        "take_audiobook_reference_parentless_001",
        "9",
      ),
      kind: "audiobook-reference-master",
      provenance: {
        createdByActorId: "audiobook_reference_master_001",
        parentArtifactIds: [],
      },
    }, t1),
    /ARTIFACT_PARENT_REQUIRED/u,
  );
});

test("audiobook retail tracks require MP3 integrity, parent provenance and human review", () => {
  const retailTrack = createArtifactRecord({
    id: "artifact_audiobook_retail_track_001",
    kind: "audiobook-retail-track",
    projectId: job.projectId,
    jobId: "job_audiobook_retail_track_001",
    segmentId: "retail_track_0001",
    takeId: "retail_encode_0001",
    storage: {
      driver: "private-object-store",
      provider: "s3-compatible-private",
      container: "storyteller-production",
      objectKey: `projects/${job.projectId}/retail/0001OpeningCredits.mp3`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: "6".repeat(64),
      byteCount: 192_000,
      mimeType: "audio/mpeg",
      format: "mp3",
    },
    provenance: {
      createdByActorId: "retail_encoder_artifact_001",
      sourceContentHash: "7".repeat(64),
      generationRequestHash: "8".repeat(64),
      parentArtifactIds: [
        "artifact_audiobook_reference_master_001",
        "artifact_audiobook_retail_render_evidence_001",
      ],
    },
    rights: rights(),
  }, t1);
  assert.equal(retailTrack.review.required, true);
  assert.equal(retailTrack.review.status, "pending");
  assert.equal(retailTrack.integrity.mimeType, "audio/mpeg");
  assert.equal(retailTrack.integrity.format, "mp3");
  assert.doesNotThrow(() => assertArtifactRecord(retailTrack));

  assert.throws(
    () => createArtifactRecord({
      ...candidateInput(
        "artifact_audiobook_retail_wav_001",
        "retail_encode_wav_001",
        "7",
      ),
      kind: "audiobook-retail-track",
      provenance: {
        createdByActorId: "retail_encoder_artifact_001",
        parentArtifactIds: ["artifact_audiobook_reference_master_001"],
      },
    }, t1),
    /ARTIFACT_RETAIL_TRACK_MP3_REQUIRED/u,
  );

  assert.throws(
    () => createArtifactRecord({
      ...candidateInput(
        "artifact_audiobook_retail_parentless_001",
        "retail_encode_parentless_001",
        "8",
      ),
      kind: "audiobook-retail-track",
      integrity: {
        algorithm: "sha256",
        contentHash: "8".repeat(64),
        byteCount: 192_000,
        mimeType: "audio/mpeg",
        format: "mp3",
      },
      provenance: {
        createdByActorId: "retail_encoder_artifact_001",
        parentArtifactIds: [],
      },
    }, t1),
    /ARTIFACT_PARENT_REQUIRED/u,
  );
});

test("release remains blocked until every dependency is verified, reviewed and rights-valid", () => {
  const first = approve(verify(createCandidate("artifact_take_008", "take_008", "8")));
  const second = approve(verify(createCandidate("artifact_take_009", "take_009", "9")));

  const chapterPending = createArtifactRecord({
    id: "artifact_chapter_master_001",
    kind: "chapter-master",
    projectId: job.projectId,
    storage: {
      driver: "private-object-store",
      provider: "s3-compatible-private",
      container: "storyteller-production",
      objectKey: `projects/${job.projectId}/chapters/chapter_001/master.wav`,
      versionId: "chapter-version-001",
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: "a".repeat(64),
      byteCount: 960_000,
      mimeType: "audio/wav",
      format: "wav",
    },
    provenance: {
      createdByActorId: "assembler_artifact_001",
      sourceContentHash: "d".repeat(64),
      parentArtifactIds: [first.id, second.id],
    },
    rights: rights(),
  }, t1);
  const chapter = approve(verify(chapterPending, t2), t3);

  const masteredPending = createArtifactRecord({
    id: "artifact_mastered_release_001",
    kind: "mastered-chapter",
    projectId: job.projectId,
    segmentId: "chapter_001",
    takeId: "mastered_release_take_001",
    storage: {
      driver: "private-object-store",
      provider: "s3-compatible-private",
      container: "storyteller-production",
      objectKey: `projects/${job.projectId}/chapters/chapter_001/mastered-release.wav`,
      versionId: "mastered-version-001",
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: "c".repeat(64),
      byteCount: 960_000,
      mimeType: "audio/wav",
      format: "wav",
    },
    provenance: {
      createdByActorId: "mastering_release_001",
      sourceContentHash: chapter.integrity.contentHash,
      generationRequestHash: "4".repeat(64),
      parentArtifactIds: [chapter.id],
    },
    rights: rights(),
  }, new Date(t3.getTime() + 100));
  const mastered = approve(
    verify(masteredPending, new Date(t3.getTime() + 200)),
    new Date(t3.getTime() + 300),
  );

  const releasePending = createArtifactRecord({
    id: "artifact_release_001",
    kind: "release-package",
    projectId: job.projectId,
    storage: {
      driver: "private-object-store",
      provider: "s3-compatible-private",
      container: "storyteller-production",
      objectKey: `projects/${job.projectId}/releases/release_001.zip`,
      versionId: "release-version-001",
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: "b".repeat(64),
      byteCount: 1_200_000,
      mimeType: "application/zip",
      format: "zip",
    },
    provenance: {
      createdByActorId: "release_artifact_001",
      sourceContentHash: "d".repeat(64),
      parentArtifactIds: [mastered.id],
    },
    rights: rights(),
  }, t2);
  const releaseVerified = verify(releasePending, t3);

  const blocked = assessArtifactRelease(
    [first, second, chapter, mastered, releaseVerified],
    releaseVerified.id,
    { finalConfirmationId: "confirmation_release_001", now: t3 },
  );
  assert.equal(blocked.ok, false);
  assert.equal(blocked.findings.some((finding) => finding.code === "ARTIFACT_RELEASE_REVIEW_PENDING"), true);

  const releaseApproved = recordArtifactReview(releaseVerified, {
    decision: "approved",
    reviewerId: "reviewer_release_001",
    notes: "Package order, metadata, checksums and approved mastered chapters were reviewed.",
    decidedAt: new Date(t3.getTime() + 1_000),
  });
  const assessment = assessArtifactRelease(
    [first, second, chapter, mastered, releaseApproved],
    releaseApproved.id,
    { finalConfirmationId: "confirmation_release_001", now: new Date(t3.getTime() + 2_000) },
  );
  assert.equal(assessment.ok, true);
  assert.equal(assessment.artifactIds.includes(chapter.id), true);
  assert.equal(assessment.artifactIds.includes(mastered.id), true);

  const released = confirmArtifactRelease(
    [first, second, chapter, mastered, releaseApproved],
    releaseApproved.id,
    {
      finalConfirmationId: "confirmation_release_001",
      releasedByActorId: "owner_release_001",
      releasedAt: new Date(t3.getTime() + 3_000),
    },
  );
  assert.equal(released.release.status, "released");
  assert.equal(released.release.finalConfirmationId, "confirmation_release_001");
  assert.equal(released.revision, releaseApproved.revision + 1);
});

test("a pre-master chapter alone cannot satisfy audiobook release", () => {
  const candidate = approve(verify(createCandidate("artifact_take_pre_master_only", "take_pre_master_only", "5")));
  const chapter = approve(verify(createArtifactRecord({
    id: "artifact_pre_master_only_001",
    kind: "chapter-master",
    projectId: job.projectId,
    storage: {
      driver: "private-object-store",
      provider: "s3-compatible-private",
      container: "storyteller-production",
      objectKey: `projects/${job.projectId}/chapters/chapter_pre_master_only/master.wav`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: "6".repeat(64),
      byteCount: 960_000,
      mimeType: "audio/wav",
      format: "wav",
    },
    provenance: {
      createdByActorId: "assembler_pre_master_only_001",
      sourceContentHash: "d".repeat(64),
      parentArtifactIds: [candidate.id],
    },
    rights: rights(),
  }, t1), t2), t3);
  const release = approve(verify(createArtifactRecord({
    id: "artifact_release_pre_master_only_001",
    kind: "release-package",
    projectId: job.projectId,
    storage: {
      driver: "private-object-store",
      provider: "s3-compatible-private",
      container: "storyteller-production",
      objectKey: `projects/${job.projectId}/releases/pre-master-only.zip`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: "7".repeat(64),
      byteCount: 1_200_000,
      mimeType: "application/zip",
      format: "zip",
    },
    provenance: {
      createdByActorId: "release_pre_master_only_001",
      sourceContentHash: chapter.integrity.contentHash,
      parentArtifactIds: [chapter.id],
    },
    rights: rights(),
  }, t1), t2), t3);
  const assessment = assessArtifactRelease(
    [candidate, chapter, release],
    release.id,
    { finalConfirmationId: "confirmation_pre_master_only_001", now: t3 },
  );
  assert.equal(assessment.ok, false);
  assert.equal(
    assessment.findings.some((finding) =>
      finding.code === "ARTIFACT_RELEASE_MASTERED_CHAPTER_REQUIRED"
    ),
    true,
  );
});

test("expired rights block queue completion and final release", () => {
  const expired = verify(createArtifactRecord(candidateInput("artifact_take_expired", "take_expired", "1", {
    rights: rights({ expiresAt: "2026-07-26T00:00:00.000Z" }),
  }), t0));
  const other = verify(createCandidate("artifact_take_010", "take_010", "2"));
  const queueAssessment = assessQueueCompletionArtifacts(job, [expired, other], { now: t2 });
  assert.equal(queueAssessment.ok, false);
  assert.equal(queueAssessment.findings.some((finding) => finding.code === "ARTIFACT_RIGHTS_EXPIRED"), true);
});

test("fingerprint tampering is detected before an artifact can participate in a gate", () => {
  const record = createCandidate("artifact_take_011", "take_011", "3");
  const tampered = {
    ...record,
    integrity: { ...record.integrity, byteCount: record.integrity.byteCount + 10 },
  };
  assert.throws(
    () => assertArtifactRecord(tampered),
    /ARTIFACT_FINGERPRINT_MISMATCH/u,
  );
  const assessment = assessQueueCompletionArtifacts(job, [tampered, verify(createCandidate("artifact_take_012", "take_012", "4"))], { now: t2 });
  assert.equal(assessment.ok, false);
  assert.equal(assessment.findings.some((finding) => finding.code === "ARTIFACT_RECORD_INVALID"), true);
});
