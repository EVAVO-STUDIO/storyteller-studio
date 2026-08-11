import type { FileArtifactRegistry } from "./artifact-store.js";
import {
  assertArtifactRecord,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import {
  approveAudiobookReferenceMasterReview,
  assertAudiobookReferenceMasterReviewSession,
  createAudiobookReferenceMasterReviewSession,
  recordAudiobookReferenceMasterReview,
  type AudiobookReferenceMasterReviewApprovalResult,
  type AudiobookReferenceMasterReviewSession,
} from "./audiobook-reference-master-review.js";
import {
  assertAudiobookReferenceMasterChain,
  ingestAudiobookReferenceMaster,
  type AudiobookReferenceMasterChain,
} from "./audiobook-reference-master.js";
import {
  assertAudiobookRenderEvidence,
  type AudiobookRenderEvidence,
  type AudiobookRenderResult,
} from "./audiobook-render.js";
import {
  assertAudiobookSequence,
  createAudiobookSequence,
  type AudiobookSequence,
} from "./audiobook-sequence.js";
import type { GenerationAudioEngineeringPolicy } from "./generation-audio-engineering.js";
import { stableHash } from "./index.js";
import {
  assertAdmittedNarratorBookChapterSequence,
  type AdmittedNarratorBookChapterSequence,
} from "./narrator-book-sequence-admission.js";
import {
  admittedNarratorBookCreditArtifact,
  assertAdmittedNarratorBookCreditDelivery,
  type AdmittedNarratorBookCreditDelivery,
} from "./narrator-credit-admission.js";
import {
  assertAdmittedNarratorCasting,
  type AdmittedNarratorCasting,
} from "./narrator-casting-admission.js";
import {
  assertExactNarratorVoicePin,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";
import type { FilePrivateObjectStore } from "./private-object-store.js";

export const ADMITTED_NARRATOR_AUDIOBOOK_SEQUENCE_SCHEMA =
  "storyteller-admitted-narrator-audiobook-sequence-v1" as const;
export const ADMITTED_NARRATOR_REFERENCE_MASTER_SCHEMA =
  "storyteller-admitted-narrator-reference-master-v1" as const;
export const ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_BINDING_SCHEMA =
  "storyteller-admitted-narrator-whole-book-review-binding-v1" as const;
export const ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_APPROVAL_SCHEMA =
  "storyteller-admitted-narrator-whole-book-review-approval-v1" as const;

export interface AdmittedNarratorAudiobookSequence {
  schemaVersion: typeof ADMITTED_NARRATOR_AUDIOBOOK_SEQUENCE_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  admittedCasting: AdmittedNarratorCasting;
  chapters: AdmittedNarratorBookChapterSequence;
  opening: AdmittedNarratorBookCreditDelivery;
  closing: AdmittedNarratorBookCreditDelivery;
  chapterArtifacts: readonly ArtifactRecord[];
  sequence: AudiobookSequence;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  creditNarrationAdmissionComplete: true;
  masteredChapterListeningComplete: true;
  completeBookListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface AdmittedNarratorAudiobookSequencePublicView {
  bookId: string;
  chapterCount: number;
  componentCount: number;
  totalDurationMs: number;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  creditNarrationAdmissionComplete: true;
  masteredChapterListeningComplete: true;
  completeBookListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface AdmittedNarratorAudiobookReferenceMaster {
  schemaVersion: typeof ADMITTED_NARRATOR_REFERENCE_MASTER_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  audiobook: AdmittedNarratorAudiobookSequence;
  renderEvidence: AudiobookRenderEvidence;
  renderEvidenceFingerprint: string;
  chain: AudiobookReferenceMasterChain;
  referenceArtifact: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
    contentHash: string;
    byteCount: number;
  }>;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  eligibleForContinuousWholeBookReview: boolean;
  completeBookListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface AdmittedNarratorWholeBookReviewBinding {
  schemaVersion: typeof ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_BINDING_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  reference: AdmittedNarratorAudiobookReferenceMaster;
  session: AudiobookReferenceMasterReviewSession;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  revision: number;
  previousFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  completeBookListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface AdmittedNarratorWholeBookReviewApproval {
  schemaVersion: typeof ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_APPROVAL_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  binding: AdmittedNarratorWholeBookReviewBinding;
  session: AudiobookReferenceMasterReviewSession;
  approvedArtifact: ArtifactRecord;
  approvedAt: string;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  completeBookListeningApproval: true;
  titleNarratorApproval: false;
  eligibleForRetailEncoding: true;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface AdmittedNarratorWholeBookPublicView {
  bookId: string;
  referenceArtifactId: string;
  referenceArtifactRevision: number;
  componentCount: number;
  chapterCount: number;
  totalDurationMs: number;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  completeBookListeningApproval: boolean;
  titleNarratorApproval: false;
  eligibleForRetailEncoding: boolean;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export class AdmittedNarratorAudiobookError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AdmittedNarratorAudiobookError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new AdmittedNarratorAudiobookError(code);
  }
  return value;
}

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new AdmittedNarratorAudiobookError(code);
  }
  return value;
}

function requirePositiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AdmittedNarratorAudiobookError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new AdmittedNarratorAudiobookError(code);
  }
  return value;
}

function sequenceBase(
  value: Omit<AdmittedNarratorAudiobookSequence, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function referenceBase(
  value: Omit<AdmittedNarratorAudiobookReferenceMaster, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function reviewBindingBase(
  value: Omit<AdmittedNarratorWholeBookReviewBinding, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function reviewApprovalBase(
  value: Omit<AdmittedNarratorWholeBookReviewApproval, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function assertSameCasting(
  admittedCasting: AdmittedNarratorCasting,
  credit: AdmittedNarratorBookCreditDelivery,
): void {
  assertAdmittedNarratorBookCreditDelivery(credit);
  if (
    credit.projectId !== admittedCasting.projectId
    || credit.profileAdmissionHash !== admittedCasting.profileAdmission.admissionHash
    || credit.admittedCastingFingerprint !== admittedCasting.fingerprint
    || credit.castingFingerprint !== admittedCasting.casting.fingerprint
  ) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_AUDIOBOOK_CREDIT_CASTING_MISMATCH",
    );
  }
  assertExactNarratorVoicePin(admittedCasting.casting.voice, credit.voice);
}

function assertChapterArtifacts(
  chapters: AdmittedNarratorBookChapterSequence,
  artifacts: readonly ArtifactRecord[],
): void {
  if (!Array.isArray(artifacts) || artifacts.length !== chapters.chapters.length) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_AUDIOBOOK_CHAPTER_ARTIFACT_COUNT_MISMATCH",
    );
  }
  const byId = new Map<string, ArtifactRecord>();
  for (const artifact of artifacts) {
    assertArtifactRecord(artifact);
    if (byId.has(artifact.id)) {
      throw new AdmittedNarratorAudiobookError(
        "ADMITTED_NARRATOR_AUDIOBOOK_CHAPTER_ARTIFACT_DUPLICATE",
      );
    }
    byId.set(artifact.id, artifact);
  }
  for (const chapter of chapters.chapters) {
    const snapshot = chapter.approval.approval.approvedArtifact;
    const artifact = byId.get(snapshot.id);
    if (
      !artifact
      || artifact.revision !== snapshot.revision
      || artifact.fingerprint !== snapshot.fingerprint
      || artifact.integrity.contentHash !== snapshot.contentHash
      || artifact.integrity.byteCount !== snapshot.byteCount
    ) {
      throw new AdmittedNarratorAudiobookError(
        "ADMITTED_NARRATOR_AUDIOBOOK_CHAPTER_ARTIFACT_MISMATCH",
      );
    }
  }
}

function recomputeAudiobookSequence(
  value: AdmittedNarratorAudiobookSequence,
): AudiobookSequence {
  return createAudiobookSequence({
    id: value.sequence.id,
    projectId: value.projectId,
    bookId: value.bookId,
    opening: {
      delivery: value.opening.delivery,
      artifact: admittedNarratorBookCreditArtifact(value.opening),
    },
    chapters: value.chapters.sequence.sequence,
    chapterArtifacts: value.chapterArtifacts,
    closing: {
      delivery: value.closing.delivery,
      artifact: admittedNarratorBookCreditArtifact(value.closing),
    },
    createdByActorId: value.sequence.createdByActorId,
    createdAt: new Date(value.sequence.updatedAt),
  });
}

function assertAudiobookLineage(
  value: AdmittedNarratorAudiobookSequence,
): void {
  assertAdmittedNarratorCasting(value.admittedCasting);
  assertAdmittedNarratorBookChapterSequence(value.chapters);
  assertSameCasting(value.admittedCasting, value.opening);
  assertSameCasting(value.admittedCasting, value.closing);
  assertAudiobookSequence(value.sequence);
  assertChapterArtifacts(value.chapters, value.chapterArtifacts);
  const admitted = value.admittedCasting;
  const technicalChapters = value.chapters.sequence.sequence;
  assertExactNarratorVoicePin(admitted.casting.voice, value.voice);
  if (
    value.projectId !== admitted.projectId
    || value.projectId !== value.chapters.projectId
    || value.bookId !== value.chapters.bookId
    || value.bookId !== value.opening.bookId
    || value.bookId !== value.closing.bookId
    || value.opening.creditKind !== "opening"
    || value.closing.creditKind !== "closing"
    || value.profileAdmissionHash !== admitted.profileAdmission.admissionHash
    || value.admittedCastingFingerprint !== admitted.fingerprint
    || value.castingFingerprint !== admitted.casting.fingerprint
    || value.chapters.profileAdmissionHash !== value.profileAdmissionHash
    || value.chapters.admittedCastingFingerprint !== value.admittedCastingFingerprint
    || value.chapters.castingFingerprint !== value.castingFingerprint
    || value.sequence.chapterSequenceFingerprint !== technicalChapters.fingerprint
    || value.sequence.openingDeliveryFingerprint !== value.opening.delivery.fingerprint
    || value.sequence.closingDeliveryFingerprint !== value.closing.delivery.fingerprint
    || value.sequence.fingerprint !== recomputeAudiobookSequence(value).fingerprint
    || value.totalProductionJobCount
      !== value.chapters.totalProductionJobCount + 2
  ) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_AUDIOBOOK_SEQUENCE_LINEAGE_MISMATCH",
    );
  }
  if (
    value.narratorAdmissionComplete !== true
    || value.creditNarrationAdmissionComplete !== true
    || value.masteredChapterListeningComplete !== true
    || value.completeBookListeningApproval !== false
    || value.titleNarratorApproval !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_AUDIOBOOK_SEQUENCE_AUTHORITY_INVALID",
    );
  }
}

