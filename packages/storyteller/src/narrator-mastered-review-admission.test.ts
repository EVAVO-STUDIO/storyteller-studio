import assert from "node:assert/strict";
import test from "node:test";
import {
  recordArtifactReview,
  type ArtifactRecord,
} from "./artifact-registry.js";
import {
  assertBookChapterSequence,
  type BookChapterSequence,
  type BookChapterSequenceEntry,
} from "./book-chapter-sequence.js";
import { stableHash } from "./index.js";
import {
  assertMasteredChapterReviewSession,
  type MasteredChapterReviewApproval,
  type MasteredChapterReviewScores,
  type MasteredChapterReviewSession,
} from "./mastered-chapter-review.js";
import {
  admittedNarratorBookSequencePublicView,
  assertAdmittedNarratorBookChapterSequence,
  createAdmittedNarratorBookChapterSequence,
} from "./narrator-book-sequence-admission.js";
import {
  admittedNarratorMasteredReviewPublicView,
  assertAdmittedNarratorMasteredReviewApproval,
  assertAdmittedNarratorMasteredReviewBinding,
  createAdmittedNarratorMasteredReviewApproval,
  createAdmittedNarratorMasteredReviewBinding,
  recordAdmittedNarratorMasteredReview,
  type AdmittedNarratorMasteredReviewApproval,
  type AdmittedNarratorMasteredReviewBinding,
} from "./narrator-mastered-review-admission.js";
import {
  createTestAdmittedMasteredChapterFixture,
  type TestAdmittedMasteredChapterFixture,
} from "../test-support/narrator-mastering.js";
import { testDigest } from "../test-support/narrator-casting.js";

const t9 = new Date("2026-08-10T10:09:00.000Z");
const t10 = new Date("2026-08-10T10:10:00.000Z");
const t11 = new Date("2026-08-10T10:11:00.000Z");
const t12 = new Date("2026-08-10T10:12:00.000Z");

const goodScores: MasteredChapterReviewScores = {
  listenerComfort: 5,
  intelligibility: 5,
  tonalBalance: 4,
  dynamicNaturalness: 4,
  noiseConsistency: 5,
  breathAndConsonantIntegrity: 4,
  silenceAndTransitionIntegrity: 5,
  continuityWithNeighbours: 4,
};

function initialReviewSession(
  fixture: TestAdmittedMasteredChapterFixture,
): MasteredChapterReviewSession {
  const receipt = fixture.receipt.receipt;
  const partial: Omit<MasteredChapterReviewSession, "fingerprint"> = {
    schemaVersion: "storyteller-mastered-chapter-review-v1",
    id: `mastered_review_${fixture.receipt.chapterId}`,
    projectId: fixture.receipt.projectId,
    chapterId: fixture.receipt.chapterId,
    chainFingerprint: receipt.masteredChapterChainFingerprint,
    masteredArtifact: receipt.masteredArtifact,
    durationMs: fixture.chain.comparison.observedDurationMs,
    requiredRoles: Object.freeze(["editorial", "engineering"]),
    reviews: Object.freeze([]),
    status: "open",
    revision: 1,
    createdAt: t9.toISOString(),
    updatedAt: t9.toISOString(),
  };
  const value = Object.freeze({ ...partial, fingerprint: stableHash(partial) });
  assertMasteredChapterReviewSession(value);
  return value;
}

function source(fixture: TestAdmittedMasteredChapterFixture) {
  return Object.freeze({
    context: fixture.context,
    approvedPlan: fixture.approvedPlan,
    renderReceipt: fixture.renderReceipt,
    receipt: fixture.receipt,
  });
}

