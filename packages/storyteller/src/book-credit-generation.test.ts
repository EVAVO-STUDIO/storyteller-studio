import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  approveBookCreditScript,
  createBookCreditPolicy,
  createBookCreditScript,
  recordBookCreditReview,
} from "./book-credit-script.js";
import {
  BookCreditGenerationError,
  FileBookCreditGenerationStore,
  assertBookCreditGenerationPlan,
  bookCreditGenerationPublicView,
  bookCreditSegmentId,
  createBookCreditGenerationPlan,
  prepareBookCreditGeneration,
} from "./book-credit-generation.js";
import {
  PRODUCTION_CALIBRATION_LOCK_SCHEMA_VERSION,
  type ProductionCalibrationLock,
} from "./calibration-admission.js";
import { FileGenerationCalibrationBindingStore } from "./generation-calibration.js";
import { FileGenerationMaterialStore } from "./generation-material.js";
import { stableHash, type PerformanceDirection } from "./index.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:00:01.000Z");
const t2 = new Date("2026-07-27T00:00:02.000Z");
const t3 = new Date("2026-07-27T00:00:03.000Z");
const t4 = new Date("2026-07-27T00:00:04.000Z");
const creditText = "The Long Road Home. Written by Greg Parker. Narrated by Alex Rowan.";

function policy() {
  return createBookCreditPolicy({
    id: "credit-generation-policy",
    version: "2026.07",
    languageTag: "en-AU",
    reviewedAt: "2026-07-01T00:00:00.000Z",
    sourceReference: "credit-generation-policy-reviewed-2026-07",
    maximumWords: 120,
    templates: [
      {
        kind: "opening",
        projectKind: "standalone",
        text: "{title}. Written by {authorCredit}. Narrated by {narratorCredit}.",
        requiredTokens: ["title", "authorCredit", "narratorCredit"],
      },
      {
        kind: "closing",
        projectKind: "standalone",
        text: "You have been listening to {title}, written by {authorCredit}, narrated by {narratorCredit}. {copyrightNotice}.",
        requiredTokens: ["title", "authorCredit", "narratorCredit", "copyrightNotice"],
      },
      {
        kind: "opening",
        projectKind: "series",
        text: "{title}, Book {volumeNumber} of {seriesTitle}. Written by {authorCredit}. Narrated by {narratorCredit}.",
        requiredTokens: ["title", "volumeNumber", "seriesTitle", "authorCredit", "narratorCredit"],
      },
      {
        kind: "closing",
        projectKind: "series",
        text: "You have been listening to {title}, Book {volumeNumber} of {seriesTitle}, written by {authorCredit}, narrated by {narratorCredit}. {copyrightNotice}. {productionCredit}",
        requiredTokens: ["title", "volumeNumber", "seriesTitle", "authorCredit", "narratorCredit", "copyrightNotice", "productionCredit"],
      },
    ],
    now: t0,
  });
}

function approvedScript() {
  let script = createBookCreditScript({
    id: "credit_script_generation_001",
    projectId: "project_credit_generation_001",
    kind: "opening",
    metadata: {
      bookId: "book_credit_generation_001",
      title: "The Long Road Home",
      projectKind: "standalone",
      authorCredit: "Greg Parker",
      narratorCredit: "Alex Rowan",
      copyrightNotice: "Copyright 2026 Greg Parker",
    },
    policy: policy(),
    createdAt: t0,
  });
  script = recordBookCreditReview(script, {
    id: "credit_generation_editorial_review_001",
    role: "editorial",
    reviewerId: "credit_generation_editorial_001",
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
    id: "credit_generation_rights_review_001",
    role: "rights",
    reviewerId: "credit_generation_rights_001",
    decision: "approve",
    checks: [
      "copyright-notice-confirmed",
      "credit-entitlements-confirmed",
      "commercial-use-confirmed",
    ],
    decidedAt: t2,
  });
  return approveBookCreditScript(script, {
    finalConfirmationId: "credit_generation_confirmation_001",
    approvedByActorId: "credit_generation_owner_001",
    humanConfirmation: true,
    approvedAt: t3,
  });
}

