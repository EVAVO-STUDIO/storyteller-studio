import { assertArtifactRecord, type ArtifactRecord } from "./artifact-registry.js";
import type { FileArtifactRegistry } from "./artifact-store.js";
import {
  assertAudiobookRetailTrackEncodeChain,
  assertAudiobookRetailTrackEncodeMatchesSources,
  ingestAudiobookRetailTrackRender,
  type AudiobookRetailTrackEncodeChain,
} from "./audiobook-retail-track-encode.js";
import {
  approveAudiobookRetailTrackReview,
  assertAudiobookRetailTrackReviewMatchesChain,
  assertAudiobookRetailTrackReviewSession,
  createAudiobookRetailTrackReviewSession,
  recordAudiobookRetailTrackReview,
  type AudiobookRetailTrackReviewSession,
} from "./audiobook-retail-track-review.js";
import {
  assertAudiobookRetailTrackRenderMatchesPlan,
  assertAudiobookRetailTrackRenderResult,
  renderAudiobookRetailTrackPlan,
  type AudiobookRetailReferenceMasterResolver,
  type AudiobookRetailTrackRenderEvidence,
  type AudiobookRetailTrackRenderResult,
  type AudiobookRetailTrackRenderRunner,
} from "./audiobook-retail-track-render.js";
import type { GenerationAudioEngineeringPolicy } from "./generation-audio-engineering.js";
import { stableHash } from "./index.js";
import {
  assertAdmittedNarratorRetailTrackPlan,
  type AdmittedNarratorRetailTrackPlan,
} from "./narrator-retail-track-admission.js";
import { assertExactNarratorVoicePin, type PinnedNarratorVoice } from "./narrator-voice-profile.js";
import type { FilePrivateObjectStore } from "./private-object-store.js";

export const ADMITTED_NARRATOR_RETAIL_TRACK_RENDER_SCHEMA =
  "storyteller-admitted-narrator-retail-track-render-v1" as const;
export const ADMITTED_NARRATOR_RETAIL_TRACK_ENCODE_SCHEMA =
  "storyteller-admitted-narrator-retail-track-encode-v1" as const;
export const ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_BINDING_SCHEMA =
  "storyteller-admitted-narrator-retail-track-review-binding-v1" as const;
export const ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_APPROVAL_SCHEMA =
  "storyteller-admitted-narrator-retail-track-review-approval-v1" as const;

interface RetailNarratorLineage {
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  totalProductionJobCount: number;
}

interface RetailAuthorityBoundary {
  narratorAdmissionComplete: true;
  completeBookListeningApproval: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailTracksRendered: true;
  packageAuthority: false;
  deliveryAuthority: false;
  releaseDecisionAuthority: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
}

