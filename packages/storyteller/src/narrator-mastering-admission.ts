import type { FileArtifactRegistry } from "./artifact-store.js";
import {
  stableHash,
  type ProjectManifest,
} from "./index.js";
import type {
  IngestMasteredChapterInput,
  MasteredChapterArtifactChain,
} from "./mastered-chapter.js";
import {
  assertNarratorApprovedMasteredChapterReceipt,
  assertNarratorApprovedMasteringPlan,
  assertNarratorApprovedMasteringRenderReceipt,
  assertNarratorMasteringAuthorization,
  createNarratorApprovedMasteredChapterReceipt,
  createNarratorApprovedMasteringPlan,
  createNarratorApprovedMasteringRenderReceipt,
  createNarratorMasteringAuthorization,
  ingestNarratorApprovedMasteredChapter,
  renderNarratorApprovedMasteringPlan,
  type CreateNarratorApprovedMasteringPlanInput,
  type CreateNarratorMasteringAuthorizationInput,
  type NarratorApprovedMasteredChapterReceipt,
  type NarratorApprovedMasteringPlan,
  type NarratorApprovedMasteringRenderReceipt,
  type NarratorMasteringArtifactSnapshot,
  type NarratorMasteringAuthorization,
} from "./narrator-mastering-chain.js";
import type {
  MasteringRenderResult,
  RenderMasteringPlanInput,
} from "./mastering-render.js";
import type {
  NarratorMonitoringPolicy,
} from "./narrator-book-monitor.js";
import {
  assertAdmittedNarratorCasting,
  type AdmittedNarratorCasting,
} from "./narrator-casting-admission.js";
import {
  assertAdmittedChapterNarratorReview,
  type AdmittedChapterNarratorReview,
  type AdmittedNarratorQualityReference,
} from "./narrator-chapter-admission.js";
import type { NarratorProductionJob } from "./narrator-production-job.js";
import {
  assertExactNarratorVoicePin,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";
import type { FilePrivateObjectStore } from "./private-object-store.js";

export const ADMITTED_NARRATOR_MASTERING_AUTHORIZATION_SCHEMA =
  "storyteller-admitted-narrator-mastering-authorization-v1" as const;
export const ADMITTED_NARRATOR_APPROVED_MASTERING_PLAN_SCHEMA =
  "storyteller-admitted-narrator-approved-mastering-plan-v1" as const;
export const ADMITTED_NARRATOR_APPROVED_MASTERING_RENDER_SCHEMA =
  "storyteller-admitted-narrator-approved-mastering-render-v1" as const;
export const ADMITTED_NARRATOR_APPROVED_MASTERED_CHAPTER_SCHEMA =
  "storyteller-admitted-narrator-approved-mastered-chapter-v1" as const;

export interface AdmittedNarratorMasteringContext {
  admittedCasting: AdmittedNarratorCasting;
  manifest: ProjectManifest;
  productionJobs: readonly NarratorProductionJob[];
  policy: NarratorMonitoringPolicy;
  reference: AdmittedNarratorQualityReference;
}

export interface AdmittedNarratorMasteringAuthorization {
  schemaVersion: typeof ADMITTED_NARRATOR_MASTERING_AUTHORIZATION_SCHEMA;
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
  admittedCasting: AdmittedNarratorCasting;
  review: AdmittedChapterNarratorReview;
  authorization: NarratorMasteringAuthorization;
  masteringEligible: true;
  masteredListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface AdmittedNarratorApprovedMasteringPlan {
  schemaVersion: typeof ADMITTED_NARRATOR_APPROVED_MASTERING_PLAN_SCHEMA;
  authorization: AdmittedNarratorMasteringAuthorization;
  approvedPlan: NarratorApprovedMasteringPlan;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  productionSetFingerprint: string;
  admittedChapterReviewFingerprint: string;
  admittedMonitoringFingerprint: string;
  objectiveMonitoringFingerprint: string;
  chapterNarratorReviewFingerprint: string;
  masteringEligible: true;
  masteredListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface AdmittedNarratorApprovedMasteringRenderReceipt {
  schemaVersion: typeof ADMITTED_NARRATOR_APPROVED_MASTERING_RENDER_SCHEMA;
  authorizationFingerprint: string;
  approvedPlanFingerprint: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  productionSetFingerprint: string;
  admittedChapterReviewFingerprint: string;
  admittedMonitoringFingerprint: string;
  objectiveMonitoringFingerprint: string;
  chapterNarratorReviewFingerprint: string;
  receipt: NarratorApprovedMasteringRenderReceipt;
  outputContentHash: string;
  outputByteCount: number;
  masteredListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface AdmittedNarratorApprovedMasteredChapterReceipt {
  schemaVersion: typeof ADMITTED_NARRATOR_APPROVED_MASTERED_CHAPTER_SCHEMA;
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
  authorizationFingerprint: string;
  approvedPlanFingerprint: string;
  admittedRenderReceiptFingerprint: string;
  receipt: NarratorApprovedMasteredChapterReceipt;
  masteredArtifact: NarratorMasteringArtifactSnapshot;
  eligibleForHumanMasterReview: boolean;
  findingCodes: readonly string[];
  masteredListeningApproval: false;
  completeBookListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface AdmittedNarratorApprovedMasteredChapterPublicView {
  projectId: string;
  chapterId: string;
  planId: string;
  masteredArtifactId: string;
  masteredRevision: number;
  narratorAdmissionBound: true;
  productionJobCount: number;
  eligibleForHumanMasterReview: boolean;
  findingCodeCount: number;
  masteredListeningApproval: false;
  completeBookListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export class NarratorMasteringAdmissionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NarratorMasteringAdmissionError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new NarratorMasteringAdmissionError(code);
  }
  return value;
}

function requirePositiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new NarratorMasteringAdmissionError(code);
  }
  return value;
}

function authorizationBase(
  value: Omit<AdmittedNarratorMasteringAuthorization, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function approvedPlanBase(
  value: Omit<AdmittedNarratorApprovedMasteringPlan, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function renderReceiptBase(
  value: Omit<AdmittedNarratorApprovedMasteringRenderReceipt, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function masteredReceiptBase(
  value: Omit<AdmittedNarratorApprovedMasteredChapterReceipt, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function assertContext(context: AdmittedNarratorMasteringContext): void {
  assertAdmittedNarratorCasting(context.admittedCasting);
  if (context.manifest.id !== context.admittedCasting.projectId) {
    throw new NarratorMasteringAdmissionError(
      "ADMITTED_NARRATOR_MASTERING_CONTEXT_PROJECT_MISMATCH",
    );
  }
}

function assertAuthorizationBinding(
  value: AdmittedNarratorMasteringAuthorization,
  context: AdmittedNarratorMasteringContext,
): void {
  assertContext(context);
  assertAdmittedNarratorCasting(value.admittedCasting);
  if (value.admittedCasting.fingerprint !== context.admittedCasting.fingerprint) {
    throw new NarratorMasteringAdmissionError(
      "ADMITTED_NARRATOR_MASTERING_CASTING_CONTEXT_MISMATCH",
    );
  }
  assertAdmittedChapterNarratorReview(value.review, context);
  assertNarratorMasteringAuthorization(value.authorization);
  const casting = context.admittedCasting.casting;
  const review = value.review;
  const authorization = value.authorization;
  if (
    value.projectId !== context.admittedCasting.projectId
    || value.chapterId !== review.chapterId
    || value.profileAdmissionHash !== context.admittedCasting.profileAdmission.admissionHash
    || value.admittedCastingFingerprint !== context.admittedCasting.fingerprint
    || value.castingFingerprint !== casting.fingerprint
    || value.chapterSourceFingerprint !== review.chapterSourceFingerprint
    || value.productionSetFingerprint !== review.productionSetFingerprint
    || value.productionJobCount !== review.monitoring.productionJobIds.length
    || value.admittedChapterReviewFingerprint !== review.fingerprint
    || value.admittedMonitoringFingerprint !== review.admittedMonitoringFingerprint
    || value.objectiveMonitoringFingerprint !== review.objectiveMonitoringFingerprint
    || value.chapterNarratorReviewFingerprint !== review.review.fingerprint
  ) {
    throw new NarratorMasteringAdmissionError(
      "ADMITTED_NARRATOR_MASTERING_REVIEW_BINDING_MISMATCH",
    );
  }
  assertExactNarratorVoicePin(casting.voice, value.voice);
  if (
    authorization.projectId !== value.projectId
    || authorization.chapterId !== value.chapterId
    || authorization.castingFingerprint !== casting.fingerprint
    || authorization.chapterRender.fingerprint !== review.renderFingerprint
    || authorization.chapterReview.fingerprint !== review.review.fingerprint
    || authorization.chapterReview.objectiveMonitoringFingerprint
      !== review.objectiveMonitoringFingerprint
    || authorization.chapterReview.objectiveMonitoringPolicyFingerprint
      !== review.review.objectiveMonitoringPolicyFingerprint
    || authorization.chapterReview.objectiveMonitoringReferenceFingerprint
      !== review.review.objectiveMonitoringReferenceFingerprint
    || authorization.chapterReview.objectiveMonitoringObservationFingerprint
      !== review.review.objectiveMonitoringObservationFingerprint
    || authorization.chapterReview.reviewerPanelFingerprint
      !== review.review.reviewerPanelFingerprint
    || authorization.chapterReview.sourceFingerprint !== review.chapterSourceFingerprint
    || authorization.manuscriptSourceHash !== review.monitoring.projectSourceHash
  ) {
    throw new NarratorMasteringAdmissionError(
      "ADMITTED_NARRATOR_MASTERING_TECHNICAL_AUTHORIZATION_MISMATCH",
    );
  }
  assertExactNarratorVoicePin(value.voice, authorization.voice);
  if (Date.parse(authorization.authorizedAt) < Date.parse(review.review.reviewedAt)) {
    throw new NarratorMasteringAdmissionError(
      "ADMITTED_NARRATOR_MASTERING_AUTHORIZATION_PRECEDES_REVIEW",
    );
  }
}

export function bindAdmittedNarratorMasteringAuthorization(input: Readonly<{
  context: AdmittedNarratorMasteringContext;
  review: AdmittedChapterNarratorReview;
  authorization: NarratorMasteringAuthorization;
}>): AdmittedNarratorMasteringAuthorization {
  const { context, review, authorization } = input;
  assertContext(context);
  assertAdmittedChapterNarratorReview(review, context);
  assertNarratorMasteringAuthorization(authorization);
  const casting = context.admittedCasting.casting;
  const partial: Omit<AdmittedNarratorMasteringAuthorization, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_MASTERING_AUTHORIZATION_SCHEMA,
    projectId: review.projectId,
    chapterId: review.chapterId,
    profileAdmissionHash: review.profileAdmissionHash,
    admittedCastingFingerprint: review.admittedCastingFingerprint,
    castingFingerprint: review.castingFingerprint,
    voice: Object.freeze({ ...review.voice }),
    chapterSourceFingerprint: review.chapterSourceFingerprint,
    productionSetFingerprint: review.productionSetFingerprint,
    productionJobCount: review.monitoring.productionJobIds.length,
    admittedChapterReviewFingerprint: review.fingerprint,
    admittedMonitoringFingerprint: review.admittedMonitoringFingerprint,
    objectiveMonitoringFingerprint: review.objectiveMonitoringFingerprint,
    chapterNarratorReviewFingerprint: review.review.fingerprint,
    admittedCasting: context.admittedCasting,
    review,
    authorization,
    masteringEligible: true,
    masteredListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  assertExactNarratorVoicePin(casting.voice, partial.voice);
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(authorizationBase(partial)),
  });
  assertAdmittedNarratorMasteringAuthorization(value, context);
  return value;
}

export function createAdmittedNarratorMasteringAuthorization(
  input: Omit<CreateNarratorMasteringAuthorizationInput, "casting" | "review"> & Readonly<{
    context: AdmittedNarratorMasteringContext;
    review: AdmittedChapterNarratorReview;
  }>,
): AdmittedNarratorMasteringAuthorization {
  const { context, review, ...technicalInput } = input;
  assertContext(context);
  assertAdmittedChapterNarratorReview(review, context);
  const authorization = createNarratorMasteringAuthorization({
    ...technicalInput,
    casting: context.admittedCasting.casting,
    review: review.review,
  });
  return bindAdmittedNarratorMasteringAuthorization({
    context,
    review,
    authorization,
  });
}

export function assertAdmittedNarratorMasteringAuthorization(
  value: AdmittedNarratorMasteringAuthorization,
  context: AdmittedNarratorMasteringContext,
): void {
  if (value.schemaVersion !== ADMITTED_NARRATOR_MASTERING_AUTHORIZATION_SCHEMA) {
    throw new NarratorMasteringAdmissionError(
      "ADMITTED_NARRATOR_MASTERING_AUTHORIZATION_SCHEMA_UNSUPPORTED",
    );
  }
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
  ]) requireHash(hash, "ADMITTED_NARRATOR_MASTERING_AUTHORIZATION_HASH_INVALID");
  requirePositiveInteger(
    value.productionJobCount,
    "ADMITTED_NARRATOR_MASTERING_PRODUCTION_JOB_COUNT_INVALID",
  );
  assertAuthorizationBinding(value, context);
  if (
    value.masteringEligible !== true
    || value.masteredListeningApproval !== false
    || value.titleNarratorApproval !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new NarratorMasteringAdmissionError(
      "ADMITTED_NARRATOR_MASTERING_AUTHORIZATION_AUTHORITY_INVALID",
    );
  }
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(authorizationBase(partial))) {
    throw new NarratorMasteringAdmissionError(
      "ADMITTED_NARRATOR_MASTERING_AUTHORIZATION_FINGERPRINT_INVALID",
    );
  }
}

export function createAdmittedNarratorApprovedMasteringPlan(
  input: Omit<CreateNarratorApprovedMasteringPlanInput, "authorization"> & Readonly<{
    context: AdmittedNarratorMasteringContext;
    authorization: AdmittedNarratorMasteringAuthorization;
  }>,
): AdmittedNarratorApprovedMasteringPlan {
  const { context, authorization, ...technicalInput } = input;
  assertAdmittedNarratorMasteringAuthorization(authorization, context);
  const approvedPlan = createNarratorApprovedMasteringPlan({
    ...technicalInput,
    authorization: authorization.authorization,
  });
  const partial: Omit<AdmittedNarratorApprovedMasteringPlan, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_APPROVED_MASTERING_PLAN_SCHEMA,
    authorization,
    approvedPlan,
    profileAdmissionHash: authorization.profileAdmissionHash,
    admittedCastingFingerprint: authorization.admittedCastingFingerprint,
    productionSetFingerprint: authorization.productionSetFingerprint,
    admittedChapterReviewFingerprint: authorization.admittedChapterReviewFingerprint,
    admittedMonitoringFingerprint: authorization.admittedMonitoringFingerprint,
    objectiveMonitoringFingerprint: authorization.objectiveMonitoringFingerprint,
    chapterNarratorReviewFingerprint: authorization.chapterNarratorReviewFingerprint,
    masteringEligible: true,
    masteredListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(approvedPlanBase(partial)),
  });
  assertAdmittedNarratorApprovedMasteringPlan(value, context);
  return value;
}

