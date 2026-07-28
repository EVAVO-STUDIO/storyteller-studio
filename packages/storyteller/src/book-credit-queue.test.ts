import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  approveBookCreditScript,
  createBookCreditPolicy,
  createBookCreditScript,
  recordBookCreditReview,
  type BookCreditScript,
} from "./book-credit-script.js";
import {
  FileBookCreditGenerationStore,
  createBookCreditGenerationPlan,
  prepareBookCreditGeneration,
} from "./book-credit-generation.js";
import {
  assertBookCreditQueueReceipt,
  bookCreditQueuePublicView,
  enqueuePreparedBookCreditGeneration,
} from "./book-credit-queue.js";
import {
  PRODUCTION_CALIBRATION_LOCK_SCHEMA_VERSION,
  type ProductionCalibrationLock,
} from "./calibration-admission.js";
import { FileGenerationCalibrationBindingStore } from "./generation-calibration.js";
import { FileGenerationMaterialStore } from "./generation-material.js";
import { FileGenerationQueue } from "./generation-queue.js";
import { stableHash } from "./index.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:00:01.000Z");
const t2 = new Date("2026-07-27T00:00:02.000Z");
const t3 = new Date("2026-07-27T00:00:03.000Z");
const t4 = new Date("2026-07-27T00:00:04.000Z");
const t5 = new Date("2026-07-27T00:00:05.000Z");
const t6 = new Date("2026-07-27T00:00:06.000Z");
const t7 = new Date("2026-07-27T00:00:07.000Z");

const creditText = "The North Water, written by Ian McGuire, narrated by EVAVO Narrator.";
const rights = Object.freeze({
  rightsEvidenceId: "rights_credit_queue_001",
  rightsFingerprint: "a".repeat(64),
  allowedUses: Object.freeze(["audiobook"] as const),
  commercialUseApproved: true,
  expiresAt: "2028-07-27T00:00:00.000Z",
  retainUntil: "2033-07-27T00:00:00.000Z",
  deletionRequiredAt: "2034-07-27T00:00:00.000Z",
});

function policy() {
  return createBookCreditPolicy({
    id: "credit_queue_policy_001",
    version: "2026.07",
    languageTag: "en-AU",
    reviewedAt: "2026-07-01T00:00:00.000Z",
    sourceReference: "Reviewed EVAVO credit wording policy.",
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
    now: t0,
  });
}

function approvedScript(): BookCreditScript {
  let script = createBookCreditScript({
    id: "credit_queue_script_001",
    projectId: "project_credit_queue_001",
    kind: "opening",
    metadata: {
      bookId: "book_credit_queue_001",
      title: "The North Water",
      projectKind: "standalone",
      authorCredit: "Ian McGuire",
      narratorCredit: "EVAVO Narrator",
      copyrightNotice: "Copyright 2026 Rights Holder.",
    },
    policy: policy(),
    createdAt: t0,
  });
  script = recordBookCreditReview(script, {
    id: "credit_queue_editorial_review_001",
    role: "editorial",
    reviewerId: "credit_queue_editor_001",
    decision: "approve",
    checks: [
      "title-exact",
      "author-credit-exact",
      "narrator-credit-exact",
      "pronunciations-confirmed",
    ],
    decidedAt: t1,
  });
  script = recordBookCreditReview(script, {
    id: "credit_queue_rights_review_001",
    role: "rights",
    reviewerId: "credit_queue_rights_reviewer_001",
    decision: "approve",
    checks: [
      "copyright-notice-confirmed",
      "credit-entitlements-confirmed",
      "commercial-use-confirmed",
    ],
    decidedAt: t2,
  });
  return approveBookCreditScript(script, {
    finalConfirmationId: "credit_queue_confirmation_001",
    approvedByActorId: "credit_queue_owner_001",
    humanConfirmation: true,
    approvedAt: t3,
  });
}