export function createAdmittedNarratorAudiobookSequence(input: Readonly<{
  id: string;
  chapters: AdmittedNarratorBookChapterSequence;
  opening: AdmittedNarratorBookCreditDelivery;
  closing: AdmittedNarratorBookCreditDelivery;
  chapterArtifacts: readonly ArtifactRecord[];
  createdByActorId: string;
  createdAt?: Date;
}>): AdmittedNarratorAudiobookSequence {
  assertAdmittedNarratorBookChapterSequence(input.chapters);
  const admittedCasting = input.chapters.admittedCasting;
  assertSameCasting(admittedCasting, input.opening);
  assertSameCasting(admittedCasting, input.closing);
  assertChapterArtifacts(input.chapters, input.chapterArtifacts);
  const sequence = createAudiobookSequence({
    id: input.id,
    projectId: input.chapters.projectId,
    bookId: input.chapters.bookId,
    opening: {
      delivery: input.opening.delivery,
      artifact: admittedNarratorBookCreditArtifact(input.opening),
    },
    chapters: input.chapters.sequence.sequence,
    chapterArtifacts: input.chapterArtifacts,
    closing: {
      delivery: input.closing.delivery,
      artifact: admittedNarratorBookCreditArtifact(input.closing),
    },
    createdByActorId: input.createdByActorId,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  });
  const partial: Omit<AdmittedNarratorAudiobookSequence, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_AUDIOBOOK_SEQUENCE_SCHEMA,
    projectId: input.chapters.projectId,
    bookId: input.chapters.bookId,
    profileAdmissionHash: input.chapters.profileAdmissionHash,
    admittedCastingFingerprint: input.chapters.admittedCastingFingerprint,
    castingFingerprint: input.chapters.castingFingerprint,
    voice: Object.freeze({ ...input.chapters.voice }),
    admittedCasting,
    chapters: input.chapters,
    opening: input.opening,
    closing: input.closing,
    chapterArtifacts: Object.freeze([...input.chapterArtifacts]),
    sequence,
    totalProductionJobCount: input.chapters.totalProductionJobCount + 2,
    narratorAdmissionComplete: true,
    creditNarrationAdmissionComplete: true,
    masteredChapterListeningComplete: true,
    completeBookListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const result = Object.freeze({
    ...partial,
    fingerprint: stableHash(sequenceBase(partial)),
  });
  assertAdmittedNarratorAudiobookSequence(result);
  return result;
}

