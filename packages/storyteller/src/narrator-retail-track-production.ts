import {
  assertArtifactRecord,
  type ArtifactRecord,
} from "./artifact-registry.js";
import type { FileArtifactRegistry } from "./artifact-store.js";
import {
  assertAudiobookRetailTrackEncodeChain,
  ingestAudiobookRetailTrackRender as ingestTechnicalAudiobookRetailTrackRender,
  type AudiobookRetailTrackEncodeChain,
} from "./audiobook-retail-track-encode.js";
import {
  assertAudiobookRetailTrackRenderEvidence,
  assertAudiobookRetailTrackRenderMatchesPlan,
  assertAudiobookRetailTrackRenderResult,
  renderAudiobookRetailTrackPlan as renderTechnicalAudiobookRetailTrackPlan,
  type AudiobookRetailReferenceMasterResolver,
  type AudiobookRetailTrackRenderEvidence,
  type AudiobookRetailTrackRenderResult,
  type AudiobookRetailTrackRenderRunner,
} from "./audiobook-retail-track-render.js";
import {
  approveAudiobookRetailTrackReview,
  assertAudiobookRetailTrackReviewMatchesChain,
  assertAudiobookRetailTrackReviewSession,
  createAudiobookRetailTrackReviewSession,
  recordAudiobookRetailTrackReview,
  type AudiobookRetailTrackReviewSession,
} from "./audiobook-retail-track-review.js";
import type { GenerationAudioEngineeringPolicy } from "./generation-audio-engineering.js";
import { stableHash } from "./index.js";
import {
  assertAdmittedNarratorRetailTrackPlan,
  type AdmittedNarratorRetailTrackPlan,
} from "./narrator-retail-track-admission.js";
import {
  assertExactNarratorVoicePin,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";
import type { FilePrivateObjectStore } from "./private-object-store.js";

export const ADMITTED_NARRATOR_RETAIL_TRACK_RENDER_SCHEMA =
  "storyteller-admitted-narrator-retail-track-render-v1" as const;
export const ADMITTED_NARRATOR_RETAIL_TRACK_ENCODE_SCHEMA =
  "storyteller-admitted-narrator-retail-track-encode-v1" as const;
export const ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_BINDING_SCHEMA =
  "storyteller-admitted-narrator-retail-track-review-binding-v1" as const;
export const ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_APPROVAL_SCHEMA =
  "storyteller-admitted-narrator-retail-track-review-approval-v1" as const;

export interface AdmittedNarratorRetailTrackRender {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAIL_TRACK_RENDER_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  admittedPlan: AdmittedNarratorRetailTrackPlan;
  renderEvidence: AudiobookRetailTrackRenderEvidence;
  trackCount: number;
  totalOutputBytes: number;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  completeBookListeningApproval: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailTrackRenderComplete: true;
  engineeringEvidenceComplete: false;
  humanTrackListeningApproval: false;
  retailSamplePlanningEligible: false;
  deliveryAuthority: false;
  releaseDecisionAuthority: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  renderedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailTrackRenderResult {
  admission: AdmittedNarratorRetailTrackRender;
  render: AudiobookRetailTrackRenderResult;
}

export interface AdmittedNarratorRetailTrackEncode {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAIL_TRACK_ENCODE_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  admittedPlan: AdmittedNarratorRetailTrackPlan;
  admittedRender: AdmittedNarratorRetailTrackRender;
  chain: AudiobookRetailTrackEncodeChain;
  engineeringProfileFingerprint: string;
  trackCount: number;
  totalOutputBytes: number;
  totalProductionJobCount: number;
  findingCodes: readonly string[];
  narratorAdmissionComplete: true;
  completeBookListeningApproval: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailTrackRenderComplete: true;
  engineeringEvidenceComplete: true;
  allTracksEngineeringEligible: boolean;
  humanTrackReviewEligible: boolean;
  humanTrackListeningApproval: false;
  retailSamplePlanningEligible: false;
  deliveryAuthority: false;
  releaseDecisionAuthority: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  encodedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailTrackReviewBinding {
  schemaVersion:
    typeof ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_BINDING_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  encode: AdmittedNarratorRetailTrackEncode;
  session: AudiobookRetailTrackReviewSession;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  completeBookListeningApproval: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  engineeringEvidenceComplete: true;
  humanTrackReviewEligible: true;
  humanTrackListeningApproval: false;
  retailSamplePlanningEligible: false;
  deliveryAuthority: false;
  releaseDecisionAuthority: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  revision: number;
  previousFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailTrackReviewApproval {
  schemaVersion:
    typeof ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_APPROVAL_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  binding: AdmittedNarratorRetailTrackReviewBinding;
  session: AudiobookRetailTrackReviewSession;
  approvedArtifacts: readonly ArtifactRecord[];
  approvedAt: string;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  completeBookListeningApproval: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  engineeringEvidenceComplete: true;
  humanTrackListeningApproval: true;
  retailSamplePlanningEligible: true;
  packageManifestEligible: false;
  deliveryAuthority: false;
  releaseDecisionAuthority: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface AdmittedNarratorRetailTrackRenderPublicView {
  bookId: string;
  distributor: "acx-audible";
  trackCount: number;
  totalOutputBytes: number;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  completeBookListeningApproval: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailTrackRenderComplete: true;
  engineeringEvidenceComplete: false;
  humanTrackListeningApproval: false;
  deliveryAuthority: false;
  releaseDecisionAuthority: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  renderedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailTrackEncodePublicView {
  bookId: string;
  distributor: "acx-audible";
  trackCount: number;
  totalOutputBytes: number;
  totalProductionJobCount: number;
  findingCodes: readonly string[];
  narratorAdmissionComplete: true;
  completeBookListeningApproval: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailTrackRenderComplete: true;
  engineeringEvidenceComplete: true;
  allTracksEngineeringEligible: boolean;
  humanTrackReviewEligible: boolean;
  humanTrackListeningApproval: false;
  deliveryAuthority: false;
  releaseDecisionAuthority: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  encodedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailTrackReviewPublicView {
  bookId: string;
  distributor: "acx-audible";
  trackCount: number;
  reviewCount: number;
  reviewerCount: number;
  totalOutputBytes: number;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  completeBookListeningApproval: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  engineeringEvidenceComplete: true;
  humanTrackListeningApproval: boolean;
  retailSamplePlanningEligible: boolean;
  packageManifestEligible: false;
  deliveryAuthority: false;
  releaseDecisionAuthority: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  approvedAt?: string;
  fingerprint: string;
}

export class AdmittedNarratorRetailTrackProductionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AdmittedNarratorRetailTrackProductionError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new AdmittedNarratorRetailTrackProductionError(code);
  }
  return value;
}

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new AdmittedNarratorRetailTrackProductionError(code);
  }
  return value;
}

function requirePositiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AdmittedNarratorRetailTrackProductionError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new AdmittedNarratorRetailTrackProductionError(code);
  }
  return value;
}

function renderBase(
  value: Omit<AdmittedNarratorRetailTrackRender, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function encodeBase(
  value: Omit<AdmittedNarratorRetailTrackEncode, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function reviewBindingBase(
  value: Omit<AdmittedNarratorRetailTrackReviewBinding, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function reviewApprovalBase(
  value: Omit<AdmittedNarratorRetailTrackReviewApproval, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function assertCommonLineage(
  input: Readonly<{
    projectId: string;
    bookId: string;
    profileAdmissionHash: string;
    admittedCastingFingerprint: string;
    castingFingerprint: string;
    voice: PinnedNarratorVoice;
    totalProductionJobCount: number;
  }>,
  plan: AdmittedNarratorRetailTrackPlan,
): void {
  assertAdmittedNarratorRetailTrackPlan(plan);
  assertExactNarratorVoicePin(plan.voice, input.voice);
  if (
    input.projectId !== plan.projectId
    || input.bookId !== plan.bookId
    || input.profileAdmissionHash !== plan.profileAdmissionHash
    || input.admittedCastingFingerprint !== plan.admittedCastingFingerprint
    || input.castingFingerprint !== plan.castingFingerprint
    || input.totalProductionJobCount !== plan.totalProductionJobCount
  ) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_PRODUCTION_LINEAGE_MISMATCH",
    );
  }
}

function assertRenderLineage(value: AdmittedNarratorRetailTrackRender): void {
  assertCommonLineage(value, value.admittedPlan);
  assertAudiobookRetailTrackRenderEvidence(value.renderEvidence);
  assertAudiobookRetailTrackRenderMatchesPlan(
    value.renderEvidence,
    value.admittedPlan.plan,
  );
  const evidence = value.renderEvidence;
  const totalOutputBytes = evidence.tracks.reduce(
    (total, track) => total + track.output.byteCount,
    0,
  );
  if (
    value.trackCount !== evidence.tracks.length
    || value.totalOutputBytes !== totalOutputBytes
    || value.renderedAt !== evidence.renderedAt
    || Date.parse(value.renderedAt) < Date.parse(value.admittedPlan.createdAt)
  ) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_RENDER_LINEAGE_MISMATCH",
    );
  }
  if (
    value.admittedPlan.retailEncodingEligible !== true
    || value.narratorAdmissionComplete !== true
    || value.completeBookListeningApproval !== true
    || value.syntheticNarrationDeclared !== true
    || value.platformAuthorisationBound !== true
    || value.retailTrackRenderComplete !== true
    || value.engineeringEvidenceComplete !== false
    || value.humanTrackListeningApproval !== false
    || value.retailSamplePlanningEligible !== false
    || value.deliveryAuthority !== false
    || value.releaseDecisionAuthority !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_RENDER_AUTHORITY_INVALID",
    );
  }
}

