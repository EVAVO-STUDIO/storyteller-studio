import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileGenerationQueue } from "./generation-queue.js";
import {
  FileGenerationMaterialStore,
  GenerationMaterialConflictError,
  GenerationMaterialIntegrityError,
  assertGenerationMaterialRecord,
  createGenerationMaterialRecord,
  generationMaterialEntityId,
  generationMaterialPublicView,
  type GenerationMaterialRecord,
} from "./generation-material.js";
import type { GenerationWorkerMaterial } from "./generation-worker.js";
import type { GenerationJob } from "./index.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:10:00.000Z");

const job: GenerationJob = {
  id: "job_material_001",
  projectId: "project_material_001",
  segmentId: "segment_material_001",
  providerFallbackIds: ["provider_primary"],
  cacheKey: "a".repeat(64),
  candidateCount: 2,
  status: "ready",
};

function material(overrides: Partial<GenerationWorkerMaterial> = {}): GenerationWorkerMaterial {
  return {
    text: "The house kept its own weather, and Mara listened at the locked door.",
    immutableSourceHash: "b".repeat(64),
    voiceProfileId: "voice_narrator_001",
    voiceRevision: 3,
    direction: {
      segmentId: job.segmentId,
      narrativeDistance: "close",
      pace: 0.84,
      intensity: 0.42,
      warmth: 0.53,
      restraint: 0.79,
      clarity: 0.94,
      pauseBeforeMs: 120,
      pauseAfterMs: 260,
      emotionalObjective: "Bring the listener closer without revealing why the door matters.",
      subtext: "The narrator knows the house is listening.",
      notes: ["Keep the final clause contained and exact."],
    },
    pronunciations: [
      {
        writtenForm: "Aelwyn",
        ipa: "ˈeɪl.wɪn",
        spokenForm: "AYL-win",
        approvedRevision: 2,
      },
    ],
    mode: "production",
    format: "wav",
    sampleRateHz: 48_000,
    rights: {
      rightsEvidenceId: "rights_material_001",
      rightsFingerprint: "c".repeat(64),
      allowedUses: ["audiobook"],
      commercialUseApproved: true,
      expiresAt: "2028-07-27T00:00:00.000Z",
      retainUntil: "2029-07-27T00:00:00.000Z",
    },
    intendedUse: "audiobook",
    commercial: true,
    parentArtifactIds: ["artifact_voice_anchor_001"],
    costPolicy: {
      currency: "AUD",
      maximumTotalEstimatedCost: 0.2,
    },
    ...overrides,
  };
}

