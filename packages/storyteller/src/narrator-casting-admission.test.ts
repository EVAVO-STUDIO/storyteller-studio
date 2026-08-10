import assert from "node:assert/strict";
import test from "node:test";
import {
  admittedNarratorCastingPublicView,
  assertAdmittedNarratorCasting,
  narratorCastingFromAdmission,
  type AdmittedNarratorCasting,
} from "./narrator-casting-admission.js";
import {
  createTestAdmittedNarratorCasting,
  rehashTestAdmittedNarratorCasting,
  testDigest,
} from "../test-support/narrator-casting.js";

test("admitted casting binds the full adapted profile admission to one human casting decision", () => {
  const admitted = createTestAdmittedNarratorCasting("book_001");
  assert.doesNotThrow(() => assertAdmittedNarratorCasting(admitted));
  assert.equal(admitted.projectId, admitted.casting.projectId);
  assert.equal(
    admitted.profileAdmission.admissionHash,
    admittedNarratorCastingPublicView(admitted).profileAdmissionHash,
  );
  assert.equal(
    admitted.profileAdmission.profileHash,
    admitted.casting.voice.profileHash,
  );
  assert.equal(admitted.profileAdmission.trainingProvenanceBound, true);
  assert.equal(admitted.admissionVerified, true);
  assert.equal(admitted.castingApproved, true);
  assert.equal(admitted.publicationAuthority, false);
  assert.equal(narratorCastingFromAdmission(admitted), admitted.casting);
});

test("zero-shot casting retains an explicit admission without invented training provenance", () => {
  const admitted = createTestAdmittedNarratorCasting("book_zero_shot", {
    mode: "zero-shot",
    seed: "zero-shot",
  });
  assert.doesNotThrow(() => assertAdmittedNarratorCasting(admitted));
  assert.equal(admitted.profileAdmission.trainingProvenanceBound, false);
  assert.equal(admitted.profileAdmission.training, null);
  assert.equal(admittedNarratorCastingPublicView(admitted).trainingProvenanceBound, false);
});

test("a standalone casting approval is not a production casting admission", () => {
  const admitted = createTestAdmittedNarratorCasting("book_direct_casting");
  assert.throws(
    () => assertAdmittedNarratorCasting(
      admitted.casting as unknown as AdmittedNarratorCasting,
    ),
    /NARRATOR_CASTING_ADMISSION_SHAPE_INVALID/u,
  );
});

test("rehashing cannot substitute the admitted profile, admission hash or casting", () => {
  const admitted = createTestAdmittedNarratorCasting("book_substitution");

  const changedAdmissionHash = rehashTestAdmittedNarratorCasting({
    ...admitted,
    profileAdmission: {
      ...admitted.profileAdmission,
      admissionHash: testDigest("another-admission"),
    },
  });
  assert.throws(
    () => assertAdmittedNarratorCasting(changedAdmissionHash),
    /NARRATOR_PROFILE_ADMISSION_FINGERPRINT_INVALID/u,
  );

  const other = createTestAdmittedNarratorCasting("book_substitution", {
    profileRevision: admitted.casting.voice.revision + 1,
    seed: "other-profile",
  });
  const changedCasting = rehashTestAdmittedNarratorCasting({
    ...admitted,
    casting: other.casting,
  });
  assert.throws(
    () => assertAdmittedNarratorCasting(changedCasting),
    /NARRATOR_PROFILE_PIN_MISMATCH/u,
  );
});

test("admitted casting cannot gain default, release or publication authority", () => {
  const admitted = createTestAdmittedNarratorCasting("book_authority");
  const changed = rehashTestAdmittedNarratorCasting({
    ...admitted,
    publicationAuthority: true,
  } as unknown as AdmittedNarratorCasting);
  assert.throws(
    () => assertAdmittedNarratorCasting(changed),
    /NARRATOR_CASTING_ADMISSION_AUTHORITY_INVALID/u,
  );
});

test("public admitted-casting view omits private training and human identity evidence", () => {
  const admitted = createTestAdmittedNarratorCasting("book_public_view");
  const view = admittedNarratorCastingPublicView(admitted);
  const serialised = JSON.stringify(view);
  assert.equal(view.admissionVerified, true);
  assert.equal(view.castingApproved, true);
  assert.equal(view.publicationAuthority, false);
  assert.equal(serialised.includes(admitted.casting.approvedBy), false);
  assert.equal(serialised.includes(admitted.casting.fingerprint), false);
  assert.equal(serialised.includes(admitted.casting.modelArtifactTreeSha256), false);
  assert.equal(
    serialised.includes(admitted.profileAdmission.training?.trainingReceiptHash ?? "missing"),
    false,
  );
  assert.equal(
    serialised.includes(admitted.profileAdmission.training?.selectedCheckpointId ?? "missing"),
    false,
  );
});
