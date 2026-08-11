import assert from "node:assert/strict";
import test from "node:test";
import {
  createAcxAudibleRetailEncodingPolicy,
  createAudiobookRetailNarrationEligibilityEvidence,
  createAudiobookRetailPlatformAuthorisation,
  type AudiobookRetailEncodingPolicy,
  type AudiobookRetailNarrationEligibilityEvidence,
} from "./audiobook-retail-policy.js";
import { stableHash } from "./index.js";
import {
  admittedNarratorRetailTrackPlanPublicView,
  assertAdmittedNarratorRetailTrackPlan,
  createAdmittedNarratorRetailTrackPlan,
  type AdmittedNarratorRetailTrackPlan,
} from "./narrator-retail-track-admission.js";
import {
  createTestAdmittedNarratorAudiobookFixture,
} from "../test-support/narrator-audiobook.js";
import { testDigest } from "../test-support/narrator-casting.js";

const policyNow = new Date("2026-08-10T11:00:00.000Z");
const plannedAt = new Date("2026-08-10T11:05:00.000Z");

function policy(): AudiobookRetailEncodingPolicy {
  return createAcxAudibleRetailEncodingPolicy({
    id: "retail_policy_admitted_narrator_001",
    externalVersion: "acx-2026-08",
    reviewedAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2027-08-01T00:00:00.000Z",
    sourceReference: "Reviewed ACX and Audible audiobook delivery requirements for the governed narrator retail boundary.",
    bitRateKbps: 192,
    now: policyNow,
  });
}

function syntheticEligibility(input: Readonly<{
  projectId: string;
  bookId: string;
  rightsFingerprint: string;
  policy: AudiobookRetailEncodingPolicy;
}>): AudiobookRetailNarrationEligibilityEvidence {
  const platformAuthorisation = createAudiobookRetailPlatformAuthorisation({
    id: `platform_authorisation_${input.bookId}`,
    authorisationType: "title-specific",
    projectId: input.projectId,
    bookId: input.bookId,
    policy: input.policy,
    authorisationEvidenceId: `audible_authorisation_evidence_${input.bookId}`,
    effectiveAt: "2026-08-10T10:47:00.000Z",
    expiresAt: "2027-07-31T00:00:00.000Z",
    now: policyNow,
  });
  return createAudiobookRetailNarrationEligibilityEvidence({
    id: `narration_eligibility_${input.bookId}`,
    projectId: input.projectId,
    bookId: input.bookId,
    policy: input.policy,
    sourceKind: "synthetic-voice",
    rightsFingerprint: input.rightsFingerprint,
    attestedByActorId: "retail-narration-rights-attestor",
    attestedAt: "2026-08-10T10:48:00.000Z",
    platformAuthorisation,
    now: policyNow,
  });
}

function humanEligibility(input: Readonly<{
  projectId: string;
  bookId: string;
  rightsFingerprint: string;
  policy: AudiobookRetailEncodingPolicy;
}>): AudiobookRetailNarrationEligibilityEvidence {
  return createAudiobookRetailNarrationEligibilityEvidence({
    id: `human_narration_eligibility_${input.bookId}`,
    projectId: input.projectId,
    bookId: input.bookId,
    policy: input.policy,
    sourceKind: "human-performance",
    rightsFingerprint: input.rightsFingerprint,
    attestedByActorId: "human-narration-attestor",
    attestedAt: "2026-08-10T10:48:00.000Z",
    now: policyNow,
  });
}

async function admittedPlan(
  mode: "zero-shot" | "adapted" = "adapted",
): Promise<AdmittedNarratorRetailTrackPlan> {
  const fixture = await createTestAdmittedNarratorAudiobookFixture({
    mode,
    projectId: `project_retail_${mode.replace("-", "_")}`,
    bookId: `book_retail_${mode.replace("-", "_")}`,
  });
  const retailPolicy = policy();
  const narrationEligibility = syntheticEligibility({
    projectId: fixture.wholeBookApproval.projectId,
    bookId: fixture.wholeBookApproval.bookId,
    rightsFingerprint:
      fixture.wholeBookApproval.approvedArtifact.rights.rightsFingerprint,
    policy: retailPolicy,
  });
  return createAdmittedNarratorRetailTrackPlan({
    id: `retail_track_plan_admitted_${mode.replace("-", "_")}`,
    wholeBookApproval: fixture.wholeBookApproval,
    policy: retailPolicy,
    narrationEligibility,
    createdByActorId: "retail-track-planning-director",
    createdAt: plannedAt,
  });
}

test("adapted narrator retail planning retains exact whole-book admission and platform authorisation", async () => {
  const value = await admittedPlan("adapted");
  assert.doesNotThrow(() => assertAdmittedNarratorRetailTrackPlan(value));
  assert.equal(value.wholeBookApproval.binding.reference.audiobook.admittedCasting.profileAdmission.trainingProvenanceBound, true);
  assert.equal(value.narrationEligibility.sourceKind, "synthetic-voice");
  assert.ok(value.narrationEligibility.platformAuthorisation);
  assert.equal(value.plan.status, "ready-for-encoding");
  assert.equal(value.retailEncodingEligible, true);
  assert.equal(value.completeBookListeningApproval, true);
  assert.equal(value.releaseDecisionAuthority, false);
  assert.equal(value.publicationAuthority, false);
});