export interface AdmittedNarratorRetailTrackRender
extends RetailNarratorLineage, RetailAuthorityBoundary {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAIL_TRACK_RENDER_SCHEMA;
  admittedPlan: AdmittedNarratorRetailTrackPlan;
  renderEvidence: AudiobookRetailTrackRenderEvidence;
  trackCount: number;
  totalOutputBytes: number;
  independentEngineeringComplete: false;
  humanTrackReviewComplete: false;
  retailSampleEligible: false;
  renderedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailTrackRenderResult {
  admission: AdmittedNarratorRetailTrackRender;
  render: AudiobookRetailTrackRenderResult;
}

export interface AdmittedNarratorRetailTrackEncode
extends RetailNarratorLineage, RetailAuthorityBoundary {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAIL_TRACK_ENCODE_SCHEMA;
  render: AdmittedNarratorRetailTrackRender;
  chain: AudiobookRetailTrackEncodeChain;
  renderEvidenceFingerprint: string;
  engineeringProfileFingerprint: string;
  trackCount: number;
  totalOutputBytes: number;
  findingCodes: readonly string[];
  independentEngineeringComplete: true;
  retailTrackReviewEligible: boolean;
  humanTrackReviewComplete: false;
  retailSampleEligible: false;
  createdAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailTrackReviewBinding
extends RetailNarratorLineage, RetailAuthorityBoundary {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_BINDING_SCHEMA;
  encode: AdmittedNarratorRetailTrackEncode;
  session: AudiobookRetailTrackReviewSession;
  sessionFingerprint: string;
  trackCount: number;
  revision: number;
  previousFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  independentEngineeringComplete: true;
  retailTrackReviewEligible: true;
  humanTrackReviewComplete: false;
  retailSampleEligible: false;
  fingerprint: string;
}

export interface AdmittedNarratorRetailTrackReviewApproval
extends RetailNarratorLineage, RetailAuthorityBoundary {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_APPROVAL_SCHEMA;
  binding: AdmittedNarratorRetailTrackReviewBinding;
  session: AudiobookRetailTrackReviewSession;
  approvedArtifacts: readonly ArtifactRecord[];
  reviewApprovalFingerprint: string;
  trackCount: number;
  totalOutputBytes: number;
  approvedAt: string;
  independentEngineeringComplete: true;
  retailTrackReviewEligible: true;
  humanTrackReviewComplete: true;
  retailSampleEligible: true;
  fingerprint: string;
}

export interface AdmittedNarratorRetailTrackProductionPublicView {
  bookId: string;
  distributor: "acx-audible";
  policyVersion: string;
  trackCount: number;
  totalOutputBytes: number;
  findingCodeCount: number;
  totalProductionJobCount: number;
  reviewStatus: AudiobookRetailTrackReviewSession["status"] | "not-started";
  narratorAdmissionComplete: true;
  completeBookListeningApproval: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailTracksRendered: true;
  independentEngineeringComplete: boolean;
  humanTrackReviewComplete: boolean;
  retailSampleEligible: boolean;
  packageAuthority: false;
  deliveryAuthority: false;
  releaseDecisionAuthority: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface RenderAdmittedNarratorRetailTrackPlanInput {
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
}

export interface IngestAdmittedNarratorRetailTrackRenderInput {
  admittedRender: AdmittedNarratorRetailTrackRender;
  render: AudiobookRetailTrackRenderResult;
  actorId: string;
  verifierActorId?: string;
  engineering: GenerationAudioEngineeringPolicy;
  maximumDurationDriftMs?: number;
  now?: Date;
  signal?: AbortSignal;
}

export class NarratorRetailTrackProductionAdmissionError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "NarratorRetailTrackProductionAdmissionError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const AUTHORITY = Object.freeze({
  narratorAdmissionComplete: true as const,
  completeBookListeningApproval: true as const,
  syntheticNarrationDeclared: true as const,
  platformAuthorisationBound: true as const,
  retailTracksRendered: true as const,
  packageAuthority: false as const,
  deliveryAuthority: false as const,
  releaseDecisionAuthority: false as const,
  titleReleaseAuthority: false as const,
  publicationAuthority: false as const,
});

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) throw new NarratorRetailTrackProductionAdmissionError(code);
  return value;
}
function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) throw new NarratorRetailTrackProductionAdmissionError(code);
  return value;
}
function requirePositiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new NarratorRetailTrackProductionAdmissionError(code);
  return value;
}
function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new NarratorRetailTrackProductionAdmissionError(code);
  return value;
}
function base<T extends { fingerprint: string }>(value: Omit<T, "fingerprint">): Readonly<Record<string, unknown>> {
  return value;
}
function lineage(plan: AdmittedNarratorRetailTrackPlan): RetailNarratorLineage {
  assertAdmittedNarratorRetailTrackPlan(plan);
  return Object.freeze({
    projectId: plan.projectId,
    bookId: plan.bookId,
    profileAdmissionHash: plan.profileAdmissionHash,
    admittedCastingFingerprint: plan.admittedCastingFingerprint,
    castingFingerprint: plan.castingFingerprint,
    voice: Object.freeze({ ...plan.voice }),
    totalProductionJobCount: plan.totalProductionJobCount,
  });
}
function assertLineage(expected: RetailNarratorLineage, actual: RetailNarratorLineage, code: string): void {
  if (
    actual.projectId !== expected.projectId
    || actual.bookId !== expected.bookId
    || actual.profileAdmissionHash !== expected.profileAdmissionHash
    || actual.admittedCastingFingerprint !== expected.admittedCastingFingerprint
    || actual.castingFingerprint !== expected.castingFingerprint
    || actual.totalProductionJobCount !== expected.totalProductionJobCount
  ) throw new NarratorRetailTrackProductionAdmissionError(code);
  assertExactNarratorVoicePin(expected.voice, actual.voice);
}
function assertAuthority(value: RetailAuthorityBoundary, code: string): void {
  for (const [key, expected] of Object.entries(AUTHORITY)) {
    if ((value as unknown as Record<string, unknown>)[key] !== expected) {
      throw new NarratorRetailTrackProductionAdmissionError(code);
    }
  }
}
function totalRenderedBytes(evidence: AudiobookRetailTrackRenderEvidence): number {
  return evidence.tracks.reduce((total, track) => total + track.output.byteCount, 0);
}
function assertRenderResult(admission: AdmittedNarratorRetailTrackRender, render: AudiobookRetailTrackRenderResult): void {
  assertAdmittedNarratorRetailTrackRender(admission);
  assertAudiobookRetailTrackRenderResult(render);
  assertAudiobookRetailTrackRenderMatchesPlan(render.evidence, admission.admittedPlan.plan);
  if (render.evidence.fingerprint !== admission.renderEvidence.fingerprint) {
    throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_RENDER_RESULT_MISMATCH");
  }
}

