import {
  assertArtifactRecord,
  type ArtifactRecord,
} from "./artifact-registry.js";
import { stableHash } from "./index.js";
import {
  assertMasteredChapterReviewSession,
  recordMasteredChapterReview,
  type MasteredChapterReviewEntry,
  type MasteredChapterReviewSession,
} from "./mastered-chapter-review.js";
import {
  assertNarratorApprovedMasteredChapterReceipt,
  assertNarratorMasteringAuthorization,
  type NarratorApprovedMasteredChapterReceipt,
  type NarratorMasteringAuthorization,
} from "./narrator-mastering-chain.js";
import {
  assertExactNarratorVoicePin,
  assertNarratorCasting,
  type NarratorCastingApproval,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";

export const NARRATOR_MASTERED_REVIEW_BINDING_SCHEMA =
  "storyteller-narrator-mastered-review-binding-v1" as const;
export const NARRATOR_MASTERED_REVIEW_APPROVAL_SCHEMA =
  "storyteller-narrator-mastered-review-approval-v1" as const;

export interface NarratorMasteredReviewAcknowledgement {
  role: MasteredChapterReviewEntry["role"];
  reviewFingerprint: string;
  findingCodes: readonly string[];
  acknowledgedAt: string;
  fingerprint: string;
}

export interface NarratorMasteredReviewBinding {
  schemaVersion: typeof NARRATOR_MASTERED_REVIEW_BINDING_SCHEMA;
  projectId: string;
  chapterId: string;
  casting: NarratorCastingApproval;
  authorization: NarratorMasteringAuthorization;
  receipt: NarratorApprovedMasteredChapterReceipt;
  reviewSession: MasteredChapterReviewSession;
  acknowledgements: readonly NarratorMasteredReviewAcknowledgement[];
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

export interface NarratorApprovedArtifactSnapshot {
  id: string;
  revision: number;
  fingerprint: string;
  previousFingerprint: string;
  contentHash: string;
  byteCount: number;
  rightsFingerprint: string;
}

export interface NarratorMasteredReviewApproval {
  schemaVersion: typeof NARRATOR_MASTERED_REVIEW_APPROVAL_SCHEMA;
  projectId: string;
  chapterId: string;
  casting: NarratorCastingApproval;
  authorization: NarratorMasteringAuthorization;
  receipt: NarratorApprovedMasteredChapterReceipt;
  bindingFingerprint: string;
  reviewSession: MasteredChapterReviewSession;
  acknowledgements: readonly NarratorMasteredReviewAcknowledgement[];
  approvedArtifact: NarratorApprovedArtifactSnapshot;
  approvedAt: string;
  masteredListeningApproval: true;
  completeBookListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface NarratorMasteredReviewPublicView {
  chapterId: string;
  masteredArtifactId: string;
  masteredArtifactRevision: number;
  narratorEvidenceBound: true;
  reviewStatus: MasteredChapterReviewSession["status"];
  findingCodeCount: number;
  masteredListeningApproval: boolean;
  completeBookListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export class NarratorMasteredReviewError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NarratorMasteredReviewError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const FINDING_CODE = /^[A-Z][A-Z0-9._:-]{2,127}$/u;
const REQUIRED_ROLES = Object.freeze(["editorial", "engineering"] as const);

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new NarratorMasteredReviewError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new NarratorMasteredReviewError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new NarratorMasteredReviewError(code);
  }
  return value;
}

function requireInteger(value: number, minimum: number, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new NarratorMasteredReviewError(code);
  }
  return value;
}

function normaliseFindingCodes(values: readonly string[], code: string): readonly string[] {
  if (!Array.isArray(values)) throw new NarratorMasteredReviewError(code);
  const normalised = values.map((value) => {
    if (typeof value !== "string" || !FINDING_CODE.test(value)) {
      throw new NarratorMasteredReviewError(code);
    }
    return value;
  });
  if (new Set(normalised).size !== normalised.length) {
    throw new NarratorMasteredReviewError(code);
  }
  return Object.freeze([...normalised].sort((left, right) => left.localeCompare(right, "en-AU")));
}

function equalStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function bindingBase(
  value: Omit<NarratorMasteredReviewBinding, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function acknowledgementBase(
  value: Omit<NarratorMasteredReviewAcknowledgement, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function approvalBase(
  value: Omit<NarratorMasteredReviewApproval, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function snapshot(record: ArtifactRecord): NarratorApprovedArtifactSnapshot {
  return Object.freeze({
    id: record.id,
    revision: record.revision,
    fingerprint: record.fingerprint,
    previousFingerprint: record.previousFingerprint ?? "",
    contentHash: record.integrity.contentHash,
    byteCount: record.integrity.byteCount,
    rightsFingerprint: record.rights.rightsFingerprint,
  });
}

function assertApprovedSnapshot(value: NarratorApprovedArtifactSnapshot): void {
  requireIdentifier(value.id, "NARRATOR_MASTERED_REVIEW_ARTIFACT_ID_INVALID");
  requireInteger(value.revision, 2, Number.MAX_SAFE_INTEGER, "NARRATOR_MASTERED_REVIEW_ARTIFACT_REVISION_INVALID");
  requireHash(value.fingerprint, "NARRATOR_MASTERED_REVIEW_ARTIFACT_HASH_INVALID");
  requireHash(value.previousFingerprint, "NARRATOR_MASTERED_REVIEW_ARTIFACT_PREVIOUS_HASH_INVALID");
  requireHash(value.contentHash, "NARRATOR_MASTERED_REVIEW_ARTIFACT_CONTENT_HASH_INVALID");
  requireInteger(value.byteCount, 1, Number.MAX_SAFE_INTEGER, "NARRATOR_MASTERED_REVIEW_ARTIFACT_SIZE_INVALID");
  requireHash(value.rightsFingerprint, "NARRATOR_MASTERED_REVIEW_RIGHTS_HASH_INVALID");
}

function assertReceiptBinding(
  casting: NarratorCastingApproval,
  authorization: NarratorMasteringAuthorization,
  receipt: NarratorApprovedMasteredChapterReceipt,
  reviewSession: MasteredChapterReviewSession,
): void {
  assertNarratorCasting(casting);
  assertNarratorMasteringAuthorization(authorization);
  assertNarratorApprovedMasteredChapterReceipt(receipt);
  assertMasteredChapterReviewSession(reviewSession);
  if (
    authorization.projectId !== casting.projectId
    || authorization.castingFingerprint !== casting.fingerprint
    || receipt.projectId !== casting.projectId
    || receipt.projectId !== reviewSession.projectId
    || receipt.chapterId !== authorization.chapterId
    || receipt.chapterId !== reviewSession.chapterId
    || receipt.authorizationFingerprint !== authorization.fingerprint
    || receipt.chapterNarratorReviewFingerprint !== authorization.chapterReview.fingerprint
    || receipt.objectiveMonitoringFingerprint
      !== authorization.chapterReview.objectiveMonitoringFingerprint
    || receipt.masteredChapterChainFingerprint !== reviewSession.chainFingerprint
    || receipt.masteredArtifact.id !== reviewSession.masteredArtifact.id
    || receipt.masteredArtifact.revision !== reviewSession.masteredArtifact.revision
    || receipt.masteredArtifact.fingerprint !== reviewSession.masteredArtifact.fingerprint
    || receipt.masteredArtifact.contentHash !== reviewSession.masteredArtifact.contentHash
    || receipt.masteredArtifact.byteCount !== reviewSession.masteredArtifact.byteCount
  ) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_SOURCE_BINDING_MISMATCH");
  }
  assertExactNarratorVoicePin(casting.voice, authorization.voice);
  if (!receipt.eligibleForHumanMasterReview) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_RECEIPT_INELIGIBLE");
  }
  if (
    receipt.masteredListeningApproval !== false
    || receipt.titleReleaseAuthority !== false
    || receipt.publicationAuthority !== false
  ) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_RECEIPT_AUTHORITY_INVALID");
  }
}

function assertAcknowledgement(
  acknowledgement: NarratorMasteredReviewAcknowledgement,
  review: MasteredChapterReviewEntry,
  expectedFindingCodes: readonly string[],
): void {
  if (acknowledgement.role !== review.role) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_ACK_ROLE_MISMATCH");
  }
  requireHash(acknowledgement.reviewFingerprint, "NARRATOR_MASTERED_REVIEW_ACK_REVIEW_HASH_INVALID");
  if (acknowledgement.reviewFingerprint !== review.fingerprint) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_ACK_REVIEW_MISMATCH");
  }
  const codes = normaliseFindingCodes(
    acknowledgement.findingCodes,
    "NARRATOR_MASTERED_REVIEW_ACK_FINDINGS_INVALID",
  );
  if (!equalStrings(codes, expectedFindingCodes)) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_FINDINGS_UNACKNOWLEDGED");
  }
  requireDate(acknowledgement.acknowledgedAt, "NARRATOR_MASTERED_REVIEW_ACK_DATE_INVALID");
  if (acknowledgement.acknowledgedAt !== review.decidedAt) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_ACK_DATE_MISMATCH");
  }
  const { fingerprint, ...partial } = acknowledgement;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(acknowledgementBase(partial))) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_ACK_FINGERPRINT_INVALID");
  }
}

