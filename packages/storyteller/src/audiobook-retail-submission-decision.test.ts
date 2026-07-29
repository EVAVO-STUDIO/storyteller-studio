import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ArtifactRightsSnapshot } from "./artifact-registry.js";
import type { AudiobookRetailNarrationEligibilityEvidence } from "./audiobook-retail-policy.js";
import type { AudiobookRetailDistributorAccountEvidence } from "./audiobook-retail-release-decision.js";
import {
  FileAudiobookRetailSubmissionDecisionStore,
  assertAudiobookRetailSubmissionDecision,
  assertAudiobookRetailSubmissionDecisionMatchesSources,
  audiobookRetailSubmissionDecisionPublicView,
  createAudiobookRetailSubmissionDecision,
  type AudiobookRetailSubmissionDecision,
  type AudiobookRetailSubmissionDecisionSources,
} from "./audiobook-retail-submission-decision.js";
import { stableHash } from "./index.js";
import { FileProjectStore } from "./project-store.js";
import { retailReleaseAt } from "./test-support/retail-release-policy-fixture.js";
import { retailSubmissionReviewFixture } from "./test-support/retail-submission-review-fixture.js";

function sources(
  sourceKind: "human-performance" | "synthetic-voice" = "human-performance",
): AudiobookRetailSubmissionDecisionSources {
  const fixture = retailSubmissionReviewFixture(sourceKind);
  return {
    submissionReview: fixture.submissionReview,
    deliveryAttempt: fixture.deliveryAttempt,
    releaseDecision: fixture.releaseDecision,
    packageReview: fixture.release.packageReview,
    inspection: fixture.release.inspection,
    packageManifest: fixture.release.manifest,
    trackPlan: fixture.release.plan,
    policy: fixture.release.policy,
    narration: fixture.release.narration,
    rights: fixture.release.rights,
    distributorAccount: fixture.release.account,
  };
}

function input(
  value: AudiobookRetailSubmissionDecisionSources = sources(),
) {
  return {
    sources: value,
    finalConfirmationId: "retail_submission_confirmation_001",
    decidedByActorId: "publisher_submission_authority_001",
    humanConfirmation: true as const,
    submissionMethod: "manual-acx-submit" as const,
    decidedAt: retailReleaseAt(17),
    validUntil: retailReleaseAt(18).toISOString(),
  };
}

