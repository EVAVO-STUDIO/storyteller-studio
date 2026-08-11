import assert from "node:assert/strict";
import test from "node:test";
import { stableHash } from "./index.js";
import {
  admittedNarratorAudiobookSequencePublicView,
  admittedNarratorWholeBookPublicView,
  assertAdmittedNarratorAudiobookReferenceMaster,
  assertAdmittedNarratorAudiobookSequence,
  assertAdmittedNarratorWholeBookReviewApproval,
  createAdmittedNarratorAudiobookSequence,
} from "./narrator-audiobook-admission.js";
import {
  admittedNarratorBookCreditPublicView,
  assertAdmittedNarratorBookCreditDelivery,
  assertAdmittedNarratorBookCreditGeneration,
} from "./narrator-credit-admission.js";
import {
  narratorProductionBinding,
} from "./narrator-production-job.js";
import {
  createTestAdmittedNarratorAudiobookFixture,
  createTestAdmittedNarratorCreditFixture,
} from "../test-support/narrator-audiobook.js";
import {
  createTestAdmittedNarratorCasting,
  testDigest,
} from "../test-support/narrator-casting.js";

test("credit production binds the exact admitted profile hash into deterministic narrator identity", async () => {
  const projectId = "project_credit_identity_001";
  const bookId = "book_credit_identity_001";
  const selectedCasting = createTestAdmittedNarratorCasting(projectId, {
    seed: "credit-identity-selected",
    profileRevision: 4,
  });
  const selected = await createTestAdmittedNarratorCreditFixture({
    admittedCasting: selectedCasting,
    bookId,
    kind: "opening",
    rightsFingerprint: testDigest("credit-identity-rights"),
    seed: "credit-identity-selected",
  });
  assert.doesNotThrow(() => assertAdmittedNarratorBookCreditGeneration(
    selected.generation,
  ));
  const binding = narratorProductionBinding(selected.generation.plan.job);
  assert.ok(binding);
  assert.equal(binding.profileAdmissionHash, selectedCasting.profileAdmission.admissionHash);
  assert.equal(binding.admittedCastingFingerprint, selectedCasting.fingerprint);
  assert.equal(binding.castingFingerprint, selectedCasting.casting.fingerprint);
  assert.deepEqual(binding.voice, selectedCasting.casting.voice);
  assert.equal(
    selected.generation.plan.material.material.voiceProfileHash,
    selectedCasting.casting.voice.profileHash,
  );

  const replacementCasting = createTestAdmittedNarratorCasting(projectId, {
    seed: "credit-identity-replacement",
    profileRevision: 5,
  });
  const replacement = await createTestAdmittedNarratorCreditFixture({
    admittedCasting: replacementCasting,
    bookId,
    kind: "opening",
    rightsFingerprint: testDigest("credit-identity-rights"),
    seed: "credit-identity-replacement",
  });
  assert.notEqual(
    selected.generation.productionCacheKey,
    replacement.generation.productionCacheKey,
  );
  assert.notEqual(
    selected.generation.productionJobId,
    replacement.generation.productionJobId,
  );
});

test("credit delivery reopens the exact selected take, review and lossless master chain", async () => {
  const admittedCasting = createTestAdmittedNarratorCasting(
    "project_credit_delivery_001",
    { seed: "credit-delivery" },
  );
  const fixture = await createTestAdmittedNarratorCreditFixture({
    admittedCasting,
    bookId: "book_credit_delivery_001",
    kind: "closing",
    rightsFingerprint: testDigest("credit-delivery-rights"),
    seed: "credit-delivery",
  });
  assert.doesNotThrow(() => assertAdmittedNarratorBookCreditDelivery(
    fixture.delivery,
  ));
  assert.equal(
    fixture.delivery.selectedTakeRecordId,
    fixture.reviewSession.selection?.candidateTakeId,
  );
  assert.equal(
    fixture.delivery.creditMaster.fingerprint,
    fixture.masterChain.creditMaster.payload.fingerprint,
  );
  assert.equal(fixture.delivery.eligibleForAdmittedBookAssembly, true);
  assert.equal(fixture.delivery.completeBookListeningApproval, false);
});

