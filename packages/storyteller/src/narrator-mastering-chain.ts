import { createHash } from "node:crypto";
import {
  assertAudioEngineeringEvidence,
  type AudioEngineeringEvidence,
  type AudioEngineeringProfileSnapshot,
} from "./audio-engineering.js";
import {
  assertArtifactRecord,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import type { FileArtifactRegistry } from "./artifact-store.js";
import {
  assertChapterRenderEvidence,
  type ChapterRenderEvidence,
} from "./chapter-render.js";
import { stableHash } from "./index.js";
import {
  assertMasteredChapterArtifactChain,
  ingestMasteredChapter,
  type IngestMasteredChapterInput,
  type MasteredChapterArtifactChain,
} from "./mastered-chapter.js";
import {
  assertMasteringPlan,
  createMasteringPlan,
  type MasteringOperation,
  type MasteringOutputProfile,
  type MasteringPlan,
} from "./mastering-plan.js";
import {
  assertMasteringRenderEvidence,
  renderMasteringPlan,
  type MasteringRenderEvidence,
  type MasteringRenderResult,
  type RenderMasteringPlanInput,
} from "./mastering-render.js";
import {
  assertChapterNarratorReview,
  assertExactNarratorVoicePin,
  assertNarratorCasting,
  type ChapterNarratorReview,
  type NarratorCastingApproval,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";
import type { FilePrivateObjectStore } from "./private-object-store.js";

export const NARRATOR_MASTERING_AUTHORIZATION_SCHEMA =
  "storyteller-narrator-mastering-authorization-v1" as const;
export const NARRATOR_APPROVED_MASTERING_PLAN_SCHEMA =
  "storyteller-narrator-approved-mastering-plan-v1" as const;
export const NARRATOR_APPROVED_MASTERING_RENDER_SCHEMA =
  "storyteller-narrator-approved-mastering-render-v1" as const;
export const NARRATOR_APPROVED_MASTERED_CHAPTER_SCHEMA =
  "storyteller-narrator-approved-mastered-chapter-v1" as const;

export interface NarratorMasteringArtifactSnapshot {
  id: string;
  revision: number;
  fingerprint: string;
  contentHash: string;
  byteCount: number;
}

export interface NarratorMasteringAuthorization {
  schemaVersion: typeof NARRATOR_MASTERING_AUTHORIZATION_SCHEMA;
  projectId: string;
  chapterId: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  assembly: Readonly<{
    planId: string;
    planFingerprint: string;
  }>;
  chapterRender: Readonly<{
    fingerprint: string;
    commandFingerprint: string;
    outputContentHash: string;
    outputByteCount: number;
    renderedAt: string;
  }>;
  sourceMaster: NarratorMasteringArtifactSnapshot;
  sourceEngineering: Readonly<{
    artifact: NarratorMasteringArtifactSnapshot;
    evidenceFingerprint: string;
    profileFingerprint: string;
  }>;
  chapterReview: Readonly<{
    fingerprint: string;
    objectiveMonitoringFingerprint: string;
    objectiveMonitoringPolicyFingerprint: string;
    objectiveMonitoringReferenceFingerprint: string;
    objectiveMonitoringObservationFingerprint: string;
    reviewerPanelFingerprint: string;
    sourceFingerprint: string;
    reviewedAt: string;
  }>;
  manuscriptSourceHash: string;
  rightsFingerprint: string;
  authorizedByActorId: string;
  authorizedAt: string;
  masteringEligible: true;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface CreateNarratorMasteringAuthorizationInput {
  casting: NarratorCastingApproval;
  review: ChapterNarratorReview;
  chapterRenderEvidence: ChapterRenderEvidence;
  chapterMaster: ArtifactRecord;
  engineeringArtifact: ArtifactRecord;
  engineeringEvidence: AudioEngineeringEvidence;
  authorizedByActorId: string;
  authorizedAt?: Date;
}

export interface NarratorApprovedMasteringPlan {
  schemaVersion: typeof NARRATOR_APPROVED_MASTERING_PLAN_SCHEMA;
  authorization: NarratorMasteringAuthorization;
  chapterNarratorReviewFingerprint: string;
  objectiveMonitoringFingerprint: string;
  plan: MasteringPlan;
  masteringEligible: true;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface CreateNarratorApprovedMasteringPlanInput {
  authorization: NarratorMasteringAuthorization;
  chapterMaster: ArtifactRecord;
  engineeringArtifact: ArtifactRecord;
  engineeringEvidence: AudioEngineeringEvidence;
  id: string;
  targetProfile: AudioEngineeringProfileSnapshot;
  output: MasteringOutputProfile;
  operations: readonly MasteringOperation[];
  rationale: string;
  createdByActorId: string;
  createdAt?: Date;
}

export interface NarratorApprovedMasteringRenderReceipt {
  schemaVersion: typeof NARRATOR_APPROVED_MASTERING_RENDER_SCHEMA;
  authorizationFingerprint: string;
  chapterNarratorReviewFingerprint: string;
  objectiveMonitoringFingerprint: string;
  planId: string;
  planFingerprint: string;
  renderEvidence: MasteringRenderEvidence;
  outputContentHash: string;
  outputByteCount: number;
  renderedAt: string;
  masteredListeningApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface NarratorApprovedMasteredChapterReceipt {
  schemaVersion: typeof NARRATOR_APPROVED_MASTERED_CHAPTER_SCHEMA;
  projectId: string;
  chapterId: string;
  planId: string;
  planFingerprint: string;
  authorizationFingerprint: string;
  chapterNarratorReviewFingerprint: string;
  objectiveMonitoringFingerprint: string;
  approvedMasteringPlanFingerprint: string;
  masteringRenderReceiptFingerprint: string;
  masteredChapterChainFingerprint: string;
  masteredArtifact: NarratorMasteringArtifactSnapshot;
  postMasterEngineeringFingerprint: string;
  eligibleForHumanMasterReview: boolean;
  findingCodes: readonly string[];
  masteredListeningApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface NarratorApprovedMasteredChapterPublicView {
  chapterId: string;
  planId: string;
  masteredArtifactId: string;
  masteredRevision: number;
  narratorEvidenceBound: true;
  eligibleForHumanMasterReview: boolean;
  findingCodes: readonly string[];
  masteredListeningApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export class NarratorMasteringChainError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NarratorMasteringChainError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new NarratorMasteringChainError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new NarratorMasteringChainError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || value.length > 64 || Number.isNaN(Date.parse(value))) {
    throw new NarratorMasteringChainError(code);
  }
  return value;
}

function requireInteger(value: number, minimum: number, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new NarratorMasteringChainError(code);
  }
  return value;
}

function requireActor(value: string, code: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 256 || CONTROL.test(value)) {
    throw new NarratorMasteringChainError(code);
  }
  return value.trim();
}

function snapshot(record: ArtifactRecord): NarratorMasteringArtifactSnapshot {
  return Object.freeze({
    id: record.id,
    revision: record.revision,
    fingerprint: record.fingerprint,
    contentHash: record.integrity.contentHash,
    byteCount: record.integrity.byteCount,
  });
}

function assertSnapshot(value: NarratorMasteringArtifactSnapshot, code: string): void {
  requireIdentifier(value.id, code);
  requireInteger(value.revision, 1, Number.MAX_SAFE_INTEGER, code);
  requireHash(value.fingerprint, code);
  requireHash(value.contentHash, code);
  requireInteger(value.byteCount, 1, Number.MAX_SAFE_INTEGER, code);
}

function snapshotMatches(record: ArtifactRecord, expected: NarratorMasteringArtifactSnapshot): boolean {
  return record.id === expected.id
    && record.revision === expected.revision
    && record.fingerprint === expected.fingerprint
    && record.integrity.contentHash === expected.contentHash
    && record.integrity.byteCount === expected.byteCount;
}

function assertVerifiedApprovedMaster(record: ArtifactRecord): void {
  assertArtifactRecord(record);
  if (
    record.kind !== "chapter-master"
    || record.verification.status !== "verified"
    || record.verification.findings.some((finding) => finding.severity === "error")
    || record.review.status !== "approved"
    || record.quarantine
  ) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_SOURCE_MASTER_NOT_APPROVED");
  }
}

function assertVerifiedEngineering(record: ArtifactRecord): void {
  assertArtifactRecord(record);
  if (
    record.kind !== "audio-analysis"
    || record.verification.status !== "verified"
    || record.verification.findings.some((finding) => finding.severity === "error")
    || record.quarantine
  ) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_SOURCE_ENGINEERING_NOT_VERIFIED");
  }
}

function authorizationBase(
  value: Omit<NarratorMasteringAuthorization, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function approvedPlanBase(
  value: Omit<NarratorApprovedMasteringPlan, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function renderReceiptBase(
  value: Omit<NarratorApprovedMasteringRenderReceipt, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function masteredReceiptBase(
  value: Omit<NarratorApprovedMasteredChapterReceipt, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function assertCurrentSources(
  authorization: NarratorMasteringAuthorization,
  chapterMaster: ArtifactRecord,
  engineeringArtifact: ArtifactRecord,
  engineeringEvidence: AudioEngineeringEvidence,
): void {
  assertVerifiedApprovedMaster(chapterMaster);
  assertVerifiedEngineering(engineeringArtifact);
  assertAudioEngineeringEvidence(engineeringEvidence);
  if (!snapshotMatches(chapterMaster, authorization.sourceMaster)) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_SOURCE_MASTER_CHANGED");
  }
  if (!snapshotMatches(engineeringArtifact, authorization.sourceEngineering.artifact)) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_SOURCE_ENGINEERING_CHANGED");
  }
  if (
    engineeringEvidence.fingerprint !== authorization.sourceEngineering.evidenceFingerprint
    || engineeringEvidence.profile.fingerprint !== authorization.sourceEngineering.profileFingerprint
    || engineeringEvidence.inputContentHash !== chapterMaster.integrity.contentHash
    || engineeringEvidence.inputByteCount !== chapterMaster.integrity.byteCount
  ) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_SOURCE_EVIDENCE_CHANGED");
  }
}

export function createNarratorMasteringAuthorization(
  input: CreateNarratorMasteringAuthorizationInput,
): NarratorMasteringAuthorization {
  assertNarratorCasting(input.casting);
  assertChapterNarratorReview(input.review, input.casting);
  assertChapterRenderEvidence(input.chapterRenderEvidence);
  assertVerifiedApprovedMaster(input.chapterMaster);
  assertVerifiedEngineering(input.engineeringArtifact);
  assertAudioEngineeringEvidence(input.engineeringEvidence);

  const projectId = requireIdentifier(input.review.projectId, "NARRATOR_MASTERING_PROJECT_INVALID");
  const chapterId = requireIdentifier(input.review.chapterId, "NARRATOR_MASTERING_CHAPTER_INVALID");
  if (projectId !== input.casting.projectId) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_CASTING_PROJECT_MISMATCH");
  }
  if (
    input.chapterMaster.projectId !== projectId
    || input.chapterMaster.segmentId !== chapterId
    || input.engineeringArtifact.projectId !== projectId
    || input.engineeringArtifact.segmentId !== chapterId
    || input.engineeringArtifact.jobId !== input.chapterMaster.jobId
    || input.engineeringArtifact.takeId !== input.chapterMaster.takeId
  ) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_SOURCE_SCOPE_MISMATCH");
  }
  if (input.review.renderFingerprint !== input.chapterRenderEvidence.fingerprint) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_REVIEW_RENDER_MISMATCH");
  }
  if (
    input.chapterMaster.integrity.contentHash !== input.chapterRenderEvidence.output.contentHash
    || input.chapterMaster.integrity.byteCount !== input.chapterRenderEvidence.output.byteCount
    || input.chapterMaster.provenance.generationRequestHash !== input.chapterRenderEvidence.commandFingerprint
  ) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_MASTER_RENDER_MISMATCH");
  }
  const manuscriptSourceHash = input.chapterMaster.provenance.sourceContentHash;
  if (!manuscriptSourceHash || !HASH.test(manuscriptSourceHash)) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_MANUSCRIPT_HASH_INVALID");
  }
  if (
    !input.engineeringArtifact.provenance.parentArtifactIds.includes(input.chapterMaster.id)
    || input.engineeringArtifact.provenance.sourceContentHash !== input.chapterMaster.integrity.contentHash
    || input.engineeringArtifact.provenance.generationRequestHash
      !== input.chapterRenderEvidence.commandFingerprint
    || input.engineeringEvidence.inputContentHash !== input.chapterMaster.integrity.contentHash
    || input.engineeringEvidence.inputByteCount !== input.chapterMaster.integrity.byteCount
  ) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_ENGINEERING_BINDING_MISMATCH");
  }
  if (
    input.engineeringArtifact.rights.rightsFingerprint
      !== input.chapterMaster.rights.rightsFingerprint
    || !input.engineeringEvidence.eligible
    || input.engineeringEvidence.findings.some((finding) => finding.severity === "error")
  ) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_ENGINEERING_INELIGIBLE");
  }
  if (
    input.engineeringEvidence.metrics.sampleRateHz
      !== input.chapterRenderEvidence.output.sampleRateHz
    || input.engineeringEvidence.metrics.channels
      !== input.chapterRenderEvidence.output.channels
  ) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_RENDER_PROFILE_MISMATCH");
  }
  if (Date.parse(input.review.reviewedAt) < Date.parse(input.chapterRenderEvidence.renderedAt)) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_REVIEW_PRECEDES_RENDER");
  }
  const authorizedAtDate = input.authorizedAt ?? new Date();
  if (Number.isNaN(authorizedAtDate.getTime())) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_AUTHORIZATION_DATE_INVALID");
  }
  const authorizedAt = authorizedAtDate.toISOString();
  if (Date.parse(authorizedAt) < Date.parse(input.review.reviewedAt)) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_AUTHORIZATION_PRECEDES_REVIEW");
  }

  const partial: Omit<NarratorMasteringAuthorization, "fingerprint"> = {
    schemaVersion: NARRATOR_MASTERING_AUTHORIZATION_SCHEMA,
    projectId,
    chapterId,
    castingFingerprint: input.casting.fingerprint,
    voice: Object.freeze({ ...input.casting.voice }),
    assembly: Object.freeze({
      planId: input.chapterRenderEvidence.planId,
      planFingerprint: input.chapterRenderEvidence.planFingerprint,
    }),
    chapterRender: Object.freeze({
      fingerprint: input.chapterRenderEvidence.fingerprint,
      commandFingerprint: input.chapterRenderEvidence.commandFingerprint,
      outputContentHash: input.chapterRenderEvidence.output.contentHash,
      outputByteCount: input.chapterRenderEvidence.output.byteCount,
      renderedAt: input.chapterRenderEvidence.renderedAt,
    }),
    sourceMaster: snapshot(input.chapterMaster),
    sourceEngineering: Object.freeze({
      artifact: snapshot(input.engineeringArtifact),
      evidenceFingerprint: input.engineeringEvidence.fingerprint,
      profileFingerprint: input.engineeringEvidence.profile.fingerprint,
    }),
    chapterReview: Object.freeze({
      fingerprint: input.review.fingerprint,
      objectiveMonitoringFingerprint: input.review.objectiveMonitoringFingerprint,
      objectiveMonitoringPolicyFingerprint: input.review.objectiveMonitoringPolicyFingerprint,
      objectiveMonitoringReferenceFingerprint: input.review.objectiveMonitoringReferenceFingerprint,
      objectiveMonitoringObservationFingerprint: input.review.objectiveMonitoringObservationFingerprint,
      reviewerPanelFingerprint: input.review.reviewerPanelFingerprint,
      sourceFingerprint: input.review.sourceFingerprint,
      reviewedAt: input.review.reviewedAt,
    }),
    manuscriptSourceHash,
    rightsFingerprint: input.chapterMaster.rights.rightsFingerprint,
    authorizedByActorId: requireActor(
      input.authorizedByActorId,
      "NARRATOR_MASTERING_AUTHORIZER_INVALID",
    ),
    authorizedAt,
    masteringEligible: true,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(authorizationBase(partial)),
  });
}

