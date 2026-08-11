import {
  assertAudiobookRetailNarrationEligibilityEvidence,
  assertCurrentAudiobookRetailEncodingPolicy,
  type AudiobookRetailEncodingPolicy,
  type AudiobookRetailNarrationEligibilityEvidence,
} from "./audiobook-retail-policy.js";
import {
  assertAudiobookRetailTrackPlan,
  createAcxAudiobookRetailTrackPlan,
  type AudiobookRetailTrackPlan,
} from "./audiobook-retail-track-plan.js";
import { stableHash } from "./index.js";
import {
  assertAdmittedNarratorWholeBookReviewApproval,
  type AdmittedNarratorWholeBookReviewApproval,
} from "./narrator-audiobook-admission.js";
import {
  assertExactNarratorVoicePin,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";

export const ADMITTED_NARRATOR_RETAIL_TRACK_PLAN_SCHEMA =
  "storyteller-admitted-narrator-retail-track-plan-v1" as const;

export interface AdmittedNarratorRetailTrackPlan {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAIL_TRACK_PLAN_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  wholeBookApproval: AdmittedNarratorWholeBookReviewApproval;
  policy: AudiobookRetailEncodingPolicy;
  narrationEligibility: AudiobookRetailNarrationEligibilityEvidence;
  plan: AudiobookRetailTrackPlan;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  completeBookListeningApproval: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailEncodingEligible: boolean;
  deliveryAuthority: false;
  releaseDecisionAuthority: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  createdAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailTrackPlanPublicView {
  bookId: string;
  distributor: "acx-audible";
  policyVersion: string;
  trackCount: number;
  blockerCount: number;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  completeBookListeningApproval: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailEncodingEligible: boolean;
  deliveryAuthority: false;
  releaseDecisionAuthority: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export class AdmittedNarratorRetailTrackPlanError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AdmittedNarratorRetailTrackPlanError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new AdmittedNarratorRetailTrackPlanError(code);
  }
  return value;
}

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new AdmittedNarratorRetailTrackPlanError(code);
  }
  return value;
}

function requirePositiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AdmittedNarratorRetailTrackPlanError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new AdmittedNarratorRetailTrackPlanError(code);
  }
  return value;
}