test("complete audiobook assembly requires both admitted credits and every exact chapter artifact", async () => {
  const fixture = await createTestAdmittedNarratorAudiobookFixture({
    projectId: "project_complete_audiobook_001",
    bookId: "book_complete_audiobook_001",
  });
  assert.doesNotThrow(() => assertAdmittedNarratorAudiobookSequence(
    fixture.audiobook,
  ));
  assert.equal(
    fixture.audiobook.totalProductionJobCount,
    fixture.chapters.totalProductionJobCount + 2,
  );
  assert.equal(fixture.audiobook.sequence.components[0]?.role, "opening-credit");
  assert.equal(
    fixture.audiobook.sequence.components.at(-1)?.role,
    "closing-credit",
  );
  assert.throws(
    () => createAdmittedNarratorAudiobookSequence({
      id: "audiobook_missing_chapter_artifact",
      chapters: fixture.chapters,
      opening: fixture.opening.delivery,
      closing: fixture.closing.delivery,
      chapterArtifacts: fixture.chapterApprovals.slice(0, 1)
        .map((chapter) => chapter.approvedArtifact),
      createdByActorId: "audiobook-director",
      createdAt: new Date("2026-08-10T11:00:00.000Z"),
    }),
    /ADMITTED_NARRATOR_AUDIOBOOK_CHAPTER_ARTIFACT_COUNT_MISMATCH/u,
  );
});

test("a credit from another profile admission cannot enter the selected narrator audiobook", async () => {
  const fixture = await createTestAdmittedNarratorAudiobookFixture({
    projectId: "project_cross_credit_001",
    bookId: "book_cross_credit_001",
  });
  const replacementCasting = createTestAdmittedNarratorCasting(
    fixture.admittedCasting.projectId,
    { seed: "cross-credit-replacement", profileRevision: 9 },
  );
  const replacementOpening = await createTestAdmittedNarratorCreditFixture({
    admittedCasting: replacementCasting,
    bookId: fixture.audiobook.bookId,
    kind: "opening",
    rightsFingerprint: fixture.chapterApprovals[0]!.mastered.rightsFingerprint,
    seed: "cross-credit-replacement",
  });
  assert.throws(
    () => createAdmittedNarratorAudiobookSequence({
      id: "audiobook_cross_credit",
      chapters: fixture.chapters,
      opening: replacementOpening.delivery,
      closing: fixture.closing.delivery,
      chapterArtifacts: fixture.chapterApprovals.map(
        (chapter) => chapter.approvedArtifact,
      ),
      createdByActorId: "audiobook-director",
      createdAt: new Date("2026-08-10T11:00:00.000Z"),
    }),
    /ADMITTED_NARRATOR_AUDIOBOOK_CREDIT_CASTING_MISMATCH/u,
  );
});

test("zero-shot and adapted narrator provenance remain distinct through whole-book approval", async () => {
  const adapted = await createTestAdmittedNarratorAudiobookFixture({
    mode: "adapted",
    projectId: "project_adapted_whole_book_001",
    bookId: "book_adapted_whole_book_001",
  });
  const zeroShot = await createTestAdmittedNarratorAudiobookFixture({
    mode: "zero-shot",
    projectId: "project_zero_shot_whole_book_001",
    bookId: "book_zero_shot_whole_book_001",
  });
  assert.notEqual(
    adapted.wholeBookApproval.profileAdmissionHash,
    zeroShot.wholeBookApproval.profileAdmissionHash,
  );
  assert.notEqual(
    adapted.wholeBookApproval.admittedCastingFingerprint,
    zeroShot.wholeBookApproval.admittedCastingFingerprint,
  );
  assert.ok(adapted.admittedCasting.profileAdmission.training);
  assert.equal(zeroShot.admittedCasting.profileAdmission.training, null);
  assert.equal(adapted.wholeBookApproval.completeBookListeningApproval, true);
  assert.equal(zeroShot.wholeBookApproval.completeBookListeningApproval, true);
});