export function assertNarratorMasteringAuthorization(
  authorization: NarratorMasteringAuthorization,
): void {
  if (authorization.schemaVersion !== NARRATOR_MASTERING_AUTHORIZATION_SCHEMA) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_AUTHORIZATION_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(authorization.projectId, "NARRATOR_MASTERING_PROJECT_INVALID");
  requireIdentifier(authorization.chapterId, "NARRATOR_MASTERING_CHAPTER_INVALID");
  requireHash(authorization.castingFingerprint, "NARRATOR_MASTERING_CASTING_HASH_INVALID");
  assertExactNarratorVoicePin(authorization.voice, authorization.voice);
  requireIdentifier(authorization.assembly.planId, "NARRATOR_MASTERING_PLAN_ID_INVALID");
  requireHash(authorization.assembly.planFingerprint, "NARRATOR_MASTERING_ASSEMBLY_HASH_INVALID");
  for (const hash of [
    authorization.chapterRender.fingerprint,
    authorization.chapterRender.commandFingerprint,
    authorization.chapterRender.outputContentHash,
    authorization.sourceEngineering.evidenceFingerprint,
    authorization.sourceEngineering.profileFingerprint,
    authorization.chapterReview.fingerprint,
    authorization.chapterReview.objectiveMonitoringFingerprint,
    authorization.chapterReview.objectiveMonitoringPolicyFingerprint,
    authorization.chapterReview.objectiveMonitoringReferenceFingerprint,
    authorization.chapterReview.objectiveMonitoringObservationFingerprint,
    authorization.chapterReview.reviewerPanelFingerprint,
    authorization.chapterReview.sourceFingerprint,
    authorization.manuscriptSourceHash,
    authorization.rightsFingerprint,
  ]) requireHash(hash, "NARRATOR_MASTERING_AUTHORIZATION_HASH_INVALID");
  requireInteger(
    authorization.chapterRender.outputByteCount,
    1,
    Number.MAX_SAFE_INTEGER,
    "NARRATOR_MASTERING_RENDER_SIZE_INVALID",
  );
  assertSnapshot(authorization.sourceMaster, "NARRATOR_MASTERING_SOURCE_MASTER_SNAPSHOT_INVALID");
  assertSnapshot(
    authorization.sourceEngineering.artifact,
    "NARRATOR_MASTERING_SOURCE_ENGINEERING_SNAPSHOT_INVALID",
  );
  requireActor(authorization.authorizedByActorId, "NARRATOR_MASTERING_AUTHORIZER_INVALID");
  requireDate(authorization.chapterRender.renderedAt, "NARRATOR_MASTERING_RENDER_DATE_INVALID");
  requireDate(authorization.chapterReview.reviewedAt, "NARRATOR_MASTERING_REVIEW_DATE_INVALID");
  requireDate(authorization.authorizedAt, "NARRATOR_MASTERING_AUTHORIZATION_DATE_INVALID");
  if (
    Date.parse(authorization.chapterReview.reviewedAt)
      < Date.parse(authorization.chapterRender.renderedAt)
    || Date.parse(authorization.authorizedAt)
      < Date.parse(authorization.chapterReview.reviewedAt)
  ) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_AUTHORIZATION_CHRONOLOGY_INVALID");
  }
  if (
    authorization.masteringEligible !== true
    || authorization.titleReleaseAuthority !== false
    || authorization.publicationAuthority !== false
  ) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_AUTHORIZATION_AUTHORITY_INVALID");
  }
  const { fingerprint, ...partial } = authorization;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(authorizationBase(partial))) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_AUTHORIZATION_FINGERPRINT_INVALID");
  }
}