export function bindAdmittedNarratorRetailTrackRender(input: Readonly<{
  admittedPlan: AdmittedNarratorRetailTrackPlan;
  render: AudiobookRetailTrackRenderResult;
}>): AdmittedNarratorRetailTrackRender {
  assertAdmittedNarratorRetailTrackPlan(input.admittedPlan);
  assertAudiobookRetailTrackRenderResult(input.render);
  assertAudiobookRetailTrackRenderMatchesPlan(input.render.evidence, input.admittedPlan.plan);
  const partial: Omit<AdmittedNarratorRetailTrackRender, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_TRACK_RENDER_SCHEMA,
    ...lineage(input.admittedPlan),
    admittedPlan: input.admittedPlan,
    renderEvidence: input.render.evidence,
    trackCount: input.render.evidence.tracks.length,
    totalOutputBytes: totalRenderedBytes(input.render.evidence),
    ...AUTHORITY,
    independentEngineeringComplete: false,
    humanTrackReviewComplete: false,
    retailSampleEligible: false,
    renderedAt: input.render.evidence.renderedAt,
  };
  const value = Object.freeze({ ...partial, fingerprint: stableHash(base<AdmittedNarratorRetailTrackRender>(partial)) });
  assertAdmittedNarratorRetailTrackRender(value);
  return value;
}