function assertAcknowledgementSet(
  session: MasteredChapterReviewSession,
  acknowledgements: readonly NarratorMasteredReviewAcknowledgement[],
  findingCodes: readonly string[],
): void {
  if (!Array.isArray(acknowledgements) || acknowledgements.length !== session.reviews.length) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_ACK_COUNT_MISMATCH");
  }
  const byReview = new Map<string, NarratorMasteredReviewAcknowledgement>();
  for (const acknowledgement of acknowledgements) {
    if (byReview.has(acknowledgement.reviewFingerprint)) {
      throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_ACK_DUPLICATE");
    }
    byReview.set(acknowledgement.reviewFingerprint, acknowledgement);
  }
  for (const review of session.reviews) {
    const acknowledgement = byReview.get(review.fingerprint);
    if (!acknowledgement) {
      throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_ACK_MISSING");
    }
    assertAcknowledgement(acknowledgement, review, findingCodes);
  }
}

function latestReviews(session: MasteredChapterReviewSession): ReadonlyMap<MasteredChapterReviewEntry["role"], MasteredChapterReviewEntry> {
  const latest = new Map<MasteredChapterReviewEntry["role"], MasteredChapterReviewEntry>();
  for (const review of session.reviews) latest.set(review.role, review);
  return latest;
}