export function createNarratorApprovedMasteringPlan(
  input: CreateNarratorApprovedMasteringPlanInput,
): NarratorApprovedMasteringPlan {
  assertNarratorMasteringAuthorization(input.authorization);
  assertCurrentSources(
    input.authorization,
    input.chapterMaster,
    input.engineeringArtifact,
    input.engineeringEvidence,
  );
  const createdAt = input.createdAt ?? new Date();
  if (
    Number.isNaN(createdAt.getTime())
    || createdAt.getTime() < Date.parse(input.authorization.authorizedAt)
  ) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_PLAN_CHRONOLOGY_INVALID");
  }
  const plan = createMasteringPlan({
    id: input.id,
    projectId: input.authorization.projectId,
    chapterId: input.authorization.chapterId,
    chapterMaster: input.chapterMaster,
    engineeringArtifact: input.engineeringArtifact,
    engineeringEvidence: input.engineeringEvidence,
    targetProfile: input.targetProfile,
    output: input.output,
    operations: input.operations,
    rationale: input.rationale,
    createdByActorId: input.createdByActorId,
    createdAt,
  });
  const partial: Omit<NarratorApprovedMasteringPlan, "fingerprint"> = {
    schemaVersion: NARRATOR_APPROVED_MASTERING_PLAN_SCHEMA,
    authorization: input.authorization,
    chapterNarratorReviewFingerprint: input.authorization.chapterReview.fingerprint,
    objectiveMonitoringFingerprint:
      input.authorization.chapterReview.objectiveMonitoringFingerprint,
    plan,
    masteringEligible: true,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const approved = Object.freeze({
    ...partial,
    fingerprint: stableHash(approvedPlanBase(partial)),
  });
  assertNarratorApprovedMasteringPlan(approved);
  return approved;
}

