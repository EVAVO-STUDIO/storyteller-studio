import {
  assertAudioEngineeringEvidence,
  type AudioEngineeringEvidence,
} from "./audio-engineering.js";
import {
  assertArtifactRecord,
  type ArtifactRecord,
} from "./artifact-registry.js";
import { stableHash } from "./index.js";

export const CHAPTER_ASSEMBLY_SCHEMA_VERSION = "storyteller-chapter-assembly-v1" as const;

export interface ChapterAssemblyPolicy {
  id: string;
  version: string;
  maximumTrimMs: number;
  maximumGapMs: number;
  maximumFadeMs: number;
  requireApprovedCandidates: true;
  fingerprint: string;
}

export interface ChapterAssemblyOutput {
  format: "wav";
  sampleRateHz: number;
  channels: 1 | 2;
  bitDepth: 16 | 24 | 32;
}

export interface ChapterAssemblyArtifactSnapshot {
  id: string;
  fingerprint: string;
  contentHash: string;
  byteCount: number;
}

export interface ChapterAssemblySegment {
  ordinal: number;
  segmentId: string;
  sourceStart: number;
  sourceEnd: number;
  takeId: string;
  audio: ChapterAssemblyArtifactSnapshot;
  transcript: ChapterAssemblyArtifactSnapshot;
  engineering: Readonly<{
    artifact: ChapterAssemblyArtifactSnapshot;
    evidenceFingerprint: string;
    profileFingerprint: string;
  }>;
  generationRequestHash: string;
  rightsFingerprint: string;
  sourceDurationMs: number;
  trimStartMs: number;
  trimEndMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  gapBeforeMs: number;
  gapAfterMs: number;
  timelineStartMs: number;
  timelineEndMs: number;
  renderedDurationMs: number;
  fingerprint: string;
}

export interface ChapterAssemblyPlan {
  schemaVersion: typeof CHAPTER_ASSEMBLY_SCHEMA_VERSION;
  id: string;
  projectId: string;
  chapterId: string;
  manuscriptSourceHash: string;
  policy: ChapterAssemblyPolicy;
  output: ChapterAssemblyOutput;
  segments: readonly ChapterAssemblySegment[];
  sourceDurationMs: number;
  renderedDurationMs: number;
  createdByActorId: string;
  createdAt: string;
  fingerprint: string;
}

export interface ChapterAssemblySegmentInput {
  ordinal: number;
  segmentId: string;
  sourceStart: number;
  sourceEnd: number;
  audioCandidate: ArtifactRecord;
  transcriptArtifact: ArtifactRecord;
  engineeringArtifact: ArtifactRecord;
  engineeringEvidence: AudioEngineeringEvidence;
  trimStartMs?: number;
  trimEndMs?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  gapBeforeMs?: number;
  gapAfterMs?: number;
}

export interface CreateChapterAssemblyInput {
  id: string;
  projectId: string;
  chapterId: string;
  manuscriptSourceHash: string;
  policy: Omit<ChapterAssemblyPolicy, "fingerprint">;
  output: ChapterAssemblyOutput;
  segments: readonly ChapterAssemblySegmentInput[];
  createdByActorId: string;
  createdAt?: Date;
}

export interface ChapterAssemblyPublicView {
  id: string;
  chapterId: string;
  segmentCount: number;
  output: ChapterAssemblyOutput;
  policyId: string;
  policyVersion: string;
  sourceDurationMs: number;
  renderedDurationMs: number;
  createdAt: string;
  fingerprint: string;
}

export class ChapterAssemblyError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "ChapterAssemblyError";
    this.code = code;
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_SEGMENTS = 20_000;
const MAX_CHAPTER_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new ChapterAssemblyError(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new ChapterAssemblyError(code);
  return value;
}

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ChapterAssemblyError(code);
  }
  return value;
}

function artifactSnapshot(record: ArtifactRecord): ChapterAssemblyArtifactSnapshot {
  return Object.freeze({
    id: record.id,
    fingerprint: record.fingerprint,
    contentHash: record.integrity.contentHash,
    byteCount: record.integrity.byteCount,
  });
}

