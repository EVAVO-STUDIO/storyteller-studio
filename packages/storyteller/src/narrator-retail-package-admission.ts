import {
  assertArtifactRecord,
  type ArtifactRecord,
} from "./artifact-registry.js";
import {
  assertAudiobookRetailPackageBuildEvidence,
  assertAudiobookRetailPackageBuildMatchesManifest,
  type AudiobookRetailPackageBuildEvidence,
} from "./audiobook-retail-package-build.js";
import {
  assertAudiobookRetailPackageInspectionEvidence,
  assertAudiobookRetailPackageInspectionMatchesSources,
  type AudiobookRetailPackageInspectionEvidence,
} from "./audiobook-retail-package-inspection.js";
import {
  assertAudiobookRetailPackageManifest,
  assertAudiobookRetailPackageManifestMatchesSources,
  type AudiobookRetailPackageManifest,
} from "./audiobook-retail-package-manifest.js";
import {
  assertAudiobookRetailPackageReviewMatchesSources,
  assertAudiobookRetailPackageReviewSession,
  type AudiobookRetailPackageReviewSession,
} from "./audiobook-retail-package-review.js";
import {
  assertAudiobookRetailSampleChain,
  type AudiobookRetailSampleChain,
} from "./audiobook-retail-sample.js";
import {
  assertAudiobookRetailSamplePlan,
  assertAudiobookRetailSamplePlanMatchesSources,
  type AudiobookRetailSamplePlan,
} from "./audiobook-retail-sample-plan.js";
import {
  assertAudiobookRetailSampleReviewMatchesChain,
  assertAudiobookRetailSampleReviewSession,
  type AudiobookRetailSampleReviewSession,
} from "./audiobook-retail-sample-review.js";
import { stableHash } from "./index.js";
import {
  assertAdmittedNarratorRetailTrackApproval,
  type AdmittedNarratorRetailTrackApproval,
} from "./narrator-retail-track-production.js";
import {
  assertExactNarratorVoicePin,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";

export const ADMITTED_NARRATOR_RETAIL_SAMPLE_APPROVAL_SCHEMA =
  "storyteller-admitted-narrator-retail-sample-approval-v1" as const;
export const ADMITTED_NARRATOR_RETAIL_PACKAGE_APPROVAL_SCHEMA =
  "storyteller-admitted-narrator-retail-package-approval-v1" as const;

export interface AdmittedNarratorRetailSampleApproval {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAIL_SAMPLE_APPROVAL_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  tracks: AdmittedNarratorRetailTrackApproval;
  plan: AudiobookRetailSamplePlan;
  chain: AudiobookRetailSampleChain;
  reviewSession: AudiobookRetailSampleReviewSession;
  approvedSampleArtifact: ArtifactRecord;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  completeBookListeningApproval: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailTrackListeningApproval: true;
  sampleContentSafetyApproval: true;
  retailSampleEngineeringComplete: true;
  retailSampleListeningApproval: true;
  eligibleForRetailPackage: true;
  deliveryAuthority: false;
  releaseDecisionAuthority: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  approvedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailSampleApprovalPublicView {
  bookId: string;
  distributor: "acx-audible";
  policyVersion: string;
  sourceTrackOrdinal: number;
  sourceRole: AudiobookRetailSamplePlan["source"]["role"];
  durationMs: number;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  completeBookListeningApproval: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailTrackListeningApproval: true;
  sampleContentSafetyApproval: true;
  retailSampleEngineeringComplete: true;
  retailSampleListeningApproval: true;
  eligibleForRetailPackage: true;
  deliveryAuthority: false;
  releaseDecisionAuthority: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  approvedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailPackageApproval {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAIL_PACKAGE_APPROVAL_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  sample: AdmittedNarratorRetailSampleApproval;
  manifest: AudiobookRetailPackageManifest;
  build: AudiobookRetailPackageBuildEvidence;
  inspection: AudiobookRetailPackageInspectionEvidence;
  reviewSession: AudiobookRetailPackageReviewSession;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  completeBookListeningApproval: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailTrackListeningApproval: true;
  retailSampleListeningApproval: true;
  privatePackageBuildComplete: true;
  privatePackageInspectionComplete: true;
  retailPackageReviewApproval: true;
  releaseDecisionEligible: true;
  deliveryAuthority: false;
  releaseDecisionAuthority: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  approvedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailPackageApprovalPublicView {
  bookId: string;
  distributor: "acx-audible";
  policyVersion: string;
  trackCount: number;
  mediaFileCount: number;
  packageFileCount: number;
  totalMediaBytes: number;
  totalPackageBytes: number;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  completeBookListeningApproval: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailTrackListeningApproval: true;
  retailSampleListeningApproval: true;
  privatePackageBuildComplete: true;
  privatePackageInspectionComplete: true;
  retailPackageReviewApproval: true;
  releaseDecisionEligible: true;
  deliveryAuthority: false;
  releaseDecisionAuthority: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  approvedAt: string;
  fingerprint: string;
}

export class AdmittedNarratorRetailPackageError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AdmittedNarratorRetailPackageError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new AdmittedNarratorRetailPackageError(code);
  }
  return value;
}

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new AdmittedNarratorRetailPackageError(code);
  }
  return value;
}

function requirePositiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AdmittedNarratorRetailPackageError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new AdmittedNarratorRetailPackageError(code);
  }
  return value;
}

function sampleBase(
  value: Omit<AdmittedNarratorRetailSampleApproval, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function packageBase(
  value: Omit<AdmittedNarratorRetailPackageApproval, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function selectedTrackArtifact(
  value: Pick<
    AdmittedNarratorRetailSampleApproval,
    "tracks" | "plan"
  >,
): ArtifactRecord {
  const artifact = value.tracks.approvedTrackArtifacts[
    value.plan.source.trackOrdinal - 1
  ];
  if (!artifact) {
    throw new AdmittedNarratorRetailPackageError(
      "ADMITTED_NARRATOR_RETAIL_SAMPLE_SOURCE_MISSING",
    );
  }
  assertArtifactRecord(artifact);
  return artifact;
}

function assertSamplePlanSources(
  value: AdmittedNarratorRetailSampleApproval,
  sourceArtifact: ArtifactRecord,
): void {
  const selection = value.plan.selection;
  const safety = value.plan.safety;
  assertAudiobookRetailSamplePlanMatchesSources(value.plan, {
    id: value.plan.id,
    policy: value.tracks.admittedPlan.policy,
    trackPlan: value.tracks.admittedPlan.plan,
    encodeChain: value.tracks.encodeChain,
    trackReview: value.tracks.reviewSession,
    approvedSourceArtifact: sourceArtifact,
    sourceTrackOrdinal: value.plan.source.trackOrdinal,
    relativeStartMs: value.plan.range.relativeStartMs,
    relativeEndMs: value.plan.range.relativeEndMs,
    selection: {
      selectedByActorId: selection.selectedByActorId,
      completeRangeListenConfirmed: true,
      representativeOfBookConfirmed: true,
      startBoundaryConfirmed: true,
      endBoundaryConfirmed: true,
      ...(selection.exceptionReason
        ? { exceptionReason: selection.exceptionReason }
        : {}),
      selectedAt: new Date(selection.selectedAt),
    },
    safety: {
      reviewedByActorId: safety.reviewedByActorId,
      completeRangeListenConfirmed: true,
      sourceFromAudiobookConfirmed: true,
      explicitContentDetected: false,
      unsuitableRetailPreviewContentDetected: false,
      approvedForRetailPreview: true,
      reviewedAt: new Date(safety.reviewedAt),
    },
    createdAt: new Date(value.plan.createdAt),
  });
}

function assertSampleArtifact(
  value: AdmittedNarratorRetailSampleApproval,
): void {
  assertArtifactRecord(value.approvedSampleArtifact);
  const original = value.chain.sample.payload;
  const approval = value.reviewSession.approval;
  if (
    value.reviewSession.status !== "approved"
    || !approval
    || value.approvedSampleArtifact.id !== original.id
    || value.approvedSampleArtifact.kind !== "audiobook-retail-sample"
    || value.approvedSampleArtifact.projectId !== value.projectId
    || value.approvedSampleArtifact.revision !== original.revision + 1
    || value.approvedSampleArtifact.revision
      !== approval.approvedArtifactRevision
    || value.approvedSampleArtifact.previousFingerprint !== original.fingerprint
    || value.approvedSampleArtifact.fingerprint
      !== approval.approvedArtifactFingerprint
    || stableHash(value.approvedSampleArtifact.review)
      !== approval.artifactReviewFingerprint
    || value.approvedSampleArtifact.integrity.contentHash
      !== original.integrity.contentHash
    || value.approvedSampleArtifact.integrity.byteCount
      !== original.integrity.byteCount
    || value.approvedSampleArtifact.review.status !== "approved"
    || value.approvedSampleArtifact.review.reviewerId
      !== approval.approvedByActorId
    || value.approvedSampleArtifact.verification.status !== "verified"
    || value.approvedSampleArtifact.quarantine !== undefined
    || value.approvedSampleArtifact.release.status !== "unavailable"
  ) {
    throw new AdmittedNarratorRetailPackageError(
      "ADMITTED_NARRATOR_RETAIL_SAMPLE_ARTIFACT_MISMATCH",
    );
  }
}

function assertSampleLineage(
  value: AdmittedNarratorRetailSampleApproval,
): void {
  assertAdmittedNarratorRetailTrackApproval(value.tracks);
  assertAudiobookRetailSamplePlan(value.plan);
  assertAudiobookRetailSampleChain(value.chain);
  assertAudiobookRetailSampleReviewSession(value.reviewSession);
  const approvedAt = new Date(requireDate(
    value.approvedAt,
    "ADMITTED_NARRATOR_RETAIL_SAMPLE_DATE_INVALID",
  ));
  assertAudiobookRetailSampleReviewMatchesChain(
    value.reviewSession,
    value.chain,
    { approvedArtifact: value.approvedSampleArtifact, now: approvedAt },
  );
  assertExactNarratorVoicePin(value.tracks.voice, value.voice);
  const sourceArtifact = selectedTrackArtifact(value);
  assertSamplePlanSources(value, sourceArtifact);
  assertSampleArtifact(value);
  const tracks = value.tracks;
  const plan = value.plan;
  const chain = value.chain;
  const reviewApproval = value.reviewSession.approval;
  if (
    value.projectId !== tracks.projectId
    || value.bookId !== tracks.bookId
    || value.profileAdmissionHash !== tracks.profileAdmissionHash
    || value.admittedCastingFingerprint !== tracks.admittedCastingFingerprint
    || value.castingFingerprint !== tracks.castingFingerprint
    || plan.projectId !== tracks.projectId
    || plan.bookId !== tracks.bookId
    || plan.policy.fingerprint !== tracks.admittedPlan.policy.fingerprint
    || plan.trackPlan.id !== tracks.admittedPlan.plan.id
    || plan.trackPlan.fingerprint !== tracks.admittedPlan.plan.fingerprint
    || plan.encodeChainFingerprint !== tracks.encodeChain.fingerprint
    || plan.trackReview.sessionFingerprint !== tracks.reviewSession.fingerprint
    || plan.trackReview.approvalFingerprint
      !== tracks.reviewSession.approval?.fingerprint
    || plan.source.approvedArtifactId !== sourceArtifact.id
    || plan.source.approvedArtifactRevision !== sourceArtifact.revision
    || plan.source.approvedArtifactFingerprint !== sourceArtifact.fingerprint
    || plan.source.approvedArtifactContentHash
      !== sourceArtifact.integrity.contentHash
    || plan.source.approvedArtifactByteCount
      !== sourceArtifact.integrity.byteCount
    || plan.source.approvedArtifactReviewFingerprint
      !== stableHash(sourceArtifact.review)
    || chain.projectId !== tracks.projectId
    || chain.bookId !== tracks.bookId
    || chain.planId !== plan.id
    || chain.planFingerprint !== plan.fingerprint
    || chain.approvedSource.id !== sourceArtifact.id
    || chain.approvedSource.revision !== sourceArtifact.revision
    || chain.approvedSource.fingerprint !== sourceArtifact.fingerprint
    || chain.approvedSource.contentHash !== sourceArtifact.integrity.contentHash
    || chain.approvedSource.byteCount !== sourceArtifact.integrity.byteCount
    || chain.approvedSource.reviewFingerprint !== stableHash(sourceArtifact.review)
    || chain.approvedSource.rightsFingerprint
      !== sourceArtifact.rights.rightsFingerprint
    || value.reviewSession.projectId !== tracks.projectId
    || value.reviewSession.bookId !== tracks.bookId
    || value.reviewSession.chainFingerprint !== chain.fingerprint
    || value.reviewSession.plan.fingerprint !== plan.fingerprint
    || value.totalProductionJobCount !== tracks.totalProductionJobCount
    || value.approvedAt !== reviewApproval?.approvedAt
    || approvedAt.getTime() < Date.parse(chain.createdAt)
  ) {
    throw new AdmittedNarratorRetailPackageError(
      "ADMITTED_NARRATOR_RETAIL_SAMPLE_LINEAGE_MISMATCH",
    );
  }
  if (
    tracks.retailTrackListeningApproval !== true
    || plan.status !== "ready-for-rendering"
    || plan.safety.approvedForRetailPreview !== true
    || chain.eligibleForReview !== true
    || chain.findingCodes.length !== 0
    || value.narratorAdmissionComplete !== true
    || value.completeBookListeningApproval !== true
    || value.syntheticNarrationDeclared !== true
    || value.platformAuthorisationBound !== true
    || value.retailTrackListeningApproval !== true
    || value.sampleContentSafetyApproval !== true
    || value.retailSampleEngineeringComplete !== true
    || value.retailSampleListeningApproval !== true
    || value.eligibleForRetailPackage !== true
    || value.deliveryAuthority !== false
    || value.releaseDecisionAuthority !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorRetailPackageError(
      "ADMITTED_NARRATOR_RETAIL_SAMPLE_AUTHORITY_INVALID",
    );
  }
}

export function createAdmittedNarratorRetailSampleApproval(input: Readonly<{
  tracks: AdmittedNarratorRetailTrackApproval;
  plan: AudiobookRetailSamplePlan;
  chain: AudiobookRetailSampleChain;
  reviewSession: AudiobookRetailSampleReviewSession;
  approvedSampleArtifact: ArtifactRecord;
}>): AdmittedNarratorRetailSampleApproval {
  assertAdmittedNarratorRetailTrackApproval(input.tracks);
  assertAudiobookRetailSamplePlan(input.plan);
  assertAudiobookRetailSampleChain(input.chain);
  assertAudiobookRetailSampleReviewSession(input.reviewSession);
  const approval = input.reviewSession.approval;
  if (input.reviewSession.status !== "approved" || !approval) {
    throw new AdmittedNarratorRetailPackageError(
      "ADMITTED_NARRATOR_RETAIL_SAMPLE_APPROVAL_INCOMPLETE",
    );
  }
  const partial: Omit<AdmittedNarratorRetailSampleApproval, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_SAMPLE_APPROVAL_SCHEMA,
    projectId: input.tracks.projectId,
    bookId: input.tracks.bookId,
    profileAdmissionHash: input.tracks.profileAdmissionHash,
    admittedCastingFingerprint: input.tracks.admittedCastingFingerprint,
    castingFingerprint: input.tracks.castingFingerprint,
    voice: Object.freeze({ ...input.tracks.voice }),
    tracks: input.tracks,
    plan: input.plan,
    chain: input.chain,
    reviewSession: input.reviewSession,
    approvedSampleArtifact: input.approvedSampleArtifact,
    totalProductionJobCount: input.tracks.totalProductionJobCount,
    narratorAdmissionComplete: true,
    completeBookListeningApproval: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailTrackListeningApproval: true,
    sampleContentSafetyApproval: true,
    retailSampleEngineeringComplete: true,
    retailSampleListeningApproval: true,
    eligibleForRetailPackage: true,
    deliveryAuthority: false,
    releaseDecisionAuthority: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    approvedAt: approval.approvedAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(sampleBase(partial)),
  });
  assertAdmittedNarratorRetailSampleApproval(value);
  return value;
}

