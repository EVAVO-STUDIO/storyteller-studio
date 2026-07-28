import {
  assertArtifactRecord,
  type ArtifactRecord,
} from "./artifact-registry.js";
import {
  assertAudiobookRetailSamplePlan,
  type AudiobookRetailSamplePlan,
} from "./audiobook-retail-sample-plan.js";
import {
  assertAudiobookRetailSampleReviewSession,
  type AudiobookRetailSampleReviewSession,
} from "./audiobook-retail-sample-review.js";
import {
  assertAudiobookRetailTrackPlan,
  type AudiobookRetailTrack,
  type AudiobookRetailTrackPlan,
} from "./audiobook-retail-track-plan.js";
import {
  assertAudiobookRetailTrackReviewSession,
  type AudiobookRetailTrackReviewSession,
} from "./audiobook-retail-track-review.js";
import { stableHash } from "./index.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";

export const AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SCHEMA_VERSION =
  "storyteller-audiobook-retail-package-manifest-v1" as const;
export const AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_ENTITY_TYPE =
  "audiobook-retail-package-manifest" as const;

export type AudiobookRetailPackageMediaKind =
  | "audiobook-track"
  | "retail-sample";
export type AudiobookRetailPackageMediaRole =
  | AudiobookRetailTrack["role"]
  | "retail-sample";

export interface AudiobookRetailPackageArtifactSnapshot {
  id: string;
  revision: number;
  fingerprint: string;
  contentHash: string;
  byteCount: number;
  reviewFingerprint: string;
}

export interface AudiobookRetailPackageMediaFile {
  ordinal: number;
  kind: AudiobookRetailPackageMediaKind;
  role: AudiobookRetailPackageMediaRole;
  fileName: string;
  expectedDurationMs: number;
  observedDurationMs: number;
  artifact: AudiobookRetailPackageArtifactSnapshot;
  sourceFingerprint: string;
  fingerprint: string;
}

export interface AudiobookRetailPackageManifest {
  schemaVersion: typeof AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  distributor: "acx-audible";
  policy: Readonly<{
    id: string;
    externalVersion: string;
    reviewedAt: string;
    expiresAt: string;
    fingerprint: string;
  }>;
  rightsFingerprint: string;
  trackPlan: Readonly<{
    id: string;
    fingerprint: string;
  }>;
  trackReview: Readonly<{
    sessionId: string;
    sessionRevision: number;
    sessionFingerprint: string;
    approvalFingerprint: string;
    approvedAt: string;
  }>;
  samplePlan: Readonly<{
    id: string;
    fingerprint: string;
  }>;
  sampleReview: Readonly<{
    sessionId: string;
    sessionRevision: number;
    sessionFingerprint: string;
    approvalFingerprint: string;
    approvedAt: string;
  }>;
  files: readonly AudiobookRetailPackageMediaFile[];
  trackCount: number;
  mediaFileCount: number;
  totalTrackDurationMs: number;
  sampleDurationMs: number;
  totalMediaBytes: number;
  status: "ready-for-package-build";
  createdByActorId: string;
  createdAt: string;
  revision: 1;
  fingerprint: string;
}

export interface AudiobookRetailPackageManifestPublicFile {
  ordinal: number;
  kind: AudiobookRetailPackageMediaKind;
  role: AudiobookRetailPackageMediaRole;
  fileName: string;
  expectedDurationMs: number;
  observedDurationMs: number;
  byteCount: number;
}

export interface AudiobookRetailPackageManifestPublicView {
  id: string;
  bookId: string;
  distributor: "acx-audible";
  policyVersion: string;
  trackCount: number;
  mediaFileCount: number;
  totalTrackDurationMs: number;
  sampleDurationMs: number;
  totalMediaBytes: number;
  files: readonly AudiobookRetailPackageManifestPublicFile[];
  status: "ready-for-package-build";
  createdAt: string;
  fingerprint: string;
}

