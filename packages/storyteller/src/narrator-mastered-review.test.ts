import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createArtifactRecord,
  recordArtifactReview,
  verifyArtifactIntegrity,
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
  assertNarratorBookChapterSequence,
  createNarratorBookChapterSequence,
  narratorBookSequencePublicView,
} from "./narrator-book-sequence.js";
import {
  assertNarratorMasteredReviewApproval,
  assertNarratorMasteredReviewBinding,
  createNarratorMasteredReviewApproval,
  createNarratorMasteredReviewBinding,
  narratorMasteredReviewPublicView,
  recordNarratorMasteredReview,
  type NarratorMasteredReviewApproval,
  type NarratorMasteredReviewBinding,
} from "./narrator-mastered-review.js";
import {
  assertNarratorApprovedMasteredChapterReceipt,
  assertNarratorMasteringAuthorization,
  type NarratorApprovedMasteredChapterReceipt,
  type NarratorMasteringAuthorization,
} from "./narrator-mastering-chain.js";
import {
  assertNarratorCasting,
  type NarratorCastingApproval,
} from "./narrator-voice-profile.js";

const t0 = new Date("2026-08-10T08:00:00.000Z");
const t1 = new Date("2026-08-10T08:01:00.000Z");
const t2 = new Date("2026-08-10T08:02:00.000Z");
const t3 = new Date("2026-08-10T08:03:00.000Z");
const t4 = new Date("2026-08-10T08:04:00.000Z");
const rightsFingerprint = digest("rights");
const findingCodes = Object.freeze(["MASTERED_CHAPTER_PREDICTION_WARNING"]);

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function wavBytes(seed: number): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    seed, 0x01, 0x02, 0x03,
  ]);
}

