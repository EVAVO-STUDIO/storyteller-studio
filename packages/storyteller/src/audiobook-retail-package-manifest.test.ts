import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createArtifactRecord,
  recordArtifactReview,
  verifyArtifactIntegrity,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import {
  FileAudiobookRetailPackageManifestStore,
  assertAudiobookRetailPackageManifest,
  assertAudiobookRetailPackageManifestMatchesSources,
  audiobookRetailPackageManifestPublicView,
  createAudiobookRetailPackageManifest,
  type AudiobookRetailPackageManifest,
} from "./audiobook-retail-package-manifest.js";
import {
  AUDIOBOOK_RETAIL_SAMPLE_PLAN_SCHEMA_VERSION,
  assertAudiobookRetailSamplePlan,
  type AudiobookRetailSamplePlan,
} from "./audiobook-retail-sample-plan.js";
import {
  AUDIOBOOK_RETAIL_SAMPLE_REVIEW_SCHEMA_VERSION,
  assertAudiobookRetailSampleReviewSession,
  type AudiobookRetailSampleReviewEntry,
  type AudiobookRetailSampleReviewScores,
  type AudiobookRetailSampleReviewSession,
} from "./audiobook-retail-sample-review.js";
import {
  AUDIOBOOK_RETAIL_TRACK_PLAN_SCHEMA_VERSION,
  assertAudiobookRetailTrackPlan,
  type AudiobookRetailTrack,
  type AudiobookRetailTrackOutput,
  type AudiobookRetailTrackPlan,
} from "./audiobook-retail-track-plan.js";
import {
  AUDIOBOOK_RETAIL_TRACK_REVIEW_SCHEMA_VERSION,
  assertAudiobookRetailTrackReviewSession,
  type AudiobookRetailTrackReviewEntry,
  type AudiobookRetailTrackReviewScores,
  type AudiobookRetailTrackReviewSession,
  type AudiobookRetailTrackReviewTrackSnapshot,
} from "./audiobook-retail-track-review.js";
import { stableHash } from "./index.js";
import { FileProjectStore } from "./project-store.js";

const baseMs = Date.parse("2026-07-28T00:00:00.000Z");
const at = (second: number): Date => new Date(baseMs + second * 1_000);
const rightsFingerprint = "a".repeat(64);
const output: AudiobookRetailTrackOutput = Object.freeze({
  format: "mp3",
  codec: "mp3",
  bitRateMode: "cbr",
  bitRateKbps: 192,
  sampleRateHz: 44_100,
  channels: 1,
});
const trackScores: AudiobookRetailTrackReviewScores = Object.freeze({
  spokenHeaderAccuracy: 5,
  contentCompleteness: 5,
  transitionIntegrity: 5,
  silenceIntegrity: 5,
  tonalConsistency: 5,
  encodingTransparency: 5,
  sustainedListenability: 5,
  freedomFromDefects: 5,
});
const sampleScores: AudiobookRetailSampleReviewScores = Object.freeze({
  startBoundaryIntegrity: 5,
  endBoundaryIntegrity: 5,
  contentContinuity: 5,
  representativeness: 5,
  spokenClarity: 5,
  encodingTransparency: 5,
  levelAndToneConsistency: 5,
  freedomFromDefects: 5,
});

function rights(
  overrides: Partial<ArtifactRightsSnapshot> = {},
): ArtifactRightsSnapshot {
  return {
    rightsEvidenceId: "rights_retail_package_manifest_001",
    rightsFingerprint,
    allowedUses: ["audiobook"],
    commercialUseApproved: true,
    expiresAt: "2028-07-28T00:00:00.000Z",
    retainUntil: "2033-07-28T00:00:00.000Z",
    deletionRequiredAt: "2034-07-28T00:00:00.000Z",
    ...overrides,
  };
}