function policyBase(policy: Omit<ChapterAssemblyPolicy, "fingerprint">): Readonly<Record<string, unknown>> {
  return {
    id: policy.id,
    version: policy.version,
    maximumTrimMs: policy.maximumTrimMs,
    maximumGapMs: policy.maximumGapMs,
    maximumFadeMs: policy.maximumFadeMs,
    requireApprovedCandidates: policy.requireApprovedCandidates,
  };
}

export function createChapterAssemblyPolicy(
  input: Readonly<Omit<ChapterAssemblyPolicy, "fingerprint">>,
): ChapterAssemblyPolicy {
  requireIdentifier(input.id, "CHAPTER_ASSEMBLY_POLICY_ID_INVALID");
  if (!SAFE_VERSION.test(input.version)) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_POLICY_VERSION_INVALID");
  }
  requireInteger(input.maximumTrimMs, 0, 60_000, "CHAPTER_ASSEMBLY_POLICY_TRIM_INVALID");
  requireInteger(input.maximumGapMs, 0, 30_000, "CHAPTER_ASSEMBLY_POLICY_GAP_INVALID");
  requireInteger(input.maximumFadeMs, 0, 10_000, "CHAPTER_ASSEMBLY_POLICY_FADE_INVALID");
  if (input.requireApprovedCandidates !== true) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_APPROVED_CANDIDATES_REQUIRED");
  }
  return Object.freeze({
    ...input,
    fingerprint: stableHash(policyBase(input)),
  });
}

function requireVerified(record: ArtifactRecord, code: string): void {
  assertArtifactRecord(record);
  if (
    record.verification.status !== "verified"
    || record.verification.findings.some((finding) => finding.severity === "error")
    || record.quarantine
  ) {
    throw new ChapterAssemblyError(code);
  }
}

function requireSameScope(
  audio: ArtifactRecord,
  related: ArtifactRecord,
  code: string,
): void {
  if (
    related.projectId !== audio.projectId
    || related.jobId !== audio.jobId
    || related.segmentId !== audio.segmentId
    || related.takeId !== audio.takeId
  ) {
    throw new ChapterAssemblyError(code);
  }
}

function requireParent(record: ArtifactRecord, parentId: string, code: string): void {
  if (!record.provenance.parentArtifactIds.includes(parentId)) {
    throw new ChapterAssemblyError(code);
  }
}

function requireRightsAvailable(record: ArtifactRecord, now: Date): void {
  if (!record.rights.allowedUses.includes("audiobook")) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_AUDIOBOOK_RIGHTS_REQUIRED");
  }
  if (!record.rights.commercialUseApproved) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_COMMERCIAL_RIGHTS_REQUIRED");
  }
  if (record.rights.expiresAt && Date.parse(record.rights.expiresAt) <= now.getTime()) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_RIGHTS_EXPIRED");
  }
  if (
    record.rights.deletionRequiredAt
    && Date.parse(record.rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_RETENTION_EXPIRED");
  }
}

function segmentFingerprint(
  segment: Omit<ChapterAssemblySegment, "fingerprint">,
): string {
  return stableHash(segment);
}

function planFingerprint(plan: Omit<ChapterAssemblyPlan, "fingerprint">): string {
  return stableHash(plan);
}

function validateOutput(output: ChapterAssemblyOutput): void {
  if (output.format !== "wav") throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_OUTPUT_FORMAT_INVALID");
  requireInteger(output.sampleRateHz, 8_000, 384_000, "CHAPTER_ASSEMBLY_OUTPUT_RATE_INVALID");
  if (output.channels !== 1 && output.channels !== 2) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_OUTPUT_CHANNELS_INVALID");
  }
  if (![16, 24, 32].includes(output.bitDepth)) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_OUTPUT_DEPTH_INVALID");
  }
}