async function withStore(
  run: (
    store: FileGenerationMaterialStore,
    root: string,
  ) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "storyteller-generation-material-"));
  try {
    await run(new FileGenerationMaterialStore(new FileProjectStore(root)), root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("material records preserve exact private production intent and resolve for the matching claim", async () => {
  await withStore(async (store) => {
    const created = await store.create(job, material(), {
      actorId: "operator_material_001",
      now: t0,
    });
    assert.equal(created.revision, 1);
    assert.equal(created.payload.id, generationMaterialEntityId(job.id));
    assert.equal(created.payload.textHash.length, 64);
    assert.equal(created.payload.material.text, material().text);
    assert.equal(created.payload.material.direction.segmentId, job.segmentId);
    assert.match(created.payload.fingerprint, /^[a-f0-9]{64}$/u);

    const queueRoot = await mkdtemp(join(tmpdir(), "storyteller-generation-material-queue-"));
    try {
      const queue = new FileGenerationQueue(new FileProjectStore(queueRoot));
      await queue.enqueue(job, { now: t0 });
      const claim = await queue.claimNext({
        workerId: "worker_material_001",
        now: t0,
      });
      if (!claim) throw new Error("material test claim required");
      const resolved = await store.resolve(claim);
      assert.deepEqual(resolved, created.payload.material);
    } finally {
      await rm(queueRoot, { recursive: true, force: true });
    }
  });
});

test("identical material creation is idempotent while changed private intent conflicts", async () => {
  await withStore(async (store) => {
    const first = await store.create(job, material(), {
      actorId: "operator_material_001",
      now: t0,
    });
    const same = await store.create(job, material(), {
      actorId: "operator_material_001",
      now: t1,
    });
    assert.equal(same.revision, first.revision);
    assert.equal(same.payload.fingerprint, first.payload.fingerprint);
    assert.equal(same.payload.createdAt, first.payload.createdAt);

    await assert.rejects(
      store.create(job, material({ text: "A different immutable segment." }), {
        actorId: "operator_material_001",
        now: t1,
      }),
      (error: unknown) =>
        error instanceof GenerationMaterialConflictError
        && error.message === "GENERATION_MATERIAL_IDEMPOTENCY_CONFLICT",
    );
  });
});

test("claim scope and cache identity must match the private material record", async () => {
  await withStore(async (store) => {
    await store.create(job, material(), {
      actorId: "operator_material_001",
      now: t0,
    });
    const queueRoot = await mkdtemp(join(tmpdir(), "storyteller-generation-material-scope-"));
    try {
      const queue = new FileGenerationQueue(new FileProjectStore(queueRoot));
      await queue.enqueue(job, { now: t0 });
      const claim = await queue.claimNext({ workerId: "worker_material_001", now: t0 });
      if (!claim) throw new Error("material scope claim required");
      const changedClaim = {
        ...claim,
        item: {
          ...claim.item,
          job: {
            ...claim.item.job,
            cacheKey: "d".repeat(64),
          },
        },
      };
      await assert.rejects(
        store.resolve(changedClaim),
        /GENERATION_MATERIAL_CLAIM_SCOPE_MISMATCH/u,
      );
      await assert.rejects(
        store.resolve({
          ...claim,
          item: { ...claim.item, status: "queued", lease: undefined },
        }),
        /GENERATION_MATERIAL_ACTIVE_CLAIM_REQUIRED/u,
      );
    } finally {
      await rm(queueRoot, { recursive: true, force: true });
    }
  });
});

test("rights, direction and storable media gates fail before persistence", async () => {
  await withStore(async (store) => {
    for (const [value, code] of [
      [material({
        rights: {
          ...material().rights,
          expiresAt: "2026-07-26T23:59:59.000Z",
        },
      }), "GENERATION_MATERIAL_RIGHTS_EXPIRED"],
      [material({
        intendedUse: "trailer",
      }), "GENERATION_MATERIAL_USE_NOT_AUTHORISED"],
      [material({
        commercial: true,
        rights: {
          ...material().rights,
          commercialUseApproved: false,
        },
      }), "GENERATION_MATERIAL_COMMERCIAL_USE_NOT_APPROVED"],
      [material({ format: "pcm" }), "GENERATION_MATERIAL_FORMAT_NOT_STORABLE"],
      [material({
        direction: {
          ...material().direction,
          segmentId: "segment_other_001",
        },
      }), "GENERATION_MATERIAL_DIRECTION_SCOPE_MISMATCH"],
    ] as const) {
      await assert.rejects(
        store.create(job, value, {
          actorId: "operator_material_001",
          now: t0,
        }),
        (error: unknown) =>
          error instanceof GenerationMaterialIntegrityError
          && error.message === code,
      );
    }
    assert.equal(await store.read(job.id), null);
  });
});

test("public material views and audit events omit text, pronunciations and voice identifiers", async () => {
  await withStore(async (store, root) => {
    const created = await store.create(job, material(), {
      actorId: "operator_material_001",
      now: t0,
    });
    const view = generationMaterialPublicView(created.payload);
    assert.equal(view.jobId, job.id);
    assert.equal(view.characterCount, material().text.length);
    assert.equal(view.pronunciationCount, 1);
    const publicSource = JSON.stringify(view);
    assert.equal(publicSource.includes(material().text), false);
    assert.equal(publicSource.includes("Aelwyn"), false);
    assert.equal(publicSource.includes("AYL-win"), false);
    assert.equal(publicSource.includes("voice_narrator_001"), false);
    assert.equal(publicSource.includes("artifact_voice_anchor_001"), false);

    const auditSource = await readFile(
      join(root, "audit", "2026-07-27.jsonl"),
      "utf8",
    );
    assert.equal(auditSource.includes(material().text), false);
    assert.equal(auditSource.includes("Aelwyn"), false);
    assert.equal(auditSource.includes("voice_narrator_001"), false);
    assert.equal(auditSource.includes("artifact_voice_anchor_001"), false);
    assert.equal(auditSource.includes(created.payload.textHash), true);
  });
});

test("material fingerprint and text hash tampering are detected", () => {
  const record = createGenerationMaterialRecord(job, material(), t0);
  assert.throws(
    () => assertGenerationMaterialRecord({
      ...record,
      textHash: "e".repeat(64),
    }),
    /GENERATION_MATERIAL_TEXT_HASH_INVALID/u,
  );
  assert.throws(
    () => assertGenerationMaterialRecord({
      ...record,
      fingerprint: "f".repeat(64),
    }),
    /GENERATION_MATERIAL_FINGERPRINT_INVALID/u,
  );
  assert.throws(
    () => assertGenerationMaterialRecord({
      ...record,
      id: "material_wrong_001",
    } as GenerationMaterialRecord),
    /GENERATION_MATERIAL_ENTITY_MISMATCH/u,
  );
});