export function assertNarratorApprovedMasteringPlan(
  approved: NarratorApprovedMasteringPlan,
): void {
  if (approved.schemaVersion !== NARRATOR_APPROVED_MASTERING_PLAN_SCHEMA) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_PLAN_SCHEMA_UNSUPPORTED");
  }
  assertNarratorMasteringAuthorization(approved.authorization);
  assertMasteringPlan(approved.plan);
  if (
    approved.plan.projectId !== approved.authorization.projectId
    || approved.plan.chapterId !== approved.authorization.chapterId
    || approved.plan.sourceMaster.id !== approved.authorization.sourceMaster.id
    || approved.plan.sourceMaster.fingerprint !== approved.authorization.sourceMaster.fingerprint
    || approved.plan.sourceMaster.contentHash !== approved.authorization.sourceMaster.contentHash
    || approved.plan.sourceMaster.byteCount !== approved.authorization.sourceMaster.byteCount
    || approved.plan.sourceEngineering.artifact.id
      !== approved.authorization.sourceEngineering.artifact.id
    || approved.plan.sourceEngineering.artifact.fingerprint
      !== approved.authorization.sourceEngineering.artifact.fingerprint
    || approved.plan.sourceEngineering.evidenceFingerprint
      !== approved.authorization.sourceEngineering.evidenceFingerprint
    || approved.chapterNarratorReviewFingerprint
      !== approved.authorization.chapterReview.fingerprint
    || approved.objectiveMonitoringFingerprint
      !== approved.authorization.chapterReview.objectiveMonitoringFingerprint
    || Date.parse(approved.plan.createdAt) < Date.parse(approved.authorization.authorizedAt)
  ) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_PLAN_BINDING_MISMATCH");
  }
  if (
    approved.masteringEligible !== true
    || approved.titleReleaseAuthority !== false
    || approved.publicationAuthority !== false
  ) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_PLAN_AUTHORITY_INVALID");
  }
  const { fingerprint, ...partial } = approved;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(approvedPlanBase(partial))) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_PLAN_FINGERPRINT_INVALID");
  }
}

