import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createArtifactRecord,
  recordArtifactReview,
  verifyArtifactIntegrity,
  type ArtifactKind,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import {
  AUDIOBOOK_SEQUENCE_SCHEMA_VERSION,
  AudiobookSequenceStoreConflictError,
  FileAudiobookSequenceStore,
  assertAudiobookSequence,
  audiobookSequencePublicView,
  createAudiobookSequence,
  reviseAudiobookSequence,
} from "./audiobook-sequence.js";
import {
  BOOK_CHAPTER_SEQUENCE_SCHEMA_VERSION,
  type BookChapterSequence,
  type BookChapterSequenceEntry,
} from "./book-chapter-sequence.js";
import {
  BOOK_CREDIT_DELIVERY_SCHEMA_VERSION,
  type BookCreditDeliverySnapshot,
} from "./book-credit-delivery.js";
import { stableHash } from "./index.js";
import { FileProjectStore } from "./project-store.js";

const t0 = new Date("2026-07-28T00:00:00.000Z");
const t1 = new Date("2026-07-28T00:00:01.000Z");
const t2 = new Date("2026-07-28T00:00:02.000Z");
const t3 = new Date("2026-07-28T00:00:03.000Z");
const t4 = new Date("2026-07-28T00:00:04.000Z");
const t5 = new Date("2026-07-28T00:00:05.000Z");
const projectId = "project_audiobook_sequence_001";
const bookId = "book_audiobook_sequence_001";
const rightsFingerprint = "a".repeat(64);
const engineeringProfileFingerprint = "b".repeat(64);
const output = Object.freeze({
  format: "wav" as const,
  sampleRateHz: 44_100,
  channels: 1 as const,
  bitDepth: 24 as const,
});

function rights(
  overrides: Partial<ArtifactRightsSnapshot> = {},
): ArtifactRightsSnapshot {
  return Object.freeze({
    rightsEvidenceId: "rights_audiobook_sequence_001",
    rightsFingerprint,
    allowedUses: Object.freeze(["audiobook"] as const),
    commercialUseApproved: true,
    expiresAt: "2028-07-28T00:00:00.000Z",
    retainUntil: "2033-07-28T00:00:00.000Z",
    deletionRequiredAt: "2034-07-28T00:00:00.000Z",
    ...overrides,
  });
}

function approvedArtifact(input: Readonly<{
  id: string;
  kind: Extract<ArtifactKind, "credit-master" | "mastered-chapter">;
  segmentId: string;
  contentHash: string;
  byteCount: number;
  rights?: ArtifactRightsSnapshot;
}>): ArtifactRecord {
  let artifact = createArtifactRecord({
    id: input.id,
    kind: input.kind,
    projectId,
    segmentId: input.segmentId,
    storage: {
      driver: "private-object-store",
      provider: "evavo-local-private",
      container: "storyteller-production",
      objectKey: `sha256/${input.contentHash.slice(0, 2)}/${input.contentHash}.wav`,
    },
    integrity: {
      algorithm: "sha256",
      contentHash: input.contentHash,
      byteCount: input.byteCount,
      mimeType: "audio/wav",
      format: "wav",
    },
    provenance: {
      createdByActorId: "audiobook_sequence_worker_001",
      sourceContentHash: "f".repeat(64),
      generationRequestHash: "e".repeat(64),
      parentArtifactIds: [`parent_${input.id}`],
    },
    rights: input.rights ?? rights(),
    reviewRequired: true,
  }, t0);
  artifact = verifyArtifactIntegrity(artifact, {
    observedContentHash: input.contentHash,
    observedByteCount: input.byteCount,
    checkedByActorId: "audiobook_sequence_verifier_001",
    checks: ["sha256", "byte-count", "media-signature"],
    checkedAt: t1,
  });
  return recordArtifactReview(artifact, {
    decision: "approved",
    reviewerId: "audiobook_sequence_reviewer_001",
    decidedAt: t2,
  });
}