function prepareSegment(
  input: ChapterAssemblySegmentInput,
  context: Readonly<{
    projectId: string;
    manuscriptSourceHash: string;
    policy: ChapterAssemblyPolicy;
    output: ChapterAssemblyOutput;
    now: Date;
    cursorMs: number;
  }>,
): ChapterAssemblySegment {
  const { audioCandidate, transcriptArtifact, engineeringArtifact, engineeringEvidence } = input;
  requireInteger(input.ordinal, 1, MAX_SEGMENTS, "CHAPTER_ASSEMBLY_SEGMENT_ORDINAL_INVALID");
  requireIdentifier(input.segmentId, "CHAPTER_ASSEMBLY_SEGMENT_ID_INVALID");
  requireInteger(input.sourceStart, 0, Number.MAX_SAFE_INTEGER, "CHAPTER_ASSEMBLY_SOURCE_START_INVALID");
  requireInteger(input.sourceEnd, input.sourceStart + 1, Number.MAX_SAFE_INTEGER, "CHAPTER_ASSEMBLY_SOURCE_END_INVALID");

  requireVerified(audioCandidate, "CHAPTER_ASSEMBLY_AUDIO_NOT_VERIFIED");
  requireVerified(transcriptArtifact, "CHAPTER_ASSEMBLY_TRANSCRIPT_NOT_VERIFIED");
  requireVerified(engineeringArtifact, "CHAPTER_ASSEMBLY_ENGINEERING_NOT_VERIFIED");
  assertAudioEngineeringEvidence(engineeringEvidence);

  if (audioCandidate.kind !== "audio-candidate") {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_AUDIO_CANDIDATE_REQUIRED");
  }
  if (transcriptArtifact.kind !== "transcript") {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_TRANSCRIPT_REQUIRED");
  }
  if (engineeringArtifact.kind !== "audio-analysis") {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_ENGINEERING_ARTIFACT_REQUIRED");
  }
  if (audioCandidate.review.status !== "approved") {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_AUDIO_REVIEW_APPROVAL_REQUIRED");
  }
  if (
    audioCandidate.projectId !== context.projectId
    || audioCandidate.segmentId !== input.segmentId
    || !audioCandidate.takeId
  ) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_AUDIO_SCOPE_MISMATCH");
  }
  requireSameScope(audioCandidate, transcriptArtifact, "CHAPTER_ASSEMBLY_TRANSCRIPT_SCOPE_MISMATCH");
  requireSameScope(audioCandidate, engineeringArtifact, "CHAPTER_ASSEMBLY_ENGINEERING_SCOPE_MISMATCH");
  requireParent(transcriptArtifact, audioCandidate.id, "CHAPTER_ASSEMBLY_TRANSCRIPT_PARENT_MISMATCH");
  requireParent(engineeringArtifact, audioCandidate.id, "CHAPTER_ASSEMBLY_ENGINEERING_PARENT_MISMATCH");

  if (
    audioCandidate.provenance.sourceContentHash !== context.manuscriptSourceHash
    || transcriptArtifact.provenance.sourceContentHash !== context.manuscriptSourceHash
  ) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_MANUSCRIPT_BINDING_MISMATCH");
  }
  const requestHash = audioCandidate.provenance.generationRequestHash;
  if (
    !requestHash
    || transcriptArtifact.provenance.generationRequestHash !== requestHash
    || engineeringArtifact.provenance.generationRequestHash !== requestHash
  ) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_REQUEST_BINDING_MISMATCH");
  }
  if (
    engineeringEvidence.inputContentHash !== audioCandidate.integrity.contentHash
    || engineeringEvidence.inputByteCount !== audioCandidate.integrity.byteCount
    || engineeringArtifact.provenance.sourceContentHash !== audioCandidate.integrity.contentHash
  ) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_ENGINEERING_CONTENT_MISMATCH");
  }
  if (!engineeringEvidence.eligible) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_ENGINEERING_INELIGIBLE");
  }
  if (
    engineeringEvidence.metrics.sampleRateHz !== context.output.sampleRateHz
    || engineeringEvidence.metrics.channels !== context.output.channels
  ) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_OUTPUT_PROFILE_MISMATCH");
  }

  const rightsFingerprint = audioCandidate.rights.rightsFingerprint;
  for (const artifact of [audioCandidate, transcriptArtifact, engineeringArtifact]) {
    requireRightsAvailable(artifact, context.now);
    if (artifact.rights.rightsFingerprint !== rightsFingerprint) {
      throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_RIGHTS_SCOPE_MISMATCH");
    }
  }

  const sourceDurationMs = Math.round(engineeringEvidence.probe.durationSeconds * 1_000);
  requireInteger(sourceDurationMs, 1, MAX_CHAPTER_DURATION_MS, "CHAPTER_ASSEMBLY_DURATION_INVALID");
  const trimStartMs = input.trimStartMs ?? 0;
  const trimEndMs = input.trimEndMs ?? 0;
  const fadeInMs = input.fadeInMs ?? 0;
  const fadeOutMs = input.fadeOutMs ?? 0;
  const gapBeforeMs = input.gapBeforeMs ?? 0;
  const gapAfterMs = input.gapAfterMs ?? 0;
  for (const [value, maximum, code] of [
    [trimStartMs, context.policy.maximumTrimMs, "CHAPTER_ASSEMBLY_TRIM_START_INVALID"],
    [trimEndMs, context.policy.maximumTrimMs, "CHAPTER_ASSEMBLY_TRIM_END_INVALID"],
    [fadeInMs, context.policy.maximumFadeMs, "CHAPTER_ASSEMBLY_FADE_IN_INVALID"],
    [fadeOutMs, context.policy.maximumFadeMs, "CHAPTER_ASSEMBLY_FADE_OUT_INVALID"],
    [gapBeforeMs, context.policy.maximumGapMs, "CHAPTER_ASSEMBLY_GAP_BEFORE_INVALID"],
    [gapAfterMs, context.policy.maximumGapMs, "CHAPTER_ASSEMBLY_GAP_AFTER_INVALID"],
  ] as const) requireInteger(value, 0, maximum, code);

  const renderedDurationMs = sourceDurationMs - trimStartMs - trimEndMs;
  if (renderedDurationMs < 1) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_TRIM_CONSUMES_AUDIO");
  }
  if (fadeInMs + fadeOutMs > renderedDurationMs) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_FADES_EXCEED_AUDIO");
  }
  const timelineStartMs = context.cursorMs + gapBeforeMs;
  const timelineEndMs = timelineStartMs + renderedDurationMs;
  if (timelineEndMs + gapAfterMs > MAX_CHAPTER_DURATION_MS) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_TOTAL_DURATION_EXCEEDED");
  }

  const partial: Omit<ChapterAssemblySegment, "fingerprint"> = {
    ordinal: input.ordinal,
    segmentId: input.segmentId,
    sourceStart: input.sourceStart,
    sourceEnd: input.sourceEnd,
    takeId: audioCandidate.takeId,
    audio: artifactSnapshot(audioCandidate),
    transcript: artifactSnapshot(transcriptArtifact),
    engineering: Object.freeze({
      artifact: artifactSnapshot(engineeringArtifact),
      evidenceFingerprint: engineeringEvidence.fingerprint,
      profileFingerprint: engineeringEvidence.profile.fingerprint,
    }),
    generationRequestHash: requestHash,
    rightsFingerprint,
    sourceDurationMs,
    trimStartMs,
    trimEndMs,
    fadeInMs,
    fadeOutMs,
    gapBeforeMs,
    gapAfterMs,
    timelineStartMs,
    timelineEndMs,
    renderedDurationMs,
  };
  return Object.freeze({
    ...partial,
    fingerprint: segmentFingerprint(partial),
  });
}

