import {
  assertArtifactRecord,
  type ArtifactRecord,
} from "./artifact-registry.js";
import {
  assertAudiobookRetailTrackEncodeChain,
  type AudiobookRetailTrackEncodeChain,
} from "./audiobook-retail-track-encode.js";
import {
  assertAudiobookRetailTrackReviewMatchesChain,
  assertAudiobookRetailTrackReviewSession,
  type AudiobookRetailTrackReviewSession,
} from "./audiobook-retail-track-review.js";
import { stableHash } from "./index.js";
import {
  assertAdmittedNarratorRetailTrackPlan,
  type AdmittedNarratorRetailTrackPlan,
} from "./narrator-retail-track-admission.js";
import {
  assertExactNarratorVoicePin,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";

export const ADMITTED_NARRATOR_RETAIL_TRACK_APPROVAL_SCHEMA =
  "storyteller-admitted-narrator-retail-track-approval-v1" as const;

export interface AdmittedNarratorRetailTrackApproval {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAIL_TRACK_APPROVAL_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  admittedPlan: AdmittedNarratorRetailTrackPlan;
  encodeChain: AudiobookRetailTrackEncodeChain;
  reviewSession: AudiobookRetailTrackReviewSession;
  approvedTrackArtifacts: readonly ArtifactRecord[];
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  completeBookListeningApproval: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailTrackEngineeringComplete: true;
  retailTrackListeningApproval: true;
  eligibleForRetailSample: true;
  deliveryAuthority: false;
  releaseDecisionAuthority: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  approvedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailTrackApprovalPublicView {
  bookId: string;
  distributor: "acx-audible";
  policyVersion: string;
  trackCount: number;
  totalOutputBytes: number;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  completeBookListeningApproval: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailTrackEngineeringComplete: true;
  retailTrackListeningApproval: true;
  eligibleForRetailSample: true;
  deliveryAuthority: false;
  releaseDecisionAuthority: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  approvedAt: string;
  fingerprint: string;
}

export class AdmittedNarratorRetailTrackApprovalError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AdmittedNarratorRetailTrackApprovalError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new AdmittedNarratorRetailTrackApprovalError(code);
  }
  return value;
}

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new AdmittedNarratorRetailTrackApprovalError(code);
  }
  return value;
}

function requirePositiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AdmittedNarratorRetailTrackApprovalError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new AdmittedNarratorRetailTrackApprovalError(code);
  }
  return value;
}

function recordBase(
  value: Omit<AdmittedNarratorRetailTrackApproval, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function assertApprovedArtifacts(
  value: AdmittedNarratorRetailTrackApproval,
): void {
  const approval = value.reviewSession.approval;
  if (
    value.reviewSession.status !== "approved"
    || !approval
    || !Array.isArray(value.approvedTrackArtifacts)
    || value.approvedTrackArtifacts.length !== value.encodeChain.tracks.length
    || approval.approvedArtifacts.length !== value.encodeChain.tracks.length
  ) {
    throw new AdmittedNarratorRetailTrackApprovalError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_APPROVAL_INCOMPLETE",
    );
  }
  for (const [index, approved] of value.approvedTrackArtifacts.entries()) {
    assertArtifactRecord(approved);
    const encoded = value.encodeChain.tracks[index];
    const reviewed = value.reviewSession.tracks[index];
    const snapshot = approval.approvedArtifacts[index];
    const original = encoded?.artifact.payload;
    if (
      !encoded
      || !reviewed
      || !snapshot
      || !original
      || reviewed.ordinal !== encoded.ordinal
      || reviewed.artifact.id !== original.id
      || reviewed.artifact.revision !== original.revision
      || reviewed.artifact.fingerprint !== original.fingerprint
      || reviewed.artifact.contentHash !== original.integrity.contentHash
      || reviewed.artifact.byteCount !== original.integrity.byteCount
      || snapshot.ordinal !== encoded.ordinal
      || snapshot.id !== original.id
      || snapshot.revision !== original.revision + 1
      || approved.id !== original.id
      || approved.kind !== "audiobook-retail-track"
      || approved.projectId !== value.projectId
      || approved.revision !== snapshot.revision
      || approved.previousFingerprint !== original.fingerprint
      || approved.fingerprint !== snapshot.fingerprint
      || stableHash(approved.review) !== snapshot.reviewFingerprint
      || approved.integrity.contentHash !== original.integrity.contentHash
      || approved.integrity.byteCount !== original.integrity.byteCount
      || approved.review.status !== "approved"
      || approved.review.reviewerId !== approval.approvedByActorId
      || approved.verification.status !== "verified"
      || approved.quarantine !== undefined
      || approved.release.status !== "unavailable"
    ) {
      throw new AdmittedNarratorRetailTrackApprovalError(
        "ADMITTED_NARRATOR_RETAIL_TRACK_ARTIFACT_MISMATCH",
      );
    }
  }
}