function readyBinding(
  fixture: TestAdmittedMasteredChapterFixture,
): AdmittedNarratorMasteredReviewBinding {
  let binding = createAdmittedNarratorMasteredReviewBinding({
    source: source(fixture),
    reviewSession: initialReviewSession(fixture),
  });
  const findingAcknowledgements = fixture.receipt.findingCodes;
  binding = recordAdmittedNarratorMasteredReview(binding, {
    id: `editorial_${fixture.receipt.chapterId}`,
    role: "editorial",
    reviewerId: `editorial-reviewer-${fixture.receipt.chapterId}`,
    listenedDurationMs: fixture.chain.comparison.observedDurationMs,
    playbackContexts: ["consumer-headphones", "speakers"],
    decision: "approve",
    scores: goodScores,
    decidedAt: t10,
    findingAcknowledgements,
  });
  binding = recordAdmittedNarratorMasteredReview(binding, {
    id: `engineering_${fixture.receipt.chapterId}`,
    role: "engineering",
    reviewerId: `engineering-reviewer-${fixture.receipt.chapterId}`,
    listenedDurationMs: fixture.chain.comparison.observedDurationMs,
    playbackContexts: ["studio-headphones"],
    decision: "approve",
    scores: goodScores,
    decidedAt: new Date(t10.getTime() + 10_000),
    findingAcknowledgements,
  });
  assert.equal(binding.binding.reviewSession.status, "ready-for-approval");
  return binding;
}

function approvedArtifact(
  fixture: TestAdmittedMasteredChapterFixture,
  approver = `mastered-final-approver-${fixture.receipt.chapterId}`,
): ArtifactRecord {
  return recordArtifactReview(fixture.masteredArtifact, {
    decision: "approved",
    reviewerId: approver,
    notes: "Approved after complete admission-bound editorial and engineering playback.",
    decidedAt: t11,
  });
}

function approvedSession(
  binding: AdmittedNarratorMasteredReviewBinding,
  artifact: ArtifactRecord,
  approver = `mastered-final-approver-${binding.chapterId}`,
): MasteredChapterReviewSession {
  const ready = binding.binding.reviewSession;
  const approvalPartial: Omit<MasteredChapterReviewApproval, "fingerprint"> = {
    finalConfirmationId: `confirmation_${binding.chapterId}`,
    approvedByActorId: approver,
    approvedAt: t11.toISOString(),
    artifactReviewFingerprint: artifact.fingerprint,
  };
  const approval = Object.freeze({
    ...approvalPartial,
    fingerprint: stableHash(approvalPartial),
  });
  const {
    fingerprint: _fingerprint,
    previousFingerprint: _previousFingerprint,
    approval: _previousApproval,
    ...base
  } = ready;
  const partial: Omit<MasteredChapterReviewSession, "fingerprint"> = {
    ...base,
    status: "approved",
    approval,
    revision: ready.revision + 1,
    previousFingerprint: ready.fingerprint,
    createdAt: ready.createdAt,
    updatedAt: t11.toISOString(),
  };
  const value = Object.freeze({ ...partial, fingerprint: stableHash(partial) });
  assertMasteredChapterReviewSession(value);
  return value;
}

async function approvedFixture(options: Readonly<{
  chapterId: string;
  seed: string;
  byteSeed: number;
  fixture?: TestAdmittedMasteredChapterFixture;
  admittedCasting?: TestAdmittedMasteredChapterFixture["admittedCasting"];
  mode?: "zero-shot" | "adapted";
}>): Promise<Readonly<{
  fixture: TestAdmittedMasteredChapterFixture;
  binding: AdmittedNarratorMasteredReviewBinding;
  approvedArtifact: ArtifactRecord;
  approvedSession: MasteredChapterReviewSession;
  approval: AdmittedNarratorMasteredReviewApproval;
}>> {
  const fixture = options.fixture ?? await createTestAdmittedMasteredChapterFixture({
    chapterId: options.chapterId,
    seed: options.seed,
    byteSeed: options.byteSeed,
    admittedCasting: options.admittedCasting,
    mode: options.mode,
  });
  const binding = readyBinding(fixture);
  const artifact = approvedArtifact(fixture);
  const session = approvedSession(binding, artifact);
  const approval = createAdmittedNarratorMasteredReviewApproval({
    binding,
    approvedSession: session,
    approvedArtifact: artifact,
  });
  return Object.freeze({
    fixture,
    binding,
    approvedArtifact: artifact,
    approvedSession: session,
    approval,
  });
}