export function createChapterAssemblyPlan(
  input: CreateChapterAssemblyInput,
): ChapterAssemblyPlan {
  requireIdentifier(input.id, "CHAPTER_ASSEMBLY_ID_INVALID");
  requireIdentifier(input.projectId, "CHAPTER_ASSEMBLY_PROJECT_ID_INVALID");
  requireIdentifier(input.chapterId, "CHAPTER_ASSEMBLY_CHAPTER_ID_INVALID");
  requireIdentifier(input.createdByActorId, "CHAPTER_ASSEMBLY_ACTOR_ID_INVALID");
  requireHash(input.manuscriptSourceHash, "CHAPTER_ASSEMBLY_MANUSCRIPT_HASH_INVALID");
  validateOutput(input.output);
  if (!Array.isArray(input.segments) || input.segments.length === 0 || input.segments.length > MAX_SEGMENTS) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_SEGMENTS_INVALID");
  }
  const createdAt = input.createdAt ?? new Date();
  if (Number.isNaN(createdAt.getTime())) throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_DATE_INVALID");
  const policy = createChapterAssemblyPolicy(input.policy);
  const segments: ChapterAssemblySegment[] = [];
  const ids = new Set<string>();
  const takes = new Set<string>();
  const audioIds = new Set<string>();
  let cursorMs = 0;
  let previousSourceEnd = -1;

  for (const [index, segmentInput] of input.segments.entries()) {
    if (segmentInput.ordinal !== index + 1) {
      throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_SEGMENT_ORDER_INVALID");
    }
    if (segmentInput.sourceStart < previousSourceEnd) {
      throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_SOURCE_OVERLAP");
    }
    const segment = prepareSegment(segmentInput, {
      projectId: input.projectId,
      manuscriptSourceHash: input.manuscriptSourceHash,
      policy,
      output: input.output,
      now: createdAt,
      cursorMs,
    });
    if (ids.has(segment.segmentId)) throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_SEGMENT_DUPLICATE");
    if (takes.has(segment.takeId)) throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_TAKE_DUPLICATE");
    if (audioIds.has(segment.audio.id)) throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_AUDIO_DUPLICATE");
    ids.add(segment.segmentId);
    takes.add(segment.takeId);
    audioIds.add(segment.audio.id);
    segments.push(segment);
    previousSourceEnd = segment.sourceEnd;
    cursorMs = segment.timelineEndMs + segment.gapAfterMs;
  }

  const sourceDurationMs = segments.reduce((total, segment) => total + segment.sourceDurationMs, 0);
  const partial: Omit<ChapterAssemblyPlan, "fingerprint"> = {
    schemaVersion: CHAPTER_ASSEMBLY_SCHEMA_VERSION,
    id: input.id,
    projectId: input.projectId,
    chapterId: input.chapterId,
    manuscriptSourceHash: input.manuscriptSourceHash,
    policy,
    output: Object.freeze({ ...input.output }),
    segments: Object.freeze(segments),
    sourceDurationMs,
    renderedDurationMs: cursorMs,
    createdByActorId: input.createdByActorId,
    createdAt: createdAt.toISOString(),
  };
  const plan = Object.freeze({
    ...partial,
    fingerprint: planFingerprint(partial),
  });
  assertChapterAssemblyPlan(plan);
  return plan;
}

