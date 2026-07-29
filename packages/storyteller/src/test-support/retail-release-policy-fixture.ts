import type { ArtifactRightsSnapshot } from "../artifact-registry.js";
import {
  createAcxAudibleRetailEncodingPolicy,
  createAudiobookRetailNarrationEligibilityEvidence,
  createAudiobookRetailPlatformAuthorisation,
  type AudiobookRetailEncodingPolicy,
  type AudiobookRetailNarrationEligibilityEvidence,
  type AudiobookRetailNarrationSourceKind,
} from "../audiobook-retail-policy.js";
import {
  AUDIOBOOK_RETAIL_TRACK_PLAN_SCHEMA_VERSION,
  assertAudiobookRetailTrackPlan,
  type AudiobookRetailTrack,
  type AudiobookRetailTrackOutput,
  type AudiobookRetailTrackPlan,
} from "../audiobook-retail-track-plan.js";
import { stableHash } from "../index.js";

export const retailReleaseBaseMs = Date.parse("2026-07-29T00:00:00.000Z");
export const retailReleaseAt = (second: number): Date =>
  new Date(retailReleaseBaseMs + second * 1_000);
export const retailReleaseRightsFingerprint = "b".repeat(64);

const output: AudiobookRetailTrackOutput = Object.freeze({
  format: "mp3",
  codec: "mp3",
  bitRateMode: "cbr",
  bitRateKbps: 192,
  sampleRateHz: 44_100,
  channels: 1,
});

export function retailReleaseRights(
  overrides: Partial<ArtifactRightsSnapshot> = {},
): ArtifactRightsSnapshot {
  return Object.freeze({
    rightsEvidenceId: "rights_release_decision_001",
    rightsFingerprint: retailReleaseRightsFingerprint,
    allowedUses: Object.freeze(["audiobook"] as const),
    commercialUseApproved: true,
    expiresAt: "2026-08-10T00:00:00.000Z",
    retainUntil: "2033-07-29T00:00:00.000Z",
    deletionRequiredAt: "2034-07-29T00:00:00.000Z",
    ...overrides,
  });
}

export function retailReleasePolicy(): AudiobookRetailEncodingPolicy {
  return createAcxAudibleRetailEncodingPolicy({
    id: "retail_policy_release_decision_001",
    externalVersion: "acx-2026-07",
    reviewedAt: "2026-07-27T00:00:00.000Z",
    expiresAt: "2026-08-29T00:00:00.000Z",
    sourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    bitRateKbps: 192,
    now: retailReleaseAt(0),
  });
}

export function retailReleaseNarration(
  policy: AudiobookRetailEncodingPolicy,
  sourceKind: AudiobookRetailNarrationSourceKind = "human-performance",
): AudiobookRetailNarrationEligibilityEvidence {
  const platformAuthorisation = sourceKind === "human-performance"
    ? undefined
    : createAudiobookRetailPlatformAuthorisation({
        id: "retail_platform_authorisation_release_001",
        authorisationType: "title-specific",
        projectId: "project_release_decision_001",
        bookId: "book_release_decision_001",
        policy,
        authorisationEvidenceId: "retail_platform_evidence_release_001",
        effectiveAt: "2026-07-28T00:00:00.000Z",
        expiresAt: "2026-08-05T00:00:00.000Z",
        now: retailReleaseAt(1),
      });
  return createAudiobookRetailNarrationEligibilityEvidence({
    id: `retail_narration_release_${sourceKind.replaceAll("-", "_")}_001`,
    projectId: "project_release_decision_001",
    bookId: "book_release_decision_001",
    policy,
    sourceKind,
    rightsFingerprint: retailReleaseRightsFingerprint,
    attestedByActorId: "narration_rights_attestor_001",
    attestedAt: retailReleaseAt(1).toISOString(),
    ...(platformAuthorisation ? { platformAuthorisation } : {}),
    now: retailReleaseAt(1),
  });
}

function track(input: Readonly<{
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
      artifactId: `artifact_release_source_${input.ordinal}`,
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
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

export function retailReleaseTrackPlan(
  policy: AudiobookRetailEncodingPolicy,
  narration: AudiobookRetailNarrationEligibilityEvidence,
): AudiobookRetailTrackPlan {
  const tracks = Object.freeze([
    track({ ordinal: 1, role: "opening-credit", fileName: "0001OpeningCredits.mp3", startMs: 0, durationMs: 5_000, headerKind: "opening-credit" }),
    track({ ordinal: 2, role: "chapter", fileName: "0002Chapter0001.mp3", startMs: 5_000, durationMs: 60_000, headerKind: "chapter-title" }),
    track({ ordinal: 3, role: "closing-credit", fileName: "0003ClosingCredits.mp3", startMs: 65_000, durationMs: 6_000, headerKind: "closing-credit" }),
  ]);
  const partial: Omit<AudiobookRetailTrackPlan, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_TRACK_PLAN_SCHEMA_VERSION,
    id: "retail_track_plan_release_decision_001",
    projectId: narration.projectId,
    bookId: narration.bookId,
    distributor: "acx-audible",
    policy: Object.freeze({
      id: policy.id,
      externalVersion: policy.externalVersion,
      reviewedAt: policy.reviewedAt,
      expiresAt: policy.expiresAt,
      fingerprint: policy.fingerprint,
    }),
    narration: Object.freeze({
      evidenceId: narration.id,
      sourceKind: narration.sourceKind,
      evidenceFingerprint: narration.fingerprint,
      platformAuthorisationPresent: narration.platformAuthorisation !== undefined,
    }),
    sequence: Object.freeze({
      id: "audiobook_sequence_release_decision_001",
      revision: 1,
      fingerprint: "c".repeat(64),
      componentCount: 3,
      chapterCount: 1,
      expectedDurationMs: 71_000,
      outputFingerprint: "d".repeat(64),
    }),
    referenceMaster: Object.freeze({
      id: "artifact_reference_release_decision_001",
      revision: 4,
      fingerprint: "e".repeat(64),
      contentHash: "f".repeat(64),
      byteCount: 9_000_000,
      expectedDurationMs: 71_000,
      observedDurationMs: 71_000,
      durationDriftMs: 0,
    }),
    review: Object.freeze({
      sessionId: "reference_review_release_decision_001",
      sessionRevision: 4,
      sessionFingerprint: "1".repeat(64),
      approvalFingerprint: "2".repeat(64),
      approvedAt: "2026-07-28T23:59:58.000Z",
    }),
    output,
    tracks,
    blockers: Object.freeze([]),
    status: "ready-for-encoding",
    createdByActorId: "track_planner_release_decision_001",
    createdAt: retailReleaseAt(2).toISOString(),
  };
  const value = Object.freeze({ ...partial, fingerprint: stableHash(partial) });
  assertAudiobookRetailTrackPlan(value);
  return value;
}