function casting(profileId = "magician-narrator"): NarratorCastingApproval {
  const partial: Omit<NarratorCastingApproval, "fingerprint"> = {
    schemaVersion: "storyteller-narrator-casting-v1",
    projectId: "project_narrator_mastered_001",
    voice: Object.freeze({
      profileId,
      revision: 3,
      profileHash: digest(`profile:${profileId}`),
    }),
    voiceIdentityId: "magician-owner-authorised",
    engineKey: "qwen3-tts-1.7b-base-local",
    mode: "adapted",
    modelArtifactTreeSha256: digest("model"),
    sourceRightsFingerprint: rightsFingerprint,
    evidenceHash: digest("voice-evidence"),
    approvedBy: "Greg",
    approvedAt: "2026-08-10T07:00:00.000Z",
    castingApproved: true,
    exactRevisionRequired: true,
    chapterListeningApprovalRequired: true,
    defaultNarrator: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const value = Object.freeze({ ...partial, fingerprint: stableHash(partial) });
  assertNarratorCasting(value);
  return value;
}

function pendingMasteredArtifact(chapterId: string, seed: number): ArtifactRecord {
  const bytes = wavBytes(seed);
  const initial = createArtifactRecord({
    id: `artifact_mastered_${chapterId}`,
    kind: "mastered-chapter",
    projectId: "project_narrator_mastered_001",
    jobId: `job_mastered_${chapterId}`,
    segmentId: chapterId,
    takeId: `take_mastered_${chapterId}`,
    storage: {
      driver: "private-object-store",
      provider: "storyteller-narrator-mastered-test",
      container: "private-narrator-mastered-test",
      objectKey: `sha256/${hashBytes(bytes)}.wav`,
      region: "australia-southeast",
    },
    integrity: {
      algorithm: "sha256",
      contentHash: hashBytes(bytes),
      byteCount: bytes.byteLength,
      mimeType: "audio/wav",
      format: "wav",
    },
    provenance: {
      createdByActorId: "mastering-worker",
      sourceContentHash: digest(`source:${chapterId}`),
      generationRequestHash: digest(`mastering-command:${chapterId}`),
      parentArtifactIds: [`artifact_mastering_render_${chapterId}`],
    },
    rights: {
      rightsEvidenceId: "rights_narrator_mastered_001",
      rightsFingerprint,
      allowedUses: ["audiobook"],
      commercialUseApproved: true,
      expiresAt: "2028-08-10T00:00:00.000Z",
    },
    reviewRequired: true,
  }, t0);
  return verifyArtifactIntegrity(initial, {
    observedContentHash: initial.integrity.contentHash,
    observedByteCount: initial.integrity.byteCount,
    checkedByActorId: "mastered-verifier",
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: t0,
  });
}

function authorization(
  approvedCasting: NarratorCastingApproval,
  chapterId: string,
): NarratorMasteringAuthorization {
  const partial: Omit<NarratorMasteringAuthorization, "fingerprint"> = {
    schemaVersion: "storyteller-narrator-mastering-authorization-v1",
    projectId: approvedCasting.projectId,
    chapterId,
    castingFingerprint: approvedCasting.fingerprint,
    voice: approvedCasting.voice,
    assembly: {
      planId: `assembly_${chapterId}`,
      planFingerprint: digest(`assembly:${chapterId}`),
    },
    chapterRender: {
      fingerprint: digest(`chapter-render:${chapterId}`),
      commandFingerprint: digest(`chapter-command:${chapterId}`),
      outputContentHash: digest(`chapter-output:${chapterId}`),
      outputByteCount: 1000,
      renderedAt: "2026-08-10T07:10:00.000Z",
    },
    sourceMaster: {
      id: `chapter_master_${chapterId}`,
      revision: 4,
      fingerprint: digest(`chapter-master-fingerprint:${chapterId}`),
      contentHash: digest(`chapter-master-content:${chapterId}`),
      byteCount: 1000,
    },
    sourceEngineering: {
      artifact: {
        id: `chapter_engineering_${chapterId}`,
        revision: 2,
        fingerprint: digest(`chapter-engineering-artifact:${chapterId}`),
        contentHash: digest(`chapter-engineering-content:${chapterId}`),
        byteCount: 500,
      },
      evidenceFingerprint: digest(`chapter-engineering-evidence:${chapterId}`),
      profileFingerprint: digest("engineering-profile"),
    },
    chapterReview: {
      fingerprint: digest(`chapter-narrator-review:${chapterId}`),
      objectiveMonitoringFingerprint: digest(`objective-monitor:${chapterId}`),
      objectiveMonitoringPolicyFingerprint: digest("objective-policy"),
      objectiveMonitoringReferenceFingerprint: digest("objective-reference"),
      objectiveMonitoringObservationFingerprint: digest(`objective-observation:${chapterId}`),
      reviewerPanelFingerprint: digest(`chapter-panel:${chapterId}`),
      sourceFingerprint: digest(`source:${chapterId}`),
      reviewedAt: "2026-08-10T07:20:00.000Z",
    },
    manuscriptSourceHash: digest(`source:${chapterId}`),
    rightsFingerprint,
    authorizedByActorId: "narrator-mastering-director",
    authorizedAt: "2026-08-10T07:30:00.000Z",
    masteringEligible: true,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const value = Object.freeze({ ...partial, fingerprint: stableHash(partial) });
  assertNarratorMasteringAuthorization(value);
  return value;
}

function receipt(
  auth: NarratorMasteringAuthorization,
  artifact: ArtifactRecord,
): NarratorApprovedMasteredChapterReceipt {
  const partial: Omit<NarratorApprovedMasteredChapterReceipt, "fingerprint"> = {
    schemaVersion: "storyteller-narrator-approved-mastered-chapter-v1",
    projectId: auth.projectId,
    chapterId: auth.chapterId,
    planId: `mastering_plan_${auth.chapterId}`,
    planFingerprint: digest(`mastering-plan:${auth.chapterId}`),
    authorizationFingerprint: auth.fingerprint,
    chapterNarratorReviewFingerprint: auth.chapterReview.fingerprint,
    objectiveMonitoringFingerprint: auth.chapterReview.objectiveMonitoringFingerprint,
    approvedMasteringPlanFingerprint: digest(`approved-mastering-plan:${auth.chapterId}`),
    masteringRenderReceiptFingerprint: digest(`mastering-render-receipt:${auth.chapterId}`),
    masteredChapterChainFingerprint: digest(`mastered-chain:${auth.chapterId}`),
    masteredArtifact: {
      id: artifact.id,
      revision: artifact.revision,
      fingerprint: artifact.fingerprint,
      contentHash: artifact.integrity.contentHash,
      byteCount: artifact.integrity.byteCount,
    },
    postMasterEngineeringFingerprint: digest(`post-master-engineering:${auth.chapterId}`),
    eligibleForHumanMasterReview: true,
    findingCodes,
    masteredListeningApproval: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const value = Object.freeze({ ...partial, fingerprint: stableHash(partial) });
  assertNarratorApprovedMasteredChapterReceipt(value);
  return value;
}

function initialReviewSession(
  narratorReceipt: NarratorApprovedMasteredChapterReceipt,
): MasteredChapterReviewSession {
  const partial: Omit<MasteredChapterReviewSession, "fingerprint"> = {
    schemaVersion: "storyteller-mastered-chapter-review-v1",
    id: `mastered_review_${narratorReceipt.chapterId}`,
    projectId: narratorReceipt.projectId,
    chapterId: narratorReceipt.chapterId,
    chainFingerprint: narratorReceipt.masteredChapterChainFingerprint,
    masteredArtifact: narratorReceipt.masteredArtifact,
    durationMs: 10_000,
    requiredRoles: Object.freeze(["editorial", "engineering"]),
    reviews: Object.freeze([]),
    status: "open",
    revision: 1,
    createdAt: t0.toISOString(),
    updatedAt: t0.toISOString(),
  };
  const value = Object.freeze({ ...partial, fingerprint: stableHash(partial) });
  assertMasteredChapterReviewSession(value);
  return value;
}

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

function readyBinding(input: Readonly<{
  casting: NarratorCastingApproval;
  authorization: NarratorMasteringAuthorization;
  receipt: NarratorApprovedMasteredChapterReceipt;
}>): NarratorMasteredReviewBinding {
  let binding = createNarratorMasteredReviewBinding({
    ...input,
    reviewSession: initialReviewSession(input.receipt),
  });
  binding = recordNarratorMasteredReview(binding, {
    id: `editorial_${input.receipt.chapterId}`,
    role: "editorial",
    reviewerId: `editorial-reviewer-${input.receipt.chapterId}`,
    listenedDurationMs: 10_000,
    playbackContexts: ["consumer-headphones", "speakers"],
    decision: "approve",
    scores: goodScores,
    decidedAt: t1,
    findingAcknowledgements: findingCodes,
  });
  binding = recordNarratorMasteredReview(binding, {
    id: `engineering_${input.receipt.chapterId}`,
    role: "engineering",
    reviewerId: `engineering-reviewer-${input.receipt.chapterId}`,
    listenedDurationMs: 10_000,
    playbackContexts: ["studio-headphones"],
    decision: "approve",
    scores: goodScores,
    decidedAt: t2,
    findingAcknowledgements: findingCodes,
  });
  assert.equal(binding.reviewSession.status, "ready-for-approval");
  return binding;
}

function approvedSession(
  ready: MasteredChapterReviewSession,
  approvedArtifact: ArtifactRecord,
  approver = "mastered-final-approver",
): MasteredChapterReviewSession {
  const approvalPartial: Omit<MasteredChapterReviewApproval, "fingerprint"> = {
    finalConfirmationId: `confirmation_${ready.chapterId}`,
    approvedByActorId: approver,
    approvedAt: t3.toISOString(),
    artifactReviewFingerprint: approvedArtifact.fingerprint,
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
    updatedAt: t3.toISOString(),
  };
  const session = Object.freeze({ ...partial, fingerprint: stableHash(partial) });
  assertMasteredChapterReviewSession(session);
  return session;
}

function approvedArtifact(artifact: ArtifactRecord, approver = "mastered-final-approver") {
  return recordArtifactReview(artifact, {
    decision: "approved",
    reviewerId: approver,
    notes: "Approved after complete editorial and engineering playback.",
    decidedAt: t3,
  });
}

function chapterFixture(
  chapterId: string,
  seed: number,
  approvedCasting = casting(),
): Readonly<{
  casting: NarratorCastingApproval;
  artifact: ArtifactRecord;
  authorization: NarratorMasteringAuthorization;
  receipt: NarratorApprovedMasteredChapterReceipt;
  binding: NarratorMasteredReviewBinding;
  approvedArtifact: ArtifactRecord;
  approvedSession: MasteredChapterReviewSession;
  approval: NarratorMasteredReviewApproval;
}> {
  const artifact = pendingMasteredArtifact(chapterId, seed);
  const auth = authorization(approvedCasting, chapterId);
  const narratorReceipt = receipt(auth, artifact);
  const binding = readyBinding({
    casting: approvedCasting,
    authorization: auth,
    receipt: narratorReceipt,
  });
  const reviewedArtifact = approvedArtifact(artifact);
  const reviewedSession = approvedSession(binding.reviewSession, reviewedArtifact);
  const approval = createNarratorMasteredReviewApproval({
    binding,
    approvedSession: reviewedSession,
    approvedArtifact: reviewedArtifact,
  });
  return Object.freeze({
    casting: approvedCasting,
    artifact,
    authorization: auth,
    receipt: narratorReceipt,
    binding,
    approvedArtifact: reviewedArtifact,
    approvedSession: reviewedSession,
    approval,
  });
}

function sequence(fixtures: readonly ReturnType<typeof chapterFixture>[]): BookChapterSequence {
  const chapters = fixtures.map((fixture, index) => {
    const partial: Omit<BookChapterSequenceEntry, "fingerprint"> = {
      ordinal: index + 1,
      role: "chapter",
      chapterId: fixture.receipt.chapterId,
      title: `Chapter ${index + 1}`,
      durationMs: 10_000,
      masteredArtifact: {
        id: fixture.approvedArtifact.id,
        revision: fixture.approvedArtifact.revision,
        fingerprint: fixture.approvedArtifact.fingerprint,
        contentHash: fixture.approvedArtifact.integrity.contentHash,
        byteCount: fixture.approvedArtifact.integrity.byteCount,
      },
      masteredChainFingerprint: fixture.receipt.masteredChapterChainFingerprint,
      reviewSessionFingerprint: fixture.approvedSession.fingerprint,
      masteringPlanFingerprint: fixture.receipt.planFingerprint,
    };
    return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
  });
  const partial: Omit<BookChapterSequence, "fingerprint"> = {
    schemaVersion: "storyteller-book-chapter-sequence-v1",
    id: "book_sequence_narrator_001",
    projectId: fixtures[0]!.casting.projectId,
    bookId: "book_narrator_001",
    title: "Narrator Evidence Book",
    languageTag: "en-AU",
    rightsFingerprint,
    engineeringProfileFingerprint: digest("engineering-profile"),
    output: { format: "wav", sampleRateHz: 44_100, channels: 1, bitDepth: 24 },
    chapters: Object.freeze(chapters),
    totalDurationMs: chapters.reduce((total, chapter) => total + chapter.durationMs, 0),
    status: "ready-for-credits",
    createdByActorId: "book-sequence-director",
    revision: 1,
    createdAt: t4.toISOString(),
    updatedAt: t4.toISOString(),
  };
  const value = Object.freeze({ ...partial, fingerprint: stableHash(partial) });
  assertBookChapterSequence(value);
  return value;
}

test("initial post-master review binding requires the exact narrator receipt", () => {
  const approvedCasting = casting();
  const artifact = pendingMasteredArtifact("chapter_001", 1);
  const auth = authorization(approvedCasting, "chapter_001");
  const narratorReceipt = receipt(auth, artifact);
  const binding = createNarratorMasteredReviewBinding({
    casting: approvedCasting,
    authorization: auth,
    receipt: narratorReceipt,
    reviewSession: initialReviewSession(narratorReceipt),
  });
  assert.doesNotThrow(() => assertNarratorMasteredReviewBinding(binding));
  assert.equal(binding.receipt.fingerprint, narratorReceipt.fingerprint);
  assert.equal(binding.masteredListeningApproval, false);
});

test("every human role must acknowledge the exact post-master finding set", () => {
  const approvedCasting = casting();
  const artifact = pendingMasteredArtifact("chapter_002", 2);
  const auth = authorization(approvedCasting, "chapter_002");
  const narratorReceipt = receipt(auth, artifact);
  const binding = createNarratorMasteredReviewBinding({
    casting: approvedCasting,
    authorization: auth,
    receipt: narratorReceipt,
    reviewSession: initialReviewSession(narratorReceipt),
  });
  assert.throws(
    () => recordNarratorMasteredReview(binding, {
      id: "editorial_missing_warning",
      role: "editorial",
      reviewerId: "editorial-reviewer",
      listenedDurationMs: 10_000,
      playbackContexts: ["consumer-headphones"],
      decision: "approve",
      scores: goodScores,
      decidedAt: t1,
      findingAcknowledgements: [],
    }),
    /NARRATOR_MASTERED_REVIEW_FINDINGS_UNACKNOWLEDGED/u,
  );
});

test("complete independent post-master review grants only mastered listening approval", () => {
  const fixture = chapterFixture("chapter_003", 3);
  assert.doesNotThrow(() => assertNarratorMasteredReviewApproval(fixture.approval));
  assert.equal(fixture.approval.masteredListeningApproval, true);
  assert.equal(fixture.approval.completeBookListeningApproval, false);
  assert.equal(fixture.approval.titleNarratorApproval, false);
  assert.equal(fixture.approval.titleReleaseAuthority, false);
  assert.equal(fixture.approval.publicationAuthority, false);
});

test("the final post-master approver must be independent from both listening roles", () => {
  const approvedCasting = casting();
  const artifact = pendingMasteredArtifact("chapter_004", 4);
  const auth = authorization(approvedCasting, "chapter_004");
  const narratorReceipt = receipt(auth, artifact);
  const binding = readyBinding({
    casting: approvedCasting,
    authorization: auth,
    receipt: narratorReceipt,
  });
  const reviewer = `editorial-reviewer-${narratorReceipt.chapterId}`;
  const reviewedArtifact = approvedArtifact(artifact, reviewer);
  const reviewedSession = approvedSession(binding.reviewSession, reviewedArtifact, reviewer);
  assert.throws(
    () => createNarratorMasteredReviewApproval({
      binding,
      approvedSession: reviewedSession,
      approvedArtifact: reviewedArtifact,
    }),
    /NARRATOR_MASTERED_REVIEW_FINAL_APPROVER_NOT_INDEPENDENT/u,
  );
});

test("mastered artifact, receipt and review substitutions fail closed", () => {
  const fixture = chapterFixture("chapter_005", 5);
  const replacement = pendingMasteredArtifact("chapter_005_replacement", 6);
  assert.throws(
    () => createNarratorMasteredReviewApproval({
      binding: fixture.binding,
      approvedSession: fixture.approvedSession,
      approvedArtifact: replacement,
    }),
    /NARRATOR_MASTERED_REVIEW_APPROVED_ARTIFACT_MISMATCH/u,
  );
  assert.throws(
    () => assertNarratorMasteredReviewApproval({
      ...fixture.approval,
      receipt: { ...fixture.receipt, planFingerprint: digest("other-plan") },
    }),
    /NARRATOR_MASTERED_CHAPTER_FINGERPRINT_INVALID|NARRATOR_MASTERED_REVIEW_APPROVAL_FINGERPRINT_INVALID/u,
  );
});

test("public post-master review view redacts voice, casting and reviewer evidence", () => {
  const fixture = chapterFixture("chapter_006", 6);
  const view = narratorMasteredReviewPublicView(fixture.approval);
  const json = JSON.stringify(view);
  assert.equal(view.narratorEvidenceBound, true);
  assert.equal(view.masteredListeningApproval, true);
  assert.equal(json.includes("magician-narrator"), false);
  assert.equal(json.includes(fixture.casting.fingerprint), false);
  assert.equal(json.includes("editorial-reviewer"), false);
});

test("book sequence requires one exact narrator mastered approval per chapter", () => {
  const approvedCasting = casting();
  const first = chapterFixture("chapter_a", 10, approvedCasting);
  const second = chapterFixture("chapter_b", 11, approvedCasting);
  const genericSequence = sequence([first, second]);
  const bound = createNarratorBookChapterSequence({
    casting: approvedCasting,
    sequence: genericSequence,
    chapterApprovals: [first.approval, second.approval],
  });
  assert.doesNotThrow(() => assertNarratorBookChapterSequence(bound));
  assert.equal(bound.chapters.length, 2);
  assert.equal(bound.masteredChapterListeningComplete, true);
  assert.equal(bound.completeBookListeningApproval, false);
  assert.equal(bound.titleNarratorApproval, false);
});

test("book sequencing rejects missing, duplicate or substituted narrator evidence", () => {
  const approvedCasting = casting();
  const first = chapterFixture("chapter_c", 12, approvedCasting);
  const second = chapterFixture("chapter_d", 13, approvedCasting);
  const genericSequence = sequence([first, second]);
  assert.throws(
    () => createNarratorBookChapterSequence({
      casting: approvedCasting,
      sequence: genericSequence,
      chapterApprovals: [first.approval],
    }),
    /NARRATOR_BOOK_SEQUENCE_APPROVAL_COUNT_MISMATCH/u,
  );
  assert.throws(
    () => createNarratorBookChapterSequence({
      casting: approvedCasting,
      sequence: genericSequence,
      chapterApprovals: [first.approval, first.approval],
    }),
    /NARRATOR_BOOK_SEQUENCE_APPROVAL_DUPLICATE/u,
  );
  assert.throws(
    () => createNarratorBookChapterSequence({
      casting: approvedCasting,
      sequence: genericSequence,
      chapterApprovals: [first.approval, { ...second.approval, approvedArtifact: first.approval.approvedArtifact }],
    }),
    /NARRATOR_MASTERED_REVIEW_APPROVAL_FINGERPRINT_INVALID|NARRATOR_BOOK_SEQUENCE_CHAPTER_BINDING_MISMATCH/u,
  );
});

test("book sequence public view proves narrator binding without exposing private identity", () => {
  const approvedCasting = casting();
  const first = chapterFixture("chapter_e", 14, approvedCasting);
  const genericSequence = sequence([first]);
  const bound = createNarratorBookChapterSequence({
    casting: approvedCasting,
    sequence: genericSequence,
    chapterApprovals: [first.approval],
  });
  const view = narratorBookSequencePublicView(bound);
  const json = JSON.stringify(view);
  assert.equal(view.narratorEvidenceBound, true);
  assert.equal(view.masteredChapterListeningComplete, true);
  assert.equal(view.completeBookListeningApproval, false);
  assert.equal(view.titleReleaseAuthority, false);
  assert.equal(json.includes("magician-narrator"), false);
  assert.equal(json.includes(approvedCasting.fingerprint), false);
  assert.equal(json.includes(first.approval.reviewSession.reviews[0]!.reviewerId), false);
});