export function assertAdmittedNarratorRetailTrackRender(
  value: AdmittedNarratorRetailTrackRender,
): void {
  if (value.schemaVersion !== ADMITTED_NARRATOR_RETAIL_TRACK_RENDER_SCHEMA) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_RENDER_SCHEMA_UNSUPPORTED",
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
  ]) {
    requireHash(hash, "ADMITTED_NARRATOR_RETAIL_TRACK_HASH_INVALID");
  }
  requirePositiveInteger(
    value.trackCount,
    "ADMITTED_NARRATOR_RETAIL_TRACK_COUNT_INVALID",
  );
  requirePositiveInteger(
    value.totalOutputBytes,
    "ADMITTED_NARRATOR_RETAIL_TRACK_SIZE_INVALID",
  );
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_RETAIL_TRACK_JOB_COUNT_INVALID",
  );
  requireDate(value.renderedAt, "ADMITTED_NARRATOR_RETAIL_TRACK_DATE_INVALID");
  assertRenderLineage(value);
  const { fingerprint, ...partial } = value;
  if (
    !HASH.test(fingerprint)
    || fingerprint !== stableHash(renderBase(partial))
  ) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_RENDER_FINGERPRINT_INVALID",
    );
  }
}

export function assertAdmittedNarratorRetailTrackRenderResult(
  value: AdmittedNarratorRetailTrackRenderResult,
): void {
  assertAdmittedNarratorRetailTrackRender(value.admission);
  assertAudiobookRetailTrackRenderResult(value.render);
  assertAudiobookRetailTrackRenderMatchesPlan(
    value.render.evidence,
    value.admission.admittedPlan.plan,
  );
  if (
    value.render.evidence.fingerprint
      !== value.admission.renderEvidence.fingerprint
    || value.render.evidence.tracks.length !== value.admission.trackCount
    || value.render.tracks.length !== value.admission.trackCount
  ) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_RENDER_RESULT_MISMATCH",
    );
  }
}