function calibrationLock(): ProductionCalibrationLock {
  const base = {
    schemaVersion: PRODUCTION_CALIBRATION_LOCK_SCHEMA_VERSION,
    sessionId: "calibration_credit_queue_001",
    sessionRevision: 7,
    sessionFingerprint: "1".repeat(64),
    approvalFingerprint: "2".repeat(64),
    assessmentFingerprint: "3".repeat(64),
    projectId: "project_credit_queue_001",
    voiceProfileId: "voice_credit_queue_001",
    voiceRevision: 4,
    providerId: "elevenlabs",
    modelId: "eleven_multilingual_v2",
    capabilityFingerprint: "4".repeat(64),
    selectedTakeCount: 3,
    selectedTakeSetFingerprint: "5".repeat(64),
    approvedAt: t3.toISOString(),
  } as const;
  return Object.freeze({
    ...base,
    lockFingerprint: stableHash({ ...base, seriesId: null }),
  });
}

function plan() {
  return createBookCreditGenerationPlan({
    id: "credit_generation_queue_plan_001",
    jobId: "job_credit_queue_001",
    script: approvedScript(),
    calibrationLock: calibrationLock(),
    candidateCount: 3,
    direction: {
      narrativeDistance: "formal",
      pace: 0.94,
      intensity: 0.24,
      warmth: 0.58,
      restraint: 0.9,
      clarity: 0.98,
      pauseBeforeMs: 250,
      pauseAfterMs: 500,
      emotionalObjective: "State the approved credit text clearly and without embellishment.",
      subtext: "Professional, calm and exact.",
      notes: ["Do not add or omit any word."],
    },
    pronunciations: [{
      writtenForm: "EVAVO",
      spokenForm: "ee vah voh",
      approvedRevision: 2,
    }],
    rights,
    costPolicy: {
      currency: "USD",
      maximumTotalEstimatedCost: 2,
    },
    format: "wav",
    sampleRateHz: 44_100,
    createdAt: t4,
  });
}