export interface CreateAudiobookRetailPackageManifestInput {
  id?: string;
  trackPlan: AudiobookRetailTrackPlan;
  trackReview: AudiobookRetailTrackReviewSession;
  approvedTrackArtifacts: readonly ArtifactRecord[];
  samplePlan: AudiobookRetailSamplePlan;
  sampleReview: AudiobookRetailSampleReviewSession;
  approvedSampleArtifact: ArtifactRecord;
  createdByActorId: string;
  createdAt?: Date;
}

export class AudiobookRetailPackageManifestError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailPackageManifestError";
    this.code = code;
  }
}

export class AudiobookRetailPackageManifestStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudiobookRetailPackageManifestStoreConflictError";
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const FILE_NAME_PATTERN = /^[A-Za-z0-9]+\.mp3$/u;
const MAXIMUM_TRACKS = 2_002;
const MAXIMUM_FILES = MAXIMUM_TRACKS + 1;
const MAXIMUM_DURATION_MS = 15 * 24 * 60 * 60 * 1_000;
const MAXIMUM_SAMPLE_DURATION_MS = 300_000;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailPackageManifestError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailPackageManifestError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailPackageManifestError(code);
  }
  return value;
}

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new AudiobookRetailPackageManifestError(code);
  }
  return value;
}

function currentRights(
  artifact: ArtifactRecord,
  rightsFingerprint: string,
  now: Date,
): void {
  if (
    artifact.rights.rightsFingerprint !== rightsFingerprint
    || !artifact.rights.allowedUses.includes("audiobook")
  ) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_RIGHTS_SCOPE_MISMATCH",
    );
  }
  if (!artifact.rights.commercialUseApproved) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_COMMERCIAL_RIGHTS_REQUIRED",
    );
  }
  if (
    artifact.rights.expiresAt
    && Date.parse(artifact.rights.expiresAt) <= now.getTime()
  ) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_RIGHTS_EXPIRED",
    );
  }
  if (
    artifact.rights.deletionRequiredAt
    && Date.parse(artifact.rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_RETENTION_EXPIRED",
    );
  }
}

function assertApprovedArtifact(
  artifact: ArtifactRecord,
  input: Readonly<{
    projectId: string;
    kind: "audiobook-retail-track" | "audiobook-retail-sample";
    id: string;
    originalRevision: number;
    originalFingerprint: string;
    approvedRevision: number;
    approvedFingerprint: string;
    approvedReviewFingerprint: string;
    contentHash: string;
    byteCount: number;
    rightsFingerprint: string;
    now: Date;
  }>,
): void {
  assertArtifactRecord(artifact);
  if (
    artifact.projectId !== input.projectId
    || artifact.kind !== input.kind
    || artifact.id !== input.id
    || artifact.revision !== input.approvedRevision
    || artifact.revision !== input.originalRevision + 1
    || artifact.previousFingerprint !== input.originalFingerprint
    || artifact.fingerprint !== input.approvedFingerprint
    || artifact.integrity.contentHash !== input.contentHash
    || artifact.integrity.byteCount !== input.byteCount
    || artifact.integrity.mimeType !== "audio/mpeg"
    || artifact.integrity.format !== "mp3"
    || artifact.verification.status !== "verified"
    || artifact.review.required !== true
    || artifact.review.status !== "approved"
    || stableHash(artifact.review) !== input.approvedReviewFingerprint
    || artifact.quarantine !== undefined
    || artifact.release.status !== "unavailable"
  ) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_APPROVED_ARTIFACT_MISMATCH",
    );
  }
  currentRights(artifact, input.rightsFingerprint, input.now);
}