export async function renderAdmittedNarratorRetailTrackPlan(
  input: Readonly<{
    admittedPlan: AdmittedNarratorRetailTrackPlan;
    referenceMaster: AudiobookRetailReferenceMasterResolver;
    runner?: AudiobookRetailTrackRenderRunner;
    ffmpegPath?: string;
    temporaryRoot?: string;
    timeoutMs?: number;
    maximumTrackOutputBytes?: number;
    maximumTotalOutputBytes?: number;
    renderedAt?: Date;
    signal?: AbortSignal;
  }>,
): Promise<AdmittedNarratorRetailTrackRenderResult> {
  assertAdmittedNarratorRetailTrackPlan(input.admittedPlan);
  if (!input.admittedPlan.retailEncodingEligible) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_PLAN_NOT_READY",
    );
  }
  const render = await renderTechnicalAudiobookRetailTrackPlan({
    plan: input.admittedPlan.plan,
    referenceMaster: input.referenceMaster,
    ...(input.runner ? { runner: input.runner } : {}),
    ...(input.ffmpegPath ? { ffmpegPath: input.ffmpegPath } : {}),
    ...(input.temporaryRoot ? { temporaryRoot: input.temporaryRoot } : {}),
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.maximumTrackOutputBytes !== undefined
      ? { maximumTrackOutputBytes: input.maximumTrackOutputBytes }
      : {}),
    ...(input.maximumTotalOutputBytes !== undefined
      ? { maximumTotalOutputBytes: input.maximumTotalOutputBytes }
      : {}),
    ...(input.renderedAt ? { renderedAt: input.renderedAt } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  const totalOutputBytes = render.evidence.tracks.reduce(
    (total, track) => total + track.output.byteCount,
    0,
  );
  const partial: Omit<AdmittedNarratorRetailTrackRender, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_TRACK_RENDER_SCHEMA,
    projectId: input.admittedPlan.projectId,
    bookId: input.admittedPlan.bookId,
    profileAdmissionHash: input.admittedPlan.profileAdmissionHash,
    admittedCastingFingerprint: input.admittedPlan.admittedCastingFingerprint,
    castingFingerprint: input.admittedPlan.castingFingerprint,
    voice: Object.freeze({ ...input.admittedPlan.voice }),
    admittedPlan: input.admittedPlan,
    renderEvidence: render.evidence,
    trackCount: render.evidence.tracks.length,
    totalOutputBytes,
    totalProductionJobCount: input.admittedPlan.totalProductionJobCount,
    narratorAdmissionComplete: true,
    completeBookListeningApproval: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailTrackRenderComplete: true,
    engineeringEvidenceComplete: false,
    humanTrackListeningApproval: false,
    retailSamplePlanningEligible: false,
    deliveryAuthority: false,
    releaseDecisionAuthority: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    renderedAt: render.evidence.renderedAt,
  };
  const admission = Object.freeze({
    ...partial,
    fingerprint: stableHash(renderBase(partial)),
  });
  const result = Object.freeze({ admission, render });
  assertAdmittedNarratorRetailTrackRenderResult(result);
  return result;
}