export function createNarratorMasteredReviewBinding(input: Readonly<{
  casting: NarratorCastingApproval;
  authorization: NarratorMasteringAuthorization;
  receipt: NarratorApprovedMasteredChapterReceipt;
  reviewSession: MasteredChapterReviewSession;
}>): NarratorMasteredReviewBinding {
  assertReceiptBinding(input.casting, input.authorization, input.receipt, input.reviewSession);
  if (
    input.reviewSession.status !== "open"
    || input.reviewSession.reviews.length !== 0
    || input.reviewSession.approval !== undefined
    || input.reviewSession.revision !== 1
  ) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_INITIAL_SESSION_REQUIRED");
  }
  const partial: Omit<NarratorMasteredReviewBinding, "fingerprint"> = {
    schemaVersion: NARRATOR_MASTERED_REVIEW_BINDING_SCHEMA,
    projectId: input.receipt.projectId,
    chapterId: input.receipt.chapterId,
    casting: input.casting,
    authorization: input.authorization,
    receipt: input.receipt,
    reviewSession: input.reviewSession,
    acknowledgements: Object.freeze([]),
    revision: 1,
    createdAt: input.reviewSession.createdAt,
    updatedAt: input.reviewSession.updatedAt,
    masteredListeningApproval: false,
    completeBookListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const binding = Object.freeze({ ...partial, fingerprint: stableHash(bindingBase(partial)) });
  assertNarratorMasteredReviewBinding(binding);
  return binding;
}