export async function renderAdmittedNarratorRetailTrackPlan(
  input: RenderAdmittedNarratorRetailTrackPlanInput,
): Promise<AdmittedNarratorRetailTrackRenderResult> {
  assertAdmittedNarratorRetailTrackPlan(input.admittedPlan);
  const render = await renderAudiobookRetailTrackPlan({
    plan: input.admittedPlan.plan,
    referenceMaster: input.referenceMaster,
    ...(input.runner ? { runner: input.runner } : {}),
    ...(input.ffmpegPath ? { ffmpegPath: input.ffmpegPath } : {}),
    ...(input.temporaryRoot ? { temporaryRoot: input.temporaryRoot } : {}),
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.maximumTrackOutputBytes !== undefined ? { maximumTrackOutputBytes: input.maximumTrackOutputBytes } : {}),
    ...(input.maximumTotalOutputBytes !== undefined ? { maximumTotalOutputBytes: input.maximumTotalOutputBytes } : {}),
    ...(input.renderedAt ? { renderedAt: input.renderedAt } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  return Object.freeze({ admission: bindAdmittedNarratorRetailTrackRender({ admittedPlan: input.admittedPlan, render }), render });
}

export function assertAdmittedNarratorRetailTrackRender(value: AdmittedNarratorRetailTrackRender): void {
  if (value.schemaVersion !== ADMITTED_NARRATOR_RETAIL_TRACK_RENDER_SCHEMA) {
    throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_RENDER_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(value.projectId, "ADMITTED_NARRATOR_RETAIL_RENDER_PROJECT_INVALID");
  requireIdentifier(value.bookId, "ADMITTED_NARRATOR_RETAIL_RENDER_BOOK_INVALID");
  for (const hash of [value.profileAdmissionHash, value.admittedCastingFingerprint, value.castingFingerprint]) {
    requireHash(hash, "ADMITTED_NARRATOR_RETAIL_RENDER_HASH_INVALID");
  }
  requirePositiveInteger(value.totalProductionJobCount, "ADMITTED_NARRATOR_RETAIL_RENDER_JOB_COUNT_INVALID");
  assertAdmittedNarratorRetailTrackPlan(value.admittedPlan);
  assertAudiobookRetailTrackRenderMatchesPlan(value.renderEvidence, value.admittedPlan.plan);
  assertLineage(lineage(value.admittedPlan), value, "ADMITTED_NARRATOR_RETAIL_RENDER_LINEAGE_MISMATCH");
  requirePositiveInteger(value.trackCount, "ADMITTED_NARRATOR_RETAIL_RENDER_TRACK_COUNT_INVALID");
  requirePositiveInteger(value.totalOutputBytes, "ADMITTED_NARRATOR_RETAIL_RENDER_SIZE_INVALID");
  requireDate(value.renderedAt, "ADMITTED_NARRATOR_RETAIL_RENDER_DATE_INVALID");
  if (
    value.trackCount !== value.renderEvidence.tracks.length
    || value.trackCount !== value.admittedPlan.plan.tracks.length
    || value.totalOutputBytes !== totalRenderedBytes(value.renderEvidence)
    || value.renderedAt !== value.renderEvidence.renderedAt
    || Date.parse(value.renderedAt) < Date.parse(value.admittedPlan.createdAt)
  ) throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_RENDER_LINEAGE_MISMATCH");
  assertAuthority(value, "ADMITTED_NARRATOR_RETAIL_RENDER_AUTHORITY_INVALID");
  if (
    value.independentEngineeringComplete !== false
    || value.humanTrackReviewComplete !== false
    || value.retailSampleEligible !== false
  ) throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_RENDER_AUTHORITY_INVALID");
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(base<AdmittedNarratorRetailTrackRender>(partial))) {
    throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_RENDER_FINGERPRINT_INVALID");
  }
}

function bindEncode(input: Readonly<{
  admittedRender: AdmittedNarratorRetailTrackRender;
  render: AudiobookRetailTrackRenderResult;
  chain: AudiobookRetailTrackEncodeChain;
}>): AdmittedNarratorRetailTrackEncode {
  assertRenderResult(input.admittedRender, input.render);
  assertAudiobookRetailTrackEncodeChain(input.chain);
  assertAudiobookRetailTrackEncodeMatchesSources(input.chain, {
    plan: input.admittedRender.admittedPlan.plan,
    render: input.render,
    approvedReferenceArtifact: input.admittedRender.admittedPlan.wholeBookApproval.approvedArtifact,
  });
  const partial: Omit<AdmittedNarratorRetailTrackEncode, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_TRACK_ENCODE_SCHEMA,
    ...lineage(input.admittedRender.admittedPlan),
    render: input.admittedRender,
    chain: input.chain,
    renderEvidenceFingerprint: input.render.evidence.fingerprint,
    engineeringProfileFingerprint: input.chain.engineeringProfile.fingerprint,
    trackCount: input.chain.tracks.length,
    totalOutputBytes: input.chain.totalOutputBytes,
    findingCodes: Object.freeze([...input.chain.findingCodes]),
    ...AUTHORITY,
    independentEngineeringComplete: true,
    retailTrackReviewEligible: input.chain.eligibleForReview,
    humanTrackReviewComplete: false,
    retailSampleEligible: false,
    createdAt: input.chain.createdAt,
  };
  const value = Object.freeze({ ...partial, fingerprint: stableHash(base<AdmittedNarratorRetailTrackEncode>(partial)) });
  assertAdmittedNarratorRetailTrackEncode(value);
  return value;
}

export async function ingestAdmittedNarratorRetailTrackRender(
  objectStore: FilePrivateObjectStore,
  registry: FileArtifactRegistry,
  input: IngestAdmittedNarratorRetailTrackRenderInput,
): Promise<AdmittedNarratorRetailTrackEncode> {
  assertRenderResult(input.admittedRender, input.render);
  const admittedPlan = input.admittedRender.admittedPlan;
  const chain = await ingestAudiobookRetailTrackRender(objectStore, registry, {
    plan: admittedPlan.plan,
    render: input.render,
    approvedReferenceArtifact: admittedPlan.wholeBookApproval.approvedArtifact,
    actorId: input.actorId,
    ...(input.verifierActorId ? { verifierActorId: input.verifierActorId } : {}),
    engineering: input.engineering,
    ...(input.maximumDurationDriftMs !== undefined ? { maximumDurationDriftMs: input.maximumDurationDriftMs } : {}),
    ...(input.now ? { now: input.now } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  return bindEncode({ admittedRender: input.admittedRender, render: input.render, chain });
}

export function assertAdmittedNarratorRetailTrackEncode(value: AdmittedNarratorRetailTrackEncode): void {
  if (value.schemaVersion !== ADMITTED_NARRATOR_RETAIL_TRACK_ENCODE_SCHEMA) {
    throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_ENCODE_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(value.projectId, "ADMITTED_NARRATOR_RETAIL_ENCODE_PROJECT_INVALID");
  requireIdentifier(value.bookId, "ADMITTED_NARRATOR_RETAIL_ENCODE_BOOK_INVALID");
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
    value.renderEvidenceFingerprint,
    value.engineeringProfileFingerprint,
  ]) requireHash(hash, "ADMITTED_NARRATOR_RETAIL_ENCODE_HASH_INVALID");
  requirePositiveInteger(value.totalProductionJobCount, "ADMITTED_NARRATOR_RETAIL_ENCODE_JOB_COUNT_INVALID");
  assertAdmittedNarratorRetailTrackRender(value.render);
  assertAudiobookRetailTrackEncodeChain(value.chain);
  assertLineage(lineage(value.render.admittedPlan), value, "ADMITTED_NARRATOR_RETAIL_ENCODE_LINEAGE_MISMATCH");
  const admittedPlan = value.render.admittedPlan;
  const reference = admittedPlan.wholeBookApproval.approvedArtifact;
  if (
    value.chain.projectId !== value.projectId
    || value.chain.bookId !== value.bookId
    || value.chain.planId !== admittedPlan.plan.id
    || value.chain.planFingerprint !== admittedPlan.plan.fingerprint
    || value.chain.referenceMaster.id !== reference.id
    || value.chain.referenceMaster.revision !== reference.revision
    || value.chain.referenceMaster.fingerprint !== reference.fingerprint
    || value.chain.referenceMaster.contentHash !== reference.integrity.contentHash
    || value.chain.referenceMaster.byteCount !== reference.integrity.byteCount
    || value.chain.referenceMaster.rightsFingerprint !== reference.rights.rightsFingerprint
    || value.chain.renderEvidence.payload.provenance.generationRequestHash !== value.render.renderEvidence.fingerprint
    || value.renderEvidenceFingerprint !== value.render.renderEvidence.fingerprint
    || value.engineeringProfileFingerprint !== value.chain.engineeringProfile.fingerprint
    || value.trackCount !== value.chain.tracks.length
    || value.trackCount !== value.render.trackCount
    || value.totalOutputBytes !== value.chain.totalOutputBytes
    || stableHash(value.findingCodes) !== stableHash(value.chain.findingCodes)
    || value.createdAt !== value.chain.createdAt
    || Date.parse(value.createdAt) < Date.parse(value.render.renderedAt)
  ) throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_ENCODE_LINEAGE_MISMATCH");
  for (const [index, track] of value.chain.tracks.entries()) {
    const planned = admittedPlan.plan.tracks[index];
    const rendered = value.render.renderEvidence.tracks[index];
    const artifact = track.artifact.payload;
    if (
      !planned || !rendered
      || track.ordinal !== planned.ordinal
      || track.plannedTrackFingerprint !== planned.fingerprint
      || track.renderTrackFingerprint !== rendered.fingerprint
      || track.commandFingerprint !== rendered.commandFingerprint
      || artifact.integrity.contentHash !== rendered.output.contentHash
      || artifact.integrity.byteCount !== rendered.output.byteCount
    ) throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_ENCODE_TRACK_LINEAGE_MISMATCH");
  }
  assertAuthority(value, "ADMITTED_NARRATOR_RETAIL_ENCODE_AUTHORITY_INVALID");
  if (
    value.independentEngineeringComplete !== true
    || value.retailTrackReviewEligible !== value.chain.eligibleForReview
    || value.humanTrackReviewComplete !== false
    || value.retailSampleEligible !== false
  ) throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_ENCODE_AUTHORITY_INVALID");
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(base<AdmittedNarratorRetailTrackEncode>(partial))) {
    throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_ENCODE_FINGERPRINT_INVALID");
  }
}

function reviewLineage(encode: AdmittedNarratorRetailTrackEncode): RetailNarratorLineage {
  assertAdmittedNarratorRetailTrackEncode(encode);
  return Object.freeze({
    projectId: encode.projectId,
    bookId: encode.bookId,
    profileAdmissionHash: encode.profileAdmissionHash,
    admittedCastingFingerprint: encode.admittedCastingFingerprint,
    castingFingerprint: encode.castingFingerprint,
    voice: Object.freeze({ ...encode.voice }),
    totalProductionJobCount: encode.totalProductionJobCount,
  });
}

export function createAdmittedNarratorRetailTrackReviewBinding(input: Readonly<{
  id: string;
  encode: AdmittedNarratorRetailTrackEncode;
  createdAt?: Date;
}>): AdmittedNarratorRetailTrackReviewBinding {
  assertAdmittedNarratorRetailTrackEncode(input.encode);
  if (!input.encode.retailTrackReviewEligible) {
    throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_REVIEW_ENCODE_INELIGIBLE");
  }
  const session = createAudiobookRetailTrackReviewSession({
    id: input.id,
    chain: input.encode.chain,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  });
  const partial: Omit<AdmittedNarratorRetailTrackReviewBinding, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_BINDING_SCHEMA,
    ...reviewLineage(input.encode),
    encode: input.encode,
    session,
    sessionFingerprint: session.fingerprint,
    trackCount: session.tracks.length,
    revision: session.revision,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...AUTHORITY,
    independentEngineeringComplete: true,
    retailTrackReviewEligible: true,
    humanTrackReviewComplete: false,
    retailSampleEligible: false,
  };
  const value = Object.freeze({ ...partial, fingerprint: stableHash(base<AdmittedNarratorRetailTrackReviewBinding>(partial)) });
  assertAdmittedNarratorRetailTrackReviewBinding(value);
  return value;
}

export function recordAdmittedNarratorRetailTrackReview(
  value: AdmittedNarratorRetailTrackReviewBinding,
  input: Parameters<typeof recordAudiobookRetailTrackReview>[1],
): AdmittedNarratorRetailTrackReviewBinding {
  assertAdmittedNarratorRetailTrackReviewBinding(value);
  const session = recordAudiobookRetailTrackReview(value.session, input);
  const { fingerprint: _fingerprint, previousFingerprint: _previous, ...rest } = value;
  const partial: Omit<AdmittedNarratorRetailTrackReviewBinding, "fingerprint"> = {
    ...rest,
    session,
    sessionFingerprint: session.fingerprint,
    revision: session.revision,
    previousFingerprint: value.fingerprint,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
  const next = Object.freeze({ ...partial, fingerprint: stableHash(base<AdmittedNarratorRetailTrackReviewBinding>(partial)) });
  assertAdmittedNarratorRetailTrackReviewBinding(next);
  return next;
}

export function assertAdmittedNarratorRetailTrackReviewBinding(value: AdmittedNarratorRetailTrackReviewBinding): void {
  if (value.schemaVersion !== ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_BINDING_SCHEMA) {
    throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_REVIEW_BINDING_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(value.projectId, "ADMITTED_NARRATOR_RETAIL_REVIEW_PROJECT_INVALID");
  requireIdentifier(value.bookId, "ADMITTED_NARRATOR_RETAIL_REVIEW_BOOK_INVALID");
  for (const hash of [value.profileAdmissionHash, value.admittedCastingFingerprint, value.castingFingerprint, value.sessionFingerprint]) {
    requireHash(hash, "ADMITTED_NARRATOR_RETAIL_REVIEW_HASH_INVALID");
  }
  requirePositiveInteger(value.totalProductionJobCount, "ADMITTED_NARRATOR_RETAIL_REVIEW_JOB_COUNT_INVALID");
  assertAdmittedNarratorRetailTrackEncode(value.encode);
  assertAudiobookRetailTrackReviewSession(value.session);
  assertAudiobookRetailTrackReviewMatchesChain(value.session, value.encode.chain, new Date(value.session.updatedAt));
  assertLineage(reviewLineage(value.encode), value, "ADMITTED_NARRATOR_RETAIL_REVIEW_LINEAGE_MISMATCH");
  requirePositiveInteger(value.trackCount, "ADMITTED_NARRATOR_RETAIL_REVIEW_TRACK_COUNT_INVALID");
  requirePositiveInteger(value.revision, "ADMITTED_NARRATOR_RETAIL_REVIEW_REVISION_INVALID");
  requireDate(value.createdAt, "ADMITTED_NARRATOR_RETAIL_REVIEW_DATE_INVALID");
  requireDate(value.updatedAt, "ADMITTED_NARRATOR_RETAIL_REVIEW_DATE_INVALID");
  if (
    value.sessionFingerprint !== value.session.fingerprint
    || value.trackCount !== value.encode.trackCount
    || value.trackCount !== value.session.tracks.length
    || value.revision !== value.session.revision
    || value.createdAt !== value.session.createdAt
    || value.updatedAt !== value.session.updatedAt
  ) throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_REVIEW_LINEAGE_MISMATCH");
  if (value.revision === 1 && value.previousFingerprint !== undefined) {
    throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_REVIEW_REVISION_CHAIN_INVALID");
  }
  if (value.revision > 1) requireHash(value.previousFingerprint ?? "", "ADMITTED_NARRATOR_RETAIL_REVIEW_REVISION_CHAIN_INVALID");
  assertAuthority(value, "ADMITTED_NARRATOR_RETAIL_REVIEW_AUTHORITY_INVALID");
  if (
    value.independentEngineeringComplete !== true
    || value.retailTrackReviewEligible !== true
    || value.humanTrackReviewComplete !== false
    || value.retailSampleEligible !== false
  ) throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_REVIEW_AUTHORITY_INVALID");
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(base<AdmittedNarratorRetailTrackReviewBinding>(partial))) {
    throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_REVIEW_FINGERPRINT_INVALID");
  }
}

export function approveAdmittedNarratorRetailTrackReview(
  binding: AdmittedNarratorRetailTrackReviewBinding,
  input: Parameters<typeof approveAudiobookRetailTrackReview>[2],
): AdmittedNarratorRetailTrackReviewApproval {
  assertAdmittedNarratorRetailTrackReviewBinding(binding);
  const approved = approveAudiobookRetailTrackReview(binding.session, binding.encode.chain, input);
  const approval = approved.session.approval;
  if (!approval) throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_REVIEW_APPROVAL_MISSING");
  const partial: Omit<AdmittedNarratorRetailTrackReviewApproval, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_APPROVAL_SCHEMA,
    ...reviewLineage(binding.encode),
    binding,
    session: approved.session,
    approvedArtifacts: approved.artifacts,
    reviewApprovalFingerprint: approval.fingerprint,
    trackCount: approved.artifacts.length,
    totalOutputBytes: binding.encode.totalOutputBytes,
    approvedAt: approval.approvedAt,
    ...AUTHORITY,
    independentEngineeringComplete: true,
    retailTrackReviewEligible: true,
    humanTrackReviewComplete: true,
    retailSampleEligible: true,
  };
  const value = Object.freeze({ ...partial, fingerprint: stableHash(base<AdmittedNarratorRetailTrackReviewApproval>(partial)) });
  assertAdmittedNarratorRetailTrackReviewApproval(value);
  return value;
}

export function assertAdmittedNarratorRetailTrackReviewApproval(value: AdmittedNarratorRetailTrackReviewApproval): void {
  if (value.schemaVersion !== ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_APPROVAL_SCHEMA) {
    throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_REVIEW_APPROVAL_SCHEMA_UNSUPPORTED");
  }
  assertAdmittedNarratorRetailTrackReviewBinding(value.binding);
  assertAudiobookRetailTrackReviewSession(value.session);
  assertAudiobookRetailTrackReviewMatchesChain(value.session, value.binding.encode.chain, new Date(value.approvedAt));
  assertLineage(reviewLineage(value.binding.encode), value, "ADMITTED_NARRATOR_RETAIL_REVIEW_APPROVAL_LINEAGE_MISMATCH");
  const approval = value.session.approval;
  if (
    value.session.status !== "approved" || !approval
    || value.session.previousFingerprint !== value.binding.session.fingerprint
    || value.reviewApprovalFingerprint !== approval.fingerprint
    || value.approvedAt !== approval.approvedAt
    || value.trackCount !== value.binding.trackCount
    || value.trackCount !== value.approvedArtifacts.length
    || value.trackCount !== approval.approvedArtifacts.length
    || value.totalOutputBytes !== value.binding.encode.totalOutputBytes
  ) throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_REVIEW_APPROVAL_LINEAGE_MISMATCH");
  for (const [index, artifact] of value.approvedArtifacts.entries()) {
    assertArtifactRecord(artifact);
    const source = value.binding.encode.chain.tracks[index]?.artifact.payload;
    const snapshot = approval.approvedArtifacts[index];
    if (
      !source || !snapshot || snapshot.ordinal !== index + 1
      || artifact.id !== source.id || artifact.id !== snapshot.id
      || artifact.revision !== source.revision + 1 || artifact.revision !== snapshot.revision
      || artifact.previousFingerprint !== source.fingerprint || artifact.fingerprint !== snapshot.fingerprint
      || artifact.integrity.contentHash !== source.integrity.contentHash
      || artifact.integrity.byteCount !== source.integrity.byteCount
      || stableHash(artifact.review) !== snapshot.reviewFingerprint
      || artifact.review.status !== "approved"
    ) throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_REVIEW_APPROVED_ARTIFACT_MISMATCH");
  }
  requireDate(value.approvedAt, "ADMITTED_NARRATOR_RETAIL_REVIEW_APPROVAL_DATE_INVALID");
  assertAuthority(value, "ADMITTED_NARRATOR_RETAIL_REVIEW_APPROVAL_AUTHORITY_INVALID");
  if (
    value.independentEngineeringComplete !== true
    || value.retailTrackReviewEligible !== true
    || value.humanTrackReviewComplete !== true
    || value.retailSampleEligible !== true
  ) throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_REVIEW_APPROVAL_AUTHORITY_INVALID");
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(base<AdmittedNarratorRetailTrackReviewApproval>(partial))) {
    throw new NarratorRetailTrackProductionAdmissionError("ADMITTED_NARRATOR_RETAIL_REVIEW_APPROVAL_FINGERPRINT_INVALID");
  }
}