function assertPolicyAndScope(
  input: CreateAudiobookRetailPackageManifestInput,
  createdAt: Date,
): void {
  assertAudiobookRetailTrackPlan(input.trackPlan);
  assertAudiobookRetailTrackReviewSession(input.trackReview);
  assertAudiobookRetailSamplePlan(input.samplePlan);
  assertAudiobookRetailSampleReviewSession(input.sampleReview);
  if (
    input.trackPlan.status !== "ready-for-encoding"
    || input.trackPlan.blockers.length !== 0
    || input.trackReview.status !== "approved"
    || !input.trackReview.approval
    || input.samplePlan.status !== "ready-for-rendering"
    || input.sampleReview.status !== "approved"
    || !input.sampleReview.approval
  ) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_APPROVED_INPUTS_REQUIRED",
    );
  }
  if (
    input.trackPlan.projectId !== input.trackReview.projectId
    || input.trackPlan.bookId !== input.trackReview.bookId
    || input.trackReview.planFingerprint !== input.trackPlan.fingerprint
    || input.samplePlan.projectId !== input.trackPlan.projectId
    || input.samplePlan.bookId !== input.trackPlan.bookId
    || input.samplePlan.trackPlan.id !== input.trackPlan.id
    || input.samplePlan.trackPlan.fingerprint !== input.trackPlan.fingerprint
    || input.sampleReview.projectId !== input.trackPlan.projectId
    || input.sampleReview.bookId !== input.trackPlan.bookId
    || input.sampleReview.plan.id !== input.samplePlan.id
    || input.sampleReview.plan.fingerprint !== input.samplePlan.fingerprint
    || input.trackPlan.distributor !== "acx-audible"
    || input.samplePlan.distributor !== input.trackPlan.distributor
  ) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SCOPE_MISMATCH",
    );
  }
  if (
    input.samplePlan.policy.id !== input.trackPlan.policy.id
    || input.samplePlan.policy.externalVersion
      !== input.trackPlan.policy.externalVersion
    || input.samplePlan.policy.reviewedAt !== input.trackPlan.policy.reviewedAt
    || input.samplePlan.policy.expiresAt !== input.trackPlan.policy.expiresAt
    || input.samplePlan.policy.fingerprint !== input.trackPlan.policy.fingerprint
  ) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_POLICY_MISMATCH",
    );
  }
  const minimum = Math.max(
    Date.parse(input.trackPlan.createdAt),
    Date.parse(input.trackReview.approval.approvedAt),
    Date.parse(input.samplePlan.createdAt),
    Date.parse(input.sampleReview.approval.approvedAt),
    ...input.approvedTrackArtifacts.map((artifact) => Date.parse(artifact.updatedAt)),
    Date.parse(input.approvedSampleArtifact.updatedAt),
  );
  if (
    createdAt.getTime() < minimum
    || createdAt.getTime() < Date.parse(input.trackPlan.policy.reviewedAt)
    || createdAt.getTime() >= Date.parse(input.trackPlan.policy.expiresAt)
  ) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_CHRONOLOGY_INVALID",
    );
  }
}

function artifactSnapshot(
  artifact: ArtifactRecord,
): AudiobookRetailPackageArtifactSnapshot {
  return Object.freeze({
    id: artifact.id,
    revision: artifact.revision,
    fingerprint: artifact.fingerprint,
    contentHash: artifact.integrity.contentHash,
    byteCount: artifact.integrity.byteCount,
    reviewFingerprint: stableHash(artifact.review),
  });
}

function fileFingerprint(
  file: Omit<AudiobookRetailPackageMediaFile, "fingerprint">,
): string {
  return stableHash(file);
}

function trackFile(
  ordinal: number,
  planned: AudiobookRetailTrack,
  reviewed: AudiobookRetailTrackReviewSession["tracks"][number],
  approved: ArtifactRecord,
): AudiobookRetailPackageMediaFile {
  const partial: Omit<AudiobookRetailPackageMediaFile, "fingerprint"> = {
    ordinal,
    kind: "audiobook-track",
    role: planned.role,
    fileName: planned.fileName,
    expectedDurationMs: reviewed.expectedDurationMs,
    observedDurationMs: reviewed.observedDurationMs,
    artifact: artifactSnapshot(approved),
    sourceFingerprint: stableHash({
      plannedTrackFingerprint: planned.fingerprint,
      reviewedTrackFingerprint: reviewed.fingerprint,
    }),
  };
  return Object.freeze({
    ...partial,
    fingerprint: fileFingerprint(partial),
  });
}