export function assertAdmittedNarratorApprovedMasteringPlan(
  value: AdmittedNarratorApprovedMasteringPlan,
  context: AdmittedNarratorMasteringContext,
): void {
  if (value.schemaVersion !== ADMITTED_NARRATOR_APPROVED_MASTERING_PLAN_SCHEMA) {
    throw new NarratorMasteringAdmissionError(
      "ADMITTED_NARRATOR_MASTERING_PLAN_SCHEMA_UNSUPPORTED",
    );
  }
  assertAdmittedNarratorMasteringAuthorization(value.authorization, context);
  assertNarratorApprovedMasteringPlan(value.approvedPlan);
  if (
    value.approvedPlan.authorization.fingerprint
      !== value.authorization.authorization.fingerprint
    || value.profileAdmissionHash !== value.authorization.profileAdmissionHash
    || value.admittedCastingFingerprint !== value.authorization.admittedCastingFingerprint
    || value.productionSetFingerprint !== value.authorization.productionSetFingerprint
    || value.admittedChapterReviewFingerprint
      !== value.authorization.admittedChapterReviewFingerprint
    || value.admittedMonitoringFingerprint
      !== value.authorization.admittedMonitoringFingerprint
    || value.objectiveMonitoringFingerprint
      !== value.authorization.objectiveMonitoringFingerprint
    || value.chapterNarratorReviewFingerprint
      !== value.authorization.chapterNarratorReviewFingerprint
    || value.approvedPlan.chapterNarratorReviewFingerprint
      !== value.chapterNarratorReviewFingerprint
    || value.approvedPlan.objectiveMonitoringFingerprint
      !== value.objectiveMonitoringFingerprint
  ) {
    throw new NarratorMasteringAdmissionError(
      "ADMITTED_NARRATOR_MASTERING_PLAN_BINDING_MISMATCH",
    );
  }
  if (
    value.masteringEligible !== true
    || value.masteredListeningApproval !== false
    || value.titleNarratorApproval !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new NarratorMasteringAdmissionError(
      "ADMITTED_NARRATOR_MASTERING_PLAN_AUTHORITY_INVALID",
    );
  }
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(approvedPlanBase(partial))) {
    throw new NarratorMasteringAdmissionError(
      "ADMITTED_NARRATOR_MASTERING_PLAN_FINGERPRINT_INVALID",
    );
  }
}