export function assertAdmittedNarratorAudiobookSequence(
  value: AdmittedNarratorAudiobookSequence,
): void {
  if (value.schemaVersion !== ADMITTED_NARRATOR_AUDIOBOOK_SEQUENCE_SCHEMA) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_AUDIOBOOK_SEQUENCE_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    value.projectId,
    "ADMITTED_NARRATOR_AUDIOBOOK_SEQUENCE_PROJECT_INVALID",
  );
  requireIdentifier(
    value.bookId,
    "ADMITTED_NARRATOR_AUDIOBOOK_SEQUENCE_BOOK_INVALID",
  );
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
  ]) requireHash(hash, "ADMITTED_NARRATOR_AUDIOBOOK_SEQUENCE_HASH_INVALID");
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_AUDIOBOOK_SEQUENCE_JOB_COUNT_INVALID",
  );
  assertAudiobookLineage(value);
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(sequenceBase(partial))) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_AUDIOBOOK_SEQUENCE_FINGERPRINT_INVALID",
    );
  }
}

export function admittedNarratorAudiobookSequencePublicView(
  value: AdmittedNarratorAudiobookSequence,
): AdmittedNarratorAudiobookSequencePublicView {
  assertAdmittedNarratorAudiobookSequence(value);
  return Object.freeze({
    bookId: value.bookId,
    chapterCount: value.sequence.chapterCount,
    componentCount: value.sequence.components.length,
    totalDurationMs: value.sequence.totalDurationMs,
    totalProductionJobCount: value.totalProductionJobCount,
    narratorAdmissionComplete: true,
    creditNarrationAdmissionComplete: true,
    masteredChapterListeningComplete: true,
    completeBookListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    fingerprint: value.fingerprint,
  });
}

