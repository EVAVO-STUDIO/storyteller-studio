import {
  assertArtifactRecord,
  type ArtifactRecord,
} from "./artifact-registry.js";
import {
  assertAudiobookReferenceMasterChain,
  type AudiobookReferenceMasterChain,
} from "./audiobook-reference-master.js";
import {
  assertAudiobookReferenceMasterReviewSession,
  type AudiobookReferenceMasterReviewSession,
} from "./audiobook-reference-master-review.js";
import {
  assertAudiobookRetailNarrationEligibilityEvidence,
  assertCurrentAudiobookRetailEncodingPolicy,
  type AudiobookRetailBitRateKbps,
  type AudiobookRetailEncodingPolicy,
  type AudiobookRetailNarrationEligibilityEvidence,
  type AudiobookRetailNarrationSourceKind,
} from "./audiobook-retail-policy.js";
import {
  assertAudiobookSequence,
  type AudiobookSequence,
  type AudiobookSequenceComponent,
  type AudiobookSequenceComponentRole,
} from "./audiobook-sequence.js";
import { stableHash } from "./index.js";

export const AUDIOBOOK_RETAIL_TRACK_PLAN_SCHEMA_VERSION =
  "storyteller-audiobook-retail-track-plan-v1" as const;

export type AudiobookRetailTrackHeaderKind =
  | "opening-credit"
  | "prologue-title"
  | "chapter-title"
  | "epilogue-title"
  | "closing-credit";

export interface AudiobookRetailTrackOutput {
  format: "mp3";
  codec: "mp3";
  bitRateMode: "cbr";
  bitRateKbps: AudiobookRetailBitRateKbps;
  sampleRateHz: 44_100;
  channels: 1 | 2;
}

export interface AudiobookRetailTrackSourceSnapshot {
  componentOrdinal: number;
  componentFingerprint: string;
  artifactId: string;
  artifactRevision: number;
  artifactFingerprint: string;
  contentHash: string;
  byteCount: number;
}

export interface AudiobookRetailTrack {
  ordinal: number;
  role: AudiobookSequenceComponentRole;
  fileName: string;
  sourceStartMs: number;
  sourceEndMs: number;
  durationMs: number;
  source: AudiobookRetailTrackSourceSnapshot;
  headerKind: AudiobookRetailTrackHeaderKind;
  sectionHeaderRequired: true;
  sectionHeaderReviewedUnderReferenceApproval: true;
  secondaryHeaderRequired: false;
  output: AudiobookRetailTrackOutput;
  fingerprint: string;
}

export type AudiobookRetailTrackPlanBlocker =
  | Readonly<{
      kind: "reference-duration-drift";
      findingCode: "AUDIOBOOK_RETAIL_TRACK_REFERENCE_DURATION_DRIFT";
      expectedDurationMs: number;
      observedDurationMs: number;
      durationDriftMs: number;
      requiredAction: "sample-accurate-boundary-review";
      fingerprint: string;
    }>
  | Readonly<{
      kind: "source-sample-rate-conversion";
      findingCode: "AUDIOBOOK_RETAIL_TRACK_SOURCE_SAMPLE_RATE_CONVERSION_REQUIRED";
      sourceSampleRateHz: number;
      requiredSampleRateHz: 44_100;
      requiredAction: "approved-sample-rate-conversion-plan";
      fingerprint: string;
    }>
  | Readonly<{
      kind: "section-split-required";
      findingCode: "AUDIOBOOK_RETAIL_TRACK_SECTION_SPLIT_REQUIRED";
      componentOrdinal: number;
      role: "prologue" | "chapter" | "epilogue";
      durationMs: number;
      maximumFileDurationMs: 7_200_000;
      secondaryHeaderAudioRequired: true;
      requiredAction: "approved-secondary-header-and-split-plan";
      fingerprint: string;
    }>
  | Readonly<{
      kind: "credit-duration-exceeds-limit";
      findingCode: "AUDIOBOOK_RETAIL_TRACK_CREDIT_DURATION_EXCEEDS_LIMIT";
      componentOrdinal: number;
      role: "opening-credit" | "closing-credit";
      durationMs: number;
      maximumFileDurationMs: 7_200_000;
      requiredAction: "manual-credit-restructure";
      fingerprint: string;
    }>;

export interface AudiobookRetailTrackPlan {
  schemaVersion: typeof AUDIOBOOK_RETAIL_TRACK_PLAN_SCHEMA_VERSION;
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
  }>;
  narration: Readonly<{
    evidenceId: string;
    sourceKind: AudiobookRetailNarrationSourceKind;
    evidenceFingerprint: string;
    platformAuthorisationPresent: boolean;
  }>;
  sequence: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
    componentCount: number;
    chapterCount: number;
    expectedDurationMs: number;
    outputFingerprint: string;
  }>;
  referenceMaster: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
    contentHash: string;
    byteCount: number;
    expectedDurationMs: number;
    observedDurationMs: number;
    durationDriftMs: number;
  }>;
  review: Readonly<{
    sessionId: string;
    sessionRevision: number;
    sessionFingerprint: string;
    approvalFingerprint: string;
    approvedAt: string;
  }>;
  output: AudiobookRetailTrackOutput;
  tracks: readonly AudiobookRetailTrack[];
  blockers: readonly AudiobookRetailTrackPlanBlocker[];
  status: "ready-for-encoding" | "blocked";
  createdByActorId: string;
  createdAt: string;
  fingerprint: string;
}