function approvedArtifact(input: Readonly<{
  id: string;
  kind: "audiobook-retail-track" | "audiobook-retail-sample";
  projectId: string;
  jobId: string;
  segmentId: string;
  takeId: string;
  contentCharacter: string;
  parentIds: readonly string[];
  createdAtSecond: number;
  rights?: ArtifactRightsSnapshot;
}>): Readonly<{ original: ArtifactRecord; approved: ArtifactRecord }> {
  const initial = createArtifactRecord({
    id: input.id,
    kind: input.kind,
    projectId: input.projectId,
    jobId: input.jobId,
    segmentId: input.segmentId,
    takeId: input.takeId,
    storage: {
      driver: "private-object-store",
      provider: "storyteller-retail-package-manifest-test",
      container: "private-retail-package-manifest-test",
      objectKey: `sha256/${input.contentCharacter.repeat(64)}.mp3`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: input.contentCharacter.repeat(64),
      byteCount: 1_000_000 + input.createdAtSecond,
      mimeType: "audio/mpeg",
      format: "mp3",
    },
    provenance: {
      createdByActorId: `retail_package_encoder_${input.createdAtSecond}`,
      sourceContentHash: "b".repeat(64),
      generationRequestHash: "c".repeat(64),
      parentArtifactIds: input.parentIds,
    },
    rights: input.rights ?? rights(),
    reviewRequired: true,
  }, at(input.createdAtSecond));
  const original = verifyArtifactIntegrity(initial, {
    observedContentHash: initial.integrity.contentHash,
    observedByteCount: initial.integrity.byteCount,
    checkedByActorId: `retail_package_verifier_${input.createdAtSecond}`,
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: at(input.createdAtSecond + 1),
  });
  const approved = recordArtifactReview(original, {
    decision: "approved",
    reviewerId: `retail_package_release_manager_${input.createdAtSecond}`,
    notes: "Approved for immutable retail package planning.",
    decidedAt: at(input.createdAtSecond + 2),
  });
  return Object.freeze({ original, approved });
}

function plannedTrack(input: Readonly<{
  ordinal: number;
  role: AudiobookRetailTrack["role"];
  fileName: string;
  startMs: number;
  durationMs: number;
  headerKind: AudiobookRetailTrack["headerKind"];
}>): AudiobookRetailTrack {
  const character = String((input.ordinal % 8) + 1);
  const partial: Omit<AudiobookRetailTrack, "fingerprint"> = {
    ordinal: input.ordinal,
    role: input.role,
    fileName: input.fileName,
    sourceStartMs: input.startMs,
    sourceEndMs: input.startMs + input.durationMs,
    durationMs: input.durationMs,
    source: Object.freeze({
      componentOrdinal: input.ordinal,
      componentFingerprint: character.repeat(64),
      artifactId: `artifact_package_source_${input.ordinal}`,
      artifactRevision: 3,
      artifactFingerprint: String(input.ordinal + 2).repeat(64),
      contentHash: String(input.ordinal + 4).repeat(64),
      byteCount: 240_000 + input.ordinal,
    }),
    headerKind: input.headerKind,
    sectionHeaderRequired: true,
    sectionHeaderReviewedUnderReferenceApproval: true,
    secondaryHeaderRequired: false,
    output,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
}

function trackPlan(projectId: string, bookId: string): AudiobookRetailTrackPlan {
  const tracks = Object.freeze([
    plannedTrack({
      ordinal: 1,
      role: "opening-credit",
      fileName: "0001OpeningCredits.mp3",
      startMs: 0,
      durationMs: 5_000,
      headerKind: "opening-credit",
    }),
    plannedTrack({
      ordinal: 2,
      role: "chapter",
      fileName: "0002Chapter0001.mp3",
      startMs: 5_000,
      durationMs: 60_000,
      headerKind: "chapter-title",
    }),
    plannedTrack({
      ordinal: 3,
      role: "closing-credit",
      fileName: "0003ClosingCredits.mp3",
      startMs: 65_000,
      durationMs: 6_000,
      headerKind: "closing-credit",
    }),
  ]);
  const partial: Omit<AudiobookRetailTrackPlan, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_TRACK_PLAN_SCHEMA_VERSION,
    id: "retail_track_plan_package_001",
    projectId,
    bookId,
    distributor: "acx-audible",
    policy: Object.freeze({
      id: "retail_policy_package_001",
      externalVersion: "acx-2026-07",
      reviewedAt: "2026-07-27T00:00:00.000Z",
      expiresAt: "2027-07-27T00:00:00.000Z",
      fingerprint: "1".repeat(64),
    }),
    narration: Object.freeze({
      evidenceId: "retail_narration_package_001",
      sourceKind: "human-performance",
      evidenceFingerprint: "2".repeat(64),
      platformAuthorisationPresent: false,
    }),
    sequence: Object.freeze({
      id: "audiobook_sequence_package_001",
      revision: 1,
      fingerprint: "3".repeat(64),
      componentCount: 3,
      chapterCount: 1,
      expectedDurationMs: 71_000,
      outputFingerprint: "4".repeat(64),
    }),
    referenceMaster: Object.freeze({
      id: "artifact_reference_package_001",
      revision: 3,
      fingerprint: "5".repeat(64),
      contentHash: "6".repeat(64),
      byteCount: 9_000_000,
      expectedDurationMs: 71_000,
      observedDurationMs: 71_000,
      durationDriftMs: 0,
    }),
    review: Object.freeze({
      sessionId: "reference_review_package_001",
      sessionRevision: 4,
      sessionFingerprint: "7".repeat(64),
      approvalFingerprint: "8".repeat(64),
      approvedAt: at(3).toISOString(),
    }),
    output,
    tracks,
    blockers: Object.freeze([]),
    status: "ready-for-encoding",
    createdByActorId: "retail_package_track_planner_001",
    createdAt: at(4).toISOString(),
  };
  const plan = Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
  assertAudiobookRetailTrackPlan(plan);
  return plan;
}

