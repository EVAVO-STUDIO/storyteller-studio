import assert from "node:assert/strict";
import test from "node:test";
import { stableHash } from "./index.js";
import {
  admittedNarratorRetailPackageApprovalPublicView,
  admittedNarratorRetailSampleApprovalPublicView,
  assertAdmittedNarratorRetailPackageApproval,
  assertAdmittedNarratorRetailSampleApproval,
  createAdmittedNarratorRetailPackageApproval,
  createAdmittedNarratorRetailSampleApproval,
  type AdmittedNarratorRetailPackageApproval,
  type AdmittedNarratorRetailSampleApproval,
} from "./narrator-retail-package-admission.js";
import {
  createTestAdmittedNarratorRetailPackageFixture,
  createTestAdmittedNarratorRetailSampleFixture,
} from "../test-support/narrator-retail-package.js";
import { testDigest } from "../test-support/narrator-casting.js";

test("adapted narrator admission survives safety-reviewed sample and inspected retail package", async () => {
  const fixture = await createTestAdmittedNarratorRetailPackageFixture({
    mode: "adapted",
    projectId: "project_retail_package_adapted",
    bookId: "book_retail_package_adapted",
  });
  const value = fixture.approval;
  assert.doesNotThrow(() => assertAdmittedNarratorRetailPackageApproval(value));
  assert.equal(
    value.sample.tracks.admittedPlan.wholeBookApproval.binding.reference.audiobook.admittedCasting.profileAdmission.trainingProvenanceBound,
    true,
  );
  assert.equal(value.sample.retailSampleEngineeringComplete, true);
  assert.equal(value.sample.retailSampleListeningApproval, true);
  assert.equal(value.privatePackageBuildComplete, true);
  assert.equal(value.privatePackageInspectionComplete, true);
  assert.equal(value.retailPackageReviewApproval, true);
  assert.equal(value.releaseDecisionEligible, true);
  assert.equal(value.releaseDecisionAuthority, false);
  assert.equal(value.publicationAuthority, false);
});

test("zero-shot narrator uses the same package boundary without invented training provenance", async () => {
  const fixture = await createTestAdmittedNarratorRetailPackageFixture({
    mode: "zero-shot",
    projectId: "project_retail_package_zero_shot",
    bookId: "book_retail_package_zero_shot",
  });
  const value = fixture.approval;
  assert.doesNotThrow(() => assertAdmittedNarratorRetailPackageApproval(value));
  assert.equal(
    value.sample.tracks.admittedPlan.wholeBookApproval.binding.reference.audiobook.admittedCasting.profileAdmission.training,
    null,
  );
  assert.equal(value.syntheticNarrationDeclared, true);
  assert.equal(value.platformAuthorisationBound, true);
});

test("sample approval cannot detach from the selected retail track approval", async () => {
  const selected = await createTestAdmittedNarratorRetailSampleFixture({
    projectId: "project_retail_sample_selected",
    bookId: "book_retail_sample_selected",
  });
  const other = await createTestAdmittedNarratorRetailSampleFixture({
    projectId: "project_retail_sample_other",
    bookId: "book_retail_sample_other",
  });
  assert.throws(
    () => createAdmittedNarratorRetailSampleApproval({
      tracks: selected.tracks.approval,
      plan: other.plan,
      chain: other.chain,
      reviewSession: other.reviewSession,
      approvedSampleArtifact: other.approvedSampleArtifact,
    }),
    /ADMITTED_NARRATOR_RETAIL_SAMPLE_LINEAGE_MISMATCH|AUDIOBOOK_RETAIL_SAMPLE/u,
  );
});

test("sample artifact substitution fails even after the outer record is rehashed", async () => {
  const fixture = await createTestAdmittedNarratorRetailSampleFixture({
    projectId: "project_retail_sample_artifact",
    bookId: "book_retail_sample_artifact",
  });
  const value = fixture.approval;
  const changedArtifact = {
    ...value.approvedSampleArtifact,
    fingerprint: testDigest("substituted-approved-sample"),
  };
  const { fingerprint: _fingerprint, ...base } = value;
  const changedBase = {
    ...base,
    approvedSampleArtifact: changedArtifact,
  };
  const changed = {
    ...changedBase,
    fingerprint: stableHash(changedBase),
  } as AdmittedNarratorRetailSampleApproval;
  assert.throws(
    () => assertAdmittedNarratorRetailSampleApproval(changed),
    /ADMITTED_NARRATOR_RETAIL_SAMPLE_ARTIFACT_MISMATCH|ARTIFACT/u,
  );
});

test("package manifest, build and inspection substitution fail closed", async () => {
  const selected = await createTestAdmittedNarratorRetailPackageFixture({
    projectId: "project_retail_package_selected",
    bookId: "book_retail_package_selected",
  });
  const other = await createTestAdmittedNarratorRetailPackageFixture({
    projectId: "project_retail_package_other",
    bookId: "book_retail_package_other",
  });
  assert.throws(
    () => createAdmittedNarratorRetailPackageApproval({
      sample: selected.sample.approval,
      manifest: other.manifest,
      build: other.build,
      inspection: other.inspection,
      reviewSession: other.reviewSession,
    }),
    /ADMITTED_NARRATOR_RETAIL_PACKAGE_LINEAGE_MISMATCH|AUDIOBOOK_RETAIL_PACKAGE/u,
  );
});

test("retail package approval cannot grant delivery, release or publication authority", async () => {
  const fixture = await createTestAdmittedNarratorRetailPackageFixture({
    projectId: "project_retail_package_authority",
    bookId: "book_retail_package_authority",
  });
  const value = fixture.approval;
  const { fingerprint: _fingerprint, ...base } = value;
  const changedBase = {
    ...base,
    deliveryAuthority: true,
    releaseDecisionAuthority: true,
    titleReleaseAuthority: true,
    publicationAuthority: true,
  };
  const changed = {
    ...changedBase,
    fingerprint: stableHash(changedBase),
  } as unknown as AdmittedNarratorRetailPackageApproval;
  assert.throws(
    () => assertAdmittedNarratorRetailPackageApproval(changed),
    /ADMITTED_NARRATOR_RETAIL_PACKAGE_AUTHORITY_INVALID/u,
  );
});

test("public sample and package views prove completion without private narrator or reviewer identity", async () => {
  const fixture = await createTestAdmittedNarratorRetailPackageFixture({
    projectId: "project_retail_package_public",
    bookId: "book_retail_package_public",
  });
  const sampleView = admittedNarratorRetailSampleApprovalPublicView(
    fixture.sample.approval,
  );
  const packageView = admittedNarratorRetailPackageApprovalPublicView(
    fixture.approval,
  );
  const json = JSON.stringify({ sampleView, packageView });
  assert.equal(sampleView.retailSampleListeningApproval, true);
  assert.equal(packageView.privatePackageInspectionComplete, true);
  assert.equal(packageView.releaseDecisionEligible, true);
  for (const forbidden of [
    fixture.approval.voice.profileId,
    fixture.approval.voice.profileHash,
    fixture.approval.profileAdmissionHash,
    fixture.approval.admittedCastingFingerprint,
    fixture.sample.approval.plan.selection.selectedByActorId,
    fixture.sample.approval.plan.safety.reviewedByActorId,
    fixture.sample.reviewSession.approval!.approvedByActorId,
    fixture.reviewSession.approval!.approvedByActorId,
    fixture.sample.approvedSampleArtifact.id,
    fixture.manifest.files[0]!.artifact.id,
    fixture.inspection.sourceBuild.fingerprint,
  ]) assert.equal(json.includes(forbidden), false);
});