export function recordNarratorMasteredReview(
  binding: NarratorMasteredReviewBinding,
  input: Parameters<typeof recordMasteredChapterReview>[1] & Readonly<{
    findingAcknowledgements: readonly string[];
  }>,
): NarratorMasteredReviewBinding {
  assertNarratorMasteredReviewBinding(binding);
  const findingCodes = normaliseFindingCodes(
    binding.receipt.findingCodes,
    "NARRATOR_MASTERED_REVIEW_RECEIPT_FINDINGS_INVALID",
  );
  const acknowledgements = normaliseFindingCodes(
    input.findingAcknowledgements,
    "NARRATOR_MASTERED_REVIEW_ACK_FINDINGS_INVALID",
  );
  if (!equalStrings(findingCodes, acknowledgements)) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_FINDINGS_UNACKNOWLEDGED");
  }
  const { findingAcknowledgements: _acknowledgements, ...reviewInput } = input;
  const nextSession = recordMasteredChapterReview(binding.reviewSession, reviewInput);
  const review = nextSession.reviews.at(-1);
  if (!review || review.id !== input.id) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_ENTRY_MISSING");
  }
  const acknowledgementPartial: Omit<NarratorMasteredReviewAcknowledgement, "fingerprint"> = {
    role: review.role,
    reviewFingerprint: review.fingerprint,
    findingCodes,
    acknowledgedAt: review.decidedAt,
  };
  const acknowledgement = Object.freeze({
    ...acknowledgementPartial,
    fingerprint: stableHash(acknowledgementBase(acknowledgementPartial)),
  });
  const partial: Omit<NarratorMasteredReviewBinding, "fingerprint"> = {
    ...binding,
    reviewSession: nextSession,
    acknowledgements: Object.freeze([...binding.acknowledgements, acknowledgement]),
    revision: binding.revision + 1,
    previousFingerprint: binding.fingerprint,
    createdAt: binding.createdAt,
    updatedAt: review.decidedAt,
    fingerprint: undefined as never,
  };
  delete (partial as Partial<NarratorMasteredReviewBinding>).fingerprint;
  const next = Object.freeze({ ...partial, fingerprint: stableHash(bindingBase(partial)) });
  assertNarratorMasteredReviewBinding(next);
  return next;
}

export function assertNarratorMasteredReviewBinding(
  binding: NarratorMasteredReviewBinding,
): void {
  if (binding.schemaVersion !== NARRATOR_MASTERED_REVIEW_BINDING_SCHEMA) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_BINDING_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(binding.projectId, "NARRATOR_MASTERED_REVIEW_PROJECT_INVALID");
  requireIdentifier(binding.chapterId, "NARRATOR_MASTERED_REVIEW_CHAPTER_INVALID");
  assertReceiptBinding(binding.casting, binding.authorization, binding.receipt, binding.reviewSession);
  if (binding.projectId !== binding.receipt.projectId || binding.chapterId !== binding.receipt.chapterId) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_SCOPE_MISMATCH");
  }
  if (binding.reviewSession.status === "approved" || binding.reviewSession.approval !== undefined) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_APPROVAL_REQUIRES_SEPARATE_RECEIPT");
  }
  const findingCodes = normaliseFindingCodes(
    binding.receipt.findingCodes,
    "NARRATOR_MASTERED_REVIEW_RECEIPT_FINDINGS_INVALID",
  );
  assertAcknowledgementSet(binding.reviewSession, binding.acknowledgements, findingCodes);
  requireInteger(binding.revision, 1, Number.MAX_SAFE_INTEGER, "NARRATOR_MASTERED_REVIEW_REVISION_INVALID");
  if (binding.revision === 1 && binding.previousFingerprint !== undefined) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_REVISION_CHAIN_INVALID");
  }
  if (binding.revision > 1) {
    requireHash(binding.previousFingerprint ?? "", "NARRATOR_MASTERED_REVIEW_REVISION_CHAIN_INVALID");
  }
  requireDate(binding.createdAt, "NARRATOR_MASTERED_REVIEW_DATE_INVALID");
  requireDate(binding.updatedAt, "NARRATOR_MASTERED_REVIEW_DATE_INVALID");
  if (
    Date.parse(binding.updatedAt) < Date.parse(binding.createdAt)
    || binding.updatedAt !== binding.reviewSession.updatedAt
    || binding.createdAt !== binding.reviewSession.createdAt
    || binding.revision !== binding.reviewSession.revision
  ) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_REVISION_SESSION_MISMATCH");
  }
  if (
    binding.masteredListeningApproval !== false
    || binding.completeBookListeningApproval !== false
    || binding.titleNarratorApproval !== false
    || binding.titleReleaseAuthority !== false
    || binding.publicationAuthority !== false
  ) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_AUTHORITY_INVALID");
  }
  const { fingerprint, ...partial } = binding;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(bindingBase(partial))) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_BINDING_FINGERPRINT_INVALID");
  }
}