function trackReviewEntry(input: Readonly<{
  id: string;
  trackOrdinal: number;
  role: "editorial" | "engineering";
  reviewerId: string;
  durationMs: number;
  decidedAtSecond: number;
}>): AudiobookRetailTrackReviewEntry {
  const partial: Omit<AudiobookRetailTrackReviewEntry, "fingerprint"> = {
    id: input.id,
    trackOrdinal: input.trackOrdinal,
    role: input.role,
    reviewerId: input.reviewerId,
    completeListenConfirmed: true,
    listenedDurationMs: input.durationMs,
    headerConfirmed: true,
    openingBoundaryConfirmed: true,
    closingBoundaryConfirmed: true,
    playbackContexts: input.role === "editorial"
      ? Object.freeze(["consumer-headphones", "speakers"])
      : Object.freeze(["studio-headphones"]),
    decision: "approve",
    scores: trackScores,
    findingCodes: Object.freeze([]),
    decidedAt: at(input.decidedAtSecond).toISOString(),
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
}

function trackReviewFixture(
  plan: AudiobookRetailTrackPlan,
  artifacts: readonly Readonly<{
    original: ArtifactRecord;
    approved: ArtifactRecord;
  }>[],
): AudiobookRetailTrackReviewSession {
  const tracks = Object.freeze(plan.tracks.map((planned, index) => {
    const original = artifacts[index]!.original;
    const partial: Omit<AudiobookRetailTrackReviewTrackSnapshot, "fingerprint"> = {
      ordinal: planned.ordinal,
      role: planned.role,
      fileName: planned.fileName,
      expectedDurationMs: planned.durationMs,
      observedDurationMs: planned.durationMs,
      artifact: Object.freeze({
        id: original.id,
        revision: original.revision,
        fingerprint: original.fingerprint,
        contentHash: original.integrity.contentHash,
        byteCount: original.integrity.byteCount,
      }),
      engineeringEvidenceFingerprint: String(index + 4).repeat(64),
    };
    return Object.freeze({
      ...partial,
      fingerprint: stableHash(partial),
    });
  }));
  const reviews = Object.freeze(tracks.flatMap((track, index) => [
    trackReviewEntry({
      id: `retail_package_track_editorial_${track.ordinal}`,
      trackOrdinal: track.ordinal,
      role: "editorial",
      reviewerId: "retail_package_track_editorial_reviewer_001",
      durationMs: track.observedDurationMs,
      decidedAtSecond: 10 + index * 2,
    }),
    trackReviewEntry({
      id: `retail_package_track_engineering_${track.ordinal}`,
      trackOrdinal: track.ordinal,
      role: "engineering",
      reviewerId: "retail_package_track_engineering_reviewer_001",
      durationMs: track.observedDurationMs,
      decidedAtSecond: 11 + index * 2,
    }),
  ]));
  const readyBase: Omit<AudiobookRetailTrackReviewSession, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_TRACK_REVIEW_SCHEMA_VERSION,
    id: "retail_track_review_package_001",
    projectId: plan.projectId,
    bookId: plan.bookId,
    encodeChainFingerprint: "9".repeat(64),
    planFingerprint: plan.fingerprint,
    engineeringProfileFingerprint: "a".repeat(64),
    rightsFingerprint,
    tracks,
    requiredRoles: Object.freeze(["editorial", "engineering"]),
    reviews,
    status: "ready-for-approval",
    revision: 7,
    previousFingerprint: "b".repeat(64),
    createdAt: at(9).toISOString(),
    updatedAt: at(15).toISOString(),
  };
  const ready = Object.freeze({
    ...readyBase,
    fingerprint: stableHash(readyBase),
  });
  const reviewerSetFingerprint = stableHash(tracks.flatMap((track) => [
    {
      trackOrdinal: track.ordinal,
      role: "editorial",
      reviewerId: "retail_package_track_editorial_reviewer_001",
      reviewFingerprint: reviews.find((review) =>
        review.trackOrdinal === track.ordinal && review.role === "editorial"
      )!.fingerprint,
    },
    {
      trackOrdinal: track.ordinal,
      role: "engineering",
      reviewerId: "retail_package_track_engineering_reviewer_001",
      reviewFingerprint: reviews.find((review) =>
        review.trackOrdinal === track.ordinal && review.role === "engineering"
      )!.fingerprint,
    },
  ]));
  const approvalBase = {
    finalConfirmationId: "retail_package_track_confirmation_001",
    approvedByActorId: "retail_package_track_release_manager_001",
    approvedAt: at(16).toISOString(),
    reviewerSetFingerprint,
    approvedArtifacts: Object.freeze(artifacts.map((artifact, index) =>
      Object.freeze({
        ordinal: index + 1,
        id: artifact.approved.id,
        revision: artifact.approved.revision,
        fingerprint: artifact.approved.fingerprint,
        reviewFingerprint: stableHash(artifact.approved.review),
      })
    )),
  };
  const approval = Object.freeze({
    ...approvalBase,
    fingerprint: stableHash(approvalBase),
  });
  const approvedBase: Omit<AudiobookRetailTrackReviewSession, "fingerprint"> = {
    ...readyBase,
    status: "approved",
    approval,
    revision: 8,
    previousFingerprint: ready.fingerprint,
    updatedAt: at(16).toISOString(),
  };
  const approved = Object.freeze({
    ...approvedBase,
    fingerprint: stableHash(approvedBase),
  });
  assertAudiobookRetailTrackReviewSession(approved);
  return approved;
}