function calibrationLock(
  overrides: Partial<Omit<ProductionCalibrationLock, "lockFingerprint">> = {},
): ProductionCalibrationLock {
  const base: Omit<ProductionCalibrationLock, "lockFingerprint"> = {
    schemaVersion: PRODUCTION_CALIBRATION_LOCK_SCHEMA_VERSION,
    sessionId: "calibration_credit_generation_001",
    sessionRevision: 7,
    sessionFingerprint: "1".repeat(64),
    approvalFingerprint: "2".repeat(64),
    assessmentFingerprint: "3".repeat(64),
    projectId: "project_credit_generation_001",
    voiceProfileId: "voice_credit_narrator_001",
    voiceRevision: 4,
    providerId: "elevenlabs",
    modelId: "eleven_multilingual_v2",
    capabilityFingerprint: "4".repeat(64),
    selectedTakeCount: 5,
    selectedTakeSetFingerprint: "5".repeat(64),
    approvedAt: "2026-07-27T00:00:02.500Z",
    ...overrides,
  };
  return Object.freeze({
    ...base,
    lockFingerprint: stableHash({ ...base, seriesId: base.seriesId ?? null }),
  });
}

const direction: Omit<PerformanceDirection, "segmentId"> = {
  narrativeDistance: "formal",
  pace: 0.92,
  intensity: 0.25,
  warmth: 0.72,
  restraint: 0.9,
  clarity: 1,
  pauseBeforeMs: 250,
  pauseAfterMs: 500,
  emotionalObjective: "Welcome the listener clearly and establish trusted authorship.",
  subtext: "Ceremonial, calm and exact rather than promotional.",
  notes: ["Preserve every proper name and sentence boundary."],
};

const rights = {
  rightsEvidenceId: "rights_credit_generation_001",
  rightsFingerprint: "6".repeat(64),
  allowedUses: ["audiobook"] as const,
  commercialUseApproved: true,
  expiresAt: "2028-07-27T00:00:00.000Z",
};

function planInput(overrides: Partial<Parameters<typeof createBookCreditGenerationPlan>[0]> = {}) {
  return {
    id: "book_credit_generation_001",
    jobId: "job_book_credit_generation_001",
    script: approvedScript(),
    calibrationLock: calibrationLock(),
    candidateCount: 3,
    direction,
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
    format: "wav" as const,
    sampleRateHz: 44_100,
    createdAt: t4,
    ...overrides,
  };
}

test("approved credit script derives one exact calibrated production job and material record", () => {
  const script = approvedScript();
  const plan = createBookCreditGenerationPlan(planInput({ script }));
  assert.equal(plan.status, "prepared");
  assert.equal(plan.script.text, creditText);
  assert.equal(plan.material.material.text, creditText);
  assert.equal(plan.material.textHash, script.textHash);
  assert.equal(plan.material.material.immutableSourceHash, script.textHash);
  assert.equal(plan.job.segmentId, bookCreditSegmentId(script));
  assert.deepEqual(plan.job.providerFallbackIds, ["elevenlabs"]);
  assert.equal(plan.material.material.voiceRevision, 4);
  assert.equal(plan.material.material.mode, "production");
  assert.equal(plan.calibration.calibrationLock.lockFingerprint, planInput().calibrationLock.lockFingerprint);
  assert.doesNotThrow(() => assertBookCreditGenerationPlan(plan));

  const view = bookCreditGenerationPublicView(plan);
  const serialised = JSON.stringify(view);
  assert.equal(view.scriptTextHash, script.textHash);
  assert.equal(view.candidateCount, 3);
  assert.equal(view.voiceRevision, 4);
  for (const forbidden of [
    creditText,
    "elevenlabs",
    "eleven_multilingual_v2",
    "calibration_credit_generation_001",
    rights.rightsEvidenceId,
    rights.rightsFingerprint,
    "credit_generation_owner_001",
  ]) assert.equal(serialised.includes(forbidden), false);
});

test("draft scripts and cross-project calibration locks are rejected before material creation", () => {
  const draft = createBookCreditScript({
    id: "credit_script_draft_001",
    projectId: "project_credit_generation_001",
    kind: "opening",
    metadata: {
      bookId: "book_credit_generation_001",
      title: "The Long Road Home",
      projectKind: "standalone",
      authorCredit: "Greg Parker",
      narratorCredit: "Alex Rowan",
      copyrightNotice: "Copyright 2026 Greg Parker",
    },
    policy: policy(),
    createdAt: t0,
  });
  assert.throws(
    () => createBookCreditGenerationPlan(planInput({ script: draft })),
    /BOOK_CREDIT_GENERATION_APPROVED_SCRIPT_REQUIRED/u,
  );
  assert.throws(
    () => createBookCreditGenerationPlan(planInput({
      calibrationLock: calibrationLock({ projectId: "project_other_001" }),
    })),
    /BOOK_CREDIT_GENERATION_CALIBRATION_PROJECT_MISMATCH/u,
  );
});

