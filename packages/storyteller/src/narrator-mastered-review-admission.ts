import type { ArtifactRecord } from "./artifact-registry.js";
import { stableHash } from "./index.js";
import type { MasteredChapterReviewSession } from "./mastered-chapter-review.js";
import {
  assertNarratorMasteredReviewApproval,
  assertNarratorMasteredReviewBinding,
  createNarratorMasteredReviewApproval,
  createNarratorMasteredReviewBinding,
  recordNarratorMasteredReview,
  type NarratorMasteredReviewApproval,
  type NarratorMasteredReviewBinding,
} from "./narrator-mastered-review.js";
import {
  assertAdmittedNarratorApprovedMasteredChapterReceipt,
  assertAdmittedNarratorApprovedMasteringPlan,
  assertAdmittedNarratorApprovedMasteringRenderReceipt,
  type AdmittedNarratorApprovedMasteredChapterReceipt,
  type AdmittedNarratorApprovedMasteringPlan,
  type AdmittedNarratorApprovedMasteringRenderReceipt,
  type AdmittedNarratorMasteringContext,
} from "./narrator-mastering-admission.js";
import {
  assertExactNarratorVoicePin,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";

export const ADMITTED_NARRATOR_MASTERED_REVIEW_BINDING_SCHEMA =
  "storyteller-admitted-narrator-mastered-review-binding-v1" as const;
export const ADMITTED_NARRATOR_MASTERED_REVIEW_APPROVAL_SCHEMA =
  "storyteller-admitted-narrator-mastered-review-approval-v1" as const;

export interface AdmittedNarratorMasteredReviewSource {
  context: AdmittedNarratorMasteringContext;
  approvedPlan: AdmittedNarratorApprovedMasteringPlan;
  renderReceipt: AdmittedNarratorApprovedMasteringRenderReceipt;
  receipt: AdmittedNarratorApprovedMasteredChapterReceipt;
}

export interface AdmittedNarratorMasteredReviewBinding {
  schemaVersion: typeof ADMITTED_NARRATOR_MASTERED_REVIEW_BINDING_SCHEMA;
  projectId: string;
  chapterId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  chapterSourceFingerprint: string;
  productionSetFingerprint: string;
  productionJobCount: number;
  admittedChapterReviewFingerprint: string;
  admittedMonitoringFingerprint: string;
  objectiveMonitoringFingerprint: string;
  chapterNarratorReviewFingerprint: string;
  admittedMasteringAuthorizationFingerprint: string;
  admittedMasteringPlanFingerprint: string;
  admittedMasteringRenderFingerprint: string;
  admittedMasteredChapterFingerprint: string;
  source: AdmittedNarratorMasteredReviewSource;
  binding: NarratorMasteredReviewBinding;
  bindingFingerprint: string;
  revision: number;
  previousFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  masteredListeningApproval: false;
  completeBookListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface AdmittedNarratorMasteredReviewApproval {
  schemaVersion: typeof ADMITTED_NARRATOR_MASTERED_REVIEW_APPROVAL_SCHEMA;
  projectId: string;
  chapterId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  chapterSourceFingerprint: string;
  productionSetFingerprint: string;
  productionJobCount: number;
  admittedChapterReviewFingerprint: string;
  admittedMonitoringFingerprint: string;
  objectiveMonitoringFingerprint: string;
  chapterNarratorReviewFingerprint: string;
  admittedMasteringAuthorizationFingerprint: string;
  admittedMasteringPlanFingerprint: string;
  admittedMasteringRenderFingerprint: string;
  admittedMasteredChapterFingerprint: string;
  binding: AdmittedNarratorMasteredReviewBinding;
  approval: NarratorMasteredReviewApproval;
  approvedAt: string;
  masteredListeningApproval: true;
  completeBookListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface AdmittedNarratorMasteredReviewPublicView {
  projectId: string;
  chapterId: string;
  masteredArtifactId: string;
  masteredArtifactRevision: number;
  narratorAdmissionBound: true;
  productionJobCount: number;
  reviewStatus: MasteredChapterReviewSession["status"];
  findingCodeCount: number;
  masteredListeningApproval: boolean;
  completeBookListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export class NarratorMasteredReviewAdmissionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NarratorMasteredReviewAdmissionError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new NarratorMasteredReviewAdmissionError(code);
  }
  return value;
}

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new NarratorMasteredReviewAdmissionError(code);
  }
  return value;
}

function requirePositiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new NarratorMasteredReviewAdmissionError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new NarratorMasteredReviewAdmissionError(code);
  }
  return value;
}

function bindingBase(
  value: Omit<AdmittedNarratorMasteredReviewBinding, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function approvalBase(
  value: Omit<AdmittedNarratorMasteredReviewApproval, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function assertSource(source: AdmittedNarratorMasteredReviewSource): void {
  assertAdmittedNarratorApprovedMasteringPlan(
    source.approvedPlan,
    source.context,
  );
  assertAdmittedNarratorApprovedMasteringRenderReceipt(
    source.renderReceipt,
    source.approvedPlan,
    source.context,
  );
  assertAdmittedNarratorApprovedMasteredChapterReceipt(
    source.receipt,
    source.approvedPlan,
    source.renderReceipt,
    source.context,
  );
}

function commonLineage(source: AdmittedNarratorMasteredReviewSource): Readonly<{
  projectId: string;
  chapterId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  chapterSourceFingerprint: string;
  productionSetFingerprint: string;
  productionJobCount: number;
  admittedChapterReviewFingerprint: string;
  admittedMonitoringFingerprint: string;
  objectiveMonitoringFingerprint: string;
  chapterNarratorReviewFingerprint: string;
  admittedMasteringAuthorizationFingerprint: string;
  admittedMasteringPlanFingerprint: string;
  admittedMasteringRenderFingerprint: string;
  admittedMasteredChapterFingerprint: string;
}> {
  assertSource(source);
  const receipt = source.receipt;
  return Object.freeze({
    projectId: receipt.projectId,
    chapterId: receipt.chapterId,
    profileAdmissionHash: receipt.profileAdmissionHash,
    admittedCastingFingerprint: receipt.admittedCastingFingerprint,
    castingFingerprint: receipt.castingFingerprint,
    voice: Object.freeze({ ...receipt.voice }),
    chapterSourceFingerprint: receipt.chapterSourceFingerprint,
    productionSetFingerprint: receipt.productionSetFingerprint,
    productionJobCount: receipt.productionJobCount,
    admittedChapterReviewFingerprint: receipt.admittedChapterReviewFingerprint,
    admittedMonitoringFingerprint: receipt.admittedMonitoringFingerprint,
    objectiveMonitoringFingerprint: receipt.objectiveMonitoringFingerprint,
    chapterNarratorReviewFingerprint: receipt.chapterNarratorReviewFingerprint,
    admittedMasteringAuthorizationFingerprint:
      source.approvedPlan.authorization.fingerprint,
    admittedMasteringPlanFingerprint: source.approvedPlan.fingerprint,
    admittedMasteringRenderFingerprint: source.renderReceipt.fingerprint,
    admittedMasteredChapterFingerprint: receipt.fingerprint,
  });
}

function assertBindingLineage(
  value: AdmittedNarratorMasteredReviewBinding,
): void {
  const expected = commonLineage(value.source);
  if (
    value.projectId !== expected.projectId
    || value.chapterId !== expected.chapterId
    || value.profileAdmissionHash !== expected.profileAdmissionHash
    || value.admittedCastingFingerprint !== expected.admittedCastingFingerprint
    || value.castingFingerprint !== expected.castingFingerprint
    || value.chapterSourceFingerprint !== expected.chapterSourceFingerprint
    || value.productionSetFingerprint !== expected.productionSetFingerprint
    || value.productionJobCount !== expected.productionJobCount
    || value.admittedChapterReviewFingerprint
      !== expected.admittedChapterReviewFingerprint
    || value.admittedMonitoringFingerprint !== expected.admittedMonitoringFingerprint
    || value.objectiveMonitoringFingerprint !== expected.objectiveMonitoringFingerprint
    || value.chapterNarratorReviewFingerprint
      !== expected.chapterNarratorReviewFingerprint
    || value.admittedMasteringAuthorizationFingerprint
      !== expected.admittedMasteringAuthorizationFingerprint
    || value.admittedMasteringPlanFingerprint
      !== expected.admittedMasteringPlanFingerprint
    || value.admittedMasteringRenderFingerprint
      !== expected.admittedMasteringRenderFingerprint
    || value.admittedMasteredChapterFingerprint
      !== expected.admittedMasteredChapterFingerprint
  ) {
    throw new NarratorMasteredReviewAdmissionError(
      "ADMITTED_NARRATOR_MASTERED_REVIEW_LINEAGE_MISMATCH",
    );
  }
  assertExactNarratorVoicePin(expected.voice, value.voice);
}

export function createAdmittedNarratorMasteredReviewBinding(input: Readonly<{
  source: AdmittedNarratorMasteredReviewSource;
  reviewSession: MasteredChapterReviewSession;
}>): AdmittedNarratorMasteredReviewBinding {
  const lineage = commonLineage(input.source);
  const binding = createNarratorMasteredReviewBinding({
    casting: input.source.context.admittedCasting.casting,
    authorization: input.source.approvedPlan.authorization.authorization,
    receipt: input.source.receipt.receipt,
    reviewSession: input.reviewSession,
  });
  const partial: Omit<AdmittedNarratorMasteredReviewBinding, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_MASTERED_REVIEW_BINDING_SCHEMA,
    ...lineage,
    source: input.source,
    binding,
    bindingFingerprint: binding.fingerprint,
    revision: binding.revision,
    createdAt: binding.createdAt,
    updatedAt: binding.updatedAt,
    masteredListeningApproval: false,
    completeBookListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(bindingBase(partial)),
  });
  assertAdmittedNarratorMasteredReviewBinding(value);
  return value;
}