function sequence(
  fixtures: readonly Awaited<ReturnType<typeof approvedFixture>>[],
): BookChapterSequence {
  const chapters = fixtures.map((fixture, index) => {
    const approval = fixture.approval.approval;
    const partial: Omit<BookChapterSequenceEntry, "fingerprint"> = {
      ordinal: index + 1,
      role: "chapter",
      chapterId: approval.chapterId,
      title: `Chapter ${index + 1}`,
      durationMs: fixture.fixture.chain.comparison.observedDurationMs,
      masteredArtifact: {
        id: approval.approvedArtifact.id,
        revision: approval.approvedArtifact.revision,
        fingerprint: approval.approvedArtifact.fingerprint,
        contentHash: approval.approvedArtifact.contentHash,
        byteCount: approval.approvedArtifact.byteCount,
      },
      masteredChainFingerprint: approval.receipt.masteredChapterChainFingerprint,
      reviewSessionFingerprint: approval.reviewSession.fingerprint,
      masteringPlanFingerprint: approval.receipt.planFingerprint,
    };
    return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
  });
  const first = fixtures[0]!;
  const partial: Omit<BookChapterSequence, "fingerprint"> = {
    schemaVersion: "storyteller-book-chapter-sequence-v1",
    id: "book_sequence_admitted_narrator_001",
    projectId: first.approval.projectId,
    bookId: "book_admitted_narrator_001",
    title: "Admission Bound Narrator Book",
    languageTag: "en-AU",
    rightsFingerprint: first.fixture.rightsFingerprint,
    engineeringProfileFingerprint:
      first.fixture.approvedPlan.approvedPlan.plan.targetProfile.fingerprint,
    output: first.fixture.approvedPlan.approvedPlan.plan.output,
    chapters: Object.freeze(chapters),
    totalDurationMs: chapters.reduce((total, chapter) => total + chapter.durationMs, 0),
    status: "ready-for-credits",
    createdByActorId: "book-sequence-director",
    revision: 1,
    createdAt: t12.toISOString(),
    updatedAt: t12.toISOString(),
  };
  const value = Object.freeze({ ...partial, fingerprint: stableHash(partial) });
  assertBookChapterSequence(value);
  return value;
}

test("post-master review begins from the exact admitted mastered chapter receipt", async () => {
  const fixture = await createTestAdmittedMasteredChapterFixture();
  const binding = createAdmittedNarratorMasteredReviewBinding({
    source: source(fixture),
    reviewSession: initialReviewSession(fixture),
  });
  assert.doesNotThrow(() => assertAdmittedNarratorMasteredReviewBinding(binding));
  assert.equal(binding.profileAdmissionHash, fixture.receipt.profileAdmissionHash);
  assert.equal(binding.productionSetFingerprint, fixture.receipt.productionSetFingerprint);
  assert.equal(binding.admittedMasteredChapterFingerprint, fixture.receipt.fingerprint);
  assert.equal(binding.binding.receipt.fingerprint, fixture.receipt.receipt.fingerprint);
  assert.equal(binding.masteredListeningApproval, false);
});

test("zero-shot and adapted mastered chapters retain distinct admission provenance through review", async () => {
  const adapted = await createTestAdmittedMasteredChapterFixture({
    chapterId: "chapter_adapted",
    seed: "adapted-mastered-review",
    byteSeed: 2,
  });
  const zeroShot = await createTestAdmittedMasteredChapterFixture({
    chapterId: "chapter_zero_shot",
    seed: "zero-shot-mastered-review",
    byteSeed: 3,
    mode: "zero-shot",
  });
  const adaptedBinding = createAdmittedNarratorMasteredReviewBinding({
    source: source(adapted),
    reviewSession: initialReviewSession(adapted),
  });
  const zeroShotBinding = createAdmittedNarratorMasteredReviewBinding({
    source: source(zeroShot),
    reviewSession: initialReviewSession(zeroShot),
  });
  assert.notEqual(adaptedBinding.profileAdmissionHash, zeroShotBinding.profileAdmissionHash);
  assert.notEqual(adaptedBinding.admittedCastingFingerprint, zeroShotBinding.admittedCastingFingerprint);
  assert.equal(adapted.context.admittedCasting.profileAdmission.training !== null, true);
  assert.equal(zeroShot.context.admittedCasting.profileAdmission.training, null);
});

