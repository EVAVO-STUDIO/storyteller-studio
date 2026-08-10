import {
  assertBookChapterSequence,
  type BookChapterSequence,
  type BookChapterSequenceEntry,
} from "./book-chapter-sequence.js";
import { stableHash } from "./index.js";
import {
  assertNarratorBookChapterSequence,
  createNarratorBookChapterSequence,
  type NarratorBookChapterSequence,
} from "./narrator-book-sequence.js";
import {
  assertAdmittedNarratorCasting,
  type AdmittedNarratorCasting,
} from "./narrator-casting-admission.js";
import {
  assertAdmittedNarratorMasteredReviewApproval,
  type AdmittedNarratorMasteredReviewApproval,
} from "./narrator-mastered-review-admission.js";
import {
  assertExactNarratorVoicePin,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";

export const ADMITTED_NARRATOR_BOOK_SEQUENCE_SCHEMA =
  "storyteller-admitted-narrator-book-chapter-sequence-v1" as const;

export interface AdmittedNarratorBookSequenceChapterEvidence {
  ordinal: number;
  chapterId: string;
  sequenceEntryFingerprint: string;
  admittedApprovalFingerprint: string;
  approval: AdmittedNarratorMasteredReviewApproval;
  fingerprint: string;
}

export interface AdmittedNarratorBookChapterSequence {
  schemaVersion: typeof ADMITTED_NARRATOR_BOOK_SEQUENCE_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  admittedCasting: AdmittedNarratorCasting;
  sequence: NarratorBookChapterSequence;
  chapters: readonly AdmittedNarratorBookSequenceChapterEvidence[];
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  masteredChapterListeningComplete: true;
  completeBookListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface AdmittedNarratorBookSequencePublicView {
  bookId: string;
  sequenceFingerprint: string;
  chapterCount: number;
  totalDurationMs: number;
  narratorAdmissionBound: true;
  totalProductionJobCount: number;
  masteredChapterListeningComplete: true;
  completeBookListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export class NarratorBookSequenceAdmissionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NarratorBookSequenceAdmissionError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new NarratorBookSequenceAdmissionError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new NarratorBookSequenceAdmissionError(code);
  }
  return value;
}

function requirePositiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new NarratorBookSequenceAdmissionError(code);
  }
  return value;
}