function sampleFile(
  ordinal: number,
  samplePlan: AudiobookRetailSamplePlan,
  sampleReview: AudiobookRetailSampleReviewSession,
  approved: ArtifactRecord,
): AudiobookRetailPackageMediaFile {
  const partial: Omit<AudiobookRetailPackageMediaFile, "fingerprint"> = {
    ordinal,
    kind: "retail-sample",
    role: "retail-sample",
    fileName: samplePlan.output.fileName,
    expectedDurationMs: samplePlan.range.durationMs,
    observedDurationMs: sampleReview.durationMs,
    artifact: artifactSnapshot(approved),
    sourceFingerprint: stableHash({
      samplePlanFingerprint: samplePlan.fingerprint,
      sampleReviewFingerprint: sampleReview.fingerprint,
    }),
  };
  return Object.freeze({
    ...partial,
    fingerprint: fileFingerprint(partial),
  });
}

function manifestFingerprint(
  value: Omit<AudiobookRetailPackageManifest, "fingerprint">,
): string {
  return stableHash(value);
}

export function createAudiobookRetailPackageManifest(
  input: CreateAudiobookRetailPackageManifestInput,
): AudiobookRetailPackageManifest {
  const createdAt = input.createdAt ?? new Date();
  if (Number.isNaN(createdAt.getTime())) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_DATE_INVALID",
    );
  }
  requireIdentifier(
    input.createdByActorId,
    "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_ACTOR_ID_INVALID",
  );
  assertPolicyAndScope(input, createdAt);
  const trackApproval = input.trackReview.approval!;
  const sampleApproval = input.sampleReview.approval!;
  if (
    input.approvedTrackArtifacts.length !== input.trackPlan.tracks.length
    || input.approvedTrackArtifacts.length !== input.trackReview.tracks.length
    || trackApproval.approvedArtifacts.length !== input.trackPlan.tracks.length
  ) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_TRACK_COUNT_MISMATCH",
    );
  }
  if (
    input.trackReview.rightsFingerprint
      !== input.approvedSampleArtifact.rights.rightsFingerprint
  ) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_RIGHTS_SCOPE_MISMATCH",
    );
  }
  const rightsFingerprint = input.trackReview.rightsFingerprint;
  const files: AudiobookRetailPackageMediaFile[] = [];
  const approvedArtifactIds = new Set<string>();
  for (const [index, planned] of input.trackPlan.tracks.entries()) {
    const reviewed = input.trackReview.tracks[index];
    const approval = trackApproval.approvedArtifacts[index];
    const artifact = input.approvedTrackArtifacts[index];
    if (
      !reviewed
      || !approval
      || !artifact
      || reviewed.ordinal !== planned.ordinal
      || reviewed.role !== planned.role
      || reviewed.fileName !== planned.fileName
      || reviewed.expectedDurationMs !== planned.durationMs
      || approval.ordinal !== planned.ordinal
      || approval.id !== reviewed.artifact.id
    ) {
      throw new AudiobookRetailPackageManifestError(
        "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_TRACK_SCOPE_MISMATCH",
      );
    }
    assertApprovedArtifact(artifact, {
      projectId: input.trackPlan.projectId,
      kind: "audiobook-retail-track",
      id: approval.id,
      originalRevision: reviewed.artifact.revision,
      originalFingerprint: reviewed.artifact.fingerprint,
      approvedRevision: approval.revision,
      approvedFingerprint: approval.fingerprint,
      approvedReviewFingerprint: approval.reviewFingerprint,
      contentHash: reviewed.artifact.contentHash,
      byteCount: reviewed.artifact.byteCount,
      rightsFingerprint,
      now: createdAt,
    });
    if (approvedArtifactIds.has(artifact.id)) {
      throw new AudiobookRetailPackageManifestError(
        "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_ARTIFACT_DUPLICATE",
      );
    }
    approvedArtifactIds.add(artifact.id);
    files.push(trackFile(index + 1, planned, reviewed, artifact));
  }

  if (
    sampleApproval.approvedArtifactRevision
      !== input.sampleReview.sampleArtifact.revision + 1
    || input.sampleReview.sampleArtifact.id !== input.approvedSampleArtifact.id
  ) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SAMPLE_SCOPE_MISMATCH",
    );
  }
  assertApprovedArtifact(input.approvedSampleArtifact, {
    projectId: input.trackPlan.projectId,
    kind: "audiobook-retail-sample",
    id: input.sampleReview.sampleArtifact.id,
    originalRevision: input.sampleReview.sampleArtifact.revision,
    originalFingerprint: input.sampleReview.sampleArtifact.fingerprint,
    approvedRevision: sampleApproval.approvedArtifactRevision,
    approvedFingerprint: sampleApproval.approvedArtifactFingerprint,
    approvedReviewFingerprint: sampleApproval.artifactReviewFingerprint,
    contentHash: input.sampleReview.sampleArtifact.contentHash,
    byteCount: input.sampleReview.sampleArtifact.byteCount,
    rightsFingerprint,
    now: createdAt,
  });
  if (approvedArtifactIds.has(input.approvedSampleArtifact.id)) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_ARTIFACT_DUPLICATE",
    );
  }
  files.push(sampleFile(
    files.length + 1,
    input.samplePlan,
    input.sampleReview,
    input.approvedSampleArtifact,
  ));

  const totalTrackDurationMs = input.trackReview.tracks.reduce(
    (total, track) => total + track.observedDurationMs,
    0,
  );
  const totalMediaBytes = files.reduce(
    (total, file) => total + file.artifact.byteCount,
    0,
  );
  const derivedId = `retail_package_manifest_${stableHash({
    trackPlan: input.trackPlan.fingerprint,
    trackReview: input.trackReview.fingerprint,
    samplePlan: input.samplePlan.fingerprint,
    sampleReview: input.sampleReview.fingerprint,
    files: files.map((file) => file.fingerprint),
  }).slice(0, 24)}`;
  const partial: Omit<AudiobookRetailPackageManifest, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SCHEMA_VERSION,
    id: requireIdentifier(
      input.id ?? derivedId,
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_ID_INVALID",
    ),
    projectId: input.trackPlan.projectId,
    bookId: input.trackPlan.bookId,
    distributor: "acx-audible",
    policy: Object.freeze({
      id: input.trackPlan.policy.id,
      externalVersion: input.trackPlan.policy.externalVersion,
      reviewedAt: input.trackPlan.policy.reviewedAt,
      expiresAt: input.trackPlan.policy.expiresAt,
      fingerprint: input.trackPlan.policy.fingerprint,
    }),
    rightsFingerprint,
    trackPlan: Object.freeze({
      id: input.trackPlan.id,
      fingerprint: input.trackPlan.fingerprint,
    }),
    trackReview: Object.freeze({
      sessionId: input.trackReview.id,
      sessionRevision: input.trackReview.revision,
      sessionFingerprint: input.trackReview.fingerprint,
      approvalFingerprint: trackApproval.fingerprint,
      approvedAt: trackApproval.approvedAt,
    }),
    samplePlan: Object.freeze({
      id: input.samplePlan.id,
      fingerprint: input.samplePlan.fingerprint,
    }),
    sampleReview: Object.freeze({
      sessionId: input.sampleReview.id,
      sessionRevision: input.sampleReview.revision,
      sessionFingerprint: input.sampleReview.fingerprint,
      approvalFingerprint: sampleApproval.fingerprint,
      approvedAt: sampleApproval.approvedAt,
    }),
    files: Object.freeze(files),
    trackCount: input.trackPlan.tracks.length,
    mediaFileCount: files.length,
    totalTrackDurationMs,
    sampleDurationMs: input.sampleReview.durationMs,
    totalMediaBytes,
    status: "ready-for-package-build",
    createdByActorId: input.createdByActorId,
    createdAt: createdAt.toISOString(),
    revision: 1,
  };
  const manifest = Object.freeze({
    ...partial,
    fingerprint: manifestFingerprint(partial),
  });
  assertAudiobookRetailPackageManifest(manifest);
  if (!constructingUnchecked) {
    assertAudiobookRetailPackageManifestMatchesSources(manifest, input);
  }
  return manifest;
}