test("complete admitted post-master review grants only mastered listening approval", async () => {
  const value = await approvedFixture({
    chapterId: "chapter_approved",
    seed: "approved-mastered-review",
    byteSeed: 4,
  });
  assert.doesNotThrow(() => assertAdmittedNarratorMasteredReviewApproval(value.approval));
  assert.equal(value.approval.masteredListeningApproval, true);
  assert.equal(value.approval.completeBookListeningApproval, false);
  assert.equal(value.approval.titleNarratorApproval, false);
  assert.equal(value.approval.titleReleaseAuthority, false);
  assert.equal(value.approval.publicationAuthority, false);
});

test("another admission, production set or mastered receipt cannot be substituted after mastering", async () => {
  const selected = await createTestAdmittedMasteredChapterFixture({
    chapterId: "chapter_selected",
    seed: "selected-mastered-review",
    byteSeed: 5,
  });
  const replacement = await createTestAdmittedMasteredChapterFixture({
    chapterId: "chapter_selected",
    seed: "replacement-mastered-review",
    byteSeed: 6,
  });
  assert.throws(
    () => createAdmittedNarratorMasteredReviewBinding({
      source: {
        context: selected.context,
        approvedPlan: selected.approvedPlan,
        renderReceipt: selected.renderReceipt,
        receipt: replacement.receipt,
      },
      reviewSession: initialReviewSession(replacement),
    }),
    /ADMITTED_NARRATOR_MASTERED_CHAPTER_|ADMITTED_NARRATOR_MASTERING_|ADMITTED_CHAPTER_|NARRATOR_PRODUCTION_/u,
  );
});

test("outer rehashing cannot change admitted review lineage or downstream authority", async () => {
  const fixture = await createTestAdmittedMasteredChapterFixture({
    chapterId: "chapter_rehash",
    seed: "rehash-mastered-review",
    byteSeed: 7,
  });
  const binding = createAdmittedNarratorMasteredReviewBinding({
    source: source(fixture),
    reviewSession: initialReviewSession(fixture),
  });
  const { fingerprint: _fingerprint, ...partial } = binding;
  const changed = {
    ...partial,
    productionSetFingerprint: testDigest("other-production-set"),
    publicationAuthority: true as never,
  };
  assert.throws(
    () => assertAdmittedNarratorMasteredReviewBinding({
      ...changed,
      fingerprint: stableHash(changed),
    }),
    /ADMITTED_NARRATOR_MASTERED_REVIEW_(?:LINEAGE_MISMATCH|AUTHORITY_INVALID)/u,
  );
});

test("admission-bound post-master public view exposes no voice, training or reviewer identity", async () => {
  const value = await approvedFixture({
    chapterId: "chapter_public",
    seed: "public-mastered-review",
    byteSeed: 8,
  });
  const view = admittedNarratorMasteredReviewPublicView(value.approval);
  const json = JSON.stringify(view);
  assert.equal(view.narratorAdmissionBound, true);
  assert.equal(view.masteredListeningApproval, true);
  assert.equal(json.includes("magician-narrator"), false);
  assert.equal(json.includes(value.approval.profileAdmissionHash), false);
  assert.equal(json.includes(value.approval.admittedCastingFingerprint), false);
  assert.equal(json.includes("editorial-reviewer"), false);
  assert.equal(json.includes("checkpoint-epoch-003"), false);
});