test("zero-shot narrator uses the same authorised retail boundary without invented training provenance", async () => {
  const value = await admittedPlan("zero-shot");
  assert.doesNotThrow(() => assertAdmittedNarratorRetailTrackPlan(value));
  assert.equal(value.wholeBookApproval.binding.reference.audiobook.admittedCasting.profileAdmission.training, null);
  assert.equal(value.wholeBookApproval.binding.reference.audiobook.admittedCasting.profileAdmission.trainingProvenanceBound, false);
  assert.equal(value.syntheticNarrationDeclared, true);
  assert.equal(value.platformAuthorisationBound, true);
});

test("owned voice rights cannot be misrepresented as human performance for platform admission", async () => {
  const fixture = await createTestAdmittedNarratorAudiobookFixture({
    projectId: "project_retail_human_misclassification",
    bookId: "book_retail_human_misclassification",
  });
  const retailPolicy = policy();
  const narrationEligibility = humanEligibility({
    projectId: fixture.wholeBookApproval.projectId,
    bookId: fixture.wholeBookApproval.bookId,
    rightsFingerprint:
      fixture.wholeBookApproval.approvedArtifact.rights.rightsFingerprint,
    policy: retailPolicy,
  });
  assert.throws(
    () => createAdmittedNarratorRetailTrackPlan({
      wholeBookApproval: fixture.wholeBookApproval,
      policy: retailPolicy,
      narrationEligibility,
      createdByActorId: "retail-track-planning-director",
      createdAt: plannedAt,
    }),
    /ADMITTED_NARRATOR_RETAIL_NARRATION_SCOPE_MISMATCH/u,
  );
});

test("cross-title platform authorisation and rights evidence fail closed", async () => {
  const fixture = await createTestAdmittedNarratorAudiobookFixture({
    projectId: "project_retail_scope_selected",
    bookId: "book_retail_scope_selected",
  });
  const retailPolicy = policy();
  const wrong = syntheticEligibility({
    projectId: "project_retail_scope_other",
    bookId: "book_retail_scope_other",
    rightsFingerprint: testDigest("other-rights"),
    policy: retailPolicy,
  });
  assert.throws(
    () => createAdmittedNarratorRetailTrackPlan({
      wholeBookApproval: fixture.wholeBookApproval,
      policy: retailPolicy,
      narrationEligibility: wrong,
      createdByActorId: "retail-track-planning-director",
      createdAt: plannedAt,
    }),
    /ADMITTED_NARRATOR_RETAIL_NARRATION_SCOPE_MISMATCH/u,
  );
});

test("rehashing cannot substitute the approved reference master or generic retail plan", async () => {
  const value = await admittedPlan();
  const { fingerprint: _planFingerprint, ...planBase } = value.plan;
  const changedPlanBase = {
    ...planBase,
    referenceMaster: {
      ...value.plan.referenceMaster,
      fingerprint: testDigest("substituted-reference-master"),
    },
  };
  const changedPlan = {
    ...changedPlanBase,
    fingerprint: stableHash(changedPlanBase),
  };
  const { fingerprint: _fingerprint, ...outerBase } = value;
  const changedOuterBase = { ...outerBase, plan: changedPlan };
  const changed = {
    ...changedOuterBase,
    fingerprint: stableHash(changedOuterBase),
  } as AdmittedNarratorRetailTrackPlan;
  assert.throws(
    () => assertAdmittedNarratorRetailTrackPlan(changed),
    /ADMITTED_NARRATOR_RETAIL_TRACK_PLAN_LINEAGE_MISMATCH|AUDIOBOOK_RETAIL_TRACK/u,
  );
});

test("authority escalation is rejected even when the outer record is rehashed", async () => {
  const value = await admittedPlan();
  const { fingerprint: _fingerprint, ...outerBase } = value;
  const changedBase = {
    ...outerBase,
    releaseDecisionAuthority: true,
    publicationAuthority: true,
  };
  const changed = {
    ...changedBase,
    fingerprint: stableHash(changedBase),
  } as unknown as AdmittedNarratorRetailTrackPlan;
  assert.throws(
    () => assertAdmittedNarratorRetailTrackPlan(changed),
    /ADMITTED_NARRATOR_RETAIL_TRACK_PLAN_AUTHORITY_INVALID/u,
  );
});

test("public retail planning view proves authorisation without exposing narrator or platform evidence identity", async () => {
  const value = await admittedPlan();
  const view = admittedNarratorRetailTrackPlanPublicView(value);
  const json = JSON.stringify(view);
  assert.equal(view.narratorAdmissionComplete, true);
  assert.equal(view.completeBookListeningApproval, true);
  assert.equal(view.syntheticNarrationDeclared, true);
  assert.equal(view.platformAuthorisationBound, true);
  assert.equal(view.retailEncodingEligible, true);
  assert.equal(json.includes(value.voice.profileId), false);
  assert.equal(json.includes(value.voice.profileHash), false);
  assert.equal(json.includes(value.profileAdmissionHash), false);
  assert.equal(json.includes(value.admittedCastingFingerprint), false);
  assert.equal(json.includes(value.narrationEligibility.platformAuthorisation!.id), false);
});