function assertLineage(value: AdmittedNarratorRetailTrackApproval): void {
  assertAdmittedNarratorRetailTrackPlan(value.admittedPlan);
  assertAudiobookRetailTrackEncodeChain(value.encodeChain);
  assertAudiobookRetailTrackReviewSession(value.reviewSession);
  assertAudiobookRetailTrackReviewMatchesChain(
    value.reviewSession,
    value.encodeChain,
    new Date(value.approvedAt),
  );
  assertExactNarratorVoicePin(value.admittedPlan.voice, value.voice);
  const plan = value.admittedPlan;
  const chain = value.encodeChain;
  const approval = value.reviewSession.approval;
  if (
    value.projectId !== plan.projectId
    || value.bookId !== plan.bookId
    || value.profileAdmissionHash !== plan.profileAdmissionHash
    || value.admittedCastingFingerprint !== plan.admittedCastingFingerprint
    || value.castingFingerprint !== plan.castingFingerprint
    || chain.projectId !== plan.projectId
    || chain.bookId !== plan.bookId
    || chain.planId !== plan.plan.id
    || chain.planFingerprint !== plan.plan.fingerprint
    || chain.referenceMaster.id !== plan.plan.referenceMaster.id
    || chain.referenceMaster.revision !== plan.plan.referenceMaster.revision
    || chain.referenceMaster.fingerprint !== plan.plan.referenceMaster.fingerprint
    || chain.referenceMaster.contentHash !== plan.plan.referenceMaster.contentHash
    || chain.referenceMaster.byteCount !== plan.plan.referenceMaster.byteCount
    || chain.referenceMaster.rightsFingerprint
      !== plan.wholeBookApproval.approvedArtifact.rights.rightsFingerprint
    || value.reviewSession.projectId !== plan.projectId
    || value.reviewSession.bookId !== plan.bookId
    || value.reviewSession.encodeChainFingerprint !== chain.fingerprint
    || value.reviewSession.planFingerprint !== plan.plan.fingerprint
    || value.totalProductionJobCount !== plan.totalProductionJobCount
    || value.approvedAt !== approval?.approvedAt
    || Date.parse(value.approvedAt) < Date.parse(chain.createdAt)
  ) {
    throw new AdmittedNarratorRetailTrackApprovalError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_LINEAGE_MISMATCH",
    );
  }
  if (
    plan.retailEncodingEligible !== true
    || plan.plan.status !== "ready-for-encoding"
    || chain.eligibleForReview !== true
    || chain.findingCodes.length !== 0
    || value.narratorAdmissionComplete !== true
    || value.completeBookListeningApproval !== true
    || value.syntheticNarrationDeclared !== true
    || value.platformAuthorisationBound !== true
    || value.retailTrackEngineeringComplete !== true
    || value.retailTrackListeningApproval !== true
    || value.eligibleForRetailSample !== true
    || value.deliveryAuthority !== false
    || value.releaseDecisionAuthority !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorRetailTrackApprovalError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_AUTHORITY_INVALID",
    );
  }
  assertApprovedArtifacts(value);
}