function assertEncodeLineage(value: AdmittedNarratorRetailTrackEncode): void {
  assertCommonLineage(value, value.admittedPlan);
  assertAdmittedNarratorRetailTrackRender(value.admittedRender);
  assertAudiobookRetailTrackEncodeChain(value.chain);
  assertExactNarratorVoicePin(value.admittedRender.voice, value.voice);
  const plan = value.admittedPlan.plan;
  const render = value.admittedRender.renderEvidence;
  const chain = value.chain;
  const reference = value.admittedPlan.wholeBookApproval.approvedArtifact;
  if (
    value.admittedRender.admittedPlan.fingerprint
      !== value.admittedPlan.fingerprint
    || chain.projectId !== value.projectId
    || chain.bookId !== value.bookId
    || chain.planId !== plan.id
    || chain.planFingerprint !== plan.fingerprint
    || chain.referenceMaster.id !== reference.id
    || chain.referenceMaster.revision !== reference.revision
    || chain.referenceMaster.fingerprint !== reference.fingerprint
    || chain.referenceMaster.contentHash !== reference.integrity.contentHash
    || chain.referenceMaster.byteCount !== reference.integrity.byteCount
    || chain.referenceMaster.rightsFingerprint
      !== reference.rights.rightsFingerprint
    || chain.renderEvidence.payload.provenance.generationRequestHash
      !== render.fingerprint
    || chain.renderEvidence.payload.provenance.sourceContentHash
      !== render.referenceMaster.contentHash
    || chain.engineeringProfile.fingerprint
      !== value.engineeringProfileFingerprint
    || value.trackCount !== chain.tracks.length
    || value.totalOutputBytes !== chain.totalOutputBytes
    || value.findingCodes.length !== chain.findingCodes.length
    || stableHash(value.findingCodes) !== stableHash(chain.findingCodes)
    || value.encodedAt !== chain.createdAt
    || Date.parse(value.encodedAt) < Date.parse(value.admittedRender.renderedAt)
  ) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_ENCODE_LINEAGE_MISMATCH",
    );
  }
  for (const [index, encoded] of chain.tracks.entries()) {
    const planned = plan.tracks[index];
    const rendered = render.tracks[index];
    if (
      !planned
      || !rendered
      || encoded.ordinal !== planned.ordinal
      || encoded.fileName !== planned.fileName
      || encoded.plannedTrackFingerprint !== planned.fingerprint
      || encoded.renderTrackFingerprint !== rendered.fingerprint
      || encoded.commandFingerprint !== rendered.commandFingerprint
      || encoded.artifact.payload.integrity.contentHash
        !== rendered.output.contentHash
      || encoded.artifact.payload.integrity.byteCount
        !== rendered.output.byteCount
    ) {
      throw new AdmittedNarratorRetailTrackProductionError(
        "ADMITTED_NARRATOR_RETAIL_TRACK_ENCODE_TRACK_MISMATCH",
      );
    }
  }
  const allTracksEngineeringEligible = chain.tracks.every(
    (track) => track.engineering.candidateEligible && track.eligibleForReview,
  );
  if (
    value.narratorAdmissionComplete !== true
    || value.completeBookListeningApproval !== true
    || value.syntheticNarrationDeclared !== true
    || value.platformAuthorisationBound !== true
    || value.retailTrackRenderComplete !== true
    || value.engineeringEvidenceComplete !== true
    || value.allTracksEngineeringEligible !== allTracksEngineeringEligible
    || value.humanTrackReviewEligible !== chain.eligibleForReview
    || value.humanTrackListeningApproval !== false
    || value.retailSamplePlanningEligible !== false
    || value.deliveryAuthority !== false
    || value.releaseDecisionAuthority !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_ENCODE_AUTHORITY_INVALID",
    );
  }
}

export function assertAdmittedNarratorRetailTrackEncode(
  value: AdmittedNarratorRetailTrackEncode,
): void {
  if (value.schemaVersion !== ADMITTED_NARRATOR_RETAIL_TRACK_ENCODE_SCHEMA) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_ENCODE_SCHEMA_UNSUPPORTED",
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
    value.engineeringProfileFingerprint,
  ]) {
    requireHash(hash, "ADMITTED_NARRATOR_RETAIL_TRACK_HASH_INVALID");
  }
  requirePositiveInteger(
    value.trackCount,
    "ADMITTED_NARRATOR_RETAIL_TRACK_COUNT_INVALID",
  );
  requirePositiveInteger(
    value.totalOutputBytes,
    "ADMITTED_NARRATOR_RETAIL_TRACK_SIZE_INVALID",
  );
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_RETAIL_TRACK_JOB_COUNT_INVALID",
  );
  requireDate(value.encodedAt, "ADMITTED_NARRATOR_RETAIL_TRACK_DATE_INVALID");
  assertEncodeLineage(value);
  const { fingerprint, ...partial } = value;
  if (
    !HASH.test(fingerprint)
    || fingerprint !== stableHash(encodeBase(partial))
  ) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_ENCODE_FINGERPRINT_INVALID",
    );
  }
}

