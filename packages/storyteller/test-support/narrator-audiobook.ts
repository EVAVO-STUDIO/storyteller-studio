import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  analyseAudioEngineering,
  type AudioEngineeringCommand,
  type AudioEngineeringCommandResult,
  type AudioEngineeringRunner,
} from "../src/audio-engineering.js";
import {
  ingestPrivateArtifact,
} from "../src/artifact-ingest.js";
import {
  recordArtifactReview,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "../src/artifact-registry.js";
import { FileArtifactRegistry } from "../src/artifact-store.js";
import {
  type AudiobookReferenceMasterReviewScores,
} from "../src/audiobook-reference-master-review.js";
import {
  estimateAudiobookPcmByteCount,
  type AudiobookRenderEvidence,
  type AudiobookRenderResult,
} from "../src/audiobook-render.js";
import {
  approveBookCreditScript,
  createBookCreditPolicy,
  createBookCreditScript,
  recordBookCreditReview,
} from "../src/book-credit-script.js";
import {
  createBookCreditDeliverySnapshot,
} from "../src/book-credit-delivery.js";
import {
  promoteBookCreditMaster,
  type BookCreditMasterChain,
} from "../src/book-credit-master.js";
import {
  admitBookCreditTake,
  createBookCreditTranscriptEvidence,
} from "../src/book-credit-take.js";
import {
  approveBookCreditTakeSelection,
  createBookCreditTakeReviewSession,
  recordBookCreditTakeReview,
  selectBookCreditTake,
  type BookCreditTakeReviewScores,
  type BookCreditTakeReviewSession,
} from "../src/book-credit-take-review.js";
import {
  PRODUCTION_CALIBRATION_LOCK_SCHEMA_VERSION,
  type ProductionCalibrationLock,
} from "../src/calibration-admission.js";
import { createGenerationAudioEngineeringPolicy } from "../src/generation-audio-engineering.js";
import {
  ACX_AUDIOBOOK_PROFILE,
  stableHash,
} from "../src/index.js";
import {
  createAdmittedNarratorAudiobookSequence,
  createAdmittedNarratorWholeBookReviewApproval,
  createAdmittedNarratorWholeBookReviewBinding,
  ingestAdmittedNarratorAudiobookReferenceMaster,
  recordAdmittedNarratorWholeBookReview,
  type AdmittedNarratorAudiobookReferenceMaster,
  type AdmittedNarratorAudiobookSequence,
  type AdmittedNarratorWholeBookReviewApproval,
} from "../src/narrator-audiobook-admission.js";
import {
  createAdmittedNarratorBookChapterSequence,
  type AdmittedNarratorBookChapterSequence,
} from "../src/narrator-book-sequence-admission.js";
import {
  createAdmittedNarratorBookCreditDelivery,
  createAdmittedNarratorBookCreditGeneration,
  type AdmittedNarratorBookCreditDelivery,
  type AdmittedNarratorBookCreditGeneration,
} from "../src/narrator-credit-admission.js";
import {
  createAdmittedNarratorMasteredReviewApproval,
  createAdmittedNarratorMasteredReviewBinding,
  recordAdmittedNarratorMasteredReview,
  type AdmittedNarratorMasteredReviewApproval,
  type AdmittedNarratorMasteredReviewBinding,
} from "../src/narrator-mastered-review-admission.js";
import type { AdmittedNarratorCasting } from "../src/narrator-casting-admission.js";
import {
  assertMasteredChapterReviewSession,
  type MasteredChapterReviewApproval,
  type MasteredChapterReviewScores,
  type MasteredChapterReviewSession,
} from "../src/mastered-chapter-review.js";
import { FilePrivateObjectStore } from "../src/private-object-store.js";
import { FileProjectStore } from "../src/project-store.js";
import {
  createTestAdmittedMasteredChapterFixture,
  type TestAdmittedMasteredChapterFixture,
} from "./narrator-mastering.js";
import { testDigest } from "./narrator-casting.js";

export interface TestAdmittedNarratorCreditFixture {
  generation: AdmittedNarratorBookCreditGeneration;
  reviewSession: BookCreditTakeReviewSession;
  masterChain: BookCreditMasterChain;
  delivery: AdmittedNarratorBookCreditDelivery;
}

export interface TestAdmittedNarratorChapterApprovalFixture {
  mastered: TestAdmittedMasteredChapterFixture;
  binding: AdmittedNarratorMasteredReviewBinding;
  approvedArtifact: ArtifactRecord;
  approvedSession: MasteredChapterReviewSession;
  approval: AdmittedNarratorMasteredReviewApproval;
}

export interface TestAdmittedNarratorAudiobookFixture {
  admittedCasting: AdmittedNarratorCasting;
  chapterApprovals: readonly TestAdmittedNarratorChapterApprovalFixture[];
  chapters: AdmittedNarratorBookChapterSequence;
  opening: TestAdmittedNarratorCreditFixture;
  closing: TestAdmittedNarratorCreditFixture;
  audiobook: AdmittedNarratorAudiobookSequence;
  render: AudiobookRenderResult;
  reference: AdmittedNarratorAudiobookReferenceMaster;
  wholeBookApproval: AdmittedNarratorWholeBookReviewApproval;
}

const t9 = new Date("2026-08-10T10:09:00.000Z");
const t10 = new Date("2026-08-10T10:10:00.000Z");
const t11 = new Date("2026-08-10T10:11:00.000Z");
const t12 = new Date("2026-08-10T10:12:00.000Z");
const t20 = new Date("2026-08-10T10:20:00.000Z");
const t21 = new Date("2026-08-10T10:21:00.000Z");
const t22 = new Date("2026-08-10T10:22:00.000Z");
const t23 = new Date("2026-08-10T10:23:00.000Z");
const t24 = new Date("2026-08-10T10:24:00.000Z");
const t25 = new Date("2026-08-10T10:25:00.000Z");
const t26 = new Date("2026-08-10T10:26:00.000Z");
const t27 = new Date("2026-08-10T10:27:00.000Z");
const t28 = new Date("2026-08-10T10:28:00.000Z");
const t29 = new Date("2026-08-10T10:29:00.000Z");
const t30 = new Date("2026-08-10T10:30:00.000Z");
const t31 = new Date("2026-08-10T10:31:00.000Z");
const t32 = new Date("2026-08-10T10:32:00.000Z");
const t40 = new Date("2026-08-10T10:40:00.000Z");
const t41 = new Date("2026-08-10T10:41:00.000Z");
const t42 = new Date("2026-08-10T10:42:00.000Z");
const t43 = new Date("2026-08-10T10:43:00.000Z");
const t44 = new Date("2026-08-10T10:44:00.000Z");
const t45 = new Date("2026-08-10T10:45:00.000Z");
const t46 = new Date("2026-08-10T10:46:00.000Z");

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function wavBytes(seed: number): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x08, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    seed & 0xff, 0x01, 0x02, 0x03,
  ]);
}