function recordBase(
  value: Omit<AdmittedNarratorRetailTrackPlan, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function assertSyntheticPlatformAuthorisation(
  approval: AdmittedNarratorWholeBookReviewApproval,
  policy: AudiobookRetailEncodingPolicy,
  evidence: AudiobookRetailNarrationEligibilityEvidence,
  now: Date,
): void {
  assertCurrentAudiobookRetailEncodingPolicy(policy, now);
  assertAudiobookRetailNarrationEligibilityEvidence(evidence, policy, now);
  const rightsFingerprint = approval.approvedArtifact.rights.rightsFingerprint;
  if (
    evidence.sourceKind !== "synthetic-voice"
    || evidence.projectId !== approval.projectId
    || evidence.bookId !== approval.bookId
    || evidence.policyFingerprint !== policy.fingerprint
    || evidence.rightsFingerprint !== rightsFingerprint
    || evidence.status !== "eligible"
  ) {
    throw new AdmittedNarratorRetailTrackPlanError(
      "ADMITTED_NARRATOR_RETAIL_NARRATION_SCOPE_MISMATCH",
    );
  }
  const authorisation = evidence.platformAuthorisation;
  if (
    !authorisation
    || authorisation.authority !== "audible-or-acx"
    || authorisation.distributor !== "acx-audible"
    || authorisation.projectId !== approval.projectId
    || authorisation.bookId !== approval.bookId
    || authorisation.policyFingerprint !== policy.fingerprint
    || authorisation.permittedUse !== "acx-retail-audiobook"
  ) {
    throw new AdmittedNarratorRetailTrackPlanError(
      "ADMITTED_NARRATOR_RETAIL_PLATFORM_AUTHORISATION_REQUIRED",
    );
  }
}

function recreatePlan(
  value: Pick<
    AdmittedNarratorRetailTrackPlan,
    "wholeBookApproval" | "policy" | "narrationEligibility" | "plan"
  >,
): AudiobookRetailTrackPlan {
  const approval = value.wholeBookApproval;
  return createAcxAudiobookRetailTrackPlan({
    id: value.plan.id,
    sequence: approval.binding.reference.audiobook.sequence,
    referenceChain: approval.binding.reference.chain,
    reviewSession: approval.session,
    approvedReferenceArtifact: approval.approvedArtifact,
    policy: value.policy,
    narrationEligibility: value.narrationEligibility,
    createdByActorId: value.plan.createdByActorId,
    createdAt: new Date(value.plan.createdAt),
  });
}

function assertLineage(value: AdmittedNarratorRetailTrackPlan): void {
  assertAdmittedNarratorWholeBookReviewApproval(value.wholeBookApproval);
  assertAudiobookRetailTrackPlan(value.plan);
  const approval = value.wholeBookApproval;
  assertExactNarratorVoicePin(approval.voice, value.voice);
  const createdAt = new Date(requireDate(
    value.createdAt,
    "ADMITTED_NARRATOR_RETAIL_DATE_INVALID",
  ));
  assertSyntheticPlatformAuthorisation(
    approval,
    value.policy,
    value.narrationEligibility,
    createdAt,
  );
  const recreated = recreatePlan(value);
  if (
    value.projectId !== approval.projectId
    || value.bookId !== approval.bookId
    || value.profileAdmissionHash !== approval.profileAdmissionHash
    || value.admittedCastingFingerprint !== approval.admittedCastingFingerprint
    || value.castingFingerprint !== approval.castingFingerprint
    || value.plan.projectId !== approval.projectId
    || value.plan.bookId !== approval.bookId
    || value.plan.sequence.fingerprint
      !== approval.binding.reference.audiobook.sequence.fingerprint
    || value.plan.referenceMaster.id !== approval.approvedArtifact.id
    || value.plan.referenceMaster.revision !== approval.approvedArtifact.revision
    || value.plan.referenceMaster.fingerprint !== approval.approvedArtifact.fingerprint
    || value.plan.referenceMaster.contentHash
      !== approval.approvedArtifact.integrity.contentHash
    || value.plan.referenceMaster.byteCount
      !== approval.approvedArtifact.integrity.byteCount
    || value.plan.review.sessionFingerprint !== approval.session.fingerprint
    || value.plan.review.approvalFingerprint
      !== approval.session.approval?.fingerprint
    || value.plan.policy.fingerprint !== value.policy.fingerprint
    || value.plan.narration.evidenceFingerprint
      !== value.narrationEligibility.fingerprint
    || value.plan.fingerprint !== recreated.fingerprint
    || value.totalProductionJobCount !== approval.totalProductionJobCount
    || value.createdAt !== value.plan.createdAt
    || value.retailEncodingEligible
      !== (value.plan.status === "ready-for-encoding")
  ) {
    throw new AdmittedNarratorRetailTrackPlanError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_PLAN_LINEAGE_MISMATCH",
    );
  }
  if (
    approval.completeBookListeningApproval !== true
    || approval.eligibleForRetailEncoding !== true
    || value.narratorAdmissionComplete !== true
    || value.completeBookListeningApproval !== true
    || value.syntheticNarrationDeclared !== true
    || value.platformAuthorisationBound !== true
    || value.deliveryAuthority !== false
    || value.releaseDecisionAuthority !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorRetailTrackPlanError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_PLAN_AUTHORITY_INVALID",
    );
  }
}

