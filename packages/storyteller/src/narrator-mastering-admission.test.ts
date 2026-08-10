import assert from "node:assert/strict";
import test from "node:test";
import {
  stableHash,
  type ProjectManifest,
} from "./index.js";
import {
  createNarratorMonitoringPolicy,
} from "./narrator-book-monitor.js";
import {
  createAdmittedChapterNarratorReview,
  createAdmittedNarratorQualityReference,
  monitorAdmittedNarratorChapter,
  type AdmittedChapterNarratorReview,
} from "./narrator-chapter-admission.js";
import {
  assertAdmittedNarratorMasteringAuthorization,
  bindAdmittedNarratorMasteringAuthorization,
  type AdmittedNarratorMasteringAuthorization,
  type AdmittedNarratorMasteringContext,
} from "./narrator-mastering-admission.js";
import {
  NARRATOR_MASTERING_AUTHORIZATION_SCHEMA,
  assertNarratorMasteringAuthorization,
  type NarratorMasteringAuthorization,
} from "./narrator-mastering-chain.js";
import {
  createNarratorProductionJobs,
} from "./narrator-production-job.js";
import {
  createTestAdmittedNarratorCasting,
  testDigest,
} from "../test-support/narrator-casting.js";

const projectId = "project_admitted_mastering_001";
const chapterId = "chapter_001";
const sourceHash = testDigest("admitted-mastering-source");
const renderFingerprint = testDigest("admitted-mastering-render");

const manifest: ProjectManifest = {
  schemaVersion: "storyteller-project-v1",
  engineVersion: "0.2.0",
  id: projectId,
  title: "Admission-bound mastering",
  sourceHash,
  createdAt: "2026-08-10T21:00:00+10:00",
  status: "planned",
  rights: { ok: true, findings: [] },
  manuscript: {
    sourceHash,
    characterCount: 59,
    wordCount: 10,
    chapters: [{
      id: chapterId,
      ordinal: 1,
      title: "Chapter One",
      sourceStart: 0,
    }],
    segments: [
      {
        id: "segment_001",
        sourceHash,
        chapterId,
        chapterOrdinal: 1,
        chapterTitle: "Chapter One",
        ordinal: 1,
        kind: "narration",
        sourceStart: 0,
        sourceEnd: 30,
        text: "The first lamp failed quietly.",
        wordCount: 5,
        estimatedSpeechSeconds: 2.2,
      },
      {
        id: "segment_002",
        sourceHash,
        chapterId,
        chapterOrdinal: 1,
        chapterTitle: "Chapter One",
        ordinal: 2,
        kind: "narration",
        sourceStart: 31,
        sourceEnd: 59,
        text: "Mara waited beside the door.",
        wordCount: 5,
        estimatedSpeechSeconds: 2.1,
      },
    ],
    findings: [],
  },
  performance: {
    manuscriptHash: sourceHash,
    directions: [],
    calibrationSegmentIds: [],
  },
  providers: [{
    providerId: "audio_studio_local",
    label: "EVAVO Audio Studio",
    eligible: true,
    score: 100,
    reasons: [],
  }],
  visualBeats: [],
  fingerprint: testDigest("admitted-mastering-manifest"),
  findings: [],
};

const policy = createNarratorMonitoringPolicy({
  minimumTranscriptCoverage: 0.995,
  maximumInsertionRatio: 0.01,
  minimumSpeakerIdentitySimilarity: 0.86,
  maximumCadenceTemplateSimilarity: 0.78,
  maximumSentenceFinalContourRepetitionRatio: 0.62,
  maximumNoiseFloorDb: -55,
  maximumRoomToneDriftDb: 4,
  maximumSeamDiscontinuityScore: 0.25,
  maximumChapterDurationDriftRatio: 0.18,
  requireFinalWord: true,
  requireZeroClipping: true,
  forbidUnexpectedSpeakerChange: true,
});

const acoustic = Object.freeze({
  medianPitchHz: 128,
  pitchRangeSemitones: 9.5,
  speakingRateWpm: 151,
  pauseRatio: 0.18,
  energyRmsDb: -21,
  embeddingDistanceFromAnchor: 0.08,
});