export function recordAdmittedNarratorMasteredReview(
  value: AdmittedNarratorMasteredReviewBinding,
  input: Parameters<typeof recordNarratorMasteredReview>[1],
): AdmittedNarratorMasteredReviewBinding {
  assertAdmittedNarratorMasteredReviewBinding(value);
  const binding = recordNarratorMasteredReview(value.binding, input);
  const {
    fingerprint: _fingerprint,
    previousFingerprint: _previousFingerprint,
    ...base
  } = value;
  const partial: Omit<AdmittedNarratorMasteredReviewBinding, "fingerprint"> = {
    ...base,
    binding,
    bindingFingerprint: binding.fingerprint,
    revision: binding.revision,
    previousFingerprint: value.fingerprint,
    createdAt: binding.createdAt,
    updatedAt: binding.updatedAt,
  };
  const next = Object.freeze({
    ...partial,
    fingerprint: stableHash(bindingBase(partial)),
  });
  assertAdmittedNarratorMasteredReviewBinding(next);
  return next;
}

export function assertAdmittedNarratorMasteredReviewBinding(
  value: AdmittedNarratorMasteredReviewBinding,
): void {
  if (value.schemaVersion !== ADMITTED_NARRATOR_MASTERED_REVIEW_BINDING_SCHEMA) {
    throw new NarratorMasteredReviewAdmissionError(
      "ADMITTED_NARRATOR_MASTERED_REVIEW_BINDING_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(value.projectId, "ADMITTED_NARRATOR_MASTERED_REVIEW_PROJECT_INVALID");
  requireIdentifier(value.chapterId, "ADMITTED_NARRATOR_MASTERED_REVIEW_CHAPTER_INVALID");
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
    value.chapterSourceFingerprint,
    value.productionSetFingerprint,
    value.admittedChapterReviewFingerprint,
    value.admittedMonitoringFingerprint,
    value.objectiveMonitoringFingerprint,
    value.chapterNarratorReviewFingerprint,
    value.admittedMasteringAuthorizationFingerprint,
    value.admittedMasteringPlanFingerprint,
    value.admittedMasteringRenderFingerprint,
    value.admittedMasteredChapterFingerprint,
    value.bindingFingerprint,
  ]) requireHash(hash, "ADMITTED_NARRATOR_MASTERED_REVIEW_HASH_INVALID");
  requirePositiveInteger(
    value.productionJobCount,
    "ADMITTED_NARRATOR_MASTERED_REVIEW_PRODUCTION_JOB_COUNT_INVALID",
  );
  assertBindingLineage(value);
  assertNarratorMasteredReviewBinding(value.binding);
  const source = value.source;
  const rawCasting = source.context.admittedCasting.casting;
  if (
    value.binding.casting.fingerprint !== rawCasting.fingerprint
    || value.binding.authorization.fingerprint
      !== source.approvedPlan.authorization.authorization.fingerprint
    || value.binding.receipt.fingerprint !== source.receipt.receipt.fingerprint
    || value.bindingFingerprint !== value.binding.fingerprint
    || value.revision !== value.binding.revision
    || value.createdAt !== value.binding.createdAt
    || value.updatedAt !== value.binding.updatedAt
  ) {
    throw new NarratorMasteredReviewAdmissionError(
      "ADMITTED_NARRATOR_MASTERED_REVIEW_TECHNICAL_BINDING_MISMATCH",
    );
  }
  assertExactNarratorVoicePin(value.voice, value.binding.casting.voice);
  requirePositiveInteger(value.revision, "ADMITTED_NARRATOR_MASTERED_REVIEW_REVISION_INVALID");
  if (value.revision === 1 && value.previousFingerprint !== undefined) {
    throw new NarratorMasteredReviewAdmissionError(
      "ADMITTED_NARRATOR_MASTERED_REVIEW_REVISION_CHAIN_INVALID",
    );
  }
  if (value.revision > 1) {
    requireHash(
      value.previousFingerprint ?? "",
      "ADMITTED_NARRATOR_MASTERED_REVIEW_REVISION_CHAIN_INVALID",
    );
  }
  requireDate(value.createdAt, "ADMITTED_NARRATOR_MASTERED_REVIEW_DATE_INVALID");
  requireDate(value.updatedAt, "ADMITTED_NARRATOR_MASTERED_REVIEW_DATE_INVALID");
  if (
    value.masteredListeningApproval !== false
    || value.completeBookListeningApproval !== false
    || value.titleNarratorApproval !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new NarratorMasteredReviewAdmissionError(
      "ADMITTED_NARRATOR_MASTERED_REVIEW_AUTHORITY_INVALID",
    );
  }
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(bindingBase(partial))) {
    throw new NarratorMasteredReviewAdmissionError(
      "ADMITTED_NARRATOR_MASTERED_REVIEW_FINGERPRINT_INVALID",
    );
  }
}