export interface AudiobookRetailTrackPlanPublicBlocker {
  kind: AudiobookRetailTrackPlanBlocker["kind"];
  findingCode: AudiobookRetailTrackPlanBlocker["findingCode"];
  componentOrdinal?: number;
  role?: AudiobookSequenceComponentRole;
  durationMs?: number;
  requiredAction: AudiobookRetailTrackPlanBlocker["requiredAction"];
}

export interface AudiobookRetailTrackPlanPublicTrack {
  ordinal: number;
  role: AudiobookSequenceComponentRole;
  fileName: string;
  durationMs: number;
  headerKind: AudiobookRetailTrackHeaderKind;
  sectionHeaderRequired: true;
  output: AudiobookRetailTrackOutput;
}

export interface AudiobookRetailTrackPlanPublicView {
  id: string;
  bookId: string;
  distributor: "acx-audible";
  policyVersion: string;
  narrationSourceKind: AudiobookRetailNarrationSourceKind;
  output: AudiobookRetailTrackOutput;
  componentCount: number;
  chapterCount: number;
  trackCount: number;
  expectedDurationMs: number;
  observedDurationMs: number;
  tracks: readonly AudiobookRetailTrackPlanPublicTrack[];
  blockers: readonly AudiobookRetailTrackPlanPublicBlocker[];
  status: "ready-for-encoding" | "blocked";
  createdAt: string;
  fingerprint: string;
}

export class AudiobookRetailTrackPlanError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailTrackPlanError";
    this.code = code;
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const FILE_NAME_PATTERN = /^[A-Za-z0-9]+\.mp3$/u;
const MAX_COMPONENTS = 2_002;
const MAX_DURATION_MS = 15 * 24 * 60 * 60 * 1_000;
const REQUIRED_SAMPLE_RATE_HZ = 44_100 as const;
const MAXIMUM_FILE_DURATION_MS = 7_200_000 as const;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailTrackPlanError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailTrackPlanError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailTrackPlanError(code);
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
    throw new AudiobookRetailTrackPlanError(code);
  }
  return value;
}

function planFingerprint(
  plan: Omit<AudiobookRetailTrackPlan, "fingerprint">,
): string {
  return stableHash(plan);
}

function trackFingerprint(
  track: Omit<AudiobookRetailTrack, "fingerprint">,
): string {
  return stableHash(track);
}

function blockerFingerprint(
  blocker: Omit<AudiobookRetailTrackPlanBlocker, "fingerprint">,
): string {
  return stableHash(blocker);
}

function output(
  sequence: AudiobookSequence,
  policy: AudiobookRetailEncodingPolicy,
): AudiobookRetailTrackOutput {
  return Object.freeze({
    format: "mp3",
    codec: "mp3",
    bitRateMode: "cbr",
    bitRateKbps: policy.output.bitRateKbps,
    sampleRateHz: REQUIRED_SAMPLE_RATE_HZ,
    channels: sequence.output.channels,
  });
}

function padded(value: number): string {
  return value.toString(10).padStart(4, "0");
}

function headerKind(
  role: AudiobookSequenceComponentRole,
): AudiobookRetailTrackHeaderKind {
  switch (role) {
    case "opening-credit":
      return "opening-credit";
    case "prologue":
      return "prologue-title";
    case "chapter":
      return "chapter-title";
    case "epilogue":
      return "epilogue-title";
    case "closing-credit":
      return "closing-credit";
  }
}

function fileName(
  component: AudiobookSequenceComponent,
  chapterNumber: number,
): string {
  const prefix = padded(component.ordinal);
  switch (component.role) {
    case "opening-credit":
      return `${prefix}OpeningCredits.mp3`;
    case "prologue":
      return `${prefix}Prologue.mp3`;
    case "chapter":
      return `${prefix}Chapter${padded(chapterNumber)}.mp3`;
    case "epilogue":
      return `${prefix}Epilogue.mp3`;
    case "closing-credit":
      return `${prefix}ClosingCredits.mp3`;
  }
}

function sourceSnapshot(
  component: AudiobookSequenceComponent,
): AudiobookRetailTrackSourceSnapshot {
  return Object.freeze({
    componentOrdinal: component.ordinal,
    componentFingerprint: component.fingerprint,
    artifactId: component.artifact.id,
    artifactRevision: component.artifact.revision,
    artifactFingerprint: component.artifact.fingerprint,
    contentHash: component.artifact.contentHash,
    byteCount: component.artifact.byteCount,
  });
}

function createTrack(
  component: AudiobookSequenceComponent,
  chapterNumber: number,
  trackOutput: AudiobookRetailTrackOutput,
): AudiobookRetailTrack {
  const partial: Omit<AudiobookRetailTrack, "fingerprint"> = {
    ordinal: component.ordinal,
    role: component.role,
    fileName: fileName(component, chapterNumber),
    sourceStartMs: component.startMs,
    sourceEndMs: component.endMs,
    durationMs: component.durationMs,
    source: sourceSnapshot(component),
    headerKind: headerKind(component.role),
    sectionHeaderRequired: true,
    sectionHeaderReviewedUnderReferenceApproval: true,
    secondaryHeaderRequired: false,
    output: trackOutput,
  };
  return Object.freeze({
    ...partial,
    fingerprint: trackFingerprint(partial),
  });
}

function durationDriftBlocker(
  chain: AudiobookReferenceMasterChain,
): AudiobookRetailTrackPlanBlocker {
  const partial = {
    kind: "reference-duration-drift" as const,
    findingCode: "AUDIOBOOK_RETAIL_TRACK_REFERENCE_DURATION_DRIFT" as const,
    expectedDurationMs: chain.expectedDurationMs,
    observedDurationMs: chain.observedDurationMs,
    durationDriftMs: chain.durationDriftMs,
    requiredAction: "sample-accurate-boundary-review" as const,
  };
  return Object.freeze({
    ...partial,
    fingerprint: blockerFingerprint(partial),
  });
}

