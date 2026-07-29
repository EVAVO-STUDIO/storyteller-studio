import {
  AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_SCHEMA_VERSION,
  assertAudiobookRetailPackageInspectionEvidence,
  type AudiobookRetailPackageInspectionEvidence,
  type AudiobookRetailPackageInspectionFile,
} from "../audiobook-retail-package-inspection.js";
import {
  AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SCHEMA_VERSION,
  assertAudiobookRetailPackageManifest,
  type AudiobookRetailPackageArtifactSnapshot,
  type AudiobookRetailPackageManifest,
  type AudiobookRetailPackageMediaFile,
} from "../audiobook-retail-package-manifest.js";
import type { AudiobookRetailEncodingPolicy } from "../audiobook-retail-policy.js";
import type { AudiobookRetailTrackPlan } from "../audiobook-retail-track-plan.js";
import { stableHash } from "../index.js";
import {
  retailReleaseAt,
  retailReleaseRightsFingerprint,
} from "./retail-release-policy-fixture.js";

function artifact(ordinal: number): AudiobookRetailPackageArtifactSnapshot {
  return Object.freeze({
    id: `artifact_release_package_${ordinal}`,
    revision: 4,
    fingerprint: String((ordinal % 8) + 1).repeat(64),
    contentHash: String(((ordinal + 2) % 8) + 1).repeat(64),
    byteCount: 1_000 + ordinal,
    reviewFingerprint: String(((ordinal + 4) % 8) + 1).repeat(64),
  });
}

function mediaFile(
  ordinal: number,
  kind: AudiobookRetailPackageMediaFile["kind"],
  role: AudiobookRetailPackageMediaFile["role"],
  fileName: string,
  durationMs: number,
): AudiobookRetailPackageMediaFile {
  const partial: Omit<AudiobookRetailPackageMediaFile, "fingerprint"> = {
    ordinal,
    kind,
    role,
    fileName,
    expectedDurationMs: durationMs,
    observedDurationMs: durationMs,
    artifact: artifact(ordinal),
    sourceFingerprint: String(((ordinal + 6) % 8) + 1).repeat(64),
  };
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

export function retailReleaseManifest(
  plan: AudiobookRetailTrackPlan,
  policy: AudiobookRetailEncodingPolicy,
): AudiobookRetailPackageManifest {
  const files = Object.freeze([
    mediaFile(1, "audiobook-track", "opening-credit", "0001OpeningCredits.mp3", 5_000),
    mediaFile(2, "audiobook-track", "chapter", "0002Chapter0001.mp3", 60_000),
    mediaFile(3, "audiobook-track", "closing-credit", "0003ClosingCredits.mp3", 6_000),
    mediaFile(4, "retail-sample", "retail-sample", "RetailSample.mp3", 60_000),
  ]);
  const partial: Omit<AudiobookRetailPackageManifest, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SCHEMA_VERSION,
    id: "retail_package_manifest_release_decision_001",
    projectId: plan.projectId,
    bookId: plan.bookId,
    distributor: "acx-audible",
    policy: Object.freeze({
      id: policy.id,
      externalVersion: policy.externalVersion,
      reviewedAt: policy.reviewedAt,
      expiresAt: policy.expiresAt,
      fingerprint: policy.fingerprint,
    }),
    rightsFingerprint: retailReleaseRightsFingerprint,
    trackPlan: Object.freeze({ id: plan.id, fingerprint: plan.fingerprint }),
    trackReview: Object.freeze({
      sessionId: "track_review_release_decision_001",
      sessionRevision: 8,
      sessionFingerprint: "3".repeat(64),
      approvalFingerprint: "4".repeat(64),
      approvedAt: retailReleaseAt(2).toISOString(),
    }),
    samplePlan: Object.freeze({
      id: "sample_plan_release_decision_001",
      fingerprint: "5".repeat(64),
    }),
    sampleReview: Object.freeze({
      sessionId: "sample_review_release_decision_001",
      sessionRevision: 4,
      sessionFingerprint: "6".repeat(64),
      approvalFingerprint: "7".repeat(64),
      approvedAt: retailReleaseAt(2).toISOString(),
    }),
    files,
    trackCount: 3,
    mediaFileCount: 4,
    totalTrackDurationMs: 71_000,
    sampleDurationMs: 60_000,
    totalMediaBytes: files.reduce((total, file) => total + file.artifact.byteCount, 0),
    status: "ready-for-package-build",
    createdByActorId: "package_manifest_builder_release_001",
    createdAt: retailReleaseAt(3).toISOString(),
    revision: 1,
  };
  const value = Object.freeze({ ...partial, fingerprint: stableHash(partial) });
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
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

export function retailReleaseInspection(
  manifest: AudiobookRetailPackageManifest,
): AudiobookRetailPackageInspectionEvidence {
  const files = Object.freeze(manifest.files.map(inspectionFile));
  const totalMediaBytes = files.reduce((total, file) => total + file.byteCount, 0);
  const partial: Omit<AudiobookRetailPackageInspectionEvidence, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_PACKAGE_INSPECTION_SCHEMA_VERSION,
    id: "retail_package_inspection_release_decision_001",
    projectId: manifest.projectId,
    bookId: manifest.bookId,
    packageId: "package_release_subject_001",
    distributor: "acx-audible",
    sourceBuild: Object.freeze({
      id: "package_build_release_decision_001",
      fingerprint: "8".repeat(64),
    }),
    sourceManifest: Object.freeze({
      id: manifest.id,
      fingerprint: manifest.fingerprint,
    }),
    files,
    mediaFileCount: files.length,
    totalMediaBytes,
    packageManifest: Object.freeze({
      fileName: "package-manifest.json",
      contentHash: "9".repeat(64),
      byteCount: 2_048,
      fingerprint: "a".repeat(64),
    }),
    directoryEntryCount: files.length + 1,
    packageFileCount: files.length + 1,
    totalPackageBytes: totalMediaBytes + 2_048,
    directoryPermissionsVerified: true,
    allFilesPrivate: true,
    status: "ready-for-final-package-review",
    inspectedAt: retailReleaseAt(4).toISOString(),
    revision: 1,
  };
  const value = Object.freeze({ ...partial, fingerprint: stableHash(partial) });
  assertAudiobookRetailPackageInspectionEvidence(value);
  return value;
}