function recomputeDecision(
  partial: Omit<AudiobookRetailSubmissionDecision, "fingerprint">,
): AudiobookRetailSubmissionDecision {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function recomputeAccount(
  partial: Omit<AudiobookRetailDistributorAccountEvidence, "fingerprint">,
): AudiobookRetailDistributorAccountEvidence {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function recomputeNarration(
  partial: Omit<AudiobookRetailNarrationEligibilityEvidence, "fingerprint">,
): AudiobookRetailNarrationEligibilityEvidence {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

test("independent authority authorizes one short-lived manual submission action", async () => {
  const value = input();
  const decision = createAudiobookRetailSubmissionDecision(value);
  assert.equal(decision.status, "authorized-for-single-submission");
  assert.equal(decision.maximumSubmissionAttempts, 1);
  assert.equal(decision.submissionMethod, "manual-acx-submit");
  assert.equal(decision.narration.platformAuthorisationPresent, false);
  assert.doesNotThrow(() => assertAudiobookRetailSubmissionDecision(decision));
  assert.doesNotThrow(() =>
    assertAudiobookRetailSubmissionDecisionMatchesSources(
      decision,
      value.sources,
    )
  );

  const root = await mkdtemp(join(tmpdir(), "storyteller-submission-decision-"));
  try {
    const store = new FileAudiobookRetailSubmissionDecisionStore(
      new FileProjectStore(root),
    );
    const first = await store.create(decision, "submission_decision_store_actor_001");
    const repeated = await store.create(decision, "submission_decision_store_actor_001");
    assert.equal(first.envelopeHash, repeated.envelopeHash);
    assert.equal(
      (await store.require(decision.id)).payload.fingerprint,
      decision.fingerprint,
    );

    const view = audiobookRetailSubmissionDecisionPublicView(decision);
    const serialised = JSON.stringify(view);
    const audit = await readFile(join(root, "audit", "2026-07-29.jsonl"), "utf8");
    const auditMetadata = JSON.stringify(
      audit.trim().split(/\r?\n/u).filter(Boolean).map((line) =>
        (JSON.parse(line) as { metadata: unknown }).metadata
      ),
    );
    for (const forbidden of [
      decision.projectId,
      decision.packageId,
      decision.submissionReview.id,
      decision.submissionReview.fingerprint,
      decision.deliveryAttempt.id,
      decision.deliveryAttempt.remoteDraftReferenceHash,
      decision.releaseDecision.id,
      decision.packageReview.id,
      decision.inspection.id,
      decision.sourceManifest.id,
      decision.trackPlan.id,
      decision.policy.fingerprint,
      decision.rightsFingerprint,
      decision.narration.evidenceId,
      decision.distributorAccount.evidenceId,
      decision.distributorAccount.evidenceFingerprint,
      decision.package.fileSetFingerprint,
      decision.finalConfirmationId,
      decision.decidedByActorId,
      "remoteDraftReferenceHash",
      "fileSetFingerprint",
      "evidenceFingerprint",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
      assert.equal(auditMetadata.includes(forbidden), false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("synthetic narration remains bound to current title-scoped platform authorization", () => {
  const value = input(sources("synthetic-voice"));
  const decision = createAudiobookRetailSubmissionDecision(value);
  assert.equal(decision.narration.platformAuthorisationPresent, true);
  assert.match(
    decision.narration.platformAuthorisationFingerprint ?? "",
    /^[a-f0-9]{64}$/u,
  );

  const narration = value.sources.narration;
  const { fingerprint: _fingerprint, ...narrationBase } = narration;
  const withoutAuthorisation = recomputeNarration({
    ...narrationBase,
    platformAuthorisation: undefined as never,
  });
  assert.throws(
    () => createAudiobookRetailSubmissionDecision({
      ...value,
      sources: { ...value.sources, narration: withoutAuthorisation },
    }),
    /AUDIOBOOK_RETAIL_AUTHORISATION_REQUIRED|AUDIOBOOK_RETAIL_SUBMISSION_DECISION_NARRATION_MISMATCH/u,
  );
});

test("expired rights, stale account evidence and overlong validity windows fail closed", () => {
  const value = input();
  const expiredRights: ArtifactRightsSnapshot = Object.freeze({
    ...value.sources.rights,
    expiresAt: retailReleaseAt(17).toISOString(),
  });
  assert.throws(
    () => createAudiobookRetailSubmissionDecision({
      ...value,
      sources: { ...value.sources, rights: expiredRights },
    }),
    /AUDIOBOOK_RETAIL_SUBMISSION_DECISION_RIGHTS_EXPIRED/u,
  );

  const { fingerprint: _accountFingerprint, ...accountBase } =
    value.sources.distributorAccount;
  const staleAccount = recomputeAccount({
    ...accountBase,
    expiresAt: retailReleaseAt(17).toISOString(),
  });
  assert.throws(
    () => createAudiobookRetailSubmissionDecision({
      ...value,
      sources: { ...value.sources, distributorAccount: staleAccount },
    }),
    /AUDIOBOOK_RETAIL_ACCOUNT_NOT_CURRENT/u,
  );

  assert.throws(
    () => createAudiobookRetailSubmissionDecision({
      ...value,
      validUntil: new Date(retailReleaseAt(17).getTime() + 25 * 60 * 60 * 1_000)
        .toISOString(),
    }),
    /AUDIOBOOK_RETAIL_SUBMISSION_DECISION_VALIDITY_INVALID/u,
  );
});

test("reviewers, delivery actors and prior authorities cannot self-authorize submission", () => {
  const value = input();
  for (const actorId of [
    "submission_decision_editor_001",
    "submission_decision_engineer_001",
    "submission_review_decision_manager_001",
    "manual_delivery_operator_001",
    "publisher_release_authority_001",
    "distribution_access_verifier_001",
    "narration_rights_attestor_001",
  ]) {
    assert.throws(
      () => createAudiobookRetailSubmissionDecision({
        ...value,
        decidedByActorId: actorId,
      }),
      /AUDIOBOOK_RETAIL_SUBMISSION_DECISION_INDEPENDENT_AUTHORITY_REQUIRED/u,
    );
  }
  assert.throws(
    () => createAudiobookRetailSubmissionDecision({
      ...value,
      decidedByActorId: "bot_submission_authority",
    }),
    /AUDIOBOOK_RETAIL_SUBMISSION_DECISION_ACTOR_INVALID/u,
  );
});

test("changed account, narration or manifest evidence cannot replace approved sources", () => {
  const value = input();
  const { fingerprint: _accountFingerprint, ...accountBase } =
    value.sources.distributorAccount;
  const wrongAccount = recomputeAccount({
    ...accountBase,
    projectId: "project_submission_decision_other_001",
  });
  assert.throws(
    () => createAudiobookRetailSubmissionDecision({
      ...value,
      sources: { ...value.sources, distributorAccount: wrongAccount },
    }),
    /AUDIOBOOK_RETAIL_SUBMISSION_DECISION_SOURCE_SCOPE_MISMATCH/u,
  );

  const narration = value.sources.narration;
  const { fingerprint: _narrationFingerprint, ...narrationBase } = narration;
  const wrongNarration = recomputeNarration({
    ...narrationBase,
    id: "retail_narration_submission_changed_001",
  });
  assert.throws(
    () => createAudiobookRetailSubmissionDecision({
      ...value,
      sources: { ...value.sources, narration: wrongNarration },
    }),
    /AUDIOBOOK_RETAIL_SUBMISSION_DECISION_NARRATION_MISMATCH/u,
  );

  const manifest = value.sources.packageManifest;
  const { fingerprint: _manifestFingerprint, ...manifestBase } = manifest;
  const wrongManifest = Object.freeze({
    ...manifestBase,
    id: "retail_package_manifest_submission_changed_001",
    fingerprint: stableHash({
      ...manifestBase,
      id: "retail_package_manifest_submission_changed_001",
    }),
  });
  assert.throws(
    () => createAudiobookRetailSubmissionDecision({
      ...value,
      sources: { ...value.sources, packageManifest: wrongManifest },
    }),
    /AUDIOBOOK_RETAIL_SUBMISSION_DECISION_SOURCE_MISMATCH/u,
  );
});

test("recomputed decision state cannot replace the approved submission review", () => {
  const value = input();
  const decision = createAudiobookRetailSubmissionDecision(value);
  const { fingerprint: _fingerprint, ...base } = decision;
  const changed = recomputeDecision({
    ...base,
    submissionReview: Object.freeze({
      ...decision.submissionReview,
      id: "retail_submission_review_structurally_wrong_001",
    }),
  });
  assert.doesNotThrow(() => assertAudiobookRetailSubmissionDecision(changed));
  assert.throws(
    () => assertAudiobookRetailSubmissionDecisionMatchesSources(
      changed,
      value.sources,
    ),
    /AUDIOBOOK_RETAIL_SUBMISSION_DECISION_SOURCE_MISMATCH/u,
  );
});