export function createAdmittedNarratorApprovedMasteringRenderReceipt(
  input: Readonly<{
    context: AdmittedNarratorMasteringContext;
    approvedPlan: AdmittedNarratorApprovedMasteringPlan;
    render: MasteringRenderResult;
  }>,
): AdmittedNarratorApprovedMasteringRenderReceipt {
  assertAdmittedNarratorApprovedMasteringPlan(input.approvedPlan, input.context);
  const receipt = createNarratorApprovedMasteringRenderReceipt({
    approvedPlan: input.approvedPlan.approvedPlan,
    render: input.render,
  });
  const authorization = input.approvedPlan.authorization;
  const partial: Omit<AdmittedNarratorApprovedMasteringRenderReceipt, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_APPROVED_MASTERING_RENDER_SCHEMA,
    authorizationFingerprint: authorization.fingerprint,
    approvedPlanFingerprint: input.approvedPlan.fingerprint,
    profileAdmissionHash: authorization.profileAdmissionHash,
    admittedCastingFingerprint: authorization.admittedCastingFingerprint,
    productionSetFingerprint: authorization.productionSetFingerprint,
    admittedChapterReviewFingerprint: authorization.admittedChapterReviewFingerprint,
    admittedMonitoringFingerprint: authorization.admittedMonitoringFingerprint,
    objectiveMonitoringFingerprint: authorization.objectiveMonitoringFingerprint,
    chapterNarratorReviewFingerprint: authorization.chapterNarratorReviewFingerprint,
    receipt,
    outputContentHash: receipt.outputContentHash,
    outputByteCount: receipt.outputByteCount,
    masteredListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(renderReceiptBase(partial)),
  });
  assertAdmittedNarratorApprovedMasteringRenderReceipt(
    value,
    input.approvedPlan,
    input.context,
  );
  return value;
}

