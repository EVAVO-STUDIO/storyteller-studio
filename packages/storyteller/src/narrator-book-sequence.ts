import {
  assertBookChapterSequence,
  type BookChapterSequence,
  type BookChapterSequenceEntry,
} from "./book-chapter-sequence.js";
import { stableHash } from "./index.js";
import {
  assertNarratorMasteredReviewApproval,
  type NarratorMasteredReviewApproval,
} from "./narrator-mastered-review.js";
import {
  assertExactNarratorVoicePin,
  assertNarratorCasting,
  type NarratorCastingApproval,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";

export const NARRATOR_BOOK_SEQUENCE_SCHEMA =
  "storyteller-narrator-book-chapter-sequence-v1" as const;

export interface NarratorBookSequenceChapterEvidence {
  ordinal: number;
  chapterId: string;
  sequenceEntryFingerprint: string;
  approval: NarratorMasteredReviewApproval;
  fingerprint: string;
}

export interface NarratorBookChapterSequence {
  schemaVersion: typeof NARRATOR_BOOK_SEQUENCE_SCHEMA;
  projectId: string;
  bookId: string;
  casting: NarratorCastingApproval;
  sequence: BookChapterSequence;
  chapters: readonly NarratorBookSequenceChapterEvidence[];
  narratorEvidenceComplete: true;
  masteredChapterListeningComplete: true;
  completeBookListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface NarratorBookSequencePublicView {
  bookId: string;
  sequenceFingerprint: string;
  chapterCount: number;
  totalDurationMs: number;
  narratorEvidenceBound: true;
  masteredChapterListeningComplete: true;
  completeBookListeningApproval: false;
  titleNarratorApproval: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export class NarratorBookSequenceError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "NarratorBookSequenceError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new NarratorBookSequenceError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new NarratorBookSequenceError(code);
  }
  return value;
}

function chapterBase(
  value: Omit<NarratorBookSequenceChapterEvidence, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function sequenceBase(
  value: Omit<NarratorBookChapterSequence, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function assertApprovalMatchesEntry(
  casting: NarratorCastingApproval,
  approval: NarratorMasteredReviewApproval,
  entry: BookChapterSequenceEntry,
  sequenceCreatedAt: string,
): void {
  assertNarratorMasteredReviewApproval(approval);
  if (
    approval.projectId !== casting.projectId
    || approval.casting.fingerprint !== casting.fingerprint
    || approval.chapterId !== entry.chapterId
    || approval.receipt.masteredChapterChainFingerprint !== entry.masteredChainFingerprint
    || approval.reviewSession.fingerprint !== entry.reviewSessionFingerprint
    || approval.receipt.planFingerprint !== entry.masteringPlanFingerprint
    || approval.approvedArtifact.id !== entry.masteredArtifact.id
    || approval.approvedArtifact.revision !== entry.masteredArtifact.revision
    || approval.approvedArtifact.fingerprint !== entry.masteredArtifact.fingerprint
    || approval.approvedArtifact.contentHash !== entry.masteredArtifact.contentHash
    || approval.approvedArtifact.byteCount !== entry.masteredArtifact.byteCount
    || approval.masteredListeningApproval !== true
    || Date.parse(sequenceCreatedAt) < Date.parse(approval.approvedAt)
  ) {
    throw new NarratorBookSequenceError("NARRATOR_BOOK_SEQUENCE_CHAPTER_BINDING_MISMATCH");
  }
  assertExactNarratorVoicePin(casting.voice, approval.casting.voice);
}

export function createNarratorBookChapterSequence(input: Readonly<{
  casting: NarratorCastingApproval;
  sequence: BookChapterSequence;
  chapterApprovals: readonly NarratorMasteredReviewApproval[];
}>): NarratorBookChapterSequence {
  assertNarratorCasting(input.casting);
  assertBookChapterSequence(input.sequence);
  if (input.sequence.projectId !== input.casting.projectId) {
    throw new NarratorBookSequenceError("NARRATOR_BOOK_SEQUENCE_PROJECT_CASTING_MISMATCH");
  }
  if (
    !Array.isArray(input.chapterApprovals)
    || input.chapterApprovals.length !== input.sequence.chapters.length
  ) {
    throw new NarratorBookSequenceError("NARRATOR_BOOK_SEQUENCE_APPROVAL_COUNT_MISMATCH");
  }
  const approvals = new Map<string, NarratorMasteredReviewApproval>();
  for (const approval of input.chapterApprovals) {
    assertNarratorMasteredReviewApproval(approval);
    if (approvals.has(approval.chapterId)) {
      throw new NarratorBookSequenceError("NARRATOR_BOOK_SEQUENCE_APPROVAL_DUPLICATE");
    }
    approvals.set(approval.chapterId, approval);
  }
  const chapters = input.sequence.chapters.map((entry) => {
    const approval = approvals.get(entry.chapterId);
    if (!approval) {
      throw new NarratorBookSequenceError("NARRATOR_BOOK_SEQUENCE_APPROVAL_MISSING");
    }
    assertApprovalMatchesEntry(input.casting, approval, entry, input.sequence.createdAt);
    const partial: Omit<NarratorBookSequenceChapterEvidence, "fingerprint"> = {
      ordinal: entry.ordinal,
      chapterId: entry.chapterId,
      sequenceEntryFingerprint: entry.fingerprint,
      approval,
    };
    return Object.freeze({ ...partial, fingerprint: stableHash(chapterBase(partial)) });
  });
  if (chapters.length !== approvals.size) {
    throw new NarratorBookSequenceError("NARRATOR_BOOK_SEQUENCE_APPROVAL_SCOPE_MISMATCH");
  }
  const partial: Omit<NarratorBookChapterSequence, "fingerprint"> = {
    schemaVersion: NARRATOR_BOOK_SEQUENCE_SCHEMA,
    projectId: input.sequence.projectId,
    bookId: input.sequence.bookId,
    casting: input.casting,
    sequence: input.sequence,
    chapters: Object.freeze(chapters),
    narratorEvidenceComplete: true,
    masteredChapterListeningComplete: true,
    completeBookListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const result = Object.freeze({ ...partial, fingerprint: stableHash(sequenceBase(partial)) });
  assertNarratorBookChapterSequence(result);
  return result;
}

export function assertNarratorBookChapterSequence(
  value: NarratorBookChapterSequence,
): void {
  if (value.schemaVersion !== NARRATOR_BOOK_SEQUENCE_SCHEMA) {
    throw new NarratorBookSequenceError("NARRATOR_BOOK_SEQUENCE_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(value.projectId, "NARRATOR_BOOK_SEQUENCE_PROJECT_INVALID");
  requireIdentifier(value.bookId, "NARRATOR_BOOK_SEQUENCE_BOOK_INVALID");
  assertNarratorCasting(value.casting);
  assertBookChapterSequence(value.sequence);
  if (
    value.projectId !== value.casting.projectId
    || value.projectId !== value.sequence.projectId
    || value.bookId !== value.sequence.bookId
    || value.chapters.length !== value.sequence.chapters.length
  ) {
    throw new NarratorBookSequenceError("NARRATOR_BOOK_SEQUENCE_SCOPE_MISMATCH");
  }
  if (!Array.isArray(value.chapters) || value.chapters.length === 0) {
    throw new NarratorBookSequenceError("NARRATOR_BOOK_SEQUENCE_CHAPTERS_REQUIRED");
  }
  const chapterIds = new Set<string>();
  for (const [index, evidence] of value.chapters.entries()) {
    const entry = value.sequence.chapters[index];
    if (!entry || evidence.ordinal !== entry.ordinal || evidence.chapterId !== entry.chapterId) {
      throw new NarratorBookSequenceError("NARRATOR_BOOK_SEQUENCE_ORDER_MISMATCH");
    }
    requireHash(
      evidence.sequenceEntryFingerprint,
      "NARRATOR_BOOK_SEQUENCE_ENTRY_HASH_INVALID",
    );
    if (evidence.sequenceEntryFingerprint !== entry.fingerprint) {
      throw new NarratorBookSequenceError("NARRATOR_BOOK_SEQUENCE_ENTRY_MISMATCH");
    }
    if (chapterIds.has(evidence.chapterId)) {
      throw new NarratorBookSequenceError("NARRATOR_BOOK_SEQUENCE_CHAPTER_DUPLICATE");
    }
    chapterIds.add(evidence.chapterId);
    assertApprovalMatchesEntry(value.casting, evidence.approval, entry, value.sequence.createdAt);
    const { fingerprint, ...partial } = evidence;
    if (!HASH.test(fingerprint) || fingerprint !== stableHash(chapterBase(partial))) {
      throw new NarratorBookSequenceError("NARRATOR_BOOK_SEQUENCE_CHAPTER_FINGERPRINT_INVALID");
    }
  }
  if (
    value.narratorEvidenceComplete !== true
    || value.masteredChapterListeningComplete !== true
    || value.completeBookListeningApproval !== false
    || value.titleNarratorApproval !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new NarratorBookSequenceError("NARRATOR_BOOK_SEQUENCE_AUTHORITY_INVALID");
  }
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(sequenceBase(partial))) {
    throw new NarratorBookSequenceError("NARRATOR_BOOK_SEQUENCE_FINGERPRINT_INVALID");
  }
}

export function narratorBookSequencePublicView(
  value: NarratorBookChapterSequence,
): NarratorBookSequencePublicView {
  assertNarratorBookChapterSequence(value);
  return Object.freeze({
    bookId: value.bookId,
    sequenceFingerprint: value.sequence.fingerprint,
    chapterCount: value.chapters.length,
    totalDurationMs: value.sequence.totalDurationMs,
    narratorEvidenceBound: true,
    masteredChapterListeningComplete: true,
    completeBookListeningApproval: false,
    titleNarratorApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    fingerprint: value.fingerprint,
  });
}