function assertReferenceLineage(
  value: AdmittedNarratorAudiobookReferenceMaster,
): void {
  assertAdmittedNarratorAudiobookSequence(value.audiobook);
  assertAudiobookRenderEvidence(value.renderEvidence);
  assertAudiobookReferenceMasterChain(value.chain);
  assertExactNarratorVoicePin(value.audiobook.voice, value.voice);
  const artifact = value.chain.referenceMaster.payload;
  if (
    value.projectId !== value.audiobook.projectId
    || value.bookId !== value.audiobook.bookId
    || value.profileAdmissionHash !== value.audiobook.profileAdmissionHash
    || value.admittedCastingFingerprint !== value.audiobook.admittedCastingFingerprint
    || value.castingFingerprint !== value.audiobook.castingFingerprint
    || value.renderEvidenceFingerprint !== value.renderEvidence.fingerprint
    || value.renderEvidence.sequenceId !== value.audiobook.sequence.id
    || value.renderEvidence.sequenceRevision !== value.audiobook.sequence.revision
    || value.renderEvidence.sequenceFingerprint !== value.audiobook.sequence.fingerprint
    || value.renderEvidence.expectedDurationMs !== value.audiobook.sequence.totalDurationMs
    || value.renderEvidence.output.contentHash !== artifact.integrity.contentHash
    || value.renderEvidence.output.byteCount !== artifact.integrity.byteCount
    || value.chain.renderEvidence.payload.provenance.generationRequestHash
      !== value.renderEvidence.commandFingerprint
    || value.chain.renderEvidence.payload.provenance.sourceContentHash
      !== value.renderEvidence.output.contentHash
    || value.chain.sequenceId !== value.audiobook.sequence.id
    || value.chain.sequenceRevision !== value.audiobook.sequence.revision
    || value.chain.sequenceFingerprint !== value.audiobook.sequence.fingerprint
    || value.chain.expectedDurationMs !== value.audiobook.sequence.totalDurationMs
    || value.referenceArtifact.id !== artifact.id
    || value.referenceArtifact.revision !== value.chain.referenceMaster.revision
    || value.referenceArtifact.fingerprint !== artifact.fingerprint
    || value.referenceArtifact.contentHash !== artifact.integrity.contentHash
    || value.referenceArtifact.byteCount !== artifact.integrity.byteCount
    || value.totalProductionJobCount !== value.audiobook.totalProductionJobCount
    || value.eligibleForContinuousWholeBookReview !== value.chain.eligibleForReview
  ) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_REFERENCE_MASTER_LINEAGE_MISMATCH",
    );
  }
  if (
    value.narratorAdmissionComplete !== true
    || value.completeBookListeningApproval !== false
    || value.titleNarratorApproval !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_REFERENCE_MASTER_AUTHORITY_INVALID",
    );
  }
}