export function createNarratorMasteredReviewApproval(input: Readonly<{
  binding: NarratorMasteredReviewBinding;
  approvedSession: MasteredChapterReviewSession;
  approvedArtifact: ArtifactRecord;
}>): NarratorMasteredReviewApproval {
  assertNarratorMasteredReviewBinding(input.binding);
  assertMasteredChapterReviewSession(input.approvedSession);
  assertArtifactRecord(input.approvedArtifact);
  if (
    input.binding.reviewSession.status !== "ready-for-approval"
    || input.approvedSession.status !== "approved"
    || !input.approvedSession.approval
    || input.approvedSession.id !== input.binding.reviewSession.id
    || input.approvedSession.projectId !== input.binding.projectId
    || input.approvedSession.chapterId !== input.binding.chapterId
    || input.approvedSession.chainFingerprint !== input.binding.receipt.masteredChapterChainFingerprint
    || input.approvedSession.previousFingerprint !== input.binding.reviewSession.fingerprint
    || input.approvedSession.revision !== input.binding.reviewSession.revision + 1
    || stableHash(input.approvedSession.reviews) !== stableHash(input.binding.reviewSession.reviews)
  ) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_APPROVAL_SESSION_MISMATCH");
  }
  const latest = latestReviews(input.approvedSession);
  if (!REQUIRED_ROLES.every((role) => latest.get(role)?.decision === "approve")) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_APPROVAL_ROLES_INCOMPLETE");
  }
  if ([...latest.values()].some((review) =>
    review.reviewerId === input.approvedSession.approval?.approvedByActorId
  )) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_FINAL_APPROVER_NOT_INDEPENDENT");
  }
  const source = input.binding.receipt.masteredArtifact;
  if (
    input.approvedArtifact.kind !== "mastered-chapter"
    || input.approvedArtifact.projectId !== input.binding.projectId
    || input.approvedArtifact.segmentId !== input.binding.chapterId
    || input.approvedArtifact.id !== source.id
    || input.approvedArtifact.revision !== source.revision + 1
    || input.approvedArtifact.previousFingerprint !== source.fingerprint
    || input.approvedArtifact.integrity.contentHash !== source.contentHash
    || input.approvedArtifact.integrity.byteCount !== source.byteCount
    || input.approvedArtifact.rights.rightsFingerprint !== input.binding.authorization.rightsFingerprint
    || input.approvedArtifact.verification.status !== "verified"
    || input.approvedArtifact.review.status !== "approved"
    || input.approvedArtifact.release.status !== "unavailable"
    || input.approvedArtifact.quarantine
    || input.approvedSession.approval.artifactReviewFingerprint !== input.approvedArtifact.fingerprint
  ) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_APPROVED_ARTIFACT_MISMATCH");
  }
  const approvedAt = requireDate(
    input.approvedSession.approval.approvedAt,
    "NARRATOR_MASTERED_REVIEW_APPROVAL_DATE_INVALID",
  );
  if (Date.parse(approvedAt) < Date.parse(input.binding.updatedAt)) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_APPROVAL_DATE_REVERSED");
  }
  const partial: Omit<NarratorMasteredReviewApproval, "fingerprint"> = {
    schemaVersion: NARRATOR_MASTERED_REVIEW_APPROVAL_SCHEMA,
    projectId: input.binding.projectId,
    chapterId: input.binding.chapterId,
    casting: input.binding.casting,
    authorization: input.binding.authorization,
    receipt: input.binding.receipt,
    bindingFingerprint: input.binding.fingerprint,
    reviewSession: input.approvedSession,
    acknowledgements: input.binding.acknowledgements,
    approvedArtifact: snapshot(input.approvedArtifact),
    approvedAt,
    masteredListeningApproval: true,
    completeBookListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const approval = Object.freeze({ ...partial, fingerprint: stableHash(approvalBase(partial)) });
  assertNarratorMasteredReviewApproval(approval);
  return approval;
}