export async function ingestAdmittedNarratorRetailTrackRender(
  objectStore: FilePrivateObjectStore,
  registry: FileArtifactRegistry,
  input: Readonly<{
    render: AdmittedNarratorRetailTrackRenderResult;
    actorId: string;
    verifierActorId?: string;
    engineering: GenerationAudioEngineeringPolicy;
    maximumDurationDriftMs?: number;
    now?: Date;
    signal?: AbortSignal;
  }>,
): Promise<AdmittedNarratorRetailTrackEncode> {
  assertAdmittedNarratorRetailTrackRenderResult(input.render);
  const admittedPlan = input.render.admission.admittedPlan;
  const chain = await ingestTechnicalAudiobookRetailTrackRender(
    objectStore,
    registry,
    {
      plan: admittedPlan.plan,
      render: input.render.render,
      approvedReferenceArtifact:
        admittedPlan.wholeBookApproval.approvedArtifact,
      actorId: input.actorId,
      ...(input.verifierActorId
        ? { verifierActorId: input.verifierActorId }
        : {}),
      engineering: input.engineering,
      ...(input.maximumDurationDriftMs !== undefined
        ? { maximumDurationDriftMs: input.maximumDurationDriftMs }
        : {}),
      ...(input.now ? { now: input.now } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    },
  );
  const partial: Omit<AdmittedNarratorRetailTrackEncode, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_TRACK_ENCODE_SCHEMA,
    projectId: admittedPlan.projectId,
    bookId: admittedPlan.bookId,
    profileAdmissionHash: admittedPlan.profileAdmissionHash,
    admittedCastingFingerprint: admittedPlan.admittedCastingFingerprint,
    castingFingerprint: admittedPlan.castingFingerprint,
    voice: Object.freeze({ ...admittedPlan.voice }),
    admittedPlan,
    admittedRender: input.render.admission,
    chain,
    engineeringProfileFingerprint: chain.engineeringProfile.fingerprint,
    trackCount: chain.tracks.length,
    totalOutputBytes: chain.totalOutputBytes,
    totalProductionJobCount: admittedPlan.totalProductionJobCount,
    findingCodes: Object.freeze([...chain.findingCodes]),
    narratorAdmissionComplete: true,
    completeBookListeningApproval: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailTrackRenderComplete: true,
    engineeringEvidenceComplete: true,
    allTracksEngineeringEligible: chain.tracks.every(
      (track) => track.engineering.candidateEligible && track.eligibleForReview,
    ),
    humanTrackReviewEligible: chain.eligibleForReview,
    humanTrackListeningApproval: false,
    retailSamplePlanningEligible: false,
    deliveryAuthority: false,
    releaseDecisionAuthority: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    encodedAt: chain.createdAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(encodeBase(partial)),
  });
  assertAdmittedNarratorRetailTrackEncode(value);
  return value;
}

function assertReviewBindingLineage(
  value: AdmittedNarratorRetailTrackReviewBinding,
): void {
  assertAdmittedNarratorRetailTrackEncode(value.encode);
  assertCommonLineage(value, value.encode.admittedPlan);
  assertAudiobookRetailTrackReviewSession(value.session);
  assertAudiobookRetailTrackReviewMatchesChain(
    value.session,
    value.encode.chain,
    new Date(value.session.updatedAt),
  );
  assertExactNarratorVoicePin(value.encode.voice, value.voice);
  if (
    value.projectId !== value.encode.projectId
    || value.bookId !== value.encode.bookId
    || value.profileAdmissionHash !== value.encode.profileAdmissionHash
    || value.admittedCastingFingerprint
      !== value.encode.admittedCastingFingerprint
    || value.castingFingerprint !== value.encode.castingFingerprint
    || value.totalProductionJobCount
      !== value.encode.totalProductionJobCount
    || value.session.projectId !== value.projectId
    || value.session.bookId !== value.bookId
    || value.session.encodeChainFingerprint !== value.encode.chain.fingerprint
    || value.revision !== value.session.revision
    || value.createdAt !== value.session.createdAt
    || value.updatedAt !== value.session.updatedAt
    || value.session.status === "approved"
    || value.session.approval !== undefined
  ) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_LINEAGE_MISMATCH",
    );
  }
  if (
    value.encode.humanTrackReviewEligible !== true
    || value.narratorAdmissionComplete !== true
    || value.completeBookListeningApproval !== true
    || value.syntheticNarrationDeclared !== true
    || value.platformAuthorisationBound !== true
    || value.engineeringEvidenceComplete !== true
    || value.humanTrackReviewEligible !== true
    || value.humanTrackListeningApproval !== false
    || value.retailSamplePlanningEligible !== false
    || value.deliveryAuthority !== false
    || value.releaseDecisionAuthority !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_AUTHORITY_INVALID",
    );
  }
}