test("cache keys change for performance, pronunciation, candidate and calibration intent", () => {
  const base = createBookCreditGenerationPlan(planInput());
  const changedDirection = createBookCreditGenerationPlan(planInput({
    id: "book_credit_generation_direction_001",
    jobId: "job_book_credit_generation_direction_001",
    direction: { ...direction, pace: 0.8 },
  }));
  const changedPronunciation = createBookCreditGenerationPlan(planInput({
    id: "book_credit_generation_pronunciation_001",
    jobId: "job_book_credit_generation_pronunciation_001",
    pronunciations: [{
      writtenForm: "EVAVO",
      spokenForm: "eh vah voh",
      approvedRevision: 3,
    }],
  }));
  const changedCount = createBookCreditGenerationPlan(planInput({
    id: "book_credit_generation_count_001",
    jobId: "job_book_credit_generation_count_001",
    candidateCount: 2,
  }));
  const changedLock = createBookCreditGenerationPlan(planInput({
    id: "book_credit_generation_lock_001",
    jobId: "job_book_credit_generation_lock_001",
    calibrationLock: calibrationLock({ sessionRevision: 8 }),
  }));
  for (const changed of [changedDirection, changedPronunciation, changedCount, changedLock]) {
    assert.notEqual(changed.job.cacheKey, base.job.cacheKey);
  }
});

test("preparation persists plan, exact material and calibration binding idempotently", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-credit-generation-"));
  try {
    const projectStore = new FileProjectStore(root);
    const planStore = new FileBookCreditGenerationStore(projectStore);
    const materialStore = new FileGenerationMaterialStore(projectStore);
    const calibrationStore = new FileGenerationCalibrationBindingStore(projectStore);
    const plan = createBookCreditGenerationPlan(planInput());
    const first = await prepareBookCreditGeneration({
      plan,
      planStore,
      materialStore,
      calibrationStore,
      actorId: "credit_generation_operator_001",
      requestId: "request_credit_generation_001",
    });
    const second = await prepareBookCreditGeneration({
      plan,
      planStore,
      materialStore,
      calibrationStore,
      actorId: "credit_generation_operator_001",
      requestId: "request_credit_generation_001",
    });
    assert.equal(second.plan.envelopeHash, first.plan.envelopeHash);
    assert.equal(second.material.envelopeHash, first.material.envelopeHash);
    assert.equal(second.calibration.envelopeHash, first.calibration.envelopeHash);
    assert.equal(first.material.payload.material.text, creditText);

    const audit = await readFile(join(root, "audit", "2026-07-27.jsonl"), "utf8");
    assert.equal(audit.includes(creditText), false);
    assert.equal(audit.includes("eleven_multilingual_v2"), false);
    assert.equal(audit.includes("calibration_credit_generation_001"), false);
    assert.equal(audit.includes(rights.rightsEvidenceId), false);
    assert.equal(audit.includes("scriptTextHash"), true);
    assert.equal(audit.includes("candidateCount"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("persisted script, material and calibration tampering fail even with recomputed outer fingerprints", () => {
  const plan = createBookCreditGenerationPlan(planInput());
  const { fingerprint: _fingerprint, ...base } = plan;
  const scriptBase = {
    ...plan.script,
    text: `${plan.script.text} Altered.`,
  };
  const scriptTamperedBase = { ...base, script: scriptBase };
  const scriptTampered = {
    ...scriptTamperedBase,
    fingerprint: stableHash(scriptTamperedBase),
  };
  assert.throws(
    () => assertBookCreditGenerationPlan(scriptTampered),
    /BOOK_CREDIT_TEXT_INTEGRITY_INVALID/u,
  );

  const materialBase = {
    ...plan.material,
    material: {
      ...plan.material.material,
      immutableSourceHash: "f".repeat(64),
    },
  };
  const materialTamperedBase = { ...base, material: materialBase };
  const materialTampered = {
    ...materialTamperedBase,
    fingerprint: stableHash(materialTamperedBase),
  };
  assert.throws(
    () => assertBookCreditGenerationPlan(materialTampered),
    /GENERATION_MATERIAL_FINGERPRINT_INVALID|BOOK_CREDIT_GENERATION_SCOPE_MISMATCH/u,
  );

  const calibrationBase = {
    ...plan.calibration,
    candidateCount: plan.calibration.candidateCount + 1,
  };
  const calibrationTamperedBase = { ...base, calibration: calibrationBase };
  const calibrationTampered = {
    ...calibrationTamperedBase,
    fingerprint: stableHash(calibrationTamperedBase),
  };
  assert.throws(
    () => assertBookCreditGenerationPlan(calibrationTampered),
    /GENERATION_CALIBRATION_FINGERPRINT_INVALID|BOOK_CREDIT_GENERATION_SCOPE_MISMATCH/u,
  );
});