export async function ingestAdmittedNarratorAudiobookReferenceMaster(
  objectStore: FilePrivateObjectStore,
  registry: FileArtifactRegistry,
  input: Readonly<{
    audiobook: AdmittedNarratorAudiobookSequence;
    render: AudiobookRenderResult;
    rights: ArtifactRightsSnapshot;
    actorId: string;
    verifierActorId?: string;
    engineering: GenerationAudioEngineeringPolicy;
    maximumDurationDriftMs?: number;
    now?: Date;
    signal?: AbortSignal;
  }>,
): Promise<AdmittedNarratorAudiobookReferenceMaster> {
  assertAdmittedNarratorAudiobookSequence(input.audiobook);
  assertAudiobookRenderEvidence(input.render.evidence);
  if (
    input.render.evidence.sequenceFingerprint
      !== input.audiobook.sequence.fingerprint
  ) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_REFERENCE_MASTER_RENDER_MISMATCH",
    );
  }
  const chain = await ingestAudiobookReferenceMaster(objectStore, registry, {
    sequence: input.audiobook.sequence,
    render: input.render,
    rights: input.rights,
    actorId: input.actorId,
    ...(input.verifierActorId ? { verifierActorId: input.verifierActorId } : {}),
    engineering: input.engineering,
    ...(input.maximumDurationDriftMs !== undefined
      ? { maximumDurationDriftMs: input.maximumDurationDriftMs }
      : {}),
    ...(input.now ? { now: input.now } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  const artifact = chain.referenceMaster.payload;
  const partial: Omit<AdmittedNarratorAudiobookReferenceMaster, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_REFERENCE_MASTER_SCHEMA,
    projectId: input.audiobook.projectId,
    bookId: input.audiobook.bookId,
    profileAdmissionHash: input.audiobook.profileAdmissionHash,
    admittedCastingFingerprint: input.audiobook.admittedCastingFingerprint,
    castingFingerprint: input.audiobook.castingFingerprint,
    voice: Object.freeze({ ...input.audiobook.voice }),
    audiobook: input.audiobook,
    renderEvidence: input.render.evidence,
    renderEvidenceFingerprint: input.render.evidence.fingerprint,
    chain,
    referenceArtifact: Object.freeze({
      id: artifact.id,
      revision: chain.referenceMaster.revision,
      fingerprint: artifact.fingerprint,
      contentHash: artifact.integrity.contentHash,
      byteCount: artifact.integrity.byteCount,
    }),
    totalProductionJobCount: input.audiobook.totalProductionJobCount,
    narratorAdmissionComplete: true,
    eligibleForContinuousWholeBookReview: chain.eligibleForReview,
    completeBookListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const result = Object.freeze({
    ...partial,
    fingerprint: stableHash(referenceBase(partial)),
  });
  assertAdmittedNarratorAudiobookReferenceMaster(result);
  return result;
}

export function assertAdmittedNarratorAudiobookReferenceMaster(
  value: AdmittedNarratorAudiobookReferenceMaster,
): void {
  if (value.schemaVersion !== ADMITTED_NARRATOR_REFERENCE_MASTER_SCHEMA) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_REFERENCE_MASTER_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    value.projectId,
    "ADMITTED_NARRATOR_REFERENCE_MASTER_PROJECT_INVALID",
  );
  requireIdentifier(
    value.bookId,
    "ADMITTED_NARRATOR_REFERENCE_MASTER_BOOK_INVALID",
  );
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
    value.renderEvidenceFingerprint,
    value.referenceArtifact.fingerprint,
    value.referenceArtifact.contentHash,
  ]) requireHash(hash, "ADMITTED_NARRATOR_REFERENCE_MASTER_HASH_INVALID");
  requirePositiveInteger(
    value.referenceArtifact.revision,
    "ADMITTED_NARRATOR_REFERENCE_MASTER_REVISION_INVALID",
  );
  requirePositiveInteger(
    value.referenceArtifact.byteCount,
    "ADMITTED_NARRATOR_REFERENCE_MASTER_SIZE_INVALID",
  );
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_REFERENCE_MASTER_JOB_COUNT_INVALID",
  );
  assertReferenceLineage(value);
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(referenceBase(partial))) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_REFERENCE_MASTER_FINGERPRINT_INVALID",
    );
  }
}