export function assertAdmittedNarratorRetailSampleApproval(
  value: AdmittedNarratorRetailSampleApproval,
): void {
  if (
    value.schemaVersion !== ADMITTED_NARRATOR_RETAIL_SAMPLE_APPROVAL_SCHEMA
  ) {
    throw new AdmittedNarratorRetailPackageError(
      "ADMITTED_NARRATOR_RETAIL_SAMPLE_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    value.projectId,
    "ADMITTED_NARRATOR_RETAIL_SAMPLE_PROJECT_INVALID",
  );
  requireIdentifier(
    value.bookId,
    "ADMITTED_NARRATOR_RETAIL_SAMPLE_BOOK_INVALID",
  );
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
  ]) requireHash(hash, "ADMITTED_NARRATOR_RETAIL_SAMPLE_HASH_INVALID");
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_RETAIL_SAMPLE_JOB_COUNT_INVALID",
  );
  assertSampleLineage(value);
  const { fingerprint, ...partial } = value;
  if (
    !HASH.test(fingerprint)
    || fingerprint !== stableHash(sampleBase(partial))
  ) {
    throw new AdmittedNarratorRetailPackageError(
      "ADMITTED_NARRATOR_RETAIL_SAMPLE_FINGERPRINT_INVALID",
    );
  }
}