async function withStores<T>(
  run: (input: Readonly<{
    root: string;
    projectStore: FileProjectStore;
    planStore: FileBookCreditGenerationStore;
    materialStore: FileGenerationMaterialStore;
    calibrationStore: FileGenerationCalibrationBindingStore;
    queue: FileGenerationQueue;
  }>) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-credit-queue-"));
  try {
    const projectStore = new FileProjectStore(root);
    return await run({
      root,
      projectStore,
      planStore: new FileBookCreditGenerationStore(projectStore),
      materialStore: new FileGenerationMaterialStore(projectStore),
      calibrationStore: new FileGenerationCalibrationBindingStore(projectStore),
      queue: new FileGenerationQueue(projectStore),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function preparedFixture(input: Readonly<{
  planStore: FileBookCreditGenerationStore;
  materialStore: FileGenerationMaterialStore;
  calibrationStore: FileGenerationCalibrationBindingStore;
}>) {
  return await prepareBookCreditGeneration({
    plan: plan(),
    planStore: input.planStore,
    materialStore: input.materialStore,
    calibrationStore: input.calibrationStore,
    actorId: "credit_queue_operator_001",
    requestId: "request_credit_queue_001",
  });
}

test("prepared credit generation enqueues idempotently and preserves exact worker material", async () => {
  await withStores(async ({ planStore, materialStore, calibrationStore, queue }) => {
    const prepared = await preparedFixture({ planStore, materialStore, calibrationStore });
    const first = await enqueuePreparedBookCreditGeneration({
      prepared,
      queue,
      priority: 80,
      maxAttempts: 3,
      now: t5,
    });
    assert.equal(first.queue.payload.status, "queued");
    assert.equal(first.receipt.queueStatus, "queued");
    assert.equal(first.receipt.priority, 80);
    assert.equal(first.receipt.maxAttempts, 3);
    assert.doesNotThrow(() => assertBookCreditQueueReceipt(first.receipt));

    const repeated = await enqueuePreparedBookCreditGeneration({
      prepared,
      queue,
      priority: 80,
      maxAttempts: 3,
      now: t6,
    });
    assert.equal(repeated.queue.envelopeHash, first.queue.envelopeHash);
    assert.equal(repeated.receipt.fingerprint, first.receipt.fingerprint);

    const claim = await queue.claimNext({
      workerId: "credit_queue_worker_001",
      now: t6,
    });
    assert.ok(claim);
    const resolvedMaterial = await materialStore.resolve(claim);
    const resolvedCalibration = await calibrationStore.require(claim.item.jobId);
    assert.equal(resolvedMaterial.text, creditText);
    assert.equal(resolvedMaterial.immutableSourceHash, prepared.plan.payload.script.textHash);
    assert.equal(
      resolvedCalibration.payload.calibrationLock.lockFingerprint,
      prepared.plan.payload.calibration.calibrationLock.lockFingerprint,
    );

    const leased = await enqueuePreparedBookCreditGeneration({
      prepared,
      queue,
      now: t7,
    });
    assert.equal(leased.receipt.queueStatus, "leased");
    const publicView = bookCreditQueuePublicView(leased.receipt);
    const serialised = JSON.stringify(publicView);
    for (const forbidden of [
      creditText,
      claim.leaseToken,
      "elevenlabs",
      "eleven_multilingual_v2",
      "calibration_credit_queue_001",
      rights.rightsEvidenceId,
      rights.rightsFingerprint,
      "credit_queue_owner_001",
    ]) assert.equal(serialised.includes(forbidden), false);
  });
});

test("queue admission rejects forged prepared envelopes and reversed chronology", async () => {
  await withStores(async ({ planStore, materialStore, calibrationStore, queue }) => {
    const prepared = await preparedFixture({ planStore, materialStore, calibrationStore });
    const forged = {
      ...prepared,
      plan: {
        ...prepared.plan,
        contentHash: "f".repeat(64),
      },
    } as typeof prepared;
    await assert.rejects(
      enqueuePreparedBookCreditGeneration({ prepared: forged, queue, now: t5 }),
      /BOOK_CREDIT_QUEUE_PLAN_ENVELOPE_INVALID/u,
    );
    await assert.rejects(
      enqueuePreparedBookCreditGeneration({ prepared, queue, now: t3 }),
      /BOOK_CREDIT_QUEUE_BEFORE_PREPARATION/u,
    );
    await assert.rejects(
      enqueuePreparedBookCreditGeneration({
        prepared,
        queue,
        now: t5,
        availableAt: t4,
      }),
      /BOOK_CREDIT_QUEUE_AVAILABLE_AT_INVALID/u,
    );
  });
});

test("queue receipts reject recomputed structural tampering", async () => {
  await withStores(async ({ planStore, materialStore, calibrationStore, queue }) => {
    const prepared = await preparedFixture({ planStore, materialStore, calibrationStore });
    const { receipt } = await enqueuePreparedBookCreditGeneration({ prepared, queue, now: t5 });
    const { fingerprint: _fingerprint, ...base } = receipt;
  const fingerprintTampered = {
    ...receipt,
    priority: 99,
  };
  assert.throws(
    () => assertBookCreditQueueReceipt(fingerprintTampered),
    /BOOK_CREDIT_QUEUE_FINGERPRINT_INVALID/u,
  );

    const structurallyInvalidBase = {
      ...base,
      availableAt: new Date(t0.getTime() - 1_000).toISOString(),
    };
    const structurallyInvalid = {
      ...structurallyInvalidBase,
      fingerprint: stableHash(structurallyInvalidBase),
    } as typeof receipt;
    assert.throws(
      () => assertBookCreditQueueReceipt(structurallyInvalid),
      /BOOK_CREDIT_QUEUE_DATE_ORDER_INVALID/u,
    );
  });
});