export function assertAdmittedNarratorApprovedMasteringRenderReceipt(
  value: AdmittedNarratorApprovedMasteringRenderReceipt,
  approvedPlan: AdmittedNarratorApprovedMasteringPlan,
  context: AdmittedNarratorMasteringContext,
): void {
  if (value.schemaVersion !== ADMITTED_NARRATOR_APPROVED_MASTERING_RENDER_SCHEMA) {
    throw new NarratorMasteringAdmissionError(
      "ADMITTED_NARRATOR_MASTERING_RENDER_SCHEMA_UNSUPPORTED",
    );
  }
  assertAdmittedNarratorApprovedMasteringPlan(approvedPlan, context);
  assertNarratorApprovedMasteringRenderReceipt(
    value.receipt,
    approvedPlan.approvedPlan,
  );
  const authorization = approvedPlan.authorization;
  if (
    value.authorizationFingerprint !== authorization.fingerprint
    || value.approvedPlanFingerprint !== approvedPlan.fingerprint
    || value.profileAdmissionHash !== authorization.profileAdmissionHash
    || value.admittedCastingFingerprint !== authorization.admittedCastingFingerprint
    || value.productionSetFingerprint !== authorization.productionSetFingerprint
    || value.admittedChapterReviewFingerprint
      !== authorization.admittedChapterReviewFingerprint
    || value.admittedMonitoringFingerprint !== authorization.admittedMonitoringFingerprint
    || value.objectiveMonitoringFingerprint !== authorization.objectiveMonitoringFingerprint
    || value.chapterNarratorReviewFingerprint
      !== authorization.chapterNarratorReviewFingerprint
    || value.receipt.authorizationFingerprint
      !== approvedPlan.approvedPlan.authorization.fingerprint
    || value.outputContentHash !== value.receipt.outputContentHash
    || value.outputByteCount !== value.receipt.outputByteCount
  ) {
    throw new NarratorMasteringAdmissionError(
      "ADMITTED_NARRATOR_MASTERING_RENDER_BINDING_MISMATCH",
    );
  }
  requireHash(
    value.outputContentHash,
    "ADMITTED_NARRATOR_MASTERING_RENDER_OUTPUT_HASH_INVALID",
  );
  requirePositiveInteger(
    value.outputByteCount,
    "ADMITTED_NARRATOR_MASTERING_RENDER_OUTPUT_SIZE_INVALID",
  );
  if (
    value.masteredListeningApproval !== false
    || value.titleNarratorApproval !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new NarratorMasteringAdmissionError(
      "ADMITTED_NARRATOR_MASTERING_RENDER_AUTHORITY_INVALID",
    );
  }
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(renderReceiptBase(partial))) {
    throw new NarratorMasteringAdmissionError(
      "ADMITTED_NARRATOR_MASTERING_RENDER_FINGERPRINT_INVALID",
    );
  }
}

