import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAudiobookRetailEncodingPolicy,
  assertAudiobookRetailNarrationEligibilityEvidence,
  assertAudiobookRetailPlatformAuthorisation,
  assertCurrentAudiobookRetailEncodingPolicy,
  audiobookRetailEncodingPolicyPublicView,
  audiobookRetailNarrationEligibilityPublicView,
  createAcxAudibleRetailEncodingPolicy,
  createAudiobookRetailNarrationEligibilityEvidence,
  createAudiobookRetailPlatformAuthorisation,
  type AudiobookRetailBitRateKbps,
  type AudiobookRetailEncodingPolicy,
  type AudiobookRetailNarrationEligibilityEvidence,
  type AudiobookRetailPlatformAuthorisation,
} from "./audiobook-retail-policy.js";
import { stableHash } from "./index.js";

const now = new Date("2026-07-28T05:00:00.000Z");
const reviewedAt = "2026-07-28T00:00:00.000Z";
const expiresAt = "2026-10-28T00:00:00.000Z";
const sourceReference =
  "ACX audio submission requirements reviewed 2026-07-28";
const rightsFingerprint = "a".repeat(64);

function policy(
  bitRateKbps: AudiobookRetailBitRateKbps = 192,
): AudiobookRetailEncodingPolicy {
  return createAcxAudibleRetailEncodingPolicy({
    externalVersion: "2026-04-15",
    reviewedAt,
    expiresAt,
    sourceReference,
    bitRateKbps,
    now,
  });
}

function authorisation(
  retailPolicy = policy(),
  input: Readonly<{
    id?: string;
    projectId?: string;
    bookId?: string;
    effectiveAt?: string;
    expiresAt?: string;
    now?: Date;
  }> = {},
): AudiobookRetailPlatformAuthorisation {
  return createAudiobookRetailPlatformAuthorisation({
    id: input.id ?? "retail_auth_acx_001",
    authorisationType: "title-specific",
    projectId: input.projectId ?? "project_retail_001",
    bookId: input.bookId ?? "book_retail_001",
    policy: retailPolicy,
    authorisationEvidenceId: "evidence_acx_authorisation_001",
    effectiveAt: input.effectiveAt ?? "2026-07-20T00:00:00.000Z",
    expiresAt: input.expiresAt ?? "2026-10-20T00:00:00.000Z",
    now: input.now ?? now,
  });
}

function syntheticEvidence(
  retailPolicy = policy(),
  platformAuthorisation = authorisation(retailPolicy),
  input: Readonly<{
    id?: string;
    projectId?: string;
    bookId?: string;
    sourceKind?: "synthetic-voice" | "mixed-performance";
    attestedByActorId?: string;
    attestedAt?: string;
    now?: Date;
  }> = {},
): AudiobookRetailNarrationEligibilityEvidence {
  return createAudiobookRetailNarrationEligibilityEvidence({
    id: input.id ?? "retail_narration_eligibility_001",
    projectId: input.projectId ?? "project_retail_001",
    bookId: input.bookId ?? "book_retail_001",
    policy: retailPolicy,
    sourceKind: input.sourceKind ?? "synthetic-voice",
    rightsFingerprint,
    attestedByActorId:
      input.attestedByActorId ?? "distribution_editor_001",
    attestedAt: input.attestedAt ?? "2026-07-28T01:00:00.000Z",
    platformAuthorisation,
    now: input.now ?? now,
  });
}

