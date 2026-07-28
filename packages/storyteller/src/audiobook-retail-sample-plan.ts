import {
  assertArtifactRecord,
  type ArtifactRecord,
} from "./artifact-registry.js";
import {
  assertCurrentAudiobookRetailEncodingPolicy,
  type AudiobookRetailBitRateKbps,
  type AudiobookRetailEncodingPolicy,
} from "./audiobook-retail-policy.js";
import {
  assertAudiobookRetailTrackEncodeChain,
  type AudiobookRetailTrackEncodeChain,
} from "./audiobook-retail-track-encode.js";
import {
  assertAudiobookRetailTrackPlan,
  type AudiobookRetailTrackPlan,
} from "./audiobook-retail-track-plan.js";
import {
  assertAudiobookRetailTrackReviewMatchesChain,
  assertAudiobookRetailTrackReviewSession,
  type AudiobookRetailTrackReviewSession,
} from "./audiobook-retail-track-review.js";
import { stableHash } from "./index.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";

export const AUDIOBOOK_RETAIL_SAMPLE_PLAN_SCHEMA_VERSION =
  "storyteller-audiobook-retail-sample-plan-v1" as const;
export const AUDIOBOOK_RETAIL_SAMPLE_PLAN_ENTITY_TYPE =
  "audiobook-retail-sample-plan" as const;

export type AudiobookRetailSampleSourceRole =
  | "prologue"
  | "chapter"
  | "epilogue";
export type AudiobookRetailSampleSelectionPreference =
  | "preferred-book-beginning"
  | "curated-exception";
export type AudiobookRetailSampleExceptionReason =
  | "explicit-content-at-beginning"
  | "opening-too-short-or-nonrepresentative"
  | "spoiler-or-context-risk"
  | "stronger-representative-excerpt"
  | "technical-boundary-constraint";

export interface AudiobookRetailSampleSelectionEvidence {
  selectedByActorId: string;
  completeRangeListenConfirmed: true;
  representativeOfBookConfirmed: true;
  startBoundaryConfirmed: true;
  endBoundaryConfirmed: true;
  selectionPreference: AudiobookRetailSampleSelectionPreference;
  exceptionReason?: AudiobookRetailSampleExceptionReason;
  selectedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailSampleSafetyEvidence {
  reviewedByActorId: string;
  completeRangeListenConfirmed: true;
  sourceFromAudiobookConfirmed: true;
  explicitContentDetected: false;
  unsuitableRetailPreviewContentDetected: false;
  approvedForRetailPreview: true;
  reviewedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailSamplePlan {
  schemaVersion: typeof AUDIOBOOK_RETAIL_SAMPLE_PLAN_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  distributor: "acx-audible";
  policy: Readonly<{
    id: string;
    externalVersion: string;
    reviewedAt: string;
    expiresAt: string;
    fingerprint: string;
    maximumDurationMs: 300_000;
    explicitContentProhibited: true;
    humanContentSafetyReviewRequired: true;
  }>;
  trackPlan: Readonly<{
    id: string;
    fingerprint: string;
  }>;
  encodeChainFingerprint: string;
  trackReview: Readonly<{
    sessionId: string;
    sessionRevision: number;
    sessionFingerprint: string;
    approvalFingerprint: string;
    approvedAt: string;
  }>;
  source: Readonly<{
    trackOrdinal: number;
    role: AudiobookRetailSampleSourceRole;
    fileName: string;
    originalArtifactRevision: number;
    originalArtifactFingerprint: string;
    approvedArtifactId: string;
    approvedArtifactRevision: number;
    approvedArtifactFingerprint: string;
    approvedArtifactContentHash: string;
    approvedArtifactByteCount: number;
    approvedArtifactReviewFingerprint: string;
  }>;
  range: Readonly<{
    relativeStartMs: number;
    relativeEndMs: number;
    durationMs: number;
    absoluteBookStartMs: number;
    absoluteBookEndMs: number;
  }>;
  output: Readonly<{
    fileName: "RetailSample.mp3";
    format: "mp3";
    codec: "mp3";
    bitRateMode: "cbr";
    bitRateKbps: AudiobookRetailBitRateKbps;
    sampleRateHz: 44_100;
    channels: 1 | 2;
  }>;
  selection: AudiobookRetailSampleSelectionEvidence;
  safety: AudiobookRetailSampleSafetyEvidence;
  status: "ready-for-rendering";
  createdAt: string;
  revision: 1;
  fingerprint: string;
}

export interface AudiobookRetailSamplePlanPublicView {
  id: string;
  bookId: string;
  distributor: "acx-audible";
  policyVersion: string;
  sourceTrackOrdinal: number;
  sourceRole: AudiobookRetailSampleSourceRole;
  sourceFileName: string;
  relativeStartMs: number;
  relativeEndMs: number;
  durationMs: number;
  absoluteBookStartMs: number;
  absoluteBookEndMs: number;
  selectionPreference: AudiobookRetailSampleSelectionPreference;
  exceptionReason?: AudiobookRetailSampleExceptionReason;
  output: AudiobookRetailSamplePlan["output"];
  contentSafetyApproved: true;
  status: "ready-for-rendering";
  createdAt: string;
  fingerprint: string;
}

export interface CreateAudiobookRetailSamplePlanInput {
  id?: string;
  policy: AudiobookRetailEncodingPolicy;
  trackPlan: AudiobookRetailTrackPlan;
  encodeChain: AudiobookRetailTrackEncodeChain;
  trackReview: AudiobookRetailTrackReviewSession;
  approvedSourceArtifact: ArtifactRecord;
  sourceTrackOrdinal: number;
  relativeStartMs: number;
  relativeEndMs: number;
  selection: Readonly<{
    selectedByActorId: string;
    completeRangeListenConfirmed: true;
    representativeOfBookConfirmed: true;
    startBoundaryConfirmed: true;
    endBoundaryConfirmed: true;
    exceptionReason?: AudiobookRetailSampleExceptionReason;
    selectedAt: Date;
  }>;
  safety: Readonly<{
    reviewedByActorId: string;
    completeRangeListenConfirmed: true;
    sourceFromAudiobookConfirmed: true;
    explicitContentDetected: false;
    unsuitableRetailPreviewContentDetected: false;
    approvedForRetailPreview: true;
    reviewedAt: Date;
  }>;
  createdAt?: Date;
}

export class AudiobookRetailSamplePlanError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailSamplePlanError";
    this.code = code;
  }
}

export class AudiobookRetailSamplePlanStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudiobookRetailSamplePlanStoreConflictError";
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const FILE_NAME_PATTERN = /^[A-Za-z0-9]+\.mp3$/u;
const HUMAN_BLOCKLIST = /^(?:system|worker|automation|automated|bot)(?:[_-]|$)/iu;
const MAXIMUM_TRACKS = 2_002;
const MAXIMUM_SAMPLE_DURATION_MS = 300_000 as const;
const EXCEPTION_REASONS: ReadonlySet<AudiobookRetailSampleExceptionReason> =
  new Set([
    "explicit-content-at-beginning",
    "opening-too-short-or-nonrepresentative",
    "spoiler-or-context-risk",
    "stronger-representative-excerpt",
    "technical-boundary-constraint",
  ]);

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailSamplePlanError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailSamplePlanError(code);
  }
  return value;
}

function requireHumanActor(value: string, code: string): string {
  requireIdentifier(value, code);
  if (HUMAN_BLOCKLIST.test(value)) {
    throw new AudiobookRetailSamplePlanError(code);
  }
  return value;
}

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new AudiobookRetailSamplePlanError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailSamplePlanError(code);
  }
  return value;
}

function selectionFingerprint(
  value: Omit<AudiobookRetailSampleSelectionEvidence, "fingerprint">,
): string {
  return stableHash(value);
}

function safetyFingerprint(
  value: Omit<AudiobookRetailSampleSafetyEvidence, "fingerprint">,
): string {
  return stableHash(value);
}

function planFingerprint(
  value: Omit<AudiobookRetailSamplePlan, "fingerprint">,
): string {
  return stableHash(value);
}

function isNarrativeRole(
  role: string,
): role is AudiobookRetailSampleSourceRole {
  return role === "prologue" || role === "chapter" || role === "epilogue";
}

function requireCurrentRights(record: ArtifactRecord, now: Date): void {
  if (!record.rights.allowedUses.includes("audiobook")) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_AUDIOBOOK_RIGHTS_REQUIRED",
    );
  }
  if (!record.rights.commercialUseApproved) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_COMMERCIAL_RIGHTS_REQUIRED",
    );
  }
  if (
    record.rights.expiresAt
    && Date.parse(record.rights.expiresAt) <= now.getTime()
  ) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_RIGHTS_EXPIRED",
    );
  }
  if (
    record.rights.deletionRequiredAt
    && Date.parse(record.rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_RETENTION_EXPIRED",
    );
  }
}