export function admittedNarratorRetailSampleApprovalPublicView(
  value: AdmittedNarratorRetailSampleApproval,
): AdmittedNarratorRetailSampleApprovalPublicView {
  assertAdmittedNarratorRetailSampleApproval(value);
  return Object.freeze({
    bookId: value.bookId,
    distributor: value.plan.distributor,
    policyVersion: value.plan.policy.externalVersion,
    sourceTrackOrdinal: value.plan.source.trackOrdinal,
    sourceRole: value.plan.source.role,
    durationMs: value.plan.range.durationMs,
    totalProductionJobCount: value.totalProductionJobCount,
    narratorAdmissionComplete: true,
    completeBookListeningApproval: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailTrackListeningApproval: true,
    sampleContentSafetyApproval: true,
    retailSampleEngineeringComplete: true,
    retailSampleListeningApproval: true,
    eligibleForRetailPackage: true,
    deliveryAuthority: false,
    releaseDecisionAuthority: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    approvedAt: value.approvedAt,
    fingerprint: value.fingerprint,
  });
}

function assertPackageManifestSources(
  value: AdmittedNarratorRetailPackageApproval,
): void {
  assertAudiobookRetailPackageManifestMatchesSources(value.manifest, {
    id: value.manifest.id,
    trackPlan: value.sample.tracks.admittedPlan.plan,
    trackReview: value.sample.tracks.reviewSession,
    approvedTrackArtifacts: value.sample.tracks.approvedTrackArtifacts,
    samplePlan: value.sample.plan,
    sampleReview: value.sample.reviewSession,
    approvedSampleArtifact: value.sample.approvedSampleArtifact,
    createdByActorId: value.manifest.createdByActorId,
    createdAt: new Date(value.manifest.createdAt),
  });
}