function samplePlanFixture(
  plan: AudiobookRetailTrackPlan,
  review: AudiobookRetailTrackReviewSession,
  chapterArtifact: ArtifactRecord,
): AudiobookRetailSamplePlan {
  const selectionBase = {
    selectedByActorId: "retail_package_sample_editor_001",
    completeRangeListenConfirmed: true as const,
    representativeOfBookConfirmed: true as const,
    startBoundaryConfirmed: true as const,
    endBoundaryConfirmed: true as const,
    selectionPreference: "preferred-book-beginning" as const,
    selectedAt: at(17).toISOString(),
  };
  const safetyBase = {
    reviewedByActorId: "retail_package_sample_safety_001",
    completeRangeListenConfirmed: true as const,
    sourceFromAudiobookConfirmed: true as const,
    explicitContentDetected: false as const,
    unsuitableRetailPreviewContentDetected: false as const,
    approvedForRetailPreview: true as const,
    reviewedAt: at(18).toISOString(),
  };
  const selection = Object.freeze({
    ...selectionBase,
    fingerprint: stableHash(selectionBase),
  });
  const safety = Object.freeze({
    ...safetyBase,
    fingerprint: stableHash(safetyBase),
  });
  const original = review.tracks[1]!.artifact;
  const approval = review.approval!.approvedArtifacts[1]!;
  const partial: Omit<AudiobookRetailSamplePlan, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_SAMPLE_PLAN_SCHEMA_VERSION,
    id: "retail_sample_plan_package_001",
    projectId: plan.projectId,
    bookId: plan.bookId,
    distributor: "acx-audible",
    policy: Object.freeze({
      id: plan.policy.id,
      externalVersion: plan.policy.externalVersion,
      reviewedAt: plan.policy.reviewedAt,
      expiresAt: plan.policy.expiresAt,
      fingerprint: plan.policy.fingerprint,
      maximumDurationMs: 300_000,
      explicitContentProhibited: true,
      humanContentSafetyReviewRequired: true,
    }),
    trackPlan: Object.freeze({
      id: plan.id,
      fingerprint: plan.fingerprint,
    }),
    encodeChainFingerprint: review.encodeChainFingerprint,
    trackReview: Object.freeze({
      sessionId: review.id,
      sessionRevision: review.revision,
      sessionFingerprint: review.fingerprint,
      approvalFingerprint: review.approval!.fingerprint,
      approvedAt: review.approval!.approvedAt,
    }),
    source: Object.freeze({
      trackOrdinal: 2,
      role: "chapter",
      fileName: plan.tracks[1]!.fileName,
      originalArtifactRevision: original.revision,
      originalArtifactFingerprint: original.fingerprint,
      approvedArtifactId: chapterArtifact.id,
      approvedArtifactRevision: chapterArtifact.revision,
      approvedArtifactFingerprint: chapterArtifact.fingerprint,
      approvedArtifactContentHash: chapterArtifact.integrity.contentHash,
      approvedArtifactByteCount: chapterArtifact.integrity.byteCount,
      approvedArtifactReviewFingerprint: approval.reviewFingerprint,
    }),
    range: Object.freeze({
      relativeStartMs: 0,
      relativeEndMs: 60_000,
      durationMs: 60_000,
      absoluteBookStartMs: 5_000,
      absoluteBookEndMs: 65_000,
    }),
    output: Object.freeze({
      fileName: "RetailSample.mp3",
      format: "mp3",
      codec: "mp3",
      bitRateMode: "cbr",
      bitRateKbps: 192,
      sampleRateHz: 44_100,
      channels: 1,
    }),
    selection,
    safety,
    status: "ready-for-rendering",
    createdAt: at(19).toISOString(),
    revision: 1,
  };
  const samplePlan = Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
  assertAudiobookRetailSamplePlan(samplePlan);
  return samplePlan;
}