export function createNarratorApprovedMasteringRenderReceipt(
  input: Readonly<{
    approvedPlan: NarratorApprovedMasteringPlan;
    render: MasteringRenderResult;
  }>,
): NarratorApprovedMasteringRenderReceipt {
  assertNarratorApprovedMasteringPlan(input.approvedPlan);
  assertMasteringRenderEvidence(input.render.evidence);
  if (!(input.render.bytes instanceof Uint8Array) || input.render.bytes.byteLength === 0) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_RENDER_BYTES_REQUIRED");
  }
  const plan = input.approvedPlan.plan;
  const evidence = input.render.evidence;
  if (
    evidence.planId !== plan.id
    || evidence.planFingerprint !== plan.fingerprint
    || evidence.source.artifactId !== plan.sourceMaster.id
    || evidence.source.artifactFingerprint !== plan.sourceMaster.fingerprint
    || evidence.source.contentHash !== plan.sourceMaster.contentHash
    || evidence.source.byteCount !== plan.sourceMaster.byteCount
    || evidence.source.engineeringFingerprint
      !== plan.sourceEngineering.evidenceFingerprint
    || evidence.operationsFingerprint !== stableHash(plan.operations)
    || evidence.predictedMetricsFingerprint !== stableHash(plan.prediction.metrics)
    || evidence.output.contentHash !== hashBytes(input.render.bytes)
    || evidence.output.byteCount !== input.render.bytes.byteLength
    || evidence.output.format !== plan.output.format
    || evidence.output.sampleRateHz !== plan.output.sampleRateHz
    || evidence.output.channels !== plan.output.channels
    || evidence.output.bitDepth !== plan.output.bitDepth
    || Date.parse(evidence.renderedAt) < Date.parse(plan.createdAt)
  ) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_RENDER_BINDING_MISMATCH");
  }
  const partial: Omit<NarratorApprovedMasteringRenderReceipt, "fingerprint"> = {
    schemaVersion: NARRATOR_APPROVED_MASTERING_RENDER_SCHEMA,
    authorizationFingerprint: input.approvedPlan.authorization.fingerprint,
    chapterNarratorReviewFingerprint:
      input.approvedPlan.chapterNarratorReviewFingerprint,
    objectiveMonitoringFingerprint:
      input.approvedPlan.objectiveMonitoringFingerprint,
    planId: plan.id,
    planFingerprint: plan.fingerprint,
    renderEvidence: evidence,
    outputContentHash: evidence.output.contentHash,
    outputByteCount: evidence.output.byteCount,
    renderedAt: evidence.renderedAt,
    masteredListeningApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(renderReceiptBase(partial)),
  });
}