export function createAdmittedNarratorMasteredReviewApproval(input: Readonly<{
  binding: AdmittedNarratorMasteredReviewBinding;
  approvedSession: MasteredChapterReviewSession;
  approvedArtifact: ArtifactRecord;
}>): AdmittedNarratorMasteredReviewApproval {
  assertAdmittedNarratorMasteredReviewBinding(input.binding);
  const approval = createNarratorMasteredReviewApproval({
    binding: input.binding.binding,
    approvedSession: input.approvedSession,
    approvedArtifact: input.approvedArtifact,
  });
  const binding = input.binding;
  const partial: Omit<AdmittedNarratorMasteredReviewApproval, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_MASTERED_REVIEW_APPROVAL_SCHEMA,
    projectId: binding.projectId,
    chapterId: binding.chapterId,
    profileAdmissionHash: binding.profileAdmissionHash,
    admittedCastingFingerprint: binding.admittedCastingFingerprint,
    castingFingerprint: binding.castingFingerprint,
    voice: Object.freeze({ ...binding.voice }),
    chapterSourceFingerprint: binding.chapterSourceFingerprint,
    productionSetFingerprint: binding.productionSetFingerprint,
    productionJobCount: binding.productionJobCount,
    admittedChapterReviewFingerprint: binding.admittedChapterReviewFingerprint,
    admittedMonitoringFingerprint: binding.admittedMonitoringFingerprint,
    objectiveMonitoringFingerprint: binding.objectiveMonitoringFingerprint,
    chapterNarratorReviewFingerprint: binding.chapterNarratorReviewFingerprint,
    admittedMasteringAuthorizationFingerprint:
      binding.admittedMasteringAuthorizationFingerprint,
    admittedMasteringPlanFingerprint: binding.admittedMasteringPlanFingerprint,
    admittedMasteringRenderFingerprint: binding.admittedMasteringRenderFingerprint,
    admittedMasteredChapterFingerprint: binding.admittedMasteredChapterFingerprint,
    binding,
    approval,
    approvedAt: approval.approvedAt,
    masteredListeningApproval: true,
    completeBookListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(approvalBase(partial)),
  });
  assertAdmittedNarratorMasteredReviewApproval(value);
  return value;
}