function sampleRateBlocker(
  sequence: AudiobookSequence,
): AudiobookRetailTrackPlanBlocker {
  const partial = {
    kind: "source-sample-rate-conversion" as const,
    findingCode:
      "AUDIOBOOK_RETAIL_TRACK_SOURCE_SAMPLE_RATE_CONVERSION_REQUIRED" as const,
    sourceSampleRateHz: sequence.output.sampleRateHz,
    requiredSampleRateHz: REQUIRED_SAMPLE_RATE_HZ,
    requiredAction: "approved-sample-rate-conversion-plan" as const,
  };
  return Object.freeze({
    ...partial,
    fingerprint: blockerFingerprint(partial),
  });
}

function componentDurationBlocker(
  component: AudiobookSequenceComponent,
): AudiobookRetailTrackPlanBlocker {
  if (
    component.role === "opening-credit"
    || component.role === "closing-credit"
  ) {
    const partial = {
      kind: "credit-duration-exceeds-limit" as const,
      findingCode:
        "AUDIOBOOK_RETAIL_TRACK_CREDIT_DURATION_EXCEEDS_LIMIT" as const,
      componentOrdinal: component.ordinal,
      role: component.role,
      durationMs: component.durationMs,
      maximumFileDurationMs: MAXIMUM_FILE_DURATION_MS,
      requiredAction: "manual-credit-restructure" as const,
    };
    return Object.freeze({
      ...partial,
      fingerprint: blockerFingerprint(partial),
    });
  }
  const partial = {
    kind: "section-split-required" as const,
    findingCode: "AUDIOBOOK_RETAIL_TRACK_SECTION_SPLIT_REQUIRED" as const,
    componentOrdinal: component.ordinal,
    role: component.role,
    durationMs: component.durationMs,
    maximumFileDurationMs: MAXIMUM_FILE_DURATION_MS,
    secondaryHeaderAudioRequired: true as const,
    requiredAction: "approved-secondary-header-and-split-plan" as const,
  };
  return Object.freeze({
    ...partial,
    fingerprint: blockerFingerprint(partial),
  });
}

function requireCurrentRights(
  artifact: ArtifactRecord,
  sequence: AudiobookSequence,
  now: Date,
): void {
  if (
    artifact.rights.rightsFingerprint !== sequence.rightsFingerprint
    || !artifact.rights.allowedUses.includes("audiobook")
  ) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_AUDIOBOOK_RIGHTS_REQUIRED",
    );
  }
  if (!artifact.rights.commercialUseApproved) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_COMMERCIAL_RIGHTS_REQUIRED",
    );
  }
  if (
    artifact.rights.expiresAt
    && Date.parse(artifact.rights.expiresAt) <= now.getTime()
  ) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_RIGHTS_EXPIRED",
    );
  }
  if (
    artifact.rights.deletionRequiredAt
    && Date.parse(artifact.rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_RETENTION_EXPIRED",
    );
  }
}

function assertApprovedReferenceArtifact(
  sequence: AudiobookSequence,
  chain: AudiobookReferenceMasterChain,
  session: AudiobookReferenceMasterReviewSession,
  artifact: ArtifactRecord,
  now: Date,
): void {
  assertArtifactRecord(artifact);
  const approval = session.approval;
  if (!approval) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_APPROVED_REVIEW_REQUIRED",
    );
  }
  if (
    artifact.kind !== "audiobook-reference-master"
    || artifact.projectId !== sequence.projectId
    || artifact.segmentId !== sequence.bookId
    || artifact.id !== session.referenceArtifact.id
    || artifact.id !== chain.referenceMaster.payload.id
    || artifact.revision !== approval.approvedArtifactRevision
    || artifact.revision !== session.referenceArtifact.revision + 1
    || artifact.fingerprint !== approval.approvedArtifactFingerprint
    || artifact.previousFingerprint !== session.referenceArtifact.fingerprint
    || artifact.integrity.contentHash !== session.referenceArtifact.contentHash
    || artifact.integrity.byteCount !== session.referenceArtifact.byteCount
    || artifact.integrity.contentHash
      !== chain.referenceMaster.payload.integrity.contentHash
    || artifact.integrity.byteCount
      !== chain.referenceMaster.payload.integrity.byteCount
    || artifact.provenance.sourceContentHash !== sequence.fingerprint
    || artifact.verification.status !== "verified"
    || artifact.verification.findings.some(
      (finding) => finding.severity === "error",
    )
    || artifact.review.status !== "approved"
    || artifact.review.reviewerId !== approval.approvedByActorId
    || artifact.review.decidedAt !== approval.approvedAt
    || stableHash(artifact.review) !== approval.artifactReviewFingerprint
    || artifact.quarantine !== undefined
    || artifact.release.status !== "unavailable"
  ) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_APPROVED_REFERENCE_MISMATCH",
    );
  }
  requireCurrentRights(artifact, sequence, now);
}