export function assertAdmittedNarratorRetailTrackReviewBinding(
  value: AdmittedNarratorRetailTrackReviewBinding,
): void {
  if (
    value.schemaVersion
      !== ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_BINDING_SCHEMA
  ) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_SCHEMA_UNSUPPORTED",
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
  ]) {
    requireHash(hash, "ADMITTED_NARRATOR_RETAIL_TRACK_HASH_INVALID");
  }
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_RETAIL_TRACK_JOB_COUNT_INVALID",
  );
  requirePositiveInteger(
    value.revision,
    "ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_REVISION_INVALID",
  );
  requireDate(
    value.createdAt,
    "ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_DATE_INVALID",
  );
  requireDate(
    value.updatedAt,
    "ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_DATE_INVALID",
  );
  if (value.revision === 1 && value.previousFingerprint !== undefined) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_REVISION_CHAIN_INVALID",
    );
  }
  if (value.revision > 1) {
    requireHash(
      value.previousFingerprint ?? "",
      "ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_REVISION_CHAIN_INVALID",
    );
  }
  assertReviewBindingLineage(value);
  const { fingerprint, ...partial } = value;
  if (
    !HASH.test(fingerprint)
    || fingerprint !== stableHash(reviewBindingBase(partial))
  ) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_FINGERPRINT_INVALID",
    );
  }
}

export function createAdmittedNarratorRetailTrackReviewBinding(
  input: Readonly<{
    id: string;
    encode: AdmittedNarratorRetailTrackEncode;
    createdAt?: Date;
  }>,
): AdmittedNarratorRetailTrackReviewBinding {
  assertAdmittedNarratorRetailTrackEncode(input.encode);
  if (!input.encode.humanTrackReviewEligible) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_ENGINEERING_INELIGIBLE",
    );
  }
  const session = createAudiobookRetailTrackReviewSession({
    id: input.id,
    chain: input.encode.chain,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  });
  const partial: Omit<
    AdmittedNarratorRetailTrackReviewBinding,
    "fingerprint"
  > = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_BINDING_SCHEMA,
    projectId: input.encode.projectId,
    bookId: input.encode.bookId,
    profileAdmissionHash: input.encode.profileAdmissionHash,
    admittedCastingFingerprint: input.encode.admittedCastingFingerprint,
    castingFingerprint: input.encode.castingFingerprint,
    voice: Object.freeze({ ...input.encode.voice }),
    encode: input.encode,
    session,
    totalProductionJobCount: input.encode.totalProductionJobCount,
    narratorAdmissionComplete: true,
    completeBookListeningApproval: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    engineeringEvidenceComplete: true,
    humanTrackReviewEligible: true,
    humanTrackListeningApproval: false,
    retailSamplePlanningEligible: false,
    deliveryAuthority: false,
    releaseDecisionAuthority: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    revision: session.revision,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(reviewBindingBase(partial)),
  });
  assertAdmittedNarratorRetailTrackReviewBinding(value);
  return value;
}

export function recordAdmittedNarratorRetailTrackReview(
  binding: AdmittedNarratorRetailTrackReviewBinding,
  input: Parameters<typeof recordAudiobookRetailTrackReview>[1],
): AdmittedNarratorRetailTrackReviewBinding {
  assertAdmittedNarratorRetailTrackReviewBinding(binding);
  const session = recordAudiobookRetailTrackReview(binding.session, input);
  const {
    fingerprint: _fingerprint,
    previousFingerprint: _previousFingerprint,
    session: _session,
    revision: _revision,
    updatedAt: _updatedAt,
    ...base
  } = binding;
  const partial: Omit<
    AdmittedNarratorRetailTrackReviewBinding,
    "fingerprint"
  > = {
    ...base,
    session,
    revision: session.revision,
    previousFingerprint: binding.fingerprint,
    createdAt: binding.createdAt,
    updatedAt: session.updatedAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(reviewBindingBase(partial)),
  });
  assertAdmittedNarratorRetailTrackReviewBinding(value);
  return value;
}