function fixture(options: Readonly<{
  mode?: "zero-shot" | "adapted";
  seed?: string;
}> = {}): Readonly<{
  context: AdmittedNarratorMasteringContext;
  review: AdmittedChapterNarratorReview;
  technicalAuthorization: NarratorMasteringAuthorization;
}> {
  const seed = options.seed ?? "mastering-admission";
  const admittedCasting = createTestAdmittedNarratorCasting(projectId, options);
  const productionJobs = createNarratorProductionJobs(manifest, admittedCasting, 3);
  const reference = createAdmittedNarratorQualityReference({
    admittedCasting,
    acousticSignature: acoustic,
    expectedChapterDurationSeconds: 1_800,
    roomToneRmsDb: -58,
    evidenceHash: testDigest(`${seed}:quality-reference`),
  });
  const monitoring = monitorAdmittedNarratorChapter({
    admittedCasting,
    manifest,
    chapterId,
    productionJobs,
    renderFingerprint,
    policy,
    reference,
    objective: {
      segmentCount: 2,
      transcriptCoverage: 0.999,
      insertionRatio: 0.002,
      finalWordPresent: true,
      clippedSampleCount: 0,
      unexpectedSpeakerChangeCount: 0,
      minimumSpeakerIdentitySimilarity: 0.94,
      acousticSignature: acoustic,
      chapterDurationSeconds: 1_790,
      cadenceTemplateSimilarity: 0.44,
      sentenceFinalContourRepetitionRatio: 0.31,
      noiseFloorDb: -62,
      roomToneRmsDb: -57.5,
      maximumSeamDiscontinuityScore: 0.08,
      transcriptEvidenceHash: testDigest(`${seed}:chapter-transcript`),
      speakerIdentityEvidenceHash: testDigest(`${seed}:chapter-speaker`),
      acousticEvidenceHash: testDigest(`${seed}:chapter-acoustic`),
      engineeringEvidenceHash: testDigest(`${seed}:chapter-engineering`),
      measuredAt: "2026-08-10T21:30:00+10:00",
    },
  });
  const review = createAdmittedChapterNarratorReview({
    admittedCasting,
    manifest,
    productionJobs,
    policy,
    reference,
    monitoring,
    review: {
      objectiveFindingAcknowledgements: monitoring.objectiveMonitoring.findingCodes,
      expectedSegmentCount: 2,
      renderedSegmentCount: 2,
      transcriptErrorCount: 0,
      finalWordPresent: true,
      clippedSampleCount: 0,
      performanceScore: 4.7,
      continuityScore: 4.6,
      listeningEaseScore: 4.6,
      identityStabilityScore: 4.8,
      syntheticArtifactFlags: [],
      fatigueFlags: [],
      reviewerIds: ["reviewer-a", "reviewer-b", "reviewer-c"],
      reviewedAt: "2026-08-10T22:00:00+10:00",
    },
  });
  const partial: Omit<NarratorMasteringAuthorization, "fingerprint"> = {
    schemaVersion: NARRATOR_MASTERING_AUTHORIZATION_SCHEMA,
    projectId,
    chapterId,
    castingFingerprint: admittedCasting.casting.fingerprint,
    voice: admittedCasting.casting.voice,
    assembly: {
      planId: "assembly_admitted_mastering_001",
      planFingerprint: testDigest(`${seed}:assembly-plan`),
    },
    chapterRender: {
      fingerprint: review.renderFingerprint,
      commandFingerprint: testDigest(`${seed}:chapter-command`),
      outputContentHash: testDigest(`${seed}:chapter-output`),
      outputByteCount: 1_000,
      renderedAt: "2026-08-10T21:20:00+10:00",
    },
    sourceMaster: {
      id: "chapter_master_admitted_001",
      revision: 4,
      fingerprint: testDigest(`${seed}:chapter-master-fingerprint`),
      contentHash: testDigest(`${seed}:chapter-master-content`),
      byteCount: 1_000,
    },
    sourceEngineering: {
      artifact: {
        id: "chapter_engineering_admitted_001",
        revision: 2,
        fingerprint: testDigest(`${seed}:chapter-engineering-artifact`),
        contentHash: testDigest(`${seed}:chapter-engineering-content`),
        byteCount: 500,
      },
      evidenceFingerprint: testDigest(`${seed}:chapter-engineering-evidence`),
      profileFingerprint: testDigest(`${seed}:engineering-profile`),
    },
    chapterReview: {
      fingerprint: review.review.fingerprint,
      objectiveMonitoringFingerprint: review.review.objectiveMonitoringFingerprint,
      objectiveMonitoringPolicyFingerprint:
        review.review.objectiveMonitoringPolicyFingerprint,
      objectiveMonitoringReferenceFingerprint:
        review.review.objectiveMonitoringReferenceFingerprint,
      objectiveMonitoringObservationFingerprint:
        review.review.objectiveMonitoringObservationFingerprint,
      reviewerPanelFingerprint: review.review.reviewerPanelFingerprint,
      sourceFingerprint: review.chapterSourceFingerprint,
      reviewedAt: review.review.reviewedAt,
    },
    manuscriptSourceHash: review.monitoring.projectSourceHash,
    rightsFingerprint: testDigest(`${seed}:rights`),
    authorizedByActorId: "narrator-mastering-director",
    authorizedAt: "2026-08-10T22:10:00+10:00",
    masteringEligible: true,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  const technicalAuthorization = Object.freeze({
    ...partial,
    fingerprint: stableHash(partial),
  });
  assertNarratorMasteringAuthorization(technicalAuthorization);
  const context = Object.freeze({
    admittedCasting,
    manifest,
    productionJobs,
    policy,
    reference,
  });
  return { context, review, technicalAuthorization };
}

function rehash(
  value: AdmittedNarratorMasteringAuthorization,
  changes: Partial<Omit<AdmittedNarratorMasteringAuthorization, "fingerprint">>,
): AdmittedNarratorMasteringAuthorization {
  const { fingerprint: _ignored, ...partial } = value;
  const changed = { ...partial, ...changes };
  return { ...changed, fingerprint: stableHash(changed) };
}

test("adapted mastering authorization retains the complete profile admission and production lineage", () => {
  const scope = fixture();
  const value = bindAdmittedNarratorMasteringAuthorization({
    context: scope.context,
    review: scope.review,
    authorization: scope.technicalAuthorization,
  });
  assert.equal(value.profileAdmissionHash, scope.context.admittedCasting.profileAdmission.admissionHash);
  assert.equal(value.admittedCastingFingerprint, scope.context.admittedCasting.fingerprint);
  assert.equal(value.productionSetFingerprint, scope.review.productionSetFingerprint);
  assert.equal(value.productionJobCount, 2);
  assert.equal(value.admittedChapterReviewFingerprint, scope.review.fingerprint);
  assert.equal(value.authorization.fingerprint, scope.technicalAuthorization.fingerprint);
  assert.equal(value.masteredListeningApproval, false);
  assert.equal(value.titleNarratorApproval, false);
  assert.equal(value.publicationAuthority, false);
  assert.doesNotThrow(() => assertAdmittedNarratorMasteringAuthorization(value, scope.context));
});

test("zero-shot and adapted voices use the same admitted mastering boundary without invented training evidence", () => {
  const scope = fixture({ mode: "zero-shot", seed: "zero-shot-mastering" });
  const value = bindAdmittedNarratorMasteringAuthorization({
    context: scope.context,
    review: scope.review,
    authorization: scope.technicalAuthorization,
  });
  assert.equal(value.admittedCasting.profileAdmission.training, null);
  assert.equal(value.review.profileAdmissionHash, value.profileAdmissionHash);
  assert.doesNotThrow(() => assertAdmittedNarratorMasteringAuthorization(value, scope.context));
});

test("a technical authorization for another render cannot be attached to an admitted chapter review", () => {
  const scope = fixture();
  const { fingerprint: _ignored, ...partial } = scope.technicalAuthorization;
  const changed = {
    ...partial,
    chapterRender: {
      ...partial.chapterRender,
      fingerprint: testDigest("different-render"),
    },
  };
  const authorization = { ...changed, fingerprint: stableHash(changed) };
  assert.throws(
    () => bindAdmittedNarratorMasteringAuthorization({
      context: scope.context,
      review: scope.review,
      authorization,
    }),
    /ADMITTED_NARRATOR_MASTERING_TECHNICAL_AUTHORIZATION_MISMATCH/u,
  );
});

test("rehashing cannot substitute the profile admission, production set or admitted review", () => {
  const scope = fixture();
  const value = bindAdmittedNarratorMasteringAuthorization({
    context: scope.context,
    review: scope.review,
    authorization: scope.technicalAuthorization,
  });
  for (const changed of [
    rehash(value, { profileAdmissionHash: testDigest("other-admission") }),
    rehash(value, { productionSetFingerprint: testDigest("other-production-set") }),
    rehash(value, { admittedChapterReviewFingerprint: testDigest("other-review") }),
  ]) {
    assert.throws(
      () => assertAdmittedNarratorMasteringAuthorization(changed, scope.context),
      /ADMITTED_NARRATOR_MASTERING_REVIEW_BINDING_MISMATCH/u,
    );
  }
});

test("an admitted review from another casting cannot authorize mastering", () => {
  const selected = fixture({ seed: "selected-mastering" });
  const substituted = fixture({ seed: "substituted-mastering" });
  assert.throws(
    () => bindAdmittedNarratorMasteringAuthorization({
      context: selected.context,
      review: substituted.review,
      authorization: selected.technicalAuthorization,
    }),
    /ADMITTED_CHAPTER_REVIEW_|NARRATOR_PRODUCTION_PROFILE_ADMISSION_MISMATCH|NARRATOR_PRODUCTION_ADMITTED_CASTING_MISMATCH/u,
  );
});

test("outer authority escalation fails even after the admitted authorization is rehashed", () => {
  const scope = fixture();
  const value = bindAdmittedNarratorMasteringAuthorization({
    context: scope.context,
    review: scope.review,
    authorization: scope.technicalAuthorization,
  });
  const changed = rehash(value, {
    publicationAuthority: true as never,
  });
  assert.throws(
    () => assertAdmittedNarratorMasteringAuthorization(changed, scope.context),
    /ADMITTED_NARRATOR_MASTERING_AUTHORIZATION_AUTHORITY_INVALID/u,
  );
});