export async function renderAdmittedNarratorApprovedMasteringPlan(
  input: Omit<RenderMasteringPlanInput, "plan"> & Readonly<{
    context: AdmittedNarratorMasteringContext;
    approvedPlan: AdmittedNarratorApprovedMasteringPlan;
  }>,
): Promise<Readonly<{
  render: MasteringRenderResult;
  receipt: AdmittedNarratorApprovedMasteringRenderReceipt;
}>> {
  const { context, approvedPlan, ...renderInput } = input;
  assertAdmittedNarratorApprovedMasteringPlan(approvedPlan, context);
  const rendered = await renderNarratorApprovedMasteringPlan({
    ...renderInput,
    approvedPlan: approvedPlan.approvedPlan,
  });
  return Object.freeze({
    render: rendered.render,
    receipt: createAdmittedNarratorApprovedMasteringRenderReceipt({
      context,
      approvedPlan,
      render: rendered.render,
    }),
  });
}

export function createAdmittedNarratorApprovedMasteredChapterReceipt(
  input: Readonly<{
    context: AdmittedNarratorMasteringContext;
    approvedPlan: AdmittedNarratorApprovedMasteringPlan;
    renderReceipt: AdmittedNarratorApprovedMasteringRenderReceipt;
    chain: MasteredChapterArtifactChain;
  }>,
): AdmittedNarratorApprovedMasteredChapterReceipt {
  assertAdmittedNarratorApprovedMasteringPlan(input.approvedPlan, input.context);
  assertAdmittedNarratorApprovedMasteringRenderReceipt(
    input.renderReceipt,
    input.approvedPlan,
    input.context,
  );
  const receipt = createNarratorApprovedMasteredChapterReceipt({
    approvedPlan: input.approvedPlan.approvedPlan,
    renderReceipt: input.renderReceipt.receipt,
    chain: input.chain,
  });
  const authorization = input.approvedPlan.authorization;
  const partial: Omit<AdmittedNarratorApprovedMasteredChapterReceipt, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_APPROVED_MASTERED_CHAPTER_SCHEMA,
    projectId: authorization.projectId,
    chapterId: authorization.chapterId,
    profileAdmissionHash: authorization.profileAdmissionHash,
    admittedCastingFingerprint: authorization.admittedCastingFingerprint,
    castingFingerprint: authorization.castingFingerprint,
    voice: Object.freeze({ ...authorization.voice }),
    chapterSourceFingerprint: authorization.chapterSourceFingerprint,
    productionSetFingerprint: authorization.productionSetFingerprint,
    productionJobCount: authorization.productionJobCount,
    admittedChapterReviewFingerprint: authorization.admittedChapterReviewFingerprint,
    admittedMonitoringFingerprint: authorization.admittedMonitoringFingerprint,
    objectiveMonitoringFingerprint: authorization.objectiveMonitoringFingerprint,
    chapterNarratorReviewFingerprint: authorization.chapterNarratorReviewFingerprint,
    authorizationFingerprint: authorization.fingerprint,
    approvedPlanFingerprint: input.approvedPlan.fingerprint,
    admittedRenderReceiptFingerprint: input.renderReceipt.fingerprint,
    receipt,
    masteredArtifact: receipt.masteredArtifact,
    eligibleForHumanMasterReview: receipt.eligibleForHumanMasterReview,
    findingCodes: Object.freeze([...receipt.findingCodes]),
    masteredListeningApproval: false,
    completeBookListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(masteredReceiptBase(partial)),
  });
  assertAdmittedNarratorApprovedMasteredChapterReceipt(
    value,
    input.approvedPlan,
    input.renderReceipt,
    input.context,
  );
  return value;
}