function rights(fingerprint: string, suffix: string): ArtifactRightsSnapshot {
  return Object.freeze({
    rightsEvidenceId: `rights_${suffix}`,
    rightsFingerprint: fingerprint,
    allowedUses: Object.freeze(["audiobook"] as const),
    commercialUseApproved: true,
    expiresAt: "2028-08-10T00:00:00.000Z",
    retainUntil: "2033-08-10T00:00:00.000Z",
    deletionRequiredAt: "2034-08-10T00:00:00.000Z",
  });
}

function commandResult(stdout = "", stderr = ""): AudioEngineeringCommandResult {
  return Object.freeze({ exitCode: 0, stdout, stderr, durationMs: 5 });
}

class EngineeringRunner implements AudioEngineeringRunner {
  constructor(
    readonly byteCount: number,
    readonly durationSeconds = 10,
  ) {}

  async run(command: AudioEngineeringCommand): Promise<AudioEngineeringCommandResult> {
    switch (command.stage) {
      case "ffprobe-version":
        return commandResult("ffprobe version 7.1 fixture\n");
      case "ffmpeg-version":
        return commandResult("ffmpeg version 7.1 fixture\n");
      case "probe":
        return commandResult(JSON.stringify({
          streams: [{
            codec_type: "audio",
            codec_name: "pcm_s24le",
            sample_rate: "44100",
            channels: 1,
            bit_rate: "192000",
            duration: String(this.durationSeconds),
          }],
          format: {
            format_name: "wav",
            duration: String(this.durationSeconds),
            bit_rate: "192000",
            size: String(this.byteCount),
          },
        }));
      case "astats":
        return commandResult([
          "lavfi.astats.Overall.RMS_level=-20",
          "lavfi.astats.Overall.Peak_level=-4",
          "lavfi.astats.Overall.Noise_floor=-65",
          "lavfi.astats.Overall.Peak_count=0",
        ].join("\n"));
      case "loudnorm":
        return commandResult("", JSON.stringify({
          input_i: "-20.1",
          input_tp: "-4.2",
          input_lra: "4.1",
          input_thresh: "-30",
          target_offset: "0.1",
        }));
      case "silence":
        return commandResult();
    }
  }
}