function assertPolicyAndPlan(
  policy: AudiobookRetailEncodingPolicy,
  trackPlan: AudiobookRetailTrackPlan,
  now: Date,
): void {
  assertCurrentAudiobookRetailEncodingPolicy(policy, now);
  assertAudiobookRetailTrackPlan(trackPlan);
  if (
    policy.distributor !== "acx-audible"
    || policy.sample.maximumDurationMs !== MAXIMUM_SAMPLE_DURATION_MS
    || policy.sample.mustComeFromAudiobook !== true
    || policy.sample.explicitContentProhibited !== true
    || policy.sample.humanContentSafetyReviewRequired !== true
    || policy.sample.preferredSource !== "book-beginning"
    || trackPlan.distributor !== policy.distributor
    || trackPlan.policy.id !== policy.id
    || trackPlan.policy.externalVersion !== policy.externalVersion
    || trackPlan.policy.reviewedAt !== policy.reviewedAt
    || trackPlan.policy.expiresAt !== policy.expiresAt
    || trackPlan.policy.fingerprint !== policy.fingerprint
    || trackPlan.output.format !== policy.output.format
    || trackPlan.output.codec !== policy.output.codec
    || trackPlan.output.bitRateMode !== policy.output.bitRateMode
    || trackPlan.output.bitRateKbps !== policy.output.bitRateKbps
    || trackPlan.output.sampleRateHz !== policy.output.sampleRateHz
    || trackPlan.status !== "ready-for-encoding"
    || trackPlan.blockers.length !== 0
  ) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_POLICY_OR_TRACK_PLAN_MISMATCH",
    );
  }
}

function assertApprovedReview(
  review: AudiobookRetailTrackReviewSession,
  encodeChain: AudiobookRetailTrackEncodeChain,
  trackPlan: AudiobookRetailTrackPlan,
  now: Date,
): NonNullable<AudiobookRetailTrackReviewSession["approval"]> {
  assertAudiobookRetailTrackReviewSession(review);
  assertAudiobookRetailTrackEncodeChain(encodeChain);
  assertAudiobookRetailTrackReviewMatchesChain(review, encodeChain, now);
  if (
    review.status !== "approved"
    || !review.approval
    || review.projectId !== trackPlan.projectId
    || review.bookId !== trackPlan.bookId
    || review.planFingerprint !== trackPlan.fingerprint
    || review.encodeChainFingerprint !== encodeChain.fingerprint
    || encodeChain.projectId !== trackPlan.projectId
    || encodeChain.bookId !== trackPlan.bookId
    || encodeChain.planId !== trackPlan.id
    || encodeChain.planFingerprint !== trackPlan.fingerprint
    || encodeChain.tracks.length !== trackPlan.tracks.length
  ) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_APPROVED_REVIEW_REQUIRED",
    );
  }
  return review.approval;
}

function assertApprovedSourceArtifact(input: Readonly<{
  artifact: ArtifactRecord;
  original: AudiobookRetailTrackEncodeChain["tracks"][number];
  approvedSnapshot: NonNullable<
    AudiobookRetailTrackReviewSession["approval"]
  >["approvedArtifacts"][number];
  now: Date;
}>): void {
  const artifact = input.artifact;
  const original = input.original.artifact.payload;
  const snapshot = input.approvedSnapshot;
  assertArtifactRecord(artifact);
  if (
    artifact.kind !== "audiobook-retail-track"
    || artifact.projectId !== original.projectId
    || artifact.jobId !== original.jobId
    || artifact.segmentId !== original.segmentId
    || artifact.takeId !== original.takeId
    || artifact.id !== original.id
    || artifact.id !== snapshot.id
    || artifact.revision !== original.revision + 1
    || artifact.revision !== snapshot.revision
    || artifact.previousFingerprint !== original.fingerprint
    || artifact.fingerprint !== snapshot.fingerprint
    || stableHash(artifact.storage) !== stableHash(original.storage)
    || stableHash(artifact.integrity) !== stableHash(original.integrity)
    || stableHash(artifact.provenance) !== stableHash(original.provenance)
    || stableHash(artifact.rights) !== stableHash(original.rights)
    || artifact.verification.status !== "verified"
    || artifact.review.required !== true
    || artifact.review.status !== "approved"
    || stableHash(artifact.review) !== snapshot.reviewFingerprint
    || artifact.quarantine !== undefined
    || artifact.release.status !== "unavailable"
  ) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_APPROVED_SOURCE_ARTIFACT_MISMATCH",
    );
  }
  requireCurrentRights(artifact, input.now);
}

function assertSelectionEvidence(
  evidence: AudiobookRetailSampleSelectionEvidence,
): void {
  requireHumanActor(
    evidence.selectedByActorId,
    "AUDIOBOOK_RETAIL_SAMPLE_EDITOR_INVALID",
  );
  if (
    evidence.completeRangeListenConfirmed !== true
    || evidence.representativeOfBookConfirmed !== true
    || evidence.startBoundaryConfirmed !== true
    || evidence.endBoundaryConfirmed !== true
  ) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_EDITORIAL_CONFIRMATION_REQUIRED",
    );
  }
  if (
    evidence.selectionPreference !== "preferred-book-beginning"
    && evidence.selectionPreference !== "curated-exception"
  ) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_SELECTION_PREFERENCE_INVALID",
    );
  }
  if (
    evidence.selectionPreference === "preferred-book-beginning"
    && evidence.exceptionReason !== undefined
  ) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_EXCEPTION_REASON_UNEXPECTED",
    );
  }
  if (
    evidence.selectionPreference === "curated-exception"
    && (
      evidence.exceptionReason === undefined
      || !EXCEPTION_REASONS.has(evidence.exceptionReason)
    )
  ) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_EXCEPTION_REASON_REQUIRED",
    );
  }
  requireDate(
    evidence.selectedAt,
    "AUDIOBOOK_RETAIL_SAMPLE_SELECTION_DATE_INVALID",
  );
  const { fingerprint, ...partial } = evidence;
  if (selectionFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_SELECTION_FINGERPRINT_INVALID",
    );
  }
}