test("reference mastering remains bound to the exact admitted sequence and render evidence", async () => {
  const fixture = await createTestAdmittedNarratorAudiobookFixture({
    projectId: "project_reference_binding_001",
    bookId: "book_reference_binding_001",
  });
  assert.doesNotThrow(() => assertAdmittedNarratorAudiobookReferenceMaster(
    fixture.reference,
  ));
  const { fingerprint: _renderFingerprint, ...renderBase } =
    fixture.reference.renderEvidence;
  const alteredRenderBase = {
    ...renderBase,
    sequenceFingerprint: testDigest("another-audiobook-sequence"),
  };
  const alteredRender = {
    ...alteredRenderBase,
    fingerprint: stableHash(alteredRenderBase),
  };
  const {
    fingerprint: _referenceFingerprint,
    ...referenceBase
  } = fixture.reference;
  const alteredReferenceBase = {
    ...referenceBase,
    renderEvidence: alteredRender,
    renderEvidenceFingerprint: alteredRender.fingerprint,
  };
  assert.throws(
    () => assertAdmittedNarratorAudiobookReferenceMaster({
      ...alteredReferenceBase,
      fingerprint: stableHash(alteredReferenceBase),
    }),
    /ADMITTED_NARRATOR_REFERENCE_MASTER_LINEAGE_MISMATCH/u,
  );
});

test("continuous whole-book approval grants retail eligibility but no title or publication authority", async () => {
  const fixture = await createTestAdmittedNarratorAudiobookFixture({
    projectId: "project_whole_book_authority_001",
    bookId: "book_whole_book_authority_001",
  });
  const approval = fixture.wholeBookApproval;
  assert.doesNotThrow(() => assertAdmittedNarratorWholeBookReviewApproval(
    approval,
  ));
  assert.equal(approval.completeBookListeningApproval, true);
  assert.equal(approval.eligibleForRetailEncoding, true);
  assert.equal(approval.titleNarratorApproval, false);
  assert.equal(approval.titleReleaseAuthority, false);
  assert.equal(approval.publicationAuthority, false);

  const { fingerprint: _fingerprint, ...partial } = approval;
  const escalated = {
    ...partial,
    titleNarratorApproval: true as never,
    publicationAuthority: true as never,
  };
  assert.throws(
    () => assertAdmittedNarratorWholeBookReviewApproval({
      ...escalated,
      fingerprint: stableHash(escalated),
    }),
    /ADMITTED_NARRATOR_WHOLE_BOOK_REVIEW_APPROVAL_AUTHORITY_INVALID/u,
  );
});

test("public whole-book projections prove admission completeness without private narrator evidence", async () => {
  const fixture = await createTestAdmittedNarratorAudiobookFixture({
    projectId: "project_whole_book_public_001",
    bookId: "book_whole_book_public_001",
  });
  const creditView = admittedNarratorBookCreditPublicView(
    fixture.opening.delivery,
  );
  const sequenceView = admittedNarratorAudiobookSequencePublicView(
    fixture.audiobook,
  );
  const wholeBookView = admittedNarratorWholeBookPublicView(
    fixture.wholeBookApproval,
  );
  const json = JSON.stringify([creditView, sequenceView, wholeBookView]);
  assert.equal(sequenceView.narratorAdmissionComplete, true);
  assert.equal(wholeBookView.completeBookListeningApproval, true);
  for (const forbidden of [
    fixture.admittedCasting.casting.voice.profileId,
    fixture.admittedCasting.casting.voice.profileHash,
    fixture.admittedCasting.profileAdmission.admissionHash,
    fixture.admittedCasting.fingerprint,
    fixture.admittedCasting.casting.fingerprint,
    fixture.opening.generation.productionJobId,
    fixture.opening.generation.productionCacheKey,
    "checkpoint-epoch-003",
    "whole-book-editorial-reviewer",
    "whole-book-engineering-reviewer",
    "whole-book-final-approver",
  ]) assert.equal(json.includes(forbidden), false);
});