function assertPackageLineage(
  value: AdmittedNarratorRetailPackageApproval,
): void {
  assertAdmittedNarratorRetailSampleApproval(value.sample);
  assertAudiobookRetailPackageManifest(value.manifest);
  assertAudiobookRetailPackageBuildEvidence(value.build);
  assertAudiobookRetailPackageInspectionEvidence(value.inspection);
  assertAudiobookRetailPackageReviewSession(value.reviewSession);
  const approvedAt = new Date(requireDate(
    value.approvedAt,
    "ADMITTED_NARRATOR_RETAIL_PACKAGE_DATE_INVALID",
  ));
  assertPackageManifestSources(value);
  assertAudiobookRetailPackageBuildMatchesManifest(
    value.build,
    value.manifest,
  );
  assertAudiobookRetailPackageInspectionMatchesSources(
    value.inspection,
    value.build,
    value.manifest,
  );
  assertAudiobookRetailPackageReviewMatchesSources(value.reviewSession, {
    inspection: value.inspection,
    manifest: value.manifest,
    rights: value.sample.approvedSampleArtifact.rights,
    now: approvedAt,
  });
  assertExactNarratorVoicePin(value.sample.voice, value.voice);
  const sample = value.sample;
  const packageApproval = value.reviewSession.approval;
  if (
    value.projectId !== sample.projectId
    || value.bookId !== sample.bookId
    || value.profileAdmissionHash !== sample.profileAdmissionHash
    || value.admittedCastingFingerprint !== sample.admittedCastingFingerprint
    || value.castingFingerprint !== sample.castingFingerprint
    || value.manifest.projectId !== sample.projectId
    || value.manifest.bookId !== sample.bookId
    || value.manifest.policy.fingerprint
      !== sample.tracks.admittedPlan.policy.fingerprint
    || value.manifest.rightsFingerprint
      !== sample.approvedSampleArtifact.rights.rightsFingerprint
    || value.manifest.trackPlan.fingerprint
      !== sample.tracks.admittedPlan.plan.fingerprint
    || value.manifest.trackReview.sessionFingerprint
      !== sample.tracks.reviewSession.fingerprint
    || value.manifest.trackReview.approvalFingerprint
      !== sample.tracks.reviewSession.approval?.fingerprint
    || value.manifest.samplePlan.fingerprint !== sample.plan.fingerprint
    || value.manifest.sampleReview.sessionFingerprint
      !== sample.reviewSession.fingerprint
    || value.manifest.sampleReview.approvalFingerprint
      !== sample.reviewSession.approval?.fingerprint
    || value.build.projectId !== sample.projectId
    || value.build.bookId !== sample.bookId
    || value.build.sourceManifest.fingerprint !== value.manifest.fingerprint
    || value.inspection.projectId !== sample.projectId
    || value.inspection.bookId !== sample.bookId
    || value.inspection.sourceBuild.fingerprint !== value.build.fingerprint
    || value.inspection.sourceManifest.fingerprint !== value.manifest.fingerprint
    || value.reviewSession.projectId !== sample.projectId
    || value.reviewSession.bookId !== sample.bookId
    || value.reviewSession.inspection.fingerprint !== value.inspection.fingerprint
    || value.reviewSession.sourceManifest.fingerprint !== value.manifest.fingerprint
    || value.totalProductionJobCount !== sample.totalProductionJobCount
    || value.approvedAt !== packageApproval?.approvedAt
    || approvedAt.getTime() < Date.parse(value.inspection.inspectedAt)
  ) {
    throw new AdmittedNarratorRetailPackageError(
      "ADMITTED_NARRATOR_RETAIL_PACKAGE_LINEAGE_MISMATCH",
    );
  }
  if (
    sample.eligibleForRetailPackage !== true
    || value.manifest.status !== "ready-for-package-build"
    || value.build.status !== "ready-for-independent-inspection"
    || value.inspection.status !== "ready-for-final-package-review"
    || value.reviewSession.status !== "approved-for-release-decision"
    || packageApproval?.releaseDecisionEligible !== true
    || value.narratorAdmissionComplete !== true
    || value.completeBookListeningApproval !== true
    || value.syntheticNarrationDeclared !== true
    || value.platformAuthorisationBound !== true
    || value.retailTrackListeningApproval !== true
    || value.retailSampleListeningApproval !== true
    || value.privatePackageBuildComplete !== true
    || value.privatePackageInspectionComplete !== true
    || value.retailPackageReviewApproval !== true
    || value.releaseDecisionEligible !== true
    || value.deliveryAuthority !== false
    || value.releaseDecisionAuthority !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorRetailPackageError(
      "ADMITTED_NARRATOR_RETAIL_PACKAGE_AUTHORITY_INVALID",
    );
  }
}