function chapterBase(
  value: Omit<AdmittedNarratorBookSequenceChapterEvidence, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function sequenceBase(
  value: Omit<AdmittedNarratorBookChapterSequence, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function assertApprovalScope(
  admittedCasting: AdmittedNarratorCasting,
  approval: AdmittedNarratorMasteredReviewApproval,
  entry: BookChapterSequenceEntry,
  sequenceCreatedAt: string,
): void {
  assertAdmittedNarratorMasteredReviewApproval(approval);
  if (
    approval.projectId !== admittedCasting.projectId
    || approval.profileAdmissionHash !== admittedCasting.profileAdmission.admissionHash
    || approval.admittedCastingFingerprint !== admittedCasting.fingerprint
    || approval.castingFingerprint !== admittedCasting.casting.fingerprint
    || approval.chapterId !== entry.chapterId
    || approval.approval.receipt.masteredChapterChainFingerprint
      !== entry.masteredChainFingerprint
    || approval.approval.reviewSession.fingerprint !== entry.reviewSessionFingerprint
    || approval.approval.receipt.planFingerprint !== entry.masteringPlanFingerprint
    || approval.approval.approvedArtifact.id !== entry.masteredArtifact.id
    || approval.approval.approvedArtifact.revision !== entry.masteredArtifact.revision
    || approval.approval.approvedArtifact.fingerprint !== entry.masteredArtifact.fingerprint
    || approval.approval.approvedArtifact.contentHash !== entry.masteredArtifact.contentHash
    || approval.approval.approvedArtifact.byteCount !== entry.masteredArtifact.byteCount
    || approval.masteredListeningApproval !== true
    || Date.parse(sequenceCreatedAt) < Date.parse(approval.approvedAt)
  ) {
    throw new NarratorBookSequenceAdmissionError(
      "ADMITTED_NARRATOR_BOOK_SEQUENCE_CHAPTER_BINDING_MISMATCH",
    );
  }
  assertExactNarratorVoicePin(admittedCasting.casting.voice, approval.voice);
}

export function createAdmittedNarratorBookChapterSequence(input: Readonly<{
  admittedCasting: AdmittedNarratorCasting;
  sequence: BookChapterSequence;
  chapterApprovals: readonly AdmittedNarratorMasteredReviewApproval[];
}>): AdmittedNarratorBookChapterSequence {
  assertAdmittedNarratorCasting(input.admittedCasting);
  assertBookChapterSequence(input.sequence);
  if (input.sequence.projectId !== input.admittedCasting.projectId) {
    throw new NarratorBookSequenceAdmissionError(
      "ADMITTED_NARRATOR_BOOK_SEQUENCE_PROJECT_CASTING_MISMATCH",
    );
  }
  if (
    !Array.isArray(input.chapterApprovals)
    || input.chapterApprovals.length !== input.sequence.chapters.length
  ) {
    throw new NarratorBookSequenceAdmissionError(
      "ADMITTED_NARRATOR_BOOK_SEQUENCE_APPROVAL_COUNT_MISMATCH",
    );
  }
  const approvals = new Map<string, AdmittedNarratorMasteredReviewApproval>();
  for (const approval of input.chapterApprovals) {
    assertAdmittedNarratorMasteredReviewApproval(approval);
    if (approvals.has(approval.chapterId)) {
      throw new NarratorBookSequenceAdmissionError(
        "ADMITTED_NARRATOR_BOOK_SEQUENCE_APPROVAL_DUPLICATE",
      );
    }
    approvals.set(approval.chapterId, approval);
  }
  const technicalSequence = createNarratorBookChapterSequence({
    casting: input.admittedCasting.casting,
    sequence: input.sequence,
    chapterApprovals: input.chapterApprovals.map((approval) => approval.approval),
  });
  const chapters = input.sequence.chapters.map((entry, index) => {
    const approval = approvals.get(entry.chapterId);
    const technical = technicalSequence.chapters[index];
    if (!approval) {
      throw new NarratorBookSequenceAdmissionError(
        "ADMITTED_NARRATOR_BOOK_SEQUENCE_APPROVAL_MISSING",
      );
    }
    if (
      !technical
      || technical.chapterId !== entry.chapterId
      || technical.approval.fingerprint !== approval.approval.fingerprint
    ) {
      throw new NarratorBookSequenceAdmissionError(
        "ADMITTED_NARRATOR_BOOK_SEQUENCE_TECHNICAL_SEQUENCE_MISMATCH",
      );
    }
    assertApprovalScope(
      input.admittedCasting,
      approval,
      entry,
      input.sequence.createdAt,
    );
    const partial: Omit<AdmittedNarratorBookSequenceChapterEvidence, "fingerprint"> = {
      ordinal: entry.ordinal,
      chapterId: entry.chapterId,
      sequenceEntryFingerprint: entry.fingerprint,
      admittedApprovalFingerprint: approval.fingerprint,
      approval,
    };
    return Object.freeze({
      ...partial,
      fingerprint: stableHash(chapterBase(partial)),
    });
  });
  if (chapters.length !== approvals.size) {
    throw new NarratorBookSequenceAdmissionError(
      "ADMITTED_NARRATOR_BOOK_SEQUENCE_APPROVAL_SCOPE_MISMATCH",
    );
  }
  const totalProductionJobCount = chapters.reduce(
    (total, chapter) => total + chapter.approval.productionJobCount,
    0,
  );
  const partial: Omit<AdmittedNarratorBookChapterSequence, "fingerprint"> = {
    schemaVersion: ADMITTED_NARRATOR_BOOK_SEQUENCE_SCHEMA,
    projectId: input.sequence.projectId,
    bookId: input.sequence.bookId,
    profileAdmissionHash: input.admittedCasting.profileAdmission.admissionHash,
    admittedCastingFingerprint: input.admittedCasting.fingerprint,
    castingFingerprint: input.admittedCasting.casting.fingerprint,
    voice: Object.freeze({ ...input.admittedCasting.casting.voice }),
    admittedCasting: input.admittedCasting,
    sequence: technicalSequence,
    chapters: Object.freeze(chapters),
    totalProductionJobCount,
    narratorAdmissionComplete: true,
    masteredChapterListeningComplete: true,
    completeBookListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(sequenceBase(partial)),
  });
  assertAdmittedNarratorBookChapterSequence(value);
  return value;
}

export function assertAdmittedNarratorBookChapterSequence(
  value: AdmittedNarratorBookChapterSequence,
): void {
  if (value.schemaVersion !== ADMITTED_NARRATOR_BOOK_SEQUENCE_SCHEMA) {
    throw new NarratorBookSequenceAdmissionError(
      "ADMITTED_NARRATOR_BOOK_SEQUENCE_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(value.projectId, "ADMITTED_NARRATOR_BOOK_SEQUENCE_PROJECT_INVALID");
  requireIdentifier(value.bookId, "ADMITTED_NARRATOR_BOOK_SEQUENCE_BOOK_INVALID");
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
  ]) requireHash(hash, "ADMITTED_NARRATOR_BOOK_SEQUENCE_HASH_INVALID");
  assertAdmittedNarratorCasting(value.admittedCasting);
  assertNarratorBookChapterSequence(value.sequence);
  if (
    value.projectId !== value.admittedCasting.projectId
    || value.projectId !== value.sequence.projectId
    || value.bookId !== value.sequence.bookId
    || value.profileAdmissionHash !== value.admittedCasting.profileAdmission.admissionHash
    || value.admittedCastingFingerprint !== value.admittedCasting.fingerprint
    || value.castingFingerprint !== value.admittedCasting.casting.fingerprint
    || value.sequence.casting.fingerprint !== value.castingFingerprint
    || value.chapters.length !== value.sequence.chapters.length
  ) {
    throw new NarratorBookSequenceAdmissionError(
      "ADMITTED_NARRATOR_BOOK_SEQUENCE_SCOPE_MISMATCH",
    );
  }
  assertExactNarratorVoicePin(value.admittedCasting.casting.voice, value.voice);
  if (!Array.isArray(value.chapters) || value.chapters.length === 0) {
    throw new NarratorBookSequenceAdmissionError(
      "ADMITTED_NARRATOR_BOOK_SEQUENCE_CHAPTERS_REQUIRED",
    );
  }
  const chapterIds = new Set<string>();
  let totalProductionJobCount = 0;
  for (const [index, evidence] of value.chapters.entries()) {
    const entry = value.sequence.sequence.chapters[index];
    const technical = value.sequence.chapters[index];
    if (
      !entry
      || !technical
      || evidence.ordinal !== entry.ordinal
      || evidence.chapterId !== entry.chapterId
    ) {
      throw new NarratorBookSequenceAdmissionError(
        "ADMITTED_NARRATOR_BOOK_SEQUENCE_ORDER_MISMATCH",
      );
    }
    for (const hash of [
      evidence.sequenceEntryFingerprint,
      evidence.admittedApprovalFingerprint,
    ]) requireHash(hash, "ADMITTED_NARRATOR_BOOK_SEQUENCE_CHAPTER_HASH_INVALID");
    if (
      evidence.sequenceEntryFingerprint !== entry.fingerprint
      || evidence.admittedApprovalFingerprint !== evidence.approval.fingerprint
      || technical.approval.fingerprint !== evidence.approval.approval.fingerprint
    ) {
      throw new NarratorBookSequenceAdmissionError(
        "ADMITTED_NARRATOR_BOOK_SEQUENCE_CHAPTER_EVIDENCE_MISMATCH",
      );
    }
    if (chapterIds.has(evidence.chapterId)) {
      throw new NarratorBookSequenceAdmissionError(
        "ADMITTED_NARRATOR_BOOK_SEQUENCE_CHAPTER_DUPLICATE",
      );
    }
    chapterIds.add(evidence.chapterId);
    assertApprovalScope(
      value.admittedCasting,
      evidence.approval,
      entry,
      value.sequence.sequence.createdAt,
    );
    totalProductionJobCount += evidence.approval.productionJobCount;
    const { fingerprint, ...partial } = evidence;
    if (!HASH.test(fingerprint) || fingerprint !== stableHash(chapterBase(partial))) {
      throw new NarratorBookSequenceAdmissionError(
        "ADMITTED_NARRATOR_BOOK_SEQUENCE_CHAPTER_FINGERPRINT_INVALID",
      );
    }
  }
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_BOOK_SEQUENCE_PRODUCTION_JOB_COUNT_INVALID",
  );
  if (value.totalProductionJobCount !== totalProductionJobCount) {
    throw new NarratorBookSequenceAdmissionError(
      "ADMITTED_NARRATOR_BOOK_SEQUENCE_PRODUCTION_JOB_COUNT_MISMATCH",
    );
  }
  if (
    value.narratorAdmissionComplete !== true
    || value.masteredChapterListeningComplete !== true
    || value.completeBookListeningApproval !== false
    || value.titleNarratorApproval !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new NarratorBookSequenceAdmissionError(
      "ADMITTED_NARRATOR_BOOK_SEQUENCE_AUTHORITY_INVALID",
    );
  }
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(sequenceBase(partial))) {
    throw new NarratorBookSequenceAdmissionError(
      "ADMITTED_NARRATOR_BOOK_SEQUENCE_FINGERPRINT_INVALID",
    );
  }
}

export function admittedNarratorBookSequencePublicView(
  value: AdmittedNarratorBookChapterSequence,
): AdmittedNarratorBookSequencePublicView {
  assertAdmittedNarratorBookChapterSequence(value);
  return Object.freeze({
    bookId: value.bookId,
    sequenceFingerprint: value.sequence.sequence.fingerprint,
    chapterCount: value.chapters.length,
    totalDurationMs: value.sequence.sequence.totalDurationMs,
    narratorAdmissionBound: true,
    totalProductionJobCount: value.totalProductionJobCount,
    masteredChapterListeningComplete: true,
    completeBookListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    fingerprint: value.fingerprint,
  });
}