function sampleReviewEntry(input: Readonly<{
  role: "editorial" | "engineering";
  decidedAtSecond: number;
}>): AudiobookRetailSampleReviewEntry {
  const partial: Omit<AudiobookRetailSampleReviewEntry, "fingerprint"> = {
    id: `retail_package_sample_${input.role}_review_001`,
    role: input.role,
    reviewerId: input.role === "editorial"
      ? "retail_package_sample_editorial_reviewer_001"
      : "retail_package_sample_engineering_reviewer_001",
    completePlaybackConfirmed: true,
    listenedDurationMs: 60_000,
    startBoundaryConfirmed: true,
    endBoundaryConfirmed: true,
    sourceContinuityConfirmed: true,
    retailSuitabilityConfirmed: true,
    contentSafetyConfirmed: true,
    playbackContexts: input.role === "editorial"
      ? Object.freeze(["consumer-headphones", "speakers"])
      : Object.freeze(["studio-headphones"]),
    decision: "approve",
    scores: sampleScores,
    findingCodes: Object.freeze([]),
    decidedAt: at(input.decidedAtSecond).toISOString(),
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
}

function sampleReviewFixture(
  plan: AudiobookRetailSamplePlan,
  sampleArtifact: Readonly<{
    original: ArtifactRecord;
    approved: ArtifactRecord;
  }>,
): AudiobookRetailSampleReviewSession {
  const reviews = Object.freeze([
    sampleReviewEntry({ role: "editorial", decidedAtSecond: 23 }),
    sampleReviewEntry({ role: "engineering", decidedAtSecond: 24 }),
  ]);
  const readyBase: Omit<AudiobookRetailSampleReviewSession, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_SAMPLE_REVIEW_SCHEMA_VERSION,
    id: "retail_sample_review_package_001",
    projectId: plan.projectId,
    bookId: plan.bookId,
    chainFingerprint: "d".repeat(64),
    plan: Object.freeze({
      id: plan.id,
      fingerprint: plan.fingerprint,
    }),
    sampleArtifact: Object.freeze({
      id: sampleArtifact.original.id,
      kind: "audiobook-retail-sample",
      revision: sampleArtifact.original.revision,
      fingerprint: sampleArtifact.original.fingerprint,
      contentHash: sampleArtifact.original.integrity.contentHash,
      byteCount: sampleArtifact.original.integrity.byteCount,
      reviewFingerprint: stableHash(sampleArtifact.original.review),
    }),
    engineering: Object.freeze({
      evidenceFingerprint: "e".repeat(64),
      profileFingerprint: "f".repeat(64),
    }),
    durationMs: 60_000,
    requiredRoles: Object.freeze(["editorial", "engineering"]),
    reviews,
    status: "ready-for-approval",
    revision: 3,
    previousFingerprint: "1".repeat(64),
    createdAt: at(22).toISOString(),
    updatedAt: at(24).toISOString(),
  };
  const ready = Object.freeze({
    ...readyBase,
    fingerprint: stableHash(readyBase),
  });
  const editorial = reviews[0]!;
  const engineering = reviews[1]!;
  const reviewerSetFingerprint = stableHash({
    editorial: {
      reviewerId: editorial.reviewerId,
      reviewFingerprint: editorial.fingerprint,
    },
    engineering: {
      reviewerId: engineering.reviewerId,
      reviewFingerprint: engineering.fingerprint,
    },
  });
  const approvalBase = {
    finalConfirmationId: "retail_package_sample_confirmation_001",
    approvedByActorId: "retail_package_sample_release_manager_001",
    approvedAt: at(25).toISOString(),
    reviewerSetFingerprint,
    artifactReviewFingerprint: stableHash(sampleArtifact.approved.review),
    approvedArtifactRevision: sampleArtifact.approved.revision,
    approvedArtifactFingerprint: sampleArtifact.approved.fingerprint,
  };
  const approval = Object.freeze({
    ...approvalBase,
    fingerprint: stableHash(approvalBase),
  });
  const approvedBase: Omit<AudiobookRetailSampleReviewSession, "fingerprint"> = {
    ...readyBase,
    status: "approved",
    approval,
    revision: 4,
    previousFingerprint: ready.fingerprint,
    updatedAt: at(25).toISOString(),
  };
  const approved = Object.freeze({
    ...approvedBase,
    fingerprint: stableHash(approvedBase),
  });
  assertAudiobookRetailSampleReviewSession(approved);
  return approved;
}

