import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ArtifactRightsSnapshot } from "./artifact-registry.js";
import {
  AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_SCHEMA_VERSION,
  assertAudiobookRetailPackageInspectionEvidence,
  type AudiobookRetailPackageInspectionEvidence,
  type AudiobookRetailPackageInspectionFile,
} from "./audiobook-retail-package-inspection.js";
import {
  AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SCHEMA_VERSION,
  assertAudiobookRetailPackageManifest,
  type AudiobookRetailPackageArtifactSnapshot,
  type AudiobookRetailPackageManifest,
  type AudiobookRetailPackageMediaFile,
} from "./audiobook-retail-package-manifest.js";
import {
  FileAudiobookRetailPackageReviewStore,
  approveAudiobookRetailPackageReview,
  assertAudiobookRetailPackageReviewMatchesSources,
  assertAudiobookRetailPackageReviewSession,
  audiobookRetailPackageReviewPublicView,
  createAudiobookRetailPackageReviewSession,
  recordAudiobookRetailPackageReview,
  type AudiobookRetailPackageReviewCoverage,
  type AudiobookRetailPackageReviewScores,
  type AudiobookRetailPackageReviewSession,
} from "./audiobook-retail-package-review.js";
import { stableHash } from "./index.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-29T00:00:00.000Z");
const t1 = new Date("2026-07-29T00:00:01.000Z");
const t2 = new Date("2026-07-29T00:00:02.000Z");
const t3 = new Date("2026-07-29T00:00:03.000Z");
const t4 = new Date("2026-07-29T00:00:04.000Z");
const t5 = new Date("2026-07-29T00:00:05.000Z");
const t6 = new Date("2026-07-29T00:00:06.000Z");
const rightsFingerprint = "b".repeat(64);

function artifact(
  ordinal: number,
): AudiobookRetailPackageArtifactSnapshot {
  return Object.freeze({
    id: `artifact_package_review_${ordinal}`,
    revision: 4,
    fingerprint: String((ordinal % 8) + 1).repeat(64),
    contentHash: String(((ordinal + 2) % 8) + 1).repeat(64),
    byteCount: 100 + ordinal,
    reviewFingerprint: String(((ordinal + 4) % 8) + 1).repeat(64),
  });
}