export function assertAdmittedNarratorMasteredReviewApproval(
  value: AdmittedNarratorMasteredReviewApproval,
): void {
  if (value.schemaVersion !== ADMITTED_NARRATOR_MASTERED_REVIEW_APPROVAL_SCHEMA) {
    throw new NarratorMasteredReviewAdmissionError(
      "ADMITTED_NARRATOR_MASTERED_REVIEW_APPROVAL_SCHEMA_UNSUPPORTED",
    );
  }
  assertAdmittedNarratorMasteredReviewBinding(value.binding);
  assertNarratorMasteredReviewApproval(value.approval);
  const binding = value.binding;
  if (
    value.projectId !== binding.projectId
    || value.chapterId !== binding.chapterId
    || value.profileAdmissionHash !== binding.profileAdmissionHash
    || value.admittedCastingFingerprint !== binding.admittedCastingFingerprint
    || value.castingFingerprint !== binding.castingFingerprint
    || value.chapterSourceFingerprint !== binding.chapterSourceFingerprint
    || value.productionSetFingerprint !== binding.productionSetFingerprint
    || value.productionJobCount !== binding.productionJobCount
    || value.admittedChapterReviewFingerprint
      !== binding.admittedChapterReviewFingerprint
    || value.admittedMonitoringFingerprint !== binding.admittedMonitoringFingerprint
    || value.objectiveMonitoringFingerprint !== binding.objectiveMonitoringFingerprint
    || value.chapterNarratorReviewFingerprint
      !== binding.chapterNarratorReviewFingerprint
    || value.admittedMasteringAuthorizationFingerprint
      !== binding.admittedMasteringAuthorizationFingerprint
    || value.admittedMasteringPlanFingerprint
      !== binding.admittedMasteringPlanFingerprint
    || value.admittedMasteringRenderFingerprint
      !== binding.admittedMasteringRenderFingerprint
    || value.admittedMasteredChapterFingerprint
      !== binding.admittedMasteredChapterFingerprint
    || value.approval.bindingFingerprint !== binding.binding.fingerprint
    || value.approval.casting.fingerprint
      !== binding.source.context.admittedCasting.casting.fingerprint
    || value.approval.authorization.fingerprint
      !== binding.source.approvedPlan.authorization.authorization.fingerprint
    || value.approval.receipt.fingerprint !== binding.source.receipt.receipt.fingerprint
    || value.approvedAt !== value.approval.approvedAt
  ) {
    throw new NarratorMasteredReviewAdmissionError(
      "ADMITTED_NARRATOR_MASTERED_REVIEW_APPROVAL_BINDING_MISMATCH",
    );
  }
  assertExactNarratorVoicePin(binding.voice, value.voice);
  requireDate(value.approvedAt, "ADMITTED_NARRATOR_MASTERED_REVIEW_APPROVAL_DATE_INVALID");
  if (
    value.masteredListeningApproval !== true
    || value.completeBookListeningApproval !== false
    || value.titleNarratorApproval !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new NarratorMasteredReviewAdmissionError(
      "ADMITTED_NARRATOR_MASTERED_REVIEW_APPROVAL_AUTHORITY_INVALID",
    );
  }
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(approvalBase(partial))) {
    throw new NarratorMasteredReviewAdmissionError(
      "ADMITTED_NARRATOR_MASTERED_REVIEW_APPROVAL_FINGERPRINT_INVALID",
    );
  }
}

export function admittedNarratorMasteredReviewPublicView(
  value: AdmittedNarratorMasteredReviewBinding | AdmittedNarratorMasteredReviewApproval,
): AdmittedNarratorMasteredReviewPublicView {
  const approved = value.schemaVersion === ADMITTED_NARRATOR_MASTERED_REVIEW_APPROVAL_SCHEMA;
  if (approved) {
    assertAdmittedNarratorMasteredReviewApproval(
      value as AdmittedNarratorMasteredReviewApproval,
    );
  } else {
    assertAdmittedNarratorMasteredReviewBinding(
      value as AdmittedNarratorMasteredReviewBinding,
    );
  }
  const admittedBinding = approved
    ? (value as AdmittedNarratorMasteredReviewApproval).binding
    : (value as AdmittedNarratorMasteredReviewBinding);
  const technical = approved
    ? (value as AdmittedNarratorMasteredReviewApproval).approval
    : admittedBinding.binding;
  const artifact = approved
    ? (value as AdmittedNarratorMasteredReviewApproval).approval.approvedArtifact
    : (value as AdmittedNarratorMasteredReviewBinding).source.receipt.masteredArtifact;
  return Object.freeze({
    projectId: value.projectId,
    chapterId: value.chapterId,
    masteredArtifactId: artifact.id,
    masteredArtifactRevision: artifact.revision,
    narratorAdmissionBound: true,
    productionJobCount: value.productionJobCount,
    reviewStatus: technical.reviewSession.status,
    findingCodeCount: admittedBinding.source.receipt.findingCodes.length,
    masteredListeningApproval: approved,
    completeBookListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    fingerprint: value.fingerprint,
  });
}