export function assertNarratorMasteredReviewApproval(
  approval: NarratorMasteredReviewApproval,
): void {
  if (approval.schemaVersion !== NARRATOR_MASTERED_REVIEW_APPROVAL_SCHEMA) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_APPROVAL_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(approval.projectId, "NARRATOR_MASTERED_REVIEW_PROJECT_INVALID");
  requireIdentifier(approval.chapterId, "NARRATOR_MASTERED_REVIEW_CHAPTER_INVALID");
  assertReceiptBinding(approval.casting, approval.authorization, approval.receipt, approval.reviewSession);
  assertMasteredChapterReviewSession(approval.reviewSession);
  if (
    approval.projectId !== approval.receipt.projectId
    || approval.chapterId !== approval.receipt.chapterId
    || approval.reviewSession.status !== "approved"
    || !approval.reviewSession.approval
    || approval.reviewSession.chainFingerprint !== approval.receipt.masteredChapterChainFingerprint
    || approval.reviewSession.approval.approvedAt !== approval.approvedAt
  ) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_APPROVAL_BINDING_MISMATCH");
  }
  requireHash(approval.bindingFingerprint, "NARRATOR_MASTERED_REVIEW_BINDING_HASH_INVALID");
  const findingCodes = normaliseFindingCodes(
    approval.receipt.findingCodes,
    "NARRATOR_MASTERED_REVIEW_RECEIPT_FINDINGS_INVALID",
  );
  assertAcknowledgementSet(approval.reviewSession, approval.acknowledgements, findingCodes);
  assertApprovedSnapshot(approval.approvedArtifact);
  if (
    approval.approvedArtifact.id !== approval.receipt.masteredArtifact.id
    || approval.approvedArtifact.revision !== approval.receipt.masteredArtifact.revision + 1
    || approval.approvedArtifact.previousFingerprint !== approval.receipt.masteredArtifact.fingerprint
    || approval.approvedArtifact.contentHash !== approval.receipt.masteredArtifact.contentHash
    || approval.approvedArtifact.byteCount !== approval.receipt.masteredArtifact.byteCount
    || approval.approvedArtifact.rightsFingerprint !== approval.authorization.rightsFingerprint
    || approval.reviewSession.approval.artifactReviewFingerprint
      !== approval.approvedArtifact.fingerprint
  ) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_APPROVED_ARTIFACT_MISMATCH");
  }
  const latest = latestReviews(approval.reviewSession);
  if (
    !REQUIRED_ROLES.every((role) => latest.get(role)?.decision === "approve")
    || [...latest.values()].some((review) =>
      review.reviewerId === approval.reviewSession.approval?.approvedByActorId
    )
  ) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_APPROVER_INDEPENDENCE_INVALID");
  }
  requireDate(approval.approvedAt, "NARRATOR_MASTERED_REVIEW_APPROVAL_DATE_INVALID");
  if (
    approval.masteredListeningApproval !== true
    || approval.completeBookListeningApproval !== false
    || approval.titleNarratorApproval !== false
    || approval.titleReleaseAuthority !== false
    || approval.publicationAuthority !== false
  ) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_APPROVAL_AUTHORITY_INVALID");
  }
  const { fingerprint, ...partial } = approval;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(approvalBase(partial))) {
    throw new NarratorMasteredReviewError("NARRATOR_MASTERED_REVIEW_APPROVAL_FINGERPRINT_INVALID");
  }
}

export function narratorMasteredReviewPublicView(
  value: NarratorMasteredReviewBinding | NarratorMasteredReviewApproval,
): NarratorMasteredReviewPublicView {
  const approved = value.schemaVersion === NARRATOR_MASTERED_REVIEW_APPROVAL_SCHEMA;
  if (approved) assertNarratorMasteredReviewApproval(value as NarratorMasteredReviewApproval);
  else assertNarratorMasteredReviewBinding(value as NarratorMasteredReviewBinding);
  const receipt = value.receipt;
  const reviewSession = value.reviewSession;
  const artifact = approved
    ? (value as NarratorMasteredReviewApproval).approvedArtifact
    : receipt.masteredArtifact;
  return Object.freeze({
    chapterId: value.chapterId,
    masteredArtifactId: artifact.id,
    masteredArtifactRevision: artifact.revision,
    narratorEvidenceBound: true,
    reviewStatus: reviewSession.status,
    findingCodeCount: receipt.findingCodes.length,
    masteredListeningApproval: approved,
    completeBookListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    fingerprint: value.fingerprint,
  });
}