export function createAdmittedNarratorRetailTrackApproval(input: Readonly<{
  admittedPlan: AdmittedNarratorRetailTrackPlan;
  encodeChain: AudiobookRetailTrackEncodeChain;
  reviewSession: AudiobookRetailTrackReviewSession;
  approvedTrackArtifacts: readonly ArtifactRecord[];
}>): AdmittedNarratorRetailTrackApproval {
  assertAdmittedNarratorRetailTrackPlan(input.admittedPlan);
  assertAudiobookRetailTrackEncodeChain(input.encodeChain);
  assertAudiobookRetailTrackReviewSession(input.reviewSession);
  const approval = input.reviewSession.approval;
  if (input.reviewSession.status !== "approved" || !approval) {
    throw new AdmittedNarratorRetailTrackApprovalError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_APPROVAL_INCOMPLETE",
    );
  }
  const partial: Omit<AdmittedNarratorRetailTrackApproval, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_TRACK_APPROVAL_SCHEMA,
    projectId: input.admittedPlan.projectId,
    bookId: input.admittedPlan.bookId,
    profileAdmissionHash: input.admittedPlan.profileAdmissionHash,
    admittedCastingFingerprint: input.admittedPlan.admittedCastingFingerprint,
    castingFingerprint: input.admittedPlan.castingFingerprint,
    voice: Object.freeze({ ...input.admittedPlan.voice }),
    admittedPlan: input.admittedPlan,
    encodeChain: input.encodeChain,
    reviewSession: input.reviewSession,
    approvedTrackArtifacts: Object.freeze([...input.approvedTrackArtifacts]),
    totalProductionJobCount: input.admittedPlan.totalProductionJobCount,
    narratorAdmissionComplete: true,
    completeBookListeningApproval: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailTrackEngineeringComplete: true,
    retailTrackListeningApproval: true,
    eligibleForRetailSample: true,
    deliveryAuthority: false,
    releaseDecisionAuthority: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    approvedAt: approval.approvedAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(recordBase(partial)),
  });
  assertAdmittedNarratorRetailTrackApproval(value);
  return value;
}

export function assertAdmittedNarratorRetailTrackApproval(
  value: AdmittedNarratorRetailTrackApproval,
): void {
  if (
    value.schemaVersion !== ADMITTED_NARRATOR_RETAIL_TRACK_APPROVAL_SCHEMA
  ) {
    throw new AdmittedNarratorRetailTrackApprovalError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    value.projectId,
    "ADMITTED_NARRATOR_RETAIL_TRACK_PROJECT_INVALID",
  );
  requireIdentifier(
    value.bookId,
    "ADMITTED_NARRATOR_RETAIL_TRACK_BOOK_INVALID",
  );
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
  ]) requireHash(hash, "ADMITTED_NARRATOR_RETAIL_TRACK_HASH_INVALID");
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_RETAIL_TRACK_JOB_COUNT_INVALID",
  );
  requireDate(
    value.approvedAt,
    "ADMITTED_NARRATOR_RETAIL_TRACK_DATE_INVALID",
  );
  assertLineage(value);
  const { fingerprint, ...partial } = value;
  if (
    !HASH.test(fingerprint)
    || fingerprint !== stableHash(recordBase(partial))
  ) {
    throw new AdmittedNarratorRetailTrackApprovalError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_FINGERPRINT_INVALID",
    );
  }
}

export function admittedNarratorRetailTrackApprovalPublicView(
  value: AdmittedNarratorRetailTrackApproval,
): AdmittedNarratorRetailTrackApprovalPublicView {
  assertAdmittedNarratorRetailTrackApproval(value);
  return Object.freeze({
    bookId: value.bookId,
    distributor: value.admittedPlan.plan.distributor,
    policyVersion: value.admittedPlan.plan.policy.externalVersion,
    trackCount: value.encodeChain.tracks.length,
    totalOutputBytes: value.encodeChain.totalOutputBytes,
    totalProductionJobCount: value.totalProductionJobCount,
    narratorAdmissionComplete: true,
    completeBookListeningApproval: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailTrackEngineeringComplete: true,
    retailTrackListeningApproval: true,
    eligibleForRetailSample: true,
    deliveryAuthority: false,
    releaseDecisionAuthority: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    approvedAt: value.approvedAt,
    fingerprint: value.fingerprint,
  });
}