function assertReviewBindingLineage(
  value: AdmittedNarratorWholeBookReviewBinding,
): void {
  assertAdmittedNarratorAudiobookReferenceMaster(value.reference);
  assertAudiobookReferenceMasterReviewSession(value.session);
  const reference = value.reference;
  assertExactNarratorVoicePin(reference.voice, value.voice);
  if (
    value.projectId !== reference.projectId
    || value.bookId !== reference.bookId
    || value.profileAdmissionHash !== reference.profileAdmissionHash
    || value.admittedCastingFingerprint !== reference.admittedCastingFingerprint
    || value.castingFingerprint !== reference.castingFingerprint
    || value.session.projectId !== reference.projectId
    || value.session.bookId !== reference.bookId
    || value.session.chainFingerprint !== reference.chain.fingerprint
    || value.session.sequence.fingerprint !== reference.audiobook.sequence.fingerprint
    || value.session.referenceArtifact.id !== reference.referenceArtifact.id
    || value.session.referenceArtifact.revision !== reference.referenceArtifact.revision
    || value.session.referenceArtifact.fingerprint !== reference.referenceArtifact.fingerprint
    || value.session.referenceArtifact.contentHash !== reference.referenceArtifact.contentHash
    || value.session.referenceArtifact.byteCount !== reference.referenceArtifact.byteCount
    || value.totalProductionJobCount !== reference.totalProductionJobCount
    || value.revision !== value.session.revision
    || value.createdAt !== value.session.createdAt
    || value.updatedAt !== value.session.updatedAt
  ) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_LINEAGE_MISMATCH",
    );
  }
  if (
    value.narratorAdmissionComplete !== true
    || value.completeBookListeningApproval !== false
    || value.titleNarratorApproval !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_AUTHORITY_INVALID",
    );
  }
}

export function createAdmittedNarratorWholeBookReviewBinding(input: Readonly<{
  id: string;
  reference: AdmittedNarratorAudiobookReferenceMaster;
  createdAt?: Date;
}>): AdmittedNarratorWholeBookReviewBinding {
  assertAdmittedNarratorAudiobookReferenceMaster(input.reference);
  if (!input.reference.eligibleForContinuousWholeBookReview) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_REFERENCE_INELIGIBLE",
    );
  }
  const session = createAudiobookReferenceMasterReviewSession({
    id: input.id,
    sequence: input.reference.audiobook.sequence,
    chain: input.reference.chain,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  });
  const partial: Omit<AdmittedNarratorWholeBookReviewBinding, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_BINDING_SCHEMA,
    projectId: input.reference.projectId,
    bookId: input.reference.bookId,
    profileAdmissionHash: input.reference.profileAdmissionHash,
    admittedCastingFingerprint: input.reference.admittedCastingFingerprint,
    castingFingerprint: input.reference.castingFingerprint,
    voice: Object.freeze({ ...input.reference.voice }),
    reference: input.reference,
    session,
    totalProductionJobCount: input.reference.totalProductionJobCount,
    narratorAdmissionComplete: true,
    revision: session.revision,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    completeBookListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const result = Object.freeze({
    ...partial,
    fingerprint: stableHash(reviewBindingBase(partial)),
  });
  assertAdmittedNarratorWholeBookReviewBinding(result);
  return result;
}