export function createAdmittedNarratorRetailPackageApproval(input: Readonly<{
  sample: AdmittedNarratorRetailSampleApproval;
  manifest: AudiobookRetailPackageManifest;
  build: AudiobookRetailPackageBuildEvidence;
  inspection: AudiobookRetailPackageInspectionEvidence;
  reviewSession: AudiobookRetailPackageReviewSession;
}>): AdmittedNarratorRetailPackageApproval {
  assertAdmittedNarratorRetailSampleApproval(input.sample);
  assertAudiobookRetailPackageManifest(input.manifest);
  assertAudiobookRetailPackageBuildEvidence(input.build);
  assertAudiobookRetailPackageInspectionEvidence(input.inspection);
  assertAudiobookRetailPackageReviewSession(input.reviewSession);
  const approval = input.reviewSession.approval;
  if (
    input.reviewSession.status !== "approved-for-release-decision"
    || !approval
  ) {
    throw new AdmittedNarratorRetailPackageError(
      "ADMITTED_NARRATOR_RETAIL_PACKAGE_APPROVAL_INCOMPLETE",
    );
  }
  const partial: Omit<AdmittedNarratorRetailPackageApproval, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_PACKAGE_APPROVAL_SCHEMA,
    projectId: input.sample.projectId,
    bookId: input.sample.bookId,
    profileAdmissionHash: input.sample.profileAdmissionHash,
    admittedCastingFingerprint: input.sample.admittedCastingFingerprint,
    castingFingerprint: input.sample.castingFingerprint,
    voice: Object.freeze({ ...input.sample.voice }),
    sample: input.sample,
    manifest: input.manifest,
    build: input.build,
    inspection: input.inspection,
    reviewSession: input.reviewSession,
    totalProductionJobCount: input.sample.totalProductionJobCount,
    narratorAdmissionComplete: true,
    completeBookListeningApproval: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailTrackListeningApproval: true,
    retailSampleListeningApproval: true,
    privatePackageBuildComplete: true,
    privatePackageInspectionComplete: true,
    retailPackageReviewApproval: true,
    releaseDecisionEligible: true,
    deliveryAuthority: false,
    releaseDecisionAuthority: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    approvedAt: approval.approvedAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(packageBase(partial)),
  });
  assertAdmittedNarratorRetailPackageApproval(value);
  return value;
}