test("ACX policy captures current official file, track, acoustic and sample requirements", () => {
  const retailPolicy = policy();

  assert.deepEqual(retailPolicy.output, {
    format: "mp3",
    codec: "mp3",
    bitRateMode: "cbr",
    bitRateKbps: 192,
    sampleRateHz: 44_100,
    channelPolicy: "book-consistent-mono-or-stereo",
  });
  assert.deepEqual(retailPolicy.track, {
    oneSectionPerFile: true,
    openingCreditSeparate: true,
    closingCreditSeparate: true,
    sectionHeaderRequired: true,
    maximumFileDurationMs: 7_200_000,
    splitSectionRequiresSecondaryHeader: true,
    standardUsAlphanumericFileNames: true,
    consistentChannelFormat: true,
  });
  assert.deepEqual(retailPolicy.acoustic, {
    rmsDb: {
      minimumInclusive: -23,
      maximumInclusive: -18,
    },
    peakDb: {
      comparator: "less-than",
      threshold: -3,
    },
    noiseFloorDbRms: {
      comparator: "less-than",
      threshold: -60,
    },
    roomToneMs: {
      minimumRecommended: 1_000,
      maximumAllowed: 5_000,
    },
    soundAndFormattingConsistencyRequired: true,
    extraneousSoundsProhibited: true,
  });
  assert.deepEqual(retailPolicy.sample, {
    maximumDurationMs: 300_000,
    mustComeFromAudiobook: true,
    explicitContentProhibited: true,
    humanContentSafetyReviewRequired: true,
    preferredSource: "book-beginning",
  });
  assert.deepEqual(retailPolicy.narration, {
    mode: "human-unless-platform-authorised",
    humanPerformanceAllowed: true,
    syntheticVoiceRequiresPlatformAuthorisation: true,
    mixedPerformanceRequiresPlatformAuthorisation: true,
    voiceConsentIsNotPlatformAuthorisation: true,
  });
  assert.doesNotThrow(() =>
    assertCurrentAudiobookRetailEncodingPolicy(retailPolicy, now)
  );

  const view = audiobookRetailEncodingPolicyPublicView(retailPolicy, now);
  assert.equal(view.current, true);
  assert.equal(view.oneSectionPerFile, true);
  assert.equal(view.separateCredits, true);
  assert.deepEqual(view.rmsDbRange, [-23, -18]);
  assert.deepEqual(view.roomToneRangeMs, [1_000, 5_000]);
  assert.equal(view.maximumSampleDurationMs, 300_000);
  const serialised = JSON.stringify(view);
  assert.equal(serialised.includes(sourceReference), false);

  const repeated = policy();
  assert.equal(repeated.fingerprint, retailPolicy.fingerprint);
  assert.equal(repeated.id, retailPolicy.id);
});

test("retail policies are versioned, current, expiring and tamper-evident", () => {
  const retailPolicy = policy();

  assert.throws(
    () => createAcxAudibleRetailEncodingPolicy({
      externalVersion: "2026-04-15",
      reviewedAt: "2026-07-29T00:00:00.000Z",
      expiresAt: "2026-10-29T00:00:00.000Z",
      sourceReference,
      now,
    }),
    /AUDIOBOOK_RETAIL_POLICY_NOT_CURRENT/u,
  );
  assert.throws(
    () => createAcxAudibleRetailEncodingPolicy({
      externalVersion: "2026-04-15",
      reviewedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-07-28T05:00:00.000Z",
      sourceReference,
      now,
    }),
    /AUDIOBOOK_RETAIL_POLICY_NOT_CURRENT/u,
  );
  assert.throws(
    () => createAcxAudibleRetailEncodingPolicy({
      externalVersion: "2026-04-15",
      reviewedAt: "2026-07-01T00:00:00.000Z",
      expiresAt: "2027-08-01T00:00:00.000Z",
      sourceReference,
      now,
    }),
    /AUDIOBOOK_RETAIL_POLICY_LIFETIME_INVALID/u,
  );
  assert.throws(
    () => createAcxAudibleRetailEncodingPolicy({
      externalVersion: "2026-04-15",
      reviewedAt,
      expiresAt,
      sourceReference,
      bitRateKbps: 128 as AudiobookRetailBitRateKbps,
      now,
    }),
    /AUDIOBOOK_RETAIL_POLICY_BIT_RATE_UNSUPPORTED/u,
  );
  assert.throws(
    () => assertCurrentAudiobookRetailEncodingPolicy(
      retailPolicy,
      new Date(expiresAt),
    ),
    /AUDIOBOOK_RETAIL_POLICY_NOT_CURRENT/u,
  );

  const {
    fingerprint: _canonicalFingerprint,
    ...canonicalBase
  } = retailPolicy;
  const alteredCanonicalBase = {
    ...canonicalBase,
    track: {
      ...canonicalBase.track,
      maximumFileDurationMs: 10_800_000,
    },
  };
  const alteredCanonical = {
    ...alteredCanonicalBase,
    fingerprint: stableHash(alteredCanonicalBase),
  } as AudiobookRetailEncodingPolicy;
  assert.throws(
    () => assertAudiobookRetailEncodingPolicy(alteredCanonical),
    /AUDIOBOOK_RETAIL_POLICY_REQUIREMENTS_INVALID/u,
  );

  const fingerprintTamper = {
    ...retailPolicy,
    sourceReference: "An unreviewed replacement source",
  };
  assert.throws(
    () => assertAudiobookRetailEncodingPolicy(fingerprintTamper),
    /AUDIOBOOK_RETAIL_POLICY_FINGERPRINT_INVALID/u,
  );

  const expiredView = audiobookRetailEncodingPolicyPublicView(
    retailPolicy,
    new Date("2026-10-28T00:00:01.000Z"),
  );
  assert.equal(expiredView.current, false);
});