export function recordAdmittedNarratorWholeBookReview(
  binding: AdmittedNarratorWholeBookReviewBinding,
  input: Parameters<typeof recordAudiobookReferenceMasterReview>[1],
): AdmittedNarratorWholeBookReviewBinding {
  assertAdmittedNarratorWholeBookReviewBinding(binding);
  const session = recordAudiobookReferenceMasterReview(binding.session, input);
  const {
    fingerprint: _fingerprint,
    previousFingerprint: _previousFingerprint,
    session: _session,
    revision: _revision,
    updatedAt: _updatedAt,
    ...base
  } = binding;
  const partial: Omit<AdmittedNarratorWholeBookReviewBinding, "fingerprint"> = {
    ...base,
    session,
    revision: session.revision,
    previousFingerprint: binding.fingerprint,
    createdAt: binding.createdAt,
    updatedAt: session.updatedAt,
  };
  const result = Object.freeze({
    ...partial,
    fingerprint: stableHash(reviewBindingBase(partial)),
  });
  assertAdmittedNarratorWholeBookReviewBinding(result);
  return result;
}

export function assertAdmittedNarratorWholeBookReviewBinding(
  value: AdmittedNarratorWholeBookReviewBinding,
): void {
  if (
    value.schemaVersion
      !== ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_BINDING_SCHEMA
  ) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_BINDING_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    value.projectId,
    "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_PROJECT_INVALID",
  );
  requireIdentifier(
    value.bookId,
    "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_BOOK_INVALID",
  );
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
  ]) requireHash(hash, "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_HASH_INVALID");
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_JOB_COUNT_INVALID",
  );
  requirePositiveInteger(
    value.revision,
    "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_REVISION_INVALID",
  );
  requireDate(value.createdAt, "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_DATE_INVALID");
  requireDate(value.updatedAt, "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_DATE_INVALID");
  if (value.revision === 1 && value.previousFingerprint !== undefined) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_REVISION_CHAIN_INVALID",
    );
  }
  if (value.revision > 1) {
    requireHash(
      value.previousFingerprint ?? "",
      "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_REVISION_CHAIN_INVALID",
    );
  }
  assertReviewBindingLineage(value);
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(reviewBindingBase(partial))) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_BINDING_FINGERPRINT_INVALID",
    );
  }
}

export function createAdmittedNarratorWholeBookReviewApproval(
  binding: AdmittedNarratorWholeBookReviewBinding,
  input: Parameters<typeof approveAudiobookReferenceMasterReview>[3],
): AdmittedNarratorWholeBookReviewApproval {
  assertAdmittedNarratorWholeBookReviewBinding(binding);
  const approved: AudiobookReferenceMasterReviewApprovalResult =
    approveAudiobookReferenceMasterReview(
      binding.session,
      binding.reference.audiobook.sequence,
      binding.reference.chain,
      input,
    );
  const partial: Omit<AdmittedNarratorWholeBookReviewApproval, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_APPROVAL_SCHEMA,
    projectId: binding.projectId,
    bookId: binding.bookId,
    profileAdmissionHash: binding.profileAdmissionHash,
    admittedCastingFingerprint: binding.admittedCastingFingerprint,
    castingFingerprint: binding.castingFingerprint,
    voice: Object.freeze({ ...binding.voice }),
    binding,
    session: approved.session,
    approvedArtifact: approved.artifact,
    approvedAt: approved.session.approval!.approvedAt,
    totalProductionJobCount: binding.totalProductionJobCount,
    narratorAdmissionComplete: true,
    completeBookListeningApproval: true,
    titleNarratorApproval: false,
    eligibleForRetailEncoding: true,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const result = Object.freeze({
    ...partial,
    fingerprint: stableHash(reviewApprovalBase(partial)),
  });
  assertAdmittedNarratorWholeBookReviewApproval(result);
  return result;
}