function creditPolicy(seed: string) {
  return createBookCreditPolicy({
    id: `credit_policy_${seed}`,
    version: "2026.08",
    languageTag: "en-AU",
    reviewedAt: "2026-08-01T00:00:00.000Z",
    sourceReference: "Reviewed EVAVO narrator credit policy.",
    maximumWords: 120,
    templates: [
      {
        kind: "opening",
        projectKind: "standalone",
        text: "{title}, written by {authorCredit}, narrated by {narratorCredit}.",
        requiredTokens: ["title", "authorCredit", "narratorCredit"],
      },
      {
        kind: "closing",
        projectKind: "standalone",
        text: "You have been listening to {title}, written by {authorCredit}, narrated by {narratorCredit}. {copyrightNotice}",
        requiredTokens: ["title", "authorCredit", "narratorCredit", "copyrightNotice"],
      },
      {
        kind: "opening",
        projectKind: "series",
        text: "{title}, volume {volumeNumber} of {seriesTitle}, written by {authorCredit}, narrated by {narratorCredit}.",
        requiredTokens: ["title", "seriesTitle", "volumeNumber", "authorCredit", "narratorCredit"],
      },
      {
        kind: "closing",
        projectKind: "series",
        text: "You have been listening to {title}, volume {volumeNumber} of {seriesTitle}, written by {authorCredit}, narrated by {narratorCredit}. {copyrightNotice}",
        requiredTokens: ["title", "seriesTitle", "volumeNumber", "authorCredit", "narratorCredit", "copyrightNotice"],
      },
    ],
    now: t20,
  });
}

function approvedCreditScript(input: Readonly<{
  projectId: string;
  bookId: string;
  kind: "opening" | "closing";
  seed: string;
}>) {
  let script = createBookCreditScript({
    id: `credit_script_${input.kind}_${input.seed}`,
    projectId: input.projectId,
    kind: input.kind,
    metadata: {
      bookId: input.bookId,
      title: "Admission Bound Narrator Book",
      projectKind: "standalone",
      authorCredit: "EVAVO Author",
      narratorCredit: "EVAVO Narrator",
      copyrightNotice: "Copyright 2026 Rights Holder.",
    },
    policy: creditPolicy(input.seed),
    createdAt: t20,
  });
  script = recordBookCreditReview(script, {
    id: `credit_script_editorial_${input.kind}_${input.seed}`,
    role: "editorial",
    reviewerId: `credit-script-editor-${input.kind}`,
    decision: "approve",
    checks: [
      "title-exact",
      "author-credit-exact",
      "narrator-credit-exact",
      "pronunciations-confirmed",
    ],
    decidedAt: t21,
  });
  script = recordBookCreditReview(script, {
    id: `credit_script_rights_${input.kind}_${input.seed}`,
    role: "rights",
    reviewerId: `credit-script-rights-${input.kind}`,
    decision: "approve",
    checks: [
      "copyright-notice-confirmed",
      "credit-entitlements-confirmed",
      "commercial-use-confirmed",
    ],
    decidedAt: t22,
  });
  return approveBookCreditScript(script, {
    finalConfirmationId: `credit_script_confirmation_${input.kind}_${input.seed}`,
    approvedByActorId: `credit-script-owner-${input.kind}`,
    humanConfirmation: true,
    approvedAt: t23,
  });
}

function calibrationLock(
  admittedCasting: AdmittedNarratorCasting,
  kind: "opening" | "closing",
  seed: string,
): ProductionCalibrationLock {
  const base = {
    schemaVersion: PRODUCTION_CALIBRATION_LOCK_SCHEMA_VERSION,
    sessionId: `calibration_credit_${kind}_${seed}`,
    sessionRevision: 7,
    sessionFingerprint: testDigest(`${seed}:${kind}:session`),
    approvalFingerprint: testDigest(`${seed}:${kind}:approval`),
    assessmentFingerprint: testDigest(`${seed}:${kind}:assessment`),
    projectId: admittedCasting.projectId,
    voiceProfileId: admittedCasting.casting.voice.profileId,
    voiceRevision: admittedCasting.casting.voice.revision,
    providerId: "audio_studio_local",
    modelId: admittedCasting.profileAdmission.engineKey,
    capabilityFingerprint: testDigest(`${seed}:${kind}:capability`),
    selectedTakeCount: 3,
    selectedTakeSetFingerprint: testDigest(`${seed}:${kind}:take-set`),
    approvedAt: t23.toISOString(),
  } as const;
  return Object.freeze({
    ...base,
    lockFingerprint: stableHash({ ...base, seriesId: null }),
  });
}