function assertAdmission(input: Readonly<{
  sequence: AudiobookSequence;
  referenceChain: AudiobookReferenceMasterChain;
  reviewSession: AudiobookReferenceMasterReviewSession;
  approvedReferenceArtifact: ArtifactRecord;
  policy: AudiobookRetailEncodingPolicy;
  narrationEligibility: AudiobookRetailNarrationEligibilityEvidence;
  now: Date;
}>): void {
  assertAudiobookSequence(input.sequence);
  assertAudiobookReferenceMasterChain(input.referenceChain);
  assertAudiobookReferenceMasterReviewSession(input.reviewSession);
  assertCurrentAudiobookRetailEncodingPolicy(input.policy, input.now);
  assertAudiobookRetailNarrationEligibilityEvidence(
    input.narrationEligibility,
    input.policy,
    input.now,
  );
  const sequence = input.sequence;
  const chain = input.referenceChain;
  const session = input.reviewSession;
  const approval = session.approval;
  if (
    session.status !== "approved"
    || !approval
    || session.projectId !== sequence.projectId
    || session.bookId !== sequence.bookId
    || session.sequence.id !== sequence.id
    || session.sequence.revision !== sequence.revision
    || session.sequence.fingerprint !== sequence.fingerprint
    || session.sequence.componentCount !== sequence.components.length
    || session.sequence.chapterCount !== sequence.chapterCount
    || session.sequence.totalDurationMs !== sequence.totalDurationMs
    || session.chainFingerprint !== chain.fingerprint
    || chain.sequenceId !== sequence.id
    || chain.sequenceRevision !== sequence.revision
    || chain.sequenceFingerprint !== sequence.fingerprint
    || chain.expectedDurationMs !== sequence.totalDurationMs
    || !chain.eligibleForReview
    || chain.findingCodes.length !== 0
    || !chain.postRenderEngineering.candidateEligible
  ) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_SCOPE_MISMATCH",
    );
  }
  if (
    input.policy.distributor !== "acx-audible"
    || input.policy.track.maximumFileDurationMs
      !== MAXIMUM_FILE_DURATION_MS
    || input.policy.output.sampleRateHz !== REQUIRED_SAMPLE_RATE_HZ
    || input.policy.output.bitRateMode !== "cbr"
    || input.policy.output.format !== "mp3"
  ) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_POLICY_UNSUPPORTED",
    );
  }
  if (
    input.narrationEligibility.projectId !== sequence.projectId
    || input.narrationEligibility.bookId !== sequence.bookId
    || input.narrationEligibility.distributor !== input.policy.distributor
    || input.narrationEligibility.policyFingerprint
      !== input.policy.fingerprint
    || input.narrationEligibility.rightsFingerprint
      !== sequence.rightsFingerprint
    || input.narrationEligibility.status !== "eligible"
  ) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_NARRATION_SCOPE_MISMATCH",
    );
  }
  assertApprovedReferenceArtifact(
    sequence,
    chain,
    session,
    input.approvedReferenceArtifact,
    input.now,
  );
}

function chronology(input: Readonly<{
  sequence: AudiobookSequence;
  reviewSession: AudiobookReferenceMasterReviewSession;
  approvedReferenceArtifact: ArtifactRecord;
  policy: AudiobookRetailEncodingPolicy;
  narrationEligibility: AudiobookRetailNarrationEligibilityEvidence;
  createdAt: Date;
}>): void {
  if (Number.isNaN(input.createdAt.getTime())) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_DATE_INVALID",
    );
  }
  const approval = input.reviewSession.approval;
  if (!approval) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_APPROVED_REVIEW_REQUIRED",
    );
  }
  const minimum = Math.max(
    Date.parse(input.sequence.updatedAt),
    Date.parse(input.approvedReferenceArtifact.updatedAt),
    Date.parse(input.policy.reviewedAt),
    Date.parse(input.narrationEligibility.attestedAt),
    Date.parse(approval.approvedAt),
  );
  if (input.createdAt.getTime() < minimum) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_CHRONOLOGY_INVALID",
    );
  }
}