export function assertNarratorApprovedMasteringRenderReceipt(
  receipt: NarratorApprovedMasteringRenderReceipt,
  approvedPlan: NarratorApprovedMasteringPlan,
): void {
  assertNarratorApprovedMasteringPlan(approvedPlan);
  if (receipt.schemaVersion !== NARRATOR_APPROVED_MASTERING_RENDER_SCHEMA) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_RENDER_SCHEMA_UNSUPPORTED");
  }
  assertMasteringRenderEvidence(receipt.renderEvidence);
  if (
    receipt.authorizationFingerprint !== approvedPlan.authorization.fingerprint
    || receipt.chapterNarratorReviewFingerprint
      !== approvedPlan.chapterNarratorReviewFingerprint
    || receipt.objectiveMonitoringFingerprint
      !== approvedPlan.objectiveMonitoringFingerprint
    || receipt.planId !== approvedPlan.plan.id
    || receipt.planFingerprint !== approvedPlan.plan.fingerprint
    || receipt.renderEvidence.planId !== approvedPlan.plan.id
    || receipt.renderEvidence.planFingerprint !== approvedPlan.plan.fingerprint
    || receipt.outputContentHash !== receipt.renderEvidence.output.contentHash
    || receipt.outputByteCount !== receipt.renderEvidence.output.byteCount
    || receipt.renderedAt !== receipt.renderEvidence.renderedAt
  ) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_RENDER_RECEIPT_BINDING_MISMATCH");
  }
  requireHash(receipt.outputContentHash, "NARRATOR_MASTERING_RENDER_OUTPUT_HASH_INVALID");
  requireInteger(
    receipt.outputByteCount,
    1,
    Number.MAX_SAFE_INTEGER,
    "NARRATOR_MASTERING_RENDER_OUTPUT_SIZE_INVALID",
  );
  requireDate(receipt.renderedAt, "NARRATOR_MASTERING_RENDER_DATE_INVALID");
  if (
    receipt.masteredListeningApproval !== false
    || receipt.titleReleaseAuthority !== false
    || receipt.publicationAuthority !== false
  ) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_RENDER_AUTHORITY_INVALID");
  }
  const { fingerprint, ...partial } = receipt;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(renderReceiptBase(partial))) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERING_RENDER_RECEIPT_FINGERPRINT_INVALID");
  }
}