export function assertAdmittedNarratorRetailPackageApproval(
  value: AdmittedNarratorRetailPackageApproval,
): void {
  if (
    value.schemaVersion !== ADMITTED_NARRATOR_RETAIL_PACKAGE_APPROVAL_SCHEMA
  ) {
    throw new AdmittedNarratorRetailPackageError(
      "ADMITTED_NARRATOR_RETAIL_PACKAGE_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    value.projectId,
    "ADMITTED_NARRATOR_RETAIL_PACKAGE_PROJECT_INVALID",
  );
  requireIdentifier(
    value.bookId,
    "ADMITTED_NARRATOR_RETAIL_PACKAGE_BOOK_INVALID",
  );
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
  ]) requireHash(hash, "ADMITTED_NARRATOR_RETAIL_PACKAGE_HASH_INVALID");
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_RETAIL_PACKAGE_JOB_COUNT_INVALID",
  );
  assertPackageLineage(value);
  const { fingerprint, ...partial } = value;
  if (
    !HASH.test(fingerprint)
    || fingerprint !== stableHash(packageBase(partial))
  ) {
    throw new AdmittedNarratorRetailPackageError(
      "ADMITTED_NARRATOR_RETAIL_PACKAGE_FINGERPRINT_INVALID",
    );
  }
}

export function admittedNarratorRetailPackageApprovalPublicView(
  value: AdmittedNarratorRetailPackageApproval,
): AdmittedNarratorRetailPackageApprovalPublicView {
  assertAdmittedNarratorRetailPackageApproval(value);
  return Object.freeze({
    bookId: value.bookId,
    distributor: value.manifest.distributor,
    policyVersion: value.manifest.policy.externalVersion,
    trackCount: value.manifest.trackCount,
    mediaFileCount: value.manifest.mediaFileCount,
    packageFileCount: value.inspection.packageFileCount,
    totalMediaBytes: value.inspection.totalMediaBytes,
    totalPackageBytes: value.inspection.totalPackageBytes,
    totalProductionJobCount: value.totalProductionJobCount,
    narratorAdmissionComplete: true,
    completeBookListeningApproval: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailTrackListeningApproval: true,
    retailSampleListeningApproval: true,
    privatePackageBuildComplete: true,
    privatePackageInspectionComplete: true,
    retailPackageReviewApproval: true,
    releaseDecisionEligible: true,
    deliveryAuthority: false,
    releaseDecisionAuthority: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    approvedAt: value.approvedAt,
    fingerprint: value.fingerprint,
  });
}