export function assertAdmittedNarratorWholeBookReviewApproval(
  value: AdmittedNarratorWholeBookReviewApproval,
): void {
  if (
    value.schemaVersion
      !== ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_APPROVAL_SCHEMA
  ) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_APPROVAL_SCHEMA_UNSUPPORTED",
    );
  }
  assertAdmittedNarratorWholeBookReviewBinding(value.binding);
  assertAudiobookReferenceMasterReviewSession(value.session);
  assertArtifactRecord(value.approvedArtifact);
  assertExactNarratorVoicePin(value.binding.voice, value.voice);
  const approval = value.session.approval;
  if (
    !approval
    || value.projectId !== value.binding.projectId
    || value.bookId !== value.binding.bookId
    || value.profileAdmissionHash !== value.binding.profileAdmissionHash
    || value.admittedCastingFingerprint !== value.binding.admittedCastingFingerprint
    || value.castingFingerprint !== value.binding.castingFingerprint
    || value.session.status !== "approved"
    || value.session.previousFingerprint !== value.binding.session.fingerprint
    || value.session.revision !== value.binding.session.revision + 1
    || value.session.chainFingerprint !== value.binding.reference.chain.fingerprint
    || value.approvedAt !== approval.approvedAt
    || value.approvedArtifact.id !== value.binding.reference.referenceArtifact.id
    || value.approvedArtifact.revision !== approval.approvedArtifactRevision
    || value.approvedArtifact.fingerprint !== approval.approvedArtifactFingerprint
    || value.approvedArtifact.integrity.contentHash
      !== value.binding.reference.referenceArtifact.contentHash
    || value.approvedArtifact.integrity.byteCount
      !== value.binding.reference.referenceArtifact.byteCount
    || value.approvedArtifact.review.status !== "approved"
    || value.approvedArtifact.release.status !== "unavailable"
    || value.approvedArtifact.quarantine !== undefined
    || value.totalProductionJobCount !== value.binding.totalProductionJobCount
  ) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_APPROVAL_LINEAGE_MISMATCH",
    );
  }
  if (
    value.narratorAdmissionComplete !== true
    || value.completeBookListeningApproval !== true
    || value.titleNarratorApproval !== false
    || value.eligibleForRetailEncoding !== true
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_APPROVAL_AUTHORITY_INVALID",
    );
  }
  requireDate(
    value.approvedAt,
    "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_APPROVAL_DATE_INVALID",
  );
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(reviewApprovalBase(partial))) {
    throw new AdmittedNarratorAudiobookError(
      "ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_APPROVAL_FINGERPRINT_INVALID",
    );
  }
}

export function admittedNarratorWholeBookPublicView(
  value:
    | AdmittedNarratorWholeBookReviewBinding
    | AdmittedNarratorWholeBookReviewApproval,
): AdmittedNarratorWholeBookPublicView {
  const approved =
    value.schemaVersion === ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_APPROVAL_SCHEMA;
  if (approved) {
    assertAdmittedNarratorWholeBookReviewApproval(
      value as AdmittedNarratorWholeBookReviewApproval,
    );
  } else {
    assertAdmittedNarratorWholeBookReviewBinding(
      value as AdmittedNarratorWholeBookReviewBinding,
    );
  }
  const reference = approved
    ? (value as AdmittedNarratorWholeBookReviewApproval).binding.reference
    : (value as AdmittedNarratorWholeBookReviewBinding).reference;
  const artifact = approved
    ? (value as AdmittedNarratorWholeBookReviewApproval).approvedArtifact
    : reference.chain.referenceMaster.payload;
  return Object.freeze({
    bookId: value.bookId,
    referenceArtifactId: artifact.id,
    referenceArtifactRevision: artifact.revision,
    componentCount: reference.audiobook.sequence.components.length,
    chapterCount: reference.audiobook.sequence.chapterCount,
    totalDurationMs: reference.audiobook.sequence.totalDurationMs,
    totalProductionJobCount: value.totalProductionJobCount,
    narratorAdmissionComplete: true,
    completeBookListeningApproval: approved,
    titleNarratorApproval: false,
    eligibleForRetailEncoding: approved,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    fingerprint: value.fingerprint,
  });
}