export async function renderNarratorApprovedMasteringPlan(
  input: Omit<RenderMasteringPlanInput, "plan"> & Readonly<{
    approvedPlan: NarratorApprovedMasteringPlan;
  }>,
): Promise<Readonly<{
  render: MasteringRenderResult;
  receipt: NarratorApprovedMasteringRenderReceipt;
}>> {
  const { approvedPlan, ...renderInput } = input;
  assertNarratorApprovedMasteringPlan(approvedPlan);
  const render = await renderMasteringPlan({
    ...renderInput,
    plan: approvedPlan.plan,
  });
  return Object.freeze({
    render,
    receipt: createNarratorApprovedMasteringRenderReceipt({ approvedPlan, render }),
  });
}

export function createNarratorApprovedMasteredChapterReceipt(
  input: Readonly<{
    approvedPlan: NarratorApprovedMasteringPlan;
    renderReceipt: NarratorApprovedMasteringRenderReceipt;
    chain: MasteredChapterArtifactChain;
  }>,
): NarratorApprovedMasteredChapterReceipt {
  assertNarratorApprovedMasteringPlan(input.approvedPlan);
  assertNarratorApprovedMasteringRenderReceipt(
    input.renderReceipt,
    input.approvedPlan,
  );
  assertMasteredChapterArtifactChain(input.chain);
  const planBytes = jsonBytes(input.approvedPlan.plan);
  const renderBytes = jsonBytes(input.renderReceipt.renderEvidence);
  const mastered = input.chain.masteredChapter.payload;
  if (
    input.chain.planId !== input.approvedPlan.plan.id
    || input.chain.planFingerprint !== input.approvedPlan.plan.fingerprint
    || input.chain.masteringPlanArtifact.payload.integrity.contentHash
      !== hashBytes(planBytes)
    || input.chain.masteringPlanArtifact.payload.integrity.byteCount
      !== planBytes.byteLength
    || input.chain.masteringRenderArtifact.payload.integrity.contentHash
      !== hashBytes(renderBytes)
    || input.chain.masteringRenderArtifact.payload.integrity.byteCount
      !== renderBytes.byteLength
    || mastered.projectId !== input.approvedPlan.authorization.projectId
    || mastered.segmentId !== input.approvedPlan.authorization.chapterId
    || mastered.integrity.contentHash !== input.renderReceipt.outputContentHash
    || mastered.integrity.byteCount !== input.renderReceipt.outputByteCount
  ) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERED_CHAPTER_BINDING_MISMATCH");
  }
  const partial: Omit<NarratorApprovedMasteredChapterReceipt, "fingerprint"> = {
    schemaVersion: NARRATOR_APPROVED_MASTERED_CHAPTER_SCHEMA,
    projectId: input.approvedPlan.authorization.projectId,
    chapterId: input.approvedPlan.authorization.chapterId,
    planId: input.approvedPlan.plan.id,
    planFingerprint: input.approvedPlan.plan.fingerprint,
    authorizationFingerprint: input.approvedPlan.authorization.fingerprint,
    chapterNarratorReviewFingerprint:
      input.approvedPlan.chapterNarratorReviewFingerprint,
    objectiveMonitoringFingerprint:
      input.approvedPlan.objectiveMonitoringFingerprint,
    approvedMasteringPlanFingerprint: input.approvedPlan.fingerprint,
    masteringRenderReceiptFingerprint: input.renderReceipt.fingerprint,
    masteredChapterChainFingerprint: input.chain.fingerprint,
    masteredArtifact: snapshot(mastered),
    postMasterEngineeringFingerprint:
      input.chain.postMasterEngineering.evidence.fingerprint,
    eligibleForHumanMasterReview: input.chain.eligibleForReview,
    findingCodes: Object.freeze([...input.chain.findingCodes]),
    masteredListeningApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(masteredReceiptBase(partial)),
  });
}