function assertSafetyEvidence(
  evidence: AudiobookRetailSampleSafetyEvidence,
  selectedByActorId: string,
): void {
  requireHumanActor(
    evidence.reviewedByActorId,
    "AUDIOBOOK_RETAIL_SAMPLE_SAFETY_REVIEWER_INVALID",
  );
  if (evidence.reviewedByActorId === selectedByActorId) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_INDEPENDENT_SAFETY_REVIEW_REQUIRED",
    );
  }
  if (
    evidence.completeRangeListenConfirmed !== true
    || evidence.sourceFromAudiobookConfirmed !== true
    || evidence.explicitContentDetected !== false
    || evidence.unsuitableRetailPreviewContentDetected !== false
    || evidence.approvedForRetailPreview !== true
  ) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_CONTENT_SAFETY_APPROVAL_REQUIRED",
    );
  }
  requireDate(
    evidence.reviewedAt,
    "AUDIOBOOK_RETAIL_SAMPLE_SAFETY_REVIEW_DATE_INVALID",
  );
  const { fingerprint, ...partial } = evidence;
  if (safetyFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_SAFETY_FINGERPRINT_INVALID",
    );
  }
}

export function createAudiobookRetailSamplePlan(
  input: CreateAudiobookRetailSamplePlanInput,
): AudiobookRetailSamplePlan {
  const createdAt = input.createdAt ?? new Date();
  if (Number.isNaN(createdAt.getTime())) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_DATE_INVALID",
    );
  }
  assertPolicyAndPlan(input.policy, input.trackPlan, createdAt);
  const approval = assertApprovedReview(
    input.trackReview,
    input.encodeChain,
    input.trackPlan,
    createdAt,
  );
  const ordinal = requireInteger(
    input.sourceTrackOrdinal,
    1,
    MAXIMUM_TRACKS,
    "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_ORDINAL_INVALID",
  );
  const encodedTrack = input.encodeChain.tracks[ordinal - 1];
  const plannedTrack = input.trackPlan.tracks[ordinal - 1];
  const reviewedTrack = input.trackReview.tracks[ordinal - 1];
  const approvedSnapshot = approval.approvedArtifacts[ordinal - 1];
  if (
    !encodedTrack
    || !plannedTrack
    || !reviewedTrack
    || !approvedSnapshot
    || encodedTrack.ordinal !== ordinal
    || plannedTrack.ordinal !== ordinal
    || reviewedTrack.ordinal !== ordinal
    || approvedSnapshot.ordinal !== ordinal
    || encodedTrack.fileName !== plannedTrack.fileName
    || reviewedTrack.fileName !== plannedTrack.fileName
    || encodedTrack.plannedTrackFingerprint !== plannedTrack.fingerprint
    || !isNarrativeRole(plannedTrack.role)
    || encodedTrack.role !== plannedTrack.role
    || reviewedTrack.role !== plannedTrack.role
    || !FILE_NAME_PATTERN.test(plannedTrack.fileName)
  ) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_NARRATIVE_SOURCE_REQUIRED",
    );
  }
  assertApprovedSourceArtifact({
    artifact: input.approvedSourceArtifact,
    original: encodedTrack,
    approvedSnapshot,
    now: createdAt,
  });

  const relativeStartMs = requireInteger(
    input.relativeStartMs,
    0,
    encodedTrack.observedDurationMs - 1,
    "AUDIOBOOK_RETAIL_SAMPLE_RANGE_INVALID",
  );
  const relativeEndMs = requireInteger(
    input.relativeEndMs,
    relativeStartMs + 1,
    encodedTrack.observedDurationMs,
    "AUDIOBOOK_RETAIL_SAMPLE_RANGE_INVALID",
  );
  const durationMs = relativeEndMs - relativeStartMs;
  if (durationMs > input.policy.sample.maximumDurationMs) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_DURATION_EXCEEDS_POLICY",
    );
  }
  const firstNarrative = input.trackPlan.tracks.find((track) =>
    isNarrativeRole(track.role)
  );
  if (!firstNarrative) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_NARRATIVE_SOURCE_REQUIRED",
    );
  }
  const usesPreferredBeginning = ordinal === firstNarrative.ordinal
    && relativeStartMs === 0;
  const selectionPreference: AudiobookRetailSampleSelectionPreference =
    usesPreferredBeginning
      ? "preferred-book-beginning"
      : "curated-exception";
  if (
    usesPreferredBeginning
    && input.selection.exceptionReason !== undefined
  ) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_EXCEPTION_REASON_UNEXPECTED",
    );
  }
  if (
    !usesPreferredBeginning
    && (
      input.selection.exceptionReason === undefined
      || !EXCEPTION_REASONS.has(input.selection.exceptionReason)
    )
  ) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_EXCEPTION_REASON_REQUIRED",
    );
  }
  const selectedByActorId = requireHumanActor(
    input.selection.selectedByActorId,
    "AUDIOBOOK_RETAIL_SAMPLE_EDITOR_INVALID",
  );
  if (
    input.selection.completeRangeListenConfirmed !== true
    || input.selection.representativeOfBookConfirmed !== true
    || input.selection.startBoundaryConfirmed !== true
    || input.selection.endBoundaryConfirmed !== true
    || Number.isNaN(input.selection.selectedAt.getTime())
  ) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_EDITORIAL_CONFIRMATION_REQUIRED",
    );
  }
  const selectionBase: Omit<
    AudiobookRetailSampleSelectionEvidence,
    "fingerprint"
  > = {
    selectedByActorId,
    completeRangeListenConfirmed: true,
    representativeOfBookConfirmed: true,
    startBoundaryConfirmed: true,
    endBoundaryConfirmed: true,
    selectionPreference,
    ...(input.selection.exceptionReason
      ? { exceptionReason: input.selection.exceptionReason }
      : {}),
    selectedAt: input.selection.selectedAt.toISOString(),
  };
  const selection = Object.freeze({
    ...selectionBase,
    fingerprint: selectionFingerprint(selectionBase),
  });
  assertSelectionEvidence(selection);

  const reviewedByActorId = requireHumanActor(
    input.safety.reviewedByActorId,
    "AUDIOBOOK_RETAIL_SAMPLE_SAFETY_REVIEWER_INVALID",
  );
  if (reviewedByActorId === selectedByActorId) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_INDEPENDENT_SAFETY_REVIEW_REQUIRED",
    );
  }
  if (
    input.safety.completeRangeListenConfirmed !== true
    || input.safety.sourceFromAudiobookConfirmed !== true
    || input.safety.explicitContentDetected !== false
    || input.safety.unsuitableRetailPreviewContentDetected !== false
    || input.safety.approvedForRetailPreview !== true
    || Number.isNaN(input.safety.reviewedAt.getTime())
  ) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_CONTENT_SAFETY_APPROVAL_REQUIRED",
    );
  }
  const safetyBase: Omit<AudiobookRetailSampleSafetyEvidence, "fingerprint"> = {
    reviewedByActorId,
    completeRangeListenConfirmed: true,
    sourceFromAudiobookConfirmed: true,
    explicitContentDetected: false,
    unsuitableRetailPreviewContentDetected: false,
    approvedForRetailPreview: true,
    reviewedAt: input.safety.reviewedAt.toISOString(),
  };
  const safety = Object.freeze({
    ...safetyBase,
    fingerprint: safetyFingerprint(safetyBase),
  });
  assertSafetyEvidence(safety, selectedByActorId);

  const minimumTime = Math.max(
    Date.parse(approval.approvedAt),
    Date.parse(input.approvedSourceArtifact.updatedAt),
    Date.parse(input.policy.reviewedAt),
  );
  if (
    input.selection.selectedAt.getTime() < minimumTime
    || input.safety.reviewedAt.getTime()
      < input.selection.selectedAt.getTime()
    || createdAt.getTime() < input.safety.reviewedAt.getTime()
  ) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_CHRONOLOGY_INVALID",
    );
  }

  const derivedId = `retail_sample_plan_${stableHash({
    review: input.trackReview.fingerprint,
    source: input.approvedSourceArtifact.fingerprint,
    range: { relativeStartMs, relativeEndMs },
    selection: selection.fingerprint,
    safety: safety.fingerprint,
    policy: input.policy.fingerprint,
  }).slice(0, 24)}`;
  const partial: Omit<AudiobookRetailSamplePlan, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_SAMPLE_PLAN_SCHEMA_VERSION,
    id: requireIdentifier(
      input.id ?? derivedId,
      "AUDIOBOOK_RETAIL_SAMPLE_PLAN_ID_INVALID",
    ),
    projectId: input.trackPlan.projectId,
    bookId: input.trackPlan.bookId,
    distributor: "acx-audible",
    policy: Object.freeze({
      id: input.policy.id,
      externalVersion: input.policy.externalVersion,
      reviewedAt: input.policy.reviewedAt,
      expiresAt: input.policy.expiresAt,
      fingerprint: input.policy.fingerprint,
      maximumDurationMs: MAXIMUM_SAMPLE_DURATION_MS,
      explicitContentProhibited: true,
      humanContentSafetyReviewRequired: true,
    }),
    trackPlan: Object.freeze({
      id: input.trackPlan.id,
      fingerprint: input.trackPlan.fingerprint,
    }),
    encodeChainFingerprint: input.encodeChain.fingerprint,
    trackReview: Object.freeze({
      sessionId: input.trackReview.id,
      sessionRevision: input.trackReview.revision,
      sessionFingerprint: input.trackReview.fingerprint,
      approvalFingerprint: approval.fingerprint,
      approvedAt: approval.approvedAt,
    }),
    source: Object.freeze({
      trackOrdinal: ordinal,
      role: plannedTrack.role,
      fileName: plannedTrack.fileName,
      originalArtifactRevision: encodedTrack.artifact.payload.revision,
      originalArtifactFingerprint: encodedTrack.artifact.payload.fingerprint,
      approvedArtifactId: input.approvedSourceArtifact.id,
      approvedArtifactRevision: input.approvedSourceArtifact.revision,
      approvedArtifactFingerprint: input.approvedSourceArtifact.fingerprint,
      approvedArtifactContentHash:
        input.approvedSourceArtifact.integrity.contentHash,
      approvedArtifactByteCount:
        input.approvedSourceArtifact.integrity.byteCount,
      approvedArtifactReviewFingerprint:
        stableHash(input.approvedSourceArtifact.review),
    }),
    range: Object.freeze({
      relativeStartMs,
      relativeEndMs,
      durationMs,
      absoluteBookStartMs: plannedTrack.sourceStartMs + relativeStartMs,
      absoluteBookEndMs: plannedTrack.sourceStartMs + relativeEndMs,
    }),
    output: Object.freeze({
      fileName: "RetailSample.mp3",
      format: "mp3",
      codec: "mp3",
      bitRateMode: "cbr",
      bitRateKbps: input.policy.output.bitRateKbps,
      sampleRateHz: 44_100,
      channels: plannedTrack.output.channels,
    }),
    selection,
    safety,
    status: "ready-for-rendering",
    createdAt: createdAt.toISOString(),
    revision: 1,
  };
  const plan = Object.freeze({
    ...partial,
    fingerprint: planFingerprint(partial),
  });
  assertAudiobookRetailSamplePlan(plan);
  return plan;
}

