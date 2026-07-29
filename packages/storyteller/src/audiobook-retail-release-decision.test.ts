import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileAudiobookRetailReleaseDecisionStore,
  assertAudiobookRetailReleaseDecision,
  assertAudiobookRetailReleaseDecisionMatchesSources,
  audiobookRetailReleaseDecisionPublicView,
  createAudiobookRetailReleaseDecision,
  type AudiobookRetailDistributorAccountEvidence,
  type AudiobookRetailReleaseDecision,
} from "./audiobook-retail-release-decision.js";
import { stableHash } from "./index.js";
import { FileProjectStore } from "./project-store.js";
import {
  retailReleaseAt,
} from "./test-support/retail-release-policy-fixture.js";
import {
  retailReleaseFixture,
} from "./test-support/retail-release-review-fixture.js";

function recomputeDecision(
  partial: Omit<AudiobookRetailReleaseDecision, "fingerprint">,
): AudiobookRetailReleaseDecision {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function recomputeAccount(
  partial: Omit<AudiobookRetailDistributorAccountEvidence, "fingerprint">,
): AudiobookRetailDistributorAccountEvidence {
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

test("independent publisher authority authorizes one short-lived controlled delivery attempt", async () => {
  const value = retailReleaseFixture();
  const decision = createAudiobookRetailReleaseDecision(value.input);
  assert.equal(decision.status, "authorized-for-controlled-delivery");
  assert.equal(decision.maximumDeliveryAttempts, 1);
  assert.equal(decision.narration.sourceKind, "human-performance");
  assert.equal(decision.narration.platformAuthorisationPresent, false);
  assert.doesNotThrow(() => assertAudiobookRetailReleaseDecision(decision));
  assert.doesNotThrow(() =>
    assertAudiobookRetailReleaseDecisionMatchesSources(decision, value.input)
  );

  const root = await mkdtemp(join(tmpdir(), "storyteller-release-decision-"));
  try {
    const store = new FileAudiobookRetailReleaseDecisionStore(
      new FileProjectStore(root),
    );
    const first = await store.create(decision, "release_decision_store_actor_001");
    const second = await store.create(decision, "release_decision_store_actor_001");
    assert.equal(first.envelopeHash, second.envelopeHash);
    assert.equal(
      (await store.require(decision.id)).payload.fingerprint,
      decision.fingerprint,
    );

    const view = audiobookRetailReleaseDecisionPublicView(decision);
    const serialised = JSON.stringify(view);
    const audit = await readFile(join(root, "audit", "2026-07-29.jsonl"), "utf8");
    const auditMetadata = JSON.stringify(
      audit.trim().split(/\r?\n/u).filter(Boolean).map((line) =>
        (JSON.parse(line) as { metadata: unknown }).metadata
      ),
    );
    for (const forbidden of [
      value.input.packageReview.projectId,
      value.input.inspection.packageId,
      value.input.inspection.fingerprint,
      value.input.packageManifest.fingerprint,
      value.input.rights.rightsFingerprint,
      value.input.narration.id,
      value.input.distributorAccount.id,
      value.input.distributorAccount.accountReferenceHash,
      value.input.finalConfirmationId,
      value.input.decidedByActorId,
      value.input.distributorAccount.verifiedByActorId,
      "fileSetFingerprint",
      "evidenceFingerprint",
      "accountReferenceHash",
    ]) {
      assert.equal(serialised.includes(forbidden), false);
      assert.equal(auditMetadata.includes(forbidden), false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("synthetic narration requires current title-scoped platform authorisation", () => {
  const value = retailReleaseFixture("synthetic-voice");
  const decision = createAudiobookRetailReleaseDecision(value.input);
  assert.equal(decision.narration.platformAuthorisationPresent, true);
  assert.match(
    decision.narration.platformAuthorisationFingerprint ?? "",
    /^[a-f0-9]{64}$/u,
  );

  assert.throws(
    () => createAudiobookRetailReleaseDecision({
      ...value.input,
      decidedAt: new Date("2026-08-05T00:00:00.000Z"),
      validUntil: "2026-08-05T01:00:00.000Z",
    }),
    /AUDIOBOOK_RETAIL_AUTHORISATION_NOT_CURRENT|AUDIOBOOK_RETAIL_ACCOUNT_NOT_CURRENT/u,
  );
});

test("expired rights, stale account access and overlong decision windows fail closed", () => {
  const expired = retailReleaseFixture("human-performance", {
    expiresAt: retailReleaseAt(10).toISOString(),
  });
  assert.throws(
    () => createAudiobookRetailReleaseDecision(expired.input),
    /AUDIOBOOK_RETAIL_RELEASE_DECISION_RIGHTS_EXPIRED/u,
  );

  const value = retailReleaseFixture();
  const { fingerprint: _accountFingerprint, ...accountBase } = value.account;
  const staleAccount = recomputeAccount({
    ...accountBase,
    expiresAt: retailReleaseAt(10).toISOString(),
  });
  assert.throws(
    () => createAudiobookRetailReleaseDecision({
      ...value.input,
      distributorAccount: staleAccount,
    }),
    /AUDIOBOOK_RETAIL_ACCOUNT_NOT_CURRENT/u,
  );

  assert.throws(
    () => createAudiobookRetailReleaseDecision({
      ...value.input,
      validUntil: "2026-08-02T00:00:00.000Z",
    }),
    /AUDIOBOOK_RETAIL_RELEASE_DECISION_VALIDITY_INVALID/u,
  );
});

test("reviewers, approver, attestor and access verifier cannot self-authorize delivery", () => {
  const value = retailReleaseFixture();
  for (const actorId of [
    "release_package_editor_001",
    "release_package_engineer_001",
    "release_package_review_manager_001",
    "narration_rights_attestor_001",
    "distribution_access_verifier_001",
  ]) {
    assert.throws(
      () => createAudiobookRetailReleaseDecision({
        ...value.input,
        decidedByActorId: actorId,
      }),
      /AUDIOBOOK_RETAIL_RELEASE_DECISION_INDEPENDENT_AUTHORITY_REQUIRED/u,
    );
  }
  assert.throws(
    () => createAudiobookRetailReleaseDecision({
      ...value.input,
      decidedByActorId: "bot_release_authority",
    }),
    /AUDIOBOOK_RETAIL_RELEASE_DECISION_ACTOR_INVALID/u,
  );
});

test("cross-project account evidence and changed narration identity remain blocked", () => {
  const value = retailReleaseFixture();
  const { fingerprint: _accountFingerprint, ...accountBase } = value.account;
  const wrongAccount = recomputeAccount({
    ...accountBase,
    projectId: "project_release_decision_other_001",
  });
  assert.throws(
    () => createAudiobookRetailReleaseDecision({
      ...value.input,
      distributorAccount: wrongAccount,
    }),
    /AUDIOBOOK_RETAIL_RELEASE_DECISION_SOURCE_SCOPE_MISMATCH/u,
  );

  const { fingerprint: _narrationFingerprint, ...narrationBase } = value.narration;
  const changedNarration = Object.freeze({
    ...narrationBase,
    id: "retail_narration_release_changed_001",
    fingerprint: stableHash({
      ...narrationBase,
      id: "retail_narration_release_changed_001",
    }),
  });
  assert.throws(
    () => createAudiobookRetailReleaseDecision({
      ...value.input,
      narration: changedNarration,
    }),
    /AUDIOBOOK_RETAIL_RELEASE_DECISION_NARRATION_MISMATCH/u,
  );
});

test("recomputed decision state cannot replace the approved package-review identity", () => {
  const value = retailReleaseFixture();
  const decision = createAudiobookRetailReleaseDecision(value.input);
  const { fingerprint: _fingerprint, ...base } = decision;
  const changed = recomputeDecision({
    ...base,
    packageReview: Object.freeze({
      ...decision.packageReview,
      id: "retail_package_review_structurally_wrong_001",
    }),
  });
  assert.doesNotThrow(() => assertAudiobookRetailReleaseDecision(changed));
  assert.throws(
    () => assertAudiobookRetailReleaseDecisionMatchesSources(changed, value.input),
    /AUDIOBOOK_RETAIL_RELEASE_DECISION_SOURCE_MISMATCH/u,
  );
});