export function createAcxAudiobookRetailTrackPlan(input: Readonly<{
  id?: string;
  sequence: AudiobookSequence;
  referenceChain: AudiobookReferenceMasterChain;
  reviewSession: AudiobookReferenceMasterReviewSession;
  approvedReferenceArtifact: ArtifactRecord;
  policy: AudiobookRetailEncodingPolicy;
  narrationEligibility: AudiobookRetailNarrationEligibilityEvidence;
  createdByActorId: string;
  createdAt?: Date;
}>): AudiobookRetailTrackPlan {
  const createdAt = input.createdAt ?? new Date();
  assertAdmission({ ...input, now: createdAt });
  chronology({ ...input, createdAt });
  const trackOutput = output(input.sequence, input.policy);
  const blockers: AudiobookRetailTrackPlanBlocker[] = [];
  if (input.referenceChain.durationDriftMs !== 0) {
    blockers.push(durationDriftBlocker(input.referenceChain));
  }
  if (input.sequence.output.sampleRateHz !== REQUIRED_SAMPLE_RATE_HZ) {
    blockers.push(sampleRateBlocker(input.sequence));
  }
  for (const component of input.sequence.components) {
    if (component.durationMs > MAXIMUM_FILE_DURATION_MS) {
      blockers.push(componentDurationBlocker(component));
    }
  }

  const tracks: AudiobookRetailTrack[] = [];
  if (blockers.length === 0) {
    let chapterNumber = 0;
    for (const component of input.sequence.components) {
      if (component.role === "chapter") chapterNumber += 1;
      tracks.push(createTrack(component, chapterNumber, trackOutput));
    }
  }
  const derivedId = `retail_track_plan_${stableHash({
    sequenceFingerprint: input.sequence.fingerprint,
    referenceArtifactFingerprint: input.approvedReferenceArtifact.fingerprint,
    reviewFingerprint: input.reviewSession.fingerprint,
    policyFingerprint: input.policy.fingerprint,
    narrationEligibilityFingerprint: input.narrationEligibility.fingerprint,
    blockerFingerprints: blockers.map((blocker) => blocker.fingerprint),
  }).slice(0, 24)}`;
  const partial: Omit<AudiobookRetailTrackPlan, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_TRACK_PLAN_SCHEMA_VERSION,
    id: requireIdentifier(
      input.id ?? derivedId,
      "AUDIOBOOK_RETAIL_TRACK_PLAN_ID_INVALID",
    ),
    projectId: input.sequence.projectId,
    bookId: input.sequence.bookId,
    distributor: "acx-audible",
    policy: Object.freeze({
      id: input.policy.id,
      externalVersion: input.policy.externalVersion,
      reviewedAt: input.policy.reviewedAt,
      expiresAt: input.policy.expiresAt,
      fingerprint: input.policy.fingerprint,
    }),
    narration: Object.freeze({
      evidenceId: input.narrationEligibility.id,
      sourceKind: input.narrationEligibility.sourceKind,
      evidenceFingerprint: input.narrationEligibility.fingerprint,
      platformAuthorisationPresent:
        input.narrationEligibility.platformAuthorisation !== undefined,
    }),
    sequence: Object.freeze({
      id: input.sequence.id,
      revision: input.sequence.revision,
      fingerprint: input.sequence.fingerprint,
      componentCount: input.sequence.components.length,
      chapterCount: input.sequence.chapterCount,
      expectedDurationMs: input.sequence.totalDurationMs,
      outputFingerprint: stableHash(input.sequence.output),
    }),
    referenceMaster: Object.freeze({
      id: input.approvedReferenceArtifact.id,
      revision: input.approvedReferenceArtifact.revision,
      fingerprint: input.approvedReferenceArtifact.fingerprint,
      contentHash: input.approvedReferenceArtifact.integrity.contentHash,
      byteCount: input.approvedReferenceArtifact.integrity.byteCount,
      expectedDurationMs: input.referenceChain.expectedDurationMs,
      observedDurationMs: input.referenceChain.observedDurationMs,
      durationDriftMs: input.referenceChain.durationDriftMs,
    }),
    review: Object.freeze({
      sessionId: input.reviewSession.id,
      sessionRevision: input.reviewSession.revision,
      sessionFingerprint: input.reviewSession.fingerprint,
      approvalFingerprint: input.reviewSession.approval!.fingerprint,
      approvedAt: input.reviewSession.approval!.approvedAt,
    }),
    output: trackOutput,
    tracks: Object.freeze(tracks),
    blockers: Object.freeze(blockers),
    status: blockers.length === 0 ? "ready-for-encoding" : "blocked",
    createdByActorId: requireIdentifier(
      input.createdByActorId,
      "AUDIOBOOK_RETAIL_TRACK_ACTOR_ID_INVALID",
    ),
    createdAt: createdAt.toISOString(),
  };
  const plan = Object.freeze({
    ...partial,
    fingerprint: planFingerprint(partial),
  });
  assertAudiobookRetailTrackPlan(plan);
  return plan;
}

function assertOutput(value: AudiobookRetailTrackOutput): void {
  if (
    value.format !== "mp3"
    || value.codec !== "mp3"
    || value.bitRateMode !== "cbr"
    || ![192, 256, 320].includes(value.bitRateKbps)
    || value.sampleRateHz !== REQUIRED_SAMPLE_RATE_HZ
    || (value.channels !== 1 && value.channels !== 2)
  ) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_OUTPUT_INVALID",
    );
  }
}

function assertSource(value: AudiobookRetailTrackSourceSnapshot): void {
  requireInteger(
    value.componentOrdinal,
    1,
    MAX_COMPONENTS,
    "AUDIOBOOK_RETAIL_TRACK_SOURCE_ORDINAL_INVALID",
  );
  requireHash(
    value.componentFingerprint,
    "AUDIOBOOK_RETAIL_TRACK_SOURCE_COMPONENT_HASH_INVALID",
  );
  requireIdentifier(
    value.artifactId,
    "AUDIOBOOK_RETAIL_TRACK_SOURCE_ARTIFACT_ID_INVALID",
  );
  requireInteger(
    value.artifactRevision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_TRACK_SOURCE_ARTIFACT_REVISION_INVALID",
  );
  requireHash(
    value.artifactFingerprint,
    "AUDIOBOOK_RETAIL_TRACK_SOURCE_ARTIFACT_HASH_INVALID",
  );
  requireHash(
    value.contentHash,
    "AUDIOBOOK_RETAIL_TRACK_SOURCE_CONTENT_HASH_INVALID",
  );
  requireInteger(
    value.byteCount,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_TRACK_SOURCE_SIZE_INVALID",
  );
}

function assertTrack(track: AudiobookRetailTrack): void {
  requireInteger(
    track.ordinal,
    1,
    MAX_COMPONENTS,
    "AUDIOBOOK_RETAIL_TRACK_ORDINAL_INVALID",
  );
  if (
    track.role !== "opening-credit"
    && track.role !== "prologue"
    && track.role !== "chapter"
    && track.role !== "epilogue"
    && track.role !== "closing-credit"
  ) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_ROLE_INVALID",
    );
  }
  if (!FILE_NAME_PATTERN.test(track.fileName)) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_FILE_NAME_INVALID",
    );
  }
  requireInteger(
    track.sourceStartMs,
    0,
    MAX_DURATION_MS,
    "AUDIOBOOK_RETAIL_TRACK_SOURCE_START_INVALID",
  );
  requireInteger(
    track.sourceEndMs,
    1,
    MAX_DURATION_MS,
    "AUDIOBOOK_RETAIL_TRACK_SOURCE_END_INVALID",
  );
  requireInteger(
    track.durationMs,
    1,
    MAXIMUM_FILE_DURATION_MS,
    "AUDIOBOOK_RETAIL_TRACK_DURATION_INVALID",
  );
  if (
    track.sourceEndMs - track.sourceStartMs !== track.durationMs
    || track.source.componentOrdinal !== track.ordinal
  ) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_SOURCE_RANGE_INVALID",
    );
  }
  assertSource(track.source);
  if (track.headerKind !== headerKind(track.role)) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_HEADER_KIND_INVALID",
    );
  }
  if (
    track.sectionHeaderRequired !== true
    || track.sectionHeaderReviewedUnderReferenceApproval !== true
    || track.secondaryHeaderRequired !== false
  ) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_HEADER_EVIDENCE_INVALID",
    );
  }
  assertOutput(track.output);
  const { fingerprint, ...partial } = track;
  if (trackFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_FINGERPRINT_INVALID",
    );
  }
}