function assertApprovedArtifacts(
  value: AdmittedNarratorRetailTrackReviewApproval,
): void {
  const chain = value.binding.encode.chain;
  const approval = value.session.approval;
  if (
    !approval
    || value.approvedArtifacts.length !== chain.tracks.length
    || approval.approvedArtifacts.length !== chain.tracks.length
  ) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_APPROVED_ARTIFACTS_INVALID",
    );
  }
  for (const [index, artifact] of value.approvedArtifacts.entries()) {
    assertArtifactRecord(artifact);
    const original = chain.tracks[index]?.artifact.payload;
    const snapshot = value.session.tracks[index]?.artifact;
    const approved = approval.approvedArtifacts[index];
    if (
      !original
      || !snapshot
      || !approved
      || approved.ordinal !== index + 1
      || artifact.id !== original.id
      || artifact.id !== snapshot.id
      || artifact.id !== approved.id
      || artifact.revision !== original.revision + 1
      || artifact.revision !== snapshot.revision + 1
      || artifact.revision !== approved.revision
      || artifact.previousFingerprint !== original.fingerprint
      || artifact.fingerprint !== approved.fingerprint
      || artifact.integrity.contentHash !== original.integrity.contentHash
      || artifact.integrity.contentHash !== snapshot.contentHash
      || artifact.integrity.byteCount !== original.integrity.byteCount
      || artifact.integrity.byteCount !== snapshot.byteCount
      || stableHash(artifact.review) !== approved.reviewFingerprint
      || artifact.rights.rightsFingerprint
        !== chain.referenceMaster.rightsFingerprint
      || artifact.verification.status !== "verified"
      || artifact.review.status !== "approved"
      || artifact.quarantine !== undefined
      || artifact.release.status !== "unavailable"
    ) {
      throw new AdmittedNarratorRetailTrackProductionError(
        "ADMITTED_NARRATOR_RETAIL_TRACK_APPROVED_ARTIFACT_MISMATCH",
      );
    }
  }
}

function assertReviewApprovalLineage(
  value: AdmittedNarratorRetailTrackReviewApproval,
): void {
  assertAdmittedNarratorRetailTrackReviewBinding(value.binding);
  assertAudiobookRetailTrackReviewSession(value.session);
  assertAudiobookRetailTrackReviewMatchesChain(
    value.session,
    value.binding.encode.chain,
    new Date(value.approvedAt),
  );
  assertCommonLineage(value, value.binding.encode.admittedPlan);
  assertExactNarratorVoicePin(value.binding.voice, value.voice);
  const approval = value.session.approval;
  if (
    value.projectId !== value.binding.projectId
    || value.bookId !== value.binding.bookId
    || value.profileAdmissionHash !== value.binding.profileAdmissionHash
    || value.admittedCastingFingerprint
      !== value.binding.admittedCastingFingerprint
    || value.castingFingerprint !== value.binding.castingFingerprint
    || value.session.status !== "approved"
    || !approval
    || value.session.revision !== value.binding.session.revision + 1
    || value.session.previousFingerprint !== value.binding.session.fingerprint
    || value.approvedAt !== approval.approvedAt
    || value.totalProductionJobCount
      !== value.binding.totalProductionJobCount
    || Date.parse(value.approvedAt) < Date.parse(value.binding.updatedAt)
  ) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_APPROVAL_LINEAGE_MISMATCH",
    );
  }
  assertApprovedArtifacts(value);
  if (
    value.narratorAdmissionComplete !== true
    || value.completeBookListeningApproval !== true
    || value.syntheticNarrationDeclared !== true
    || value.platformAuthorisationBound !== true
    || value.engineeringEvidenceComplete !== true
    || value.humanTrackListeningApproval !== true
    || value.retailSamplePlanningEligible !== true
    || value.packageManifestEligible !== false
    || value.deliveryAuthority !== false
    || value.releaseDecisionAuthority !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_APPROVAL_AUTHORITY_INVALID",
    );
  }
}

export function assertAdmittedNarratorRetailTrackReviewApproval(
  value: AdmittedNarratorRetailTrackReviewApproval,
): void {
  if (
    value.schemaVersion
      !== ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_APPROVAL_SCHEMA
  ) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_APPROVAL_SCHEMA_UNSUPPORTED",
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
  ]) {
    requireHash(hash, "ADMITTED_NARRATOR_RETAIL_TRACK_HASH_INVALID");
  }
  requireDate(
    value.approvedAt,
    "ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_DATE_INVALID",
  );
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_RETAIL_TRACK_JOB_COUNT_INVALID",
  );
  assertReviewApprovalLineage(value);
  const { fingerprint, ...partial } = value;
  if (
    !HASH.test(fingerprint)
    || fingerprint !== stableHash(reviewApprovalBase(partial))
  ) {
    throw new AdmittedNarratorRetailTrackProductionError(
      "ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_APPROVAL_FINGERPRINT_INVALID",
    );
  }
}

export function createAdmittedNarratorRetailTrackReviewApproval(
  binding: AdmittedNarratorRetailTrackReviewBinding,
  input: Parameters<typeof approveAudiobookRetailTrackReview>[2],
): AdmittedNarratorRetailTrackReviewApproval {
  assertAdmittedNarratorRetailTrackReviewBinding(binding);
  const approved = approveAudiobookRetailTrackReview(
    binding.session,
    binding.encode.chain,
    input,
  );
  const partial: Omit<
    AdmittedNarratorRetailTrackReviewApproval,
    "fingerprint"
  > = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_APPROVAL_SCHEMA,
    projectId: binding.projectId,
    bookId: binding.bookId,
    profileAdmissionHash: binding.profileAdmissionHash,
    admittedCastingFingerprint: binding.admittedCastingFingerprint,
    castingFingerprint: binding.castingFingerprint,
    voice: Object.freeze({ ...binding.voice }),
    binding,
    session: approved.session,
    approvedArtifacts: Object.freeze([...approved.artifacts]),
    approvedAt: approved.session.approval!.approvedAt,
    totalProductionJobCount: binding.totalProductionJobCount,
    narratorAdmissionComplete: true,
    completeBookListeningApproval: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    engineeringEvidenceComplete: true,
    humanTrackListeningApproval: true,
    retailSamplePlanningEligible: true,
    packageManifestEligible: false,
    deliveryAuthority: false,
    releaseDecisionAuthority: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(reviewApprovalBase(partial)),
  });
  assertAdmittedNarratorRetailTrackReviewApproval(value);
  return value;
}