interface Fixture {
  input: Parameters<typeof createAudiobookRetailPackageManifest>[0];
  plan: AudiobookRetailTrackPlan;
  trackReview: AudiobookRetailTrackReviewSession;
  samplePlan: AudiobookRetailSamplePlan;
  sampleReview: AudiobookRetailSampleReviewSession;
  trackArtifacts: readonly ArtifactRecord[];
  sampleArtifact: ArtifactRecord;
}

function fixture(input: Readonly<{
  rights?: ArtifactRightsSnapshot;
}> = {}): Fixture {
  const projectId = "project_retail_package_manifest_001";
  const bookId = "book_retail_package_manifest_001";
  const artifactRights = input.rights ?? rights();
  const trackArtifacts = Object.freeze([
    approvedArtifact({
      id: "artifact_retail_package_opening_001",
      kind: "audiobook-retail-track",
      projectId,
      jobId: "job_retail_package_tracks_001",
      segmentId: "retail_package_opening_001",
      takeId: "take_retail_package_opening_001",
      contentCharacter: "4",
      parentIds: ["artifact_track_render_opening_001"],
      createdAtSecond: 5,
      rights: artifactRights,
    }),
    approvedArtifact({
      id: "artifact_retail_package_chapter_001",
      kind: "audiobook-retail-track",
      projectId,
      jobId: "job_retail_package_tracks_001",
      segmentId: "retail_package_chapter_001",
      takeId: "take_retail_package_chapter_001",
      contentCharacter: "5",
      parentIds: ["artifact_track_render_chapter_001"],
      createdAtSecond: 6,
      rights: artifactRights,
    }),
    approvedArtifact({
      id: "artifact_retail_package_closing_001",
      kind: "audiobook-retail-track",
      projectId,
      jobId: "job_retail_package_tracks_001",
      segmentId: "retail_package_closing_001",
      takeId: "take_retail_package_closing_001",
      contentCharacter: "6",
      parentIds: ["artifact_track_render_closing_001"],
      createdAtSecond: 7,
      rights: artifactRights,
    }),
  ]);
  const plan = trackPlan(projectId, bookId);
  const review = trackReviewFixture(plan, trackArtifacts);
  const samplePlan = samplePlanFixture(plan, review, trackArtifacts[1]!.approved);
  const sampleArtifact = approvedArtifact({
    id: "artifact_retail_package_sample_001",
    kind: "audiobook-retail-sample",
    projectId,
    jobId: "job_retail_package_sample_001",
    segmentId: bookId,
    takeId: "take_retail_package_sample_001",
    contentCharacter: "7",
    parentIds: [
      "artifact_sample_plan_001",
      "artifact_sample_render_001",
      trackArtifacts[1]!.approved.id,
    ],
    createdAtSecond: 20,
    rights: artifactRights,
  });
  const sampleReview = sampleReviewFixture(samplePlan, sampleArtifact);
  const approvedTrackArtifacts = Object.freeze(
    trackArtifacts.map((artifact) => artifact.approved),
  );
  return {
    input: {
      trackPlan: plan,
      trackReview: review,
      approvedTrackArtifacts,
      samplePlan,
      sampleReview,
      approvedSampleArtifact: sampleArtifact.approved,
      createdByActorId: "retail_package_manifest_builder_001",
      createdAt: at(30),
    },
    plan,
    trackReview: review,
    samplePlan,
    sampleReview,
    trackArtifacts: approvedTrackArtifacts,
    sampleArtifact: sampleArtifact.approved,
  };
}