test("book sequence requires one exact admission-bound mastered approval for every chapter", async () => {
  const firstFixture = await createTestAdmittedMasteredChapterFixture({
    chapterId: "chapter_a",
    seed: "book-chapter-a",
    byteSeed: 9,
  });
  const first = await approvedFixture({
    chapterId: "chapter_a",
    seed: "book-chapter-a",
    byteSeed: 9,
    fixture: firstFixture,
  });
  const second = await approvedFixture({
    chapterId: "chapter_b",
    seed: "book-chapter-b",
    byteSeed: 10,
    admittedCasting: firstFixture.admittedCasting,
  });
  const genericSequence = sequence([first, second]);
  const value = createAdmittedNarratorBookChapterSequence({
    admittedCasting: firstFixture.admittedCasting,
    sequence: genericSequence,
    chapterApprovals: [first.approval, second.approval],
  });
  assert.doesNotThrow(() => assertAdmittedNarratorBookChapterSequence(value));
  assert.equal(value.chapters.length, 2);
  assert.equal(value.narratorAdmissionComplete, true);
  assert.equal(value.masteredChapterListeningComplete, true);
  assert.equal(value.completeBookListeningApproval, false);
  assert.equal(
    value.totalProductionJobCount,
    first.approval.productionJobCount + second.approval.productionJobCount,
  );
});

test("book sequencing rejects missing, duplicate and cross-casting admitted approvals", async () => {
  const firstFixture = await createTestAdmittedMasteredChapterFixture({
    chapterId: "chapter_c",
    seed: "book-chapter-c",
    byteSeed: 11,
  });
  const first = await approvedFixture({
    chapterId: "chapter_c",
    seed: "book-chapter-c",
    byteSeed: 11,
    fixture: firstFixture,
  });
  const second = await approvedFixture({
    chapterId: "chapter_d",
    seed: "book-chapter-d",
    byteSeed: 12,
    admittedCasting: firstFixture.admittedCasting,
  });
  const genericSequence = sequence([first, second]);
  assert.throws(
    () => createAdmittedNarratorBookChapterSequence({
      admittedCasting: firstFixture.admittedCasting,
      sequence: genericSequence,
      chapterApprovals: [first.approval],
    }),
    /ADMITTED_NARRATOR_BOOK_SEQUENCE_APPROVAL_COUNT_MISMATCH/u,
  );
  assert.throws(
    () => createAdmittedNarratorBookChapterSequence({
      admittedCasting: firstFixture.admittedCasting,
      sequence: genericSequence,
      chapterApprovals: [first.approval, first.approval],
    }),
    /ADMITTED_NARRATOR_BOOK_SEQUENCE_APPROVAL_DUPLICATE|NARRATOR_BOOK_SEQUENCE_APPROVAL_DUPLICATE/u,
  );
  const other = await approvedFixture({
    chapterId: "chapter_d",
    seed: "book-chapter-d-other-casting",
    byteSeed: 13,
  });
  assert.throws(
    () => createAdmittedNarratorBookChapterSequence({
      admittedCasting: firstFixture.admittedCasting,
      sequence: genericSequence,
      chapterApprovals: [first.approval, other.approval],
    }),
    /ADMITTED_NARRATOR_BOOK_SEQUENCE_CHAPTER_BINDING_MISMATCH|NARRATOR_BOOK_SEQUENCE_CHAPTER_BINDING_MISMATCH/u,
  );
});

test("admission-bound book sequence public view proves completeness without private narrator evidence", async () => {
  const fixture = await approvedFixture({
    chapterId: "chapter_public_sequence",
    seed: "public-book-sequence",
    byteSeed: 14,
  });
  const genericSequence = sequence([fixture]);
  const value = createAdmittedNarratorBookChapterSequence({
    admittedCasting: fixture.fixture.admittedCasting,
    sequence: genericSequence,
    chapterApprovals: [fixture.approval],
  });
  const view = admittedNarratorBookSequencePublicView(value);
  const json = JSON.stringify(view);
  assert.equal(view.narratorAdmissionBound, true);
  assert.equal(view.masteredChapterListeningComplete, true);
  assert.equal(view.completeBookListeningApproval, false);
  assert.equal(json.includes("magician-narrator"), false);
  assert.equal(json.includes(value.profileAdmissionHash), false);
  assert.equal(json.includes(value.admittedCastingFingerprint), false);
  assert.equal(json.includes("reviewer"), false);
});