function assertArtifactSnapshot(
  artifact: AudiobookRetailPackageArtifactSnapshot,
): void {
  requireIdentifier(
    artifact.id,
    "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_ARTIFACT_ID_INVALID",
  );
  requireInteger(
    artifact.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_ARTIFACT_REVISION_INVALID",
  );
  for (const [value, code] of [
    [artifact.fingerprint, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_ARTIFACT_FINGERPRINT_INVALID"],
    [artifact.contentHash, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_ARTIFACT_HASH_INVALID"],
    [artifact.reviewFingerprint, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_REVIEW_HASH_INVALID"],
  ] as const) requireHash(value, code);
  requireInteger(
    artifact.byteCount,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_ARTIFACT_SIZE_INVALID",
  );
}

function assertFile(file: AudiobookRetailPackageMediaFile): void {
  requireInteger(
    file.ordinal,
    1,
    MAXIMUM_FILES,
    "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_ORDINAL_INVALID",
  );
  if (
    file.kind !== "audiobook-track"
    && file.kind !== "retail-sample"
  ) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_KIND_INVALID",
    );
  }
  if (!FILE_NAME_PATTERN.test(file.fileName)) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_NAME_INVALID",
    );
  }
  if (
    file.kind === "retail-sample"
      ? file.role !== "retail-sample" || file.fileName !== "RetailSample.mp3"
      : file.role === "retail-sample"
  ) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_ROLE_INVALID",
    );
  }
  requireInteger(
    file.expectedDurationMs,
    1,
    file.kind === "retail-sample"
      ? MAXIMUM_SAMPLE_DURATION_MS
      : 7_200_000,
    "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_DURATION_INVALID",
  );
  requireInteger(
    file.observedDurationMs,
    1,
    file.kind === "retail-sample"
      ? MAXIMUM_SAMPLE_DURATION_MS + 10_000
      : 7_210_000,
    "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_DURATION_INVALID",
  );
  assertArtifactSnapshot(file.artifact);
  requireHash(
    file.sourceFingerprint,
    "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_SOURCE_HASH_INVALID",
  );
  const { fingerprint, ...partial } = file;
  if (fileFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailPackageManifest(
  manifest: AudiobookRetailPackageManifest,
): void {
  if (
    manifest.schemaVersion
      !== AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [manifest.id, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_ID_INVALID"],
    [manifest.projectId, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_PROJECT_ID_INVALID"],
    [manifest.bookId, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_BOOK_ID_INVALID"],
    [manifest.policy.id, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_POLICY_ID_INVALID"],
    [manifest.trackPlan.id, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_TRACK_PLAN_ID_INVALID"],
    [manifest.trackReview.sessionId, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_TRACK_REVIEW_ID_INVALID"],
    [manifest.samplePlan.id, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SAMPLE_PLAN_ID_INVALID"],
    [manifest.sampleReview.sessionId, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SAMPLE_REVIEW_ID_INVALID"],
    [manifest.createdByActorId, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_ACTOR_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  if (manifest.distributor !== "acx-audible") {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_DISTRIBUTOR_INVALID",
    );
  }
  for (const [value, code] of [
    [manifest.policy.fingerprint, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_POLICY_HASH_INVALID"],
    [manifest.rightsFingerprint, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_RIGHTS_HASH_INVALID"],
    [manifest.trackPlan.fingerprint, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_TRACK_PLAN_HASH_INVALID"],
    [manifest.trackReview.sessionFingerprint, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_TRACK_REVIEW_HASH_INVALID"],
    [manifest.trackReview.approvalFingerprint, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_TRACK_APPROVAL_HASH_INVALID"],
    [manifest.samplePlan.fingerprint, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SAMPLE_PLAN_HASH_INVALID"],
    [manifest.sampleReview.sessionFingerprint, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SAMPLE_REVIEW_HASH_INVALID"],
    [manifest.sampleReview.approvalFingerprint, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SAMPLE_APPROVAL_HASH_INVALID"],
  ] as const) requireHash(value, code);
  if (!manifest.policy.externalVersion.trim()) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_POLICY_VERSION_INVALID",
    );
  }
  requireDate(
    manifest.policy.reviewedAt,
    "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_POLICY_DATE_INVALID",
  );
  requireDate(
    manifest.policy.expiresAt,
    "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_POLICY_DATE_INVALID",
  );
  requireDate(
    manifest.trackReview.approvedAt,
    "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_APPROVAL_DATE_INVALID",
  );
  requireDate(
    manifest.sampleReview.approvedAt,
    "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_APPROVAL_DATE_INVALID",
  );
  for (const [value, code] of [
    [manifest.trackReview.sessionRevision, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_TRACK_REVIEW_REVISION_INVALID"],
    [manifest.sampleReview.sessionRevision, "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SAMPLE_REVIEW_REVISION_INVALID"],
  ] as const) requireInteger(value, 1, Number.MAX_SAFE_INTEGER, code);
  if (
    !Array.isArray(manifest.files)
    || manifest.files.length < 4
    || manifest.files.length > MAXIMUM_FILES
  ) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILES_INVALID",
    );
  }
  const names = new Set<string>();
  const artifactIds = new Set<string>();
  let totalBytes = 0;
  let trackDuration = 0;
  for (const [index, file] of manifest.files.entries()) {
    assertFile(file);
    if (
      file.ordinal !== index + 1
      || names.has(file.fileName)
      || artifactIds.has(file.artifact.id)
    ) {
      throw new AudiobookRetailPackageManifestError(
        "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_ORDER_INVALID",
      );
    }
    const last = index === manifest.files.length - 1;
    if (
      last
        ? file.kind !== "retail-sample"
        : file.kind !== "audiobook-track"
    ) {
      throw new AudiobookRetailPackageManifestError(
        "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SAMPLE_POSITION_INVALID",
      );
    }
    names.add(file.fileName);
    artifactIds.add(file.artifact.id);
    totalBytes += file.artifact.byteCount;
    if (file.kind === "audiobook-track") {
      trackDuration += file.observedDurationMs;
    }
  }
  const first = manifest.files[0]!;
  const closing = manifest.files[manifest.files.length - 2]!;
  if (
    first.role !== "opening-credit"
    || closing.role !== "closing-credit"
  ) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_TRACK_ROLE_ORDER_INVALID",
    );
  }
  requireInteger(
    manifest.trackCount,
    3,
    MAXIMUM_TRACKS,
    "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_TRACK_COUNT_INVALID",
  );
  requireInteger(
    manifest.mediaFileCount,
    4,
    MAXIMUM_FILES,
    "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FILE_COUNT_INVALID",
  );
  if (
    manifest.trackCount !== manifest.files.length - 1
    || manifest.mediaFileCount !== manifest.files.length
  ) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_COUNTS_MISMATCH",
    );
  }
  requireInteger(
    manifest.totalTrackDurationMs,
    1,
    MAXIMUM_DURATION_MS,
    "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_TRACK_DURATION_INVALID",
  );
  requireInteger(
    manifest.sampleDurationMs,
    1,
    MAXIMUM_SAMPLE_DURATION_MS + 10_000,
    "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SAMPLE_DURATION_INVALID",
  );
  requireInteger(
    manifest.totalMediaBytes,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_TOTAL_SIZE_INVALID",
  );
  if (
    manifest.totalTrackDurationMs !== trackDuration
    || manifest.sampleDurationMs
      !== manifest.files.at(-1)!.observedDurationMs
    || manifest.totalMediaBytes !== totalBytes
  ) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_AGGREGATES_MISMATCH",
    );
  }
  if (manifest.status !== "ready-for-package-build") {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_STATUS_INVALID",
    );
  }
  requireDate(
    manifest.createdAt,
    "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_DATE_INVALID",
  );
  if (
    Date.parse(manifest.createdAt) < Date.parse(manifest.trackReview.approvedAt)
    || Date.parse(manifest.createdAt) < Date.parse(manifest.sampleReview.approvedAt)
    || Date.parse(manifest.createdAt) >= Date.parse(manifest.policy.expiresAt)
  ) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_CHRONOLOGY_INVALID",
    );
  }
  if (manifest.revision !== 1) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_REVISION_INVALID",
    );
  }
  const { fingerprint, ...partial } = manifest;
  if (manifestFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailPackageManifestMatchesSources(
  manifest: AudiobookRetailPackageManifest,
  input: CreateAudiobookRetailPackageManifestInput,
): void {
  assertAudiobookRetailPackageManifest(manifest);
  const expected = createAudiobookRetailPackageManifestUnchecked({
    ...input,
    id: manifest.id,
    createdAt: new Date(manifest.createdAt),
  });
  if (expected.fingerprint !== manifest.fingerprint) {
    throw new AudiobookRetailPackageManifestError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SOURCE_MISMATCH",
    );
  }
}

function createAudiobookRetailPackageManifestUnchecked(
  input: CreateAudiobookRetailPackageManifestInput,
): AudiobookRetailPackageManifest {
  const original = createAudiobookRetailPackageManifest;
  constructingUnchecked = true;
  try {
    return original(input);
  } finally {
    constructingUnchecked = false;
  }
}

let constructingUnchecked = false;

export function audiobookRetailPackageManifestPublicView(
  manifest: AudiobookRetailPackageManifest,
): AudiobookRetailPackageManifestPublicView {
  assertAudiobookRetailPackageManifest(manifest);
  return Object.freeze({
    id: manifest.id,
    bookId: manifest.bookId,
    distributor: manifest.distributor,
    policyVersion: manifest.policy.externalVersion,
    trackCount: manifest.trackCount,
    mediaFileCount: manifest.mediaFileCount,
    totalTrackDurationMs: manifest.totalTrackDurationMs,
    sampleDurationMs: manifest.sampleDurationMs,
    totalMediaBytes: manifest.totalMediaBytes,
    files: Object.freeze(manifest.files.map((file) => Object.freeze({
      ordinal: file.ordinal,
      kind: file.kind,
      role: file.role,
      fileName: file.fileName,
      expectedDurationMs: file.expectedDurationMs,
      observedDurationMs: file.observedDurationMs,
      byteCount: file.artifact.byteCount,
    }))),
    status: manifest.status,
    createdAt: manifest.createdAt,
    fingerprint: manifest.fingerprint,
  });
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<AudiobookRetailPackageManifest> {
  const manifest = envelope.payload as unknown as AudiobookRetailPackageManifest;
  assertAudiobookRetailPackageManifest(manifest);
  if (
    envelope.entityType !== AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_ENTITY_TYPE
    || envelope.entityId !== manifest.id
    || envelope.revision !== manifest.revision
  ) {
    throw new AudiobookRetailPackageManifestStoreConflictError(
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<AudiobookRetailPackageManifest>;
}

function payload(
  manifest: AudiobookRetailPackageManifest,
): Record<string, unknown> {
  return manifest as unknown as Record<string, unknown>;
}

export class FileAudiobookRetailPackageManifestStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    manifest: AudiobookRetailPackageManifest,
    actorId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPackageManifest>> {
    assertAudiobookRetailPackageManifest(manifest);
    requireIdentifier(
      actorId,
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_STORE_ACTOR_INVALID",
    );
    try {
      const existing = await this.read(manifest.id);
      if (existing) {
        if (existing.payload.fingerprint === manifest.fingerprint) return existing;
        throw new AudiobookRetailPackageManifestStoreConflictError(
          "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_STORE_IDEMPOTENCY_CONFLICT",
        );
      }
      const envelope = toEnvelope(await this.#store.create(
        AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_ENTITY_TYPE,
        manifest.id,
        payload(manifest),
        new Date(manifest.createdAt),
      ));
      await this.#store.appendAuditEvent({
        actorId,
        action: "audiobook_retail_package_manifest.created",
        entityType: AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_ENTITY_TYPE,
        entityId: envelope.entityId,
        revision: envelope.revision,
        occurredAt: new Date(envelope.savedAt),
        metadata: {
          status: manifest.status,
          trackCount: manifest.trackCount,
          mediaFileCount: manifest.mediaFileCount,
          totalMediaBytes: manifest.totalMediaBytes,
          sampleDurationMs: manifest.sampleDurationMs,
        },
      });
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailPackageManifestStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(
    manifestId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPackageManifest> | null> {
    requireIdentifier(
      manifestId,
      "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_STORE_ID_INVALID",
    );
    const envelope = await this.#store.read<Record<string, unknown>>(
      AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_ENTITY_TYPE,
      manifestId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(
    manifestId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPackageManifest>> {
    const envelope = await this.read(manifestId);
    if (!envelope) {
      throw new AudiobookRetailPackageManifestStoreConflictError(
        "AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }
}