test("human performance eligibility requires a real human attestation", () => {
  const retailPolicy = policy();
  const evidence = createAudiobookRetailNarrationEligibilityEvidence({
    id: "retail_narration_human_001",
    projectId: "project_retail_001",
    bookId: "book_retail_001",
    policy: retailPolicy,
    sourceKind: "human-performance",
    rightsFingerprint,
    attestedByActorId: "distribution_editor_human_001",
    attestedAt: "2026-07-28T01:00:00.000Z",
    now,
  });

  assert.equal(evidence.status, "eligible");
  assert.equal(evidence.platformAuthorisation, undefined);
  assert.doesNotThrow(() =>
    assertAudiobookRetailNarrationEligibilityEvidence(
      evidence,
      retailPolicy,
      now,
    )
  );
  const view = audiobookRetailNarrationEligibilityPublicView(
    evidence,
    retailPolicy,
    now,
  );
  assert.equal(view.platformAuthorisationRequired, false);
  assert.equal(view.platformAuthorisationPresent, false);

  assert.throws(
    () => createAudiobookRetailNarrationEligibilityEvidence({
      id: "retail_narration_bot_001",
      projectId: "project_retail_001",
      bookId: "book_retail_001",
      policy: retailPolicy,
      sourceKind: "human-performance",
      rightsFingerprint,
      attestedByActorId: "bot_distribution_001",
      attestedAt: "2026-07-28T01:00:00.000Z",
      now,
    }),
    /AUDIOBOOK_RETAIL_NARRATION_ATTESTOR_INVALID/u,
  );
  assert.throws(
    () => createAudiobookRetailNarrationEligibilityEvidence({
      id: "retail_narration_human_authorised_001",
      projectId: "project_retail_001",
      bookId: "book_retail_001",
      policy: retailPolicy,
      sourceKind: "human-performance",
      rightsFingerprint,
      attestedByActorId: "distribution_editor_human_001",
      attestedAt: "2026-07-28T01:00:00.000Z",
      platformAuthorisation: authorisation(retailPolicy),
      now,
    }),
    /AUDIOBOOK_RETAIL_NARRATION_AUTHORISATION_UNEXPECTED/u,
  );
  assert.throws(
    () => createAudiobookRetailNarrationEligibilityEvidence({
      id: "retail_narration_early_attestation_001",
      projectId: "project_retail_001",
      bookId: "book_retail_001",
      policy: retailPolicy,
      sourceKind: "human-performance",
      rightsFingerprint,
      attestedByActorId: "distribution_editor_human_001",
      attestedAt: "2026-07-27T23:59:59.000Z",
      now,
    }),
    /AUDIOBOOK_RETAIL_NARRATION_ATTESTATION_DATE_INVALID/u,
  );
});