const creditReviewScores: BookCreditTakeReviewScores = Object.freeze({
  wordingFidelity: 5,
  pronunciation: 5,
  diction: 5,
  pacing: 4,
  tone: 5,
  boundaryCleanliness: 5,
  technicalComfort: 5,
  narratorConsistency: 5,
});

const masteredReviewScores: MasteredChapterReviewScores = Object.freeze({
  listenerComfort: 5,
  intelligibility: 5,
  tonalBalance: 4,
  dynamicNaturalness: 4,
  noiseConsistency: 5,
  breathAndConsonantIntegrity: 4,
  silenceAndTransitionIntegrity: 5,
  continuityWithNeighbours: 4,
});

const wholeBookScores: AudiobookReferenceMasterReviewScores = Object.freeze({
  narrativeContinuity: 5,
  sustainedListenability: 5,
  chapterOrderAndLabelling: 5,
  creditAccuracy: 5,
  transitionIntegrity: 5,
  silenceAndBoundaryIntegrity: 5,
  tonalAndLoudnessConsistency: 5,
  freedomFromTechnicalDefects: 5,
});

async function withStores<T>(
  prefix: string,
  run: (input: Readonly<{
    root: string;
    objectStore: FilePrivateObjectStore;
    registry: FileArtifactRegistry;
  }>) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  try {
    const projectStore = new FileProjectStore(join(root, "metadata"));
    return await run({
      root,
      objectStore: new FilePrivateObjectStore(join(root, "objects"), {
        maximumBytes: 10 * 1024 * 1024,
      }),
      registry: new FileArtifactRegistry(projectStore),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function createTestAdmittedNarratorCreditFixture(input: Readonly<{
  admittedCasting: AdmittedNarratorCasting;
  bookId: string;
  kind: "opening" | "closing";
  rightsFingerprint: string;
  seed?: string;
}>): Promise<TestAdmittedNarratorCreditFixture> {
  const seed = input.seed ?? `${input.kind}-credit`;
  const script = approvedCreditScript({
    projectId: input.admittedCasting.projectId,
    bookId: input.bookId,
    kind: input.kind,
    seed,
  });
  const generation = createAdmittedNarratorBookCreditGeneration({
    admittedCasting: input.admittedCasting,
    generation: {
      id: `credit_generation_${input.kind}_${seed}`,
      jobId: `job_credit_${input.kind}_${seed}`,
      script,
      calibrationLock: calibrationLock(input.admittedCasting, input.kind, seed),
      candidateCount: 2,
      direction: {
        narrativeDistance: "formal",
        pace: 0.94,
        intensity: 0.24,
        warmth: 0.58,
        restraint: 0.9,
        clarity: 0.98,
        pauseBeforeMs: 250,
        pauseAfterMs: 500,
        emotionalObjective: "State the approved credit text clearly and exactly.",
        subtext: "Professional, calm and restrained.",
        notes: ["Do not add or omit any word."],
      },
      pronunciations: [{
        writtenForm: "EVAVO",
        spokenForm: "ee vah voh",
        approvedRevision: 2,
      }],
      rights: rights(input.rightsFingerprint, `credit_${input.kind}_${seed}`),
      costPolicy: { currency: "USD", maximumTotalEstimatedCost: 2 },
      format: "wav",
      sampleRateHz: 44_100,
      createdAt: t24,
    },
  });

  return await withStores(
    `storyteller-admitted-credit-${input.kind}-`,
    async ({ objectStore, registry }) => {
      const plan = generation.plan;
      const creditRights = rights(input.rightsFingerprint, `credit_${input.kind}_${seed}`);
      const createCandidate = async (candidateOrdinal: number) => {
        const byteSeed = (input.kind === "opening" ? 30 : 40) + candidateOrdinal;
        const bytes = wavBytes(byteSeed);
        const takeId = `take_credit_${input.kind}_${seed}_${candidateOrdinal}`;
        const audio = await ingestPrivateArtifact(objectStore, registry, {
          id: `artifact_credit_audio_${input.kind}_${seed}_${candidateOrdinal}`,
          kind: "audio-candidate",
          projectId: plan.projectId,
          jobId: plan.job.id,
          segmentId: plan.job.segmentId,
          takeId,
          bytes,
          claimedMimeType: "audio/wav",
          claimedFormat: "wav",
          provenance: {
            createdByActorId: `credit-worker-${input.kind}`,
            sourceContentHash: plan.script.textHash,
            generationRequestHash: plan.job.cacheKey,
            providerId: "audio_studio_local",
            adapterVersion: "1.0.0",
            providerRequestId: `private-credit-request-${input.kind}-${candidateOrdinal}`,
            parentArtifactIds: [],
          },
          rights: creditRights,
          reviewRequired: true,
          actorId: `credit-worker-${input.kind}`,
          verifierActorId: `credit-verifier-${input.kind}`,
          now: t25,
        });
        const transcriptEvidence = createBookCreditTranscriptEvidence({
          sourceText: plan.script.text,
          observedText: plan.script.text,
          assessedAt: t26,
        });
        const transcript = await ingestPrivateArtifact(objectStore, registry, {
          id: `artifact_credit_transcript_${input.kind}_${seed}_${candidateOrdinal}`,
          kind: "transcript",
          projectId: plan.projectId,
          jobId: plan.job.id,
          segmentId: plan.job.segmentId,
          takeId,
          bytes: new TextEncoder().encode(plan.script.text),
          claimedMimeType: "text/plain",
          claimedFormat: "txt",
          provenance: {
            createdByActorId: `credit-worker-${input.kind}`,
            sourceContentHash: plan.script.textHash,
            generationRequestHash: plan.job.cacheKey,
            parentArtifactIds: [audio.envelope.payload.id],
          },
          rights: creditRights,
          reviewRequired: false,
          actorId: `credit-worker-${input.kind}`,
          verifierActorId: `credit-verifier-${input.kind}`,
          now: t27,
        });
        const engineeringEvidence = await analyseAudioEngineering({
          audioPath: `/private/${input.kind}-credit-${candidateOrdinal}.wav`,
          inputContentHash: hashBytes(bytes),
          inputByteCount: bytes.byteLength,
          profile: ACX_AUDIOBOOK_PROFILE,
          profileVersion: "acx-2026-08",
          profileReviewedAt: "2026-08-01T00:00:00.000Z",
          profileSourceReference: "acx-audio-submission-requirements-reviewed-2026-08",
          runner: new EngineeringRunner(bytes.byteLength),
          now: t27,
        });
        const engineering = await ingestPrivateArtifact(objectStore, registry, {
          id: `artifact_credit_engineering_${input.kind}_${seed}_${candidateOrdinal}`,
          kind: "audio-analysis",
          projectId: plan.projectId,
          jobId: plan.job.id,
          segmentId: plan.job.segmentId,
          takeId,
          bytes: new TextEncoder().encode(`${JSON.stringify(engineeringEvidence)}\n`),
          claimedMimeType: "application/json",
          claimedFormat: "json",
          provenance: {
            createdByActorId: `credit-worker-${input.kind}`,
            sourceContentHash: audio.envelope.payload.integrity.contentHash,
            generationRequestHash: plan.job.cacheKey,
            parentArtifactIds: [audio.envelope.payload.id],
          },
          rights: creditRights,
          reviewRequired: false,
          actorId: `credit-worker-${input.kind}`,
          verifierActorId: `credit-verifier-${input.kind}`,
          now: t28,
        });
        const take = admitBookCreditTake({
          id: `credit_take_${input.kind}_${seed}_${candidateOrdinal}`,
          plan,
          audioCandidate: audio.envelope.payload,
          transcriptArtifact: transcript.envelope.payload,
          engineeringArtifact: engineering.envelope.payload,
          transcriptEvidence,
          engineeringEvidence,
          createdAt: t28,
        });
        return Object.freeze({
          take,
          engineeringEvidence,
          audio: audio.envelope.payload,
          transcript: transcript.envelope.payload,
          engineering: engineering.envelope.payload,
          bytes,
        });
      };

      const selected = await createCandidate(1);
      const alternate = await createCandidate(2);
      let reviewSession = createBookCreditTakeReviewSession({
        id: `credit_review_${input.kind}_${seed}`,
        candidates: [selected, alternate].map(({ take, engineeringEvidence }) => ({
          take,
          engineeringEvidence,
        })),
        createdAt: t28,
      });
      reviewSession = recordBookCreditTakeReview(reviewSession, {
        id: `credit_editorial_${input.kind}_${seed}`,
        candidateTakeId: selected.take.id,
        role: "editorial",
        reviewerId: `credit-editor-${input.kind}`,
        listenedDurationMs: 10_000,
        playbackContexts: ["consumer-headphones", "speakers"],
        decision: "approve",
        scores: creditReviewScores,
        decidedAt: t29,
      });
      reviewSession = recordBookCreditTakeReview(reviewSession, {
        id: `credit_engineering_${input.kind}_${seed}`,
        candidateTakeId: selected.take.id,
        role: "engineering",
        reviewerId: `credit-engineer-${input.kind}`,
        listenedDurationMs: 10_000,
        playbackContexts: ["studio-headphones"],
        decision: "approve",
        scores: creditReviewScores,
        decidedAt: t30,
      });
      reviewSession = selectBookCreditTake(reviewSession, {
        candidateTakeId: selected.take.id,
        selectedByActorId: `credit-director-${input.kind}`,
        selectedAt: t31,
      });
      reviewSession = approveBookCreditTakeSelection(reviewSession, {
        finalConfirmationId: `credit-confirmation-${input.kind}-${seed}`,
        approvedByActorId: `credit-owner-${input.kind}`,
        humanConfirmation: true,
        approvedAt: t32,
      });
      const masterChain = await promoteBookCreditMaster(objectStore, registry, {
        session: reviewSession,
        sourceAudio: selected.audio,
        transcriptArtifact: selected.transcript,
        engineeringArtifact: selected.engineering,
        sourceBytes: selected.bytes,
        rights: creditRights,
        actorId: `credit-master-operator-${input.kind}`,
        verifierActorId: `credit-master-verifier-${input.kind}`,
        now: new Date(t32.getTime() + 10_000),
      });
      const snapshot = createBookCreditDeliverySnapshot({
        chain: masterChain,
        reviewSession,
        now: new Date(t32.getTime() + 20_000),
      });
      const delivery = createAdmittedNarratorBookCreditDelivery({
        generation,
        reviewSession,
        masterChain,
        delivery: snapshot,
      });
      return Object.freeze({ generation, reviewSession, masterChain, delivery });
    },
  );
}

function initialMasteredReviewSession(
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

function masteredReviewSource(fixture: TestAdmittedMasteredChapterFixture) {
  return Object.freeze({
    context: fixture.context,
    approvedPlan: fixture.approvedPlan,
    renderReceipt: fixture.renderReceipt,
    receipt: fixture.receipt,
  });
}

function approvedMasteredSession(
  binding: AdmittedNarratorMasteredReviewBinding,
  artifact: ArtifactRecord,
): MasteredChapterReviewSession {
  const ready = binding.binding.reviewSession;
  const approvalPartial: Omit<MasteredChapterReviewApproval, "fingerprint"> = {
    finalConfirmationId: `confirmation_${binding.chapterId}`,
    approvedByActorId: `mastered-final-approver-${binding.chapterId}`,
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

export async function createTestAdmittedNarratorChapterApproval(input: Readonly<{
  admittedCasting: AdmittedNarratorCasting;
  chapterId: string;
  seed: string;
  byteSeed: number;
}>): Promise<TestAdmittedNarratorChapterApprovalFixture> {
  const mastered = await createTestAdmittedMasteredChapterFixture({
    projectId: input.admittedCasting.projectId,
    chapterId: input.chapterId,
    seed: input.seed,
    byteSeed: input.byteSeed,
    admittedCasting: input.admittedCasting,
  });
  let binding = createAdmittedNarratorMasteredReviewBinding({
    source: masteredReviewSource(mastered),
    reviewSession: initialMasteredReviewSession(mastered),
  });
  const findingAcknowledgements = mastered.receipt.findingCodes;
  binding = recordAdmittedNarratorMasteredReview(binding, {
    id: `editorial_${input.chapterId}`,
    role: "editorial",
    reviewerId: `editorial-reviewer-${input.chapterId}`,
    listenedDurationMs: mastered.chain.comparison.observedDurationMs,
    playbackContexts: ["consumer-headphones", "speakers"],
    decision: "approve",
    scores: masteredReviewScores,
    decidedAt: t10,
    findingAcknowledgements,
  });
  binding = recordAdmittedNarratorMasteredReview(binding, {
    id: `engineering_${input.chapterId}`,
    role: "engineering",
    reviewerId: `engineering-reviewer-${input.chapterId}`,
    listenedDurationMs: mastered.chain.comparison.observedDurationMs,
    playbackContexts: ["studio-headphones"],
    decision: "approve",
    scores: masteredReviewScores,
    decidedAt: new Date(t10.getTime() + 10_000),
    findingAcknowledgements,
  });
  const approvedArtifact = recordArtifactReview(mastered.masteredArtifact, {
    decision: "approved",
    reviewerId: `mastered-final-approver-${input.chapterId}`,
    notes: "Approved after complete admission-bound editorial and engineering playback.",
    decidedAt: t11,
  });
  const approvedSession = approvedMasteredSession(binding, approvedArtifact);
  const approval = createAdmittedNarratorMasteredReviewApproval({
    binding,
    approvedSession,
    approvedArtifact,
  });
  return Object.freeze({
    mastered,
    binding,
    approvedArtifact,
    approvedSession,
    approval,
  });
}

function bookChapterSequence(
  approvals: readonly TestAdmittedNarratorChapterApprovalFixture[],
  bookId: string,
) {
  const chapters = approvals.map((fixture, index) => {
    const approval = fixture.approval.approval;
    const partial = {
      ordinal: index + 1,
      role: "chapter" as const,
      chapterId: approval.chapterId,
      title: `Chapter ${index + 1}`,
      durationMs: fixture.mastered.chain.comparison.observedDurationMs,
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
  const first = approvals[0]!;
  const partial = {
    schemaVersion: "storyteller-book-chapter-sequence-v1" as const,
    id: `book_sequence_${bookId}`,
    projectId: first.approval.projectId,
    bookId,
    title: "Admission Bound Narrator Book",
    languageTag: "en-AU",
    rightsFingerprint: first.mastered.rightsFingerprint,
    engineeringProfileFingerprint:
      first.mastered.approvedPlan.approvedPlan.plan.targetProfile.fingerprint,
    output: first.mastered.approvedPlan.approvedPlan.plan.output,
    chapters: Object.freeze(chapters),
    totalDurationMs: chapters.reduce((total, chapter) => total + chapter.durationMs, 0),
    status: "ready-for-credits" as const,
    createdByActorId: "book-sequence-director",
    revision: 1,
    createdAt: t12.toISOString(),
    updatedAt: t12.toISOString(),
  };
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function audiobookRender(sequence: AdmittedNarratorAudiobookSequence): AudiobookRenderResult {
  const bytes = wavBytes(90);
  const evidencePartial: Omit<AudiobookRenderEvidence, "fingerprint"> = {
    schemaVersion: "storyteller-audiobook-render-v1",
    id: `audiobook_render_${sequence.bookId}`,
    sequenceId: sequence.sequence.id,
    sequenceRevision: sequence.sequence.revision,
    sequenceFingerprint: sequence.sequence.fingerprint,
    sources: Object.freeze(sequence.sequence.components.map((component) => Object.freeze({
      ordinal: component.ordinal,
      artifactId: component.artifact.id,
      artifactFingerprint: component.artifact.fingerprint,
      contentHash: component.artifact.contentHash,
      byteCount: component.artifact.byteCount,
    }))),
    expectedDurationMs: sequence.sequence.totalDurationMs,
    estimatedPcmByteCount: estimateAudiobookPcmByteCount(sequence.sequence),
    output: Object.freeze({
      format: "wav" as const,
      sampleRateHz: sequence.sequence.output.sampleRateHz,
      channels: sequence.sequence.output.channels,
      bitDepth: sequence.sequence.output.bitDepth,
      contentHash: hashBytes(bytes),
      byteCount: bytes.byteLength,
      mediaSignature: "riff-wave" as const,
    }),
    tool: Object.freeze({
      executableName: "ffmpeg",
      versionLine: "ffmpeg version 7.1 fixture",
      versionFingerprint: stableHash("ffmpeg version 7.1 fixture"),
    }),
    filterFingerprint: testDigest("audiobook-filter"),
    commandFingerprint: testDigest("audiobook-command"),
    renderedAt: t41.toISOString(),
  };
  return Object.freeze({
    evidence: Object.freeze({
      ...evidencePartial,
      fingerprint: stableHash(evidencePartial),
    }),
    bytes,
  });
}

export async function createTestAdmittedNarratorAudiobookFixture(input: Readonly<{
  mode?: "zero-shot" | "adapted";
  projectId?: string;
  bookId?: string;
}> = {}): Promise<TestAdmittedNarratorAudiobookFixture> {
  const projectId = input.projectId ?? "project_admitted_audiobook_001";
  const bookId = input.bookId ?? "book_admitted_audiobook_001";
  const firstMastered = await createTestAdmittedMasteredChapterFixture({
    projectId,
    chapterId: "chapter_001",
    seed: "whole-book-chapter-001",
    byteSeed: 11,
    mode: input.mode ?? "adapted",
  });
  const admittedCasting = firstMastered.admittedCasting;
  const first = await createTestAdmittedNarratorChapterApproval({
    admittedCasting,
    chapterId: "chapter_001",
    seed: "whole-book-chapter-001",
    byteSeed: 11,
  });
  const second = await createTestAdmittedNarratorChapterApproval({
    admittedCasting,
    chapterId: "chapter_002",
    seed: "whole-book-chapter-002",
    byteSeed: 12,
  });
  const chapterApprovals = Object.freeze([first, second]);
  const technicalChapters = bookChapterSequence(chapterApprovals, bookId);
  const chapters = createAdmittedNarratorBookChapterSequence({
    admittedCasting,
    sequence: technicalChapters,
    chapterApprovals: chapterApprovals.map((chapter) => chapter.approval),
  });
  const opening = await createTestAdmittedNarratorCreditFixture({
    admittedCasting,
    bookId,
    kind: "opening",
    rightsFingerprint: first.mastered.rightsFingerprint,
    seed: "whole-book-opening",
  });
  const closing = await createTestAdmittedNarratorCreditFixture({
    admittedCasting,
    bookId,
    kind: "closing",
    rightsFingerprint: first.mastered.rightsFingerprint,
    seed: "whole-book-closing",
  });
  const audiobook = createAdmittedNarratorAudiobookSequence({
    id: `audiobook_sequence_${bookId}`,
    chapters,
    opening: opening.delivery,
    closing: closing.delivery,
    chapterArtifacts: chapterApprovals.map((chapter) => chapter.approvedArtifact),
    createdByActorId: "audiobook-sequence-director",
    createdAt: t40,
  });
  const render = audiobookRender(audiobook);
  const reference = await withStores(
    "storyteller-admitted-reference-master-",
    async ({ root, objectStore, registry }) => {
      return await ingestAdmittedNarratorAudiobookReferenceMaster(
        objectStore,
        registry,
        {
          audiobook,
          render,
          rights: rights(first.mastered.rightsFingerprint, "audiobook-reference"),
          actorId: "audiobook-reference-worker",
          verifierActorId: "audiobook-reference-verifier",
          engineering: createGenerationAudioEngineeringPolicy({
            profile: ACX_AUDIOBOOK_PROFILE,
            externalVersion: "acx-2026-08",
            reviewedAt: "2026-08-01T00:00:00.000Z",
            sourceReference: "acx-audio-submission-requirements-reviewed-2026-08",
            runner: new EngineeringRunner(
              render.bytes.byteLength,
              audiobook.sequence.totalDurationMs / 1_000,
            ),
            temporaryRoot: join(root, "engineering"),
            now: t42,
          }),
          now: t42,
        },
      );
    },
  );
  let wholeBookBinding = createAdmittedNarratorWholeBookReviewBinding({
    id: `whole_book_review_${bookId}`,
    reference,
    createdAt: t43,
  });
  wholeBookBinding = recordAdmittedNarratorWholeBookReview(wholeBookBinding, {
    id: `whole_book_editorial_${bookId}`,
    role: "editorial",
    reviewerId: "whole-book-editorial-reviewer",
    completeListenConfirmed: true,
    listenedDurationMs: reference.chain.observedDurationMs,
    componentCountReviewed: audiobook.sequence.components.length,
    boundaryCountReviewed: audiobook.sequence.components.length - 1,
    playbackContexts: ["consumer-headphones", "speakers"],
    decision: "approve",
    scores: wholeBookScores,
    decidedAt: t44,
  });
  wholeBookBinding = recordAdmittedNarratorWholeBookReview(wholeBookBinding, {
    id: `whole_book_engineering_${bookId}`,
    role: "engineering",
    reviewerId: "whole-book-engineering-reviewer",
    completeListenConfirmed: true,
    listenedDurationMs: reference.chain.observedDurationMs,
    componentCountReviewed: audiobook.sequence.components.length,
    boundaryCountReviewed: audiobook.sequence.components.length - 1,
    playbackContexts: ["studio-headphones"],
    decision: "approve",
    scores: wholeBookScores,
    decidedAt: t45,
  });
  const wholeBookApproval = createAdmittedNarratorWholeBookReviewApproval(
    wholeBookBinding,
    {
      finalConfirmationId: `whole_book_confirmation_${bookId}`,
      approvedByActorId: "whole-book-final-approver",
      humanConfirmation: true,
      approvedAt: t46,
    },
  );
  return Object.freeze({
    admittedCasting,
    chapterApprovals,
    chapters,
    opening,
    closing,
    audiobook,
    render,
    reference,
    wholeBookApproval,
  });
}