test("approved tracks and approved sample become one immutable package manifest", async () => {
  const value = fixture();
  const manifest = createAudiobookRetailPackageManifest(value.input);

  assert.equal(manifest.status, "ready-for-package-build");
  assert.equal(manifest.trackCount, 3);
  assert.equal(manifest.mediaFileCount, 4);
  assert.deepEqual(
    manifest.files.map((file) => [file.ordinal, file.kind, file.role, file.fileName]),
    [
      [1, "audiobook-track", "opening-credit", "0001OpeningCredits.mp3"],
      [2, "audiobook-track", "chapter", "0002Chapter0001.mp3"],
      [3, "audiobook-track", "closing-credit", "0003ClosingCredits.mp3"],
      [4, "retail-sample", "retail-sample", "RetailSample.mp3"],
    ],
  );
  assert.equal(manifest.totalTrackDurationMs, 71_000);
  assert.equal(manifest.sampleDurationMs, 60_000);
  assert.equal(
    manifest.totalMediaBytes,
    [...value.trackArtifacts, value.sampleArtifact]
      .reduce((total, artifact) => total + artifact.integrity.byteCount, 0),
  );
  assert.doesNotThrow(() => assertAudiobookRetailPackageManifest(manifest));
  assert.doesNotThrow(() =>
    assertAudiobookRetailPackageManifestMatchesSources(manifest, value.input)
  );

  const root = await mkdtemp(join(tmpdir(), "storyteller-retail-package-manifest-"));
  try {
    const store = new FileAudiobookRetailPackageManifestStore(
      new FileProjectStore(root),
    );
    const first = await store.create(
      manifest,
      "retail_package_manifest_store_actor_001",
    );
    const second = await store.create(
      manifest,
      "retail_package_manifest_store_actor_001",
    );
    assert.equal(first.envelopeHash, second.envelopeHash);
    assert.equal((await store.require(manifest.id)).payload.fingerprint, manifest.fingerprint);

    const audit = await readFile(
      join(root, "audit", "2026-07-28.jsonl"),
      "utf8",
    );
    for (const forbidden of [
      value.trackArtifacts[0]!.id,
      value.trackArtifacts[1]!.integrity.contentHash,
      value.sampleArtifact.id,
      value.sampleArtifact.integrity.contentHash,
      value.trackReview.approval!.approvedByActorId,
      value.sampleReview.approval!.approvedByActorId,
    ]) {
      assert.equal(audit.includes(forbidden), false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  const view = audiobookRetailPackageManifestPublicView(manifest);
  const serialised = JSON.stringify(view);
  assert.equal(view.mediaFileCount, 4);
  for (const forbidden of [
    value.trackArtifacts[0]!.id,
    value.trackArtifacts[0]!.fingerprint,
    value.trackArtifacts[0]!.integrity.contentHash,
    value.sampleArtifact.id,
    value.sampleArtifact.fingerprint,
    value.sampleArtifact.integrity.contentHash,
    value.trackReview.id,
    value.sampleReview.id,
    manifest.rightsFingerprint,
    manifest.createdByActorId,
    "reviewFingerprint",
    "sourceFingerprint",
  ]) {
    assert.equal(serialised.includes(forbidden), false);
  }
});

test("missing, reordered or substituted approved artifacts fail before manifest creation", () => {
  const value = fixture();
  assert.throws(
    () => createAudiobookRetailPackageManifest({
      ...value.input,
      approvedTrackArtifacts: value.trackArtifacts.slice(0, 2),
    }),
    /AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_TRACK_COUNT_MISMATCH/u,
  );
  assert.throws(
    () => createAudiobookRetailPackageManifest({
      ...value.input,
      approvedTrackArtifacts: Object.freeze([
        value.trackArtifacts[1]!,
        value.trackArtifacts[0]!,
        value.trackArtifacts[2]!,
      ]),
    }),
    /AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_APPROVED_ARTIFACT_MISMATCH/u,
  );
  assert.throws(
    () => createAudiobookRetailPackageManifest({
      ...value.input,
      approvedSampleArtifact: value.trackArtifacts[1]!,
    }),
    /AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SAMPLE_SCOPE_MISMATCH|AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_APPROVED_ARTIFACT_MISMATCH/u,
  );
});

test("policy drift, expired rights and pre-approval chronology remain blocked", () => {
  const value = fixture();
  const changedSamplePlanBase: Omit<AudiobookRetailSamplePlan, "fingerprint"> = {
    ...value.samplePlan,
    policy: Object.freeze({
      ...value.samplePlan.policy,
      fingerprint: "0".repeat(64),
    }),
  };
  const changedSamplePlan = Object.freeze({
    ...changedSamplePlanBase,
    fingerprint: stableHash(changedSamplePlanBase),
  });
  assert.throws(
    () => createAudiobookRetailPackageManifest({
      ...value.input,
      samplePlan: changedSamplePlan,
    }),
    /AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_POLICY_MISMATCH|AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SCOPE_MISMATCH/u,
  );
  assert.throws(
    () => createAudiobookRetailPackageManifest({
      ...value.input,
      createdAt: at(15),
    }),
    /AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_CHRONOLOGY_INVALID/u,
  );

  const expired = fixture({
    rights: rights({ expiresAt: at(29).toISOString() }),
  });
  assert.throws(
    () => createAudiobookRetailPackageManifest(expired.input),
    /AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_RIGHTS_EXPIRED/u,
  );
});

test("recomputed structural state cannot replace the approved source set", () => {
  const value = fixture();
  const manifest = createAudiobookRetailPackageManifest(value.input);
  const { fingerprint: _fingerprint, ...base } = manifest;
  const changedBase: Omit<AudiobookRetailPackageManifest, "fingerprint"> = {
    ...base,
    trackPlan: Object.freeze({
      ...manifest.trackPlan,
      id: "retail_track_plan_package_structurally_wrong_001",
    }),
  };
  const changed = Object.freeze({
    ...changedBase,
    fingerprint: stableHash(changedBase),
  });
  assert.doesNotThrow(() => assertAudiobookRetailPackageManifest(changed));
  assert.throws(
    () => assertAudiobookRetailPackageManifestMatchesSources(changed, value.input),
    /AUDIOBOOK_RETAIL_PACKAGE_MANIFEST_SOURCE_MISMATCH/u,
  );
});