export function assertAudiobookRetailSamplePlan(
  plan: AudiobookRetailSamplePlan,
): void {
  if (plan.schemaVersion !== AUDIOBOOK_RETAIL_SAMPLE_PLAN_SCHEMA_VERSION) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [plan.id, "AUDIOBOOK_RETAIL_SAMPLE_PLAN_ID_INVALID"],
    [plan.projectId, "AUDIOBOOK_RETAIL_SAMPLE_PROJECT_ID_INVALID"],
    [plan.bookId, "AUDIOBOOK_RETAIL_SAMPLE_BOOK_ID_INVALID"],
    [plan.policy.id, "AUDIOBOOK_RETAIL_SAMPLE_POLICY_ID_INVALID"],
    [plan.trackPlan.id, "AUDIOBOOK_RETAIL_SAMPLE_TRACK_PLAN_ID_INVALID"],
    [
      plan.trackReview.sessionId,
      "AUDIOBOOK_RETAIL_SAMPLE_TRACK_REVIEW_ID_INVALID",
    ],
    [
      plan.source.approvedArtifactId,
      "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_ARTIFACT_ID_INVALID",
    ],
  ] as const) requireIdentifier(value, code);
  if (plan.distributor !== "acx-audible") {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_DISTRIBUTOR_INVALID",
    );
  }
  for (const [value, code] of [
    [plan.policy.fingerprint, "AUDIOBOOK_RETAIL_SAMPLE_POLICY_HASH_INVALID"],
    [
      plan.trackPlan.fingerprint,
      "AUDIOBOOK_RETAIL_SAMPLE_TRACK_PLAN_HASH_INVALID",
    ],
    [
      plan.encodeChainFingerprint,
      "AUDIOBOOK_RETAIL_SAMPLE_CHAIN_HASH_INVALID",
    ],
    [
      plan.trackReview.sessionFingerprint,
      "AUDIOBOOK_RETAIL_SAMPLE_TRACK_REVIEW_HASH_INVALID",
    ],
    [
      plan.trackReview.approvalFingerprint,
      "AUDIOBOOK_RETAIL_SAMPLE_TRACK_APPROVAL_HASH_INVALID",
    ],
    [
      plan.source.originalArtifactFingerprint,
      "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_ORIGINAL_HASH_INVALID",
    ],
    [
      plan.source.approvedArtifactFingerprint,
      "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_APPROVED_HASH_INVALID",
    ],
    [
      plan.source.approvedArtifactContentHash,
      "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_CONTENT_HASH_INVALID",
    ],
    [
      plan.source.approvedArtifactReviewFingerprint,
      "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_REVIEW_HASH_INVALID",
    ],
  ] as const) requireHash(value, code);
  if (!plan.policy.externalVersion.trim()) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_POLICY_VERSION_INVALID",
    );
  }
  requireDate(
    plan.policy.reviewedAt,
    "AUDIOBOOK_RETAIL_SAMPLE_POLICY_DATE_INVALID",
  );
  requireDate(
    plan.policy.expiresAt,
    "AUDIOBOOK_RETAIL_SAMPLE_POLICY_DATE_INVALID",
  );
  if (
    plan.policy.maximumDurationMs !== MAXIMUM_SAMPLE_DURATION_MS
    || plan.policy.explicitContentProhibited !== true
    || plan.policy.humanContentSafetyReviewRequired !== true
  ) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_POLICY_REQUIREMENTS_INVALID",
    );
  }
  requireInteger(
    plan.trackReview.sessionRevision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_SAMPLE_TRACK_REVIEW_REVISION_INVALID",
  );
  requireDate(
    plan.trackReview.approvedAt,
    "AUDIOBOOK_RETAIL_SAMPLE_TRACK_APPROVAL_DATE_INVALID",
  );
  requireInteger(
    plan.source.trackOrdinal,
    1,
    MAXIMUM_TRACKS,
    "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_ORDINAL_INVALID",
  );
  if (!isNarrativeRole(plan.source.role)) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_NARRATIVE_SOURCE_REQUIRED",
    );
  }
  if (!FILE_NAME_PATTERN.test(plan.source.fileName)) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_FILE_NAME_INVALID",
    );
  }
  requireInteger(
    plan.source.originalArtifactRevision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_REVISION_INVALID",
  );
  requireInteger(
    plan.source.approvedArtifactRevision,
    plan.source.originalArtifactRevision + 1,
    plan.source.originalArtifactRevision + 1,
    "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_APPROVED_REVISION_INVALID",
  );
  requireInteger(
    plan.source.approvedArtifactByteCount,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_SIZE_INVALID",
  );
  requireInteger(
    plan.range.relativeStartMs,
    0,
    7_200_000,
    "AUDIOBOOK_RETAIL_SAMPLE_RANGE_INVALID",
  );
  requireInteger(
    plan.range.relativeEndMs,
    plan.range.relativeStartMs + 1,
    7_200_000,
    "AUDIOBOOK_RETAIL_SAMPLE_RANGE_INVALID",
  );
  requireInteger(
    plan.range.durationMs,
    1,
    MAXIMUM_SAMPLE_DURATION_MS,
    "AUDIOBOOK_RETAIL_SAMPLE_DURATION_INVALID",
  );
  if (
    plan.range.relativeEndMs - plan.range.relativeStartMs
      !== plan.range.durationMs
    || plan.range.absoluteBookEndMs - plan.range.absoluteBookStartMs
      !== plan.range.durationMs
  ) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_RANGE_MISMATCH",
    );
  }
  requireInteger(
    plan.range.absoluteBookStartMs,
    0,
    15 * 24 * 60 * 60 * 1_000,
    "AUDIOBOOK_RETAIL_SAMPLE_ABSOLUTE_RANGE_INVALID",
  );
  requireInteger(
    plan.range.absoluteBookEndMs,
    plan.range.absoluteBookStartMs + 1,
    15 * 24 * 60 * 60 * 1_000,
    "AUDIOBOOK_RETAIL_SAMPLE_ABSOLUTE_RANGE_INVALID",
  );
  if (
    plan.output.fileName !== "RetailSample.mp3"
    || plan.output.format !== "mp3"
    || plan.output.codec !== "mp3"
    || plan.output.bitRateMode !== "cbr"
    || ![192, 256, 320].includes(plan.output.bitRateKbps)
    || plan.output.sampleRateHz !== 44_100
    || (plan.output.channels !== 1 && plan.output.channels !== 2)
  ) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_OUTPUT_INVALID",
    );
  }
  assertSelectionEvidence(plan.selection);
  assertSafetyEvidence(plan.safety, plan.selection.selectedByActorId);
  if (
    Date.parse(plan.safety.reviewedAt) < Date.parse(plan.selection.selectedAt)
    || Date.parse(plan.createdAt) < Date.parse(plan.safety.reviewedAt)
    || Date.parse(plan.selection.selectedAt)
      < Date.parse(plan.trackReview.approvedAt)
  ) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_CHRONOLOGY_INVALID",
    );
  }
  if (plan.status !== "ready-for-rendering" || plan.revision !== 1) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_STATUS_INVALID",
    );
  }
  requireDate(plan.createdAt, "AUDIOBOOK_RETAIL_SAMPLE_DATE_INVALID");
  const { fingerprint, ...partial } = plan;
  if (planFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailSamplePlanMatchesSources(
  plan: AudiobookRetailSamplePlan,
  input: CreateAudiobookRetailSamplePlanInput,
): void {
  assertAudiobookRetailSamplePlan(plan);
  const createdAt = input.createdAt ?? new Date(plan.createdAt);
  const expected = createAudiobookRetailSamplePlan({
    ...input,
    id: plan.id,
    createdAt,
  });
  if (expected.fingerprint !== plan.fingerprint) {
    throw new AudiobookRetailSamplePlanError(
      "AUDIOBOOK_RETAIL_SAMPLE_SOURCE_MISMATCH",
    );
  }
}

export function audiobookRetailSamplePlanPublicView(
  plan: AudiobookRetailSamplePlan,
): AudiobookRetailSamplePlanPublicView {
  assertAudiobookRetailSamplePlan(plan);
  return Object.freeze({
    id: plan.id,
    bookId: plan.bookId,
    distributor: plan.distributor,
    policyVersion: plan.policy.externalVersion,
    sourceTrackOrdinal: plan.source.trackOrdinal,
    sourceRole: plan.source.role,
    sourceFileName: plan.source.fileName,
    relativeStartMs: plan.range.relativeStartMs,
    relativeEndMs: plan.range.relativeEndMs,
    durationMs: plan.range.durationMs,
    absoluteBookStartMs: plan.range.absoluteBookStartMs,
    absoluteBookEndMs: plan.range.absoluteBookEndMs,
    selectionPreference: plan.selection.selectionPreference,
    ...(plan.selection.exceptionReason
      ? { exceptionReason: plan.selection.exceptionReason }
      : {}),
    output: plan.output,
    contentSafetyApproved: true,
    status: plan.status,
    createdAt: plan.createdAt,
    fingerprint: plan.fingerprint,
  });
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<AudiobookRetailSamplePlan> {
  const plan = envelope.payload as unknown as AudiobookRetailSamplePlan;
  assertAudiobookRetailSamplePlan(plan);
  if (
    envelope.entityType !== AUDIOBOOK_RETAIL_SAMPLE_PLAN_ENTITY_TYPE
    || envelope.entityId !== plan.id
    || envelope.revision !== plan.revision
  ) {
    throw new AudiobookRetailSamplePlanStoreConflictError(
      "AUDIOBOOK_RETAIL_SAMPLE_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<AudiobookRetailSamplePlan>;
}

function payload(plan: AudiobookRetailSamplePlan): Record<string, unknown> {
  return plan as unknown as Record<string, unknown>;
}

export class FileAudiobookRetailSamplePlanStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    plan: AudiobookRetailSamplePlan,
    actorId: string,
  ): Promise<StoredEnvelope<AudiobookRetailSamplePlan>> {
    assertAudiobookRetailSamplePlan(plan);
    requireIdentifier(
      actorId,
      "AUDIOBOOK_RETAIL_SAMPLE_STORE_ACTOR_INVALID",
    );
    try {
      const existing = await this.read(plan.id);
      if (existing) {
        if (existing.payload.fingerprint === plan.fingerprint) return existing;
        throw new AudiobookRetailSamplePlanStoreConflictError(
          "AUDIOBOOK_RETAIL_SAMPLE_STORE_IDEMPOTENCY_CONFLICT",
        );
      }
      const envelope = toEnvelope(await this.#store.create(
        AUDIOBOOK_RETAIL_SAMPLE_PLAN_ENTITY_TYPE,
        plan.id,
        payload(plan),
        new Date(plan.createdAt),
      ));
      await this.#store.appendAuditEvent({
        actorId,
        action: "audiobook_retail_sample_plan.created",
        entityType: AUDIOBOOK_RETAIL_SAMPLE_PLAN_ENTITY_TYPE,
        entityId: plan.id,
        revision: envelope.revision,
        occurredAt: new Date(envelope.savedAt),
        metadata: {
          status: plan.status,
          sourceTrackOrdinal: plan.source.trackOrdinal,
          sourceRole: plan.source.role,
          durationMs: plan.range.durationMs,
          selectionPreference: plan.selection.selectionPreference,
          contentSafetyApproved: true,
        },
      });
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailSamplePlanStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(
    planId: string,
  ): Promise<StoredEnvelope<AudiobookRetailSamplePlan> | null> {
    requireIdentifier(
      planId,
      "AUDIOBOOK_RETAIL_SAMPLE_STORE_ID_INVALID",
    );
    const envelope = await this.#store.read<Record<string, unknown>>(
      AUDIOBOOK_RETAIL_SAMPLE_PLAN_ENTITY_TYPE,
      planId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(
    planId: string,
  ): Promise<StoredEnvelope<AudiobookRetailSamplePlan>> {
    const envelope = await this.read(planId);
    if (!envelope) {
      throw new AudiobookRetailSamplePlanStoreConflictError(
        "AUDIOBOOK_RETAIL_SAMPLE_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }
}