export function admittedNarratorRetailTrackRenderPublicView(
  value: AdmittedNarratorRetailTrackRender,
): AdmittedNarratorRetailTrackRenderPublicView {
  assertAdmittedNarratorRetailTrackRender(value);
  return Object.freeze({
    bookId: value.bookId,
    distributor: value.admittedPlan.plan.distributor,
    trackCount: value.trackCount,
    totalOutputBytes: value.totalOutputBytes,
    totalProductionJobCount: value.totalProductionJobCount,
    narratorAdmissionComplete: true,
    completeBookListeningApproval: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailTrackRenderComplete: true,
    engineeringEvidenceComplete: false,
    humanTrackListeningApproval: false,
    deliveryAuthority: false,
    releaseDecisionAuthority: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    renderedAt: value.renderedAt,
    fingerprint: value.fingerprint,
  });
}

export function admittedNarratorRetailTrackEncodePublicView(
  value: AdmittedNarratorRetailTrackEncode,
): AdmittedNarratorRetailTrackEncodePublicView {
  assertAdmittedNarratorRetailTrackEncode(value);
  return Object.freeze({
    bookId: value.bookId,
    distributor: value.admittedPlan.plan.distributor,
    trackCount: value.trackCount,
    totalOutputBytes: value.totalOutputBytes,
    totalProductionJobCount: value.totalProductionJobCount,
    findingCodes: value.findingCodes,
    narratorAdmissionComplete: true,
    completeBookListeningApproval: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailTrackRenderComplete: true,
    engineeringEvidenceComplete: true,
    allTracksEngineeringEligible: value.allTracksEngineeringEligible,
    humanTrackReviewEligible: value.humanTrackReviewEligible,
    humanTrackListeningApproval: false,
    deliveryAuthority: false,
    releaseDecisionAuthority: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    encodedAt: value.encodedAt,
    fingerprint: value.fingerprint,
  });
}

export function admittedNarratorRetailTrackReviewPublicView(
  value:
    | AdmittedNarratorRetailTrackReviewBinding
    | AdmittedNarratorRetailTrackReviewApproval,
): AdmittedNarratorRetailTrackReviewPublicView {
  if (
    value.schemaVersion
      === ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_BINDING_SCHEMA
  ) {
    assertAdmittedNarratorRetailTrackReviewBinding(value);
    const reviewers = new Set(
      value.session.reviews.map((review) => review.reviewerId),
    );
    return Object.freeze({
      bookId: value.bookId,
      distributor: value.encode.admittedPlan.plan.distributor,
      trackCount: value.session.tracks.length,
      reviewCount: value.session.reviews.length,
      reviewerCount: reviewers.size,
      totalOutputBytes: value.encode.totalOutputBytes,
      totalProductionJobCount: value.totalProductionJobCount,
      narratorAdmissionComplete: true,
      completeBookListeningApproval: true,
      syntheticNarrationDeclared: true,
      platformAuthorisationBound: true,
      engineeringEvidenceComplete: true,
      humanTrackListeningApproval: false,
      retailSamplePlanningEligible: false,
      packageManifestEligible: false,
      deliveryAuthority: false,
      releaseDecisionAuthority: false,
      titleReleaseAuthority: false,
      publicationAuthority: false,
      fingerprint: value.fingerprint,
    });
  }
  assertAdmittedNarratorRetailTrackReviewApproval(value);
  const reviewers = new Set(
    value.session.reviews.map((review) => review.reviewerId),
  );
  return Object.freeze({
    bookId: value.bookId,
    distributor: value.binding.encode.admittedPlan.plan.distributor,
    trackCount: value.session.tracks.length,
    reviewCount: value.session.reviews.length,
    reviewerCount: reviewers.size,
    totalOutputBytes: value.binding.encode.totalOutputBytes,
    totalProductionJobCount: value.totalProductionJobCount,
    narratorAdmissionComplete: true,
    completeBookListeningApproval: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    engineeringEvidenceComplete: true,
    humanTrackListeningApproval: true,
    retailSamplePlanningEligible: true,
    packageManifestEligible: false,
    deliveryAuthority: false,
    releaseDecisionAuthority: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    approvedAt: value.approvedAt,
    fingerprint: value.fingerprint,
  });
}