function mediaFile(input: Readonly<{
  ordinal: number;
  kind: AudiobookRetailPackageMediaFile["kind"];
  role: AudiobookRetailPackageMediaFile["role"];
  fileName: string;
  durationMs: number;
}>): AudiobookRetailPackageMediaFile {
  const partial: Omit<AudiobookRetailPackageMediaFile, "fingerprint"> = {
    ordinal: input.ordinal,
    kind: input.kind,
    role: input.role,
    fileName: input.fileName,
    expectedDurationMs: input.durationMs,
    observedDurationMs: input.durationMs,
    artifact: artifact(input.ordinal),
    sourceFingerprint: String(((input.ordinal + 6) % 8) + 1).repeat(64),
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
}

function manifest(
  policyExpiresAt = "2027-07-29T00:00:00.000Z",
): AudiobookRetailPackageManifest {
  const files = Object.freeze([
    mediaFile({
      ordinal: 1,
      kind: "audiobook-track",
      role: "opening-credit",
      fileName: "0001OpeningCredits.mp3",
      durationMs: 5_000,
    }),
    mediaFile({
      ordinal: 2,
      kind: "audiobook-track",
      role: "chapter",
      fileName: "0002Chapter0001.mp3",
      durationMs: 60_000,
    }),
    mediaFile({
      ordinal: 3,
      kind: "audiobook-track",
      role: "closing-credit",
      fileName: "0003ClosingCredits.mp3",
      durationMs: 6_000,
    }),
    mediaFile({
      ordinal: 4,
      kind: "retail-sample",
      role: "retail-sample",
      fileName: "RetailSample.mp3",
      durationMs: 60_000,
    }),
  ]);
  const partial: Omit<AudiobookRetailPackageManifest, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SCHEMA_VERSION,
    id: "retail_package_manifest_review_001",
    projectId: "project_retail_package_review_001",
    bookId: "book_retail_package_review_001",
    distributor: "acx-audible",
    policy: Object.freeze({
      id: "retail_policy_package_review_001",
      externalVersion: "acx-2026-07",
      reviewedAt: "2026-07-27T00:00:00.000Z",
      expiresAt: policyExpiresAt,
      fingerprint: "a".repeat(64),
    }),
    rightsFingerprint,
    trackPlan: Object.freeze({
      id: "retail_track_plan_package_review_001",
      fingerprint: "c".repeat(64),
    }),
    trackReview: Object.freeze({
      sessionId: "retail_track_review_package_review_001",
      sessionRevision: 8,
      sessionFingerprint: "d".repeat(64),
      approvalFingerprint: "e".repeat(64),
      approvedAt: "2026-07-28T23:59:56.000Z",
    }),
    samplePlan: Object.freeze({
      id: "retail_sample_plan_package_review_001",
      fingerprint: "f".repeat(64),
    }),
    sampleReview: Object.freeze({
      sessionId: "retail_sample_review_package_review_001",
      sessionRevision: 4,
      sessionFingerprint: "1".repeat(64),
      approvalFingerprint: "2".repeat(64),
      approvedAt: "2026-07-28T23:59:57.000Z",
    }),
    files,
    trackCount: 3,
    mediaFileCount: 4,
    totalTrackDurationMs: 71_000,
    sampleDurationMs: 60_000,
    totalMediaBytes: files.reduce(
      (total, file) => total + file.artifact.byteCount,
      0,
    ),
    status: "ready-for-package-build",
    createdByActorId: "retail_package_manifest_review_builder_001",
    createdAt: t0.toISOString(),
    revision: 1,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
  assertAudiobookRetailPackageManifest(value);
  return value;
}

function inspectionFile(
  file: AudiobookRetailPackageMediaFile,
): AudiobookRetailPackageInspectionFile {
  const partial: Omit<AudiobookRetailPackageInspectionFile, "fingerprint"> = {
    ordinal: file.ordinal,
    kind: file.kind,
    role: file.role,
    fileName: file.fileName,
    expectedDurationMs: file.expectedDurationMs,
    observedDurationMs: file.observedDurationMs,
    sourceBuildFileFingerprint: String(((file.ordinal + 1) % 8) + 1).repeat(64),
    contentHash: file.artifact.contentHash,
    byteCount: file.artifact.byteCount,
    mediaSignature: "mpeg-audio",
    privatePermissionsVerified: true,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
}

function inspection(
  source: AudiobookRetailPackageManifest,
): AudiobookRetailPackageInspectionEvidence {
  const files = Object.freeze(source.files.map(inspectionFile));
  const totalMediaBytes = files.reduce(
    (total, file) => total + file.byteCount,
    0,
  );
  const partial: Omit<AudiobookRetailPackageInspectionEvidence, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_SCHEMA_VERSION,
    id: "retail_package_inspection_review_001",
    projectId: source.projectId,
    bookId: source.bookId,
    packageId: "retail_package_review_001",
    distributor: "acx-audible",
    sourceBuild: Object.freeze({
      id: "retail_package_build_review_001",
      fingerprint: "3".repeat(64),
    }),
    sourceManifest: Object.freeze({
      id: source.id,
      fingerprint: source.fingerprint,
    }),
    files,
    mediaFileCount: files.length,
    totalMediaBytes,
    packageManifest: Object.freeze({
      fileName: "package-manifest.json",
      contentHash: "4".repeat(64),
      byteCount: 1_024,
      fingerprint: "5".repeat(64),
    }),
    directoryEntryCount: files.length + 1,
    packageFileCount: files.length + 1,
    totalPackageBytes: totalMediaBytes + 1_024,
    directoryPermissionsVerified: true,
    allFilesPrivate: true,
    status: "ready-for-final-package-review",
    inspectedAt: t1.toISOString(),
    revision: 1,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
  assertAudiobookRetailPackageInspectionEvidence(value);
  return value;
}

function rights(
  expiresAt = "2027-07-29T00:00:00.000Z",
): ArtifactRightsSnapshot {
  return Object.freeze({
    rightsEvidenceId: "rights_package_review_001",
    rightsFingerprint,
    allowedUses: Object.freeze(["audiobook"] as const),
    commercialUseApproved: true,
    expiresAt,
    retainUntil: "2033-07-29T00:00:00.000Z",
    deletionRequiredAt: "2034-07-29T00:00:00.000Z",
  });
}

function coverage(fileCount = 4): AudiobookRetailPackageReviewCoverage {
  return Object.freeze({
    completeFileListConfirmed: true,
    manifestConfirmed: true,
    openingCreditPlayed: true,
    firstNarrativePlayed: true,
    midpointNarrativePlayed: true,
    finalNarrativePlayed: true,
    closingCreditPlayed: true,
    retailSamplePlayed: true,
    fileCountReviewed: fileCount,
  });
}

function scores(value = 5): AudiobookRetailPackageReviewScores {
  return Object.freeze({
    packageCompleteness: value,
    fileNamingAndOrder: value,
    creditAccuracy: value,
    narrativeContinuity: value,
    transitionAndSilenceIntegrity: value,
    encodingConsistency: value,
    retailSampleQuality: value,
    releaseReadiness: value,
  });
}

function fixture(): Readonly<{
  manifest: AudiobookRetailPackageManifest;
  inspection: AudiobookRetailPackageInspectionEvidence;
  rights: ArtifactRightsSnapshot;
}> {
  const packageManifest = manifest();
  return Object.freeze({
    manifest: packageManifest,
    inspection: inspection(packageManifest),
    rights: rights(),
  });
}

function initialSession(input = fixture()): AudiobookRetailPackageReviewSession {
  return createAudiobookRetailPackageReviewSession({
    id: "retail_package_review_session_001",
    ...input,
    createdAt: t2,
  });
}

function editorialReview(
  session: AudiobookRetailPackageReviewSession,
  input: Readonly<{
    id?: string;
    reviewerId?: string;
    decision?: "approve" | "changes-requested";
    score?: number;
    findingCodes?: readonly string[];
    notes?: string;
    decidedAt?: Date;
    contexts?: readonly ("consumer-headphones" | "speakers" | "mobile-device")[];
    coverage?: AudiobookRetailPackageReviewCoverage;
  }> = {},
): AudiobookRetailPackageReviewSession {
  return recordAudiobookRetailPackageReview(session, {
    id: input.id ?? "package_review_editorial_001",
    role: "editorial",
    reviewerId: input.reviewerId ?? "package_editor_001",
    coverage: input.coverage ?? coverage(),
    playbackContexts: input.contexts ?? ["consumer-headphones", "speakers"],
    decision: input.decision ?? "approve",
    scores: scores(input.score ?? 5),
    ...(input.findingCodes ? { findingCodes: input.findingCodes } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    decidedAt: input.decidedAt ?? t3,
  });
}

function engineeringReview(
  session: AudiobookRetailPackageReviewSession,
  input: Readonly<{
    reviewerId?: string;
    score?: number;
    decidedAt?: Date;
    contexts?: readonly ("studio-headphones" | "speakers")[];
  }> = {},
): AudiobookRetailPackageReviewSession {
  return recordAudiobookRetailPackageReview(session, {
    id: "package_review_engineering_001",
    role: "engineering",
    reviewerId: input.reviewerId ?? "package_engineer_001",
    coverage: coverage(),
    playbackContexts: input.contexts ?? ["studio-headphones"],
    decision: "approve",
    scores: scores(input.score ?? 5),
    decidedAt: input.decidedAt ?? t4,
  });
}

test("two independent reviewers and a third release manager approve the exact inspected package", async () => {
  const input = fixture();
  const root = await mkdtemp(join(tmpdir(), "storyteller-package-review-"));
  try {
    const store = new FileAudiobookRetailPackageReviewStore(
      new FileProjectStore(root),
    );
    const initial = initialSession(input);
    const created = await store.create(initial, "package_review_owner_001");
    const repeated = await store.create(initial, "package_review_owner_001");
    assert.equal(created.envelopeHash, repeated.envelopeHash);

    const editorial = editorialReview(initial);
    await store.save(editorial, {
      expectedRevision: 1,
      actorId: "package_editor_001",
      action: "audiobook_retail_package_review.editorial_recorded",
    });
    const engineering = engineeringReview(editorial);
    assert.equal(engineering.status, "ready-for-approval");
    await store.save(engineering, {
      expectedRevision: 2,
      actorId: "package_engineer_001",
      action: "audiobook_retail_package_review.engineering_recorded",
    });

    const approved = approveAudiobookRetailPackageReview(engineering, {
      ...input,
      finalConfirmationId: "package_final_confirmation_001",
      approvedByActorId: "package_release_manager_001",
      humanConfirmation: true,
      approvedAt: t5,
    });
    assert.equal(approved.status, "approved-for-release-decision");
    assert.equal(approved.approval?.releaseDecisionEligible, true);
    assert.equal(approved.approval?.inspectionFingerprint, input.inspection.fingerprint);
    assert.doesNotThrow(() =>
      assertAudiobookRetailPackageReviewSession(approved)
    );
    assert.doesNotThrow(() =>
      assertAudiobookRetailPackageReviewMatchesSources(approved, {
        ...input,
        now: t5,
      })
    );
    await store.save(approved, {
      expectedRevision: 3,
      actorId: "package_release_manager_001",
      action: "audiobook_retail_package_review.approved",
    });
    assert.equal((await store.require(approved.id)).payload.fingerprint, approved.fingerprint);

    const view = audiobookRetailPackageReviewPublicView(approved);
    assert.equal(view.releaseDecisionEligible, true);
    assert.deepEqual(view.playbackContexts, [
      "consumer-headphones",
      "speakers",
      "studio-headphones",
    ]);
    const serialised = JSON.stringify(view);
    const audit = await readFile(join(root, "audit", "2026-07-29.jsonl"), "utf8");
    for (const forbidden of [
      input.manifest.projectId,
      input.inspection.packageId,
      input.inspection.fingerprint,
      input.manifest.rightsFingerprint,
      input.inspection.files[0]!.contentHash,
      "package_editor_001",
      "package_engineer_001",
      "package_release_manager_001",
      "package_final_confirmation_001",
      "inspectionFingerprint",
      "fileSetFingerprint",
      "reviewerSetFingerprint",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
      assert.equal(audit.includes(forbidden), false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("changes-requested findings require a clean re-review before readiness", () => {
  const initial = initialSession();
  const changes = editorialReview(initial, {
    decision: "changes-requested",
    score: 3,
    findingCodes: ["PACKAGE_REVIEW_CLOSING_CREDIT_DEFECT"],
    notes: "Closing credit has a clipped final consonant.",
  });
  assert.equal(changes.status, "changes-requested");

  const revised = editorialReview(changes, {
    id: "package_review_editorial_002",
    decidedAt: t4,
  });
  assert.equal(revised.status, "open");
  const engineering = engineeringReview(revised, { decidedAt: t5 });
  assert.equal(engineering.status, "ready-for-approval");
  assert.equal(
    audiobookRetailPackageReviewPublicView(engineering).findingCodes.length,
    0,
  );
});

test("partial playback, automation identities and shared cross-role reviewers fail closed", () => {
  const initial = initialSession();
  assert.throws(
    () => editorialReview(initial, {
      coverage: Object.freeze({
        ...coverage(),
        retailSamplePlayed: false as never,
      }),
    }),
    /AUDIOBOOK_RETAIL_PACKAGE_REVIEW_COVERAGE_INCOMPLETE/u,
  );
  assert.throws(
    () => editorialReview(initial, { reviewerId: "bot_package_reviewer" }),
    /AUDIOBOOK_RETAIL_PACKAGE_REVIEW_REVIEWER_INVALID/u,
  );
  const editorial = editorialReview(initial);
  assert.throws(
    () => engineeringReview(editorial, { reviewerId: "package_editor_001" }),
    /AUDIOBOOK_RETAIL_PACKAGE_REVIEW_INDEPENDENT_REVIEWERS_REQUIRED/u,
  );
});

test("score and playback-context coverage prevent premature approval", () => {
  const initial = initialSession();
  const low = editorialReview(initial, { score: 3, contexts: ["consumer-headphones"] });
  const engineering = engineeringReview(low);
  assert.equal(engineering.status, "open");
  assert.throws(
    () => approveAudiobookRetailPackageReview(engineering, {
      ...fixture(),
      finalConfirmationId: "package_final_confirmation_low_001",
      approvedByActorId: "package_release_manager_low_001",
      humanConfirmation: true,
      approvedAt: t5,
    }),
    /AUDIOBOOK_RETAIL_PACKAGE_REVIEW_NOT_READY_FOR_APPROVAL/u,
  );

  const noSpeakers = engineeringReview(
    editorialReview(initial, { contexts: ["consumer-headphones"] }),
    { contexts: ["studio-headphones"] },
  );
  assert.equal(noSpeakers.status, "open");
});

test("rights and policy are revalidated at creation and final approval", () => {
  const packageManifest = manifest();
  const inspected = inspection(packageManifest);
  assert.throws(
    () => createAudiobookRetailPackageReviewSession({
      id: "retail_package_review_expired_rights_001",
      inspection: inspected,
      manifest: packageManifest,
      rights: rights("2026-07-29T00:00:01.500Z"),
      createdAt: t2,
    }),
    /AUDIOBOOK_RETAIL_PACKAGE_REVIEW_RIGHTS_EXPIRED/u,
  );

  const expiredPolicy = manifest("2026-07-29T00:00:01.500Z");
  assert.throws(
    () => createAudiobookRetailPackageReviewSession({
      id: "retail_package_review_expired_policy_001",
      inspection: inspection(expiredPolicy),
      manifest: expiredPolicy,
      rights: rights(),
      createdAt: t2,
    }),
    /AUDIOBOOK_RETAIL_PACKAGE_REVIEW_POLICY_EXPIRED/u,
  );

  const shortRights = rights("2026-07-29T00:00:04.500Z");
  const session = engineeringReview(editorialReview(
    createAudiobookRetailPackageReviewSession({
      id: "retail_package_review_late_expiry_001",
      inspection: inspected,
      manifest: packageManifest,
      rights: shortRights,
      createdAt: t2,
    }),
  ));
  assert.throws(
    () => approveAudiobookRetailPackageReview(session, {
      inspection: inspected,
      manifest: packageManifest,
      rights: shortRights,
      finalConfirmationId: "package_final_confirmation_expired_001",
      approvedByActorId: "package_release_manager_expired_001",
      humanConfirmation: true,
      approvedAt: t5,
    }),
    /AUDIOBOOK_RETAIL_PACKAGE_REVIEW_RIGHTS_EXPIRED/u,
  );
});

test("reviewers cannot provide the final independent release-manager confirmation", () => {
  const input = fixture();
  const ready = engineeringReview(editorialReview(initialSession(input)));
  assert.throws(
    () => approveAudiobookRetailPackageReview(ready, {
      ...input,
      finalConfirmationId: "package_final_confirmation_shared_001",
      approvedByActorId: "package_editor_001",
      humanConfirmation: true,
      approvedAt: t5,
    }),
    /AUDIOBOOK_RETAIL_PACKAGE_REVIEW_INDEPENDENT_APPROVER_REQUIRED/u,
  );
});

test("recomputed structural state cannot replace the inspected package source", () => {
  const input = fixture();
  const session = initialSession(input);
  const { fingerprint: _fingerprint, ...base } = session;
  const changedBase: Omit<AudiobookRetailPackageReviewSession, "fingerprint"> = {
    ...base,
    packageId: "retail_package_structurally_wrong_001",
  };
  const changed = Object.freeze({
    ...changedBase,
    fingerprint: stableHash(changedBase),
  });
  assert.doesNotThrow(() =>
    assertAudiobookRetailPackageReviewSession(changed)
  );
  assert.throws(
    () => assertAudiobookRetailPackageReviewMatchesSources(changed, {
      ...input,
      now: t2,
    }),
    /AUDIOBOOK_RETAIL_PACKAGE_REVIEW_SOURCE_MISMATCH/u,
  );
});

test("store idempotency rejects reuse of a session identity for another package", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-package-review-store-"));
  try {
    const store = new FileAudiobookRetailPackageReviewStore(
      new FileProjectStore(root),
    );
    const session = initialSession();
    await store.create(session, "package_review_owner_001");
    const { fingerprint: _fingerprint, ...base } = session;
    const changedBase: Omit<AudiobookRetailPackageReviewSession, "fingerprint"> = {
      ...base,
      packageId: "retail_package_other_001",
    };
    const changed = Object.freeze({
      ...changedBase,
      fingerprint: stableHash(changedBase),
    });
    await assert.rejects(
      store.create(changed, "package_review_owner_001"),
      /AUDIOBOOK_RETAIL_PACKAGE_REVIEW_STORE_IDEMPOTENCY_CONFLICT/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