export function admittedNarratorRetailTrackProductionPublicView(
  value: AdmittedNarratorRetailTrackRender | AdmittedNarratorRetailTrackEncode
    | AdmittedNarratorRetailTrackReviewBinding | AdmittedNarratorRetailTrackReviewApproval,
): AdmittedNarratorRetailTrackProductionPublicView {
  let trackCount: number;
  let totalOutputBytes: number;
  let findingCodeCount = 0;
  let reviewStatus: AudiobookRetailTrackReviewSession["status"] | "not-started" = "not-started";
  let independentEngineeringComplete = false;
  let humanTrackReviewComplete = false;
  let retailSampleEligible = false;
  let plan: AdmittedNarratorRetailTrackPlan;
  switch (value.schemaVersion) {
    case ADMITTED_NARRATOR_RETAIL_TRACK_RENDER_SCHEMA:
      assertAdmittedNarratorRetailTrackRender(value);
      plan = value.admittedPlan;
      trackCount = value.trackCount;
      totalOutputBytes = value.totalOutputBytes;
      break;
    case ADMITTED_NARRATOR_RETAIL_TRACK_ENCODE_SCHEMA:
      assertAdmittedNarratorRetailTrackEncode(value);
      plan = value.render.admittedPlan;
      trackCount = value.trackCount;
      totalOutputBytes = value.totalOutputBytes;
      findingCodeCount = value.findingCodes.length;
      independentEngineeringComplete = true;
      break;
    case ADMITTED_NARRATOR_RETAIL_TRACK_REVIEW_BINDING_SCHEMA:
      assertAdmittedNarratorRetailTrackReviewBinding(value);
      plan = value.encode.render.admittedPlan;
      trackCount = value.trackCount;
      totalOutputBytes = value.encode.totalOutputBytes;
      findingCodeCount = value.encode.findingCodes.length;
      reviewStatus = value.session.status;
      independentEngineeringComplete = true;
      break;
    default:
      assertAdmittedNarratorRetailTrackReviewApproval(value);
      plan = value.binding.encode.render.admittedPlan;
      trackCount = value.trackCount;
      totalOutputBytes = value.totalOutputBytes;
      findingCodeCount = value.binding.encode.findingCodes.length;
      reviewStatus = value.session.status;
      independentEngineeringComplete = true;
      humanTrackReviewComplete = true;
      retailSampleEligible = true;
  }
  return Object.freeze({
    bookId: value.bookId,
    distributor: plan.plan.distributor,
    policyVersion: plan.plan.policy.externalVersion,
    trackCount,
    totalOutputBytes,
    findingCodeCount,
    totalProductionJobCount: value.totalProductionJobCount,
    reviewStatus,
    narratorAdmissionComplete: true,
    completeBookListeningApproval: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailTracksRendered: true,
    independentEngineeringComplete,
    humanTrackReviewComplete,
    retailSampleEligible,
    packageAuthority: false,
    deliveryAuthority: false,
    releaseDecisionAuthority: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    fingerprint: value.fingerprint,
  });
}