function assertBlocker(blocker: AudiobookRetailTrackPlanBlocker): void {
  switch (blocker.kind) {
    case "reference-duration-drift":
      if (
        blocker.findingCode
          !== "AUDIOBOOK_RETAIL_TRACK_REFERENCE_DURATION_DRIFT"
        || blocker.expectedDurationMs < 1
        || blocker.observedDurationMs < 1
        || blocker.durationDriftMs
          !== Math.abs(
            blocker.observedDurationMs - blocker.expectedDurationMs,
          )
        || blocker.durationDriftMs < 1
        || blocker.requiredAction !== "sample-accurate-boundary-review"
      ) {
        throw new AudiobookRetailTrackPlanError(
          "AUDIOBOOK_RETAIL_TRACK_DURATION_BLOCKER_INVALID",
        );
      }
      break;
    case "source-sample-rate-conversion":
      if (
        blocker.findingCode
          !== "AUDIOBOOK_RETAIL_TRACK_SOURCE_SAMPLE_RATE_CONVERSION_REQUIRED"
        || !Number.isSafeInteger(blocker.sourceSampleRateHz)
        || blocker.sourceSampleRateHz < 8_000
        || blocker.sourceSampleRateHz > 384_000
        || blocker.sourceSampleRateHz === REQUIRED_SAMPLE_RATE_HZ
        || blocker.requiredSampleRateHz !== REQUIRED_SAMPLE_RATE_HZ
        || blocker.requiredAction
          !== "approved-sample-rate-conversion-plan"
      ) {
        throw new AudiobookRetailTrackPlanError(
          "AUDIOBOOK_RETAIL_TRACK_SAMPLE_RATE_BLOCKER_INVALID",
        );
      }
      break;
    case "section-split-required":
      if (
        blocker.findingCode
          !== "AUDIOBOOK_RETAIL_TRACK_SECTION_SPLIT_REQUIRED"
        || !["prologue", "chapter", "epilogue"].includes(blocker.role)
        || blocker.durationMs <= MAXIMUM_FILE_DURATION_MS
        || blocker.maximumFileDurationMs !== MAXIMUM_FILE_DURATION_MS
        || blocker.secondaryHeaderAudioRequired !== true
        || blocker.requiredAction
          !== "approved-secondary-header-and-split-plan"
      ) {
        throw new AudiobookRetailTrackPlanError(
          "AUDIOBOOK_RETAIL_TRACK_SPLIT_BLOCKER_INVALID",
        );
      }
      requireInteger(
        blocker.componentOrdinal,
        1,
        MAX_COMPONENTS,
        "AUDIOBOOK_RETAIL_TRACK_BLOCKER_COMPONENT_INVALID",
      );
      break;
    case "credit-duration-exceeds-limit":
      if (
        blocker.findingCode
          !== "AUDIOBOOK_RETAIL_TRACK_CREDIT_DURATION_EXCEEDS_LIMIT"
        || !["opening-credit", "closing-credit"].includes(blocker.role)
        || blocker.durationMs <= MAXIMUM_FILE_DURATION_MS
        || blocker.maximumFileDurationMs !== MAXIMUM_FILE_DURATION_MS
        || blocker.requiredAction !== "manual-credit-restructure"
      ) {
        throw new AudiobookRetailTrackPlanError(
          "AUDIOBOOK_RETAIL_TRACK_CREDIT_BLOCKER_INVALID",
        );
      }
      requireInteger(
        blocker.componentOrdinal,
        1,
        MAX_COMPONENTS,
        "AUDIOBOOK_RETAIL_TRACK_BLOCKER_COMPONENT_INVALID",
      );
      break;
  }
  const { fingerprint, ...partial } = blocker;
  if (blockerFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_BLOCKER_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailTrackPlan(
  plan: AudiobookRetailTrackPlan,
): void {
  if (plan.schemaVersion !== AUDIOBOOK_RETAIL_TRACK_PLAN_SCHEMA_VERSION) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_PLAN_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [plan.id, "AUDIOBOOK_RETAIL_TRACK_PLAN_ID_INVALID"],
    [plan.projectId, "AUDIOBOOK_RETAIL_TRACK_PROJECT_ID_INVALID"],
    [plan.bookId, "AUDIOBOOK_RETAIL_TRACK_BOOK_ID_INVALID"],
    [plan.policy.id, "AUDIOBOOK_RETAIL_TRACK_POLICY_ID_INVALID"],
    [plan.narration.evidenceId, "AUDIOBOOK_RETAIL_TRACK_NARRATION_ID_INVALID"],
    [plan.sequence.id, "AUDIOBOOK_RETAIL_TRACK_SEQUENCE_ID_INVALID"],
    [plan.referenceMaster.id, "AUDIOBOOK_RETAIL_TRACK_REFERENCE_ID_INVALID"],
    [plan.review.sessionId, "AUDIOBOOK_RETAIL_TRACK_REVIEW_ID_INVALID"],
    [plan.createdByActorId, "AUDIOBOOK_RETAIL_TRACK_ACTOR_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  if (plan.distributor !== "acx-audible") {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_DISTRIBUTOR_INVALID",
    );
  }
  requireDate(
    plan.policy.reviewedAt,
    "AUDIOBOOK_RETAIL_TRACK_POLICY_DATE_INVALID",
  );
  requireDate(
    plan.policy.expiresAt,
    "AUDIOBOOK_RETAIL_TRACK_POLICY_DATE_INVALID",
  );
  requireHash(
    plan.policy.fingerprint,
    "AUDIOBOOK_RETAIL_TRACK_POLICY_HASH_INVALID",
  );
  if (!plan.policy.externalVersion.trim()) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_POLICY_VERSION_INVALID",
    );
  }
  if (
    plan.narration.sourceKind !== "human-performance"
    && plan.narration.sourceKind !== "synthetic-voice"
    && plan.narration.sourceKind !== "mixed-performance"
  ) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_NARRATION_KIND_INVALID",
    );
  }
  requireHash(
    plan.narration.evidenceFingerprint,
    "AUDIOBOOK_RETAIL_TRACK_NARRATION_HASH_INVALID",
  );
  requireInteger(
    plan.sequence.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_TRACK_SEQUENCE_REVISION_INVALID",
  );
  requireHash(
    plan.sequence.fingerprint,
    "AUDIOBOOK_RETAIL_TRACK_SEQUENCE_HASH_INVALID",
  );
  requireInteger(
    plan.sequence.componentCount,
    3,
    MAX_COMPONENTS,
    "AUDIOBOOK_RETAIL_TRACK_COMPONENT_COUNT_INVALID",
  );
  requireInteger(
    plan.sequence.chapterCount,
    1,
    MAX_COMPONENTS - 2,
    "AUDIOBOOK_RETAIL_TRACK_CHAPTER_COUNT_INVALID",
  );
  if (plan.sequence.componentCount !== plan.sequence.chapterCount + 2) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_SEQUENCE_COUNTS_MISMATCH",
    );
  }
  requireInteger(
    plan.sequence.expectedDurationMs,
    1,
    MAX_DURATION_MS,
    "AUDIOBOOK_RETAIL_TRACK_EXPECTED_DURATION_INVALID",
  );
  requireHash(
    plan.sequence.outputFingerprint,
    "AUDIOBOOK_RETAIL_TRACK_SOURCE_OUTPUT_HASH_INVALID",
  );
  requireInteger(
    plan.referenceMaster.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_TRACK_REFERENCE_REVISION_INVALID",
  );
  for (const [value, code] of [
    [
      plan.referenceMaster.fingerprint,
      "AUDIOBOOK_RETAIL_TRACK_REFERENCE_HASH_INVALID",
    ],
    [
      plan.referenceMaster.contentHash,
      "AUDIOBOOK_RETAIL_TRACK_REFERENCE_CONTENT_HASH_INVALID",
    ],
    [
      plan.review.sessionFingerprint,
      "AUDIOBOOK_RETAIL_TRACK_REVIEW_HASH_INVALID",
    ],
    [
      plan.review.approvalFingerprint,
      "AUDIOBOOK_RETAIL_TRACK_APPROVAL_HASH_INVALID",
    ],
  ] as const) requireHash(value, code);
  requireInteger(
    plan.referenceMaster.byteCount,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_TRACK_REFERENCE_SIZE_INVALID",
  );
  for (const [value, code] of [
    [
      plan.referenceMaster.expectedDurationMs,
      "AUDIOBOOK_RETAIL_TRACK_REFERENCE_EXPECTED_DURATION_INVALID",
    ],
    [
      plan.referenceMaster.observedDurationMs,
      "AUDIOBOOK_RETAIL_TRACK_REFERENCE_OBSERVED_DURATION_INVALID",
    ],
  ] as const) requireInteger(value, 1, MAX_DURATION_MS, code);
  requireInteger(
    plan.referenceMaster.durationDriftMs,
    0,
    MAX_DURATION_MS,
    "AUDIOBOOK_RETAIL_TRACK_REFERENCE_DRIFT_INVALID",
  );
  if (
    plan.referenceMaster.durationDriftMs
      !== Math.abs(
        plan.referenceMaster.observedDurationMs
          - plan.referenceMaster.expectedDurationMs,
      )
    || plan.referenceMaster.expectedDurationMs
      !== plan.sequence.expectedDurationMs
  ) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_REFERENCE_DURATION_MISMATCH",
    );
  }
  requireInteger(
    plan.review.sessionRevision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_TRACK_REVIEW_REVISION_INVALID",
  );
  requireDate(
    plan.review.approvedAt,
    "AUDIOBOOK_RETAIL_TRACK_APPROVAL_DATE_INVALID",
  );
  requireDate(plan.createdAt, "AUDIOBOOK_RETAIL_TRACK_DATE_INVALID");
  if (Date.parse(plan.createdAt) < Date.parse(plan.review.approvedAt)) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_CHRONOLOGY_INVALID",
    );
  }
  assertOutput(plan.output);
  if (!Array.isArray(plan.tracks) || plan.tracks.length > MAX_COMPONENTS) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACKS_INVALID",
    );
  }
  if (!Array.isArray(plan.blockers) || plan.blockers.length > MAX_COMPONENTS + 2) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_BLOCKERS_INVALID",
    );
  }
  const fileNames = new Set<string>();
  let previousEnd = 0;
  for (const [index, track] of plan.tracks.entries()) {
    assertTrack(track);
    if (
      track.ordinal !== index + 1
      || track.sourceStartMs !== previousEnd
      || stableHash(track.output) !== stableHash(plan.output)
      || fileNames.has(track.fileName)
    ) {
      throw new AudiobookRetailTrackPlanError(
        "AUDIOBOOK_RETAIL_TRACK_ORDER_INVALID",
      );
    }
    if (
      (index === 0 && track.role !== "opening-credit")
      || (
        index === plan.tracks.length - 1
        && track.role !== "closing-credit"
      )
      || (
        index > 0
        && index < plan.tracks.length - 1
        && (
          track.role === "opening-credit"
          || track.role === "closing-credit"
        )
      )
    ) {
      throw new AudiobookRetailTrackPlanError(
        "AUDIOBOOK_RETAIL_TRACK_ROLE_ORDER_INVALID",
      );
    }
    fileNames.add(track.fileName);
    previousEnd = track.sourceEndMs;
  }
  const blockerFingerprints = new Set<string>();
  for (const blocker of plan.blockers) {
    assertBlocker(blocker);
    if (blockerFingerprints.has(blocker.fingerprint)) {
      throw new AudiobookRetailTrackPlanError(
        "AUDIOBOOK_RETAIL_TRACK_BLOCKER_DUPLICATE",
      );
    }
    blockerFingerprints.add(blocker.fingerprint);
  }
  if (plan.status === "ready-for-encoding") {
    if (
      plan.blockers.length !== 0
      || plan.tracks.length !== plan.sequence.componentCount
      || previousEnd !== plan.referenceMaster.observedDurationMs
      || plan.referenceMaster.durationDriftMs !== 0
    ) {
      throw new AudiobookRetailTrackPlanError(
        "AUDIOBOOK_RETAIL_TRACK_READY_STATE_INVALID",
      );
    }
  } else if (plan.status === "blocked") {
    if (plan.blockers.length === 0 || plan.tracks.length !== 0) {
      throw new AudiobookRetailTrackPlanError(
        "AUDIOBOOK_RETAIL_TRACK_BLOCKED_STATE_INVALID",
      );
    }
  } else {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_STATUS_INVALID",
    );
  }
  const { fingerprint, ...partial } = plan;
  if (planFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_PLAN_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailTrackPlanMatchesSources(
  plan: AudiobookRetailTrackPlan,
  input: Readonly<{
    sequence: AudiobookSequence;
    referenceChain: AudiobookReferenceMasterChain;
    reviewSession: AudiobookReferenceMasterReviewSession;
    approvedReferenceArtifact: ArtifactRecord;
    policy: AudiobookRetailEncodingPolicy;
    narrationEligibility: AudiobookRetailNarrationEligibilityEvidence;
    now?: Date;
  }>,
): void {
  assertAudiobookRetailTrackPlan(plan);
  const now = input.now ?? new Date(plan.createdAt);
  const expected = createAcxAudiobookRetailTrackPlan({
    id: plan.id,
    ...input,
    createdByActorId: plan.createdByActorId,
    createdAt: new Date(plan.createdAt),
  });
  assertCurrentAudiobookRetailEncodingPolicy(input.policy, now);
  assertAudiobookRetailNarrationEligibilityEvidence(
    input.narrationEligibility,
    input.policy,
    now,
  );
  if (expected.fingerprint !== plan.fingerprint) {
    throw new AudiobookRetailTrackPlanError(
      "AUDIOBOOK_RETAIL_TRACK_PLAN_SOURCE_MISMATCH",
    );
  }
}

export function audiobookRetailTrackPlanPublicView(
  plan: AudiobookRetailTrackPlan,
): AudiobookRetailTrackPlanPublicView {
  assertAudiobookRetailTrackPlan(plan);
  return Object.freeze({
    id: plan.id,
    bookId: plan.bookId,
    distributor: plan.distributor,
    policyVersion: plan.policy.externalVersion,
    narrationSourceKind: plan.narration.sourceKind,
    output: plan.output,
    componentCount: plan.sequence.componentCount,
    chapterCount: plan.sequence.chapterCount,
    trackCount: plan.tracks.length,
    expectedDurationMs: plan.referenceMaster.expectedDurationMs,
    observedDurationMs: plan.referenceMaster.observedDurationMs,
    tracks: Object.freeze(plan.tracks.map((track) => Object.freeze({
      ordinal: track.ordinal,
      role: track.role,
      fileName: track.fileName,
      durationMs: track.durationMs,
      headerKind: track.headerKind,
      sectionHeaderRequired: true as const,
      output: track.output,
    }))),
    blockers: Object.freeze(plan.blockers.map((blocker) => {
      switch (blocker.kind) {
        case "reference-duration-drift":
          return Object.freeze({
            kind: blocker.kind,
            findingCode: blocker.findingCode,
            requiredAction: blocker.requiredAction,
          });
        case "source-sample-rate-conversion":
          return Object.freeze({
            kind: blocker.kind,
            findingCode: blocker.findingCode,
            requiredAction: blocker.requiredAction,
          });
        case "section-split-required":
        case "credit-duration-exceeds-limit":
          return Object.freeze({
            kind: blocker.kind,
            findingCode: blocker.findingCode,
            componentOrdinal: blocker.componentOrdinal,
            role: blocker.role,
            durationMs: blocker.durationMs,
            requiredAction: blocker.requiredAction,
          });
      }
    })),
    status: plan.status,
    createdAt: plan.createdAt,
    fingerprint: plan.fingerprint,
  });
}