export function assertAdmittedNarratorApprovedMasteredChapterReceipt(
  value: AdmittedNarratorApprovedMasteredChapterReceipt,
  approvedPlan: AdmittedNarratorApprovedMasteringPlan,
  renderReceipt: AdmittedNarratorApprovedMasteringRenderReceipt,
  context: AdmittedNarratorMasteringContext,
): void {
  if (value.schemaVersion !== ADMITTED_NARRATOR_APPROVED_MASTERED_CHAPTER_SCHEMA) {
    throw new NarratorMasteringAdmissionError(
      "ADMITTED_NARRATOR_MASTERED_CHAPTER_SCHEMA_UNSUPPORTED",
    );
  }
  assertAdmittedNarratorApprovedMasteringPlan(approvedPlan, context);
  assertAdmittedNarratorApprovedMasteringRenderReceipt(
    renderReceipt,
    approvedPlan,
    context,
  );
  assertNarratorApprovedMasteredChapterReceipt(value.receipt);
  const authorization = approvedPlan.authorization;
  if (
    value.projectId !== authorization.projectId
    || value.chapterId !== authorization.chapterId
    || value.profileAdmissionHash !== authorization.profileAdmissionHash
    || value.admittedCastingFingerprint !== authorization.admittedCastingFingerprint
    || value.castingFingerprint !== authorization.castingFingerprint
    || value.chapterSourceFingerprint !== authorization.chapterSourceFingerprint
    || value.productionSetFingerprint !== authorization.productionSetFingerprint
    || value.productionJobCount !== authorization.productionJobCount
    || value.admittedChapterReviewFingerprint
      !== authorization.admittedChapterReviewFingerprint
    || value.admittedMonitoringFingerprint !== authorization.admittedMonitoringFingerprint
    || value.objectiveMonitoringFingerprint !== authorization.objectiveMonitoringFingerprint
    || value.chapterNarratorReviewFingerprint
      !== authorization.chapterNarratorReviewFingerprint
    || value.authorizationFingerprint !== authorization.fingerprint
    || value.approvedPlanFingerprint !== approvedPlan.fingerprint
    || value.admittedRenderReceiptFingerprint !== renderReceipt.fingerprint
    || value.receipt.authorizationFingerprint
      !== approvedPlan.approvedPlan.authorization.fingerprint
    || value.receipt.approvedMasteringPlanFingerprint
      !== approvedPlan.approvedPlan.fingerprint
    || value.receipt.masteringRenderReceiptFingerprint
      !== renderReceipt.receipt.fingerprint
    || value.receipt.chapterNarratorReviewFingerprint
      !== authorization.chapterNarratorReviewFingerprint
    || value.receipt.objectiveMonitoringFingerprint
      !== authorization.objectiveMonitoringFingerprint
    || value.masteredArtifact.fingerprint !== value.receipt.masteredArtifact.fingerprint
    || value.masteredArtifact.contentHash !== value.receipt.masteredArtifact.contentHash
    || value.masteredArtifact.byteCount !== value.receipt.masteredArtifact.byteCount
    || value.eligibleForHumanMasterReview !== value.receipt.eligibleForHumanMasterReview
    || value.findingCodes.length !== value.receipt.findingCodes.length
    || value.findingCodes.some((code, index) => code !== value.receipt.findingCodes[index])
  ) {
    throw new NarratorMasteringAdmissionError(
      "ADMITTED_NARRATOR_MASTERED_CHAPTER_BINDING_MISMATCH",
    );
  }
  assertExactNarratorVoicePin(authorization.voice, value.voice);
  requirePositiveInteger(
    value.productionJobCount,
    "ADMITTED_NARRATOR_MASTERED_CHAPTER_PRODUCTION_JOB_COUNT_INVALID",
  );
  if (
    value.masteredListeningApproval !== false
    || value.completeBookListeningApproval !== false
    || value.titleNarratorApproval !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new NarratorMasteringAdmissionError(
      "ADMITTED_NARRATOR_MASTERED_CHAPTER_AUTHORITY_INVALID",
    );
  }
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(masteredReceiptBase(partial))) {
    throw new NarratorMasteringAdmissionError(
      "ADMITTED_NARRATOR_MASTERED_CHAPTER_FINGERPRINT_INVALID",
    );
  }
}