export function createAdmittedNarratorRetailTrackPlan(input: Readonly<{
  id?: string;
  wholeBookApproval: AdmittedNarratorWholeBookReviewApproval;
  policy: AudiobookRetailEncodingPolicy;
  narrationEligibility: AudiobookRetailNarrationEligibilityEvidence;
  createdByActorId: string;
  createdAt?: Date;
}>): AdmittedNarratorRetailTrackPlan {
  assertAdmittedNarratorWholeBookReviewApproval(input.wholeBookApproval);
  const createdAt = input.createdAt ?? new Date();
  if (Number.isNaN(createdAt.getTime())) {
    throw new AdmittedNarratorRetailTrackPlanError(
      "ADMITTED_NARRATOR_RETAIL_DATE_INVALID",
    );
  }
  assertSyntheticPlatformAuthorisation(
    input.wholeBookApproval,
    input.policy,
    input.narrationEligibility,
    createdAt,
  );
  const plan = createAcxAudiobookRetailTrackPlan({
    ...(input.id ? { id: input.id } : {}),
    sequence: input.wholeBookApproval.binding.reference.audiobook.sequence,
    referenceChain: input.wholeBookApproval.binding.reference.chain,
    reviewSession: input.wholeBookApproval.session,
    approvedReferenceArtifact: input.wholeBookApproval.approvedArtifact,
    policy: input.policy,
    narrationEligibility: input.narrationEligibility,
    createdByActorId: input.createdByActorId,
    createdAt,
  });
  const partial: Omit<AdmittedNarratorRetailTrackPlan, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_TRACK_PLAN_SCHEMA,
    projectId: input.wholeBookApproval.projectId,
    bookId: input.wholeBookApproval.bookId,
    profileAdmissionHash: input.wholeBookApproval.profileAdmissionHash,
    admittedCastingFingerprint:
      input.wholeBookApproval.admittedCastingFingerprint,
    castingFingerprint: input.wholeBookApproval.castingFingerprint,
    voice: Object.freeze({ ...input.wholeBookApproval.voice }),
    wholeBookApproval: input.wholeBookApproval,
    policy: input.policy,
    narrationEligibility: input.narrationEligibility,
    plan,
    totalProductionJobCount: input.wholeBookApproval.totalProductionJobCount,
    narratorAdmissionComplete: true,
    completeBookListeningApproval: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailEncodingEligible: plan.status === "ready-for-encoding",
    deliveryAuthority: false,
    releaseDecisionAuthority: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    createdAt: plan.createdAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(recordBase(partial)),
  });
  assertAdmittedNarratorRetailTrackPlan(value);
  return value;
}

export function assertAdmittedNarratorRetailTrackPlan(
  value: AdmittedNarratorRetailTrackPlan,
): void {
  if (
    value.schemaVersion !== ADMITTED_NARRATOR_RETAIL_TRACK_PLAN_SCHEMA
  ) {
    throw new AdmittedNarratorRetailTrackPlanError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_PLAN_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    value.projectId,
    "ADMITTED_NARRATOR_RETAIL_PROJECT_INVALID",
  );
  requireIdentifier(
    value.bookId,
    "ADMITTED_NARRATOR_RETAIL_BOOK_INVALID",
  );
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
  ]) {
    requireHash(hash, "ADMITTED_NARRATOR_RETAIL_HASH_INVALID");
  }
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_RETAIL_JOB_COUNT_INVALID",
  );
  assertLineage(value);
  const { fingerprint, ...partial } = value;
  if (
    !HASH.test(fingerprint)
    || fingerprint !== stableHash(recordBase(partial))
  ) {
    throw new AdmittedNarratorRetailTrackPlanError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_PLAN_FINGERPRINT_INVALID",
    );
  }
}

export function admittedNarratorRetailTrackPlanPublicView(
  value: AdmittedNarratorRetailTrackPlan,
): AdmittedNarratorRetailTrackPlanPublicView {
  assertAdmittedNarratorRetailTrackPlan(value);
  return Object.freeze({
    bookId: value.bookId,
    distributor: value.plan.distributor,
    policyVersion: value.plan.policy.externalVersion,
    trackCount: value.plan.tracks.length,
    blockerCount: value.plan.blockers.length,
    totalProductionJobCount: value.totalProductionJobCount,
    narratorAdmissionComplete: true,
    completeBookListeningApproval: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailEncodingEligible: value.retailEncodingEligible,
    deliveryAuthority: false,
    releaseDecisionAuthority: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    fingerprint: value.fingerprint,
  });
}