export function assertNarratorApprovedMasteredChapterReceipt(
  receipt: NarratorApprovedMasteredChapterReceipt,
): void {
  if (receipt.schemaVersion !== NARRATOR_APPROVED_MASTERED_CHAPTER_SCHEMA) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERED_CHAPTER_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(receipt.projectId, "NARRATOR_MASTERED_CHAPTER_PROJECT_INVALID");
  requireIdentifier(receipt.chapterId, "NARRATOR_MASTERED_CHAPTER_CHAPTER_INVALID");
  requireIdentifier(receipt.planId, "NARRATOR_MASTERED_CHAPTER_PLAN_ID_INVALID");
  for (const hash of [
    receipt.planFingerprint,
    receipt.authorizationFingerprint,
    receipt.chapterNarratorReviewFingerprint,
    receipt.objectiveMonitoringFingerprint,
    receipt.approvedMasteringPlanFingerprint,
    receipt.masteringRenderReceiptFingerprint,
    receipt.masteredChapterChainFingerprint,
    receipt.postMasterEngineeringFingerprint,
  ]) requireHash(hash, "NARRATOR_MASTERED_CHAPTER_HASH_INVALID");
  assertSnapshot(receipt.masteredArtifact, "NARRATOR_MASTERED_CHAPTER_ARTIFACT_INVALID");
  if (!Array.isArray(receipt.findingCodes) || receipt.findingCodes.some((code) =>
    typeof code !== "string" || code.length === 0 || code.length > 128 || CONTROL.test(code)
  )) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERED_CHAPTER_FINDINGS_INVALID");
  }
  if (
    receipt.masteredListeningApproval !== false
    || receipt.titleReleaseAuthority !== false
    || receipt.publicationAuthority !== false
  ) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERED_CHAPTER_AUTHORITY_INVALID");
  }
  const { fingerprint, ...partial } = receipt;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(masteredReceiptBase(partial))) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERED_CHAPTER_FINGERPRINT_INVALID");
  }
}

export async function ingestNarratorApprovedMasteredChapter(
  objectStore: FilePrivateObjectStore,
  registry: FileArtifactRegistry,
  input: Omit<IngestMasteredChapterInput, "plan" | "render"> & Readonly<{
    approvedPlan: NarratorApprovedMasteringPlan;
    render: MasteringRenderResult;
    renderReceipt: NarratorApprovedMasteringRenderReceipt;
  }>,
): Promise<Readonly<{
  chain: MasteredChapterArtifactChain;
  receipt: NarratorApprovedMasteredChapterReceipt;
}>> {
  const {
    approvedPlan,
    render,
    renderReceipt,
    ...masteredInput
  } = input;
  assertNarratorApprovedMasteringPlan(approvedPlan);
  assertNarratorApprovedMasteringRenderReceipt(renderReceipt, approvedPlan);
  if (
    render.evidence.fingerprint !== renderReceipt.renderEvidence.fingerprint
    || render.evidence.output.contentHash !== renderReceipt.outputContentHash
    || render.bytes.byteLength !== renderReceipt.outputByteCount
    || hashBytes(render.bytes) !== renderReceipt.outputContentHash
  ) {
    throw new NarratorMasteringChainError("NARRATOR_MASTERED_CHAPTER_RENDER_CHANGED");
  }
  const chain = await ingestMasteredChapter(objectStore, registry, {
    ...masteredInput,
    plan: approvedPlan.plan,
    render,
  });
  return Object.freeze({
    chain,
    receipt: createNarratorApprovedMasteredChapterReceipt({
      approvedPlan,
      renderReceipt,
      chain,
    }),
  });
}

export function narratorApprovedMasteredChapterPublicView(
  receipt: NarratorApprovedMasteredChapterReceipt,
): NarratorApprovedMasteredChapterPublicView {
  assertNarratorApprovedMasteredChapterReceipt(receipt);
  return Object.freeze({
    chapterId: receipt.chapterId,
    planId: receipt.planId,
    masteredArtifactId: receipt.masteredArtifact.id,
    masteredRevision: receipt.masteredArtifact.revision,
    narratorEvidenceBound: true,
    eligibleForHumanMasterReview: receipt.eligibleForHumanMasterReview,
    findingCodes: receipt.findingCodes,
    masteredListeningApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    fingerprint: receipt.fingerprint,
  });
}