test("synthetic and mixed narration require current title-scoped Audible authorisation", () => {
  const retailPolicy = policy();

  assert.throws(
    () => createAudiobookRetailNarrationEligibilityEvidence({
      id: "retail_narration_missing_auth_001",
      projectId: "project_retail_001",
      bookId: "book_retail_001",
      policy: retailPolicy,
      sourceKind: "synthetic-voice",
      rightsFingerprint,
      attestedByActorId: "distribution_editor_001",
      attestedAt: "2026-07-28T01:00:00.000Z",
      now,
    }),
    /AUDIOBOOK_RETAIL_NARRATION_PLATFORM_AUTHORISATION_REQUIRED/u,
  );

  const approvedAuthorisation = authorisation(retailPolicy);
  const synthetic = syntheticEvidence(retailPolicy, approvedAuthorisation);
  assert.equal(synthetic.status, "eligible");
  assert.equal(
    synthetic.platformAuthorisation?.bookId,
    "book_retail_001",
  );
  assert.doesNotThrow(() =>
    assertAudiobookRetailPlatformAuthorisation(
      approvedAuthorisation,
      retailPolicy,
      now,
    )
  );

  const mixed = syntheticEvidence(
    retailPolicy,
    authorisation(retailPolicy, { id: "retail_auth_acx_mixed_001" }),
    {
      id: "retail_narration_mixed_001",
      sourceKind: "mixed-performance",
    },
  );
  assert.equal(mixed.sourceKind, "mixed-performance");

  const wrongBookAuthorisation = authorisation(retailPolicy, {
    id: "retail_auth_acx_wrong_book_001",
    bookId: "book_retail_other_001",
  });
  assert.throws(
    () => syntheticEvidence(retailPolicy, wrongBookAuthorisation),
    /AUDIOBOOK_RETAIL_NARRATION_AUTHORISATION_SCOPE_MISMATCH/u,
  );

  const policy256 = policy(256);
  assert.throws(
    () => syntheticEvidence(policy256, approvedAuthorisation),
    /AUDIOBOOK_RETAIL_AUTHORISATION_POLICY_MISMATCH/u,
  );
  assert.throws(
    () => authorisation(retailPolicy, {
      id: "retail_auth_acx_expired_001",
      expiresAt: "2026-07-28T05:00:00.000Z",
    }),
    /AUDIOBOOK_RETAIL_AUTHORISATION_NOT_CURRENT/u,
  );
});

test("authorisation and eligibility stay bound after recomputed semantic tampering", () => {
  const retailPolicy = policy();
  const approvedAuthorisation = authorisation(retailPolicy);
  const evidence = syntheticEvidence(retailPolicy, approvedAuthorisation);

  const {
    fingerprint: _authorisationFingerprint,
    ...authorisationBase
  } = approvedAuthorisation;
  const changedAuthorisationBase = {
    ...authorisationBase,
    bookId: "book_retail_other_001",
  };
  const changedAuthorisation = {
    ...changedAuthorisationBase,
    fingerprint: stableHash(changedAuthorisationBase),
  } as AudiobookRetailPlatformAuthorisation;
  const {
    fingerprint: _evidenceFingerprint,
    ...evidenceBase
  } = evidence;
  const changedEvidenceBase = {
    ...evidenceBase,
    platformAuthorisation: changedAuthorisation,
  };
  const changedEvidence = {
    ...changedEvidenceBase,
    fingerprint: stableHash(changedEvidenceBase),
  } as AudiobookRetailNarrationEligibilityEvidence;
  assert.throws(
    () => assertAudiobookRetailNarrationEligibilityEvidence(
      changedEvidence,
      retailPolicy,
      now,
    ),
    /AUDIOBOOK_RETAIL_NARRATION_AUTHORISATION_SCOPE_MISMATCH/u,
  );

  const publicView = audiobookRetailNarrationEligibilityPublicView(
    evidence,
    retailPolicy,
    now,
  );
  const serialised = JSON.stringify(publicView);
  assert.equal(publicView.platformAuthorisationRequired, true);
  assert.equal(publicView.platformAuthorisationPresent, true);
  for (const forbidden of [
    evidence.projectId,
    evidence.bookId,
    evidence.rightsFingerprint,
    evidence.attestedByActorId,
    evidence.policyFingerprint,
    approvedAuthorisation.id,
    approvedAuthorisation.authorisationEvidenceId,
  ]) {
    assert.equal(serialised.includes(forbidden), false);
  }
});