export async function ingestAdmittedNarratorApprovedMasteredChapter(
  objectStore: FilePrivateObjectStore,
  registry: FileArtifactRegistry,
  input: Omit<IngestMasteredChapterInput, "plan" | "render"> & Readonly<{
    context: AdmittedNarratorMasteringContext;
    approvedPlan: AdmittedNarratorApprovedMasteringPlan;
    render: MasteringRenderResult;
    renderReceipt: AdmittedNarratorApprovedMasteringRenderReceipt;
  }>,
): Promise<Readonly<{
  chain: MasteredChapterArtifactChain;
  receipt: AdmittedNarratorApprovedMasteredChapterReceipt;
}>> {
  const {
    context,
    approvedPlan,
    render,
    renderReceipt,
    ...masteredInput
  } = input;
  assertAdmittedNarratorApprovedMasteringPlan(approvedPlan, context);
  assertAdmittedNarratorApprovedMasteringRenderReceipt(
    renderReceipt,
    approvedPlan,
    context,
  );
  const completed = await ingestNarratorApprovedMasteredChapter(
    objectStore,
    registry,
    {
      ...masteredInput,
      approvedPlan: approvedPlan.approvedPlan,
      render,
      renderReceipt: renderReceipt.receipt,
    },
  );
  return Object.freeze({
    chain: completed.chain,
    receipt: createAdmittedNarratorApprovedMasteredChapterReceipt({
      context,
      approvedPlan,
      renderReceipt,
      chain: completed.chain,
    }),
  });
}

export function admittedNarratorApprovedMasteredChapterPublicView(
  value: AdmittedNarratorApprovedMasteredChapterReceipt,
  approvedPlan: AdmittedNarratorApprovedMasteringPlan,
  renderReceipt: AdmittedNarratorApprovedMasteringRenderReceipt,
  context: AdmittedNarratorMasteringContext,
): AdmittedNarratorApprovedMasteredChapterPublicView {
  assertAdmittedNarratorApprovedMasteredChapterReceipt(
    value,
    approvedPlan,
    renderReceipt,
    context,
  );
  return Object.freeze({
    projectId: value.projectId,
    chapterId: value.chapterId,
    planId: value.receipt.planId,
    masteredArtifactId: value.masteredArtifact.id,
    masteredRevision: value.masteredArtifact.revision,
    narratorAdmissionBound: true,
    productionJobCount: value.productionJobCount,
    eligibleForHumanMasterReview: value.eligibleForHumanMasterReview,
    findingCodeCount: value.findingCodes.length,
    masteredListeningApproval: false,
    completeBookListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    fingerprint: value.fingerprint,
  });
}