export function assertChapterAssemblyPlan(plan: ChapterAssemblyPlan): void {
  if (plan.schemaVersion !== CHAPTER_ASSEMBLY_SCHEMA_VERSION) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(plan.id, "CHAPTER_ASSEMBLY_ID_INVALID");
  requireIdentifier(plan.projectId, "CHAPTER_ASSEMBLY_PROJECT_ID_INVALID");
  requireIdentifier(plan.chapterId, "CHAPTER_ASSEMBLY_CHAPTER_ID_INVALID");
  requireIdentifier(plan.createdByActorId, "CHAPTER_ASSEMBLY_ACTOR_ID_INVALID");
  requireHash(plan.manuscriptSourceHash, "CHAPTER_ASSEMBLY_MANUSCRIPT_HASH_INVALID");
  validateOutput(plan.output);
  const policy = createChapterAssemblyPolicy({
    id: plan.policy.id,
    version: plan.policy.version,
    maximumTrimMs: plan.policy.maximumTrimMs,
    maximumGapMs: plan.policy.maximumGapMs,
    maximumFadeMs: plan.policy.maximumFadeMs,
    requireApprovedCandidates: plan.policy.requireApprovedCandidates,
  });
  if (policy.fingerprint !== plan.policy.fingerprint) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_POLICY_FINGERPRINT_MISMATCH");
  }
  if (!Array.isArray(plan.segments) || plan.segments.length === 0 || plan.segments.length > MAX_SEGMENTS) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_SEGMENTS_INVALID");
  }
  let cursorMs = 0;
  let sourceDurationMs = 0;
  let previousSourceEnd = -1;
  for (const [index, segment] of plan.segments.entries()) {
    if (segment.ordinal !== index + 1) throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_SEGMENT_ORDER_INVALID");
    requireIdentifier(segment.segmentId, "CHAPTER_ASSEMBLY_SEGMENT_ID_INVALID");
    requireIdentifier(segment.takeId, "CHAPTER_ASSEMBLY_TAKE_ID_INVALID");
    for (const artifact of [segment.audio, segment.transcript, segment.engineering.artifact]) {
      requireIdentifier(artifact.id, "CHAPTER_ASSEMBLY_ARTIFACT_ID_INVALID");
      requireHash(artifact.fingerprint, "CHAPTER_ASSEMBLY_ARTIFACT_FINGERPRINT_INVALID");
      requireHash(artifact.contentHash, "CHAPTER_ASSEMBLY_ARTIFACT_HASH_INVALID");
      requireInteger(artifact.byteCount, 1, Number.MAX_SAFE_INTEGER, "CHAPTER_ASSEMBLY_ARTIFACT_SIZE_INVALID");
    }
    requireHash(segment.engineering.evidenceFingerprint, "CHAPTER_ASSEMBLY_EVIDENCE_FINGERPRINT_INVALID");
    requireHash(segment.engineering.profileFingerprint, "CHAPTER_ASSEMBLY_PROFILE_FINGERPRINT_INVALID");
    requireHash(segment.generationRequestHash, "CHAPTER_ASSEMBLY_REQUEST_HASH_INVALID");
    requireHash(segment.rightsFingerprint, "CHAPTER_ASSEMBLY_RIGHTS_HASH_INVALID");
    if (segment.sourceStart < previousSourceEnd || segment.sourceEnd <= segment.sourceStart) {
      throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_SOURCE_ORDER_INVALID");
    }
    const expectedStart = cursorMs + segment.gapBeforeMs;
    if (segment.timelineStartMs !== expectedStart) {
      throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_TIMELINE_START_INVALID");
    }
    if (segment.renderedDurationMs !== segment.sourceDurationMs - segment.trimStartMs - segment.trimEndMs) {
      throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_RENDERED_DURATION_INVALID");
    }
    if (segment.timelineEndMs !== segment.timelineStartMs + segment.renderedDurationMs) {
      throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_TIMELINE_END_INVALID");
    }
    const { fingerprint, ...partial } = segment;
    if (segmentFingerprint(partial) !== fingerprint) {
      throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_SEGMENT_FINGERPRINT_MISMATCH");
    }
    sourceDurationMs += segment.sourceDurationMs;
    cursorMs = segment.timelineEndMs + segment.gapAfterMs;
    previousSourceEnd = segment.sourceEnd;
  }
  if (sourceDurationMs !== plan.sourceDurationMs || cursorMs !== plan.renderedDurationMs) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_TOTALS_MISMATCH");
  }
  const { fingerprint, ...partial } = plan;
  if (planFingerprint(partial) !== fingerprint) {
    throw new ChapterAssemblyError("CHAPTER_ASSEMBLY_FINGERPRINT_MISMATCH");
  }
}

export function chapterAssemblyPublicView(
  plan: ChapterAssemblyPlan,
): ChapterAssemblyPublicView {
  assertChapterAssemblyPlan(plan);
  return Object.freeze({
    id: plan.id,
    chapterId: plan.chapterId,
    segmentCount: plan.segments.length,
    output: plan.output,
    policyId: plan.policy.id,
    policyVersion: plan.policy.version,
    sourceDurationMs: plan.sourceDurationMs,
    renderedDurationMs: plan.renderedDurationMs,
    createdAt: plan.createdAt,
    fingerprint: plan.fingerprint,
  });
}