function delivery(input: Readonly<{
  kind: "opening" | "closing";
  artifact: ArtifactRecord;
  durationMs: number;
  outputOverride?: Partial<{ format: "wav"; sampleRateHz: number; channels: 1 | 2; bitDepth: 16 | 24 | 32 }>;
}>): BookCreditDeliverySnapshot {
  const partial: Omit<BookCreditDeliverySnapshot, "fingerprint"> = {
    schemaVersion: BOOK_CREDIT_DELIVERY_SCHEMA_VERSION,
    projectId,
    bookId,
    creditKind: input.kind,
    chainFingerprint: `${input.kind === "opening" ? "1" : "2"}`.repeat(64),
    reviewSessionFingerprint: `${input.kind === "opening" ? "3" : "4"}`.repeat(64),
    reviewApprovalFingerprint: `${input.kind === "opening" ? "5" : "6"}`.repeat(64),
    selectedTakeRecordId: `take_${input.kind}_sequence_001`,
    creditMaster: Object.freeze({
      id: input.artifact.id,
      revision: input.artifact.revision,
      fingerprint: input.artifact.fingerprint,
      contentHash: input.artifact.integrity.contentHash,
      byteCount: input.artifact.integrity.byteCount,
    }),
    durationMs: input.durationMs,
    engineeringProfileId: "acx-audiobook",
    engineeringProfileVersion: "acx-2026-07",
    engineeringProfileFingerprint,
    output: Object.freeze({ ...output, ...input.outputOverride }),
    rightsFingerprint,
    status: "ready-for-book-assembly",
    createdAt: t3.toISOString(),
  };
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function chapterSequence(artifact: ArtifactRecord): BookChapterSequence {
  const entryPartial: Omit<BookChapterSequenceEntry, "fingerprint"> = {
    ordinal: 1,
    role: "chapter",
    chapterId: "chapter_audiobook_sequence_001",
    title: "Chapter One",
    durationMs: 60_000,
    masteredArtifact: Object.freeze({
      id: artifact.id,
      revision: artifact.revision,
      fingerprint: artifact.fingerprint,
      contentHash: artifact.integrity.contentHash,
      byteCount: artifact.integrity.byteCount,
    }),
    masteredChainFingerprint: "7".repeat(64),
    reviewSessionFingerprint: "8".repeat(64),
    masteringPlanFingerprint: "9".repeat(64),
  };
  const entry = Object.freeze({
    ...entryPartial,
    fingerprint: stableHash(entryPartial),
  });
  const partial: Omit<BookChapterSequence, "fingerprint"> = {
    schemaVersion: BOOK_CHAPTER_SEQUENCE_SCHEMA_VERSION,
    id: "book_chapter_sequence_001",
    projectId,
    bookId,
    title: "The North Water",
    languageTag: "en-AU",
    rightsFingerprint,
    engineeringProfileFingerprint,
    output,
    chapters: Object.freeze([entry]),
    totalDurationMs: entry.durationMs,
    status: "ready-for-credits",
    createdByActorId: "chapter_sequence_owner_001",
    revision: 1,
    createdAt: t3.toISOString(),
    updatedAt: t3.toISOString(),
  };
  return Object.freeze({ ...partial, fingerprint: stableHash(partial) });
}

function fixture(overrides: Readonly<{
  closingDelivery?: BookCreditDeliverySnapshot;
  openingArtifact?: ArtifactRecord;
  closingArtifact?: ArtifactRecord;
  chapterArtifact?: ArtifactRecord;
}> = {}) {
  const openingArtifact = overrides.openingArtifact ?? approvedArtifact({
    id: "artifact_opening_credit_master_001",
    kind: "credit-master",
    segmentId: "credit_opening_sequence_001",
    contentHash: "1".repeat(64),
    byteCount: 240_000,
  });
  const closingArtifact = overrides.closingArtifact ?? approvedArtifact({
    id: "artifact_closing_credit_master_001",
    kind: "credit-master",
    segmentId: "credit_closing_sequence_001",
    contentHash: "2".repeat(64),
    byteCount: 288_000,
  });
  const chapterArtifact = overrides.chapterArtifact ?? approvedArtifact({
    id: "artifact_mastered_chapter_sequence_001",
    kind: "mastered-chapter",
    segmentId: "chapter_audiobook_sequence_001",
    contentHash: "3".repeat(64),
    byteCount: 2_880_000,
  });
  const openingDelivery = delivery({
    kind: "opening",
    artifact: openingArtifact,
    durationMs: 5_000,
  });
  const closingDelivery = overrides.closingDelivery ?? delivery({
    kind: "closing",
    artifact: closingArtifact,
    durationMs: 6_000,
  });
  return {
    openingArtifact,
    closingArtifact,
    chapterArtifact,
    openingDelivery,
    closingDelivery,
    chapters: chapterSequence(chapterArtifact),
  };
}

function input(
  values = fixture(),
  createdAt = t4,
) {
  return {
    id: "audiobook_sequence_001",
    projectId,
    bookId,
    opening: {
      delivery: values.openingDelivery,
      artifact: values.openingArtifact,
    },
    chapters: values.chapters,
    chapterArtifacts: [values.chapterArtifact],
    closing: {
      delivery: values.closingDelivery,
      artifact: values.closingArtifact,
    },
    createdByActorId: "audiobook_sequence_owner_001",
    createdAt,
  } as const;
}

test("approved opening, chapter sequence and closing produce one exact contiguous audiobook timeline", () => {
  const sequence = createAudiobookSequence(input());
  assert.equal(sequence.schemaVersion, AUDIOBOOK_SEQUENCE_SCHEMA_VERSION);
  assert.equal(sequence.status, "ready-for-retail-encoding");
  assert.equal(sequence.chapterCount, 1);
  assert.equal(sequence.components.length, 3);
  assert.deepEqual(
    sequence.components.map(({ role, startMs, endMs }) => ({ role, startMs, endMs })),
    [
      { role: "opening-credit", startMs: 0, endMs: 5_000 },
      { role: "chapter", startMs: 5_000, endMs: 65_000 },
      { role: "closing-credit", startMs: 65_000, endMs: 71_000 },
    ],
  );
  assert.equal(sequence.totalDurationMs, 71_000);
  assert.doesNotThrow(() => assertAudiobookSequence(sequence));

  const view = audiobookSequencePublicView(sequence);
  const serialised = JSON.stringify(view);
  assert.equal(view.componentCount, 3);
  for (const forbidden of [
    sequence.rightsFingerprint,
    sequence.engineeringProfileFingerprint,
    ...sequence.components.flatMap((entry) => [
      entry.artifact.id,
      entry.artifact.contentHash,
      entry.artifact.fingerprint,
      entry.sourceFingerprint,
    ]),
  ]) assert.equal(serialised.includes(forbidden), false);
});

test("credit roles, output profiles, rights and exact artifact snapshots fail closed", () => {
  const values = fixture();
  const wrongRolePartial = {
    ...values.closingDelivery,
    creditKind: "opening" as const,
  };
  const { fingerprint: _roleFingerprint, ...roleBase } = wrongRolePartial;
  const wrongRole = {
    ...roleBase,
    fingerprint: stableHash(roleBase),
  } as BookCreditDeliverySnapshot;
  assert.throws(
    () => createAudiobookSequence(input({ ...values, closingDelivery: wrongRole })),
    /AUDIOBOOK_SEQUENCE_CREDIT_SCOPE_MISMATCH/u,
  );

  const mismatchedOutput = delivery({
    kind: "closing",
    artifact: values.closingArtifact,
    durationMs: 6_000,
    outputOverride: { sampleRateHz: 48_000 },
  });
  assert.throws(
    () => createAudiobookSequence(input({ ...values, closingDelivery: mismatchedOutput })),
    /AUDIOBOOK_SEQUENCE_OUTPUT_PROFILE_MISMATCH/u,
  );

  const expiredOpening = approvedArtifact({
    id: "artifact_expired_opening_credit_001",
    kind: "credit-master",
    segmentId: "credit_expired_opening_001",
    contentHash: "4".repeat(64),
    byteCount: 240_000,
    rights: rights({ expiresAt: "2026-07-28T00:00:03.500Z" }),
  });
  const expiredValues = fixture({ openingArtifact: expiredOpening });
  assert.throws(
    () => createAudiobookSequence(input(expiredValues)),
    /AUDIOBOOK_SEQUENCE_RIGHTS_EXPIRED/u,
  );

  const driftBase = {
    ...values.openingDelivery,
    creditMaster: {
      ...values.openingDelivery.creditMaster,
      byteCount: values.openingDelivery.creditMaster.byteCount + 1,
    },
  };
  const { fingerprint: _driftFingerprint, ...driftPartial } = driftBase;
  const driftedDelivery = {
    ...driftPartial,
    fingerprint: stableHash(driftPartial),
  } as BookCreditDeliverySnapshot;
  assert.throws(
    () => createAudiobookSequence(input({ ...values, openingDelivery: driftedDelivery })),
    /AUDIOBOOK_SEQUENCE_CREDIT_ARTIFACT_MISMATCH/u,
  );
});

test("sequence validation rejects a recomputed non-contiguous timeline", () => {
  const sequence = createAudiobookSequence(input());
  const chapter = sequence.components[1]!;
  const { fingerprint: _componentFingerprint, ...componentBase } = chapter;
  const alteredComponentBase = {
    ...componentBase,
    startMs: chapter.startMs + 1,
    endMs: chapter.endMs + 1,
  };
  const alteredComponent = {
    ...alteredComponentBase,
    fingerprint: stableHash(alteredComponentBase),
  };
  const { fingerprint: _sequenceFingerprint, ...sequenceBase } = sequence;
  const alteredBase = {
    ...sequenceBase,
    components: Object.freeze([
      sequence.components[0]!,
      alteredComponent,
      sequence.components[2]!,
    ]),
  };
  const altered = {
    ...alteredBase,
    fingerprint: stableHash(alteredBase),
  } as typeof sequence;
  assert.throws(
    () => assertAudiobookSequence(altered),
    /AUDIOBOOK_SEQUENCE_TIMELINE_INVALID/u,
  );
});

test("audiobook sequence store is idempotent and revision-safe", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-audiobook-sequence-"));
  try {
    const store = new FileAudiobookSequenceStore(
      new FileProjectStore(join(root, "metadata")),
    );
    const sequence = createAudiobookSequence(input());
    const created = await store.create(sequence);
    const repeated = await store.create(sequence);
    assert.equal(repeated.envelopeHash, created.envelopeHash);
    assert.equal((await store.require(sequence.id)).payload.fingerprint, sequence.fingerprint);

    const revised = reviseAudiobookSequence(sequence, input(fixture(), t5));
    const saved = await store.save(revised, 1);
    assert.equal(saved.revision, 2);
    assert.equal(saved.payload.previousFingerprint, sequence.fingerprint);
    await assert.rejects(
      store.save(revised, 1),
      (error: unknown) => error instanceof AudiobookSequenceStoreConflictError,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
